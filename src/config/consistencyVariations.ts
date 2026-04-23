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
   *
   * IDs mirror FITMENT_TYPES below and the Convex products.applicator enum.
   */
  compatibleFitments?: Array<
    | "fine-mist-metal"
    | "fine-mist-plastic"
    | "perfume-spray-pump"
    | "lotion-pump"
    | "roller-ball"
    | "roller-ball-plastic"
    | "vintage-bulb-sprayer"
    | "vintage-bulb-sprayer-tassel"
    | "reducer"
    | "dropper"
    | "glass-stopper"
    | "cap-closure"
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
      "The BOTTLE BODY is crystal clear flint glass — fully transparent and colourless with high transparency. Render true three-dimensional glass volume: visible light refraction through the walls, a sense of thickness and depth at the shoulder and base, defined edges catching a faint rim-highlight so the silhouette reads clearly (not a cut-out), and a subtle caustic light pattern where the key light bends through the bottle onto the backdrop. Include a faint mould seam down one side of the body and subtle tooling marks at the base — real-glass micro-imperfections. NOT metallic. The CAP remains exactly as specified in the CAP section below; do not tint or recolour the cap.",
    swatch: "#EDEDE8",
  },
  {
    id: "frosted",
    label: "Frosted",
    prompt:
      "The BOTTLE BODY is frosted glass — matte acid-etched finish across the entire body, soft translucent white with a gentle interior glow where the key light passes through the surface. The frosted treatment is on the glass itself (etched from the outside), not a paint coating. Light diffuses softly through the walls rather than refracting sharply; the edges still catch a faint rim-highlight so the silhouette is defined. Include a faint mould seam and base tooling marks like a real pressed-glass bottle. NOT metallic. The CAP remains exactly as specified in the CAP section below; the cap is NOT frosted.",
    swatch: "#E4E1DB",
  },
  {
    id: "blue",
    label: "Cobalt Blue",
    prompt:
      "The BOTTLE BODY is deep cobalt blue glass — jewel-toned, richly saturated blue tint integrated throughout the glass, still transparent with visible depth-of-tint (darker where the glass is thicker at the shoulder and base). Render true glass volume: crisp edge-rim-highlights, visible light refraction through the coloured glass, and a subtle blue-tinted caustic cast on the backdrop where the key light bends through the bottle. Include a faint mould seam and base tooling marks. NOT metallic. The CAP remains exactly as specified in the CAP section below; the cap is NOT blue.",
    swatch: "#1E3A8A",
  },
  {
    id: "amber",
    label: "Amber",
    prompt:
      "The BOTTLE BODY is warm amber glass — honey-brown apothecary tint integrated throughout the glass, transparent with rich colour depth (deeper amber where the glass is thicker at the shoulder and base). Render true glass volume: crisp edge-rim-highlights, visible light refraction through the coloured glass, and a warm honey-tinted caustic cast on the backdrop where the key light bends through the bottle. Include a faint mould seam and base tooling marks. NOT metallic. The CAP remains exactly as specified in the CAP section below; the cap is NOT amber.",
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
    compatibleFitments: ["fine-mist-metal", "fine-mist-plastic", "lotion-pump", "vintage-bulb-sprayer", "vintage-bulb-sprayer-tassel"],
  },
  {
    id: "shiny-black",
    label: "Shiny Black",
    prompt:
      "high-gloss black phenolic plastic cap with a very bright polished lacquered finish, deep jet-black, sharp specular highlights characteristic of premium moulded phenolic resin — NOT metal, but a glossy plastic cap with a near-piano-black sheen",
    swatch: "#0B0B0B",
    compatibleFitments: ["roller-ball", "roller-ball-plastic", "vintage-bulb-sprayer", "vintage-bulb-sprayer-tassel"],
  },
  {
    id: "white",
    label: "White",
    prompt:
      "soft-matte white phenolic plastic cap with a clean even moulded surface, neutral bright white, premium high-quality phenolic resin construction — NOT metal, a moulded plastic cap with a low-sheen finish",
    swatch: "#EFEDE8",
    compatibleFitments: ["roller-ball", "roller-ball-plastic", "vintage-bulb-sprayer", "vintage-bulb-sprayer-tassel"],
  },
  {
    id: "turquoise",
    label: "Turquoise",
    prompt:
      "glossy turquoise phenolic plastic cap with a rich aqua-teal tone and smooth reflective lacquered surface, premium high-quality phenolic resin construction — NOT metal, a moulded plastic cap with a crisp jewel-tone finish",
    swatch: "#2EA3A6",
    compatibleFitments: ["fine-mist-metal", "fine-mist-plastic", "vintage-bulb-sprayer", "vintage-bulb-sprayer-tassel"],
  },
  {
    id: "red",
    label: "Red",
    prompt:
      "glossy red phenolic plastic cap with a rich true-red tone and smooth reflective lacquered surface, premium high-quality phenolic resin construction — NOT metal, a moulded plastic cap with a lipstick-gloss finish",
    swatch: "#B52A26",
    compatibleFitments: ["fine-mist-metal", "fine-mist-plastic", "vintage-bulb-sprayer", "vintage-bulb-sprayer-tassel"],
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
    compatibleFitments: ["fine-mist-metal", "fine-mist-plastic", "vintage-bulb-sprayer", "vintage-bulb-sprayer-tassel"],
  },
  {
    id: "shiny-silver",
    label: "Shiny Silver",
    prompt:
      "high-gloss silver phenolic plastic cap with a bright mirror-like metallised finish, cool neutral silver tone, crisp but slightly softened highlights, premium high-quality moulded phenolic resin with a polished silver metallised coating — NOT metal; reads as polished silver in catalog photography but is moulded plastic, so the specular highlights are clean yet slightly diffused compared to true chrome",
    swatch: "#D1D4D9",
    compatibleFitments: ["fine-mist-metal", "fine-mist-plastic", "perfume-spray-pump", "roller-ball", "roller-ball-plastic", "vintage-bulb-sprayer", "vintage-bulb-sprayer-tassel"],
  },
  {
    id: "matte-silver",
    label: "Matte Silver",
    prompt:
      "matte silver phenolic plastic cap with a muted non-reflective metallic silver appearance, cool muted silver-grey tone, soft-touch finish, premium high-quality moulded phenolic resin with a matte metallised coating — NOT metal; reads as a brushed-matte silver metallic cap but is moulded plastic, so highlights are very subtle and diffuse",
    swatch: "#8F9398",
    compatibleFitments: ["roller-ball", "roller-ball-plastic", "lotion-pump", "vintage-bulb-sprayer", "vintage-bulb-sprayer-tassel"],
  },
  {
    id: "shiny-gold",
    label: "Shiny Gold",
    prompt:
      "high-gloss gold phenolic plastic cap with a bright polished metallised finish, warm yellow-gold tone, crisp but slightly softened highlights, premium high-quality moulded phenolic resin with a polished gold metallised coating — NOT metal; reads as polished gold in catalog photography but is moulded plastic, so the specular highlights are clean yet slightly diffused compared to true machined metal",
    swatch: "#C9A24B",
    compatibleFitments: ["fine-mist-metal", "fine-mist-plastic", "perfume-spray-pump", "roller-ball", "roller-ball-plastic", "lotion-pump", "vintage-bulb-sprayer", "vintage-bulb-sprayer-tassel"],
  },
  {
    id: "matte-gold",
    label: "Matte Gold",
    prompt:
      "matte gold phenolic plastic cap with a muted non-reflective metallic gold appearance, warm muted gold tone, soft-touch finish, premium high-quality moulded phenolic resin with a matte gold metallised coating — NOT metal; reads as a brushed-matte gold metallic cap but is moulded plastic, so highlights are very subtle and diffuse",
    swatch: "#9E7E3D",
    compatibleFitments: ["roller-ball", "roller-ball-plastic", "vintage-bulb-sprayer", "vintage-bulb-sprayer-tassel"],
  },
  {
    id: "matte-copper",
    label: "Matte Copper",
    prompt:
      "matte copper phenolic plastic cap with a muted non-reflective metallic copper appearance, warm orange-bronze tone, soft-touch finish, premium high-quality moulded phenolic resin with a matte copper metallised coating — NOT metal; reads as a brushed-matte copper metallic cap but is moulded plastic, so highlights are very subtle and diffuse",
    swatch: "#B26F44",
    compatibleFitments: ["roller-ball", "roller-ball-plastic", "vintage-bulb-sprayer", "vintage-bulb-sprayer-tassel"],
  },
  // ─── Decorated caps — rhinestone-studded phenolic plastic ──────────────
  //
  // The "dots" on Best Bottles' dotted caps are small silver-metallic
  // rhinestones / studs physically embedded around the cap in a regular
  // pattern — NOT flat printed dots. Each stud catches light as a tiny
  // sharp sparkle against the cap's base colour. Three colourways:
  // black base, silver base, pink base — all studded with silver.
  {
    id: "black-silver-dots",
    label: "Black with Silver Dots",
    prompt:
      "glossy black phenolic plastic cap studded with a regular pattern of small round silver-metallic rhinestones/studs physically embedded across the surface, arranged in neat evenly-spaced rows around the cap; the base is deep jet-black high-gloss moulded phenolic resin, and each tiny rhinestone catches light with a distinct bright pinpoint sparkle highlight. Premium high-quality moulded phenolic resin — NOT metal; the rhinestone studs are physical three-dimensional embellishments, not a flat printed pattern.",
    swatch: "#1A1A1A",
    compatibleFitments: ["roller-ball", "roller-ball-plastic", "vintage-bulb-sprayer", "vintage-bulb-sprayer-tassel"],
  },
  {
    id: "silver-silver-dots",
    label: "Silver with Silver Dots",
    prompt:
      "satin silver phenolic plastic cap studded with a regular pattern of small round silver-metallic rhinestones/studs physically embedded across the surface, arranged in neat evenly-spaced rows around the cap; the base is a soft brushed-looking silver moulded phenolic resin with a metallised finish, and each tiny rhinestone catches light with a distinct bright pinpoint sparkle highlight that reads slightly brighter than the cap body. Premium high-quality moulded phenolic resin — NOT metal; the rhinestone studs are physical three-dimensional embellishments, not a flat printed pattern.",
    swatch: "#C5C8CC",
    compatibleFitments: ["roller-ball", "roller-ball-plastic", "vintage-bulb-sprayer", "vintage-bulb-sprayer-tassel"],
  },
  {
    id: "pink-silver-dots",
    label: "Pink with Silver Dots",
    prompt:
      "soft muted-pink phenolic plastic cap studded with a regular pattern of small round silver-metallic rhinestones/studs physically embedded across the surface, arranged in neat evenly-spaced rows around the cap; the base is a warm rose-pink moulded phenolic resin with a satin finish, and each tiny rhinestone catches light with a distinct bright pinpoint sparkle highlight against the pink. Premium high-quality moulded phenolic resin — NOT metal; the rhinestone studs are physical three-dimensional embellishments, not a flat printed pattern.",
    swatch: "#D9A3B2",
    compatibleFitments: ["roller-ball", "roller-ball-plastic", "vintage-bulb-sprayer", "vintage-bulb-sprayer-tassel"],
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

/**
 * FITMENTS — Best Bottles canonical applicator list.
 *
 * Mirrors the `applicator` enum in the Convex products table so Madison
 * Studio variations map 1:1 onto real SKUs in the catalog. Each prompt
 * fragment describes the exposed fitment at the neck of the bottle when
 * uncapped; in assembled composition the cap sits over it.
 */
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
    id: "perfume-spray-pump",
    label: "Perfume Spray Pump",
    prompt: "perfume spray pump actuator with a crimped metal collar, slightly taller and heavier than a fine-mist sprayer, designed for larger-capacity cylinder bottles",
    swatch: "#A8A8A8",
  },
  {
    id: "lotion-pump",
    label: "Lotion Pump",
    prompt: "disc-top lotion pump dispenser with smooth-action actuator, personal-care grade",
    swatch: "#D6D1C4",
  },
  {
    id: "roller-ball",
    label: "Metal Roller Ball",
    prompt:
      "FITMENT is a polished stainless-steel roller-ball applicator seated in the bottle neck: the BALL is bright MIRROR-POLISHED STAINLESS STEEL — chrome-silver, reflective, metallic — and STAYS BRIGHT METALLIC STEEL REGARDLESS OF THE GLASS BODY COLOUR OR FINISH (even when the body is frosted, amber, cobalt, or swirl, the ball is NEVER dark, NEVER black, NEVER tinted, NEVER colour-matched to the body). Immediately below the steel ball, a small TRANSLUCENT CLEAR PLASTIC neck plug holds it in place; the plug is clear or very faintly frosted plastic, never dark, never coloured. Together the ball + plug form a classic perfume roll-on top.",
    swatch: "#B8BAB8",
  },
  {
    id: "roller-ball-plastic",
    label: "Plastic Roller Ball",
    prompt:
      "FITMENT is a plastic roller-ball applicator seated in the bottle neck: the BALL is MATTE WHITE PLASTIC — never dark, never tinted, never colour-matched to the glass body — with a colour-matched clear plastic neck plug below. Lightweight personal-care feel. Regardless of the bottle body material or colour, the ball stays matte white plastic.",
    swatch: "#D8D5CF",
  },
  {
    id: "vintage-bulb-sprayer",
    label: "Vintage Bulb Sprayer",
    prompt: "vintage-style squeeze-bulb atomizer fitment — a polished metal collar at the bottle neck with a braided hose leading to a small rubber/silk squeeze bulb; evokes classic apothecary perfumery",
    swatch: "#9E8D74",
  },
  {
    id: "vintage-bulb-sprayer-tassel",
    label: "Vintage Bulb Sprayer w/ Tassel",
    prompt: "vintage-style squeeze-bulb atomizer fitment with a decorative silk tassel attached at the metal collar — polished metal collar at the bottle neck, braided hose to the squeeze bulb, and a fine silk tassel adding a luxury apothecary accent",
    swatch: "#94805E",
  },
  {
    id: "reducer",
    label: "Reducer",
    prompt: "perfume reducer fitment — a small flow-limiting plastic insert seated inside the neck, producing a slow drip for splash application; visually a small translucent plastic reducer visible at the opening",
    swatch: "#E1DDD4",
  },
  {
    id: "dropper",
    label: "Dropper",
    prompt: "glass dropper fitment — a pipette-style glass tube with a rubber or silicone bulb on top, seated in the bottle neck via a threaded collar",
    swatch: "#CFCAC1",
  },
  {
    id: "glass-stopper",
    label: "Glass Stopper",
    prompt: "ground-glass stopper that plugs directly into the bottle neck with no external thread, apothecary-style, clear glass matching the body",
    swatch: "#E8E6E0",
  },
  {
    id: "cap-closure",
    label: "Cap / Closure",
    prompt: "plain screw-on closure cap with no spray/roller/pump mechanism; used for bottles sold for the customer to add their own fitment",
    swatch: "#BEB9AF",
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

// ─── Fitment grouping ────────────────────────────────────────────────────────
//
// The fitment axis has 13 options and selecting 2–3 from a long flat list is
// fatiguing. Grouping by shape family (sprayers, rollers, pumps, droppers,
// stoppers, caps) lets the operator scan a short section instead of reading
// every label. IDs below must stay in sync with FITMENT_TYPES.
//
// New fitment? Add its id to the map and it renders under the correct header
// automatically; nothing else to update.

export type FitmentCategory =
  | "sprayers"
  | "rollers"
  | "pumps"
  | "droppers"
  | "stoppers"
  | "caps";

export const FITMENT_CATEGORIES: Array<{
  id: FitmentCategory;
  label: string;
  helper: string;
}> = [
  { id: "sprayers", label: "Sprayers", helper: "fine mist + bulb" },
  { id: "rollers", label: "Roll-ons", helper: "metal + plastic ball" },
  { id: "pumps", label: "Pumps", helper: "lotion + treatment" },
  { id: "droppers", label: "Droppers", helper: "dropper + reducer" },
  { id: "stoppers", label: "Stoppers", helper: "glass stoppers" },
  { id: "caps", label: "Caps & closures", helper: "cap + overcap" },
];

const FITMENT_CATEGORY_MAP: Record<string, FitmentCategory> = {
  "fine-mist-metal": "sprayers",
  "fine-mist-plastic": "sprayers",
  "perfume-spray-pump": "sprayers",
  "vintage-bulb-sprayer": "sprayers",
  "vintage-bulb-sprayer-tassel": "sprayers",
  "lotion-pump": "pumps",
  "roller-ball": "rollers",
  "roller-ball-plastic": "rollers",
  dropper: "droppers",
  reducer: "droppers",
  "glass-stopper": "stoppers",
  "cap-closure": "caps",
  "over-cap": "caps",
};

export function getFitmentCategory(id: string): FitmentCategory {
  return FITMENT_CATEGORY_MAP[id] ?? "caps";
}

/**
 * Bucket fitment options by category in the canonical display order. Unknown
 * ids fall into "caps" so new fitments show up somewhere even before the
 * category map is updated.
 */
export function groupFitmentsByCategory(
  fitments: VariationOption[],
): Array<{
  category: FitmentCategory;
  label: string;
  helper: string;
  options: VariationOption[];
}> {
  const buckets = new Map<FitmentCategory, VariationOption[]>();
  for (const opt of fitments) {
    const cat = getFitmentCategory(opt.id);
    const arr = buckets.get(cat) ?? [];
    arr.push(opt);
    buckets.set(cat, arr);
  }
  return FITMENT_CATEGORIES.filter((c) => buckets.has(c.id)).map((c) => ({
    category: c.id,
    label: c.label,
    helper: c.helper,
    options: buckets.get(c.id)!,
  }));
}

// ─── Studio Controls ─────────────────────────────────────────────────────────
//
// Parameterised studio settings that feed into every variation's scene anchor.
// Three independent controls — Background, Light Direction, Shadow — let the
// operator fine-tune the "look" of the entire set without touching prompts.
//
// These replace the hardcoded off-white backdrop + 45° key light + "beneath"
// shadow in the previous UNIVERSAL_SCENE_RULES. Defaults preserve the prior
// behaviour exactly.

export interface BackgroundPreset {
  id: string;
  label: string;
  hex: string;
  description: string;
}

export interface LightDirectionPreset {
  id: string;
  label: string;
  description: string;
  /** Recommended shadow direction to pair with this light preset. */
  defaultShadowDirectionId: string;
  /** Recommended shadow intensity to pair with this light preset. */
  defaultShadowIntensityId: string;
}

export interface ShadowDirectionPreset {
  id: string;
  label: string;
  description: string;
}

export interface ShadowIntensityPreset {
  id: string;
  label: string;
  description: string;
}

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  {
    id: "bone",
    label: "Bone",
    hex: "#F5F3EF",
    description:
      "a warm off-white paper-like studio backdrop (hex #F5F3EF) with a faint natural paper grain, completely uncluttered and seamless — no gradient, no texture pattern",
  },
  {
    id: "cream",
    label: "Cream",
    hex: "#F2ECDF",
    description:
      "a soft cream studio backdrop (hex #F2ECDF) with a subtle natural warmth — slightly darker and warmer than bone, still completely seamless with no gradient",
  },
  {
    id: "warm-sand",
    label: "Warm Sand",
    hex: "#EBE3D5",
    description:
      "a warm sand-toned studio backdrop (hex #EBE3D5) with a gentle tan undertone that pairs well with amber and wood finishes — seamless, no gradient",
  },
  {
    id: "cool-bone",
    label: "Cool Bone",
    hex: "#EDECE8",
    description:
      "a cool-toned off-white studio backdrop (hex #EDECE8) with a slight grey undertone — flattering for cobalt and chrome-finish caps — seamless, no gradient",
  },
  {
    id: "studio-white",
    label: "Studio White",
    hex: "#FAFAF8",
    description:
      "a bright neutral studio-white backdrop (hex #FAFAF8) — nearly pure white with a hint of warmth, seamless and fully uncluttered",
  },
  {
    id: "charcoal",
    label: "Charcoal",
    hex: "#2A2A2C",
    description:
      "a deep charcoal studio backdrop (hex #2A2A2C) with a soft matte finish — used for dramatic high-contrast product shots; the lighting must rim-light the bottle strongly so it reads against the dark ground",
  },
];

