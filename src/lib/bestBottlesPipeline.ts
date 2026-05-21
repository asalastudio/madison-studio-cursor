/**
 * Best Bottles Grid Pipeline — data access + CSV import.
 *
 * Row source of truth: the `Grid-Image-Tracker.xlsx` in the
 * `asalastudio/best-bottles-website` GitHub repo. Operator exports the
 * xlsx to CSV, uploads via the Pipeline page, and Madison upserts rows
 * into `best_bottles_pipeline_groups`. From there Madison is the live
 * tracker — status columns update as generations run and images get
 * approved.
 *
 * Intentionally minimal for P0a (no Sanity/Convex/Shopify sync yet).
 * P0b layers the destination syncs on top of the `madison_status`
 * transitions defined here.
 */

import { supabase } from "@/integrations/supabase/client";

export type PipelineStatus =
  | "not-started"
  | "queued"
  | "generating"
  | "generated"
  | "qa-pending"
  | "approved"
  | "rejected"
  | "synced";

export type PipelineSkuJobStatus =
  | "needs-reference"
  | "ready-to-generate"
  | "queued"
  | "generating"
  | "generated"
  | "qa-pending"
  | "approved"
  | "rejected"
  | "shopify-pushed"
  | "synced";

export interface PipelineGroup {
  id: string;
  organization_id: string;

  tracker_row_number: number | null;
  family: string;
  capacity_ml: number | null;
  capacity_label: string | null;
  glass_color: string | null;
  applicator_types: string | null;
  thread_size: string | null;
  display_name: string;
  category: string | null;
  collection: string | null;
  convex_slug: string | null;
  convex_id: string | null;
  primary_grace_sku: string | null;
  primary_website_sku: string | null;
  all_legacy_skus: string | null;
  product_url: string | null;
  variant_count: number | null;
  price_min_cents: number | null;
  price_max_cents: number | null;

  legacy_has_hero_image: boolean;
  legacy_hero_image_url: string | null;
  /**
   * Operator-pinned hero master-reference flag for Lane B (Consistency
   * Mode). At most one row per shape group (family + capacity + thread)
   * may have this set — enforced by a partial unique index at the DB layer.
   * When set, Pipeline Launch uses this row's legacy_hero_image_url as the
   * Consistency Mode master. Independent of is_clear_master_reference,
   * which governs Lane A (paper-doll).
   *
   * Renamed from `is_master_reference` in migration 20260423140000 when
   * Lane A introduced its own clear-master pin.
   */
  is_hero_reference: boolean;
  /**
   * Operator-pinned clear-glass body master for Lane A (paper-doll). At
   * most one row per shape group may have this set — enforced by a
   * separate partial unique index. When set, this row's ingested clear-
   * body PNG is the reference image passed to gpt-image-2 when deriving
   * cobalt / amber / frosted / swirl variants.
   */
  is_clear_master_reference: boolean;
  /**
   * Paper-doll canvas + physical-mm contract for the shape group. JSONB
   * column; populated by the Paper-Doll Drawer at ingest time. NULL means
   * this shape group has not been ingested for paper-doll yet. Shape
   * documented in docs/product-image-system/schema.md and types in
   * `src/lib/product-image/types.ts#GeometrySpec`.
   */
  geometry_spec: unknown | null;

  madison_status: PipelineStatus;
  madison_consistency_set_id: string | null;
  madison_approved_image_id: string | null;
  madison_approved_at: string | null;
  madison_approved_by: string | null;
  madison_notes: string | null;

  madison_sanity_asset_id: string | null;
  madison_sanity_synced_at: string | null;
  madison_convex_synced_at: string | null;
  madison_shopify_synced_at: string | null;
  madison_last_error: string | null;

  created_at: string;
  updated_at: string;
}

export interface PipelineSkuJob {
  id: string;
  organization_id: string;
  pipeline_group_id: string | null;
  product_group_slug: string;
  product_group_display_name: string | null;
  family: string;
  catalog_reference_pages: string | null;
  category: string | null;
  capacity_ml: number | null;
  applicator: string | null;
  canonical_color: string | null;
  product_id: string | null;
  source_id: string | null;
  grace_sku: string;
  website_sku: string;
  shopify_sku: string | null;
  expected_canonical_filename: string | null;
  best_reference_candidate_path: string | null;
  coverage_status: string | null;
  status: PipelineSkuJobStatus;
  generated_image_id: string | null;
  generated_image_url: string | null;
  approved_image_id: string | null;
  approved_image_url: string | null;
  approved_at: string | null;
  approved_by: string | null;
  shopify_product_id: string | null;
  shopify_variant_id: string | null;
  shopify_media_id: string | null;
  shopify_image_url: string | null;
  shopify_pushed_at: string | null;
  convex_synced_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface PipelineSkuCoverageInput {
  action?: string;
  coverageStatus: string;
  productId?: string;
  sourceId?: string;
  productGroupSlug: string;
  productGroupDisplayName: string;
  family: string;
  catalogReferencePages?: string;
  category?: string;
  capacityMl?: string | number | null;
  applicator?: string;
  canonicalColor?: string;
  graceSku: string;
  websiteSku: string;
  shopifySku?: string | null;
  expectedCanonicalFilename?: string;
  bestReferenceCandidatePath?: string;
  generatedCandidateCount?: number;
  reviewCandidateCount?: number;
  shopifyReadyCount?: number;
}

// ─── CSV parsing ─────────────────────────────────────────────────────────────
//
// The Grid-Image-Tracker.xlsx → exported-CSV column order is stable, but we
// key off the header row rather than position so a column reordering doesn't
// silently corrupt the import. See xlsx header listed in the tracker repo.

type CsvRow = Record<string, string>;

/**
 * Simple CSV parser that handles quoted fields with embedded commas and
 * doubled-quote escaping. Not a general-purpose CSV lib — sufficient for
 * Excel-exported xlsx-to-CSV output which never contains multi-line fields
 * in this dataset.
 */
export function parseCsv(csvText: string): CsvRow[] {
  const lines = splitCsvLines(csvText);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const values = parseCsvLine(line);
    const row: CsvRow = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (values[j] ?? "").trim();
    }
    rows.push(row);
  }
  return rows;
}

