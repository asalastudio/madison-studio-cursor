import React from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Save, Settings, HelpCircle, X, Download, CheckCircle, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useNavigate } from "react-router-dom";
import { LEDIndicator } from "./LEDIndicator";

interface HeroImage {
  id: string;
  imageUrl: string;
  isSaved: boolean;
}

interface DarkRoomHeaderProps {
  sessionCount: number;
  savedCount: number;
  isSaving: boolean;
  onSaveAll?: () => void;
  onOpenSettings?: () => void;
  // Hero image actions
  heroImage?: HeroImage | null;
  onDownloadHero?: () => void;
  onSaveHero?: () => void;
  onRefineHero?: () => void;
  // Extra content for the right side (e.g. LibrarianTrigger)
  rightExtra?: React.ReactNode;
}

export function DarkRoomHeader({
  sessionCount,
  savedCount,
  isSaving,
  onSaveAll,
  heroImage,
  onDownloadHero,
  onSaveHero,
  onRefineHero,
  rightExtra,
}: DarkRoomHeaderProps) {
  const navigate = useNavigate();

  // Exit to Create page
  const handleExit = () => {
    navigate("/create");
  };

  // Go back to Create (prevents loop with Light Table)
  const handleBack = () => {
    navigate("/create");
  };

  return (
    <header className="dark-room-header">
      {/* Left: Back + Exit + Title */}
      <div className="flex items-center gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBack}
                className="h-8 w-8 p-0 text-[var(--darkroom-text-muted)] hover:text-[var(--darkroom-text)] hover:bg-white/5"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Back</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleExit}
                className="h-8 w-8 p-0 text-[var(--darkroom-text-muted)] hover:text-[var(--darkroom-text)] hover:bg-white/5"
              >
                <X className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Exit</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <motion.h1
          className="dark-room-header__title"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
        >
          Dark Room
        </motion.h1>
      </div>

      {/* Center: Hero Image Actions (when image selected) */}
      {heroImage && (
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={onDownloadHero}
            className="h-8 px-3 text-[var(--darkroom-text-muted)] hover:text-[var(--darkroom-text)] hover:bg-white/5 text-[11px] font-medium"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Download
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={onSaveHero}
            disabled={isSaving || heroImage.isSaved}
            className={`h-8 px-3 text-[11px] font-medium ${
              heroImage.isSaved 
                ? "text-[var(--led-ready)] bg-[var(--led-ready)]/10 hover:bg-[var(--led-ready)]/15" 
                : "text-[var(--darkroom-text-muted)] hover:text-[var(--darkroom-accent)] hover:bg-[var(--darkroom-accent)]/10"
            }`}
          >
            {isSaving ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : heroImage.isSaved ? (
              <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
            ) : (
              <Save className="w-3.5 h-3.5 mr-1.5" />
            )}
            {heroImage.isSaved ? "Saved" : "Save"}
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefineHero}
            className="h-8 px-3 text-[var(--darkroom-text-muted)] hover:text-[var(--darkroom-text)] hover:bg-white/5 text-[11px] font-medium"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            Refine
          </Button>
        </div>
      )}

      {/* Right: Session Info + Actions */}
      <div className="flex items-center gap-2">
        {/* Session indicator - compact */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-black/20 border border-white/[0.04]">
          <LEDIndicator 
            state={sessionCount > 0 ? "ready" : "off"} 
            size="sm" 
          />
          <span className="text-[10px] font-mono text-[var(--darkroom-text-dim)]">
            {sessionCount}
          </span>
          {savedCount > 0 && (
            <span className="text-[10px] font-mono text-[var(--led-ready)]">
              ({savedCount})
            </span>
          )}
        </div>

        {sessionCount > savedCount && onSaveAll && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onSaveAll}
            disabled={isSaving}
            className="h-8 px-2 text-[var(--darkroom-text-muted)] hover:text-[var(--darkroom-accent)] hover:bg-white/5 text-[10px] font-medium"
          >
            <Save className="w-3.5 h-3.5 mr-1" />
            Save All
          </Button>
        )}

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.open("/docs/dark-room", "_blank")}
                className="h-8 w-8 p-0 text-[var(--darkroom-text-muted)] hover:text-[var(--darkroom-text)] hover:bg-white/5"
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Help</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {rightExtra}
      </div>
    </header>
  );
}
