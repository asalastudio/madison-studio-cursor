#!/usr/bin/env tsx
/**
 * Derive a family's shoulder-lock percentages from what was actually rendered.
 *
 * Jordan 2026-09-19: source, promote, generate -- then measure, then decide to
 * approve. That ordering is right, and it works today without a lock existing
 * first:
 *
 *  - A family with no shoulder lock still generates, on the scale-card
 *    bare-glass path (`resolveBestBottlesGlassScale`, mm -> band -> glassPct).
 *  - `rigPostprocess` persists `detected_shoulder_y_px` and
 *    `shoulder_confidence` on EVERY render. Only `target_shoulder_y_px` is
 *    gated on a lock existing, so the measurement is free either way.
 *  - Once a lock is agreed, `generate-family-batch --resume-raw-image-id`
 *    re-rigs a saved raw at zero provider cost. The family is paid for once.
 *
 * So the loop is: generate once -> measure here -> review the numbers ->
 * lock -> re-rig for free. This script is the measure step. It proposes; it
 * writes nothing to the lock table and authorises nothing.
 *
 *   npx tsx scripts/best-bottles/derive-shoulder-lock-from-renders.ts --family Cylinder
 *   npx tsx scripts/best-bottles/derive-shoulder-lock-from-renders.ts --family Slim --since 2026-09-20
 *
 * Flags: --family <name>  --since <ISO date>  --min-confidence <0-1>  --out <path>
 */
import "dotenv/config";

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

import { BEST_BOTTLES_SCALE_CARD_GENERATE_HEIGHT_PX } from "../../src/config/bestBottlesCatalogScale";
import { resolveShoulderLock } from "../../src/lib/bestBottlesShoulderLock";

const getArg = (flag: string, fallback = "") => {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1]! : fallback;
};
const family = getArg("--family");
const since = getArg("--since", "2026-01-01");
const minConfidence = Number(getArg("--min-confidence", "0.8"));
const outPath = resolve(
  getArg("--out", `tmp/bestbottles-generation/${family.toLowerCase().replace(/\s+/g, "-")}-shoulder-lock-proposal.json`),
);

if (!family) {
  console.error("--family is required");
  process.exit(1);
}

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const { data, error } = await supabase
  .from("best_bottles_image_reconciliations")
  .select("image_id,grace_sku,website_sku,catalog_truth,detected_shoulder_y_px,shoulder_confidence,framing_decision,qa_issues,created_at")
  .eq("family", family)
  .gte("created_at", since)
  .not("detected_shoulder_y_px", "is", null);
if (error) throw new Error(error.message);

const CANVAS = BEST_BOTTLES_SCALE_CARD_GENERATE_HEIGHT_PX;
const BASELINE_PCT = 91;
const baselineYPx = (BASELINE_PCT / 100) * CANVAS;

type Row = {
  graceSku: string;
  bodyKey: string;
  shoulderYPx: number;
  /** Foot-to-shoulder as a share of canvas height, which is what a lock stores. */
  shoulderPct: number;
  confidence: number;
  /** From the full per-row resolve; null when the family has no lock yet. */
  lockedShoulderPct: number | null;
};

const rows: Row[] = [];
const skipped: Array<{ graceSku: string; why: string }> = [];

