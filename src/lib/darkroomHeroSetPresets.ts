/**
 * Best Bottles — hero SET presets (empty display sets, no product).
 *
 * Distinct from `darkroomHeroPrompts.ts`, which composes a stone material and
 * an arrangement around a bottle that is already loaded as a reference. These
 * are ten complete, self-contained art directions for an empty set: no
 * reference image, no product, nothing to load first. The operator picks a
 * direction and generates.
 *
 * Why empty: the bottles are composited in afterwards at one pixel per
 * millimetre from catalogue dimensions, then re-photographed inside the locked
 * outlines. Anything the model draws freehand is an invented bottle that
 * matches no real SKU, so a generated bottle can never ship. Judge these on
 * set, palette, light direction, surface heights, and how much quiet room the
 * left side leaves for the headline.
 *
 * `MOOD_MOCK_ADDON` appends stand-in glass for judging mood only — whatever it
 * draws is placeholder art, never a shippable product.
 *
 * Every prompt already carries the four rules that caused two rounds of rework
 * on the shipping hero; `heroSetPromptOmissions()` enforces them in tests:
 *   1. Name the emptiness — a set-dressing word like "sprig" is always honoured.
 *   2. Ground everything explicitly — contact shadow, nothing floating.
 *   3. Never contradict the layout — say "lying flat" when it lies flat.
 *   4. Protect the headline — state the empty left percentage and why.
 */

/** 21:9, both edges multiples of 16, 3,096,576px — inside every GPT Image 2.5 bound. */
export const HERO_SET_CANVAS = { widthPx: 2688, heightPx: 1152 } as const;
export const HERO_SET_ASPECT_RATIO = "21:9" as const;

/** Sunburst, not Flare: these are keepers, and editing precision is the point. */
export const HERO_SET_MODEL = "openai-image-2.5-sunburst" as const;

/** `high` to explore (~$0.04), `max` for a keeper (~$0.20–0.25). */
export type HeroSetQuality = "high" | "max";

export type HeroSetPresetId =
  | "silver-travertine"
  | "noce-travertine"
  | "black-basalt"
  | "lime-plaster"
  | "champagne-metal"
  | "silk-and-stone"
  | "wet-stone"
  | "louvred-light"
  | "glass-on-glass"
  | "desert-mineral";

export interface HeroSetPreset {
  id: HeroSetPresetId;
  /** Menu label. */
  label: string;
  /** One line on what this direction is for, shown under the label. */
  direction: string;
  /** Complete prompt. Self-contained — needs no reference image. */
  prompt: string;
}

const SHARED_OPENING =
  "Empty product display set for an ultra-wide 21:9 website hero banner on a premium glass packaging website. " +
  "No bottles, no jars, no products, no text, no logos, no watermarks";

