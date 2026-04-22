/**
 * Consistency Mode variation axes.
 *
 * Default taxonomy tuned for BestBottles.com (B2B perfume / personal-care
 * vessel supplier): bottle body + cap + fitment. The same schema can be
 * reused for other clients by extending the axis lists.
 *
 * Each value's `prompt` string is what gets injected into the generation
 * prompt as the VARIATION DETAILS line. Keep these short and specific —
 * one or two descriptive phrases — to avoid overwhelming the rest of the
 * locked-down scene description.
 */

export interface VariationOption {
  /** Stable identifier (used as React keys and to build descriptors). */
  id: string;
  /** User-facing label shown in the chip grid. */
  label: string;
  /** Prompt fragment injected into the generation call. */
  prompt: string;
  /** Optional swatch colour for the chip UI. */
  swatch?: string;
  /**
   * Which fitments this cap is actually offered with in the Best Bottles
   * cylinder family catalog. Used to soft-gate invalid combinations in the
   * UI (a spray fitment has fewer cap colours than a roll-on). When empty
   * or omitted, the cap is treated as universally available.
   */
  compatibleFitments?: Array<
    | "fine-mist-metal"
    | "fine-mist-plastic"
    | "lotion-pump"
    | "roller-ball"
    | "over-cap"
  >;
}

export interface VariationAxisConfig {
  id: VariationAxis;
  label: string;
  helper: string;
  options: VariationOption[];
}

export type VariationAxis = "bottleColor" | "capColor" | "fitmentType";

/**
 * BOTTLE MATERIALS — applied to the BOTTLE BODY ONLY.
 *
 * Each prompt is written with explicit "body only" scope plus a negation
 * clause (the cap must stay its own separate material). Without this,
 * Gemini tends to smear the body material onto the cap — especially for
 * distinctive finishes like swirl, which was landing on the gold cap
 * instead of the glass body in our first test run.
 *
 * All options describe the *glass material itself* (integrated into the
 * vessel), never a surface coating or external paint job.
 */
export const BOTTLE_COLORS: VariationOption[] = [
  {
    id: "clear",
    label: "Clear",
    prompt:
      "The BOTTLE BODY is clear flint glass — fully transparent, colourless, reveals anything inside. The glass has crystalline clarity, subtle edge refraction, a faint seam down the side of the body, and clean commercial-product highlights. The CAP remains exactly as specified in the CAP section below; do not tint or recolour the cap.",
    swatch: "#EDEDE8",
  },
  {
    id: "frosted",
    label: "Frosted",
    prompt:
      "The BOTTLE BODY is frosted glass — matte acid-etched finish across the entire body, soft translucent white, slight diffusion of any contents behind it. No shine, no gloss on the body surface. The CAP remains exactly as specified in the CAP section below; the cap is NOT frosted.",
    swatch: "#E4E1DB",
  },
  {
    id: "blue",
    label: "Cobalt Blue",
    prompt:
      "The BOTTLE BODY is deep cobalt blue glass — jewel-toned, richly saturated blue tint integrated throughout the glass, still transparent with deep colour. The CAP remains exactly as specified in the CAP section below; the cap is NOT blue.",
    swatch: "#1E3A8A",
  },
  {
    id: "amber",
    label: "Amber",
    prompt:
      "The BOTTLE BODY is warm amber glass — honey-brown apothecary tint integrated into the glass, transparent with rich colour. The CAP remains exactly as specified in the CAP section below; the cap is NOT amber.",
    swatch: "#9A5A1C",
  },
  {
    id: "swirl",
    label: "Swirl",
    prompt:
      "The BOTTLE BODY is swirl-fluted clear glass — diagonal helical flutes (rounded ribs and grooves) are physically moulded into the surface of the glass, running at approximately a 45-degree angle and spiralling around the entire body from shoulder to base. The glass itself is FULLY CLEAR AND COLOURLESS — do not tint, do not frost, do not add any colour. The 'swirl' effect comes entirely from the SPIRAL FLUTE TEXTURE in the glass surface: each smoothly rounded groove catches light to form bright curved highlights, with darker channels between them, creating a classical pressed-glass look like a traditional Italian perfume bottle or an antique ribbed tumbler. The flutes are regularly spaced and wrap the full circumference of the body. The texture stops cleanly at the shoulder of the bottle and does NOT extend onto the neck or cap. The CAP remains exactly as specified in the CAP section below: the cap is a simple smooth metal or wood cap as specified, NOT fluted, NOT ribbed, NOT patterned, NOT textured, NOT decorated.",
    swatch: "#D6D2CB",
  },
];

