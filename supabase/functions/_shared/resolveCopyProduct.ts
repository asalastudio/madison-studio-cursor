import { formatSemanticContext, getSemanticFields } from "./productFieldFilters.ts";

export type CopyProductTable = "product_hubs" | "brand_products";
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
  if (Array.isArray(value)) {
    const parts = value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    return parts.length > 0 ? parts.join("; ") : undefined;
  }
  return undefined;
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
