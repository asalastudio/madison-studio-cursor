import { useState, useRef, useEffect } from "react";
import { Send, X, FileText, Loader2, Copy, Check, Trash2, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useOnboarding } from "@/hooks/useOnboarding";
import { useCurrentOrganizationId } from "@/hooks/useIndustryConfig";
import { useUserProfile } from "@/hooks/useUserProfile";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import { ImageLibraryModal } from "@/components/image-editor/ImageLibraryModal";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface SessionContext {
  sessionId: string;
  sessionName: string;
  imagesGenerated: number;
  maxImages: number;
  heroImage?: {
    imageUrl: string;
    prompt: string;
  };
  allPrompts: string[];
  aspectRatio: string;
  outputFormat: string;
  isImageStudio: boolean;
  visualStandards?: any;
  brandName?: string; // Added for brand-specific guidelines
  organizationId?: string;
}

interface DraftRequest {
  nonce: number;
  text?: string;
  images?: string[];
  autoSubmit?: boolean;
}

interface EditorialAssistantPanelProps {
  onClose: () => void;
  initialContent?: string;
  sessionContext?: SessionContext;
  darkMode?: boolean;
  topContent?: React.ReactNode;
  draftRequest?: DraftRequest | null;
  onUseMessage?: (content: string) => void;
  useMessageLabel?: string;
  onSaveMessage?: (content: string) => void;
  saveMessageLabel?: string;
}

const PROMPT_REQUEST_PATTERN =
  /\b(create|write|generate|make|build|craft|compose|give me|send me|draft)\b[\s\S]{0,40}\b(prompt|image prompt|shot prompt|prompts)\b|\b(final prompt|actual prompt|production-ready prompt|prompt please)\b/i;
const PROMPT_CONFIRMATION_PATTERN =
  /^(ok|okay|go|yes|yep|yeah|sure|do it|do that|go ahead|let'?s go|proceed|make it|write it|generate it|send it|hit me)\b/i;

function messageExplicitlyRequestsPrompt(text: string) {
  return PROMPT_REQUEST_PATTERN.test(text.trim());
}

function messageConfirmsPromptCreation(text: string) {
  return PROMPT_CONFIRMATION_PATTERN.test(text.trim());
}

function recentContextMentionsPrompt(messages: Message[]) {
  return messages
    .slice(-4)
    .some((message) => /(?:final|actual|better|image|production-ready|hero|improved)?\s*prompt|create a prompt|write a prompt|generate a prompt|build a prompt/i.test(message.content));
}

function shouldForcePromptOutput(currentInput: string, messages: Message[]) {
  if (messageExplicitlyRequestsPrompt(currentInput)) return true;
  return messageConfirmsPromptCreation(currentInput) && recentContextMentionsPrompt(messages);
}

function responseContainsPromptBlock(content: string) {
  return /```(?:prompt|text|md|markdown)?\n[\s\S]+?```/i.test(content) ||
    /(?:final prompt|recommended prompt|production-ready prompt)\s*:/i.test(content);
}

function truncateForModel(value: string | undefined | null, maxChars: number) {
  if (!value) return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars).trim()}...`;
}

function parseEdgeFunctionErrorBody(rawBody: unknown) {
  if (!rawBody) return null;

  if (typeof rawBody === "string") {
    try {
      return JSON.parse(rawBody);
    } catch {
      return { error: rawBody };
    }
  }

  return rawBody;
}

async function imageUrlToDataUrl(url: string) {
  if (url.startsWith("data:")) return url;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to read image (${response.status})`);
  }

  const blob = await response.blob();

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Unable to convert image"));
    };
    reader.onerror = () => reject(new Error("Unable to convert image"));
    reader.readAsDataURL(blob);
  });
}

function estimateDataUrlBytes(value: string) {
  const matches = value.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) return 0;
  return Math.floor((matches[2].length * 3) / 4);
}

