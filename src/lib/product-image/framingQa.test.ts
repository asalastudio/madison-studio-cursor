import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildFramingQaReport, getFramingDecision } from "./framingQa";
import type { FamilyRigConfig, RigCapState } from "./familyRig";

const canvas = { width: 2080, height: 2288 };

function rig(overrides: Partial<FamilyRigConfig> = {}): FamilyRigConfig {
  return {
    family: "cylinder",
    fillHeightPct: 56,
    fillHeightRangePct: { min: 55, max: 60 },
    fillWidthPct: 58,
    baselinePct: 9,
    primaryObjectCenterXPct: 50,
    ...overrides,
  };
}

function boundsForFillHeight(fillHeightPct: number, baselineYPx = 2082) {
  const heightPx = Math.round(canvas.height * (fillHeightPct / 100));
  return {
    top: baselineYPx - heightPx + 1,
    bottom: baselineYPx,
    left: 850,
    right: 1230,
  };
}

describe("buildFramingQaReport", () => {
  it("passes an assembled product inside its fill-height range on the shared baseline", () => {
    const report = buildFramingQaReport({
      width: canvas.width,
      height: canvas.height,
      rig: rig(),
      bounds: boundsForFillHeight(56),
      baselineYPx: 2082,
      capState: "assembled",
    });

    assert.equal(report.status, "pass");
    assert.equal(report.failures.length, 0);
    assert.equal(report.measurements.fillHeightPct, 56);
    assert.equal(report.measurements.baselineDeltaPx, 0);
    assert.ok(Math.abs((report.measurements.centerDeltaPct ?? 0)) < 0.1);
    assert.deepEqual(report.primaryBounds, boundsForFillHeight(56));
  });

  it("fails an undersized sample vial against the Convex-derived profile range", () => {
    const report = buildFramingQaReport({
      width: canvas.width,
      height: canvas.height,
      rig: rig(),
      bounds: boundsForFillHeight(49.6),
      baselineYPx: 2082,
      capState: "assembled",
    });

    assert.equal(report.status, "fail");
    assert.match(report.failures.join(" "), /below target range/i);
    assert.equal(report.measurements.fillHeightPct, 49.6);
  });

  it("fails an oversized 9ml cylinder against the standard-cylinder target range", () => {
    const report = buildFramingQaReport({
      width: canvas.width,
      height: canvas.height,
      rig: rig({
        fillHeightPct: 72,
        fillHeightRangePct: { min: 72, max: 78 },
        fillWidthPct: 60,
      }),
      bounds: boundsForFillHeight(90.4),
      baselineYPx: 2082,
      capState: "assembled",
    });

    assert.equal(report.status, "fail");
    assert.match(report.failures.join(" "), /above target range/i);
    assert.equal(report.measurements.fillHeightPct, 90.4);
  });

  it("fails a product that misses the shared catalog baseline", () => {
    const report = buildFramingQaReport({
      width: canvas.width,
      height: canvas.height,
      rig: rig(),
      bounds: boundsForFillHeight(56, 2040),
      baselineYPx: 2040,
      capState: "assembled",
    });

    assert.equal(report.status, "fail");
    assert.match(report.failures.join(" "), /baseline/i);
    assert.equal(report.measurements.targetBaselineYPx, 2082);
    assert.equal(report.measurements.baselineDeltaPx, -42);
  });

  it("fails when the primary bottle crosses the output canvas bounds", () => {
    const report = buildFramingQaReport({
      width: canvas.width,
      height: canvas.height,
      rig: rig(),
      bounds: {
        ...boundsForFillHeight(56),
        left: -10,
        right: 2070,
      },
      baselineYPx: 2082,
      capState: "detached",
      primaryBounds: {
        ...boundsForFillHeight(56),
        left: -10,
        right: 2070,
      },
    });

    assert.equal(report.status, "fail");
    assert.match(report.failures.join(" "), /primary bottle.*canvas bounds/i);
  });

  it("warns when detached-cap outputs lack primary-bottle bounds for centerline QA", () => {
    const report = buildFramingQaReport({
      width: canvas.width,
      height: canvas.height,
      rig: rig(),
      bounds: {
        ...boundsForFillHeight(56),
        right: 1500,
      },
      baselineYPx: 2082,
      capState: "detached" satisfies RigCapState,
    });

    assert.equal(report.status, "warn");
    assert.deepEqual(report.failures, []);
    assert.match(report.warnings.join(" "), /Primary bottle bounds unavailable/i);
  });

  it("grades bare glass against the glass band, not the assembly envelope", () => {
    const glassBounds = boundsForFillHeight(54.7);
    const assemblyBounds = boundsForFillHeight(75.2);
    const report = buildFramingQaReport({
      width: canvas.width,
      height: canvas.height,
      rig: rig({
        fillHeightPct: 75.2,
        fillHeightRangePct: { min: 73.2, max: 77.2 },
        glassHeightPct: 54.7,
        glassHeightRangePct: { min: 52.7, max: 56.7 },
        targetBodyHeightPx: Math.round(canvas.height * 0.547),
      }),
      bounds: assemblyBounds,
      primaryBounds: assemblyBounds,
      bodyControlBounds: glassBounds,
      baselineYPx: 2082,
      capState: "detached",
    });

    assert.equal(report.status, "pass");
    assert.deepEqual(report.failures, []);
    assert.equal(report.measurements.fillHeightPct, 75.2);
    assert.equal(report.measurements.glassHeightPct, 54.7);
    assert.equal(report.target.glassHeightPct, 54.7);
    assert.deepEqual(report.target.glassHeightRangePct, { min: 52.7, max: 56.7 });
  });

  it("fails when measured bare glass is below the scale-card band even if assembly is tall", () => {
    const glassBounds = boundsForFillHeight(40);
    const assemblyBounds = boundsForFillHeight(75.2);
    const report = buildFramingQaReport({
      width: canvas.width,
      height: canvas.height,
      rig: rig({
        fillHeightPct: 75.2,
        fillHeightRangePct: { min: 73.2, max: 77.2 },
        glassHeightPct: 54.7,
        glassHeightRangePct: { min: 52.7, max: 56.7 },
        targetBodyHeightPx: Math.round(canvas.height * 0.547),
      }),
      bounds: assemblyBounds,
      primaryBounds: assemblyBounds,
      bodyControlBounds: glassBounds,
      baselineYPx: 2082,
      capState: "assembled",
    });

    assert.equal(report.status, "fail");
    assert.match(report.failures.join(" "), /Bare-glass foot-to-rim height .*below target range/i);
    assert.doesNotMatch(report.failures.join(" "), /Product fill height/i);
    assert.equal(report.measurements.glassHeightPct, 40);
    assert.equal(report.measurements.fillHeightPct, 75.2);
  });

  it("does not fail a tall assembly solely because it exceeds the bare-glass band", () => {
    const glassBounds = boundsForFillHeight(54.7);
    const assemblyBounds = boundsForFillHeight(90.4);
    const report = buildFramingQaReport({
      width: canvas.width,
      height: canvas.height,
      rig: rig({
        fillHeightPct: 75.2,
        fillHeightRangePct: { min: 73.2, max: 77.2 },
        glassHeightPct: 54.7,
        glassHeightRangePct: { min: 52.7, max: 56.7 },
        targetBodyHeightPx: Math.round(canvas.height * 0.547),
      }),
      bounds: assemblyBounds,
      primaryBounds: assemblyBounds,
      bodyControlBounds: glassBounds,
      baselineYPx: 2082,
      capState: "assembled",
    });

    assert.equal(report.status, "pass");
    assert.deepEqual(report.failures, []);
    assert.equal(report.measurements.fillHeightPct, 90.4);
    assert.equal(report.measurements.glassHeightPct, 54.7);
  });

  it("passes a detached primary product at the assembled-profile target", () => {
    const primaryBounds = boundsForFillHeight(75.2);
    const report = buildFramingQaReport({
      width: canvas.width,
      height: canvas.height,
      rig: rig({
        fillHeightPct: 75.2,
        fillHeightRangePct: { min: 73.2, max: 77.2 },
      }),
      bounds: primaryBounds,
      primaryBounds,
      baselineYPx: 2082,
      capState: "detached",
    });

    assert.equal(report.status, "pass");
    assert.deepEqual(report.failures, []);
  });
});