export const DEFAULT_BACKGROUND_ID = "bone";

export const SHADOW_DIRECTIONS: ShadowDirectionPreset[] = [
  {
    id: "beneath",
    label: "Beneath",
    description:
      "a soft contact shadow pooled directly beneath the product with no cast extension — the bottle appears grounded with minimal shadow footprint",
  },
  {
    id: "n",
    label: "N · behind",
    description:
      "a cast shadow extending straight backward, away from the camera, behind the product",
  },
  {
    id: "ne",
    label: "NE",
    description:
      "a cast shadow extending diagonally backward and to the right, behind-right of the product",
  },
  {
    id: "e",
    label: "E · right",
    description:
      "a cast shadow extending directly to the right of the product, parallel to the ground plane",
  },
  {
    id: "se",
    label: "SE",
    description:
      "a cast shadow extending diagonally forward (towards the camera) and to the right, in front-right of the product",
  },
  {
    id: "s",
    label: "S · front",
    description:
      "a cast shadow extending directly towards the camera, falling in front of the product on the ground plane",
  },
  {
    id: "sw",
    label: "SW",
    description:
      "a cast shadow extending diagonally forward (towards the camera) and to the left, in front-left of the product",
  },
  {
    id: "w",
    label: "W · left",
    description:
      "a cast shadow extending directly to the left of the product, parallel to the ground plane",
  },
  {
    id: "nw",
    label: "NW",
    description:
      "a cast shadow extending diagonally backward and to the left, behind-left of the product",
  },
];

