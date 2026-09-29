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

/** Same gate as the generate-with-claude helper — keep the two copies in lockstep. */
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

export function brandConfigFromOrganization(organization: unknown): OrgBrandConfig {
  if (!organization || typeof organization !== "object") return null;
  const config = (organization as { brand_config?: unknown }).brand_config;
  if (!config || typeof config !== "object") return null;
  return config as OrgBrandConfig;
}
