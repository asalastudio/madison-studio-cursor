/**
 * One ordered image prompt for Dark Room.
 *
 * Priority is brand, then product, then shot type, then style. System text,
 * negative prompts, refine-prompt-template output, and default suffixes are
 * constraints: they may add a non-conflicting clause, and they may not
 * override a higher layer.
 *
 * Best Bottles brand text matches the product photography on the live
 * wholesale site (www.bestbottles.com, fetched 2026-10-09): isolated bottles
 * on a pure white field, even catalog light, no lifestyle set, and no
 * invented label. The site's navy/green/orange page chrome is not painted
 * onto the product.
 */

export type PromptLayerName =
  | "brand"
  | "product"
  | "shotType"
  | "style"
  | "system"
  | "negative"
  | "refine"
  | "suffix";

export interface OrderedImagePromptInput {
  /** Org visual-standards text. Kept only where it does not fight the brand. */
  brandNotes?: string;
  product?: string;
  /** Label copy that actually exists on the product record. Never a product name. */
  suppliedLabelText?: string;
  shotType?: string;
  style?: string;
  system?: string;
  negative?: string;
  refine?: string;
  suffix?: string;
}

export interface PromptDrop {
  layer: PromptLayerName;
  reason: string;
  excerpt: string;
}

export interface OrderedImagePromptResult {
  prompt: string;
  order: PromptLayerName[];
  dropped: PromptDrop[];
  log: string;
}

export const OPENAI_IMAGE_MODEL_ID = "gpt-image-2.5-flare";
export const OPENAI_IMAGE_QUALITY = "high";

/**
 * Product photography observed on https://www.bestbottles.com/ :
 * category tiles such as images/home/roll_on_bottles.jpg sit on #FFFFFF,
 * bottles are isolated and front-facing, and banners are separate from the
 * product cutout. Page chrome (navy #2C487F, green #345613, orange #FF8400,
 * Verdana) is the website, not the photograph.
 */
export const BEST_BOTTLES_LIVE_SITE_BRAND_PROMPT = [
  "BEST BOTTLES PRODUCT PHOTOGRAPH.",
  "Photorealistic wholesale catalog photograph of one glass bottle, closure, or jar, matching the isolated product cutouts on www.bestbottles.com.",
  "Background: seamless pure white #FFFFFF. Not a warm plate, not parchment, not a lifestyle room, not a colored field.",
  "Lighting: soft even studio light and one short soft contact shadow. Even illumination. No moody dark scene, no chiaroscuro, no dramatic deep contrast, no golden hour.",
  "Presentation: one centered product, front view, the full object visible, the closure exactly as the product record describes it. No props, hands, banners, phone numbers, or sales-flyer chrome.",
  "Do not paint the website chrome onto the photo. No navy frame, no green field, no orange banner.",
  "Medium: a real photograph. Not an illustration, not a painting, not CGI.",
  "Do not invent labels, text, logos, wordmarks, volume claims, or scent names on the glass, cap, or background.",
  "Product names and SKUs are identity metadata. They are not text to render.",
  "Native catalog framing is a square or upright product tile. Do not switch the frame to an ultrawide banner, a landscape hero, or a vertical story crop.",
].join(" ");

const LAYER_ORDER: PromptLayerName[] = [
  "brand",
  "product",
  "shotType",
  "style",
  "system",
  "negative",
  "refine",
  "suffix",
];

interface ConflictRule {
  id: string;
  established: RegExp;
  drop: RegExp;
}

const CONFLICTS: ConflictRule[] = [
  {
    id: "white-background",
    established: /pure white|#FFFFFF/i,
    drop: /bone background|parchment background|#F5F3EF|do not use pure white|avoid pure white|never use pure white|negative:\s*clinical,\s*pure white/i,
  },
  {
    id: "even-light",
    established: /even illumination|soft even studio/i,
    drop: /moody dark|chiaroscuro|dramatic lighting,\s*deep contrast|dramatic shadows|golden hour|direct flash|hard light/i,
  },
  {
    id: "photograph",
    established: /photorealistic|real photograph/i,
    drop: /illustration style|painterly|digital paint|flat design|oil paint/i,
  },
  {
    id: "no-chrome",
    established: /no navy frame/i,
    drop: /navy border|navy banner|beauty packaging experts|\bnavy\b/i,
  },
  {
    id: "no-invented-text",
    established: /do not invent labels/i,
    drop: /eau de parfum|print the brand name|add a label|wordmark|100 ml|100ml/i,
  },
  {
    id: "catalog-frame",
    established: /do not switch the frame/i,
    drop: /\b21:9\b|\b16:9\b|\b9:16\b|--ar\b/i,
  },
  {
    id: "no-lifestyle",
    established: /not a lifestyle room|isolated product/i,
    drop: /lifestyle setting|lived-in|cozy real-world|window light|environmental storytelling/i,
  },
];

function sentencesOf(text: string | undefined): string[] {
  if (!text) return [];
  // Keep "No. 4" intact so a supplied label stays one clause. Do not treat
  // every short word (such as "com") as an abbreviation.
  const protectedText = text.replace(/\b(No|Mr|Mrs|Ms|Dr|St|Jr|Sr|vs|etc|ml|oz)\.\s+/gi, "$1.\u0000");
  return protectedText
    .split(/\n+|(?<=[.])\s+/)
    .map((part) => part.replace(/\u0000/g, " ").replace(/\s+/g, " ").trim())
    .filter((part) => part.length > 0);
}

function normalized(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9#]+/g, " ").trim();
}

