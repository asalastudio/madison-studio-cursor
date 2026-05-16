/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * BEST BOTTLES → MADISON PRODUCT HUB BULK IMPORTER (Grouped)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Reads the Convex catalog export and creates one product_hubs row per
 * (family + capacityMl + glass color) GROUP under Best Bottles' organization.
 * Mirrors Convex's productGroups model (~139 groups for 2,321 SKUs) and the
 * bestbottles.com URL structure (one product page per bottle vessel).
 *
 * Hub level (product_hubs columns + metadata.bottle_specs):
 *   - Vessel attributes: family, size, glass color, neck thread, dimensions
 *   - Marketing fields: name, descriptions, tags, collections
 *   - Price range: min/max across variants
 *
 * Variant level (product_hubs.variants JSONB + product_hubs.options JSONB):
 *   - Each Grace SKU in the group becomes one variant entry
 *   - option1 = Applicator, option2 = Cap Color, option3 = Cap Style (when present)
 *   - Per-variant price (webPrice1pc), barcode, image_url, etc.
 *   - Options array describes the variation axes used by this group
 *
 * USAGE:
 *   # Dry run — produces import-plan.json for review, no DB writes:
 *   npx tsx scripts/import-bestbottles-catalog.ts --org=<UUID> --csv=/path/to/catalog.csv
 *
 *   # Live run — actually writes to Supabase (idempotent on (organization_id, sku)):
 *   npx tsx scripts/import-bestbottles-catalog.ts --org=<UUID> --csv=/path/to/catalog.csv --live
 *
 * REQUIRED ENV (live mode):
 *   SUPABASE_URL                — e.g. https://xxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY   — service role key (NOT the anon key — needs write access)
 *
 * IDEMPOTENCY:
 *   Re-running is safe. Existing hubs matched by (organization_id, sku) are
 *   updated in place; new hubs are inserted. SKU is a synthetic group key:
 *   GROUP-{FAMILY}-{SIZE}ML-{COLOR}, e.g. GROUP-EMP-50ML-CLR.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

// ─── CLI ARGS ────────────────────────────────────────────────────────────────

interface CliArgs {
  org: string;
  csv: string;
  live: boolean;
  batchSize: number;
  output: string;
  defaultStatus: "draft" | "active";
}

function parseArgs(): CliArgs {
  const args: Partial<CliArgs> = { live: false, batchSize: 50, defaultStatus: "draft" };
  for (const arg of process.argv.slice(2)) {
    if (arg === "--live") args.live = true;
    else if (arg.startsWith("--org=")) args.org = arg.slice(6);
    else if (arg.startsWith("--csv=")) args.csv = arg.slice(6);
    else if (arg.startsWith("--batch=")) args.batchSize = parseInt(arg.slice(8), 10);
    else if (arg.startsWith("--output=")) args.output = arg.slice(9);
    else if (arg === "--active") args.defaultStatus = "active";
  }
  if (!args.org) throw new Error("Missing --org=<UUID>");
  if (!args.csv) throw new Error("Missing --csv=<path>");
  args.output ??= path.resolve("./bestbottles-import-plan.json");
  return args as CliArgs;
}

// ─── CSV ────────────────────────────────────────────────────────────────────

interface CatalogRow {
  productId: string;
  websiteSku: string;
  graceSku: string;
  category: string;
  family: string;
  shape: string;
  color: string;
  capacity: string;
  capacityMl: string;
  capacityOz: string;
  applicator: string;
  capColor: string;
  trimColor: string;
  capStyle: string;
  capHeight: string;
  ballMaterial: string;
  neckThreadSize: string;
  heightWithCap: string;
  heightWithoutCap: string;
  diameter: string;
  bottleWeightG: string;
  caseQuantity: string;
  qbPrice: string;
  webPrice1pc: string;
  webPrice10pc: string;
  webPrice12pc: string;
  stockStatus: string;
  itemName: string;
  itemDescription: string;
  imageUrl: string;
  productUrl: string;
  dataGrade: string;
  bottleCollection: string;
  fitmentStatus: string;
  graceDescription: string;
  assemblyType: string;
  componentGroup: string;
  verified: string;
  importSource: string;
}

