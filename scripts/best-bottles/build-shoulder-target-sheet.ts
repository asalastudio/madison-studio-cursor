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
 * Output goes under tmp/ — gitignored on purpose, because it contains client
 * product imagery and this repository is public. Vite serves it:
 *
 *   npx tsx scripts/best-bottles/build-shoulder-target-sheet.ts --family Slim
 *   open http://localhost:8080/tmp/bestbottles-review/slim/index.html
 *
 * Requires macOS `sips` to flatten PSDs, and the coverage artifact from
 * `index-psd-source-coverage.ts`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import sharp from "sharp";

import { detectGlassShoulderLandmark } from "../../src/lib/product-image/shoulderLandmark";

const CLIENT_ROOT = "/Users/jordanrichter/Projects/Clients/Nemat-International";
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
const family = getArg("--family");
if (!family) {
  console.error("--family is required");
  process.exit(1);
}
const slug = family.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const coveragePath = resolve(getArg("--coverage", "tmp/bestbottles-generation/psd-source-coverage.json"));
const outDir = resolve(getArg("--out", `tmp/bestbottles-review/${slug}`));
mkdirSync(join(outDir, "img"), { recursive: true });

type CoverageRow = { family: string; groupSlug: string; websiteSku: string; graceSku: string; capOff: string | null };
const coverage = JSON.parse(readFileSync(coveragePath, "utf8")) as { rows: CoverageRow[] };
const rows = coverage.rows
  .filter((row) => row.family.toLowerCase() === family.toLowerCase())
  .sort((a, b) => a.groupSlug.localeCompare(b.groupSlug));

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
};
const heroes: Hero[] = [];
const held: Array<{ sku: string; why: string }> = [];
const snapshot = existsSync(CONVEX_SNAPSHOT)
  ? (JSON.parse(readFileSync(CONVEX_SNAPSHOT, "utf8")).products as Array<{ websiteSku?: string; heightWithoutCap?: string | number | null }>)
  : [];
const glassMmBySku = new Map<string, number>();
for (const product of snapshot) {
  const mm = Number(String(product.heightWithoutCap ?? "").match(/(\d+(?:\.\d+)?)/)?.[1] ?? Number.NaN);
  if (product.websiteSku && Number.isFinite(mm)) glassMmBySku.set(product.websiteSku.toLowerCase(), mm);
}
const DISPLAY_HEIGHT = 760;

