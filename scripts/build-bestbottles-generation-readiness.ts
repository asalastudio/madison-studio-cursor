import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { FAMILY_BODY_SHAPE_DESCRIPTORS } from "../src/config/familyShapeDescriptors";

type ReadinessStatus =
  | "ready"
  | "needs-reference"
  | "needs-measurement"
  | "needs-prompt-policy"
  | "component-exception";

interface CliArgs {
  pipeline?: string;
  catalog?: string;
  measurementOverrides?: string;
  outJson?: string;
  publicOutJson?: string;
  outCsv?: string;
  report?: string;
}

interface PipelineProduct {
  action: string;
  coverageStatus: string;
  productId: string | null;
  sourceId: string | null;
  productGroupSlug: string;
  productGroupDisplayName: string;
  family: string | null;
  catalogReferencePages: string | null;
  category: string | null;
  capacityMl: string | null;
  applicator: string | null;
  canonicalColor: string | null;
  graceSku: string;
  websiteSku: string | null;
  expectedCanonicalFilename: string | null;
  bestReferenceCandidatePath: string | null;
  generatedCandidateCount: number;
  reviewCandidateCount: number;
  shopifyReadyCount: number;
  hasConvexImageUrl: string | null;
  hasShopifyProductId: string | null;
  hasShopifyVariantId: string | null;
}

interface PipelinePayload {
  summary?: {
    sourceOfTruthDate?: string;
    productVariants?: number;
    productGroups?: number;
    broadFamilies?: number;
    note?: string;
  };
  products?: PipelineProduct[];
}

interface CatalogProduct {
  _id: string;
  websiteSku: string | null;
  graceSku: string;
  productId: string | null;
  category: string | null;
  family: string | null;
  color: string | null;
  capacityMl: number | null;
  capacityOz: number | null;
  heightWithCap: string | null;
  heightWithoutCap: string | null;
  diameter: string | null;
  neckThreadSize: string | null;
  applicator: string | null;
  capStyle: string | null;
  capColor: string | null;
  bottleCollection: string | null;
  itemName: string | null;
  imageUrl: string | null;
  stockStatus: string | null;
  productGroupId: string | null;
}

interface CatalogPayload {
  source?: {
    rowCount?: number;
    comparison?: Record<string, unknown>;
  };
  products?: CatalogProduct[];
}

interface MeasurementOverride {
  graceSku: string;
  heightWithoutCap?: string | null;
  diameter?: string | null;
  source: string;
  sourceUrl?: string | null;
  note: string;
}

interface MeasurementOverridesPayload {
  notes?: string;
  overrides?: MeasurementOverride[];
}

interface ReadinessRow {
  status: ReadinessStatus;
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
  catalogHeightWithoutCap: string | null;
  catalogDiameter: string | null;
  measurementSource: "catalog" | "manual-override" | "missing";
  measurementOverrideSource: string | null;
  measurementOverrideUrl: string | null;
  measurementOverrideNote: string | null;
  neckThreadSize: string | null;
  hasReference: boolean;
  bestReferenceCandidatePath: string | null;
  promptPolicy: "explicit" | "missing" | "component-exception";
  promptPolicyDetail: string;
  coverageStatus: string;
  generatedCandidateCount: number;
  reviewCandidateCount: number;
  shopifyReadyCount: number;
  hasConvexImageUrl: string | null;
  expectedCanonicalFilename: string | null;
}

const ROOT = process.cwd();
const DEFAULT_PIPELINE = "public/data/best-bottles-madison-pipeline-ui.json";
const DEFAULT_CATALOG = "public/data/best-bottles-catalog-lite.json";
const DEFAULT_MEASUREMENT_OVERRIDES = "public/data/best-bottles-measurement-overrides.json";
const DEFAULT_OUT_JSON = "tmp/best-bottles-generation-readiness.json";
const DEFAULT_PUBLIC_OUT_JSON = "public/data/best-bottles-generation-readiness.json";
const DEFAULT_OUT_CSV = "tmp/best-bottles-generation-readiness.csv";
const DEFAULT_REPORT = "docs/best-bottles-generation-readiness.md";

const STATUS_ORDER: ReadinessStatus[] = [
  "ready",
  "needs-reference",
  "needs-measurement",
  "needs-prompt-policy",
  "component-exception",
];

const COMPONENT_CATEGORIES = new Set([
  "Accessory",
  "Cap/Closure",
  "Component",
  "Packaging",
]);

