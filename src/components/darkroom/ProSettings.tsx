import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Camera, Sun, Globe, X, Info, SlidersHorizontal, Maximize2, Cpu, Sparkles, Zap, TrendingUp, Star } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { DEFAULT_IMAGE_AI_PROVIDER } from "@/config/imageSettings";
import {
  getCameraOptions,
  getLightingOptions,
  getEnvironmentOptions,
} from "@/utils/promptFormula";

// Expanded aspect ratio options (matching Freepik's offerings)
const ASPECT_RATIO_OPTIONS = [
  { value: "1:1", label: "Square", description: "Instagram, Product" },
  { value: "16:9", label: "Widescreen", description: "YouTube, Desktop" },
  { value: "9:16", label: "Social Story", description: "Reels, TikTok" },
  { value: "2:3", label: "Portrait", description: "Pinterest, Print" },
  { value: "3:4", label: "Traditional", description: "Mobile, Portrait" },
  { value: "1:2", label: "Vertical", description: "Tall banner" },
  { value: "2:1", label: "Horizontal", description: "Wide banner" },
  { value: "4:5", label: "Social Post", description: "Instagram Feed" },
  { value: "3:2", label: "Standard", description: "Classic photo" },
  { value: "4:3", label: "Classic", description: "Traditional photo" },
];

