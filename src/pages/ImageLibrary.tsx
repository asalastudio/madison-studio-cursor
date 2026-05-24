import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOnboarding } from "@/hooks/useOnboarding";
import { useGridPipelineFeatureFlag } from "@/hooks/useGridPipelineFeatureFlag";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Grid3X3,
  LayoutGrid,
  X,
  Download,
  Trash2,
  Eye,
  MoreVertical,
  Camera,
  Package,
  ShoppingBag,
  Tags,
  Loader2,
  Upload,
  ChevronsUpDown,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { MagicWand02 } from "@untitledui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ImageEditorModal, type ImageEditorImage } from "@/components/image-editor/ImageEditorModal";
import { ProductSelector } from "@/components/forge/ProductSelector";
import { useProducts, type Product } from "@/hooks/useProducts";
import {
  getBestBottlesCatalogProducts,
  getBestBottlesCatalogGroups,
  getProductsByFamily,
  type ProductGroup as BestBottlesProductGroup,
  type Product as BestBottlesProduct,
} from "@/integrations/convex/bestBottles";
import {
  BEST_BOTTLES_VISUAL_IDENTITY_OPTIONS,
  canonicalBestBottlesVisualIdentity,
  detectBestBottlesVisualIdentityFromText,
  resolveBestBottlesVisualIdentity,
  validateBestBottlesImageIdentity,
} from "@/lib/bestBottlesVisualIdentity";
import {
  addLibraryTag,
  removeLibraryTag,
  BACKGROUND_SCENE_TAG,
  LIBRARY_ROLE_PRODUCT,
  LIBRARY_ROLE_BACKGROUND_SCENE,
  LIBRARY_ROLE_STYLE_REFERENCE,
} from "@/lib/imageLibraryTags";
import {
  backfillPipelineConvexImages,
  listPipelineSkuJobs,
  markPipelineSkuJobSyncedBySku,
  type PipelineSkuJob,
} from "@/lib/bestBottlesPipeline";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import "@/styles/darkroom.css";

interface GeneratedImage {
  id: string;
  image_url: string;
  session_id: string | null;
  session_name: string | null;
  goal_type: string | null;
  aspect_ratio: string | null;
  final_prompt: string | null;
  library_category: string | null;
  library_tags?: string[] | null;
  parent_image_id?: string | null;
  is_hero_image: boolean;
  created_at: string;
  is_archived: boolean;
}

type AssetTypeFilter =
  | "all"
  | "product"
  | "product-photography"
  | "lifestyle"
  | "background"
  | "style"
  | "roll-ons"
  | "empty-plates";
type SkuSizeFilter = "all" | string;
type SortOption = "recent" | "oldest" | "category";
type PublishDestination = "tarife-sanity" | "best-bottles-grid" | "best-bottles-pdp";
type BestBottlesPdpMode = "cap-on" | "cap-off";
type BulkBestBottlesRow = {
  imageId: string;
  imageUrl: string;
  label: string;
  websiteSku: string;
};
type ManualVisualIdentityApproval = {
  visualFinish: string;
  capHeight: string;
  confirmed: boolean;
  notes: string;
  reviewedAt?: string;
  reviewedBy?: string | null;
  reason?: string;
};
type BulkShopifyRow = {
  imageId: string;
  imageUrl: string;
  label: string;
  sku: string;
  websiteSku: string;
  graceSku: string;
  expectedCapColor: string;
  manualVisualIdentityApproval: ManualVisualIdentityApproval;
};
type BestBottlesFamilyOption = {
  family: string;
  label: string;
  count: number;
};

const PRIMARY_PDP_MODE: BestBottlesPdpMode = "cap-on";
const IMAGE_LIBRARY_INITIAL_ROWS = 10000;
const IMAGE_LIBRARY_PAGE_SIZE = 300;
const IMAGE_LIBRARY_MAX_ROWS = 10000;
const IMAGE_LIBRARY_SELECT =
  "id, image_url, session_id, session_name, goal_type, aspect_ratio, final_prompt, library_category, library_tags, parent_image_id, is_hero_image, created_at, is_archived";
const BEST_BOTTLES_GRACE_SKU_PATTERN = /\b(?:GB|LB|PB|AB|BB)-[A-Z0-9][A-Z0-9-]*\b/i;
const BEST_BOTTLES_WEBSITE_SKU_PATTERN = /\b(?:GB|LB|PB|AB|BB|Alu)(?!-)[A-Za-z0-9]+\b/;
const MANUAL_CAP_HEIGHT_OPTIONS = ["Tall", "Short", "Standard", "None / Not applicable"];
const REVIEWABLE_VISUAL_IDENTITY_WARNINGS = new Set([
  "Visual identity is ambiguous; needs review.",
  "Resolver confidence is low; manual review required.",
  "Antique bulb sprayer resolved to Clear, which is likely glass color rather than bulb color.",
]);
const BEST_BOTTLES_FAMILY_PRIORITY = [
  "aluminum-bottle",
  "apothecary",
  "atomizer",
  "cylinder",
  "empire",
  "diva",
  "boston-round",
  "dropper",
  "lotion-bottle",
  "plastic-bottle",
  "square",
  "royal",
  "grace",
  "vial",
];
type ImageTagChainRow = Pick<GeneratedImage, "id" | "library_tags" | "parent_image_id">;

function isReviewableVisualIdentityWarning(warning: string): boolean {
  return REVIEWABLE_VISUAL_IDENTITY_WARNINGS.has(warning);
}

function createManualVisualIdentityApproval(
  visualFinish = "",
  capHeight = "",
): ManualVisualIdentityApproval {
  return {
    visualFinish,
    capHeight,
    confirmed: false,
    notes: "",
  };
}

function isManualVisualIdentityApproved(approval: ManualVisualIdentityApproval | undefined): boolean {
  return Boolean(
    approval?.confirmed &&
      approval.visualFinish.trim() &&
      approval.capHeight.trim(),
  );
}

function inferExpectedVisualIdentityFromBestBottlesSku(
  row: Pick<BulkShopifyRow, "sku" | "websiteSku" | "graceSku">,
): string {
  const text = [row.sku, row.websiteSku, row.graceSku].filter(Boolean).join(" ");
  const tokenRules: Array<[RegExp, string]> = [
    [/(?:^|[-_])SGLD(?:$|[-_])|SHNGL|SHGL/i, "Shiny Gold"],
    [/(?:^|[-_])MGLD(?:$|[-_])|MTGL|MTGD/i, "Matte Gold"],
    [/(?:^|[-_])SSLV(?:$|[-_])|SHNSL|SHSL/i, "Shiny Silver"],
    [/(?:^|[-_])MSLV(?:$|[-_])|MTSL/i, "Matte Silver"],
    [/(?:^|[-_])SBLK(?:$|[-_])|SHNBLK|SHBK/i, "Shiny Black"],
    [/(?:^|[-_])CPR(?:$|[-_])|CU\b|MTCP/i, "Copper"],
    [/(?:^|[-_])WHT(?:$|[-_])|WHITE/i, "White"],
    [/(?:^|[-_])BLK(?:$|[-_])|BLACK/i, "Black"],
    [/(?:^|[-_])GLD(?:$|[-_])|GB[A-Za-z0-9]+Gl(?:$|[A-Z])/i, "Shiny Gold"],
    [/(?:^|[-_])SLV(?:$|[-_])|GB[A-Za-z0-9]+Sl(?:$|[A-Z])/i, "Shiny Silver"],
  ];
  return tokenRules.find(([pattern]) => pattern.test(text))?.[1] ?? "";
}

function manualVisualIdentityMatchesSku(row: BulkShopifyRow): boolean {
  const expected = inferExpectedVisualIdentityFromBestBottlesSku(row);
  if (!expected) return true;
  return (
    canonicalBestBottlesVisualIdentity(row.manualVisualIdentityApproval.visualFinish) ===
    canonicalBestBottlesVisualIdentity(expected)
  );
}

function inferManualCapHeight(
  row: Pick<BulkShopifyRow, "sku" | "websiteSku" | "graceSku">,
  product: BestBottlesProduct | null | undefined,
): string {
  const text = [
    row.sku,
    row.websiteSku,
    row.graceSku,
    product?.capStyle,
    product?.itemName,
    product?.applicator,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/\btall\b|(?:^|-)t(?:-|$|\s)/i.test(text)) return "Tall";
  if (/\bshort\b|(?:^|-)sht(?:-|$|\s)|(?:^|-)s(?:-|$|\s)/i.test(text)) return "Short";
  if (/\bno cap\b|\bcapless\b|\bnone\b/.test(text)) return "None / Not applicable";
  return "Standard";
}

