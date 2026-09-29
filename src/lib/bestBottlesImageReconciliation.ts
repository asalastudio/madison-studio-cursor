import type { SupabaseClient } from "@supabase/supabase-js";
import type { FramingDecision, FramingQaReport } from "@/lib/product-image/framingQa";
import type { RigStrongBounds } from "@/lib/product-image/rigPostprocess";
import type { ShadowQaReport } from "@/lib/product-image/shadowQa";
import type { BestBottlesShadowOwner } from "@/lib/bestBottlesShadowPolicy";
import type { BestBottlesShadowTopology } from "@/lib/bestBottlesShadowTopology";
import {
  isBestBottlesShadowReviewExceptionValid,
  type BestBottlesShadowReviewException,
} from "@/lib/bestBottlesShadowReviewException";
import type {
  BestBottlesCatalogTruthSnapshot,
  BestBottlesImageAssetRole,
} from "@/lib/bestBottlesImageReconciliationRules";

export {
  getBestBottlesImageAssetRoleForPreset,
  requiresBestBottlesPipelineReconciliation,
  type BestBottlesCatalogTruthSnapshot,
  type BestBottlesImageAssetRole,
} from "@/lib/bestBottlesImageReconciliationRules";

export const BEST_BOTTLES_RECONCILIATION_QUERY_KEY = "best-bottles-image-reconciliation-status";

export type BestBottlesImageLifecycleState =
  | "raw-generated"
  | "rigging"
  | "qa-passed"
  | "qa-failed"
  | "review-pending"
  | "approved"
  | "published"
  | "reconciled"
  | "failed";

export type BestBottlesReconciliationStatus =
  | "library-only"
  | "qa-failed"
  | "truth-missing"
  | "truth-conflict"
  | "measurement-missing"
  | "rig-pending"
  | "unlinked"
  | "pipeline-image-mismatch"
  | "approval-divergence"
  | "review-pending"
  | "approved-pending-shopify"
  | "shopify-verification-pending"
  | "shopify-pending-convex"
  | "convex-verification-pending"
  | "destination-mismatch"
  | "reconciled";

export interface BestBottlesSkuImageAssignmentStatus {
  assignmentId: string;
  skuJobId: string;
  graceSku: string | null;
  websiteSku: string | null;
  decision: "unreviewed" | "approved-keep" | "needs-regen" | "superseded";
  linkSource: "generation" | "exact-sku-tag-backfill" | "manual" | "shopify-existing";
  expectedImageUrl: string | null;
  skuJobStatus: string;
  generatedImageId: string | null;
  approvedImageId: string | null;
  shopifyPushedAt: string | null;
  convexSyncedAt: string | null;
  shopifyVerificationState: "pending" | "matched" | "mismatch" | "error";
  shopifyVerifiedImageUrl: string | null;
  shopifyVerifiedImageHash: string | null;
  shopifyVerifiedAt: string | null;
  shopifyVerificationError: string | null;
  convexVerificationState: "pending" | "matched" | "mismatch" | "error";
  convexVerifiedImageUrl: string | null;
  convexVerifiedImageHash: string | null;
  convexVerifiedAt: string | null;
  convexVerificationError: string | null;
  linkedAt: string;
  reviewedAt: string | null;
}

