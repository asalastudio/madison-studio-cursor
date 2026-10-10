import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { handleStripeEvent, shouldWriteSubscription, type StripeSubscriptionLike } from "./stripeWebhookHandlers.ts";

const ORG = "00000000-0000-0000-0000-00000000000a";
const PLAN = "11111111-1111-1111-1111-111111111111";

/** Minimal in-memory PostgREST-ish fake with per-table UNIQUE keys and error injection. */
function fakeDb(unique: Record<string, string>) {
  const tables: Record<string, any[]> = {};
  const failOn = new Set<string>();
  let n = 0;
  const t = (name: string) => (tables[name] ??= []);
  function from(name: string) {
    const filters: Array<[string, unknown]> = [];
    let op: { kind: "select" | "upsert" | "update"; payload?: any; onConflict?: string; ignoreDuplicates?: boolean } = { kind: "select" };
    const rows = () => t(name).filter((r) => filters.every(([k, v]) => r[k] === v));
    const run = () => {
      if (failOn.has(`${name}:${op.kind}`)) return { data: null, error: { message: `injected ${name} ${op.kind} failure` } };
      if (op.kind === "upsert") {
        const key = op.onConflict!;
        const declared = unique[name];
        if (declared && key !== declared && !key.split(",").includes(declared)) {
          // Postgres would raise 42P10 if no unique index matches; mimic the real violation instead.
          const clash = t(name).find((r) => r[declared] === op.payload[declared] && r[key] !== op.payload[key]);
          if (clash) return { data: null, error: { message: `duplicate key value violates unique constraint on ${declared}` } };
        }
        const hit = t(name).find((r) => r[key] === op.payload[key]);
        if (hit) { if (!op.ignoreDuplicates) Object.assign(hit, op.payload); return { data: [hit], error: null }; }
        const row = { id: op.payload.id ?? `row${++n}`, ...op.payload };
        t(name).push(row);
        return { data: [row], error: null };
      }
      if (op.kind === "update") { rows().forEach((r) => Object.assign(r, op.payload)); return { data: null, error: null }; }
      return { data: rows(), error: null };
    };
    const q: any = {
      select: () => q,
      eq: (k: string, v: unknown) => { filters.push([k, v]); return q; },
      upsert: (payload: any, o: any) => { op = { kind: "upsert", payload, onConflict: o.onConflict, ignoreDuplicates: o.ignoreDuplicates }; return q; },
      update: (payload: any) => { op = { kind: "update", payload }; return q; },
      maybeSingle: async () => { const r = run(); return { data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error }; },
      single: async () => { const r = run(); return { data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error }; },
      then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
    };
    return q;
  }
  return { from, tables: t, failOn };
}

function sub(id: string, status: string, extra: Partial<StripeSubscriptionLike> = {}): StripeSubscriptionLike {
  return {
    id, status, customer: "cus_1", metadata: { organization_id: ORG, plan_id: PLAN },
    items: { data: [{ price: { id: "price_studio" } }] },
    current_period_start: 1_790_000_000, current_period_end: 1_792_600_000, ...extra,
  };
}

let db: ReturnType<typeof fakeDb>;
let stripeSubs: Record<string, StripeSubscriptionLike>;
const deps = () => ({
  db,
  stripe: {
    subscriptions: { retrieve: async (id: string) => structuredClone(stripeSubs[id]) },
    customers: { retrieve: async () => ({ metadata: { organization_id: ORG }, invoice_settings: { default_payment_method: null } }) },
  },
});
let evt = 0;
const event = (type: string, object: any) => ({ id: `evt_${++evt}`, type, created: 1_790_000_000 + evt, data: { object } });

beforeEach(() => {
  db = fakeDb({ subscriptions: "organization_id" });
  db.tables("subscription_plans").push({ id: PLAN, slug: "studio", stripe_price_id_monthly: "price_studio" });
  db.tables("organizations").push({ id: ORG, subscription_id: null });
  stripeSubs = {};
});

describe("resubscribe", () => {
  it("cancel then a new subscription replaces the org's single row", async () => {
    stripeSubs.sub_old = sub("sub_old", "active");
    await handleStripeEvent(deps(), event("customer.subscription.created", { id: "sub_old" }));
    stripeSubs.sub_old.status = "canceled";
    await handleStripeEvent(deps(), event("customer.subscription.deleted", { id: "sub_old" }));
    assert.equal(db.tables("organizations")[0].subscription_id, null);

    stripeSubs.sub_new = sub("sub_new", "active");
    await handleStripeEvent(deps(), event("checkout.session.completed", { mode: "subscription", subscription: "sub_new" }));
    const rows = db.tables("subscriptions");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].stripe_subscription_id, "sub_new");
    assert.equal(rows[0].status, "active");
    assert.equal(db.tables("organizations")[0].subscription_id, rows[0].id);
  });
});

