#!/usr/bin/env tsx
/**
 * Build the adjustable shoulder-target review sheet for a family.
 *
 * A shoulder lock is one number per GLASS BODY: foot-to-shoulder as a share of
 * canvas height above the 91% baseline. The number is a visual judgement, so it
 * is set by eye on a sheet — this is the Sep 18 Cylinder target sheet, made
 * adjustable. Every hero group in the family is surfaced, grouped by body, and
 * each body has one slider that moves one shared line.
 *
 * It costs nothing to run. The bottles are the flattened uncapped Photoshop
 * sources, which is all a sizing decision needs: across every fitment on a Slim
 * body, foot-to-shoulder is identical to the pixel (1002/1002/1002/1002,
 * 1442/1443/1442, 1874/1874/1874), so one target really does cover the body.
 *
 * Only undecided work is surfaced. A hero whose glass body already has a lock
 * inherits that lock and needs no decision, so it is counted and left off the
 * sheet (`--include-locked` shows it anyway). Each card also says what is live
 * on the site for that hero today — a shoulder-locked Sunburst render, an
 * earlier Sunburst render made before the lock existed, or a legacy plate —
 * read from the website repo's `origin/main` as last fetched.
 *
 * Output goes under tmp/ — gitignored on purpose, because it contains client
 * product imagery and this repository is public. Vite serves it:
 *
 *   npx tsx scripts/best-bottles/build-shoulder-target-sheet.ts --family Slim
 *   open http://localhost:8080/tmp/bestbottles-review/slim/index.html
 *
 *   npx tsx scripts/best-bottles/build-shoulder-target-sheet.ts --all
 *   open http://localhost:8080/tmp/bestbottles-review/index.html
 *
 * Requires macOS `sips` to flatten PSDs, and the coverage artifact from
 * `index-psd-source-coverage.ts`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { BEST_BOTTLES_SCALE_CARD_HEIGHT_BANDS } from "../../src/config/bestBottlesCatalogScale";
import { resolveBestBottlesHeroPresentation } from "../../src/lib/bestBottlesHeroPresentation";
import { resolveShoulderLock } from "../../src/lib/bestBottlesShoulderLock";
import { detectGlassShoulderLandmark } from "../../src/lib/product-image/shoulderLandmark";

const CLIENT_ROOT = "/Users/jordanrichter/Projects/Clients/Nemat-International";
const SITE_REPO = `${CLIENT_ROOT}/Best-Bottles-Website-02-20-2026`;
/**
 * Sunburst releases 1-5 (2026-09-10 to 09-16) were sized from millimetres,
 * before the shoulder lock existed. Release 6 (2026-09-18) is the first whose
 * heroes were seated on a lock.
 */
const FIRST_SHOULDER_LOCKED_RELEASE = 6;
/**
 * Closures and accessories have no glass shoulder to seat. A shoulder lock is
 * the wrong instrument for them; they need their own sizing rule.
 */
const NO_SHOULDER_FAMILIES = new Set(["cap/closure", "roll-on cap", "sprayer", "lotion pump", "dropper", "tool", "packaging supply"]);
const ESTATE_ROOTS: Record<string, string> = {
  bbuat: `${CLIENT_ROOT}/BBUAT-Upload-Files`,
  original: `${CLIENT_ROOT}/Best-Bottles-Original-Photoshop-Sources`,
};
const SITE_HEROES = `${CLIENT_ROOT}/Best-Bottles-Website-02-20-2026/.claude/worktrees/sunburst-heroes-release-7/public`;
const CONVEX_SNAPSHOT = `${CLIENT_ROOT}/Best-Bottles-Website-02-20-2026/data/audits/2026-06-27-framing-profiles/convex_snapshot.json`;

/**
 * The locked Cylinder ladder is driven by bare-glass HEIGHT, not by body
 * aspect: 53 mm -> 36.5%, 70 -> 43.5%, 83 -> 46.5%, 117 -> 56%, 154 -> 67.5%,
 * close to linear. Reading a new body across it is only an opening position
 * for the slider — the target itself is set by eye.
 */
const LOCKED_LADDER_MM: Array<[number, number]> = [[53, 36.5], [70, 43.5], [83, 46.5], [117, 56], [154, 67.5]];
function openingTargetForGlassMm(mm: number | null): number | null {
  if (mm == null) return null;
  const ladder = LOCKED_LADDER_MM;
  const clamp = Math.min(Math.max(mm, ladder[0]![0]), ladder[ladder.length - 1]![0]);
  for (let i = 1; i < ladder.length; i++) {
    const [x0, y0] = ladder[i - 1]!, [x1, y1] = ladder[i]!;
    if (clamp <= x1) return Math.round((y0 + ((clamp - x0) / (x1 - x0)) * (y1 - y0)) * 2) / 2;
  }
  return ladder[ladder.length - 1]![1];
}

/** The Sep 7 locked ladder, shown for scale context. All fine-mist sprayers. */
const LOCKED_REFERENCES = [
  { label: "Cylinder 5 ml", pct: 36.5, sku: "GBCyl5SprySlMatt" },
  { label: "Cylinder 9 ml", pct: 43.5, sku: "GBCyl9SpryGl" },
  { label: "Cylinder 25 ml", pct: 46.5, sku: "GBcyl25SpryMtGl" },
  { label: "Cylinder 50 ml", pct: 56, sku: "GBCyl50SpryMtGl" },
  { label: "Cylinder 100 ml", pct: 67.5, sku: "GBCyl100SpryMtGl" },
];

