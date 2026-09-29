import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
  assertCylinderShopifyPublishAuthorized,
  type CylinderShopifyPublishGuardInput,
  executeCylinderShopifyGuardedMutation,
  isCylinderProductSku,
  isExactConfiguredServiceRoleToken,
} from "./shopifyPublishGuard.ts";

function input(
  overrides: Partial<CylinderShopifyPublishGuardInput> = {},
): CylinderShopifyPublishGuardInput {
  return {
    organizationId: "org-1",
    dryRun: false,
    isServiceRoleRequest: false,
    authenticatedUserId: "user-1",
    organizationMembershipVerified: true,
    now: "2026-07-14T14:30:00.000Z",
    item: {
      pipelineSkuJobId: "job-1",
      publishAuthorizationId: "authorization-1",
      imageId: "image-1",
      imageUrl: "https://images.example.com/image-1.png",
      sku: "GB-CYL-CLR-9ML-SPR-GLD",
      websiteSku: "GBCyl9SpryGl",
      graceSku: "GB-CYL-CLR-9ML-SPR-GLD",
    },
    trustedAuthorization: {
      id: "authorization-1",
      purpose: "shopify-product-image-publish",
      organizationId: "org-1",
      pipelineSkuJobId: "job-1",
      generatedImageId: "image-1",
      websiteSku: "GBCyl9SpryGl",
      graceSku: "GB-CYL-CLR-9ML-SPR-GLD",
      authorizedByUserId: "user-1",
      authorizedAt: "2026-07-14T14:00:00.000Z",
      expiresAt: "2026-07-14T15:00:00.000Z",
      consumedAt: null,
      singleUse: true,
    },
    job: {
      id: "job-1",
      organization_id: "org-1",
      family: "Cylinder",
      website_sku: "GBCyl9SpryGl",
      grace_sku: "GB-CYL-CLR-9ML-SPR-GLD",
      shopify_sku: "GB-CYL-CLR-9ML-SPR-GLD",
      status: "approved",
      generated_image_id: "image-1",
      generated_image_url: "https://images.example.com/image-1.png",
      approved_image_id: "image-1",
      approved_image_url: "https://images.example.com/image-1.png",
    },
    image: {
      id: "image-1",
      organization_id: "org-1",
      image_url: "https://images.example.com/image-1.png",
      library_tags: ["status:approved-keep"],
    },
    ...overrides,
  };
}