/**
 * CAP FINISHES — Best Bottles cylinder family.
 *
 * CRITICAL MATERIAL NOTE: every cap below is PHENOLIC PLASTIC (a premium
 * moulded thermosetting resin), NOT metal. Caps that look gold, silver, or
 * copper are plastic with a metallised / lacquered finish — they should
 * read as high-end metallic caps but with slightly softer highlights than
 * true polished metal, because they are in fact moulded plastic. Every
 * prompt states this explicitly so Gemini does not default to rendering
 * hard machined-metal specular behaviour.
 *
 * The `compatibleFitments` array lists the fitments the cap is actually
 * offered with in the Best Bottles cylinder catalog. When a user selects
 * a fitment, the UI should soft-gate the caps to the intersecting set.
 */
export const CAP_COLORS: VariationOption[] = [
  // ─── Solid colour caps ─────────────────────────────────────────────────
  {
    id: "black",
    label: "Black",
    prompt:
      "glossy black phenolic plastic cap with a smooth reflective moulded surface, deep neutral black, premium high-quality phenolic resin construction — the cap is NOT metal, it is moulded phenolic plastic with a polished lacquered finish; highlights are clean but slightly softer than true polished metal",
    swatch: "#1E1E1E",
    compatibleFitments: ["fine-mist-metal", "fine-mist-plastic", "lotion-pump"],
  },
  {
    id: "shiny-black",
    label: "Shiny Black",
    prompt:
      "high-gloss black phenolic plastic cap with a very bright polished lacquered finish, deep jet-black, sharp specular highlights characteristic of premium moulded phenolic resin — NOT metal, but a glossy plastic cap with a near-piano-black sheen",
    swatch: "#0B0B0B",
    compatibleFitments: ["roller-ball"],
  },
  {
    id: "white",
    label: "White",
    prompt:
      "soft-matte white phenolic plastic cap with a clean even moulded surface, neutral bright white, premium high-quality phenolic resin construction — NOT metal, a moulded plastic cap with a low-sheen finish",
    swatch: "#EFEDE8",
    compatibleFitments: ["roller-ball"],
  },
  {
    id: "turquoise",
    label: "Turquoise",
    prompt:
      "glossy turquoise phenolic plastic cap with a rich aqua-teal tone and smooth reflective lacquered surface, premium high-quality phenolic resin construction — NOT metal, a moulded plastic cap with a crisp jewel-tone finish",
    swatch: "#2EA3A6",
    compatibleFitments: ["fine-mist-metal", "fine-mist-plastic"],
  },
  {
    id: "red",
    label: "Red",
    prompt:
      "glossy red phenolic plastic cap with a rich true-red tone and smooth reflective lacquered surface, premium high-quality phenolic resin construction — NOT metal, a moulded plastic cap with a lipstick-gloss finish",
    swatch: "#B52A26",
    compatibleFitments: ["fine-mist-metal", "fine-mist-plastic"],
  },
  // ─── Metallic-look caps (still phenolic plastic) ───────────────────────
  //
  // Every one of these is moulded phenolic plastic with a metallised or
  // highly lacquered finish that READS as metal in a product photo. The
  // prompts say so explicitly so Gemini doesn't render mechanical-metal
  // surface physics (sharp machined specular hotspots, hairline machining
  // marks, etc.).
  {
    id: "satin-silver",
    label: "Satin Silver",
    prompt:
      "satin silver phenolic plastic cap with a soft brushed-looking metallic silver appearance, cool neutral silver tone, a finish between fully matte and fully glossy, premium high-quality moulded phenolic resin with a metallised coating — NOT metal; the cap reads as a silver metallic cap in catalog photography but is in fact moulded plastic, so highlights are softly diffused rather than sharply specular",
    swatch: "#B6B9BC",
    compatibleFitments: ["fine-mist-metal", "fine-mist-plastic"],
  },
  {
    id: "shiny-silver",
    label: "Shiny Silver",
    prompt:
      "high-gloss silver phenolic plastic cap with a bright mirror-like metallised finish, cool neutral silver tone, crisp but slightly softened highlights, premium high-quality moulded phenolic resin with a polished silver metallised coating — NOT metal; reads as polished silver in catalog photography but is moulded plastic, so the specular highlights are clean yet slightly diffused compared to true chrome",
    swatch: "#D1D4D9",
    compatibleFitments: ["fine-mist-metal", "fine-mist-plastic", "roller-ball"],
  },
  {
    id: "matte-silver",
    label: "Matte Silver",
    prompt:
      "matte silver phenolic plastic cap with a muted non-reflective metallic silver appearance, cool muted silver-grey tone, soft-touch finish, premium high-quality moulded phenolic resin with a matte metallised coating — NOT metal; reads as a brushed-matte silver metallic cap but is moulded plastic, so highlights are very subtle and diffuse",
    swatch: "#8F9398",
    compatibleFitments: ["roller-ball", "lotion-pump"],
  },
  {
    id: "shiny-gold",
    label: "Shiny Gold",
    prompt:
      "high-gloss gold phenolic plastic cap with a bright polished metallised finish, warm yellow-gold tone, crisp but slightly softened highlights, premium high-quality moulded phenolic resin with a polished gold metallised coating — NOT metal; reads as polished gold in catalog photography but is moulded plastic, so the specular highlights are clean yet slightly diffused compared to true machined metal",
    swatch: "#C9A24B",
    compatibleFitments: ["fine-mist-metal", "fine-mist-plastic", "roller-ball", "lotion-pump"],
  },
  {
    id: "matte-gold",
    label: "Matte Gold",
    prompt:
      "matte gold phenolic plastic cap with a muted non-reflective metallic gold appearance, warm muted gold tone, soft-touch finish, premium high-quality moulded phenolic resin with a matte gold metallised coating — NOT metal; reads as a brushed-matte gold metallic cap but is moulded plastic, so highlights are very subtle and diffuse",
    swatch: "#9E7E3D",
    compatibleFitments: ["roller-ball"],
  },
  {
    id: "matte-copper",
    label: "Matte Copper",
    prompt:
      "matte copper phenolic plastic cap with a muted non-reflective metallic copper appearance, warm orange-bronze tone, soft-touch finish, premium high-quality moulded phenolic resin with a matte copper metallised coating — NOT metal; reads as a brushed-matte copper metallic cap but is moulded plastic, so highlights are very subtle and diffuse",
    swatch: "#B26F44",
    compatibleFitments: ["roller-ball"],
  },
  // ─── Decorated caps — dot / pattern motifs (phenolic plastic base) ─────
  //
  // Dots are a surface decoration (printed or applied) on a phenolic cap —
  // NOT three-dimensional rhinestones. Prompts describe them as flat or
  // slightly raised round dots rather than faceted crystals.
  {
    id: "black-silver-dots",
    label: "Black with Silver Dots",
    prompt:
      "glossy black phenolic plastic cap with an even pattern of small round silver dots applied across the surface, deep jet-black base with bright metallic-silver dot motif, premium high-quality moulded phenolic resin — NOT metal; dots are a surface decoration (flat or very slightly raised applied circles), not faceted rhinestones or embedded crystals",
    swatch: "#1A1A1A",
    compatibleFitments: ["roller-ball"],
  },
  {
    id: "pink-dots",
    label: "Pink with Dots",
    prompt:
      "soft muted-pink phenolic plastic cap with an even pattern of small round contrasting dots applied across the surface, warm rose-pink base with delicate dot motif, premium high-quality moulded phenolic resin with a satin finish — NOT metal; dots are a surface decoration (flat or very slightly raised applied circles), not faceted rhinestones or embedded crystals",
    swatch: "#D9A3B2",
    compatibleFitments: ["roller-ball"],
  },
  // ─── Natural-material caps (kept for completeness across families) ─────
  {
    id: "natural-wood",
    label: "Natural Wood",
    prompt:
      "natural light-wood cap with a fine vertical grain visible through a matte-sealed surface, warm neutral wood tone — this cap is real wood with a satin seal, not phenolic plastic",
    swatch: "#B08B5E",
    // No compatibleFitments set — wood caps are cross-family, used where
    // explicitly specified in the source catalog.
  },
];

