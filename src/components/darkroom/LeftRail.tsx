import { useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Package, Image, Palette, Layers, BookOpen, Info, Route, Landmark, Sparkles } from "lucide-react";
import {
  BEST_BOTTLES_HERO_SET_PRESETS,
  HERO_SET_CANVAS,
  getHeroSetPreset,
  type HeroSetPopulation,
  type HeroSetPresetId,
} from "@/lib/darkroomHeroSetPresets";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  BACKGROUND_SCENE_TAG,
  LIBRARY_ROLE_BACKGROUND_SCENE,
} from "@/lib/imageLibraryTags";
import { StyleReferenceGuideModal } from "./StyleReferenceGuideModal";
import { UploadZone } from "./UploadZone";
import { GenerateButton } from "./GenerateButton";
import { LEDIndicator } from "./LEDIndicator";
import type { ProModeSettings } from "./ProSettings";
import { ProductSelector } from "@/components/forge/ProductSelector";
import { Product } from "@/hooks/useProducts";
import type { DarkroomProductContextSummary } from "@/lib/darkroomProductContext";
import { cn } from "@/lib/utils";
import { ImageLibraryModal } from "@/components/image-editor/ImageLibraryModal";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { DarkroomSchematicPromptMode } from "@/lib/darkroomSchematicPrompts";
import type { BestBottlesStoneHeroArrangement } from "@/lib/darkroomHeroPrompts";

interface UploadedImage {
  url: string;
  file?: File;
  name?: string;
}

interface LeftRailProps {
  // Product
  selectedProduct: Product | null;
  onProductSelect: (product: Product | null) => void;
  /** Compact, render-ready enrichment summary for the Product Context card. */
  productContextSummary?: DarkroomProductContextSummary | null;
  /** Explicit operator action to load (or replace with) the product's reference image. */
  onLoadReferenceImage?: () => void;

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
  onUseSchematicPrompt: (mode: DarkroomSchematicPromptMode) => void;
  onUseBestBottlesHeroPrompt: (arrangement: BestBottlesStoneHeroArrangement) => void;
  onUseHeroSetPreset: (presetId: HeroSetPresetId, options?: { population?: HeroSetPopulation }) => void;
  /** Best Bottles org only — these directions are that client's homepage. */
  showHeroSetPresets?: boolean;

  // Session info
  sessionCount: number;
  maxImages: number;

  /** When true, the next generation is an empty background plate (tagged for scene library). */
  backgroundPlateMode: boolean;
  onBackgroundPlateModeChange: (value: boolean) => void;

  /** When true and a style reference image is set, the render is tagged for the style-reference library bucket. */
  styleReferenceLibraryOutput: boolean;
  onStyleReferenceLibraryOutputChange: (value: boolean) => void;
}

function InlineHelp({ children }: { children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[var(--darkroom-text-dim)] hover:text-[var(--darkroom-accent)]"
          aria-label="More information"
        >
          <Info className="h-3 w-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="right"
        className="max-w-[260px] border-[var(--darkroom-border)] bg-[var(--camera-body)] text-[11px] leading-relaxed text-[var(--darkroom-text)]"
      >
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

function ContextRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[9px] font-mono uppercase tracking-[0.08em] text-[var(--darkroom-text-dim)]">
        {label}
      </span>
      <span className="truncate text-[10px] font-medium text-[var(--darkroom-text)]" title={value}>
        {value}
      </span>
    </div>
  );
}

