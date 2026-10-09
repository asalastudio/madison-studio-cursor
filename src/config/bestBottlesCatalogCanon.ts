/**
 * Best Bottles — Canonical Image-Enhancement Prompt Module  (v3.2 — 2026-06-29)
 *
 * AUTHORITATIVE SINGLE SOURCE OF TRUTH for the Best Bottles catalog image-to-image
 * ENHANCEMENT prompt that governs all 2,300+ catalog product images.
 *
 * This was vendored into madison-app (forked verbatim from v3.2, 2026-06-29) from the
 * external Best Bottles pipeline module
 *   Best-Bottles-Website-.../pipeline/aios-shopify-pdp-images/prompt-template.mjs
 * to remove a fragile out-of-repo relative import. From now on THIS file is the canon;
 * the external pipeline should consume/mirror this copy, not the other way around. If the
 * two ever need to change, change it here first and re-sync the pipeline repo.
 *
 * Clear-glass v3.2 keeps only essential identity/material truth before the final v2 studio
 * direction. Framing is injected by Madison (buildFinalPrompt in bestBottlesPromptPreflight.ts)
 * BETWEEN the base block and the studio direction, so v2 remains the final controlling
 * instruction.
 *
 * Decisions baked in (2026-06-24):
 *   - Liquid policy:  EMPTY (no liquid).  -> no LIQUID_FILL block, assembly unchanged.
 *   - Bone hex:       #F5F3EF (canonical for this aios pipeline + QA gate).
 *
 * Assembly:
 *   clear glass:     [PRESERVE, CLEAR_GLASS, STUDIO_DIRECTION, FINAL_V2_STUDIO_CHECK].join("\n\n")
 *   other materials: [PRESERVE, KEEP_MATERIAL, STUDIO_DIRECTION, FINAL_V2_STUDIO_CHECK].join("\n\n")
 *
 * API call:
 *   gpt-image-2.5-flare, POST /v1/images/edits (image-to-image), reference as image[],
 *   size "auto" (native 10:11; fallback 2048x2048), quality "high", background "opaque".
 *   NOTE: the /edits endpoint exposes NO strength/denoise knob. The only unused lever is
 *   `input_fidelity` (high|low); the provider does not currently send it.
 */

export const BEST_BOTTLES_CATALOG_CANON_VERSION = "v3.2-2026-06-29";

// ── PRESERVE  (identity lock) ──────────────────────────────────────────────────
export const PRESERVE = `You are enhancing the attached product reference image into a premium photorealistic ecommerce product photograph.

The reference image is the source of truth for product identity and geometry. Preserve the exact bottle silhouette, proportions, neck, threads, roller ball, sprayer, pump, collar, cap, detached cap, tassel, applicator, and all hardware exactly as shown. Do not redesign, recolor, resize, reposition, duplicate, remove, or add any product component.

This is not a new product design. It is a photographic material-and-lighting enhancement of the existing product.`;

// ── CLEAR_GLASS  (v3 photoreal material target) ─────────────────────────────────
export const CLEAR_GLASS = `PRIMARY GOAL:
Make the clear glass look like real luxury product-photography glass: transparent, colorless, optically clean, premium, dimensional, and specular.

The bottle is empty clear glass. There is no liquid, tint, frosting, haze, cloudy white fill, residue, bubbles, dust, speckles, noisy sidewalls, or insert inside the bottle. The background should be visible through the glass with natural refraction and slight optical displacement.

GLASS APPEARANCE:
Render the glass using believable real-studio optical behavior:

- Crisp transparent outer edges.
- Visible wall thickness at the sidewalls, shoulder, neck, and base.
- Clean rim glints on the lip, shoulder, threads, and base rings.
- Subtle edge density where the glass overlaps itself.
- Natural refraction through the front and back walls.
- The rear wall of the bottle should be faintly visible through the front wall.
- The internal dip tube, if present in the reference, should remain faintly visible through the glass and slightly refracted.
- The base should show clear curved glass geometry, transparent thickness, and crisp circular base rings.

The glass should be defined by clean studio-card reflections and natural specular behavior, not by drawn lines, artificial parallel rails, painted texture, cloudy fill, or sidewall noise. Keep the mid-body mostly transparent and quiet while preserving crisp rim, shoulder, thread, edge, and base definition.`;

