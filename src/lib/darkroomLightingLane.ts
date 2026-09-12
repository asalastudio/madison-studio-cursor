/**
 * The lighting lane: Set → Place → Match light.
 *
 * A single-pass shot asks the model for the set and the product at once,
 * with the product reference dominating. The bottle comes out correct and
 * even casts a shadow, but it keeps the light it arrived with — the
 * "sticker on a backdrop" look. Every product-photography tool that gets
 * this right does it in stages: build the scene, place the product into it
 * with the scene as the only light authority, then harmonise.
 *
 * This module is the pure part — which passes run, and the prompt each one
 * carries. The Dark Room orchestrates the calls and the edge function owns
 * the per-pass prompt framing.
 */
import { MOOD_MOCK_ADDON, PRODUCT_PLACEMENT_ADDON } from "./darkroomHeroSetPresets";

export type LightingLane = "single" | "set-place" | "set-place-match";

export const LIGHTING_LANE_STORAGE_KEY = "madison-darkroom-lighting-lane";

export interface LightingLaneOption {
  value: LightingLane;
  label: string;
  passes: number;
  description: string;
}

export const LIGHTING_LANE_OPTIONS: LightingLaneOption[] = [
  {
    value: "single",
    label: "1 pass",
    passes: 1,
    description: "Set and product in one shot. Fastest; the product tends to keep the light it arrived with.",
  },
  {
    value: "set-place",
    label: "Set + Place",
    passes: 2,
    description: "Shoot the set first, then place the product into it with the set's light as the only authority.",
  },
  {
    value: "set-place-match",
    label: "+ Match",
    passes: 3,
    description: "Then relight only the product to the set — shadow direction, colour temperature, contrast, grain.",
  },
];

export function isLightingLane(value: unknown): value is LightingLane {
  return value === "single" || value === "set-place" || value === "set-place-match";
}

export function readLightingLane(): LightingLane {
  try {
    const stored = localStorage.getItem(LIGHTING_LANE_STORAGE_KEY);
    return isLightingLane(stored) ? stored : "single";
  } catch {
    return "single";
  }
}

export type LightingLaneStage = "set" | "place" | "match";

export interface PlanLightingLaneInput {
  lane: LightingLane;
  /** A product reference or product slots are attached. */
  hasProductReference: boolean;
  /** A background plate / set image is already loaded — pass 1 is skipped. */
  hasSetImage: boolean;
  /** Background plate mode shoots an empty set on its own; nothing to place. */
  backgroundPlateMode: boolean;
  /** Style-reference library output is its own lane. */
  styleReferenceMode: boolean;
}

/**
 * Which passes run. An empty plan means the existing single request.
 * The lane only applies when there is a product to place; sets and style
 * references shoot in one pass whatever the switch says.
 */
export function planLightingLane(input: PlanLightingLaneInput): LightingLaneStage[] {
  if (input.lane === "single") return [];
  if (!input.hasProductReference || input.backgroundPlateMode || input.styleReferenceMode) return [];
  const stages: LightingLaneStage[] = [];
  if (!input.hasSetImage) stages.push("set");
  stages.push("place");
  if (input.lane === "set-place-match") stages.push("match");
  return stages;
}

export const STAGE_LABEL: Record<LightingLaneStage, string> = {
  set: "Set",
  place: "Place",
  match: "Match light",
};

/**
 * Hero-set prompts arrive with a placement addon already appended (the
 * preset's population). The set pass must not see it — it would try to
 * render the product — so it is split off and its presence remembered,
 * because it also tells the place pass to use hero framing.
 */
export function splitPlacementAddon(prompt: string): { scenePrompt: string; hasPlacementAddon: boolean } {
  let scenePrompt = prompt;
  let hasPlacementAddon = false;
  for (const addon of [PRODUCT_PLACEMENT_ADDON, MOOD_MOCK_ADDON]) {
    const index = scenePrompt.indexOf(addon);
    if (index >= 0) {
      if (addon === PRODUCT_PLACEMENT_ADDON) hasPlacementAddon = true;
      scenePrompt = scenePrompt.slice(0, index) + scenePrompt.slice(index + addon.length);
    }
  }
  return { scenePrompt: scenePrompt.trim(), hasPlacementAddon };
}

