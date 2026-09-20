import { getFamilyRigForProduct, type FamilyRigConfig, type RigCapState } from "@/lib/product-image/familyRig";
import {
  buildFramingQaReport,
  getFramingDecision,
  type FramingDecision,
  type FramingQaReport,
} from "@/lib/product-image/framingQa";
import {
  resolveBestBottlesShadowPolicy,
  type BestBottlesShadowOwner,
} from "@/lib/bestBottlesShadowPolicy";
import { analyzeModelOwnedShadow, type ShadowQaReport } from "@/lib/product-image/shadowQa";
import { detectSilverProofComponents } from "@/lib/product-image/sidecarCapSplice";
import type {
  BestBottlesShadowContact,
  BestBottlesShadowTopology,
} from "@/lib/bestBottlesShadowTopology";
import {
  evaluateBestBottlesPhysicalScale,
  resolveCalibratedGlassBodyBounds,
  type PhysicalScaleQa,
  type RigScaleCalibration,
} from "@/lib/product-image/physicalScaleQa";
import {
  detectGlassShoulderLandmark,
  type GlassShoulderLandmark,
} from "@/lib/product-image/shoulderLandmark";

interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface RigBaselineNormalizeResult {
  dataUrl: string;
  shifted: boolean;
  shiftXPx: number;
  shiftYPx: number;
  scale: number;
  /** Baseline detected on the raw generated pixels before any recanvas transform. */
  preTransformBaselineYPx: number | null;
  /** Baseline detected on the final rendered pixels; retained under the legacy name. */
  detectedBaselineYPx: number | null;
  targetBaselineYPx: number | null;
  /** Glass shoulder detected on the raw provider pixels before normalization. */
  preTransformShoulderYPx: number | null;
  /** Glass shoulder re-detected on final rendered pixels. */
  detectedShoulderYPx: number | null;
  /** Locked shoulder Y coordinate on the final canvas. */
  targetShoulderYPx: number | null;
  /** Final measured shoulder Y minus target, expressed in canvas percentage points. */
  shoulderDeltaPct: number | null;
  /** Confidence of the final shoulder landmark detector, from 0 to 1. */
  shoulderConfidence: number | null;
  maskControlled: boolean;
  qaIssues: string[];
  framingQa: FramingQaReport | null;
  framingDecision: FramingDecision | null;
  /** Foreground envelope detected on the raw generated pixels. */
  preTransformObjectBounds: RigStrongBounds | null;
  /** Geometry that controlled the transform (mask bounds or raw strong bounds). */
  transformControlBounds: RigStrongBounds | null;
  /** Final foreground envelope after scale/shift normalization. */
  objectBounds: RigStrongBounds | null;
  shadowOwner: BestBottlesShadowOwner;
  shadowQa: ShadowQaReport | null;
  /** Reference-measured detached-cap geometry gate; null outside governed detached lanes. */
  detachedCapGeometryQa: DetachedCapGeometryQa | null;
  /** Physical millimeter verdict from approved calibration evidence. */
  physicalScaleQa: PhysicalScaleQa;
  scaleCalibration: RigScaleCalibration | null;
}

export interface RigBaselineNormalizeOptions {
  family?: string | null;
  bottleCollection?: string | null;
  graceSku?: string | null;
  websiteSku?: string | null;
  itemName?: string | null;
  itemDescription?: string | null;
  applicator?: string | null;
  capacityMl?: number | null;
  heightWithCap?: string | null;
  heightWithoutCap?: string | null;
  diameter?: string | null;
  capState?: string | null;
  mode?: string | null;
  targetBackgroundHex?: string;
  shadowOwner?: BestBottlesShadowOwner;
  shadowTopology?: BestBottlesShadowTopology;
  maskReferenceUrl?: string | null;
  requireMaskControl?: boolean;
  /** Production masters keep provider-rendered scale; the rig may translate and QA but never resize. */
  preserveGeneratedScale?: boolean;
  /**
   * Exact glass-body (foot-to-rim) control bounds from source/reference geometry.
   * Required when the resolved rig carries `targetBodyHeightPx` and scale may
   * change — never invent from capacity or the assembly envelope.
   */
  bodyControlBounds?: RigStrongBounds | null;
  /** Approved reusable annotation for this exact glass geometry + fitment topology. */
  scaleCalibration?: RigScaleCalibration | null;
  /**
   * Truth H/W ratio for the primary bottle. When omitted, cap-on lanes fall
   * back to canonical mm (heightWithCap / diameter); detached-sidecar lanes
   * have no canonical assembled-cap-off height so the caller should measure
   * the byte-locked reference and pass it here.
   */
  expectedPrimaryAspectRatio?: number | null;
  /** Byte-locked reference truth used to reject model-generated detached-cap proportion drift. */
  expectedDetachedCapMetrics?: ReferenceSidecarCapMetrics | null;
}

export interface RigStrongBounds {
  top: number;
  bottom: number;
  left?: number;
  right?: number;
}

export interface RigAlphaControlPixelInput {
  data: ArrayLike<number>;
  width: number;
  height: number;
}

export interface RigAlphaControlBounds extends RigStrongBounds {
  left: number;
  right: number;
  foregroundPixels: number;
  foregroundPixelRatio: number;
}

export interface RigFrameTransformInput {
  width: number;
  height: number;
  rig: FamilyRigConfig;
  detectedBaselineYPx: number;
  strongBounds: RigStrongBounds | null;
  /** Bottle-only bounds. Required for detached topology to prevent sidecar shrink. */
  primaryBounds?: RigStrongBounds | null;
  /**
   * Exact glass-body (foot-to-rim) bounds. When `rig.targetBodyHeightPx` is set,
   * vertical scale is derived from these bounds alone — never from the full
   * assembly envelope or capacity.
   */
  bodyControlBounds?: RigStrongBounds | null;
  capState?: RigCapState;
  /** Keep provider-rendered scale and use this pass for baseline/center translation plus QA only. */
  preserveGeneratedScale?: boolean;
}

export interface RigFrameTransform {
  scale: number;
  shiftXPx: number;
  shiftYPx: number;
  detectedBaselineYPx: number;
  targetBaselineYPx: number;
  transformedTopYPx: number | null;
  transformedBottomYPx: number | null;
  transformedLeftXPx: number | null;
  transformedRightXPx: number | null;
}

export interface ShoulderLockQa {
  status: "pass" | "fail";
  deltaPct: number | null;
  issue: string | null;
}

/** Jordan, 2026-09-18: "even if it's slightly off 1 mm or 2, it's okay." */
export const SHOULDER_LOCK_TOLERANCE_MM = 2;
/** The flat gate that predates the millimetre rule; still the floor. */
export const SHOULDER_LOCK_MIN_TOLERANCE_PCT = 1;

/**
 * The shoulder tolerance as a share of canvas height.
 *
 * A flat 1% of canvas is not one physical distance: it is about 2 mm on a
 * 100 ml bottle but only ~1.4 mm on a 5 ml one, so small bottles were held to a
 * stricter standard than the 2 mm Jordan actually set, and renders 1.6 mm out
 * were being refused.
 *
 * The ruler is deliberately conservative. Foot-to-shoulder pixels are divided
 * by the FULL bare-glass height, which includes the neck, so it undercounts
 * pixels per millimetre and the result sits on the strict side of 2 mm. It is
 * also never tighter than the old 1%: this rule exists to stop over-rejecting
 * small bottles, not to start rejecting large ones. With no glass height there
 * is no ruler, and the gate stays exactly where it was.
 */
export function resolveShoulderLockTolerancePct(input: {
  canvasHeight: number;
  targetBodyHeightPx?: number | null;
  bareGlassHeightMm?: number | null;
}): number {
  const { canvasHeight, targetBodyHeightPx, bareGlassHeightMm } = input;
  if (
    !(canvasHeight > 0) ||
    typeof targetBodyHeightPx !== "number" || !(targetBodyHeightPx > 0) ||
    typeof bareGlassHeightMm !== "number" || !(bareGlassHeightMm > 0)
  ) {
    return SHOULDER_LOCK_MIN_TOLERANCE_PCT;
  }
  const pxPerMm = targetBodyHeightPx / bareGlassHeightMm;
  const tolerancePct = ((SHOULDER_LOCK_TOLERANCE_MM * pxPerMm) / canvasHeight) * 100;
  return Math.max(SHOULDER_LOCK_MIN_TOLERANCE_PCT, Number(tolerancePct.toFixed(2)));
}

export function evaluateShoulderLockQa(input: {
  canvasHeight: number;
  targetShoulderYPx: number;
  measuredShoulderYPx: number | null;
  tolerancePct?: number;
}): ShoulderLockQa {
  if (input.measuredShoulderYPx == null) {
    return {
      status: "fail",
      deltaPct: null,
      issue: "Cylinder glass shoulder landmark was not detectable after normalization.",
    };
  }
  const deltaPct = Number(
    (((input.measuredShoulderYPx - input.targetShoulderYPx) / input.canvasHeight) * 100).toFixed(1),
  );
  const tolerancePct = input.tolerancePct ?? SHOULDER_LOCK_MIN_TOLERANCE_PCT;
  if (Math.abs(deltaPct) > tolerancePct) {
    return {
      status: "fail",
      deltaPct,
      issue: `Cylinder glass shoulder is ${Math.abs(deltaPct).toFixed(1)}% from target after normalization.`,
    };
  }
  return { status: "pass", deltaPct, issue: null };
}

export interface RigBackgroundFlattenOptions {
  creamDistance?: number;
  paleForegroundGreenDelta?: number;
  paleForegroundBlueDelta?: number;
  shadowLumaDelta?: number;
  strongForegroundDistance?: number;
}

export interface RigBackgroundFlattenResult {
  flattenedPixels: number;
  preservedPixels: number;
}

export interface RigForegroundMatteOptions {
  strongForegroundDistance?: number;
  paleForegroundDistance?: number;
  foregroundNeighborhoodPx?: number;
  shadowNeighborhoodPx?: number;
  shadowLumaDelta?: number;
  shadowStartPct?: number;
  protectedProductBounds?: RigStrongBounds | null;
}

export interface RigForegroundMatteResult {
  mattedBackgroundPixels: number;
  opaqueForegroundPixels: number;
  shadowPixels: number;
  preservedShadowPixels?: number;
}

export interface RigUnmaskedRigRecanvasResult extends RigForegroundMatteResult {
  preservedShadowPixels: number;
}

/**
 * Remove every model-shadow candidate from a geometry-only pixel buffer.
 * The source/output buffer remains untouched; callers use this only for bounds,
 * baseline, fill, centerline, and geometry QA measurements.
 */
export function maskOutModelShadowGeometry(
  pixels: Uint8ClampedArray,
  candidateMask: Uint8Array,
  background: Rgb,
): number {
  const count = Math.min(candidateMask.length, Math.floor(pixels.length / 4));
  let removedPixels = 0;
  for (let p = 0; p < count; p += 1) {
    if (candidateMask[p] !== 1) continue;
    const i = p * 4;
    pixels[i] = background.r;
    pixels[i + 1] = background.g;
    pixels[i + 2] = background.b;
    pixels[i + 3] = 255;
    removedPixels += 1;
  }
  return removedPixels;
}

/**
 * Clamp the geometry-only buffer to the product control envelope below the
 * baseline. This catches dark shadow pixels that sit outside the analyzer's
 * local lane; source/output pixels are never changed by this helper.
 */
export function clampModelShadowGeometryToControlEnvelope(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  background: Rgb,
  controlBounds: RigStrongBounds | null,
  baselineYPx: number,
): number {
  if (
    !controlBounds ||
    typeof controlBounds.left !== "number" ||
    typeof controlBounds.right !== "number" ||
    !Number.isFinite(baselineYPx)
  ) {
    return 0;
  }
  const baseline = Math.max(0, Math.min(height - 1, Math.round(baselineYPx)));
  const left = Math.max(0, Math.floor(controlBounds.left));
  const right = Math.min(width - 1, Math.ceil(controlBounds.right));
  let removedPixels = 0;
  for (let y = baseline + 1; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x >= left && x <= right) continue;
      const i = (y * width + x) * 4;
      pixels[i] = background.r;
      pixels[i + 1] = background.g;
      pixels[i + 2] = background.b;
      pixels[i + 3] = 255;
      removedPixels += 1;
    }
  }
  return removedPixels;
}

export interface RigFinalizeShadowInput {
  owner: BestBottlesShadowOwner;
  pixels: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
  background: Rgb;
  objectBounds: RigStrongBounds | null;
  baselineYPx: number | null;
  topology?: BestBottlesShadowTopology;
  contactBounds?: Partial<Record<BestBottlesShadowContact, RigStrongBounds>>;
}

export interface DetectModelShadowContactBoundsInput {
  pixels: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
  background: Rgb;
  groupBounds: RigStrongBounds;
  baselineYPx: number;
  topology: BestBottlesShadowTopology;
}

export function detectModelShadowContactBounds(
  input: DetectModelShadowContactBoundsInput,
): Partial<Record<BestBottlesShadowContact, RigStrongBounds>> {
  const { width, height, background, topology } = input;
  const left = clamp(Math.round(input.groupBounds.left ?? 0), 0, width - 1);
  const right = clamp(Math.round(input.groupBounds.right ?? width - 1), 0, width - 1);
  const top = clamp(Math.round(input.groupBounds.top), 0, height - 1);
  const bottom = clamp(Math.round(input.baselineYPx), top, height - 1);
  if (topology.expectedContacts.length === 1) {
    return {
      [topology.expectedContacts[0]]: { left, right, top, bottom },
    };
  }

  // Multi-contact object identity must be derived above the governed shadow
  // depth. Faint floor/contact pixels legitimately bridge beneath detached
  // objects and must not merge their physical horizontal segments.
  const objectScanBottom = Math.max(
    top,
    bottom - Math.max(12, Math.round(height * 0.035)),
  );

  const columns: Array<{
    x: number;
    pixels: number;
    minY: number;
    maxY: number;
  }> = [];
  for (let x = left; x <= right; x += 1) {
    let pixels = 0;
    let minY = height;
    let maxY = -1;
    for (let y = top; y <= objectScanBottom; y += 1) {
      const index = (y * width + x) * 4;
      const alpha = input.pixels[index + 3] ?? 0;
      const distance =
        Math.abs((input.pixels[index] ?? 0) - background.r) +
        Math.abs((input.pixels[index + 1] ?? 0) - background.g) +
        Math.abs((input.pixels[index + 2] ?? 0) - background.b);
      if (alpha > 8 && distance >= 24) {
        pixels += 1;
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
    if (pixels >= 2) columns.push({ x, pixels, minY, maxY });
  }

  const segments: Array<RigStrongBounds & { pixels: number }> = [];
  for (const column of columns) {
    const current = segments[segments.length - 1];
    if (!current || column.x - (current.right ?? column.x) > 3) {
      segments.push({
        left: column.x,
        right: column.x,
        top: column.minY,
        bottom: column.maxY,
        pixels: column.pixels,
      });
    } else {
      current.right = column.x;
      current.top = Math.min(current.top, column.minY);
      current.bottom = Math.max(current.bottom, column.maxY);
      current.pixels += column.pixels;
    }
  }
  const ranked = segments
    .filter((segment) => (segment.right ?? 0) - (segment.left ?? 0) >= 2)
    .sort((first, second) => second.pixels - first.pixels);
  const bottle = ranked[0];
  if (!bottle) return {};
  const result: Partial<Record<BestBottlesShadowContact, RigStrongBounds>> = {
    bottle: {
      left: bottle.left,
      right: bottle.right,
      top: bottle.top,
      bottom,
    },
  };
  const bottleCenter = ((bottle.left ?? 0) + (bottle.right ?? 0)) / 2;
  if (topology.expectedContacts.includes("sidecar")) {
    const sidecar =
      ranked
        .slice(1)
        .filter(
          (segment) =>
            ((segment.left ?? 0) + (segment.right ?? 0)) / 2 > bottleCenter,
        )[0] ?? ranked[1];
    if (sidecar) {
      result.sidecar = {
        left: sidecar.left,
        right: sidecar.right,
        top: sidecar.top,
        bottom,
      };
    }
  }
  if (topology.expectedContacts.includes("accessory")) {
    const used = new Set([bottle, result.sidecar ? ranked.find((segment) => segment.left === result.sidecar?.left) : null]);
    const accessory = ranked.find((segment) => !used.has(segment));
    if (accessory) {
      result.accessory = {
        left: accessory.left,
        right: accessory.right,
        top: accessory.top,
        bottom,
      };
    }
  }
  return result;
}

export interface RigFinalizeShadowResult {
  deterministicShadowPixels: number;
  shadowQa: ShadowQaReport | null;
}

export interface RigDeterministicContactShadowOptions {
  objectBounds: RigStrongBounds | null;
  baselineYPx: number | null;
  maxOpacity?: number;
  backgroundDistanceThreshold?: number;
}

export interface RigDeterministicContactShadowResult {
  shadowPixels: number;
}

export interface RigMaskControlledForegroundMatteOptions {
  alphaThreshold?: number;
  foregroundHaloPx?: number;
  shadowNeighborhoodPx?: number;
  shadowLumaDelta?: number;
  /** Disable synthesized shadow painting when finalizeRigShadow is authoritative. */
  paintShadow?: boolean;
  controlBounds?: RigAlphaControlBounds | null;
}

export interface RigMaskControlledBoundsQaInput {
  generatedBounds: RigStrongBounds | null;
  controlBounds: RigAlphaControlBounds;
  minGeneratedHeightRatio?: number;
  minOverlapRatio?: number;
}

export interface RigMaskControlledVisualContinuityQaInput {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  bg: Rgb;
  controlBounds: RigAlphaControlBounds;
  strongSignalDistance?: number;
  minSignalHeightRatio?: number;
  minRowCoverageRatio?: number;
  maxInternalGapRatio?: number;
  minDetailPixelRatio?: number;
}

export interface RigVisibleMatteArtifactQaInput {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  bg: Rgb;
  /** Fraction of the canvas allowed to read as a pale matte wash before it is flagged. */
  maxPaleAreaRatio?: number;
  /** Absolute floor so anti-alias fringe / specks on tiny canvases never trip the check. */
  minBlotchPixels?: number;
}

function buildStrongForegroundDistanceMap(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  bg: Rgb,
  options: {
    strongForegroundDistance: number;
    shadowLumaDelta: number;
    shadowStartY: number;
  },
): Uint16Array {
  const maxDistance = width + height + 1;
  const distances = new Uint16Array(width * height);
  const bgLuma = luma(bg);

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    const pixelRow = row * 4;
    for (let x = 0; x < width; x += 1) {
      const p = row + x;
      const i = pixelRow + x * 4;
      if (pixels[i + 3] === 0) {
        distances[p] = maxDistance;
        continue;
      }

      const current = { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] };
      const distance = Math.abs(current.r - bg.r) + Math.abs(current.g - bg.g) + Math.abs(current.b - bg.b);
      const currentLuma = luma(current);
      const isPaleBackgroundLike =
        current.r >= bg.r + 6 &&
        current.g >= bg.g + 10 &&
        current.b >= bg.b + 14;
      const isLikelyShadowSeed =
        y >= options.shadowStartY &&
        currentLuma <= bgLuma - options.shadowLumaDelta &&
        distance < options.strongForegroundDistance * 4;

      distances[p] = distance >= options.strongForegroundDistance &&
        !isPaleBackgroundLike &&
        !isLikelyShadowSeed
        ? 0
        : maxDistance;
    }
  }

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const p = row + x;
      let best = distances[p];
      if (x > 0) best = Math.min(best, distances[p - 1] + 1);
      if (y > 0) best = Math.min(best, distances[p - width] + 1);
      distances[p] = best;
    }
  }

  for (let y = height - 1; y >= 0; y -= 1) {
    const row = y * width;
    for (let x = width - 1; x >= 0; x -= 1) {
      const p = row + x;
      let best = distances[p];
      if (x < width - 1) best = Math.min(best, distances[p + 1] + 1);
      if (y < height - 1) best = Math.min(best, distances[p + width] + 1);
      distances[p] = best;
    }
  }

  return distances;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