function parseCsv(text: string): CatalogRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { row.push(field); field = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && next === "\n") i++;
        row.push(field); field = "";
        if (row.length > 1 || row[0] !== "") rows.push(row);
        row = [];
      } else field += ch;
    }
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  if (rows.length < 2) return [];
  const header = rows[0];
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    header.forEach((c, i) => { obj[c.trim()] = (r[i] ?? "").trim(); });
    return normalizeCatalogRow(obj);
  });
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

const num = (s: string | undefined | null): number | null => {
  if (!s) return null;
  const c = s.replace(/[^0-9.-]/g, "");
  if (!c) return null;
  const n = parseFloat(c);
  return Number.isFinite(n) ? n : null;
};

const nonEmpty = (s: string | undefined | null): string | null => {
  if (!s) return null;
  const t = s.trim();
  return t.length > 0 ? t : null;
};

function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value != null && value.trim() !== "") return value.trim();
  }
  return "";
}

function normalizeThreadSize(value: string): string {
  const raw = value.trim();
  const numericThread = raw.match(/^(\d{1,2})[\s._/-]+(\d{3})$/);
  if (numericThread) return `${numericThread[1]}-${numericThread[2]}`;
  if (/^press[-_\s]?fit$/i.test(raw)) return "Press-Fit";
  if (/^snap[-_\s]?on$/i.test(raw)) return "Snap-On";
  return raw;
}

function normalizeCatalogRow(row: Record<string, string>): CatalogRow {
  return {
    productId: pick(row, "productId", "product_id"),
    websiteSku: pick(row, "websiteSku", "website_sku"),
    graceSku: pick(row, "graceSku", "grace_sku", "sku"),
    category: pick(row, "category"),
    family: pick(row, "family"),
    shape: pick(row, "shape"),
    color: pick(row, "color", "glass_color"),
    capacity: pick(row, "capacity"),
    capacityMl: pick(row, "capacityMl", "capacity_ml"),
    capacityOz: pick(row, "capacityOz", "capacity_oz"),
    applicator: pick(row, "applicator"),
    capColor: pick(row, "capColor", "cap_color"),
    trimColor: pick(row, "trimColor", "trim_color"),
    capStyle: pick(row, "capStyle", "cap_style"),
    capHeight: pick(row, "capHeight", "cap_height", "cap_height_mm"),
    ballMaterial: pick(row, "ballMaterial", "ball_material"),
    neckThreadSize: normalizeThreadSize(pick(row, "neckThreadSize", "neck_thread_size")),
    heightWithCap: pick(row, "heightWithCap", "height_with_cap_mm"),
    heightWithoutCap: pick(row, "heightWithoutCap", "height_without_cap_mm", "prompt_height_mm"),
    diameter: pick(row, "diameter", "diameter_mm", "width_mm", "prompt_width_mm"),
    bottleWeightG: pick(row, "bottleWeightG", "bottle_weight_g"),
    caseQuantity: pick(row, "caseQuantity", "case_quantity"),
    qbPrice: pick(row, "qbPrice", "qb_price"),
    webPrice1pc: pick(row, "webPrice1pc", "web_price_1pc"),
    webPrice10pc: pick(row, "webPrice10pc", "web_price_10pc"),
    webPrice12pc: pick(row, "webPrice12pc", "web_price_12pc"),
    stockStatus: pick(row, "stockStatus", "stock_status"),
    itemName: pick(row, "itemName", "item_name", "title", "product_name"),
    itemDescription: pick(row, "itemDescription", "item_description", "description"),
    imageUrl: pick(row, "imageUrl", "image_url"),
    productUrl: pick(row, "productUrl", "product_url"),
    dataGrade: pick(row, "dataGrade", "data_grade", "canonical_readiness_status"),
    bottleCollection: pick(row, "bottleCollection", "bottle_collection", "collection"),
    fitmentStatus: pick(row, "fitmentStatus", "fitment_status"),
    graceDescription: pick(row, "graceDescription", "grace_description"),
    assemblyType: pick(row, "assemblyType", "assembly_type"),
    componentGroup: pick(row, "componentGroup", "component_group"),
    verified: pick(row, "verified", "prompt_ready"),
    importSource: pick(row, "importSource", "import_source", "source_presence"),
  };
}

