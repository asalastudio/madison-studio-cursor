import fs from "node:fs";
import path from "node:path";
import process from "node:process";

interface CatalogProduct {
  _id: string;
  websiteSku: string;
  graceSku: string;
  productId: string | null;
  category: string;
  family: string | null;
  color: string | null;
  capacity: string | null;
  capacityMl: number | null;
  capacityOz: number | null;
  heightWithCap: string | null;
  heightWithoutCap: string | null;
  diameter: string | null;
  neckThreadSize: string | null;
  applicator: string | null;
  capStyle: string | null;
  capColor: string | null;
  trimColor: string | null;
  bottleCollection: string | null;
  itemName: string;
  itemDescription: string | null;
  useCaseDescription: string | null;
  imageUrl: string | null;
  stockStatus: string | null;
  verified: boolean;
  productGroupId: string | null;
}

interface CliArgs {
  products?: string;
  master?: string;
  groups?: string;
  out?: string;
  report?: string;
}

const ROOT = process.cwd();
const PROJECTS_ROOT = path.resolve(ROOT, "../..");
const CLIENTS_ROOT = path.join(PROJECTS_ROOT, "Clients");

const DEFAULT_PRODUCTS_CANDIDATES = [
  path.join(
    CLIENTS_ROOT,
    "Nemat-International/Best-Bottles-Website-02-20-2026-pr34/outputs/product-knowledge-2026-05-14/best_bottles_product_knowledge_products_2026-05-14.csv",
  ),
  path.join(
    CLIENTS_ROOT,
    "Nemat-International/Best-Bottles-Website-02-20-2026-pr34/outputs/product-knowledge-2026-05-14/Best_Bottles_Product_Knowledge_2026-05-14/best_bottles_product_knowledge_products_2026-05-14.csv",
  ),
];

const DEFAULT_MASTER_CANDIDATES = [
  path.join(CLIENTS_ROOT, "Nemat-International/Best-Bottles-Website-02-20-2026-pr34/Nemat_Product_Catalog.csv"),
  path.join(CLIENTS_ROOT, "Nemat-International/Best-Bottles-Website-02-20-2026/Nemat_Product_Catalog.csv"),
];

const DEFAULT_GROUPS_CANDIDATES = [
  path.join(
    CLIENTS_ROOT,
    "Nemat-International/Best-Bottles-Website-02-20-2026-pr34/outputs/product-knowledge-2026-05-14/best_bottles_product_groups_2026-05-14.csv",
  ),
  path.join(
    CLIENTS_ROOT,
    "Nemat-International/Best-Bottles-Website-02-20-2026-pr34/outputs/product-knowledge-2026-05-14/Best_Bottles_Product_Knowledge_2026-05-14/best_bottles_product_groups_2026-05-14.csv",
  ),
];

const DEFAULT_OUT = "public/data/best-bottles-catalog-lite.json";
const DEFAULT_REPORT = "docs/best-bottles-catalog-reconciliation.md";

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
    if (arg === "--products") args.products = next;
    else if (arg === "--master") args.master = next;
    else if (arg === "--groups") args.groups = next;
    else if (arg === "--out") args.out = next;
    else if (arg === "--report") args.report = next;
    else throw new Error(`Unknown argument ${arg}`);
  }
  return args;
}

function resolveInput(label: string, explicit: string | undefined, candidates: string[]): string {
  if (explicit) {
    const resolved = path.resolve(ROOT, explicit);
    if (!fs.existsSync(resolved)) throw new Error(`${label} not found: ${resolved}`);
    return resolved;
  }
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(
      `${label} not found. Pass --${label.toLowerCase()} <path>. Checked:\n${candidates.join("\n")}`,
    );
  }
  return found;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === "\"") {
        if (text[i + 1] === "\"") {
          field += "\"";
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === "\"") {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((csvRow) => csvRow.some((cell) => cell.trim()));
}

function csvRecords(filePath: string): Record<string, string>[] {
  const rows = parseCsv(fs.readFileSync(filePath, "utf8"));
  const headers = rows.shift() ?? [];
  return rows.map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = row[index] ?? "";
    });
    return record;
  });
}

function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key]?.trim();
    if (value) return value;
  }
  return "";
}

