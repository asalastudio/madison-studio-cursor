import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { LEDIndicator } from "@/components/darkroom/LEDIndicator";
import {
  BACKGROUND_PRESETS,
  LIGHT_DIRECTIONS,
  SHADOW_DIRECTIONS,
  SHADOW_INTENSITIES,
  getLightDirectionPreset,
  type StudioSettings,
} from "@/config/consistencyVariations";

interface StudioControlsProps {
  value: StudioSettings;
  onChange: (next: StudioSettings) => void;
  disabled?: boolean;
}

/**
 * Studio fine-tuning camera panel — three linked controls that thread
 * through to the scene anchor of every variation in the set.
 *
 *   1. Background — 6 preset backdrop colours (Bone/Cream/Sand/Cool
 *      Bone/Studio White/Charcoal). Feeds into the studio-brief line of
 *      the prompt.
 *   2. Light direction — 6 named lighting presets (Classic 45°, Soft Top,
 *      Dramatic Side, Backlit Halo, Flat Front, Low-Angle). Each preset
 *      carries a recommended shadow direction + intensity.
 *   3. Shadow — 9-position compass + 3 intensities. Defaults are
 *      auto-updated when the light preset changes, but the user can
 *      override either axis independently for stylised looks.
 *
 * Everything composes client-side into the scene anchor text that the
 * orchestrator sends with each variation, so the whole set shares one
 * locked studio treatment.
 */
