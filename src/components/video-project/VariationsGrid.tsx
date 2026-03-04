/**
 * VariationsGrid - Displays multiple video variations with spectacular animations
 * 
 * Madison generates 3-4 variations of the video with different:
 * - Motion styles
 * - Color grading
 * - Timing/pacing
 * 
 * Users can preview each and select their favorite.
 */

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, Check, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface VideoVariation {
  id: string;
  videoUrl: string;
  thumbnailUrl?: string;
  style: "dynamic" | "smooth" | "dramatic" | "minimal";
  label: string;
  description: string;
  duration: number;
}

interface VariationsGridProps {
  variations: VideoVariation[];
  selectedId: string | null;
  onSelect: (variation: VideoVariation) => void;
  onRegenerate: () => void;
  isRegenerating: boolean;
  aspectRatio: "9:16" | "16:9" | "1:1";
}

const STYLE_CONFIG = {
  dynamic: {
    gradient: "from-amber-500/20 via-orange-500/10 to-red-500/20",
    accent: "#f59e0b",
    description: "Fast cuts, energetic motion",
  },
  smooth: {
    gradient: "from-blue-500/20 via-cyan-500/10 to-teal-500/20", 
    accent: "#06b6d4",
    description: "Flowing transitions, elegant pace",
  },
  dramatic: {
    gradient: "from-purple-500/20 via-violet-500/10 to-pink-500/20",
    accent: "#B8956A",
    description: "Bold contrasts, impactful timing",
  },
  minimal: {
    gradient: "from-slate-500/20 via-gray-500/10 to-zinc-500/20",
    accent: "#94a3b8",
    description: "Clean, subtle movements",
  },
};

function VariationCard({
  variation,
  isSelected,
  onSelect,
  aspectRatio,
}: {
  variation: VideoVariation;
  isSelected: boolean;
  onSelect: () => void;
  aspectRatio: string;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const config = STYLE_CONFIG[variation.style];

  const handlePlayPause = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const aspectClass = {
    "9:16": "aspect-[9/16]",
    "16:9": "aspect-video",
    "1:1": "aspect-square",
  }[aspectRatio];

  return (
    <motion.div
      className={cn(
        "variation-card",
        isSelected && "variation-card--selected"
      )}
      onClick={onSelect}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        if (videoRef.current) {
          videoRef.current.pause();
          videoRef.current.currentTime = 0;
          setIsPlaying(false);
        }
      }}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.02, y: -4 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
    >
      {/* Animated gradient border on hover */}
      <motion.div
        className={cn("variation-glow", `bg-gradient-to-br ${config.gradient}`)}
        initial={{ opacity: 0 }}
        animate={{ opacity: isHovered || isSelected ? 1 : 0 }}
        transition={{ duration: 0.3 }}
      />

      {/* Video Container */}
      <div className={cn("variation-video-container", aspectClass)}>
        <video
          ref={videoRef}
          src={variation.videoUrl}
          poster={variation.thumbnailUrl}
          className="variation-video"
          loop
          muted
          playsInline
        />

        {/* Play Overlay */}
        <AnimatePresence>
          {!isPlaying && (
            <motion.div
              className="variation-play-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.button
                className="variation-play-btn"
                onClick={handlePlayPause}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
              >
                <Play className="w-5 h-5 ml-0.5" />
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Playing indicator */}
        {isPlaying && (
          <motion.button
            className="variation-pause-btn"
            onClick={handlePlayPause}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            whileHover={{ scale: 1.1 }}
          >
            <Pause className="w-4 h-4" />
          </motion.button>
        )}

        {/* Selection checkmark */}
        <AnimatePresence>
          {isSelected && (
            <motion.div
              className="variation-selected-badge"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            >
              <Check className="w-4 h-4" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Info */}
      <div className="variation-info">
        <div className="variation-header">
          <span 
            className="variation-style-dot" 
            style={{ backgroundColor: config.accent }} 
          />
          <span className="variation-label">{variation.label}</span>
        </div>
        <p className="variation-description">{config.description}</p>
        <span className="variation-duration">{variation.duration}s</span>
      </div>
    </motion.div>
  );
}

export function VariationsGrid({
  variations,
  selectedId,
  onSelect,
  onRegenerate,
  isRegenerating,
  aspectRatio,
}: VariationsGridProps) {
  return (
    <div className="variations-grid-container">
      <div className="variations-header">
        <div className="variations-title-section">
          <h3 className="variations-title">Video Variations</h3>
          <p className="variations-subtitle">
            Madison generated {variations.length} styles. Preview and select your favorite.
          </p>
        </div>
        
        <Button
          variant="outline"
          size="sm"
          onClick={onRegenerate}
          disabled={isRegenerating}
          className="variations-regenerate-btn"
        >
          {isRegenerating ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          Regenerate
        </Button>
      </div>

      <motion.div 
        className="variations-grid"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: { opacity: 0 },
          visible: {
            opacity: 1,
            transition: {
              staggerChildren: 0.1,
            },
          },
        }}
      >
        {variations.map((variation) => (
          <VariationCard
            key={variation.id}
            variation={variation}
            isSelected={variation.id === selectedId}
            onSelect={() => onSelect(variation)}
            aspectRatio={aspectRatio}
          />
        ))}
      </motion.div>

      {/* Selection prompt */}
      {!selectedId && variations.length > 0 && (
        <motion.p 
          className="variations-prompt"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          Click a variation to select it for your final video
        </motion.p>
      )}
    </div>
  );
}