const COMPONENT_FAMILIES = new Set([
  "Cap/Closure",
  "Cap/Component",
  "Decorative",
  "Dropper",
  "Gift Bag",
  "Gift Box",
  "Lotion Pump",
  "Packaging Supply",
  "Roll-On Cap",
  "Sprayer",
  "Tool",
]);

const PROMPT_POLICY_FAMILIES = new Set(Object.keys(FAMILY_BODY_SHAPE_DESCRIPTORS));

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
    if (arg === "--pipeline") args.pipeline = next;
    else if (arg === "--catalog") args.catalog = next;
    else if (arg === "--measurement-overrides") args.measurementOverrides = next;
    else if (arg === "--out-json") args.outJson = next;
    else if (arg === "--public-out-json") args.publicOutJson = next;
    else if (arg === "--out-csv") args.outCsv = next;
    else if (arg === "--report") args.report = next;
    else throw new Error(`Unknown argument ${arg}`);
  }
  return args;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function readOptionalJson<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  return readJson<T>(filePath);
}

function ensureParentDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function truthyText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function skuKey(value: string | null | undefined): string {
  return value?.trim().toUpperCase() ?? "";
}

function isComponentException(product: PipelineProduct): boolean {
  const category = product.category?.trim() ?? "";
  const family = product.family?.trim() ?? "";
  return COMPONENT_CATEGORIES.has(category) || COMPONENT_FAMILIES.has(family);
}

function effectiveHeight(
  catalog: CatalogProduct | undefined,
  override: MeasurementOverride | undefined,
): string | null {
  return override?.heightWithoutCap ?? catalog?.heightWithoutCap ?? null;
}

function effectiveDiameter(
  catalog: CatalogProduct | undefined,
  override: MeasurementOverride | undefined,
): string | null {
  return override?.diameter ?? catalog?.diameter ?? null;
}

function measurementSource(
  catalog: CatalogProduct | undefined,
  override: MeasurementOverride | undefined,
): ReadinessRow["measurementSource"] {
  if (override) return "manual-override";
  if (truthyText(catalog?.heightWithoutCap) && truthyText(catalog?.diameter)) return "catalog";
  return "missing";
}

function hasMeasurements(
  catalog: CatalogProduct | undefined,
  override: MeasurementOverride | undefined,
): boolean {
  return truthyText(effectiveHeight(catalog, override)) && truthyText(effectiveDiameter(catalog, override));
}

function hasPromptPolicy(product: PipelineProduct): boolean {
  return PROMPT_POLICY_FAMILIES.has(product.family ?? "");
}

function buildIssues(
  product: PipelineProduct,
  catalog: CatalogProduct | undefined,
  override: MeasurementOverride | undefined,
): string[] {
  const issues: string[] = [];
  if (isComponentException(product)) {
    issues.push("component_exception");
    if (!truthyText(product.websiteSku)) issues.push("missing_website_sku");
    return issues;
  }
  if (!catalog) issues.push("missing_catalog_join");
  if (!hasMeasurements(catalog, override)) issues.push("missing_measurement");
  if (override) issues.push("measurement_override_pending_convex_sync");
  if (!truthyText(product.bestReferenceCandidatePath)) issues.push("missing_reference");
  if (!isComponentException(product) && !hasPromptPolicy(product)) {
    issues.push("missing_prompt_policy");
  }
  if (!truthyText(product.websiteSku)) issues.push("missing_website_sku");
  return issues;
}

function primaryStatus(
  product: PipelineProduct,
  catalog: CatalogProduct | undefined,
  override: MeasurementOverride | undefined,
): ReadinessStatus {
  if (isComponentException(product)) return "component-exception";
  if (!hasMeasurements(catalog, override)) return "needs-measurement";
  if (!truthyText(product.bestReferenceCandidatePath)) return "needs-reference";
  if (!hasPromptPolicy(product)) return "needs-prompt-policy";
  return "ready";
}

function promptPolicyDetail(product: PipelineProduct): string {
  if (isComponentException(product)) {
    return "Component/accessory row; excluded from bottle-body mass generation until a component-specific lane is approved.";
  }
  if (hasPromptPolicy(product)) {
    return `Explicit family descriptor found for ${product.family}.`;
  }
  return `No explicit family descriptor/prompt policy found for ${product.family ?? "unknown family"}.`;
}

