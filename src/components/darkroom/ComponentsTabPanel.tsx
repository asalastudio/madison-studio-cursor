/**
 * Components tab content for the Best Bottles Studio — paper-doll lane.
 *
 * Inventory model: for one shape cohort (e.g. Empire 50ml Clear) the
 * asset budget is:
 *   - 1 BODY transparent PNG (shared across every SKU in the cohort)
 *   - N FITMENT transparent PNGs, one per unique (applicator, capColor)
 *     combo (shared across the whole family + capacity)
 *
 * Each slot is generated on the `paper-doll-component-1000x1300` preset
 * using a body-only or fitment-only prompt scope. Once approved, layered
 * composition produces every variant pixel-identically.
 *
 * Scope of this commit (V1):
 * - Slot grid UI: body + per-applicator fitment sections with per-slot
 *   status, generate, preview, and approve affordances
 * - Generation wired to the existing edge function via
 *   `useAssembledPromptGeneration` with componentScope = "body" | "fitment"
 * - Approve tags the Library entry with `paper-doll-component` role
 * - NOT YET: writeback to Convex paperDoll*Url fields (next commit)
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  Sparkles,
  Check,
  AlertCircle,
  Download,
  Layers,
  Wine,
  UploadCloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LEDIndicator } from "@/components/darkroom/LEDIndicator";
import {
  getImagePreset,
  getPaperDollPresetIdForFamily,
} from "@/config/imagePresets";
import { assemblePrompt } from "@/lib/product-image/promptAssembler";
import type { ApplicatorBucket, Product } from "@/integrations/convex/bestBottles";
import { applicatorRequiresTubeBody } from "@/config/applicatorShapeDescriptors";
import { useAssembledPromptGeneration } from "@/hooks/useAssembledPromptGeneration";
import { useBackgroundRemoval } from "@/hooks/useBackgroundRemoval";
import {
  colorCorrectToTarget,
  dataUrlToBlob,
} from "@/lib/product-image/colorCorrect";
import { classifyReferenceFilename } from "@/lib/product-image/classifyReferenceFilename";
import {
  upsertApprovedAsset,
  listApprovedAssetsForCohort,
  clearApprovedAsset,
  slotIdForApprovedRow,
  type PaperDollAssetRole,
} from "@/lib/paperDollAssets";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOnboarding } from "@/hooks/useOnboarding";
import { useToast } from "@/hooks/use-toast";

const PAPER_DOLL_TARGET_CREAM = "#EEE6D4";

interface Slot {
  id: string;
  kind: "body" | "fitment";
  label: string;
  sublabel?: string;
  /** Representative product row the slot is generated from. */
  sourceProduct: Product;
  /** For fitment slots, the applicator name + cap color. */
  applicator?: string;
  capColor?: string | null;
  /**
   * For body slots only: which body variant.
   *  - "no-tube":  used by closures (Reducer, Stopper, Cap, Over Cap)
   *  - "with-tube": used by sprayers + pumps + droppers (tube lives inside
   *                 the body so all sprayer fitments are tube-less)
   */
  bodyVariant?: "no-tube" | "with-tube";
}

interface SlotResult {
  imageUrl: string;
  savedImageId: string | null;
  approved: boolean;
  /**
   * Source provenance:
   *  - "uploaded"  — raw Photoshop extract, unmodified
   *  - "generated" — pure AI generation from the paper-doll preset + SKU data
   *  - "enhanced"  — AI pass with the uploaded PSD extract as reference (geometry
   *                  locked to the upload, material/lighting polished)
   */
  source: "uploaded" | "generated" | "enhanced";
  /** For "enhanced" results — the original upload URL, so operator can revert. */
  originalUploadUrl?: string;
}

type UnclassifiedFile = {
  name: string;
  url: string;
  reason: string;
};

interface ComponentsTabPanelProps {
  applicatorBuckets: ApplicatorBucket[];
  variants: Product[];
  familyName?: string | null;
  /** Convex productGroup slug for this shape cohort — used as the approval key. */
  cohortSlug: string | null;
}

/**
 * Map a slot to the paper-doll asset role. Roller Ball applicators get
 * "roller" role since the Convex schema has a dedicated paperDollRollerUrl
 * field; plain caps (Cap/Closure, Over Cap) get "cap"; everything else
 * with an applicator is "fitment".
 */
function roleForSlot(slot: Slot): PaperDollAssetRole {
  if (slot.kind === "body") return "body";
  const applicator = slot.applicator ?? "";
  if (applicator.includes("Roller Ball")) return "roller";
  if (applicator === "Cap/Closure" || applicator === "Over Cap") return "cap";
  return "fitment";
}

