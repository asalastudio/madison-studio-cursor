/**
 * IMPOSED STUDIO RIG - Deno / Supabase Edge twin.
 *
 * Keep FAMILY_RIG numerically identical to
 * `src/lib/product-image/familyRig.ts`. The edge function cannot import the
 * Vite/Node module directly, so this dependency-free file mirrors the pure
 * rig math used by the local generator and prompt assembler.
 */

import {
  resolveShoulderLock,
  type ResolvedShoulderLock,
} from "./bestBottlesShoulderLock.ts";

export interface FamilyRigConfig {
  family: string;
  profileId?: string;
  profileLabel?: string;
  relativeScaleZoneId?: string;
  relativeScaleZoneLabel?: string;
  scaleContractVersion?: string;
  geometryScaleVersion?: string;
  /** Assembled framing hint — not bare-glass scale-card %. */
  fillHeightPct: number;
  targetBodyHeightPx?: number;
  fillHeightRangePct?: { min: number; max: number };
  glassHeightPct?: number;
  glassHeightRangePct?: { min: number; max: number };
  scaleTag?: string;
  glassBodyKey?: string;
  shoulderTargetPct?: number;
  shoulderYFromTopPct?: number;
  targetShoulderYPx?: number;
  bareGlassHeightMm?: number;
  assembledHeightMm?: number;
  assembledHeightPct?: number;
  assembledHeightPx?: number;
  fillWidthPct: number;
  baselinePct: number;
  primaryObjectCenterXPct?: number;
}

export interface FamilyRigProductInput {
  family?: string | null;
  bottleCollection?: string | null;
  category?: string | null;
  sku?: string | null;
  websiteSku?: string | null;
  name?: string | null;
  itemDescription?: string | null;
  applicator?: string | null;
  capacity?: string | null;
  capacityMl?: number | null;
  heightWithCap?: string | number | null;
  heightWithoutCap?: string | number | null;
  diameter?: string | null;
  capState?: string | null;
  mode?: string | null;
  /**
   * Master / scale-card lane: missing heightWithoutCap throws.
   * Refinements / non-master callers omit this and keep legacy assembled rig.
   */
  requireScaleCard?: boolean;
}

const BEST_BOTTLES_MASTER_CANVAS_HEIGHT_PX = 2288;

export const BEST_BOTTLES_SCALE_CARD_VERSION =
  "best-bottles-scale-card-v2-2026-09-18" as const;

export const BEST_BOTTLES_SCALE_CARD_HEIGHT_BANDS = [
  { level: "Mini", mmMinInclusive: 0, mmMaxExclusive: 45, glassPct: 52 },
  { level: "Small", mmMinInclusive: 45, mmMaxExclusive: 65, glassPct: 58 },
  { level: "Medium", mmMinInclusive: 65, mmMaxExclusive: 95, glassPct: 64 },
  { level: "Large", mmMinInclusive: 95, mmMaxExclusive: 135, glassPct: 70 },
  { level: "Standard", mmMinInclusive: 135, mmMaxExclusive: Number.POSITIVE_INFINITY, glassPct: 74 },
] as const;

/** Overlay samples — one point inside each v2 band. Not interpolated. */
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
  level: (typeof BEST_BOTTLES_SCALE_CARD_HEIGHT_BANDS)[number]["level"];
};

export const FAMILY_RIG: Record<string, FamilyRigConfig> = {
  defaultPdp: {
    family: "universal-pdp",
    fillHeightPct: 67,
    fillHeightRangePct: { min: 65, max: 69 },
    fillWidthPct: 60,
    baselinePct: 9,
    primaryObjectCenterXPct: 50,
  },
  cylinder: {
    family: "cylinder",
    fillHeightPct: 76,
    fillHeightRangePct: { min: 72, max: 78 },
    fillWidthPct: 62,
    baselinePct: 9,
    primaryObjectCenterXPct: 50,
  },
  circle: {
    family: "circle",
    fillHeightPct: 78,
    fillHeightRangePct: { min: 76, max: 80 },
    fillWidthPct: 68,
    baselinePct: 9,
    primaryObjectCenterXPct: 50,
  },
};

export function normalizeFamily(family?: string | null): string {
  return (family ?? "").trim().toLowerCase();
}

export function isCylinderFamilyAlias(family?: string | null): boolean {
  const normalized = normalizeFamily(family).replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  return normalized === "cylinder" || normalized === "tall cylinder";
}