function buildRows(
  pipeline: PipelinePayload,
  catalog: CatalogPayload,
  measurementOverrides: MeasurementOverridesPayload,
): ReadinessRow[] {
  const catalogBySku = new Map(
    (catalog.products ?? []).map((product) => [skuKey(product.graceSku), product]),
  );
  const measurementOverrideBySku = new Map(
    (measurementOverrides.overrides ?? []).map((override) => [skuKey(override.graceSku), override]),
  );

  return (pipeline.products ?? [])
    .map((product): ReadinessRow => {
      const catalogProduct = catalogBySku.get(skuKey(product.graceSku));
      const measurementOverride = measurementOverrideBySku.get(skuKey(product.graceSku));
      const status = primaryStatus(product, catalogProduct, measurementOverride);
      const issues = buildIssues(product, catalogProduct, measurementOverride);
      return {
        status,
        issues,
        graceSku: product.graceSku,
        websiteSku: product.websiteSku ?? catalogProduct?.websiteSku ?? null,
        productId: product.productId ?? catalogProduct?.productId ?? null,
        sourceId: product.sourceId,
        productGroupId: catalogProduct?.productGroupId ?? null,
        productGroupSlug: product.productGroupSlug,
        productGroupDisplayName: product.productGroupDisplayName,
        family: product.family,
        category: product.category,
        capacityMl: product.capacityMl,
        color: product.canonicalColor ?? catalogProduct?.color ?? null,
        applicator: product.applicator ?? catalogProduct?.applicator ?? null,
        capStyle: catalogProduct?.capStyle ?? null,
        capColor: catalogProduct?.capColor ?? null,
        heightWithoutCap: effectiveHeight(catalogProduct, measurementOverride),
        diameter: effectiveDiameter(catalogProduct, measurementOverride),
        catalogHeightWithoutCap: catalogProduct?.heightWithoutCap ?? null,
        catalogDiameter: catalogProduct?.diameter ?? null,
        measurementSource: measurementSource(catalogProduct, measurementOverride),
        measurementOverrideSource: measurementOverride?.source ?? null,
        measurementOverrideUrl: measurementOverride?.sourceUrl ?? null,
        measurementOverrideNote: measurementOverride?.note ?? null,
        neckThreadSize: catalogProduct?.neckThreadSize ?? null,
        hasReference: truthyText(product.bestReferenceCandidatePath),
        bestReferenceCandidatePath: product.bestReferenceCandidatePath ?? null,
        promptPolicy: isComponentException(product)
          ? "component-exception"
          : hasPromptPolicy(product)
            ? "explicit"
            : "missing",
        promptPolicyDetail: promptPolicyDetail(product),
        coverageStatus: product.coverageStatus,
        generatedCandidateCount: product.generatedCandidateCount,
        reviewCandidateCount: product.reviewCandidateCount,
        shopifyReadyCount: product.shopifyReadyCount,
        hasConvexImageUrl: product.hasConvexImageUrl,
        expectedCanonicalFilename: product.expectedCanonicalFilename,
      };
    })
    .sort((a, b) => {
      const statusDelta = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
      if (statusDelta !== 0) return statusDelta;
      return [
        a.family ?? "",
        a.productGroupSlug,
        a.graceSku,
      ].join("|").localeCompare([
        b.family ?? "",
        b.productGroupSlug,
        b.graceSku,
      ].join("|"));
    });
}

function countBy<T>(rows: T[], key: (row: T) => string | null | undefined): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = key(row)?.trim() || "(blank)";
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function rowsByStatus(rows: ReadinessRow[]): Record<ReadinessStatus, number> {
  return STATUS_ORDER.reduce(
    (acc, status) => {
      acc[status] = rows.filter((row) => row.status === status).length;
      return acc;
    },
    {} as Record<ReadinessStatus, number>,
  );
}