export const FITMENT_TYPES: VariationOption[] = [
  {
    id: "fine-mist-metal",
    label: "Metal Fine Mist",
    prompt: "metal fine-mist sprayer atomizer with crimped metal collar, perfume-grade",
    swatch: "#B0B0B0",
  },
  {
    id: "fine-mist-plastic",
    label: "Plastic Fine Mist",
    prompt: "plastic fine-mist sprayer atomizer in a colour-matched plastic collar, perfume-grade",
    swatch: "#D4D0C8",
  },
  {
    id: "lotion-pump",
    label: "Lotion Pump",
    prompt: "disc-top lotion pump dispenser with smooth-action actuator, personal-care grade",
    swatch: "#D6D1C4",
  },
  {
    id: "roller-ball",
    label: "Roller Ball",
    prompt: "stainless-steel roller-ball applicator seated in the bottle neck, polished finish",
    swatch: "#B8BAB8",
  },
  {
    id: "over-cap",
    label: "Over Cap",
    prompt: "solid over-cap that fully covers the neck and fitment, no exposed sprayer",
    swatch: "#9E9B93",
  },
];

export const VARIATION_AXES: VariationAxisConfig[] = [
  {
    id: "bottleColor",
    label: "Bottle Material",
    helper: "Glass finish — applied to the body only. Shape is preserved from the master reference.",
    options: BOTTLE_COLORS,
  },
  {
    id: "capColor",
    label: "Cap Finish",
    helper: "Phenolic plastic cap colour / finish. Caps shown match the selected fitment's real catalog lineup.",
    options: CAP_COLORS,
  },
  {
    id: "fitmentType",
    label: "Fitment",
    helper: "Sprayer, pump, roller, or over-cap.",
    options: FITMENT_TYPES,
  },
];

