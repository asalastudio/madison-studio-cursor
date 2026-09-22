/**
 * Paper-Doll Rig — component & body-plate registry (build task 1).
 * Spec: docs/superpowers/specs/2026-07-30-paper-doll-rig-design.md
 *
 * The registry is the SHA-pinned catalog of reusable parts:
 *   - closures, keyed `neckThreadSize × applicator × colorway` (the same key the
 *     PSD estate itself uses: "17. 13-415 Caps", "18. 13-415 Sprayers", …)
 *   - body plates, one true-north per geometry × color, mm-joined to the canon CSV
 *
 * Pure data module: no filesystem, no sharp, no network — everything here is
 * Node-testable. The intake CLI (scripts/paper-doll/intake-component.ts) does I/O
 * and pixel decoding, then calls into these functions.
 */

export const PAPER_DOLL_REGISTRY_VERSION = 1;

/** Locked canvas — plates are born on Bone (decision 2026-07-30). */
export const PAPER_DOLL_CANVAS_HEX = "#F5F3EF";
export const PAPER_DOLL_CANVAS_RGB = { r: 0xf5, g: 0xf3, b: 0xef } as const;

export type PaperDollRole = "closure" | "body-plate";
export type IntakeSourceKind = "psd-layer-export" | "photograph" | "generated";
export type RegistryStatus = "pending-review" | "approved" | "rejected";

export interface ClosureKey {
  neckThreadSize: string; // e.g. "13-415"
  applicator: string; //     e.g. "Metal Roller Ball", "Fine Mist Sprayer"
  colorway: string; //       e.g. "Shiny Gold"
  /** Physical height of the part's visible extent — enables the mm-aware
   * resolution floor and downstream placement defaults. */
  heightMm?: number;
}

export interface BodyPlateKey {
  family: string; //         e.g. "Cylinder"
  capacityMl: number; //     e.g. 9
  color: string; //          e.g. "Clear"
  bodyHeightMm: number; //   canon_bodyHeightMm
  widthAxisMm: number; //    canon_widthAxisMm
}

export interface AssetFingerprint {
  /** Repo-relative pointer for local work — sha256 is the identity truth. */
  path: string;
  /**
   * Canonical byte vault: public Supabase URL under
   * reference-images/best-bottles/paper-doll/<kind>/<id>__<sha12>.png
   * (same SHA-in-filename convention as the visual-target plates).
   */
  storageUrl?: string | null;
  sha256: string;
  widthPx: number;
  heightPx: number;
  hasAlpha: boolean;
}

export interface IntakeProvenance {
  source: IntakeSourceKind;
  sourcePsd?: string | null;
  sourcePsdScenes?: string | null;
  sourceSha256?: string | null;
  intakeDate: string; // ISO
  intakeBy?: string | null;
}

/** Master-canvas density: a 70mm body on the 2080×2288 plate ≈ 22 px/mm. */
export const MASTER_TARGET_PX_PER_MM = 22;

export interface IntakeQaReport {
  /** Non-blocking flags (e.g. acceptable-but-upscaled resolution). */
  warnings?: string[];
  /** Foreground (alpha>0) px ÷ total px. Null when the file has no alpha channel. */
  alphaCoverageRatio: number | null;
  /**
   * Mean ΔRGB of the semi-transparent fringe band (alpha 10–245) vs Bone —
   * a defringe proxy: high values mean edge halo from a non-Bone background.
   */
  edgeHaloDelta: number | null;
  /** Light-contract check: which side the key light reads from. */
  keySide: "left" | "right" | "ambiguous" | null;
  /** Mean ΔRGB of the border ring vs Bone (body plates live on Bone). */
  backgroundBoneDelta: number | null;
  minEdgePaddingPx: number | null;
  issues: string[];
  passed: boolean;
}

export interface RegistryEntry {
  id: string;
  role: PaperDollRole;
  closureKey?: ClosureKey;
  bodyPlateKey?: BodyPlateKey;
  asset: AssetFingerprint;
  provenance: IntakeProvenance;
  qa: IntakeQaReport;
  status: RegistryStatus;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  notes?: string | null;
}

