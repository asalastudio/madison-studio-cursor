import { buildFormatInstructions } from "./deliverableSpecs.ts";

export const DEDICATED_VIDEO_SCRIPT_TYPES = [
  "video_script",
  "short_form_video_script",
] as const;

export function resolveCopywritingStyleSection(options: {
  usePhase3: boolean;
  usePhase35: boolean;
  copywritingStyleContext: string;
  selectedStyleOverlay: string;
}): string {
  const hasSequencingContext =
    (options.usePhase3 || options.usePhase35) &&
    options.copywritingStyleContext.trim().length > 0;

  if (hasSequencingContext) {
    return options.copywritingStyleContext;
  }

  return options.selectedStyleOverlay;
}

export function formatInstructionsForGenerateMode(
  contentType: string | undefined,
): string {
  if (!contentType) {
    return "";
  }

  if (
    (DEDICATED_VIDEO_SCRIPT_TYPES as readonly string[]).includes(contentType)
  ) {
    return "";
  }

  return buildFormatInstructions(contentType);
}
