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
import { Loader2, Sparkles, Check, AlertCircle, Download, RotateCcw, ImageIcon, Wand2, FolderUp, X, UploadCloud } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOnboarding } from "@/hooks/useOnboarding";
import { toast } from "@/hooks/use-toast";
import { UploadZone } from "@/components/darkroom/UploadZone";
import { ImageLibraryModal } from "@/components/image-editor/ImageLibraryModal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  getBestBottlesReferenceUrlIssue,
  isBestBottlesReferenceUrlUsable,
} from "@/lib/bestBottlesReferenceValidation";
import { updatePipelineSkuJobReference } from "@/lib/bestBottlesPipeline";

interface FolderReferenceEntry {
  url: string;
  name: string;
  /** Map key = Grace SKU (uppercase), or `${graceSku}--${modifier}` for variants. */
  matchKey: string;
}

type UploadedReferenceImage = { url: string; file?: File; name?: string };

type ParsedReferenceFilename = { graceSku: string; modifier?: string };

type BatchScope = "current-group" | "current-applicator" | "selected-skus" | "full-family";

interface BatchScopeOption {
  value: BatchScope;
  label: string;
  description: string;
}

interface BatchPreflightEntry {
  product: Product;
  reference: UploadedReferenceImage | FolderReferenceEntry | null;
  referenceIssue: string | null;
  measurementIssue: string | null;
}

type ReferenceImportEntryStatus =
  | "ready"
  | "duplicate"
  | "unmatched"
  | "unsupported";

interface ReferenceImportEntry {
  file: File;
  name: string;
  relativePath: string;
  size: number;
  key: string | null;
  graceSku: string | null;
  modifier: string | null;
  status: ReferenceImportEntryStatus;
  reason: string | null;
}

interface ReferenceImportPreflight {
  totalFiles: number;
  totalBytes: number;
  uploadBytes: number;
  entries: ReferenceImportEntry[];
  ready: ReferenceImportEntry[];
  duplicates: ReferenceImportEntry[];
  unmatched: ReferenceImportEntry[];
  unsupported: ReferenceImportEntry[];
  canonicalReady: ReferenceImportEntry[];
  modifierReady: ReferenceImportEntry[];
}

const BATCH_SCOPE_OPTIONS: BatchScopeOption[] = [
  {
    value: "current-group",
    label: "Current group",
    description: "Current capacity, color, and thread across applicator siblings.",
  },
  {
    value: "current-applicator",
    label: "Current applicator",
    description: "Only the selected applicator/component style inside this group.",
  },
  {
    value: "selected-skus",
    label: "Selected SKUs",
    description: "Manual pick list for small proof batches.",
  },
  {
    value: "full-family",
    label: "Full family",
    description: "Every matched reference in the bottle family.",
  },
];

const OPENAI_GPT_IMAGE_2_COST_ESTIMATE_USD = {
  standard: { min: 0.06, max: 0.13 },
  high: { min: 0.2, max: 0.3 },
};

function productBatchKey(product: Product): string {
  return product.graceSku?.trim().toUpperCase() || product.websiteSku?.trim().toUpperCase() || product.itemName || "unknown";
}

function normalizeBatchFacet(value: string | null | undefined): string {
  return (value ?? "Unspecified").trim().toLowerCase();
}

