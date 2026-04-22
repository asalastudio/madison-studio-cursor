import { useRef } from "react";
import { Check, ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  VARIATION_AXES,
  capsForFitments,
  type VariationAxis,
  type VariationOption,
} from "@/config/consistencyVariations";

export interface MaterialReference {
  url: string;
  name?: string;
}

/** Keyed by option.id. */
export type MaterialReferenceMap = Record<string, MaterialReference | undefined>;

interface VariationMatrixProps {
  selection: Record<VariationAxis, VariationOption[]>;
  onToggle: (axis: VariationAxis, option: VariationOption) => void;
  /**
   * Optional per-option "material reference" images. When a chip is ticked AND
   * has a reference attached, the orchestrator sends the reference as a
   * secondary product reference so the AI can match the exact surface
   * material (e.g. the swirl-fluted glass texture from a real photograph).
   */
  materialReferences: MaterialReferenceMap;
  onAttachReference: (optionId: string, ref: MaterialReference) => void;
  onRemoveReference: (optionId: string) => void;
  disabled?: boolean;
}

const MAX_REFERENCE_MB = 10;

/**
 * Three-axis chip grid for picking bottle/cap/fitment variations.
 *
 * Each chip has a small trailing "+" button that opens a file picker to
 * attach a material reference image specifically for that option. When
 * attached, the chip shows a thumbnail; click the thumbnail's "×" to
 * detach. Matches the Dark Room camera-panel aesthetic.
 */
