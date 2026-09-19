#!/usr/bin/env tsx
/**
 * Which of the site's hero groups have a Photoshop source, and in which roles.
 *
 * Every remaining Best Bottles hero is gated on reference prep, not on
 * generation: a hero needs an approved immutable role reference at 2080x2288,
 * and most groups still point at a 360x480 thumbnail. Answering "can this
 * family even be prepared?" by hand means reading two estates of ~10,800
 * Photoshop files, so this indexes them once and reports per family.
 *
 * Output is a planning artifact for the Cowork reference-prep lane. It writes
 * nothing to Convex, Supabase or Shopify, and it does not decide what is
 * approved -- a located PSD is a candidate for re-export, not a reference.
 *
 *   npx tsx scripts/best-bottles/index-psd-source-coverage.ts
 *   npx tsx scripts/best-bottles/index-psd-source-coverage.ts --family Slim
 *
 * Flags: --family <name>  --out <path>  --json
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const CLIENT_ROOT = "/Users/jordanrichter/Projects/Clients/Nemat-International";
// The website checkout sits on a feature branch with many worktrees; take the
// first location that actually has the registry.
const CATALOG_HERO_CANDIDATES = [
  `${CLIENT_ROOT}/Best-Bottles-Website-02-20-2026/.claude/worktrees/sunburst-heroes-release-7/src/lib/products/catalog-heroes.json`,
  `${CLIENT_ROOT}/Best-Bottles-Website-02-20-2026/src/lib/products/catalog-heroes.json`,
];

/**
 * Two estates, and they are not interchangeable. BBUAT splits capped from
 * uncapped, which is what the two reference roles need; the original estate is
 * organised by thread size and holds products BBUAT does not.
 */
const ESTATES = [
  { id: "bbuat", root: `${CLIENT_ROOT}/BBUAT-Upload-Files` },
  { id: "original", root: `${CLIENT_ROOT}/Best-Bottles-Original-Photoshop-Sources` },
];

/**
 * Out of scope for the hero program (Jordan, 2026-09-19). These are not bottles,
 * have no Photoshop source in either estate, and were the bulk of the tier-4
 * pile. Pass --include-out-of-scope to see them anyway.
 */
const OUT_OF_SCOPE_FAMILIES = new Set(["gift bag", "gift box"]);

const getArg = (flag: string, fallback = "") => {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1]! : fallback;
};
const familyFilter = getArg("--family");
const outPath = resolve(getArg("--out", "tmp/bestbottles-generation/psd-source-coverage.json"));

/**
 * The estates abbreviate where the storefront SKU spells out. `Matt`->`Mt` and
 * `Sht`->`Sh` are safe. `Mtl` is NOT collapsed: the Tall Cylinder 9 ml tree
 * carries both `GBTallCyl9RollMtlBlkDot` and `GBTallCyl9RollBlkDot` -- a metal
 * roller ball and a plastic one, two different products that a normaliser
 * stripping `Mtl` would silently merge.
 */
const norm = (value: string): string =>
  String(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/MATT/g, "MT")
    .replace(/SHT/g, "SH")
    .replace(/SHINY/g, "SHN");

/**
 * Jordan 2026-09-19: the storefront's "25 ml" cylinder group is mislabelled --
 * the SKU and both estates call that same bottle 30 ml. Aliases are tried only
 * after an exact match fails.
 */
const aliases = (websiteSku: string): string[] => [
  websiteSku,
  websiteSku.replace(/cyl25/gi, "Cyl30"),
];

type Indexed = { rel: string; key: string; role: "identity-cap-on" | "pdp-cap-off-sidecar" | "unknown"; estate: string };

const index: Indexed[] = [];
for (const estate of ESTATES) {
  if (!existsSync(estate.root)) {
    console.warn(`estate missing, skipped: ${estate.root}`);
    continue;
  }
  const found = execFileSync("find", [estate.root, "-iname", "*.psd", "-o", "-iname", "*.psb"], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  })
    .trim()
    .split("\n")
    .filter(Boolean);
  for (const file of found) {
    const stem = file.split("/").pop()!.replace(/\.+(psd|psb)$/i, "").replace(/^\d+\.\s*/, "");
    const key = norm(stem);
    // Single-letter scratch files ("h.psd") match everything; drop them.
    if (key.length < 8) continue;
    const rel = file.replace(`${estate.root}/`, "");
    const role = /2\.\s*PSD Capped/i.test(rel)
      ? "identity-cap-on"
      : /1\.\s*PSD Uncapped/i.test(rel)
        ? "pdp-cap-off-sidecar"
        : "unknown";
    index.push({ rel: `${estate.id}:${rel}`, key, role, estate: estate.id });
  }
  console.log(`indexed ${found.length} files from ${estate.id}`);
}

