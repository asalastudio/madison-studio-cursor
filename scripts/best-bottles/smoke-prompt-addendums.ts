export interface SmokePromptAddendum {
  id: string;
  text: string;
}

const CLEAR_GLASS_POLISH_ADDENDUM: SmokePromptAddendum = {
  id: "clear-glass-polish-v1",
  text: [
    "Material-only refinement for clear transparent glass:",
    "Render the bottle body as optically clean commercial product photography glass with crisp rim thickness, believable transparent sidewalls, and subtle specular glass response.",
    "Reduce internal haze, cloudy patches, painterly texture, noisy speckling, muddy gray wash, and milky fog inside the clear glass.",
    "Use natural studio reflections and edge definition only; do not create literal parallel highlight lines, drawn stripes, etched marks, or artificial contour bands.",
    "Preserve the existing product identity lock. Do not change geometry, silhouette, height, width, neck threads, roller ball, cap shape, cap position, detached-cap staging, canvas, baseline, scale, color, or shadow.",
    "No fog, no liquid, no glow, no frost unless present in the reference, no added labels, no added props, no redesigned hardware.",
  ].join("\n"),
};

const KINFOLK_AESOP_STUDIO_V2_ADDENDUM: SmokePromptAddendum = {
  id: "kinfolk-aesop-studio-v2",
  text: [
    "Strict studio-direction refinement for restrained premium ecommerce photography:",
    "Use the restrained studio product-photography sensibility associated with Kinfolk and Aesop only as a mood reference: quiet premium lighting, controlled material finish, clean restraint, subtle dimensional contact shadow, and refined ecommerce polish.",
    "This is not lifestyle photography. Do not add props, labels, packaging, typography, scenes, brand marks, retail environments, Aesop-style product design, or any brand-specific asset.",
    "The catalog contract remains absolute: preserve the exact 2080x2288 canvas, product fill-height target, shared baseline, centerline, crop, product scale, geometry, color, material, and component placement exactly as shown in the product reference.",
    "Shadow direction may become slightly more dimensional and premium, but it must remain one realistic contact-only shadow under the single assembled product base. No floor plane, reflection, hard cast shadow, smear, horizon, vignette, background texture, or shadow beneath an unreferenced component.",
    "The attached product reference remains the source of truth. Improve only light, glass clarity, cap material polish, and contact shadow realism.",
  ].join("\n"),
};

const COMPONENT_IDENTITY_LOCK_V1_ADDENDUM: SmokePromptAddendum = {
  id: "component-identity-lock-v1",
  text: [
    "COMPONENT IDENTITY LOCK (caps, rollers, fitments, sprayers):",
    "Every closure and applicator component in Image 1 is exact product identity, like a logo. This applies to the cap (attached or detached sidecar), roller ball and its fitment collar, fine-mist sprayer, lotion pump, antique bulb sprayer, hose, and tassel.",
    "Reproduce each component's exact geometry, proportions, color, finish (matte/satin/gloss), and material read from Image 1. Do not redesign, restyle, recolor, retexture, widen, narrow, or re-proportion any component.",
    "DECORATIVE PATTERN LOCK: if a component carries studs, crystals, dots, or any decorative pattern, reproduce the exact count, size, spacing, and row arrangement shown in Image 1. Do not add, remove, enlarge, reflow, or re-space decorative elements.",
    "Do not add gloss, specular highlight bands, reflections, chrome, or sheen that a component does not visibly show in Image 1. Matte stays matte. Satin stays satin.",
    "Roller balls keep their exact tone from Image 1 (dark steel stays dark; do not brighten to polished chrome). Fitment collars keep their frosted plastic read.",
    "Do not thicken, ring, or embellish the bottle base/foot beyond what Image 1 shows.",
    "ENHANCEMENT REMAINS WELCOME, SCOPED TO FIDELITY: improve resolution, pixel cleanliness, optical clarity of the clear glass, edge definition, natural studio light quality, and contact-shadow realism. Enhancement means a cleaner, higher-fidelity photograph of the exact same object — never a redesigned, upgraded, or idealized object.",
  ].join("\n"),
};

