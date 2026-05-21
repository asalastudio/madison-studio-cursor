import { useState, useMemo, useRef, type ReactNode } from "react";
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
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useGridPipelineFeatureFlag } from "@/hooks/useGridPipelineFeatureFlag";
import {
  listPipelineGroups,
  listPipelineSkuJobs,
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
import {
  APPLICATOR_TO_FITMENT,
  GLASS_COLOR_TO_OPTION,
  type PipelineRowDescriptor,
} from "@/lib/bestBottlesPipelineMatching";
import {
  syncReferenceImages,
  type ReferenceSyncProgress,
} from "@/lib/bestBottlesReferenceSync";

type StatusFilter = "all" | PipelineStatus | "has-hero" | "no-hero";
type CoverageView = "groups" | "sku-jobs";
type SkuJobStage =
  | "all"
  | "needs-reference"
  | "ready-to-generate"
  | "generated"
  | "approved"
  | "shopify-pushed"
  | "convex-synced";
type SkuJobFilter = SkuJobStage | "not-pushed";
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

interface ReadinessGroupRollup {
  total: number;
  ready: number;
  needsReference: number;
  needsMeasurement: number;
  needsPromptPolicy: number;
  componentException: number;
  readyGraceSkus: string[];
}

interface WorkflowGroupRollup {
  generatedOrReview: number;
  approvedTotal: number;
  approvedPendingPush: number;
  shopifyPushed: number;
  convexSynced: number;
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

export default function BestBottlesPipeline() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { enabled, isLoading: flagLoading, organizationId } = useGridPipelineFeatureFlag();

  const [familyFilter, setFamilyFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [coverageView, setCoverageView] = useState<CoverageView>("groups");
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

  const { data: skuJobs = [], isLoading: skuJobsLoading } = useQuery({
    queryKey: ["best-bottles-pipeline-sku-jobs", organizationId],
    queryFn: () => listPipelineSkuJobs(organizationId!),
    enabled: !!organizationId && enabled,
    staleTime: 30 * 1000,
  });

  const hasPersistedSkuJobs = skuJobs.length > 0;

  const pipelineRowsBySlug = useMemo(() => {
    const map = new Map<string, PipelineGroup>();
    for (const row of rows) {
      if (row.convex_slug) map.set(row.convex_slug, row);
    }
    return map;
  }, [rows]);

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
    const map = new Map<string, WorkflowGroupRollup>();
    for (const job of skuJobs) {
      const existing =
        map.get(job.product_group_slug) ??
        {
          generatedOrReview: 0,
          approvedTotal: 0,
          approvedPendingPush: 0,
          shopifyPushed: 0,
          convexSynced: 0,
        };
      if (job.status === "generated" || job.status === "qa-pending" || job.status === "rejected") {
        existing.generatedOrReview += 1;
      }
      const hasShopifyPush =
        job.status === "shopify-pushed" ||
        job.status === "synced" ||
        Boolean(job.shopify_pushed_at || job.shopify_image_url || job.shopify_media_id);
      const hasConvexSync = job.status === "synced" || Boolean(job.convex_synced_at);
      if (job.status === "approved") {
        existing.approvedPendingPush += 1;
      }
      if (hasShopifyPush) {
        existing.shopifyPushed += 1;
      }
      if (hasConvexSync) {
        existing.convexSynced += 1;
      }
      if (
        job.status === "approved" ||
        hasShopifyPush ||
        hasConvexSync ||
        Boolean(job.approved_at || job.approved_image_url)
      ) {
        existing.approvedTotal += 1;
      }
      map.set(job.product_group_slug, existing);
    }
    return map;
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

  const filteredCoverageGroups = useMemo(() => {
    if (coverageData?.productGroups) {
      return coverageData.productGroups
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
    }

    if (hasPersistedSkuJobs) {
      return buildCoverageGroupsFromSkuJobs(skuJobs)
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

  const handleUpdateSkuJobStatus = async (
    job: PipelineSkuJob,
    status: "approved" | "rejected",
  ) => {
    try {
      await updatePipelineSkuJob(job.id, {
        status,
        approved_at: status === "approved" ? new Date().toISOString() : job.approved_at,
        approved_image_id: job.approved_image_id ?? job.generated_image_id,
        approved_image_url: job.approved_image_url ?? job.generated_image_url,
        last_error: status === "approved" ? null : job.last_error,
      });
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
        Boolean(job.approved_image_url),
    );
    if (approvedJobs.length === 0) {
      toast.info("No approved SKU jobs with image URLs to push.");
      return;
    }

    setPushingGroupSlug(productGroupSlug);
    try {
      const { data, error } = await supabase.functions.invoke("push-shopify-product-images", {
        body: {
          organizationId,
          items: approvedJobs.map((job) => ({
            imageId: job.approved_image_id,
            imageUrl: job.approved_image_url,
            sku: job.shopify_sku ?? job.website_sku,
            websiteSku: job.website_sku,
            graceSku: job.grace_sku,
            altText: job.product_group_display_name ?? job.website_sku,
          })),
          attachToVariant: true,
          syncBestBottlesConvex: true,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const results = Array.isArray(data?.results) ? data.results : [];
      const failedCount = Number(data?.failedCount ?? 0);
      if (failedCount > 0) {
        const firstFailure = results.find((result: { status?: string }) => result.status === "failed");
        throw new Error(firstFailure?.message ?? `${failedCount} SKU${failedCount === 1 ? "" : "s"} failed.`);
      }

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
            bestBottlesConvex?: unknown;
          }) =>
            markPipelineSkuJobSyncedBySku({
              organizationId,
              patch: {
                sku: result.sku,
                shopifySku: result.matchedShopifySku ?? result.sku,
                shopifyProductId: result.shopifyProductId ?? null,
                shopifyVariantId: result.shopifyVariantId ?? null,
                shopifyMediaId: result.mediaId ?? null,
                shopifyImageUrl: result.shopifyImageUrl ?? null,
                convexSynced: Boolean(result.bestBottlesConvex),
              },
            }),
          ),
      );

      toast.success(`Pushed ${approvedJobs.length} approved SKU job${approvedJobs.length === 1 ? "" : "s"}`, {
        description: "Shopify media and Convex sync metadata were written back per SKU.",
      });
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

  return (
    <div className="min-h-screen bg-[#0b0b0d] text-[var(--darkroom-text,#e8e6e0)] p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header + stats */}
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Best Bottles Madison Pipeline</h1>
            <p className="text-sm text-white/60 mt-1">
              Image-generation control room for Best Bottles. Track visual families,
              product groups, and SKU image jobs from reference readiness through
              Madison approval, Shopify push, and Convex sync.
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
              variant="outline"
              onClick={handleSyncReferences}
              disabled={
                syncing || !organizationId || missingReferenceCount === 0
              }
              title={
                missingReferenceCount === 0
                  ? "All product-group rows already have reference images"
                  : `Scrape product_url for ${missingReferenceCount} product-group row${missingReferenceCount === 1 ? "" : "s"} missing a reference. SKU-level reference blockers are tracked in the Need reference card.`
              }
            >
              {syncing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <ImageDown className="w-4 h-4 mr-2" />
              )}
              {syncing && syncProgress
                ? `Syncing ${syncProgress.completed}/${syncProgress.total}`
                : `Sync group refs${missingReferenceCount > 0 ? ` (${missingReferenceCount})` : ""}`}
            </Button>
            <Button
              variant="outline"
              onClick={handleExportSnapshot}
              disabled={rows.length === 0}
              title="Export Madison hero tracking snapshot CSV"
            >
              <Download className="w-4 h-4 mr-2" />
              Export snapshot
            </Button>
            <Button
              variant="outline"
              onClick={handleSeedSkuJobs}
              disabled={seedingSkuJobs || !organizationId || !coverageData}
              title="Persist the May 14 + Convex SKU coverage into Madison's per-SKU image job table"
            >
              {seedingSkuJobs ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <PackageCheck className="w-4 h-4 mr-2" />
              )}
              Seed SKU jobs
            </Button>
            <Button
              variant="outline"
              onClick={handleReconcileShopifyPushes}
              disabled={reconcilingShopifyPushes || !organizationId || !hasPersistedSkuJobs}
              title="Backfill per-SKU Pipeline status from historical Madison Shopify publish logs"
            >
              {reconcilingShopifyPushes ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Reconcile pushes
            </Button>
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing || !organizationId}
            >
              {importing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              Import CSV
            </Button>
          </div>
        </header>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-9 gap-3">
          <StatCard label="Visual families" value={coverageData?.summary.broadFamilies ?? families.length} />
          <StatCard label="Product groups" value={coverageData?.summary.productGroups ?? stats.total} />
          <StatCard
            label="SKU image jobs"
            value={readinessTotal ?? (skuJobStats.total || coverageData?.summary.productVariants || 0)}
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
          />
          <StatCard
            label="Ready to generate"
            value={readinessReady ?? skuJobStats.readyToGenerate}
            tone="live"
            detail={`Queued ${skuJobStats.queued} · Running ${skuJobStats.generating}`}
          />
          <StatCard
            label="Generated/review"
            value={skuJobStats.generated}
            tone="live"
            detail={`Generated ${skuJobStats.generatedDone} · QA ${skuJobStats.qaPending} · Rejected ${skuJobStats.rejected}`}
          />
          <StatCard
            label="Approved"
            value={skuJobStats.approved}
            tone="ok"
            detail={`Pending push ${skuJobStats.approvedPendingPush} · Pushed ${skuJobStats.shopifyPushed}`}
          />
          <StatCard
            label="Shopify pushed"
            value={skuJobStats.shopifyPushed}
            tone="ok"
            detail={`Awaiting Convex ${skuJobStats.shopifyPushedPendingConvex}`}
          />
          <StatCard
            label="Convex synced"
            value={skuJobStats.convexSynced}
            tone="ok"
            detail={`Finalized ${skuJobStats.convexSynced} · Awaiting ${skuJobStats.shopifyPushedPendingConvex}`}
          />
        </div>

        {coverageData && (
          <Card className="p-4 border-white/[0.06] bg-white/[0.02] text-white">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <div className="text-xs font-mono uppercase tracking-wider text-white/50">
                  Unified coverage source · {coverageData.summary.sourceOfTruthDate}
                </div>
                <div className="text-sm text-white/70 mt-1">
                  Catalog gives visual family guidance; May 14 + Convex provide SKU truth.
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
              </div>
              <div className="flex flex-wrap gap-2">
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
              </div>
            </div>
          </Card>
        )}

        {/* Filters */}
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
        </div>

        {coverageView === "groups" && (
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

        {coverageView === "sku-jobs" && (
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
        {rowsLoading || coverageLoading || readinessLoading || skuJobsLoading ? (
          <FullPageSpinner label="Loading pipeline…" />
        ) : coverageView === "sku-jobs" ? (
          <SkuJobTable
            jobs={filteredSkuJobs}
            rowsBySlug={pipelineRowsBySlug}
            shownCount={filteredSkuJobs.length}
            totalCount={hasPersistedSkuJobs ? skuJobs.length : (coverageData?.products ?? []).length}
            onUpdateStatus={handleUpdateSkuJobStatus}
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

function StatCard({
  label,
  value,
  tone,
  detail,
}: {
  label: string;
  value: number;
  tone?: "ok" | "live" | "warn";
  detail?: string;
}) {
  return (
    <Card
      className={cn(
        "p-3 border-white/[0.06] bg-white/[0.02] text-white",
        tone === "ok" && "border-emerald-500/25",
        tone === "live" && "border-amber-500/25",
        tone === "warn" && "border-rose-500/25",
      )}
    >
      <div className="text-[10px] font-mono uppercase tracking-wider text-white/50">
        {label}
      </div>
      <div className="text-2xl font-semibold mt-1 text-white">{value}</div>
      {detail && (
        <div className="mt-1 text-[10px] leading-snug text-white/45">
          {detail}
        </div>
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
              <th className="px-3 py-2 font-medium text-right">Review</th>
              <th className="px-3 py-2 font-medium">Reason</th>
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
                    {row ? <StatusPill status={row.madison_status} /> : <MissingPipelinePill skuJobCount={skuJobCount} />}
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
                        variant="outline"
                        onClick={() => onPushApprovedSkuJobs(group.productGroupSlug)}
                        disabled={pushableCount === 0 || pushingGroupSlug === group.productGroupSlug}
                        className="border-white/15 bg-white/[0.02] text-white hover:bg-white/[0.06] hover:text-white"
                      >
                        {pushingGroupSlug === group.productGroupSlug ? (
                          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <PackageCheck className="w-3.5 h-3.5 mr-1.5" />
                        )}
                        Push approved
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

  if (skuJobCount > 0 && convexSyncedCount >= skuJobCount) {
    label = "Done";
    palette = "border-emerald-500/35 text-emerald-200";
  } else if (shopifyPushedCount > 0) {
    label = `Pushed ${shopifyPushedCount}`;
    palette = "border-sky-500/35 text-sky-200";
  } else if (approvedCount > 0) {
    label = `Approved ${approvedCount}`;
    palette = "border-emerald-500/30 text-emerald-300";
  } else if (reviewCount > 0) {
    label = `In review ${reviewCount}`;
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
  if (workflow?.convexSynced) {
    return (
      <span className="inline-flex rounded border border-emerald-500/30 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-emerald-300">
        Convex synced {workflow.convexSynced}
      </span>
    );
  }
  if (workflow?.shopifyPushed) {
    return (
      <span className="inline-flex rounded border border-sky-500/30 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-sky-300">
        Shopify pushed {workflow.shopifyPushed}
      </span>
    );
  }
  if (workflow?.approvedPendingPush) {
    return (
      <span className="inline-flex rounded border border-emerald-500/25 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-emerald-300">
        Approved, not pushed {workflow.approvedPendingPush}
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
        Approved
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

  return (
    <Card className="p-4 border-white/[0.06] bg-white/[0.02] text-white space-y-3">
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
