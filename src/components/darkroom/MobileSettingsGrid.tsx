/**
 * MobileSettingsGrid - Grid layout for mobile Dark Room settings
 * 
 * Displays all settings as tappable tiles in a clean grid.
 * Each tile opens its corresponding full-screen modal.
 */

import { useState } from "react";
import {
  Cpu,
  Maximize2,
  Camera,
  Sun,
  Globe,
  Settings2,
  Image,
  Sparkles,
} from "lucide-react";
import { MobileSettingsTile } from "./MobileSettingsTile";
import { MobileSettingModal } from "./MobileSettingModal";
import type { ProModeSettings } from "./ProSettings";
import { AI_MODEL_OPTIONS as SHARED_AI_MODEL_OPTIONS, DEFAULT_IMAGE_AI_PROVIDER } from "@/config/imageSettings";

// Option types for each setting
interface SettingOption {
  value: string;
  label: string;
  description?: string;
}

const AI_MODEL_OPTIONS: SettingOption[] = SHARED_AI_MODEL_OPTIONS.map(({ value, label, description }) => ({
  value,
  label,
  description,
}));

// Aspect ratio options
const ASPECT_RATIO_OPTIONS: SettingOption[] = [
  { value: "1:1", label: "1:1 Square", description: "Instagram, Product" },
  { value: "9:16", label: "9:16 Portrait", description: "Stories, TikTok" },
  { value: "16:9", label: "16:9 Landscape", description: "YouTube, Banner" },
  { value: "4:5", label: "4:5 Portrait", description: "Instagram Portrait" },
  { value: "3:4", label: "3:4 Portrait", description: "Classic Portrait" },
  { value: "4:3", label: "4:3 Landscape", description: "Classic Landscape" },
];

// Camera options
const CAMERA_OPTIONS: SettingOption[] = [
  { value: "", label: "None", description: "No camera setting" },
  { value: "50mm f/1.4", label: "50mm f/1.4", description: "Natural perspective" },
  { value: "85mm f/1.2", label: "85mm f/1.2", description: "Portrait lens" },
  { value: "35mm f/1.8", label: "35mm f/1.8", description: "Wide angle" },
  { value: "macro lens", label: "Macro", description: "Close-up details" },
  { value: "wide angle 24mm", label: "24mm Wide", description: "Environmental" },
];

// Lighting options
const LIGHTING_OPTIONS: SettingOption[] = [
  { value: "", label: "None", description: "No lighting preset" },
  { value: "studio lighting", label: "Studio", description: "Professional setup" },
  { value: "natural light", label: "Natural", description: "Soft daylight" },
  { value: "golden hour", label: "Golden Hour", description: "Warm sunset tones" },
  { value: "dramatic lighting", label: "Dramatic", description: "High contrast" },
  { value: "soft diffused", label: "Soft Diffused", description: "Even, gentle light" },
  { value: "backlit", label: "Backlit", description: "Rim lighting effect" },
];

// Environment options
const ENVIRONMENT_OPTIONS: SettingOption[] = [
  { value: "", label: "None", description: "No environment preset" },
  { value: "indoor studio", label: "Studio", description: "Clean backdrop" },
  { value: "outdoor nature", label: "Outdoor Nature", description: "Natural setting" },
  { value: "urban", label: "Urban", description: "City environment" },
  { value: "minimalist", label: "Minimalist", description: "Simple, clean" },
  { value: "luxury interior", label: "Luxury Interior", description: "High-end space" },
];

interface MobileSettingsGridProps {
  proSettings: ProModeSettings;
  onProSettingsChange: (settings: ProModeSettings) => void;
  onOpenInputs: () => void;
  hasProductImage: boolean;
  hasBackgroundImage: boolean;
  hasStyleReference: boolean;
  disabled?: boolean;
}

type ActiveModal = "model" | "size" | "camera" | "lighting" | "environment" | "inputs" | null;

