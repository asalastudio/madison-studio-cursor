#!/usr/bin/env tsx
/**
 * Propose the shared glass bodies for a family, and flag catalog rows whose
 * stated capacity contradicts their measurements.
 *
 * This is the manual work that gates every family after Cylinder: the Sep 7
 * Cylinder shoulder lock has 14 glass bodies that were derived by hand from
 * measurements, and none of the other 35 families have that table yet. The
 * measurements alone will not give it to you — Slim reports 10 distinct
 * height x diameter pairs for what is almost certainly 3 bottles, because some
 * rows carry the known junk diameters (72/78 mm) and some carry a capacity that
 * disagrees with the millimetres.
 *
 * Output is a REVIEWED ARTIFACT, not a lock. Nothing here writes to Convex, to
 * Supabase, or to the shoulder-lock table; `resolveShoulderLock` remains the
 * authority at generation time and still fails closed on unknown bodies.
 *
 *   npx tsx scripts/best-bottles/qualify-family-bodies.ts --family Slim
 *   npx tsx scripts/best-bottles/qualify-family-bodies.ts --family Slim --dry-run
 *
 * Flags: --family <name> (required) --out <path> --limit <n> --concurrency <n>
 *        --dry-run (build candidates and print the plan, call nothing)
 */
import "dotenv/config";

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  type JevQuestion,
  askJev,
  resolveJevApiKey,
  routeByConfidence,
} from "../../src/lib/bestBottlesJev";

const CONVEX_SNAPSHOT =
  "/Users/jordanrichter/Projects/Clients/Nemat-International/Best-Bottles-Website-02-20-2026/data/audits/2026-06-27-framing-profiles/convex_snapshot.json";

/** Diameters the canonical-truth reconciliation records as junk copies. */
const KNOWN_JUNK_DIAMETERS_MM = new Set([72, 78]);

type Product = {
  graceSku?: string;
  websiteSku?: string;
  family?: string;
  capacityMl?: number;
  itemName?: string;
  heightWithoutCap?: string | number | null;
  heightWithCap?: string | number | null;
  diameter?: string | number | null;
  applicator?: string | null;
};

const getArg = (flag: string, fallback = "") => {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1]! : fallback;
};
const family = getArg("--family");
const dryRun = process.argv.includes("--dry-run");
const limit = Number(getArg("--limit", "0")) || 0;
const concurrency = Number(getArg("--concurrency", "6")) || 6;
const outPath = resolve(
  getArg("--out", `tmp/bestbottles-generation/${family.toLowerCase().replace(/\s+/g, "-")}-body-proposal.json`),
);

if (!family) {
  console.error("--family is required, e.g. --family Slim");
  process.exit(1);
}

const mm = (value: string | number | null | undefined): number | null => {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  const match = String(value ?? "").match(/(\d+(?:\.\d+)?)/);
  const parsed = match ? Number.parseFloat(match[1]!) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const products = (JSON.parse(readFileSync(CONVEX_SNAPSHOT, "utf8")).products as Product[]).filter(
  (p) => (p.family ?? "").toLowerCase() === family.toLowerCase(),
);
if (products.length === 0) {
  console.error(`No products in the snapshot for family "${family}".`);
  process.exit(1);
}

/**
 * Candidate bodies come from the data, not from Jev: cluster by capacity and
 * take the modal height/diameter. A model is not needed to count, and a fixed
 * option list is what makes the per-SKU Choice answerable.
 */
type Candidate = { key: string; capacityMl: number; heightMm: number; diameterMm: number; support: number };
const byCapacity = new Map<number, Product[]>();
for (const product of products) {
  const capacity = product.capacityMl;
  if (typeof capacity !== "number") continue;
  byCapacity.set(capacity, [...(byCapacity.get(capacity) ?? []), product]);
}

const modal = (values: number[]): number => {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]![0];
};

const candidates: Candidate[] = [];
for (const [capacityMl, rows] of [...byCapacity.entries()].sort((a, b) => a[0] - b[0])) {
  const heights = rows.map((r) => mm(r.heightWithoutCap)).filter((v): v is number => v != null);
  // Junk diameters would win the mode outright in families where a whole
  // closure type carries them, so drop them before taking the mode.
  const diameters = rows
    .map((r) => mm(r.diameter))
    .filter((v): v is number => v != null && !KNOWN_JUNK_DIAMETERS_MM.has(Math.round(v)));
  if (heights.length === 0 || diameters.length === 0) continue;
  candidates.push({
    key: `${family.toLowerCase()}:${capacityMl}-standard`,
    capacityMl,
    heightMm: modal(heights),
    diameterMm: modal(diameters),
    support: rows.length,
  });
}

const criteria: Record<string, string> = Object.fromEntries(
  candidates.map((c) => [
    c.key,
    `The ${c.capacityMl} ml ${family} bottle: about ${c.heightMm} mm of bare glass from foot to shoulder and about ${c.diameterMm} mm across.`,
  ]),
);
criteria["none-of-these"] =
  "The product is not a bottle of any of the listed sizes, or is a component, closure, or accessory rather than a bottle.";

