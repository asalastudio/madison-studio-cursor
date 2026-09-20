#!/usr/bin/env tsx
/**
 * Prove that every hero in a website release is the right image on the right
 * product.
 *
 * A hero release is an indexing step: a PNG lands in the website repo and a
 * registry row is repointed at it. Nothing in that step looks at the picture,
 * so a render filed under the wrong SKU would publish cleanly. This walks the
 * whole chain for each hero and fails loudly on any break:
 *
 *   1. registry   exactly one row carries the website SKU
 *   2. naming     the row's group slug agrees with the SKU about capacity and
 *                 fitment (a lotion-pump SKU on a reducer card is caught here)
 *   3. bytes      the file the registry URL points at hashes to the locked sha
 *   4. custody    re-deriving the deliverable from Madison's stored render for
 *                 that exact (grace SKU, website SKU) pair reproduces the same
 *                 sha — so the website file IS that SKU's Madison render
 *   5. content    the closure colour in the hero matches the Photoshop source
 *                 for that SKU (gold vs silver vs black is the realistic mix-up)
 *
 * Read-only everywhere: it writes nothing to the website repo, Supabase,
 * Convex or Shopify.
 *
 *   npx tsx scripts/best-bottles/audit-hero-release.ts --release 8
 */
import "dotenv/config";

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

import { resolveBestBottlesHeroPresentation } from "../../src/lib/bestBottlesHeroPresentation";

const CLIENT_ROOT = "/Users/jordanrichter/Projects/Clients/Nemat-International";
const getArg = (flag: string, fallback = "") => {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1]! : fallback;
};
const release = getArg("--release");
if (!release) {
  console.error("--release <n> is required");
  process.exit(1);
}
const site = getArg("--site", `${CLIENT_ROOT}/Best-Bottles-Website-02-20-2026/.claude/worktrees/sunburst-heroes-release-${release}`);
const reviewDir = join(site, "docs/reviews", `sunburst-heroes-release-${release}`);
const coveragePath = "tmp/bestbottles-generation/psd-source-coverage.json";

type LockEntry = { sha256: string };
type RegistryRow = { groupSlug: string; websiteSku: string; graceSku: string; url: string; family?: string };
const lock = JSON.parse(readFileSync(join(reviewDir, "approved-lock.json"), "utf8")) as Record<string, LockEntry>;
const registryRaw = JSON.parse(readFileSync(join(site, "src/lib/products/catalog-heroes.json"), "utf8"));
const registry = (Array.isArray(registryRaw) ? registryRaw : Object.values(registryRaw)) as RegistryRow[];
const coverage = existsSync(coveragePath)
  ? (JSON.parse(readFileSync(coveragePath, "utf8")).rows as Array<{ websiteSku: string; capOn: string | null; capOff: string | null }>)
  : [];

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);
const scratch = mkdtempSync(join(tmpdir(), "hero-audit-"));
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

/** Slug fitment token -> the segment a website SKU uses for it. */
const FITMENT_TOKENS: Array<[RegExp, RegExp, string]> = [
  [/lotionpump$/, /Ltn/, "lotion pump"],
  [/(perfumespray|finemist)$/, /Spry/, "sprayer"],
  [/reducer$/, /Rdcr/, "reducer"],
  [/rollon$/, /Roll/, "roll-on"],
  [/dropper$/, /Drp/, "dropper"],
];

/** Mean colour of the closure: foreground pixels in the top quarter of the bottle. */
async function closureColour(file: string, background: [number, number, number]) {
  const { data, info } = await sharp(file).flatten({ background: { r: background[0], g: background[1], b: background[2] } }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const ink = (i: number) => Math.max(Math.abs(data[i]! - background[0]), Math.abs(data[i + 1]! - background[1]), Math.abs(data[i + 2]! - background[2])) > 24;
  let top = -1, bottom = -1, left = info.width, right = -1;
  for (let y = 0; y < info.height; y += 2) for (let x = 0; x < info.width; x += 2) {
    if (!ink((y * info.width + x) * 3)) continue;
    if (top < 0) top = y; bottom = y; if (x < left) left = x; if (x > right) right = x;
  }
  if (top < 0) return null;
  // The bottle is the left object; stay left of the detached cap.
  const bandRight = Math.round(left + (right - left) * 0.5);
  const bandBottom = Math.round(top + (bottom - top) * 0.22);
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = top; y <= bandBottom; y++) for (let x = left; x <= bandRight; x++) {
    const i = (y * info.width + x) * 3;
    if (!ink(i)) continue;
    r += data[i]!; g += data[i + 1]!; b += data[i + 2]!; n++;
  }
  if (n < 200) return null;
  return [r / n, g / n, b / n] as [number, number, number];
}
const colourName = ([r, g, b]: [number, number, number]) => {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), light = (max + min) / 2, sat = max - min;
  if (light < 70) return "black";
  if (sat < 26) return light > 200 ? "white/clear" : "silver";
  if (r > b + 40 && g > b + 15) return r - g > 55 ? "copper" : "gold";
  return "other";
};

let failures = 0;
console.log(`release ${release} · ${Object.keys(lock).length} heroes · ${site.split("/").slice(-1)[0]}\n`);

