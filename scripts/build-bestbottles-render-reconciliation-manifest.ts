import fs from "node:fs";
import path from "node:path";
import process from "node:process";

type ManifestStatus =
  | "ready_to_index"
  | "needs_grace_sku"
  | "missing_source_image"
  | "possible_duplicate";

interface CliArgs {
  rendersRoot?: string;
  catalog?: string;
  pipeline?: string;
  outJson?: string;
  outCsv?: string;
  report?: string;
}

interface CatalogProduct {
  _id?: string;
  websiteSku: string | null;
  graceSku: string;
  productId: string | null;
  category: string | null;
  family: string | null;
  color: string | null;
  capacityMl: number | null;
  applicator: string | null;
}

interface CatalogPayload {
  products?: CatalogProduct[];
}

interface PipelineProduct {
  productGroupSlug: string;
  productGroupDisplayName: string;
  family: string | null;
  graceSku: string;
  websiteSku: string | null;
  expectedCanonicalFilename: string | null;
  bestReferenceCandidatePath: string | null;
}

interface PipelinePayload {
  products?: PipelineProduct[];
}

interface DiskFile {
  absolutePath: string;
  relativePath: string;
  filename: string;
  parsedGraceSku: string | null;
  score: number;
  reasons: string[];
}

interface ManifestEntry {
  status: ManifestStatus;
  graceSku: string | null;
  websiteSku: string | null;
  family: string | null;
  productGroupSlug: string | null;
  currentReferencePath: string | null;
  proposedSourcePath: string | null;
  proposedCanonicalFilename: string | null;
  matchedDiskFileCount: number;
  duplicatePaths: string[];
  reason: string;
  nextAction: string;
}

interface ManifestPayload {
  generatedAt: string;
  dryRun: true;
  inputs: {
    rendersRoot: string;
    catalog: string;
    pipeline: string;
  };
  summary: Record<string, number>;
  statusCounts: Record<ManifestStatus, number>;
  entries: ManifestEntry[];
}

const ROOT = process.cwd();
const DEFAULT_BB_RENDERS_ROOT =
  "/Users/jordanrichter/Projects/Clients/Nemat-International/Best-Bottles-Website-02-20-2026/pipeline/madison-hero-sync/renders";
const DEFAULT_CATALOG = "public/data/best-bottles-catalog-lite.json";
const DEFAULT_PIPELINE = "public/data/best-bottles-madison-pipeline-ui.json";
const DEFAULT_OUT_JSON = "tmp/best-bottles-render-reconciliation-manifest.json";
const DEFAULT_OUT_CSV = "tmp/best-bottles-render-reconciliation-manifest.csv";
const DEFAULT_REPORT = "docs/best-bottles-render-reconciliation-manifest.md";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

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
    if (arg === "--renders-root") args.rendersRoot = next;
    else if (arg === "--catalog") args.catalog = next;
    else if (arg === "--pipeline") args.pipeline = next;
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

function walkImages(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkImages(absolutePath, out);
      continue;
    }
    if (entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      out.push(absolutePath);
    }
  }
  return out;
}

function relativeRenderPath(rendersRoot: string, absolutePath: string): string {
  return path.relative(rendersRoot, absolutePath).split(path.sep).join("/");
}

