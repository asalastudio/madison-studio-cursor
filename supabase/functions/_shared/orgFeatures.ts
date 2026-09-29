export type OrgBrandConfig = {
  features?: Record<string, unknown> | null;
} | null | undefined;

/** Canonical Best Bottles organization. Owners cannot change this id. */
export const BEST_BOTTLES_ORG_ID = "4ab1ac72-cd7e-4faf-9152-5aa5f2862411";

export function isBestBottlesOrgId(organizationId: string | null | undefined): boolean {
  return organizationId === BEST_BOTTLES_ORG_ID;
}

export function orgHasFeature(brandConfig: OrgBrandConfig, feature: string): boolean {
  return brandConfig?.features?.[feature] === true;
}

export function orgHasGridPipeline(brandConfig: OrgBrandConfig): boolean {
  return orgHasFeature(brandConfig, "grid_pipeline");
}

export function orgHasTarife(brandConfig: OrgBrandConfig): boolean {
  return orgHasFeature(brandConfig, "tarife");
}

export function orgMayUseGridPipeline(
  organizationId: string | null | undefined,
  entitlements: Set<string>,
): boolean {
  return isBestBottlesOrgId(organizationId) || entitlements.has("grid_pipeline");
}

export function orgMayUseTarife(entitlements: Set<string>): boolean {
  return entitlements.has("tarife");
}

function featuresFromRows(rows: Array<{ feature?: unknown }> | null | undefined): Set<string> {
  const features = new Set<string>();
  for (const row of rows ?? []) {
    if (typeof row.feature === "string" && row.feature.length > 0) {
      features.add(row.feature);
    }
  }
  return features;
}

/** Read `org_entitlements` through a supabase-js client (service role). */
export async function fetchOrgEntitlementFeatures(
  supabase: {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => PromiseLike<{
          data: Array<{ feature?: unknown }> | null;
        }>;
      };
    };
  },
  organizationId: string,
): Promise<Set<string>> {
  const { data } = await supabase
    .from("org_entitlements")
    .select("feature")
    .eq("organization_id", organizationId);
  return featuresFromRows(data);
}

/** Read `org_entitlements` through PostgREST when the handler has no supabase-js client. */
export async function fetchOrgEntitlementFeaturesRest(
  supabaseUrl: string,
  serviceRoleKey: string,
  organizationId: string,
  doFetch: typeof fetch = fetch,
): Promise<Set<string>> {
  const url = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/org_entitlements?select=feature&organization_id=eq.${encodeURIComponent(organizationId)}`;
  const response = await doFetch(url, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });
  if (!response.ok) return new Set();
  const rows = (await response.json()) as unknown;
  return featuresFromRows(Array.isArray(rows) ? (rows as Array<{ feature?: unknown }>) : []);
}

/** Normalize a Create style overlay and refuse TARIFE_NATIVE unless the org is flagged. */
export function resolveCopyStyleOverlay(
  requested: string | undefined,
  brandConfig: OrgBrandConfig,
): string {
  const raw = (requested ?? "brand-voice").trim();
  const aliases: Record<string, string> = {
    "brand-voice": "BRAND_VOICE",
    BRAND_VOICE: "BRAND_VOICE",
    poetic: "JAY_PETERMAN",
    direct: "OGILVY",
    educational: "EDUCATIONAL",
    minimal: "MINIMAL_MODERN",
    story: "HYBRID_JP_OGILVY",
    TARIFE_NATIVE: "TARIFE_NATIVE",
    "tarife-native": "TARIFE_NATIVE",
  };
  const mapped =
    aliases[raw] || aliases[raw.toUpperCase().replace(/-/g, "_")] || "BRAND_VOICE";
  if (mapped === "TARIFE_NATIVE" && !orgHasTarife(brandConfig)) {
    return "BRAND_VOICE";
  }
  return mapped;
}
