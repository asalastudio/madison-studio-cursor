import React, { useState } from "react";
import { Lightbulb, Send, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { useOnboarding } from "@/hooks/useOnboarding";

interface Message {
    id: string;
    role: string;
    content: string;
}

interface ThinkModeProps {
    userName?: string | null;
    onClose: () => void;
    onReadyToFill: () => void;
}

export const ThinkMode: React.FC<ThinkModeProps> = ({ userName, onClose, onReadyToFill }) => {
    const { currentOrganizationId } = useOnboarding();
    const { toast } = useToast();
    const [thinkModeInput, setThinkModeInput] = useState("");
    const [thinkModeMessages, setThinkModeMessages] = useState<Message[]>([]);
    const [isThinking, setIsThinking] = useState(false);

    const extractThinkModeText = (chunk: any) => {
        const openAIContent = chunk?.choices?.[0]?.delta?.content;
        if (openAIContent) return openAIContent as string;

        const candidate = chunk?.candidates?.[0];
        if (candidate?.content?.parts?.length) {
            return candidate.content.parts
                .map((part: any) => part?.text ?? '')
                .join('');
        }

        const parts = chunk?.message?.content?.parts;
        if (parts?.length) {
            return parts.map((part: any) => part?.text ?? '').join('');
        }

        return '';
    };

    const handleThinkModeSend = async () => {
        if (!thinkModeInput.trim() || isThinking) return;

        const userMessage = {
            id: `think-${Date.now()}-user-${Math.random().toString(36).substr(2, 9)}`,
            role: 'user',
            content: thinkModeInput
        };
        setThinkModeMessages(prev => [...prev, userMessage]);
        setThinkModeInput("");
        setIsThinking(true);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const accessToken = session?.access_token;
            if (!accessToken) {
                toast({
                    title: "Sign in required",
                    description: "Please sign in to use Think Mode.",
                    variant: "destructive"
                });
                setIsThinking(false);
                return;
            }

            const response = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/think-mode-chat`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${accessToken}`
                    },
                    body: JSON.stringify({
                        messages: [...thinkModeMessages, userMessage],
                        userName: userName || undefined,
                        mode: 'creative',
                        organizationId: currentOrganizationId || undefined,
                    })
                }
            );

            if (!response.ok) {
                const error = await response.json();
                toast({
                    title: "AI Unavailable",
                    description: error.error || "Failed to get response",
                    variant: "destructive"
                });
                setIsThinking(false);
                return;
            }

            const reader = response.body?.getReader();
            if (!reader) throw new Error('No response body');

            const decoder = new TextDecoder();
            let aiMessage = "";
            let aiMessageIndex = -1;
            let textBuffer = "";
            let streamDone = false;

            while (!streamDone) {
                const { done, value } = await reader.read();
                if (done) break;

                textBuffer += decoder.decode(value, { stream: true });

                let newlineIndex: number;
                while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
                    let line = textBuffer.slice(0, newlineIndex);
                    textBuffer = textBuffer.slice(newlineIndex + 1);

                    if (line.endsWith("\r")) line = line.slice(0, -1);
                    if (line.startsWith(":") || line.trim() === "") continue;
                    if (!line.startsWith("data:")) continue;

                    const jsonStr = line.slice(5).trim();
                    if (jsonStr === "[DONE]") {
                        streamDone = true;
                        break;
                    }

                    try {
                        const parsed = JSON.parse(jsonStr);
                        const content = extractThinkModeText(parsed);

                        if (content) {
                            aiMessage += content;
                            setThinkModeMessages(prev => {
                                const updated = [...prev];
                                if (aiMessageIndex === -1) {
                                    const newMsg = {
                                        id: `think-${Date.now()}-ai-${Math.random().toString(36).substr(2, 9)}`,
                                        role: 'assistant',
                                        content: aiMessage
                                    };
                                    updated.push(newMsg);
                                    aiMessageIndex = updated.length - 1;
                                } else {
                                    updated[aiMessageIndex].content = aiMessage;
                                }
                                return updated;
                            });
                        }
                    } catch (parseError) {
                        textBuffer = line + "\n" + textBuffer;
                        break;
                    }
                }
            }
        } catch (error) {
            logger.error('Think Mode error:', error);
            toast({
                title: "Chat error",
                description: "Failed to connect to AI. Please try again.",
                variant: "destructive"
            });
        } finally {
            setIsThinking(false);
        }
    };

    return (
        <div className="mb-8 rounded-xl overflow-hidden border border-warm-gray/20">
            {/* Header */}
            <div className="p-4 flex items-center justify-between bg-gradient-to-r from-brass to-brass-glow">
                <div className="flex items-center gap-3">
                    <Lightbulb className="w-5 h-5 text-white" />
                    <h3 className="font-semibold text-white">Think Mode with Madison</h3>
                </div>
                <button onClick={onClose} className="hover:opacity-80 transition-opacity">
                    <X className="w-5 h-5 text-white" />
                </button>
            </div>

            {/* Content */}
            <div className="p-4 md:p-6 lg:p-8 bg-parchment-white">
                <div className="text-center max-w-2xl mx-auto mb-4 md:mb-6">
                    <div className="w-12 h-12 md:w-16 md:h-16 rounded-full flex items-center justify-center mx-auto mb-3 md:mb-4 bg-brass/10">
                        <Lightbulb className="w-6 h-6 md:w-8 md:h-8 text-brass" />
                    </div>
                    <h4 className="text-xl md:text-2xl font-serif mb-2 md:mb-3 text-ink-black">
                        Madison's here to help
                    </h4>
                    <p className="text-sm md:text-base text-warm-gray">
                        Share your ideas, questions, or creative direction. Your Editorial Director will help you explore and refine them.
                    </p>
                </div>

                {/* Example Prompts */}
                <div className="flex flex-wrap gap-2 md:gap-3 justify-center mb-4 md:mb-6">
                    <Button
                        variant="outline"
                        onClick={() => setThinkModeInput("I need a blog post about seasonal fragrance trends")}
                        className="text-sm border-warm-gray/20 text-warm-gray hover:border-brass hover:text-brass"
                    >
                        "I need a blog post about seasonal fragrance trends"
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => setThinkModeInput("Help me describe our new product launch")}
                        className="text-sm border-warm-gray/20 text-warm-gray hover:border-brass hover:text-brass"
                    >
                        "Help me describe our new product launch"
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => setThinkModeInput("What's the best way to tell our brand story?")}
                        className="text-sm border-warm-gray/20 text-warm-gray hover:border-brass hover:text-brass"
                    >
                        "What's the best way to tell our brand story?"
                    </Button>
                </div>

                {/* Chat Messages */}
                {thinkModeMessages.length > 0 && (
                    <div className="mb-4 md:mb-6 space-y-3 md:space-y-4 max-h-64 md:max-h-96 overflow-y-auto">
                        {thinkModeMessages.map((msg) => (
                            <div
                                key={msg.id}
                                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                <div
                                    className={`max-w-[85%] md:max-w-[80%] p-3 md:p-4 rounded-lg ${msg.role === 'user'
                                            ? 'bg-warm-gray/10 text-ink-black'
                                            : 'bg-brass/10 text-ink-black'
                                        }`}
                                >
                                    <p className="text-xs md:text-sm whitespace-pre-wrap">{msg.content}</p>
                                </div>
                            </div>
                        ))}
                        {isThinking && (
                            <div className="flex justify-start">
                                <div className="bg-brass/10 p-3 md:p-4 rounded-lg">
                                    <div className="flex gap-1">
                                        <span className="w-2 h-2 bg-brass rounded-full animate-bounce" />
                                        <span className="w-2 h-2 bg-brass rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                                        <span className="w-2 h-2 bg-brass rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {thinkModeMessages.length > 0 && (
                    <Button
                        onClick={onReadyToFill}
                        variant="outline"
                        className="w-full mb-4 border-brass text-brass hover:bg-brass/10"
                    >
                        Ready to Fill Out the Brief
                    </Button>
                )}

                {/* Input Area */}
                <div className="relative">
                    <Textarea
                        value={thinkModeInput}
                        onChange={(e) => setThinkModeInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleThinkModeSend();
                            }
                        }}
                        placeholder="Type your thoughts here..."
                        className="min-h-[100px] md:min-h-[120px] pr-12 bg-vellum-cream border-warm-gray/20 text-ink-black resize-none text-base"
                    />
                    <Button
                        onClick={handleThinkModeSend}
                        disabled={!thinkModeInput.trim() || isThinking}
                        variant="brass"
                        className="absolute bottom-3 right-3"
                        size="icon"
                    >
                        {isThinking ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Send className="w-4 h-4" />
                        )}
                    </Button>
                </div>
                <p className="text-xs text-warm-gray/70 mt-2">
                    Press Enter to send • Shift + Enter for new line
                </p>
            </div>
        </div>
    );
};
