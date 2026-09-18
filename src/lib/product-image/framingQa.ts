import type { FamilyRigConfig, RigCapState } from "./familyRig";
import type { PhysicalScaleQa } from "./physicalScaleQa";

export type FramingQaStatus = "pass" | "warn" | "fail";
export type FramingDecision = "pass" | "normalize" | "reject";

export interface FramingQaBounds {
  top: number;
  bottom: number;
  left?: number;
  right?: number;
}

export interface FramingQaReport {
  status: FramingQaStatus;
  failures: string[];
  warnings: string[];
  /** Pipeline evidence for the locked ±3 / 3–5 / >5 mm scale policy. */
  physicalScale?: PhysicalScaleQa | null;
  /** Bottle-only pixel envelope used for scale, baseline, centerline, and crop QA. */
  primaryBounds?: FramingQaBounds | null;
  measurements: {
    /** Full visible product / assembly envelope height %. */
    fillHeightPct: number | null;
    /** Bare-glass foot-to-rim height % when body-control bounds are supplied. */
    glassHeightPct: number | null;
    /** Bare-glass width % used to enforce same-geometry diameter consistency. */
    glassWidthPct: number | null;
    baselineYPx: number | null;
    targetBaselineYPx: number;
    baselineDeltaPx: number | null;
    centerXPct: number | null;
    targetCenterXPct: number;
    centerDeltaPct: number | null;
    primaryAspectRatio: number | null;
    expectedPrimaryAspectRatio: number | null;
    aspectRatioDriftPct: number | null;
  };
  target: {
    family: string;
    profileId: string | null;
    relativeScaleZoneId: string | null;
    fillHeightPct: number;
    fillHeightRangePct: { min: number; max: number };
    glassHeightPct: number | null;
    glassHeightRangePct: { min: number; max: number } | null;
    baselinePct: number;
    primaryObjectCenterXPct: number;
  };
}

export interface BuildFramingQaReportInput {
  width: number;
  height: number;
  rig: FamilyRigConfig;
  bounds: FramingQaBounds | null;
  primaryBounds?: FramingQaBounds | null;
  /**
   * Exact glass-body (foot-to-rim) bounds. When present with a scale-card
   * glass target, QA grades glass against glassHeightRangePct and does not
   * compare the assembly envelope to the bare-glass band.
   */
  bodyControlBounds?: FramingQaBounds | null;
  /** Bottle-only lateral bounds; excludes detached caps and sidecar components. */
  glassWidthBounds?: FramingQaBounds | null;
  baselineYPx: number | null;
  capState?: RigCapState;
  fillHeightTolerancePct?: number;
  baselineTolerancePx?: number;
  baselineWarnTolerancePx?: number;
  centerTolerancePct?: number;
  /**
   * Truth height-to-width ratio for the primary bottle (canonical mm for
   * assembled cap-on; byte-locked reference measurement for detached sidecar).
   * The model can satisfy the fill-height target by stretching taller/thinner —
   * uniform rig scaling cannot catch that, so this is the only proportion gate.
   */
  expectedPrimaryAspectRatio?: number | null;
  aspectRatioWarnTolerancePct?: number;
  aspectRatioFailTolerancePct?: number;
  /**
   * Bottle-only bounds used solely for the aspect measurement. Detached-sidecar
   * primaryBounds can merge bottle+cap, which poisons the ratio; callers pass
   * tallest-component bounds here without disturbing the other QA metrics.
   */
  aspectBounds?: FramingQaBounds | null;
}

function roundToTenth(value: number): number {
  return Number(value.toFixed(1));
}

function heightPctFromBounds(
  bounds: FramingQaBounds | null | undefined,
  canvasHeight: number,
): number | null {
  if (!bounds || !(bounds.bottom >= bounds.top) || !(canvasHeight > 0)) return null;
  return roundToTenth(((bounds.bottom - bounds.top + 1) / canvasHeight) * 100);
}

function widthPctFromBounds(
  bounds: FramingQaBounds | null | undefined,
  canvasWidth: number,
): number | null {
  if (
    !bounds ||
    typeof bounds.left !== "number" ||
    typeof bounds.right !== "number" ||
    !(bounds.right >= bounds.left) ||
    !(canvasWidth > 0)
  ) {
    return null;
  }
  return roundToTenth(((bounds.right - bounds.left + 1) / canvasWidth) * 100);
}

function getAssembledFillHeightTarget(input: BuildFramingQaReportInput): {
  fillHeightPct: number;
  range: { min: number; max: number };
} {
  const assembledRange = input.rig.fillHeightRangePct ?? {
    min: input.rig.fillHeightPct - 2,
    max: input.rig.fillHeightPct + 2,
  };
  return { fillHeightPct: input.rig.fillHeightPct, range: assembledRange };
}

