/**
 * ImageEditorModal - Universal Image Editor Overlay
 *
 * A modal that opens when clicking on any image (from Dark Room, Light Table,
 * Library, or Video Project) to provide refinement and editing capabilities.
 *
 * Features:
 * - Large image preview
 * - Refine with AI (generate variations)
 * - Add text overlays
 * - Create video (link to Video Project)
 * - Generate variations
 * - Save to library / Export
 *
 * Keeps users in context by overlaying rather than navigating away.
 */

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import { toPng } from "html-to-image";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  X,
  ArrowLeft,
  Wand2,
  Type,
  Film,
  Download,
  Save,
  Loader2,
  Copy,
  RefreshCw,
  Plus,
  Check,
  Sparkles,
  Image as ImageIcon,
  Layout,
  ChevronRight,
  RotateCcw,
  Scissors,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  readPreserveCanvasGenerationMetadata,
  resolveGenerationCanvasMetadata,
} from "@/lib/imageCanvasMetadata";
import {
  getInlineRefinementRequestPrompt,
  IMAGE_REFINEMENT_QUICK_EDITS,
  mergeRefinementLibraryTags,
} from "@/lib/imageRefinementQuickEdits";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentOrganizationId } from "@/hooks/useIndustryConfig";

// Ad Overlay components
import { AdOverlay, AdPresetSelector, type AdOverlayConfig } from "@/components/ad-overlay";
import {
  AD_LAYOUT_PRESETS,
  AD_FONT_OPTIONS,
  AD_COLOR_PRESETS,
  type AdLayoutPreset
} from "@/config/adLayoutPresets";

// Background Removal
import { BackgroundRemovalTab } from "./BackgroundRemovalTab";

// Best Bottles scale card
import { ScaleCardOverlay } from "@/components/best-bottles/ScaleCardOverlay";
import { resolveScaleCardOverlayModel } from "@/lib/bestBottlesScaleCardOverlay";
import type { FramingDecision } from "@/lib/product-image/framingQa";
import type { BestBottlesScaleVerdict } from "@/lib/bestBottlesScaleVerdict";

export interface ImageEditorProductContext {
  name: string;
  itemName?: string;
  family?: string;
  bottleCollection?: string;
  graceSku?: string;
  websiteSku?: string;
  details?: string[];
  capacityMl?: number | null;
  /** Catalog glass height (no cap) — drives the scale-card target rim. */
  heightWithoutCap?: string | number | null;
  /** Catalog assembled height (with cap). */
  heightWithCap?: string | number | null;
  /** Convex applicator value (roller, sprayer, cap/closure…). */
  applicator?: string | null;
}

/**
 * Scale-card evidence carried from the Library's reconciliation row so the
 * editor can draw the same instrument Studio uses and show PASS/FAIL.
 */
export interface ImageEditorScaleCardContext {
  /** Rigged glass height as a % of canvas height (framing QA measurement). */
  measuredGlassHeightPct?: number | null;
  canvasHeightPx?: number | null;
  measuredShoulderYPx?: number | null;
  targetShoulderYPx?: number | null;
  shoulderDeltaPct?: number | null;
  shoulderConfidence?: number | null;
  /** Framing QA decision recorded on the reconciliation row. */
  framingDecision?: FramingDecision | null;
  /** Honest, pixel-grounded verdict resolved by the Library. */
  verdict?: BestBottlesScaleVerdict | null;
}

export interface ImageEditorImage {
  id: string;
  imageUrl: string;
  prompt: string;
  isSaved?: boolean;
  // Additional metadata
  goalType?: string;
  aspectRatio?: string;
  createdAt?: string;
  sessionName?: string;
  libraryTags?: string[];
  product?: ImageEditorProductContext;
  scaleCard?: ImageEditorScaleCardContext;
}

export interface ImageEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  image: ImageEditorImage | null;
  onSave?: (image: ImageEditorImage) => void;
  onImageGenerated?: (newImage: ImageEditorImage) => void;
  source?: "darkroom" | "library" | "video-project";
}

interface Variation {
  id: string;
  imageUrl: string;
  isGenerating: boolean;
}

const REFINE_PROMPT_MAX_CHARS = 900;

function isLikelyPromptBlock(value: string): boolean {
  const text = value.trim();
  if (text.length > REFINE_PROMPT_MAX_CHARS) return true;
  return [
    "REFERENCE-LOCKED BEST BOTTLES",
    "=== REFERENCE IMAGE DIRECTIVES ===",
    "=== CREATIVE DIRECTION ===",
    "MEASUREMENT LOCK:",
    "SKU/spec context",
    "```",
  ].some((marker) => text.includes(marker));
}

