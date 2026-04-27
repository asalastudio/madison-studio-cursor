import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOnboarding } from "@/hooks/useOnboarding";
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
  Tags,
  Loader2,
  Send,
  CheckCircle2,
} from "lucide-react";
import { MagicWand02 } from "@untitledui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { usePublishMasterToBestBottles } from "@/hooks/usePublishMasterToBestBottles";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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

function extractGraceSku(image: GeneratedImage): string | null {
  const tags = image.library_tags ?? [];
  for (const t of tags) {
    if (typeof t === "string" && t.startsWith("sku:")) {
      const sku = t.slice("sku:".length).trim();
      if (sku) return sku;
    }
  }
  return null;
}

function getPublishedBestBottlesStamp(image: GeneratedImage): string | null {
  const tags = image.library_tags ?? [];
  const tag = tags.find(
    (t) => typeof t === "string" && t.startsWith("published-to-bestbottles:"),
  );
  return tag ? tag.slice("published-to-bestbottles:".length) : null;
}

export default function ImageLibrary() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentOrganizationId } = useOnboarding();
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

  // Publish approved master → Best Bottles website (Sanity asset + Convex patch)
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishImage, setPublishImage] = useState<GeneratedImage | null>(null);
  const [publishSetAsGroupHero, setPublishSetAsGroupHero] = useState(false);
  const [publishGroupSlug, setPublishGroupSlug] = useState("");
  const { publishOne, isPublishing } = usePublishMasterToBestBottles();

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
          .select("*")
          .eq("organization_id", currentOrganizationId)
          .eq("is_archived", false)
          .order("created_at", { ascending: false });

        if (!error && data && data.length > 0) {
          console.log(`✅ Image Library loaded ${data.length} images by org`);
          return data as GeneratedImage[];
        }

        if (error) {
          console.error("❌ Error fetching by org:", error);
        }
      }

      // Fallback: fetch by user_id
      console.log("📸 Trying fallback query by user_id...");
      const { data: userData, error: userError } = await supabase
        .from("generated_images")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_archived", false)
        .order("created_at", { ascending: false });

      if (userError) {
        console.error("❌ Error fetching by user:", userError);
        return [];
      }

      console.log(`✅ Image Library loaded ${userData?.length || 0} images by user`);
      return userData as GeneratedImage[];
    },
    enabled: !!user,
  });

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

  const openPublish = (image: GeneratedImage) => {
    setPublishImage(image);
    setPublishSetAsGroupHero(false);
    setPublishGroupSlug("");
    setPublishOpen(true);
  };

  const handleConfirmPublish = async () => {
    if (!publishImage) return;
    const graceSku = extractGraceSku(publishImage);
    if (!graceSku) return;
    const result = await publishOne({
      imageId: publishImage.id,
      graceSku,
      setAsGroupHero: publishSetAsGroupHero,
      groupSlug: publishSetAsGroupHero ? publishGroupSlug.trim() || null : null,
    });
    if (result?.ok) {
      setPublishOpen(false);
      setPublishImage(null);
      await refetch();
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
                <div className="flex items-center gap-2">
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
                              openTagsEdit(image);
                            }}
                            className="text-[var(--darkroom-text)] focus:bg-[var(--darkroom-border)]"
                          >
                            <Tags className="w-4 h-4 mr-2" />
                            Edit library tags
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={!extractGraceSku(image)}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (extractGraceSku(image)) openPublish(image);
                            }}
                            className="text-[var(--darkroom-text)] focus:bg-[var(--darkroom-border)]"
                          >
                            <Send className="w-4 h-4 mr-2" />
                            {extractGraceSku(image)
                              ? "Publish to Best Bottles"
                              : "Publish to Best Bottles (add sku:… tag)"}
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
                    {getPublishedBestBottlesStamp(image) && (
                      <Badge
                        variant="outline"
                        className="text-[10px] border-emerald-500/40 text-emerald-400 gap-1"
                        title={`Published to Best Bottles: ${getPublishedBestBottlesStamp(image)}`}
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        Live
                      </Badge>
                    )}
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

      <Dialog
        open={publishOpen}
        onOpenChange={(open) => {
          if (isPublishing) return;
          setPublishOpen(open);
          if (!open) {
            setPublishImage(null);
            setPublishSetAsGroupHero(false);
            setPublishGroupSlug("");
          }
        }}
      >
        <DialogContent className="bg-[var(--darkroom-surface)] border-[var(--darkroom-border)] text-[var(--darkroom-text)] max-w-md">
          <DialogHeader>
            <DialogTitle>Publish to Best Bottles</DialogTitle>
            <DialogDescription className="text-[var(--darkroom-text)]/70">
              Uploads this master to Best Bottles' Sanity CDN and patches the
              Convex product so it goes live on bestbottles.com.
            </DialogDescription>
          </DialogHeader>
          {publishImage && (
            <div className="flex gap-3 items-start">
              <img
                src={publishImage.image_url}
                alt=""
                className="w-20 h-20 rounded-md object-cover border border-[var(--darkroom-border)] shrink-0"
              />
              <div className="flex flex-col gap-1 text-xs">
                <span className="text-[var(--darkroom-text)]/60">Grace SKU</span>
                <span className="font-mono text-[var(--darkroom-accent)] truncate">
                  {extractGraceSku(publishImage) ?? "—"}
                </span>
                {getPublishedBestBottlesStamp(publishImage) && (
                  <span className="text-[var(--darkroom-text)]/50 mt-1">
                    Last published{" "}
                    {new Date(
                      getPublishedBestBottlesStamp(publishImage) as string,
                    ).toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--darkroom-border)] p-3">
            <div className="flex flex-col gap-0.5">
              <Label
                htmlFor="publish-group-hero"
                className="text-sm text-[var(--darkroom-text)]"
              >
                Also set as catalog hero
              </Label>
              <span className="text-xs text-[var(--darkroom-text)]/60">
                Lifts to the productGroup so it shows on the catalog grid.
              </span>
            </div>
            <Switch
              id="publish-group-hero"
              checked={publishSetAsGroupHero}
              onCheckedChange={setPublishSetAsGroupHero}
              disabled={isPublishing}
            />
          </div>
          {publishSetAsGroupHero && (
            <div className="space-y-1.5">
              <Label
                htmlFor="publish-group-slug"
                className="text-xs text-[var(--darkroom-text)]/70"
              >
                Product group slug
              </Label>
              <Input
                id="publish-group-slug"
                value={publishGroupSlug}
                onChange={(e) => setPublishGroupSlug(e.target.value)}
                placeholder="e.g. cylinder-9ml-clear"
                className="bg-[var(--darkroom-bg)] border-[var(--darkroom-border)] text-[var(--darkroom-text)] font-mono text-xs"
                disabled={isPublishing}
              />
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              className="border-[var(--darkroom-border)] text-[var(--darkroom-text)]"
              disabled={isPublishing}
              onClick={() => {
                setPublishOpen(false);
                setPublishImage(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-[var(--darkroom-accent)] hover:bg-[var(--darkroom-accent-hover)] text-[var(--darkroom-bg)]"
              disabled={
                isPublishing ||
                !publishImage ||
                !extractGraceSku(publishImage) ||
                (publishSetAsGroupHero && !publishGroupSlug.trim())
              }
              onClick={() => void handleConfirmPublish()}
            >
              {isPublishing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Publishing…
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Publish
                </>
              )}
            </Button>
          </DialogFooter>
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