describe("Cylinder Shopify server-side publish guard", () => {
  it("is enforced by the edge function before the first Shopify media mutation", async () => {
    const source = await readFile(
      new URL("../push-shopify-product-images/index.ts", import.meta.url),
      "utf8",
    );
    assert.match(source, /assertCylinderShopifyPublishAuthorized/);
    assert.match(source, /executeCylinderShopifyGuardedMutation/);
    assert.match(source, /library_tags/);
    assert.match(source, /pipelineSkuJobId/);
    assert.match(source, /shopify_publish_authorizations/);
    assert.match(source, /consumed_at/);
    assert.match(
      source,
      /const convexReadback = await callBestBottlesConvex\([\s\S]{0,180}"products:getBySku"/,
    );
    assert.match(source, /catalogHeroProductGroupSlug/);
    assert.match(source, /background-qa:pass/);
    assert.match(source, /canvas-hex:#F5F3EF/);
    assert.match(source, /products:setProductGroupHeroFromApprovedSku/);
    assert.match(
      source,
      /isServiceRoleRequest\s*=\s*isExactConfiguredServiceRoleToken\(token,\s*serviceRoleKey\)/,
    );
    assert.match(source, /await supabase\.auth\.getUser\(token\)/);
    assert.doesNotMatch(source, /function isServiceRoleToken/);
    assert.doesNotMatch(source, /parsed\.role\s*===\s*["']service_role["']/);
    assert.match(
      source,
      /requestedWebsiteSku[\s\S]{0,250}cylinderPublishRequested|cylinderPublishRequested[\s\S]{0,500}requestedWebsiteSku/,
    );
    const itemLoopIndex = source.indexOf("for (const item of items)");
    const guardIndex = source.indexOf(
      "assertCylinderShopifyPublishAuthorized(",
      itemLoopIndex,
    );
    const mutationIndex = source.indexOf("createProductMedia(", itemLoopIndex);
    assert.ok(guardIndex > 0, "edge function must invoke the Cylinder guard");
    assert.ok(
      guardIndex < mutationIndex,
      "guard must run before Shopify media creation",
    );
    assert.doesNotMatch(
      source,
      /const cylinderPublishRequested = syncBestBottlesConvex/,
      "Cylinder detection must not be gated by optional Convex sync",
    );
  });

  it("uses an explicit guarded replacement RPC for a terminal SKU hero", async () => {
    const migration = await readFile(
      new URL(
        "../../migrations/20260917210000_replace_best_bottles_sku_job_hero.sql",
        import.meta.url,
      ),
      "utf8",
    );
    assert.match(migration, /best_bottles_assert_org_member/);
    assert.match(migration, /background-qa:pass/);
    assert.match(migration, /canvas-hex:#F5F3EF/);
    assert.match(migration, /link_best_bottles_generated_image/);
    assert.match(migration, /approve_best_bottles_reconciled_image/);
    assert.match(migration, /REVOKE ALL[\s\S]+FROM PUBLIC, anon/i);
  });

  it("keeps shadow QA advisory in the DB approval gate (policy 2026-07-18)", async () => {
    // The client rig stopped emitting shadow_qa reports on 2026-07-19; the DB
    // gate must not demand one or every Cylinder approval fails.
    const migration = await readFile(
      new URL(
        "../../migrations/20260917233000_best_bottles_shadow_evidence_advisory.sql",
        import.meta.url,
      ),
      "utf8",
    );
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.best_bottles_shadow_evidence_passes/);
    const body = migration.slice(migration.indexOf("AS $$"), migration.indexOf("$$;"));
    assert.doesNotMatch(body, /p_shadow_qa/, "shadow_qa must not gate approval");
    assert.doesNotMatch(body, /contact-back-right-v1/, "numeric shadow contract must not gate approval");
    // Lineage checks that still apply for Cylinder.
    assert.match(body, /best-bottles-reference-locked-v6\.1/);
    assert.match(body, /p_shadow_owner = 'model'/);
    assert.match(body, /p_shadow_topology IS NOT NULL/);
  });

  it("stores authorization in a server-only durable single-use table", async () => {
    const migration = await readFile(
      new URL(
        "../../migrations/20260714010000_shopify_publish_authorizations.sql",
        import.meta.url,
      ),
      "utf8",
    );
    assert.match(migration, /CREATE TABLE.*shopify_publish_authorizations/is);
    assert.match(migration, /ENABLE ROW LEVEL SECURITY/i);
    assert.match(migration, /REVOKE ALL.*authenticated/is);
    assert.match(migration, /consumed_at/i);
    assert.match(migration, /expires_at/i);
    assert.doesNotMatch(
      migration,
      /CREATE POLICY[\s\S]*FOR INSERT[\s\S]*authenticated/i,
    );
  });

  it("accepts only the exact organization, job, product identity, and generated image", () => {
    assert.equal(assertCylinderShopifyPublishAuthorized(input()).guarded, true);

    assert.throws(
      () =>
        assertCylinderShopifyPublishAuthorized(
          input({ organizationId: "org-2" }),
        ),
      /organization/i,
    );
    assert.throws(() =>
      assertCylinderShopifyPublishAuthorized(input({
        item: { ...input().item, pipelineSkuJobId: "job-arbitrary" },
      })), /job/i);
    assert.throws(() =>
      assertCylinderShopifyPublishAuthorized(input({
        item: { ...input().item, websiteSku: "OtherSku" },
      })), /product identity/i);
    assert.throws(() =>
      assertCylinderShopifyPublishAuthorized(input({
        item: { ...input().item, imageId: "image-arbitrary" },
      })), /generated image/i);
  });

  it("rejects arbitrary public URLs and images not in exact approved-keep state", () => {
    assert.throws(() =>
      assertCylinderShopifyPublishAuthorized(input({
        item: {
          ...input().item,
          imageId: undefined,
          imageUrl: "https://public.example/arbitrary.png",
        },
      })), /generated image/i);
    assert.throws(() =>
      assertCylinderShopifyPublishAuthorized(input({
        image: { ...input().image!, library_tags: ["status:review-pending"] },
      })), /approved-keep/i);
    assert.throws(() =>
      assertCylinderShopifyPublishAuthorized(input({
        job: { ...input().job!, approved_image_id: "other-image" },
      })), /approved generated image/i);
    assert.throws(() =>
      assertCylinderShopifyPublishAuthorized(input({
        isCylinderProduct: true,
        job: null,
        image: null,
        item: {
          sku: "GB-CYL-CLR-9ML-SPR-GLD",
          imageUrl: "https://public.example/arbitrary.png",
        },
      })), /exact pipeline job/i);
  });

  it("requires an explicit publish authorization bound to every exact identity on writes", () => {
    assert.throws(() =>
      assertCylinderShopifyPublishAuthorized(input({
        item: { ...input().item, publishAuthorizationId: undefined },
        trustedAuthorization: null,
      })), /explicit.*publish authorization/i);
    assert.throws(() =>
      assertCylinderShopifyPublishAuthorized(input({
        trustedAuthorization: {
          ...input().trustedAuthorization!,
          generatedImageId: "other-image",
        },
      })), /authorization.*generated image/i);
  });

  it("rejects client-forged authorization, wrong authenticated actor, expiry, and replay", () => {
    const forged = input({ trustedAuthorization: null });
    (forged.item as Record<string, unknown>).publishAuthorization = {
      authorized: true,
      authorizedBy: "user-1",
      authorizedAt: forged.now,
    };
    assert.throws(
      () => assertCylinderShopifyPublishAuthorized(forged),
      /trusted server.*authorization/i,
    );
    assert.throws(() =>
      assertCylinderShopifyPublishAuthorized(input({
        authenticatedUserId: "attacker-user",
      })), /authenticated user/i);
    assert.throws(() =>
      assertCylinderShopifyPublishAuthorized(input({
        trustedAuthorization: {
          ...input().trustedAuthorization!,
          expiresAt: "2026-07-14T14:29:59.000Z",
        },
      })), /expired/i);
    assert.throws(() =>
      assertCylinderShopifyPublishAuthorized(input({
        trustedAuthorization: {
          ...input().trustedAuthorization!,
          consumedAt: "2026-07-14T14:10:00.000Z",
        },
      })), /already consumed|replayed/i);
    assert.throws(() =>
      assertCylinderShopifyPublishAuthorized(input({
        organizationMembershipVerified: false,
      })), /organization membership/i);
  });

  it("requires a durable single-use authorization for service-role writes", () => {
    assert.doesNotThrow(() =>
      assertCylinderShopifyPublishAuthorized(input({
        isServiceRoleRequest: true,
        authenticatedUserId: null,
        organizationMembershipVerified: false,
        trustedAuthorization: {
          ...input().trustedAuthorization!,
          authorizedByUserId: "trusted-server-issuer",
        },
      }))
    );
    assert.throws(() =>
      assertCylinderShopifyPublishAuthorized(input({
        isServiceRoleRequest: true,
        authenticatedUserId: null,
        trustedAuthorization: null,
      })), /trusted server.*authorization/i);
  });

  it("does not reach mutation for sync=false Cylinder arbitrary URLs", async () => {
    let mutationCount = 0;
    const value = input({
      isCylinderProduct: true,
      job: null,
      image: null,
      item: {
        sku: "GB-CYL-CLR-9ML-SPR-GLD",
        imageUrl: "https://public.example/arbitrary.png",
      },
    });
    await assert.rejects(
      executeCylinderShopifyGuardedMutation(value, async () => {
        mutationCount += 1;
        return "mutated";
      }),
      /exact pipeline job/i,
    );
    assert.equal(mutationCount, 0);
  });

  it("does not reach mutation for a sync=false canonical Cylinder Website SKU", async () => {
    let mutationCount = 0;
    const value = input({
      isCylinderProduct: false,
      job: null,
      image: null,
      item: {
        sku: "GBCyl9SpryGl",
        websiteSku: "GBCyl9SpryGl",
        imageUrl: "https://public.example/arbitrary.png",
      },
    });
    await assert.rejects(
      executeCylinderShopifyGuardedMutation(value, async () => {
        mutationCount += 1;
        return "mutated";
      }),
      /exact pipeline job/i,
    );
    assert.equal(mutationCount, 0);
    assert.equal(isCylinderProductSku("GBTallCyl50SpryBlk"), true);
    assert.equal(isCylinderProductSku("GB-TCYL-CLR-50ML-SPR-BLK"), true);
  });

  it("accepts only the exact configured service-role token", () => {
    const configured = "configured-service-role-secret";
    const forgedPayload = btoa(JSON.stringify({ role: "service_role" }))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    assert.equal(
      isExactConfiguredServiceRoleToken(`x.${forgedPayload}.x`, configured),
      false,
    );
    assert.equal(
      isExactConfiguredServiceRoleToken(configured, configured),
      true,
    );
    assert.equal(isExactConfiguredServiceRoleToken("", configured), false);
  });

  it("atomically claims trusted authorization before mutation and blocks claim replay", async () => {
    const calls: string[] = [];
    const result = await executeCylinderShopifyGuardedMutation(
      input(),
      async () => {
        calls.push("mutation");
        return "ok";
      },
      async () => {
        calls.push("claim");
        return true;
      },
    );
    assert.equal(result, "ok");
    assert.deepEqual(calls, ["claim", "mutation"]);

    let mutationCount = 0;
    await assert.rejects(
      executeCylinderShopifyGuardedMutation(
        input(),
        async () => {
          mutationCount += 1;
          return "bad";
        },
        async () => false,
      ),
      /already consumed|replay/i,
    );
    assert.equal(mutationCount, 0);
  });

  it("preserves non-Cylinder behavior", () => {
    const value = input({
      item: {
        sku: "NON-CYLINDER",
        imageUrl: "https://public.example/legacy.png",
      },
      job: {
        ...input().job!,
        family: "Boston Round",
        website_sku: "NON-CYLINDER",
        grace_sku: "NON-CYLINDER",
      },
      image: null,
      trustedAuthorization: null,
    });
    assert.deepEqual(assertCylinderShopifyPublishAuthorized(value), {
      guarded: false,
    });
  });
});