export const SET_ONLY_DIRECTIVE =
  "Photograph the set only. No product, no bottle, no stand-in and no placeholder object: an empty stage with a clear, flat surface where a product will later stand, lit exactly as described, with the light's direction, softness and colour temperature plainly readable in the shadows and highlights of the set itself.";

export function buildSetPrompt(scenePrompt: string): string {
  const scene = scenePrompt.trim() || "Neutral studio set with a clear flat surface and soft directional daylight from upper camera-left.";
  return `${scene}\n\n${SET_ONLY_DIRECTIVE}`;
}

const PLACE_DIRECTIVE_CORE =
  "Place the product from the product reference into this set. " +
  "Render EXACTLY ONE product — no duplicate, mirrored copy, ghost, reflection-as-second-object or variant anywhere in the frame. " +
  "It is the SAME product as the reference: preserve its exact silhouette, proportions, glass colour and material, closure, applicator and trim precisely as the reference shows them. Do not restyle, simplify or substitute it, and do not invent detail the reference does not show. " +
  "Stand it upright on the set's highest clear flat surface, comfortably inside the frame with air above it. It rests on that surface with a soft, tight contact shadow directly beneath the point of contact plus a cast shadow whose direction, length and softness agree with the shadows the set already casts. It does not float, tilt, hover or overhang the edge. " +
  "INTEGRATE THE LIGHT. The set's light is the only authority: light the product from the same direction, at the same colour temperature and the same softness as everything already in frame. The product takes colour bounce from the surface it stands on and from nearby surfaces, and the set is visible reflected in its glass and any polished closure — not a clean studio environment that does not exist in this scene. Match the set's depth of field. " +
  "CLOSURES ARE MOULDED PHENOLIC PLASTIC, NOT METAL — even in gold, silver and black colourways: a polished lacquered plastic finish with clean but slightly softer, broader highlights that pick up the scene's cast; no mirror-chrome, no machined grain, no single hard vertical specular stripe that ignores the room. A roller ball, if the reference has one, IS polished steel and stays so. " +
  "Nothing may read as a cut-out composited onto a backdrop.";

const PLACE_DIRECTIVE_HERO_FRAMING =
  " The product occupies roughly 45–60% of the frame height. Keep the LEFT 45% of the frame empty for the headline.";

const PLACE_DIRECTIVE_GENERAL_FRAMING =
  " The product is the focal point, sized naturally for the set — large enough to read every detail, never so large that the set becomes a sliver behind it.";

export function buildPlacePrompt(scenePrompt: string, options: { heroFraming?: boolean } = {}): string {
  const scene = scenePrompt.trim();
  const directive = PLACE_DIRECTIVE_CORE + (options.heroFraming ? PLACE_DIRECTIVE_HERO_FRAMING : PLACE_DIRECTIVE_GENERAL_FRAMING);
  return scene
    ? `SET DESCRIPTION (the first reference image is this set, already photographed — it names the light):\n${scene}\n\n${directive}`
    : directive;
}

export const MATCH_LIGHT_PROMPT =
  "Relight the product in this image to match the set it stands in, and change nothing else. " +
  "Keep every pixel of the set exactly as it is, and keep the product's position, scale, silhouette, label and materials exactly as they are. " +
  "Change ONLY the light on the product and its shadows: the key light direction, softness and colour temperature now match the set's light; the contact shadow beneath the product and its cast shadow agree with the set's own shadows in direction, length and softness; the glass and closure take the set's colour bounce and show the set reflected in them; contrast, black level, highlight roll-off, grain and depth of field match the surrounding image. " +
  "Do not move, resize, restyle or replace anything, and do not add objects, props or text.";
