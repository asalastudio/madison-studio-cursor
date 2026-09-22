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

/** Twin of ShoulderLandmarkKind in `src/lib/product-image/shoulderLandmark.ts`. */
export type ShoulderLandmarkKind = "shoulder" | "closure-seat";

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
  // Elegant — locked 2026-09-19 by Jordan on the all-family target sheet, read
  // back from the page rather than transcribed. Each size is set from one north
  // star (the clear-glass fine-mist sprayer); every colour and fitment at that
  // size follows it. bodyAspect is the north star's, foot-to-shoulder over glass
  // width, on the flattened uncapped Photoshop source.
  { glassBodyKey: "elegant:15-standard", label: "Elegant 15 ml", shoulderPct: 39, bodyAspect: 1.358, status: "locked" },
  { glassBodyKey: "elegant:30-standard", label: "Elegant 30 ml", shoulderPct: 43, bodyAspect: 1.381, status: "locked" },
  { glassBodyKey: "elegant:60-standard", label: "Elegant 60 ml", shoulderPct: 47, bodyAspect: 1.253, status: "locked" },
  { glassBodyKey: "elegant:100-standard", label: "Elegant 100 ml", shoulderPct: 57, bodyAspect: 1.517, status: "locked" },
  // Sleek — locked 2026-09-20 by Jordan on the all-family target sheet, read
  // back from the page. One north star per size (the clear fine-mist sprayer);
  // every colour and fitment on that glass follows it. Jordan set the three
  // tall bodies below the Cylinder ladder's suggestion (30 ml 47 against 50.5,
  // 50 ml 56 against 63, 100 ml 60.5 against 66): a tall slim bottle at ladder
  // height reads too dominant on the card. The ladder is an opening position,
  // not the decision. 2026-09-21: 5 ml 37 -> 33. The 5 ml and 8 ml share 17 mm
  // glass, and at 37 the 5 ml drew 1.5x the 8 ml's scale (464 vs 308 px wide)
  // and read zoomed in beside it; Jordan picked 33 on a re-scaled preview and
  // kept the 8 ml at 43.
  { glassBodyKey: "sleek:5-standard", label: "Sleek 5 ml", shoulderPct: 33, bodyAspect: 1.76, status: "locked" },
  { glassBodyKey: "sleek:8-standard", label: "Sleek 8 ml", shoulderPct: 43, bodyAspect: 3.148, status: "locked" },
  { glassBodyKey: "sleek:30-standard", label: "Sleek 30 ml", shoulderPct: 47, bodyAspect: 2.753, status: "locked" },
  { glassBodyKey: "sleek:50-standard", label: "Sleek 50 ml", shoulderPct: 56, bodyAspect: 4.412, status: "locked" },
  { glassBodyKey: "sleek:100-standard", label: "Sleek 100 ml", shoulderPct: 60.5, bodyAspect: 3.749, status: "locked" },
  // Boston Round — locked 2026-09-20 by Jordan on the all-family target sheet,
  // read back from the page. A round bottle like Cylinder, and it lands on the
  // Cylinder ladder: 68 mm 42 against an opening of 42.5, 78 mm 45 against 45.5,
  // 94 mm 52 against 49.5. Every bottle's own shoulder reading agreed with its
  // north star, so none had to be placed from it.
  { glassBodyKey: "boston-round:15-standard", label: "Boston Round 15 ml", shoulderPct: 42, bodyAspect: 1.947, status: "locked" },
  { glassBodyKey: "boston-round:30-standard", label: "Boston Round 30 ml", shoulderPct: 45, bodyAspect: 1.727, status: "locked" },
  { glassBodyKey: "boston-round:60-standard", label: "Boston Round 60 ml", shoulderPct: 52, bodyAspect: 1.817, status: "locked" },
  // Diva — locked 2026-09-21 by Jordan on the all-family target sheet, the first
  // family measured to the closure seat (where the cap starts at the neck) rather
  // than the shoulder: an urn has no straight wall for a shoulder to end. Set
  // against the Cylinder ladder's openings: 81 mm 40 against 46, 89 mm 47 against
  // 48, 113 mm 57 against 55. Aspect is foot-to-seat over the belly; every
  // fitment agreed with its north star within ~1%.
  { glassBodyKey: "diva:30-standard", label: "Diva 30 ml", shoulderPct: 40, bodyAspect: 1.505, status: "locked" },
  { glassBodyKey: "diva:46-standard", label: "Diva 46 ml", shoulderPct: 47, bodyAspect: 1.517, status: "locked" },
  { glassBodyKey: "diva:100-standard", label: "Diva 100 ml", shoulderPct: 57, bodyAspect: 1.486, status: "locked" },
  // Circle and Round — locked 2026-09-21 by Jordan on the all-family target sheet,
  // on the closure seat like Diva (where the cap starts at the neck): curved glass
  // has no straight wall for a shoulder to end. Round has no neck ring, so its seat
  // is the corner where the body meets the collar or threads. Against the Cylinder
  // ladder's openings: Circle 60 mm 40 vs 39.5, 74 mm 44 vs 44.5, 87 mm 48 vs 47.5,
  // 105 mm 56 vs 52.5; Round 73 mm 42.5 vs 44, 83 mm 52 vs 46.5. Aspect is
  // foot-to-seat over the belly.
  { glassBodyKey: "circle:15-standard", label: "Circle 15 ml", shoulderPct: 40, bodyAspect: 1.006, status: "locked" },
  { glassBodyKey: "circle:30-standard", label: "Circle 30 ml", shoulderPct: 44, bodyAspect: 1.026, status: "locked" },
  { glassBodyKey: "circle:50-standard", label: "Circle 50 ml", shoulderPct: 48, bodyAspect: 0.951, status: "locked" },
  { glassBodyKey: "circle:100-standard", label: "Circle 100 ml", shoulderPct: 56, bodyAspect: 0.98, status: "locked" },
  { glassBodyKey: "round:78-standard", label: "Round 78 ml", shoulderPct: 42.5, bodyAspect: 0.961, status: "locked" },
  { glassBodyKey: "round:128-standard", label: "Round 128 ml", shoulderPct: 52, bodyAspect: 0.979, status: "locked" },
  // Empire — locked 2026-09-21 by Jordan on the rebuilt sheet (the touching-cap
  // split fix removed a false narrower 50 ml body read off the dropper and lotion
  // pump). A square-section shoulder, measured as a shoulder. Against the Cylinder
  // ladder's openings: 88 mm 47.5 vs 48, 107 mm 57.5 vs 53. Set 48/57, then
  // nudged to 47.5/57.5 on the sheet the same day.
  { glassBodyKey: "empire:50-standard", label: "Empire 50 ml", shoulderPct: 47.5, bodyAspect: 1.95, status: "locked" },
  { glassBodyKey: "empire:100-standard", label: "Empire 100 ml", shoulderPct: 57.5, bodyAspect: 1.973, status: "locked" },
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
  /** The point on the glass shoulderPct and bodyAspect are measured to. */
  landmark: ShoulderLandmarkKind;
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
  // The 5 ml glass is also sold labelled "5.5 ml" (the fine-mist variant, same
  // 53 mm body). Math.round(5.5) is 6, which has no lock, so the edge function
  // refused it outright — the catalog row says 5, but the item name says 5.5
  // and the edge reads the name.
  if (Math.abs(capacityMl - 5.5) < 0.05) return "5-standard";
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
 * Families whose glass body is fully named by the stated capacity: lock a size
 * once and every colour and fitment on that glass holds the same shoulder.
 *
 * The catalog cannot be the key. Slim reports ten distinct height x diameter
 * pairs for three bodies — the known junk 72 mm diameter on the lotion pumps,
 * and rows whose millimetres contradict the capacity in their own name. Elegant
 * reports 70 mm on some frosted 15 ml rows and 92 mm on its 60 ml bulb sprayers
 * for the same 61 mm and 86 mm glass. Any capacity not listed fails closed.
 */
