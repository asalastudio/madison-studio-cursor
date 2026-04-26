/**
 * Masters tab content for the Best Bottles Studio. Takes the selected
 * Convex product (from the Studio's left rail) plus a user-chosen preset
 * and generates the canonical master image via `generate-madison-image`.
 *
 * The full 4-layer prompt is assembled client-side (see promptAssembler).
 * Generation goes through the same edge function as Dark Room's chip mode
 * so we inherit its proven auth + storage + library-tag path.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Sparkles, Check, AlertCircle, Download, RotateCcw, ImageIcon, Wand2, FolderUp, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOnboarding } from "@/hooks/useOnboarding";
import { toast } from "@/hooks/use-toast";
import { UploadZone } from "@/components/darkroom/UploadZone";
import { ImageLibraryModal } from "@/components/image-editor/ImageLibraryModal";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LEDIndicator } from "@/components/darkroom/LEDIndicator";
import {
  DEFAULT_IMAGE_PRESET_ID,
  IMAGE_PRESET_LIST,
} from "@/config/imagePresets";

// Masters tab generates full catalog scenes (bottle + fitment + cap), so the
// paper-doll transparent-layer preset doesn't belong here — pairing it with a
// full SKU would produce a transparent image that still has a fitment baked in,
// which defeats paper-doll's purpose. Components tab is the correct home for
// that preset.
const MASTERS_PRESETS = IMAGE_PRESET_LIST.filter((p) => p.kind === "final_render");
import {
  assemblePrompt,
  type AssembledPrompt,
  type LiquidSpec,
} from "@/lib/product-image/promptAssembler";
import type { Product } from "@/integrations/convex/bestBottles";
import {
  useAssembledPromptGeneration,
  type AssembledGenerationResult,
} from "@/hooks/useAssembledPromptGeneration";

interface FolderReferenceEntry {
  url: string;
  name: string;
  /** Map key = Grace SKU (uppercase), or `${graceSku}--${modifier}` for variants. */
  matchKey: string;
}

/**
 * Presets that swap the canonical bottle composition (e.g. exploded cap-beside
 * layout) need a separate reference PNG. A file named
 * `GB-EMP-CLR-100ML-BST-BLK--exploded.png` is the exploded variant of the
 * standard `GB-EMP-CLR-100ML-BST-BLK.png`. The map below tells the lookup
 * which suffix to prefer for a given preset id.
 */
const PRESET_MODIFIER: Record<string, string> = {
  "grid-card-exploded-2000x2200": "exploded",
};

/**
 * Parse a reference filename into its Grace SKU + optional modifier suffix.
 *
 *   `48. GB-EMP-CLR-100ML-BST-BLK.png`           → ["GB-EMP-CLR-100ML-BST-BLK", undefined]
 *   `GB-EMP-CLR-100ML-BST-BLK--exploded.png`     → ["GB-EMP-CLR-100ML-BST-BLK", "exploded"]
 *
 * The leading "48. " ordering prefix that ships with PSD exports is stripped
 * defensively. Modifier separator is `--` (double dash) so it never collides
 * with the single dashes inside the Grace SKU itself.
 */
function parseGraceSkuFilename(
  filename: string,
): { graceSku: string; modifier?: string } | null {
  const stem = filename
    .replace(/\.[a-z0-9]+$/i, "")   // drop extension
    .replace(/^\d+\.\s*/, "")        // drop "48. " ordering prefix from PSD exports
    .trim();
  if (!stem) return null;
  const [skuPart, ...rest] = stem.split("--");
  const graceSku = skuPart.trim().toUpperCase();
  if (!graceSku) return null;
  const modifier = rest.length > 0 ? rest.join("--").trim().toLowerCase() : undefined;
  return { graceSku, modifier };
}

/** Build the Map key from a Grace SKU + optional modifier. */
function folderKey(graceSku: string, modifier?: string): string {
  const base = graceSku.toUpperCase();
  return modifier ? `${base}--${modifier.toLowerCase()}` : base;
}

interface MastersTabPanelProps {
  /** Selected variant from the Studio's left rail. */
  selectedProduct: Product | null;
  /**
   * Every SKU in the current family + capacity + color cohort, used by the
   * "Generate all matched" button to iterate without forcing the operator
   * to click each SKU one at a time. Optional — falls back to single-SKU
   * generation if the parent doesn't pass it.
   */
  familyVariants?: Product[];
  /** Family name for Library tagging. */
  familyName?: string | null;
  /** Optional callback when a master is approved. Parent can persist. */
  onApproveMaster?: (result: AssembledGenerationResult, product: Product) => void;
}