export interface RegistryFile {
  version: number;
  updatedAt: string;
  entries: RegistryEntry[];
}

// ─── Keys & ids ───────────────────────────────────────────────────────

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildClosureId(key: ClosureKey): string {
  return ["closure", slugify(key.neckThreadSize), slugify(key.applicator), slugify(key.colorway)].join("__");
}

/**
 * Physical fitment identity inside a storefront product group:
 * neckThreadSize × applicator × finish/color × cap state.
 * Components-tab slots must use this (not applicator+capColor alone).
 */
export type FitmentCapState =
  | "assembled-cap-on"
  | "cap-off-applicator-exposed"
  | "detached-cap-or-sidecar"
  | "unspecified";

export interface PhysicalFitmentKey {
  neckThreadSize: string;
  applicator: string;
  finishColor: string;
  capState: FitmentCapState | string;
}

export function buildPhysicalFitmentKey(key: PhysicalFitmentKey): string {
  return [
    slugify(key.neckThreadSize || "unspec"),
    slugify(key.applicator || "unspec"),
    slugify(key.finishColor || "unspec"),
    slugify(key.capState || "unspecified"),
  ].join("|");
}

export function buildFitmentSlotId(input: {
  neckThreadSize?: string | null;
  applicator: string;
  capColor?: string | null;
  capState?: string | null;
}): string {
  return [
    "fitment",
    slugify(input.neckThreadSize || "unspec"),
    slugify(input.applicator || "unspec"),
    slugify(input.capColor || "unspec"),
    slugify(input.capState || "assembled-cap-on"),
  ].join("-");
}

export function buildBodyPlateId(key: BodyPlateKey): string {
  return [
    "body",
    slugify(key.family),
    `${key.capacityMl}ml`,
    slugify(key.color),
    `${key.bodyHeightMm.toFixed(1)}x${key.widthAxisMm.toFixed(1)}mm`,
  ].join("__");
}

export function registryIdForEntry(
  role: PaperDollRole,
  closureKey?: ClosureKey,
  bodyPlateKey?: BodyPlateKey,
): string {
  if (role === "closure") {
    if (!closureKey) throw new Error("closure entries require a closureKey");
    return buildClosureId(closureKey);
  }
  if (!bodyPlateKey) throw new Error("body-plate entries require a bodyPlateKey");
  return buildBodyPlateId(bodyPlateKey);
}

// ─── Registry mutation ────────────────────────────────────────────────

export interface UpsertResult {
  entries: RegistryEntry[];
  action: "created" | "updated" | "unchanged";
}

/**
 * Insert or update by id. An APPROVED entry is frozen: replacing its asset
 * bytes (different sha256) throws unless `force` — the whole point of the
 * SHA-pin is that model non-determinism is survived once per part, ever.
 */
export function upsertRegistryEntry(
  entries: RegistryEntry[],
  entry: RegistryEntry,
  options: { force?: boolean } = {},
): UpsertResult {
  const existingIndex = entries.findIndex((e) => e.id === entry.id);
  if (existingIndex === -1) {
    return { entries: [...entries, entry], action: "created" };
  }
  const existing = entries[existingIndex];
  if (
    existing.asset.sha256 === entry.asset.sha256 &&
    existing.status === entry.status &&
    existing.qa.passed === entry.qa.passed
  ) {
    return { entries, action: "unchanged" };
  }
  if (existing.status === "approved" && existing.asset.sha256 !== entry.asset.sha256 && !options.force) {
    throw new Error(
      `Registry entry '${entry.id}' is approved and SHA-frozen (${existing.asset.sha256.slice(0, 12)}…). ` +
        `Refusing to replace its asset without --force.`,
    );
  }
  const next = [...entries];
  next[existingIndex] = entry;
  return { entries: next, action: "updated" };
}

