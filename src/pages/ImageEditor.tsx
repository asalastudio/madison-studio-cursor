// React & Router
import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

// External Libraries
import { toast } from "sonner";

// Supabase & Hooks
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentOrganizationId } from "@/hooks/useIndustryConfig";
import { useIsMobile } from "@/hooks/use-mobile";

// UI Components
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CollapsibleTrigger, Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// Icons
import {
  Download,
  Loader2,
  Sparkles,
  ArrowLeft,
  Save,
  Heart,
  Wand2,
  Settings,
  Info,
  Trash2,
  ImageIcon,
  ChevronDown,
  ChevronUp,
  Upload,
  X,
  MessageCircle,
  Menu,
  CheckCircle
} from "lucide-react";

// Feature Components
import { ReferenceUpload } from "@/components/image-editor/ReferenceUpload";
import { ImageChainBreadcrumb } from "@/components/image-editor/ImageChainBreadcrumb";
import { RefinementPanel } from "@/components/image-editor/RefinementPanel";
import { ProModePanel, ProModeControls } from "@/components/image-editor/ProModePanel";
import { AI_MODEL_OPTIONS, DEFAULT_IMAGE_AI_PROVIDER, IMAGE_GEN_RESOLUTION_OPTIONS } from "@/config/imageSettings";
import { GeneratingLoader } from "@/components/forge/GeneratingLoader";
import ThumbnailRibbon from "@/components/image-editor/ThumbnailRibbon";
import MadisonPanel from "@/components/image-editor/MadisonPanel";
import ShotTypeDropdown from "@/components/image-editor/ShotTypeDropdown";
import UseCaseSelector from "@/components/image-editor/UseCaseSelector";
import { ProductImageUpload } from "@/components/image-editor/ProductImageUpload";
import MobileShotTypeSelector from "@/components/image-editor/MobileShotTypeSelector";
import MobileAspectRatioSelector from "@/components/image-editor/MobileAspectRatioSelector";
import MobileReferenceUpload from "@/components/image-editor/MobileReferenceUpload";
import MobileGeneratedImageView from "@/components/image-editor/MobileGeneratedImageView";
import MobileCreateForm from "@/components/image-editor/MobileCreateForm";
import { ProductSelector } from "@/components/forge/ProductSelector";
import { Product } from "@/hooks/useProducts";
import {
  imageCategories,
  DEFAULT_IMAGE_CATEGORY_KEY,
  type ImageCategoryDefinition,
  getImageCategoryByKey,
  USE_CASES,
  DEFAULT_USE_CASE,
  type UseCaseKey,
  getUseCaseByKey,
  mapUseCaseToLibraryCategory,
} from "@/data/imageCategories";

// Prompt Formula Utilities
import { CAMERA_LENS, LIGHTING, ENVIRONMENTS } from "@/utils/promptFormula";

const DEFAULT_PROMPT =
  "A clean studio product shot on a pure white background, soft shadow, high-resolution lighting.";

// Helper function to build combined prompt from use case + style + bottle type
function buildCombinedPrompt(
  useCase: ReturnType<typeof getUseCaseByKey>,
  style: ReturnType<typeof getImageCategoryByKey>,
  product: Product | null
): string {
  if (!style) return DEFAULT_PROMPT;

  let prompt = style.prompt;

  // Add use case context
  if (useCase) {
    prompt += ` For ${useCase.label.toLowerCase()}: ${useCase.description}.`;
  }

  // Add bottle type specification if product is selected
  if (product) {
    const bottleType = product.bottle_type?.toLowerCase();
    if (bottleType === 'oil') {
      prompt += ` IMPORTANT: This is an oil-based fragrance. Use a dropper or roller ball closure, NOT a spray pump or atomizer. NO dip tubes or hoses inside the bottle.`;
    } else if (bottleType === 'spray') {
      prompt += ` IMPORTANT: This is a spray perfume. Use a spray pump with atomizer and dip tube.`;
    }
  }

  return prompt;
}

type ApprovalStatus = "pending" | "flagged" | "rejected";

type GeneratedImage = {
  id: string;
  imageUrl: string;
  prompt: string;
  timestamp: number;
  isHero?: boolean;
  approvalStatus: ApprovalStatus;
  parentImageId?: string;
  chainDepth: number;
  isChainOrigin: boolean;
  refinementInstruction?: string;
  categoryKey?: string; // Style (e.g., "product_on_white")
  useCaseKey?: UseCaseKey; // Use case (e.g., "product_shot") - PRIMARY for categorization
};

type ImageSession = {
  id: string;
  name: string;
  images: GeneratedImage[];
  createdAt: number;
};

const MAX_IMAGES_PER_SESSION = 10;