export function MastersTabPanel({
  selectedProduct,
  familyVariants,
  familyName,
  onApproveMaster,
}: MastersTabPanelProps) {
  const [presetId, setPresetId] = useState<string>(DEFAULT_IMAGE_PRESET_ID);
  const [liquidEnabled, setLiquidEnabled] = useState(false);
  const [liquidColor, setLiquidColor] = useState("warm amber perfume");
  const [liquidFill, setLiquidFill] = useState(75);
  const [showAssembledPrompt, setShowAssembledPrompt] = useState(false);
  const [assembledCache, setAssembledCache] = useState<AssembledPrompt | null>(null);

  // Manual reference image override — bypasses Convex's legacy .gif imageUrl
  // (which OpenAI /edits rejects). Drop a PSD-rendered PNG here to anchor
  // the gpt-image-2 generation to the actual studio photography.
  // Format: { url: <usable URL>, file?: File (only when freshly uploaded), name }
  const [customReference, setCustomReference] = useState<
    { url: string; file?: File; name?: string } | null
  >(null);
  const [isUploadingRef, setIsUploadingRef] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);

  // Reference folder — operator drops a folder of PSD-rendered PNGs whose
  // filenames match the Convex Grace SKU exactly (e.g.
  // `GB-EMP-CLR-100ML-BST-BLK.png`). Each file is uploaded to Supabase Storage
  // and stored in this map keyed by Grace SKU. When the operator selects a SKU
  // in the left rail, the matching reference auto-loads as customReference.
  // Single-image upload (below) still wins as a one-off override.
  const [referenceFolder, setReferenceFolder] = useState<
    Map<string, FolderReferenceEntry>
  >(new Map());
  const [uploadFailures, setUploadFailures] = useState<
    Array<{ name: string; error: string }>
  >([]);
  const [isFolderUploading, setIsFolderUploading] = useState(false);
  const [folderUserOverride, setFolderUserOverride] = useState<boolean>(false);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const { user } = useAuth();
  const { currentOrganizationId } = useOnboarding();
  const { generate, isGenerating, error, result, reset } = useAssembledPromptGeneration();

  /**
   * Look up a folder entry for the given SKU + preset. If the preset has a
   * registered modifier (e.g. "exploded"), prefer the variant key first and
   * fall back to the plain Grace SKU. Centralized so the effect, the memo,
   * and clearCustomReference all agree on the lookup rule.
   */
  const lookupFolderReference = (
    sku: Product,
    preset: string,
  ): FolderReferenceEntry | null => {
    const baseKey = folderKey(sku.graceSku);
    const modifier = PRESET_MODIFIER[preset];
    if (modifier) {
      const variant = referenceFolder.get(folderKey(sku.graceSku, modifier));
      if (variant) return variant;
    }
    return referenceFolder.get(baseKey) ?? null;
  };

  /**
   * Auto-load the matching folder reference when the operator changes the
   * selected SKU or preset. Skipped when the operator has manually dropped a
   * single-image reference (folderUserOverride=true) so that one-off upload
   * isn't silently overwritten by SKU navigation.
   */
  useEffect(() => {
    if (folderUserOverride) return;
    if (!selectedProduct || referenceFolder.size === 0) return;
    const matched = lookupFolderReference(selectedProduct, presetId);
    if (matched) {
      setCustomReference({ url: matched.url, name: matched.name });
    } else {
      setCustomReference(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProduct, presetId, referenceFolder, folderUserOverride]);

  /**
   * Upload a folder of PSD-rendered PNGs. Each filename is treated as the
   * Grace SKU of the bottle it depicts (`GB-EMP-CLR-100ML-BST-BLK.png`),
   * with an optional `--<modifier>` suffix for preset variants like
   * `--exploded`. Files are uploaded to Supabase Storage in parallel; per-file
   * failures are collected and surfaced loudly in the UI so we don't silently
   * lose 15 of 16 uploads to an RLS policy or upstream race.
   */
  const handleFolderUpload = async (files: FileList | File[]) => {
    if (!user || !currentOrganizationId) {
      toast({
        title: "Sign-in required",
        description: "Must be signed in to upload references.",
        variant: "destructive",
      });
      return;
    }
    const arr = Array.from(files);
    if (arr.length === 0) return;
    setIsFolderUploading(true);

    const newMap = new Map(referenceFolder);
    const failures: Array<{ name: string; error: string }> = [];
    let stored = 0;

    await Promise.all(
      arr.map(async (file) => {
        try {
          const parsed = parseGraceSkuFilename(file.name);
          if (!parsed) {
            throw new Error("Filename did not yield a Grace SKU");
          }

          const ts = Date.now();
          const rand = Math.random().toString(36).slice(2, 8);
          const ext = (file.name.split(".").pop() || "png").toLowerCase();
          const path = `${currentOrganizationId}/${user.id}/studio-references-folder/${ts}_${rand}.${ext}`;
          const { error: uploadError } = await supabase.storage
            .from("generated-images")
            .upload(path, file, {
              cacheControl: "3600",
              upsert: false,
              contentType: file.type || "image/png",
            });
          if (uploadError) {
            console.error(
              "[MastersTabPanel] supabase upload error",
              file.name,
              uploadError,
            );
            throw new Error(uploadError.message || "Supabase upload failed");
          }
          const { data: urlData } = supabase.storage
            .from("generated-images")
            .getPublicUrl(path);
          if (!urlData?.publicUrl) throw new Error("No public URL returned");

          const key = folderKey(parsed.graceSku, parsed.modifier);
          newMap.set(key, {
            url: urlData.publicUrl,
            name: file.name,
            matchKey: key,
          });
          stored++;
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          console.warn("[MastersTabPanel] folder file upload failed", file.name, msg);
          failures.push({ name: file.name, error: msg });
        }
      }),
    );

    setReferenceFolder(newMap);
    setUploadFailures((prev) => [...prev, ...failures]);
    setFolderUserOverride(false); // fresh folder upload — re-enable auto-match
    setIsFolderUploading(false);

    const failedCount = failures.length;
    toast({
      title: failedCount > 0 ? "Folder uploaded with errors" : "Reference folder uploaded",
      description:
        failedCount > 0
          ? `${stored} stored · ${failedCount} failed · ${arr.length} total — check the failed list below for details.`
          : `${stored} stored · ${arr.length} total`,
      variant: failedCount > 0 ? "destructive" : "default",
    });
  };

  const clearReferenceFolder = () => {
    setReferenceFolder(new Map());
    setUploadFailures([]);
    setCustomReference(null);
    setFolderUserOverride(false);
  };

  /** Compute whether the currently-selected SKU has a matched folder entry. */
  const folderMatchForCurrentSku = useMemo(() => {
    if (!selectedProduct || referenceFolder.size === 0) return null;
    return lookupFolderReference(selectedProduct, presetId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProduct, presetId, referenceFolder]);

  /**
   * Coverage diagnostics — most "why isn't this matching" questions trace to
   * filenames that aren't actually equal to a Convex graceSku. These memos
   * surface both sides of the mismatch:
   *   - orphanReferences: files dropped into the folder whose stem doesn't
   *     correspond to any graceSku in the current family. Usually means the
   *     rename pass didn't catch them (still websiteSku-style) or they're
   *     for a different family.
   *   - uncoveredSkus: SKUs in the current family that have no folder
   *     reference (in any modifier variant). Generation for these will
   *     fall back to no-reference output unless the operator drops a
   *     single-image override.
   */
  const familyGraceSet = useMemo(() => {
    const set = new Set<string>();
    for (const v of familyVariants ?? []) set.add(v.graceSku.toUpperCase());
    return set;
  }, [familyVariants]);

  const orphanReferences = useMemo(() => {
    if (referenceFolder.size === 0 || familyGraceSet.size === 0) return [];
    const orphans: Array<{ key: string; name: string }> = [];
    for (const [key, entry] of referenceFolder.entries()) {
      // Strip "--modifier" suffix to compare against the bare graceSku.
      const base = key.split("--")[0];
      if (!familyGraceSet.has(base)) {
        orphans.push({ key, name: entry.name });
      }
    }
    return orphans;
  }, [referenceFolder, familyGraceSet]);

  const uncoveredSkus = useMemo(() => {
    if (!familyVariants || familyVariants.length === 0) return [];
    if (referenceFolder.size === 0) return [];
    // A SKU is "covered" if ANY modifier variant of its graceSku exists.
    const covered = new Set<string>();
    for (const key of referenceFolder.keys()) {
      covered.add(key.split("--")[0]);
    }
    return familyVariants.filter((v) => !covered.has(v.graceSku.toUpperCase()));
  }, [familyVariants, referenceFolder]);

  /**
   * UploadZone returns either a freshly-picked File (drag-drop or browse) or
   * a ready URL (library pick). For files, we upload to Supabase Storage so
   * OpenAI /edits can fetch the reference. For library URLs, we use as-is
   * since they're already in our generated-images bucket.
   */
  const handleReferencePicked = async (img: { url: string; file?: File; name?: string }) => {
    // Manual single-image upload takes precedence over folder auto-match.
    // Mark the override so SKU navigation doesn't silently overwrite this
    // user-chosen reference.
    setFolderUserOverride(true);
    // Library pick — already a fetchable URL
    if (!img.file) {
      setCustomReference(img);
      return;
    }
    // Fresh upload — push to Supabase Storage to get a public URL
    if (!user || !currentOrganizationId) {
      toast({
        title: "Sign-in required",
        description: "You must be signed in with an organization to upload a reference.",
        variant: "destructive",
      });
      return;
    }
    setIsUploadingRef(true);
    try {
      const ts = Date.now();
      const rand = Math.random().toString(36).slice(2, 8);
      const ext = (img.file.name.split(".").pop() || "png").toLowerCase();
      const path = `${currentOrganizationId}/${user.id}/studio-references/${ts}_${rand}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("generated-images")
        .upload(path, img.file, {
          cacheControl: "3600",
          upsert: false,
          contentType: img.file.type || "image/png",
        });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage
        .from("generated-images")
        .getPublicUrl(path);
      if (!urlData?.publicUrl) throw new Error("No public URL returned");
      setCustomReference({ url: urlData.publicUrl, name: img.file.name });
      toast({
        title: "Reference uploaded",
        description: "Will anchor gpt-image-2 generation for this SKU.",
      });
    } catch (e: any) {
      console.error("[MastersTabPanel] reference upload failed", e);
      toast({
        title: "Upload failed",
        description: String(e?.message || e),
        variant: "destructive",
      });
    } finally {
      setIsUploadingRef(false);
    }
  };

  const clearCustomReference = () => {
    setCustomReference(null);
    // Clearing the manual override re-enables folder auto-match on the
    // next SKU change. If a folder is loaded and the current SKU matches,
    // re-apply the match immediately.
    setFolderUserOverride(false);
    if (selectedProduct && referenceFolder.size > 0) {
      const matched = lookupFolderReference(selectedProduct, presetId);
      if (matched) setCustomReference({ url: matched.url, name: matched.name });
    }
  };

  const selectedPreset = useMemo(
    () => MASTERS_PRESETS.find((p) => p.id === presetId) ?? MASTERS_PRESETS[0],
    [presetId],
  );

  const handleAssemble = (): AssembledPrompt | null => {
    if (!selectedProduct) return null;
    const liquid: LiquidSpec | null = liquidEnabled
      ? { present: true, color: liquidColor, fillPercent: liquidFill }
      : null;
    const assembled = assemblePrompt({
      presetId,
      sku: selectedProduct,
      liquid,
    });
    setAssembledCache(assembled);
    return assembled;
  };

  /**
   * Single-SKU prompt + reference + tags assembly. Factored out so the
   * batch-generate loop can fire the same payload shape per variant
   * without duplicating logic.
   */
  const generateOne = async (sku: Product, referenceUrl: string | null) => {
    const liquid: LiquidSpec | null = liquidEnabled
      ? { present: true, color: liquidColor, fillPercent: liquidFill }
      : null;
    const assembled = assemblePrompt({ presetId, sku, liquid });
    return generate(assembled, {
      // Custom upload (PSD-rendered PNG) takes priority over Convex's
      // legacy .gif imageUrl — the latter is silently dropped by the
      // unsupported-format filter in useAssembledPromptGeneration.
      referenceImageUrl: referenceUrl ?? sku.imageUrl,
      productContext: {
        name: sku.itemName,
        collection: sku.bottleCollection ?? undefined,
        category: sku.category,
      },
      // Human-readable identifiers live on library tags. sessionId is a uuid
      // column in Postgres — don't pass a string here.
      extraLibraryTags: [
        "brand:best-bottles",
        "studio-master",
        familyName ? `family:${familyName.toLowerCase().replace(/\s+/g, "-")}` : null,
        `sku:${sku.graceSku}`,
      ].filter((t): t is string => Boolean(t)),
    });
  };

  const handleGenerate = async () => {
    if (!selectedProduct) return;
    handleAssemble(); // populate assembledCache for the prompt-preview button
    await generateOne(selectedProduct, customReference?.url ?? null);
  };

  /**
   * Batch progress state — null when idle, otherwise tracks the loop's
   * current iteration so the UI can show "Generating X of Y · <SKU>".
   * Failures per-SKU don't abort the loop; they're collected and surfaced
   * in the toast at the end.
   */
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
    currentSku: string;
    failures: Array<{ graceSku: string; error: string }>;
  } | null>(null);

  /** Every variant in the family that has a folder reference for the current preset. */
  const matchedFamilyVariants = useMemo(() => {
    if (!familyVariants || referenceFolder.size === 0) return [];
    return familyVariants.filter((v) => lookupFolderReference(v, presetId) !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyVariants, referenceFolder, presetId]);

  /**
   * Batch-generate masters for every SKU in the family that has a folder
   * reference. Sequential rather than parallel so we don't hammer the
   * generate-madison-image edge function or OpenAI rate limits, and so
   * the operator can watch each output land in the result panel.
   */
  const handleGenerateAll = async () => {
    if (matchedFamilyVariants.length === 0) return;
    const failures: Array<{ graceSku: string; error: string }> = [];
    for (let i = 0; i < matchedFamilyVariants.length; i++) {
      const sku = matchedFamilyVariants[i];
      const ref = lookupFolderReference(sku, presetId);
      setBatchProgress({
        current: i + 1,
        total: matchedFamilyVariants.length,
        currentSku: sku.graceSku,
        failures,
      });
      try {
        const result = await generateOne(sku, ref?.url ?? null);
        if (!result) {
          failures.push({ graceSku: sku.graceSku, error: "Generation returned no result" });
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        failures.push({ graceSku: sku.graceSku, error: msg });
      }
    }
    setBatchProgress(null);
    const okCount = matchedFamilyVariants.length - failures.length;
    toast({
      title: failures.length > 0 ? "Batch finished with errors" : "Batch complete",
      description:
        failures.length > 0
          ? `${okCount} succeeded · ${failures.length} failed (${failures.map((f) => f.graceSku).join(", ")})`
          : `Generated ${okCount} masters. Review and approve in the Library.`,
      variant: failures.length > 0 ? "destructive" : "default",
    });
  };

  const handleApprove = () => {
    if (!result || !selectedProduct || !onApproveMaster) return;
    onApproveMaster(result, selectedProduct);
  };

  if (!selectedProduct) {
    return (
      <div
        className="text-sm space-y-3 p-6"
        style={{ color: "var(--darkroom-text-muted)" }}
      >
        <div className="flex items-center gap-2">
          <LEDIndicator state="off" />
          <span className="uppercase tracking-wider text-xs">No variant selected</span>
        </div>
        <p>Click any SKU in the left rail to load it here. The preset picker and generation controls will unlock as soon as a variant is selected.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-1">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <LEDIndicator state={isGenerating ? "processing" : error ? "error" : result ? "ready" : "off"} />
          <span className="text-xs uppercase tracking-wider" style={{ color: "var(--darkroom-text-dim)" }}>
            Selected variant
          </span>
        </div>
        <div className="font-mono text-xs" style={{ color: "var(--darkroom-accent)" }}>
          {selectedProduct.graceSku}
        </div>
        <div className="text-xs" style={{ color: "var(--darkroom-text-muted)" }}>
          {selectedProduct.itemName}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wider" style={{ color: "var(--darkroom-text-dim)" }}>
          Preset
        </Label>
        <Select value={presetId} onValueChange={setPresetId}>
          <SelectTrigger className="bg-white/[0.03] border-white/10 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MASTERS_PRESETS.map((preset) => (
              <SelectItem key={preset.id} value={preset.id}>
                {preset.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs" style={{ color: "var(--darkroom-text-dim)" }}>
          {selectedPreset.purpose}
        </p>
        <p className="text-[11px]" style={{ color: "var(--darkroom-text-dim)" }}>
          Canvas: <span className="font-mono">{selectedPreset.canvas.widthPx} × {selectedPreset.canvas.heightPx}</span>
          {" · "}{selectedPreset.aspectRatio} {selectedPreset.orientation}
          {" · "}Background: <span className="font-mono">{selectedPreset.backgroundHex}</span>
        </p>
      </div>

      <div className="space-y-2 pt-1 border-t" style={{ borderColor: "var(--darkroom-border-subtle)" }}>
        <div className="flex items-center justify-between pt-2">
          <Label htmlFor="liquid-toggle" className="text-xs uppercase tracking-wider cursor-pointer" style={{ color: "var(--darkroom-text-dim)" }}>
            Liquid
          </Label>
          <Switch id="liquid-toggle" checked={liquidEnabled} onCheckedChange={setLiquidEnabled} />
        </div>
        {liquidEnabled && (
          <div className="space-y-2">
            <Textarea
              value={liquidColor}
              onChange={(e) => setLiquidColor(e.target.value)}
              className="min-h-[40px] text-xs bg-white/[0.03] border-white/10 text-white"
              placeholder="warm amber perfume"
            />
            <div className="space-y-1">
              <div className="text-[11px]" style={{ color: "var(--darkroom-text-dim)" }}>
                Fill: {liquidFill}%
              </div>
              <Slider value={[liquidFill]} onValueChange={(v) => setLiquidFill(v[0])} min={0} max={100} step={5} />
            </div>
          </div>
        )}
      </div>

      {/* REFERENCE FOLDER — drop a folder of assembled-bottle PNGs once per
          family. Each PNG is uploaded to Supabase Storage and classified by
          filename (e.g. empire-50ml-bulb-tassel-black.png → matched to the
          Bulb-Tassel/Black SKU). When the operator selects any matched SKU
          in the left rail, the corresponding reference auto-loads. The
          single-image upload below remains for one-off overrides and SKUs
          the folder doesn't cover. */}
      <div className="space-y-2 pt-1 border-t" style={{ borderColor: "var(--darkroom-border-subtle)" }}>
        <div className="flex items-center justify-between pt-2">
          <Label className="text-xs uppercase tracking-wider" style={{ color: "var(--darkroom-text-dim)" }}>
            Reference folder (auto-match by SKU)
          </Label>
          {referenceFolder.size > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearReferenceFolder}
              className="h-6 px-2 text-[10px]"
              style={{ color: "var(--darkroom-text-dim)" }}
            >
              <X className="w-3 h-3 mr-1" /> Clear folder
            </Button>
          )}
        </div>

        <input
          ref={folderInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          // @ts-expect-error — webkitdirectory is a non-standard attribute
          webkitdirectory=""
          directory=""
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleFolderUpload(e.target.files);
              e.target.value = "";
            }
          }}
        />
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          id="masters-folder-files-fallback"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleFolderUpload(e.target.files);
              e.target.value = "";
            }
          }}
        />

        <div
          className="rounded border-2 border-dashed p-3 text-center space-y-2 transition-colors"
          style={{
            borderColor: isFolderUploading
              ? "var(--darkroom-accent)"
              : "var(--darkroom-border-subtle)",
            background: isFolderUploading
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
              handleFolderUpload(e.dataTransfer.files);
            }
          }}
        >
          <div className="flex items-center justify-center gap-2">
            {isFolderUploading ? (
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--darkroom-accent)" }} />
            ) : (
              <FolderUp className="w-4 h-4" style={{ color: "var(--darkroom-accent)" }} />
            )}
            <span className="text-xs font-medium" style={{ color: "var(--darkroom-text)" }}>
              {isFolderUploading
                ? "Uploading folder…"
                : referenceFolder.size > 0
                  ? `${referenceFolder.size} reference${referenceFolder.size === 1 ? "" : "s"} loaded`
                  : "Drop a folder of PSD-rendered PNGs"}
            </span>
          </div>
          <p className="text-[10px]" style={{ color: "var(--darkroom-text-dim)" }}>
            Filenames must equal the Convex Grace SKU exactly — e.g.{" "}
            <code>GB-EMP-CLR-100ML-BST-BLK.png</code>. Preset variants use a{" "}
            <code>--modifier</code> suffix:{" "}
            <code>GB-EMP-CLR-100ML-BST-BLK--exploded.png</code>.
            Leading <code>"48. "</code> ordering prefixes from PSD exports are stripped automatically.
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => folderInputRef.current?.click()}
              disabled={isFolderUploading}
              className="h-7 text-[11px] border-white/15 bg-white/[0.02] text-white hover:bg-white/[0.06] hover:text-white"
            >
              Browse folder
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => document.getElementById("masters-folder-files-fallback")?.click()}
              disabled={isFolderUploading}
              className="h-7 text-[11px]"
              style={{ color: "var(--darkroom-text-dim)" }}
            >
              Or pick files
            </Button>
          </div>
        </div>

        {uploadFailures.length > 0 && (
          <div
            className="rounded border p-2 space-y-1"
            style={{
              borderColor: "rgba(239, 68, 68, 0.4)",
              background: "rgba(239, 68, 68, 0.05)",
            }}
          >
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider" style={{ color: "#F87171" }}>
              <AlertCircle className="w-3 h-3" />
              {uploadFailures.length} failed upload{uploadFailures.length === 1 ? "" : "s"} — see error messages below
            </div>
            <div className="space-y-0.5 max-h-32 overflow-auto">
              {uploadFailures.map((f, i) => (
                <div key={`${f.name}-${i}`} className="text-[10px] font-mono" style={{ color: "#F87171" }}>
                  <span className="opacity-90">{f.name}</span>
                  <span className="opacity-60"> — {f.error}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {orphanReferences.length > 0 && (
          <div
            className="rounded border p-2 space-y-1"
            style={{
              borderColor: "rgba(245, 158, 11, 0.4)",
              background: "rgba(245, 158, 11, 0.05)",
            }}
          >
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider" style={{ color: "#FBBF24" }}>
              <AlertCircle className="w-3 h-3" />
              {orphanReferences.length} file{orphanReferences.length === 1 ? "" : "s"} don't match any Grace SKU in this family
            </div>
            <div className="text-[10px] opacity-75" style={{ color: "#FBBF24" }}>
              These filenames don't equal any <span className="font-mono">graceSku</span> for {familyName ?? "this family"}.
              Likely cause: still in websiteSku style (e.g. <span className="font-mono">GBEmp50DrpSl</span> instead of{" "}
              <span className="font-mono">GB-EMP-CLR-50ML-DRP-SL</span>) or the rename pass missed them.
            </div>
            <div className="space-y-0.5 max-h-40 overflow-auto pt-1">
              {orphanReferences.map((o) => (
                <div key={o.key} className="text-[10px] font-mono" style={{ color: "#FBBF24" }}>
                  <span className="opacity-90">{o.name}</span>
                  <span className="opacity-50"> → parsed as </span>
                  <span className="opacity-70">{o.key}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {uncoveredSkus.length > 0 && referenceFolder.size > 0 && (
          <div
            className="rounded border p-2 space-y-1"
            style={{
              borderColor: "rgba(148, 163, 184, 0.3)",
              background: "rgba(148, 163, 184, 0.05)",
            }}
          >
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider" style={{ color: "var(--darkroom-text-dim)" }}>
              <AlertCircle className="w-3 h-3" />
              {uncoveredSkus.length} SKU{uncoveredSkus.length === 1 ? "" : "s"} in this family have no folder reference
            </div>
            <div className="text-[10px] opacity-75" style={{ color: "var(--darkroom-text-dim)" }}>
              Generation for these will run prompt-only unless you drop a single-image override.
            </div>
            <div className="space-y-0.5 max-h-32 overflow-auto pt-1">
              {uncoveredSkus.map((s) => (
                <div key={s.graceSku} className="text-[10px] font-mono" style={{ color: "var(--darkroom-text-dim)" }}>
                  {s.graceSku}
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedProduct && referenceFolder.size > 0 && (
          <div
            className="text-[10px] flex items-center gap-1"
            style={{ color: folderMatchForCurrentSku ? "var(--darkroom-success, #4ADE80)" : "var(--darkroom-text-dim)" }}
          >
            {folderMatchForCurrentSku ? (
              <>
                <Check className="w-3 h-3" />
                Folder match for this SKU: <span className="font-mono">{folderMatchForCurrentSku.name}</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-3 h-3" />
                No folder reference matches this SKU — drop a single-image override below if needed
              </>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2 pt-1 border-t" style={{ borderColor: "var(--darkroom-border-subtle)" }}>
        <div className="flex items-center justify-between pt-2">
          <Label className="text-xs uppercase tracking-wider" style={{ color: "var(--darkroom-text-dim)" }}>
            Reference image (single override)
          </Label>
        </div>

        <UploadZone
          type="product"
          label="Drop reference PNG here"
          description="Drag-drop, browse, or pick from Image Library — overrides folder auto-match for one-off testing."
          image={customReference}
          onUpload={handleReferencePicked}
          onRemove={clearCustomReference}
          onLibraryOpen={() => setIsLibraryOpen(true)}
          disabled={isUploadingRef}
        />

        {isUploadingRef && (
          <div className="flex items-center gap-2 text-[11px]" style={{ color: "var(--darkroom-text-muted)" }}>
            <Loader2 className="w-3 h-3 animate-spin" />
            Uploading reference to Supabase…
          </div>
        )}

        <ImageLibraryModal
          open={isLibraryOpen}
          onOpenChange={setIsLibraryOpen}
          onSelectImage={(img) => {
            handleReferencePicked(img);
            setIsLibraryOpen(false);
          }}
          title="Select reference image"
          libraryTagContainsAny={["brand:best-bottles", "studio-master", "paper-doll-component"]}
        />
      </div>

      {!customReference && (
        <div
          className="rounded border p-2 flex items-start gap-2"
          style={{
            borderColor: "rgba(245, 158, 11, 0.4)",
            background: "rgba(245, 158, 11, 0.05)",
            color: "#FBBF24",
          }}
        >
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <div className="text-[11px] leading-snug">
            <div className="font-medium">No reference image attached</div>
            <div className="opacity-90">
              The model will run prompt-only and output is likely to be off-brand. Drop a folder
              named after Grace SKUs above, or a single PNG below, before generating.
            </div>
          </div>
        </div>
      )}

      {batchProgress && (
        <div
          className="rounded border p-2 flex items-start gap-2"
          style={{
            borderColor: "var(--darkroom-accent)",
            background: "rgba(184, 149, 106, 0.08)",
            color: "var(--darkroom-text)",
          }}
        >
          <Loader2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 animate-spin" style={{ color: "var(--darkroom-accent)" }} />
          <div className="text-[11px] leading-snug flex-1">
            <div className="font-medium">
              Batch generating {batchProgress.current} of {batchProgress.total}
            </div>
            <div className="opacity-80 font-mono">{batchProgress.currentSku}</div>
            {batchProgress.failures.length > 0 && (
              <div className="opacity-80 mt-1" style={{ color: "#F87171" }}>
                {batchProgress.failures.length} failed so far
              </div>
            )}
          </div>
        </div>
      )}

      {familyVariants && referenceFolder.size > 0 && matchedFamilyVariants.length > 1 && (
        <Button
          onClick={handleGenerateAll}
          disabled={isGenerating || batchProgress !== null}
          variant="outline"
          className="w-full border-white/15 bg-white/[0.02] text-white hover:bg-white/[0.06] hover:text-white"
          title={`Generate masters for every SKU in this family that has a matched reference (${matchedFamilyVariants.length} variants).`}
        >
          {batchProgress ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Generating batch…
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              Generate all matched ({matchedFamilyVariants.length})
            </>
          )}
        </Button>
      )}

      <div className="flex gap-2">
        <Button
          onClick={handleGenerate}
          disabled={isGenerating || batchProgress !== null}
          className="flex-1 bg-[var(--darkroom-accent,#B8956A)] text-black hover:bg-[var(--darkroom-accent,#B8956A)]/90"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              {customReference ? "Generate master" : "Generate without reference"}
            </>
          )}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            const a = handleAssemble();
            setShowAssembledPrompt(Boolean(a));
          }}
          className="border-white/15 bg-white/[0.02] text-white hover:bg-white/[0.06] hover:text-white"
          title="Preview the assembled 4-layer prompt without generating"
        >
          <Wand2 className="w-4 h-4" />
        </Button>
      </div>

      {showAssembledPrompt && assembledCache && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs uppercase tracking-wider" style={{ color: "var(--darkroom-text-dim)" }}>
              Assembled prompt
            </Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAssembledPrompt(false)}
              className="h-6 text-[11px]"
            >
              Hide
            </Button>
          </div>
          <Textarea
            value={assembledCache.prompt}
            readOnly
            className="min-h-[180px] font-mono text-[10px] bg-white/[0.03] border-white/10 text-white/80"
          />
        </div>
      )}

      {error && (
        <div
          className="p-3 rounded border flex items-start gap-2 text-xs"
          style={{
            borderColor: "var(--darkroom-error)",
            color: "var(--darkroom-error)",
            background: "rgba(239, 68, 68, 0.05)",
          }}
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="space-y-3 pt-1 border-t" style={{ borderColor: "var(--darkroom-border-subtle)" }}>
          <div className="flex items-center gap-2 pt-3">
            <LEDIndicator state="ready" />
            <span className="text-xs uppercase tracking-wider" style={{ color: "var(--darkroom-text-dim)" }}>
              Generated master
            </span>
          </div>
          <div className="relative rounded border overflow-hidden" style={{ borderColor: "var(--darkroom-border-subtle)" }}>
            <img src={result.imageUrl} alt={selectedProduct.itemName} className="w-full" />
          </div>
          <div className="text-[11px] space-y-0.5" style={{ color: "var(--darkroom-text-dim)" }}>
            <div>
              Preset: <span className="font-mono">{result.presetId}</span>
            </div>
            <div>
              Canvas: <span className="font-mono">{result.canvas.widthPx} × {result.canvas.heightPx}</span> · {result.aspectRatio}
            </div>
            {result.savedImageId && (
              <div>
                Library id: <span className="font-mono">{result.savedImageId}</span>
              </div>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={handleApprove}
              disabled={!onApproveMaster}
              className="bg-emerald-600 text-white hover:bg-emerald-500"
              size="sm"
              title="Marks the Pipeline row for this SKU's APPLICATOR GROUP as approved — not just this specific cap colorway."
            >
              <Check className="w-3.5 h-3.5 mr-1.5" />
              Approve master
            </Button>
            <Button asChild variant="outline" size="sm" className="border-white/15 bg-white/[0.02] text-white hover:bg-white/[0.06] hover:text-white">
              <a href={result.imageUrl} target="_blank" rel="noreferrer">
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Full size
              </a>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                reset();
                setShowAssembledPrompt(false);
              }}
              className="text-white/70 hover:text-white"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Try again
            </Button>
          </div>
          <p className="text-[10px] leading-tight pt-1" style={{ color: "var(--darkroom-text-dim)" }}>
            Approval flags the whole applicator group in the Pipeline (e.g. all 9 tassel
            colorways), not just this variant. One canonical hero per group.
          </p>
        </div>
      )}

      {!isGenerating && !result && !error && (
        <div className="pt-1 text-[11px] flex items-center gap-2" style={{ color: "var(--darkroom-text-dim)" }}>
          <ImageIcon className="w-3 h-3" />
          <span>
            Click <span className="font-medium">Generate master</span> to produce this SKU on the selected preset.
            Reference image from Convex is attached automatically.
          </span>
        </div>
      )}
    </div>
  );
}