function hexToRgb(hex: string): Rgb | null {
  const raw = hex.replace(/^#/, "");
  const full = raw.length === 3
    ? raw.split("").map((c) => c + c).join("")
    : raw;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function colorDistance(pixels: ArrayLike<number>, i: number, bg: Rgb): number {
  return Math.abs(pixels[i] - bg.r) + Math.abs(pixels[i + 1] - bg.g) + Math.abs(pixels[i + 2] - bg.b);
}

function luma(color: Rgb): number {
  return color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
}

export function detectAlphaControlBounds(
  input: RigAlphaControlPixelInput,
  options: { alphaThreshold?: number; minForegroundPixels?: number } = {},
): RigAlphaControlBounds | null {
  const totalPixels = input.width * input.height;
  const expectedLength = totalPixels * 4;
  if (input.width <= 0 || input.height <= 0 || input.data.length < expectedLength) {
    return null;
  }

  const alphaThreshold = options.alphaThreshold ?? 8;
  const minForegroundPixels = options.minForegroundPixels ?? 16;
  let left = input.width;
  let right = -1;
  let top = input.height;
  let bottom = -1;
  let foregroundPixels = 0;

  for (let y = 0; y < input.height; y += 1) {
    const row = y * input.width;
    for (let x = 0; x < input.width; x += 1) {
      const alpha = input.data[(row + x) * 4 + 3] ?? 0;
      if (alpha <= alphaThreshold) continue;
      foregroundPixels += 1;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }

  if (foregroundPixels < minForegroundPixels || bottom < 0) return null;

  return {
    left,
    right,
    top,
    bottom,
    foregroundPixels,
    foregroundPixelRatio: foregroundPixels / totalPixels,
  };
}

function boundsHeight(bounds: RigStrongBounds): number {
  return bounds.bottom - bounds.top + 1;
}

function boundsArea(bounds: RigStrongBounds): number {
  const width = typeof bounds.left === "number" && typeof bounds.right === "number"
    ? bounds.right - bounds.left + 1
    : 1;
  return Math.max(1, width) * Math.max(1, boundsHeight(bounds));
}

function boundsIntersectionArea(a: RigStrongBounds, b: RigStrongBounds): number {
  if (
    typeof a.left !== "number" ||
    typeof a.right !== "number" ||
    typeof b.left !== "number" ||
    typeof b.right !== "number"
  ) {
    const top = Math.max(a.top, b.top);
    const bottom = Math.min(a.bottom, b.bottom);
    return Math.max(0, bottom - top + 1);
  }

  const left = Math.max(a.left, b.left);
  const right = Math.min(a.right, b.right);
  const top = Math.max(a.top, b.top);
  const bottom = Math.min(a.bottom, b.bottom);
  return Math.max(0, right - left + 1) * Math.max(0, bottom - top + 1);
}

export function getMaskControlledBoundsQaIssues({
  generatedBounds,
  controlBounds,
  minGeneratedHeightRatio = 0.55,
  minOverlapRatio = 0.35,
}: RigMaskControlledBoundsQaInput): string[] {
  if (!generatedBounds) {
    return ["Generated product foreground was not detectable against the mask/control reference."];
  }

  const issues: string[] = [];
  const generatedHeight = boundsHeight(generatedBounds);
  const controlHeight = boundsHeight(controlBounds);
  if (generatedHeight < controlHeight * minGeneratedHeightRatio) {
    issues.push("Generated product foreground is too small for the mask/control envelope.");
  }

  const intersectionArea = boundsIntersectionArea(generatedBounds, controlBounds);
  const overlapRatio = intersectionArea / Math.min(boundsArea(generatedBounds), boundsArea(controlBounds));
  if (overlapRatio < minOverlapRatio) {
    issues.push("Generated product foreground does not overlap the mask/control envelope enough to recanvas safely.");
  }

  return issues;
}

export function getMaskControlledVisualContinuityQaIssues({
  pixels,
  width,
  height,
  bg,
  controlBounds,
  strongSignalDistance = 34,
  minSignalHeightRatio = 0.52,
  minRowCoverageRatio = 0.16,
  maxInternalGapRatio = 0.34,
  minDetailPixelRatio = 0.045,
}: RigMaskControlledVisualContinuityQaInput): string[] {
  const expectedLength = width * height * 4;
  if (width <= 0 || height <= 0 || pixels.length < expectedLength) {
    return ["Generated image pixels could not be read for mask/control continuity QA."];
  }

  const left = Math.max(0, controlBounds.left - Math.round(width * 0.035));
  const right = Math.min(width - 1, controlBounds.right + Math.round(width * 0.035));
  const top = Math.max(0, controlBounds.top - Math.round(height * 0.02));
  const bottom = Math.min(height - 1, controlBounds.bottom + Math.round(height * 0.02));
  const controlHeight = Math.max(1, controlBounds.bottom - controlBounds.top + 1);
  const rowSignalThreshold = Math.max(2, Math.min(8, Math.round((right - left + 1) * 0.008)));
  const signalWindowArea = Math.max(1, (right - left + 1) * (bottom - top + 1));
  const significantRows: number[] = [];
  const bgLuma = luma(bg);
  let signalTop = height;
  let signalBottom = -1;
  let detailSignalPixels = 0;

  for (let y = top; y <= bottom; y += 1) {
    let rowSignal = 0;
    const row = y * width;
    for (let x = left; x <= right; x += 1) {
      const i = (row + x) * 4;
      if ((pixels[i + 3] ?? 0) <= 8) continue;

      const current = { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] };
      const currentLuma = luma(current);
      const distance = colorDistance(pixels, i, bg);
      const isPaleMatteLike =
        current.r >= bg.r + 6 &&
        current.g >= bg.g + 10 &&
        current.b >= bg.b + 14;
      const isProductDetailSignal =
        currentLuma <= bgLuma - 28 ||
        (distance >= strongSignalDistance * 2 && !isPaleMatteLike);
      const isVisibleProductSignal =
        (distance >= strongSignalDistance && !isPaleMatteLike) ||
        currentLuma <= bgLuma - 22;

      if (isProductDetailSignal) detailSignalPixels += 1;
      if (!isVisibleProductSignal) continue;
      rowSignal += 1;
      signalTop = Math.min(signalTop, y);
      signalBottom = Math.max(signalBottom, y);
    }

    if (rowSignal >= rowSignalThreshold) {
      significantRows.push(y);
    }
  }

  const issues: string[] = [];
  if (signalBottom < 0 || significantRows.length === 0) {
    return ["Generated product has too little visible foreground inside the mask/control envelope."];
  }

  const signalHeight = signalBottom - signalTop + 1;
  if (signalHeight < controlHeight * minSignalHeightRatio) {
    issues.push("Generated product has too little visible foreground inside the mask/control envelope.");
  }

  if (detailSignalPixels < Math.max(12, Math.floor(signalWindowArea * minDetailPixelRatio))) {
    issues.push("Generated product lacks enough product edge/detail signal inside the mask/control envelope.");
  }

  if (significantRows.length < controlHeight * minRowCoverageRatio) {
    issues.push("Generated product foreground is too sparse inside the mask/control envelope.");
  }

  let maxInternalGap = 0;
  for (let i = 1; i < significantRows.length; i += 1) {
    maxInternalGap = Math.max(maxInternalGap, significantRows[i] - significantRows[i - 1] - 1);
  }
  if (maxInternalGap > controlHeight * maxInternalGapRatio) {
    issues.push("Generated product foreground is discontinuous inside the mask/control envelope.");
  }

  return issues;
}

export function getVisibleMatteArtifactQaIssues({
  pixels,
  width,
  height,
  bg,
  maxPaleAreaRatio = 0.02,
  minBlotchPixels = 64,
}: RigVisibleMatteArtifactQaInput): string[] {
  const expectedLength = width * height * 4;
  if (width <= 0 || height <= 0 || pixels.length < expectedLength) {
    return ["Generated image pixels could not be read for matte-artifact QA."];
  }

  // A leftover generation matte reads as a pale wash that is lighter than the
  // warm Bone background on every channel (the same signature the foreground
  // matte treats as "pale background-like"). A darker contact shadow fails this
  // test, so legitimate grounding is preserved.
  let paleMattePixels = 0;
  for (let i = 0; i < expectedLength; i += 4) {
    if ((pixels[i + 3] ?? 0) <= 8) continue;
    const isPaleMatteLike =
      pixels[i] >= bg.r + 6 &&
      pixels[i + 1] >= bg.g + 10 &&
      pixels[i + 2] >= bg.b + 14;
    if (isPaleMatteLike) paleMattePixels += 1;
  }

  const area = width * height;
  const limit = Math.max(minBlotchPixels, Math.floor(area * maxPaleAreaRatio));
  if (paleMattePixels <= limit) {
    return [];
  }

  const pct = ((paleMattePixels / area) * 100).toFixed(1);
  return [
    `Visible matte artifact: a pale blotch covers ~${pct}% of the canvas (leftover generation matte against the Bone background).`,
  ];
}

function buildAlphaForegroundDistanceMap(
  mask: RigAlphaControlPixelInput,
  alphaThreshold: number,
): Uint16Array {
  const { width, height } = mask;
  const maxDistance = width + height + 1;
  const distances = new Uint16Array(width * height);

  for (let p = 0; p < distances.length; p += 1) {
    const alpha = mask.data[p * 4 + 3] ?? 0;
    distances[p] = alpha > alphaThreshold ? 0 : maxDistance;
  }

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const p = row + x;
      let best = distances[p];
      if (x > 0) best = Math.min(best, distances[p - 1] + 1);
      if (y > 0) best = Math.min(best, distances[p - width] + 1);
      distances[p] = best;
    }
  }

  for (let y = height - 1; y >= 0; y -= 1) {
    const row = y * width;
    for (let x = width - 1; x >= 0; x -= 1) {
      const p = row + x;
      let best = distances[p];
      if (x < width - 1) best = Math.min(best, distances[p + 1] + 1);
      if (y < height - 1) best = Math.min(best, distances[p + width] + 1);
      distances[p] = best;
    }
  }

  return distances;
}

export function applyMaskControlledForegroundMatte(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  bg: Rgb,
  mask: RigAlphaControlPixelInput,
  options: RigMaskControlledForegroundMatteOptions = {},
): RigForegroundMatteResult {
  const alphaThreshold = options.alphaThreshold ?? 8;
  const controlBounds =
    options.controlBounds ?? detectAlphaControlBounds(mask, { alphaThreshold });
  if (!controlBounds || mask.width !== width || mask.height !== height) {
    return applyRigForegroundMatte(pixels, width, height, bg);
  }

  const distanceToMask = buildAlphaForegroundDistanceMap(mask, alphaThreshold);
  const foregroundHaloPx =
    options.foregroundHaloPx ?? Math.max(2, Math.round(Math.min(width, height) * 0.006));
  const shadowNeighborhoodPx =
    options.shadowNeighborhoodPx ?? Math.max(foregroundHaloPx + 2, Math.round(Math.min(width, height) * 0.055));
  const shadowLumaDelta = options.shadowLumaDelta ?? 24;
  const bgLuma = luma(bg);
  const shadowStartY = Math.max(
    Math.round(height * 0.58),
    controlBounds.bottom - Math.round(height * 0.035),
  );
  const shadowMaxY = Math.min(height - 1, controlBounds.bottom + Math.round(height * 0.045));
  const shadowLeft = Math.max(0, controlBounds.left - Math.round(width * 0.035));
  const shadowRight = Math.min(width - 1, controlBounds.right + Math.round(width * 0.18));
  // Clamp each feather margin to at most half its own lane's extent — an
  // absolute-pixel floor can otherwise exceed a thin shadow lane entirely
  // (e.g. a small product with little clearance below it) and collapse the
  // whole lane to zero alpha instead of just softening its edges.
  const laneFeatherXPx = Math.min(Math.max(8, Math.round(width * 0.03)), Math.max(1, Math.floor((shadowRight - shadowLeft) / 2)));
  const laneFeatherYPx = Math.min(Math.max(6, Math.round(height * 0.015)), Math.max(1, Math.floor((shadowMaxY - shadowStartY) / 2)));
  const laneFeatherDistPx = Math.min(Math.max(4, Math.round(shadowNeighborhoodPx * 0.35)), Math.max(1, Math.floor(shadowNeighborhoodPx / 2)));
  let mattedBackgroundPixels = 0;
  let opaqueForegroundPixels = 0;
  let shadowPixels = 0;

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    const pixelRow = row * 4;
    for (let x = 0; x < width; x += 1) {
      const p = row + x;
      const i = pixelRow + x * 4;
      if (pixels[i + 3] === 0) {
        mattedBackgroundPixels += 1;
        continue;
      }

      const maskAlpha = mask.data[p * 4 + 3] ?? 0;
      const distance = colorDistance(pixels, i, bg);
      const current = { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] };
      const currentLuma = luma(current);
      const isPaleMatteLike =
        current.r >= bg.r + 6 &&
        current.g >= bg.g + 10 &&
        current.b >= bg.b + 14;
      const nearMask = distanceToMask[p] <= foregroundHaloPx;
      const isStrongEdge = distance >= 58 && !isPaleMatteLike;
      const isWithinShadowLane =
        y >= shadowStartY &&
        y <= shadowMaxY &&
        x >= shadowLeft &&
        x <= shadowRight &&
        distanceToMask[p] <= shadowNeighborhoodPx;
      const isContactShadow =
        options.paintShadow !== false &&
        isWithinShadowLane &&
        currentLuma <= bgLuma - shadowLumaDelta &&
        distance >= shadowLumaDelta + 10 &&
        distance < 260;

      if (maskAlpha > alphaThreshold || (nearMask && isStrongEdge)) {
        pixels[i + 3] = 255;
        opaqueForegroundPixels += 1;
        continue;
      }

      if (isContactShadow) {
        // Feathered lane edges on all four bounds + the neighborhood ring so
        // the synthesized shadow fades out instead of cutting a rectangle.
        const edgeFalloff =
          shadowEdgeFalloff01((x - shadowLeft) / laneFeatherXPx) *
          shadowEdgeFalloff01((shadowRight - x) / laneFeatherXPx) *
          shadowEdgeFalloff01((y - shadowStartY) / laneFeatherYPx) *
          shadowEdgeFalloff01((shadowMaxY - y) / laneFeatherYPx) *
          shadowEdgeFalloff01((shadowNeighborhoodPx - distanceToMask[p]) / laneFeatherDistPx);
        const shadowStrength = clamp((bgLuma - currentLuma) / 58, 0.2, 0.62) * edgeFalloff;
        if (shadowStrength > 0.02) {
          pixels[i + 3] = Math.round(255 * shadowStrength);
          shadowPixels += 1;
          continue;
        }
        pixels[i] = bg.r;
        pixels[i + 1] = bg.g;
        pixels[i + 2] = bg.b;
        pixels[i + 3] = 0;
        mattedBackgroundPixels += 1;
        continue;
      }

      pixels[i] = bg.r;
      pixels[i + 1] = bg.g;
      pixels[i + 2] = bg.b;
      pixels[i + 3] = 0;
      mattedBackgroundPixels += 1;
    }
  }

  return {
    mattedBackgroundPixels,
    opaqueForegroundPixels,
    shadowPixels,
  };
}

export function flattenBackgroundLikePixels(
  pixels: Uint8ClampedArray,
  bg: Rgb,
  options: RigBackgroundFlattenOptions = {},
): RigBackgroundFlattenResult {
  const creamDistance = options.creamDistance ?? 32;
  const paleForegroundGreenDelta = options.paleForegroundGreenDelta ?? 10;
  const paleForegroundBlueDelta = options.paleForegroundBlueDelta ?? 14;
  const shadowLumaDelta = options.shadowLumaDelta ?? 28;
  const strongForegroundDistance = options.strongForegroundDistance ?? 72;
  const bgLuma = luma(bg);
  let flattenedPixels = 0;
  let preservedPixels = 0;

  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) {
      preservedPixels += 1;
      continue;
    }

    const current = { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] };
    const distance = Math.abs(current.r - bg.r) + Math.abs(current.g - bg.g) + Math.abs(current.b - bg.b);
    const currentLuma = luma(current);
    const isWhiteOrPaleForeground =
      current.r >= bg.r + 6 &&
      current.g >= bg.g + paleForegroundGreenDelta &&
      current.b >= bg.b + paleForegroundBlueDelta;
    const isShadowOrDarkDetail = currentLuma <= bgLuma - shadowLumaDelta;
    const isStrongForeground = distance >= strongForegroundDistance;

    if (
      distance <= creamDistance &&
      !isWhiteOrPaleForeground &&
      !isShadowOrDarkDetail &&
      !isStrongForeground
    ) {
      pixels[i] = bg.r;
      pixels[i + 1] = bg.g;
      pixels[i + 2] = bg.b;
      flattenedPixels += 1;
    } else {
      preservedPixels += 1;
    }
  }

  return { flattenedPixels, preservedPixels };
}

