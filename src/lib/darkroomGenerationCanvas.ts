import type { PreserveSourceCanvasConstraints } from "./imageCanvasMetadata";

export type DarkroomGenerationCanvasMode =
  | "preserve-source"
  | "selected-aspect"
  /** An exact pixel canvas the caller names outright, e.g. a 2688x1152 hero set. */
  | "exact-canvas";

export interface ResolveDarkroomGenerationCanvasInput {
  mode: DarkroomGenerationCanvasMode;
  sourceAspectRatio: string | null | undefined;
  sourceImageConstraints: PreserveSourceCanvasConstraints | undefined;
  selectedAspectRatio: string | null | undefined;
  fallbackAspectRatio: string;
  backgroundPlateMode?: boolean;
  /**
   * Exact output pixels, when the caller knows them. Hero-set presets are
   * authored for one canvas (2688x1152), and an aspect ratio alone would be
   * mapped to whichever discrete size the provider prefers — losing the
   * ultra-wide framing the prompt describes. Wins over every other mode,
   * including backgroundPlateMode, because it is always an explicit request.
   */
  exactCanvas?: { width: number; height: number } | null;
}

export interface ResolvedDarkroomGenerationCanvas {
  aspectRatio: string;
  imageConstraints: PreserveSourceCanvasConstraints | undefined;
  modeApplied: DarkroomGenerationCanvasMode;
}

function cleanAspectRatio(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function resolveDarkroomGenerationCanvas(
  input: ResolveDarkroomGenerationCanvasInput,
): ResolvedDarkroomGenerationCanvas {
  const selectedAspectRatio =
    cleanAspectRatio(input.selectedAspectRatio) || input.fallbackAspectRatio;

  if (input.exactCanvas) {
    const { width, height } = input.exactCanvas;
    return {
      aspectRatio: selectedAspectRatio,
      imageConstraints: {
        preserveSourceCanvas: true,
        outputCanvas: { width, height },
      },
      modeApplied: "exact-canvas",
    };
  }

  if (input.backgroundPlateMode || input.mode === "selected-aspect") {
    return {
      aspectRatio: selectedAspectRatio,
      imageConstraints: undefined,
      modeApplied: "selected-aspect",
    };
  }

  return {
    aspectRatio:
      cleanAspectRatio(input.sourceAspectRatio) ||
      selectedAspectRatio,
    imageConstraints: input.sourceImageConstraints,
    modeApplied: "preserve-source",
  };
}
