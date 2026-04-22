import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Layers, Aperture, Loader2, XCircle, Trash2, Camera, Package, Maximize2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { UploadZone } from "@/components/darkroom/UploadZone";
import { LEDIndicator } from "@/components/darkroom/LEDIndicator";
import { ImageLibraryModal } from "@/components/image-editor/ImageLibraryModal";
import { VariationMatrix, type MaterialReferenceMap } from "./VariationMatrix";
import { GenerationQueue } from "./GenerationQueue";
import { SetReviewModal } from "./SetReviewModal";
import { StudioControls } from "./StudioControls";
import { useConsistencySet } from "@/hooks/useConsistencySet";
import type { VariationItem } from "@/lib/consistencyMode";
import { markImageAsHero, toggleImageHero } from "@/lib/imageLibraryTags";
import {
  CONSISTENCY_COMPOSITIONS,
  DEFAULT_COMPOSITION_ID,
  DEFAULT_STUDIO_SETTINGS,
  type CompositionId,
  type StudioSettings,
} from "@/config/consistencyVariations";
import {
  MAX_VARIATION_SET_SIZE,
  capsForFitments,
  expandVariationMatrix,
  type VariationAxis,
  type VariationOption,
} from "@/config/consistencyVariations";
import type { ProModeSettings } from "../ProSettings";

interface UploadedImage {
  url: string;
  file?: File;
  name?: string;
}

interface ConsistencyModePanelProps {
  /** Current session ID — shared with the Dark Room's standard mode. */
  sessionId: string;
  /** Organization the generations belong to. */
  organizationId: string | null;
  /** Authenticated user ID. */
  userId: string | null;
  /** Aspect ratio, resolution, AI model — pulled from existing proSettings. */
  proSettings: ProModeSettings;
}

type AxisSelection = Record<VariationAxis, VariationOption[]>;

const EMPTY_SELECTION: AxisSelection = {
  bottleColor: [],
  capColor: [],
  fitmentType: [],
};

/**
 * Consistency Mode — bulk variation generation that shares background,
 * lighting, camera, and composition across every image in the set.
 * Matches the Dark Room's camera-panel aesthetic exactly.
 */
