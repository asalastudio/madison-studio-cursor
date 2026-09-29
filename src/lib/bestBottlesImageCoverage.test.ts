import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BEST_BOTTLES_LINEAGE_TAG_CLEAN,
  BEST_BOTTLES_LINEAGE_TAG_LEGACY,
  BEST_BOTTLES_STATUS_TAG_APPROVED_KEEP,
  BEST_BOTTLES_STATUS_TAG_NEEDS_REGEN,
  BEST_BOTTLES_STATUS_TAG_UNREVIEWED,
  buildBestBottlesGroupWorkflowSummary,
  buildBulkCreateQueuedHandoffRows,
  getBestBottlesApprovalStatus,
  getBestBottlesReferenceLineage,
  getSkuJobNextAction,
  hasSkuJobApprovedKeep,
  hasSkuJobGeneratedOrApprovedImage,
  hasSkuJobShopifyDestination,
  isBestBottlesCleanLineage,
  isSkuJobComplete,
  selectBulkCreateBatchRows,
  summarizeBulkCreateSelection,
  shouldShowInNeedsWork,
  type SkuJobCoverageInput,
} from "./bestBottlesImageCoverage.ts";

function job(overrides: Partial<SkuJobCoverageInput>): SkuJobCoverageInput {
  return {
    status: "needs-reference",
    bestReferenceCandidatePath: null,
    coverageStatus: "missing_local_reference_image",
    generatedImageUrl: null,
    generatedImageId: null,
    approvedImageUrl: null,
    approvedImageId: null,
    approvedAt: null,
    shopifyPushedAt: null,
    shopifyImageUrl: null,
    shopifyMediaId: null,
    convexSyncedAt: null,
    referenceSource: "none",
    referenceSourcePath: null,
    referenceSourceUrl: null,
    referenceIssue: null,
    ...overrides,
  };
}

describe("Best Bottles reference-lineage parsing", () => {
  it("returns unknown when no lineage tag is present", () => {
    assert.equal(getBestBottlesReferenceLineage(null), "unknown");
    assert.equal(getBestBottlesReferenceLineage([]), "unknown");
    assert.equal(getBestBottlesReferenceLineage(["brand:best-bottles", "cap-on"]), "unknown");
  });

  it("detects clean, legacy, and keeper lineage (case-insensitive)", () => {
    assert.equal(getBestBottlesReferenceLineage([BEST_BOTTLES_LINEAGE_TAG_CLEAN]), "clean");
    assert.equal(
      getBestBottlesReferenceLineage(["reference-lineage:flattened-single-source"]),
      "clean",
    );
    assert.equal(getBestBottlesReferenceLineage(["REFERENCE-LINEAGE:LEGACY"]), "legacy");
    assert.equal(
      getBestBottlesReferenceLineage(["brand:best-bottles", "keeper-backfill-2026-06-12"]),
      "keeper",
    );
  });

  it("lets clean win over legacy and keeper", () => {
    assert.equal(
      getBestBottlesReferenceLineage([
        "keeper-backfill-2026-06-12",
        BEST_BOTTLES_LINEAGE_TAG_LEGACY,
        BEST_BOTTLES_LINEAGE_TAG_CLEAN,
      ]),
      "clean",
    );
    // legacy beats a stray keeper tag when no clean tag is present
    assert.equal(
      getBestBottlesReferenceLineage([
        "keeper-backfill-2026-06-12",
        BEST_BOTTLES_LINEAGE_TAG_LEGACY,
      ]),
      "legacy",
    );
  });

  it("isBestBottlesCleanLineage is true only for clean lineage", () => {
    assert.equal(isBestBottlesCleanLineage([BEST_BOTTLES_LINEAGE_TAG_CLEAN]), true);
    assert.equal(isBestBottlesCleanLineage([BEST_BOTTLES_LINEAGE_TAG_LEGACY]), false);
    assert.equal(isBestBottlesCleanLineage(["keeper-backfill-2026-06-12"]), false);
    assert.equal(isBestBottlesCleanLineage([]), false);
  });
});

