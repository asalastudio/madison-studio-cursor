import fs from "node:fs";
import path from "node:path";
import process from "node:process";

type ManifestStatus =
  | "ready_to_index"
  | "needs_grace_sku"
  | "missing_source_image"
  | "possible_duplicate";

interface CliArgs {
  manifest?: string;
  rendersRoot?: string;
  targetRoot?: string;
  family?: string;
  status?: ManifestStatus;
  outJson?: string;
  outCsv?: string;
  apply?: boolean;
}

interface ManifestEntry {
  status: ManifestStatus;
  graceSku: string | null;
  websiteSku: string | null;
  family: string | null;
  productGroupSlug: string | null;
  proposedSourcePath: string | null;
  proposedCanonicalFilename: string | null;
  matchedDiskFileCount: number;
  duplicatePaths: string[];
}

interface ManifestPayload {
  entries: ManifestEntry[];
}

interface CopyPlanEntry {
  status: "ready_to_copy" | "blocked";
  dryRun: boolean;
  graceSku: string;
  websiteSku: string | null;
  family: string | null;
  productGroupSlug: string;
  sourcePath: string;
  targetPath: string;
  canonicalFilename: string;
  reason: string;
}

interface CopyPlanPayload {
  generatedAt: string;
  dryRun: boolean;
  filters: {
    family: string | null;
    status: ManifestStatus;
  };
  summary: {
    candidates: number;
    readyToCopy: number;
    blocked: number;
    copied: number;
  };
  entries: CopyPlanEntry[];
}

const ROOT = process.cwd();
const DEFAULT_MANIFEST = "tmp/best-bottles-render-reconciliation-manifest.json";
const DEFAULT_BB_RENDERS_ROOT =
  "/Users/jordanrichter/Projects/Clients/Nemat-International/Best-Bottles-Website-02-20-2026/pipeline/madison-hero-sync/renders";
const DEFAULT_TARGET_ROOT =
  "/Users/jordanrichter/Projects/Clients/Nemat-International/Best-Bottles-Website-02-20-2026/pipeline/aios-shopify-pdp-images/00-input/reference-flattened";
const DEFAULT_OUT_JSON = "tmp/best-bottles-canonical-image-copy-plan.json";
const DEFAULT_OUT_CSV = "tmp/best-bottles-canonical-image-copy-plan.csv";

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") {
      args.apply = true;
      continue;
    }
    const next = argv[i + 1];
    if (!arg.startsWith("--")) continue;
    if (!next || next.startsWith("--")) {
      throw new Error(`Missing value for ${arg}`);
    }
    i += 1;
    if (arg === "--manifest") args.manifest = next;
    else if (arg === "--renders-root") args.rendersRoot = next;
    else if (arg === "--target-root") args.targetRoot = next;
    else if (arg === "--family") args.family = next;
    else if (arg === "--status") args.status = next as ManifestStatus;
    else if (arg === "--out-json") args.outJson = next;
    else if (arg === "--out-csv") args.outCsv = next;
    else throw new Error(`Unknown argument ${arg}`);
  }
  return args;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function ensureParentDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function csvEscape(value: unknown): string {
  const text = String(value ?? "");
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function writeCsv(filePath: string, entries: CopyPlanEntry[]): void {
  ensureParentDir(filePath);
  const columns: Array<keyof CopyPlanEntry> = [
    "status",
    "dryRun",
    "graceSku",
    "websiteSku",
    "family",
    "productGroupSlug",
    "sourcePath",
    "targetPath",
    "canonicalFilename",
    "reason",
  ];
  const rows = [
    columns.join(","),
    ...entries.map((entry) => columns.map((column) => csvEscape(entry[column])).join(",")),
  ];
  fs.writeFileSync(filePath, `${rows.join("\n")}\n`);
}

function buildPlan(
  manifest: ManifestPayload,
  options: Required<Pick<CliArgs, "rendersRoot" | "targetRoot">> & {
    family: string | null;
    status: ManifestStatus;
    dryRun: boolean;
  },
): CopyPlanPayload {
  const familyFilter = options.family?.trim().toLowerCase() ?? null;
  const candidates = manifest.entries.filter((entry) => {
    if (entry.status !== options.status) return false;
    if (!familyFilter) return true;
    return entry.family?.trim().toLowerCase() === familyFilter;
  });

  let copied = 0;
  const entries = candidates.map((entry): CopyPlanEntry => {
    const sourcePath = entry.proposedSourcePath
      ? path.join(options.rendersRoot, entry.proposedSourcePath)
      : "";
    const productGroupSlug = entry.productGroupSlug ?? "";
    const canonicalFilename = entry.proposedCanonicalFilename ?? "";
    const targetPath = productGroupSlug && canonicalFilename
      ? path.join(options.targetRoot, productGroupSlug, canonicalFilename)
      : "";

    const missingParts = [
      !entry.graceSku ? "missing Grace SKU" : "",
      !entry.proposedSourcePath ? "missing proposed source path" : "",
      !fs.existsSync(sourcePath) ? "source file does not exist" : "",
      !productGroupSlug ? "missing product group slug" : "",
      !canonicalFilename ? "missing canonical filename" : "",
    ].filter(Boolean);

    if (missingParts.length > 0) {
      return {
        status: "blocked",
        dryRun: options.dryRun,
        graceSku: entry.graceSku ?? "",
        websiteSku: entry.websiteSku,
        family: entry.family,
        productGroupSlug,
        sourcePath,
        targetPath,
        canonicalFilename,
        reason: missingParts.join("; "),
      };
    }

    if (!options.dryRun) {
      ensureParentDir(targetPath);
      fs.copyFileSync(sourcePath, targetPath);
      copied += 1;
    }

    return {
      status: "ready_to_copy",
      dryRun: options.dryRun,
      graceSku: entry.graceSku ?? "",
      websiteSku: entry.websiteSku,
      family: entry.family,
      productGroupSlug,
      sourcePath,
      targetPath,
      canonicalFilename,
      reason: options.dryRun
        ? "Dry run: canonical copy is ready but was not performed."
        : "Copied source image to canonical Grace SKU filename.",
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    dryRun: options.dryRun,
    filters: {
      family: options.family,
      status: options.status,
    },
    summary: {
      candidates: candidates.length,
      readyToCopy: entries.filter((entry) => entry.status === "ready_to_copy").length,
      blocked: entries.filter((entry) => entry.status === "blocked").length,
      copied,
    },
    entries,
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const manifestPath = args.manifest ?? DEFAULT_MANIFEST;
  const outJson = args.outJson ?? DEFAULT_OUT_JSON;
  const outCsv = args.outCsv ?? DEFAULT_OUT_CSV;
  const manifest = readJson<ManifestPayload>(manifestPath);
  const plan = buildPlan(manifest, {
    rendersRoot: args.rendersRoot ?? DEFAULT_BB_RENDERS_ROOT,
    targetRoot: args.targetRoot ?? DEFAULT_TARGET_ROOT,
    family: args.family ?? null,
    status: args.status ?? "possible_duplicate",
    dryRun: !args.apply,
  });

  ensureParentDir(outJson);
  fs.writeFileSync(outJson, JSON.stringify(plan, null, 2));
  writeCsv(outCsv, plan.entries);

  console.log(JSON.stringify({
    summary: plan.summary,
    dryRun: plan.dryRun,
    outJson: path.resolve(ROOT, outJson),
    outCsv: path.resolve(ROOT, outCsv),
  }, null, 2));
}

main();