export const MODEL_OWNED_GROUNDING_SHADOW = `GROUNDING SHADOW — MODEL OWNED:
Render one soft, clearly visible contact shadow attached directly to the bottle base. It must be darkest and most concentrated at the physical contact line, approximately 32–42% opacity at its densest point, then feather softly behind and toward camera-right, fading within approximately 20–30% of the bottle's width. The contact core and extended feather must read as one continuous shadow. One soft key light creates one soft-edged shadow. No detached oval, gap beneath the bottle, hard outline, long dramatic cast, doubled shadow, reflection, floor plane, smear, or horizon.`;

// ── KEEP_MATERIAL  (Change 6 applied) ───────────────────────────────────────────
export const KEEP_MATERIAL = `GLASS: preserve the glass's exact color, tint, frosting, and/or swirl pattern EXACTLY as shown in the reference — do not change, lighten, recolor, clear, or flatten it. Render it as believable glass of that exact appearance, with highlights and depth appropriate to its material (soft and translucent for frosted; deep, saturated and glossy for colored; the swirl pattern intact for swirl). The bottle is empty — no liquid; the glass color is the glass itself. For colored glass (cobalt, amber, green): the glass color is saturated, deep, and the dominant visual identity of the bottle. Preserve the exact hue and chroma shown in the reference — do not desaturate, gray out, wash, or shift the color. Cross-polarized capture deepens the apparent saturation; apply that effect. For frosted glass: the surface diffuses light, the color of the glass itself is muted and milky, and sharp specular highlights are suppressed in favor of soft, broad highlights across the frosted surface. For swirl glass: the swirl pattern must remain visible and intact, with the denser swirls reading as more saturated and the thinner swirls reading as more transparent — render the variation, not a uniform pattern.`;

// ── STUDIO_DIRECTION  (approved Kinfolk/Aesop v2 production mood anchor) ────────
export const STUDIO_DIRECTION = `STUDIO DIRECTION:
Strict studio-direction refinement for restrained premium ecommerce photography:
Use the restrained studio product-photography sensibility associated with Kinfolk and Aesop only as a mood reference: quiet premium lighting, clean restraint, and a subtle dimensional contact shadow.
This is not lifestyle photography. Do not add props, labels, packaging, typography, scenes, brand marks, retail environments, Aesop-style product design, or any brand-specific asset.
The catalog contract remains absolute: preserve the exact 2080x2288 canvas, product fill-height target, shared baseline, centerline, crop, product scale, detached-cap sidecar position, geometry, color, material, and component placement.
Shadow direction may become slightly more dimensional and premium, but it must remain one realistic contact-only shadow under the bottle base and any detached cap. No floor plane, reflection, hard cast shadow, smear, horizon, vignette, or background texture.
Preserve the photographed surface texture, translucency, edge density, tonal variation, highlights, and imperfections of every cap, actuator, collar, fitment, and detached sidecar exactly as shown in the Product Reference. Studio direction may change only the illumination falling on those components, never their material finish or surface character.
The attached Product Reference remains the source of truth. Changes are limited to scene lighting, the specified glass treatment, the flat Bone background, and contact shadow realism.`;

// ── FINAL_V2_STUDIO_CHECK  (last controlling instruction) ─────────────────────
export const FINAL_V2_STUDIO_CHECK = `FINAL V2 STUDIO CHECK:
This v2 studio direction is the final controlling instruction for visual style and finish. Do not apply any older Best Bottles parchment, darkroom, paper-doll, visual-squad, generic ecommerce, or post-generation prompt language after this point.
Only the reference identity lock, essential material truth, and resolved Madison framing contract are allowed to constrain it.
Respect the resolved family framing measurements while making the photograph feel like the approved v2 studio direction.`;

// ── PRESENTATION  (Change 3 + Change 4 + Change 5 applied) ──────────────────────
export const PRESENTATION = `ENHANCE ONLY THE PRESENTATION, as crisp high-end ecommerce glass product photography on a flat seamless Best Bottles Bone canvas:
- Single large rectangular softbox key from upper camera-left, gentle white-card fill from camera-right, and restrained edge separation only where it clarifies the product silhouette. The shot is cross-polarized: a linear polarizer on the lens matched to the polarization of the key light. This kills surface haze, deepens the glass color to its true saturation, and gives the bottle a quiet, considered "this was shot in a real studio" quality. No glare, no scattered light in the glass.
- Seamless flat Best Bottles Bone background #F5F3EF that reads as cream, not white. This is a flat seamless Best Bottles Bone canvas, not paper, paint, cloth, stone, plaster, canvas fabric, or any material surface. No texture, brush strokes, pigment, grain, mottling, visible gradient band, horizon line, tabletop edge, vignette, props, labels, or text.
- One soft, realistic contact shadow grounding the base (and any beside-bottle cap), slightly longer and more defined on the camera-right side because the key is from camera-left, feathering outward; contact-only, no hard edges, no smear, no reflection, no floor-plane rendering, no painted shadow shape.
- Crisp clean edges; product sharp from cap to base; high-end commercial glass photography. Photographic finish only: not painterly, not illustrated, not a rendering, no oil paint, acrylic, gouache, watercolor, digital-paint texture, material swatches, or brushed background.
- Camera: medium-format digital back (Phase One IQ4 / Hasselblad H6D class), 120mm macro lens at f/8, ISO 64, 1/125s. Linear polarizer on the lens matched to the polarization of the key light (cross-polarized capture). The bottle is sharp from cap to base. No motion blur, no chromatic aberration, no oversharpening halos, no "AI glow". This is a front-facing studio product photograph on a tripod in a real studio — not CGI, not an illustration, and not a painting.

You are giving this exact bottle light, depth, and life — not redrawing it. Its identity, geometry, finish, and materials must remain identical to the reference.`;

