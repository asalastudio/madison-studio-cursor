import type { PipelineSkuJob } from "@/lib/bestBottlesPipeline";
import {
  resolveBestBottlesVisualIdentity,
  type BestBottlesVisualProduct,
} from "@/lib/bestBottlesVisualIdentity";

export type BestBottlesShopifyPushItem = {
  /**
   * The guarded Shopify pusher requires the exact pipeline job identity for
   * Cylinder products and refuses the write without it, so this is never
   * optional — omitting it is what made every guarded push fail.
   */
  pipelineSkuJobId: string;
  /**
   * Single-use authorization issued by mint-shopify-publish-authorization.
   * Attached between preflight and push by
   * `attachPublishAuthorizations`; absent for products the guard ignores.
   */
  publishAuthorizationId?: string;
  imageId: string | null;
  imageUrl: string | null;
  sku: string;
  websiteSku: string;
  graceSku: string;
  expectedCapColor?: string;
  altText: string;
};

export function expectedBestBottlesVisualIdentityForProduct(
  product: BestBottlesVisualProduct | null | undefined,
): string {
  const resolution = resolveBestBottlesVisualIdentity(product ?? null);
  return resolution.safeToPush ? resolution.resolvedVisualIdentity : "";
}

export function expectedBestBottlesVisualIdentityForSkuJob(job: PipelineSkuJob): string {
  return expectedBestBottlesVisualIdentityForProduct({
    graceSku: job.grace_sku,
    websiteSku: job.website_sku,
    family: job.family,
    category: job.category,
    color: job.canonical_color,
    applicator: job.applicator,
    itemName: job.product_group_display_name,
  });
}

export function buildBestBottlesShopifyPushItemFromSkuJob(
  job: PipelineSkuJob,
): BestBottlesShopifyPushItem {
  const expectedCapColor = expectedBestBottlesVisualIdentityForSkuJob(job);

  return {
    pipelineSkuJobId: job.id,
    imageId: job.approved_image_id,
    imageUrl: job.approved_image_url,
    // Must equal job.shopify_sku exactly: the publish guard compares the two and
    // rejects the push on any difference, so a website_sku fallback would break
    // the write rather than rescue it.
    sku: job.shopify_sku ?? job.website_sku,
    websiteSku: job.website_sku,
    graceSku: job.grace_sku,
    expectedCapColor: expectedCapColor || undefined,
    altText: job.product_group_display_name ?? job.website_sku,
  };
}

function normalizedProductGroupSlug(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

/**
 * Builds the guarded publish item used by the Image Library's product-group
 * hero action. The hero may represent any exact SKU in the selected group;
 * Shopify publication still runs through that SKU's approved pipeline job.
 */
export function buildBestBottlesCatalogHeroPushItem(input: {
  job: PipelineSkuJob;
  imageId: string;
  imageUrl: string;
  productGroupSlug: string;
}): BestBottlesShopifyPushItem {
  const {
    job,
    imageId,
    imageUrl,
    productGroupSlug,
  } = input;

  if (
    normalizedProductGroupSlug(job.product_group_slug) !==
    normalizedProductGroupSlug(productGroupSlug)
  ) {
    throw new Error(
      "The selected image's pipeline job does not belong to this product group.",
    );
  }

  if (job.status !== "approved") {
    throw new Error(
      "The selected image's exact SKU pipeline job must be approved before publishing this catalog hero.",
    );
  }
  if (
    !imageId ||
    job.generated_image_id !== imageId ||
    job.approved_image_id !== imageId
  ) {
    throw new Error(
      "The selected library image is not the exact approved image on its SKU pipeline job.",
    );
  }
  if (
    !imageUrl ||
    job.generated_image_url !== imageUrl ||
    job.approved_image_url !== imageUrl
  ) {
    throw new Error(
      "The selected library image URL does not match the exact approved SKU pipeline image.",
    );
  }
  if (!job.shopify_sku?.trim()) {
    throw new Error(
      "The approved exact-SKU pipeline job has no Shopify SKU.",
    );
  }

  return buildBestBottlesShopifyPushItemFromSkuJob(job);
}