function sampleOpaqueCanvasBorderBackground(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  fallback: Rgb,
): Rgb {
  const borderSamples: Rgb[] = [];
  const sampleCount = 16;
  const addSample = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    if ((pixels[i + 3] ?? 0) <= 8) return;
    borderSamples.push({ r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] });
  };
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const x = Math.round((sample / (sampleCount - 1)) * Math.max(0, width - 1));
    const y = Math.round((sample / (sampleCount - 1)) * Math.max(0, height - 1));
    addSample(x, 0);
    addSample(x, Math.max(0, height - 1));
    addSample(0, y);
    addSample(Math.max(0, width - 1), y);
  }
  const medianChannel = (channel: keyof Rgb, fallbackChannel: number) => {
    if (borderSamples.length === 0) return fallbackChannel;
    const values = borderSamples.map((sample) => sample[channel]).sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  };
  return {
    r: medianChannel("r", fallback.r),
    g: medianChannel("g", fallback.g),
    b: medianChannel("b", fallback.b),
  };
}

export function prepareRigAnalysisPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  targetBackground: Rgb,
): { background: Rgb; flattenResult: RigBackgroundFlattenResult } {
  const background = sampleOpaqueCanvasBorderBackground(
    pixels,
    width,
    height,
    targetBackground,
  );
  return {
    background,
    flattenResult: flattenBackgroundLikePixels(pixels, background),
  };
}

/**
 * Smoothstep for shadow-lane edge feathering: hard binary lane bounds produced
 * a visible rectangular cut around synthesized contact shadows. Alpha now
 * fades to zero across a feather margin inside each lane bound instead of
 * jumping at the boundary.
 */
function shadowEdgeFalloff01(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

/**
 * Paint the catalog grounding shadow after framing QA has measured the product.
 * Only pixels still reading as the flat target background are darkened, so the
 * bottle, clear-glass edges, cap hardware, and measured silhouette are never
 * repainted or allowed to affect baseline/fill-height decisions.
 */
export function addDeterministicContactShadow(
  pixels: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  bg: Rgb,
  options: RigDeterministicContactShadowOptions,
): RigDeterministicContactShadowResult {
  const bounds = options.objectBounds;
  const baseline = options.baselineYPx;
  if (
    !bounds ||
    baseline == null ||
    typeof bounds.left !== "number" ||
    typeof bounds.right !== "number" ||
    bounds.right <= bounds.left
  ) {
    return { shadowPixels: 0 };
  }

  const productWidth = bounds.right - bounds.left + 1;
  const productCenterX = (bounds.left + bounds.right + 1) / 2;
  const contactRadiusX = clamp(productWidth * 0.42, width * 0.035, width * 0.11);
  const contactRadiusY = clamp(height * 0.0025, 3, height * 0.012);
  const contactCenterX = productCenterX + contactRadiusX * 0.02;
  const contactCenterY = Math.min(height - 1, baseline + Math.max(1, contactRadiusY * 0.2));
  const featherRadiusX = clamp(productWidth * 0.72, width * 0.05, width * 0.18);
  const featherRadiusY = clamp(height * 0.006, 6, height * 0.018);
  const featherCenterX = productCenterX + featherRadiusX * 0.18;
  const featherCenterY = Math.min(height - 1, baseline + Math.max(1, featherRadiusY * 0.25));
  const maxOpacity = clamp(options.maxOpacity ?? 0.22, 0, 0.35);
  const featherOpacity = maxOpacity * 0.32;
  const backgroundDistanceThreshold = options.backgroundDistanceThreshold ?? 36;
  const shadowColor = { r: 76, g: 72, b: 68 };
  const x0 = Math.max(0, Math.floor(featherCenterX - featherRadiusX));
  const x1 = Math.min(width - 1, Math.ceil(featherCenterX + featherRadiusX));
  const y0 = Math.max(0, Math.floor(featherCenterY - featherRadiusY));
  const y1 = Math.min(height - 1, Math.ceil(featherCenterY + featherRadiusY));
  let shadowPixels = 0;

  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const i = (y * width + x) * 4;
      if (pixels[i + 3] === 0) continue;
      const backgroundDistance =
        Math.abs(pixels[i] - bg.r) +
        Math.abs(pixels[i + 1] - bg.g) +
        Math.abs(pixels[i + 2] - bg.b);
      if (backgroundDistance > backgroundDistanceThreshold) continue;

      const contactDx = (x - contactCenterX) / contactRadiusX;
      const contactDy = (y - contactCenterY) / contactRadiusY;
      const contactDistance = contactDx * contactDx + contactDy * contactDy;
      const contactAlpha = contactDistance < 1
        ? maxOpacity * (1 - contactDistance) ** 2
        : 0;
      const featherDx = (x - featherCenterX) / featherRadiusX;
      const featherDy = (y - featherCenterY) / featherRadiusY;
      const featherDistance = featherDx * featherDx + featherDy * featherDy;
      const featherAlphaAtPixel = featherDistance < 1
        ? featherOpacity * (1 - featherDistance) ** 2
        : 0;
      const alpha = 1 - (1 - contactAlpha) * (1 - featherAlphaAtPixel);
      if (alpha <= 0.005) continue;

      pixels[i] = Math.round(pixels[i] * (1 - alpha) + shadowColor.r * alpha);
      pixels[i + 1] = Math.round(pixels[i + 1] * (1 - alpha) + shadowColor.g * alpha);
      pixels[i + 2] = Math.round(pixels[i + 2] * (1 - alpha) + shadowColor.b * alpha);
      pixels[i + 3] = 255;
      shadowPixels += 1;
    }
  }

  return { shadowPixels };
}

/**
 * Resolve the one authority allowed to paint/read the final grounding shadow.
 * Rig-owned images receive the deterministic contact pass; model-owned images
 * are only analyzed and their candidate is left untouched for review/approval.
 */
export function finalizeRigShadow(
  input: RigFinalizeShadowInput,
): RigFinalizeShadowResult {
  if (input.owner === "model") {
    // Jordan 2026-07-19: the shadow QA analyzer is REMOVED from the flow.
    // The model paints a subtle grounded shadow per the prompt; the human
    // review checkboxes are the only shadow judgment. Too many legitimate
    // photographic configurations for a numeric contract.
    return {
      deterministicShadowPixels: 0,
      shadowQa: null,
    };
  }

  return {
    deterministicShadowPixels: addDeterministicContactShadow(
      input.pixels,
      input.width,
      input.height,
      input.background,
      {
        objectBounds: input.objectBounds,
        baselineYPx: input.baselineYPx,
      },
    ).shadowPixels,
    shadowQa: null,
  };
}

export function applyRigForegroundMatte(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  bg: Rgb,
  options: RigForegroundMatteOptions = {},
): RigForegroundMatteResult {
  const strongForegroundDistance = options.strongForegroundDistance ?? 52;
  const paleForegroundDistance = options.paleForegroundDistance ?? 32;
  const shadowLumaDelta = options.shadowLumaDelta ?? 24;
  const shadowStartY = Math.round(height * (options.shadowStartPct ?? 0.62));
  const foregroundNeighborhoodPx =
    options.foregroundNeighborhoodPx ?? Math.max(4, Math.round(Math.min(width, height) * 0.06));
  const shadowNeighborhoodPx =
    options.shadowNeighborhoodPx ?? Math.max(foregroundNeighborhoodPx + 1, Math.round(Math.min(width, height) * 0.075));
  // Same defensive clamp as applyMaskControlledForegroundMatte: never let the
  // feather margin exceed half of its own lane's extent.
  const shadowFeatherYPx = Math.min(Math.max(6, Math.round(height * 0.02)), Math.max(1, Math.floor((height - 1 - shadowStartY) / 2)));
  const shadowFeatherDistPx = Math.min(Math.max(4, Math.round(shadowNeighborhoodPx * 0.35)), Math.max(1, Math.floor(shadowNeighborhoodPx / 2)));
  const protectedProductBounds = options.protectedProductBounds ?? null;
  const distanceToStrongForeground = buildStrongForegroundDistanceMap(pixels, width, height, bg, {
    strongForegroundDistance,
    shadowLumaDelta,
    shadowStartY,
  });
  const bgLuma = luma(bg);
  let mattedBackgroundPixels = 0;
  let opaqueForegroundPixels = 0;
  let shadowPixels = 0;

  for (let y = 0; y < height; y += 1) {
    const row = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      const i = row + x * 4;
      if (pixels[i + 3] === 0) {
        mattedBackgroundPixels += 1;
        continue;
      }

      const current = { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] };
      const distance = Math.abs(current.r - bg.r) + Math.abs(current.g - bg.g) + Math.abs(current.b - bg.b);
      const currentLuma = luma(current);
      const isPaleBackgroundLike =
        current.r >= bg.r + 6 &&
        current.g >= bg.g + 10 &&
        current.b >= bg.b + 14;
      // Pollution must actually read as "background-like" by this file's own
      // standard (isPaleBackgroundLike, used everywhere else) — not a looser,
      // separately-invented threshold. The old +3/+3/+3 bar was nearly a third
      // as strict as isPaleBackgroundLike, so a genuinely faint, correctly
      // rendered clear/pale component (e.g. a clear plastic overcap) was
      // indistinguishable from "leftover matte bleed" and got erased.
      const isProtectedPalePollutionColor = isPaleBackgroundLike;
      const foregroundDistance = distanceToStrongForeground[y * width + x];
      const protectedPaleDetailHaloPx = Math.max(2, Math.round(foregroundNeighborhoodPx * 0.16));
      const isInsideProtectedProduct =
        protectedProductBounds !== null &&
        y >= protectedProductBounds.top &&
        y <= protectedProductBounds.bottom &&
        (
          typeof protectedProductBounds.left !== "number" ||
          x >= protectedProductBounds.left
        ) &&
        (
          typeof protectedProductBounds.right !== "number" ||
          x <= protectedProductBounds.right
        );
      if (isInsideProtectedProduct) {
        const isPaleInteriorPollution =
          isProtectedPalePollutionColor &&
          foregroundDistance > protectedPaleDetailHaloPx;
        if (isPaleInteriorPollution) {
          pixels[i] = bg.r;
          pixels[i + 1] = bg.g;
          pixels[i + 2] = bg.b;
          pixels[i + 3] = 0;
          mattedBackgroundPixels += 1;
          continue;
        }
        pixels[i + 3] = 255;
        opaqueForegroundPixels += 1;
        continue;
      }

      const isLikelyShadowPixel =
        y >= shadowStartY &&
        currentLuma <= bgLuma - shadowLumaDelta &&
        distance < strongForegroundDistance * 4;
      const isStrongForeground =
        distance >= strongForegroundDistance && !isPaleBackgroundLike && !isLikelyShadowPixel;
      const isNearStrongForeground =
        foregroundDistance <= foregroundNeighborhoodPx;
      const isNearShadowSource =
        foregroundDistance <= shadowNeighborhoodPx;
      const isPaleForeground =
        isNearStrongForeground &&
        distance >= paleForegroundDistance &&
        current.r >= bg.r + 6 &&
        current.g >= bg.g + 10 &&
        current.b >= bg.b + 14;
      const isContactShadow =
        y >= shadowStartY &&
        isNearShadowSource &&
        currentLuma <= bgLuma - shadowLumaDelta &&
        distance >= shadowLumaDelta + 12 &&
        distance < strongForegroundDistance * 4;

      if (isContactShadow) {
        // Feathered lane edges: fade alpha to zero approaching the lane's top
        // boundary and the outer neighborhood ring (no hard rectangular cut).
        const edgeFalloff =
          shadowEdgeFalloff01((y - shadowStartY) / shadowFeatherYPx) *
          shadowEdgeFalloff01((shadowNeighborhoodPx - foregroundDistance) / shadowFeatherDistPx);
        const shadowStrength = clamp((bgLuma - currentLuma) / 56, 0.22, 0.68) * edgeFalloff;
        if (shadowStrength > 0.02) {
          pixels[i + 3] = Math.round(255 * shadowStrength);
          shadowPixels += 1;
          continue;
        }
        pixels[i] = bg.r;
        pixels[i + 1] = bg.g;
        pixels[i + 2] = bg.b;
        pixels[i + 3] = 0;
        mattedBackgroundPixels += 1;
        continue;
      }

      if (isStrongForeground || isPaleForeground) {
        pixels[i + 3] = 255;
        opaqueForegroundPixels += 1;
        continue;
      }

      pixels[i] = bg.r;
      pixels[i + 1] = bg.g;
      pixels[i + 2] = bg.b;
      pixels[i + 3] = 0;
      mattedBackgroundPixels += 1;
    }
  }

  return {
    mattedBackgroundPixels,
    opaqueForegroundPixels,
    shadowPixels,
  };
}

export function prepareUnmaskedRigRecanvasPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  bg: Rgb,
  productBounds: RigStrongBounds | null,
  options: { preserveMask?: Uint8Array } = {},
): RigUnmaskedRigRecanvasResult {
  const sourceBg = sampleOpaqueCanvasBorderBackground(pixels, width, height, bg);
  const protectedLeft = productBounds
    ? Math.max(0, (productBounds.left ?? 0) - Math.max(2, Math.round(width * 0.04)))
    : 0;
  const protectedRight = productBounds
    ? Math.min(width - 1, (productBounds.right ?? width - 1) + Math.max(2, Math.round(width * 0.12)))
    : width - 1;
  const protectedTop = productBounds
    ? Math.max(0, productBounds.top - Math.max(2, Math.round(height * 0.03)))
    : 0;
  const protectedBottom = productBounds
    ? Math.min(height - 1, productBounds.bottom + Math.max(2, Math.round(height * 0.06)))
    : height - 1;
  let normalizedBackgroundPixels = 0;
  let preservedForegroundPixels = 0;
  let preservedShadowPixels = 0;

  // The generated plate can be a cool #F7F7F7 while the target is warm Bone.
  // Normalize it continuously instead of cutting it to alpha: hard thresholding
  // produces mottled holes through clear glass. Pixels far from the product are
  // forced to Bone; near the product, similarity to the sampled source plate
  // controls a smooth tint that preserves edges, material detail, and shadows.
  for (let p = 0; p < width * height; p += 1) {
    const i = p * 4;
    const x = p % width;
    const y = Math.floor(p / width);
    if (options.preserveMask?.[p] === 1) {
      pixels[i + 3] = 255;
      preservedShadowPixels += 1;
      continue;
    }
    const dr = Math.abs(pixels[i] - sourceBg.r);
    const dg = Math.abs(pixels[i + 1] - sourceBg.g);
    const db = Math.abs(pixels[i + 2] - sourceBg.b);
    const sourceDistance = dr + dg + db;
    const isInsideMeasuredProduct =
      productBounds !== null &&
      x >= (productBounds.left ?? 0) &&
      x <= (productBounds.right ?? width - 1) &&
      y >= productBounds.top &&
      y <= productBounds.bottom;
    const isMeasuredSourceForeground =
      isInsideMeasuredProduct &&
      (
        sourceDistance >= 52 ||
        (
          sourceDistance >= 16 &&
          pixels[i] >= sourceBg.r &&
          pixels[i + 1] >= sourceBg.g &&
          pixels[i + 2] >= sourceBg.b
        )
      );
    const outsideProtectedRegion =
      x < protectedLeft ||
      x > protectedRight ||
      y < protectedTop ||
      y > protectedBottom;
    const backgroundWeight = outsideProtectedRegion
      ? 1
      : isMeasuredSourceForeground
        ? 0
      : 1 - clamp((sourceDistance - 3) / 45, 0, 1);
    pixels[i] = Math.round(pixels[i] * (1 - backgroundWeight) + bg.r * backgroundWeight);
    pixels[i + 1] = Math.round(pixels[i + 1] * (1 - backgroundWeight) + bg.g * backgroundWeight);
    pixels[i + 2] = Math.round(pixels[i + 2] * (1 - backgroundWeight) + bg.b * backgroundWeight);
    pixels[i + 3] = 255;
    if (backgroundWeight >= 0.95) normalizedBackgroundPixels += 1;
    else preservedForegroundPixels += 1;
  }

  return {
    mattedBackgroundPixels: normalizedBackgroundPixels,
    opaqueForegroundPixels: preservedForegroundPixels,
    shadowPixels: 0,
    preservedShadowPixels,
  };
}

function resolveCapState(options: RigBaselineNormalizeOptions): RigCapState {
  const text = `${options.capState ?? ""} ${options.mode ?? ""}`.toLowerCase();
  return /\b(?:detached|cap[-_\s]?off|exploded)\b/.test(text) ? "detached" : "assembled";
}

function detectStrongBottomY(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  bg: Rgb,
  capState: RigCapState,
  maxBottomYPx?: number | null,
): number | null {
  const x0 = Math.round(width * (capState === "detached" ? 0.16 : 0.18));
  const x1 = Math.round(width * (capState === "detached" ? 0.62 : 0.82));
  const xStep = 2;
  const minRowHits = Math.max(10, Math.floor(((x1 - x0) / xStep) * 0.012));
  const strongThreshold = 52;

  const bottomY = Math.min(
    height - 1,
    maxBottomYPx == null ? height - 1 : Math.round(maxBottomYPx),
  );
  for (let y = bottomY; y >= Math.round(height * 0.42); y -= 1) {
    let rowHits = 0;
    const row = y * width * 4;
    for (let x = x0; x < x1; x += xStep) {
      if (colorDistance(pixels, row + x * 4, bg) >= strongThreshold) {
        rowHits += 1;
        if (rowHits >= minRowHits) return y;
      }
    }
  }
  return null;
}

export function detectStrongBounds(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  bg: Rgb,
  maxBottomYPx?: number,
  xRegion?: { left: number; right: number },
): RigStrongBounds | null {
  const strongThreshold = 52;
  const paleForegroundThreshold = 16;
  const xStep = 2;
  const minX = Math.max(0, Math.ceil((xRegion?.left ?? 0) / xStep) * xStep);
  const maxX = Math.min(width - 1, Math.floor((xRegion?.right ?? width - 1) / xStep) * xStep);
  const minRowHits = Math.max(6, Math.floor(((maxX - minX + 1) / xStep) * 0.02));
  let top = height;
  let bottom = -1;
  let left = width;
  let right = -1;

  const maxY = Math.min(height - 1, maxBottomYPx == null ? height - 1 : Math.round(maxBottomYPx));
  for (let y = 0; y <= maxY; y += 2) {
    const row = y * width * 4;
    let rowHits = 0;
    let rowLeft = width;
    let rowRight = -1;
    for (let x = minX; x <= maxX; x += xStep) {
      const i = row + x * 4;
      const distance = colorDistance(pixels, i, bg);
      const isPaleForeground =
        distance >= paleForegroundThreshold &&
        pixels[i] >= bg.r &&
        pixels[i + 1] >= bg.g &&
        pixels[i + 2] >= bg.b;
      if (distance >= strongThreshold || isPaleForeground) {
        rowHits += 1;
        rowLeft = Math.min(rowLeft, x);
        rowRight = Math.max(rowRight, x);
      }
    }
    if (rowHits >= minRowHits) {
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      left = Math.min(left, rowLeft);
      right = Math.max(right, rowRight);
    }
  }

  return bottom >= 0 ? { top, bottom, left, right } : null;
}