function splitCsvLines(csv: string): string[] {
  // Excel exports often end with CRLF; normalise. No multi-line quoted fields
  // in the tracker so a plain newline split is safe.
  return csv.replace(/\r\n/g, "\n").split("\n");
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out;
}

// ─── Import pipeline ─────────────────────────────────────────────────────────

interface ImportRow {
  organization_id: string;
  tracker_row_number: number | null;
  family: string;
  capacity_ml: number | null;
  capacity_label: string | null;
  glass_color: string | null;
  applicator_types: string | null;
  thread_size: string | null;
  display_name: string;
  category: string | null;
  collection: string | null;
  convex_slug: string | null;
  convex_id: string | null;
  primary_grace_sku: string | null;
  primary_website_sku: string | null;
  all_legacy_skus: string | null;
  product_url: string | null;
  variant_count: number | null;
  price_min_cents: number | null;
  price_max_cents: number | null;
  legacy_has_hero_image: boolean;
  legacy_hero_image_url: string | null;
}

function toIntOrNull(v: string | undefined): number | null {
  if (!v || v.trim() === "") return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function toCentsOrNull(v: string | undefined): number | null {
  if (!v || v.trim() === "") return null;
  const cleaned = v.replace(/[$,]/g, "");
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function toBoolFlag(v: string | undefined): boolean {
  if (!v) return false;
  const t = v.trim().toLowerCase();
  return t === "yes" || t === "true" || t === "y" || t === "1";
}

function emptyToNull(v: string | undefined): string | null {
  if (!v) return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

function normalizeThreadSize(v: string | undefined): string | null {
  const t = emptyToNull(v);
  if (!t) return null;
  const numericThread = t.match(/^(\d{1,2})[\s._/-]+(\d{3})$/);
  if (numericThread) return `${numericThread[1]}-${numericThread[2]}`;
  if (/^press[-_\s]?fit$/i.test(t)) return "Press-Fit";
  if (/^snap[-_\s]?on$/i.test(t)) return "Snap-On";
  return t;
}

/**
 * Map a raw CSV row (keyed by the xlsx header names) to an upsert payload.
 * Returns null if the row is missing required fields and should be skipped.
 */
function csvRowToImport(
  row: CsvRow,
  organizationId: string,
): ImportRow | null {
  const displayName = row["Display Name"] || row["display_name"] || "";
  const family = row["Family"] || row["family"] || "";
  if (!displayName || !family) return null;

  return {
    organization_id: organizationId,
    tracker_row_number: toIntOrNull(row["Row #"] ?? row["row_number"]),
    family,
    capacity_ml: toIntOrNull(row["Capacity (ml)"] ?? row["capacity_ml"]),
    capacity_label: emptyToNull(row["Capacity"] ?? row["capacity_label"]),
    glass_color: emptyToNull(row["Glass Color"] ?? row["glass_color"]),
    applicator_types: emptyToNull(
      row["Applicator Types"] ??
        row["Applicator Type"] ??
        row["applicator_types"] ??
        row["applicator"],
    ),
    thread_size: normalizeThreadSize(
      row["Thread Size"] ?? row["thread_size"] ?? row["neck_thread_size"],
    ),
    display_name: displayName,
    category: emptyToNull(row["Category"] ?? row["category"]),
    collection: emptyToNull(row["Collection"] ?? row["collection"]),
    convex_slug: emptyToNull(row["Convex Slug"] ?? row["convex_slug"]),
    convex_id: emptyToNull(row["Convex ID"] ?? row["convex_id"]),
    primary_grace_sku: emptyToNull(
      row["Primary Grace SKU"] ?? row["primary_grace_sku"] ?? row["grace_sku"],
    ),
    primary_website_sku: emptyToNull(
      row["Primary Website SKU"] ?? row["primary_website_sku"] ?? row["website_sku"],
    ),
    all_legacy_skus: emptyToNull(
      row["All Legacy SKUs"] ?? row["all_legacy_skus"],
    ),
    product_url: emptyToNull(row["Product URL"] ?? row["product_url"]),
    variant_count: toIntOrNull(row["Variant Count"] ?? row["variant_count"]),
    price_min_cents: toCentsOrNull(row["Price Min ($)"] ?? row["price_min"]),
    price_max_cents: toCentsOrNull(row["Price Max ($)"] ?? row["price_max"]),
    legacy_has_hero_image: toBoolFlag(
      row["Has Hero Image?"] ?? row["has_hero_image"],
    ),
    legacy_hero_image_url: emptyToNull(
      row["Hero Image URL"] ?? row["hero_image_url"],
    ),
  };
}

export interface ImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
}

/**
 * Upsert CSV rows into `best_bottles_pipeline_groups` scoped to an org.
 * Uses `(organization_id, convex_slug)` as the conflict target so re-imports
 * update existing rows in place (preserving Madison-managed status fields).
 *
 * Rows without a convex_slug are inserted fresh each time — if the operator
 * uploads a CSV that lacks slugs, they'll see duplicates; that's intentional
 * since we can't dedupe without a stable key.
 */
export async function importPipelineCsv(
  csvText: string,
  organizationId: string,
): Promise<ImportResult> {
  const rawRows = parseCsv(csvText);
  const result: ImportResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };

  // Diagnostic: surface how many raw rows we parsed + the first mapped row so
  // a silent failure is visible in the browser console immediately.
  console.log("[pipeline-import] raw CSV rows parsed:", rawRows.length);
  if (rawRows.length > 0) {
    console.log("[pipeline-import] first raw row keys:", Object.keys(rawRows[0]));
  }

  const payload: ImportRow[] = [];
  for (const row of rawRows) {
    const mapped = csvRowToImport(row, organizationId);
    if (!mapped) {
      result.skipped += 1;
      continue;
    }
    payload.push(mapped);
  }

  console.log("[pipeline-import] mapped rows:", payload.length, "skipped:", result.skipped);
  if (payload.length > 0) {
    console.log("[pipeline-import] first mapped row:", payload[0]);
  }

  if (payload.length === 0) {
    result.errors.push(
      `CSV parsed ${rawRows.length} rows but 0 mapped to importable records — header mismatch? ` +
        `First row keys: ${rawRows[0] ? Object.keys(rawRows[0]).join(" | ") : "none"}`,
    );
    return result;
  }

  // Split into withSlug (upsert by org+slug) and withoutSlug (plain insert).
  const withSlug = payload.filter((p) => p.convex_slug);
  const withoutSlug = payload.filter((p) => !p.convex_slug);

  console.log("[pipeline-import] with slug:", withSlug.length, "without slug:", withoutSlug.length);

  if (withSlug.length > 0) {
    const response = await supabase
      .from("best_bottles_pipeline_groups")
      .upsert(withSlug, {
        onConflict: "organization_id,convex_slug",
        ignoreDuplicates: false,
      })
      .select("id", { count: "exact" });

    console.log("[pipeline-import] upsert response:", {
      error: response.error,
      status: response.status,
      statusText: response.statusText,
      count: response.count,
      dataLength: response.data?.length,
    });

    if (response.error) {
      result.errors.push(
        `Upsert failed (${response.status}): ${response.error.message}` +
          (response.error.details ? ` · details: ${response.error.details}` : "") +
          (response.error.hint ? ` · hint: ${response.error.hint}` : ""),
      );
    } else {
      // Prefer data.length over count — count can be null even on success
      // depending on Supabase client version and Prefer header.
      result.inserted += response.data?.length ?? response.count ?? 0;
    }
  }

  if (withoutSlug.length > 0) {
    const response = await supabase
      .from("best_bottles_pipeline_groups")
      .insert(withoutSlug)
      .select("id", { count: "exact" });

    console.log("[pipeline-import] insert (no slug) response:", {
      error: response.error,
      status: response.status,
      dataLength: response.data?.length,
    });

    if (response.error) {
      result.errors.push(
        `Insert (no slug) failed (${response.status}): ${response.error.message}` +
          (response.error.details ? ` · details: ${response.error.details}` : ""),
      );
    } else {
      result.inserted += response.data?.length ?? response.count ?? 0;
    }
  }

  console.log("[pipeline-import] final result:", result);
  return result;
}

// ─── Data access ─────────────────────────────────────────────────────────────

export interface PipelineFilters {
  family?: string;
  glassColor?: string;
  capacityMl?: number;
  threadSize?: string;
  status?: PipelineStatus;
  hasHero?: boolean;
}

export async function listPipelineGroups(
  organizationId: string,
  filters: PipelineFilters = {},
): Promise<PipelineGroup[]> {
  let q = supabase
    .from("best_bottles_pipeline_groups")
    .select("*")
    .eq("organization_id", organizationId);

  if (filters.family) q = q.eq("family", filters.family);
  if (filters.glassColor) q = q.eq("glass_color", filters.glassColor);
  if (filters.capacityMl != null) q = q.eq("capacity_ml", filters.capacityMl);
  if (filters.threadSize) q = q.eq("thread_size", filters.threadSize);
  if (filters.status) q = q.eq("madison_status", filters.status);
  if (filters.hasHero != null) q = q.eq("legacy_has_hero_image", filters.hasHero);

  const { data, error } = await q
    .order("family", { ascending: true })
    .order("capacity_ml", { ascending: true, nullsFirst: false })
    .order("glass_color", { ascending: true, nullsFirst: false });

  if (error) throw error;
  return (data ?? []) as PipelineGroup[];
}

export interface PipelineSkuJobFilters {
  family?: string;
  productGroupSlug?: string;
  status?: PipelineSkuJobStatus;
}

export async function listPipelineSkuJobs(
  organizationId: string,
  filters: PipelineSkuJobFilters = {},
): Promise<PipelineSkuJob[]> {
  const pageSize = 1000;
  const out: PipelineSkuJob[] = [];

  for (let from = 0; ; from += pageSize) {
    let q = supabase
      .from("best_bottles_pipeline_sku_jobs")
      .select("*")
      .eq("organization_id", organizationId);

    if (filters.family) q = q.eq("family", filters.family);
    if (filters.productGroupSlug) q = q.eq("product_group_slug", filters.productGroupSlug);
    if (filters.status) q = q.eq("status", filters.status);

    const { data, error } = await q
      .order("family", { ascending: true })
      .order("product_group_display_name", { ascending: true, nullsFirst: false })
      .order("grace_sku", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    const page = (data ?? []) as PipelineSkuJob[];
    out.push(...page);
    if (page.length < pageSize) break;
  }

  return out;
}

export interface SeedPipelineSkuJobsResult {
  total: number;
  upserted: number;
  skipped: number;
}

interface PipelineSkuJobSeedRow {
  organization_id: string;
  pipeline_group_id: string | null;
  product_group_slug: string;
  product_group_display_name: string | null;
  family: string;
  catalog_reference_pages: string | null;
  category: string | null;
  capacity_ml: number | null;
  applicator: string | null;
  canonical_color: string | null;
  product_id: string | null;
  source_id: string | null;
  grace_sku: string;
  website_sku: string;
  shopify_sku: string | null;
  expected_canonical_filename: string | null;
  best_reference_candidate_path: string | null;
  coverage_status: string | null;
  status: PipelineSkuJobStatus;
}

const TERMINAL_SKU_JOB_STATUSES = new Set<PipelineSkuJobStatus>([
  "approved",
  "shopify-pushed",
  "synced",
]);

function toNullableText(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function toNullableInt(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function initialSkuJobStatus(job: PipelineSkuCoverageInput): PipelineSkuJobStatus {
  if ((job.shopifyReadyCount ?? 0) > 0) return "approved";
  if ((job.generatedCandidateCount ?? 0) > 0 || (job.reviewCandidateCount ?? 0) > 0) {
    return "generated";
  }
  if (job.coverageStatus === "missing_local_reference_image") return "needs-reference";
  if (
    job.coverageStatus === "covered_canonical" ||
    job.coverageStatus === "covered_needs_canonical_copy"
  ) {
    return "ready-to-generate";
  }
  return "needs-reference";
}

export async function seedPipelineSkuJobsFromCoverage(params: {
  organizationId: string;
  products: PipelineSkuCoverageInput[];
  groups: PipelineGroup[];
  existingJobs?: PipelineSkuJob[];
}): Promise<SeedPipelineSkuJobsResult> {
  const { organizationId, products, groups, existingJobs = [] } = params;
  const groupsBySlug = new Map(
    groups
      .filter((group) => group.convex_slug)
      .map((group) => [group.convex_slug as string, group]),
  );
  const existingByGraceSku = new Map(
    existingJobs.map((job) => [job.grace_sku, job]),
  );

  const payload: PipelineSkuJobSeedRow[] = [];
  let skipped = 0;
  for (const product of products) {
    const graceSku = toNullableText(product.graceSku);
    const websiteSku = toNullableText(product.websiteSku);
    const productGroupSlug = toNullableText(product.productGroupSlug);
    const family = toNullableText(product.family);
    if (!graceSku || !websiteSku || !productGroupSlug || !family) {
      skipped += 1;
      continue;
    }

    const existing = existingByGraceSku.get(graceSku);
    const seededStatus = initialSkuJobStatus(product);
    const status =
      existing && TERMINAL_SKU_JOB_STATUSES.has(existing.status)
        ? existing.status
        : seededStatus;
    const group = groupsBySlug.get(productGroupSlug);

    payload.push({
      organization_id: organizationId,
      pipeline_group_id: group?.id ?? null,
      product_group_slug: productGroupSlug,
      product_group_display_name: toNullableText(product.productGroupDisplayName),
      family,
      catalog_reference_pages: toNullableText(product.catalogReferencePages),
      category: toNullableText(product.category),
      capacity_ml: toNullableInt(product.capacityMl),
      applicator: toNullableText(product.applicator),
      canonical_color: toNullableText(product.canonicalColor),
      product_id: toNullableText(product.productId),
      source_id: toNullableText(product.sourceId),
      grace_sku: graceSku,
      website_sku: websiteSku,
      shopify_sku: toNullableText(product.shopifySku),
      expected_canonical_filename: toNullableText(product.expectedCanonicalFilename),
      best_reference_candidate_path: toNullableText(product.bestReferenceCandidatePath),
      coverage_status: toNullableText(product.coverageStatus),
      status,
    });
  }

  for (let i = 0; i < payload.length; i += 500) {
    const chunk = payload.slice(i, i + 500);
    const { error } = await supabase
      .from("best_bottles_pipeline_sku_jobs")
      .upsert(chunk, {
        onConflict: "organization_id,grace_sku",
        ignoreDuplicates: false,
      });
    if (error) throw error;
  }

  return {
    total: products.length,
    upserted: payload.length,
    skipped,
  };
}

/**
 * Find the first Pipeline row whose `convex_slug` matches the given
 * Convex productGroup slug. Used by the Studio's Masters tab to locate
 * the Pipeline-side record when the operator approves a generated master,
 * so status + approval metadata can be written back.
 *
 * Returns null if no row matches — the caller should degrade gracefully
 * (save to Library but skip the Pipeline status write).
 */
export async function findPipelineGroupByConvexSlug(
  organizationId: string,
  convexSlug: string,
): Promise<PipelineGroup | null> {
  const { data, error } = await supabase
    .from("best_bottles_pipeline_groups")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("convex_slug", convexSlug)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as PipelineGroup | null) ?? null;
}

/**
 * Group rows by (family + capacity_ml + thread_size) — the "shape cohort"
 * that can share a single master reference image in Consistency Mode.
 * Used by the Pipeline page to let the operator launch one generation run
 * for a whole shape group instead of one SKU at a time.
 */
export interface ShapeGroup {
  key: string;
  family: string;
  capacityMl: number | null;
  threadSize: string | null;
  rows: PipelineGroup[];
}

export function groupByShape(rows: PipelineGroup[]): ShapeGroup[] {
  const map = new Map<string, ShapeGroup>();
  for (const row of rows) {
    const key = `${row.family}__${row.capacity_ml ?? "?"}__${row.thread_size ?? "?"}`;
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        family: row.family,
        capacityMl: row.capacity_ml,
        threadSize: row.thread_size,
        rows: [],
      };
      map.set(key, group);
    }
    group.rows.push(row);
  }
  return Array.from(map.values());
}

// ─── Status mutations ─────────────────────────────────────────────────────────

export async function updatePipelineGroupStatus(
  id: string,
  patch: Partial<
    Pick<
      PipelineGroup,
      | "madison_status"
      | "madison_consistency_set_id"
      | "madison_approved_image_id"
      | "madison_approved_at"
      | "madison_approved_by"
      | "madison_notes"
      | "madison_last_error"
    >
  >,
): Promise<void> {
  const { error } = await supabase
    .from("best_bottles_pipeline_groups")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
}

export async function updatePipelineSkuJob(
  id: string,
  patch: Partial<
    Pick<
      PipelineSkuJob,
      | "status"
      | "generated_image_id"
      | "generated_image_url"
      | "approved_image_id"
      | "approved_image_url"
      | "approved_at"
      | "approved_by"
      | "shopify_product_id"
      | "shopify_variant_id"
      | "shopify_media_id"
      | "shopify_image_url"
      | "shopify_sku"
      | "shopify_pushed_at"
      | "convex_synced_at"
      | "last_error"
    >
  >,
): Promise<void> {
  const { error } = await supabase
    .from("best_bottles_pipeline_sku_jobs")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
}

export async function updatePipelineSkuJobReference(params: {
  organizationId: string;
  graceSku: string;
  referenceUrl: string;
  referenceName?: string | null;
}): Promise<void> {
  const graceSku = params.graceSku.trim();
  if (!graceSku) return;

  const { data: job, error: lookupError } = await supabase
    .from("best_bottles_pipeline_sku_jobs")
    .select("id,status")
    .eq("organization_id", params.organizationId)
    .eq("grace_sku", graceSku)
    .maybeSingle();

  if (lookupError) throw lookupError;
  if (!job) return;

  const status = job.status === "needs-reference" ? "ready-to-generate" : job.status;
  const { error } = await supabase
    .from("best_bottles_pipeline_sku_jobs")
    .update({
      best_reference_candidate_path: params.referenceUrl,
      expected_canonical_filename: params.referenceName ?? undefined,
      coverage_status: "covered_canonical",
      status,
      last_error: null,
    })
    .eq("id", job.id);

  if (error) throw error;
}

export async function markPipelineSkuJobsQueued(params: {
  organizationId: string;
  productGroupSlug: string;
  graceSkus?: string[];
}): Promise<number> {
  const { organizationId, productGroupSlug, graceSkus } = params;
  let q = supabase
    .from("best_bottles_pipeline_sku_jobs")
    .update({ status: "queued" })
    .eq("organization_id", organizationId)
    .eq("product_group_slug", productGroupSlug);

  if (graceSkus && graceSkus.length > 0) {
    q = q.in("grace_sku", graceSkus).in("status", ["needs-reference", "ready-to-generate"]);
  } else {
    q = q.eq("status", "ready-to-generate");
  }

  const { data, error } = await q.select("id");
  if (error) throw error;
  return data?.length ?? 0;
}

export interface PipelineSkuShopifySyncPatch {
  sku: string;
  shopifySku?: string | null;
  shopifyProductId?: string | null;
  shopifyVariantId?: string | null;
  shopifyMediaId?: string | null;
  shopifyImageUrl?: string | null;
  convexSynced?: boolean;
  pushedAt?: string | null;
}

export async function markPipelineSkuJobSyncedBySku(params: {
  organizationId: string;
  patch: PipelineSkuShopifySyncPatch;
}): Promise<void> {
  const { organizationId, patch } = params;
  const now = patch.pushedAt ?? new Date().toISOString();
  const sku = patch.sku.trim();
  if (!sku) return;

  const update: Partial<PipelineSkuJob> = {
    status: patch.convexSynced ? "synced" : "shopify-pushed",
    shopify_product_id: patch.shopifyProductId ?? null,
    shopify_variant_id: patch.shopifyVariantId ?? null,
    shopify_media_id: patch.shopifyMediaId ?? null,
    shopify_image_url: patch.shopifyImageUrl ?? null,
    shopify_sku: patch.shopifySku ?? sku,
    shopify_pushed_at: now,
    convex_synced_at: patch.convexSynced ? now : null,
    last_error: null,
  };

  const { error } = await supabase
    .from("best_bottles_pipeline_sku_jobs")
    .update(update)
    .eq("organization_id", organizationId)
    .or(`grace_sku.eq.${sku},website_sku.eq.${sku},shopify_sku.eq.${sku}`);
  if (error) throw error;
}

type ShopifyPublishLogRow = {
  id: string;
  shopify_product_id: string;
  published_at: string | null;
  published_content: unknown;
};

type ShopifyProductImagePublishContent = {
  type?: string | null;
  source?: string | null;
  sku?: string | null;
  matchedShopifySku?: string | null;
  mode?: string | null;
  imageId?: string | null;
  imageUrl?: string | null;
  shopifyImageUrl?: string | null;
  mediaId?: string | null;
  variantId?: string | null;
  bestBottlesConvex?: {
    websiteSku?: string | null;
    field?: string | null;
  } | null;
};

export interface ReconcilePipelineShopifyPushesResult {
  totalLogs: number;
  productImageLogs: number;
  matched: number;
  updated: number;
  alreadyAccounted: number;
  skipped: number;
  unmatched: number;
  unmatchedSkus: string[];
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeShopifyPublishContent(value: unknown): ShopifyProductImagePublishContent | null {
  const obj = asObject(value);
  if (!obj) return null;
  const bestBottlesConvex = asObject(obj.bestBottlesConvex);

  return {
    type: textValue(obj.type),
    source: textValue(obj.source),
    sku: textValue(obj.sku),
    matchedShopifySku: textValue(obj.matchedShopifySku),
    mode: textValue(obj.mode),
    imageId: textValue(obj.imageId),
    imageUrl: textValue(obj.imageUrl),
    shopifyImageUrl: textValue(obj.shopifyImageUrl),
    mediaId: textValue(obj.mediaId),
    variantId: textValue(obj.variantId),
    bestBottlesConvex: bestBottlesConvex
      ? {
          websiteSku: textValue(bestBottlesConvex.websiteSku),
          field: textValue(bestBottlesConvex.field),
        }
      : null,
  };
}

function isUuid(value: string | null | undefined): value is string {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
  );
}

function skuLookupKey(value: string | null | undefined): string | null {
  const text = value?.trim().toLowerCase();
  return text && text.length > 0 ? text : null;
}

async function listShopifyPublishLogs(organizationId: string): Promise<ShopifyPublishLogRow[]> {
  const pageSize = 1000;
  const out: ShopifyPublishLogRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("shopify_publish_log")
      .select("id, shopify_product_id, published_at, published_content")
      .eq("organization_id", organizationId)
      .order("published_at", { ascending: false, nullsFirst: false })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    const page = (data ?? []) as ShopifyPublishLogRow[];
    out.push(...page);
    if (page.length < pageSize) break;
  }

  return out;
}

