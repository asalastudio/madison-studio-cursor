#!/usr/bin/env tsx
/**
 * Deploy exactly the edge functions a change set affects — including the ones
 * it affects only indirectly.
 *
 * Supabase bundles each function with a private copy of whatever it imports
 * from `_shared/`, so editing one shared module leaves every function that
 * imports it running stale code until each is redeployed individually. Nothing
 * warns you. That is how production drifted from `main` during the 2026-09-11
 * audit: a one-line fix in `geminiClient.ts` needed thirteen separate deploys,
 * and the set had to be derived by hand, twice.
 *
 * This walks the import graph transitively, intersects it with what is actually
 * deployed, and preserves each function's existing `verify_jwt` setting — a
 * plain `functions deploy` silently re-enables JWT verification on a function
 * that was deliberately deployed without it.
 *
 * Usage:
 *   npm run deploy:affected -- --dry-run             # plan only (no auth needed)
 *   npm run deploy:affected                          # deploy vs origin/main
 *   npm run deploy:affected -- --since HEAD~4        # deploy vs another ref
 *   npm run deploy:affected -- --include-new         # also create never-deployed functions
 *
 * Requires `supabase login` for anything but --dry-run.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

const FUNCTIONS_ROOT = "supabase/functions";
const SHARED_DIR = join(FUNCTIONS_ROOT, "_shared");

interface Args {
  since: string;
  dryRun: boolean;
  includeNew: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { since: "origin/main", dryRun: false, includeNew: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dry-run") args.dryRun = true;
    else if (argv[i] === "--include-new") args.includeNew = true;
    else if (argv[i] === "--since") {
      const value = argv[++i];
      if (!value) throw new Error("--since requires a git ref");
      args.since = value;
    }
  }
  return args;
}

function run(cmd: string, cmdArgs: string[]): string {
  return execFileSync(cmd, cmdArgs, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
}

/** Relative imports a file makes, e.g. `../_shared/geminiClient.ts`. */
function relativeImports(path: string): string[] {
  if (!existsSync(path)) return [];
  const source = readFileSync(path, "utf8");
  return [...source.matchAll(/from\s+"\.{1,2}\/([A-Za-z0-9_./-]+\.ts)"/g)].map((m) => m[1]);
}

/**
 * Does this shared module pull in a changed one, at any depth? `_shared` files
 * import each other, so a function three hops from the edit still needs a
 * redeploy.
 */
function sharedModuleIsStale(
  name: string,
  changedShared: Set<string>,
  seen = new Set<string>(),
): boolean {
  if (seen.has(name)) return false;
  seen.add(name);
  if (changedShared.has(name)) return true;
  return relativeImports(join(SHARED_DIR, name))
    .some((imported) => sharedModuleIsStale(basename(imported), changedShared, seen));
}

function affectedFunctions(changedPaths: string[]): string[] {
  const changedInFunctions = new Set(changedPaths.filter((p) => p.startsWith(`${FUNCTIONS_ROOT}/`)));
  const changedShared = new Set(
    [...changedInFunctions].filter((p) => p.includes("/_shared/")).map((p) => basename(p)),
  );

  const affected: string[] = [];
  for (const entry of readdirSync(FUNCTIONS_ROOT).sort()) {
    const indexPath = join(FUNCTIONS_ROOT, entry, "index.ts");
    if (!existsSync(indexPath)) continue;

    if (changedInFunctions.has(indexPath)) {
      affected.push(entry);
      continue;
    }
    const dependsOnStaleShared = relativeImports(indexPath).some(
      (imported) =>
        imported.includes("_shared/") && sharedModuleIsStale(basename(imported), changedShared),
    );
    if (dependsOnStaleShared) affected.push(entry);
  }
  return affected;
}

/** slug -> verify_jwt, for functions that currently exist in the project. */
function deployedFunctions(): Map<string, boolean> {
  const raw = run("npx", ["supabase", "functions", "list"]);
  const deployed = new Map<string, boolean>();
  for (const match of raw.matchAll(/"slug":"([^"]+)"[\s\S]{0,600}?"verify_jwt":(true|false)/g)) {
    deployed.set(match[1], match[2] === "true");
  }
  if (deployed.size === 0) {
    throw new Error(
      "Could not read deployed functions. Run `npx supabase login` first.\n" +
        `Supabase replied: ${raw.trim().slice(0, 300)}`,
    );
  }
  return deployed;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  const changed = run("git", ["diff", "--name-only", `${args.since}...HEAD`])
    .split("\n")
    .filter(Boolean);
  const affected = affectedFunctions(changed);

  if (affected.length === 0) {
    console.log(`No edge functions affected by changes since ${args.since}.`);
    return;
  }

  console.log(`Changes since ${args.since} affect ${affected.length} edge function(s).\n`);

  let deployed: Map<string, boolean>;
  try {
    deployed = deployedFunctions();
  } catch (error) {
    if (!args.dryRun) throw error;
    console.log("(not authenticated — listing the affected set only)\n");
    for (const slug of affected) console.log(`   ${slug}`);
    return;
  }

  const toDeploy = affected.filter((slug) => deployed.has(slug));
  const neverDeployed = affected.filter((slug) => !deployed.has(slug));

  for (const slug of toDeploy) {
    console.log(`   ${slug.padEnd(38)} verify_jwt=${deployed.get(slug)}`);
  }
  if (neverDeployed.length > 0) {
    const verb = args.includeNew ? "will be CREATED" : "skipped (never deployed)";
    console.log(`\n${neverDeployed.length} ${verb}:`);
    for (const slug of neverDeployed) console.log(`   ${slug}`);
    if (!args.includeNew) {
      console.log("\n   Creating a new production endpoint is a separate decision —");
      console.log("   pass --include-new once you have made it.");
    }
  }

  const plan = args.includeNew ? [...toDeploy, ...neverDeployed] : toDeploy;
  if (args.dryRun) {
    console.log(`\nDry run — would deploy ${plan.length} function(s).`);
    return;
  }

  console.log(`\nDeploying ${plan.length} function(s)…\n`);
  const failures: string[] = [];
  for (const slug of plan) {
    // A function deployed without JWT verification must keep that setting;
    // omitting the flag silently turns verification back on and 401s callers.
    const flags = deployed.get(slug) === false ? ["--no-verify-jwt"] : [];
    process.stdout.write(`   ${slug.padEnd(38)}`);
    try {
      run("npx", ["supabase", "functions", "deploy", slug, ...flags]);
      console.log(flags.length > 0 ? "✓ (--no-verify-jwt)" : "✓");
    } catch (error) {
      console.log("✗");
      failures.push(slug);
      const detail = error instanceof Error ? error.message : String(error);
      console.log(`      ${detail.split("\n").slice(-3).join("\n      ")}`);
    }
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} deploy(s) failed: ${failures.join(", ")}`);
    process.exitCode = 1;
    return;
  }
  console.log(`\nAll ${plan.length} function(s) deployed.`);
}

main();
