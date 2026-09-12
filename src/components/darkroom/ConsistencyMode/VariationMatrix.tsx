import { useState } from "react";
import { Check, ChevronDown, ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ImageLibraryModal } from "@/components/image-editor/ImageLibraryModal";
import {
  VARIATION_AXES,
  capsForFitments,
  groupFitmentsByCategory,
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

type OptionGroup = {
  id: string;
  label: string;
  helper: string;
  options: VariationOption[];
};

function getCapGroup(option: VariationOption): Pick<OptionGroup, "id" | "label" | "helper"> {
  if (option.id.includes("dots")) {
    return { id: "decorated", label: "Decorated", helper: "rhinestone + patterned" };
  }
  if (option.id.includes("silver") || option.id.includes("gold") || option.id.includes("copper")) {
    return { id: "metallic", label: "Metallic-look", helper: "silver, gold, copper" };
  }
  if (option.id.includes("wood")) {
    return { id: "natural", label: "Natural", helper: "wood + specialty" };
  }
  return { id: "solid", label: "Solid colors", helper: "black, white, color" };
}

function groupCapOptions(options: VariationOption[]): OptionGroup[] {
  const order = ["solid", "metallic", "decorated", "natural"];
  const groups = new Map<string, OptionGroup>();

  for (const option of options) {
    const group = getCapGroup(option);
    const existing = groups.get(group.id);
    if (existing) {
      existing.options.push(option);
    } else {
      groups.set(group.id, { ...group, options: [option] });
    }
  }

  return order
    .map((id) => groups.get(id))
    .filter((group): group is OptionGroup => Boolean(group));
}

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
  const [openAxes, setOpenAxes] = useState<Record<VariationAxis, boolean>>({
    bottleColor: true,
    capColor: false,
    fitmentType: false,
  });
  const [openFitmentGroups, setOpenFitmentGroups] = useState<Record<string, boolean>>({});
  const [openCapGroups, setOpenCapGroups] = useState<Record<string, boolean>>({});

  const toggleAxis = (axisId: VariationAxis) => {
    setOpenAxes((prev) => ({ ...prev, [axisId]: !prev[axisId] }));
  };

  const toggleFitmentGroup = (category: string) => {
    setOpenFitmentGroups((prev) => ({ ...prev, [category]: !prev[category] }));
  };

  const toggleCapGroup = (category: string) => {
    setOpenCapGroups((prev) => ({ ...prev, [category]: !prev[category] }));
  };

  return (
    <div className="space-y-2">
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
        const selectedOptions = selection[axis.id];
        const isOpen = openAxes[axis.id];
        const summary =
          selectedOptions.length > 0
            ? selectedOptions.map((option) => option.label).join(", ")
            : "No change selected";

        return (
          <div
            key={axis.id}
            className={cn(
              "rounded-md border border-white/[0.06] bg-black/20",
              axisIdx > 0 && "mt-2",
            )}
          >
            <button
              type="button"
              onClick={() => toggleAxis(axis.id)}
              className="flex w-full items-center justify-between gap-2 p-2 text-left"
              aria-expanded={isOpen}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--darkroom-text-muted)]">
                    {axis.label}
                  </span>
                  <span
                    className={cn(
                      "rounded border px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-wider",
                      selectedOptions.length > 0
                        ? "border-[color-mix(in_srgb,var(--darkroom-accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--darkroom-accent)_10%,transparent)] text-[var(--darkroom-accent)]"
                        : "border-white/[0.06] bg-white/[0.03] text-[var(--darkroom-text-dim)]",
                    )}
                  >
                    {selectedOptions.length || 0} selected
                  </span>
                </div>
                <p className="mt-1 truncate text-[9px] text-[var(--darkroom-text-dim)]">
                  {summary}
                </p>
              </div>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 flex-shrink-0 text-[var(--darkroom-text-dim)] transition-transform",
                  isOpen && "rotate-180",
                )}
              />
            </button>

            {isOpen && (
              <div className="space-y-2 border-t border-white/[0.04] p-2 pt-2.5">
                <p className="text-[9px] text-[var(--darkroom-text-dim)]">
                  {axis.helper}
                  {gated
                    ? ` · showing ${options.length}/${axis.options.length} offered with your fitment`
                    : ""}
                </p>

                {axis.id === "fitmentType" ? (
                  <div className="space-y-1.5">
                    {groupFitmentsByCategory(options).map((group) => {
                      const groupSelectionCount = group.options.filter((option) =>
                        selection[axis.id].some((selected) => selected.id === option.id),
                      ).length;
                      const groupOpen =
                        openFitmentGroups[group.category] || groupSelectionCount > 0;

                      return (
                        <div
                          key={group.category}
                          className="rounded border border-white/[0.04] bg-[color-mix(in_srgb,var(--camera-body-deep)_40%,transparent)]"
                        >
                          <button
                            type="button"
                            onClick={() => toggleFitmentGroup(group.category)}
                            className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left"
                            aria-expanded={groupOpen}
                          >
                            <span className="text-[9px] font-mono uppercase tracking-wider text-[var(--darkroom-text-muted)]">
                              {group.label}
                            </span>
                            <span className="ml-auto text-[8px] text-[var(--darkroom-text-dim)]">
                              {groupSelectionCount > 0
                                ? `${groupSelectionCount} selected`
                                : group.helper}
                            </span>
                            <ChevronDown
                              className={cn(
                                "h-3 w-3 flex-shrink-0 text-[var(--darkroom-text-dim)] transition-transform",
                                groupOpen && "rotate-180",
                              )}
                            />
                          </button>
                          {groupOpen && (
                            <div className="flex flex-wrap gap-1 border-t border-white/[0.04] p-2">
                              {group.options.map((option) => {
                                const isSelected = selection[axis.id].some(
                                  (o) => o.id === option.id,
                                );
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
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : axis.id === "capColor" ? (
                  <div className="space-y-1.5">
                    {groupCapOptions(options).map((group) => {
                      const groupSelectionCount = group.options.filter((option) =>
                        selection[axis.id].some((selected) => selected.id === option.id),
                      ).length;
                      const groupOpen =
                        openCapGroups[group.id] || groupSelectionCount > 0;

                      return (
                        <div
                          key={group.id}
                          className="rounded border border-white/[0.04] bg-[color-mix(in_srgb,var(--camera-body-deep)_40%,transparent)]"
                        >
                          <button
                            type="button"
                            onClick={() => toggleCapGroup(group.id)}
                            className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left"
                            aria-expanded={groupOpen}
                          >
                            <span className="text-[9px] font-mono uppercase tracking-wider text-[var(--darkroom-text-muted)]">
                              {group.label}
                            </span>
                            <span className="ml-auto text-[8px] text-[var(--darkroom-text-dim)]">
                              {groupSelectionCount > 0
                                ? `${groupSelectionCount} selected`
                                : group.helper}
                            </span>
                            <ChevronDown
                              className={cn(
                                "h-3 w-3 flex-shrink-0 text-[var(--darkroom-text-dim)] transition-transform",
                                groupOpen && "rotate-180",
                              )}
                            />
                          </button>
                          {groupOpen && (
                            <div className="flex flex-wrap gap-1 border-t border-white/[0.04] p-2">
                              {group.options.map((option) => {
                                const isSelected = selection[axis.id].some(
                                  (o) => o.id === option.id,
                                );
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
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
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
                )}
              </div>
            )}
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
  const [libraryOpen, setLibraryOpen] = useState(false);

  const openLibrary = (e: React.MouseEvent) => {
    e.stopPropagation();
    setLibraryOpen(true);
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
            ? "border-[color-mix(in_srgb,var(--darkroom-accent)_50%,transparent)] bg-[color-mix(in_srgb,var(--darkroom-accent)_10%,transparent)] text-[var(--darkroom-text)]"
            : "border-white/[0.06] bg-[var(--camera-body-deep)] text-[var(--darkroom-text-muted)] hover:border-white/[0.15] hover:text-[var(--darkroom-text)]",
        )}
      >
        {option.swatch ? (
          <span
            className="inline-block w-3.5 h-3.5 rounded-full border border-white/20 flex-shrink-0 shadow-[inset_0_-1px_2px_rgba(0,0,0,0.35)]"
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
              ? "border-[color-mix(in_srgb,var(--darkroom-accent)_40%,transparent)] bg-black/40 overflow-hidden p-0"
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
      <button
        type="button"
        onClick={openLibrary}
        disabled={disabled}
        title={
          attachedRef
            ? `Replace reference for ${option.label}`
            : `Attach a material reference for ${option.label}`
        }
        className={cn(
          "absolute top-1/2 -translate-y-1/2 right-1 w-5 h-5 rounded border overflow-hidden",
          attachedRef
            ? "border-[color-mix(in_srgb,var(--darkroom-accent)_40%,transparent)] bg-black/60 text-white"
            : "border-white/[0.08] bg-black/30 text-[var(--darkroom-text-dim)]",
          "hover:border-[color-mix(in_srgb,var(--darkroom-accent)_50%,transparent)] hover:text-[var(--darkroom-accent)] hover:bg-black/50",
          "transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
          "flex items-center justify-center group/ref",
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
      </button>

      {attachedRef && (
        <button
          type="button"
          onClick={handleRemoveRef}
          disabled={disabled}
          title={`Remove reference from ${option.label}`}
          className={cn(
            "absolute -top-1 -right-1 z-10 w-3.5 h-3.5 rounded-full border",
            "border-[color-mix(in_srgb,var(--led-error)_60%,transparent)] bg-black text-white",
            "hover:bg-[var(--led-error)] hover:border-[var(--led-error)]",
            "transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
            "flex items-center justify-center",
          )}
        >
          <X size={8} />
        </button>
      )}

      <ImageLibraryModal
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        title={`Select Reference for ${option.label}`}
        onSelectImage={(image) => {
          if (typeof image.url !== "string" || !image.url.startsWith("data:")) {
            onAttach({
              url: image.url,
              name: image.name,
            });
            toast.success(`Reference attached to “${option.label}”`);
            return;
          }

          const estimatedBytes = (image.url.length * 3) / 4;
          if (estimatedBytes > MAX_REFERENCE_MB * 1024 * 1024) {
            toast.error(`Reference image too large (max ${MAX_REFERENCE_MB}MB)`);
            return;
          }

          onAttach({
            url: image.url,
            name: image.name,
          });
          toast.success(`Reference attached to “${option.label}”`);
        }}
      />
    </div>
  );
}
