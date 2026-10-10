import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { flattenBrandProduct, formToBrandProductRow, legacyToBrandProductRow, manualProductId, upsertBrandProducts } from "./brandProducts";

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

function fakeClient(existing: any[]) {
  const calls: any[] = [];
  const client = {
    from(table: string) {
      assert.equal(table, "brand_products");
      const q: any = {
        select: () => q,
        eq: async (c: string, v: string) => { calls.push(["eq", c, v]); return { data: existing, error: null }; },
        upsert: async (rows: any[], opts: any) => { calls.push(["upsert", rows, opts]); return { error: null }; },
      };
      return q;
    },
  };
  return { client, calls };
}

describe("upsertBrandProducts", () => {
  it("scopes by org_id and upserts on (org_id, product_id)", async () => {
    const { client, calls } = fakeClient([]);
    const res = await upsertBrandProducts(client, ORG, [legacyToBrandProductRow(ORG, "shopify", "1", { name: "A" })]);
    assert.deepEqual(res, { inserted: 1, updated: 0 });
    assert.deepEqual(calls[0], ["eq", "org_id", ORG]);
    assert.equal(calls[1][2].onConflict, "org_id,product_id");
  });

  it("re-sync keeps manually set collection, scent family, tone and a long description", async () => {
    const longDesc = "x".repeat(60);
    const { client, calls } = fakeClient([{
      product_id: "shopify:1", name: "A",
      specs: { collection: "Humanities", price: 10 },
      metadata: { scent_family: "warm", tone: "elegant", description: longDesc, note: "manual" },
    }]);
    const incoming = legacyToBrandProductRow(ORG, "shopify", "1", {
      name: "A", collection: "Uncategorized", price: 12, scent_family: "fresh", tone: null, description: "short",
    });
    const res = await upsertBrandProducts(client, ORG, [incoming]);
    assert.deepEqual(res, { inserted: 0, updated: 1 });
    const sent = calls[1][1][0];
    assert.equal(sent.specs.collection, "Humanities");
    assert.equal(sent.specs.price, 12, "commerce fields still sync");
    assert.equal(sent.metadata.scent_family, "warm");
    assert.equal(sent.metadata.tone, "elegant");
    assert.equal(sent.metadata.description, longDesc);
    assert.equal(sent.metadata.note, "manual");
    assert.equal("copy_hints" in sent, false, "copy_hints untouched");
  });

  it("fills preserved fields when they are empty", async () => {
    const { client, calls } = fakeClient([{ product_id: "shopify:1", name: "A", specs: { collection: "" }, metadata: {} }]);
    await upsertBrandProducts(client, ORG, [legacyToBrandProductRow(ORG, "shopify", "1", { name: "A", collection: "New" })]);
    assert.equal(calls[1][1][0].specs.collection, "New");
  });

  it("first sync adopts an existing manual/CSV product by handle, then by name (no duplicate)", async () => {
    const { client, calls } = fakeClient([
      { product_id: "manual:rose-attar", name: "Rose Attar", specs: {}, metadata: { handle: "rose-attar", tone: "soft" } },
      { product_id: "csv:oud", name: "Oud Noir", specs: {}, metadata: {} },
    ]);
    const res = await upsertBrandProducts(client, ORG, [
      legacyToBrandProductRow(ORG, "shopify", "11", { name: "Rose Attar 12ml", handle: "rose-attar" }),
      legacyToBrandProductRow(ORG, "shopify", "12", { name: "oud noir " }),
      legacyToBrandProductRow(ORG, "shopify", "13", { name: "Brand New" }),
    ]);
    assert.deepEqual(res, { inserted: 1, updated: 2 });
    const ids = calls[1][1].map((r: any) => r.product_id);
    assert.deepEqual(ids, ["manual:rose-attar", "csv:oud", "shopify:13"]);
    assert.equal(calls[1][1][0].metadata.tone, "soft");
    assert.equal(calls[1][1][0].metadata.shopify_product_id ?? "11", "11");
  });

  it("two incoming products never adopt the same existing row", async () => {
    const { client, calls } = fakeClient([{ product_id: "manual:a", name: "A", specs: {}, metadata: {} }]);
    const res = await upsertBrandProducts(client, ORG, [
      legacyToBrandProductRow(ORG, "shopify", "1", { name: "A" }),
      legacyToBrandProductRow(ORG, "etsy", "2", { name: "A" }),
    ]);
    assert.deepEqual(res, { inserted: 1, updated: 1 });
    assert.deepEqual(calls[1][1].map((r: any) => r.product_id), ["manual:a", "etsy:2"]);
  });
});

describe("form rows (UI create/edit, CSV import)", () => {
  it("maps legacy form fields into specs/metadata and drops empties", () => {
    const row = formToBrandProductRow(ORG, manualProductId("Rose Attar"), {
      name: "Rose Attar", category: "personal_fragrance", collection: "Humanities", tone: "", top_notes: "rose",
    });
    assert.equal(row.product_id, "manual:rose-attar");
    assert.equal(row.org_id, ORG);
    assert.deepEqual(row.specs, { category: "personal_fragrance", collection: "Humanities" });
    assert.equal(row.metadata.top_notes, "rose");
    assert.equal("tone" in row.metadata, false);
  });
  it("manualProductId prefers the handle", () => {
    assert.equal(manualProductId("Anything", "my-handle"), "manual:my-handle");
  });
});