describe("getFramingDecision", () => {
  it("passes framing reports that satisfy the rig", () => {
    const report = buildFramingQaReport({
      width: canvas.width,
      height: canvas.height,
      rig: rig(),
      bounds: boundsForFillHeight(56),
      baselineYPx: 2082,
      capState: "assembled",
    });

    assert.equal(getFramingDecision(report), "pass");
  });

  it("normalizes generated products that are near the target but need correction", () => {
    const report = buildFramingQaReport({
      width: canvas.width,
      height: canvas.height,
      rig: rig(),
      bounds: boundsForFillHeight(61.1),
      baselineYPx: 2082,
      capState: "assembled",
    });

    assert.equal(report.status, "fail");
    assert.equal(getFramingDecision(report), "normalize");
  });

  it("rejects generated cylinders that are far below target fill height", () => {
    const report = buildFramingQaReport({
      width: canvas.width,
      height: canvas.height,
      rig: rig({
        fillHeightPct: 76,
        fillHeightRangePct: { min: 72, max: 78 },
        fillWidthPct: 60,
      }),
      bounds: boundsForFillHeight(30.6),
      baselineYPx: 2082,
      capState: "assembled",
    });

    assert.equal(report.status, "fail");
    assert.equal(getFramingDecision(report), "reject");
  });

  it("rejects reports with undetectable product bounds", () => {
    const report = buildFramingQaReport({
      width: canvas.width,
      height: canvas.height,
      rig: rig(),
      bounds: null,
      baselineYPx: 2082,
      capState: "assembled",
    });

    assert.equal(getFramingDecision(report), "reject");
  });
});

