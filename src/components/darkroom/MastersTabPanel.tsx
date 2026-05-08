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
import { DEFAULT_IMAGE_AI_PROVIDER } from "@/config/imageSettings";
import {
  BACKGROUND_PRESETS,
  getRandomBackgroundVariation,
} from "@/components/darkroom/RightPanel";
import { isSquareCrossSection, parseDimensionMm } from "@/lib/product-image/skuInjector";

const SCENE_FLEXIBLE_PRESET_ID = "master-scene-flexible-2000x2200";
const ANGLE_PRESET_ID = "master-angle-2080x2288";
const MARKETING_PRESET_ID = "master-marketing-2080x2288";

const MASTER_IMAGE_MODEL_OPTIONS = [
  {
    value: "openai-image-2",
    label: "GPT Image 2",
    description: "Primary high-fidelity reference edit model",
  },
  {
    value: "gemini-3-pro-image-preview",
    label: "Gemini Pro Image",
    description: "High-detail Gemini comparison model",
  },
  {
    value: "gemini-3.1-flash-image-preview",
    label: "Gemini Flash Image",
    description: "Fast Gemini comparison model",
  },
  {
    value: "gemini-2.5-flash-image",
    label: "Gemini Flash stable",
    description: "Stable Gemini fallback path",
  },
] as const;

type MasterImageModelValue = (typeof MASTER_IMAGE_MODEL_OPTIONS)[number]["value"];

const ASPECT_RATIO_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "10:11", label: "10:11 portrait (catalog default)" },
  { value: "1:1", label: "1:1 square (marketplace · IG feed)" },
  { value: "4:5", label: "4:5 portrait (Sanity hero · IG feed)" },
  { value: "9:16", label: "9:16 vertical (IG story · reel · TikTok)" },
  { value: "3:2", label: "3:2 landscape" },
  { value: "16:9", label: "16:9 landscape (hero · YouTube)" },
  { value: "1.91:1", label: "1.91:1 (LinkedIn · FB link preview)" },
  { value: "21:9", label: "21:9 ultrawide (banner)" },
];

/**
 * Camera-angle chip set for the Master · Angle preset. Each entry supplies
 * the prompt language that gets injected as a CAMERA ANGLE block, plus an
 * optional `referenceModifier` filename suffix the operator can use for a
 * per-angle reference PNG (e.g. `--3qtr-left`). Without a per-angle
 * reference, the model interprets the angle from the front-facing reference
 * — quality varies but the bottle's identity is preserved.
 */