/**
 * Backfill Best Bottles SKU job state from historical Madison Shopify pushes.
 *
 * Earlier Shopify pushes were already recorded in `shopify_publish_log`, but
 * the newer per-SKU Pipeline table did not exist yet. This pass reads those
 * logs, matches by website/Grace SKU, and writes the Shopify product/variant/
 * media URL metadata into `best_bottles_pipeline_sku_jobs` so the queue does
 * not ask operators to push the same approved image twice.
 */
export async function reconcilePipelineShopifyPushes(params: {
  organizationId: string;
  existingJobs?: PipelineSkuJob[];
}): Promise<ReconcilePipelineShopifyPushesResult> {
  const { organizationId } = params;
  const jobs = params.existingJobs ?? await listPipelineSkuJobs(organizationId);
  const logs = await listShopifyPublishLogs(organizationId);
  const jobsBySku = new Map<string, PipelineSkuJob>();

  for (const job of jobs) {
    const graceKey = skuLookupKey(job.grace_sku);
    const websiteKey = skuLookupKey(job.website_sku);
    const shopifyKey = skuLookupKey(job.shopify_sku);
    if (graceKey) jobsBySku.set(graceKey, job);
    if (websiteKey) jobsBySku.set(websiteKey, job);
    if (shopifyKey) jobsBySku.set(shopifyKey, job);
  }

  const result: ReconcilePipelineShopifyPushesResult = {
    totalLogs: logs.length,
    productImageLogs: 0,
    matched: 0,
    updated: 0,
    alreadyAccounted: 0,
    skipped: 0,
    unmatched: 0,
    unmatchedSkus: [],
  };
  const updatedJobIds = new Set<string>();

  for (const log of logs) {
    const content = normalizeShopifyPublishContent(log.published_content);
    if (content?.type !== "product_image") {
      result.skipped += 1;
      continue;
    }
    result.productImageLogs += 1;

    const skuCandidates = [
      content.sku,
      content.matchedShopifySku,
      content.bestBottlesConvex?.websiteSku,
    ]
      .map(skuLookupKey)
      .filter((value): value is string => Boolean(value));

    const job = skuCandidates
      .map((candidate) => jobsBySku.get(candidate))
      .find((candidate): candidate is PipelineSkuJob => Boolean(candidate));

    if (!job) {
      result.unmatched += 1;
      const label = content.sku ?? content.matchedShopifySku ?? content.bestBottlesConvex?.websiteSku;
      if (label && result.unmatchedSkus.length < 20 && !result.unmatchedSkus.includes(label)) {
        result.unmatchedSkus.push(label);
      }
      continue;
    }

    if (updatedJobIds.has(job.id)) {
      result.skipped += 1;
      continue;
    }

    result.matched += 1;
    const shopifyProductId = log.shopify_product_id;
    const shopifyVariantId = content.variantId ?? job.shopify_variant_id;
    const shopifyMediaId = content.mediaId ?? job.shopify_media_id;
    const shopifyImageUrl = content.shopifyImageUrl ?? job.shopify_image_url;
    const publishedAt = log.published_at ?? new Date().toISOString();
    const convexSynced = Boolean(content.bestBottlesConvex);
    const nextStatus: PipelineSkuJobStatus =
      job.status === "synced" || convexSynced ? "synced" : "shopify-pushed";
    const alreadyTerminal = job.status === "shopify-pushed" || job.status === "synced";
    const sameKnownShopifyFields =
      (!shopifyProductId || job.shopify_product_id === shopifyProductId) &&
      (!shopifyVariantId || job.shopify_variant_id === shopifyVariantId) &&
      (!shopifyMediaId || job.shopify_media_id === shopifyMediaId) &&
      (!shopifyImageUrl || job.shopify_image_url === shopifyImageUrl);

    if (alreadyTerminal && job.shopify_pushed_at && sameKnownShopifyFields) {
      result.alreadyAccounted += 1;
      updatedJobIds.add(job.id);
      continue;
    }

    const patch: Partial<PipelineSkuJob> = {
      status: nextStatus,
      shopify_product_id: shopifyProductId,
      shopify_variant_id: shopifyVariantId,
      shopify_media_id: shopifyMediaId,
      shopify_image_url: shopifyImageUrl,
      shopify_sku: content.matchedShopifySku ?? content.sku ?? job.shopify_sku,
      shopify_pushed_at: job.shopify_pushed_at ?? publishedAt,
      convex_synced_at: nextStatus === "synced" ? (job.convex_synced_at ?? publishedAt) : job.convex_synced_at,
      last_error: null,
    };

    if (!job.approved_image_id && isUuid(content.imageId)) {
      patch.approved_image_id = content.imageId;
    }
    if (!job.approved_image_url && content.imageUrl) {
      patch.approved_image_url = content.imageUrl;
    }
    if (!job.approved_at) {
      patch.approved_at = publishedAt;
    }

    const { error } = await supabase
      .from("best_bottles_pipeline_sku_jobs")
      .update(patch)
      .eq("id", job.id);
    if (error) throw error;

    result.updated += 1;
    updatedJobIds.add(job.id);
  }

  return result;
}

