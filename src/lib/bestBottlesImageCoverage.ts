import { getBestBottlesReferenceUrlIssue } from "./bestBottlesReferenceValidation";

/**
 * Axis 2 of the Best Bottles two-axis model (quality / approval) — see
 * docs/BEST-BOTTLES-IMAGE-PIPELINE-BRIEF.md §0. This is what defines "done":
 * `approved-keep` is the ONLY status that makes a variant complete / PDP-live.
 * Lineage (axis 1) and "has any image" never gate completeness.
 */
export type BestBottlesApprovalStatus = "approved-keep" | "needs-regen" | "unreviewed";

export const BEST_BOTTLES_STATUS_TAG_APPROVED_KEEP = "status:approved-keep" as const;
export const BEST_BOTTLES_STATUS_TAG_NEEDS_REGEN = "status:needs-regen" as const;
export const BEST_BOTTLES_STATUS_TAG_UNREVIEWED = "status:unreviewed" as const;

const APPROVAL_STATUS_BY_TAG: Record<string, BestBottlesApprovalStatus> = {
  [BEST_BOTTLES_STATUS_TAG_APPROVED_KEEP]: "approved-keep",
  [BEST_BOTTLES_STATUS_TAG_NEEDS_REGEN]: "needs-regen",
  [BEST_BOTTLES_STATUS_TAG_UNREVIEWED]: "unreviewed",
};

/**
 * Parse the quality verdict out of an image's `library_tags`. An explicit
 * `approved-keep` always wins; otherwise `needs-regen` beats `unreviewed`.
 * Returns null when no `status:*` decision tag is present (i.e. untriaged) —
 * which must NOT be treated as approved.
 */
export function getBestBottlesApprovalStatus(
  tags: readonly string[] | null | undefined,
): BestBottlesApprovalStatus | null {
  if (!tags) return null;
  let resolved: BestBottlesApprovalStatus | null = null;
  for (const raw of tags) {
    const status = APPROVAL_STATUS_BY_TAG[String(raw ?? "").trim().toLowerCase()];
    if (!status) continue;
    if (status === "approved-keep") return "approved-keep";
    if (status === "needs-regen") resolved = "needs-regen";
    else if (resolved == null) resolved = "unreviewed";
  }
  return resolved;
}

/**
 * Axis 1 of the two-axis model (lineage / provenance) — see
 * docs/BEST-BOTTLES-IMAGE-PIPELINE-BRIEF.md §0. This describes WHAT reference an
 * image was made from; it is independent of quality (axis 2) and never gates
 * "done". It drives the Image Library legacy/clean filter only.
 *   - `clean`   → made from the NEW clean transparent references (`reference-lineage:clean`)
 *   - `legacy`  → made from the OLD extracted-PNG references (`reference-lineage:legacy`)
 *   - `keeper`  → an existing live image cataloged in via `keeper-backfill-*`
 *   - `unknown` → not yet tagged with a lineage (treated as "not clean")
 */
export type BestBottlesReferenceLineage = "clean" | "legacy" | "keeper" | "unknown";

export const BEST_BOTTLES_LINEAGE_TAG_CLEAN = "reference-lineage:clean" as const;
export const BEST_BOTTLES_LINEAGE_TAG_LEGACY = "reference-lineage:legacy" as const;
export const BEST_BOTTLES_LINEAGE_TAG_FLATTENED_SINGLE_SOURCE =
  "reference-lineage:flattened-single-source" as const;
const KEEPER_BACKFILL_TAG_PREFIX = "keeper-backfill";

/**
 * Resolve an image's lineage from its `library_tags`. An explicit
 * `reference-lineage:clean` wins; then `reference-lineage:legacy`; then any
 * `keeper-backfill*` import tag. Returns `unknown` when no lineage tag is
 * present — which the library filter treats as "not clean" (legacy side).
 */
