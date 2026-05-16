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
  master?: string;
  convex?: string;
  enrichment?: string;
  products?: string;
  groups?: string;
  out?: string;
  report?: string;
}

const ROOT = process.cwd();
const PROJECTS_ROOT = path.resolve(ROOT, "../..");
const CLIENTS_ROOT = path.join(PROJECTS_ROOT, "Clients");

const DEFAULT_MASTER_CANDIDATES = [
  path.join(ROOT, "tmp/best-bottles-master-measurements.csv"),
  "/Users/jordanrichter/Downloads/best-bottles-master-measurements (1).csv",
  "/Users/jordanrichter/Downloads/best-bottles-master-measurements.csv",
  "/Users/jordanrichter/Downloads/best-bottles-production-catalog-live-confirmed.csv",
  path.join(CLIENTS_ROOT, "Nemat-International/Best-Bottles-Website-02-20-2026-pr34/Nemat_Product_Catalog.csv"),
  path.join(CLIENTS_ROOT, "Nemat-International/Best-Bottles-Website-02-20-2026/Nemat_Product_Catalog.csv"),
];

const DEFAULT_CONVEX_CANDIDATES = [
  path.join(ROOT, "tmp/best-bottles-convex-live-products.csv"),
  path.join(ROOT, "tmp/best-bottles-convex-products.csv"),
];

const DEFAULT_ENRICHMENT_CANDIDATES = [
  path.join(
    CLIENTS_ROOT,
    "Nemat-International/Best-Bottles-Website-02-20-2026-pr34/outputs/product-knowledge-2026-05-14/best_bottles_product_knowledge_products_2026-05-14.csv",
  ),
  path.join(
    CLIENTS_ROOT,
    "Nemat-International/Best-Bottles-Website-02-20-2026-pr34/outputs/product-knowledge-2026-05-14/Best_Bottles_Product_Knowledge_2026-05-14/best_bottles_product_knowledge_products_2026-05-14.csv",
  ),
  path.join(ROOT, "tmp/best-bottles-convex-live-products.csv"),
  path.join(CLIENTS_ROOT, "best-bottles-website/data/convex_products_export_20260228.csv"),
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

const CAP_OFF_ELIGIBLE_APPLICATORS = new Set([
  "fine mist sprayer",
  "perfume spray pump",
  "atomizer",
  "metal atomizer",
  "metal roller ball",
  "plastic roller ball",
  "lotion pump",
]);

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
    if (arg === "--master") args.master = next;
    else if (arg === "--convex") args.convex = next;
    else if (arg === "--enrichment") args.enrichment = next;
    else if (arg === "--products") args.products = next;
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

function bool(value: string | null | undefined, fallback = false): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized === "true" || normalized === "yes" || normalized === "1";
}

function skuKey(value: string | null | undefined): string {
  return value?.trim().toUpperCase() ?? "";
}

function capStateKey(row: Record<string, string>): string {
  const raw = pick(row, "madison_cap_states", "madisonCapStates");
  if (!raw) return "(blank)";
  const states = raw
    .split(/[;,|]+/)
    .map((state) => state.trim().toLowerCase())
    .filter(Boolean)
    .sort();
  return states.length > 0 ? states.join(";") : "(blank)";
}

function hasCapState(row: Record<string, string> | undefined, state: "cap-on" | "cap-off"): boolean {
  if (!row) return false;
  return capStateKey(row).split(";").includes(state);
}

function countRows(
  rows: Record<string, string>[],
  getKey: (row: Record<string, string>) => string,
): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = getKey(row) || "(blank)";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function needsCapOff(applicator: string | null): boolean {
  return CAP_OFF_ELIGIBLE_APPLICATORS.has(applicator?.trim().toLowerCase() ?? "");
}

function duplicateSkus(rows: Record<string, string>[], skuField = "graceSku"): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const row of rows) {
    const key = skuKey(pick(row, skuField, "grace_sku", "sku"));
    if (!key) continue;
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  return [...duplicates].sort();
}

function skuSet(rows: Record<string, string>[], skuField = "graceSku"): Set<string> {
  return new Set(rows.map((row) => skuKey(pick(row, skuField, "grace_sku", "sku"))).filter(Boolean));
}

function difference(left: Set<string>, right: Set<string>): string[] {
  return [...left].filter((value) => !right.has(value)).sort();
}

function rowsBySku(rows: Record<string, string>[]): Map<string, Record<string, string>> {
  const map = new Map<string, Record<string, string>>();
  for (const row of rows) {
    const key = skuKey(pick(row, "graceSku", "grace_sku", "sku"));
    if (key && !map.has(key)) map.set(key, row);
  }
  return map;
}

function topCounts(products: CatalogProduct[], field: keyof CatalogProduct, limit = 12): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const product of products) {
    const key = String(product[field] ?? "Missing");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit);
}

