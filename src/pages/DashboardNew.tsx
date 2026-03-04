import { useState, useEffect } from "react";
import { Loader2, Edit2, Check, X, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { DashboardWidgetType, WIDGET_DEFINITIONS } from "@/components/dashboard/DashboardWidgetSystem";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { useDashboardWidgets } from "@/contexts/DashboardWidgetContext";
import { DashboardWidgetSystem } from "@/components/dashboard/DashboardWidgetSystem";

// New Dashboard Components (Phase 2)
import { DashboardHero } from "@/components/dashboard/DashboardHero";
import { SmartMomentumTracker } from "@/components/dashboard/SmartMomentumTracker";
import { QuickLinksWidget } from "@/components/dashboard/QuickLinksWidget";
import { StrategySessionCard } from "@/components/dashboard/StrategySessionCard";

// Existing Components (Updated in Phase 1)
import { ContentPipelineCard } from "@/components/dashboard/ContentPipelineCard";
import { ThisWeekCard } from "@/components/dashboard/ThisWeekCard";
import { DashboardRecentActivity } from "@/components/dashboard/DashboardRecentActivity";

// Role-based widgets (now handled by widget system)

// Supporting Components
import { GettingStartedChecklist } from "@/components/onboarding/GettingStartedChecklist";
// DraftNudge removed - re-add once proper publish tracking is implemented
// import { DraftNudge } from "@/components/dashboard/DraftNudge";
import { PostOnboardingGuide } from "@/components/onboarding/PostOnboardingGuide";
import { usePostOnboardingGuide } from "@/hooks/usePostOnboardingGuide";
import { logger } from "@/lib/logger";

// Role-based components
import { RoleDashboardWidgets } from "@/components/dashboard/RoleDashboardWidgets";
import { useUserRole } from "@/hooks/useUserRole";

import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { TextureOverlay } from "@/components/ui/texture-overlay";

export default function DashboardNew() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const { data: stats, isLoading: statsLoading, error, isError } = useDashboardStats();
  const [showFallback, setShowFallback] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);
  const { showGuide, dismissGuide } = usePostOnboardingGuide();
  const {
    widgets,
    isEditMode,
    toggleEditMode,
    addWidget,
    removeWidget,
    updateWidget,
    resetWidgets
  } = useDashboardWidgets();

  // Check if we should show the getting started checklist
  useEffect(() => {
    if (!user) return;
    const checklistDismissed = localStorage.getItem(`checklist_dismissed_${user.id}`);

    // Show checklist if not dismissed and user has less than 5 completed tasks
    if (!checklistDismissed && stats && stats.totalContent < 5) {
      setShowChecklist(true);
    }
  }, [user, stats]);

  // Safety timeout - show fallback after 3 seconds of loading
  useEffect(() => {
    if (statsLoading) {
      const timeout = setTimeout(() => {
        logger.debug("Dashboard loading timeout - showing fallback");
        setShowFallback(true);
      }, 3000);
      return () => clearTimeout(timeout);
    }
  }, [statsLoading]);

  // Log errors for debugging
  useEffect(() => {
    if (isError) {
      logger.error("Dashboard stats error:", error);
    }
  }, [isError, error]);

  // Show fallback if loading too long or error occurred
  if ((statsLoading && showFallback) || isError) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center">
        <div className="text-center space-y-4">
          {statsLoading && !isError && <Loader2 className="w-8 h-8 animate-spin text-[#B8956A] mx-auto" />}
          <div className="text-[#1C150D]/60 text-sm">
            {isError ? "Welcome! Let's get started." : "Setting up your workspace…"}
          </div>
          <Button
            onClick={() => navigate("/create")}
            className="bg-[#1C150D] hover:bg-[#2C251D] text-white"
          >
            Start Creating
          </Button>
        </div>
      </div>
    );
  }

  // Show brief initial spinner
  if (statsLoading) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#B8956A]" />
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden flex flex-col">
      {/* Top Bar with Madison Button - Desktop Only */}
      <div className="hidden md:flex h-16 border-b border-[#E0E0E0] px-8 items-center justify-between bg-white shrink-0">
        <h1 className="text-xl font-semibold text-[#1C150D]">Dashboard</h1>
        <div className="flex items-center gap-3">
          {/* Reset Button (only in edit mode) */}
          {isEditMode && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetWidgets}
                  className="gap-2"
                >
                  <X className="w-4 h-4" />
                  Reset
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Reset to default layout</p>
              </TooltipContent>
            </Tooltip>
          )}

          {/* Edit Layout Button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={isEditMode ? "default" : "ghost"}
                size="sm"
                onClick={toggleEditMode}
                className="gap-2"
              >
                {isEditMode ? (
                  <>
                    <Check className="w-4 h-4" />
                    Done Editing
                  </>
                ) : (
                  <>
                    <Edit2 className="w-4 h-4" />
                    Edit Layout
                  </>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{isEditMode ? "Save layout changes" : "Edit dashboard layout"}</p>
            </TooltipContent>
          </Tooltip>

          {/* Add Widget Button - Far Right */}
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Plus className="w-4 h-4" />
                    Add Widget
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Available Widgets</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    {Object.entries(WIDGET_DEFINITIONS).map(([type, def]) => {
                      const Icon = def.icon;
                      const isAdded = widgets.some(w => w.type === type);
                      // Don't show hero-banner in add menu (it's always there)
                      if (type === 'hero-banner') return null;
                      return (
                        <DropdownMenuItem
                          key={type}
                          onClick={() => addWidget(type as DashboardWidgetType)}
                          disabled={isAdded}
                          className="gap-2"
                        >
                          <Icon className="w-4 h-4" />
                          <span>{def.name}</span>
                          {isAdded && <span className="ml-auto text-xs text-muted-foreground">Added</span>}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </TooltipTrigger>
            <TooltipContent>
              <p>Add a widget to your dashboard</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Mobile Header - Simplified */}
      <div className="md:hidden h-14 border-b border-[#E0E0E0] px-4 flex items-center justify-between bg-white sticky top-0 z-10 shrink-0">
        <h1 className="text-base sm:text-lg font-semibold text-[#1C150D]">Dashboard</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleEditMode}
            className="px-3 py-2 min-h-[44px] min-w-[44px]"
          >
            {isEditMode ? (
              <Check className="w-4 h-4" />
            ) : (
              <Edit2 className="w-4 h-4" />
            )}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="px-3 py-2 min-h-[44px] min-w-[44px]">
                <Plus className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Available Widgets</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                {Object.entries(WIDGET_DEFINITIONS).map(([type, def]) => {
                  const Icon = def.icon;
                  const isAdded = widgets.some(w => w.type === type);
                  if (type === 'hero-banner') return null;
                  return (
                    <DropdownMenuItem
                      key={type}
                      onClick={() => addWidget(type as DashboardWidgetType)}
                      disabled={isAdded}
                      className="gap-2"
                    >
                      <Icon className="w-4 h-4" />
                      <span>{def.name}</span>
                      {isAdded && <span className="ml-auto text-xs text-muted-foreground">Added</span>}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Main Content Area - Brand background with dots texture */}
      <div className="flex-1 overflow-auto main-content relative bg-[#F5F1E8]">
        <div className="relative min-h-full">
          <TextureOverlay texture="grid" opacity={0.35} gridSize={8} />
          <div className="relative z-10 max-w-[1400px] mx-auto space-y-3 sm:space-y-4 md:space-y-6">

          {/* WIDGET SYSTEM - All components including hero are widgets */}
          <DashboardWidgetSystem
            widgets={widgets}
            isEditMode={isEditMode}
            onWidgetsChange={(newWidgets) => {
              newWidgets.forEach(w => updateWidget(w.id, w));
            }}
            onAddWidget={addWidget}
            onRemoveWidget={removeWidget}
            onResizeWidget={(id, w, h) => updateWidget(id, { w, h })}
            showAddButton={false}
          />

          {/* GETTING STARTED (New users only - <5 content pieces) - Not a widget */}
          {showChecklist && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="col-span-1 md:col-span-12">
                <GettingStartedChecklist
                  onDismiss={() => setShowChecklist(false)}
                  compact={false}
                />
              </div>
            </div>
          )}

          {/* Draft Nudge removed - re-add once proper publish tracking is implemented
          {stats && stats.totalDrafts >= 10 && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="col-span-1 md:col-span-12">
                <DraftNudge draftCount={stats.totalDrafts} />
              </div>
            </div>
          )}
          */}

          </div>
        </div>
      </div>


      {/* Mobile Navigation */}
      <BottomNavigation />

      {/* Post-Onboarding Guide */}
      {showGuide && <PostOnboardingGuide onDismiss={dismissGuide} userName={user?.email?.split("@")[0]} />}
    </div>
  );
}