function stringOrNull(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function numberOrNull(value: string | null | undefined): number | null {
  const normalized = value?.replace(/[^0-9.-]+/g, "") ?? "";
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function bool(value: string | null | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

function skuKey(value: string | null | undefined): string {
  return value?.trim().toUpperCase() ?? "";
}

function duplicateSkus(rows: Record<string, string>[], skuField = "graceSku"): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const row of rows) {
    const key = skuKey(row[skuField]);
    if (!key) continue;
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  return [...duplicates].sort();
}

function skuSet(rows: Record<string, string>[], skuField = "graceSku"): Set<string> {
  return new Set(rows.map((row) => skuKey(row[skuField])).filter(Boolean));
}

function difference(left: Set<string>, right: Set<string>): string[] {
  return [...left].filter((value) => !right.has(value)).sort();
}

function topCounts(products: CatalogProduct[], field: keyof CatalogProduct, limit = 12): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const product of products) {
    const key = String(product[field] ?? "Missing");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit);
}

function mapProduct(row: Record<string, string>): CatalogProduct {
  const graceSku = pick(row, "graceSku", "grace_sku", "sku");
  return {
    _id: stringOrNull(pick(row, "sourceId", "_id")) ?? graceSku,
    websiteSku: pick(row, "websiteSku", "website_sku"),
    graceSku,
    productId: stringOrNull(pick(row, "productId")),
    category: pick(row, "category"),
    family: stringOrNull(pick(row, "family")),
    color:
      stringOrNull(pick(row, "canonicalColor")) ??
      stringOrNull(pick(row, "rawColor")) ??
      stringOrNull(pick(row, "groupCanonicalColor")) ??
      stringOrNull(pick(row, "color")),
    capacity: stringOrNull(pick(row, "capacity")),
    capacityMl: numberOrNull(pick(row, "capacityMl")),
    capacityOz: numberOrNull(pick(row, "capacityOz")),
    heightWithCap: stringOrNull(pick(row, "heightWithCap")),
    heightWithoutCap: stringOrNull(pick(row, "heightWithoutCap")),
    diameter: stringOrNull(pick(row, "diameter")),
    neckThreadSize: stringOrNull(pick(row, "neckThreadSize")),
    applicator: stringOrNull(pick(row, "applicator")),
    capStyle: stringOrNull(pick(row, "capStyle")),
    capColor: stringOrNull(pick(row, "capColor")),
    trimColor: stringOrNull(pick(row, "trimColor")),
    bottleCollection: stringOrNull(pick(row, "bottleCollection")),
    itemName: pick(row, "itemName") || graceSku,
    itemDescription:
      stringOrNull(pick(row, "itemDescription")) ??
      stringOrNull(pick(row, "canonicalDescription")) ??
      stringOrNull(pick(row, "graceDescription")),
    useCaseDescription: stringOrNull(pick(row, "useCaseDescription")),
    imageUrl: stringOrNull(pick(row, "imageUrl")),
    stockStatus: stringOrNull(pick(row, "stockStatus")),
    verified: bool(pick(row, "verified")),
    productGroupId: stringOrNull(pick(row, "productGroupId")),
  };
}

function productSortKey(product: CatalogProduct): string {
  return [
    product.family ?? "",
    String(product.capacityMl ?? "").padStart(5, "0"),
    product.color ?? "",
    product.applicator ?? "",
    product.capColor ?? "",
    product.capStyle ?? "",
    product.graceSku,
  ].join("|");
}

function sample(values: string[], limit = 50): string[] {
  return values.slice(0, limit);
}

function formatList(values: string[], emptyText = "None"): string {
  if (values.length === 0) return emptyText;
  return values.map((value) => `- ${value}`).join("\n");
}