const getArg = (flag: string, fallback = "") => {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1]! : fallback;
};
const slugOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const coveragePath = resolve(getArg("--coverage", "tmp/bestbottles-generation/psd-source-coverage.json"));
const includeLocked = process.argv.includes("--include-locked");

type CoverageRow = { family: string; groupSlug: string; websiteSku: string; graceSku: string; capOff: string | null; capOn: string | null };
const coverage = JSON.parse(readFileSync(coveragePath, "utf8")) as { rows: CoverageRow[] };

type FamilySummary = {
  family: string;
  slug: string;
  summary: { groups: number; onSheet: number; inheritsLock: number; held: number; live: Record<string, number> };
  bodies: Array<{ key: string; glassMm: number | null; openingTargetPct: number | null; capacityMl: number; bodyAspect: number; heroes: string[] }>;
  inherits: Array<{ body: string; pct: number; heroes: number; stillToShoulderLock: number }>;
  held: Array<{ sku: string; why: string }>;
};

if (process.argv.includes("--all")) {
  const reviewRoot = resolve(getArg("--out", "tmp/bestbottles-review"));
  const self = fileURLToPath(import.meta.url);
  const families = [...new Set(coverage.rows.map((row) => row.family))].sort();
  const built: FamilySummary[] = [];
  const skipped: Array<{ family: string; groups: number; why: string }> = [];
  for (const name of families) {
    const groups = coverage.rows.filter((row) => row.family === name).length;
    if (NO_SHOULDER_FAMILIES.has(name.toLowerCase())) {
      skipped.push({ family: name, groups, why: "closure or accessory — no glass shoulder; needs its own sizing rule" });
      continue;
    }
    try {
      execFileSync("npx", ["tsx", self, "--family", name, "--coverage", coveragePath, "--out", join(reviewRoot, slugOf(name)), ...(includeLocked ? ["--include-locked"] : [])], { stdio: "inherit" });
      built.push(JSON.parse(readFileSync(join(reviewRoot, slugOf(name), "bodies.json"), "utf8")) as FamilySummary);
    } catch (error) {
      skipped.push({ family: name, groups, why: `sheet failed to build: ${(error as Error).message.split("\n")[0]}` });
    }
  }
  writeFileSync(join(reviewRoot, "index.html"), renderIndex(built, skipped));
  const bodies = built.reduce((sum, entry) => sum + entry.bodies.length, 0);
  const onSheet = built.reduce((sum, entry) => sum + entry.summary.onSheet, 0);
  console.log(`\n${built.length} family sheets · ${bodies} glass bodies need a target · ${onSheet} heroes surfaced · ${skipped.length} families skipped`);
  console.log("http://localhost:8080/tmp/bestbottles-review/index.html");
  process.exit(0);
}

const family = getArg("--family");
if (!family) {
  console.error("--family <name> or --all is required");
  process.exit(1);
}
const slug = slugOf(family);
const outDir = resolve(getArg("--out", `tmp/bestbottles-review/${slug}`));
mkdirSync(join(outDir, "img"), { recursive: true });

const rows = coverage.rows
  .filter((row) => row.family.toLowerCase() === family.toLowerCase())
  .sort((a, b) => a.groupSlug.localeCompare(b.groupSlug));