export interface BestBottlesImageReconciliationStatusRow {
  image_id: string;
  organization_id: string;
  grace_sku: string | null;
  website_sku: string | null;
  family: string | null;
  source_reference_url: string | null;
  source_reference_hash: string | null;
  prompt_hash: string | null;
  prompt_version: string | null;
  rig_version: string | null;
  provider_model: string | null;
  shadow_owner: BestBottlesShadowOwner;
  shadow_qa: ShadowQaReport | null;
  shadow_topology: BestBottlesShadowTopology | null;
  asset_role: BestBottlesImageAssetRole;
  requires_pipeline_reconciliation: boolean;
  raw_image_url: string;
  final_image_url: string | null;
  final_image_hash: string | null;
  shadow_report_hash: string | null;
  shadow_topology_hash: string | null;
  canvas_width_px: number | null;
  canvas_height_px: number | null;
  pre_transform_baseline_y_px: number | null;
  detected_baseline_y_px: number | null;
  target_baseline_y_px: number | null;
  baseline_delta_px: number | null;
  pre_transform_shoulder_y_px: number | null;
  detected_shoulder_y_px: number | null;
  target_shoulder_y_px: number | null;
  shoulder_delta_pct: number | null;
  shoulder_confidence: number | null;
  fill_height_pct: number | null;
  center_x_pct: number | null;
  target_center_x_pct: number | null;
  center_delta_pct: number | null;
  shift_x_px: number | null;
  shift_y_px: number | null;
  scale_factor: number | null;
  mask_controlled: boolean;
  pre_transform_object_bounds: RigStrongBounds | null;
  transform_control_bounds: RigStrongBounds | null;
  object_bounds: RigStrongBounds | null;
  catalog_truth: BestBottlesCatalogTruthSnapshot | null;
  catalog_truth_hash: string | null;
  framing_qa: FramingQaReport | null;
  qa_issues: string[];
  framing_decision: FramingDecision | null;
  lifecycle_state: BestBottlesImageLifecycleState;
  last_error: string | null;
  rigged_at: string | null;
  qa_completed_at: string | null;
  reconciled_at: string | null;
  created_at: string;
  updated_at: string;
  assignment_count: number;
  assignments: BestBottlesSkuImageAssignmentStatus[];
  all_pipeline_images_match: boolean;
  all_assignments_approved: boolean;
  any_assignment_approved: boolean;
  all_shopify_writes_recorded: boolean;
  all_shopify_verified: boolean;
  all_convex_writes_recorded: boolean;
  all_convex_verified: boolean;
  any_destination_mismatch: boolean;
  library_approved: boolean;
  reconciliation_status: BestBottlesReconciliationStatus;
  is_reconciled: boolean;
}

export interface RecordBestBottlesRawImageInput {
  imageId: string;
  organizationId: string;
  graceSku?: string | null;
  websiteSku?: string | null;
  family?: string | null;
  sourceReferenceUrl?: string | null;
  sourceReferenceHash?: string | null;
  prompt?: string | null;
  promptHash?: string | null;
  promptVersion?: string | null;
  rigVersion?: string | null;
  providerModel?: string | null;
  shadowOwner?: BestBottlesShadowOwner;
  shadowQa?: ShadowQaReport | null;
  shadowTopology?: BestBottlesShadowTopology | null;
  catalogTruth?: BestBottlesCatalogTruthSnapshot | null;
  catalogTruthHash?: string | null;
  assetRole?: BestBottlesImageAssetRole;
  requiresPipelineReconciliation?: boolean;
  rawImageUrl: string;
  canvasWidthPx?: number | null;
  canvasHeightPx?: number | null;
  now?: string;
}

export interface RecordBestBottlesRigResultInput extends RecordBestBottlesRawImageInput {
  finalImageUrl?: string | null;
  preTransformBaselineYPx?: number | null;
  detectedBaselineYPx?: number | null;
  targetBaselineYPx?: number | null;
  preTransformShoulderYPx?: number | null;
  detectedShoulderYPx?: number | null;
  targetShoulderYPx?: number | null;
  shoulderDeltaPct?: number | null;
  shoulderConfidence?: number | null;
  fillHeightPct?: number | null;
  centerXPct?: number | null;
  targetCenterXPct?: number | null;
  centerDeltaPct?: number | null;
  shiftXPx?: number | null;
  shiftYPx?: number | null;
  scaleFactor?: number | null;
  maskControlled?: boolean;
  preTransformObjectBounds?: RigStrongBounds | null;
  transformControlBounds?: RigStrongBounds | null;
  objectBounds?: RigStrongBounds | null;
  framingQa?: FramingQaReport | null;
  qaIssues?: string[];
  framingDecision?: FramingDecision | null;
  lifecycleState: "qa-passed" | "qa-failed" | "review-pending" | "failed";
  lastError?: string | null;
}

type ReconciliationWrite = Record<string, unknown>;

export interface BestBottlesApprovalEvidence {
  family?: string | null;
  promptVersion?: string | null;
  shadowOwner?: BestBottlesShadowOwner | null;
  shadowTopology?: BestBottlesShadowTopology | null;
  shadowQa?: ShadowQaReport | null;
  imageId?: string | null;
  pipelineSkuJobId?: string | null;
  finalImageHash?: string | null;
  sourceReferenceHash?: string | null;
  promptHash?: string | null;
  shadowReportHash?: string | null;
  shadowTopologyHash?: string | null;
  geometryReady?: boolean;
  identityReady?: boolean;
  shadowReviewException?: BestBottlesShadowReviewException | null;
}