const slugify = (s: string): string => s.toLowerCase().replace(/[\s/]+/g, "-").replace(/[^a-z0-9-]/g, "");

/**
 * Family slug for the synthetic group SKU. Uses the FULL family name slugified
 * to avoid collisions like "Gift Bag" vs "Gift Box" both collapsing to "GIF".
 * E.g. "Empire" -> "EMPIRE", "Gift Bag" -> "GIFT-BAG", "Cap/Closure" -> "CAP-CLOSURE".
 */
function familyCode(family: string): string {
  if (!family) return "UNK";
  return family.toUpperCase().replace(/[\s/]+/g, "-").replace(/[^A-Z0-9-]/g, "") || "UNK";
}

/** Color abbreviation (e.g. "Clear" -> "CLR", "Cobalt Blue" -> "CBL"). */
function colorCode(color: string | null): string {
  if (!color) return "XXX";
  const map: Record<string, string> = {
    "Clear": "CLR", "Frosted": "FRS", "Cobalt Blue": "CBL", "Amber": "AMB",
    "Swirl": "SWR", "Black": "BLK", "Green": "GRN", "Pink": "PNK",
  };
  if (map[color]) return map[color];
  return color.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
}

// ─── GROUPING ────────────────────────────────────────────────────────────────

interface GroupKey {
  family: string;
  capacityMl: string; // string for stable map key, numeric in metadata
  color: string;
}

function groupKey(r: CatalogRow): string {
  return `${r.family || "(no-family)"}|${r.capacityMl || ""}|${r.color || "(no-color)"}`;
}

function parseGroupKey(k: string): GroupKey {
  const [family, capacityMl, color] = k.split("|");
  return { family, capacityMl, color };
}

// ─── HUB MAPPING ─────────────────────────────────────────────────────────────

interface VariantEntry {
  id: string; // graceSku as stable id
  title: string;
  sku: string;
  website_sku: string | null;
  price: number | null;
  compare_at_price: number | null;
  inventory_quantity: number;
  option1: string | null; // Applicator
  option2: string | null; // Cap Color
  option3: string | null; // Cap Style
  barcode: string | null;
  weight: number | null;
  position: number;
  // Per-variant metadata kept verbose for downstream content gen
  cap_color: string | null;
  cap_style: string | null;
  cap_height: string | null;
  trim_color: string | null;
  ball_material: string | null;
  applicator: string | null;
  image_url: string | null;
  product_url: string | null;
  pricing_tiers: {
    qb_price: number | null;
    web_price_1pc: number | null;
    web_price_10pc: number | null;
    web_price_12pc: number | null;
  };
  data_grade: string | null;
  verified: boolean | null;
}

interface OptionDef {
  name: string;
  values: string[];
  position: number;
}

interface ProductHubRow {
  organization_id: string;
  name: string;
  slug: string;
  sku: string;
  short_description: string | null;
  long_description: string | null;
  category: string | null;
  product_type: string | null;
  status: "draft" | "active" | "archived" | "discontinued";
  visibility: "private" | "internal" | "public";
  price: number | null; // hub-level: lowest price across variants
  compare_at_price: number | null; // highest price (price range max)
  tags: string[];
  collections: string[];
  variants: VariantEntry[];
  options: OptionDef[];
  metadata: {
    bottle_specs: object;
    variant_count: number;
    price_range: { min: number | null; max: number | null };
    import_source: { csv: string; group_key: string; imported_at: string };
  };
}