export function approveRegistryEntry(
  entries: RegistryEntry[],
  id: string,
  reviewedBy: string,
  nowIso: string,
): RegistryEntry[] {
  const index = entries.findIndex((e) => e.id === id);
  if (index === -1) throw new Error(`No registry entry '${id}' to approve.`);
  const entry = entries[index];
  if (!entry.qa.passed) {
    throw new Error(
      `Entry '${id}' has failing intake QA (${entry.qa.issues.join("; ") || "unspecified"}). ` +
        `Fix the asset and re-intake before approving.`,
    );
  }
  const next = [...entries];
  next[index] = { ...entry, status: "approved", reviewedBy, reviewedAt: nowIso };
  return next;
}

// ─── Pixel QA (pure — operates on raw RGBA buffers) ──────────────────

export interface RgbaImage {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
  hasAlpha: boolean;
}

interface ForegroundBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
  count: number;
}

function foregroundBounds(image: RgbaImage, alphaFloor = 8): ForegroundBounds | null {
  const { data, width, height } = image;
  let left = width, right = -1, top = height, bottom = -1, count = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3];
      if (a > alphaFloor) {
        count++;
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  return count === 0 ? null : { left, right, top, bottom, count };
}

export function analyzeAlpha(image: RgbaImage): {
  coverageRatio: number;
  bounds: ForegroundBounds | null;
  minEdgePaddingPx: number | null;
} {
  const bounds = foregroundBounds(image);
  const total = image.width * image.height;
  const coverageRatio = bounds ? bounds.count / total : 0;
  const minEdgePaddingPx = bounds
    ? Math.min(bounds.left, bounds.top, image.width - 1 - bounds.right, image.height - 1 - bounds.bottom)
    : null;
  return { coverageRatio, bounds, minEdgePaddingPx };
}

/**
 * Defringe proxy: mean ΔRGB of the semi-transparent fringe band vs the SOLID
 * foreground's mean color. A clean straight-alpha cutout's fringe carries the
 * OBJECT's own color (correct un-premultiplied AA); a fringe pulled toward an
 * old background (white studio, gray card) reads high.
 *
 * Calibrated on the first real estate part (2026-07-31): the gold sprayer's
 * fringe measured Δ143 vs Bone while being perfectly clean — fringe must be
 * compared to the object, never to the canvas.
 */
export function measureEdgeHaloDelta(image: RgbaImage, windowPx = 4): number | null {
  const { data, width, height } = image;
  let sum = 0, n = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3];
      if (a < 10 || a > 245) continue;
      // Local solid neighborhood — multi-material components (gold cap +
      // white collar + translucent tube on one sprayer) make any global
      // mean meaningless.
      let sr = 0, sg = 0, sb = 0, sn = 0;
      for (let wy = Math.max(0, y - windowPx); wy <= Math.min(height - 1, y + windowPx); wy++) {
        for (let wx = Math.max(0, x - windowPx); wx <= Math.min(width - 1, x + windowPx); wx++) {
          const wi = (wy * width + wx) * 4;
          if (data[wi + 3] >= 250) {
            sr += data[wi];
            sg += data[wi + 1];
            sb += data[wi + 2];
            sn++;
          }
        }
      }
      if (sn === 0) continue; // fringe with no solid neighbor — ignore
      const i = (y * width + x) * 4;
      sum += (
        Math.abs(data[i] - sr / sn) +
        Math.abs(data[i + 1] - sg / sn) +
        Math.abs(data[i + 2] - sb / sn)
      ) / 3;
      n++;
    }
  }
  return n === 0 ? null : sum / n;
}

/**
 * Light-contract check: compare mean luminance of the left vs right fifth of
 * the foreground. The key side must match the catalog-wide contract.
 */
