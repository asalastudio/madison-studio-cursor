/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * BEST BOTTLES → MADISON PRODUCT HUB BULK IMPORTER
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Reads the Convex catalog export (Nemat_Product_Catalog.csv) and creates one
 * product_hubs row per Grace SKU under Best Bottles' organization. Packaging-
 * specific fields land in product_hubs.metadata.bottle_specs (no migration).
 * Pricing tiers land in product_commerce.
 *
 * USAGE:
 *   # Dry run — produces import-plan.json for review, no DB writes:
 *   npx tsx scripts/import-bestbottles-catalog.ts --org=<UUID> --csv=/path/to/catalog.csv
 *
 *   # Live run — actually writes to Supabase (idempotent on (organization_id, sku)):
 *   npx tsx scripts/import-bestbottles-catalog.ts --org=<UUID> --csv=/path/to/catalog.csv --live
 *
 * REQUIRED ENV:
 *   SUPABASE_URL                — e.g. https://xxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY   — service role key (NOT the anon key — needs write access)
 *
 * IDEMPOTENCY:
 *   Re-running is safe. Existing rows matched by (organization_id, sku) are
 *   updated in place; new rows are inserted. Drop-and-reimport is also safe:
 *   delete all product_hubs WHERE organization_id = <BB org> AND sku LIKE 'GB-%' OR sku LIKE 'LB-%'.
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
}

function parseArgs(): CliArgs {
  const args: Partial<CliArgs> = { live: false, batchSize: 100 };
  for (const arg of process.argv.slice(2)) {
    if (arg === "--live") args.live = true;
    else if (arg.startsWith("--org=")) args.org = arg.slice(6);
    else if (arg.startsWith("--csv=")) args.csv = arg.slice(6);
    else if (arg.startsWith("--batch=")) args.batchSize = parseInt(arg.slice(8), 10);
    else if (arg.startsWith("--output=")) args.output = arg.slice(9);
  }
  if (!args.org) throw new Error("Missing --org=<UUID>");
  if (!args.csv) throw new Error("Missing --csv=<path>");
  args.output ??= path.resolve("./bestbottles-import-plan.json");
  return args as CliArgs;
}

// ─── CSV PARSING ─────────────────────────────────────────────────────────────

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

/**
 * Minimal RFC-4180-ish CSV parser. Handles quoted fields with embedded commas
 * and escaped quotes ("") within quoted fields. Newline inside quoted fields
 * is also handled. Avoids pulling in a dep for one file.
 */
function parseCsv(text: string): CatalogRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(field);
        field = "";
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && next === "\n") i++; // CRLF
        row.push(field);
        field = "";
        if (row.length > 1 || row[0] !== "") rows.push(row);
        row = [];
      } else {
        field += ch;
      }
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length < 2) return [];
  const header = rows[0];
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    header.forEach((col, idx) => {
      obj[col.trim()] = (r[idx] ?? "").trim();
    });
    return obj as unknown as CatalogRow;
  });
}

// ─── MAPPING: Convex catalog row → Madison product_hubs row ─────────────────

interface ProductHubRow {
  organization_id: string;
  name: string;
  slug: string;
  sku: string;
  short_description: string | null;
  long_description: string | null;
  category: string | null;
  product_type: string | null; // bottle family
  status: "draft" | "active" | "archived" | "discontinued";
  visibility: "private" | "internal" | "public";
  tags: string[];
  collections: string[];
  metadata: {
    bottle_specs: BottleSpecs;
    pricing_tiers?: PricingTiers;
    import_source: { csv: string; row_id: string; imported_at: string };
  };
}

interface BottleSpecs {
  family: string | null;
  shape: string | null;
  glass_color: string | null;
  capacity: { ml: number | null; oz: number | null; display: string | null };
  neck_thread: string | null;
  applicator: string | null;
  cap: {
    color: string | null;
    trim_color: string | null;
    style: string | null;
    height: string | null;
  };
  ball_material: string | null;
  physical: {
    height_with_cap_mm: number | null;
    height_without_cap_mm: number | null;
    diameter_mm: number | null;
    weight_g: number | null;
  };
  packaging: {
    case_quantity: number | null;
    assembly_type: string | null;
    component_group: string | null;
    bottle_collection: string | null;
    fitment_status: string | null;
  };
  external_refs: {
    grace_sku: string | null;
    website_sku: string | null;
    product_id: string | null;
    image_url: string | null;
    product_url: string | null;
    data_grade: string | null;
    verified: boolean | null;
  };
}

