import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyAuthorizations,
  assertGuardedItemsHaveJobIds,
  buildMintRequest,
  isCylinderProductSku,
  partitionByAuthorizationNeed,
  PublishAuthorizationError,
  requiresPublishAuthorization,
  resolveMintResponse,
} from "./bestBottlesShopifyPublishAuthorization.ts";
import type { BestBottlesShopifyPushItem } from "./bestBottlesShopifyPushIdentity.ts";
// Test-only cross-import: the app build excludes supabase/functions, but the
// client-side classifier must agree with the guard that actually enforces.
import { isCylinderProductSku as edgeIsCylinderProductSku } from "../../supabase/functions/_shared/shopifyPublishGuard.ts";

function item(overrides: Partial<BestBottlesShopifyPushItem> = {}): BestBottlesShopifyPushItem {
  return {
    pipelineSkuJobId: "job-1",
    imageId: "image-1",
    imageUrl: "https://cdn.example.com/a.png",
    sku: "GBCyl100SpryShnBlk",
    websiteSku: "GBCyl100SpryShnBlk",
    graceSku: "GB-CYL-CLR-100ML-SPR-SBLK",
    altText: "Cylinder 100ml",
    ...overrides,
  };
}

const SKUS = [
  "GBCyl100SpryShnBlk",
  "GBCyl50AnSpTslGl",
  "GBTallCyl30Rol",
  "GB-CYL-CLR-100ML-SPR-SBLK",
  "GB-TCYL-CLR-30ML-ROL-GLD",
  "GBBos30DrpBlk",
  "GB-BOS-AMB-30ML-DRP-BLK",
  "GBEmp50SpryGl",
  "",
  "   ",
  "gbcyl9sprygld",
  "NOT-A-SKU",
];

describe("isCylinderProductSku", () => {
  it("classifies identically to the edge guard for every sample SKU", () => {
    for (const sku of SKUS) {
      assert.equal(
        isCylinderProductSku(sku),
        edgeIsCylinderProductSku(sku),
        `client and edge disagree on "${sku}"`,
      );
    }
  });

  it("matches both the website and grace SKU shapes, case-insensitively", () => {
    assert.equal(isCylinderProductSku("GBCyl100SpryShnBlk"), true);
    assert.equal(isCylinderProductSku("GBTallCyl30Rol"), true);
    assert.equal(isCylinderProductSku("GB-CYL-CLR-100ML-SPR-SBLK"), true);
    assert.equal(isCylinderProductSku("GB-TCYL-CLR-30ML-ROL-GLD"), true);
    assert.equal(isCylinderProductSku("gbcyl9sprygld"), true);
  });

  it("does not match other families", () => {
    assert.equal(isCylinderProductSku("GBBos30DrpBlk"), false);
    assert.equal(isCylinderProductSku("GB-BOS-AMB-30ML-DRP-BLK"), false);
    assert.equal(isCylinderProductSku("GBEmp50SpryGl"), false);
  });

  it("handles empty and whitespace input", () => {
    assert.equal(isCylinderProductSku(""), false);
    assert.equal(isCylinderProductSku("   "), false);
    assert.equal(isCylinderProductSku(null), false);
    assert.equal(isCylinderProductSku(undefined), false);
  });
});

describe("requiresPublishAuthorization", () => {
  it("is true when any identity field is a Cylinder SKU", () => {
    assert.equal(requiresPublishAuthorization(item()), true);
    assert.equal(
      requiresPublishAuthorization(
        item({ sku: "GBBos30DrpBlk", websiteSku: "GBBos30DrpBlk", graceSku: "GB-CYL-X" }),
      ),
      true,
    );
  });

  it("is false for a non-Cylinder product", () => {
    assert.equal(
      requiresPublishAuthorization(
        item({
          sku: "GBBos30DrpBlk",
          websiteSku: "GBBos30DrpBlk",
          graceSku: "GB-BOS-AMB-30ML-DRP-BLK",
        }),
      ),
      false,
    );
  });
});

describe("partitionByAuthorizationNeed", () => {
  it("splits guarded from unguarded items", () => {
    const cylinder = item();
    const boston = item({
      pipelineSkuJobId: "job-2",
      sku: "GBBos30DrpBlk",
      websiteSku: "GBBos30DrpBlk",
      graceSku: "GB-BOS-AMB-30ML-DRP-BLK",
    });

    const { guarded, unguarded } = partitionByAuthorizationNeed([cylinder, boston]);
    assert.deepEqual(guarded.map((entry) => entry.pipelineSkuJobId), ["job-1"]);
    assert.deepEqual(unguarded.map((entry) => entry.pipelineSkuJobId), ["job-2"]);
  });

  it("returns empty guarded list when nothing needs authorization", () => {
    const boston = item({
      sku: "GBBos30DrpBlk",
      websiteSku: "GBBos30DrpBlk",
      graceSku: "GB-BOS-AMB-30ML-DRP-BLK",
    });
    assert.deepEqual(partitionByAuthorizationNeed([boston]).guarded, []);
  });
});