export function detectKeySide(image: RgbaImage): "left" | "right" | "ambiguous" {
  const bounds = foregroundBounds(image);
  if (!bounds || bounds.right - bounds.left < 10) return "ambiguous";
  const band = Math.max(1, Math.round((bounds.right - bounds.left + 1) * 0.2));
  const { data, width } = image;
  let leftSum = 0, leftN = 0, rightSum = 0, rightN = 0;
  for (let y = bounds.top; y <= bounds.bottom; y++) {
    for (let x = bounds.left; x <= bounds.right; x++) {
      const idx = (y * width + x) * 4;
      if (data[idx + 3] <= 8) continue;
      const lum = 0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2];
      if (x < bounds.left + band) {
        leftSum += lum;
        leftN++;
      } else if (x > bounds.right - band) {
        rightSum += lum;
        rightN++;
      }
    }
  }
  if (leftN === 0 || rightN === 0) return "ambiguous";
  const ratio = leftSum / leftN / (rightSum / rightN);
  if (ratio > 1.04) return "left";
  if (ratio < 1 / 1.04) return "right";
  return "ambiguous";
}

/** Mean ΔRGB vs Bone across a border ring — body plates live on Bone. */
export function measureBackgroundBoneDelta(image: RgbaImage, ringPx = 12): number {
  const { data, width, height } = image;
  let sum = 0, n = 0;
  const sample = (x: number, y: number) => {
    const idx = (y * width + x) * 4;
    sum += Math.abs(data[idx] - PAPER_DOLL_CANVAS_RGB.r) +
      Math.abs(data[idx + 1] - PAPER_DOLL_CANVAS_RGB.g) +
      Math.abs(data[idx + 2] - PAPER_DOLL_CANVAS_RGB.b);
    n++;
  };
  const ring = Math.min(ringPx, Math.floor(Math.min(width, height) / 4));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x < ring || x >= width - ring || y < ring || y >= height - ring) sample(x, y);
    }
  }
  return n === 0 ? 0 : sum / n / 3;
}

// ─── Role QA policies ────────────────────────────────────────────────

export const CLOSURE_QA_THRESHOLDS = {
  minResolutionPx: 300, //          legacy floor when no heightMm is declared
  minMmScaleRatio: 0.5, //          below 0.5× master density: unusable
  warnMmScaleRatio: 0.85, //        0.5–0.85×: usable with flagged upscale
  minAlphaCoverage: 0.02, //        must contain an actual object
  maxAlphaCoverage: 0.95, //        near-full coverage = not a cutout (tight PSD crops run high)
  maxEdgeHaloDelta: 40, //          fringe vs OBJECT color; tuned on first real estate part
  specularLuminanceStdDev: 60, //   solid-foreground σ above this = mirror-like finish
  specularHaloMultiplier: 1.6, //   mirror finishes get a wider halo tolerance —
  //                                their fringe legitimately neighbors extreme
  //                                specular swings (shiny-silver over-cap, 2026-07-31)
  minEdgePaddingPx: 2, //           clipped components are unusable
} as const;

/** σ of solid-foreground luminance — high values indicate mirror finishes. */
export function measureForegroundLuminanceStdDev(image: RgbaImage): number | null {
  const { data, width, height } = image;
  let sum = 0, sumSq = 0, n = 0;
  for (let i = 0; i < width * height; i++) {
    if (data[i * 4 + 3] >= 250) {
      const lum = 0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2];
      sum += lum;
      sumSq += lum * lum;
      n++;
    }
  }
  if (n === 0) return null;
  const mean = sum / n;
  return Math.sqrt(Math.max(0, sumSq / n - mean * mean));
}

/**
 * Count significant disjoint foreground regions (4-connected, alpha > 8).
 * A clean cutout has exactly one; stray paint patches riding along in a PSD
 * layer (found in the wild 2026-07-31: white blob under the metal roller)
 * show up as extra regions. Specks under 1% of the largest region (or 64 px)
 * are ignored as anti-aliasing debris.
 */
export function countSignificantForegroundRegions(image: RgbaImage, alphaFloor = 8): number {
  const { data, width, height } = image;
  const visited = new Uint8Array(width * height);
  const areas: number[] = [];
  const stack: number[] = [];
  for (let start = 0; start < width * height; start++) {
    if (visited[start] || data[start * 4 + 3] <= alphaFloor) continue;
    let area = 0;
    stack.length = 0;
    stack.push(start);
    visited[start] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      area++;
      const x = i % width;
      const y = (i / width) | 0;
      const neighbors = [
        x > 0 ? i - 1 : -1,
        x < width - 1 ? i + 1 : -1,
        y > 0 ? i - width : -1,
        y < height - 1 ? i + width : -1,
      ];
      for (const n of neighbors) {
        if (n >= 0 && !visited[n] && data[n * 4 + 3] > alphaFloor) {
          visited[n] = 1;
          stack.push(n);
        }
      }
    }
    areas.push(area);
  }
  if (areas.length === 0) return 0;
  const largest = Math.max(...areas);
  const floor = Math.max(64, largest * 0.01);
  return areas.filter((a) => a >= floor).length;
}

