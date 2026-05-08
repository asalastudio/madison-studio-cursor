import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Star,
  Heart,
  CheckCircle2,
  Download,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LEDIndicator } from "@/components/darkroom/LEDIndicator";
import type { VariationItem } from "@/lib/consistencyMode";

interface SetReviewModalProps {
  open: boolean;
  onClose: () => void;

  /** Every item in the consistency set (pending, running, complete, error). */
  items: VariationItem[];
  /** URL of the current master anchor shown in the left rail. */
  masterImageUrl: string | null;
  /** Human name for the master (e.g. "Promoted: Cobalt Blue") shown as caption. */
  masterImageLabel?: string;
  /** Stable set identifier — shown in the header for traceability. */
  setId: string | null;
  /** Fixed seed used across the whole set — shown in the footer for traceability. */
  seed: number | null;

  // Actions
  onPromoteToMaster: (item: VariationItem) => void;
  activeMasterItemId: string | null;
  onToggleHero: (item: VariationItem) => void;
  heroImageIds: Set<string>;
  onBulkMarkHeroes?: (items: VariationItem[]) => void;
  /** Pipeline-only approval: writes selected generated image back to Madison tracker rows. */
  onApprovePipeline?: (item: VariationItem) => void;
  /** Saved image IDs already approved back to the Madison Pipeline in this session. */
  pipelineApprovedImageIds?: Set<string>;
}

/**
 * Full-screen review surface for a completed Consistency Mode set.
 *
 * Layout A: master reference pinned on the left as a fixed-width anchor
 * panel so every tile in the right-side grid can be visually compared
 * against the same source. The master never scrolls out of view — which
 * is the whole point of "consistency mode" as a product shot workflow.
 *
 * All chrome tracks Dark Room tokens:
 *   - camera-body / camera-body-deep backgrounds
 *   - darkroom-accent amber for active states
 *   - LEDIndicator for status dots
 *   - 10-11px mono uppercase labels with amber accent
 *   - Photography vocabulary ("Frames", "Exposed", "Master", "Hero")
 */