function normalizedReferencePath(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.replace(/^.*?pipeline\/madison-hero-sync\/renders\//, "");
}

function skuKey(value: string | null | undefined): string {
  return value?.trim().toUpperCase() ?? "";
}

function parseGraceSkuFromFilename(filename: string): string | null {
  const stem = path.basename(filename).replace(/\.(png|jpe?g|webp)$/i, "");
  const firstToken = stem.split("__")[0].replace(/--cap-(on|off)$/i, "");
  return /^[A-Z]{2,4}-[A-Z0-9.-]+(?:-[A-Z0-9.]+)*$/i.test(firstToken) ? firstToken.toUpperCase() : null;
}

function sourceScore(relativePath: string): { score: number; reasons: string[] } {
  const lower = relativePath.toLowerCase();
  const reasons: string[] = [];
  let score = 0;
  if (lower.includes("capstate-v2")) {
    score += 1000;
    reasons.push("preferred newer capstate-v2 batch");
  }
  if (!lower.includes("_archive/")) {
    score += 400;
    reasons.push("not archived");
  }
  if (lower.includes("/cap-off/") || lower.includes("--cap-off")) {
    score += 80;
    reasons.push("cap-off source");
  }
  if (lower.includes("/cap-on/") || lower.includes("--cap-on")) {
    score += 40;
    reasons.push("cap-on source");
  }
  if (lower.includes("madison-masters-2080x2288")) {
    score += 20;
    reasons.push("Madison 2080x2288 master");
  }
  if (lower.includes("heroes") || lower.includes("review") || lower.includes("generated")) {
    score += 10;
    reasons.push("generated/review candidate");
  }
  return { score, reasons };
}

function expectedCanonicalFilename(
  product: CatalogProduct,
  pipelineProduct: PipelineProduct | undefined,
): string {
  if (pipelineProduct?.expectedCanonicalFilename) return pipelineProduct.expectedCanonicalFilename;
  if (product.websiteSku) return `${product.graceSku}__${product.websiteSku}__pdp-main__v001.png`;
  return `${product.graceSku}__pdp-main__v001.png`;
}

function chooseBest(files: DiskFile[]): DiskFile | undefined {
  return [...files].sort((a, b) => b.score - a.score || a.relativePath.localeCompare(b.relativePath))[0];
}

function buildManifest(
  rendersRoot: string,
  catalog: CatalogPayload,
  pipeline: PipelinePayload,
): ManifestPayload {
  const absoluteFiles = walkImages(rendersRoot);
  const diskFiles: DiskFile[] = absoluteFiles.map((absolutePath) => {
    const relativePath = relativeRenderPath(rendersRoot, absolutePath);
    const { score, reasons } = sourceScore(relativePath);
    return {
      absolutePath,
      relativePath,
      filename: path.basename(absolutePath),
      parsedGraceSku: parseGraceSkuFromFilename(absolutePath),
      score,
      reasons,
    };
  });

  const catalogProducts = catalog.products ?? [];
  const pipelineProducts = pipeline.products ?? [];
  const catalogBySku = new Map(catalogProducts.map((product) => [skuKey(product.graceSku), product]));
  const pipelineBySku = new Map(pipelineProducts.map((product) => [skuKey(product.graceSku), product]));
  const diskBySku = new Map<string, DiskFile[]>();
  const needsGraceSkuFiles: DiskFile[] = [];

  for (const file of diskFiles) {
    if (!file.parsedGraceSku || !catalogBySku.has(file.parsedGraceSku)) {
      needsGraceSkuFiles.push(file);
      continue;
    }
    const files = diskBySku.get(file.parsedGraceSku) ?? [];
    files.push(file);
    diskBySku.set(file.parsedGraceSku, files);
  }

  const entries: ManifestEntry[] = [];

  for (const product of catalogProducts) {
    const key = skuKey(product.graceSku);
    const pipelineProduct = pipelineBySku.get(key);
    const matchedFiles = diskBySku.get(key) ?? [];
    const bestFile = chooseBest(matchedFiles);
    const currentReferencePath = normalizedReferencePath(pipelineProduct?.bestReferenceCandidatePath);
    const proposedCanonicalFilename = expectedCanonicalFilename(product, pipelineProduct);

    if (matchedFiles.length === 0) {
      entries.push({
        status: "missing_source_image",
        graceSku: product.graceSku,
        websiteSku: product.websiteSku ?? pipelineProduct?.websiteSku ?? null,
        family: product.family ?? pipelineProduct?.family ?? null,
        productGroupSlug: pipelineProduct?.productGroupSlug ?? null,
        currentReferencePath,
        proposedSourcePath: null,
        proposedCanonicalFilename,
        matchedDiskFileCount: 0,
        duplicatePaths: [],
        reason: "No render file found with this Grace SKU in the render archive.",
        nextAction: "Find a source image, generate a replacement, or confirm this product should stay out of image generation.",
      });
      continue;
    }

    const duplicatePaths = matchedFiles
      .filter((file) => file.relativePath !== bestFile?.relativePath)
      .sort((a, b) => b.score - a.score || a.relativePath.localeCompare(b.relativePath))
      .map((file) => file.relativePath);

    if (matchedFiles.length > 1) {
      entries.push({
        status: "possible_duplicate",
        graceSku: product.graceSku,
        websiteSku: product.websiteSku ?? pipelineProduct?.websiteSku ?? null,
        family: product.family ?? pipelineProduct?.family ?? null,
        productGroupSlug: pipelineProduct?.productGroupSlug ?? null,
        currentReferencePath,
        proposedSourcePath: bestFile?.relativePath ?? null,
        proposedCanonicalFilename,
        matchedDiskFileCount: matchedFiles.length,
        duplicatePaths,
        reason: `Multiple render files match this Grace SKU. Proposed source uses ${bestFile?.reasons.join(", ") || "highest score"}.`,
        nextAction: "Review duplicate candidates, then approve the proposed source or choose a different source before canonical copy/rename.",
      });
      continue;
    }

    entries.push({
      status: "ready_to_index",
      graceSku: product.graceSku,
      websiteSku: product.websiteSku ?? pipelineProduct?.websiteSku ?? null,
      family: product.family ?? pipelineProduct?.family ?? null,
      productGroupSlug: pipelineProduct?.productGroupSlug ?? null,
      currentReferencePath,
      proposedSourcePath: bestFile?.relativePath ?? null,
      proposedCanonicalFilename,
      matchedDiskFileCount: 1,
      duplicatePaths: [],
      reason: currentReferencePath === bestFile?.relativePath
        ? "Pipeline already points at the only matching Grace SKU source."
        : "Exactly one render file matches this Grace SKU and can be indexed after review.",
      nextAction: currentReferencePath === bestFile?.relativePath
        ? "No file move needed; keep indexed source."
        : "Approve for canonical copy/rename after visual review.",
    });
  }

  for (const file of needsGraceSkuFiles) {
    entries.push({
      status: "needs_grace_sku",
      graceSku: file.parsedGraceSku,
      websiteSku: null,
      family: null,
      productGroupSlug: null,
      currentReferencePath: null,
      proposedSourcePath: file.relativePath,
      proposedCanonicalFilename: null,
      matchedDiskFileCount: 1,
      duplicatePaths: [],
      reason: file.parsedGraceSku
        ? "Filename contains a Grace-like SKU, but it is not present in catalog-lite."
        : "Filename does not begin with a parseable Grace SKU.",
      nextAction: "Assign or correct the Grace SKU before this file can enter the canonical product image pipeline.",
    });
  }

  const statusCounts = entries.reduce<Record<ManifestStatus, number>>(
    (acc, entry) => {
      acc[entry.status] += 1;
      return acc;
    },
    {
      ready_to_index: 0,
      needs_grace_sku: 0,
      missing_source_image: 0,
      possible_duplicate: 0,
    },
  );

  return {
    generatedAt: new Date().toISOString(),
    dryRun: true,
    inputs: {
      rendersRoot,
      catalog: DEFAULT_CATALOG,
      pipeline: DEFAULT_PIPELINE,
    },
    summary: {
      catalogProducts: catalogProducts.length,
      pipelineProducts: pipelineProducts.length,
      diskImages: diskFiles.length,
      diskFilesWithCatalogGraceSku: diskFiles.length - needsGraceSkuFiles.length,
      diskFilesNeedingGraceSku: needsGraceSkuFiles.length,
      manifestEntries: entries.length,
    },
    statusCounts,
    entries: entries.sort((a, b) => {
      const statusOrder: ManifestStatus[] = [
        "possible_duplicate",
        "ready_to_index",
        "missing_source_image",
        "needs_grace_sku",
      ];
      return (
        statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status)
        || (a.family ?? "").localeCompare(b.family ?? "")
        || (a.graceSku ?? "").localeCompare(b.graceSku ?? "")
        || (a.proposedSourcePath ?? "").localeCompare(b.proposedSourcePath ?? "")
      );
    }),
  };
}

