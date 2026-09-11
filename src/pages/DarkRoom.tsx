/**
 * Dark Room - Madison Studio's Image Generation Studio
 *
 * A clean, sophisticated image generation interface with purposeful animations
 * that mimic darkroom photography processes.
 */

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { madison } from "@/lib/madisonToast";
import { v4 as uuidv4 } from "uuid";
import { Bookmark, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LibrarianTrigger } from "@/components/librarian";
import { SavePromptDialog } from "@/components/prompt-library/SavePromptDialog";
import { DEFAULT_IMAGE_AI_PROVIDER } from "@/config/imageSettings";
import { useGridPipelineFeatureFlag } from "@/hooks/useGridPipelineFeatureFlag";
import {
  BACKGROUND_SCENE_TAG,
  LIBRARY_ROLE_PRODUCT,
  LIBRARY_ROLE_BACKGROUND_SCENE,
  LIBRARY_ROLE_STYLE_REFERENCE,
} from "@/lib/imageLibraryTags";
import {
  BEST_BOTTLES_DARKROOM_UNASSIGNED_TAGS,
} from "@/lib/bestBottlesDarkroomAssetWorkflow";
import { readPreserveCanvasGenerationMetadata } from "@/lib/imageCanvasMetadata";
import { prepareImageReferenceForGeneration } from "@/lib/generationReferenceImages";
import {
  buildDarkroomSchematicPrompt,
  type DarkroomSchematicPromptMode,
} from "@/lib/darkroomSchematicPrompts";
import {
  HERO_SET_ASPECT_RATIO,
  HERO_SET_CANVAS,
  HERO_SET_MODEL,
  buildHeroSetPrompt,
  getHeroSetPreset,
  type HeroSetPopulation,
  type HeroSetPresetId,
} from "@/lib/darkroomHeroSetPresets";
import {
  BEST_BOTTLES_STONE_HERO_PRESETS,
  buildBestBottlesStoneHeroPrompt,
  type BestBottlesStoneHeroArrangement,
} from "@/lib/darkroomHeroPrompts";
import {
  resolveDarkroomGenerationCanvas,
  type DarkroomGenerationCanvasMode,
} from "@/lib/darkroomGenerationCanvas";
import {
  getSupabaseFunctionErrorMessage,
  resolveEdgeSafeImageSettings,
} from "@/lib/imageGenerationEdgeSafety";
import {
  buildDarkroomProductContext,
  loadBestBottlesMeasurementOverrides,
  summarizeDarkroomProductContext,
  type DarkroomImageStatus,
} from "@/lib/darkroomProductContext";
import { resolveDarkroomProductReferenceImage } from "@/lib/darkroomProductReference";

/** Prepended in background-plate mode so models do not invent products on the set. */
const BACKGROUND_PLATE_PROMPT_PREFIX =
  "Empty set / background plate only. Do NOT show any products, bottles, cosmetics, jars, pumps, sprayers, caps, or labels. Leave believable negative space where products could be composited later. Professional studio or lifestyle environment. ";

// Supabase & Auth
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentOrganizationId } from "@/hooks/useIndustryConfig";
import { Product } from "@/hooks/useProducts";

// Dark Room Components
import {
  LeftRail,
  CenterCanvas,
  RightPanel,
  DarkRoomHeader,
  DarkRoomMadisonDrawer,
  MobileDarkRoom,
  getRandomBackgroundVariation,
  getCompositionPrompt,
} from "@/components/darkroom";
import type { ProModeSettings } from "@/components/darkroom";

// Camera Feedback (sound + flash)
import { useCameraFeedback } from "@/hooks/useCameraFeedback";

// Hook to detect mobile
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 1024);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  return isMobile;
}

// Styles
import "@/styles/darkroom.css";

// Constants
const MAX_IMAGES_PER_SESSION = 10;

/** Human-readable toast copy per resolved Product Reference Image source. */
const REFERENCE_SOURCE_TOAST: Record<"product-hub" | "pipeline-reference" | "best-bottles-catalog", string> = {
  "product-hub": "Loaded from the Product Hub / DAM hero image.",
  "pipeline-reference": "Loaded the clean pipeline reference for this SKU.",
  "best-bottles-catalog": "Loaded the Best Bottles catalog photo.",
};

// Types
interface UploadedImage {
  url: string;
  file?: File;
  name?: string;
}

interface GeneratedImage {
  id: string;
  imageUrl: string;
  prompt: string;
  timestamp: number;
  isSaved: boolean;
  isHero?: boolean;
  /**
   * The ratio this image was actually generated at. Carried so downstream
   * surfaces — the Light Table above all — never have to re-derive it by
   * loading the pixels, which fails silently and squares the image.
   */
  aspectRatio?: string;
}

type DarkRoomGenerationMode = "standard" | "missing-variant-asset" | "finish-correct-revision";

interface HistoryItem {
  id: string;
  prompt: string;
  timestamp: Date;
}

interface Suggestion {
  id: string;
  text: string;
  type: "enhancement" | "variation" | "creative";
}

// Quick presets
const DEFAULT_PRESETS = [
  "Golden hour glow",
  "Minimalist white",
  "Luxury marble",
  "Natural botanical",
  "Dramatic shadows",
  "Soft diffused light",
];

// Default suggestions (context-aware ones are generated)
const generateSuggestions = (
  hasProduct: boolean,
  hasBackground: boolean,
  prompt: string
): Suggestion[] => {
  const suggestions: Suggestion[] = [];

  if (hasProduct && !hasBackground) {
    suggestions.push({
      id: "sug-1",
      text: "Place product on weathered sandstone blocks with warm desert light",
      type: "creative",
    });
    suggestions.push({
      id: "sug-2",
      text: "Studio shot with soft gradient background and subtle reflection",
      type: "enhancement",
    });
  } else if (hasProduct && hasBackground) {
    suggestions.push({
      id: "sug-3",
      text: "Add soft shadows and enhanced depth of field",
      type: "enhancement",
    });
    suggestions.push({
      id: "sug-4",
      text: "Shift lighting to golden hour warmth",
      type: "variation",
    });
  } else {
    suggestions.push({
      id: "sug-5",
      text: "Elegant perfume bottle on white marble with soft window light",
      type: "creative",
    });
    suggestions.push({
      id: "sug-6",
      text: "Hero product shot with dramatic studio lighting",
      type: "creative",
    });
  }

  return suggestions;
};