/**
 * Detached topology is authored with the primary bottle centered and the
 * loose component in a right sidecar. Restricting detection to the bottle lane
 * keeps the sidecar out of scale, centerline, baseline, and fill-height QA.
 */
export function detectPrimaryBottleBounds(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  bg: Rgb,
  maxBottomYPx?: number,
): RigStrongBounds | null {
  return detectStrongBounds(
    pixels,
    width,
    height,
    bg,
    maxBottomYPx,
    {
      left: Math.round(width * 0.12),
      right: Math.round(width * 0.70),
    },
  );
}

/**
 * Infer the product baseline without letting a low-density, low-contrast model
 * shadow tail become the last strong row. This is deliberately conservative:
 * only a contiguous tail whose signal occupies less than 72% of the raw
 * envelope and remains close to the background is removed from the baseline.
 */
export function detectModelGeometryBaseline(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  bg: Rgb,
  rawBounds: RigStrongBounds | null,
  rawBaselineYPx: number,
): number {
  if (
    !rawBounds ||
    typeof rawBounds.left !== "number" ||
    typeof rawBounds.right !== "number" ||
    rawBounds.right <= rawBounds.left ||
    !Number.isFinite(rawBaselineYPx)
  ) {
    return rawBaselineYPx;
  }

  const left = Math.max(0, Math.floor(rawBounds.left));
  const right = Math.min(width - 1, Math.ceil(rawBounds.right));
  const envelopeWidth = Math.max(1, right - left + 1);
  const maxShadowLumaDelta = 80;
  let baseline = Math.min(height - 1, Math.max(0, Math.round(rawBaselineYPx)));
  let tailRows = 0;

  for (let y = baseline; y >= Math.round(height * 0.42); y -= 1) {
    let signalPixels = 0;
    let shadowLikePixels = 0;
    for (let x = left; x <= right; x += 1) {
      const i = (y * width + x) * 4;
      const distance = colorDistance(pixels, i, bg);
      if (distance < 16) continue;
      signalPixels += 1;
      const pixelLuma = luma({ r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] });
      const lumaDelta = luma(bg) - pixelLuma;
      if (lumaDelta >= 4 && lumaDelta <= maxShadowLumaDelta) {
        shadowLikePixels += 1;
      }
    }

    const lowDensity = signalPixels > 0 && signalPixels / envelopeWidth < 0.72;
    const mostlyShadowLike = shadowLikePixels >= Math.max(2, signalPixels * 0.7);
    const stronglyDarkNarrowTail = signalPixels > 0 && signalPixels / envelopeWidth < 0.55;
    if (lowDensity && (mostlyShadowLike || stronglyDarkNarrowTail)) {
      tailRows += 1;
      baseline = y - 1;
      continue;
    }
    break;
  }

  return tailRows > 0 ? Math.max(0, baseline) : Math.min(height - 1, Math.max(0, Math.round(rawBaselineYPx)));
}

/**
 * Re-measure a transformed product inside its known source-derived envelope.
 * Warm background normalization can reduce the RGB distance of translucent
 * gray cap edges even when those pixels remain visibly intact. The relaxed
 * dark-edge test is safe only inside the deterministic product control bounds;
 * the rest of the canvas continues to use the stricter global detector.
 */
export function detectControlledRigBounds(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  bg: Rgb,
  controlBounds: RigStrongBounds | null,
): RigStrongBounds | null {
  if (!controlBounds) return null;
  const xStep = 2;
  const yStep = 2;
  const minX = Math.max(0, Math.ceil((controlBounds.left ?? 0) / xStep) * xStep);
  const maxX = Math.min(width - 1, Math.floor((controlBounds.right ?? width - 1) / xStep) * xStep);
  const minRowHits = Math.max(6, Math.floor(((maxX - minX + 1) / xStep) * 0.02));
  const minY = Math.max(0, Math.ceil(controlBounds.top / yStep) * yStep);
  const maxY = Math.min(height - 1, Math.floor(controlBounds.bottom / yStep) * yStep);
  const bgLuma = luma(bg);
  let top = height;
  let bottom = -1;
  let left = width;
  let right = -1;

  for (let y = minY; y <= maxY; y += yStep) {
    const row = y * width * 4;
    let rowHits = 0;
    let rowLeft = width;
    let rowRight = -1;
    for (let x = minX; x <= maxX; x += xStep) {
      const i = row + x * 4;
      const distance = colorDistance(pixels, i, bg);
      const isPaleForeground =
        distance >= 16 &&
        pixels[i] >= bg.r &&
        pixels[i + 1] >= bg.g &&
        pixels[i + 2] >= bg.b;
      const currentLuma = luma({ r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] });
      const isControlledTranslucentEdge = distance >= 20 && currentLuma <= bgLuma - 8;
      if (distance >= 52 || isPaleForeground || isControlledTranslucentEdge) {
        rowHits += 1;
        rowLeft = Math.min(rowLeft, x);
        rowRight = Math.max(rowRight, x);
      }
    }
    if (rowHits >= minRowHits) {
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      left = Math.min(left, rowLeft);
      right = Math.max(right, rowRight);
    }
  }

  return bottom >= 0 ? { top, bottom, left, right } : null;
}

/**
 * Measure the glass body's lateral extent in its lower wall/base band.
 * Fitments can be wider than the bottle and detached caps share the baseline,
 * so neither the full vessel envelope nor the whole foreground is diameter
 * evidence.
 */
export function detectGlassBodyWidthBounds(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
  bg: Rgb,
  bodyControlBounds: RigStrongBounds | null | undefined,
): RigStrongBounds | null {
  if (
    !bodyControlBounds ||
    typeof bodyControlBounds.left !== "number" ||
    typeof bodyControlBounds.right !== "number" ||
    bodyControlBounds.bottom <= bodyControlBounds.top
  ) {
    return null;
  }
  const bodyHeight = bodyControlBounds.bottom - bodyControlBounds.top;
  const minY = Math.max(
    0,
    Math.round(bodyControlBounds.top + bodyHeight * 0.72),
  );
  const maxY = Math.min(
    height - 1,
    Math.round(bodyControlBounds.top + bodyHeight * 0.96),
  );
  const minX = Math.max(0, Math.floor(bodyControlBounds.left));
  const maxX = Math.min(width - 1, Math.ceil(bodyControlBounds.right));
  const minHits = Math.max(3, Math.round((maxY - minY + 1) * 0.035));
  let left = width;
  let right = -1;

  for (let x = minX; x <= maxX; x += 1) {
    let hits = 0;
    for (let y = minY; y <= maxY; y += 2) {
      const i = (y * width + x) * 4;
      const distance = colorDistance(pixels, i, bg);
      if (distance >= 64) hits += 1;
    }
    if (hits < minHits) continue;
    left = Math.min(left, x);
    right = Math.max(right, x);
  }
  return right > left
    ? { top: minY, bottom: maxY, left, right }
    : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isExactBodyControlBounds(bounds: RigStrongBounds | null | undefined): bounds is RigStrongBounds {
  return !!bounds && bounds.bottom > bounds.top;
}

/**
 * Scale-card body gate: when `targetBodyHeightPx` is set, vertical scale must
 * come from exact glass-body control bounds (foot-to-rim). Never fall back to
 * capacity, fillHeightPct, primaryBounds, or the full assembly envelope.
 */
function resolveBodyControlIdealScale(input: RigFrameTransformInput): number | null {
  const targetBodyHeightPx = input.rig.targetBodyHeightPx;
  const hasShoulderLock =
    typeof input.rig.shoulderTargetPct === "number" &&
    typeof input.rig.targetShoulderYPx === "number";
  if (
    (input.preserveGeneratedScale && !hasShoulderLock)
    || typeof targetBodyHeightPx !== "number"
    || !(targetBodyHeightPx > 0)
  ) {
    return null;
  }
  if (!isExactBodyControlBounds(input.bodyControlBounds)) {
    throw new Error(
      "Exact glass body-control bounds are required for scale-card body sizing; refusing assembly-envelope or capacity fallback.",
    );
  }
  const measuredBodyHeightPx = input.bodyControlBounds.bottom - input.bodyControlBounds.top;
  if (!(measuredBodyHeightPx > 0)) {
    throw new Error(
      "Exact glass body-control bounds are required for scale-card body sizing; refusing assembly-envelope or capacity fallback.",
    );
  }
  return targetBodyHeightPx / measuredBodyHeightPx;
}

export function computeRigFrameTransform(input: RigFrameTransformInput): RigFrameTransform {
  const targetBaseline = Math.round(input.height * (1 - input.rig.baselinePct / 100));
  const fullBounds = input.strongBounds;
  // Width/center authority comes from the primary bottle whenever it can be
  // isolated. This also covers connected vintage bulb/tassel assemblies: the
  // accessory receives lateral room, but it never pulls the bottle off its
  // governed centerline.
  const bounds = input.primaryBounds ?? fullBounds;
  const bodyIdealScale = resolveBodyControlIdealScale(input);
  const baselineToTop = bounds ? input.detectedBaselineYPx - bounds.top : 0;
  // Legacy path (no targetBodyHeightPx): fit the visible primary/assembly
  // envelope to fillHeightPct. Scale-card masters never take this path —
  // resolveBodyControlIdealScale fails closed without exact body bounds.
  const targetFillHeight = input.height * (input.rig.fillHeightPct / 100);
  const envelopeIdealScale = baselineToTop > 0 ? targetFillHeight / baselineToTop : 1;
  const idealScale = bodyIdealScale ?? envelopeIdealScale;
  const scaleNeedsCorrection = Math.abs(idealScale - 1) > 0.025;
  const minimumScale = 0.5;
  const hasShoulderLock =
    typeof input.rig.shoulderTargetPct === "number" &&
    typeof input.rig.targetShoulderYPx === "number";
  const preserveGeneratedScale = input.preserveGeneratedScale && !hasShoulderLock;
  let scale = preserveGeneratedScale
    ? 1
    : scaleNeedsCorrection
      ? clamp(idealScale, minimumScale, 2.5)
      : 1;

  if (bounds && !preserveGeneratedScale && !hasShoulderLock) {
    if (typeof bounds.left === "number" && typeof bounds.right === "number" && bounds.right > bounds.left) {
      const boundsWidth = bounds.right - bounds.left + 1;
      const targetFillWidth = input.width * (input.rig.fillWidthPct / 100);
      const widthScale = boundsWidth > 0 ? targetFillWidth / boundsWidth : scale;
      if (Number.isFinite(widthScale) && widthScale > 0) {
        scale = Math.min(scale, widthScale);
      }
    }
    if (
      fullBounds
      && typeof fullBounds.left === "number"
      && typeof fullBounds.right === "number"
      && fullBounds.right > fullBounds.left
    ) {
      const fullAssemblyWidth = fullBounds.right - fullBounds.left + 1;
      const assemblyWidthScale = (input.width * 0.88) / fullAssemblyWidth;
      if (Number.isFinite(assemblyWidthScale) && assemblyWidthScale > 0) {
        scale = Math.min(scale, assemblyWidthScale);
      }
    }
    // Body-control scale must keep the full assembly on-canvas (seated caps /
    // taller envelopes). Legacy fillHeight sizing keeps prior air authority.
    const airBounds = bodyIdealScale != null ? (fullBounds ?? bounds) : bounds;
    const airBaselineToTop = airBounds ? input.detectedBaselineYPx - airBounds.top : 0;
    const minTopAir = Math.round(input.height * 0.06);
    const topLimitScale = airBaselineToTop > 0
      ? (targetBaseline - minTopAir) / airBaselineToTop
      : scale;
    const baselineToBottom = airBounds
      ? Math.max(0, airBounds.bottom - input.detectedBaselineYPx)
      : 0;
    const bottomLimitScale = baselineToBottom > 0
      ? (input.height - 12 - targetBaseline) / baselineToBottom
      : scale;
    scale = Math.min(scale, topLimitScale, bottomLimitScale);
    scale = clamp(scale, minimumScale, 2.5);
  }

  // Seat the glass foot (detectedBaselineYPx) on the shared baseline after
  // uniform scale — this is scale-about-foot in canvas space.
  let shiftY = targetBaseline - input.detectedBaselineYPx * scale;
  if (Math.abs(scale - 1) <= 0.005 && Math.abs(shiftY) <= 8) {
    scale = 1;
    shiftY = 0;
  }

  let shiftX = 0;
  if (
    (input.capState !== "detached" || input.primaryBounds != null) &&
    bounds &&
    typeof bounds.left === "number" &&
    typeof bounds.right === "number" &&
    bounds.right > bounds.left
  ) {
    const baseDrawX = (input.width - input.width * scale) / 2;
    const boundsCenter = (bounds.left + bounds.right + 1) / 2;
    const targetCenter =
      input.width * ((input.rig.primaryObjectCenterXPct ?? 50) / 100);
    const requestedShiftX = targetCenter - (boundsCenter * scale + baseDrawX);
    const minSideAir = Math.round(input.width * 0.06);
    const airBounds = fullBounds ?? bounds;
    const transformedLeftWithoutShift =
      (typeof airBounds.left === "number" ? airBounds.left : bounds.left) * scale + baseDrawX;
    const transformedRightWithoutShift =
      (typeof airBounds.right === "number" ? airBounds.right : bounds.right) * scale + baseDrawX;
    const minShift = minSideAir - transformedLeftWithoutShift;
    const maxShift = input.width - minSideAir - transformedRightWithoutShift;
    shiftX = clamp(requestedShiftX, minShift, maxShift);
    if (Math.abs(shiftX) <= 8) shiftX = 0;
  }

  const transformedTop = fullBounds ? fullBounds.top * scale + shiftY : null;
  const transformedBottom = fullBounds ? fullBounds.bottom * scale + shiftY : null;
  const baseDrawX = (input.width - input.width * scale) / 2;
  const transformedLeft = fullBounds && typeof fullBounds.left === "number"
    ? fullBounds.left * scale + baseDrawX + shiftX
    : null;
  const transformedRight = fullBounds && typeof fullBounds.right === "number"
    ? fullBounds.right * scale + baseDrawX + shiftX
    : null;

  return {
    scale,
    shiftXPx: Math.round(shiftX),
    shiftYPx: Math.round(shiftY),
    detectedBaselineYPx: input.detectedBaselineYPx,
    targetBaselineYPx: targetBaseline,
    transformedTopYPx: transformedTop == null ? null : Math.round(transformedTop),
    transformedBottomYPx: transformedBottom == null ? null : Math.round(transformedBottom),
    transformedLeftXPx: transformedLeft == null ? null : Math.round(transformedLeft),
    transformedRightXPx: transformedRight == null ? null : Math.round(transformedRight),
  };
}

/** Resolve direct-call ownership from the exact SKU policy, never the hint alone. */
export function resolveRigShadowOwner(
  options: Pick<
    RigBaselineNormalizeOptions,
    "graceSku" | "websiteSku" | "family" | "bottleCollection"
  > & { shadowOwner?: BestBottlesShadowOwner },
): BestBottlesShadowOwner {
  return resolveBestBottlesShadowPolicy({
    graceSku: options.graceSku,
    websiteSku: options.websiteSku,
    family: options.family,
    bottleCollection: options.bottleCollection,
  }).owner;
}

function parseLeadingMm(value: string | number | null | undefined): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  const match = String(value ?? "").match(/[\d.]+/);
  const parsed = match ? Number(match[0]) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function isComplexVintageAssembly(
  input: Pick<RigBaselineNormalizeOptions, "applicator" | "itemName" | "itemDescription">,
): boolean {
  return /\b(?:tassel|antique\s+bulb|vintage\s+bulb)\b/i.test(
    [input.applicator, input.itemName, input.itemDescription]
      .filter((value): value is string => typeof value === "string")
      .join(" "),
  );
}

/**
 * Isolate the tall bottle column inside a connected vintage bulb/tassel
 * assembly. The accessory may be connected by a hose, so connected-component
 * bounds are not useful; sustained baseline-reaching vertical columns are.
 */
export function detectComplexAssemblyBottleBounds(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
  bg: Rgb,
  detectedBaselineYPx: number,
): RigStrongBounds | null {
  const baseline = Math.max(1, Math.min(height - 1, Math.round(detectedBaselineYPx)));
  const threshold = 32;
  const minColumnPixels = Math.max(6, Math.round(height * 0.008));
  const columns: Array<{ top: number; bottom: number; count: number } | null> =
    new Array(width).fill(null);
  let maxSpan = 0;

  for (let x = 0; x < width; x += 1) {
    let top = baseline;
    let bottom = -1;
    let count = 0;
    for (let y = 0; y <= baseline; y += 1) {
      const i = (y * width + x) * 4;
      const delta = Math.max(
        Math.abs(pixels[i] - bg.r),
        Math.abs(pixels[i + 1] - bg.g),
        Math.abs(pixels[i + 2] - bg.b),
      );
      if (delta <= threshold) continue;
      top = Math.min(top, y);
      bottom = y;
      count += 1;
    }
    if (count < minColumnPixels || bottom < 0) continue;
    const span = bottom - top + 1;
    columns[x] = { top, bottom, count };
    maxSpan = Math.max(maxSpan, span);
  }

  if (maxSpan < height * 0.25) return null;
  const minSpan = maxSpan * 0.68;
  const baselineTolerance = Math.max(6, Math.round(height * 0.05));
  const bridgeGap = Math.max(8, Math.round(width * 0.08));
  const runs: Array<{ left: number; right: number }> = [];
  let runStart: number | null = null;
  let gap = 0;

  for (let x = 0; x < width; x += 1) {
    const column = columns[x];
    const qualifies = Boolean(
      column
      && column.bottom >= baseline - baselineTolerance
      && column.bottom - column.top + 1 >= minSpan,
    );
    if (qualifies) {
      if (runStart === null) runStart = x;
      gap = 0;
    } else if (runStart !== null) {
      gap += 1;
      if (gap > bridgeGap) {
        runs.push({ left: runStart, right: x - gap });
        runStart = null;
        gap = 0;
      }
    }
  }
  if (runStart !== null) runs.push({ left: runStart, right: width - 1 - gap });

  let best: RigStrongBounds | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const run of runs) {
    const columnTops: number[] = [];
    let bottom = -1;
    for (let x = run.left; x <= run.right; x += 1) {
      const column = columns[x];
      if (!column) continue;
      if (
        column.bottom >= baseline - baselineTolerance
        && column.bottom - column.top + 1 >= minSpan
      ) {
        columnTops.push(column.top);
      }
      bottom = Math.max(bottom, column.bottom);
    }
    columnTops.sort((a, b) => a - b);
    const top = columnTops.length > 0
      ? columnTops[Math.floor(columnTops.length * 0.1)]
      : baseline;
    const runWidth = run.right - run.left + 1;
    const runHeight = bottom - top + 1;
    if (
      bottom < 0
      || runHeight < height * 0.25
      || runWidth < Math.max(8, width * 0.04)
      || runWidth > width * 0.45
    ) {
      continue;
    }
    // Height is authoritative; rightward position breaks close ties because
    // approved bulb/tassel masters reserve camera-left for accessories.
    const score = runHeight * 10 + runWidth + run.right / width;
    if (score > bestScore) {
      bestScore = score;
      best = { top, bottom, left: run.left, right: run.right };
    }
  }
  return best;
}

