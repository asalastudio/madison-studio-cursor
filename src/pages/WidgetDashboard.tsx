/**
 * Widget Dashboard
 * 
 * Customizable dashboard with drag-and-drop widgets.
 */

import { useState, useEffect } from "react";
import { Loader2, Sparkles, Settings, RotateCcw, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { logger } from "@/lib/logger";

// Widget System
import { WidgetProvider, useWidgets, WidgetGrid, WidgetSelector } from "@/components/widgets";

// Supporting Components
import MadisonPanel from "@/components/image-editor/MadisonPanel";
import { BrandQuickViewTrigger } from "@/components/brand";
import { GettingStartedChecklist } from "@/components/onboarding/GettingStartedChecklist";
import { PostOnboardingGuide } from "@/components/onboarding/PostOnboardingGuide";
import { usePostOnboardingGuide } from "@/hooks/usePostOnboardingGuide";

function WidgetDashboardContent() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: stats, isLoading: statsLoading, error, isError } = useDashboardStats();
  const [showFallback, setShowFallback] = useState(false);
  const [madisonPanelOpen, setMadisonPanelOpen] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);
  const { showGuide, dismissGuide } = usePostOnboardingGuide();
  
  const { isEditMode, setEditMode, isLoading: layoutLoading, resetToDefault, saveLayout } = useWidgets();

  // Check if we should show the getting started checklist
  useEffect(() => {
    if (!user) return;
    const checklistDismissed = localStorage.getItem(`checklist_dismissed_${user.id}`);
    if (!checklistDismissed && stats && stats.totalContent < 5) {
      setShowChecklist(true);
    }
  }, [user, stats]);

  // Safety timeout - show fallback after 3 seconds of loading
  useEffect(() => {
    if (statsLoading || layoutLoading) {
      const timeout = setTimeout(() => {
        logger.debug("Dashboard loading timeout - showing fallback");
        setShowFallback(true);
      }, 3000);
      return () => clearTimeout(timeout);
    }
  }, [statsLoading, layoutLoading]);

  // Log errors for debugging
  useEffect(() => {
    if (isError) {
      logger.error("Dashboard stats error:", error);
    }
  }, [isError, error]);

  const handleExitEditMode = async () => {
    await saveLayout();
    setEditMode(false);
  };

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
  if (statsLoading || layoutLoading) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#B8956A]" />
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-[#FAFAFA] flex flex-col">
      {/* Top Bar - Desktop Only */}
      <div className="hidden md:flex h-16 border-b border-[#E0E0E0] px-8 items-center justify-between bg-white">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold text-[#1C150D]">Dashboard</h1>
          {isEditMode && (
            <span className="text-sm text-muted-foreground bg-primary/10 px-2 py-1 rounded">
              Editing Layout
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isEditMode ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={resetToDefault}
                className="gap-2 text-muted-foreground"
              >
                <RotateCcw className="w-4 h-4" />
                Reset
              </Button>
              <WidgetSelector />
              <Button
                size="sm"
                onClick={handleExitEditMode}
                className="bg-primary hover:bg-primary/90 text-white"
              >
                Done
              </Button>
            </>
          ) : (
            <>
              <BrandQuickViewTrigger variant="minimal" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditMode(true)}
                className="gap-2"
              >
                <Settings className="w-4 h-4" />
                Customize
              </Button>
              <Button
                size="sm"
                onClick={() => setMadisonPanelOpen(true)}
                className="bg-[#B8956A] hover:bg-[#A3865A] text-white flex items-center gap-2 shadow-sm"
              >
                <Sparkles className="w-4 h-4" />
                Ask Madison
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Mobile Header */}
      <div className="md:hidden h-14 border-b border-[#E0E0E0] px-4 flex items-center justify-between bg-white">
        <h1 className="text-lg font-semibold text-[#1C150D]">Dashboard</h1>
        <div className="flex items-center gap-2">
          {isEditMode ? (
            <Button
              size="sm"
              onClick={handleExitEditMode}
              className="bg-primary hover:bg-primary/90 text-white px-3 py-2"
            >
              Done
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditMode(true)}
                className="px-2"
              >
                <Settings className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                onClick={() => setMadisonPanelOpen(true)}
                className="bg-[#B8956A] hover:bg-[#A3865A] text-white px-3 py-2"
              >
                <Sparkles className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Edit Mode Banner - Mobile */}
      {isEditMode && (
        <div className="md:hidden bg-primary/10 border-b border-primary/20 px-4 py-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-primary font-medium">Editing Layout</span>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={resetToDefault}
                className="h-7 text-xs"
              >
                Reset
              </Button>
              <WidgetSelector />
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto px-4 md:px-8 py-4 md:py-6 pb-24 md:pb-6 main-content">
        <div className="max-w-[1400px] mx-auto space-y-4 md:space-y-6">
          
          {/* Widget Grid */}
          <WidgetGrid className="animate-slide-up" />

          {/* Getting Started (New users only - <5 content pieces) */}
          {showChecklist && !isEditMode && (
            <div className="animate-slide-up">
              <GettingStartedChecklist
                onDismiss={() => setShowChecklist(false)}
                compact={false}
              />
            </div>
          )}

        </div>
      </div>

      {/* Madison AI Assistant Panel */}
      <MadisonPanel
        isOpen={madisonPanelOpen}
        onToggle={() => setMadisonPanelOpen(!madisonPanelOpen)}
        sessionCount={0}
        maxImages={10}
      />

      {/* Post-Onboarding Guide */}
      {showGuide && <PostOnboardingGuide onDismiss={dismissGuide} userName={user?.email?.split("@")[0]} />}
    </div>
  );
}

export default function WidgetDashboard() {
  return (
    <WidgetProvider>
      <WidgetDashboardContent />
    </WidgetProvider>
  );
}