type HeroRow = { groupSlug: string; websiteSku: string; graceSku: string; family?: string };
const catalogHeroesPath = CATALOG_HERO_CANDIDATES.find((candidate) => existsSync(candidate));
if (!catalogHeroesPath) throw new Error(`catalog-heroes.json not found in: ${CATALOG_HERO_CANDIDATES.join(", ")}`);
const registry = JSON.parse(readFileSync(catalogHeroesPath, "utf8")) as HeroRow[] | Record<string, HeroRow>;
const includeOutOfScope = process.argv.includes("--include-out-of-scope");
const allRows = Array.isArray(registry) ? registry : Object.values(registry);
const heroRows = allRows.filter((row) => {
  const family = (row.family ?? "").toLowerCase();
  if (!includeOutOfScope && OUT_OF_SCOPE_FAMILIES.has(family)) return false;
  return !familyFilter || family === familyFilter.toLowerCase();
});
const excluded = allRows.length - heroRows.length;
if (!includeOutOfScope && !familyFilter && excluded > 0) {
  console.log(`excluded ${excluded} row(s) in out-of-scope families: ${[...OUT_OF_SCOPE_FAMILIES].join(", ")}`);
}

// One hero per product group; the registry carries a few duplicate rows.
const byGroup = new Map<string, HeroRow>();
for (const row of heroRows) if (!byGroup.has(row.groupSlug)) byGroup.set(row.groupSlug, row);

type Result = {
  family: string;
  groupSlug: string;
  websiteSku: string;
  graceSku: string;
  match: "exact" | "alias" | "none";
  matchedOn: string | null;
  capOn: string | null;
  capOff: string | null;
  unknownRole: string | null;
};

const results: Result[] = [];
for (const row of byGroup.values()) {
  let hits: Indexed[] = [];
  let matchedOn: string | null = null;
  for (const candidate of aliases(row.websiteSku)) {
    const key = norm(candidate);
    const exact = index.filter((entry) => entry.key === key);
    if (exact.length > 0) {
      hits = exact;
      matchedOn = candidate;
      break;
    }
  }
  const pick = (role: Indexed["role"]) => hits.find((hit) => hit.role === role)?.rel ?? null;
  results.push({
    family: row.family ?? "?",
    groupSlug: row.groupSlug,
    websiteSku: row.websiteSku,
    graceSku: row.graceSku,
    match: hits.length === 0 ? "none" : matchedOn === row.websiteSku ? "exact" : "alias",
    matchedOn,
    capOn: pick("identity-cap-on"),
    capOff: pick("pdp-cap-off-sidecar"),
    unknownRole: pick("unknown"),
  });
}

type FamilySummary = {
  family: string;
  groups: number;
  sourced: number;
  bothRoles: number;
  capOffOnly: number;
  capOnOnly: number;
  roleUnknownOnly: number;
  none: number;
  coveragePct: number;
};

const families = new Map<string, FamilySummary>();
for (const result of results) {
  const summary = families.get(result.family) ?? {
    family: result.family,
    groups: 0,
    sourced: 0,
    bothRoles: 0,
    capOffOnly: 0,
    capOnOnly: 0,
    roleUnknownOnly: 0,
    none: 0,
    coveragePct: 0,
  };
  summary.groups += 1;
  if (result.match === "none") summary.none += 1;
  else {
    summary.sourced += 1;
    if (result.capOn && result.capOff) summary.bothRoles += 1;
    else if (result.capOff) summary.capOffOnly += 1;
    else if (result.capOn) summary.capOnOnly += 1;
    else summary.roleUnknownOnly += 1;
  }
  families.set(result.family, summary);
}
for (const summary of families.values()) {
  summary.coveragePct = Math.round((summary.sourced / summary.groups) * 1000) / 10;
}

const ordered = [...families.values()].sort((a, b) => b.sourced - a.sourced || b.groups - a.groups);
const totals = ordered.reduce(
  (acc, f) => ({
    groups: acc.groups + f.groups,
    sourced: acc.sourced + f.sourced,
    bothRoles: acc.bothRoles + f.bothRoles,
    none: acc.none + f.none,
  }),
  { groups: 0, sourced: 0, bothRoles: 0, none: 0 },
);

console.log(
  `\n${totals.groups} hero groups | PSD source located for ${totals.sourced} (${((totals.sourced / totals.groups) * 100).toFixed(0)}%) | both roles for ${totals.bothRoles} | no source for ${totals.none}\n`,
);
console.log("family".padEnd(18) + "groups  sourced  both  capOff  capOn  unk   none   cover");
for (const f of ordered) {
  console.log(
    f.family.padEnd(18) +
      String(f.groups).padStart(6) +
      String(f.sourced).padStart(9) +
      String(f.bothRoles).padStart(6) +
      String(f.capOffOnly).padStart(8) +
      String(f.capOnOnly).padStart(7) +
      String(f.roleUnknownOnly).padStart(5) +
      String(f.none).padStart(7) +
      `${String(f.coveragePct).padStart(7)}%`,
  );
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(
  outPath,
  `${JSON.stringify(
    {
      version: "best-bottles-psd-source-coverage-v1",
      generatedAt: new Date().toISOString(),
      note:
        "Planning artifact for the reference-prep lane. A located PSD is a candidate for " +
        "re-export at 2080x2288, NOT an approved reference. Promotion still requires a " +
        "human review signature; see docs/best-bottles-cylinder-reference-reexport-spec.md.",
      estates: ESTATES.map((e) => e.id),
      indexedFiles: index.length,
      totals,
      families: ordered,
      rows: results,
    },
    null,
    2,
  )}\n`,
);
console.log(`\nwrote ${outPath}`);
