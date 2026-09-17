import {
  getBestBottlesFamilyProfileForProduct,
  type BestBottlesFamilyProfileProductInput,
} from "@/config/bestBottlesFamilyProfiles";
import {
  BEST_BOTTLES_SCALE_CARD_VERSION,
  resolveBestBottlesGlassScale,
} from "@/config/bestBottlesCatalogScale";

/**
 * IMPOSED STUDIO RIG — single source of truth (Vite / Node runtime).
 *
 * Consumed by BOTH the in-app assembler (`promptAssembler.ts`) and the batch
 * CLI runner (`scripts/local-generate.ts`). Only place the rig geometry lives
 * on this side of the runtime wall.
 *
 * ── Runtime boundary ────────────────────────────────────────────────────
 * The Deno edge function (`supabase/functions/generate-madison-image`) cannot
 * import this file (tsconfig.app excludes the functions tree; Deno can't
 * resolve `@/`). Its twin is `supabase/functions/_shared/familyRig.ts` — keep
 * FAMILY_RIG numerically identical there.
 *
 * ── What this does (and deliberately does NOT do) ───────────────────────
 * SIZE STRATEGY DECISION (updated 2026-06-27): the generated master uses a
 * fixed studio canvas and a resolved family/profile framing target. Source
 * references are product truth, not framing truth: they can be tiny, padded,
 * or cropped differently. The rig normalizes baseline + centerline and may
 * vary fill height by profile (for example compact vs tall Cylinder).
 *
 * The rig still separates concerns cleanly:
 *   - Reference image  → IDENTITY (shape, color, material, components, cap state)
 *   - This rig         → PLACEMENT + profile framing (where + how big on canvas)
 *   - Display layer    → optional TRUE SIZE comparison in grids
 */

export interface FamilyRigConfig {
  /** Normalized family key (lowercase). */
  family: string;
  /** Optional profile id resolved from product truth, e.g. sample-vial or cylinder-standard. */
  profileId?: string;
  /** Optional human label for prompt/reporting output. */
  profileLabel?: string;
  /** Relative scale zone resolved from capacity/height metadata. */
  relativeScaleZoneId?: string;
  /** Human label for the relative scale zone. */
  relativeScaleZoneLabel?: string;
  /** Versioned global catalog scale contract applied to this product. */
  scaleContractVersion?: string;
  /** Global curve target before the bounded family correction. */
  globalTargetProductHeightPct?: number;
  /** Bounded family correction applied to the global target. */
  familyScaleCorrectionPct?: number;
  /** Reconciled body-geometry display curve, when this is a measured Cylinder. */
  geometryScaleVersion?: string;
  /**
   * The whole assembly (bottle + cap/applicator) is fit-to-box: scaled to fit
   * within this % of canvas HEIGHT and `fillWidthPct` of canvas WIDTH,
   * whichever binds (contain). Same target for every SKU in the family →
   * consistent catalog framing regardless of real size.
   */
  fillHeightPct: number;
  /** Persistent bottle-body target shared by cap-on and cap-off variants. */
  targetBodyHeightPx?: number;
  /** Accepted QA fill-height range for this resolved profile. */
  fillHeightRangePct?: { min: number; max: number };
  /** Width half of the fit-to-box (see fillHeightPct). */
  fillWidthPct: number;
  /** Bottle base seated this far up from the canvas bottom (% of height). */
  baselinePct: number;
  /** Primary bottle centerline target as % of canvas width. */
  primaryObjectCenterXPct?: number;
}

/**
 * Per-family rig configs. The fill/baseline numbers are framing aesthetics.
 * Product-aware callers can resolve a more specific family profile with
 * `getFamilyRigForProduct`; callers with only family text use these defaults.
 * Families without a custom entry use `defaultPdp`, so no Best Bottles PDP
 * master keeps source-size framing just because the family has not been
 * hand-tuned yet.
 */
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

/**
 * Resolve the rig config for a family. "Tall Cylinder" is treated as Cylinder.
 * Families without a custom rig use the universal PDP rig so their on-canvas
 * size is still normalized and never inherited from source/reference scale.
 */
export function getFamilyRig(family?: string | null): FamilyRigConfig | null {
  const f = normalizeFamily(family);
  if (isCylinderFamilyAlias(f)) return FAMILY_RIG.cylinder;
  return FAMILY_RIG[f] ?? FAMILY_RIG.defaultPdp;
}

