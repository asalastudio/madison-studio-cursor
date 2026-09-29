import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveSkuFromCatalog,
  toShopifyGid,
  type SkuCatalogSnapshot,
} from "./skuResolution";

const empty: SkuCatalogSnapshot = {
  productHubs: [],
  productVariants: [],
  brandProducts: [],
  pipelineJobs: [],
};

describe("SKU resolution", () => {
  it("prefers a unique product_hubs hit over later sources", () => {
    const result = resolveSkuFromCatalog("GB-CYL-50-CLR", {
      ...empty,
      productHubs: [
        {
          id: "hub-1",
          name: "Cylinder 50 ml Clear",
          sku: "GB-CYL-50-CLR",
          hero_image_external_url: "https://example.com/cyl.png",
          shopify_product_id: "111",
        },
      ],
      brandProducts: [
        { id: "legacy-1", name: "Legacy Cylinder", sku: "GB-CYL-50-CLR" },
      ],
    });
    assert.equal(result.status, "resolved");
    if (result.status !== "resolved") return;
    assert.equal(result.hit.via, "product_hubs");
    assert.equal(result.hit.productHubId, "hub-1");
    assert.equal(result.hit.shopifyProductGid, "gid://shopify/Product/111");
  });

  it("matches a variant SKU inside product_hubs.variants jsonb", () => {
    const result = resolveSkuFromCatalog("gb-cyl-50-amb", {
      ...empty,
      productHubs: [
        {
          id: "hub-2",
          name: "Cylinder 50 ml",
          sku: "GROUP-CYLINDER-50ML-AMB",
          variants: [{ sku: "GB-CYL-50-AMB", shopify_variant_id: "999" }],
        },
      ],
    });
    assert.equal(result.status, "resolved");
    if (result.status !== "resolved") return;
    assert.equal(result.hit.via, "product_hubs");
    assert.equal(result.hit.shopifyVariantGid, "gid://shopify/ProductVariant/999");
  });

  it("falls through to product_variants when hubs miss", () => {
    const result = resolveSkuFromCatalog("SKU-VARIANT-1", {
      ...empty,
      productVariants: [
        {
          id: "var-1",
          product_id: "hub-9",
          product_hub_id: "hub-9",
          sku: "SKU-VARIANT-1",
          name: "30ml",
          product_name: "Serum",
          shopify_variant_id: "gid://shopify/ProductVariant/22",
        },
      ],
    });
    assert.equal(result.status, "resolved");
    if (result.status !== "resolved") return;
    assert.equal(result.hit.via, "product_variants");
    assert.equal(result.hit.productName, "Serum");
  });

  it("reads legacy brand_products sku and variants", () => {
    const result = resolveSkuFromCatalog("OLD-SKU", {
      ...empty,
      brandProducts: [
        {
          id: "bp-1",
          name: "Old product",
          variants: [{ sku: "OLD-SKU" }],
          images: ["https://example.com/old.png"],
        },
      ],
    });
    assert.equal(result.status, "resolved");
    if (result.status !== "resolved") return;
    assert.equal(result.hit.via, "brand_products");
    assert.equal(result.hit.brandProductId, "bp-1");
  });

  it("matches Best Bottles pipeline grace / website / shopify SKUs", () => {
    const result = resolveSkuFromCatalog("GBCylClr50", {
      ...empty,
      pipelineJobs: [
        {
          id: "job-1",
          grace_sku: "GB-CYL-CLR-50ML",
          website_sku: "GBCylClr50",
          shopify_sku: "BB-CYL-50",
          product_group_display_name: "Cylinder 50 ml Clear",
        },
      ],
    });
    assert.equal(result.status, "resolved");
    if (result.status !== "resolved") return;
    assert.equal(result.hit.via, "bb_pipeline_sku_jobs");
  });

  it("reports ambiguous when two hubs share the SKU", () => {
    const result = resolveSkuFromCatalog("DUP-1", {
      ...empty,
      productHubs: [
        { id: "a", name: "A", sku: "DUP-1" },
        { id: "b", name: "B", sku: "DUP-1" },
      ],
    });
    assert.equal(result.status, "ambiguous");
  });

  it("returns unresolved when nothing matches", () => {
    const result = resolveSkuFromCatalog("MISSING", empty);
    assert.equal(result.status, "unresolved");
  });

  it("builds Shopify GIDs without double-prefixing", () => {
    assert.equal(toShopifyGid("Product", "123"), "gid://shopify/Product/123");
    assert.equal(
      toShopifyGid("Product", "gid://shopify/Product/123"),
      "gid://shopify/Product/123",
    );
    assert.equal(toShopifyGid("Product", ""), null);
  });
});
