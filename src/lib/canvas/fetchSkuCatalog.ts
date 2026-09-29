import { supabase } from "@/integrations/supabase/client";
import {
  resolveSkuFromCatalog,
  type BrandProductSkuRow,
  type PipelineSkuJobRow,
  type ProductHubSkuRow,
  type ProductVariantSkuRow,
  type SkuCatalogSnapshot,
  type SkuResolutionResult,
} from "./skuResolution";

function asRows<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

export async function fetchSkuCatalog(organizationId: string): Promise<SkuCatalogSnapshot> {
  const [hubs, brandProducts, pipelineJobs] = await Promise.all([
    supabase
      .from("product_hubs")
      .select("id, name, sku, variants, metadata, hero_image_external_url")
      .eq("organization_id", organizationId),
    supabase
      .from("brand_products")
      .select("id, name, images, specs, metadata")
      .eq("org_id", organizationId),
    supabase
      .from("best_bottles_pipeline_sku_jobs")
      .select("id, grace_sku, website_sku, shopify_sku, shopify_product_id, shopify_variant_id, product_group_display_name, best_reference_candidate_path")
      .eq("organization_id", organizationId),
  ]);

  if (hubs.error) throw hubs.error;
  if (brandProducts.error) throw brandProducts.error;
  if (pipelineJobs.error) throw pipelineJobs.error;

  const productHubs = asRows<ProductHubSkuRow>(hubs.data);
  const hubById = new Map(productHubs.map((hub) => [hub.id, hub]));
  const hubIds = productHubs.map((hub) => hub.id);

  let variantRows: unknown[] = [];
  if (hubIds.length > 0) {
    const variantQuery = await supabase
      .from("product_variants")
      .select("id, product_id, sku, name, shopify_variant_id")
      .in("product_id", hubIds);
    if (variantQuery.error) throw variantQuery.error;
    variantRows = variantQuery.data ?? [];
  }

  const productVariants = asRows<Record<string, unknown>>(variantRows).map((row) => {
    const hub = hubById.get(String(row.product_id));
    return {
      id: String(row.id),
      product_id: String(row.product_id),
      sku: typeof row.sku === "string" ? row.sku : null,
      name: typeof row.name === "string" ? row.name : null,
      shopify_variant_id: typeof row.shopify_variant_id === "string" ? row.shopify_variant_id : null,
      product_hub_id: hub?.id,
      product_name: hub?.name,
    } satisfies ProductVariantSkuRow;
  });

  const brandRows = asRows<Record<string, unknown>>(brandProducts.data).map((row) => ({
    id: String(row.id),
    name: String(row.name ?? "Product"),
    images: Array.isArray(row.images) ? (row.images as string[]) : null,
    specs: row.specs,
    metadata: row.metadata,
    sku: typeof (row as { sku?: unknown }).sku === "string" ? (row as { sku?: string }).sku ?? null : null,
    variants: (row as { variants?: unknown }).variants,
  } satisfies BrandProductSkuRow));

  return {
    productHubs,
    productVariants,
    brandProducts: brandRows,
    pipelineJobs: asRows<PipelineSkuJobRow>(pipelineJobs.data),
  };
}

export async function resolveOrganizationSku(
  organizationId: string,
  sku: string,
): Promise<SkuResolutionResult> {
  const catalog = await fetchSkuCatalog(organizationId);
  return resolveSkuFromCatalog(sku, catalog);
}