export function getBestBottlesReferenceLineage(
  tags: readonly string[] | null | undefined,
): BestBottlesReferenceLineage {
  if (!tags) return "unknown";
  let resolved: BestBottlesReferenceLineage = "unknown";
  for (const raw of tags) {
    const tag = String(raw ?? "").trim().toLowerCase();
    if (
      tag === BEST_BOTTLES_LINEAGE_TAG_CLEAN
      || tag === BEST_BOTTLES_LINEAGE_TAG_FLATTENED_SINGLE_SOURCE
    ) {
      return "clean";
    }
    if (tag === BEST_BOTTLES_LINEAGE_TAG_LEGACY) resolved = "legacy";
    else if (resolved === "unknown" && tag.startsWith(KEEPER_BACKFILL_TAG_PREFIX)) {
      resolved = "keeper";
    }
  }
  return resolved;
}

/**
 * True when an image belongs in the default "Clean / New" Image Library view —
 * i.e. it was generated from the new clean references. Everything else (legacy,
 * keeper imports, untagged) is "not clean" and lives on the legacy side.
 */
export function isBestBottlesCleanLineage(
  tags: readonly string[] | null | undefined,
): boolean {
  return getBestBottlesReferenceLineage(tags) === "clean";
}

export type BestBottlesReferenceSource =
  | "canonical-render"
  | "flattened-product-truth"
  | "local-legacy"
  | "bestbottles-live"
  | "manual"
  | "none";

export type BestBottlesNeedsWorkAction =
  | "import-local-reference"
  | "source-website-reference"
  | "generate-image"
  | "review-generated"
  | "push-to-shopify"
  | "sync-convex"
  | "needs-source-match"
  | "complete";

export interface SkuJobCoverageInput {
  status: string | null | undefined;
  bestReferenceCandidatePath?: string | null;
  coverageStatus?: string | null;
  generatedImageUrl?: string | null;
  generatedImageId?: string | null;
  approvedImageUrl?: string | null;
  approvedImageId?: string | null;
  approvedAt?: string | null;
  shopifyPushedAt?: string | null;
  shopifyImageUrl?: string | null;
  shopifyMediaId?: string | null;
  convexSyncedAt?: string | null;
  referenceSource?: BestBottlesReferenceSource | null;
  referenceSourcePath?: string | null;
  referenceSourceUrl?: string | null;
  referenceIssue?: string | null;
  /**
   * Durable curation tags from the linked `generated_images` row
   * (`library_tags`). Used to read the axis-2 quality verdict when
   * `approvalStatus` is not supplied directly.
   */
  libraryTags?: readonly string[] | null;
  /**
   * Quality / approval verdict (axis 2). When provided, it overrides anything
   * parsed from `libraryTags`. `approved-keep` is the only value that makes a
   * variant complete / PDP-live.
   */
  approvalStatus?: BestBottlesApprovalStatus | null;
}

export const BEST_BOTTLES_NEEDS_WORK_ACTION_LABELS: Record<BestBottlesNeedsWorkAction, string> = {
  "import-local-reference": "Import local reference",
  "source-website-reference": "Source website reference",
  "generate-image": "Generate image",
  "review-generated": "Review generated image",
  "push-to-shopify": "Push to Shopify",
  "sync-convex": "Sync Convex",
  "needs-source-match": "Needs source match",
  complete: "Complete",
};

export interface BulkCreateSelectionInput {
  id?: string;
  action: BestBottlesNeedsWorkAction;
  persisted?: boolean;
  status?: string | null;
  family?: string | null;
  productGroupSlug?: string | null;
  productGroupDisplayName?: string | null;
}

export interface BulkCreateStudioDestination {
  family: string;
  productGroupSlug: string;
  productGroupDisplayName: string;
  count: number;
}

export interface BulkCreatePreflightSummary {
  total: number;
  actionCounts: Record<BestBottlesNeedsWorkAction, number>;
  referenceIntakeTotal: number;
  queueableGenerateReady: number;
  alreadyQueuedOrGenerating: number;
  reportOnlyGenerateReady: number;
  downstreamTotal: number;
  blocked: number;
  canQueueGeneration: boolean;
  queueableStudioDestinations: BulkCreateStudioDestination[];
  creationLaneStudioDestinations: BulkCreateStudioDestination[];
}

export interface BestBottlesGroupWorkflowSummary {
  total: number;
  generatedOrReview: number;
  approvedTotal: number;
  approvedPendingPush: number;
  shopifyPushed: number;
  convexSynced: number;
  nextAction: BestBottlesNeedsWorkAction | "none";
  nextActionLabel: string;
  stateLabel: string;
  canPushReady: boolean;
}

