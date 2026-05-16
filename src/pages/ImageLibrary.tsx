import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
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
} from "lucide-react";
import { MagicWand02 } from "@untitledui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
  addLibraryTag,
  removeLibraryTag,
  BACKGROUND_SCENE_TAG,
  LIBRARY_ROLE_PRODUCT,
  LIBRARY_ROLE_BACKGROUND_SCENE,
  LIBRARY_ROLE_STYLE_REFERENCE,
} from "@/lib/imageLibraryTags";
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
  | "background"
  | "style"
  | "roll-ons"
  | "empty-plates";
type SortOption = "recent" | "oldest" | "category";
type PublishDestination = "tarife-sanity" | "best-bottles-grid" | "best-bottles-pdp";
type BestBottlesPdpMode = "cap-on" | "cap-off";
type BulkBestBottlesRow = {
  imageId: string;
  imageUrl: string;
  label: string;
  websiteSku: string;
};
type BulkShopifyRow = {
  imageId: string;
  imageUrl: string;
  label: string;
  sku: string;
};

const PRIMARY_PDP_MODE: BestBottlesPdpMode = "cap-on";
const IMAGE_LIBRARY_PAGE_SIZE = 300;
const IMAGE_LIBRARY_SELECT =
  "id, image_url, session_id, session_name, goal_type, aspect_ratio, final_prompt, library_category, library_tags, parent_image_id, is_hero_image, created_at, is_archived";

type ImageTagChainRow = Pick<GeneratedImage, "id" | "library_tags" | "parent_image_id">;

function normalizeBestBottlesSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
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
    const match = raw.match(/\b(?:GB|LB)(?!-)[A-Za-z0-9]+\b/);
    if (match) return match[0];
  }

  const searchable = [image.session_name, image.final_prompt, image.library_category, image.image_url, ...tags]
    .filter(Boolean)
    .join(" ");
  return searchable.match(/\b(?:GB|LB)(?!-)[A-Za-z0-9]+\b/)?.[0] ?? "";
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
    const match = raw.match(/\b(?:GB|LB)-[A-Z0-9][A-Z0-9-]*\b/i);
    if (match) return match[0].toUpperCase();
  }

  const searchable = [image.session_name, image.final_prompt, image.library_category, image.image_url, ...tags]
    .filter(Boolean)
    .join(" ");
  return searchable.match(/\b(?:GB|LB)-[A-Z0-9][A-Z0-9-]*\b/i)?.[0].toUpperCase() ?? "";
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
    const { data, error } = await supabase
      .from("generated_images")
      .select("id, library_tags, parent_image_id")
      .in("id", [...parentIds]);

    if (error || !data) break;

    parentIds = new Set<string>();
    for (const row of data as ImageTagChainRow[]) {
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
    return mergeLibraryTags(tagById.get(parentId), collectAncestorTags(parentId, seen));
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

/** Dark Room “empty plate” generations — explicit kind tag on the row. */
function matchesEmptyPlateScope(image: GeneratedImage): boolean {
  const tags = image.library_tags ?? [];
  return tags.includes(BACKGROUND_SCENE_TAG);
}

export default function ImageLibrary() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentOrganizationId } = useOnboarding();
  const { enabled: isBestBottlesOrg } = useGridPipelineFeatureFlag();
  const publishLabel = isBestBottlesOrg ? "Publish to Best Bottles" : "Publish to website";
  const { toast } = useToast();

  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [assetTypeFilter, setAssetTypeFilter] = useState<AssetTypeFilter>("all");
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

  // Publish live: Best Bottles grid/PDP or Tarife mainImage (Sanity via push-product-to-sanity)
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

  // Fetch images from generated_images table
  const { data: images = [], isLoading, refetch } = useQuery({
    queryKey: ["image-library", currentOrganizationId, user?.id],
    queryFn: async () => {
      if (!user) return [];

      console.log("📸 Image Library fetching...", {
        organizationId: currentOrganizationId,
        userId: user.id
      });

      // First try with organization_id if available
      if (currentOrganizationId) {
        const { data, error } = await supabase
          .from("generated_images")
          .select(IMAGE_LIBRARY_SELECT)
          .eq("organization_id", currentOrganizationId)
          .eq("is_archived", false)
          .order("created_at", { ascending: false })
          .limit(IMAGE_LIBRARY_PAGE_SIZE);

        if (!error && data && data.length > 0) {
          console.log(`✅ Image Library loaded ${data.length} recent images by org`);
          return hydrateImagesWithAncestorTags(data as GeneratedImage[]);
        }

        if (error) {
          console.error("❌ Error fetching by org:", error);
        }
      }

      // Fallback: fetch by user_id
      console.log("📸 Trying fallback query by user_id...");
      const { data: userData, error: userError } = await supabase
        .from("generated_images")
        .select(IMAGE_LIBRARY_SELECT)
        .eq("user_id", user.id)
        .eq("is_archived", false)
        .order("created_at", { ascending: false })
        .limit(IMAGE_LIBRARY_PAGE_SIZE);

      if (userError) {
        console.error("❌ Error fetching by user:", userError);
        return [];
      }

      console.log(`✅ Image Library loaded ${userData?.length || 0} recent images by user`);
      return hydrateImagesWithAncestorTags((userData ?? []) as GeneratedImage[]);
    },
    enabled: !!user,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const needsBestBottlesProductLookup =
    isBestBottlesOrg &&
    ((sanityPublishOpen &&
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
      enabled:
        isBestBottlesOrg &&
        sanityPublishOpen &&
        publishDestination === "best-bottles-grid",
      staleTime: 5 * 60 * 1000,
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
    const shopifySku = detectShopifySku(image);
    if (shopifySku) return shopifySku;

    const graceSku = detectGraceSku(image);
    if (graceSku) return graceSku;

    const websiteSku = detectWebsiteSku(image);
    if (websiteSku) {
      return bestBottlesGraceSkuByWebsiteSku.get(websiteSku.toUpperCase()) ?? websiteSku;
    }

    return "";
  }, [bestBottlesGraceSkuByWebsiteSku]);

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

      return group?.slug ?? "";
    },
    [
      bestBottlesProductGroupsById,
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

  // Filter and sort images
  const filteredImages = useMemo(() => {
    let result = [...images];

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (img) =>
          img.session_name?.toLowerCase().includes(query) ||
          img.final_prompt?.toLowerCase().includes(query) ||
          img.library_category?.toLowerCase().includes(query) ||
          (img.library_tags ?? []).some((t) => t.toLowerCase().includes(query))
      );
    }

    if (assetTypeFilter === "roll-ons") {
      result = result.filter(matchesRollOnLibraryScope);
    } else if (assetTypeFilter === "empty-plates") {
      result = result.filter(matchesEmptyPlateScope);
    } else if (assetTypeFilter === "product") {
      result = result.filter(matchesProductAsset);
    } else if (assetTypeFilter === "background") {
      result = result.filter(matchesBackgroundAsset);
    } else if (assetTypeFilter === "style") {
      result = result.filter(matchesStyleReferenceAsset);
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
  }, [images, searchQuery, assetTypeFilter, sortBy]);

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
      for (const row of rowsToPublish) {
        const mode = getBestBottlesPdpModeForWebsiteSku(row.websiteSku, bulkBestBottlesMode);
        const { data, error } = await supabase.functions.invoke("push-bestbottles-pdp-image", {
          body: {
            imageUrl: row.imageUrl,
            websiteSku: row.websiteSku,
            mode,
          },
        });
        if (error) throw new Error(await extractFunctionErrorMessage(error, "Best Bottles publish failed"));
        if (data?.error) throw new Error(`${row.websiteSku}: ${data.error}`);
      }

      toast({
        title: "Best Bottles batch updated",
        description: `${rowsToPublish.length} image${rowsToPublish.length === 1 ? "" : "s"} pushed to Best Bottles.`,
      });
      setBulkBestBottlesOpen(false);
      setBulkBestBottlesRows([]);
      setSelectedImages(new Set());
    } catch (e: unknown) {
      const rawMessage = await extractFunctionErrorMessage(e, "Unable to publish batch");
      const message = /failed to send|functions\/v1|edge function|net::err_failed/i.test(rawMessage)
        ? "Madison could not reach the Best Bottles PDP publish function. Deploy push-bestbottles-pdp-image and confirm its Supabase secrets/CORS configuration, then try again."
        : rawMessage;
      toast({ title: "Batch publish failed", description: message, variant: "destructive" });
    } finally {
      setBulkBestBottlesLoading(false);
    }
  };

  const openBulkShopifyPublish = () => {
    const selected = images.filter((image) => selectedImages.has(image.id));
    setBulkShopifyRows(
      selected.map((image) => ({
        imageId: image.id,
        imageUrl: image.image_url,
        label: image.session_name || image.final_prompt || "Library image",
        sku: resolveShopifySku(image),
      })),
    );
    setBulkShopifyOpen(true);
  };

  const updateBulkShopifySku = (imageId: string, sku: string) => {
    setBulkShopifyRows((rows) =>
      rows.map((row) => (row.imageId === imageId ? { ...row, sku } : row)),
    );
  };

  const handleBulkShopifyPublish = async () => {
    const rowsToPublish = bulkShopifyRows
      .map((row) => ({ ...row, sku: row.sku.trim() }))
      .filter((row) => row.sku);
    if (rowsToPublish.length === 0) return;

    setBulkShopifyLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("push-shopify-product-images", {
        body: {
          organizationId: currentOrganizationId,
          items: rowsToPublish.map((row) => ({
            imageId: row.imageId,
            imageUrl: row.imageUrl,
            sku: row.sku,
            altText: row.label,
          })),
          attachToVariant: true,
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

      toast({
        title: "Shopify batch updated",
        description: `${successCount} image${successCount === 1 ? "" : "s"} added to Shopify product media and matched variants.`,
      });
      setBulkShopifyOpen(false);
      setBulkShopifyRows([]);
      setSelectedImages(new Set());
    } catch (e: unknown) {
      const rawMessage = await extractFunctionErrorMessage(e, "Unable to publish Shopify batch");
      const message = /failed to send|functions\/v1|edge function|net::err_failed/i.test(rawMessage)
        ? "Madison could not reach the Shopify image publish function. Deploy push-shopify-product-images and confirm Shopify/Supabase secrets, then try again."
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
    setSanityPublishImage(image);
    setSanityPublishProduct(null);
    setPublishDestination(isBestBottlesOrg ? "best-bottles-pdp" : "tarife-sanity");
    setBestBottlesSlug("");
    setBestBottlesWebsiteSku("");
    setBestBottlesPdpMode("cap-on");
    setBestBottlesGroupSearch("");
    setBestBottlesSkuSearch("");
    setSanityPublishOpen(true);
  };

  const handleConfirmSanityPublish = async () => {
    if (!sanityPublishImage) return;
    if (publishDestination === "best-bottles-grid") {
      const slug = normalizeBestBottlesSlug(bestBottlesSlug);
      if (!slug) return;
    } else if (publishDestination === "best-bottles-pdp") {
      const websiteSkus = splitWebsiteSkus(bestBottlesWebsiteSku);
      if (websiteSkus.length === 0) return;
    } else if (!sanityPublishProduct) {
      return;
    }

    setSanityPublishLoading(true);
    try {
      if (publishDestination === "best-bottles-grid") {
        const slug = normalizeBestBottlesSlug(bestBottlesSlug);
        const { data, error } = await supabase.functions.invoke("push-bestbottles-grid-hero", {
          body: {
            imageUrl: sanityPublishImage.image_url,
            slug,
          },
        });
        if (error) throw new Error(await extractFunctionErrorMessage(error, "Best Bottles catalog update failed"));
        if (data?.error) throw new Error(data.error);

        toast({
          title: "Website catalog updated",
          description: `Live product group "${slug}" now uses this image on bestbottles.com (Convex).`,
        });
      } else if (publishDestination === "best-bottles-pdp") {
        const websiteSkus = splitWebsiteSkus(bestBottlesWebsiteSku);

        for (const websiteSku of websiteSkus) {
          const mode = getBestBottlesPdpModeForWebsiteSku(websiteSku, bestBottlesPdpMode);
          const { data, error } = await supabase.functions.invoke("push-bestbottles-pdp-image", {
            body: {
              imageUrl: sanityPublishImage.image_url,
              websiteSku,
              mode,
            },
          });
          if (error) throw new Error(await extractFunctionErrorMessage(error, "Best Bottles PDP update failed"));
          if (data?.error) throw new Error(`${websiteSku}: ${data.error}`);
        }

        toast({
          title: "Best Bottles PDP updated",
          description:
            websiteSkus.length === 1
              ? `${websiteSkus[0]} ${getBestBottlesPdpModeForWebsiteSku(websiteSkus[0], bestBottlesPdpMode)} now points to the uploaded Sanity image.`
              : `${websiteSkus.length} SKUs now point to the uploaded Sanity image.`,
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
          ? "Madison could not reach the Best Bottles PDP publish function. Deploy push-bestbottles-pdp-image and confirm its Supabase secrets/CORS configuration, then try again."
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
                <SelectItem value="background" className="text-[var(--darkroom-text)]">Background scenes</SelectItem>
                <SelectItem value="style" className="text-[var(--darkroom-text)]">Style references</SelectItem>
                <SelectItem value="empty-plates" className="text-[var(--darkroom-text)]">Empty plates</SelectItem>
                <SelectItem value="roll-ons" className="text-[var(--darkroom-text)]">Roll-ons (pilot)</SelectItem>
              </SelectContent>
            </Select>

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
                      title="Push selected images to Best Bottles PDP image fields through Sanity and Convex"
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
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
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
              image uploads to Best Bottles Sanity, then updates the matching Convex product image
              field.
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
              <span className="font-mono">sku:</span> tags, or the original filename when it contains a SKU.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[56vh] overflow-y-auto overscroll-contain pr-1 space-y-2">
            {bulkShopifyRows.map((row, index) => (
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
                    htmlFor={`bulk-shopify-sku-${row.imageId}`}
                    className="text-[11px] text-[var(--darkroom-text)]/70"
                  >
                    Shopify variant SKU
                  </Label>
                  <Input
                    id={`bulk-shopify-sku-${row.imageId}`}
                    value={row.sku}
                    onChange={(e) => updateBulkShopifySku(row.imageId, e.target.value)}
                    placeholder="e.g. GB-CYL-AMB-9ML-SPR-BLK"
                    className="bg-[var(--darkroom-surface)] border-[var(--darkroom-border)] text-[var(--darkroom-text)] font-mono text-xs"
                  />
                </div>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-[var(--darkroom-text)]/50">
            Rows without a SKU are skipped. Shopify receives the Supabase image URL, adds it to
            the product media gallery, then attaches that media to the matched variant.
          </p>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              className="border-[var(--darkroom-border)] text-[var(--darkroom-text)]"
              onClick={() => {
                setBulkShopifyOpen(false);
                setBulkShopifyRows([]);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-[#95BF47] hover:bg-[#84aa3f] text-black"
              disabled={
                bulkShopifyLoading ||
                bulkShopifyRows.every((row) => !row.sku.trim())
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
              Send this render to the live Best Bottles catalog (Convex), or to Sanity as a Tarife
              fragrance <span className="font-mono">mainImage</span> via Product Hub.
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
                Choose whether this render updates a Best Bottles product page, a Best Bottles
                catalog thumbnail, or a Tarife fragrance main image.
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
                setPublishDestination(value as PublishDestination);
                if (value !== "tarife-sanity") setSanityPublishProduct(null);
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
                    <SelectItem value="best-bottles-pdp">Best Bottles PDP image</SelectItem>
                    <SelectItem value="best-bottles-grid">Best Bottles catalog thumbnail</SelectItem>
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
                  Publishes to <span className="font-mono">productGroups.heroImageUrl</span> in
                  Convex.
                </p>
              </div>
            </div>
          ) : publishDestination === "best-bottles-pdp" ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="text-[var(--darkroom-text)]">SKU picker</Label>
                <Popover open={bestBottlesSkuPickerOpen} onOpenChange={setBestBottlesSkuPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={bestBottlesSkuPickerOpen}
                      className="w-full justify-between bg-[var(--darkroom-bg)] border-[var(--darkroom-border)] text-[var(--darkroom-text)]"
                    >
                      {bestBottlesWebsiteSku || "Select a Best Bottles SKU..."}
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
                  Website SKU or Grace SKU
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
                  approved image should be assigned to multiple variants.
                </p>
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
                Uploads this render to Best Bottles Sanity first, then patches the matching Convex
                product image field. Product pages can show each top color when each SKU receives
                its own approved render.
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
                    ? !bestBottlesWebsiteSku.trim()
                    : !sanityPublishProduct)
              }
              onClick={() => void handleConfirmSanityPublish()}
            >
              {sanityPublishLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Publishing…
                </>
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