export function getFamilyRigForProduct(
  input: BestBottlesFamilyProfileProductInput | null | undefined,
): FamilyRigConfig | null {
  const profile = getBestBottlesFamilyProfileForProduct(input);
  if (!profile) return getFamilyRig(input?.family ?? input?.bottleCollection);
  const bodyHeightMm = parseFirstNumber(input?.heightWithoutCap);
  // Scale-card v1: bare glass only. Same target for every cap state / fitment.
  // Capacity must not participate in the resolved glass size.
  if (bodyHeightMm != null) {
    const glassScale = resolveBestBottlesGlassScale(bodyHeightMm);
    return {
      family: profile.family,
      profileId: profile.id,
      profileLabel: profile.label,
      relativeScaleZoneId: profile.relativeScaleZoneId,
      relativeScaleZoneLabel: profile.relativeScaleZoneLabel,
      scaleContractVersion: BEST_BOTTLES_SCALE_CARD_VERSION,
      globalTargetProductHeightPct: glassScale.glassHeightPct,
      familyScaleCorrectionPct: 0,
      geometryScaleVersion: undefined,
      fillHeightPct: glassScale.glassHeightPct,
      targetBodyHeightPx: glassScale.targetGlassHeightPx,
      fillHeightRangePct: {
        min: Math.max(0, glassScale.glassHeightPct - 2),
        max: Math.min(100, glassScale.glassHeightPct + 2),
      },
      fillWidthPct: profile.fillWidthPct,
      baselinePct: profile.baselinePct,
      primaryObjectCenterXPct: profile.primaryObjectCenterXPct,
    };
  }
  return {
    family: profile.family,
    profileId: profile.id,
    profileLabel: profile.label,
    relativeScaleZoneId: profile.relativeScaleZoneId,
    relativeScaleZoneLabel: profile.relativeScaleZoneLabel,
    scaleContractVersion: profile.scaleContractVersion,
    globalTargetProductHeightPct: profile.globalTargetProductHeightPct,
    familyScaleCorrectionPct: profile.familyScaleCorrectionPct,
    geometryScaleVersion: profile.geometryScaleVersion,
    fillHeightPct: profile.targetProductHeightPct,
    fillHeightRangePct: profile.targetProductHeightRangePct,
    fillWidthPct: profile.fillWidthPct,
    baselinePct: profile.baselinePct,
    primaryObjectCenterXPct: profile.primaryObjectCenterXPct,
  };
}

function parseFirstNumber(value: string | null | undefined): number | null {
  const match = value?.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatFamilyLabel(cfg: FamilyRigConfig): string {
  if (cfg.family === "universal-pdp") return "Universal PDP";
  return (cfg.profileLabel ?? cfg.family)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function hasFamilyRig(family?: string | null): boolean {
  return getFamilyRig(family) !== null;
}

/**
 * Fit-to-box scale factor for the rendered foreground. Given the foreground
 * bounding-box dimensions (in canvas pixels) and the canvas size, returns the
 * scale that fits the assembly within the rig's fill box (contain — the
 * binding dimension wins). Pure math; no image deps.
 */
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

export function computePrimaryBottleRigScale(input: {
  primaryBoxWidthPx: number;
  primaryBoxHeightPx: number;
  targetBodyHeightPx: number;
  maxPrimaryWidthPx: number;
}): number {
  if (
    input.primaryBoxWidthPx <= 0
    || input.primaryBoxHeightPx <= 0
    || input.targetBodyHeightPx <= 0
    || input.maxPrimaryWidthPx <= 0
  ) {
    return 1;
  }
  const heightScale = input.targetBodyHeightPx / input.primaryBoxHeightPx;
  const widthScale = input.maxPrimaryWidthPx / input.primaryBoxWidthPx;
  return Math.min(heightScale, widthScale);
}

export type RigCapState = "assembled" | "detached";

/**
 * Build the imposed-rig prompt block. Returns null when the family has no rig.
 *
 * This block is authoritative for COMPOSITION and explicitly supersedes any
 * earlier "preserve the reference's centerline/baseline/crop/scale" language.
 * It does NOT touch geometry/material/component locks (those stay anchored to
 * the reference).
 */
export function buildImposedRigBlock(input: {
  family: string;
  capState: RigCapState;
  rig?: FamilyRigConfig | null;
}): string | null {
  const cfg = input.rig ?? getFamilyRig(input.family);
  if (!cfg) return null;

  const familyLabel = formatFamilyLabel(cfg);
  const baselineLow = cfg.baselinePct - 1;
  const baselineHigh = cfg.baselinePct + 1;
  const fillRangeLine = cfg.fillHeightRangePct
    ? ` Keep final QA inside the approved ${cfg.fillHeightRangePct.min}-${cfg.fillHeightRangePct.max}% fill-height range.`
    : "";

  const placementLines =
    input.capState === "detached"
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
    `IMPOSED STUDIO RIG — ${familyLabel.toUpperCase()} (COMPOSITION AUTHORITY, OVERRIDES REFERENCE FRAMING):`,
    "- This rig defines composition. It SUPERSEDES any earlier instruction to preserve, match, or stay within tolerance of the reference image's centerline, baseline, crop, footprint, framing, padding, or scale.",
    "- Still locked to the reference (do NOT change these): product geometry, silhouette, proportions, height-to-width ratio, colors, component shapes, cap-on vs cap-off state, number of components, and material identity. The reference governs WHAT the product is; this rig governs WHERE and HOW it sits on the canvas.",
    `- Baseline: seat the bottle base's visible bottom contact pixels at ${baselineLow}–${baselineHigh}% up from the canvas bottom. Every ${familyLabel} SKU shares this one horizontal shelf line. Do not lift the bottle base above this shelf line or let it float in the frame.`,
    ...placementLines,
    `- Render the product at the resolved ${familyLabel} PDP framing target. Fit the full assembly within ~${cfg.fillHeightPct}% of the canvas height and ~${cfg.fillWidthPct}% of the width, centered, with comfortable even margins.${fillRangeLine}`,
    "- Surface rule: flat Bone background only. No mirror reflection, no glossy floor, no reflective tabletop, no rectangular studio plate, no inner background rectangle, no visible paper edge, no texture patch, and no second background color.",
    "- Do not leave the product tiny with excessive empty margins, and do not crop any part (cap, base, applicator, detached cap, or grounding shadow).",
    "- FINAL ALIGNMENT QA: before accepting the image, seat the bottle base and any detached cap bottom on the shared rig baseline; no sibling variant may float higher, sink lower, or use a different floor line.",
    "- Same fixed studio rig for the whole family: identical camera distance, lens, optical compression, baseline, and centerline. Only the purchasable component differences change between siblings.",
  ].join("\n");
}