export const BEST_BOTTLES_HERO_SET_PRESETS: HeroSetPreset[] = [
  {
    id: "silver-travertine",
    label: "Silver Travertine",
    direction: "The control — closest to what is live now. Run it first so the others have a baseline to beat.",
    prompt:
      `${SHARED_OPENING} — the set is waiting for glass bottles to be placed later.\n` +
      "The LEFT 45% of the frame is empty: only the seamless backdrop, nothing standing there, because a headline will be printed over it. " +
      "On the RIGHT 55%: two blocks of pale silver-grey travertine with soft cool-grey veining and fine open pits, cut clean, tops flat — a long low slab lying flat across the lower part of the frame that starts near the middle and runs past the right edge, and a taller upright block standing behind it near the right, its flat top the highest surface. Both sit comfortably inside the frame with air above them. Every top surface is seen from slightly above and is flat, level and clean, so products could stand on it.\n" +
      "THE STONE IS COMPLETELY BARE: nothing rests on it — no plants, sprigs, dried flowers, petals, leaves, props, pebbles, books or decorations of any kind.\n" +
      "Behind everything a seamless warm sand-to-bone studio backdrop with a very soft gradient, a touch deeper and warmer toward the left where the headline will sit; no horizon line, no wall-to-floor seam, no vignette. Soft directional daylight from upper camera-left; gentle shadows fall to the right and stay soft-edged. Quiet, high-end commercial product photography, photographic finish only, no illustration and no 3D-render look. Ultra-wide landscape 21:9.",
  },
  {
    id: "noce-travertine",
    label: "Noce Travertine",
    direction: "Warm and deep — walnut-brown stone on a darker ground. Richer, more perfume-counter than the pale set.",
    prompt:
      `${SHARED_OPENING}.\n` +
      "The LEFT 45% of the frame is empty backdrop, nothing standing there, because a headline will be printed over it. " +
      "On the RIGHT 55%: two blocks of noce travertine — warm walnut brown with amber and cocoa banding and fine open pits — cut clean with flat tops. A long low slab lies flat across the lower frame from the middle to past the right edge, and a taller upright block stands behind it to the right, its flat top the highest surface. Every top surface is seen from slightly above and is flat, level and clean, so products could stand on it.\n" +
      "THE STONE IS COMPLETELY BARE: nothing rests on it — no plants, sprigs, dried flowers, petals, props, pebbles or decorations of any kind.\n" +
      "Behind everything a seamless bronze-to-deep-camel studio backdrop with a very soft gradient, deepest at the left where the headline sits; no horizon line, no wall-to-floor seam, no vignette. Warm low directional light from upper camera-left, the kind of late-afternoon studio light that makes stone glow; shadows fall to the right, soft and warm rather than grey. Quiet, high-end commercial product photography, photographic finish only, no illustration and no 3D-render look. Ultra-wide landscape 21:9.",
  },
  {
    id: "black-basalt",
    label: "Black Basalt on Charcoal",
    direction: "The obsidian direction. Clear glass reads brilliantly; frosted may disappear — check both.",
    prompt:
      `${SHARED_OPENING}.\n` +
      "The LEFT 45% of the frame is empty backdrop, nothing standing there, because a headline will be printed over it. " +
      "On the RIGHT 55%: two blocks of black basalt — dense, matte, very fine-grained, with a faint charcoal-to-graphite variation and honed square edges. A long low slab lies flat across the lower frame from the middle to past the right edge, and a taller upright block stands behind it to the right, its flat top the highest surface. Every top surface is seen from slightly above and is flat, level and clean, so products could stand on it.\n" +
      "THE STONE IS COMPLETELY BARE: nothing rests on it — no plants, sprigs, dried flowers, petals, props, pebbles or decorations of any kind.\n" +
      "Behind everything a seamless charcoal-to-near-black studio backdrop with a very soft gradient that lifts slightly toward the upper right; no horizon line, no wall-to-floor seam, no vignette. A single soft broad light from high camera-left rakes across the stone and reveals its texture; shadows fall to the right and are deep but never crushed, and a faint cool rim of light catches the top edges of both blocks. Quiet, high-end commercial product photography with rich blacks and no colour cast, photographic finish only, no illustration and no 3D-render look. Ultra-wide landscape 21:9.",
  },
  {
    id: "lime-plaster",
    label: "Lime Plaster Architecture",
    direction: "Bone, minimal, Aesop-quiet. No stone at all — hand-troweled plaster shelves in one continuous tone.",
    prompt:
      `${SHARED_OPENING}.\n` +
      "The LEFT 45% of the frame is an empty plaster wall, nothing mounted or standing there, because a headline will be printed over it. " +
      "On the RIGHT 55%: an architectural display built from hand-troweled bone-white lime plaster in one continuous tone — a deep horizontal shelf cast into the wall running from the middle of the frame past the right edge, and a low rectangular plinth of the same plaster standing on it toward the right, its flat top the highest surface. The plaster has a soft mineral texture with faint trowel sweeps and slightly rounded edges, matte and chalky, no paint sheen. Every top surface is seen from slightly above and is flat, level and clean, so products could stand on it.\n" +
      "THE SURFACES ARE COMPLETELY BARE: nothing rests on them — no plants, sprigs, dried flowers, petals, props, pebbles or decorations of any kind.\n" +
      "Soft diffused daylight from upper camera-left fills the space; shadows are long, very soft and fall to the right, and the wall behind carries a gentle tonal gradient from warm bone to a slightly cooler shade at the left. No horizon line, no wall-to-floor seam, no vignette. Quiet, high-end commercial architectural product photography, photographic finish only, no illustration and no 3D-render look. Ultra-wide landscape 21:9.",
  },
  {
    id: "champagne-metal",
    label: "Champagne Metal & Bone",
    direction: "The luxe direction. Brushed metal picks up the muted-gold token and throws warm reflections into glass.",
    prompt:
      `${SHARED_OPENING}.\n` +
      "The LEFT 45% of the frame is empty backdrop, nothing standing there, because a headline will be printed over it. " +
      "On the RIGHT 55%: a display built from brushed champagne-gold metal and bone-white stone — a slim horizontal shelf of brushed champagne metal with a fine directional grain and softly chamfered edges, running from the middle of the frame past the right edge, and a bone-white matte stone plinth standing on it toward the right, its flat top the highest surface. The metal reflects the room softly and diffusely, warm and satin rather than mirror-bright, with no hotspots and no visible studio equipment in the reflection. Every top surface is seen from slightly above and is flat, level and clean, so products could stand on it.\n" +
      "THE SURFACES ARE COMPLETELY BARE: nothing rests on them — no plants, sprigs, dried flowers, petals, props, pebbles or decorations of any kind.\n" +
      "Behind everything a seamless warm bone-to-ivory studio backdrop with a very soft gradient, slightly deeper toward the left where the headline sits; no horizon line, no wall-to-floor seam, no vignette. Soft directional daylight from upper camera-left; shadows fall to the right, soft and warm, with a faint golden bounce under the metal shelf. Quiet, high-end commercial product photography, photographic finish only, no illustration and no 3D-render look. Ultra-wide landscape 21:9.",
  },
  {
    id: "silk-and-stone",
    label: "Silk & Stone",
    direction: "The tactile direction. Heavy raw silk under a single stone riser — watch that the folds stay out of the left third.",
    prompt:
      `${SHARED_OPENING}.\n` +
      "The LEFT 45% of the frame is quiet empty backdrop with the fabric lying almost flat and unbroken there, nothing standing on it, because a headline will be printed over it. " +
      "On the RIGHT 55%: a heavy raw silk cloth in warm champagne-bone, its weave and slubs visible, laid across the lower frame in a few broad relaxed folds that rise toward the right, and a single squared riser of pale honed limestone set on top of the cloth toward the right, pressing gently into it, its flat top the highest surface. One further flat expanse of the cloth in front of the riser is smooth and level enough for products to stand on. Every surface meant for products is seen from slightly above and is flat, level and clean.\n" +
      "THE SET IS COMPLETELY BARE: nothing rests on the cloth or the stone — no plants, sprigs, dried flowers, petals, props, pebbles, ribbons or decorations of any kind.\n" +
      "Behind everything a seamless warm bone studio backdrop with a very soft gradient; no horizon line, no wall-to-floor seam, no vignette. Soft directional daylight from upper camera-left grazes the weave and makes the folds read; shadows in the folds are gentle and fall to the right. Quiet, high-end commercial product photography, photographic finish only, no illustration and no 3D-render look. Ultra-wide landscape 21:9.",
  },
  {
    id: "wet-stone",
    label: "Wet Stone",
    direction: "The wellness direction. A still film of water gives free reflections under every bottle — strong for roll-on lines.",
    prompt:
      `${SHARED_OPENING}.\n` +
      "The LEFT 45% of the frame is empty backdrop, nothing standing there, because a headline will be printed over it. " +
      "On the RIGHT 55%: two blocks of pale grey honed stone, cut clean with flat tops — a long low slab lying flat across the lower frame from the middle to past the right edge, and a taller upright block standing behind it to the right, its flat top the highest surface and completely dry. The top of the low slab carries a shallow, perfectly still film of clear water no more than a few millimetres deep, held by the stone's squared rim, its surface glassy and motionless with no ripples, no drips, no droplets and no splashes. The wet stone is darker and mirror-soft where the water lies and reflects the backdrop cleanly. Every top surface is seen from slightly above and is flat and level, so products could stand on it.\n" +
      "THE SET IS COMPLETELY BARE: nothing rests on the stone or in the water — no plants, sprigs, dried flowers, petals, stones, props or decorations of any kind.\n" +
      "Behind everything a seamless cool bone-to-pale-grey studio backdrop with a very soft gradient; no horizon line, no wall-to-floor seam, no vignette. Soft directional daylight from upper camera-left; shadows fall to the right and read as soft reflections in the water film. Quiet, high-end commercial product photography, photographic finish only, no illustration and no 3D-render look. Ultra-wide landscape 21:9.",
  },
  {
    id: "louvred-light",
    label: "Louvred Light",
    direction: "The editorial direction. Hard graphic shadow bars — the most magazine-like, and the riskiest for headline legibility.",
    prompt:
      `${SHARED_OPENING}.\n` +
      "The LEFT 45% of the frame is an empty warm plaster wall, nothing standing there, and the light across it stays even and unbroken so a headline can be printed over it. " +
      "On the RIGHT 55%: a plain squared ledge of pale warm stone running from the middle of the frame past the right edge, and a low stone plinth standing on it toward the right, its flat top the highest surface. Every top surface is seen from slightly above and is flat, level and clean, so products could stand on it.\n" +
      "THE SURFACES ARE COMPLETELY BARE: nothing rests on them — no plants, sprigs, dried flowers, petals, props, pebbles or decorations of any kind.\n" +
      "Hard midday sun enters from high camera-left through an off-frame louvred shutter and throws a series of clean, parallel, diagonal shadow bars across the right side of the wall and the ledge — crisp-edged, evenly spaced, unmistakably window light, confined to the right 55% of the frame and never reaching the left area where the headline sits. Between the bars the stone is brilliantly lit; inside them it is warm and open, never black. Behind everything a seamless warm sand plaster wall with a soft gradient; no horizon line, no wall-to-floor seam, no vignette. Quiet, high-end editorial product photography, photographic finish only, no illustration and no 3D-render look. Ultra-wide landscape 21:9.",
  },
  {
    id: "glass-on-glass",
    label: "Glass on Glass",
    direction: "The modern direction. Frosted risers on a glossy deck — flatters clear bottles, can fight frosted ones.",
    prompt:
      `${SHARED_OPENING}.\n` +
      "The LEFT 45% of the frame is empty backdrop, nothing standing there, because a headline will be printed over it. " +
      "On the RIGHT 55%: a display built from frosted glass and a glossy deck — a smooth glossy off-white acrylic floor running across the lower frame from the middle past the right edge, giving a soft clean vertical reflection of whatever stands on it, and two thick blocks of satin-frosted glass standing on it toward the right, one low and wide, one taller behind, both with polished square edges that catch light and glow faintly where the light passes through, the taller block's flat top the highest surface. Every top surface is seen from slightly above and is flat, level and clean, so products could stand on it.\n" +
      "THE SET IS COMPLETELY BARE: nothing rests on the deck or the blocks — no plants, sprigs, dried flowers, petals, props, pebbles or decorations of any kind.\n" +
      "Behind everything a seamless cool white-to-pale-champagne studio backdrop with a very soft gradient; no horizon line, no wall-to-floor seam, no vignette. Soft directional daylight from upper camera-left; shadows fall to the right, soft and slightly translucent where they pass through frosted glass. Quiet, high-end contemporary commercial product photography, photographic finish only, no illustration and no 3D-render look. Ultra-wide landscape 21:9.",
  },
  {
    id: "desert-mineral",
    label: "Desert Mineral",
    direction: "The earthy direction. Terracotta and raw sandstone — warmest of the set, good for amber and vintage-bulb lines.",
    prompt:
      `${SHARED_OPENING}.\n` +
      "The LEFT 45% of the frame is empty backdrop, nothing standing there, because a headline will be printed over it. " +
      "On the RIGHT 55%: two blocks of raw sandstone in warm terracotta and dusty clay tones, their faces lightly quarried and matte, their tops cut flat and clean — a long low slab lying flat across the lower frame from the middle past the right edge, and a taller upright block standing behind it to the right, its flat top the highest surface. Fine mineral grain and subtle rust-and-ochre banding run through the stone. Every top surface is seen from slightly above and is flat, level and clean, so products could stand on it.\n" +
      "THE STONE IS COMPLETELY BARE: nothing rests on it — no plants, sprigs, dried grasses, flowers, petals, props, pebbles or decorations of any kind, and no sand lying loose on the surfaces.\n" +
      "Behind everything a seamless sun-warmed clay-to-pale-apricot studio backdrop with a very soft gradient, deeper toward the left where the headline sits; no horizon line, no wall-to-floor seam, no vignette. Warm directional daylight from upper camera-left; shadows fall to the right, soft-edged and warm. Quiet, high-end commercial product photography, photographic finish only, no illustration and no 3D-render look. Ultra-wide landscape 21:9.",
  },
];

