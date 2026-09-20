/**
 * Sep 7 2026 shoulder lock — Deno / Edge twin of
 * `src/lib/bestBottlesShoulderLock.ts`. Keep numerically identical.
 *
 * Catalog scale source of truth for Cylinder.
 *
 * One horizon per glass body, measured foot-to-shoulder above the 91% baseline.
 * Convex heightWithoutCap / heightWithCap remain product-truth millimeters.
 * They do not choose the on-canvas percentage.
 *
 * Capacity alone is not enough when one capacity has two glasses. Cylinder 50 ml
 * has an 18-415 body (~117 mm bare) and a 16 mm roll-on body (~98 mm bare).
 */

export const BEST_BOTTLES_SHOULDER_LOCK_VERSION =
  "shoulder-lock-2026-09-07" as const;
export const BEST_BOTTLES_SHOULDER_LOCK_BASELINE_PCT = 91 as const;
export const BEST_BOTTLES_SHOULDER_LOCK_SOURCE =
  "hero-reviews/catalog-replacements-2026-09-07" as const;

export type ShoulderLockStatus = "locked" | "draft";

export type ShoulderLockBody = {
  glassBodyKey: string;
  label: string;
  /** Foot-to-shoulder % of canvas height, above the 91% baseline. */
  shoulderPct: number;
  /**
   * Foot-to-shoulder height over outer glass width — a physical constant of the
   * body, measured on the Sep 7 locked heroes. Lets the rig tell the real
   * shoulder from a wrong landmark, which misses these proportions by 50%+.
   */
  bodyAspect: number;
  status: ShoulderLockStatus;
};

export const BEST_BOTTLES_SHOULDER_LOCK_BODIES: readonly ShoulderLockBody[] = [
  { glassBodyKey: "cylinder:3.3-standard", label: "Cylinder 3.3 ml", shoulderPct: 26.5, bodyAspect: 2.109, status: "locked" },
  { glassBodyKey: "cylinder:4-standard", label: "Cylinder 4 ml", shoulderPct: 31.5, bodyAspect: 2.714, status: "locked" },
  { glassBodyKey: "cylinder:5-standard", label: "Cylinder 5 ml", shoulderPct: 36.5, bodyAspect: 2.362, status: "locked" },
  { glassBodyKey: "cylinder:9-standard", label: "Cylinder 9 ml", shoulderPct: 43.5, bodyAspect: 3.127, status: "locked" },
  { glassBodyKey: "cylinder:9-tall", label: "Cylinder 9 ml tall", shoulderPct: 62.5, bodyAspect: 5.326, status: "locked" },
  { glassBodyKey: "cylinder:25-standard", label: "Cylinder 25 ml", shoulderPct: 46.5, bodyAspect: 2.134, status: "locked" },
  { glassBodyKey: "cylinder:28-standard", label: "Cylinder 28 ml", shoulderPct: 50.5, bodyAspect: 2.203, status: "locked" },
  { glassBodyKey: "cylinder:30-standard", label: "Cylinder 30 ml", shoulderPct: 46.0, bodyAspect: 2.65, status: "locked" },
  {
    glassBodyKey: "cylinder:50-standard",
    label: "Cylinder 50 ml 18-415",
    shoulderPct: 56.0,
    bodyAspect: 3.167,
    status: "locked",
  },
  // 98 mm bare glass, between the locked 81 mm / 28 ml shoulder (50.5%)
  // and the locked 117 mm / 18-415 shoulder (56%).
  {
    glassBodyKey: "cylinder:50-rollon",
    label: "Cylinder 50 ml 16 mm roll-on",
    shoulderPct: 53,
    bodyAspect: 2.354,
    status: "locked",
  },
  { glassBodyKey: "cylinder:100-standard", label: "Cylinder 100 ml", shoulderPct: 67.5, bodyAspect: 4.184, status: "locked" },
  { glassBodyKey: "cylinder:114-standard", label: "Cylinder 114 ml plastic", shoulderPct: 49.5, bodyAspect: 2.673, status: "locked" },
  { glassBodyKey: "cylinder:227-standard", label: "Cylinder 227 ml plastic", shoulderPct: 63.0, bodyAspect: 3.045, status: "locked" },
  { glassBodyKey: "cylinder:454-standard", label: "Cylinder 454 ml plastic", shoulderPct: 71.5, bodyAspect: 3.22, status: "locked" },
  // Slim — locked 2026-09-19 by Jordan on the adjustable target sheet
  // (scripts/best-bottles/build-shoulder-target-sheet.ts), against the Sep 7
  // Cylinder ladder for scale. bodyAspect is measured on the flattened uncapped
  // Photoshop sources, where foot-to-shoulder is identical to the pixel across
  // every fitment on a body (1002/1002/1002/1002, 1442/1443/1442, 1874/1874/1874).
  { glassBodyKey: "slim:30-standard", label: "Slim 30 ml", shoulderPct: 48.5, bodyAspect: 2.496, status: "locked" },
  { glassBodyKey: "slim:50-standard", label: "Slim 50 ml", shoulderPct: 54, bodyAspect: 3.492, status: "locked" },
  { glassBodyKey: "slim:100-standard", label: "Slim 100 ml", shoulderPct: 67.5, bodyAspect: 4.372, status: "locked" },
] as const;