export function getFamilyRig(family?: string | null): FamilyRigConfig | null {
  const normalized = normalizeFamily(family);
  if (isCylinderFamilyAlias(normalized)) return FAMILY_RIG.cylinder;
  return FAMILY_RIG[normalized] ?? FAMILY_RIG.defaultPdp;
}

function normalizeSearchText(input: FamilyRigProductInput): string {
  return [
    input.family,
    input.bottleCollection,
    input.category,
    input.sku,
    input.websiteSku,
    input.name,
    input.itemDescription,
    input.applicator,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .trim()
    .toLowerCase();
}

function parseFirstNumber(value: string | number | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (!value) return null;
  const match = value.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function getCapacityMl(input: FamilyRigProductInput): number | null {
  if (typeof input.capacityMl === "number" && Number.isFinite(input.capacityMl) && input.capacityMl > 0) {
    return input.capacityMl;
  }
  return parseFirstNumber(input.capacity);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveStandardCylinderFillHeightPct(measuredHeightMm: number | null): number {
  if (measuredHeightMm == null) return 76;
  const observedMinMm = 75;
  const observedMaxMm = 142;
  const rangeMinPct = 72;
  const rangeMaxPct = 78;
  const normalized = (clamp(measuredHeightMm, observedMinMm, observedMaxMm) - observedMinMm) /
    (observedMaxMm - observedMinMm);
  return Math.round(rangeMinPct + normalized * (rangeMaxPct - rangeMinPct));
}

function resolveSmallCylinderFillHeightPct(measuredHeightMm: number | null): number {
  if (measuredHeightMm == null) return 62;
  const observedMinMm = 60;
  const observedMaxMm = 90;
  const rangeMinPct = 60;
  const rangeMaxPct = 64;
  const normalized = (clamp(measuredHeightMm, observedMinMm, observedMaxMm) - observedMinMm) /
    (observedMaxMm - observedMinMm);
  return Math.round(rangeMinPct + normalized * (rangeMaxPct - rangeMinPct));
}

function isSlimTallCylinderProduct(input: FamilyRigProductInput): boolean {
  const capacityMl = getCapacityMl(input);
  const heightMm = parseFirstNumber(input.heightWithCap) ?? parseFirstNumber(input.heightWithoutCap);
  const diameterMm = parseFirstNumber(input.diameter);
  if (
    capacityMl == null ||
    capacityMl <= 4 ||
    heightMm == null ||
    diameterMm == null ||
    diameterMm <= 0
  ) {
    return false;
  }

  return heightMm >= 110 && diameterMm <= 19 && heightMm / diameterMm >= 6;
}

function isCylinderProduct(input: FamilyRigProductInput): boolean {
  const family = normalizeFamily(input.family ?? input.bottleCollection).replace(/[_]+/g, "-");
  if (family === "vial") return false;
  if (isCylinderFamilyAlias(family)) return true;
  const text = normalizeSearchText(input);
  return text.includes("cylinder") || /\b(?:gb|lb)-cyl\b/.test(text) || text.includes("-cyl-");
}

const BEST_BOTTLES_GLOBAL_SCALE_KNOTS = [
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

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function resolveBestBottlesScaleCardBand(heightWithoutCapMm: number) {
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
 * Mirrored from `src/config/bestBottlesCatalogScale.ts` for Deno parity.
 */
export function resolveBestBottlesGlassScale(
  heightWithoutCapMm: number,
): BestBottlesGlassScale {
  if (!Number.isFinite(heightWithoutCapMm) || heightWithoutCapMm <= 0) {
    throw new Error("A positive bare-glass heightWithoutCapMm is required.");
  }

  const band = resolveBestBottlesScaleCardBand(heightWithoutCapMm);
  const glassHeightPct = roundToOneDecimal(band.glassPct);
  return {
    glassHeightPct,
    targetGlassHeightPx: Math.round(
      (glassHeightPct / 100) * BEST_BOTTLES_MASTER_CANVAS_HEIGHT_PX,
    ),
    tag: band.level,
    level: band.level,
  };
}

function applyShoulderLockTarget(
  rig: FamilyRigConfig,
  lock: ResolvedShoulderLock,
  heightWithoutCapMm: number | null,
  heightWithCapMm: number | null,
): FamilyRigConfig {
  return {
    ...rig,
    scaleContractVersion: lock.lockVersion,
    geometryScaleVersion: undefined,
    glassBodyKey: lock.glassBodyKey,
    shoulderTargetPct: lock.shoulderPct,
    shoulderYFromTopPct: lock.shoulderYFromTopPct,
    targetShoulderYPx: Math.round(
      (lock.shoulderYFromTopPct / 100) * BEST_BOTTLES_MASTER_CANVAS_HEIGHT_PX,
    ),
    targetBodyHeightPx: Math.round(
      (lock.shoulderPct / 100) * BEST_BOTTLES_MASTER_CANVAS_HEIGHT_PX,
    ),
    scaleTag: lock.label,
    glassHeightPct: undefined,
    glassHeightRangePct: undefined,
    assembledHeightPct: undefined,
    assembledHeightPx: undefined,
    ...(heightWithoutCapMm != null ? { bareGlassHeightMm: heightWithoutCapMm } : {}),
    ...(heightWithCapMm != null ? { assembledHeightMm: heightWithCapMm } : {}),
  };
}

function applyScaleCardGlassTarget(
  rig: FamilyRigConfig,
  heightWithoutCapMm: number,
  heightWithCapMm: number | null,
): FamilyRigConfig {
  const glassScale = resolveBestBottlesGlassScale(heightWithoutCapMm);
  const assembledHeightPct =
    heightWithCapMm != null && heightWithCapMm >= heightWithoutCapMm
      ? roundToOneDecimal(
          glassScale.glassHeightPct *
            (heightWithCapMm / heightWithoutCapMm),
        )
      : null;
  return {
    ...rig,
    scaleContractVersion: BEST_BOTTLES_SCALE_CARD_VERSION,
    geometryScaleVersion: undefined,
    // Keep fillHeightPct / fillHeightRangePct as assembled framing.
    glassHeightPct: glassScale.glassHeightPct,
    glassHeightRangePct: {
      min: Math.max(0, glassScale.glassHeightPct - 2),
      max: Math.min(100, glassScale.glassHeightPct + 2),
    },
    targetBodyHeightPx: glassScale.targetGlassHeightPx,
    scaleTag: glassScale.tag,
    bareGlassHeightMm: heightWithoutCapMm,
    ...(assembledHeightPct != null && heightWithCapMm != null
      ? {
        assembledHeightMm: heightWithCapMm,
        assembledHeightPct,
        assembledHeightPx: Math.round(
          (assembledHeightPct / 100) *
            BEST_BOTTLES_MASTER_CANVAS_HEIGHT_PX,
        ),
      }
      : {}),
  };
}

/** @deprecated Prefer resolveBestBottlesGlassScale(heightWithoutCapMm) for masters. */
export function resolveBestBottlesGlobalScalePct(capacityMl: number): number {
  const first = BEST_BOTTLES_GLOBAL_SCALE_KNOTS[0];
  const last = BEST_BOTTLES_GLOBAL_SCALE_KNOTS[BEST_BOTTLES_GLOBAL_SCALE_KNOTS.length - 1];
  if (capacityMl <= first.capacityMl) return first.assembledHeightPct;
  if (capacityMl >= last.capacityMl) return last.assembledHeightPct;
  for (let index = 1; index < BEST_BOTTLES_GLOBAL_SCALE_KNOTS.length; index += 1) {
    const upper = BEST_BOTTLES_GLOBAL_SCALE_KNOTS[index];
    if (capacityMl <= upper.capacityMl) {
      const lower = BEST_BOTTLES_GLOBAL_SCALE_KNOTS[index - 1];
      const progress = (capacityMl - lower.capacityMl) / (upper.capacityMl - lower.capacityMl);
      return lower.assembledHeightPct
        + progress * (upper.assembledHeightPct - lower.assembledHeightPct);
    }
  }
  return last.assembledHeightPct;
}

function isSampleVialProduct(input: FamilyRigProductInput): boolean {
  const capacityMl = getCapacityMl(input);
  if (capacityMl != null && capacityMl <= 4) return true;
  const text = normalizeSearchText(input);
  return /\bvial\b/.test(text) || /\bgb-via\b/.test(text);
}

function isRollerBottleProduct(input: FamilyRigProductInput): boolean {
  return /\broll-?on\b|\broller\b|\broller ball\b|\b-mrl-\b|\b-rol-\b/.test(normalizeSearchText(input));
}

function cylinderProfile(input: FamilyRigProductInput): FamilyRigConfig {
  const capacityMl = getCapacityMl(input);
  const heightWithCapMm = parseFirstNumber(input.heightWithCap);
  const heightWithoutCapMm = parseFirstNumber(input.heightWithoutCap);
  const measuredHeightMm = heightWithCapMm ?? heightWithoutCapMm;

  if (
    (capacityMl != null && capacityMl <= 4) ||
    (heightWithCapMm != null && heightWithCapMm <= 60) ||
    (heightWithoutCapMm != null && heightWithoutCapMm <= 40)
  ) {
    return {
      family: "sample-vial",
      profileId: "sample-vial",
      profileLabel: "Cylinder Sample Vial",
      relativeScaleZoneId: "sample-vial",
      relativeScaleZoneLabel: "Sample vials",
      fillHeightPct: capacityMl != null && capacityMl <= 3 ? 56 : 58,
      fillHeightRangePct: { min: 55, max: 60 },
      fillWidthPct: 58,
      baselinePct: 9,
      primaryObjectCenterXPct: 50,
    };
  }

  if (
    (capacityMl != null && capacityMl > 30) ||
    (heightWithCapMm != null && heightWithCapMm >= 142) ||
    (heightWithoutCapMm != null && heightWithoutCapMm >= 120)
  ) {
    return {
      family: "cylinder",
      profileId: "cylinder-tall",
      profileLabel: "Cylinder Tall",
      relativeScaleZoneId: "large-cylinder",
      relativeScaleZoneLabel: "Large Cylinder bottles",
      fillHeightPct: measuredHeightMm != null && measuredHeightMm >= 170 ? 82 : 80,
      fillHeightRangePct: { min: 80, max: 84 },
      fillWidthPct: 56,
      baselinePct: 9,
      primaryObjectCenterXPct: 50,
    };
  }

  if (isSlimTallCylinderProduct(input)) {
    return {
      family: "cylinder",
      profileId: "cylinder-standard",
      profileLabel: "Cylinder Standard",
      relativeScaleZoneId: "standard-cylinder",
      relativeScaleZoneLabel: "Standard Cylinder bottles",
      fillHeightPct: resolveStandardCylinderFillHeightPct(measuredHeightMm),
      fillHeightRangePct: { min: 72, max: 78 },
      fillWidthPct: 60,
      baselinePct: 9,
      primaryObjectCenterXPct: 50,
    };
  }

  if (
    (capacityMl != null && capacityMl < 10) ||
    (measuredHeightMm != null && measuredHeightMm < 90)
  ) {
    return {
      family: "cylinder",
      profileId: "cylinder-standard",
      profileLabel: "Cylinder Standard",
      relativeScaleZoneId: "small-cylinder",
      relativeScaleZoneLabel: "Small Cylinder bottles",
      fillHeightPct: resolveSmallCylinderFillHeightPct(measuredHeightMm),
      fillHeightRangePct: { min: 60, max: 64 },
      fillWidthPct: 60,
      baselinePct: 9,
      primaryObjectCenterXPct: 50,
    };
  }

  return {
    family: "cylinder",
    profileId: "cylinder-standard",
    profileLabel: "Cylinder Standard",
    relativeScaleZoneId: "standard-cylinder",
    relativeScaleZoneLabel: "Standard Cylinder bottles",
    fillHeightPct: 76,
    fillHeightRangePct: { min: 72, max: 78 },
    fillWidthPct: 60,
    baselinePct: 9,
    primaryObjectCenterXPct: 50,
  };
}

function tryParseBareGlassHeightMm(value: string | number | null | undefined): number | null {
  if (value == null || (typeof value === "string" && value.trim() === "")) {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  const match = value.match(/(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const parsed = Number.parseFloat(match[1]!);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function requireBareGlassHeightMm(value: string | number | null | undefined): number {
  const parsed = tryParseBareGlassHeightMm(value);
  if (parsed == null) {
    throw new Error("A verified positive bare-glass heightWithoutCap is required.");
  }
  return parsed;
}

function resolveLegacyFamilyRig(input: FamilyRigProductInput): FamilyRigConfig | null {
  if (isSampleVialProduct(input)) {
    return cylinderProfile(input);
  }
  if (isRollerBottleProduct(input)) {
    return {
      family: "roller-bottle",
      profileId: "roller-bottle",
      profileLabel: "Roller Bottle",
      relativeScaleZoneId: "roller-bottle",
      relativeScaleZoneLabel: "Roller bottles",
      fillHeightPct: 68,
      fillHeightRangePct: { min: 65, max: 70 },
      fillWidthPct: 58,
      baselinePct: 9,
      primaryObjectCenterXPct: 50,
    };
  }
  if (isCylinderProduct(input)) {
    return cylinderProfile(input);
  }
  return getFamilyRig(input.family ?? input.bottleCollection);
}

export function getFamilyRigForProduct(input?: FamilyRigProductInput | null): FamilyRigConfig | null {
  if (!input) return null;

  const rig = resolveLegacyFamilyRig(input);
  if (!rig) return null;

  const lock = resolveShoulderLock({
    family: input.family,
    bottleCollection: input.bottleCollection,
    graceSku: input.sku,
    sku: input.sku,
    websiteSku: input.websiteSku,
    itemName: input.name,
    name: input.name,
    capacity: input.capacity,
    capacityMl: input.capacityMl,
    heightWithoutCap: input.heightWithoutCap,
    applicator: input.applicator,
  });
  if (lock) {
    return applyShoulderLockTarget(
      rig,
      lock,
      tryParseBareGlassHeightMm(input.heightWithoutCap),
      tryParseBareGlassHeightMm(input.heightWithCap),
    );
  }

  const isCylinder = isCylinderFamilyAlias(input.family ?? input.bottleCollection);
  if (isCylinder && input.requireScaleCard) {
    throw new Error(
      `Shoulder lock is required for Cylinder masters. Missing lock for family=${input.family ?? input.bottleCollection ?? "unknown"} capacity=${input.capacityMl ?? input.capacity ?? "unknown"}.`,
    );
  }

  const heightWithoutCapMm = tryParseBareGlassHeightMm(input.heightWithoutCap);
  if (heightWithoutCapMm == null) {
    if (input.requireScaleCard) {
      requireBareGlassHeightMm(input.heightWithoutCap);
    }
    // Non-master lanes: legacy assembled profile without scale-card overwrite.
    return rig;
  }

  return applyScaleCardGlassTarget(
    rig,
    heightWithoutCapMm,
    tryParseBareGlassHeightMm(input.heightWithCap),
  );
}

export function hasFamilyRig(family?: string | null): boolean {
  return getFamilyRig(family) !== null;
}

export function computeRigFitScale(
  cfg: FamilyRigConfig,
  boxWidthPx: number,
  boxHeightPx: number,
  canvasWidthPx: number,
  canvasHeightPx: number,
): number {
  if (boxWidthPx <= 0 || boxHeightPx <= 0) return 1;
  const scaleH = (cfg.fillHeightPct / 100) * canvasHeightPx / boxHeightPx;
  const scaleW = (cfg.fillWidthPct / 100) * canvasWidthPx / boxWidthPx;
  return Math.min(scaleH, scaleW);
}

export type RigCapState = "assembled" | "detached";

export interface BuildRigBlockInput {
  family: string;
  capState: RigCapState;
  rig?: FamilyRigConfig | null;
}

function formatFamilyLabel(cfg: FamilyRigConfig): string {
  if (cfg.family === "universal-pdp") return "Universal PDP";
  return (cfg.profileLabel ?? cfg.family)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function buildImposedRigBlock(input: BuildRigBlockInput): string | null {
  const cfg = input.rig ?? getFamilyRig(input.family);
  if (!cfg) return null;

  const familyLabel = formatFamilyLabel(cfg);
  const baselineLow = cfg.baselinePct - 1;
  const baselineHigh = cfg.baselinePct + 1;
  const assembledRangeLine = cfg.fillHeightRangePct
    ? ` Keep final assembled QA inside the approved ${cfg.fillHeightRangePct.min}-${cfg.fillHeightRangePct.max}% fill-height range.`
    : "";
  const glassRangeLine = cfg.glassHeightRangePct
    ? ` Keep bare-glass QA inside ${cfg.glassHeightRangePct.min}-${cfg.glassHeightRangePct.max}%.`
    : "";
  const scaleContractLabel =
    typeof cfg.scaleContractVersion === "string" && cfg.scaleContractVersion.length > 0
      ? cfg.scaleContractVersion
      : "best-bottles-scale-card-v2";
  const measurementParts = [
    typeof cfg.bareGlassHeightMm === "number"
      ? `heightWithoutCap = ${cfg.bareGlassHeightMm} mm`
      : null,
    typeof cfg.assembledHeightMm === "number"
      ? `heightWithCap = ${cfg.assembledHeightMm} mm`
      : null,
  ].filter((value): value is string => Boolean(value));
  const shoulderLockClause =
    typeof cfg.shoulderTargetPct === "number" &&
    typeof cfg.shoulderYFromTopPct === "number" &&
    typeof cfg.glassBodyKey === "string" &&
    typeof cfg.scaleTag === "string"
      ? [
        ...(measurementParts.length > 0
          ? [
            `- CATALOG MEASUREMENTS (Convex product truth): ${measurementParts.join("; ")}. These millimeters describe the physical bottle. They do not choose the on-canvas percentage.`,
          ]
          : []),
        `- SHOULDER LOCK (${scaleContractLabel} · ${cfg.glassBodyKey}): seat the glass foot on the shared 91% baseline. The glass shoulder — where the body ends and the neck begins, or where glass meets the cap/collar — MUST land at ${cfg.shoulderTargetPct}% of canvas height above that baseline (${cfg.shoulderYFromTopPct}% down from the top of the canvas). Every SKU that shares this glass body (${cfg.scaleTag}) uses this same shoulder horizon. Fitments (roller, sprayer, pump, cap) rise above the shoulder by their real physical height; do not scale the bottle to the top of the fitment.`,
        "- Do not use assembled envelope or fitment top as the scale driver.",
      ]
      : [];
  const bareGlassClause =
    shoulderLockClause.length === 0 &&
    typeof cfg.glassHeightPct === "number" &&
    typeof cfg.targetBodyHeightPx === "number" &&
    typeof cfg.bareGlassHeightMm === "number" &&
    typeof cfg.scaleTag === "string"
      ? [
        `- SCALE-CARD BARE GLASS (authoritative body size — ${scaleContractLabel}): bare-glass heightWithoutCap = ${cfg.bareGlassHeightMm} mm → ecommerce band ${cfg.scaleTag}; foot-to-rim glass height MUST equal ${cfg.glassHeightPct}% of canvas height = ${cfg.targetBodyHeightPx}px. Seat the glass foot on the shared 91% baseline (9% up from the canvas bottom). This percentage is bare glass only — never treat it as the full assembly (glass + cap/applicator) height.${glassRangeLine} Scale the bottle body to this fill target; do not copy a tiny reference footprint or leave large empty canvas around a short bottle.`,
      ]
      : [];
  const scaleDriverClause = shoulderLockClause.length > 0 ? shoulderLockClause : bareGlassClause;
  const assembledFramingLine =
    shoulderLockClause.length > 0
      ? "- Fitments rise above the locked shoulder by their real physical height. Do not treat the full assembly (glass + cap/applicator) as the scale driver."
      : bareGlassClause.length > 0 &&
          typeof cfg.assembledHeightMm === "number" &&
          typeof cfg.assembledHeightPct === "number" &&
          typeof cfg.assembledHeightPx === "number"
        ? `- ASSEMBLED HEIGHT (hard maximum): catalog heightWithCap = ${cfg.assembledHeightMm} mm. At this bottle's calibrated glass scale, the bottle plus installed cap/applicator must be no taller than ${cfg.assembledHeightPct}% of the canvas = ${cfg.assembledHeightPx}px, from the shared bottle-foot baseline to the highest installed component. Do not use the scale-card curve again for this assembled envelope; use the same local pixels/mm established by the bare glass. Exceeding ${cfg.assembledHeightMm + 2} mm equivalent is a QA failure.`
        : bareGlassClause.length > 0
          ? `- Assembled framing is unverified because catalog heightWithCap is unavailable. Do not infer full-assembly height from the legacy ${cfg.fillHeightPct}% framing hint.`
          : `- Render the product at the resolved ${familyLabel} PDP framing target. Fit the full assembly within ~${cfg.fillHeightPct}% of the canvas height and ~${cfg.fillWidthPct}% of the width, centered, with comfortable even margins.${assembledRangeLine}`;
  const placementLines = input.capState === "detached"
    ? [
      "- Keep the primary bottle BODY centered on the canvas vertical centerline. The detached component does not shift the primary bottle.",
      "- Treat the detached cap as a controlled right-sidecar component, not part of a group-centering calculation.",
      "- If Image 1 intentionally shows a detached pump, applicator, wand, dropper, or closure outside the bottle, treat that external component as the right-sidecar object on the shared baseline. It must not shift the primary bottle and must not be duplicated inside the bottle.",
      "- Place the DETACHED cap upright in the right sidecar zone. Seat the cap bottom on the EXACT SAME horizontal baseline as the bottle base; their bottom contact pixels should align within ~6 px.",
      "- Keep a clean, even gap of about 6-10% of canvas width between the bottle's widest right edge and the cap's left edge. Do not let the cap drift far away, tuck behind the bottle, or overlap the bottle.",
      "- Keep the cap's vertical axis parallel to the bottle. Scale it as the real matching cap for this bottle: not tiny, not oversized, and with the cap top around the bottle shoulder/lower-neck zone unless the reference product proves otherwise.",
      "- For sprayer / pump cap-off SKUs, the bottle top is the exposed sprayer, pump, actuator/nozzle, collar, and dip tube assembly seated on the bottle. That top assembly is NOT a detached cap and must not become a second loose object.",
      "- For sprayer / pump cap-off SKUs, the only detached object is the matching over-cap beside the bottle. Do not render a second loose cap, duplicate cap shell, ghost cap outline, or extra cap-like cylinder.",
      "- For roll-on / roller-ball SKUs, keep the exposed roller ball plug seated on the bottle neck centerline. The roller plug/ball belongs to the bottle and must not drift sideways, rise above the neck, or turn into a second detached object.",
      "- For roll-on / roller-ball cap-off SKUs, do not render a full cap still attached on top of the bottle. The bottle top must show the exposed roller ball plug/applicator only; the matching over-cap is the single detached cap beside the bottle.",
      "- For roll-on / roller-ball SKUs, the detached object is the matching over-cap only. Keep that over-cap upright to the right, on the shared baseline, with the same cap scale and gap across all cap-color variants.",
      "- The bottle, detached cap, and their contact shadows share one continuous studio floor line and one camera scale.",
    ]
    : [
      "- Place the assembled bottle centered on the canvas vertical centerline, standing upright on the baseline.",
      "- Assembled/cap-on means exactly ONE product object: no detached cap, no loose cap beside the bottle, no extra cap-like cylinder, and no duplicate cap shell.",
    ];

  return [
    `IMPOSED STUDIO RIG - ${familyLabel.toUpperCase()} (COMPOSITION AUTHORITY, OVERRIDES REFERENCE FRAMING):`,
    "- This rig defines composition. It SUPERSEDES any earlier instruction to preserve, match, or stay within tolerance of the reference image's centerline, baseline, crop, footprint, framing, padding, or scale.",
    "- Still locked to the reference (do NOT change these): product geometry, silhouette, proportions, height-to-width ratio, colors, component shapes, cap-on vs cap-off state, number of components, and material identity. The reference governs WHAT the product is; this rig governs WHERE and HOW it sits on the canvas.",
    `- Baseline: seat the bottle base's visible bottom contact pixels at ${baselineLow}-${baselineHigh}% up from the canvas bottom. Every ${familyLabel} SKU shares this one horizontal shelf line. Do not lift the bottle base above this shelf line or let it float in the frame.`,
    ...placementLines,
    ...scaleDriverClause,
    assembledFramingLine,
    "- Surface rule: flat Bone background only. No mirror reflection, no glossy floor, no reflective tabletop, no rectangular studio plate, no inner background rectangle, no visible paper edge, no texture patch, and no second background color.",
    shoulderLockClause.length > 0
      ? "- Ecommerce fill is mandatory: the SHOULDER LOCK horizon above must dominate the canvas. Do not leave the product tiny with excessive empty margins, and do not crop any part (cap, base, applicator, detached cap, or grounding shadow)."
      : bareGlassClause.length > 0
        ? "- Ecommerce fill is mandatory: the SCALE-CARD BARE GLASS height above must dominate the canvas. Do not leave the product tiny with excessive empty margins, and do not crop any part (cap, base, applicator, detached cap, or grounding shadow)."
        : "- Do not leave the product tiny with excessive empty margins, and do not crop any part (cap, base, applicator, detached cap, or grounding shadow).",
    "- FINAL ALIGNMENT QA: before accepting the image, seat the bottle base and any detached cap bottom on the shared rig baseline; no sibling variant may float higher, sink lower, or use a different floor line.",
    "- Same fixed studio rig for the whole family: identical camera distance, lens, optical compression, baseline, and centerline. Only the purchasable component differences change between siblings.",
  ].join("\n");
}
