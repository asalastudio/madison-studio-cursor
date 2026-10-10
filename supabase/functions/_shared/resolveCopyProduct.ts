import { formatSemanticContext, getSemanticFields } from "./productFieldFilters.ts";

export type CopyProductTable = "product_hubs" | "brand_products";

/** product_hubs scopes by organization_id; brand_products by org_id. */
export function copyProductOrgColumn(table: CopyProductTable): "organization_id" | "org_id" {
  return table === "brand_products" ? "org_id" : "organization_id";
}
export type CopyProductSource = CopyProductTable | "client";

export type FetchOrgProduct = (
  table: CopyProductTable,
  productId: string,
  organizationId: string,
) => Promise<Record<string, unknown> | null>;

export type CopyProductRecord = Record<string, unknown>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstNonEmpty(...values: unknown[]): unknown {
  for (const value of values) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    return value;
  }
  return undefined;
}

function asText(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => asText(item))
      .filter((item): item is string => Boolean(item));
    return parts.length > 0 ? parts.join("; ") : undefined;
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isPlainObject(value) ? value : null;
}

function measurementText(value: unknown, unit: string): string | undefined {
  const text = asText(value);
  if (!text) return undefined;
  if (/[a-z]/i.test(text)) return text;
  return `${text} ${unit}`;
}

function skuFieldList(skus: unknown, field: string): string | undefined {
  if (!Array.isArray(skus)) return undefined;
  const values = skus
    .map((sku) => (isPlainObject(sku) ? asText(sku[field]) : undefined))
    .filter((item): item is string => Boolean(item));
  const unique = [...new Set(values)];
  return unique.length > 0 ? unique.join("; ") : undefined;
}

function capacityFact(
  capacity: Record<string, unknown>,
  bestBottles: Record<string, unknown>,
): string | undefined {
  const display = asText(capacity.display);
  if (display) return display;
  const raw = asText(firstNonEmpty(capacity.ml, bestBottles.capacityMl));
  if (!raw) return undefined;
  return /ml/i.test(raw) ? raw : `${raw} ml`;
}

function dimensionFact(
  dimensions: Record<string, unknown>,
  bestBottles: Record<string, unknown>,
): string | undefined {
  const unit = asText(dimensions.unit) ?? "mm";
  const skus = bestBottles.skus;
  const sku = Array.isArray(skus)
    ? skus.find((item) =>
      isPlainObject(item) && (item.heightWithoutCap != null || item.diameter != null)
    )
    : undefined;
  const skuRecord = isPlainObject(sku) ? sku : {};

  const height = measurementText(
    firstNonEmpty(
      dimensions.height_without_cap,
      skuRecord.heightWithoutCap,
      bestBottles.heightWithoutCap,
    ),
    unit,
  );
  const diameter = measurementText(
    firstNonEmpty(
      dimensions.diameter,
      skuRecord.diameter,
      bestBottles.diameter,
    ),
    unit,
  );

  if (height && diameter) {
    return `${height} height without cap × ${diameter} diameter`;
  }
  if (height) return `${height} height without cap`;
  if (diameter) return `${diameter} diameter`;
  return undefined;
}

/**
 * Curated packaging specs for copy. Reads Best Bottles hub metadata and
 * ignores visual-only fields such as lighting.
 */