function rowsToHub(
  groupRows: CatalogRow[],
  orgId: string,
  csvPath: string,
  defaultStatus: "draft" | "active",
): ProductHubRow {
  const rep = groupRows[0]; // representative row for vessel-level data
  const family = rep.family || "Unknown";
  const capacity = rep.capacity || (rep.capacityMl ? `${rep.capacityMl} ml` : "");
  const color = rep.color || "";
  const capacityMlNum = num(rep.capacityMl);

  // Hub display name: "Empire 50ml Clear"
  const name = [family, capacity, color].filter(Boolean).join(" ");

  // Synthetic group SKU: GROUP-EMP-50ML-CLR
  const sku = ["GROUP", familyCode(family), capacityMlNum != null ? `${capacityMlNum}ML` : "XML", colorCode(color || null)].join("-");
  const slug = slugify(name);

  // Build variants from each Grace SKU
  const variants: VariantEntry[] = groupRows.map((r, idx) => ({
    id: r.graceSku,
    title: [nonEmpty(r.applicator), nonEmpty(r.capColor), nonEmpty(r.capStyle)].filter(Boolean).join(" · ") || r.graceSku,
    sku: r.graceSku,
    website_sku: nonEmpty(r.websiteSku),
    price: num(r.webPrice1pc),
    compare_at_price: num(r.qbPrice),
    inventory_quantity: 0,
    option1: nonEmpty(r.applicator),
    option2: nonEmpty(r.capColor),
    option3: nonEmpty(r.capStyle),
    barcode: null,
    weight: num(r.bottleWeightG),
    position: idx + 1,
    cap_color: nonEmpty(r.capColor),
    cap_style: nonEmpty(r.capStyle),
    cap_height: nonEmpty(r.capHeight),
    trim_color: nonEmpty(r.trimColor),
    ball_material: nonEmpty(r.ballMaterial),
    applicator: nonEmpty(r.applicator),
    image_url: nonEmpty(r.imageUrl),
    product_url: nonEmpty(r.productUrl),
    pricing_tiers: {
      qb_price: num(r.qbPrice),
      web_price_1pc: num(r.webPrice1pc),
      web_price_10pc: num(r.webPrice10pc),
      web_price_12pc: num(r.webPrice12pc),
    },
    data_grade: nonEmpty(r.dataGrade),
    verified: r.verified === "true" ? true : r.verified === "false" ? false : null,
  }));

  // Derive options from actual variation axes used by this group
  const applicators = [...new Set(variants.map((v) => v.option1).filter((x): x is string => !!x))];
  const capColors = [...new Set(variants.map((v) => v.option2).filter((x): x is string => !!x))];
  const capStyles = [...new Set(variants.map((v) => v.option3).filter((x): x is string => !!x))];
  const options: OptionDef[] = [];
  if (applicators.length > 0) options.push({ name: "Applicator", values: applicators, position: 1 });
  if (capColors.length > 0) options.push({ name: "Cap Color", values: capColors, position: 2 });
  if (capStyles.length > 0) options.push({ name: "Cap Style", values: capStyles, position: 3 });

  // Hub price range
  const prices = variants.map((v) => v.price).filter((p): p is number => p != null);
  const minP = prices.length ? Math.min(...prices) : null;
  const maxP = prices.length ? Math.max(...prices) : null;

  // Description: prefer rep's graceDescription else itemDescription
  const longDesc = nonEmpty(rep.graceDescription) ?? nonEmpty(rep.itemDescription);
  const shortDesc = nonEmpty(rep.itemDescription)?.slice(0, 300) ?? null;

  // Tags from vessel attributes only (variants stay in variants)
  const tagSet = new Set<string>(["packaging", "bottle"]);
  if (rep.family) tagSet.add(slugify(rep.family));
  if (rep.shape) tagSet.add(slugify(rep.shape));
  if (color) tagSet.add(slugify(color));
  if (rep.capacity) tagSet.add(slugify(rep.capacity).replace(/-/g, ""));
  if (rep.bottleCollection) tagSet.add(slugify(rep.bottleCollection));
  // Add applicator family tags so filtering by "has spray" works
  for (const a of applicators) tagSet.add(slugify(a));

  const collections = nonEmpty(rep.bottleCollection) ? [rep.bottleCollection.trim()] : [];

  // Bottle vessel specs (NOT cap/applicator — those vary by variant)
  const bottle_specs = {
    family: nonEmpty(rep.family),
    shape: nonEmpty(rep.shape),
    glass_color: nonEmpty(rep.color),
    capacity: {
      ml: capacityMlNum,
      oz: num(rep.capacityOz),
      display: nonEmpty(rep.capacity),
    },
    neck_thread: nonEmpty(rep.neckThreadSize),
    physical: {
      // Bottle vessel dimensions (without cap, since cap height varies by variant)
      height_without_cap_mm: num(rep.heightWithoutCap),
      diameter_mm: num(rep.diameter),
      weight_g: num(rep.bottleWeightG),
    },
    packaging: {
      assembly_type: nonEmpty(rep.assemblyType),
      component_group: nonEmpty(rep.componentGroup),
      bottle_collection: nonEmpty(rep.bottleCollection),
    },
    available_applicators: applicators,
    variant_count: variants.length,
    primary_grace_sku: variants[0]?.sku ?? null,
    primary_website_sku: variants[0]?.website_sku ?? null,
  };

  return {
    organization_id: orgId,
    name,
    slug,
    sku,
    short_description: shortDesc,
    long_description: longDesc,
    category: nonEmpty(rep.category),
    product_type: nonEmpty(rep.family),
    status: defaultStatus,
    visibility: "internal",
    price: minP,
    compare_at_price: maxP,
    tags: [...tagSet].sort(),
    collections,
    variants,
    options,
    metadata: {
      bottle_specs,
      variant_count: variants.length,
      price_range: { min: minP, max: maxP },
      import_source: {
        csv: path.basename(csvPath),
        group_key: `${family}|${rep.capacityMl}|${color}`,
        imported_at: new Date().toISOString(),
      },
    },
  };
}