describe("applyAuthorizations", () => {
  it("attaches the authorization id to the matching job", () => {
    const items = [item(), item({ pipelineSkuJobId: "job-2" })];
    const result = applyAuthorizations(items, [
      {
        authorizationId: "auth-1",
        pipelineSkuJobId: "job-1",
        generatedImageId: "image-1",
        expiresAt: "2026-09-11T19:00:00.000Z",
      },
    ]);

    assert.equal(result[0].publishAuthorizationId, "auth-1");
    assert.equal(result[1].publishAuthorizationId, undefined);
  });

  it("leaves items untouched when nothing was minted", () => {
    const items = [item()];
    assert.deepEqual(applyAuthorizations(items, []), items);
  });

  it("does not mutate the input items", () => {
    const items = [item()];
    applyAuthorizations(items, [
      {
        authorizationId: "auth-1",
        pipelineSkuJobId: "job-1",
        generatedImageId: "image-1",
        expiresAt: "2026-09-11T19:00:00.000Z",
      },
    ]);
    assert.equal(items[0].publishAuthorizationId, undefined);
  });
});

describe("buildMintRequest", () => {
  it("sends only the identity fields the guard compares", () => {
    const request = buildMintRequest({
      organizationId: "org-1",
      guarded: [item()],
    }) as { organizationId: string; items: Array<Record<string, unknown>> };

    assert.equal(request.organizationId, "org-1");
    assert.deepEqual(Object.keys(request.items[0]).sort(), [
      "graceSku",
      "imageId",
      "imageUrl",
      "pipelineSkuJobId",
      "sku",
      "websiteSku",
    ]);
  });
});

describe("assertGuardedItemsHaveJobIds", () => {
  it("passes when every guarded item carries a job id", () => {
    assert.doesNotThrow(() => assertGuardedItemsHaveJobIds([item()]));
  });

  it("throws when a job id is missing or blank", () => {
    assert.throws(
      () => assertGuardedItemsHaveJobIds([item({ pipelineSkuJobId: "" })]),
      PublishAuthorizationError,
    );
    assert.throws(
      () => assertGuardedItemsHaveJobIds([item({ pipelineSkuJobId: "   " })]),
      PublishAuthorizationError,
    );
  });
});

describe("resolveMintResponse", () => {
  const guarded = [item()];

  it("attaches the authorization when every guarded item is covered", () => {
    const result = resolveMintResponse({
      items: guarded,
      guarded,
      response: {
        authorizations: [
          {
            authorizationId: "auth-1",
            pipelineSkuJobId: "job-1",
            generatedImageId: "image-1",
            expiresAt: "2026-09-11T19:00:00.000Z",
          },
        ],
      },
    });
    assert.equal(result[0].publishAuthorizationId, "auth-1");
  });

  it("throws with the server reason when an item is rejected", () => {
    assert.throws(
      () =>
        resolveMintResponse({
          items: guarded,
          guarded,
          response: {
            authorizations: [],
            rejected: [
              {
                pipelineSkuJobId: "job-1",
                reason:
                  "Cylinder Shopify publish requires the exact approved generated image on the job.",
              },
            ],
          },
        }),
      /requires the exact approved generated image/,
    );
  });

  it("refuses a partial batch rather than pushing half of it", () => {
    const two = [item(), item({ pipelineSkuJobId: "job-2" })];
    assert.throws(
      () =>
        resolveMintResponse({
          items: two,
          guarded: two,
          response: {
            authorizations: [
              {
                authorizationId: "auth-1",
                pipelineSkuJobId: "job-1",
                generatedImageId: "image-1",
                expiresAt: "2026-09-11T19:00:00.000Z",
              },
            ],
          },
        }),
      /1 of 2 SKU\(s\) could not be authorized/,
    );
  });

  it("surfaces a top-level server error", () => {
    assert.throws(
      () =>
        resolveMintResponse({
          items: guarded,
          guarded,
          response: { error: "Not a member of this organization" },
        }),
      /Not a member of this organization/,
    );
  });
});
