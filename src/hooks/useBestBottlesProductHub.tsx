import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOnboarding } from "@/hooks/useOnboarding";
import { useToast } from "@/hooks/use-toast";
import {
  backfillPipelineConvexImages,
  listPipelineGroups,
  listPipelineSkuJobs,
  markPipelineSkuJobSyncedBySku,
  type PipelineGroup,
  type PipelineSkuCoverageInput,
  type PipelineSkuJob,
  type PipelineSkuJobStatus,
} from "@/lib/bestBottlesPipeline";
import type { ProductHub } from "@/hooks/useProducts";

type BestBottlesProductHubJob = PipelineSkuJob & {
  is_report_only?: boolean;
};

type ProductHubWithHero = ProductHub & {
  hero_image?: { id: string; file_url: string | null; thumbnail_url: string | null } | null;
};

interface BestBottlesCoverageData {
  products: PipelineSkuCoverageInput[];
}

export type BestBottlesMediaStatus =
  | "all"
  | "has-primary"
  | "missing-primary"
  | "has-approved"
  | "missing-approved";

export type BestBottlesSyncStatus =
  | "all"
  | "not-pushed"
  | "shopify-pushed"
  | "convex-synced"
  | "needs-seo"
  | "needs-specs";

export interface BestBottlesProductHubSummary {
  totalGroups: number;
  totalSkus: number;
  liveSkus: number;
  reportOnlySkus: number;
  missingSpecs: number;
  missingSeo: number;
  missingPrimaryMedia: number;
  generated: number;
  approved: number;
  shopifyPushed: number;
  convexSynced: number;
}

export interface BestBottlesProductGroupHub {
  slug: string;
  displayName: string;
  family: string;
  category: string | null;
  capacityMl: number | null;
  threadSize: string | null;
  material: string | null;
  heightWithoutCapMm: number | null;
  diameterMm: number | null;
  canonicalColor: string | null;
  applicators: string[];
  catalogReferencePages: string | null;
  productHub: ProductHubWithHero | null;
  jobs: BestBottlesProductHubJob[];
  pipelineRows: PipelineGroup[];
  counts: Record<PipelineSkuJobStatus, number> & {
    total: number;
    generatedOrReview: number;
    approvedOrLater: number;
    shopifyPushedOrLater: number;
    convexSynced: number;
    ready: number;
    needsReference: number;
  };
  hasSeo: boolean;
  hasSpecs: boolean;
  missingSpecFields: string[];
  hasPrimaryMedia: boolean;
  hasApprovedMedia: boolean;
  hasShopifyMedia: boolean;
  referenceImageUrl: string | null;
  approvedImageUrl: string | null;
  generatedImageUrl: string | null;
  shopifyImageUrl: string | null;
}

export interface UseBestBottlesProductHubResult {
  groups: BestBottlesProductGroupHub[];
  families: string[];
  summary: BestBottlesProductHubSummary;
  isLoading: boolean;
  error: Error | null;
  setPrimaryImageFromGroup: UseMutationResult<void, Error, BestBottlesProductGroupHub>;
  pushApprovedGroupToShopify: UseMutationResult<void, Error, BestBottlesProductGroupHub>;
}

const ZERO_STATUS_COUNTS = {
  "needs-reference": 0,
  "ready-to-generate": 0,
  queued: 0,
  generating: 0,
  generated: 0,
  "qa-pending": 0,
  approved: 0,
  rejected: 0,
  "shopify-pushed": 0,
  synced: 0,
} satisfies Record<PipelineSkuJobStatus, number>;

const COMPONENT_SPEC_FAMILIES = new Set([
  "Cap/Closure",
  "Cap/Component",
  "Decorative",
  "Dropper",
  "Gift Bag",
  "Gift Box",
  "Lotion Pump",
  "Packaging Supply",
  "Roll-On Cap",
  "Sprayer",
  "Tool",
]);
const COMPONENT_SPEC_CATEGORIES = new Set(["Accessory", "Cap/Closure", "Component", "Packaging"]);

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function toNullableText(value: unknown): string | null {
  const normalized = text(value);
  return normalized || null;
}

