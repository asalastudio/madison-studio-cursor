import type { RigStrongBounds } from "./rigPostprocess";
import type { NormalizedBounds } from "../bestBottlesScaleCalibrationModel";

export type PhysicalScaleVerdict = "pass" | "review" | "fail" | "unverified";

export interface RigScaleCalibration {
  id: string;
  version: string;
  sourceReferenceUrl: string;
  sourceReferenceHash: string | null;
  glassFootYPct: number;
  glassRimYPct: number;
  fitmentTopYPct: number | null;
  primaryBounds: NormalizedBounds;
  detachedComponentBounds: NormalizedBounds | null;
}

export interface PhysicalScaleQa {
  verdict: PhysicalScaleVerdict;
  expectedGlassHeightMm: number | null;
  measuredGlassHeightMm: number | null;
  deltaMm: number | null;
  expectedGlassDiameterMm: number | null;
  measuredGlassDiameterMm: number | null;
  diameterDeltaMm: number | null;
  expectedAssembledHeightMm: number | null;
  measuredAssembledHeightMm: number | null;
  assembledDeltaMm: number | null;
  calibrationId: string | null;
  calibrationVersion: string | null;
  evidenceSource: string | null;
}

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

export function resolveCalibratedGlassBodyBounds(input: {
  calibration: RigScaleCalibration;
  vesselBounds: RigStrongBounds | null | undefined;
  detectedBaselineYPx: number;
}): RigStrongBounds | null {
  const vessel = input.vesselBounds;
  if (
    !vessel ||
    typeof vessel.left !== "number" ||
    typeof vessel.right !== "number" ||
    vessel.bottom <= vessel.top
  ) {
    return null;
  }
  const sourcePrimaryHeight =
    input.calibration.primaryBounds.bottom - input.calibration.primaryBounds.top;
  if (!(sourcePrimaryHeight > 0)) return null;
  const rimWithinPrimary =
    (input.calibration.glassRimYPct / 100 -
      input.calibration.primaryBounds.top) /
    sourcePrimaryHeight;
  const footWithinPrimary =
    (input.calibration.glassFootYPct / 100 -
      input.calibration.primaryBounds.top) /
    sourcePrimaryHeight;
  if (
    !Number.isFinite(rimWithinPrimary) ||
    !Number.isFinite(footWithinPrimary) ||
    rimWithinPrimary < 0 ||
    footWithinPrimary > 1.05 ||
    footWithinPrimary <= rimWithinPrimary
  ) {
    return null;
  }
  const vesselHeight = vessel.bottom - vessel.top;
  const top = Math.round(vessel.top + rimWithinPrimary * vesselHeight);
  const annotatedFoot = Math.round(
    vessel.top + footWithinPrimary * vesselHeight,
  );
  const bottom = Math.max(annotatedFoot, Math.round(input.detectedBaselineYPx));
  if (bottom <= top) return null;
  return { top, bottom, left: vessel.left, right: vessel.right };
}