async function updatePipelineGroupsByIds(
  rowIds: string[],
  patch: Partial<
    Pick<
      PipelineGroup,
      | "madison_status"
      | "madison_consistency_set_id"
      | "madison_approved_image_id"
      | "madison_approved_at"
      | "madison_approved_by"
      | "madison_notes"
      | "madison_last_error"
    >
  >,
): Promise<void> {
  if (rowIds.length === 0) return;
  const { error } = await supabase
    .from("best_bottles_pipeline_groups")
    .update(patch)
    .in("id", rowIds);
  if (error) throw error;
}

export async function markPipelineRowsQueued(
  rowIds: string[],
  consistencySetId: string,
): Promise<void> {
  await updatePipelineGroupsByIds(rowIds, {
    madison_status: "queued",
    madison_consistency_set_id: consistencySetId,
    madison_last_error: null,
  });
}

export async function markPipelineRowsQaPending(
  rowIds: string[],
  consistencySetId: string,
): Promise<void> {
  await updatePipelineGroupsByIds(rowIds, {
    madison_status: "qa-pending",
    madison_consistency_set_id: consistencySetId,
    madison_last_error: null,
  });
}

export async function markPipelineRowsGenerationFailed(
  rowIds: string[],
  consistencySetId: string,
  errorMessage: string,
): Promise<void> {
  await updatePipelineGroupsByIds(rowIds, {
    madison_status: "rejected",
    madison_consistency_set_id: consistencySetId,
    madison_last_error: errorMessage,
  });
}

