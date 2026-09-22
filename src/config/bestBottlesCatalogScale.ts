/**
 * Best Bottles catalog scale.
 *
 * Scale-card v2 (`best-bottles-scale-card-v2-2026-09-18`) is the authority for
 * catalog masters: bare-glass heightWithoutCap (mm) → discrete ecommerce fill
 * bands. Capacity must not participate in that mapping.
 *
 * v1 continuous PCHIP undersized short glass (~31–48% fill), leaving too much
 * empty canvas on 3–28 ml cards. v2 raises the small-end floor while keeping
 * 100 ml+ at 74%.
 *
 * Legacy capacity knots remain exported for non-master callers that have not
 * yet migrated off the assembled-height rail.
 */

export const BEST_BOTTLES_SCALE_CARD_VERSION =
  "best-bottles-scale-card-v2-2026-09-18" as const;

export const BEST_BOTTLES_SCALE_CARD_BASELINE_PERCENT = 91 as const;
export const BEST_BOTTLES_SCALE_CARD_BASELINE_PCT_FROM_BOTTOM = 9 as const;
export const BEST_BOTTLES_SCALE_CARD_GENERATE_WIDTH_PX = 2080 as const;
export const BEST_BOTTLES_SCALE_CARD_GENERATE_HEIGHT_PX = 2288 as const;
export const BEST_BOTTLES_SCALE_CARD_DELIVER_WIDTH_PX = 1560 as const;
export const BEST_BOTTLES_SCALE_CARD_DELIVER_HEIGHT_PX = 1716 as const;

export type BestBottlesScaleCardLevel =
  | "Mini"
  | "Small"
  | "Medium"
  | "Large"
  | "Standard";

export type BestBottlesScaleCardHeightBand = {
  level: BestBottlesScaleCardLevel;
  /** Inclusive lower bound in mm. Mini uses 0. */
  mmMinInclusive: number;
  /** Exclusive upper bound in mm. Standard uses Infinity. */
  mmMaxExclusive: number;
  glassPct: number;
};

/**
 * Five bare-glass height bands. Half-open intervals: [min, max).
 * Measure foot-to-rim glass only — never capacity.
 */
export const BEST_BOTTLES_SCALE_CARD_HEIGHT_BANDS = [
  { level: "Mini", mmMinInclusive: 0, mmMaxExclusive: 45, glassPct: 52 },
  { level: "Small", mmMinInclusive: 45, mmMaxExclusive: 65, glassPct: 58 },
  { level: "Medium", mmMinInclusive: 65, mmMaxExclusive: 95, glassPct: 64 },
  { level: "Large", mmMinInclusive: 95, mmMaxExclusive: 135, glassPct: 70 },
  { level: "Standard", mmMinInclusive: 135, mmMaxExclusive: Number.POSITIVE_INFINITY, glassPct: 74 },
] as const satisfies readonly BestBottlesScaleCardHeightBand[];

/**
 * Overlay / QA tick points: one sample mm inside each band at the band fill.
 * Not used for interpolation — v2 is a step function.
 */
export const BEST_BOTTLES_SCALE_CARD_CONTROL_POINTS = [
  { mm: 37, glassPct: 52.0, level: "Mini" as const },
  { mm: 53, glassPct: 58.0, level: "Small" as const },
  { mm: 70, glassPct: 64.0, level: "Medium" as const },
  { mm: 117, glassPct: 70.0, level: "Large" as const },
  { mm: 154, glassPct: 74.0, level: "Standard" as const },
] as const;

export type BestBottlesGlassScale = {
  glassHeightPct: number;
  targetGlassHeightPx: number;
  tag: string;
  level: BestBottlesScaleCardLevel;
};

/** @deprecated Prefer BEST_BOTTLES_SCALE_CARD_VERSION for catalog masters. */
export const BEST_BOTTLES_CATALOG_SCALE_VERSION = "best-bottles-catalog-scale-v1" as const;

/** @deprecated Capacity knots superseded by scale-card bare-glass bands for masters. */
export const BEST_BOTTLES_GLOBAL_SCALE_KNOTS = [
  { capacityMl: 1, assembledHeightPct: 54 },
  { capacityMl: 3, assembledHeightPct: 56 },
  { capacityMl: 4, assembledHeightPct: 58 },
  { capacityMl: 5, assembledHeightPct: 61 },
  { capacityMl: 9, assembledHeightPct: 69 },
  { capacityMl: 28, assembledHeightPct: 74 },
  { capacityMl: 30, assembledHeightPct: 75 },
  { capacityMl: 50, assembledHeightPct: 78 },
  { capacityMl: 100, assembledHeightPct: 79 },
  { capacityMl: 118, assembledHeightPct: 80 },
  { capacityMl: 227, assembledHeightPct: 82 },
  { capacityMl: 454, assembledHeightPct: 84 },
] as const;

export const BEST_BOTTLES_MAX_FAMILY_SCALE_CORRECTION_PCT = 2 as const;