/**
 * Derive exact glass foot-to-rim bounds from a measured vessel envelope by
 * scaling vessel height with heightWithoutCap / heightWithCap. Never returns
 * the full assembly envelope as glass — only a foot-anchored glass sub-band.
 */
export function deriveGlassBodyControlBounds(input: {
  vesselBounds: RigStrongBounds | null | undefined;
  detectedBaselineYPx: number;
  heightWithoutCap?: string | number | null;
  heightWithCap?: string | number | null;
}): RigStrongBounds | null {
  const vessel = input.vesselBounds;
  if (
    !vessel ||
    typeof vessel.left !== "number" ||
    typeof vessel.right !== "number" ||
    !(vessel.right > vessel.left)
  ) {
    return null;
  }
  const glassMm = parseLeadingMm(input.heightWithoutCap);
  const assembledMm = parseLeadingMm(input.heightWithCap);
  if (glassMm == null || assembledMm == null || !(assembledMm > 0)) {
    return null;
  }
  const foot = Math.max(vessel.bottom, Math.round(input.detectedBaselineYPx));
  const vesselHeightPx = foot - vessel.top;
  if (!(vesselHeightPx > 0)) return null;
  const glassRatio = Math.min(1, glassMm / assembledMm);
  if (!(glassRatio > 0)) return null;
  const glassHeightPx = Math.max(1, Math.round(vesselHeightPx * glassRatio));
  return {
    top: foot - glassHeightPx,
    bottom: foot,
    left: vessel.left,
    right: vessel.right,
  };
}

function resolveBodyControlBoundsForTransform(input: {
  provided?: RigStrongBounds | null;
  calibration?: RigScaleCalibration | null;
  primaryBounds?: RigStrongBounds | null;
  strongBounds?: RigStrongBounds | null;
  detectedBaselineYPx: number;
  capState?: RigCapState;
}): RigStrongBounds | null {
  if (isExactBodyControlBounds(input.provided)) {
    return input.provided;
  }
  const vessel =
    input.capState === "detached"
      ? input.primaryBounds ?? input.strongBounds
      : input.strongBounds ?? input.primaryBounds;
  if (!input.calibration) return null;
  return resolveCalibratedGlassBodyBounds({
    calibration: input.calibration,
    vesselBounds: vessel,
    detectedBaselineYPx: input.detectedBaselineYPx,
  });
}

function transformBodyControlBounds(
  bounds: RigStrongBounds | null | undefined,
  scale: number,
  shiftYPx: number,
  width: number,
  hScaleX = 1,
): RigStrongBounds | null {
  if (!isExactBodyControlBounds(bounds)) return null;
  const scaleXAboutCenter = (value: number): number =>
    Math.round((value - width / 2) * hScaleX + width / 2);
  return {
    top: Math.round(bounds.top * scale + shiftYPx),
    bottom: Math.round(bounds.bottom * scale + shiftYPx),
    left:
      typeof bounds.left === "number"
        ? scaleXAboutCenter(bounds.left * scale)
        : undefined,
    right:
      typeof bounds.right === "number"
        ? scaleXAboutCenter(bounds.right * scale)
        : undefined,
  };
}

function buildPhysicalScaleQa(input: {
  options: RigBaselineNormalizeOptions;
  rig: FamilyRigConfig;
  framingQa: FramingQaReport | null;
  canvasWidth: number;
  canvasHeight: number;
}): PhysicalScaleQa {
  const glassHeightPct = input.framingQa?.measurements.glassHeightPct;
  const glassWidthPct = input.framingQa?.measurements.glassWidthPct;
  const assemblyHeightPct = input.framingQa?.measurements.fillHeightPct;
  return evaluateBestBottlesPhysicalScale({
    expectedGlassHeightMm: parseLeadingMm(input.options.heightWithoutCap),
    measuredGlassHeightPx:
      typeof glassHeightPct === "number"
        ? (glassHeightPct / 100) * input.canvasHeight
        : null,
    targetGlassHeightPx: input.rig.targetBodyHeightPx,
    expectedGlassDiameterMm: parseLeadingMm(input.options.diameter),
    measuredGlassWidthPx:
      typeof glassWidthPct === "number"
        ? (glassWidthPct / 100) * input.canvasWidth
        : null,
    expectedAssembledHeightMm: parseLeadingMm(input.options.heightWithCap),
    measuredAssemblyHeightPx:
      typeof assemblyHeightPct === "number"
        ? (assemblyHeightPct / 100) * input.canvasHeight
        : null,
    calibration: input.options.scaleCalibration,
  });
}

function describePhysicalScaleDelta(qa: PhysicalScaleQa): string {
  const deltas = [`height ${qa.deltaMm ?? "unverified"} mm`];
  if (qa.diameterDeltaMm != null) {
    deltas.push(`diameter ${qa.diameterDeltaMm} mm`);
  }
  if (qa.assembledDeltaMm != null) {
    deltas.push(`assembled height ${qa.assembledDeltaMm} mm`);
  }
  return deltas.join(", ");
}

/**
 * Isolate the primary bottle in a frame that may also contain a detached
 * sidecar cap: split foreground columns on horizontal gaps and take the
 * TALLEST connected run (the pilot-proven "tallest component = bottle" rule).
 * Region-window isolation (detectPrimaryBottleBounds) can merge bottle+cap
 * when the sidecar sits close, which poisons aspect-ratio measurement — this
 * detector exists for proportion QA only and never feeds other metrics.
 */
export function detectTallestComponentBounds(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
  bg: Rgb,
  maxBottomYPx?: number | null,
): RigStrongBounds | null {
  const yLimit = Math.min(
    height,
    typeof maxBottomYPx === "number" && Number.isFinite(maxBottomYPx)
      ? Math.max(1, Math.round(maxBottomYPx) + 1)
      : height,
  );
  const threshold = 40;
  // A column only counts as occupied with a real vertical presence, so a few
  // rows of feathered shadow or anti-aliasing cannot bridge bottle and cap.
  const minColumnPixels = Math.max(6, Math.round(height * 0.004));
  const colTop = new Array<number | null>(width).fill(null);
  const colBottom = new Array<number | null>(width).fill(null);
  for (let x = 0; x < width; x += 1) {
    let occupied = 0;
    let top: number | null = null;
    let bottom: number | null = null;
    for (let y = 0; y < yLimit; y += 1) {
      const i = (y * width + x) * 4;
      const delta = Math.max(
        Math.abs(pixels[i] - bg.r),
        Math.abs(pixels[i + 1] - bg.g),
        Math.abs(pixels[i + 2] - bg.b),
      );
      if (delta > threshold) {
        occupied += 1;
        if (top === null) top = y;
        bottom = y;
      }
    }
    if (occupied >= minColumnPixels) {
      colTop[x] = top;
      colBottom[x] = bottom;
    }
  }
  const minGap = Math.max(4, Math.round(width * 0.01));
  const runs: Array<{ left: number; right: number }> = [];
  let runStart: number | null = null;
  let gap = 0;
  for (let x = 0; x < width; x += 1) {
    if (colTop[x] != null) {
      if (runStart === null) runStart = x;
      gap = 0;
    } else if (runStart !== null) {
      gap += 1;
      if (gap >= minGap) {
        runs.push({ left: runStart, right: x - gap });
        runStart = null;
        gap = 0;
      }
    }
  }
  if (runStart !== null) runs.push({ left: runStart, right: width - 1 - gap });

  let best: RigStrongBounds | null = null;
  let bestHeight = 0;
  for (const run of runs) {
    let top = Number.POSITIVE_INFINITY;
    let bottom = -1;
    for (let x = run.left; x <= run.right; x += 1) {
      const t = colTop[x];
      const b = colBottom[x];
      if (t != null && t < top) top = t;
      if (b != null && b > bottom) bottom = b;
    }
    const runHeight = bottom - top + 1;
    if (bottom >= 0 && runHeight > bestHeight) {
      bestHeight = runHeight;
      best = { top, bottom, left: run.left, right: run.right };
    }
  }
  return best;
}

function detectRigShoulderLandmark(input: {
  pixels: ArrayLike<number>;
  width: number;
  height: number;
  bg: Rgb;
  rig: FamilyRigConfig;
  primaryBounds: RigStrongBounds | null;
  detectedBaselineYPx: number;
  capState: RigCapState;
  expectedShoulderYPx?: number;
}): GlassShoulderLandmark | null {
  if (
    typeof input.rig.shoulderTargetPct !== "number" ||
    typeof input.rig.targetShoulderYPx !== "number"
  ) {
    return null;
  }
  const bottleOnlyBounds =
    input.capState === "detached"
      ? detectTallestComponentBounds(
          input.pixels,
          input.width,
          input.height,
          input.bg,
          input.detectedBaselineYPx,
        ) ?? input.primaryBounds
      : input.primaryBounds;
  return detectGlassShoulderLandmark({
    pixels: input.pixels,
    width: input.width,
    height: input.height,
    primaryBounds: bottleOnlyBounds,
    footYPx: input.detectedBaselineYPx,
    expectedShoulderYPx: input.expectedShoulderYPx,
    background: input.bg,
    expectedBodyAspectRatio: input.rig.glassBodyAspect,
  });
}

function shoulderLandmarkToControlBounds(
  landmark: GlassShoulderLandmark | null,
): RigStrongBounds | null {
  if (!landmark) return null;
  return {
    top: landmark.shoulderYPx,
    bottom: landmark.footYPx,
    left: landmark.bodyLeftXPx,
    right: landmark.bodyRightXPx,
  };
}

/**
 * Measure the primary bottle's height/width ratio in a reference image.
 * Gates render proportions against byte-locked truth for lanes where canonical
 * mm cannot describe the pictured state (e.g. cap-off sidecar with fitment).
 * Returns null on any load/detection failure — the caller falls back to
 * canonical mm or skips the aspect gate rather than blocking generation.
 */
/**
 * Deterministic model-owned shadow remediation (Jordan-approved 2026-07-19):
 * the model cannot hold the 0.18–0.32 right-extension band (honest series: 0,
 * 0.345, 0.351, 0.353) and occasionally splits the shadow into stray blobs.
 * Instead of failing otherwise-perfect renders, clip every below-baseline
 * shadow pixel outside each component's keep-zone (left −10% / right +29% of
 * the primary bottle's width, vertical depth ≤3.2% of canvas) with a soft fade,
 * then re-run the shadow analyzer so QA reports the trimmed truth. Product
 * pixels are untouched — the trim operates strictly below the baseline.
 */
export function trimModelOwnedShadowIntoBand(params: {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  bg: Rgb;
  baselineYPx: number;
}): number {
  const { pixels, width, height, bg } = params;
  const baseline = Math.max(0, Math.min(height - 1, Math.round(params.baselineYPx)));
  // Component runs measured ABOVE the baseline so shadow can't join components.
  const threshold = 40;
  const minColumnPixels = Math.max(6, Math.round(height * 0.004));
  const occupied: boolean[] = new Array(width).fill(false);
  for (let x = 0; x < width; x += 1) {
    let count = 0;
    for (let y = 0; y < baseline; y += 1) {
      const i = (y * width + x) * 4;
      const delta = Math.max(
        Math.abs(pixels[i] - bg.r),
        Math.abs(pixels[i + 1] - bg.g),
        Math.abs(pixels[i + 2] - bg.b),
      );
      if (delta > threshold) count += 1;
    }
    occupied[x] = count >= minColumnPixels;
  }
  const minGap = Math.max(4, Math.round(width * 0.01));
  const runs: Array<{ left: number; right: number }> = [];
  let runStart: number | null = null;
  let gap = 0;
  for (let x = 0; x < width; x += 1) {
    if (occupied[x]) {
      if (runStart === null) runStart = x;
      gap = 0;
    } else if (runStart !== null) {
      gap += 1;
      if (gap >= minGap) {
        runs.push({ left: runStart, right: x - gap });
        runStart = null;
        gap = 0;
      }
    }
  }
  if (runStart !== null) runs.push({ left: runStart, right: width - 1 - gap });
  const components = runs.filter((run) => run.right - run.left >= width * 0.02);
  if (components.length === 0) return 0;
  const primaryWidth = Math.max(
    1,
    ...components.map((run) => run.right - run.left + 1),
  );
  const rightAllowancePx = Math.round(primaryWidth * 0.29);
  const leftAllowancePx = Math.round(primaryWidth * 0.10);
  const fadePx = 24;
  const verticalCutY = baseline + Math.round(height * 0.032);
  const keepFactor = (x: number, y: number): number => {
    let horizontal = 0;
    for (const run of components) {
      const left = run.left - leftAllowancePx;
      const right = run.right + rightAllowancePx;
      let k = 0;
      if (x >= left && x <= right - fadePx) k = 1;
      else if (x > right - fadePx && x <= right) k = (right - x) / fadePx;
      else if (x < left && x >= left - fadePx) k = (x - (left - fadePx)) / fadePx;
      if (k > horizontal) horizontal = k;
    }
    let vertical = 1;
    if (y > verticalCutY) vertical = 0;
    else if (y > verticalCutY - fadePx) vertical = (verticalCutY - y) / fadePx;
    return horizontal * vertical;
  };
  let changed = 0;
  for (let y = baseline + 1; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const k = keepFactor(x, y);
      if (k >= 1) continue;
      const i = (y * width + x) * 4;
      const nr = Math.round(bg.r + (pixels[i] - bg.r) * k);
      const ng = Math.round(bg.g + (pixels[i + 1] - bg.g) * k);
      const nb = Math.round(bg.b + (pixels[i + 2] - bg.b) * k);
      if (nr !== pixels[i] || ng !== pixels[i + 1] || nb !== pixels[i + 2]) changed += 1;
      pixels[i] = nr;
      pixels[i + 1] = ng;
      pixels[i + 2] = nb;
      pixels[i + 3] = 255;
    }
  }
  return changed;
}

const TRIMMABLE_SHADOW_FAILURE =
  /exceeds 0\.32|Multiple connected shadow components|vertical depth|left extension exceeds/i;

export function isModelShadowFailureTrimmable(
  failures: readonly string[] | null | undefined,
): boolean {
  return Boolean(
    failures &&
    failures.length > 0 &&
    failures.every((failure) => TRIMMABLE_SHADOW_FAILURE.test(failure)),
  );
}

/** Tallest silver-proof component as RigStrongBounds (null when none found). */
export function tallestSilverProofBounds(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  bg: Rgb,
  maxBottomYPx?: number | null,
): RigStrongBounds | null {
  const components = detectSilverProofComponents(pixels, width, height, bg, maxBottomYPx);
  let best: RigStrongBounds | null = null;
  let bestHeight = 0;
  for (const c of components) {
    const h = c.bottom - c.top + 1;
    if (h > bestHeight) {
      bestHeight = h;
      best = { top: c.top, bottom: c.bottom, left: c.left, right: c.right };
    }
  }
  return best;
}

/**
 * Whole-vessel bounds for transparent glass — the clear-glass sliver fix
 * (2026-07-29, Jordan directive: read bare glass as the vessel it is, not as
 * thin slivers).
 *
 * Failure mode this corrects: `detectSilverProofComponents` requires a column
 * to hold foreground in ≥5% of image height before it counts as occupied. A
 * clear glass bottle photographed for e-commerce reads almost entirely as
 * background through its interior — only the refractive side walls, neck
 * finish, and base band carry strong signal — so the interior columns
 * evaporate and the bottle splits into two tall wall slivers. The component
 * merge rule caps the bridgeable gap at 2× a fragment's width; wall slivers
 * are ~30–80 px wide while the interior spans hundreds, so the walls never
 * rejoin, the tallest sliver is reported as "the bottle", and aspect QA reads
 * 6:1 on a 3.7:1 vessel (measured on the 50 mL reducer cohort: observed 6.12
 * – 6.66 recorded against physical 3.5 – 4.0).
 *
 * The correction is optical, not heuristic: the two walls of one transparent
 * vessel share the same vertical extent by construction, because they are the
 * same object. Distinct objects in this domain (bottle vs detached sidecar
 * cap) differ strongly in height — the governed cap classes run 21–31% of
 * bottle height — so vertical-extent alignment is a safe sibling key. When
 * extent-aligned fragments exist, we additionally demand weak interior glass
 * evidence (refraction shading / meniscus / base band at a low threshold)
 * across the gap before uniting them, so two genuinely separate aligned
 * objects can never fuse.
 */
