/**
 * Image Library “Catalog heroes” stack.
 *
 * One lane for every family: Cylinder first, then Empire / Circle / Elegant /
 * the rest on the same filters. Role is catalog-grid heroes only — not PDP
 * extras, marketing, keepers, or raw references.
 */

export const BEST_BOTTLES_CATALOG_HERO_LANE_TAG = "lane:catalog-hero" as const;
export const BEST_BOTTLES_CATALOG_HERO_DEFAULT_FAMILY = "cylinder" as const;
export const BEST_BOTTLES_CATALOG_HERO_LINEAGE_TAG = "reference-lineage:clean" as const;
export const BEST_BOTTLES_FLATTENED_SINGLE_SOURCE_LINEAGE_TAG =
  "reference-lineage:flattened-single-source" as const;

export const BEST_BOTTLES_CATALOG_HERO_GRID_PRESET_IDS = [
  "grid-card-2000x2200",
  "grid-card-exploded-2000x2200",
] as const;

export type BestBottlesCatalogHeroCapState = "sidecar" | "assembled";

export type BestBottlesCatalogHeroLibraryPreset = {
  assetType: "catalog-heroes";
  lineage: "all";
  family: string;
  skuSize: "all";
};

export function isBestBottlesCatalogHeroPresetId(
  presetId: string | null | undefined,
): boolean {
  const id = presetId?.trim();
  return BEST_BOTTLES_CATALOG_HERO_GRID_PRESET_IDS.some((preset) => preset === id);
}

export function catalogHeroCapStateForPreset(
  presetId: string,
): BestBottlesCatalogHeroCapState {
  return presetId === "grid-card-exploded-2000x2200" ? "sidecar" : "assembled";
}

export function buildBestBottlesCatalogHeroLibraryTags(input: {
  presetId: string;
  scaleCardVersion?: string | null;
}): string[] {
  if (!isBestBottlesCatalogHeroPresetId(input.presetId)) return [];
  const capState = catalogHeroCapStateForPreset(input.presetId);
  const scaleCard = input.scaleCardVersion?.trim();
  return [
    BEST_BOTTLES_CATALOG_HERO_LANE_TAG,
    BEST_BOTTLES_CATALOG_HERO_LINEAGE_TAG,
    `cap-state:${capState}`,
    scaleCard ? `scale-card:${scaleCard}` : null,
  ].filter((tag): tag is string => Boolean(tag));
}

function normalizeLibraryTags(tags: readonly string[] | null | undefined): string[] {
  if (!Array.isArray(tags)) return [];
  return tags.map((tag) => String(tag ?? "").trim().toLowerCase()).filter(Boolean);
}

export function isBestBottlesCatalogHeroLibraryImage(
  tags: readonly string[] | null | undefined,
): boolean {
  const normalized = normalizeLibraryTags(tags);
  if (normalized.includes(BEST_BOTTLES_CATALOG_HERO_LANE_TAG)) return true;
  if (!normalized.includes("studio-master")) return false;
  return normalized.some(
    (tag) =>
      tag === "preset:grid-card-2000x2200" ||
      tag === "preset:grid-card-exploded-2000x2200" ||
      tag.startsWith("preset:grid-card-"),
  );
}

export function getCatalogHeroLibraryPreset(
  family: string = BEST_BOTTLES_CATALOG_HERO_DEFAULT_FAMILY,
): BestBottlesCatalogHeroLibraryPreset {
  const trimmed = family.trim().toLowerCase();
  return {
    assetType: "catalog-heroes",
    lineage: "all",
    family: trimmed || BEST_BOTTLES_CATALOG_HERO_DEFAULT_FAMILY,
    skuSize: "all",
  };
}