/**
 * Stand-in glass for judging mood. Whatever this draws is placeholder art and
 * can never ship: real bottles are composited from catalogue dimensions later.
 */
export const MOOD_MOCK_ADDON =
  "Now place three simple clear glass perfume bottles on the set as placeholders: one tall slim cylinder standing on the low surface toward the middle right, one small squat rounded bottle standing beside it, and one medium tapered bottle standing on the highest surface. " +
  "Plain unbranded optical clear glass with polished silver collars, no caps, no atomizers, no labels, no engraving, no text. " +
  "Every bottle stands flat on its surface with a soft tight contact shadow directly beneath it and a gentle cast shadow falling to the right; none of them floats, tilts or overhangs an edge. Keep the left 45% of the frame empty.";

export function getHeroSetPreset(id: HeroSetPresetId): HeroSetPreset {
  return (
    BEST_BOTTLES_HERO_SET_PRESETS.find((preset) => preset.id === id) ??
    BEST_BOTTLES_HERO_SET_PRESETS[0]
  );
}

export interface BuildHeroSetPromptOptions {
  /** Append stand-in glass. Placeholder art for mood only — never shippable. */
  includeMoodMock?: boolean;
}

export function buildHeroSetPrompt(
  id: HeroSetPresetId,
  options: BuildHeroSetPromptOptions = {},
): string {
  const preset = getHeroSetPreset(id);
  return options.includeMoodMock ? `${preset.prompt}\n\n${MOOD_MOCK_ADDON}` : preset.prompt;
}

/**
 * Which of the four anti-rework rules a prompt fails to state. Empty means the
 * prompt carries all four. Used by the test suite so a hand-edited preset
 * cannot quietly drop the clause that caused the original rework.
 */
export function heroSetPromptOmissions(prompt: string): string[] {
  const omissions: string[] = [];
  const lower = prompt.toLowerCase();

  // 1. Name the emptiness, and name what must not appear.
  if (!/nothing rests on/i.test(prompt)) omissions.push("missing 'nothing rests on'");
  if (!lower.includes("sprig")) omissions.push("missing explicit 'sprigs' negative");

  // 2. No product, ever — these are empty sets.
  if (!lower.includes("no bottles")) omissions.push("missing 'no bottles'");

  // 4. Protect the headline, with the reason attached.
  if (!lower.includes("left 45%")) omissions.push("missing 'LEFT 45%' headline reserve");
  if (!lower.includes("headline")) omissions.push("missing headline rationale");

  // Photographic finish only — the render-look failure mode.
  if (!lower.includes("photographic finish only")) {
    omissions.push("missing 'photographic finish only'");
  }
  if (!lower.includes("21:9")) omissions.push("missing 21:9 framing");

  return omissions;
}