export default function DarkRoom() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { orgId, loading: orgLoading } = useCurrentOrganizationId();
  const { enabled: isBestBottlesOrg } = useGridPipelineFeatureFlag();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  // Debug: Log org resolution
  console.log("🏢 Organization state:", { orgId, orgLoading, userId: user?.id });

  // Session
  const [sessionId] = useState(() => uuidv4());
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [heroImageId, setHeroImageId] = useState<string | null>(null);
  const [newlyGeneratedId, setNewlyGeneratedId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Inputs
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productImage, setProductImage] = useState<UploadedImage | null>(null);
  /** Where the current Product Reference Image came from (for the context card). */
  const [productImageSource, setProductImageSource] = useState<DarkroomImageStatus | null>(null);
  const [backgroundImage, setBackgroundImage] = useState<UploadedImage | null>(null);
  const [styleReference, setStyleReference] = useState<UploadedImage | null>(null);
  const [navigationLibraryTags, setNavigationLibraryTags] = useState<string[]>([]);
  const [navigationGenerationMode, setNavigationGenerationMode] = useState<DarkRoomGenerationMode>("standard");
  const [bestBottlesHeroStoneIndex, setBestBottlesHeroStoneIndex] = useState(0);
  // Set only by a hero-set preset load. Every other prompt path clears it, so
  // an ultra-wide set canvas can never leak into an unrelated generation.
  const [exactGenerationCanvas, setExactGenerationCanvas] = useState<
    { width: number; height: number } | null
  >(null);
  const [generationCanvasMode, setGenerationCanvasMode] =
    useState<DarkroomGenerationCanvasMode>("preserve-source");
  const [proSettings, setProSettings] = useState<ProModeSettings>({
    aiProvider: DEFAULT_IMAGE_AI_PROVIDER,
  });

  // Multi-product slots for compositing
  const [productSlots, setProductSlots] = useState<{ id: string; imageUrl: string | null; name?: string }[]>([
    { id: "slot-0", imageUrl: null },
    { id: "slot-1", imageUrl: null },
    { id: "slot-2", imageUrl: null },
    { id: "slot-3", imageUrl: null },
    { id: "slot-4", imageUrl: null },
    { id: "slot-5", imageUrl: null },
  ]);

  // Background preset selection
  const [selectedBackgroundPreset, setSelectedBackgroundPreset] = useState<string | null>(null);

  // Composition preset selection (how to arrange products in scene)
  const [selectedCompositionPreset, setSelectedCompositionPreset] = useState<string | null>(null);

  /** Generate empty scenes tagged for the Background Scene library picker. */
  const [backgroundPlateMode, setBackgroundPlateMode] = useState(false);
  /** Tag the next render for Image Library → Style references (mood / grade boards). */
  const [styleReferenceLibraryOutput, setStyleReferenceLibraryOutput] = useState(false);

  useEffect(() => {
    if (!styleReference) setStyleReferenceLibraryOutput(false);
  }, [styleReference]);

  // Prompt - initialize from URL if provided
  const [prompt, setPrompt] = useState(() => {
    const params = new URLSearchParams(location.search);
    return params.get('prompt') || "";
  });
  const [isMadisonOpen, setIsMadisonOpen] = useState(false);
  const [isSavePromptOpen, setIsSavePromptOpen] = useState(false);
  const [promptToSave, setPromptToSave] = useState("");
  const [suggestedPromptTitle, setSuggestedPromptTitle] = useState("");

  // State
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Camera Feedback (shutter sound + flash)
  const { trigger: triggerCameraFeedback, FlashOverlay, preload: preloadSound } = useCameraFeedback({
    soundEnabled: true,
    flashEnabled: true,
  });

  // Preload sound on first user interaction
  useEffect(() => {
    const handleFirstInteraction = () => {
      console.log("[DarkRoom] First user interaction - preloading audio");
      preloadSound();
      window.removeEventListener("click", handleFirstInteraction);
      window.removeEventListener("keydown", handleFirstInteraction);
    };
    window.addEventListener("click", handleFirstInteraction, { once: true });
    window.addEventListener("keydown", handleFirstInteraction, { once: true });
    return () => {
      window.removeEventListener("click", handleFirstInteraction);
      window.removeEventListener("keydown", handleFirstInteraction);
    };
  }, [preloadSound]);

  // Derived
  const heroImage = useMemo(
    () => images.find((img) => img.id === heroImageId) || images[images.length - 1] || null,
    [images, heroImageId]
  );

  const savedCount = useMemo(
    () => images.filter((img) => img.isSaved).length,
    [images]
  );

  // Count only photography-related pro settings (not AI provider settings)
  const proSettingsCount = [proSettings.camera, proSettings.lighting, proSettings.environment].filter(Boolean).length;

  const canGenerate = useMemo(() => {
    const hasInput = backgroundPlateMode
      ? prompt.trim().length > 0 || !!selectedBackgroundPreset
      : prompt.trim().length > 0 || !!productImage;
    const hasCapacity = images.length < MAX_IMAGES_PER_SESSION;
    const hasOrg = !!orgId && !orgLoading;
    return hasInput && hasCapacity && !isGenerating && hasOrg;
  }, [
    backgroundPlateMode,
    prompt,
    productImage,
    selectedBackgroundPreset,
    images.length,
    isGenerating,
    orgId,
    orgLoading,
  ]);

  const suggestions = useMemo(
    () => generateSuggestions(!!productImage, !!backgroundImage, prompt),
    [productImage, backgroundImage, prompt]
  );

  const referenceAssets = useMemo(
    () =>
      [
        productImage ? { label: "Product", url: productImage.url } : null,
        backgroundImage ? { label: "Background", url: backgroundImage.url } : null,
        styleReference ? { label: "Style", url: styleReference.url } : null,
      ].filter((asset): asset is { label: string; url: string } => Boolean(asset)),
    [backgroundImage, productImage, styleReference]
  );

  // Best Bottles measurement overrides (static asset) — used to hydrate the
  // selected product's generation-readiness dimensions before sending context.
  const { data: measurementOverrides = [] } = useQuery({
    queryKey: ["best-bottles-measurement-overrides"],
    queryFn: loadBestBottlesMeasurementOverrides,
    staleTime: 5 * 60 * 1000,
  });

  // Enriched productContext payload sent to generate-madison-image. Carries the
  // full Product Hub context plus any Best Bottles measurement/identity fields.
  const enrichedProductContext = useMemo(
    () => (selectedProduct ? buildDarkroomProductContext(selectedProduct, measurementOverrides) : null),
    [selectedProduct, measurementOverrides],
  );

  // Compact summary for the Product Context card in the left rail.
  const productContextSummary = useMemo(
    () =>
      selectedProduct
        ? summarizeDarkroomProductContext(
            selectedProduct,
            enrichedProductContext,
            productImage,
            productImageSource,
          )
        : null,
    [selectedProduct, enrichedProductContext, productImage, productImageSource],
  );

  // Manual product-image changes (upload / library pick / remove) flow through
  // here so the context card can label the reference source correctly.
  const handleProductImageUpload = useCallback((image: UploadedImage | null) => {
    setProductImage(image);
    setProductImageSource(image ? "manual" : null);
  }, []);

  // Refs let the async auto-loader read the latest state without re-subscribing.
  const selectedProductRef = useRef<Product | null>(null);
  const productImageRef = useRef<UploadedImage | null>(null);
  const autoLoadAttemptRef = useRef<string | null>(null);
  useEffect(() => {
    selectedProductRef.current = selectedProduct;
  }, [selectedProduct]);
  useEffect(() => {
    productImageRef.current = productImage;
  }, [productImage]);

  // Auto-load the Product Reference Image when a product is selected and the
  // operator hasn't already loaded one. Resolves Product Hub hero → pipeline
  // clean reference → Best Bottles catalog photo. Existing images (manual,
  // library, navigation) are preserved — never silently replaced. Retries once
  // when the org id resolves (the pipeline lookup needs it).
  useEffect(() => {
    const product = selectedProduct;
    if (!product) {
      autoLoadAttemptRef.current = null;
      return;
    }
    if (productImageRef.current) return;

    const attemptKey = `${product.id}:${orgId ?? "no-org"}`;
    if (autoLoadAttemptRef.current === attemptKey) return;
    autoLoadAttemptRef.current = attemptKey;

    let cancelled = false;
    void (async () => {
      const resolved = await resolveDarkroomProductReferenceImage(product, orgId);
      if (cancelled || !resolved) return;
      // Bail if the selection changed or an image landed while we resolved.
      if (selectedProductRef.current?.id !== product.id) return;
      if (productImageRef.current) return;
      setProductImage({ url: resolved.url, name: resolved.name });
      setProductImageSource(resolved.source);
      madison.success("Product reference loaded", REFERENCE_SOURCE_TOAST[resolved.source]);
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedProduct, orgId]);

  const madisonSessionContext = useMemo(
    () => ({
      sessionId,
      sessionName: selectedProduct?.name ? `${selectedProduct.name} Dark Room` : "Dark Room Session",
      imagesGenerated: images.length,
      maxImages: MAX_IMAGES_PER_SESSION,
      heroImage: heroImage
        ? {
            imageUrl: heroImage.imageUrl,
            prompt: heroImage.prompt,
          }
        : undefined,
      allPrompts: Array.from(
        new Set(
          [prompt, ...history.map((item) => item.prompt)]
            .map((item) => item.trim())
            .filter(Boolean)
        )
      ),
      aspectRatio: proSettings.aspectRatio || "1:1",
      outputFormat: "png",
      isImageStudio: true,
      organizationId: orgId || undefined,
      backgroundPlateMode,
    }),
    [
      heroImage,
      history,
      images.length,
      orgId,
      proSettings.aspectRatio,
      prompt,
      selectedProduct?.name,
      sessionId,
      backgroundPlateMode,
    ]
  );

  // Effects
  useEffect(() => {
    // Check for initial data from navigation (product or background image)
    const state = location.state as {
      product?: Product;
      productImage?: { url: string; name: string };
      backgroundImage?: { url: string; name: string };
      extraLibraryTags?: string[];
      generationMode?: DarkRoomGenerationMode;
    } | undefined;

    if (state?.product) {
      setSelectedProduct(state.product);
    }

    if (state?.productImage) {
      // Explicit reference passed via navigation — treat it as operator-provided
      // so the auto-loader below leaves it untouched.
      setProductImage({
        url: state.productImage.url,
        name: state.productImage.name,
      });
      setProductImageSource("manual");
      madison.success(
        "Product reference loaded",
        state.generationMode === "missing-variant-asset"
          ? "Target-SKU-first mode loaded. The reference is only for layout and bottle geometry."
          : "Use the prompt to revise the finish while preserving composition.",
      );
    }
    // When no explicit reference image is passed, the auto-loader effect resolves
    // the product's reference (Product Hub hero → pipeline → Best Bottles catalog).

    if (state?.extraLibraryTags?.length) {
      setNavigationLibraryTags(state.extraLibraryTags);
    }

    if (state?.generationMode) {
      setNavigationGenerationMode(state.generationMode);
    }

    // If coming from Light Table with a background image, set it
    if (state?.backgroundImage) {
      setBackgroundImage({
        url: state.backgroundImage.url,
        name: state.backgroundImage.name,
      });
      madison.success("Background image loaded from Light Table");
    }
  }, [location.state]);

  // Handlers
  const handleGenerate = useCallback(async () => {
    if (!user || !canGenerate) return;

    // Check if organization is resolved
    if (!orgId) {
      console.error("❌ No organization ID found - user may need to complete onboarding");
      madison.error("Organization not found", "Please refresh the page or complete onboarding.");
      return;
    }

    // Build effective prompt with presets
    let effectivePrompt = backgroundPlateMode
      ? (prompt.trim() || "Neutral studio environment ready for product compositing")
      : (prompt.trim() || "Professional product photography");

    if (backgroundPlateMode) {
      effectivePrompt = `${BACKGROUND_PLATE_PROMPT_PREFIX}${effectivePrompt}`;
    }

    const activeProductSlots = productSlots.filter((slot) => slot.imageUrl);
    const totalProductCount = (productImage ? 1 : 0) + activeProductSlots.length;
    let appliedBackgroundPrompt: string | null = null;
    let appliedCompositionPrompt: string | null = null;

    if (selectedBackgroundPreset) {
      const backgroundVariation = getRandomBackgroundVariation(selectedBackgroundPreset);
      if (backgroundVariation) {
        appliedBackgroundPrompt = backgroundVariation;
        effectivePrompt = `${effectivePrompt}. Background: ${backgroundVariation}`;
        console.log("🎨 Background preset applied:", selectedBackgroundPreset, "→", backgroundVariation);
      }
    }

    if (!backgroundPlateMode && selectedCompositionPreset && totalProductCount > 0) {
      const compositionPrompt = getCompositionPrompt(selectedCompositionPreset, totalProductCount);
      if (compositionPrompt) {
        appliedCompositionPrompt = compositionPrompt;
        effectivePrompt = `${effectivePrompt}. Composition: ${compositionPrompt}`;
        console.log("📐 Composition preset applied:", selectedCompositionPreset, `(${totalProductCount} products)`);
      }
    }

    const goalType = backgroundPlateMode
      ? "background_scene"
      : styleReferenceLibraryOutput && styleReference
        ? "style_reference"
        : "product_photography";

    const hasProductRefs =
      !backgroundPlateMode && (!!productImage || activeProductSlots.length > 0);
    const hasBackgroundRef = !backgroundPlateMode && !!backgroundImage;

    let extraLibraryTags: string[] | undefined;
    if (backgroundPlateMode) {
      extraLibraryTags = [BACKGROUND_SCENE_TAG, LIBRARY_ROLE_BACKGROUND_SCENE];
    } else if (styleReferenceLibraryOutput && styleReference) {
      extraLibraryTags = [LIBRARY_ROLE_STYLE_REFERENCE];
    } else if (hasProductRefs) {
      extraLibraryTags = [LIBRARY_ROLE_PRODUCT];
    } else if (hasBackgroundRef) {
      extraLibraryTags = [LIBRARY_ROLE_BACKGROUND_SCENE];
    } else {
      extraLibraryTags = [LIBRARY_ROLE_PRODUCT];
    }

    if (navigationLibraryTags.length > 0) {
      extraLibraryTags = Array.from(new Set([...(extraLibraryTags ?? []), ...navigationLibraryTags]));
    }

    const hasCommercialSkuTag = (extraLibraryTags ?? []).some((tag) =>
      /^(?:sku|websiteSku|website-sku|graceSku|grace-sku|shopifySku|shopify-sku):/i.test(tag),
    );
    const hasDarkroomWorkflowTag = (extraLibraryTags ?? []).some((tag) =>
      /^(?:source:darkroom-generated|asset-status:|identity-status:|push-blocked:)/i.test(tag),
    );
    if (
      isBestBottlesOrg &&
      goalType === "product_photography" &&
      !hasCommercialSkuTag &&
      !hasDarkroomWorkflowTag
    ) {
      extraLibraryTags = Array.from(
        new Set([
          ...(extraLibraryTags ?? []),
          "brand:best-bottles",
          ...BEST_BOTTLES_DARKROOM_UNASSIGNED_TAGS,
        ]),
      );
    }

    // Trigger camera feedback (sound + flash) immediately on capture
    triggerCameraFeedback();

    setIsGenerating(true);

    try {
      const referenceImages: Array<{ url: string; description: string; label: string }> = [];
      let preparedReferenceCount = 0;
      const prepareReferenceUrl = async (url: string, label: string) => {
        const prepared = await prepareImageReferenceForGeneration(url);
        if (prepared.wasPrepared) {
          preparedReferenceCount += 1;
          console.info("[DarkRoom] Prepared large reference image for edge generation", {
            label,
            originalBytes: prepared.originalBytes,
            preparedBytes: prepared.preparedBytes,
            dimensions: prepared.width && prepared.height
              ? `${prepared.width}×${prepared.height}`
              : undefined,
            mimeType: prepared.mimeType,
          });
        }
        return prepared.url;
      };

      if (!backgroundPlateMode) {
        if (productImage) {
          referenceImages.push({
            url: await prepareReferenceUrl(productImage.url, "Product"),
            label: "Product",
            description:
              navigationGenerationMode === "missing-variant-asset"
                ? "Layout and bottle-geometry reference only. Ignore its finish, SKU, and visual identity."
                : "User-uploaded product for enhancement",
          });
        }

        if (backgroundImage) {
          referenceImages.push({
            url: await prepareReferenceUrl(backgroundImage.url, "Background"),
            label: "Background",
            description: "Background scene for composition",
          });
        }

        for (const [index, slot] of activeProductSlots.entries()) {
          referenceImages.push({
            url: await prepareReferenceUrl(slot.imageUrl!, `Product ${index + 1}`),
            label: `Product ${index + 1}`,
            description: `Additional product ${index + 1} to composite into the scene`,
          });
        }
      }

      if (styleReference) {
        referenceImages.push({
          url: await prepareReferenceUrl(styleReference.url, "Style Reference"),
          label: "Style Reference",
          description: backgroundPlateMode
            ? "Style and lighting reference for the empty scene"
            : "Style reference for lighting and mood",
        });
      }

      // Build Pro Mode payload if active (only camera/lighting/environment, not AI settings)
      const proModePayload = proSettingsCount > 0 ? {
        camera: proSettings.camera,
        lighting: proSettings.lighting,
        environment: proSettings.environment,
      } : undefined;
      const preserveCanvasSourceUrl = !backgroundPlateMode
        ? productImage?.url || activeProductSlots[0]?.imageUrl || backgroundImage?.url || null
        : null;
      const preserveCanvasMetadata = await readPreserveCanvasGenerationMetadata(preserveCanvasSourceUrl);
      const resolvedGenerationCanvas = resolveDarkroomGenerationCanvas({
        mode: generationCanvasMode,
        exactCanvas: exactGenerationCanvas,
        sourceAspectRatio: preserveCanvasMetadata.aspectRatio,
        sourceImageConstraints: preserveCanvasMetadata.imageConstraints,
        selectedAspectRatio: proSettings.aspectRatio,
        fallbackAspectRatio: "1:1",
        backgroundPlateMode,
      });
      const generationAspectRatio = resolvedGenerationCanvas.aspectRatio;
      const generationImageConstraints = resolvedGenerationCanvas.imageConstraints;
      const requestedAiProvider = proSettings.aiProvider || DEFAULT_IMAGE_AI_PROVIDER;
      const edgeSafeSettings = resolveEdgeSafeImageSettings({
        aiProvider: requestedAiProvider,
        resolution: proSettings.resolution || "standard",
        outputFormat: "png",
        hasReferenceImages: referenceImages.length > 0,
        surface: "darkroom",
        goalType,
      });

      console.log("🌑 Dark Room Generate:", {
        prompt: effectivePrompt,
        referenceImages: referenceImages.length,
        productSlots: activeProductSlots.length,
        proMode: proModePayload,
        product: selectedProduct?.name,
        organizationId: orgId,
        userId: user.id,
        aiProvider: requestedAiProvider,
        resolution: edgeSafeSettings.resolution,
        outputFormat: edgeSafeSettings.outputFormat,
        edgeSafeAdjusted: edgeSafeSettings.adjusted ? edgeSafeSettings.reasons : undefined,
        visualSquad: proSettings.visualSquad || "auto",
        backgroundPreset: selectedBackgroundPreset,
        compositionPreset: selectedCompositionPreset,
        backgroundPlateMode,
        navigationGenerationMode,
        goalType,
        preparedReferenceCount,
        canvasMode: resolvedGenerationCanvas.modeApplied,
        sourceCanvas: preserveCanvasMetadata.canvas
          ? `${preserveCanvasMetadata.canvas.width}×${preserveCanvasMetadata.canvas.height}`
          : undefined,
      });
      console.log("🌑 Full payload being sent:", JSON.stringify({
        prompt: effectivePrompt,
        userId: user.id,
        organizationId: orgId,
        sessionId,
        goalType,
        aspectRatio: generationAspectRatio,
        aiProvider: requestedAiProvider,
        resolution: edgeSafeSettings.resolution,
        outputFormat: edgeSafeSettings.outputFormat,
        edgeSafeAdjusted: edgeSafeSettings.adjusted ? edgeSafeSettings.reasons : undefined,
        visualSquad: proSettings.visualSquad,
        backgroundPresetId: selectedBackgroundPreset,
        backgroundPrompt: appliedBackgroundPrompt,
        compositionPresetId: selectedCompositionPreset,
        compositionPrompt: appliedCompositionPrompt,
        extraLibraryTags,
      }, null, 2));

      // Call the edge function
      const { data, error } = await supabase.functions.invoke("generate-madison-image", {
        body: {
          prompt: effectivePrompt,
          userId: user.id,
          organizationId: orgId,
          sessionId,
          goalType,
          aspectRatio: generationAspectRatio,
          outputFormat: edgeSafeSettings.outputFormat,
          referenceImages,
          imageConstraints: generationImageConstraints,
          proModeControls: proModePayload,
          product_id: backgroundPlateMode ? undefined : selectedProduct?.id,
          aiProvider: requestedAiProvider,
          resolution: edgeSafeSettings.resolution,
          visualSquad: proSettings.visualSquad,
          backgroundPresetId: selectedBackgroundPreset,
          backgroundPrompt: appliedBackgroundPrompt || undefined,
          compositionPresetId: backgroundPlateMode ? undefined : selectedCompositionPreset,
          compositionPrompt: backgroundPlateMode ? undefined : appliedCompositionPrompt || undefined,
          extraLibraryTags,
          generationMode: navigationGenerationMode,
          productContext:
            !backgroundPlateMode && selectedProduct
              ? enrichedProductContext ?? undefined
              : undefined,
        },
      });

      if (error) {
        console.error("❌ Generation error:", error);
        console.error("❌ Error details:", JSON.stringify(error, null, 2));
        const errorMsg = await getSupabaseFunctionErrorMessage(error);

        if (errorMsg.includes("Rate limit") || (error as any).status === 429) {
          madison.error("Rate limit reached", "Please wait a moment before generating another image.");
        } else if (errorMsg.includes("credits") || (error as any).status === 402) {
          madison.error("AI credits depleted", "Please add credits in Settings.");
        } else if (errorMsg.includes("organization") || errorMsg.includes("onboarding")) {
          madison.error("Setup incomplete", "Please complete onboarding to start generating images.");
        } else {
          madison.error("Generation failed", errorMsg.substring(0, 200));
        }
        return;
      }

      if (!data?.imageUrl || !data?.savedImageId) {
        madison.error("Generation failed", "No image returned from server.");
        return;
      }

      // Add to session
      const newImage: GeneratedImage = {
        id: data.savedImageId,
        imageUrl: data.imageUrl,
        prompt: effectivePrompt,
        timestamp: Date.now(),
        isSaved: true, // Backend already saved
        isHero: true,
        aspectRatio: generationAspectRatio,
      };

      setImages((prev) => [...prev, newImage]);
      setHeroImageId(newImage.id);
      setNewlyGeneratedId(newImage.id); // Track for developing animation

      // Clear newly generated after animation completes (3 seconds)
      setTimeout(() => setNewlyGeneratedId(null), 3000);

      // Save to DAM (fire-and-forget — don't block the UI)
      supabase.functions.invoke("mark-generated-image-saved", {
        body: { imageId: data.savedImageId, userId: user.id, createRecipe: false },
      }).catch((err) => console.warn("DAM save failed (non-critical):", err));

      // Add to history
      setHistory((prev) => [
        {
          id: uuidv4(),
          prompt: effectivePrompt,
          timestamp: new Date(),
        },
        ...prev.slice(0, 19), // Keep last 20
      ]);

      queryClient.invalidateQueries({ queryKey: ["generated-images"] });
      queryClient.invalidateQueries({ queryKey: ["image-library-hook"] });

      madison.success(
        backgroundPlateMode ? "Background plate saved" : "Image created!",
        backgroundPlateMode
          ? "Tagged for Background Scene — pick it from Library on the left."
          : "Your image has been saved to the library.",
      );
    } catch (err) {
      console.error("❌ Unexpected error:", err);
      madison.error("Something went wrong");
    } finally {
      setIsGenerating(false);
    }
  }, [
    user,
    canGenerate,
    prompt,
    productImage,
    backgroundImage,
    styleReference,
    proSettings,
    proSettingsCount,
    selectedProduct,
    enrichedProductContext,
    orgId,
    sessionId,
    queryClient,
    backgroundPlateMode,
    productSlots,
    selectedBackgroundPreset,
    selectedCompositionPreset,
    styleReferenceLibraryOutput,
    navigationLibraryTags,
    navigationGenerationMode,
    isBestBottlesOrg,
    generationCanvasMode,
    exactGenerationCanvas,
  ]);

  // Explicit operator action to load (or replace with) the selected product's
  // reference image. Used by the Product Context card so the operator can pull
  // the canonical reference without it ever being swapped in silently.
  const handleLoadProductReference = useCallback(async () => {
    const product = selectedProduct;
    if (!product) return;
    const resolved = await resolveDarkroomProductReferenceImage(product, orgId);
    if (!resolved) {
      madison.info("No reference image available for this product");
      return;
    }
    if (selectedProductRef.current?.id !== product.id) return;
    setProductImage({ url: resolved.url, name: resolved.name });
    setProductImageSource(resolved.source);
    madison.success("Product reference image loaded", REFERENCE_SOURCE_TOAST[resolved.source]);
  }, [selectedProduct, orgId]);

  const handleSaveImage = useCallback(async (id: string) => {
    setIsSaving(true);
    try {
      // Image is already saved on generation, just mark local state
      setImages((prev) =>
        prev.map((img) => (img.id === id ? { ...img, isSaved: true } : img))
      );
      madison.saved();
    } finally {
      setIsSaving(false);
    }
  }, []);

  const handleDeleteImage = useCallback((id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
    if (heroImageId === id) {
      setHeroImageId(null);
    }
    if (heroImageId === id) {
      setHeroImageId(null);
    }
    madison.success("Image removed from session");
  }, [heroImageId]);

  const handleDownloadImage = useCallback(async (image: GeneratedImage) => {
    if (!image || !image.imageUrl) {
      madison.error("No image to download");
      return;
    }

    try {
      const { downloadImage } = await import("@/utils/imageDownload");
      await downloadImage(image.imageUrl, `madison-${image.id.slice(0, 8)}.png`);
      madison.success("Image downloaded");
    } catch (err) {
      console.error('Download failed:', err);
      madison.error(err instanceof Error ? err.message : "Failed to download image. Try right-clicking and 'Save Image As'");
    }
  }, []);

  // Open Light Table page for editing an image
  const handleOpenLightTable = useCallback((image: GeneratedImage) => {
    // Navigate to Light Table with the selected image and all session images
    navigate("/light-table", {
      state: {
        selectedImageId: image.id,
        sessionImages: images,
        sessionId,
      },
    });
  }, [navigate, images, sessionId]);

  const handleUseSuggestion = useCallback((suggestion: Suggestion) => {
    setPrompt(suggestion.text);
    madison.success("Suggestion applied");
  }, []);

  const handleApplyPreset = useCallback((preset: string) => {
    setPrompt((prev) => (prev ? `${prev}, ${preset.toLowerCase()}` : preset));
    madison.success(`Applied: ${preset}`);
  }, []);

  const handleUseSchematicPrompt = useCallback((mode: DarkroomSchematicPromptMode) => {
    if (!productImage) {
      madison.info("Load a product reference image first");
      return;
    }

    setExactGenerationCanvas(null);
    setGenerationCanvasMode("preserve-source");
    setPrompt(buildDarkroomSchematicPrompt(mode));
    madison.success(
      mode === "exploded" ? "Exploded schematic prompt loaded" : "Whole schematic prompt loaded",
    );
  }, [productImage]);

  /**
   * Load one of the ten empty hero-set directions. Unlike the stone-hero
   * prompts these need no product reference: the set is generated empty and
   * real bottles are composited in later from catalogue dimensions, so a
   * generated bottle is never part of the deliverable.
   */
  /**
   * Pro-settings changes flow through here so an explicit aspect-ratio choice
   * can release the hero-set canvas pin. Without this the pin outranks the
   * picker and a later 9:16 selection still renders 21:9.
   */
  const handleProSettingsChange = useCallback<typeof setProSettings>((update) => {
    setProSettings((prev) => {
      const next = typeof update === "function" ? update(prev) : update;
      if (next.aspectRatio !== prev.aspectRatio) setExactGenerationCanvas(null);
      return next;
    });
  }, []);

  const handleUseHeroSetPreset = useCallback((
    presetId: HeroSetPresetId,
    options: { population?: HeroSetPopulation } = {},
  ) => {
    const preset = getHeroSetPreset(presetId);

    setExactGenerationCanvas({
      width: HERO_SET_CANVAS.widthPx,
      height: HERO_SET_CANVAS.heightPx,
    });
    setGenerationCanvasMode("selected-aspect");
    setProSettings((prev) => ({
      ...prev,
      aspectRatio: HERO_SET_ASPECT_RATIO,
      aiProvider: HERO_SET_MODEL,
    }));
    setPrompt(buildHeroSetPrompt(presetId, options));

    const populationNote =
      options.population === "place-product"
        ? " · your product placed once"
        : options.population === "mood-mock"
          ? " · 3 stand-ins"
          : " · empty set";
    madison.success(
      `${preset.label} set loaded`,
      `${HERO_SET_CANVAS.widthPx}x${HERO_SET_CANVAS.heightPx} · Sunburst${populationNote}`,
    );
  }, []);

  const handleUseBestBottlesHeroPrompt = useCallback((arrangement: BestBottlesStoneHeroArrangement) => {
    if (!productImage) {
      madison.info("Load a product reference image first");
      return;
    }

    const selectedHeroAspectRatio =
      proSettings.aspectRatio && proSettings.aspectRatio !== "1:1"
        ? proSettings.aspectRatio
        : "16:9";
    const stonePreset =
      BEST_BOTTLES_STONE_HERO_PRESETS[
        bestBottlesHeroStoneIndex % BEST_BOTTLES_STONE_HERO_PRESETS.length
      ];

    setExactGenerationCanvas(null);
    setGenerationCanvasMode("selected-aspect");
    if (proSettings.aspectRatio !== selectedHeroAspectRatio) {
      setProSettings((prev) => ({
        ...prev,
        aspectRatio: selectedHeroAspectRatio,
      }));
    }
    setPrompt(buildBestBottlesStoneHeroPrompt({
      stoneId: stonePreset.id,
      arrangement,
    }));
    setBestBottlesHeroStoneIndex(
      (bestBottlesHeroStoneIndex + 1) % BEST_BOTTLES_STONE_HERO_PRESETS.length,
    );
    madison.success(
      "Best Bottles hero prompt loaded",
      `${stonePreset.label} · ${arrangement.replace("-", " ")} · ${selectedHeroAspectRatio}`,
    );
  }, [bestBottlesHeroStoneIndex, productImage, proSettings.aspectRatio]);

  const handleRestoreFromHistory = useCallback((item: HistoryItem) => {
    setPrompt(item.prompt);
    madison.success("Prompt restored");
  }, []);

  const openSavePromptDialog = useCallback((promptText: string, suggestedTitle = "") => {
    const trimmedPrompt = promptText.trim();
    if (!trimmedPrompt) {
      madison.info("Write or generate a prompt first");
      return;
    }

    setPromptToSave(trimmedPrompt);
    setSuggestedPromptTitle(suggestedTitle);
    setIsSavePromptOpen(true);
  }, []);

  const handleUseMadisonPrompt = useCallback((nextPrompt: string) => {
    const trimmedPrompt = nextPrompt.trim();
    if (!trimmedPrompt) {
      madison.info("Madison did not return a usable prompt");
      return;
    }

    setPrompt(trimmedPrompt);
    setIsMadisonOpen(false);
    madison.success("Prompt loaded into Dark Room");
  }, []);

  const handleSaveAll = useCallback(async () => {
    const unsaved = images.filter((img) => !img.isSaved);
    if (unsaved.length === 0) {
      madison.info("All images already saved");
      return;
    }

    setIsSaving(true);
    try {
      // In this implementation, all images are auto-saved on generation
      // This is just updating local state
      setImages((prev) => prev.map((img) => ({ ...img, isSaved: true })));
      madison.success(`${unsaved.length} image(s) saved`);
    } finally {
      setIsSaving(false);
    }
  }, [images]);


  // Mobile uses the new tile-based UI
  if (isMobile) {
    return (
      <>
        <MobileDarkRoom
          prompt={prompt}
          onPromptChange={setPrompt}
          onOpenMadison={() => setIsMadisonOpen(true)}
          onSavePrompt={() => openSavePromptDialog(prompt, selectedProduct?.name ? `${selectedProduct.name} Prompt` : "")}
          canSavePrompt={prompt.trim().length > 0}
          onGenerate={handleGenerate}
          isGenerating={isGenerating}
          canGenerate={canGenerate}
          images={images}
          heroImageId={heroImageId}
          onSetHero={setHeroImageId}
          onSaveImage={handleSaveImage}
          onDeleteImage={handleDeleteImage}
          onRefineImage={handleOpenLightTable}
          maxImages={MAX_IMAGES_PER_SESSION}
          newlyGeneratedId={newlyGeneratedId}
          selectedProduct={selectedProduct}
          onProductSelect={setSelectedProduct}
          productImage={productImage}
          onProductImageUpload={handleProductImageUpload}
          backgroundImage={backgroundImage}
          onBackgroundImageUpload={setBackgroundImage}
          styleReference={styleReference}
          onStyleReferenceUpload={setStyleReference}
          proSettings={proSettings}
          onProSettingsChange={handleProSettingsChange}
          backgroundPlateMode={backgroundPlateMode}
          onBackgroundPlateModeChange={setBackgroundPlateMode}
          styleReferenceLibraryOutput={styleReferenceLibraryOutput}
          onStyleReferenceLibraryOutputChange={setStyleReferenceLibraryOutput}
        />
        <DarkRoomMadisonDrawer
          open={isMadisonOpen}
          onOpenChange={setIsMadisonOpen}
          isMobile
          currentPrompt={prompt}
          sessionContext={madisonSessionContext}
          referenceAssets={referenceAssets}
          heroImageUrl={heroImage?.imageUrl}
          onUsePrompt={handleUseMadisonPrompt}
          onSavePrompt={openSavePromptDialog}
          backgroundPlateMode={backgroundPlateMode}
        />
        <SavePromptDialog
          open={isSavePromptOpen}
          onOpenChange={setIsSavePromptOpen}
          promptText={promptToSave}
          suggestedTitle={suggestedPromptTitle}
          deliverableFormat="image_prompt"
          onSaved={() => madison.success("Prompt saved to Librarian")}
        />
        {/* Camera Flash Overlay for mobile */}
        <FlashOverlay />
      </>
    );
  }

  // Desktop layout
  return (
    <div className="dark-room-container">
      {/* Header */}
      <DarkRoomHeader
        sessionCount={images.length}
        savedCount={savedCount}
        isSaving={isSaving}
        onSaveAll={handleSaveAll}
        heroImage={heroImage}
        onDownloadHero={heroImage ? () => handleDownloadImage(heroImage) : undefined}
        onSaveHero={heroImage ? () => handleSaveImage(heroImage.id) : undefined}
        onRefineHero={heroImage ? () => handleOpenLightTable(heroImage) : undefined}
        rightExtra={
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMadisonOpen(true)}
              className="h-8 px-3 text-[11px] font-medium text-[var(--darkroom-text-muted)] hover:bg-white/5 hover:text-[var(--darkroom-text)]"
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              Madison
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => openSavePromptDialog(prompt, selectedProduct?.name ? `${selectedProduct.name} Prompt` : "")}
              disabled={!prompt.trim()}
              className="h-8 px-3 text-[11px] font-medium text-[var(--darkroom-text-muted)] hover:bg-white/5 hover:text-[var(--darkroom-accent)]"
            >
              <Bookmark className="mr-1.5 h-3.5 w-3.5" />
              Save Prompt
            </Button>

            <LibrarianTrigger
              variant="icon"
              context="dark_room"
              category="image"
              label="Prompt Library"
              onFrameworkSelect={(framework) => {
                setPrompt((prev) => prev ? `${prev}\n\n${framework.framework_content}` : framework.framework_content);
                madison.frameworkAcquired();
              }}
              className="text-[var(--darkroom-text-muted)] hover:text-[var(--darkroom-accent)] hover:bg-white/5"
            />
          </div>
        }
      />

      {/* Main Grid */}
      <div className="dark-room-grid">
        {/* Left Rail: Inputs & Controls */}
        <LeftRail
          selectedProduct={selectedProduct}
          onProductSelect={setSelectedProduct}
          productContextSummary={productContextSummary}
          onLoadReferenceImage={handleLoadProductReference}
          productImage={productImage}
          onProductImageUpload={handleProductImageUpload}
          backgroundImage={backgroundImage}
          onBackgroundImageUpload={setBackgroundImage}
          styleReference={styleReference}
          onStyleReferenceUpload={setStyleReference}
          proSettings={proSettings}
          onProSettingsChange={handleProSettingsChange}
          isGenerating={isGenerating}
          canGenerate={canGenerate}
          onGenerate={handleGenerate}
          onUseSchematicPrompt={handleUseSchematicPrompt}
          onUseBestBottlesHeroPrompt={handleUseBestBottlesHeroPrompt}
          onUseHeroSetPreset={handleUseHeroSetPreset}
          showHeroSetPresets={isBestBottlesOrg}
          sessionCount={images.length}
          maxImages={MAX_IMAGES_PER_SESSION}
          backgroundPlateMode={backgroundPlateMode}
          onBackgroundPlateModeChange={setBackgroundPlateMode}
          styleReferenceLibraryOutput={styleReferenceLibraryOutput}
          onStyleReferenceLibraryOutputChange={setStyleReferenceLibraryOutput}
        />

        {/* Center Canvas: Preview & Results */}
        <CenterCanvas
          images={images}
          heroImage={heroImage}
          onSetHero={setHeroImageId}
          onSaveImage={handleSaveImage}
          onDeleteImage={handleDeleteImage}
          onDownloadImage={handleDownloadImage}
          onRefineImage={handleOpenLightTable}
          prompt={prompt}
          onPromptChange={setPrompt}
          onGenerate={handleGenerate}
          isGenerating={isGenerating}
          isSaving={isSaving}
          canGenerate={canGenerate}
          proSettingsCount={proSettingsCount}
          maxImages={MAX_IMAGES_PER_SESSION}
          newlyGeneratedId={newlyGeneratedId}
        />

        {/* Right Panel: Madison Assistant + Settings */}
        <RightPanel
          suggestions={suggestions}
          onUseSuggestion={handleUseSuggestion}
          presets={DEFAULT_PRESETS}
          onApplyPreset={handleApplyPreset}
          history={history}
          onRestoreFromHistory={handleRestoreFromHistory}
          hasProduct={!!productImage}
          hasBackground={!!backgroundImage}
          hasStyle={!!styleReference}
          proSettingsCount={proSettingsCount}
          proSettings={proSettings}
          onProSettingsChange={handleProSettingsChange}
          isGenerating={isGenerating}
          productSlots={productSlots}
          onProductSlotsChange={setProductSlots}
          selectedBackgroundPreset={selectedBackgroundPreset}
          onBackgroundPresetChange={setSelectedBackgroundPreset}
          selectedCompositionPreset={selectedCompositionPreset}
          onCompositionPresetChange={setSelectedCompositionPreset}
          sessionId={sessionId}
          organizationId={orgId}
          userId={user?.id}
        />
      </div>

      <DarkRoomMadisonDrawer
        open={isMadisonOpen}
        onOpenChange={setIsMadisonOpen}
        currentPrompt={prompt}
        sessionContext={madisonSessionContext}
        referenceAssets={referenceAssets}
        heroImageUrl={heroImage?.imageUrl}
        onUsePrompt={handleUseMadisonPrompt}
        onSavePrompt={openSavePromptDialog}
        backgroundPlateMode={backgroundPlateMode}
      />

      <SavePromptDialog
        open={isSavePromptOpen}
        onOpenChange={setIsSavePromptOpen}
        promptText={promptToSave}
        suggestedTitle={suggestedPromptTitle}
        deliverableFormat="image_prompt"
        onSaved={() => madison.success("Prompt saved to Librarian")}
      />

      {/* Camera Flash Overlay - triggers on generate */}
      <FlashOverlay />
    </div>
  );
}
