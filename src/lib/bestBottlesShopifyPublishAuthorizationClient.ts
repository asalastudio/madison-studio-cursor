/**
 * Network half of the publish-authorization flow. Call
 * `attachPublishAuthorizations` between the dry-run preflight and the real push.
 *
 * All the decision logic lives in bestBottlesShopifyPublishAuthorization.ts,
 * which stays free of the Supabase client so it can be unit tested.
 */

import { supabase } from "@/integrations/supabase/client";
import type { BestBottlesShopifyPushItem } from "@/lib/bestBottlesShopifyPushIdentity";
import {
  assertGuardedItemsHaveJobIds,
  buildMintRequest,
  partitionByAuthorizationNeed,
  PublishAuthorizationError,
  resolveMintResponse,
  type MintResponse,
} from "@/lib/bestBottlesShopifyPublishAuthorization";

/**
 * Mints single-use authorizations for every guarded item and returns the items
 * with `publishAuthorizationId` attached. Items the guard ignores pass through
 * untouched, and a batch with nothing guarded makes no network call at all.
 */
export async function attachPublishAuthorizations(input: {
  organizationId: string;
  items: BestBottlesShopifyPushItem[];
}): Promise<BestBottlesShopifyPushItem[]> {
  const { guarded } = partitionByAuthorizationNeed(input.items);
  if (guarded.length === 0) return input.items;

  assertGuardedItemsHaveJobIds(guarded);

  const { data, error } = await supabase.functions.invoke(
    "mint-shopify-publish-authorization",
    { body: buildMintRequest({ organizationId: input.organizationId, guarded }) },
  );

  if (error) {
    throw new PublishAuthorizationError(
      `Could not obtain publish authorization: ${error.message}`,
    );
  }

  return resolveMintResponse({
    items: input.items,
    guarded,
    response: (data ?? {}) as MintResponse,
  });
}
