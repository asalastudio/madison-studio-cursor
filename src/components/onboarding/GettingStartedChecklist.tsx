import { useState, useEffect } from "react";
import { Check, ChevronDown, ChevronUp, Sparkles, FileText, Calendar, Settings, Zap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface ChecklistItem {
    id: string;
    title: string;
    description: string;
    icon: React.ElementType;
    completed: boolean;
    route?: string;
    action?: () => void;
}

interface GettingStartedChecklistProps {
    onDismiss?: () => void;
    compact?: boolean;
}

export function GettingStartedChecklist({ onDismiss, compact = false }: GettingStartedChecklistProps) {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { organizationId } = useOrganization();
    const [isExpanded, setIsExpanded] = useState(!compact);
    const [items, setItems] = useState<ChecklistItem[]>([
        {
            id: "create_first_content",
            title: "Create Your First Content",
            description: "Use Forge to generate your first piece of on-brand content",
            icon: Sparkles,
            completed: false,
            route: "/create",
        },
        {
            id: "explore_library",
            title: "Explore Your Library",
            description: "See where all your content lives and how to organize it",
            icon: FileText,
            completed: false,
            route: "/library",
        },
        {
            id: "schedule_content",
            title: "Schedule a Post",
            description: "Plan your content calendar for consistent publishing",
            icon: Calendar,
            completed: false,
            route: "/calendar",
        },
        {
            id: "customize_brand",
            title: "Customize Your Brand",
            description: "Fine-tune your brand voice, colors, and guidelines",
            icon: Settings,
            completed: false,
            route: "/brand-builder",
        },
        {
            id: "try_multiply",
            title: "Try Content Multiplication",
            description: "Turn one piece of content into many with Amplify",
            icon: Zap,
            completed: false,
            route: "/multiply",
        },
    ]);

    // Load completion status from localStorage and database
    useEffect(() => {
        if (!user || !organizationId) return;

        let cancelled = false;

        const loadProgress = async () => {
            try {
                // Check for actual content creation
                const [masterContentResult, outputsResult, scheduledContentResult, derivativesResult] = await Promise.all([
                    supabase
                    .from("master_content")
                    .select("id")
                    .eq("organization_id", organizationId)
                        .limit(1),
                    supabase
                    .from("outputs")
                    .select("id")
                    .eq("organization_id", organizationId)
                        .limit(1),
                    supabase
                    .from("scheduled_content")
                    .select("id")
                    .eq("organization_id", organizationId)
                    .eq("status", "scheduled")
                        .limit(1),
                    supabase
                    .from("derivative_content")
                    .select("id")
                    .eq("organization_id", organizationId)
                        .limit(1)
                ]);

                // Check if component was unmounted or user logged out during API calls
                if (cancelled || !user || !organizationId) return;

                const { data: masterContent } = masterContentResult;
                const { data: outputs } = outputsResult;
                const { data: scheduledContent } = scheduledContentResult;
                const { data: derivatives } = derivativesResult;

                // Get stored progress
                const storedProgress = localStorage.getItem(`checklist_progress_${user.id}`);
                const progress = storedProgress ? JSON.parse(storedProgress) : {};

                setItems((prevItems) =>
                    prevItems.map((item) => {
                        let completed = progress[item.id] || false;

                        // Auto-complete based on actual data
                        if (item.id === "create_first_content" && (masterContent?.length || outputs?.length)) {
                            completed = true;
                        }
                        if (item.id === "explore_library" && progress.explore_library) {
                            completed = true;
                        }
                        if (item.id === "schedule_content" && scheduledContent?.length) {
                            completed = true;
                        }
                        if (item.id === "customize_brand" && progress.customize_brand) {
                            completed = true;
                        }
                        if (item.id === "try_multiply" && derivatives?.length) {
                            completed = true;
                        }

                        return { ...item, completed };
                    })
                );
            } catch (error) {
                // Silently ignore errors if user logged out
                if (!cancelled && user) {
                console.error("Error loading checklist progress:", error);
                }
            }
        };

        loadProgress();

        return () => {
            cancelled = true;
        };
    }, [user, organizationId]);

    const completedCount = items.filter((item) => item.completed).length;
    const totalCount = items.length;
    const progressPercentage = (completedCount / totalCount) * 100;
    const isComplete = completedCount === totalCount;

    // Auto-hide when all tasks complete
    useEffect(() => {
        if (isComplete && onDismiss) {
            // Delay slightly so user can see the completion
            const timeout = setTimeout(() => {
                handleDismiss();
            }, 2000);
            return () => clearTimeout(timeout);
        }
    }, [isComplete]);

    const handleItemClick = (item: ChecklistItem) => {
        if (item.completed) return;

        // Mark as completed
        const newItems = items.map((i) =>
            i.id === item.id ? { ...i, completed: true } : i
        );
        setItems(newItems);

        // Save to localStorage
        if (user) {
            const progress = newItems.reduce((acc, i) => {
                acc[i.id] = i.completed;
                return acc;
            }, {} as Record<string, boolean>);
            localStorage.setItem(`checklist_progress_${user.id}`, JSON.stringify(progress));
        }

        // Navigate or execute action
        if (item.action) {
            item.action();
        } else if (item.route) {
            navigate(item.route);
        }
    };

    const handleDismiss = () => {
        if (user) {
            localStorage.setItem(`checklist_dismissed_${user.id}`, "true");
        }
        onDismiss?.();
    };

    if (compact && isComplete) {
        return null; // Don't show if compact and complete
    }

    return (
        <Card className={cn(
            "border-border/40 bg-gradient-to-br from-card to-card/50 shadow-lg rounded-xl",
            compact && "hover:shadow-xl transition-shadow"
        )}>
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                    <div className="flex-1">
                        <CardTitle className="flex items-center gap-2 text-lg font-serif">
                            <Sparkles className="w-5 h-5 text-primary" />
                            {isComplete ? "You're All Set! 🎉" : "Getting Started"}
                        </CardTitle>
                        <CardDescription className="mt-1">
                            {isComplete
                                ? "You've completed all the essential steps. Keep creating!"
                                : `Complete ${totalCount - completedCount} more ${totalCount - completedCount === 1 ? "step" : "steps"} to unlock Madison's full potential`}
                        </CardDescription>
                    </div>
                    {compact && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="ml-2"
                        >
                            {isExpanded ? (
                                <ChevronUp className="w-4 h-4" />
                            ) : (
                                <ChevronDown className="w-4 h-4" />
                            )}
                        </Button>
                    )}
                </div>

                <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-700">
                            {completedCount} of {totalCount} completed
                        </span>
                        <span className="font-medium text-gray-900">
                            {Math.round(progressPercentage)}%
                        </span>
                    </div>
                    <Progress value={progressPercentage} className="h-2" />
                </div>
            </CardHeader>

            {isExpanded && (
                <CardContent className="space-y-2 pt-0">
                    {items.map((item) => {
                        const Icon = item.icon;
                        return (
                            <button
                                key={item.id}
                                onClick={() => handleItemClick(item)}
                                disabled={item.completed}
                                className={cn(
                                    "w-full text-left p-3 rounded-lg border transition-all",
                                    item.completed
                                        ? "bg-primary/5 border-primary/20 cursor-default"
                                        : "bg-card border-border/40 hover:border-primary/40 hover:bg-accent/50 cursor-pointer"
                                )}
                            >
                                <div className="flex items-start gap-3">
                                    <div
                                        className={cn(
                                            "mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
                                            item.completed
                                                ? "bg-primary border-primary"
                                                : "border-muted-foreground/30"
                                        )}
                                    >
                                        {item.completed && <Check className="w-3 h-3 text-primary-foreground" />}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <Icon className={cn(
                                                "w-4 h-4",
                                                item.completed ? "text-primary" : "text-gray-700"
                                            )} />
                                            <h4 className={cn(
                                                "font-medium text-sm",
                                                item.completed ? "text-gray-700 line-through" : "text-gray-900"
                                            )}>
                                                {item.title}
                                            </h4>
                                        </div>
                                        <p className="text-xs text-gray-700">
                                            {item.description}
                                        </p>
                                    </div>
                                </div>
                            </button>
                        );
                    })}

                    {/* Always show dismiss option */}
                    {onDismiss && (
                        <div className="mt-4 pt-4 border-t border-[#E0E0E0]">
                            {isComplete ? (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleDismiss}
                                    className="w-full"
                                >
                                    🎉 Dismiss Checklist
                                </Button>
                            ) : (
                                <button
                                    onClick={handleDismiss}
                                    className="w-full text-xs text-[#1C150D]/50 hover:text-[#1C150D]/70 transition-colors py-2"
                                >
                                    Hide This — I Know What I'm Doing
                                </button>
                            )}
                        </div>
                    )}
                </CardContent>
            )}
        </Card>
    );
}