export function MobileSettingsGrid({
  proSettings,
  onProSettingsChange,
  onOpenInputs,
  hasProductImage,
  hasBackgroundImage,
  hasStyleReference,
  disabled = false,
}: MobileSettingsGridProps) {
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);

  // Get display values for each setting
  const getModelDisplay = () => {
    const option = AI_MODEL_OPTIONS.find(o => o.value === (proSettings.aiProvider || DEFAULT_IMAGE_AI_PROVIDER));
    return option?.label || "GPT Image 2";
  };

  const getSizeDisplay = () => {
    return proSettings.aspectRatio || "1:1";
  };

  const getCameraDisplay = () => {
    if (!proSettings.camera) return "None";
    const option = CAMERA_OPTIONS.find(o => o.value === proSettings.camera);
    return option?.label || proSettings.camera;
  };

  const getLightingDisplay = () => {
    if (!proSettings.lighting) return "None";
    const option = LIGHTING_OPTIONS.find(o => o.value === proSettings.lighting);
    return option?.label || proSettings.lighting;
  };

  const getEnvironmentDisplay = () => {
    if (!proSettings.environment) return "None";
    const option = ENVIRONMENT_OPTIONS.find(o => o.value === proSettings.environment);
    return option?.label || proSettings.environment;
  };

  const getInputsDisplay = () => {
    const count = [hasProductImage, hasBackgroundImage, hasStyleReference].filter(Boolean).length;
    return count > 0 ? `${count} image${count > 1 ? 's' : ''}` : "None";
  };

  // Handle setting changes
  const handleModelChange = (value: string) => {
    onProSettingsChange({ ...proSettings, aiProvider: value });
    setActiveModal(null);
  };

  const handleSizeChange = (value: string) => {
    onProSettingsChange({ ...proSettings, aspectRatio: value });
    setActiveModal(null);
  };

  const handleCameraChange = (value: string) => {
    onProSettingsChange({ ...proSettings, camera: value || undefined });
    setActiveModal(null);
  };

  const handleLightingChange = (value: string) => {
    onProSettingsChange({ ...proSettings, lighting: value || undefined });
    setActiveModal(null);
  };

  const handleEnvironmentChange = (value: string) => {
    onProSettingsChange({ ...proSettings, environment: value || undefined });
    setActiveModal(null);
  };

  return (
    <>
      <div className="mobile-settings-grid">
        <MobileSettingsTile
          icon={Cpu}
          label="Model"
          value={getModelDisplay()}
          onClick={() => setActiveModal("model")}
          disabled={disabled}
        />
        <MobileSettingsTile
          icon={Maximize2}
          label="Size"
          value={getSizeDisplay()}
          onClick={() => setActiveModal("size")}
          disabled={disabled}
        />
        <MobileSettingsTile
          icon={Camera}
          label="Camera"
          value={getCameraDisplay()}
          onClick={() => setActiveModal("camera")}
          disabled={disabled}
        />
        <MobileSettingsTile
          icon={Sun}
          label="Lighting"
          value={getLightingDisplay()}
          onClick={() => setActiveModal("lighting")}
          disabled={disabled}
        />
        <MobileSettingsTile
          icon={Globe}
          label="Environment"
          value={getEnvironmentDisplay()}
          onClick={() => setActiveModal("environment")}
          disabled={disabled}
        />
        <MobileSettingsTile
          icon={Image}
          label="Images"
          value={getInputsDisplay()}
          onClick={onOpenInputs}
          disabled={disabled}
        />
      </div>

      {/* Model Modal */}
      <MobileSettingModal
        isOpen={activeModal === "model"}
        onClose={() => setActiveModal(null)}
        title="AI Model"
        options={AI_MODEL_OPTIONS}
        selectedValue={proSettings.aiProvider || DEFAULT_IMAGE_AI_PROVIDER}
        onSelect={handleModelChange}
      />

      {/* Size Modal */}
      <MobileSettingModal
        isOpen={activeModal === "size"}
        onClose={() => setActiveModal(null)}
        title="Aspect Ratio"
        options={ASPECT_RATIO_OPTIONS}
        selectedValue={proSettings.aspectRatio || "1:1"}
        onSelect={handleSizeChange}
      />

      {/* Camera Modal */}
      <MobileSettingModal
        isOpen={activeModal === "camera"}
        onClose={() => setActiveModal(null)}
        title="Camera & Lens"
        options={CAMERA_OPTIONS}
        selectedValue={proSettings.camera || ""}
        onSelect={handleCameraChange}
      />

      {/* Lighting Modal */}
      <MobileSettingModal
        isOpen={activeModal === "lighting"}
        onClose={() => setActiveModal(null)}
        title="Lighting Setup"
        options={LIGHTING_OPTIONS}
        selectedValue={proSettings.lighting || ""}
        onSelect={handleLightingChange}
      />

      {/* Environment Modal */}
      <MobileSettingModal
        isOpen={activeModal === "environment"}
        onClose={() => setActiveModal(null)}
        title="Environment"
        options={ENVIRONMENT_OPTIONS}
        selectedValue={proSettings.environment || ""}
        onSelect={handleEnvironmentChange}
      />
    </>
  );
}
