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
      row["Applicator Types"] ?? row["Applicator Type"] ?? row["applicator_types"],
    ),
    thread_size: emptyToNull(row["Thread Size"] ?? row["thread_size"]),
    display_name: displayName,
    category: emptyToNull(row["Category"] ?? row["category"]),
    collection: emptyToNull(row["Collection"] ?? row["collection"]),
    convex_slug: emptyToNull(row["Convex Slug"] ?? row["convex_slug"]),
    convex_id: emptyToNull(row["Convex ID"] ?? row["convex_id"]),
    primary_grace_sku: emptyToNull(
      row["Primary Grace SKU"] ?? row["primary_grace_sku"],
    ),
    primary_website_sku: emptyToNull(
      row["Primary Website SKU"] ?? row["primary_website_sku"],
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