for (const row of rows) {
  if (!row.capOff) {
    held.push({ sku: row.websiteSku, why: "no uncapped source — the glass rim and shoulder are not reliably visible" });
    continue;
  }
  const [estate, ...rest] = row.capOff.split(":");
  const psd = join(ESTATE_ROOTS[estate!] ?? "", rest.join(":"));
  if (!existsSync(psd)) {
    held.push({ sku: row.websiteSku, why: `source missing on disk: ${row.capOff}` });
    continue;
  }
  const flat = join(outDir, "img", `${row.websiteSku}.flat.png`);
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
  if (!landmark || landmark.confidence < 0.8 || glassWidth === 0) {
    held.push({ sku: row.websiteSku, why: `shoulder not measurable (confidence ${landmark?.confidence?.toFixed(2) ?? "none"})` });
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
  heroes.push({
    body: "",
    capacityMl,
    sku: row.websiteSku,
    graceSku: row.graceSku,
    groupSlug: row.groupSlug,
    img,
    w: Math.round(cropWidth * k),
    h: DISPLAY_HEIGHT,
    foot: (bottleBottom - cropTop) * k,
    shoulder: (landmark.shoulderYPx - cropTop) * k,
    centerX: ((left + bottleRight) / 2 - cropLeft) * k,
    bodyAspect: (bottleBottom - landmark.shoulderYPx) / glassWidth,
    footToShoulderSourcePx: bottleBottom - landmark.shoulderYPx,
  });
}

/**
 * Group by capacity, then split a capacity when the glass differs: Cylinder has
 * two 9 ml bodies (70 mm and 106 mm) that share a capacity and nothing else, so
 * capacity alone is not a body key.
 */
const bodies = new Map<string, Hero[]>();
for (const hero of heroes.sort((a, b) => a.capacityMl - b.capacityMl || a.bodyAspect - b.bodyAspect)) {
  const siblings = [...bodies.entries()].filter(([key]) => key.startsWith(`${slug}:${hero.capacityMl}-`));
  const match = siblings.find(([, members]) => Math.abs(members[0]!.bodyAspect / hero.bodyAspect - 1) <= 0.04);
  const key = match?.[0] ?? `${slug}:${hero.capacityMl}-${siblings.length === 0 ? "standard" : `variant-${siblings.length + 1}`}`;
  hero.body = key;
  bodies.set(key, [...(bodies.get(key) ?? []), hero]);
}

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
  return {
  key,
  glassMm,
  openingTargetPct: openingTargetForGlassMm(glassMm),
  capacityMl: members[0]!.capacityMl,
  bodyAspect: Math.round((members.reduce((sum, hero) => sum + hero.bodyAspect, 0) / members.length) * 1000) / 1000,
  heroes: members,
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
const FAMILY = ${JSON.stringify(slug)};
const KEY = "bb-shoulder-targets:v2:" + FAMILY;
let saved = {}; try { saved = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) {}
// Opening position only: the locked Cylinder ladder read across by glass mm.
const targets = {}; for (const b of BODIES) targets[b.key] = saved[b.key] ?? b.openingTargetPct ?? 55;
let touched = Object.keys(saved).length > 0;
window.__shoulderTargets = targets;

const refs = document.getElementById("refs");
for (const r of REFS) {
  const cell = document.createElement("div"); cell.className = "ref";
  cell.innerHTML = '<div class="card"><img class="full" src="' + r.img + '"><div class="base"></div><div class="shoulder" style="top:' + (91 - r.pct) + '%"></div></div><div class="cap"><b>' + r.label + '</b><span>locked ' + r.pct + '%</span></div>';
  refs.appendChild(cell);
}

const host = document.getElementById("bodies");
for (const b of BODIES) {
  const sec = document.createElement("section");
  sec.innerHTML = '<div class="head"><h2>' + FAMILY[0].toUpperCase() + FAMILY.slice(1) + ' ' + b.capacityMl + ' ml</h2><span class="meta">' + (b.glassMm ? b.glassMm + ' mm glass · ' : '') + b.key + ' · body aspect ' + b.bodyAspect + ' · ' + b.heroes.length + ' hero' + (b.heroes.length === 1 ? '' : 'es') + '</span>' +
    '<div class="ctl"><input type="range" min="25" max="80" step="0.5"><input type="number" min="25" max="80" step="0.5"><span>%</span></div></div><div class="row"></div>';
  const row = sec.querySelector(".row"), range = sec.querySelector("input[type=range]"), num = sec.querySelector("input[type=number]");
  for (const h of b.heroes) {
    const cell = document.createElement("div");
    cell.innerHTML = '<div class="card"><img class="bottle" src="' + h.img + '"><div class="base"></div><div class="shoulder"></div></div><div class="cap"><b>' + h.sku + '</b><span class="note">' + h.groupSlug.split("-").slice(-1)[0] + '</span></div>';
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
  const set = (v) => {
    v = Math.min(80, Math.max(25, Math.round(Number(v) * 2) / 2)); if (!isFinite(v)) return;
    targets[b.key] = v; range.value = v; num.value = v; touched = true; layout(); publish();
  };
  range.addEventListener("input", (e) => set(e.target.value));
  num.addEventListener("change", (e) => set(e.target.value));
  b._layout = layout; host.appendChild(sec); range.value = num.value = targets[b.key];
}
function publish() {
  document.getElementById("out").textContent = Object.entries(targets).map(([k, v]) => k + " = " + v + "%").join("   ·   ");
  // An untouched opening position is not a decision; do not persist it as one.
  if (touched) { try { localStorage.setItem(KEY, JSON.stringify(targets)); } catch (e) {} }
  window.__shoulderTargetsTouched = touched;
}
document.getElementById("copy").onclick = () => navigator.clipboard && navigator.clipboard.writeText(JSON.stringify(targets, null, 2));
const relayout = () => BODIES.forEach((b) => b._layout());
window.addEventListener("resize", relayout); window.addEventListener("load", relayout);
relayout(); publish();
if (HELD.length) { const p = document.createElement("p"); p.className = "sub"; p.style.marginTop = "26px"; p.textContent = "Not on this sheet: " + HELD.map((x) => x.sku).join(", ") + " — " + HELD[0].why + "."; host.appendChild(p); }
</script></body></html>
`;

writeFileSync(join(outDir, "index.html"), page);
writeFileSync(join(outDir, "bodies.json"), `${JSON.stringify({ family, bodies: bodyList.map(({ heroes: members, ...rest }) => ({ ...rest, heroes: members.map((hero) => hero.sku) })), held }, null, 2)}\n`);

console.log(`${family}: ${heroes.length} heroes on ${bodyList.length} glass bodies, ${held.length} held`);
for (const body of bodyList) {
  const spans = body.heroes.map((hero) => hero.footToShoulderSourcePx);
  const spread = ((Math.max(...spans) / Math.min(...spans) - 1) * 100).toFixed(2);
  console.log(`  ${body.key.padEnd(24)} aspect ${String(body.bodyAspect).padEnd(6)} ${body.heroes.length} heroes  shoulder spread ${spread}%`);
}
for (const item of held) console.log(`  held  ${item.sku.padEnd(22)} ${item.why}`);
console.log(`\nhttp://localhost:8080/tmp/bestbottles-review/${slug}/index.html`);
