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
  });
});

describe("semanticCopyProduct", () => {
  it("keeps semantic identity and drops visual/technical hub fields", () => {
    const semantic = semanticCopyProduct(slimAtomizerHub);
    assert.ok(semantic);
    assert.equal(semantic.name, "Slim Atomizer");
    assert.equal(semantic.category, "Packaging");
    assert.equal(semantic.product_type, "Atomizer");
    assert.equal(semantic.collection, "Travel");
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
    assert.doesNotMatch(context, /amber attar/i);
    assert.doesNotMatch(context, /lighting_mood/);
  });
});
