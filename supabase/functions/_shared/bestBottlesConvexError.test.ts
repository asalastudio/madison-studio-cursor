import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatConvexServerError,
  shouldFallbackCatalogHeroToPrimarySku,
} from "./bestBottlesConvexError.ts";

describe("formatConvexServerError", () => {
  it("unwraps dest Uncaught Error lines", () => {
    assert.equal(
      formatConvexServerError(
        "[Request ID: abc] Server Error\nUncaught Error: shopify_cdn_hero_image_url_required\n    at handler",
      ),
      "shopify_cdn_hero_image_url_required",
    );
  });

  it("names a missing public function", () => {
    assert.equal(
      formatConvexServerError(
        "[Request ID: abc] Server Error\nCould not find public function for 'products:setProductGroupHeroFromApprovedSku'.\n",
      ),
      "Best Bottles Convex is missing products:setProductGroupHeroFromApprovedSku",
    );
  });
});

describe("shouldFallbackCatalogHeroToPrimarySku", () => {
  it("falls back when the dedicated mutation is not deployed", () => {
    assert.equal(
      shouldFallbackCatalogHeroToPrimarySku(
        "[Request ID: abc] Server Error\nCould not find public function for 'products:setProductGroupHeroFromApprovedSku'.\n",
      ),
      true,
    );
  });

  it("falls back on production's bare Server Error wrapper", () => {
    assert.equal(
      shouldFallbackCatalogHeroToPrimarySku("[Request ID: 65b2997eb4ddf59a0] Server Error"),
      true,
    );
  });

  it("does not fall back for a named dedicated-mutation rejection", () => {
    assert.equal(
      shouldFallbackCatalogHeroToPrimarySku(
        "[Request ID: abc] Server Error\nUncaught Error: approved_sku_shopify_image_not_synced\n",
      ),
      false,
    );
  });
});
