/**
 * Closed classification for generate-with-claude.
 * Customer copy is humanized. Image-prompt requests are not customer copy.
 * There is no skip flag.
 */

export const VISUAL_PROMPT_ARTIFACT = "visual-prompt";

export interface CopyRequestClassification {
  artifact?: string;
  forcePromptOutput?: boolean;
  isImageStudioConsult?: boolean;
}

export function requiresHumanizer(input: CopyRequestClassification): boolean {
  if (input.artifact === VISUAL_PROMPT_ARTIFACT) return false;
  if (input.forcePromptOutput === true) return false;
  if (input.isImageStudioConsult === true) return false;
  return true;
}
