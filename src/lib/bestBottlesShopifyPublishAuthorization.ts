/**
 * Single-use publish authorizations for guarded Best Bottles Shopify pushes.
 *
 * The Cylinder publish guard refuses any real write without a server-issued,
 * single-use authorization. Nothing minted them, so every guarded push failed —
 * and because the guard short-circuits on dry runs, the UI's preflight passed
 * first, which made the failure look like it came out of nowhere.
 *
 * This module is the pure half: classification, batching and response handling,
 * with no Supabase import so it can be unit tested. The network call lives in
 * bestBottlesShopifyPublishAuthorizationClient.ts.
 */

import type { BestBottlesShopifyPushItem } from "@/lib/bestBottlesShopifyPushIdentity";

/**
 * Mirrors `isCylinderProductSku` in
 * supabase/functions/_shared/shopifyPublishGuard.ts. Kept in step by
 * bestBottlesShopifyPublishAuthorization.test.ts, which reads the edge module
 * and asserts both patterns classify the same SKUs.
 */
const CYLINDER_GRACE_SKU = /^GB-(?:CYL|TCYL)-/i;
const CYLINDER_WEBSITE_SKU = /^GB(?:Tall)?Cyl/i;

export function isCylinderProductSku(value: string | null | undefined): boolean {
  const sku = value?.trim() ?? "";
  return CYLINDER_GRACE_SKU.test(sku) || CYLINDER_WEBSITE_SKU.test(sku);
}

/** True when the publish guard will demand an authorization for this item. */
export function requiresPublishAuthorization(
  item: Pick<BestBottlesShopifyPushItem, "sku" | "websiteSku" | "graceSku">,
): boolean {
  return [item.sku, item.websiteSku, item.graceSku].some(isCylinderProductSku);
}

export class PublishAuthorizationError extends Error {
  readonly rejected: MintRejection[];

  constructor(message: string, rejected: MintRejection[] = []) {
    super(message);
    this.name = "PublishAuthorizationError";
    this.rejected = rejected;
  }
}

export interface MintedAuthorization {
  authorizationId: string;
  pipelineSkuJobId: string;
  generatedImageId: string;
  expiresAt: string;
}

export interface MintRejection {
  pipelineSkuJobId: string | null;
  reason: string;
}

export interface MintResponse {
  authorizations?: MintedAuthorization[];
  rejected?: MintRejection[];
  error?: string;
}

/** Splits items into the ones the guard covers and the ones it ignores. */
export function partitionByAuthorizationNeed(
  items: BestBottlesShopifyPushItem[],
): { guarded: BestBottlesShopifyPushItem[]; unguarded: BestBottlesShopifyPushItem[] } {
  const guarded: BestBottlesShopifyPushItem[] = [];
  const unguarded: BestBottlesShopifyPushItem[] = [];
  for (const item of items) {
    (requiresPublishAuthorization(item) ? guarded : unguarded).push(item);
  }
  return { guarded, unguarded };
}

/** The payload sent to mint-shopify-publish-authorization. */
export function buildMintRequest(input: {
  organizationId: string;
  guarded: BestBottlesShopifyPushItem[];
}): Record<string, unknown> {
  return {
    organizationId: input.organizationId,
    items: input.guarded.map((item) => ({
      pipelineSkuJobId: item.pipelineSkuJobId,
      imageId: item.imageId,
      imageUrl: item.imageUrl,
      sku: item.sku,
      websiteSku: item.websiteSku,
      graceSku: item.graceSku,
    })),
  };
}

/** Applies minted authorization ids to the matching items, by job id. */
export function applyAuthorizations(
  items: BestBottlesShopifyPushItem[],
  authorizations: MintedAuthorization[],
): BestBottlesShopifyPushItem[] {
  const byJobId = new Map(
    authorizations.map((authorization) => [
      authorization.pipelineSkuJobId,
      authorization.authorizationId,
    ]),
  );

  return items.map((item) => {
    const authorizationId = byJobId.get(item.pipelineSkuJobId);
    return authorizationId ? { ...item, publishAuthorizationId: authorizationId } : item;
  });
}

/**
 * Validates a mint response against what was asked for and returns the items
 * with authorizations attached.
 *
 * Throws when any guarded item went unauthorized: a partial batch would push
 * some SKUs and fail the rest halfway through, which is worse than not starting.
 */
export function resolveMintResponse(input: {
  items: BestBottlesShopifyPushItem[];
  guarded: BestBottlesShopifyPushItem[];
  response: MintResponse;
}): BestBottlesShopifyPushItem[] {
  if (input.response?.error) {
    throw new PublishAuthorizationError(String(input.response.error));
  }

  const authorizations = input.response?.authorizations ?? [];
  const rejected = input.response?.rejected ?? [];

  const authorizedJobIds = new Set(
    authorizations.map((authorization) => authorization.pipelineSkuJobId),
  );
  const unauthorized = input.guarded.filter(
    (item) => !authorizedJobIds.has(item.pipelineSkuJobId),
  );

  if (unauthorized.length > 0) {
    const detail = rejected.length > 0
      ? rejected.map((entry) => entry.reason).join(" · ")
      : "no reason returned";
    throw new PublishAuthorizationError(
      `${unauthorized.length} of ${input.guarded.length} SKU(s) could not be authorized for publishing: ${detail}`,
      rejected,
    );
  }

  return applyAuthorizations(input.items, authorizations);
}

/** Guarded items must carry the pipeline job identity the guard compares against. */
export function assertGuardedItemsHaveJobIds(guarded: BestBottlesShopifyPushItem[]): void {
  const missing = guarded.filter((item) => !item.pipelineSkuJobId?.trim());
  if (missing.length > 0) {
    throw new PublishAuthorizationError(
      `${missing.length} guarded item(s) have no pipeline job id, which the publish guard requires.`,
    );
  }
}
