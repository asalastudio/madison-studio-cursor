/**
 * Library / editor scale-card overlay.
 *
 * Draws the same instrument Studio uses after a generate: 91% baseline,
 * S-tag ticks from the scale-card control points, and the SKU target rim.
 * Operators toggle it on generated catalog heroes to judge accuracy.
 */

import {
  BEST_BOTTLES_SCALE_CARD_BASELINE_PERCENT,
  BEST_BOTTLES_SCALE_CARD_CONTROL_POINTS,
  BEST_BOTTLES_SCALE_CARD_VERSION,
} from "@/config/bestBottlesCatalogScale";
import {
  BEST_BOTTLES_SHOULDER_LOCK_VERSION,
  resolveShoulderLock,
} from "@/lib/bestBottlesShoulderLock";
import { getCatalogHeroLibraryPreset } from "@/lib/bestBottlesCatalogHeroLibrary";
import { parseDimensionMm } from "@/lib/product-image/skuInjector";
import { evaluateScaleProof, type ScaleProofEvaluation } from "@/lib/product-image/scaleProof";

export const SCALE_CARD_HEIGHT_MM_TAG_PREFIX = "height-mm:" as const;
export const SCALE_CARD_TAG_PREFIX = "scale-tag:" as const;
export const SCALE_CARD_TARGET_PCT_TAG_PREFIX = "scale-target-pct:" as const;
export const SCALE_CARD_MEASURED_PCT_TAG_PREFIX = "measured-glass-pct:" as const;
export const SCALE_CARD_PROOF_TAG_PREFIX = "scale-proof:" as const;

export type ScaleCardOverlayTick = {
  mm: number;
  glassHeightPct: number;
  topPercent: number;
  tag: string;
  isTarget: boolean;
};

export type ScaleCardOverlayTarget = {
  heightWithoutCapMm: number;
  glassHeightPct: number;
  topPercent: number;
  tag: string;
};

export type ScaleCardOverlayMeasured = {
  glassHeightPct: number;
  topPercent: number;
};

export type ScaleCardOverlayAssembledTarget = {
  heightWithCapMm: number;
  heightPct: number;
  topPercent: number;
};

export type ShoulderLockOverlay = {
  glassBodyKey: string;
  label: string;
  targetShoulderPct: number;
  targetTopPercent: number;
  measuredShoulderPct: number | null;
  measuredTopPercent: number | null;
  deltaPct: number | null;
  confidence: number | null;
  status: "pass" | "fail" | "pending";
};

export type ScaleCardOverlayModel = {
  mode: "scale-card" | "shoulder-lock";
  version:
    | typeof BEST_BOTTLES_SCALE_CARD_VERSION
    | typeof BEST_BOTTLES_SHOULDER_LOCK_VERSION;
  baselinePercent: typeof BEST_BOTTLES_SCALE_CARD_BASELINE_PERCENT;
  ticks: ScaleCardOverlayTick[];
  target: ScaleCardOverlayTarget | null;
  assembledTarget: ScaleCardOverlayAssembledTarget | null;
  measured: ScaleCardOverlayMeasured | null;
  shoulder: ShoulderLockOverlay | null;
  proof: ScaleProofEvaluation | null;
};

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function topPercentForGlassHeight(glassHeightPct: number): number {
  return roundToOneDecimal(BEST_BOTTLES_SCALE_CARD_BASELINE_PERCENT - glassHeightPct);
}

