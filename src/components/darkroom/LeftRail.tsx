import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Package, Plus, Image, Palette, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UploadZone } from "./UploadZone";
import { GenerateButton } from "./GenerateButton";
import { LEDIndicator } from "./LEDIndicator";
import type { ProModeSettings } from "./ProSettings";
import { ProductSelector } from "@/components/forge/ProductSelector";
import { Product } from "@/hooks/useProducts";
import { cn } from "@/lib/utils";
import { ImageLibraryModal } from "@/components/image-editor/ImageLibraryModal";

interface UploadedImage {
  url: string;
  file?: File;
  name?: string;
}

interface LeftRailProps {
  // Product
  selectedProduct: Product | null;
  onProductSelect: (product: Product | null) => void;

  // Images
  productImage: UploadedImage | null;
  onProductImageUpload: (image: UploadedImage | null) => void;
  backgroundImage: UploadedImage | null;
  onBackgroundImageUpload: (image: UploadedImage | null) => void;
  styleReference: UploadedImage | null;
  onStyleReferenceUpload: (image: UploadedImage | null) => void;

  // Pro Settings
  proSettings: ProModeSettings;
  onProSettingsChange: (settings: ProModeSettings) => void;

  // Generate
  isGenerating: boolean;
  canGenerate: boolean;
  onGenerate: () => void;

  // Session info
  sessionCount: number;
  maxImages: number;
}

