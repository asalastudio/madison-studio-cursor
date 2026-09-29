import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  brandConfigFromOrganization,
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
});