/**
 * Shadow policy 2026-07-18 (Jordan): shadow QA is ADVISORY, never blocking.
 * Human review sees the shadow in the image itself; an imperfect shadow ships
 * and is retaken later rather than stopping the Shopify push. Shadow QA and
 * topology verdicts are still recorded for retake triage, and the strict
 * evaluator below remains available as the advisory scorer.
 */
export function isBestBottlesCylinderApprovalEvidenceReady(
  _evidence: BestBottlesApprovalEvidence,
): boolean {
  return true;
}

/** Strict shadow evaluation, now advisory-only (see policy note above). */
export function meetsBestBottlesCylinderStrictShadowEvidence(
  evidence: BestBottlesApprovalEvidence,
): boolean {
  const family = String(evidence.family ?? "").trim().toLowerCase();
  if (family !== "cylinder" && family !== "tall cylinder") return true;
  const contacts = evidence.shadowQa?.contacts ?? [];
  const hasStrictEvidence =
    evidence.promptVersion === "best-bottles-reference-locked-v6.1" &&
    evidence.shadowOwner === "model" &&
    Boolean(evidence.shadowTopology) &&
    evidence.shadowQa?.status === "pass" &&
    evidence.shadowQa.target.contract === "contact-back-right-v1" &&
    contacts.length > 0 &&
    contacts.every((contact) => contact.status === "pass") &&
    evidence.shadowTopology!.expectedContacts.every((expected) =>
      contacts.some((contact) => contact.contact === expected && contact.status === "pass"),
    );
  if (hasStrictEvidence) return true;

  if (
    evidence.promptVersion !== "best-bottles-reference-locked-v6.1" ||
    evidence.shadowOwner !== "model" ||
    !evidence.shadowTopology ||
    !evidence.shadowQa ||
    !evidence.imageId ||
    !evidence.pipelineSkuJobId ||
    !evidence.finalImageHash ||
    !evidence.sourceReferenceHash ||
    !evidence.promptHash ||
    !evidence.shadowReportHash ||
    !evidence.shadowTopologyHash
  ) {
    return false;
  }

  return isBestBottlesShadowReviewExceptionValid(evidence.shadowReviewException, {
    imageId: evidence.imageId,
    pipelineSkuJobId: evidence.pipelineSkuJobId,
    finalImageHash: evidence.finalImageHash,
    sourceReferenceHash: evidence.sourceReferenceHash,
    promptHash: evidence.promptHash,
    shadowReportHash: evidence.shadowReportHash,
    shadowTopologyHash: evidence.shadowTopologyHash,
    geometryReady: evidence.geometryReady === true,
    identityReady: evidence.identityReady === true,
    shadowTopology: {
      kind: evidence.shadowTopology.kind,
      expectedContacts: evidence.shadowTopology.expectedContacts,
    },
    shadowQa: {
      status: evidence.shadowQa.status,
      contract: evidence.shadowQa.target.contract,
      contacts: (evidence.shadowQa.contacts ?? []).map((contact) => ({
        contact: contact.contact,
        status: contact.status,
        bounds: contact.bounds,
        shadowPixelCount: contact.measurements.shadowPixelCount,
        failures: contact.failures,
      })),
    },
  });
}

/**
 * Build the durable rig evidence payload shared by successful and failed
 * rig writes. Hash fields are added by the async recorder after this
 * synchronous shape is assembled.
 */
