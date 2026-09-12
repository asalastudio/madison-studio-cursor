import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, CloudUpload, Cpu, Eraser, FolderOpen, Play, RefreshCw, ShieldCheck } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  CandidateProviderModels,
  type CandidateJobRequest,
  type CandidateProvider,
  type ManualCandidateAssetRef,
  type PrivateAssetRef,
} from "@/lib/paperDoll/candidateJobContract";
import {
  approveCandidate,
  createCandidateJob,
  loadCandidateWorkbench,
  uploadCandidateSource,
  uploadManualCandidateSource,
  verifySignedPrivateAsset,
  type CandidateHistoryEntry,
} from "@/lib/paperDoll/candidateRepository";
import { downloadImageLibraryCandidate } from "@/lib/paperDoll/libraryCandidateSource";
import { authorityMaskBlocker } from "@/lib/paperDoll/authorityMaskPolicy";
import {
  approvedCandidateDetails,
  approvedCandidateVariants,
  candidateAuditReason,
  candidateAuthorityBlocker,
  candidatePreviewDetails,
  resolveAncestorNotice,
  selectCandidateForReview,
  type ApprovedCandidateDetails,
  type ApprovedCandidateVariant,
} from "@/lib/paperDoll/candidateReviewPolicy";
import type { PaperDollReleaseWorkbenchData } from "@/lib/paperDoll/releaseRepository";
import { ImageLibraryModal } from "@/components/image-editor/ImageLibraryModal";
import type { CandidateInspection } from "./CandidateInspector";
import type { CandidateSelectionKind } from "./assemblyEditModel";
import { candidateHistoryRefreshInterval } from "./candidatePreviewModel";

type ReleaseAsset = PaperDollReleaseWorkbenchData["assets"][number];

interface CandidateActionPanelProps {
  organizationId: string;
  familyKey: "CYL-9ML";
  asset: ReleaseAsset | null;
  assemblyContext: ReleaseAsset | null;
  selectionKind: CandidateSelectionKind;
  transform: { translateXPx: number; translateYPx: number; scaleX: number; scaleY: number };
  candidateEditingEnabled: boolean;
  selectionReady: boolean;
  serializeMask: () => Promise<string>;
  onInspectionChange: (inspection: CandidateInspection | null) => void;
  onApprovedChange: (approved: ApprovedCandidateDetails | null) => void;
  onApprovedVariantsChange?: (variants: ApprovedCandidateVariant[]) => void;
  onOpenFamilyFit?: () => void;
  reviewOnly?: boolean;
}

const PROVIDERS: Array<{ id: CandidateProvider; label: string; detail: string }> = [
  { id: "blender", label: "Blender", detail: "canonical render" },
  { id: "openai", label: "GPT Image", detail: "gpt-image-2.5" },
  { id: "google", label: "Nano Banana", detail: "Gemini image" },
  { id: "manual", label: "Upload", detail: "versioned source" },
];
// Both vocabularies: legacy harvest keys (SHN-SL era) and the 1.3.0 release
// keys (SSLV era). The live release ledger uses the latter.
const OVERCAP_VARIANTS = new Set([
  "SHN-SL", "SHN-GL", "MAT-CU", "SHN-BLK", "MAT-SL", "MAT-GL", "WHT", "SL-DOT", "BLK-DOT", "PNK-DOT",
  "SSLV", "SGLD", "MCPR", "SBLK", "MSLV", "MGLD", "SLDT", "BKDT", "PKDT",
]);
const ROLLER_VARIANTS = new Set(["PLASTIC", "METAL"]);

/**
 * Run an imported candidate through Madison's remove-background edge function
 * (fal.ai BiRefNet — the same remover used in image refine) before it enters
 * the candidate pipeline. Returns a new PNG File with transparent background.
 */
async function stripFileBackground(file: File, userId: string | undefined): Promise<File> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  const { data, error } = await supabase.functions.invoke("remove-background", {
    body: { imageBase64: btoa(binary), userId, saveToLibrary: false },
  });
  if (error) throw new Error(`Background removal failed: ${error.message ?? String(error)}`);
  const result = data as { success?: boolean; imageUrl?: string; imageBase64?: string; error?: string } | null;
  if (!result || result.error || result.success === false) {
    throw new Error(result?.error ?? "Background removal returned no result.");
  }
  let outBytes: Uint8Array;
  if (result.imageBase64) {
    const raw = atob(result.imageBase64.replace(/^data:image\/\w+;base64,/, ""));
    outBytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) outBytes[i] = raw.charCodeAt(i);
  } else if (result.imageUrl) {
    const response = await fetch(result.imageUrl);
    if (!response.ok) throw new Error(`Cutout download failed (${response.status}).`);
    outBytes = new Uint8Array(await response.arrayBuffer());
  } else {
    throw new Error("Background removal returned no image.");
  }
  return new File([outBytes], `${file.name.replace(/\.png$/i, "")}__bg-removed.png`, { type: "image/png" });
}

