import fs from "node:fs";
import path from "node:path";

type CsvRow = Record<string, string>;
type PipelineProduct = {
  graceSku?: string;
  websiteSku?: string;
  productGroupSlug?: string;
  productGroupDisplayName?: string;
  family?: string;
  shopifySku?: string | null;
};
type PipelineData = {
  products?: PipelineProduct[];
  [key: string]: unknown;
};

const ROOT = process.cwd();
const DEFAULT_SHOPIFY_EXPORT = "/Users/jordanrichter/Downloads/products_export_1.csv";

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (quoted) {
      if (char === "\"" && next === "\"") {
        field += "\"";
        i += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === "\"") {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const headers = rows.shift() ?? [];
  return rows
    .filter((values) => values.some((value) => value.trim().length > 0))
    .map((values) =>
      Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])),
    );
}

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function csvEscape(value: unknown): string {
  const text = clean(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

function sqlString(value: unknown): string {
  const text = clean(value);
  return text ? `'${text.replace(/'/g, "''")}'` : "NULL";
}

const shopifyExportPath = argValue("shopify") ?? DEFAULT_SHOPIFY_EXPORT;
const pipelineDataPath =
  argValue("pipeline") ?? path.join(ROOT, "public/data/best-bottles-madison-pipeline-ui.json");
const shouldWrite = process.argv.includes("--write");

const SHOPIFY_SKU_ALIASES_BY_GRACE_SKU: Record<string, string> = {
  // Legacy Shopify stores this full 250 ml aluminum sprayer under the older
  // website/component SKU. Madison keeps the richer Grace SKU for Convex/PIM.
  "AB-ALU-CLR-250ML-SPR-BLK": "BB-ALU250SPRYBL",
};

if (!fs.existsSync(shopifyExportPath)) {
  throw new Error(`Shopify export not found: ${shopifyExportPath}`);
}
if (!fs.existsSync(pipelineDataPath)) {
  throw new Error(`Pipeline data not found: ${pipelineDataPath}`);
}

const shopifyRows = parseCsv(fs.readFileSync(shopifyExportPath, "utf8"));
const pipelineData = JSON.parse(fs.readFileSync(pipelineDataPath, "utf8")) as PipelineData;
const products = pipelineData.products ?? [];

const shopifyRowsByVariantSku = new Map<string, CsvRow>();
for (const row of shopifyRows) {
  const variantSku = clean(row["Variant SKU"]);
  if (variantSku) shopifyRowsByVariantSku.set(variantSku, row);
}

const crosswalk = products.map((product) => {
  const graceSku = clean(product.graceSku);
  const websiteSku = clean(product.websiteSku);
  const productGroupSlug = clean(product.productGroupSlug);
  const aliasedShopifySku = SHOPIFY_SKU_ALIASES_BY_GRACE_SKU[graceSku] ?? "";
  const shopify = shopifyRowsByVariantSku.get(graceSku) ?? shopifyRowsByVariantSku.get(aliasedShopifySku) ?? null;
  const shopifySku = clean(shopify?.["Variant SKU"]);

  return {
    status: shopifySku ? "matched" : "missing_shopify_variant_sku",
    graceSku,
    websiteSku,
    shopifySku,
    productGroupSlug,
    productGroupDisplayName: clean(product.productGroupDisplayName),
    family: clean(product.family),
    shopifyHandle: clean(shopify?.Handle),
    shopifyTitle: clean(shopify?.Title),
    shopifyType: clean(shopify?.Type),
    shopifyStatus: clean(shopify?.Status),
    shopifyPrice: clean(shopify?.["Variant Price"]),
    source: shopifySku
      ? aliasedShopifySku && shopifySku === aliasedShopifySku
        ? "manual_shopify_sku_alias"
        : "shopify_variant_sku_exact_grace_sku"
      : "",
  };
});

const matched = crosswalk.filter((row) => row.status === "matched");
const missing = crosswalk.filter((row) => row.status !== "matched");

if (shouldWrite) {
  const skuByGrace = new Map(matched.map((row) => [row.graceSku, row.shopifySku]));
  pipelineData.products = products.map((product) => {
    const graceSku = clean(product.graceSku);
    const shopifySku = skuByGrace.get(graceSku);
    return shopifySku ? { ...product, shopifySku } : product;
  });
  fs.writeFileSync(pipelineDataPath, `${JSON.stringify(pipelineData, null, 2)}\n`);
}

fs.mkdirSync(path.join(ROOT, "tmp"), { recursive: true });

fs.writeFileSync(
  path.join(ROOT, "tmp/best-bottles-shopify-sku-crosswalk.csv"),
  [
    [
      "status",
      "graceSku",
      "websiteSku",
      "shopifySku",
      "productGroupSlug",
      "productGroupDisplayName",
      "family",
      "shopifyHandle",
      "shopifyTitle",
      "shopifyType",
      "shopifyStatus",
      "shopifyPrice",
      "source",
    ].join(","),
    ...crosswalk.map((row) =>
      [
        row.status,
        row.graceSku,
        row.websiteSku,
        row.shopifySku,
        row.productGroupSlug,
        row.productGroupDisplayName,
        row.family,
        row.shopifyHandle,
        row.shopifyTitle,
        row.shopifyType,
        row.shopifyStatus,
        row.shopifyPrice,
        row.source,
      ].map(csvEscape).join(","),
    ),
  ].join("\n") + "\n",
);

fs.writeFileSync(
  path.join(ROOT, "tmp/best-bottles-shopify-sku-backfill.sql"),
  [
    "-- Backfill Madison pipeline SKU jobs with Shopify Variant SKU values.",
    "-- Generated from Shopify product export. Review before running against Supabase.",
    "BEGIN;",
    ...matched.map((row) =>
      [
        "UPDATE public.best_bottles_pipeline_sku_jobs",
        `SET shopify_sku = ${sqlString(row.shopifySku)}`,
        `WHERE grace_sku = ${sqlString(row.graceSku)}`,
        "  AND (shopify_sku IS NULL OR shopify_sku = '' OR shopify_sku = grace_sku);",
      ].join("\n"),
    ),
    "COMMIT;",
    "",
  ].join("\n"),
);

const aluminum500 = crosswalk.find((row) => row.graceSku === "AB-ALU-CLR-500ML") ?? null;
console.log(JSON.stringify({
  shopifyExportPath,
  pipelineDataPath,
  wrotePipelineData: shouldWrite,
  shopifyRows: shopifyRows.length,
  shopifyRowsWithVariantSku: shopifyRowsByVariantSku.size,
  pipelineProducts: products.length,
  matched: matched.length,
  missing: missing.length,
  aluminum500,
  outputs: [
    "tmp/best-bottles-shopify-sku-crosswalk.csv",
    "tmp/best-bottles-shopify-sku-backfill.sql",
  ],
}, null, 2));
