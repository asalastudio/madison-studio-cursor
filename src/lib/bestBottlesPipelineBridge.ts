/**
 * Bridge between the Best Bottles Grid Pipeline page and the Dark Room's
 * Consistency Mode. The Pipeline "Launch" button writes a pre-fill blob
 * to sessionStorage and navigates to /darkroom; Consistency Mode reads
 * the blob on mount, pre-selects the matching bottle colors + applicators,
 * and clears it so subsequent visits don't auto-apply stale state.
 *
 * sessionStorage is used instead of URL params because the payload
 * includes lists that don't compress well into a querystring and the
 * link is a one-shot handoff, not a shareable URL.
 */

const STORAGE_KEY = "best-bottles-pipeline-prefill";

export interface PipelinePrefill {
  /** Shape group key, e.g. "Cylinder__9__17-415". Used for display only. */
  shapeKey: string;
  /** Display label shown in the DR panel header. */
  shapeLabel: string;
  /** pipeline_groups.id values this run covers — tagged to the set for status sync. */
  pipelineGroupIds: string[];
  /**
   * Bottle-color option ids the user should see pre-ticked. Ids from
   * consistencyVariations.BOTTLE_COLORS (e.g. "clear", "amber").
   */
  bottleColorIds: string[];
  /**
   * Fitment option ids the user should see pre-ticked. Ids from
   * consistencyVariations.FITMENT_TYPES (e.g. "fine-mist-metal", "roller-ball").
   */
  fitmentIds: string[];
  /**
   * Catalog metadata for the shape group — used downstream by the edge
   * function to auto-tag generated images (library_tags) and build
   * human-readable storage filenames so the client's team can find and
   * validate outputs by family/capacity/thread without spelunking UUIDs.
   */
  family: string;
  capacityMl: number | null;
  threadSize: string | null;
  /**
   * Hero image URL scraped from a representative product page in the shape
   * group (legacy_hero_image_url). When present, Consistency Mode pre-loads
   * this as the master reference so the operator doesn't have to upload a
   * PSD screenshot for the most common path — visually-accurate reference
   * for an existing SKU.
   */
  masterReferenceUrl?: string;
  masterReferenceLabel?: string;
  /** Optional timestamp so we can expire stale handoffs after ~30 min. */
  writtenAt: number;
}

export function writePipelinePrefill(prefill: Omit<PipelinePrefill, "writtenAt">): void {
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...prefill, writtenAt: Date.now() } satisfies PipelinePrefill),
    );
  } catch {
    // sessionStorage can be disabled (private mode) — silent fallback;
    // the user just loses the pre-fill and configures manually.
  }
}

export function readAndClearPipelinePrefill(): PipelinePrefill | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(STORAGE_KEY);
    const parsed = JSON.parse(raw) as PipelinePrefill;
    // Expire after 30 min so a stale tab doesn't suddenly pre-fill.
    if (Date.now() - parsed.writtenAt > 30 * 60 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}