// component-identity-lock-v1 + the "Critical Glass Directive" distilled from the
// 2026-07-04 external GPT-interface study: clear glass must read as a real
// physical front surface (positive behavior list), never a blank cut-out.
// Composition/canvas language from that study is deliberately EXCLUDED — the
// framing profiles + rig postprocess are the canvas authority.
const COMPONENT_IDENTITY_GLASS_PRESENCE_V1_ADDENDUM: SmokePromptAddendum = {
  id: "component-identity-glass-presence-v1",
  text: [
    COMPONENT_IDENTITY_LOCK_V1_ADDENDUM.text,
    "",
    "CLEAR GLASS MATERIAL PRESENCE:",
    "When the bottle body is clear transparent glass, the front glass wall must read as a real physical surface — never a blank cut-out window, white rectangle, hollow outline, or flat lifeless void.",
    "Render subtle premium studio glass behavior on the clear body: faint frontal sheen, soft vertical studio-card reflections across the front wall, crisp sidewall edge highlights, slight edge darkening, slight natural refraction and optical distortion, believable wall thickness, the rear wall faintly visible through the front wall, rim glints on shoulder, neck, lip, threads, collar, and base, and dimensional transparent base rings.",
    "These must be natural photographic reflections: do not draw literal parallel stripes, hard painted bands, etched marks, or artificial contour lines.",
    "Keep the body empty, transparent, and colorless when the reference glass is clear: no liquid, no tint, no haze, no frost, no milky fill, no cloudy patches, no bubbles, no dust, no scratches, no speckles.",
    "Correct result: empty transparent glass with visible material presence. Incorrect result: blank white rectangle, missing front panel, cut-out window, or plastic-looking glass.",
    "This glass directive refines material rendering only — it never overrides the reference identity, the framing profile canvas authority, or the component identity lock above.",
  ].join("\n"),
};

// v2: tightened positive-cue hierarchy from the 2026-07-04 external prompt-
// governance study. Keeps the component identity lock, sharpens the glass block
// to positive optical targets, and adds the study's sharpest catch — the neck /
// thread region reading milky instead of transparent. Composition, canvas,
// baseline, centering, and capacity scale are DELIBERATELY ABSENT — those remain
// the framing-profile + rig postprocess authority (hardcoding a fixed fill %
// would destroy the graded 3/4/5/9ml capacity scale).
const COMPONENT_IDENTITY_GLASS_PRESENCE_V2_ADDENDUM: SmokePromptAddendum = {
  id: "component-identity-glass-presence-v2",
  text: [
    COMPONENT_IDENTITY_LOCK_V1_ADDENDUM.text,
    "",
    "CLEAR GLASS — POSITIVE OPTICAL TARGETS (material refinement only):",
    "When the body is clear glass, render it as real transparent glass: the background is visible through it, with believable wall thickness at sidewalls, shoulder, neck, and base.",
    "NECK AND THREAD REGION must read as crisp transparent glass with controlled refraction — never milky, bloomed, hazy, cloudy, or semi-opaque around the roller-ball collar and threads. This is the most common failure; keep that region clean and see-through.",
    "Show a faint frontal sheen, soft vertical studio-card edge reflections, crisp rim glints on lip, threads, shoulder and base, slight natural refraction, and the rear wall faintly visible through the front wall.",
    "Base rings read crisp, curved, transparent, and dimensional.",
    "Keep the body empty and colorless when the reference is clear: no liquid, tint, haze, frost, milky fill, bubbles, dust, or speckles.",
    "Edge reflections are natural photographic response — not drawn parallel rails, painted stripes, or etched lines.",
    "Correct: empty transparent glass with visible material presence and a clean transparent neck. Incorrect: blank cut-out window, milky/bloomed neck, or plastic-looking glass.",
    "This refines material and light only. It never overrides the reference identity, the framing-profile canvas authority, or the component identity lock above.",
  ].join("\n"),
};