export const DEFAULT_SHADOW_DIRECTION_ID = "sw";

export const SHADOW_INTENSITIES: ShadowIntensityPreset[] = [
  {
    id: "soft",
    label: "Soft",
    description:
      "very soft and blurred at its edges, gradient falloff, approximately 25-30% opacity at its densest point directly under the base",
  },
  {
    id: "medium",
    label: "Medium",
    description:
      "a moderately soft edge with clearer presence, approximately 45-55% opacity at its densest point — defined enough to ground the product",
  },
  {
    id: "hard",
    label: "Hard",
    description:
      "a crisp sharper edge with strong definition, approximately 65-75% opacity at its densest point — implies a harder key light",
  },
];

export const DEFAULT_SHADOW_INTENSITY_ID = "soft";

export const LIGHT_DIRECTIONS: LightDirectionPreset[] = [
  {
    id: "classic-45",
    label: "Classic 45°",
    description:
      "a soft top-key light at a 45° angle from camera-right with a gentle fill from the left — the reference commercial-catalog lighting setup; the key light produces a smooth highlight running down the right edge of the bottle and a subtle wrap onto the left",
    defaultShadowDirectionId: "sw",
    defaultShadowIntensityId: "soft",
  },
  {
    id: "soft-top",
    label: "Soft Top",
    description:
      "a large soft overhead key light directly above the product with gentle wrap-around fill from both sides — flattering for tall bottles; produces an even cap highlight and a soft shoulder falloff down the body",
    defaultShadowDirectionId: "beneath",
    defaultShadowIntensityId: "soft",
  },
  {
    id: "dramatic-side",
    label: "Dramatic Side",
    description:
      "a harder key light from 90° camera-left with minimal right-side fill, creating strong side-light modelling, a bright left edge, and a defined falloff into shadow on the right of the bottle",
    defaultShadowDirectionId: "e",
    defaultShadowIntensityId: "hard",
  },
  {
    id: "backlit-halo",
    label: "Backlit Halo",
    description:
      "a key light placed behind and slightly above the product creating a bright rim-light halo around the silhouette of the bottle, with soft low-intensity front fill to keep the cap and body barely legible — produces a luminous glass glow especially on clear and amber bodies",
    defaultShadowDirectionId: "s",
    defaultShadowIntensityId: "medium",
  },
  {
    id: "flat-front",
    label: "Flat Front (Catalog)",
    description:
      "evenly diffused front lighting with no directional shadow modelling — the flat-catalog look used for maximum colour accuracy in pure e-commerce SKU photography; the bottle is lit evenly front-on with minimal highlight gradient",
    defaultShadowDirectionId: "beneath",
    defaultShadowIntensityId: "soft",
  },
  {
    id: "low-angle",
    label: "Low-Angle Drama",
    description:
      "a key light from a low angle at camera-right around 30° above the ground plane, creating elongated upward shadows on the body and a strong modelling of the bottle's volume — more editorial than catalog",
    defaultShadowDirectionId: "nw",
    defaultShadowIntensityId: "medium",
  },
];

