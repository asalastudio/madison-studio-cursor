/**
 * Resolve an organization's subscription tier from the real schema:
 * subscriptions (organization_id, status, plan_id) → subscription_plans.slug.
 *
 * organizations has no subscription_tier / stripe_subscription_status columns;
 * selecting them errored on every image request ("column
 * organizations.subscription_tier does not exist") and silently fell back.
 */

type TierClient = { from: (table: string) => any };

export interface OrgSubscriptionTier {
  tier: string;
  status: string | null;
  isActive: boolean;
}

export const DEFAULT_SUBSCRIPTION_TIER = "essentials";

export async function resolveOrgSubscriptionTier(
  client: TierClient,
  organizationId: string | null | undefined,
): Promise<OrgSubscriptionTier> {
  const fallback: OrgSubscriptionTier = { tier: DEFAULT_SUBSCRIPTION_TIER, status: null, isActive: false };
  if (!organizationId) return fallback;

  const { data: sub, error } = await client
    .from("subscriptions")
    .select("status, plan_id, current_period_end")
    .eq("organization_id", organizationId)
    .order("current_period_end", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!sub) return fallback;

  let tier = DEFAULT_SUBSCRIPTION_TIER;
  if (sub.plan_id) {
    const { data: plan, error: planError } = await client
      .from("subscription_plans")
      .select("slug")
      .eq("id", sub.plan_id)
      .maybeSingle();
    if (planError) throw planError;
    if (typeof plan?.slug === "string" && plan.slug.trim()) tier = plan.slug.trim().toLowerCase();
  }
  const status = typeof sub.status === "string" ? sub.status : null;
  return { tier, status, isActive: status === "active" || status === "trialing" };
}