function mapProduct(row: Record<string, string>, convexRow?: Record<string, string>): CatalogProduct {
  const graceSku = pick(row, "graceSku", "grace_sku", "sku");
  const fallback = convexRow ?? {};
  return {
    _id: stringOrNull(pick(fallback, "sourceId", "_id")) ?? stringOrNull(pick(row, "sourceId", "_id")) ?? graceSku,
    websiteSku: pick(row, "websiteSku", "website_sku") || pick(fallback, "websiteSku", "website_sku"),
    graceSku,
    productId: stringOrNull(pick(row, "productId", "product_id")) ?? stringOrNull(pick(fallback, "productId", "product_id")),
    category: pick(row, "category") || pick(fallback, "category"),
    family: stringOrNull(pick(row, "family")) ?? stringOrNull(pick(fallback, "family")),
    color:
      stringOrNull(pick(row, "canonicalColor")) ??
      stringOrNull(pick(row, "rawColor")) ??
      stringOrNull(pick(row, "groupCanonicalColor")) ??
      stringOrNull(pick(row, "color")) ??
      stringOrNull(pick(fallback, "canonicalColor")) ??
      stringOrNull(pick(fallback, "rawColor")) ??
      stringOrNull(pick(fallback, "color")),
    capacity: stringOrNull(pick(row, "capacity")),
    capacityMl: numberOrNull(pick(row, "capacityMl", "capacity_ml")) ?? numberOrNull(pick(fallback, "capacityMl", "capacity_ml")),
    capacityOz: numberOrNull(pick(row, "capacityOz", "capacity_oz")) ?? numberOrNull(pick(fallback, "capacityOz", "capacity_oz")),
    heightWithCap:
      stringOrNull(pick(row, "heightWithCap", "height_with_cap_mm")) ??
      stringOrNull(pick(fallback, "heightWithCap", "height_with_cap_mm")),
    heightWithoutCap:
      stringOrNull(pick(row, "heightWithoutCap", "height_without_cap_mm")) ??
      stringOrNull(pick(fallback, "heightWithoutCap", "height_without_cap_mm")),
    diameter:
      stringOrNull(pick(row, "diameter", "diameter_mm")) ??
      stringOrNull(pick(fallback, "diameter", "diameter_mm")),
    neckThreadSize:
      stringOrNull(pick(row, "neckThreadSize", "neck_thread_size")) ??
      stringOrNull(pick(fallback, "neckThreadSize", "neck_thread_size")),
    applicator: stringOrNull(pick(row, "applicator")) ?? stringOrNull(pick(fallback, "applicator")),
    capStyle: stringOrNull(pick(row, "capStyle", "cap_style")) ?? stringOrNull(pick(fallback, "capStyle", "cap_style")),
    capColor: stringOrNull(pick(row, "capColor", "cap_color")) ?? stringOrNull(pick(fallback, "capColor", "cap_color")),
    trimColor: stringOrNull(pick(row, "trimColor", "trim_color")) ?? stringOrNull(pick(fallback, "trimColor", "trim_color")),
    bottleCollection:
      stringOrNull(pick(row, "bottleCollection", "bottle_collection")) ??
      stringOrNull(pick(fallback, "bottleCollection", "bottle_collection")),
    itemName: pick(row, "itemName", "item_name") || pick(fallback, "itemName", "item_name") || graceSku,
    itemDescription:
      stringOrNull(pick(row, "itemDescription")) ??
      stringOrNull(pick(row, "canonicalDescription")) ??
      stringOrNull(pick(row, "graceDescription")) ??
      stringOrNull(pick(fallback, "itemDescription")) ??
      stringOrNull(pick(fallback, "canonicalDescription")) ??
      stringOrNull(pick(fallback, "graceDescription")),
    useCaseDescription:
      stringOrNull(pick(row, "useCaseDescription", "use_case_description")) ??
      stringOrNull(pick(fallback, "useCaseDescription", "use_case_description")),
    imageUrl: stringOrNull(pick(row, "imageUrl", "image_url")) ?? stringOrNull(pick(fallback, "imageUrl", "image_url")),
    stockStatus:
      stringOrNull(pick(row, "stockStatus", "stock_status")) ??
      stringOrNull(pick(fallback, "stockStatus", "stock_status")),
    verified: bool(pick(row, "verified"), bool(pick(fallback, "verified"))),
    productGroupId: stringOrNull(pick(fallback, "productGroupId", "product_group_id")) ?? stringOrNull(pick(row, "productGroupId", "product_group_id")),
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

function formatCountTable(headers: [string, string], rows: Array<[string, number]>): string[] {
  return [
    `| ${headers[0]} | ${headers[1]} |`,
    "| --- | ---: |",
    ...rows.map(([label, count]) => `| ${label} | ${count} |`),
  ];
}

function buildReport(params: {
  masterPath: string;
  convexPath: string;
  enrichmentPath: string;
  groupsPath: string;
  outPath: string;
  masterRows: Record<string, string>[];
  convexRows: Record<string, string>[];
  enrichmentRows: Record<string, string>[];
  groupRows: Record<string, string>[];
  products: CatalogProduct[];
  missingFromConvex: string[];
  missingFromMaster: string[];
  duplicateConvexSkus: string[];
  duplicateMasterSkus: string[];
  missingProductGroupId: CatalogProduct[];
  missingWebsiteSku: CatalogProduct[];
  missingMeasurements: CatalogProduct[];
  capStateCounts: Array<[string, number]>;
  imageCountCounts: Array<[string, number]>;
  capOffEligible: CatalogProduct[];
  capOffMissing: CatalogProduct[];
  capOffMissingByFamily: Array<[string, number]>;
  capOffMissingByApplicator: Array<[string, number]>;
}): string {
  const lines = [
    "# Best Bottles Catalog Reconciliation",
    "",
    "This report is generated by `npm run bestbottles:catalog:reconcile`.",
    "",
    "## Sources",
    "",
    `- Master Best Bottles catalog: ${params.masterPath}`,
    `- Convex product export: ${params.convexPath}`,
    `- Convex enrichment export: ${params.enrichmentPath}`,
    `- Convex-derived product groups: ${params.groupsPath}`,
    `- Runtime fallback output: ${params.outPath}`,
    "",
    "## Summary",
    "",
    `- Runtime products written: ${params.products.length}`,
    `- Master catalog rows: ${params.masterRows.length}`,
    `- Convex product rows: ${params.convexRows.length}`,
    `- Convex enrichment rows: ${params.enrichmentRows.length}`,
    `- Product group rows: ${params.groupRows.length}`,
    `- SKUs in master catalog but missing from Convex: ${params.missingFromConvex.length}`,
    `- SKUs in Convex but missing from master catalog: ${params.missingFromMaster.length}`,
    `- Duplicate Grace SKUs in Convex export: ${params.duplicateConvexSkus.length}`,
    `- Duplicate Grace SKUs in master catalog: ${params.duplicateMasterSkus.length}`,
    `- Runtime products missing productGroupId: ${params.missingProductGroupId.length}`,
    `- Runtime products missing websiteSku: ${params.missingWebsiteSku.length}`,
    `- Runtime products missing heightWithoutCap or diameter: ${params.missingMeasurements.length}`,
    `- Cap-off-eligible runtime products: ${params.capOffEligible.length}`,
    `- Cap-off-eligible products without a tracked cap-off Madison asset: ${params.capOffMissing.length}`,
    "",
    "## Madison Cap-State Coverage",
    "",
    "These counts come from the master catalog `madison_cap_states` and `madison_image_count` fields, not from a live folder scan.",
    "",
    ...formatCountTable(["madison_cap_states", "Rows"], params.capStateCounts),
    "",
    ...formatCountTable(["madison_image_count", "Rows"], params.imageCountCounts),
    "",
    "## Missing Cap-Off Coverage",
    "",
    "Cap-off is expected only for applicators that need a separate PDP image, such as sprayers, atomizers, roll-ons, and lotion pumps.",
    "",
    ...formatCountTable(["Family", "Missing cap-off"], params.capOffMissingByFamily),
    "",
    ...formatCountTable(["Applicator", "Missing cap-off"], params.capOffMissingByApplicator),
    "",
    "### Sample Missing Cap-Off SKUs",
    "",
    formatList(sample(params.capOffMissing.map((product) => product.graceSku), 75)),
    "",
    "## Family Counts",
    "",
    ...formatCountTable(["Family", "Count"], topCounts(params.products, "family", 100)),
    "",
    "## Master -> Convex Gaps",
    "",
    formatList(sample(params.missingFromConvex)),
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
  return `${lines.join("\n").trimEnd()}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const masterPath = resolveInput("master", args.master ?? process.env.BEST_BOTTLES_MASTER_CSV, DEFAULT_MASTER_CANDIDATES);
  const convexPath = resolveInput(
    "convex",
    args.convex ?? args.products ?? process.env.BEST_BOTTLES_CONVEX_CSV ?? process.env.BEST_BOTTLES_PRODUCTS_CSV,
    DEFAULT_CONVEX_CANDIDATES,
  );
  const enrichmentPath = resolveInput(
    "enrichment",
    args.enrichment ?? process.env.BEST_BOTTLES_ENRICHMENT_CSV,
    DEFAULT_ENRICHMENT_CANDIDATES,
  );
  const groupsPath = resolveInput("groups", args.groups ?? process.env.BEST_BOTTLES_GROUPS_CSV, DEFAULT_GROUPS_CANDIDATES);
  const outPath = path.resolve(ROOT, args.out ?? DEFAULT_OUT);
  const reportPath = path.resolve(ROOT, args.report ?? DEFAULT_REPORT);

  const masterRows = csvRecords(masterPath);
  const convexRows = csvRecords(convexPath);
  const enrichmentRows = csvRecords(enrichmentPath);
  const groupRows = csvRecords(groupsPath);

  const masterSkus = skuSet(masterRows);
  const convexSkus = skuSet(convexRows);
  const duplicateMasterSkus = duplicateSkus(masterRows);
  const duplicateConvexSkus = duplicateSkus(convexRows);
  const missingFromConvex = difference(masterSkus, convexSkus);
  const missingFromMaster = difference(convexSkus, masterSkus);
  const convexBySku = rowsBySku(convexRows);
  const enrichmentBySku = rowsBySku(enrichmentRows);
  const masterBySku = rowsBySku(masterRows);

  const products = masterRows
    .map((row) => {
      const key = skuKey(pick(row, "graceSku", "grace_sku", "sku"));
      return mapProduct(row, {
        ...(enrichmentBySku.get(key) ?? {}),
        ...(convexBySku.get(key) ?? {}),
      });
    })
    .filter((product) => product.graceSku)
    .sort((a, b) => productSortKey(a).localeCompare(productSortKey(b)));

  const missingProductGroupId = products.filter((product) => !product.productGroupId);
  const missingWebsiteSku = products.filter((product) => !product.websiteSku);
  const missingMeasurements = products.filter((product) => !product.heightWithoutCap || !product.diameter);
  const capStateCounts = countRows(masterRows, capStateKey);
  const imageCountCounts = countRows(masterRows, (row) => pick(row, "madison_image_count", "madisonImageCount") || "(blank)");
  const capOffEligible = products.filter((product) => needsCapOff(product.applicator));
  const capOffMissing = capOffEligible.filter((product) => !hasCapState(masterBySku.get(skuKey(product.graceSku)), "cap-off"));
  const capOffMissingByFamily = topCounts(capOffMissing, "family", 100);
  const capOffMissingByApplicator = topCounts(capOffMissing, "applicator", 100);
  const modelVersion = convexRows.find((row) => row.modelVersion)?.modelVersion ?? null;
  const sourceGeneratedAt = convexRows.find((row) => row.generatedAt)?.generatedAt ?? null;

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(
    outPath,
    `${JSON.stringify({
      source: {
        masterCatalogFile: path.basename(masterPath),
        convexExportFile: path.basename(convexPath),
        enrichmentExportFile: path.basename(enrichmentPath),
        productGroupsFile: path.basename(groupsPath),
        modelVersion,
        sourceGeneratedAt,
        rowCount: products.length,
        comparison: {
          masterCatalogRows: masterRows.length,
          convexExportRows: convexRows.length,
          enrichmentRows: enrichmentRows.length,
          productGroupRows: groupRows.length,
          missingFromConvex: missingFromConvex.length,
          missingFromMaster: missingFromMaster.length,
          duplicateConvexSkus: duplicateConvexSkus.length,
          duplicateMasterSkus: duplicateMasterSkus.length,
          missingProductGroupId: missingProductGroupId.length,
          missingWebsiteSku: missingWebsiteSku.length,
          missingMeasurements: missingMeasurements.length,
          capStateCounts: Object.fromEntries(capStateCounts),
          imageCountCounts: Object.fromEntries(imageCountCounts),
          capOffEligible: capOffEligible.length,
          capOffMissing: capOffMissing.length,
        },
      },
      products,
    })}\n`,
  );

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(
    reportPath,
    buildReport({
      masterPath,
      convexPath,
      enrichmentPath,
      groupsPath,
      outPath,
      masterRows,
      convexRows,
      enrichmentRows,
      groupRows,
      products,
      missingFromConvex,
      missingFromMaster,
      duplicateConvexSkus,
      duplicateMasterSkus,
      missingProductGroupId,
      missingWebsiteSku,
      missingMeasurements,
      capStateCounts,
      imageCountCounts,
      capOffEligible,
      capOffMissing,
      capOffMissingByFamily,
      capOffMissingByApplicator,
    }),
  );

  console.log(JSON.stringify({
    outPath,
    reportPath,
    products: products.length,
    missingFromConvex: missingFromConvex.length,
    missingFromMaster: missingFromMaster.length,
    missingProductGroupId: missingProductGroupId.length,
    missingMeasurements: missingMeasurements.length,
    capOffEligible: capOffEligible.length,
    capOffMissing: capOffMissing.length,
  }, null, 2));
}

main();
