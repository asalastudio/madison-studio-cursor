/**
 * QC scaffolding for the paper-doll lane.
 *
 * Deterministic checks (background hex, canvas size, center alignment,
 * bottom anchor, internal-checkerboard, variant silhouette / position) are
 * implemented via a small pixel-sampler that runs against a Blob/HTMLImage.
 * Heuristic checks (reflection stripe, thread crispness, base thickness,
 * seating) ship as soft_warning-only stubs that pass by default and leave
 * a TODO so they can be fleshed out per real-world failure mode.
 *
 * Check catalog: docs/product-image-system/qc.md.
 */

import type {
  GeometrySpec,
  QcCheck,
  QcCheckId,
  QcResult,
} from "./types";

// ─── Image sampling helpers ─────────────────────────────────────────────────

/**
 * Lightweight pixel-access wrapper around a rendered ImageBitmap. Created
 * once per QC run and reused across checks.
 */
interface PixelSource {
  width: number;
  height: number;
  /** RGBA bytes in row-major order, length = width * height * 4. */
  rgba: Uint8ClampedArray;
}

async function loadPixelSource(blob: Blob): Promise<PixelSource> {
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("QC: could not acquire 2d context");
  ctx.drawImage(bitmap, 0, 0);
  const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  return { width: bitmap.width, height: bitmap.height, rgba: data.data };
}

function getPixel(src: PixelSource, x: number, y: number): [number, number, number, number] {
  const i = (y * src.width + x) * 4;
  return [src.rgba[i], src.rgba[i + 1], src.rgba[i + 2], src.rgba[i + 3]];
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) throw new Error(`QC: invalid hex "${hex}"`);
  const n = Number.parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt(
    (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2,
  );
}

/** Foreground = any pixel significantly different from the target plate hex. */
function isForeground(px: [number, number, number, number], plateRgb: [number, number, number], tolerance: number): boolean {
  if (px[3] < 200) return true; // transparent pixel — counts as foreground anomaly
  return colorDistance([px[0], px[1], px[2]], plateRgb) > tolerance;
}

// ─── Individual checks ──────────────────────────────────────────────────────

const BG_TOLERANCE = 18; // sRGB distance tolerance for background match

export function checkBackgroundExactHex(
  src: PixelSource,
  plateHex: string,
): QcCheck {
  const plateRgb = hexToRgb(plateHex);
  const margin = 50;
  const samplePts: Array<[number, number]> = [
    [margin, margin],
    [Math.floor(src.width / 2), margin],
    [src.width - margin, margin],
    [margin, Math.floor(src.height / 2)],
    [src.width - margin, Math.floor(src.height / 2)],
    [margin, src.height - margin],
    [Math.floor(src.width / 2), src.height - margin],
    [src.width - margin, src.height - margin],
    [margin + 10, margin + 10],
  ];
  let bad = 0;
  for (const [x, y] of samplePts) {
    const [r, g, b, a] = getPixel(src, x, y);
    if (a < 250) {
      bad++;
      continue;
    }
    if (colorDistance([r, g, b], plateRgb) > BG_TOLERANCE) bad++;
  }
  return {
    id: "background_exact_hex",
    passed: bad === 0,
    severity: "hard_fail",
    note:
      bad === 0
        ? `Background matches ${plateHex} at all 9 sample points.`
        : `Background failed at ${bad}/9 sample points (expected ${plateHex}).`,
  };
}

export function checkCanvasSize(src: PixelSource, geometry: GeometrySpec): QcCheck {
  const ok =
    src.width === geometry.canonicalCanvas.widthPx &&
    src.height === geometry.canonicalCanvas.heightPx;
  return {
    id: "canvas_size_matches_family",
    passed: ok,
    severity: "hard_fail",
    note: ok
      ? `Canvas ${src.width}×${src.height} matches family spec.`
      : `Canvas ${src.width}×${src.height} expected ${geometry.canonicalCanvas.widthPx}×${geometry.canonicalCanvas.heightPx}.`,
  };
}

/**
 * Compute the foreground bounding box and horizontal centroid. Used by
 * center / anchor / silhouette checks. One scan per QC run.
 */
interface ForegroundStats {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  centroidX: number;
  maskRowCount: number;
  mask: Uint8Array; // 1-bit per pixel (1 byte) — 1 = foreground
}