// ── THE ONE SOURCE OF TRUTH (2026-07-04) ─────────────────────────────────────
// Built on the cap-lock-v1 foundation that empirically behaves (flush baseline,
// clean silhouette the rig can place). Adds back ONLY the single legitimate win
// from the glass-presence experiments — a clean transparent neck, no blank
// cutout — stated as RESTRAINT, not as optical effects. Everything that painted
// noise/cloudiness and (by blurring the silhouette) broke the rig's baseline /
// scale / centering placement is deliberately removed. Composition, canvas,
// baseline, scale, centering, and background stay owned by the framing profile
// + rig. Per-bottle-type swapping (fitment / cap / sprayer / applicator) is
// already handled upstream by the canon compiler + applicator rules.
const CYLINDER_TRUTH_V1_ADDENDUM: SmokePromptAddendum = {
  id: "cylinder-truth-v1",
  text: [
    "COMPONENT IDENTITY LOCK (caps, rollers, fitments, sprayers):",
    "Every closure and applicator in Image 1 is exact product identity, like a logo: cap (attached or detached sidecar), roller ball and fitment collar, fine-mist sprayer, lotion pump, antique bulb sprayer, hose, and tassel.",
    "Reproduce each component's exact geometry, proportions, color, finish (matte/satin/gloss), and material from Image 1. Do not redesign, restyle, recolor, retexture, resize, or re-proportion any component.",
    "Keep every component crisp and COMPLETE: no eroded, melted, dissolved, blurred, pitted, or broken edges on caps, sprayer heads, pumps, or collars. Small sprayer and pump mechanisms stay cleanly and fully defined.",
    "Decorative studs, crystals, or dots keep their exact count, size, spacing, and arrangement from Image 1 — do not add, remove, enlarge, or reflow them.",
    "Do not add gloss, specular bands, chrome, or sheen a component does not visibly show in Image 1. Matte stays matte. Roller balls keep their exact tone (dark steel stays dark; never polished chrome). Fitment collars keep their frosted plastic read.",
    "",
    "CLEAR GLASS — CLEAN AND RESTRAINED:",
    "When the body is clear glass, render optically clean, colorless transparent glass: the background is visible through it, with believable wall thickness at sidewalls, shoulder, neck, and base.",
    "The neck and thread region must read as clean transparent glass — never milky, cloudy, hazy, or bloomed around the collar and threads.",
    "Keep the glass genuinely clean: no internal haze, cloudiness, milky fill, gray wash, fog, speckling, noise, grain, bubbles, dust, or scratches.",
    "Highlights and reflections stay natural, soft, and minimal — believable studio response only. Do NOT draw parallel rails, painted stripes, etched lines, busy internal reflections, heavy refraction, or optical-distortion artifacts. Restraint over effect.",
    "",
    "ENHANCE FIDELITY, NOT DESIGN: improve resolution, pixel cleanliness, optical clarity, and edge definition. The result is a cleaner, higher-fidelity photograph of the exact same object in Image 1 — never a redesigned, upgraded, or idealized object.",
    "Preserve the reference identity. Baseline, product scale, centering, canvas, and background remain governed by the pipeline framing profile and rig — do not restage or re-scale the product.",
  ].join("\n"),
};

// truth-v2 (2026-07-05): adds an explicit component SURFACE-CLEANLINESS clause.
// truth-v1 forbade components being eroded/melted, but the model was still
// dirtying them — gray smudge / noise in white ribbed sprayer collars, haze on
// clear plastic overcaps. This closes that gap at the product level.
const CYLINDER_TRUTH_V2_ADDENDUM: SmokePromptAddendum = {
  id: "cylinder-truth-v2",
  text: [
    CYLINDER_TRUTH_V1_ADDENDUM.text,
    "",
    "COMPONENT SURFACE CLEANLINESS (brand-new unused retail product):",
    "Every closure, collar, sprayer head, pump, roller fitment, and cap keeps a clean, even, product-fresh surface. These are brand-new unused products — no wear, aging, dust, grime, fingerprints, or manufacturing marks.",
    "White and colored plastic components stay their exact even color with a clean surface — no gray smudging, dirt, discoloration, mottling, staining, streaking, or noise. White stays clean, even white.",
    "Ribbed or textured collars keep crisp, evenly-lit, evenly-colored grooves — no noise, speckling, grime, shadow-mottling, or dirt collecting between the ribs.",
    "Clear plastic covers and sprayer overcaps stay clean and optically clear — no haze, smudge, cloudiness, milkiness, or noise on or inside the cover.",
  ].join("\n"),
};