const BULK_CREATE_ACTIONS = Object.keys(
  BEST_BOTTLES_NEEDS_WORK_ACTION_LABELS,
) as BestBottlesNeedsWorkAction[];

function emptyActionCounts(): Record<BestBottlesNeedsWorkAction, number> {
  return BULK_CREATE_ACTIONS.reduce(
    (acc, action) => {
      acc[action] = 0;
      return acc;
    },
    {} as Record<BestBottlesNeedsWorkAction, number>,
  );
}

function addStudioDestination(
  destinations: Map<string, BulkCreateStudioDestination>,
  row: BulkCreateSelectionInput,
): void {
  const slug = row.productGroupSlug?.trim();
  if (!slug) return;

  const existing = destinations.get(slug);
  if (existing) {
    existing.count += 1;
    return;
  }

  destinations.set(slug, {
    family: row.family?.trim() || "(blank)",
    productGroupSlug: slug,
    productGroupDisplayName: row.productGroupDisplayName?.trim() || slug,
    count: 1,
  });
}

function sortedStudioDestinations(
  destinations: Map<string, BulkCreateStudioDestination>,
): BulkCreateStudioDestination[] {
  return Array.from(destinations.values()).sort(
    (a, b) =>
      b.count - a.count ||
      a.family.localeCompare(b.family) ||
      a.productGroupDisplayName.localeCompare(b.productGroupDisplayName) ||
      a.productGroupSlug.localeCompare(b.productGroupSlug),
  );
}

export function summarizeBulkCreateSelection(
  rows: BulkCreateSelectionInput[],
): BulkCreatePreflightSummary {
  const actionCounts = emptyActionCounts();
  const studioDestinationBySlug = new Map<string, BulkCreateStudioDestination>();
  const creationLaneDestinationBySlug = new Map<string, BulkCreateStudioDestination>();
  let referenceIntakeTotal = 0;
  let queueableGenerateReady = 0;
  let alreadyQueuedOrGenerating = 0;
  let reportOnlyGenerateReady = 0;
  let downstreamTotal = 0;
  let blocked = 0;

  for (const row of rows) {
    actionCounts[row.action] += 1;

    if (row.action === "import-local-reference" || row.action === "source-website-reference") {
      referenceIntakeTotal += 1;
    } else if (row.action === "generate-image") {
      if (row.persisted === false) reportOnlyGenerateReady += 1;
      else if (row.status === "queued" || row.status === "generating") {
        alreadyQueuedOrGenerating += 1;
        addStudioDestination(creationLaneDestinationBySlug, row);
      } else {
        queueableGenerateReady += 1;
        addStudioDestination(studioDestinationBySlug, row);
        addStudioDestination(creationLaneDestinationBySlug, row);
      }
    } else if (
      row.action === "review-generated" ||
      row.action === "push-to-shopify" ||
      row.action === "sync-convex"
    ) {
      downstreamTotal += 1;
    } else if (row.action === "needs-source-match") {
      blocked += 1;
    }
  }

  return {
    total: rows.length,
    actionCounts,
    referenceIntakeTotal,
    queueableGenerateReady,
    alreadyQueuedOrGenerating,
    reportOnlyGenerateReady,
    downstreamTotal,
    blocked,
    canQueueGeneration: queueableGenerateReady > 0,
    queueableStudioDestinations: sortedStudioDestinations(studioDestinationBySlug),
    creationLaneStudioDestinations: sortedStudioDestinations(creationLaneDestinationBySlug),
  };
}

export function selectBulkCreateBatchRows<T extends BulkCreateSelectionInput>(
  rows: T[],
  limit: number,
): T[] {
  if (!Number.isFinite(limit) || limit <= 0) return [];
  return rows
    .filter(
      (row) =>
        row.persisted !== false &&
        row.action === "generate-image" &&
        row.status === "ready-to-generate",
    )
    .slice(0, Math.floor(limit));
}

