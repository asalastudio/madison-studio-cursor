/**
 * Stripe webhook event handling, dependency-injected so it runs under node:test.
 *
 * Invariants (live schema: subscriptions has UNIQUE(organization_id)):
 *  - One subscriptions row per org. Writes upsert on organization_id, so a
 *    cancel-then-resubscribe replaces the row instead of hitting the unique key.
 *  - Subscription state is always re-read from Stripe (subscriptions.retrieve)
 *    rather than trusted from the event payload, so late or retried
 *    `updated` / `invoice.payment_failed` events cannot regress state.
 *  - A non-entitled (canceled, past_due...) *other* subscription never
 *    overwrites an org's currently entitled subscription.
 *  - Every DB error throws, so the webhook answers 500 and Stripe retries.
 *  - Each event id is recorded in stripe_webhook_events after success; a
 *    duplicate delivery is acknowledged without reprocessing.
 */
import { isEntitledStatus, must, resolvePlanId } from "./stripeBilling.ts";

type Db = { from: (table: string) => any };

export interface StripeSubscriptionLike {
  id: string;
  customer: string | { id: string };
  status: string;
  metadata?: Record<string, string> | null;
  items?: { data?: Array<{ price?: { id?: string } }> };
  current_period_start: number;
  current_period_end: number;
  cancel_at_period_end?: boolean;
  canceled_at?: number | null;
  trial_start?: number | null;
  trial_end?: number | null;
}

export interface StripeLike {
  subscriptions: { retrieve(id: string): Promise<StripeSubscriptionLike> };
  customers: { retrieve(id: string): Promise<{ deleted?: boolean; metadata?: Record<string, string>; invoice_settings?: { default_payment_method?: string | null } }> };
}

export interface StripeEventLike {
  id: string;
  type: string;
  created: number;
  data: { object: any };
}

export interface Deps { db: Db; stripe: StripeLike; log?: (msg: string, extra?: unknown) => void }

const iso = (sec: number | null | undefined) => (sec ? new Date(sec * 1000).toISOString() : null);
const customerId = (c: StripeSubscriptionLike["customer"]) => (typeof c === "string" ? c : c?.id);

export interface ExistingSubscriptionRow {
  stripe_subscription_id: string | null;
  status: string | null;
}

/** Should `incoming` replace the org's current row? */
export function shouldWriteSubscription(existing: ExistingSubscriptionRow | null, incoming: { id: string; status: string }): boolean {
  if (!existing) return true;
  if (existing.stripe_subscription_id === incoming.id) return true;
  // A different subscription: only replace an entitled row with another entitled one.
  if (isEntitledStatus(existing.status)) return isEntitledStatus(incoming.status);
  return true;
}

async function resolveOrgId(deps: Deps, sub: StripeSubscriptionLike): Promise<string | null> {
  if (sub.metadata?.organization_id) return sub.metadata.organization_id;
  const byRow = must(
    await deps.db.from("subscriptions").select("organization_id").eq("stripe_subscription_id", sub.id).maybeSingle(),
    "lookup subscription org",
  );
  if (byRow.data?.organization_id) return byRow.data.organization_id;
  const cust = customerId(sub.customer);
  if (cust) {
    const c = await deps.stripe.customers.retrieve(cust);
    if (!c.deleted && c.metadata?.organization_id) return c.metadata.organization_id;
  }
  return null;
}

/** Write the *current* Stripe state of a subscription to the org's single row. */
export async function syncSubscription(deps: Deps, subscriptionId: string): Promise<"written" | "skipped"> {
  const sub = await deps.stripe.subscriptions.retrieve(subscriptionId);
  const organizationId = await resolveOrgId(deps, sub);
  if (!organizationId) throw new Error(`No organization for subscription ${sub.id}`);

  const priceId = sub.items?.data?.[0]?.price?.id ?? null;
  const planId = (await resolvePlanId(deps.db, null, priceId)) ?? (await resolvePlanId(deps.db, sub.metadata?.plan_id, null));
  if (!planId) throw new Error(`No subscription_plans row for subscription ${sub.id}`);

  const existing = must(
    await deps.db.from("subscriptions").select("id, stripe_subscription_id, status").eq("organization_id", organizationId).maybeSingle(),
    "load org subscription",
  ).data as (ExistingSubscriptionRow & { id: string }) | null;

  if (!shouldWriteSubscription(existing, sub)) {
    deps.log?.("[stripe] kept entitled subscription; ignored other non-entitled one", { organizationId, incoming: sub.id });
    return "skipped";
  }

  const row = {
    organization_id: organizationId,
    stripe_subscription_id: sub.id,
    stripe_customer_id: customerId(sub.customer),
    plan_id: planId,
    status: sub.status,
    current_period_start: iso(sub.current_period_start),
    current_period_end: iso(sub.current_period_end),
    cancel_at_period_end: Boolean(sub.cancel_at_period_end),
    canceled_at: iso(sub.canceled_at),
    trial_start: iso(sub.trial_start),
    trial_end: iso(sub.trial_end),
  };
  const saved = must(
    await deps.db.from("subscriptions").upsert(row, { onConflict: "organization_id" }).select("id").single(),
    "upsert subscription",
  ).data as { id: string } | null;

  const link = isEntitledStatus(sub.status) ? saved?.id ?? null : null;
  must(await deps.db.from("organizations").update({ subscription_id: link }).eq("id", organizationId), "link organization subscription");
  return "written";
}