export async function markPipelineRowsApproved(params: {
  rowIds: string[];
  imageId: string;
  userId: string | null;
  notes?: string | null;
}): Promise<void> {
  await updatePipelineGroupsByIds(params.rowIds, {
    madison_status: "approved",
    madison_approved_image_id: params.imageId,
    madison_approved_at: new Date().toISOString(),
    madison_approved_by: params.userId,
    madison_notes: params.notes ?? null,
    madison_last_error: null,
  });
}

/**
 * Mark all rows in a shape group as queued + tag them to a consistency set.
 * Called when the operator launches a shape-group run from the Pipeline UI.
 * The consistency set id lets us join back to the generated images later.
 */
export async function markShapeGroupQueued(
  rowIds: string[],
  consistencySetId: string,
): Promise<void> {
  if (rowIds.length === 0) return;
  const { error } = await supabase
    .from("best_bottles_pipeline_groups")
    .update({
      madison_status: "queued",
      madison_consistency_set_id: consistencySetId,
      madison_last_error: null,
    })
    .in("id", rowIds);
  if (error) throw error;
}

/**
 * Flip all rows tagged with a consistency set to "generated" — called once
 * the orchestrator reports the set complete. Individual rows that errored
 * can be flipped back to "rejected" manually in the review flow (P0b).
 */
