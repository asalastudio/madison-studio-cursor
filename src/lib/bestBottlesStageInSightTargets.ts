export const STAGE_IN_SIGHT_GENERATION_FAMILY_TARGETS = [
  { family: "Sleek", targetCount: 108 },
  { family: "Slim", targetCount: 84 },
  { family: "Roll-On Cap", targetCount: 35 },
  { family: "Cap/Closure", targetCount: 30 },
  { family: "Sprayer", targetCount: 26 },
  { family: "Rectangle", targetCount: 23 },
  { family: "Dropper", targetCount: 22 },
] as const;

export type StageInSightGenerationFamily =
  (typeof STAGE_IN_SIGHT_GENERATION_FAMILY_TARGETS)[number]["family"];

export interface StageInSightAuditRow {
  family?: string | null;
  product_group_slug?: string | null;
  sku?: string | null;
  website_sku?: string | null;
  shopify_variant_id?: string | null;
  convex_product_id?: string | null;
  business_product_id?: string | null;
  issue?: string | null;
  recommended_next_action?: string | null;
  generation_bucket?: string | null;
  reference_source?: string | null;
  reference_url?: string | null;
  madison_evidence_url?: string | null;
  staging_url?: string | null;
}

export interface StageInSightGenerationTargetRow {
  family: StageInSightGenerationFamily;
  productGroupSlug: string;
  sku: string;
  websiteSku: string | null;
  shopifyVariantId: string | null;
  convexProductId: string | null;
  businessProductId: string | null;
  issue: string | null;
  recommendedNextAction: string | null;
  generationBucket: string | null;
  referenceSource: string | null;
  referenceUrl: string | null;
  madisonEvidenceUrl: string | null;
  stagingUrl: string | null;
}

export interface StageInSightGenerationTargets {
  generatedAt: string;
  source: {
    missingShopifyVariantImages: string;
    generatedInMadisonButNotShopify: string;
  };
  familyTargets: typeof STAGE_IN_SIGHT_GENERATION_FAMILY_TARGETS;
  summary: {
    total: number;
    byFamily: Record<StageInSightGenerationFamily, number>;
    alreadyGeneratedExcluded: number;
  };
  rows: StageInSightGenerationTargetRow[];
}

// Keyed by `string`: membership is tested against raw audit-row family names.
const TARGET_FAMILY_INDEX = new Map<string, number>(
  STAGE_IN_SIGHT_GENERATION_FAMILY_TARGETS.map((target, index) => [
    target.family,
    index,
  ]),
);

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

export function stageInSightSkuKeys(
  row: Pick<StageInSightAuditRow, "sku" | "website_sku">,
): string[] {
  return [row.sku, row.website_sku]
    .map((value) => clean(value)?.toLowerCase())
    .filter((value): value is string => Boolean(value));
}

export function buildStageInSightGenerationTargets(params: {
  missingShopifyVariantImages: StageInSightAuditRow[];
  generatedInMadisonButNotShopify: StageInSightAuditRow[];
  generatedAt?: string;
  source?: Partial<StageInSightGenerationTargets["source"]>;
}): StageInSightGenerationTargets {
  const alreadyGeneratedSkuKeys = new Set<string>();
  for (const row of params.generatedInMadisonButNotShopify) {
    for (const key of stageInSightSkuKeys(row)) alreadyGeneratedSkuKeys.add(key);
  }

  const byFamily = Object.fromEntries(
    STAGE_IN_SIGHT_GENERATION_FAMILY_TARGETS.map(({ family }) => [family, 0]),
  ) as Record<StageInSightGenerationFamily, number>;
  const rows: StageInSightGenerationTargetRow[] = [];
  let alreadyGeneratedExcluded = 0;

  for (const row of params.missingShopifyVariantImages) {
    const family = clean(row.family);
    if (!family || !TARGET_FAMILY_INDEX.has(family)) continue;

    if (stageInSightSkuKeys(row).some((key) => alreadyGeneratedSkuKeys.has(key))) {
      alreadyGeneratedExcluded += 1;
      continue;
    }

    const sku = clean(row.sku);
    if (!sku) continue;

    const targetFamily = family as StageInSightGenerationFamily;
    byFamily[targetFamily] += 1;
    rows.push({
      family: targetFamily,
      productGroupSlug: clean(row.product_group_slug) ?? "",
      sku,
      websiteSku: clean(row.website_sku),
      shopifyVariantId: clean(row.shopify_variant_id),
      convexProductId: clean(row.convex_product_id),
      businessProductId: clean(row.business_product_id),
      issue: clean(row.issue),
      recommendedNextAction: clean(row.recommended_next_action),
      generationBucket: clean(row.generation_bucket),
      referenceSource: clean(row.reference_source),
      referenceUrl: clean(row.reference_url),
      madisonEvidenceUrl: clean(row.madison_evidence_url),
      stagingUrl: clean(row.staging_url),
    });
  }

  rows.sort((a, b) => {
    const familyDelta =
      (TARGET_FAMILY_INDEX.get(a.family) ?? 999) -
      (TARGET_FAMILY_INDEX.get(b.family) ?? 999);
    if (familyDelta !== 0) return familyDelta;
    return (
      a.productGroupSlug.localeCompare(b.productGroupSlug) ||
      a.sku.localeCompare(b.sku)
    );
  });

  return {
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    source: {
      missingShopifyVariantImages:
        params.source?.missingShopifyVariantImages ?? "missing_shopify_variant_images.csv",
      generatedInMadisonButNotShopify:
        params.source?.generatedInMadisonButNotShopify ??
        "generated_in_madison_but_not_shopify.csv",
    },
    familyTargets: STAGE_IN_SIGHT_GENERATION_FAMILY_TARGETS,
    summary: {
      total: rows.length,
      byFamily,
      alreadyGeneratedExcluded,
    },
    rows,
  };
}