/** Small-end remaster cohort: bare glass shorter than Large band (mm < 95). */
export const BEST_BOTTLES_SCALE_CARD_V2_SMALL_END_MM_MAX_EXCLUSIVE = 95 as const;

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

export function resolveBestBottlesScaleCardBand(
  heightWithoutCapMm: number,
): (typeof BEST_BOTTLES_SCALE_CARD_HEIGHT_BANDS)[number] {
  if (!Number.isFinite(heightWithoutCapMm) || heightWithoutCapMm <= 0) {
    throw new Error("A positive bare-glass heightWithoutCapMm is required.");
  }
  for (const band of BEST_BOTTLES_SCALE_CARD_HEIGHT_BANDS) {
    if (
      heightWithoutCapMm >= band.mmMinInclusive &&
      heightWithoutCapMm < band.mmMaxExclusive
    ) {
      return band;
    }
  }
  return BEST_BOTTLES_SCALE_CARD_HEIGHT_BANDS[BEST_BOTTLES_SCALE_CARD_HEIGHT_BANDS.length - 1]!;
}

/**
 * Resolve bare-glass catalog scale from verified heightWithoutCap (mm).
 * Capacity must not be passed here — size is set by foot-to-rim glass only.
 */
export function resolveBestBottlesGlassScale(
  heightWithoutCapMm: number,
): BestBottlesGlassScale {
  const band = resolveBestBottlesScaleCardBand(heightWithoutCapMm);
  const glassHeightPct = roundToOneDecimal(band.glassPct);
  return {
    glassHeightPct,
    targetGlassHeightPx: Math.round(
      (glassHeightPct / 100) * BEST_BOTTLES_SCALE_CARD_GENERATE_HEIGHT_PX,
    ),
    tag: band.level,
    level: band.level,
  };
}

export function isBestBottlesScaleCardV2SmallEnd(
  heightWithoutCapMm: number,
): boolean {
  if (!Number.isFinite(heightWithoutCapMm) || heightWithoutCapMm <= 0) {
    return false;
  }
  return heightWithoutCapMm < BEST_BOTTLES_SCALE_CARD_V2_SMALL_END_MM_MAX_EXCLUSIVE;
}

/** @deprecated Prefer resolveBestBottlesGlassScale(heightWithoutCapMm) for masters. */
export function resolveBestBottlesGlobalScalePct(capacityMl: number): number {
  if (!Number.isFinite(capacityMl) || capacityMl <= 0) {
    throw new Error("A positive capacityMl is required.");
  }

  const first = BEST_BOTTLES_GLOBAL_SCALE_KNOTS[0];
  const last = BEST_BOTTLES_GLOBAL_SCALE_KNOTS[BEST_BOTTLES_GLOBAL_SCALE_KNOTS.length - 1];
  if (capacityMl <= first.capacityMl) return first.assembledHeightPct;
  if (capacityMl >= last.capacityMl) return last.assembledHeightPct;

  const upperIndex = BEST_BOTTLES_GLOBAL_SCALE_KNOTS.findIndex(
    (knot) => knot.capacityMl >= capacityMl,
  );
  const lower = BEST_BOTTLES_GLOBAL_SCALE_KNOTS[upperIndex - 1];
  const upper = BEST_BOTTLES_GLOBAL_SCALE_KNOTS[upperIndex];
  const progress = (capacityMl - lower.capacityMl) / (upper.capacityMl - lower.capacityMl);
  return lower.assembledHeightPct
    + progress * (upper.assembledHeightPct - lower.assembledHeightPct);
}

export function applyBestBottlesFamilyScaleCorrection(
  basePct: number,
  correctionPct: number,
): number {
  if (!Number.isFinite(basePct) || !Number.isFinite(correctionPct)) {
    throw new Error("Scale targets and family corrections must be finite numbers.");
  }
  if (Math.abs(correctionPct) > BEST_BOTTLES_MAX_FAMILY_SCALE_CORRECTION_PCT) {
    throw new Error("Family scale correction must remain within ±2 percentage points.");
  }
  return basePct + correctionPct;
}

/** @deprecated Prefer resolveBestBottlesGlassScale targetGlassHeightPx for masters. */
export function deriveBestBottlesBodyTargetPx(input: {
  canvasHeightPx: number;
  assembledHeightPct: number;
  verifiedBodyHeightMm: number;
  verifiedAssembledHeightMm: number;
}): number {
  if (
    !Number.isFinite(input.canvasHeightPx)
    || !Number.isFinite(input.assembledHeightPct)
    || !Number.isFinite(input.verifiedBodyHeightMm)
    || !Number.isFinite(input.verifiedAssembledHeightMm)
    || input.canvasHeightPx <= 0
    || input.assembledHeightPct <= 0
    || input.verifiedBodyHeightMm <= 0
    || input.verifiedAssembledHeightMm <= 0
  ) {
    throw new Error("Verified positive canvas, target, body, and assembled heights are required.");
  }

  return Math.round(
    input.canvasHeightPx
      * (input.assembledHeightPct / 100)
      * (input.verifiedBodyHeightMm / input.verifiedAssembledHeightMm),
  );
}