const ANGLE_VARIANTS: Array<{
  id: string;
  label: string;
  icon: string;
  promptLanguage: string;
  /**
   * Optional override used when the selected SKU's family is a SQUARE PRISM
   * (Empire, Square — see `isSquareCrossSection`). The default `promptLanguage`
   * for side / 3/4 angles tells the model the rotation "reveals depth" — true
   * for cylinders and rectangular flasks, but for a square cross-section the
   * side face has the SAME width as the front face, so that phrasing makes the
   * model render a flat slab. When the family is square, this string is used
   * in place of `promptLanguage` so the angle directive reinforces width = depth.
   */
  squareCrossSectionLanguage?: string;
  referenceModifier?: string;
}> = [
  {
    id: "front",
    label: "Front",
    icon: "▣",
    promptLanguage:
      "the camera sits directly in front of the bottle at eye-level (the bottle's vertical centerline meets the camera's optical axis); 85mm product lens at f/8; the front face of the bottle reads as a flat plane to the camera",
  },
  {
    id: "3qtr-left",
    label: "3/4 Left",
    icon: "◖",
    referenceModifier: "3qtr-left",
    promptLanguage:
      "the camera is rotated approximately 30° to the bottle's right (so the bottle appears rotated to the LEFT in the frame), eye-level, 85mm product lens at f/8; both the front face and the left side of the bottle are visible, revealing depth and three-dimensionality without sacrificing the front silhouette",
    squareCrossSectionLanguage:
      "the camera is rotated approximately 30° to the bottle's right (so the bottle appears rotated to the LEFT in the frame), eye-level, 85mm product lens at f/8; both the front face and the left side face of this SQUARE PRISM bottle are visible — those two faces are EQUAL in width (cross-section is square: width = depth), so neither face is narrower than the other; the body silhouette remains rectangular with the SAME height-to-width ratio as the front view; the 3/4 rotation reveals the vertical edge between the two faces and the way the key light wraps around it — it does NOT narrow the bottle's depth, do NOT render a flask or a slab",
  },
  {
    id: "3qtr-right",
    label: "3/4 Right",
    icon: "◗",
    referenceModifier: "3qtr-right",
    promptLanguage:
      "the camera is rotated approximately 30° to the bottle's left (so the bottle appears rotated to the RIGHT in the frame), eye-level, 85mm product lens at f/8; both the front face and the right side of the bottle are visible, revealing depth and three-dimensionality without sacrificing the front silhouette",
    squareCrossSectionLanguage:
      "the camera is rotated approximately 30° to the bottle's left (so the bottle appears rotated to the RIGHT in the frame), eye-level, 85mm product lens at f/8; both the front face and the right side face of this SQUARE PRISM bottle are visible — those two faces are EQUAL in width (cross-section is square: width = depth), so neither face is narrower than the other; the body silhouette remains rectangular with the SAME height-to-width ratio as the front view; the 3/4 rotation reveals the vertical edge between the two faces and the way the key light wraps around it — it does NOT narrow the bottle's depth, do NOT render a flask or a slab",
  },
  {
    id: "side-left",
    label: "Side L",
    icon: "◀",
    referenceModifier: "side-left",
    promptLanguage:
      "pure side-profile view — the camera is rotated 90° so the bottle's left side fully faces the camera; eye-level, 85mm at f/8; the front face is no longer visible; this view reveals the bottle's depth dimension and side-profile silhouette",
    squareCrossSectionLanguage:
      "pure side-profile view — the camera is rotated 90° so the bottle's left side fully faces the camera; eye-level, 85mm at f/8; for this SQUARE PRISM bottle the left side face has the SAME width as the front face (cross-section is square: width = depth), so the silhouette is IDENTICAL to the front view in shape and proportion; only the cap seam orientation, the surface reflections, and any faint mould-seam line at the side edge change; do NOT render the bottle as narrower, thinner, or flask-like in this view — the body width and height-to-width ratio match the front view exactly",
  },
  {
    id: "side-right",
    label: "Side R",
    icon: "▶",
    referenceModifier: "side-right",
    promptLanguage:
      "pure side-profile view — the camera is rotated 90° so the bottle's right side fully faces the camera; eye-level, 85mm at f/8; the front face is no longer visible; this view reveals the bottle's depth dimension and side-profile silhouette",
    squareCrossSectionLanguage:
      "pure side-profile view — the camera is rotated 90° so the bottle's right side fully faces the camera; eye-level, 85mm at f/8; for this SQUARE PRISM bottle the right side face has the SAME width as the front face (cross-section is square: width = depth), so the silhouette is IDENTICAL to the front view in shape and proportion; only the cap seam orientation, the surface reflections, and any faint mould-seam line at the side edge change; do NOT render the bottle as narrower, thinner, or flask-like in this view — the body width and height-to-width ratio match the front view exactly",
  },
  {
    id: "back",
    label: "Back",
    icon: "▢",
    referenceModifier: "back",
    promptLanguage:
      "rear view — the camera is positioned directly behind the bottle, eye-level, 85mm at f/8; the back of the bottle faces the camera; do not show the front face",
  },
  {
    id: "low-hero",
    label: "Low Hero",
    icon: "▲",
    promptLanguage:
      "low-angle hero shot — the camera sits approximately 15° below the bottle's mid-height looking up; the bottle reads as monumental and elevated; the cap and shoulder dominate; the base is foreshortened slightly; 85mm at f/8 to maintain product-photography proportions (no ultrawide distortion)",
  },
  {
    id: "high-down",
    label: "High Down",
    icon: "▼",
    promptLanguage:
      "elevated high-angle view — the camera sits approximately 25° above the bottle's mid-height looking down; the cap and shoulder are foreshortened; the base reads larger; 85mm at f/8 to maintain product-photography proportions",
  },
  {
    id: "top-down",
    label: "Top Down",
    icon: "○",
    referenceModifier: "top-down",
    promptLanguage:
      "pure top-down flat-lay view — the camera looks straight down at the bottle from directly above; the cap reads as the dominant element (a circle or cap-shape silhouette); the bottle's body is foreshortened to its cross-section silhouette; 85mm at f/8; the bottle rests on the parchment plate which fills the frame",
  },
];

/**
 * Marketing-layout chip set for the Master · Marketing preset. Maps onto the
 * `MarketingLayout` union in promptAssembler.ts.
 */
const MARKETING_LAYOUT_OPTIONS: Array<{
  id: "left-third" | "right-third" | "lower-banner" | "upper-banner" | "centered-overlay";
  label: string;
  icon: string;
  description: string;
}> = [
  {
    id: "left-third",
    label: "Left Third",
    icon: "◧",
    description: "Bottle right · copy left third",
  },
  {
    id: "right-third",
    label: "Right Third",
    icon: "◨",
    description: "Bottle left · copy right third",
  },
  {
    id: "lower-banner",
    label: "Lower Banner",
    icon: "▁",
    description: "Bottle upper · copy lower band",
  },
  {
    id: "upper-banner",
    label: "Upper Banner",
    icon: "▔",
    description: "Copy upper band · bottle lower",
  },
  {
    id: "centered-overlay",
    label: "Overlay",
    icon: "◉",
    description: "Copy overlaid in negative space",
  },
];

// Masters tab generates full catalog scenes (bottle + fitment + cap), so the
// paper-doll transparent-layer preset doesn't belong here — pairing it with a
// full SKU would produce a transparent image that still has a fitment baked in,
// which defeats paper-doll's purpose. Components tab is the correct home for
// that preset.
const MASTERS_PRESETS = IMAGE_PRESET_LIST.filter((p) => p.kind === "final_render");
import {
  fetchProductHubBySku,
  fetchProductHubsBySkus,
  getUseProductHubPrompts,
} from "@/lib/product-image/productHubLookup";
import {
  assemblePrompt,
  type AssembledPrompt,
  type LiquidSpec,
  type CameraAngleSpec,
  type MarketingCopySpec,
  type MarketingLayout,
} from "@/lib/product-image/promptAssembler";
import type { Product } from "@/integrations/convex/bestBottles";
import {
  useAssembledPromptGeneration,
  type AssembledGenerateOptions,
  type AssembledGenerationResult,
} from "@/hooks/useAssembledPromptGeneration";

interface FolderReferenceEntry {
  url: string;
  name: string;
  /** Map key = Grace SKU (uppercase), or `${graceSku}--${modifier}` for variants. */
  matchKey: string;
}

