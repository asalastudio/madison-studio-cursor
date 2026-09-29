import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BEST_BOTTLES_ORG_ID,
  fetchOrgEntitlementFeatures,
  fetchOrgEntitlementFeaturesRest,
  isBestBottlesOrgId,
  orgHasGridPipeline,
  orgHasTarife,
  orgMayUseGridPipeline,
  orgMayUseTarife,
  resolveCopyStyleOverlay,
} from "./orgFeatures.ts";

describe("orgFeatures entitlements", () => {
  it("reads only explicit true flags from brand_config", () => {
    assert.equal(orgHasGridPipeline({ features: { grid_pipeline: true } }), true);
    assert.equal(orgHasGridPipeline({ features: { grid_pipeline: "true" } }), false);
    assert.equal(orgHasTarife({ features: { tarife: true } }), true);
    assert.equal(orgHasTarife(null), false);
  });

  it("allowlists only the canonical Best Bottles organization id", () => {
    assert.equal(isBestBottlesOrgId(BEST_BOTTLES_ORG_ID), true);
    assert.equal(isBestBottlesOrgId("00000000-0000-4000-8000-000000000000"), false);
    assert.equal(orgMayUseGridPipeline(BEST_BOTTLES_ORG_ID, new Set()), true);
    assert.equal(orgMayUseGridPipeline("00000000-0000-4000-8000-000000000000", new Set()), false);
    assert.equal(
      orgMayUseGridPipeline("00000000-0000-4000-8000-000000000000", new Set(["grid_pipeline"])),
      true,
    );
    assert.equal(orgMayUseTarife(new Set()), false);
    assert.equal(orgMayUseTarife(new Set(["tarife"])), true);
  });

  it("keeps TARIFE_NATIVE off orgs without the flag", () => {
    assert.equal(resolveCopyStyleOverlay("TARIFE_NATIVE", { features: { tarife: true } }), "TARIFE_NATIVE");
    assert.equal(resolveCopyStyleOverlay("tarife-native", { features: { grid_pipeline: true } }), "BRAND_VOICE");
  });

  it("reads entitlement rows from a supabase-js client", async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: async () => ({ data: [{ feature: "grid_pipeline" }, { feature: "tarife" }] }),
        }),
      }),
    };
    const features = await fetchOrgEntitlementFeatures(supabase, "org");
    assert.equal(features.has("grid_pipeline"), true);
    assert.equal(features.has("tarife"), true);
  });

  it("reads entitlement rows from PostgREST", async () => {
    const doFetch: typeof fetch = async () =>
      new Response(JSON.stringify([{ feature: "tarife" }]), { status: 200 });
    const features = await fetchOrgEntitlementFeaturesRest(
      "https://example.supabase.co",
      "service-role",
      "org",
      doFetch,
    );
    assert.equal(orgMayUseTarife(features), true);
    assert.equal(orgMayUseGridPipeline("other", features), false);
  });
});