// 2026-09-20: a frosted bottle with a BARE NECK (plain cap, reducer, roll-on)
// came out as clear glass 5 of 5, while the same frosted glass under a sprayer,
// pump or dropper came out frosted 5 of 5 — on an identical prompt that already
// says to preserve the frosting and carries a frosted style reference. The neck
// of a frosted bottle really is clear glass, and with nothing covering it that
// is the strongest glass cue in a white-on-white reference. This states the
// finish of the body outright. It is a finish lock, not a glass-optics recipe:
// the 2026-07-05 A/B below retired every variant that tried to describe how
// glass should look, and this deliberately does not.
const FROSTED_BODY_CLEAR_NECK_V1_ADDENDUM: SmokePromptAddendum = {
  id: "frosted-body-clear-neck-v1",
  text: [
    "FROSTED GLASS FINISH LOCK:",
    "The BODY of this bottle is frosted glass: an even, matte, acid-etched, milky-white translucent surface, exactly as in the Product Reference. It is not clear glass.",
    "Only the threaded neck finish is clear glass. The clear neck does not make the body clear: the body is frosted from the shoulder to the base.",
    "A frosted body is not see-through. It shows no dark outline drawn along its walls, no visible rear wall, and no base rings seen through the glass. Its edges are soft tonal steps against the background.",
    "Do not render the body as clear, transparent, or only lightly hazed glass.",
  ].join("\n"),
};

const ADDENDUMS = new Map<string, SmokePromptAddendum>([
  [CLEAR_GLASS_POLISH_ADDENDUM.id, CLEAR_GLASS_POLISH_ADDENDUM],
  [KINFOLK_AESOP_STUDIO_V2_ADDENDUM.id, KINFOLK_AESOP_STUDIO_V2_ADDENDUM],
  [COMPONENT_IDENTITY_LOCK_V1_ADDENDUM.id, COMPONENT_IDENTITY_LOCK_V1_ADDENDUM],
  [COMPONENT_IDENTITY_GLASS_PRESENCE_V1_ADDENDUM.id, COMPONENT_IDENTITY_GLASS_PRESENCE_V1_ADDENDUM],
  [COMPONENT_IDENTITY_GLASS_PRESENCE_V2_ADDENDUM.id, COMPONENT_IDENTITY_GLASS_PRESENCE_V2_ADDENDUM],
  [CYLINDER_TRUTH_V1_ADDENDUM.id, CYLINDER_TRUTH_V1_ADDENDUM],
  [CYLINDER_TRUTH_V2_ADDENDUM.id, CYLINDER_TRUTH_V2_ADDENDUM],
  [FROSTED_BODY_CLEAR_NECK_V1_ADDENDUM.id, FROSTED_BODY_CLEAR_NECK_V1_ADDENDUM],
]);

// 2026-07-05: after a controlled A/B, component-identity-lock-v1 (the minimal
// identity lock) + the v6 reproduce-only canon is the LOCKED source of truth.
// Every glass-optical / "truth" variant below was tried and rejected — they
// muddied the identity→fidelity tiers and made the model invent rails/mottling.
// Retiring them so they hard-throw if anything tries to use them again.
const RETIRED_ADDENDUM_IDS = new Set([
  "kinfolk-aesop-studio-v1",
  "component-identity-glass-presence-v1",
  "component-identity-glass-presence-v2",
  "cylinder-truth-v1",
  "cylinder-truth-v2",
]);

export function getSmokePromptAddendum(id: string | undefined): SmokePromptAddendum | null {
  const normalizedId = id?.trim();
  if (!normalizedId) return null;

  if (RETIRED_ADDENDUM_IDS.has(normalizedId)) {
    throw new Error(
      `Retired Best Bottles smoke prompt addendum: ${normalizedId}. v1 was too loose; use kinfolk-aesop-studio-v2 or the promoted canon prompt instead.`,
    );
  }

  const addendum = ADDENDUMS.get(normalizedId);
  if (!addendum) {
    throw new Error(`Unknown Best Bottles smoke prompt addendum: ${normalizedId}`);
  }

  return addendum;
}

export function applySmokePromptAddendum(
  prompt: string,
  addendum: SmokePromptAddendum | null,
): string {
  if (!addendum) return prompt;

  return [
    prompt.trimEnd(),
    "",
    `TEST-ONLY MATERIAL POLISH ADDENDUM (${addendum.id}):`,
    addendum.text,
  ].join("\n");
}