interface PricingTiers {
  qb_price: number | null;
  web_price_1pc: number | null;
  web_price_10pc: number | null;
  web_price_12pc: number | null;
}

interface ProductCommerceRow {
  product_id: string; // filled in after product_hubs insert
  retail_price: number | null;
  wholesale_price: number | null;
  msrp: number | null;
  currency: "USD";
  cost_of_goods: number | null;
  track_inventory: boolean;
  stock_quantity: number;
}

function num(s: string | undefined | null): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[^0-9.\-]/g, "");
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function nonEmpty(s: string | undefined | null): string | null {
  if (!s) return null;
  const t = s.trim();
  return t.length > 0 ? t : null;
}

/** Build searchable tags from a catalog row */
function deriveTags(row: CatalogRow): string[] {
  const t = new Set<string>();
  if (row.family) t.add(row.family.toLowerCase());
  if (row.shape) t.add(row.shape.toLowerCase());
  if (row.color) t.add(row.color.toLowerCase().replace(/\s+/g, "-"));
  if (row.capacity) t.add(row.capacity.toLowerCase().replace(/\s+/g, ""));
  if (row.applicator) t.add(row.applicator.toLowerCase().replace(/[\s/]+/g, "-"));
  if (row.capColor) t.add(`cap-${row.capColor.toLowerCase().replace(/\s+/g, "-")}`);
  if (row.bottleCollection) t.add(row.bottleCollection.toLowerCase().replace(/\s+/g, "-"));
  // Always include "bottle" or "packaging" anchor
  t.add("packaging");
  if (row.category?.toLowerCase().includes("bottle")) t.add("bottle");
  if (row.category?.toLowerCase().includes("atomizer")) t.add("atomizer");
  if (row.category?.toLowerCase().includes("jar")) t.add("jar");
  if (row.category?.toLowerCase().includes("component")) t.add("component");
  return Array.from(t).filter(Boolean);
}

function rowToProductHub(row: CatalogRow, orgId: string, csvPath: string): ProductHubRow | null {
  if (!row.graceSku) return null; // skip rows without canonical SKU

  const name = nonEmpty(row.itemName) ?? row.graceSku;
  const collections = row.bottleCollection ? [row.bottleCollection] : [];

  return {
    organization_id: orgId,
    name,
    slug: row.graceSku.toLowerCase(),
    sku: row.graceSku,
    short_description: nonEmpty(row.itemDescription)?.slice(0, 300) ?? null,
    long_description: nonEmpty(row.graceDescription) ?? nonEmpty(row.itemDescription) ?? null,
    category: nonEmpty(row.category),
    product_type: nonEmpty(row.family),
    status: row.stockStatus?.toLowerCase().includes("stock") ? "active" : "draft",
    visibility: "internal",
    tags: deriveTags(row),
    collections,
    metadata: {
      bottle_specs: {
        family: nonEmpty(row.family),
        shape: nonEmpty(row.shape),
        glass_color: nonEmpty(row.color),
        capacity: {
          ml: num(row.capacityMl),
          oz: num(row.capacityOz),
          display: nonEmpty(row.capacity),
        },
        neck_thread: nonEmpty(row.neckThreadSize),
        applicator: nonEmpty(row.applicator),
        cap: {
          color: nonEmpty(row.capColor),
          trim_color: nonEmpty(row.trimColor),
          style: nonEmpty(row.capStyle),
          height: nonEmpty(row.capHeight),
        },
        ball_material: nonEmpty(row.ballMaterial),
        physical: {
          height_with_cap_mm: num(row.heightWithCap),
          height_without_cap_mm: num(row.heightWithoutCap),
          diameter_mm: num(row.diameter),
          weight_g: num(row.bottleWeightG),
        },
        packaging: {
          case_quantity: num(row.caseQuantity) !== null ? Math.round(num(row.caseQuantity)!) : null,
          assembly_type: nonEmpty(row.assemblyType),
          component_group: nonEmpty(row.componentGroup),
          bottle_collection: nonEmpty(row.bottleCollection),
          fitment_status: nonEmpty(row.fitmentStatus),
        },
        external_refs: {
          grace_sku: nonEmpty(row.graceSku),
          website_sku: nonEmpty(row.websiteSku),
          product_id: nonEmpty(row.productId),
          image_url: nonEmpty(row.imageUrl),
          product_url: nonEmpty(row.productUrl),
          data_grade: nonEmpty(row.dataGrade),
          verified: row.verified === "true" ? true : row.verified === "false" ? false : null,
        },
      },
      pricing_tiers: {
        qb_price: num(row.qbPrice),
        web_price_1pc: num(row.webPrice1pc),
        web_price_10pc: num(row.webPrice10pc),
        web_price_12pc: num(row.webPrice12pc),
      },
      import_source: {
        csv: path.basename(csvPath),
        row_id: row.productId || row.graceSku,
        imported_at: new Date().toISOString(),
      },
    },
  };
}

