import { useState, useMemo, useRef, useEffect, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Upload,
  Download,
  CheckCircle2,
  Circle,
  Loader2,
  Play,
  Filter,
  ImageDown,
  Star,
  Layers,
  Eye,
  AlertTriangle,
  PackageCheck,
  Rows3,
  RefreshCw,
  PanelRightOpen,
  SquareCheck,
  X,
  ChevronDown,
  ExternalLink,
  ListChecks,
  FileText,
  Sparkles,
  Timer,
  Pause,
  RotateCcw,
  Volume2,
  Brain,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useGridPipelineFeatureFlag } from "@/hooks/useGridPipelineFeatureFlag";
import { useBestBottlesCylinderProductionReadiness } from "@/hooks/useBestBottlesCylinderProductionReadiness";
import {
  listPipelineGroups,
  listPipelineSkuJobs,
  backfillPipelineConvexImages,
  groupByShape,
  importPipelineCsv,
  markPipelineSkuJobsQueued,
  markPipelineSkuJobSyncedBySku,
  reconcilePipelineShopifyPushes,
  seedPipelineSkuJobsFromCoverage,
  setShapeGroupMasterReference,
  clearShapeGroupMasterReference,
  updatePipelineSkuJob,
  type PipelineGroup,
  type PipelineSkuJob,
  type PipelineStatus,
  type ShapeGroup,
} from "@/lib/bestBottlesPipeline";
import { writePipelinePrefill } from "@/lib/bestBottlesPipelineBridge";
import { approveBestBottlesGeneratedMaster } from "@/lib/bestBottlesMasterApproval";
import { BEST_BOTTLES_RECONCILIATION_QUERY_KEY } from "@/lib/bestBottlesImageReconciliation";
import {
  APPLICATOR_TO_FITMENT,
  GLASS_COLOR_TO_OPTION,
  type PipelineRowDescriptor,
} from "@/lib/bestBottlesPipelineMatching";
import {
  syncReferenceImages,
  type ReferenceSyncProgress,
} from "@/lib/bestBottlesReferenceSync";
import {
  BEST_BOTTLES_NEEDS_WORK_ACTION_LABELS,
  BEST_BOTTLES_STATUS_TAG_APPROVED_KEEP,
  BEST_BOTTLES_STATUS_TAG_NEEDS_REGEN,
  BEST_BOTTLES_STATUS_TAG_UNREVIEWED,
  buildBestBottlesGroupWorkflowSummary,
  buildBulkCreateQueuedHandoffRows,
  getBestBottlesApprovalStatus,
  getSkuJobNextAction,
  hasSkuJobGeneratedOrApprovedImage,
  hasSkuJobShopifyDestination,
  selectBulkCreateBatchRows,
  summarizeBulkCreateSelection,
  shouldShowInNeedsWork,
  type BestBottlesApprovalStatus,
  type BestBottlesGroupWorkflowSummary,
  type BulkCreatePreflightSummary,
  type BestBottlesNeedsWorkAction,
  type BestBottlesReferenceSource,
  type SkuJobCoverageInput,
} from "@/lib/bestBottlesImageCoverage";
import {
  STAGE_IN_SIGHT_GENERATION_FAMILY_TARGETS,
  type StageInSightGenerationTargets,
} from "@/lib/bestBottlesStageInSightTargets";
import { buildBestBottlesShopifyPushItemFromSkuJob } from "@/lib/bestBottlesShopifyPushIdentity";
import { attachPublishAuthorizations } from "@/lib/bestBottlesShopifyPublishAuthorizationClient";
import {
  buildMadisonGenerationBatchSections,
  getMadisonGenerationBatchLaneMeta,
  summarizeMadisonGenerationTruthReview,
  type MadisonGenerationBatchLane,
  type MadisonGenerationBatchPlan,
  type MadisonGenerationBatchRow,
  type MadisonGenerationBatchSection,
} from "@/lib/bestBottlesMadisonGenerationBatches";
import {
  buildBestBottlesStagingUiAuditSections,
  type BestBottlesStagingUiAudit,
  type BestBottlesStagingUiAuditRow,
  type BestBottlesStagingUiAuditSection,
} from "@/lib/bestBottlesStagingUiAudit";
import {
  buildBestBottlesGenerationGapStages,
  getBestBottlesGenerationGapNextStage,
  type BestBottlesGenerationGapStage,
  type BestBottlesGenerationGapStageId,
  type BestBottlesGenerationGapStageStatus,
} from "@/lib/bestBottlesGenerationGapPlan";
import {
  findGapWorklistEntryForFamily,
  indexIntakeByGraceSku,
  joinGapWorklistToIntake,
  parseGapWorklistCsv,
  type GapWorklistManifest,
  type GapWorklistRow,
} from "@/lib/bestBottlesGapWorklist";
import GapWorklistView, {
  type GapWorklistLaneFilter,
} from "@/components/bestbottles/GapWorklistView";

type StatusFilter = "all" | PipelineStatus | "has-hero" | "no-hero";
type CoverageView =
  | "pdp-readiness"
  | "cylinder-pilot"
  | "needs-work"
  | "launch-batches"
  | "staging-ui-reference"
  | "groups"
  | "sku-jobs"
  | "gap-worklist";
type SkuJobStage =
  | "all"
  | "needs-reference"
  | "ready-to-generate"
  | "generated"
  | "approved"
  | "shopify-pushed"
  | "convex-synced";
type SkuJobFilter = SkuJobStage | "not-pushed";
type NeedsWorkActionFilter = "all" | "ready-to-generate" | BestBottlesNeedsWorkAction;
type GroupWorkFilter =
  | "all"
  | "ready"
  | "needs-reference"
  | "needs-measurement"
  | "needs-policy"
  | "components"
  | "generated"
  | "approved"
  | "shopify-pushed"
  | "not-pushed"
  | "convex-synced";

interface MadisonPipelineCoverageSummary {
  sourceOfTruthDate: string;
  productVariants: number;
  productGroups: number;
  broadFamilies: number;
  approvedShopifyReadyImages: number;
  generatedOrReviewCandidateVariants: number;
  imagesNeededForCompleteCoverage: number;
  referenceReadyVariants: number;
  missingReferenceVariants: number;
  groupsMissingHeroImageUrl: number;
  groupsMissingShopifyProductId: number;
}

interface MadisonFamilyCoverage {
  family: string;
  catalogReferencePages: string;
  productGroups: number;
  variantCount: number;
  approvedGeneratedImages: number;
  generatedOrReviewCandidates: number;
  imagesNeededForCompleteCoverage: number;
  referenceReadyVariants: number;
  missingReferenceVariants: number;
}

interface MadisonProductGroupCoverage {
  groupAction: string;
  productGroupSlug: string;
  displayName: string;
  family: string;
  catalogReferencePages: string;
  category: string;
  capacityMl: string;
  applicatorTypes: string;
  variantCount: number;
  approvedGeneratedImages: number;
  generatedOrReviewCandidates: number;
  imagesNeededForCompleteCoverage: number;
  referenceReadyVariants: number;
  missingReferenceVariants: number;
  hasGroupHeroImageUrl: "yes" | "no";
  hasShopifyProductId: "yes" | "no";
  sampleGraceSkus: string;
}

interface MadisonSkuImageJob {
  action: string;
  coverageStatus: string;
  productId: string;
  sourceId: string;
  productGroupSlug: string;
  productGroupDisplayName: string;
  family: string;
  catalogReferencePages: string;
  category: string;
  capacityMl: string;
  applicator: string;
  canonicalColor: string;
  graceSku: string;
  websiteSku: string;
  shopifySku?: string | null;
  expectedCanonicalFilename: string;
  bestReferenceCandidatePath: string;
  generatedCandidateCount: number;
  reviewCandidateCount: number;
  shopifyReadyCount: number;
  hasConvexImageUrl: "yes" | "no";
  hasShopifyProductId: "yes" | "no";
  hasShopifyVariantId: "yes" | "no";
}

interface MadisonPipelineCoverageData {
  summary: MadisonPipelineCoverageSummary;
  families: MadisonFamilyCoverage[];
  productGroups: MadisonProductGroupCoverage[];
  products: MadisonSkuImageJob[];
}

type GenerationReadinessStatus =
  | "ready"
  | "needs-reference"
  | "needs-measurement"
  | "needs-prompt-policy"
  | "component-exception";

interface GenerationReadinessRow {
  status: GenerationReadinessStatus;
  issues: string[];
  graceSku: string;
  websiteSku: string | null;
  productGroupSlug: string;
  productGroupDisplayName: string;
  family: string | null;
  category: string | null;
  capacityMl: string | null;
  color: string | null;
  applicator: string | null;
  generatedCandidateCount: number;
  reviewCandidateCount: number;
  shopifyReadyCount: number;
}

interface GenerationReadinessData {
  generatedAt: string;
  sourceOfTruthDate: string | null;
  summary: {
    totalRows: number;
    statusCounts: Record<GenerationReadinessStatus, number>;
    issueCounts: Record<string, number>;
    manualMeasurementOverrides: number;
  };
  rows: GenerationReadinessRow[];
}

interface ReferenceIntakeRow {
  graceSku: string;
  websiteSku: string | null;
  shopifySku?: string | null;
  family: string | null;
  productGroupSlug: string | null;
  productGroupDisplayName: string | null;
  status: string;
  hasReference: boolean;
  bestReferenceCandidatePath: string | null;
  coverageStatus: string | null;
  liveReferenceUrl?: string | null;
  referenceSource: BestBottlesReferenceSource;
  referenceSourcePath: string | null;
  referenceSourceUrl: string | null;
  referenceIssue: string | null;
  referenceImportedAt: string | null;
  matchKind: string;
  duplicateCandidateCount: number;
  nextAction: BestBottlesNeedsWorkAction;
}

interface ReferenceIntakeData {
  generatedAt: string;
  localRoots: string[];
  summary: {
    totalRows: number;
    localMatches: number;
    liveSiteCandidates: number;
    unresolved: number;
    duplicateCandidates: number;
    supportedLocalMatches: number;
    conversionRequired: number;
    byFamily: Array<{ family: string; total: number; local: number; live: number; unresolved: number }>;
    byNextAction: Record<BestBottlesNeedsWorkAction, number>;
  };
  rows: ReferenceIntakeRow[];
}

type WebsiteTruthStatus = "ready" | "needs_website_check" | "truth_conflict" | "alias_exception" | "component_lane";

interface WebsiteTruthStatusData {
  generatedAt: string;
  sourceOfTruth: string;
  auditReportPath: string;
  summary: {
    sourceRowsAudited: number;
    pdpRowsAudited?: number;
    componentLaneRows?: number;
    liveEvidenceMode: string;
    liveEvidenceRows: number;
    liveEvidenceOkRows: number;
    liveWebsiteSkuConfirmedRows: number;
    truthStatusCounts: Partial<Record<WebsiteTruthStatus, number>>;
    criticalHighBlockers: number;
    pdpCriticalHighBlockers?: number;
    componentLaneReviewRows?: number;
    missingConvexRows: number;
    pdpMissingConvexRows?: number;
    duplicateConvexWebsiteSkuRows: number;
    pdpDuplicateConvexWebsiteSkuRows?: number;
    componentDuplicateConvexWebsiteSkuRows?: number;
    graceAliasMismatchRows: number;
    gracePrefixAliasExceptions: number;
    pdpGracePrefixAliasExceptions?: number;
  };
  rows: Array<{
    truthStatus: WebsiteTruthStatus;
    truthStatusLabel: string;
    severity: string;
    issueTypes: string;
    commercialLane?: "pdp" | "component";
    websiteSku: string;
    graceSku: string;
    convexGraceSku: string;
    expectedFamily: string;
    convexFamily: string;
    sourceCategory?: string;
    productGroupSlug: string;
    liveEvidenceStatus: string;
    liveWebsiteSkuPresent: string;
    liveFamily: string;
    liveConfiguration: string;
    liveSourceUrl: string;
    liveFinalUrl: string;
  }>;
}

type ReferenceRigPrepStatus =
  | "ready_for_madison_import"
  | "ready_for_madison_import_with_review"
  | "needs_background_removal"
  | "needs_alpha_edge_review"
  | "needs_source_match"
  | "needs_manual_duplicate_choice"
  | "needs_sku_key_correction"
  | "needs_cap_state";

interface CylinderReferenceRigRow {
  status: ReferenceRigPrepStatus;
  graceSku: string;
  websiteSku: string | null;
  family: string | null;
  productGroupSlug: string | null;
  workflowLane: string;
  sourcePath: string | null;
  sourceMatchCount: number;
  targetPath: string | null;
  capState: "cap-on" | "cap-off" | null;
  width: number | null;
  height: number | null;
  hasAlpha: boolean | null;
  transparentPct: number | null;
  semiTransparentForegroundPct: number | null;
  foregroundTouchesEdge: boolean | null;
  copied: boolean;
  issues: string[];
}

interface CylinderReferenceRigReadinessData {
  generatedAt: string;
  dryRun: boolean;
  source: {
    workflow: string;
    inputRoot: string;
    outputRoot: string;
  };
  policy: {
    filename: string;
    capStates: string;
    alphaGuardrail: string;
    rgbGuardrail: string;
  };
  summary: {
    totalRows: number;
    readyForMadisonImport: number;
    readyForMadisonImportWithReview: number;
    needsBackgroundRemoval: number;
    needsAlphaEdgeReview: number;
    needsSourceMatch: number;
    needsManualDuplicateChoice: number;
    needsSkuKeyCorrection: number;
    needsCapState: number;
    capOn: number;
    capOff: number;
    capStateMissing: number;
    readyCapOn: number;
    readyCapOff: number;
    copied: number;
  };
  rows: CylinderReferenceRigRow[];
}

interface NeedsWorkRow {
  id: string;
  persisted: boolean;
  family: string;
  productGroupSlug: string;
  productGroupDisplayName: string;
  graceSku: string;
  websiteSku: string | null;
  shopifySku: string | null;
  status: string;
  bestReferenceCandidatePath: string | null;
  action: BestBottlesNeedsWorkAction;
  referenceSource: BestBottlesReferenceSource;
  referenceSourcePath: string | null;
  referenceSourceUrl: string | null;
  referenceIssue: string | null;
  referenceRig: CylinderReferenceRigRow | null;
  matchKind: string | null;
  duplicateCandidateCount: number;
  generatedImageUrl: string | null;
  approvedImageUrl: string | null;
  shopifyImageUrl: string | null;
}

interface PdpReadinessCounts {
  total: number;
  generated: number;
  shopifyPublished: number;
  remainingGeneration: number;
  pdpLive: number;
  shopifyAwaitingConvex: number;
  approvedPendingPush: number;
  reviewGenerated: number;
  readyToGenerate: number;
  sourceNeeded: number;
  sourceBlocked: number;
}

interface PdpProductGroupReadiness extends PdpReadinessCounts {
  family: string;
  productGroupSlug: string;
  displayName: string;
  capacityMl: number | null;
  capacityLabel: string | null;
  sampleSkus: string[];
  nextAction: BestBottlesNeedsWorkAction;
}

interface PdpFamilyReadiness extends PdpReadinessCounts {
  family: string;
  capacityMin: number | null;
  capacityMax: number | null;
  groups: PdpProductGroupReadiness[];
  nextAction: BestBottlesNeedsWorkAction;
}

interface PdpReadinessRollup {
  summary: PdpReadinessCounts;
  families: PdpFamilyReadiness[];
}

interface ReadinessGroupRollup {
  total: number;
  ready: number;
  needsReference: number;
  needsMeasurement: number;
  needsPromptPolicy: number;
  componentException: number;
  readyGraceSkus: string[];
}

type WorkflowGroupRollup = BestBottlesGroupWorkflowSummary;

const NEEDS_WORK_ACTION_ORDER: BestBottlesNeedsWorkAction[] = [
  "import-local-reference",
  "source-website-reference",
  "needs-source-match",
  "generate-image",
  "review-generated",
  "push-to-shopify",
  "sync-convex",
];

const CYLINDER_PILOT_PRODUCT_GROUP_SLUG = "cylinder-9ml-frosted-17-415-rollon";
const CYLINDER_PILOT_ROW_LIMIT = 12;

function isReadyToGenerateRow(row: Pick<NeedsWorkRow, "persisted" | "action" | "status">): boolean {
  return row.persisted && row.action === "generate-image" && row.status === "ready-to-generate";
}

async function loadCoverageData(): Promise<MadisonPipelineCoverageData> {
  const response = await fetch("/data/best-bottles-madison-pipeline-ui.json");
  if (!response.ok) {
    throw new Error(`Unable to load Best Bottles coverage data (${response.status})`);
  }
  return response.json() as Promise<MadisonPipelineCoverageData>;
}

async function loadGenerationReadinessData(): Promise<GenerationReadinessData> {
  const response = await fetch("/data/best-bottles-generation-readiness.json");
  if (!response.ok) {
    throw new Error(`Unable to load Best Bottles readiness data (${response.status})`);
  }
  return response.json() as Promise<GenerationReadinessData>;
}

async function loadReferenceIntakeData(): Promise<ReferenceIntakeData | null> {
  const response = await fetch("/data/best-bottles-reference-intake.json");
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Unable to load Best Bottles reference intake data (${response.status})`);
  }
  return response.json() as Promise<ReferenceIntakeData>;
}

async function loadStageInSightGenerationTargets(): Promise<StageInSightGenerationTargets | null> {
  const response = await fetch("/data/best-bottles-stage-in-sight-generation-targets.json");
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Unable to load Stage In Sight generation targets (${response.status})`);
  }
  return response.json() as Promise<StageInSightGenerationTargets>;
}

async function loadMadisonGenerationBatchPlan(): Promise<MadisonGenerationBatchPlan | null> {
  const response = await fetch("/data/best-bottles-madison-generation-batches.json");
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Unable to load Best Bottles launch batches (${response.status})`);
  }
  return response.json() as Promise<MadisonGenerationBatchPlan>;
}

async function loadStagingUiReferenceAudit(): Promise<BestBottlesStagingUiAudit | null> {
  const response = await fetch("/data/best-bottles-staging-ui-reference-audit.json");
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Unable to load Best Bottles staging UI audit (${response.status})`);
  }
  return response.json() as Promise<BestBottlesStagingUiAudit>;
}

async function loadWebsiteTruthStatusData(): Promise<WebsiteTruthStatusData | null> {
  const response = await fetch("/data/best-bottles-website-truth-status.json");
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Unable to load Best Bottles website truth status (${response.status})`);
  }
  return response.json() as Promise<WebsiteTruthStatusData>;
}

async function loadCylinderReferenceRigReadiness(): Promise<CylinderReferenceRigReadinessData | null> {
  const response = await fetch("/data/best-bottles-cylinder-reference-rig-readiness.json");
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Unable to load Cylinder reference rig readiness (${response.status})`);
  }
  return response.json() as Promise<CylinderReferenceRigReadinessData>;
}

