#!/usr/bin/env tsx
/**
 * Validate a Cowork reference-export drop, and normalise its names.
 *
 * Everything downstream is content-addressed and unforgiving: the promotion
 * script rejects anything that is not an opaque 2080x2288 PNG, and the
 * generation guard requires byte-identity with the approved reference. A drop
 * that is wrong in any of those ways should fail here, in seconds, rather than
 * three steps later with a hash mismatch.
 *
 * Expected layout (one dated drop per family):
 *
 *   public/data/reference-exports/<family>/<YYYY-MM-DD>/
 *     identity-cap-on/<websiteSku>__<graceSku>.png
 *     pdp-cap-off-sidecar/<websiteSku>__<graceSku>.png
 *
 * The role is the folder, never the filename: role is the one thing a reviewer
 * must not be able to get wrong by typo. Both SKUs are in the filename because
 * the promotion identity key is the exact (websiteSku, graceSku) pair.
 *
 *   npx tsx scripts/best-bottles/validate-reference-export-drop.ts <drop-dir>
 *   npx tsx scripts/best-bottles/validate-reference-export-drop.ts <drop-dir> --fix-names
 *
 * --fix-names renames files that differ only in case or separator to the
 * canonical form. It never invents a mapping and never touches pixels.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

import sharp from "sharp";

const CLIENT_ROOT = "/Users/jordanrichter/Projects/Clients/Nemat-International";
const CATALOG_HERO_CANDIDATES = [
  `${CLIENT_ROOT}/Best-Bottles-Website-02-20-2026/.claude/worktrees/sunburst-heroes-release-7/src/lib/products/catalog-heroes.json`,
  `${CLIENT_ROOT}/Best-Bottles-Website-02-20-2026/src/lib/products/catalog-heroes.json`,
];

const ROLES = ["identity-cap-on", "pdp-cap-off-sidecar"] as const;
type Role = (typeof ROLES)[number];

const REQUIRED_WIDTH = 2080;
const REQUIRED_HEIGHT = 2288;
const BONE = [245, 243, 239] as const;
const CORNER_TOLERANCE = 2;

const dropDir = resolve(process.argv[2] ?? "");
const fixNames = process.argv.includes("--fix-names");
if (!process.argv[2] || !existsSync(dropDir)) {
  console.error("usage: validate-reference-export-drop.ts <drop-dir> [--fix-names]");
  process.exit(1);
}

type HeroRow = { groupSlug: string; websiteSku: string; graceSku: string; family?: string };
const registryPath = CATALOG_HERO_CANDIDATES.find((candidate) => existsSync(candidate));
if (!registryPath) throw new Error("catalog-heroes.json not found");
const registry = JSON.parse(readFileSync(registryPath, "utf8")) as HeroRow[] | Record<string, HeroRow>;
const heroRows = Array.isArray(registry) ? registry : Object.values(registry);

const canonKey = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");
const bySku = new Map<string, HeroRow>();
for (const row of heroRows) {
  bySku.set(canonKey(row.websiteSku), row);
  bySku.set(canonKey(row.graceSku), row);
}

type Finding = {
  role: Role;
  file: string;
  websiteSku: string | null;
  graceSku: string | null;
  groupSlug: string | null;
  canonicalName: string | null;
  sha256: string | null;
  problems: string[];
  renamedFrom?: string;
};

const findings: Finding[] = [];

for (const role of ROLES) {
  const roleDir = join(dropDir, role);
  if (!existsSync(roleDir)) continue;
  for (const name of readdirSync(roleDir).sort()) {
    if (!/\.png$/i.test(name)) {
      if (!/^\./.test(name)) {
        findings.push({ role, file: name, websiteSku: null, graceSku: null, groupSlug: null, canonicalName: null, sha256: null, problems: ["not a PNG"] });
      }
      continue;
    }
    const problems: string[] = [];
    const stem = basename(name, ".png");
    // `websiteSku__graceSku`; tolerate a single underscore or hyphen so a
    // near-miss can be reported as fixable rather than rejected outright.
    const parts = stem.split(/__|(?<=[A-Za-z0-9])_(?=[A-Za-z])/);
    const websiteCandidate = parts[0] ?? "";
    const graceCandidate = parts.slice(1).join("__");
    const row = bySku.get(canonKey(websiteCandidate)) ?? bySku.get(canonKey(graceCandidate)) ?? null;

    if (!row) problems.push(`filename does not resolve to a hero group (parsed "${websiteCandidate}")`);
    if (parts.length < 2) problems.push("filename must be <websiteSku>__<graceSku>.png");
    if (row && graceCandidate && canonKey(graceCandidate) !== canonKey(row.graceSku)) {
      problems.push(`grace SKU "${graceCandidate}" does not match the registry's "${row.graceSku}"`);
    }

    const filePath = join(roleDir, name);
    const bytes = readFileSync(filePath);
    const sha256 = createHash("sha256").update(bytes).digest("hex");

    try {
      const image = sharp(bytes, { failOn: "error" });
      const [metadata, stats] = await Promise.all([image.metadata(), image.stats()]);
      if (metadata.width !== REQUIRED_WIDTH || metadata.height !== REQUIRED_HEIGHT) {
        problems.push(`is ${metadata.width}x${metadata.height}, must be ${REQUIRED_WIDTH}x${REQUIRED_HEIGHT}`);
      }
      const alpha = stats.channels.find((channel) => channel.channel === "alpha");
      if (alpha && alpha.min < 255) problems.push("has transparent or partially transparent pixels");

      const { data, info } = await image.flatten({ background: { r: BONE[0], g: BONE[1], b: BONE[2] } }).raw().toBuffer({ resolveWithObject: true });
      const corners: number[][] = [[0, 0], [info.width - 1, 0], [0, info.height - 1], [info.width - 1, info.height - 1]].map(
        ([x, y]) => [0, 1, 2].map((channel) => data[(y! * info.width + x!) * info.channels + channel]!),
      );
      if (!corners.every((corner) => corner.every((value, i) => Math.abs(value - BONE[i]!) <= CORNER_TOLERANCE))) {
        problems.push(`corners are not Bone #F5F3EF within ${CORNER_TOLERANCE} (saw ${corners[0]!.join(",")})`);
      }
    } catch (error) {
      problems.push(`unreadable PNG: ${String(error).slice(0, 80)}`);
    }

    const canonicalName = row ? `${row.websiteSku}__${row.graceSku}.png` : null;
    const finding: Finding = {
      role,
      file: name,
      websiteSku: row?.websiteSku ?? null,
      graceSku: row?.graceSku ?? null,
      groupSlug: row?.groupSlug ?? null,
      canonicalName,
      sha256,
      problems,
    };

    if (fixNames && canonicalName && canonicalName !== name && problems.length === 0) {
      renameSync(filePath, join(roleDir, canonicalName));
      finding.renamedFrom = name;
      finding.file = canonicalName;
    } else if (canonicalName && canonicalName !== name) {
      problems.push(`should be named ${canonicalName} (run with --fix-names)`);
    }

    findings.push(finding);
  }
}

if (findings.length === 0) {
  console.error(`No PNGs found. Expected ${ROLES.map((role) => `${role}/`).join(" and ")} under ${dropDir}`);
  process.exit(1);
}

const clean = findings.filter((finding) => finding.problems.length === 0);
const broken = findings.filter((finding) => finding.problems.length > 0);
const renamed = findings.filter((finding) => finding.renamedFrom);

console.log(`drop: ${dropDir}`);
console.log(`${findings.length} PNG(s) — ${clean.length} pass, ${broken.length} need attention${renamed.length ? `, ${renamed.length} renamed` : ""}\n`);
for (const finding of renamed) console.log(`  renamed  ${finding.renamedFrom} -> ${finding.file}`);
for (const finding of broken) {
  console.log(`  FAIL  ${finding.role}/${finding.file}`);
  for (const problem of finding.problems) console.log(`          ${problem}`);
}

const byGroup = new Map<string, Set<Role>>();
for (const finding of clean) {
  if (!finding.groupSlug) continue;
  byGroup.set(finding.groupSlug, (byGroup.get(finding.groupSlug) ?? new Set()).add(finding.role));
}
const bothRoles = [...byGroup.values()].filter((roles) => roles.size === 2).length;
console.log(`\ngroups covered: ${byGroup.size} (${bothRoles} with both roles)`);

const manifestPath = join(dropDir, "manifest.json");
writeFileSync(
  manifestPath,
  `${JSON.stringify(
    {
      version: "best-bottles-reference-export-drop-v1",
      generatedAt: new Date().toISOString(),
      dropDir,
      note:
        "Validated export drop. A passing file is a CANDIDATE for promotion, not an " +
        "approved reference: promotion additionally requires a human review signature.",
      summary: { files: findings.length, pass: clean.length, fail: broken.length, groups: byGroup.size, bothRoles },
      rows: findings.map(({ renamedFrom, ...rest }) => rest),
    },
    null,
    2,
  )}\n`,
);
console.log(`wrote ${manifestPath}`);
process.exit(broken.length > 0 ? 1 : 0);
