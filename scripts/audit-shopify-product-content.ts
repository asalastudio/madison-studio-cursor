import fs from "node:fs";
import path from "node:path";

type CsvRow = Record<string, string>;

type ProductAudit = {
  handle: string;
  title: string;
  type: string;
  status: string;
  variantCount: number;
  imageCount: number;
  bodyLength: number;
  seoTitleLength: number;
  seoDescriptionLength: number;
  issueCount: number;
  issues: string[];
};

const ROOT = process.cwd();
const DEFAULT_SHOPIFY_EXPORT = "/Users/jordanrichter/Downloads/products_export_1.csv";
const SHOPIFY_MAX_SEO_TITLE = 70;
const SHOPIFY_MAX_SEO_DESCRIPTION = 320;
const PRACTICAL_MIN_DESCRIPTION = 80;
const PRACTICAL_MIN_SEO_DESCRIPTION = 80;
const PRACTICAL_MAX_IMAGE_ALT = 125;

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

function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function csvEscape(value: unknown): string {
  const text = clean(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

function countWhere(rows: CsvRow[], column: string, predicate: (value: string, row: CsvRow) => boolean): number {
  return rows.filter((row) => predicate(clean(row[column]), row)).length;
}

function percent(value: number, total: number): string {
  if (total === 0) return "0.0%";
  return `${((value / total) * 100).toFixed(1)}%`;
}

const shopifyExportPath = argValue("shopify") ?? DEFAULT_SHOPIFY_EXPORT;
if (!fs.existsSync(shopifyExportPath)) {
  throw new Error(`Shopify export not found: ${shopifyExportPath}`);
}

const text = fs.readFileSync(shopifyExportPath, "utf8");
const headers = parseCsv(text.split("\n")[0] + "\n").length ? [] : text.slice(0, text.indexOf("\n")).split(",");
const rows = parseCsv(text);
const rowsByHandle = new Map<string, CsvRow[]>();

for (const row of rows) {
  const handle = clean(row.Handle);
  if (!handle) continue;
  rowsByHandle.set(handle, [...(rowsByHandle.get(handle) ?? []), row]);
}

const products = [...rowsByHandle.entries()].map(([handle, productRows]): ProductAudit => {
  const primary = productRows.find((row) => clean(row.Title)) ?? productRows[0];
  const variantRows = productRows.filter((row) => clean(row["Variant SKU"]) || clean(row["Variant Price"]));
  const imageRows = productRows.filter((row) => clean(row["Image Src"]));
  const bodyText = stripHtml(clean(primary["Body (HTML)"]));
  const seoTitle = clean(primary["SEO Title"]);
  const seoDescription = clean(primary["SEO Description"]);
  const issues: string[] = [];

  if (!clean(primary.Title)) issues.push("missing_title");
  if (!handle) issues.push("missing_handle");
  if (!bodyText) issues.push("missing_body_html");
  if (bodyText && bodyText.length < PRACTICAL_MIN_DESCRIPTION) issues.push("short_body_html");
  if (!clean(primary.Vendor)) issues.push("missing_vendor");
  if (!clean(primary["Product Category"])) issues.push("missing_shopify_product_category");
  if (!clean(primary.Type)) issues.push("missing_product_type");
  if (!clean(primary.Tags)) issues.push("missing_tags");
  if (!clean(primary.Published)) issues.push("missing_published");
  if (!clean(primary.Status)) issues.push("missing_status");
  if (!clean(primary["SEO Title"])) issues.push("missing_seo_title");
  if (seoTitle.length > SHOPIFY_MAX_SEO_TITLE) issues.push("seo_title_over_70");
  if (!seoDescription) issues.push("missing_seo_description");
  if (seoDescription && seoDescription.length < PRACTICAL_MIN_SEO_DESCRIPTION) {
    issues.push("short_seo_description");
  }
  if (seoDescription.length > SHOPIFY_MAX_SEO_DESCRIPTION) issues.push("seo_description_over_320");
  if (imageRows.length === 0) issues.push("missing_product_image");
  if (imageRows.some((row) => !clean(row["Image Alt Text"]))) issues.push("missing_image_alt_text");
  if (imageRows.some((row) => clean(row["Image Alt Text"]).length > PRACTICAL_MAX_IMAGE_ALT)) {
    issues.push("image_alt_text_over_125");
  }
  if (variantRows.length === 0) issues.push("missing_variant_row");
  if (variantRows.some((row) => !clean(row["Variant SKU"]))) issues.push("missing_variant_sku");
  if (variantRows.some((row) => !clean(row["Variant Price"]))) issues.push("missing_variant_price");
  if (variantRows.some((row) => Number(clean(row["Variant Price"])) <= 0)) {
    issues.push("zero_or_invalid_variant_price");
  }
  if (variantRows.some((row) => !clean(row["Variant Requires Shipping"]))) {
    issues.push("missing_variant_requires_shipping");
  }
  if (variantRows.some((row) => !clean(row["Variant Taxable"]))) issues.push("missing_variant_taxable");
  if (variantRows.some((row) => !clean(row["Variant Fulfillment Service"]))) {
    issues.push("missing_variant_fulfillment_service");
  }
  if (variantRows.some((row) => !clean(row["Variant Inventory Policy"]))) {
    issues.push("missing_variant_inventory_policy");
  }
  if (variantRows.some((row) => !clean(row["Variant Weight Unit"]))) issues.push("missing_variant_weight_unit");

  const capacity = clean(primary["Capacity (ml) (product.metafields.custom.capacity_ml)"]);
  const family = clean(primary["Bottle Family (product.metafields.custom.bottle_family)"]);
  const neck = clean(primary["Neck Thread Size (product.metafields.custom.neck_thread_size)"]);
  const heightWithCap = clean(primary["Height With Cap (product.metafields.custom.height_with_cap)"]);
  const heightWithoutCap = clean(primary["Height Without Cap (product.metafields.custom.height_without_cap)"]);
  const diameter = clean(primary["Diameter (product.metafields.custom.diameter)"]);

  if (!family) issues.push("missing_bottle_family_metafield");
  if (!capacity) issues.push("missing_capacity_ml_metafield");
  if (!neck) issues.push("missing_neck_thread_metafield");
  if (!heightWithCap && !heightWithoutCap) issues.push("missing_height_metafield");
  if (!diameter) issues.push("missing_diameter_metafield");

  return {
    handle,
    title: clean(primary.Title),
    type: clean(primary.Type),
    status: clean(primary.Status),
    variantCount: variantRows.length,
    imageCount: imageRows.length,
    bodyLength: bodyText.length,
    seoTitleLength: seoTitle.length,
    seoDescriptionLength: seoDescription.length,
    issueCount: issues.length,
    issues,
  };
});

const variantRows = rows.filter((row) => clean(row["Variant SKU"]) || clean(row["Variant Price"]));
const imageRows = rows.filter((row) => clean(row["Image Src"]));
const googleShoppingColumns = headers.filter((header) => header.startsWith("Google Shopping /"));
const uniqueVariantSkus = new Set(variantRows.map((row) => clean(row["Variant SKU"])).filter(Boolean));
const duplicateSkus = [...uniqueVariantSkus].filter(
  (sku) => variantRows.filter((row) => clean(row["Variant SKU"]) === sku).length > 1,
);
const productCategoryMissing = products.filter((product) =>
  product.issues.includes("missing_shopify_product_category"),
).length;
const seoTitleMissing = products.filter((product) => product.issues.includes("missing_seo_title")).length;
const seoDescriptionMissing = products.filter((product) =>
  product.issues.includes("missing_seo_description"),
).length;
const bodyMissing = products.filter((product) => product.issues.includes("missing_body_html")).length;
const imageAltMissingProducts = products.filter((product) =>
  product.issues.includes("missing_image_alt_text"),
).length;
const requiredFieldRows = [
  ["Handle", products.filter((product) => !product.handle).length, products.length],
  ["Title", products.filter((product) => !product.title).length, products.length],
  ["Vendor", products.filter((product) => product.issues.includes("missing_vendor")).length, products.length],
  ["Product Category", productCategoryMissing, products.length],
  ["Type", products.filter((product) => product.issues.includes("missing_product_type")).length, products.length],
  ["Tags", products.filter((product) => product.issues.includes("missing_tags")).length, products.length],
  ["Published", products.filter((product) => product.issues.includes("missing_published")).length, products.length],
  ["Status", products.filter((product) => product.issues.includes("missing_status")).length, products.length],
  ["Variant SKU", countWhere(variantRows, "Variant SKU", (value) => !value), variantRows.length],
  ["Variant Price", countWhere(variantRows, "Variant Price", (value) => !value), variantRows.length],
  [
    "Variant Requires Shipping",
    countWhere(variantRows, "Variant Requires Shipping", (value) => !value),
    variantRows.length,
  ],
  ["Variant Taxable", countWhere(variantRows, "Variant Taxable", (value) => !value), variantRows.length],
  [
    "Variant Fulfillment Service",
    countWhere(variantRows, "Variant Fulfillment Service", (value) => !value),
    variantRows.length,
  ],
  [
    "Variant Inventory Policy",
    countWhere(variantRows, "Variant Inventory Policy", (value) => !value),
    variantRows.length,
  ],
  ["Image Src", products.filter((product) => product.issues.includes("missing_product_image")).length, products.length],
  ["Image Alt Text", countWhere(imageRows, "Image Alt Text", (value) => !value), imageRows.length],
  ["Body (HTML)", bodyMissing, products.length],
  ["SEO Title", seoTitleMissing, products.length],
  ["SEO Description", seoDescriptionMissing, products.length],
];

const issueCounts = new Map<string, number>();
for (const product of products) {
  for (const issue of product.issues) {
    issueCounts.set(issue, (issueCounts.get(issue) ?? 0) + 1);
  }
}

const issueRows = [...issueCounts.entries()]
  .sort((a, b) => b[1] - a[1])
  .map(([issue, count]) => ({ issue, count, percent: percent(count, products.length) }));

const families = new Map<string, { products: number; issues: number; seoMissing: number; categoryMissing: number }>();
for (const product of products) {
  const family = product.type || "Unknown";
  const current = families.get(family) ?? { products: 0, issues: 0, seoMissing: 0, categoryMissing: 0 };
  current.products += 1;
  current.issues += product.issueCount;
  if (product.issues.includes("missing_seo_description") || product.issues.includes("missing_seo_title")) {
    current.seoMissing += 1;
  }
  if (product.issues.includes("missing_shopify_product_category")) current.categoryMissing += 1;
  families.set(family, current);
}

fs.mkdirSync(path.join(ROOT, "tmp"), { recursive: true });
fs.mkdirSync(path.join(ROOT, "docs"), { recursive: true });

const detailPath = path.join(ROOT, "tmp/best-bottles-shopify-content-audit.csv");
fs.writeFileSync(
  detailPath,
  [
    [
      "handle",
      "title",
      "type",
      "status",
      "variantCount",
      "imageCount",
      "bodyLength",
      "seoTitleLength",
      "seoDescriptionLength",
      "issueCount",
      "issues",
    ].join(","),
    ...products
      .sort((a, b) => b.issueCount - a.issueCount || a.handle.localeCompare(b.handle))
      .map((product) =>
        [
          product.handle,
          product.title,
          product.type,
          product.status,
          product.variantCount,
          product.imageCount,
          product.bodyLength,
          product.seoTitleLength,
          product.seoDescriptionLength,
          product.issueCount,
          product.issues.join("; "),
        ]
          .map(csvEscape)
          .join(","),
      ),
  ].join("\n") + "\n",
);

const reportPath = path.join(ROOT, "docs/BEST_BOTTLES_SHOPIFY_CSV_CONTENT_AUDIT.md");
const familyRows = [...families.entries()]
  .sort((a, b) => b[1].issues - a[1].issues || a[0].localeCompare(b[0]))
  .slice(0, 20)
  .map(
    ([family, stats]) =>
      `| ${family} | ${stats.products} | ${stats.issues} | ${stats.seoMissing} | ${stats.categoryMissing} |`,
  )
  .join("\n");
const issueTable = issueRows
  .slice(0, 24)
  .map((row) => `| ${row.issue} | ${row.count} | ${row.percent} |`)
  .join("\n");
const requiredFieldTable = requiredFieldRows
  .map(([field, missing, total]) => `| ${field} | ${missing} | ${total} | ${percent(Number(missing), Number(total))} |`)
  .join("\n");
const worstProducts = products
  .sort((a, b) => b.issueCount - a.issueCount || a.handle.localeCompare(b.handle))
  .slice(0, 25)
  .map(
    (product) =>
      `| ${product.handle} | ${product.title.replace(/\|/g, "/")} | ${product.type || "Unknown"} | ${product.issueCount} | ${product.issues.slice(0, 6).join(", ")} |`,
  )
  .join("\n");

fs.writeFileSync(
  reportPath,
  `# Best Bottles Shopify CSV Content Audit

Generated from: \`${shopifyExportPath}\`

## Executive Summary

- CSV rows parsed: ${rows.length}
- Unique products by handle: ${products.length}
- Variant rows: ${variantRows.length}
- Unique variant SKUs: ${uniqueVariantSkus.size}
- Product image rows: ${imageRows.length}
- Duplicate variant SKUs: ${duplicateSkus.length}
- Google Shopping CSV columns present: ${googleShoppingColumns.length}

## Highest-Impact Gaps

- Missing Shopify standard product category: ${productCategoryMissing} / ${products.length}
- Missing SEO title: ${seoTitleMissing} / ${products.length}
- Missing SEO description: ${seoDescriptionMissing} / ${products.length}
- Missing or empty product description: ${bodyMissing} / ${products.length}
- Products with at least one missing image alt text: ${imageAltMissingProducts} / ${products.length}

## Core Field Completeness

| Field | Missing | Scope | Missing Share |
| --- | ---: | ---: | ---: |
${requiredFieldTable}

## Issue Counts

| Issue | Products | Share |
| --- | ---: | ---: |
${issueTable}

## Family Hotspots

| Type / Family | Products | Total Issues | SEO Missing | Category Missing |
| --- | ---: | ---: | ---: | ---: |
${familyRows}

## Highest-Issue Products

| Handle | Title | Type | Issues | First Issues |
| --- | --- | --- | ---: | --- |
${worstProducts}

## Recommended Field Policy

### Shopify Import Safety

- Keep \`Handle\`, \`Title\`, \`Option1 Name\`, \`Option1 Value\`, \`Variant SKU\`, and \`Variant Price\` intact when updating variants.
- Do not edit option values unless you intend to recreate variant IDs.
- Keep the file UTF-8 encoded.

### SEO / AEO / GEO Product Content

- Fill \`SEO Title\` for every product, max 70 characters.
- Fill \`SEO Description\` for every product, max 320 characters.
- Fill \`Body (HTML)\` with product facts: material, capacity, shape/family, closure/applicator, thread, dimensions, case quantity, usage.
- Fill \`Image Alt Text\` for every product image, ideally 125 characters or fewer.
- Fill \`Product Category\` using Shopify Standard Product Taxonomy.
- Keep \`Type\`, bottle family, capacity, thread, height, diameter, and compatible-thread metafields populated for filtering, search, and answer-engine retrieval.

### Merchant / Feed Readiness

- If Google Merchant Center is driven by a feed/app outside this CSV, map SKU as item ID, product title, description, link, image link, availability, price, brand, item group ID, material, size/capacity, and product category there.
- If a CSV-driven Google Shopping app consumes Shopify export columns, add the app-supported \`Google Shopping / ...\` columns through Shopify/admin definitions rather than arbitrary extra columns.
`,
);

console.log(JSON.stringify({
  shopifyExportPath,
  rows: rows.length,
  products: products.length,
  variantRows: variantRows.length,
  imageRows: imageRows.length,
  duplicateVariantSkus: duplicateSkus.length,
  googleShoppingColumns: googleShoppingColumns.length,
  highestImpact: {
    missingProductCategory: productCategoryMissing,
    missingSeoTitle: seoTitleMissing,
    missingSeoDescription: seoDescriptionMissing,
    missingBodyHtml: bodyMissing,
    productsWithMissingImageAltText: imageAltMissingProducts,
  },
  topIssues: issueRows.slice(0, 12),
  outputs: [
    path.relative(ROOT, reportPath),
    path.relative(ROOT, detailPath),
  ],
}, null, 2));