function rowToCommerce(row: CatalogRow, productHubId: string): ProductCommerceRow {
  return {
    product_id: productHubId,
    retail_price: num(row.webPrice1pc),
    wholesale_price: num(row.qbPrice),
    msrp: num(row.webPrice1pc),
    currency: "USD",
    cost_of_goods: null,
    track_inventory: false, // Best Bottles isn't using Madison for inventory yet
    stock_quantity: 0,
  };
}

// ─── DRY-RUN OUTPUT ──────────────────────────────────────────────────────────

interface DryRunPlan {
  generated_at: string;
  source_csv: string;
  organization_id: string;
  total_csv_rows: number;
  mappable_rows: number;
  skipped_rows: number;
  by_category: Record<string, number>;
  by_family: Record<string, number>;
  by_status: Record<string, number>;
  sample_rows: ProductHubRow[];
  warnings: string[];
}

function buildDryRunPlan(
  rows: CatalogRow[],
  hubs: ProductHubRow[],
  csvPath: string,
  orgId: string,
): DryRunPlan {
  const byCategory: Record<string, number> = {};
  const byFamily: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const warnings: string[] = [];

  for (const h of hubs) {
    const cat = h.category || "(uncategorized)";
    const fam = h.product_type || "(no family)";
    byCategory[cat] = (byCategory[cat] ?? 0) + 1;
    byFamily[fam] = (byFamily[fam] ?? 0) + 1;
    byStatus[h.status] = (byStatus[h.status] ?? 0) + 1;
  }

  // Surface rows with no Grace SKU (skipped)
  const skippedNoSku = rows.filter((r) => !r.graceSku).length;
  if (skippedNoSku > 0) {
    warnings.push(`${skippedNoSku} CSV rows skipped: no graceSku`);
  }

  // Surface duplicate Grace SKUs (would cause upsert collisions)
  const skuCounts = new Map<string, number>();
  for (const h of hubs) skuCounts.set(h.sku, (skuCounts.get(h.sku) ?? 0) + 1);
  const dupes = [...skuCounts.entries()].filter(([_, n]) => n > 1);
  if (dupes.length > 0) {
    warnings.push(`${dupes.length} duplicate Grace SKUs found in CSV: ${dupes.slice(0, 5).map((d) => d[0]).join(", ")}${dupes.length > 5 ? "..." : ""}`);
  }

  return {
    generated_at: new Date().toISOString(),
    source_csv: csvPath,
    organization_id: orgId,
    total_csv_rows: rows.length,
    mappable_rows: hubs.length,
    skipped_rows: rows.length - hubs.length,
    by_category: byCategory,
    by_family: byFamily,
    by_status: byStatus,
    sample_rows: hubs.slice(0, 5), // first 5 for visual inspection
    warnings,
  };
}

// ─── LIVE WRITE ──────────────────────────────────────────────────────────────

interface ImportResult {
  inserted: number;
  updated: number;
  errors: { sku: string; message: string }[];
}

