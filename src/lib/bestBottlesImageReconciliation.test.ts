import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getBestBottlesImageAssetRoleForPreset,
  requiresBestBottlesPipelineReconciliation,
} from "./bestBottlesImageReconciliationRules";
import {
  approveBestBottlesReconciledImage,
  buildBestBottlesRawReconciliationPayload,
  buildBestBottlesRigReconciliationPayload,
  isBestBottlesCylinderApprovalEvidenceReady,
  meetsBestBottlesCylinderStrictShadowEvidence,
} from "./bestBottlesImageReconciliation";
import { approveBestBottlesGeneratedMaster } from "./bestBottlesMasterApproval";
import type { BestBottlesCatalogTruthSnapshot } from "./bestBottlesImageReconciliationRules";
import type { ShadowQaReport } from "./product-image/shadowQa";

const currentDir = dirname(fileURLToPath(import.meta.url));
const studioSource = readFileSync(resolve(currentDir, "../pages/BestBottlesStudio.tsx"), "utf8");
const pipelineSource = readFileSync(
  resolve(currentDir, "../pages/BestBottlesPipeline.tsx"),
  "utf8",
);
const foundationMigrationSource = readFileSync(
  resolve(
    currentDir,
    "../../supabase/migrations/20260710090000_best_bottles_image_reconciliation.sql",
  ),
  "utf8",
);
const modelShadowMigrationSource = readFileSync(
  resolve(
    currentDir,
    "../../supabase/migrations/20260712001000_best_bottles_model_shadow_evidence.sql",
  ),
  "utf8",
);
const shadowExceptionMigrationSource = readFileSync(
  resolve(
    currentDir,
    "../../supabase/migrations/20260713002000_best_bottles_shadow_review_exceptions.sql",
  ),
  "utf8",
);
const shoulderLandmarkMigrationSource = readFileSync(
  resolve(
    currentDir,
    "../../supabase/migrations/20260918103000_best_bottles_shoulder_landmark_evidence.sql",
  ),
  "utf8",
);
const reconciliationSqlTestSource = readFileSync(
  resolve(currentDir, "../../supabase/tests/best_bottles_image_reconciliation.sql"),
  "utf8",
);

function shadowQa(status: "pass" | "review"): ShadowQaReport {
  return {
    status,
    failures: [],
    warnings: [],
    contacts: [
      {
        contact: "bottle",
        status,
        bounds: { left: 10, right: 50, top: 10, bottom: 100 },
        measurements: {
          contactGapPx: 0,
          contactCoreDensity: 0.36,
          rightExtensionPx: 18,
          rightExtensionRatio: 0.28,
          leftExtensionPx: 2,
          verticalDepthPx: 8,
          componentCount: 1,
          shadowPixelCount: 120,
        },
        failures: [],
        warnings: [],
      },
    ],
    measurements: {
      contactGapPx: 0,
      contactCoreDensity: 0.36,
      rightExtensionPx: 18,
      rightExtensionRatio: 0.28,
      leftExtensionPx: 2,
      verticalDepthPx: 8,
      componentCount: 1,
      shadowPixelCount: 120,
    },
    target: {
      maxContactGapPx: 2,
      rightExtensionRatio: { min: 0.2, max: 0.3 },
      contract: "contact-back-right-v1",
    },
  };
}