function getGlassHeightTarget(input: BuildFramingQaReportInput): {
  glassHeightPct: number;
  range: { min: number; max: number };
} | null {
  const glassPct =
    typeof input.rig.glassHeightPct === "number" && Number.isFinite(input.rig.glassHeightPct)
      ? input.rig.glassHeightPct
      : typeof input.rig.targetBodyHeightPx === "number" &&
          input.rig.targetBodyHeightPx > 0 &&
          input.height > 0
        ? roundToTenth((input.rig.targetBodyHeightPx / input.height) * 100)
        : null;
  if (glassPct == null) return null;
  const range = input.rig.glassHeightRangePct ?? {
    min: Math.max(0, glassPct - 2),
    max: Math.min(100, glassPct + 2),
  };
  return { glassHeightPct: glassPct, range };
}

function getBoundsCenterXPct(bounds: FramingQaBounds | null, width: number): number | null {
  if (!bounds || typeof bounds.left !== "number" || typeof bounds.right !== "number") {
    return null;
  }
  return roundToTenth((((bounds.left + bounds.right) / 2) / width) * 100);
}

function isBoundsInsideCanvas(
  bounds: FramingQaBounds,
  width: number,
  height: number,
): boolean {
  return (
    bounds.top >= 0 &&
    bounds.bottom <= height - 1 &&
    typeof bounds.left === "number" &&
    bounds.left >= 0 &&
    typeof bounds.right === "number" &&
    bounds.right <= width - 1
  );
}

function pushHeightBandIssues(params: {
  label: string;
  measuredPct: number | null;
  range: { min: number; max: number };
  tolerancePct: number;
  failures: string[];
  warnings: string[];
}): void {
  const { measuredPct, range, tolerancePct, failures, warnings, label } = params;
  if (measuredPct == null) return;
  if (measuredPct < range.min - tolerancePct) {
    failures.push(
      `${label} ${measuredPct}% is below target range ${range.min}-${range.max}%.`,
    );
  } else if (measuredPct > range.max + tolerancePct) {
    failures.push(
      `${label} ${measuredPct}% is above target range ${range.min}-${range.max}%.`,
    );
  } else if (measuredPct < range.min || measuredPct > range.max) {
    warnings.push(
      `${label} ${measuredPct}% is outside target range ${range.min}-${range.max}% but within tolerance.`,
    );
  }
}