// ── CLEAR_PRESENTATION  (v3 composition, shadow, quality, negatives) ───────────
export const CLEAR_PRESENTATION = `BACKGROUND AND COMPOSITION:
Place the product on a seamless flat Best Bottles Bone background: #F5F3EF.

The background must be smooth, flat, clean, and premium. No paper texture, canvas texture, plaster texture, grain, mottling, gradients, vignette, tabletop edge, horizon line, props, labels, or text.

Canvas size: 2080 × 2288.
Keep the full product visible.
Center the primary bottle on the vertical centerline.
Seat the base on a shared studio baseline approximately 8-10% above the bottom edge.
For roller bottles, the assembled product should fill approximately 65-70% of the canvas height.
If a detached cap or applicator is present beside the bottle, preserve it as a right-sidecar component on the same baseline. Do not let the detached part push the primary bottle off center.

SHADOW:
Add one realistic contact shadow under the bottle base and any detached cap. The shadow should be soft, subtle, and photographic, slightly longer toward camera-right because the key light is from camera-left. Contact shadow only. No reflective floor, no hard cast shadow, no painted smear, and no visible surface plane.

MATERIAL ACCURACY:
Glass must remain achromatic and transparent. Do not introduce amber, yellow, champagne, honey, gold, gray smoke, blue tint, or green tint into the clear glass. Metal caps should keep their exact reference color and finish: gold remains gold, silver remains silver, black remains black, white remains white. Plastic and fabric parts must also keep their original finish.

QUALITY TARGET:
The final image should look like a high-end studio product photograph shot on a medium-format camera with a macro lens: sharp, clean, elegant, realistic, expensive, and suitable for luxury ecommerce.

Avoid an AI-rendered look. Preserve natural photographic dynamic range. Highlights should be bright but not clipped. No bloom, halos, oversharpening, chromatic aberration, fake glow, painterly texture, CGI plasticity, or illustration.

NEGATIVE CONSTRAINTS:
Do not create liquid.
Do not create frosted glass.
Do not create cloudy white fill.
Do not create milky haze.
Do not create opaque white patches inside the bottle.
Do not create a white plug or solid base block.
Do not create bubbles, dust, smoke, sediment, residue, scratches, speckles, stippling, or noisy sidewalls.
Do not create barcode-like vertical stripes, duplicated rails, etched contour lines, hard full-height highlight bands, or artificial parallel lines.
Do not change the silhouette, crop the product, alter the cap, alter the roller ball, alter the sprayer, alter the collar, move the detached cap, add labels, add props, add text, or change the background color.

FINAL CHECK BEFORE OUTPUT:
Compare the result to the reference. The product must still be recognizably the exact same bottle with the exact same geometry and component placement. The only intended changes are: clearer premium glass, better studio reflections, more believable transparency, cleaner refraction, sharper rim definition, and a more polished ecommerce presentation.`;

export function buildPrompt(glassIsClear: boolean): string {
  if (glassIsClear) {
    return [PRESERVE, CLEAR_GLASS, STUDIO_DIRECTION, FINAL_V2_STUDIO_CHECK].join("\n\n");
  }
  return [PRESERVE, KEEP_MATERIAL, STUDIO_DIRECTION, FINAL_V2_STUDIO_CHECK].join("\n\n");
}

export const API_CONFIG = {
  model: "gpt-image-2.5-flare",
  size: "auto", // native aspect (refs are 2080x2288 ≈ 10:11). Corrected from directive's landscape.
  retryFallbackSize: "2048x2048",
  quality: "high",
  background: "opaque",
} as const;
