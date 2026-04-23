import { useState, useMemo, useRef } from "react";
import { ImageLibraryModal } from "@/components/image-editor/ImageLibraryModal";
import { motion, AnimatePresence } from "framer-motion";
import {
  Lightbulb,
  Clock,
  ArrowRight,
  Wand2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Palette,
  History,
  Zap,
  RefreshCw,
  X,
  SlidersHorizontal,
  Cpu,
  Camera,
  Sun,
  Globe,
  Maximize2,
  Aperture,
  Plus,
  ImagePlus,
  Layers,
  Sparkles,
} from "lucide-react";
import {
  LEDIndicator,
  ModeDialButton,
  FirmwarePresetButton,
  type LEDState
} from "./LEDIndicator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { DEFAULT_IMAGE_AI_PROVIDER } from "@/config/imageSettings";
import { toast } from "sonner";
import type { ProModeSettings } from "./ProSettings";
import {
  getCameraOptions,
  getLightingOptions,
  getEnvironmentOptions,
} from "@/utils/promptFormula";
import {
  AI_MODEL_OPTIONS,
  COMMON_ASPECT_RATIOS,
  IMAGE_GEN_RESOLUTION_OPTIONS,
  VISUAL_SQUADS,
  type VisualSquad,
} from "@/config/imageSettings";
import { ConsistencyModePanel } from "./ConsistencyMode";

interface Suggestion {
  id: string;
  text: string;
  type: "enhancement" | "variation" | "creative";
}

interface HistoryItem {
  id: string;
  prompt: string;
  timestamp: Date;
}

interface ProductSlot {
  id: string;
  imageUrl: string | null;
  name?: string;
}

// Aspect ratios are read directly from COMMON_ASPECT_RATIOS where needed.

// ═══════════════════════════════════════════════════════════════════════════════
// BACKGROUND PRESETS - E-commerce Best Practice Styles
// ═══════════════════════════════════════════════════════════════════════════════
// These are curated background styles based on high-performing e-commerce photography.
// Each preset has multiple variations that are randomly selected for visual diversity.

export interface BackgroundPreset {
  id: string;
  label: string;
  icon: string; // Emoji for quick visual recognition
  description: string;
  variations: string[]; // Multiple prompt variations for diversity
}

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  {
    id: "studio-clean",
    label: "Studio Clean",
    icon: "⬜",
    description: "Pure white/neutral backdrop",
    variations: [
      "clean white studio backdrop, professional product photography, soft even lighting, no shadows",
      "pure white infinity curve background, commercial studio setup, diffused overhead lighting",
      "minimalist white cyclorama, high-key photography, clean and bright, professional e-commerce",
      "crisp white seamless paper backdrop, soft natural light from windows, no distractions",
    ],
  },
  {
    id: "natural-stone",
    label: "Natural Stone",
    icon: "🪨",
    description: "Sandstone, marble, slate textures",
    variations: [
      "warm sandstone surface with natural texture, soft directional light casting gentle shadow",
      "polished white marble surface with subtle grey veining, elegant and minimal",
      "raw concrete slab background with industrial texture, modern minimalist aesthetic",
      "natural travertine stone surface, warm cream tones, organic texture, sophisticated",
      "grey slate tile background with subtle texture, cool neutral tones, contemporary",
      "beige limestone surface, smooth natural stone, warm ambient lighting",
    ],
  },
  {
    id: "organic-props",
    label: "Organic Props",
    icon: "🌿",
    description: "Plants, botanicals, natural elements",
    variations: [
      "neutral backdrop with single eucalyptus branch, soft shadow play, minimal elegant styling",
      "dried pampas grass arrangement on cream background, soft natural light, bohemian refined",
      "fresh green leaf accent on white surface, clean botanical styling, natural shadow",
      "subtle dried flower petals scattered on linen, romantic soft aesthetic, diffused light",
      "olive branch with small leaves on stone surface, Mediterranean elegance, warm tones",
      "simple succulent in corner, white background, modern minimal plant styling",
    ],
  },
  {
    id: "luxury-material",
    label: "Luxury Surface",
    icon: "✨",
    description: "Velvet, silk, premium textures",
    variations: [
      "deep charcoal velvet fabric surface, luxurious texture, dramatic side lighting",
      "cream silk fabric backdrop with gentle folds, soft diffused lighting, romantic",
      "black matte leather surface, premium texture, professional product showcase",
      "ivory linen texture background, natural woven pattern, soft warm lighting",
      "champagne satin fabric backdrop, elegant reflective surface, sophisticated",
      "dusty rose velvet surface, rich jewel tone, warm intimate lighting",
    ],
  },
  {
    id: "warm-wood",
    label: "Warm Wood",
    icon: "🪵",
    description: "Natural wood grains and textures",
    variations: [
      "light oak wood surface with natural grain, warm Scandinavian aesthetic, soft lighting",
      "rich walnut wood backdrop, dark luxurious grain, warm directional light",
      "weathered driftwood surface, coastal organic texture, natural soft tones",
      "blonde maple wood surface, clean minimal, bright contemporary styling",
      "reclaimed wood plank background, rustic charm, warm golden hour lighting",
      "dark ebony wood surface, dramatic contrast, luxury Japanese aesthetic",
    ],
  },
  {
    id: "shadow-play",
    label: "Shadow Play",
    icon: "🌤️",
    description: "Dramatic window light & shadows",
    variations: [
      "white surface with dramatic window blind shadows, golden hour light streaming in",
      "neutral backdrop with plant leaf shadows cast across, dappled natural light",
      "cream background with venetian blind shadow stripes, warm afternoon sun",
      "pale grey surface with soft diagonal shadow lines, architectural light play",
      "white wall with eucalyptus shadow silhouette, morning light, organic patterns",
      "light background with geometric shadow patterns from window frame, modern artistic",
    ],
  },
];