function formatUsd(value: number): string {
  if (value < 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(value < 10 ? 2 : 0)}`;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function estimateOpenAiBatchCost(count: number, resolution: "standard" | "high") {
  const perImage = resolution === "high"
    ? OPENAI_GPT_IMAGE_2_COST_ESTIMATE_USD.high
    : OPENAI_GPT_IMAGE_2_COST_ESTIMATE_USD.standard;
  return {
    perImage,
    total: {
      min: perImage.min * count,
      max: perImage.max * count,
    },
  };
}

function compactFacetList(values: Array<string | number | null | undefined>, fallback = "Unspecified"): string {
  const unique = Array.from(
    new Set(
      values
        .map((value) => (value == null || value === "" ? fallback : String(value)))
        .filter(Boolean),
    ),
  );
  if (unique.length === 0) return fallback;
  if (unique.length <= 3) return unique.join(", ");
  return `${unique.slice(0, 3).join(", ")} +${unique.length - 3}`;
}

type ReferenceApplicatorIntent = "sprayer" | "roll-on" | "metal-roll-on" | "plastic-roll-on";
type GlassColorIntent =
  | "clear"
  | "blue"
  | "amber"
  | "frosted"
  | "black"
  | "green"
  | "pink"
  | "swirl";

interface HumanReferenceIntent {
  capacityMl: number | null;
  neckThreadSize: string | null;
  skuPrefix: string | null;
  family: "cylinder" | null;
  bottleColor: GlassColorIntent | null;
  applicator: ReferenceApplicatorIntent | null;
  capColors: Set<string>;
  capFinish: "matte" | "shiny" | null;
  dotCap: boolean;
}

const IMPORTABLE_REFERENCE_FILE_EXT = /\.(png|jpe?g|webp)$/i;

function getFileRelativePath(file: File): string {
  return ((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name).trim();
}

function safeStorageFilename(value: string): string {
  return value
    .trim()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function inferBestBottlesBodyMaterial(product: Product): string {
  const haystack = [
    product.family,
    product.bottleCollection,
    product.category,
    product.itemName,
    product.graceSku,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  if (haystack.includes("aluminum") || haystack.includes("aluminium") || haystack.includes("ab-alu")) {
    return "opaque brushed/satin aluminum";
  }
  if (haystack.includes("plastic")) {
    return "plastic";
  }
  return "glass";
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
  const match = stem.match(/(?:^|-)(\d{1,3})-?ml(?:-|$)/);
  return match ? Number(match[1]) : null;
}

function inferNeckThreadFromStem(stem: string): string | null {
  const match = stem.match(/(?:^|-)(\d{1,2})-(\d{3})(?:-|$)/);
  return match ? `${match[1]}-${match[2]}` : null;
}

function normalizeNeckThread(value: string | null | undefined): string | null {
  return value?.trim().toLowerCase().replace(/[.\s_/]+/g, "-") ?? null;
}

const SKU_GLASS_COLOR_CODES: Record<string, GlassColorIntent> = {
  CLR: "clear",
  BLU: "blue",
  CBL: "blue",
  AMB: "amber",
  FRS: "frosted",
  FRO: "frosted",
  BLK: "black",
  GRN: "green",
  PNK: "pink",
  SWR: "swirl",
};

const SKU_GLASS_COLOR_TEXT: Record<GlassColorIntent, string[]> = {
  clear: ["clear"],
  blue: ["blue", "cobalt"],
  amber: ["amber"],
  frosted: ["frosted", "frost"],
  black: ["black"],
  green: ["green"],
  pink: ["pink"],
  swirl: ["swirl"],
};

function inferHumanReferenceIntent(filename: string): HumanReferenceIntent {
  const stem = normalizeReferenceStem(filename);
  const tokens = new Set(stem.split("-").filter(Boolean));
  const prefixMatch = stem.match(/(?:^|-)(gb|lb)-([a-z0-9]+)-([a-z]{3})(?:-|$)/);
  const glassCode = prefixMatch?.[3]?.toUpperCase() ?? "";
  const bottleColorFromPrefix = SKU_GLASS_COLOR_CODES[glassCode] ?? null;
  const skuPrefix = prefixMatch
    ? `${prefixMatch[1].toUpperCase()}-${prefixMatch[2].toUpperCase()}-${prefixMatch[3].toUpperCase()}`
    : null;
  const has = (token: string) => tokens.has(token);
  const hasAny = (aliases: string[]) => aliases.some((alias) => has(alias));

  let applicator: ReferenceApplicatorIntent | null = null;
  if (hasAny(["spr", "spray", "sprayer", "mist", "pump", "atomizer"])) {
    applicator = "sprayer";
  } else if (hasAny(["mrl"]) || (has("metal") && hasAny(["roll", "roller", "rollon"]))) {
    applicator = "metal-roll-on";
  } else if (has("plastic") && hasAny(["roll", "roller", "rollon"])) {
    applicator = "plastic-roll-on";
  } else if (hasAny(["rol", "roll", "roller", "rollon"])) {
    applicator = "roll-on";
  }

  const capColors = new Set<string>();
  const colorAliases: Array<[string, string[]]> = [
    ["black", ["black", "blk", "bk", "mblk", "sblk"]],
    ["white", ["white", "wht", "wh"]],
    ["gold", ["gold", "gld", "gl", "mgld", "sgld"]],
    ["silver", ["silver", "slv", "sl", "mslv", "sslv"]],
    ["copper", ["copper", "cpr", "cu", "mcpr"]],
    ["blue", ["blue", "blu", "mblu"]],
    ["pink", ["pink", "pnk", "pk"]],
    ["red", ["red"]],
    ["turquoise", ["turquoise", "turq", "trq"]],
    ["ivory", ["ivory", "iv"]],
  ];
  colorAliases.forEach(([color, aliases]) => {
    if (hasAny(aliases)) capColors.add(color);
  });

  return {
    capacityMl: inferCapacityMlFromStem(stem),
    neckThreadSize: inferNeckThreadFromStem(stem),
    skuPrefix,
    family: has("cylinder") || skuPrefix?.startsWith("GB-CYL-") ? "cylinder" : null,
    bottleColor:
      bottleColorFromPrefix ??
      (has("clear") || has("clr")
        ? "clear"
        : has("cobalt") || has("blue")
          ? "blue"
          : has("amber")
            ? "amber"
            : has("frosted") || has("frost")
              ? "frosted"
              : has("swirl")
                ? "swirl"
                : null),
    applicator,
    capColors,
    capFinish: hasAny(["matte", "matt", "mblk", "mslv", "mblu", "mcpr", "mgld"])
      ? "matte"
      : hasAny(["shiny", "shine", "gloss", "sblk", "sgld", "sslv"])
        ? "shiny"
        : null,
    dotCap: hasAny(["dot", "dots"]),
  };
}

function searchableProductText(product: Product): string {
  return [
    product.graceSku,
    product.websiteSku,
    product.family,
    product.color,
    product.applicator,
    product.capStyle,
    product.capColor,
    product.trimColor,
    product.bottleCollection,
    product.itemName,
    product.itemDescription,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function productHasCapColor(product: Product, color: string): boolean {
  const sku = product.graceSku.toUpperCase();
  const text = searchableProductText(product);
  const suffixes: Record<string, string[]> = {
    black: ["BLK", "SBLK", "MBLK", "BKDT"],
    white: ["WHT", "WH"],
    gold: ["GLD", "SGLD", "MGLD"],
    silver: ["SLV", "SSLV", "MSLV", "SLDT"],
    copper: ["CPR", "MCPR"],
    blue: ["BLU", "MBLU"],
    pink: ["PNK", "PKDT"],
    red: ["RED"],
    turquoise: ["TRQ", "TUR"],
    ivory: ["IV", "IVGD", "IVSL"],
  };
  return text.includes(color) || (suffixes[color] ?? []).some((suffix) => sku.includes(suffix));
}

function productMatchesApplicator(product: Product, applicator: ReferenceApplicatorIntent): boolean {
  const sku = product.graceSku.toUpperCase();
  const text = searchableProductText(product);
  if (applicator === "sprayer") {
    return sku.includes("-SPR-") || text.includes("spray") || text.includes("sprayer") || text.includes("mist");
  }
  if (applicator === "metal-roll-on") {
    return sku.includes("-MRL-") || (text.includes("metal") && (text.includes("roll") || text.includes("roller")));
  }
  if (applicator === "plastic-roll-on") {
    return sku.includes("-ROL-") || (text.includes("plastic") && (text.includes("roll") || text.includes("roller")));
  }
  return sku.includes("-ROL-") || sku.includes("-MRL-") || text.includes("roll") || text.includes("roller");
}

function scoreHumanReferenceMatch(
  product: Product,
  intent: HumanReferenceIntent,
  preferredProducts: Product[],
): number | null {
  const sku = product.graceSku.toUpperCase();
  const text = searchableProductText(product);
  let score = preferredProducts.some((preferred) => preferred.graceSku === product.graceSku) ? 6 : 0;

  if (intent.skuPrefix) {
    if (!sku.startsWith(intent.skuPrefix)) return null;
    score += 24;
  }
  if (intent.capacityMl !== null) {
    if (product.capacityMl !== null && product.capacityMl !== intent.capacityMl) return null;
    score += 10;
  }
  if (intent.neckThreadSize) {
    const productThread = normalizeNeckThread(product.neckThreadSize);
    const intentThread = normalizeNeckThread(intent.neckThreadSize);
    if (productThread && intentThread && productThread !== intentThread) return null;
    score += 6;
  }
  if (intent.family) {
    if (product.family?.toLowerCase() !== intent.family) return null;
    score += 5;
  }
  if (intent.bottleColor) {
    const colorAliases = SKU_GLASS_COLOR_TEXT[intent.bottleColor] ?? [intent.bottleColor];
    const skuCodes = Object.entries(SKU_GLASS_COLOR_CODES)
      .filter(([, color]) => color === intent.bottleColor)
      .map(([code]) => code);
    const colorMatches =
      colorAliases.some((alias) => text.includes(alias)) ||
      skuCodes.some((code) => sku.includes(`-${code}-`));
    if (!colorMatches) return null;
    score += 5;
  }
  if (intent.applicator) {
    if (!productMatchesApplicator(product, intent.applicator)) return null;
    score += intent.applicator === "metal-roll-on" || intent.applicator === "plastic-roll-on" ? 10 : 8;
  }
  for (const color of intent.capColors) {
    if (!productHasCapColor(product, color)) return null;
    score += 8;
  }
  if (intent.capFinish) {
    const isMatte = text.includes("matte") || /-M[A-Z]+$/.test(sku);
    const isShiny = text.includes("shiny") || /-S[A-Z]+$/.test(sku);
    if (intent.capFinish === "matte" && !isMatte) return null;
    if (intent.capFinish === "shiny" && !isShiny) return null;
    score += 4;
  }
  if (intent.dotCap) {
    if (!text.includes("dot") && !sku.includes("DT")) return null;
    score += 4;
  } else if (text.includes("dot") || sku.includes("DT")) {
    score -= 3;
  }

  const hasSpecificIntent =
    intent.skuPrefix ||
    intent.capacityMl !== null ||
    intent.neckThreadSize ||
    intent.family ||
    intent.bottleColor ||
    intent.applicator ||
    intent.capColors.size > 0 ||
    intent.capFinish ||
    intent.dotCap;
  return hasSpecificIntent && score >= 14 ? score : null;
}

function inferHumanReferenceMatch(
  filename: string,
  preferredProducts: Product[],
  familyProducts: Product[],
): Product | null {
  const intent = inferHumanReferenceIntent(filename);
  const candidates = uniqueProductsByGraceSku([...preferredProducts, ...familyProducts])
    .map((product) => ({
      product,
      score: scoreHumanReferenceMatch(product, intent, preferredProducts),
    }))
    .filter((entry): entry is { product: Product; score: number } => entry.score !== null)
    .sort((a, b) => b.score - a.score);
  if (candidates.length === 0) return null;
  const [best, second] = candidates;
  if (second && second.score === best.score) return null;
  return best.product;
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

function baseSkuKey(value: string): string {
  return value.toUpperCase().replace(/-\d{2}$/i, "");
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

  if (parsed) {
    const websiteSkuMatch = allProducts.find(
      (product) => product.websiteSku.toUpperCase() === parsed.graceSku,
    );
    if (websiteSkuMatch) {
      return {
        graceSku: websiteSkuMatch.graceSku.toUpperCase(),
        modifier: parsed.modifier,
      };
    }

    const parsedBase = baseSkuKey(parsed.graceSku);
    const aliasMatch = allProducts.find(
      (product) => baseSkuKey(product.graceSku) === parsedBase,
    );
    if (aliasMatch) {
      return {
        graceSku: aliasMatch.graceSku.toUpperCase(),
        modifier: parsed.modifier,
      };
    }
  }

  const tassel = inferBulbTasselSuffix(filename);
  if (!tassel) {
    const humanReadableMatch = inferHumanReferenceMatch(
      filename,
      preferredProducts,
      familyProducts,
    );
    if (humanReadableMatch) {
      return {
        graceSku: humanReadableMatch.graceSku.toUpperCase(),
        modifier: parsed?.modifier,
      };
    }
    return null;
  }

  const matched =
    findBulbTasselMatch(preferredProducts, tassel.suffix, tassel.capacityMl) ??
    findBulbTasselMatch(familyProducts, tassel.suffix, tassel.capacityMl);

  if (!matched) return null;
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
  /** Recovered/persisted product references keyed by Grace SKU. */
  persistedReferenceImagesBySku?: Record<string, UploadedReferenceImage>;
  /** Optional callback when a master is approved. Parent can persist. */
  onApproveMaster?: (result: AssembledGenerationResult, product: Product) => void;
}

export function MastersTabPanel({
  selectedProduct,
  familyVariants,
  allFamilyProducts,
  familyName,
  persistedReferenceImagesBySku,
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
  const [customReference, setCustomReference] = useState<UploadedReferenceImage | null>(null);
  const [glassSpecularityReference, setGlassSpecularityReference] =
    useState<UploadedReferenceImage | null>(null);
  const [isUploadingRef, setIsUploadingRef] = useState(false);
  const [isUploadingGlassRef, setIsUploadingGlassRef] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isGlassLibraryOpen, setIsGlassLibraryOpen] = useState(false);

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
  const [usePersistedReferences, setUsePersistedReferences] = useState<boolean>(true);
  const [referenceImportPreflight, setReferenceImportPreflight] =
    useState<ReferenceImportPreflight | null>(null);
  const [isReferenceImportOpen, setIsReferenceImportOpen] = useState(false);
  const [referenceImportProgress, setReferenceImportProgress] = useState<{
    completed: number;
    total: number;
  } | null>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const { user } = useAuth();
  const { currentOrganizationId } = useOnboarding();
  const queryClient = useQueryClient();
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
    const aliasKey = baseSkuKey(sku.graceSku);
    let modifier = PRESET_MODIFIER[preset];
    if (preset === ANGLE_PRESET_ID && selectedAngleVariant.referenceModifier) {
      modifier = selectedAngleVariant.referenceModifier;
    }
    if (modifier) {
      const variant = referenceFolder.get(folderKey(sku.graceSku, modifier));
      if (variant) return variant;
      if (aliasKey !== baseKey) {
        const aliasVariant = referenceFolder.get(folderKey(aliasKey, modifier));
        if (aliasVariant) return aliasVariant;
      }
    }
    const direct = referenceFolder.get(baseKey);
    if (direct) return direct;
    if (aliasKey !== baseKey) {
      const alias = referenceFolder.get(aliasKey);
      if (alias) return alias;
    }

    for (const [key, entry] of referenceFolder.entries()) {
      const [entryBase, entryModifier] = key.split("--");
      if (modifier && entryModifier !== modifier.toLowerCase()) continue;
      if (baseSkuKey(entryBase) === aliasKey) return entry;
    }
    return null;
  };

  const lookupPersistedReferenceCandidateFromMap = (sku: Product): UploadedReferenceImage | null => {
    if (!persistedReferenceImagesBySku) return null;
    const exact =
      persistedReferenceImagesBySku[sku.graceSku] ??
      persistedReferenceImagesBySku[sku.graceSku.toUpperCase()];
    if (exact) return exact;

    const aliasKey = baseSkuKey(sku.graceSku);
    const alias = persistedReferenceImagesBySku[aliasKey];
    if (alias) return alias;

    for (const [key, entry] of Object.entries(persistedReferenceImagesBySku)) {
      if (baseSkuKey(key) === aliasKey) return entry;
    }
    return null;
  };

  const lookupPersistedReferenceFromMap = (sku: Product): UploadedReferenceImage | null => {
    const candidate = lookupPersistedReferenceCandidateFromMap(sku);
    if (!candidate || !isBestBottlesReferenceUrlUsable(candidate.url)) return null;
    return candidate;
  };

  const lookupPersistedReference = (sku: Product): UploadedReferenceImage | null => {
    if (!usePersistedReferences) return null;
    return lookupPersistedReferenceFromMap(sku);
  };

  const lookupAvailableReference = (
    sku: Product,
    preset: string,
  ): UploadedReferenceImage | FolderReferenceEntry | null => {
    const folderReference =
      referenceFolder.size > 0 ? lookupFolderReference(sku, preset) : null;
    return folderReference ?? lookupPersistedReference(sku);
  };

  const buildReferenceImportPreflight = (files: FileList | File[]): ReferenceImportPreflight => {
    const inputFiles = Array.from(files).filter((file) => file.name && file.name !== ".DS_Store");
    const preferredProducts = familyVariants ?? [];
    const familyProducts = allFamilyProducts ?? preferredProducts;
    const seenKeys = new Set<string>();

    const entries = inputFiles.map((file): ReferenceImportEntry => {
      const name = file.name;
      const relativePath = getFileRelativePath(file);
      if (!IMPORTABLE_REFERENCE_FILE_EXT.test(name)) {
        const extension = name.includes(".") ? name.split(".").pop()?.toUpperCase() : "unknown";
        return {
          file,
          name,
          relativePath,
          size: file.size,
          key: null,
          graceSku: null,
          modifier: null,
          status: "unsupported",
          reason: `${extension || "Unknown"} is not uploaded. Use PNG, JPG, or WebP only.`,
        };
      }

      const parsed = parseGraceSkuFilename(name);
      const match = resolveReferenceFilenameMatch(
        name,
        parsed,
        preferredProducts,
        familyProducts,
      );
      if (!match) {
        return {
          file,
          name,
          relativePath,
          size: file.size,
          key: null,
          graceSku: null,
          modifier: null,
          status: "unmatched",
          reason: "Filename does not match a loaded Grace SKU, website SKU, or supported family naming pattern.",
        };
      }

      const key = folderKey(match.graceSku, match.modifier);
      if (seenKeys.has(key)) {
        return {
          file,
          name,
          relativePath,
          size: file.size,
          key,
          graceSku: match.graceSku,
          modifier: match.modifier ?? null,
          status: "duplicate",
          reason: "Another file in this import already resolves to the same SKU/reference slot.",
        };
      }
      seenKeys.add(key);

      return {
        file,
        name,
        relativePath,
        size: file.size,
        key,
        graceSku: match.graceSku,
        modifier: match.modifier ?? null,
        status: "ready",
        reason: null,
      };
    });

    const ready = entries.filter((entry) => entry.status === "ready");
    return {
      totalFiles: entries.length,
      totalBytes: entries.reduce((sum, entry) => sum + entry.size, 0),
      uploadBytes: ready.reduce((sum, entry) => sum + entry.size, 0),
      entries,
      ready,
      duplicates: entries.filter((entry) => entry.status === "duplicate"),
      unmatched: entries.filter((entry) => entry.status === "unmatched"),
      unsupported: entries.filter((entry) => entry.status === "unsupported"),
      canonicalReady: ready.filter((entry) => !entry.modifier),
      modifierReady: ready.filter((entry) => Boolean(entry.modifier)),
    };
  };

  const handleReferenceImportScan = (files: FileList | File[]) => {
    const preflight = buildReferenceImportPreflight(files);
    setReferenceImportPreflight(preflight);
    setIsReferenceImportOpen(true);
    setUploadFailures([]);
    if (preflight.totalFiles === 0) {
      toast({
        title: "No files found",
        description: "Choose a folder with PNG, JPG, or WebP reference images.",
      });
    }
  };

  /**
   * Auto-load the matching folder reference when the operator changes the
   * selected SKU or preset. Skipped when the operator has manually dropped a
   * single-image reference (folderUserOverride=true) so that one-off upload
   * isn't silently overwritten by SKU navigation.
   */
  useEffect(() => {
    if (folderUserOverride) return;
    if (!selectedProduct) return;
    const matched =
      referenceFolder.size > 0 ? lookupFolderReference(selectedProduct, presetId) : null;
    if (matched) {
      setCustomReference({ url: matched.url, name: matched.name });
    } else {
      const persisted = lookupPersistedReference(selectedProduct);
      if (persisted) {
        setCustomReference(persisted);
      } else {
        setCustomReference(null);
      }
    }
    // selectedAngleId is in the dep list so picking a new angle chip re-runs
    // the lookup against the angle's own modifier suffix (3qtr-left, side, etc.).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedProduct,
    presetId,
    referenceFolder,
    folderUserOverride,
    selectedAngleId,
    persistedReferenceImagesBySku,
    usePersistedReferences,
  ]);

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

  const persistedReferenceCount = useMemo(
    () => Object.keys(persistedReferenceImagesBySku ?? {}).length,
    [persistedReferenceImagesBySku],
  );
  const usablePersistedReferenceCount = useMemo(
    () =>
      Object.values(persistedReferenceImagesBySku ?? {}).filter((entry) =>
        isBestBottlesReferenceUrlUsable(entry.url),
      ).length,
    [persistedReferenceImagesBySku],
  );
  const unusablePersistedReferenceCount =
    persistedReferenceCount - usablePersistedReferenceCount;
  const currentGroupPersistedReferenceCount = useMemo(() => {
    if (!familyVariants || familyVariants.length === 0) return 0;
    return familyVariants.filter((v) => lookupPersistedReferenceFromMap(v) !== null).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyVariants, persistedReferenceImagesBySku]);
  const familyPersistedReferenceMatchCount = useMemo(() => {
    const source = uniqueProductsByGraceSku(allFamilyProducts ?? familyVariants ?? []);
    return source.filter((v) => lookupPersistedReferenceFromMap(v) !== null).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allFamilyProducts, familyVariants, persistedReferenceImagesBySku]);
  const hasAnyReferenceSource =
    referenceFolder.size > 0 || (usePersistedReferences && usablePersistedReferenceCount > 0);

  const availableReferenceForCurrentSku = useMemo(() => {
    if (!selectedProduct) return null;
    return lookupAvailableReference(selectedProduct, presetId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedProduct,
    presetId,
    referenceFolder,
    selectedAngleId,
    persistedReferenceImagesBySku,
    usePersistedReferences,
  ]);
  const unusablePersistedReferenceForCurrentSku = useMemo(() => {
    if (!selectedProduct) return null;
    const candidate = lookupPersistedReferenceCandidateFromMap(selectedProduct);
    if (!candidate) return null;
    const issue = getBestBottlesReferenceUrlIssue(candidate.url);
    return issue ? { reference: candidate, issue } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProduct, persistedReferenceImagesBySku]);
  const customReferenceIssue = customReference?.url
    ? getBestBottlesReferenceUrlIssue(customReference.url)
    : null;

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
    for (const v of source) {
      set.add(v.graceSku.toUpperCase());
      set.add(baseSkuKey(v.graceSku));
    }
    return set;
  }, [allFamilyProducts, familyVariants]);

  const orphanReferences = useMemo(() => {
    if (referenceFolder.size === 0 || familyGraceSet.size === 0) return [];
    const orphans: Array<{ key: string; name: string }> = [];
    for (const [key, entry] of referenceFolder.entries()) {
      // Strip "--modifier" suffix to compare against the bare graceSku.
      const base = key.split("--")[0];
      const normalizedBase = baseSkuKey(base);
      if (!familyGraceSet.has(base) && !familyGraceSet.has(normalizedBase)) {
        orphans.push({ key, name: entry.name });
      }
    }
    return orphans;
  }, [referenceFolder, familyGraceSet]);

  const uncoveredSkus = useMemo(() => {
    if (!familyVariants || familyVariants.length === 0) return [];
    if (!hasAnyReferenceSource) return [];
    return familyVariants.filter((v) => lookupAvailableReference(v, presetId) === null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    familyVariants,
    referenceFolder,
    presetId,
    selectedAngleId,
    persistedReferenceImagesBySku,
    hasAnyReferenceSource,
    usePersistedReferences,
  ]);

  const allReferenceMatchedVariants = useMemo(() => {
    if (!hasAnyReferenceSource) return [];
    const source = uniqueProductsByGraceSku(allFamilyProducts ?? familyVariants ?? []);
    return source.filter(
      (v) => lookupAvailableReference(v, presetId) !== null && getMeasurementIssue(v) === null,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    allFamilyProducts,
    familyVariants,
    referenceFolder,
    presetId,
    selectedAngleId,
    persistedReferenceImagesBySku,
    hasAnyReferenceSource,
    usePersistedReferences,
  ]);

  const allReferenceMeasurementBlockedSkus = useMemo(() => {
    if (!hasAnyReferenceSource) return [];
    const source = uniqueProductsByGraceSku(allFamilyProducts ?? familyVariants ?? []);
    return source
      .filter((v) => lookupAvailableReference(v, presetId) !== null)
      .map((product) => ({ product, issue: getMeasurementIssue(product) }))
      .filter((entry): entry is { product: Product; issue: string } => entry.issue !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    allFamilyProducts,
    familyVariants,
    referenceFolder,
    presetId,
    selectedAngleId,
    persistedReferenceImagesBySku,
    hasAnyReferenceSource,
    usePersistedReferences,
  ]);

  const selectedBodyMaterial = selectedProduct
    ? inferBestBottlesBodyMaterial(selectedProduct)
    : "glass";
  const isSelectedAluminum = selectedBodyMaterial.includes("aluminum");
  const specularityReferenceCopy = isSelectedAluminum
    ? {
        title: "Aluminum lighting reference",
        dropLabel: "Drop lighting-only metal reference",
        description:
          "Optional lighting-only guide for metal reflections, edge glints, and contact shadow. It cannot change material: the product body stays opaque brushed/satin aluminum.",
        uploading: "Uploading lighting-only metal reference to Supabase...",
        modalTitle: "Select lighting-only metal reference",
        toastTitle: "Aluminum lighting reference uploaded",
        toastDescription:
          "Will guide lighting, reflections, and shadow only; material stays opaque brushed/satin aluminum.",
        errorTitle: "Aluminum lighting reference upload failed",
        tag: "metal-specularity-ref",
      }
    : {
        title: "Glass specularity reference",
        dropLabel: "Drop secondary glass reference",
        description:
          "Optional style-only guide for glass, highlights, and contact shadow. Product identity stays locked to the reference above.",
        uploading: "Uploading secondary glass reference to Supabase...",
        modalTitle: "Select glass specularity reference",
        toastTitle: "Glass reference uploaded",
        toastDescription: "Will guide glass, specularity, and shadow only.",
        errorTitle: "Glass reference upload failed",
        tag: "glass-specularity-ref",
      };
  const specularityLibraryTags = isSelectedAluminum
    ? ["material-specularity-ref", "metal-specularity-ref", "brand:best-bottles", "studio-master"]
    : ["material-specularity-ref", "glass-specularity-ref", "brand:best-bottles", "studio-master"];

  /**
   * UploadZone returns either a freshly-picked File (drag-drop or browse) or
   * a ready URL (library pick). For files, we upload to Supabase Storage so
   * OpenAI /edits can fetch the reference. For library URLs, we use as-is
   * since they're already in our generated-images bucket.
   */
  const uploadReferenceToStorage = async (
    img: UploadedReferenceImage,
    storageDir:
      | "studio-references"
      | "studio-glass-specularity-references"
      | "studio-material-lighting-references",
  ): Promise<UploadedReferenceImage | null> => {
    // Library pick — already a fetchable URL
    if (!img.file) {
      return img;
    }
    // Fresh upload — push to Supabase Storage to get a public URL
    if (!user || !currentOrganizationId) {
      toast({
        title: "Sign-in required",
        description: "You must be signed in with an organization to upload a reference.",
        variant: "destructive",
      });
      return null;
    }
    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);
    const ext = (img.file.name.split(".").pop() || "png").toLowerCase();
    const path = `${currentOrganizationId}/${user.id}/${storageDir}/${ts}_${rand}.${ext}`;
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
    return { url: urlData.publicUrl, name: img.file.name };
  };

  const handleConfirmReferenceImport = async () => {
    if (!referenceImportPreflight || !user || !currentOrganizationId) {
      toast({
        title: "Sign-in required",
        description: "Must be signed in with an organization to import references.",
        variant: "destructive",
      });
      return;
    }

    const entries = referenceImportPreflight.ready;
    if (entries.length === 0) {
      toast({
        title: "No importable references",
        description: "The selected files had no validated SKU matches.",
        variant: "destructive",
      });
      return;
    }

    setReferenceImportProgress({ completed: 0, total: entries.length });
    setIsFolderUploading(true);
    const nextReferenceFolder = new Map(referenceFolder);
    const failures: Array<{ name: string; error: string }> = [];
    let uploaded = 0;
    let persistedCanonical = 0;

    try {
      for (const entry of entries) {
        try {
          if (!entry.key || !entry.graceSku) {
            throw new Error("Missing resolved SKU key.");
          }

          const ext = (entry.name.split(".").pop() || "png").toLowerCase();
          const contentType =
            entry.file.type ||
            (ext === "webp"
              ? "image/webp"
              : ext === "jpg" || ext === "jpeg"
                ? "image/jpeg"
                : "image/png");
          const familySegment = safeStorageFilename(familyName ?? "best-bottles");
          const storageName = safeStorageFilename(entry.key);
          const storagePath = `${currentOrganizationId}/best-bottles/reference-imports/${familySegment}/${storageName}.${ext}`;

          const { error: uploadError } = await supabase.storage
            .from("generated-images")
            .upload(storagePath, entry.file, {
              cacheControl: "3600",
              contentType,
              upsert: true,
            });
          if (uploadError) throw uploadError;

          const { data: urlData } = supabase.storage
            .from("generated-images")
            .getPublicUrl(storagePath);
          if (!urlData?.publicUrl) throw new Error("No public URL returned.");

          nextReferenceFolder.set(entry.key, {
            url: urlData.publicUrl,
            name: entry.name,
            matchKey: entry.key,
          });
          uploaded += 1;

          if (!entry.modifier) {
            await updatePipelineSkuJobReference({
              organizationId: currentOrganizationId,
              graceSku: entry.graceSku,
              referenceUrl: urlData.publicUrl,
              referenceName: entry.name,
            });
            persistedCanonical += 1;
          }
        } catch (error) {
          failures.push({
            name: entry.relativePath || entry.name,
            error: error instanceof Error ? error.message : String(error),
          });
        } finally {
          setReferenceImportProgress((progress) =>
            progress
              ? {
                  ...progress,
                  completed: Math.min(progress.completed + 1, progress.total),
                }
              : progress,
          );
        }
      }
    } finally {
      setReferenceFolder(nextReferenceFolder);
      setUploadFailures((prev) => [...prev, ...failures]);
      setFolderUserOverride(false);
      setIsFolderUploading(false);
      setReferenceImportProgress(null);
      setIsReferenceImportOpen(false);
      queryClient.invalidateQueries({ queryKey: ["best-bottles-studio-sku-job-references"] });
      queryClient.invalidateQueries({ queryKey: ["best-bottles-pipeline-sku-jobs"] });
    }

    toast({
      title: failures.length > 0 ? "Reference import completed with errors" : "Reference import complete",
      description: [
        `${uploaded} uploaded`,
        `${persistedCanonical} canonical synced to Pipeline`,
        failures.length > 0 ? `${failures.length} failed` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      variant: failures.length > 0 ? "destructive" : "default",
    });
  };

  const handleReferencePicked = async (img: UploadedReferenceImage) => {
    // Manual single-image upload takes precedence over folder auto-match.
    // Mark the override so SKU navigation doesn't silently overwrite this
    // user-chosen reference.
    setFolderUserOverride(true);
    setIsUploadingRef(true);
    try {
      const uploaded = await uploadReferenceToStorage(img, "studio-references");
      if (uploaded) {
        setCustomReference(uploaded);
        toast({
          title: "Reference uploaded",
          description: "Will anchor gpt-image-2 generation for this SKU.",
        });
      }
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

  const handleGlassSpecularityReferencePicked = async (img: UploadedReferenceImage) => {
    setIsUploadingGlassRef(true);
    try {
      const uploaded = await uploadReferenceToStorage(
        img,
        isSelectedAluminum
          ? "studio-material-lighting-references"
          : "studio-glass-specularity-references",
      );
      if (uploaded) {
        setGlassSpecularityReference(uploaded);
        toast({
          title: specularityReferenceCopy.toastTitle,
          description: specularityReferenceCopy.toastDescription,
        });
      }
    } catch (e: unknown) {
      console.error("[MastersTabPanel] glass specularity upload failed", e);
      const message = e instanceof Error ? e.message : String(e);
      toast({
        title: specularityReferenceCopy.errorTitle,
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsUploadingGlassRef(false);
    }
  };

  const clearCustomReference = () => {
    setCustomReference(null);
    // Clearing the manual override re-enables folder auto-match on the
    // next SKU change. If a folder is loaded and the current SKU matches,
    // re-apply the match immediately.
    setFolderUserOverride(false);
    if (!selectedProduct) return;
    const matched =
      referenceFolder.size > 0 ? lookupFolderReference(selectedProduct, presetId) : null;
    if (matched) {
      setCustomReference({ url: matched.url, name: matched.name });
    } else {
      const persisted = lookupPersistedReference(selectedProduct);
      if (persisted) setCustomReference(persisted);
    }
  };

  const resetSelectedReferenceMatch = () => {
    setFolderUserOverride(false);
    if (!selectedProduct) {
      setCustomReference(null);
      return;
    }
    const matched =
      referenceFolder.size > 0 ? lookupFolderReference(selectedProduct, presetId) : null;
    if (matched) {
      setCustomReference({ url: matched.url, name: matched.name });
      return;
    }
    setCustomReference(lookupPersistedReference(selectedProduct));
  };

  const togglePersistedReferences = () => {
    setFolderUserOverride(false);
    setUsePersistedReferences((current) => !current);
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
    const skuBodyMaterial = inferBestBottlesBodyMaterial(sku);
    const skuSpecularityTag = skuBodyMaterial.includes("aluminum")
      ? "metal-specularity-ref"
      : "glass-specularity-ref";

    return generate(assembled, {
      aiProvider: masterAiProvider,
      // Custom upload (PSD-rendered PNG) takes priority over Convex's
      // legacy .gif imageUrl — the latter is silently dropped by the
      // unsupported-format filter in useAssembledPromptGeneration.
      referenceImageUrl: referenceUrl ?? sku.imageUrl,
      glassSpecularityReferenceImageUrl: glassSpecularityReference?.url ?? null,
      productContext: {
        name: sku.itemName,
        collection: sku.bottleCollection ?? undefined,
        family: sku.family,
        category: sku.category,
        bodyMaterial: skuBodyMaterial,
        color: sku.color ?? null,
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
        glassSpecularityReference?.url ? "material-specularity-ref" : null,
        glassSpecularityReference?.url ? skuSpecularityTag : null,
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
    const referenceIssue = getBestBottlesReferenceUrlIssue(customReference.url);
    if (referenceIssue) {
      toast({
        title: "Usable reference required",
        description: `${referenceIssue} Replace it with an uploaded PNG/JPG/WebP before generating.`,
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
  const [isBatchPreflightOpen, setIsBatchPreflightOpen] = useState(false);
  const [batchScope, setBatchScope] = useState<BatchScope>("current-group");
  const [selectedBatchSkuKeys, setSelectedBatchSkuKeys] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    if (!selectedProduct) return;
    setSelectedBatchSkuKeys((prev) => {
      if (prev.size > 0) return prev;
      return new Set([productBatchKey(selectedProduct)]);
    });
  }, [selectedProduct]);

  /** Every variant in the current cohort that has a folder or synced pipeline reference. */
  const matchedFamilyVariants = useMemo(() => {
    if (!familyVariants || !hasAnyReferenceSource) return [];
    return familyVariants.filter((v) => lookupAvailableReference(v, presetId) !== null && getMeasurementIssue(v) === null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    familyVariants,
    referenceFolder,
    presetId,
    selectedAngleId,
    persistedReferenceImagesBySku,
    hasAnyReferenceSource,
    usePersistedReferences,
  ]);

  const measurementBlockedSkus = useMemo(() => {
    if (!familyVariants || familyVariants.length === 0) return [];
    return familyVariants
      .map((product) => ({ product, issue: getMeasurementIssue(product) }))
      .filter((entry): entry is { product: Product; issue: string } => entry.issue !== null);
  }, [familyVariants]);

  const currentGroupBatchCandidates = useMemo(
    () => uniqueProductsByGraceSku(familyVariants ?? []),
    [familyVariants],
  );

  const fullFamilyBatchCandidates = useMemo(
    () => uniqueProductsByGraceSku(allFamilyProducts ?? familyVariants ?? []),
    [allFamilyProducts, familyVariants],
  );

  const currentApplicatorBatchCandidates = useMemo(() => {
    if (!selectedProduct) return [];
    const selectedApplicator = normalizeBatchFacet(selectedProduct.applicator);
    return currentGroupBatchCandidates.filter(
      (product) => normalizeBatchFacet(product.applicator) === selectedApplicator,
    );
  }, [currentGroupBatchCandidates, selectedProduct]);

  const selectedSkuBatchCandidates = useMemo(
    () =>
      fullFamilyBatchCandidates.filter((product) =>
        selectedBatchSkuKeys.has(productBatchKey(product)),
      ),
    [fullFamilyBatchCandidates, selectedBatchSkuKeys],
  );

  const batchScopeCandidates = useMemo(() => {
    if (batchScope === "current-applicator") return currentApplicatorBatchCandidates;
    if (batchScope === "selected-skus") return selectedSkuBatchCandidates;
    if (batchScope === "full-family") return fullFamilyBatchCandidates;
    return currentGroupBatchCandidates;
  }, [
    batchScope,
    currentApplicatorBatchCandidates,
    currentGroupBatchCandidates,
    fullFamilyBatchCandidates,
    selectedSkuBatchCandidates,
  ]);

  const batchPreflightEntries = useMemo<BatchPreflightEntry[]>(
    () =>
      batchScopeCandidates.map((product) => {
        const reference = lookupAvailableReference(product, presetId);
        return {
          product,
          reference,
          referenceIssue: reference
            ? getBestBottlesReferenceUrlIssue(reference.url)
            : "No usable reference is attached.",
          measurementIssue: getMeasurementIssue(product),
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      batchScopeCandidates,
      presetId,
      referenceFolder,
      selectedAngleId,
      persistedReferenceImagesBySku,
      usePersistedReferences,
    ],
  );

  const batchEligibleEntries = useMemo(
    () =>
      batchPreflightEntries.filter(
        (entry) =>
          entry.reference !== null &&
          entry.referenceIssue === null &&
          entry.measurementIssue === null,
      ),
    [batchPreflightEntries],
  );

  const batchReferenceMatchedCount = batchPreflightEntries.filter(
    (entry) => entry.reference !== null && entry.referenceIssue === null,
  ).length;
  const batchMissingReferenceCount = batchPreflightEntries.filter(
    (entry) => entry.reference === null,
  ).length;
  const batchInvalidReferenceCount = batchPreflightEntries.filter(
    (entry) => entry.reference !== null && entry.referenceIssue !== null,
  ).length;
  const batchMeasurementBlockedCount = batchPreflightEntries.filter(
    (entry) => entry.measurementIssue !== null,
  ).length;
  const batchBlockedCount =
    batchMissingReferenceCount + batchInvalidReferenceCount + batchMeasurementBlockedCount;
  const effectiveBatchResolution: "standard" | "high" =
    hasFlexibleOverlay ? sceneResolution : "standard";
  const batchCostEstimate = estimateOpenAiBatchCost(
    batchEligibleEntries.length,
    effectiveBatchResolution,
  );
  const batchCapacitySummary = compactFacetList(
    batchPreflightEntries.map((entry) => entry.product.capacityMl),
    "Unknown capacity",
  );
  const batchApplicatorSummary = compactFacetList(
    batchPreflightEntries.map((entry) => entry.product.applicator),
    "Unspecified applicator",
  );
  const batchColorSummary = compactFacetList(
    batchPreflightEntries.map((entry) => entry.product.color),
    "Unspecified color",
  );
  const batchHasMixedCapacity =
    new Set(batchPreflightEntries.map((entry) => entry.product.capacityMl ?? "unknown")).size > 1;
  const batchHasMixedApplicator =
    new Set(batchPreflightEntries.map((entry) => normalizeBatchFacet(entry.product.applicator))).size > 1;
  const selectedBatchScopeOption =
    BATCH_SCOPE_OPTIONS.find((option) => option.value === batchScope) ?? BATCH_SCOPE_OPTIONS[0];

  const openBatchPreflight = (scope: BatchScope) => {
    setBatchScope(scope);
    if (selectedProduct && selectedBatchSkuKeys.size === 0) {
      setSelectedBatchSkuKeys(new Set([productBatchKey(selectedProduct)]));
    }
    setIsBatchPreflightOpen(true);
  };

  const openReferenceBatchPreflight = () => {
    setFolderUserOverride(false);
    if (!usePersistedReferences && persistedReferenceCount > 0) {
      setUsePersistedReferences(true);
    }
    openBatchPreflight("current-group");
  };

  const toggleSelectedBatchSku = (product: Product, checked: boolean) => {
    const key = productBatchKey(product);
    setSelectedBatchSkuKeys((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const selectBatchSkuSet = (products: Product[]) => {
    setSelectedBatchSkuKeys(new Set(products.map(productBatchKey)));
  };

  /**
   * Batch-generate masters for every SKU in the requested set that has a
   * folder or synced Pipeline reference. Sequential rather than parallel so we don't hammer the
   * generate-madison-image edge function or OpenAI rate limits, and so the
   * operator can watch each output land in the result panel.
   */
  const handleGenerateBatch = async (variantsToGenerate: Product[]) => {
    if (variantsToGenerate.length === 0) return;
    const failures: Array<{ graceSku: string; error: string }> = [];
    for (let i = 0; i < variantsToGenerate.length; i++) {
      const sku = variantsToGenerate[i];
      const ref = lookupAvailableReference(sku, presetId);
      setBatchProgress({
        current: i + 1,
        total: variantsToGenerate.length,
        currentSku: sku.graceSku,
        failures,
      });
      try {
        const referenceIssue = getBestBottlesReferenceUrlIssue(ref?.url);
        if (!ref || referenceIssue) {
          failures.push({
            graceSku: sku.graceSku,
            error: referenceIssue ?? "No usable reference is attached.",
          });
          continue;
        }
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
    const okCount = variantsToGenerate.length - failures.length;
    toast({
      title: failures.length > 0 ? "Batch finished with errors" : "Batch complete",
      description:
        failures.length > 0
          ? `${okCount} succeeded · ${failures.length} failed (${failures.map((f) => f.graceSku).join(", ")})`
          : `Generated ${okCount} masters. Review and approve in the Library.`,
      variant: failures.length > 0 ? "destructive" : "default",
    });
  };

  const handleConfirmBatchPreflight = async () => {
    if (batchEligibleEntries.length === 0) {
      toast({
        title: "No eligible SKUs",
        description: "This scope has no SKUs with both a matched reference and complete measurements.",
        variant: "destructive",
      });
      return;
    }
    setIsBatchPreflightOpen(false);
    await handleGenerateBatch(batchEligibleEntries.map((entry) => entry.product));
  };

  const handleGenerateAll = () => {
    openBatchPreflight("current-group");
  };

  const handleGenerateWholeFolder = () => {
    openBatchPreflight("full-family");
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

      {/* REFERENCE SOURCES — synced Pipeline references auto-load by Grace SKU.
          Operators can still drop a folder of assembled-bottle PNGs once per
          family; folder files win over synced references for quick overrides. */}
      <div className="space-y-2 pt-1 border-t" style={{ borderColor: "var(--darkroom-border-subtle)" }}>
        <div className="flex items-center justify-between pt-2">
          <Label className="text-xs uppercase tracking-wider" style={{ color: "var(--darkroom-text-dim)" }}>
            Reference sources (auto-match by SKU)
          </Label>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openReferenceBatchPreflight}
              disabled={isGenerating || batchProgress !== null}
              className="h-6 px-2 text-[10px] border-[var(--darkroom-accent,#B8956A)]/45 bg-[var(--darkroom-accent,#B8956A)]/10 text-[var(--darkroom-accent,#B8956A)] hover:bg-[var(--darkroom-accent,#B8956A)]/20 hover:text-white"
              title="Open scope, blocker, and cost preflight before generation."
            >
              <Sparkles className="w-3 h-3 mr-1" />
              Batch preflight
            </Button>
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
        </div>

        <input
          ref={folderInputRef}
          type="file"
          multiple
          // @ts-expect-error — webkitdirectory is a non-standard attribute
          webkitdirectory=""
          directory=""
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleReferenceImportScan(e.target.files);
              e.target.value = "";
            }
          }}
        />
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,.psd,.psb,.tif,.tiff,.gif,.heic,.bmp"
          multiple
          className="hidden"
          id="masters-folder-files-fallback"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleReferenceImportScan(e.target.files);
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
              handleReferenceImportScan(e.dataTransfer.files);
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
	                ? "Importing validated references…"
	                : referenceFolder.size > 0
	                  ? `${referenceFolder.size} uploaded reference${referenceFolder.size === 1 ? "" : "s"} loaded`
	                  : persistedReferenceCount > 0
	                    ? usePersistedReferences
	                      ? `${familyPersistedReferenceMatchCount} usable family synced reference${familyPersistedReferenceMatchCount === 1 ? "" : "s"} active`
	                      : `${persistedReferenceCount} synced pipeline reference${persistedReferenceCount === 1 ? "" : "s"} hidden`
	                  : "Scan a folder of reference exports"}
	            </span>
          </div>
          <p className="text-[10px]" style={{ color: "var(--darkroom-text-dim)" }}>
            Synced Pipeline references auto-load when available. For local folders, filenames can equal the Convex Grace SKU — e.g.{" "}
            <code>GB-EMP-CLR-100ML-BST-BLK.png</code> — or a supported Empire reference name like{" "}
            <code>empire-50ml-bulb-tassel-red.png</code>. Preset variants use a{" "}
            <code>--modifier</code> suffix:{" "}
            <code>GB-EMP-CLR-100ML-BST-BLK--exploded.png</code>.
            Leading <code>"48. "</code> ordering prefixes from PSD exports are stripped automatically.
            Scan first; nothing uploads until the import preflight is confirmed. Use PNG/JPEG/WebP references for OpenAI edits.
          </p>
	          {(hasAnyReferenceSource || persistedReferenceCount > 0) && (
	            <div className="flex flex-wrap items-center justify-center gap-2 text-[10px]" style={{ color: "var(--darkroom-text-dim)" }}>
	              {referenceFolder.size > 0 && (
	                <>
                  <span>
                    {referenceFolder.size} uploaded
                  </span>
                  <span className="opacity-50">·</span>
                </>
	              )}
	              {persistedReferenceCount > 0 && (
	                <>
	                  <span>
	                    {usePersistedReferences
	                      ? `${currentGroupPersistedReferenceCount} usable current group · ${familyPersistedReferenceMatchCount} usable family synced`
	                      : `${persistedReferenceCount} synced hidden`}
	                  </span>
	                  <span className="opacity-50">·</span>
	                </>
	              )}
	              {hasAnyReferenceSource && (
	                <>
	                  <span>
	                    {matchedFamilyVariants.length} current group batch match{matchedFamilyVariants.length === 1 ? "" : "es"}
	                  </span>
	                  <span className="opacity-50">·</span>
	                  <span>
	                    {allReferenceMatchedVariants.length} full family batch match{allReferenceMatchedVariants.length === 1 ? "" : "es"}
	                  </span>
	                </>
	              )}
	              {allReferenceMeasurementBlockedSkus.length > 0 && (
	                <>
                  <span className="opacity-50">·</span>
                  <span style={{ color: "#F87171" }}>
                    {allReferenceMeasurementBlockedSkus.length} blocked by missing measurements
                  </span>
                </>
             )}
            </div>
          )}
          {unusablePersistedReferenceCount > 0 && usePersistedReferences && (
            <div
              className="rounded border border-amber-500/30 bg-amber-500/5 p-2 text-[10px] leading-snug text-amber-200"
            >
              {unusablePersistedReferenceCount} synced reference{unusablePersistedReferenceCount === 1 ? "" : "s"} point to local pipeline paths or unsupported files.
              They are not used for generation until imported/uploaded as public PNG/JPG/WebP URLs.
            </div>
          )}
          <div className="flex items-center justify-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => folderInputRef.current?.click()}
              disabled={isFolderUploading}
              className="h-7 text-[11px] border-white/15 bg-white/[0.02] text-white hover:bg-white/[0.06] hover:text-white"
            >
              Scan folder
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
	            {persistedReferenceCount > 0 && (
	              <>
	                <Button
	                  type="button"
	                  size="sm"
	                  variant="ghost"
	                  onClick={togglePersistedReferences}
	                  className="h-7 text-[11px]"
	                  style={{ color: "var(--darkroom-text-dim)" }}
	                >
	                  {usePersistedReferences ? "Hide synced refs" : "Use synced refs"}
	                </Button>
	                <Button
	                  type="button"
	                  size="sm"
	                  variant="ghost"
	                  onClick={resetSelectedReferenceMatch}
	                  className="h-7 text-[11px]"
	                  style={{ color: "var(--darkroom-text-dim)" }}
	                >
	                  Reset selected ref
	                </Button>
	              </>
	            )}
          </div>
	        </div>

        <Dialog open={isReferenceImportOpen} onOpenChange={setIsReferenceImportOpen}>
          <DialogContent className="max-w-4xl max-h-[86vh] overflow-y-auto border-white/10 bg-[#11100f] text-white">
            <DialogHeader>
              <DialogTitle className="text-2xl">Import references preflight</DialogTitle>
              <DialogDescription className="text-base text-white/60">
                Review matches, duplicates, unsupported files, and estimated storage before anything uploads to Supabase.
              </DialogDescription>
            </DialogHeader>

            {referenceImportPreflight && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  <BatchPreflightMetric
                    label="Files scanned"
                    value={String(referenceImportPreflight.totalFiles)}
                  />
                  <BatchPreflightMetric
                    label="Will upload"
                    value={String(referenceImportPreflight.ready.length)}
                    tone={referenceImportPreflight.ready.length > 0 ? "ok" : "warn"}
                  />
                  <BatchPreflightMetric
                    label="Estimated size"
                    value={formatBytes(referenceImportPreflight.uploadBytes)}
                    tone={referenceImportPreflight.uploadBytes > 0 ? "ok" : undefined}
                  />
                  <BatchPreflightMetric
                    label="Duplicates"
                    value={String(referenceImportPreflight.duplicates.length)}
                    tone={referenceImportPreflight.duplicates.length > 0 ? "warn" : undefined}
                  />
                  <BatchPreflightMetric
                    label="Unmatched"
                    value={String(referenceImportPreflight.unmatched.length)}
                    tone={referenceImportPreflight.unmatched.length > 0 ? "warn" : undefined}
                  />
                </div>

                <div className="rounded border border-white/10 bg-white/[0.02] p-3 text-sm text-white/75">
                  <div className="font-medium text-white">Upload policy</div>
                  <div className="mt-1 text-xs leading-relaxed text-white/60">
                    Only validated PNG, JPG, and WebP files whose names resolve to a loaded Grace SKU are uploaded.
                    PSDs, rejected output folders, unknown files, duplicates, and unmatched filenames stay local.
                    Canonical SKU matches update the Pipeline synced reference URL; modifier refs upload for this Studio session but are not promoted as canonical.
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                    <span className="rounded border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-emerald-200">
                      {referenceImportPreflight.canonicalReady.length} canonical
                    </span>
                    <span className="rounded border border-sky-500/25 bg-sky-500/10 px-2 py-1 text-sky-200">
                      {referenceImportPreflight.modifierReady.length} modifier
                    </span>
                    <span className="rounded border border-white/10 bg-white/[0.03] px-2 py-1 text-white/60">
                      {formatBytes(referenceImportPreflight.totalBytes)} selected total
                    </span>
                  </div>
                </div>

                {(referenceImportPreflight.unsupported.length > 0 ||
                  referenceImportPreflight.unmatched.length > 0 ||
                  referenceImportPreflight.duplicates.length > 0) && (
                  <div className="grid gap-3 md:grid-cols-3">
                    <ReferenceImportIssueList
                      title="Unsupported"
                      entries={referenceImportPreflight.unsupported}
                    />
                    <ReferenceImportIssueList
                      title="Unmatched"
                      entries={referenceImportPreflight.unmatched}
                    />
                    <ReferenceImportIssueList
                      title="Duplicates"
                      entries={referenceImportPreflight.duplicates}
                    />
                  </div>
                )}

                <div className="rounded border border-white/10 bg-black/20 p-3">
                  <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wider text-white/45">
                    <span>Validated upload list</span>
                    <span>{referenceImportPreflight.ready.length} shown</span>
                  </div>
                  <div className="max-h-56 space-y-1 overflow-auto">
                    {referenceImportPreflight.ready.length === 0 ? (
                      <div className="text-sm text-white/50">No files are safe to upload from this selection.</div>
                    ) : (
                      referenceImportPreflight.ready.slice(0, 120).map((entry) => (
                        <div
                          key={`${entry.relativePath}-${entry.key}`}
                          className="flex items-center justify-between gap-3 rounded border border-white/5 bg-white/[0.02] px-2 py-1.5 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-mono text-white/80">{entry.name}</div>
                            <div className="font-mono text-white/40">
                              {entry.graceSku}
                              {entry.modifier ? ` --${entry.modifier}` : ""}
                            </div>
                          </div>
                          <div className="shrink-0 text-white/45">{formatBytes(entry.size)}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {referenceImportProgress && (
                  <div className="flex items-center gap-2 rounded border border-amber-500/25 bg-amber-500/5 p-3 text-sm text-amber-100">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Uploading {referenceImportProgress.completed}/{referenceImportProgress.total} validated references…
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsReferenceImportOpen(false)}
                disabled={Boolean(referenceImportProgress)}
                className="border-white/15 bg-white/[0.02] text-white hover:bg-white/[0.06] hover:text-white"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleConfirmReferenceImport}
                disabled={
                  !referenceImportPreflight ||
                  referenceImportPreflight.ready.length === 0 ||
                  Boolean(referenceImportProgress)
                }
                className="bg-[var(--darkroom-accent,#B8956A)] text-black hover:bg-[var(--darkroom-accent,#B8956A)]/90"
              >
                {referenceImportProgress ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading…
                  </>
                ) : (
                  <>
                    <UploadCloud className="mr-2 h-4 w-4" />
                    Upload {referenceImportPreflight?.ready.length ?? 0} reference{referenceImportPreflight?.ready.length === 1 ? "" : "s"}
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
              These filenames don't equal any loaded <span className="font-mono">graceSku</span> for {familyName ?? "this family"}.
              Likely cause: websiteSku-style names, a catalog sync gap between Convex/Product Hub and Madison, or an unsupported Best Bottles filename pattern.
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

        {uncoveredSkus.length > 0 && hasAnyReferenceSource && (
          <div
            className="rounded border p-2 space-y-1"
            style={{
              borderColor: "rgba(148, 163, 184, 0.3)",
              background: "rgba(148, 163, 184, 0.05)",
            }}
          >
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider" style={{ color: "var(--darkroom-text-dim)" }}>
              <AlertCircle className="w-3 h-3" />
              {uncoveredSkus.length} SKU{uncoveredSkus.length === 1 ? "" : "s"} in this cohort have no matched reference
            </div>
            <div className="text-[10px] opacity-75" style={{ color: "var(--darkroom-text-dim)" }}>
              Generation for these stays blocked until a synced Pipeline reference or single-image override is attached.
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

        {selectedProduct && hasAnyReferenceSource && (
          <div
            className="text-[10px] flex items-center gap-1"
            style={{ color: availableReferenceForCurrentSku ? "var(--darkroom-success, #4ADE80)" : "var(--darkroom-text-dim)" }}
          >
            {availableReferenceForCurrentSku ? (
              <>
                <Check className="w-3 h-3" />
                Reference match for this SKU:{" "}
                <span className="font-mono">{availableReferenceForCurrentSku.name ?? selectedProduct.graceSku}</span>
                {folderMatchForCurrentSku ? (
                  <span className="opacity-70">(uploaded folder)</span>
                ) : (
                  <span className="opacity-70">(synced Pipeline)</span>
                )}
              </>
            ) : (
              <>
                <AlertCircle className="w-3 h-3" />
                No matched reference for this SKU — drop a single-image override below if needed
              </>
            )}
          </div>
        )}
        {selectedProduct && unusablePersistedReferenceForCurrentSku && !availableReferenceForCurrentSku && (
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
              <div className="font-medium">Synced reference exists but is not usable</div>
              <div className="opacity-90">
                {unusablePersistedReferenceForCurrentSku.issue} Use Scan folder, Pick files, or import the recovered PNG before generating.
              </div>
              <div className="mt-1 font-mono text-[10px] opacity-70">
                {unusablePersistedReferenceForCurrentSku.reference.name ?? selectedProduct.graceSku}
              </div>
            </div>
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

        <div className="space-y-2 pt-3 border-t" style={{ borderColor: "var(--darkroom-border-subtle)" }}>
          <Label className="text-xs uppercase tracking-wider" style={{ color: "var(--darkroom-text-dim)" }}>
            {specularityReferenceCopy.title}
          </Label>
          <UploadZone
            type="style"
            label={specularityReferenceCopy.dropLabel}
            description={specularityReferenceCopy.description}
            image={glassSpecularityReference}
            onUpload={handleGlassSpecularityReferencePicked}
            onRemove={() => setGlassSpecularityReference(null)}
            onLibraryOpen={() => setIsGlassLibraryOpen(true)}
            disabled={isUploadingGlassRef}
          />

          {isUploadingGlassRef && (
            <div className="flex items-center gap-2 text-[11px]" style={{ color: "var(--darkroom-text-muted)" }}>
              <Loader2 className="w-3 h-3 animate-spin" />
              {specularityReferenceCopy.uploading}
            </div>
          )}

          <ImageLibraryModal
            open={isGlassLibraryOpen}
            onOpenChange={setIsGlassLibraryOpen}
            onSelectImage={(img) => {
              handleGlassSpecularityReferencePicked(img);
              setIsGlassLibraryOpen(false);
            }}
            title={specularityReferenceCopy.modalTitle}
            libraryTagContainsAny={specularityLibraryTags}
          />
        </div>
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
              Generation is blocked until a usable reference is attached. Scan a folder
              named after Grace SKUs above, or upload a single PNG/JPG/WebP below.
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

      {hasAnyReferenceSource &&
        (matchedFamilyVariants.length > 1 ||
          allReferenceMatchedVariants.length > matchedFamilyVariants.length) && (
          <div className="space-y-2">
            {allReferenceMatchedVariants.length > matchedFamilyVariants.length && (
              <Button
                onClick={handleGenerateWholeFolder}
                disabled={isGenerating || batchProgress !== null}
	                variant="outline"
	                className="w-full border-white/15 bg-white/[0.02] text-white hover:bg-white/[0.06] hover:text-white"
	                title={`Generate masters for every matched synced/uploaded reference in the full family (${allReferenceMatchedVariants.length} variants).`}
              >
                {batchProgress ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating batch…
                  </>
                ) : (
	                  <>
	                    <Sparkles className="w-4 h-4 mr-2" />
	                    Generate full family refs ({allReferenceMatchedVariants.length})
	                  </>
	                )}
              </Button>
            )}
            {matchedFamilyVariants.length > 1 && (
              <Button
                onClick={handleGenerateAll}
                disabled={isGenerating || batchProgress !== null}
                variant="outline"
                className="w-full border-white/15 bg-white/[0.02] text-white hover:bg-white/[0.06] hover:text-white"
	                title={`Generate masters for every SKU in this current product group that has a matched reference (${matchedFamilyVariants.length} variants).`}
              >
                {batchProgress ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating batch…
                  </>
                ) : (
                  <>
	                    <Sparkles className="w-4 h-4 mr-2" />
	                    {allReferenceMatchedVariants.length > matchedFamilyVariants.length
	                      ? `Generate current group (${matchedFamilyVariants.length})`
	                      : `Generate all matched (${matchedFamilyVariants.length})`}
                  </>
                )}
              </Button>
            )}
	          </div>
	      )}

      <Dialog open={isBatchPreflightOpen} onOpenChange={setIsBatchPreflightOpen}>
        <DialogContent className="max-w-2xl border-white/10 bg-[#111113] text-white">
          <DialogHeader>
            <DialogTitle>Batch preflight</DialogTitle>
            <DialogDescription className="text-white/55">
              Confirm scope, blockers, and estimated GPT Image 2 cost before starting bulk generation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[10px] uppercase tracking-wider text-white/45">Batch scope</div>
                <div className="rounded border border-[var(--darkroom-accent,#B8956A)]/45 bg-[var(--darkroom-accent,#B8956A)]/15 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-[var(--darkroom-accent,#B8956A)]">
                  Selected: {selectedBatchScopeOption.label}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
              {BATCH_SCOPE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={batchScope === option.value}
                  aria-label={`Select batch scope: ${option.label}`}
                  onClick={() => setBatchScope(option.value)}
                  className={`rounded border p-3 text-left transition ${
                    batchScope === option.value
                      ? "border-[var(--darkroom-accent,#B8956A)] bg-[var(--darkroom-accent,#B8956A)]/15 text-white ring-1 ring-[var(--darkroom-accent,#B8956A)]"
                      : "border-white/10 bg-white/[0.02] text-white/65 hover:border-white/25 hover:text-white"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-medium">{option.label}</div>
                    {batchScope === option.value && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--darkroom-accent,#B8956A)]/45 bg-black/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--darkroom-accent,#B8956A)]">
                        <Check className="h-3 w-3" />
                        Selected
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-[10px] leading-snug opacity-70">{option.description}</div>
                </button>
              ))}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <BatchPreflightMetric label="SKU count" value={String(batchPreflightEntries.length)} />
              <BatchPreflightMetric label="Will generate" value={String(batchEligibleEntries.length)} tone="ok" />
              <BatchPreflightMetric label="Refs matched" value={`${batchReferenceMatchedCount}/${batchPreflightEntries.length}`} />
              <BatchPreflightMetric
                label="Blocked"
                value={String(batchBlockedCount)}
                tone={batchBlockedCount > 0 ? "warn" : "ok"}
              />
            </div>

            <div className="rounded border border-white/10 bg-white/[0.03] p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-white/45">Estimated OpenAI cost</div>
                  <div className="text-lg font-semibold">
                    {formatUsd(batchCostEstimate.total.min)}-{formatUsd(batchCostEstimate.total.max)}
                  </div>
                </div>
                <div className="text-right text-[10px] leading-snug text-white/45">
                  <div>{effectiveBatchResolution === "high" ? "High" : "Standard"} quality estimate</div>
                  <div>
                    {formatUsd(batchCostEstimate.perImage.min)}-{formatUsd(batchCostEstimate.perImage.max)} / image
                  </div>
                </div>
              </div>
              {masterAiProvider !== "openai-image-2" && (
                <div className="text-[10px] leading-snug text-amber-300">
                  Pricing shown is for GPT Image 2. The selected model is {selectedImageModel.label}.
                </div>
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-2 text-[11px]">
              <div className="rounded border border-white/10 bg-white/[0.02] p-3 space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-white/45">Scope contents</div>
                <div>Capacity: <span className="font-mono text-white/75">{batchCapacitySummary}</span></div>
                <div>Applicator: <span className="font-mono text-white/75">{batchApplicatorSummary}</span></div>
                <div>Color: <span className="font-mono text-white/75">{batchColorSummary}</span></div>
              </div>
              <div className="rounded border border-white/10 bg-white/[0.02] p-3 space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-white/45">Prompt policy summary</div>
                <div>Shared prompt: lighting, material, canvas, and brand style.</div>
                <div>Per SKU: capacity, dimensions, color, applicator, cap/trim, and reference.</div>
                {(batchHasMixedCapacity || batchHasMixedApplicator) && (
                  <div className="text-amber-300">
                    Mixed scope: avoid prompt text naming one capacity or applicator.
                  </div>
                )}
              </div>
            </div>

            {(batchMissingReferenceCount > 0 || batchInvalidReferenceCount > 0 || batchMeasurementBlockedCount > 0) && (
              <div className="rounded border border-amber-500/25 bg-amber-500/5 p-3 text-[11px] leading-snug text-amber-200">
                {batchMissingReferenceCount > 0 && (
                  <div>{batchMissingReferenceCount} SKU{batchMissingReferenceCount === 1 ? "" : "s"} omitted: no usable reference.</div>
                )}
                {batchInvalidReferenceCount > 0 && (
                  <div>{batchInvalidReferenceCount} SKU{batchInvalidReferenceCount === 1 ? "" : "s"} omitted: reference matched but is not fetchable/imported.</div>
                )}
                {batchMeasurementBlockedCount > 0 && (
                  <div>{batchMeasurementBlockedCount} SKU{batchMeasurementBlockedCount === 1 ? "" : "s"} omitted: missing measurements.</div>
                )}
              </div>
            )}

            {batchScope === "selected-skus" && (
              <div className="rounded border border-white/10 bg-white/[0.02] p-3 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-white/45">Selected SKU proof batch</div>
                    <div className="text-[11px] text-white/55">{selectedBatchSkuKeys.size} selected</div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => selectedProduct && selectBatchSkuSet([selectedProduct])}
                      className="h-7 px-2 text-[10px] text-white/65 hover:text-white"
                    >
                      Current SKU
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label="Select up to eight ready SKUs from the current applicator"
                      title="Selects up to eight ready SKUs from the current applicator."
                      onClick={() =>
                        selectBatchSkuSet(
                          currentApplicatorBatchCandidates
                            .filter(
                              (product) =>
                                lookupAvailableReference(product, presetId) !== null &&
                                getMeasurementIssue(product) === null,
                            )
                            .slice(0, 8),
                        )
                      }
                      className="h-7 px-2 text-[10px] text-white/65 hover:text-white"
                    >
                      Proof max 8
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => selectBatchSkuSet(currentApplicatorBatchCandidates)}
                      className="h-7 px-2 text-[10px] text-white/65 hover:text-white"
                    >
                      Current applicator
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedBatchSkuKeys(new Set())}
                      className="h-7 px-2 text-[10px] text-white/65 hover:text-white"
                    >
                      Clear
                    </Button>
                  </div>
                </div>
                <div className="max-h-56 overflow-auto space-y-1 pr-1">
                  {fullFamilyBatchCandidates.map((product) => {
                    const key = productBatchKey(product);
                    const reference = lookupAvailableReference(product, presetId);
                    const referenceIssue = getBestBottlesReferenceUrlIssue(reference?.url);
                    const measurementIssue = getMeasurementIssue(product);
                    const blocked = reference === null || referenceIssue !== null || measurementIssue !== null;
                    return (
                      <label
                        key={key}
                        className="flex items-start gap-2 rounded border border-white/[0.06] bg-black/15 p-2 text-[11px]"
                      >
                        <Checkbox
                          checked={selectedBatchSkuKeys.has(key)}
                          onCheckedChange={(checked) => toggleSelectedBatchSku(product, checked === true)}
                          className="mt-0.5"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block font-mono text-white/80">{product.graceSku}</span>
                          <span className="block truncate text-white/45">
                            {product.capacityMl ? `${product.capacityMl} ml · ` : ""}
                            {product.applicator ?? "Unspecified applicator"}
                            {product.capColor ? ` · ${product.capColor}` : ""}
                          </span>
                        </span>
                        {blocked && (
                          <span className="text-[10px] text-amber-300">
                            {measurementIssue ? "Needs measurements" : "Needs usable ref"}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsBatchPreflightOpen(false)}
              className="border-white/15 bg-white/[0.02] text-white hover:bg-white/[0.06] hover:text-white"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleConfirmBatchPreflight}
              disabled={batchEligibleEntries.length === 0 || isGenerating || batchProgress !== null}
              className="bg-[var(--darkroom-accent,#B8956A)] text-black hover:bg-[var(--darkroom-accent,#B8956A)]/90"
            >
              Generate {batchEligibleEntries.length} image{batchEligibleEntries.length === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {familyVariants && hasAnyReferenceSource && measurementBlockedSkus.length > 0 && (
        <div className="text-[10px] leading-snug" style={{ color: "#F87171" }}>
          {measurementBlockedSkus.length} SKU{measurementBlockedSkus.length === 1 ? "" : "s"} omitted from batch until measured.
        </div>
      )}
      {hasAnyReferenceSource && allReferenceMeasurementBlockedSkus.length > measurementBlockedSkus.length && (
        <div className="text-[10px] leading-snug" style={{ color: "#F87171" }}>
          {allReferenceMeasurementBlockedSkus.length} family SKU{allReferenceMeasurementBlockedSkus.length === 1 ? "" : "s"} omitted from batch until measured.
        </div>
      )}

      <div className="flex gap-2">
        <Button
          onClick={handleGenerate}
          disabled={isGenerating || batchProgress !== null || !customReference?.url || customReferenceIssue !== null}
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
            {customReferenceIssue
              ? "The selected reference is not usable yet. Import or upload a public PNG, JPG, or WebP before generating."
              : customReference?.url
                ? "Click Generate master to produce this SKU with the attached product reference."
                : unusablePersistedReferenceForCurrentSku
                  ? "A synced reference candidate exists, but it is not fetchable yet. Import or upload the recovered PNG before generating."
                  : "Add a product reference before generating this SKU."}
          </span>
        </div>
      )}
    </div>
  );
}

function BatchPreflightMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
}) {
  return (
    <div
      className={`rounded border bg-white/[0.02] p-2 ${
        tone === "ok"
          ? "border-emerald-500/25"
          : tone === "warn"
            ? "border-amber-500/25"
            : "border-white/10"
      }`}
    >
      <div className="text-[9px] uppercase tracking-wider text-white/45">{label}</div>
      <div className="mt-1 truncate text-sm font-medium text-white">{value}</div>
    </div>
  );
}

function ReferenceImportIssueList({
  title,
  entries,
}: {
  title: string;
  entries: ReferenceImportEntry[];
}) {
  return (
    <div className="rounded border border-amber-500/20 bg-amber-500/[0.04] p-2">
      <div className="mb-1 text-[10px] uppercase tracking-wider text-amber-200">
        {title} · {entries.length}
      </div>
      <div className="max-h-36 space-y-1 overflow-auto">
        {entries.length === 0 ? (
          <div className="text-[11px] text-white/35">None</div>
        ) : (
          entries.slice(0, 30).map((entry) => (
            <div key={`${title}-${entry.relativePath}`} className="text-[10px] leading-snug">
              <div className="truncate font-mono text-amber-100/90">{entry.name}</div>
              {entry.reason && <div className="text-amber-100/55">{entry.reason}</div>}
            </div>
          ))
        )}
        {entries.length > 30 && (
          <div className="text-[10px] text-amber-100/45">+{entries.length - 30} more</div>
        )}
      </div>
    </div>
  );
}
