import fs from "node:fs";
import path from "node:path";
import process from "node:process";

interface CliArgs {
  readiness?: string;
  outJson?: string;
  outCsv?: string;
  report?: string;
}

interface ReadinessPayload {
  generatedAt?: string;
  sourceOfTruthDate?: string | null;
  rows?: ReadinessRow[];
}

interface ReadinessRow {
  status: string;
  issues: string[];
  graceSku: string;
  websiteSku: string | null;
  productId: string | null;
  sourceId: string | null;
  productGroupId: string | null;
  productGroupSlug: string;
  productGroupDisplayName: string;
  family: string | null;
  category: string | null;
  capacityMl: string | null;
  color: string | null;
  applicator: string | null;
  capStyle: string | null;
  capColor: string | null;
  heightWithoutCap: string | null;
  diameter: string | null;
  measurementSource: string;
  bestReferenceCandidatePath: string | null;
}

interface BatchDefinition {
  id: string;
  launchOrder: number;
  family: string;
  limit: number | null;
  purpose: string;
}

interface BatchRow extends ReadinessRow {
  batchId: string;
  launchOrder: number;
  batchPurpose: string;
}

const ROOT = process.cwd();
const DEFAULT_READINESS = "tmp/best-bottles-generation-readiness.json";
const DEFAULT_OUT_JSON = "tmp/best-bottles-first-controlled-batch.json";
const DEFAULT_OUT_CSV = "tmp/best-bottles-first-controlled-batch.csv";
const DEFAULT_REPORT = "docs/best-bottles-first-controlled-batch.md";

const BATCHES: BatchDefinition[] = [
  {
    id: "aluminum-material-validation",
    launchOrder: 1,
    family: "Aluminum Bottle",
    limit: null,
    purpose: "Small material-validation run for the aluminum prompt policy. Confirms opaque brushed/satin metal stays metal and does not drift toward glass.",
  },
  {
    id: "cylinder-stress-test",
    launchOrder: 2,
    family: "Cylinder",
    limit: 24,
    purpose: "High-volume smoke run across Cylinder product groups. Good practical stress test before opening the full queue.",
  },
  {
    id: "empire-shape-qa",
    launchOrder: 3,
    family: "Empire",
    limit: 16,
    purpose: "Shape-sensitive QA run for the square-prism Empire silhouette and cap/fitment variation handling.",
  },
];

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (!arg.startsWith("--")) continue;
    if (!next || next.startsWith("--")) {
      throw new Error(`Missing value for ${arg}`);
    }
    i += 1;
    if (arg === "--readiness") args.readiness = next;
    else if (arg === "--out-json") args.outJson = next;
    else if (arg === "--out-csv") args.outCsv = next;
    else if (arg === "--report") args.report = next;
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

function byStableSku(a: ReadinessRow, b: ReadinessRow): number {
  return [
    a.productGroupSlug,
    a.capacityMl ?? "",
    a.applicator ?? "",
    a.color ?? "",
    a.graceSku,
  ].join("|").localeCompare([
    b.productGroupSlug,
    b.capacityMl ?? "",
    b.applicator ?? "",
    b.color ?? "",
    b.graceSku,
  ].join("|"));
}

function selectBalancedFamilyRows(rows: ReadinessRow[], batch: BatchDefinition): BatchRow[] {
  const familyRows = rows
    .filter((row) => row.status === "ready" && row.family === batch.family)
    .sort(byStableSku);
  const groups = new Map<string, ReadinessRow[]>();
  for (const row of familyRows) {
    const key = row.productGroupSlug || row.graceSku;
    const groupRows = groups.get(key) ?? [];
    groupRows.push(row);
    groups.set(key, groupRows);
  }

  const selected: ReadinessRow[] = [];
  const groupKeys = [...groups.keys()].sort();
  let madeProgress = true;
  while (madeProgress && (batch.limit == null || selected.length < batch.limit)) {
    madeProgress = false;
    for (const key of groupKeys) {
      if (batch.limit != null && selected.length >= batch.limit) break;
      const groupRows = groups.get(key);
      const next = groupRows?.shift();
      if (!next) continue;
      selected.push(next);
      madeProgress = true;
    }
  }

  return selected.map((row) => ({
    ...row,
    batchId: batch.id,
    launchOrder: batch.launchOrder,
    batchPurpose: batch.purpose,
  }));
}