/**
 * Soft-gate: given a selected fitment (or multiple fitments), return the cap
 * options that are actually offered with that fitment in the Best Bottles
 * cylinder catalog. Caps with no `compatibleFitments` field are always
 * returned (treated as cross-fitment).
 *
 * UI guidance: if the user has selected one or more fitments in the same
 * run, filter the cap chips through this helper so they can't pick
 * "Turquoise" on a roll-on (the Best Bottles cylinder family doesn't
 * actually offer that SKU, so generating it would produce an image that
 * can't be sold).
 */
export function capsForFitments(
  fitmentIds: Array<VariationOption["id"]>,
): VariationOption[] {
  if (fitmentIds.length === 0) return CAP_COLORS;
  const ids = new Set(fitmentIds);
  return CAP_COLORS.filter((cap) => {
    if (!cap.compatibleFitments || cap.compatibleFitments.length === 0) {
      return true;
    }
    return cap.compatibleFitments.some((f) => ids.has(f));
  });
}

/** Hard safety cap on set size — keeps a single run under ~5 minutes. */
export const MAX_VARIATION_SET_SIZE = 50;

/**
 * Shared language appended to every variation in a set regardless of
 * composition — the "universal" rules that prevent reference-image
 * literalism and cap-bleed. Composition-specific framing (where the bottle
 * sits, whether the cap is on or off, etc.) lives in the individual
 * CONSISTENCY_COMPOSITIONS below.
 */
