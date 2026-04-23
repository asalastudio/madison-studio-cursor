import { Camera, Sun, MapPin, X, Cpu, Maximize2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getCameraOptions, getLightingOptions, getEnvironmentOptions } from "@/utils/promptFormula";
import { cn } from "@/lib/utils";
import { AI_MODEL_OPTIONS, DEFAULT_IMAGE_AI_PROVIDER, IMAGE_GEN_RESOLUTION_OPTIONS } from "@/config/imageSettings";

export interface ProModeControls {
  camera?: string;
  lighting?: string;
  environment?: string;
  /** Passed to generate-madison-image as `aiProvider` (e.g. openai-image-2). */
  aiProvider?: string;
  /** Passed to generate-madison-image as `resolution` (standard | high | 4k). */
  resolution?: string;
}

interface ProModePanelProps {
  onControlsChange: (controls: ProModeControls) => void;
  initialValues?: ProModeControls;
}

export function ProModePanel({ onControlsChange, initialValues = {} }: ProModePanelProps) {
  const cameraOptions = getCameraOptions();
  const lightingOptions = getLightingOptions();
  const environmentOptions = getEnvironmentOptions();

  const handleCameraChange = (value: string) => {
    const newControls = { ...initialValues, camera: value === "none" ? undefined : value };
    onControlsChange(newControls);
  };

  const handleLightingChange = (value: string) => {
    const newControls = { ...initialValues, lighting: value === "none" ? undefined : value };
    onControlsChange(newControls);
  };

  const handleEnvironmentChange = (value: string) => {
    const newControls = { ...initialValues, environment: value === "none" ? undefined : value };
    onControlsChange(newControls);
  };

  const handleAiProviderChange = (value: string) => {
    onControlsChange({ ...initialValues, aiProvider: value === "auto" ? undefined : value });
  };

  const handleResolutionChange = (value: string) => {
    onControlsChange({
      ...initialValues,
      resolution: value === "standard" ? undefined : value,
    });
  };

  const handleClearAll = () => {
    onControlsChange({});
  };

  const hasSelections = !!(
    initialValues.camera ||
    initialValues.lighting ||
    initialValues.environment ||
    (initialValues.aiProvider && initialValues.aiProvider !== "auto") ||
    (initialValues.resolution && initialValues.resolution !== "standard")
  );

  return (
    <div className="space-y-4 p-4 bg-[#252220]/50 rounded-lg border border-[#3D3935]">
      <div className="flex items-center justify-between">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-[#D4CFC8]">Professional Presets</span>
                <span className="text-xs text-[#A8A39E]">(Optional)</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs text-xs">Access professional photography presets for precise control over camera, lighting, and environment.</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {hasSelections && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearAll}
            className="h-7 px-2 text-xs text-[#A8A39E] hover:text-[#D4CFC8] hover:bg-[#3D3935]"
          >
            <X className="h-3 w-3 mr-1" />
            Clear
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {/* AI model — GPT Image 2 is the default, with Gemini 3.1 Pro as the backend fallback */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-[#A8A39E] flex items-center gap-1.5">
            <Cpu className="h-3.5 w-3.5" />
            AI model
          </Label>
          <Select
            value={initialValues.aiProvider || DEFAULT_IMAGE_AI_PROVIDER}
            onValueChange={handleAiProviderChange}
          >
            <SelectTrigger className="h-9 bg-[#252220] border-[#3D3935] text-[#FFFCF5] text-sm">
              <SelectValue placeholder="Select model..." />
            </SelectTrigger>
            <SelectContent className="max-h-[280px]">
              {AI_MODEL_OPTIONS.map((option, idx) => {
                const prev = idx > 0 ? AI_MODEL_OPTIONS[idx - 1] : null;
                const showGroupHeader = !prev || prev.group !== option.group;
                const groupLabels: Record<string, string> = {
                  gemini: "Google Gemini",
                  openai: "OpenAI",
                  freepik: "Freepik",
                };
                return (
                  <div key={option.value}>
                    {showGroupHeader && option.group !== "auto" && (
                      <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                        {groupLabels[option.group] || option.group}
                      </div>
                    )}
                    <SelectItem value={option.value} className="text-sm">
                      <span className="flex items-center gap-2">
                        {option.label}
                        {option.badge && (
                          <span className="text-[10px] text-muted-foreground">({option.badge})</span>
                        )}
                      </span>
                    </SelectItem>
                  </div>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-[#A8A39E] flex items-center gap-1.5">
            <Maximize2 className="h-3.5 w-3.5" />
            Output resolution
          </Label>
          <div className="flex gap-1">
            {IMAGE_GEN_RESOLUTION_OPTIONS.map((option) => {
              const isSelected =
                initialValues.resolution === option.value ||
                (!initialValues.resolution && option.value === "standard");
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleResolutionChange(option.value)}
                  className={cn(
                    "flex-1 rounded border py-2 text-center text-xs font-medium transition-colors",
                    isSelected
                      ? "border-[#B8956A] bg-[#B8956A]/10 text-[#FFFCF5]"
                      : "border-[#3D3935] bg-[#252220] text-[#D4CFC8] hover:border-[#3D3935]/80",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Camera/Lens */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-[#A8A39E] flex items-center gap-1.5">
            <Camera className="h-3.5 w-3.5" />
            Camera & Lens
          </Label>
          <Select value={initialValues.camera || "none"} onValueChange={handleCameraChange}>
            <SelectTrigger className="h-9 bg-[#252220] border-[#3D3935] text-[#FFFCF5] text-sm">
              <SelectValue placeholder="Select camera setup..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {cameraOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Lighting */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-[#A8A39E] flex items-center gap-1.5">
            <Sun className="h-3.5 w-3.5" />
            Lighting Setup
          </Label>
          <Select value={initialValues.lighting || "none"} onValueChange={handleLightingChange}>
            <SelectTrigger className="h-9 bg-[#252220] border-[#3D3935] text-[#FFFCF5] text-sm">
              <SelectValue placeholder="Select lighting..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {lightingOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Environment */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-[#A8A39E] flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            Environment & Surface
          </Label>
          <Select value={initialValues.environment || "none"} onValueChange={handleEnvironmentChange}>
            <SelectTrigger className="h-9 bg-[#252220] border-[#3D3935] text-[#FFFCF5] text-sm">
              <SelectValue placeholder="Select environment..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {environmentOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {hasSelections && (
        <div className="pt-2 border-t border-[#3D3935]">
          <p className="text-xs text-[#A8A39E] leading-relaxed">
            Your prompt will be enhanced with professional photography specifications.
          </p>
        </div>
      )}
    </div>
  );
}