export function buildBulkCreateQueuedHandoffRows<T extends BulkCreateSelectionInput>(
  rows: T[],
): T[] {
  return rows
    .filter(
      (row) =>
        row.persisted !== false &&
        row.action === "generate-image" &&
        row.status === "ready-to-generate",
    )
    .map((row) => ({
      ...row,
      status: "queued",
    }) as T);
}

export function hasSkuJobShopifyDestination(job: SkuJobCoverageInput): boolean {
  return Boolean(
    job.status === "shopify-pushed" ||
      job.status === "synced" ||
      job.shopifyPushedAt ||
      job.shopifyImageUrl ||
      job.shopifyMediaId,
  );
}

export function hasSkuJobConvexDestination(job: SkuJobCoverageInput): boolean {
  return Boolean(job.status === "synced" || job.convexSyncedAt);
}

export function getSkuJobApprovalStatus(job: SkuJobCoverageInput): BestBottlesApprovalStatus | null {
  return job.approvalStatus ?? getBestBottlesApprovalStatus(job.libraryTags);
}

/**
 * True only when this variant carries a `status:approved-keep` image — the
 * single gate for "complete" / "PDP live". Never inferred from "has any image",
 * lineage, a generation, or a Convex/Shopify destination.
 */
export function hasSkuJobApprovedKeep(job: SkuJobCoverageInput): boolean {
  return getSkuJobApprovalStatus(job) === "approved-keep";
}

/**
 * The done gate. See docs/BEST-BOTTLES-IMAGE-PIPELINE-BRIEF.md §0 + target #1:
 * a variant is COMPLETE / PDP-live ONLY when it has an `approved-keep` image.
 */
export function isSkuJobComplete(job: SkuJobCoverageInput): boolean {
  return hasSkuJobApprovedKeep(job);
}

export function hasSkuJobApprovedImage(job: SkuJobCoverageInput): boolean {
  return Boolean(
    job.status === "approved" ||
      job.status === "shopify-pushed" ||
      job.status === "synced" ||
      job.approvedAt ||
      job.approvedImageUrl ||
      job.approvedImageId,
  );
}

export function hasSkuJobGeneratedImage(job: SkuJobCoverageInput): boolean {
  return Boolean(
    job.status === "generated" ||
      job.status === "qa-pending" ||
      job.status === "rejected" ||
      job.generatedImageUrl ||
      job.generatedImageId,
  );
}

/**
 * Durable evidence that Madison has an image result linked to the SKU job.
 * Approved images count even when the earlier generated-image fields were
 * cleared during promotion. Destination-only Shopify/Convex state does not
 * fabricate generation evidence.
 */
export function hasSkuJobGeneratedOrApprovedImage(job: SkuJobCoverageInput): boolean {
  return hasSkuJobGeneratedImage(job) || Boolean(job.approvedImageUrl || job.approvedImageId);
}

export function buildBestBottlesGroupWorkflowSummary(
  jobs: SkuJobCoverageInput[],
): BestBottlesGroupWorkflowSummary {
  let generatedOrReview = 0;
  let approvedTotal = 0;
  let approvedPendingPush = 0;
  let shopifyPushed = 0;
  let convexSynced = 0;

  for (const job of jobs) {
    const hasConvexDestination = hasSkuJobConvexDestination(job);
    const hasShopifyDestination = hasSkuJobShopifyDestination(job);
    const hasApprovedImage = hasSkuJobApprovedImage(job);
    const hasGeneratedImage = hasSkuJobGeneratedImage(job);

    if (hasGeneratedImage && !hasApprovedImage && !hasShopifyDestination && !hasConvexDestination) {
      generatedOrReview += 1;
    }
    if (hasApprovedImage || hasShopifyDestination || hasConvexDestination) {
      approvedTotal += 1;
    }
    if (hasApprovedImage && !hasShopifyDestination && !hasConvexDestination) {
      approvedPendingPush += 1;
    }
    if (hasShopifyDestination || hasConvexDestination) {
      shopifyPushed += 1;
    }
    if (hasConvexDestination) {
      convexSynced += 1;
    }
  }

  let nextAction: BestBottlesGroupWorkflowSummary["nextAction"] = "none";
  let nextActionLabel = "No destination work";
  let stateLabel = "Not generated";

  if (approvedPendingPush > 0) {
    nextAction = "push-to-shopify";
    nextActionLabel = "Push ready";
    stateLabel = "Push ready";
  } else if (shopifyPushed > convexSynced) {
    nextAction = "sync-convex";
    nextActionLabel = "Sync Convex";
    stateLabel = "Shopify pushed";
  } else if (generatedOrReview > 0) {
    nextAction = "review-generated";
    nextActionLabel = "Review generated";
    stateLabel = "Generated";
  } else if (convexSynced > 0 && convexSynced === jobs.length) {
    nextAction = "complete";
    nextActionLabel = "Complete";
    stateLabel = "Synced";
  } else if (approvedTotal > 0) {
    nextAction = "push-to-shopify";
    nextActionLabel = "Push ready";
    stateLabel = "Push ready";
  }

  return {
    total: jobs.length,
    generatedOrReview,
    approvedTotal,
    approvedPendingPush,
    shopifyPushed,
    convexSynced,
    nextAction,
    nextActionLabel,
    stateLabel,
    canPushReady: approvedPendingPush > 0,
  };
}