const UNIVERSAL_SCENE_RULES = [
  "Seamless off-white studio backdrop (#F5F3EF), no gradient, no texture.",
  "Soft top-key lighting at a 45° angle from camera-right, gentle fill from the left.",
  "No labels, no branding, no text, no packaging, no props.",
  "Crisp commercial-catalog clarity, true-to-life material rendering — glass transparency and refraction for the BODY, and premium moulded phenolic-plastic surface behaviour for the CAP (softly diffused highlights rather than hard machined-metal specular hotspots, even when the cap has a metallic-looking finish).",
  // Reference-image role
  "The attached reference image is a SHAPE and PROPORTION guide only — use it to reproduce the bottle's silhouette, neck, shoulder, and overall geometry exactly. Do NOT copy the reference's colour or material literally; the final bottle material is determined by the VARIATION DETAILS below. The final image must always look like a freshly photographed studio shot, not a recoloured cut-out of the reference.",
  // Global cap-protection rule
  "STRICT RULE: The cap's appearance is determined ONLY by the CAP description in the VARIATION DETAILS. Never apply the bottle-body material, pattern, colour, or finish to the cap. If no cap variation is specified, keep the cap identical to the reference image's cap.",
].join(" ");

export interface CompositionPreset {
  id: CompositionId;
  label: string;
  helper: string;
  /** Used on the chip UI as a mini diagram cue. */
  icon: "bottle" | "exploded";
  /** Composition-specific framing rules prepended to UNIVERSAL_SCENE_RULES. */
  framing: string;
}

export type CompositionId = "assembled" | "exploded-uncapped";

export const CONSISTENCY_COMPOSITIONS: CompositionPreset[] = [
  {
    id: "assembled",
    label: "Assembled",
    helper: "Fully capped bottle, centered hero.",
    icon: "bottle",
    framing: [
      "COMPOSITION — ASSEMBLED HERO:",
      "E-commerce hero product shot for a luxury perfume / personal-care grid tile.",
      "The bottle is fully assembled with the cap on.",
      "Camera: straight-on eye-level, product perfectly centred horizontally, base resting on the implied floor line at ~20% from the bottom of the frame.",
      "Product fills ~70% of the frame's vertical height.",
      "Subtle soft contact shadow directly beneath the base of the product — not a cast shadow.",
    ].join(" "),
  },
  {
    id: "exploded-uncapped",
    label: "Exploded",
    helper: "Uncapped bottle + cap standing upright beside it.",
    icon: "exploded",
    framing: [
      "COMPOSITION — SIMPLE EXPLODED PRODUCT LAYOUT:",
      "Clean, catalog-style product arrangement. NO creative staging, NO artistic tilts, NO dramatic angles, NO lifestyle flourishes. Think standard e-commerce SKU photo of two parts laid out for the customer to see both.",
      "The BOTTLE stands UPRIGHT, slightly LEFT of the frame's horizontal centre, with the CAP REMOVED so the fitment at the top of the neck is fully visible (match whatever fitment is implied by the master reference or the FITMENT variation — roller-ball applicator, sprayer actuator, lotion pump, etc.).",
      "The CAP stands UPRIGHT IN ITS NATURAL ORIENTATION to the RIGHT of the bottle — opening-side DOWN, resting on its circular opening rim exactly the way a cap naturally sits on a flat surface. Do NOT lay the cap on its side. Do NOT tilt the cap. Do NOT show the cap's inside cavity. Do NOT pose the cap creatively. The cap is simply standing beside the bottle as if someone unscrewed it and set it down.",
      "Both the BOTTLE and the CAP share the same implied floor line with their own individual soft contact shadow directly beneath each — two separate contact shadows, not a merged shadow.",
      "Horizontal spacing: the cap is positioned approximately 25-30% of the frame width to the right of the bottle's vertical axis, at the same ground level as the bottle's base. The cap's top is roughly level with the bottle's shoulder (the cap is clearly smaller than the bottle).",
      "The bottle fills approximately 65-70% of the frame's vertical height; the cap is visibly smaller and to the right, consistent with its actual real-world size.",
      "Camera: straight-on eye-level, no creative angles.",
      "IMPORTANT: There is exactly ONE bottle and exactly ONE cap in the frame — never duplicate the product.",
    ].join(" "),
  },
];

