/**
 * Best Bottles catalog scale.
 *
 * Scale-card v1 (`best-bottles-scale-card-v1-2026-09-16`) is the authority for
 * catalog masters: bare-glass heightWithoutCap (mm) → glass height % via
 * monotone PCHIP. Capacity must not participate in that mapping.
 *
 * Legacy capacity knots remain exported for non-master callers that have not
 * yet migrated off the assembled-height rail.
 */

export const BEST_BOTTLES_SCALE_CARD_VERSION =
  "best-bottles-scale-card-v1-2026-09-16" as const;

export const BEST_BOTTLES_SCALE_CARD_BASELINE_PERCENT = 91 as const;
export const BEST_BOTTLES_SCALE_CARD_BASELINE_PCT_FROM_BOTTOM = 9 as const;
export const BEST_BOTTLES_SCALE_CARD_GENERATE_WIDTH_PX = 2080 as const;
export const BEST_BOTTLES_SCALE_CARD_GENERATE_HEIGHT_PX = 2288 as const;
export const BEST_BOTTLES_SCALE_CARD_DELIVER_WIDTH_PX = 1560 as const;
export const BEST_BOTTLES_SCALE_CARD_DELIVER_HEIGHT_PX = 1716 as const;

export const BEST_BOTTLES_SCALE_CARD_CONTROL_POINTS = [
  { mm: 20, glassPct: 23.0 },
  { mm: 40, glassPct: 33.0 },
  { mm: 68, glassPct: 46.7 },
  { mm: 78, glassPct: 52.4 },
  { mm: 106, glassPct: 65.5 },
  { mm: 117, glassPct: 68.0 },
  { mm: 154, glassPct: 74.0 },
  { mm: 195, glassPct: 80.0 },
] as const;

export type BestBottlesGlassScale = {
  glassHeightPct: number;
  targetGlassHeightPx: number;
  tag: string;
};

/** @deprecated Prefer BEST_BOTTLES_SCALE_CARD_VERSION for catalog masters. */
export const BEST_BOTTLES_CATALOG_SCALE_VERSION = "best-bottles-catalog-scale-v1" as const;

/** @deprecated Capacity knots superseded by scale-card bare-glass PCHIP for masters. */
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

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function pchipEdgeSlope(
  h0: number,
  h1: number,
  delta0: number,
  delta1: number,
): number {
  // SciPy PchipInterpolator endpoint (Fritsch–Carlson monotone cubic).
  let slope = ((2 * h0 + h1) * delta0 - h0 * delta1) / (h0 + h1);
  if (Math.sign(slope) !== Math.sign(delta0)) {
    slope = 0;
  } else if (
    Math.sign(delta0) !== Math.sign(delta1)
    && Math.abs(slope) > 3 * Math.abs(delta0)
  ) {
    slope = 3 * delta0;
  }
  return slope;
}

function pchipDerivatives(xs: readonly number[], ys: readonly number[]): number[] {
  const n = xs.length;
  const h: number[] = [];
  const delta: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    h[i] = xs[i + 1]! - xs[i]!;
    delta[i] = (ys[i + 1]! - ys[i]!) / h[i]!;
  }

  const d = new Array<number>(n);
  d[0] = pchipEdgeSlope(h[0]!, h[1]!, delta[0]!, delta[1]!);
  d[n - 1] = pchipEdgeSlope(h[n - 2]!, h[n - 3]!, delta[n - 2]!, delta[n - 3]!);

  for (let i = 1; i < n - 1; i += 1) {
    if (delta[i - 1]! * delta[i]! <= 0) {
      d[i] = 0;
      continue;
    }
    const w1 = 2 * h[i]! + h[i - 1]!;
    const w2 = h[i]! + 2 * h[i - 1]!;
    d[i] = (w1 + w2) / (w1 / delta[i - 1]! + w2 / delta[i]!);
  }
  return d;
}

function evaluateMonotonePchip(mm: number): number {
  const xs = BEST_BOTTLES_SCALE_CARD_CONTROL_POINTS.map((point) => point.mm);
  const ys = BEST_BOTTLES_SCALE_CARD_CONTROL_POINTS.map((point) => point.glassPct);
  const first = xs[0]!;
  const last = xs[xs.length - 1]!;
  const clamped = Math.min(last, Math.max(first, mm));
  if (clamped === first) return ys[0]!;
  if (clamped === last) return ys[ys.length - 1]!;

  const d = pchipDerivatives(xs, ys);
  let i = 0;
  while (i < xs.length - 2 && !(clamped >= xs[i]! && clamped <= xs[i + 1]!)) {
    i += 1;
  }
  const h = xs[i + 1]! - xs[i]!;
  const t = (clamped - xs[i]!) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return h00 * ys[i]! + h10 * h * d[i]! + h01 * ys[i + 1]! + h11 * h * d[i + 1]!;
}

function resolveScaleTag(heightWithoutCapMm: number): string {
  const nearestDecade = Math.floor(heightWithoutCapMm / 10 + 0.5) * 10;
  const clamped = Math.min(200, Math.max(20, nearestDecade));
  return `S${clamped}`;
}

/**
 * Resolve bare-glass catalog scale from verified heightWithoutCap (mm).
 * Capacity must not be passed here — size is set by foot-to-rim glass only.
 */
export function resolveBestBottlesGlassScale(
  heightWithoutCapMm: number,
): BestBottlesGlassScale {
  if (!Number.isFinite(heightWithoutCapMm) || heightWithoutCapMm <= 0) {
    throw new Error("A positive bare-glass heightWithoutCapMm is required.");
  }

  const glassHeightPct = roundToOneDecimal(evaluateMonotonePchip(heightWithoutCapMm));
  return {
    glassHeightPct,
    targetGlassHeightPx: Math.round(
      (glassHeightPct / 100) * BEST_BOTTLES_SCALE_CARD_GENERATE_HEIGHT_PX,
    ),
    tag: resolveScaleTag(heightWithoutCapMm),
  };
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