export function StudioControls({
  value,
  onChange,
  disabled = false,
}: StudioControlsProps) {
  const activeBg = useMemo(
    () => BACKGROUND_PRESETS.find((b) => b.id === value.backgroundId),
    [value.backgroundId],
  );

  /**
   * When the user changes the light preset we auto-sync shadow to its
   * physically-consistent default. They can still manually override the
   * shadow direction/intensity afterwards — we only auto-update on the
   * light-preset change event, not on every render.
   */
  const handleLightChange = (lightId: string) => {
    const preset = getLightDirectionPreset(lightId);
    onChange({
      ...value,
      lightDirectionId: lightId,
      shadowDirectionId: preset.defaultShadowDirectionId,
      shadowIntensityId: preset.defaultShadowIntensityId,
    });
  };

  return (
    <div className="camera-panel p-2.5 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-1.5">
        <LEDIndicator state="ready" size="sm" />
        <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--darkroom-accent)]">
          Studio
        </span>
        <span className="text-[9px] text-[var(--darkroom-text-dim)]">
          shared across every frame
        </span>
      </div>

      {/* ─── Background ───────────────────────────────────────────── */}
      <section className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--darkroom-text-muted)]">
            Background
          </div>
          {activeBg ? (
            <div className="text-[9px] font-mono text-[var(--darkroom-text-dim)]">
              {activeBg.hex}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1">
          {BACKGROUND_PRESETS.map((bg) => {
            const isSelected = bg.id === value.backgroundId;
            return (
              <button
                key={bg.id}
                type="button"
                onClick={() => onChange({ ...value, backgroundId: bg.id })}
                disabled={disabled}
                title={bg.label}
                className={cn(
                  "flex items-center gap-1.5 pl-1 pr-2 py-1 rounded border text-[10px] transition-all",
                  "disabled:opacity-40 disabled:cursor-not-allowed",
                  isSelected
                    ? "border-[var(--darkroom-accent)]/50 bg-[var(--darkroom-accent)]/10 text-[var(--darkroom-text)]"
                    : "border-white/[0.06] bg-[var(--camera-body-deep)] text-[var(--darkroom-text-muted)] hover:border-white/[0.15] hover:text-[var(--darkroom-text)]",
                )}
              >
                <span
                  className="inline-block w-3.5 h-3.5 rounded border border-white/20 flex-shrink-0"
                  style={{ backgroundColor: bg.hex }}
                />
                <span className="font-medium">{bg.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ─── Light direction ──────────────────────────────────────── */}
      <section className="space-y-1.5 pt-2 border-t border-white/[0.04]">
        <div className="flex items-baseline justify-between">
          <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--darkroom-text-muted)]">
            Light Direction
          </div>
          <div className="text-[9px] text-[var(--darkroom-text-dim)]">
            shadow auto-updates
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {LIGHT_DIRECTIONS.map((light) => {
            const isSelected = light.id === value.lightDirectionId;
            return (
              <button
                key={light.id}
                type="button"
                onClick={() => handleLightChange(light.id)}
                disabled={disabled}
                title={light.description.slice(0, 140) + "…"}
                className={cn(
                  "px-2 py-1 rounded border text-[10px] transition-all",
                  "disabled:opacity-40 disabled:cursor-not-allowed",
                  isSelected
                    ? "border-[var(--darkroom-accent)]/50 bg-[var(--darkroom-accent)]/10 text-[var(--darkroom-text)]"
                    : "border-white/[0.06] bg-[var(--camera-body-deep)] text-[var(--darkroom-text-muted)] hover:border-white/[0.15] hover:text-[var(--darkroom-text)]",
                )}
              >
                <span className="font-medium">{light.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ─── Shadow direction compass ─────────────────────────────── */}
      <section className="space-y-1.5 pt-2 border-t border-white/[0.04]">
        <div className="flex items-baseline justify-between">
          <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--darkroom-text-muted)]">
            Shadow Direction
          </div>
          <div className="text-[9px] text-[var(--darkroom-text-dim)]">
            where the shadow falls
          </div>
        </div>
        <ShadowCompass
          value={value.shadowDirectionId}
          onChange={(id) => onChange({ ...value, shadowDirectionId: id })}
          disabled={disabled}
        />
      </section>

      {/* ─── Shadow intensity ─────────────────────────────────────── */}
      <section className="space-y-1.5 pt-2 border-t border-white/[0.04]">
        <div className="flex items-baseline justify-between">
          <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--darkroom-text-muted)]">
            Shadow Intensity
          </div>
        </div>
        <div className="flex gap-1">
          {SHADOW_INTENSITIES.map((intensity) => {
            const isSelected = intensity.id === value.shadowIntensityId;
            return (
              <button
                key={intensity.id}
                type="button"
                onClick={() =>
                  onChange({ ...value, shadowIntensityId: intensity.id })
                }
                disabled={disabled}
                className={cn(
                  "flex-1 px-2 py-1 rounded border text-[10px] transition-all",
                  "disabled:opacity-40 disabled:cursor-not-allowed",
                  isSelected
                    ? "border-[var(--darkroom-accent)]/50 bg-[var(--darkroom-accent)]/10 text-[var(--darkroom-text)]"
                    : "border-white/[0.06] bg-[var(--camera-body-deep)] text-[var(--darkroom-text-muted)] hover:border-white/[0.15] hover:text-[var(--darkroom-text)]",
                )}
              >
                <span className="font-medium">{intensity.label}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

interface ShadowCompassProps {
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}

/**
 * 3×3 grid positioning the 9 shadow options spatially (N on top, S on
 * bottom, Beneath in the centre). Each tile is a small button that
 * visually implies the shadow direction by its position.
 */
function ShadowCompass({ value, onChange, disabled }: ShadowCompassProps) {
  // Layout: 9 cells, row-major N-row / E-row / S-row with "beneath" at
  // dead centre. The ids must match SHADOW_DIRECTIONS ids exactly.
  const grid: Array<string | null> = [
    "nw", "n", "ne",
    "w", "beneath", "e",
    "sw", "s", "se",
  ];

  return (
    <div className="grid grid-cols-3 gap-1 w-28 mx-auto">
      {grid.map((id, i) => {
        if (!id) return <div key={i} />;
        const preset = SHADOW_DIRECTIONS.find((s) => s.id === id);
        if (!preset) return <div key={i} />;
        const isSelected = id === value;
        const isCentre = id === "beneath";
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            disabled={disabled}
            title={preset.label}
            className={cn(
              "aspect-square rounded border text-[9px] font-mono transition-all",
              "disabled:opacity-40 disabled:cursor-not-allowed",
              "flex items-center justify-center",
              isCentre && "border-dashed",
              isSelected
                ? "border-[var(--darkroom-accent)]/60 bg-[var(--darkroom-accent)]/15 text-[var(--darkroom-accent)]"
                : "border-white/[0.08] bg-[var(--camera-body-deep)] text-[var(--darkroom-text-dim)] hover:border-white/[0.20] hover:text-[var(--darkroom-text)]",
            )}
          >
            {isCentre ? "●" : preset.label.split(" · ")[0]}
          </button>
        );
      })}
    </div>
  );
}