export default function ImageEditor() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { orgId } = useCurrentOrganizationId();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [marketplace, setMarketplace] = useState<string>("etsy");

  // Use Case First: Primary selection
  const [selectedUseCase, setSelectedUseCase] = useState<UseCaseKey>(DEFAULT_USE_CASE);

  // Aspect Ratio: Auto-set based on use case
  const currentUseCase = getUseCaseByKey(selectedUseCase);
  const [aspectRatio, setAspectRatio] = useState<string>(currentUseCase.defaultAspectRatio);

  const [outputFormat, setOutputFormat] = useState<"png" | "jpeg" | "webp">("png");

  // Initialize prompt with default use case + style combination
  const initialStyle = getImageCategoryByKey(DEFAULT_IMAGE_CATEGORY_KEY);
  const initialUseCase = getUseCaseByKey(DEFAULT_USE_CASE);
  const initialPrompt = initialStyle
    ? buildCombinedPrompt(initialUseCase, initialStyle, null)
    : DEFAULT_PROMPT;

  const [mainPrompt, setMainPrompt] = useState(initialPrompt);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showProMode, setShowProMode] = useState(false);

  // Pro Mode Controls State
  const [proModeControls, setProModeControls] = useState<ProModeControls>({});

  const updateProAiProvider = useCallback((value: string) => {
    setProModeControls((prev) => ({
      ...prev,
      aiProvider: value === DEFAULT_IMAGE_AI_PROVIDER ? undefined : value,
    }));
  }, []);

  const updateProResolution = useCallback((value: string) => {
    setProModeControls((prev) => ({
      ...prev,
      resolution: value === "standard" ? undefined : value,
    }));
  }, []);

  // Product Context State
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Chain prompting state
  const [selectedForRefinement, setSelectedForRefinement] = useState<GeneratedImage | null>(null);
  const [refinementMode, setRefinementMode] = useState(false);

  // Session state
  const [sessionId] = useState(() => crypto.randomUUID());
  const [currentSession, setCurrentSession] = useState<ImageSession>({
    id: sessionId,
    name: "New Session",
    images: [],
    createdAt: Date.now()
  });
  const [allPrompts, setAllPrompts] = useState<Array<{ role: string, content: string }>>([]);

  type ReferenceImage = {
    url: string;
    description: string;
    label: "Background" | "Product" | "Style Reference";
  };
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const [brandContext, setBrandContext] = useState<any>(null);
  const [isMadisonOpen, setIsMadisonOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"create" | "gallery">("create");
  const [productImage, setProductImage] = useState<{ url: string; file: File } | null>(null);
  const [showGeneratedView, setShowGeneratedView] = useState(false);
  const [latestGeneratedImage, setLatestGeneratedImage] = useState<string | null>(null);
  const [selectedImageCategory, setSelectedImageCategory] = useState<string>(
    DEFAULT_IMAGE_CATEGORY_KEY
  );

  // Auto-update aspect ratio and prompt when use case changes
  useEffect(() => {
    const useCase = getUseCaseByKey(selectedUseCase);
    setAspectRatio(useCase.defaultAspectRatio);

    // Update prompt to combine use case + current style
    const currentStyle = getImageCategoryByKey(selectedImageCategory);
    if (currentStyle) {
      const combinedPrompt = buildCombinedPrompt(useCase, currentStyle, selectedProduct);
      setMainPrompt(combinedPrompt);
    }
  }, [selectedUseCase, selectedProduct]);

  // Update prompt when product changes (to add bottle type info)
  useEffect(() => {
    const useCase = getUseCaseByKey(selectedUseCase);
    const currentStyle = getImageCategoryByKey(selectedImageCategory);
    if (currentStyle) {
      const combinedPrompt = buildCombinedPrompt(useCase, currentStyle, selectedProduct);
      setMainPrompt(combinedPrompt);
    }
  }, [selectedProduct]);

  // Load prompt and image from navigation state if present
  useEffect(() => {
    const loadState = async () => {
      if (location.state?.loadedPrompt) {
        setMainPrompt(location.state.loadedPrompt);
        if (location.state.aspectRatio) setAspectRatio(location.state.aspectRatio);
        if (location.state.outputFormat) setOutputFormat(location.state.outputFormat);

        // Handle loaded image for editing
        if (location.state.loadedImage) {
          try {
            const response = await fetch(location.state.loadedImage);
            const blob = await response.blob();
            const file = new File([blob], "original-image.png", { type: blob.type });

            // Convert to Base64 for compatibility with edge function
            const reader = new FileReader();
            reader.onloadend = () => {
              setProductImage({
                file,
                url: reader.result as string
              });
              toast.success("Image loaded for editing!");
            };
            reader.readAsDataURL(blob);
          } catch (error) {
            console.error("Failed to load image:", error);
            toast.error("Failed to load image for editing");
          }
        } else {
          toast.success("Image recipe loaded!");
        }

        // Clear state but keep history
        window.history.replaceState({}, document.title);
      }
    };

    loadState();
  }, [location.state]);

  // Fetch brand context
  useEffect(() => {
    const fetchBrandContext = async () => {
      if (!orgId) return;
      try {
        const { data: brandConfig } = await supabase
          .from('organizations')
          .select('brand_config')
          .eq('id', orgId)
          .single();

        const { data: brandKnowledge } = await supabase
          .from('brand_knowledge')
          .select('content, knowledge_type')
          .eq('organization_id', orgId)
          .eq('is_active', true)
          .in('knowledge_type', ['brand_voice', 'brand_style', 'visual_standards']);

        if (brandConfig || brandKnowledge?.length) {
          setBrandContext({
            config: brandConfig,
            knowledge: brandKnowledge
          });
        }
      } catch (error) {
        console.error('Error fetching brand context:', error);
      }
    };

    fetchBrandContext();
  }, [orgId]);

  // Cleanup reference images on unmount
  useEffect(() => {
    return () => {
      referenceImages.forEach(ref => {
        if (ref.url.includes('image-editor-reference')) {
          supabase.storage.from('images').remove([ref.url]);
        }
      });
    };
  }, []);

  const generateSessionName = (prompt: string) => {
    const words = prompt.split(' ').slice(0, 4).join(' ');
    return words.length > 30 ? words.substring(0, 30) + '...' : words;
  };

  const resolveCategoryKey = useCallback(
    (image?: GeneratedImage) =>
      image?.categoryKey || selectedImageCategory || DEFAULT_IMAGE_CATEGORY_KEY,
    [selectedImageCategory]
  );

  const ensureImageRecipeForImage = useCallback(
    async (image?: GeneratedImage) => {
      if (!image || !orgId || !user) return;
      try {
        // @ts-ignore
        const { data: existingPrompt } = await (supabase
          .from('prompts') as any)
          .select('id')
          .eq('generated_image_id', image.id)
          .maybeSingle();

        if (existingPrompt) return;

        const { data: generatedImage } = await supabase
          .from('generated_images')
          .select('aspect_ratio, output_format, goal_type, final_prompt')
          .eq('id', image.id)
          .single();

        const categoryKey = resolveCategoryKey(image);
        // PRIMARY: Use the USE CASE to determine library category (what user selected)
        // This ensures "Product Shot" → "E-commerce" in library, not style-based
        const useCase = image.useCaseKey || selectedUseCase;
        const broadCategory = mapUseCaseToLibraryCategory(useCase);

        const promptText =
          image.prompt ||
          (generatedImage as any)?.final_prompt ||
          mainPrompt;

        const baseContext = {
          use_case: useCase, // PRIMARY: What the user selected (Product Shot, Hero Image, etc.)
          shot_type: categoryKey, // Style (Product on White, Lifestyle Scene, etc.)
          category: broadCategory, // Library category (ecommerce, social, etc.)
          aspect_ratio: (generatedImage as any)?.aspect_ratio || aspectRatio,
          output_format: (generatedImage as any)?.output_format || outputFormat,
          image_type: (generatedImage as any)?.goal_type || 'product_photography',
          model: 'nano-banana',
          style: 'Photorealistic',
        };

        // Attempt 1: Try to save with relational columns
        const primaryPayload: any = {
          title: `${getUseCaseByKey(useCase).label} - ${new Date().toLocaleDateString()}`,
          prompt_text: promptText,
          content_type: 'visual',
          collection: 'General',
          organization_id: orgId,
          created_by: user.id,
          is_template: true,
          deliverable_format: 'image_prompt',
          generated_image_id: image.id,
          image_source: 'generated',
          category: broadCategory, // Use broad category for filtering
          additional_context: baseContext,
        };

        console.log('📦 Preparing to save recipe (attempt 1)', JSON.stringify(primaryPayload, null, 2));

        const { error: insertError } = await supabase
          .from('prompts')
          // @ts-ignore - Supabase TS infers deeply here
          .insert([primaryPayload]);

        if (insertError) {
          console.error("Supabase insert error details:", JSON.stringify(insertError, null, 2));

          // Check if error is due to missing column (PGRST204)
          if (insertError.code === 'PGRST204' && insertError.message.includes('generated_image_id')) {
            console.warn("⚠️ Schema mismatch detected. Falling back to legacy storage format.");

            // Attempt 2: Fallback payload (store ID in additional_context instead)
            const fallbackPayload: any = {
              title: `${getUseCaseByKey(useCase).label} - ${new Date().toLocaleDateString()}`,
              prompt_text: promptText,
              content_type: 'visual',
              collection: 'General',
              organization_id: orgId,
              created_by: user.id,
              is_template: true,
              deliverable_format: 'image_prompt',
              // Skip generated_image_id and image_source columns
              category: broadCategory,
              additional_context: {
                ...baseContext,
                generated_image_id: image.id, // Store ID here
                image_source: 'generated'
              },
            };

            const { error: fallbackError } = await supabase
              .from('prompts')
              .insert([fallbackPayload]);

            if (fallbackError) throw fallbackError;

            console.log("✅ Recipe created successfully (fallback mode)");
          } else {
            throw insertError;
          }
        } else {
          console.log("✅ Recipe created successfully for image:", image.id);
        }

        queryClient.invalidateQueries({ queryKey: ['templates', orgId] });
        queryClient.invalidateQueries({ queryKey: ['prompt-counts', orgId] });
      } catch (error: any) {
        console.error('Failed to ensure image recipe exists. Full error:', JSON.stringify(error, null, 2));
        toast.error("Failed to save to library", {
          description: error.message || error.details || "Check console for details"
        });
      }
    },
    [
      orgId,
      user,
      resolveCategoryKey,
      mainPrompt,
      aspectRatio,
      outputFormat,
      queryClient,
    ]
  );

  /**
   * Enhance user prompt with Pro Mode controls
   */
  const enhancePromptWithControls = (basePrompt: string): string => {
    let enhanced = basePrompt;

    // Apply Pro Mode camera/lens preset
    if (proModeControls.camera) {
      const [category, key] = proModeControls.camera.split('.');
      const cameraPreset = CAMERA_LENS[category as keyof typeof CAMERA_LENS]?.[key as any];
      if (cameraPreset) {
        enhanced += `, ${cameraPreset}`;
      }
    }

    // Apply lighting preset
    if (proModeControls.lighting) {
      const [category, key] = proModeControls.lighting.split('.');
      const lightingPreset = LIGHTING[category as keyof typeof LIGHTING]?.[key as any];
      if (lightingPreset) {
        enhanced += `, ${lightingPreset}`;
      }
    }

    // Apply environment preset
    if (proModeControls.environment) {
      const [category, key] = proModeControls.environment.split('.');
      const environmentPreset = ENVIRONMENTS[category as keyof typeof ENVIRONMENTS]?.[key as any];
      if (environmentPreset) {
        enhanced += `, ${environmentPreset}`;
      }
    }

    return enhanced;
  };

  const handleGenerate = async (promptOverride?: string) => {
    const effectivePrompt = (promptOverride ?? mainPrompt).trim();
    if (!effectivePrompt || !user) {
      toast.error("Please enter a prompt");
      return;
    }

    if (currentSession.images.length >= MAX_IMAGES_PER_SESSION) {
      toast.error(`Session limit reached (${MAX_IMAGES_PER_SESSION} images). Please save this session first.`);
      return;
    }

    if (promptOverride) {
      setMainPrompt(promptOverride);
    }

    setIsGenerating(true);

    try {
      // Don't enhance on frontend - let backend handle Pro Mode
      const finalPrompt = effectivePrompt;

      // Prepare reference images array based on mode
      const generationReferenceImages: Array<{ url: string; description: string; label: ReferenceImage["label"] }> = [];

      if (productImage) {
        generationReferenceImages.push({
          url: productImage.url,
          label: 'Product',
          description: 'User-uploaded product for enhancement'
        });
      }

      if (referenceImages.length > 0) {
        generationReferenceImages.push(
          ...referenceImages.map((r) => ({
            url: r.url,
            description: r.description,
            label: r.label,
          }))
        );
      }

      // Determine if Pro Mode controls are active
      const hasProModeControls = Object.keys(proModeControls).length > 0;
      const proModePayload = hasProModeControls ? proModeControls : undefined;

      // Log generation payload for debugging
      console.log('🎨 Image Generation Payload:', {
        prompt: finalPrompt,
        aspectRatio,
        outputFormat,
        proModeEnabled: showProMode,
        proModeControls: proModePayload,
        proModeActive: hasProModeControls,
        hasReferenceImages: generationReferenceImages.length > 0,
        hasBrandContext: !!brandContext
      });

      // Show appropriate toast message
      if (hasProModeControls) {
        toast.success("Generating with Pro Mode settings...", {
          description: "Advanced parameters applied"
        });
      }

      console.log('🚀 About to invoke generate-madison-image edge function');
      console.log('User:', user?.id, 'Org:', orgId);

      const { data: functionData, error: functionError } = await supabase.functions.invoke(
        'generate-madison-image',
        {
          body: {
            prompt: finalPrompt,
            userId: user.id,
            organizationId: orgId,
            sessionId: sessionId,
            goalType: 'product_photography',
            aspectRatio,
            outputFormat,
            referenceImages: generationReferenceImages,
            brandContext: brandContext || undefined,
            isRefinement: false,
            proModeControls: proModePayload,
            product_id: selectedProduct?.id || undefined,
            productContext: selectedProduct ? {
              name: selectedProduct.name,
              collection: selectedProduct.collection || 'Unknown',
              scent_family: selectedProduct.scentFamily || 'Unspecified',
              category: selectedProduct.category
            } : undefined,
            aiProvider: proModeControls.aiProvider || DEFAULT_IMAGE_AI_PROVIDER,
            resolution: proModeControls.resolution || "standard",
          }
        }
      );

      console.log('✅ Edge function response received:', {
        hasError: !!functionError,
        hasData: !!functionData,
        hasImageUrl: !!functionData?.imageUrl,
        hasSavedId: !!functionData?.savedImageId
      });

      if (functionError) {
        console.error('❌ Edge function error:', functionError);

        // Handle specific error types
        const errorMsg = functionError.message || functionError.toString();

        if (errorMsg.includes('Rate limit') || functionError.status === 429) {
          toast.error("Rate limit reached", {
            description: "Please wait a moment before generating another image.",
            duration: 6000,
          });
        } else if (errorMsg.includes('credits') || errorMsg.includes('depleted') || functionError.status === 402) {
          toast.error("AI credits depleted", {
            description: "Please add credits to your workspace in Settings.",
            duration: 8000,
          });
        } else if (errorMsg.includes('GEMINI_API_KEY') || errorMsg.includes('not configured')) {
          toast.error("Configuration error", {
            description: "Gemini AI is not properly configured. Please contact support.",
            duration: 8000,
          });
        } else {
          toast.error("Generation failed", {
            description: errorMsg.substring(0, 150),
            duration: 6000,
          });
        }
        throw functionError;
      }
      if (!functionData?.imageUrl) {
        console.error('❌ No image URL in response:', functionData);
        throw new Error("No image URL returned");
      }
      if (!functionData?.savedImageId) {
        console.error('❌ No savedImageId returned from backend');
        throw new Error("Image generation failed: Database save unsuccessful");
      }

      // Backend already saved the image with valid ID
      const newImage: GeneratedImage = {
        id: functionData.savedImageId,
        imageUrl: functionData.imageUrl,
        prompt: effectivePrompt,
        timestamp: Date.now(),
        isHero: currentSession.images.length === 0,
        approvalStatus: "pending",
        chainDepth: 0,
        isChainOrigin: true,
        categoryKey: selectedImageCategory, // Style
        useCaseKey: selectedUseCase, // Use Case (PRIMARY for categorization)
      };

      setCurrentSession(prev => ({
        ...prev,
        name: prev.images.length === 0 ? generateSessionName(effectivePrompt) : prev.name,
        images: [...prev.images, newImage]
      }));

      setAllPrompts(prev => [...prev, { role: 'user', content: effectivePrompt }]);

      // Automatically create a prompt/recipe linked to the generated image
      ensureImageRecipeForImage(newImage);

      toast.success("Image generated successfully!");

      // On mobile, transition to full-screen generated view
      if (isMobile) {
        setLatestGeneratedImage(newImage.imageUrl);
        setShowGeneratedView(true);
      } else {
        // Auto-switch to gallery tab on desktop
        setActiveTab("gallery");
      }

    } catch (error: any) {
      console.error('❌❌❌ Generation error:', error);
      console.error('User ID:', user?.id);
      console.error('Organization ID:', orgId);
      console.error('Session ID:', sessionId);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        functionError: error.context,
        fullError: error
      });

      // Error toast already shown in the functionError handling above
      // Only show generic error if not already handled
      if (!error.message?.includes('Rate limit') &&
        !error.message?.includes('credits') &&
        !error.message?.includes('GEMINI_API_KEY')) {
        toast.error(error.message || "Failed to generate image", {
          description: "Check browser console (F12) for full error details",
          duration: 5000
        });
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSetHero = (imageId: string) => {
    setCurrentSession(prev => ({
      ...prev,
      images: prev.images.map(img => ({
        ...img,
        isHero: img.id === imageId
      }))
    }));
  };

  const handleToggleApproval = (imageId: string) => {
    setCurrentSession(prev => ({
      ...prev,
      images: prev.images.map(img => {
        if (img.id !== imageId) return img;
        const nextStatus: ApprovalStatus =
          img.approvalStatus === "pending" ? "flagged" :
            img.approvalStatus === "flagged" ? "rejected" : "pending";
        return { ...img, approvalStatus: nextStatus };
      })
    }));
  };

  const handleDeleteImage = async (imageId: string) => {
    try {
      await supabase.from('generated_images').delete().eq('id', imageId);

      setCurrentSession(prev => {
        const newImages = prev.images.filter(img => img.id !== imageId);
        if (newImages.length > 0 && !newImages.some(img => img.isHero)) {
          newImages[0].isHero = true;
        }
        return { ...prev, images: newImages };
      });

      toast.success("Image deleted");
    } catch (error) {
      toast.error("Failed to delete image");
    }
  };

  const handleSaveRecipe = async (imageId: string) => {
    if (!orgId || !user) {
      toast.error("Unable to save recipe");
      return;
    }

    const image = currentSession.images.find(img => img.id === imageId);
    if (!image) {
      toast.error("Image not found");
      return;
    }

    try {
      // Get the image's aspect ratio and other metadata from generated_images
      const { data: generatedImage } = await supabase
        .from('generated_images')
        .select('aspect_ratio, output_format, goal_type')
        .eq('id', imageId)
        .single();
      const categoryKey =
        image.categoryKey || selectedImageCategory || DEFAULT_IMAGE_CATEGORY_KEY;

      // PRIMARY: Use the USE CASE to determine library category
      const useCase = image.useCaseKey || selectedUseCase;
      const broadCategory = mapUseCaseToLibraryCategory(useCase);

      // Create prompt linked to the generated image
      const { error } = await supabase
        .from('prompts')
        .insert([{
          title: `${getUseCaseByKey(useCase).label} - ${new Date().toLocaleDateString()}`,
          prompt_text: image.prompt || mainPrompt,
          content_type: 'visual' as any,
          collection: 'General',
          organization_id: orgId,
          created_by: user.id,
          is_template: true,
          deliverable_format: 'image_prompt',
          generated_image_id: imageId,
          image_source: 'generated' as any,
          category: broadCategory,
          additional_context: {
            shot_type: categoryKey,
            aspect_ratio: generatedImage?.aspect_ratio || aspectRatio,
            output_format: generatedImage?.output_format || outputFormat,
            image_type: generatedImage?.goal_type || 'product_photography',
            category: broadCategory,
          },
        }]);

      if (error) throw error;

      toast.success("Recipe saved to library!");
    } catch (error: any) {
      console.error("Error saving recipe:", error);
      toast.error(error.message || "Failed to save recipe");
    }
  };

  const handleSaveSession = async () => {
    const flaggedImages = currentSession.images.filter(img => img.approvalStatus === 'flagged');
    if (flaggedImages.length === 0) {
      toast.error("Please flag at least one image to save");
      return;
    }

    setIsSaving(true);
    try {
      // Update generated_images to mark as saved
      for (const image of flaggedImages) {
        const { error } = await supabase
          .from('generated_images')
          .update({ saved_to_library: true })
          .eq('id', image.id);

        if (error) throw error;
      }

      // Cleanup references
      for (const ref of referenceImages) {
        if (ref.url.includes('image-editor-reference')) {
          await supabase.storage.from('images').remove([ref.url]);
        }
      }

      toast.success(`Saved ${flaggedImages.length} images to library!`);
      for (const image of flaggedImages) {
        await ensureImageRecipeForImage(image);
      }

      // Invalidate library content cache
      queryClient.invalidateQueries({ queryKey: ["library-content"] });

      // Reset session
      setCurrentSession({
        id: crypto.randomUUID(),
        name: "New Session",
        images: [],
        createdAt: Date.now()
      });
      setReferenceImages([]);
      setMainPrompt("");
      setProductImage(null);

    } catch (error) {
      console.error('Save error:', error);
      toast.error("Failed to save session");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReferenceUpload = (url: string, description: string, label: "Background" | "Product" | "Style Reference") => {
    setReferenceImages(prev => [...prev, { url, description, label }]);
    toast.success("Reference added");
  };

  const handleReferenceRemove = (index: number) => {
    setReferenceImages(prev => prev.filter((_, i) => i !== index));
    toast.success("Reference removed");
  };

  const handleStartRefinement = (image: GeneratedImage) => {
    if (image.chainDepth >= 5) {
      toast.error("Maximum refinement depth reached");
      return;
    }
    setSelectedForRefinement(image);
    setRefinementMode(true);
  };

  const handleRefine = async (refinementInstruction: string) => {
    if (!selectedForRefinement || !user) return;

    setIsGenerating(true);
    setRefinementMode(false);

    try {
      const { data: functionData, error: functionError } = await supabase.functions.invoke(
        'generate-madison-image',
        {
          body: {
            prompt: selectedForRefinement.prompt,
            userId: user.id,
            organizationId: orgId,
            sessionId: sessionId,
            goalType: 'product_photography',
            parentPrompt: selectedForRefinement.prompt,
            aspectRatio,
            outputFormat,
            referenceImages: referenceImages.map(r => ({ url: r.url, description: r.description, label: r.label })),
            brandContext: brandContext || undefined,
            isRefinement: true,
            refinementInstruction,
            parentImageId: selectedForRefinement.id,
            aiProvider: proModeControls.aiProvider || DEFAULT_IMAGE_AI_PROVIDER,
            resolution: proModeControls.resolution || "standard",
          }
        }
      );

      if (functionError) throw functionError;
      if (!functionData?.imageUrl) throw new Error("No image returned");
      if (!functionData?.savedImageId) {
        console.error('❌ No savedImageId returned from refinement');
        throw new Error("Refinement failed: Database save unsuccessful");
      }

      // Backend already saved the image with valid ID
      const newImage: GeneratedImage = {
        id: functionData.savedImageId,
        imageUrl: functionData.imageUrl,
        prompt: selectedForRefinement.prompt,
        timestamp: Date.now(),
        isHero: true,
        approvalStatus: "pending",
        parentImageId: selectedForRefinement.id,
        chainDepth: selectedForRefinement.chainDepth + 1,
        isChainOrigin: false,
        refinementInstruction,
        categoryKey: selectedForRefinement.categoryKey || selectedImageCategory,
        useCaseKey: selectedForRefinement.useCaseKey || selectedUseCase,
      };

      setCurrentSession(prev => ({
        ...prev,
        images: prev.images.map(img => ({ ...img, isHero: false })).concat({ ...newImage, isHero: true })
      }));

      toast.success("Refinement complete!");
      setSelectedForRefinement(null);

    } catch (error: any) {
      console.error('Refinement error:', error);
      toast.error(error.message || "Failed to refine image");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleJumpToChainImage = (imageId: string) => {
    handleSetHero(imageId);
  };

  const saveLatestImageToLibrary = async () => {
    const latestImage = currentSession.images[currentSession.images.length - 1];
    if (!latestImage || !user) {
      toast.error("No image to save");
      return;
    }

    setIsSaving(true);
    try {
      console.log('💾 Saving image to library via edge function:', latestImage.id);

      // Always use server-side function to avoid RLS intermittency
      const maxRetries = 3;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const { data: serverData, error: serverError } = await supabase.functions.invoke(
            'mark-generated-image-saved',
            { body: { imageId: latestImage.id, userId: user.id } }
          );

          if (serverError) throw serverError;
          if (!serverData?.success) throw new Error('Save failed on server');

          console.log('✅ Image saved successfully (server)');
          break; // success
        } catch (attemptError) {
          console.error(`❌ Save attempt ${attempt} failed:`, attemptError);
          if (attempt === maxRetries) throw attemptError;
          // Exponential backoff
          await new Promise((r) => setTimeout(r, 400 * attempt));
        }
      }

      // Update local state to mark as flagged
      setCurrentSession(prev => ({
        ...prev,
        images: prev.images.map(img =>
          img.id === latestImage.id
            ? { ...img, approvalStatus: 'flagged' as ApprovalStatus }
            : img
        )
      }));

      // Invalidate library content cache
      queryClient.invalidateQueries({ queryKey: ["library-content"] });
      await ensureImageRecipeForImage(latestImage);

      toast.success("Image saved to library!");
      setShowGeneratedView(false);
      setActiveTab("gallery");
    } catch (error: any) {
      console.error('❌ Save error after all retries:', error);
      toast.error(error.message || "Failed to save image. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const saveHeroImageToLibrary = async () => {
    if (!heroImage || !user) {
      toast.error("No image to save");
      return;
    }

    setIsSaving(true);
    try {
      console.log('💾 Saving hero image to library via edge function:', heroImage.id);

      // Always use server-side function to avoid RLS intermittency
      const maxRetries = 3;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const { data: serverData, error: serverError } = await supabase.functions.invoke(
            'mark-generated-image-saved',
            { body: { imageId: heroImage.id, userId: user.id } }
          );

          if (serverError) throw serverError;
          if (!serverData?.success) throw new Error('Save failed on server');

          console.log('✅ Image saved successfully (server)');
          break; // success
        } catch (attemptError) {
          console.error(`❌ Save attempt ${attempt} failed:`, attemptError);
          if (attempt === maxRetries) throw attemptError;
          // Exponential backoff
          await new Promise((r) => setTimeout(r, 400 * attempt));
        }
      }

      // Update local state to mark as flagged
      setCurrentSession(prev => ({
        ...prev,
        images: prev.images.map(img =>
          img.id === heroImage.id
            ? { ...img, approvalStatus: 'flagged' as ApprovalStatus }
            : img
        )
      }));

      // Invalidate library content cache so new image appears immediately
      queryClient.invalidateQueries({ queryKey: ["library-content"] });
      await ensureImageRecipeForImage(heroImage);

      toast.success("Image saved to library!");
    } catch (error: any) {
      console.error('❌ Save error after all retries:', error);
      toast.error(error.message || "Failed to save image. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadHeroImage = async () => {
    if (!heroImage) {
      toast.error("No image to download");
      return;
    }

    try {
      const { downloadImage } = await import("@/utils/imageDownload");
      await downloadImage(heroImage.imageUrl, `madison-image-${Date.now()}.${outputFormat}`);
      toast.success("Image downloaded!");
    } catch (error) {
      console.error('Download failed:', error);
      toast.error(error instanceof Error ? error.message : "Failed to download image");
    }
  };

  const handleMobileRefine = async (newPrompt: string) => {
    if (!user) {
      toast.error("Please log in to continue");
      return;
    }

    const latestImage = currentSession.images[currentSession.images.length - 1];

    // If no images exist, do a fresh generation
    if (!latestImage) {
      console.log('📸 No existing image, doing fresh generation');
      try {
        await handleGenerate(newPrompt);
      } catch (e) {
        console.error('Fresh generation failed:', e);
        toast.error("Unable to generate image. Please try again.");
      }
      return;
    }

    // Determine if this is a refinement or new generation
    const originalPrompt = latestImage.prompt.trim();
    const trimmedNewPrompt = newPrompt.trim();

    // If prompts are identical or new prompt is empty, treat as refinement with default instruction
    const isRefinement = originalPrompt === trimmedNewPrompt || !trimmedNewPrompt;

    if (isRefinement) {
      // Chain depth limit check
      if (latestImage.chainDepth >= 5) {
        toast.error("Maximum refinement depth reached (5 iterations). Please start a new generation.");
        return;
      }

      // Use a default refinement instruction
      const defaultInstruction = "Enhance this image with better lighting and composition";
      console.log('🔄 Refining with default instruction');

      setIsGenerating(true);

      try {
        const { data: functionData, error: functionError } = await supabase.functions.invoke(
          'generate-madison-image',
          {
            body: {
              prompt: latestImage.prompt,
              userId: user.id,
              organizationId: orgId,
              sessionId: sessionId,
              goalType: 'product_photography',
              parentPrompt: latestImage.prompt,
              aspectRatio,
              outputFormat,
              referenceImages: referenceImages.map(r => ({ url: r.url, description: r.description, label: r.label })),
              brandContext: brandContext || undefined,
              isRefinement: true,
              refinementInstruction: defaultInstruction,
              parentImageId: latestImage.id,
              aiProvider: proModeControls.aiProvider || DEFAULT_IMAGE_AI_PROVIDER,
              resolution: proModeControls.resolution || "standard",
            }
          }
        );

        if (functionError) throw functionError;
        if (!functionData?.imageUrl) throw new Error("No image returned");
        if (!functionData?.savedImageId) throw new Error("Database save failed");

        const newImage: GeneratedImage = {
          id: functionData.savedImageId,
          imageUrl: functionData.imageUrl,
          prompt: latestImage.prompt,
          timestamp: Date.now(),
          isHero: false,
          approvalStatus: "pending",
          parentImageId: latestImage.id,
          chainDepth: latestImage.chainDepth + 1,
          isChainOrigin: false,
          refinementInstruction: defaultInstruction,
          categoryKey: latestImage.categoryKey || selectedImageCategory,
          useCaseKey: latestImage.useCaseKey || selectedUseCase,
        };

        setCurrentSession(prev => ({
          ...prev,
          images: [...prev.images.map(img => ({ ...img, isHero: false })), { ...newImage, isHero: true }]
        }));

        setLatestGeneratedImage(newImage.imageUrl);
        toast.success(`Refinement ${latestImage.chainDepth + 1} complete!`);

      } catch (error: any) {
        console.error('❌ Refinement error:', error);
        toast.error(error.message || "Refinement failed. Please try again.");
      } finally {
        setIsGenerating(false);
      }
    } else {
      // New generation with modified prompt
      console.log('📸 New prompt detected, doing fresh generation');
      try {
        await handleGenerate(newPrompt);
      } catch (e) {
        console.error('New generation failed:', e);
        toast.error("Unable to generate image. Please try again.");
      }
    }
  };

  const resizeTextarea = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height to auto to get accurate scrollHeight
    textarea.style.height = 'auto';

    // Calculate new height (min 48px, max 250px)
    const newHeight = Math.min(Math.max(textarea.scrollHeight, 48), 250);
    textarea.style.height = `${newHeight}px`;

    // Toggle overflow based on whether content exceeds max height
    textarea.style.overflowY = textarea.scrollHeight > 250 ? 'auto' : 'hidden';
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [mainPrompt, resizeTextarea]);

  const heroImage = currentSession.images.find(img => img.isHero);
  const flaggedCount = currentSession.images.filter(img => img.approvalStatus === 'flagged').length;

  // Mobile Layout
  if (isMobile) {
    // Show full-screen generated image view after generation
    if (showGeneratedView && latestGeneratedImage) {
      return (
        <MobileGeneratedImageView
          imageUrl={latestGeneratedImage}
          prompt={mainPrompt}
          aspectRatio={aspectRatio}
          onSave={saveLatestImageToLibrary}
          onClose={() => {
            setShowGeneratedView(false);
            setActiveTab("gallery");
          }}
          onRegenerate={handleMobileRefine}
          onPromptChange={setMainPrompt}
          onAspectRatioChange={setAspectRatio}
          onShotTypeSelect={async (shotType) => {
            setSelectedImageCategory(shotType.key);
            setMainPrompt(shotType.prompt);
            toast.success(`${shotType.label} style applied`);
          }}
          isGenerating={isGenerating}
          isSaving={isSaving}
        />
      );
    }

    return (
      <div className="flex flex-col min-h-screen bg-ink-black text-parchment-white pb-16">
        {/* Mobile Header - Dark Room Theme */}
        <header className="flex items-center justify-between px-4 py-2 border-b border-charcoal bg-charcoal/50 backdrop-blur-sm sticky top-0 z-20 h-12">
          <h1 className="text-sm font-semibold text-aged-brass pl-2">Image Studio</h1>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsMadisonOpen(true)}
              className="text-aged-brass hover:text-aged-brass/80 h-8 w-8 p-0"
            >
              <MessageCircle className="w-4 h-4" />
            </Button>
            {flaggedCount > 0 && (
              <Button onClick={handleSaveSession} disabled={isSaving} variant="outline" size="sm" className="h-8 border-charcoal text-parchment-white">
                <Save className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </header>

        {/* Mobile Tabs - Dark Room Theme */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "create" | "gallery")} className="flex-1 flex flex-col">
          <TabsList className="w-full grid grid-cols-2 bg-charcoal/70 border-b border-charcoal rounded-none h-10">
            <TabsTrigger
              value="create"
              className="data-[state=active]:bg-ink-black data-[state=active]:text-aged-brass data-[state=active]:border-b-2 data-[state=active]:border-aged-brass rounded-none text-parchment-white/60"
            >
              Create
            </TabsTrigger>
            <TabsTrigger
              value="gallery"
              className="data-[state=active]:bg-ink-black data-[state=active]:text-aged-brass data-[state=active]:border-b-2 data-[state=active]:border-aged-brass rounded-none text-parchment-white/60"
            >
              Gallery ({currentSession.images.length})
            </TabsTrigger>
          </TabsList>


          {/* Create Tab - Freepik Style */}
          <TabsContent value="create" className="flex-1 flex flex-col mt-0 overflow-hidden">
            <MobileCreateForm
              prompt={mainPrompt}
              onPromptChange={setMainPrompt}
              aspectRatio={aspectRatio}
              onAspectRatioChange={setAspectRatio}
              onShotTypeSelect={async (shotType) => {
                setSelectedImageCategory(shotType.key);
                setMainPrompt(shotType.prompt);
                toast.success(`${shotType.label} style applied`);

                try {
                  const { data: { session } } = await supabase.auth.getSession();
                  if (session?.access_token && user?.id && orgId) {
                    await supabase.functions.invoke('log-shot-type', {
                      body: {
                        organization_id: orgId,
                        session_id: currentSession?.id || null,
                        label: shotType.label,
                        prompt: shotType.prompt
                      }
                    });
                  }
                } catch (error) {
                  console.error('Failed to log shot type:', error);
                }
              }}
              referenceImage={productImage}
              onReferenceUpload={(file, url) => setProductImage({ file, url })}
              onReferenceRemove={() => setProductImage(null)}
              onGenerate={handleGenerate}
              isGenerating={isGenerating}
              marketplace={marketplace}
              imagesCount={currentSession.images.length}
              maxImages={MAX_IMAGES_PER_SESSION}
            />
          </TabsContent>

          {/* Gallery Tab */}
          <TabsContent value="gallery" className="flex-1 px-4 py-4 overflow-y-auto mt-0">
            {currentSession.images.length > 0 ? (
              <div className="space-y-4">
                {/* Hero Image */}
                {heroImage && (
                  <div className="relative w-full overflow-hidden border border-studio-border bg-studio-card">
                    <div className="relative w-full" style={{ aspectRatio: aspectRatio.replace(':', '/') }}>
                      <img
                        src={heroImage.imageUrl}
                        alt="Generated"
                        className="absolute inset-0 w-full h-full object-contain"
                      />
                    </div>
                    <div className="absolute top-2 right-2 flex gap-2">
                      <Button
                        size="sm"
                        variant={heroImage.approvalStatus === 'flagged' ? 'default' : 'secondary'}
                        onClick={() => handleToggleApproval(heroImage.id)}
                        className="bg-studio-card/90 backdrop-blur-sm h-8 w-8 p-0"
                      >
                        <Heart className={cn("w-4 h-4", heroImage.approvalStatus === 'flagged' && "fill-current")} />
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={async () => {
                          try {
                            const { downloadImage } = await import("@/utils/imageDownload");
                            await downloadImage(heroImage.imageUrl, `madison-image-${Date.now()}.webp`);
                            toast.success("Image downloaded!");
                          } catch (error) {
                            console.error('Download failed:', error);
                            toast.error(error instanceof Error ? error.message : "Failed to download image");
                          }
                        }}
                        className="bg-studio-card/90 backdrop-blur-sm h-8 w-8 p-0"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* Thumbnail Carousel */}
                {currentSession.images.length > 1 && (
                  <div className="space-y-2">
                    <Label className="text-studio-text-primary text-sm">All Images ({currentSession.images.length})</Label>
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                      {currentSession.images.map((img, index) => (
                        <button
                          key={img.id}
                          onClick={() => handleSetHero(img.id)}
                          className={cn(
                            "shrink-0 w-24 h-24 rounded-lg overflow-hidden border-2 transition-all",
                            img.isHero
                              ? "border-aged-brass"
                              : "border-studio-border hover:border-studio-border/80"
                          )}
                        >
                          <img
                            src={img.imageUrl}
                            alt={`Generated ${index + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setActiveTab("create")}
                    className="flex-1"
                  >
                    Create Another
                  </Button>
                  {flaggedCount > 0 && (
                    <Button
                      onClick={handleSaveSession}
                      disabled={isSaving}
                      variant="brass"
                      className="flex-1"
                    >
                      {isSaving ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Save className="w-4 h-4 mr-2" />
                      )}
                      Save ({flaggedCount})
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center h-full space-y-4">
                <Sparkles className="w-16 h-16 text-aged-brass opacity-40" />
                <div>
                  <h3 className="text-xl font-semibold text-aged-paper mb-2">
                    No images yet
                  </h3>
                  <p className="text-studio-text-muted mb-4">
                    Create your first image in the Create tab
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => setActiveTab("create")}
                  >
                    Go to Create
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Generating Overlay */}
        {isGenerating && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-50">
            <Loader2 className="w-12 h-12 text-aged-brass animate-spin mb-4" />
            <p className="text-aged-paper text-lg font-medium">Generating magic...</p>
            <p className="text-studio-text-muted text-sm mt-2">This may take a moment</p>
          </div>
        )}

        {/* Madison Panel (Full-Screen Bottom Sheet) */}
        <MadisonPanel
          sessionCount={currentSession.images.length}
          maxImages={MAX_IMAGES_PER_SESSION}
          isOpen={isMadisonOpen}
          onToggle={() => setIsMadisonOpen(!isMadisonOpen)}
          isMobile={true}
          productContext={selectedProduct ? {
            name: selectedProduct.name,
            collection: selectedProduct.collection || 'Unknown',
            scent_family: selectedProduct.scentFamily || 'Unspecified',
            category: selectedProduct.category
          } : null}
          referenceImageCount={referenceImages.length}
          proModeActive={showProMode && Object.keys(proModeControls).length > 0}
          proModeSettings={showProMode ? proModeControls : undefined}
        />
      </div>
    );
  }

  // Desktop Layout
  return (
    <div className="flex flex-col h-screen bg-ink-black text-parchment-white">
      {/* Top Toolbar */}
      <header className="flex items-center justify-between px-6 pr-6 py-3 border-b border-charcoal/50 bg-charcoal/30 backdrop-blur-sm sticky top-0 z-20 overflow-hidden">
        <div className="flex items-center gap-4 flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="text-parchment-white/50 hover:text-parchment-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold text-aged-brass">Image Studio</h1>
            <p className="text-xxs text-parchment-white/40">Powered by Nano Banana</p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0 ml-4">
          {/* Product Selector */}
          <ProductSelector
            value={selectedProduct?.name || ""}
            onSelect={setSelectedProduct}
            onProductDataChange={setSelectedProduct}
            showLabel={false}
            className="w-[200px]"
            buttonClassName="w-[200px] bg-charcoal/50 border-charcoal/70 text-parchment-white hover:bg-charcoal transition-colors justify-between"
          />

          {/* Use Case Selector (Primary) */}
          <UseCaseSelector
            value={selectedUseCase}
            onSelect={(useCase) => {
              setSelectedUseCase(useCase);
              const useCaseDef = getUseCaseByKey(useCase);
              setAspectRatio(useCaseDef.defaultAspectRatio);

              // Update prompt to combine use case + current style
              const currentStyle = getImageCategoryByKey(selectedImageCategory);
              if (currentStyle) {
                const combinedPrompt = buildCombinedPrompt(useCaseDef, currentStyle, selectedProduct);
                setMainPrompt(combinedPrompt);
              }

              toast.success(`${useCaseDef.label} selected`);
            }}
            className="w-[160px] bg-charcoal/50 border-charcoal/70 text-parchment-white"
          />

          {/* Shot Type (Secondary - Shows all, highlights recommended) */}
          <ShotTypeDropdown
            useCase={selectedUseCase}
            onSelect={async (shotType) => {
              setSelectedImageCategory(shotType.key);

              // Combine use case + style prompts (both work together)
              const useCaseDef = getUseCaseByKey(selectedUseCase);
              const combinedPrompt = buildCombinedPrompt(useCaseDef, shotType, selectedProduct);
              setMainPrompt(combinedPrompt);

              // Auto-switch to 1:1 for Flat Lay (Instagram standard)
              if (shotType.key === "flat_lay" && aspectRatio !== "1:1") {
                setAspectRatio("1:1");
                toast.success(`${shotType.label} style applied - switched to 1:1 (Instagram)`);
              } else {
                toast.success(`${shotType.label} style applied`);
              }

              // Log shot type selection to backend
              try {
                const { data: { session } } = await supabase.auth.getSession();
                if (session?.access_token && user?.id && orgId) {
                  await supabase.functions.invoke('log-shot-type', {
                    body: {
                      organization_id: orgId,
                      session_id: currentSession?.id || null,
                      label: shotType.label,
                      prompt: shotType.prompt
                    }
                  });
                }
              } catch (error) {
                console.error('Failed to log shot type:', error);
              }
            }}
            className="w-[180px] bg-charcoal/50 border-charcoal/70 text-parchment-white"
          />

          {/* Aspect Ratio (Filtered by Use Case + Style) */}
          <Select value={aspectRatio} onValueChange={setAspectRatio}>
            <SelectTrigger className="w-[140px] bg-charcoal/50 border-charcoal/70 text-parchment-white hover:bg-charcoal transition-colors">
              <SelectValue placeholder="Aspect ratio" />
            </SelectTrigger>
            <SelectContent className="bg-charcoal border-charcoal/70 text-parchment-white z-50 backdrop-blur-sm">
              {(() => {
                // Get base options from use case
                let availableRatios = [...currentUseCase.aspectRatioOptions];

                // If Flat Lay style is selected, ensure 1:1 is available (Instagram standard)
                const isFlatLay = selectedImageCategory === "flat_lay";
                if (isFlatLay && !availableRatios.includes("1:1")) {
                  availableRatios = ["1:1", ...availableRatios];
                }

                const labels: Record<string, string> = {
                  "1:1": "1:1 Square",
                  "16:9": "16:9 Landscape",
                  "9:16": "9:16 Portrait",
                  "4:3": "4:3 Classic",
                  "4:5": "4:5 Portrait",
                  "5:4": "5:4 Etsy",
                  "21:9": "21:9 Ultra Wide",
                  "3:2": "3:2 Classic",
                };

                return availableRatios.map((ratio) => {
                  const isDefault = ratio === currentUseCase.defaultAspectRatio;
                  const isFlatLayRecommended = isFlatLay && ratio === "1:1";
                  return (
                    <SelectItem
                      key={ratio}
                      value={ratio}
                      className={cn(
                        "hover:bg-aged-brass/10",
                        isDefault && "font-semibold text-aged-brass",
                        isFlatLayRecommended && !isDefault && "text-aged-brass/80"
                      )}
                    >
                      {labels[ratio] || ratio} {isDefault && "⭐"} {isFlatLayRecommended && !isDefault && "📸"}
                    </SelectItem>
                  );
                });
              })()}
            </SelectContent>
          </Select>

          {/* Output Format */}
          <Select value={outputFormat} onValueChange={(v: any) => setOutputFormat(v)}>
            <SelectTrigger className="w-[120px] bg-charcoal/50 border-charcoal/70 text-parchment-white hover:bg-charcoal transition-colors">
              <SelectValue placeholder="Output" />
            </SelectTrigger>
            <SelectContent className="bg-charcoal border-charcoal/70 text-parchment-white z-50 backdrop-blur-sm">
              <SelectItem value="png" className="hover:bg-aged-brass/10">PNG</SelectItem>
              <SelectItem value="jpeg" className="hover:bg-aged-brass/10">JPG</SelectItem>
              <SelectItem value="webp" className="hover:bg-aged-brass/10">WEBP</SelectItem>
            </SelectContent>
          </Select>

          {/* Pro Mode Toggle */}
          <Button
            variant="outline"
            onClick={() => setShowProMode(!showProMode)}
            className={showProMode
              ? 'bg-aged-brass/10 border-aged-brass text-aged-brass hover:bg-aged-brass/20'
              : 'bg-charcoal/50 border-charcoal/70 text-parchment-white hover:bg-charcoal'
            }
          >
            <Settings className="w-4 h-4 mr-2" />
            Pro mode
            {Object.keys(proModeControls).length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xxs bg-aged-brass/20 text-aged-brass border-aged-brass/30">
                {Object.keys(proModeControls).length}
              </Badge>
            )}
          </Button>

          {/* Save Button */}
          {flaggedCount > 0 && (
            <Button onClick={handleSaveSession} disabled={isSaving} variant="outline">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Save ({flaggedCount})
            </Button>
          )}

          {/* Generate Button */}
          <Button
            onClick={() => handleGenerate()}
            disabled={!mainPrompt.trim() || isGenerating || currentSession.images.length >= MAX_IMAGES_PER_SESSION}
            size="lg"
            variant="brass"
            className="px-6 relative"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4 mr-2" />
                Generate
                {Object.keys(proModeControls).length > 0 && (
                  <span className="ml-1 text-xxs opacity-70">Pro</span>
                )}
              </>
            )}
          </Button>

          {/* Ask Madison Button */}
          <Button
            onClick={() => setIsMadisonOpen(!isMadisonOpen)}
            variant="brass"
            className="px-4"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Ask Madison
          </Button>
        </div>
      </header>

      {/* Main Layout */}
      <main className="flex flex-1 overflow-hidden relative">
        {/* Center Viewport (Fixed) */}
        <section className="flex-1 flex flex-col relative overflow-hidden">
          {/* Image Viewport */}
          <div className="flex-1 bg-charcoal/20 flex items-center justify-center relative overflow-hidden">
            {heroImage ? (
              <div className="relative w-full h-full flex flex-col">
                {/* Main Image Display */}
                <div className="flex-1 flex items-center justify-center p-8 pb-24">
                  <div className="relative w-full max-w-5xl max-h-full flex items-center justify-center border border-studio-border/70 bg-gradient-to-br from-ink-black via-charcoal to-ink-black shadow-[0_45px_120px_rgba(26,24,22,0.65)] overflow-hidden">
                    <div
                      className="absolute inset-0 pointer-events-none opacity-30"
                      style={{ background: "radial-gradient(circle at 50% 30%, rgba(255,255,255,0.12), transparent 60%)" }}
                    />
                    <img
                      src={heroImage.imageUrl}
                      alt="Generated"
                      className="relative z-10 max-w-full max-h-full object-contain"
                    />
                    {/* Quick Action Buttons (Top Right) */}
                    <div className="absolute top-6 right-6 z-20 flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={saveHeroImageToLibrary}
                        disabled={isSaving || heroImage.approvalStatus === 'flagged'}
                        className={cn(
                          "bg-studio-card/90 backdrop-blur-sm h-9 px-3 transition-all",
                          heroImage.approvalStatus === 'flagged'
                            ? "bg-green-500/20 border-green-500/50 hover:bg-green-500/30 text-green-500"
                            : "hover:bg-studio-card"
                        )}
                        title={heroImage.approvalStatus === 'flagged' ? "Saved to Library" : "Save to Library"}
                      >
                        {isSaving ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : heroImage.approvalStatus === 'flagged' ? (
                          <CheckCircle className="w-4 h-4 fill-green-500 text-green-500" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                        <span className="sr-only">Save to Library</span>
                      </Button>

                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={handleDownloadHeroImage}
                        className="bg-studio-card/90 backdrop-blur-sm h-9 w-9 p-0"
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center space-y-4 p-8">
                <Sparkles className="w-20 h-20 text-aged-brass/60" strokeWidth={1.5} />
                <div>
                  <h3 className="text-2xl font-semibold text-parchment-white mb-2">
                    Your canvas awaits
                  </h3>
                  <p className="text-parchment-white/60 text-lg">
                    Describe your vision below and watch Madison bring it to life
                  </p>
                </div>
              </div>
            )}

            {/* Generating Overlay */}
            {isGenerating && (
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-20">
                <Loader2 className="w-12 h-12 text-aged-brass animate-spin mb-4" />
                <p className="text-aged-paper text-lg font-medium">Generating magic...</p>
                <p className="text-studio-text-muted text-sm mt-2">This may take a moment</p>
              </div>
            )}
          </div>

          {/* Thumbnail Carousel - 10 Slot */}
          {currentSession.images.length > 0 && (
            <ThumbnailRibbon
              images={currentSession.images.map(img => ({
                id: img.id,
                url: img.imageUrl,
                prompt: img.prompt,
                aspectRatio: aspectRatio,
                orderIndex: currentSession.images.indexOf(img)
              }))}
              activeIndex={currentSession.images.findIndex(img => img.isHero)}
              onSelect={(index) => {
                const selectedImage = currentSession.images[index];
                if (selectedImage) {
                  handleSetHero(selectedImage.id);
                }
              }}
              onSave={async (img) => {
                try {
                  const imageToSave = currentSession.images.find(image => image.id === img.id);
                  const { data: serverData, error: serverError } = await supabase.functions.invoke(
                    'mark-generated-image-saved',
                    { body: { imageId: img.id, userId: user?.id } }
                  );
                  if (serverError) throw serverError;
                  if (!serverData?.success) throw new Error('Save failed');

                  setCurrentSession(prev => ({
                    ...prev,
                    images: prev.images.map(image =>
                      image.id === img.id
                        ? { ...image, approvalStatus: 'flagged' as ApprovalStatus }
                        : image
                    )
                  }));

                  // Invalidate library content cache
                  queryClient.invalidateQueries({ queryKey: ["library-content"] });
                  await ensureImageRecipeForImage(imageToSave);

                  toast.success("Image saved to library!");
                } catch (error) {
                  console.error('Error saving image:', error);
                  toast.error("Failed to save image");
                }
              }}
              onDelete={async (img) => {
                await handleDeleteImage(img.id);
              }}
              onRefine={(img) => {
                const imageToRefine = currentSession.images.find(i => i.id === img.id);
                if (imageToRefine) {
                  handleStartRefinement(imageToRefine);
                }
              }}
              onSaveSession={handleSaveSession}
            />
          )}

          {/* Prompt Bar (Fixed Bottom) */}
          <footer className="border-t border-charcoal/50 bg-charcoal/30 backdrop-blur-sm sticky bottom-0 z-[15] overflow-hidden">
            {/* AI backend (always visible — keeps GPT Image 2 as the default unless the user overrides it) */}
            <div className="px-6 py-2 border-b border-charcoal/50 flex flex-wrap items-center gap-3 bg-ink-black/20">
              <span className="text-xxs font-medium text-parchment-white/50 uppercase tracking-wide shrink-0">
                Image AI
              </span>
              <Select
                value={proModeControls.aiProvider || DEFAULT_IMAGE_AI_PROVIDER}
                onValueChange={updateProAiProvider}
                disabled={isGenerating}
              >
                <SelectTrigger className="h-8 w-[min(100%,220px)] max-w-[260px] bg-charcoal border-stone/20 text-parchment-white text-xs">
                  <SelectValue placeholder="Model" />
                </SelectTrigger>
                <SelectContent className="max-h-[280px]">
                  {AI_MODEL_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value} className="text-xs">
                      {option.label}
                      {option.badge ? (
                        <span className="text-parchment-white/40 ml-1">({option.badge})</span>
                      ) : null}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-1 flex-1 min-w-[140px] max-w-[320px]">
                {IMAGE_GEN_RESOLUTION_OPTIONS.map((option) => {
                  const isSelected =
                    proModeControls.resolution === option.value ||
                    (!proModeControls.resolution && option.value === "standard");
                  return (
                    <button
                      key={option.value}
                      type="button"
                      disabled={isGenerating}
                      onClick={() => updateProResolution(option.value)}
                      className={cn(
                        "flex-1 rounded border py-1.5 text-xxs font-medium transition-colors",
                        isSelected
                          ? "border-aged-brass bg-aged-brass/15 text-parchment-white"
                          : "border-charcoal/80 bg-charcoal/50 text-parchment-white/70 hover:border-stone/30",
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Pro Mode Status Indicator */}
            {Object.keys(proModeControls).length > 0 && (
              <div className="px-6 pr-6 py-2 border-b border-charcoal/50 bg-aged-brass/5">
                <div className="flex items-center gap-2 text-xxs">
                  <Settings className="w-3 h-3 text-aged-brass" />
                  <span className="text-aged-brass font-medium">Pro mode active</span>
                  <span className="text-parchment-white/40">—</span>
                  <span className="text-parchment-white/40">
                    Advanced settings applied ({Object.keys(proModeControls).length} parameter{Object.keys(proModeControls).length > 1 ? 's' : ''})
                  </span>
                </div>
              </div>
            )}
            <div className="px-6 pr-6 py-4">
              {/* Horizontal Layout: Drop Zone + Prompt + Generate Button */}
              <div className="flex items-center gap-3 max-w-full overflow-hidden">
                {/* Drop Zone */}
                <div className="min-w-[220px] max-w-[280px]">
                  <ProductImageUpload
                    productImage={productImage}
                    onUpload={setProductImage}
                    onRemove={() => setProductImage(null)}
                    disabled={isGenerating}
                  />
                </div>

                {/* Prompt Field */}
                <div className="flex-1 relative">
                  <Textarea
                    ref={textareaRef}
                    value={mainPrompt}
                    onChange={(e) => setMainPrompt(e.target.value)}
                    placeholder="Describe the image you want to create..."
                    className="w-full resize-none bg-charcoal border border-stone/20 text-parchment-white placeholder:text-charcoal/60 focus-visible:ring-brass-glow/50"
                    style={{
                      color: '#F5F1E8',
                      minHeight: '3rem',
                      maxHeight: '250px',
                      height: '3rem',
                      transition: 'height 0.2s ease',
                      overflowY: 'hidden'
                    }}
                    onInput={resizeTextarea}
                    onPaste={() => {
                      // Use setTimeout to allow paste content to render before measuring
                      setTimeout(resizeTextarea, 0);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleGenerate();
                      }
                    }}
                    disabled={isGenerating}
                  />
                  {/* Bottle Type Indicator */}
                  {selectedProduct?.bottle_type && selectedProduct.bottle_type !== 'auto' && (
                    <div className="absolute top-1 right-2 text-xs">
                      <Badge
                        variant="outline"
                        className={selectedProduct.bottle_type === 'oil'
                          ? "bg-green-500/20 border-green-500/50 text-green-500"
                          : "bg-blue-500/20 border-blue-500/50 text-blue-500"
                        }
                      >
                        {selectedProduct.bottle_type === 'oil' ? 'Oil Bottle' : 'Spray Bottle'}
                      </Badge>
                    </div>
                  )}
                </div>

                {/* Generate Button */}
                <Button
                  onClick={() => handleGenerate()}
                  disabled={!mainPrompt.trim() || isGenerating || currentSession.images.length >= MAX_IMAGES_PER_SESSION}
                  size="lg"
                  variant="brass"
                  className="h-12 px-8 min-w-[180px] max-w-[220px]"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-4 h-4 mr-2" />
                      {productImage ? "Enhance This Image" : "Generate Image"}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </footer>
        </section>

        {/* Pro Mode Drawer (Overlay) */}
        {showProMode && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/40 z-40"
              onClick={() => setShowProMode(false)}
            />

            {/* Drawer */}
            <aside className="fixed right-0 top-[69px] bottom-0 w-96 border-l border-charcoal bg-charcoal shadow-2xl z-50 overflow-y-auto animate-in slide-in-from-right duration-300">
              <ScrollArea className="h-full">
                <div className="p-6 space-y-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-aged-brass">Pro mode settings</h2>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowProMode(false)}
                      className="text-parchment-white/50 hover:text-parchment-white"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* Reference Images */}
                  <div>
                    <h3 className="text-parchment-white text-sm font-medium flex items-center gap-2 mb-3">
                      <span className="text-aged-brass">📸</span> Add a reference image to guide Madison's creation
                    </h3>
                    <ReferenceUpload
                      images={referenceImages}
                      onUpload={handleReferenceUpload}
                      onRemove={handleReferenceRemove}
                      maxImages={3}
                    />
                  </div>

                  {/* Pro Mode Controls */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-medium text-parchment-white">Advanced controls</h3>
                      {Object.keys(proModeControls).length > 0 && (
                        <Badge className="bg-aged-brass/20 text-aged-brass border-aged-brass/30 text-xxs">
                          {Object.keys(proModeControls).length} active
                        </Badge>
                      )}
                    </div>
                    <ProModePanel
                      onControlsChange={setProModeControls}
                      initialValues={proModeControls}
                    />
                  </div>

                  {/* Brand Context Info */}
                  {brandContext && (
                    <Card className="p-3 bg-ink-black/50 border-charcoal/70">
                      <div className="flex items-start gap-2">
                        <Info className="w-4 h-4 mt-0.5 text-parchment-white/60 flex-shrink-0" />
                        <div className="text-xs text-parchment-white/60">
                          <p className="font-medium mb-1 text-parchment-white/80">Brand Context Active</p>
                          <p>Images will align with your brand guidelines</p>
                        </div>
                      </div>
                    </Card>
                  )}
                </div>
              </ScrollArea>
            </aside>
          </>
        )}
      </main>{/* close wrapper */}


      {/* Refinement Modal Overlay */}
      {refinementMode && selectedForRefinement && (
        <div className="fixed inset-0 bg-ink-black/80 backdrop-blur-md z-30 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl">
            <RefinementPanel
              baseImage={selectedForRefinement}
              onRefine={handleRefine}
              onCancel={() => {
                setRefinementMode(false);
                setSelectedForRefinement(null);
              }}
            />
          </div>
        </div>
      )}

      {/* Madison Panel */}
      <MadisonPanel
        sessionCount={currentSession.images.length}
        maxImages={MAX_IMAGES_PER_SESSION}
        isOpen={isMadisonOpen}
        onToggle={() => setIsMadisonOpen(!isMadisonOpen)}
        isMobile={false}
        productContext={selectedProduct ? {
          name: selectedProduct.name,
          collection: selectedProduct.collection || 'Unknown',
          scent_family: selectedProduct.scentFamily || 'Unspecified',
          category: selectedProduct.category
        } : null}
        referenceImageCount={referenceImages.length}
        proModeActive={showProMode && Object.keys(proModeControls).length > 0}
        proModeSettings={showProMode ? proModeControls : undefined}
        onSendMessage={async (message) => {
          console.log("Madison message:", message);
          // TODO (Backlog): Integrate with Madison AI backend
        }}
      />
    </div>
  );
}
