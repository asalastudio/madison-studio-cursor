import assert from "node:assert/strict";
import test from "node:test";
import type { PipelineSkuJob } from "./bestBottlesPipeline";
import {
  buildBestBottlesCatalogHeroPushItem,
  expectedBestBottlesVisualIdentityForProduct,
} from "./bestBottlesShopifyPushIdentity";

function approvedPrimaryJob(
  overrides: Partial<PipelineSkuJob> = {},
): PipelineSkuJob {
  return {
    id: "job-primary",
    organization_id: "org-1",
    pipeline_group_id: "group-1",
    product_group_slug: "cylinder-9ml-clear-17-415-rollon",
    product_group_display_name: "9 ml Clear Cylinder Roll-On",
    family: "Cylinder",
    catalog_reference_pages: null,
    category: "Glass Bottle",
    capacity_ml: 9,
    applicator: "Roll-On",
    canonical_color: "Clear",
    product_id: null,
    source_id: null,
    grace_sku: "GB-CYL-CLR-9ML-ROL-BLK",
    website_sku: "GBCylClr9RollBlk",
    shopify_sku: "GBCylClr9RollBlk",
    expected_canonical_filename: null,
    best_reference_candidate_path: null,
    coverage_status: null,
    reference_source: "manual",
    reference_source_path: null,
    reference_source_url: null,
    reference_imported_at: null,
    reference_issue: null,
    status: "approved",
    generated_image_id: "image-1",
    generated_image_url: "https://cdn.example.com/image-1.png",
    approved_image_id: "image-1",
    approved_image_url: "https://cdn.example.com/image-1.png",
    approved_at: "2026-09-17T19:00:00.000Z",
    approved_by: "user-1",
    shopify_product_id: null,
    shopify_variant_id: null,
    shopify_media_id: null,
    shopify_image_url: null,
    shopify_pushed_at: null,
    convex_synced_at: null,
    last_error: null,
    created_at: "2026-09-17T18:00:00.000Z",
    updated_at: "2026-09-17T19:00:00.000Z",
    ...overrides,
  };
}

test("resolves Diva tassel accessory identity from website SKU", () => {
  const identity = expectedBestBottlesVisualIdentityForProduct({
    graceSku: "GB-DVA-CLR-46ML-T-28",
    websiteSku: "GBDivaFrst46AnSpTslWht",
    family: "Diva",
    category: "Glass Bottle",
    color: "Clear",
    applicator: "Antique bulb sprayer with tassel",
  });

  assert.equal(identity, "White");
});

test("resolves Diva reducer leather identity from website SKU", () => {
  const identity = expectedBestBottlesVisualIdentityForProduct({
    graceSku: "GB-DVA-CLR-46ML-T-30",
    websiteSku: "GBDivaFrst46RdcrBlkLthr",
    family: "Diva",
    category: "Glass Bottle",
    color: "Clear",
    applicator: "Reducer",
  });

  assert.equal(identity, "Black Leather");
});

test("resolves plain glass bottle identity from glass color", () => {
  const identity = expectedBestBottlesVisualIdentityForProduct({
    graceSku: "GB-DVA-CLR-46ML-01",
    websiteSku: "GBDivaClr46",
    family: "Diva",
    category: "Glass Bottle",
    color: "Clear",
    applicator: "Bottle only",
  });

  assert.equal(identity, "Clear");
});

test("builds a catalog hero push item from an exact approved job in the group", () => {
  const pushItem = buildBestBottlesCatalogHeroPushItem({
    job: approvedPrimaryJob(),
    imageId: "image-1",
    imageUrl: "https://cdn.example.com/image-1.png",
    productGroupSlug: "cylinder-9ml-clear-17-415-rollon",
  });

  assert.equal(pushItem.pipelineSkuJobId, "job-primary");
  assert.equal(pushItem.imageId, "image-1");
  assert.equal(pushItem.sku, "GBCylClr9RollBlk");
});

test("rejects a catalog hero that is not approved on the selected job", () => {
  assert.throws(
    () =>
      buildBestBottlesCatalogHeroPushItem({
        job: approvedPrimaryJob({ status: "generated" }),
        imageId: "image-1",
        imageUrl: "https://cdn.example.com/image-1.png",
        productGroupSlug: "cylinder-9ml-clear-17-415-rollon",
      }),
    /must be approved/i,
  );
});

test("allows a non-primary exact SKU job when it belongs to the group", () => {
  const pushItem = buildBestBottlesCatalogHeroPushItem({
    job: approvedPrimaryJob({
      website_sku: "GBCylClr9RollGold",
      grace_sku: "GB-CYL-CLR-9ML-ROL-GLD",
      shopify_sku: "GB-CYL-CLR-9ML-ROL-GLD",
    }),
    imageId: "image-1",
    imageUrl: "https://cdn.example.com/image-1.png",
    productGroupSlug: "cylinder-9ml-clear-17-415-rollon",
  });

  assert.equal(pushItem.websiteSku, "GBCylClr9RollGold");
  assert.equal(pushItem.graceSku, "GB-CYL-CLR-9ML-ROL-GLD");
});

test("rejects an exact SKU job from a different group", () => {
  assert.throws(
    () =>
      buildBestBottlesCatalogHeroPushItem({
        job: approvedPrimaryJob({
          product_group_slug: "cylinder-5ml-clear-13-415-spray",
        }),
        imageId: "image-1",
        imageUrl: "https://cdn.example.com/image-1.png",
        productGroupSlug: "cylinder-9ml-clear-17-415-rollon",
      }),
    /does not belong/i,
  );
});
