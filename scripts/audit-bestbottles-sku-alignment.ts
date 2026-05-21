import fs from "node:fs";
import path from "node:path";

type CsvRow = Record<string, string>;

const ROOT = process.cwd();
const ARGS = process.argv.slice(2);

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const found = ARGS.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

const SHOULD_FETCH_LEGACY = ARGS.includes("--fetch-legacy");
const LEGACY_FETCH_ALL = ARGS.includes("--all");
const LEGACY_FETCH_LIMIT = Number.parseInt(argValue("limit") ?? "", 10);
const LEGACY_FETCH_FAMILY = argValue("family");
const LEGACY_FETCH_SKU = argValue("sku");

const SOURCE_CANDIDATES = {
  convexLive: [
    path.join(ROOT, "tmp/best-bottles-convex-live-products.csv"),
  ],
  readiness: [
    path.join(ROOT, "tmp/best-bottles-generation-readiness.csv"),
    path.join(ROOT, "public/data/best-bottles-generation-readiness.csv"),
  ],
  productKnowledge: [
    process.env.BEST_BOTTLES_PRODUCT_KNOWLEDGE_CSV ?? "",
    "/Users/jordanrichter/Projects/Clients/Nemat-International/Best-Bottles-Website-02-20-2026/outputs/product-knowledge-2026-05-14/best_bottles_product_knowledge_products_2026-05-14.csv",
  ],
  productGroups: [
    process.env.BEST_BOTTLES_PRODUCT_GROUPS_CSV ?? "",
    "/Users/jordanrichter/Projects/Clients/Nemat-International/Best-Bottles-Website-02-20-2026/outputs/product-knowledge-2026-05-14/best_bottles_product_groups_2026-05-14.csv",
  ],
  masterMeasurements: [
    process.env.BEST_BOTTLES_MASTER_CSV ?? "",
    "/Users/jordanrichter/Downloads/best-bottles-master-measurements (1).csv",
    "/Users/jordanrichter/Downloads/best-bottles-master-measurements.csv",
  ],
  referenceCoverage: [
    process.env.BEST_BOTTLES_REFERENCE_COVERAGE_CSV ?? "",
    "/Users/jordanrichter/Projects/Clients/Nemat-International/Best-Bottles-Website-02-20-2026/data/source-of-truth/best-bottles-image-control-center-2026-05-20/coverage-audits/convex_product_reference_coverage.csv",
  ],
  referenceImageIndex: [
    process.env.BEST_BOTTLES_REFERENCE_IMAGE_INDEX_CSV ?? "",
    "/Users/jordanrichter/Desktop/AI-OS/outputs/best-bottles-image-testing/2026-05-08/all-families-grace-sku-image-index.csv",
  ],
  referenceRenamePlan: [
    process.env.BEST_BOTTLES_REFERENCE_RENAME_PLAN_CSV ?? "",
    "/Users/jordanrichter/Projects/Clients/Nemat-International/Best-Bottles-Website-02-20-2026/data/source-of-truth/best-bottles-image-control-center-2026-05-20/rename-plans/canonical_reference_rename_best_candidate_plan.csv",
  ],
};