describe("Best Bottles approval-status parsing", () => {
  it("returns null when no status:* decision tag is present", () => {
    assert.equal(getBestBottlesApprovalStatus(null), null);
    assert.equal(getBestBottlesApprovalStatus([]), null);
    assert.equal(getBestBottlesApprovalStatus(["brand:best-bottles", "cap-on"]), null);
  });

  it("reads each decision tag, case-insensitively", () => {
    assert.equal(
      getBestBottlesApprovalStatus([BEST_BOTTLES_STATUS_TAG_APPROVED_KEEP]),
      "approved-keep",
    );
    assert.equal(
      getBestBottlesApprovalStatus(["STATUS:NEEDS-REGEN"]),
      "needs-regen",
    );
    assert.equal(
      getBestBottlesApprovalStatus([BEST_BOTTLES_STATUS_TAG_UNREVIEWED]),
      "unreviewed",
    );
  });

  it("lets approved-keep win, then needs-regen over unreviewed", () => {
    assert.equal(
      getBestBottlesApprovalStatus([
        BEST_BOTTLES_STATUS_TAG_UNREVIEWED,
        BEST_BOTTLES_STATUS_TAG_NEEDS_REGEN,
        BEST_BOTTLES_STATUS_TAG_APPROVED_KEEP,
      ]),
      "approved-keep",
    );
    assert.equal(
      getBestBottlesApprovalStatus([
        BEST_BOTTLES_STATUS_TAG_UNREVIEWED,
        BEST_BOTTLES_STATUS_TAG_NEEDS_REGEN,
      ]),
      "needs-regen",
    );
  });
});