function issueCounts(rows: ReadinessRow[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const issue of row.issues) {
      counts.set(issue, (counts.get(issue) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function formatCountTable(headers: [string, string], rows: Array<[string, number]>, limit = rows.length): string[] {
  return [
    `| ${headers[0]} | ${headers[1]} |`,
    "| --- | ---: |",
    ...rows.slice(0, limit).map(([name, count]) => `| ${name} | ${count} |`),
  ];
}

function sampleRows(rows: ReadinessRow[], status: ReadinessStatus, limit = 12): string[] {
  const matches = rows.filter((row) => row.status === status).slice(0, limit);
  if (matches.length === 0) return ["_None._"];
  return matches.map(
    (row) =>
      `- ${row.graceSku} (${row.family ?? "Unknown"} / ${row.category ?? "Unknown"}): ${row.issues.join(", ") || "ready"}`,
  );
}

function buildReport(params: {
  pipelinePath: string;
  catalogPath: string;
  measurementOverridesPath: string;
  outJsonPath: string;
  outCsvPath: string;
  rows: ReadinessRow[];
  pipeline: PipelinePayload;
  catalog: CatalogPayload;
}): string {
  const { rows } = params;
  const statusCounts = rowsByStatus(rows);
  const nonComponentRows = rows.filter((row) => row.status !== "component-exception");
  const readyPct =
    nonComponentRows.length > 0
      ? ((statusCounts.ready / nonComponentRows.length) * 100).toFixed(1)
      : "0.0";
  const missingPolicyFamilies = countBy(
    rows.filter((row) => row.issues.includes("missing_prompt_policy")),
    (row) => row.family,
  );
  const missingReferenceFamilies = countBy(
    rows.filter((row) => row.issues.includes("missing_reference") && row.status !== "component-exception"),
    (row) => row.family,
  );
  const measurementRows = rows.filter((row) => row.status === "needs-measurement");
  const measurementOverrideRows = rows.filter((row) => row.measurementSource === "manual-override");

  return [
    "# Best Bottles Generation Readiness",
    "",
    "This report is generated by `npm run bestbottles:generation:readiness`.",
    "",
    "## Sources",
    "",
    `- Convex/pipeline export: ${params.pipelinePath}`,
    `- Runtime catalog join: ${params.catalogPath}`,
    `- Manual measurement overrides: ${params.measurementOverridesPath}`,
    `- JSON output: ${params.outJsonPath}`,
    `- CSV output: ${params.outCsvPath}`,
    `- Source-of-truth date: ${params.pipeline.summary?.sourceOfTruthDate ?? "unknown"}`,
    "",
    "## Rules",
    "",
    "- Universe: Convex-backed pipeline products only.",
    "- Primary bucket priority: `component-exception` → `needs-measurement` → `needs-reference` → `needs-prompt-policy` → `ready`.",
    "- `ready` means the SKU has body measurements, a reference path, and an explicit family descriptor/prompt policy.",
    "- Manual measurement overrides are allowed only as temporary generation-readiness inputs and remain flagged until synced back to Convex/catalog data.",
    "- `component-exception` means the row is a component/accessory/packaging row and should not block bottle-body mass generation.",
    "",
    "## Summary",
    "",
    `- Convex SKU/jobs evaluated: ${rows.length}`,
    `- Non-component bottle-body candidates: ${nonComponentRows.length}`,
    `- Ready bottle-body candidates: ${statusCounts.ready} (${readyPct}% of non-component candidates)`,
    `- Component/accessory exceptions: ${statusCounts["component-exception"]}`,
    `- Manual measurement overrides pending Convex sync: ${measurementOverrideRows.length}`,
    "",
    ...formatCountTable(["Primary status", "Rows"], STATUS_ORDER.map((status) => [status, statusCounts[status]])),
    "",
    "## Issue Counts",
    "",
    "Issue counts are non-exclusive; a row can have multiple issues even though it receives one primary status.",
    "",
    ...formatCountTable(["Issue", "Rows"], issueCounts(rows)),
    "",
    "## Missing Reference By Family",
    "",
    ...formatCountTable(["Family", "Rows"], missingReferenceFamilies, 40),
    "",
    "## Missing Measurement Rows",
    "",
    measurementRows.length === 0
      ? "_None._"
      : "| Grace SKU | Website SKU | Family | Category | Height | Diameter | Reference? |",
    ...(measurementRows.length === 0
      ? []
      : [
          "| --- | --- | --- | --- | ---: | ---: | --- |",
          ...measurementRows.map(
            (row) =>
              `| ${row.graceSku} | ${row.websiteSku ?? ""} | ${row.family ?? ""} | ${row.category ?? ""} | ${row.heightWithoutCap ?? ""} | ${row.diameter ?? ""} | ${row.hasReference ? "yes" : "no"} |`,
          ),
        ]),
    "",
    "## Manual Measurement Overrides Pending Convex Sync",
    "",
    measurementOverrideRows.length === 0
      ? "_None._"
      : "| Grace SKU | Website SKU | Family | Catalog Height | Catalog Diameter | Effective Height | Effective Diameter | Source |",
    ...(measurementOverrideRows.length === 0
      ? []
      : [
          "| --- | --- | --- | ---: | ---: | ---: | ---: | --- |",
          ...measurementOverrideRows.map(
            (row) =>
              `| ${row.graceSku} | ${row.websiteSku ?? ""} | ${row.family ?? ""} | ${row.catalogHeightWithoutCap ?? ""} | ${row.catalogDiameter ?? ""} | ${row.heightWithoutCap ?? ""} | ${row.diameter ?? ""} | ${row.measurementOverrideSource ?? ""} |`,
          ),
        ]),
    "",
    "## Missing Prompt Policy By Family",
    "",
    ...formatCountTable(["Family", "Rows"], missingPolicyFamilies, 40),
    "",
    "## Samples",
    "",
    "### Needs Reference",
    "",
    ...sampleRows(rows, "needs-reference"),
    "",
    "### Needs Prompt Policy",
    "",
    ...sampleRows(rows, "needs-prompt-policy"),
    "",
    "### Component Exceptions",
    "",
    ...sampleRows(rows, "component-exception"),
    "",
  ].join("\n");
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

function toCsv(rows: ReadinessRow[]): string {
  const headers: Array<keyof ReadinessRow> = [
    "status",
    "issues",
    "graceSku",
    "websiteSku",
    "productId",
    "sourceId",
    "productGroupId",
    "productGroupSlug",
    "productGroupDisplayName",
    "family",
    "category",
    "capacityMl",
    "color",
    "applicator",
    "capStyle",
    "capColor",
    "heightWithoutCap",
    "diameter",
    "catalogHeightWithoutCap",
    "catalogDiameter",
    "measurementSource",
    "measurementOverrideSource",
    "measurementOverrideUrl",
    "measurementOverrideNote",
    "neckThreadSize",
    "hasReference",
    "bestReferenceCandidatePath",
    "promptPolicy",
    "promptPolicyDetail",
    "coverageStatus",
    "generatedCandidateCount",
    "reviewCandidateCount",
    "shopifyReadyCount",
    "hasConvexImageUrl",
    "expectedCanonicalFilename",
  ];
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ].join("\n");
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const pipelinePath = path.resolve(ROOT, args.pipeline ?? DEFAULT_PIPELINE);
  const catalogPath = path.resolve(ROOT, args.catalog ?? DEFAULT_CATALOG);
  const measurementOverridesPath = path.resolve(
    ROOT,
    args.measurementOverrides ?? DEFAULT_MEASUREMENT_OVERRIDES,
  );
  const outJsonPath = path.resolve(ROOT, args.outJson ?? DEFAULT_OUT_JSON);
  const publicOutJsonPath = path.resolve(ROOT, args.publicOutJson ?? DEFAULT_PUBLIC_OUT_JSON);
  const outCsvPath = path.resolve(ROOT, args.outCsv ?? DEFAULT_OUT_CSV);
  const reportPath = path.resolve(ROOT, args.report ?? DEFAULT_REPORT);

  const pipeline = readJson<PipelinePayload>(pipelinePath);
  const catalog = readJson<CatalogPayload>(catalogPath);
  const measurementOverrides = readOptionalJson<MeasurementOverridesPayload>(
    measurementOverridesPath,
    { overrides: [] },
  );
  const rows = buildRows(pipeline, catalog, measurementOverrides);
  const statusCounts = rowsByStatus(rows);

  ensureParentDir(outJsonPath);
  ensureParentDir(publicOutJsonPath);
  ensureParentDir(outCsvPath);
  ensureParentDir(reportPath);

  const payload = {
    generatedAt: new Date().toISOString(),
    sourceOfTruthDate: pipeline.summary?.sourceOfTruthDate ?? null,
    sources: {
      pipeline: pipelinePath,
      catalog: catalogPath,
      measurementOverrides: measurementOverridesPath,
    },
    summary: {
      totalRows: rows.length,
      statusCounts,
      issueCounts: Object.fromEntries(issueCounts(rows)),
      promptPolicyFamilies: [...PROMPT_POLICY_FAMILIES].sort(),
      componentExceptionCategories: [...COMPONENT_CATEGORIES].sort(),
      componentExceptionFamilies: [...COMPONENT_FAMILIES].sort(),
      manualMeasurementOverrides: rows.filter((row) => row.measurementSource === "manual-override").length,
    },
    rows,
  };

  const serializedPayload = `${JSON.stringify(payload, null, 2)}\n`;
  fs.writeFileSync(outJsonPath, serializedPayload);
  fs.writeFileSync(publicOutJsonPath, serializedPayload);
  fs.writeFileSync(outCsvPath, `${toCsv(rows)}\n`);
  fs.writeFileSync(
    reportPath,
    buildReport({
      pipelinePath,
      catalogPath,
      measurementOverridesPath,
      outJsonPath,
      outCsvPath,
      rows,
      pipeline,
      catalog,
    }),
  );

  console.log(`Wrote ${rows.length} readiness rows`);
  console.log(`JSON: ${outJsonPath}`);
  console.log(`Public JSON: ${publicOutJsonPath}`);
  console.log(`CSV: ${outCsvPath}`);
  console.log(`Report: ${reportPath}`);
  console.log(statusCounts);
}

main();
