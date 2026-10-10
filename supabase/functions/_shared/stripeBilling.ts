/**
 * Pure helpers for the Stripe webhook so the DB-facing logic is unit-testable
 * without Deno or the Stripe SDK.
 */
type PlanClient = { from: (table: string) => any };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve subscription_plans.id from subscription metadata or the Stripe price.
 * Metadata used to carry the plan slug ("studio") when checkout was started
 * from the fallback tier ids, and `.eq('id', 'studio')` on a uuid column
 * errored, so the subscription was never written.
 */
export async function resolvePlanId(
  client: PlanClient,
  metadataPlanId: string | null | undefined,
  priceId: string | null | undefined,
): Promise<string | null> {
  const raw = typeof metadataPlanId === "string" ? metadataPlanId.trim() : "";
  if (raw) {
    const column = UUID_RE.test(raw) ? "id" : "slug";
    const { data, error } = await client.from("subscription_plans").select("id").eq(column, raw).maybeSingle();
    if (error) throw error;
    if (data?.id) return data.id as string;
  }
  if (priceId) {
    for (const column of ["stripe_price_id_monthly", "stripe_price_id_yearly"]) {
      const { data, error } = await client.from("subscription_plans").select("id").eq(column, priceId).maybeSingle();
      if (error) throw error;
      if (data?.id) return data.id as string;
    }
  }
  return null;
}

/** Stripe statuses that grant paid-tier access. */
export function isEntitledStatus(status: string | null | undefined): boolean {
  return status === "active" || status === "trialing";
}

/** Throw on a Supabase error so the webhook answers 500 and Stripe retries. */
export function must<T extends { error: unknown }>(result: T, what: string): T {
  if (result.error) {
    const msg = (result.error as { message?: string })?.message ?? String(result.error);
    throw new Error(`${what}: ${msg}`);
  }
  return result;
}