export const BODY_PLATE_QA_THRESHOLDS = {
  minResolutionPx: 1000, //         generic canonical floor (≥1 MP intent)
  maxBackgroundBoneDelta: 12, //    plate must be born on Bone
} as const;

export function runClosureQa(
  image: RgbaImage,
  options: { heightMm?: number } = {},
): IntakeQaReport {
  const issues: string[] = [];
  const warnings: string[] = [];
  if (!image.hasAlpha) {
    issues.push("no_alpha_channel: closures must be alpha-preserving cutouts (PSD layer export, not a flattened composite)");
  }
  const alpha = image.hasAlpha ? analyzeAlpha(image) : { coverageRatio: null, bounds: null, minEdgePaddingPx: null };
  if (typeof alpha.coverageRatio === "number") {
    if (alpha.coverageRatio < CLOSURE_QA_THRESHOLDS.minAlphaCoverage) issues.push("alpha_coverage_too_low: no meaningful foreground");
    if (alpha.coverageRatio > CLOSURE_QA_THRESHOLDS.maxAlphaCoverage) issues.push("alpha_coverage_too_high: image is not a cutout");
  }
  if (
    typeof alpha.minEdgePaddingPx === "number" &&
    alpha.minEdgePaddingPx < CLOSURE_QA_THRESHOLDS.minEdgePaddingPx
  ) {
    issues.push("foreground_touches_edge: component appears clipped");
  }

  // Resolution: mm-aware when the part's physical height is declared —
  // a 15 mm roller fitment needs far fewer pixels than a 70 mm bottle.
  if (typeof options.heightMm === "number" && options.heightMm > 0 && alpha.bounds) {
    const fgHeightPx = alpha.bounds.bottom - alpha.bounds.top + 1;
    const requiredPx = options.heightMm * MASTER_TARGET_PX_PER_MM;
    const ratio = fgHeightPx / requiredPx;
    if (ratio < CLOSURE_QA_THRESHOLDS.minMmScaleRatio) {
      issues.push(
        `resolution_below_mm_floor: ${fgHeightPx}px for ${options.heightMm}mm is ${ratio.toFixed(2)}× master density (${MASTER_TARGET_PX_PER_MM}px/mm) — needs a larger source`,
      );
    } else if (ratio < CLOSURE_QA_THRESHOLDS.warnMmScaleRatio) {
      warnings.push(
        `resolution_upscaled: ${fgHeightPx}px for ${options.heightMm}mm is ${ratio.toFixed(2)}× master density — usable, will soften at master scale`,
      );
    }
  } else if (Math.min(image.width, image.height) < CLOSURE_QA_THRESHOLDS.minResolutionPx) {
    issues.push(
      `resolution_below_floor: min edge < ${CLOSURE_QA_THRESHOLDS.minResolutionPx}px (declare --height-mm for the mm-aware floor on small parts)`,
    );
  }

  if (image.hasAlpha) {
    const regions = countSignificantForegroundRegions(image);
    if (regions > 1) {
      issues.push(
        `multiple_disjoint_foreground_regions: ${regions} regions — the layer carries stray content (crop to the part before intake)`,
      );
    }
  }

  const halo = image.hasAlpha ? measureEdgeHaloDelta(image) : null;
  if (typeof halo === "number") {
    const stdDev = measureForegroundLuminanceStdDev(image);
    const specular = typeof stdDev === "number" && stdDev > CLOSURE_QA_THRESHOLDS.specularLuminanceStdDev;
    const maxHalo = specular
      ? CLOSURE_QA_THRESHOLDS.maxEdgeHaloDelta * CLOSURE_QA_THRESHOLDS.specularHaloMultiplier
      : CLOSURE_QA_THRESHOLDS.maxEdgeHaloDelta;
    if (halo > maxHalo) {
      issues.push("edge_halo: fringe color far from the object's — likely old-background contamination; defringe at export");
    } else if (specular && halo > CLOSURE_QA_THRESHOLDS.maxEdgeHaloDelta) {
      warnings.push(
        `edge_halo_specular_tolerance: Δ${halo.toFixed(1)} accepted under mirror-finish tolerance (foreground σ ${stdDev!.toFixed(0)})`,
      );
    }
  }
  const keySide = image.hasAlpha ? detectKeySide(image) : null;
  return {
    alphaCoverageRatio: alpha.coverageRatio,
    edgeHaloDelta: halo,
    keySide,
    backgroundBoneDelta: null,
    minEdgePaddingPx: alpha.minEdgePaddingPx,
    warnings,
    issues,
    passed: issues.length === 0,
  };
}

