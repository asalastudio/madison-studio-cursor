import { getIndustryById } from "@/config/industries";

export interface OrganizationBrandRecord {
  name?: string | null;
  industry_type?: string | null;
  settings?: unknown;
  brand_config?: unknown;
}

export interface SettingsBrandQuickView {
  brandName?: string;
  colors: {
    primary?: string;
    secondary?: string;
    accent?: string;
    palette?: string[];
  };
  typography: {
    headline?: string;
    body?: string;
  };
  tone?: string;
  industryLabel?: string;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function colorList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => text(item))
    .filter((item) => /^#?[0-9a-fA-F]{3,8}$/.test(item) || item.length > 0)
    .map((item) => (item.startsWith("#") || !/^[0-9a-fA-F]{6}$/.test(item) ? item : `#${item}`));
}

/**
 * Brand Studio writes the palette and industry onto the organization, not
 * into brand_dna. The dashboard reads this so a filled settings form is
 * not shown as "No brand DNA yet".
 */
export function brandQuickViewFromOrganization(
  org: OrganizationBrandRecord | null | undefined,
): SettingsBrandQuickView | null {
  if (!org) return null;
  const settings = record(org.settings);
  const studio = record(settings.brand_studio);
  const visual = record(studio.visual);
  const config = record(org.brand_config);
  const industryId = text(studio.industry)
    || text(config.industry)
    || text(record(config.industry_config).id)
    || text(org.industry_type);
  const industry = industryId ? getIndustryById(industryId) : undefined;
  const palette = colorList(visual.colors).length > 0
    ? colorList(visual.colors)
    : colorList(config.colors);
  const primary = text(config.primaryColor) || palette[0];
  const brandName = text(org.name) || text(studio.brand_name) || text(config.brandName);
  const headline = text(visual.typography_primary) || text(record(config.typography).primary);
  const body = text(visual.typography_secondary) || text(record(config.typography).secondary);

  const filled = Boolean(primary || industry || brandName || headline);
  if (!filled) return null;

  return {
    brandName: brandName || undefined,
    colors: {
      primary: primary || undefined,
      secondary: palette[1],
      accent: palette[2],
      palette: palette.length > 0 ? palette : undefined,
    },
    typography: {
      headline: headline || undefined,
      body: body || undefined,
    },
    tone: industry?.shortName,
    industryLabel: industry?.shortName,
  };
}