describe("Best Bottles SKU image coverage next action", () => {
  it("counts linked generated or approved image evidence without inventing it from destinations", () => {
    assert.equal(
      hasSkuJobGeneratedOrApprovedImage(job({ generatedImageId: "generated-image-id" })),
      true,
    );
    assert.equal(
      hasSkuJobGeneratedOrApprovedImage(job({ approvedImageUrl: "https://madison.example/approved.png" })),
      true,
    );
    assert.equal(
      hasSkuJobGeneratedOrApprovedImage(
        job({
          status: "synced",
          shopifyImageUrl: "https://cdn.shopify.com/live.png",
          convexSyncedAt: "2026-07-23T00:00:00.000Z",
        }),
      ),
      false,
    );
  });

  it("counts explicit Shopify destination evidence independently of generation evidence", () => {
    assert.equal(hasSkuJobShopifyDestination(job({ shopifyMediaId: "gid://shopify/MediaImage/1" })), true);
    assert.equal(hasSkuJobShopifyDestination(job({ shopifyImageUrl: "https://cdn.shopify.com/live.png" })), true);
    assert.equal(hasSkuJobShopifyDestination(job({ shopifyPushedAt: "2026-07-23T00:00:00.000Z" })), true);
    assert.equal(hasSkuJobShopifyDestination(job({ status: "shopify-pushed" })), true);
    assert.equal(hasSkuJobShopifyDestination(job({ status: "synced" })), true);
    assert.equal(hasSkuJobShopifyDestination(job({ generatedImageId: "generated-image-id" })), false);
  });

  it("only treats approved-keep jobs as complete and hides them from Needs Work", () => {
    const approvedKeep = job({
      status: "synced",
      shopifyPushedAt: "2026-06-01T00:00:00.000Z",
      convexSyncedAt: "2026-06-01T00:00:00.000Z",
      libraryTags: ["brand:best-bottles", BEST_BOTTLES_STATUS_TAG_APPROVED_KEEP],
    });

    assert.equal(isSkuJobComplete(approvedKeep), true);
    assert.equal(getSkuJobNextAction(approvedKeep), "complete");
    assert.equal(shouldShowInNeedsWork(approvedKeep), false);
  });

  it("does NOT count a Convex-synced job as complete without an approved-keep verdict", () => {
    const syncedButUntriaged = job({
      status: "synced",
      shopifyPushedAt: "2026-06-01T00:00:00.000Z",
      convexSyncedAt: "2026-06-01T00:00:00.000Z",
    });

    // "has any image" / Convex sync no longer means done — it returns to review.
    assert.equal(isSkuJobComplete(syncedButUntriaged), false);
    assert.equal(getSkuJobNextAction(syncedButUntriaged), "review-generated");
    assert.equal(shouldShowInNeedsWork(syncedButUntriaged), true);
  });

  it("routes an explicit needs-regen verdict back into the backlog", () => {
    const needsRegenWithReference = job({
      status: "ready-to-generate",
      bestReferenceCandidatePath: "https://madison.example/storage/reference.png",
      coverageStatus: "covered_canonical",
      approvalStatus: "needs-regen",
    });
    assert.equal(getSkuJobNextAction(needsRegenWithReference), "generate-image");

    const needsRegenNoReference = job({
      status: "synced",
      convexSyncedAt: "2026-06-01T00:00:00.000Z",
      libraryTags: [BEST_BOTTLES_STATUS_TAG_NEEDS_REGEN],
    });
    assert.equal(getSkuJobNextAction(needsRegenNoReference), "review-generated");
  });

  it("accepts an explicit approvalStatus field over library tags", () => {
    const approved = job({ status: "approved", approvalStatus: "approved-keep" });
    assert.equal(hasSkuJobApprovedKeep(approved), true);
    assert.equal(getSkuJobNextAction(approved), "complete");
  });

  it("separates destination work after approval and Shopify push", () => {
    assert.equal(
      getSkuJobNextAction(job({ status: "approved", approvedImageUrl: "https://cdn.example/sku.png" })),
      "push-to-shopify",
    );
    assert.equal(
      getSkuJobNextAction(
        job({
          status: "shopify-pushed",
          shopifyPushedAt: "2026-06-01T00:00:00.000Z",
          shopifyImageUrl: "https://cdn.shopify.com/sku.png",
        }),
      ),
      "sync-convex",
    );
  });

  it("turns reference candidates into actionable import/source stages", () => {
    assert.equal(
      getSkuJobNextAction(
        job({
          referenceSource: "local-legacy",
          referenceSourcePath: "/tmp/GB-BSR-CLR-30ML-BLK-S.gif",
          referenceIssue: "Reference format is unsupported for image edits. Use PNG, JPG, or WebP.",
        }),
      ),
      "import-local-reference",
    );

    assert.equal(
      getSkuJobNextAction(
        job({
          referenceSource: "flattened-product-truth",
          referenceSourcePath:
            "/tmp/reference-flattened/Cylinder/cylinder-9ml-swirl-17-415-finemist/GB-CYL-CLR-9ML-SPR-GLD.png",
        }),
      ),
      "import-local-reference",
    );

    assert.equal(
      getSkuJobNextAction(
        job({
          referenceSource: "bestbottles-live",
          referenceSourceUrl: "https://www.bestbottles.com/images/store/enlarged_pics/GBFoo.gif",
        }),
      ),
      "source-website-reference",
    );

    assert.equal(getSkuJobNextAction(job({ referenceSource: "none" })), "needs-source-match");
  });

  it("requires a usable reference URL before generation", () => {
    assert.equal(
      getSkuJobNextAction(
        job({
          status: "ready-to-generate",
          bestReferenceCandidatePath: "https://madison.example/storage/reference.png",
          coverageStatus: "covered_canonical",
        }),
      ),
      "generate-image",
    );

    assert.equal(
      getSkuJobNextAction(
        job({
          status: "ready-to-generate",
          bestReferenceCandidatePath: "pipeline/madison-hero-sync/renders/foo.gif",
          coverageStatus: "covered_canonical",
        }),
      ),
      "import-local-reference",
    );

    assert.equal(
      getSkuJobNextAction(
        job({
          status: "ready-to-generate",
          bestReferenceCandidatePath: "https://www.bestbottles.com/images/store/enlarged_pics/foo.gif",
          coverageStatus: "covered_canonical",
        }),
      ),
      "source-website-reference",
    );
  });
});

