/**
 * Server-side org feature flags. Clients can send tags that claim a
 * Best Bottles or Tarife lane; only these flags decide whether that
 * lane is allowed.
 */

/** Canonical Best Bottles organization. Used as an allowlist, not a client claim. */
export const BEST_BOTTLES_ORG_ID = "4ab1ac72-cd7e-4faf-9152-5aa5f2862411";

export function isBestBottlesOrgId(organizationId: string | null | undefined): boolean {
  return organizationId === BEST_BOTTLES_ORG_ID;
}

export type OrgBrandConfig = {
  features?: Record<string, unknown> | null;
} | null | undefined;

export function orgHasFeature(brandConfig: OrgBrandConfig, feature: string): boolean {
  return brandConfig?.features?.[feature] === true;
}

export function orgHasGridPipeline(brandConfig: OrgBrandConfig): boolean {
  return orgHasFeature(brandConfig, "grid_pipeline");
}

export function orgHasTarife(brandConfig: OrgBrandConfig): boolean {
  return orgHasFeature(brandConfig, "tarife");
}

export async function fetchOrgBrandConfig(
  supabase: { from: (table: string) => unknown },
  organizationId: string,
): Promise<OrgBrandConfig> {
  const query = supabase.from("organizations") as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{ data: { brand_config?: unknown } | null }>;
      };
    };
  };
  const { data } = await query.select("brand_config").eq("id", organizationId).maybeSingle();
  const config = data?.brand_config;
  if (!config || typeof config !== "object") return null;
  return config as OrgBrandConfig;
}