for (const record of data ?? []) {
  const truth = (record.catalog_truth ?? {}) as Record<string, unknown>;
  const confidence = Number(record.shoulder_confidence ?? 0);
  if (record.framing_decision === "reject") {
    skipped.push({ graceSku: record.grace_sku, why: "framing_decision=reject" });
    continue;
  }
  if ((record.qa_issues ?? []).length > 0) {
    skipped.push({ graceSku: record.grace_sku, why: "has qa_issues" });
    continue;
  }
  if (!(confidence >= minConfidence)) {
    skipped.push({ graceSku: record.grace_sku, why: `confidence ${confidence} < ${minConfidence}` });
    continue;
  }

  // The existing lock is the authority where one exists; where it does not,
  // group by capacity so a new family still partitions.
  const lock = resolveShoulderLock({
    family,
    bottleCollection: String(truth.bottleCollection ?? family),
    capacityMl: Number(truth.capacityMl ?? Number.NaN),
    itemName: String(truth.name ?? ""),
    websiteSku: record.website_sku,
    graceSku: record.grace_sku,
    heightWithoutCap: String(truth.heightWithoutCap ?? ""),
  } as never);
  const bodyKey =
    lock?.glassBodyKey ??
    `${family.toLowerCase()}:${truth.capacityMl ?? "?"}-unlocked`;

  const shoulderYPx = Number(record.detected_shoulder_y_px);
  rows.push({
    graceSku: record.grace_sku,
    bodyKey,
    shoulderYPx,
    shoulderPct: ((baselineYPx - shoulderYPx) / CANVAS) * 100,
    confidence,
    lockedShoulderPct: lock?.shoulderPct ?? null,
  });
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

const byBody = new Map<string, Row[]>();
for (const row of rows) byBody.set(row.bodyKey, [...(byBody.get(row.bodyKey) ?? []), row]);

type Proposal = {
  glassBodyKey: string;
  samples: number;
  proposedShoulderPct: number;
  minPct: number;
  maxPct: number;
  spreadPct: number;
  lockedShoulderPct: number | null;
  deltaVsLockedPct: number | null;
  verdict: "matches-locked" | "differs-from-locked" | "new-proposal" | "too-few-samples";
};

const proposals: Proposal[] = [];
for (const [glassBodyKey, bodyRows] of [...byBody.entries()].sort()) {
  const pcts = bodyRows.map((row) => row.shoulderPct);
  const proposed = Math.round(median(pcts) * 2) / 2; // locks are recorded to 0.5%
  const locked = bodyRows[0]!.lockedShoulderPct;
  const delta = locked == null ? null : Math.round((proposed - locked) * 10) / 10;
  proposals.push({
    glassBodyKey,
    samples: bodyRows.length,
    proposedShoulderPct: proposed,
    minPct: Math.round(Math.min(...pcts) * 10) / 10,
    maxPct: Math.round(Math.max(...pcts) * 10) / 10,
    spreadPct: Math.round((Math.max(...pcts) - Math.min(...pcts)) * 10) / 10,
    lockedShoulderPct: locked,
    deltaVsLockedPct: delta,
    verdict:
      bodyRows.length < 3
        ? "too-few-samples"
        : locked == null
          ? "new-proposal"
          : Math.abs(delta ?? 0) <= 0.5
            ? "matches-locked"
            : "differs-from-locked",
  });
}

console.log(`${family}: ${rows.length} measured render(s), ${skipped.length} skipped, ${proposals.length} glass bodies\n`);
console.log("glass body".padEnd(26) + "n".padStart(4) + "proposed".padStart(10) + "locked".padStart(9) + "delta".padStart(8) + "spread".padStart(8) + "  verdict");
for (const proposal of proposals) {
  console.log(
    proposal.glassBodyKey.padEnd(26) +
      String(proposal.samples).padStart(4) +
      `${proposal.proposedShoulderPct}%`.padStart(10) +
      (proposal.lockedShoulderPct == null ? "—" : `${proposal.lockedShoulderPct}%`).padStart(9) +
      (proposal.deltaVsLockedPct == null ? "—" : `${proposal.deltaVsLockedPct > 0 ? "+" : ""}${proposal.deltaVsLockedPct}`).padStart(8) +
      `${proposal.spreadPct}`.padStart(8) +
      `  ${proposal.verdict}`,
  );
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(
  outPath,
  `${JSON.stringify(
    {
      version: "best-bottles-shoulder-lock-proposal-v1",
      generatedAt: new Date().toISOString(),
      family,
      since,
      minConfidence,
      note:
        "PROPOSAL ONLY, measured from rendered output. Nothing is locked until a human " +
        "approves; resolveShoulderLock remains the authority and still fails closed.",
      measured: rows.length,
      skipped,
      proposals,
    },
    null,
    2,
  )}\n`,
);
console.log(`\nwrote ${outPath}`);