export const DEFAULT_LIGHT_DIRECTION_ID = "classic-45";

/**
 * User-adjustable studio controls. Passed through the full generation pipeline
 * so every variation in a set shares the exact same lighting, background, and
 * shadow treatment — the whole point of Consistency Mode.
 */
export interface StudioSettings {
  backgroundId: string;
  lightDirectionId: string;
  shadowDirectionId: string;
  shadowIntensityId: string;
}

export const DEFAULT_STUDIO_SETTINGS: StudioSettings = {
  backgroundId: DEFAULT_BACKGROUND_ID,
  lightDirectionId: DEFAULT_LIGHT_DIRECTION_ID,
  shadowDirectionId: DEFAULT_SHADOW_DIRECTION_ID,
  shadowIntensityId: DEFAULT_SHADOW_INTENSITY_ID,
};

export function getBackgroundPreset(id: string): BackgroundPreset {
  return BACKGROUND_PRESETS.find((b) => b.id === id) ?? BACKGROUND_PRESETS[0];
}

export function getLightDirectionPreset(id: string): LightDirectionPreset {
  return LIGHT_DIRECTIONS.find((l) => l.id === id) ?? LIGHT_DIRECTIONS[0];
}

export function getShadowDirectionPreset(id: string): ShadowDirectionPreset {
  return SHADOW_DIRECTIONS.find((s) => s.id === id) ?? SHADOW_DIRECTIONS[0];
}