export function buildBestBottlesRigReconciliationPayload(
  input: RecordBestBottlesRigResultInput,
): ReconciliationWrite {
  const now = new Date().toISOString();
  return {
    image_id: input.imageId,
    organization_id: input.organizationId,
    grace_sku: cleanNullable(input.graceSku),
    website_sku: cleanNullable(input.websiteSku),
    family: cleanNullable(input.family),
    source_reference_url: cleanNullable(input.sourceReferenceUrl),
    prompt_version: cleanNullable(input.promptVersion),
    rig_version: cleanNullable(input.rigVersion),
    provider_model: cleanNullable(input.providerModel),
    shadow_owner: input.shadowOwner ?? "rig",
    shadow_qa: input.shadowQa ?? null,
    shadow_topology: input.shadowTopology ?? null,
    catalog_truth: input.catalogTruth ?? null,
    asset_role: input.assetRole ?? "pdp-primary",
    requires_pipeline_reconciliation: input.requiresPipelineReconciliation ?? true,
    raw_image_url: input.rawImageUrl,
    final_image_url: cleanNullable(input.finalImageUrl),
    canvas_width_px: input.canvasWidthPx ?? null,
    canvas_height_px: input.canvasHeightPx ?? null,
    pre_transform_baseline_y_px: input.preTransformBaselineYPx ?? null,
    detected_baseline_y_px: input.detectedBaselineYPx ?? null,
    target_baseline_y_px: input.targetBaselineYPx ?? null,
    pre_transform_shoulder_y_px: input.preTransformShoulderYPx ?? null,
    detected_shoulder_y_px: input.detectedShoulderYPx ?? null,
    target_shoulder_y_px: input.targetShoulderYPx ?? null,
    shoulder_delta_pct: input.shoulderDeltaPct ?? null,
    shoulder_confidence: input.shoulderConfidence ?? null,
    fill_height_pct: input.fillHeightPct ?? null,
    center_x_pct: input.centerXPct ?? null,
    target_center_x_pct: input.targetCenterXPct ?? null,
    center_delta_pct: input.centerDeltaPct ?? null,
    shift_x_px: input.shiftXPx ?? null,
    shift_y_px: input.shiftYPx ?? null,
    scale_factor: input.scaleFactor ?? null,
    mask_controlled: input.maskControlled ?? false,
    pre_transform_object_bounds: input.preTransformObjectBounds ?? null,
    transform_control_bounds: input.transformControlBounds ?? null,
    object_bounds: input.objectBounds ?? null,
    framing_qa: input.framingQa ?? null,
    qa_issues: input.qaIssues ?? [],
    framing_decision: input.framingDecision ?? null,
    lifecycle_state: input.lifecycleState,
    last_error: cleanNullable(input.lastError),
    rigged_at: input.finalImageUrl ? now : null,
    qa_completed_at: now,
    updated_at: now,
  };
}

async function db(): Promise<SupabaseClient> {
  // The migration and generated Supabase types may ship in separate commits.
  // The runtime contract is asserted by this module's exported interfaces.
  const { supabase } = await import("@/integrations/supabase/client");
  return supabase as unknown as SupabaseClient;
}

