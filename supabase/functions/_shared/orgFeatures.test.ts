import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { orgHasGridPipeline, orgHasTarife } from "./orgFeatures";

describe("orgFeatures", () => {
  it("reads grid_pipeline and tarife only when explicitly true", () => {
    assert.equal(orgHasGridPipeline({ features: { grid_pipeline: true } }), true);
    assert.equal(orgHasGridPipeline({ features: { grid_pipeline: "true" } }), false);
    assert.equal(orgHasGridPipeline({ features: {} }), false);
    assert.equal(orgHasGridPipeline(null), false);
    assert.equal(orgHasTarife({ features: { tarife: true } }), true);
    assert.equal(orgHasTarife({ features: { grid_pipeline: true } }), false);
  });
});