export function getShadowIntensityPreset(id: string): ShadowIntensityPreset {
  return SHADOW_INTENSITIES.find((s) => s.id === id) ?? SHADOW_INTENSITIES[0];
}

/**
 * Compose the studio portion of the scene anchor from the selected presets.
 * This block follows Google's recommended structure for Gemini 2.5 Flash Image:
 * the model's RLHF data maps onto "studio-lit product photograph of X on Y,
 * lighting is Z, camera angle is W, ultra-realistic with sharp focus on V."
 *
 * Using that canonical template instead of a keyword list measurably improves
 * realism and consistency across a set.
 */
function buildStudioAnchor(studio: StudioSettings): string {
  const bg = getBackgroundPreset(studio.backgroundId);
  const light = getLightDirectionPreset(studio.lightDirectionId);
  const shadowDir = getShadowDirectionPreset(studio.shadowDirectionId);
  const shadowInt = getShadowIntensityPreset(studio.shadowIntensityId);

  return [
    // Google's canonical Gemini 2.5 Flash Image product-photography frame:
    // "studio-lit product photograph of [X] on [Y]. Lighting is [Z] to [purpose].
    //  Camera angle is [W] to showcase [feature]. Ultra-realistic, sharp focus."
    `STUDIO BRIEF — a high-resolution studio-lit product photograph of the bottle on ${bg.description}.`,
    `The lighting is ${light.description}, designed to reveal the bottle's material, silhouette, and cap finish accurately.`,
    `The camera is an 85mm commercial product lens at f/8 aperture held straight-on at eye-level — sharp edge-to-edge focus across the entire bottle and cap.`,
    `Overall quality anchor: Hasselblad-grade commercial product photography, ultra-realistic, colour-accurate, neutral white-balance for e-commerce use.`,
    `Ground-shadow treatment: ${shadowDir.description}, rendered as ${shadowInt.description}. If the composition below calls for two objects (bottle + cap separately), each object has its own individual contact shadow using the same direction and intensity — never merge them into one shadow.`,
  ].join(" ");
}