async function sha256(value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function cleanNullable(value: string | null | undefined): string | null {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function cleanSha256(value: string | null | undefined, label: string): string | null {
  const cleaned = cleanNullable(value);
  if (cleaned && !/^[a-f0-9]{64}$/i.test(cleaned)) {
    throw new Error(`${label} must be a SHA-256 hash.`);
  }
  return cleaned?.toLowerCase() ?? null;
}

export function buildBestBottlesRawReconciliationPayload(
  input: RecordBestBottlesRawImageInput,
): ReconciliationWrite {
  const now = input.now ?? new Date().toISOString();
  return {
    image_id: input.imageId,
    organization_id: input.organizationId,
    grace_sku: cleanNullable(input.graceSku),
    website_sku: cleanNullable(input.websiteSku),
    family: cleanNullable(input.family),
    source_reference_url: cleanNullable(input.sourceReferenceUrl),
    source_reference_hash: cleanSha256(input.sourceReferenceHash, "Source reference hash"),
    prompt_hash: cleanSha256(input.promptHash, "Prompt hash"),
    prompt_version: cleanNullable(input.promptVersion),
    rig_version: cleanNullable(input.rigVersion),
    provider_model: cleanNullable(input.providerModel),
    shadow_owner: input.shadowOwner ?? "rig",
    shadow_qa: input.shadowQa ?? null,
    shadow_topology: input.shadowTopology ?? null,
    catalog_truth: input.catalogTruth ?? null,
    catalog_truth_hash: cleanSha256(input.catalogTruthHash, "Catalog truth hash"),
    asset_role: input.assetRole ?? "pdp-primary",
    requires_pipeline_reconciliation: input.requiresPipelineReconciliation ?? true,
    raw_image_url: input.rawImageUrl,
    canvas_width_px: input.canvasWidthPx ?? null,
    canvas_height_px: input.canvasHeightPx ?? null,
    lifecycle_state: "rigging",
    last_error: null,
    updated_at: now,
  };
}

export async function recordBestBottlesRawImage(
  input: RecordBestBottlesRawImageInput,
): Promise<void> {
  const payload = buildBestBottlesRawReconciliationPayload({
    ...input,
    sourceReferenceHash: input.sourceReferenceHash ?? await sha256(input.sourceReferenceUrl),
    promptHash: input.promptHash ?? await sha256(input.prompt),
    catalogTruthHash:
      input.catalogTruthHash ??
      await sha256(input.catalogTruth ? JSON.stringify(input.catalogTruth) : null),
  });

  const { error } = await (await db())
    .from("best_bottles_image_reconciliations")
    .upsert(payload, { onConflict: "image_id" });
  if (error) {
    throw new Error(`Image reconciliation row could not be created: ${error.message}`);
  }
}

export async function recordBestBottlesRigResult(
  input: RecordBestBottlesRigResultInput,
): Promise<void> {
  const now = new Date().toISOString();
  const payload: ReconciliationWrite = {
    ...buildBestBottlesRigReconciliationPayload(input),
    source_reference_hash: await sha256(input.sourceReferenceUrl),
    prompt_hash: await sha256(input.prompt),
    catalog_truth_hash: await sha256(input.catalogTruth ? JSON.stringify(input.catalogTruth) : null),
    rigged_at: input.finalImageUrl ? now : null,
    qa_completed_at: now,
    updated_at: now,
  };

  const { error } = await (await db())
    .from("best_bottles_image_reconciliations")
    .upsert(payload, { onConflict: "image_id" });
  if (error) {
    throw new Error(`Image reconciliation QA state could not be saved: ${error.message}`);
  }
}

export async function recordBestBottlesGeneratedImageForSkuJob(input: {
  organizationId: string;
  pipelineSkuJobId: string;
  imageId: string;
}): Promise<void> {
  const { error } = await (await db()).rpc("link_best_bottles_generated_image", {
    p_organization_id: input.organizationId,
    p_pipeline_sku_job_id: input.pipelineSkuJobId,
    p_image_id: input.imageId,
  });
  if (error) {
    throw new Error(`Generated image and SKU job could not be linked: ${error.message}`);
  }
}

interface BestBottlesApprovalRpcClient {
  rpc: (
    functionName: string,
    args: Record<string, string>,
  ) => PromiseLike<{ error: { message: string } | null }>;
}

export async function approveBestBottlesReconciledImage(input: {
  organizationId: string;
  pipelineSkuJobId: string;
  imageId: string;
}, client?: BestBottlesApprovalRpcClient): Promise<void> {
  const database = client ?? ((await db()) as unknown as BestBottlesApprovalRpcClient);
  const { error } = await database.rpc("approve_best_bottles_reconciled_image", {
    p_organization_id: input.organizationId,
    p_pipeline_sku_job_id: input.pipelineSkuJobId,
    p_image_id: input.imageId,
  });
  if (error) {
    throw new Error(`Measured image could not be approved: ${error.message}`);
  }
}

/**
 * Explicit operator replacement for a previously approved/pushed/synced SKU
 * hero. The database function resets destination state transactionally, then
 * reruns the same exact-image reconciliation approval used for a first pass.
 */
export async function replaceBestBottlesSkuJobHero(input: {
  organizationId: string;
  pipelineSkuJobId: string;
  imageId: string;
}): Promise<void> {
  const { error } = await (await db()).rpc(
    "replace_best_bottles_sku_job_hero",
    {
      p_organization_id: input.organizationId,
      p_pipeline_sku_job_id: input.pipelineSkuJobId,
      p_image_id: input.imageId,
    },
  );
  if (error) {
    throw new Error(
      `Group hero replacement could not be approved: ${error.message}`,
    );
  }
}

export async function listBestBottlesImageReconciliationStatus(
  organizationId: string,
): Promise<BestBottlesImageReconciliationStatusRow[]> {
  const { data, error } = await (await db())
    .from("best_bottles_image_reconciliation_status")
    .select("*")
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false });
  if (error) {
    throw new Error(`Image reconciliation status could not be loaded: ${error.message}`);
  }
  return (data ?? []) as unknown as BestBottlesImageReconciliationStatusRow[];
}

export function indexBestBottlesImageReconciliations(
  rows: BestBottlesImageReconciliationStatusRow[],
): Map<string, BestBottlesImageReconciliationStatusRow> {
  return new Map(rows.map((row) => [row.image_id, row]));
}
