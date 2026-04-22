/**
 * Bulk reference-image sync for Best Bottles Pipeline rows.
 *
 * For every pipeline row with a `product_url`, invoke the
 * `scrape-product-reference` edge function to extract the page's hero image
 * (og:image) and write it to `legacy_hero_image_url`. After a successful
 * sync, the Pipeline page can show a thumbnail per shape group and launch
 * Consistency Mode with the image pre-loaded as the master reference —
 * eliminating the per-SKU "open Photoshop → screenshot → upload" step.
 *
 * Concurrency is capped so we don't hammer bestbottles.com and so the UI
 * can surface progress without staggered UI jumps. Failures per row are
 * surfaced back to the caller so the operator sees exactly which URLs
 * couldn't be scraped.
 */

import { supabase } from "@/integrations/supabase/client";

export interface ReferenceSyncRow {
  id: string;
  productUrl: string | null;
  displayName: string;
}

export type ReferenceSyncOutcome =
  | { id: string; status: "skipped"; reason: string }
  | { id: string; status: "unchanged"; imageUrl: string }
  | { id: string; status: "synced"; imageUrl: string }
  | { id: string; status: "error"; error: string };

export interface ReferenceSyncProgress {
  total: number;
  completed: number;
  succeeded: number;
  skipped: number;
  failed: number;
}

export interface SyncOptions {
  /**
   * Max parallel scrape invocations. bestbottles.com is a Shopify-class host
   * that handles well more than this, but we stay conservative so the UI
   * progress bar actually increments in visible steps and so we don't
   * look like a crawler.
   */
  concurrency?: number;
  /**
   * If true, overwrite existing legacy_hero_image_url values. Default false
   * so a second sync pass only fills in gaps and doesn't clobber images the
   * operator has already validated.
   */
  force?: boolean;
  /** Called after each row finishes so the UI can render incremental state. */
  onProgress?: (progress: ReferenceSyncProgress, outcome: ReferenceSyncOutcome) => void;
}

const DEFAULT_CONCURRENCY = 4;

async function scrapeOne(
  productUrl: string,
): Promise<{ imageUrl: string | null; error?: string }> {
  const { data, error } = await supabase.functions.invoke(
    "scrape-product-reference",
    { body: { productUrl } },
  );
  if (error) {
    return { imageUrl: null, error: error.message };
  }
  if (!data || typeof data !== "object") {
    return { imageUrl: null, error: "Empty response from scraper." };
  }
  const result = data as { imageUrl: string | null; error?: string };
  return { imageUrl: result.imageUrl, error: result.error };
}

async function processRow(
  row: ReferenceSyncRow,
  existing: Map<string, string | null>,
  force: boolean,
): Promise<ReferenceSyncOutcome> {
  if (!row.productUrl) {
    return { id: row.id, status: "skipped", reason: "No product_url on row." };
  }
  const current = existing.get(row.id) ?? null;
  if (!force && current) {
    return { id: row.id, status: "unchanged", imageUrl: current };
  }

  const { imageUrl, error } = await scrapeOne(row.productUrl);
  if (!imageUrl) {
    return {
      id: row.id,
      status: "error",
      error: error ?? "Scraper returned no image.",
    };
  }

  const { error: updateError } = await supabase
    .from("best_bottles_pipeline_groups")
    .update({ legacy_hero_image_url: imageUrl })
    .eq("id", row.id);

  if (updateError) {
    return {
      id: row.id,
      status: "error",
      error: `Scrape OK but DB update failed: ${updateError.message}`,
    };
  }

  return { id: row.id, status: "synced", imageUrl };
}

/**
 * Sync reference images for a list of pipeline rows. Returns when all are
 * done; progress callback fires as each completes.
 */
export async function syncReferenceImages(
  rows: ReferenceSyncRow[],
  existing: Map<string, string | null>,
  opts: SyncOptions = {},
): Promise<ReferenceSyncOutcome[]> {
  const concurrency = Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY);
  const force = opts.force ?? false;
  const onProgress = opts.onProgress;

  const outcomes: ReferenceSyncOutcome[] = [];
  const progress: ReferenceSyncProgress = {
    total: rows.length,
    completed: 0,
    succeeded: 0,
    skipped: 0,
    failed: 0,
  };

  let cursor = 0;
  const worker = async () => {
    while (cursor < rows.length) {
      const idx = cursor++;
      if (idx >= rows.length) break;
      const outcome = await processRow(rows[idx], existing, force);
      outcomes[idx] = outcome;
      progress.completed += 1;
      if (outcome.status === "synced") progress.succeeded += 1;
      else if (outcome.status === "skipped") progress.skipped += 1;
      else if (outcome.status === "error") progress.failed += 1;
      onProgress?.({ ...progress }, outcome);
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));
  return outcomes;
}