async function upsertInvoice(deps: Deps, invoice: any, paid: boolean) {
  const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
  if (!subscriptionId) return;
  // Reflect the subscription's current status (paid -> active, failed -> past_due,
  // or whatever Stripe says *now*), which also makes late events harmless.
  await syncSubscription(deps, subscriptionId);
  const sub = must(
    await deps.db.from("subscriptions").select("id, organization_id").eq("stripe_subscription_id", subscriptionId).maybeSingle(),
    "load subscription for invoice",
  ).data;
  if (!sub) return; // a non-entitled stale subscription that was not written
  const row: Record<string, unknown> = {
    stripe_invoice_id: invoice.id,
    organization_id: sub.organization_id,
    subscription_id: sub.id,
    amount: paid ? invoice.amount_paid : invoice.amount_due,
    currency: invoice.currency,
    status: invoice.status || (paid ? "paid" : "open"),
    period_start: iso(invoice.period_start),
    period_end: iso(invoice.period_end),
  };
  if (paid) {
    row.stripe_charge_id = typeof invoice.charge === "string" ? invoice.charge : null;
    row.invoice_pdf_url = invoice.invoice_pdf || null;
    row.hosted_invoice_url = invoice.hosted_invoice_url || null;
    row.paid_at = iso(invoice.status_transitions?.paid_at);
  }
  must(await deps.db.from("invoices").upsert(row, { onConflict: "stripe_invoice_id" }), "upsert invoice");
}

async function savePaymentMethod(deps: Deps, pm: any) {
  const cust = typeof pm.customer === "string" ? pm.customer : pm.customer?.id;
  if (!cust || pm.type !== "card" || !pm.card) return;
  const sub = must(
    await deps.db.from("subscriptions").select("organization_id").eq("stripe_customer_id", cust).maybeSingle(),
    "load subscription for payment method",
  ).data;
  if (!sub) return;
  const c = await deps.stripe.customers.retrieve(cust);
  must(
    await deps.db.from("payment_methods").upsert({
      stripe_payment_method_id: pm.id,
      stripe_customer_id: cust,
      organization_id: sub.organization_id,
      type: "card",
      card_brand: pm.card.brand,
      card_last4: pm.card.last4,
      card_exp_month: pm.card.exp_month,
      card_exp_year: pm.card.exp_year,
      is_default: pm.id === (c.invoice_settings?.default_payment_method ?? null),
    }, { onConflict: "stripe_payment_method_id" }),
    "upsert payment method",
  );
}

/** Returns "duplicate" when the event was already processed. Throws on any failure. */
export async function handleStripeEvent(deps: Deps, event: StripeEventLike): Promise<"processed" | "ignored" | "duplicate"> {
  const seen = must(
    await deps.db.from("stripe_webhook_events").select("id").eq("id", event.id).maybeSingle(),
    "check processed events",
  ).data;
  if (seen) return "duplicate";

  const obj = event.data.object;
  let outcome: "processed" | "ignored" = "processed";
  switch (event.type) {
    case "checkout.session.completed":
      if (obj.mode === "subscription" && obj.subscription) {
        await syncSubscription(deps, typeof obj.subscription === "string" ? obj.subscription : obj.subscription.id);
      } else outcome = "ignored";
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await syncSubscription(deps, obj.id);
      break;
    case "invoice.paid":
      await upsertInvoice(deps, obj, true);
      break;
    case "invoice.payment_failed":
      await upsertInvoice(deps, obj, false);
      break;
    case "payment_method.attached":
      await savePaymentMethod(deps, obj);
      break;
    default:
      outcome = "ignored";
  }

  must(
    await deps.db.from("stripe_webhook_events").upsert(
      { id: event.id, type: event.type, event_created_at: iso(event.created), outcome },
      { onConflict: "id", ignoreDuplicates: true },
    ),
    "record processed event",
  );
  return outcome;
}