/**
 * Row-wise foreground width profile of an opaque Bone plate — the basis for
 * neck-vs-body proportion checks (a bottle is not one rectangle).
 */
export function measurePlateWidthProfile(
  image: RgbaImage,
  deltaThreshold = 30,
): { top: number; bottom: number; widths: number[] } | null {
  const { data, width, height } = image;
  const widths: number[] = [];
  let top = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    let left = -1, right = -1;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const delta =
        Math.abs(data[i] - PAPER_DOLL_CANVAS_RGB.r) +
        Math.abs(data[i + 1] - PAPER_DOLL_CANVAS_RGB.g) +
        Math.abs(data[i + 2] - PAPER_DOLL_CANVAS_RGB.b);
      if (delta / 3 > deltaThreshold) {
        if (left === -1) left = x;
        right = x;
      }
    }
    if (left !== -1) {
      if (top === -1) top = y;
      bottom = y;
      widths.push(right - left + 1);
    } else if (top !== -1) {
      widths.push(0);
    }
  }
  if (top === -1) return null;
  return { top, bottom, widths: widths.slice(0, bottom - top + 1) };
}

/** Median of the widest 40% of rows ≈ the body wall width (ignores neck). */
function medianBodyWidth(widths: number[]): number {
  const sorted = [...widths].filter((w) => w > 0).sort((a, b) => b - a);
  const take = Math.max(1, Math.round(sorted.length * 0.4));
  const band = sorted.slice(0, take);
  return band[Math.floor(band.length / 2)];
}

/**
 * Thread-crest diameter of the neck finish — the dimension a GPI designation
 * actually names (17-415 → 17mm across the thread outer diameter).
 *
 * A threaded neck's row-width profile oscillates: crests are the widest rows,
 * valleys between threads and the smooth bore above the top thread are
 * narrower, and the shoulder below flares to full body width. Measured on the
 * real v3 plate (2026-08-01): crests 74%, valleys 65%, shoulder 97% of body.
 * A median across the whole band therefore UNDER-reads the finish by ~6
 * points — the original methodology bug. Taking a high percentile of the
 * pre-shoulder band recovers the crest.
 */
export function measureNeckThreadCrestWidth(
  widths: number[],
  bodyWidth: number,
  options: { shoulderRatio?: number; crestPercentile?: number } = {},
): number | null {
  const shoulderRatio = options.shoulderRatio ?? 0.9;
  const crestPercentile = options.crestPercentile ?? 0.9;
  // Neck band = the top run of rows clearly narrower than the body. The
  // tighter 0.90 cutoff (vs the old 0.95) keeps the shoulder flare out.
  const neckRows: number[] = [];
  for (const w of widths) {
    if (w <= 0) continue;
    if (w < bodyWidth * shoulderRatio) neckRows.push(w);
    else break;
  }
  if (neckRows.length < 8) return null;
  // Drop the first few rows: the rim/bore at the very top is narrower than
  // the threads and would drag a percentile down on short necks.
  const body = neckRows.slice(Math.min(3, Math.floor(neckRows.length * 0.05)));
  const sorted = [...body].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * crestPercentile))];
}