function toNullableInt(value: unknown): number | null {
  const parsed = Number.parseInt(text(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function bestBottlesMetadata(product: ProductHubWithHero | null): Record<string, unknown> {
  return asRecord(asRecord(product?.metadata).best_bottles);
}

function bottleSpecs(product: ProductHubWithHero | null): Record<string, unknown> {
  return asRecord(asRecord(product?.metadata).bottle_specs);
}

function isComponentSpecRecord(family: string, category: string, displayName: string): boolean {
  if (COMPONENT_SPEC_FAMILIES.has(family)) return true;
  if (COMPONENT_SPEC_CATEGORIES.has(category)) return true;
  return /\b(cap|closure|sprayer|pump|dropper|fitment|component|accessory|bag|box|tool)\b/i.test(displayName);
}

function componentRequiresThread(family: string, category: string, displayName: string): boolean {
  if (!isComponentSpecRecord(family, category, displayName)) return true;
  return /\b(cap|closure|sprayer|pump|dropper|fitment)\b/i.test(`${family} ${category} ${displayName}`);
}

function missingBottleSpecFields(product: ProductHubWithHero | null): string[] {
  if (!product) return ["Product Hub record"];
  const specs = bottleSpecs(product);
  const bb = bestBottlesMetadata(product);
  const specGroup = asRecord(specs.productGroup);
  const specCapacity = asRecord(specs.capacity);
  const specNeck = asRecord(specs.neck);
  const specMaterial = asRecord(specs.material);
  const specColor = asRecord(specs.color);
  const specDimensions = asRecord(specs.dimensions);
  const specCatalog = asRecord(specs.catalog);

  const family = text(bb.family) || text(specGroup.family) || text(product.product_type);
  const category = text(bb.category) || text(specGroup.category) || text(product.category);
  const displayName = text(bb.productGroupDisplayName) || text(specGroup.displayName) || text(product.name);
  const isComponent = Boolean(bb.componentException || specGroup.componentException) || isComponentSpecRecord(family, category, displayName);
  const requiresThread = componentRequiresThread(family, category, displayName);
  const capacity =
    text(bb.capacityMl) ||
    text(specCapacity.ml);
  const thread = text(bb.neckThread) || text(specNeck.finish_code) || text(specNeck.thread_size);
  const material = text(bb.material) || text(specMaterial.primary) || text(specMaterial.body);
  const colorVariants = Array.isArray(specColor.variants) ? specColor.variants.filter(Boolean) : [];
  const color = text(bb.canonicalColor) || text(specColor.canonical) || (colorVariants.length > 0 ? "variants" : "");
  const height = text(specDimensions.height_without_cap) || text(specDimensions.heightWithoutCap);
  const diameter = text(specDimensions.diameter);
  const catalogPages = text(bb.catalogReferencePages) || text(specCatalog.referencePages);

  const missing: string[] = [];
  if (!family) missing.push("family");
  if (!category) missing.push("category");
  if (!isComponent && !capacity) missing.push("capacity");
  if (requiresThread && !thread) missing.push("thread/finish");
  if (!material) missing.push("material");
  if (!isComponent && !color) missing.push("color");
  if (!isComponent && (!height || !diameter)) missing.push("dimensions");
  if (!catalogPages) missing.push("catalog pages");
  return missing;
}

function hasBottleSpecs(product: ProductHubWithHero | null): boolean {
  return missingBottleSpecFields(product).length === 0;
}

function productHasSeo(product: ProductHubWithHero | null): boolean {
  return Boolean(
    text(product?.seo_title) &&
      text(product?.seo_description) &&
      (text(product?.long_description) || text(product?.short_description)),
  );
}

function productPrimaryImageUrl(product: ProductHubWithHero | null): string | null {
  return (
    product?.hero_image?.thumbnail_url ||
    product?.hero_image?.file_url ||
    product?.hero_image_external_url ||
    product?.hero_image_url ||
    null
  );
}

function groupProductHubs(products: ProductHubWithHero[]): Map<string, ProductHubWithHero> {
  const out = new Map<string, ProductHubWithHero>();
  for (const product of products) {
    const bb = bestBottlesMetadata(product);
    const candidates = [
      text(bb.productGroupSlug),
      text(asRecord(product.external_ids).best_bottles_product_group_slug),
      text(product.slug),
    ].filter(Boolean);
    for (const candidate of candidates) {
      if (!out.has(candidate)) out.set(candidate, product);
    }
  }
  return out;
}

function pickFirstUrl(values: Array<string | null | undefined>): string | null {
  return values.map(text).find(Boolean) ?? null;
}

function inferThreadSize(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const normalized = text(value);
    const threadedFinish = normalized.match(/\b\d{1,2}[-/]\d{3}\b/);
    if (threadedFinish) return threadedFinish[0].replace("/", "-");
    if (/\bground\b/i.test(normalized)) return "Ground";
    if (/\bplug\b/i.test(normalized)) return "Plug";
  }
  return null;
}

function buildStatusCounts(jobs: BestBottlesProductHubJob[]): BestBottlesProductGroupHub["counts"] {
  const counts = { ...ZERO_STATUS_COUNTS };
  for (const job of jobs) {
    counts[job.status] += 1;
  }
  return {
    ...counts,
    total: jobs.length,
    generatedOrReview:
      counts.generated +
      counts["qa-pending"] +
      counts.approved +
      counts["shopify-pushed"] +
      counts.synced,
    approvedOrLater: counts.approved + counts["shopify-pushed"] + counts.synced,
    shopifyPushedOrLater: counts["shopify-pushed"] + counts.synced,
    convexSynced: counts.synced,
    ready: counts["ready-to-generate"] + counts.queued + counts.generating,
    needsReference: counts["needs-reference"],
  };
}

function statusFromCoverageProduct(product: PipelineSkuCoverageInput): PipelineSkuJobStatus {
  if ((product.shopifyReadyCount ?? 0) > 0) return "approved";
  if ((product.generatedCandidateCount ?? 0) > 0 || (product.reviewCandidateCount ?? 0) > 0) return "generated";
  if (product.coverageStatus === "missing_local_reference_image") return "needs-reference";
  if (
    product.coverageStatus === "covered_canonical" ||
    product.coverageStatus === "covered_needs_canonical_copy"
  ) {
    return "ready-to-generate";
  }
  return "needs-reference";
}

function coverageProductToReportOnlyJob(
  product: PipelineSkuCoverageInput,
  organizationId: string,
): BestBottlesProductHubJob {
  const stableId =
    product.sourceId ||
    product.productId ||
    product.websiteSku ||
    product.graceSku ||
    product.productGroupSlug;

  return {
    id: `report-only-${stableId}`,
    organization_id: organizationId,
    pipeline_group_id: null,
    product_group_slug: product.productGroupSlug,
    product_group_display_name: product.productGroupDisplayName || null,
    family: product.family,
    catalog_reference_pages: toNullableText(product.catalogReferencePages),
    category: toNullableText(product.category),
    capacity_ml: toNullableInt(product.capacityMl),
    applicator: toNullableText(product.applicator),
    canonical_color: toNullableText(product.canonicalColor),
    product_id: toNullableText(product.productId),
    source_id: toNullableText(product.sourceId),
    grace_sku: product.graceSku,
    website_sku: product.websiteSku,
    shopify_sku: toNullableText(product.shopifySku),
    expected_canonical_filename: toNullableText(product.expectedCanonicalFilename),
    best_reference_candidate_path: toNullableText(product.bestReferenceCandidatePath),
    coverage_status: toNullableText(product.coverageStatus),
    status: statusFromCoverageProduct(product),
    generated_image_id: null,
    generated_image_url: null,
    approved_image_id: null,
    approved_image_url: null,
    approved_at: null,
    approved_by: null,
    shopify_product_id: null,
    shopify_variant_id: null,
    shopify_media_id: null,
    shopify_image_url: null,
    shopify_pushed_at: null,
    convex_synced_at: null,
    last_error: "Report-only coverage row; not persisted in Madison SKU jobs yet.",
    created_at: "",
    updated_at: "",
    is_report_only: true,
  };
}

function mergeReportOnlyJobs(params: {
  organizationId: string;
  jobs: PipelineSkuJob[];
  coverageProducts: PipelineSkuCoverageInput[];
}): BestBottlesProductHubJob[] {
  const { organizationId, jobs, coverageProducts } = params;
  const persistedKeys = new Set<string>();
  for (const job of jobs) {
    if (job.grace_sku) persistedKeys.add(`grace:${job.grace_sku}`);
    if (job.website_sku) persistedKeys.add(`website:${job.website_sku}`);
    if (job.source_id) persistedKeys.add(`source:${job.source_id}`);
    if (job.product_id) persistedKeys.add(`product:${job.product_id}`);
  }

  const reportOnlyJobs = coverageProducts
    .filter((product) => {
      const keys = [
        product.graceSku ? `grace:${product.graceSku}` : "",
        product.websiteSku ? `website:${product.websiteSku}` : "",
        product.sourceId ? `source:${product.sourceId}` : "",
        product.productId ? `product:${product.productId}` : "",
      ].filter(Boolean);
      return keys.length > 0 && !keys.some((key) => persistedKeys.has(key));
    })
    .map((product) => coverageProductToReportOnlyJob(product, organizationId));

  return [...jobs, ...reportOnlyJobs];
}

function groupJobs(params: {
  jobs: BestBottlesProductHubJob[];
  pipelineRows: PipelineGroup[];
  productHubs: ProductHubWithHero[];
}): BestBottlesProductGroupHub[] {
  const { jobs, pipelineRows, productHubs } = params;
  const jobsBySlug = new Map<string, PipelineSkuJob[]>();
  const rowsBySlug = new Map<string, PipelineGroup[]>();
  const hubsBySlug = groupProductHubs(productHubs);

  for (const job of jobs) {
    const slug = text(job.product_group_slug);
    if (!slug) continue;
    jobsBySlug.set(slug, [...(jobsBySlug.get(slug) ?? []), job]);
  }
  for (const row of pipelineRows) {
    const slug = text(row.convex_slug);
    if (!slug) continue;
    rowsBySlug.set(slug, [...(rowsBySlug.get(slug) ?? []), row]);
  }

  const slugs = new Set([...jobsBySlug.keys(), ...rowsBySlug.keys()]);
  return [...slugs]
    .map((slug) => {
      const groupJobsForSlug = jobsBySlug.get(slug) ?? [];
      const rows = rowsBySlug.get(slug) ?? [];
      const hub = hubsBySlug.get(slug) ?? null;
      const firstJob = groupJobsForSlug[0];
      const firstRow = rows[0];
      const bb = bestBottlesMetadata(hub);
      const specs = bottleSpecs(hub);
      const specDimensions = asRecord(specs.dimensions);
      const specMaterial = asRecord(specs.material);
      const displayName =
        text(bb.productGroupDisplayName) ||
        text(firstJob?.product_group_display_name) ||
        text(firstRow?.display_name) ||
        text(hub?.name) ||
        slug;
      const family =
        text(bb.family) ||
        text(firstJob?.family) ||
        text(firstRow?.family) ||
        text(hub?.product_type) ||
        "Unknown";
      const capacityMl =
        Number.parseInt(text(bb.capacityMl || firstJob?.capacity_ml || firstRow?.capacity_ml), 10) || null;
      const threadSize =
        text(bb.neckThread) ||
        text(firstRow?.thread_size) ||
        inferThreadSize(slug, displayName, firstJob?.website_sku, firstJob?.expected_canonical_filename) ||
        null;
      const heightWithoutCapMm =
        toNullableInt(specDimensions.height_without_cap) ||
        toNullableInt(specDimensions.heightWithoutCap);
      const diameterMm = toNullableInt(specDimensions.diameter);
      const catalogReferencePages =
        text(bb.catalogReferencePages) ||
        text(firstJob?.catalog_reference_pages) ||
        null;
      const applicators = [
        ...new Set(
          groupJobsForSlug
            .map((job) => text(job.applicator))
            .filter(Boolean),
        ),
      ];
      const counts = buildStatusCounts(groupJobsForSlug);
      const approvedImageUrl = pickFirstUrl(
        groupJobsForSlug
          .filter((job) => ["approved", "shopify-pushed", "synced"].includes(job.status))
          .map((job) => job.approved_image_url || job.generated_image_url),
      );
      const generatedImageUrl = pickFirstUrl(groupJobsForSlug.map((job) => job.generated_image_url));
      const shopifyImageUrl = pickFirstUrl(groupJobsForSlug.map((job) => job.shopify_image_url));
      const referenceImageUrl = pickFirstUrl([
        ...rows.map((row) => row.legacy_hero_image_url),
        ...groupJobsForSlug.map((job) => job.best_reference_candidate_path),
      ]);
      const hasPrimaryMedia = Boolean(productPrimaryImageUrl(hub));
      const hasApprovedMedia = Boolean(approvedImageUrl);
      const hasShopifyMedia = Boolean(shopifyImageUrl || counts.shopifyPushedOrLater > 0);
      const missingSpecFields = missingBottleSpecFields(hub);

      return {
        slug,
        displayName,
        family,
        category: text(bb.category) || text(firstJob?.category) || text(firstRow?.category) || hub?.category || null,
        capacityMl,
        threadSize,
        material: text(bb.material) || text(specMaterial.primary) || text(specMaterial.body) || null,
        heightWithoutCapMm,
        diameterMm,
        canonicalColor: text(bb.canonicalColor) || text(firstJob?.canonical_color) || text(firstRow?.glass_color) || null,
        applicators,
        catalogReferencePages,
        productHub: hub,
        jobs: groupJobsForSlug,
        pipelineRows: rows,
        counts,
        hasSeo: productHasSeo(hub),
        hasSpecs: hasBottleSpecs(hub),
        missingSpecFields,
        hasPrimaryMedia,
        hasApprovedMedia,
        hasShopifyMedia,
        referenceImageUrl,
        approvedImageUrl,
        generatedImageUrl,
        shopifyImageUrl,
      };
    })
    .sort((a, b) => a.family.localeCompare(b.family) || a.displayName.localeCompare(b.displayName));
}

function buildBestBottlesMetadata(group: BestBottlesProductGroupHub): Record<string, unknown> {
  const firstJob = group.jobs[0];
  const firstRow = group.pipelineRows[0];
  return {
    family: group.family,
    productGroupSlug: group.slug,
    productGroupDisplayName: group.displayName,
    graceSku: firstJob?.grace_sku ?? firstRow?.primary_grace_sku ?? null,
    websiteSku: firstJob?.website_sku ?? firstRow?.primary_website_sku ?? null,
    shopifySku: firstJob?.shopify_sku ?? null,
    capacityMl: group.capacityMl,
    neckThread: group.threadSize,
    applicator: group.applicators.join(", ") || null,
    canonicalColor: group.canonicalColor,
    material: group.material,
    convexProductId: firstJob?.product_id ?? null,
    convexSourceId: firstJob?.source_id ?? firstRow?.convex_id ?? null,
    catalogReferencePages: group.catalogReferencePages,
    specsComplete: group.hasSpecs,
    missingSpecFields: group.missingSpecFields,
    shopifyProductId: firstJob?.shopify_product_id ?? null,
    shopifyVariantId: firstJob?.shopify_variant_id ?? null,
    shopifyMediaId: firstJob?.shopify_media_id ?? null,
    pipelineStatusSummary: {
      total: group.counts.total,
      generated: group.counts.generatedOrReview,
      approved: group.counts.approvedOrLater,
      shopifyPushed: group.counts.shopifyPushedOrLater,
      convexSynced: group.counts.convexSynced,
      needsReference: group.counts.needsReference,
    },
  };
}

export function useBestBottlesProductHub(): UseBestBottlesProductHubResult {
  const { currentOrganizationId } = useOnboarding();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ["best-bottles-product-hub", currentOrganizationId],
    queryFn: async () => {
      if (!currentOrganizationId) {
        return { jobs: [], persistedJobCount: 0, pipelineRows: [], productHubs: [] };
      }

      const [jobs, pipelineRows, coverageData, productHubsResult] = await Promise.all([
        listPipelineSkuJobs(currentOrganizationId),
        listPipelineGroups(currentOrganizationId),
        fetch("/data/best-bottles-madison-pipeline-ui.json")
          .then((response) => {
            if (!response.ok) throw new Error(`Unable to load Best Bottles coverage data (${response.status})`);
            return response.json() as Promise<BestBottlesCoverageData>;
          })
          .catch(() => ({ products: [] })),
        supabase
          .from("product_hubs")
          .select(`
            *,
            hero_image:dam_assets!product_hubs_hero_image_id_fkey(id, file_url, thumbnail_url),
            hero_image_external_url
          `)
          .eq("organization_id", currentOrganizationId),
      ]);

      if (productHubsResult.error) throw productHubsResult.error;
      const mergedJobs = mergeReportOnlyJobs({
        organizationId: currentOrganizationId,
        jobs,
        coverageProducts: coverageData.products ?? [],
      });
      return {
        jobs: mergedJobs,
        persistedJobCount: jobs.length,
        pipelineRows,
        productHubs: ((productHubsResult.data ?? []) as ProductHubWithHero[]).map((product) => ({
          ...product,
          hero_image_url: productPrimaryImageUrl(product),
        })),
      };
    },
    enabled: !!currentOrganizationId,
    staleTime: 30_000,
  });

  const groups = useMemo(
    () =>
      groupJobs({
        jobs: query.data?.jobs ?? [],
        pipelineRows: query.data?.pipelineRows ?? [],
        productHubs: query.data?.productHubs ?? [],
      }),
    [query.data?.jobs, query.data?.pipelineRows, query.data?.productHubs],
  );

  const families = useMemo(
    () => [...new Set(groups.map((group) => group.family))].sort((a, b) => a.localeCompare(b)),
    [groups],
  );

  const summary = useMemo<BestBottlesProductHubSummary>(() => {
    const jobs = query.data?.jobs ?? [];
    const reportOnlySkus = jobs.filter((job) => job.is_report_only).length;
    return {
      totalGroups: groups.length,
      totalSkus: jobs.length,
      liveSkus: query.data?.persistedJobCount ?? jobs.length - reportOnlySkus,
      reportOnlySkus,
      missingSpecs: groups.filter((group) => !group.hasSpecs).length,
      missingSeo: groups.filter((group) => !group.hasSeo).length,
      missingPrimaryMedia: groups.filter((group) => !group.hasPrimaryMedia).length,
      generated: jobs.filter((job) =>
        ["generated", "qa-pending", "approved", "shopify-pushed", "synced"].includes(job.status),
      ).length,
      approved: jobs.filter((job) => ["approved", "shopify-pushed", "synced"].includes(job.status)).length,
      shopifyPushed: jobs.filter((job) => Boolean(job.shopify_pushed_at || job.shopify_image_url || job.shopify_media_id || job.status === "shopify-pushed" || job.status === "synced")).length,
      convexSynced: jobs.filter((job) => Boolean(job.convex_synced_at || job.status === "synced")).length,
    };
  }, [groups, query.data?.jobs, query.data?.persistedJobCount]);

  const setPrimaryImageFromGroup = useMutation<void, Error, BestBottlesProductGroupHub>({
    mutationFn: async (group) => {
      if (!currentOrganizationId) throw new Error("No organization selected");
      const imageUrl = group.approvedImageUrl || group.generatedImageUrl || group.shopifyImageUrl;
      if (!imageUrl) throw new Error("No approved or generated image is available for this group.");

      const existingMetadata = asRecord(group.productHub?.metadata);
      const nextMetadata = {
        ...existingMetadata,
        best_bottles: {
          ...bestBottlesMetadata(group.productHub),
          ...buildBestBottlesMetadata(group),
          primaryImageSource: group.approvedImageUrl ? "approved_pipeline_image" : "generated_pipeline_image",
          primaryImageUrl: imageUrl,
        },
      };

      if (group.productHub?.id) {
        const { error } = await supabase
          .from("product_hubs")
          .update({
            hero_image_id: null,
            hero_image_external_url: imageUrl,
            metadata: nextMetadata,
          } as any)
          .eq("id", group.productHub.id);
        if (error) throw error;
        return;
      }

      const { error } = await supabase.from("product_hubs").insert({
        organization_id: currentOrganizationId,
        name: group.displayName,
        slug: group.slug,
        sku: group.jobs[0]?.grace_sku ?? group.pipelineRows[0]?.primary_grace_sku ?? null,
        category: group.category ?? "Packaging",
        product_type: group.family,
        status: "active",
        visibility: "internal",
        development_stage: "launched",
        hero_image_external_url: imageUrl,
        short_description: group.productHub?.short_description ?? null,
        seo_title: group.productHub?.seo_title ?? null,
        seo_description: group.productHub?.seo_description ?? null,
        tags: ["best-bottles", group.family, group.slug].filter(Boolean),
        metadata: nextMetadata,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["best-bottles-product-hub"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast({
        title: "Product Hub primary image updated",
        description: "The selected Best Bottles image is now the Product Hub hero.",
      });
    },
    onError: (error) => {
      toast({
        title: "Could not update Product Hub image",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const pushApprovedGroupToShopify = useMutation<void, Error, BestBottlesProductGroupHub>({
    mutationFn: async (group) => {
      if (!currentOrganizationId) throw new Error("No organization selected");
      const approvedJobs = group.jobs.filter(
        (job) => job.status === "approved" && Boolean(job.approved_image_url),
      );
      if (approvedJobs.length === 0) {
        throw new Error("No approved SKU jobs with image URLs are ready to push.");
      }

      const { data, error } = await supabase.functions.invoke("push-shopify-product-images", {
        body: {
          organizationId: currentOrganizationId,
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
              organizationId: currentOrganizationId,
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

      const backfill = await backfillPipelineConvexImages({
        organizationId: currentOrganizationId,
        productGroupSlug: group.slug,
        skus: approvedJobs.flatMap((job) =>
          [job.grace_sku, job.website_sku, job.shopify_sku].filter((sku): sku is string => Boolean(sku)),
        ),
      });

      if (failedCount > 0) {
        const firstFailure = results.find((result: { status?: string; message?: string }) => result.status === "failed");
        throw new Error(
          [
            firstFailure?.message ?? `${failedCount} SKU push${failedCount === 1 ? "" : "es"} failed.`,
            `Auto-reconciled ${backfill.syncedCount ?? 0} pushed SKU job${backfill.syncedCount === 1 ? "" : "s"}.`,
          ].join(" "),
        );
      }
    },
    onSuccess: (_data, group) => {
      queryClient.invalidateQueries({ queryKey: ["best-bottles-product-hub"] });
      queryClient.invalidateQueries({ queryKey: ["best-bottles-pipeline-sku-jobs"] });
      toast({
        title: "Approved images pushed",
        description: `${group.displayName} was pushed to Shopify and synced back to the queue.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Shopify push failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    groups,
    families,
    summary,
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error : null,
    setPrimaryImageFromGroup,
    pushApprovedGroupToShopify,
  };
}