describe("Best Bottles product-group workflow summary", () => {
  it("makes generated SKU jobs visible before Shopify push", () => {
    const summary = buildBestBottlesGroupWorkflowSummary([
      {
        status: "generated",
        generatedImageUrl: "https://madison.example/aluminum.png",
      },
    ]);

    assert.equal(summary.generatedOrReview, 1);
    assert.equal(summary.nextAction, "review-generated");
    assert.equal(summary.nextActionLabel, "Review generated");
    assert.equal(summary.stateLabel, "Generated");
  });

  it("surfaces approved SKU jobs as push ready", () => {
    const summary = buildBestBottlesGroupWorkflowSummary([
      {
        status: "approved",
        approvedImageUrl: "https://madison.example/aluminum-approved.png",
      },
    ]);

    assert.equal(summary.approvedPendingPush, 1);
    assert.equal(summary.nextAction, "push-to-shopify");
    assert.equal(summary.nextActionLabel, "Push ready");
    assert.equal(summary.canPushReady, true);
    assert.equal(summary.stateLabel, "Push ready");
  });

  it("separates Shopify pushed rows from Convex synced rows", () => {
    const summary = buildBestBottlesGroupWorkflowSummary([
      {
        status: "shopify-pushed",
        shopifyPushedAt: "2026-06-16T00:00:00.000Z",
        shopifyImageUrl: "https://cdn.shopify.com/aluminum.png",
      },
      {
        status: "synced",
        shopifyPushedAt: "2026-06-16T00:00:00.000Z",
        convexSyncedAt: "2026-06-16T00:05:00.000Z",
      },
    ]);

    assert.equal(summary.shopifyPushed, 2);
    assert.equal(summary.convexSynced, 1);
    assert.equal(summary.nextAction, "sync-convex");
    assert.equal(summary.nextActionLabel, "Sync Convex");
    assert.equal(summary.stateLabel, "Shopify pushed");
  });
});