// AI Provider/Model options - Updated for Freepik's actual API offerings
// Default/primary: GPT Image 2. If OpenAI can't serve the request, the
// edge function falls back to Gemini 3.1 Pro automatically.
const AI_PROVIDER_OPTIONS = [
  { value: "openai-image-2", label: "GPT Image 2", description: "Default — fallback to Gemini 3.1 Pro", badge: "DEFAULT", group: "openai" },
  { value: "auto", label: "Auto", description: "Legacy path: GPT Image 2 -> Gemini 3.1 Pro", badge: null, group: "auto" },
  // Google Gemini Direct (Google's API) - MOVED TO TOP
  { value: "gemini-3-pro-image", label: "Gemini 3.1 Pro", description: "Latest Gemini image fallback", badge: "BEST", group: "gemini" },
  { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash", description: "Fast & reliable", badge: "FREE", group: "gemini" },
  // Freepik Premium Models
  { value: "freepik-seedream-4", label: "Seedream 4", description: "Best quality, 4K capable", badge: "4K", group: "freepik" },
  { value: "freepik-flux-pro", label: "Flux Pro v1.1", description: "Premium Flux model", badge: "NEW", group: "freepik" },
  { value: "freepik-hyperflux", label: "Hyperflux", description: "Ultra-fast Flux variant", badge: "FAST", group: "freepik" },
  { value: "freepik-flux", label: "Flux Dev", description: "Community favorite", badge: "POPULAR", group: "freepik" },
  { value: "freepik-seedream", label: "Seedream", description: "Exceptional creativity", badge: null, group: "freepik" },
  { value: "freepik-mystic", label: "Mystic", description: "Freepik AI at 2K", badge: null, group: "freepik" },
  { value: "freepik-classic", label: "Classic Fast", description: "Quick generation", badge: null, group: "freepik" },
];

// Resolution/Quality options
const RESOLUTION_OPTIONS = [
  { value: "standard", label: "Standard", description: "1K (1024px)" },
  { value: "high", label: "High", description: "2K (2048px)" },
  { value: "4k", label: "4K Ultra", description: "4K (4096px)", badge: "Signature" },
];

// AI Characters for consistent faces (Freepik feature)
// These are pre-defined character faces that maintain consistency across generations
const AI_CHARACTERS = [
  { id: "kat", name: "@Kat", gender: "female", style: "diverse" },
  { id: "helena", name: "@Helena", gender: "female", style: "elegant" },
  { id: "mei", name: "@Mei", gender: "female", style: "asian" },
  { id: "camile", name: "@Camile", gender: "female", style: "natural" },
  { id: "rafael", name: "@Rafael", gender: "male", style: "casual" },
  { id: "rohan", name: "@Rohan", gender: "male", style: "south-asian" },
  { id: "lucia", name: "@Lucia", gender: "female", style: "mature" },
  { id: "sophia", name: "@Sophia", gender: "female", style: "youthful" },
  { id: "samuel", name: "@Samuel", gender: "male", style: "professional" },
  { id: "alvaro", name: "@Alvaro", gender: "male", style: "mediterranean" },
  { id: "kenji", name: "@Kenji", gender: "male", style: "east-asian" },
  { id: "marcia", name: "@Marcia", gender: "female", style: "afro" },
  { id: "alejandro", name: "@Alejandro", gender: "male", style: "latino" },
  { id: "freja", name: "@Freja", gender: "female", style: "nordic" },
  { id: "alex", name: "@Alex", gender: "non-binary", style: "androgynous" },
  { id: "jonas", name: "@Jonas", gender: "male", style: "european" },
  { id: "mary", name: "@Mary", gender: "female", style: "senior" },
  { id: "emily", name: "@Emily", gender: "female", style: "afro" },
  { id: "belinda", name: "@Belinda", gender: "female", style: "mature-elegant" },
  { id: "jackson", name: "@Jackson", gender: "male", style: "afro" },
  { id: "kevin", name: "@Kevin", gender: "male", style: "east-asian" },
  { id: "laura", name: "@Laura", gender: "female", style: "natural" },
];

export interface ProModeSettings {
  camera?: string;
  lighting?: string;
  environment?: string;
  aspectRatio?: string;
  aiProvider?: string;
  resolution?: string;
  characterId?: string; // AI Character for consistent faces
  visualSquad?: string; // Visual Style/Filter
}

interface ProSettingsProps {
  settings: ProModeSettings;
  onChange: (settings: ProModeSettings) => void;
  disabled?: boolean;
}

export function ProSettings({ settings, onChange, disabled = false }: ProSettingsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const cameraOptions = getCameraOptions();
  const lightingOptions = getLightingOptions();
  const environmentOptions = getEnvironmentOptions();

  const activeCount = Object.values(settings).filter(Boolean).length;

  const handleCameraChange = (value: string) => {
    onChange({ ...settings, camera: value === "none" ? undefined : value });
  };

  const handleLightingChange = (value: string) => {
    onChange({ ...settings, lighting: value === "none" ? undefined : value });
  };

  const handleEnvironmentChange = (value: string) => {
    onChange({ ...settings, environment: value === "none" ? undefined : value });
  };

  const handleAspectRatioChange = (value: string) => {
    onChange({ ...settings, aspectRatio: value === "1:1" ? undefined : value });
  };

  const handleAiProviderChange = (value: string) => {
    onChange({ ...settings, aiProvider: value === "auto" ? undefined : value });
  };

  const handleCharacterChange = (value: string) => {
    onChange({ ...settings, characterId: value === "none" ? undefined : value });
  };

  const handleResolutionChange = (value: string) => {
    onChange({ ...settings, resolution: value === "standard" ? undefined : value });
  };

  const handleClearAll = () => {
    onChange({});
  };

  return (
    <div className="pro-settings">
      {/* Header - Always Visible */}
      <button
        className="pro-settings__header"
        onClick={() => setIsExpanded(!isExpanded)}
        disabled={disabled}
      >
        <div className="pro-settings__title">
          <SlidersHorizontal className="w-4 h-4 text-[var(--darkroom-accent)]" />
          <span>Pro Settings</span>
          {activeCount > 0 && (
            <Badge className="pro-settings__badge">{activeCount}</Badge>
          )}
        </div>
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="w-4 h-4 text-[var(--darkroom-text-muted)]" />
        </motion.div>
      </button>

      {/* Expandable Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="pro-settings__content">
              {/* Clear All Button */}
              {activeCount > 0 && (
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearAll}
                    className="h-7 px-2 text-xs text-[var(--darkroom-text-muted)] hover:text-[var(--darkroom-text)]"
                  >
                    <X className="w-3 h-3 mr-1" />
                    Clear all
                  </Button>
                </div>
              )}

              {/* Camera/Lens */}
              <div className="pro-settings__control">
                <label className="pro-settings__control-label">
                  <Camera className="w-3.5 h-3.5" />
                  Camera & Lens
                </label>
                <Select
                  value={settings.camera || "none"}
                  onValueChange={handleCameraChange}
                  disabled={disabled}
                >
                  <SelectTrigger className="h-9 bg-[var(--darkroom-bg)] border-[var(--darkroom-border)] text-[var(--darkroom-text)] text-sm">
                    <SelectValue placeholder="Select camera..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1816] border-[var(--darkroom-border)] z-50">
                    <SelectItem value="none" className="text-[#a09080] focus:bg-[#2a2520] focus:text-[#f5f0e6] data-[highlighted]:bg-[#2a2520] data-[highlighted]:text-[#f5f0e6]">
                      None
                    </SelectItem>
                    {cameraOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value} className="text-[#f5f0e6] focus:bg-[#2a2520] focus:text-[#f5f0e6] data-[highlighted]:bg-[#2a2520] data-[highlighted]:text-[#f5f0e6]">
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Lighting */}
              <div className="pro-settings__control">
                <label className="pro-settings__control-label">
                  <Sun className="w-3.5 h-3.5" />
                  Lighting Setup
                </label>
                <Select
                  value={settings.lighting || "none"}
                  onValueChange={handleLightingChange}
                  disabled={disabled}
                >
                  <SelectTrigger className="h-9 bg-[var(--darkroom-bg)] border-[var(--darkroom-border)] text-[var(--darkroom-text)] text-sm">
                    <SelectValue placeholder="Select lighting..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1816] border-[var(--darkroom-border)] z-50">
                    <SelectItem value="none" className="text-[#a09080] focus:bg-[#2a2520] focus:text-[#f5f0e6] data-[highlighted]:bg-[#2a2520] data-[highlighted]:text-[#f5f0e6]">
                      None
                    </SelectItem>
                    {lightingOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value} className="text-[#f5f0e6] focus:bg-[#2a2520] focus:text-[#f5f0e6] data-[highlighted]:bg-[#2a2520] data-[highlighted]:text-[#f5f0e6]">
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Environment */}
              <div className="pro-settings__control">
                <div className="flex items-center justify-between">
                  <label className="pro-settings__control-label">
                    <Globe className="w-3.5 h-3.5" />
                    Environment
                  </label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="w-3 h-3 text-[var(--darkroom-text-dim)] cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-[200px]">
                        <p className="text-xs">
                          This adds text to your prompt. For actual background
                          images, use the "Background Scene" upload above.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Select
                  value={settings.environment || "none"}
                  onValueChange={handleEnvironmentChange}
                  disabled={disabled}
                >
                  <SelectTrigger className="h-9 bg-[var(--darkroom-bg)] border-[var(--darkroom-border)] text-[var(--darkroom-text)] text-sm">
                    <SelectValue placeholder="Select environment..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1816] border-[var(--darkroom-border)] z-50">
                    <SelectItem value="none" className="text-[#a09080] focus:bg-[#2a2520] focus:text-[#f5f0e6] data-[highlighted]:bg-[#2a2520] data-[highlighted]:text-[#f5f0e6]">
                      None
                    </SelectItem>
                    {environmentOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value} className="text-[#f5f0e6] focus:bg-[#2a2520] focus:text-[#f5f0e6] data-[highlighted]:bg-[#2a2520] data-[highlighted]:text-[#f5f0e6]">
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="pro-settings__hint">
                  For image backgrounds, upload a Background Scene
                </p>
              </div>

              {/* Aspect Ratio */}
              <div className="pro-settings__control">
                <label className="pro-settings__control-label">
                  <Maximize2 className="w-3.5 h-3.5" />
                  Aspect Ratio
                </label>
                <Select
                  value={settings.aspectRatio || "1:1"}
                  onValueChange={handleAspectRatioChange}
                  disabled={disabled}
                >
                  <SelectTrigger className="h-9 bg-[var(--darkroom-bg)] border-[var(--darkroom-border)] text-[var(--darkroom-text)] text-sm">
                    <SelectValue placeholder="Select aspect ratio..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1816] border-[var(--darkroom-border)] z-50">
                    {ASPECT_RATIO_OPTIONS.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        className="text-[#f5f0e6] focus:bg-[#2a2520] focus:text-[#f5f0e6] data-[highlighted]:bg-[#2a2520] data-[highlighted]:text-[#f5f0e6]"
                      >
                        <span className="flex items-center justify-between w-full">
                          <span>{option.label}</span>
                          <span className="text-[#a09080] text-xs ml-2">{option.description}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Divider for AI Settings */}
              <div className="pro-settings__divider">
                <span className="pro-settings__divider-text">AI Model Settings</span>
              </div>

              {/* AI Model */}
              <div className="pro-settings__control">
                <div className="flex items-center justify-between">
                  <label className="pro-settings__control-label">
                    <Cpu className="w-3.5 h-3.5" />
                    AI Model
                  </label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="w-3 h-3 text-[var(--darkroom-text-dim)] cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-[220px]">
                        <p className="text-xs">
                          Freepik models require Studio or Signature plan.
                          Seedream 4 4K supports reference images for best product accuracy.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Select
                  value={settings.aiProvider || DEFAULT_IMAGE_AI_PROVIDER}
                  onValueChange={handleAiProviderChange}
                  disabled={disabled}
                >
                  <SelectTrigger className="h-9 bg-[var(--darkroom-bg)] border-[var(--darkroom-border)] text-[var(--darkroom-text)] text-sm">
                    <SelectValue placeholder="Select AI model..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1816] border-[var(--darkroom-border)] z-50 max-h-[300px]">
                    {AI_PROVIDER_OPTIONS.map((option, idx) => {
                      // Add group headers
                      const prevOption = idx > 0 ? AI_PROVIDER_OPTIONS[idx - 1] : null;
                      const showGroupHeader = !prevOption || prevOption.group !== option.group;

                      const groupLabels: Record<string, string> = {
                        "gemini": "Google Gemini",
                        "openai": "OpenAI",
                        "freepik": "Freepik AI Models",
                      };

                      return (
                        <div key={option.value}>
                          {showGroupHeader && option.group !== "auto" && (
                            <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-[#6a5f50] font-medium border-t border-[var(--darkroom-border)] mt-1 first:mt-0 first:border-t-0">
                              {groupLabels[option.group] || option.group}
                            </div>
                          )}
                          <SelectItem
                            value={option.value}
                            className="text-[#f5f0e6] focus:bg-[#2a2520] focus:text-[#f5f0e6] data-[highlighted]:bg-[#2a2520] data-[highlighted]:text-[#f5f0e6]"
                          >
                            <span className="flex items-center gap-2 w-full">
                              <span className="flex-1">{option.label}</span>
                              {option.badge && (
                                <span className={cn(
                                  "text-[9px] px-1.5 py-0.5 rounded font-medium",
                                  option.badge === "BEST" && "bg-purple-500/20 text-purple-400",
                                  option.badge === "POPULAR" && "bg-blue-500/20 text-blue-400",
                                  option.badge === "4K" && "bg-amber-500/20 text-amber-400",
                                  option.badge === "FAST" && "bg-cyan-500/20 text-cyan-400",
                                  option.badge === "FREE" && "bg-emerald-500/20 text-emerald-400",
                                  option.badge === "TRENDING" && "bg-orange-500/20 text-orange-400",
                                  option.badge === "NEW" && "bg-emerald-500/20 text-emerald-400",
                                  option.badge === "SUGGESTED" && "bg-[var(--darkroom-accent)]/20 text-[var(--darkroom-accent)]"
                                )}>
                                  {option.badge}
                                </span>
                              )}
                              <span className="text-[#6a5f50] text-[10px] ml-1">{option.description}</span>
                            </span>
                          </SelectItem>
                        </div>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Resolution/Quality */}
              <div className="pro-settings__control">
                <div className="flex items-center justify-between">
                  <label className="pro-settings__control-label">
                    <Sparkles className="w-3.5 h-3.5" />
                    Resolution
                  </label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="w-3 h-3 text-[var(--darkroom-text-dim)] cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-[200px]">
                        <p className="text-xs">
                          Higher resolution uses more credits.
                          4K requires Signature plan and Seedream 4 4K model.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Select
                  value={settings.resolution || "standard"}
                  onValueChange={handleResolutionChange}
                  disabled={disabled}
                >
                  <SelectTrigger className="h-9 bg-[var(--darkroom-bg)] border-[var(--darkroom-border)] text-[var(--darkroom-text)] text-sm">
                    <SelectValue placeholder="Select resolution..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1816] border-[var(--darkroom-border)] z-50">
                    {RESOLUTION_OPTIONS.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        className="text-[#f5f0e6] focus:bg-[#2a2520] focus:text-[#f5f0e6] data-[highlighted]:bg-[#2a2520] data-[highlighted]:text-[#f5f0e6]"
                      >
                        <span className="flex items-center gap-2 w-full">
                          <span>{option.label}</span>
                          {"badge" in option && option.badge && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-purple-500/20 text-purple-400">
                              {option.badge}
                            </span>
                          )}
                          <span className="text-[#6a5f50] text-[10px] ml-auto">{option.description}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* AI Character (for lifestyle images with people) */}
              <div className="pro-settings__control">
                <div className="flex items-center justify-between">
                  <label className="pro-settings__control-label">
                    <Star className="w-3.5 h-3.5" />
                    AI Character
                  </label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="w-3 h-3 text-[var(--darkroom-text-dim)] cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-[220px]">
                        <p className="text-xs">
                          Select a pre-defined AI character for consistent faces
                          across multiple images. Great for lifestyle and campaign shots.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Select
                  value={settings.characterId || "none"}
                  onValueChange={handleCharacterChange}
                  disabled={disabled}
                >
                  <SelectTrigger className="h-9 bg-[var(--darkroom-bg)] border-[var(--darkroom-border)] text-[var(--darkroom-text)] text-sm">
                    <SelectValue placeholder="Select character..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1816] border-[var(--darkroom-border)] z-50 max-h-[250px]">
                    <SelectItem
                      value="none"
                      className="text-[#a09080] focus:bg-[#2a2520] focus:text-[#f5f0e6] data-[highlighted]:bg-[#2a2520] data-[highlighted]:text-[#f5f0e6]"
                    >
                      None (no character)
                    </SelectItem>
                    <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-[#6a5f50] font-medium border-t border-[var(--darkroom-border)] mt-1">
                      AI Characters (consistent faces)
                    </div>
                    {AI_CHARACTERS.map((char) => (
                      <SelectItem
                        key={char.id}
                        value={char.id}
                        className="text-[#f5f0e6] focus:bg-[#2a2520] focus:text-[#f5f0e6] data-[highlighted]:bg-[#2a2520] data-[highlighted]:text-[#f5f0e6]"
                      >
                        <span className="flex items-center gap-2 w-full">
                          <span>{char.name}</span>
                          <span className="text-[#6a5f50] text-[10px] capitalize">{char.style}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="pro-settings__hint">
                  For lifestyle/campaign images with people
                </p>
              </div>

              {/* Summary */}
              {activeCount > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="pt-3 border-t border-[var(--darkroom-border)]"
                >
                  <p className="text-xs text-[var(--darkroom-text-muted)]">
                    Your prompt will be enhanced with professional photography specifications.
                  </p>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