export function ImageEditorModal({
  isOpen,
  onClose,
  image,
  onSave,
  onImageGenerated,
  source = "darkroom",
}: ImageEditorModalProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { orgId } = useCurrentOrganizationId();

  // UI State
  const [activeTab, setActiveTab] = useState<"refine" | "text" | "variations" | "ad" | "bg-remove">("refine");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExportingAd, setIsExportingAd] = useState(false);

  // Refine State
  const [refinementPrompt, setRefinementPrompt] = useState("");

  // Variations State
  const [variations, setVariations] = useState<Variation[]>([]);
  const [selectedVariationId, setSelectedVariationId] = useState<string | null>(null);

  // Text Overlay State (placeholder for future)
  const [textOverlay, setTextOverlay] = useState({
    headline: "",
    subtext: "",
    position: "bottom" as "top" | "center" | "bottom",
  });

  // Ad Overlay State
  const adOverlayRef = useRef<HTMLDivElement>(null);
  const [showCustomizeAd, setShowCustomizeAd] = useState(false);
  const [adConfig, setAdConfig] = useState<AdOverlayConfig>({
    preset: AD_LAYOUT_PRESETS[0],
    headline: "",
    subtext: "",
    ctaText: "",
  });

  // Scale card (Best Bottles catalog heroes). The model needs a SKU glass
  // height to draw the target rim; the measured line + verdict come from
  // the reconciliation framing QA carried in `image.scaleCard`.
  const scaleCardModel = useMemo(() => {
    if (!image) return null;
    const model = resolveScaleCardOverlayModel({
      tags: image.libraryTags ?? [],
      family: image.product?.family ?? null,
      bottleCollection: image.product?.bottleCollection ?? null,
      graceSku: image.product?.graceSku ?? null,
      websiteSku: image.product?.websiteSku ?? null,
      itemName: image.product?.itemName ?? image.product?.name ?? null,
      capacityMl: image.product?.capacityMl ?? null,
      heightWithoutCap: image.product?.heightWithoutCap ?? null,
      heightWithCap: image.product?.heightWithCap ?? null,
      applicator: image.product?.applicator ?? null,
      measuredGlassHeightPct: image.scaleCard?.measuredGlassHeightPct ?? null,
      canvasHeightPx: image.scaleCard?.canvasHeightPx ?? null,
      measuredShoulderYPx: image.scaleCard?.measuredShoulderYPx ?? null,
      shoulderConfidence: image.scaleCard?.shoulderConfidence ?? null,
    });
    return model.shoulder || model.target ? model : null;
  }, [image]);
  const [showScaleCard, setShowScaleCard] = useState(false);
  const scaleVerdict = image?.scaleCard?.verdict ?? null;

  // Overlay must align to the rendered <img> box (object-contain letterboxes
  // inside the flex preview), so measure it and re-measure on resize.
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const previewImgRef = useRef<HTMLImageElement>(null);
  const [imgBox, setImgBox] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const measureImgBox = useCallback(() => {
    const container = previewContainerRef.current;
    const img = previewImgRef.current;
    if (!container || !img || !img.complete || img.naturalWidth === 0) {
      setImgBox(null);
      return;
    }
    // Layout metrics are relative to the positioned preview container and are
    // unaffected by Framer Motion's scale-in transform. getBoundingClientRect
    // measures the animated viewport box and previously froze an almost-square
    // overlay over a true 10:11 image.
    setImgBox({
      top: img.offsetTop,
      left: img.offsetLeft,
      width: img.offsetWidth,
      height: img.offsetHeight,
    });
  }, []);
  useEffect(() => {
    if (!isOpen) return;
    measureImgBox();
    const container = previewContainerRef.current;
    const img = previewImgRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measureImgBox());
    observer.observe(container);
    // The image can resize without the container resizing when verdict copy,
    // metadata, or responsive layout changes the available preview height.
    // Observe the rendered image itself so the overlay never retains stale
    // dimensions and shifts the 91% baseline upward.
    if (img) observer.observe(img);
    return () => observer.disconnect();
  }, [isOpen, measureImgBox, image?.id, selectedVariationId, activeTab]);

  // Reset state when image changes
  useEffect(() => {
    if (image) {
      setRefinementPrompt("");
      setVariations([]);
      setSelectedVariationId(null);
      setActiveTab("refine");
      // Catalog heroes open with the instrument on so scale is never a guess.
      setShowScaleCard(source === "library" && Boolean(image.scaleCard));
      // Reset ad config
      setAdConfig({
        preset: AD_LAYOUT_PRESETS[0],
        headline: "",
        subtext: "",
        ctaText: "",
      });
    }
  }, [image]);

  // Ad overlay handlers
  const handleSelectAdPreset = useCallback((preset: AdLayoutPreset) => {
    setAdConfig((prev) => ({
      ...prev,
      preset,
      // Reset custom colors to preset defaults
      colorBlockColor: undefined,
      colorBlockOpacity: undefined,
      textColor: undefined,
      ctaBackgroundColor: undefined,
      ctaTextColor: undefined,
      fontFamily: undefined,
    }));
  }, []);

  const handleResetAdConfig = useCallback(() => {
    setAdConfig({
      preset: AD_LAYOUT_PRESETS[0],
      headline: "",
      subtext: "",
      ctaText: "",
    });
    setShowCustomizeAd(false);
  }, []);

  const handleExportAd = useCallback(async () => {
    if (!adOverlayRef.current) {
      toast.error("No ad to export");
      return;
    }

    if (!adConfig.headline && !adConfig.subtext) {
      toast.error("Add some text to your ad first");
      return;
    }

    setIsExportingAd(true);

    try {
      const dataUrl = await toPng(adOverlayRef.current, {
        quality: 1,
        pixelRatio: 2, // Higher quality export
      });

      // Download the image
      const link = document.createElement("a");
      link.download = `madison-ad-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();

      toast.success("Ad exported successfully!");
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Failed to export ad");
    } finally {
      setIsExportingAd(false);
    }
  }, [adConfig.headline, adConfig.subtext]);

  // Check if ad has content
  const hasAdContent = adConfig.headline || adConfig.subtext || adConfig.ctaText;

  // Generate a variation/refinement
  const handleRefine = useCallback(async (instructionOverride?: string) => {
    const instruction = (instructionOverride ?? refinementPrompt).trim();

    if (!image || !user || !orgId || !instruction) {
      toast.error("Please enter a refinement prompt");
      return;
    }
    if (isLikelyPromptBlock(instruction)) {
      toast.error("Use a short edit instruction, not a full prompt block.");
      return;
    }

    setIsGenerating(true);
    const inheritedTags = Array.isArray(image.libraryTags) ? image.libraryTags : [];
    const refinementTags = mergeRefinementLibraryTags(inheritedTags);

    try {
      const preserveCanvasMetadata = await readPreserveCanvasGenerationMetadata(image.imageUrl);
      const generationCanvasMetadata = resolveGenerationCanvasMetadata(
        preserveCanvasMetadata,
        {
          prompt: image.prompt,
          libraryTags: inheritedTags,
          aspectRatio: image.aspectRatio,
          goalType: image.goalType,
        },
      );
      const refinementAspectRatio =
        generationCanvasMetadata.aspectRatio || image.aspectRatio || "1:1";

      const { data, error } = await supabase.functions.invoke("generate-madison-image", {
        body: {
          prompt: getInlineRefinementRequestPrompt(image.prompt, instruction),
          // Pass as referenceImages array (correct format for edge function)
          referenceImages: [{
            url: image.imageUrl,
            label: "product",
            description: "Image to refine"
          }],
          userId: user.id,
          organizationId: orgId,
          goalType: "refinement",
          aspectRatio: refinementAspectRatio,
          imageConstraints: generationCanvasMetadata.imageConstraints,
          parentImageId: image.id,
          isRefinement: true,
          refinementInstruction: instruction,
          parentPrompt: image.prompt,
          extraLibraryTags: refinementTags,
        },
      });

      if (error) throw error;

      if (data?.imageUrl) {
        const newImage: ImageEditorImage = {
          id: data.savedImageId || uuidv4(),
          imageUrl: data.imageUrl,
          prompt: image.prompt || data.finalPrompt || instruction,
          isSaved: true,
          goalType: "refinement",
          aspectRatio: refinementAspectRatio,
          createdAt: new Date().toISOString(),
          sessionName: image.sessionName,
          libraryTags: refinementTags,
        };

        // Add to variations
        setVariations((prev) => [
          ...prev,
          { id: newImage.id, imageUrl: newImage.imageUrl, isGenerating: false },
        ]);
        setSelectedVariationId(newImage.id);

        if (onImageGenerated) {
          onImageGenerated(newImage);
        }

        toast.success("Refinement generated!");
      }
    } catch (error) {
      console.error("Refinement error:", error);
      toast.error("Failed to generate refinement");
    } finally {
      setIsGenerating(false);
    }
  }, [image, user, orgId, refinementPrompt, onImageGenerated]);

  // Generate multiple variations at once
  const handleGenerateVariations = useCallback(async () => {
    if (!image || !user || !orgId) return;

    setIsGenerating(true);
    const inheritedTags = Array.isArray(image.libraryTags) ? image.libraryTags : [];

    // Create placeholder variations
    const placeholders: Variation[] = Array(3)
      .fill(null)
      .map(() => ({
        id: uuidv4(),
        imageUrl: "",
        isGenerating: true,
      }));

    setVariations(placeholders);

    try {
      const preserveCanvasMetadata = await readPreserveCanvasGenerationMetadata(image.imageUrl);
      const generationCanvasMetadata = resolveGenerationCanvasMetadata(
        preserveCanvasMetadata,
        {
          prompt: image.prompt,
          libraryTags: inheritedTags,
          aspectRatio: image.aspectRatio,
          goalType: image.goalType,
        },
      );
      const variationAspectRatio =
        generationCanvasMetadata.aspectRatio || image.aspectRatio || "1:1";

      // Generate 3 variations with slightly different prompts
      const variationPrompts = [
        `${image.prompt}. Alternative angle with dramatic lighting.`,
        `${image.prompt}. Softer, more elegant presentation.`,
        `${image.prompt}. Bold contrast with rich shadows.`,
      ];

      const results = await Promise.allSettled(
        variationPrompts.map(async (prompt, index) => {
          const { data, error } = await supabase.functions.invoke("generate-madison-image", {
            body: {
              prompt,
              // Pass as referenceImages array (correct format for edge function)
              referenceImages: [{
                url: image.imageUrl,
                label: "product",
                description: "Source image for variation"
              }],
              userId: user.id,
              organizationId: orgId,
              goalType: "variation",
              aspectRatio: variationAspectRatio,
              imageConstraints: generationCanvasMetadata.imageConstraints,
              parentImageId: image.id,
              extraLibraryTags: mergeRefinementLibraryTags(inheritedTags),
            },
          });

          if (error) throw error;
          return {
            id: data?.savedImageId || placeholders[index].id,
            imageUrl: data?.imageUrl || "",
            isGenerating: false,
          };
        })
      );

      // Update variations with results
      const newVariations = results.map((result, index) => {
        if (result.status === "fulfilled" && result.value.imageUrl) {
          return result.value;
        }
        return {
          id: placeholders[index].id,
          imageUrl: "",
          isGenerating: false,
        };
      }).filter((v) => v.imageUrl);

      setVariations(newVariations);

      if (newVariations.length > 0) {
        toast.success(`Generated ${newVariations.length} variations`);
      } else {
        toast.error("Failed to generate variations");
      }
    } catch (error) {
      console.error("Variations error:", error);
      toast.error("Failed to generate variations");
      setVariations([]);
    } finally {
      setIsGenerating(false);
    }
  }, [image, user, orgId]);

  // Create video from this image
  const handleCreateVideo = useCallback(() => {
    if (!image) return;

    navigate("/studio", {
      state: {
        mode: "video",
        subjectImage: image.imageUrl,
      },
    });
    onClose();
    toast.success("Opening Studio...");
  }, [image, navigate, onClose]);

  // Save to library
  const handleSave = useCallback(async () => {
    if (!image) return;

    setIsSaving(true);
    try {
      // If onSave callback provided, use it
      if (onSave) {
        onSave(image);
      }
      toast.success("Saved to library");
    } catch (error) {
      console.error("Save error:", error);
      toast.error("Failed to save");
    } finally {
      setIsSaving(false);
    }
  }, [image, onSave]);

  // Download image - uses displayed image (which may be processed/edited)
  const handleDownload = useCallback(async () => {
    if (!image) return;

    try {
      // Calculate displayed image (selected variation or original) inside callback
      const imageUrlToDownload = selectedVariationId
        ? variations.find((v) => v.id === selectedVariationId)?.imageUrl || image.imageUrl
        : image.imageUrl;

      // Import the download utility
      const { downloadImage } = await import("@/utils/imageDownload");
      await downloadImage(imageUrlToDownload, `madison-studio-${image.id.slice(0, 8)}.png`);

      toast.success("Image downloaded");
    } catch (error) {
      console.error("Download error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to download");
    }
  }, [image, selectedVariationId, variations]);

  // Copy prompt
  const handleCopyPrompt = useCallback(() => {
    if (!image?.prompt) return;
    navigator.clipboard.writeText(image.prompt);
    toast.success("Prompt copied to clipboard");
  }, [image?.prompt]);

  // Get displayed image (selected variation or original)
  const displayedImage = selectedVariationId
    ? variations.find((v) => v.id === selectedVariationId)?.imageUrl || image?.imageUrl
    : image?.imageUrl;
  const duplicateCapQuickEdit = IMAGE_REFINEMENT_QUICK_EDITS[0];

  // Always render Dialog for proper state management, but only open when image exists
  const refinePromptLooksBlocked =
    refinementPrompt.trim().length > 0 && isLikelyPromptBlock(refinementPrompt);
  const shouldOpen = isOpen && !!image;

  return (
    <Dialog open={shouldOpen} onOpenChange={(open) => {
      if (!open) {
        onClose();
      }
    }}>
      <DialogContent
        className={cn(
          // Base styles - override default DialogContent styles
          "bg-[var(--darkroom-surface)] border border-[rgba(184,149,106,0.2)] shadow-2xl p-0",
          // Desktop: Large modal with constrained size
          "w-[95vw] max-w-[1000px] max-h-[90vh]",
          // Mobile: Full screen for better UX
          "sm:rounded-2xl",
          // Remove default close button styling (we have custom header)
          "[&>button]:hidden"
        )}
      >
        <div className="flex flex-col h-full md:h-auto md:max-h-[90vh]">
          {/* Custom Header */}
          <div className="shrink-0 flex items-center justify-between px-4 md:px-5 py-3 md:py-4 bg-[var(--darkroom-surface-elevated)] border-b border-[rgba(184,149,106,0.15)]">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
              className="text-[rgba(245,240,230,0.7)] hover:text-[var(--darkroom-text)] hover:bg-[rgba(184,149,106,0.1)] text-xs md:text-sm"
          >
              <ArrowLeft className="w-4 h-4 mr-1 md:mr-2" />
              <span className="hidden sm:inline">Back to {source === "library" ? "Library" : "Dark Room"}</span>
              <span className="sm:hidden">Back</span>
          </Button>

            <DialogTitle className="font-serif text-lg md:text-xl font-medium text-[var(--darkroom-text)] absolute left-1/2 -translate-x-1/2">
            Image Editor
          </DialogTitle>

            <DialogDescription className="sr-only">
              Edit and refine your generated image. Generate variations, add text overlays, or create videos.
            </DialogDescription>

          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
              className="text-[rgba(245,240,230,0.5)] hover:text-[var(--darkroom-text)] hover:bg-[rgba(184,149,106,0.1)]"
          >
            <X className="w-4 h-4" />
          </Button>
          </div>

            {/* Main Content */}
            {image ? (
            <div className="flex-1 grid grid-cols-1 md:grid-cols-[1fr_320px] min-h-0 overflow-hidden">
          {/* Main Image Preview */}
            <div className="flex flex-col p-3 md:p-6 bg-[var(--darkroom-bg)] md:border-r border-b md:border-b-0 border-[rgba(184,149,106,0.1)] overflow-hidden min-h-[200px] md:min-h-0">
            {scaleCardModel && (
              <div className="mb-2" data-testid="scale-card-controls">
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowScaleCard((value) => !value)}
                    aria-pressed={showScaleCard}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-[11px] font-medium tracking-wide transition-colors",
                      showScaleCard
                        ? "border-[rgba(184,149,106,0.6)] bg-[rgba(184,149,106,0.18)] text-[var(--darkroom-text)]"
                        : "border-[rgba(184,149,106,0.25)] text-[rgba(245,240,230,0.6)] hover:text-[var(--darkroom-text)]",
                    )}
                  >
                    {scaleCardModel.mode === "shoulder-lock" ? "Shoulder lock" : "Scale card"}{" "}
                    {showScaleCard ? "on" : "off"}
                  </button>
                  <span
                    data-testid="scale-card-verdict"
                    data-verdict={scaleVerdict?.verdict ?? "unknown"}
                    title={scaleVerdict?.summary ?? "No reliable scale verdict for this image"}
                    className={cn(
                      "rounded-md border px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.12em]",
                      scaleVerdict?.verdict === "pass" &&
                        "border-emerald-400/70 bg-emerald-950/80 text-emerald-100",
                      scaleVerdict?.verdict === "fail" &&
                        "border-red-400/70 bg-red-950/80 text-red-100",
                      (scaleVerdict?.verdict === "unverified" || !scaleVerdict) &&
                        "border-amber-400/70 bg-amber-950/80 text-amber-100",
                    )}
                  >
                    {scaleVerdict?.label ?? "Scale unverified"}
                    {scaleVerdict?.visibleHeightPct != null
                      ? ` · ${scaleVerdict.visibleHeightPct.toFixed(1)}% visible`
                      : ""}
                    {scaleVerdict?.scaleDeltaMm != null
                      ? ` · HΔ ${scaleVerdict.scaleDeltaMm.toFixed(1)} mm`
                      : ""}
                    {scaleVerdict?.diameterDeltaMm != null
                      ? ` · ØΔ ${scaleVerdict.diameterDeltaMm.toFixed(1)} mm`
                      : ""}
                    {scaleVerdict?.assembledDeltaMm != null
                      ? ` · AΔ ${scaleVerdict.assembledDeltaMm.toFixed(1)} mm`
                      : ""}
                  </span>
                </div>
                {scaleVerdict && (
                  <p
                    data-testid="scale-card-verdict-detail"
                    className={cn(
                      "mt-1 text-right text-[10px] leading-snug",
                      scaleVerdict.verdict === "fail"
                        ? "text-red-300"
                        : scaleVerdict.verdict === "pass"
                          ? "text-emerald-300"
                          : "text-amber-300",
                    )}
                  >
                    {scaleVerdict.summary}
                    {scaleVerdict.calibrationVersion
                      ? ` · ${scaleVerdict.calibrationVersion}`
                      : ""}
                  </p>
                )}
              </div>
            )}
            <motion.div
                ref={previewContainerRef}
                className="relative flex-1 flex items-center justify-center bg-[var(--darkroom-bg)] rounded-xl overflow-hidden min-h-0"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              onAnimationComplete={measureImgBox}
            >
              {/* Show Ad Overlay when in ad tab */}
              {activeTab === "ad" && displayedImage ? (
                <div className="w-full h-full max-w-full max-h-full flex items-center justify-center">
                  <AdOverlay
                    ref={adOverlayRef}
                    imageUrl={displayedImage}
                    config={adConfig}
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              ) : (
                <>
                {displayedImage && (
              <img
                ref={previewImgRef}
                src={displayedImage}
                alt={image.product?.name || image.sessionName || "Selected image"}
                  className="max-w-full max-h-full object-contain rounded-lg"
                  onLoad={measureImgBox}
              />
                )}

              {/* Scale-card overlay, pinned to the rendered image box */}
              {scaleCardModel && showScaleCard && imgBox && activeTab !== "ad" && (
                <div
                  className="pointer-events-none absolute"
                  style={{ top: imgBox.top, left: imgBox.left, width: imgBox.width, height: imgBox.height }}
                >
                  <ScaleCardOverlay
                    model={scaleCardModel}
                    density="full"
                    verdict={scaleVerdict}
                  />
                </div>
              )}

              {/* Text Overlay Preview (if set) */}
              {textOverlay.headline && (
                <div className={cn(
                    "absolute left-0 right-0 px-4 md:px-6 py-3 md:py-4 text-center pointer-events-none",
                    textOverlay.position === "top" && "top-0 bg-gradient-to-b from-black/70 to-transparent",
                    textOverlay.position === "center" && "top-1/2 -translate-y-1/2 bg-black/50",
                    textOverlay.position === "bottom" && "bottom-0 bg-gradient-to-t from-black/70 to-transparent"
                )}>
                  {textOverlay.headline && (
                      <h2 className="font-serif text-xl md:text-2xl font-semibold text-white drop-shadow-lg">
                      {textOverlay.headline}
                    </h2>
                  )}
                  {textOverlay.subtext && (
                      <p className="text-sm md:text-base text-white/85 drop-shadow-md mt-1">
                      {textOverlay.subtext}
                    </p>
                  )}
                </div>
              )}
                </>
              )}
            </motion.div>

              {image.product && (
                <div className="mt-3 md:mt-4 rounded-lg border border-[rgba(184,149,106,0.16)] bg-[var(--darkroom-surface)] px-3 py-2.5">
                  <div className="text-[13px] font-medium leading-snug text-[var(--darkroom-text)]">
                    {image.product.name}
                  </div>
                  {(image.product.graceSku || image.product.websiteSku) && (
                    <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 font-mono text-[11px] text-[rgba(245,240,230,0.62)]">
                      {image.product.graceSku && <span>{image.product.graceSku}</span>}
                      {image.product.websiteSku &&
                        image.product.websiteSku !== image.product.graceSku && (
                          <span>Website {image.product.websiteSku}</span>
                        )}
                    </div>
                  )}
                  {image.product.details && image.product.details.length > 0 && (
                    <div className="mt-1 text-[11px] leading-relaxed text-[rgba(245,240,230,0.52)]">
                      {image.product.details.join(" · ")}
                    </div>
                  )}
                </div>
              )}

              {/* Quick Actions - Stack on mobile, row on desktop */}
              <div className="grid grid-cols-3 md:flex md:flex-wrap md:justify-center gap-2 md:gap-3 mt-3 md:mt-4">
              <Button
                  variant="ghost"
                size="sm"
                onClick={handleCopyPrompt}
                  className="h-10 md:h-9 border border-[rgba(184,149,106,0.4)] bg-transparent text-[var(--darkroom-text)] hover:bg-[rgba(184,149,106,0.15)] hover:text-[var(--darkroom-text)] hover:border-[var(--darkroom-accent)] text-xs md:text-sm"
              >
                  <Copy className="w-4 h-4 md:mr-2" />
                  <span className="hidden md:inline">Copy Prompt</span>
              </Button>
              <Button
                  variant="ghost"
                size="sm"
                onClick={handleDownload}
                  className="h-10 md:h-9 border border-[rgba(184,149,106,0.4)] bg-transparent text-[var(--darkroom-text)] hover:bg-[rgba(184,149,106,0.15)] hover:text-[var(--darkroom-text)] hover:border-[var(--darkroom-accent)] text-xs md:text-sm"
              >
                  <Download className="w-4 h-4 md:mr-2" />
                  <span className="hidden md:inline">Download</span>
              </Button>
              <Button
                variant="brass"
                size="sm"
                disabled
                title="Coming Soon"
                className="h-10 md:h-9 text-xs md:text-sm opacity-50 cursor-not-allowed"
              >
                  <Film className="w-4 h-4 md:mr-2" />
                  <span className="hidden md:inline">Coming Soon</span>
              </Button>
            </div>
          </div>

          {/* Editor Panel */}
            <div className="flex flex-col bg-[var(--darkroom-surface)] overflow-hidden min-h-0">
            {/* Tabs - Scrollable on mobile, fixed on desktop */}
              <div className="shrink-0 flex border-b border-[rgba(184,149,106,0.15)] overflow-x-auto scrollbar-hide">
              <button
                className={cn(
                    "flex-shrink-0 flex items-center justify-center gap-1 py-2.5 px-2.5 text-[11px] font-medium transition-all",
                    activeTab === "refine"
                      ? "text-[var(--darkroom-accent)] bg-[rgba(184,149,106,0.1)] shadow-[inset_0_-2px_0_var(--darkroom-accent)]"
                      : "text-[rgba(245,240,230,0.5)] hover:text-[rgba(245,240,230,0.8)] hover:bg-[rgba(184,149,106,0.05)]"
                )}
                onClick={() => setActiveTab("refine")}
                title="Refine Image"
              >
                <Wand2 className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="hidden sm:inline whitespace-nowrap">Refine</span>
              </button>
              <button
                className={cn(
                    "flex-shrink-0 flex items-center justify-center gap-1 py-2.5 px-2.5 text-[11px] font-medium transition-all",
                    activeTab === "variations"
                      ? "text-[var(--darkroom-accent)] bg-[rgba(184,149,106,0.1)] shadow-[inset_0_-2px_0_var(--darkroom-accent)]"
                      : "text-[rgba(245,240,230,0.5)] hover:text-[rgba(245,240,230,0.8)] hover:bg-[rgba(184,149,106,0.05)]"
                )}
                onClick={() => setActiveTab("variations")}
                title="Create Variations"
              >
                <ImageIcon className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="hidden sm:inline whitespace-nowrap">Vary</span>
              </button>
              <button
                className={cn(
                    "flex-shrink-0 flex items-center justify-center gap-1 py-2.5 px-2.5 text-[11px] font-medium transition-all",
                    activeTab === "text"
                      ? "text-[var(--darkroom-accent)] bg-[rgba(184,149,106,0.1)] shadow-[inset_0_-2px_0_var(--darkroom-accent)]"
                      : "text-[rgba(245,240,230,0.5)] hover:text-[rgba(245,240,230,0.8)] hover:bg-[rgba(184,149,106,0.05)]"
                )}
                onClick={() => setActiveTab("text")}
                title="Add Text Overlay"
              >
                <Type className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="hidden sm:inline whitespace-nowrap">Text</span>
              </button>
              <button
                className={cn(
                    "flex-shrink-0 flex items-center justify-center gap-1 py-2.5 px-2.5 text-[11px] font-medium transition-all",
                    activeTab === "ad"
                      ? "text-[var(--darkroom-accent)] bg-[rgba(184,149,106,0.1)] shadow-[inset_0_-2px_0_var(--darkroom-accent)]"
                      : "text-[rgba(245,240,230,0.5)] hover:text-[rgba(245,240,230,0.8)] hover:bg-[rgba(184,149,106,0.05)]"
                )}
                onClick={() => setActiveTab("ad")}
                title="Create Ad"
              >
                <Layout className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="hidden sm:inline whitespace-nowrap">Ad</span>
              </button>
              <button
                className={cn(
                    "flex-shrink-0 flex items-center justify-center gap-1 py-2.5 px-2.5 text-[11px] font-medium transition-all",
                    activeTab === "bg-remove"
                      ? "text-[var(--darkroom-accent)] bg-[rgba(184,149,106,0.1)] shadow-[inset_0_-2px_0_var(--darkroom-accent)]"
                      : "text-[rgba(245,240,230,0.5)] hover:text-[rgba(245,240,230,0.8)] hover:bg-[rgba(184,149,106,0.05)]"
                )}
                onClick={() => setActiveTab("bg-remove")}
                title="Remove Background"
              >
                <Scissors className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="hidden sm:inline whitespace-nowrap">BG</span>
              </button>
            </div>

              {/* Tab Content - Scrollable */}
              <div className="flex-1 overflow-y-auto p-4 md:p-5 min-h-0">
              {/* Refine Tab */}
              {activeTab === "refine" && (
                <motion.div
                    className="flex flex-col gap-4"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-sm font-medium text-[rgba(245,240,230,0.7)]">
                        Describe what you'd like to change
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isGenerating}
                        onClick={() => {
                          setRefinementPrompt(duplicateCapQuickEdit.instruction);
                          void handleRefine(duplicateCapQuickEdit.instruction);
                        }}
                        title="Run a short edit that removes duplicate loose cap artifacts"
                        className="h-7 shrink-0 border border-[rgba(184,149,106,0.25)] px-2 text-[10px] text-[var(--darkroom-accent)] hover:bg-[rgba(184,149,106,0.1)]"
                      >
                        <Wand2 className="mr-1 h-3 w-3" />
                        {duplicateCapQuickEdit.label}
                      </Button>
                    </div>
                  <Textarea
                    value={refinementPrompt}
                    onChange={(e) => setRefinementPrompt(e.target.value)}
                    placeholder="Short edit only, e.g. remove the duplicate cap, keep one loose cap beside the bottle, and preserve the exposed sprayer top"
                      className="bg-[rgba(26,24,22,0.8)] border-[rgba(184,149,106,0.2)] text-[var(--darkroom-text)] placeholder:text-[rgba(245,240,230,0.4)] focus:border-[var(--darkroom-accent)] focus:ring-1 focus:ring-[rgba(184,149,106,0.2)] resize-none"
                    rows={4}
                  />
                  {refinePromptLooksBlocked && (
                    <p className="text-xs text-amber-300">
                      Refine expects a short edit instruction. Full generated prompts and code blocks are blocked here.
                    </p>
                  )}
                  <Button
                    variant="brass"
                    onClick={() => void handleRefine()}
                    disabled={isGenerating || !refinementPrompt.trim() || refinePromptLooksBlocked}
                      className="w-full"
                      title={
                        refinePromptLooksBlocked
                          ? "Use a short edit instruction instead of the full original prompt"
                          : !refinementPrompt.trim()
                            ? "Enter a short edit instruction first"
                            : "Generate a refined image"
                      }
                  >
                    {isGenerating ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Wand2 className="w-4 h-4 mr-2" />
                    )}
                    {isGenerating
                      ? "Generating..."
                      : refinePromptLooksBlocked
                        ? "Use Short Edit"
                        : refinementPrompt.trim()
                          ? "Refine Image"
                          : "Enter Edit"}
                  </Button>

                  {/* Original Prompt Display */}
                    {image?.prompt && (
                      <div className="mt-2 p-3 bg-[rgba(26,24,22,0.5)] rounded-lg border border-[rgba(184,149,106,0.1)]">
                        <span className="text-[0.65rem] uppercase tracking-wider text-[rgba(184,149,106,0.6)]">
                          Original prompt:
                        </span>
                        <p className="text-[0.75rem] text-[rgba(245,240,230,0.6)] mt-1 leading-relaxed">
                          {image.prompt}
                        </p>
                  </div>
                    )}
                </motion.div>
              )}

              {/* Variations Tab */}
              {activeTab === "variations" && (
                <motion.div
                    className="flex flex-col gap-4"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium text-[var(--darkroom-text)]">Style Variations</h4>
                    <Button
                        variant="ghost"
                      size="sm"
                      onClick={handleGenerateVariations}
                      disabled={isGenerating}
                        className="border border-[rgba(184,149,106,0.4)] bg-transparent text-[var(--darkroom-text)] hover:bg-[rgba(184,149,106,0.15)] hover:text-[var(--darkroom-text)] hover:border-[var(--darkroom-accent)]"
                    >
                      {isGenerating ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4 mr-2" />
                      )}
                      Generate
                    </Button>
                  </div>

                  {/* Original + Variations Grid */}
                    <div className="grid grid-cols-2 gap-3">
                    {/* Original Image */}
                    <button
                      className={cn(
                          "relative aspect-square rounded-lg overflow-hidden border-2 bg-[var(--darkroom-bg)] cursor-pointer transition-all",
                          !selectedVariationId
                            ? "border-[var(--darkroom-accent)] shadow-[0_0_0_2px_rgba(184,149,106,0.2)]"
                            : "border-transparent hover:border-[rgba(184,149,106,0.3)]"
                      )}
                      onClick={() => setSelectedVariationId(null)}
                    >
                        <img src={image.imageUrl} alt="Original" className="w-full h-full object-cover" />
                      {!selectedVariationId && (
                          <div className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center bg-[var(--darkroom-accent)] rounded-full">
                            <Check className="w-4 h-4 text-[var(--darkroom-bg)]" />
                        </div>
                      )}
                        <span className="absolute bottom-2 left-2 text-[0.65rem] font-semibold text-white bg-black/60 px-1.5 py-0.5 rounded">
                          Original
                        </span>
                    </button>

                    {/* Generated Variations */}
                    {variations.map((variation, index) => (
                      <button
                        key={variation.id}
                        className={cn(
                            "relative aspect-square rounded-lg overflow-hidden border-2 bg-[var(--darkroom-bg)] cursor-pointer transition-all",
                            selectedVariationId === variation.id
                              ? "border-[var(--darkroom-accent)] shadow-[0_0_0_2px_rgba(184,149,106,0.2)]"
                              : "border-transparent hover:border-[rgba(184,149,106,0.3)]"
                        )}
                        onClick={() => !variation.isGenerating && setSelectedVariationId(variation.id)}
                        disabled={variation.isGenerating}
                      >
                        {variation.isGenerating ? (
                            <div className="w-full h-full flex items-center justify-center text-[var(--darkroom-accent)]">
                            <Loader2 className="w-6 h-6 animate-spin" />
                          </div>
                        ) : (
                          <>
                              <img src={variation.imageUrl} alt={`Variation ${index + 1}`} className="w-full h-full object-cover" />
                            {selectedVariationId === variation.id && (
                                <div className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center bg-[var(--darkroom-accent)] rounded-full">
                                  <Check className="w-4 h-4 text-[var(--darkroom-bg)]" />
                              </div>
                            )}
                          </>
                        )}
                          <span className="absolute bottom-2 left-2 text-[0.65rem] font-semibold text-white bg-black/60 px-1.5 py-0.5 rounded">
                          {variation.isGenerating ? "Generating..." : `V${index + 1}`}
                        </span>
                      </button>
                    ))}
                  </div>

                  {variations.length === 0 && !isGenerating && (
                      <p className="text-sm text-[rgba(245,240,230,0.4)] text-center py-8">
                      Click "Generate" to create style variations of this image
                    </p>
                  )}
                </motion.div>
              )}

              {/* Text Tab */}
              {activeTab === "text" && (
                <motion.div
                    className="flex flex-col gap-4"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[0.75rem] font-medium text-[rgba(245,240,230,0.7)]">Headline</label>
                    <input
                      type="text"
                      value={textOverlay.headline}
                      onChange={(e) => setTextOverlay((prev) => ({ ...prev, headline: e.target.value }))}
                      placeholder="Enter headline text..."
                        className="bg-[rgba(26,24,22,0.8)] border border-[rgba(184,149,106,0.2)] rounded-lg px-3.5 py-2.5 text-[var(--darkroom-text)] text-sm placeholder:text-[rgba(245,240,230,0.4)] focus:outline-none focus:border-[var(--darkroom-accent)] focus:ring-1 focus:ring-[rgba(184,149,106,0.2)] transition-all"
                    />
                  </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[0.75rem] font-medium text-[rgba(245,240,230,0.7)]">Subtext</label>
                    <input
                      type="text"
                      value={textOverlay.subtext}
                      onChange={(e) => setTextOverlay((prev) => ({ ...prev, subtext: e.target.value }))}
                      placeholder="Enter subtext..."
                        className="bg-[rgba(26,24,22,0.8)] border border-[rgba(184,149,106,0.2)] rounded-lg px-3.5 py-2.5 text-[var(--darkroom-text)] text-sm placeholder:text-[rgba(245,240,230,0.4)] focus:outline-none focus:border-[var(--darkroom-accent)] focus:ring-1 focus:ring-[rgba(184,149,106,0.2)] transition-all"
                    />
                  </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[0.75rem] font-medium text-[rgba(245,240,230,0.7)]">Position</label>
                      <div className="flex gap-2">
                      {(["top", "center", "bottom"] as const).map((pos) => (
                        <button
                          key={pos}
                          className={cn(
                              "flex-1 py-2 px-3 bg-[rgba(26,24,22,0.8)] border rounded-md text-[0.75rem] transition-all",
                              textOverlay.position === pos
                                ? "border-[var(--darkroom-accent)] bg-[rgba(184,149,106,0.15)] text-[var(--darkroom-accent)]"
                                : "border-[rgba(184,149,106,0.2)] text-[rgba(245,240,230,0.6)] hover:border-[rgba(184,149,106,0.4)] hover:text-[rgba(245,240,230,0.8)]"
                          )}
                          onClick={() => setTextOverlay((prev) => ({ ...prev, position: pos }))}
                        >
                          {pos.charAt(0).toUpperCase() + pos.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                    <p className="text-[0.7rem] text-[rgba(245,240,230,0.4)] mt-2">
                    Text will be rendered on the image when you export
                  </p>
                </motion.div>
              )}

              {/* Ad Tab */}
              {activeTab === "ad" && (
                <motion.div
                  className="flex flex-col gap-5"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  {/* Preset Selector */}
                  <div className="flex flex-col gap-2.5">
                    <span className="text-[0.65rem] uppercase tracking-wider font-semibold text-[rgba(245,240,230,0.5)]">
                      Choose Layout
                    </span>
                    <AdPresetSelector
                      selectedPresetId={adConfig.preset.id}
                      onSelectPreset={handleSelectAdPreset}
                    />
                  </div>

                  {/* Text Inputs */}
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[0.75rem] font-medium text-[rgba(245,240,230,0.7)]">Headline</label>
                      <input
                        type="text"
                        value={adConfig.headline}
                        onChange={(e) =>
                          setAdConfig((prev) => ({ ...prev, headline: e.target.value }))
                        }
                        placeholder="e.g., SUMMER SALE"
                        className="bg-[rgba(26,24,22,0.6)] border border-[rgba(184,149,106,0.2)] rounded-md px-3 py-2.5 text-[var(--darkroom-text)] text-sm focus:outline-none focus:border-[var(--darkroom-accent)] transition-all"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[0.75rem] font-medium text-[rgba(245,240,230,0.7)]">Subtext</label>
                      <input
                        type="text"
                        value={adConfig.subtext}
                        onChange={(e) =>
                          setAdConfig((prev) => ({ ...prev, subtext: e.target.value }))
                        }
                        placeholder="e.g., Up to 50% off all items"
                        className="bg-[rgba(26,24,22,0.6)] border border-[rgba(184,149,106,0.2)] rounded-md px-3 py-2.5 text-[var(--darkroom-text)] text-sm focus:outline-none focus:border-[var(--darkroom-accent)] transition-all"
                      />
                    </div>
                    {adConfig.preset.layout.hasCTA && (
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[0.75rem] font-medium text-[rgba(245,240,230,0.7)]">CTA Button</label>
                        <input
                          type="text"
                          value={adConfig.ctaText}
                          onChange={(e) =>
                            setAdConfig((prev) => ({ ...prev, ctaText: e.target.value }))
                          }
                          placeholder="e.g., Shop Now"
                          className="bg-[rgba(26,24,22,0.6)] border border-[rgba(184,149,106,0.2)] rounded-md px-3 py-2.5 text-[var(--darkroom-text)] text-sm focus:outline-none focus:border-[var(--darkroom-accent)] transition-all"
                        />
                      </div>
                    )}
                  </div>

                  {/* Customize Section (Collapsible) */}
                  <div className="border-t border-[rgba(184,149,106,0.15)] pt-4">
                    <button
                      className="flex items-center justify-between w-full py-2 text-xs font-medium text-[rgba(245,240,230,0.6)] hover:text-[rgba(245,240,230,0.8)] transition-colors"
                      onClick={() => setShowCustomizeAd(!showCustomizeAd)}
                    >
                      <span>Customize Colors & Font</span>
                      <ChevronRight
                        className={cn(
                          "w-4 h-4 transition-transform",
                          showCustomizeAd && "rotate-90"
                        )}
                      />
                    </button>

                    {showCustomizeAd && (
                      <div className="flex flex-col gap-4 pt-3">
                        {/* Color Block Color */}
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[0.65rem] text-[rgba(245,240,230,0.5)]">Background Color</label>
                          <div className="flex flex-wrap gap-1.5">
                            {AD_COLOR_PRESETS.map((color) => (
                              <button
                                key={color.value}
                                className={cn(
                                  "w-6 h-6 rounded border-2 border-transparent transition-transform hover:scale-110",
                                  (adConfig.colorBlockColor || adConfig.preset.defaultStyles.colorBlockColor) === color.value &&
                                    "border-white shadow-[0_0_0_1px_rgba(184,149,106,0.5)]"
                                )}
                                style={{ backgroundColor: color.value }}
                                onClick={() =>
                                  setAdConfig((prev) => ({ ...prev, colorBlockColor: color.value }))
                                }
                                title={color.name}
                              />
                            ))}
                          </div>
                        </div>

                        {/* Text Color */}
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[0.65rem] text-[rgba(245,240,230,0.5)]">Text Color</label>
                          <div className="flex flex-wrap gap-1.5">
                            {AD_COLOR_PRESETS.map((color) => (
                              <button
                                key={color.value}
                                className={cn(
                                  "w-6 h-6 rounded border-2 border-transparent transition-transform hover:scale-110",
                                  (adConfig.textColor || adConfig.preset.defaultStyles.textColor) === color.value &&
                                    "border-white shadow-[0_0_0_1px_rgba(184,149,106,0.5)]"
                                )}
                                style={{ backgroundColor: color.value }}
                                onClick={() =>
                                  setAdConfig((prev) => ({ ...prev, textColor: color.value }))
                                }
                                title={color.name}
                              />
                            ))}
                          </div>
                        </div>

                        {/* CTA Color (if has CTA) */}
                        {adConfig.preset.layout.hasCTA && (
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[0.65rem] text-[rgba(245,240,230,0.5)]">Button Color</label>
                            <div className="flex flex-wrap gap-1.5">
                              {AD_COLOR_PRESETS.map((color) => (
                                <button
                                  key={color.value}
                                  className={cn(
                                    "w-6 h-6 rounded border-2 border-transparent transition-transform hover:scale-110",
                                    (adConfig.ctaBackgroundColor || adConfig.preset.defaultStyles.ctaBackgroundColor) === color.value &&
                                      "border-white shadow-[0_0_0_1px_rgba(184,149,106,0.5)]"
                                  )}
                                  style={{ backgroundColor: color.value }}
                                  onClick={() =>
                                    setAdConfig((prev) => ({ ...prev, ctaBackgroundColor: color.value }))
                                  }
                                  title={color.name}
                                />
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Font Selection */}
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[0.65rem] text-[rgba(245,240,230,0.5)]">Font</label>
                          <div className="flex flex-wrap gap-1.5">
                            {AD_FONT_OPTIONS.map((font) => (
                              <button
                                key={font.value}
                                className={cn(
                                  "px-2.5 py-1.5 rounded border text-[0.65rem] transition-all",
                                  (adConfig.fontFamily || adConfig.preset.defaultStyles.fontFamily) === font.value
                                    ? "border-[var(--darkroom-accent)] bg-[rgba(184,149,106,0.15)] text-[var(--darkroom-accent)]"
                                    : "border-[rgba(184,149,106,0.2)] bg-[rgba(26,24,22,0.4)] text-[rgba(245,240,230,0.6)] hover:text-[rgba(245,240,230,0.8)]"
                                )}
                                style={{ fontFamily: font.style }}
                                onClick={() =>
                                  setAdConfig((prev) => ({ ...prev, fontFamily: font.value }))
                                }
                              >
                                {font.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 mt-2">
                    <button
                      className="p-2.5 rounded-md border border-[rgba(184,149,106,0.2)] text-[rgba(245,240,230,0.5)] hover:text-[rgba(245,240,230,0.7)] hover:border-[rgba(184,149,106,0.4)] transition-all"
                      onClick={handleResetAdConfig}
                      title="Reset Ad"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                    <button
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md bg-[var(--darkroom-accent)] text-[var(--darkroom-bg)] font-semibold text-sm hover:bg-[var(--darkroom-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                      onClick={handleExportAd}
                      disabled={isExportingAd || (!adConfig.headline && !adConfig.subtext && !adConfig.ctaText)}
                    >
                      {isExportingAd ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Exporting...
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4" />
                          Export Ad
                        </>
                      )}
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Background Removal Tab */}
              {activeTab === "bg-remove" && image && (
                <BackgroundRemovalTab
                  imageUrl={displayedImage || image.imageUrl}
                  onImageProcessed={(newImageUrl, savedImageId) => {
                    if (onImageGenerated && savedImageId) {
                      onImageGenerated({
                        id: savedImageId,
                        imageUrl: newImageUrl,
                        prompt: "Background removed",
                        isSaved: true,
                      });
                    }
                  }}
                />
              )}
            </div>

              {/* Footer Actions - Stack on mobile */}
              <div className="shrink-0 flex flex-col sm:flex-row gap-2 sm:gap-3 px-4 md:px-5 py-3 md:py-4 border-t border-[rgba(184,149,106,0.15)] bg-[var(--darkroom-surface-elevated)]">
              {!image.isSaved && (
                <Button
                    variant="ghost"
                  onClick={handleSave}
                  disabled={isSaving}
                    className="flex-1 h-11 sm:h-10 border border-[rgba(184,149,106,0.4)] bg-transparent text-[var(--darkroom-text)] hover:bg-[rgba(184,149,106,0.15)] hover:text-[var(--darkroom-text)] hover:border-[var(--darkroom-accent)]"
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Save to Library
                </Button>
              )}
                <Button variant="brass" onClick={handleDownload} className="flex-1 h-11 sm:h-10">
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </div>
            ) : (
              <div className="flex items-center justify-center p-8 text-[rgba(245,240,230,0.5)]">
                <p>No image selected</p>
              </div>
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
