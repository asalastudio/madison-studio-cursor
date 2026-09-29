import type { SkuResolvedVia } from "./types";

export interface ProductHubSkuRow {
  id: string;
  name: string;
  sku?: string | null;
  variants?: unknown;
  metadata?: unknown;
  hero_image_external_url?: string | null;
  shopify_product_id?: string | null;
  shopify_variant_id?: string | null;
}

export interface ProductVariantSkuRow {
  id: string;
  product_id: string;
  sku?: string | null;
  name?: string | null;
  shopify_variant_id?: string | null;
  product_name?: string | null;
  product_hub_id?: string | null;
  shopify_product_id?: string | null;
}

export interface BrandProductSkuRow {
  id: string;
  name: string;
  sku?: string | null;
  variants?: unknown;
  specs?: unknown;
  metadata?: unknown;
  images?: string[] | null;
  shopify_product_id?: string | null;
  shopify_variant_id?: string | null;
}

export interface PipelineSkuJobRow {
  id: string;
  grace_sku?: string | null;
  website_sku?: string | null;
  shopify_sku?: string | null;
  shopify_product_id?: string | null;
  shopify_variant_id?: string | null;
  product_group_display_name?: string | null;
  best_reference_candidate_path?: string | null;
}

export interface SkuCatalogSnapshot {
  productHubs: ProductHubSkuRow[];
  productVariants: ProductVariantSkuRow[];
  brandProducts: BrandProductSkuRow[];
  pipelineJobs: PipelineSkuJobRow[];
}

export interface SkuResolutionHit {
  sku: string;
  via: Exclude<SkuResolvedVia, "shopify_live">;
  productName: string;
  productHubId?: string;
  brandProductId?: string;
  shopifyProductGid?: string | null;
  shopifyVariantGid?: string | null;
  imageUrl?: string | null;
}

export type SkuResolutionResult =
  | { status: "resolved"; hit: SkuResolutionHit }
  | { status: "ambiguous"; hits: SkuResolutionHit[]; message: string }
  | { status: "unresolved"; message: string };

const SKU_COMPARE = (value: string | null | undefined, sku: string) =>
  typeof value === "string" && value.trim().toUpperCase() === sku;

function normalizeSku(sku: string): string {
  return sku.trim().toUpperCase();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return asRecord(parsed);
    } catch {
      return null;
    }
  }
  return null;
}

function asVariantList(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.filter((item): item is Record<string, unknown> =>
      Boolean(item && typeof item === "object"),
    );
  }
  if (typeof value === "string") {
    try {
      return asVariantList(JSON.parse(value));
    } catch {
      return [];
    }
  }
  return [];
}

function stringField(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

export function toShopifyGid(kind: "Product" | "ProductVariant", value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("gid://shopify/")) return trimmed;
  return `gid://shopify/${kind}/${trimmed}`;
}

function hubVariants(hub: ProductHubSkuRow): Array<Record<string, unknown>> {
  const top = asVariantList(hub.variants);
  if (top.length > 0) return top;
  const meta = asRecord(hub.metadata);
  return asVariantList(meta?.variants);
}

function brandProductSkus(row: BrandProductSkuRow): string[] {
  const found = new Set<string>();
  if (row.sku) found.add(row.sku);
  for (const variant of asVariantList(row.variants)) {
    const sku = stringField(variant, "sku");
    if (sku) found.add(sku);
  }
  const specs = asRecord(row.specs);
  const specSku = stringField(specs, "sku");
  if (specSku) found.add(specSku);
  for (const variant of asVariantList(specs?.variants)) {
    const sku = stringField(variant, "sku");
    if (sku) found.add(sku);
  }
  const meta = asRecord(row.metadata);
  const metaSku = stringField(meta, "sku");
  if (metaSku) found.add(metaSku);
  for (const variant of asVariantList(meta?.variants)) {
    const sku = stringField(variant, "sku");
    if (sku) found.add(sku);
  }
  return [...found];
}

