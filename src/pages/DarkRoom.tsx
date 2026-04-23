/**
 * Dark Room - Madison Studio's Image Generation Studio
 *
 * A clean, sophisticated image generation interface with purposeful animations
 * that mimic darkroom photography processes.
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { madison } from "@/lib/madisonToast";
import { v4 as uuidv4 } from "uuid";
import { Bookmark, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LibrarianTrigger } from "@/components/librarian";
import { SavePromptDialog } from "@/components/prompt-library/SavePromptDialog";
import { DEFAULT_IMAGE_AI_PROVIDER } from "@/config/imageSettings";

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
}

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
  const [backgroundImage, setBackgroundImage] = useState<UploadedImage | null>(null);
  const [styleReference, setStyleReference] = useState<UploadedImage | null>(null);
  const [proSettings, setProSettings] = useState<ProModeSettings>({});

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
    // Need either a prompt or a product image
    const hasInput = prompt.trim().length > 0 || !!productImage;
    // Not at session limit
    const hasCapacity = images.length < MAX_IMAGES_PER_SESSION;
    // Not already generating
    // Must have organization loaded
    const hasOrg = !!orgId && !orgLoading;
    return hasInput && hasCapacity && !isGenerating && hasOrg;
  }, [prompt, productImage, images.length, isGenerating, orgId, orgLoading]);

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
    }),
    [heroImage, history, images.length, orgId, proSettings.aspectRatio, prompt, selectedProduct?.name, sessionId]
  );

  // Effects
  useEffect(() => {
    // Check for initial data from navigation (product or background image)
    const state = location.state as {
      product?: Product;
      backgroundImage?: { url: string; name: string };
    } | undefined;

    if (state?.product) {
      setSelectedProduct(state.product);
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
    let effectivePrompt = prompt.trim() || "Professional product photography";

    // Count total products (main product image + product slots)
    const activeProductSlots = productSlots.filter(slot => slot.imageUrl);
    const totalProductCount = (productImage ? 1 : 0) + activeProductSlots.length;
    let appliedBackgroundPrompt: string | null = null;
    let appliedCompositionPrompt: string | null = null;

    // If a background preset is selected, add a random variation to the prompt
    if (selectedBackgroundPreset) {
      const backgroundVariation = getRandomBackgroundVariation(selectedBackgroundPreset);
      if (backgroundVariation) {
        appliedBackgroundPrompt = backgroundVariation;
        // Append the background style to the user's prompt
        effectivePrompt = `${effectivePrompt}. Background: ${backgroundVariation}`;
        console.log("🎨 Background preset applied:", selectedBackgroundPreset, "→", backgroundVariation);
      }
    }

    // If a composition preset is selected, add arrangement instructions
    if (selectedCompositionPreset && totalProductCount > 0) {
      const compositionPrompt = getCompositionPrompt(selectedCompositionPreset, totalProductCount);
      if (compositionPrompt) {
        appliedCompositionPrompt = compositionPrompt;
        effectivePrompt = `${effectivePrompt}. Composition: ${compositionPrompt}`;
        console.log("📐 Composition preset applied:", selectedCompositionPreset, `(${totalProductCount} products)`);
      }
    }

    // Trigger camera feedback (sound + flash) immediately on capture
    triggerCameraFeedback();

    setIsGenerating(true);

    try {
      // Build reference images array
      const referenceImages: Array<{ url: string; description: string; label: string }> = [];

      if (productImage) {
        referenceImages.push({
          url: productImage.url,
          label: "Product",
          description: "User-uploaded product for enhancement",
        });
      }

      if (backgroundImage) {
        referenceImages.push({
          url: backgroundImage.url,
          label: "Background",
          description: "Background scene for composition",
        });
      }

      if (styleReference) {
        referenceImages.push({
          url: styleReference.url,
          label: "Style Reference",
          description: "Style reference for lighting and mood",
        });
      }

      // Add multi-product slots (for compositing multiple products into scene)
      activeProductSlots.forEach((slot, index) => {
        referenceImages.push({
          url: slot.imageUrl!,
          label: `Product ${index + 1}`,
          description: `Additional product ${index + 1} to composite into the scene`,
        });
      });

      // Build Pro Mode payload if active (only camera/lighting/environment, not AI settings)
      const proModePayload = proSettingsCount > 0 ? {
        camera: proSettings.camera,
        lighting: proSettings.lighting,
        environment: proSettings.environment,
      } : undefined;

      console.log("🌑 Dark Room Generate:", {
        prompt: effectivePrompt,
        referenceImages: referenceImages.length,
        productSlots: activeProductSlots.length,
        proMode: proModePayload,
        product: selectedProduct?.name,
        organizationId: orgId,
        userId: user.id,
        aiProvider: proSettings.aiProvider || DEFAULT_IMAGE_AI_PROVIDER,
        resolution: proSettings.resolution || "standard",
        visualSquad: proSettings.visualSquad || "auto",
        backgroundPreset: selectedBackgroundPreset,
        compositionPreset: selectedCompositionPreset,
      });
      console.log("🌑 Full payload being sent:", JSON.stringify({
        prompt: effectivePrompt,
        userId: user.id,
        organizationId: orgId,
        sessionId,
        goalType: "product_photography",
        aspectRatio: proSettings.aspectRatio || "1:1",
        aiProvider: proSettings.aiProvider || DEFAULT_IMAGE_AI_PROVIDER,
        resolution: proSettings.resolution || "standard",
        visualSquad: proSettings.visualSquad,
        backgroundPresetId: selectedBackgroundPreset,
        backgroundPrompt: appliedBackgroundPrompt,
        compositionPresetId: selectedCompositionPreset,
        compositionPrompt: appliedCompositionPrompt,
      }, null, 2));

      // Call the edge function
      const { data, error } = await supabase.functions.invoke("generate-madison-image", {
        body: {
          prompt: effectivePrompt,
          userId: user.id,
          organizationId: orgId,
          sessionId,
          goalType: "product_photography",
          aspectRatio: proSettings.aspectRatio || "1:1",
          outputFormat: "png",
          referenceImages,
          proModeControls: proModePayload,
          product_id: selectedProduct?.id,
          // AI Model settings
          aiProvider: proSettings.aiProvider || DEFAULT_IMAGE_AI_PROVIDER,
          resolution: proSettings.resolution || "standard",
          // Visual Squad for style direction
          visualSquad: proSettings.visualSquad,
          backgroundPresetId: selectedBackgroundPreset,
          backgroundPrompt: appliedBackgroundPrompt || undefined,
          compositionPresetId: selectedCompositionPreset,
          compositionPrompt: appliedCompositionPrompt || undefined,
          productContext: selectedProduct
            ? {
              name: selectedProduct.name,
              collection: selectedProduct.collection || "Unknown",
              scent_family: selectedProduct.scentFamily || "Unspecified",
              category: selectedProduct.category,
            }
            : undefined,
        },
      });

      if (error) {
        console.error("❌ Generation error:", error);
        console.error("❌ Error details:", JSON.stringify(error, null, 2));
        let errorMsg = error.message || error.toString();
        // Extract actual error from edge function response body (FunctionsHttpError)
        try {
          if (typeof (error as any)?.context?.json === "function") {
            const body = await (error as any).context.json();
            if (body?.error) errorMsg = body.error;
          }
        } catch (_) {
          // Fall back to error.message
        }

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

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["generated-images"] });

      madison.success("Image created!", "Your image has been saved to the library.");
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
    orgId,
    sessionId,
    queryClient,
  ]);

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
          onProductImageUpload={setProductImage}
          backgroundImage={backgroundImage}
          onBackgroundImageUpload={setBackgroundImage}
          styleReference={styleReference}
          onStyleReferenceUpload={setStyleReference}
          proSettings={proSettings}
          onProSettingsChange={setProSettings}
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
          productImage={productImage}
          onProductImageUpload={setProductImage}
          backgroundImage={backgroundImage}
          onBackgroundImageUpload={setBackgroundImage}
          styleReference={styleReference}
          onStyleReferenceUpload={setStyleReference}
          proSettings={proSettings}
          onProSettingsChange={setProSettings}
          isGenerating={isGenerating}
          canGenerate={canGenerate}
          onGenerate={handleGenerate}
          sessionCount={images.length}
          maxImages={MAX_IMAGES_PER_SESSION}
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
          onProSettingsChange={setProSettings}
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
