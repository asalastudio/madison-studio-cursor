/**
 * Exact size solving for the GPT Image family.
 *
 * Kept free of remote (https://) imports so it can be unit-tested under Node,
 * which the provider module itself cannot be — it pulls a Deno std encoder.
 */

export type GptImageSize = `${number}x${number}`;

function numericAspectRatio(aspectRatio: string | undefined): number | null {
  const match = aspectRatio?.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return width / height;
}

/** Both edges must be multiples of this. */
const SIZE_EDGE_MULTIPLE = 16;
/** Neither edge may exceed this. */
const SIZE_MAX_EDGE = 3840;
const SIZE_MIN_PIXELS = 655_360;
const SIZE_MAX_PIXELS = 8_294_400;
/** Long edge to short edge may not exceed 3:1 in either direction. */
const SIZE_MIN_RATIO = 1 / 3;
const SIZE_MAX_RATIO = 3;

/** Pixel budget per Madison resolution tier. */
const SIZE_TIER_PIXELS: Record<string, number> = {
  standard: 1_048_576, // 1024²
  high: 4_194_304, // 2048²
  "4k": 8_100_000, // just under the 8,294,400 ceiling, leaving rounding room
};

function roundToMultiple(value: number, multiple: number): number {
  return Math.max(multiple, Math.round(value / multiple) * multiple);
}

/**
 * Solve an exact WIDTHxHEIGHT for a requested aspect ratio and resolution tier.
 *
 * The previous implementation snapped every ratio into one of three discrete
 * buckets — portrait, landscape or square — so only 1:1 ever came back at the
 * ratio that was asked for. A 21:9 hero request produced 1536x1024 (3:2) at
 * standard and 2048x1152 (16:9) at high, which is what "we keep getting a
 * partial hero" looked like. 9:16, 4:5, 1:2, 2:1, 4:3 and 3:2 were all wrong
 * in the same way.
 *
 * GPT Image 2 and 2.5 accept any size meeting four constraints, so the correct
 * behaviour is to solve for the ratio rather than pick from a menu:
 *   - both edges multiples of 16
 *   - aspect between 1:3 and 3:1
 *   - neither edge over 3840
 *   - 655,360 to 8,294,400 total pixels
 *
 * The ratio is honoured as closely as a 16-pixel grid permits; edge and pixel
 * limits are applied after, because a violated constraint is a hard API error
 * while a fractionally-off ratio is invisible.
 */
export function resolveGptImageSize(
  aspectRatio: string | undefined,
  resolution: string | undefined,
): GptImageSize {
  const requested = numericAspectRatio(aspectRatio);
  const ratio = requested === null
    ? 1
    : Math.min(SIZE_MAX_RATIO, Math.max(SIZE_MIN_RATIO, requested));

  const tier = resolution === "4k" ? "4k" : resolution === "high" ? "high" : "standard";
  let budget = SIZE_TIER_PIXELS[tier];

  const solve = (pixels: number): { width: number; height: number } => {
    let width = Math.sqrt(pixels * ratio);
    let height = Math.sqrt(pixels / ratio);

    // Cap the long edge first; scaling both keeps the ratio intact.
    const longest = Math.max(width, height);
    if (longest > SIZE_MAX_EDGE) {
      const scale = SIZE_MAX_EDGE / longest;
      width *= scale;
      height *= scale;
    }

    return {
      width: Math.min(SIZE_MAX_EDGE, roundToMultiple(width, SIZE_EDGE_MULTIPLE)),
      height: Math.min(SIZE_MAX_EDGE, roundToMultiple(height, SIZE_EDGE_MULTIPLE)),
    };
  };

  let { width, height } = solve(budget);

  // Rounding and edge capping can push the total outside the pixel window;
  // rescale the budget and re-solve rather than nudging one edge, which would
  // drift the ratio.
  for (let attempt = 0; attempt < 8; attempt++) {
    const total = width * height;
    if (total > SIZE_MAX_PIXELS) {
      budget *= (SIZE_MAX_PIXELS / total) * 0.98;
    } else if (total < SIZE_MIN_PIXELS) {
      budget *= (SIZE_MIN_PIXELS / total) * 1.02;
    } else {
      break;
    }
    ({ width, height } = solve(budget));
  }

  return `${width}x${height}` as GptImageSize;
}