export async function markShapeGroupGenerated(
  consistencySetId: string,
): Promise<void> {
  const { error } = await supabase
    .from("best_bottles_pipeline_groups")
    .update({ madison_status: "generated" })
    .eq("madison_consistency_set_id", consistencySetId)
    .eq("madison_status", "queued");
  if (error) throw error;
}

/**
 * Pin a single row as the shape group's hero master reference (Lane B /
 * Consistency Mode). Unpins every other row in the same shape group
 * (same org + family + capacity_ml + thread_size) in the same call so
 * the partial unique index `idx_best_bottles_pipeline_one_hero_per_shape`
 * is never violated.
 *
 * Done as two sequential updates (unpin siblings, pin target) rather than
 * a single RPC because the client already has RLS-scoped update rights
 * and an RPC would add deployment friction for a two-query operation.
 * The UI optimistically re-queries after this resolves.
 *
 * For Lane A (paper-doll) the equivalent is `setClearMasterReference`.
 */
export async function setShapeGroupMasterReference(params: {
  organizationId: string;
  rowId: string;
  family: string;
  capacityMl: number | null;
  threadSize: string | null;
}): Promise<void> {
  const { organizationId, rowId, family, capacityMl, threadSize } = params;

  // Unpin any currently-pinned siblings in the shape group. We scope by
  // the exact same composite key the DB's partial unique index uses.
  let unpin = supabase
    .from("best_bottles_pipeline_groups")
    .update({ is_hero_reference: false })
    .eq("organization_id", organizationId)
    .eq("family", family)
    .eq("is_hero_reference", true)
    .neq("id", rowId);
  unpin = capacityMl == null
    ? unpin.is("capacity_ml", null)
    : unpin.eq("capacity_ml", capacityMl);
  unpin = threadSize == null
    ? unpin.is("thread_size", null)
    : unpin.eq("thread_size", threadSize);
  const { error: unpinErr } = await unpin;
  if (unpinErr) throw unpinErr;

  const { error: pinErr } = await supabase
    .from("best_bottles_pipeline_groups")
    .update({ is_hero_reference: true })
    .eq("id", rowId);
  if (pinErr) throw pinErr;
}