// ─── DRY-RUN PLAN ────────────────────────────────────────────────────────────

interface DryRunPlan {
  generated_at: string;
  source_csv: string;
  organization_id: string;
  grouping: string;
  total_csv_rows: number;
  total_groups: number;
  total_variants: number;
  by_category: Record<string, number>;
  by_family: Record<string, number>;
  variant_distribution: { singletons: number; "2-5": number; "6-10": number; "11+": number; max: number };
  field_coverage: Record<string, string>;
  sample_hubs: ProductHubRow[];
  warnings: string[];
}

function buildPlan(rows: CatalogRow[], hubs: ProductHubRow[], csvPath: string, orgId: string): DryRunPlan {
  const byCategory: Record<string, number> = {};
  const byFamily: Record<string, number> = {};
  for (const h of hubs) {
    byCategory[h.category ?? "(uncategorized)"] = (byCategory[h.category ?? "(uncategorized)"] ?? 0) + 1;
    byFamily[h.product_type ?? "(no family)"] = (byFamily[h.product_type ?? "(no family)"] ?? 0) + 1;
  }
  const counts = hubs.map((h) => h.variants.length);
  const dist = {
    singletons: counts.filter((c) => c === 1).length,
    "2-5": counts.filter((c) => c >= 2 && c <= 5).length,
    "6-10": counts.filter((c) => c >= 6 && c <= 10).length,
    "11+": counts.filter((c) => c > 10).length,
    max: Math.max(...counts),
  };
  const totalVariants = counts.reduce((a, b) => a + b, 0);

  const total = hubs.length;
  const pct = (n: number) => `${n}/${total} (${Math.round((100 * n) / total)}%)`;
  const coverage: Record<string, string> = {
    name: pct(hubs.filter((h) => h.name).length),
    long_description: pct(hubs.filter((h) => h.long_description).length),
    bottle_specs_neck_thread: pct(
      hubs.filter((h) => h.metadata.bottle_specs.neck_thread).length,
    ),
    options_with_applicator: pct(hubs.filter((h) => h.options.some((o) => o.name === "Applicator")).length),
    options_with_cap_color: pct(hubs.filter((h) => h.options.some((o) => o.name === "Cap Color")).length),
    price_range: pct(hubs.filter((h) => h.metadata.price_range.min != null).length),
  };

  const warnings: string[] = [];
  const skuCounts = new Map<string, number>();
  for (const h of hubs) skuCounts.set(h.sku, (skuCounts.get(h.sku) ?? 0) + 1);
  const dupeSkus = [...skuCounts.entries()].filter(([_, n]) => n > 1);
  if (dupeSkus.length > 0) {
    warnings.push(`${dupeSkus.length} duplicate hub SKUs (synthetic key collision — investigate familyCode/colorCode): ${dupeSkus.slice(0, 5).map((d) => d[0]).join(", ")}`);
  }
  const noVariants = hubs.filter((h) => h.variants.length === 0);
  if (noVariants.length > 0) {
    warnings.push(`${noVariants.length} hubs have 0 variants (this should be impossible — check grouping logic)`);
  }

  return {
    generated_at: new Date().toISOString(),
    source_csv: csvPath,
    organization_id: orgId,
    grouping: "C: family + capacityMl + color",
    total_csv_rows: rows.length,
    total_groups: hubs.length,
    total_variants: totalVariants,
    by_category: byCategory,
    by_family: byFamily,
    variant_distribution: dist,
    field_coverage: coverage,
    sample_hubs: hubs.slice(0, 3),
    warnings,
  };
}