function normalizeBestBottlesSlug(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function looksLikeBestBottlesProductGroupSlug(value: string): boolean {
  const normalized = normalizeBestBottlesSlug(value);
  if (!normalized || /^(?:gb|lb|pb|ab|bb)-/.test(normalized)) return false;
  return normalized.includes("-");
}

function bestBottlesFamilyLabel(value: string): string {
  return normalizeBestBottlesSlug(value)
    .split("-")
    .filter(Boolean)
    .map((part) => {
      if (part === "ml") return "mL";
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function splitWebsiteSkus(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[,\n]+/)
        .map((sku) => sku.trim())
        .filter(Boolean),
    ),
  );
}

function BestBottlesFamilyRail({
  options,
  activeFamily,
  totalCount,
  filteredCount,
  isLoading,
  onSelect,
}: {
  options: BestBottlesFamilyOption[];
  activeFamily: string;
  totalCount: number;
  filteredCount: number;
  isLoading: boolean;
  onSelect: (family: string) => void;
}) {
  const activeCount =
    activeFamily === "all"
      ? totalCount
      : options.find((option) => option.family === activeFamily)?.count ?? filteredCount;

  return (
    <aside className="h-fit rounded-lg border border-[var(--darkroom-border)] bg-[var(--darkroom-surface)]/95 p-3 shadow-sm lg:sticky lg:top-36">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[rgba(232,230,227,0.68)]">
            Best Bottles
          </p>
          <h2 className="text-sm font-medium text-[var(--darkroom-text)]">Families</h2>
        </div>
        <Badge
          variant="outline"
          className="border-[var(--darkroom-accent)]/45 text-[var(--darkroom-accent)]"
        >
          {activeCount}
        </Badge>
      </div>

      <div className="space-y-1">
        <button
          type="button"
          aria-pressed={activeFamily === "all"}
          onClick={() => onSelect("all")}
          className={cn(
            "flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm font-medium transition-colors",
            activeFamily === "all"
              ? "border-[var(--darkroom-accent)] bg-[var(--darkroom-accent)]/12 text-[var(--darkroom-text)]"
              : "border-transparent text-[rgba(232,230,227,0.9)] hover:border-[var(--darkroom-border)] hover:bg-[var(--darkroom-bg)]/45 hover:text-[var(--darkroom-text)]",
          )}
        >
          <span>All families</span>
          <span className="text-xs tabular-nums text-[rgba(232,230,227,0.72)]">{totalCount}</span>
        </button>

        {options.length === 0 ? (
          <div className="rounded-md border border-dashed border-[var(--darkroom-border)] px-3 py-4 text-xs text-[var(--darkroom-text)]/50">
            {isLoading ? "Loading family index..." : "No family tags found for this view."}
          </div>
        ) : (
          options.map((option) => {
            const isActive = option.family === activeFamily;
            return (
              <button
                key={option.family}
                type="button"
                aria-pressed={isActive}
                onClick={() => onSelect(option.family)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm font-medium transition-colors",
                  isActive
                    ? "border-[var(--darkroom-accent)] bg-[var(--darkroom-accent)]/12 text-[var(--darkroom-text)]"
                    : "border-transparent text-[rgba(232,230,227,0.9)] hover:border-[var(--darkroom-border)] hover:bg-[var(--darkroom-bg)]/45 hover:text-[var(--darkroom-text)]",
                )}
              >
                <span className="min-w-0 truncate">{option.label}</span>
                <span className="text-xs tabular-nums text-[rgba(232,230,227,0.72)]">{option.count}</span>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}

function isEmpireVintageBulbSprayerProduct(product: BestBottlesProduct | undefined): boolean {
  if (!product) return false;
  const isEmpire =
    product.family === "Empire" ||
    /^(?:GB|LB)Emp/i.test(product.websiteSku) ||
    /Empire/i.test(product.itemName);
  const applicatorText = `${product.applicator ?? ""} ${product.itemName}`.toLowerCase();
  return isEmpire && /(vintage|antique).*(bulb|spray)/.test(applicatorText);
}

function isEmpireVintageBulbSprayerSku(
  websiteSku: string,
  productsByWebsiteSku: Map<string, BestBottlesProduct>,
): boolean {
  const normalizedSku = websiteSku.trim();
  if (!normalizedSku) return false;
  const product = productsByWebsiteSku.get(normalizedSku.toUpperCase());
  if (product) return isEmpireVintageBulbSprayerProduct(product);
  return /^(?:GB|LB)Emp\d+AnSp/i.test(normalizedSku);
}

function detectWebsiteSku(image: GeneratedImage): string {
  const tags = image.library_tags ?? [];
  for (const tag of tags) {
    const explicit = tag.match(/^(?:websiteSku|website-sku):(.+)$/i);
    if (explicit?.[1]?.trim()) return explicit[1].trim();
  }

  for (const tag of tags) {
    const raw = tag.replace(/^sku:/i, "").trim();
    const match = raw.match(BEST_BOTTLES_WEBSITE_SKU_PATTERN);
    if (match) return match[0];
  }

  const searchable = [image.session_name, image.final_prompt, image.library_category, image.image_url, ...tags]
    .filter(Boolean)
    .join(" ");
  return searchable.match(BEST_BOTTLES_WEBSITE_SKU_PATTERN)?.[0] ?? "";
}

function detectShopifySku(image: GeneratedImage): string {
  const tags = image.library_tags ?? [];
  for (const tag of tags) {
    const explicit = tag.match(/^(?:shopifySku|shopify-sku):(.+)$/i);
    if (explicit?.[1]?.trim()) return explicit[1].trim();
  }
  return "";
}

function detectGraceSku(image: GeneratedImage): string {
  const tags = image.library_tags ?? [];
  for (const tag of tags) {
    const raw = tag.replace(/^sku:/i, "").trim();
    const match = raw.match(BEST_BOTTLES_GRACE_SKU_PATTERN);
    if (match) return match[0].toUpperCase();
  }

  const searchable = [image.session_name, image.final_prompt, image.library_category, image.image_url, ...tags]
    .filter(Boolean)
    .join(" ");
  return searchable.match(BEST_BOTTLES_GRACE_SKU_PATTERN)?.[0].toUpperCase() ?? "";
}

function detectBestBottlesFamilyTag(image: GeneratedImage): string {
  for (const tag of image.library_tags ?? []) {
    const explicit = tag.match(/^(?:family|bottleFamily|bottle-family):(.+)$/i);
    if (explicit?.[1]?.trim()) return normalizeBestBottlesSlug(explicit[1]);
  }
  return "";
}

function detectProductGroupSlug(image: GeneratedImage): string {
  const tags = image.library_tags ?? [];
  for (const tag of tags) {
    const explicit = tag.match(/^(?:groupSlug|group-slug|productGroupSlug|product-group-slug|slug):(.+)$/i);
    if (explicit?.[1]?.trim()) return normalizeBestBottlesSlug(explicit[1]);
  }

  const searchable = [image.session_name, image.final_prompt, image.library_category, ...tags]
    .filter(Boolean)
    .join(" ");
  const match = searchable.match(/\b[a-z0-9][a-z0-9-]*\d+ml[a-z0-9-]*\b/i);
  const normalized = match ? normalizeBestBottlesSlug(match[0]) : "";
  return /^(?:gb|lb)-/.test(normalized) ? "" : normalized;
}

function mergeLibraryTags(...tagSets: Array<string[] | null | undefined>): string[] {
  const merged = new Set<string>();
  for (const tags of tagSets) {
    for (const tag of tags ?? []) {
      const normalized = tag.trim();
      if (normalized) merged.add(normalized);
    }
  }
  return [...merged];
}

const IDENTIFIER_TAG_PATTERN = /^(?:sku|shopifySku|shopify-sku|websiteSku|website-sku|graceSku|grace-sku|groupSlug|group-slug|productGroupSlug|product-group-slug|slug):/i;
const IMAGE_TAG_HYDRATION_BATCH_SIZE = 150;

function chunkArray<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

async function hydrateImagesWithAncestorTags(images: GeneratedImage[]): Promise<GeneratedImage[]> {
  const tagById = new Map<string, string[]>();
  const parentById = new Map<string, string | null>();

  for (const image of images) {
    tagById.set(image.id, image.library_tags ?? []);
    parentById.set(image.id, image.parent_image_id ?? null);
  }

  let parentIds = new Set(
    images
      .map((image) => image.parent_image_id)
      .filter((id): id is string => Boolean(id) && !tagById.has(id)),
  );

  for (let depth = 0; parentIds.size > 0 && depth < 6; depth += 1) {
    const parentRows: ImageTagChainRow[] = [];

    for (const batch of chunkArray([...parentIds], IMAGE_TAG_HYDRATION_BATCH_SIZE)) {
      const { data, error } = await supabase
        .from("generated_images")
        .select("id, library_tags, parent_image_id")
        .in("id", batch);

      if (error) {
        console.warn("[ImageLibrary] ancestor tag hydration skipped a batch", error);
        continue;
      }

      parentRows.push(...((data ?? []) as ImageTagChainRow[]));
    }

    if (parentRows.length === 0) break;

    parentIds = new Set<string>();
    for (const row of parentRows) {
      tagById.set(row.id, row.library_tags ?? []);
      parentById.set(row.id, row.parent_image_id ?? null);
      if (row.parent_image_id && !tagById.has(row.parent_image_id)) {
        parentIds.add(row.parent_image_id);
      }
    }
  }

  const collectAncestorTags = (imageId: string, seen = new Set<string>()): string[] => {
    const parentId = parentById.get(imageId);
    if (!parentId || seen.has(parentId)) return [];
    seen.add(parentId);
    const ancestorTags = mergeLibraryTags(tagById.get(parentId), collectAncestorTags(parentId, seen));
    return ancestorTags.filter((tag) => !IDENTIFIER_TAG_PATTERN.test(tag));
  };

  return images.map((image) => {
    const inheritedTags = collectAncestorTags(image.id);
    if (inheritedTags.length === 0) return image;
    const mergedTags = mergeLibraryTags(image.library_tags, inheritedTags);
    if (mergedTags.length === (image.library_tags ?? []).length) return image;
    return { ...image, library_tags: mergedTags };
  });
}

async function extractFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (!error) return fallback;
  try {
    const context = (error as { context?: { json?: () => Promise<unknown>; text?: () => Promise<string> } })
      .context;
    if (context && typeof context.json === "function") {
      const body = await context.json();
      if (body && typeof body === "object" && "error" in body) {
        const message = (body as { error?: unknown }).error;
        if (typeof message === "string" && message.trim()) return message;
      }
    }
    if (context && typeof context.text === "function") {
      const text = await context.text();
      if (text.trim()) return text;
    }
  } catch {
    // Fall back to the top-level error below.
  }

  return error instanceof Error ? error.message : fallback;
}

type ShopifyPushResult = {
  status?: string;
  sku?: string;
  shopifyProductId?: string | null;
  shopifyVariantId?: string | null;
  mediaId?: string | null;
  shopifyImageUrl?: string | null;
  bestBottlesConvex?: unknown;
};

async function markBestBottlesSkuJobsFromShopifyResults(
  organizationId: string | null | undefined,
  results: unknown,
): Promise<void> {
  if (!organizationId || !Array.isArray(results)) return;
  const successful = results.filter(
    (result): result is ShopifyPushResult =>
      Boolean(result) &&
      typeof result === "object" &&
      (result as ShopifyPushResult).status === "success" &&
      typeof (result as ShopifyPushResult).sku === "string",
  );

  await Promise.all(
    successful.map((result) =>
      markPipelineSkuJobSyncedBySku({
        organizationId,
        patch: {
          sku: result.sku ?? "",
          shopifyProductId: result.shopifyProductId ?? null,
          shopifyVariantId: result.shopifyVariantId ?? null,
          shopifyMediaId: result.mediaId ?? null,
          shopifyImageUrl: result.shopifyImageUrl ?? null,
          convexSynced: Boolean(result.bestBottlesConvex),
        },
      }),
    ),
  );
}

async function reconcileBestBottlesPublish(params: {
  organizationId: string | null | undefined;
  productGroupSlug?: string | null;
  skus?: string[];
}): Promise<void> {
  if (!params.organizationId) return;
  await backfillPipelineConvexImages({
    organizationId: params.organizationId,
    productGroupSlug: params.productGroupSlug,
    skus: params.skus,
    limit: 250,
  });
}

/** Pilot filter: Consistency / pipeline images tagged with roller-ball applicators. */
function matchesRollOnLibraryScope(image: GeneratedImage): boolean {
  const tags = image.library_tags ?? [];
  return tags.some(
    (t) =>
      t === "applicator:roller-ball" ||
      t === "applicator:roller-ball-plastic" ||
      t.includes("roller-ball"),
  );
}

function matchesStyleReferenceAsset(image: GeneratedImage): boolean {
  const tags = image.library_tags ?? [];
  return tags.includes(LIBRARY_ROLE_STYLE_REFERENCE) || image.goal_type === "style_reference";
}

function matchesBackgroundAsset(image: GeneratedImage): boolean {
  const tags = image.library_tags ?? [];
  return (
    tags.includes(LIBRARY_ROLE_BACKGROUND_SCENE) ||
    tags.includes(BACKGROUND_SCENE_TAG) ||
    image.goal_type === "background_scene"
  );
}

function matchesProductAsset(image: GeneratedImage): boolean {
  if (matchesStyleReferenceAsset(image)) return false;
  if (matchesBackgroundAsset(image)) return false;
  const tags = image.library_tags ?? [];
  if (tags.includes(LIBRARY_ROLE_PRODUCT)) return true;
  const g = image.goal_type;
  if (!g) return true;
  if (g === "background_scene" || g === "style_reference") return false;
  return true;
}

function imageMetadataText(image: GeneratedImage): string {
  return [
    image.session_name,
    image.final_prompt,
    image.library_category,
    image.goal_type,
    ...(image.library_tags ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function matchesProductPhotographyAsset(image: GeneratedImage): boolean {
  const text = imageMetadataText(image);
  return (
    matchesProductAsset(image) &&
    /\b(?:product photography|product-photo|product_photo|packshot|pack shot|pdp|ecommerce|e-commerce|catalog)\b/.test(text)
  );
}

function matchesLifestyleAsset(image: GeneratedImage): boolean {
  const text = imageMetadataText(image);
  return /\b(?:lifestyle|editorial|social|ugc|campaign|scene|in use|in-use|environment)\b/.test(text);
}

function detectCapacityMlFromText(value: string | null | undefined): number | null {
  const match = value?.match(/\b(\d{1,4})\s*ml\b/i);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Dark Room “empty plate” generations — explicit kind tag on the row. */
function matchesEmptyPlateScope(image: GeneratedImage): boolean {
  const tags = image.library_tags ?? [];
  return tags.includes(BACKGROUND_SCENE_TAG);
}

async function fetchGeneratedImagesForScope(
  column: "organization_id" | "user_id",
  value: string,
  maxRows = IMAGE_LIBRARY_INITIAL_ROWS,
): Promise<GeneratedImage[]> {
  const rows: GeneratedImage[] = [];
  const rowLimit = Math.max(IMAGE_LIBRARY_PAGE_SIZE, Math.min(maxRows, IMAGE_LIBRARY_MAX_ROWS));
  for (let from = 0; from < rowLimit; from += IMAGE_LIBRARY_PAGE_SIZE) {
    const to = Math.min(from + IMAGE_LIBRARY_PAGE_SIZE - 1, rowLimit - 1);
    const { data, error } = await supabase
      .from("generated_images")
      .select(IMAGE_LIBRARY_SELECT)
      .eq(column, value)
      .eq("is_archived", false)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw error;
    const page = (data ?? []) as GeneratedImage[];
    rows.push(...page);
    if (page.length < IMAGE_LIBRARY_PAGE_SIZE) break;
  }
  return rows;
}

export default function ImageLibrary() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const bestBottlesGroupParam = searchParams.get("bestBottlesGroup") ?? "";
  const bestBottlesSkuParam = searchParams.get("bestBottlesSku") ?? "";
  const initialSearchQuery = bestBottlesGroupParam || bestBottlesSkuParam;
  const { user } = useAuth();
  const { currentOrganizationId } = useOnboarding();
  const { enabled: isBestBottlesOrg } = useGridPipelineFeatureFlag();
  const publishLabel = isBestBottlesOrg ? "Publish to Best Bottles" : "Publish to website";
  const { toast } = useToast();

  // State
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [assetTypeFilter, setAssetTypeFilter] = useState<AssetTypeFilter>("all");
  const [bestBottlesFamilyFilter, setBestBottlesFamilyFilter] = useState<string>("all");
  const [skuSizeFilter, setSkuSizeFilter] = useState<SkuSizeFilter>("all");
  const [imageLibraryRowLimit, setImageLibraryRowLimit] = useState(IMAGE_LIBRARY_INITIAL_ROWS);
  const [viewMode, setViewMode] = useState<"grid" | "masonry">("grid");
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());

  const { updateProduct } = useProducts();

  // Set Product Hub hero (thumbnail) from library image
  const [heroAssignOpen, setHeroAssignOpen] = useState(false);
  const [heroAssignImage, setHeroAssignImage] = useState<GeneratedImage | null>(null);
  const [heroAssignProduct, setHeroAssignProduct] = useState<Product | null>(null);

  // Edit durable library_tags (e.g. sku:… for Product Hub matching)
  const [tagsEditOpen, setTagsEditOpen] = useState(false);
  const [tagsEditImage, setTagsEditImage] = useState<GeneratedImage | null>(null);
  const [newLibraryTag, setNewLibraryTag] = useState("");
  const [tagActionLoading, setTagActionLoading] = useState(false);

  // Publish live: Best Bottles Shopify media or Tarife mainImage.
  const [sanityPublishOpen, setSanityPublishOpen] = useState(false);
  const [sanityPublishImage, setSanityPublishImage] = useState<GeneratedImage | null>(null);
  const [sanityPublishProduct, setSanityPublishProduct] = useState<Product | null>(null);
  const [sanityPublishLoading, setSanityPublishLoading] = useState(false);
  const [publishDestination, setPublishDestination] =
    useState<PublishDestination>("tarife-sanity");
  const [bestBottlesSlug, setBestBottlesSlug] = useState("");
  const [bestBottlesWebsiteSku, setBestBottlesWebsiteSku] = useState("");
  const [bestBottlesPdpMode, setBestBottlesPdpMode] =
    useState<BestBottlesPdpMode>("cap-on");
  const [bestBottlesGroupPickerOpen, setBestBottlesGroupPickerOpen] = useState(false);
  const [bestBottlesGroupSearch, setBestBottlesGroupSearch] = useState("");
  const [bestBottlesSkuPickerOpen, setBestBottlesSkuPickerOpen] = useState(false);
  const [bestBottlesSkuSearch, setBestBottlesSkuSearch] = useState("");
  const [bulkBestBottlesOpen, setBulkBestBottlesOpen] = useState(false);
  const [bulkBestBottlesRows, setBulkBestBottlesRows] = useState<BulkBestBottlesRow[]>([]);
  const [bulkBestBottlesMode, setBulkBestBottlesMode] =
    useState<BestBottlesPdpMode>("cap-on");
  const [bulkBestBottlesLoading, setBulkBestBottlesLoading] = useState(false);
  const [bulkShopifyOpen, setBulkShopifyOpen] = useState(false);
  const [bulkShopifyRows, setBulkShopifyRows] = useState<BulkShopifyRow[]>([]);
  const [bulkShopifyLoading, setBulkShopifyLoading] = useState(false);

  // Image editor modal
  const [imageEditorOpen, setImageEditorOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<ImageEditorImage | null>(null);

  useEffect(() => {
    const nextQuery = bestBottlesGroupParam || bestBottlesSkuParam;
    if (nextQuery) setSearchQuery(nextQuery);
  }, [bestBottlesGroupParam, bestBottlesSkuParam]);

  // Fetch images from generated_images table
  const { data: images = [], isLoading, refetch } = useQuery({
    queryKey: ["image-library", currentOrganizationId, user?.id, imageLibraryRowLimit],
    queryFn: async () => {
      if (!user) return [];

      console.log("📸 Image Library fetching...", {
        organizationId: currentOrganizationId,
        userId: user.id
      });

      // First try with organization_id if available
      if (currentOrganizationId) {
        try {
          const data = await fetchGeneratedImagesForScope("organization_id", currentOrganizationId, imageLibraryRowLimit);
          if (data.length > 0) {
            console.log(`✅ Image Library loaded ${data.length} recent images by org`);
            return hydrateImagesWithAncestorTags(data);
          }
        } catch (error) {
          console.error("❌ Error fetching by org:", error);
        }
      }

      // Fallback: fetch by user_id
      console.log("📸 Trying fallback query by user_id...");
      let userData: GeneratedImage[] = [];
      try {
        userData = await fetchGeneratedImagesForScope("user_id", user.id, imageLibraryRowLimit);
      } catch (userError) {
        console.error("❌ Error fetching by user:", userError);
        return [];
      }

      console.log(`✅ Image Library loaded ${userData.length || 0} recent images by user`);
      return hydrateImagesWithAncestorTags(userData);
    },
    enabled: !!user,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const needsBestBottlesProductLookup =
    isBestBottlesOrg &&
    (images.length > 0 ||
      selectedImages.size > 0 ||
      (sanityPublishOpen &&
      (publishDestination === "best-bottles-pdp" ||
        publishDestination === "best-bottles-grid")) ||
      bulkBestBottlesOpen ||
      bulkShopifyOpen);

  const { data: bestBottlesProducts = [], isLoading: bestBottlesProductsLoading } = useQuery({
    queryKey: ["best-bottles-products", "catalog"],
    queryFn: async () => {
      try {
        const products = await getBestBottlesCatalogProducts();
        if (products.length > 0) return products;
      } catch (error) {
        console.warn("Best Bottles catalog query failed; falling back to Empire products.", error);
      }
      return getProductsByFamily("Empire");
    },
    enabled: needsBestBottlesProductLookup,
    staleTime: 5 * 60 * 1000,
  });

  const { data: bestBottlesProductGroups = [], isLoading: bestBottlesProductGroupsLoading } =
    useQuery({
      queryKey: ["best-bottles-product-groups", "catalog"],
      queryFn: async () => getBestBottlesCatalogGroups(),
      enabled: isBestBottlesOrg,
      staleTime: 5 * 60 * 1000,
    });

  const { data: pipelineSkuJobs = [] } = useQuery({
    queryKey: ["best-bottles-pipeline-sku-jobs", currentOrganizationId],
    queryFn: async () => listPipelineSkuJobs(currentOrganizationId!),
    enabled: isBestBottlesOrg && Boolean(currentOrganizationId),
    staleTime: 2 * 60 * 1000,
  });

  const filteredBestBottlesProductGroups = useMemo(() => {
    const query = bestBottlesGroupSearch.trim().toLowerCase();
    const groups = [...bestBottlesProductGroups].sort((a, b) =>
      a.slug.localeCompare(b.slug),
    );
    if (!query) return groups.slice(0, 250);

    return groups
      .filter((group) =>
        [
          group.slug,
          group.displayName,
          group.family,
          group.capacity,
          group.color,
          group.category,
          group.bottleCollection,
          group.neckThreadSize,
          ...(group.applicatorTypes ?? []),
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query)),
      )
      .slice(0, 250);
  }, [bestBottlesProductGroups, bestBottlesGroupSearch]);

  const filteredBestBottlesProducts = useMemo(() => {
    const query = bestBottlesSkuSearch.trim().toLowerCase();
    const products = [...bestBottlesProducts].sort((a, b) =>
      (a.websiteSku || a.graceSku).localeCompare(b.websiteSku || b.graceSku),
    );
    if (!query) return products;

    return products.filter((product) =>
      [
        product.websiteSku,
        product.graceSku,
        product.itemName,
        product.family,
        product.capacity,
        product.applicator,
        product.capColor,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [bestBottlesProducts, bestBottlesSkuSearch]);

  const bestBottlesProductsByWebsiteSku = useMemo(() => {
    const map = new Map<string, BestBottlesProduct>();
    for (const product of bestBottlesProducts) {
      if (product.websiteSku) {
        map.set(product.websiteSku.toUpperCase(), product);
      }
    }
    return map;
  }, [bestBottlesProducts]);

  const bestBottlesProductsByGraceSku = useMemo(() => {
    const map = new Map<string, BestBottlesProduct>();
    for (const product of bestBottlesProducts) {
      if (product.graceSku) {
        map.set(product.graceSku.toUpperCase(), product);
      }
    }
    return map;
  }, [bestBottlesProducts]);

  const resolveBestBottlesProductForSku = useCallback((sku: string | null | undefined) => {
    const trimmed = sku?.trim();
    if (!trimmed) return null;
    const key = trimmed.toUpperCase();
    return bestBottlesProductsByGraceSku.get(key) ?? bestBottlesProductsByWebsiteSku.get(key) ?? null;
  }, [bestBottlesProductsByGraceSku, bestBottlesProductsByWebsiteSku]);

  const resolveBestBottlesProductForImage = useCallback((image: GeneratedImage) => {
    return (
      resolveBestBottlesProductForSku(detectShopifySku(image)) ??
      resolveBestBottlesProductForSku(detectGraceSku(image)) ??
      resolveBestBottlesProductForSku(detectWebsiteSku(image))
    );
  }, [resolveBestBottlesProductForSku]);

  const resolveBestBottlesImageCapacityMl = useCallback((image: GeneratedImage): number | null => {
    const product = resolveBestBottlesProductForImage(image);
    if (product?.capacityMl != null) return product.capacityMl;
    return detectCapacityMlFromText(imageMetadataText(image));
  }, [resolveBestBottlesProductForImage]);

  const getBestBottlesFinishConflict = useCallback((
    expectedCapColor: string | null | undefined,
    product: BestBottlesProduct | null,
  ) => {
    const validation = validateBestBottlesImageIdentity(expectedCapColor, product);
    return validation.ok ? "" : validation.message;
  }, []);

  const bestBottlesProductGroupsById = useMemo(() => {
    const map = new Map<string, BestBottlesProductGroup>();
    for (const group of bestBottlesProductGroups) {
      map.set(group._id, group);
    }
    return map;
  }, [bestBottlesProductGroups]);

  const bestBottlesProductGroupsBySlug = useMemo(() => {
    const map = new Map<string, BestBottlesProductGroup>();
    for (const group of bestBottlesProductGroups) {
      map.set(normalizeBestBottlesSlug(group.slug), group);
    }
    return map;
  }, [bestBottlesProductGroups]);

  const bestBottlesProductGroupsByPrimarySku = useMemo(() => {
    const map = new Map<string, BestBottlesProductGroup>();
    for (const group of bestBottlesProductGroups) {
      if (group.primaryGraceSku) {
        map.set(group.primaryGraceSku.toUpperCase(), group);
      }
      if (group.primaryWebsiteSku) {
        map.set(group.primaryWebsiteSku.toUpperCase(), group);
      }
    }
    return map;
  }, [bestBottlesProductGroups]);

  const bestBottlesWebsiteSkuByGraceSku = useMemo(() => {
    const map = new Map<string, string>();
    for (const product of bestBottlesProducts) {
      if (product.graceSku && product.websiteSku) {
        map.set(product.graceSku.toUpperCase(), product.websiteSku);
      }
    }
    return map;
  }, [bestBottlesProducts]);

  const bestBottlesGraceSkuByWebsiteSku = useMemo(() => {
    const map = new Map<string, string>();
    for (const product of bestBottlesProducts) {
      if (product.graceSku && product.websiteSku) {
        map.set(product.websiteSku.toUpperCase(), product.graceSku.toUpperCase());
      }
    }
    return map;
  }, [bestBottlesProducts]);

  const pipelineSkuJobsBySku = useMemo(() => {
    const map = new Map<string, PipelineSkuJob>();
    for (const job of pipelineSkuJobs) {
      for (const sku of [job.grace_sku, job.website_sku, job.shopify_sku]) {
        if (sku) map.set(sku.toUpperCase(), job);
      }
    }
    return map;
  }, [pipelineSkuJobs]);

  const resolvePipelineSkuJobForImage = useCallback((image: GeneratedImage) => {
    for (const sku of [detectShopifySku(image), detectGraceSku(image), detectWebsiteSku(image)]) {
      const job = sku ? pipelineSkuJobsBySku.get(sku.toUpperCase()) : undefined;
      if (job) return job;
    }
    return null;
  }, [pipelineSkuJobsBySku]);

  const bestBottlesFamilyBySku = useMemo(() => {
    const map = new Map<string, string>();
    for (const product of bestBottlesProducts) {
      const family = product.family ? normalizeBestBottlesSlug(product.family) : "";
      if (!family) continue;
      if (product.graceSku) map.set(product.graceSku.toUpperCase(), family);
      if (product.websiteSku) map.set(product.websiteSku.toUpperCase(), family);
    }
    return map;
  }, [bestBottlesProducts]);

  const bestBottlesFamilyLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const product of bestBottlesProducts) {
      if (!product.family) continue;
      map.set(normalizeBestBottlesSlug(product.family), product.family);
    }
    for (const image of images) {
      const family = detectBestBottlesFamilyTag(image);
      if (family && !map.has(family)) map.set(family, bestBottlesFamilyLabel(family));
    }
    return map;
  }, [bestBottlesProducts, images]);

  const resolveBestBottlesFamilyKey = useCallback((image: GeneratedImage) => {
    const explicitFamily = detectBestBottlesFamilyTag(image);
    if (explicitFamily) return explicitFamily;

    const graceSku = detectGraceSku(image);
    if (graceSku) {
      const family = bestBottlesFamilyBySku.get(graceSku.toUpperCase());
      if (family) return family;
    }

    const websiteSku = detectWebsiteSku(image);
    if (websiteSku) {
      const family = bestBottlesFamilyBySku.get(websiteSku.toUpperCase());
      if (family) return family;
    }

    return "";
  }, [bestBottlesFamilyBySku]);

  const canonicalGraceSkus = useMemo(() => {
    const set = new Set<string>();
    for (const product of bestBottlesProducts) {
      if (product.graceSku) set.add(product.graceSku.toUpperCase());
    }
    return set;
  }, [bestBottlesProducts]);

  const isCanonicalGraceSku = useCallback(
    (sku: string) => {
      const trimmed = sku.trim();
      if (!trimmed) return false;
      return canonicalGraceSkus.has(trimmed.toUpperCase());
    },
    [canonicalGraceSkus],
  );

  const resolveBestBottlesWebsiteSku = useCallback((image: GeneratedImage) => {
    const websiteSku = detectWebsiteSku(image);
    if (websiteSku) return websiteSku;

    const graceSku = detectGraceSku(image);
    if (graceSku) {
      const resolved = bestBottlesWebsiteSkuByGraceSku.get(graceSku);
      if (resolved) return resolved;
    }

    return "";
  }, [bestBottlesWebsiteSkuByGraceSku]);

  const resolveShopifySku = useCallback((image: GeneratedImage) => {
    const tags = image.library_tags ?? [];

    for (const tag of tags) {
      const explicit = tag.match(/^(?:shopifySku|shopify-sku):(.+)$/i);
      if (explicit?.[1]?.trim()) return explicit[1].trim();
    }

    for (const tag of tags) {
      const explicit = tag.match(/^(?:graceSku|grace-sku):(.+)$/i);
      if (explicit?.[1]?.trim()) return explicit[1].trim().toUpperCase();
    }

    for (const tag of tags) {
      const raw = tag.replace(/^sku:/i, "").trim();
      const match = raw.match(/\b(?:GB|LB)-[A-Z0-9][A-Z0-9-]*\b/i);
      if (match) return match[0].toUpperCase();
    }

    return "";
  }, []);

  const buildBulkShopifyRow = useCallback((image: GeneratedImage): BulkShopifyRow => {
    const detectedWebsiteSku = detectWebsiteSku(image);
    const detectedGraceSku = detectGraceSku(image);
    const product =
      (detectedWebsiteSku
        ? bestBottlesProductsByWebsiteSku.get(detectedWebsiteSku.toUpperCase())
        : undefined) ??
      (detectedGraceSku
        ? bestBottlesProductsByGraceSku.get(detectedGraceSku.toUpperCase())
        : undefined);
    const websiteSku = detectedWebsiteSku || product?.websiteSku || "";
    const graceSku = detectedGraceSku || product?.graceSku || "";
    const explicitShopifySku = detectShopifySku(image);
    const sku = explicitShopifySku || product?.graceSku || graceSku || websiteSku;
    const resolvedIdentity = resolveBestBottlesVisualIdentity(product ?? null);
    const expectedCapColor = resolvedIdentity.safeToPush ? resolvedIdentity.resolvedVisualIdentity : detectBestBottlesVisualIdentityFromText([
      image.session_name,
      image.final_prompt,
      ...(image.library_tags ?? []),
    ].filter(Boolean).join(" "));

    return {
      imageId: image.id,
      imageUrl: image.image_url,
      label: image.session_name || image.final_prompt || "Library image",
      sku,
      websiteSku,
      graceSku,
      expectedCapColor,
      manualVisualIdentityApproval: createManualVisualIdentityApproval(
        expectedCapColor,
        inferManualCapHeight({ sku, websiteSku, graceSku }, product),
      ),
    };
  }, [bestBottlesProductsByGraceSku, bestBottlesProductsByWebsiteSku]);

  const resolveBestBottlesProductGroupSlug = useCallback(
    (image: GeneratedImage) => {
      const explicitSlug = detectProductGroupSlug(image);
      if (explicitSlug && bestBottlesProductGroupsBySlug.has(explicitSlug)) {
        return explicitSlug;
      }

      const websiteSku = detectWebsiteSku(image);
      const graceSku = detectGraceSku(image);
      const product =
        (websiteSku
          ? bestBottlesProductsByWebsiteSku.get(websiteSku.toUpperCase())
          : undefined) ??
        (graceSku ? bestBottlesProductsByGraceSku.get(graceSku.toUpperCase()) : undefined);
      const group = product?.productGroupId
        ? bestBottlesProductGroupsById.get(product.productGroupId)
        : undefined;
      const productGroupSlug = normalizeBestBottlesSlug(product?.productGroupSlug);
      const groupByProductSlug = productGroupSlug
        ? bestBottlesProductGroupsBySlug.get(productGroupSlug)
        : undefined;
      const groupByPrimarySku =
        (product?.graceSku
          ? bestBottlesProductGroupsByPrimarySku.get(product.graceSku.toUpperCase())
          : undefined) ??
        (product?.websiteSku
          ? bestBottlesProductGroupsByPrimarySku.get(product.websiteSku.toUpperCase())
          : undefined);

      return group?.slug ?? groupByProductSlug?.slug ?? productGroupSlug ?? groupByPrimarySku?.slug ?? "";
    },
    [
      bestBottlesProductGroupsById,
      bestBottlesProductGroupsByPrimarySku,
      bestBottlesProductGroupsBySlug,
      bestBottlesProductsByGraceSku,
      bestBottlesProductsByWebsiteSku,
    ],
  );

  useEffect(() => {
    if (
      !sanityPublishOpen ||
      !sanityPublishImage ||
      publishDestination !== "best-bottles-grid" ||
      bestBottlesSlug.trim()
    ) {
      return;
    }

    const resolvedSlug = resolveBestBottlesProductGroupSlug(sanityPublishImage);
    if (resolvedSlug) setBestBottlesSlug(resolvedSlug);
  }, [
    bestBottlesSlug,
    publishDestination,
    resolveBestBottlesProductGroupSlug,
    sanityPublishImage,
    sanityPublishOpen,
  ]);

  useEffect(() => {
    if (!bulkBestBottlesOpen) return;
    const imagesById = new Map(images.map((image) => [image.id, image]));

    setBulkBestBottlesRows((rows) => {
      let changed = false;
      const next = rows.map((row) => {
        if (row.websiteSku.trim()) return row;
        const image = imagesById.get(row.imageId);
        if (!image) return row;
        const resolved = resolveBestBottlesWebsiteSku(image);
        if (!resolved) return row;
        changed = true;
        return { ...row, websiteSku: resolved };
      });
      return changed ? next : rows;
    });
  }, [bulkBestBottlesOpen, images, resolveBestBottlesWebsiteSku]);

  useEffect(() => {
    if (!bulkShopifyOpen) return;
    const imagesById = new Map(images.map((image) => [image.id, image]));

    setBulkShopifyRows((rows) => {
      let changed = false;
      const next = rows.map((row) => {
        if (row.sku.trim()) return row;
        const image = imagesById.get(row.imageId);
        if (!image) return row;
        const resolved = resolveShopifySku(image);
        if (!resolved) return row;
        changed = true;
        return { ...row, sku: resolved };
      });
      return changed ? next : rows;
    });
  }, [bulkShopifyOpen, images, resolveShopifySku]);

  const getBestBottlesPdpModeForWebsiteSku = (
    websiteSku: string,
    requestedMode: BestBottlesPdpMode,
  ): BestBottlesPdpMode =>
    isEmpireVintageBulbSprayerSku(websiteSku, bestBottlesProductsByWebsiteSku)
      ? PRIMARY_PDP_MODE
      : requestedMode;

  const selectedBestBottlesWebsiteSkus = useMemo(
    () => splitWebsiteSkus(bestBottlesWebsiteSku),
    [bestBottlesWebsiteSku],
  );
  const selectedBestBottlesProductGroupSlugs = useMemo(
    () =>
      Array.from(
        new Set(
          selectedBestBottlesWebsiteSkus
            .map((sku) => normalizeBestBottlesSlug(sku))
            .filter(
              (slug) =>
                slug &&
                (bestBottlesProductGroupsBySlug.has(slug) ||
                  looksLikeBestBottlesProductGroupSlug(slug)),
            ),
        ),
      ),
    [bestBottlesProductGroupsBySlug, selectedBestBottlesWebsiteSkus],
  );
  const selectedBestBottlesHasProductGroupSlug =
    selectedBestBottlesProductGroupSlugs.length > 0;

  const resolveEnteredBestBottlesGroupSlug = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return "";
      const normalized = normalizeBestBottlesSlug(trimmed);
      return bestBottlesProductGroupsBySlug.get(normalized)?.slug ?? trimmed;
    },
    [bestBottlesProductGroupsBySlug],
  );

  const selectedBestBottlesPrimaryOnly =
    selectedBestBottlesWebsiteSkus.length > 0 &&
    selectedBestBottlesWebsiteSkus.every((sku) =>
      isEmpireVintageBulbSprayerSku(sku, bestBottlesProductsByWebsiteSku),
    );
  const selectedBestBottlesHasPrimaryOnly =
    selectedBestBottlesWebsiteSkus.some((sku) =>
      isEmpireVintageBulbSprayerSku(sku, bestBottlesProductsByWebsiteSku),
    );
  const bulkBestBottlesRowsWithSku = bulkBestBottlesRows.filter((row) => row.websiteSku.trim());
  const bulkBestBottlesPrimaryOnly =
    bulkBestBottlesRowsWithSku.length > 0 &&
    bulkBestBottlesRowsWithSku.every((row) =>
      isEmpireVintageBulbSprayerSku(row.websiteSku, bestBottlesProductsByWebsiteSku),
    );
  const bulkBestBottlesHasPrimaryOnly =
    bulkBestBottlesRowsWithSku.some((row) =>
      isEmpireVintageBulbSprayerSku(row.websiteSku, bestBottlesProductsByWebsiteSku),
    );

  const familyRailImages = useMemo(() => {
    let result = [...images];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter((img) => {
        const searchable = [
          img.session_name,
          img.final_prompt,
          img.library_category,
          img.image_url,
          detectProductGroupSlug(img),
          detectWebsiteSku(img),
          detectGraceSku(img),
          detectShopifySku(img),
          bestBottlesFamilyLabels.get(resolveBestBottlesFamilyKey(img)),
          ...(img.library_tags ?? []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return searchable.includes(query);
      });
    }

    if (assetTypeFilter === "roll-ons") {
      result = result.filter(matchesRollOnLibraryScope);
    } else if (assetTypeFilter === "empty-plates") {
      result = result.filter(matchesEmptyPlateScope);
    } else if (assetTypeFilter === "product-photography") {
      result = result.filter(matchesProductPhotographyAsset);
    } else if (assetTypeFilter === "lifestyle") {
      result = result.filter(matchesLifestyleAsset);
    } else if (assetTypeFilter === "product") {
      result = result.filter(matchesProductAsset);
    } else if (assetTypeFilter === "background") {
      result = result.filter(matchesBackgroundAsset);
    } else if (assetTypeFilter === "style") {
      result = result.filter(matchesStyleReferenceAsset);
    }

    return result;
  }, [
    assetTypeFilter,
    bestBottlesFamilyLabels,
    images,
    resolveBestBottlesFamilyKey,
    searchQuery,
  ]);

  const bestBottlesFamilyOptions = useMemo(() => {
    const counts = new Map<string, number>();
    const families = new Map<string, string>();

    for (const [family, label] of bestBottlesFamilyLabels) {
      families.set(family, label);
    }

    for (const product of bestBottlesProducts) {
      if (!product.family) continue;
      const family = normalizeBestBottlesSlug(product.family);
      if (family) families.set(family, product.family);
    }

    for (const group of bestBottlesProductGroups) {
      if (!group.family) continue;
      const family = normalizeBestBottlesSlug(group.family);
      if (family) families.set(family, group.family);
    }

    for (const image of familyRailImages) {
      const family = resolveBestBottlesFamilyKey(image);
      if (!family) continue;
      if (!families.has(family)) {
        families.set(family, bestBottlesFamilyLabels.get(family) ?? bestBottlesFamilyLabel(family));
      }
      counts.set(family, (counts.get(family) ?? 0) + 1);
    }

    return Array.from(families.entries())
      .map(([family, label]) => ({
        family,
        count: counts.get(family) ?? 0,
        label,
      }))
      .sort((a, b) => {
        const aPriority = BEST_BOTTLES_FAMILY_PRIORITY.indexOf(a.family);
        const bPriority = BEST_BOTTLES_FAMILY_PRIORITY.indexOf(b.family);
        if (aPriority !== -1 || bPriority !== -1) {
          return (aPriority === -1 ? 999 : aPriority) - (bPriority === -1 ? 999 : bPriority);
        }
        return a.label.localeCompare(b.label);
      });
  }, [
    bestBottlesFamilyLabels,
    bestBottlesProductGroups,
    bestBottlesProducts,
    familyRailImages,
    resolveBestBottlesFamilyKey,
  ]);

  const skuSizeOptions = useMemo(() => {
    const sizes = new Set<number>();

    for (const product of bestBottlesProducts) {
      if (product.capacityMl != null) sizes.add(product.capacityMl);
    }
    for (const group of bestBottlesProductGroups) {
      if (group.capacityMl != null) sizes.add(group.capacityMl);
    }
    for (const image of familyRailImages) {
      const capacityMl = resolveBestBottlesImageCapacityMl(image);
      if (capacityMl != null) sizes.add(capacityMl);
    }

    return Array.from(sizes).sort((a, b) => a - b);
  }, [
    bestBottlesProductGroups,
    bestBottlesProducts,
    familyRailImages,
    resolveBestBottlesImageCapacityMl,
  ]);

  // Filter and sort images
  const filteredImages = useMemo(() => {
    let result = [...familyRailImages];

    if (isBestBottlesOrg && bestBottlesFamilyFilter !== "all") {
      result = result.filter((img) => resolveBestBottlesFamilyKey(img) === bestBottlesFamilyFilter);
    }

    if (isBestBottlesOrg && skuSizeFilter !== "all") {
      const selectedCapacity = Number.parseInt(skuSizeFilter, 10);
      result = result.filter((img) => resolveBestBottlesImageCapacityMl(img) === selectedCapacity);
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case "recent":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case "oldest":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "category":
          return (a.library_category || "").localeCompare(b.library_category || "");
        default:
          return 0;
      }
    });

    return result;
  }, [
    bestBottlesFamilyFilter,
    familyRailImages,
    isBestBottlesOrg,
    resolveBestBottlesFamilyKey,
    resolveBestBottlesImageCapacityMl,
    sortBy,
    skuSizeFilter,
  ]);

  // Handlers
  const handleImageClick = (image: GeneratedImage) => {
    setSelectedImage({
      id: image.id,
      imageUrl: image.image_url,
      prompt: image.final_prompt || "",
      isSaved: true,
      // Pass additional metadata
      goalType: image.goal_type || undefined,
      aspectRatio: image.aspect_ratio || undefined,
      createdAt: image.created_at,
      sessionName: image.session_name || undefined,
      libraryTags: image.library_tags ?? [],
    });
    setImageEditorOpen(true);
  };

  const handleDownload = async (image: GeneratedImage) => {
    try {
      const response = await fetch(image.image_url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${image.session_name || "image"}-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast({ title: "Downloaded", description: "Image saved to your device" });
    } catch (error) {
      toast({ title: "Download failed", variant: "destructive" });
    }
  };

  const handleArchive = async (imageId: string) => {
    const { error } = await supabase
      .from("generated_images")
      .update({ is_archived: true })
      .eq("id", imageId);

    if (error) {
      toast({ title: "Archive failed", variant: "destructive" });
    } else {
      toast({ title: "Image archived" });
      refetch();
    }
  };

  const handleBulkArchive = async () => {
    if (selectedImages.size === 0) return;

    const { error } = await supabase
      .from("generated_images")
      .update({ is_archived: true })
      .in("id", Array.from(selectedImages));

    if (error) {
      toast({ title: "Archive failed", variant: "destructive" });
    } else {
      toast({ title: `${selectedImages.size} images archived` });
      setSelectedImages(new Set());
      refetch();
    }
  };

  const openBulkBestBottlesPublish = () => {
    const selected = images.filter((image) => selectedImages.has(image.id));
    setBulkBestBottlesRows(
      selected.map((image) => ({
        imageId: image.id,
        imageUrl: image.image_url,
        label: image.session_name || image.final_prompt || "Library image",
        websiteSku: resolveBestBottlesWebsiteSku(image),
      })),
    );
    setBulkBestBottlesMode("cap-on");
    setBulkBestBottlesOpen(true);
  };

  const updateBulkBestBottlesSku = (imageId: string, websiteSku: string) => {
    setBulkBestBottlesRows((rows) =>
      rows.map((row) => (row.imageId === imageId ? { ...row, websiteSku } : row)),
    );
  };

  const handleBulkBestBottlesPublish = async () => {
    const rowsToPublish = bulkBestBottlesRows
      .map((row) => ({ ...row, websiteSku: row.websiteSku.trim() }))
      .filter((row) => row.websiteSku);
    if (rowsToPublish.length === 0) return;

    setBulkBestBottlesLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("push-shopify-product-images", {
        body: {
          organizationId: currentOrganizationId,
          items: rowsToPublish.map((row) => ({
            imageId: row.imageId,
            imageUrl: row.imageUrl,
            sku: row.websiteSku,
            altText: row.label,
            mode: getBestBottlesPdpModeForWebsiteSku(row.websiteSku, bulkBestBottlesMode),
          })),
          attachToVariant: true,
          syncBestBottlesConvex: true,
        },
      });

      if (error) throw new Error(await extractFunctionErrorMessage(error, "Best Bottles publish failed"));
      if (data?.error) throw new Error(data.error);
      const failedCount = Number(data?.failedCount ?? 0);
      const firstFailure = Array.isArray(data?.results)
        ? data.results.find((result: { status?: string }) => result.status === "failed")
        : null;
      if (failedCount > 0) {
        throw new Error(firstFailure?.message ?? `${failedCount} image${failedCount === 1 ? "" : "s"} failed.`);
      }

      await markBestBottlesSkuJobsFromShopifyResults(currentOrganizationId, data?.results);

      toast({
        title: "Best Bottles batch updated",
        description: `${rowsToPublish.length} image${rowsToPublish.length === 1 ? "" : "s"} pushed to Shopify and linked to the Best Bottles PDP.`,
      });
      setBulkBestBottlesOpen(false);
      setBulkBestBottlesRows([]);
      setSelectedImages(new Set());
    } catch (e: unknown) {
      const rawMessage = await extractFunctionErrorMessage(e, "Unable to publish batch");
      const message = /failed to send|functions\/v1|edge function|net::err_failed/i.test(rawMessage)
        ? "Madison could not reach the Shopify image publish function. Deploy push-shopify-product-images and confirm Shopify, Best Bottles Convex, and Supabase secrets, then try again."
        : rawMessage;
      toast({ title: "Batch publish failed", description: message, variant: "destructive" });
    } finally {
      setBulkBestBottlesLoading(false);
    }
  };

  const openBulkShopifyPublish = () => {
    const selected = images.filter((image) => selectedImages.has(image.id));
    setBulkShopifyRows(selected.map((image) => buildBulkShopifyRow(image)));
    setBulkShopifyOpen(true);
  };

  useEffect(() => {
    if (!bulkShopifyOpen || !isBestBottlesOrg || bestBottlesProducts.length === 0) return;

    const imagesById = new Map(images.map((image) => [image.id, image]));
    setBulkShopifyRows((rows) =>
      rows.map((row) => {
        const image = imagesById.get(row.imageId);
        if (!image) return row;

        const suggested = buildBulkShopifyRow(image);
        const currentSku = row.sku.trim();
        const replaceSku =
          !currentSku ||
          currentSku.toUpperCase() === row.websiteSku.toUpperCase() ||
          currentSku.toUpperCase() === suggested.websiteSku.toUpperCase();

        const nextSku = replaceSku ? suggested.sku : row.sku;
        const nextWebsiteSku = row.websiteSku || suggested.websiteSku;
        const nextGraceSku = row.graceSku || suggested.graceSku;
        const nextExpectedCapColor = row.expectedCapColor || suggested.expectedCapColor;
        const nextProduct =
          resolveBestBottlesProductForSku(nextSku) ??
          resolveBestBottlesProductForSku(nextGraceSku) ??
          resolveBestBottlesProductForSku(nextWebsiteSku);

        return {
          ...row,
          sku: nextSku,
          websiteSku: nextWebsiteSku,
          graceSku: nextGraceSku,
          expectedCapColor: nextExpectedCapColor,
          manualVisualIdentityApproval: {
            ...row.manualVisualIdentityApproval,
            visualFinish: row.manualVisualIdentityApproval.visualFinish || nextExpectedCapColor,
            capHeight:
              row.manualVisualIdentityApproval.capHeight ||
              inferManualCapHeight(
                { sku: nextSku, websiteSku: nextWebsiteSku, graceSku: nextGraceSku },
                nextProduct,
              ),
          },
        };
      }),
    );
  }, [
    bestBottlesProducts.length,
    buildBulkShopifyRow,
    bulkShopifyOpen,
    images,
    isBestBottlesOrg,
    resolveBestBottlesProductForSku,
  ]);

  const updateBulkShopifySku = (imageId: string, sku: string) => {
    setBulkShopifyRows((rows) =>
      rows.map((row) => {
        if (row.imageId !== imageId) return row;
        const product =
          resolveBestBottlesProductForSku(sku) ??
          resolveBestBottlesProductForSku(row.graceSku) ??
          resolveBestBottlesProductForSku(row.websiteSku);
        return {
          ...row,
          sku,
          manualVisualIdentityApproval: {
            ...row.manualVisualIdentityApproval,
            capHeight: inferManualCapHeight({ ...row, sku }, product),
            confirmed: false,
          },
        };
      }),
    );
  };

  const applyBulkShopifyVariantTarget = (
    imageId: string,
    product: BestBottlesProduct,
    imageVisualIdentity: string,
  ) => {
    const resolvedIdentity = resolveBestBottlesVisualIdentity(product);
    const visualFinish =
      imageVisualIdentity ||
      resolvedIdentity.resolvedVisualIdentity ||
      product.capColor ||
      "";
    setBulkShopifyRows((rows) =>
      rows.map((row) =>
        row.imageId === imageId
          ? {
              ...row,
              sku: product.graceSku || row.sku,
              graceSku: product.graceSku || row.graceSku,
              websiteSku: product.websiteSku || row.websiteSku,
              expectedCapColor: visualFinish,
              manualVisualIdentityApproval: createManualVisualIdentityApproval(
                visualFinish,
                inferManualCapHeight(
                  {
                    sku: product.graceSku || row.sku,
                    graceSku: product.graceSku || row.graceSku,
                    websiteSku: product.websiteSku || row.websiteSku,
                  },
                  product,
                ),
              ),
            }
          : row,
      ),
    );
  };

  const updateBulkShopifyExpectedCapColor = (imageId: string, expectedCapColor: string) => {
    setBulkShopifyRows((rows) =>
      rows.map((row) => (row.imageId === imageId ? { ...row, expectedCapColor } : row)),
    );
  };

  const updateBulkShopifyManualApproval = (
    imageId: string,
    patch: Partial<ManualVisualIdentityApproval>,
  ) => {
    setBulkShopifyRows((rows) =>
      rows.map((row) =>
        row.imageId === imageId
          ? {
              ...row,
              manualVisualIdentityApproval: {
                ...row.manualVisualIdentityApproval,
                ...patch,
              },
            }
          : row,
      ),
    );
  };

  const getBulkShopifyRowProduct = useCallback(
    (row: Pick<BulkShopifyRow, "sku" | "graceSku" | "websiteSku">) =>
      resolveBestBottlesProductForSku(row.sku) ??
      resolveBestBottlesProductForSku(row.graceSku) ??
      resolveBestBottlesProductForSku(row.websiteSku),
    [resolveBestBottlesProductForSku],
  );

  const findMatchingBestBottlesVariantForImageFinish = useCallback(
    (row: BulkShopifyRow) => {
      const imageIdentity = row.expectedCapColor.trim();
      if (!imageIdentity) return null;
      const currentProduct =
        resolveBestBottlesProductForSku(row.graceSku) ??
        resolveBestBottlesProductForSku(row.sku) ??
        resolveBestBottlesProductForSku(row.websiteSku);
      if (!currentProduct) return null;
      const currentGroupSlug = normalizeBestBottlesSlug(currentProduct.productGroupSlug);
      const currentFamily = normalizeBestBottlesSlug(currentProduct.family);
      const currentColor = canonicalBestBottlesVisualIdentity(currentProduct.color);
      const currentApplicator = normalizeBestBottlesSlug(currentProduct.applicator);
      const rowGracePrefix = row.graceSku.trim().toUpperCase().split("-").slice(0, 3).join("-");

      const candidates = bestBottlesProducts.filter((candidate) => {
        if (candidate._id === currentProduct._id) return false;
        const sameGroup =
          Boolean(currentProduct.productGroupId && candidate.productGroupId === currentProduct.productGroupId) ||
          Boolean(currentGroupSlug && normalizeBestBottlesSlug(candidate.productGroupSlug) === currentGroupSlug);
        const sameCohort =
          normalizeBestBottlesSlug(candidate.family) === currentFamily &&
          String(candidate.capacityMl ?? "") === String(currentProduct.capacityMl ?? "") &&
          canonicalBestBottlesVisualIdentity(candidate.color) === currentColor &&
          normalizeBestBottlesSlug(candidate.applicator) === currentApplicator;
        return (sameGroup || sameCohort) && validateBestBottlesImageIdentity(imageIdentity, candidate).ok;
      });

      return candidates.sort((a, b) => {
        const aGroup = normalizeBestBottlesSlug(a.productGroupSlug) === currentGroupSlug ? 0 : 1;
        const bGroup = normalizeBestBottlesSlug(b.productGroupSlug) === currentGroupSlug ? 0 : 1;
        if (aGroup !== bGroup) return aGroup - bGroup;
        const aPrefix = rowGracePrefix && a.graceSku.toUpperCase().startsWith(rowGracePrefix) ? 0 : 1;
        const bPrefix = rowGracePrefix && b.graceSku.toUpperCase().startsWith(rowGracePrefix) ? 0 : 1;
        if (aPrefix !== bPrefix) return aPrefix - bPrefix;
        return a.graceSku.localeCompare(b.graceSku);
      })[0] ?? null;
    },
    [bestBottlesProducts, resolveBestBottlesProductForSku],
  );

  const isBulkShopifyRowManualReviewable = useCallback(
    (row: BulkShopifyRow, product: BestBottlesProduct | null) => {
      if (!isBestBottlesOrg || !product || !row.sku.trim()) return false;
      const validation = validateBestBottlesImageIdentity(row.expectedCapColor, product);
      return (
        !validation.ok &&
        !validation.resolution.safeToPush &&
        validation.resolution.blockingWarnings.length > 0 &&
        validation.resolution.blockingWarnings.every(isReviewableVisualIdentityWarning)
      );
    },
    [isBestBottlesOrg],
  );

  const canPublishBulkShopifyRow = useCallback(
    (row: BulkShopifyRow) => {
      if (!row.sku.trim()) return true;
      if (!isBestBottlesOrg) return true;
      const product = getBulkShopifyRowProduct(row);
      if (!product) return false;
      if (validateBestBottlesImageIdentity(row.expectedCapColor, product).ok) return true;
      return (
        isBulkShopifyRowManualReviewable(row, product) &&
        isManualVisualIdentityApproved(row.manualVisualIdentityApproval) &&
        manualVisualIdentityMatchesSku(row)
      );
    },
    [getBulkShopifyRowProduct, isBestBottlesOrg, isBulkShopifyRowManualReviewable],
  );

  const openFinishCorrectRevision = useCallback(
    (row: BulkShopifyRow) => {
      const product = getBulkShopifyRowProduct(row);
      const resolution = resolveBestBottlesVisualIdentity(product);
      const requiredFinish =
        resolution.resolvedVisualIdentity ||
        inferExpectedVisualIdentityFromBestBottlesSku(row) ||
        row.expectedCapColor ||
        "the required SKU finish";
      const currentFinish =
        row.manualVisualIdentityApproval.visualFinish ||
        row.expectedCapColor ||
        "the current mismatched finish";
      const targetSku = row.sku || row.graceSku || row.websiteSku;
      const image = images.find((candidate) => candidate.id === row.imageId);
      const productName = product?.itemName || row.label || "Best Bottles product";
      const prompt = [
        `Finish-correct revision for ${productName}.`,
        `Keep target SKU ${targetSku}.`,
        `Preserve the exact bottle family, capacity, glass color, cap-off/cap-beside composition, camera angle, framing, crop, scale, and background from the reference image.`,
        `Change only the visible component finish from ${currentFinish} to ${requiredFinish}.`,
        `The revised image must visually read as ${requiredFinish} and remain eligible for Shopify variant media for SKU ${targetSku}.`,
        "Do not change the bottle shape, product identity, layout, or SKU identity.",
      ].join(" ");
      const extraLibraryTags = [
        LIBRARY_ROLE_PRODUCT,
        "revisionType:finish-correct",
        `revisionOf:${row.imageId}`,
        `requiredFinish:${requiredFinish}`,
        `visualIdentity:${requiredFinish}`,
        row.sku ? `shopifySku:${row.sku}` : "",
        row.graceSku ? `graceSku:${row.graceSku}` : "",
        row.websiteSku ? `websiteSku:${row.websiteSku}` : "",
        targetSku ? `sku:${targetSku}` : "",
      ].filter(Boolean);

      setBulkShopifyOpen(false);
      navigate(`/darkroom?prompt=${encodeURIComponent(prompt)}`, {
        state: {
          productImage: {
            url: row.imageUrl,
            name: `${targetSku || row.imageId} finish-correct reference`,
          },
          extraLibraryTags,
        },
      });

      toast({
        title: `${requiredFinish} revision queued`,
        description: "Dark Room is loaded with the same SKU and reference image. Generate the corrected finish, then push that new image.",
      });
    },
    [getBulkShopifyRowProduct, images, navigate, toast],
  );

  const openMissingVariantAsset = useCallback(
    (row: BulkShopifyRow, targetProduct: BestBottlesProduct) => {
      const resolution = resolveBestBottlesVisualIdentity(targetProduct);
      const requiredFinish =
        resolution.resolvedVisualIdentity ||
        inferExpectedVisualIdentityFromBestBottlesSku({
          sku: targetProduct.graceSku,
          graceSku: targetProduct.graceSku,
          websiteSku: targetProduct.websiteSku,
        }) ||
        targetProduct.capColor ||
        "the target SKU finish";
      const targetSku = targetProduct.graceSku || row.sku || row.graceSku || row.websiteSku;
      const targetWebsiteSku = targetProduct.websiteSku || row.websiteSku;
      const image = images.find((candidate) => candidate.id === row.imageId);
      const productName = targetProduct.itemName || row.label || "Best Bottles product";
      const referenceIdentity =
        row.expectedCapColor ||
        row.manualVisualIdentityApproval.visualFinish ||
        "unknown";
      const prompt = [
        `Create a cap-off/cap-beside-bottle product image for target SKU ${targetSku}.`,
        targetWebsiteSku ? `Target website SKU: ${targetWebsiteSku}.` : "",
        `Use the same ${[targetProduct.family, targetProduct.capacity].filter(Boolean).join(" ") || "target"} bottle structure and PDP composition from the reference image for layout and bottle geometry only.`,
        `The finish must match the target SKU finish exactly: ${requiredFinish}.`,
        `Do not inherit finish, SKU, or identity from the reference image.`,
        `Reference image identity is ${referenceIdentity}; ignore that identity for the output.`,
        "The output identity must validate against the target SKU before Shopify push.",
        `Product context: ${productName}.`,
      ]
        .filter(Boolean)
        .join(" ");
      const extraLibraryTags = [
        LIBRARY_ROLE_PRODUCT,
        "generationMode:create-missing-variant-asset",
        `referenceIdentityIgnored:${referenceIdentity}`,
        `requiredFinish:${requiredFinish}`,
        `visualIdentity:${requiredFinish}`,
        targetSku ? `shopifySku:${targetSku}` : "",
        targetProduct.graceSku ? `graceSku:${targetProduct.graceSku}` : "",
        targetWebsiteSku ? `websiteSku:${targetWebsiteSku}` : "",
        targetSku ? `sku:${targetSku}` : "",
      ].filter(Boolean);

      setBulkShopifyOpen(false);
      navigate(`/darkroom?prompt=${encodeURIComponent(prompt)}`, {
        state: {
          productImage: image
            ? {
                url: image.image_url,
                name: `${targetSku || row.imageId} layout reference`,
              }
            : {
                url: row.imageUrl,
                name: `${targetSku || row.imageId} layout reference`,
              },
          extraLibraryTags,
          generationMode: "missing-variant-asset",
        },
      });

      toast({
        title: "Missing variant asset queued",
        description: "Dark Room is loaded target-SKU-first. The reference is only for layout and bottle geometry.",
      });
    },
    [images, navigate, toast],
  );

  const handleBulkShopifyPublish = async () => {
    const rowsToPublish = bulkShopifyRows
      .map((row) => ({
        ...row,
        sku: row.sku.trim(),
        websiteSku: row.websiteSku.trim(),
        graceSku: row.graceSku.trim(),
        expectedCapColor: row.expectedCapColor.trim(),
        manualVisualIdentityApproval: {
          visualFinish: row.manualVisualIdentityApproval.visualFinish.trim(),
          capHeight: row.manualVisualIdentityApproval.capHeight.trim(),
          confirmed: row.manualVisualIdentityApproval.confirmed,
          reviewedAt: row.manualVisualIdentityApproval.reviewedAt,
          reviewedBy: row.manualVisualIdentityApproval.reviewedBy ?? user?.email ?? user?.id ?? null,
          reason:
            row.manualVisualIdentityApproval.reason ||
            "User confirmed visual identity despite resolver low confidence",
          notes: row.manualVisualIdentityApproval.notes.trim(),
        },
      }))
      .filter((row) => row.sku);
    if (rowsToPublish.length === 0) return;

    const unsafeRow = isBestBottlesOrg
      ? rowsToPublish.find((row) => !canPublishBulkShopifyRow(row))
      : null;
    if (unsafeRow) {
      const product = getBulkShopifyRowProduct(unsafeRow);
      const manualReviewable = isBulkShopifyRowManualReviewable(unsafeRow, product);
      toast({
        title: "Visual identity confirmation required",
        description:
          (manualReviewable
            ? "Confirm the visual finish and cap height, and make sure the selected finish matches the SKU before pushing."
            : getBestBottlesFinishConflict(unsafeRow.expectedCapColor, product)) ||
          `Declare the image visual identity before pushing to this variant.`,
        variant: "destructive",
      });
      return;
    }

    setBulkShopifyLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("push-shopify-product-images", {
        body: {
          organizationId: currentOrganizationId,
          items: rowsToPublish.map((row) => ({
            imageId: row.imageId,
            imageUrl: row.imageUrl,
            sku: row.sku,
            websiteSku: row.websiteSku || undefined,
            graceSku: row.graceSku || undefined,
            expectedCapColor: row.expectedCapColor || row.manualVisualIdentityApproval.visualFinish || undefined,
            manualVisualIdentityApproval: isManualVisualIdentityApproved(row.manualVisualIdentityApproval)
              ? row.manualVisualIdentityApproval
              : undefined,
            altText: row.label,
          })),
          attachToVariant: true,
          syncBestBottlesConvex: isBestBottlesOrg,
          enforceBestBottlesFinishMatch: isBestBottlesOrg,
        },
      });

      if (error) throw new Error(await extractFunctionErrorMessage(error, "Shopify image publish failed"));
      if (data?.error) throw new Error(data.error);

      const successCount = Number(data?.successCount ?? 0);
      const failedCount = Number(data?.failedCount ?? 0);
      const firstFailure = Array.isArray(data?.results)
        ? data.results.find((result: { status?: string }) => result.status === "failed")
        : null;

      if (failedCount > 0) {
        toast({
          title: "Shopify batch partially updated",
          description:
            firstFailure?.message ??
            `${successCount} image${successCount === 1 ? "" : "s"} pushed; ${failedCount} failed.`,
          variant: "destructive",
        });
        return;
      }

      if (isBestBottlesOrg) {
        await markBestBottlesSkuJobsFromShopifyResults(currentOrganizationId, data?.results);
      }

      toast({
        title: "Shopify batch updated",
        description: isBestBottlesOrg
          ? `${successCount} image${successCount === 1 ? "" : "s"} added to Shopify and linked to Best Bottles PDP fields.`
          : `${successCount} image${successCount === 1 ? "" : "s"} added to Shopify product media and matched variants.`,
      });
      setBulkShopifyOpen(false);
      setBulkShopifyRows([]);
      setSelectedImages(new Set());
    } catch (e: unknown) {
      const rawMessage = await extractFunctionErrorMessage(e, "Unable to publish Shopify batch");
      const message = /failed to send|functions\/v1|edge function|net::err_failed/i.test(rawMessage)
        ? isBestBottlesOrg
          ? "Madison could not reach the Shopify image publish function. Deploy push-shopify-product-images and confirm Shopify, Best Bottles Convex, and Supabase secrets, then try again."
          : "Madison could not reach the Shopify image publish function. Deploy push-shopify-product-images and confirm Shopify/Supabase secrets, then try again."
        : rawMessage;
      toast({ title: "Shopify publish failed", description: message, variant: "destructive" });
    } finally {
      setBulkShopifyLoading(false);
    }
  };

  const toggleImageSelection = (imageId: string) => {
    setSelectedImages((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(imageId)) {
        newSet.delete(imageId);
      } else {
        newSet.add(imageId);
      }
      return newSet;
    });
  };

  const selectFilteredImages = () => {
    if (filteredImages.length === 0) return;
    setSelectedImages((prev) => {
      const next = new Set(prev);
      for (const image of filteredImages) next.add(image.id);
      return next;
    });
    toast({
      title: "Filtered images selected",
      description: `${filteredImages.length} image${filteredImages.length === 1 ? "" : "s"} selected from the current view.`,
    });
  };

  const selectShopifyReadyFilteredImages = () => {
    const shopifyReadyImages = filteredImages.filter((image) => {
      const shopifySku = resolveShopifySku(image);
      const graceSku = detectGraceSku(image);
      const websiteSku = detectWebsiteSku(image);
      return Boolean(shopifySku || graceSku || websiteSku);
    });

    if (shopifyReadyImages.length === 0) {
      toast({
        title: "No SKU-ready images in view",
        description: "Try selecting a bottle family or searching for SKU-tagged product images.",
        variant: "destructive",
      });
      return;
    }

    setSelectedImages((prev) => {
      const next = new Set(prev);
      for (const image of shopifyReadyImages) next.add(image.id);
      return next;
    });
    toast({
      title: "SKU-ready images selected",
      description: `${shopifyReadyImages.length} image${shopifyReadyImages.length === 1 ? "" : "s"} selected for Shopify review.`,
    });
  };

  const clearFilteredSelection = () => {
    if (filteredImages.length === 0 || selectedImages.size === 0) return;
    const filteredIds = new Set(filteredImages.map((image) => image.id));
    setSelectedImages((prev) => {
      const next = new Set(prev);
      for (const id of filteredIds) next.delete(id);
      return next;
    });
  };

  const openHeroAssign = (image: GeneratedImage) => {
    setHeroAssignImage(image);
    setHeroAssignProduct(null);
    setHeroAssignOpen(true);
  };

  const openTagsEdit = (image: GeneratedImage) => {
    setTagsEditImage(image);
    setNewLibraryTag("");
    setTagsEditOpen(true);
  };

  const openSanityPublish = (image: GeneratedImage) => {
    const resolvedWebsiteSku = isBestBottlesOrg ? resolveBestBottlesWebsiteSku(image) : "";
    const resolvedGroupSlug = isBestBottlesOrg
      ? resolveBestBottlesProductGroupSlug(image) || detectProductGroupSlug(image)
      : "";
    const bestBottlesDestination: PublishDestination = resolvedGroupSlug
      ? "best-bottles-grid"
      : resolvedWebsiteSku
        ? "best-bottles-pdp"
        : "best-bottles-grid";

    setSanityPublishImage(image);
    setSanityPublishProduct(null);
    setPublishDestination(isBestBottlesOrg ? bestBottlesDestination : "tarife-sanity");
    setBestBottlesSlug(bestBottlesDestination === "best-bottles-grid" ? resolvedGroupSlug : "");
    setBestBottlesWebsiteSku(bestBottlesDestination === "best-bottles-pdp" ? resolvedWebsiteSku : "");
    setBestBottlesPdpMode("cap-on");
    setBestBottlesGroupSearch("");
    setBestBottlesSkuSearch("");
    setSanityPublishOpen(true);
  };

  const handleConfirmSanityPublish = async () => {
    if (!sanityPublishImage) return;
    if (publishDestination === "best-bottles-grid") {
      const slug = resolveEnteredBestBottlesGroupSlug(bestBottlesSlug);
      if (!slug) return;
    } else if (publishDestination === "best-bottles-pdp") {
      const websiteSkus = splitWebsiteSkus(bestBottlesWebsiteSku);
      if (websiteSkus.length === 0) return;
      const productGroupSlug = websiteSkus
        .map((sku) => normalizeBestBottlesSlug(sku))
        .find(
          (slug) =>
            bestBottlesProductGroupsBySlug.has(slug) ||
            looksLikeBestBottlesProductGroupSlug(slug),
        );
      if (productGroupSlug) {
        toast({
          title: "Use the product group hero route",
          description: `${productGroupSlug} is a product group slug, not a variant SKU. Switch the destination to Best Bottles product group hero or pick a variant SKU.`,
          variant: "destructive",
        });
        return;
      }
    } else if (!sanityPublishProduct) {
      return;
    }

    setSanityPublishLoading(true);
    try {
      if (publishDestination === "best-bottles-grid") {
        const slug = resolveEnteredBestBottlesGroupSlug(bestBottlesSlug);
        const { data, error } = await supabase.functions.invoke("push-bestbottles-grid-hero", {
          body: {
            organizationId: currentOrganizationId,
            imageUrl: sanityPublishImage.image_url,
            slug,
          },
        });
        if (error) throw new Error(await extractFunctionErrorMessage(error, "Best Bottles catalog update failed"));
        if (data?.error) throw new Error(data.error);

        await markBestBottlesSkuJobsFromShopifyResults(currentOrganizationId, data?.forwarded?.results);
        await reconcileBestBottlesPublish({
          organizationId: currentOrganizationId,
          productGroupSlug: data?.slug ?? slug,
        });

        toast({
          title: "Best Bottles Shopify hero updated",
          description: `Product group "${data?.slug ?? slug}" now uses Shopify media and has been reconciled to Convex.`,
        });
      } else if (publishDestination === "best-bottles-pdp") {
        const websiteSkus = splitWebsiteSkus(bestBottlesWebsiteSku);
        const { data, error } = await supabase.functions.invoke("push-shopify-product-images", {
          body: {
            organizationId: currentOrganizationId,
            items: websiteSkus.map((websiteSku) => ({
              imageId: sanityPublishImage.id,
              imageUrl: sanityPublishImage.image_url,
              sku: websiteSku,
              altText: sanityPublishImage.session_name || sanityPublishImage.final_prompt || websiteSku,
              mode: getBestBottlesPdpModeForWebsiteSku(websiteSku, bestBottlesPdpMode),
            })),
            attachToVariant: true,
            syncBestBottlesConvex: true,
          },
        });
        if (error) throw new Error(await extractFunctionErrorMessage(error, "Best Bottles PDP update failed"));
        if (data?.error) throw new Error(data.error);
        const failedCount = Number(data?.failedCount ?? 0);
        if (failedCount > 0) {
          const firstFailure = Array.isArray(data?.results)
            ? data.results.find((result: { status?: string }) => result.status === "failed")
            : null;
          throw new Error(firstFailure?.message ?? `${failedCount} SKU${failedCount === 1 ? "" : "s"} failed.`);
        }

        await markBestBottlesSkuJobsFromShopifyResults(currentOrganizationId, data?.results);
        await reconcileBestBottlesPublish({
          organizationId: currentOrganizationId,
          skus: websiteSkus,
        });

        toast({
          title: "Best Bottles PDP updated",
          description:
            websiteSkus.length === 1
              ? `${websiteSkus[0]} ${getBestBottlesPdpModeForWebsiteSku(websiteSkus[0], bestBottlesPdpMode)} now points to Shopify and has been reconciled to Convex.`
              : `${websiteSkus.length} SKUs now point to Shopify images and have been reconciled to Convex.`,
        });
      } else {
        const { data, error } = await supabase.functions.invoke("push-product-to-sanity", {
          body: {
            productId: sanityPublishProduct!.id,
            publish: true,
            libraryImageUrl: sanityPublishImage.image_url,
          },
        });
        if (error) throw new Error(await extractFunctionErrorMessage(error, "Sanity publish failed"));
        if (data?.error) throw new Error(data.error);

        toast({
          title: "Published to Sanity",
          description:
            "This render was uploaded to Sanity and set as the product main image (when a matching Sanity product was found).",
        });
      }

      setSanityPublishOpen(false);
      setSanityPublishImage(null);
      setSanityPublishProduct(null);
      setPublishDestination("tarife-sanity");
      setBestBottlesSlug("");
      setBestBottlesWebsiteSku("");
      setBestBottlesPdpMode("cap-on");
      setBestBottlesGroupSearch("");
      setBestBottlesSkuSearch("");
    } catch (e: unknown) {
      const rawMessage = await extractFunctionErrorMessage(e, "Unable to publish");
      const message =
        publishDestination === "best-bottles-pdp" &&
        /failed to send|functions\/v1|edge function|net::err_failed/i.test(rawMessage)
          ? "Madison could not reach the Shopify image publish function. Deploy push-shopify-product-images and confirm Shopify, Best Bottles Convex, and Supabase secrets, then try again."
          : rawMessage;
      toast({ title: "Publish failed", description: message, variant: "destructive" });
    } finally {
      setSanityPublishLoading(false);
    }
  };

  const handleConfirmHeroAssign = () => {
    if (!heroAssignImage || !heroAssignProduct) return;
    updateProduct.mutate(
      {
        id: heroAssignProduct.id,
        hero_image_external_url: heroAssignImage.image_url,
        hero_image_id: null,
      },
      {
        onSuccess: () => {
          setHeroAssignOpen(false);
          setHeroAssignImage(null);
          setHeroAssignProduct(null);
        },
      },
    );
  };

  const handleAddLibraryTag = async () => {
    const raw = newLibraryTag.trim();
    if (!raw || !tagsEditImage) return;
    setTagActionLoading(true);
    const next = await addLibraryTag(tagsEditImage.id, raw);
    setTagActionLoading(false);
    if (next) {
      setNewLibraryTag("");
      setTagsEditImage((prev) => (prev ? { ...prev, library_tags: next } : null));
      await refetch();
    } else {
      toast({ title: "Could not add tag", description: "Check your connection or permissions.", variant: "destructive" });
    }
  };

  const handleRemoveLibraryTag = async (tag: string) => {
    if (!tagsEditImage) return;
    setTagActionLoading(true);
    const next = await removeLibraryTag(tagsEditImage.id, tag);
    setTagActionLoading(false);
    if (next) {
      setTagsEditImage((prev) => (prev ? { ...prev, library_tags: next } : null));
      await refetch();
    } else {
      toast({ title: "Could not remove tag", variant: "destructive" });
    }
  };

  const getCategoryBadgeColor = (category: string | null) => {
    switch (category?.toLowerCase()) {
      case "product":
        return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "lifestyle":
        return "bg-green-500/20 text-green-400 border-green-500/30";
      case "ecommerce":
        return "bg-purple-500/20 text-purple-400 border-purple-500/30";
      case "social":
        return "bg-pink-500/20 text-pink-400 border-pink-500/30";
      case "editorial":
        return "bg-amber-500/20 text-amber-400 border-amber-500/30";
      default:
        return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    }
  };

  const getBestBottlesSyncBadge = (image: GeneratedImage) => {
    if (!isBestBottlesOrg) return null;
    const job = resolvePipelineSkuJobForImage(image);
    const detectedSku = detectShopifySku(image) || detectGraceSku(image) || detectWebsiteSku(image);
    if (!job && !detectedSku) return null;

    if (job?.status === "synced" || job?.convex_synced_at) {
      return {
        label: "Convex synced",
        title: `${job.website_sku || job.grace_sku} has a Convex cached Shopify image URL.`,
        className: "border-emerald-400/50 bg-emerald-500/15 text-emerald-300",
      };
    }

    if (
      job?.status === "shopify-pushed" ||
      job?.shopify_pushed_at ||
      job?.shopify_image_url ||
      job?.shopify_media_id
    ) {
      return {
        label: "Shopify pushed",
        title: `${job.website_sku || job.grace_sku} has Shopify media but is not fully Convex synced yet.`,
        className: "border-[#95BF47]/60 bg-[#95BF47]/15 text-[#BFEA73]",
      };
    }

    if (job) {
      return {
        label: "Pipeline tracked",
        title: `${job.website_sku || job.grace_sku} exists in the Madison pipeline but has not been pushed to Shopify yet.`,
        className: "border-sky-400/40 bg-sky-500/15 text-sky-300",
      };
    }

    return {
      label: "SKU matched",
      title: `${detectedSku} matches a Best Bottles SKU signal, but no pipeline sync record was found.`,
      className: "border-[var(--darkroom-border)] bg-black/35 text-[var(--darkroom-text)]/75",
    };
  };

  const selectedFilteredCount = filteredImages.reduce(
    (count, image) => count + (selectedImages.has(image.id) ? 1 : 0),
    0,
  );

  return (
    <div className="min-h-screen bg-[var(--darkroom-bg)]">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[var(--darkroom-bg)]/95 backdrop-blur-sm border-b border-[var(--darkroom-border)]">
        <div className="container mx-auto px-4 md:px-6 py-4 md:py-6 space-y-4 md:space-y-5">
          {/* Title Row */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h1 className="font-serif text-2xl md:text-3xl text-[var(--darkroom-text)]">Image Library</h1>
              <p className="text-xs md:text-sm text-[var(--darkroom-text)]/60 mt-1">
                {filteredImages.length} {filteredImages.length === 1 ? "image" : "images"}
              </p>
            </div>
            <Button
              onClick={() => navigate("/darkroom")}
              className="bg-[var(--darkroom-accent)] hover:bg-[var(--darkroom-accent-hover)] text-[var(--darkroom-bg)] flex-shrink-0"
              size="sm"
            >
              <Camera className="w-4 h-4 md:mr-2" />
              <span className="hidden md:inline">Create New</span>
            </Button>
          </div>

          {/* Search Bar - Full Width */}
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-[var(--darkroom-text)]/40 transition-colors group-focus-within:text-[var(--darkroom-accent)]" />
              <Input
              placeholder="Search images..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 md:pl-10 py-2 md:py-2.5 text-sm md:text-base bg-[var(--darkroom-surface)] border-[var(--darkroom-border)] text-[var(--darkroom-text)] placeholder:text-[var(--darkroom-text)]/40 focus:border-[var(--darkroom-accent)] focus:ring-2 focus:ring-[var(--darkroom-accent)]/20"
              />
            </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--darkroom-text)]/50">
            <span>
              Loaded {images.length.toLocaleString()} image{images.length === 1 ? "" : "s"}
              {" "}from historical library records.
            </span>
            {imageLibraryRowLimit < IMAGE_LIBRARY_MAX_ROWS && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px] text-[var(--darkroom-accent)] hover:bg-[var(--darkroom-accent)]/10"
                onClick={() => setImageLibraryRowLimit(IMAGE_LIBRARY_MAX_ROWS)}
              >
                Load older images
              </Button>
            )}
          </div>

          {/* Filters Row - Mobile: Stack, Desktop: Row */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4">
            {/* Left: Asset type + Sort */}
            <div className="flex items-center gap-2 flex-wrap">
            <Select value={assetTypeFilter} onValueChange={(v) => setAssetTypeFilter(v as AssetTypeFilter)}>
                <SelectTrigger className="w-full md:w-[180px] bg-[var(--darkroom-surface)] border-[var(--darkroom-border)] text-[var(--darkroom-text)] text-sm">
                <SelectValue placeholder="Asset type" />
              </SelectTrigger>
              <SelectContent className="bg-[var(--darkroom-surface)] border-[var(--darkroom-border)]">
                <SelectItem value="all" className="text-[var(--darkroom-text)]">All assets</SelectItem>
                <SelectItem value="product" className="text-[var(--darkroom-text)]">Product images</SelectItem>
                <SelectItem value="product-photography" className="text-[var(--darkroom-text)]">Product photography</SelectItem>
                <SelectItem value="lifestyle" className="text-[var(--darkroom-text)]">Lifestyle / editorial</SelectItem>
                <SelectItem value="background" className="text-[var(--darkroom-text)]">Background scenes</SelectItem>
                <SelectItem value="style" className="text-[var(--darkroom-text)]">Style references</SelectItem>
                <SelectItem value="empty-plates" className="text-[var(--darkroom-text)]">Empty plates</SelectItem>
                <SelectItem value="roll-ons" className="text-[var(--darkroom-text)]">Roll-ons (pilot)</SelectItem>
              </SelectContent>
            </Select>

            {isBestBottlesOrg && (
              <Select value={skuSizeFilter} onValueChange={(v) => setSkuSizeFilter(v as SkuSizeFilter)}>
                <SelectTrigger className="w-full md:w-[140px] bg-[var(--darkroom-surface)] border-[var(--darkroom-border)] text-[var(--darkroom-text)] text-sm">
                  <SelectValue placeholder="SKU size" />
                </SelectTrigger>
                <SelectContent className="bg-[var(--darkroom-surface)] border-[var(--darkroom-border)]">
                  <SelectItem value="all" className="text-[var(--darkroom-text)]">All sizes</SelectItem>
                  {skuSizeOptions.map((capacityMl) => (
                    <SelectItem
                      key={capacityMl}
                      value={String(capacityMl)}
                      className="text-[var(--darkroom-text)]"
                    >
                      {capacityMl} mL
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                <SelectTrigger className="w-full md:w-[130px] bg-[var(--darkroom-surface)] border-[var(--darkroom-border)] text-[var(--darkroom-text)] text-sm">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent className="bg-[var(--darkroom-surface)] border-[var(--darkroom-border)]">
                <SelectItem value="recent" className="text-[var(--darkroom-text)]">Most Recent</SelectItem>
                <SelectItem value="oldest" className="text-[var(--darkroom-text)]">Oldest First</SelectItem>
                <SelectItem value="category" className="text-[var(--darkroom-text)]">By Category</SelectItem>
              </SelectContent>
            </Select>
            </div>

            {/* Right: View Mode + Bulk Actions */}
            <div className="flex items-center gap-2 md:gap-3">
              {filteredImages.length > 0 && (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={selectFilteredImages}
                    className="h-8 border-[var(--darkroom-border)] text-[var(--darkroom-text)]/75 hover:bg-[var(--darkroom-surface)] text-xs"
                  >
                    <CheckCircle2 className="w-3 h-3 md:mr-1" />
                    <span className="hidden md:inline">Select filtered</span>
                    <span className="md:hidden">Select</span>
                  </Button>
                  {isBestBottlesOrg && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={selectShopifyReadyFilteredImages}
                      className="h-8 border-[#95BF47]/70 text-[#95BF47] hover:bg-[#95BF47]/10 text-xs"
                    >
                      <ShoppingBag className="w-3 h-3 md:mr-1" />
                      <span className="hidden lg:inline">Select SKU-ready</span>
                      <span className="lg:hidden">SKU-ready</span>
                    </Button>
                  )}
                  {selectedFilteredCount > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={clearFilteredSelection}
                      className="h-8 px-2 text-xs text-[var(--darkroom-text)]/50 hover:bg-[var(--darkroom-surface)]"
                    >
                      Clear view
                    </Button>
                  )}
                </div>
              )}

              {/* View Mode Toggle */}
              <div className="flex items-center bg-[var(--darkroom-surface)] border border-[var(--darkroom-border)] rounded-lg p-0.5">
              <button
                onClick={() => setViewMode("grid")}
                className={cn(
                    "h-8 w-8 flex items-center justify-center rounded-md transition-colors",
                  viewMode === "grid"
                    ? "bg-[var(--darkroom-accent)]/20 text-[var(--darkroom-accent)]"
                    : "text-[var(--darkroom-text)]/60 hover:text-[var(--darkroom-text)]"
                )}
              >
                <Grid3X3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("masonry")}
                className={cn(
                    "h-8 w-8 flex items-center justify-center rounded-md transition-colors",
                  viewMode === "masonry"
                    ? "bg-[var(--darkroom-accent)]/20 text-[var(--darkroom-accent)]"
                    : "text-[var(--darkroom-text)]/60 hover:text-[var(--darkroom-text)]"
                )}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>

              {/* Bulk Actions */}
              {selectedImages.size > 0 && (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Badge variant="outline" className="border-[var(--darkroom-accent)] text-[var(--darkroom-accent)] text-xs">
                    {selectedImages.size}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedImages(new Set())}
                    className="border-[var(--darkroom-border)] text-[var(--darkroom-text)]/60 h-8 w-8 p-0"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                  {isBestBottlesOrg && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={openBulkBestBottlesPublish}
                      title="Push selected images to Shopify product media and link Best Bottles PDP image fields"
                      className="border-[var(--darkroom-accent)] text-[var(--darkroom-accent)] hover:bg-[var(--darkroom-accent)]/10 h-8 text-xs"
                    >
                      <Upload className="w-3 h-3 md:mr-1" />
                      <span className="hidden md:inline">Push Best Bottles PDP</span>
                      <span className="md:hidden">Push</span>
                    </Button>
                  )}
                  <Button
                    variant="default"
                    size="sm"
                    onClick={openBulkShopifyPublish}
                    title="Push selected images directly to Shopify product media and attach them by variant SKU"
                    className="border border-[#95BF47] bg-[#95BF47] text-[#0B1F0A] hover:bg-[#A7D65A] h-8 text-xs font-semibold shadow-[0_0_0_1px_rgba(149,191,71,0.25)]"
                  >
                    <ShoppingBag className="w-3 h-3 md:mr-1" />
                    <span className="hidden md:inline">Push to Shopify</span>
                    <span className="hidden xl:inline ml-1 opacity-75">variants</span>
                    <span className="md:hidden">Shopify</span>
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleBulkArchive}
                    className="h-8 text-xs"
                  >
                    <Trash2 className="w-3 h-3 md:mr-1" />
                    <span className="hidden md:inline">Archive</span>
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 md:px-6 py-4 md:py-8 pb-24 md:pb-8">
        <div className={cn(isBestBottlesOrg && "grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]")}>
          {isBestBottlesOrg && (
            <BestBottlesFamilyRail
              options={bestBottlesFamilyOptions}
              activeFamily={bestBottlesFamilyFilter}
              totalCount={familyRailImages.length}
              filteredCount={filteredImages.length}
              isLoading={bestBottlesProductsLoading}
              onSelect={setBestBottlesFamilyFilter}
            />
          )}
          <div className="min-w-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 md:py-20">
            <MagicWand02 className="w-6 h-6 md:w-8 md:h-8 text-[var(--darkroom-accent)] animate-pulse" />
          </div>
        ) : filteredImages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 md:py-20 text-center px-4">
            <Camera className="w-12 h-12 md:w-16 md:h-16 text-[var(--darkroom-text)]/20 mb-4" />
            <h3 className="text-lg md:text-xl font-serif text-[var(--darkroom-text)] mb-2">No images yet</h3>
            <p className="text-sm md:text-base text-[var(--darkroom-text)]/60 mb-6 max-w-md">
              {searchQuery || assetTypeFilter !== "all"
                ? assetTypeFilter === "empty-plates"
                  ? "No empty plates match these filters. Turn on Background plate mode in Dark Room to create empty scenes, or widen your search."
                  : "No images match your filters. Try adjusting your search or asset type."
                : "Start creating stunning product images in the Dark Room."}
            </p>
            <Button
              onClick={() => navigate("/darkroom")}
              className="bg-[var(--darkroom-accent)] hover:bg-[var(--darkroom-accent-hover)] text-[var(--darkroom-bg)]"
              size="sm"
            >
              <Camera className="w-4 h-4 mr-2" />
              Go to Dark Room
            </Button>
          </div>
        ) : (
          <div
            className={cn(
              "grid gap-3 md:gap-4",
              viewMode === "grid"
                ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
                : "columns-2 sm:columns-3 md:columns-3 lg:columns-4 xl:columns-5 space-y-3 md:space-y-4"
            )}
          >
            <AnimatePresence mode="popLayout">
              {filteredImages.map((image) => (
                <motion.div
                  key={image.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className={cn(
                    "group relative rounded-lg overflow-hidden bg-[var(--darkroom-surface)] border border-[var(--darkroom-border)]",
                    "hover:border-[var(--darkroom-accent)]/50 transition-all cursor-pointer",
                    selectedImages.has(image.id) && "ring-2 ring-[var(--darkroom-accent)]",
                    viewMode === "masonry" && "break-inside-avoid mb-4"
                  )}
                  onClick={() => handleImageClick(image)}
                >
                  {/* Image */}
                  <div className={cn(
                    "relative",
                    viewMode === "grid" && "aspect-square"
                  )}>
                    <img
                      src={image.image_url}
                      alt={image.session_name || "Generated image"}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />

                    {/* Selection Checkbox */}
                    <div
                      className={cn(
                        "absolute top-2 left-2 w-6 h-6 md:w-6 md:h-6 rounded border-2 flex items-center justify-center transition-all touch-manipulation z-10",
                        selectedImages.has(image.id)
                          ? "bg-[var(--darkroom-accent)] border-[var(--darkroom-accent)] opacity-100"
                          : "bg-black/40 border-white/40 opacity-100 md:opacity-0 md:group-hover:opacity-100"
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleImageSelection(image.id);
                      }}
                    >
                      {selectedImages.has(image.id) && (
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>

                    {/* Actions Menu */}
                    <div className="absolute top-2 right-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity z-10">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 bg-black/40 hover:bg-black/60"
                          >
                            <MoreVertical className="w-4 h-4 text-white" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-[var(--darkroom-surface)] border-[var(--darkroom-border)]">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleImageClick(image);
                            }}
                            className="text-[var(--darkroom-text)] focus:bg-[var(--darkroom-border)]"
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            View & Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(image);
                            }}
                            className="text-[var(--darkroom-text)] focus:bg-[var(--darkroom-border)]"
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Download
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              openHeroAssign(image);
                            }}
                            className="text-[var(--darkroom-text)] focus:bg-[var(--darkroom-border)]"
                          >
                            <Package className="w-4 h-4 mr-2" />
                            Set Product Hub thumbnail
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              openSanityPublish(image);
                            }}
                            className="text-[var(--darkroom-text)] focus:bg-[var(--darkroom-border)]"
                          >
                            <Upload className="w-4 h-4 mr-2" />
                            {publishLabel}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              openTagsEdit(image);
                            }}
                            className="text-[var(--darkroom-text)] focus:bg-[var(--darkroom-border)]"
                          >
                            <Tags className="w-4 h-4 mr-2" />
                            Edit library tags
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleArchive(image.id);
                            }}
                            className="text-red-400 focus:bg-[var(--darkroom-border)]"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Archive
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Category Badge - use goal_type for display */}
                    <div className="absolute bottom-2 left-2 right-2 flex flex-wrap gap-1 items-end">
                    {image.goal_type && (
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs capitalize",
                            getCategoryBadgeColor(image.goal_type)
                          )}
                        >
                          {image.goal_type.replace(/_/g, ' ')}
                        </Badge>
                    )}
                    {(image.library_tags ?? [])
                      .filter((t) => t.startsWith("sku:"))
                      .slice(0, 2)
                      .map((t) => (
                        <Badge
                          key={t}
                          variant="outline"
                          className="text-[10px] border-[var(--darkroom-accent)]/40 text-[var(--darkroom-accent)] max-w-[120px] truncate"
                          title={t}
                        >
                          {t.replace(/^sku:/, "")}
                        </Badge>
                      ))}
                    {(() => {
                      const syncBadge = getBestBottlesSyncBadge(image);
                      if (!syncBadge) return null;
                      return (
                        <Badge
                          variant="outline"
                          className={cn("text-[10px]", syncBadge.className)}
                          title={syncBadge.title}
                        >
                          {syncBadge.label}
                        </Badge>
                      );
                    })()}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
          </div>
        </div>
      </div>

      <Dialog
        open={heroAssignOpen}
        onOpenChange={(open) => {
          setHeroAssignOpen(open);
          if (!open) {
            setHeroAssignImage(null);
            setHeroAssignProduct(null);
          }
        }}
      >
        <DialogContent className="bg-[var(--darkroom-surface)] border-[var(--darkroom-border)] text-[var(--darkroom-text)] max-w-md">
          <DialogHeader>
            <DialogTitle>Set Product Hub thumbnail</DialogTitle>
            <DialogDescription className="text-[var(--darkroom-text)]/70">
              Uses this library image as the product hero (external URL). Any DAM hero link on that product is cleared so the grid thumbnail matches your pick.
            </DialogDescription>
          </DialogHeader>
          {heroAssignImage && (
            <div className="flex gap-3 items-center">
              <img
                src={heroAssignImage.image_url}
                alt=""
                className="w-20 h-20 rounded-md object-cover border border-[var(--darkroom-border)] shrink-0"
              />
              <p className="text-xs text-[var(--darkroom-text)]/60 line-clamp-4">
                {(heroAssignImage.library_tags ?? []).length > 0
                  ? (heroAssignImage.library_tags ?? []).join(" · ")
                  : "No library tags yet — add sku:… in Edit library tags to track this render."}
              </p>
            </div>
          )}
          <div className="space-y-2">
            <ProductSelector
              value={heroAssignProduct?.name ?? ""}
              onSelect={setHeroAssignProduct}
              showLabel={false}
              buttonClassName="w-full justify-between bg-[var(--darkroom-surface)] border-[var(--darkroom-border)] text-[var(--darkroom-text)]"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              className="border-[var(--darkroom-border)] text-[var(--darkroom-text)]"
              onClick={() => {
                setHeroAssignOpen(false);
                setHeroAssignImage(null);
                setHeroAssignProduct(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-[var(--darkroom-accent)] hover:bg-[var(--darkroom-accent-hover)] text-[var(--darkroom-bg)]"
              disabled={!heroAssignProduct || updateProduct.isPending}
              onClick={handleConfirmHeroAssign}
            >
              {updateProduct.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving…
                </>
              ) : (
                "Apply thumbnail"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={bulkBestBottlesOpen}
        onOpenChange={(open) => {
          setBulkBestBottlesOpen(open);
          if (!open) {
            setBulkBestBottlesRows([]);
            setBulkBestBottlesMode("cap-on");
          }
        }}
      >
        <DialogContent className="bg-[var(--darkroom-surface)] border-[var(--darkroom-border)] text-[var(--darkroom-text)] max-w-3xl">
          <DialogHeader>
            <DialogTitle>Push selected images to Best Bottles PDP</DialogTitle>
            <DialogDescription className="text-[var(--darkroom-text)]/70">
              Confirm the Best Bottles Website SKU or Grace SKU for each selected Library image. Each
              image uploads to Shopify product media, attaches to the matched variant, then updates
              the matching Convex product image field.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="bulk-bb-mode" className="text-[var(--darkroom-text)]">
              Product image slot for this batch
            </Label>
            {bulkBestBottlesPrimaryOnly ? (
              <div
                id="bulk-bb-mode"
                className="rounded-md border border-[var(--darkroom-border)] bg-[var(--darkroom-bg)] px-3 py-2 text-sm text-[var(--darkroom-text)]"
              >
                Main product image only
              </div>
            ) : (
              <Select
                value={bulkBestBottlesMode}
                onValueChange={(value) => setBulkBestBottlesMode(value as BestBottlesPdpMode)}
              >
                <SelectTrigger
                  id="bulk-bb-mode"
                  className="bg-[var(--darkroom-bg)] border-[var(--darkroom-border)] text-[var(--darkroom-text)]"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cap-on">Main product image / cap or top on</SelectItem>
                  <SelectItem value="cap-off">Secondary image / cap or top off</SelectItem>
                </SelectContent>
              </Select>
            )}
            {bulkBestBottlesHasPrimaryOnly && (
              <p className="text-[11px] text-[var(--darkroom-text)]/50">
                Empire vintage bulb sprayer rows publish to the main PDP image only.
              </p>
            )}
          </div>

          <div className="max-h-[52vh] overflow-y-auto overscroll-contain pr-1 space-y-2">
            {bulkBestBottlesRows.map((row, index) => (
              <div
                key={row.imageId}
                className="grid grid-cols-[56px_1fr] md:grid-cols-[64px_1fr_260px] gap-3 rounded-md border border-[var(--darkroom-border)] bg-[var(--darkroom-bg)]/50 p-2"
              >
                <img
                  src={row.imageUrl}
                  alt=""
                  className="h-14 w-14 md:h-16 md:w-16 rounded object-cover border border-[var(--darkroom-border)]"
                />
                <div className="min-w-0 self-center">
                  <div className="text-xs text-[var(--darkroom-text)]/50">Image {index + 1}</div>
                  <div className="truncate text-sm text-[var(--darkroom-text)]">{row.label}</div>
                </div>
                <div className="col-span-2 md:col-span-1 space-y-1">
                  <Label
                    htmlFor={`bulk-bb-sku-${row.imageId}`}
                    className="text-[11px] text-[var(--darkroom-text)]/70"
                  >
                    Website SKU or Grace SKU
                  </Label>
                  <Input
                    id={`bulk-bb-sku-${row.imageId}`}
                    value={row.websiteSku}
                    onChange={(e) => updateBulkBestBottlesSku(row.imageId, e.target.value)}
                    placeholder="e.g. GBEmp50AnSpTslRed"
                    className="bg-[var(--darkroom-surface)] border-[var(--darkroom-border)] text-[var(--darkroom-text)] font-mono text-xs"
                  />
                </div>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-[var(--darkroom-text)]/50">
            Rows without a variant SKU are skipped. Hero and thumbnail pushes use group slugs;
            PDP product images must target the exact variant SKU.
          </p>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              className="border-[var(--darkroom-border)] text-[var(--darkroom-text)]"
              onClick={() => {
                setBulkBestBottlesOpen(false);
                setBulkBestBottlesRows([]);
                setBulkBestBottlesMode("cap-on");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-[var(--darkroom-accent)] hover:bg-[var(--darkroom-accent-hover)] text-[var(--darkroom-bg)]"
              disabled={
                bulkBestBottlesLoading ||
                bulkBestBottlesRows.every((row) => !row.websiteSku.trim())
              }
              onClick={() => void handleBulkBestBottlesPublish()}
            >
              {bulkBestBottlesLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Publishing…
                </>
              ) : (
                "Push batch"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={bulkShopifyOpen}
        onOpenChange={(open) => {
          setBulkShopifyOpen(open);
          if (!open) {
            setBulkShopifyRows([]);
          }
        }}
      >
        <DialogContent className="bg-[var(--darkroom-surface)] border-[var(--darkroom-border)] text-[var(--darkroom-text)] max-w-3xl">
          <DialogHeader>
            <DialogTitle>Push selected images to Shopify variant media</DialogTitle>
            <DialogDescription className="text-[var(--darkroom-text)]/70">
              Direct Shopify publish path. Match each selected image to a Shopify variant by SKU;
              Madison auto-fills from <span className="font-mono">shopifySku:</span> tags,{" "}
              <span className="font-mono">sku:</span> tags, the Best Bottles Grace/website SKU
              crosswalk, or the original filename when it contains a SKU.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[56vh] overflow-y-auto overscroll-contain pr-1 space-y-2">
            {bulkShopifyRows.map((row, index) => {
                const matchedProduct = isBestBottlesOrg
                  ? getBulkShopifyRowProduct(row)
                  : null;
                const visualIdentity = resolveBestBottlesVisualIdentity(matchedProduct);
                const finishConflict = getBestBottlesFinishConflict(row.expectedCapColor, matchedProduct);
                const manualReviewable = isBulkShopifyRowManualReviewable(row, matchedProduct);
                const manuallyApproved = isManualVisualIdentityApproved(row.manualVisualIdentityApproval);
                const manualFinishMatchesSku = manualVisualIdentityMatchesSku(row);
                const approvedForPush = canPublishBulkShopifyRow(row) && Boolean(row.sku.trim());
                const expectedManualFinish = inferExpectedVisualIdentityFromBestBottlesSku(row);
                const needsFinish = Boolean(isBestBottlesOrg && visualIdentity.safeToPush && row.sku.trim() && !row.expectedCapColor.trim());
                const matchingFinishVariant =
                  finishConflict && !manualReviewable
                    ? findMatchingBestBottlesVariantForImageFinish(row)
                    : null;
                return (
                  <div
                    key={row.imageId}
                    className={`grid grid-cols-[56px_1fr] md:grid-cols-[64px_1fr_280px] gap-3 rounded-md border bg-[var(--darkroom-bg)]/50 p-2 ${
                      approvedForPush
                        ? "border-emerald-400/60"
                        : (finishConflict && !manualReviewable) || needsFinish || (manualReviewable && (!manuallyApproved || !manualFinishMatchesSku))
                          ? "border-red-400/60"
                          : "border-[var(--darkroom-border)]"
                    }`}
                  >
                    <img
                      src={row.imageUrl}
                      alt=""
                      className="h-14 w-14 md:h-16 md:w-16 rounded object-cover border border-[var(--darkroom-border)]"
                    />
                    <div className="min-w-0 self-center">
                      <div className="text-xs text-[var(--darkroom-text)]/50">Image {index + 1}</div>
                      <div className="truncate text-sm text-[var(--darkroom-text)]">{row.label}</div>
                      {matchedProduct && (
                        <div className="mt-1 space-y-0.5 text-[10px] text-[var(--darkroom-text)]/55">
                          <div>
                            Resolved visual identity:{" "}
                            <span className="font-semibold text-[var(--darkroom-text)]">
                              {visualIdentity.resolvedVisualIdentity || "Needs review"}
                            </span>
                          </div>
                          {visualIdentity.secondaryVisualAttributes.length > 0 && (
                            <div>Secondary: {visualIdentity.secondaryVisualAttributes.join(", ")}</div>
                          )}
                          <div>
                            Status:{" "}
                            <span className={approvedForPush ? "text-emerald-300" : visualIdentity.safeToPush ? "text-emerald-300" : "text-amber-300"}>
                              {approvedForPush
                                ? manuallyApproved
                                  ? "Approved for push"
                                  : "Safe to push"
                                : "Needs review"}
                            </span>
                            {" · "}
                            <span className="font-mono">{matchedProduct.websiteSku}</span>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="col-span-2 md:col-span-1 space-y-2">
                      <div className="space-y-1">
                        <Label
                          htmlFor={`bulk-shopify-sku-${row.imageId}`}
                          className="text-[11px] text-[var(--darkroom-text)]/70"
                        >
                          Shopify variant / Grace SKU
                        </Label>
                        <Input
                          id={`bulk-shopify-sku-${row.imageId}`}
                          value={row.sku}
                          onChange={(e) => updateBulkShopifySku(row.imageId, e.target.value)}
                          placeholder="e.g. GB-CYL-AMB-9ML-SPR-BLK"
                          className="bg-[var(--darkroom-surface)] border-[var(--darkroom-border)] text-[var(--darkroom-text)] font-mono text-xs"
                        />
                      </div>
                      {isBestBottlesOrg && visualIdentity.resolvedVisualIdentityCanonical && (
                        <div className="space-y-1">
                          <Label className="text-[11px] text-[var(--darkroom-text)]/70">
                            Image visual identity shown
                          </Label>
                          <Select
                            value={row.expectedCapColor || "__unset"}
                            onValueChange={(value) => updateBulkShopifyExpectedCapColor(row.imageId, value === "__unset" ? "" : value)}
                          >
                            <SelectTrigger className="bg-[var(--darkroom-surface)] border-[var(--darkroom-border)] text-[var(--darkroom-text)] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__unset">Choose finish before push</SelectItem>
                              {BEST_BOTTLES_VISUAL_IDENTITY_OPTIONS.map((finish) => (
                                <SelectItem key={finish} value={finish}>{finish}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      {isBestBottlesOrg && matchedProduct && (
                        <div className="rounded border border-[var(--darkroom-border)]/70 bg-black/20 p-2 text-[10px] text-[var(--darkroom-text)]/60">
                          <div>Reason: {visualIdentity.reason}</div>
                          {visualIdentity.blockingWarnings.length > 0 && (
                            <div className="mt-1 text-amber-300">
                              {visualIdentity.blockingWarnings.join(" ")}
                            </div>
                          )}
                        </div>
                      )}
                      {manualReviewable && (
                        <div className="space-y-2 rounded border border-amber-300/50 bg-amber-300/10 p-2">
                          <div className="text-[11px] font-medium text-amber-200">Manual visual identity review</div>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <div className="space-y-1">
                              <Label className="text-[11px] text-[var(--darkroom-text)]/70">
                                Visual finish
                              </Label>
                              <Select
                                value={row.manualVisualIdentityApproval.visualFinish || "__unset"}
                                onValueChange={(value) =>
                                  updateBulkShopifyManualApproval(row.imageId, {
                                    visualFinish: value === "__unset" ? "" : value,
                                    confirmed: false,
                                    reviewedAt: undefined,
                                    reviewedBy: undefined,
                                    reason: undefined,
                                  })
                                }
                              >
                                <SelectTrigger className="bg-[var(--darkroom-surface)] border-[var(--darkroom-border)] text-[var(--darkroom-text)] text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__unset">Choose finish</SelectItem>
                                  {BEST_BOTTLES_VISUAL_IDENTITY_OPTIONS.map((finish) => (
                                    <SelectItem key={finish} value={finish}>{finish}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px] text-[var(--darkroom-text)]/70">
                                Cap height
                              </Label>
                              <Select
                                value={row.manualVisualIdentityApproval.capHeight || "__unset"}
                                onValueChange={(value) =>
                                  updateBulkShopifyManualApproval(row.imageId, {
                                    capHeight: value === "__unset" ? "" : value,
                                    confirmed: false,
                                    reviewedAt: undefined,
                                    reviewedBy: undefined,
                                    reason: undefined,
                                  })
                                }
                              >
                                <SelectTrigger className="bg-[var(--darkroom-surface)] border-[var(--darkroom-border)] text-[var(--darkroom-text)] text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__unset">Choose cap height</SelectItem>
                                  {MANUAL_CAP_HEIGHT_OPTIONS.map((height) => (
                                    <SelectItem key={height} value={height}>{height}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[11px] text-[var(--darkroom-text)]/70">
                              Manual override reason
                            </Label>
                            <Textarea
                              value={row.manualVisualIdentityApproval.notes}
                              onChange={(event) =>
                                updateBulkShopifyManualApproval(row.imageId, { notes: event.target.value })
                              }
                              placeholder="Optional notes"
                              className="min-h-16 bg-[var(--darkroom-surface)] border-[var(--darkroom-border)] text-[var(--darkroom-text)] text-xs"
                            />
                          </div>
                          <label className="flex items-start gap-2 text-[11px] text-[var(--darkroom-text)]/80">
                            <Checkbox
                              checked={row.manualVisualIdentityApproval.confirmed}
                              onCheckedChange={(checked) =>
                                updateBulkShopifyManualApproval(row.imageId, {
                                  confirmed: checked === true,
                                  reviewedAt: checked === true ? new Date().toISOString() : undefined,
                                  reviewedBy: checked === true ? user?.email ?? user?.id ?? null : undefined,
                                  reason:
                                    checked === true
                                      ? "User confirmed visual identity despite resolver low confidence"
                                      : undefined,
                                })
                              }
                              className="mt-0.5"
                            />
                            <span>I reviewed this image and confirm it matches the selected SKU.</span>
                          </label>
                          {manuallyApproved && manualFinishMatchesSku && (
                            <div className="text-[11px] font-medium text-emerald-300">Reviewed manually · Approved for push</div>
                          )}
                          {manuallyApproved && !manualFinishMatchesSku && (
                            <div className="flex items-start gap-1 text-[11px] text-red-300">
                              <AlertTriangle className="mt-0.5 w-3 h-3 shrink-0" />
                              <span>
                                Manual finish does not match the selected SKU
                                {expectedManualFinish ? ` (${expectedManualFinish})` : ""}.
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                      {isBestBottlesOrg && (row.graceSku || row.websiteSku) && (
                        <div className="flex flex-wrap gap-x-2 gap-y-1 text-[10px] text-[var(--darkroom-text)]/45">
                          {row.graceSku && <span>Grace: <span className="font-mono">{row.graceSku}</span></span>}
                          {row.websiteSku && <span>Website: <span className="font-mono">{row.websiteSku}</span></span>}
                        </div>
                      )}
                      {isBestBottlesOrg && !row.graceSku && !row.websiteSku && (
                        <p className="text-[10px] text-amber-200/70">
                          No SKU crosswalk found. For a one-off hero, use Publish live to assign product media instead of variant media.
                        </p>
                      )}
                      {finishConflict && !manualReviewable && (
                        <div className="space-y-2 rounded border border-red-400/45 bg-red-500/10 p-2">
                          <div className="flex items-start gap-1 text-[11px] text-red-200">
                            <AlertTriangle className="mt-0.5 w-3 h-3 shrink-0" />
                            <span>
                              {finishConflict}{" "}
                              {matchingFinishVariant
                                ? "This image appears to belong to a different canonical variant. Switch the target SKU instead of regenerating."
                                : "Keep the SKU and regenerate this image with the required finish."}
                            </span>
                          </div>
                          {visualIdentity.resolvedVisualIdentity && row.expectedCapColor && (
                            <div className="text-[10px] text-[var(--darkroom-text)]/65">
                              Required finish from SKU:{" "}
                              <span className="font-semibold text-[var(--darkroom-text)]">
                                {visualIdentity.resolvedVisualIdentity}
                              </span>
                              {" · "}
                              Current image finish:{" "}
                              <span className="font-semibold text-[var(--darkroom-text)]">
                                {row.expectedCapColor}
                              </span>
                            </div>
                          )}
                          {matchingFinishVariant && (
                            <div className="space-y-2 rounded border border-emerald-400/50 bg-emerald-950/40 p-2">
                              <div className="space-y-1 text-[10px] leading-snug text-emerald-50">
                                <div className="font-semibold text-emerald-200">
                                  Suggested target for {row.expectedCapColor}
                                </div>
                                <div className="break-words font-mono text-emerald-50">
                                  {matchingFinishVariant.graceSku}
                                  {" / "}
                                  {matchingFinishVariant.websiteSku}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  applyBulkShopifyVariantTarget(
                                    row.imageId,
                                    matchingFinishVariant,
                                    row.expectedCapColor,
                                  )
                                }
                                className="min-h-8 w-full rounded border border-emerald-300/70 bg-emerald-400 px-2 py-1.5 text-center text-[11px] font-semibold leading-snug text-black transition-colors hover:bg-emerald-300"
                              >
                                Use {matchingFinishVariant.graceSku} for this image
                              </button>
                              <button
                                type="button"
                                onClick={() => openMissingVariantAsset(row, matchingFinishVariant)}
                                className="min-h-8 w-full rounded border border-emerald-300/50 bg-black/50 px-2 py-1.5 text-center text-[11px] font-semibold leading-snug text-emerald-100 transition-colors hover:bg-emerald-300/10 hover:text-white"
                              >
                                Create missing variant asset
                              </button>
                            </div>
                          )}
                          {visualIdentity.safeToPush && row.sku.trim() && (
                            <button
                              type="button"
                              onClick={() => openFinishCorrectRevision(row)}
                              className="min-h-8 w-full rounded border border-red-300/60 bg-red-950/70 px-2 py-1.5 text-center text-[11px] font-semibold leading-snug text-red-100 transition-colors hover:bg-red-900/80 hover:text-white"
                            >
                              Create {visualIdentity.resolvedVisualIdentity || "finish-correct"} revision
                            </button>
                          )}
                        </div>
                      )}
                      {manualReviewable && (!manuallyApproved || !manualFinishMatchesSku) && (
                        <div className="flex items-start gap-1 text-[11px] text-amber-300">
                          <AlertTriangle className="mt-0.5 w-3 h-3 shrink-0" />
                          <span>
                            Valid SKU match, but the resolver needs manual visual approval before pushing.
                          </span>
                        </div>
                      )}
                      {needsFinish && (
                        <div className="flex items-start gap-1 text-[11px] text-amber-300">
                          <AlertTriangle className="mt-0.5 w-3 h-3 shrink-0" />
                          <span>Declare what visual identity the image shows before replacing this variant.</span>
                        </div>
                      )}
                      {(() => {
                        const trimmed = row.sku.trim();
                        if (!trimmed) {
                          return (
                            <div className="flex items-center gap-1 text-[11px] text-[var(--darkroom-text)]/40">
                              <span className="font-mono">—</span>
                              <span>Will be skipped</span>
                            </div>
                          );
                        }
                        if (isCanonicalGraceSku(trimmed)) {
                          return (
                            <div className="flex items-center gap-1 text-[11px] text-emerald-500">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Matches Best Bottles variant</span>
                            </div>
                          );
                        }
                        return (
                          <div className="flex items-center gap-1 text-[11px] text-amber-500">
                            <AlertTriangle className="w-3 h-3" />
                            <span>Not in Best Bottles catalog — push may fail</span>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                );
              })}
          </div>

          <p className="text-[11px] text-[var(--darkroom-text)]/50">
            Rows without a SKU are skipped. Shopify receives the Supabase image URL, adds it to
            the product media gallery, attaches that media to the matched variant, and Best Bottles
            Convex is updated when available. One-off group hero images should use the Best Bottles
            product-media path so they attach to the product group rather than a variant.
          </p>

	          <DialogFooter className="gap-2 sm:gap-0">
	            <button
	              type="button"
	              className="inline-flex h-10 items-center justify-center rounded-md border border-white/20 bg-black/45 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
	              onClick={() => {
	                setBulkShopifyOpen(false);
	                setBulkShopifyRows([]);
	              }}
	            >
	              Cancel
	            </button>
            <Button
              type="button"
              className="bg-[#95BF47] hover:bg-[#84aa3f] text-black"
              disabled={
                bulkShopifyLoading ||
                bulkShopifyRows.every((row) => !row.sku.trim()) ||
                (isBestBottlesOrg && bulkShopifyRows.some((row) => !canPublishBulkShopifyRow(row)))
              }
              onClick={() => void handleBulkShopifyPublish()}
            >
              {bulkShopifyLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Publishing…
                </>
              ) : (
                "Push Shopify batch"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={sanityPublishOpen}
        onOpenChange={(open) => {
          setSanityPublishOpen(open);
          if (!open) {
            setSanityPublishImage(null);
            setSanityPublishProduct(null);
            setPublishDestination("tarife-sanity");
            setBestBottlesSlug("");
            setBestBottlesWebsiteSku("");
            setBestBottlesPdpMode("cap-on");
            setBestBottlesGroupSearch("");
            setBestBottlesSkuSearch("");
          }
        }}
      >
        <DialogContent className="bg-[var(--darkroom-surface)] border-[var(--darkroom-border)] text-[var(--darkroom-text)] max-w-md">
          <DialogHeader>
            <DialogTitle>Publish live</DialogTitle>
            <DialogDescription className="text-[var(--darkroom-text)]/70">
              Send this render through Shopify for Best Bottles variant media or catalog hero
              thumbnails, then reconcile the Shopify CDN URL into Convex for the live site. Tarife
              still publishes to Sanity via Product Hub.
            </DialogDescription>
          </DialogHeader>
          {sanityPublishImage && (
            <div className="flex gap-3 items-center">
              <img
                src={sanityPublishImage.image_url}
                alt=""
                className="w-20 h-20 rounded-md object-cover border border-[var(--darkroom-border)] shrink-0"
              />
              <p className="text-xs text-[var(--darkroom-text)]/60 line-clamp-4">
                Choose whether this render updates Best Bottles Shopify-backed variant media, a
                Shopify-backed catalog hero/thumbnail, or a Tarife fragrance main image.
              </p>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="publish-destination" className="text-[var(--darkroom-text)]">
              Destination
            </Label>
            <Select
              value={publishDestination}
              onValueChange={(value) => {
                const nextDestination = value as PublishDestination;
                setPublishDestination(nextDestination);
                if (value !== "tarife-sanity") setSanityPublishProduct(null);
                if (nextDestination === "best-bottles-grid" && !bestBottlesSlug.trim()) {
                  const typedGroupSlug = selectedBestBottlesProductGroupSlugs[0] ?? "";
                  const imageGroupSlug = sanityPublishImage
                    ? resolveBestBottlesProductGroupSlug(sanityPublishImage) ||
                      detectProductGroupSlug(sanityPublishImage)
                    : "";
                  setBestBottlesSlug(typedGroupSlug || imageGroupSlug);
                }
                if (
                  nextDestination === "best-bottles-pdp" &&
                  !bestBottlesWebsiteSku.trim() &&
                  sanityPublishImage
                ) {
                  setBestBottlesWebsiteSku(resolveBestBottlesWebsiteSku(sanityPublishImage));
                }
                if (value !== "best-bottles-grid") {
                  setBestBottlesGroupPickerOpen(false);
                  setBestBottlesGroupSearch("");
                }
              }}
            >
              <SelectTrigger
                id="publish-destination"
                className="bg-[var(--darkroom-bg)] border-[var(--darkroom-border)] text-[var(--darkroom-text)]"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {isBestBottlesOrg && (
                  <>
                    <SelectItem value="best-bottles-grid">
                      Best Bottles group hero / grid thumbnail via Shopify
                    </SelectItem>
                    <SelectItem value="best-bottles-pdp">
                      Best Bottles variant PDP image via Shopify
                    </SelectItem>
                  </>
                )}
                <SelectItem value="tarife-sanity">Tarife product main image</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {publishDestination === "best-bottles-grid" ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="text-[var(--darkroom-text)]">Product group</Label>
                <Popover
                  open={bestBottlesGroupPickerOpen}
                  onOpenChange={setBestBottlesGroupPickerOpen}
                >
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={bestBottlesGroupPickerOpen}
                      className="w-full justify-between bg-[var(--darkroom-bg)] border-[var(--darkroom-border)] text-[var(--darkroom-text)]"
                    >
                      <span className="truncate text-left">
                        {bestBottlesSlug || "Select a Best Bottles product group..."}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[min(420px,calc(100vw-2rem))] p-0 bg-[#1A1816] border-[#2C2C2C] z-[9999]"
                    align="start"
                  >
                    <Command className="bg-[#1A1816]">
                      <CommandInput
                        placeholder="Search slug, family, capacity..."
                        value={bestBottlesGroupSearch}
                        onValueChange={setBestBottlesGroupSearch}
                        className="bg-[#1A1816] text-[#EAEAEA]"
                      />
                      <CommandList className="bg-[#1A1816] max-h-[340px] overflow-y-auto overscroll-contain">
                        <CommandEmpty className="text-studio-text-muted">
                          {bestBottlesProductGroupsLoading
                            ? "Loading Best Bottles groups..."
                            : "No matching product groups found."}
                        </CommandEmpty>
                        <CommandGroup>
                          {filteredBestBottlesProductGroups.map((group) => (
                            <CommandItem
                              key={group._id}
                              value={`${group.slug} ${group.displayName} ${group.family} ${group.capacity ?? ""} ${group.color ?? ""} ${(group.applicatorTypes ?? []).join(" ")}`}
                              onSelect={() => {
                                setBestBottlesSlug(group.slug);
                                setBestBottlesGroupSearch("");
                                setBestBottlesGroupPickerOpen(false);
                              }}
                              className="flex items-start gap-2 text-[#EAEAEA] hover:bg-white/10 cursor-pointer aria-selected:bg-white/10 aria-selected:text-[#EAEAEA]"
                            >
                              <div className="min-w-0">
                                <div className="truncate text-xs">{group.displayName}</div>
                                <div className="truncate font-mono text-[11px] text-[#A8A29E]">
                                  {group.slug}
                                </div>
                              </div>
                              <span className="ml-auto shrink-0 text-right text-[11px] text-[#888]">
                                {[group.capacity, group.color, group.neckThreadSize]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bb-slug" className="text-[var(--darkroom-text)]">
                  Product group slug
                </Label>
                <Input
                  id="bb-slug"
                  value={bestBottlesSlug}
                  onChange={(e) => setBestBottlesSlug(e.target.value)}
                  placeholder="e.g. empire-50ml-clear-18-415-lotionpump"
                  className="bg-[var(--darkroom-bg)] border-[var(--darkroom-border)] text-[var(--darkroom-text)] font-mono text-sm"
                />
                <p className="text-[11px] text-[var(--darkroom-text)]/50">
                  Uploads to Shopify product media, attaches the image to the primary variant,
                  writes the Shopify CDN URL to the Best Bottles Convex catalog hero/thumbnail
                  path, then runs the reconciliation pass so the production UI reads the current
                  Shopify URL.
                </p>
              </div>
            </div>
          ) : publishDestination === "best-bottles-pdp" ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="text-[var(--darkroom-text)]">Variant SKU picker</Label>
                <Popover open={bestBottlesSkuPickerOpen} onOpenChange={setBestBottlesSkuPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={bestBottlesSkuPickerOpen}
                      className="w-full justify-between bg-[var(--darkroom-bg)] border-[var(--darkroom-border)] text-[var(--darkroom-text)]"
                    >
                      {bestBottlesWebsiteSku || "Select a Best Bottles variant SKU..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[min(420px,calc(100vw-2rem))] p-0 bg-[#1A1816] border-[#2C2C2C] z-[9999]"
                    align="start"
                  >
                    <Command className="bg-[#1A1816]">
                      <CommandInput
                        placeholder="Search SKU, cap color, applicator..."
                        value={bestBottlesSkuSearch}
                        onValueChange={setBestBottlesSkuSearch}
                        className="bg-[#1A1816] text-[#EAEAEA]"
                      />
                      <CommandList className="bg-[#1A1816] max-h-[340px] overflow-y-auto overscroll-contain">
                        <CommandEmpty className="text-studio-text-muted">
                          {bestBottlesProductsLoading
                            ? "Loading Best Bottles SKUs..."
                            : "No matching Best Bottles SKUs found. Use manual entry below."}
                        </CommandEmpty>
                        <CommandGroup>
                          {filteredBestBottlesProducts.map((product) => (
                            <CommandItem
                              key={product._id}
                              value={`${product.websiteSku} ${product.graceSku} ${product.itemName} ${product.applicator ?? ""} ${product.capColor ?? ""}`}
                              onSelect={() => {
                                setBestBottlesWebsiteSku(product.websiteSku);
                                setBestBottlesSkuSearch("");
                              }}
                              className="flex items-start gap-2 text-[#EAEAEA] hover:bg-white/10 cursor-pointer aria-selected:bg-white/10 aria-selected:text-[#EAEAEA]"
                            >
                              <div className="min-w-0">
                                <div className="font-mono text-xs">{product.websiteSku}</div>
                                <div className="truncate text-xs text-[#A8A29E]">
                                  {product.itemName}
                                </div>
                              </div>
                              <span className="ml-auto shrink-0 text-right text-[11px] text-[#888]">
                                {[product.capacity, product.applicator, product.capColor]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bb-website-sku" className="text-[var(--darkroom-text)]">
                  Website SKU or Grace SKU (variant only)
                </Label>
                <Textarea
                  id="bb-website-sku"
                  value={bestBottlesWebsiteSku}
                  onChange={(e) => setBestBottlesWebsiteSku(e.target.value)}
                  placeholder={
                    "e.g. GBEmp50RdcrShnGl\nGB-EMP-CLR-50ML-RDCR-SHNGL\nOptional: one per line"
                  }
                  className="min-h-20 bg-[var(--darkroom-bg)] border-[var(--darkroom-border)] text-[var(--darkroom-text)] font-mono text-sm"
                />
                <p className="text-[11px] text-[var(--darkroom-text)]/50">
                  Use one SKU for a single image. Use one SKU per line only when the exact same
                  approved image should be assigned to multiple variants. Product group slugs
                  belong in the product group hero destination.
                </p>
                {selectedBestBottlesHasProductGroupSlug && (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-[11px] text-amber-100">
                    <div className="flex gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                      <div className="space-y-2">
                        <p>
                          {selectedBestBottlesProductGroupSlugs[0]} is a product group slug,
                          not a variant SKU. Use this route only for SKU/PDP media that should
                          attach to Shopify variants.
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 border-amber-400/50 bg-transparent text-amber-100 hover:bg-amber-500/15"
                          onClick={() => {
                            setPublishDestination("best-bottles-grid");
                            setBestBottlesSlug(selectedBestBottlesProductGroupSlugs[0]);
                            setBestBottlesWebsiteSku("");
                          }}
                        >
                          Switch to product group hero
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="bb-pdp-mode" className="text-[var(--darkroom-text)]">
                  Product image slot
                </Label>
                {selectedBestBottlesPrimaryOnly ? (
                  <div
                    id="bb-pdp-mode"
                    className="rounded-md border border-[var(--darkroom-border)] bg-[var(--darkroom-bg)] px-3 py-2 text-sm text-[var(--darkroom-text)]"
                  >
                    Main product image only
                  </div>
                ) : (
                  <Select
                    value={bestBottlesPdpMode}
                    onValueChange={(value) => setBestBottlesPdpMode(value as BestBottlesPdpMode)}
                  >
                    <SelectTrigger
                      id="bb-pdp-mode"
                      className="bg-[var(--darkroom-bg)] border-[var(--darkroom-border)] text-[var(--darkroom-text)]"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cap-on">Main product image / cap or top on</SelectItem>
                      <SelectItem value="cap-off">Secondary image / cap or top off</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                {selectedBestBottlesHasPrimaryOnly && (
                  <p className="text-[11px] text-[var(--darkroom-text)]/50">
                    Empire vintage bulb sprayer images are assigned to the main PDP image only.
                  </p>
                )}
              </div>
              <p className="text-[11px] text-[var(--darkroom-text)]/50">
                Uploads this render to Shopify product media first, attaches it to the matched
                variant, patches the matching Convex product image field, then runs reconciliation
                so Shopify and the Best Bottles UI stay in sync. Product pages can show each top
                color when each SKU receives its own approved render.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label className="text-[var(--darkroom-text)]">Product Hub (Tarife / fragrance)</Label>
              <ProductSelector
                value={sanityPublishProduct?.name ?? ""}
                onSelect={setSanityPublishProduct}
                showLabel={false}
                buttonClassName="w-full justify-between bg-[var(--darkroom-surface)] border-[var(--darkroom-border)] text-[var(--darkroom-text)]"
              />
              <p className="text-[11px] text-[var(--darkroom-text)]/50">
                Matched to Sanity by the same product title as this row.
              </p>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              className="border-[var(--darkroom-border)] text-[var(--darkroom-text)]"
              onClick={() => {
                setSanityPublishOpen(false);
                setSanityPublishImage(null);
                setSanityPublishProduct(null);
                setPublishDestination("tarife-sanity");
                setBestBottlesSlug("");
                setBestBottlesWebsiteSku("");
                setBestBottlesPdpMode("cap-on");
                setBestBottlesGroupSearch("");
                setBestBottlesSkuSearch("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-[var(--darkroom-accent)] hover:bg-[var(--darkroom-accent-hover)] text-[var(--darkroom-bg)]"
              disabled={
                sanityPublishLoading ||
                (publishDestination === "best-bottles-grid"
                  ? !normalizeBestBottlesSlug(bestBottlesSlug)
                  : publishDestination === "best-bottles-pdp"
                    ? !bestBottlesWebsiteSku.trim() || selectedBestBottlesHasProductGroupSlug
                    : !sanityPublishProduct)
              }
              onClick={() => void handleConfirmSanityPublish()}
            >
              {sanityPublishLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Publishing…
                </>
              ) : publishDestination === "best-bottles-grid" ? (
                "Publish Shopify hero"
              ) : publishDestination === "best-bottles-pdp" ? (
                "Publish Shopify PDP image"
              ) : (
                "Publish live"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={tagsEditOpen}
        onOpenChange={(open) => {
          setTagsEditOpen(open);
          if (!open) {
            setTagsEditImage(null);
            setNewLibraryTag("");
          }
        }}
      >
        <DialogContent className="bg-[var(--darkroom-surface)] border-[var(--darkroom-border)] text-[var(--darkroom-text)] max-w-md">
          <DialogHeader>
            <DialogTitle>Library tags</DialogTitle>
            <DialogDescription className="text-[var(--darkroom-text)]/70">
              Tag renders with{" "}
              <span className="font-mono text-[var(--darkroom-accent)]">sku:…</span> so you can
              search them and line them up with Product Hub SKUs. Pipeline and Consistency runs
              already add applicator and shape tags.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2 min-h-[40px]">
            {(tagsEditImage?.library_tags ?? []).length === 0 ? (
              <span className="text-sm text-[var(--darkroom-text)]/50">No tags yet</span>
            ) : (
              (tagsEditImage?.library_tags ?? []).map((t) => (
                <Badge
                  key={t}
                  variant="outline"
                  className="text-xs gap-1 pr-1 border-[var(--darkroom-border)] text-[var(--darkroom-text)]"
                >
                  <span className="max-w-[200px] truncate" title={t}>
                    {t}
                  </span>
                  <button
                    type="button"
                    disabled={tagActionLoading}
                    className="rounded p-0.5 hover:bg-[var(--darkroom-border)] disabled:opacity-50"
                    onClick={() => void handleRemoveLibraryTag(t)}
                    aria-label={`Remove tag ${t}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))
            )}
          </div>
          <div className="flex gap-2">
            <Input
              value={newLibraryTag}
              onChange={(e) => setNewLibraryTag(e.target.value)}
              placeholder="e.g. sku:ROLL-ON-9ML-CLEAR"
              className="flex-1 bg-[var(--darkroom-bg)] border-[var(--darkroom-border)] text-[var(--darkroom-text)]"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleAddLibraryTag();
                }
              }}
            />
            <Button
              type="button"
              variant="secondary"
              className="shrink-0"
              disabled={!newLibraryTag.trim() || tagActionLoading}
              onClick={() => void handleAddLibraryTag()}
            >
              {tagActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Image Editor Modal */}
      <ImageEditorModal
        isOpen={imageEditorOpen}
        onClose={() => {
          setImageEditorOpen(false);
          setSelectedImage(null);
        }}
        image={selectedImage}
        onSave={() => refetch()}
        onImageGenerated={async (newImage) => {
          console.log("🖼️ New refined image generated in ImageLibrary:", newImage);
          // Refresh the library to show the new refinement
          await refetch();
          // Update modal to show the new image
          setSelectedImage(newImage);
          // Show success message
          toast({
            title: "Refinement saved",
            description: "Your refined image has been saved to the library.",
          });
        }}
        source="library"
      />
    </div>
  );
}