/**
 * Clear the hero master-reference pin on a single row. Used when the
 * operator clicks the currently-pinned thumbnail to un-pin (toggle).
 */
export async function clearShapeGroupMasterReference(
  rowId: string,
): Promise<void> {
  const { error } = await supabase
    .from("best_bottles_pipeline_groups")
    .update({ is_hero_reference: false })
    .eq("id", rowId);
  if (error) throw error;
}

// ─── Paper-doll (Lane A) — clear master reference + geometry_spec ────────────

/**
 * Pin a single row as the shape group's paper-doll clear-master (Lane A).
 * Same unpin-siblings-then-pin-target pattern as the hero reference above;
 * enforced by `idx_best_bottles_pipeline_one_clear_master_per_shape`. Runs
 * independently of the hero-reference pin — a row may be both.
 */
export async function setClearMasterReference(params: {
  organizationId: string;
  rowId: string;
  family: string;
  capacityMl: number | null;
  threadSize: string | null;
}): Promise<void> {
  const { organizationId, rowId, family, capacityMl, threadSize } = params;

  let unpin = supabase
    .from("best_bottles_pipeline_groups")
    .update({ is_clear_master_reference: false })
    .eq("organization_id", organizationId)
    .eq("family", family)
    .eq("is_clear_master_reference", true)
    .neq("id", rowId);
  unpin =
    capacityMl == null
      ? unpin.is("capacity_ml", null)
      : unpin.eq("capacity_ml", capacityMl);
  unpin =
    threadSize == null
      ? unpin.is("thread_size", null)
      : unpin.eq("thread_size", threadSize);
  const { error: unpinErr } = await unpin;
  if (unpinErr) throw unpinErr;

  const { error: pinErr } = await supabase
    .from("best_bottles_pipeline_groups")
    .update({ is_clear_master_reference: true })
    .eq("id", rowId);
  if (pinErr) throw pinErr;
}