function uniqueHits(hits: SkuResolutionHit[]): SkuResolutionHit[] {
  const seen = new Set<string>();
  const unique: SkuResolutionHit[] = [];
  for (const hit of hits) {
    const key = [
      hit.via,
      hit.productHubId ?? "",
      hit.brandProductId ?? "",
      hit.shopifyVariantGid ?? "",
      hit.productName,
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(hit);
  }
  return unique;
}

function collectProductHubHits(sku: string, hubs: ProductHubSkuRow[]): SkuResolutionHit[] {
  const hits: SkuResolutionHit[] = [];
  for (const hub of hubs) {
    const direct = SKU_COMPARE(hub.sku, sku);
    const matchingVariant = hubVariants(hub).find((variant) => SKU_COMPARE(stringField(variant, "sku"), sku));
    if (!direct && !matchingVariant) continue;
    hits.push({
      sku: hub.sku ?? stringField(matchingVariant ?? null, "sku") ?? sku,
      via: "product_hubs",
      productName: hub.name,
      productHubId: hub.id,
      shopifyProductGid: toShopifyGid("Product", hub.shopify_product_id),
      shopifyVariantGid: toShopifyGid(
        "ProductVariant",
        stringField(matchingVariant ?? null, "shopify_variant_id") ?? hub.shopify_variant_id,
      ),
      imageUrl: hub.hero_image_external_url ?? null,
    });
  }
  return uniqueHits(hits);
}

function collectVariantHits(sku: string, variants: ProductVariantSkuRow[]): SkuResolutionHit[] {
  const hits: SkuResolutionHit[] = [];
  for (const variant of variants) {
    if (!SKU_COMPARE(variant.sku, sku)) continue;
    hits.push({
      sku: variant.sku ?? sku,
      via: "product_variants",
      productName: variant.product_name ?? variant.name ?? variant.sku ?? sku,
      productHubId: variant.product_hub_id ?? variant.product_id,
      shopifyProductGid: toShopifyGid("Product", variant.shopify_product_id),
      shopifyVariantGid: toShopifyGid("ProductVariant", variant.shopify_variant_id),
    });
  }
  return uniqueHits(hits);
}

function collectBrandProductHits(sku: string, products: BrandProductSkuRow[]): SkuResolutionHit[] {
  const hits: SkuResolutionHit[] = [];
  for (const product of products) {
    const skus = brandProductSkus(product);
    if (!skus.some((value) => SKU_COMPARE(value, sku))) continue;
    hits.push({
      sku: product.sku ?? skus.find((value) => SKU_COMPARE(value, sku)) ?? sku,
      via: "brand_products",
      productName: product.name,
      brandProductId: product.id,
      shopifyProductGid: toShopifyGid("Product", product.shopify_product_id),
      shopifyVariantGid: toShopifyGid("ProductVariant", product.shopify_variant_id),
      imageUrl: product.images?.[0] ?? null,
    });
  }
  return uniqueHits(hits);
}

function collectPipelineHits(sku: string, jobs: PipelineSkuJobRow[]): SkuResolutionHit[] {
  const hits: SkuResolutionHit[] = [];
  for (const job of jobs) {
    const match =
      SKU_COMPARE(job.grace_sku, sku) ||
      SKU_COMPARE(job.website_sku, sku) ||
      SKU_COMPARE(job.shopify_sku, sku);
    if (!match) continue;
    hits.push({
      sku: job.grace_sku ?? job.shopify_sku ?? job.website_sku ?? sku,
      via: "bb_pipeline_sku_jobs",
      productName: job.product_group_display_name ?? job.grace_sku ?? sku,
      shopifyProductGid: toShopifyGid("Product", job.shopify_product_id),
      shopifyVariantGid: toShopifyGid("ProductVariant", job.shopify_variant_id),
      imageUrl: job.best_reference_candidate_path ?? null,
    });
  }
  return uniqueHits(hits);
}

/**
 * Resolve a SKU against org product data.
 * Order (stop at the first exact, unique hit):
 *   1. product_hubs (sku + variants jsonb) — Product Hub is the write path
 *   2. product_variants.sku
 *   3. brand_products (legacy)
 *   4. best_bottles_pipeline_sku_jobs
 * Live Shopify is week 3 / push-time, not week 1.
 */
export function resolveSkuFromCatalog(rawSku: string, catalog: SkuCatalogSnapshot): SkuResolutionResult {
  const sku = normalizeSku(rawSku);
  if (!sku) {
    return { status: "unresolved", message: "Enter a SKU" };
  }

  const stages: Array<{ via: SkuResolutionHit["via"]; hits: SkuResolutionHit[] }> = [
    { via: "product_hubs", hits: collectProductHubHits(sku, catalog.productHubs) },
    { via: "product_variants", hits: collectVariantHits(sku, catalog.productVariants) },
    { via: "brand_products", hits: collectBrandProductHits(sku, catalog.brandProducts) },
    { via: "bb_pipeline_sku_jobs", hits: collectPipelineHits(sku, catalog.pipelineJobs) },
  ];

  for (const stage of stages) {
    if (stage.hits.length === 1) {
      return { status: "resolved", hit: stage.hits[0] };
    }
    if (stage.hits.length > 1) {
      return {
        status: "ambiguous",
        hits: stage.hits,
        message: `SKU ${rawSku.trim()} matches ${stage.hits.length} ${stage.via} records. Use a unique SKU.`,
      };
    }
  }

  return {
    status: "unresolved",
    message: `No product in this company matches SKU ${rawSku.trim()}`,
  };
}

export function skuRequiresResolution(type: "pdp" | "campaign", sku: string | null | undefined): boolean {
  if (type === "campaign") return false;
  return Boolean(sku && sku.trim());
}
