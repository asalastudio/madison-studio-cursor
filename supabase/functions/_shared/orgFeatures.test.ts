import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BEST_BOTTLES_ORG_ID, isBestBottlesOrgId, orgHasGridPipeline, orgHasTarife } from "./orgFeatures";

describe("orgFeatures", () => {
  it("reads grid_pipeline and tarife only when explicitly true", () => {
    assert.equal(orgHasGridPipeline({ features: { grid_pipeline: true } }), true);
    assert.equal(orgHasGridPipeline({ features: { grid_pipeline: "true" } }), false);
    assert.equal(orgHasGridPipeline({ features: {} }), false);
    assert.equal(orgHasGridPipeline(null), false);
    assert.equal(orgHasTarife({ features: { tarife: true } }), true);
    assert.equal(orgHasTarife({ features: { grid_pipeline: true } }), false);
  });

  it("identifies only the canonical Best Bottles organization id", () => {
    assert.equal(isBestBottlesOrgId(BEST_BOTTLES_ORG_ID), true);
    assert.equal(isBestBottlesOrgId("00000000-0000-4000-8000-000000000000"), false);
    assert.equal(isBestBottlesOrgId(null), false);
  });
});
