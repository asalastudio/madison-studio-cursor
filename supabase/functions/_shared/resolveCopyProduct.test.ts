import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  fallbackSemanticProductContext,
  normalizeProductRecordForCopy,
  resolveCopyProduct,
  semanticCopyProduct,
  type CopyProductTable,
  type FetchOrgProduct,
} from "./resolveCopyProduct.ts";

const ORG = "4ab1ac72-cd7e-4faf-9152-5aa5f2862411";
const HUB_ID = "hub-slim-atomizer";

const slimAtomizerHub = {
  id: HUB_ID,
  organization_id: ORG,
  name: "Slim Atomizer",
  category: "Packaging",
  product_type: "Atomizer",
  short_description: "A slim glass atomizer for fragrance sampling.",
  long_description: "Travel-size spray bottle with a fine mist pump.",
  tagline: "Precision mist in a pocket bottle",
  collections: ["Travel"],
  key_benefits: ["portable", "refillable"],
  brand_voice_notes: "industrial, precise, not perfume-poetic",
  lighting_mood: "studio key light",
  metadata: {
    capacity_ml: 8,
    top_notes: "should-not-leak-unless-semantic",
    best_bottles: {
      family: "Atomizer",
      capacityMl: 8,
      material: "Glass",
      neckThread: "15/415",
      applicator: "fine mist pump",
    },
    bottle_specs: {
      productGroup: { family: "Atomizer" },
      capacity: { ml: 8, display: "8 ml" },
      material: { primary: "Glass" },
      neck: { finish_code: "15/415" },
      container: { applicators: ["fine mist pump"] },
      dimensions: { unit: "mm", height_without_cap: 78, diameter: 18 },
    },
  },
};

const circleLotionPumpHub = {
  id: "hub-circle-100-lotion-pump",
  organization_id: ORG,
  name: "Circle 100 ml clear lotion pump with overcap",
  category: "Glass Bottle",
  product_type: "Circle",
  lighting_mood: "soft overhead",
  metadata: {
    best_bottles: {
      family: "Circle",
      capacityMl: 100,
      neckThread: "18-415",
      applicator: "Lotion Pump",
      canonicalColor: "Clear",
      material: "Glass",
      skus: [{
        capStyle: "Pump",
        capColor: "Clear Overcap",
        heightWithoutCap: 105,
        diameter: 35,
      }],
    },
    bottle_specs: {
      productGroup: { family: "Circle" },
      capacity: { ml: 100, display: "100 ml" },
      neck: { finish_code: "18-415" },
      material: { primary: "Glass" },
      container: {
        applicators: ["Lotion Pump"],
        capStyles: ["Pump"],
        capColors: ["Clear Overcap"],
      },
      color: { canonical: "Clear" },
      dimensions: { unit: "mm", height_without_cap: 105, diameter: 35 },
    },
  },
};

function mockFetch(
  tables: Partial<Record<CopyProductTable, Record<string, unknown> | null>>,
): { fetchProduct: FetchOrgProduct; calls: Array<[CopyProductTable, string, string]> } {
  const calls: Array<[CopyProductTable, string, string]> = [];
  return {
    calls,
    fetchProduct: async (table, productId, organizationId) => {
      calls.push([table, productId, organizationId]);
      if (tables[table] === undefined) return null;
      return tables[table] ?? null;
    },
  };
}

describe("normalizeProductRecordForCopy", () => {
  it("maps Product Hub narrative columns onto semantic field names", () => {
    const normalized = normalizeProductRecordForCopy(slimAtomizerHub);
    assert.ok(normalized);
    assert.equal(normalized.name, "Slim Atomizer");
    assert.equal(normalized.collection, "Travel");
    assert.equal(normalized.brand_story, "Travel-size spray bottle with a fine mist pump.");
    assert.equal(normalized.usp, "Precision mist in a pocket bottle");
    assert.equal(normalized.tone, "industrial, precise, not perfume-poetic");
    assert.equal(normalized.emotional_benefits, "portable; refillable");
    assert.match(String(normalized.packaging_facts), /Capacity: 8 ml/);
    assert.match(String(normalized.packaging_facts), /Material: Glass/);
    assert.doesNotMatch(String(normalized.packaging_facts), /studio key light/);
  });
});

describe("semanticCopyProduct", () => {
  it("keeps packaging specs and drops visual-only fields like lighting", () => {
    const semantic = semanticCopyProduct(slimAtomizerHub);
    assert.ok(semantic);
    assert.equal(semantic.name, "Slim Atomizer");
    assert.equal(semantic.category, "Packaging");
    assert.equal(semantic.product_type, "Atomizer");
    assert.equal(semantic.collection, "Travel");
    assert.match(semantic.packaging_facts, /Family: Atomizer/);
    assert.match(semantic.packaging_facts, /Capacity: 8 ml/);
    assert.match(semantic.packaging_facts, /Neck finish: 15\/415/);
    assert.match(semantic.packaging_facts, /Applicator\/closure: fine mist pump/);
    assert.match(semantic.packaging_facts, /Dimensions: 78 mm height without cap × 18 mm diameter/);
    assert.equal(semantic.lighting_mood, undefined);
    assert.equal(semantic.capacity_ml, undefined);
    assert.equal(semantic.short_description, undefined);
    assert.equal(semantic.metadata, undefined);
  });
});