/** Compact enrichment readout: identifiers, measurements, and reference-image status. */
function ProductContextCard({
  summary,
  onLoadReferenceImage,
}: {
  summary: DarkroomProductContextSummary;
  onLoadReferenceImage?: () => void;
}) {
  const statusLabel =
    summary.imageStatus === "missing"
      ? "Missing image"
      : summary.isBestBottles && !summary.hasMeasurements
        ? "Missing measurements"
        : "Full context loaded";

  const statusReady = statusLabel === "Full context loaded";

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-[var(--darkroom-border)] bg-[color-mix(in_srgb,var(--camera-body-deep)_40%,transparent)] p-2.5">
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className={cn(
            "px-1.5 py-0 text-[8px] font-mono uppercase tracking-wider",
            statusReady
              ? "border-[color-mix(in_srgb,var(--led-ready)_30%,transparent)] bg-[color-mix(in_srgb,var(--led-ready)_10%,transparent)] text-[var(--led-ready)]"
              : "border-amber-500/30 bg-amber-500/10 text-amber-400",
          )}
        >
          {statusLabel}
        </Badge>
      </div>

      <div className="space-y-1">
        {summary.sku && <ContextRow label="SKU" value={summary.sku} />}
        {summary.graceSku && summary.graceSku !== summary.sku && (
          <ContextRow label="Grace SKU" value={summary.graceSku} />
        )}
        {summary.websiteSku && <ContextRow label="Website SKU" value={summary.websiteSku} />}
        {summary.capacity && <ContextRow label="Capacity" value={summary.capacity} />}
        {summary.heightWithoutCap && <ContextRow label="Body height" value={summary.heightWithoutCap} />}
        {summary.diameter && <ContextRow label="Diameter" value={summary.diameter} />}
        {summary.applicator && <ContextRow label="Applicator" value={summary.applicator} />}
        <ContextRow label="Image" value={summary.imageSourceLabel} />
        {summary.isBestBottles && !summary.hasMeasurements && (
          <p className="pt-0.5 text-[9px] leading-relaxed text-amber-400/80">
            Measurements unavailable — generation falls back to catalog defaults.
          </p>
        )}
      </div>

      {onLoadReferenceImage && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onLoadReferenceImage}
          className="h-7 w-full border-[var(--darkroom-border)] bg-[color-mix(in_srgb,var(--darkroom-bg)_40%,transparent)] px-2 text-[9px] font-mono uppercase tracking-wider text-[var(--darkroom-text-muted)] hover:border-[var(--darkroom-accent)] hover:text-[var(--darkroom-accent)]"
        >
          <Image className="mr-1.5 h-3 w-3" />
          {summary.imageStatus === "missing" ? "Load product image" : "Use product reference"}
        </Button>
      )}
    </div>
  );
}