function buildSlots(
  variants: Product[],
  applicatorBuckets: ApplicatorBucket[],
): { bodySlots: Slot[]; fitmentSections: Array<{ applicator: string; slots: Slot[] }> } {
  if (variants.length === 0) {
    return { bodySlots: [], fitmentSections: [] };
  }

  const representative = variants[0];
  const bodyKey =
    `${representative.family ?? "?"}-${representative.capacityMl ?? "?"}-${representative.color ?? "?"}`;
  const sublabel = [
    representative.capacityMl ? `${representative.capacityMl} ml` : null,
    representative.color,
    representative.neckThreadSize,
  ]
    .filter(Boolean)
    .join(" · ");

  // Decide which body variants are needed. If any applicator in this cohort
  // requires a tube (sprayers, pumps, droppers), produce both the no-tube
  // and the with-tube body so all fitments have a matching body to composite
  // onto. Closure-only families (Reducer, Stopper, Cap) only need the
  // no-tube body.
  const needsTubeBody = applicatorBuckets.some((b) =>
    applicatorRequiresTubeBody(b.applicator),
  );
  const needsNoTubeBody = applicatorBuckets.some(
    (b) => !applicatorRequiresTubeBody(b.applicator),
  );

  const bodySlots: Slot[] = [];

  if (needsNoTubeBody) {
    bodySlots.push({
      id: `body-${bodyKey}-notube`,
      kind: "body",
      label: `${representative.family ?? "Bottle"} body · no tube`,
      sublabel: `${sublabel} · for closures (Reducer, Stopper, Cap)`,
      sourceProduct: representative,
      bodyVariant: "no-tube",
    });
  }
  if (needsTubeBody) {
    bodySlots.push({
      id: `body-${bodyKey}-withtube`,
      kind: "body",
      label: `${representative.family ?? "Bottle"} body · with tube`,
      sublabel: `${sublabel} · for sprayers, pumps, droppers`,
      sourceProduct: representative,
      bodyVariant: "with-tube",
    });
  }
  // Defensive — if neither flag set (no fitments at all), still show one body.
  if (bodySlots.length === 0) {
    bodySlots.push({
      id: `body-${bodyKey}`,
      kind: "body",
      label: `${representative.family ?? "Bottle"} body`,
      sublabel,
      sourceProduct: representative,
      bodyVariant: "no-tube",
    });
  }

  const fitmentSections = applicatorBuckets.map((bucket) => {
    const seen = new Set<string>();
    const slots: Slot[] = [];
    for (const variant of bucket.variants) {
      const key = `${bucket.applicator}__${variant.capColor ?? "unspec"}`;
      if (seen.has(key)) continue;
      seen.add(key);
      slots.push({
        id: `fitment-${bucket.applicator}-${variant.capColor ?? "unspec"}`,
        kind: "fitment",
        label: variant.capColor ?? "Unspecified",
        sublabel: bucket.applicator,
        sourceProduct: variant,
        applicator: bucket.applicator,
        capColor: variant.capColor,
      });
    }
    return { applicator: bucket.applicator, slots };
  });

  return { bodySlots, fitmentSections };
}