function csvEscape(value: unknown): string {
  const text = Array.isArray(value)
    ? value.join("; ")
    : value == null
      ? ""
      : String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(rows: BatchRow[]): string {
  const headers: Array<keyof BatchRow> = [
    "batchId",
    "launchOrder",
    "batchPurpose",
    "family",
    "graceSku",
    "websiteSku",
    "productId",
    "sourceId",
    "productGroupSlug",
    "productGroupDisplayName",
    "category",
    "capacityMl",
    "color",
    "applicator",
    "capStyle",
    "capColor",
    "heightWithoutCap",
    "diameter",
    "measurementSource",
    "bestReferenceCandidatePath",
    "issues",
  ];
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ].join("\n");
}

function countRows(rows: BatchRow[], batchId: string): number {
  return rows.filter((row) => row.batchId === batchId).length;
}

function buildReport(params: {
  readinessPath: string;
  outJsonPath: string;
  outCsvPath: string;
  rows: BatchRow[];
  readiness: ReadinessPayload;
}): string {
  const { rows } = params;
  return [
    "# Best Bottles First Controlled Batch",
    "",
    "This manifest is generated by `npm run bestbottles:generation:first-batch` after the readiness report is refreshed.",
    "",
    "## Sources",
    "",
    `- Readiness JSON: ${params.readinessPath}`,
    `- JSON output: ${params.outJsonPath}`,
    `- CSV output: ${params.outCsvPath}`,
    `- Readiness generated at: ${params.readiness.generatedAt ?? "unknown"}`,
    `- Source-of-truth date: ${params.readiness.sourceOfTruthDate ?? "unknown"}`,
    "",
    "## Launch Order",
    "",
    "| Order | Batch | Family | Rows | Purpose |",
    "| ---: | --- | --- | ---: | --- |",
    ...BATCHES.map(
      (batch) =>
        `| ${batch.launchOrder} | ${batch.id} | ${batch.family} | ${countRows(rows, batch.id)} | ${batch.purpose} |`,
    ),
    "",
    "## Batch Rows",
    "",
    "| Batch | Grace SKU | Website SKU | Group | Capacity | Applicator | Color | Reference |",
    "| --- | --- | --- | --- | ---: | --- | --- | --- |",
    ...rows.map(
      (row) =>
        `| ${row.batchId} | ${row.graceSku} | ${row.websiteSku ?? ""} | ${row.productGroupSlug} | ${row.capacityMl ?? ""} | ${row.applicator ?? ""} | ${row.color ?? ""} | ${row.bestReferenceCandidatePath ?? ""} |`,
    ),
    "",
    "## Guardrails",
    "",
    "- Generate in launch order, review every image before expanding the queue.",
    "- Aluminum should remain opaque brushed/satin metal with no glass transparency.",
    "- Cylinder should preserve height-to-diameter ratios and avoid cap over-scaling.",
    "- Empire should preserve square-prism depth, sharp vertical edges, and heavy base geometry.",
    "",
  ].join("\n");
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const readinessPath = path.resolve(ROOT, args.readiness ?? DEFAULT_READINESS);
  const outJsonPath = path.resolve(ROOT, args.outJson ?? DEFAULT_OUT_JSON);
  const outCsvPath = path.resolve(ROOT, args.outCsv ?? DEFAULT_OUT_CSV);
  const reportPath = path.resolve(ROOT, args.report ?? DEFAULT_REPORT);

  const readiness = readJson<ReadinessPayload>(readinessPath);
  const readinessRows = readiness.rows ?? [];
  const batchRows = BATCHES.flatMap((batch) => selectBalancedFamilyRows(readinessRows, batch));

  ensureParentDir(outJsonPath);
  ensureParentDir(outCsvPath);
  ensureParentDir(reportPath);

  fs.writeFileSync(
    outJsonPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        readinessGeneratedAt: readiness.generatedAt ?? null,
        sourceOfTruthDate: readiness.sourceOfTruthDate ?? null,
        sources: {
          readiness: readinessPath,
        },
        batchDefinitions: BATCHES,
        summary: {
          totalRows: batchRows.length,
          batches: Object.fromEntries(BATCHES.map((batch) => [batch.id, countRows(batchRows, batch.id)])),
        },
        rows: batchRows,
      },
      null,
      2,
    )}\n`,
  );
  fs.writeFileSync(outCsvPath, `${toCsv(batchRows)}\n`);
  fs.writeFileSync(
    reportPath,
    buildReport({
      readinessPath,
      outJsonPath,
      outCsvPath,
      rows: batchRows,
      readiness,
    }),
  );

  console.log(`Wrote ${batchRows.length} first controlled batch rows`);
  console.log(`JSON: ${outJsonPath}`);
  console.log(`CSV: ${outCsvPath}`);
  console.log(`Report: ${reportPath}`);
  console.log(Object.fromEntries(BATCHES.map((batch) => [batch.id, countRows(batchRows, batch.id)])));
}

main();