describe("Best Bottles bulk create preflight", () => {
  it("separates queueable generation from reference intake and downstream work", () => {
    const summary = summarizeBulkCreateSelection([
      { id: "local", action: "import-local-reference", persisted: true },
      { id: "website", action: "source-website-reference", persisted: true },
      {
        id: "ready",
        action: "generate-image",
        persisted: true,
        status: "ready-to-generate",
        family: "Bell",
        productGroupSlug: "bell-10ml-clear-13-415-finemist",
        productGroupDisplayName: "10 ml Clear Bell Fine Mist Spray Bottle",
      },
      { id: "queued", action: "generate-image", persisted: true, status: "queued" },
      { id: "report-only-ready", action: "generate-image", persisted: false },
      { id: "review", action: "review-generated", persisted: true },
      { id: "push", action: "push-to-shopify", persisted: true },
      { id: "sync", action: "sync-convex", persisted: true },
      { id: "blocked", action: "needs-source-match", persisted: true },
    ]);

    assert.equal(summary.total, 9);
    assert.equal(summary.referenceIntakeTotal, 2);
    assert.equal(summary.queueableGenerateReady, 1);
    assert.equal(summary.alreadyQueuedOrGenerating, 1);
    assert.equal(summary.reportOnlyGenerateReady, 1);
    assert.equal(summary.downstreamTotal, 3);
    assert.equal(summary.blocked, 1);
    assert.equal(summary.canQueueGeneration, true);
    assert.equal(summary.actionCounts["import-local-reference"], 1);
    assert.equal(summary.actionCounts["source-website-reference"], 1);
    assert.equal(summary.actionCounts["generate-image"], 3);
    assert.equal(summary.actionCounts["review-generated"], 1);
    assert.equal(summary.actionCounts["push-to-shopify"], 1);
    assert.equal(summary.actionCounts["sync-convex"], 1);
    assert.equal(summary.actionCounts["needs-source-match"], 1);
    assert.deepEqual(summary.queueableStudioDestinations, [
      {
        family: "Bell",
        productGroupSlug: "bell-10ml-clear-13-415-finemist",
        productGroupDisplayName: "10 ml Clear Bell Fine Mist Spray Bottle",
        count: 1,
      },
    ]);
  });

  it("groups queueable generation rows by Studio destination", () => {
    const summary = summarizeBulkCreateSelection([
      {
        id: "spray-black",
        action: "generate-image",
        persisted: true,
        status: "ready-to-generate",
        family: "Bell",
        productGroupSlug: "bell-10ml-clear-13-415-finemist",
        productGroupDisplayName: "10 ml Clear Bell Fine Mist Spray Bottle",
      },
      {
        id: "spray-gold",
        action: "generate-image",
        persisted: true,
        status: "ready-to-generate",
        family: "Bell",
        productGroupSlug: "bell-10ml-clear-13-415-finemist",
        productGroupDisplayName: "10 ml Clear Bell Fine Mist Spray Bottle",
      },
      {
        id: "roll-on",
        action: "generate-image",
        persisted: true,
        status: "ready-to-generate",
        family: "Bell",
        productGroupSlug: "bell-10ml-clear-13-415-rollon",
        productGroupDisplayName: "10 ml Clear Bell Roll-On Bottle",
      },
      {
        id: "already-queued",
        action: "generate-image",
        persisted: true,
        status: "queued",
        family: "Bell",
        productGroupSlug: "bell-10ml-clear-13-415-finemist",
        productGroupDisplayName: "10 ml Clear Bell Fine Mist Spray Bottle",
      },
    ]);

    assert.equal(summary.queueableGenerateReady, 3);
    assert.deepEqual(summary.queueableStudioDestinations, [
      {
        family: "Bell",
        productGroupSlug: "bell-10ml-clear-13-415-finemist",
        productGroupDisplayName: "10 ml Clear Bell Fine Mist Spray Bottle",
        count: 2,
      },
      {
        family: "Bell",
        productGroupSlug: "bell-10ml-clear-13-415-rollon",
        productGroupDisplayName: "10 ml Clear Bell Roll-On Bottle",
        count: 1,
      },
    ]);
  });

  it("keeps Studio destinations available for queued and generating rows", () => {
    const summary = summarizeBulkCreateSelection([
      {
        id: "queued-black",
        action: "generate-image",
        persisted: true,
        status: "queued",
        family: "Boston Round",
        productGroupSlug: "boston-round-15ml-amber-18-400",
        productGroupDisplayName: "15 ml Amber Boston Round Bottle",
      },
      {
        id: "generating-white",
        action: "generate-image",
        persisted: true,
        status: "generating",
        family: "Boston Round",
        productGroupSlug: "boston-round-30ml-clear-20-400",
        productGroupDisplayName: "30 ml Clear Boston Round Bottle",
      },
      {
        id: "ready-clear",
        action: "generate-image",
        persisted: true,
        status: "ready-to-generate",
        family: "Boston Round",
        productGroupSlug: "boston-round-30ml-clear-20-400",
        productGroupDisplayName: "30 ml Clear Boston Round Bottle",
      },
    ]);

    assert.equal(summary.queueableGenerateReady, 1);
    assert.equal(summary.alreadyQueuedOrGenerating, 2);
    assert.deepEqual(summary.queueableStudioDestinations, [
      {
        family: "Boston Round",
        productGroupSlug: "boston-round-30ml-clear-20-400",
        productGroupDisplayName: "30 ml Clear Boston Round Bottle",
        count: 1,
      },
    ]);
    assert.deepEqual(summary.creationLaneStudioDestinations, [
      {
        family: "Boston Round",
        productGroupSlug: "boston-round-30ml-clear-20-400",
        productGroupDisplayName: "30 ml Clear Boston Round Bottle",
        count: 2,
      },
      {
        family: "Boston Round",
        productGroupSlug: "boston-round-15ml-amber-18-400",
        productGroupDisplayName: "15 ml Amber Boston Round Bottle",
        count: 1,
      },
    ]);
  });

  it("keeps an empty selection inert", () => {
    const summary = summarizeBulkCreateSelection([]);

    assert.equal(summary.total, 0);
    assert.equal(summary.referenceIntakeTotal, 0);
    assert.equal(summary.queueableGenerateReady, 0);
    assert.equal(summary.alreadyQueuedOrGenerating, 0);
    assert.equal(summary.reportOnlyGenerateReady, 0);
    assert.equal(summary.downstreamTotal, 0);
    assert.equal(summary.blocked, 0);
    assert.equal(summary.canQueueGeneration, false);
    assert.deepEqual(summary.queueableStudioDestinations, []);
    assert.deepEqual(summary.creationLaneStudioDestinations, []);
  });

  it("converts just-queued ready rows into a Studio handoff batch", () => {
    const rows = buildBulkCreateQueuedHandoffRows([
      {
        id: "ready-black",
        action: "generate-image",
        persisted: true,
        status: "ready-to-generate",
        family: "Circle",
        productGroupSlug: "circle-100ml-clear-18-415-finemist",
        productGroupDisplayName: "100 ml Clear Circle Bottle",
      },
      {
        id: "local-ref",
        action: "import-local-reference",
        persisted: true,
        family: "Circle",
        productGroupSlug: "circle-100ml-clear-18-415-finemist",
        productGroupDisplayName: "100 ml Clear Circle Bottle",
      },
    ]);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "queued");
    assert.equal(rows[0].action, "generate-image");

    const summary = summarizeBulkCreateSelection(rows);
    assert.equal(summary.queueableGenerateReady, 0);
    assert.equal(summary.alreadyQueuedOrGenerating, 1);
    assert.deepEqual(summary.creationLaneStudioDestinations, [
      {
        family: "Circle",
        productGroupSlug: "circle-100ml-clear-18-415-finemist",
        productGroupDisplayName: "100 ml Clear Circle Bottle",
        count: 1,
      },
    ]);
  });
});