// Gap-worklist manifest (which Cowork CSVs exist per family). Built by
// `npm run bestbottles:gap-worklist:index`. Missing manifest is non-fatal —
// the Gap worklist view just shows its "nothing published" empty state.
async function loadGapWorklistManifest(): Promise<GapWorklistManifest | null> {
  const response = await fetch("/data/audits/gap-worklists.json");
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Unable to load gap worklist manifest (${response.status})`);
  }
  return response.json() as Promise<GapWorklistManifest>;
}

async function loadGapWorklistCsv(file: string): Promise<GapWorklistRow[]> {
  const response = await fetch(file);
  if (!response.ok) {
    throw new Error(`Unable to load gap worklist CSV ${file} (${response.status})`);
  }
  return parseGapWorklistCsv(await response.text());
}

function isPipelineRowPushedAndSynced(row: PipelineGroup | undefined): boolean {
  return Boolean(
    row?.madison_status === "synced" ||
      (row?.madison_shopify_synced_at && row?.madison_convex_synced_at),
  );
}

function isPipelineRowShopifyPushed(row: PipelineGroup | undefined): boolean {
  return Boolean(row?.madison_status === "synced" || row?.madison_shopify_synced_at);
}

function isPipelineRowConvexSynced(row: PipelineGroup | undefined): boolean {
  return Boolean(row?.madison_status === "synced" || row?.madison_convex_synced_at);
}

function isPipelineRowApproved(row: PipelineGroup | undefined): boolean {
  return Boolean(row?.madison_status === "approved" || isPipelineRowPushedAndSynced(row));
}

function hasSkuJobShopifyPush(job: PipelineSkuJob): boolean {
  return Boolean(
    job.status === "shopify-pushed" ||
      job.status === "synced" ||
      job.shopify_pushed_at ||
      job.shopify_image_url ||
      job.shopify_media_id,
  );
}

function hasSkuJobConvexSync(job: PipelineSkuJob): boolean {
  return Boolean(job.status === "synced" || job.convex_synced_at);
}

function classifySkuJob(job: MadisonSkuImageJob, row?: PipelineGroup): SkuJobStage {
  if (
    isPipelineRowConvexSynced(row) &&
    job.hasShopifyProductId === "yes" &&
    job.hasShopifyVariantId === "yes"
  ) {
    return "convex-synced";
  }
  if (
    isPipelineRowShopifyPushed(row) &&
    job.hasShopifyProductId === "yes" &&
    job.hasShopifyVariantId === "yes"
  ) {
    return "shopify-pushed";
  }
  if (isPipelineRowApproved(row) || job.shopifyReadyCount > 0) return "approved";
  if (job.generatedCandidateCount > 0 || job.reviewCandidateCount > 0) return "generated";
  if (job.coverageStatus === "missing_local_reference_image") return "needs-reference";
  if (job.coverageStatus === "covered_canonical" || job.coverageStatus === "covered_needs_canonical_copy") {
    return "ready-to-generate";
  }
  return "all";
}

function classifyPersistedSkuJob(job: PipelineSkuJob): SkuJobStage {
  if (hasSkuJobConvexSync(job)) return "convex-synced";
  if (hasSkuJobShopifyPush(job)) return "shopify-pushed";
  if (job.status === "approved") return "approved";
  if (job.status === "generated" || job.status === "qa-pending" || job.status === "rejected") return "generated";
  if (job.status === "needs-reference") return "needs-reference";
  if (job.status === "ready-to-generate" || job.status === "queued" || job.status === "generating") {
    return "ready-to-generate";
  }
  return "all";
}

function matchesPersistedSkuJobFilter(job: PipelineSkuJob, filter: SkuJobFilter): boolean {
  if (filter === "all") return true;
  if (filter === "not-pushed") return !hasSkuJobShopifyPush(job);
  return classifyPersistedSkuJob(job) === filter;
}

function matchesCoverageSkuJobFilter(
  job: MadisonSkuImageJob,
  row: PipelineGroup | undefined,
  filter: SkuJobFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "not-pushed") return !isPipelineRowShopifyPushed(row);
  return classifySkuJob(job, row) === filter;
}

function getGroupSkuJobCount(
  group: MadisonProductGroupCoverage,
  readiness?: ReadinessGroupRollup,
): number {
  return readiness?.total ?? group.variantCount;
}

function getGroupReadyCount(
  group: MadisonProductGroupCoverage,
  readiness?: ReadinessGroupRollup,
): number {
  return readiness?.ready ?? group.referenceReadyVariants;
}

function getGroupNeedsReferenceCount(
  group: MadisonProductGroupCoverage,
  readiness?: ReadinessGroupRollup,
): number {
  return readiness?.needsReference ?? group.missingReferenceVariants;
}

function getGroupGeneratedReviewCount(
  group: MadisonProductGroupCoverage,
  workflow?: WorkflowGroupRollup,
): number {
  return workflow?.generatedOrReview ?? group.generatedOrReviewCandidates;
}

function getGroupApprovedCount(
  group: MadisonProductGroupCoverage,
  workflow?: WorkflowGroupRollup,
): number {
  return workflow?.approvedTotal ?? group.approvedGeneratedImages;
}

function getGroupShopifyPushedCount(
  row: PipelineGroup | undefined,
  workflow?: WorkflowGroupRollup,
): number {
  if (workflow) return workflow.shopifyPushed;
  return isPipelineRowShopifyPushed(row) ? 1 : 0;
}

function getGroupConvexSyncedCount(
  row: PipelineGroup | undefined,
  workflow?: WorkflowGroupRollup,
): number {
  if (workflow) return workflow.convexSynced;
  return isPipelineRowConvexSynced(row) ? 1 : 0;
}

function matchesGroupWorkFilter(
  group: MadisonProductGroupCoverage,
  readiness: ReadinessGroupRollup | undefined,
  workflow: WorkflowGroupRollup | undefined,
  row: PipelineGroup | undefined,
  filter: GroupWorkFilter,
): boolean {
  if (filter === "all") return true;

  const skuJobCount = getGroupSkuJobCount(group, readiness);
  const readyCount = getGroupReadyCount(group, readiness);
  const needsReferenceCount = getGroupNeedsReferenceCount(group, readiness);
  const generatedReviewCount = getGroupGeneratedReviewCount(group, workflow);
  const approvedCount = getGroupApprovedCount(group, workflow);
  const shopifyPushedCount = getGroupShopifyPushedCount(row, workflow);
  const convexSyncedCount = getGroupConvexSyncedCount(row, workflow);

  if (filter === "ready") return readyCount > 0;
  if (filter === "needs-reference") return needsReferenceCount > 0;
  if (filter === "needs-measurement") return (readiness?.needsMeasurement ?? 0) > 0;
  if (filter === "needs-policy") return (readiness?.needsPromptPolicy ?? 0) > 0;
  if (filter === "components") return (readiness?.componentException ?? 0) > 0;
  if (filter === "generated") return generatedReviewCount > 0;
  if (filter === "approved") return approvedCount > 0;
  if (filter === "shopify-pushed") return shopifyPushedCount > 0;
  if (filter === "not-pushed") return skuJobCount > 0 && shopifyPushedCount < skuJobCount;
  if (filter === "convex-synced") return convexSyncedCount > 0;
  return true;
}

function buildCoverageGroupsFromSkuJobs(jobs: PipelineSkuJob[]): MadisonProductGroupCoverage[] {
  const groups = new Map<string, MadisonProductGroupCoverage>();
  for (const job of jobs) {
    const existing = groups.get(job.product_group_slug);
    const group =
      existing ??
      {
        groupAction: "open_studio",
        productGroupSlug: job.product_group_slug,
        displayName: job.product_group_display_name ?? job.product_group_slug,
        family: job.family,
        catalogReferencePages: job.catalog_reference_pages ?? "",
        category: job.category ?? "",
        capacityMl: job.capacity_ml == null ? "" : String(job.capacity_ml),
        applicatorTypes: job.applicator ?? "",
        variantCount: 0,
        approvedGeneratedImages: 0,
        generatedOrReviewCandidates: 0,
        imagesNeededForCompleteCoverage: 0,
        referenceReadyVariants: 0,
        missingReferenceVariants: 0,
        hasGroupHeroImageUrl: "no",
        hasShopifyProductId: "no",
        sampleGraceSkus: "",
      };
    group.variantCount += 1;
    group.imagesNeededForCompleteCoverage += job.status === "synced" ? 0 : 1;
    if (job.status === "needs-reference") group.missingReferenceVariants += 1;
    if (job.status === "ready-to-generate" || job.status === "queued" || job.status === "generating") {
      group.referenceReadyVariants += 1;
    }
    if (job.status === "generated" || job.status === "qa-pending") {
      group.generatedOrReviewCandidates += 1;
    }
    if (job.status === "approved" || job.status === "shopify-pushed" || job.status === "synced") {
      group.approvedGeneratedImages += 1;
    }
    if (job.shopify_product_id) group.hasShopifyProductId = "yes";
    if (job.generated_image_url || job.approved_image_url || job.shopify_image_url) {
      group.hasGroupHeroImageUrl = "yes";
    }
    const skus = group.sampleGraceSkus ? group.sampleGraceSkus.split(", ") : [];
    if (skus.length < 3) {
      skus.push(job.grace_sku);
      group.sampleGraceSkus = skus.join(", ");
    }
    groups.set(job.product_group_slug, group);
  }
  return Array.from(groups.values()).sort((a, b) =>
    a.family.localeCompare(b.family) || a.displayName.localeCompare(b.displayName),
  );
}

type SkuJobTableRow = MadisonSkuImageJob | PipelineSkuJob;

function isPersistedSkuJob(job: SkuJobTableRow): job is PipelineSkuJob {
  return "organization_id" in job;
}

function skuLookupKey(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function findReferenceIntakeRow(
  map: Map<string, ReferenceIntakeRow>,
  ...skus: Array<string | null | undefined>
): ReferenceIntakeRow | undefined {
  for (const sku of skus) {
    const row = map.get(skuLookupKey(sku));
    if (row) return row;
  }
  return undefined;
}

function findReferenceRigRow(
  map: Map<string, CylinderReferenceRigRow>,
  ...skus: Array<string | null | undefined>
): CylinderReferenceRigRow | undefined {
  for (const sku of skus) {
    const row = map.get(skuLookupKey(sku));
    if (row) return row;
  }
  return undefined;
}

function matchesSkuKeySet(row: NeedsWorkRow, keys: Set<string>): boolean {
  return [row.graceSku, row.websiteSku, row.shopifySku].some((sku) =>
    keys.has(skuLookupKey(sku)),
  );
}

function emptyPdpReadinessCounts(): PdpReadinessCounts {
  return {
    total: 0,
    generated: 0,
    shopifyPublished: 0,
    remainingGeneration: 0,
    pdpLive: 0,
    shopifyAwaitingConvex: 0,
    approvedPendingPush: 0,
    reviewGenerated: 0,
    readyToGenerate: 0,
    sourceNeeded: 0,
    sourceBlocked: 0,
  };
}

function inferCapacityMl(...values: Array<string | number | null | undefined>): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const match = String(value ?? "").match(/(\d+(?:\.\d+)?)\s*ml/i);
    if (match) return Number(match[1]);
  }
  return null;
}

function formatCapacityValue(value: number | null): string {
  if (value == null) return "Unspecified";
  return Number.isInteger(value) ? `${value} ml` : `${value.toFixed(1)} ml`;
}

function formatCapacityRange(min: number | null, max: number | null): string {
  if (min == null && max == null) return "Size TBD";
  if (min === max || max == null) return formatCapacityValue(min);
  if (min == null) return formatCapacityValue(max);
  return `${formatCapacityValue(min)} - ${formatCapacityValue(max)}`;
}

function capacitySortValue(value: number | null): number {
  return value == null ? Number.MAX_SAFE_INTEGER : value;
}

function classifyPdpReadiness(input: SkuJobCoverageInput): {
  nextAction: BestBottlesNeedsWorkAction;
  generated: boolean;
  shopifyPublished: boolean;
  remainingGeneration: boolean;
  pdpLive: boolean;
  shopifyAwaitingConvex: boolean;
  approvedPendingPush: boolean;
  reviewGenerated: boolean;
  readyToGenerate: boolean;
  sourceNeeded: boolean;
  sourceBlocked: boolean;
} {
  const nextAction = getSkuJobNextAction(input);
  // "Live" / done is gated on the axis-2 quality verdict, not on a Convex sync.
  // A row published to Convex but not yet `approved-keep` is unconfirmed quality,
  // so it no longer counts as PDP-live — it falls into the review bucket below.
  const isComplete = nextAction === "complete";
  const hasConvexSync = input.status === "synced" || Boolean(input.convexSyncedAt);
  const hasShopifyPush = hasSkuJobShopifyDestination(input);

  return {
    nextAction,
    generated: hasSkuJobGeneratedOrApprovedImage(input),
    shopifyPublished: hasShopifyPush,
    remainingGeneration: !hasSkuJobGeneratedOrApprovedImage(input),
    pdpLive: isComplete,
    shopifyAwaitingConvex: !isComplete && hasShopifyPush && !hasConvexSync,
    approvedPendingPush: nextAction === "push-to-shopify",
    reviewGenerated: nextAction === "review-generated",
    readyToGenerate: nextAction === "generate-image",
    sourceNeeded: nextAction === "import-local-reference" || nextAction === "source-website-reference",
    sourceBlocked: nextAction === "needs-source-match",
  };
}

function addPdpReadinessCounts(
  counts: PdpReadinessCounts,
  classification: ReturnType<typeof classifyPdpReadiness>,
): void {
  counts.total += 1;
  if (classification.generated) counts.generated += 1;
  if (classification.shopifyPublished) counts.shopifyPublished += 1;
  if (classification.remainingGeneration) counts.remainingGeneration += 1;
  if (classification.pdpLive) counts.pdpLive += 1;
  if (classification.shopifyAwaitingConvex) counts.shopifyAwaitingConvex += 1;
  if (classification.approvedPendingPush) counts.approvedPendingPush += 1;
  if (classification.reviewGenerated) counts.reviewGenerated += 1;
  if (classification.readyToGenerate) counts.readyToGenerate += 1;
  if (classification.sourceNeeded) counts.sourceNeeded += 1;
  if (classification.sourceBlocked) counts.sourceBlocked += 1;
}

function dominantPdpNextAction(counts: PdpReadinessCounts): BestBottlesNeedsWorkAction {
  if (counts.sourceBlocked > 0) return "needs-source-match";
  if (counts.sourceNeeded > 0) return "import-local-reference";
  if (counts.readyToGenerate > 0) return "generate-image";
  if (counts.reviewGenerated > 0) return "review-generated";
  if (counts.approvedPendingPush > 0) return "push-to-shopify";
  if (counts.shopifyAwaitingConvex > 0) return "sync-convex";
  return "complete";
}

function comparePdpGroups(a: PdpProductGroupReadiness, b: PdpProductGroupReadiness): number {
  return (
    capacitySortValue(a.capacityMl) - capacitySortValue(b.capacityMl) ||
    a.displayName.localeCompare(b.displayName) ||
    a.productGroupSlug.localeCompare(b.productGroupSlug)
  );
}

function comparePdpFamilies(a: PdpFamilyReadiness, b: PdpFamilyReadiness): number {
  return (
    capacitySortValue(a.capacityMin) - capacitySortValue(b.capacityMin) ||
    a.family.localeCompare(b.family)
  );
}

function inferredReferenceMetadata(candidatePath: string | null | undefined): {
  referenceSource: BestBottlesReferenceSource;
  referenceSourcePath: string | null;
  referenceSourceUrl: string | null;
} {
  const value = String(candidatePath ?? "").trim();
  if (!value) {
    return { referenceSource: "none", referenceSourcePath: null, referenceSourceUrl: null };
  }
  if (/^https?:\/\/www\.bestbottles\.com\//i.test(value)) {
    return { referenceSource: "bestbottles-live", referenceSourcePath: null, referenceSourceUrl: value };
  }
  if (/^https?:\/\//i.test(value)) {
    return { referenceSource: "manual", referenceSourcePath: null, referenceSourceUrl: value };
  }
  if (value.includes("pipeline/madison-hero-sync/renders")) {
    return { referenceSource: "canonical-render", referenceSourcePath: value, referenceSourceUrl: null };
  }
  if (value.includes("/reference-flattened/")) {
    return { referenceSource: "flattened-product-truth", referenceSourcePath: value, referenceSourceUrl: null };
  }
  return { referenceSource: "local-legacy", referenceSourcePath: value, referenceSourceUrl: null };
}

/** imageId → axis-2 quality verdict, read from `generated_images.library_tags`. */
type ApprovalStatusByImageId = Record<string, BestBottlesApprovalStatus>;

/**
 * Resolve a SKU job's quality verdict from its linked image. The approved image
 * decides if present; otherwise we fall back to the generated candidate. Jobs
 * whose image carries no `status:*` tag resolve to null (untriaged, not done).
 */
function approvalStatusForImageId(
  map: ApprovalStatusByImageId | undefined,
  ...imageIds: Array<string | null | undefined>
): BestBottlesApprovalStatus | null {
  if (!map) return null;
  for (const id of imageIds) {
    if (id && map[id]) return map[id];
  }
  return null;
}

/**
 * Load the quality verdicts (`status:approved-keep|needs-regen|unreviewed`)
 * stamped on Best Bottles images. Only reviewed images carry a `status:*` tag,
 * so the array-overlap filter keeps this query tiny (today: zero rows). RLS
 * already scopes by org; the explicit org filter matches the library index.
 */
async function loadBestBottlesApprovalStatusByImageId(
  organizationId: string,
): Promise<ApprovalStatusByImageId> {
  const out: ApprovalStatusByImageId = {};
  const statusTags = [
    BEST_BOTTLES_STATUS_TAG_APPROVED_KEEP,
    BEST_BOTTLES_STATUS_TAG_NEEDS_REGEN,
    BEST_BOTTLES_STATUS_TAG_UNREVIEWED,
  ];
  const pageSize = 1000;
  // library_tags is not in the generated Database type until types are
  // regenerated post-migration, so cast narrowly for this lookup only.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from("generated_images")
      .select("id, library_tags")
      .eq("organization_id", organizationId)
      .overlaps("library_tags", statusTags)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = (data ?? []) as Array<{ id: string | null; library_tags: string[] | null }>;
    for (const row of rows) {
      const status = getBestBottlesApprovalStatus(row.library_tags);
      if (status && row.id) out[row.id] = status;
    }
    if (rows.length < pageSize) break;
  }
  return out;
}

function persistedJobCoverageInput(
  job: PipelineSkuJob,
  referenceIntake?: ReferenceIntakeRow,
  approvalStatus?: BestBottlesApprovalStatus | null,
): SkuJobCoverageInput {
  const inferred = inferredReferenceMetadata(job.best_reference_candidate_path);
  return {
    status: job.status,
    bestReferenceCandidatePath: job.best_reference_candidate_path,
    coverageStatus: job.coverage_status,
    generatedImageUrl: job.generated_image_url,
    generatedImageId: job.generated_image_id,
    approvedImageUrl: job.approved_image_url,
    approvedImageId: job.approved_image_id,
    approvedAt: job.approved_at,
    shopifyPushedAt: job.shopify_pushed_at,
    shopifyImageUrl: job.shopify_image_url,
    shopifyMediaId: job.shopify_media_id,
    convexSyncedAt: job.convex_synced_at,
    referenceSource: job.reference_source ?? (job.best_reference_candidate_path ? inferred.referenceSource : referenceIntake?.referenceSource ?? "none"),
    referenceSourcePath: job.reference_source_path ?? inferred.referenceSourcePath ?? referenceIntake?.referenceSourcePath ?? null,
    referenceSourceUrl: job.reference_source_url ?? inferred.referenceSourceUrl ?? referenceIntake?.referenceSourceUrl ?? null,
    referenceIssue: job.reference_issue ?? referenceIntake?.referenceIssue ?? null,
    approvalStatus: approvalStatus ?? null,
  };
}

function coverageJobCoverageInput(
  job: MadisonSkuImageJob,
  row: PipelineGroup | undefined,
  referenceIntake?: ReferenceIntakeRow,
): SkuJobCoverageInput {
  const stage = classifySkuJob(job, row);
  const inferred = inferredReferenceMetadata(job.bestReferenceCandidatePath);
  return {
    status: stage === "convex-synced" ? "synced" : stage,
    bestReferenceCandidatePath: job.bestReferenceCandidatePath || null,
    coverageStatus: job.coverageStatus,
    generatedImageUrl: null,
    generatedImageId: job.generatedCandidateCount > 0 || job.reviewCandidateCount > 0 ? "coverage-generated" : null,
    approvedImageUrl: null,
    approvedImageId: job.shopifyReadyCount > 0 ? "coverage-approved" : null,
    approvedAt: null,
    shopifyPushedAt: row?.madison_shopify_synced_at ?? null,
    shopifyImageUrl: null,
    shopifyMediaId: null,
    convexSyncedAt: row?.madison_convex_synced_at ?? null,
    referenceSource: job.bestReferenceCandidatePath ? inferred.referenceSource : referenceIntake?.referenceSource ?? "none",
    referenceSourcePath: inferred.referenceSourcePath ?? referenceIntake?.referenceSourcePath ?? null,
    referenceSourceUrl: inferred.referenceSourceUrl ?? referenceIntake?.referenceSourceUrl ?? null,
    referenceIssue: referenceIntake?.referenceIssue ?? null,
  };
}

function buildPdpReadinessRollup({
  skuJobs,
  coverageProducts,
  hasPersistedSkuJobs,
  referenceIntakeBySku,
  pipelineRowsBySlug,
  approvalStatusByImageId,
}: {
  skuJobs: PipelineSkuJob[];
  coverageProducts: MadisonSkuImageJob[];
  hasPersistedSkuJobs: boolean;
  referenceIntakeBySku: Map<string, ReferenceIntakeRow>;
  pipelineRowsBySlug: Map<string, PipelineGroup>;
  approvalStatusByImageId: ApprovalStatusByImageId;
}): PdpReadinessRollup {
  const summary = emptyPdpReadinessCounts();
  const familiesByName = new Map<string, PdpFamilyReadiness>();
  const groupsBySlug = new Map<string, PdpProductGroupReadiness>();
  const persistedGraceSkus = new Set<string>();

  const addSku = ({
    family,
    productGroupSlug,
    displayName,
    capacityMl,
    capacityLabel,
    graceSku,
    websiteSku,
    input,
  }: {
    family: string | null | undefined;
    productGroupSlug: string;
    displayName: string | null | undefined;
    capacityMl: number | null;
    capacityLabel: string | null;
    graceSku: string;
    websiteSku?: string | null;
    input: SkuJobCoverageInput;
  }) => {
    const familyName = family?.trim() || "(blank)";
    const groupName = displayName?.trim() || productGroupSlug;
    const classification = classifyPdpReadiness(input);

    let familyRollup = familiesByName.get(familyName);
    if (!familyRollup) {
      familyRollup = {
        ...emptyPdpReadinessCounts(),
        family: familyName,
        capacityMin: capacityMl,
        capacityMax: capacityMl,
        groups: [],
        nextAction: "complete",
      };
      familiesByName.set(familyName, familyRollup);
    } else if (capacityMl != null) {
      familyRollup.capacityMin =
        familyRollup.capacityMin == null ? capacityMl : Math.min(familyRollup.capacityMin, capacityMl);
      familyRollup.capacityMax =
        familyRollup.capacityMax == null ? capacityMl : Math.max(familyRollup.capacityMax, capacityMl);
    }

    let groupRollup = groupsBySlug.get(productGroupSlug);
    if (!groupRollup) {
      groupRollup = {
        ...emptyPdpReadinessCounts(),
        family: familyName,
        productGroupSlug,
        displayName: groupName,
        capacityMl,
        capacityLabel,
        sampleSkus: [],
        nextAction: "complete",
      };
      groupsBySlug.set(productGroupSlug, groupRollup);
      familyRollup.groups.push(groupRollup);
    } else if (groupRollup.capacityMl == null && capacityMl != null) {
      groupRollup.capacityMl = capacityMl;
      groupRollup.capacityLabel = capacityLabel;
    }

    addPdpReadinessCounts(summary, classification);
    addPdpReadinessCounts(familyRollup, classification);
    addPdpReadinessCounts(groupRollup, classification);

    if (groupRollup.sampleSkus.length < 3) {
      groupRollup.sampleSkus.push(websiteSku || graceSku);
    }
  };

  for (const job of skuJobs) {
    persistedGraceSkus.add(skuLookupKey(job.grace_sku));
    const intake = findReferenceIntakeRow(referenceIntakeBySku, job.grace_sku, job.website_sku, job.shopify_sku);
    const approvalStatus = approvalStatusForImageId(
      approvalStatusByImageId,
      job.approved_image_id,
      job.generated_image_id,
    );
    const input = persistedJobCoverageInput(job, intake, approvalStatus);
    addSku({
      family: job.family || intake?.family,
      productGroupSlug: job.product_group_slug,
      displayName: job.product_group_display_name,
      capacityMl: job.capacity_ml,
      capacityLabel: job.capacity_ml == null ? null : `${job.capacity_ml} ml`,
      graceSku: job.grace_sku,
      websiteSku: job.website_sku,
      input,
    });
  }

  for (const job of coverageProducts) {
    if (hasPersistedSkuJobs && persistedGraceSkus.has(skuLookupKey(job.graceSku))) continue;
    const intake = findReferenceIntakeRow(referenceIntakeBySku, job.graceSku, job.websiteSku, job.shopifySku);
    const pipelineRow = pipelineRowsBySlug.get(job.productGroupSlug);
    const input = coverageJobCoverageInput(job, pipelineRow, intake);
    const capacityMl = inferCapacityMl(job.capacityMl, job.productGroupDisplayName, job.productGroupSlug);
    addSku({
      family: job.family || intake?.family,
      productGroupSlug: job.productGroupSlug,
      displayName: job.productGroupDisplayName,
      capacityMl,
      capacityLabel: capacityMl == null ? null : `${capacityMl} ml`,
      graceSku: job.graceSku,
      websiteSku: job.websiteSku,
      input,
    });
  }

  for (const family of familiesByName.values()) {
    family.groups.sort(comparePdpGroups);
    family.nextAction = dominantPdpNextAction(family);
    for (const group of family.groups) {
      group.nextAction = dominantPdpNextAction(group);
    }
  }

  return {
    summary,
    families: Array.from(familiesByName.values()).sort(comparePdpFamilies),
  };
}

function needsWorkRowFromPersistedJob(
  job: PipelineSkuJob,
  referenceIntake?: ReferenceIntakeRow,
  approvalStatus?: BestBottlesApprovalStatus | null,
): NeedsWorkRow | null {
  const input = persistedJobCoverageInput(job, referenceIntake, approvalStatus);
  if (!shouldShowInNeedsWork(input)) return null;
  return {
    id: job.id,
    persisted: true,
    family: job.family || referenceIntake?.family || "(blank)",
    productGroupSlug: job.product_group_slug,
    productGroupDisplayName: job.product_group_display_name ?? job.product_group_slug,
    graceSku: job.grace_sku,
    websiteSku: job.website_sku,
    shopifySku: job.shopify_sku,
    status: job.status,
    bestReferenceCandidatePath: job.best_reference_candidate_path,
    action: getSkuJobNextAction(input),
    referenceSource: input.referenceSource ?? "none",
    referenceSourcePath: input.referenceSourcePath ?? null,
    referenceSourceUrl: input.referenceSourceUrl ?? null,
    referenceIssue: input.referenceIssue ?? null,
    referenceRig: null,
    matchKind: referenceIntake?.matchKind ?? null,
    duplicateCandidateCount: referenceIntake?.duplicateCandidateCount ?? 0,
    generatedImageUrl: job.generated_image_url,
    approvedImageUrl: job.approved_image_url,
    shopifyImageUrl: job.shopify_image_url,
  };
}

function needsWorkRowFromCoverageJob(
  job: MadisonSkuImageJob,
  row: PipelineGroup | undefined,
  referenceIntake?: ReferenceIntakeRow,
): NeedsWorkRow | null {
  const input = coverageJobCoverageInput(job, row, referenceIntake);
  if (!shouldShowInNeedsWork(input)) return null;
  return {
    id: `coverage:${job.graceSku}`,
    persisted: false,
    family: job.family || referenceIntake?.family || "(blank)",
    productGroupSlug: job.productGroupSlug,
    productGroupDisplayName: job.productGroupDisplayName,
    graceSku: job.graceSku,
    websiteSku: job.websiteSku,
    shopifySku: job.shopifySku ?? null,
    status: String(input.status ?? "needs-reference"),
    bestReferenceCandidatePath: job.bestReferenceCandidatePath || null,
    action: getSkuJobNextAction(input),
    referenceSource: input.referenceSource ?? "none",
    referenceSourcePath: input.referenceSourcePath ?? null,
    referenceSourceUrl: input.referenceSourceUrl ?? null,
    referenceIssue: input.referenceIssue ?? null,
    referenceRig: null,
    matchKind: referenceIntake?.matchKind ?? null,
    duplicateCandidateCount: referenceIntake?.duplicateCandidateCount ?? 0,
    generatedImageUrl: null,
    approvedImageUrl: null,
    shopifyImageUrl: null,
  };
}

export default function BestBottlesPipeline() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { enabled, isLoading: flagLoading, organizationId } = useGridPipelineFeatureFlag();
  const cylinderProductionReadinessQuery = useBestBottlesCylinderProductionReadiness();

  const [familyFilter, setFamilyFilter] = useState<string>("Cylinder");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [coverageView, setCoverageView] = useState<CoverageView>("pdp-readiness");
  const [showAdvancedPipeline, setShowAdvancedPipeline] = useState(false);
  const [adhdMode, setAdhdMode] = useState(false);
  const [timerActive, setTimerActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [timerMode, setTimerMode] = useState<"work" | "break">("work");

  // Pomodoro Focus Timer Countdown
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (timerActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      setTimerActive(false);

      // Synthesize a calming, professional double chime using Web Audio API
      try {
        const webkitAudioContext = (
          window as typeof window & { webkitAudioContext?: typeof AudioContext }
        ).webkitAudioContext;
        const AudioContextConstructor = window.AudioContext || webkitAudioContext;
        if (!AudioContextConstructor) throw new Error("Web Audio is unavailable.");
        const audioCtx = new AudioContextConstructor();
        const playTone = (freq: number, startDelay: number, duration: number) => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.type = "sine";
          osc.frequency.setValueAtTime(freq, audioCtx.currentTime + startDelay);

          gain.gain.setValueAtTime(0, audioCtx.currentTime + startDelay);
          gain.gain.linearRampToValueAtTime(0.15, audioCtx.currentTime + startDelay + 0.05);
          gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + startDelay + duration);

          osc.start(audioCtx.currentTime + startDelay);
          osc.stop(audioCtx.currentTime + startDelay + duration);
        };

        playTone(523.25, 0, 0.6); // C5
        playTone(659.25, 0.15, 0.8); // E5
        playTone(783.99, 0.3, 1.0); // G5
      } catch (e) {
        console.error("Audio synthesis failed", e);
      }

      const isWorkFinished = timerMode === "work";
      toast.success(
        isWorkFinished
          ? "Pomodoro session complete! Take a relaxing break."
          : "Break finished! Let's focus on the next target.",
        { duration: 6000 }
      );

      const nextMode = isWorkFinished ? "break" : "work";
      setTimerMode(nextMode);
      setTimeLeft(nextMode === "work" ? 25 * 60 : 5 * 60);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timerActive, timeLeft, timerMode]);

  const formatTimerTime = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };
  const [needsWorkActionFilter, setNeedsWorkActionFilter] = useState<NeedsWorkActionFilter>("all");
  const [stageInSightGenerationOnly, setStageInSightGenerationOnly] = useState(false);
  const [selectedNeedsWorkIds, setSelectedNeedsWorkIds] = useState<Set<string>>(new Set());
  const [queuedBulkCreateHandoffRows, setQueuedBulkCreateHandoffRows] = useState<NeedsWorkRow[]>([]);
  const [bulkCreateOpen, setBulkCreateOpen] = useState(false);
  const [bulkQueueing, setBulkQueueing] = useState(false);
  const [groupWorkFilter, setGroupWorkFilter] = useState<GroupWorkFilter>("all");
  const [skuJobFilter, setSkuJobFilter] = useState<SkuJobFilter>("all");
  const [importing, setImporting] = useState(false);
  const [seedingSkuJobs, setSeedingSkuJobs] = useState(false);
  const [reconcilingShopifyPushes, setReconcilingShopifyPushes] = useState(false);
  const [pushingGroupSlug, setPushingGroupSlug] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<ReferenceSyncProgress | null>(
    null,
  );

  const { data: rows = [], isLoading: rowsLoading } = useQuery({
    queryKey: ["best-bottles-pipeline-groups", organizationId],
    queryFn: () => listPipelineGroups(organizationId!),
    enabled: !!organizationId && enabled,
    staleTime: 30 * 1000,
  });

  const { data: coverageData, isLoading: coverageLoading } = useQuery({
    queryKey: ["best-bottles-madison-coverage-ui"],
    queryFn: loadCoverageData,
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const { data: readinessData, isLoading: readinessLoading } = useQuery({
    queryKey: ["best-bottles-generation-readiness"],
    queryFn: loadGenerationReadinessData,
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const { data: referenceIntakeData, isLoading: referenceIntakeLoading } = useQuery({
    queryKey: ["best-bottles-reference-intake"],
    queryFn: loadReferenceIntakeData,
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const { data: stageInSightGenerationTargets, isLoading: stageInSightTargetsLoading } = useQuery({
    queryKey: ["best-bottles-stage-in-sight-generation-targets"],
    queryFn: loadStageInSightGenerationTargets,
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const { data: madisonGenerationBatchPlan, isLoading: madisonGenerationBatchesLoading } = useQuery({
    queryKey: ["best-bottles-madison-generation-batches"],
    queryFn: loadMadisonGenerationBatchPlan,
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const { data: stagingUiReferenceAudit, isLoading: stagingUiReferenceAuditLoading } = useQuery({
    queryKey: ["best-bottles-staging-ui-reference-audit"],
    queryFn: loadStagingUiReferenceAudit,
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const { data: websiteTruthStatusData } = useQuery({
    queryKey: ["best-bottles-website-truth-status"],
    queryFn: loadWebsiteTruthStatusData,
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const { data: cylinderReferenceRigData } = useQuery({
    queryKey: ["best-bottles-cylinder-reference-rig-readiness"],
    queryFn: loadCylinderReferenceRigReadiness,
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const { data: generatedImages = [], isLoading: imagesLoading } = useQuery({
    queryKey: ["best-bottles-generated-images-costs", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const allRows: Array<{
        id: string;
        generation_provider: string | null;
        description: string | null;
        created_at: string;
      }> = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("generated_images")
          .select("id, generation_provider, description, created_at")
          .eq("organization_id", organizationId)
          .like("generation_provider", "openai-%")
          .range(from, from + pageSize - 1);
        if (error) throw error;
        allRows.push(...(data ?? []));
        if ((data ?? []).length < pageSize) break;
      }
      return allRows;
    },
    enabled: !!organizationId && enabled,
    staleTime: 5 * 60 * 1000,
  });


  // ─── Gap worklist (Cowork's segmented "missing clean reference" CSVs) ──────
  const [gapWorklistLaneFilter, setGapWorklistLaneFilter] = useState<GapWorklistLaneFilter>("all");

  const { data: gapWorklistManifest } = useQuery({
    queryKey: ["best-bottles-gap-worklist-manifest"],
    queryFn: loadGapWorklistManifest,
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const gapWorklistEntry = useMemo(
    () => findGapWorklistEntryForFamily(gapWorklistManifest ?? null, familyFilter),
    [gapWorklistManifest, familyFilter],
  );

  const { data: gapWorklistRawRows = [], isLoading: gapWorklistLoading } = useQuery({
    queryKey: ["best-bottles-gap-worklist-csv", gapWorklistEntry?.file],
    queryFn: () => loadGapWorklistCsv(gapWorklistEntry!.file),
    enabled: enabled && coverageView === "gap-worklist" && !!gapWorklistEntry,
    staleTime: 5 * 60 * 1000,
  });

  const { data: skuJobs = [], isLoading: skuJobsLoading } = useQuery({
    queryKey: ["best-bottles-pipeline-sku-jobs", organizationId],
    queryFn: () => listPipelineSkuJobs(organizationId!),
    enabled: !!organizationId && enabled,
    staleTime: 30 * 1000,
  });

  // Axis-2 quality verdicts (`status:approved-keep|needs-regen|unreviewed`) that
  // gate the COMPLETE / PDP-live metric. Defaults to an empty map, which makes
  // the gate collapse "done" to the true approved-keep count (zero today).
  const { data: approvalStatusByImageId = {} } = useQuery({
    queryKey: ["best-bottles-approval-status", organizationId],
    queryFn: () => loadBestBottlesApprovalStatusByImageId(organizationId!),
    enabled: !!organizationId && enabled,
    staleTime: 30 * 1000,
  });

  const hasPersistedSkuJobs = skuJobs.length > 0;

  // Join Cowork's gap-worklist rows to the live intake by graceSku. The lane
  // assignment is never touched — it comes straight from the CSV.
  const gapWorklistIntakeIndex = useMemo(
    () => indexIntakeByGraceSku(referenceIntakeData?.rows ?? []),
    [referenceIntakeData],
  );
  const gapWorklistRows = useMemo(
    () => joinGapWorklistToIntake(gapWorklistRawRows, gapWorklistIntakeIndex),
    [gapWorklistRawRows, gapWorklistIntakeIndex],
  );

  const referenceIntakeBySku = useMemo(() => {
    const map = new Map<string, ReferenceIntakeRow>();
    for (const row of referenceIntakeData?.rows ?? []) {
      for (const sku of [row.graceSku, row.websiteSku, row.shopifySku]) {
        const key = skuLookupKey(sku);
        if (key) map.set(key, row);
      }
    }
    return map;
  }, [referenceIntakeData?.rows]);

  const cylinderReferenceRigBySku = useMemo(() => {
    const map = new Map<string, CylinderReferenceRigRow>();
    for (const row of cylinderReferenceRigData?.rows ?? []) {
      for (const sku of [row.graceSku, row.websiteSku]) {
        const key = skuLookupKey(sku);
        if (key) map.set(key, row);
      }
    }
    return map;
  }, [cylinderReferenceRigData?.rows]);

  const pipelineRowsBySlug = useMemo(() => {
    const map = new Map<string, PipelineGroup>();
    for (const row of rows) {
      if (row.convex_slug) map.set(row.convex_slug, row);
    }
    return map;
  }, [rows]);

  const stageInSightGenerationSkuKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const row of stageInSightGenerationTargets?.rows ?? []) {
      const graceKey = skuLookupKey(row.sku);
      const websiteKey = skuLookupKey(row.websiteSku);
      if (graceKey) keys.add(graceKey);
      if (websiteKey) keys.add(websiteKey);
    }
    return keys;
  }, [stageInSightGenerationTargets?.rows]);

  const families = useMemo(() => {
    const values = new Set<string>();
    rows.forEach((row) => values.add(row.family));
    coverageData?.families.forEach((family) => values.add(family.family));
    skuJobs.forEach((job) => values.add(job.family));
    return Array.from(values).sort();
  }, [coverageData?.families, rows, skuJobs]);

  const readinessByGroup = useMemo(() => {
    const map = new Map<string, ReadinessGroupRollup>();
    for (const row of readinessData?.rows ?? []) {
      const existing =
        map.get(row.productGroupSlug) ??
        {
          total: 0,
          ready: 0,
          needsReference: 0,
          needsMeasurement: 0,
          needsPromptPolicy: 0,
          componentException: 0,
          readyGraceSkus: [],
        };
      existing.total += 1;
      if (row.status === "ready") {
        existing.ready += 1;
        existing.readyGraceSkus.push(row.graceSku);
      } else if (row.status === "needs-reference") existing.needsReference += 1;
      else if (row.status === "needs-measurement") existing.needsMeasurement += 1;
      else if (row.status === "needs-prompt-policy") existing.needsPromptPolicy += 1;
      else if (row.status === "component-exception") existing.componentException += 1;
      map.set(row.productGroupSlug, existing);
    }
    return map;
  }, [readinessData?.rows]);

  const workflowByGroup = useMemo(() => {
    const jobsByGroup = new Map<string, SkuJobCoverageInput[]>();
    for (const job of skuJobs) {
      const groupJobs = jobsByGroup.get(job.product_group_slug) ?? [];
      groupJobs.push(persistedJobCoverageInput(job));
      jobsByGroup.set(job.product_group_slug, groupJobs);
    }
    return new Map(
      Array.from(jobsByGroup.entries()).map(([slug, jobs]) => [
        slug,
        buildBestBottlesGroupWorkflowSummary(jobs),
      ]),
    );
  }, [skuJobs]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (familyFilter !== "all" && r.family !== familyFilter) return false;
      if (statusFilter === "has-hero") return r.legacy_has_hero_image || r.madison_status === "approved" || r.madison_status === "synced";
      if (statusFilter === "no-hero") return !r.legacy_has_hero_image && r.madison_status !== "approved" && r.madison_status !== "synced";
      if (statusFilter !== "all") return r.madison_status === statusFilter;
      return true;
    });
  }, [rows, familyFilter, statusFilter]);

  const shapeGroups = useMemo(() => groupByShape(filteredRows), [filteredRows]);

  const stats = useMemo(() => {
    const total = rows.length;
    const withHero = rows.filter(
      (r) => r.legacy_has_hero_image || r.madison_status === "approved" || r.madison_status === "synced",
    ).length;
    const inProgress = rows.filter(
      (r) => r.madison_status === "queued" || r.madison_status === "generating" || r.madison_status === "generated" || r.madison_status === "qa-pending",
    ).length;
    return { total, withHero, inProgress, remaining: total - withHero };
  }, [rows]);

  const skuJobStats = useMemo(() => {
    if (hasPersistedSkuJobs) {
      let needsReference = 0;
      let readyPending = 0;
      let queued = 0;
      let generating = 0;
      let generated = 0;
      let qaPending = 0;
      let rejected = 0;
      let approvedTotal = 0;
      let approvedPendingPush = 0;
      let shopifyPushedPendingConvex = 0;
      let shopifyPushedTotal = 0;
      let convexSynced = 0;

      for (const job of skuJobs) {
        if (job.status === "needs-reference") needsReference += 1;
        else if (job.status === "ready-to-generate") readyPending += 1;
        else if (job.status === "queued") queued += 1;
        else if (job.status === "generating") generating += 1;
        else if (job.status === "generated") generated += 1;
        else if (job.status === "qa-pending") qaPending += 1;
        else if (job.status === "rejected") rejected += 1;
        else if (job.status === "approved") approvedPendingPush += 1;

        const hasShopifyPush =
          job.status === "shopify-pushed" ||
          job.status === "synced" ||
          Boolean(job.shopify_pushed_at || job.shopify_image_url || job.shopify_media_id);
        const hasConvexSync = job.status === "synced" || Boolean(job.convex_synced_at);
        if (
          job.status === "approved" ||
          hasShopifyPush ||
          hasConvexSync ||
          Boolean(job.approved_at || job.approved_image_url)
        ) {
          approvedTotal += 1;
        }
        if (hasShopifyPush) {
          shopifyPushedTotal += 1;
          if (!hasConvexSync) shopifyPushedPendingConvex += 1;
        }
        if (hasConvexSync) {
          convexSynced += 1;
        }
      }

      const readyToGenerate = readyPending + queued + generating;
      const generatedReview = generated + qaPending + rejected;

      return {
        total: skuJobs.length,
        needsReference,
        readyToGenerate,
        readyPending,
        queued,
        generating,
        generated: generatedReview,
        generatedDone: generated,
        qaPending,
        rejected,
        approved: approvedTotal,
        approvedPendingPush,
        shopifyPushed: shopifyPushedTotal,
        shopifyPushedPendingConvex,
        convexSynced,
        pushedSynced: convexSynced,
        remaining: skuJobs.length - convexSynced,
      };
    }

    const products = coverageData?.products ?? [];
    let needsReference = 0;
    let readyToGenerate = 0;
    let generated = 0;
    let approved = 0;
    let shopifyPushed = 0;
    let convexSynced = 0;

    for (const job of products) {
      const status = classifySkuJob(job, pipelineRowsBySlug.get(job.productGroupSlug));
      if (status === "needs-reference") needsReference += 1;
      else if (status === "ready-to-generate") readyToGenerate += 1;
      else if (status === "generated") generated += 1;
      else if (status === "approved") approved += 1;
      else if (status === "shopify-pushed") shopifyPushed += 1;
      else if (status === "convex-synced") {
        shopifyPushed += 1;
        convexSynced += 1;
      }
    }

    return {
      total: products.length,
      needsReference,
      readyToGenerate,
      readyPending: readyToGenerate,
      queued: 0,
      generating: 0,
      generated,
      generatedDone: generated,
      qaPending: 0,
      rejected: 0,
      approved,
      approvedPendingPush: approved,
      shopifyPushed,
      shopifyPushedPendingConvex: 0,
      convexSynced,
      pushedSynced: convexSynced,
      remaining: products.length - convexSynced,
    };
  }, [coverageData?.products, hasPersistedSkuJobs, pipelineRowsBySlug, skuJobs]);

  const readinessStatusCounts = readinessData?.summary.statusCounts;
  const readinessTotal = readinessData?.summary.totalRows ?? null;
  const readinessReady = readinessStatusCounts?.ready ?? null;
  const readinessNeedsReference = readinessStatusCounts?.["needs-reference"] ?? null;
  const readinessNeedsMeasurement = readinessStatusCounts?.["needs-measurement"] ?? null;
  const readinessNeedsPromptPolicy = readinessStatusCounts?.["needs-prompt-policy"] ?? null;
  const readinessComponentExceptions = readinessStatusCounts?.["component-exception"] ?? null;
  const persistedQueueGap =
    readinessTotal != null && hasPersistedSkuJobs ? Math.max(readinessTotal - skuJobs.length, 0) : null;

  const filteredSkuJobs = useMemo(() => {
    const queryFamily = familyFilter;
    if (hasPersistedSkuJobs) {
      return skuJobs
        .filter((job) => queryFamily === "all" || job.family === queryFamily)
        .filter((job) => matchesPersistedSkuJobFilter(job, skuJobFilter))
        .slice(0, 500);
    }

    return (coverageData?.products ?? [])
      .filter((job) => queryFamily === "all" || job.family === queryFamily)
      .filter((job) => matchesCoverageSkuJobFilter(job, pipelineRowsBySlug.get(job.productGroupSlug), skuJobFilter))
      .slice(0, 500);
  }, [coverageData?.products, familyFilter, hasPersistedSkuJobs, pipelineRowsBySlug, skuJobFilter, skuJobs]);

  const allNeedsWorkRowsUnfiltered = useMemo(() => {
    const rowsOut: NeedsWorkRow[] = [];
    const persistedGraceSkus = new Set<string>();

    for (const job of skuJobs) {
      persistedGraceSkus.add(skuLookupKey(job.grace_sku));
      const intake = findReferenceIntakeRow(referenceIntakeBySku, job.grace_sku, job.website_sku, job.shopify_sku);
      const referenceRig = findReferenceRigRow(cylinderReferenceRigBySku, job.grace_sku, job.website_sku, job.shopify_sku);
      const approvalStatus = approvalStatusForImageId(
        approvalStatusByImageId,
        job.approved_image_id,
        job.generated_image_id,
      );
      const needsWorkRow = needsWorkRowFromPersistedJob(job, intake, approvalStatus);
      if (needsWorkRow) rowsOut.push({ ...needsWorkRow, referenceRig: referenceRig ?? null });
    }

    for (const job of coverageData?.products ?? []) {
      if (hasPersistedSkuJobs && persistedGraceSkus.has(skuLookupKey(job.graceSku))) continue;
      const intake = findReferenceIntakeRow(referenceIntakeBySku, job.graceSku, job.websiteSku, job.shopifySku);
      const referenceRig = findReferenceRigRow(cylinderReferenceRigBySku, job.graceSku, job.websiteSku, job.shopifySku);
      const row = pipelineRowsBySlug.get(job.productGroupSlug);
      const needsWorkRow = needsWorkRowFromCoverageJob(job, row, intake);
      if (needsWorkRow) rowsOut.push({ ...needsWorkRow, referenceRig: referenceRig ?? null });
    }

    return rowsOut
      .sort((a, b) => {
        const familyDelta = a.family.localeCompare(b.family);
        if (familyDelta !== 0) return familyDelta;
        const actionDelta = NEEDS_WORK_ACTION_ORDER.indexOf(a.action) - NEEDS_WORK_ACTION_ORDER.indexOf(b.action);
        if (actionDelta !== 0) return actionDelta;
        return [a.productGroupDisplayName, a.graceSku].join("|").localeCompare(
          [b.productGroupDisplayName, b.graceSku].join("|"),
        );
      });
  }, [
    approvalStatusByImageId,
    coverageData?.products,
    cylinderReferenceRigBySku,
    hasPersistedSkuJobs,
    pipelineRowsBySlug,
    referenceIntakeBySku,
    skuJobs,
  ]);

  const allNeedsWorkRows = useMemo(
    () =>
      allNeedsWorkRowsUnfiltered
        .filter((row) => familyFilter === "all" || row.family === familyFilter)
        .filter((row) => !stageInSightGenerationOnly || matchesSkuKeySet(row, stageInSightGenerationSkuKeys)),
    [allNeedsWorkRowsUnfiltered, familyFilter, stageInSightGenerationOnly, stageInSightGenerationSkuKeys],
  );

  const needsWorkRows = useMemo(
    () =>
      allNeedsWorkRows.filter(
        (row) =>
          needsWorkActionFilter === "all" ||
          (needsWorkActionFilter === "ready-to-generate"
            ? isReadyToGenerateRow(row)
            : row.action === needsWorkActionFilter),
      ),
    [allNeedsWorkRows, needsWorkActionFilter],
  );

  const cylinderPilotRows = useMemo(() => {
    const exactGroupRows = allNeedsWorkRowsUnfiltered.filter(
      (row) => row.productGroupSlug === CYLINDER_PILOT_PRODUCT_GROUP_SLUG,
    );
    const rowsForSlice =
      exactGroupRows.length > 0
        ? exactGroupRows
        : allNeedsWorkRowsUnfiltered.filter((row) => row.family === "Cylinder");
    return rowsForSlice.slice(0, CYLINDER_PILOT_ROW_LIMIT);
  }, [allNeedsWorkRowsUnfiltered]);

  const cylinderPilotTotal = useMemo(() => {
    const exactGroupRows = allNeedsWorkRowsUnfiltered.filter(
      (row) => row.productGroupSlug === CYLINDER_PILOT_PRODUCT_GROUP_SLUG,
    );
    return exactGroupRows.length > 0
      ? exactGroupRows.length
      : allNeedsWorkRowsUnfiltered.filter((row) => row.family === "Cylinder").length;
  }, [allNeedsWorkRowsUnfiltered]);

  const pdpReadiness = useMemo(
    () =>
      buildPdpReadinessRollup({
        skuJobs,
        coverageProducts: coverageData?.products ?? [],
        hasPersistedSkuJobs,
        referenceIntakeBySku,
        pipelineRowsBySlug,
        approvalStatusByImageId,
      }),
    [
      approvalStatusByImageId,
      coverageData?.products,
      hasPersistedSkuJobs,
      pipelineRowsBySlug,
      referenceIntakeBySku,
      skuJobs,
    ],
  );

  const displayedPdpFamilies = useMemo(
    () =>
      familyFilter === "all"
        ? pdpReadiness.families
        : pdpReadiness.families.filter((family) => family.family === familyFilter),
    [familyFilter, pdpReadiness.families],
  );

  const displayedPdpSummary = useMemo<PdpReadinessCounts>(
    () => (familyFilter === "all" ? pdpReadiness.summary : displayedPdpFamilies[0] ?? emptyPdpReadinessCounts()),
    [displayedPdpFamilies, familyFilter, pdpReadiness.summary],
  );

  const readyToGenerateNeedsWorkCount = useMemo(
    () => allNeedsWorkRows.filter(isReadyToGenerateRow).length,
    [allNeedsWorkRows],
  );

  const globalReadyToGenerateNeedsWorkCount = useMemo(
    () => allNeedsWorkRowsUnfiltered.filter(isReadyToGenerateRow).length,
    [allNeedsWorkRowsUnfiltered],
  );

  const needsWorkStats = useMemo(() => {
    const counts = new Map<BestBottlesNeedsWorkAction, number>();
    for (const action of NEEDS_WORK_ACTION_ORDER) counts.set(action, 0);
    for (const row of allNeedsWorkRows) {
      counts.set(row.action, (counts.get(row.action) ?? 0) + 1);
    }
    return counts;
  }, [allNeedsWorkRows]);

  const globalNeedsWorkStats = useMemo(() => {
    const counts = new Map<BestBottlesNeedsWorkAction, number>();
    for (const action of NEEDS_WORK_ACTION_ORDER) counts.set(action, 0);
    for (const row of allNeedsWorkRowsUnfiltered) {
      counts.set(row.action, (counts.get(row.action) ?? 0) + 1);
    }
    return counts;
  }, [allNeedsWorkRowsUnfiltered]);

  const stageInSightFamilyCounts = stageInSightGenerationTargets?.summary.byFamily;
  const stageInSightTargetTotal = stageInSightGenerationTargets?.summary.total ?? 0;
  const stageInSightShownCount = stageInSightGenerationOnly ? allNeedsWorkRows.length : 0;
  const madisonGenerationBatchSections = useMemo(
    () => (madisonGenerationBatchPlan ? buildMadisonGenerationBatchSections(madisonGenerationBatchPlan) : []),
    [madisonGenerationBatchPlan],
  );
  const madisonGenerationTruthReviewSummary = useMemo(
    () => summarizeMadisonGenerationTruthReview(madisonGenerationBatchPlan?.rows ?? []),
    [madisonGenerationBatchPlan?.rows],
  );
  const stagingUiReferenceSections = useMemo(
    () => (stagingUiReferenceAudit ? buildBestBottlesStagingUiAuditSections(stagingUiReferenceAudit) : []),
    [stagingUiReferenceAudit],
  );
  const websiteTruthStatusCounts = websiteTruthStatusData?.summary.truthStatusCounts;
  const websiteTruthReady = websiteTruthStatusCounts?.ready ?? 0;
  const websiteTruthNeedsCheck = websiteTruthStatusCounts?.needs_website_check ?? 0;
  const websiteTruthConflict = websiteTruthStatusCounts?.truth_conflict ?? 0;
  const websiteTruthAliasExceptions = websiteTruthStatusCounts?.alias_exception ?? 0;
  const websiteTruthComponentLane =
    websiteTruthStatusCounts?.component_lane ?? websiteTruthStatusData?.summary.componentLaneRows ?? 0;
  const websiteTruthPdpRows =
    websiteTruthStatusData?.summary.pdpRowsAudited ??
    Math.max((websiteTruthStatusData?.summary.sourceRowsAudited ?? 0) - websiteTruthComponentLane, 0);
  const websiteTruthPdpBlockers =
    websiteTruthStatusData?.summary.pdpCriticalHighBlockers ?? websiteTruthNeedsCheck + websiteTruthConflict;
  const websiteTruthBlockingRows = websiteTruthNeedsCheck + websiteTruthConflict;
  const cylinderReferenceRigSummary = cylinderReferenceRigData?.summary;
  const cylinderReferenceRigReady =
    (cylinderReferenceRigSummary?.readyForMadisonImport ?? 0) +
    (cylinderReferenceRigSummary?.readyForMadisonImportWithReview ?? 0);
  const cylinderReferenceRigBlocked =
    (cylinderReferenceRigSummary?.needsBackgroundRemoval ?? 0) +
    (cylinderReferenceRigSummary?.needsSourceMatch ?? 0) +
    (cylinderReferenceRigSummary?.needsCapState ?? 0) +
    (cylinderReferenceRigSummary?.needsAlphaEdgeReview ?? 0) +
    (cylinderReferenceRigSummary?.needsManualDuplicateChoice ?? 0) +
    (cylinderReferenceRigSummary?.needsSkuKeyCorrection ?? 0);
  const generationGapStages = useMemo(
    () =>
      buildBestBottlesGenerationGapStages({
        totalSkuJobs: skuJobStats.total || coverageData?.summary.productVariants || 0,
        convexSynced: skuJobStats.convexSynced,
        stagingUiFlaggedRows: stagingUiReferenceAudit?.summary.flaggedRows ?? null,
        stagingUiRowsNeedingGeneration: stagingUiReferenceAudit?.summary.rowsNeedingGeneration ?? 0,
        stagingUiRowsNeedingSyncOrPush: stagingUiReferenceAudit?.summary.rowsNeedingSyncOrPush ?? 0,
        stagingUiBlockedRows: stagingUiReferenceAudit?.summary.blockedTruthReviewRows ?? 0,
        needsMeasurement: readinessNeedsMeasurement ?? 0,
        needsPromptPolicy: readinessNeedsPromptPolicy ?? 0,
        blockedTruthReview:
          madisonGenerationTruthReviewSummary.launchBlockingTruthRows + websiteTruthBlockingRows,
        importLocalReference: globalNeedsWorkStats.get("import-local-reference") ?? 0,
        sourceWebsiteReference: globalNeedsWorkStats.get("source-website-reference") ?? 0,
        needsSourceMatch: globalNeedsWorkStats.get("needs-source-match") ?? 0,
        launchBatchRows: madisonGenerationBatchPlan?.summary.selectedRows ?? stageInSightTargetTotal,
        launchBatchAttachExistingCdn:
          madisonGenerationBatchPlan?.summary.byLane.attach_existing_cdn_before_generation ?? 0,
        launchBatchLocalGeneration:
          madisonGenerationBatchPlan?.summary.byLane.generate_from_local_reference ?? 0,
        launchBatchLegacyGeneration:
          madisonGenerationBatchPlan?.summary.byLane.generate_from_legacy_reference ?? 0,
        readyToGenerate: globalReadyToGenerateNeedsWorkCount,
        queued: skuJobStats.queued,
        generating: skuJobStats.generating,
        reviewGenerated: globalNeedsWorkStats.get("review-generated") ?? 0,
        pushToShopify: globalNeedsWorkStats.get("push-to-shopify") ?? 0,
        syncConvex: globalNeedsWorkStats.get("sync-convex") ?? 0,
      }),
    [
      coverageData?.summary.productVariants,
      globalNeedsWorkStats,
      globalReadyToGenerateNeedsWorkCount,
      madisonGenerationTruthReviewSummary.launchBlockingTruthRows,
      madisonGenerationBatchPlan?.summary.byLane,
      madisonGenerationBatchPlan?.summary.selectedRows,
      readinessNeedsMeasurement,
      readinessNeedsPromptPolicy,
      skuJobStats.convexSynced,
      skuJobStats.generating,
      skuJobStats.queued,
      skuJobStats.total,
      stageInSightTargetTotal,
      stagingUiReferenceAudit?.summary.blockedTruthReviewRows,
      stagingUiReferenceAudit?.summary.flaggedRows,
      stagingUiReferenceAudit?.summary.rowsNeedingGeneration,
      stagingUiReferenceAudit?.summary.rowsNeedingSyncOrPush,
      websiteTruthBlockingRows,
    ],
  );

  const selectedNeedsWorkRows = useMemo(() => {
    if (selectedNeedsWorkIds.size === 0) return [];
    const rowsById = new Map(allNeedsWorkRowsUnfiltered.map((row) => [row.id, row]));
    return Array.from(selectedNeedsWorkIds)
      .map((id) => rowsById.get(id))
      .filter((row): row is NeedsWorkRow => Boolean(row));
  }, [allNeedsWorkRowsUnfiltered, selectedNeedsWorkIds]);

  const needsWorkRowsByGraceSku = useMemo(() => {
    const map = new Map<string, NeedsWorkRow>();
    for (const row of allNeedsWorkRowsUnfiltered) {
      const key = skuLookupKey(row.graceSku);
      if (key && !map.has(key)) map.set(key, row);
    }
    return map;
  }, [allNeedsWorkRowsUnfiltered]);

  const bulkCreateRows =
    selectedNeedsWorkRows.length > 0 ? selectedNeedsWorkRows : queuedBulkCreateHandoffRows;
  const bulkCreateMode =
    selectedNeedsWorkRows.length > 0 || queuedBulkCreateHandoffRows.length === 0
      ? "selection"
      : "queued-handoff";
  const bulkCreateSummary = useMemo(
    () => summarizeBulkCreateSelection(bulkCreateRows),
    [bulkCreateRows],
  );

  const handleOpenCylinderPilot = () => {
    setCoverageView("cylinder-pilot");
    setFamilyFilter("all");
    setStatusFilter("all");
    setNeedsWorkActionFilter("all");
    setStageInSightGenerationOnly(false);
    setSelectedNeedsWorkIds(new Set());
  };

  const handleOpenFamilyWorkbench = (family = "Cylinder") => {
    setCoverageView("pdp-readiness");
    setFamilyFilter(family);
    setStatusFilter("all");
    setNeedsWorkActionFilter("all");
    setStageInSightGenerationOnly(false);
    setSelectedNeedsWorkIds(new Set());
  };

  const handleOpenPdpFamilyQueue = (family: string) => {
    setCoverageView("needs-work");
    setFamilyFilter(family);
    setStatusFilter("all");
    setNeedsWorkActionFilter("all");
    setStageInSightGenerationOnly(false);
    setSelectedNeedsWorkIds(new Set());
  };

  const handleOpenGapWorklist = (family: string) => {
    setCoverageView("gap-worklist");
    setFamilyFilter(family);
    setStageInSightGenerationOnly(false);
    setGapWorklistLaneFilter("all");
  };

  const handleToggleAdvancedPipeline = () => {
    const nextValue = !showAdvancedPipeline;
    setShowAdvancedPipeline(nextValue);
    if (!nextValue && coverageView !== "pdp-readiness" && coverageView !== "cylinder-pilot") {
      handleOpenFamilyWorkbench(familyFilter === "all" ? "Cylinder" : familyFilter);
    }
  };

  const filteredCoverageGroups = useMemo(() => {
    const applyFilters = (groups: MadisonProductGroupCoverage[]) =>
      groups
        .filter((group) => familyFilter === "all" || group.family === familyFilter)
        .filter((group) =>
          matchesGroupWorkFilter(
            group,
            readinessByGroup.get(group.productGroupSlug),
            workflowByGroup.get(group.productGroupSlug),
            pipelineRowsBySlug.get(group.productGroupSlug),
            groupWorkFilter,
          ),
        )
        .slice(0, 500);

    // Prefer LIVE SKU-job data once jobs are persisted. The static
    // best-bottles-madison-pipeline-ui.json snapshot is a stale (May) audit
    // export — it must NOT shadow the live database. See the pipeline brief §2:
    // "don't trust its absolute counts; rebuild from intake + the live table."
    // It stays only as a cold-start fallback for orgs that haven't seeded jobs.
    if (hasPersistedSkuJobs) {
      return applyFilters(buildCoverageGroupsFromSkuJobs(skuJobs));
    }

    if (coverageData?.productGroups) {
      return applyFilters(coverageData.productGroups);
    }

    return [];
  }, [
    coverageData?.productGroups,
    familyFilter,
    groupWorkFilter,
    hasPersistedSkuJobs,
    pipelineRowsBySlug,
    readinessByGroup,
    skuJobs,
    workflowByGroup,
  ]);

  // ─── Import ───────────────────────────────────────────────────────────────

  const handleCsvFile = async (file: File) => {
    if (!organizationId) return;
    setImporting(true);
    try {
      const text = await file.text();
      const result = await importPipelineCsv(text, organizationId);
      console.log("[pipeline-import-ui] result:", result);
      if (result.errors.length > 0) {
        toast.error(`Import completed with errors`, {
          description: result.errors.join("\n"),
          duration: 30000,
        });
      } else if (result.inserted === 0 && result.skipped === 0) {
        toast.error("Import returned 0 rows", {
          description:
            "The CSV parsed but no rows were inserted. Check the browser console for [pipeline-import] logs with full details.",
          duration: 30000,
        });
      } else {
        toast.success(
          `Imported ${result.inserted} rows` +
            (result.skipped > 0 ? ` · ${result.skipped} skipped` : ""),
        );
      }
      queryClient.invalidateQueries({ queryKey: ["best-bottles-pipeline-groups"] });
    } catch (err) {
      toast.error("Import failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSeedSkuJobs = async () => {
    if (!organizationId || !coverageData) return;
    setSeedingSkuJobs(true);
    try {
      const result = await seedPipelineSkuJobsFromCoverage({
        organizationId,
        products: coverageData.products,
        groups: rows,
        existingJobs: skuJobs,
      });
      toast.success(`Seeded ${result.upserted} SKU jobs`, {
        description:
          result.skipped > 0
            ? `${result.skipped} rows skipped because required SKU/group fields were missing.`
            : "May 14 + Convex coverage is now persisted for Madison workflow tracking.",
      });
      queryClient.invalidateQueries({ queryKey: ["best-bottles-pipeline-sku-jobs"] });
    } catch (err) {
      toast.error("SKU job seed failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSeedingSkuJobs(false);
    }
  };

  const handleQueueReadySkuJobs = async (
    productGroupSlug: string,
    readyGraceSkus?: string[],
  ) => {
    if (!organizationId) return;
    try {
      const queued = await markPipelineSkuJobsQueued({
        organizationId,
        productGroupSlug,
        graceSkus: readyGraceSkus,
      });
      toast.success(
        queued > 0
          ? `Queued ${queued} ready SKU job${queued === 1 ? "" : "s"}`
          : "No ready SKU jobs to queue",
      );
      queryClient.invalidateQueries({ queryKey: ["best-bottles-pipeline-sku-jobs"] });
    } catch (err) {
      toast.error("Could not queue SKU jobs", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleToggleNeedsWorkRow = (id: string, selected: boolean) => {
    setQueuedBulkCreateHandoffRows([]);
    setSelectedNeedsWorkIds((current) => {
      const next = new Set(current);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleToggleNeedsWorkRows = (ids: string[], selected: boolean) => {
    setQueuedBulkCreateHandoffRows([]);
    setSelectedNeedsWorkIds((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (selected) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const handleClearNeedsWorkSelection = () => {
    setSelectedNeedsWorkIds(new Set());
    setQueuedBulkCreateHandoffRows([]);
  };

  const handleSelectBatchNeedsWorkRows = (
    batchRows: MadisonGenerationBatchRow[],
    openBulkCreate = false,
  ) => {
    const matchedIds = batchRows
      .map((row) => needsWorkRowsByGraceSku.get(skuLookupKey(row.graceSku))?.id)
      .filter((id): id is string => Boolean(id));

    if (matchedIds.length === 0) {
      toast.info("No matching live Needs Work rows found for this batch.", {
        description: "The batch remains visible here, but those SKUs may already be queued, synced, or not yet persisted as SKU jobs.",
      });
      return;
    }

    setFamilyFilter("all");
    setNeedsWorkActionFilter("all");
    setStageInSightGenerationOnly(false);
    setCoverageView("needs-work");
    setQueuedBulkCreateHandoffRows([]);
    setSelectedNeedsWorkIds(new Set(matchedIds));
    if (openBulkCreate) setBulkCreateOpen(true);

    toast.success(`Selected ${matchedIds.length} batch row${matchedIds.length === 1 ? "" : "s"}`, {
      description: "Use Bulk create to intake, queue, or continue the selected work.",
    });
  };

  const handleSelectStagingUiAuditNeedsWorkRows = (
    auditRows: BestBottlesStagingUiAuditRow[],
    openBulkCreate = false,
  ) => {
    const matchedIds = auditRows
      .map((row) => needsWorkRowsByGraceSku.get(skuLookupKey(row.graceSku))?.id)
      .filter((id): id is string => Boolean(id));

    if (matchedIds.length === 0) {
      toast.info("No matching live Needs Work rows found for these staging UI rows.", {
        description: "They may already be queued, synced, or still need the generated audit manifest imported into Madison.",
      });
      return;
    }

    setFamilyFilter("all");
    setNeedsWorkActionFilter("all");
    setStageInSightGenerationOnly(false);
    setCoverageView("needs-work");
    setQueuedBulkCreateHandoffRows([]);
    setSelectedNeedsWorkIds(new Set(matchedIds));
    if (openBulkCreate) setBulkCreateOpen(true);

    toast.success(`Selected ${matchedIds.length} staging UI row${matchedIds.length === 1 ? "" : "s"}`, {
      description: "Use Bulk create to intake, queue, or continue the selected work.",
    });
  };

  const handleOpenGenerationGapStage = (stageId: BestBottlesGenerationGapStageId) => {
    setFamilyFilter("all");
    setStatusFilter("all");
    setStageInSightGenerationOnly(false);

    if (stageId === "audit-staging-ui") {
      setCoverageView("staging-ui-reference");
      return;
    }

    if (stageId === "truth-and-measurements") {
      if ((readinessNeedsMeasurement ?? 0) > 0) {
        setCoverageView("groups");
        setGroupWorkFilter("needs-measurement");
      } else if ((readinessNeedsPromptPolicy ?? 0) > 0) {
        setCoverageView("groups");
        setGroupWorkFilter("needs-policy");
      } else if ((stagingUiReferenceAudit?.summary.blockedTruthReviewRows ?? 0) > 0) {
        setCoverageView("staging-ui-reference");
      } else {
        setCoverageView("launch-batches");
      }
      return;
    }

    if (stageId === "source-references") {
      setCoverageView("needs-work");
      if ((globalNeedsWorkStats.get("import-local-reference") ?? 0) > 0) {
        setNeedsWorkActionFilter("import-local-reference");
      } else if ((globalNeedsWorkStats.get("source-website-reference") ?? 0) > 0) {
        setNeedsWorkActionFilter("source-website-reference");
      } else {
        setNeedsWorkActionFilter("needs-source-match");
      }
      return;
    }

    if (stageId === "launch-batches") {
      setCoverageView("launch-batches");
      return;
    }

    if (stageId === "ready-to-generate") {
      setCoverageView("needs-work");
      setNeedsWorkActionFilter("ready-to-generate");
      return;
    }

    if (stageId === "queued-running") {
      setCoverageView("needs-work");
      setNeedsWorkActionFilter("generate-image");
      return;
    }

    if (stageId === "review-generated") {
      setCoverageView("needs-work");
      setNeedsWorkActionFilter("review-generated");
      return;
    }

    if (stageId === "push-shopify") {
      setCoverageView("needs-work");
      setNeedsWorkActionFilter("push-to-shopify");
      return;
    }

    if (stageId === "sync-convex") {
      setCoverageView("needs-work");
      setNeedsWorkActionFilter("sync-convex");
      return;
    }

    setCoverageView("sku-jobs");
    setSkuJobFilter("convex-synced");
  };

  const handleQueueGenerateReadyRows = async (rowsToQueue: NeedsWorkRow[]) => {
    if (!organizationId) return;
    const queueRows = rowsToQueue.filter(isReadyToGenerateRow);

    if (queueRows.length === 0) {
      toast.info("No selected SKU jobs are ready to queue.");
      return;
    }

    const groups = new Map<string, string[]>();
    for (const row of queueRows) {
      const graceSkus = groups.get(row.productGroupSlug) ?? [];
      graceSkus.push(row.graceSku);
      groups.set(row.productGroupSlug, graceSkus);
    }

    setBulkQueueing(true);
    try {
      let queued = 0;
      for (const [productGroupSlug, graceSkus] of groups) {
        queued += await markPipelineSkuJobsQueued({
          organizationId,
          productGroupSlug,
          graceSkus,
        });
      }

      toast.success(
        queued > 0
          ? `Queued ${queued} SKU image${queued === 1 ? "" : "s"}`
          : "No ready SKU jobs changed status",
        {
          description:
            queueRows.length !== queued
              ? `${queueRows.length} selected row${queueRows.length === 1 ? "" : "s"} were checked; already-queued rows stay untouched.`
              : undefined,
        },
      );
      queryClient.invalidateQueries({ queryKey: ["best-bottles-pipeline-sku-jobs"] });

      const queuedIds = new Set(queueRows.map((row) => row.id));
      setQueuedBulkCreateHandoffRows(
        queued > 0 ? buildBulkCreateQueuedHandoffRows(queueRows) : [],
      );
      setSelectedNeedsWorkIds((current) => {
        const next = new Set(current);
        for (const id of queuedIds) next.delete(id);
        return next;
      });
    } catch (err) {
      toast.error("Could not queue selected SKU jobs", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBulkQueueing(false);
    }
  };

  const handleQueueSelectedGenerateReady = async () => {
    await handleQueueGenerateReadyRows(selectedNeedsWorkRows);
  };

  const handlePushNeedsWorkRows = async (rowsToPush: NeedsWorkRow[]) => {
    const pushRows = rowsToPush.filter(
      (row) => row.persisted && row.action === "push-to-shopify",
    );

    if (pushRows.length === 0) {
      toast.info("No selected SKU jobs are push ready.");
      return;
    }

    const groupSlugs = Array.from(new Set(pushRows.map((row) => row.productGroupSlug)));
    for (const productGroupSlug of groupSlugs) {
      await handlePushApprovedSkuJobs(productGroupSlug);
    }
  };

  const handlePushSelectedNeedsWorkRows = async () => {
    await handlePushNeedsWorkRows(selectedNeedsWorkRows);
  };

  const handleUpdateSkuJobStatus = async (
    job: PipelineSkuJob,
    status: "approved" | "rejected",
  ) => {
    try {
      if (status === "approved") {
        if (!organizationId) {
          throw new Error("An organization is required to approve a SKU image.");
        }
        if (!job.generated_image_id) {
          throw new Error(`${job.grace_sku} has no generated image candidate to approve.`);
        }
        await approveBestBottlesGeneratedMaster({
          organizationId,
          pipelineSkuJobId: job.id,
          imageId: job.generated_image_id,
        });
        queryClient.invalidateQueries({ queryKey: ["best-bottles-approval-status"] });
        queryClient.invalidateQueries({ queryKey: [BEST_BOTTLES_RECONCILIATION_QUERY_KEY] });
      } else {
        await updatePipelineSkuJob(job.id, {
          status,
          last_error: job.last_error,
        });
      }
      toast.success(status === "approved" ? "SKU approved" : "SKU rejected", {
        description: `${job.grace_sku} · ${job.website_sku}`,
      });
      queryClient.invalidateQueries({ queryKey: ["best-bottles-pipeline-sku-jobs"] });
    } catch (err) {
      toast.error("Could not update SKU job", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handlePushApprovedSkuJobs = async (productGroupSlug: string) => {
    if (!organizationId) return;
    const approvedJobs = skuJobs.filter(
      (job) =>
        job.product_group_slug === productGroupSlug &&
        job.status === "approved" &&
        Boolean(job.approved_image_url) &&
        Boolean(job.shopify_sku?.trim()) &&
        approvalStatusForImageId(
          approvalStatusByImageId,
          job.approved_image_id,
          job.generated_image_id,
        ) === "approved-keep",
    );
    if (approvedJobs.length === 0) {
      toast.info("No approved-keep SKU jobs with image URLs and Shopify SKUs to push.");
      return;
    }

    setPushingGroupSlug(productGroupSlug);
    try {
      const pushItems = approvedJobs.map(buildBestBottlesShopifyPushItemFromSkuJob);
      const { data: preflightData, error: preflightError } = await supabase.functions.invoke("push-shopify-product-images", {
        body: {
          organizationId,
          items: pushItems,
          attachToVariant: true,
          syncBestBottlesConvex: true,
          enforceBestBottlesFinishMatch: true,
          dryRun: true,
        },
      });

      if (preflightError) throw preflightError;
      if (preflightData?.error) throw new Error(preflightData.error);
      const preflightResults = Array.isArray(preflightData?.results) ? preflightData.results : [];
      const preflightFailures = preflightResults.filter(
        (result: { status?: string }) => result.status !== "dry-run",
      );
      if (Number(preflightData?.failedCount ?? 0) > 0 || preflightFailures.length > 0) {
        const firstFailure = preflightResults.find((result: { status?: string; message?: string }) => result.status === "failed");
        throw new Error(firstFailure?.message ?? "Shopify dry-run preflight did not resolve every SKU to exactly one variant.");
      }

      // The publish guard short-circuits on dry runs, so a clean preflight does
      // not imply a writable push. Mint the single-use authorizations it needs
      // before the real call.
      const authorizedItems = await attachPublishAuthorizations({
        organizationId,
        items: pushItems,
      });

      const { data, error } = await supabase.functions.invoke("push-shopify-product-images", {
        body: {
          organizationId,
          items: authorizedItems,
          attachToVariant: true,
          syncBestBottlesConvex: true,
          enforceBestBottlesFinishMatch: true,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const results = Array.isArray(data?.results) ? data.results : [];
      const failedCount = Number(data?.failedCount ?? 0);

      await Promise.all(
        results
          .filter((result: { status?: string; sku?: string }) => result.status === "success" && result.sku)
          .map((result: {
            sku: string;
            shopifyProductId?: string | null;
            shopifyVariantId?: string | null;
            mediaId?: string | null;
            shopifyImageUrl?: string | null;
            matchedShopifySku?: string | null;
            actualShopifySku?: string | null;
            bestBottlesConvex?: unknown;
          }) =>
            markPipelineSkuJobSyncedBySku({
              organizationId,
              patch: {
                sku: result.sku,
                shopifySku: result.actualShopifySku ?? result.matchedShopifySku ?? result.sku,
                shopifyProductId: result.shopifyProductId ?? null,
                shopifyVariantId: result.shopifyVariantId ?? null,
                shopifyMediaId: result.mediaId ?? null,
                shopifyImageUrl: result.shopifyImageUrl ?? null,
                convexSynced: Boolean(result.bestBottlesConvex),
              },
            }),
          ),
      );

      const backfill = await backfillPipelineConvexImages({
        organizationId,
        productGroupSlug,
        skus: approvedJobs.flatMap((job) =>
          [job.grace_sku, job.website_sku, job.shopify_sku].filter((sku): sku is string => Boolean(sku)),
        ),
      });

      if (failedCount > 0) {
        const firstFailure = results.find((result: { status?: string; message?: string }) => result.status === "failed");
        toast.warning(`Recovered ${backfill.syncedCount ?? 0} pushed SKU job${backfill.syncedCount === 1 ? "" : "s"}`, {
          description:
            firstFailure?.message ?? `${failedCount} SKU${failedCount === 1 ? "" : "s"} still need review.`,
        });
      } else {
        toast.success(`Pushed ${approvedJobs.length} approved SKU job${approvedJobs.length === 1 ? "" : "s"}`, {
          description: `Shopify media, CDN URLs, and Convex sync were reconciled (${backfill.syncedCount ?? 0} backfilled).`,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["best-bottles-pipeline-sku-jobs"] });
    } catch (err) {
      toast.error("Approved SKU push failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setPushingGroupSlug(null);
    }
  };

  const handleReconcileShopifyPushes = async () => {
    if (!organizationId) return;
    setReconcilingShopifyPushes(true);
    try {
      const result = await reconcilePipelineShopifyPushes({
        organizationId,
        existingJobs: skuJobs,
      });

      const summary = [
        `${result.productImageLogs} image log${result.productImageLogs === 1 ? "" : "s"} scanned`,
        `${result.updated} updated`,
        `${result.alreadyAccounted} already accounted`,
        result.unmatched > 0 ? `${result.unmatched} unmatched` : null,
      ]
        .filter((part): part is string => Boolean(part))
        .join(" · ");

      if (result.updated > 0) {
        toast.success(`Reconciled ${result.updated} historical Shopify push${result.updated === 1 ? "" : "es"}`, {
          description: summary,
        });
      } else if (result.unmatched > 0) {
        toast.warning("Historical Shopify pushes need review", {
          description: `${summary}. Unmatched: ${result.unmatchedSkus.join(", ")}`,
        });
      } else {
        toast.success("Shopify pushes already accounted for", {
          description: summary,
        });
      }

      queryClient.invalidateQueries({ queryKey: ["best-bottles-pipeline-sku-jobs"] });
    } catch (err) {
      toast.error("Could not reconcile Shopify pushes", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setReconcilingShopifyPushes(false);
    }
  };

  // ─── Reference image sync ─────────────────────────────────────────────────
  //
  // Pulls the hero image from each row's product_url via the
  // scrape-product-reference edge function and stores it in
  // legacy_hero_image_url. Skips rows that already have one (fill-the-gaps
  // semantics) unless `force` is true — forcing is a follow-up UI feature;
  // P0 just runs the gap-fill path.
  const missingReferenceCount = useMemo(
    () =>
      rows.filter((r) => r.product_url && !r.legacy_hero_image_url).length,
    [rows],
  );

  const handleSyncReferences = async () => {
    if (!organizationId) return;
    if (missingReferenceCount === 0) {
      toast.info("All rows already have reference images.");
      return;
    }
    setSyncing(true);
    setSyncProgress({
      total: missingReferenceCount,
      completed: 0,
      succeeded: 0,
      skipped: 0,
      failed: 0,
    });
    try {
      const existing = new Map(
        rows.map((r) => [r.id, r.legacy_hero_image_url ?? null] as const),
      );
      const inputRows = rows
        .filter((r) => r.product_url && !r.legacy_hero_image_url)
        .map((r) => ({
          id: r.id,
          productUrl: r.product_url,
          displayName: r.display_name,
        }));
      const outcomes = await syncReferenceImages(inputRows, existing, {
        concurrency: 4,
        force: false,
        onProgress: (p) => setSyncProgress(p),
      });
      const synced = outcomes.filter((o) => o.status === "synced").length;
      const failed = outcomes.filter((o) => o.status === "error").length;
      if (synced > 0) {
        toast.success(`Synced ${synced} reference images`, {
          description: failed > 0 ? `${failed} rows failed` : undefined,
        });
      } else if (failed > 0) {
        toast.error(`Sync finished with ${failed} failures`, {
          description: "Check the product URLs or try again later.",
        });
      } else {
        toast.info("Nothing to sync");
      }
      queryClient.invalidateQueries({ queryKey: ["best-bottles-pipeline-groups"] });
    } catch (err) {
      toast.error("Sync failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSyncing(false);
      // Keep the last progress snapshot visible briefly so the operator can
      // see the final tallies before the pill disappears.
      setTimeout(() => setSyncProgress(null), 4000);
    }
  };

  // ─── Pin master reference ─────────────────────────────────────────────────
  //
  // One-click toggle on the reference thumbnails. Clicking a non-pinned
  // thumbnail pins it (unpinning any sibling in the same shape group);
  // clicking the currently-pinned thumbnail clears the pin. The DB layer
  // enforces "at most one pinned row per shape group" via a partial
  // unique index, so the client-side unpin-then-pin is safe even if two
  // users race — the loser just gets a uniqueness error and re-queries.
  const handleToggleMasterReference = async (
    row: PipelineGroup,
  ): Promise<void> => {
    if (!organizationId) return;
    try {
      if (row.is_hero_reference) {
        await clearShapeGroupMasterReference(row.id);
        toast.info("Master reference cleared", {
          description: row.display_name,
        });
      } else {
        await setShapeGroupMasterReference({
          organizationId,
          rowId: row.id,
          family: row.family,
          capacityMl: row.capacity_ml,
          threadSize: row.thread_size,
        });
        toast.success("Master reference pinned", {
          description: row.display_name,
        });
      }
      queryClient.invalidateQueries({
        queryKey: ["best-bottles-pipeline-groups"],
      });
    } catch (err) {
      toast.error("Couldn't update master reference", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // ─── Launch ──────────────────────────────────────────────────────────────
  //
  // Build a pre-fill from the shape group: pre-tick every unique
  // (color, applicator) present in the group's rows so the operator opens
  // Consistency Mode with the right matrix already selected.
  const handleLaunchShapeGroup = (group: ShapeGroup) => {
    const colorIds = new Set<string>();
    const fitmentIds = new Set<string>();

    for (const row of group.rows) {
      const colorKey = row.glass_color ?? "";
      const colorOpt = GLASS_COLOR_TO_OPTION[colorKey];
      if (colorOpt) colorIds.add(colorOpt);

      // applicator_types can hold multiple comma-separated values
      const apps = (row.applicator_types ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const app of apps) {
        const fitOpt = APPLICATOR_TO_FITMENT[app];
        if (fitOpt) fitmentIds.add(fitOpt);
      }
    }

    const shapeLabel =
      `${group.family}` +
      (group.capacityMl != null ? ` · ${group.capacityMl}ml` : "") +
      (group.threadSize ? ` · ${group.threadSize}` : "");

    // Pick a representative reference image for the shape group. Priority:
    //   1. Operator-pinned master reference (is_hero_reference === true)
    //   2. First row with a synced legacy_hero_image_url (back-compat)
    // Consistency Mode pre-loads the resolved URL as the master reference
    // so the operator skips the "find a PSD, flatten, screenshot, upload"
    // loop when a valid product-page image already covers the shape.
    const pinnedRow = group.rows.find(
      (r) => r.is_hero_reference && r.legacy_hero_image_url,
    );
    const rowWithReference =
      pinnedRow ?? group.rows.find((r) => r.legacy_hero_image_url);

    writePipelinePrefill({
      shapeKey: group.key,
      shapeLabel,
      pipelineGroupIds: group.rows.map((r) => r.id),
      pipelineRows: group.rows.map(toPipelineRowDescriptor),
      bottleColorIds: Array.from(colorIds),
      fitmentIds: Array.from(fitmentIds),
      family: group.family,
      capacityMl: group.capacityMl,
      threadSize: group.threadSize,
      masterReferenceUrl: rowWithReference?.legacy_hero_image_url ?? undefined,
      masterReferenceLabel: rowWithReference?.display_name ?? undefined,
    });

    navigate("/darkroom?mode=consistency&from=pipeline");
  };

  const handleExportSnapshot = () => {
    const headers = [
      "Row #",
      "Family",
      "Capacity (ml)",
      "Capacity",
      "Glass Color",
      "Applicator Types",
      "Thread Size",
      "Display Name",
      "Category",
      "Collection",
      "Convex Slug",
      "Convex ID",
      "Primary Grace SKU",
      "Primary Website SKU",
      "All Legacy SKUs",
      "Product URL",
      "Has Hero Image?",
      "Hero Image URL",
      "Variant Count",
      "Price Min ($)",
      "Price Max ($)",
      "Reference Status",
      "Madison Status",
      "Approved Image ID",
      "Approved At",
      "Last Error",
      "Notes",
    ];
    const lines = [
      headers.join(","),
      ...rows.map((row) =>
        [
          row.tracker_row_number ?? "",
          row.family,
          row.capacity_ml ?? "",
          row.capacity_label ?? "",
          row.glass_color ?? "",
          row.applicator_types ?? "",
          row.thread_size ?? "",
          row.display_name,
          row.category ?? "",
          row.collection ?? "",
          row.convex_slug ?? "",
          row.convex_id ?? "",
          row.primary_grace_sku ?? "",
          row.primary_website_sku ?? "",
          row.all_legacy_skus ?? "",
          row.product_url ?? "",
          row.legacy_has_hero_image ? "Yes" : "No",
          row.legacy_hero_image_url ?? "",
          row.variant_count ?? "",
          row.price_min_cents != null ? (row.price_min_cents / 100).toFixed(2) : "",
          row.price_max_cents != null ? (row.price_max_cents / 100).toFixed(2) : "",
          row.is_hero_reference
            ? "pinned-master-reference"
            : row.legacy_hero_image_url
              ? "synced-reference"
              : row.product_url
                ? "needs-reference-sync"
                : "no-product-url",
          row.madison_status,
          row.madison_approved_image_id ?? "",
          row.madison_approved_at ?? "",
          row.madison_last_error ?? "",
          row.madison_notes ?? "",
        ]
          .map(csvCell)
          .join(","),
      ),
    ];

    const blob = new Blob([lines.join("\n") + "\n"], {
      type: "text/csv;charset=utf-8",
    });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    anchor.href = href;
    anchor.download = `best-bottles-madison-hero-tracking-${stamp}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(href);
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  if (flagLoading) {
    return <FullPageSpinner label="Checking permissions…" />;
  }

  if (!enabled) {
    return <FeatureDisabledNotice />;
  }

  const totalJobs = readinessTotal ?? (skuJobStats.total || coverageData?.summary.productVariants || 0);

  return (
    <div className="min-h-screen bg-[#0b0b0d] text-[var(--darkroom-text,#e8e6e0)] p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header + stats */}
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Best Bottles Madison Pipeline</h1>
            <p className="text-sm text-white/60 mt-1">
              Family workbench for lining up bottles, renamed references, generated masters,
              Shopify pushes, and Convex sync.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleCsvFile(f);
              }}
            />
            <Button
              variant={coverageView === "pdp-readiness" ? "brass" : "outline"}
              onClick={() => handleOpenFamilyWorkbench(familyFilter === "all" ? "Cylinder" : familyFilter)}
              title="Return to the family workbench."
            >
              <PackageCheck className="w-4 h-4 mr-2" />
              Family workbench
            </Button>
            <Button
              variant={coverageView === "cylinder-pilot" ? "brass" : "outline"}
              onClick={handleOpenCylinderPilot}
              title="Open a small Cylinder family slice to test reference, generation, visual QA, Shopify, and Convex flow."
            >
              <Play className="w-4 h-4 mr-2" />
              Start Cylinder pilot
            </Button>
            <Button
              variant={adhdMode ? "brass" : "outline"}
              onClick={() => setAdhdMode(!adhdMode)}
              title="Toggle ADHD Focus Mode: reduces visual noise, adds a Pomodoro timer, and focuses on one task at a time."
              className="gap-2 border-amber-500/25 text-white hover:bg-amber-500/5 hover:text-amber-300"
            >
              <Sparkles className={cn("w-4 h-4 text-amber-400", adhdMode && "animate-pulse")} />
              {adhdMode ? "Focus Mode: ON" : "Focus Mode"}
            </Button>
            <Button
              variant={showAdvancedPipeline ? "brass" : "outline"}
              onClick={handleToggleAdvancedPipeline}
              title="Show or hide the full audit dashboard."
            >
              <ListChecks className="w-4 h-4 mr-2" />
              {showAdvancedPipeline ? "Hide advanced" : "Advanced"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" title="Pipeline utilities">
                  <ListChecks className="w-4 h-4 mr-2" />
                  Utilities
                  <ChevronDown className="w-3.5 h-3.5 ml-1.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-[1300] min-w-[240px] border-white/10 bg-[#18181b] text-white">
                <DropdownMenuItem
                  disabled={syncing || !organizationId || missingReferenceCount === 0}
                  onClick={() => void handleSyncReferences()}
                  className="cursor-pointer gap-2 focus:bg-white/[0.08] focus:text-white"
                >
                  {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageDown className="w-4 h-4" />}
                  {syncing && syncProgress
                    ? `Syncing ${syncProgress.completed}/${syncProgress.total}`
                    : `Sync group refs${missingReferenceCount > 0 ? ` (${missingReferenceCount})` : ""}`}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={reconcilingShopifyPushes || !organizationId || !hasPersistedSkuJobs}
                  onClick={() => void handleReconcileShopifyPushes()}
                  className="cursor-pointer gap-2 focus:bg-white/[0.08] focus:text-white"
                >
                  {reconcilingShopifyPushes ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Reconcile pushes
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={seedingSkuJobs || !organizationId || !coverageData}
                  onClick={() => void handleSeedSkuJobs()}
                  className="cursor-pointer gap-2 focus:bg-white/[0.08] focus:text-white"
                >
                  {seedingSkuJobs ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackageCheck className="w-4 h-4" />}
                  Seed SKU jobs
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={rows.length === 0}
                  onClick={handleExportSnapshot}
                  className="cursor-pointer gap-2 focus:bg-white/[0.08] focus:text-white"
                >
                  <Download className="w-4 h-4" />
                  Export snapshot
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={importing || !organizationId}
                  onClick={() => fileInputRef.current?.click()}
                  className="cursor-pointer gap-2 focus:bg-white/[0.08] focus:text-white"
                >
                  {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  Import CSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <Card className="border-emerald-500/25 bg-emerald-500/[0.04] p-4 text-white">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-200">
                <PackageCheck className="h-4 w-4" />
                Cylinder Stage 1 production cutover
              </div>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-white/60">
                Exact Website + Grace SKU identity, canonical body geometry, reviewed opaque PNG evidence,
                and native-resolution validation now gate generation. Blocked identities remain visible and cannot borrow a reference.
              </p>
            </div>
            {cylinderProductionReadinessQuery.isLoading ? (
              <Badge variant="outline" className="border-white/15 text-white/60">Verifying artifact…</Badge>
            ) : cylinderProductionReadinessQuery.isError ? (
              <Badge variant="outline" className="border-rose-500/35 text-rose-300">Locked · artifact invalid</Badge>
            ) : (
              <div className="flex flex-wrap gap-2 text-[10px] font-mono uppercase tracking-wider">
                <Badge variant="outline" className="border-white/15 text-white/70">377 canonical</Badge>
                <Badge variant="outline" className="border-emerald-500/35 text-emerald-300">219 qualified</Badge>
                <Badge variant="outline" className="border-rose-500/35 text-rose-300">158 blocked</Badge>
                <Badge variant="outline" className="border-amber-500/35 text-amber-300">0 external writes</Badge>
              </div>
            )}
          </div>
        </Card>

        {/* Pipeline Stepper, Velocity, & Cost Panel */}
        {adhdMode ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <Card className="lg:col-span-4 p-5 border-amber-500/25 bg-amber-500/[0.02] text-white flex flex-col justify-between min-h-[160px]">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-amber-400/80 mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <Timer className="w-3.5 h-3.5" />
                    Pomodoro Focus Timer
                  </span>
                  <span className="text-[9px] bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 font-medium">
                    {timerMode === "work" ? "Focus Interval" : "Rest Interval"}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <div className="text-4xl font-mono font-bold tracking-tight text-white select-none">
                    {formatTimerTime(timeLeft)}
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant={timerActive ? "outline" : "brass"}
                      onClick={() => setTimerActive(!timerActive)}
                      className="h-8 text-xs font-semibold"
                    >
                      {timerActive ? <Pause className="w-3.5 h-3.5 mr-1" /> : <Play className="w-3.5 h-3.5 mr-1" />}
                      {timerActive ? "Pause" : "Start"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setTimerActive(false);
                        setTimeLeft(timerMode === "work" ? 25 * 60 : 5 * 60);
                      }}
                      className="h-8 text-xs text-white/70 border-white/10 hover:bg-white/[0.06]"
                      title="Reset Timer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-white/[0.04] flex items-center justify-between gap-2">
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      setTimerActive(false);
                      setTimerMode("work");
                      setTimeLeft(25 * 60);
                    }}
                    className={cn(
                      "text-[9px] font-mono px-2 py-1 rounded transition-all",
                      timerMode === "work"
                        ? "bg-amber-500/20 text-amber-200 font-semibold border border-amber-500/30"
                        : "bg-white/[0.02] text-white/50 border border-transparent hover:bg-white/[0.06]"
                    )}
                  >
                    Work (25m)
                  </button>
                  <button
                    onClick={() => {
                      setTimerActive(false);
                      setTimerMode("break");
                      setTimeLeft(5 * 60);
                    }}
                    className={cn(
                      "text-[9px] font-mono px-2 py-1 rounded transition-all",
                      timerMode === "break" && timeLeft === 5 * 60
                        ? "bg-emerald-500/20 text-emerald-200 font-semibold border border-emerald-500/30"
                        : "bg-white/[0.02] text-white/50 border border-transparent hover:bg-white/[0.06]"
                    )}
                  >
                    Short Break (5m)
                  </button>
                  <button
                    onClick={() => {
                      setTimerActive(false);
                      setTimerMode("break");
                      setTimeLeft(15 * 60);
                    }}
                    className={cn(
                      "text-[9px] font-mono px-2 py-1 rounded transition-all",
                      timerMode === "break" && timeLeft === 15 * 60
                        ? "bg-sky-500/20 text-sky-200 font-semibold border border-sky-500/30"
                        : "bg-white/[0.02] text-white/50 border border-transparent hover:bg-white/[0.06]"
                    )}
                  >
                    Long Break (15m)
                  </button>
                </div>
                <span className="text-[9px] text-white/40 font-mono italic">
                  Keep focus.
                </span>
              </div>
            </Card>

            <Card className="lg:col-span-8 p-5 border-white/[0.06] bg-[#121214] text-white flex flex-col justify-between min-h-[160px]">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-white/45 mb-2 flex items-center gap-1.5 font-semibold">
                  <Brain className="w-3.5 h-3.5 text-amber-400" />
                  ADHD Focus Coach
                </div>
                <h2 className="text-sm font-semibold text-white/90">
                  {timerMode === "work" ? "Focusing: One task at a time." : "Resting: Step away, stretch, drink water."}
                </h2>
                <p className="text-xs text-white/60 mt-1.5 leading-relaxed">
                  {timerMode === "work"
                    ? "Decision paralysis is real. Focus Mode hides complex grids, numbers, and the massive table. Below, we've extracted one product group at a time. Work on the active card, click 'Open Studio' to process it, and mark it off. There is no rush."
                    : "Take a real break! Close your eyes, walk around, or stretch. Avoid checking emails or other tabs. The timer will chime softly when it's time to return."}
                </p>
              </div>
              <div className="mt-3 flex items-center justify-between text-[10px] text-amber-300/80 font-medium">
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  Tip: Focus only on the target group displayed in Zen Mode below.
                </span>
              </div>
            </Card>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-12">
              <PipelineWorkflowStepper skuJobStats={skuJobStats} totalJobs={totalJobs} />
            </div>
            <div className="lg:col-span-6">
              <PipelineVelocityPanel skuJobStats={skuJobStats} totalJobs={totalJobs} />
            </div>
            <div className="lg:col-span-6">
              <OpenAiCostMeterPanel images={generatedImages} loading={imagesLoading} />
            </div>
          </div>
        )}

        {showAdvancedPipeline && (
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-9 gap-3">
            <StatCard label="Visual families" value={coverageData?.summary.broadFamilies ?? families.length} />
            <StatCard
              label="Product groups"
              value={
                hasPersistedSkuJobs
                  ? new Set(skuJobs.map((job) => job.product_group_slug)).size
                  : coverageData?.summary.productGroups ?? stats.total
              }
            />
            <StatCard
              label="SKU image jobs"
              value={totalJobs}
              detail={
                hasPersistedSkuJobs
                  ? `${skuJobs.length} live queue rows · ${persistedQueueGap ?? 0} report-only`
                  : "Audit snapshot"
              }
            />
            <StatCard
              label="Need reference"
              value={readinessNeedsReference ?? skuJobStats.needsReference}
              tone="warn"
              detail={`${skuJobStats.needsReference} live queue blocker${skuJobStats.needsReference === 1 ? "" : "s"}`}
              progress={{ value: totalJobs - (readinessNeedsReference ?? skuJobStats.needsReference), total: totalJobs }}
            />
            <StatCard
              label="Ready to generate"
              value={readinessReady ?? skuJobStats.readyToGenerate}
              tone="live"
              detail={`Queued ${skuJobStats.queued} · Running ${skuJobStats.generating}`}
              progress={{ value: totalJobs - (readinessNeedsReference ?? skuJobStats.needsReference) - (readinessReady ?? skuJobStats.readyToGenerate), total: totalJobs }}
            />
            <StatCard
              label="Generated/review"
              value={skuJobStats.generated}
              tone="live"
              detail={`Generated ${skuJobStats.generatedDone} · QA ${skuJobStats.qaPending} · Rejected ${skuJobStats.rejected}`}
              progress={{ value: skuJobStats.approved, total: totalJobs }}
            />
            <StatCard
              label="Approved"
              value={skuJobStats.approved}
              tone="ok"
              detail={`Pending push ${skuJobStats.approvedPendingPush} · Pushed ${skuJobStats.shopifyPushed}`}
              progress={{ value: skuJobStats.approved, total: totalJobs }}
            />
            <StatCard
              label="Shopify pushed"
              value={skuJobStats.shopifyPushed}
              tone="ok"
              detail={`Awaiting Convex ${skuJobStats.shopifyPushedPendingConvex}`}
              progress={{ value: skuJobStats.shopifyPushed, total: totalJobs }}
            />
            <StatCard
              label="Convex synced"
              value={skuJobStats.convexSynced}
              tone="ok"
              detail={`Finalized ${skuJobStats.convexSynced} · Awaiting ${skuJobStats.shopifyPushedPendingConvex}`}
              progress={{ value: skuJobStats.convexSynced, total: totalJobs }}
            />
          </div>
        )}

        {showAdvancedPipeline && coverageData && (
          <Card className="p-4 border-white/[0.06] bg-white/[0.02] text-white">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <div className="text-xs font-mono uppercase tracking-wider text-white/50">
                  Unified coverage source · {coverageData.summary.sourceOfTruthDate}
                </div>
                <div className="text-sm text-white/70 mt-1">
                  Live bestbottles.com is commercial truth; website SKU anchors Grace, Convex, Shopify, and Madison media.
                  This page tracks {coverageData.summary.productGroups} product groups
                  and {coverageData.summary.productVariants} SKU image jobs.
                  {hasPersistedSkuJobs
                    ? ` ${skuJobs.length} live SKU jobs are persisted in Madison${
                        persistedQueueGap && persistedQueueGap > 0
                          ? `; ${persistedQueueGap} rows are report-only until the job table can accept them.`
                          : "."
                      }`
                    : " Seed SKU jobs to turn this audit data into the live workflow queue."}
                </div>
                {readinessData && (
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-white/60">
                    <ReadinessMiniPill label="Convex ready" value={readinessReady ?? 0} tone="ok" />
                    <ReadinessMiniPill label="Need reference" value={readinessNeedsReference ?? 0} tone="warn" />
                    <ReadinessMiniPill label="Need measurement" value={readinessNeedsMeasurement ?? 0} />
                    <ReadinessMiniPill label="Need policy" value={readinessNeedsPromptPolicy ?? 0} />
                    <ReadinessMiniPill label="Components" value={readinessComponentExceptions ?? 0} />
                    <ReadinessMiniPill
                      label="Measurement overrides"
                      value={readinessData.summary.manualMeasurementOverrides}
                    />
                  </div>
                )}
                {referenceIntakeData && (
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-white/60">
                    <ReadinessMiniPill label="Local refs" value={referenceIntakeData.summary.localMatches} tone="ok" />
                    <ReadinessMiniPill label="Website refs" value={referenceIntakeData.summary.liveSiteCandidates} tone="warn" />
                    <ReadinessMiniPill label="No source match" value={referenceIntakeData.summary.unresolved} />
                    <ReadinessMiniPill label="GIF conversion" value={referenceIntakeData.summary.conversionRequired} />
                  </div>
                )}
                {cylinderReferenceRigSummary && (
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-white/60">
                    <ReadinessMiniPill
                      label="Cylinder rig refs"
                      value={cylinderReferenceRigSummary.totalRows}
                      tone={cylinderReferenceRigBlocked > 0 ? "warn" : "ok"}
                    />
                    <ReadinessMiniPill
                      label="Import-ready"
                      value={cylinderReferenceRigReady}
                      tone={cylinderReferenceRigReady > 0 ? "ok" : undefined}
                    />
                    <ReadinessMiniPill
                      label="Need BG removal"
                      value={cylinderReferenceRigSummary.needsBackgroundRemoval}
                      tone={cylinderReferenceRigSummary.needsBackgroundRemoval > 0 ? "warn" : "ok"}
                    />
                    <ReadinessMiniPill
                      label="Need source"
                      value={cylinderReferenceRigSummary.needsSourceMatch}
                      tone={cylinderReferenceRigSummary.needsSourceMatch > 0 ? "warn" : "ok"}
                    />
                    <ReadinessMiniPill label="Cap-on refs" value={cylinderReferenceRigSummary.capOn} />
                    <ReadinessMiniPill label="Cap-off refs" value={cylinderReferenceRigSummary.capOff} />
                    <ReadinessMiniPill
                      label="Missing cap state"
                      value={cylinderReferenceRigSummary.capStateMissing}
                      tone={cylinderReferenceRigSummary.capStateMissing > 0 ? "warn" : "ok"}
                    />
                  </div>
                )}
                {stageInSightGenerationTargets && (
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-white/60">
                    <ReadinessMiniPill
                      label="Stage In Sight gen"
                      value={stageInSightGenerationTargets.summary.total}
                      tone="warn"
                    />
                    {STAGE_IN_SIGHT_GENERATION_FAMILY_TARGETS.map(({ family }) => (
                      <ReadinessMiniPill
                        key={family}
                        label={family}
                        value={stageInSightGenerationTargets.summary.byFamily[family] ?? 0}
                      />
                    ))}
                  </div>
                )}
                {madisonGenerationBatchPlan && (
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-white/60">
                    <ReadinessMiniPill
                      label="Launch batches"
                      value={madisonGenerationBatchPlan.summary.batchCount}
                      tone="warn"
                    />
                    <ReadinessMiniPill
                      label="Batch rows"
                      value={madisonGenerationBatchPlan.summary.selectedRows}
                    />
                    <ReadinessMiniPill
                      label="Attach CDN"
                      value={madisonGenerationBatchPlan.summary.byLane.attach_existing_cdn_before_generation}
                      tone="ok"
                    />
                    <ReadinessMiniPill
                      label="Local gen"
                      value={madisonGenerationBatchPlan.summary.byLane.generate_from_local_reference}
                    />
                    <ReadinessMiniPill
                      label="Website gen"
                      value={madisonGenerationBatchPlan.summary.byLane.generate_from_legacy_reference}
                    />
                    <ReadinessMiniPill
                      label="Truth blockers"
                      value={madisonGenerationTruthReviewSummary.launchBlockingTruthRows}
                      tone={madisonGenerationTruthReviewSummary.launchBlockingTruthRows > 0 ? "warn" : "ok"}
                    />
                    <ReadinessMiniPill
                      label="Component holds"
                      value={madisonGenerationTruthReviewSummary.componentMediaHolds}
                    />
                  </div>
                )}
                {stagingUiReferenceAudit && (
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-white/60">
                    <ReadinessMiniPill
                      label="Staging UI refs"
                      value={stagingUiReferenceAudit.summary.flaggedRows}
                      tone="warn"
                    />
                    <ReadinessMiniPill
                      label="Need generation"
                      value={stagingUiReferenceAudit.summary.rowsNeedingGeneration}
                    />
                    <ReadinessMiniPill
                      label="Need sync/push"
                      value={stagingUiReferenceAudit.summary.rowsNeedingSyncOrPush}
                      tone="ok"
                    />
                    <ReadinessMiniPill
                      label="Truth blocked"
                      value={stagingUiReferenceAudit.summary.blockedTruthReviewRows}
                    />
                  </div>
                )}
                {websiteTruthStatusData && (
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-white/60">
                    <ReadinessMiniPill
                      label="PDP truth"
                      value={websiteTruthPdpRows}
                      tone={websiteTruthBlockingRows > 0 ? "warn" : "ok"}
                    />
                    <ReadinessMiniPill
                      label="PDP blockers"
                      value={websiteTruthPdpBlockers}
                      tone={websiteTruthPdpBlockers > 0 ? "warn" : "ok"}
                    />
                    <ReadinessMiniPill label="Ready" value={websiteTruthReady} tone="ok" />
                    <ReadinessMiniPill
                      label="Need website check"
                      value={websiteTruthNeedsCheck}
                      tone={websiteTruthNeedsCheck > 0 ? "warn" : undefined}
                    />
                    <ReadinessMiniPill
                      label="Truth conflict"
                      value={websiteTruthConflict}
                      tone={websiteTruthConflict > 0 ? "warn" : undefined}
                    />
                    <ReadinessMiniPill
                      label="Alias exceptions"
                      value={websiteTruthAliasExceptions}
                      tone="ok"
                    />
                    <ReadinessMiniPill
                      label="Component lane"
                      value={websiteTruthComponentLane}
                    />
                    <ReadinessMiniPill
                      label="Live SKU confirmed"
                      value={websiteTruthStatusData.summary.liveWebsiteSkuConfirmedRows}
                      tone="ok"
                    />
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <ViewToggle
                  label="PDP readiness"
                  active={coverageView === "pdp-readiness"}
                  onClick={() => {
                    setCoverageView("pdp-readiness");
                    setStageInSightGenerationOnly(false);
                  }}
                  icon={<PackageCheck className="w-3.5 h-3.5" />}
                />
                <ViewToggle
                  label="Cylinder pilot"
                  active={coverageView === "cylinder-pilot"}
                  onClick={handleOpenCylinderPilot}
                  icon={<Play className="w-3.5 h-3.5" />}
                />
                <ViewToggle
                  label="Needs Work"
                  active={coverageView === "needs-work"}
                  onClick={() => setCoverageView("needs-work")}
                  icon={<AlertTriangle className="w-3.5 h-3.5" />}
                />
                <ViewToggle
                  label="Launch batches"
                  active={coverageView === "launch-batches"}
                  onClick={() => {
                    setCoverageView("launch-batches");
                    setFamilyFilter("all");
                    setStatusFilter("all");
                  }}
                  icon={<ListChecks className="w-3.5 h-3.5" />}
                />
                <ViewToggle
                  label="Staging UI refs"
                  active={coverageView === "staging-ui-reference"}
                  onClick={() => {
                    setCoverageView("staging-ui-reference");
                    setFamilyFilter("all");
                    setStatusFilter("all");
                  }}
                  icon={<Eye className="w-3.5 h-3.5" />}
                />
                <ViewToggle
                  label="Product groups"
                  active={coverageView === "groups"}
                  onClick={() => setCoverageView("groups")}
                  icon={<Rows3 className="w-3.5 h-3.5" />}
                />
                <ViewToggle
                  label="SKU image jobs"
                  active={coverageView === "sku-jobs"}
                  onClick={() => setCoverageView("sku-jobs")}
                  icon={<PackageCheck className="w-3.5 h-3.5" />}
                />
                <ViewToggle
                  label="Gap worklist"
                  active={coverageView === "gap-worklist"}
                  onClick={() => handleOpenGapWorklist(familyFilter === "all" ? "Cylinder" : familyFilter)}
                  icon={<FileText className="w-3.5 h-3.5" />}
                />
              </div>
            </div>
          </Card>
        )}

        {showAdvancedPipeline && (
          <GenerationGapPlan
            stages={generationGapStages}
            syncedCount={skuJobStats.convexSynced}
            totalCount={skuJobStats.total || coverageData?.summary.productVariants || 0}
            onOpenStage={handleOpenGenerationGapStage}
          />
        )}

        {/* Filters */}
        {showAdvancedPipeline &&
          coverageView !== "cylinder-pilot" &&
          coverageView !== "launch-batches" &&
          coverageView !== "staging-ui-reference" && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs text-white/50 uppercase tracking-wider">
              <Filter className="w-3 h-3" />
              Filters
            </div>

            <FilterChip
              label="All families"
              active={familyFilter === "all"}
              onClick={() => setFamilyFilter("all")}
            />
            {families.map((f) => (
              <FilterChip
                key={f}
                label={f}
                active={familyFilter === f}
                onClick={() => setFamilyFilter(f)}
              />
            ))}

            {coverageView === "groups" && (
              <>
                <div className="w-px h-4 bg-white/10 mx-1" />

                <FilterChip
                  label="All status"
                  active={statusFilter === "all"}
                  onClick={() => setStatusFilter("all")}
                />
                <FilterChip
                  label="Needs hero"
                  active={statusFilter === "no-hero"}
                  onClick={() => setStatusFilter("no-hero")}
                />
                <FilterChip
                  label="Has hero"
                  active={statusFilter === "has-hero"}
                  onClick={() => setStatusFilter("has-hero")}
                />
                <FilterChip
                  label="In progress"
                  active={statusFilter === "generating"}
                  onClick={() => setStatusFilter("generating")}
                />
              </>
            )}
          </div>
        )}

        {showAdvancedPipeline && coverageView === "needs-work" && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs text-white/50 uppercase tracking-wider">
              <AlertTriangle className="w-3 h-3" />
              Next action
            </div>
            <FilterChip
              label={`All unfinished (${allNeedsWorkRows.length})`}
              active={needsWorkActionFilter === "all"}
              onClick={() => setNeedsWorkActionFilter("all")}
            />
            <FilterChip
              label={`Ready to generate (${readyToGenerateNeedsWorkCount})`}
              active={needsWorkActionFilter === "ready-to-generate"}
              onClick={() => setNeedsWorkActionFilter("ready-to-generate")}
            />
            {stageInSightGenerationTargets && (
              <FilterChip
                label={`Stage In Sight gen (${stageInSightTargetTotal})`}
                active={stageInSightGenerationOnly}
                onClick={() => {
                  setCoverageView("needs-work");
                  setFamilyFilter("all");
                  setNeedsWorkActionFilter("all");
                  setStageInSightGenerationOnly((active) => !active);
                }}
              />
            )}
            {NEEDS_WORK_ACTION_ORDER.map((action) => (
              <FilterChip
                key={action}
                label={`${BEST_BOTTLES_NEEDS_WORK_ACTION_LABELS[action]} (${needsWorkStats.get(action) ?? 0})`}
                active={needsWorkActionFilter === action}
                onClick={() => setNeedsWorkActionFilter(action)}
              />
            ))}
          </div>
        )}

        {showAdvancedPipeline && coverageView === "needs-work" && stageInSightGenerationOnly && stageInSightGenerationTargets && (
          <Card className="border-amber-500/20 bg-amber-500/[0.045] p-4 text-white">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-sm font-medium text-amber-100">
                  Stage In Sight generation lane
                </div>
                <div className="mt-1 text-xs text-amber-100/70">
                  Showing {stageInSightShownCount} unfinished Pipeline rows from the exact {stageInSightTargetTotal} SKU generation target list.
                  Already-generated cleanup rows are excluded.
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {STAGE_IN_SIGHT_GENERATION_FAMILY_TARGETS.map(({ family }) => (
                  <span
                    key={family}
                    className="rounded border border-amber-500/20 bg-black/15 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-amber-50/75"
                  >
                    {family} {stageInSightFamilyCounts?.[family] ?? 0}
                  </span>
                ))}
              </div>
            </div>
          </Card>
        )}

        {showAdvancedPipeline && coverageView === "groups" && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs text-white/50 uppercase tracking-wider">
              <PackageCheck className="w-3 h-3" />
              Work view
            </div>
            <FilterChip label="All groups" active={groupWorkFilter === "all"} onClick={() => setGroupWorkFilter("all")} />
            <FilterChip label="Queue-ready" active={groupWorkFilter === "ready"} onClick={() => setGroupWorkFilter("ready")} />
            <FilterChip label="Needs ref" active={groupWorkFilter === "needs-reference"} onClick={() => setGroupWorkFilter("needs-reference")} />
            <FilterChip label="Missing measurements" active={groupWorkFilter === "needs-measurement"} onClick={() => setGroupWorkFilter("needs-measurement")} />
            <FilterChip label="Needs policy" active={groupWorkFilter === "needs-policy"} onClick={() => setGroupWorkFilter("needs-policy")} />
            <FilterChip label="Components" active={groupWorkFilter === "components"} onClick={() => setGroupWorkFilter("components")} />
            <FilterChip label="Generated/review" active={groupWorkFilter === "generated"} onClick={() => setGroupWorkFilter("generated")} />
            <FilterChip label="Approved" active={groupWorkFilter === "approved"} onClick={() => setGroupWorkFilter("approved")} />
            <FilterChip label="Shopify pushed" active={groupWorkFilter === "shopify-pushed"} onClick={() => setGroupWorkFilter("shopify-pushed")} />
            <FilterChip label="Not fully pushed" active={groupWorkFilter === "not-pushed"} onClick={() => setGroupWorkFilter("not-pushed")} />
            <FilterChip label="Convex synced" active={groupWorkFilter === "convex-synced"} onClick={() => setGroupWorkFilter("convex-synced")} />
          </div>
        )}

        {showAdvancedPipeline && coverageView === "sku-jobs" && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs text-white/50 uppercase tracking-wider">
              <PackageCheck className="w-3 h-3" />
              SKU status
            </div>
            <FilterChip label="All jobs" active={skuJobFilter === "all"} onClick={() => setSkuJobFilter("all")} />
            <FilterChip label="Needs reference" active={skuJobFilter === "needs-reference"} onClick={() => setSkuJobFilter("needs-reference")} />
            <FilterChip label="Ready to generate" active={skuJobFilter === "ready-to-generate"} onClick={() => setSkuJobFilter("ready-to-generate")} />
            <FilterChip label="Generated/review" active={skuJobFilter === "generated"} onClick={() => setSkuJobFilter("generated")} />
            <FilterChip label="Approved" active={skuJobFilter === "approved"} onClick={() => setSkuJobFilter("approved")} />
            <FilterChip label="Shopify pushed" active={skuJobFilter === "shopify-pushed"} onClick={() => setSkuJobFilter("shopify-pushed")} />
            <FilterChip label="Not pushed" active={skuJobFilter === "not-pushed"} onClick={() => setSkuJobFilter("not-pushed")} />
            <FilterChip label="Convex synced" active={skuJobFilter === "convex-synced"} onClick={() => setSkuJobFilter("convex-synced")} />
          </div>
        )}

        {/* Shape group cards */}
        {rowsLoading || coverageLoading || readinessLoading || skuJobsLoading || referenceIntakeLoading || stageInSightTargetsLoading || madisonGenerationBatchesLoading || stagingUiReferenceAuditLoading ? (
          <FullPageSpinner label="Loading pipeline…" />
        ) : coverageView === "pdp-readiness" ? (
          <PdpReadinessByFamily
            families={displayedPdpFamilies}
            allFamilies={pdpReadiness.families}
            summary={displayedPdpSummary}
            activeFamily={familyFilter}
            onSelectFamily={setFamilyFilter}
            onOpenFamilyQueue={handleOpenPdpFamilyQueue}
            onOpenCylinderPilot={handleOpenCylinderPilot}
            onOpenStudio={(slug) => navigate(`/best-bottles/studio/${slug}`)}
            onOpenGapWorklist={handleOpenGapWorklist}
            adhdMode={adhdMode}
          />
        ) : coverageView === "cylinder-pilot" ? (
          <CylinderPilotSlice
            rows={cylinderPilotRows}
            totalRows={cylinderPilotTotal}
            queueing={bulkQueueing}
            pushingGroupSlug={pushingGroupSlug}
            onOpenStudio={(slug) => navigate(`/best-bottles/studio/${slug}`)}
            onQueueRows={handleQueueGenerateReadyRows}
            onPushRows={handlePushNeedsWorkRows}
            onOpenFullQueue={() => {
              setCoverageView("needs-work");
              setFamilyFilter("Cylinder");
              setNeedsWorkActionFilter("all");
            }}
          />
        ) : coverageView === "launch-batches" ? (
          <LaunchBatchList
            plan={madisonGenerationBatchPlan ?? null}
            sections={madisonGenerationBatchSections}
            selectedNeedsWorkCount={selectedNeedsWorkRows.length}
            onSelectNeedsWorkRows={handleSelectBatchNeedsWorkRows}
            onOpenStudio={(slug) => navigate(`/best-bottles/studio/${slug}`)}
          />
        ) : coverageView === "staging-ui-reference" ? (
          <StagingUiReferenceAuditList
            audit={stagingUiReferenceAudit ?? null}
            sections={stagingUiReferenceSections}
            selectedNeedsWorkCount={selectedNeedsWorkRows.length}
            onSelectNeedsWorkRows={handleSelectStagingUiAuditNeedsWorkRows}
            onOpenStudio={(slug) => navigate(`/best-bottles/studio/${slug}`)}
          />
        ) : coverageView === "needs-work" ? (
          <>
            <NeedsWorkList
              rows={needsWorkRows}
              totalRows={
                stageInSightGenerationOnly
                  ? stageInSightTargetTotal
                  : hasPersistedSkuJobs
                    ? skuJobs.length
                    : (coverageData?.products ?? []).length
              }
              referenceIntakeData={referenceIntakeData ?? null}
              selectedIds={selectedNeedsWorkIds}
              selectedCount={selectedNeedsWorkRows.length}
              onToggleRow={handleToggleNeedsWorkRow}
              onToggleRows={handleToggleNeedsWorkRows}
              onSelectVisible={() => handleToggleNeedsWorkRows(needsWorkRows.map((row) => row.id), true)}
              onClearSelection={handleClearNeedsWorkSelection}
              onOpenBulkCreate={() => setBulkCreateOpen(true)}
              onQueueRows={handleQueueGenerateReadyRows}
              onPushRows={handlePushNeedsWorkRows}
              onOpenStudio={(slug) => navigate(`/best-bottles/studio/${slug}`)}
              queueing={bulkQueueing}
              pushingGroupSlug={pushingGroupSlug}
            />
            <BulkCreateDrawer
              open={bulkCreateOpen}
              onOpenChange={setBulkCreateOpen}
              rows={bulkCreateRows}
              mode={bulkCreateMode}
              summary={bulkCreateSummary}
              organizationId={organizationId}
              queueing={bulkQueueing}
              pushing={Boolean(pushingGroupSlug)}
              onQueueGenerateReady={handleQueueSelectedGenerateReady}
              onPushReady={handlePushSelectedNeedsWorkRows}
              onOpenStudio={(slug) => navigate(`/best-bottles/studio/${slug}`)}
            />
          </>
        ) : coverageView === "sku-jobs" ? (
          <SkuJobTable
            jobs={filteredSkuJobs}
            rowsBySlug={pipelineRowsBySlug}
            shownCount={filteredSkuJobs.length}
            totalCount={hasPersistedSkuJobs ? skuJobs.length : (coverageData?.products ?? []).length}
            onUpdateStatus={handleUpdateSkuJobStatus}
          />
        ) : coverageView === "gap-worklist" ? (
          <GapWorklistView
            family={familyFilter}
            entry={gapWorklistEntry}
            rows={gapWorklistRows}
            loading={gapWorklistLoading}
            laneFilter={gapWorklistLaneFilter}
            onLaneFilter={setGapWorklistLaneFilter}
            onOpenStudio={(slug) => navigate(`/best-bottles/studio/${slug}`)}
          />
        ) : filteredCoverageGroups.length > 0 ? (
          <CoverageGroupTable
            groups={filteredCoverageGroups}
            rowsBySlug={pipelineRowsBySlug}
            readinessByGroup={readinessByGroup}
            workflowByGroup={workflowByGroup}
            onOpenStudio={(slug) => navigate(`/best-bottles/studio/${slug}`)}
            onQueueReadySkuJobs={hasPersistedSkuJobs ? handleQueueReadySkuJobs : undefined}
            onPushApprovedSkuJobs={hasPersistedSkuJobs ? handlePushApprovedSkuJobs : undefined}
            pushingGroupSlug={pushingGroupSlug}
          />
        ) : shapeGroups.length === 0 ? (
          <EmptyState
            onImport={() => fileInputRef.current?.click()}
            hasAnyRows={rows.length > 0}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {shapeGroups.map((group) => {
              const studioSlug = resolveStudioSlugForGroup(group);
              return (
                <ShapeGroupCard
                  key={group.key}
                  group={group}
                  onLaunch={() => handleLaunchShapeGroup(group)}
                  onOpenStudio={
                    studioSlug
                      ? () => navigate(`/best-bottles/studio/${studioSlug}`)
                      : null
                  }
                  onToggleMaster={handleToggleMasterReference}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function toPipelineRowDescriptor(row: PipelineGroup): PipelineRowDescriptor {
  return {
    id: row.id,
    family: row.family,
    capacityMl: row.capacity_ml,
    threadSize: row.thread_size,
    glassColor: row.glass_color,
    applicatorTypes: row.applicator_types,
    displayName: row.display_name,
    convexSlug: row.convex_slug,
    primaryGraceSku: row.primary_grace_sku,
    primaryWebsiteSku: row.primary_website_sku,
    productUrl: row.product_url,
    legacyHasHeroImage: row.legacy_has_hero_image,
    legacyHeroImageUrl: row.legacy_hero_image_url,
    madisonStatus: row.madison_status,
  };
}

function RadialProgress({
  value,
  total,
  className,
}: {
  value: number;
  total: number;
  className?: string;
}) {
  const percentage = total > 0 ? Math.min(100, Math.max(0, Math.round((value / total) * 100))) : 0;
  const radius = 13;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className={cn("relative flex items-center justify-center w-8 h-8 flex-shrink-0", className)}>
      <svg className="w-full h-full -rotate-90">
        <circle
          cx="16"
          cy="16"
          r={radius}
          className="stroke-white/[0.08]"
          strokeWidth="2.5"
          fill="transparent"
        />
        <circle
          cx="16"
          cy="16"
          r={radius}
          className="stroke-current transition-all duration-500 ease-out"
          strokeWidth="2.5"
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute text-[8px] font-mono font-semibold text-white/90">
        {percentage}%
      </span>
    </div>
  );
}

function PipelineWorkflowStepper({
  skuJobStats,
  totalJobs,
}: {
  skuJobStats: {
    needsReference: number;
    readyToGenerate: number;
    approved: number;
    shopifyPushed: number;
    convexSynced: number;
  };
  totalJobs: number;
}) {
  const steps = [
    {
      id: "ref",
      label: "Reference Prep",
      value: totalJobs - skuJobStats.needsReference,
      color: "text-amber-400",
      barColor: "bg-amber-400",
    },
    {
      id: "gen",
      label: "AI Generation",
      value: totalJobs - skuJobStats.needsReference - skuJobStats.readyToGenerate,
      color: "text-sky-400",
      barColor: "bg-sky-400",
    },
    {
      id: "qa",
      label: "QA & Review",
      value: skuJobStats.approved,
      color: "text-violet-400",
      barColor: "bg-violet-400",
    },
    {
      id: "push",
      label: "Shopify Sync",
      value: skuJobStats.shopifyPushed,
      color: "text-emerald-400",
      barColor: "bg-emerald-400",
    },
    {
      id: "sync",
      label: "Convex Finalized",
      value: skuJobStats.convexSynced,
      color: "text-teal-400",
      barColor: "bg-teal-400",
    },
  ];

  return (
    <Card className="p-4 border-white/[0.06] bg-white/[0.02] text-white">
      <div className="text-[10px] font-mono uppercase tracking-wider text-white/50 mb-3 flex items-center justify-between">
        <span>Pipeline Stage Progress</span>
        <span className="text-[9px] text-white/40">Linear Progression</span>
      </div>
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 md:gap-2">
        {steps.map((step, idx) => {
          const percentage = totalJobs > 0 ? Math.round((step.value / totalJobs) * 100) : 0;
          return (
            <div key={step.id} className="flex-1 w-full flex items-center gap-2">
              <div className="flex-1 flex flex-col p-2.5 rounded border border-white/[0.04] bg-white/[0.01] hover:bg-white/[0.03] transition-all">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-medium truncate text-white/80">{step.label}</span>
                  <span className="text-[10px] font-mono font-semibold text-white/90">{percentage}%</span>
                </div>
                <div className="mt-2 h-1 w-full bg-white/[0.05] rounded-full overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all duration-500", step.barColor)} style={{ width: `${percentage}%` }} />
                </div>
                <div className="mt-1 flex items-center justify-between text-[9px] text-white/40 font-mono">
                  <span>{step.value.toLocaleString()} SKUs</span>
                  <span>/ {totalJobs.toLocaleString()}</span>
                </div>
              </div>
              {idx < steps.length - 1 && (
                <div className="hidden md:block w-3 h-px bg-white/10 flex-shrink-0" />
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function PipelineVelocityPanel({
  skuJobStats,
  totalJobs,
}: {
  skuJobStats: {
    convexSynced: number;
  };
  totalJobs: number;
}) {
  const clearanceRate = totalJobs > 0 ? Math.round((skuJobStats.convexSynced / totalJobs) * 100) : 0;
  const syncStreak = 5;
  const currentPace = 18;

  return (
    <Card className="p-4 border-white/[0.06] bg-white/[0.02] text-white h-full flex flex-col justify-between">
      <div>
        <div className="text-[10px] font-mono uppercase tracking-wider text-white/50 mb-3 flex items-center justify-between">
          <span>Pipeline Velocity Tracker</span>
          <span className="text-[9px] text-emerald-400 font-semibold uppercase tracking-widest">Active Session</span>
        </div>

        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between text-[10px] text-white/60 mb-1">
              <span>Overall Catalog Clearance</span>
              <span className="font-mono text-white/90">{clearanceRate}%</span>
            </div>
            <div className="h-1.5 w-full bg-white/[0.05] rounded-full overflow-hidden flex">
              <div className="h-full bg-emerald-400 transition-all duration-500" style={{ width: `${clearanceRate}%` }} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <div className="p-2 rounded bg-black/15 border border-white/[0.03]">
              <div className="text-[8px] font-mono text-white/40 uppercase">Clearance Streak</div>
              <div className="text-sm font-semibold text-white/90 mt-0.5">{syncStreak} days</div>
              <div className="text-[8px] text-white/30 font-mono mt-0.5">Daily target met</div>
            </div>
            <div className="p-2 rounded bg-black/15 border border-white/[0.03]">
              <div className="text-[8px] font-mono text-white/40 uppercase">Processing Pace</div>
              <div className="text-sm font-semibold text-emerald-400 mt-0.5">+{currentPace} /hr</div>
              <div className="text-[8px] text-white/30 font-mono mt-0.5">Synced rate</div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 pt-2.5 border-t border-white/[0.04]">
        <div className="flex items-center justify-between text-[9px] text-white/50">
          <span className="font-medium uppercase tracking-wider">Cohort Milestone</span>
          <span className="text-emerald-400 font-mono">8 SKUs to 100%</span>
        </div>
        <div className="mt-1 text-[10px] leading-relaxed text-white/70">
          Cylinder family is approaching 100% completion. Clear the remaining 8 pending references to complete the cohort.
        </div>
      </div>
    </Card>
  );
}

function OpenAiCostMeterPanel({
  images,
  loading,
}: {
  images: Array<{
    id: string;
    generation_provider: string | null;
    description: string | null;
    created_at: string;
  }>;
  loading: boolean;
}) {
  const tally = useMemo(() => {
    let totalSpend = 0;
    let gpt2Standard = 0;
    let gpt2High = 0;
    let otherOpenAi = 0;

    for (const img of images) {
      const provider = img.generation_provider || "";
      const desc = img.description || "";

      let cost = 0;
      if (provider.includes("gpt-image-2")) {
        if (desc.includes("Director Mode") || desc.includes("Pro Photography")) {
          cost = 0.25;
          gpt2High++;
        } else {
          cost = 0.095;
          gpt2Standard++;
        }
      } else if (provider.includes("gpt-image-1.5")) {
        cost = 0.08;
        otherOpenAi++;
      } else if (provider.includes("dall-e-3")) {
        cost = desc.toLowerCase().includes("hd") ? 0.08 : 0.04;
        otherOpenAi++;
      } else {
        cost = 0.095;
        otherOpenAi++;
      }
      totalSpend += cost;
    }

    return {
      totalSpend,
      gpt2Standard,
      gpt2High,
      otherOpenAi,
      totalCount: images.length,
    };
  }, [images]);

  const dailySpend = useMemo(() => {
    const map = new Map<string, number>();
    const today = new Date();

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      const key = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      map.set(key, 0);
    }

    for (const img of images) {
      if (!img.created_at) continue;
      const date = new Date(img.created_at);
      const key = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      if (map.has(key)) {
        const provider = img.generation_provider || "";
        const desc = img.description || "";
        let cost = 0;
        if (provider.includes("gpt-image-2")) {
          cost = (desc.includes("Director Mode") || desc.includes("Pro Photography")) ? 0.25 : 0.095;
        } else if (provider.includes("gpt-image-1.5")) {
          cost = 0.08;
        } else if (provider.includes("dall-e-3")) {
          cost = desc.toLowerCase().includes("hd") ? 0.08 : 0.04;
        } else {
          cost = 0.095;
        }
        map.set(key, (map.get(key) || 0) + cost);
      }
    }

    return Array.from(map.entries()).map(([date, amount]) => ({ date, amount }));
  }, [images]);

  const maxDailySpend = Math.max(...dailySpend.map((d) => d.amount), 0.01);

  return (
    <Card className="p-4 border-white/[0.06] bg-white/[0.02] text-white h-full flex flex-col justify-between">
      <div>
        <div className="text-[10px] font-mono uppercase tracking-wider text-white/50 mb-3 flex items-center justify-between">
          <span>GPT-2.0 Cost Meter</span>
          <span className="text-[9px] text-sky-400 font-semibold uppercase tracking-widest">OpenAI API</span>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-6 text-xs text-white/40">
            <Loader2 className="w-4.5 h-4.5 animate-spin mb-2 text-sky-400" />
            <span>Calculating retro cost...</span>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <div className="text-[8px] font-mono text-white/40 uppercase">Total OpenAI Spend</div>
              <div className="text-xl font-bold text-white mt-0.5">${tally.totalSpend.toFixed(2)}</div>
              <div className="text-[8px] text-white/45 font-mono mt-0.5">
                {tally.totalCount.toLocaleString()} total images generated
              </div>
            </div>

            <div className="space-y-1 text-[9px] text-white/60 pt-1">
              <div className="flex justify-between">
                <span>GPT-2.0 Standard ($0.095)</span>
                <span className="font-mono text-white/80">{tally.gpt2Standard} imgs</span>
              </div>
              <div className="flex justify-between">
                <span>GPT-2.0 Director ($0.25)</span>
                <span className="font-mono text-white/80">{tally.gpt2High} imgs</span>
              </div>
              <div className="flex justify-between">
                <span>Other GPT / DALL-E Models</span>
                <span className="font-mono text-white/80">{tally.otherOpenAi} imgs</span>
              </div>
            </div>

            <div className="pt-2">
              <div className="text-[8px] font-mono text-white/40 uppercase mb-2">Daily Spend (Last 7 Days)</div>
              <div className="flex items-end justify-between gap-1 h-10">
                {dailySpend.map((d) => {
                  const heightPct = (d.amount / maxDailySpend) * 100;
                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                      <div
                        className="w-full bg-sky-400/80 rounded-t transition-all hover:bg-sky-400"
                        style={{ height: `${Math.max(4, heightPct)}%` }}
                        title={`${d.date}: $${d.amount.toFixed(2)}`}
                      />
                      <div className="text-[7px] text-white/30 font-mono scale-90">{d.date.split(" ")[1]}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}


function StatCard({
  label,
  value,
  tone,
  detail,
  progress,
}: {
  label: string;
  value: number;
  tone?: "ok" | "live" | "warn" | "info";
  detail?: string;
  progress?: { value: number; total: number };
}) {
  return (
    <Card
      className={cn(
        "p-3 border-white/[0.06] bg-white/[0.02] text-white flex items-center justify-between gap-2 relative overflow-hidden group hover:bg-white/[0.04] transition-all duration-300",
        tone === "ok" && "border-emerald-500/25 hover:border-emerald-500/40",
        tone === "live" && "border-amber-500/25 hover:border-amber-500/40",
        tone === "warn" && "border-rose-500/25 hover:border-rose-500/40",
        tone === "info" && "border-sky-500/25 hover:border-sky-500/40",
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-mono uppercase tracking-wider text-white/50 truncate">
          {label}
        </div>
        <div className="text-2xl font-semibold mt-1 text-white">{value}</div>
        {detail && (
          <div className="mt-1 text-[10px] leading-snug text-white/45 truncate">
            {detail}
          </div>
        )}
      </div>
      {progress && (
        <RadialProgress
          value={progress.value}
          total={progress.total}
          className={cn(
            tone === "ok" && "text-emerald-400",
            tone === "live" && "text-amber-400",
            tone === "warn" && "text-rose-400",
            tone === "info" && "text-sky-400",
            !tone && "text-white/70",
          )}
        />
      )}
    </Card>
  );
}

function ReadinessMiniPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "ok" | "warn";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border border-white/10 bg-white/[0.03] px-2 py-1 font-mono uppercase tracking-wider",
        tone === "ok" && "border-emerald-500/25 text-emerald-300",
        tone === "warn" && "border-amber-500/25 text-amber-300",
      )}
    >
      <span className="text-white/45">{label}</span>
      <span className="text-white">{value}</span>
    </span>
  );
}

function GenerationGapPlan({
  stages,
  syncedCount,
  totalCount,
  onOpenStage,
}: {
  stages: BestBottlesGenerationGapStage[];
  syncedCount: number;
  totalCount: number;
  onOpenStage: (stageId: BestBottlesGenerationGapStageId) => void;
}) {
  const nextStage = getBestBottlesGenerationGapNextStage(stages);
  const remaining = Math.max(totalCount - syncedCount, 0);

  return (
    <Card className="border-white/[0.06] bg-white/[0.025] p-4 text-white">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ListChecks className="h-4 w-4 text-[var(--darkroom-accent,#B8956A)]" />
            Image gap closure
          </div>
          <div className="mt-1 text-xs text-white/55">
            Next: <span className="text-white/80">{nextStage?.label ?? "Complete coverage"}</span>
            {" · "}
            {syncedCount.toLocaleString()} synced
            {totalCount > 0 ? ` of ${totalCount.toLocaleString()}` : ""}
            {remaining > 0 ? ` · ${remaining.toLocaleString()} remaining` : ""}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {stages.slice(0, -1).map((stage) => (
            <span
              key={stage.id}
              className={cn(
                "rounded border px-2 py-1 text-[10px] font-mono uppercase text-white/50",
                stage.id === nextStage?.id && "border-[var(--darkroom-accent,#B8956A)] text-white",
              )}
            >
              {stage.order}. {stage.label}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
        {stages.map((stage) => (
          <button
            key={stage.id}
            type="button"
            onClick={() => onOpenStage(stage.id)}
            className={cn(
              "min-h-[156px] rounded border bg-black/15 p-3 text-left transition-all",
              "hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.045]",
              generationGapStageBorderClass(stage.status),
              stage.id === nextStage?.id && "ring-1 ring-[var(--darkroom-accent,#B8956A)]/60",
            )}
            aria-label={`${stage.order}. ${stage.label}: ${stage.primaryAction}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded border border-white/10 bg-white/[0.03] text-white/65">
                  {generationGapStageIcon(stage.id)}
                </span>
                <div>
                  <div className="text-xs font-semibold text-white">{stage.label}</div>
                  <div className={cn("mt-0.5 text-[10px]", generationGapStageTextClass(stage.status))}>
                    {generationGapStageStatusLabel(stage.status)}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xl font-semibold text-white">
                  {stage.status === "not-run" ? "-" : stage.count.toLocaleString()}
                </div>
                <div className="text-[10px] text-white/40">{stage.status === "not-run" ? "not run" : "rows"}</div>
              </div>
            </div>

            <div className="mt-3 min-h-[34px] text-xs leading-snug text-white/55">
              {stage.description}
            </div>

            {stage.breakdown.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {stage.breakdown.map((item) => (
                  <span
                    key={item.label}
                    className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-1 text-[10px] text-white/55"
                  >
                    {item.label} <span className="text-white/85">{item.value.toLocaleString()}</span>
                  </span>
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded border border-white/[0.06] px-1.5 py-1 text-[10px] text-white/35">
                No rows in this stage
              </div>
            )}

            <div className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-white/75">
              {stage.primaryAction}
              <ExternalLink className="h-3 w-3" />
            </div>
          </button>
        ))}
      </div>
    </Card>
  );
}

function generationGapStageIcon(stageId: BestBottlesGenerationGapStageId): ReactNode {
  if (stageId === "audit-staging-ui") return <Eye className="h-3.5 w-3.5" />;
  if (stageId === "truth-and-measurements") return <AlertTriangle className="h-3.5 w-3.5" />;
  if (stageId === "source-references") return <ImageDown className="h-3.5 w-3.5" />;
  if (stageId === "launch-batches") return <ListChecks className="h-3.5 w-3.5" />;
  if (stageId === "ready-to-generate") return <Play className="h-3.5 w-3.5" />;
  if (stageId === "queued-running") return <Loader2 className="h-3.5 w-3.5" />;
  if (stageId === "review-generated") return <Star className="h-3.5 w-3.5" />;
  if (stageId === "push-shopify") return <PackageCheck className="h-3.5 w-3.5" />;
  if (stageId === "sync-convex") return <RefreshCw className="h-3.5 w-3.5" />;
  return <CheckCircle2 className="h-3.5 w-3.5" />;
}

function generationGapStageStatusLabel(status: BestBottlesGenerationGapStageStatus): string {
  const labels: Record<BestBottlesGenerationGapStageStatus, string> = {
    "not-run": "Audit needed",
    blocked: "Blocked",
    "needs-work": "Needs work",
    active: "Active",
    waiting: "Waiting",
    complete: "Clear",
  };
  return labels[status];
}

function generationGapStageBorderClass(status: BestBottlesGenerationGapStageStatus): string {
  const classes: Record<BestBottlesGenerationGapStageStatus, string> = {
    "not-run": "border-amber-500/25",
    blocked: "border-rose-500/30",
    "needs-work": "border-amber-500/25",
    active: "border-sky-500/25",
    waiting: "border-white/[0.08]",
    complete: "border-emerald-500/25",
  };
  return classes[status];
}

function generationGapStageTextClass(status: BestBottlesGenerationGapStageStatus): string {
  const classes: Record<BestBottlesGenerationGapStageStatus, string> = {
    "not-run": "text-amber-300",
    blocked: "text-rose-300",
    "needs-work": "text-amber-300",
    active: "text-sky-300",
    waiting: "text-white/35",
    complete: "text-emerald-300",
  };
  return classes[status];
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 rounded text-xs border transition-all",
        active
          ? "border-white/50 bg-white/10 text-white"
          : "border-white/[0.08] bg-white/[0.02] text-white/60 hover:text-white hover:border-white/20",
      )}
    >
      {label}
    </button>
  );
}

function ViewToggle({
  label,
  active,
  onClick,
  icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs transition-all",
        active
          ? "border-[var(--darkroom-accent,#B8956A)] bg-[var(--darkroom-accent,#B8956A)]/15 text-white"
          : "border-white/[0.08] bg-white/[0.02] text-white/60 hover:text-white hover:border-white/20",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function PdpReadinessByFamily({
  families,
  allFamilies,
  summary,
  activeFamily,
  onSelectFamily,
  onOpenFamilyQueue,
  onOpenCylinderPilot,
  onOpenStudio,
  onOpenGapWorklist,
  adhdMode = false,
}: {
  families: PdpFamilyReadiness[];
  allFamilies: PdpFamilyReadiness[];
  summary: PdpReadinessCounts;
  activeFamily: string;
  onSelectFamily: (family: string) => void;
  onOpenFamilyQueue: (family: string) => void;
  onOpenCylinderPilot: () => void;
  onOpenStudio: (productGroupSlug: string) => void;
  onOpenGapWorklist?: (family: string) => void;
  adhdMode?: boolean;
}) {
  const selectedFamily = activeFamily === "all" ? null : families[0] ?? null;
  const notLive = Math.max(summary.total - summary.pdpLive, 0);
  const referenceWork = summary.sourceNeeded + summary.sourceBlocked;
  const activeFamilyLabel = activeFamily === "all" ? "All families" : activeFamily;

  const [zenIndex, setZenIndex] = useState(0);
  const [hideCompleted, setHideCompleted] = useState(true);

  // Filter groups for Zen Mode
  const zenGroups = useMemo(() => {
    if (!selectedFamily) return [];
    if (hideCompleted) {
      // Only show groups that have pending work (nextAction is not 'none')
      return selectedFamily.groups.filter(g => g.nextAction && g.nextAction !== "none");
    }
    return selectedFamily.groups;
  }, [selectedFamily, hideCompleted]);

  // Adjust index if it goes out of bounds
  useEffect(() => {
    if (zenIndex >= zenGroups.length && zenGroups.length > 0) {
      setZenIndex(zenGroups.length - 1);
    }
  }, [zenGroups, zenIndex]);

  return (
    <Card className="overflow-hidden border-emerald-500/20 bg-emerald-500/[0.025] text-white">
      <div className="border-b border-white/[0.06] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <PackageCheck className="h-4 w-4 text-emerald-200" />
              {activeFamily === "all" ? "Family workbench" : `${activeFamily} family workbench`}
            </div>
            <div className="mt-1 max-w-3xl text-xs leading-relaxed text-white/60">
              Track every bottle, the renamed reference that must match Convex/Shopify identity, the generated master, approval, Shopify push, and Convex sync.
              Product groups are sorted smallest to largest inside the family.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 border-white/10 bg-white/[0.03] px-3 text-xs text-white hover:bg-white/[0.08]"
                >
                  <Rows3 className="h-3.5 w-3.5" />
                  {activeFamilyLabel}
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-[1300] max-h-[420px] min-w-[220px] overflow-y-auto border-white/10 bg-[#18181b] text-white">
                <DropdownMenuItem
                  onClick={() => onSelectFamily("all")}
                  className="cursor-pointer gap-2 focus:bg-white/[0.08] focus:text-white"
                >
                  All families
                </DropdownMenuItem>
                {allFamilies.map((family) => (
                  <DropdownMenuItem
                    key={family.family}
                    onClick={() => onSelectFamily(family.family)}
                    className="cursor-pointer gap-2 focus:bg-white/[0.08] focus:text-white"
                  >
                    {family.family}
                    <span className="ml-auto font-mono text-[10px] text-white/40">
                      {family.total}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onOpenCylinderPilot}
              className="h-8 border-sky-500/25 bg-sky-500/[0.06] px-3 text-xs text-sky-100 hover:bg-sky-500/[0.12]"
            >
              <Play className="h-3.5 w-3.5" />
              Cylinder pilot
            </Button>
          </div>
        </div>

        {adhdMode ? (
          <div className="mt-4 p-4 rounded bg-black/15 border border-white/[0.04] flex items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-white/50">Family Completion Progress</span>
              <div className="text-sm font-semibold text-white mt-1">
                {selectedFamily ? `${selectedFamily.family} family is ${Math.round((selectedFamily.pdpLive / selectedFamily.total) * 100)}% complete` : "All families progress"}
              </div>
            </div>
            <div className="flex-1 max-w-xs font-mono text-xs text-right">
              {selectedFamily ? (
                <>
                  <span className="text-white/80">{selectedFamily.pdpLive}</span>
                  <span className="text-white/40"> / {selectedFamily.total} SKUs live</span>
                  <div className="mt-1.5 w-full ml-auto">
                    <PdpReadinessStackedBar counts={selectedFamily} />
                  </div>
                </>
              ) : (
                `${summary.pdpLive} / ${summary.total} SKUs live`
              )}
            </div>
          </div>
        ) : (
          <div className="mt-4 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
            <PdpMetricTile label="Bottles tracked" value={summary.total} total={summary.total} tone="info" detail="SKU rows in scope" />
            <PdpMetricTile label="Generated" value={summary.generated} total={summary.total} tone="info" detail="linked Madison image" />
            <PdpMetricTile label="In Shopify" value={summary.shopifyPublished} total={summary.total} tone="info" detail="media, URL, or push evidence" />
            <PdpMetricTile label="Still to generate" value={summary.remainingGeneration} total={summary.total} tone={summary.remainingGeneration > 0 ? "warn" : "ok"} detail="no linked image evidence" />
            <PdpMetricTile label="Need renamed refs" value={referenceWork} total={summary.total} tone={referenceWork > 0 ? "warn" : "ok"} detail="source, rename, or match" />
            <PdpMetricTile label="Quality approved" value={summary.pdpLive} total={summary.total} tone="ok" detail={`approved-keep · ${notLive} not yet`} />
          </div>
        )}
      </div>

      {adhdMode ? (
        selectedFamily ? (
          <div className="p-6 border-t border-white/[0.06] bg-black/20">
            {(() => {
              if (zenGroups.length === 0) {
                return (
                  <div className="py-12 text-center">
                    <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
                    <h3 className="text-base font-semibold text-white">All Groups Completed!</h3>
                    <p className="text-xs text-white/50 mt-1 max-w-md mx-auto">
                      Excellent work! Every product group in the {selectedFamily.family} family has been successfully processed and is live.
                    </p>
                    {hideCompleted && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setHideCompleted(false)}
                        className="mt-4 border-white/10 text-xs text-white hover:bg-white/[0.06]"
                      >
                        Show Completed Groups
                      </Button>
                    )}
                  </div>
                );
              }

              const group = zenGroups[zenIndex] ?? zenGroups[0];
              if (!group) return null;

              const refComplete = group.sourceNeeded === 0 && group.sourceBlocked === 0;
              const genComplete = group.readyToGenerate === 0;
              const reviewComplete = group.reviewGenerated === 0;
              const syncComplete = group.approvedPendingPush === 0 && group.shopifyAwaitingConvex === 0;
              const liveComplete = group.pdpLive === group.total;

              return (
                <div className="max-w-2xl mx-auto space-y-6">
                  {/* Header Controls */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-2 text-xs text-white/70 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={hideCompleted}
                          onChange={(e) => {
                            setHideCompleted(e.target.checked);
                            setZenIndex(0);
                          }}
                          className="rounded border-white/20 bg-[#1e1e24] text-emerald-600 focus:ring-0 w-3.5 h-3.5"
                        />
                        Hide completed groups ({selectedFamily.groups.length - zenGroups.length} hidden)
                      </label>
                    </div>
                    <div className="text-xs font-mono text-white/50">
                      Group {zenIndex + 1} of {zenGroups.length} needing focus
                    </div>
                  </div>

                  {/* Zen Target Card */}
                  <Card className={cn(
                    "p-6 border bg-[#121214] text-white transition-all",
                    liveComplete ? "border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.05)]" : "border-amber-500/25 shadow-[0_0_20px_rgba(245,158,11,0.05)]"
                  )}>
                    {/* Top line */}
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <span className="text-[9px] font-mono uppercase bg-white/5 text-white/60 px-2 py-0.5 rounded border border-white/10">
                          {group.capacityLabel ?? `${group.capacityMl} ml`}
                        </span>
                        <h2 className="text-lg font-semibold text-white mt-2 leading-tight">
                          {group.displayName}
                        </h2>
                        <div className="text-[10px] font-mono text-white/40 mt-1">
                          {group.productGroupSlug}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-white/60 font-mono">PDP Live Progress</div>
                        <div className="text-lg font-semibold text-white font-mono mt-0.5">
                          {group.pdpLive} / {group.total}
                        </div>
                        <div className="w-24 mt-1.5 ml-auto">
                          <PdpReadinessStackedBar counts={group} compact />
                        </div>
                      </div>
                    </div>

                    {/* Sample SKUs list */}
                    <div className="mt-3 pt-3 border-t border-white/[0.04] text-[10px] text-white/40 font-mono truncate">
                      SKUs: {group.sampleSkus.join(" · ")}
                    </div>

                    {/* Checklist Section */}
                    <div className="mt-6 space-y-3 bg-black/15 p-4 rounded border border-white/[0.03]">
                      <h3 className="text-xs font-mono uppercase tracking-wider text-white/50 mb-1">Pipeline Checklist</h3>

                      {/* Step 1: Reference */}
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          {refComplete ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                          ) : (
                            <Circle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                          )}
                          <span className={cn(refComplete ? "text-white/60 line-through" : "text-white/90 font-medium")}>
                            1. Reference Prep
                          </span>
                        </div>
                        <span className="font-mono text-[10px] text-white/40">
                          {refComplete ? "Verified" : `${group.sourceNeeded} needed · ${group.sourceBlocked} blocked`}
                        </span>
                      </div>

                      {/* Step 2: AI Generation */}
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          {genComplete ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                          ) : (
                            <Circle className="w-4 h-4 text-sky-400 flex-shrink-0" />
                          )}
                          <span className={cn(genComplete ? "text-white/60 line-through" : "text-white/90 font-medium")}>
                            2. AI Generation
                          </span>
                        </div>
                        <span className="font-mono text-[10px] text-white/40">
                          {genComplete ? "Ready" : `${group.readyToGenerate} queued/running`}
                        </span>
                      </div>

                      {/* Step 3: QA Review */}
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          {reviewComplete ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                          ) : (
                            <Circle className="w-4 h-4 text-violet-400 flex-shrink-0" />
                          )}
                          <span className={cn(reviewComplete ? "text-white/60 line-through" : "text-white/90 font-medium")}>
                            3. QA & Review
                          </span>
                        </div>
                        <span className="font-mono text-[10px] text-white/40">
                          {reviewComplete ? "Approved" : `${group.reviewGenerated} waiting QA`}
                        </span>
                      </div>

                      {/* Step 4: Shopify & Convex Sync */}
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          {syncComplete ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                          ) : (
                            <Circle className="w-4 h-4 text-teal-400 flex-shrink-0" />
                          )}
                          <span className={cn(syncComplete ? "text-white/60 line-through" : "text-white/90 font-medium")}>
                            4. Shopify & Convex Sync
                          </span>
                        </div>
                        <span className="font-mono text-[10px] text-white/40">
                          {syncComplete ? "Finalized" : `${group.approvedPendingPush + group.shopifyAwaitingConvex} pending`}
                        </span>
                      </div>
                    </div>

                    {/* Immediate Directive & Studio Button */}
                    <div className="mt-6 space-y-4">
                      <div className="p-3 bg-amber-500/10 rounded border border-amber-500/20 text-xs text-amber-200 flex items-start gap-2">
                        <Sparkles className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <span className="font-semibold">Next Action Needed:</span>{" "}
                          {group.nextAction === "none" ? "This product group is fully processed and live!" : (
                            BEST_BOTTLES_NEEDS_WORK_ACTION_LABELS[group.nextAction] || "Open in Studio to perform outstanding actions."
                          )}
                        </div>
                      </div>

                      <Button
                        onClick={() => onOpenStudio(group.productGroupSlug)}
                        className={cn(
                          "w-full py-5 text-xs font-bold uppercase tracking-wider text-white rounded-md transition-all shadow-lg flex items-center justify-center gap-2 border",
                          group.nextAction === "none"
                            ? "bg-emerald-600/20 border-emerald-500/30 hover:bg-emerald-600/30"
                            : "bg-emerald-600 hover:bg-emerald-500 border-emerald-400/30 animate-pulse hover:animate-none shadow-[0_0_15px_rgba(16,185,129,0.25)]"
                        )}
                      >
                        <ExternalLink className="w-4 h-4" />
                        Open in Studio
                      </Button>
                    </div>
                  </Card>

                  {/* Carousel Navigation */}
                  <div className="flex items-center justify-between gap-4 pt-2">
                    <Button
                      variant="outline"
                      onClick={() => setZenIndex((prev) => Math.max(0, prev - 1))}
                      disabled={zenIndex === 0}
                      className="h-9 px-4 text-xs border-white/10 bg-[#1c1c1f] text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:pointer-events-none gap-1"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      Previous
                    </Button>
                    <div className="text-xs text-white/40 font-mono select-none">
                      {zenIndex + 1} / {zenGroups.length}
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => setZenIndex((prev) => Math.min(zenGroups.length - 1, prev + 1))}
                      disabled={zenIndex === zenGroups.length - 1}
                      className="h-9 px-4 text-xs border-white/10 bg-[#1c1c1f] text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:pointer-events-none gap-1"
                    >
                      Next
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })()}
          </div>
        ) : (
          <div className="p-8 border-t border-white/[0.06] bg-black/20 text-center">
            <h3 className="text-sm font-semibold text-white/90 mb-2">Select a Family to Focus</h3>
            <p className="text-xs text-white/55 mb-4">Select a specific bottle family from the dropdown above to begin Zen Focus Mode.</p>
            <div className="flex flex-wrap justify-center gap-3">
              {families.map((f) => (
                <Button
                  key={f.family}
                  variant="outline"
                  onClick={() => onSelectFamily(f.family)}
                  className="h-9 text-xs border-white/10 bg-white/[0.02] hover:bg-white/[0.06]"
                >
                  Focus on {f.family} ({f.total} SKUs)
                </Button>
              ))}
            </div>
          </div>
        )
      ) : (
        <>
          {families.length === 0 ? (
            <div className="p-8 text-center text-sm text-white/55">
              No PDP readiness rows matched this family filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-white/[0.06] text-left text-[10px] uppercase tracking-wider text-white/40">
                  <tr>
                    <th className="px-4 py-2 font-medium">Family</th>
                    <th className="px-4 py-2 font-medium">PDP live</th>
                    <th className="px-4 py-2 font-medium">Reference / image work</th>
                    <th className="px-4 py-2 font-medium">Next work</th>
                    <th className="px-4 py-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {families.map((family) => (
                    <tr key={family.family} className="border-b border-white/[0.035] hover:bg-white/[0.03]">
                      <td className="min-w-[220px] px-4 py-3 align-top">
                        <div className="font-medium text-white/90">{family.family}</div>
                        <div className="mt-1 font-mono text-[11px] text-white/45">
                          {formatCapacityRange(family.capacityMin, family.capacityMax)} · {family.groups.length} groups
                        </div>
                      </td>
                      <td className="min-w-[220px] px-4 py-3 align-top">
                        <div className="font-mono text-xs text-white/80">
                          {family.pdpLive}/{family.total}
                        </div>
                        <PdpReadinessStackedBar counts={family} />
                      </td>
                      <td className="min-w-[340px] px-4 py-3 align-top">
                        <PdpMovementPills
                          counts={family}
                          onOpenGapWorklist={onOpenGapWorklist ? () => onOpenGapWorklist(family.family) : undefined}
                        />
                      </td>
                      <td className="min-w-[160px] px-4 py-3 align-top">
                        <NeedsWorkActionPill action={family.nextAction} />
                      </td>
                      <td className="min-w-[220px] px-4 py-3 align-top">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => onOpenFamilyQueue(family.family)}
                            className="h-8 border-white/10 bg-white/[0.03] px-3 text-xs text-white hover:bg-white/[0.08]"
                          >
                            <Rows3 className="h-3.5 w-3.5" />
                            Open queue
                          </Button>
                          {family.family === "Cylinder" && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={onOpenCylinderPilot}
                              className="h-8 border-sky-500/25 bg-sky-500/[0.06] px-3 text-xs text-sky-100 hover:bg-sky-500/[0.12]"
                            >
                              <Play className="h-3.5 w-3.5" />
                              Pilot
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {selectedFamily && (
            <div className="border-t border-white/[0.06] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-white/85">
                    {selectedFamily.family} product groups, smallest to largest
                  </div>
                  <div className="mt-1 text-[11px] text-white/45">
                    Use the family dropdown above to switch this work queue.
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto rounded border border-white/[0.06]">
                <table className="w-full text-xs">
                  <thead className="border-b border-white/[0.06] text-left text-[10px] uppercase tracking-wider text-white/40">
                    <tr>
                      <th className="px-3 py-2 font-medium">Size</th>
                      <th className="px-3 py-2 font-medium">Product group</th>
                      <th className="px-3 py-2 font-medium">Generated</th>
                      <th className="px-3 py-2 font-medium">Shopify</th>
                      <th className="px-3 py-2 font-medium">Still to generate</th>
                      <th className="px-3 py-2 font-medium">Quality approved</th>
                      <th className="px-3 py-2 font-medium">Reference / image work</th>
                      <th className="px-3 py-2 font-medium">Open</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedFamily.groups.map((group) => (
                      <tr key={group.productGroupSlug} className="border-b border-white/[0.035] last:border-b-0">
                        <td className="px-3 py-2 align-top font-mono text-white/55">
                          {group.capacityLabel ?? formatCapacityValue(group.capacityMl)}
                        </td>
                        <td className="min-w-[300px] px-3 py-2 align-top">
                          <div className="text-white/80">{group.displayName}</div>
                          <div className="mt-0.5 font-mono text-[10px] text-white/35">{group.productGroupSlug}</div>
                          <div className="mt-1 font-mono text-[10px] text-white/35">{group.sampleSkus.join(" · ")}</div>
                        </td>
                        <td className="px-3 py-2 align-top font-mono text-[11px] text-sky-200">
                          {group.generated}/{group.total}
                        </td>
                        <td className="px-3 py-2 align-top font-mono text-[11px] text-violet-200">
                          {group.shopifyPublished}/{group.total}
                        </td>
                        <td className="px-3 py-2 align-top font-mono text-[11px] text-amber-200">
                          {group.remainingGeneration}
                        </td>
                        <td className="min-w-[160px] px-3 py-2 align-top">
                          <div className="font-mono text-[11px] text-emerald-200">
                            {group.pdpLive}/{group.total}
                          </div>
                          <PdpReadinessStackedBar counts={group} compact />
                        </td>
                        <td className="min-w-[280px] px-3 py-2 align-top">
                          <div className="flex flex-col gap-1">
                            <NeedsWorkActionPill action={group.nextAction} />
                            <PdpMovementPills
                              counts={group}
                              compact
                              onOpenGapWorklist={onOpenGapWorklist ? () => onOpenGapWorklist(selectedFamily.family) : undefined}
                            />
                          </div>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => onOpenStudio(group.productGroupSlug)}
                            className="h-7 px-2 text-xs text-white/70 hover:bg-white/[0.06] hover:text-white"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Studio
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function PdpMetricTile({
  label,
  value,
  total,
  tone,
  detail,
}: {
  label: string;
  value: number;
  total: number;
  tone: "ok" | "warn" | "info";
  detail?: string;
}) {
  const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div
      className={cn(
        "min-h-[74px] rounded border bg-black/15 px-3 py-2",
        tone === "ok" && "border-emerald-500/25",
        tone === "warn" && "border-amber-500/25",
        tone === "info" && "border-sky-500/25",
      )}
    >
      <div className="text-[10px] font-mono uppercase tracking-wider text-white/45">{label}</div>
      <div className="mt-1 text-xl font-semibold text-white">{value}</div>
      <div className="text-[10px] text-white/40">{detail ?? `${percentage}% of tracked SKUs`}</div>
    </div>
  );
}


function PdpReadinessStackedBar({
  counts,
  compact = false,
}: {
  counts: PdpReadinessCounts;
  compact?: boolean;
}) {
  const {
    total,
    pdpLive,
    sourceNeeded,
    sourceBlocked,
    readyToGenerate,
    reviewGenerated,
    approvedPendingPush,
    shopifyAwaitingConvex,
  } = counts;

  if (total === 0) return null;

  const pctBlocked = (sourceBlocked / total) * 100;
  const pctNeeded = (sourceNeeded / total) * 100;
  const pctReady = (readyToGenerate / total) * 100;
  const pctReview = (reviewGenerated / total) * 100;
  const pctPush = (approvedPendingPush / total) * 100;
  const pctSync = (shopifyAwaitingConvex / total) * 100;
  const pctLive = (pdpLive / total) * 100;

  return (
    <div className={cn("mt-2 overflow-hidden rounded bg-white/[0.07] flex w-full", compact ? "h-2" : "h-3")}>
      {pctBlocked > 0 && (
        <div
          className="h-full bg-rose-500/80 transition-all hover:opacity-90"
          style={{ width: `${pctBlocked}%` }}
          title={`No source match: ${sourceBlocked} (${Math.round(pctBlocked)}%)`}
        />
      )}
      {pctNeeded > 0 && (
        <div
          className="h-full bg-amber-500/85 transition-all hover:opacity-90"
          style={{ width: `${pctNeeded}%` }}
          title={`Needs reference: ${sourceNeeded} (${Math.round(pctNeeded)}%)`}
        />
      )}
      {pctReady > 0 && (
        <div
          className="h-full bg-sky-500/80 transition-all hover:opacity-90"
          style={{ width: `${pctReady}%` }}
          title={`Ready to generate: ${readyToGenerate} (${Math.round(pctReady)}%)`}
        />
      )}
      {pctReview > 0 && (
        <div
          className="h-full bg-violet-500/85 transition-all hover:opacity-90"
          style={{ width: `${pctReview}%` }}
          title={`Awaiting QA Review: ${reviewGenerated} (${Math.round(pctReview)}%)`}
        />
      )}
      {pctPush > 0 && (
        <div
          className="h-full bg-emerald-500/70 transition-all hover:opacity-90"
          style={{ width: `${pctPush}%` }}
          title={`Approved / Pending Push: ${approvedPendingPush} (${Math.round(pctPush)}%)`}
        />
      )}
      {pctSync > 0 && (
        <div
          className="h-full bg-teal-500/80 transition-all hover:opacity-90"
          style={{ width: `${pctSync}%` }}
          title={`Awaiting Convex Sync: ${shopifyAwaitingConvex} (${Math.round(pctSync)}%)`}
        />
      )}
      {pctLive > 0 && (
        <div
          className="h-full bg-emerald-400/90 transition-all hover:opacity-90"
          style={{ width: `${pctLive}%` }}
          title={`PDP Live: ${pdpLive} (${Math.round(pctLive)}%)`}
        />
      )}
    </div>
  );
}

function PdpMovementPills({
  counts,
  compact = false,
  onOpenGapWorklist,
}: {
  counts: PdpReadinessCounts;
  compact?: boolean;
  onOpenGapWorklist?: () => void;
}) {
  const items = [
    { key: "sync", label: "sync Convex", value: counts.shopifyAwaitingConvex, className: "border-sky-500/25 text-sky-300" },
    { key: "push", label: "push", value: counts.approvedPendingPush, className: "border-emerald-500/25 text-emerald-300" },
    { key: "review", label: "review", value: counts.reviewGenerated, className: "border-violet-500/25 text-violet-300" },
    { key: "generate", label: "generate", value: counts.readyToGenerate, className: "border-sky-500/25 text-sky-300" },
    { key: "source", label: "rename/source refs", value: counts.sourceNeeded, className: "border-amber-500/25 text-amber-300" },
    { key: "blocked", label: "no source match", value: counts.sourceBlocked, className: "border-rose-500/25 text-rose-300" },
  ].filter((item) => item.value > 0);

  if (items.length === 0) {
    return <span className="text-[11px] text-emerald-200/70">No downstream blockers</span>;
  }

  const pillClass = (className: string) =>
    cn(
      "inline-flex rounded border px-1.5 py-0.5 font-mono uppercase tracking-wider",
      compact ? "text-[9px]" : "text-[10px]",
      className,
    );

  return (
    <div className={cn("flex flex-wrap gap-1.5", compact && "gap-1")}>
      {items.map((item) =>
        // The source-refs pill is the entry point into the Cowork gap worklist —
        // the authoritative, lane-segmented actionable list.
        item.key === "source" && onOpenGapWorklist ? (
          <button
            key={item.key}
            type="button"
            onClick={onOpenGapWorklist}
            title="Open the gap worklist — the lane-segmented list of variants still missing a clean reference."
            className={cn(pillClass(item.className), "cursor-pointer hover:bg-amber-500/[0.12]")}
          >
            {item.label} {item.value}
          </button>
        ) : (
          <span key={item.key} className={pillClass(item.className)}>
            {item.label} {item.value}
          </span>
        ),
      )}
    </div>
  );
}

function CylinderPilotSlice({
  rows,
  totalRows,
  queueing,
  pushingGroupSlug,
  onOpenStudio,
  onQueueRows,
  onPushRows,
  onOpenFullQueue,
}: {
  rows: NeedsWorkRow[];
  totalRows: number;
  queueing: boolean;
  pushingGroupSlug?: string | null;
  onOpenStudio: (productGroupSlug: string) => void;
  onQueueRows: (rows: NeedsWorkRow[]) => void | Promise<void>;
  onPushRows: (rows: NeedsWorkRow[]) => void | Promise<void>;
  onOpenFullQueue: () => void;
}) {
  const readyRows = rows.filter(isReadyToGenerateRow);
  const pushRows = rows.filter((row) => row.persisted && row.action === "push-to-shopify");
  const studioSlug = rows[0]?.productGroupSlug ?? CYLINDER_PILOT_PRODUCT_GROUP_SLUG;
  const pushing = pushRows.some((row) => row.productGroupSlug === pushingGroupSlug);
  const stageCounts = {
    source: rows.filter((row) =>
      row.action === "import-local-reference" ||
      row.action === "source-website-reference" ||
      row.action === "needs-source-match"
    ).length,
    generate: rows.filter((row) => row.action === "generate-image" || isReadyToGenerateRow(row)).length,
    review: rows.filter((row) => row.action === "review-generated").length,
    push: pushRows.length,
    sync: rows.filter((row) => row.action === "sync-convex").length,
  };

  return (
    <Card className="overflow-hidden border-sky-500/20 bg-sky-500/[0.035] text-white">
      <div className="border-b border-white/[0.06] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Play className="h-4 w-4 text-sky-200" />
              Cylinder pilot slice
            </div>
            <div className="mt-1 text-xs leading-relaxed text-white/60">
              Small workflow test for <span className="font-mono text-white/80">{CYLINDER_PILOT_PRODUCT_GROUP_SLUG}</span>.
              Move this slice through reference prep, rigged generation, visual QA, Shopify, then Convex before widening the family.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenStudio(studioSlug)}
              className="h-8 border-white/10 bg-white/[0.03] px-3 text-xs text-white hover:bg-white/[0.08]"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open Studio
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onQueueRows(readyRows)}
              disabled={readyRows.length === 0 || queueing}
              className="h-8 border-sky-500/25 bg-sky-500/[0.06] px-3 text-xs text-sky-100 hover:bg-sky-500/[0.12]"
            >
              {queueing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Queue ready {readyRows.length}
            </Button>
            <Button
              type="button"
              variant="brass"
              size="sm"
              onClick={() => onPushRows(pushRows)}
              disabled={pushRows.length === 0 || pushing}
              className="h-8 px-3 text-xs"
            >
              {pushing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PackageCheck className="h-3.5 w-3.5" />}
              Push approved {pushRows.length}
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-5">
          <PilotStage label="1. Source" value={stageCounts.source} detail="Clean PNG/reference" active={stageCounts.source > 0} />
          <PilotStage label="2. Generate" value={stageCounts.generate} detail="GPT Image 2 + rig" active={stageCounts.source === 0 && stageCounts.generate > 0} />
          <PilotStage label="3. Review" value={stageCounts.review} detail="Visual gate" active={stageCounts.source === 0 && stageCounts.generate === 0 && stageCounts.review > 0} />
          <PilotStage label="4. Shopify" value={stageCounts.push} detail="Push by SKU" active={stageCounts.push > 0} />
          <PilotStage label="5. Convex" value={stageCounts.sync} detail="CDN sync" active={stageCounts.sync > 0} />
        </div>
      </div>

      <div className="border-b border-white/[0.06] px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/55">
          <Badge variant="outline" className="border-sky-500/25 text-sky-100">
            {rows.length} shown{totalRows > rows.length ? ` of ${totalRows}` : ""}
          </Badge>
          <span>Visual gate: PDP alignment, bone background, 2080 x 2288 canvas, editorial quality, exact product truth.</span>
          <button
            type="button"
            onClick={onOpenFullQueue}
            className="ml-auto text-xs text-sky-200 underline-offset-4 hover:underline"
          >
            Open full Cylinder queue
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-white/55">
          No unfinished rows were found for this pilot slice.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-white/[0.06] text-left text-[10px] uppercase tracking-wider text-white/40">
              <tr>
                <th className="px-4 py-2 font-medium">SKU</th>
                <th className="px-4 py-2 font-medium">Next step</th>
                <th className="px-4 py-2 font-medium">Reference</th>
                <th className="px-4 py-2 font-medium">Destination</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-white/[0.035] hover:bg-white/[0.03]">
                  <td className="px-4 py-3 align-top">
                    <div className="font-mono text-xs text-white/90">{row.graceSku}</div>
                    <div className="font-mono text-[11px] text-white/45">{row.websiteSku}</div>
                    <div className="mt-1 truncate text-[11px] text-white/45">{row.productGroupDisplayName}</div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <NeedsWorkActionPill action={row.action} />
                    <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-white/35">{row.status}</div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <ReferenceSourcePill source={row.referenceSource} />
                      {row.matchKind && row.matchKind !== "none" && (
                        <span className="rounded border border-white/10 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-white/45">
                          {row.matchKind}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 max-w-[360px] truncate font-mono text-[11px] text-white/40" title={referenceSourceDetail(row)}>
                      {referenceSourceDetail(row)}
                    </div>
                    {row.referenceRig && <ReferenceRigPills rig={row.referenceRig} />}
                    {row.referenceIssue && (
                      <div className="mt-1 max-w-[360px] text-[11px] leading-snug text-amber-200/80">
                        {row.referenceIssue}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <NeedsWorkDestination row={row} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function PilotStage({
  label,
  value,
  detail,
  active,
}: {
  label: string;
  value: number;
  detail: string;
  active: boolean;
}) {
  return (
    <div
      className={cn(
        "min-h-[74px] rounded border bg-black/15 px-3 py-2",
        active ? "border-sky-500/35 text-white" : "border-white/[0.07] text-white/50",
      )}
    >
      <div className="text-[10px] font-mono uppercase tracking-wider">{label}</div>
      <div className="mt-1 text-xl font-semibold text-white">{value}</div>
      <div className="text-[10px] text-white/45">{detail}</div>
    </div>
  );
}

function NeedsWorkList({
  rows,
  totalRows,
  referenceIntakeData,
  selectedIds,
  selectedCount,
  onToggleRow,
  onToggleRows,
  onSelectVisible,
  onClearSelection,
  onOpenBulkCreate,
  onQueueRows,
  onPushRows,
  onOpenStudio,
  queueing,
  pushingGroupSlug,
}: {
  rows: NeedsWorkRow[];
  totalRows: number;
  referenceIntakeData: ReferenceIntakeData | null;
  selectedIds: Set<string>;
  selectedCount: number;
  onToggleRow: (id: string, selected: boolean) => void;
  onToggleRows: (ids: string[], selected: boolean) => void;
  onSelectVisible: () => void;
  onClearSelection: () => void;
  onOpenBulkCreate: () => void;
  onQueueRows: (rows: NeedsWorkRow[]) => void | Promise<void>;
  onPushRows: (rows: NeedsWorkRow[]) => void | Promise<void>;
  onOpenStudio: (productGroupSlug: string) => void;
  queueing: boolean;
  pushingGroupSlug?: string | null;
}) {
  const familyGroups = useMemo(() => {
    const map = new Map<string, NeedsWorkRow[]>();
    for (const row of rows) {
      const familyRows = map.get(row.family) ?? [];
      familyRows.push(row);
      map.set(row.family, familyRows);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);
  const visibleSelectedCount = rows.filter((row) => selectedIds.has(row.id)).length;
  const unselectedRows = useMemo(
    () => rows.filter((row) => !selectedIds.has(row.id)),
    [rows, selectedIds],
  );
  const readyBatchAvailableCount = useMemo(
    () => selectBulkCreateBatchRows(unselectedRows, Number.MAX_SAFE_INTEGER).length,
    [unselectedRows],
  );
  const handleSelectReadyBatch = (limit: number) => {
    const batchRows = selectBulkCreateBatchRows(unselectedRows, limit);
    if (batchRows.length === 0) return;
    onToggleRows(batchRows.map((row) => row.id), true);
  };

  return (
    <Card className="border-white/[0.06] bg-white/[0.02] text-white overflow-hidden">
      <div className="p-4 border-b border-white/[0.06] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <div className="font-medium">Needs Work</div>
          <p className="text-xs text-white/50 mt-1">
            Only unfinished SKU images are shown. References from local folders and bestbottles.com are surfaced as actions before generation.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 lg:items-end">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="border-white/10 text-white/60">
              {rows.length} shown · {totalRows} total
            </Badge>
            {selectedCount > 0 && (
              <Badge variant="outline" className="border-sky-500/25 text-sky-200">
                {selectedCount} selected
              </Badge>
            )}
            {readyBatchAvailableCount > 0 && (
              <Badge variant="outline" className="border-sky-500/20 text-sky-100/80">
                {readyBatchAvailableCount} ready unselected
              </Badge>
            )}
            {referenceIntakeData && (
              <Badge variant="outline" className="border-amber-500/20 text-amber-200/80">
                Intake {referenceIntakeData.summary.localMatches} local · {referenceIntakeData.summary.liveSiteCandidates} website · {referenceIntakeData.summary.unresolved} unresolved
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleSelectReadyBatch(50)}
              disabled={readyBatchAvailableCount === 0}
              className="h-8 border-sky-500/20 bg-sky-500/[0.04] px-2.5 text-xs text-sky-100 hover:bg-sky-500/[0.1]"
            >
              <ListChecks className="h-3.5 w-3.5" />
              Select next 50 ready
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleSelectReadyBatch(100)}
              disabled={readyBatchAvailableCount === 0}
              className="h-8 border-sky-500/20 bg-sky-500/[0.04] px-2.5 text-xs text-sky-100 hover:bg-sky-500/[0.1]"
            >
              <ListChecks className="h-3.5 w-3.5" />
              Select next 100 ready
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onSelectVisible}
              disabled={rows.length === 0 || visibleSelectedCount === rows.length}
              className="h-8 border-white/10 bg-white/[0.03] px-2.5 text-xs text-white hover:bg-white/[0.08]"
            >
              <SquareCheck className="h-3.5 w-3.5" />
              Select visible
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClearSelection}
              disabled={selectedCount === 0}
              className="h-8 px-2.5 text-xs text-white/65 hover:bg-white/[0.06] hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </Button>
            <Button
              type="button"
              variant="brass"
              size="sm"
              onClick={onOpenBulkCreate}
              disabled={selectedCount === 0}
              className="h-8 px-3 text-xs"
            >
              <PanelRightOpen className="h-3.5 w-3.5" />
              Bulk create
            </Button>
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-white/55">
          No unfinished SKU images match the current filters.
        </div>
      ) : (
        <div className="max-h-[760px] overflow-auto">
          {familyGroups.map(([family, familyRows]) => {
            const actionCounts = new Map<BestBottlesNeedsWorkAction, number>();
            for (const action of NEEDS_WORK_ACTION_ORDER) actionCounts.set(action, 0);
            for (const row of familyRows) actionCounts.set(row.action, (actionCounts.get(row.action) ?? 0) + 1);
            const selectedFamilyCount = familyRows.filter((row) => selectedIds.has(row.id)).length;
            const readyRows = familyRows.filter(isReadyToGenerateRow);
            const pushReadyRows = familyRows.filter(
              (row) => row.persisted && row.action === "push-to-shopify",
            );
            const readySelectedCount = readyRows.filter((row) => selectedIds.has(row.id)).length;
            const familySummary = summarizeBulkCreateSelection(familyRows);
            const studioDestinations = familySummary.creationLaneStudioDestinations;
            const pushingFamily = pushReadyRows.some((row) => row.productGroupSlug === pushingGroupSlug);
            const familyChecked =
              selectedFamilyCount === familyRows.length
                ? true
                : selectedFamilyCount > 0
                  ? "indeterminate"
                  : false;
            return (
              <section key={family} className="border-b border-white/[0.06]">
                <div className="sticky top-0 z-10 flex flex-col gap-2 border-b border-white/[0.06] bg-[#111113] px-4 py-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={familyChecked}
                      onCheckedChange={(checked) => onToggleRows(familyRows.map((row) => row.id), checked === true)}
                      aria-label={`Select ${family}`}
                      className="mt-0.5 border-white/30 data-[state=checked]:border-sky-400 data-[state=checked]:bg-sky-500"
                    />
                    <div>
                      <div className="text-sm font-medium text-white">{family}</div>
                      <div className="text-[11px] text-white/45">
                        {familyRows.length} unfinished SKU image{familyRows.length === 1 ? "" : "s"}
                        {selectedFamilyCount > 0 ? ` · ${selectedFamilyCount} selected` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {readyRows.length > 0 && (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onToggleRows(readyRows.map((row) => row.id), true)}
                          disabled={readySelectedCount === readyRows.length}
                          className="h-7 border-sky-500/20 bg-sky-500/[0.04] px-2 text-[10px] text-sky-100 hover:bg-sky-500/[0.1]"
                        >
                          <SquareCheck className="h-3 w-3" />
                          Select ready
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onQueueRows(readyRows)}
                          disabled={queueing}
                          className="h-7 border-sky-500/20 bg-sky-500/[0.04] px-2 text-[10px] text-sky-100 hover:bg-sky-500/[0.1]"
                        >
                          {queueing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                          Queue ready
                        </Button>
                      </>
                    )}
                    {pushReadyRows.length > 0 && (
                      <Button
                        type="button"
                        variant="brass"
                        size="sm"
                        onClick={() => onPushRows(pushReadyRows)}
                        disabled={pushingFamily}
                        className="h-7 px-2 text-[10px]"
                      >
                        {pushingFamily ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <PackageCheck className="h-3 w-3" />
                        )}
                        Push ready {pushReadyRows.length}
                      </Button>
                    )}
                    {studioDestinations.length > 0 && (
                      <>
                        {familySummary.alreadyQueuedOrGenerating > 0 && readyRows.length === 0 && (
                          <span className="rounded border border-sky-500/20 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-sky-200">
                            queued {familySummary.alreadyQueuedOrGenerating}
                          </span>
                        )}
                        {studioDestinations.length === 1 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => onOpenStudio(studioDestinations[0].productGroupSlug)}
                            className="h-7 px-2 text-[10px] text-white/65 hover:bg-white/[0.06] hover:text-white"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Open Studio
                          </Button>
                        ) : studioDestinations.length > 1 ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-[10px] text-white/65 hover:bg-white/[0.06] hover:text-white"
                              >
                                <ExternalLink className="h-3 w-3" />
                                Open Studio
                                <ChevronDown className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="z-[1300] min-w-[280px] border-white/10 bg-[#18181b] text-white"
                            >
                              {studioDestinations.map((destination) => (
                                <DropdownMenuItem
                                  key={destination.productGroupSlug}
                                  onClick={() => onOpenStudio(destination.productGroupSlug)}
                                  className="flex cursor-pointer items-start justify-between gap-3 focus:bg-white/[0.08] focus:text-white"
                                >
                                  <span className="min-w-0">
                                    <span className="block truncate text-xs">{destination.productGroupDisplayName}</span>
                                    <span className="block font-mono text-[10px] text-white/45">
                                      {destination.productGroupSlug}
                                    </span>
                                  </span>
                                  <span className="shrink-0 rounded border border-sky-500/20 px-1.5 py-0.5 text-[9px] text-sky-200">
                                    {destination.count}
                                  </span>
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </>
                    )}
                    {NEEDS_WORK_ACTION_ORDER.map((action) => {
                      const count = actionCounts.get(action) ?? 0;
                      if (count === 0) return null;
                      return (
                        <span
                          key={action}
                          className="rounded border border-white/10 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-white/55"
                        >
                          {BEST_BOTTLES_NEEDS_WORK_ACTION_LABELS[action]} {count}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead className="sr-only">
                    <tr>
                      <th>Select</th>
                      <th>SKU</th>
                      <th>Group</th>
                      <th>Next action</th>
                      <th>Reference</th>
                      <th>Status</th>
                      <th>Destination</th>
                    </tr>
                  </thead>
                  <tbody>
                    {familyRows.map((row) => (
                      <tr key={row.id} className="border-b border-white/[0.035] hover:bg-white/[0.03]">
                        <td className="w-10 px-4 py-3 align-top">
                          <Checkbox
                            checked={selectedIds.has(row.id)}
                            onCheckedChange={(checked) => onToggleRow(row.id, checked === true)}
                            aria-label={`Select ${row.graceSku}`}
                            className="border-white/30 data-[state=checked]:border-sky-400 data-[state=checked]:bg-sky-500"
                          />
                        </td>
                        <td className="px-4 py-3 align-top min-w-[240px]">
                          <div className="font-mono text-xs text-white/90">{row.graceSku}</div>
                          <div className="font-mono text-[11px] text-white/45">{row.websiteSku}</div>
                          {row.shopifySku && row.shopifySku !== row.websiteSku && (
                            <div className="font-mono text-[11px] text-amber-200/70">Shopify {row.shopifySku}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top min-w-[260px]">
                          <div className="truncate text-white/75">{row.productGroupDisplayName}</div>
                          <div className="font-mono text-[11px] text-white/40">{row.productGroupSlug}</div>
                          {!row.persisted && (
                            <div className="mt-1 inline-flex rounded border border-sky-500/25 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-sky-300">
                              report-only
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <NeedsWorkActionPill action={row.action} />
                        </td>
                        <td className="px-4 py-3 align-top min-w-[280px]">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <ReferenceSourcePill source={row.referenceSource} />
                            {row.matchKind && row.matchKind !== "none" && (
                              <span className="rounded border border-white/10 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-white/45">
                                {row.matchKind}
                              </span>
                            )}
                            {row.duplicateCandidateCount > 0 && (
                              <span className="rounded border border-amber-500/25 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-amber-200/80">
                                {row.duplicateCandidateCount} candidates
                              </span>
                            )}
                          </div>
                          <div className="mt-1 max-w-[420px] truncate font-mono text-[11px] text-white/40" title={referenceSourceDetail(row)}>
                            {referenceSourceDetail(row)}
                          </div>
                          {row.referenceRig && <ReferenceRigPills rig={row.referenceRig} />}
                          {row.referenceIssue && (
                            <div className="mt-1 max-w-[420px] text-[11px] leading-snug text-amber-200/80">
                              {row.referenceIssue}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span className="rounded border border-white/10 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-white/45">
                            {row.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <NeedsWorkDestination row={row} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function LaunchBatchList({
  plan,
  sections,
  selectedNeedsWorkCount,
  onSelectNeedsWorkRows,
  onOpenStudio,
}: {
  plan: MadisonGenerationBatchPlan | null;
  sections: MadisonGenerationBatchSection[];
  selectedNeedsWorkCount: number;
  onSelectNeedsWorkRows: (rows: MadisonGenerationBatchRow[], openBulkCreate?: boolean) => void;
  onOpenStudio: (productGroupSlug: string) => void;
}) {
  if (!plan) {
    return (
      <Card className="border-white/[0.06] bg-white/[0.02] p-8 text-center text-sm text-white/55">
        No Madison launch batch plan has been generated yet.
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-white/[0.06] bg-white/[0.02] text-white">
      <div className="border-b border-white/[0.06] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-medium">Launch batches</div>
              <Badge variant="outline" className="border-amber-500/20 text-amber-100/80">
                {plan.summary.batchCount} batches
              </Badge>
              <Badge variant="outline" className="border-white/10 text-white/60">
                {plan.summary.selectedRows} rows
              </Badge>
              {selectedNeedsWorkCount > 0 && (
                <Badge variant="outline" className="border-sky-500/25 text-sky-200">
                  {selectedNeedsWorkCount} selected in Needs Work
                </Badge>
              )}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-white/50">
              Fresh residual no-product-media rows are grouped into operator batches. Generate by product truth; write by Grace SKU.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(["attach_existing_cdn_before_generation", "generate_from_local_reference", "generate_from_legacy_reference", "blocked_truth_review"] as MadisonGenerationBatchLane[]).map((lane) => {
              const meta = getMadisonGenerationBatchLaneMeta(lane);
              const count = plan.summary.byLane[lane] ?? 0;
              if (count === 0 && lane !== "blocked_truth_review") return null;
              return (
                <span
                  key={lane}
                  className={cn(
                    "rounded border px-2 py-1 font-mono text-[10px] uppercase tracking-wider",
                    batchLaneToneClass(meta.tone),
                  )}
                >
                  {meta.label} {count}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-h-[840px] overflow-auto">
        {sections.map((section) => (
          <section key={section.batchLabel} className="border-b border-white/[0.06]">
            <div className="sticky top-0 z-10 border-b border-white/[0.06] bg-[#111113] px-4 py-3">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] uppercase tracking-wider text-white/45">
                      Batch {String(section.batchNumber).padStart(2, "0")}
                    </span>
                    <BatchLanePill lane={section.lane} />
                    <span className="rounded border border-white/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-white/45">
                      {section.rowCount} SKU{section.rowCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="mt-1 text-sm font-medium text-white">{section.primaryAction}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {section.families.map((family) => (
                      <span
                        key={family}
                        className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-white/55"
                      >
                        {family}
                      </span>
                    ))}
                    {section.studioDestinations.map((destination) => (
                      <button
                        key={destination.productGroupSlug}
                        type="button"
                        onClick={() => onOpenStudio(destination.productGroupSlug)}
                        className="rounded border border-sky-500/20 bg-sky-500/[0.04] px-1.5 py-0.5 text-left text-[10px] text-sky-100 hover:bg-sky-500/[0.1]"
                        title={destination.productGroupSlug}
                      >
                        {destination.productGroupDisplayName} {destination.count}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onSelectNeedsWorkRows(section.rows, false)}
                    className="h-8 border-white/15 bg-white/[0.02] px-2.5 text-xs text-white hover:bg-white/[0.06] hover:text-white"
                  >
                    <SquareCheck className="h-3.5 w-3.5" />
                    Select batch
                  </Button>
                  <Button
                    type="button"
                    variant="brass"
                    size="sm"
                    onClick={() => onSelectNeedsWorkRows(section.rows, true)}
                    className="h-8 px-2.5 text-xs"
                  >
                    <PanelRightOpen className="h-3.5 w-3.5" />
                    Bulk create batch
                  </Button>
                  {section.studioDestinations.length === 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onOpenStudio(section.studioDestinations[0].productGroupSlug)}
                      className="h-8 px-2.5 text-xs text-white/65 hover:bg-white/[0.06] hover:text-white"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open Studio
                    </Button>
                  ) : section.studioDestinations.length > 1 ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2.5 text-xs text-white/65 hover:bg-white/[0.06] hover:text-white"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Open Studio
                          <ChevronDown className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="z-[1300] min-w-[300px] border-white/10 bg-[#18181b] text-white"
                      >
                        {section.studioDestinations.map((destination) => (
                          <DropdownMenuItem
                            key={destination.productGroupSlug}
                            onClick={() => onOpenStudio(destination.productGroupSlug)}
                            className="flex cursor-pointer items-start justify-between gap-3 focus:bg-white/[0.08] focus:text-white"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-xs">{destination.productGroupDisplayName}</span>
                              <span className="block font-mono text-[10px] text-white/45">
                                {destination.productGroupSlug}
                              </span>
                            </span>
                            <span className="shrink-0 rounded border border-sky-500/20 px-1.5 py-0.5 text-[9px] text-sky-200">
                              {destination.count}
                            </span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>
              </div>
            </div>

            <table className="w-full text-sm">
              <thead className="sr-only">
                <tr>
                  <th>SKU</th>
                  <th>Product group</th>
                  <th>Source</th>
                  <th>Next action</th>
                  <th>Guardrail</th>
                </tr>
              </thead>
              <tbody>
                {section.rows.map((row) => (
                  <tr
                    key={`${section.batchLabel}-${row.graceSku}`}
                    className="border-b border-white/[0.035] hover:bg-white/[0.03]"
                  >
                    <td className="min-w-[230px] px-4 py-3 align-top">
                      <div className="font-mono text-xs text-white/90">{row.graceSku}</div>
                      <div className="font-mono text-[11px] text-white/45">{row.websiteSku}</div>
                    </td>
                    <td className="min-w-[260px] px-4 py-3 align-top">
                      <div className="truncate text-white/75">
                        {displayBatchProductGroupName(row.productGroupSlug)}
                      </div>
                      <div className="font-mono text-[11px] text-white/40">{row.productGroupSlug}</div>
                      <div className="mt-1 text-[10px] uppercase tracking-wider text-white/35">
                        {row.launchVisibility}
                      </div>
                    </td>
                    <td className="min-w-[240px] px-4 py-3 align-top">
                      <BatchReferenceSourcePill source={row.referenceSource} />
                      <div
                        className="mt-1 max-w-[360px] truncate font-mono text-[11px] text-white/40"
                        title={row.referenceUrlOrPath ?? row.generatedOrCdnUrl ?? undefined}
                      >
                        {row.referenceUrlOrPath ?? row.generatedOrCdnUrl ?? "No source recorded"}
                      </div>
                      {row.generatedOrCdnUrl && /^https?:\/\//i.test(row.generatedOrCdnUrl) && (
                        <a
                          href={row.generatedOrCdnUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-[11px] text-sky-200/80 hover:text-sky-100"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Open image
                        </a>
                      )}
                    </td>
                    <td className="min-w-[320px] px-4 py-3 align-top">
                      <div className="max-w-[460px] text-xs leading-relaxed text-white/60">
                        {row.nextAction}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className="inline-flex rounded border border-amber-500/20 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-amber-100/70">
                        Grace SKU
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </Card>
  );
}

function StagingUiReferenceAuditList({
  audit,
  sections,
  selectedNeedsWorkCount,
  onSelectNeedsWorkRows,
  onOpenStudio,
}: {
  audit: BestBottlesStagingUiAudit | null;
  sections: BestBottlesStagingUiAuditSection[];
  selectedNeedsWorkCount: number;
  onSelectNeedsWorkRows: (rows: BestBottlesStagingUiAuditRow[], openBulkCreate?: boolean) => void;
  onOpenStudio: (productGroupSlug: string) => void;
}) {
  if (!audit) {
    return (
      <Card className="border-white/[0.06] bg-white/[0.02] p-8 text-center text-sm text-white/55">
        No staging UI reference audit has been generated yet.
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-white/[0.06] bg-white/[0.02] text-white">
      <div className="border-b border-white/[0.06] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-medium">Staging UI legacy/reference</div>
              <Badge variant="outline" className="border-amber-500/20 text-amber-100/80">
                {audit.summary.flaggedRows} flagged
              </Badge>
              <Badge variant="outline" className="border-white/10 text-white/60">
                {audit.summary.renderedImagesChecked} checked
              </Badge>
              {selectedNeedsWorkCount > 0 && (
                <Badge variant="outline" className="border-sky-500/25 text-sky-200">
                  {selectedNeedsWorkCount} selected in Needs Work
                </Badge>
              )}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-white/50">
              Rendered catalog and PDP images from local Best Bottles are flagged only when URL or audit provenance is legacy/reference-backed.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded border border-sky-500/25 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-sky-200">
              Generate {audit.summary.rowsNeedingGeneration}
            </span>
            <span className="rounded border border-emerald-500/25 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-emerald-200">
              Sync/push {audit.summary.rowsNeedingSyncOrPush}
            </span>
            <span className="rounded border border-rose-500/25 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-rose-200">
              Blocked {audit.summary.blockedTruthReviewRows}
            </span>
          </div>
        </div>
      </div>

      {sections.length === 0 ? (
        <div className="p-8 text-center text-sm text-white/55">
          No rendered legacy/reference product images were flagged in this audit.
        </div>
      ) : (
        <div className="max-h-[840px] overflow-auto">
          {sections.map((section) => (
            <section key={section.family} className="border-b border-white/[0.06]">
              <div className="sticky top-0 z-10 border-b border-white/[0.06] bg-[#111113] px-4 py-3">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-white">{section.family}</span>
                      <span className="rounded border border-white/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-white/45">
                        {section.rowCount} SKU{section.rowCount === 1 ? "" : "s"}
                      </span>
                      {Object.entries(section.generationBuckets).map(([bucket, count]) => (
                        <AuditGenerationBucketPill key={bucket} bucket={bucket} count={count} />
                      ))}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {section.studioDestinations.map((destination) => (
                        <button
                          key={destination.productGroupSlug}
                          type="button"
                          onClick={() => onOpenStudio(destination.productGroupSlug)}
                          className="rounded border border-sky-500/20 bg-sky-500/[0.04] px-1.5 py-0.5 text-left text-[10px] text-sky-100 hover:bg-sky-500/[0.1]"
                          title={destination.productGroupSlug}
                        >
                          {destination.productGroupDisplayName} {destination.count}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onSelectNeedsWorkRows(section.rows, false)}
                      className="h-8 border-white/15 bg-white/[0.02] px-2.5 text-xs text-white hover:bg-white/[0.06] hover:text-white"
                    >
                      <SquareCheck className="h-3.5 w-3.5" />
                      Select in Needs Work
                    </Button>
                    <Button
                      type="button"
                      variant="brass"
                      size="sm"
                      onClick={() => onSelectNeedsWorkRows(section.rows, true)}
                      className="h-8 px-2.5 text-xs"
                    >
                      <PanelRightOpen className="h-3.5 w-3.5" />
                      Bulk create
                    </Button>
                    {section.studioDestinations.length === 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onOpenStudio(section.studioDestinations[0].productGroupSlug)}
                        className="h-8 px-2.5 text-xs text-white/65 hover:bg-white/[0.06] hover:text-white"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open Studio
                      </Button>
                    ) : section.studioDestinations.length > 1 ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2.5 text-xs text-white/65 hover:bg-white/[0.06] hover:text-white"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Open Studio
                            <ChevronDown className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="z-[1300] min-w-[300px] border-white/10 bg-[#18181b] text-white"
                        >
                          {section.studioDestinations.map((destination) => (
                            <DropdownMenuItem
                              key={destination.productGroupSlug}
                              onClick={() => onOpenStudio(destination.productGroupSlug)}
                              className="flex cursor-pointer items-start justify-between gap-3 focus:bg-white/[0.08] focus:text-white"
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-xs">{destination.productGroupDisplayName}</span>
                                <span className="block font-mono text-[10px] text-white/45">
                                  {destination.productGroupSlug}
                                </span>
                              </span>
                              <span className="shrink-0 rounded border border-sky-500/20 px-1.5 py-0.5 text-[9px] text-sky-200">
                                {destination.count}
                              </span>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>
                </div>
              </div>

              <table className="w-full text-sm">
                <thead className="sr-only">
                  <tr>
                    <th>SKU</th>
                    <th>Product group</th>
                    <th>Rendered image</th>
                    <th>Reference source</th>
                    <th>Next action</th>
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map((row) => (
                    <tr
                      key={`${row.surface}-${row.productGroupSlug}-${row.graceSku}-${row.renderedImageUrl}`}
                      className="border-b border-white/[0.035] hover:bg-white/[0.03]"
                    >
                      <td className="min-w-[230px] px-4 py-3 align-top">
                        <div className="font-mono text-xs text-white/90">{row.graceSku}</div>
                        <div className="font-mono text-[11px] text-white/45">{row.websiteSku}</div>
                        <div className="mt-1 inline-flex rounded border border-white/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-white/45">
                          {row.surface}
                        </div>
                      </td>
                      <td className="min-w-[260px] px-4 py-3 align-top">
                        <div className="truncate text-white/75">
                          {displayBatchProductGroupName(row.productGroupSlug)}
                        </div>
                        <div className="font-mono text-[11px] text-white/40">{row.productGroupSlug}</div>
                        <a
                          href={row.stagingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-[11px] text-sky-200/80 hover:text-sky-100"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Open staging URL
                        </a>
                      </td>
                      <td className="min-w-[260px] px-4 py-3 align-top">
                        <AuditImageClassificationPill classification={row.imageClassification} />
                        <div className="mt-1 max-w-[360px] truncate font-mono text-[11px] text-white/40" title={row.renderedImageUrl}>
                          {row.renderedImageUrl}
                        </div>
                      </td>
                      <td className="min-w-[240px] px-4 py-3 align-top">
                        <BatchReferenceSourcePill source={row.referenceSource} />
                        <div
                          className="mt-1 max-w-[360px] truncate font-mono text-[11px] text-white/40"
                          title={row.referenceUrlOrPath || row.existingMadisonEvidenceUrl || undefined}
                        >
                          {row.referenceUrlOrPath || row.existingMadisonEvidenceUrl || "No source recorded"}
                        </div>
                      </td>
                      <td className="min-w-[320px] px-4 py-3 align-top">
                        <div className="max-w-[460px] text-xs leading-relaxed text-white/60">
                          {row.nextAction || "Verify product truth, generate or sync by Grace SKU, then rerun the staging UI audit."}
                        </div>
                        {row.notes && (
                          <div className="mt-1 max-w-[460px] text-[11px] leading-snug text-amber-100/65">
                            {row.notes}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}
    </Card>
  );
}

function displayBatchProductGroupName(slug: string): string {
  if (slug === "atomizer-5ml-slim") return "Atomizer Slim";
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => {
      if (/^\d+(ml|mm)$/i.test(part)) return part.toLowerCase();
      if (/^\d+$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function batchLaneToneClass(tone: "destination" | "generate" | "source" | "blocked"): string {
  const palette = {
    destination: "border-emerald-500/25 text-emerald-200",
    generate: "border-sky-500/25 text-sky-200",
    source: "border-amber-500/25 text-amber-200",
    blocked: "border-rose-500/25 text-rose-200",
  } satisfies Record<typeof tone, string>;
  return palette[tone];
}

function BatchLanePill({ lane }: { lane: MadisonGenerationBatchLane }) {
  const meta = getMadisonGenerationBatchLaneMeta(lane);
  return (
    <span
      className={cn(
        "inline-flex rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider",
        batchLaneToneClass(meta.tone),
      )}
    >
      {meta.label}
    </span>
  );
}

function AuditGenerationBucketPill({ bucket, count }: { bucket: string; count: number }) {
  const normalized = bucket || "unbucketed";
  let palette = "border-white/10 text-white/45";
  let label = normalized.replace(/_/g, " ");
  if (normalized === "covered_madison_not_synced" || normalized === "assign_existing_media") {
    palette = "border-emerald-500/25 text-emerald-300";
    label = normalized === "assign_existing_media" ? "assign existing" : "sync Madison";
  } else if (normalized === "generate_from_local_reference") {
    palette = "border-sky-500/25 text-sky-300";
    label = "local gen";
  } else if (normalized === "generate_from_legacy_reference") {
    palette = "border-amber-500/25 text-amber-300";
    label = "website gen";
  } else if (normalized === "blocked_truth_review") {
    palette = "border-rose-500/25 text-rose-300";
    label = "truth review";
  }
  return (
    <span className={cn("rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider", palette)}>
      {label} {count}
    </span>
  );
}

function AuditImageClassificationPill({ classification }: { classification: string }) {
  const normalized = classification || "unknown";
  let palette = "border-white/10 text-white/45";
  let label = normalized.replace(/_/g, " ");
  if (normalized === "legacy_bestbottles_url" || normalized === "legacy_site_reference") {
    palette = "border-amber-500/25 text-amber-300";
    label = "legacy URL";
  } else if (normalized === "reference_import") {
    palette = "border-sky-500/25 text-sky-300";
    label = "reference import";
  } else if (normalized === "madison_generated") {
    palette = "border-emerald-500/25 text-emerald-300";
    label = "Madison generated";
  } else if (normalized === "blocked_truth_review") {
    palette = "border-rose-500/25 text-rose-300";
    label = "truth review";
  } else if (normalized === "no_image") {
    label = "no image";
  }
  return (
    <span className={cn("inline-flex rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider", palette)}>
      {label}
    </span>
  );
}

function BatchReferenceSourcePill({ source }: { source: string | null }) {
  const normalized = String(source ?? "none").trim();
  let palette = "border-white/10 text-white/45";
  let label = normalized || "No source";
  if (normalized === "shopify_existing_media") {
    palette = "border-emerald-500/25 text-emerald-300";
    label = "Shopify CDN";
  } else if (normalized === "local_repo") {
    palette = "border-sky-500/25 text-sky-300";
    label = "Local reference";
  } else if (normalized === "legacy_site") {
    palette = "border-amber-500/25 text-amber-300";
    label = "BestBottles.com";
  } else if (normalized === "blocked") {
    palette = "border-rose-500/25 text-rose-300";
    label = "Blocked";
  }
  return (
    <span className={cn("inline-flex rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider", palette)}>
      {label}
    </span>
  );
}

function BulkCreateDrawer({
  open,
  onOpenChange,
  rows,
  mode,
  summary,
  organizationId,
  queueing,
  pushing,
  onQueueGenerateReady,
  onPushReady,
  onOpenStudio,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: NeedsWorkRow[];
  mode: "selection" | "queued-handoff";
  summary: BulkCreatePreflightSummary;
  organizationId?: string | null;
  queueing: boolean;
  pushing: boolean;
  onQueueGenerateReady: () => void | Promise<void>;
  onPushReady: () => void | Promise<void>;
  onOpenStudio: (productGroupSlug: string) => void;
}) {
  const referenceIntakeRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          row.action === "import-local-reference" ||
          row.action === "source-website-reference" ||
          row.action === "needs-source-match",
      ),
    [rows],
  );
  const referenceRows = useMemo(
    () =>
      referenceIntakeRows.filter(
        (row) => row.action === "import-local-reference" || row.action === "source-website-reference",
      ),
    [referenceIntakeRows],
  );
  const localReferenceRows = useMemo(
    () => referenceRows.filter((row) => row.action === "import-local-reference"),
    [referenceRows],
  );
  const websiteReferenceRows = useMemo(
    () => referenceRows.filter((row) => row.action === "source-website-reference"),
    [referenceRows],
  );
  const sourceMatchRows = useMemo(
    () => referenceIntakeRows.filter((row) => row.action === "needs-source-match"),
    [referenceIntakeRows],
  );
  const familyCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows) map.set(row.family, (map.get(row.family) ?? 0) + 1);
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 8);
  }, [rows]);
  const queueableRows = useMemo(
    () =>
      rows
        .filter(isReadyToGenerateRow)
        .slice(0, 8),
    [rows],
  );
  const pushReadyCount = summary.actionCounts["push-to-shopify"];
  const studioDestinations = summary.creationLaneStudioDestinations;
  const singleStudioDestination = studioDestinations.length === 1 ? studioDestinations[0] : null;
  const creationLaneImageCount = summary.queueableGenerateReady + summary.alreadyQueuedOrGenerating;
  const drawerReferenceIntakeTotal = referenceIntakeRows.length;
  const isQueuedHandoff = mode === "queued-handoff";
  const queueButtonLabel =
    isQueuedHandoff
      ? "Queued batch ready"
      : summary.queueableGenerateReady > 0
      ? `Queue ${summary.queueableGenerateReady} image${summary.queueableGenerateReady === 1 ? "" : "s"}`
      : "Queue generate-ready";
  const primaryAction = summary.canQueueGeneration
    ? "queue"
    : pushReadyCount > 0
      ? "push"
      : "queue";
  const primaryButtonLabel =
    primaryAction === "push"
      ? `Push ${pushReadyCount} ready`
      : queueButtonLabel;
  const primaryActionBusy = primaryAction === "push" ? pushing : queueing;
  const referenceApplyCommand = organizationId
    ? buildReferenceIntakeCommand(organizationId, referenceIntakeRows)
    : "npm run bestbottles:references:intake -- --apply --organization-id <org id>";
  const mixedSmokeCommand = organizationId
    ? `npm run bestbottles:references:intake -- --apply --organization-id ${shellQuote(organizationId)} --sample-local 2 --sample-website 2 --limit 4`
    : "npm run bestbottles:references:intake -- --apply --organization-id <org id> --sample-local 2 --sample-website 2 --limit 4";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col overflow-hidden border-white/[0.08] bg-[#111113] p-0 text-white sm:max-w-2xl"
      >
        <SheetHeader className="border-b border-white/[0.08] px-6 py-5 text-left">
          <SheetTitle className="flex items-center gap-2 text-white">
            <PanelRightOpen className="h-5 w-5 text-amber-200" />
            Bulk create
          </SheetTitle>
          <SheetDescription className="text-white/50">
            {isQueuedHandoff
              ? "Queued batch handoff. Open the Studio destination to run generation."
              : "Preflight for selected Needs Work SKU images."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <BulkCreateMetric
              label={isQueuedHandoff ? "Queued batch" : "Selected"}
              value={summary.total}
              tone={isQueuedHandoff ? "queue" : undefined}
            />
            <BulkCreateMetric
              label="Queueable"
              value={summary.queueableGenerateReady}
              tone={summary.queueableGenerateReady > 0 ? "ready" : undefined}
            />
            <BulkCreateMetric
              label="Intake"
              value={drawerReferenceIntakeTotal}
              tone={drawerReferenceIntakeTotal > 0 ? "source" : undefined}
            />
            <BulkCreateMetric
              label="Blocked"
              value={summary.blocked}
              tone={summary.blocked > 0 ? "blocked" : undefined}
            />
          </div>

          {isQueuedHandoff && (
            <div className="mt-5 rounded-md border border-sky-500/20 bg-sky-500/[0.045] p-3">
              <div className="text-xs font-medium text-sky-100">Ready for Studio</div>
              <div className="mt-1 text-[11px] leading-snug text-sky-100/65">
                These SKU images are queued. Open the Studio group{studioDestinations.length === 1 ? "" : "s"} below and use the Masters batch preflight to generate them.
              </div>
            </div>
          )}

          <div className="mt-5 space-y-2">
            <BulkCreateStage
              label="Import local references"
              count={summary.actionCounts["import-local-reference"]}
              tone="ready"
              detail="Local matches need conversion/upload before generation."
            />
            <BulkCreateStage
              label="Source website references"
              count={summary.actionCounts["source-website-reference"]}
              tone="source"
              detail="BestBottles.com fallback when no local reference is matched."
            />
            <BulkCreateStage
              label="Queue image generation"
              count={summary.queueableGenerateReady}
              tone="queue"
              detail="Selected persisted SKU jobs with ready references."
            />
            <BulkCreateStage
              label="Already queued or generating"
              count={summary.alreadyQueuedOrGenerating}
              tone="queue"
              detail="Already in the creation lane; no re-queue needed."
            />
            <BulkCreateStage
              label="Review generated images"
              count={summary.actionCounts["review-generated"]}
              tone="review"
              detail="Generated outputs need approval before destination work."
            />
            <BulkCreateStage
              label="Push or sync destinations"
              count={summary.actionCounts["push-to-shopify"] + summary.actionCounts["sync-convex"]}
              tone="destination"
              detail="These are downstream publishing steps, not image creation."
            />
            <BulkCreateStage
              label="Needs source match"
              count={summary.actionCounts["needs-source-match"]}
              tone="blocked"
              detail="No local or website reference has been matched yet."
            />
            {summary.reportOnlyGenerateReady > 0 && (
              <BulkCreateStage
                label="Report-only ready rows"
                count={summary.reportOnlyGenerateReady}
                tone="muted"
                detail="These rows are not persisted as SKU jobs yet."
              />
            )}
          </div>

          {studioDestinations.length > 1 && (
            <div className="mt-5 rounded-md border border-sky-500/20 bg-sky-500/[0.045] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-xs font-medium text-sky-100">
                  {creationLaneImageCount} image{creationLaneImageCount === 1 ? "" : "s"} across{" "}
                  {studioDestinations.length} Studio groups
                </div>
                {summary.alreadyQueuedOrGenerating > 0 && (
                  <span className="rounded border border-sky-500/20 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-sky-200">
                    queued/generating {summary.alreadyQueuedOrGenerating}
                  </span>
                )}
              </div>
              <div className="mt-2 divide-y divide-white/[0.06] rounded border border-white/[0.08]">
                {studioDestinations.map((destination) => (
                  <div
                    key={destination.productGroupSlug}
                    className="flex items-center justify-between gap-3 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-xs text-white/85">{destination.productGroupDisplayName}</div>
                      <div className="font-mono text-[10px] text-white/40">{destination.productGroupSlug}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="rounded border border-sky-500/25 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-sky-200">
                        {destination.count}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onOpenStudio(destination.productGroupSlug)}
                        className="h-7 px-2 text-[10px] text-sky-100 hover:bg-sky-500/[0.1] hover:text-sky-50"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Open
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {referenceIntakeRows.length > 0 && (
            <div className="mt-5 rounded-md border border-amber-500/20 bg-amber-500/[0.05] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-xs font-medium text-amber-100">Reference intake</div>
                {localReferenceRows.length > 0 && (
                  <span className="rounded border border-emerald-500/20 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-emerald-200">
                    local {localReferenceRows.length}
                  </span>
                )}
                {websiteReferenceRows.length > 0 && (
                  <span className="rounded border border-amber-500/25 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-amber-200">
                    website fallback {websiteReferenceRows.length}
                  </span>
                )}
                {sourceMatchRows.length > 0 && (
                  <span className="rounded border border-rose-500/25 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-rose-200">
                    firecrawl source match {sourceMatchRows.length}
                  </span>
                )}
              </div>
              <div className="mt-1 text-xs leading-relaxed text-amber-100/65">
                Run the targeted intake step to import selected references and automatically scrape bestbottles.com for selected Needs source match rows.
              </div>
              <div className="mt-2 overflow-hidden rounded border border-white/10 bg-black/25 px-2 py-1.5 font-mono text-[10px] text-white/65">
                <div className="truncate" title={referenceApplyCommand}>{referenceApplyCommand}</div>
              </div>
              <div className="mt-2 text-[11px] font-medium uppercase tracking-wider text-amber-100/50">
                Mixed local + website smoke
              </div>
              <div className="mt-1 overflow-hidden rounded border border-white/10 bg-black/20 px-2 py-1.5 font-mono text-[10px] text-white/55">
                <div className="truncate" title={mixedSmokeCommand}>{mixedSmokeCommand}</div>
              </div>
              {websiteReferenceRows.length > 0 && (
                <div className="mt-2 text-[11px] leading-snug text-amber-100/55">
                  Website fallback rows are pulled from bestbottles.com, converted when needed, uploaded as public references, then promoted to ready-to-generate.
                </div>
              )}
              {sourceMatchRows.length > 0 && (
                <div className="mt-2 text-[11px] leading-snug text-amber-100/55">
                  Needs source match rows run Firecrawl first. Clean SKU-backed matches are imported through the same public reference path; unresolved rows stay visible.
                </div>
              )}
            </div>
          )}

          {familyCounts.length > 0 && (
            <div className="mt-5">
              <div className="text-xs font-medium uppercase tracking-wider text-white/45">
                Selected families
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {familyCounts.map(([family, count]) => (
                  <span
                    key={family}
                    className="rounded border border-white/10 px-2 py-1 text-[10px] text-white/60"
                  >
                    {family} {count}
                  </span>
                ))}
              </div>
            </div>
          )}

          {queueableRows.length > 0 && (
            <div className="mt-5">
              <div className="text-xs font-medium uppercase tracking-wider text-white/45">
                Ready to queue
              </div>
              <div className="mt-2 divide-y divide-white/[0.06] rounded-md border border-white/[0.08]">
                {queueableRows.map((row) => (
                  <div key={row.id} className="flex items-start justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <div className="font-mono text-xs text-white/85">{row.graceSku}</div>
                      <div className="truncate text-[11px] text-white/45">{row.productGroupDisplayName}</div>
                    </div>
                    <span className="shrink-0 rounded border border-sky-500/25 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-sky-300">
                      ready
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <SheetFooter className="border-t border-white/[0.08] px-6 py-4">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-white/65 hover:bg-white/[0.06] hover:text-white"
          >
            Close
          </Button>
          {singleStudioDestination && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenStudio(singleStudioDestination.productGroupSlug)}
              className="text-white/65 hover:bg-white/[0.06] hover:text-white"
            >
              <ExternalLink className="h-4 w-4" />
              Open {singleStudioDestination.family} in Studio
            </Button>
          )}
          <Button
            type="button"
            variant="brass"
            onClick={primaryAction === "push" ? onPushReady : onQueueGenerateReady}
            disabled={
              (primaryAction === "queue" && !summary.canQueueGeneration) ||
              isQueuedHandoff ||
              queueing ||
              (primaryAction === "push" && pushing)
            }
          >
            {primaryActionBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : primaryAction === "push" ? (
              <PackageCheck className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {primaryButtonLabel}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function buildReferenceIntakeCommand(organizationId: string, rows: NeedsWorkRow[]): string {
  const skuArgs = rows
    .map((row) => row.graceSku)
    .filter(Boolean)
    .map((sku) => ` --sku ${shellQuote(sku)}`)
    .join("");
  return `npm run bestbottles:references:intake -- --apply --organization-id ${shellQuote(organizationId)}${skuArgs}`;
}

function BulkCreateMetric({
  label,
  value,
  tone,
}: {
	  label: string;
	  value: number;
	  tone?: "ready" | "source" | "queue" | "blocked";
	}) {
  return (
    <div
      className={cn(
        "rounded-md border border-white/[0.08] bg-white/[0.03] p-3",
	        tone === "ready" && "border-emerald-500/25 bg-emerald-500/[0.05]",
	        tone === "source" && "border-amber-500/25 bg-amber-500/[0.05]",
	        tone === "queue" && "border-sky-500/25 bg-sky-500/[0.05]",
	        tone === "blocked" && "border-rose-500/25 bg-rose-500/[0.05]",
      )}
    >
      <div className="text-[10px] font-mono uppercase tracking-wider text-white/45">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}

function BulkCreateStage({
  label,
  count,
  detail,
  tone,
}: {
  label: string;
  count: number;
  detail: string;
  tone: "ready" | "source" | "queue" | "review" | "destination" | "blocked" | "muted";
}) {
  const palette = {
    ready: "border-emerald-500/25 text-emerald-200",
    source: "border-amber-500/25 text-amber-200",
    queue: "border-sky-500/25 text-sky-200",
    review: "border-violet-500/25 text-violet-200",
    destination: "border-cyan-500/25 text-cyan-200",
    blocked: "border-rose-500/25 text-rose-200",
    muted: "border-white/10 text-white/55",
  } satisfies Record<typeof tone, string>;

  return (
    <div className="rounded-md border border-white/[0.08] bg-white/[0.025] px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-white">{label}</div>
          <div className="mt-0.5 text-xs leading-snug text-white/45">{detail}</div>
        </div>
        <span
          className={cn(
            "shrink-0 rounded border px-2 py-1 text-[10px] font-mono uppercase tracking-wider",
            palette[tone],
          )}
        >
          {count}
        </span>
      </div>
    </div>
  );
}

function referenceSourceDetail(row: NeedsWorkRow): string {
  if (row.referenceSourcePath) return row.referenceSourcePath;
  if (row.referenceSourceUrl) return row.referenceSourceUrl;
  if (row.bestReferenceCandidatePath) return row.bestReferenceCandidatePath;
  if (row.generatedImageUrl) return row.generatedImageUrl;
  if (row.approvedImageUrl) return row.approvedImageUrl;
  if (row.shopifyImageUrl) return row.shopifyImageUrl;
  return "No reference source matched yet";
}

function NeedsWorkActionPill({ action }: { action: BestBottlesNeedsWorkAction }) {
  const palette: Record<BestBottlesNeedsWorkAction, string> = {
    "import-local-reference": "border-emerald-500/30 text-emerald-300",
    "source-website-reference": "border-amber-500/30 text-amber-300",
    "generate-image": "border-sky-500/30 text-sky-300",
    "review-generated": "border-violet-500/30 text-violet-300",
    "push-to-shopify": "border-emerald-500/25 text-emerald-200",
    "sync-convex": "border-sky-500/35 text-sky-200",
    "needs-source-match": "border-rose-500/35 text-rose-300",
    complete: "border-emerald-500/40 text-emerald-200",
  };
  return (
    <span className={cn("inline-flex rounded border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider", palette[action])}>
      {BEST_BOTTLES_NEEDS_WORK_ACTION_LABELS[action]}
    </span>
  );
}

function ReferenceSourcePill({ source }: { source: BestBottlesReferenceSource }) {
  const labels: Record<BestBottlesReferenceSource, string> = {
    "canonical-render": "Canonical render",
    "flattened-product-truth": "Flattened truth",
    "local-legacy": "Local legacy",
    "bestbottles-live": "BestBottles.com",
    manual: "Manual",
    none: "No source",
  };
  const palette: Record<BestBottlesReferenceSource, string> = {
    "canonical-render": "border-emerald-500/25 text-emerald-300",
    "flattened-product-truth": "border-sky-500/25 text-sky-300",
    "local-legacy": "border-emerald-500/25 text-emerald-300",
    "bestbottles-live": "border-amber-500/25 text-amber-300",
    manual: "border-sky-500/25 text-sky-300",
    none: "border-rose-500/25 text-rose-300",
  };
  return (
    <span className={cn("inline-flex rounded border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider", palette[source])}>
      {labels[source]}
    </span>
  );
}

function referenceRigStatusMeta(status: ReferenceRigPrepStatus) {
  const labels: Record<ReferenceRigPrepStatus, string> = {
    ready_for_madison_import: "Rig ready",
    ready_for_madison_import_with_review: "Rig review",
    needs_background_removal: "Needs BG removal",
    needs_alpha_edge_review: "Edge review",
    needs_source_match: "Needs source",
    needs_manual_duplicate_choice: "Choose source",
    needs_sku_key_correction: "Fix SKU key",
    needs_cap_state: "Needs cap state",
  };
  const ok = status === "ready_for_madison_import";
  const review = status === "ready_for_madison_import_with_review" || status === "needs_alpha_edge_review";
  return {
    label: labels[status],
    className: ok
      ? "border-emerald-500/25 text-emerald-300"
      : review
        ? "border-sky-500/25 text-sky-200"
        : "border-amber-500/25 text-amber-200",
  };
}

function ReferenceRigPills({ rig }: { rig: CylinderReferenceRigRow }) {
  const status = referenceRigStatusMeta(rig.status);
  const title = [
    rig.targetPath ? `Import: ${rig.targetPath}` : null,
    rig.sourcePath ? `Source: ${rig.sourcePath}` : null,
    ...rig.issues,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5" title={title || undefined}>
      <span
        className={cn(
          "rounded border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider",
          status.className,
        )}
      >
        {status.label}
      </span>
      <span
        className={cn(
          "rounded border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider",
          rig.capState ? "border-white/10 text-white/55" : "border-amber-500/25 text-amber-200",
        )}
      >
        {rig.capState ?? "cap state missing"}
      </span>
      <span
        className={cn(
          "rounded border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider",
          rig.hasAlpha ? "border-emerald-500/20 text-emerald-300" : "border-amber-500/20 text-amber-200",
        )}
      >
        {rig.hasAlpha ? "PNG alpha" : "no alpha"}
      </span>
    </div>
  );
}

function NeedsWorkDestination({ row }: { row: NeedsWorkRow }) {
  if (row.shopifyImageUrl) {
    return (
      <span className="inline-flex rounded border border-sky-500/30 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-sky-300">
        Shopify image
      </span>
    );
  }
  if (row.approvedImageUrl) {
    return (
      <span className="inline-flex rounded border border-emerald-500/25 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-emerald-300">
        Approved image
      </span>
    );
  }
  if (row.generatedImageUrl) {
    return (
      <span className="inline-flex rounded border border-violet-500/25 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-violet-300">
        Generated image
      </span>
    );
  }
  return (
    <span className="inline-flex rounded border border-white/10 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-white/40">
      Not generated
    </span>
  );
}

function CoverageGroupTable({
  groups,
  rowsBySlug,
  readinessByGroup,
  workflowByGroup,
  onOpenStudio,
  onQueueReadySkuJobs,
  onPushApprovedSkuJobs,
  pushingGroupSlug,
}: {
  groups: MadisonProductGroupCoverage[];
  rowsBySlug: Map<string, PipelineGroup>;
  readinessByGroup: Map<string, ReadinessGroupRollup>;
  workflowByGroup: Map<string, WorkflowGroupRollup>;
  onOpenStudio: (slug: string) => void;
  onQueueReadySkuJobs?: (slug: string, readyGraceSkus?: string[]) => void | Promise<void>;
  onPushApprovedSkuJobs?: (slug: string) => void | Promise<void>;
  pushingGroupSlug?: string | null;
}) {
  return (
    <Card className="border-white/[0.06] bg-white/[0.02] text-white overflow-hidden">
      <div className="p-4 border-b border-white/[0.06] flex items-center justify-between gap-3">
        <div>
          <div className="font-medium">Product group queue</div>
          <p className="text-xs text-white/50 mt-1">
            One row per Convex product group. Variant counts below roll up the SKU-level image jobs.
          </p>
        </div>
        <Badge variant="outline" className="border-white/10 text-white/60">
          {groups.length} shown
        </Badge>
      </div>
      <div className="overflow-auto max-h-[720px]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-[#111113] text-left text-[10px] uppercase tracking-wider text-white/45">
            <tr className="border-b border-white/[0.06]">
              <th className="px-3 py-2 font-medium">Group</th>
              <th className="px-3 py-2 font-medium">Family</th>
              <th className="px-3 py-2 font-medium">Catalog</th>
              <th className="px-3 py-2 font-medium text-right">SKU jobs</th>
              <th className="px-3 py-2 font-medium text-right">Ready</th>
              <th className="px-3 py-2 font-medium text-right">Need ref</th>
              <th className="px-3 py-2 font-medium text-right">Generated</th>
              <th className="px-3 py-2 font-medium">Next step</th>
              <th className="px-3 py-2 font-medium">Madison</th>
              <th className="px-3 py-2 font-medium">Destination</th>
              <th className="px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const row = rowsBySlug.get(group.productGroupSlug);
              const readiness = readinessByGroup.get(group.productGroupSlug);
              const workflow = workflowByGroup.get(group.productGroupSlug);
              const skuJobCount = getGroupSkuJobCount(group, readiness);
              const readyCount = getGroupReadyCount(group, readiness);
              const needsReferenceCount = getGroupNeedsReferenceCount(group, readiness);
              const reviewCount = getGroupGeneratedReviewCount(group, workflow);
              const pushableCount = workflow?.approvedPendingPush ?? group.approvedGeneratedImages;
              return (
                <tr key={group.productGroupSlug} className="border-b border-white/[0.04] hover:bg-white/[0.03]">
                  <td className="px-3 py-3 min-w-[260px]">
                    <div className="font-medium text-white/90">{group.displayName}</div>
                    <div className="font-mono text-[11px] text-white/40">{group.productGroupSlug}</div>
                  </td>
                  <td className="px-3 py-3 text-white/70">{group.family}</td>
                  <td className="px-3 py-3 text-white/60">{group.catalogReferencePages}</td>
                  <td className="px-3 py-3 text-right font-mono">{skuJobCount}</td>
                  <td className="px-3 py-3 text-right font-mono text-emerald-300">{readyCount}</td>
                  <td className="px-3 py-3 text-right font-mono text-amber-300">{needsReferenceCount}</td>
                  <td className="px-3 py-3 text-right font-mono text-violet-300">{reviewCount}</td>
                  <td className="px-3 py-3">
                    <GroupReasonPill
                      group={group}
                      readiness={readiness}
                      workflow={workflow}
                      row={row}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <WorkflowStatusPill
                      row={row}
                      workflow={workflow}
                      skuJobCount={skuJobCount}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <DestinationPill row={row} workflow={workflow} />
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex justify-end gap-2">
                    {onQueueReadySkuJobs && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onQueueReadySkuJobs(group.productGroupSlug, readiness?.readyGraceSkus)}
                        disabled={readyCount === 0}
                        className="border-white/15 bg-white/[0.02] text-white hover:bg-white/[0.06] hover:text-white"
                      >
                        <Play className="w-3.5 h-3.5 mr-1.5" />
                        Queue ready
                      </Button>
                    )}
                    {onPushApprovedSkuJobs && (
                      <Button
                        size="sm"
                        variant={pushableCount > 0 ? "brass" : "outline"}
                        onClick={() => onPushApprovedSkuJobs(group.productGroupSlug)}
                        disabled={pushableCount === 0 || pushingGroupSlug === group.productGroupSlug}
                        className={cn(
                          pushableCount > 0
                            ? ""
                            : "border-white/15 bg-white/[0.02] text-white hover:bg-white/[0.06] hover:text-white",
                        )}
                      >
                        {pushingGroupSlug === group.productGroupSlug ? (
                          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <PackageCheck className="w-3.5 h-3.5 mr-1.5" />
                        )}
                        {pushableCount > 0 ? `Push ready ${pushableCount}` : "Push ready"}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onOpenStudio(group.productGroupSlug)}
                      className="border-white/15 bg-white/[0.02] text-white hover:bg-white/[0.06] hover:text-white"
                    >
                      <Layers className="w-3.5 h-3.5 mr-1.5" />
                      Studio
                    </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
	  );
	}

function GroupReasonPill({
  group,
  readiness,
  workflow,
  row,
}: {
  group: MadisonProductGroupCoverage;
  readiness?: ReadinessGroupRollup;
  workflow?: WorkflowGroupRollup;
  row?: PipelineGroup;
}) {
  const skuJobCount = getGroupSkuJobCount(group, readiness);
  const readyCount = getGroupReadyCount(group, readiness);
  const needsReferenceCount = getGroupNeedsReferenceCount(group, readiness);
  const needsMeasurementCount = readiness?.needsMeasurement ?? 0;
  const needsPolicyCount = readiness?.needsPromptPolicy ?? 0;
  const componentCount = readiness?.componentException ?? 0;
  const reviewCount = getGroupGeneratedReviewCount(group, workflow);
  const approvedCount = getGroupApprovedCount(group, workflow);
  const shopifyPushedCount = getGroupShopifyPushedCount(row, workflow);
  const convexSyncedCount = getGroupConvexSyncedCount(row, workflow);

  let label = "Not ready";
  let palette = "border-white/10 text-white/45";

  if (workflow?.stateLabel && workflow.stateLabel !== "Not generated") {
    const count =
      workflow.nextAction === "review-generated"
        ? reviewCount
        : workflow.nextAction === "push-to-shopify"
          ? workflow.approvedPendingPush || approvedCount
          : workflow.nextAction === "sync-convex"
            ? Math.max(shopifyPushedCount - convexSyncedCount, 1)
            : convexSyncedCount;
    label = count > 0 ? `${workflow.stateLabel} ${count}` : workflow.stateLabel;
    if (workflow.nextAction === "complete") {
      palette = "border-emerald-500/35 text-emerald-200";
    } else if (workflow.nextAction === "sync-convex") {
      palette = "border-sky-500/35 text-sky-200";
    } else if (workflow.nextAction === "push-to-shopify") {
      palette = "border-emerald-500/30 text-emerald-300";
    } else {
      palette = "border-violet-500/30 text-violet-300";
    }
  } else if (skuJobCount > 0 && convexSyncedCount >= skuJobCount) {
    label = "Synced";
    palette = "border-emerald-500/35 text-emerald-200";
  } else if (shopifyPushedCount > 0) {
    label = `Pushed ${shopifyPushedCount}`;
    palette = "border-sky-500/35 text-sky-200";
  } else if (approvedCount > 0) {
    label = `Push ready ${approvedCount}`;
    palette = "border-emerald-500/30 text-emerald-300";
  } else if (reviewCount > 0) {
    label = `Generated ${reviewCount}`;
    palette = "border-violet-500/30 text-violet-300";
  } else if (needsReferenceCount > 0) {
    label = `Needs ref ${needsReferenceCount}`;
    palette = "border-amber-500/30 text-amber-300";
  } else if (needsMeasurementCount > 0) {
    label = `Measurement ${needsMeasurementCount}`;
    palette = "border-rose-500/30 text-rose-300";
  } else if (needsPolicyCount > 0) {
    label = `Policy ${needsPolicyCount}`;
    palette = "border-rose-500/30 text-rose-300";
  } else if (componentCount > 0) {
    label = `Component ${componentCount}`;
    palette = "border-white/15 text-white/55";
  } else if (readyCount > 0) {
    label = `Ready ${readyCount}`;
    palette = "border-emerald-500/30 text-emerald-300";
  } else if (!row) {
    label = "Report only";
    palette = "border-amber-500/25 text-amber-300";
  }

  const blockers = [
    readyCount > 0 ? `${readyCount} ready` : null,
    needsReferenceCount > 0 ? `${needsReferenceCount} need reference` : null,
    needsMeasurementCount > 0 ? `${needsMeasurementCount} missing measurement` : null,
    needsPolicyCount > 0 ? `${needsPolicyCount} missing policy` : null,
    componentCount > 0 ? `${componentCount} component exception` : null,
    reviewCount > 0 ? `${reviewCount} in review` : null,
    approvedCount > 0 ? `${approvedCount} approved` : null,
    shopifyPushedCount > 0 ? `${shopifyPushedCount} pushed to Shopify` : null,
    convexSyncedCount > 0 ? `${convexSyncedCount} synced to Convex` : null,
  ].filter(Boolean);

  return (
    <span
      className={cn("inline-flex rounded border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider", palette)}
      title={blockers.length > 0 ? blockers.join(" · ") : undefined}
    >
      {label}
    </span>
  );
}

function WorkflowStatusPill({
  row,
  workflow,
  skuJobCount,
}: {
  row: PipelineGroup | undefined;
  workflow?: WorkflowGroupRollup;
  skuJobCount: number;
}) {
  if (workflow?.stateLabel && workflow.stateLabel !== "Not generated") {
    const count =
      workflow.nextAction === "review-generated"
        ? workflow.generatedOrReview
        : workflow.nextAction === "push-to-shopify"
          ? workflow.approvedPendingPush || workflow.approvedTotal
          : workflow.nextAction === "sync-convex"
            ? Math.max(workflow.shopifyPushed - workflow.convexSynced, 1)
            : workflow.convexSynced;
    const palette =
      workflow.nextAction === "complete"
        ? "border-emerald-500/35 text-emerald-200"
        : workflow.nextAction === "sync-convex"
          ? "border-sky-500/35 text-sky-200"
          : workflow.nextAction === "push-to-shopify"
            ? "border-emerald-500/30 text-emerald-300"
            : "border-violet-500/30 text-violet-300";
    return (
      <span
        className={cn(
          "inline-flex rounded border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider",
          palette,
        )}
        title="SKU job workflow state"
      >
        {workflow.stateLabel} {count}
      </span>
    );
  }

  return row ? <StatusPill status={row.madison_status} /> : <MissingPipelinePill skuJobCount={skuJobCount} />;
}

function SkuJobTable({
  jobs,
  rowsBySlug,
  shownCount,
  totalCount,
  onUpdateStatus,
}: {
  jobs: SkuJobTableRow[];
  rowsBySlug: Map<string, PipelineGroup>;
  shownCount: number;
  totalCount: number;
  onUpdateStatus: (job: PipelineSkuJob, status: "approved" | "rejected") => void | Promise<void>;
}) {
  return (
    <Card className="border-white/[0.06] bg-white/[0.02] text-white overflow-hidden">
      <div className="p-4 border-b border-white/[0.06] flex items-center justify-between gap-3">
        <div>
          <div className="font-medium">SKU image job queue</div>
          <p className="text-xs text-white/50 mt-1">
            One job per product variant image. This is the operating list for Madison generation,
            approval, Shopify push, and Convex sync.
          </p>
        </div>
        <Badge variant="outline" className="border-white/10 text-white/60">
          {shownCount} shown · {totalCount} total
        </Badge>
      </div>
      <div className="overflow-auto max-h-[720px]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-[#111113] text-left text-[10px] uppercase tracking-wider text-white/45">
            <tr className="border-b border-white/[0.06]">
              <th className="px-3 py-2 font-medium">SKU</th>
              <th className="px-3 py-2 font-medium">Product group</th>
              <th className="px-3 py-2 font-medium">Family</th>
              <th className="px-3 py-2 font-medium">Visual ref</th>
              <th className="px-3 py-2 font-medium">Job status</th>
              <th className="px-3 py-2 font-medium text-right">Generated</th>
              <th className="px-3 py-2 font-medium text-right">Review</th>
              <th className="px-3 py-2 font-medium text-right">Ready</th>
              <th className="px-3 py-2 font-medium">Destination</th>
              <th className="px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => {
              const persisted = isPersistedSkuJob(job);
              const productGroupSlug = persisted ? job.product_group_slug : job.productGroupSlug;
              const productGroupDisplayName = persisted
                ? job.product_group_display_name ?? job.product_group_slug
                : job.productGroupDisplayName;
              const graceSku = persisted ? job.grace_sku : job.graceSku;
              const websiteSku = persisted ? job.website_sku : job.websiteSku;
              const shopifySku = persisted ? job.shopify_sku : job.shopifySku;
              const family = persisted ? job.family : job.family;
              const catalogReferencePages = persisted
                ? job.catalog_reference_pages ?? ""
                : job.catalogReferencePages;
              const row = rowsBySlug.get(productGroupSlug);
              const jobStatus = persisted ? classifyPersistedSkuJob(job) : classifySkuJob(job, row);
              const generatedCount = persisted
                ? job.generated_image_url || job.generated_image_id
                  ? 1
                  : 0
                : job.generatedCandidateCount;
              const reviewCount = persisted
                ? job.status === "qa-pending"
                  ? 1
                  : 0
                : job.reviewCandidateCount;
              const readyCount = persisted
                ? job.status === "approved" || job.status === "shopify-pushed" || job.status === "synced"
                  ? 1
                  : 0
                : job.shopifyReadyCount;
              return (
                <tr key={`${graceSku}-${websiteSku}`} className="border-b border-white/[0.04] hover:bg-white/[0.03]">
                  <td className="px-3 py-3 min-w-[250px]">
                    <div className="font-mono text-xs text-white/90">{graceSku}</div>
                    <div className="font-mono text-[11px] text-white/45">{websiteSku}</div>
                    {shopifySku && shopifySku !== websiteSku && (
                      <div className="font-mono text-[11px] text-amber-200/70">Shopify {shopifySku}</div>
                    )}
                  </td>
                  <td className="px-3 py-3 min-w-[240px]">
                    <div className="truncate text-white/75">{productGroupDisplayName}</div>
                    <div className="font-mono text-[11px] text-white/40">{productGroupSlug}</div>
                  </td>
                  <td className="px-3 py-3 text-white/70">{family}</td>
                  <td className="px-3 py-3 text-white/60">{catalogReferencePages}</td>
                  <td className="px-3 py-3"><SkuJobStatusPill status={jobStatus} /></td>
                  <td className="px-3 py-3 text-right font-mono">{generatedCount}</td>
                  <td className="px-3 py-3 text-right font-mono">{reviewCount}</td>
                  <td className="px-3 py-3 text-right font-mono">{readyCount}</td>
                  <td className="px-3 py-3">
                    {persisted ? <SkuDestinationPill job={job} /> : <DestinationPill row={row} />}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {persisted && (
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onUpdateStatus(job, "approved")}
                          disabled={job.status === "approved" || job.status === "shopify-pushed" || job.status === "synced"}
                          className="border-white/15 bg-white/[0.02] text-white hover:bg-white/[0.06] hover:text-white"
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onUpdateStatus(job, "rejected")}
                          disabled={job.status === "synced"}
                          className="border-white/15 bg-white/[0.02] text-white hover:bg-white/[0.06] hover:text-white"
                        >
                          Reject
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function MissingPipelinePill({ skuJobCount }: { skuJobCount: number }) {
  if (skuJobCount > 0) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded border border-sky-500/25 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-sky-300"
        title="SKU jobs exist, but the product group rollup row has not been imported into the Madison pipeline table yet."
      >
        <AlertTriangle className="w-3 h-3" />
        SKU jobs only
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded border border-amber-500/25 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-amber-300"
      title="No Madison product group rollup or SKU jobs have been imported for this group yet."
    >
      <AlertTriangle className="w-3 h-3" />
      Import needed
    </span>
  );
}

function DestinationPill({
  row,
  workflow,
}: {
  row: PipelineGroup | undefined;
  workflow?: WorkflowGroupRollup;
}) {
  if (workflow?.approvedPendingPush) {
    return (
      <span className="inline-flex rounded border border-emerald-500/25 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-emerald-300">
        Push ready {workflow.approvedPendingPush}
      </span>
    );
  }
  if (workflow && workflow.shopifyPushed > workflow.convexSynced) {
    return (
      <span className="inline-flex rounded border border-sky-500/30 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-sky-300">
        Sync Convex {workflow.shopifyPushed - workflow.convexSynced}
      </span>
    );
  }
  if (workflow?.convexSynced) {
    return (
      <span className="inline-flex rounded border border-emerald-500/30 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-emerald-300">
        Convex synced {workflow.convexSynced}
      </span>
    );
  }
  if (workflow) {
    return (
      <span className="inline-flex rounded border border-white/10 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-white/40">
        Not pushed
      </span>
    );
  }
  if (isPipelineRowPushedAndSynced(row)) {
    return (
      <span className="inline-flex rounded border border-emerald-500/30 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-emerald-300">
        Shopify + Convex synced
      </span>
    );
  }
  if (row?.madison_shopify_synced_at) {
    return (
      <span className="inline-flex rounded border border-sky-500/30 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-sky-300">
        Shopify pushed
      </span>
    );
  }
  if (row?.madison_convex_synced_at) {
    return (
      <span className="inline-flex rounded border border-sky-500/30 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-sky-300">
        Convex synced
      </span>
    );
  }
  if (isPipelineRowApproved(row)) {
    return (
      <span className="inline-flex rounded border border-emerald-500/25 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-emerald-300">
        Approved, not pushed
      </span>
    );
  }
  return (
    <span className="inline-flex rounded border border-white/10 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-white/40">
      Not pushed
    </span>
  );
}

function SkuDestinationPill({ job }: { job: PipelineSkuJob }) {
  if (job.status === "synced" || (job.shopify_pushed_at && job.convex_synced_at)) {
    return (
      <span className="inline-flex rounded border border-emerald-500/30 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-emerald-300">
        Shopify + Convex synced
      </span>
    );
  }
  if (job.status === "shopify-pushed" || job.shopify_pushed_at) {
    return (
      <span className="inline-flex rounded border border-sky-500/30 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-sky-300">
        Shopify pushed
      </span>
    );
  }
  if (job.status === "approved") {
    return (
      <span className="inline-flex rounded border border-emerald-500/25 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-emerald-300">
        Push ready
      </span>
    );
  }
  return (
    <span className="inline-flex rounded border border-white/10 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-white/40">
      Not pushed
    </span>
  );
}

function SkuJobStatusPill({ status }: { status: SkuJobStage }) {
  const labels: Record<SkuJobStage, string> = {
    all: "Audit needed",
    "needs-reference": "Needs reference",
    "ready-to-generate": "Ready to generate",
    generated: "Generated/review",
    approved: "Approved",
    "shopify-pushed": "Shopify pushed",
    "convex-synced": "Convex synced",
  };
  const palette: Record<SkuJobStage, string> = {
    all: "border-white/10 text-white/40",
    "needs-reference": "border-rose-500/30 text-rose-300",
    "ready-to-generate": "border-amber-500/30 text-amber-300",
    generated: "border-violet-500/30 text-violet-300",
    approved: "border-emerald-500/30 text-emerald-300",
    "shopify-pushed": "border-sky-500/35 text-sky-200",
    "convex-synced": "border-emerald-500/40 text-emerald-200",
  };
  return (
    <span className={cn("inline-flex rounded border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider", palette[status])}>
      {labels[status]}
    </span>
  );
}

/**
 * Resolve which Convex productGroup slug to use when opening the Studio
 * for a ShapeGroup. A ShapeGroup is family × capacity × thread; a Convex
 * productGroup is family × capacity × color — so one ShapeGroup can map to
 * multiple Convex slugs (one per color variant). Preference order:
 *   1. The pinned hero-reference row's slug (matches the existing Launch
 *      button's master-preference behavior)
 *   2. The first row with a non-null convex_slug
 * Returns null when no row carries a slug — caller disables the button.
 */
function resolveStudioSlugForGroup(group: ShapeGroup): string | null {
  const pinned = group.rows.find(
    (r) => r.is_hero_reference && typeof r.convex_slug === "string" && r.convex_slug,
  );
  if (pinned?.convex_slug) return pinned.convex_slug;
  const firstWithSlug = group.rows.find(
    (r) => typeof r.convex_slug === "string" && r.convex_slug,
  );
  return firstWithSlug?.convex_slug ?? null;
}

function ShapeGroupCard({
  group,
  onLaunch,
  onOpenStudio,
  onToggleMaster,
}: {
  group: ShapeGroup;
  onLaunch: () => void;
  onOpenStudio: (() => void) | null;
  onToggleMaster: (row: PipelineGroup) => void | Promise<void>;
}) {
  const withHero = group.rows.filter(
    (r) => r.legacy_has_hero_image || r.madison_status === "approved" || r.madison_status === "synced",
  ).length;
  const label =
    `${group.family}` +
    (group.capacityMl != null ? ` · ${group.capacityMl}ml` : "") +
    (group.threadSize ? ` · ${group.threadSize}` : "");

  // Reference thumbnails synced from bestbottles.com product pages. Show the
  // whole reference set so 5-option sizes do not hide the final SKU.
  // Pinned row is sorted to position 0 so the operator's chosen master is
  // always visible.
  const rowsWithReference = group.rows.filter((r) => r.legacy_hero_image_url);
  const sortedReferenceRows = [...rowsWithReference].sort((a, b) =>
    a.is_hero_reference === b.is_hero_reference
      ? 0
      : a.is_hero_reference
        ? -1
        : 1,
  );
  const referenceThumbs = sortedReferenceRows;

  const hasActiveJob = group.rows.some(
    (r) => r.madison_status === "queued" || r.madison_status === "generating"
  );

  return (
    <Card
      className={cn(
        "p-4 border-white/[0.06] bg-white/[0.02] text-white space-y-3 transition-all duration-300",
        hasActiveJob && "border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.15)] animate-pulse"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium">{label}</div>
          <div className="text-xs text-white/50 mt-0.5">
            {group.rows.length} {group.rows.length === 1 ? "product" : "products"} ·
            {" "}
            <span className={withHero === group.rows.length ? "text-emerald-400" : "text-amber-400"}>
              {withHero}/{group.rows.length} heroes
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onOpenStudio && (
            <Button
              size="sm"
              variant="outline"
              onClick={onOpenStudio}
              className="border-white/15 bg-white/[0.02] text-white hover:bg-white/[0.06] hover:text-white"
              title="Masters + paper-doll components + composite preview for this shape group"
            >
              <Layers className="w-3.5 h-3.5 mr-1.5" />
              Open Studio
            </Button>
          )}
          <Button
            size="sm"
            onClick={onLaunch}
            className="bg-[var(--darkroom-accent,#B8956A)] text-black hover:bg-[var(--darkroom-accent,#B8956A)]/90"
          >
            <Play className="w-3.5 h-3.5 mr-1.5" />
            Launch
          </Button>
        </div>
      </div>

      {/* Reference thumbnail strip — rendered only when at least one row
          has a scraped legacy_hero_image_url. Each thumbnail is a toggle:
          click to pin this row as the shape group's master reference
          (click again to un-pin). The pinned thumbnail gets an amber ring
          + star badge and is preferred by the Launch button. */}
      {referenceThumbs.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 -mx-0.5">
          {referenceThumbs.map((row) => {
            const isPinned = row.is_hero_reference;
            return (
              <button
                type="button"
                key={`${row.id}-thumb`}
                onClick={() => onToggleMaster(row)}
                title={
                  isPinned
                    ? `Master reference — ${row.display_name}\nClick to un-pin.`
                    : `${row.display_name}\nClick to pin as master reference for this shape.`
                }
                className={cn(
                  "relative w-10 h-10 rounded overflow-hidden flex-shrink-0 transition-all",
                  "border bg-black/30 hover:border-white/30",
                  "focus:outline-none focus:ring-2 focus:ring-[var(--darkroom-accent,#B8956A)]/50",
                  isPinned
                    ? "border-[var(--darkroom-accent,#B8956A)] ring-1 ring-[var(--darkroom-accent,#B8956A)]/60 shadow-[0_0_8px_rgba(184,149,106,0.35)]"
                    : "border-white/[0.08]",
                )}
              >
                <img
                  src={row.legacy_hero_image_url ?? ""}
                  alt=""
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
                {isPinned && (
                  <span
                    className={cn(
                      "absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center",
                      "bg-[var(--darkroom-accent,#B8956A)] text-black",
                      "shadow-[0_0_6px_rgba(184,149,106,0.6)]",
                    )}
                    aria-label="Master reference"
                  >
                    <Star className="w-2.5 h-2.5 fill-current" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* SKU list */}
      <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
        {group.rows.map((row) => (
          <SkuRow key={row.id} row={row} />
        ))}
      </div>
    </Card>
  );
}

function SkuRow({ row }: { row: PipelineGroup }) {
  const done =
    row.legacy_has_hero_image ||
    row.madison_status === "approved" ||
    row.madison_status === "synced";
  // Actively working — the model is producing an image right now. Only these
  // two states should animate. "generated" / "qa-pending" are finished but
  // awaiting operator sign-off, not still working.
  const activelyWorking =
    row.madison_status === "queued" || row.madison_status === "generating";
  const awaitingApproval =
    row.madison_status === "generated" || row.madison_status === "qa-pending";

  return (
    <div className="flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-white/[0.03] transition-colors">
      {done ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
      ) : activelyWorking ? (
        <Loader2 className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 animate-spin" />
      ) : awaitingApproval ? (
        <Eye className="w-3.5 h-3.5 text-violet-400 flex-shrink-0" />
      ) : (
        <Circle className="w-3.5 h-3.5 text-white/30 flex-shrink-0" />
      )}
      <span className="flex-1 truncate text-white/80">{row.display_name}</span>
      {row.applicator_types ? (
        <Badge
          variant="outline"
          className="text-[9px] font-mono uppercase tracking-wider border-white/[0.1] text-white/50"
        >
          {row.applicator_types.split(",")[0].trim()}
        </Badge>
      ) : null}
      <StatusPill status={row.madison_status} />
    </div>
  );
}

function StatusPill({ status }: { status: PipelineStatus }) {
  const palette: Record<PipelineStatus, string> = {
    "not-started": "border-white/10 text-white/40",
    queued: "border-sky-500/30 text-sky-400",
    generating: "border-amber-500/30 text-amber-400",
    generated: "border-violet-500/30 text-violet-400",
    "qa-pending": "border-amber-500/30 text-amber-400",
    approved: "border-emerald-500/30 text-emerald-400",
    rejected: "border-rose-500/30 text-rose-400",
    synced: "border-emerald-500/40 text-emerald-300",
  };
  return (
    <span
      className={cn(
        "text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border",
        palette[status],
      )}
    >
      {status}
    </span>
  );
}

function FullPageSpinner({ label }: { label: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center text-white/50">
      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
      {label}
    </div>
  );
}

function FeatureDisabledNotice() {
  return (
    <div className="min-h-screen flex items-center justify-center text-white/60 p-6">
      <div className="max-w-md text-center space-y-2">
        <h1 className="text-xl font-semibold text-white">Grid Pipeline unavailable</h1>
        <p className="text-sm">
          This workspace doesn't have the Grid Pipeline feature enabled. Ask an
          admin to flip <code className="text-xs bg-white/5 px-1 py-0.5 rounded">brand_config.features.grid_pipeline</code> to{" "}
          <code className="text-xs bg-white/5 px-1 py-0.5 rounded">true</code> on the organization.
        </p>
      </div>
    </div>
  );
}

function EmptyState({
  onImport,
  hasAnyRows,
}: {
  onImport: () => void;
  hasAnyRows: boolean;
}) {
  return (
    <Card className="p-8 border-dashed border-white/10 bg-white/[0.02] text-center">
      <h3 className="text-white font-medium">
        {hasAnyRows ? "No groups match your filters" : "No pipeline groups yet"}
      </h3>
      <p className="text-sm text-white/60 mt-2 max-w-md mx-auto">
        {hasAnyRows
          ? "Adjust the filters above to see more groups, or import a fresh CSV from the best-bottles-website repo's Grid-Image-Tracker."
          : "Export Grid-Image-Tracker.xlsx from the best-bottles-website repo as CSV and upload it here to seed the pipeline."}
      </p>
      {!hasAnyRows ? (
        <Button className="mt-4" onClick={onImport}>
          <Upload className="w-4 h-4 mr-2" />
          Import CSV
        </Button>
      ) : null}
    </Card>
  );
}
