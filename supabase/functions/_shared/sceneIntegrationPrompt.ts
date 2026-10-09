/**
 * Scene integration directives shared by the Essential and Director prompts
 * and FLUX 3 captions. Without them a product reference is pasted in with the
 * light it was photographed under, which reads as a cut-out taped onto the set.
 */

export const PRODUCT_FIDELITY_RELIGHT_LINE =
  "Keep the exact silhouette, glass thickness, threads, closure and proportions; change only the scene light falling on it.";

export const SCENE_INTEGRATION_LINES: readonly string[] = [
  "The scene's light is authoritative: light the product from the same direction, at the same colour temperature and softness as the rest of the frame.",
  "Ground the product with a soft, tight contact shadow where it meets the surface and a cast shadow whose direction, length and softness agree with the scene's other shadows.",
  "The product takes colour bounce from the surfaces beneath and beside it, and glass or polished parts reflect the scene around them.",
  "Match the scene's perspective, depth of field, grain and colour grade.",
  "Nothing may read as a cut-out composited onto a backdrop: no halo, no hard pasted edge, no mismatched light.",
];

export function buildSceneIntegrationBlock(heading = "SCENE INTEGRATION (MANDATORY)"): string {
  return `${heading}:\n${SCENE_INTEGRATION_LINES.map((line) => `- ${line}`).join("\n")}\n`;
}

/** One-paragraph form for captions (FLUX 3) where bullets are not wanted. */
export function sceneIntegrationSentence(): string {
  return [PRODUCT_FIDELITY_RELIGHT_LINE, ...SCENE_INTEGRATION_LINES].join(" ");
}