// Helper to get a random variation from a preset
export function getRandomBackgroundVariation(presetId: string): string {
  const preset = BACKGROUND_PRESETS.find(p => p.id === presetId);
  if (!preset) return "";
  const randomIndex = Math.floor(Math.random() * preset.variations.length);
  return preset.variations[randomIndex];
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPOSITION PRESETS - How to arrange products in the scene
// ═══════════════════════════════════════════════════════════════════════════════
// These define HOW products should be placed in the background/scene.
// Works with 1-6 products - the AI adapts the arrangement to the product count.

export interface CompositionPreset {
  id: string;
  label: string;
  icon: string;
  description: string;
  // Prompt instructions for the AI - describes arrangement style
  singleProduct: string; // For 1 product
  multiProduct: string;  // For 2-6 products
}

export const COMPOSITION_PRESETS: CompositionPreset[] = [
  {
    id: "hero-center",
    label: "Hero Center",
    icon: "🎯",
    description: "Product as the star, front & center",
    singleProduct: "Place the product prominently in the center of the frame as the hero subject. The product should dominate the composition, perfectly centered with the background scene framing it. Create visual focus on the product with professional product photography composition.",
    multiProduct: "Arrange all products in a centered hero composition. The largest or primary product should be in the center-front, with other products artistically grouped around it. Create a cohesive product family shot with all items clearly visible and the group centered in the frame.",
  },
  {
    id: "rule-of-thirds",
    label: "Rule of Thirds",
    icon: "📐",
    description: "Classic photography composition",
    singleProduct: "Position the product at one of the rule-of-thirds intersection points, allowing the background to breathe and create visual interest. Use negative space intentionally for an editorial, magazine-quality composition.",
    multiProduct: "Arrange products along the rule-of-thirds grid lines. Place the primary product at a power point intersection, with supporting products creating visual flow across the frame. Balance the composition with intentional negative space.",
  },
  {
    id: "diagonal-flow",
    label: "Dynamic Diagonal",
    icon: "↗️",
    description: "Energetic, flowing arrangement",
    singleProduct: "Position the product along a diagonal line from corner to corner, creating dynamic visual energy. Angle the product slightly to follow the diagonal, suggesting movement and sophistication.",
    multiProduct: "Arrange products along a diagonal line flowing from one corner toward the opposite. Vary heights and sizes to create a cascading effect. Products should overlap slightly where natural, creating depth and visual rhythm along the diagonal.",
  },
  {
    id: "pyramid",
    label: "Pyramid Stack",
    icon: "🔺",
    description: "Tiered height arrangement",
    singleProduct: "Place the product on an elevated surface or use camera angle to create a sense of importance and hierarchy. The product should feel elevated and prestigious.",
    multiProduct: "Arrange products in a pyramid formation - tallest in the back-center, medium heights on the sides, smallest in front. Create depth with overlapping products and varying distances from camera. This classic still-life arrangement showcases the entire product range.",
  },
  {
    id: "scattered-organic",
    label: "Organic Scatter",
    icon: "🍃",
    description: "Natural, effortless arrangement",
    singleProduct: "Place the product in a natural, slightly off-center position that feels discovered rather than staged. Let it interact organically with the background elements, as if photographed in its natural habitat.",
    multiProduct: "Scatter products organically across the scene in a natural, unstaged arrangement. Products should feel casually but intentionally placed, as if discovered in a lifestyle moment. Vary angles and orientations for authenticity. Some products can be lying down, others upright.",
  },
  {
    id: "tight-group",
    label: "Intimate Group",
    icon: "🤝",
    description: "Products close together, touching",
    singleProduct: "Frame the product tightly in the composition, filling more of the frame for an intimate, detailed view. The background becomes secondary, with focus on product details.",
    multiProduct: "Group all products closely together, allowing them to touch or nearly touch. Create an intimate product family portrait where the products relate to each other. This tight composition emphasizes that they belong together as a collection or set.",
  },
];

// Helper to get composition prompt based on product count
export function getCompositionPrompt(presetId: string, productCount: number): string {
  const preset = COMPOSITION_PRESETS.find(p => p.id === presetId);
  if (!preset) return "";
  return productCount === 1 ? preset.singleProduct : preset.multiProduct;
}

type RightPanelTab = "madison" | "settings" | "consistency";

interface RightPanelProps {
  // Suggestions based on context
  suggestions: Suggestion[];
  onUseSuggestion: (suggestion: Suggestion) => void;

  // Quick presets
  presets: string[];
  onApplyPreset: (preset: string) => void;

  // Session history
  history: HistoryItem[];
  onRestoreFromHistory: (item: HistoryItem) => void;


  // Context info
  hasProduct: boolean;
  hasBackground: boolean;
  hasStyle: boolean;
  proSettingsCount: number;

  // Pro Settings (NEW)
  proSettings?: ProModeSettings;
  onProSettingsChange?: (settings: ProModeSettings) => void;
  isGenerating?: boolean;

  // Multi-product slots for compositing
  productSlots?: ProductSlot[];
  onProductSlotsChange?: (slots: ProductSlot[]) => void;

  // Background preset selection
  selectedBackgroundPreset?: string | null;
  onBackgroundPresetChange?: (presetId: string | null) => void;

  // Composition preset selection (how to arrange products)
  selectedCompositionPreset?: string | null;
  onCompositionPresetChange?: (presetId: string | null) => void;

  // Consistency Mode — bulk variation generation from a master reference
  sessionId?: string;
  organizationId?: string | null;
  userId?: string | null;
}

// Quick Preset Button
function QuickPreset({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      className="preset-button"
      onClick={onClick}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      {label}
    </motion.button>
  );
}

// Suggestion Card
function SuggestionCard({
  suggestion,
  onUse,
}: {
  suggestion: Suggestion;
  onUse: () => void;
}) {
  const typeConfig = {
    enhancement: { icon: Zap, label: "Enhancement" },
    variation: { icon: RefreshCw, label: "Variation" },
    creative: { icon: Lightbulb, label: "Creative" },
  };

  const config = typeConfig[suggestion.type];
  const IconComponent = config.icon;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(suggestion.text);
    toast.success("Copied to clipboard");
  };

  return (
    <motion.div
      className="suggestion-card"
      onClick={onUse}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      whileHover={{ scale: 1.01 }}
    >
      <div className="flex items-center gap-2 mb-2">
        <IconComponent className="w-3.5 h-3.5 text-[var(--darkroom-accent)]" />
        <span className="text-xs font-medium text-[var(--darkroom-text-muted)]">
          {config.label}
        </span>
      </div>
      <p className="suggestion-card__text">{suggestion.text}</p>
      <div className="suggestion-card__actions">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs text-[var(--darkroom-accent)] hover:bg-[var(--darkroom-accent)]/10"
          onClick={(e) => {
            e.stopPropagation();
            onUse();
          }}
        >
          <ArrowRight className="w-3 h-3 mr-1" />
          Use this
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs text-[var(--darkroom-text-muted)] hover:text-[var(--darkroom-text)]"
          onClick={handleCopy}
        >
          <Copy className="w-3 h-3 mr-1" />
          Copy
        </Button>
      </div>
    </motion.div>
  );
}