export function VariationMatrix({
  selection,
  onToggle,
  materialReferences,
  onAttachReference,
  onRemoveReference,
  disabled = false,
}: VariationMatrixProps) {
  return (
    <div className="space-y-3">
      {VARIATION_AXES.map((axis, axisIdx) => {
        // Cap axis soft-gate: if the user has chosen one or more fitments,
        // only show caps that are actually offered with those fitments in
        // the Best Bottles catalog. This prevents generating a "Turquoise
        // roll-on" when the real SKU lineup doesn't include it.
        const selectedFitmentIds = selection.fitmentType.map((o) => o.id);
        const options =
          axis.id === "capColor" && selectedFitmentIds.length > 0
            ? capsForFitments(selectedFitmentIds)
            : axis.options;
        const gated =
          axis.id === "capColor" &&
          selectedFitmentIds.length > 0 &&
          options.length < axis.options.length;
        return (
          <div
            key={axis.id}
            className={cn(
              "space-y-1.5",
              axisIdx > 0 && "pt-3 border-t border-white/[0.04]",
            )}
          >
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--darkroom-text-muted)]">
                {axis.label}
              </div>
              <p className="text-[9px] text-[var(--darkroom-text-dim)] mt-0.5">
                {axis.helper}
                {gated
                  ? ` · showing ${options.length}/${axis.options.length} offered with your fitment`
                  : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              {options.map((option) => {
                const isSelected = selection[axis.id].some((o) => o.id === option.id);
                const attachedRef = materialReferences[option.id];
                return (
                  <VariationChip
                    key={option.id}
                    option={option}
                    isSelected={isSelected}
                    attachedRef={attachedRef}
                    disabled={disabled}
                    onToggle={() => onToggle(axis.id, option)}
                    onAttach={(ref) => onAttachReference(option.id, ref)}
                    onRemove={() => onRemoveReference(option.id)}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────

interface VariationChipProps {
  option: VariationOption;
  isSelected: boolean;
  attachedRef: MaterialReference | undefined;
  disabled: boolean;
  onToggle: () => void;
  onAttach: (ref: MaterialReference) => void;
  onRemove: () => void;
}

function VariationChip({
  option,
  isSelected,
  attachedRef,
  disabled,
  onToggle,
  onAttach,
  onRemove,
}: VariationChipProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openFilePicker = (e: React.MouseEvent) => {
    e.stopPropagation();
    fileInputRef.current?.click();
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please attach an image file");
      return;
    }
    if (file.size > MAX_REFERENCE_MB * 1024 * 1024) {
      toast.error(`Reference image too large (max ${MAX_REFERENCE_MB}MB)`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      onAttach({
        url: reader.result as string,
        name: file.name,
      });
      toast.success(`Reference attached to “${option.label}”`);
    };
    reader.onerror = () => toast.error("Failed to read image");
    reader.readAsDataURL(file);
    // Reset so the same file can be re-picked later
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveRef = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove();
    toast.success(`Reference removed from “${option.label}”`);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        title={attachedRef?.name ? `Reference: ${attachedRef.name}` : undefined}
        className={cn(
          "group flex items-center gap-1.5 pl-2 pr-1 py-1 rounded border text-[10px] transition-all",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          isSelected
            ? "border-[var(--darkroom-accent)]/50 bg-[var(--darkroom-accent)]/10 text-[var(--darkroom-text)]"
            : "border-white/[0.06] bg-[var(--camera-body-deep)] text-[var(--darkroom-text-muted)] hover:border-white/[0.15] hover:text-[var(--darkroom-text)]",
        )}
      >
        {option.swatch ? (
          <span
            className="inline-block w-2.5 h-2.5 rounded-full border border-white/20 flex-shrink-0"
            style={{ backgroundColor: option.swatch }}
          />
        ) : null}
        <span className="font-medium">{option.label}</span>
        {isSelected && (
          <Check
            size={10}
            className="text-[var(--darkroom-accent)] flex-shrink-0"
          />
        )}

        {/* Trailing reference control — either empty "+" button or a live
            thumbnail with a remove affordance. Rendered as a span inside the
            parent button to keep the chip compact; actual click targets are
            the separate buttons below positioned over it. */}
        <span
          aria-hidden
          className={cn(
            "ml-1 inline-flex items-center justify-center w-5 h-5 rounded border",
            attachedRef
              ? "border-[var(--darkroom-accent)]/40 bg-black/40 overflow-hidden p-0"
              : "border-white/[0.08] bg-black/20 text-[var(--darkroom-text-dim)]",
          )}
        >
          {attachedRef ? (
            <img
              src={attachedRef.url}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <ImagePlus size={10} />
          )}
        </span>
      </button>

      {/* Overlayed hit targets — the reference +/× control lives on top of
          the trailing span of the parent button so it's independently
          clickable without toggling selection. */}
      {attachedRef ? (
        <button
          type="button"
          onClick={handleRemoveRef}
          disabled={disabled}
          title={`Remove reference from ${option.label}`}
          className={cn(
            "absolute top-1/2 -translate-y-1/2 right-1 w-5 h-5 rounded border overflow-hidden",
            "border-[var(--darkroom-accent)]/40 bg-black/60 text-white",
            "hover:bg-[var(--led-error)] hover:border-[var(--led-error)]",
            "transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
            "flex items-center justify-center group/ref",
          )}
        >
          <img
            src={attachedRef.url}
            alt=""
            className="w-full h-full object-cover group-hover/ref:opacity-0 transition-opacity"
          />
          <X
            size={10}
            className="absolute opacity-0 group-hover/ref:opacity-100 transition-opacity"
          />
        </button>
      ) : (
        <button
          type="button"
          onClick={openFilePicker}
          disabled={disabled}
          title={`Attach a material reference for ${option.label}`}
          className={cn(
            "absolute top-1/2 -translate-y-1/2 right-1 w-5 h-5 rounded border",
            "border-white/[0.08] bg-black/30 text-[var(--darkroom-text-dim)]",
            "hover:border-[var(--darkroom-accent)]/50 hover:text-[var(--darkroom-accent)] hover:bg-black/50",
            "transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
            "flex items-center justify-center",
          )}
        >
          <ImagePlus size={10} />
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        className="hidden"
      />
    </div>
  );
}