for (const [websiteSku, entry] of Object.entries(lock).sort()) {
  const problems: string[] = [];
  const notes: string[] = [];

  // 1. registry
  const rows = registry.filter((row) => row.websiteSku === websiteSku);
  if (rows.length !== 1) problems.push(`${rows.length} registry rows carry this website SKU (expected exactly 1)`);
  const row = rows[0];

  if (row) {
    // 2. naming agreement between the card's slug and the SKU
    const slugCapacity = row.groupSlug.match(/-(\d+(?:\.\d+)?)ml-/)?.[1];
    const skuCapacities = [...websiteSku.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => m[1]);
    // The storefront's "25 ml" cylinder is the 30 ml bottle; the SKU may say either.
    const capacityAgrees = !slugCapacity || skuCapacities.includes(slugCapacity) ||
      (slugCapacity === "25" && skuCapacities.includes("30")) || (slugCapacity === "5.5" && skuCapacities.includes("5"));
    if (!capacityAgrees) problems.push(`card is ${slugCapacity} ml but the SKU reads ${skuCapacities.join("/") || "no capacity"}`);
    for (const [slugPattern, skuPattern, label] of FITMENT_TOKENS) {
      if (slugPattern.test(row.groupSlug) && !skuPattern.test(websiteSku)) problems.push(`card is a ${label} but the SKU has no ${skuPattern.source} segment`);
      if (skuPattern.test(websiteSku) && !FITMENT_TOKENS.some(([sp, kp]) => kp.source === skuPattern.source && sp.test(row.groupSlug))) {
        problems.push(`SKU is a ${label} but the card slug is "${row.groupSlug}"`);
      }
    }

    // 3. bytes on the site
    const expectedUrl = `/images/catalog/bone-review/${websiteSku}.${entry.sha256.slice(0, 12)}.png`;
    if (row.url !== expectedUrl) problems.push(`registry url is ${row.url}, expected ${expectedUrl}`);
    const siteFile = join(site, "public", row.url);
    if (!existsSync(siteFile)) problems.push("the file the registry points at does not exist");
    else if (sha256(readFileSync(siteFile)) !== entry.sha256) problems.push("site file does not hash to the locked sha");

    // 4. custody back to Madison, for this exact identity pair
    const { data: renders, error } = await supabase
      .from("best_bottles_image_reconciliations")
      .select("image_id,grace_sku,website_sku,final_image_url,created_at")
      .eq("grace_sku", row.graceSku)
      .not("final_image_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(8);
    if (error) problems.push(`Madison lookup failed: ${error.message}`);
    let custody: string | null = null;
    for (const render of renders ?? []) {
      if (String(render.website_sku ?? "").toLowerCase() !== websiteSku.toLowerCase()) continue;
      const local = join(scratch, `${render.image_id}.png`);
      execFileSync("curl", ["-s", "-o", local, render.final_image_url]);
      const rebuilt = await sharp(local).flatten({ background: { r: 245, g: 243, b: 239 } }).removeAlpha()
        .resize(1560, 1716, { kernel: "lanczos3", fit: "fill" }).png({ compressionLevel: 9 }).toBuffer();
      if (sha256(rebuilt) === entry.sha256) { custody = render.image_id; break; }
    }
    if (custody) notes.push(`Madison render ${custody.slice(0, 8)}`);
    else problems.push(`no Madison render for (${row.graceSku}, ${websiteSku}) reproduces this file`);

    // 5. content: closure colour against the Photoshop source for this SKU
    // Compare like with like: a dropper hero is drawn from the CAPPED source
    // (dropper seated in the bottle), everything else from the uncapped one.
    // Checking an assembled hero against the bare-neck file reads the glass
    // neck as a "silver closure" and raises a false alarm.
    const source = coverage.find((c) => c.websiteSku === websiteSku);
    const assembled = resolveBestBottlesHeroPresentation({ groupSlug: row.groupSlug, websiteSku }) === "assembled";
    const located = (assembled ? source?.capOn : source?.capOff) ?? null;
    if (located && existsSync(siteFile)) {
      const psd = join(CLIENT_ROOT, located.startsWith("bbuat:") ? "BBUAT-Upload-Files" : "Best-Bottles-Original-Photoshop-Sources", located.replace(/^[a-z]+:/, ""));
      const flat = join(scratch, `${websiteSku}.psd.png`);
      if (existsSync(psd)) {
        execFileSync("sips", ["-s", "format", "png", psd, "--out", flat], { stdio: "ignore" });
        const [hero, truth] = await Promise.all([closureColour(siteFile, [245, 243, 239]), closureColour(flat, [255, 255, 255])]);
        if (hero && truth) {
          const [a, b] = [colourName(hero), colourName(truth)];
          if (a !== b) problems.push(`closure reads ${a} in the hero but ${b} in the Photoshop source`);
          else notes.push(`closure ${a}`);
        }
      }
    }
  }

  failures += problems.length ? 1 : 0;
  console.log(`${problems.length ? "FAIL" : " ok "}  ${websiteSku.padEnd(26)} -> ${(row?.groupSlug ?? "?").padEnd(46)} ${notes.join(" · ")}`);
  for (const problem of problems) console.log(`        ${problem}`);
}

console.log(`\n${Object.keys(lock).length - failures} of ${Object.keys(lock).length} heroes verified end to end${failures ? ` — ${failures} FAILED` : ""}`);
process.exit(failures ? 1 : 0);
