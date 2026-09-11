/**
 * Output ratio for Light Table edits.
 *
 * Every Light Table generation — Refine, Variations, Ad — starts from the
 * selected image. Until now the output ratio was whatever that image already
 * was, and the only way to get a 9:16 story out of a 21:9 hero was to go back
 * to the Dark Room and shoot again. This is the half of the request that
 * cf7f960 left open: choosing the ratio after the fact.
 *
 * Two rules keep it honest:
 *
 *  1. Ratios compare by value, not by string. A 2688×1152 hero measures as
 *     "7:3", which is 21:9; a 2080×2288 PDP master is "10:11" and matches
 *     nothing. String equality would flag the first as a reframe.
 *  2. A reframe drops the preserve-source-canvas constraint. That constraint
 *     means "output exactly the source canvas", which is the one thing a
 *     reframe must not do. With it gone the edge function sizes from the
 *     ratio, the same path the Dark Room's aspect picker uses.
 */
import { COMMON_ASPECT_RATIOS, type AspectRatioOption } from "../config/imageSettings";
import type { PreserveSourceCanvasConstraints } from "./imageCanvasMetadata";

const RATIO_TOLERANCE = 0.01;

export function parseAspectRatio(value: string | null | undefined): number | null {
  const match = /^\s*(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)\s*$/.exec(value ?? "");
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!(width > 0) || !(height > 0)) return null;
  return width / height;
}

export function sameAspectRatio(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const ra = parseAspectRatio(a);
  const rb = parseAspectRatio(b);
  if (ra === null || rb === null) return false;
  return Math.abs(ra / rb - 1) < RATIO_TOLERANCE;
}

/** "7:3" → "21:9" when it matches a common ratio; otherwise the input as given. */
export function canonicalizeAspectRatio(
  value: string | null | undefined,
  options: AspectRatioOption[] = COMMON_ASPECT_RATIOS,
): string | null {
  if (!value) return null;
  return options.find((option) => sameAspectRatio(option.value, value))?.value ?? value;
}

export interface OutputRatioChip {
  value: string;
  label: string;
  description: string;
  /** This chip is the image's own ratio. Selecting it clears the override. */
  isSource: boolean;
}

/**
 * The picker's chips: the common ratios, with the image's own ratio prepended
 * as "Original" only when it matches none of them.
 */
export function buildOutputRatioChips(
  sourceRatio: string | null | undefined,
  options: AspectRatioOption[] = COMMON_ASPECT_RATIOS,
): OutputRatioChip[] {
  const common = options.map((option) => ({
    value: option.value,
    label: option.label,
    description: option.description,
    isSource: sameAspectRatio(option.value, sourceRatio),
  }));
  if (sourceRatio && parseAspectRatio(sourceRatio) !== null && !common.some((chip) => chip.isSource)) {
    return [
      {
        value: sourceRatio,
        label: "Original",
        description: "The ratio this image was generated at",
        isSource: true,
      },
      ...common,
    ];
  }
  return common;
}

export interface ReframeTarget {
  from: string | null;
  to: string;
}

/**
 * The instruction that turns "generate at 9:16 from this 21:9 reference" into
 * a reframe rather than a fresh shot. The user's own edit, if any, comes first
 * so it keeps the model's attention; the reframe clause follows.
 */
export function buildReframePrompt(userPrompt: string, target: ReframeTarget): string {
  const label = COMMON_ASPECT_RATIOS.find((option) => sameAspectRatio(option.value, target.to))?.label;
  const instruction = [
    `Reframe this exact scene to a ${target.to}${label ? ` ${label.toLowerCase()}` : ""} canvas${
      target.from ? ` (it was ${target.from})` : ""
    }.`,
    "The product is the anchor: keep it identical in shape, label, colour, materials and lighting, keep it the focal point, and recompose it for the new frame.",
    "Extend the existing set, surface and background to fill the new frame naturally.",
    "Do not add objects, props or text. Do not stretch, squash or crop the product.",
  ].join(" ");
  const edit = userPrompt.trim().replace(/[.\s]+$/u, "");
  return edit ? `${edit}. ${instruction}` : instruction;
}

export interface ResolveLightTableOutputInput {
  /** Recorded on the image, or measured from it. */
  sourceAspectRatio: string | null | undefined;
  /** The exact-canvas constraint measured from the source, if any. */
  sourceImageConstraints: PreserveSourceCanvasConstraints | undefined;
  /** The picker's selection; null keeps the source ratio. */
  outputRatioOverride: string | null | undefined;
  /** The user's edit instruction. May be empty when only reframing. */
  prompt: string;
  fallbackAspectRatio?: string;
}

export interface ResolvedLightTableOutput {
  aspectRatio: string;
  imageConstraints: PreserveSourceCanvasConstraints | undefined;
  prompt: string;
  reframe: ReframeTarget | null;
}

export function resolveLightTableOutput(input: ResolveLightTableOutputInput): ResolvedLightTableOutput {
  const source = input.sourceAspectRatio || null;
  const override = input.outputRatioOverride || null;
  const reframing = override !== null && !sameAspectRatio(override, source);

  if (reframing) {
    const reframe: ReframeTarget = { from: canonicalizeAspectRatio(source), to: override };
    return {
      aspectRatio: override,
      imageConstraints: undefined,
      prompt: buildReframePrompt(input.prompt, reframe),
      reframe,
    };
  }

  return {
    aspectRatio: source ?? input.fallbackAspectRatio ?? "1:1",
    imageConstraints: input.sourceImageConstraints,
    prompt: input.prompt,
    reframe: null,
  };
}