function SlotCard({
  slot,
  result,
  isGenerating,
  onGenerate,
  onApprove,
  onEnhance,
  onRevertEnhance,
  canvasW,
  canvasH,
}: {
  slot: Slot;
  result: SlotResult | undefined;
  isGenerating: boolean;
  onGenerate: () => void;
  onApprove: () => void;
  onEnhance: () => void;
  onRevertEnhance: () => void;
  canvasW: number;
  canvasH: number;
}) {
  const status = result?.approved
    ? "approved"
    : result
      ? "generated"
      : isGenerating
        ? "generating"
        : "empty";

  const ledState =
    status === "approved"
      ? "ready"
      : status === "generating"
        ? "processing"
        : status === "generated"
          ? "active"
          : "off";

  return (
    <div
      className="rounded border p-2 space-y-2"
      style={{
        borderColor:
          status === "approved"
            ? "rgba(74, 222, 128, 0.4)"
            : "var(--darkroom-border-subtle)",
        background: "var(--darkroom-surface)",
      }}
    >
      <div className="flex items-start gap-2">
        <LEDIndicator state={ledState} size="md" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium truncate" style={{ color: "var(--darkroom-text)" }}>
            {slot.label}
          </div>
          {slot.sublabel && (
            <div
              className="text-[10px] truncate"
              style={{ color: "var(--darkroom-text-dim)" }}
            >
              {slot.sublabel}
            </div>
          )}
        </div>
      </div>

      <div
        className="relative rounded border flex items-center justify-center overflow-hidden"
        style={{
          aspectRatio: `${canvasW} / ${canvasH}`,
          borderColor: "var(--darkroom-border-subtle)",
          // Cream preview background matches the paper-doll canvas color, so
          // uploaded layers on cream preview naturally instead of against a
          // dark panel that misrepresents how they'll actually composite.
          background: "#EEE6D4",
        }}
      >
        {result ? (
          <img
            src={result.imageUrl}
            alt={slot.label}
            className="absolute inset-0 w-full h-full object-contain"
          />
        ) : isGenerating ? (
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--darkroom-accent)" }} />
        ) : (
          <span className="text-[10px]" style={{ color: "rgba(0,0,0,0.3)" }}>
            {canvasW} × {canvasH}
          </span>
        )}
        {result && (
          <span
            className="absolute top-1 right-1 text-[9px] font-mono uppercase tracking-wider px-1 py-0.5 rounded border"
            style={{
              background: "rgba(0, 0, 0, 0.6)",
              borderColor: "rgba(255, 255, 255, 0.15)",
              color:
                result.source === "uploaded"
                  ? "#D6B68A"
                  : result.source === "enhanced"
                    ? "#A7F3D0"
                    : "#94a3b8",
            }}
          >
            {result.source === "uploaded"
              ? "PSD"
              : result.source === "enhanced"
                ? "PSD+AI"
                : "AI"}
          </span>
        )}
      </div>

      <div className="flex gap-1 flex-wrap">
        {!result ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onGenerate}
            disabled={isGenerating}
            className="flex-1 h-7 text-[11px] border-white/15 bg-white/[0.02] text-white hover:bg-white/[0.06] hover:text-white"
          >
            {isGenerating ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <>
                <Sparkles className="w-3 h-3 mr-1" />
                Generate
              </>
            )}
          </Button>
        ) : (
          <>
            {!result.approved && result.source === "uploaded" && (
              <Button
                type="button"
                size="sm"
                onClick={onEnhance}
                disabled={isGenerating}
                className="flex-1 h-7 text-[11px] bg-[var(--darkroom-accent,#B8956A)] text-black hover:bg-[var(--darkroom-accent,#B8956A)]/90"
                title="Enhance this PSD extract with gpt-image-2 using it as a reference. Geometry locked, material and lighting polished."
              >
                {isGenerating ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <>
                    <Sparkles className="w-3 h-3 mr-1" />
                    Enhance
                  </>
                )}
              </Button>
            )}
            {!result.approved && (
              <Button
                type="button"
                size="sm"
                onClick={onApprove}
                disabled={isGenerating}
                className="flex-1 h-7 text-[11px] bg-emerald-600 text-white hover:bg-emerald-500"
              >
                <Check className="w-3 h-3 mr-1" />
                Approve
              </Button>
            )}
            {result.approved && (
              <Button
                asChild
                type="button"
                size="sm"
                variant="outline"
                className="flex-1 h-7 text-[11px] border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
              >
                <a href={result.imageUrl} target="_blank" rel="noreferrer">
                  <Download className="w-3 h-3 mr-1" />
                  Approved
                </a>
              </Button>
            )}
            {result.source === "enhanced" && !result.approved && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={onRevertEnhance}
                disabled={isGenerating}
                className="h-7 px-2 text-[11px] text-white/60 hover:text-white"
                title="Revert to original upload"
              >
                ↺
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onGenerate}
              disabled={isGenerating}
              className="h-7 px-2 text-[11px] text-white/60 hover:text-white"
              title="Regenerate from scratch (replaces current asset)"
            >
              ↻
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export function ComponentsTabPanel({
  applicatorBuckets,
  variants,
  familyName,
  cohortSlug,
}: ComponentsTabPanelProps) {
  const { bodySlots, fitmentSections } = useMemo(
    () => buildSlots(variants, applicatorBuckets),
    [variants, applicatorBuckets],
  );

  const [slotResults, setSlotResults] = useState<Record<string, SlotResult>>({});
  const [generatingSlot, setGeneratingSlot] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [isIngesting, setIsIngesting] = useState(false);
  const [unclassifiedFiles, setUnclassifiedFiles] = useState<UnclassifiedFile[]>([]);

  const { user } = useAuth();
  const { currentOrganizationId } = useOnboarding();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { generate } = useAssembledPromptGeneration();
  const { removeBackground } = useBackgroundRemoval();

  // Hydrate slotResults from previously-approved DB rows when the Studio
  // loads. Re-approval upserts; navigation away and back retains state.
  const approvedAssetsQuery = useQuery({
    queryKey: ["paper-doll-approved", currentOrganizationId, cohortSlug],
    enabled: Boolean(currentOrganizationId && cohortSlug),
    queryFn: () => {
      if (!currentOrganizationId || !cohortSlug) return [];
      return listApprovedAssetsForCohort(currentOrganizationId, cohortSlug);
    },
  });

  // Merge DB approvals into the slot result map on first load (only for
  // slots not already in local state, to avoid overwriting an in-flight
  // generation result with stale DB data).
  useEffect(() => {
    const rows = approvedAssetsQuery.data;
    if (!rows || rows.length === 0) return;
    setSlotResults((prev) => {
      const next = { ...prev };
      for (const row of rows) {
        const slotId = slotIdForApprovedRow(row);
        if (next[slotId]) continue;
        next[slotId] = {
          imageUrl: row.image_url,
          savedImageId: row.library_image_id,
          approved: true,
          source: row.source,
        };
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approvedAssetsQuery.data]);

  /**
   * Two-pass post-process on a freshly generated/enhanced image:
   *
   *   1. Color-correct on canvas — sample a corner pixel, compute the RGB
   *      delta to #EEE6D4 (rgb 238,230,212), apply the offset to every
   *      pixel. Background hits the exact target; cream-through-glass
   *      shifts proportionally and harmonizes with the surrounding canvas.
   *   2. fal.ai BiRefNet — strip the (now exact-cream) background outside
   *      the bottle silhouette to alpha=0. Slot's cream container shows
   *      through, producing pixel-exact cream around the bottle.
   *
   * The corrected image is uploaded to Supabase Storage between passes so
   * BiRefNet receives a real URL to fetch (the raw data URL from canvas
   * isn't always reachable from the edge function side).
   *
   * Returns the final transparent-bg URL, or the original on failure.
   */
  const cleanBackground = async (imageUrl: string): Promise<string | null> => {
    let workingUrl = imageUrl;

    if (user && currentOrganizationId) {
      try {
        const correctedDataUrl = await colorCorrectToTarget(
          imageUrl,
          PAPER_DOLL_TARGET_CREAM,
        );
        const blob = dataUrlToBlob(correctedDataUrl);
        const ts = Date.now();
        const rand = Math.random().toString(36).slice(2, 8);
        const path = `${currentOrganizationId}/${user.id}/paper-doll/corrected_${ts}_${rand}.png`;
        const { error: uploadError } = await supabase.storage
          .from("generated-images")
          .upload(path, blob, { cacheControl: "3600", upsert: false, contentType: "image/png" });
        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from("generated-images")
            .getPublicUrl(path);
          if (urlData?.publicUrl) workingUrl = urlData.publicUrl;
        } else {
          console.warn("[ComponentsTabPanel] color-corrected upload failed", uploadError);
        }
      } catch (e) {
        console.warn("[ComponentsTabPanel] color correction skipped", e);
      }
    }

    try {
      const result = await removeBackground({ imageUrl: workingUrl, saveToLibrary: false });
      if (result?.success && result.imageUrl) return result.imageUrl;
    } catch (e) {
      console.warn("[ComponentsTabPanel] background removal failed", e);
    }
    // Fall back to the color-corrected (but not bg-removed) URL if BiRefNet
    // failed; better than the uncorrected original.
    return workingUrl !== imageUrl ? workingUrl : null;
  };

  /**
   * Bulk-ingest Photoshop-extracted layer PNGs. Each file is uploaded to the
   * `generated-images` bucket, classified by filename, and placed into the
   * matching slot as an "uploaded" asset (operator can approve as-is or
   * optionally run it through an AI enhance pass afterward).
   */
  const handleIngest = async (files: FileList | File[]) => {
    if (!user || !currentOrganizationId) {
      toast({
        title: "Sign-in required",
        description: "Must be signed in to upload paper-doll layers.",
        variant: "destructive",
      });
      return;
    }

    const arr = Array.from(files);
    if (arr.length === 0) return;
    setIsIngesting(true);
    setGlobalError(null);

    let placed = 0;
    let skipped = 0;
    const newResults: Record<string, SlotResult> = {};
    const newUnclassified: UnclassifiedFile[] = [];
    const batchSlotNames = new Map<string, string>();

    const skipFile = (file: File, url: string, reason: string) => {
      skipped++;
      newUnclassified.push({ name: file.name, url, reason });
    };

    for (const file of arr) {
      try {
        const timestamp = Date.now();
        const random = Math.random().toString(36).slice(2, 8);
        const ext = file.name.split(".").pop() || "png";
        const path = `${currentOrganizationId}/${user.id}/paper-doll/${timestamp}_${random}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("generated-images")
          .upload(path, file, { cacheControl: "3600", upsert: false });
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from("generated-images")
          .getPublicUrl(path);
        const publicUrl = urlData.publicUrl;

        const classification = classifyReferenceFilename(file.name);
        if (!classification) {
          skipFile(
            file,
            publicUrl,
            "No recognizable body/applicator token. Add a SKU-style code like SPR-MBLK, or words like fine-mist matte-black.",
          );
          continue;
        }

        // Match to a slot.
        let targetSlot: Slot | undefined;
        let unmatchedReason = "No matching slot in this cohort.";
        if (classification.kind === "body") {
          targetSlot = bodySlots[0] ?? undefined;
          unmatchedReason = "Classified as a body file, but this cohort has no body slot.";
        } else if (classification.kind === "fitment") {
          const matchingApp = fitmentSections.find(
            (s) =>
              s.applicator.toLowerCase() ===
              (classification.applicator ?? "").toLowerCase(),
          );
          if (matchingApp) {
            targetSlot = classification.capColor
              ? matchingApp.slots.find(
                (slot) =>
                  (slot.capColor ?? "").toLowerCase() ===
                  (classification.capColor ?? "").toLowerCase(),
                )
              : matchingApp.slots.length === 1
                ? matchingApp.slots[0]
                : undefined;
            unmatchedReason = classification.capColor
              ? `Classified as ${classification.applicator} / ${classification.capColor}, but this cohort only has: ${matchingApp.slots.map((s) => s.capColor ?? "Unspecified").join(", ")}.`
              : `Classified as ${classification.applicator}, but no cap color was found and this cohort has ${matchingApp.slots.length} colorways. Include a color token like MBLK, MSLV, MBLU, MCPR, MGLD, SBLK, SGLD, or SSLV.`;
          } else {
            unmatchedReason = `Classified as ${classification.applicator}, but this cohort has no ${classification.applicator} section.`;
          }
        }

        if (!targetSlot) {
          skipFile(file, publicUrl, unmatchedReason);
          continue;
        }

        const batchDuplicate = batchSlotNames.get(targetSlot.id);
        if (batchDuplicate) {
          skipFile(
            file,
            publicUrl,
            `Duplicate for ${targetSlot.label} / ${targetSlot.sublabel ?? targetSlot.kind}; ${batchDuplicate} already filled that slot in this upload.`,
          );
          continue;
        }

        batchSlotNames.set(targetSlot.id, file.name);
        placed++;
        newResults[targetSlot.id] = {
          imageUrl: publicUrl,
          savedImageId: null,
          approved: false,
          source: "uploaded",
        };
      } catch (e) {
        console.error("Ingest error for", file.name, e);
      }
    }

    setSlotResults((prev) => ({ ...prev, ...newResults }));
    setUnclassifiedFiles((prev) => [...prev, ...newUnclassified]);
    setIsIngesting(false);
    toast({
      title: "Upload complete",
      description: `${placed} placed · ${skipped} skipped · ${arr.length} total`,
    });
  };

  const paperDollPresetId = getPaperDollPresetIdForFamily(familyName);
  const paperDollPreset = getImagePreset(paperDollPresetId);

  const handleGenerate = async (slot: Slot) => {
    setGlobalError(null);
    setGeneratingSlot(slot.id);
    try {
      const assembled = assemblePrompt({
        presetId: paperDollPresetId,
        sku: slot.sourceProduct,
        componentScope: slot.kind,
        bodyVariant: slot.kind === "body" ? slot.bodyVariant : undefined,
      });
      const familyTag = familyName
        ? `family:${familyName.toLowerCase().replace(/\s+/g, "-")}`
        : null;
      const slotTags = [
        "brand:best-bottles",
        "paper-doll-component",
        `component-kind:${slot.kind}`,
        slot.bodyVariant ? `body-variant:${slot.bodyVariant}` : null,
        slot.applicator ? `applicator:${slot.applicator.toLowerCase().replace(/\s+/g, "-")}` : null,
        slot.capColor ? `cap-color:${slot.capColor.toLowerCase().replace(/\s+/g, "-")}` : null,
        familyTag,
      ].filter((t): t is string => Boolean(t));

      const result = await generate(assembled, {
        referenceImageUrl: slot.sourceProduct.imageUrl,
        // Slot identifier rides on library tags (string-friendly), NOT on
        // sessionId — generated_images.session_id is a uuid column. The
        // hook mints a real uuid per call.
        extraLibraryTags: [...slotTags, `slot:${slot.id}`],
        productContext: {
          name: slot.sourceProduct.itemName,
          category: slot.sourceProduct.category,
        },
      });

      if (result) {
        setSlotResults((prev) => ({
          ...prev,
          [slot.id]: {
            imageUrl: result.imageUrl,
            savedImageId: result.savedImageId,
            approved: false,
            source: "generated",
          },
        }));
        // Auto-fire fal.ai BiRefNet so the slot preview shows exact #EEE6D4.
        const transparentUrl = await cleanBackground(result.imageUrl);
        if (transparentUrl) {
          setSlotResults((prev) => ({
            ...prev,
            [slot.id]: {
              ...(prev[slot.id] ?? {
                savedImageId: result.savedImageId,
                approved: false,
                source: "generated",
              }),
              imageUrl: transparentUrl,
            },
          }));
        }
      }
    } catch (e) {
      setGlobalError(e instanceof Error ? e.message : "Component generation failed.");
    } finally {
      setGeneratingSlot(null);
    }
  };

  /**
   * Run a reference-anchored AI enhancement on an uploaded PSD layer. The
   * upload's public URL is passed to gpt-image-2 `/images/edits` as the
   * reference; the paper-doll preset supplies locked lighting / material /
   * cream-background language; componentScope ("body" | "fitment") tells the
   * SKU injector to describe the right subset of the SKU. Output is a new
   * image with geometry anchored to the upload and material/lighting polished.
   */
  const handleEnhance = async (slot: Slot) => {
    const existing = slotResults[slot.id];
    if (!existing || existing.source !== "uploaded") return;

    setGlobalError(null);
    setGeneratingSlot(slot.id);
    try {
      const assembled = assemblePrompt({
        presetId: paperDollPresetId,
        sku: slot.sourceProduct,
        componentScope: slot.kind,
        bodyVariant: slot.kind === "body" ? slot.bodyVariant : undefined,
      });
      const familyTag = familyName
        ? `family:${familyName.toLowerCase().replace(/\s+/g, "-")}`
        : null;
      const slotTags = [
        "brand:best-bottles",
        "paper-doll-component",
        "paper-doll-enhanced",
        `component-kind:${slot.kind}`,
        slot.bodyVariant ? `body-variant:${slot.bodyVariant}` : null,
        slot.applicator ? `applicator:${slot.applicator.toLowerCase().replace(/\s+/g, "-")}` : null,
        slot.capColor ? `cap-color:${slot.capColor.toLowerCase().replace(/\s+/g, "-")}` : null,
        familyTag,
      ].filter((t): t is string => Boolean(t));

      const result = await generate(assembled, {
        referenceImageUrl: existing.imageUrl,
        extraLibraryTags: [...slotTags, `slot:${slot.id}`],
        productContext: {
          name: slot.sourceProduct.itemName,
          category: slot.sourceProduct.category,
        },
      });

      if (result) {
        setSlotResults((prev) => ({
          ...prev,
          [slot.id]: {
            imageUrl: result.imageUrl,
            savedImageId: result.savedImageId,
            approved: false,
            source: "enhanced",
            originalUploadUrl: existing.imageUrl,
          },
        }));
        // Auto-fire fal.ai BiRefNet so background hits exact #EEE6D4 via the
        // slot's transparent → cream-canvas show-through.
        const transparentUrl = await cleanBackground(result.imageUrl);
        if (transparentUrl) {
          setSlotResults((prev) => ({
            ...prev,
            [slot.id]: {
              ...(prev[slot.id] ?? {
                savedImageId: result.savedImageId,
                approved: false,
                source: "enhanced",
                originalUploadUrl: existing.imageUrl,
              }),
              imageUrl: transparentUrl,
            },
          }));
        }
      }
    } catch (e) {
      setGlobalError(e instanceof Error ? e.message : "Enhance failed.");
    } finally {
      setGeneratingSlot(null);
    }
  };

  /** Revert an enhanced slot back to its original upload. */
  const handleRevertEnhance = (slot: Slot) => {
    setSlotResults((prev) => {
      const existing = prev[slot.id];
      if (!existing || existing.source !== "enhanced" || !existing.originalUploadUrl) {
        return prev;
      }
      return {
        ...prev,
        [slot.id]: {
          imageUrl: existing.originalUploadUrl,
          savedImageId: null,
          approved: false,
          source: "uploaded",
        },
      };
    });
  };

  const handleApprove = async (slot: Slot) => {
    const existing = slotResults[slot.id];
    if (!existing) return;
    if (!currentOrganizationId || !cohortSlug) {
      toast({
        title: "Cannot approve",
        description: "Missing organization or cohort context.",
        variant: "destructive",
      });
      return;
    }

    // Optimistic flip in local state for immediate UI feedback.
    setSlotResults((prev) => ({
      ...prev,
      [slot.id]: { ...existing, approved: true },
    }));

    try {
      await upsertApprovedAsset({
        organizationId: currentOrganizationId,
        userId: user?.id ?? null,
        cohortSlug,
        family: familyName ?? slot.sourceProduct.family ?? "Unknown",
        capacityMl: slot.sourceProduct.capacityMl,
        glassColor: slot.sourceProduct.color,
        role: roleForSlot(slot),
        bodyVariant: slot.kind === "body" ? slot.bodyVariant ?? null : null,
        applicator: slot.kind === "fitment" ? slot.applicator ?? null : null,
        capColor: slot.kind === "fitment" ? slot.capColor ?? null : null,
        imageUrl: existing.imageUrl,
        sourceImageUrl: existing.originalUploadUrl ?? null,
        source: existing.source,
        libraryImageId: existing.savedImageId,
      });
      await queryClient.invalidateQueries({
        queryKey: ["paper-doll-approved", currentOrganizationId, cohortSlug],
      });
      toast({
        title: `${slot.label} approved`,
        description: "Persisted to paper-doll asset library.",
      });
    } catch (e) {
      // Roll back optimistic flip on failure.
      setSlotResults((prev) => ({
        ...prev,
        [slot.id]: { ...existing, approved: false },
      }));
      toast({
        title: "Approval write failed",
        description: e instanceof Error ? e.message : "Unknown error.",
        variant: "destructive",
      });
    }
  };

  /** Revert a previously-approved asset back to unapproved (DB row deleted). */
  const handleUnapprove = async (slot: Slot) => {
    if (!currentOrganizationId || !cohortSlug) return;
    try {
      await clearApprovedAsset({
        organizationId: currentOrganizationId,
        cohortSlug,
        role: roleForSlot(slot),
        bodyVariant: slot.kind === "body" ? slot.bodyVariant ?? null : null,
        applicator: slot.kind === "fitment" ? slot.applicator ?? null : null,
        capColor: slot.kind === "fitment" ? slot.capColor ?? null : null,
      });
      setSlotResults((prev) => {
        const existing = prev[slot.id];
        if (!existing) return prev;
        return {
          ...prev,
          [slot.id]: { ...existing, approved: false },
        };
      });
      await queryClient.invalidateQueries({
        queryKey: ["paper-doll-approved", currentOrganizationId, cohortSlug],
      });
    } catch (e) {
      toast({
        title: "Unapprove failed",
        description: e instanceof Error ? e.message : "Unknown error.",
        variant: "destructive",
      });
    }
  };

  const totalSlots = bodySlots.length + fitmentSections.reduce((acc, s) => acc + s.slots.length, 0);
  const approvedCount = Object.values(slotResults).filter((r) => r.approved).length;

  if (bodySlots.length === 0) {
    return (
      <div
        className="text-sm p-6"
        style={{ color: "var(--darkroom-text-muted)" }}
      >
        No variants loaded — nothing to paper-doll.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LEDIndicator state={approvedCount === totalSlots ? "ready" : "off"} />
          <span className="text-xs uppercase tracking-wider" style={{ color: "var(--darkroom-text-dim)" }}>
            Paper-doll inventory
          </span>
        </div>
        <span className="text-[11px] font-mono" style={{ color: "var(--darkroom-text-muted)" }}>
          {approvedCount} / {totalSlots} approved
        </span>
      </div>

      {/* Folder-drop ingestion zone — the preferred entry point. PSD-extracted
          PNGs land in slots by filename convention. */}
      <div
        className="rounded border-2 border-dashed p-4 text-center space-y-2 transition-colors"
        style={{
          borderColor: isIngesting
            ? "var(--darkroom-accent)"
            : "var(--darkroom-border-subtle)",
          background: isIngesting
            ? "rgba(184, 149, 106, 0.05)"
            : "var(--darkroom-surface)",
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleIngest(e.dataTransfer.files);
          }
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleIngest(e.target.files);
              e.target.value = "";
            }
          }}
        />
        <div className="flex items-center justify-center gap-2">
          {isIngesting ? (
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--darkroom-accent)" }} />
          ) : (
            <UploadCloud className="w-4 h-4" style={{ color: "var(--darkroom-accent)" }} />
          )}
          <span className="text-xs font-medium" style={{ color: "var(--darkroom-text)" }}>
            {isIngesting ? "Uploading…" : "Drop Photoshop-extracted layer PNGs"}
          </span>
        </div>
        <p className="text-[11px]" style={{ color: "var(--darkroom-text-dim)" }}>
          Files are classified by filename. Use patterns like{" "}
          <code>GB-CYL-CLR-5ML-SPR-MBLK.png</code>, <code>cylinder-5ml-13-415-fine-mist-matte-blue.png</code>,{" "}
          <code>empire-reducer-matte-silver.png</code>.
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={isIngesting}
          className="h-7 text-[11px] border-white/15 bg-white/[0.02] text-white hover:bg-white/[0.06] hover:text-white"
        >
          Or browse files
        </Button>
      </div>

      {unclassifiedFiles.length > 0 && (
        <div
          className="rounded border p-3 space-y-2"
          style={{
            borderColor: "rgba(245, 158, 11, 0.4)",
            background: "rgba(245, 158, 11, 0.05)",
          }}
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5" style={{ color: "#F59E0B" }} />
            <span className="text-[11px] uppercase tracking-wider" style={{ color: "#F59E0B" }}>
              {unclassifiedFiles.length} skipped — rename, switch cohort, or upload the missing slot
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {unclassifiedFiles.map((f) => (
              <span
                key={f.url}
                className="text-[10px] font-mono px-1.5 py-0.5 rounded border"
                style={{
                  borderColor: "rgba(245, 158, 11, 0.3)",
                  color: "#FBBF24",
                }}
                title={f.reason}
              >
                {f.name} — {f.reason}
              </span>
            ))}
          </div>
        </div>
      )}

      {globalError && (
        <div
          className="p-3 rounded border flex items-start gap-2 text-xs"
          style={{
            borderColor: "var(--darkroom-error)",
            color: "var(--darkroom-error)",
            background: "rgba(239, 68, 68, 0.05)",
          }}
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{globalError}</span>
        </div>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wine className="w-3.5 h-3.5" style={{ color: "var(--darkroom-accent)" }} />
            <span className="text-[11px] uppercase tracking-wider font-medium" style={{ color: "var(--darkroom-accent)" }}>
              Body
            </span>
          </div>
          <span className="text-[10px] font-mono" style={{ color: "var(--darkroom-text-dim)" }}>
            {bodySlots.length === 2 ? "2 variants (with / without dip tube)" : "1 variant"}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {bodySlots.map((slot) => (
            <SlotCard
              key={slot.id}
              slot={slot}
              result={slotResults[slot.id]}
              isGenerating={generatingSlot === slot.id}
              onGenerate={() => handleGenerate(slot)}
              onApprove={() => handleApprove(slot)}
              onEnhance={() => handleEnhance(slot)}
              onRevertEnhance={() => handleRevertEnhance(slot)}
              canvasW={paperDollPreset.canvas.widthPx}
              canvasH={paperDollPreset.canvas.heightPx}
            />
          ))}
        </div>
      </section>

      {fitmentSections.map(({ applicator, slots }) => (
        <section key={applicator} className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-3.5 h-3.5" style={{ color: "var(--darkroom-accent)" }} />
              <span className="text-[11px] uppercase tracking-wider font-medium" style={{ color: "var(--darkroom-accent)" }}>
                {applicator}
              </span>
            </div>
            <span className="text-[10px] font-mono" style={{ color: "var(--darkroom-text-dim)" }}>
              {slots.length} {slots.length === 1 ? "colorway" : "colorways"}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {slots.map((slot) => (
              <SlotCard
                key={slot.id}
                slot={slot}
                result={slotResults[slot.id]}
                isGenerating={generatingSlot === slot.id}
                onGenerate={() => handleGenerate(slot)}
                onApprove={() => handleApprove(slot)}
                onEnhance={() => handleEnhance(slot)}
                onRevertEnhance={() => handleRevertEnhance(slot)}
                canvasW={paperDollPreset.canvas.widthPx}
                canvasH={paperDollPreset.canvas.heightPx}
              />
            ))}
          </div>
        </section>
      ))}

      <p
        className="text-[10px] pt-2 border-t leading-relaxed"
        style={{
          borderColor: "var(--darkroom-border-subtle)",
          color: "var(--darkroom-text-dim)",
        }}
      >
        {familyName ?? "This family"} uses the{" "}
        <span className="font-mono">
          {paperDollPreset.canvas.widthPx} × {paperDollPreset.canvas.heightPx}
        </span>{" "}
        paper-doll canvas on cream <span className="font-mono">#EEE6D4</span> — matching the fixed
        paper-doll canvas color on bestbottles.com so glass refraction reads correctly once
        composited. Flow: <span className="font-mono">PSD upload</span> →{" "}
        <span className="font-mono">Enhance</span> (gpt-image-2 with upload as reference, geometry
        locked, lighting &amp; material polished) → <span className="font-mono">Approve</span>.
        Next: fal.ai background-remove post-process, then Convex{" "}
        <span className="font-mono">paperDoll*Url</span> writeback.
      </p>
    </div>
  );
}