export function LeftRail({
  selectedProduct,
  onProductSelect,
  productImage,
  onProductImageUpload,
  backgroundImage,
  onBackgroundImageUpload,
  styleReference,
  onStyleReferenceUpload,
  proSettings,
  onProSettingsChange,
  isGenerating,
  canGenerate,
  onGenerate,
  sessionCount,
  maxImages,
}: LeftRailProps) {
  const [showBackgroundUpload, setShowBackgroundUpload] = useState(false);
  const [showStyleUpload, setShowStyleUpload] = useState(false);
  const [showProductLibrary, setShowProductLibrary] = useState(false);

  const proSettingsCount = Object.values(proSettings).filter(Boolean).length;

  return (
    <aside className="left-rail">
      {/* Section: Product Selection */}
      <div className="left-rail__section">
        <div className="flex items-center gap-2 mb-3">
          <LEDIndicator state={selectedProduct ? "ready" : "off"} size="sm" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--darkroom-text-muted)] font-mono">
            Product Context
          </span>
        </div>

        {selectedProduct ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="camera-panel p-3"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[var(--camera-body-deep)] border border-[var(--darkroom-border)] flex items-center justify-center">
                <Package className="w-5 h-5 text-[var(--darkroom-accent)]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--darkroom-text)] truncate">
                  {selectedProduct.name}
                </p>
                {selectedProduct.bottle_type &&
                  selectedProduct.bottle_type !== "auto" && (
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[9px] mt-1 font-mono uppercase tracking-wider",
                        selectedProduct.bottle_type === "oil"
                          ? "bg-[var(--led-ready)]/10 border-[var(--led-ready)]/30 text-[var(--led-ready)]"
                          : "bg-blue-500/10 border-blue-500/30 text-blue-400"
                      )}
                    >
                      {selectedProduct.bottle_type === "oil"
                        ? "Oil Bottle"
                        : "Spray Bottle"}
                    </Badge>
                  )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onProductSelect(null)}
                className="h-8 px-2 text-[var(--darkroom-text-muted)] hover:text-[var(--darkroom-accent)] hover:bg-white/5"
              >
                Change
              </Button>
            </div>
          </motion.div>
        ) : (
          <div className="product-selector-wrapper">
            <ProductSelector
              value={selectedProduct?.name || ""}
              onSelect={(product) => onProductSelect(product)}
              onProductDataChange={(product) => onProductSelect(product)}
              showLabel={false}
              buttonClassName="w-full justify-between h-12 bg-[var(--camera-body-deep)] border-[var(--darkroom-border)] text-[var(--darkroom-text-muted)] hover:text-[var(--darkroom-text)] hover:border-[var(--darkroom-accent)] rounded-lg"
            />
          </div>
        )}
      </div>

      {/* Section: Image Inputs */}
      <div className="left-rail__section">
        <div className="flex items-center gap-2 mb-3">
          <LEDIndicator 
            state={productImage || backgroundImage || styleReference ? "ready" : "off"} 
            size="sm" 
          />
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--darkroom-text-muted)] font-mono">
            Reference Images
          </span>
        </div>

        {/* Primary: Product Image - Always Visible */}
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-2">
            <Image className="w-3 h-3 text-[var(--darkroom-accent)]" />
            <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--darkroom-text-dim)] font-mono">
              Product Image
            </span>
          </div>
          <UploadZone
            type="product"
            label="Product Image"
            description="For enhancement & placement"
            image={productImage}
            onUpload={onProductImageUpload}
            onRemove={() => onProductImageUpload(null)}
            onLibraryOpen={() => setShowProductLibrary(true)}
            disabled={isGenerating}
          />
        </div>

        {/* Secondary Uploads: Collapsed by Default */}
        <div className="secondary-uploads space-y-3">
          {/* Background Scene */}
          <AnimatePresence>
            {!showBackgroundUpload && !backgroundImage ? (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowBackgroundUpload(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-[var(--camera-body-deep)] border border-dashed border-[var(--darkroom-border)] text-[var(--darkroom-text-dim)] text-xs font-mono uppercase tracking-wider hover:border-[var(--darkroom-accent)] hover:text-[var(--darkroom-accent)] transition-all duration-200"
                disabled={isGenerating}
              >
                <Layers className="w-3.5 h-3.5" />
                Add Background Scene
              </motion.button>
            ) : (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Layers className="w-3 h-3 text-[var(--darkroom-accent)]" />
                  <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--darkroom-text-dim)] font-mono">
                    Background Scene
                  </span>
                </div>
                <UploadZone
                  type="background"
                  label="Background Scene"
                  description="Composites product into scene"
                  image={backgroundImage}
                  onUpload={onBackgroundImageUpload}
                  onRemove={() => {
                    onBackgroundImageUpload(null);
                    setShowBackgroundUpload(false);
                  }}
                  disabled={isGenerating}
                />
              </div>
            )}
          </AnimatePresence>

          {/* Style Reference */}
          <AnimatePresence>
            {!showStyleUpload && !styleReference ? (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowStyleUpload(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-[var(--camera-body-deep)] border border-dashed border-[var(--darkroom-border)] text-[var(--darkroom-text-dim)] text-xs font-mono uppercase tracking-wider hover:border-[var(--darkroom-accent)] hover:text-[var(--darkroom-accent)] transition-all duration-200"
                disabled={isGenerating}
              >
                <Palette className="w-3.5 h-3.5" />
                Add Style Reference
              </motion.button>
            ) : (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Palette className="w-3 h-3 text-[var(--darkroom-accent)]" />
                  <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--darkroom-text-dim)] font-mono">
                    Style Reference
                  </span>
                </div>
                <UploadZone
                  type="style"
                  label="Style Reference"
                  description="Matches lighting & mood"
                  image={styleReference}
                  onUpload={onStyleReferenceUpload}
                  onRemove={() => {
                    onStyleReferenceUpload(null);
                    setShowStyleUpload(false);
                  }}
                  disabled={isGenerating}
                />
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Generate Button - Sticky Bottom */}
      <GenerateButton
        hasProduct={!!productImage}
        hasBackground={!!backgroundImage}
        hasStyle={!!styleReference}
        proSettingsCount={proSettingsCount}
        onGenerate={onGenerate}
        isGenerating={isGenerating}
        disabled={!canGenerate}
        sessionCount={sessionCount}
        maxImages={maxImages}
      />

      <ImageLibraryModal
        open={showProductLibrary}
        onOpenChange={setShowProductLibrary}
        onSelectImage={onProductImageUpload}
        title="Select Product Image"
      />
    </aside>
  );
}