describe("Best Bottles image reconciliation asset roles", () => {
  it("requires reconciliation for canonical PDP presets", () => {
    const role = getBestBottlesImageAssetRoleForPreset("grid-card-2000x2200");
    assert.equal(role, "pdp-primary");
    assert.equal(requiresBestBottlesPipelineReconciliation(role), true);
  });

  it("treats the cap-off sidecar grid card as a catalog hero on the exact-SKU path", () => {
    // The Cylinder hero set is sidecar composition; classifying it as
    // secondary set requires_pipeline_reconciliation=false and made every
    // sidecar hero unapprovable in replace_best_bottles_sku_job_hero.
    const role = getBestBottlesImageAssetRoleForPreset("grid-card-exploded-2000x2200");
    assert.equal(role, "pdp-primary");
    assert.equal(requiresBestBottlesPipelineReconciliation(role), true);
  });

  it("keeps angle outputs as tracked secondary Library assets", () => {
    assert.equal(
      getBestBottlesImageAssetRoleForPreset("master-angle-2080x2288"),
      "pdp-secondary",
    );
    assert.equal(requiresBestBottlesPipelineReconciliation("pdp-secondary"), false);
  });

  it("keeps scene and marketing outputs out of the PDP exception queue", () => {
    assert.equal(
      getBestBottlesImageAssetRoleForPreset("master-scene-flexible-2000x2200"),
      "scene",
    );
    assert.equal(
      getBestBottlesImageAssetRoleForPreset("master-marketing-2080x2288"),
      "marketing",
    );
    assert.equal(requiresBestBottlesPipelineReconciliation("scene"), false);
    assert.equal(requiresBestBottlesPipelineReconciliation("marketing"), false);
  });
});