describe("resolveCopyProduct", () => {
  it("resolves product_hubs first, org-scoped, then filters via productFieldFilters", async () => {
    const { fetchProduct, calls } = mockFetch({
      product_hubs: slimAtomizerHub,
      brand_products: {
        id: HUB_ID,
        organization_id: ORG,
        name: "Legacy fragrance SKU",
        category: "personal_fragrance",
        top_notes: "amber, oud",
      },
    });

    const result = await resolveCopyProduct({
      productId: HUB_ID,
      organizationId: ORG,
      clientProductData: { name: "stale client name" },
      fetchProduct,
    });

    assert.equal(result.source, "product_hubs");
    assert.ok(result.product);
    assert.equal(result.product.name, "Slim Atomizer");
    assert.equal(result.product.product_type, "Atomizer");
    assert.equal(result.product.category, "Packaging");
    assert.deepEqual(calls, [["product_hubs", HUB_ID, ORG]]);
  });

  it("falls back to brand_products when the hub row is missing", async () => {
    const { fetchProduct, calls } = mockFetch({
      product_hubs: null,
      brand_products: {
        id: HUB_ID,
        organization_id: ORG,
        name: "Rose Attar",
        category: "personal_fragrance",
        product_type: "Attär",
        top_notes: "rose, saffron",
        lighting_mood: "golden hour",
      },
    });

    const result = await resolveCopyProduct({
      productId: HUB_ID,
      organizationId: ORG,
      fetchProduct,
    });

    assert.equal(result.source, "brand_products");
    assert.ok(result.product);
    assert.equal(result.product.name, "Rose Attar");
    assert.equal(result.product.top_notes, "rose, saffron");
    assert.equal(result.product.lighting_mood, undefined);
    assert.equal(result.product.packaging_facts, undefined);
    assert.deepEqual(calls, [
      ["product_hubs", HUB_ID, ORG],
      ["brand_products", HUB_ID, ORG],
    ]);
  });

  it("uses client productData when neither table has the id", async () => {
    const { fetchProduct, calls } = mockFetch({
      product_hubs: null,
      brand_products: null,
    });

    const result = await resolveCopyProduct({
      productId: HUB_ID,
      organizationId: ORG,
      clientProductData: slimAtomizerHub,
      fetchProduct,
    });

    assert.equal(result.source, "client");
    assert.ok(result.product);
    assert.equal(result.product.name, "Slim Atomizer");
    assert.deepEqual(calls, [
      ["product_hubs", HUB_ID, ORG],
      ["brand_products", HUB_ID, ORG],
    ]);
  });

  it("does not query when product_id or organization_id is missing", async () => {
    const { fetchProduct, calls } = mockFetch({});
    const result = await resolveCopyProduct({
      productId: HUB_ID,
      organizationId: null,
      clientProductData: slimAtomizerHub,
      fetchProduct,
    });

    assert.equal(result.source, "client");
    assert.equal(result.product?.name, "Slim Atomizer");
    assert.deepEqual(calls, []);
  });
});

describe("fallbackSemanticProductContext", () => {
  it("names a packaging SKU so copy cannot invent an amber attar", () => {
    const context = fallbackSemanticProductContext(semanticCopyProduct(slimAtomizerHub));
    assert.match(context, /Slim Atomizer/);
    assert.match(context, /Packaging/);
    assert.match(context, /PACKAGING FACTS \(MANDATORY\)/);
    assert.match(context, /Capacity: 8 ml/);
    assert.match(context, /Do NOT invent or substitute capacity, closure, material, or dimensions/);
    assert.doesNotMatch(context, /amber attar/i);
    assert.doesNotMatch(context, /lighting_mood/);
    assert.doesNotMatch(context, /studio key light/);
  });

  it("prints mandatory packaging facts for the Circle 100 ml lotion pump", () => {
    const context = fallbackSemanticProductContext(semanticCopyProduct(circleLotionPumpHub));
    assert.match(context, /Circle 100 ml clear lotion pump with overcap/);
    assert.match(context, /Family: Circle/);
    assert.match(context, /Capacity: 100 ml/);
    assert.match(context, /Material: Glass/);
    assert.match(context, /Color: Clear/);
    assert.match(context, /Neck finish: 18-415/);
    assert.match(context, /Applicator\/closure: Lotion Pump/);
    assert.match(context, /Cap style: Pump/);
    assert.match(context, /Cap color: Clear Overcap/);
    assert.match(context, /Dimensions: 105 mm height without cap × 35 mm diameter/);
    assert.match(context, /Do NOT invent or substitute capacity, closure, material, or dimensions/);
    assert.doesNotMatch(context, /soft overhead/);
    assert.doesNotMatch(context, /lighting_mood/);
  });
});