export function buildFramingQaReport(input: BuildFramingQaReportInput): FramingQaReport {
  const failures: string[] = [];
  const warnings: string[] = [];
  const fillHeightTolerancePct = input.fillHeightTolerancePct ?? 0.5;
  const baselineTolerancePx = input.baselineTolerancePx ?? 8;
  const baselineWarnTolerancePx = input.baselineWarnTolerancePx ?? 4;
  const centerTolerancePct = input.centerTolerancePct ?? 2.5;
  const assembledTarget = getAssembledFillHeightTarget(input);
  const glassTarget = getGlassHeightTarget(input);
  const targetCenterXPct = input.rig.primaryObjectCenterXPct ?? 50;
  const targetBaselineYPx = Math.round(input.height * (1 - input.rig.baselinePct / 100));

  const fillHeightPct = heightPctFromBounds(input.bounds, input.height);
  const glassHeightPct = heightPctFromBounds(input.bodyControlBounds, input.height);
  const glassWidthPct = widthPctFromBounds(
    input.glassWidthBounds === undefined
      ? input.bodyControlBounds
      : input.glassWidthBounds,
    input.width,
  );
  const baselineDeltaPx =
    typeof input.baselineYPx === "number"
      ? input.baselineYPx - targetBaselineYPx
      : null;

  const centerBounds =
    input.capState === "detached"
      ? input.primaryBounds ?? null
      : input.primaryBounds ?? input.bounds;
  const centerXPct = getBoundsCenterXPct(centerBounds, input.width);
  const centerDeltaPct =
    centerXPct == null ? null : roundToTenth(centerXPct - targetCenterXPct);

  if (!input.bounds) {
    failures.push("Product foreground bounds were not detectable for framing QA.");
  }

  const bottleBounds = input.primaryBounds ?? input.bounds;
  if (bottleBounds && !isBoundsInsideCanvas(bottleBounds, input.width, input.height)) {
    failures.push("Primary bottle crosses the output canvas bounds.");
  }

  const hasScaleCardGlassGate = glassTarget != null;
  if (hasScaleCardGlassGate) {
    // Scale-card masters: grade bare glass against the glass band when measured.
    // Never compare the full assembly envelope to the bare-glass ±2 band, and
    // do not hard-fail assembled fill vs the legacy assembled band (cap-on
    // assemblies are intentionally taller than bare glass).
    if (input.bodyControlBounds) {
      pushHeightBandIssues({
        label: "Bare-glass foot-to-rim height",
        measuredPct: glassHeightPct,
        range: glassTarget.range,
        tolerancePct: fillHeightTolerancePct,
        failures,
        warnings,
      });
    } else {
      warnings.push(
        "Bare-glass body-control bounds unavailable; assembly envelope was not graded against the glass band.",
      );
    }
  } else {
    // Legacy: assembly envelope vs assembled fill-height band.
    pushHeightBandIssues({
      label: "Product fill height",
      measuredPct: fillHeightPct,
      range: assembledTarget.range,
      tolerancePct: fillHeightTolerancePct,
      failures,
      warnings,
    });
  }

  if (baselineDeltaPx == null) {
    failures.push("Product baseline was not detectable for framing QA.");
  } else if (Math.abs(baselineDeltaPx) > baselineTolerancePx) {
    failures.push(
      `Product baseline is ${baselineDeltaPx}px from target ${targetBaselineYPx}px.`,
    );
  } else if (Math.abs(baselineDeltaPx) > baselineWarnTolerancePx) {
    warnings.push(
      `Product baseline is ${baselineDeltaPx}px from target ${targetBaselineYPx}px.`,
    );
  }

  if (input.capState === "detached" && !input.primaryBounds) {
    warnings.push("Primary bottle bounds unavailable for detached-cap centerline QA.");
  } else if (centerDeltaPct == null) {
    failures.push("Product centerline was not detectable for framing QA.");
  } else if (Math.abs(centerDeltaPct) > centerTolerancePct) {
    failures.push(
      `Product centerline is ${centerDeltaPct}% from target ${targetCenterXPct}%.`,
    );
  }

  const expectedAspect =
    typeof input.expectedPrimaryAspectRatio === "number" &&
    Number.isFinite(input.expectedPrimaryAspectRatio) &&
    input.expectedPrimaryAspectRatio > 0
      ? input.expectedPrimaryAspectRatio
      : null;
  const aspectSourceBounds = input.aspectBounds ?? bottleBounds;
  const primaryAspectRatio =
    aspectSourceBounds &&
    typeof aspectSourceBounds.left === "number" &&
    typeof aspectSourceBounds.right === "number" &&
    aspectSourceBounds.right > aspectSourceBounds.left &&
    aspectSourceBounds.bottom > aspectSourceBounds.top
      ? roundToTenth(
          ((aspectSourceBounds.bottom - aspectSourceBounds.top + 1) /
            (aspectSourceBounds.right - aspectSourceBounds.left + 1)) * 10,
        ) / 10
      : null;
  const aspectRatioDriftPct =
    expectedAspect != null && primaryAspectRatio != null
      ? roundToTenth(((primaryAspectRatio - expectedAspect) / expectedAspect) * 100)
      : null;
  const aspectWarnPct = input.aspectRatioWarnTolerancePct ?? 4;
  const aspectFailPct = input.aspectRatioFailTolerancePct ?? 6;
  if (aspectRatioDriftPct != null) {
    const direction = aspectRatioDriftPct > 0 ? "taller/thinner" : "shorter/wider";
    if (Math.abs(aspectRatioDriftPct) > aspectFailPct) {
      failures.push(
        `Primary bottle aspect ratio ${primaryAspectRatio} drifts ${aspectRatioDriftPct}% ${direction} than truth ${roundToTenth(expectedAspect * 10) / 10} (tolerance ${aspectFailPct}%).`,
      );
    } else if (Math.abs(aspectRatioDriftPct) > aspectWarnPct) {
      warnings.push(
        `Primary bottle aspect ratio ${primaryAspectRatio} drifts ${aspectRatioDriftPct}% ${direction} than truth ${roundToTenth(expectedAspect * 10) / 10}.`,
      );
    }
  }

  return {
    status: failures.length > 0 ? "fail" : warnings.length > 0 ? "warn" : "pass",
    failures,
    warnings,
    primaryBounds: bottleBounds,
    measurements: {
      fillHeightPct,
      glassHeightPct,
      glassWidthPct,
      baselineYPx: input.baselineYPx,
      targetBaselineYPx,
      baselineDeltaPx,
      centerXPct,
      targetCenterXPct,
      centerDeltaPct,
      primaryAspectRatio,
      expectedPrimaryAspectRatio: expectedAspect,
      aspectRatioDriftPct,
    },
    target: {
      family: input.rig.family,
      profileId: input.rig.profileId ?? null,
      relativeScaleZoneId: input.rig.relativeScaleZoneId ?? null,
      fillHeightPct: assembledTarget.fillHeightPct,
      fillHeightRangePct: assembledTarget.range,
      glassHeightPct: glassTarget?.glassHeightPct ?? null,
      glassHeightRangePct: glassTarget?.range ?? null,
      baselinePct: input.rig.baselinePct,
      primaryObjectCenterXPct: targetCenterXPct,
    },
  };
}

export function getFramingDecision(report: FramingQaReport): FramingDecision {
  // Prefer bare-glass measurement for scale-card decisions when present.
  const glassPct = report.measurements.glassHeightPct;
  const glassRange = report.target.glassHeightRangePct;
  if (glassPct != null && glassRange) {
    if (glassPct < glassRange.min - 12 || glassPct > glassRange.max + 12) {
      return "reject";
    }
    if (report.status === "pass") return "pass";
    return "normalize";
  }

  const fillHeightPct = report.measurements.fillHeightPct;
  const targetRange = report.target.fillHeightRangePct;

  if (fillHeightPct == null) return "reject";
  if (fillHeightPct < targetRange.min - 12 || fillHeightPct > targetRange.max + 12) {
    return "reject";
  }
  if (report.status === "pass") return "pass";
  return "normalize";
}