export function resolveWholeVesselBounds(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  bg: Rgb,
  maxBottomYPx?: number | null,
): RigStrongBounds | null {
  const components = detectSilverProofComponents(pixels, width, height, bg, maxBottomYPx);
  if (components.length === 0) {
    return (
      detectTallestComponentBounds(pixels, width, height, bg, maxBottomYPx) ??
      detectStrongBounds(pixels, width, height, bg)
    );
  }
  let tallest = components[0];
  for (const c of components) {
    if (c.bottom - c.top > tallest.bottom - tallest.top) tallest = c;
  }
  const tallestHeight = tallest.bottom - tallest.top + 1;
  // Sibling fragments of one vessel share a BASE, not a top. On a capped
  // clear bottle the frame splits into wall-sliver / center-column / wall-
  // sliver, and the center column carries the closure above the shoulder.
  // A 50 ml roll-on pushes that further: the roller column is the tallest
  // fragment and the glass walls read about 0.69 of its height. Detached
  // sidecar caps in the governed set stay at 21–31% of bottle height, so
  // 0.65 reunites those walls without pulling the cap into the vessel.
  const aligned = components.filter((c) => {
    const h = c.bottom - c.top + 1;
    return (
      Math.abs(c.bottom - tallest.bottom) <= height * 0.04 &&
      Math.min(h, tallestHeight) / Math.max(h, tallestHeight) >= 0.65
    );
  });
  if (aligned.length <= 1) {
    return { top: tallest.top, bottom: tallest.bottom, left: tallest.left, right: tallest.right };
  }
  aligned.sort((a, b) => a.left - b.left);
  // Unite fragments pairwise left→right, but only across gaps that carry
  // interior glass evidence: a low-threshold scan (delta > 12 against the
  // studio background) with the same lenient per-column occupancy the
  // non-silver-proof detector uses (0.4% of frame height). Clear glass
  // interiors always carry this much signal — refraction gradients at the
  // shoulder, the base thickness band, roller/dip-tube hardware — while true
  // background between separate objects carries none.
  const interiorDeltaThreshold = 12;
  const minInteriorRows = Math.max(4, Math.round(height * 0.004));
  const columnHasInteriorEvidence = (x: number, top: number, bottom: number): boolean => {
    let rows = 0;
    for (let y = top; y <= bottom; y += 1) {
      const i = (y * width + x) * 4;
      const delta = Math.max(
        Math.abs(pixels[i] - bg.r),
        Math.abs(pixels[i + 1] - bg.g),
        Math.abs(pixels[i + 2] - bg.b),
      );
      if (delta > interiorDeltaThreshold) {
        rows += 1;
        if (rows >= minInteriorRows) return true;
      }
    }
    return false;
  };
  let union: RigStrongBounds = {
    top: aligned[0].top,
    bottom: aligned[0].bottom,
    left: aligned[0].left,
    right: aligned[0].right,
  };
  for (let i = 1; i < aligned.length; i += 1) {
    const next = aligned[i];
    const gapLeft = union.right + 1;
    const gapRight = next.left - 1;
    let evidenceColumns = 0;
    let gapColumns = 0;
    for (let x = gapLeft; x <= gapRight; x += 1) {
      gapColumns += 1;
      if (columnHasInteriorEvidence(x, Math.min(union.top, next.top), Math.max(union.bottom, next.bottom))) {
        evidenceColumns += 1;
      }
    }
    // ≥30% of the gap columns must show glass — enough that shading noise
    // cannot fuse separate objects, low enough that pristine clear bodies
    // (whose evidence concentrates at shoulder and base) still qualify.
    const connected = gapColumns === 0 || evidenceColumns / gapColumns >= 0.3;
    if (connected) {
      union = {
        top: Math.min(union.top, next.top),
        bottom: Math.max(union.bottom, next.bottom),
        left: union.left,
        right: next.right,
      };
    } else if (
      next.bottom - next.top > union.bottom - union.top
    ) {
      // Disconnected sibling that is itself taller: restart the union there.
      union = { top: next.top, bottom: next.bottom, left: next.left, right: next.right };
    }
  }
  return union;
}

export async function measureReferencePrimaryAspectRatio(
  url: string,
): Promise<number | null> {
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const { width, height } = canvas;
    if (width < 8 || height < 8) return null;
    const pixels = ctx.getImageData(0, 0, width, height).data;
    // References carry their own studio background (white/near-white), not the
    // Bone output canvas — sample the corner instead of assuming a hex.
    const bgSample: Rgb = { r: pixels[0], g: pixels[1], b: pixels[2] };
    // Tallest-component isolation: sidecar references contain bottle AND
    // detached cap; window-based primary detection can merge them and report
    // a bottle+cap group ratio instead of the bottle's own proportions.
    // Silver-proof detection first: the threshold-40 detector reads bare
    // clear-glass bottles as one thin side-wall sliver (measured 7.34:1 truth
    // on a ~3.1:1 bottle, 2026-07-20) — transparent interiors need the low
    // threshold + extent-merge treatment to stay whole.
    const bounds = resolveWholeVesselBounds(pixels, width, height, bgSample);
    if (
      !bounds ||
      typeof bounds.left !== "number" ||
      typeof bounds.right !== "number" ||
      bounds.right <= bounds.left ||
      bounds.bottom <= bounds.top
    ) {
      return null;
    }
    const ratio =
      (bounds.bottom - bounds.top + 1) / (bounds.right - bounds.left + 1);
    return Number.isFinite(ratio) && ratio > 0 ? ratio : null;
  } catch {
    return null;
  }
}

export interface ReferenceSidecarCapMetrics {
  /** Detached cap height ÷ its own width. */
  capAspectRatio: number;
  /** Detached cap height as a percentage of the primary bottle's height. */
  capHeightPctOfBottle: number;
}

export interface DetachedCapGeometryQa {
  policy: "reference-measured-detached-cap-geometry-v1";
  status: "pass" | "fail";
  enforcement: "strict" | "advisory";
  expected: ReferenceSidecarCapMetrics;
  observed: ReferenceSidecarCapMetrics | null;
  capAspectRatioDriftPct: number | null;
  capHeightPctOfBottleDelta: number | null;
  maxAbsCapAspectRatioDriftPct: number;
  maxAbsCapHeightPctOfBottleDelta: number;
  failures: string[];
  blockingFailures: string[];
}

export interface DetachedCapGeometryQaInput {
  expected: ReferenceSidecarCapMetrics;
  observed: ReferenceSidecarCapMetrics | null;
  enforcement?: "strict" | "advisory";
  maxAbsCapAspectRatioDriftPct?: number;
  maxAbsCapHeightPctOfBottleDelta?: number;
}

export function resolveDetachedCapGeometryEnforcement(
  input: Pick<RigBaselineNormalizeOptions, "family" | "capState" | "applicator">,
): "strict" | "advisory" {
  const family = String(input.family ?? "").trim().toLowerCase();
  const capState = String(input.capState ?? "").trim().toLowerCase();
  const applicator = String(input.applicator ?? "").trim().toLowerCase();
  const isCylinder = family === "cylinder" || family.startsWith("cylinder ");
  const isDetached = capState === "detached";
  const isFineMist = /\bfine[\s-]*mist\b|\bsprayer\b/.test(applicator);
  return isCylinder && isDetached && isFineMist ? "advisory" : "strict";
}

/**
 * Measure the bottle and detached right-sidecar cap with the same component
 * detector for source truth and generated output. No pixels are changed.
 */
export function measureDetachedSidecarCapMetricsFromPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  bg: Rgb,
  maxBottomYPx?: number | null,
): ReferenceSidecarCapMetrics | null {
  const components = detectSilverProofComponents(
    pixels,
    width,
    height,
    bg,
    maxBottomYPx,
  );
  if (!Array.isArray(components) || components.length < 2) return null;
  // Whole-vessel bottle bounds (clear-glass sliver fix, 2026-07-29): on bare
  // clear glass the component list holds the bottle's two wall slivers plus
  // the cap. Taking sized[0] as "the bottle" made the bottle's own right wall
  // pass the `left > bottle.right` cap filter and masquerade as a ~97%-height
  // cap, failing good renders. The vessel resolver reunites the walls first,
  // so "right of the bottle" means right of the whole vessel.
  const vessel = resolveWholeVesselBounds(pixels, width, height, bg, maxBottomYPx);
  if (!vessel) return null;
  const bottle = {
    ...vessel,
    w: vessel.right - vessel.left + 1,
    h: vessel.bottom - vessel.top + 1,
  };
  if (bottle.w <= 0 || bottle.h <= 0) return null;
  // Detached PDP topology is bottle-left / cap-right. Requiring that spatial
  // relationship prevents a split bottle highlight from masquerading as cap.
  const cap = components
    .map((component) => ({
      ...component,
      w: component.right - component.left + 1,
      h: component.bottom - component.top + 1,
    }))
    .filter((component) => component.w > 0 && component.h > 0)
    .filter((component) => component.left > bottle.right)
    .sort((a, b) => b.h - a.h)[0];
  if (!cap) return null;

  const capAspectRatio = cap.h / cap.w;
  const capHeightPctOfBottle = (cap.h / bottle.h) * 100;
  if (!Number.isFinite(capAspectRatio) || !Number.isFinite(capHeightPctOfBottle)) return null;
  if (capAspectRatio <= 0 || capHeightPctOfBottle <= 0 || capHeightPctOfBottle >= 100) return null;
  return { capAspectRatio, capHeightPctOfBottle };
}

/**
 * Geometry-only acceptance gate. The model owns appearance; this report only
 * rejects caps whose measured proportions drift from the byte-locked source.
 */
export function evaluateDetachedCapGeometryQa(
  input: DetachedCapGeometryQaInput,
): DetachedCapGeometryQa {
  const maxAspectDrift = input.maxAbsCapAspectRatioDriftPct ?? 8;
  const maxHeightDelta = input.maxAbsCapHeightPctOfBottleDelta ?? 3;
  const failures: string[] = [];
  const observed = input.observed;
  const enforcement = input.enforcement ?? "strict";
  const aspectDrift = observed
    ? ((observed.capAspectRatio - input.expected.capAspectRatio) /
      input.expected.capAspectRatio) * 100
    : null;
  const heightDelta = observed
    ? observed.capHeightPctOfBottle - input.expected.capHeightPctOfBottle
    : null;

  if (!observed) {
    failures.push("Detached cap geometry could not be measured from the generated output.");
  } else {
    if (aspectDrift == null || Math.abs(aspectDrift) > maxAspectDrift) {
      failures.push(
        `Detached cap aspect ratio drift ${aspectDrift?.toFixed(1) ?? "unknown"}% exceeds the allowed ±${maxAspectDrift}% from reference.`,
      );
    }
    if (heightDelta == null || Math.abs(heightDelta) > maxHeightDelta) {
      failures.push(
        `Detached cap height relative to bottle differs by ${heightDelta?.toFixed(1) ?? "unknown"} percentage points; allowed ±${maxHeightDelta}.`,
      );
    }
  }

  return {
    policy: "reference-measured-detached-cap-geometry-v1",
    status: failures.length === 0 ? "pass" : "fail",
    enforcement,
    expected: input.expected,
    observed,
    capAspectRatioDriftPct: aspectDrift,
    capHeightPctOfBottleDelta: heightDelta,
    maxAbsCapAspectRatioDriftPct: maxAspectDrift,
    maxAbsCapHeightPctOfBottleDelta: maxHeightDelta,
    failures,
    blockingFailures: enforcement === "strict" ? failures : [],
  };
}

function buildDetachedCapGeometryQa(
  expected: ReferenceSidecarCapMetrics | null | undefined,
  enforcement: "strict" | "advisory",
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  bg: Rgb,
  maxBottomYPx?: number | null,
): DetachedCapGeometryQa | null {
  if (!expected) return null;
  return evaluateDetachedCapGeometryQa({
    expected,
    enforcement,
    observed: measureDetachedSidecarCapMetricsFromPixels(
      pixels,
      width,
      height,
      bg,
      maxBottomYPx,
    ),
  });
}

/**
 * Measure the DETACHED cap in a cap-off sidecar reference.
 *
 * The bottle already gets a measured proportion lock; the cap had none, and
 * the model fills that vacuum with its own prior. On the tall 13-415 roll-on
 * the real cap is only ~21% of the bottle's height (vs ~31% on the standard
 * 9 ml), so the model stretched it back toward "normal" and extrapolated the
 * dot pattern over the extra length — an extra row of dots (Jordan, 2026-07-20).
 * Stating the measured cap proportions closes that gap in the prompt rather
 * than in post-processing.
 */
export async function measureReferenceSidecarCapMetrics(
  url: string,
): Promise<ReferenceSidecarCapMetrics | null> {
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const { width, height } = canvas;
    if (width < 8 || height < 8) return null;
    const pixels = ctx.getImageData(0, 0, width, height).data;
    const bgSample: Rgb = { r: pixels[0], g: pixels[1], b: pixels[2] };
    return measureDetachedSidecarCapMetricsFromPixels(
      pixels,
      width,
      height,
      bgSample,
    );
  } catch {
    return null;
  }
}

