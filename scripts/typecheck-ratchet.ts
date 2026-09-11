#!/usr/bin/env tsx
/**
 * Fail on NEW TypeScript errors without demanding the backlog be cleared first.
 *
 * `tsc --noEmit` reports ~1,200 pre-existing errors in this repo, so a plain
 * `tsc` gate can never be switched on — which is why type regressions have been
 * landing unnoticed. This compares the current errors against a committed
 * baseline and fails only on signatures that are not already in it.
 *
 * Signatures deliberately exclude line and column numbers: inserting an import
 * shifts every error below it, and a gate that fires on that is a gate people
 * turn off. A signature is `path(TSxxxx): message`, so the same defect moving
 * down a file is still the same defect, while a genuinely new one stands out.
 *
 * Usage:
 *   npm run typecheck:ratchet             # fail on new errors
 *   npm run typecheck:ratchet -- --update # re-record the baseline after fixing some
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const BASELINE_PATH = "typecheck-baseline.txt";
const TSCONFIG = "tsconfig.app.json";

/** `src/x.tsx(12,5): error TS6133: 'a' is declared...` -> `src/x.tsx(TS6133): 'a' is declared...` */
function toSignature(line: string): string | null {
  const match = line.match(/^(.+?)\(\d+,\d+\): error (TS\d+): (.*)$/);
  if (!match) return null;
  const [, file, code, message] = match;
  return `${file}(${code}): ${message}`;
}

function currentSignatures(): string[] {
  let output = "";
  try {
    output = execFileSync("npx", ["tsc", "-p", TSCONFIG, "--noEmit"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    // tsc exits non-zero whenever there are errors, which is the normal case here.
    const execError = error as { stdout?: string; stderr?: string };
    output = `${execError.stdout ?? ""}${execError.stderr ?? ""}`;
    if (!output.trim()) throw error;
  }
  return output
    .split("\n")
    .map(toSignature)
    .filter((signature): signature is string => signature !== null);
}

function main(): void {
  const update = process.argv.includes("--update");
  const signatures = currentSignatures();

  if (update) {
    const sorted = [...new Set(signatures)].sort();
    writeFileSync(BASELINE_PATH, `${sorted.join("\n")}\n`);
    console.log(`Baseline updated: ${sorted.length} distinct error signatures.`);
    return;
  }

  if (!existsSync(BASELINE_PATH)) {
    console.error(`No ${BASELINE_PATH}. Create it with: npm run typecheck:ratchet -- --update`);
    process.exitCode = 1;
    return;
  }

  const baseline = new Set(
    readFileSync(BASELINE_PATH, "utf8").split("\n").map((l) => l.trim()).filter(Boolean),
  );

  // Count occurrences so a second copy of an existing signature still trips the
  // gate — otherwise duplicating a broken pattern would slip through.
  const counts = new Map<string, number>();
  for (const signature of signatures) counts.set(signature, (counts.get(signature) ?? 0) + 1);

  const introduced: string[] = [];
  for (const [signature, count] of counts) {
    if (!baseline.has(signature)) introduced.push(`${signature}${count > 1 ? ` (x${count})` : ""}`);
  }

  const distinctNow = counts.size;
  const fixed = [...baseline].filter((signature) => !counts.has(signature));

  if (introduced.length > 0) {
    console.error(`\n${introduced.length} NEW TypeScript error signature(s):\n`);
    for (const signature of introduced.sort()) console.error(`  ${signature}`);
    console.error(
      `\nBaseline: ${baseline.size} signatures. Now: ${distinctNow}.\n` +
        "Fix these, or re-record with `npm run typecheck:ratchet -- --update` if they are intentional.",
    );
    process.exitCode = 1;
    return;
  }

  console.log(`No new TypeScript errors. ${distinctNow} signature(s) against a baseline of ${baseline.size}.`);
  if (fixed.length > 0) {
    console.log(
      `${fixed.length} baseline error(s) no longer occur — tighten the ratchet with ` +
        "`npm run typecheck:ratchet -- --update`.",
    );
  }
}

main();
