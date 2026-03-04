import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUserProfile } from "@/hooks/useUserProfile";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { TextureOverlay } from "@/components/ui/texture-overlay";
import { Send, Target, Zap, BarChart, Users, Flag, Info, ArrowRight, BrainCircuit, ArrowUp, Plus, Mic } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./thinkmode.css";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

export default function ThinkModePage() {
  const { toast } = useToast();
  const { userName } = useUserProfile();

  const [messages, setMessages] = useState<Message[]>([]);
  const [idea, setIdea] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const ACCESSIBILITY_INSTRUCTIONS = `
CRITICAL FORMATTING FOR ACCESSIBILITY:
1. Structure with clear, BOLD HEADINGS.
2. Use clear spacing and formatting (no emojis).
3. Keep paragraphs short and digestible (max 3 lines).
4. Use bullet points for all lists.
5. End with "Choose Your Next Step" and provide 2-3 distinct paths.
6. Format the options EXACTLY like this at the end:
<<ACTION: Action Label | The prompt for the user to send next>>

Example:
<<ACTION: Audit Assets | Help me audit my hidden assets>>
<<ACTION: Create Offer | Help me create a risk-reversed offer>>
`;

  const strategicOptions = [
    { 
      label: "Cash Injection", 
      icon: Zap,
      prompt: "Using principles of leverage and asset reactivation, outline a strategy for a quick cash injection. Focus on the Strategy of Preeminence and risk reversal.",
      framework: "Asset Reactivation Strategy",
      description: "Focuses on uncovering hidden assets, reactivating past clients, and risk-reversed offers."
    },
    { 
      label: "Product Launch", 
      icon: Target,
      prompt: "Map out a campaign sequence that builds anticipation and scarcity. Include the 'Sideways Sales Letter' structure.",
      framework: "Strategic Launch Sequence",
      description: "The 'Sideways Sales Letter' sequence: Pre-Pre-Launch → Pre-Launch Content → Open Cart."
    },
    { 
      label: "Growth Strategy", 
      icon: BarChart,
      prompt: "Applying classic management principles, help me diagnose growth bottlenecks and identify the 'right things' to focus on. Distinguish between efficiency and effectiveness.",
      framework: "Executive Effectiveness",
      description: "Distinguishing between efficiency and effectiveness to scale sustainable growth."
    },
    { 
      label: "Retention", 
      icon: Users,
      prompt: "Design a post-purchase experience that turns customers into advocates. Map out the emotional phases of the customer journey.",
      framework: "The First 100 Days Model",
      description: "Choreographing the customer journey to eliminate buyer's remorse and foster loyalty."
    },
    { 
      label: "Positioning", 
      icon: Flag,
      prompt: "Help me find my brand's 'only-ness' and radical differentiation. Identify where the market zigs so we can zag.",
      framework: "Radical Differentiation",
      description: "Finding the whitespace in the market. When everyone zigs, your brand should zag."
    },
    { 
      label: "Strategy", 
      icon: BrainCircuit,
      prompt: "I need to brainstorm a strategic issue. Guide me through a strategic analysis of my situation.",
      framework: "Open Strategic Analysis",
      description: "Free-form strategic brainstorming to diagnose issues and find solutions."
    }
  ];

  const handleSubmit = async (overrideContent?: string) => {
    const contentToSubmit = overrideContent || idea;
    if (!contentToSubmit.trim() || isLoading) return;

    const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const userMessage: Message = {
      role: "user",
      content: contentToSubmit.trim(),
      timestamp,
    };

    setMessages((prev) => [...prev, userMessage]);
    setIdea("");
    setIsLoading(true);

    const removePendingUserMessage = () => {
      setMessages((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        if (last.role === "user" && last.content === userMessage.content) {
          return prev.slice(0, -1);
        }
        return prev;
      });
    };

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (!supabaseUrl) {
        throw new Error("VITE_SUPABASE_URL is not configured");
      }
      
      const CHAT_URL = `${supabaseUrl}/functions/v1/think-mode-chat`;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      console.log('[ThinkMode] Calling chat endpoint:', CHAT_URL);

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

      if (!accessToken) {
        throw new Error("Please sign in to use Think Mode.");
      }

      console.log('[ThinkMode] Sending request with', messages.length, 'messages');
      const response = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          ...(anonKey && { apikey: anonKey }),
        },
        body: JSON.stringify({
          messages: [
            ...messages, 
            // Send user message with hidden instructions appended
            { 
              ...userMessage, 
              content: userMessage.content + "\n\n" + ACCESSIBILITY_INSTRUCTIONS 
            }
          ],
          userName: userName || undefined,
          mode: 'strategic'
        }),
      });

      // Check content type first to determine how to handle the response
      const contentType = response.headers.get('content-type') || '';
      const isStream = contentType.includes('text/event-stream') || contentType.includes('stream');
      
      console.log('[ThinkMode] Response status:', response.status);
      console.log('[ThinkMode] Response content-type:', contentType);
      console.log('[ThinkMode] Is stream:', isStream);
      
      if (!response.ok) {
        let errorMessage = "Failed to connect to Think Mode";
        try {
          // Clone the response to read the body without consuming it
          const errorData = await response.clone().text();
          if (errorData) {
            try {
              const parsed = JSON.parse(errorData);
              errorMessage = parsed.error || errorMessage;
            } catch {
              // If it's not JSON, use the text as error message
              errorMessage = errorData.substring(0, 200);
            }
          }
        } catch {
          errorMessage = response.statusText || errorMessage;
        }

        if (response.status === 429) {
          throw new Error("Rate limit exceeded. Please try again later.");
        }
        if (response.status === 402) {
          throw new Error("AI credits depleted. Please add credits to continue.");
        }
        if (response.status === 500) {
          // Check if it's an API key error
          if (errorMessage.includes('not configured') || errorMessage.includes('GEMINI_API_KEY')) {
            throw new Error("AI service is not configured. Please contact support.");
          }
        }
        throw new Error(errorMessage || `Failed to connect (Status: ${response.status})`);
      }

      // If response is OK but not a stream, it might be an error in JSON format
      if (!isStream) {
        try {
          const errorData = await response.text();
          console.warn('[ThinkMode] Non-stream response received:', errorData.substring(0, 200));
          const parsed = JSON.parse(errorData);
          
          // Check if this looks like a database query response (wrong endpoint)
          if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].organization_id) {
            throw new Error('Received database query response instead of chat response. The edge function may not be deployed or the URL is incorrect.');
          }
          
          if (parsed.error) {
            throw new Error(parsed.error);
          }
          
          // If we get here, it's an unexpected response format
          throw new Error(`Unexpected response format: ${JSON.stringify(parsed).substring(0, 100)}`);
        } catch (e) {
          // If parsing fails or no error field, this is unexpected
          if (e instanceof Error && e.message.includes('database query')) {
            throw e; // Re-throw our specific error
          }
          console.warn('Unexpected non-stream response. Content type:', contentType);
          throw new Error('Unexpected response format from server. The edge function may not be deployed correctly.');
        }
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";

      // Robust text extraction - tries multiple formats to handle any valid response structure
      const extractTextFromChunk = (chunk: any): string => {
        if (!chunk || typeof chunk !== 'object') return "";

        // Strategy 1: OpenAI SSE format (primary format from geminiClient conversion)
        const openAIText = chunk?.choices?.[0]?.delta?.content;
        if (openAIText && typeof openAIText === 'string' && openAIText.trim()) {
          return openAIText;
        }

        // Strategy 2: Direct OpenAI content (fallback)
        const openAIContent = chunk?.choices?.[0]?.message?.content;
        if (openAIContent && typeof openAIContent === 'string' && openAIContent.trim()) {
          return openAIContent;
        }

        // Strategy 3: Gemini native format (candidates)
        const candidate = chunk?.candidates?.[0];
        if (candidate?.content?.parts?.length) {
          const parts = candidate.content.parts
            .map((part: any) => {
              if (typeof part?.text === 'string') return part.text;
              if (typeof part === 'string') return part;
              return "";
            })
            .filter((text: string) => text.trim());
          if (parts.length > 0) return parts.join("");
        }

        // Strategy 4: Message content parts
        const messageParts = chunk?.message?.content?.parts;
        if (Array.isArray(messageParts) && messageParts.length > 0) {
          const parts = messageParts
            .map((part: any) => {
              if (typeof part?.text === 'string') return part.text;
              if (typeof part === 'string') return part;
              return "";
            })
            .filter((text: string) => text.trim());
          if (parts.length > 0) return parts.join("");
        }

        // Strategy 5: Direct text field
        if (typeof chunk?.text === 'string' && chunk.text.trim()) {
          return chunk.text;
        }

        // Strategy 6: Content field
        if (typeof chunk?.content === 'string' && chunk.content.trim()) {
          return chunk.content;
        }

        // Strategy 7: Deep search for any text field
        const deepSearch = (obj: any, depth = 0): string => {
          if (depth > 3) return ""; // Prevent infinite recursion
          if (typeof obj === 'string' && obj.trim()) return obj;
          if (typeof obj !== 'object' || obj === null) return "";
          
          for (const key in obj) {
            if (key === 'text' || key === 'content') {
              const value = obj[key];
              if (typeof value === 'string' && value.trim()) return value;
            }
            if (typeof obj[key] === 'object') {
              const found = deepSearch(obj[key], depth + 1);
              if (found) return found;
            }
          }
          return "";
        };

        const deepFound = deepSearch(chunk);
        if (deepFound) return deepFound;

        return "";
      };

      if (!reader) {
        throw new Error("No response body reader available");
      }

      const aiTimestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setMessages((prev) => [...prev, { role: "assistant", content: "", timestamp: aiTimestamp }]);

      let buffer = "";
      let hasReceivedContent = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.trim() === "" || line.startsWith(":")) continue;
          if (!line.startsWith("data:")) continue;

          const jsonStr = line.slice(5).trim();
          if (jsonStr === "[DONE]") break;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = extractTextFromChunk(parsed);
            if (content) {
              hasReceivedContent = true;
              assistantContent += content;
              setMessages((prev) => {
                const updated = [...prev];
                const lastIndex = updated.length - 1;
                if (lastIndex >= 0 && updated[lastIndex].role === "assistant") {
                  updated[lastIndex] = { ...updated[lastIndex], content: assistantContent };
                } else {
                  updated.push({ role: "assistant", content: assistantContent });
                }
                return updated;
              });
            } else {
              // Log when we receive a chunk but extract no text (for debugging)
              console.warn("Think Mode: Received chunk but extracted no text. Full chunk:", JSON.stringify(parsed, null, 2));
            }
          } catch (parseError) {
            console.warn("JSON parse error, buffering:", parseError, "Line:", jsonStr.substring(0, 100));
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }

      if (buffer.trim()) {
        const lines = buffer.split("\n");
        for (const raw of lines) {
          if (!raw || raw.startsWith(":")) continue;
          if (!raw.startsWith("data:")) continue;
          const jsonStr = raw.slice(5).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = extractTextFromChunk(parsed);
            if (content) {
              assistantContent += content;
              setMessages((prev) => {
                const updated = [...prev];
                const lastIndex = updated.length - 1;
                if (lastIndex >= 0 && updated[lastIndex].role === "assistant") {
                  updated[lastIndex] = { ...updated[lastIndex], content: assistantContent };
                }
                return updated;
              });
            }
          } catch {
            /* ignore */
          }
        }
      }

      // Only show error if we truly got nothing AND the stream completed without errors
      // This means the API call succeeded but returned no content
      if (!hasReceivedContent && assistantContent.length === 0) {
        console.warn("Think Mode: Stream completed but no content extracted. Raw response may have unexpected format.");
        // Remove the empty assistant placeholder
        setMessages((prev) => prev.slice(0, prev.length - 1));
        // Show a generic technical error instead of the user-facing fallback
        toast({
          title: "Response Issue",
          description: "I ran into an issue generating a response. Please try again in a moment.",
          variant: "destructive",
        });
        return;
      }
    } catch (error: any) {
      console.error("Think Mode error (standalone):", error);
      removePendingUserMessage();
      toast({
        title: "Think Mode Error",
        description: error.message || "Failed to connect to AI",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="think-mode min-h-screen flex flex-col text-zinc-200">
      <div className="grow flex flex-col items-center px-4 sm:px-6 pb-48 relative bg-[#171717]">
        <TextureOverlay texture="grid" gridSize={16} opacity={0.06} className="invert" />
        <div className="relative z-10 w-full flex flex-col items-center flex-1">
        {/* Strategic Planning + Strategy Guide - only when empty */}
        {isEmpty && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="w-full max-w-4xl text-center pt-12 sm:pt-16 space-y-3 relative"
          >
            <p className="think-mode-heading text-3xl sm:text-4xl text-zinc-50 font-serif">
              Strategic Planning
            </p>
            <div className="flex items-center justify-center gap-2">
              <Sheet>
                <SheetTrigger asChild>
                  <button className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-400 transition-colors border border-zinc-600 rounded-lg px-2 py-0.5 hover:bg-zinc-800/60 bg-zinc-800/40">
                    <Info className="w-3 h-3" />
                    <span>Strategy Guide</span>
                  </button>
                </SheetTrigger>
              <SheetContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-md overflow-y-auto">
                <SheetHeader className="mb-6">
                  <SheetTitle className="text-2xl font-semibold text-zinc-50">Strategic Frameworks</SheetTitle>
                  <SheetDescription className="text-zinc-400">
                    Our AI models are trained on these specific methodologies to give you expert-level guidance.
                  </SheetDescription>
                </SheetHeader>
                <div className="space-y-6">
                  {strategicOptions.map((option) => (
                    <div key={option.label} className="space-y-2 border-b border-zinc-800 pb-4 last:border-0">
                      <div className="flex items-center gap-2 text-orange-400">
                        <option.icon className="w-4 h-4" />
                        <h3 className="font-semibold text-zinc-100">{option.label}</h3>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">The Framework</p>
                        <p className="text-sm font-medium text-zinc-200">{option.framework}</p>
                      </div>
                      <p className="text-sm text-zinc-400 leading-relaxed">
                        {option.description}
                      </p>
                    </div>
                  ))}
                </div>
              </SheetContent>
              </Sheet>
            </div>
          </motion.div>
        )}

        {/* Chips - rectangular, stacked in 2 rows, only when empty */}
        {isEmpty && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-6 sm:mt-8 max-w-2xl"
          >
            {strategicOptions.map((option, index) => (
              <motion.button
                key={option.label}
                type="button"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04, duration: 0.3 }}
                onClick={() => handleSubmit(option.prompt)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-zinc-600/80 bg-zinc-800/50 text-zinc-300 text-sm font-medium hover:bg-zinc-700/60 hover:border-zinc-500 hover:text-zinc-100 transition-all duration-200 group"
              >
                <option.icon className="w-4 h-4 text-orange-400/90 group-hover:text-orange-400 shrink-0" strokeWidth={1.5} />
                <span className="whitespace-nowrap">{option.label}</span>
              </motion.button>
            ))}
          </motion.div>
        )}

        <div className={cn("w-full max-w-3xl flex-1 flex flex-col", isEmpty ? "hidden" : "flex mt-8")}>
          <ScrollArea className="flex-1" ref={scrollRef}>
            <div className="space-y-8 w-full pb-4">
              {messages.map((message, index) => {
                // Only parse actions for assistant messages
                const isAssistant = message.role === "assistant";
                const actionRegex = /<<ACTION:\s*(.*?)\s*\|\s*(.*?)>>/g;
                const actions: { label: string; prompt: string }[] = [];
                
                // Ensure message.content is always a string before processing
                const contentToProcess = message.content || "";
                
                let cleanContent = contentToProcess;
                
                if (isAssistant) {
                  cleanContent = contentToProcess.replace(actionRegex, (match, label, prompt) => {
                    actions.push({ label: label.trim(), prompt: prompt.trim() });
                    return ""; 
                  }).trim();
                }

                return (
                  <motion.div
                    key={`${message.role}-${index}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                  >
                    <p className="text-[0.65rem] uppercase tracking-[0.35em] text-zinc-500">
                      {message.role === "user" ? userName || "You" : "Madison"}
                    </p>
                    <div className="think-mode-body text-[1rem] leading-relaxed text-zinc-300 prose prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-zinc-900 prose-pre:text-zinc-200 prose-code:text-orange-400 prose-headings:text-zinc-50 prose-strong:text-zinc-100 prose-a:text-orange-400 hover:prose-a:text-orange-300">
                      {isAssistant ? (
                        <ReactMarkdown 
                          remarkPlugins={[remarkGfm]}
                          components={{
                            p: ({node, ...props}) => <p className="mb-4 last:mb-0" {...props} />,
                            a: ({node, ...props}) => <a target="_blank" rel="noopener noreferrer" {...props} />,
                          }}
                        >
                          {cleanContent}
                        </ReactMarkdown>
                      ) : (
                        <p className="whitespace-pre-wrap">{cleanContent}</p>
                      )}
                    </div>

                    {/* Render Action Buttons if present (Assistant only) */}
                    {actions.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-4 pt-2 border-t border-zinc-800">
                        {actions.map((action, i) => (
                          <Button
                            key={i}
                            variant="secondary"
                            size="sm"
                            onClick={() => handleSubmit(action.prompt)}
                            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-600 hover:border-orange-500/50 transition-all text-xs h-auto py-2 px-3"
                          >
                            {action.label}
                            <ArrowRight className="w-3 h-3 ml-2 text-zinc-500" />
                          </Button>
                        ))}
                      </div>
                    )}
                  </motion.div>
                );
              })}

              {isLoading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-3 text-sm text-zinc-500"
                >
                  <motion.span
                    className="inline-block h-2 w-2 rounded-full bg-orange-500"
                    animate={{ opacity: [0.2, 1, 0.2] }}
                    transition={{ repeat: Infinity, duration: 1.6 }}
                  />
                  Madison is thinking…
                </motion.div>
              )}
            </div>
          </ScrollArea>
        </div>
        </div>
      </div>

      {/* Chat bar - pill-shaped container matching reference */}
      <footer className="think-mode-footer sticky bottom-0 left-0 right-0 bg-[#171717] pt-4 pb-6 px-4">
          <div className="max-w-4xl mx-auto flex items-center gap-2 px-4 py-3 rounded-[1.25rem] bg-zinc-800/90 border border-zinc-700/50">
            <button
              type="button"
              className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-300 hover:bg-zinc-700/50 transition-colors shrink-0"
              aria-label="Add"
            >
              <Plus className="w-4 h-4" />
            </button>
            <Textarea
              ref={textareaRef}
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder=""
              className="flex-1 min-h-[44px] max-h-32 resize-none border-0 bg-transparent text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none text-base py-2 px-0 rounded-none shadow-none"
              rows={2}
              disabled={isLoading}
            />
            <button
              type="button"
              className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-300 hover:bg-zinc-700/50 transition-colors shrink-0"
              aria-label="Microphone"
            >
              <Mic className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleSubmit()}
              disabled={!idea.trim() || isLoading}
              className="p-2.5 rounded-xl bg-orange-500 text-white hover:bg-orange-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              <ArrowUp className="w-4 h-4" />
            </button>
          </div>
        </footer>
    </div>
  );
}