const CAPACITY_KEYED_FAMILIES: Readonly<Record<string, { keyPrefix: string; capacitiesMl: readonly number[] }>> = {
  slim: { keyPrefix: "slim", capacitiesMl: [30, 50, 100] },
  elegant: { keyPrefix: "elegant", capacitiesMl: [15, 30, 60, 100] },
  sleek: { keyPrefix: "sleek", capacitiesMl: [5, 8, 30, 50, 100] },
  "boston round": { keyPrefix: "boston-round", capacitiesMl: [15, 30, 60] },
  diva: { keyPrefix: "diva", capacitiesMl: [30, 46, 100] },
  circle: { keyPrefix: "circle", capacitiesMl: [15, 30, 50, 100] },
  round: { keyPrefix: "round", capacitiesMl: [78, 128] },
  empire: { keyPrefix: "empire", capacitiesMl: [50, 100] },
};

function capacityKeyedGlassBodyKey(
  family: { keyPrefix: string; capacitiesMl: readonly number[] },
  input: ShoulderLockProductInput,
): string | null {
  const capacityMl = resolveCapacityMl(input);
  if (capacityMl == null) return null;
  for (const capacity of family.capacitiesMl) {
    if (Math.abs(capacityMl - capacity) <= 0.2) return `${family.keyPrefix}:${capacity}-standard`;
  }
  return null;
}

/**
 * Families measured to the closure seat — where the cap starts at the neck —
 * instead of the shoulder. Glass with no straight wall: on Diva's urn the
 * shoulder rule fell through the body (Jordan, 2026-09-21), and on Circle and
 * Round it found no shoulder at all (47 of 48 groups held off the sheets).
 * Everything else, including every body locked before this, stays on the
 * shoulder.
 */
const CLOSURE_SEAT_FAMILIES: ReadonlySet<string> = new Set(["diva", "circle", "round"]);

export function resolveShoulderLandmarkKind(input: ShoulderLockProductInput): ShoulderLandmarkKind {
  return CLOSURE_SEAT_FAMILIES.has(normalizeFamily(input.family ?? input.bottleCollection))
    ? "closure-seat"
    : "shoulder";
}

export function resolveGlassBodyKey(input: ShoulderLockProductInput): string | null {
  const capacityKeyed = CAPACITY_KEYED_FAMILIES[normalizeFamily(input.family ?? input.bottleCollection)];
  if (capacityKeyed) return capacityKeyedGlassBodyKey(capacityKeyed, input);
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
    landmark: resolveShoulderLandmarkKind(input),
  };
}