// ─── LIVE WRITE ──────────────────────────────────────────────────────────────

interface ImportResult { upserted: number; errors: { sku: string; message: string }[] }

async function writeToSupabase(client: SupabaseClient, hubs: ProductHubRow[], batchSize: number): Promise<ImportResult> {
  const result: ImportResult = { upserted: 0, errors: [] };
  for (let i = 0; i < hubs.length; i += batchSize) {
    const batch = hubs.slice(i, i + batchSize);
    process.stdout.write(`\rUpserting batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(hubs.length / batchSize)} (${i + batch.length}/${hubs.length})...`);
    const { data, error } = await client
      .from("product_hubs")
      .upsert(batch, { onConflict: "organization_id,sku", ignoreDuplicates: false })
      .select("id, sku");
    if (error) {
      console.error(`\nBatch failed: ${error.message}`);
      for (const h of batch) result.errors.push({ sku: h.sku, message: error.message });
      continue;
    }
    if (data) result.upserted += data.length;
  }
  console.log("\n");
  return result;
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();

  console.log("\n=== Best Bottles → Madison Product Hub Importer (Grouped) ===");
  console.log(`  Org:      ${args.org}`);
  console.log(`  CSV:      ${args.csv}`);
  console.log(`  Mode:     ${args.live ? "🔴 LIVE (writes to Supabase)" : "🟢 DRY-RUN (no writes)"}`);
  console.log(`  Status:   ${args.defaultStatus}`);
  console.log(`  Grouping: family + capacityMl + color (Convex productGroups model)\n`);

  if (!fs.existsSync(args.csv)) throw new Error(`CSV not found: ${args.csv}`);
  const rows = parseCsv(fs.readFileSync(args.csv, "utf-8"));
  console.log(`  Parsed ${rows.length} CSV rows`);

  // Group rows
  const groups = new Map<string, CatalogRow[]>();
  let skipped = 0;
  for (const r of rows) {
    if (!r.graceSku) { skipped++; continue; }
    const k = groupKey(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  console.log(`  Grouped into ${groups.size} hubs (${skipped} rows skipped — no graceSku)`);

  const hubs = [...groups.values()].map((g) => rowsToHub(g, args.org, args.csv, args.defaultStatus));

  const plan = buildPlan(rows, hubs, args.csv, args.org);
  fs.writeFileSync(args.output, JSON.stringify(plan, null, 2));
  console.log(`\n  📄 Plan: ${args.output}`);
  console.log(`     ${plan.total_groups} hubs · ${plan.total_variants} variants`);
  console.log(`     Variant distribution: ${plan.variant_distribution.singletons} singletons · ${plan.variant_distribution["2-5"]} (2-5) · ${plan.variant_distribution["6-10"]} (6-10) · ${plan.variant_distribution["11+"]} (11+) · max ${plan.variant_distribution.max}`);
  if (plan.warnings.length) {
    console.log(`     ⚠ Warnings:`);
    for (const w of plan.warnings) console.log(`        ${w}`);
  }

  if (!args.live) {
    console.log("\n  ✓ DRY-RUN COMPLETE. Review the plan, then re-run with --live to write to Supabase.\n");
    return;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars required for --live mode");
  const client = createClient(url, key, { auth: { persistSession: false } });

  console.log(`\n  🔴 Writing ${hubs.length} hubs to Supabase...`);
  const result = await writeToSupabase(client, hubs, args.batchSize);

  console.log("\n=== IMPORT COMPLETE ===");
  console.log(`  Upserted: ${result.upserted}`);
  console.log(`  Errors:   ${result.errors.length}`);
  if (result.errors.length) {
    const errPath = path.resolve("./bestbottles-import-errors.json");
    fs.writeFileSync(errPath, JSON.stringify(result.errors, null, 2));
    console.log(`\n  📄 Error log: ${errPath}`);
  }
}

main().catch((err) => {
  console.error("\n❌ FATAL:", err.message);
  process.exit(1);
});
