import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
  buildStagedUploadsCreateInput,
  SHOPIFY_STAGED_UPLOAD_MAX_BYTES,
  shouldStageShopifyImageUpload,
  stagedUploadFilename,
} from "./shopifyStagedUpload.ts";

describe("Shopify staged upload plan", () => {
  it("stages every public https image so Shopify never fetches Madison storage", () => {
    assert.equal(
      shouldStageShopifyImageUpload(
        "https://likkskifwsrvszxdvufw.supabase.co/storage/v1/object/public/generated-images/hero.png",
      ),
      true,
    );
    assert.equal(shouldStageShopifyImageUpload("http://insecure.example/hero.png"), false);
    assert.equal(shouldStageShopifyImageUpload(""), false);
  });

  it("names the staged file from the SKU and source extension", () => {
    assert.equal(
      stagedUploadFilename(
        "https://example.com/paper-doll/master_rigged_1.png",
        "GB-CYL-CLR-5ML-SPR-SBLK",
      ),
      "GB-CYL-CLR-5ML-SPR-SBLK.png",
    );
  });

  it("builds a PRODUCT_IMAGE staged-upload input from downloaded bytes", () => {
    assert.deepEqual(
      buildStagedUploadsCreateInput({
        imageUrl:
          "https://likkskifwsrvszxdvufw.supabase.co/storage/v1/object/public/generated-images/hero.png",
        sku: "GB-CYL-CLR-5ML-SPR-SBLK",
        fileSize: 845725,
      }),
      {
        resource: "PRODUCT_IMAGE",
        filename: "GB-CYL-CLR-5ML-SPR-SBLK.png",
        mimeType: "image/png",
        httpMethod: "POST",
        fileSize: "845725",
      },
    );
  });

  it("rejects empty or oversized downloads before Shopify is called", () => {
    assert.throws(
      () =>
        buildStagedUploadsCreateInput({
          imageUrl: "https://example.com/hero.png",
          sku: "SKU",
          fileSize: 0,
        }),
      /non-zero size/i,
    );
    assert.throws(
      () =>
        buildStagedUploadsCreateInput({
          imageUrl: "https://example.com/hero.png",
          sku: "SKU",
          fileSize: SHOPIFY_STAGED_UPLOAD_MAX_BYTES + 1,
        }),
      /rejected/i,
    );
  });
});

describe("push-shopify-product-images staged ingest", () => {
  it("uploads image bytes through stagedUploadsCreate instead of originalSource URL fetch", async () => {
    const source = await readFile(
      new URL("../push-shopify-product-images/index.ts", import.meta.url),
      "utf8",
    );
    assert.match(source, /stagedUploadsCreate/);
    assert.match(source, /buildStagedUploadsCreateInput/);
    assert.match(source, /shouldStageShopifyImageUpload/);
    assert.match(source, /AbortSignal/);
    assert.match(
      source,
      /createProductMedia\([\s\S]{0,200}sku/,
    );
  });
});