/**
 * Universal material + reference-handling rules that apply to every shot in
 * every set. No parameters — these are invariants.
 */
const UNIVERSAL_MATERIAL_RULES = [
  // Realism + refraction (glass-specific)
  "Materials must read as real physical objects photographed in a real studio, not as a CG render and not as an AI-stylised illustration. For the glass BODY: crystal clear transparency with visible light refraction through the glass, subtle caustic light cast on the backdrop where light bends through the bottle, a faint rim-highlight along the edges of the glass so the silhouette is DEFINED rather than a cut-out, and tiny natural micro-imperfections (faint seam line down one side, subtle tooling marks near the base) that a real bottle would have.",
  // Cap behaviour (phenolic plastic, NOT metal)
  "For the CAP: premium moulded phenolic-plastic surface behaviour — softly diffused highlights rather than hard machined-metal specular hotspots, even when the cap's finish is metallic-looking gold, silver, or copper. The cap is NEVER chrome, NEVER polished steel — it is lacquered or metallised plastic with the characteristic slightly-softer reflectivity of moulded resin.",
  // Negative constraints
  "Do NOT add labels, branding, text, logos, packaging, or props. Do NOT over-saturate colour. Do NOT render chrome-metal sheen on the phenolic plastic cap. Do NOT add any second product to the scene.",
  // Reference-image role
  "The attached reference image is a SHAPE and PROPORTION guide only — use it to reproduce the bottle's silhouette, neck, shoulder, and overall geometry exactly. Do NOT copy the reference's colour or material literally; the final bottle material is determined by the VARIATION DETAILS below. The final image must always look like a freshly photographed studio shot, not a recoloured cut-out of the reference.",
  // Cap-protection rule
  "STRICT RULE: The cap's appearance is determined ONLY by the CAP description in the VARIATION DETAILS. Never apply the bottle-body material, pattern, colour, or finish to the cap. If no cap variation is specified, keep the cap identical to the reference image's cap.",
  // Fitment-protection rule (mirrors cap-protection — prevents body-colour
  // bleed onto the roller ball / sprayer / pump. Specifically addresses the
  // frosted-body → dark-ball artefact where the model extends the body's
  // muted/diffuse tone onto the metal ball.)
  "STRICT RULE: The fitment's appearance — ball colour, sprayer collar, pump actuator, etc. — is determined ONLY by the FITMENT description in the VARIATION DETAILS. The bottle-body's material, colour, finish, or diffusion NEVER bleeds onto the fitment. A metal roller ball stays BRIGHT MIRROR-POLISHED STAINLESS STEEL (chrome-silver, reflective) even when the body is frosted, amber, cobalt, or any coloured/diffuse glass. A plastic roller ball stays matte white. A metal sprayer collar stays bright metal. If no fitment variation is specified, keep the fitment identical to the reference image's fitment.",
].join(" ");