/**
 * Clear the paper-doll clear-master pin on a single row.
 */
export async function clearClearMasterReference(rowId: string): Promise<void> {
  const { error } = await supabase
    .from("best_bottles_pipeline_groups")
    .update({ is_clear_master_reference: false })
    .eq("id", rowId);
  if (error) throw error;
}

/**
 * Read the paper-doll `geometry_spec` JSON blob for a row. Returns null
 * when the shape group has not yet been ingested for paper-doll. Caller
 * is responsible for runtime-validating against the `GeometrySpec` type.
 */
export async function getGeometrySpec(rowId: string): Promise<unknown | null> {
  const { data, error } = await supabase
    .from("best_bottles_pipeline_groups")
    .select("geometry_spec")
    .eq("id", rowId)
    .maybeSingle();
  if (error) throw error;
  return (data?.geometry_spec ?? null) as unknown | null;
}

/**
 * Write the paper-doll `geometry_spec` JSON blob for a row. Overwrites
 * any prior value — the Paper-Doll Drawer calls this on each successful
 * ingest run so the most recent run wins.
 */
export async function setGeometrySpec(
  rowId: string,
  spec: unknown,
): Promise<void> {
  const { error } = await supabase
    .from("best_bottles_pipeline_groups")
    .update({ geometry_spec: spec })
    .eq("id", rowId);
  if (error) throw error;
}