function computeForegroundStats(src: PixelSource, plateHex: string): ForegroundStats {
  const plateRgb = hexToRgb(plateHex);
  const mask = new Uint8Array(src.width * src.height);
  let minX = src.width;
  let maxX = -1;
  let minY = src.height;
  let maxY = -1;
  let sumX = 0;
  let count = 0;
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const px = getPixel(src, x, y);
      if (isForeground(px, plateRgb, BG_TOLERANCE)) {
        mask[y * src.width + x] = 1;
        sumX += x;
        count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return {
    minX,
    maxX,
    minY,
    maxY,
    centroidX: count > 0 ? sumX / count : src.width / 2,
    maskRowCount: count,
    mask,
  };
}

export function checkCenterAlignment(
  fg: ForegroundStats,
  src: PixelSource,
  tolerancePx = 15,
): QcCheck {
  const target = src.width / 2;
  const dx = Math.abs(fg.centroidX - target);
  return {
    id: "center_alignment",
    passed: dx <= tolerancePx,
    severity: "hard_fail",
    note:
      dx <= tolerancePx
        ? `Centroid at x=${fg.centroidX.toFixed(1)} within ±${tolerancePx} of center.`
        : `Centroid at x=${fg.centroidX.toFixed(1)} off center by ${dx.toFixed(1)} px (limit ±${tolerancePx}).`,
  };
}

export function checkBottomAnchor(fg: ForegroundStats, geometry: GeometrySpec): QcCheck {
  const actualY = fg.maxY;
  const targetY = geometry.bottomAnchor.y;
  const tol = geometry.bottomAnchor.toleranceY;
  const delta = Math.abs(actualY - targetY);
  return {
    id: "bottom_anchor_locked",
    passed: delta <= tol,
    severity: "hard_fail",
    note:
      delta <= tol
        ? `Bottom at y=${actualY} within ±${tol} of anchor y=${targetY}.`
        : `Bottom at y=${actualY}, expected y=${targetY} ±${tol} (drift ${delta}).`,
  };
}

export function checkNoInternalCheckerboard(
  fg: ForegroundStats,
  src: PixelSource,
): QcCheck {
  // Inside the bounding box, no pixel should be fully transparent.
  let bad = 0;
  for (let y = fg.minY; y <= fg.maxY; y++) {
    for (let x = fg.minX; x <= fg.maxX; x++) {
      const i = y * src.width + x;
      if (fg.mask[i] !== 1) continue; // only look at foreground pixels
      const alpha = src.rgba[i * 4 + 3];
      if (alpha < 200) bad++;
    }
  }
  return {
    id: "no_internal_checkerboard",
    passed: bad === 0,
    severity: "hard_fail",
    note:
      bad === 0
        ? "No transparent pixels inside bottle bounding box."
        : `${bad} transparent pixel${bad === 1 ? "" : "s"} inside bottle bounding box.`,
  };
}

export function checkNoBlueTintInClear(fg: ForegroundStats, src: PixelSource): QcCheck {
  // Sample the mid-body band: vertical middle 60% of the bbox, foreground only.
  const yStart = Math.floor(fg.minY + (fg.maxY - fg.minY) * 0.2);
  const yEnd = Math.floor(fg.minY + (fg.maxY - fg.minY) * 0.8);
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let n = 0;
  for (let y = yStart; y <= yEnd; y++) {
    for (let x = fg.minX; x <= fg.maxX; x++) {
      if (fg.mask[y * src.width + x] !== 1) continue;
      const i = (y * src.width + x) * 4;
      rSum += src.rgba[i];
      gSum += src.rgba[i + 1];
      bSum += src.rgba[i + 2];
      n++;
    }
  }
  if (n === 0) {
    return {
      id: "no_blue_tint_in_clear",
      passed: true,
      severity: "hard_fail",
      note: "No foreground pixels sampled (empty body?) — skipping tint check.",
    };
  }
  const r = rSum / n;
  const g = gSum / n;
  const b = bSum / n;
  const saturation = (Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(1, Math.max(r, g, b));
  const passed = saturation < 0.12;
  return {
    id: "no_blue_tint_in_clear",
    passed,
    severity: "hard_fail",
    note: passed
      ? `Mid-body saturation ${saturation.toFixed(3)} — within neutral range.`
      : `Mid-body saturation ${saturation.toFixed(3)} exceeds neutral threshold (0.12). Glass appears tinted.`,
  };
}

/**
 * Intersection-over-union between two foreground masks. Used to compare
 * a variant's silhouette against the clear master.
 */
export function silhouetteIoU(a: ForegroundStats, b: ForegroundStats): number {
  let inter = 0;
  let uni = 0;
  const len = a.mask.length;
  for (let i = 0; i < len; i++) {
    const av = a.mask[i];
    const bv = b.mask[i];
    if (av || bv) uni++;
    if (av && bv) inter++;
  }
  return uni === 0 ? 1 : inter / uni;
}

// ─── Stub for heuristic checks ──────────────────────────────────────────────

function heuristicStub(id: QcCheckId, humanNote: string): QcCheck {
  return {
    id,
    passed: true,
    severity: "soft_warning",
    // TODO: implement this heuristic after observing real gpt-image-2 failures
    note: `${humanNote} (heuristic not yet implemented — manual review).`,
  };
}

// ─── Public runners ─────────────────────────────────────────────────────────

export interface BodyQcInput {
  image: Blob;
  geometry: GeometrySpec;
  plateHex: string;
}

/** Run QC for a clear body output. */
export async function runBodyQc(input: BodyQcInput): Promise<QcResult> {
  const src = await loadPixelSource(input.image);
  const checks: QcCheck[] = [];
  checks.push(checkBackgroundExactHex(src, input.plateHex));
  checks.push(checkCanvasSize(src, input.geometry));
  const fg = computeForegroundStats(src, input.plateHex);
  checks.push(checkCenterAlignment(fg, src));
  checks.push(checkBottomAnchor(fg, input.geometry));
  checks.push(checkNoInternalCheckerboard(fg, src));
  checks.push(checkNoBlueTintInClear(fg, src));
  checks.push(heuristicStub("no_broad_reflection_stripe", "Reflection-stripe heuristic"));
  checks.push(heuristicStub("thread_crispness", "Thread-crispness heuristic"));
  checks.push(heuristicStub("base_thickness_believable", "Base-thickness heuristic"));
  checks.push(heuristicStub("aspect_ratio_sane", "Aspect-ratio heuristic"));
  return assembleResult(checks);
}

export interface VariantQcInput {
  variantImage: Blob;
  clearMasterImage: Blob;
  geometry: GeometrySpec;
  plateHex: string;
  minIoU?: number; // default 0.95
}

/** Run QC for a material variant derived from a clear master. */
export async function runVariantQc(input: VariantQcInput): Promise<QcResult> {
  const [variantSrc, masterSrc] = await Promise.all([
    loadPixelSource(input.variantImage),
    loadPixelSource(input.clearMasterImage),
  ]);
  const checks: QcCheck[] = [];
  checks.push(checkBackgroundExactHex(variantSrc, input.plateHex));
  checks.push(checkCanvasSize(variantSrc, input.geometry));
  const variantFg = computeForegroundStats(variantSrc, input.plateHex);
  const masterFg = computeForegroundStats(masterSrc, input.plateHex);
  checks.push(checkCenterAlignment(variantFg, variantSrc));
  checks.push(checkBottomAnchor(variantFg, input.geometry));

  const iou = silhouetteIoU(variantFg, masterFg);
  const minIoU = input.minIoU ?? 0.95;
  checks.push({
    id: "variant_silhouette_matches_master",
    passed: iou >= minIoU,
    severity: "hard_fail",
    note:
      iou >= minIoU
        ? `Silhouette IoU with master = ${iou.toFixed(3)} (min ${minIoU}).`
        : `Silhouette IoU with master = ${iou.toFixed(3)}, below threshold ${minIoU}. Geometry drifted.`,
  });
  checks.push({
    id: "variant_position_matches_master",
    passed:
      Math.abs(variantFg.centroidX - masterFg.centroidX) <= 6 &&
      Math.abs(variantFg.maxY - masterFg.maxY) <= 6,
    severity: "hard_fail",
    note: "Variant center-X and bottom anchor compared against master.",
  });
  checks.push(heuristicStub("variant_hue_within_target", "Variant-hue heuristic"));

  return assembleResult(checks);
}

export interface ComponentQcInput {
  image: Blob;
  geometry: GeometrySpec;
  plateHex: string;
}

/** Run QC for a fitment or cap component normalization. */
export async function runComponentQc(input: ComponentQcInput): Promise<QcResult> {
  const src = await loadPixelSource(input.image);
  const checks: QcCheck[] = [];
  checks.push({ ...checkBackgroundExactHex(src, input.plateHex), id: "component_on_plate" });
  checks.push(checkCanvasSize(src, input.geometry));
  const fg = computeForegroundStats(src, input.plateHex);
  checks.push({ ...checkCenterAlignment(fg, src), id: "component_centered" });
  return assembleResult(checks);
}

export interface AssemblyQcInput {
  image: Blob;
  geometry: GeometrySpec;
  plateHex: string;
}

/** Run QC for an assembly preview (body + fitment + cap composed). */
export async function runAssemblyQc(input: AssemblyQcInput): Promise<QcResult> {
  const src = await loadPixelSource(input.image);
  const checks: QcCheck[] = [];
  checks.push(checkBackgroundExactHex(src, input.plateHex));
  checks.push(checkCanvasSize(src, input.geometry));
  const fg = computeForegroundStats(src, input.plateHex);
  checks.push(checkCenterAlignment(fg, src));
  checks.push(checkBottomAnchor(fg, input.geometry));
  checks.push(heuristicStub("fitment_seating_natural", "Fitment-seating heuristic"));
  checks.push(heuristicStub("cap_seating_natural", "Cap-seating heuristic"));
  checks.push(heuristicStub("no_phantom_base_shadow", "Phantom-shadow heuristic"));
  return assembleResult(checks);
}

// ─── Result assembly ────────────────────────────────────────────────────────

function assembleResult(checks: QcCheck[]): QcResult {
  const hardFails = checks.filter((c) => c.severity === "hard_fail" && !c.passed);
  return {
    passed: hardFails.length === 0,
    checks,
    retryNeeded: hardFails.length > 0,
    retryReasons: hardFails.map((c) => c.note),
  };
}