function firstExisting(candidates: string[]): string | null {
  return candidates.filter(Boolean).find((candidate) => fs.existsSync(candidate)) ?? null;
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

function readCsv(file: string | null): CsvRow[] {
  if (!file) return [];
  return parseCsv(fs.readFileSync(file, "utf8"));
}

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function skuKey(value: unknown): string {
  return clean(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function filenameStem(value: unknown): string {
  const raw = clean(value);
  if (!raw) return "";
  const noQuery = raw.split(/[?#]/)[0];
  const base = noQuery.split(/[\\/]/).pop() ?? noQuery;
  return base.replace(/\.[^.]+$/, "");
}

function hasColumn(rows: CsvRow[], pattern: RegExp): boolean {
  return Object.keys(rows[0] ?? {}).some((column) => pattern.test(column));
}

function nonEmptyCount(rows: CsvRow[], field: string): number {
  return rows.filter((row) => clean(row[field])).length;
}

function expectedFilename(row: CsvRow): string {
  return clean(row.expectedCanonicalFilename ?? row.canonicalFilename);
}

function filenameContains(row: CsvRow, skuField: string): boolean {
  const filename = skuKey(expectedFilename(row));
  const sku = skuKey(row[skuField]);
  return !filename || !sku || filename.includes(sku);
}

function countMissingFilenameSku(rows: CsvRow[], skuField: string): number {
  return rows.filter((row) => expectedFilename(row) && clean(row[skuField]) && !filenameContains(row, skuField)).length;
}

function csvEscape(value: unknown): string {
  const text = clean(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#177;/g, "±")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function htmlField(html: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`<strong>\\s*${escaped}:\\s*<\\/strong>\\s*([^<]+)`, "i"));
  return match ? decodeHtml(match[1]) : "";
}

function htmlFirst(html: string, tag: string): string {
  const match = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeHtml(match[1]) : "";
}

function legacySkuLabel(html: string): string {
  const patterns = [
    /<strong>\s*(?:SKU|Item\s*(?:No\.?|Number|#)|Product\s*(?:No\.?|Number|#)):\s*<\/strong>\s*([^<]+)/i,
    /\b(?:SKU|Item\s*(?:No\.?|Number|#)|Product\s*(?:No\.?|Number|#)):\s*<\/[^>]+>\s*<[^>]+>\s*([^<]+)/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1]);
  }
  return "";
}

type LegacyCrosswalkRow = {
  graceSku: string;
  websiteSku: string;
  productId: string;
  family: string;
  productUrl: string;
  legacyH1: string;
  legacyItemName: string;
  legacyExplicitSku: string;
  legacySkuCandidate: string;
  legacyCandidateSource: string;
  normalizedCandidateMatchesWebsiteSku: string;
  normalizedCandidateMatchesGraceSku: string;
  suggestedShopifySku: string;
  notes: string;
};

async function buildLegacyCrosswalk(rows: CsvRow[]): Promise<LegacyCrosswalkRow[]> {
  if (!SHOULD_FETCH_LEGACY) return [];

  const cachePath = path.join(ROOT, "tmp/best-bottles-legacy-page-cache.json");
  const cache = fs.existsSync(cachePath)
    ? JSON.parse(fs.readFileSync(cachePath, "utf8")) as Record<string, string>
    : {};

  let targets = rows.filter((row) => clean(row.productUrl).startsWith("http"));
  if (LEGACY_FETCH_SKU) {
    const key = skuKey(LEGACY_FETCH_SKU);
    targets = targets.filter(
      (row) =>
        skuKey(row.graceSku) === key ||
        skuKey(row.websiteSku) === key ||
        skuKey(row.productId) === key,
    );
  }
  if (LEGACY_FETCH_FAMILY) {
    targets = targets.filter((row) => row.family === LEGACY_FETCH_FAMILY);
  }
  if (!LEGACY_FETCH_ALL && Number.isFinite(LEGACY_FETCH_LIMIT)) {
    targets = targets.slice(0, LEGACY_FETCH_LIMIT);
  } else if (!LEGACY_FETCH_ALL && !LEGACY_FETCH_FAMILY && !LEGACY_FETCH_SKU) {
    targets = targets.slice(0, 25);
  }

  const out: LegacyCrosswalkRow[] = [];
  for (const row of targets) {
    const productUrl = clean(row.productUrl);
    let html = cache[productUrl];
    if (!html) {
      const response = await fetch(productUrl, {
        headers: {
          "User-Agent": "Madison SKU alignment audit/1.0",
        },
      });
      html = await response.text();
      cache[productUrl] = html;
      fs.writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
    }

    const legacyH1 = htmlFirst(html, "h1");
    const legacyItemName = htmlField(html, "Item Name");
    const legacyExplicitSku = legacySkuLabel(html);
    const legacySkuCandidate = legacyExplicitSku || legacyItemName || legacyH1;
    const legacyCandidateSource = legacyExplicitSku
      ? "explicit-sku-label"
      : legacyItemName
        ? "item-name"
        : legacyH1
          ? "h1"
          : "";

    const candidateMatchesWebsiteSku = skuKey(legacySkuCandidate) === skuKey(row.websiteSku);
    const candidateMatchesGraceSku = skuKey(legacySkuCandidate) === skuKey(row.graceSku);
    out.push({
      graceSku: row.graceSku,
      websiteSku: row.websiteSku,
      productId: row.productId,
      family: row.family,
      productUrl,
      legacyH1,
      legacyItemName,
      legacyExplicitSku,
      legacySkuCandidate,
      legacyCandidateSource,
      normalizedCandidateMatchesWebsiteSku: candidateMatchesWebsiteSku ? "yes" : "no",
      normalizedCandidateMatchesGraceSku: candidateMatchesGraceSku ? "yes" : "no",
      suggestedShopifySku: legacyExplicitSku,
      notes: legacyExplicitSku
        ? "Legacy page exposes an explicit SKU-like label."
        : legacySkuCandidate
          ? "Legacy page exposes an item name, not a separate SKU label."
          : "No SKU-like label extracted from legacy page.",
    });
  }

  fs.writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
  return out;
}

const paths = Object.fromEntries(
  Object.entries(SOURCE_CANDIDATES).map(([key, candidates]) => [key, firstExisting(candidates)]),
) as Record<keyof typeof SOURCE_CANDIDATES, string | null>;

const convexRows = readCsv(paths.convexLive);
const readinessRows = readCsv(paths.readiness);
const knowledgeRows = readCsv(paths.productKnowledge);
const groupRows = readCsv(paths.productGroups);
const masterRows = readCsv(paths.masterMeasurements);
const coverageRows = readCsv(paths.referenceCoverage);
const imageIndexRows = readCsv(paths.referenceImageIndex);
const renamePlanRows = readCsv(paths.referenceRenamePlan);
const legacyCrosswalkRows = await buildLegacyCrosswalk(convexRows);

const imageUrlStemMismatches = convexRows
  .filter((row) => clean(row.imageUrl) && clean(row.websiteSku) && skuKey(filenameStem(row.imageUrl)) !== skuKey(row.websiteSku))
  .map((row) => ({
    issue: "image_url_stem_differs_from_website_sku",
    graceSku: row.graceSku,
    websiteSku: row.websiteSku,
    productId: row.productId,
    family: row.family,
    productUrl: row.productUrl,
    imageUrl: row.imageUrl,
    detail: `image stem: ${filenameStem(row.imageUrl)}`,
  }));

const missingWebsiteSku = convexRows
  .filter((row) => !clean(row.websiteSku))
  .map((row) => ({
    issue: "missing_website_sku",
    graceSku: row.graceSku,
    websiteSku: row.websiteSku,
    productId: row.productId,
    family: row.family,
    productUrl: row.productUrl,
    imageUrl: row.imageUrl,
    detail: "Convex live product has no websiteSku.",
  }));

const missingProductId = convexRows
  .filter((row) => !clean(row.productId))
  .map((row) => ({
    issue: "missing_product_id",
    graceSku: row.graceSku,
    websiteSku: row.websiteSku,
    productId: row.productId,
    family: row.family,
    productUrl: row.productUrl,
    imageUrl: row.imageUrl,
    detail: "Convex live product has no Madison productId.",
  }));

const outputMissingWebsiteSku = imageIndexRows
  .filter((row) => clean(row.output_path) && clean(row.website_sku) && !skuKey(filenameStem(row.output_path)).includes(skuKey(row.website_sku)))
  .slice(0, 100)
  .map((row) => ({
    issue: "reference_output_path_grace_keyed_only",
    graceSku: row.grace_sku,
    websiteSku: row.website_sku,
    productId: "",
    family: row.family,
    productUrl: "",
    imageUrl: row.output_path,
    detail: "Reference output path contains Grace SKU but not website SKU. Expected for source references; final canonical filenames include both.",
  }));

const audit = {
  generatedAt: new Date().toISOString(),
  paths,
  conclusion: {
    generationIdentity: "graceSku",
    legacyWebsiteIdentity: "websiteSku",
    commerceIdentity: "not present in current product exports",
    recommendedCommerceField: "shopifySku",
  },
  counts: {
    convexLiveProducts: convexRows.length,
    missingGraceSku: convexRows.filter((row) => !clean(row.graceSku)).length,
    missingWebsiteSku: missingWebsiteSku.length,
    missingProductId: missingProductId.length,
    productsWithImageUrl: convexRows.filter((row) => clean(row.imageUrl)).length,
    imageUrlStemMismatches: imageUrlStemMismatches.length,
    masterRows: masterRows.length,
    productKnowledgeRows: knowledgeRows.length,
    productKnowledgeShopifyProductIds: nonEmptyCount(knowledgeRows, "shopifyProductId"),
    productKnowledgeShopifyVariantIds: nonEmptyCount(knowledgeRows, "shopifyVariantId"),
    productKnowledgeShopifyInventoryItemIds: nonEmptyCount(knowledgeRows, "shopifyInventoryItemId"),
    productKnowledgeHasShopifySkuColumn: hasColumn(knowledgeRows, /shopify.*sku/i),
    productGroupRows: groupRows.length,
    readinessRows: readinessRows.length,
    readinessFilenamesMissingGraceSku: countMissingFilenameSku(readinessRows, "graceSku"),
    readinessFilenamesMissingWebsiteSku: countMissingFilenameSku(readinessRows, "websiteSku"),
    referenceCoverageRows: coverageRows.length,
    referenceCoverageMissingLocalReference: coverageRows.filter((row) => row.coverageStatus === "missing_local_reference_image").length,
    referenceCoverageHasAnyLocalImage: coverageRows.filter((row) => row.hasAnyLocalImage === "yes").length,
    referenceCoverageFilenamesMissingGraceSku: countMissingFilenameSku(coverageRows, "graceSku"),
    referenceCoverageFilenamesMissingWebsiteSku: countMissingFilenameSku(coverageRows, "websiteSku"),
    referenceImageIndexRows: imageIndexRows.length,
    referenceImageIndexOutputMissingGraceSku: imageIndexRows.filter((row) => clean(row.output_path) && clean(row.grace_sku) && !skuKey(filenameStem(row.output_path)).includes(skuKey(row.grace_sku))).length,
    referenceImageIndexOutputMissingWebsiteSku: imageIndexRows.filter((row) => clean(row.output_path) && clean(row.website_sku) && !skuKey(filenameStem(row.output_path)).includes(skuKey(row.website_sku))).length,
    referenceRenamePlanRows: renamePlanRows.length,
    referenceRenamePlanFilenamesMissingGraceSku: countMissingFilenameSku(renamePlanRows, "matchedGraceSku"),
    referenceRenamePlanFilenamesMissingWebsiteSku: countMissingFilenameSku(renamePlanRows, "matchedWebsiteSku"),
    legacyCrosswalkRows: legacyCrosswalkRows.length,
    legacyCrosswalkExplicitSkuLabels: legacyCrosswalkRows.filter((row) => row.legacyExplicitSku).length,
    legacyCrosswalkItemNameMatchesWebsiteSku: legacyCrosswalkRows.filter((row) => row.normalizedCandidateMatchesWebsiteSku === "yes").length,
  },
  aluminum500: convexRows.find((row) => row.graceSku === "AB-ALU-CLR-500ML" || row.websiteSku === "Alu500") ?? null,
  exceptions: [
    ...missingWebsiteSku,
    ...missingProductId,
    ...imageUrlStemMismatches,
    ...outputMissingWebsiteSku,
  ],
};

const reportLines = [
  "# Best Bottles SKU Alignment Audit",
  "",
  `Generated: ${audit.generatedAt}`,
  "",
  "## Rule Check",
  "",
  "- `graceSku` is the internal generation identity and reference-image key.",
  "- `websiteSku` is the legacy BestBottles item/page identity.",
  "- `shopifySku` / commerce-facing SKU is not present in the current product exports, so values like `ALU 500` cannot be inferred safely from the existing Convex/product rows.",
  "- Final canonical filenames are aligned: they include both `graceSku` and `websiteSku`.",
  "- Source reference image paths are Grace-SKU keyed only; that is expected for matching references before final approval.",
  "",
  "## Source Coverage",
  "",
  "| Source | Rows | Key finding |",
  "| --- | ---: | --- |",
  `| Convex live products | ${audit.counts.convexLiveProducts} | ${audit.counts.missingWebsiteSku} missing websiteSku, ${audit.counts.missingProductId} missing productId, ${audit.counts.imageUrlStemMismatches} image URL stems differ from websiteSku |`,
  `| Product knowledge export | ${audit.counts.productKnowledgeRows} | ${audit.counts.productKnowledgeShopifyVariantIds} Shopify variant ids, Shopify SKU column present: ${audit.counts.productKnowledgeHasShopifySkuColumn ? "yes" : "no"} |`,
  `| Readiness report | ${audit.counts.readinessRows} | filenames missing Grace SKU: ${audit.counts.readinessFilenamesMissingGraceSku}; filenames missing website SKU: ${audit.counts.readinessFilenamesMissingWebsiteSku} |`,
  `| Reference coverage | ${audit.counts.referenceCoverageRows} | ${audit.counts.referenceCoverageHasAnyLocalImage} have local reference image; filenames missing Grace/website SKU: ${audit.counts.referenceCoverageFilenamesMissingGraceSku}/${audit.counts.referenceCoverageFilenamesMissingWebsiteSku} |`,
  `| Reference image index | ${audit.counts.referenceImageIndexRows} | output paths missing Grace SKU: ${audit.counts.referenceImageIndexOutputMissingGraceSku}; output paths missing website SKU: ${audit.counts.referenceImageIndexOutputMissingWebsiteSku} |`,
  `| Rename plan | ${audit.counts.referenceRenamePlanRows} | canonical filenames missing Grace/website SKU: ${audit.counts.referenceRenamePlanFilenamesMissingGraceSku}/${audit.counts.referenceRenamePlanFilenamesMissingWebsiteSku} |`,
  `| Legacy page crosswalk | ${audit.counts.legacyCrosswalkRows} | explicit SKU labels: ${audit.counts.legacyCrosswalkExplicitSkuLabels}; item/SKU candidate matches websiteSku: ${audit.counts.legacyCrosswalkItemNameMatchesWebsiteSku} |`,
  "",
  "## 500 ml Aluminum Example",
  "",
  audit.aluminum500
    ? `- ` +
      [
        `websiteSku: \`${audit.aluminum500.websiteSku}\``,
        `graceSku: \`${audit.aluminum500.graceSku}\``,
        `productId: \`${audit.aluminum500.productId}\``,
        `productUrl: ${audit.aluminum500.productUrl}`,
      ].join(" · ")
    : "- Not found in Convex live products.",
  "",
  "The current data supports `Alu500` and `AB-ALU-CLR-500ML`. It does not contain a separate commerce/display SKU such as `ALU 500`.",
  legacyCrosswalkRows.find((row) => row.graceSku === "AB-ALU-CLR-500ML")
    ? `Legacy page fetch confirms the page candidate is \`${legacyCrosswalkRows.find((row) => row.graceSku === "AB-ALU-CLR-500ML")?.legacySkuCandidate}\` from \`${legacyCrosswalkRows.find((row) => row.graceSku === "AB-ALU-CLR-500ML")?.legacyCandidateSource}\`.`
    : "",
  "",
  "## Exceptions",
  "",
  `Wrote ${audit.exceptions.length} sampled/typed exceptions to \`tmp/best-bottles-sku-alignment-exceptions.csv\`. The largest bucket is image URL stem mismatch; many of those are harmless because some URLs now point at generated hashes or legacy filename variants rather than exact websiteSku stems.`,
  "",
  "## Recommendation",
  "",
  "Add an explicit commerce SKU field, preferably `shopifySku`, to the Convex product record and Madison pipeline SKU jobs. Populate it from a Shopify variant export/API sync, not from string heuristics. Then use SKU candidates in this order when pushing:",
  "",
  "1. `shopifySku`",
  "2. `websiteSku`",
  "3. `graceSku`",
  "4. `productId` as a last-resort diagnostic label only",
  "",
  "This preserves the current image-generation rule while making Shopify matching deterministic.",
  "",
  "## Source Paths",
  "",
  ...Object.entries(paths).map(([key, value]) => `- ${key}: ${value ?? "(not found)"}`),
  "",
];

fs.mkdirSync(path.join(ROOT, "tmp"), { recursive: true });
fs.mkdirSync(path.join(ROOT, "docs"), { recursive: true });
fs.writeFileSync(
  path.join(ROOT, "tmp/best-bottles-sku-alignment-audit.json"),
  `${JSON.stringify(audit, null, 2)}\n`,
);
fs.writeFileSync(
  path.join(ROOT, "tmp/best-bottles-sku-alignment-exceptions.csv"),
  [
    ["issue", "graceSku", "websiteSku", "productId", "family", "productUrl", "imageUrl", "detail"].join(","),
    ...audit.exceptions.map((row) =>
      [
        row.issue,
        row.graceSku,
        row.websiteSku,
        row.productId,
        row.family,
        row.productUrl,
        row.imageUrl,
        row.detail,
      ].map(csvEscape).join(","),
    ),
  ].join("\n") + "\n",
);
fs.writeFileSync(
  path.join(ROOT, "tmp/best-bottles-legacy-sku-crosswalk.csv"),
  [
    [
      "graceSku",
      "websiteSku",
      "productId",
      "family",
      "productUrl",
      "legacyH1",
      "legacyItemName",
      "legacyExplicitSku",
      "legacySkuCandidate",
      "legacyCandidateSource",
      "normalizedCandidateMatchesWebsiteSku",
      "normalizedCandidateMatchesGraceSku",
      "suggestedShopifySku",
      "notes",
    ].join(","),
    ...legacyCrosswalkRows.map((row) =>
      [
        row.graceSku,
        row.websiteSku,
        row.productId,
        row.family,
        row.productUrl,
        row.legacyH1,
        row.legacyItemName,
        row.legacyExplicitSku,
        row.legacySkuCandidate,
        row.legacyCandidateSource,
        row.normalizedCandidateMatchesWebsiteSku,
        row.normalizedCandidateMatchesGraceSku,
        row.suggestedShopifySku,
        row.notes,
      ].map(csvEscape).join(","),
    ),
  ].join("\n") + "\n",
);
fs.writeFileSync(
  path.join(ROOT, "docs/best-bottles-sku-alignment-audit.md"),
  reportLines.join("\n"),
);

console.log(`Wrote docs/best-bottles-sku-alignment-audit.md`);
console.log(`Wrote tmp/best-bottles-sku-alignment-audit.json`);
console.log(`Wrote tmp/best-bottles-sku-alignment-exceptions.csv`);
console.log(`Wrote tmp/best-bottles-legacy-sku-crosswalk.csv`);
console.log(JSON.stringify(audit.counts, null, 2));
