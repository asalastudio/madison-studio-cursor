import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera,
  Loader2,
  ArrowUp,
  Paperclip,
} from "lucide-react";
import { ThumbnailCarousel } from "./ThumbnailCarousel";
import { DevelopingAnimation, useDevelopingAnimation } from "./DevelopingAnimation";
import { LEDIndicator } from "./LEDIndicator";
import { cn } from "@/lib/utils";

interface GeneratedImage {
  id: string;
  imageUrl: string;
  prompt: string;
  timestamp: number;
  isSaved: boolean;
  isHero?: boolean;
}

interface CenterCanvasProps {
  // Images
  images: GeneratedImage[];
  heroImage: GeneratedImage | null;
  onSetHero: (id: string) => void;
  onSaveImage: (id: string) => void;
  onDeleteImage: (id: string) => void;
  onDownloadImage: (image: GeneratedImage) => void;
  onRefineImage: (image: GeneratedImage) => void;

  // Prompt
  prompt: string;
  onPromptChange: (prompt: string) => void;
  onGenerate: () => void;

  // State
  isGenerating: boolean;
  isSaving: boolean;
  canGenerate: boolean;

  // Pro Mode indicator
  proSettingsCount: number;

  // Session
  maxImages: number;
  
  // Track newly generated images for developing animation
  newlyGeneratedId?: string | null;
}

// Generating State with Chemical Bath Animation & Camera Capture Sequence
function GeneratingState({ 
  pendingImageUrl, 
  showShutter = true 
}: { 
  pendingImageUrl?: string;
  showShutter?: boolean;
}) {
  const [capturePhase, setCapturePhase] = useState<"shutter" | "flash" | "developing">("shutter");

  useEffect(() => {
    // Camera capture sequence:
    // 1. Shutter click (150ms)
    // 2. Sensor flash (400ms)
    // 3. Developing animation
    if (showShutter) {
      const shutterTimer = setTimeout(() => setCapturePhase("flash"), 150);
      const flashTimer = setTimeout(() => setCapturePhase("developing"), 550);
      return () => {
        clearTimeout(shutterTimer);
        clearTimeout(flashTimer);
      };
    } else {
      setCapturePhase("developing");
    }
  }, [showShutter]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="generating-state"
    >
      {/* Shutter overlay - quick black flash */}
      <div className={cn(
        "shutter-overlay",
        capturePhase === "shutter" && "shutter-overlay--active"
      )} />
      
      {/* Sensor flash - warm neutral bloom */}
      <div className={cn(
        "sensor-flash",
        capturePhase === "flash" && "sensor-flash--active"
      )} />

      <DevelopingAnimation
        imageUrl={pendingImageUrl}
        phase="submerged"
        developingText={capturePhase === "developing" ? "Exposing image..." : "Capturing..."}
      />
    </motion.div>
  );
}

// Image Reveal with Chemical Bath Developing Effect
// Actions now in header - this just shows the image
function ImageReveal({
  image,
  isNewlyGenerated = false,
}: {
  image: GeneratedImage;
  onSave: () => void;
  onDownload: () => void;
  onRefine: () => void;
  isSaving: boolean;
  isNewlyGenerated?: boolean;
}) {
  // Use the developing animation for newly generated images
  const { phase } = useDevelopingAnimation(
    isNewlyGenerated ? image.imageUrl : null,
    {
      autoStart: isNewlyGenerated,
      developDuration: 2500, // 2.5 seconds for the full reveal
    }
  );

  // If not newly generated, show directly
  if (!isNewlyGenerated) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="image-reveal image-reveal--direct"
      >
        <img
          src={image.imageUrl}
          alt="Generated"
          className="hero-image"
        />
      </motion.div>
    );
  }

  // Newly generated image - show developing animation
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="image-reveal image-reveal--developing"
    >
      {/* Chemical Bath Developing Animation */}
      <DevelopingAnimation
        imageUrl={image.imageUrl}
        phase={phase}
        developDuration={2500}
      />
    </motion.div>
  );
}

// Empty State - Minimal viewfinder
function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="empty-state"
    >
      {/* Minimal crosshair indicator */}
      <div className="w-16 h-16 relative">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-4 bg-[var(--darkroom-border-strong)]" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-px h-4 bg-[var(--darkroom-border-strong)]" />
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-px bg-[var(--darkroom-border-strong)]" />
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-px bg-[var(--darkroom-border-strong)]" />
      </div>
    </motion.div>
  );
}

