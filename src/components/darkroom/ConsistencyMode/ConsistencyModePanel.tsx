import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Layers, Aperture, Loader2, XCircle, Trash2, Camera, Package, Maximize2, ChevronDown, Sliders, Info, AlertCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useConsistencySet } from "@/hooks/useConsistencySet";
import type { VariationItem } from "@/lib/consistencyMode";
import { markImageAsHero, toggleImageHero } from "@/lib/imageLibraryTags";
import {
  readAndClearPipelinePrefill,
  type PipelinePrefill,
} from "@/lib/bestBottlesPipelineBridge";
import {
  markPipelineRowsApproved,
  markPipelineRowsGenerationFailed,
  markPipelineRowsQaPending,
  markPipelineRowsQueued,
} from "@/lib/bestBottlesPipeline";
import { matchPipelineRowsForSelection } from "@/lib/bestBottlesPipelineMatching";
import {
  CONSISTENCY_COMPOSITIONS,
  DEFAULT_COMPOSITION_ID,
  DEFAULT_STUDIO_SETTINGS,
  type CompositionId,
  type StudioSettings,
} from "@/config/consistencyVariations";
import {
  BOTTLE_COLORS,
  FITMENT_TYPES,
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
        side="left"
        className="max-w-[260px] border-[var(--darkroom-border)] bg-[var(--camera-body)] text-[11px] leading-relaxed text-[var(--darkroom-text)]"
      >
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

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
  const queryClient = useQueryClient();
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
  const [pipelineApprovedImageIds, setPipelineApprovedImageIds] = useState<Set<string>>(new Set());
  /** Set Review full-screen modal. Auto-opens when a run completes. */
  const [showReview, setShowReview] = useState(false);
  /** Tracks the last status we saw so we only auto-open on edge. */
  const lastAutoOpenedSetIdRef = useRef<string | null>(null);
  /**
   * When launched from the Best Bottles Grid Pipeline, the shape group's
   * pipeline_group ids are captured here. When the run completes, we
   * flip those rows' status to "generated" for real-time tracking.
   */
  const [pipelinePrefill, setPipelinePrefill] = useState<PipelinePrefill | null>(null);
  /**
   * Composition + studio controls collapse into a single "Advanced" drawer
   * so the default-path operator sees a shorter panel. We auto-open it if
   * either control is set to a non-default value (e.g. the operator switched
   * backdrop or composition on an earlier run and we return to the panel).
   */
  const [advancedOpen, setAdvancedOpen] = useState(false);

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

  // On mount, check for a Best Bottles Pipeline pre-fill. If present,
  // pre-tick the matching bottle-color + fitment chips so the operator
  // opens Consistency Mode with the right matrix already configured.
  // If a synced product-page reference image is on the prefill, also
  // pre-load it as the master reference so the default path is
  // zero-upload — just tune and expose.
  // Reads + clears the handoff so a refresh doesn't re-apply stale state.
  useEffect(() => {
    const prefill = readAndClearPipelinePrefill();
    if (!prefill) return;
    setPipelinePrefill(prefill);

    const bottleColors = BOTTLE_COLORS.filter((o) =>
      prefill.bottleColorIds.includes(o.id),
    );
    const fitments = FITMENT_TYPES.filter((o) =>
      prefill.fitmentIds.includes(o.id),
    );
    setSelection({
      bottleColor: bottleColors,
      capColor: [],
      fitmentType: fitments,
    });

    const preloadedMaster = !!prefill.masterReferenceUrl;
    if (prefill.masterReferenceUrl) {
      setMasterImage({
        url: prefill.masterReferenceUrl,
        name: prefill.masterReferenceLabel
          ? `Reference: ${prefill.masterReferenceLabel}`
          : "Reference from product page",
      });
    }

    toast.success(`Pipeline pre-fill applied: ${prefill.shapeLabel}`, {
      description:
        `${bottleColors.length} colors × ${fitments.length} fitments.` +
        (preloadedMaster
          ? " Master reference pre-loaded from product page — tune and expose."
          : " Upload a master reference and expose."),
    });
  }, []);

  // When a pipeline-launched run starts, tag the selected pipeline rows as
  // queued + link them to the consistency set id. Per-variation completion
  // below narrows the next status write to exact matched rows.
  const lastQueuedSetIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (status !== "running") return;
    if (!setId || !pipelinePrefill) return;
    if (lastQueuedSetIdRef.current === setId) return;
    lastQueuedSetIdRef.current = setId;
    void markPipelineRowsQueued(pipelinePrefill.pipelineGroupIds, setId).catch(
      (err) => {
        console.warn("[pipeline] Failed to mark shape group queued", err);
      },
    );
  }, [status, setId, pipelinePrefill]);

  // Track each variation back to only its matched rows. A generated frame
  // becomes qa-pending until the operator explicitly approves it in Set Review.
  const trackedPipelineItemKeysRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!setId || !pipelinePrefill) return;
    for (const item of items) {
      if (item.status !== "complete" && item.status !== "error") continue;
      const rowIds = item.pipelineGroupIds ?? [];
      if (rowIds.length === 0) continue;
      const key = `${setId}:${item.position}:${item.status}`;
      if (trackedPipelineItemKeysRef.current.has(key)) continue;
      trackedPipelineItemKeysRef.current.add(key);

      if (item.status === "complete") {
        void markPipelineRowsQaPending(rowIds, setId).catch((err) => {
          console.warn("[pipeline] Failed to mark rows qa-pending", err);
        });
      } else {
        void markPipelineRowsGenerationFailed(
          rowIds,
          setId,
          item.error ?? "Generation failed.",
        ).catch((err) => {
          console.warn("[pipeline] Failed to mark rows rejected", err);
        });
      }
    }
  }, [items, setId, pipelinePrefill]);

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

  const pipelineRowsForCurrentSelection = useMemo(() => {
    if (!pipelinePrefill) return [];
    const map = new Map<string, (typeof pipelinePrefill.pipelineRows)[number]>();
    for (const combo of combinations) {
      for (const row of matchPipelineRowsForSelection(
        pipelinePrefill.pipelineRows ?? [],
        combo,
      )) {
        map.set(row.id, row);
      }
    }
    return Array.from(map.values());
  }, [pipelinePrefill, combinations]);

  const pipelineRowsMissingProductContext = useMemo(() => {
    return pipelineRowsForCurrentSelection.filter(
      (row) =>
        !row.convexSlug &&
        !row.primaryGraceSku &&
        !row.primaryWebsiteSku,
    );
  }, [pipelineRowsForCurrentSelection]);

  const pipelinePreflightBlocksGenerate =
    !!pipelinePrefill && pipelineRowsMissingProductContext.length > 0;

  // Whether the Advanced drawer holds any non-default values — used to auto-
  // expand it on mount if the operator had previously deviated from defaults,
  // and to dot the collapsed header so a hidden tweak can't silently affect
  // the run.
  const advancedIsDirty = useMemo(() => {
    if (composition !== DEFAULT_COMPOSITION_ID) return true;
    const d = DEFAULT_STUDIO_SETTINGS;
    return (
      studio.backgroundId !== d.backgroundId ||
      studio.lightDirectionId !== d.lightDirectionId ||
      studio.shadowDirectionId !== d.shadowDirectionId ||
      studio.shadowIntensityId !== d.shadowIntensityId
    );
  }, [composition, studio]);

  // First-time expand if dirty. Don't force it closed again after that —
  // user may want to keep it open for their whole session.
  useEffect(() => {
    if (advancedIsDirty && !advancedOpen) setAdvancedOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advancedIsDirty]);

  const canGenerate =
    !!masterImage &&
    !!organizationId &&
    !!userId &&
    combinations.length > 0 &&
    combinations.length <= MAX_VARIATION_SET_SIZE &&
    !pipelinePreflightBlocksGenerate &&
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

  const handleApprovePipelineFrame = async (item: VariationItem) => {
    const imageId = item.savedImageId;
    const rowIds = item.pipelineGroupIds ?? [];
    if (!pipelinePrefill || !imageId || rowIds.length === 0) {
      toast.error("Cannot approve to Pipeline", {
        description: "This frame is not linked to any Madison tracker rows.",
      });
      return;
    }

    setPipelineApprovedImageIds((prev) => new Set(prev).add(imageId));
    try {
      await markPipelineRowsApproved({
        rowIds,
        imageId,
        userId,
        notes: `Approved from Consistency Set${setId ? ` ${setId.slice(0, 8)}` : ""}: ${item.label}`,
      });
      await queryClient.invalidateQueries({
        queryKey: ["best-bottles-pipeline-groups"],
      });
      toast.success("Approved in Madison Pipeline", {
        description: item.pipelineMatchLabel ?? item.label,
      });
    } catch (err) {
      setPipelineApprovedImageIds((prev) => {
        const next = new Set(prev);
        next.delete(imageId);
        return next;
      });
      toast.error("Pipeline approval failed", {
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
    if (pipelinePreflightBlocksGenerate) {
      toast.error("Pipeline preflight blocked generation", {
        description:
          "One or more matched rows are missing a Convex/Product Hub anchor.",
      });
      return;
    }
    run({
      masterImageUrl: masterImage.url,
      userPrompt,
      organizationId,
      userId,
      sessionId,
      aspectRatio: proSettings.aspectRatio ?? "1:1",
      resolution: (proSettings.resolution as "standard" | "high" | "4k") ?? "high",
      aiProvider: pipelinePrefill ? "openai-image-2" : proSettings.aiProvider,
      proModeControls: {
        camera: proSettings.camera,
        lighting: proSettings.lighting,
        environment: proSettings.environment,
      },
      selection,
      materialReferences,
      composition,
      studio,
      pipelineContext: pipelinePrefill
        ? {
            source: "best-bottles-pipeline",
            family: pipelinePrefill.family,
            capacityMl: pipelinePrefill.capacityMl,
            threadSize: pipelinePrefill.threadSize,
            shapeKey: pipelinePrefill.shapeKey,
            pipelineGroupIds: pipelinePrefill.pipelineGroupIds,
            pipelineRows: pipelinePrefill.pipelineRows ?? [],
          }
        : undefined,
    });
  };

  return (
    <TooltipProvider delayDuration={150}>
    <div className="space-y-2">
      {/* Pipeline-linked banner — only when launched from Best Bottles
          Pipeline page. Shown at top so operator knows what shape group
          they're running and that row status will auto-update. */}
      {pipelinePrefill && (
        <div className="camera-panel p-2.5 border-[var(--darkroom-accent)]/40 bg-[var(--darkroom-accent)]/5">
          <div className="flex items-center gap-2">
            <Layers className="w-3 h-3 text-[var(--darkroom-accent)]" />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--darkroom-accent)]">
                Pipeline run
              </div>
              <div className="text-[11px] text-[var(--darkroom-text)] truncate">
                {pipelinePrefill.shapeLabel} · {pipelinePrefill.pipelineGroupIds.length} SKUs
              </div>
            </div>
            <span className="text-[9px] font-mono uppercase tracking-wider text-[var(--darkroom-text-dim)]">
              GPT Image 2 · status auto-syncs
            </span>
          </div>
          {pipelineRowsMissingProductContext.length > 0 && (
            <div className="mt-2 flex items-start gap-2 rounded border border-[var(--led-error)]/25 bg-[var(--led-error)]/5 p-2">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[var(--led-error)]" />
              <div className="min-w-0 text-[10px] leading-relaxed text-[var(--darkroom-text-muted)]">
                <span className="font-mono uppercase tracking-wider text-[var(--led-error)]">
                  Preflight blocked:
                </span>{" "}
                {pipelineRowsMissingProductContext.length} matched row
                {pipelineRowsMissingProductContext.length === 1 ? "" : "s"} missing
                Convex/Product Hub anchors. Add a slug or SKU before generating
                so Madison does not create placeholder-driven renders.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Status header — mirrors the Settings tab's status panel */}
      <div className="camera-panel">
        <div className="flex items-center justify-between p-2.5">
          <div className="flex items-center gap-2">
            <LEDIndicator state={ledState} size="sm" />
            <Layers className="w-3 h-3 text-[var(--darkroom-accent)]" />
            <span className="text-[11px] font-medium text-[var(--darkroom-text)]">
              Consistency Mode
            </span>
            <InlineHelp>
              Sets are for repeatable product families. The master image establishes the shared look; variation chips decide what changes between frames.
            </InlineHelp>
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
            Use this for product families: upload one master, choose the variation chips,
            and keep the background, lighting, and camera locked across the set.
          </p>
        </div>
      </div>

      {/* 1. Master upload */}
      <div className="camera-panel p-2.5 space-y-2">
        <div className="flex items-center gap-1.5">
          <LEDIndicator state={masterImage ? "active" : "off"} size="sm" />
          <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--darkroom-accent)]">
            01 · Master Product Reference
          </span>
          <InlineHelp>
            Use the cleanest image of the product family here. It becomes the anchor for shape, framing, and overall set consistency.
          </InlineHelp>
        </div>
        <UploadZone
          type="product"
          label="Master Product Image"
          description="Pick from Image Library or drop a new file. Shape and composition lock for every variation."
          image={masterImage}
          className="upload-zone-container--compact"
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
            <InlineHelp>
              Each selected chip multiplies the set size. The live frame counter shows the exact number of images before you expose the set.
            </InlineHelp>
            {/* Live combination counter — shows how the matrix expands as
                chips are ticked. Surfaces set-size growth in real time so
                the operator never clicks Expose and is surprised by 32
                frames when they expected 8. */}
            {combinations.length > 0 && (
              <span
                className={cn(
                  "text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border",
                  combinations.length > MAX_VARIATION_SET_SIZE
                    ? "border-[var(--led-error)]/40 text-[var(--led-error)] bg-[var(--led-error)]/10"
                    : "border-[var(--darkroom-accent)]/30 text-[var(--darkroom-accent)] bg-[var(--darkroom-accent)]/5",
                )}
                title={
                  `${selection.bottleColor.length || 1} × ` +
                  `${selection.capColor.length || 1} × ` +
                  `${selection.fitmentType.length || 1}` +
                  ` = ${combinations.length} variation${combinations.length === 1 ? "" : "s"}`
                }
              >
                {combinations.length} frame{combinations.length === 1 ? "" : "s"}
              </span>
            )}
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

      {/* 3. Advanced drawer — collapses Composition + Studio Controls into
          one section so the default path keeps a short, scannable panel.
          Auto-expands when either sub-control is non-default. A small dot
          appears on the collapsed header when any advanced value is set
          so the operator can't forget about a hidden tweak. */}
      <Collapsible
        open={advancedOpen}
        onOpenChange={setAdvancedOpen}
        className="camera-panel"
      >
        <CollapsibleTrigger className="w-full p-2.5 flex items-center justify-between gap-2 group">
          <div className="flex items-center gap-1.5">
            <LEDIndicator
              state={advancedIsDirty ? "active" : "ready"}
              size="sm"
            />
            <Sliders className="w-3 h-3 text-[var(--darkroom-accent)]" />
            <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--darkroom-accent)]">
              03 · Advanced
            </span>
            <InlineHelp>
              Advanced controls refine composition, backdrop, light, and shadow for every image in the set. Use them when the default studio setup is too generic.
            </InlineHelp>
            <span className="text-[9px] text-[var(--darkroom-text-dim)]">
              composition · backdrop · light · shadow
            </span>
            {advancedIsDirty && !advancedOpen && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-[var(--darkroom-accent)]"
                aria-label="Non-default settings active"
              />
            )}
          </div>
          <ChevronDown
            className={cn(
              "w-3 h-3 text-[var(--darkroom-text-dim)] transition-transform",
              advancedOpen && "rotate-180",
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="px-2.5 pb-2.5 space-y-2 data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up">
          {/* Composition — assembled vs exploded-uncapped */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Camera className="w-3 h-3 text-[var(--darkroom-text-dim)]" />
              <span className="text-[9px] font-mono uppercase tracking-wider text-[var(--darkroom-text-dim)]">
                Composition
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

          {/* Studio fine-tune — background / light / shadow. StudioControls
              has its own camera-panel wrapper; keeping it gives us the
              right internal padding + background without rewriting it. */}
          <StudioControls
            value={studio}
            onChange={setStudio}
            disabled={status === "running"}
          />
        </CollapsibleContent>
      </Collapsible>

      {/* 4. Optional prompt */}
      <div className="camera-panel p-2.5 space-y-2">
        <div className="flex items-center gap-1.5">
          <LEDIndicator state={userPrompt.trim() ? "active" : "off"} size="sm" />
          <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--darkroom-accent)]">
            04 · Scene Notes
          </span>
          <InlineHelp>
            Scene Notes apply to every generated frame in the set. Use them for shared instructions like surface, prop style, or campaign mood.
          </InlineHelp>
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
              {combinations.length === 1
                ? "Expose"
                : combinations.length > 1
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
        {canGenerate && combinations.length === 1 && selectionCount === 0 && (
          <p className="text-[10px] text-[var(--darkroom-text-dim)] text-center mt-2">
            Single shot — master reference as-is. Tick chips below for variations.
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
        onApprovePipeline={pipelinePrefill ? handleApprovePipelineFrame : undefined}
        pipelineApprovedImageIds={pipelineApprovedImageIds}
      />
    </div>
    </TooltipProvider>
  );
}