type ParsedReferenceFilename = { graceSku: string; modifier?: string };

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
function parseGraceSkuFilename(filename: string): ParsedReferenceFilename | null {
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

function normalizeReferenceStem(filename: string): string {
  return filename
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/^\d+\.\s*/, "")
    .replace(/1vory/gi, "ivory")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function inferCapacityMlFromStem(stem: string): number | null {
  const match = stem.match(/(?:^|-)(\d{1,3})ml(?:-|$)/);
  return match ? Number(match[1]) : null;
}

function inferBulbTasselSuffix(filename: string): { suffix: string; capacityMl: number | null } | null {
  const stem = normalizeReferenceStem(filename);
  const tokens = new Set(stem.split("-").filter(Boolean));
  if (!tokens.has("tassel")) return null;
  if (!tokens.has("bulb") && !tokens.has("antique")) return null;

  const has = (token: string) => tokens.has(token);
  const capacityMl = inferCapacityMlFromStem(stem);

  if (has("ivory") && has("silver")) return { suffix: "IVSL", capacityMl };
  if (has("ivory") && has("gold")) return { suffix: "IVGD", capacityMl };
  if (has("matte") && has("silver")) return { suffix: "MSLV", capacityMl };
  if (has("black") || has("blk")) return { suffix: "BLK", capacityMl };
  if (has("red")) return { suffix: "RED", capacityMl };
  if (has("white") || has("wht")) return { suffix: "WHT", capacityMl };
  if (has("lavender") || has("lvn")) return { suffix: "LVN", capacityMl };
  if (has("pink") || has("pnk")) return { suffix: "PNK", capacityMl };
  if (has("gold") || has("gld")) return { suffix: "GLD", capacityMl };
  return null;
}

function isEmpireBulbTasselProduct(product: Product): boolean {
  const sku = product.graceSku.toUpperCase();
  if (sku.includes("-AST-")) return true;
  const text = [
    product.applicator,
    product.capStyle,
    product.itemName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return text.includes("tassel") && (text.includes("bulb") || text.includes("antique"));
}

function findBulbTasselMatch(
  candidates: Product[],
  suffix: string,
  capacityMl: number | null,
): Product | null {
  return candidates.find((product) => {
    const sku = product.graceSku.toUpperCase();
    if (!sku.includes(`-AST-${suffix}`)) return false;
    if (!isEmpireBulbTasselProduct(product)) return false;
    if (capacityMl !== null && product.capacityMl !== null && product.capacityMl !== capacityMl) {
      return false;
    }
    return true;
  }) ?? null;
}

function uniqueProductsByGraceSku(products: Product[]): Product[] {
  const seen = new Set<string>();
  return products.filter((product) => {
    const key = product.graceSku.toUpperCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function resolveReferenceFilenameMatch(
  filename: string,
  parsed: ParsedReferenceFilename | null,
  preferredProducts: Product[],
  familyProducts: Product[],
): ParsedReferenceFilename | null {
  const allProducts = uniqueProductsByGraceSku([...preferredProducts, ...familyProducts]);
  if (parsed && allProducts.some((product) => product.graceSku.toUpperCase() === parsed.graceSku)) {
    return parsed;
  }

  const tassel = inferBulbTasselSuffix(filename);
  if (!tassel) return parsed;

  const matched =
    findBulbTasselMatch(preferredProducts, tassel.suffix, tassel.capacityMl) ??
    findBulbTasselMatch(familyProducts, tassel.suffix, tassel.capacityMl);

  if (!matched) return parsed;
  return {
    graceSku: matched.graceSku.toUpperCase(),
    modifier: parsed?.modifier,
  };
}

/** Build the Map key from a Grace SKU + optional modifier. */
function folderKey(graceSku: string, modifier?: string): string {
  const base = graceSku.toUpperCase();
  return modifier ? `${base}--${modifier.toLowerCase()}` : base;
}

function getMeasurementIssue(product: Product): string | null {
  const heightMm = parseDimensionMm(product.heightWithoutCap);
  const widthMm = parseDimensionMm(product.diameter);
  if (heightMm == null && widthMm == null) {
    return "Missing body height and face width/diameter.";
  }
  if (heightMm == null) {
    return "Missing body height.";
  }
  if (widthMm == null) {
    return "Missing face width/diameter.";
  }
  return null;
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
  /**
   * Every SKU in the family across ALL capacities and glass colors. Used
   * for orphan analysis on the dropped reference folder so files for, say,
   * 50ml don't appear orphaned just because the current group view is
   * scoped to 100ml. Optional — falls back to `familyVariants` when
   * absent (older callers).
   */
  allFamilyProducts?: Product[];
  /** Family name for Library tagging. */
  familyName?: string | null;
  /** Optional callback when a master is approved. Parent can persist. */
  onApproveMaster?: (result: AssembledGenerationResult, product: Product) => void;
}

export function MastersTabPanel({
  selectedProduct,
  familyVariants,
  allFamilyProducts,
  familyName,
  onApproveMaster,
}: MastersTabPanelProps) {
  const [presetId, setPresetId] = useState<string>(DEFAULT_IMAGE_PRESET_ID);
  const [liquidEnabled, setLiquidEnabled] = useState(false);
  const [liquidColor, setLiquidColor] = useState("warm amber perfume");
  const [liquidFill, setLiquidFill] = useState(75);
  const [masterAiProvider, setMasterAiProvider] = useState<MasterImageModelValue>(
    DEFAULT_IMAGE_AI_PROVIDER as MasterImageModelValue,
  );
  const [showAssembledPrompt, setShowAssembledPrompt] = useState(false);
  const [assembledCache, setAssembledCache] = useState<AssembledPrompt | null>(null);

  // Scene overlay — only used when the Master · Scene-Flexible preset is
  // selected. The chip picker pre-fills the textarea with one of the
  // BACKGROUND_PRESETS' curated variations; the operator can then edit
  // the text freely. Aspect ratio + resolution let them pivot the catalog
  // master into a 16:9 hero or 1:1 marketplace tile per generation.
  const [sceneBackgroundPresetId, setSceneBackgroundPresetId] = useState<string | null>(null);
  const [sceneBackgroundPrompt, setSceneBackgroundPrompt] = useState("");
  const [sceneAspectRatio, setSceneAspectRatio] = useState<string>("10:11");
  const [sceneResolution, setSceneResolution] = useState<"standard" | "high">("standard");
  const isSceneFlexible = presetId === SCENE_FLEXIBLE_PRESET_ID;
  const isAngles = presetId === ANGLE_PRESET_ID;
  const isMarketing = presetId === MARKETING_PRESET_ID;
  // Aspect / resolution overlay surfaces for any of the three flexible
  // presets. Catalog presets stay locked at the preset's canonical ratio.
  const hasFlexibleOverlay = isSceneFlexible || isAngles || isMarketing;

  // Camera-angle chip — only consulted when isAngles. Default front so the
  // first generation matches the front-facing reference faithfully.
  const [selectedAngleId, setSelectedAngleId] = useState<string>("front");
  const selectedAngleVariant = useMemo(
    () => ANGLE_VARIANTS.find((a) => a.id === selectedAngleId) ?? ANGLE_VARIANTS[0],
    [selectedAngleId],
  );

  // Marketing copy fields — only consulted when isMarketing. Layout default
  // is left-third (bottle right, copy left) which is the most common
  // editorial campaign layout.
  const [marketingLayoutId, setMarketingLayoutId] = useState<MarketingLayout>("left-third");
  const [marketingHeadline, setMarketingHeadline] = useState("");
  const [marketingSubhead, setMarketingSubhead] = useState("");
  const [marketingCta, setMarketingCta] = useState("");
  const [marketingVoiceCue, setMarketingVoiceCue] = useState("editorial luxury, restrained, considered");

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
  // filenames either match the Convex Grace SKU exactly (e.g.
  // `GB-EMP-CLR-100ML-BST-BLK.png`) or use a supported Empire reference name
  // (e.g. `empire-50ml-bulb-tassel-black.png`). Each file is uploaded to
  // Supabase Storage and stored in this map keyed by Grace SKU. When the
  // operator selects a SKU in the left rail, the matching reference auto-loads.
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
   *
   * When the angle preset is active, the modifier comes from the selected
   * angle chip (e.g. `3qtr-left`) rather than a preset-wide entry — so each
   * chip can pull its own per-angle reference if the operator has supplied
   * one. Falls back to the bare Grace SKU when no per-angle PNG is present.
   */
  const lookupFolderReference = (
    sku: Product,
    preset: string,
  ): FolderReferenceEntry | null => {
    const baseKey = folderKey(sku.graceSku);
    let modifier = PRESET_MODIFIER[preset];
    if (preset === ANGLE_PRESET_ID && selectedAngleVariant.referenceModifier) {
      modifier = selectedAngleVariant.referenceModifier;
    }
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
    // selectedAngleId is in the dep list so picking a new angle chip re-runs
    // the lookup against the angle's own modifier suffix (3qtr-left, side, etc.).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProduct, presetId, referenceFolder, folderUserOverride, selectedAngleId]);

  /**
   * Upload a folder of PSD-rendered PNGs. Each filename is resolved to the
   * Grace SKU of the bottle it depicts, either by exact SKU filename
   * (`GB-EMP-CLR-100ML-BST-BLK.png`) or by supported Empire reference naming
   * (`empire-50ml-bulb-tassel-black.png`). Files are uploaded to Supabase
   * Storage in parallel; per-file failures are collected and surfaced loudly
   * so we don't silently lose 15 of 16 uploads to an RLS policy or upstream race.
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
    // Filter to image files only. PSD-export folders sometimes ship a
    // `_RENAME_MANIFEST.json` or `.DS_Store` alongside the PNGs, and the
    // <input accept="..."> attribute is bypassed when files arrive via
    // drag-drop. Filtering here keeps non-image files out of the orphan
    // panel so the operator can focus on real Grace SKU mismatches.
    const ALLOWED_EXT = /\.(png|jpe?g)$/i;
    const arr = Array.from(files).filter((f) => ALLOWED_EXT.test(f.name));
    const skippedNonImage = Array.from(files).length - arr.length;
    if (arr.length === 0) {
      if (skippedNonImage > 0) {
        toast({
          title: "No image files in folder",
          description: `${skippedNonImage} non-image file(s) skipped (.json, .DS_Store, etc).`,
        });
      }
      return;
    }
    setIsFolderUploading(true);

    const newMap = new Map(referenceFolder);
    const failures: Array<{ name: string; error: string }> = [];
    let stored = 0;
    const preferredProducts = familyVariants ?? [];
    const familyProducts = allFamilyProducts ?? preferredProducts;

    await Promise.all(
      arr.map(async (file) => {
        try {
          const parsed = parseGraceSkuFilename(file.name);
          const match = resolveReferenceFilenameMatch(
            file.name,
            parsed,
            preferredProducts,
            familyProducts,
          );
          if (!match) {
            throw new Error("Filename did not yield a reference match");
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

          const key = folderKey(match.graceSku, match.modifier);
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
  }, [selectedProduct, presetId, referenceFolder, selectedAngleId]);

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
  /**
   * Orphan analysis runs against the WHOLE family (any capacity, any glass
   * color) so a file for, say, 50ml doesn't appear orphaned purely because
   * the operator is currently viewing the 100ml product group. Falls back
   * to the current-group variants if the parent didn't pass the wider list.
   */
  const familyGraceSet = useMemo(() => {
    const set = new Set<string>();
    const source = allFamilyProducts ?? familyVariants ?? [];
    for (const v of source) set.add(v.graceSku.toUpperCase());
    return set;
  }, [allFamilyProducts, familyVariants]);

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
    } catch (e: unknown) {
      console.error("[MastersTabPanel] reference upload failed", e);
      const message = e instanceof Error ? e.message : String(e);
      toast({
        title: "Upload failed",
        description: message,
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
  const selectedImageModel = useMemo(
    () => MASTER_IMAGE_MODEL_OPTIONS.find((model) => model.value === masterAiProvider) ?? MASTER_IMAGE_MODEL_OPTIONS[0],
    [masterAiProvider],
  );

  const serverPromptPreview = selectedProduct
    ? [
        "REFERENCE-LOCKED BEST BOTTLES LUXURY PRODUCT PHOTOGRAPHY V5.1.",
        "",
        "This PDP master uses the Supabase Edge Function's server-side reference-locked prompt.",
        "The uploaded/reference image is the source of truth. The old GLOBAL SYSTEM / PRESET / PRODUCT SPECIFICATIONS assembly is sent only as SKU/spec context and is replaced server-side before the selected image model runs.",
        "",
        "Expected server mode: best-bottles-reference-locked",
        `Image model: ${selectedImageModel.label}`,
        `SKU: ${selectedProduct.graceSku}`,
        `Canvas: ${selectedPreset.canvas.widthPx} x ${selectedPreset.canvas.heightPx} (${selectedPreset.aspectRatio})`,
        `Reference: ${customReference?.name ?? "required uploaded/folder match"}`,
      ].join("\n")
    : "";

  const handleAssemble = async (): Promise<AssembledPrompt | null> => {
    if (!selectedProduct) return null;
    const liquid: LiquidSpec | null = liquidEnabled
      ? { present: true, color: liquidColor, fillPercent: liquidFill }
      : null;

    // Product Hub canonical-source path (opt-in via the flag in the
    // Dark Room sidebar). When enabled, fetch the hub matching this SKU
    // and pass it to the assembler — the assembler will switch the SKU
    // DATA layer to the richer schematic-aware block. When the lookup
    // returns null (sparsely-populated org, no match), the assembler
    // silently falls back to the legacy Convex skuInjector path.
    const productHub = getUseProductHubPrompts() && selectedProduct.graceSku
      ? await fetchProductHubBySku(selectedProduct.graceSku, {
          family: selectedProduct.family,
          capacityMl: selectedProduct.capacityMl,
          color: selectedProduct.color,
        })
      : null;

    const assembled = assemblePrompt({
      presetId,
      sku: selectedProduct,
      productHub,
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

    // Camera-angle injection — only for the Master · Angle preset. Front
    // angle is omitted from the prompt because it's the assembler's default;
    // any other chip injects a CAMERA ANGLE OVERRIDE block. When the SKU's
    // family is a SQUARE PRISM (Empire, Square), prefer the angle's
    // `squareCrossSectionLanguage` override so the directive reinforces
    // width = depth instead of telling the model the rotation "reveals depth"
    // (which makes it render a flask or a slab).
    const angleLanguage =
      isSquareCrossSection(sku.family) && selectedAngleVariant.squareCrossSectionLanguage
        ? selectedAngleVariant.squareCrossSectionLanguage
        : selectedAngleVariant.promptLanguage;
    const cameraAngle: CameraAngleSpec | null =
      isAngles && selectedAngleVariant.id !== "front"
        ? {
            id: selectedAngleVariant.id,
            label: selectedAngleVariant.label,
            promptLanguage: angleLanguage,
            referenceModifier: selectedAngleVariant.referenceModifier,
          }
        : null;

    // Marketing-copy injection — only for the Master · Marketing preset, and
    // only when at least a headline is supplied. Empty fields are skipped so
    // the operator can iterate on copy without re-typing every line.
    const marketingCopy: MarketingCopySpec | null =
      isMarketing && marketingHeadline.trim().length > 0
        ? {
            headline: marketingHeadline.trim(),
            subhead: marketingSubhead.trim() || undefined,
            cta: marketingCta.trim() || undefined,
            layout: marketingLayoutId,
            voiceCue: marketingVoiceCue.trim() || undefined,
          }
        : null;

    const assembled = assemblePrompt({
      presetId,
      sku,
      liquid,
      cameraAngle,
      marketingCopy,
    });

    // Scene / aspect / resolution overlay surfaces for any of the three
    // flexible presets. Background prompt is consulted only for scene-
    // flexible and marketing (angles inherits the canonical cream plate).
    let sceneOverlay: AssembledGenerateOptions["sceneOverlay"];
    let sceneTags: string[] = [];
    if (hasFlexibleOverlay) {
      const allowsBackgroundOverride = isSceneFlexible || isMarketing;
      const chipVariation =
        allowsBackgroundOverride && sceneBackgroundPresetId
          ? getRandomBackgroundVariation(sceneBackgroundPresetId)
          : null;
      const finalBackgroundPrompt = allowsBackgroundOverride
        ? sceneBackgroundPrompt.trim().length > 0
          ? sceneBackgroundPrompt.trim()
          : chipVariation
        : null;
      sceneOverlay = {
        backgroundPresetId: allowsBackgroundOverride ? sceneBackgroundPresetId : null,
        backgroundPrompt: finalBackgroundPrompt,
        aspectRatioOverride: sceneAspectRatio,
        resolutionOverride: sceneResolution,
      };
      const variantTag = isSceneFlexible
        ? "scene-flexible"
        : isAngles
          ? "angle"
          : "marketing";
      sceneTags = [
        variantTag,
        allowsBackgroundOverride && sceneBackgroundPresetId
          ? `bg:${sceneBackgroundPresetId}`
          : null,
        isAngles ? `angle:${selectedAngleVariant.id}` : null,
        isMarketing ? `layout:${marketingLayoutId}` : null,
        isMarketing && marketingCopy ? "ad-creative" : null,
        `aspect:${sceneAspectRatio}`,
        `res:${sceneResolution}`,
      ].filter((t): t is string => Boolean(t));
    }

    return generate(assembled, {
      aiProvider: masterAiProvider,
      // Custom upload (PSD-rendered PNG) takes priority over Convex's
      // legacy .gif imageUrl — the latter is silently dropped by the
      // unsupported-format filter in useAssembledPromptGeneration.
      referenceImageUrl: referenceUrl ?? sku.imageUrl,
      productContext: {
        name: sku.itemName,
        collection: sku.bottleCollection ?? undefined,
        category: sku.category,
        sku: sku.graceSku,
        capacityMl: sku.capacityMl,
        heightWithoutCap: sku.heightWithoutCap,
        heightWithCap: sku.heightWithCap,
        diameter: sku.diameter,
        capColor: sku.capColor ?? null,
        trimColor: sku.trimColor ?? null,
        applicator: sku.applicator ?? null,
      },
      sceneOverlay,
      // Human-readable identifiers live on library tags. sessionId is a uuid
      // column in Postgres — don't pass a string here.
      extraLibraryTags: [
        "brand:best-bottles",
        "studio-master",
        familyName ? `family:${familyName.toLowerCase().replace(/\s+/g, "-")}` : null,
        `sku:${sku.graceSku}`,
        sku.websiteSku ? `websiteSku:${sku.websiteSku}` : null,
        `model:${masterAiProvider}`,
        ...sceneTags,
      ].filter((t): t is string => Boolean(t)),
    });
  };

  const handleGenerate = async () => {
    if (!selectedProduct) return;
    const measurementIssue = getMeasurementIssue(selectedProduct);
    if (measurementIssue) {
      toast({
        title: "Missing measurements",
        description: `${selectedProduct.graceSku}: ${measurementIssue} Add or measure dimensions before generating.`,
        variant: "destructive",
      });
      return;
    }
    if (!customReference?.url) {
      toast({
        title: "Reference required",
        description: "Best Bottles PDP masters must use an uploaded product reference image.",
        variant: "destructive",
      });
      return;
    }
    await handleAssemble(); // populate assembledCache for the prompt-preview button
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
    return familyVariants.filter((v) => lookupFolderReference(v, presetId) !== null && getMeasurementIssue(v) === null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyVariants, referenceFolder, presetId, selectedAngleId]);

  const measurementBlockedSkus = useMemo(() => {
    if (!familyVariants || familyVariants.length === 0) return [];
    return familyVariants
      .map((product) => ({ product, issue: getMeasurementIssue(product) }))
      .filter((entry): entry is { product: Product; issue: string } => entry.issue !== null);
  }, [familyVariants]);

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
        <Label className="text-xs uppercase tracking-wider" style={{ color: "var(--darkroom-text-dim)" }}>
          Image model
        </Label>
        <Select
          value={masterAiProvider}
          onValueChange={(value) => setMasterAiProvider(value as MasterImageModelValue)}
        >
          <SelectTrigger className="bg-white/[0.03] border-white/10 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MASTER_IMAGE_MODEL_OPTIONS.map((model) => (
              <SelectItem key={model.value} value={model.value}>
                {model.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px]" style={{ color: "var(--darkroom-text-dim)" }}>
          {selectedImageModel.description}
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

      {/* FLEXIBLE OVERLAY — surfaces for Scene-Flexible, Angle, and Marketing
          presets. Each preset reuses the aspect/resolution dropdowns and adds
          its own preset-specific controls (background chip, angle chip strip,
          or marketing-copy fields). Catalog presets stay locked at the
          preset's canonical ratio / standard resolution. */}
      {hasFlexibleOverlay && (
        <div className="space-y-3 pt-1 border-t" style={{ borderColor: "var(--darkroom-border-subtle)" }}>
          <div className="pt-2 space-y-1">
            <Label className="text-xs uppercase tracking-wider" style={{ color: "var(--darkroom-text-dim)" }}>
              {isAngles ? "Angle overlay" : isMarketing ? "Marketing overlay" : "Scene overlay"}
            </Label>
            <p className="text-[10px]" style={{ color: "var(--darkroom-text-dim)" }}>
              {isAngles
                ? "The bottle's identity stays locked. Pick a camera angle below; aspect ratio and resolution can be overridden per generation."
                : isMarketing
                  ? "Combine the canonical bottle with typeset copy. Pick a layout, type the copy, optionally swap the background, and pivot aspect ratio per ad surface."
                  : "The bottle stays locked to the reference + product spec. Pick a background, override aspect ratio, or bump resolution per generation."}
            </p>
          </div>

          {/* Background chip — Scene-Flexible and Marketing both allow scene
              swaps. Angles inherits the canonical cream plate so the chip
              isn't surfaced. */}
          {(isSceneFlexible || isMarketing) && (
            <div className="space-y-1.5">
              <Label className="text-[11px]" style={{ color: "var(--darkroom-text-dim)" }}>
                Background chip
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {BACKGROUND_PRESETS.map((bg) => {
                  const selected = sceneBackgroundPresetId === bg.id;
                  return (
                    <button
                      key={bg.id}
                      type="button"
                      onClick={() => setSceneBackgroundPresetId(selected ? null : bg.id)}
                      className="px-2 py-1 rounded border text-[11px] transition-colors"
                      style={{
                        borderColor: selected ? "var(--darkroom-accent)" : "rgba(255,255,255,0.12)",
                        background: selected ? "rgba(184, 149, 106, 0.12)" : "rgba(255,255,255,0.02)",
                        color: selected ? "var(--darkroom-accent)" : "var(--darkroom-text-dim)",
                      }}
                      title={bg.description}
                    >
                      <span className="mr-1">{bg.icon}</span>
                      {bg.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Custom scene textarea — same scope as the background chip. */}
          {(isSceneFlexible || isMarketing) && (
            <div className="space-y-1.5">
              <Label className="text-[11px]" style={{ color: "var(--darkroom-text-dim)" }}>
                Custom scene (overrides chip)
              </Label>
              <Textarea
                value={sceneBackgroundPrompt}
                onChange={(e) => setSceneBackgroundPrompt(e.target.value)}
                placeholder="e.g. natural travertine surface, soft morning daylight from a north-facing window, gentle bounce-fill from cream walls"
                className="min-h-[60px] text-xs bg-white/[0.03] border-white/10 text-white"
              />
            </div>
          )}

          {/* Angle chip strip — Master · Angle only. Front is the default
              and matches the front-facing reference exactly; other chips
              inject a CAMERA ANGLE OVERRIDE block and (if a per-angle
              reference PNG exists) prefer that PNG via filename suffix. */}
          {isAngles && (
            <div className="space-y-1.5">
              <Label className="text-[11px]" style={{ color: "var(--darkroom-text-dim)" }}>
                Camera angle
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {ANGLE_VARIANTS.map((angle) => {
                  const selected = selectedAngleId === angle.id;
                  return (
                    <button
                      key={angle.id}
                      type="button"
                      onClick={() => setSelectedAngleId(angle.id)}
                      className="px-2 py-1 rounded border text-[11px] transition-colors"
                      style={{
                        borderColor: selected ? "var(--darkroom-accent)" : "rgba(255,255,255,0.12)",
                        background: selected ? "rgba(184, 149, 106, 0.12)" : "rgba(255,255,255,0.02)",
                        color: selected ? "var(--darkroom-accent)" : "var(--darkroom-text-dim)",
                      }}
                      title={
                        angle.referenceModifier
                          ? `Per-angle reference suffix: --${angle.referenceModifier}`
                          : "Uses the front-facing reference"
                      }
                    >
                      <span className="mr-1">{angle.icon}</span>
                      {angle.label}
                    </button>
                  );
                })}
              </div>
              {selectedAngleVariant.referenceModifier && (
                <p className="text-[10px]" style={{ color: "var(--darkroom-text-dim)" }}>
                  For best fidelity, drop a per-angle reference PNG named{" "}
                  <code>
                    {selectedProduct?.graceSku ?? "GRACE-SKU"}--{selectedAngleVariant.referenceModifier}.png
                  </code>{" "}
                  into the reference folder above. Falls back to the front-facing reference if absent.
                </p>
              )}
            </div>
          )}

          {/* Marketing-copy fields — Master · Marketing only. Headline is
              required to inject typeset copy; everything else is optional.
              The TYPESET COPY block is omitted entirely when no headline
              is set, so the operator can preview a clean layout first. */}
          {isMarketing && (
            <>
              <div className="space-y-1.5">
                <Label className="text-[11px]" style={{ color: "var(--darkroom-text-dim)" }}>
                  Layout
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {MARKETING_LAYOUT_OPTIONS.map((layout) => {
                    const selected = marketingLayoutId === layout.id;
                    return (
                      <button
                        key={layout.id}
                        type="button"
                        onClick={() => setMarketingLayoutId(layout.id)}
                        className="px-2 py-1 rounded border text-[11px] transition-colors"
                        style={{
                          borderColor: selected ? "var(--darkroom-accent)" : "rgba(255,255,255,0.12)",
                          background: selected ? "rgba(184, 149, 106, 0.12)" : "rgba(255,255,255,0.02)",
                          color: selected ? "var(--darkroom-accent)" : "var(--darkroom-text-dim)",
                        }}
                        title={layout.description}
                      >
                        <span className="mr-1">{layout.icon}</span>
                        {layout.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px]" style={{ color: "var(--darkroom-text-dim)" }}>
                  Headline (typeset on canvas)
                </Label>
                <Textarea
                  value={marketingHeadline}
                  onChange={(e) => setMarketingHeadline(e.target.value)}
                  placeholder="Beautifully Contained."
                  className="min-h-[40px] text-xs bg-white/[0.03] border-white/10 text-white"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px]" style={{ color: "var(--darkroom-text-dim)" }}>
                  Subhead (optional)
                </Label>
                <Textarea
                  value={marketingSubhead}
                  onChange={(e) => setMarketingSubhead(e.target.value)}
                  placeholder="Glass attar bottles for refined fragrance houses — refillable, customizable, traceable."
                  className="min-h-[40px] text-xs bg-white/[0.03] border-white/10 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px]" style={{ color: "var(--darkroom-text-dim)" }}>
                    CTA (optional)
                  </Label>
                  <Textarea
                    value={marketingCta}
                    onChange={(e) => setMarketingCta(e.target.value)}
                    placeholder="EXPLORE THE COLLECTION"
                    className="min-h-[40px] text-[11px] bg-white/[0.03] border-white/10 text-white"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]" style={{ color: "var(--darkroom-text-dim)" }}>
                    Voice cue
                  </Label>
                  <Textarea
                    value={marketingVoiceCue}
                    onChange={(e) => setMarketingVoiceCue(e.target.value)}
                    placeholder="editorial luxury, restrained"
                    className="min-h-[40px] text-[11px] bg-white/[0.03] border-white/10 text-white"
                  />
                </div>
              </div>

              {marketingHeadline.trim().length === 0 && (
                <p className="text-[10px]" style={{ color: "var(--darkroom-text-dim)" }}>
                  Add a headline to render typeset copy on the canvas. Without it the bottle generates clean (no copy).
                </p>
              )}
            </>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px]" style={{ color: "var(--darkroom-text-dim)" }}>
                Aspect ratio
              </Label>
              <Select value={sceneAspectRatio} onValueChange={setSceneAspectRatio}>
                <SelectTrigger className="h-8 text-[11px] bg-white/[0.03] border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASPECT_RATIO_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="text-[11px]">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]" style={{ color: "var(--darkroom-text-dim)" }}>
                Resolution
              </Label>
              <Select
                value={sceneResolution}
                onValueChange={(v) => setSceneResolution(v as "standard" | "high")}
              >
                <SelectTrigger className="h-8 text-[11px] bg-white/[0.03] border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard" className="text-[11px]">
                    Standard (1K source · 2080 × 2288 export)
                  </SelectItem>
                  <SelectItem value="high" className="text-[11px]">
                    High (2K source · 2080 × 2288 export)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

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
          accept="image/png,image/jpeg"
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
          accept="image/png,image/jpeg"
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
            Filenames can equal the Convex Grace SKU — e.g.{" "}
            <code>GB-EMP-CLR-100ML-BST-BLK.png</code> — or a supported Empire reference name like{" "}
            <code>empire-50ml-bulb-tassel-red.png</code>. Preset variants use a{" "}
            <code>--modifier</code> suffix:{" "}
            <code>GB-EMP-CLR-100ML-BST-BLK--exploded.png</code>.
            Leading <code>"48. "</code> ordering prefixes from PSD exports are stripped automatically.
            Use PNG/JPEG references for OpenAI edits.
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
              <span className="font-mono">GB-EMP-CLR-50ML-DRP-SL</span>), the rename pass missed them, or the filename is not a supported Empire pattern.
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

        {measurementBlockedSkus.length > 0 && (
          <div
            className="rounded border p-2 space-y-1"
            style={{
              borderColor: "rgba(239, 68, 68, 0.4)",
              background: "rgba(239, 68, 68, 0.05)",
            }}
          >
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider" style={{ color: "#F87171" }}>
              <AlertCircle className="w-3 h-3" />
              {measurementBlockedSkus.length} SKU{measurementBlockedSkus.length === 1 ? "" : "s"} missing body measurements
            </div>
            <div className="text-[10px] opacity-80" style={{ color: "#F87171" }}>
              These are blocked from generation until Grace catalog dimensions are added or measured manually.
            </div>
            <div className="space-y-0.5 max-h-32 overflow-auto pt-1">
              {measurementBlockedSkus.map(({ product, issue }) => (
                <div key={product.graceSku} className="text-[10px] font-mono" style={{ color: "#F87171" }}>
                  <span>{product.graceSku}</span>
                  <span className="opacity-60"> — {issue}</span>
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

      {familyVariants && referenceFolder.size > 0 && measurementBlockedSkus.length > 0 && (
        <div className="text-[10px] leading-snug" style={{ color: "#F87171" }}>
          {measurementBlockedSkus.length} SKU{measurementBlockedSkus.length === 1 ? "" : "s"} omitted from batch until measured.
        </div>
      )}

      <div className="flex gap-2">
        <Button
          onClick={handleGenerate}
          disabled={isGenerating || batchProgress !== null || !customReference?.url}
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
              Generate master
            </>
          )}
        </Button>
        <Button
          variant="outline"
          onClick={async () => {
            const a = await handleAssemble();
            setShowAssembledPrompt(Boolean(a));
          }}
          className="border-white/15 bg-white/[0.02] text-white hover:bg-white/[0.06] hover:text-white"
          title="Preview the reference-locked server prompt mode"
        >
          <Wand2 className="w-4 h-4" />
        </Button>
      </div>

      {showAssembledPrompt && assembledCache && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs uppercase tracking-wider" style={{ color: "var(--darkroom-text-dim)" }}>
              {result ? "Actual server prompt" : "Reference-locked server mode"}
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
          <p className="text-[11px] leading-relaxed" style={{ color: "var(--darkroom-text-dim)" }}>
            {result
              ? "This is the final prompt returned by the Edge Function for the generated image."
              : "Best Bottles master generations replace the old assembled prompt with a server-side reference-locked prompt. The GLOBAL SYSTEM context is only SKU/spec data and is not the OpenAI prompt."}
          </p>
          <Textarea
            value={result?.prompt ?? serverPromptPreview}
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAssembledPrompt(true)}
              className="text-white/70 hover:text-white"
            >
              <Wand2 className="w-3.5 h-3.5 mr-1.5" />
              View prompt
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