export function runBodyPlateQa(
  image: RgbaImage,
  options: {
    expectedAspect?: number;
    aspectTolerancePct?: number;
    /** neck outer diameter ÷ body width, from canon (e.g. 17/20 = 0.85). */
    expectedNeckToBodyRatio?: number;
    neckTolerancePct?: number;
  } = {},
): IntakeQaReport {
  const issues: string[] = [];
  const warnings: string[] = [];
  if (Math.min(image.width, image.height) < BODY_PLATE_QA_THRESHOLDS.minResolutionPx) {
    issues.push(`resolution_below_floor: min edge < ${BODY_PLATE_QA_THRESHOLDS.minResolutionPx}px`);
  }
  const boneDelta = measureBackgroundBoneDelta(image);
  if (boneDelta > BODY_PLATE_QA_THRESHOLDS.maxBackgroundBoneDelta) {
    issues.push(
      `background_not_bone: border ring ΔRGB ${boneDelta.toFixed(1)} vs ${PAPER_DOLL_CANVAS_HEX} — plates are born on Bone`,
    );
  }

  // Proportional truth vs canon (the "too narrow" failure, now a machine gate):
  // detected body H/W must match canon bodyHeight/widthAxis within tolerance.
  if (typeof options.expectedAspect === "number" && options.expectedAspect > 0) {
    const tolerance = options.aspectTolerancePct ?? 8;
    let left = image.width, right = -1, top = image.height, bottom = -1, found = false;
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        const i = (y * image.width + x) * 4;
        const delta =
          Math.abs(image.data[i] - PAPER_DOLL_CANVAS_RGB.r) +
          Math.abs(image.data[i + 1] - PAPER_DOLL_CANVAS_RGB.g) +
          Math.abs(image.data[i + 2] - PAPER_DOLL_CANVAS_RGB.b);
        if (delta / 3 > 30) {
          found = true;
          if (x < left) left = x;
          if (x > right) right = x;
          if (y < top) top = y;
          if (y > bottom) bottom = y;
        }
      }
    }
    if (found) {
      const aspect = (bottom - top + 1) / (right - left + 1);
      const deviationPct = ((aspect - options.expectedAspect) / options.expectedAspect) * 100;
      if (Math.abs(deviationPct) > tolerance) {
        issues.push(
          `aspect_off_canon: detected H/W ${aspect.toFixed(2)} vs canon ${options.expectedAspect.toFixed(2)} ` +
            `(${deviationPct > 0 ? "+" : ""}${deviationPct.toFixed(1)}% — ${deviationPct > 0 ? "too slender" : "too wide"})`,
        );
      } else if (Math.abs(deviationPct) > tolerance / 2) {
        warnings.push(`aspect_drift: ${deviationPct > 0 ? "+" : ""}${deviationPct.toFixed(1)}% vs canon — inside tolerance, watch it`);
      }
    }
  }

  // Neck alignment: the threaded neck must sit at its canonical fraction of
  // the body width (GPI thread size IS the neck diameter — 17-415 → 17mm).
  if (typeof options.expectedNeckToBodyRatio === "number" && options.expectedNeckToBodyRatio > 0) {
    const profile = measurePlateWidthProfile(image);
    if (profile) {
      const bodyW = medianBodyWidth(profile.widths);
      const neckW = measureNeckThreadCrestWidth(profile.widths, bodyW);
      if (neckW && bodyW > 0) {
        const measured = neckW / bodyW;
        const deviationPct = ((measured - options.expectedNeckToBodyRatio) / options.expectedNeckToBodyRatio) * 100;
        const tolerance = options.neckTolerancePct ?? 10;
        if (Math.abs(deviationPct) > tolerance) {
          issues.push(
            `neck_off_canon: neck/body ${(measured * 100).toFixed(0)}% vs canon ${(options.expectedNeckToBodyRatio * 100).toFixed(0)}% ` +
              `(${deviationPct > 0 ? "+" : ""}${deviationPct.toFixed(1)}% — neck ${deviationPct > 0 ? "too wide" : "too narrow"})`,
          );
        } else if (Math.abs(deviationPct) > tolerance / 2) {
          warnings.push(`neck_drift: ${deviationPct > 0 ? "+" : ""}${deviationPct.toFixed(1)}% vs canon neck ratio`);
        }
      } else {
        warnings.push("neck_not_detected: no distinct neck band found — check the shoulder step");
      }
    }
  }

  const keySide = detectKeySide(image);
  return {
    alphaCoverageRatio: image.hasAlpha ? analyzeAlpha(image).coverageRatio : null,
    edgeHaloDelta: null,
    keySide,
    backgroundBoneDelta: boneDelta,
    minEdgePaddingPx: null,
    warnings,
    issues,
    passed: issues.length === 0,
  };
}