describe("Best Bottles bulk create batch selection", () => {
  it("selects the next 50 persisted ready-to-generate rows in visible order", () => {
    const rows = Array.from({ length: 60 }, (_, index) => ({
      id: `ready-${index}`,
      action: "generate-image" as const,
      persisted: true,
      status: "ready-to-generate",
      productGroupSlug: index < 30 ? "sleek-5ml-clear-13-415-rollon" : "slim-9ml-clear-13-415-spray",
    }));

    const selected = selectBulkCreateBatchRows(rows, 50);

    assert.equal(selected.length, 50);
    assert.equal(selected[0]?.id, "ready-0");
    assert.equal(selected[49]?.id, "ready-49");
  });

  it("excludes queued, generating, report-only, and downstream rows from generation batches", () => {
    const selected = selectBulkCreateBatchRows(
      [
        { id: "ready", action: "generate-image", persisted: true, status: "ready-to-generate" },
        { id: "queued", action: "generate-image", persisted: true, status: "queued" },
        { id: "generating", action: "generate-image", persisted: true, status: "generating" },
        { id: "report-only", action: "generate-image", persisted: false, status: "ready-to-generate" },
        { id: "push", action: "push-to-shopify", persisted: true, status: "approved" },
      ],
      100,
    );

    assert.deepEqual(
      selected.map((row) => row.id),
      ["ready"],
    );
  });

  it("caps a 100-image batch at 100 rows", () => {
    const rows = Array.from({ length: 125 }, (_, index) => ({
      id: `ready-${index}`,
      action: "generate-image" as const,
      persisted: true,
      status: "ready-to-generate",
    }));

    const selected = selectBulkCreateBatchRows(rows, 100);

    assert.equal(selected.length, 100);
    assert.equal(selected.at(-1)?.id, "ready-99");
  });
});
