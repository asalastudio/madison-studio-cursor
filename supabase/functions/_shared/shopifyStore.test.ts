import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BEST_BOTTLES_ORG_ID } from "./orgFeatures.ts";
import {
  normalizeShopDomain,
  pickShopifyStore,
  resolveListingShopifyProductId,
} from "./shopifyStore.ts";

const OTHER_ORG = "00000000-0000-4000-8000-000000000000";
const connection = {
  shop_domain: "https://tenant.myshopify.com/admin",
  access_token_encrypted: "enc",
  access_token_iv: "iv",
};

describe("shopifyStore", () => {
  it("normalizes shop domains to host only", () => {
    assert.equal(normalizeShopDomain("https://bestbottles.myshopify.com/admin"), "bestbottles.myshopify.com");
    assert.equal(normalizeShopDomain("bestbottles.myshopify.com"), "bestbottles.myshopify.com");
  });

  it("prefers the org connection over the env token", () => {
    const picked = pickShopifyStore({
      organizationId: OTHER_ORG,
      connection,
      envToken: "env-token",
      envDomain: "env.myshopify.com",
    });
    assert.deepEqual(picked, {
      source: "connection",
      shopDomain: "tenant.myshopify.com",
      access_token_encrypted: "enc",
      access_token_iv: "iv",
    });
  });

  it("allows the env token only for the Best Bottles org", () => {
    const bb = pickShopifyStore({
      organizationId: BEST_BOTTLES_ORG_ID,
      connection: null,
      envToken: "env-token",
      envDomain: "bb.myshopify.com",
    });
    assert.deepEqual(bb, {
      source: "env",
      shopDomain: "bb.myshopify.com",
      accessToken: "env-token",
    });

    const other = pickShopifyStore({
      organizationId: OTHER_ORG,
      connection: null,
      envToken: "env-token",
      envDomain: "bb.myshopify.com",
    });
    assert.equal(other.source, "none");
  });

  it("rejects a shopify_product_id that does not match the listing", () => {
    assert.deepEqual(resolveListingShopifyProductId("111", undefined), {
      ok: true,
      shopifyProductId: "111",
    });
    assert.deepEqual(resolveListingShopifyProductId("111", "111"), {
      ok: true,
      shopifyProductId: "111",
    });
    assert.equal(resolveListingShopifyProductId("111", "222").ok, false);
    assert.equal(resolveListingShopifyProductId(null, "222").ok, false);
  });
});