// ─── Canon CSV join (parser is pure; CLI supplies the text) ──────────

export interface CanonGeometryRow {
  family: string;
  color: string;
  capacityMl: number;
  neckThreadSize: string;
  bodyHeightMm: number | null;
  widthAxisMm: number | null;
}

export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export function parseCanonGeometryRows(csvText: string): CanonGeometryRow[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]);
  const col = (name: string) => header.indexOf(name);
  const iFamily = col("family"), iColor = col("color"), iCap = col("capacityMl"),
    iThread = col("neckThreadSize"), iH = col("canon_bodyHeightMm"), iW = col("canon_widthAxisMm");
  const num = (v: string | undefined) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  return lines.slice(1).map((line) => {
    const f = parseCsvLine(line);
    return {
      family: f[iFamily] ?? "",
      color: f[iColor] ?? "",
      capacityMl: num(f[iCap]) ?? 0,
      neckThreadSize: f[iThread] ?? "",
      bodyHeightMm: num(f[iH]),
      widthAxisMm: num(f[iW]),
    };
  });
}

/**
 * Resolve canonical geometry for family × capacity × color. The derivation
 * rule ("swatch sets are defined by geometry") means this MUST be unique —
 * multiple distinct geometries is an error the caller resolves explicitly.
 */
export function resolveCanonGeometry(
  rows: CanonGeometryRow[],
  family: string,
  capacityMl: number,
  color: string,
): { bodyHeightMm: number; widthAxisMm: number } {
  const geometries = new Map<string, { bodyHeightMm: number; widthAxisMm: number; count: number }>();
  for (const row of rows) {
    if (
      row.family.toLowerCase() !== family.toLowerCase() ||
      row.capacityMl !== capacityMl ||
      row.color.toLowerCase() !== color.toLowerCase()
    ) continue;
    if (row.bodyHeightMm == null || row.widthAxisMm == null) continue;
    const key = `${row.bodyHeightMm.toFixed(1)}x${row.widthAxisMm.toFixed(1)}`;
    const cur = geometries.get(key);
    if (cur) cur.count++;
    else geometries.set(key, { bodyHeightMm: row.bodyHeightMm, widthAxisMm: row.widthAxisMm, count: 1 });
  }
  if (geometries.size === 0) {
    throw new Error(`No canon geometry found for ${family} ${capacityMl}ml ${color}.`);
  }
  if (geometries.size > 1) {
    const list = [...geometries.entries()].map(([k, v]) => `${k}mm (${v.count} rows)`).join(", ");
    throw new Error(
      `Ambiguous canon geometry for ${family} ${capacityMl}ml ${color}: ${list}. ` +
        `Pass --height-mm/--width-mm explicitly to pick the swatch-set body.`,
    );
  }
  const only = [...geometries.values()][0];
  return { bodyHeightMm: only.bodyHeightMm, widthAxisMm: only.widthAxisMm };
}

export function threadSizeExistsInCanon(rows: CanonGeometryRow[], neckThreadSize: string): boolean {
  const target = neckThreadSize.trim().toLowerCase();
  return rows.some((row) => row.neckThreadSize.trim().toLowerCase() === target);
}
