#!/usr/bin/env tsx
/**
 * Turn the PSD source coverage index into a work order per family.
 *
 * The program document says which families can be prepared; this says which
 * exact files to open. Cowork should be able to pick one family, open one CSV,
 * and re-export from the listed paths without searching two estates of ~10,800
 * Photoshop files or guessing which role a file fills.
 *
 * Run `index-psd-source-coverage.ts` first; this reads its artifact.
 *
 *   npx tsx scripts/best-bottles/emit-reference-work-orders.ts
 *
 * Flags: --coverage <path>  --out <dir>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { readFileSync } from "node:fs";

import { resolveBestBottlesHeroReferenceRole } from "../../src/lib/bestBottlesHeroPresentation";

const getArg = (flag: string, fallback: string) => {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1]! : fallback;
};
const coveragePath = resolve(getArg("--coverage", "tmp/bestbottles-generation/psd-source-coverage.json"));
const outDir = resolve(getArg("--out", "public/data/reference-exports/work-orders"));

type Row = {
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
type Coverage = { generatedAt: string; totals: Record<string, number>; rows: Row[] };

const coverage = JSON.parse(readFileSync(coveragePath, "utf8")) as Coverage;
const slug = (family: string) => family.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Ordered by how little thinking the family needs before work can start. */
const tierOf = (rows: Row[]): { tier: number; label: string } => {
  const sourced = rows.filter((row) => row.match !== "none").length;
  const both = rows.filter((row) => row.capOn && row.capOff).length;
  const unknownOnly = rows.filter((row) => row.match !== "none" && !row.capOn && !row.capOff).length;
  if (sourced === 0) return { tier: 4, label: "no source — needs photography or a scope decision" };
  if (sourced === rows.length && both >= rows.length / 2) return { tier: 1, label: "fully sourced — start here" };
  if (unknownOnly > sourced / 2) return { tier: 3, label: "role needs a human call before export" };
  return { tier: 2, label: "high coverage, a few gaps" };
};

const csvCell = (value: string | null) => {
  const text = value ?? "";
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const byFamily = new Map<string, Row[]>();
for (const row of coverage.rows) byFamily.set(row.family, [...(byFamily.get(row.family) ?? []), row]);

mkdirSync(outDir, { recursive: true });
const index: Array<{ family: string; file: string; tier: number; label: string; groups: number; sourced: number; both: number }> = [];

for (const [family, rows] of byFamily) {
  const { tier, label } = tierOf(rows);
  const sourced = rows.filter((row) => row.match !== "none");
  const both = rows.filter((row) => row.capOn && row.capOff);
  const file = `${slug(family)}.csv`;

  const lines = [
    [
      "groupSlug",
      "websiteSku",
      "graceSku",
      "exportFileName",
      "role",
      "psdEstate",
      "psdPath",
      "status",
      "heroRole",
      "note",
    ].join(","),
  ];

  for (const row of rows.sort((a, b) => a.groupSlug.localeCompare(b.groupSlug))) {
    const exportName = `${row.websiteSku}__${row.graceSku}.png`;
    const note = row.match === "alias" ? `matched via SKU alias "${row.matchedOn}" — storefront capacity label differs` : "";
    // The role the HERO is generated from. Export this one first; the other
    // role still matters for PDP imagery but does not gate the hero.
    const heroRole = resolveBestBottlesHeroReferenceRole(row);
    const emit = (role: string, located: string | null, status: string) => {
      const [estate, ...rest] = (located ?? "").split(":");
      lines.push(
        [row.groupSlug, row.websiteSku, row.graceSku, exportName, role, located ? estate! : "", located ? rest.join(":") : "", status, role === heroRole ? "hero" : "", note]
          .map(csvCell)
          .join(","),
      );
    };
    if (row.match === "none") {
      emit("identity-cap-on", null, "no-source");
      emit("pdp-cap-off-sidecar", null, "no-source");
      continue;
    }
    emit("identity-cap-on", row.capOn, row.capOn ? "ready" : "missing-role");
    emit("pdp-cap-off-sidecar", row.capOff, row.capOff ? "ready" : "missing-role");
    if (!row.capOn && !row.capOff && row.unknownRole) {
      emit("UNDECIDED", row.unknownRole, "needs-role-decision");
    }
  }

  writeFileSync(join(outDir, file), `${lines.join("\n")}\n`);
  index.push({ family, file, tier, label, groups: rows.length, sourced: sourced.length, both: both.length });
}

index.sort((a, b) => a.tier - b.tier || b.sourced - a.sourced || b.groups - a.groups);

const readme = [
  "# Reference re-export work orders",
  "",
  `Generated ${coverage.generatedAt} from \`${coveragePath.split("/").slice(-1)[0]}\`.`,
  "Regenerate: `npx tsx scripts/best-bottles/index-psd-source-coverage.ts && npx tsx scripts/best-bottles/emit-reference-work-orders.ts`",
  "",
  "One CSV per family. Each row is one **role** of one hero group, with the exact",
  "Photoshop file to open. Export to `2080x2288`, opaque, Bone `#F5F3EF`, and save",
  "as `exportFileName` inside the matching role folder — see",
  "`docs/best-bottles-file-naming-contract.md`.",
  "",
  "A located PSD is a candidate for re-export, **not** an approved reference.",
  "Promotion additionally requires a human review signature.",
  "",
  "| Tier | Family | Groups | Sourced | Both roles | Work order |",
  "|---|---|---|---|---|---|",
  ...index.map((entry) => `| ${entry.tier} | ${entry.family} | ${entry.groups} | ${entry.sourced} | ${entry.both} | [\`${entry.file}\`](${entry.file}) |`),
  "",
  "**Tier 1** fully sourced, start here · **Tier 2** high coverage, a few gaps ·",
  "**Tier 3** role needs a human call · **Tier 4** no source, needs photography or",
  "a scope decision.",
  "",
  "## Status values",
  "",
  "| Status | Meaning |",
  "|---|---|",
  "| `ready` | PSD located for this role; re-export it |",
  "| `missing-role` | the other role was found, this one was not |",
  "| `needs-role-decision` | a source exists but sits outside the capped/uncapped trees |",
  "| `no-source` | nothing found in either estate |",
  "",
].join("\n");

writeFileSync(join(outDir, "README.md"), `${readme}\n`);

console.log(`${index.length} work orders -> ${outDir}\n`);
console.log("tier  family".padEnd(28) + "groups  sourced  both");
for (const entry of index) {
  console.log(
    `  ${entry.tier}   ` +
      entry.family.padEnd(22) +
      String(entry.groups).padStart(5) +
      String(entry.sourced).padStart(9) +
      String(entry.both).padStart(6),
  );
}
