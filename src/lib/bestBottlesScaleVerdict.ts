/**
 * Pipeline QA verdict for a Best Bottles catalog hero.
 *
 * Background (2026-09-17): the rig's `framingQa.measurements.glassHeightPct`
 * is NOT a pixel measurement. `deriveGlassBodyControlBounds` multiplies the
 * detected object height by the catalog ratio heightWithoutCap/heightWithCap,
 * the rig scales the frame so that derived box equals the target, and framing
 * QA reads the same derived box back — so it equals the target by
 * construction. Grading it against the target is a tautology and produced
 * green "pass" badges on renders that were visibly oversized.
 *
 * The Image Library must not invent a second QA policy. It mirrors the
 * reconciliation lifecycle and framing decision produced by the pipeline.
 * Scale measurements are included only as evidence; they do not alter the
 * pipeline verdict in this presentation layer.
 *
 * Verdicts:
 *   fail        — pipeline lifecycle/decision/issues say it failed.
 *   pass        — pipeline recorded qa-passed + framing pass + a final URL.
 *   unverified  — pipeline is pending, normalizing, or otherwise non-terminal.
 */

import { resolveBestBottlesGlassScale } from "@/config/bestBottlesCatalogScale";
import { parseDimensionMm } from "@/lib/product-image/skuInjector";

export type BestBottlesScaleVerdictKind = "pass" | "fail" | "unverified";

export interface BestBottlesScaleVerdictReconciliation {
  lifecycle_state: string | null;
  final_image_url: string | null;
  framing_decision: string | null;
  qa_issues: readonly string[] | null;
  fill_height_pct: number | null;
  framing_qa?: {
    /** Present on stored rows; carried as evidence only — the verdict does not read it. */
    measurements?: { glassHeightPct?: number | null } | null;
    physicalScale?: {
      verdict?: string | null;
      deltaMm?: number | null;
      diameterDeltaMm?: number | null;
      assembledDeltaMm?: number | null;
      measuredAssembledHeightMm?: number | null;
      expectedAssembledHeightMm?: number | null;
      calibrationVersion?: string | null;
    } | null;
  } | null;
}

export interface BestBottlesScaleVerdictInput {
  reconciliation: BestBottlesScaleVerdictReconciliation | null | undefined;
  /** Library tags on the generated image (cap-state:*, preset:*). */
  tags?: readonly string[] | null;
  heightWithoutCap?: string | number | null;
  heightWithCap?: string | number | null;
  /** Convex `products.applicator` value. */
  applicator?: string | null;
}

export interface BestBottlesScaleVerdict {
  verdict: BestBottlesScaleVerdictKind;
  /** Short badge text, e.g. "Pipeline QA failed". */
  label: string;
  /** One-line operator explanation. */
  summary: string;
  /** Every reason, for tooltips / detail panes. */
  reasons: string[];
  /** Whether the displayed image is the rigged final (vs the raw render). */
  rigged: boolean;
  capState: "assembled" | "sidecar" | "unknown";
  /** Pixel-measured visible object height, % of canvas. */
  visibleHeightPct: number | null;
  /** Visible height converted through the scale card, mm. */
  visibleHeightMm: number | null;
  /** Catalog height the visible object should match, when nameable. */
  expectedVisibleMm: number | null;
  expectedVisiblePct: number | null;
  glassTargetPct: number | null;
  scaleDeltaMm: number | null;
  diameterDeltaMm: number | null;
  assembledDeltaMm: number | null;
  calibrationVersion: string | null;
  physicalScaleVerdict: string | null;
}