export const DEFAULT_COMPOSITION_ID: CompositionId = "assembled";

export function getComposition(id?: CompositionId | null): CompositionPreset {
  const found = CONSISTENCY_COMPOSITIONS.find((c) => c.id === id);
  return found ?? CONSISTENCY_COMPOSITIONS[0];
}

/**
 * Build the full scene anchor for a given composition. Combines the
 * composition-specific framing with the universal rules that apply to every
 * shot in the set.
 */
export function buildSceneAnchor(compositionId?: CompositionId | null): string {
  const comp = getComposition(compositionId);
  return `${comp.framing} ${UNIVERSAL_SCENE_RULES}`;
}

/**
 * Back-compat export — older callers that imported the legacy constant
 * still get the Assembled framing by default. Prefer `buildSceneAnchor()`.
 */
export const CONSISTENCY_SCENE_ANCHOR = buildSceneAnchor("assembled");

/**
 * Build the VARIATION DETAILS line sent with every generation in the set.
 * Only the selected axes contribute — axes the user didn't tick are omitted
 * so the master reference image drives them.
 *
 * Each section is clearly labelled ("BOTTLE BODY:", "CAP:", "FITMENT:") so
 * the model can attach the right material to the right element. These labels
 * are referenced by name in CONSISTENCY_SCENE_ANCHOR's cap-protection rule.
 */
export function buildVariationDescriptor(selection: {
  bottleColor?: VariationOption;
  capColor?: VariationOption;
  fitmentType?: VariationOption;
}): string {
  const parts: string[] = [];
  if (selection.bottleColor) parts.push(`BOTTLE BODY: ${selection.bottleColor.prompt}`);
  if (selection.capColor) parts.push(`CAP: ${selection.capColor.prompt}`);
  if (selection.fitmentType) parts.push(`FITMENT: ${selection.fitmentType.prompt}`);
  return parts.join(" ");
}

/**
 * Build a short human-readable label for a variation, used as the
 * `variation_descriptor` column in the DB and as the card title in the
 * results grid.
 */
export function buildVariationLabel(selection: {
  bottleColor?: VariationOption;
  capColor?: VariationOption;
  fitmentType?: VariationOption;
}): string {
  const parts: string[] = [];
  if (selection.bottleColor) parts.push(selection.bottleColor.label);
  if (selection.capColor) parts.push(selection.capColor.label);
  if (selection.fitmentType) parts.push(selection.fitmentType.label);
  return parts.join(" · ") || "Variation";
}

/**
 * Expand the user's chip selection into the full Cartesian product of
 * combinations. Axes with zero selections are treated as "no variation on
 * this axis" (omitted from descriptor — the master reference drives them).
 */
export function expandVariationMatrix(selected: {
  bottleColor: VariationOption[];
  capColor: VariationOption[];
  fitmentType: VariationOption[];
}): Array<{
  bottleColor?: VariationOption;
  capColor?: VariationOption;
  fitmentType?: VariationOption;
}> {
  const bottleAxis = selected.bottleColor.length ? selected.bottleColor : [undefined];
  const capAxis = selected.capColor.length ? selected.capColor : [undefined];
  const fitmentAxis = selected.fitmentType.length ? selected.fitmentType : [undefined];

  const out: Array<{
    bottleColor?: VariationOption;
    capColor?: VariationOption;
    fitmentType?: VariationOption;
  }> = [];

  for (const b of bottleAxis) {
    for (const c of capAxis) {
      for (const f of fitmentAxis) {
        // If the user selected nothing at all, skip (caller should validate).
        if (!b && !c && !f) continue;
        out.push({
          bottleColor: b,
          capColor: c,
          fitmentType: f,
        });
      }
    }
  }

  return out;
}