const CANVAS_W = 2080;
const CANVAS_H = 2288;

function alphaBBox(data: Uint8ClampedArray, width: number, height: number, threshold = 16) {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] > threshold) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function imageData(bitmap: ImageBitmap): { ctx: CanvasRenderingContext2D; data: ImageData } {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");
  ctx.drawImage(bitmap, 0, 0);
  return { ctx, data: ctx.getImageData(0, 0, bitmap.width, bitmap.height) };
}

/** Does the image contain any meaningful transparency? */
function hasAlpha(data: ImageData): boolean {
  const px = data.data;
  for (let i = 3; i < px.length; i += 4) if (px[i] < 250) return true;
  return false;
}

/**
 * Auto-fit an imported image into the selected layer's authority silhouette:
 * find the content (alpha bbox), find the mask bbox on the 2080×2288 canvas,
 * and scale/position the content into it. Any crop, any resolution — the
 * result is a correctly-sized, correctly-placed full-canvas candidate. The
 * worker's byte-exact alpha clamp still owns the final edges.
 */
async function normalizeIntoAuthority(file: File, maskUrl: string): Promise<File> {
  const [maskBitmap, sourceBitmap] = await Promise.all([
    fetch(maskUrl).then((r) => { if (!r.ok) throw new Error(`Authority mask download failed (${r.status}).`); return r.blob(); }).then((b) => createImageBitmap(b)),
    createImageBitmap(file),
  ]);
  if (sourceBitmap.width === CANVAS_W && sourceBitmap.height === CANVAS_H) return file; // already full canvas
  const mask = imageData(maskBitmap);
  const scaleX = CANVAS_W / maskBitmap.width;
  const scaleY = CANVAS_H / maskBitmap.height;
  const maskBox = alphaBBox(mask.data.data, maskBitmap.width, maskBitmap.height);
  if (!maskBox) throw new Error("Authority mask has no occupied silhouette.");
  const target = { x: maskBox.x * scaleX, y: maskBox.y * scaleY, w: maskBox.w * scaleX, h: maskBox.h * scaleY };
  const source = imageData(sourceBitmap);
  const sourceBox = alphaBBox(source.data.data, sourceBitmap.width, sourceBitmap.height)
    ?? { x: 0, y: 0, w: sourceBitmap.width, h: sourceBitmap.height };
  const out = document.createElement("canvas");
  out.width = CANVAS_W;
  out.height = CANVAS_H;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");
  ctx.imageSmoothingQuality = "high";
  // Asymmetric overfill (seat anchored, centered on X) so the photo's own
  // edge pixels — cutout fringe, top-rim matte junk, dust — land OUTSIDE the
  // authority silhouette and are removed by the byte-exact clamp. The top gets
  // a deeper trim: 2020-source contamination runs ~9-11px deep at the dome.
  const OVERFILL_X = 1.02;
  const OVERFILL_TOP = 1.05;
  const fitW = target.w * OVERFILL_X;
  const fitH = target.h * OVERFILL_TOP;
  const fitX = target.x - (fitW - target.w) / 2;
  const fitY = target.y - (fitH - target.h); // bottom edge (seat) stays fixed
  ctx.drawImage(sourceBitmap, sourceBox.x, sourceBox.y, sourceBox.w, sourceBox.h, fitX, fitY, fitW, fitH);
  const blob: Blob = await new Promise((resolve, reject) =>
    out.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas export failed."))), "image/png"));
  return new File([blob], `${file.name.replace(/\.png$/i, "")}__fitted.png`, { type: "image/png" });
}

function dataUrlBytes(dataUrl: string): Uint8Array {
  const encoded = dataUrl.split(",")[1];
  if (!encoded) throw new Error("Edit mask could not be serialized.");
  const binary = atob(encoded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function assetRef(asset: ReleaseAsset): PrivateAssetRef {
  return {
    bucket: asset.reference.storageBucket,
    path: asset.reference.objectPath,
    sha256: asset.reference.sha256,
    contentType: asset.reference.contentType,
    byteSize: asset.reference.byteSize,
  };
}

function inspectionFrom(entry: CandidateHistoryEntry | null, maskBlocker: string | null): CandidateInspection | null {
  if (!entry) return null;
  const metadata = entry.job.outputMetadata;
  const preview = candidatePreviewDetails(entry);
  const blocking = entry.qa.filter((row) => row.blocking === true);
  const failed = blocking.some((row) => row.qa_status !== "passed");
  return {
    imageUrl: preview?.imageUrl ?? null,
    candidateSha256: preview?.candidateSha256 ?? null,
    alphaBounds: preview?.alphaBounds ?? null,
    differenceUrl: null,
    provider: entry.job.provider,
    model: entry.job.model,
    estimatedCostUsd: null,
    promptHash: entry.job.promptSha256,
    changedPixels: typeof metadata.changedPixelCount === "number" ? metadata.changedPixelCount : null,
    geometryLocked: metadata.geometryLocked === true && !maskBlocker,
    geometryGate: typeof metadata.geometryGate === "string" ? metadata.geometryGate : null,
    qaStatus: maskBlocker ? "failed" : blocking.length === 0 ? "not-run" : failed ? "failed" : "passed",
    variantLabel: entry.job.requirementKey.split(":").at(-1) ?? null,
  };
}

export function CandidateActionPanel({
  organizationId,
  familyKey,
  asset,
  assemblyContext,
  selectionKind,
  transform,
  candidateEditingEnabled,
  selectionReady,
  serializeMask,
  onInspectionChange,
  onApprovedChange,
  onApprovedVariantsChange,
  onOpenFamilyFit,
  reviewOnly = false,
}: CandidateActionPanelProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [provider, setProvider] = useState<CandidateProvider>("blender");
  const [model, setModel] = useState<string>(CandidateProviderModels.blender[0]);
  const [instruction, setInstruction] = useState("Preserve the exact moulded phenolic plastic closure geometry. Change only the specified surface finish and retain the catalog lighting direction.");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [stripBackground, setStripBackground] = useState(true);
  const [reviewVariant, setReviewVariant] = useState<"PLASTIC" | "METAL">(
    asset?.variantKey === "METAL" ? "METAL" : "PLASTIC",
  );

  const history = useQuery({
    queryKey: ["paper-doll-candidate-history", organizationId, familyKey],
    queryFn: async () => {
      try {
        return await loadCandidateWorkbench(supabase, organizationId, familyKey);
      } catch (cause) {
        // Surface the real failure — react-query's silent retries otherwise
        // leave the panel permanently "loading" with no error anywhere.
        console.error("[candidate-history] load failed:", cause, "| org:", organizationId);
        throw cause;
      }
    },
    retry: 1,
    refetchInterval: (candidateQuery) => candidateHistoryRefreshInterval(candidateQuery.state.data?.jobs),
    refetchOnWindowFocus: true,
  });
  const componentHistory = useMemo(
    () => history.data?.jobs.filter((entry) => entry.job.componentId === asset?.componentId) ?? [],
    [asset?.componentId, history.data?.jobs],
  );
  const availableReviewVariants = useMemo(() => Array.from(new Set(
    componentHistory
      .map((entry) => entry.job.requirementKey.split(":").at(-1))
      .filter((variant): variant is "PLASTIC" | "METAL" => variant === "PLASTIC" || variant === "METAL"),
  )), [componentHistory]);
  // The PLASTIC/METAL review-variant split only applies to roller assets.
  // Caps and other overcap components carry their variant in the requirement
  // itself (…:OVERCAP:BKDT) and must surface their full history unfiltered.
  const selectedHistory = useMemo(
    () => asset?.slot === "roller"
      ? componentHistory.filter((entry) => entry.job.requirementKey.endsWith(`:${reviewVariant}`))
      : componentHistory,
    [asset?.slot, componentHistory, reviewVariant],
  );
  const approvedVariants = useMemo(
    () => approvedCandidateVariants(componentHistory),
    [componentHistory],
  );
  useEffect(() => {
    if (!availableReviewVariants.includes(reviewVariant) && availableReviewVariants.length > 0) {
      setReviewVariant(availableReviewVariants[0]);
    }
  }, [availableReviewVariants, reviewVariant]);
  // Failed and revoked outputs remain immutable audit records, but they cannot
  // displace a clean candidate in the working inspector.
  // The newest selectable candidate mounts by default; clicking a history row
  // pins a specific candidate for review instead.
  const [pinnedJobId, setPinnedJobId] = useState<string | null>(null);
  useEffect(() => setPinnedJobId(null), [asset?.componentVersionId]);
  const newestSelectable = selectCandidateForReview(selectedHistory);
  const pinned = pinnedJobId
    ? selectedHistory.find((entry) => entry.job.id === pinnedJobId && candidateAuditReason(entry) === null) ?? null
    : null;
  const latest = pinned ?? newestSelectable;
  const parentMaskBlocker = authorityMaskBlocker(asset?.geometryMaskReference?.sha256);
  const candidateMaskBlocker = candidateAuthorityBlocker(latest);
  const approved = useMemo(() => approvedCandidateDetails(latest), [latest]);
  const ancestorNotice = resolveAncestorNotice({
    parentMaskBlocker,
    candidateMaskBlocker,
    hasCandidate: Boolean(latest),
  });

  useEffect(() => onInspectionChange(inspectionFrom(latest, candidateMaskBlocker)), [latest, candidateMaskBlocker, onInspectionChange]);
  useEffect(() => {
    if (!asset) return;
    console.log("[candidate-debug]", JSON.stringify({
      layer: `${asset.slot}:${asset.variantKey}`,
      componentId: asset.componentId.slice(0, 8),
      historyLoaded: Boolean(history.data),
      historyError: history.error instanceof Error ? history.error.message : null,
      totalJobs: history.data?.jobs.length ?? -1,
      componentHistory: componentHistory.length,
      selectedHistory: selectedHistory.length,
      latest: latest?.job.id?.slice(0, 8) ?? null,
      latestFile: latest?.job.manualOutput?.originalFilename ?? null,
      previewUrl: Boolean((latest as { candidateImageUrl?: string | null } | null)?.candidateImageUrl),
    }));
  }, [asset, history.data, history.error, componentHistory.length, selectedHistory.length, latest]);
  useEffect(() => onApprovedChange(approved), [approved, onApprovedChange]);
  useEffect(() => onApprovedVariantsChange?.(approvedVariants), [approvedVariants, onApprovedVariantsChange]);

  const requirement = useMemo(() => {
    if (!asset) return null;
    if (asset.slot === "roller" && ROLLER_VARIANTS.has(reviewVariant)) return `CYL-9ML:ROLLER:${reviewVariant}`;
    if ((asset.slot === "overcap" || asset.slot === "cap") && OVERCAP_VARIANTS.has(asset.variantKey)) return `CYL-9ML:OVERCAP:${asset.variantKey}`;
    return null;
  }, [asset, reviewVariant]);

  const chooseProvider = (next: CandidateProvider) => {
    setProvider(next);
    setModel(CandidateProviderModels[next][0]);
    setMessage(null);
    setError(null);
  };

  const buildRequest = async (manualOutput?: ManualCandidateAssetRef, providerOverride?: CandidateProvider): Promise<CandidateJobRequest> => {
    if (parentMaskBlocker) throw new Error(parentMaskBlocker);
    if (!asset || !requirement || !asset.geometryMaskUrl || !asset.geometryMaskReference) {
      throw new Error("A registered component requirement and authority mask are required.");
    }
    const editMaskBytes = dataUrlBytes(await serializeMask());
    const editMask = await uploadCandidateSource(supabase, {
      organizationId,
      familyKey,
      assetId: `edit-mask-${asset.componentVersionId}-${selectionKind}`,
      bytes: editMaskBytes,
      contentType: "image/png",
      extension: "png",
    });
    const authoritativeMask = await verifySignedPrivateAsset(asset.geometryMaskUrl, {
      bucket: asset.geometryMaskReference.storageBucket,
      path: asset.geometryMaskReference.objectPath,
      sha256: asset.geometryMaskReference.sha256,
      contentType: "image/png",
    });
    return {
      organizationId,
      requirementKey: requirement,
      componentId: asset.componentId,
      parentComponentVersionId: asset.componentVersionId,
      parentSha256: asset.reference.sha256,
      provider: providerOverride ?? provider,
      model: providerOverride ? CandidateProviderModels[providerOverride][0] : model,
      instruction,
      source: assetRef(asset),
      authoritativeMask,
      editMask,
      assemblyContext: assemblyContext ? assetRef(assemblyContext) : undefined,
      manualOutput,
      transform,
      selectionKind,
    };
  };

  const queue = async (manualFile?: File, providerOverride?: CandidateProvider, stripOverride?: boolean) => {
    if (!candidateEditingEnabled || !selectionReady) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const effectiveProvider = providerOverride ?? provider;
      let manualOutput: ManualCandidateAssetRef | undefined;
      if (effectiveProvider === "manual") {
        if (!manualFile) throw new Error("Choose one PNG manual candidate to upload.");
        // Guard: a filename that names a different variant than the selected
        // layer is almost always a mis-targeted import (e.g. BKDT.png onto a
        // roller — the mask clamp would faithfully produce a hybrid).
        const knownKeys = [...OVERCAP_VARIANTS, "METAL", "PLASTIC"].sort((a, b) => b.length - a.length);
        const upperName = manualFile.name.toUpperCase();
        const nameKey = knownKeys.find((key) => upperName.includes(key));
        if (nameKey && asset && nameKey !== asset.variantKey) {
          const proceed = window.confirm(
            `"${manualFile.name}" looks like variant ${nameKey}, but you are importing onto "${asset.displayName}" (${asset.variantKey}). Import anyway?`,
          );
          if (!proceed) {
            setBusy(false);
            setMessage("Import cancelled — select the matching layer first.");
            return;
          }
        }
        let sourceFile = manualFile;
        // A fully opaque import always gets a background strip — an opaque
        // rectangle can never composite over the bottle, whatever the toggle.
        const probe = imageData(await createImageBitmap(sourceFile));
        const opaque = !hasAlpha(probe.data);
        if ((stripOverride ?? stripBackground) || opaque) {
          setMessage(opaque && !(stripOverride ?? stripBackground)
            ? "Opaque image — removing background automatically (fal BiRefNet)…"
            : "Removing background (fal BiRefNet)…");
          sourceFile = await stripFileBackground(sourceFile, user?.id);
        }
        // Auto-fit crops into the layer's authority silhouette so any
        // resolution imports at the correct size and position.
        if (asset?.geometryMaskUrl) {
          setMessage("Fitting into the authority silhouette…");
          sourceFile = await normalizeIntoAuthority(sourceFile, asset.geometryMaskUrl);
        }
        manualOutput = await uploadManualCandidateSource(supabase, {
          organizationId,
          familyKey,
          assetId: `manual-output-${asset?.componentVersionId ?? "unknown"}`,
          bytes: new Uint8Array(await sourceFile.arrayBuffer()),
          contentType: sourceFile.type || "image/png",
          extension: "png",
          originalFilename: sourceFile.name,
        });
      }
      const queued = await createCandidateJob(supabase, await buildRequest(manualOutput, providerOverride));
      setMessage(`Queued ${queued.provider} / ${queued.model}. The worker has not claimed it yet.`);
      await queryClient.invalidateQueries({ queryKey: ["paper-doll-candidate-history", organizationId, familyKey] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const decide = async (decision: "approved" | "rejected") => {
    if (!latest?.candidateVersion) return;
    const candidateSha = latest.candidateVersion.image_sha256;
    if (typeof candidateSha !== "string") return;
    const evidenceIds = latest.qa.map((row) => row.id).filter((id): id is string => typeof id === "string");
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await approveCandidate(supabase, {
        organizationId,
        candidateComponentVersionId: latest.job.candidateComponentVersionId!,
        expectedCandidateSha256: candidateSha,
        decision,
        approverDisplayName,
        evidenceIds,
      });
      setMessage(`${decision === "approved" ? "Approved child created" : "Rejection recorded"}. Active release unchanged.`);
      await queryClient.invalidateQueries({ queryKey: ["paper-doll-candidate-history", organizationId, familyKey] });
      await queryClient.invalidateQueries({ queryKey: ["paper-doll-shared-placement", organizationId, familyKey] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  /**
   * In-canvas background removal: take the SELECTED layer's current pixels,
   * flatten onto white (fal expects an opaque photo), strip via BiRefNet, and
   * queue the cutout as a normal manual candidate. The existing inspect →
   * approve → family-fit → lock chain stays untouched.
   */
  const stripSelectedLayerBackground = async () => {
    // Prefer the mounted candidate's pixels (post-import cleanup); fall back
    // to the layer's release source.
    const sourceUrl = latest?.job.status === "candidate_ready" && inspectionFrom(latest, candidateMaskBlocker)?.imageUrl
      ? inspectionFrom(latest, candidateMaskBlocker)!.imageUrl!
      : asset?.imageUrl;
    if (!sourceUrl) return;
    setBusy(true);
    setError(null);
    setMessage("Fetching selected layer…");
    try {
      const response = await fetch(sourceUrl);
      if (!response.ok) throw new Error(`Layer download failed (${response.status}).`);
      const bitmap = await createImageBitmap(await response.blob());
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 2D context unavailable.");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0);
      const flattened: Blob = await new Promise((resolve, reject) =>
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Canvas export failed."))), "image/png"));
      const file = new File([flattened], `${asset.variantKey.toLowerCase()}__layer-source.png`, { type: "image/png" });
      setBusy(false); // queue() manages its own busy state
      await queue(file, "manual", true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  };

  const queueImageLibraryAsset = async (selection: { url: string; name?: string }) => {
    setLibraryOpen(false);
    try {
      await queue(await downloadImageLibraryCandidate(selection));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const blockingQa = latest?.qa.filter((row) => row.blocking === true) ?? [];
  const approverDisplayName = typeof user?.user_metadata?.full_name === "string"
    ? user.user_metadata.full_name
    : typeof user?.user_metadata?.name === "string"
      ? user.user_metadata.name
      : user?.email ?? "";
  const canApprove = latest?.job.status === "candidate_ready"
    && !latest.approval
    && !candidateMaskBlocker
    && blockingQa.length > 0
    && blockingQa.every((row) => row.qa_status === "passed")
    && Boolean(approverDisplayName);

  return (
    <div className="space-y-3 rounded border p-3" style={{ borderColor: candidateEditingEnabled ? "rgba(97,214,200,0.36)" : "var(--darkroom-border-subtle)", background: "rgba(255,255,255,0.015)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.17em]" style={{ color: "#61d6c8" }}><Cpu className="h-3.5 w-3.5" />{reviewOnly ? "Candidate review" : "Candidate actions"}</div>
          {!reviewOnly && <div className="mt-1 text-[9px]" style={{ color: "var(--darkroom-text-dim)" }}>Worker: <span style={{ color: history.data?.worker.status === "ready" ? "#6ee7a8" : history.data?.worker.status === "error" ? "#ef8d7d" : "#f2c078" }}>{history.data?.worker.status ?? "checking"}</span></div>}
        </div>
        <button type="button" onClick={() => void history.refetch()} className="rounded p-1.5 hover:bg-white/5" aria-label="Refresh candidate history"><RefreshCw className={`h-3.5 w-3.5 ${history.isFetching ? "animate-spin" : ""}`} /></button>
      </div>

      {history.error != null && (
        <div className="flex items-start gap-2 rounded border px-3 py-2 text-[9px] leading-4" style={{ borderColor: "rgba(239,141,125,0.42)", color: "#ef8d7d", background: "rgba(239,141,125,0.05)" }}>
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Candidate history failed to load: {history.error instanceof Error ? history.error.message : String(history.error)}</span>
        </div>
      )}
      {ancestorNotice && (
        <div className="flex items-start gap-2 rounded border px-3 py-2 text-[9px] leading-4" style={{
          borderColor: ancestorNotice.tone === "warning" ? "rgba(242,192,120,0.32)" : "rgba(239,141,125,0.42)",
          color: ancestorNotice.tone === "warning" ? "#f2c078" : "#ef8d7d",
          background: ancestorNotice.tone === "warning" ? "rgba(242,192,120,0.035)" : "rgba(239,141,125,0.05)",
        }}>
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{ancestorNotice.message}{ancestorNotice.tone === "error" && !reviewOnly ? " A clean staged replacement can still be reviewed and approved below." : ""}</span>
        </div>
      )}

      {asset?.slot === "roller" && availableReviewVariants.length > 0 && (
        <div>
          <div className="mb-1 text-[8px] uppercase tracking-[0.15em]" style={{ color: "var(--darkroom-text-dim)" }}>Review roller variant</div>
          <div className="grid grid-cols-2 gap-1">
            {(["PLASTIC", "METAL"] as const).map((variant) => (
              <button
                key={variant}
                type="button"
                disabled={!availableReviewVariants.includes(variant)}
                onClick={() => setReviewVariant(variant)}
                className="rounded border px-2 py-2 text-[9px] uppercase tracking-[0.14em] disabled:opacity-30"
                style={{ borderColor: reviewVariant === variant ? "rgba(97,214,200,0.52)" : "var(--darkroom-border-subtle)", color: reviewVariant === variant ? "#61d6c8" : "var(--darkroom-text-dim)" }}
              >{variant === "PLASTIC" ? "Natural plastic" : "Metal ball"}</button>
            ))}
          </div>
        </div>
      )}

      {!reviewOnly && <>
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
        {PROVIDERS.map((item) => (
          <button key={item.id} type="button" onClick={() => chooseProvider(item.id)} className="rounded border px-2 py-2 text-left" style={{ borderColor: provider === item.id ? "rgba(97,214,200,0.52)" : "var(--darkroom-border-subtle)", background: provider === item.id ? "rgba(97,214,200,0.06)" : "transparent" }}>
            <div className="text-[9px]" style={{ color: provider === item.id ? "#61d6c8" : "var(--darkroom-text-muted)" }}>{item.label}</div>
            <div className="mt-0.5 text-[7px]" style={{ color: "var(--darkroom-text-dim)" }}>{item.detail}</div>
          </button>
        ))}
      </div>

      {provider === "google" && (
        <select value={model} onChange={(event) => setModel(event.target.value)} className="w-full rounded border bg-black/20 px-2 py-2 font-mono text-[9px]" style={{ borderColor: "var(--darkroom-border-subtle)", color: "var(--darkroom-text-muted)" }}>
          {CandidateProviderModels.google.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      )}

      {provider === "openai" && (
        <select value={model} onChange={(event) => setModel(event.target.value)} className="w-full rounded border bg-black/20 px-2 py-2 font-mono text-[9px]" style={{ borderColor: "var(--darkroom-border-subtle)", color: "var(--darkroom-text-muted)" }} aria-label="GPT Image model">
          {CandidateProviderModels.openai.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      )}
      <textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} disabled={provider === "blender"} rows={3} className="w-full resize-y rounded border bg-black/20 p-2 text-[9px] leading-4 disabled:opacity-45" style={{ borderColor: "var(--darkroom-border-subtle)", color: "var(--darkroom-text-muted)" }} aria-label="Candidate instruction" />

      <div className="flex flex-wrap gap-2">
        {provider === "manual" ? (
          <>
            <label className={`inline-flex cursor-pointer items-center gap-2 rounded border px-3 py-2 text-[9px] uppercase tracking-[0.14em] ${!candidateEditingEnabled || !selectionReady || busy ? "pointer-events-none opacity-35" : ""}`} style={{ borderColor: "rgba(97,214,200,0.48)", color: "#61d6c8" }}>
              <CloudUpload className="h-3.5 w-3.5" />Upload for {asset ? `${asset.variantKey}` : "selected layer"}
              <input type="file" accept="image/png" className="hidden" disabled={!candidateEditingEnabled || !selectionReady || busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void queue(file); event.target.value = ""; }} />
            </label>
            <button type="button" disabled={!candidateEditingEnabled || !selectionReady || busy} onClick={() => setLibraryOpen(true)} className="inline-flex items-center gap-2 rounded border px-3 py-2 text-[9px] uppercase tracking-[0.14em] disabled:opacity-35" style={{ borderColor: "rgba(97,214,200,0.48)", color: "#61d6c8" }}>
              <FolderOpen className="h-3.5 w-3.5" />Choose from Image Library
            </button>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded border px-3 py-2 text-[9px] uppercase tracking-[0.14em]" style={{ borderColor: stripBackground ? "rgba(97,214,200,0.48)" : "var(--darkroom-border-subtle)", color: stripBackground ? "#61d6c8" : "var(--darkroom-text-dim)" }}>
              <input type="checkbox" className="h-3 w-3 accent-[#61d6c8]" checked={stripBackground} onChange={(event) => setStripBackground(event.target.checked)} disabled={busy} />
              Remove background first · fal BiRefNet
            </label>
          </>
        ) : (
          <button type="button" disabled={!candidateEditingEnabled || !selectionReady || busy || !instruction.trim()} onClick={() => void queue()} className="inline-flex items-center gap-2 rounded border px-3 py-2 text-[9px] uppercase tracking-[0.14em] disabled:opacity-35" style={{ borderColor: "rgba(97,214,200,0.48)", color: "#61d6c8" }}><Play className="h-3.5 w-3.5" />{busy ? "Queuing…" : "Queue candidate"}</button>
        )}
        <button type="button" disabled={!candidateEditingEnabled || !selectionReady || busy || !asset?.imageUrl} onClick={() => void stripSelectedLayerBackground()} title="Remove the background from the selected layer's current pixels via fal BiRefNet and stage the cutout as a candidate" className="inline-flex items-center gap-2 rounded border px-3 py-2 text-[9px] uppercase tracking-[0.14em] disabled:opacity-35" style={{ borderColor: "rgba(97,214,200,0.48)", color: "#61d6c8" }}>
          <Eraser className="h-3.5 w-3.5" />{busy ? "Working…" : "Strip background · this layer"}
        </button>
        {approved ? (
          <button type="button" disabled={!onOpenFamilyFit} onClick={onOpenFamilyFit} className="inline-flex items-center gap-2 rounded border px-3 py-2 text-[9px] uppercase tracking-[0.14em] disabled:opacity-35" style={{ borderColor: "rgba(110,231,168,0.52)", color: "#6ee7a8", background: "rgba(110,231,168,0.05)" }}><ShieldCheck className="h-3.5 w-3.5" />Pixels Approved · Open Family Fit</button>
        ) : (
          <>
            <button type="button" disabled={!canApprove || busy} onClick={() => void decide("approved")} className="inline-flex items-center gap-2 rounded border px-3 py-2 text-[9px] uppercase tracking-[0.14em] disabled:opacity-35" style={{ borderColor: "rgba(110,231,168,0.42)", color: "#6ee7a8" }}><ShieldCheck className="h-3.5 w-3.5" />Approve Pixels</button>
            <button type="button" disabled={latest?.job.status !== "candidate_ready" || busy || Boolean(latest?.approval)} onClick={() => void decide("rejected")} className="rounded border px-3 py-2 text-[9px] uppercase tracking-[0.14em] disabled:opacity-35" style={{ borderColor: "var(--darkroom-border-subtle)", color: "var(--darkroom-text-dim)" }}>Reject</button>
            {latest?.approval && (
              <span className="self-center text-[8px] uppercase tracking-[0.13em]" style={{ color: latest.approval.decision === "rejected" ? "#ef8d7d" : "#6ee7a8" }}>
                Decision recorded · {String(latest.approval.decision)} · immutable
              </span>
            )}
          </>
        )}
      </div>

      {!candidateEditingEnabled && <div className="flex items-start gap-2 text-[9px] leading-4" style={{ color: "#f2c078" }}><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />Select a non-body component with a registered authority mask. Locked plates cannot become generation sources.</div>}
      {candidateEditingEnabled && !selectionReady && <div className="flex items-start gap-2 text-[9px] leading-4" style={{ color: "#f2c078" }}><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />Draw the selected rectangle or brush mask before queuing.</div>}
      </>}
      {reviewOnly && (
        <div className="rounded border px-3 py-2 text-[8px] uppercase tracking-[0.13em]" style={{ borderColor: "rgba(97,214,200,0.34)", color: "#61d6c8", background: "rgba(97,214,200,0.035)" }}>
          Review candidate mounted for family placement · generation and approval remain in Edit Lab
        </div>
      )}
      {message && <div className="flex items-start gap-2 text-[9px] leading-4" style={{ color: "#6ee7a8" }}><CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" />{message}</div>}
      {approved && <div className="flex items-start gap-2 text-[9px] leading-4" style={{ color: "#6ee7a8" }}><ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" />Pixels approved · {approved.componentVersionId.slice(0, 8)} · {approved.imageSha256.slice(0, 12)}…</div>}
      {error && <div className="flex items-start gap-2 text-[9px] leading-4" style={{ color: "#ef8d7d" }}><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{error}</div>}

      <div className="border-t pt-2" style={{ borderColor: "var(--darkroom-border-subtle)" }}>
        <div className="mb-1 text-[8px] uppercase tracking-[0.15em]" style={{ color: "var(--darkroom-text-dim)" }}>Immutable {reviewVariant.toLowerCase()} history · {selectedHistory.length}</div>
        {selectedHistory.length === 0 ? <div className="text-[9px]" style={{ color: "var(--darkroom-text-dim)" }}>No attempts for this component.</div> : selectedHistory.slice(0, 6).map((entry) => {
          const selectable = candidateAuditReason(entry) === null;
          const mounted = latest?.job.id === entry.job.id;
          return (
            <button
              key={entry.job.id}
              type="button"
              disabled={!selectable}
              onClick={() => setPinnedJobId(entry.job.id)}
              title={selectable ? "Mount this candidate for review" : undefined}
              className="flex w-full items-center justify-between gap-2 border-t py-1.5 text-left text-[8px] disabled:cursor-default"
              style={{ borderColor: "var(--darkroom-border-subtle)", background: mounted ? "rgba(97,214,200,0.06)" : "transparent" }}
            >
              <span className="min-w-0 font-mono" style={{ color: mounted ? "#61d6c8" : "var(--darkroom-text-muted)" }}>
                <span className="block truncate">{entry.job.provider} · {entry.job.model}{mounted ? " · MOUNTED" : ""}</span>
                {entry.job.manualOutput?.originalFilename && <span className="mt-0.5 block truncate" title={entry.job.manualOutput.originalFilename} style={{ color: "var(--darkroom-text-dim)" }}>{entry.job.manualOutput.originalFilename}</span>}
              </span>
              <span className="text-right uppercase tracking-wider" style={{ color: candidateAuditReason(entry) ? "#ef8d7d" : entry.job.status === "candidate_ready" ? "#6ee7a8" : entry.job.status === "failed" ? "#ef8d7d" : "#f2c078" }}>{candidateAuditReason(entry) ?? entry.job.status.replace("_", " ")}</span>
            </button>
          );
        })}
      </div>
      <ImageLibraryModal
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        onSelectImage={(selection) => void queueImageLibraryAsset(selection)}
        title={`Choose a candidate for ${asset?.displayName ?? "the selected component"}`}
        allowDesktopUpload={false}
      />
    </div>
  );
}