function parseMm(value: string | number | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  const parsed = parseDimensionMm(typeof value === "string" ? value : null);
  return parsed != null && parsed > 0 ? parsed : null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function resolveCapState(tags: readonly string[] | null | undefined): BestBottlesScaleVerdict["capState"] {
  for (const raw of tags ?? []) {
    const tag = String(raw ?? "").trim().toLowerCase();
    if (tag === "cap-state:assembled") return "assembled";
    if (tag === "cap-state:sidecar") return "sidecar";
  }
  return "unknown";
}

/** mm → % of canvas through the scale card (piecewise, same as the rig). */
function mmToPct(mm: number): number {
  return resolveBestBottlesGlassScale(mm).glassHeightPct;
}

/** % of canvas → mm, inverting the scale card locally around the glass target. */
function pctToMm(pct: number, glassMm: number, glassPct: number): number {
  return round1((pct / glassPct) * glassMm);
}

export function resolveBestBottlesScaleVerdict(
  input: BestBottlesScaleVerdictInput,
): BestBottlesScaleVerdict | null {
  const row = input.reconciliation;
  if (!row) return null;

  const glassMm = parseMm(input.heightWithoutCap);
  const assembledMm = parseMm(input.heightWithCap);
  const capState = resolveCapState(input.tags);
  const rigged = Boolean(row.final_image_url);
  const qaIssues = (row.qa_issues ?? []).map((issue) => String(issue));
  const visiblePct =
    typeof row.fill_height_pct === "number" && Number.isFinite(row.fill_height_pct)
      ? round1(row.fill_height_pct)
      : null;
  const glassTargetPct = glassMm != null ? mmToPct(glassMm) : null;
  const visibleMm =
    visiblePct != null && glassMm != null && glassTargetPct != null
      ? pctToMm(visiblePct, glassMm, glassTargetPct)
      : null;
  const physicalScale = row.framing_qa?.physicalScale;
  const scaleDeltaMm =
    typeof physicalScale?.deltaMm === "number" &&
    Number.isFinite(physicalScale.deltaMm)
      ? round1(physicalScale.deltaMm)
      : null;
  const calibrationVersion =
    typeof physicalScale?.calibrationVersion === "string"
      ? physicalScale.calibrationVersion
      : null;
  const physicalScaleVerdict =
    typeof physicalScale?.verdict === "string" ? physicalScale.verdict : null;
  const diameterDeltaMm =
    typeof physicalScale?.diameterDeltaMm === "number" &&
    Number.isFinite(physicalScale.diameterDeltaMm)
      ? round1(physicalScale.diameterDeltaMm)
      : null;
  const assembledDeltaMm =
    typeof physicalScale?.assembledDeltaMm === "number" &&
    Number.isFinite(physicalScale.assembledDeltaMm)
      ? round1(physicalScale.assembledDeltaMm)
      : null;
  const expectedVisiblePct =
    assembledMm != null && glassMm != null && glassTargetPct != null
      ? round1(glassTargetPct * (assembledMm / glassMm))
      : null;

  const base = {
    rigged,
    capState,
    visibleHeightPct: visiblePct,
    visibleHeightMm: visibleMm,
    glassTargetPct,
    scaleDeltaMm,
    diameterDeltaMm,
    assembledDeltaMm,
    calibrationVersion,
    physicalScaleVerdict,
  };

  const fail = (summary: string, reasons: string[], expected?: { mm: number; pct: number }): BestBottlesScaleVerdict => ({
    verdict: "fail",
    label: "Pipeline QA failed",
    summary,
    reasons,
    ...base,
    expectedVisibleMm: expected?.mm ?? assembledMm,
    expectedVisiblePct: expected?.pct ?? expectedVisiblePct,
  });

  // Defense in depth for stale/cached reconciliation rows: the Library must
  // never display green when the visible assembly exceeds heightWithCap by
  // more than the explicit 2 mm maximum.
  if (
    visibleMm != null &&
    assembledMm != null &&
    visibleMm > assembledMm + 2
  ) {
    const overageMm = round1(visibleMm - assembledMm);
    return fail(
      `Visible assembled height ${visibleMm} mm exceeds the catalog maximum.`,
      [
        `Catalog heightWithCap=${assembledMm} mm.`,
        `Measured visible assembly=${visibleMm} mm (over by ${overageMm} mm).`,
        `Hard maximum=${assembledMm + 2} mm.`,
      ],
      expectedVisiblePct != null
        ? { mm: assembledMm, pct: expectedVisiblePct }
        : undefined,
    );
  }

  // Mirror the pipeline after enforcing the catalog-height safety invariant.
  if (!rigged || row.lifecycle_state === "qa-failed") {
    return fail(
      "Pipeline QA failed — this is the raw render, not a completed rigged final.",
      qaIssues.length > 0 ? qaIssues : ["The rig did not persist a final image for this render."],
    );
  }
  if (row.framing_decision === "reject") {
    return fail(
      "Pipeline framing rejected this render.",
      ["framing_decision=reject"],
    );
  }
  if (row.lifecycle_state !== "qa-passed" || row.framing_decision !== "pass") {
    return {
      verdict: "unverified",
      label: "Pipeline QA pending",
      summary: `Pipeline status: ${row.lifecycle_state}; framing: ${row.framing_decision ?? "not recorded"}${scaleDeltaMm != null ? `; glass height delta ${scaleDeltaMm} mm` : ""}${diameterDeltaMm != null ? `; diameter delta ${diameterDeltaMm} mm` : ""}${assembledDeltaMm != null ? `; assembled height delta ${assembledDeltaMm} mm` : ""}.`,
      reasons: [
        `lifecycle_state=${row.lifecycle_state}`,
        `framing_decision=${row.framing_decision ?? "null"}`,
        ...qaIssues,
      ],
      ...base,
      expectedVisibleMm: assembledMm,
      expectedVisiblePct,
    };
  }
  if (qaIssues.length > 0) {
    return fail("Pipeline QA recorded blocking issues on this render.", qaIssues);
  }
  return {
    verdict: "pass",
    label: "Pipeline QA passed",
    summary: `Pipeline QA passed. Baseline and framing were accepted${scaleDeltaMm != null ? `; glass height delta ${scaleDeltaMm} mm` : ""}${diameterDeltaMm != null ? `; diameter delta ${diameterDeltaMm} mm` : ""}${assembledDeltaMm != null ? `; assembled height delta ${assembledDeltaMm} mm` : ""}.`,
    reasons: ["lifecycle_state=qa-passed", "framing_decision=pass"],
    ...base,
    expectedVisibleMm: assembledMm,
    expectedVisiblePct,
  };
}
