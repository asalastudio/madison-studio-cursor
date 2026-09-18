import { BEST_BOTTLES_GRID_BONE_BACKGROUND_HEX } from "@/config/imagePresets";

export const BEST_BOTTLES_BACKGROUND_QA_VERSION =
  "best-bottles-background-qa-v1" as const;
export const BEST_BOTTLES_BACKGROUND_QA_PASS_TAG = "background-qa:pass" as const;
export const BEST_BOTTLES_BACKGROUND_QA_FAIL_TAG = "background-qa:fail" as const;
export const BEST_BOTTLES_CANVAS_HEX_TAG = "canvas-hex:#F5F3EF" as const;
export const BEST_BOTTLES_BACKGROUND_MAX_CHANNEL_DELTA = 2;
export const BEST_BOTTLES_BACKGROUND_MIN_COMPLIANT_RATIO = 0.995;

type RgbTuple = readonly [number, number, number];

export interface BestBottlesBackgroundQaResult {
  version: typeof BEST_BOTTLES_BACKGROUND_QA_VERSION;
  status: "pass" | "fail";
  targetHex: typeof BEST_BOTTLES_GRID_BONE_BACKGROUND_HEX;
  measuredHex: string;
  sampledPixels: number;
  compliantPixels: number;
  compliantRatio: number;
  maxChannelDelta: number;
  message: string;
}

function targetRgb(): RgbTuple {
  return [245, 243, 239];
}

function componentHex(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
}

function rgbToHex(rgb: RgbTuple): string {
  return `#${componentHex(rgb[0])}${componentHex(rgb[1])}${componentHex(rgb[2])}`;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1]! + sorted[middle]!) / 2)
    : sorted[middle]!;
}

function sampledBackgroundPixel(
  x: number,
  y: number,
  width: number,
  height: number,
): boolean {
  const edgeX = Math.max(1, Math.floor(width * 0.035));
  const edgeY = Math.max(1, Math.floor(height * 0.035));
  const topBand = y < edgeY;
  const upperSideBand =
    y < Math.floor(height * 0.7) && (x < edgeX || x >= width - edgeX);
  const cornerBand =
    (y < edgeY || y >= height - edgeY) &&
    (x < edgeX || x >= width - edgeX);
  return topBand || upperSideBand || cornerBand;
}

export function analyzeBestBottlesBackgroundPixels(input: {
  data: ArrayLike<number>;
  width: number;
  height: number;
}): BestBottlesBackgroundQaResult {
  const target = targetRgb();
  const reds: number[] = [];
  const greens: number[] = [];
  const blues: number[] = [];
  let compliantPixels = 0;
  let maxChannelDelta = 0;

  for (let y = 0; y < input.height; y += 1) {
    for (let x = 0; x < input.width; x += 1) {
      if (!sampledBackgroundPixel(x, y, input.width, input.height)) continue;
      const offset = (y * input.width + x) * 4;
      if ((input.data[offset + 3] ?? 0) < 250) continue;
      const rgb: RgbTuple = [
        input.data[offset] ?? 0,
        input.data[offset + 1] ?? 0,
        input.data[offset + 2] ?? 0,
      ];
      reds.push(rgb[0]);
      greens.push(rgb[1]);
      blues.push(rgb[2]);
      const pixelDelta = Math.max(
        Math.abs(rgb[0] - target[0]),
        Math.abs(rgb[1] - target[1]),
        Math.abs(rgb[2] - target[2]),
      );
      maxChannelDelta = Math.max(maxChannelDelta, pixelDelta);
      if (pixelDelta <= BEST_BOTTLES_BACKGROUND_MAX_CHANNEL_DELTA) {
        compliantPixels += 1;
      }
    }
  }

  const sampledPixels = reds.length;
  const measured: RgbTuple = [median(reds), median(greens), median(blues)];
  const compliantRatio =
    sampledPixels > 0 ? compliantPixels / sampledPixels : 0;
  const status =
    sampledPixels > 0 &&
    compliantRatio >= BEST_BOTTLES_BACKGROUND_MIN_COMPLIANT_RATIO
      ? "pass"
      : "fail";
  const measuredHex = rgbToHex(measured);

  return {
    version: BEST_BOTTLES_BACKGROUND_QA_VERSION,
    status,
    targetHex: BEST_BOTTLES_GRID_BONE_BACKGROUND_HEX,
    measuredHex,
    sampledPixels,
    compliantPixels,
    compliantRatio,
    maxChannelDelta,
    message:
      status === "pass"
        ? `Background matches ${BEST_BOTTLES_GRID_BONE_BACKGROUND_HEX}.`
        : `Background measured ${measuredHex}; regenerate on ${BEST_BOTTLES_GRID_BONE_BACKGROUND_HEX} before approval.`,
  };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("Unable to load the image for background QA."));
    image.src = url;
  });
}

export async function analyzeBestBottlesBackgroundImage(
  imageUrl: string,
): Promise<BestBottlesBackgroundQaResult> {
  const image = await loadImage(imageUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Unable to acquire background QA canvas.");
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  return analyzeBestBottlesBackgroundPixels({
    data: pixels.data,
    width: pixels.width,
    height: pixels.height,
  });
}