describe("Best Bottles generated master approval", () => {
  it("never blocks approval on shadow evidence (advisory policy, Jordan 2026-07-18)", () => {
    assert.equal(
      isBestBottlesCylinderApprovalEvidenceReady({ family: "Cylinder" } as never),
      true,
    );
  });

  it("scores strict canonical V6.1 shadow evidence (advisory since 2026-07-18)", () => {
    const complete = {
      family: "Cylinder",
      promptVersion: "best-bottles-reference-locked-v6.1",
      shadowOwner: "model" as const,
      shadowTopology: {
        kind: "assembled" as const,
        expectedContacts: ["bottle" as const],
        source: "reviewed-reference" as const,
      },
      shadowQa: shadowQa("pass"),
    };

    assert.equal(meetsBestBottlesCylinderStrictShadowEvidence(complete), true);
    assert.equal(
      meetsBestBottlesCylinderStrictShadowEvidence({
        ...complete,
        promptVersion: "best-bottles-reference-locked-v6.0",
      }),
      false,
    );
    assert.equal(
      meetsBestBottlesCylinderStrictShadowEvidence({
        ...complete,
        shadowOwner: "rig",
      }),
      false,
    );
    assert.equal(
      meetsBestBottlesCylinderStrictShadowEvidence({
        ...complete,
        shadowTopology: null,
      }),
      false,
    );
    const failedSidecar = shadowQa("pass");
    failedSidecar.contacts!.push({
      ...failedSidecar.contacts![0],
      contact: "sidecar",
      status: "fail",
      failures: ["missing"],
    });
    assert.equal(
      meetsBestBottlesCylinderStrictShadowEvidence({
        ...complete,
        shadowQa: failedSidecar,
      }),
      false,
    );
  });

  it("advisory scorer honors only an exact-hash, geometry-safe shadow review exception", () => {
    const report = shadowQa("review");
    report.contacts![0].status = "review";
    report.contacts![0].failures = ["right extension ratio is 0.31"];
    report.contacts![0].measurements.shadowPixelCount = 700;
    const hash = (character: string) => character.repeat(64);
    const evidence = {
      family: "Cylinder",
      promptVersion: "best-bottles-reference-locked-v6.1",
      shadowOwner: "model" as const,
      shadowTopology: {
        kind: "assembled" as const,
        expectedContacts: ["bottle" as const],
        source: "reviewed-reference" as const,
      },
      shadowQa: report,
      imageId: "image-1",
      pipelineSkuJobId: "job-1",
      finalImageHash: hash("a"),
      sourceReferenceHash: hash("b"),
      promptHash: hash("c"),
      shadowReportHash: hash("d"),
      shadowTopologyHash: hash("e"),
      geometryReady: true,
      identityReady: true,
      shadowReviewException: {
        policyVersion: "best-bottles-shadow-review-exception-v1" as const,
        status: "active" as const,
        reasonCode: "extension-ratio-boundary" as const,
        reason: "Visible contact and direction are correct; extension is just outside detector tolerance.",
        imageId: "image-1",
        pipelineSkuJobId: "job-1",
        finalImageHash: hash("a"),
        sourceReferenceHash: hash("b"),
        promptHash: hash("c"),
        shadowReportHash: hash("d"),
        shadowTopologyHash: hash("e"),
        shadowContract: "contact-back-right-v1" as const,
        shadowTopologyKind: "assembled",
        expectedContacts: ["bottle"],
        reviewerId: "reviewer-1",
        createdAt: "2026-07-13T15:00:00.000Z",
        revokedAt: null,
      },
    };

    assert.equal(meetsBestBottlesCylinderStrictShadowEvidence(evidence), true);
    assert.equal(
      meetsBestBottlesCylinderStrictShadowEvidence({
        ...evidence,
        finalImageHash: hash("f"),
      }),
      false,
    );
  });

  it("keeps database shadow exceptions append-only, hash-bound, and inside the guarded approval RPC", () => {
    assert.match(shadowExceptionMigrationSource, /final_image_hash TEXT NOT NULL/);
    assert.match(shadowExceptionMigrationSource, /source_reference_hash TEXT NOT NULL/);
    assert.match(shadowExceptionMigrationSource, /prompt_hash TEXT NOT NULL/);
    assert.match(shadowExceptionMigrationSource, /shadow_report_hash TEXT NOT NULL/);
    assert.match(shadowExceptionMigrationSource, /shadow_topology_hash TEXT NOT NULL/);
    assert.doesNotMatch(shadowExceptionMigrationSource, /FOR UPDATE\s+ON public\.best_bottles_shadow_review_exceptions/);
    assert.match(
      shadowExceptionMigrationSource,
      /OR public\.best_bottles_shadow_review_exception_passes\(/,
    );
    assert.match(shadowExceptionMigrationSource, /FOR UPDATE;/);
    assert.match(shadowExceptionMigrationSource, /v_job_generated_image_id IS DISTINCT FROM p_image_id/);
  });

  it("guards the strict approval RPC before any mutation", () => {
    const approveFunction = modelShadowMigrationSource.match(
      /CREATE OR REPLACE FUNCTION public\.approve_best_bottles_reconciled_image[\s\S]*?\$\$;/,
    )?.[0];

    assert.ok(approveFunction);
    assert.match(approveFunction, /FOR UPDATE/);
    assert.match(approveFunction, /status\s+IN\s+\('approved', 'shopify-pushed', 'synced'\)/);
    assert.match(approveFunction, /approved_image_id\s+IS NOT NULL/);
    assert.match(approveFunction, /generated_image_id\s+IS DISTINCT FROM p_image_id/);
    assert.ok(approveFunction.indexOf("FOR UPDATE") < approveFunction.indexOf("UPDATE public"));
    assert.match(reconciliationSqlTestSource, /direct-terminal-approval-preserves-state/);
    assert.match(reconciliationSqlTestSource, /approval-candidate-mismatch-preserves-state/);
  });

  it("keeps the Pipeline approval callback behind the strict helper", () => {
    const pipelineApprovalCallback = pipelineSource.match(
      /const handleUpdateSkuJobStatus[\s\S]*?\n\s{2}const handlePushApprovedSkuJobs/,
    )?.[0];

    assert.ok(pipelineApprovalCallback);
    assert.match(pipelineApprovalCallback, /await approveBestBottlesGeneratedMaster\(/);
    assert.doesNotMatch(pipelineApprovalCallback, /approved_image_id\s*:/);
    assert.doesNotMatch(pipelineApprovalCallback, /approved_image_url\s*:/);
    assert.doesNotMatch(pipelineApprovalCallback, /approved_at\s*:/);
    assert.doesNotMatch(pipelineSource, /markBestBottlesImageApprovedKeep/);
    assert.doesNotMatch(pipelineSource, /approveBestBottlesReconciledImage/);
  });

  it("protects approval columns from direct authenticated row updates", () => {
    const guardFunction = foundationMigrationSource.match(
      /CREATE OR REPLACE FUNCTION public\.protect_best_bottles_sku_job_approval_fields[\s\S]*?\$\$;/,
    )?.[0];

    assert.ok(guardFunction);
    assert.match(guardFunction, /approved_image_id\s+IS DISTINCT FROM OLD\.approved_image_id/);
    assert.match(guardFunction, /status\s+IN\s+\('approved', 'shopify-pushed', 'synced'\)/);
    assert.match(guardFunction, /current_setting\('app\.best_bottles_approval_rpc', true\)/);
    assert.match(reconciliationSqlTestSource, /direct-approval-columns-rejected/);
  });

  it("guards terminal SKU jobs before the link RPC mutates assignments or state", () => {
    const linkFunction = foundationMigrationSource.match(
      /CREATE OR REPLACE FUNCTION public\.link_best_bottles_generated_image[\s\S]*?\$\$;/,
    )?.[0];

    assert.ok(linkFunction);
    assert.match(linkFunction, /FOR UPDATE/);
    assert.match(linkFunction, /status\s+IN\s+\('approved', 'shopify-pushed', 'synced'\)/);
    assert.match(linkFunction, /approved_image_id\s+IS NOT NULL/);
    assert.ok(linkFunction.indexOf("FOR UPDATE") < linkFunction.indexOf("INSERT INTO"));
    assert.match(reconciliationSqlTestSource, /terminal-link-preserves-approved-job/);
  });

  it("makes the model-shadow is_reconciled predicate null-safe", () => {
    const isReconciledExpression = modelShadowMigrationSource.match(
      /\(\s*r\.requires_pipeline_reconciliation[\s\S]*?\) AS is_reconciled/,
    )?.[0];

    assert.ok(isReconciledExpression);
    assert.match(
      isReconciledExpression,
      /best_bottles_shadow_evidence_passes\([\s\S]*?r\.shadow_topology[\s\S]*?r\.shadow_qa/,
    );
    assert.match(reconciliationSqlTestSource, /model-shadow-null-is-reconciled-false/);
  });

  it("keeps model-shadow status pending until status and contract both pass", () => {
    assert.match(
      modelShadowMigrationSource,
      /p_shadow_qa->>'status'\s*=\s*'pass'/,
    );
    assert.match(
      modelShadowMigrationSource,
      /p_shadow_qa->'target'->>'contract'\s*=\s*'contact-back-right-v1'/,
    );
    assert.match(reconciliationSqlTestSource, /model-shadow-pass-invalid-contract/);
    assert.match(reconciliationSqlTestSource, /model-shadow-pass-missing-contract/);
  });

  it("gates Cylinder SQL approval on V6.1 topology and per-contact evidence", () => {
    assert.match(
      modelShadowMigrationSource,
      /prompt_version\s*=\s*'best-bottles-reference-locked-v6\.1'/,
    );
    assert.match(modelShadowMigrationSource, /shadow_topology\s+IS NOT NULL/);
    assert.match(
      modelShadowMigrationSource,
      /jsonb_array_length\(COALESCE\(p_shadow_qa->'contacts'/,
    );
    assert.match(
      modelShadowMigrationSource,
      /jsonb_array_length\(COALESCE\(p_shadow_topology->'expectedContacts'/,
    );
    assert.match(reconciliationSqlTestSource, /model-shadow-failing-sidecar/);
  });

  it("types explicit Grace and website SKU eligibility in catalog truth", () => {
    const eligibility: Pick<
      BestBottlesCatalogTruthSnapshot,
      "eligibleGraceSkus" | "eligibleWebsiteSkus"
    > = {
      eligibleGraceSkus: ["SKU-A", "SKU-B"],
      eligibleWebsiteSkus: ["WEB-A", "WEB-B"],
    };

    assert.deepEqual(eligibility.eligibleGraceSkus, ["SKU-A", "SKU-B"]);
    assert.deepEqual(eligibility.eligibleWebsiteSkus, ["WEB-A", "WEB-B"]);
  });

  it("keeps the Studio approval callback behind the single approval helper", () => {
    assert.match(studioSource, /await approveBestBottlesGeneratedMaster\(/);
    assert.doesNotMatch(
      studioSource,
      /import\s*\{[^}]*approveBestBottlesReconciledImage[^}]*\}\s*from\s*["']@\/lib\/bestBottlesImageReconciliation["']/s,
    );
    assert.doesNotMatch(studioSource, /markBestBottlesImageApprovedKeep/);
  });

  it("links the generated image before invoking the strict approval gate", async () => {
    const calls: string[] = [];
    const input = {
      organizationId: "org-1",
      pipelineSkuJobId: "job-1",
      imageId: "image-1",
    };

    await approveBestBottlesGeneratedMaster(input, {
      link: async (received) => {
        assert.deepEqual(received, input);
        calls.push("link");
      },
      approve: async (received) => {
        assert.deepEqual(received, input);
        calls.push("approve");
      },
    });

    assert.deepEqual(calls, ["link", "approve"]);
  });

  it("does not invoke approval when the fail-closed link rejects", async () => {
    const calls: string[] = [];

    await assert.rejects(
      approveBestBottlesGeneratedMaster(
        {
          organizationId: "org-1",
          pipelineSkuJobId: "terminal-job-1",
          imageId: "image-2",
        },
        {
          link: async () => {
            calls.push("link");
            throw new Error("Terminal SKU job cannot be relinked");
          },
          approve: async () => {
            calls.push("approve");
          },
        },
      ),
      /Terminal SKU job cannot be relinked/,
    );

    assert.deepEqual(calls, ["link"]);
  });

  it("invokes the strict approval RPC with the linked image identifiers", async () => {
    const input = {
      organizationId: "org-1",
      pipelineSkuJobId: "job-1",
      imageId: "image-1",
    };
    const rpcCalls: Array<{ name: string; args: Record<string, string> }> = [];

    await approveBestBottlesReconciledImage(input, {
      rpc: async (name, args) => {
        rpcCalls.push({ name, args });
        return { error: null };
      },
    });

    assert.deepEqual(rpcCalls, [
      {
        name: "approve_best_bottles_reconciled_image",
        args: {
          p_organization_id: "org-1",
          p_pipeline_sku_job_id: "job-1",
          p_image_id: "image-1",
        },
      },
    ]);
  });

  it("persists shoulder landmark measurements for the editor and audit trail", () => {
    const payload = buildBestBottlesRigReconciliationPayload({
      imageId: "image-shoulder",
      organizationId: "org-1",
      rawImageUrl: "https://example.invalid/raw.png",
      lifecycleState: "qa-passed",
      preTransformShoulderYPx: 881,
      detectedShoulderYPx: 652,
      targetShoulderYPx: 652,
      shoulderDeltaPct: 0,
      shoulderConfidence: 0.94,
    });

    assert.equal(payload.pre_transform_shoulder_y_px, 881);
    assert.equal(payload.detected_shoulder_y_px, 652);
    assert.equal(payload.target_shoulder_y_px, 652);
    assert.equal(payload.shoulder_delta_pct, 0);
    assert.equal(payload.shoulder_confidence, 0.94);
    assert.match(shoulderLandmarkMigrationSource, /pre_transform_shoulder_y_px double precision/i);
    assert.match(shoulderLandmarkMigrationSource, /detected_shoulder_y_px double precision/i);
    assert.match(shoulderLandmarkMigrationSource, /target_shoulder_y_px double precision/i);
    assert.match(shoulderLandmarkMigrationSource, /shoulder_delta_pct double precision/i);
    assert.match(shoulderLandmarkMigrationSource, /shoulder_confidence double precision/i);
  });

  it("persists model-owned shadow evidence in the rig reconciliation payload", () => {
    const payload = buildBestBottlesRigReconciliationPayload({
      imageId: "image-1",
      organizationId: "org-1",
      rawImageUrl: "https://example.invalid/raw.png",
      shadowOwner: "model",
      promptVersion: "best-bottles-reference-locked-v6.1",
      shadowTopology: {
        kind: "assembled",
        expectedContacts: ["bottle"],
        source: "reviewed-reference",
      },
      shadowQa: shadowQa("pass"),
      lifecycleState: "qa-passed",
    });

    assert.equal(payload.shadow_owner, "model");
    assert.deepEqual(payload.shadow_qa, shadowQa("pass"));
    assert.deepEqual(payload.shadow_topology, {
      kind: "assembled",
      expectedContacts: ["bottle"],
      source: "reviewed-reference",
    });
  });

  it("builds durable raw batch evidence from exact caller-supplied hashes", () => {
    const catalogTruth = {
      name: "9 ml Cylinder",
      graceSku: "GB-CYL-CLR-9ML-MRL-01",
      websiteSku: "WebSku",
      eligibleGraceSkus: ["GB-CYL-CLR-9ML-MRL-01"],
      eligibleWebsiteSkus: ["WebSku"],
      family: "Cylinder",
      category: "Glass Bottle",
      capacityMl: 9,
      heightWithoutCap: "70",
      heightWithCap: "96",
      diameter: "20",
      neckThreadSize: "17-415",
      applicator: "Metal Roll-On",
      capState: "assembled-cap-on",
      capColor: "Black",
      trimColor: null,
      bodyMaterial: "glass",
      color: "Clear",
      identityStatus: "ready" as const,
      identityBlockers: [],
      identityHash: "identity-hash",
      sourceReferenceUrl: "https://example.invalid/reference.png",
      sourcePageUrl: null,
      measurementSource: "best-bottles-canonical-truth-2026-07-12",
      measurementSourceUrl: null,
      measurementSourceNote: "canon_* columns",
      websiteTruthStatus: "ready" as const,
      websiteTruthIssues: [],
    };
    const payload = buildBestBottlesRawReconciliationPayload({
      imageId: "image-1",
      organizationId: "org-1",
      graceSku: "GB-CYL-CLR-9ML-MRL-01",
      websiteSku: "WebSku",
      family: "Cylinder",
      sourceReferenceUrl: "https://example.invalid/reference.png",
      sourceReferenceHash: "a".repeat(64),
      prompt: "prompt",
      promptHash: "b".repeat(64),
      promptVersion: "best-bottles-reference-locked-v6.1",
      rigVersion: "best-bottles-rig-v1",
      providerModel: "openai-image-2",
      shadowOwner: "model",
      shadowTopology: {
        kind: "assembled",
        expectedContacts: ["bottle"],
        source: "reviewed-reference",
      },
      catalogTruth,
      catalogTruthHash: "c".repeat(64),
      assetRole: "pdp-primary",
      requiresPipelineReconciliation: true,
      rawImageUrl: "https://example.invalid/raw.png",
      canvasWidthPx: 2080,
      canvasHeightPx: 2288,
      now: "2026-07-13T00:00:00.000Z",
    });

    assert.equal(payload.source_reference_hash, "a".repeat(64));
    assert.equal(payload.prompt_hash, "b".repeat(64));
    assert.equal(payload.catalog_truth_hash, "c".repeat(64));
    assert.equal(payload.canvas_width_px, 2080);
    assert.equal(payload.canvas_height_px, 2288);
    assert.equal(payload.lifecycle_state, "rigging");
    assert.deepEqual(payload.catalog_truth, catalogTruth);
    assert.equal(payload.updated_at, "2026-07-13T00:00:00.000Z");
  });
});