export function buildPackagingFacts(
  metadata: Record<string, unknown> | null | undefined,
): string | undefined {
  if (!metadata) return undefined;
  const bottleSpecs = asRecord(metadata.bottle_specs);
  const bestBottles = asRecord(metadata.best_bottles);
  if (!bottleSpecs && !bestBottles) return undefined;

  const productGroup = asRecord(bottleSpecs?.productGroup) ?? {};
  const capacity = asRecord(bottleSpecs?.capacity) ?? {};
  const neck = asRecord(bottleSpecs?.neck) ?? {};
  const material = asRecord(bottleSpecs?.material) ?? {};
  const container = asRecord(bottleSpecs?.container) ?? {};
  const color = asRecord(bottleSpecs?.color) ?? {};
  const dimensions = asRecord(bottleSpecs?.dimensions) ?? {};
  const best = bestBottles ?? {};

  const lines: string[] = [];
  const family = asText(firstNonEmpty(productGroup.family, best.family));
  const capacityLabel = capacityFact(capacity, best);
  const materialLabel = asText(firstNonEmpty(material.primary, material.body, best.material));
  const colorLabel = asText(firstNonEmpty(color.canonical, best.canonicalColor));
  const neckLabel = asText(firstNonEmpty(neck.finish_code, neck.thread_size, best.neckThread));
  const applicator = asText(firstNonEmpty(
    container.applicators,
    best.applicator,
    skuFieldList(best.skus, "applicator"),
  ));
  const capStyle = asText(firstNonEmpty(
    container.capStyles,
    skuFieldList(best.skus, "capStyle"),
  ));
  const capColor = asText(firstNonEmpty(
    container.capColors,
    skuFieldList(best.skus, "capColor"),
  ));
  const dimensionsLabel = dimensionFact(dimensions, best);

  if (family) lines.push(`Family: ${family}`);
  if (capacityLabel) lines.push(`Capacity: ${capacityLabel}`);
  if (materialLabel) lines.push(`Material: ${materialLabel}`);
  if (colorLabel) lines.push(`Color: ${colorLabel}`);
  if (neckLabel) lines.push(`Neck finish: ${neckLabel}`);
  if (applicator) lines.push(`Applicator/closure: ${applicator}`);
  if (capStyle) lines.push(`Cap style: ${capStyle}`);
  if (capColor) lines.push(`Cap color: ${capColor}`);
  if (dimensionsLabel) lines.push(`Dimensions: ${dimensionsLabel}`);

  return lines.length > 0 ? lines.join("\n") : undefined;
}

/**
 * Map Product Hub columns (and matching metadata) onto the semantic field
 * names copy prompts already understand, then drop visual/technical noise.
 */
export function normalizeProductRecordForCopy(
  row: CopyProductRecord | null | undefined,
): CopyProductRecord | null {
  if (!row) return null;

  const metadata = isPlainObject(row.metadata) ? row.metadata : {};
  const merged: CopyProductRecord = { ...metadata, ...row };

  const collection = asText(
    firstNonEmpty(merged.collection, merged.collections),
  );
  const brandStory = asText(
    firstNonEmpty(
      merged.brand_story,
      merged.long_description,
      merged.short_description,
    ),
  );
  const usp = asText(
    firstNonEmpty(merged.usp, merged.tagline, merged.key_differentiators),
  );
  const tone = asText(firstNonEmpty(merged.tone, merged.brand_voice_notes));
  const emotionalBenefits = asText(
    firstNonEmpty(merged.emotional_benefits, merged.key_benefits),
  );

  if (collection) merged.collection = collection;
  if (brandStory) merged.brand_story = brandStory;
  if (usp) merged.usp = usp;
  if (tone) merged.tone = tone;
  if (emotionalBenefits) merged.emotional_benefits = emotionalBenefits;

  const packagingFacts = buildPackagingFacts(metadata);
  if (packagingFacts) merged.packaging_facts = packagingFacts;

  return merged;
}

export function semanticCopyProduct(
  row: CopyProductRecord | null | undefined,
): ReturnType<typeof getSemanticFields> {
  return getSemanticFields(normalizeProductRecordForCopy(row));
}

export async function resolveCopyProduct(options: {
  productId?: string | null;
  organizationId?: string | null;
  clientProductData?: CopyProductRecord | null;
  fetchProduct: FetchOrgProduct;
}): Promise<{
  product: ReturnType<typeof getSemanticFields>;
  source: CopyProductSource | null;
}> {
  const { productId, organizationId, clientProductData, fetchProduct } = options;
  const clientRow = isPlainObject(clientProductData) ? clientProductData : null;

  let dbRow: CopyProductRecord | null = null;
  let source: CopyProductSource | null = null;

  if (productId && organizationId) {
    dbRow = await fetchProduct("product_hubs", productId, organizationId);
    if (dbRow) {
      source = "product_hubs";
    } else {
      dbRow = await fetchProduct("brand_products", productId, organizationId);
      if (dbRow) {
        source = "brand_products";
      }
    }
  }

  const merged: CopyProductRecord = {
    ...(clientRow ?? {}),
    ...(dbRow ?? {}),
  };

  if (!dbRow && clientRow) {
    source = "client";
  }

  if (Object.keys(merged).length === 0) {
    return { product: null, source: null };
  }

  return {
    product: semanticCopyProduct(merged),
    source,
  };
}

/**
 * When the selected product is not a fragrance/skincare CATEGORY_PROMPTS
 * key (e.g. Best Bottles packaging), still inject semantic identity so the
 * model does not invent a different SKU.
 */
export function fallbackSemanticProductContext(
  product: CopyProductRecord | null | undefined,
): string {
  if (!product) return "";
  return formatSemanticContext(product);
}
