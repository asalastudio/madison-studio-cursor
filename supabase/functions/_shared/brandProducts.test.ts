import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { flattenBrandProduct, legacyToBrandProductRow, upsertBrandProducts } from "./brandProducts";

const ORG = "00000000-0000-0000-0000-00000000000a";

describe("legacyToBrandProductRow", () => {
  it("packs a Shopify legacy object into org_id/product_id/specs/metadata/images", () => {
    const row = legacyToBrandProductRow(ORG, "shopify", "123", {
      organization_id: ORG, name: "Attar 12ml", handle: "attar-12ml", sku: "AT-12", price: 49,
      shopify_product_id: "123", description: "desc",
      images: [{ src: "https://cdn/x.jpg" }, { src: "https://cdn/y.jpg" }], featured_image_url: "https://cdn/x.jpg",
    });
    assert.equal(row.org_id, ORG);
    assert.equal(row.product_id, "shopify:123");
    assert.equal(row.name, "Attar 12ml");
    assert.deepEqual(row.specs, { sku: "AT-12", price: 49 });
    assert.deepEqual(row.images, ["https://cdn/x.jpg", "https://cdn/y.jpg"]);
    assert.equal(row.metadata.source, "shopify");
    assert.equal(row.metadata.handle, "attar-12ml");
    assert.equal("organization_id" in row, false);
    assert.equal("organization_id" in row.metadata, false);
  });
  it("parses Etsy's JSON-string variants/images", () => {
    const row = legacyToBrandProductRow(ORG, "etsy", "9", {
      name: "Ring", variants: JSON.stringify([{ sku: "R1" }]), images: JSON.stringify([{ src: "https://e/1.jpg" }]),
    });
    assert.deepEqual(row.specs.variants, [{ sku: "R1" }]);
    assert.deepEqual(row.images, ["https://e/1.jpg"]);
  });
});

describe("flattenBrandProduct", () => {
  it("exposes legacy fields for readers", () => {
    const flat = flattenBrandProduct({ id: "p", org_id: ORG, name: "N", specs: { sku: "S", collection: "C" }, metadata: { description: "D" }, images: ["u"] });
    assert.equal(flat.organization_id, ORG);
    assert.equal(flat.sku, "S");
    assert.equal(flat.collection, "C");
    assert.equal(flat.description, "D");
    assert.equal(flat.featured_image_url, "u");
  });
});

describe("upsertBrandProducts", () => {
  it("queries by org_id, upserts on (org_id, product_id) and keeps long descriptions", async () => {
    const calls: any[] = [];
    const longDesc = "x".repeat(60);
    const client = {
      from(table: string) {
        assert.equal(table, "brand_products");
        const q: any = {
          select: () => q,
          eq: (c: string, v: string) => { calls.push(["eq", c, v]); return q; },
          in: async () => ({ data: [{ product_id: "shopify:1", metadata: { description: longDesc, note: "manual" } }], error: null }),
          upsert: async (rows: any[], opts: any) => { calls.push(["upsert", rows, opts]); return { error: null }; },
        };
        return q;
      },
    };
    const rows = [
      legacyToBrandProductRow(ORG, "shopify", "1", { name: "A", description: "short" }),
      legacyToBrandProductRow(ORG, "shopify", "2", { name: "B" }),
    ];
    const res = await upsertBrandProducts(client, ORG, rows);
    assert.deepEqual(res, { inserted: 1, updated: 1 });
    assert.deepEqual(calls[0], ["eq", "org_id", ORG]);
    const [, sent, opts] = calls[1];
    assert.equal(opts.onConflict, "org_id,product_id");
    assert.equal(sent[0].metadata.description, longDesc);
    assert.equal(sent[0].metadata.note, "manual");
  });
});