export interface CompositionPreset {
  id: CompositionId;
  label: string;
  helper: string;
  /** Used on the chip UI as a mini diagram cue. */
  icon: "bottle" | "exploded";
  /** Composition-specific framing rules prepended to the studio + material anchors. */
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
      "Product perfectly centred horizontally, base resting on the implied floor line at ~20% from the bottom of the frame.",
      "Product fills ~70% of the frame's vertical height.",
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
      "Both the BOTTLE and the CAP share the same implied floor line.",
      "Horizontal spacing: the cap is positioned approximately 25-30% of the frame width to the right of the bottle's vertical axis, at the same ground level as the bottle's base. The cap's top is roughly level with the bottle's shoulder (the cap is clearly smaller than the bottle).",
      "The bottle fills approximately 65-70% of the frame's vertical height; the cap is visibly smaller and to the right, consistent with its actual real-world size.",
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
 * Build the full scene anchor for a given composition + studio settings.
 * Combines composition framing, studio brief (Google canonical template),
 * and universal material + reference rules.
 */
export function buildSceneAnchor(
  compositionId?: CompositionId | null,
  studio: StudioSettings = DEFAULT_STUDIO_SETTINGS,
): string {
  const comp = getComposition(compositionId);
  return `${comp.framing} ${buildStudioAnchor(studio)} ${UNIVERSAL_MATERIAL_RULES}`;
}

/**
 * Back-compat export — older callers that imported the legacy constant
 * still get the Assembled framing with default studio settings.
 * Prefer `buildSceneAnchor(compositionId, studio)`.
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
  // Single-shot mode: no axis selected → render the master reference as-is.
  // Label reflects that instead of the generic "Variation".
  return parts.join(" · ") || "Master reference";
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
        // Zero-axis case emits a single master-reference-only combination
        // so "take one shot of the bottle as-is" is a first-class option.
        // Previously this was skipped, forcing the operator to tick at
        // least one chip even when no variation was wanted.
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