function parsePrefixedNumber(tags: readonly string[] | null | undefined, prefix: string): number | null {
  if (!tags) return null;
  for (const tag of tags) {
    const raw = String(tag ?? "").trim();
    if (!raw.toLowerCase().startsWith(prefix)) continue;
    const value = Number.parseFloat(raw.slice(prefix.length));
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function resolveHeightWithoutCapMm(input: {
  tags?: readonly string[] | null;
  heightWithoutCap?: string | number | null;
}): number | null {
  const fromTag = parsePrefixedNumber(input.tags, SCALE_CARD_HEIGHT_MM_TAG_PREFIX);
  if (fromTag != null && fromTag > 0) return fromTag;
  if (typeof input.heightWithoutCap === "number" && Number.isFinite(input.heightWithoutCap) && input.heightWithoutCap > 0) {
    return input.heightWithoutCap;
  }
  return parseDimensionMm(
    typeof input.heightWithoutCap === "string" ? input.heightWithoutCap : null,
  );
}

function resolveMeasuredGlassHeightPct(input: {
  tags?: readonly string[] | null;
  measuredGlassHeightPct?: number | null;
}): number | null {
  const fromArg =
    typeof input.measuredGlassHeightPct === "number" && Number.isFinite(input.measuredGlassHeightPct)
      ? input.measuredGlassHeightPct
      : null;
  if (fromArg != null) return fromArg;
  return parsePrefixedNumber(input.tags, SCALE_CARD_MEASURED_PCT_TAG_PREFIX);
}

export function buildBestBottlesScaleCardLibraryTags(input: {
  heightWithoutCapMm: number | null | undefined;
  measuredGlassHeightPct?: number | null;
}): string[] {
  if (input.heightWithoutCapMm == null || !Number.isFinite(input.heightWithoutCapMm) || input.heightWithoutCapMm <= 0) {
    return [];
  }

  const proof = evaluateScaleProof({
    heightWithoutCapMm: input.heightWithoutCapMm,
    measuredGlassHeightPct: input.measuredGlassHeightPct,
  });

  return [
    `${SCALE_CARD_HEIGHT_MM_TAG_PREFIX}${input.heightWithoutCapMm}`,
    `${SCALE_CARD_TAG_PREFIX}${proof.target.tag}`,
    `${SCALE_CARD_TARGET_PCT_TAG_PREFIX}${proof.target.glassHeightPct}`,
    proof.measuredGlassHeightPct != null
      ? `${SCALE_CARD_MEASURED_PCT_TAG_PREFIX}${proof.measuredGlassHeightPct}`
      : null,
    `${SCALE_CARD_PROOF_TAG_PREFIX}${proof.verdict}`,
  ].filter((tag): tag is string => Boolean(tag));
}

export function resolveScaleCardOverlayModel(input: {
  tags?: readonly string[] | null;
  family?: string | null;
  bottleCollection?: string | null;
  graceSku?: string | null;
  websiteSku?: string | null;
  itemName?: string | null;
  capacityMl?: number | null;
  heightWithoutCap?: string | number | null;
  heightWithCap?: string | number | null;
  applicator?: string | null;
  neckThreadSize?: string | null;
  measuredGlassHeightPct?: number | null;
  canvasHeightPx?: number | null;
  measuredShoulderYPx?: number | null;
  shoulderConfidence?: number | null;
}): ScaleCardOverlayModel {
  const shoulderLock = resolveShoulderLock({
    family: input.family,
    bottleCollection: input.bottleCollection,
    graceSku: input.graceSku,
    websiteSku: input.websiteSku,
    itemName: input.itemName,
    capacityMl: input.capacityMl,
    heightWithoutCap: input.heightWithoutCap,
    applicator: input.applicator,
    neckThreadSize: input.neckThreadSize,
  });
  if (shoulderLock) {
    const canvasHeight =
      typeof input.canvasHeightPx === "number" &&
      Number.isFinite(input.canvasHeightPx) &&
      input.canvasHeightPx > 0
        ? input.canvasHeightPx
        : null;
    const measuredTopPercent =
      canvasHeight != null &&
      typeof input.measuredShoulderYPx === "number" &&
      Number.isFinite(input.measuredShoulderYPx)
        ? roundToOneDecimal((input.measuredShoulderYPx / canvasHeight) * 100)
        : null;
    const measuredShoulderPct =
      measuredTopPercent == null
        ? null
        : roundToOneDecimal(
            BEST_BOTTLES_SCALE_CARD_BASELINE_PERCENT - measuredTopPercent,
          );
    const deltaPct =
      measuredTopPercent == null
        ? null
        : roundToOneDecimal(measuredTopPercent - shoulderLock.shoulderYFromTopPct);
    const confidence =
      typeof input.shoulderConfidence === "number" &&
      Number.isFinite(input.shoulderConfidence)
        ? input.shoulderConfidence
        : null;
    const shoulder: ShoulderLockOverlay = {
      glassBodyKey: shoulderLock.glassBodyKey,
      label: shoulderLock.label,
      targetShoulderPct: shoulderLock.shoulderPct,
      targetTopPercent: shoulderLock.shoulderYFromTopPct,
      measuredShoulderPct,
      measuredTopPercent,
      deltaPct,
      confidence,
      status:
        deltaPct == null
          ? "pending"
          : Math.abs(deltaPct) <= 1
            ? "pass"
            : "fail",
    };
    return {
      mode: "shoulder-lock",
      version: BEST_BOTTLES_SHOULDER_LOCK_VERSION,
      baselinePercent: BEST_BOTTLES_SCALE_CARD_BASELINE_PERCENT,
      ticks: [],
      target: null,
      assembledTarget: null,
      measured: null,
      shoulder,
      proof: null,
    };
  }

  const heightWithoutCapMm = resolveHeightWithoutCapMm(input);
  const heightWithCapMm =
    typeof input.heightWithCap === "number" &&
    Number.isFinite(input.heightWithCap) &&
    input.heightWithCap > 0
      ? input.heightWithCap
      : parseDimensionMm(
          typeof input.heightWithCap === "string" ? input.heightWithCap : null,
        );
  const measuredGlassHeightPct = resolveMeasuredGlassHeightPct(input);
  const proof =
    heightWithoutCapMm != null
      ? evaluateScaleProof({
          heightWithoutCapMm,
          measuredGlassHeightPct,
        })
      : null;

  const target: ScaleCardOverlayTarget | null = proof && heightWithoutCapMm != null
    ? {
        heightWithoutCapMm,
        glassHeightPct: proof.target.glassHeightPct,
        topPercent: topPercentForGlassHeight(proof.target.glassHeightPct),
        tag: proof.target.tag,
      }
    : null;
  const assembledTarget =
    target &&
    heightWithCapMm != null &&
    heightWithCapMm >= target.heightWithoutCapMm
      ? {
          heightWithCapMm,
          heightPct: roundToOneDecimal(
            target.glassHeightPct *
              (heightWithCapMm / target.heightWithoutCapMm),
          ),
          topPercent: topPercentForGlassHeight(
            target.glassHeightPct *
              (heightWithCapMm / target.heightWithoutCapMm),
          ),
        }
      : null;

  const ticks: ScaleCardOverlayTick[] = BEST_BOTTLES_SCALE_CARD_CONTROL_POINTS.map((point) => {
    const tag =
      "level" in point && typeof point.level === "string"
        ? point.level
        : `S${Math.round(point.mm / 10) * 10}`;
    return {
      mm: point.mm,
      glassHeightPct: point.glassPct,
      topPercent: topPercentForGlassHeight(point.glassPct),
      tag,
      isTarget: target != null && tag === target.tag,
    };
  });

  if (target && !ticks.some((tick) => tick.isTarget)) {
    ticks.push({
      mm: target.heightWithoutCapMm,
      glassHeightPct: target.glassHeightPct,
      topPercent: target.topPercent,
      tag: target.tag,
      isTarget: true,
    });
    ticks.sort((a, b) => a.mm - b.mm);
  }

  return {
    mode: "scale-card",
    version: BEST_BOTTLES_SCALE_CARD_VERSION,
    baselinePercent: BEST_BOTTLES_SCALE_CARD_BASELINE_PERCENT,
    ticks,
    target,
    assembledTarget,
    measured:
      proof?.measuredGlassHeightPct != null
        ? {
            glassHeightPct: proof.measuredGlassHeightPct,
            topPercent: topPercentForGlassHeight(proof.measuredGlassHeightPct),
          }
        : null,
    shoulder: null,
    proof,
  };
}

export function getCatalogHeroScaleReviewPath(family = "cylinder"): string {
  const preset = getCatalogHeroLibraryPreset(family);
  const params = new URLSearchParams({
    catalogHeroes: "1",
    scaleCard: "1",
    family: preset.family,
  });
  return `/image-library?${params.toString()}`;
}

export function summarizeScaleCardOverlayModels(
  models: readonly ScaleCardOverlayModel[],
): { pass: number; fail: number; pending: number; unknown: number } {
  return models.reduce(
    (counts, model) => {
      if (model.shoulder) {
        counts[model.shoulder.status] += 1;
        return counts;
      }
      if (!model.proof) {
        counts.unknown += 1;
        return counts;
      }
      counts[model.proof.verdict] += 1;
      return counts;
    },
    { pass: 0, fail: 0, pending: 0, unknown: 0 },
  );
}