export function hasUsableGenerationReference(job: SkuJobCoverageInput): boolean {
  return getBestBottlesReferenceUrlIssue(job.bestReferenceCandidatePath) === null;
}

function isHttpReference(value: string | null | undefined): boolean {
  return /^https?:\/\//i.test(String(value ?? "").trim());
}

function hasLocalReferenceCandidate(job: SkuJobCoverageInput): boolean {
  return Boolean(
    job.referenceSource === "local-legacy" ||
      job.referenceSource === "flattened-product-truth" ||
      job.referenceSource === "canonical-render" ||
      job.referenceSource === "manual" ||
      job.referenceSourcePath ||
      (job.bestReferenceCandidatePath &&
        !isHttpReference(job.bestReferenceCandidatePath) &&
        getBestBottlesReferenceUrlIssue(job.bestReferenceCandidatePath) !== null),
  );
}

function hasWebsiteReferenceCandidate(job: SkuJobCoverageInput): boolean {
  return Boolean(
    job.referenceSource === "bestbottles-live" ||
      job.referenceSourceUrl ||
      (job.bestReferenceCandidatePath &&
        isHttpReference(job.bestReferenceCandidatePath) &&
        getBestBottlesReferenceUrlIssue(job.bestReferenceCandidatePath) !== null),
  );
}

export function getSkuJobNextAction(job: SkuJobCoverageInput): BestBottlesNeedsWorkAction {
  // Done gate: only an `approved-keep` image counts as complete — not a Convex
  // sync, a Shopify push, or merely "has an image". This is what collapses the
  // muddy "live" count to the true clean/approved count.
  if (isSkuJobComplete(job)) return "complete";

  // An explicit `needs-regen` verdict is the real backlog: send it back to
  // generation when a usable reference exists, otherwise back to review. Never
  // push or sync a known off-brand image downstream.
  if (getSkuJobApprovalStatus(job) === "needs-regen") {
    return hasUsableGenerationReference(job) ? "generate-image" : "review-generated";
  }

  // Past this point the image is not yet confirmed `approved-keep`. A row that
  // already reached a destination (Convex/Shopify) but lacks the keep verdict is
  // unconfirmed quality, so it surfaces for review rather than as complete. Rows
  // still climbing the publish chain keep their existing push/sync next action.
  if (hasSkuJobConvexDestination(job)) return "review-generated";
  if (hasSkuJobShopifyDestination(job)) return "sync-convex";
  if (hasSkuJobApprovedImage(job)) return "push-to-shopify";
  if (hasSkuJobGeneratedImage(job)) return "review-generated";

  if (
    (job.status === "ready-to-generate" ||
      job.status === "queued" ||
      job.status === "generating") &&
    hasUsableGenerationReference(job)
  ) {
    return "generate-image";
  }

  if (hasLocalReferenceCandidate(job)) return "import-local-reference";
  if (hasWebsiteReferenceCandidate(job)) return "source-website-reference";
  return "needs-source-match";
}

export function shouldShowInNeedsWork(job: SkuJobCoverageInput): boolean {
  return getSkuJobNextAction(job) !== "complete";
}