/** What the site shows for a hero today, keyed by website SKU. */
type LiveStatus = { kind: "shoulder-locked" | "sunburst-pre-lock" | "legacy" | "unknown"; release: number | null };
function loadLiveStatus(): Map<string, LiveStatus> {
  const status = new Map<string, LiveStatus>();
  const git = (...args: string[]) => execFileSync("git", ["-C", SITE_REPO, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  try {
    // A release lock names each approved file by sha256; the registry URL carries
    // the first 12 characters, which ties a live image back to its release.
    const releaseBySha12 = new Map<string, number>();
    const lockPaths = git("ls-tree", "-r", "--name-only", "origin/main", "--", "docs/reviews")
      .split("\n")
      .filter((path) => /sunburst-heroes-release-\d+\/approved-lock\.json$/.test(path));
    for (const path of lockPaths) {
      const release = Number(path.match(/release-(\d+)\//)![1]);
      for (const match of git("show", `origin/main:${path}`).matchAll(/\b[0-9a-f]{64}\b/g)) {
        const sha12 = match[0].slice(0, 12);
        releaseBySha12.set(sha12, Math.max(release, releaseBySha12.get(sha12) ?? 0));
      }
    }
    const registry = JSON.parse(git("show", "origin/main:src/lib/products/catalog-heroes.json")) as Array<{ websiteSku: string; url: string }>;
    for (const entry of registry) {
      const sha12 = entry.url.match(/\.([0-9a-f]{12})\.png$/)?.[1];
      const release = sha12 ? releaseBySha12.get(sha12) ?? null : null;
      status.set(entry.websiteSku.toLowerCase(), {
        kind: release == null ? "legacy" : release >= FIRST_SHOULDER_LOCKED_RELEASE ? "shoulder-locked" : "sunburst-pre-lock",
        release,
      });
    }
  } catch {
    // Website repo unavailable: cards say "unknown" rather than guessing.
  }
  return status;
}
const liveStatus = loadLiveStatus();
const liveOf = (websiteSku: string): LiveStatus => liveStatus.get(websiteSku.toLowerCase()) ?? { kind: "unknown", release: null };
const liveLabel = (live: LiveStatus) =>
  live.kind === "shoulder-locked" ? `live: shoulder-locked (release ${live.release})`
    : live.kind === "sunburst-pre-lock" ? `live: Sunburst, pre-lock (release ${live.release})`
      : live.kind === "legacy" ? "live: legacy plate" : "live: unknown";

type Hero = {
  body: string;
  capacityMl: number;
  sku: string;
  graceSku: string;
  groupSlug: string;
  img: string;
  w: number;
  h: number;
  foot: number;
  shoulder: number;
  centerX: number;
  bodyAspect: number;
  /** Foot-to-shoulder in SOURCE pixels; display pixels differ per crop height. */
  footToShoulderSourcePx: number;
  liveKind: LiveStatus["kind"];
  liveLabel: string;
  /** Set when the measurement came from a fallback source and deserves a second look. */
  sourceNote: string;
  /** The bottle this glass body's proportions are taken from. */
  northStar: boolean;
};
type Pending = {
  hero: Hero;
  k: number;
  cropTop: number;
  footSrc: number;
  glassWidth: number;
  ownShoulderSrc: number | null;
  confidence: number;
  capped: boolean;
  bulb: boolean;
  frosted: boolean;
  sprayer: boolean;
};
const pending: Pending[] = [];
const heroes: Hero[] = [];
const held: Array<{ sku: string; why: string }> = [];
/** Heroes whose glass body is already locked: no decision needed, so not surfaced. */
const inheriting: Array<{ sku: string; body: string; pct: number; live: LiveStatus }> = [];
const liveTally: Record<string, number> = {};
type SnapshotProduct = {
  graceSku?: string; websiteSku?: string; itemName?: string; applicator?: string; neckThreadSize?: string;
  capacityMl?: number | string | null; heightWithoutCap?: string | number | null;
};
const snapshot = existsSync(CONVEX_SNAPSHOT) ? (JSON.parse(readFileSync(CONVEX_SNAPSHOT, "utf8")).products as SnapshotProduct[]) : [];
const glassMmBySku = new Map<string, number>();
const snapshotByGraceSku = new Map<string, SnapshotProduct>();
for (const product of snapshot) {
  const mm = Number(String(product.heightWithoutCap ?? "").match(/(\d+(?:\.\d+)?)/)?.[1] ?? Number.NaN);
  if (product.websiteSku && Number.isFinite(mm)) glassMmBySku.set(product.websiteSku.toLowerCase(), mm);
  if (product.graceSku) snapshotByGraceSku.set(product.graceSku, product);
}
const DISPLAY_HEIGHT = 760;

for (const row of rows) {
  const live = liveOf(row.websiteSku);
  liveTally[live.kind] = (liveTally[live.kind] ?? 0) + 1;
  const catalog = snapshotByGraceSku.get(row.graceSku);
  const slugCapacity = Number((row.groupSlug.match(/-(\d+(?:\.\d+)?)ml-/) ?? [])[1] ?? Number.NaN);
  const lock = resolveShoulderLock({
    family: row.family,
    graceSku: row.graceSku,
    websiteSku: row.websiteSku,
    itemName: catalog?.itemName ?? null,
    applicator: catalog?.applicator ?? null,
    neckThreadSize: catalog?.neckThreadSize ?? null,
    heightWithoutCap: catalog?.heightWithoutCap ?? null,
    capacityMl: Number(catalog?.capacityMl) || (Number.isFinite(slugCapacity) ? slugCapacity : null),
  });
  if (lock && !includeLocked) {
    inheriting.push({ sku: row.websiteSku, body: lock.glassBodyKey, pct: lock.shoulderPct, live });
    continue;
  }
  // A dropper hero shows the dropper seated in the bottle, so it is drawn from
  // the capped source; everything else is drawn uncapped with its sidecar.
  // A tassel bulb hangs beside the bottle, so the "leftmost object is the
  // bottle" reading measures the tassel instead. Those assemblies are composed
  // on the wide canvas anyway; they inherit this body's lock, they do not set it.
  if (/Tsl/i.test(row.websiteSku)) {
    held.push({ sku: row.websiteSku, why: "tassel bulb sprayer — composed on the wide canvas; inherits this size's lock rather than setting it" });
    continue;
  }
  const presentation = resolveBestBottlesHeroPresentation(row);
  const preferred = presentation === "assembled" ? row.capOn : row.capOff;
  // The shoulder sits below the closure, so a capped file can still size the
  // glass when the uncapped one is missing. It is flagged on the card: an
  // over-cap that reaches down to the shoulder would be measured as glass.
  const located = preferred ?? (presentation === "assembled" ? null : row.capOn);
  const measuredOnCapped = !preferred && Boolean(located);
  if (!located) {
    held.push({
      sku: row.websiteSku,
      why: presentation === "assembled" ? "no capped source for an assembled hero" : "no Photoshop source in the capped or uncapped trees",
    });
    continue;
  }
  const [estate, ...rest] = located.split(":");
  const psd = join(ESTATE_ROOTS[estate!] ?? "", rest.join(":"));
  if (!existsSync(psd)) {
    held.push({ sku: row.websiteSku, why: `source missing on disk: ${located}` });
    continue;
  }
  const flat = join(outDir, "img", `${row.websiteSku}.${measuredOnCapped ? "capped-fallback" : presentation}.flat.png`);
  if (!existsSync(flat)) execFileSync("sips", ["-s", "format", "png", psd, "--out", flat], { stdio: "ignore" });

  const source = sharp(flat).flatten({ background: "#ffffff" });
  const { data, info } = await source.clone().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = new Uint8ClampedArray(data);
  const ink = (x: number, y: number) => {
    const i = (y * info.width + x) * 4;
    return Math.max(255 - px[i]!, 255 - px[i + 1]!, 255 - px[i + 2]!) > 12;
  };
  let left = info.width, right = -1, top = -1, bottom = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (!ink(x, y)) continue;
      if (top < 0) top = y;
      bottom = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  // The bottle is the left object; the detached cap stands to its right.
  const columnHasInk = (x: number) => {
    for (let y = top; y <= bottom; y += 2) if (ink(x, y)) return true;
    return false;
  };
  let gap = -1;
  for (let x = left + 40; x < right; x++) if (!columnHasInk(x)) { gap = x; break; }
  const bottleRight = gap > 0 ? gap - 1 : right;
  let bottleTop = -1, bottleBottom = -1;
  for (let y = top; y <= bottom; y++) {
    let hit = false;
    for (let x = left; x <= bottleRight; x++) if (ink(x, y)) { hit = true; break; }
    if (hit) { if (bottleTop < 0) bottleTop = y; bottleBottom = y; }
  }
  const widths: number[] = [];
  for (let y = Math.round(bottleBottom - (bottleBottom - bottleTop) * 0.35); y < bottleBottom - 30; y += 4) {
    let l = -1, r = -1;
    for (let x = left; x <= bottleRight; x++) if (ink(x, y)) { l = x; break; }
    for (let x = bottleRight; x >= left; x--) if (ink(x, y)) { r = x; break; }
    if (l >= 0) widths.push(r - l + 1);
  }
  widths.sort((a, b) => a - b);
  const glassWidth = widths[widths.length >> 1] ?? 0;

  const landmark = detectGlassShoulderLandmark({
    pixels: px,
    width: info.width,
    height: info.height,
    primaryBounds: { top: bottleTop, bottom: bottleBottom, left, right: bottleRight },
    footYPx: bottleBottom,
    background: { r: 255, g: 255, b: 255 },
  });
  if (glassWidth === 0) {
    held.push({ sku: row.websiteSku, why: "glass width not measurable" });
    continue;
  }

  const margin = 20;
  const cropLeft = Math.max(0, left - margin);
  const cropTop = Math.max(0, top - margin);
  const cropWidth = Math.min(info.width, right + margin) - cropLeft;
  const cropHeight = Math.min(info.height, bottom + margin) - cropTop;
  const k = DISPLAY_HEIGHT / cropHeight;
  const img = `img/${row.websiteSku}.webp`;
  await source
    .clone()
    .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
    .resize({ height: DISPLAY_HEIGHT })
    .webp({ quality: 86 })
    .toFile(join(outDir, img));

  const capacityMl = Number((row.groupSlug.match(/-(\d+(?:\.\d+)?)ml-/) ?? [])[1] ?? Number.NaN);
  pending.push({
    hero: {
      body: "",
      capacityMl,
      sku: row.websiteSku,
      graceSku: row.graceSku,
      groupSlug: row.groupSlug,
      img,
      w: Math.round(cropWidth * k),
      h: DISPLAY_HEIGHT,
      foot: (bottleBottom - cropTop) * k,
      shoulder: 0,
      centerX: ((left + bottleRight) / 2 - cropLeft) * k,
      bodyAspect: 0,
      footToShoulderSourcePx: 0,
      liveKind: live.kind,
      liveLabel: liveLabel(live),
      sourceNote: "",
      northStar: false,
    },
    k,
    cropTop,
    footSrc: bottleBottom,
    glassWidth,
    ownShoulderSrc: landmark && landmark.confidence >= 0.8 ? landmark.shoulderYPx : null,
    confidence: landmark?.confidence ?? 0,
    capped: measuredOnCapped,
    bulb: /AnSp/i.test(row.websiteSku),
    frosted: /Frst/i.test(row.websiteSku) || /frosted/i.test(row.groupSlug),
    sprayer: /Spry/i.test(row.websiteSku),
  });
}

/**
 * One glass body per size, set from one north star.
 *
 * The detector is not equally reliable on every file: frosted glass, bulb
 * sprayers and capped sources produced false shoulders that read as a second
 * "body" at the same size. So each size takes its proportions from the
 * measurements most worth trusting — clear glass, uncapped, no bulb — and the
 * best of those is the north star. Every other bottle at that size keeps its
 * own measurement only when it agrees; otherwise its shoulder is placed from
 * the north star, scaled by its own glass width, and the card says so.
 *
 * A second body at one size is kept only when two or more trusted files agree
 * on it — Cylinder really does have two 9 ml bodies. A lone dissenter is a
 * misdetection.
 */
const AGREE = 0.06;
const ownAspect = (entry: Pending) => (entry.ownShoulderSrc == null ? null : (entry.footSrc - entry.ownShoulderSrc) / entry.glassWidth);
const bodies = new Map<string, Hero[]>();
const sharedCapacity = new Set<string>();
const sizes = [...new Set(pending.map((entry) => String(entry.hero.capacityMl)))].sort((a, b) => Number(a) - Number(b));
for (const size of sizes) {
  const group = pending.filter((entry) => String(entry.hero.capacityMl) === size);
  const measurable = group.filter((entry) => entry.ownShoulderSrc != null);
  let trusted = measurable.filter((entry) => !entry.capped && !entry.bulb && !entry.frosted);
  if (!trusted.length) trusted = measurable.filter((entry) => !entry.bulb);
  if (!trusted.length) {
    for (const entry of group) held.push({ sku: entry.hero.sku, why: "no trustworthy shoulder measurement at this size — the detector cannot find a shoulder on this glass" });
    continue;
  }
  const clusters: Pending[][] = [];
  for (const entry of [...trusted].sort((a, b) => ownAspect(a)! - ownAspect(b)!)) {
    const home = clusters.find((members) => Math.abs(ownAspect(members[0]!)! / ownAspect(entry)! - 1) <= AGREE);
    if (home) home.push(entry);
    else clusters.push([entry]);
  }
  clusters.sort((a, b) => b.length - a.length);
  const glassBodies = clusters
    .filter((members, index) => index === 0 || members.length >= 2)
    .map((members, index) => {
      const northStar = [...members].sort((a, b) => Number(b.sprayer) - Number(a.sprayer) || b.confidence - a.confidence)[0]!;
      return { key: `${slug}:${size}-${index === 0 ? "standard" : `variant-${index + 1}`}`, northStar, ratio: ownAspect(northStar)! };
    });
  if (glassBodies.length > 1) for (const body of glassBodies) sharedCapacity.add(body.key);

  for (const entry of group) {
    const own = ownAspect(entry);
    const nearest = own == null ? null : glassBodies.map((body) => ({ body, off: Math.abs(own / body.ratio - 1) })).sort((a, b) => a.off - b.off)[0]!;
    const keepsOwn = nearest != null && nearest.off <= AGREE;
    const body = keepsOwn ? nearest!.body : glassBodies[0]!;
    const footToShoulder = keepsOwn ? entry.footSrc - entry.ownShoulderSrc! : body.ratio * entry.glassWidth;
    const hero = entry.hero;
    hero.body = body.key;
    hero.northStar = entry === body.northStar;
    hero.footToShoulderSourcePx = footToShoulder;
    hero.bodyAspect = footToShoulder / entry.glassWidth;
    hero.shoulder = (entry.footSrc - footToShoulder - entry.cropTop) * entry.k;
    hero.sourceNote = hero.northStar
      ? ""
      : keepsOwn
        ? entry.capped ? "measured on the capped file; agrees with the north star" : ""
        : `shoulder placed from the north star (${own == null ? "no shoulder found on this file" : "its own reading disagreed"}) — check the line`;
    heroes.push(hero);
    bodies.set(body.key, [...(bodies.get(body.key) ?? []), hero]);
  }
}
for (const members of bodies.values()) members.sort((a, b) => Number(b.northStar) - Number(a.northStar) || a.sku.localeCompare(b.sku));

const references = [];
const registry = JSON.parse(readFileSync(join(SITE_HEROES, "../src/lib/products/catalog-heroes.json"), "utf8")) as Array<{ websiteSku: string; url: string }>;
for (const reference of LOCKED_REFERENCES) {
  const row = registry.find((entry) => entry.websiteSku === reference.sku);
  if (!row || !existsSync(join(SITE_HEROES, row.url))) continue;
  const img = `img/ref-${reference.sku}.webp`;
  await sharp(join(SITE_HEROES, row.url)).resize({ width: 640 }).webp({ quality: 84 }).toFile(join(outDir, img));
  references.push({ ...reference, img });
}

const bodyList = [...bodies.entries()].map(([key, members]) => {
  const mms = members.map((hero) => glassMmBySku.get(hero.sku.toLowerCase())).filter((v): v is number => v != null).sort((a, b) => a - b);
  const glassMm = mms.length ? mms[mms.length >> 1]! : null;
  // The scale card's five levels are keyed on bare-glass height and give the
  // foot-to-RIM fill. Shown for orientation: a shoulder target should leave the
  // bottle reading as its level says it should.
  const band = glassMm == null ? null : BEST_BOTTLES_SCALE_CARD_HEIGHT_BANDS.find((entry) => glassMm >= entry.mmMinInclusive && glassMm < entry.mmMaxExclusive) ?? null;
  return {
  key,
  glassMm,
  scaleCard: band ? `${band.level} · glass fills ${band.glassPct}% foot to rim` : null,
  sharedCapacity: sharedCapacity.has(key),
  openingTargetPct: openingTargetForGlassMm(glassMm),
  capacityMl: members[0]!.capacityMl,
  bodyAspect: Math.round((members.reduce((sum, hero) => sum + hero.bodyAspect, 0) / members.length) * 1000) / 1000,
  heroes: members,
  };
});

/** Locked bodies in this family: nothing to decide, but still work to generate. */
const inherits = [...new Set(inheriting.map((entry) => entry.body))].sort().map((body) => {
  const members = inheriting.filter((entry) => entry.body === body);
  return {
    body,
    pct: members[0]!.pct,
    heroes: members.length,
    stillToShoulderLock: members.filter((entry) => entry.live.kind !== "shoulder-locked").length,
  };
});

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${family} shoulder targets</title>
<style>
  :root { --ink:#1d1d1b; --muted:#6b6a66; --line:#d9d6cf; --bone:#F5F3EF; --lock:#0f6e56; --warn:#b3261e; }
  * { box-sizing: border-box; }
  body { margin:0; padding:28px 32px 120px; background:#fff; color:var(--ink); font:15px/1.5 -apple-system,"Helvetica Neue",Arial,sans-serif; }
  h1 { font:500 26px/1.2 Georgia,serif; margin:0 0 4px; }
  h2 { font:500 21px/1.2 Georgia,serif; margin:0; }
  .sub { color:var(--muted); margin:0 0 26px; max-width:70ch; }
  section { border-top:1px solid var(--line); padding:22px 0 8px; }
  .head { display:flex; align-items:center; gap:18px; flex-wrap:wrap; margin-bottom:14px; }
  .head .meta { color:var(--muted); }
  .ctl { margin-left:auto; display:flex; align-items:center; gap:12px; }
  .ctl input[type=range] { width:300px; accent-color:var(--lock); }
  .ctl input[type=number] { width:76px; font:500 18px/1 inherit; padding:6px 8px; border:1px solid var(--line); border-radius:6px; color:var(--lock); }
  .ctl .state { font-size:12.5px; padding:3px 9px; border-radius:999px; border:1px solid var(--line); color:var(--muted); }
  .ctl .state.done { color:var(--lock); border-color:var(--lock); }
  .ctl .accept { padding:7px 11px; font-size:13px; }
  .row { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:14px; }
  .card { position:relative; aspect-ratio:10/11; background:var(--bone); border:1px solid var(--line); overflow:hidden; }
  .card.crop { border-color:var(--warn); }
  .card img.bottle { position:absolute; mix-blend-mode:multiply; max-width:none; }
  .card img.full { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
  .base { position:absolute; left:0; right:0; top:91%; border-top:1px dashed #9c9a94; }
  .shoulder { position:absolute; left:0; right:0; border-top:2px solid var(--lock); }
  .ref .shoulder { border-top-color:#7a7972; }
  .cap { font-size:12.5px; margin-top:6px; line-height:1.35; }
  .cap b { font-weight:600; display:block; overflow:hidden; text-overflow:ellipsis; }
  .cap span { color:var(--muted); } .cap .bad { color:var(--warn); }
  .cap .live { display:block; font-size:11.5px; } .cap .live-sunburst-pre-lock { color:#9a6700; } .cap .live-shoulder-locked { color:var(--lock); }
  table.locked { border-collapse:collapse; font-size:14px; } table.locked td, table.locked th { padding:5px 18px 5px 0; text-align:left; border-bottom:1px solid var(--line); } table.locked th { color:var(--muted); font-weight:500; }
  footer { position:fixed; left:0; right:0; bottom:0; background:#fff; border-top:1px solid var(--line); padding:12px 32px; display:flex; gap:22px; align-items:center; flex-wrap:wrap; }
  footer code { font:13px/1.4 ui-monospace,Menlo,monospace; color:var(--lock); }
  button { font:500 14px/1 inherit; padding:9px 14px; border:1px solid var(--ink); background:#fff; border-radius:6px; cursor:pointer; }
</style></head><body>
<h1>${family} · shoulder targets</h1>
<p class="sub">One target per glass body. Drag a slider and every hero on that body moves together — the closure never moves the shoulder. The dashed line is the shared 91% baseline; the green line is where the glass shoulder will land. A red card means the fitment would crop at that size.</p>

<section><div class="head"><h2>Locked reference ladder</h2><span class="meta">Cylinder · Sep 7 source of truth · not adjustable</span></div>
<div class="row" id="refs"></div></section>
<div id="bodies"></div>
<footer><span>Targets</span><code id="out"></code><button id="copy">Copy</button></footer>

<script>
const BODIES = ${JSON.stringify(bodyList)};
const REFS = ${JSON.stringify(references)};
const HELD = ${JSON.stringify(held)};
const INHERITS = ${JSON.stringify(inherits)};
const FAMILY = ${JSON.stringify(slug)};
const KEY = "bb-shoulder-targets:v3:" + FAMILY;
// Only bodies someone has actually decided are stored. A slider sitting at its
// opening position — the locked Cylinder ladder read across by glass mm — is a
// guess, and must never be read back as a decision.
let decided = {}; try { decided = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) {}
for (const k of Object.keys(decided)) if (!BODIES.some((b) => b.key === k)) delete decided[k];
const targets = {}; for (const b of BODIES) targets[b.key] = decided[b.key] ?? b.openingTargetPct ?? 55;
window.__shoulderTargets = targets;
window.__shoulderTargetsDecided = decided;

const refs = document.getElementById("refs");
for (const r of REFS) {
  const cell = document.createElement("div"); cell.className = "ref";
  cell.innerHTML = '<div class="card"><img class="full" src="' + r.img + '"><div class="base"></div><div class="shoulder" style="top:' + (91 - r.pct) + '%"></div></div><div class="cap"><b>' + r.label + '</b><span>locked ' + r.pct + '%</span></div>';
  refs.appendChild(cell);
}

const host = document.getElementById("bodies");
for (const b of BODIES) {
  const sec = document.createElement("section");
  sec.innerHTML = '<div class="head"><h2>' + FAMILY[0].toUpperCase() + FAMILY.slice(1) + ' ' + b.capacityMl + ' ml</h2><span class="meta">' + (b.glassMm ? b.glassMm + ' mm glass · ' : '') + (b.scaleCard ? 'scale card: ' + b.scaleCard + ' · ' : '') + b.key + ' · body aspect ' + b.bodyAspect + ' · ' + b.heroes.length + ' hero' + (b.heroes.length === 1 ? '' : 'es') + (b.sharedCapacity ? ' · <b style="color:#9a6700">two proportions were measured at this size — check both</b>' : '') + '</span>' +
    '<div class="ctl"><span class="state"></span><input type="range" min="15" max="80" step="0.5"><input type="number" min="15" max="80" step="0.5"><span>%</span><button class="accept" title="Keep the value shown as the decision">Accept</button></div></div><div class="row"></div>';
  const row = sec.querySelector(".row"), range = sec.querySelector("input[type=range]"), num = sec.querySelector("input[type=number]");
  for (const h of b.heroes) {
    const cell = document.createElement("div");
    cell.innerHTML = '<div class="card"><img class="bottle" src="' + h.img + '"><div class="base"></div><div class="shoulder"></div></div><div class="cap"><b>' + h.sku + '</b>' + (h.northStar ? '<span class="live live-shoulder-locked">★ north star</span>' : '') + '<span class="note">' + h.groupSlug.split("-").slice(-1)[0] + '</span><span class="live live-' + h.liveKind + '">' + h.liveLabel + '</span>' + (h.sourceNote ? '<span class="live live-sunburst-pre-lock">' + h.sourceNote + '</span>' : '') + '</div>';
    cell._hero = h; row.appendChild(cell);
  }
  const layout = () => {
    const pct = targets[b.key];
    for (const cell of row.children) {
      const h = cell._hero, card = cell.querySelector(".card"), img = cell.querySelector("img"), note = cell.querySelector(".note");
      const H = card.clientHeight, W = card.clientWidth, k = (pct / 100 * H) / (h.foot - h.shoulder);
      const top = 0.91 * H - h.foot * k;
      img.style.height = h.h * k + "px"; img.style.width = h.w * k + "px";
      img.style.top = top + "px"; img.style.left = (0.5 * W - h.centerX * k) + "px";
      cell.querySelector(".shoulder").style.top = (91 - pct) + "%";
      const crops = top + 20 * k < 0;
      card.classList.toggle("crop", crops);
      note.textContent = h.groupSlug.split("-").slice(-1)[0] + (crops ? " · fitment crops" : "");
      note.classList.toggle("bad", crops);
    }
  };
  const state = sec.querySelector(".state");
  const mark = () => { const done = b.key in decided; state.textContent = done ? "decided" : "opening guess"; state.className = "state " + (done ? "done" : "guess"); };
  const set = (v) => {
    v = Math.min(80, Math.max(15, Math.round(Number(v) * 2) / 2)); if (!isFinite(v)) return;
    targets[b.key] = v; decided[b.key] = v; range.value = v; num.value = v; layout(); mark(); publish();
  };
  range.addEventListener("input", (e) => set(e.target.value));
  num.addEventListener("change", (e) => set(e.target.value));
  sec.querySelector(".accept").addEventListener("click", () => set(targets[b.key]));
  mark();
  b._layout = layout; host.appendChild(sec); range.value = num.value = targets[b.key];
}
function publish() {
  const n = Object.keys(decided).length;
  document.getElementById("out").textContent = n + " of " + BODIES.length + " decided" + (n ? "   ·   " + Object.entries(decided).map(([k, v]) => k + " = " + v + "%").join("   ·   ") : "");
  try { localStorage.setItem(KEY, JSON.stringify(decided)); } catch (e) {}
  window.__shoulderTargetsTouched = n > 0;
}
document.getElementById("copy").onclick = () => navigator.clipboard && navigator.clipboard.writeText(JSON.stringify(decided, null, 2));
const relayout = () => BODIES.forEach((b) => b._layout());
window.addEventListener("resize", relayout); window.addEventListener("load", relayout);
relayout(); publish();
if (!BODIES.length) { const p = document.createElement("p"); p.className = "sub"; p.style.marginTop = "26px"; p.textContent = INHERITS.length ? "Nothing to decide here: every glass body in this family that has a Photoshop source is already locked." : "Nothing could be surfaced for this family — see the held list below."; host.appendChild(p); }
if (INHERITS.length) {
  const sec = document.createElement("section");
  sec.innerHTML = '<div class="head"><h2>Already locked</h2><span class="meta">no decision needed · these heroes inherit the lock when they are generated</span></div><table class="locked"><tr><th>Glass body</th><th>Shoulder</th><th>Heroes</th><th>Not yet shoulder-locked on the site</th></tr>' +
    INHERITS.map((x) => '<tr><td>' + x.body + '</td><td>' + x.pct + '%</td><td>' + x.heroes + '</td><td>' + x.stillToShoulderLock + '</td></tr>').join("") + '</table>';
  host.appendChild(sec);
}
if (HELD.length) {
  const byWhy = {}; for (const x of HELD) (byWhy[x.why] = byWhy[x.why] || []).push(x.sku);
  for (const why of Object.keys(byWhy)) { const p = document.createElement("p"); p.className = "sub"; p.style.marginTop = "18px"; p.textContent = "Not on this sheet (" + byWhy[why].length + "): " + byWhy[why].join(", ") + " — " + why + "."; host.appendChild(p); }
}
</script></body></html>
`;

writeFileSync(join(outDir, "index.html"), page);
const familySummary: FamilySummary = {
  family,
  slug,
  summary: { groups: rows.length, onSheet: heroes.length, inheritsLock: inheriting.length, held: held.length, live: liveTally },
  bodies: bodyList.map(({ heroes: members, ...rest }) => ({ ...rest, heroes: members.map((hero) => hero.sku) })),
  inherits,
  held,
};
writeFileSync(join(outDir, "bodies.json"), `${JSON.stringify(familySummary, null, 2)}\n`);

console.log(`${family}: ${heroes.length} heroes on ${bodyList.length} glass bodies to decide, ${inheriting.length} on already-locked bodies, ${held.length} held`);
for (const body of bodyList) {
  const spans = body.heroes.map((hero) => hero.footToShoulderSourcePx);
  const spread = ((Math.max(...spans) / Math.min(...spans) - 1) * 100).toFixed(2);
  console.log(`  ${body.key.padEnd(24)} aspect ${String(body.bodyAspect).padEnd(6)} ${body.heroes.length} heroes  shoulder spread ${spread}%`);
}
for (const item of held) console.log(`  held  ${item.sku.padEnd(22)} ${item.why}`);
console.log(`\nhttp://localhost:8080/tmp/bestbottles-review/${slug}/index.html`);

/**
 * One page over every family sheet: what is left to decide, and a single place
 * to read every decision back (`window.__allShoulderTargets`). Self-contained on
 * purpose — it runs from the `--all` branch above, before the per-family
 * constants in this module exist.
 */
function renderIndex(built: FamilySummary[], skipped: Array<{ family: string; groups: number; why: string }>): string {
  const ordered = [...built].sort((a, b) => b.bodies.length - a.bodies.length || b.summary.groups - a.summary.groups);
  const data = ordered.map((entry) => ({
    family: entry.family,
    slug: entry.slug,
    groups: entry.summary.groups,
    bodies: entry.bodies.map((body) => body.key),
    onSheet: entry.summary.onSheet,
    inheritsLock: entry.summary.inheritsLock,
    held: entry.summary.held,
    live: entry.summary.live,
  }));
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Shoulder targets · every family</title>
<style>
  :root { --ink:#1d1d1b; --muted:#6b6a66; --line:#d9d6cf; --lock:#0f6e56; --warn:#9a6700; }
  body { margin:0; padding:28px 32px 90px; background:#fff; color:var(--ink); font:15px/1.5 -apple-system,"Helvetica Neue",Arial,sans-serif; }
  h1 { font:500 26px/1.2 Georgia,serif; margin:0 0 4px; } h2 { font:500 19px/1.2 Georgia,serif; margin:34px 0 8px; }
  .sub { color:var(--muted); margin:0 0 22px; max-width:78ch; }
  table { border-collapse:collapse; width:100%; max-width:1180px; }
  th, td { text-align:left; padding:8px 16px 8px 0; border-bottom:1px solid var(--line); vertical-align:top; }
  th { color:var(--muted); font-weight:500; font-size:13px; } td.n { font-variant-numeric:tabular-nums; }
  a { color:var(--lock); } .muted { color:var(--muted); } .pre { color:var(--warn); }
  .bar { display:inline-block; width:120px; height:7px; border-radius:4px; background:#ece9e2; vertical-align:middle; margin-right:8px; overflow:hidden; }
  .bar i { display:block; height:100%; background:var(--lock); }
  footer { position:fixed; left:0; right:0; bottom:0; background:#fff; border-top:1px solid var(--line); padding:12px 32px; display:flex; gap:18px; align-items:center; }
  button { font:500 14px/1 inherit; padding:9px 14px; border:1px solid var(--ink); background:#fff; border-radius:6px; cursor:pointer; }
</style></head><body>
<h1>Shoulder targets · every family</h1>
<p class="sub">One target per glass body, set by eye on the family's sheet. A body locked once holds for every colour and every closure on that glass. Bodies that are already locked are not asked again. Closures and accessories are listed separately: they have no glass shoulder.</p>
<table><thead><tr><th>Family</th><th>Hero groups</th><th>Bodies to decide</th><th>Decided</th><th>Heroes on sheet</th><th>On a locked body</th><th>Held</th><th>Live on the site today</th></tr></thead><tbody id="rows"></tbody></table>
<h2>Not on a shoulder sheet</h2>
<table><thead><tr><th>Family</th><th>Hero groups</th><th>Why</th></tr></thead><tbody>${skipped.map((entry) => `<tr><td>${entry.family}</td><td class="n">${entry.groups}</td><td class="muted">${entry.why}</td></tr>`).join("")}</tbody></table>
<footer><span id="total"></span><button id="copy">Copy every decision</button></footer>
<script>
const FAMILIES = ${JSON.stringify(data)};
const all = {}; let decidedCount = 0, bodyCount = 0;
const rows = document.getElementById("rows");
for (const f of FAMILIES) {
  let saved = {}; try { saved = JSON.parse(localStorage.getItem("bb-shoulder-targets:v3:" + f.slug) || "{}"); } catch (e) {}
  const mine = {}; for (const key of f.bodies) if (key in saved) mine[key] = saved[key];
  const n = Object.keys(mine).length; if (n) all[f.slug] = mine;
  decidedCount += n; bodyCount += f.bodies.length;
  const live = f.live || {};
  const liveText = [live["shoulder-locked"] ? live["shoulder-locked"] + " shoulder-locked" : "", live["sunburst-pre-lock"] ? '<span class="pre">' + live["sunburst-pre-lock"] + " Sunburst pre-lock</span>" : "", live["legacy"] ? live["legacy"] + " legacy" : "", live["unknown"] ? live["unknown"] + " unknown" : ""].filter(Boolean).join(" · ");
  const tr = document.createElement("tr");
  tr.innerHTML = '<td><a href="' + f.slug + '/index.html">' + f.family + '</a></td><td class="n">' + f.groups + '</td><td class="n">' + f.bodies.length + '</td>' +
    '<td class="n">' + (f.bodies.length ? '<span class="bar"><i style="width:' + Math.round(100 * n / f.bodies.length) + '%"></i></span>' + n + ' / ' + f.bodies.length : '<span class="muted">nothing to decide</span>') + '</td>' +
    '<td class="n">' + f.onSheet + '</td><td class="n">' + f.inheritsLock + '</td><td class="n">' + f.held + '</td><td>' + liveText + '</td>';
  rows.appendChild(tr);
}
window.__allShoulderTargets = all;
document.getElementById("total").textContent = decidedCount + " of " + bodyCount + " glass bodies decided across " + FAMILIES.length + " families";
document.getElementById("copy").onclick = () => navigator.clipboard && navigator.clipboard.writeText(JSON.stringify(all, null, 2));
</script></body></html>
`;
}