// Style References Section - Lens/Filter Treatment
// Treated like adding a lens or filter to the camera
// Minimal affordance, subtle focus glow, no "dropzone UI clichés"
function StyleReferencesSection({ onApplyStyle }: { onApplyStyle: (style: string) => void }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [styleImages, setStyleImages] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          if (ev.target?.result) {
            setStyleImages(prev => [...prev.slice(-3), ev.target!.result as string]);
            toast.success("Style filter attached");
          }
        };
        reader.readAsDataURL(file);
      });
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeImage = (index: number) => {
    setStyleImages(prev => prev.filter((_, i) => i !== index));
    toast.success("Style filter removed");
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      Array.from(files).forEach(file => {
        if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            if (ev.target?.result) {
              setStyleImages(prev => [...prev.slice(-3), ev.target!.result as string]);
              toast.success("Style filter attached");
            }
          };
          reader.readAsDataURL(file);
        }
      });
    }
  };

  return (
    <div className="camera-panel mb-3">
      <button
        className="w-full flex items-center justify-between p-3 border-b border-white/5"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <LEDIndicator state={styleImages.length > 0 ? "ready" : "off"} size="sm" />
          <Palette className="w-3.5 h-3.5 text-[var(--darkroom-accent)]" />
          <span className="text-[10px] font-medium text-[var(--darkroom-text-muted)] uppercase tracking-wider">Style Filter</span>
          {styleImages.length > 0 && (
            <Badge
              variant="outline"
              className="ml-1 bg-transparent text-[var(--darkroom-text-muted)] border-white/[0.12] text-[9px] px-1.5 py-0"
            >
              {styleImages.length} attached
            </Badge>
          )}
        </div>
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="w-3.5 h-3.5 text-[var(--darkroom-text-muted)]" />
        </motion.div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-3">
              {/* Style Image Grid - Lens filter appearance */}
              {styleImages.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {styleImages.map((img, idx) => (
                    <div key={idx} className="style-image-thumb group">
                      <img src={img} alt={`Style filter ${idx + 1}`} />
                      <button
                        onClick={() => removeImage(idx)}
                        className="style-image-remove"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload Zone - Lens mount feel */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
              <div
                className={cn(
                  "style-reference-zone",
                  isDragging && "style-reference-zone--dragging",
                  styleImages.length > 0 && "style-reference-zone--active"
                )}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="style-upload-mount">
                  <Palette className="style-upload-mount__icon" />
                  <span className="style-upload-mount__text">
                    {styleImages.length > 0
                      ? "Attach another filter"
                      : "Attach style reference"}
                  </span>
                  <span className="style-upload-mount__subtext">
                    Influences lighting & composition
                  </span>
                </div>
              </div>

              {/* Quick Style Presets */}
              {styleImages.length === 0 && (
                <div className="mt-3 pt-3 border-t border-white/5">
                  <span className="text-[9px] text-[var(--darkroom-text-dim)] uppercase tracking-wider block mb-2">Quick Filters</span>
                  <div className="flex flex-wrap gap-1.5">
                    {["Minimalist", "Editorial", "Rustic", "Luxe"].map(style => (
                      <button
                        key={style}
                        onClick={(e) => {
                          e.stopPropagation();
                          onApplyStyle(`${style} style`);
                        }}
                        className="px-2.5 py-1.5 rounded text-[10px] bg-[var(--camera-body)] border border-white/5 hover:border-white/15 text-[var(--darkroom-text-muted)] transition-all hover:text-[var(--darkroom-text)]"
                      >
                        {style}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Format time ago helper
function formatTimeAgo(date: Date): string {
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function RightPanel({
  suggestions,
  onUseSuggestion,
  presets,
  onApplyPreset,
  history,
  onRestoreFromHistory,
  hasProduct,
  hasBackground,
  hasStyle,
  proSettingsCount,
  proSettings,
  onProSettingsChange,
  isGenerating = false,
  productSlots,
  onProductSlotsChange,
  selectedBackgroundPreset,
  onBackgroundPresetChange,
  selectedCompositionPreset,
  onCompositionPresetChange,
  sessionId,
  organizationId,
  userId,
}: RightPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [activeTab, setActiveTab] = useState<RightPanelTab>("madison");
  const [activeSlotIndex, setActiveSlotIndex] = useState<number | null>(null);

  // Get photography options
  const cameraOptions = getCameraOptions();
  const lightingOptions = getLightingOptions();
  const environmentOptions = getEnvironmentOptions();

  // Handle settings change
  const handleSettingChange = (key: keyof ProModeSettings, value: string | undefined) => {
    if (onProSettingsChange && proSettings) {
      onProSettingsChange({ ...proSettings, [key]: value });
    }
  };

  /** Shown on Madison and Settings so model choice isn’t hidden behind Settings only. */
  const aiModelAndResolutionSection =
    proSettings && onProSettingsChange ? (
      <>
        <div className="camera-panel p-2.5 space-y-2">
          <div className="flex items-center gap-1.5">
            <LEDIndicator
              state={proSettings.aiProvider && proSettings.aiProvider !== DEFAULT_IMAGE_AI_PROVIDER ? "active" : "ready"}
              size="sm"
            />
            <Cpu className="w-3 h-3 text-[var(--darkroom-accent)]" />
            <span className="text-[11px] font-medium text-[var(--darkroom-text)]">AI Model</span>
          </div>
          <Select
            value={proSettings.aiProvider || DEFAULT_IMAGE_AI_PROVIDER}
            onValueChange={(v) => handleSettingChange("aiProvider", v)}
            disabled={isGenerating}
          >
            <SelectTrigger className="w-full h-8 bg-[var(--camera-body-deep)] border-white/[0.06] text-[var(--darkroom-text)] text-[11px] rounded">
              <SelectValue placeholder="Select model..." />
            </SelectTrigger>
            <SelectContent className="bg-[var(--darkroom-surface)] border-[var(--darkroom-border)] max-h-[280px]">
              {AI_MODEL_OPTIONS.map((option, idx) => {
                const prevOption = idx > 0 ? AI_MODEL_OPTIONS[idx - 1] : null;
                const showGroupHeader = !prevOption || prevOption.group !== option.group;
                const groupLabels: Record<string, string> = {
                  gemini: "Google Gemini",
                  openai: "OpenAI",
                  freepik: "Freepik Models",
                };

                return (
                  <div key={option.value}>
                    {showGroupHeader && option.group !== "auto" && (
                      <div className="px-2 py-1 text-[9px] uppercase tracking-wider text-[var(--darkroom-text-dim)] font-medium border-t border-[var(--darkroom-border)] mt-1 first:mt-0 first:border-t-0">
                        {groupLabels[option.group] || option.group}
                      </div>
                    )}
                    <SelectItem value={option.value} className="text-[var(--darkroom-text)] text-[11px]">
                      <span className="flex items-center gap-1.5">
                        <span>{option.label}</span>
                        {option.badge && (
                          <span className={cn(
                            "text-[8px] px-1 py-0.5 rounded font-medium",
                            option.badge === "BEST" && "bg-purple-500/20 text-purple-400",
                            option.badge === "FREE" && "bg-emerald-500/20 text-emerald-400",
                            option.badge === "DEFAULT" && "bg-white/10 text-[var(--darkroom-text-muted)]",
                            option.badge === "NEW" && "bg-emerald-500/20 text-emerald-400",
                            option.badge === "FAST" && "bg-cyan-500/20 text-cyan-400",
                            option.badge === "4K" && "bg-amber-500/20 text-amber-400",
                            option.badge === "POPULAR" && "bg-blue-500/20 text-blue-400"
                          )}>
                            {option.badge}
                          </span>
                        )}
                      </span>
                    </SelectItem>
                  </div>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <div className="camera-panel p-2.5 space-y-2">
          <div className="flex items-center gap-1.5">
            <LEDIndicator
              state={proSettings.resolution && proSettings.resolution !== "standard" ? "active" : "off"}
              size="sm"
            />
            <Maximize2 className="w-3 h-3 text-[var(--darkroom-accent)]" />
            <span className="text-[11px] font-medium text-[var(--darkroom-text)]">Resolution</span>
          </div>
          <div className="flex gap-1">
            {IMAGE_GEN_RESOLUTION_OPTIONS.map((option) => {
              const isSelected = proSettings.resolution === option.value ||
                (!proSettings.resolution && option.value === "standard");

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleSettingChange("resolution", option.value)}
                  disabled={isGenerating}
                  className={cn(
                    "flex-1 py-2 px-1.5 rounded transition-all text-center border",
                    isSelected
                      ? "bg-white/[0.06] border-white/[0.12]"
                      : "bg-[var(--camera-body-deep)] border-white/[0.04] hover:border-white/[0.08]"
                  )}
                >
                  <span className={cn(
                    "text-[11px] font-medium block",
                    isSelected ? "text-[var(--darkroom-text)]" : "text-[var(--darkroom-text-muted)]"
                  )}>
                    {option.label}
                  </span>
                  {option.badge && (
                    <span className="text-[9px] text-purple-400 block">{option.badge}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </>
    ) : null;

  // Generate context-aware tips
  const contextTips = [];
  if (!hasProduct) {
    contextTips.push("Upload a product image for enhancement suggestions");
  }
  if (hasProduct && !hasBackground) {
    contextTips.push("Try adding a background scene for composition");
  }
  if (hasProduct && hasBackground && !hasStyle) {
    contextTips.push("Add a style reference for matching lighting");
  }
  if (proSettingsCount === 0) {
    contextTips.push("Enable Pro Settings for camera & lighting control");
  }

  return (
    <>
      {/* Collapsed Toggle Button */}
      <AnimatePresence>
        {isCollapsed && (
          <motion.button
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="madison-drawer-toggle madison-drawer-toggle--collapsed"
            onClick={() => setIsCollapsed(false)}
            title="Open Madison Assistant"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="madison-drawer-toggle__label">Madison</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Drawer Panel */}
      <motion.aside
        className={cn("right-panel", isCollapsed && "right-panel--collapsed")}
        initial={false}
        animate={{
          width: isCollapsed ? 0 : "auto",
          opacity: isCollapsed ? 0 : 1,
        }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
      >
        {/* Header with Tabs - Tight firmware style */}
        <div className="relative px-2 py-1.5 border-b border-[var(--darkroom-border)] bg-[var(--camera-body)]">
          {/* Subtle top highlight */}
          <div className="absolute top-0 left-0 right-0 h-px bg-white/[0.04]" />

          <div className="relative flex items-center gap-1">
            {/* Collapse button - Left side */}
            <button
              className="w-7 h-7 flex items-center justify-center rounded bg-black/20 border border-white/[0.04] text-[var(--darkroom-text-dim)] hover:text-[var(--darkroom-text)] hover:bg-white/5 transition-colors"
              onClick={() => setIsCollapsed(true)}
              title="Collapse panel"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

            {/* Tab Buttons - Compact firmware style */}
            <div className="flex-1 flex gap-0.5 p-0.5 rounded bg-black/20 border border-white/[0.04]">
              <button
                onClick={() => setActiveTab("madison")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-[11px] font-mono uppercase tracking-wide transition-all",
                  activeTab === "madison"
                    ? "bg-[var(--camera-body)] text-[var(--darkroom-accent)] border border-[var(--darkroom-accent)]/20"
                    : "text-[var(--darkroom-text-dim)] hover:text-[var(--darkroom-text-muted)] hover:bg-white/[0.03]"
                )}
              >
                <Wand2 className="w-3 h-3" />
                Madison
              </button>
              <button
                onClick={() => setActiveTab("settings")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-[11px] font-mono uppercase tracking-wide transition-all",
                  activeTab === "settings"
                    ? "bg-[var(--camera-body)] text-[var(--darkroom-accent)] border border-[var(--darkroom-accent)]/20"
                    : "text-[var(--darkroom-text-dim)] hover:text-[var(--darkroom-text-muted)] hover:bg-white/[0.03]"
                )}
              >
                <SlidersHorizontal className="w-3 h-3" />
                Settings
              </button>
              <button
                onClick={() => setActiveTab("consistency")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-[11px] font-mono uppercase tracking-wide transition-all",
                  activeTab === "consistency"
                    ? "bg-[var(--camera-body)] text-[var(--darkroom-accent)] border border-[var(--darkroom-accent)]/20"
                    : "text-[var(--darkroom-text-dim)] hover:text-[var(--darkroom-text-muted)] hover:bg-white/[0.03]"
                )}
                title="Bulk variation generation — lock background, vary bottle / cap / fitment"
              >
                <Layers className="w-3 h-3" />
                Set
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="right-panel__content">

          {/* === SETTINGS TAB - Compact Firmware Layout === */}
          {activeTab === "settings" && proSettings && onProSettingsChange && (
            <div className="space-y-2">
              {/* Status Header */}
              <div className="camera-panel">
                <div className="flex items-center justify-between p-2.5">
                  <div className="flex items-center gap-2">
                    <LEDIndicator
                      state={isGenerating ? "processing" : Object.values(proSettings).filter(Boolean).length > 0 ? "ready" : "off"}
                      size="sm"
                    />
                    <div>
                      <span className="text-[11px] font-medium text-[var(--darkroom-text)] block">
                        {isGenerating ? "Processing..." : `${Object.values(proSettings).filter(Boolean).length} Active`}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => onProSettingsChange({
                      aiProvider: "auto",
                      resolution: "standard",
                      aspectRatio: "1:1",
                      camera: undefined,
                      lighting: undefined,
                      environment: undefined,
                      characterId: undefined,
                    })}
                    className="text-[10px] text-[var(--darkroom-text-dim)] hover:text-[var(--led-error)] font-medium flex items-center gap-1 px-2 py-1 rounded hover:bg-white/5 transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Reset
                  </button>
                </div>
              </div>

              {aiModelAndResolutionSection}

              {/* Aspect ratio lives in the Madison tab (primary / always-open
                  view). Duplicating it here previously let users set
                  different values in two places. */}

              {/* Pro Controls - Collapsible */}
              <div className="camera-panel">
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="w-full flex items-center justify-between p-2.5"
                >
                  <div className="flex items-center gap-1.5">
                    <LEDIndicator
                      state={proSettings.camera || proSettings.lighting || proSettings.environment ? "active" : "off"}
                      size="sm"
                    />
                    <Camera className="w-3 h-3 text-[var(--darkroom-accent)]" />
                    <span className="text-[11px] font-medium text-[var(--darkroom-text)]">Pro Controls</span>
                  </div>
                  <motion.div
                    animate={{ rotate: showHistory ? 180 : 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <ChevronDown className="w-3.5 h-3.5 text-[var(--darkroom-text-dim)]" />
                  </motion.div>
                </button>

                <AnimatePresence>
                  {showHistory && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="overflow-hidden"
                    >
                      <div className="px-2.5 pb-2.5 space-y-2 border-t border-white/[0.04] pt-2">
                        {/* Camera */}
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <Camera className="w-3 h-3 text-[var(--darkroom-text-dim)]" />
                            <span className="text-[10px] text-[var(--darkroom-text-muted)]">Camera Style</span>
                          </div>
                          <Select
                            value={proSettings.camera || "none"}
                            onValueChange={(v) => handleSettingChange("camera", v === "none" ? undefined : v)}
                            disabled={isGenerating}
                          >
                            <SelectTrigger className="w-full h-7 bg-[var(--camera-body-deep)] border-white/[0.06] text-[var(--darkroom-text)] text-[10px] rounded">
                              <SelectValue placeholder="No camera style" />
                            </SelectTrigger>
                            <SelectContent className="bg-[var(--darkroom-surface)] border-[var(--darkroom-border)] max-h-[200px]">
                              <SelectItem value="none" className="text-[var(--darkroom-text)] text-[11px]">No camera style</SelectItem>
                              {cameraOptions.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value} className="text-[var(--darkroom-text)] text-[11px]">
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Lighting */}
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <Sun className="w-3 h-3 text-[var(--darkroom-text-dim)]" />
                            <span className="text-[10px] text-[var(--darkroom-text-muted)]">Lighting</span>
                          </div>
                          <Select
                            value={proSettings.lighting || "none"}
                            onValueChange={(v) => handleSettingChange("lighting", v === "none" ? undefined : v)}
                            disabled={isGenerating}
                          >
                            <SelectTrigger className="w-full h-7 bg-[var(--camera-body-deep)] border-white/[0.06] text-[var(--darkroom-text)] text-[10px] rounded">
                              <SelectValue placeholder="No lighting style" />
                            </SelectTrigger>
                            <SelectContent className="bg-[var(--darkroom-surface)] border-[var(--darkroom-border)] max-h-[200px]">
                              <SelectItem value="none" className="text-[var(--darkroom-text)] text-[11px]">No lighting style</SelectItem>
                              {lightingOptions.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value} className="text-[var(--darkroom-text)] text-[11px]">
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Environment */}
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <Globe className="w-3 h-3 text-[var(--darkroom-text-dim)]" />
                            <span className="text-[10px] text-[var(--darkroom-text-muted)]">Environment</span>
                          </div>
                          <Select
                            value={proSettings.environment || "none"}
                            onValueChange={(v) => handleSettingChange("environment", v === "none" ? undefined : v)}
                            disabled={isGenerating}
                          >
                            <SelectTrigger className="w-full h-7 bg-[var(--camera-body-deep)] border-white/[0.06] text-[var(--darkroom-text)] text-[10px] rounded">
                              <SelectValue placeholder="No environment" />
                            </SelectTrigger>
                            <SelectContent className="bg-[var(--darkroom-surface)] border-[var(--darkroom-border)] max-h-[200px]">
                              <SelectItem value="none" className="text-[var(--darkroom-text)] text-[11px]">No environment</SelectItem>
                              {environmentOptions.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value} className="text-[var(--darkroom-text)] text-[11px]">
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Visual Style */}
              <div className="camera-panel p-2.5 space-y-2">
                <div className="flex items-center gap-1.5">
                  <LEDIndicator state={proSettings.visualSquad ? "active" : "ready"} size="sm" />
                  <Palette className="w-3 h-3 text-[var(--darkroom-accent)]" />
                  <span className="text-[11px] font-medium text-[var(--darkroom-text)]">Visual Style</span>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <button
                    onClick={() => handleSettingChange("visualSquad", undefined)}
                    disabled={isGenerating}
                    className={cn(
                      "py-1.5 px-1.5 rounded text-[10px] transition-all text-center border",
                      !proSettings.visualSquad
                        ? "bg-white/[0.06] border-white/[0.12] text-[var(--darkroom-text)] font-medium"
                        : "bg-[var(--camera-body-deep)] border-white/[0.04] text-[var(--darkroom-text-muted)] hover:border-white/[0.08]"
                    )}
                  >
                    Auto
                  </button>
                  {VISUAL_SQUADS.map((squad) => (
                    <button
                      key={squad.value}
                      onClick={() => handleSettingChange("visualSquad", squad.value)}
                      disabled={isGenerating}
                      className={cn(
                        "py-1.5 px-1.5 rounded text-[10px] transition-all text-center border",
                        proSettings.visualSquad === squad.value
                          ? "bg-[var(--led-active)]/10 border-[var(--led-active)]/30 text-[var(--led-active)] font-medium"
                          : "bg-[var(--camera-body-deep)] border-white/[0.04] text-[var(--darkroom-text-muted)] hover:border-white/[0.08]"
                      )}
                    >
                      {squad.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* === MADISON TAB - Multi-Product & Aspect Ratio === */}
          {activeTab === "madison" && (
            <div className="space-y-2">
              {aiModelAndResolutionSection}

              {/* Context Tips - "Madison's Thoughts" */}
              {contextTips.length > 0 && (
                <div className="camera-panel p-2.5 space-y-2 border-l-2 border-l-[var(--darkroom-accent)]">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Wand2 className="w-3 h-3 text-[var(--darkroom-accent)]" />
                    <span className="text-[11px] font-medium text-[var(--darkroom-text)]">Madison's Notes</span>
                  </div>
                  <div className="space-y-1">
                    {contextTips.map((tip, i) => (
                      <p key={i} className="text-[10px] text-[var(--darkroom-text-muted)] leading-relaxed">
                        "{tip}"
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {/* Generated Suggestions */}
              {suggestions.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[9px] text-[var(--darkroom-text-dim)] uppercase tracking-wider px-1">Creative Suggestions</span>
                  {suggestions.map((suggestion) => (
                    <SuggestionCard
                      key={suggestion.id}
                      suggestion={suggestion}
                      onUse={() => onUseSuggestion(suggestion)}
                    />
                  ))}
                </div>
              )}

              {/* Multi-Product Upload Grid */}
              <div className="camera-panel p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <LEDIndicator
                      state={productSlots?.some(s => s.imageUrl) ? "active" : "ready"}
                      size="sm"
                    />
                    <Layers className="w-3 h-3 text-[var(--darkroom-accent)]" />
                    <span className="text-[11px] font-medium text-[var(--darkroom-text)]">Product Slots</span>
                  </div>
                  <span className="text-[9px] font-mono text-[var(--darkroom-text-dim)]">
                    {productSlots?.filter(s => s.imageUrl).length || 0}/6
                  </span>
                </div>

                {/* 3x2 Grid of Drop Zones */}
                <div className="grid grid-cols-3 gap-1.5">
                  {Array.from({ length: 6 }).map((_, index) => {
                    const slot = productSlots?.[index];
                    const hasImage = slot?.imageUrl;

                    const handleRemove = (e: React.MouseEvent) => {
                      e.stopPropagation();
                      if (onProductSlotsChange && productSlots) {
                        const newSlots = [...productSlots];
                        newSlots[index] = { id: slot?.id || `slot-${index}`, imageUrl: null };
                        onProductSlotsChange(newSlots);
                        toast.success(`Product ${index + 1} removed`);
                      }
                    };

                    return (
                      <div key={index} className="relative">
                        <motion.button
                          type="button"
                          onClick={() => !hasImage && setActiveSlotIndex(index)}
                          className={cn(
                            "aspect-square w-full rounded flex items-center justify-center cursor-pointer transition-all border overflow-hidden",
                            hasImage
                              ? "border-white/[0.12] bg-black"
                              : "border-dashed border-white/[0.06] bg-[var(--camera-body-deep)] hover:border-white/[0.12] hover:bg-white/[0.03]"
                          )}
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                        >
                          {hasImage ? (
                            <img
                              src={slot.imageUrl!}
                              alt={`Product ${index + 1}`}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex flex-col items-center gap-0.5">
                              <Plus className="w-3 h-3 text-[var(--darkroom-text-dim)]" />
                              <span className="text-[8px] font-mono text-[var(--darkroom-text-dim)]">{index + 1}</span>
                            </div>
                          )}
                        </motion.button>

                        {/* Remove button */}
                        {hasImage && (
                          <motion.button
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            onClick={handleRemove}
                            className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-[var(--led-error)] text-white flex items-center justify-center hover:bg-red-500 transition-colors z-10"
                          >
                            <X className="w-2.5 h-2.5" />
                          </motion.button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Helper text */}
                <p className="text-[9px] text-[var(--darkroom-text-dim)]">
                  Add products to composite into scenes
                </p>
              </div>

              {/* Image Library Modal for product slots */}
              <ImageLibraryModal
                open={activeSlotIndex !== null}
                onOpenChange={(open) => { if (!open) setActiveSlotIndex(null); }}
                title={activeSlotIndex !== null ? `Product Slot ${activeSlotIndex + 1}` : "Select Image"}
                onSelectImage={(image) => {
                  if (activeSlotIndex === null || !onProductSlotsChange) return;
                  const newSlots = [...(productSlots || [])];
                  while (newSlots.length <= activeSlotIndex) {
                    newSlots.push({ id: `slot-${newSlots.length}`, imageUrl: null });
                  }
                  newSlots[activeSlotIndex] = {
                    id: productSlots?.[activeSlotIndex]?.id || `slot-${activeSlotIndex}`,
                    imageUrl: image.url,
                    name: image.name,
                  };
                  onProductSlotsChange(newSlots);
                  toast.success(`Product ${activeSlotIndex + 1} added`);
                  setActiveSlotIndex(null);
                }}
              />

              {/* Quick Aspect Ratios — uses the canonical COMMON_ASPECT_RATIOS
                  list so this is the ONLY picker in the UI. */}
              <div className="camera-panel p-2.5 space-y-2">
                <div className="flex items-center gap-1.5">
                  <LEDIndicator
                    state={proSettings?.aspectRatio && proSettings.aspectRatio !== "1:1" ? "active" : "ready"}
                    size="sm"
                  />
                  <Aperture className="w-3 h-3 text-[var(--darkroom-accent)]" />
                  <span className="text-[11px] font-medium text-[var(--darkroom-text)]">Aspect Ratio</span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {COMMON_ASPECT_RATIOS.map((ratio) => {
                    const isSelected = proSettings?.aspectRatio === ratio.value ||
                      (!proSettings?.aspectRatio && ratio.value === "1:1");
                    return (
                      <button
                        key={ratio.value}
                        onClick={() => {
                          if (!proSettings || !onProSettingsChange) return;
                          onProSettingsChange({ ...proSettings, aspectRatio: ratio.value });
                        }}
                        disabled={isGenerating}
                        title={ratio.description}
                        className={cn(
                          "py-1.5 px-1 rounded text-center transition-all border",
                          isSelected
                            ? "bg-white/[0.06] border-white/[0.12]"
                            : "bg-[var(--camera-body-deep)] border-white/[0.04] hover:border-white/[0.08]"
                        )}
                      >
                        <span className={cn(
                          "text-[10px] font-medium block",
                          isSelected ? "text-[var(--darkroom-text)]" : "text-[var(--darkroom-text-muted)]"
                        )}>{ratio.label}</span>
                        <span className={cn(
                          "text-[9px] font-mono block",
                          isSelected ? "text-[var(--darkroom-text-muted)]" : "text-[var(--darkroom-text-dim)]"
                        )}>{ratio.value}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Background Presets - E-commerce Best Practices */}
              <div className="camera-panel p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <LEDIndicator
                      state={selectedBackgroundPreset ? "active" : "ready"}
                      size="sm"
                    />
                    <Sparkles className="w-3 h-3 text-[var(--darkroom-accent)]" />
                    <span className="text-[11px] font-medium text-[var(--darkroom-text)]">Background Style</span>
                  </div>
                  {selectedBackgroundPreset && (
                    <button
                      onClick={() => onBackgroundPresetChange?.(null)}
                      className="text-[9px] text-[var(--darkroom-text-dim)] hover:text-[var(--led-error)] font-medium px-1.5 py-0.5 rounded hover:bg-white/5 transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Preset Grid - 2x3 */}
                <div className="grid grid-cols-2 gap-1.5">
                  {BACKGROUND_PRESETS.map((preset) => {
                    const isSelected = selectedBackgroundPreset === preset.id;
                    return (
                      <motion.button
                        key={preset.id}
                        onClick={() => onBackgroundPresetChange?.(isSelected ? null : preset.id)}
                        disabled={isGenerating}
                        className={cn(
                          "p-2 rounded text-left transition-all border group relative overflow-hidden",
                          isSelected
                            ? "bg-[var(--led-active)]/10 border-[var(--led-active)]/30"
                            : "bg-[var(--camera-body-deep)] border-white/[0.04] hover:border-white/[0.12] hover:bg-white/[0.03]"
                        )}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                      >
                        {/* Selection indicator */}
                        {isSelected && (
                          <motion.div
                            className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[var(--led-active)]"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                          />
                        )}

                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-sm">{preset.icon}</span>
                          <span className={cn(
                            "text-[10px] font-medium",
                            isSelected ? "text-[var(--led-active)]" : "text-[var(--darkroom-text)]"
                          )}>
                            {preset.label}
                          </span>
                        </div>
                        <p className={cn(
                          "text-[9px] leading-tight",
                          isSelected ? "text-[var(--led-active)]/70" : "text-[var(--darkroom-text-dim)]"
                        )}>
                          {preset.description}
                        </p>
                      </motion.button>
                    );
                  })}
                </div>

                {/* Helper text */}
                <p className="text-[9px] text-[var(--darkroom-text-dim)] pt-1 border-t border-white/[0.04]">
                  <span className="text-[var(--darkroom-accent)]">✦</span> Auto-varies each generation for diversity
                </p>
              </div>

              {/* Composition Presets - How to arrange products */}
              <div className="camera-panel p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <LEDIndicator
                      state={selectedCompositionPreset ? "active" : "ready"}
                      size="sm"
                    />
                    <Layers className="w-3 h-3 text-[var(--darkroom-accent)]" />
                    <span className="text-[11px] font-medium text-[var(--darkroom-text)]">Arrangement</span>
                  </div>
                  {selectedCompositionPreset && (
                    <button
                      onClick={() => onCompositionPresetChange?.(null)}
                      className="text-[9px] text-[var(--darkroom-text-dim)] hover:text-[var(--led-error)] font-medium px-1.5 py-0.5 rounded hover:bg-white/5 transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Preset Grid - 2x3 */}
                <div className="grid grid-cols-2 gap-1.5">
                  {COMPOSITION_PRESETS.map((preset) => {
                    const isSelected = selectedCompositionPreset === preset.id;
                    return (
                      <motion.button
                        key={preset.id}
                        onClick={() => onCompositionPresetChange?.(isSelected ? null : preset.id)}
                        disabled={isGenerating}
                        className={cn(
                          "p-2 rounded text-left transition-all border group relative overflow-hidden",
                          isSelected
                            ? "bg-[var(--led-active)]/10 border-[var(--led-active)]/30"
                            : "bg-[var(--camera-body-deep)] border-white/[0.04] hover:border-white/[0.12] hover:bg-white/[0.03]"
                        )}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                      >
                        {/* Selection indicator */}
                        {isSelected && (
                          <motion.div
                            className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[var(--led-active)]"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                          />
                        )}

                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-sm">{preset.icon}</span>
                          <span className={cn(
                            "text-[10px] font-medium",
                            isSelected ? "text-[var(--led-active)]" : "text-[var(--darkroom-text)]"
                          )}>
                            {preset.label}
                          </span>
                        </div>
                        <p className={cn(
                          "text-[9px] leading-tight",
                          isSelected ? "text-[var(--led-active)]/70" : "text-[var(--darkroom-text-dim)]"
                        )}>
                          {preset.description}
                        </p>
                      </motion.button>
                    );
                  })}
                </div>

                {/* Helper text */}
                <p className="text-[9px] text-[var(--darkroom-text-dim)] pt-1 border-t border-white/[0.04]">
                  <span className="text-[var(--darkroom-accent)]">✦</span> Tells AI how to place products in scene
                </p>
              </div>
            </div>
          )}

          {/* === CONSISTENCY MODE TAB - Bulk variation generation === */}
          {activeTab === "consistency" && proSettings && sessionId && (
            <ConsistencyModePanel
              sessionId={sessionId}
              organizationId={organizationId ?? null}
              userId={userId ?? null}
              proSettings={proSettings}
            />
          )}

        </div>
      </motion.aside>
    </>
  );
}