export function CenterCanvas({
  images,
  heroImage,
  onSetHero,
  onSaveImage,
  onDeleteImage,
  onDownloadImage,
  onRefineImage,
  prompt,
  onPromptChange,
  onGenerate,
  isGenerating,
  isSaving,
  canGenerate,
  proSettingsCount,
  maxImages,
  newlyGeneratedId,
}: CenterCanvasProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [activeMode, setActiveMode] = useState<"prompt" | "visual">("prompt");

  // Auto-resize textarea
  const resizeTextarea = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "40px";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canGenerate && !isGenerating) {
        onGenerate();
      }
    }
  };

  return (
    <section className="center-canvas">
      {/* Main Viewport with Viewfinder Brackets */}
      <div className={cn(
        "center-canvas__viewport viewfinder-brackets viewfinder-brackets-bottom",
        isGenerating && "viewfinder-brackets--active"
      )}>
        {/* Focus Point Indicator - shows during generation */}
        <div className={cn(
          "focus-point",
          isGenerating && "focus-point--visible"
        )} />
        
        {/* Status Panel - Top Left Corner */}
        <div className="absolute top-4 left-4 z-10">
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-black/60 backdrop-blur-sm border border-[var(--darkroom-border)]">
            <LEDIndicator 
              state={isGenerating ? "processing" : heroImage ? "ready" : "off"} 
              size="lg"
            />
            <div className="flex flex-col">
              <span className="text-[9px] font-mono uppercase tracking-[0.15em] text-[var(--darkroom-text-dim)]">
                Status
              </span>
              <span className={cn(
                "text-[11px] font-mono uppercase tracking-wider",
                isGenerating 
                  ? "text-[var(--led-active)]" 
                  : heroImage 
                    ? "text-[var(--led-ready)]" 
                    : "text-[var(--darkroom-text-muted)]"
              )}>
                {isGenerating ? "Capturing" : heroImage ? "Ready" : "Standby"}
              </span>
            </div>
          </div>
        </div>
        
        {/* Frame Counter - Top Right Corner */}
        <div className="absolute top-4 right-4 z-10">
          <div className="px-3 py-2 rounded-lg bg-black/60 backdrop-blur-sm border border-[var(--darkroom-border)]">
            <span className="text-[9px] font-mono uppercase tracking-[0.15em] text-[var(--darkroom-text-dim)] block mb-0.5">
              Frames
            </span>
            <span className="text-[14px] font-mono font-bold tracking-wider">
              <span className="text-[var(--led-ready)]">{images.length}</span>
              <span className="text-[var(--darkroom-text-dim)]">/</span>
              <span className="text-[var(--darkroom-text-muted)]">{maxImages}</span>
            </span>
          </div>
        </div>
        
        <AnimatePresence mode="wait">
          {isGenerating ? (
            <GeneratingState key="generating" />
          ) : heroImage ? (
            <ImageReveal
              key={heroImage.id}
              image={heroImage}
              onSave={() => onSaveImage(heroImage.id)}
              onDownload={() => onDownloadImage(heroImage)}
              onRefine={() => onRefineImage(heroImage)}
              isSaving={isSaving}
              isNewlyGenerated={heroImage.id === newlyGeneratedId}
            />
          ) : (
            <EmptyState key="empty" />
          )}
        </AnimatePresence>
      </div>

      {/* Film Strip Thumbnail Carousel */}
      <ThumbnailCarousel
        images={images}
        activeId={heroImage?.id || null}
        onSelect={onSetHero}
        onSave={onSaveImage}
        onDelete={onDeleteImage}
        maxSlots={maxImages}
      />

      {/* Prompt Bar - Compact Freepik-style */}
      <div className={cn("prompt-bar", isFocused && "focused")}>
        {/* Mode Toggle Pills */}
        <div className="prompt-bar__mode-pills">
          <button
            type="button"
            className={cn("prompt-bar__mode-pill", activeMode === "prompt" && "active")}
            onClick={() => setActiveMode("prompt")}
          >
            Prompt
          </button>
          <button
            type="button"
            className="prompt-bar__mode-pill"
            disabled
            title="Coming soon"
          >
            Visual
          </button>
        </div>

        <div className="prompt-bar__input-container">
          {/* Attachment icon (placeholder) */}
          <button
            type="button"
            className="prompt-bar__attachment"
            disabled
            title="Attach image (coming soon)"
          >
            <Paperclip size={15} />
          </button>

          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => {
              onPromptChange(e.target.value);
              resizeTextarea();
            }}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={handleKeyDown}
            placeholder="What do you want to change?"
            className="prompt-input"
            disabled={isGenerating}
            rows={1}
          />

          {/* Inline Pro Badge */}
          {proSettingsCount > 0 && (
            <motion.span
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="prompt-bar__pro-badge"
            >
              Pro·{proSettingsCount}
            </motion.span>
          )}

          <motion.button
            type="button"
            className="prompt-submit"
            onClick={onGenerate}
            disabled={!canGenerate || isGenerating || images.length >= maxImages}
            whileHover={canGenerate ? { scale: 1.05 } : {}}
            whileTap={canGenerate ? { scale: 0.95 } : {}}
          >
            {isGenerating ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <ArrowUp size={16} />
            )}
          </motion.button>
        </div>
      </div>
    </section>
  );
}
