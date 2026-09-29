/**
 * Post-generation scale proof — compare measured glass height % against the
 * scale-card target from resolveBestBottlesGlassScale (±2% familyRig band).
 */

import {
  BEST_BOTTLES_SCALE_CARD_BASELINE_PERCENT,
  BEST_BOTTLES_SCALE_CARD_VERSION,
  resolveBestBottlesGlassScale,
  type BestBottlesGlassScale,
} from "@/config/bestBottlesCatalogScale";

/** Same ±2 band familyRig uses for fillHeightRangePct. */
export const SCALE_PROOF_TOLERANCE_PCT = 2 as const;

export type ScaleProofVerdict = "pass" | "fail" | "pending";

export type ScaleProofEvaluation = {
  version: typeof BEST_BOTTLES_SCALE_CARD_VERSION;
  baselinePercent: typeof BEST_BOTTLES_SCALE_CARD_BASELINE_PERCENT;
  tolerancePct: typeof SCALE_PROOF_TOLERANCE_PCT;
  target: BestBottlesGlassScale;
  range: { min: number; max: number };
  measuredGlassHeightPct: number | null;
  deltaPct: number | null;
  verdict: ScaleProofVerdict;
};

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

export function evaluateScaleProof(input: {
  heightWithoutCapMm: number;
  measuredGlassHeightPct?: number | null;
}): ScaleProofEvaluation {
  const target = resolveBestBottlesGlassScale(input.heightWithoutCapMm);
  const range = {
    min: Math.max(0, roundToOneDecimal(target.glassHeightPct - SCALE_PROOF_TOLERANCE_PCT)),
    max: Math.min(100, roundToOneDecimal(target.glassHeightPct + SCALE_PROOF_TOLERANCE_PCT)),
  };

  const measured =
    typeof input.measuredGlassHeightPct === "number"
      && Number.isFinite(input.measuredGlassHeightPct)
      ? roundToOneDecimal(input.measuredGlassHeightPct)
      : null;

  if (measured == null) {
    return {
      version: BEST_BOTTLES_SCALE_CARD_VERSION,
      baselinePercent: BEST_BOTTLES_SCALE_CARD_BASELINE_PERCENT,
      tolerancePct: SCALE_PROOF_TOLERANCE_PCT,
      target,
      range,
      measuredGlassHeightPct: null,
      deltaPct: null,
      verdict: "pending",
    };
  }

  const deltaPct = roundToOneDecimal(measured - target.glassHeightPct);
  const within = measured >= range.min && measured <= range.max;

  return {
    version: BEST_BOTTLES_SCALE_CARD_VERSION,
    baselinePercent: BEST_BOTTLES_SCALE_CARD_BASELINE_PERCENT,
    tolerancePct: SCALE_PROOF_TOLERANCE_PCT,
    target,
    range,
    measuredGlassHeightPct: measured,
    deltaPct,
    verdict: within ? "pass" : "fail",
  };
}
