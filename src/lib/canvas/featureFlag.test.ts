import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isMadisonCanvasEnabled, isMadisonCanvasEnvEnabled, isMadisonCanvasOrgEnabled } from "./featureFlag";

describe("Madison Canvas feature flag", () => {
  it("is off by default", () => {
    assert.equal(isMadisonCanvasEnabled({ brandConfig: {}, env: {} }), false);
    assert.equal(isMadisonCanvasOrgEnabled({ features: { grid_pipeline: true } }), false);
  });

  it("turns on from the org brand_config flag", () => {
    assert.equal(
      isMadisonCanvasOrgEnabled({ features: { madison_canvas: true } }),
      true,
    );
  });

  it("turns on from VITE_MADISON_CANVAS", () => {
    assert.equal(isMadisonCanvasEnvEnabled({ VITE_MADISON_CANVAS: "true" }), true);
    assert.equal(isMadisonCanvasEnvEnabled({ VITE_MADISON_CANVAS: "1" }), true);
    assert.equal(isMadisonCanvasEnvEnabled({ VITE_MADISON_CANVAS: "false" }), false);
  });
});
