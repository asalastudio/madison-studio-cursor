#!/usr/bin/env tsx
/**
 * Run Madison's rig on an image that was generated somewhere else.
 *
 * The shoulder lock is not achieved by the image model. Across 46 locked
 * Cylinder renders the model missed the target shoulder by 221 px on average
 * (594 px worst); the RIG measures the real shoulder and re-seats the bottle,
 * landing within ~1 px. The prompt asks, the model approximates, the rig
 * enforces. So an image made outside Madison — ChatGPT's native image tool,
 * Codex, anything — is not a hero until it has been through this step.
 *
 * It runs the same `normalizeBestBottlesRigBaseline` the batch runner uses, in
 * the same browser harness, and writes two files next to the input:
 *
 *   <name>.rigged.png   2080x2288 master, bottle seated on the lock
 *   <name>.hero.png     1560x1716 deliverable, the size the website ships
 *
 * Local files only. It calls no provider and writes nothing to Supabase,
 * Convex, Shopify or the website repo. Needs the Vite harness on :8080.
 *
 *   npx tsx scripts/best-bottles/rig-external-image.ts --image out.png --sku GB-SLM-CLR-50ML-SPR-MGLD
 *
 * For a SKU missing from the catalog snapshot, describe the glass instead:
 *   --family Slim --capacity-ml 50 --applicator "Fine Mist Sprayer" --website-sku GBSlm50SpryMtGl
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, extname, join, resolve } from "node:path";

import sharp from "sharp";

import { resolveBestBottlesHeroPresentation } from "../../src/lib/bestBottlesHeroPresentation";
import { resolveBestBottlesShadowTopology } from "../../src/lib/bestBottlesShadowTopology";
import { resolveShoulderLock } from "../../src/lib/bestBottlesShoulderLock";

const require = createRequire(import.meta.url);
const SNAPSHOT =
  "/Users/jordanrichter/Projects/Clients/Nemat-International/Best-Bottles-Website-02-20-2026/data/audits/2026-06-27-framing-profiles/convex_snapshot.json";
const HARNESS = "http://127.0.0.1:8080/";

const getArg = (flag: string, fallback = "") => {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1]! : fallback;
};
const imagePath = resolve(getArg("--image"));
const sku = getArg("--sku");
if (!getArg("--image") || !existsSync(imagePath)) {
  console.error("--image <png> is required and must exist");
  process.exit(1);
}

const text = (row: Record<string, unknown>, key: string) => (row[key] == null ? null : String(row[key]));
const snapshot = existsSync(SNAPSHOT) ? (JSON.parse(readFileSync(SNAPSHOT, "utf8")).products as Array<Record<string, unknown>>) : [];
const row = sku ? snapshot.find((product) => product.graceSku === sku) ?? null : null;

const described = {
  graceSku: sku || null,
  websiteSku: getArg("--website-sku") || null,
  family: getArg("--family") || null,
  bottleCollection: getArg("--family") || null,
  capacityMl: Number(getArg("--capacity-ml")) || null,
  applicator: getArg("--applicator") || null,
  heightWithoutCap: getArg("--glass-mm") || null,
};
const base = row
  ? {
      graceSku: text(row, "graceSku"), websiteSku: text(row, "websiteSku"), itemName: text(row, "itemName"),
      itemDescription: text(row, "itemDescription"), bottleCollection: text(row, "bottleCollection"), family: text(row, "family"),
      category: text(row, "category"), color: text(row, "color"), capacityMl: Number(row.capacityMl) || null,
      applicator: text(row, "applicator"), heightWithoutCap: text(row, "heightWithoutCap"), heightWithCap: text(row, "heightWithCap"),
      diameter: text(row, "diameter"), neckThreadSize: text(row, "neckThreadSize"),
    }
  : described;
if (!base.family) {
  console.error(sku ? `${sku} is not in the catalog snapshot — describe the glass with --family and --capacity-ml.` : "Pass --sku, or describe the glass with --family and --capacity-ml.");
  process.exit(1);
}

// Fail closed, exactly as generation does: no lock means no authority to size.
const lock = resolveShoulderLock(base as never);
if (!lock) {
  console.error(`No shoulder lock for family="${base.family}" capacity=${base.capacityMl}. Lock the glass body first (build-shoulder-target-sheet.ts), then rig.`);
  process.exit(1);
}

const assembled = resolveBestBottlesHeroPresentation({ websiteSku: base.websiteSku, applicator: base.applicator }) === "assembled";
const product = {
  ...base,
  capState: assembled ? "assembled" : "detached",
  mode: assembled ? "assembled" : "fitment-attached-cap-right-sidecar",
};
const shadowTopology = resolveBestBottlesShadowTopology(product as never, {});

const meta = await sharp(imagePath).metadata();
console.log(`${basename(imagePath)}  ${meta.width}x${meta.height}  ->  ${lock.glassBodyKey} @ ${lock.shoulderPct}%  (${assembled ? "assembled" : "detached sidecar"})`);
if (meta.width !== 2080 || meta.height !== 2288) {
  console.log(`  note: not 2080x2288. The rig works at master size; resampling first (10:11 is required — a different ratio will distort).`);
}
const master = await sharp(imagePath).flatten({ background: "#F5F3EF" }).resize(2080, 2288, { fit: "fill", kernel: "lanczos3" }).png().toBuffer();
const dataUrl = `data:image/png;base64,${master.toString("base64")}`;

const { chromium } = require("playwright");
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  try {
    await page.goto(HARNESS, { waitUntil: "domcontentloaded", timeout: 20000 });
  } catch {
    console.error(`The rig harness is not answering on ${HARNESS}. Start it from the worktree: npx vite --port 8080 --strictPort`);
    process.exit(1);
  }
  const result = await page.evaluate(
    async ({ imageUrl, product, shadowTopology }: { imageUrl: string; product: Record<string, unknown>; shadowTopology: unknown }) => {
      // @ts-expect-error — resolved by Vite inside the harness page, not by tsc
      const { normalizeBestBottlesRigBaseline } = await import("/src/lib/product-image/rigPostprocess.ts");
      const rigged = await normalizeBestBottlesRigBaseline(imageUrl, {
        expectedPrimaryAspectRatio: null, ...product, shadowTopology,
        targetBackgroundHex: "#F5F3EF", maskReferenceUrl: null, requireMaskControl: false,
      });
      const { dataUrl: out, ...rest } = rigged as Record<string, unknown>;
      return { out, rest };
    },
    { imageUrl: dataUrl, product, shadowTopology },
  );

  const info = result.rest as Record<string, unknown>;
  const issues = (info.qaIssues as string[] | undefined) ?? [];
  const stem = join(dirname(imagePath), basename(imagePath, extname(imagePath)));
  const riggedBytes = Buffer.from(String(result.out).replace(/^data:image\/png;base64,/, ""), "base64");
  writeFileSync(`${stem}.rigged.png`, riggedBytes);
  await sharp(riggedBytes).flatten({ background: { r: 245, g: 243, b: 239 } }).removeAlpha()
    .resize(1560, 1716, { kernel: "lanczos3", fit: "fill" }).png({ compressionLevel: 9 }).toFile(`${stem}.hero.png`);

  console.log(`  shoulder   target Y ${info.targetShoulderYPx ?? "—"}   landed Y ${info.detectedShoulderYPx ?? "—"}   delta ${info.shoulderDeltaPct ?? "—"}%   confidence ${info.shoulderConfidence ?? "—"}`);
  console.log(`  transform  scale ${info.scale != null ? Number(info.scale).toFixed(3) : "—"}   (model was ${info.preTransformShoulderYPx != null && info.targetShoulderYPx != null ? Math.abs(Number(info.preTransformShoulderYPx) - Number(info.targetShoulderYPx)) + " px off before the rig" : "unmeasured before the rig"})`);
  console.log(`  framing    ${info.framingDecision ?? "—"}`);
  if (issues.length) {
    console.log(`\n  NOT A HERO — ${issues.length} QA issue(s):`);
    for (const issue of issues) console.log(`    - ${issue}`);
  } else {
    console.log(`\n  PASS — wrote ${basename(stem)}.rigged.png (2080x2288) and ${basename(stem)}.hero.png (1560x1716)`);
  }
  process.exitCode = issues.length ? 1 : 0;
} finally {
  await browser.close();
}