export function EditorialAssistantPanel({ 
  onClose, 
  initialContent, 
  sessionContext,
  darkMode = false,
  topContent,
  draftRequest,
  onUseMessage,
  useMessageLabel = "Use in Prompt",
  onSaveMessage,
  saveMessageLabel = "Save Prompt",
}: EditorialAssistantPanelProps) {
  const { toast } = useToast();
  const { currentOrganizationId } = useOnboarding();
  const { orgId: resolvedOrganizationId } = useCurrentOrganizationId();
  const { userName } = useUserProfile();
  const effectiveOrganizationId = sessionContext?.organizationId || currentOrganizationId || resolvedOrganizationId || null;
  
  // Context-specific storage key
  const STORAGE_KEY = sessionContext?.isImageStudio && sessionContext.sessionId
    ? `madison-chat-image-${sessionContext.sessionId}`
    : 'madison-chat-content-editor';
  
  const isContentEditor = !sessionContext?.isImageStudio;
  
  const [messages, setMessages] = useState<Message[]>(() => {
    // Clear chat for Content Editor on each open (fresh context)
    if (isContentEditor) {
      return [];
    }
    
    // Persist chat for Image Studio sessions
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return [];
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((m: any) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content ?? ""),
        timestamp: m.timestamp ? new Date(m.timestamp) : new Date()
      })) as Message[];
    } catch {
      return [];
    }
  });
  
  const [input, setInput] = useState(initialContent || "");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [shouldAutoSubmit, setShouldAutoSubmit] = useState(false);
  const [imageLibraryOpen, setImageLibraryOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Persist messages to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    if (userName && messages.length === 0) {
      // Different greeting for Image Studio vs other contexts
      if (sessionContext?.isImageStudio) {
        setMessages([{
          role: "assistant",
          content: `Welcome to the Madison Image Studio, ${userName}! Let's create something beautiful together. What should we name this session, or would you like to dive straight into generating your first image?`,
          timestamp: new Date(),
        }]);
      } else {
        setMessages([{
          role: "assistant",
          content: `Hi ${userName}! I'm here to help you refine your content. What would you like to improve?`,
          timestamp: new Date(),
        }]);
      }
    }
  }, [userName, sessionContext]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  useEffect(() => {
    if (typeof draftRequest?.text === "string") {
      setInput(draftRequest.text);
      textareaRef.current?.focus();
    }
    if (Array.isArray(draftRequest?.images)) {
      setUploadedImages(draftRequest.images);
    }
    if (draftRequest?.autoSubmit) {
      setShouldAutoSubmit(true);
    }
  }, [draftRequest]);

  // Ensure body scroll is never locked
  useEffect(() => {
    document.body.style.overflow = 'auto';
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, []);

  // Auto-submit initialContent for Content Editor context
  useEffect(() => {
    if (isContentEditor && initialContent && messages.length === 1 && !isGenerating && !shouldAutoSubmit) {
      // Wait 500ms for greeting to render, then trigger auto-submit
      const timer = setTimeout(() => {
        setShouldAutoSubmit(true);
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [isContentEditor, initialContent, messages.length, isGenerating, shouldAutoSubmit]);

  // Handle auto-submit trigger
  useEffect(() => {
    if (shouldAutoSubmit && input && !isGenerating) {
      setShouldAutoSubmit(false);
      handleSend();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldAutoSubmit, input, isGenerating]);

  const handleLibraryImageSelect = async (image: { url: string; name?: string }) => {
    try {
      const dataUrl = await imageUrlToDataUrl(image.url);
      const sizeBytes = estimateDataUrlBytes(dataUrl);

      if (sizeBytes > 5 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Images must be under 5MB (Claude's limit)",
          variant: "destructive",
        });
        return;
      }

      setUploadedImages((prev) => [...prev, dataUrl]);
      setImageLibraryOpen(false);
      toast({
        title: "Image added",
        description: image.name || "Library image added to Madison",
      });
    } catch (error) {
      console.error("Failed to add library image:", error);
      toast({
        title: "Image unavailable",
        description: "Unable to load that library image right now.",
        variant: "destructive",
      });
    }
  };

  const handleSend = async () => {
    if ((!input.trim() && uploadedImages.length === 0) || isGenerating) {
      return;
    }

    const currentInput = input.trim();
    const userMessage: Message = {
      role: "user",
      content: currentInput || "Please analyze these images",
      timestamp: new Date(),
    };
    const forcePromptOutput = sessionContext?.isImageStudio
      ? shouldForcePromptOutput(userMessage.content, messages)
      : false;

    setMessages((prev) => [...prev, userMessage]);
    const imagesToSend = [...uploadedImages];
    setInput("");
    setUploadedImages([]);
    setIsGenerating(true);

    try {
      // Fetch brand-specific visual standards if in Image Studio
      let visualStandards = sessionContext?.visualStandards;
      let loadedBrandName = '';
      
      if (sessionContext?.isImageStudio && !visualStandards && effectiveOrganizationId) {
        // Fetch all visual standards for the organization
        const { data: brandKnowledge } = await supabase
          .from('brand_knowledge')
          .select('content')
          .eq('organization_id', effectiveOrganizationId)
          .in('knowledge_type', ['visual_standards', 'image_guidelines'])
          .eq('is_active', true);
        
        // If brandName is provided, try to find brand-specific guidelines in content
        if (sessionContext.brandName && brandKnowledge && brandKnowledge.length > 0) {
          const brandName = sessionContext.brandName.toLowerCase();
          const matchingBrand = brandKnowledge.find(k => {
            const content = k.content as any;
            const contentBrandName = content?.brand_name?.toLowerCase();
            const aliases = content?.brand_aliases || [];
            return contentBrandName === brandName || 
                   aliases.some((alias: string) => alias.toLowerCase() === brandName);
          });
          
          if (matchingBrand) {
            visualStandards = matchingBrand.content;
            loadedBrandName = (matchingBrand.content as any).brand_name || sessionContext.brandName;
          }
        }
        
        // Fallback to first visual standards if no brand match
        if (!visualStandards && brandKnowledge && brandKnowledge.length > 0) {
          visualStandards = brandKnowledge[0].content;
          loadedBrandName = 'Organization defaults';
        }
        
        // Final fallback to brand_config
        if (!visualStandards) {
          const { data: brandConfig } = await supabase
            .from('organizations')
            .select('brand_config')
            .eq('id', effectiveOrganizationId)
            .single();
          
          if (brandConfig?.brand_config) {
            const config = brandConfig.brand_config as any;
            visualStandards = {
              color_palette: config.colors || [],
              style_keywords: config.styleKeywords || []
            };
            loadedBrandName = 'Brand config colors/keywords';
          }
        }
      }

      // Build studio context if in Image Studio
      const recentPrompts = sessionContext?.allPrompts
        ?.slice(-5)
        .map((p, i) => `  ${i + 1}. "${truncateForModel(p, 220)}"`)
        .join("\n");

      const condensedVisualStandards = visualStandards ? `
BRAND VISUAL STANDARDS${loadedBrandName ? ` (${loadedBrandName})` : ""}
- Golden rule: ${truncateForModel(visualStandards.golden_rule, 260) || "Not provided"}
- Color palette: ${
  visualStandards.color_palette?.slice(0, 6).map((c: any) =>
    `${c.name}${c.hex ? ` ${c.hex}` : ""}${c.usage ? ` (${truncateForModel(c.usage, 40)})` : ""}`
  ).join("; ") || "Not provided"
}
- Lighting mandates: ${truncateForModel(visualStandards.lighting_mandates, 260) || "Not provided"}
- Forbidden elements: ${visualStandards.forbidden_elements?.slice(0, 8).join(", ") || "None listed"}
- Approved props: ${visualStandards.approved_props?.slice(0, 8).join(", ") || "None listed"}
- Prompt templates: ${
  visualStandards.templates?.slice(0, 3).map((t: any) =>
    `${t.name}${t.aspectRatio ? ` (${t.aspectRatio})` : ""}: ${truncateForModel(t.prompt, 120)}`
  ).join(" | ") || "None provided"
}
- Notes: ${truncateForModel(visualStandards.raw_document, 1200) || "No additional notes"}
` : "";

      const studioContext = sessionContext?.isImageStudio ? `
━━━ MADISON IMAGE STUDIO CONTEXT ━━━
You are Madison, the AI Creative Director assisting in the Image Studio for AI-powered product photography.

Session: "${sessionContext.sessionName || 'New Session'}"
Progress: ${sessionContext.imagesGenerated}/${sessionContext.maxImages} images generated
Export Settings: ${sessionContext.aspectRatio} • ${sessionContext.outputFormat}

${sessionContext.heroImage ? 
  `Current Hero Image: "${truncateForModel(sessionContext.heroImage.prompt, 220)}"` :
  'No hero image selected yet'}

${recentPrompts ? `
Previous Prompts in This Session:
${recentPrompts}
` : ''}

${condensedVisualStandards ? `
${condensedVisualStandards}

CRITICAL MADISON INSTRUCTIONS:
- Reference templates by name when suggesting prompts (e.g., "Use the Hero Product Shot template")
- Always include color codes from the palette (e.g., "Stone Beige #D8C8A9")
- Warn users if they request forbidden elements (e.g., "⚠️ Chrome is forbidden - use aged brass instead")
- Inject lighting mandates into every prompt suggestion
- Follow the golden rule religiously
- Keep responses concise (3-4 sentences max)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : ''}

IMPORTANT INSTRUCTIONS:
- Provide creative direction for AI image generation
- Suggest prompt refinements for better compositions
- Give lighting, angle, and styling advice tailored to their brand
- Analyze brand alignment when asked
- DO NOT suggest hiring photographers - the user is using AI generation
- Reference specific images by number when discussing previous generations
- Keep responses conversational and editorial (3-4 sentences max)
- Act like a creative director guiding a photo shoot

Be conversational, encouraging, and editorial in your tone.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : '';

      // Build conversation context for Claude
      const conversationContext = messages
        .map((msg) => `${msg.role === "user" ? "User" : "Madison"}: ${msg.content}`)
        .join("\n\n");

      const prompt = `${studioContext}\n\n${conversationContext}\n\nUser: ${userMessage.content}\n\nMadison:`;

      const invokeConsult = async (consultPrompt: string, consultImages: string[] = []) => {
        return supabase.functions.invoke("generate-with-claude", {
          body: {
            prompt: consultPrompt,
            organizationId: effectiveOrganizationId || undefined,
            mode: "consult",
            consultDomain: sessionContext?.isImageStudio ? "image_studio" : "editorial",
            userName: userName || undefined,
            images: consultImages.length > 0 ? consultImages : undefined,
            forcePromptOutput,
            imageStudioContext: sessionContext?.isImageStudio
              ? {
                  sessionId: sessionContext.sessionId,
                  sessionName: sessionContext.sessionName,
                  imagesGenerated: sessionContext.imagesGenerated,
                  maxImages: sessionContext.maxImages,
                  aspectRatio: sessionContext.aspectRatio,
                  outputFormat: sessionContext.outputFormat,
                  hasHeroImage: Boolean(sessionContext.heroImage),
                  recentPromptCount: sessionContext.allPrompts?.length || 0,
                  referenceImageCount: consultImages.length,
                  brandName: sessionContext.brandName,
                  proModeActive: false,
                }
              : undefined,
          },
        });
      };

      let { data, error } = await invokeConsult(prompt, imagesToSend);

      if (
        error &&
        imagesToSend.length > 1 &&
        ((error as any).context?.status === 500 || String(error.message || "").includes("500"))
      ) {
        const fallbackPrompt = `${truncateForModel(studioContext, 4000)}\n\nUser: ${userMessage.content}\n\nMadison: Focus on the single most representative attached image and keep the response concise.`;
        ({ data, error } = await invokeConsult(fallbackPrompt, [imagesToSend[0]]));
      }

      if (error) {
        // Parse specific backend errors
        let errorMessage = 'Unable to reach the Editorial Director. Please try again.';
        
        // Try to parse structured error from edge function
        if (typeof error.context?.json === "function") {
          try {
            const parsed = await error.context.json();
            if (parsed?.error) {
              errorMessage = parsed.error;
            }
          } catch (e) {
            console.error("Error parsing backend error:", e);
          }
        } else if (error.context?.body) {
          try {
            const parsed = parseEdgeFunctionErrorBody(error.context.body);
            if (parsed.error) {
              errorMessage = parsed.error;
            }
          } catch (e) {
            console.error('Error parsing backend error:', e);
          }
        }
        
        // Handle HTTP status codes
        if (error.message?.includes('402') || error.context?.status === 402) {
          errorMessage = 'Payment required. Please add AI credits to your workspace in Settings.';
        } else if (error.message?.includes('429') || error.context?.status === 429) {
          errorMessage = 'Rate limit exceeded. Please try again in a moment.';
        } else if (error.message?.includes('413') || error.context?.status === 413) {
          errorMessage = 'Image too large. Claude requires images under 5MB. Please compress or resize.';
        }
        
        throw new Error(errorMessage);
      }

      if (
        forcePromptOutput &&
        data?.generatedContent &&
        !responseContainsPromptBlock(data.generatedContent)
      ) {
        const strictPrompt = `${truncateForModel(studioContext, 4000)}\n\n${conversationContext}\n\nUser: ${userMessage.content}\n\nMadison: The user has explicitly asked for the actual prompt now. Return the prompt itself using exactly this structure:\nFinal Prompt:\n\`\`\`prompt\n<one production-ready image prompt>\n\`\`\`\n\nWhy It Works:\n- 2 to 4 concise bullets\n\nDo not describe the prompt. Do not say it is ready. Output the prompt itself.`;
        ({ data, error } = await invokeConsult(strictPrompt, imagesToSend));

        if (error) {
          throw new Error('Madison could not format the final prompt correctly. Please try again.');
        }
      }

      if (data?.generatedContent) {
        const assistantMessage: Message = {
          role: "assistant",
          content: data.generatedContent,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      }
    } catch (error: any) {
      console.error("Error generating response:", error);
      const message = error?.message || 'Unable to reach the Editorial Director. Please try again.';
      toast({
        title: "Communication error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopy = async (content: string, index: number) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedIndex(index);
      toast({
        title: "Copied to clipboard",
        description: "Critique copied successfully",
      });
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (error) {
      toast({
        title: "Copy failed",
        description: "Unable to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  return (
    <div 
      className="h-full flex flex-col max-w-full" 
      style={{ backgroundColor: darkMode ? "#18181B" : "#FFFCF5" }} // Keep hex for inline style or use class? Using hex for style prop compatibility with dark mode logic
    >
      {/* Header */}
      <div 
        className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0"
        style={{ borderColor: darkMode ? "#27272A" : "#E5E0D8" }}
      >
        <div className="flex items-center gap-3">
          <div 
            className="w-10 h-10 rounded-full flex items-center justify-center font-serif text-2xl font-bold bg-brand-brass text-brand-parchment"
          >
            M
          </div>
          <div>
            <h3 className="font-serif text-lg font-semibold" style={{ color: darkMode ? "#FAFAFA" : "var(--ink-black-hex)" }}>
              Madison
            </h3>
            <p className="text-xs" style={{ color: darkMode ? "#A1A1AA" : "#2F2A26" }}>Editorial Director</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setMessages([]);
              localStorage.removeItem(STORAGE_KEY);
              toast({
                title: "Conversation cleared",
                description: "Chat history has been reset",
              });
            }}
            className="text-xs px-2 py-1 rounded transition-colors"
            style={{ 
              color: darkMode ? "#A1A1AA" : "#6B6560",
              backgroundColor: darkMode ? "transparent" : "transparent"
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = darkMode ? "#27272A" : "#E5E0D8"}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
          >
            Clear
          </button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 min-h-0" ref={scrollRef}>
        {topContent && (
          <div className="mb-5">
            {topContent}
          </div>
        )}
        <div className="space-y-4">
          {messages.map((message, index) => (
            <div key={index} className="space-y-2">
              {/* Timestamp */}
              <div className="flex items-center gap-2">
                <div 
                  className="w-6 h-6 rounded-full flex items-center justify-center font-serif text-sm font-bold"
                  style={{ 
                    backgroundColor: message.role === "assistant" ? "var(--aged-brass-hex)" : "#D4CFC8",
                    color: message.role === "assistant" ? "var(--parchment-hex)" : "var(--ink-black-hex)"
                  }}
                >
                  {message.role === "assistant" ? "M" : "U"}
                </div>
                <span className="text-xs" style={{ color: "#6B6560" }}>
                  {message.timestamp.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true
                  })}
                </span>
              </div>
              
              {/* Message Content */}
              <div
                className="rounded-lg px-4 py-3 text-sm leading-relaxed prose prose-sm max-w-none"
                style={{
                  backgroundColor: message.role === "user" 
                    ? (darkMode ? "#27272A" : "#E8DCC8")
                    : (darkMode ? "#18181B" : "#F5EFE3"),
                  color: darkMode ? "#FAFAFA" : "var(--ink-black-hex)",
                  border: darkMode ? "1px solid #3F3F46" : "none"
                }}
              >
                {message.role === "assistant" ? (
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
                      strong: ({ children }) => <strong className="font-semibold" style={{ color: "var(--ink-black-hex)" }}>{children}</strong>,
                      em: ({ children }) => <em className="italic">{children}</em>,
                      ul: ({ children }) => <ul className="list-disc pl-4 mb-3 space-y-1">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal pl-4 mb-3 space-y-1">{children}</ol>,
                      li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                      h1: ({ children }) => <h1 className="text-lg font-serif font-bold mb-2 mt-4 first:mt-0">{children}</h1>,
                      h2: ({ children }) => <h2 className="text-base font-serif font-bold mb-2 mt-3 first:mt-0">{children}</h2>,
                      h3: ({ children }) => <h3 className="text-sm font-serif font-semibold mb-2 mt-3 first:mt-0">{children}</h3>,
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                ) : (
                  <p className="whitespace-pre-wrap select-text">{message.content}</p>
                )}
              </div>
              
              {/* Copy Critique Button for assistant messages */}
              {message.role === "assistant" && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopy(message.content, index)}
                    className="text-xs h-8 gap-1"
                    style={{ color: darkMode ? "#A1A1AA" : "#6B6560" }}
                  >
                    {copiedIndex === index ? (
                      <>
                        <Check className="w-3 h-3" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        Copy Critique
                      </>
                    )}
                  </Button>
                  {onUseMessage && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onUseMessage(message.content)}
                      className="text-xs h-8 gap-1"
                      style={{ color: darkMode ? "#D6B68A" : "var(--aged-brass-hex)" }}
                    >
                      <Send className="w-3 h-3" />
                      {useMessageLabel}
                    </Button>
                  )}
                  {onSaveMessage && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onSaveMessage(message.content)}
                      className="text-xs h-8 gap-1"
                      style={{ color: darkMode ? "#E5D1A8" : "#B8956A" }}
                    >
                      <FileText className="w-3 h-3" />
                      {saveMessageLabel}
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
          {isGenerating && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div 
                  className="w-6 h-6 rounded-full flex items-center justify-center bg-brand-brass"
                >
                  <Loader2 className="w-3 h-3 animate-spin text-brand-parchment" />
                </div>
                <span className="text-xs" style={{ color: darkMode ? "#A1A1AA" : "#6B6560" }}>Madison is thinking...</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div 
        className="border-t p-3 sm:p-4 flex-shrink-0"
        style={{ borderColor: darkMode ? "#27272A" : "#E5E0D8" }}
      >
        {/* Image Previews */}
        {uploadedImages.length > 0 && (
          <div className="flex gap-2 mb-2 flex-wrap">
            {uploadedImages.map((img, idx) => (
              <div key={idx} className="relative group">
                <img 
                  src={img} 
                  alt={`Upload ${idx + 1}`}
                  className="w-16 h-16 object-cover rounded border"
                  style={{ borderColor: darkMode ? "#3F3F46" : "#D4CFC8" }}
                />
                <button
                  onClick={() => setUploadedImages(prev => prev.filter((_, i) => i !== idx))}
                  className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-1.5 sm:gap-2 items-end w-full">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setImageLibraryOpen(true)}
            disabled={isGenerating}
            className="h-[52px] w-[52px] sm:h-[60px] sm:w-[60px] flex-shrink-0"
            style={{ color: darkMode ? "#D6B68A" : "#8B6A44" }}
            title="Add image from library"
          >
            <FolderOpen className="w-5 h-5" />
          </Button>
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask for feedback or suggestions..."
            className="min-h-[52px] sm:min-h-[60px] max-h-[160px] resize-none border flex-1"
            style={{
              backgroundColor: darkMode ? "#18181B" : "#FFFFFF",
              borderColor: darkMode ? "#3F3F46" : "#D4CFC8",
              color: darkMode ? "#FAFAFA" : "var(--ink-black-hex)"
            }}
            disabled={isGenerating}
          />
          <Button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              handleSend();
            }}
            onTouchStart={(e) => {
              e.currentTarget.click();
            }}
            disabled={(!input.trim() && uploadedImages.length === 0) || isGenerating}
            variant="brass"
            className="h-[52px] w-[52px] sm:h-[60px] sm:w-[60px] flex-shrink-0"
          >
            {isGenerating ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </Button>
        </div>
        <p className="text-xs mt-2 text-center px-1 break-words" style={{ color: darkMode ? "#71717A" : "#A8A39E" }}>
          Press Enter to send • Shift + Enter for new line
        </p>
      </div>

      <ImageLibraryModal
        open={imageLibraryOpen}
        onOpenChange={setImageLibraryOpen}
        title="Add Context Image"
        onSelectImage={handleLibraryImageSelect}
      />
    </div>
  );
}