export async function normalizeBestBottlesRigBaseline(
  imageUrl: string,
  options: RigBaselineNormalizeOptions,
): Promise<RigBaselineNormalizeResult> {
  const shadowOwner = resolveRigShadowOwner(options);
  let rig = getFamilyRigForProduct(options);
  const bg = hexToRgb(options.targetBackgroundHex ?? "#F5F3EF");
  if (!rig || !bg) {
    const img = await loadImage(imageUrl);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Unable to acquire 2d canvas context");
    ctx.drawImage(img, 0, 0);
    return {
      dataUrl: canvas.toDataURL("image/png"),
      shifted: false,
      shiftXPx: 0,
      shiftYPx: 0,
      scale: 1,
      preTransformBaselineYPx: null,
      detectedBaselineYPx: null,
      targetBaselineYPx: null,
      preTransformShoulderYPx: null,
      detectedShoulderYPx: null,
      targetShoulderYPx: null,
      shoulderDeltaPct: null,
      shoulderConfidence: null,
      maskControlled: false,
      qaIssues: [],
      framingQa: null,
      framingDecision: null,
      preTransformObjectBounds: null,
      transformControlBounds: null,
      objectBounds: null,
      shadowOwner,
      shadowQa: null,
      detachedCapGeometryQa: null,
      physicalScaleQa: evaluateBestBottlesPhysicalScale({
        expectedGlassHeightMm: parseLeadingMm(options.heightWithoutCap),
        measuredGlassHeightPx: null,
        targetGlassHeightPx: null,
        calibration: options.scaleCalibration,
      }),
      scaleCalibration: options.scaleCalibration ?? null,
    };
  }

  const img = await loadImage(imageUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Unable to acquire 2d canvas context");
  ctx.drawImage(img, 0, 0);

  const { width, height } = canvas;
  if (typeof rig.glassHeightPct === "number") {
    rig = {
      ...rig,
      targetBodyHeightPx: Math.round((rig.glassHeightPct / 100) * height),
      ...(isComplexVintageAssembly(options)
        ? { primaryObjectCenterXPct: 65, fillWidthPct: 94 }
        : {}),
    };
  }
  // Preserve the model-rendered pixels for output. The generated canvas is already
  // the desired studio scene; flattening/matting it here created visible rectangular
  // washes and surface noise. A flattened clone is used only to measure geometry.
  const imageData = ctx.getImageData(0, 0, width, height);
  const analysisImageData = new ImageData(
    new Uint8ClampedArray(imageData.data),
    width,
    height,
  );
  const { background: analysisBg } = prepareRigAnalysisPixels(
    analysisImageData.data,
    width,
    height,
    bg,
  );
  const capState = resolveCapState(options);
  const detachedCapGeometryEnforcement =
    resolveDetachedCapGeometryEnforcement(options);
  // Proportion truth for the aspect gate — CANON-POLICED REFERENCE
  // (Jordan rulings, 2026-07-29).
  //
  // Detached (cap-off sidecar) frames picture the bottle WITH its fitment
  // attached, and canon carries no fitment height: grading against the bare
  // canon body aspect fails good renders by exactly the fitment tower
  // (measured medians: sprayers +41.5%, lotion pumps +42.4%, rollers ~+15%,
  // reducers +3.4%). So for detached lanes the expectation comes from the
  // byte-locked reference measured with the whole-vessel detector — the true
  // pictured state — and CANON POLICES THE REFERENCE instead of being the
  // numerator: the caller (generate-family-batch / Studio hook) condemns any
  // reference whose vessel reads slimmer than the canon body allows or
  // implies an impossible fitment, and blocks generation rather than letting
  // a weak reference move the goalpost (see
  // getBestBottlesCanonReferenceAspectIssue).
  //
  // Assembled frames keep the pure canonical-mm expectation: heightWithCap /
  // diameter fully describes the pictured state there.
  const canonHeightWithCapMm = parseLeadingMm(options.heightWithCap);
  const canonDiameterMm = parseLeadingMm(options.diameter);
  const callerPrimaryAspectRatio =
    typeof options.expectedPrimaryAspectRatio === "number" &&
    Number.isFinite(options.expectedPrimaryAspectRatio) &&
    options.expectedPrimaryAspectRatio > 0
      ? options.expectedPrimaryAspectRatio
      : null;
  const canonAssembledAspectRatio =
    canonHeightWithCapMm != null && canonDiameterMm != null && canonDiameterMm > 0
      ? canonHeightWithCapMm / canonDiameterMm
      : null;
  const expectedPrimaryAspectRatio = capState === "detached"
    ? callerPrimaryAspectRatio
    : canonAssembledAspectRatio ?? callerPrimaryAspectRatio;
  let maskImageData: ImageData | null = null;
  let maskBounds: RigAlphaControlBounds | null = null;
  const maskReferenceUrl = options.maskReferenceUrl?.trim();

  if (maskReferenceUrl) {
    try {
      const maskImg = await loadImage(maskReferenceUrl);
      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = width;
      maskCanvas.height = height;
      const maskCtx = maskCanvas.getContext("2d");
      if (!maskCtx) throw new Error("Unable to acquire mask control canvas context");
      maskCtx.drawImage(maskImg, 0, 0, width, height);
      maskImageData = maskCtx.getImageData(0, 0, width, height);
      maskBounds = detectAlphaControlBounds({
        data: maskImageData.data,
        width,
        height,
      });
    } catch (error) {
      if (options.requireMaskControl) {
        throw new Error(
          `Mask/control reference could not drive recanvas: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  } else if (options.requireMaskControl) {
    throw new Error("Mask/control reference is required for deterministic recanvas.");
  }

  if (options.requireMaskControl && (!maskImageData || !maskBounds)) {
    throw new Error("Mask/control reference did not contain usable transparent foreground bounds.");
  }

  if (maskImageData && maskBounds) {
    const detectedBaseline = maskBounds.bottom;
    const modelContactBounds = options.shadowTopology
      ? detectModelShadowContactBounds({
          pixels: imageData.data,
          width,
          height,
          background: analysisBg,
          groupBounds: maskBounds,
          baselineYPx: detectedBaseline,
          topology: options.shadowTopology,
        })
      : undefined;
    const modelShadowAnalysis = shadowOwner === "model"
      ? analyzeModelOwnedShadow({
          pixels: imageData.data,
          width,
          height,
          background: analysisBg,
          objectBounds: maskBounds,
          baselineYPx: detectedBaseline,
          topology: options.shadowTopology,
          contactBounds: modelContactBounds,
        })
      : null;
    const geometryAnalysisPixels = modelShadowAnalysis
      ? new Uint8ClampedArray(analysisImageData.data)
      : analysisImageData.data;
    if (modelShadowAnalysis) {
      maskOutModelShadowGeometry(
        geometryAnalysisPixels,
        modelShadowAnalysis.candidateMask,
        analysisBg,
      );
      clampModelShadowGeometryToControlEnvelope(
        geometryAnalysisPixels,
        width,
        height,
        analysisBg,
        maskBounds,
        detectedBaseline,
      );
    }
    const generatedBounds = detectStrongBounds(geometryAnalysisPixels, width, height, analysisBg);
    const complexPrimaryBounds = isComplexVintageAssembly(options)
      ? detectComplexAssemblyBottleBounds(
          geometryAnalysisPixels,
          width,
          height,
          analysisBg,
          detectedBaseline,
        )
      : null;
    const primaryBounds = complexPrimaryBounds ?? (
      capState === "detached"
        ? detectPrimaryBottleBounds(
          geometryAnalysisPixels,
          width,
          height,
          analysisBg,
          detectedBaseline,
        )
        : generatedBounds
    );
    const qaIssues = [
      ...getMaskControlledBoundsQaIssues({
        generatedBounds,
        controlBounds: maskBounds,
      }),
      ...getMaskControlledVisualContinuityQaIssues({
        pixels: geometryAnalysisPixels,
        width,
        height,
        bg: analysisBg,
        controlBounds: maskBounds,
      }),
      ...(capState === "detached" && !primaryBounds
        ? ["Primary bottle bounds were unresolved for detached topology."]
        : []),
    ];
    const sourceImageData = modelShadowAnalysis
      ? new Uint8ClampedArray(imageData.data)
      : null;
    const hasShoulderLock =
      typeof rig.shoulderTargetPct === "number" &&
      typeof rig.targetShoulderYPx === "number";
    const preTransformShoulder = detectRigShoulderLandmark({
      pixels: geometryAnalysisPixels,
      width,
      height,
      bg: analysisBg,
      rig,
      primaryBounds,
      detectedBaselineYPx: detectedBaseline,
      capState,
    });
    const resolvedBodyControlBounds = hasShoulderLock
      ? shoulderLandmarkToControlBounds(preTransformShoulder)
      : resolveBodyControlBoundsForTransform({
          provided: options.bodyControlBounds,
          calibration: options.scaleCalibration,
          primaryBounds,
          strongBounds: complexPrimaryBounds ?? maskBounds,
          detectedBaselineYPx: detectedBaseline,
          capState,
        });
    let transformRig = rig;
    if (
      typeof rig.targetBodyHeightPx === "number" &&
      rig.targetBodyHeightPx > 0 &&
      !isExactBodyControlBounds(resolvedBodyControlBounds)
    ) {
      qaIssues.push(
        hasShoulderLock
          ? "Cylinder glass shoulder landmark was not detectable before normalization; refusing shoulder-lock sizing."
          : "Exact glass body-control bounds could not be derived; refusing scale-card body sizing and keeping provider/legacy scale.",
      );
      transformRig = { ...rig, targetBodyHeightPx: undefined };
    }
    const transform = computeRigFrameTransform({
      width,
      height,
      rig: transformRig,
      detectedBaselineYPx: detectedBaseline,
      strongBounds: maskBounds,
      primaryBounds,
      bodyControlBounds: resolvedBodyControlBounds,
      capState,
      preserveGeneratedScale: options.preserveGeneratedScale,
    });

    applyMaskControlledForegroundMatte(
      imageData.data,
      width,
      height,
      bg,
      { data: maskImageData.data, width, height },
      // finalizeRigShadow is the sole shadow authority for both owners.
      { controlBounds: maskBounds, paintShadow: false },
    );
    if (modelShadowAnalysis && sourceImageData) {
      for (let p = 0; p < modelShadowAnalysis.preservationMask.length; p += 1) {
        if (modelShadowAnalysis.preservationMask[p] !== 1) continue;
        const i = p * 4;
        imageData.data[i] = sourceImageData[i];
        imageData.data[i + 1] = sourceImageData[i + 1];
        imageData.data[i + 2] = sourceImageData[i + 2];
        imageData.data[i + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);

    const out = document.createElement("canvas");
    out.width = width;
    out.height = height;
    const outCtx = out.getContext("2d");
    if (!outCtx) throw new Error("Unable to acquire 2d canvas context");
    const scaledWidth = Math.round(width * transform.scale);
    const scaledHeight = Math.round(height * transform.scale);
    const drawX = Math.round((width - scaledWidth) / 2 + transform.shiftXPx);
    // Same bounded translate-only second seat pass as the unmasked branch:
    // post-composite re-detection can drift a few pixels off the affine target,
    // and that residual is a pure translation the rig can correct itself.
    // Aspect correction mirrors the unmasked branch: bounded horizontal
    // resample toward measured truth when the bottle ratio fails tolerance.
    let appliedShiftYPx = transform.shiftYPx;
    let appliedHScaleX = 1;
    let finalImageData!: ImageData;
    let transformedControlBounds: { top: number; bottom: number; left: number; right: number } | null = null;
    let finalBounds: RigStrongBounds | null = null;
    let finalPrimaryBounds: RigStrongBounds | null = null;
    let finalBaseline: number | null = null;
    let finalMeasuredGlassBounds: RigStrongBounds | null = null;
    let finalShoulderLandmark: GlassShoulderLandmark | null = null;
    let framingQa!: ReturnType<typeof buildFramingQaReport>;
    for (let seatPass = 1; seatPass <= 2; seatPass += 1) {
      const seatShiftDeltaYPx = appliedShiftYPx - transform.shiftYPx;
      const scaleXAboutCenter = (value: number): number =>
        Math.round((value - width / 2) * appliedHScaleX + width / 2);
      const passDrawWidth = Math.round(scaledWidth * appliedHScaleX);
      const passDrawX = Math.round((width - passDrawWidth) / 2 + transform.shiftXPx * appliedHScaleX);
      outCtx.fillStyle = options.targetBackgroundHex ?? "#F5F3EF";
      outCtx.fillRect(0, 0, width, height);
      outCtx.drawImage(canvas, passDrawX, appliedShiftYPx, passDrawWidth, scaledHeight);
      finalImageData = outCtx.getImageData(0, 0, width, height);
      transformedControlBounds =
        transform.transformedTopYPx != null &&
        transform.transformedBottomYPx != null &&
        transform.transformedLeftXPx != null &&
        transform.transformedRightXPx != null
          ? {
              top: transform.transformedTopYPx + seatShiftDeltaYPx,
              bottom: transform.transformedBottomYPx + seatShiftDeltaYPx,
              left: scaleXAboutCenter(transform.transformedLeftXPx),
              right: scaleXAboutCenter(transform.transformedRightXPx),
            }
          : null;
      finalBounds =
        detectControlledRigBounds(
          finalImageData.data,
          width,
          height,
          bg,
          transformedControlBounds,
        ) ?? detectStrongBounds(finalImageData.data, width, height, bg);
      finalBaseline = detectStrongBottomY(
        finalImageData.data,
        width,
        height,
        bg,
        capState,
        shadowOwner === "model" ? transformedControlBounds?.bottom : null,
      );
      finalPrimaryBounds = isComplexVintageAssembly(options) && finalBaseline != null
        ? detectComplexAssemblyBottleBounds(
            finalImageData.data,
            width,
            height,
            bg,
            finalBaseline,
          ) ?? finalBounds
        : capState === "detached"
          ? detectPrimaryBottleBounds(finalImageData.data, width, height, bg)
          : finalBounds;
      finalShoulderLandmark =
        finalBaseline != null
          ? detectRigShoulderLandmark({
              pixels: finalImageData.data,
              width,
              height,
              bg,
              rig,
              primaryBounds: finalPrimaryBounds,
              detectedBaselineYPx: finalBaseline,
              capState,
              expectedShoulderYPx: rig.targetShoulderYPx,
            })
          : null;
      finalMeasuredGlassBounds =
        hasShoulderLock
          ? shoulderLandmarkToControlBounds(finalShoulderLandmark)
          : options.scaleCalibration && finalBaseline != null
          ? resolveCalibratedGlassBodyBounds({
              calibration: options.scaleCalibration,
              vesselBounds: finalPrimaryBounds,
              detectedBaselineYPx: finalBaseline,
            })
          : transformBodyControlBounds(
              resolvedBodyControlBounds,
              transform.scale,
              appliedShiftYPx,
              width,
              appliedHScaleX,
            );
      const finalAspectBounds = capState === "detached"
        ? resolveWholeVesselBounds(
            finalImageData.data,
            width,
            height,
            bg,
            finalBaseline,
          )
        : finalPrimaryBounds;
      const finalGlassWidthBounds = detectGlassBodyWidthBounds(
        finalImageData.data,
        width,
        height,
        bg,
        finalMeasuredGlassBounds
          ? {
              ...finalMeasuredGlassBounds,
              left: finalAspectBounds?.left ?? finalMeasuredGlassBounds.left,
              right: finalAspectBounds?.right ?? finalMeasuredGlassBounds.right,
            }
          : finalAspectBounds,
      );
      framingQa = buildFramingQaReport({
        width,
        height,
        rig,
        bounds: finalPrimaryBounds,
        primaryBounds: finalPrimaryBounds,
        bodyControlBounds: finalMeasuredGlassBounds,
        glassWidthBounds: isComplexVintageAssembly(options)
          ? null
          : finalGlassWidthBounds ?? finalAspectBounds,
        baselineYPx: finalBaseline,
        capState,
        expectedPrimaryAspectRatio,
        aspectBounds: capState === "detached" ? finalAspectBounds : null,
      });
      const baselineResidualPx =
        finalBaseline != null ? finalBaseline - transform.targetBaselineYPx : null;
      const needsBaselineReseat =
        baselineResidualPx != null &&
        Math.abs(baselineResidualPx) > 4 &&
        Math.abs(baselineResidualPx) <= 48;
      const aspectDriftPct = framingQa.measurements.aspectRatioDriftPct;
      const aspectFactor = aspectDriftPct != null ? 1 + aspectDriftPct / 100 : null;
      const needsAspectCorrection =
        aspectDriftPct != null &&
        Math.abs(aspectDriftPct) > 6 &&
        aspectFactor != null &&
        Math.abs(aspectFactor - 1) <= 0.25;
      if (seatPass === 1 && (needsBaselineReseat || needsAspectCorrection)) {
        if (needsBaselineReseat && baselineResidualPx != null) {
          appliedShiftYPx -= baselineResidualPx;
        }
        if (needsAspectCorrection && aspectFactor != null) {
          appliedHScaleX *= aspectFactor;
        }
        continue;
      }
      break;
    }
    const framingDecision = getFramingDecision(framingQa);
    qaIssues.push(...framingQa.failures);
    const shoulderQa =
      hasShoulderLock && typeof rig.targetShoulderYPx === "number"
        ? evaluateShoulderLockQa({
            canvasHeight: height,
            targetShoulderYPx: rig.targetShoulderYPx,
            measuredShoulderYPx: finalShoulderLandmark?.shoulderYPx ?? null,
            tolerancePct: resolveShoulderLockTolerancePct({
              canvasHeight: height,
              targetBodyHeightPx: rig.targetBodyHeightPx,
              bareGlassHeightMm: rig.bareGlassHeightMm,
            }),
          })
        : null;
    if (shoulderQa?.issue) qaIssues.push(shoulderQa.issue);

    const targetFillHeight = height * (rig.fillHeightPct / 100);
    const transformedHeight = finalPrimaryBounds
      ? finalPrimaryBounds.bottom - finalPrimaryBounds.top
      : null;
    if (transformedHeight != null && transformedHeight < targetFillHeight * 0.78) {
      qaIssues.push("Mask-controlled product envelope is too small for the family rig.");
    }

    const finalContactBounds =
      options.shadowTopology && finalBounds && finalBaseline != null
        ? detectModelShadowContactBounds({
            pixels: finalImageData.data,
            width,
            height,
            background: bg,
            groupBounds: finalBounds,
            baselineYPx: finalBaseline,
            topology: options.shadowTopology,
          })
        : undefined;
    const finalShadow = finalizeRigShadow({
      owner: shadowOwner,
      pixels: finalImageData.data,
      width,
      height,
      background: bg,
      objectBounds: finalBounds,
      baselineYPx: finalBaseline,
      topology: options.shadowTopology,
      contactBounds: finalContactBounds,
    });
    const detachedCapGeometryQa = capState === "detached"
      ? buildDetachedCapGeometryQa(
          options.expectedDetachedCapMetrics,
          detachedCapGeometryEnforcement,
          finalImageData.data,
          width,
          height,
          bg,
          finalBaseline,
        )
      : null;
    if (detachedCapGeometryQa) qaIssues.push(...detachedCapGeometryQa.blockingFailures);
    const physicalScaleQa = buildPhysicalScaleQa({
      options,
      rig,
      framingQa,
      canvasWidth: width,
      canvasHeight: height,
    });
    framingQa.physicalScale = physicalScaleQa;
    if (physicalScaleQa.verdict === "fail") {
      qaIssues.push(
        `Physical scale violates catalog limits (${describePhysicalScaleDelta(physicalScaleQa)}).`,
      );
    }
    const effectiveFramingDecision =
      shoulderQa?.status === "fail" || physicalScaleQa.verdict === "fail"
        ? "reject"
        : physicalScaleQa.verdict === "review" ||
            physicalScaleQa.verdict === "unverified"
          ? "normalize"
          : framingDecision;
    outCtx.putImageData(finalImageData, 0, 0);

    return {
      dataUrl: out.toDataURL("image/png"),
      shifted: transform.scale !== 1 || transform.shiftXPx !== 0 || appliedShiftYPx !== 0,
      shiftXPx: transform.shiftXPx,
      shiftYPx: appliedShiftYPx,
      scale: transform.scale,
      preTransformBaselineYPx: generatedBounds?.bottom ?? null,
      detectedBaselineYPx: finalBaseline,
      targetBaselineYPx: transform.targetBaselineYPx,
      preTransformShoulderYPx: preTransformShoulder?.shoulderYPx ?? null,
      detectedShoulderYPx: finalShoulderLandmark?.shoulderYPx ?? null,
      targetShoulderYPx: hasShoulderLock ? rig.targetShoulderYPx ?? null : null,
      shoulderDeltaPct: shoulderQa?.deltaPct ?? null,
      shoulderConfidence: finalShoulderLandmark?.confidence ?? null,
      maskControlled: true,
      qaIssues,
      framingQa,
      framingDecision: effectiveFramingDecision,
      preTransformObjectBounds: generatedBounds,
      transformControlBounds: maskBounds,
      objectBounds: finalBounds,
      shadowOwner,
      shadowQa: finalShadow.shadowQa,
      detachedCapGeometryQa,
      physicalScaleQa,
      scaleCalibration: options.scaleCalibration ?? null,
    };
  }

  const rawDetectedBaseline = detectStrongBottomY(
    analysisImageData.data,
    width,
    height,
    analysisBg,
    capState,
  );
  const targetBaseline = Math.round(height * (1 - rig.baselinePct / 100));

  if (rawDetectedBaseline === null) {
    // A model-owned candidate must never enter the deterministic matte path.
    // Keep the source pixels for review and report an unanalyzable shadow rather
    // than silently painting a rig-owned replacement over the candidate.
    if (shadowOwner === "rig") {
      applyRigForegroundMatte(imageData.data, width, height, bg);
    }
    ctx.putImageData(imageData, 0, 0);
    const fallbackOut = document.createElement("canvas");
    fallbackOut.width = width;
    fallbackOut.height = height;
    const fallbackCtx = fallbackOut.getContext("2d");
    if (!fallbackCtx) throw new Error("Unable to acquire 2d canvas context");
    fallbackCtx.fillStyle = options.targetBackgroundHex ?? "#F5F3EF";
    fallbackCtx.fillRect(0, 0, width, height);
    fallbackCtx.drawImage(canvas, 0, 0);
    const fallbackBounds = detectStrongBounds(
      analysisImageData.data,
      width,
      height,
      analysisBg,
    );
    const framingQa = buildFramingQaReport({
      width,
      height,
      rig,
      bounds: fallbackBounds,
      baselineYPx: null,
      capState,
      expectedPrimaryAspectRatio,
    });
    // Route every ownership branch through the same final-shadow authority.
    // With no baseline the helper paints zero pixels and returns a review
    // report for model ownership; rig ownership remains a valid null-QA path.
    const fallbackShadow = finalizeRigShadow({
      owner: shadowOwner,
      pixels: imageData.data,
      width,
      height,
      background: bg,
      objectBounds: fallbackBounds,
      baselineYPx: null,
    });

    const detachedCapGeometryQa = capState === "detached"
      ? buildDetachedCapGeometryQa(
          options.expectedDetachedCapMetrics,
          detachedCapGeometryEnforcement,
          analysisImageData.data,
          width,
          height,
          analysisBg,
        )
      : null;
    return {
      dataUrl: fallbackOut.toDataURL("image/png"),
      shifted: false,
      shiftXPx: 0,
      shiftYPx: 0,
      scale: 1,
      preTransformBaselineYPx: null,
      detectedBaselineYPx: null,
      targetBaselineYPx: targetBaseline,
      preTransformShoulderYPx: null,
      detectedShoulderYPx: null,
      targetShoulderYPx: rig.targetShoulderYPx ?? null,
      shoulderDeltaPct: null,
      shoulderConfidence: null,
      maskControlled: false,
      qaIssues: [
        "Product baseline was not detectable for framing QA.",
        ...(detachedCapGeometryQa?.blockingFailures ?? []),
      ],
      framingQa,
      framingDecision: getFramingDecision(framingQa),
      preTransformObjectBounds: fallbackBounds,
      transformControlBounds: fallbackBounds,
      objectBounds: fallbackBounds,
      shadowOwner,
      shadowQa: fallbackShadow.shadowQa,
      detachedCapGeometryQa,
      physicalScaleQa: buildPhysicalScaleQa({
        options,
        rig,
        framingQa,
        canvasWidth: width,
        canvasHeight: height,
      }),
      scaleCalibration: options.scaleCalibration ?? null,
    };
  }

  const rawStrongBounds = detectStrongBounds(
    analysisImageData.data,
    width,
    height,
    analysisBg,
  );
  const rawPixelBackground = sampleOpaqueCanvasBorderBackground(
    imageData.data,
    width,
    height,
    analysisBg,
  );
  const rawComplexPrimaryBounds = isComplexVintageAssembly(options)
    ? detectComplexAssemblyBottleBounds(
        imageData.data,
        width,
        height,
        rawPixelBackground,
        rawStrongBounds?.bottom ?? rawDetectedBaseline,
      ) ??
      detectComplexAssemblyBottleBounds(
        imageData.data,
        width,
        height,
        bg,
        rawStrongBounds?.bottom ?? rawDetectedBaseline,
      )
    : null;
  const geometryBaseline = shadowOwner === "model"
    ? rawComplexPrimaryBounds?.bottom ??
      detectModelGeometryBaseline(
          imageData.data,
          width,
          height,
          analysisBg,
          rawStrongBounds,
          rawDetectedBaseline,
        )
    : rawDetectedBaseline;
  const modelProductControlBounds = shadowOwner === "model"
    ? detectStrongBounds(
        analysisImageData.data,
        width,
        height,
        analysisBg,
        geometryBaseline,
      )
    : null;
  const modelGroupBounds = modelProductControlBounds
    ? { ...modelProductControlBounds, bottom: geometryBaseline }
    : rawStrongBounds
      ? { ...rawStrongBounds, bottom: geometryBaseline }
      : rawStrongBounds;
  const modelContactBounds =
    options.shadowTopology && modelGroupBounds
      ? detectModelShadowContactBounds({
          pixels: imageData.data,
          width,
          height,
          background: analysisBg,
          groupBounds: modelGroupBounds,
          baselineYPx: geometryBaseline,
          topology: options.shadowTopology,
        })
      : undefined;

  const modelShadowAnalysis = shadowOwner === "model"
    ? analyzeModelOwnedShadow({
        pixels: imageData.data,
        width,
        height,
        background: analysisBg,
        // The product's geometry ends at the detected baseline. Treat pixels
        // below it as shadow candidates even when an extra component was wide
        // or dark enough to contaminate the raw strong bounds.
        objectBounds: modelGroupBounds,
        baselineYPx: geometryBaseline,
        topology: options.shadowTopology,
        contactBounds: modelContactBounds,
      })
    : null;
  const geometryAnalysisPixels = modelShadowAnalysis
    ? new Uint8ClampedArray(analysisImageData.data)
    : analysisImageData.data;
  if (modelShadowAnalysis) {
    maskOutModelShadowGeometry(
      geometryAnalysisPixels,
      modelShadowAnalysis.candidateMask,
      analysisBg,
    );
    clampModelShadowGeometryToControlEnvelope(
      geometryAnalysisPixels,
      width,
      height,
      analysisBg,
      modelProductControlBounds,
      geometryBaseline,
    );
  }
  const strongBounds = modelShadowAnalysis
    ? detectStrongBounds(geometryAnalysisPixels, width, height, analysisBg)
    : rawStrongBounds;
  const detectedBaseline = modelShadowAnalysis
    ? detectStrongBottomY(geometryAnalysisPixels, width, height, analysisBg, capState) ?? geometryBaseline
    : geometryBaseline;
  const complexPrimaryBounds = isComplexVintageAssembly(options)
    ? detectComplexAssemblyBottleBounds(
        geometryAnalysisPixels,
        width,
        height,
        analysisBg,
        detectedBaseline,
      ) ?? rawComplexPrimaryBounds
    : null;
  const primaryBounds = complexPrimaryBounds ?? (
    capState === "detached"
      ? detectPrimaryBottleBounds(
        geometryAnalysisPixels,
        width,
        height,
        analysisBg,
        detectedBaseline,
      )
      : strongBounds
  );
  const hasShoulderLock =
    typeof rig.shoulderTargetPct === "number" &&
    typeof rig.targetShoulderYPx === "number";
  const preTransformShoulder = detectRigShoulderLandmark({
    pixels: geometryAnalysisPixels,
    width,
    height,
    bg: analysisBg,
    rig,
    primaryBounds,
    detectedBaselineYPx: detectedBaseline,
    capState,
  });
  const resolvedBodyControlBounds = hasShoulderLock
    ? shoulderLandmarkToControlBounds(preTransformShoulder)
    : resolveBodyControlBoundsForTransform({
        provided: options.bodyControlBounds,
        calibration: options.scaleCalibration,
        primaryBounds,
        strongBounds: complexPrimaryBounds ?? strongBounds,
        detectedBaselineYPx: detectedBaseline,
        capState,
      });
  const bodyControlMissIssues: string[] = [];
  let transformRig = rig;
  if (
    typeof rig.targetBodyHeightPx === "number" &&
    rig.targetBodyHeightPx > 0 &&
    !isExactBodyControlBounds(resolvedBodyControlBounds)
  ) {
    bodyControlMissIssues.push(
      hasShoulderLock
        ? "Cylinder glass shoulder landmark was not detectable before normalization; refusing shoulder-lock sizing."
        : "Exact glass body-control bounds could not be derived; refusing scale-card body sizing and keeping provider/legacy scale.",
    );
    transformRig = { ...rig, targetBodyHeightPx: undefined };
  }
  const transform = computeRigFrameTransform({
    width,
    height,
    rig: transformRig,
    detectedBaselineYPx: detectedBaseline,
    strongBounds,
    primaryBounds,
    bodyControlBounds: resolvedBodyControlBounds,
    capState,
    preserveGeneratedScale: options.preserveGeneratedScale,
  });

  // Moving an opaque generated canvas would expose the target background only in
  // the vacated area while carrying the old white canvas with the product. First
  // normalize that source plate to the target color so the transformed image and
  // any newly exposed margin remain one continuous background.
  prepareUnmaskedRigRecanvasPixels(
    imageData.data,
    width,
    height,
    bg,
    strongBounds,
    { preserveMask: modelShadowAnalysis?.preservationMask },
  );
  ctx.putImageData(imageData, 0, 0);

  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const outCtx = out.getContext("2d");
  if (!outCtx) throw new Error("Unable to acquire 2d canvas context");
  const scaledWidth = Math.round(width * transform.scale);
  const scaledHeight = Math.round(height * transform.scale);
  const drawX = Math.round((width - scaledWidth) / 2 + transform.shiftXPx);
  // The affine transform aims the detected pre-transform baseline exactly at
  // target, but re-detection on the composited output can land a few pixels
  // off (recanvas + anti-aliased bottom rows read differently). That residual
  // is a pure translation, so one bounded translate-only second pass re-seats
  // it instead of failing framing QA on an image the rig can correct.
  let appliedShiftYPx = transform.shiftYPx;
  // Bounded deterministic aspect correction (Jordan-approved 2026-07-19): the
  // model slenderizes sidecar renders ~10-14% and prompt anchoring cannot fully
  // stop it, so when the measured bottle ratio drifts beyond the fail tolerance
  // the rig re-draws with a horizontal resample toward truth — same doctrine as
  // the baseline re-seat: model owns material, deterministic code owns geometry.
  let appliedHScaleX = 1;
  let finalImageData!: ImageData;
  let finalAnalysisImageData!: ImageData;
  let transformedControlBounds: { top: number; bottom: number; left: number; right: number } | null = null;
  let finalBounds: RigStrongBounds | null = null;
  let finalPrimaryBounds: RigStrongBounds | null = null;
  let finalBaseline: number | null = null;
  let finalMeasuredGlassBounds: RigStrongBounds | null = null;
  let finalShoulderLandmark: GlassShoulderLandmark | null = null;
  let framingQa!: ReturnType<typeof buildFramingQaReport>;
  for (let seatPass = 1; seatPass <= 2; seatPass += 1) {
    const seatShiftDeltaYPx = appliedShiftYPx - transform.shiftYPx;
    const scaleXAboutCenter = (value: number): number =>
      Math.round((value - width / 2) * appliedHScaleX + width / 2);
    const passDrawWidth = Math.round(scaledWidth * appliedHScaleX);
    const passDrawX = Math.round((width - passDrawWidth) / 2 + transform.shiftXPx * appliedHScaleX);
    outCtx.fillStyle = options.targetBackgroundHex ?? "#F5F3EF";
    outCtx.fillRect(0, 0, width, height);
    outCtx.drawImage(canvas, passDrawX, appliedShiftYPx, passDrawWidth, scaledHeight);
    finalImageData = outCtx.getImageData(0, 0, width, height);
    finalAnalysisImageData = new ImageData(
      new Uint8ClampedArray(finalImageData.data),
      width,
      height,
    );
    flattenBackgroundLikePixels(finalAnalysisImageData.data, bg);
    transformedControlBounds =
      transform.transformedTopYPx != null &&
      transform.transformedBottomYPx != null &&
      transform.transformedLeftXPx != null &&
      transform.transformedRightXPx != null
        ? {
            top: transform.transformedTopYPx + seatShiftDeltaYPx,
            bottom: transform.transformedBottomYPx + seatShiftDeltaYPx,
            left: scaleXAboutCenter(transform.transformedLeftXPx),
            right: scaleXAboutCenter(transform.transformedRightXPx),
          }
        : null;
    const transformedPrimaryControlBounds = primaryBounds &&
      typeof primaryBounds.left === "number" &&
      typeof primaryBounds.right === "number"
        ? {
            top: Math.round(primaryBounds.top * transform.scale + appliedShiftYPx),
            bottom: Math.round(primaryBounds.bottom * transform.scale + appliedShiftYPx),
            left: scaleXAboutCenter(Math.round(
              primaryBounds.left * transform.scale
                + (width - width * transform.scale) / 2
                + transform.shiftXPx,
            )),
            right: scaleXAboutCenter(Math.round(
              primaryBounds.right * transform.scale
                + (width - width * transform.scale) / 2
                + transform.shiftXPx,
            )),
          }
        : null;
    finalBounds =
      detectControlledRigBounds(
        finalImageData.data,
        width,
        height,
        bg,
        transformedControlBounds,
      ) ?? detectStrongBounds(finalAnalysisImageData.data, width, height, bg);
    finalBaseline = detectStrongBottomY(
      finalAnalysisImageData.data,
      width,
      height,
      bg,
      capState,
      shadowOwner === "model" ? transformedControlBounds?.bottom : null,
    );
    finalPrimaryBounds = isComplexVintageAssembly(options) && finalBaseline != null
      ? detectControlledRigBounds(
          finalAnalysisImageData.data,
          width,
          height,
          bg,
          transformedPrimaryControlBounds,
        ) ?? detectComplexAssemblyBottleBounds(
          finalAnalysisImageData.data,
          width,
          height,
          bg,
          finalBaseline,
        ) ?? finalBounds
      : capState === "detached"
        ? detectControlledRigBounds(
            finalImageData.data,
            width,
            height,
            bg,
            transformedPrimaryControlBounds,
          ) ?? detectPrimaryBottleBounds(finalAnalysisImageData.data, width, height, bg)
        : finalBounds;
    finalShoulderLandmark =
      finalBaseline != null
        ? detectRigShoulderLandmark({
            pixels: finalAnalysisImageData.data,
            width,
            height,
            bg,
            rig,
            primaryBounds: finalPrimaryBounds,
            detectedBaselineYPx: finalBaseline,
            capState,
            expectedShoulderYPx: rig.targetShoulderYPx,
          })
        : null;
    finalMeasuredGlassBounds =
      hasShoulderLock
        ? shoulderLandmarkToControlBounds(finalShoulderLandmark)
        : options.scaleCalibration && finalBaseline != null
        ? resolveCalibratedGlassBodyBounds({
            calibration: options.scaleCalibration,
            vesselBounds: finalPrimaryBounds,
            detectedBaselineYPx: finalBaseline,
          })
        : transformBodyControlBounds(
            resolvedBodyControlBounds,
            transform.scale,
            appliedShiftYPx,
            width,
            appliedHScaleX,
          );
    const finalAspectBounds = capState === "detached"
      ? resolveWholeVesselBounds(
          finalAnalysisImageData.data,
          width,
          height,
          bg,
          finalBaseline,
        )
      : finalPrimaryBounds;
    const finalGlassWidthBounds = detectGlassBodyWidthBounds(
      finalAnalysisImageData.data,
      width,
      height,
      bg,
      finalMeasuredGlassBounds
        ? {
            ...finalMeasuredGlassBounds,
            left: finalAspectBounds?.left ?? finalMeasuredGlassBounds.left,
            right: finalAspectBounds?.right ?? finalMeasuredGlassBounds.right,
          }
        : finalAspectBounds,
    );
    framingQa = buildFramingQaReport({
      width,
      height,
      rig,
      bounds: finalPrimaryBounds,
      primaryBounds: finalPrimaryBounds,
      bodyControlBounds: finalMeasuredGlassBounds,
      glassWidthBounds: isComplexVintageAssembly(options)
        ? null
        : finalGlassWidthBounds ?? finalAspectBounds,
      baselineYPx: finalBaseline,
      capState,
      expectedPrimaryAspectRatio,
      aspectBounds: capState === "detached" ? finalAspectBounds : null,
    });
    const baselineResidualPx =
      finalBaseline != null ? finalBaseline - transform.targetBaselineYPx : null;
    const needsBaselineReseat =
      baselineResidualPx != null &&
      Math.abs(baselineResidualPx) > 4 &&
      Math.abs(baselineResidualPx) <= 48;
    const aspectDriftPct = framingQa.measurements.aspectRatioDriftPct;
    const aspectFactor = aspectDriftPct != null ? 1 + aspectDriftPct / 100 : null;
    const needsAspectCorrection =
      aspectDriftPct != null &&
      Math.abs(aspectDriftPct) > 6 &&
      aspectFactor != null &&
      Math.abs(aspectFactor - 1) <= 0.25;
    if (seatPass === 1 && (needsBaselineReseat || needsAspectCorrection)) {
      if (needsBaselineReseat && baselineResidualPx != null) {
        appliedShiftYPx -= baselineResidualPx;
      }
      if (needsAspectCorrection && aspectFactor != null) {
        appliedHScaleX *= aspectFactor;
      }
      continue;
    }
    break;
  }
  const framingDecision = getFramingDecision(framingQa);
  const shoulderQa =
    hasShoulderLock && typeof rig.targetShoulderYPx === "number"
      ? evaluateShoulderLockQa({
          canvasHeight: height,
          targetShoulderYPx: rig.targetShoulderYPx,
          measuredShoulderYPx: finalShoulderLandmark?.shoulderYPx ?? null,
          tolerancePct: resolveShoulderLockTolerancePct({
            canvasHeight: height,
            targetBodyHeightPx: rig.targetBodyHeightPx,
            bareGlassHeightMm: rig.bareGlassHeightMm,
          }),
        })
      : null;

  // Cap fidelity doctrine (Jordan 2026-07-19): the model beautifies the cap
  // from the reference via the prompt — code never splices or color-gates it.
  // Geometry gates above are the only blockers; cap beauty is judged by eye.

  const finalContactBounds =
    (options.shadowTopology && finalBounds && finalBaseline != null
      ? detectModelShadowContactBounds({
          pixels: finalImageData.data,
          width,
          height,
          background: bg,
          groupBounds: finalBounds,
          baselineYPx: finalBaseline,
          topology: options.shadowTopology,
        })
      : undefined);
  const finalShadow = finalizeRigShadow({
    owner: shadowOwner,
    pixels: finalImageData.data,
    width,
    height,
    background: bg,
    objectBounds: finalBounds,
    baselineYPx: finalBaseline,
    topology: options.shadowTopology,
    contactBounds: finalContactBounds,
  });
  const detachedCapGeometryQa = capState === "detached"
    ? buildDetachedCapGeometryQa(
        options.expectedDetachedCapMetrics,
        detachedCapGeometryEnforcement,
        finalAnalysisImageData.data,
        width,
        height,
        bg,
        finalBaseline,
      )
    : null;
  const physicalScaleQa = buildPhysicalScaleQa({
    options,
    rig,
    framingQa,
    canvasWidth: width,
    canvasHeight: height,
  });
  framingQa.physicalScale = physicalScaleQa;
  const physicalScaleIssues =
    physicalScaleQa.verdict === "fail"
      ? [
          `Physical scale violates catalog limits (${describePhysicalScaleDelta(physicalScaleQa)}).`,
        ]
      : [];
  const effectiveFramingDecision =
    shoulderQa?.status === "fail" || physicalScaleQa.verdict === "fail"
      ? "reject"
      : physicalScaleQa.verdict === "review" ||
          physicalScaleQa.verdict === "unverified"
        ? "normalize"
        : framingDecision;
  outCtx.putImageData(finalImageData, 0, 0);

  return {
    dataUrl: out.toDataURL("image/png"),
    shifted: transform.scale !== 1 || transform.shiftXPx !== 0 || appliedShiftYPx !== 0,
    shiftXPx: transform.shiftXPx,
    shiftYPx: appliedShiftYPx,
    scale: transform.scale,
    preTransformBaselineYPx: detectedBaseline,
    detectedBaselineYPx: finalBaseline,
    targetBaselineYPx: targetBaseline,
    preTransformShoulderYPx: preTransformShoulder?.shoulderYPx ?? null,
    detectedShoulderYPx: finalShoulderLandmark?.shoulderYPx ?? null,
    targetShoulderYPx: hasShoulderLock ? rig.targetShoulderYPx ?? null : null,
    shoulderDeltaPct: shoulderQa?.deltaPct ?? null,
    shoulderConfidence: finalShoulderLandmark?.confidence ?? null,
    maskControlled: false,
    qaIssues: [
      ...bodyControlMissIssues,
      ...(capState === "detached" && !primaryBounds
        ? ["Primary bottle bounds were unresolved for detached topology."]
        : []),
      ...framingQa.failures,
      ...(shoulderQa?.issue ? [shoulderQa.issue] : []),
      ...physicalScaleIssues,
      ...(detachedCapGeometryQa?.blockingFailures ?? []),
    ],
    framingQa,
    framingDecision: effectiveFramingDecision,
    preTransformObjectBounds: strongBounds,
    transformControlBounds: strongBounds,
    objectBounds: finalBounds,
    shadowOwner,
    shadowQa: finalShadow.shadowQa,
    detachedCapGeometryQa,
    physicalScaleQa,
    scaleCalibration: options.scaleCalibration ?? null,
  };
}