export function LeftRail({
  selectedProduct,
  onProductSelect,
  productContextSummary,
  onLoadReferenceImage,
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
  onUseSchematicPrompt,
  onUseBestBottlesHeroPrompt,
  onUseHeroSetPreset,
  showHeroSetPresets = false,
  sessionCount,
  maxImages,
  backgroundPlateMode,
  onBackgroundPlateModeChange,
  styleReferenceLibraryOutput,
  onStyleReferenceLibraryOutputChange,
}: LeftRailProps) {
  const [heroSetId, setHeroSetId] = useState<HeroSetPresetId>("silver-travertine");
  // Scenes are nearly always built around a product reference, so default to
  // placing it. Empty is the deliberate exception (composite the real bottle
  // in later), not the common case.
  const [heroSetPopulation, setHeroSetPopulation] = useState<HeroSetPopulation>("empty");
  const effectiveHeroPopulation: HeroSetPopulation =
    heroSetPopulation === "empty" && productImage ? "place-product" : heroSetPopulation;
  const [showBackgroundUpload, setShowBackgroundUpload] = useState(false);
  const [showStyleUpload, setShowStyleUpload] = useState(false);
  const [showProductLibrary, setShowProductLibrary] = useState(false);
  const [showBackgroundLibrary, setShowBackgroundLibrary] = useState(false);
  const [styleGuideOpen, setStyleGuideOpen] = useState(false);

  const proSettingsCount = Object.values(proSettings).filter(Boolean).length;

  return (
    <TooltipProvider delayDuration={150}>
    <aside className="left-rail">
      {/* Section: Product Selection */}
      <div className="left-rail__section">
        <div className="flex items-center gap-2 mb-3">
          <LEDIndicator state={selectedProduct ? "ready" : "off"} size="sm" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--darkroom-text-muted)] font-mono">
            Product Context
          </span>
          <InlineHelp>
            Product Context adds structured details like SKU, brand notes, bottle type, and product metadata. It does not replace the Product Reference Image when exact packaging needs to match.
          </InlineHelp>
          <Badge
            variant="outline"
            className="ml-auto border-white/[0.08] bg-white/[0.03] px-1.5 py-0 text-[8px] font-mono uppercase tracking-wider text-[var(--darkroom-text-dim)]"
          >
            Optional
          </Badge>
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
                          ? "bg-[color-mix(in_srgb,var(--led-ready)_10%,transparent)] border-[color-mix(in_srgb,var(--led-ready)_30%,transparent)] text-[var(--led-ready)]"
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

            {productContextSummary && (
              <ProductContextCard
                summary={productContextSummary}
                onLoadReferenceImage={onLoadReferenceImage}
              />
            )}
          </motion.div>
        ) : (
          <div className="product-selector-wrapper space-y-2">
            <ProductSelector
              value={selectedProduct?.name || ""}
              onSelect={(product) => onProductSelect(product)}
              onProductDataChange={(product) => onProductSelect(product)}
              showLabel={false}
              buttonClassName="w-full justify-between h-12 bg-[var(--camera-body-deep)] border-[var(--darkroom-border)] text-[var(--darkroom-text-muted)] hover:text-[var(--darkroom-text)] hover:border-[var(--darkroom-accent)] rounded-lg"
            />
            <p className="text-[10px] leading-relaxed text-[var(--darkroom-text-dim)]">
              Adds SKU, brand, and product notes. Use the product reference below when you need the image to match exact packaging.
            </p>
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

        <div className="mb-4 rounded-lg border border-[var(--darkroom-border)] bg-[color-mix(in_srgb,var(--camera-body-deep)_50%,transparent)] p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label
              htmlFor="background-plate-mode"
              className="text-[10px] font-mono uppercase tracking-[0.08em] text-[var(--darkroom-text-dim)] cursor-pointer"
            >
              Background plate mode
            </Label>
            <InlineHelp>
              Use this when you want to create a reusable empty scene first. Product uploads are disabled in this mode so the output stays clean for later compositing.
            </InlineHelp>
            <Badge
              variant="outline"
              className="ml-auto mr-1 border-[color-mix(in_srgb,var(--darkroom-accent)_20%,transparent)] bg-[color-mix(in_srgb,var(--darkroom-accent)_5%,transparent)] px-1.5 py-0 text-[8px] font-mono uppercase tracking-wider text-[var(--darkroom-accent)]"
            >
              Advanced
            </Badge>
            <Switch
              id="background-plate-mode"
              checked={backgroundPlateMode}
              onCheckedChange={onBackgroundPlateModeChange}
              disabled={isGenerating}
            />
          </div>
          <p className="text-[10px] leading-relaxed text-[var(--darkroom-text-muted)]">
            Creates an empty background scene with no product. Use it later as a reusable set for composite shots.
          </p>
        </div>

        {/* Primary: Product Image - Always Visible */}
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-2">
            <Image className="w-3 h-3 text-[var(--darkroom-accent)]" />
            <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--darkroom-text-dim)] font-mono">
              Product Reference Image
            </span>
            <InlineHelp>
              Upload this when the generated product must preserve real packaging, shape, label placement, or materials. For concept-only exploration, a written prompt can be enough.
            </InlineHelp>
          </div>
          <UploadZone
            type="product"
            label="Product Reference"
            description={
              backgroundPlateMode
                ? "Disabled while creating an empty background plate"
                : "Controls exact shape, label, and placement"
            }
            image={productImage}
            onUpload={onProductImageUpload}
            onRemove={() => onProductImageUpload(null)}
            onLibraryOpen={() => setShowProductLibrary(true)}
            disabled={isGenerating || backgroundPlateMode}
          />
          <div className="mt-3 rounded-lg border border-[var(--darkroom-border)] bg-[color-mix(in_srgb,var(--camera-body-deep)_50%,transparent)] p-2.5">
            <div className="mb-2 flex items-center gap-2">
              <Route className="h-3 w-3 text-[var(--darkroom-accent)]" />
              <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--darkroom-text-dim)]">
                Schematic preset
              </span>
              <InlineHelp>
                Prefills the prompt for GPT Image 2 reference editing while preserving the source canvas and product identity.
              </InlineHelp>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isGenerating || backgroundPlateMode || !productImage}
                onClick={() => onUseSchematicPrompt("whole-product")}
                className="h-9 justify-start gap-2 border-[var(--darkroom-border)] bg-[color-mix(in_srgb,var(--darkroom-bg)_40%,transparent)] px-2 text-[10px] text-[var(--darkroom-text-muted)] hover:border-[var(--darkroom-accent)] hover:text-[var(--darkroom-accent)]"
                title="Prefill a whole-product schematic prompt"
              >
                <Package className="h-3.5 w-3.5" />
                Whole
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isGenerating || backgroundPlateMode || !productImage}
                onClick={() => onUseSchematicPrompt("exploded")}
                className="h-9 justify-start gap-2 border-[var(--darkroom-border)] bg-[color-mix(in_srgb,var(--darkroom-bg)_40%,transparent)] px-2 text-[10px] text-[var(--darkroom-text-muted)] hover:border-[var(--darkroom-accent)] hover:text-[var(--darkroom-accent)]"
                title="Prefill an exploded assembly schematic prompt"
              >
                <Layers className="h-3.5 w-3.5" />
                Exploded
              </Button>
            </div>
          </div>
          <div className="mt-3 rounded-lg border border-[var(--darkroom-border)] bg-[color-mix(in_srgb,var(--camera-body-deep)_50%,transparent)] p-2.5">
            <div className="mb-1.5 flex items-center gap-2">
              <Landmark className="h-3 w-3 text-[var(--darkroom-accent)]" />
              <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--darkroom-text-dim)]">
                Best Bottles hero
              </span>
              <InlineHelp>
                Prefills a client-specific homepage hero prompt. The product identity stays locked while the stone plinth style cycles through eight Best Bottles stone set directions.
              </InlineHelp>
            </div>
            <p className="mb-2 text-[10px] leading-relaxed text-[var(--darkroom-text-muted)]">
              Uses selected aspect ratio; defaults to 16:9. Cycles 8 stone styles on Bone #F5F3EF.
            </p>
            <div className="grid grid-cols-3 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isGenerating || backgroundPlateMode || !productImage}
                onClick={() => onUseBestBottlesHeroPrompt("single-stone")}
                className="h-9 justify-start gap-1.5 border-[var(--darkroom-border)] bg-[color-mix(in_srgb,var(--darkroom-bg)_40%,transparent)] px-2 text-[10px] text-[var(--darkroom-text-muted)] hover:border-[var(--darkroom-accent)] hover:text-[var(--darkroom-accent)]"
                title="Prefill a homepage hero prompt with one stone plinth"
              >
                <Package className="h-3.5 w-3.5" />
                1 stone
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isGenerating || backgroundPlateMode || !productImage}
                onClick={() => onUseBestBottlesHeroPrompt("two-stone")}
                className="h-9 justify-start gap-1.5 border-[var(--darkroom-border)] bg-[color-mix(in_srgb,var(--darkroom-bg)_40%,transparent)] px-2 text-[10px] text-[var(--darkroom-text-muted)] hover:border-[var(--darkroom-accent)] hover:text-[var(--darkroom-accent)]"
                title="Prefill a homepage hero prompt with two stone forms"
              >
                <Landmark className="h-3.5 w-3.5" />
                2 stones
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isGenerating || backgroundPlateMode || !productImage}
                onClick={() => onUseBestBottlesHeroPrompt("stone-cluster")}
                className="h-9 justify-start gap-1.5 border-[var(--darkroom-border)] bg-[color-mix(in_srgb,var(--darkroom-bg)_40%,transparent)] px-2 text-[10px] text-[var(--darkroom-text-muted)] hover:border-[var(--darkroom-accent)] hover:text-[var(--darkroom-accent)]"
                title="Prefill a homepage hero prompt with a restrained stone cluster"
              >
                <Layers className="h-3.5 w-3.5" />
                Cluster
              </Button>
            </div>
          </div>

          {showHeroSetPresets && (
            <div className="mt-3 rounded-lg border border-[var(--darkroom-border)] bg-[color-mix(in_srgb,var(--camera-body-deep)_50%,transparent)] p-2.5">
              <div className="mb-1.5 flex items-center gap-2">
                <Sparkles className="h-3 w-3 text-[var(--darkroom-accent)]" />
                <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--darkroom-text-dim)]">
                  Hero sets · empty
                </span>
                <InlineHelp>
                  Ten art directions for an empty homepage set at {HERO_SET_CANVAS.widthPx}x{HERO_SET_CANVAS.heightPx}, generated on GPT Image 2.5 Sunburst. No product reference needed: real bottles are composited in afterwards from catalogue dimensions, so a generated bottle is never part of the deliverable. Judge these on set, palette, light direction and how much quiet room the left side leaves for the headline.
                </InlineHelp>
              </div>
              <p className="mb-2 text-[10px] leading-relaxed text-[var(--darkroom-text-muted)]">
                {HERO_SET_CANVAS.widthPx}x{HERO_SET_CANVAS.heightPx} · 21:9 · Sunburst. Left 45% stays clear for the headline.
              </p>

              <select
                value={heroSetId}
                onChange={(event) => setHeroSetId(event.target.value as HeroSetPresetId)}
                disabled={isGenerating}
                aria-label="Hero set direction"
                className="mb-1.5 w-full rounded border border-[var(--darkroom-border)] bg-[var(--darkroom-surface)] px-2 py-1.5 text-[10px] text-[var(--darkroom-text)] disabled:opacity-40"
              >
                {BEST_BOTTLES_HERO_SET_PRESETS.map((preset) => (
                  <option
                    key={preset.id}
                    value={preset.id}
                    // Native option popups ignore the parent on Windows/Linux.
                    style={{ background: "var(--darkroom-surface)", color: "var(--darkroom-text)" }}
                  >
                    {preset.label}
                  </option>
                ))}
              </select>

              <p className="mb-2 text-[9px] leading-relaxed text-[var(--darkroom-text-dim)]">
                {getHeroSetPreset(heroSetId).direction}
              </p>

              <div className="mb-2 grid grid-cols-3 gap-1">
                {([
                  { id: "empty", label: "Empty set", hint: "The set alone, for compositing into later." },
                  { id: "place-product", label: "My product", hint: "Places the loaded product reference once, grounded in the set." },
                  { id: "mood-mock", label: "3 stand-ins", hint: "Three INVENTED bottles for judging mood. Never shippable." },
                ] as Array<{ id: HeroSetPopulation; label: string; hint: string }>).map((mode) => {
                  // "My product" needs a reference to place. "3 stand-ins" with a
                  // reference loaded makes three distorted copies of that product,
                  // which is exactly the failure this control exists to prevent.
                  const unavailable =
                    (mode.id === "place-product" && !productImage) ||
                    (mode.id === "mood-mock" && !!productImage);
                  const active = effectiveHeroPopulation === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      disabled={isGenerating || unavailable}
                      onClick={() => setHeroSetPopulation(mode.id)}
                      title={
                        unavailable
                          ? mode.id === "place-product"
                            ? "Load a product reference image first"
                            : "Unavailable while a product reference is loaded — it would generate three copies of that product. Use \u201cMy product\u201d instead."
                          : mode.hint
                      }
                      className="rounded border px-1.5 py-1.5 text-[9px] leading-tight disabled:opacity-30"
                      style={{
                        borderColor: active ? "rgba(97,214,200,0.52)" : "var(--darkroom-border)",
                        background: active ? "rgba(97,214,200,0.06)" : "transparent",
                        color: active ? "#61d6c8" : "var(--darkroom-text-dim)",
                      }}
                    >
                      {mode.label}
                    </button>
                  );
                })}
              </div>
              <p className="mb-2 text-[9px] leading-relaxed text-[var(--darkroom-text-dim)]">
                {effectiveHeroPopulation === "place-product"
                  ? "Places exactly one instance of your reference, grounded with a contact shadow and matched to the set's light."
                  : effectiveHeroPopulation === "mood-mock"
                    ? "Three invented stand-in bottles. Mood only — never shippable."
                    : "No product. Composite the real bottle in afterwards."}
              </p>

              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isGenerating}
                onClick={() => {
                  onUseHeroSetPreset(heroSetId, { population: effectiveHeroPopulation });
                  const order = BEST_BOTTLES_HERO_SET_PRESETS.map((preset) => preset.id);
                  const next = order[(order.indexOf(heroSetId) + 1) % order.length];
                  setHeroSetId(next);
                }}
                className="h-9 w-full justify-center gap-1.5 border-[var(--darkroom-border)] bg-[color-mix(in_srgb,var(--darkroom-bg)_40%,transparent)] px-2 text-[10px] text-[var(--darkroom-text-muted)] hover:border-[var(--darkroom-accent)] hover:text-[var(--darkroom-accent)]"
                title="Load this empty hero set prompt at 2688x1152 on GPT Image 2.5 Sunburst, then advance to the next direction"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Load hero set
              </Button>
              <p className="mt-1.5 text-[9px] leading-relaxed text-[var(--darkroom-text-dim)]">
                Each load advances to the next direction, so ten clicks walk the whole set.
              </p>
            </div>
          )}
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
                title="Add an existing background or set image to place products into"
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
                  description="Reusable set or environment"
                  image={backgroundImage}
                  onUpload={onBackgroundImageUpload}
                  onRemove={() => {
                    onBackgroundImageUpload(null);
                    setShowBackgroundUpload(false);
                  }}
                  onLibraryOpen={() => setShowBackgroundLibrary(true)}
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
                title="Add an image whose lighting, mood, finish, or composition should guide the render"
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5 ml-auto text-[9px] font-mono uppercase tracking-wider text-[var(--darkroom-text-muted)] hover:text-[var(--darkroom-accent)]"
                    onClick={() => setStyleGuideOpen(true)}
                  >
                    <BookOpen className="w-3 h-3 mr-1" />
                    Guide
                  </Button>
                </div>
                <UploadZone
                  type="style"
                  label="Style Reference"
                  description="Guides lighting, mood, and finish"
                  image={styleReference}
                  onUpload={onStyleReferenceUpload}
                  onRemove={() => {
                    onStyleReferenceUpload(null);
                    setShowStyleUpload(false);
                  }}
                  disabled={isGenerating}
                />
                {styleReference ? (
                  <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-[var(--darkroom-border)] bg-[color-mix(in_srgb,var(--camera-body-deep)_40%,transparent)] px-2 py-1.5">
                    <Label
                      htmlFor="style-ref-library-out"
                      className="text-[10px] text-[var(--darkroom-text-muted)] cursor-pointer leading-snug"
                    >
                      Save this render to the library as a style reference
                    </Label>
                    <Switch
                      id="style-ref-library-out"
                      checked={styleReferenceLibraryOutput}
                      onCheckedChange={onStyleReferenceLibraryOutputChange}
                      disabled={isGenerating || backgroundPlateMode}
                    />
                  </div>
                ) : null}
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Generate Button - Sticky Bottom */}
      <GenerateButton
        hasProduct={backgroundPlateMode ? false : !!productImage}
        hasBackground={!!backgroundImage}
        hasStyle={!!styleReference}
        backgroundPlateMode={backgroundPlateMode}
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

      <ImageLibraryModal
        open={showBackgroundLibrary}
        onOpenChange={setShowBackgroundLibrary}
        onSelectImage={(img) => {
          onBackgroundImageUpload({ url: img.url, name: img.name });
          setShowBackgroundUpload(true);
        }}
        title="Background scenes"
        libraryTagContainsAny={[LIBRARY_ROLE_BACKGROUND_SCENE, BACKGROUND_SCENE_TAG]}
      />

      <StyleReferenceGuideModal open={styleGuideOpen} onOpenChange={setStyleGuideOpen} />
    </aside>
    </TooltipProvider>
  );
}