const questions = {
  body: {
    type: "choice",
    instructions:
      "Which glass body does this product use? Judge from the product name, which states the capacity, " +
      "and treat the measurements as supporting evidence that may be wrong.",
    criteria,
  },
  measurementsAgree: {
    type: "noul",
    instructions:
      "The measured dimensions are consistent with the capacity stated in the product name. " +
      "They are inconsistent if, for example, the name says 100 ml but the dimensions match a 50 ml bottle.",
  },
  bulbAssembly: {
    type: "noul",
    instructions:
      "This product has a vintage-style rubber squeeze bulb atomizer whose bulb hangs away from the " +
      "bottle on a cord or hose, rather than a closure that sits directly on the bottle neck.",
  },
  separateComponent: {
    type: "noul",
    instructions:
      "This listing is a standalone closure, cap, pump, sprayer or accessory sold on its own, rather than a bottle.",
  },
} satisfies Record<string, JevQuestion>;

const targets = limit > 0 ? products.slice(0, limit) : products;

console.log(`=== ${family}: ${products.length} SKUs, ${candidates.length} candidate glass bodies ===`);
for (const c of candidates) {
  console.log(`  ${c.key.padEnd(24)} ${String(c.heightMm).padStart(4)} x ${String(c.diameterMm).padStart(3)} mm   ${c.support} SKUs`);
}
console.log(`asking ${Object.keys(questions).length} questions of ${targets.length} SKUs, concurrency ${concurrency}`);

if (dryRun) {
  console.log("\nDRY RUN — no Jev calls, nothing written.");
  process.exit(0);
}

const apiKey = resolveJevApiKey();
type Row = {
  graceSku: string;
  websiteSku: string | null;
  itemName: string;
  statedCapacityMl: number | null;
  measuredHeightMm: number | null;
  measuredDiameterMm: number | null;
  proposedBody: string;
  bodyConfidence: number | null;
  routing: ReturnType<typeof routeByConfidence>;
  measurementsAgree: number | null;
  bulbAssembly: number | null;
  separateComponent: number | null;
  flags: string[];
};

const rows: Row[] = [];
const started = Date.now();
let inputTokens = 0;

for (let index = 0; index < targets.length; index += concurrency) {
  const batch = targets.slice(index, index + concurrency);
  const answered = await Promise.all(
    batch.map(async (product) => {
      const measuredHeightMm = mm(product.heightWithoutCap);
      const measuredDiameterMm = mm(product.diameter);
      const response = await askJev(
        {
          productName: product.itemName ?? "",
          statedCapacityMl: product.capacityMl ?? null,
          measuredBareGlassHeightMm: measuredHeightMm,
          measuredDiameterMm,
          applicator: product.applicator ?? "unspecified",
        },
        questions,
        { apiKey },
      );
      inputTokens += response.usage?.input_tokens ?? 0;
      return { product, response, measuredHeightMm, measuredDiameterMm };
    }),
  );

  for (const { product, response, measuredHeightMm, measuredDiameterMm } of answered) {
    const body = response.answers.body;
    const flags: string[] = [];
    if ((response.answers.measurementsAgree.noul ?? 1) < 0.5) flags.push("capacity-contradicts-measurements");
    if ((response.answers.bulbAssembly.noul ?? 0) >= 0.5) flags.push("bulb-assembly");
    if ((response.answers.separateComponent.noul ?? 0) >= 0.5) flags.push("not-a-bottle");
    if (body.choice === "none-of-these") flags.push("no-candidate-body");
    if (measuredDiameterMm != null && KNOWN_JUNK_DIAMETERS_MM.has(Math.round(measuredDiameterMm))) {
      flags.push("known-junk-diameter");
    }
    rows.push({
      graceSku: product.graceSku ?? "",
      websiteSku: product.websiteSku ?? null,
      itemName: product.itemName ?? "",
      statedCapacityMl: product.capacityMl ?? null,
      measuredHeightMm,
      measuredDiameterMm,
      proposedBody: body.choice ?? "unknown",
      bodyConfidence: body.confidence ?? null,
      routing: routeByConfidence(body.confidence),
      measurementsAgree: response.answers.measurementsAgree.noul ?? null,
      bulbAssembly: response.answers.bulbAssembly.noul ?? null,
      separateComponent: response.answers.separateComponent.noul ?? null,
      flags,
    });
  }
  process.stdout.write(".");
}

const tally = <T extends string>(values: T[]) =>
  values.reduce<Record<string, number>>((acc, v) => ({ ...acc, [v]: (acc[v] ?? 0) + 1 }), {});

const byBody = tally(rows.map((r) => r.proposedBody));
const byRouting = tally(rows.map((r) => r.routing));
const flagged = rows.filter((r) => r.flags.length > 0);

console.log(`\n\n${rows.length} SKUs in ${((Date.now() - started) / 1000).toFixed(1)}s, ${inputTokens} input tokens\n`);
console.log("proposed glass bodies:");
for (const [body, count] of Object.entries(byBody).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(4)}  ${body}`);
}
console.log(`\nrouting: ${JSON.stringify(byRouting)}`);
console.log(`flagged for review: ${flagged.length}`);
for (const row of flagged.slice(0, 20)) {
  console.log(
    `  ${row.graceSku.padEnd(26)} ${row.flags.join(",").padEnd(42)} ${row.measuredHeightMm}x${row.measuredDiameterMm}mm  ${row.itemName.slice(0, 60)}`,
  );
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(
  outPath,
  `${JSON.stringify(
    {
      version: "best-bottles-jev-body-proposal-v1",
      generatedAt: new Date().toISOString(),
      family,
      model: "jev-latest",
      note:
        "PROPOSAL ONLY — reviewed artifact for deriving a family shoulder-lock table. " +
        "resolveShoulderLock remains the authority at generation time.",
      candidates,
      summary: { skus: rows.length, byBody, byRouting, flagged: flagged.length },
      rows,
    },
    null,
    2,
  )}\n`,
);
console.log(`\nwrote ${outPath}`);
