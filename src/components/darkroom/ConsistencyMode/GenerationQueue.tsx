import { CheckCircle2, AlertCircle, Aperture, Clock, Ban, Star, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { LEDIndicator } from "@/components/darkroom/LEDIndicator";
import type { VariationItem, VariationItemStatus } from "@/lib/consistencyMode";

interface GenerationQueueProps {
  items: VariationItem[];
  /** Total expected items (defaults to items.length). */
  total?: number;
  /**
   * Optional callback — if provided, completed items render a "Use as
   * Master" star button. Clicking promotes that variation's rendered image
   * to become the new master reference for the set, so subsequent runs
   * anchor on an already-perfect studio shot instead of the raw upload.
   */
  onPromoteToMaster?: (item: VariationItem) => void;
  /** Id of the item currently being used as the master (for the ✓ indicator). */
  activeMasterItemId?: string | null;
  /**
   * Optional callback — if provided, completed items render a "Mark as
   * Hero" heart button. Hero is a durable tag stored in library_tags so
   * images can be discovered as featured renders later.
   */
  onToggleHero?: (item: VariationItem) => void;
  /** Set of savedImageIds currently tagged as Hero. */
  heroImageIds?: Set<string>;
}

type LEDState = "off" | "ready" | "active" | "processing" | "error";

const STATUS_META: Record<VariationItemStatus, {
  Icon: typeof Clock;
  iconClass: string;
  label: string;
  ledState: LEDState;
}> = {
  pending: {
    Icon: Clock,
    iconClass: "text-[var(--darkroom-text-dim)]",
    label: "Queued",
    ledState: "off",
  },
  running: {
    Icon: Aperture,
    iconClass: "text-[var(--darkroom-accent)] darkroom-exposing-pulse",
    label: "Exposing",
    ledState: "processing",
  },
  complete: {
    Icon: CheckCircle2,
    iconClass: "text-[var(--led-ready)]",
    label: "Captured",
    ledState: "ready",
  },
  error: {
    Icon: AlertCircle,
    iconClass: "text-[var(--led-error)]",
    label: "Failed",
    ledState: "error",
  },
  cancelled: {
    Icon: Ban,
    iconClass: "text-[var(--darkroom-text-dim)]",
    label: "Cancelled",
    ledState: "off",
  },
};

/**
 * Live per-variation queue. Mirrors the filmstrip aesthetic from the main
 * Dark Room canvas — each row is a frame in the set, with the LED showing
 * live state and a thumbnail once the image is returned.
 */
export function GenerationQueue({
  items,
  total,
  onPromoteToMaster,
  activeMasterItemId,
  onToggleHero,
  heroImageIds,
}: GenerationQueueProps) {
  const expected = total ?? items.length;
  const done = items.filter((i) => i.status === "complete").length;
  const failed = items.filter((i) => i.status === "error").length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[9px] font-mono uppercase tracking-wider text-[var(--darkroom-text-dim)]">
        <span>Frames exposed</span>
        <span>
          {done}/{expected}
          {failed > 0 ? ` · ${failed} failed` : ""}
        </span>
      </div>

      <div className="space-y-1">
        {items.map((item) => {
          const meta = STATUS_META[item.status];
          const Icon = meta.Icon;
          const canPromote =
            !!onPromoteToMaster &&
            item.status === "complete" &&
            !!item.imageUrl;
          const isActiveMaster =
            activeMasterItemId != null &&
            item.savedImageId === activeMasterItemId;
          const canHero =
            !!onToggleHero &&
            item.status === "complete" &&
            !!item.savedImageId;
          const isHero =
            !!item.savedImageId && heroImageIds?.has(item.savedImageId) === true;
          return (
            <div
              key={item.position}
              className={cn(
                "flex items-center gap-2.5 px-2 py-1.5 rounded border transition-colors",
                "border-white/[0.04] bg-[var(--camera-body-deep)]",
                item.status === "error" && "border-[color-mix(in_srgb,var(--led-error)_20%,transparent)]",
                item.status === "complete" && "border-[color-mix(in_srgb,var(--led-ready)_20%,transparent)]",
                isActiveMaster && "border-[color-mix(in_srgb,var(--darkroom-accent)_50%,transparent)] bg-[color-mix(in_srgb,var(--darkroom-accent)_5%,transparent)]",
              )}
            >
              {/* Frame number + LED */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-[9px] font-mono text-[var(--darkroom-text-dim)] w-4 text-right">
                  {String(item.position + 1).padStart(2, "0")}
                </span>
                <LEDIndicator state={meta.ledState} size="sm" />
              </div>

              {/* Thumbnail */}
              <div
                className={cn(
                  "relative flex-shrink-0 w-9 h-9 rounded bg-black/60 border border-white/[0.06] overflow-hidden flex items-center justify-center",
                  item.status === "running" && "darkroom-exposing-frame",
                )}
              >
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt={item.label}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Icon size={12} className={meta.iconClass} />
                )}
              </div>

              {/* Meta */}
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-[var(--darkroom-text)] truncate font-medium flex items-center gap-1.5">
                  {item.label}
                  {isActiveMaster && (
                    <span className="text-[8px] font-mono uppercase tracking-wider px-1 py-0.5 rounded bg-[color-mix(in_srgb,var(--darkroom-accent)_15%,transparent)] text-[var(--darkroom-accent)] border border-[color-mix(in_srgb,var(--darkroom-accent)_30%,transparent)]">
                      Master
                    </span>
                  )}
                  {isHero && (
                    <span className="text-[8px] font-mono uppercase tracking-wider px-1 py-0.5 rounded bg-pink-400/15 text-pink-300 border border-pink-400/30">
                      Hero
                    </span>
                  )}
                </div>
                <div
                  className={cn(
                    "text-[9px] font-mono uppercase tracking-wider",
                    item.status === "running"
                      ? "darkroom-exposing-text"
                      : meta.iconClass,
                  )}
                >
                  {meta.label}
                  {item.status === "error" && item.error ? ` · ${truncate(item.error, 44)}` : ""}
                </div>
              </div>

              {/* Hero tag toggle — durable, persists across sessions */}
              {canHero && (
                <button
                  type="button"
                  onClick={() => onToggleHero!(item)}
                  title={
                    isHero
                      ? "Remove hero tag"
                      : "Mark as hero — featured render for this variation"
                  }
                  className={cn(
                    "flex-shrink-0 w-6 h-6 rounded border flex items-center justify-center transition-colors",
                    isHero
                      ? "border-pink-400/50 bg-pink-400/15 text-pink-300"
                      : "border-white/[0.06] bg-black/20 text-[var(--darkroom-text-dim)] hover:border-pink-400/50 hover:text-pink-300 hover:bg-black/40",
                  )}
                >
                  <Heart
                    size={11}
                    className={cn(isHero && "fill-current")}
                  />
                </button>
              )}

              {/* Use-as-Master promotion button — only on completed items */}
              {canPromote && (
                <button
                  type="button"
                  onClick={() => onPromoteToMaster!(item)}
                  disabled={isActiveMaster}
                  title={
                    isActiveMaster
                      ? "This image is the current master"
                      : "Use this image as the master for future variations"
                  }
                  className={cn(
                    "flex-shrink-0 w-6 h-6 rounded border flex items-center justify-center transition-colors",
                    isActiveMaster
                      ? "border-[color-mix(in_srgb,var(--darkroom-accent)_50%,transparent)] bg-[color-mix(in_srgb,var(--darkroom-accent)_15%,transparent)] text-[var(--darkroom-accent)] cursor-default"
                      : "border-white/[0.06] bg-black/20 text-[var(--darkroom-text-dim)] hover:border-[color-mix(in_srgb,var(--darkroom-accent)_50%,transparent)] hover:text-[var(--darkroom-accent)] hover:bg-black/40",
                  )}
                >
                  <Star
                    size={11}
                    className={cn(isActiveMaster && "fill-current")}
                  />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}