const BODIES_BY_KEY = new Map(
  BEST_BOTTLES_SHOULDER_LOCK_BODIES.map((body) => [body.glassBodyKey, body]),
);

export type ShoulderLockProductInput = {
  family?: string | null;
  bottleCollection?: string | null;
  graceSku?: string | null;
  sku?: string | null;
  websiteSku?: string | null;
  itemName?: string | null;
  name?: string | null;
  capacity?: string | null;
  capacityMl?: number | null;
  heightWithoutCap?: string | number | null;
  applicator?: string | null;
  neckThreadSize?: string | null;
};

export type ResolvedShoulderLock = ShoulderLockBody & {
  lockVersion: typeof BEST_BOTTLES_SHOULDER_LOCK_VERSION;
  baselinePct: typeof BEST_BOTTLES_SHOULDER_LOCK_BASELINE_PCT;
  /** Distance from the top of the canvas to the shoulder line. */
  shoulderYFromTopPct: number;
};

function parseLeadingNumber(value: string | number | null | undefined): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  if (typeof value !== "string" || value.trim() === "") return null;
  const match = value.match(/(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const parsed = Number.parseFloat(match[1]!);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeFamily(value?: string | null): string {
  return (value ?? "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

export function isCylinderShoulderLockFamily(input: ShoulderLockProductInput): boolean {
  const family = normalizeFamily(input.family ?? input.bottleCollection);
  return family === "cylinder" || family === "tall cylinder";
}

function sourceText(input: ShoulderLockProductInput): string {
  return [
    input.graceSku,
    input.sku,
    input.websiteSku,
    input.itemName,
    input.name,
    input.family,
    input.applicator,
    input.neckThreadSize,
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ");
}

export function resolveCapacityMl(input: ShoulderLockProductInput): number | null {
  if (typeof input.capacityMl === "number" && Number.isFinite(input.capacityMl) && input.capacityMl > 0) {
    return input.capacityMl;
  }
  const fromCapacityField = parseLeadingNumber(input.capacity);
  if (fromCapacityField != null) return fromCapacityField;
  const match = sourceText(input).match(/(\d+(?:\.\d+)?)\s*ml\b/i);
  if (!match) return null;
  const parsed = Number.parseFloat(match[1]!);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function isTallNineMlCylinder(input: ShoulderLockProductInput): boolean {
  const capacityMl = resolveCapacityMl(input);
  if (capacityMl == null || Math.abs(capacityMl - 9) > 0.2) return false;
  const text = sourceText(input);
  if (/\btall\b/i.test(text) || /tallcyl/i.test(text)) return true;
  const glassMm = parseLeadingNumber(input.heightWithoutCap);
  return glassMm != null && glassMm >= 95;
}

/**
 * 50 ml roll-on is a different glass from the 18-415 spray/lotion/reducer body.
 * Live Convex: ~98 mm bare / 37 mm diameter / 16 mm neck vs ~117 mm / 32 mm / 18-415.
 */
const ROLLER_CUE = /\b(?:mrl|rol|mtlroll|metal\s*roller|plastic\s*roller|roll[-_\s]?on|rollon)\b/i;
const NECK_16_MM = /\b16\s*mm\b/i;
const NECK_18_415 = /\b18\s*[-/]?\s*415\b/i;

export function isFiftyMlRollonCylinder(input: ShoulderLockProductInput): boolean {
  const capacityMl = resolveCapacityMl(input);
  if (capacityMl == null || Math.abs(capacityMl - 50) > 0.2) return false;

  const text = sourceText(input);
  const rollerCue = ROLLER_CUE.test(text);
  const neck16 = NECK_16_MM.test(text);
  const neck18415 = NECK_18_415.test(text);
  if (rollerCue || (neck16 && !neck18415)) return true;
  // An 18-415 neck is the spray/lotion/reducer glass, even when a catalog
  // row has a bad short height (the 85 mm white vintage bulb).
  if (neck18415) return false;

  const glassMm = parseLeadingNumber(input.heightWithoutCap);
  if (glassMm == null || glassMm >= 108) return false;
  // 98 mm roll-on band. 85 mm is not this glass.
  return glassMm >= 90 && glassMm <= 105;
}

function capacityKey(capacityMl: number): string | null {
  if (Math.abs(capacityMl - 3.3) < 0.2 || Math.abs(capacityMl - 3) < 0.05) {
    return "3.3-standard";
  }
  const rounded = Math.round(capacityMl);
  switch (rounded) {
    case 4:
      return "4-standard";
    case 5:
      return "5-standard";
    case 9:
      return "9-standard";
    case 25:
      return "25-standard";
    case 28:
      return "28-standard";
    case 30:
      return "30-standard";
    case 50:
      return "50-standard";
    case 100:
      return "100-standard";
    case 114:
      return "114-standard";
    case 227:
      return "227-standard";
    case 454:
      return "454-standard";
    default:
      return null;
  }
}

/**
 * Slim has exactly three glass bodies. Its catalog reports ten distinct
 * height x diameter pairs, but seven are noise — the known junk 72 mm diameter
 * on the lotion pumps, and rows whose millimetres contradict the capacity in
 * their own name — so the stated capacity is the key, as it is for Cylinder.
 * Any other capacity fails closed.
 */
function slimGlassBodyKey(input: ShoulderLockProductInput): string | null {
  const capacityMl = resolveCapacityMl(input);
  if (capacityMl == null) return null;
  for (const capacity of [30, 50, 100]) {
    if (Math.abs(capacityMl - capacity) <= 0.2) return `slim:${capacity}-standard`;
  }
  return null;
}

export function resolveGlassBodyKey(input: ShoulderLockProductInput): string | null {
  if (normalizeFamily(input.family ?? input.bottleCollection) === "slim") return slimGlassBodyKey(input);
  if (!isCylinderShoulderLockFamily(input)) return null;
  const capacityMl = resolveCapacityMl(input);
  if (capacityMl == null) return null;
  if (isTallNineMlCylinder(input)) return "cylinder:9-tall";
  if (isFiftyMlRollonCylinder(input)) return "cylinder:50-rollon";
  const suffix = capacityKey(capacityMl);
  return suffix ? `cylinder:${suffix}` : null;
}

export function resolveShoulderLock(
  input: ShoulderLockProductInput,
): ResolvedShoulderLock | null {
  const glassBodyKey = resolveGlassBodyKey(input);
  if (!glassBodyKey) return null;
  const body = BODIES_BY_KEY.get(glassBodyKey);
  if (!body || body.status !== "locked") return null;
  return {
    ...body,
    lockVersion: BEST_BOTTLES_SHOULDER_LOCK_VERSION,
    baselinePct: BEST_BOTTLES_SHOULDER_LOCK_BASELINE_PCT,
    shoulderYFromTopPct: Number(
      (BEST_BOTTLES_SHOULDER_LOCK_BASELINE_PCT - body.shoulderPct).toFixed(1),
    ),
  };
}