export function evaluateBestBottlesPhysicalScale(input: {
  expectedGlassHeightMm: number | null | undefined;
  measuredGlassHeightPx: number | null | undefined;
  targetGlassHeightPx: number | null | undefined;
  expectedGlassDiameterMm?: number | null;
  measuredGlassWidthPx?: number | null;
  expectedAssembledHeightMm?: number | null;
  measuredAssemblyHeightPx?: number | null;
  calibration?: RigScaleCalibration | null;
}): PhysicalScaleQa {
  const expected = input.expectedGlassHeightMm;
  const measuredPx = input.measuredGlassHeightPx;
  const targetPx = input.targetGlassHeightPx;
  const expectedDiameter = input.expectedGlassDiameterMm;
  const measuredWidthPx = input.measuredGlassWidthPx;
  const expectedAssembledHeightMm = input.expectedAssembledHeightMm;
  const measuredAssemblyHeightPx = input.measuredAssemblyHeightPx;
  const calibration = input.calibration ?? null;
  if (
    !calibration ||
    typeof expected !== "number" ||
    !Number.isFinite(expected) ||
    expected <= 0 ||
    typeof measuredPx !== "number" ||
    !Number.isFinite(measuredPx) ||
    measuredPx <= 0 ||
    typeof targetPx !== "number" ||
    !Number.isFinite(targetPx) ||
    targetPx <= 0
  ) {
    return {
      verdict: "unverified",
      expectedGlassHeightMm:
        typeof expected === "number" && Number.isFinite(expected) ? expected : null,
      measuredGlassHeightMm: null,
      deltaMm: null,
      expectedGlassDiameterMm:
        typeof expectedDiameter === "number" && Number.isFinite(expectedDiameter)
          ? expectedDiameter
          : null,
      measuredGlassDiameterMm: null,
      diameterDeltaMm: null,
      expectedAssembledHeightMm:
        typeof expectedAssembledHeightMm === "number" &&
        Number.isFinite(expectedAssembledHeightMm)
          ? expectedAssembledHeightMm
          : null,
      measuredAssembledHeightMm: null,
      assembledDeltaMm: null,
      calibrationId: calibration?.id ?? null,
      calibrationVersion: calibration?.version ?? null,
      evidenceSource: calibration?.sourceReferenceUrl ?? null,
    };
  }
  const measuredMm = roundTenth(expected * (measuredPx / targetPx));
  const deltaMm = roundTenth(measuredMm - expected);
  const hasDiameterMeasurement =
    typeof expectedDiameter === "number" &&
    Number.isFinite(expectedDiameter) &&
    expectedDiameter > 0 &&
    typeof measuredWidthPx === "number" &&
    Number.isFinite(measuredWidthPx) &&
    measuredWidthPx > 0;
  const pixelsPerMm = targetPx / expected;
  const measuredDiameterMm = hasDiameterMeasurement
    ? roundTenth(measuredWidthPx / pixelsPerMm)
    : null;
  const diameterDeltaMm =
    measuredDiameterMm != null && typeof expectedDiameter === "number"
      ? roundTenth(measuredDiameterMm - expectedDiameter)
      : null;
  const measuredAssembledHeightMm =
    typeof expectedAssembledHeightMm === "number" &&
    Number.isFinite(expectedAssembledHeightMm) &&
    expectedAssembledHeightMm >= expected &&
    typeof measuredAssemblyHeightPx === "number" &&
    Number.isFinite(measuredAssemblyHeightPx) &&
    measuredAssemblyHeightPx > 0
      ? roundTenth(expected * (measuredAssemblyHeightPx / measuredPx))
      : null;
  const assembledDeltaMm =
    measuredAssembledHeightMm != null &&
    typeof expectedAssembledHeightMm === "number"
      ? roundTenth(measuredAssembledHeightMm - expectedAssembledHeightMm)
      : null;
  const absoluteDelta = Math.max(
    Math.abs(deltaMm),
    diameterDeltaMm == null ? 0 : Math.abs(diameterDeltaMm),
  );
  const glassVerdict: PhysicalScaleVerdict =
    absoluteDelta <= 3 ? "pass" : absoluteDelta <= 5 ? "review" : "fail";
  const assembledVerdict: PhysicalScaleVerdict =
    assembledDeltaMm == null || assembledDeltaMm <= 0
      ? "pass"
      : assembledDeltaMm <= 2
        ? "review"
        : "fail";
  const verdict =
    glassVerdict === "fail" || assembledVerdict === "fail"
      ? "fail"
      : glassVerdict === "review" || assembledVerdict === "review"
        ? "review"
        : "pass";
  return {
    verdict,
    expectedGlassHeightMm: roundTenth(expected),
    measuredGlassHeightMm: measuredMm,
    deltaMm,
    expectedGlassDiameterMm:
      typeof expectedDiameter === "number" && Number.isFinite(expectedDiameter)
        ? roundTenth(expectedDiameter)
        : null,
    measuredGlassDiameterMm: measuredDiameterMm,
    diameterDeltaMm,
    expectedAssembledHeightMm:
      typeof expectedAssembledHeightMm === "number" &&
      Number.isFinite(expectedAssembledHeightMm)
        ? roundTenth(expectedAssembledHeightMm)
        : null,
    measuredAssembledHeightMm,
    assembledDeltaMm,
    calibrationId: calibration.id,
    calibrationVersion: calibration.version,
    evidenceSource: calibration.sourceReferenceUrl,
  };
}