function buildReport(params: {
  productsPath: string;
  masterPath: string;
  groupsPath: string;
  outPath: string;
  productRows: Record<string, string>[];
  masterRows: Record<string, string>[];
  groupRows: Record<string, string>[];
  products: CatalogProduct[];
  missingFromProducts: string[];
  missingFromMaster: string[];
  duplicateProductSkus: string[];
  duplicateMasterSkus: string[];
  missingProductGroupId: CatalogProduct[];
  missingWebsiteSku: CatalogProduct[];
  missingMeasurements: CatalogProduct[];
}): string {
  const lines = [
    "# Best Bottles Catalog Reconciliation",
    "",
    "This report is generated by `npm run bestbottles:catalog:reconcile`.",
    "",
    "## Sources",
    "",
    `- Convex-derived product export: ${params.productsPath}`,
    `- Master Best Bottles catalog: ${params.masterPath}`,
    `- Convex-derived product groups: ${params.groupsPath}`,
    `- Runtime fallback output: ${params.outPath}`,
    "",
    "## Summary",
    "",
    `- Runtime products written: ${params.products.length}`,
    `- Product export rows: ${params.productRows.length}`,
    `- Master catalog rows: ${params.masterRows.length}`,
    `- Product group rows: ${params.groupRows.length}`,
    `- SKUs in master catalog but missing from Convex-derived product export: ${params.missingFromProducts.length}`,
    `- SKUs in Convex-derived product export but missing from master catalog: ${params.missingFromMaster.length}`,
    `- Duplicate Grace SKUs in product export: ${params.duplicateProductSkus.length}`,
    `- Duplicate Grace SKUs in master catalog: ${params.duplicateMasterSkus.length}`,
    `- Runtime products missing productGroupId: ${params.missingProductGroupId.length}`,
    `- Runtime products missing websiteSku: ${params.missingWebsiteSku.length}`,
    `- Runtime products missing heightWithoutCap or diameter: ${params.missingMeasurements.length}`,
    "",
    "## Family Counts",
    "",
    "| Family | Count |",
    "| --- | ---: |",
    ...topCounts(params.products, "family", 100).map(([family, count]) => `| ${family} | ${count} |`),
    "",
    "## Master -> Convex Gaps",
    "",
    formatList(sample(params.missingFromProducts)),
    "",
    "## Convex -> Master Gaps",
    "",
    formatList(sample(params.missingFromMaster)),
    "",
    "## Missing Product Group IDs",
    "",
    formatList(sample(params.missingProductGroupId.map((product) => product.graceSku))),
    "",
    "## Missing Measurements",
    "",
    formatList(sample(params.missingMeasurements.map((product) => product.graceSku))),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const productsPath = resolveInput("products", args.products ?? process.env.BEST_BOTTLES_PRODUCTS_CSV, DEFAULT_PRODUCTS_CANDIDATES);
  const masterPath = resolveInput("master", args.master ?? process.env.BEST_BOTTLES_MASTER_CSV, DEFAULT_MASTER_CANDIDATES);
  const groupsPath = resolveInput("groups", args.groups ?? process.env.BEST_BOTTLES_GROUPS_CSV, DEFAULT_GROUPS_CANDIDATES);
  const outPath = path.resolve(ROOT, args.out ?? DEFAULT_OUT);
  const reportPath = path.resolve(ROOT, args.report ?? DEFAULT_REPORT);

  const productRows = csvRecords(productsPath);
  const masterRows = csvRecords(masterPath);
  const groupRows = csvRecords(groupsPath);

  const productSkus = skuSet(productRows);
  const masterSkus = skuSet(masterRows);
  const duplicateProductSkus = duplicateSkus(productRows);
  const duplicateMasterSkus = duplicateSkus(masterRows);
  const missingFromProducts = difference(masterSkus, productSkus);
  const missingFromMaster = difference(productSkus, masterSkus);

  const products = productRows
    .map(mapProduct)
    .filter((product) => product.graceSku)
    .sort((a, b) => productSortKey(a).localeCompare(productSortKey(b)));

  const missingProductGroupId = products.filter((product) => !product.productGroupId);
  const missingWebsiteSku = products.filter((product) => !product.websiteSku);
  const missingMeasurements = products.filter((product) => !product.heightWithoutCap || !product.diameter);
  const modelVersion = productRows.find((row) => row.modelVersion)?.modelVersion ?? null;
  const sourceGeneratedAt = productRows.find((row) => row.generatedAt)?.generatedAt ?? null;

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(
    outPath,
    `${JSON.stringify({
      source: {
        sourceFile: path.basename(productsPath),
        masterCatalogFile: path.basename(masterPath),
        productGroupsFile: path.basename(groupsPath),
        modelVersion,
        sourceGeneratedAt,
        rowCount: products.length,
        comparison: {
          productExportRows: productRows.length,
          masterCatalogRows: masterRows.length,
          productGroupRows: groupRows.length,
          missingFromProducts: missingFromProducts.length,
          missingFromMaster: missingFromMaster.length,
          duplicateProductSkus: duplicateProductSkus.length,
          duplicateMasterSkus: duplicateMasterSkus.length,
          missingProductGroupId: missingProductGroupId.length,
          missingWebsiteSku: missingWebsiteSku.length,
          missingMeasurements: missingMeasurements.length,
        },
      },
      products,
    })}\n`,
  );

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(
    reportPath,
    buildReport({
      productsPath,
      masterPath,
      groupsPath,
      outPath,
      productRows,
      masterRows,
      groupRows,
      products,
      missingFromProducts,
      missingFromMaster,
      duplicateProductSkus,
      duplicateMasterSkus,
      missingProductGroupId,
      missingWebsiteSku,
      missingMeasurements,
    }),
  );

  console.log(JSON.stringify({
    outPath,
    reportPath,
    products: products.length,
    missingFromProducts: missingFromProducts.length,
    missingFromMaster: missingFromMaster.length,
    missingProductGroupId: missingProductGroupId.length,
    missingMeasurements: missingMeasurements.length,
  }, null, 2));
}

main();