describe("out-of-order and duplicate events", () => {
  it("a late `updated` after `deleted` does not resurrect the subscription", async () => {
    stripeSubs.sub_1 = sub("sub_1", "canceled");
    await handleStripeEvent(deps(), event("customer.subscription.deleted", { id: "sub_1" }));
    // stale payload says active, but Stripe's current state is canceled
    await handleStripeEvent(deps(), event("customer.subscription.updated", { id: "sub_1", status: "active" }));
    assert.equal(db.tables("subscriptions")[0].status, "canceled");
  });

  it("a late payment_failed after invoice.paid does not set past_due", async () => {
    stripeSubs.sub_1 = sub("sub_1", "active");
    await handleStripeEvent(deps(), event("invoice.paid", { id: "in_2", subscription: "sub_1", amount_paid: 14900, currency: "usd", status: "paid" }));
    await handleStripeEvent(deps(), event("invoice.payment_failed", { id: "in_1", subscription: "sub_1", amount_due: 14900, currency: "usd", status: "open" }));
    assert.equal(db.tables("subscriptions")[0].status, "active");
  });

  it("an old canceled subscription's late event cannot overwrite the new active one", async () => {
    stripeSubs.sub_new = sub("sub_new", "active");
    stripeSubs.sub_old = sub("sub_old", "canceled");
    await handleStripeEvent(deps(), event("customer.subscription.created", { id: "sub_new" }));
    const r = await handleStripeEvent(deps(), event("customer.subscription.updated", { id: "sub_old" }));
    assert.equal(r, "processed");
    assert.equal(db.tables("subscriptions")[0].stripe_subscription_id, "sub_new");
    assert.equal(db.tables("subscriptions")[0].status, "active");
  });

  it("a duplicate delivery of the same event id is not reprocessed", async () => {
    stripeSubs.sub_1 = sub("sub_1", "active");
    const e = event("customer.subscription.created", { id: "sub_1" });
    assert.equal(await handleStripeEvent(deps(), e), "processed");
    stripeSubs.sub_1.status = "past_due";
    assert.equal(await handleStripeEvent(deps(), e), "duplicate");
    assert.equal(db.tables("subscriptions")[0].status, "active");
  });
});

describe("DB errors surface (webhook answers 500, Stripe retries)", () => {
  for (const [label, type, obj, fail] of [
    ["subscription upsert", "customer.subscription.updated", { id: "sub_1" }, "subscriptions:upsert"],
    ["org link", "customer.subscription.created", { id: "sub_1" }, "organizations:update"],
    ["deleted", "customer.subscription.deleted", { id: "sub_1" }, "subscriptions:upsert"],
    ["invoice.paid", "invoice.paid", { id: "in_1", subscription: "sub_1", currency: "usd" }, "invoices:upsert"],
    ["payment_failed", "invoice.payment_failed", { id: "in_1", subscription: "sub_1", currency: "usd" }, "invoices:upsert"],
    ["dedupe read", "customer.subscription.updated", { id: "sub_1" }, "stripe_webhook_events:select"],
  ] as const) {
    it(`throws on ${label} failure and does not mark the event processed`, async () => {
      stripeSubs.sub_1 = sub("sub_1", "active");
      db.failOn.add(fail);
      await assert.rejects(handleStripeEvent(deps(), event(type, obj)), /injected/);
      assert.equal(db.tables("stripe_webhook_events").length, 0);
    });
  }

  it("payment_method.attached failure throws", async () => {
    stripeSubs.sub_1 = sub("sub_1", "active");
    await handleStripeEvent(deps(), event("customer.subscription.created", { id: "sub_1" }));
    db.failOn.add("payment_methods:upsert");
    await assert.rejects(
      handleStripeEvent(deps(), event("payment_method.attached", { id: "pm_1", customer: "cus_1", type: "card", card: { brand: "visa", last4: "4242", exp_month: 1, exp_year: 2030 } })),
      /injected/,
    );
  });

  it("the old onConflict=stripe_subscription_id upsert would have failed on resubscribe", () => {
    // documents the HIGH bug: the fake raises the same unique violation Postgres does
    const d = fakeDb({ subscriptions: "organization_id" });
    d.tables("subscriptions").push({ id: "r1", organization_id: ORG, stripe_subscription_id: "sub_old" });
    return d.from("subscriptions").upsert({ organization_id: ORG, stripe_subscription_id: "sub_new" }, { onConflict: "stripe_subscription_id" })
      .then((r: any) => assert.match(r.error.message, /unique constraint on organization_id/));
  });
});

describe("shouldWriteSubscription", () => {
  it("rules", () => {
    assert.equal(shouldWriteSubscription(null, { id: "a", status: "canceled" }), true);
    assert.equal(shouldWriteSubscription({ stripe_subscription_id: "a", status: "active" }, { id: "a", status: "canceled" }), true);
    assert.equal(shouldWriteSubscription({ stripe_subscription_id: "a", status: "active" }, { id: "b", status: "canceled" }), false);
    assert.equal(shouldWriteSubscription({ stripe_subscription_id: "a", status: "canceled" }, { id: "b", status: "incomplete" }), true);
  });
});
