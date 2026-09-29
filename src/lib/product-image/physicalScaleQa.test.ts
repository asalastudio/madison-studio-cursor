import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evaluateBestBottlesPhysicalScale,
  resolveCalibratedGlassBodyBounds,
  type RigScaleCalibration,
} from "./physicalScaleQa.ts";

const calibration: RigScaleCalibration = {
  id: "cal-1",
  version: "best-bottles-scale-card-v2-2026-09-18:landmarks-v1",
  sourceReferenceUrl: "https://example.test/reference.png",
  sourceReferenceHash: null,
  glassFootYPct: 91,
  glassRimYPct: 51,
  fitmentTopYPct: 42,
  primaryBounds: { left: 0.3, top: 0.4, right: 0.7, bottom: 0.91 },
  detachedComponentBounds: null,
};

describe("physical scale calibration", () => {
  it("maps reference-normalized foot and rim into generated vessel pixels", () => {
    const bounds = resolveCalibratedGlassBodyBounds({
      calibration,
      vesselBounds: { top: 400, bottom: 910, left: 300, right: 700 },
      detectedBaselineYPx: 910,
    });
    assert.deepEqual(bounds, {
      top: 510,
      bottom: 910,
      left: 300,
      right: 700,
    });
  });

  it("enforces pass, review, and fail at the locked millimeter bands", () => {
    const verdict = (deltaMm: number) =>
      evaluateBestBottlesPhysicalScale({
        expectedGlassHeightMm: 100,
        targetGlassHeightPx: 1000,
        measuredGlassHeightPx: 1000 + deltaMm * 10,
        calibration,
      }).verdict;

    assert.equal(verdict(3), "pass");
    assert.equal(verdict(4), "review");
    assert.equal(verdict(5), "review");
    assert.equal(verdict(5.1), "fail");
  });

  it("fails equal-height glass whose rendered diameter breaks same-geometry scale", () => {
    const qa = evaluateBestBottlesPhysicalScale({
      expectedGlassHeightMm: 53,
      expectedGlassDiameterMm: 17,
      targetGlassHeightPx: 897,
      measuredGlassHeightPx: 897,
      measuredGlassWidthPx: 440,
      calibration,
    });

    assert.equal(qa.deltaMm, 0);
    assert.equal(qa.measuredGlassDiameterMm, 26);
    assert.equal(qa.diameterDeltaMm, 9);
    assert.equal(qa.verdict, "fail");
  });

  it("fails a 70/98 mm lotion assembly rendered at 74.6% of the canvas", () => {
    const canvasHeight = 2288;
    const qa = evaluateBestBottlesPhysicalScale({
      expectedGlassHeightMm: 70,
      expectedAssembledHeightMm: 98,
      targetGlassHeightPx: Math.round(canvasHeight * 0.478),
      measuredGlassHeightPx: canvasHeight * 0.478,
      measuredAssemblyHeightPx: canvasHeight * 0.746,
      calibration,
    });

    assert.equal(qa.measuredAssembledHeightMm, 109.2);
    assert.equal(qa.assembledDeltaMm, 11.2);
    assert.equal(qa.verdict, "fail");
  });

  it("fails assembled height above the explicit 2 mm maximum", () => {
    const measuredGlassHeightPx = 1000;
    const qa = evaluateBestBottlesPhysicalScale({
      expectedGlassHeightMm: 70,
      expectedAssembledHeightMm: 98,
      targetGlassHeightPx: measuredGlassHeightPx,
      measuredGlassHeightPx,
      measuredAssemblyHeightPx: measuredGlassHeightPx * (100.1 / 70),
      calibration,
    });

    assert.equal(qa.measuredAssembledHeightMm, 100.1);
    assert.equal(qa.verdict, "fail");
  });

  it("never passes without an approved calibration evidence object", () => {
    const qa = evaluateBestBottlesPhysicalScale({
      expectedGlassHeightMm: 70,
      targetGlassHeightPx: 1000,
      measuredGlassHeightPx: 1000,
      calibration: null,
    });
    assert.equal(qa.verdict, "unverified");
    assert.equal(qa.calibrationVersion, null);
  });
});