async function writeToSupabase(
  client: SupabaseClient,
  hubs: ProductHubRow[],
  rowsBySku: Map<string, CatalogRow>,
  batchSize: number,
): Promise<ImportResult> {
  const result: ImportResult = { inserted: 0, updated: 0, errors: [] };

  for (let i = 0; i < hubs.length; i += batchSize) {
    const batch = hubs.slice(i, i + batchSize);
    process.stdout.write(`\rUpserting batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(hubs.length / batchSize)} (${i + batch.length}/${hubs.length})...`);

    // Upsert product_hubs on (organization_id, sku) — requires unique constraint on those cols
    const { data, error } = await client
      .from("product_hubs")
      .upsert(batch, { onConflict: "organization_id,sku", ignoreDuplicates: false })
      .select("id, sku");

    if (error) {
      console.error(`\nBatch failed: ${error.message}`);
      for (const h of batch) result.errors.push({ sku: h.sku, message: error.message });
      continue;
    }
    if (!data) continue;

    result.inserted += data.length;

    // Now upsert product_commerce for each
    const commerceRows: ProductCommerceRow[] = data
      .map((d) => {
        const csvRow = rowsBySku.get(d.sku);
        if (!csvRow) return null;
        return rowToCommerce(csvRow, d.id);
      })
      .filter((c): c is ProductCommerceRow => c !== null);

    if (commerceRows.length > 0) {
      const { error: cErr } = await client
        .from("product_commerce")
        .upsert(commerceRows, { onConflict: "product_id", ignoreDuplicates: false });
      if (cErr) {
        console.error(`\nCommerce batch failed: ${cErr.message}`);
        for (const c of commerceRows) result.errors.push({ sku: data.find((d) => d.id === c.product_id)?.sku ?? "?", message: `commerce: ${cErr.message}` });
      }
    }
  }

  console.log("\n");
  return result;
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();

  console.log("\n=== Best Bottles → Madison Product Hub Importer ===");
  console.log(`  Org:    ${args.org}`);
  console.log(`  CSV:    ${args.csv}`);
  console.log(`  Mode:   ${args.live ? "🔴 LIVE (will write to Supabase)" : "🟢 DRY-RUN (no writes)"}`);
  console.log(`  Batch:  ${args.batchSize}`);
  console.log("");

  if (!fs.existsSync(args.csv)) throw new Error(`CSV not found: ${args.csv}`);
  const csvText = fs.readFileSync(args.csv, "utf-8");
  const rows = parseCsv(csvText);
  console.log(`  Parsed ${rows.length} CSV rows`);

  const hubs: ProductHubRow[] = [];
  const rowsBySku = new Map<string, CatalogRow>();
  for (const r of rows) {
    const hub = rowToProductHub(r, args.org, args.csv);
    if (hub) {
      hubs.push(hub);
      rowsBySku.set(hub.sku, r);
    }
  }
  console.log(`  Mapped to ${hubs.length} product_hubs (${rows.length - hubs.length} skipped)`);

  const plan = buildDryRunPlan(rows, hubs, args.csv, args.org);
  fs.writeFileSync(args.output, JSON.stringify(plan, null, 2));
  console.log(`\n  📄 Plan written to ${args.output}`);
  console.log(`     Categories: ${Object.entries(plan.by_category).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  console.log(`     Families:   ${Object.keys(plan.by_family).slice(0, 8).join(", ")}${Object.keys(plan.by_family).length > 8 ? "..." : ""}`);
  if (plan.warnings.length > 0) {
    console.log(`     ⚠ Warnings:`);
    for (const w of plan.warnings) console.log(`        ${w}`);
  }

  if (!args.live) {
    console.log("\n  ✓ DRY-RUN COMPLETE. Review the plan, then re-run with --live to write to Supabase.\n");
    return;
  }

  // Live mode
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars required for --live mode");
  }
  const client = createClient(url, key, { auth: { persistSession: false } });

  console.log(`\n  🔴 Writing ${hubs.length} products to Supabase...`);
  const result = await writeToSupabase(client, hubs, rowsBySku, args.batchSize);

  console.log("\n=== IMPORT COMPLETE ===");
  console.log(`  Upserted: ${result.inserted}`);
  console.log(`  Errors:   ${result.errors.length}`);
  if (result.errors.length > 0) {
    console.log("\n  First 10 errors:");
    for (const e of result.errors.slice(0, 10)) console.log(`    ${e.sku}: ${e.message}`);
    const errorReport = path.resolve("./bestbottles-import-errors.json");
    fs.writeFileSync(errorReport, JSON.stringify(result.errors, null, 2));
    console.log(`\n  📄 Full error log: ${errorReport}`);
  }
}

main().catch((err) => {
  console.error("\n❌ FATAL:", err.message);
  process.exit(1);
});
