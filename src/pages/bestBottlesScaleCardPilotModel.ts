/**
 * Pure Cylinder scale-card pilot model — current (approved today) vs target
 * (scale-card v1 bare-glass PCHIP). Used by `/best-bottles/scale-card-pilot`.
 */

import {
  BEST_BOTTLES_SCALE_CARD_BASELINE_PERCENT,
  BEST_BOTTLES_SCALE_CARD_DELIVER_HEIGHT_PX,
  BEST_BOTTLES_SCALE_CARD_VERSION,
  resolveBestBottlesGlassScale,
} from "@/config/bestBottlesCatalogScale";

export type ScaleCardPilotSeed = {
  id: string;
  label: string;
  heightWithoutCapMm: number;
  /** Approved-today bare-glass fill height % (scale-card.json todayPct). */
  currentGlassHeightPct: number;
};

/** Five Cylinder bodies Jordan asked to proof on localhost. */
export const BEST_BOTTLES_SCALE_CARD_PILOT_ROWS: readonly ScaleCardPilotSeed[] = [
  { id: "cyl-5ml", label: "5 ml", heightWithoutCapMm: 53, currentGlassHeightPct: 47.8 },
  { id: "cyl-9-classic", label: "9 Classic", heightWithoutCapMm: 70, currentGlassHeightPct: 53.2 },
  { id: "cyl-9-slim", label: "9 Slim", heightWithoutCapMm: 106, currentGlassHeightPct: 61.0 },
  { id: "cyl-50ml", label: "50 ml", heightWithoutCapMm: 117, currentGlassHeightPct: 63.8 },
  { id: "cyl-100ml", label: "100 ml", heightWithoutCapMm: 154, currentGlassHeightPct: 74.7 },
] as const;

export type ScaleCardPilotRow = {
  id: string;
  label: string;
  heightWithoutCapMm: number;
  currentGlassHeightPct: number;
  targetGlassHeightPct: number;
  targetGlassHeightPx: number;
  deltaPct: number;
  tag: string;
  baselinePercent: typeof BEST_BOTTLES_SCALE_CARD_BASELINE_PERCENT;
};

export type ScaleCardPilotModel = {
  version: typeof BEST_BOTTLES_SCALE_CARD_VERSION;
  baselinePercent: typeof BEST_BOTTLES_SCALE_CARD_BASELINE_PERCENT;
  canvasHeightPx: typeof BEST_BOTTLES_SCALE_CARD_DELIVER_HEIGHT_PX;
  sameZoom: true;
  rows: ScaleCardPilotRow[];
};

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Relative % change: (target / current − 1) × 100 — matches scale-card.json `change`. */
export function scaleCardRelativeDeltaPct(
  currentGlassHeightPct: number,
  targetGlassHeightPct: number,
): number {
  if (!Number.isFinite(currentGlassHeightPct) || currentGlassHeightPct === 0) {
    throw new Error("currentGlassHeightPct must be a non-zero finite number.");
  }
  return roundToOneDecimal((targetGlassHeightPct / currentGlassHeightPct - 1) * 100);
}

export function buildBestBottlesScaleCardPilot(
  seeds: readonly ScaleCardPilotSeed[] = BEST_BOTTLES_SCALE_CARD_PILOT_ROWS,
): ScaleCardPilotModel {
  const rows: ScaleCardPilotRow[] = seeds.map((seed) => {
    const resolved = resolveBestBottlesGlassScale(seed.heightWithoutCapMm);
    return {
      id: seed.id,
      label: seed.label,
      heightWithoutCapMm: seed.heightWithoutCapMm,
      currentGlassHeightPct: seed.currentGlassHeightPct,
      targetGlassHeightPct: resolved.glassHeightPct,
      targetGlassHeightPx: resolved.targetGlassHeightPx,
      deltaPct: scaleCardRelativeDeltaPct(
        seed.currentGlassHeightPct,
        resolved.glassHeightPct,
      ),
      tag: resolved.tag,
      baselinePercent: BEST_BOTTLES_SCALE_CARD_BASELINE_PERCENT,
    };
  });

  return {
    version: BEST_BOTTLES_SCALE_CARD_VERSION,
    baselinePercent: BEST_BOTTLES_SCALE_CARD_BASELINE_PERCENT,
    canvasHeightPx: BEST_BOTTLES_SCALE_CARD_DELIVER_HEIGHT_PX,
    sameZoom: true,
    rows,
  };
}