function csvEscape(value: unknown): string {
  const text = String(value ?? "");
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function writeCsv(filePath: string, entries: ManifestEntry[]): void {
  ensureParentDir(filePath);
  const columns: Array<keyof ManifestEntry> = [
    "status",
    "graceSku",
    "websiteSku",
    "family",
    "productGroupSlug",
    "currentReferencePath",
    "proposedSourcePath",
    "proposedCanonicalFilename",
    "matchedDiskFileCount",
    "duplicatePaths",
    "reason",
    "nextAction",
  ];
  const rows = [
    columns.join(","),
    ...entries.map((entry) => columns.map((column) => {
      const value = column === "duplicatePaths" ? entry.duplicatePaths.join(" | ") : entry[column];
      return csvEscape(value);
    }).join(",")),
  ];
  fs.writeFileSync(filePath, `${rows.join("\n")}\n`);
}

function groupByStatusAndFamily(entries: ManifestEntry[]): string {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const key = `${entry.status}\t${entry.family ?? "Unknown"}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, count]) => {
      const [status, family] = key.split("\t");
      return `| ${status} | ${family} | ${count} |`;
    })
    .join("\n");
}

function writeReport(filePath: string, manifest: ManifestPayload): void {
  ensureParentDir(filePath);
  const duplicateSamples = manifest.entries
    .filter((entry) => entry.status === "possible_duplicate")
    .slice(0, 30)
    .map((entry) => `| ${entry.family ?? ""} | ${entry.graceSku ?? ""} | ${entry.websiteSku ?? ""} | ${entry.proposedSourcePath ?? ""} | ${entry.matchedDiskFileCount} |`)
    .join("\n");
  const missingSamples = manifest.entries
    .filter((entry) => entry.status === "missing_source_image")
    .slice(0, 30)
    .map((entry) => `| ${entry.family ?? ""} | ${entry.graceSku ?? ""} | ${entry.websiteSku ?? ""} | ${entry.productGroupSlug ?? ""} |`)
    .join("\n");

  const body = `# Best Bottles Render Reconciliation Manifest

Generated: ${manifest.generatedAt}

Dry run only. This report does not copy, move, rename, upload, or mutate images.

## Summary

| Metric | Count |
| --- | ---: |
${Object.entries(manifest.summary).map(([key, value]) => `| ${key} | ${value} |`).join("\n")}

## Status Counts

| Status | Count |
| --- | ---: |
${Object.entries(manifest.statusCounts).map(([key, value]) => `| ${key} | ${value} |`).join("\n")}

## Status By Family

| Status | Family | Count |
| --- | --- | ---: |
${groupByStatusAndFamily(manifest.entries)}

## Possible Duplicate Samples

| Family | Grace SKU | Website SKU | Proposed Source | Matched Files |
| --- | --- | --- | --- | ---: |
${duplicateSamples}

## Missing Source Image Samples

| Family | Grace SKU | Website SKU | Product Group |
| --- | --- | --- | --- |
${missingSamples}
`;
  fs.writeFileSync(filePath, body);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const rendersRoot = args.rendersRoot ?? DEFAULT_BB_RENDERS_ROOT;
  const catalogPath = args.catalog ?? DEFAULT_CATALOG;
  const pipelinePath = args.pipeline ?? DEFAULT_PIPELINE;
  const outJson = args.outJson ?? DEFAULT_OUT_JSON;
  const outCsv = args.outCsv ?? DEFAULT_OUT_CSV;
  const report = args.report ?? DEFAULT_REPORT;

  const catalog = readJson<CatalogPayload>(catalogPath);
  const pipeline = readJson<PipelinePayload>(pipelinePath);
  const manifest = buildManifest(rendersRoot, catalog, pipeline);
  manifest.inputs.catalog = catalogPath;
  manifest.inputs.pipeline = pipelinePath;

  ensureParentDir(outJson);
  fs.writeFileSync(outJson, JSON.stringify(manifest, null, 2));
  writeCsv(outCsv, manifest.entries);
  writeReport(report, manifest);

  console.log(JSON.stringify({
    summary: manifest.summary,
    statusCounts: manifest.statusCounts,
    outJson: path.resolve(outJson),
    outCsv: path.resolve(outCsv),
    report: path.resolve(report),
  }, null, 2));
}

main();
