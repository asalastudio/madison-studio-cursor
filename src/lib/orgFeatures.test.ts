import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BEST_BOTTLES_ORG_ID,
  brandConfigFromOrganization,
  isBestBottlesOrgId,
  orgHasGridPipeline,
  orgHasTarife,
  resolveCopyStyleOverlay,
} from "./orgFeatures";

describe("orgFeatures", () => {
  it("reads only explicit true flags", () => {
    assert.equal(orgHasGridPipeline({ features: { grid_pipeline: true } }), true);
    assert.equal(orgHasTarife({ features: { tarife: true } }), true);
    assert.equal(orgHasTarife({ features: { grid_pipeline: true } }), false);
    assert.equal(orgHasGridPipeline({ features: { grid_pipeline: "true" } }), false);
    assert.equal(orgHasTarife(null), false);
  });

  it("reads brand_config off an organization row", () => {
    assert.equal(
      orgHasGridPipeline(brandConfigFromOrganization({ brand_config: { features: { grid_pipeline: true } } })),
      true,
    );
    assert.equal(brandConfigFromOrganization(null), null);
  });

  it("keeps TARIFE_NATIVE off orgs without the flag", () => {
    assert.equal(resolveCopyStyleOverlay("TARIFE_NATIVE", { features: { tarife: true } }), "TARIFE_NATIVE");
    assert.equal(resolveCopyStyleOverlay("tarife-native", { features: { grid_pipeline: true } }), "BRAND_VOICE");
    assert.equal(resolveCopyStyleOverlay("poetic", null), "JAY_PETERMAN");
  });

  it("allowlists only the canonical Best Bottles organization id", () => {
    assert.equal(isBestBottlesOrgId(BEST_BOTTLES_ORG_ID), true);
    assert.equal(isBestBottlesOrgId("00000000-0000-4000-8000-000000000000"), false);
  });
});