export function ConsistencyModePanel({
  sessionId,
  organizationId,
  userId,
  proSettings,
}: ConsistencyModePanelProps) {
  const [masterImage, setMasterImage] = useState<UploadedImage | null>(null);
  /**
   * When the user promotes a rendered variation to become the new master,
   * we track which one so the queue can show a "Master" badge. This is the
   * savedImageId of the variation currently driving future generations.
   */
  const [activeMasterItemId, setActiveMasterItemId] = useState<string | null>(null);
  const [userPrompt, setUserPrompt] = useState("");
  const [selection, setSelection] = useState<AxisSelection>(EMPTY_SELECTION);
  /**
   * Per-option material reference images. Keyed by variation-option id
   * (e.g. "swirl"). When a chip is selected AND has a reference attached,
   * the orchestrator sends that image as a secondary product reference so
   * Gemini can match the exact surface material — especially useful for
   * distinctive finishes like swirl-fluted glass where the word alone isn't
   * enough for the model to produce the right look.
   */
  const [materialReferences, setMaterialReferences] = useState<MaterialReferenceMap>({});
  const [composition, setComposition] = useState<CompositionId>(DEFAULT_COMPOSITION_ID);
  /**
   * Studio fine-tuning — backdrop colour, light direction, shadow direction,
   * and shadow intensity. Defaults preserve the original look exactly
   * (bone backdrop, classic 45° light, soft SW contact shadow).
   */
  const [studio, setStudio] = useState<StudioSettings>(DEFAULT_STUDIO_SETTINGS);
  const [showMasterLibrary, setShowMasterLibrary] = useState(false);
  /**
   * Ids of generated images currently tagged as Hero in the DB. Updated
   * optimistically when the user toggles the heart on a queue item so the
   * UI reflects the new state immediately; the underlying Supabase update
   * runs in the background.
   */
  const [heroImageIds, setHeroImageIds] = useState<Set<string>>(new Set());
  /** Set Review full-screen modal. Auto-opens when a run completes. */
  const [showReview, setShowReview] = useState(false);
  /** Tracks the last status we saw so we only auto-open on edge. */
  const lastAutoOpenedSetIdRef = useRef<string | null>(null);

  const {
    status,
    setId,
    seed,
    items,
    progress,
    error,
    run,
    cancel,
    reset,
  } = useConsistencySet();

  // Auto-open the Set Review modal once when a run completes so the user
  // lands straight into comparison mode. Gated on set id so we don't
  // re-open on every re-render once the status settles.
  useEffect(() => {
    if (status !== "complete") return;
    if (!setId) return;
    if (lastAutoOpenedSetIdRef.current === setId) return;
    lastAutoOpenedSetIdRef.current = setId;
    setShowReview(true);
  }, [status, setId]);

  const hasCompletedFrame = useMemo(
    () => items.some((i) => i.status === "complete" && !!i.imageUrl),
    [items],
  );

  const combinations = useMemo(
    () => expandVariationMatrix(selection),
    [selection],
  );

  const selectionCount =
    selection.bottleColor.length +
    selection.capColor.length +
    selection.fitmentType.length;

  const canGenerate =
    !!masterImage &&
    !!organizationId &&
    !!userId &&
    combinations.length > 0 &&
    combinations.length <= MAX_VARIATION_SET_SIZE &&
    status !== "running";

  const ledState =
    status === "running"
      ? "processing"
      : status === "complete"
      ? "ready"
      : canGenerate
      ? "ready"
      : "off";

  const toggle = (axis: VariationAxis, option: VariationOption) => {
    setSelection((prev) => {
      const current = prev[axis];
      const exists = current.some((o) => o.id === option.id);
      const nextOnAxis = exists
        ? current.filter((o) => o.id !== option.id)
        : [...current, option];
      const next = { ...prev, [axis]: nextOnAxis };

      // If the user just changed the fitment set, prune cap selections
      // that are no longer offered with the new fitment lineup. Without
      // this, a stale cap selection would stay ticked but disappear from
      // the visible chip list, silently generating unsellable SKUs.
      if (axis === "fitmentType") {
        const validCapIds = new Set(
          capsForFitments(next.fitmentType.map((o) => o.id)).map((c) => c.id),
        );
        next.capColor = next.capColor.filter((c) => validCapIds.has(c.id));
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelection(EMPTY_SELECTION);
    setMaterialReferences({});
  };

  /**
   * Promote a successful render to become the new master reference. From this
   * point on, every subsequent Expose Set anchors on the promoted image —
   * its backdrop, lighting, shadow, size, and framing are already correct,
   * so the AI only has to swap materials instead of rebuilding the whole
   * scene. This is the fastest path to a fully-consistent product grid.
   */
  const promoteItemToMaster = (item: VariationItem) => {
    if (!item.imageUrl) return;
    setMasterImage({
      url: item.imageUrl,
      name: `Promoted: ${item.label}`,
    });
    setActiveMasterItemId(item.savedImageId ?? null);
    toast.success(`Master updated to “${item.label}”`, {
      description:
        "Future variations will anchor on this image — click Expose Set to regenerate.",
    });
  };

  /**
   * Bulk-mark every completed variation in the current set as Hero. Fires
   * the DB updates in parallel but updates local state optimistically so
   * the grid reflects it immediately.
   */
  const handleBulkMarkHeroes = async (its: VariationItem[]) => {
    const targets = its.filter((i) => !!i.savedImageId);
    if (targets.length === 0) return;
    // Optimistic local update
    setHeroImageIds((prev) => {
      const next = new Set(prev);
      for (const item of targets) {
        if (item.savedImageId) next.add(item.savedImageId);
      }
      return next;
    });
    // Fire background DB writes in parallel, ignore individual failures —
    // a per-tile retry is always available via the heart on the tile.
    await Promise.allSettled(
      targets.map((item) =>
        item.savedImageId ? markImageAsHero(item.savedImageId) : Promise.resolve(null),
      ),
    );
    toast.success(`Marked ${targets.length} frames as Hero`);
  };

  /**
   * Toggle Hero tag on a completed variation. Optimistic local update +
   * background DB write. If the DB update fails, roll back the local state.
   */
  const handleToggleHero = async (item: VariationItem) => {
    const id = item.savedImageId;
    if (!id) return;
    const wasHero = heroImageIds.has(id);
    // Optimistic update
    setHeroImageIds((prev) => {
      const next = new Set(prev);
      if (wasHero) next.delete(id);
      else next.add(id);
      return next;
    });
    try {
      const result = await toggleImageHero(id);
      if (!result) throw new Error("Tag update returned no result");
      // Reconcile with server truth
      setHeroImageIds((prev) => {
        const next = new Set(prev);
        if (result.active) next.add(id);
        else next.delete(id);
        return next;
      });
      toast.success(
        result.active
          ? `“${item.label}” marked as hero`
          : `Hero tag removed from “${item.label}”`,
      );
    } catch (err) {
      // Roll back
      setHeroImageIds((prev) => {
        const next = new Set(prev);
        if (wasHero) next.add(id);
        else next.delete(id);
        return next;
      });
      toast.error("Couldn't update hero tag", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    }
  };

  const attachMaterialReference = (
    optionId: string,
    ref: { url: string; name?: string },
  ) => {
    setMaterialReferences((prev) => ({ ...prev, [optionId]: ref }));
  };

  const removeMaterialReference = (optionId: string) => {
    setMaterialReferences((prev) => {
      const next = { ...prev };
      delete next[optionId];
      return next;
    });
  };

  const handleGenerate = () => {
    if (!masterImage || !organizationId || !userId) return;
    run({
      masterImageUrl: masterImage.url,
      userPrompt,
      organizationId,
      userId,
      sessionId,
      aspectRatio: proSettings.aspectRatio ?? "1:1",
      resolution: (proSettings.resolution as "standard" | "high" | "4k") ?? "high",
      aiProvider: proSettings.aiProvider,
      proModeControls: {
        camera: proSettings.camera,
        lighting: proSettings.lighting,
        environment: proSettings.environment,
      },
      selection,
      materialReferences,
      composition,
      studio,
    });
  };

  return (
    <div className="space-y-2">
      {/* Status header — mirrors the Settings tab's status panel */}
      <div className="camera-panel">
        <div className="flex items-center justify-between p-2.5">
          <div className="flex items-center gap-2">
            <LEDIndicator state={ledState} size="sm" />
            <Layers className="w-3 h-3 text-[var(--darkroom-accent)]" />
            <span className="text-[11px] font-medium text-[var(--darkroom-text)]">
              Consistency Mode
            </span>
          </div>
          {status === "running" ? (
            <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--darkroom-accent)]">
              {progress.current}/{progress.total}
            </span>
          ) : combinations.length > 0 ? (
            <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--darkroom-text-dim)]">
              {combinations.length} {combinations.length === 1 ? "frame" : "frames"}
            </span>
          ) : null}
        </div>
        <div className="px-2.5 pb-2.5">
          <p className="text-[10px] leading-relaxed text-[var(--darkroom-text-muted)]">
            Upload a master. Generate a set where only bottle, cap, and fitment
            change — background, lighting, and camera stay locked.
          </p>
        </div>
      </div>

      {/* 1. Master upload */}
      <div className="camera-panel p-2.5 space-y-2">
        <div className="flex items-center gap-1.5">
          <LEDIndicator state={masterImage ? "active" : "off"} size="sm" />
          <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--darkroom-accent)]">
            01 · Master Reference
          </span>
        </div>
        <UploadZone
          type="product"
          label="Bottle / cap / fitment"
          description="Pick from Image Library or drop a new file — shape locks for every variation"
          image={masterImage}
          onUpload={(img) => {
            setMasterImage(img);
            // A fresh upload replaces any previously-promoted master.
            setActiveMasterItemId(null);
          }}
          onRemove={() => {
            setMasterImage(null);
            setActiveMasterItemId(null);
          }}
          onLibraryOpen={() => setShowMasterLibrary(true)}
          disabled={status === "running"}
        />
      </div>

      {/* 2. Variation matrix */}
      <div className="camera-panel p-2.5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <LEDIndicator state={selectionCount > 0 ? "active" : "off"} size="sm" />
            <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--darkroom-accent)]">
              02 · Variations
            </span>
          </div>
          {selectionCount > 0 && (
            <button
              type="button"
              onClick={clearSelection}
              disabled={status === "running"}
              className="flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider text-[var(--darkroom-text-dim)] hover:text-[var(--led-error)] disabled:opacity-40 transition-colors"
            >
              <Trash2 className="w-2.5 h-2.5" />
              Clear
            </button>
          )}
        </div>
        <VariationMatrix
          selection={selection}
          onToggle={toggle}
          materialReferences={materialReferences}
          onAttachReference={attachMaterialReference}
          onRemoveReference={removeMaterialReference}
          disabled={status === "running"}
        />
      </div>

      {/* 3. Composition selector — assembled vs exploded-uncapped */}
      <div className="camera-panel p-2.5 space-y-2">
        <div className="flex items-center gap-1.5">
          <LEDIndicator
            state={composition !== DEFAULT_COMPOSITION_ID ? "active" : "ready"}
            size="sm"
          />
          <Camera className="w-3 h-3 text-[var(--darkroom-accent)]" />
          <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--darkroom-accent)]">
            03 · Composition
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1">
          {CONSISTENCY_COMPOSITIONS.map((comp) => {
            const isSelected = composition === comp.id;
            const Icon = comp.icon === "exploded" ? Package : Camera;
            return (
              <button
                key={comp.id}
                type="button"
                onClick={() => setComposition(comp.id)}
                disabled={status === "running"}
                className={cn(
                  "flex items-start gap-2 p-2 rounded border text-left transition-all",
                  "disabled:opacity-40 disabled:cursor-not-allowed",
                  isSelected
                    ? "border-[var(--darkroom-accent)]/50 bg-[var(--darkroom-accent)]/10"
                    : "border-white/[0.06] bg-[var(--camera-body-deep)] hover:border-white/[0.15]",
                )}
              >
                <Icon
                  size={12}
                  className={cn(
                    "mt-0.5 flex-shrink-0",
                    isSelected ? "text-[var(--darkroom-accent)]" : "text-[var(--darkroom-text-dim)]",
                  )}
                />
                <div className="flex-1 min-w-0">
                  <div
                    className={cn(
                      "text-[10px] font-medium",
                      isSelected ? "text-[var(--darkroom-text)]" : "text-[var(--darkroom-text-muted)]",
                    )}
                  >
                    {comp.label}
                  </div>
                  <div className="text-[9px] text-[var(--darkroom-text-dim)] leading-tight mt-0.5">
                    {comp.helper}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Studio fine-tune — background / light / shadow */}
      <StudioControls
        value={studio}
        onChange={setStudio}
        disabled={status === "running"}
      />

      {/* 5. Optional prompt */}
      <div className="camera-panel p-2.5 space-y-2">
        <div className="flex items-center gap-1.5">
          <LEDIndicator state={userPrompt.trim() ? "active" : "off"} size="sm" />
          <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--darkroom-accent)]">
            05 · Scene Notes
          </span>
          <span className="text-[9px] text-[var(--darkroom-text-dim)]">optional</span>
        </div>
        <Textarea
          value={userPrompt}
          onChange={(e) => setUserPrompt(e.target.value)}
          placeholder="Extra scene detail applied to every frame in the set"
          disabled={status === "running"}
          className="min-h-20 text-[11px] bg-[var(--camera-body-deep)] border-white/[0.06] text-[var(--darkroom-text)] placeholder:text-[var(--darkroom-text-dim)] focus-visible:border-[var(--darkroom-accent)] focus-visible:ring-0"
        />
      </div>

      {/* 4. Over-limit warning */}
      {combinations.length > MAX_VARIATION_SET_SIZE && (
        <div className="camera-panel border-[var(--led-error)]/30 p-2.5">
          <p className="text-[10px] text-[var(--led-error)] font-mono uppercase tracking-wider">
            Set exceeds max ({MAX_VARIATION_SET_SIZE}) — trim axes or split into runs
          </p>
        </div>
      )}

      {/* 5. Expose / Cancel button — matches GenerateButton aesthetic */}
      <div className="camera-panel p-2.5">
        {status === "running" ? (
          <motion.button
            type="button"
            onClick={cancel}
            className="w-full flex items-center justify-center gap-2 py-3 rounded border border-[var(--led-error)]/30 bg-[var(--led-error)]/5 text-[var(--led-error)] hover:bg-[var(--led-error)]/10 transition-colors"
            whileTap={{ y: 1 }}
          >
            <XCircle size={14} />
            <span className="text-[11px] font-mono uppercase tracking-[0.12em]">
              Cancel ({progress.current}/{progress.total})
            </span>
          </motion.button>
        ) : (
          <motion.button
            type="button"
            onClick={handleGenerate}
            disabled={!canGenerate}
            className={cn(
              "w-full flex items-center justify-center gap-2 py-3 rounded border transition-all",
              canGenerate
                ? "border-[var(--darkroom-accent)]/40 bg-[var(--darkroom-accent)]/10 text-[var(--darkroom-accent)] hover:bg-[var(--darkroom-accent)]/15 hover:border-[var(--darkroom-accent)]/60"
                : "border-white/[0.06] bg-[var(--camera-body-deep)] text-[var(--darkroom-text-dim)] cursor-not-allowed",
            )}
            whileHover={canGenerate ? { y: -1 } : {}}
            whileTap={canGenerate ? { y: 1 } : {}}
          >
            <Aperture size={14} />
            <span className="text-[11px] font-mono uppercase tracking-[0.12em]">
              {combinations.length > 0
                ? `Expose Set · ${combinations.length}`
                : "Expose Set"}
            </span>
          </motion.button>
        )}

        {(status === "complete" || status === "error") && (
          <button
            type="button"
            onClick={reset}
            className="w-full mt-2 text-[10px] font-mono uppercase tracking-wider text-[var(--darkroom-text-dim)] hover:text-[var(--darkroom-text)] transition-colors"
          >
            Reset
          </button>
        )}

        {!canGenerate && !masterImage && (
          <p className="text-[10px] text-[var(--darkroom-text-dim)] text-center mt-2">
            Upload a master reference to begin
          </p>
        )}
        {!canGenerate && masterImage && combinations.length === 0 && (
          <p className="text-[10px] text-[var(--darkroom-text-dim)] text-center mt-2">
            Tick at least one variation
          </p>
        )}
      </div>

      {/* 6. Error */}
      {error && (
        <div className="camera-panel border-[var(--led-error)]/30 p-2.5">
          <p className="text-[10px] text-[var(--led-error)]">{error}</p>
        </div>
      )}

      {/* 7. Queue / results */}
      <AnimatePresence>
        {items.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="camera-panel p-2.5 space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <LEDIndicator state={status === "running" ? "processing" : "ready"} size="sm" />
                <Loader2
                  className={cn(
                    "w-3 h-3 text-[var(--darkroom-accent)]",
                    status === "running" && "animate-spin",
                  )}
                />
                <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--darkroom-accent)]">
                  Queue
                </span>
              </div>
              {hasCompletedFrame && (
                <button
                  type="button"
                  onClick={() => setShowReview(true)}
                  title="Open full-screen Set Review"
                  className="flex items-center gap-1 px-2 py-1 rounded border border-white/[0.08] bg-[var(--camera-body-deep)] text-[9px] font-mono uppercase tracking-wider text-[var(--darkroom-text-muted)] hover:border-[var(--darkroom-accent)]/50 hover:text-[var(--darkroom-accent)] transition-colors"
                >
                  <Maximize2 className="w-2.5 h-2.5" />
                  Review
                </button>
              )}
            </div>
            <GenerationQueue
              items={items}
              onPromoteToMaster={promoteItemToMaster}
              activeMasterItemId={activeMasterItemId}
              onToggleHero={handleToggleHero}
              heroImageIds={heroImageIds}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Image Library picker for the master reference — lets the user pull
          any previously-saved or DAM-stored image AND upload a fresh one
          from the same modal, instead of the raw file picker. */}
      <ImageLibraryModal
        open={showMasterLibrary}
        onOpenChange={(open) => setShowMasterLibrary(open)}
        title="Select Master Reference"
        onSelectImage={(image) => {
          setMasterImage({
            url: image.url,
            file: image.file,
            name: image.name,
          });
          setActiveMasterItemId(null);
          setShowMasterLibrary(false);
        }}
      />

      {/* Set Review — full-screen comparison surface. Opens automatically
          when a run completes and reopen-able via the queue header. */}
      <SetReviewModal
        open={showReview}
        onClose={() => setShowReview(false)}
        items={items}
        masterImageUrl={masterImage?.url ?? null}
        masterImageLabel={masterImage?.name ?? undefined}
        setId={setId}
        seed={seed}
        onPromoteToMaster={promoteItemToMaster}
        activeMasterItemId={activeMasterItemId}
        onToggleHero={handleToggleHero}
        heroImageIds={heroImageIds}
        onBulkMarkHeroes={handleBulkMarkHeroes}
      />
    </div>
  );
}