function conflictReason(sentence: string, kept: string[]): string | null {
  const blob = kept.join("\n");
  for (const rule of CONFLICTS) {
    if (rule.id === "no-invented-text" && /supplied label, rendered exactly/i.test(sentence)) {
      continue;
    }
    if (rule.established.test(blob) && rule.drop.test(sentence)) {
      return rule.id;
    }
  }
  return null;
}

function remember(
  layer: PromptLayerName,
  text: string | undefined,
  kept: string[],
  seen: Set<string>,
  dropped: PromptDrop[],
): void {
  for (const sentence of sentencesOf(text)) {
    const key = normalized(sentence);
    if (!key) continue;
    if (seen.has(key)) {
      dropped.push({ layer, reason: "duplicate", excerpt: sentence.slice(0, 180) });
      continue;
    }
    const reason = conflictReason(sentence, kept);
    if (reason) {
      dropped.push({ layer, reason, excerpt: sentence.slice(0, 180) });
      continue;
    }
    seen.add(key);
    kept.push(sentence.endsWith(".") ? sentence : `${sentence}.`);
  }
}

export function suppliedLabelClause(suppliedLabelText: string | undefined): string {
  const label = suppliedLabelText?.replace(/\s+/g, " ").trim();
  if (!label) {
    return "No label text was supplied, so the product and background stay free of writing.";
  }
  return `The only text allowed anywhere in the image is this supplied label, rendered exactly: ${label}.`;
}

export function buildOrderedImagePrompt(
  input: OrderedImagePromptInput,
): OrderedImagePromptResult {
  const kept: string[] = [];
  const seen = new Set<string>();
  const dropped: PromptDrop[] = [];

  remember("brand", BEST_BOTTLES_LIVE_SITE_BRAND_PROMPT, kept, seen, dropped);
  remember("brand", input.brandNotes, kept, seen, dropped);
  remember("product", input.product, kept, seen, dropped);
  remember("product", suppliedLabelClause(input.suppliedLabelText), kept, seen, dropped);
  remember("shotType", input.shotType, kept, seen, dropped);
  remember("style", input.style, kept, seen, dropped);
  remember("system", input.system, kept, seen, dropped);
  remember("negative", input.negative, kept, seen, dropped);
  remember("refine", input.refine, kept, seen, dropped);
  remember("suffix", input.suffix, kept, seen, dropped);

  const prompt = kept.join("\n");
  const log = JSON.stringify({
    event: "ordered-image-prompt",
    model: OPENAI_IMAGE_MODEL_ID,
    quality: OPENAI_IMAGE_QUALITY,
    order: LAYER_ORDER,
    kept: kept.length,
    dropped: dropped.map((item) => ({
      layer: item.layer,
      reason: item.reason,
      excerpt: item.excerpt,
    })),
  });

  return { prompt, order: LAYER_ORDER, dropped, log };
}

export function buildBestBottlesOnBrandPrompt(
  input: Omit<OrderedImagePromptInput, never> = {},
): OrderedImagePromptResult {
  return buildOrderedImagePrompt(input);
}

const CONTRADICTION_PAIRS: Array<[string, RegExp, RegExp]> = [
  ["white vs bone", /pure white|#FFFFFF/, /#F5F3EF|bone background|parchment background/i],
  ["even vs moody", /even illumination/, /moody dark|chiaroscuro|dramatic lighting,\s*deep contrast/i],
  ["photo vs illustration", /photorealistic/, /illustration style|painterly/i],
  ["catalog vs banner", /do not switch the frame/i, /\b21:9\b|\b16:9\b|\b9:16\b/],
  ["no invented label", /do not invent labels/, /EAU DE PARFUM|BEST BOTTLES EAU/i],
];

/** Returns the first pair that is present together, or null when the prompt is consistent. */
export function findPromptContradiction(prompt: string): string | null {
  for (const [name, left, right] of CONTRADICTION_PAIRS) {
    if (left.test(prompt) && right.test(prompt)) return name;
  }
  return null;
}

/** Drops that mean the caller asked for a scene the catalog layer cannot honour. */
const SCENE_CONFLICT_REASONS = new Set(["no-lifestyle", "white-background", "even-light"]);

export interface BestBottlesCatalogPromptDecisionInput {
  productReferenceCount: number;
  backgroundReferenceCount: number;
  styleReferenceCount: number;
  lane: string | null;
  dropped: PromptDrop[];
}

export interface BestBottlesCatalogPromptDecision {
  useCatalogPrompt: boolean;
  reason: string;
}

/**
 * The Best Bottles catalog prompt describes ONE isolated product on pure
 * white. Use it only for that shot. Multi-product composites, set/style
 * references, lighting-lane passes, and prompts whose scene the catalog layer
 * would delete go to the Director/Essential prompts instead.
 */
export function bestBottlesCatalogPromptDecision(
  input: BestBottlesCatalogPromptDecisionInput,
): BestBottlesCatalogPromptDecision {
  if (input.productReferenceCount > 1) return { useCatalogPrompt: false, reason: "multi-product-composite" };
  if (input.backgroundReferenceCount > 0) return { useCatalogPrompt: false, reason: "set-reference" };
  if (input.styleReferenceCount > 0) return { useCatalogPrompt: false, reason: "style-reference" };
  if (input.lane) return { useCatalogPrompt: false, reason: `lighting-lane-${input.lane}` };
  const sceneDrop = input.dropped.find(
    (drop) => (drop.layer === "shotType" || drop.layer === "style") && SCENE_CONFLICT_REASONS.has(drop.reason),
  );
  if (sceneDrop) return { useCatalogPrompt: false, reason: `scene-requested:${sceneDrop.reason}` };
  return { useCatalogPrompt: true, reason: "catalog-shot" };
}
