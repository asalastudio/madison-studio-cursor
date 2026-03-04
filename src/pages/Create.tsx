import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Lightbulb, FileText, PenTool, X, Send, Loader2, Upload, Search, ChevronDown, ChevronUp, BookOpen } from "lucide-react";
import { LibrarianTrigger } from "@/components/librarian";
import { AgentSuggestion } from "@/components/agent";
import { useAgentBehavior } from "@/hooks/useAgentBehavior";
import penNibIcon from "@/assets/pen-nib-icon-new.png";
import { createRoot } from "react-dom/client";
import { ThinkMode } from "@/components/create/ThinkMode";
import { FormatPicker } from "@/components/create/FormatPicker";
import { AdvancedOptions } from "@/components/create/AdvancedOptions";
import MadisonStudioLoadingAnimation from "@/components/forge/MadisonStudioLoadingAnimation";
import { TransitionLoader } from "@/components/forge/TransitionLoader";
import { BrandKnowledgeIndicator } from "@/components/forge/BrandKnowledgeIndicator";
import { stripMarkdown } from "@/utils/forgeHelpers";
import { supabase } from "@/integrations/supabase/client";
import { useOnboarding } from "@/hooks/useOnboarding";
import { useProducts } from "@/hooks/useProducts";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useBrandContext } from "@/hooks/useBrandContext";
import { madison } from "@/lib/madisonToast";
import { generateSmartName } from "@/lib/promptNaming";
import { detectCategory } from "@/lib/promptCategorization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { WorksheetUpload } from "@/components/forge/WorksheetUpload";
import { VideoHelpTrigger } from "@/components/help/VideoHelpTrigger";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export default function Create() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentOrganizationId } = useOnboarding();
  const { products, loading: productsLoading } = useProducts();
  const { userName } = useUserProfile();
  const { brandName } = useBrandContext(currentOrganizationId);


  // Madison Agent - proactive suggestions
  const {
    currentSuggestion,
    dismissSuggestion,
    acceptSuggestion,
    onGenerationComplete,
    triggerSuggestion,
  } = useAgentBehavior({
    context: 'forge',
    trackIdle: true,
    idleThreshold: 10 * 60 * 1000, // 10 minutes
    enabled: true,
  });

  // Librarian state
  const [showLibrarian, setShowLibrarian] = useState(false);

  // Form state
  const [product, setProduct] = useState("");
  const [productData, setProductData] = useState<any>(null);
  const [format, setFormat] = useState("");
  const [audience, setAudience] = useState("");
  const [goal, setGoal] = useState("");
  const [style, setStyle] = useState("brand-voice");
  const [additionalContext, setAdditionalContext] = useState("");

  // Load prompt from navigation state if present
  useEffect(() => {
    if (location.state?.prompt) {
      const prompt = location.state.prompt;
      const fieldMappings = location.state?.fieldMappings;

      if (fieldMappings) {
        // Smart mapping: populate individual fields
        if (fieldMappings.product) setProduct(fieldMappings.product);
        if (fieldMappings.format) setFormat(fieldMappings.format);
        if (fieldMappings.audience) setAudience(fieldMappings.audience);
        if (fieldMappings.goal) setGoal(fieldMappings.goal);
        if (fieldMappings.additionalContext) {
          setAdditionalContext(fieldMappings.additionalContext);
        } else {
          // Fallback to full prompt text if no specific mapping
          setAdditionalContext(prompt.prompt_text);
        }

        madison.info(
          "Template loaded with smart mapping",
          `"${prompt.title}" fields auto-populated`
        );
      } else {
        // Legacy/simple templates: map best-effort and prefill
        // 1) Try full_brief from additional_context
        if (prompt.additional_context?.full_brief) {
          const brief = prompt.additional_context.full_brief;
          if (brief.product_id) setProduct(brief.product_id);
          if (brief.deliverable_format) setFormat(brief.deliverable_format);
          if (brief.target_audience) setAudience(brief.target_audience);
          if (brief.content_goal) setGoal(brief.content_goal);
          if (brief.style_overlay) setStyle(brief.style_overlay);
          if (brief.additional_context) setAdditionalContext(brief.additional_context);
        } else {
          // 2) Map legacy content_type → current deliverable value keys
          const contentTypeValueMap: Record<string, string> = {
            email: 'email_campaign',
            social: 'social_media_post',
            blog: 'blog_article',
            product: 'product_description',
            visual: 'image_prompt'
          };
          if (prompt.content_type && contentTypeValueMap[prompt.content_type]) {
            setFormat(contentTypeValueMap[prompt.content_type]);
          }
          // 3) Always drop the template text into Additional Editorial Direction
          if (prompt.prompt_text) setAdditionalContext(prompt.prompt_text);
        }
        // Surface it to the user and open Advanced Options so they see the text
        setAdvancedOptionsOpen(true);
        madison.info(
          "Template loaded",
          `"${prompt.title}" applied. Edit details in Advanced Options.`
        );
      }

      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Handle URL param for worksheet upload
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('upload') === 'true') {
      setUploadDialogOpen(true);
    }
  }, [location.search]);

  const [thinkModeExpanded, setThinkModeExpanded] = useState(false);
  const [showTransitionLoader, setShowTransitionLoader] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [formatPickerOpen, setFormatPickerOpen] = useState(false);
  const [advancedOptionsOpen, setAdvancedOptionsOpen] = useState(false);

  const [showThinkMode, setShowThinkMode] = useState(() => {
    const saved = localStorage.getItem('madison-show-think-mode');
    return saved !== 'false';
  });

  const toggleThinkMode = (checked: boolean) => {
    setShowThinkMode(checked);
    localStorage.setItem('madison-show-think-mode', String(checked));
  };

  const handleSubmit = () => {
    // Only format is required
    if (!format) {
      madison.warning(
        "Format required",
        "Please select a deliverable format to continue."
      );
      return;
    }

    // Auto-generate name like Image Studio does
    const contentName = generateSmartName({
      deliverable_format: format,
      product_name: productData?.name,
      style_overlay: style,
      goal: goal
    });

    // Directly generate content with auto-name
    handleGenerateContent(contentName);
  };

  const handleGenerateContent = async (contentName: string) => {
    const briefData = {
      productId: product && product !== "none" ? product : null,
      productData: product && product !== "none" ? productData : null,
      deliverableFormat: format,
      targetAudience: audience,
      contentGoal: goal,
      styleOverlay: style,
      additionalContext,
      contentName,
      timestamp: Date.now()
    };

    localStorage.setItem('madison-content-brief', JSON.stringify(briefData));
    setIsGenerating(true);

    // Show loading overlay
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'generating-loader';
    document.body.appendChild(loadingDiv);

    // Render the loader component immediately
    const loaderRoot = createRoot(loadingDiv);
    loaderRoot.render(<MadisonStudioLoadingAnimation />);

    try {
      // Build AI prompt from brief fields
      const promptParts = [
        product && product !== "none" && `Product: ${product}`,
        `Format: ${format}`,
        audience && `Target Audience: ${audience}`,
        goal && `Content Goal: ${goal}`,
        additionalContext && `\nAdditional Direction: ${additionalContext}`
      ].filter(Boolean).join('\n');

      // Add blog-specific requirements if blog format is selected
      let blogRequirements = '';
      if (format === 'blog_article') {
        blogRequirements = `

BLOG POST REQUIREMENTS:
- Target Length: 1200-1500 words minimum (this is critical - do not write shorter articles)
- Structure: Use three-act structure throughout:
  * ACT I (15%): Opening hook that establishes emotional context and makes the reader lean in
  * ACT II (70%): Core exploration with 2-3 H2 subheadings, concrete examples, evidence, and narrative flow
  * ACT III (15%): Synthesis with key takeaway and clear call to reflection
- Include substantive, researched content with depth and insight
- Maintain narrative flow and brand voice throughout
- Use proper H2 headers (##) for main sections
- Provide concrete examples and avoid surface-level commentary

CRITICAL: This must be a full-length blog article of 1200-1500 words. Do not summarize or abbreviate.`;
      }

      const fullPrompt = `${promptParts}${blogRequirements}\n\n[EXECUTE THIS BRIEF IMMEDIATELY. OUTPUT ONLY THE FINAL COPY. NO QUESTIONS OR ANALYSIS.]`;

      // Verify authentication before auto-save and edge function
      const { data: { user: authUser }, error: authCheckError } = await supabase.auth.getUser();
      if (authCheckError || !authUser) {
        throw new Error("Authentication required. Please sign in again.");
      }
      if (!currentOrganizationId) {
        throw new Error("No organization found. Please complete onboarding first.");
      }

      // ENHANCED AUTO-SAVE: Capture rich metadata for intelligent reuse
      try {
        // Generate smart name
        const autoGeneratedName = generateSmartName({
          deliverable_format: format,
          product_name: productData?.name,
          style_overlay: style,
          goal: goal
        });

        // Detect category using client-side rules
        const category = detectCategory({
          deliverable_format: format,
          goal: goal,
          audience: audience,
          style_overlay: style,
          custom_instructions: additionalContext
        });

        // Build additional context object
        const additionalContextObj = {
          full_brief: {
            product_id: product && product !== "none" ? product : null,
            deliverable_format: format,
            target_audience: audience,
            content_goal: goal,
            style_overlay: style,
            additional_context: additionalContext
          },
          generated_at: new Date().toISOString()
        };

        // Save prompt with rich metadata (cast to any to avoid type issues during migration)
        const promptData: any = {
          // Existing required fields
          title: autoGeneratedName,
          prompt_text: fullPrompt,
          content_type: format.toLowerCase().includes('email') ? 'email' :
            format.toLowerCase().includes('social') ? 'social' :
              format.toLowerCase().includes('blog') ? 'blog' :
                format.toLowerCase().includes('product') ? 'product' : 'other',
          collection: "auto_saved",
          organization_id: currentOrganizationId,
          created_by: authUser.id,
          is_template: false,
          times_used: 1,

          // NEW: Rich metadata for intelligent reuse
          product_id: product && product !== "none" ? product : null,
          deliverable_format: format,
          audience: audience,
          goal: goal,
          style_overlay: style,
          custom_instructions: additionalContext,
          additional_context: additionalContextObj,
          auto_generated_name: autoGeneratedName,
          is_auto_saved: true,
          is_favorited: false,
          category: category
        };

        const { error: promptError } = await supabase
          .from("prompts")
          .insert(promptData);

        if (promptError) {
          logger.error("Error saving prompt:", promptError);
          // Don't block user flow - auto-save is best-effort
        }
      } catch (error) {
        logger.error("Auto-save failed:", error);
        // Silently fail - don't interrupt user experience
      }

      // Verify Supabase URL is configured
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (!supabaseUrl) {
        logger.error("Missing VITE_SUPABASE_URL environment variable");
        throw new Error("Configuration error. Please contact support.");
      }

      logger.debug("Calling edge function with:", {
        hasPrompt: !!fullPrompt,
        promptLength: fullPrompt.length,
        organizationId: currentOrganizationId,
        mode: "generate",
        format,
        userId: authUser.id
      });

      // Call real AI edge function
      const { data, error } = await supabase.functions.invoke('generate-with-claude', {
        body: {
          prompt: fullPrompt,
          organizationId: currentOrganizationId,
          mode: "generate",
          styleOverlay: style.toUpperCase().replace(/-/g, '_'),
          productData,
          product_id: product && product !== "none" ? product : null, // Pass product ID for database lookup
          contentType: format // Pass the content type so Madison knows what format to use
        }
      });

      if (error) {
        // Enhanced error handling - try to extract detailed error message
        let errorMessage = error.message || "Failed to send a request to the Edge Function";

        // Try to read the error response body if it's a ReadableStream
        if (error.context?.body && error.context.body instanceof ReadableStream) {
          try {
            const reader = error.context.body.getReader();
            const decoder = new TextDecoder();
            let bodyText = '';
            let done = false;

            while (!done) {
              const { value, done: streamDone } = await reader.read();
              done = streamDone;
              if (value) {
                bodyText += decoder.decode(value, { stream: true });
              }
            }

            if (bodyText) {
              try {
                const parsed = JSON.parse(bodyText);
                if (parsed.error) {
                  errorMessage = parsed.error;
                } else if (parsed.message) {
                  errorMessage = parsed.message;
                }
              } catch (e) {
                // If it's not JSON, use the text as-is (up to 500 chars)
                if (bodyText.length < 500) {
                  errorMessage = bodyText;
                }
              }
            }
          } catch (e) {
            logger.error("Error reading error response stream:", e);
          }
        } else if (error.context?.body) {
          // Handle non-stream body
          try {
            const parsed = typeof error.context.body === 'string'
              ? JSON.parse(error.context.body)
              : error.context.body;
            if (parsed.error) {
              errorMessage = parsed.error;
            } else if (parsed.message) {
              errorMessage = parsed.message;
            }
          } catch (e) {
            // If parsing fails, check if body is a string with error info
            if (typeof error.context.body === 'string' && error.context.body.length < 500) {
              errorMessage = error.context.body;
            }
          }
        }

        // Check error context for status code
        if (error.context?.status) {
          const status = error.context.status;
          if (status === 401) {
            errorMessage = errorMessage || "Authentication failed. Please sign in again.";
          } else if (status === 403) {
            errorMessage = errorMessage || "You don't have access to this organization. Please check your workspace settings.";
          } else if (status === 404) {
            errorMessage = errorMessage || "Edge function not found. Please contact support.";
          } else if (status === 429) {
            errorMessage = errorMessage || "Rate limit exceeded. Please wait a moment and try again.";
          } else if (status === 402) {
            errorMessage = errorMessage || "AI credits depleted. Please add credits to your workspace in Settings.";
          } else if (status === 500) {
            // For 500 errors, preserve the detailed error message if we got one
            if (!errorMessage || errorMessage.includes('non-2xx')) {
              errorMessage = "Server error occurred. Please try again or contact support.";
            }
          }
        }

        // Check for network errors
        if (error.message?.includes('fetch') || error.message?.includes('network') || error.message?.includes('Failed to fetch')) {
          errorMessage = "Network error. Please check your connection and try again.";
        }

        // Check for CORS errors
        if (error.message?.includes('CORS') || error.message?.includes('cors')) {
          errorMessage = "CORS error. Please contact support.";
        }

        logger.error("Edge function error details:", {
          message: error.message,
          context: error.context,
          status: error.context?.status,
          bodyType: error.context?.body?.constructor?.name,
          errorMessage
        });

        throw new Error(errorMessage);
      }

      const generatedContent = stripMarkdown(data?.generatedContent || "");

      // Save to database (authUser already verified above)
      if (!authUser) throw new Error("Not authenticated");

      // Backup to localStorage immediately
      localStorage.setItem('draft-content-backup', JSON.stringify({
        title: contentName,
        content: generatedContent,
        format,
        timestamp: Date.now()
      }));

      // Remove generating loader
      loaderRoot.unmount();
      const generatingLoader = document.getElementById('generating-loader');
      if (generatingLoader) {
        generatingLoader.remove();
      }

      // Show transition loader
      setShowTransitionLoader(true);

      // Save to database (wait for it to complete)
      const { data: savedContent, error: saveError } = await supabase
        .from('master_content')
        .insert({
          title: contentName,
          full_content: generatedContent,
          content_type: format,
          created_by: authUser.id,
          organization_id: currentOrganizationId,
          status: 'draft'
        })
        .select()
        .single();

      if (saveError) {
        logger.error('Save failed:', saveError);
        madison.success(
          "Content saved locally",
          "We'll retry saving to your library shortly."
        );
      } else {
        // Success - clear local backup
        localStorage.removeItem('draft-content-backup');
      }

      // Navigate immediately with the content ID
      setTimeout(() => {
        navigate("/editor", {
          state: {
            contentId: savedContent?.id || null,
            content: generatedContent,
            contentType: format,
            productName: product,
            contentName: contentName
          }
        });
      }, 100);

    } catch (error: any) {
      logger.error("Error generating content:", error);

      // Extract error message with better handling
      let errorMessage = "Please try again";
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error?.message) {
        errorMessage = error.message;
      }

      // Show error toast with detailed message
      madison.error(
        "Generation failed",
        errorMessage
      );

      // Remove loading overlay
      loaderRoot.unmount();
      const loader = document.getElementById('generating-loader');
      if (loader) loader.remove();
      setIsGenerating(false);
    }
  };

  const handleCancel = () => {
    // Clear form or navigate back
    navigate("/dashboard");
  };

  const handleLoadPrompt = async (prompt: any) => {
    // Check if this is an auto-saved prompt (has rich metadata) or a legacy template
    const isAutoSaved = prompt.is_auto_saved === true;

    if (isAutoSaved) {
      // NEW: Auto-saved prompts have rich metadata
      if (prompt.product_id) {
        setProduct(prompt.product_id);
      }
      if (prompt.deliverable_format) {
        setFormat(prompt.deliverable_format);
      }
      if (prompt.audience) {
        setAudience(prompt.audience);
      }
      if (prompt.goal) {
        setGoal(prompt.goal);
      }
      if (prompt.style_overlay) {
        setStyle(prompt.style_overlay);
      }
      if (prompt.custom_instructions) {
        setAdditionalContext(prompt.custom_instructions);
      }
    } else {
      // LEGACY: Old templates only have content_type and prompt_text
      // Try to parse the additional_context JSONB for backward compatibility
      if (prompt.additional_context?.full_brief) {
        const brief = prompt.additional_context.full_brief;
        if (brief.product_id) setProduct(brief.product_id);
        if (brief.deliverable_format) setFormat(brief.deliverable_format);
        if (brief.target_audience) setAudience(brief.target_audience);
        if (brief.content_goal) setGoal(brief.content_goal);
        if (brief.style_overlay) setStyle(brief.style_overlay);
        if (brief.additional_context) setAdditionalContext(brief.additional_context);
      } else {
        // Very old template with no metadata - just set the format from content_type
        // Map legacy content_type to new deliverable value keys
        const contentTypeValueMap: Record<string, string> = {
          email: 'email_campaign',
          social: 'social_media_post',
          blog: 'blog_article',
          product: 'product_description'
        };

        if (prompt.content_type && contentTypeValueMap[prompt.content_type]) {
          setFormat(contentTypeValueMap[prompt.content_type]);
        }

        // Always populate the editorial direction with the template text for legacy items
        if (prompt.prompt_text) {
          setAdditionalContext(prompt.prompt_text);
        }

        // Show a gentle notice
        madison.info(
          'Legacy Template loaded',
          'We mapped the format and inserted the template text into Advanced Options.'
        );
      }
    }

    // Update use count
    await supabase
      .from('prompts')
      .update({
        times_used: (prompt.times_used || 0) + 1,
        last_used_at: new Date().toISOString()
      })
      .eq('id', prompt.id);

    madison.success(
      "✓ Prompt Loaded",
      `Loaded: ${prompt.user_custom_name || prompt.auto_generated_name || prompt.title}`
    );

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleWorksheetUploaded = async (uploadId: string) => {
    try {
      // Fetch extracted data
      const { data, error } = await supabase
        .from('worksheet_uploads')
        .select('extracted_data, confidence_scores')
        .eq('id', uploadId)
        .single();

      if (error || !data) {
        madison.error(
          "Error loading worksheet data",
          "Please try uploading again"
        );
        return;
      }

      const extractedData = data.extracted_data as any;

      // Auto-fill form fields
      if (extractedData.product) setProduct(extractedData.product);
      if (extractedData.format) setFormat(extractedData.format);
      if (extractedData.audience) setAudience(extractedData.audience);
      if (extractedData.goal) setGoal(extractedData.goal);
      if (extractedData.style) setStyle(extractedData.style);
      if (extractedData.additionalContext) setAdditionalContext(extractedData.additionalContext);

      setUploadDialogOpen(false);

      madison.success(
        "Worksheet loaded!",
        "Review and adjust fields as needed, then create your content"
      );

    } catch (error) {
      logger.error('Worksheet load error:', error);
      madison.error(
        "Error loading worksheet",
        error instanceof Error ? error.message : "Please try again"
      );
    }
  };



  return (
    <div className="min-h-screen pb-20 md:pb-20 bg-vellum-cream overflow-x-hidden">
      <div className={`max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-10 transition-opacity duration-300 ${isGenerating ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        {/* Main Form */}
        <div>
          {/* Header */}
          <div className="mb-6 md:mb-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-3 md:gap-4">
                <img
                  src={penNibIcon}
                  alt="Pen nib icon"
                  className="w-10 h-10 md:w-16 md:h-16 object-contain flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 md:gap-3 flex-wrap">
                    <h1 className="text-2xl md:text-3xl lg:text-4xl font-serif font-medium text-ink-black">
                      Create Content
                    </h1>
                    <VideoHelpTrigger videoId="creating-first-content" variant="icon" />
                  </div>
                  <p className="text-sm md:text-base lg:text-lg mt-1 text-warm-gray">
                    Quick brief to generate your content
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Librarian Trigger */}
                {/* Madison Consult Trigger */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-9 h-9 text-brand-brass hover:bg-brand-brass/10 border border-brand-brass/20 rounded-md mr-1"
                  onClick={() => triggerSuggestion({
                    type: 'idle_prompt', // Using idle_prompt type for manual consultation
                    message: "How might I assist you?",
                    secondaryMessage: "I can recommend a framework or review your current brief."
                  })}
                  title="Consult Madison"
                >
                  <span className="font-serif font-bold text-lg">M</span>
                </Button>

                <LibrarianTrigger
                  variant="icon"
                  context="forge"
                  category="copy"
                  open={showLibrarian}
                  onOpenChange={setShowLibrarian}
                  onFrameworkSelect={(framework) => {
                    // Auto-fill the additional context with the framework
                    setAdditionalContext(framework.framework_content);
                    setAdvancedOptionsOpen(true);
                    madison.frameworkAcquired();
                  }}
                />

                <div className="flex items-center gap-2 bg-white/50 px-3 py-2 rounded-lg border border-warm-gray/10">
                  <Label htmlFor="think-mode-toggle" className="text-xs md:text-sm text-warm-gray font-medium cursor-pointer select-none whitespace-nowrap">Brainstorming Helper</Label>
                  <Switch
                    id="think-mode-toggle"
                    checked={showThinkMode}
                    onCheckedChange={toggleThinkMode}
                    className="data-[state=checked]:bg-brass flex-shrink-0"
                  />
                </div>
              </div>
            </div>

            <p className="text-sm md:text-base text-warm-gray">
              Fill out the brief below and Madison will craft the perfect content.
            </p>
          </div>

          {/* Think Mode - Inline Expandable */}
          {showThinkMode && (
            !thinkModeExpanded ? (
              <div
                onClick={() => setThinkModeExpanded(true)}
                className="mb-8 rounded-xl cursor-pointer transition-all hover:opacity-90 bg-parchment-white border-2 border-dashed border-brass"
              >
                <div className="p-6 flex items-center gap-4">
                  <Lightbulb className="w-6 h-6 text-brass" />
                  <div>
                    <h3 className="font-semibold text-lg text-ink-black">
                      Not sure where to start? Ask Madison
                    </h3>
                    <p className="text-sm text-warm-gray">
                      Brainstorm with your Editorial Director before filling out the brief. No pressure, just ideas.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <ThinkMode
                userName={userName}
                onClose={() => setThinkModeExpanded(false)}
                onReadyToFill={() => {
                  setThinkModeExpanded(false);
                  madison.info(
                    "Fill out the brief below",
                    "Use the form to finalize your content request"
                  );
                }}
              />
            )
          )}

          {/* Form Container */}
          <div className="p-4 md:p-6 lg:p-8 rounded-xl border border-warm-gray/20 space-y-6 md:space-y-8 bg-parchment-white">
            {/* Brand Knowledge Status Indicator */}
            <BrandKnowledgeIndicator organizationId={currentOrganizationId} />

            {/* Product - Optional */}
            <div>
              <Label htmlFor="product" className="text-base mb-2 text-ink-black">
                Product <span className="text-warm-gray text-sm font-normal">(Optional)</span>
              </Label>
              <Select
                value={product}
                onValueChange={(value) => {
                  setProduct(value);
                  const selectedProduct = products.find(p => p.id === value);
                  setProductData(selectedProduct || null);
                }}
                disabled={productsLoading || products.length === 0}
              >
                <SelectTrigger
                  id="product"
                  className="mt-2 bg-parchment-white border-warm-gray/20"
                >
                  <SelectValue placeholder={
                    productsLoading ? "Loading products..." :
                      products.length === 0 ? "No products available" :
                        "Select a product (or leave blank for brand-level copy)"
                  } />
                </SelectTrigger>
                <SelectContent className="max-h-[300px] overflow-y-auto bg-white">
                  <SelectItem value="none">
                    <div className="flex items-center gap-2">
                      <span className="text-warm-gray">No specific product (brand-level content)</span>
                    </div>
                  </SelectItem>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {products.length === 0 && !productsLoading && (
                <p className="text-xs text-brass mt-2">
                  No products found. Add products in Settings → Products.
                </p>
              )}
            </div>

            {/* Deliverable Format - Required */}
            <FormatPicker
              value={format}
              onSelect={setFormat}
              open={formatPickerOpen}
              onOpenChange={setFormatPickerOpen}
            />

            {/* Target Audience - Optional */}
            <div>
              <Label htmlFor="audience" className="text-base mb-2 text-ink-black">
                Audience <span className="text-warm-gray text-sm font-normal">(Optional)</span>
              </Label>
              <Select value={audience} onValueChange={setAudience}>
                <SelectTrigger
                  id="audience"
                  className="mt-2 bg-parchment-white border-warm-gray/20"
                >
                  <SelectValue placeholder="Select target audience (or leave blank)" />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectItem value="none">
                    <span className="text-warm-gray">No specific audience</span>
                  </SelectItem>
                  <SelectItem value="luxury_beauty_enthusiasts">Luxury Beauty Enthusiasts</SelectItem>
                  <SelectItem value="gift_shoppers">Gift Shoppers</SelectItem>
                  <SelectItem value="new_customers">New Customers</SelectItem>
                  <SelectItem value="loyal_customers">Loyal Customers / VIP</SelectItem>
                  <SelectItem value="fragrance_collectors">Fragrance Collectors</SelectItem>
                  <SelectItem value="wellness_seekers">Wellness & Self-Care Seekers</SelectItem>
                  <SelectItem value="eco_conscious">Eco-Conscious Consumers</SelectItem>
                  <SelectItem value="young_professionals">Young Professionals (25-35)</SelectItem>
                  <SelectItem value="mature_luxury">Mature Luxury Buyers (45+)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs italic mt-2 text-warm-gray/70">
                Who is this content for? Helps Madison tailor message and tone
              </p>
            </div>

            {/* Content Goal - Optional */}
            <div>
              <Label htmlFor="goal" className="text-base mb-2 text-ink-black">
                Goal <span className="text-warm-gray text-sm font-normal">(Optional)</span>
              </Label>
              <Select value={goal} onValueChange={setGoal}>
                <SelectTrigger
                  id="goal"
                  className="mt-2 bg-parchment-white border-warm-gray/20"
                >
                  <SelectValue placeholder="Select content goal (or leave blank)" />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectItem value="none">
                    <span className="text-warm-gray">No specific goal</span>
                  </SelectItem>
                  <SelectItem value="drive_awareness">Drive Product Awareness</SelectItem>
                  <SelectItem value="build_loyalty">Build Brand Loyalty</SelectItem>
                  <SelectItem value="launch_collection">Launch New Collection</SelectItem>
                  <SelectItem value="increase_conversions">Increase Conversions / Sales</SelectItem>
                  <SelectItem value="educate_customers">Educate Customers</SelectItem>
                  <SelectItem value="seasonal_campaign">Seasonal Campaign / Promotion</SelectItem>
                  <SelectItem value="reengagement">Re-engage Inactive Customers</SelectItem>
                  <SelectItem value="build_community">Build Community / Social Engagement</SelectItem>
                  <SelectItem value="thought_leadership">Establish Thought Leadership</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs italic mt-2 text-warm-gray/70">
                What should this content achieve? Guides Madison on CTA and focus
              </p>
            </div>

            {/* Advanced Options Collapsible */}
            <AdvancedOptions
              open={advancedOptionsOpen}
              onOpenChange={setAdvancedOptionsOpen}
              style={style}
              onStyleChange={setStyle}
              additionalContext={additionalContext}
              onAdditionalContextChange={setAdditionalContext}
              brandName={brandName}
            />
          </div>

          {/* Actions */}
          <div className="mt-8 pt-6 border-t border-warm-gray/20">
            {/* Mobile Layout (< 768px) */}
            <div className="flex flex-col gap-3 md:hidden">
              <Button
                onClick={handleSubmit}
                disabled={!format}
                variant="brass"
                className="w-full gap-2 min-h-[44px]"
              >
                <PenTool className="w-5 h-5" />
                <span>Generate</span>
              </Button>

              <Button
                variant="ghost"
                onClick={handleCancel}
                className="w-full min-h-[44px] text-warm-gray hover:text-charcoal"
              >
                Cancel
              </Button>

              {showThinkMode && (
                <button
                  onClick={() => setThinkModeExpanded(true)}
                  className="w-full text-sm text-brass hover:underline mt-2"
                >
                  Not sure what to write? Try Think Mode
                </button>
              )}

              <p className="text-xs text-center mt-2 text-warm-gray/70">
                {!format ? (
                  <span className="text-brass">Select a format to continue</span>
                ) : (
                  "Madison will generate complete content based on your brief"
                )}
              </p>
            </div>

            {/* Desktop Layout (≥ 768px) */}
            <div className="hidden md:flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  onClick={handleCancel}
                  className="text-warm-gray hover:text-charcoal"
                >
                  Cancel
                </Button>
              </div>

              <div className="text-right">
                <Button
                  onClick={handleSubmit}
                  disabled={!format}
                  variant="brass"
                  className="gap-2 px-8"
                  size="lg"
                >
                  <PenTool className="w-5 h-5" />
                  <span className="text-base">Generate</span>
                </Button>
                {showThinkMode && (
                  <button
                    onClick={() => setThinkModeExpanded(true)}
                    className="block text-sm text-brass hover:underline mt-2 ml-auto"
                  >
                    Not sure what to write? Try Think Mode
                  </button>
                )}
                <p className="text-xs mt-2 text-warm-gray/70">
                  {!format ? (
                    <span className="text-brass">Select a format to continue</span>
                  ) : (
                    "Madison will generate complete content based on your brief"
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dialogs and Loaders */}
      {showTransitionLoader && <TransitionLoader onComplete={() => setShowTransitionLoader(false)} />}


      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Upload Content Brief Worksheet</DialogTitle>
            <DialogDescription>
              Upload your completed worksheet to auto-fill this form
            </DialogDescription>
          </DialogHeader>

          {currentOrganizationId && (
            <WorksheetUpload
              onUploadComplete={handleWorksheetUploaded}
              organizationId={currentOrganizationId}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Madison Agent Suggestions */}
      {currentSuggestion && (
        <AgentSuggestion
          type={currentSuggestion.type}
          message={currentSuggestion.message}
          secondaryMessage={currentSuggestion.secondaryMessage}
          onAccept={() => {
            acceptSuggestion();
            // Open the Librarian if this is an idle or framework suggestion
            if (currentSuggestion.type === 'idle_prompt' || currentSuggestion.type === 'framework_recommend') {
              setShowLibrarian(true);
            }
          }}
          onDismiss={dismissSuggestion}
          acceptLabel="Yes, please"
          dismissLabel="Not now"
        />
      )}
    </div>
  );
}