describe("aspect-ratio gate", () => {
  // boundsForFillHeight(56) → h=1281, w=381 → measured H/W ≈ 3.36.
  const measuredRatio = (2082 - (2082 - Math.round(canvas.height * 0.56) + 1) + 1) /
    (1230 - 850 + 1);

  it("passes when the render matches truth proportions", () => {
    const report = buildFramingQaReport({
      width: canvas.width,
      height: canvas.height,
      rig: rig(),
      bounds: boundsForFillHeight(56),
      baselineYPx: 2082,
      capState: "assembled",
      expectedPrimaryAspectRatio: measuredRatio,
    });
    assert.equal(report.status, "pass");
    // Measured ratio is rounded to two decimals before drift is computed, so
    // an exact-match input may report a sub-0.2% residual rather than zero.
    assert.ok(Math.abs(report.measurements.aspectRatioDriftPct ?? 99) <= 0.2);
  });

  it("warns between 4% and 6% drift", () => {
    const report = buildFramingQaReport({
      width: canvas.width,
      height: canvas.height,
      rig: rig(),
      bounds: boundsForFillHeight(56),
      baselineYPx: 2082,
      capState: "assembled",
      expectedPrimaryAspectRatio: measuredRatio / 1.05,
    });
    assert.equal(report.status, "warn");
    assert.match(report.warnings.join(" "), /aspect ratio/i);
  });

  it("fails a render stretched taller/thinner than truth beyond 6%", () => {
    // 2026-07-19 probes measured +11% (4 mL) and +23% (5 mL) stretch — both must fail.
    const report = buildFramingQaReport({
      width: canvas.width,
      height: canvas.height,
      rig: rig(),
      bounds: boundsForFillHeight(56),
      baselineYPx: 2082,
      capState: "assembled",
      expectedPrimaryAspectRatio: measuredRatio / 1.11,
    });
    assert.equal(report.status, "fail");
    assert.match(report.failures.join(" "), /taller\/thinner/);
  });

  it("stays silent when no truth ratio is available", () => {
    const report = buildFramingQaReport({
      width: canvas.width,
      height: canvas.height,
      rig: rig(),
      bounds: boundsForFillHeight(56),
      baselineYPx: 2082,
      capState: "assembled",
      expectedPrimaryAspectRatio: null,
    });
    assert.equal(report.status, "pass");
    assert.equal(report.measurements.aspectRatioDriftPct, null);
  });
});