export function SetReviewModal({
  open,
  onClose,
  items,
  masterImageUrl,
  masterImageLabel,
  setId,
  seed,
  onPromoteToMaster,
  activeMasterItemId,
  onToggleHero,
  heroImageIds,
  onBulkMarkHeroes,
  onApprovePipeline,
  pipelineApprovedImageIds = new Set(),
}: SetReviewModalProps) {
  const [zoomedIndex, setZoomedIndex] = useState<number | null>(null);

  const completedItems = useMemo(
    () => items.filter((i) => i.status === "complete" && !!i.imageUrl),
    [items],
  );

  const completedCount = completedItems.length;
  const heroCount = completedItems.filter(
    (i) => i.savedImageId && heroImageIds.has(i.savedImageId),
  ).length;

  // Reset zoom whenever the modal reopens with fresh items.
  useEffect(() => {
    if (!open) setZoomedIndex(null);
  }, [open]);

  // Keyboard shortcuts: Esc / ArrowLeft / ArrowRight / Space / M
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (zoomedIndex !== null) {
          setZoomedIndex(null);
          e.preventDefault();
        } else {
          onClose();
        }
        return;
      }
      if (zoomedIndex === null) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setZoomedIndex((idx) =>
          idx === null ? null : Math.max(0, idx - 1),
        );
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setZoomedIndex((idx) =>
          idx === null ? null : Math.min(completedCount - 1, idx + 1),
        );
      } else if (e.key === " " && zoomedIndex !== null) {
        e.preventDefault();
        const item = completedItems[zoomedIndex];
        if (item) onToggleHero(item);
      } else if ((e.key === "m" || e.key === "M") && zoomedIndex !== null) {
        e.preventDefault();
        const item = completedItems[zoomedIndex];
        if (item) onPromoteToMaster(item);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, zoomedIndex, completedItems, completedCount, onClose, onToggleHero, onPromoteToMaster]);

  const handleDownload = useCallback(async (item: VariationItem) => {
    if (!item.imageUrl) return;
    try {
      const response = await fetch(item.imageUrl);
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      // Slugify label for filename safety
      const safeLabel = item.label
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase();
      anchor.download = `${safeLabel || `frame-${item.position + 1}`}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(href);
    } catch (err) {
      console.error("[SetReviewModal] download failed", err);
    }
  }, []);

  const handleBulkDownload = useCallback(async () => {
    // Sequential to avoid browser pop-up-blocker heuristics + give the user
    // a predictable filename order matching set_position.
    for (const item of completedItems) {
      await handleDownload(item);
      // Brief gap between downloads — some browsers throttle otherwise.
      await new Promise((r) => setTimeout(r, 120));
    }
  }, [completedItems, handleDownload]);

  if (!open) return null;

  const zoomedItem = zoomedIndex !== null ? completedItems[zoomedIndex] : null;

  return (
    <AnimatePresence>
      <motion.div
        key="set-review-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-stretch justify-stretch"
        onClick={onClose}
      >
        <motion.div
          key="set-review-shell"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "relative m-4 sm:m-6 flex-1 flex flex-col overflow-hidden rounded-lg border",
            "border-[var(--darkroom-border)] bg-[var(--darkroom-bg)]",
            "shadow-[0_20px_60px_rgba(0,0,0,0.6)]",
          )}
          style={{
            backgroundImage: "var(--darkroom-bg-gradient)",
          }}
        >
          {/* ─── Header ─────────────────────────────────────────────── */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--darkroom-border)] bg-[var(--camera-body)] flex-shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <LEDIndicator state="ready" size="sm" />
              <Layers className="w-3.5 h-3.5 text-[var(--darkroom-accent)] flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-[var(--darkroom-text)]">
                  Set Review
                </div>
                <div className="text-[9px] font-mono uppercase tracking-wider text-[var(--darkroom-text-dim)] truncate">
                  {completedCount} {completedCount === 1 ? "frame" : "frames"} exposed
                  {heroCount > 0 ? ` · ${heroCount} hero` : ""}
                  {setId ? ` · set ${setId.slice(0, 8)}` : ""}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              title="Close review (Esc)"
              className="flex-shrink-0 w-7 h-7 rounded border border-white/[0.06] bg-black/20 text-[var(--darkroom-text-dim)] hover:text-[var(--darkroom-text)] hover:bg-white/[0.05] flex items-center justify-center transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* ─── Body: master rail + grid ────────────────────────────── */}
          <div className="flex-1 flex min-h-0 overflow-hidden">
            {/* Master rail (left) */}
            <aside className="w-56 md:w-64 lg:w-72 flex-shrink-0 border-r border-[var(--darkroom-border)] bg-[var(--camera-body)] p-3 overflow-y-auto">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <LEDIndicator
                    state={masterImageUrl ? "active" : "off"}
                    size="sm"
                  />
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--darkroom-accent)]">
                    Master Anchor
                  </span>
                </div>
                <div className="aspect-square w-full rounded border border-white/[0.08] bg-[var(--camera-body-deep)] overflow-hidden flex items-center justify-center">
                  {masterImageUrl ? (
                    <img
                      src={masterImageUrl}
                      alt="Master reference"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="text-[9px] font-mono uppercase tracking-wider text-[var(--darkroom-text-dim)]">
                      No master
                    </div>
                  )}
                </div>
                {masterImageLabel && (
                  <div className="text-[10px] text-[var(--darkroom-text-muted)] truncate">
                    {masterImageLabel}
                  </div>
                )}
                <div className="pt-2 border-t border-white/[0.04] space-y-1">
                  <div className="text-[9px] font-mono uppercase tracking-wider text-[var(--darkroom-text-dim)]">
                    Alignment check
                  </div>
                  <p className="text-[10px] leading-relaxed text-[var(--darkroom-text-muted)]">
                    Scan each frame beside the master. Mark heroes with ♥,
                    promote a clean render to be the anchor with ★.
                  </p>
                </div>
                {seed !== null && (
                  <div className="pt-2 border-t border-white/[0.04] space-y-1">
                    <div className="text-[9px] font-mono uppercase tracking-wider text-[var(--darkroom-text-dim)]">
                      Seed
                    </div>
                    <div className="text-[10px] font-mono text-[var(--darkroom-text-muted)] break-all">
                      {seed}
                    </div>
                  </div>
                )}
              </div>
            </aside>

            {/* Variations grid (right) */}
            <section className="flex-1 overflow-y-auto p-3 sm:p-4">
              <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {completedItems.map((item, idx) => {
                  const isMaster =
                    activeMasterItemId != null &&
                    item.savedImageId === activeMasterItemId;
                  const isHero =
                    !!item.savedImageId && heroImageIds.has(item.savedImageId);
                  const isPipelineApproved =
                    !!item.savedImageId && pipelineApprovedImageIds.has(item.savedImageId);
                  return (
                    <SetReviewTile
                      key={item.position}
                      item={item}
                      isMaster={isMaster}
                      isHero={isHero}
                      isPipelineApproved={isPipelineApproved}
                      onZoom={() => setZoomedIndex(idx)}
                      onPromoteToMaster={() => onPromoteToMaster(item)}
                      onToggleHero={() => onToggleHero(item)}
                      onApprovePipeline={
                        onApprovePipeline ? () => onApprovePipeline(item) : undefined
                      }
                      onDownload={() => handleDownload(item)}
                    />
                  );
                })}

                {completedCount === 0 && (
                  <div className="col-span-full flex items-center justify-center py-16 text-[11px] font-mono uppercase tracking-wider text-[var(--darkroom-text-dim)]">
                    No frames exposed yet
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* ─── Footer: bulk actions ────────────────────────────────── */}
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-[var(--darkroom-border)] bg-[var(--camera-body)] flex-shrink-0">
            <div className="text-[9px] font-mono uppercase tracking-wider text-[var(--darkroom-text-dim)]">
              Esc close · ← → navigate zoom · Space hero · M master
            </div>
            <div className="flex items-center gap-1.5">
              {onBulkMarkHeroes && completedCount > 0 && (
                <button
                  type="button"
                  onClick={() => onBulkMarkHeroes(completedItems)}
                  title="Mark every completed frame as Hero"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-white/[0.06] bg-[var(--camera-body-deep)] text-[10px] font-mono uppercase tracking-wider text-[var(--darkroom-text-muted)] hover:border-pink-400/50 hover:text-pink-300 transition-colors"
                >
                  <Heart className="w-3 h-3" />
                  Hero all
                </button>
              )}
              {completedCount > 0 && (
                <button
                  type="button"
                  onClick={handleBulkDownload}
                  title={`Download all ${completedCount} frames`}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-white/[0.06] bg-[var(--camera-body-deep)] text-[10px] font-mono uppercase tracking-wider text-[var(--darkroom-text-muted)] hover:border-[var(--darkroom-accent)]/50 hover:text-[var(--darkroom-accent)] transition-colors"
                >
                  <Download className="w-3 h-3" />
                  Download all
                </button>
              )}
            </div>
          </div>

          {/* ─── Lightbox overlay ────────────────────────────────────── */}
          <AnimatePresence>
            {zoomedItem && (
              <motion.div
                key="lightbox"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="absolute inset-0 z-10 bg-[var(--darkroom-bg)]/95 backdrop-blur-md flex flex-col"
              >
                {/* Lightbox header */}
                <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--darkroom-border)] bg-[var(--camera-body)]/80 flex-shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[9px] font-mono text-[var(--darkroom-text-dim)]">
                      {String((zoomedIndex ?? 0) + 1).padStart(2, "0")}/
                      {String(completedCount).padStart(2, "0")}
                    </span>
                    <span className="text-[11px] font-medium text-[var(--darkroom-text)] truncate">
                      {zoomedItem.label}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setZoomedIndex(null)}
                    title="Close zoom (Esc)"
                    className="flex-shrink-0 w-7 h-7 rounded border border-white/[0.06] bg-black/20 text-[var(--darkroom-text-dim)] hover:text-[var(--darkroom-text)] hover:bg-white/[0.05] flex items-center justify-center transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Lightbox body: master on left, zoomed frame on right */}
                <div className="flex-1 flex min-h-0">
                  <div className="w-48 md:w-56 flex-shrink-0 border-r border-[var(--darkroom-border)] bg-black/30 p-3 flex flex-col items-center justify-center gap-2">
                    <div className="text-[9px] font-mono uppercase tracking-wider text-[var(--darkroom-accent)]">
                      Master
                    </div>
                    {masterImageUrl ? (
                      <img
                        src={masterImageUrl}
                        alt="Master reference"
                        className="max-w-full max-h-64 object-contain rounded border border-white/[0.08]"
                      />
                    ) : null}
                  </div>
                  <div className="flex-1 relative flex items-center justify-center p-4">
                    {/* Nav arrows */}
                    {zoomedIndex! > 0 && (
                      <button
                        type="button"
                        onClick={() => setZoomedIndex(zoomedIndex! - 1)}
                        title="Previous frame (←)"
                        className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full border border-white/[0.08] bg-black/50 text-[var(--darkroom-text)] hover:bg-black/70 flex items-center justify-center transition-colors"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                    )}
                    {zoomedIndex! < completedCount - 1 && (
                      <button
                        type="button"
                        onClick={() => setZoomedIndex(zoomedIndex! + 1)}
                        title="Next frame (→)"
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full border border-white/[0.08] bg-black/50 text-[var(--darkroom-text)] hover:bg-black/70 flex items-center justify-center transition-colors"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    )}
                    {zoomedItem.imageUrl && (
                      <img
                        src={zoomedItem.imageUrl}
                        alt={zoomedItem.label}
                        className="max-w-full max-h-full object-contain rounded border border-white/[0.08]"
                      />
                    )}
                  </div>
                </div>

                {/* Lightbox actions */}
                <div className="flex items-center justify-center gap-2 px-4 py-2.5 border-t border-[var(--darkroom-border)] bg-[var(--camera-body)]/80 flex-shrink-0">
                  <ZoomAction
                    icon={Heart}
                    label={heroImageIds.has(zoomedItem.savedImageId ?? "") ? "Hero ✓" : "Hero"}
                    active={heroImageIds.has(zoomedItem.savedImageId ?? "")}
                    activeClass="border-pink-400/50 bg-pink-400/15 text-pink-300"
                    onClick={() => onToggleHero(zoomedItem)}
                    title="Toggle Hero (Space)"
                  />
                  {onApprovePipeline && (
                    <ZoomAction
                      icon={CheckCircle2}
                      label={
                        pipelineApprovedImageIds.has(zoomedItem.savedImageId ?? "")
                          ? "Approved ✓"
                          : "Approve"
                      }
                      active={pipelineApprovedImageIds.has(zoomedItem.savedImageId ?? "")}
                      activeClass="border-emerald-400/50 bg-emerald-400/15 text-emerald-300"
                      onClick={() => onApprovePipeline(zoomedItem)}
                      title="Approve this frame in Madison Pipeline"
                    />
                  )}
                  <ZoomAction
                    icon={Star}
                    label={
                      activeMasterItemId === zoomedItem.savedImageId
                        ? "Master ✓"
                        : "Use as Master"
                    }
                    active={activeMasterItemId === zoomedItem.savedImageId}
                    activeClass="border-[var(--darkroom-accent)]/50 bg-[var(--darkroom-accent)]/15 text-[var(--darkroom-accent)]"
                    onClick={() => onPromoteToMaster(zoomedItem)}
                    title="Use as Master (M)"
                  />
                  <ZoomAction
                    icon={Download}
                    label="Download"
                    onClick={() => handleDownload(zoomedItem)}
                    title="Download this frame"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ────────────────────────────────────────────────────────────────────────────

interface SetReviewTileProps {
  item: VariationItem;
  isMaster: boolean;
  isHero: boolean;
  isPipelineApproved: boolean;
  onZoom: () => void;
  onPromoteToMaster: () => void;
  onToggleHero: () => void;
  onApprovePipeline?: () => void;
  onDownload: () => void;
}

function SetReviewTile({
  item,
  isMaster,
  isHero,
  isPipelineApproved,
  onZoom,
  onPromoteToMaster,
  onToggleHero,
  onApprovePipeline,
  onDownload,
}: SetReviewTileProps) {
  return (
    <div
      className={cn(
        "camera-panel flex flex-col overflow-hidden transition-colors",
        isMaster && "border-[var(--darkroom-accent)]/50",
      )}
    >
      <button
        type="button"
        onClick={onZoom}
        className="relative block w-full aspect-square bg-[var(--camera-body-deep)] overflow-hidden group"
        title="Click to zoom"
      >
        {item.imageUrl && (
          <img
            src={item.imageUrl}
            alt={item.label}
            className="w-full h-full object-contain transition-transform duration-150 group-hover:scale-[1.02]"
          />
        )}
        {/* Position badge top-left */}
        <span className="absolute top-1.5 left-1.5 text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-black/60 border border-white/[0.08] text-[var(--darkroom-text-muted)]">
          {String(item.position + 1).padStart(2, "0")}
        </span>
        {/* Zoom hint top-right */}
        <span className="absolute top-1.5 right-1.5 w-6 h-6 rounded bg-black/60 border border-white/[0.08] text-[var(--darkroom-text-dim)] group-hover:text-[var(--darkroom-accent)] flex items-center justify-center transition-colors">
          <Maximize2 className="w-3 h-3" />
        </span>
        {/* Status badges bottom-left */}
        <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1">
          {isMaster && (
            <span className="text-[8px] font-mono uppercase tracking-wider px-1 py-0.5 rounded bg-[var(--darkroom-accent)]/20 text-[var(--darkroom-accent)] border border-[var(--darkroom-accent)]/40">
              Master
            </span>
          )}
          {isHero && (
            <span className="text-[8px] font-mono uppercase tracking-wider px-1 py-0.5 rounded bg-pink-400/20 text-pink-300 border border-pink-400/40">
              Hero
            </span>
          )}
          {isPipelineApproved && (
            <span className="text-[8px] font-mono uppercase tracking-wider px-1 py-0.5 rounded bg-emerald-400/20 text-emerald-300 border border-emerald-400/40">
              Approved
            </span>
          )}
        </div>
      </button>

      {/* Label + actions */}
      <div className="flex items-center gap-1 px-2 py-1.5 bg-[var(--camera-body)] border-t border-white/[0.04]">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-[var(--darkroom-text)] truncate font-medium">
            {item.label}
          </div>
          {item.pipelineMatchLabel && (
            <div className="text-[8px] font-mono uppercase tracking-wider text-[var(--darkroom-text-dim)] truncate">
              {item.pipelineMatchLabel}
            </div>
          )}
        </div>
        {onApprovePipeline && (
          <TileButton
            icon={CheckCircle2}
            active={isPipelineApproved}
            activeClass="border-emerald-400/50 bg-emerald-400/15 text-emerald-300"
            onClick={(e) => {
              e.stopPropagation();
              onApprovePipeline();
            }}
            title={
              isPipelineApproved
                ? "Approved in Madison Pipeline"
                : "Approve this frame in Madison Pipeline"
            }
            fillWhenActive
          />
        )}
        <TileButton
          icon={Heart}
          active={isHero}
          activeClass="border-pink-400/50 bg-pink-400/15 text-pink-300"
          onClick={(e) => {
            e.stopPropagation();
            onToggleHero();
          }}
          title={isHero ? "Remove Hero tag" : "Mark as Hero"}
          fillWhenActive
        />
        <TileButton
          icon={Star}
          active={isMaster}
          activeClass="border-[var(--darkroom-accent)]/50 bg-[var(--darkroom-accent)]/15 text-[var(--darkroom-accent)]"
          onClick={(e) => {
            e.stopPropagation();
            if (!isMaster) onPromoteToMaster();
          }}
          title={isMaster ? "Current master" : "Use as Master"}
          fillWhenActive
          disabled={isMaster}
        />
        <TileButton
          icon={Download}
          onClick={(e) => {
            e.stopPropagation();
            onDownload();
          }}
          title="Download this frame"
        />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────

interface TileButtonProps {
  icon: typeof Heart;
  onClick: (e: React.MouseEvent) => void;
  title: string;
  active?: boolean;
  activeClass?: string;
  fillWhenActive?: boolean;
  disabled?: boolean;
}

function TileButton({
  icon: Icon,
  onClick,
  title,
  active = false,
  activeClass,
  fillWhenActive = false,
  disabled = false,
}: TileButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "flex-shrink-0 w-6 h-6 rounded border flex items-center justify-center transition-colors",
        "disabled:cursor-default",
        active
          ? activeClass
          : "border-white/[0.06] bg-black/20 text-[var(--darkroom-text-dim)] hover:border-white/[0.2] hover:text-[var(--darkroom-text)]",
      )}
    >
      <Icon size={11} className={cn(active && fillWhenActive && "fill-current")} />
    </button>
  );
}

// ────────────────────────────────────────────────────────────────────────────

interface ZoomActionProps {
  icon: typeof Heart;
  label: string;
  onClick: () => void;
  title: string;
  active?: boolean;
  activeClass?: string;
}

function ZoomAction({
  icon: Icon,
  label,
  onClick,
  title,
  active = false,
  activeClass,
}: ZoomActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded border text-[10px] font-mono uppercase tracking-wider transition-colors",
        active
          ? activeClass
          : "border-white/[0.06] bg-[var(--camera-body-deep)] text-[var(--darkroom-text-muted)] hover:border-white/[0.2] hover:text-[var(--darkroom-text)]",
      )}
    >
      <Icon className={cn("w-3 h-3", active && "fill-current")} />
      {label}
    </button>
  );
}
