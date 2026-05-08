/**
 * Server-side aspect-ratio conformance for generated images.
 *
 * Some image models (notably Gemini 2.5 Flash Image / Nano Banana) bias
 * aggressively toward square output even when the requested aspect ratio is
 * passed via `imageConfig.aspectRatio`. Rather than trust the model to obey,
 * we center-crop the returned image to the user's requested aspect ratio
 * before storing it. Deterministic, provider-agnostic.
 */

import {
  Image,
} from "https://deno.land/x/imagescript@1.2.17/mod.ts";
import { decode as decodeBase64, encode as encodeBase64 } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const ASPECT_RATIO_REGEX = /^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/;

function parseAspectRatio(raw?: string): number | null {
  if (!raw) return null;
  const match = raw.trim().match(ASPECT_RATIO_REGEX);
  if (!match) return null;
  const w = Number(match[1]);
  const h = Number(match[2]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return null;
  }
  return w / h;
}

function encodeBytes(bytes: Uint8Array): string {
  return encodeBase64(new Uint8Array(bytes).buffer);
}

export interface ConformResult {
  base64: string;
  width: number;
  height: number;
  wasModified: boolean;
  originalWidth: number;
  originalHeight: number;
}

export async function conformImageToCanvas(
  base64Image: string,
  targetWidth: number,
  targetHeight: number,
): Promise<ConformResult> {
  const bytes = decodeBase64(base64Image);
  const decoded = await Image.decode(bytes);
  const image = decoded as unknown as Image;
  const originalWidth = image.width;
  const originalHeight = image.height;

  if (originalWidth === targetWidth && originalHeight === targetHeight) {
    return {
      base64: base64Image,
      width: originalWidth,
      height: originalHeight,
      wasModified: false,
      originalWidth,
      originalHeight,
    };
  }

  image.cover(targetWidth, targetHeight);
  const encoded = await image.encode();

  return {
    base64: encodeBytes(encoded),
    width: targetWidth,
    height: targetHeight,
    wasModified: true,
    originalWidth,
    originalHeight,
  };
}

export async function containImageOnCanvas(
  base64Image: string,
  targetWidth: number,
  targetHeight: number,
  backgroundColor = 0xEEE6D4FF,
): Promise<ConformResult> {
  const bytes = decodeBase64(base64Image);
  const decoded = await Image.decode(bytes);
  const image = decoded as unknown as Image;
  const originalWidth = image.width;
  const originalHeight = image.height;

  if (originalWidth === targetWidth && originalHeight === targetHeight) {
    return {
      base64: base64Image,
      width: originalWidth,
      height: originalHeight,
      wasModified: false,
      originalWidth,
      originalHeight,
    };
  }

  const scale = Math.min(targetWidth / originalWidth, targetHeight / originalHeight);
  const containedWidth = Math.max(1, Math.round(originalWidth * scale));
  const containedHeight = Math.max(1, Math.round(originalHeight * scale));
  image.resize(containedWidth, containedHeight);

  const canvas = new Image(targetWidth, targetHeight);
  canvas.fill(backgroundColor);
  canvas.composite(
    image,
    Math.round((targetWidth - containedWidth) / 2),
    Math.round((targetHeight - containedHeight) / 2),
  );

  const encoded = await canvas.encode();

  return {
    base64: encodeBytes(encoded),
    width: targetWidth,
    height: targetHeight,
    wasModified: true,
    originalWidth,
    originalHeight,
  };
}

/**
 * Center-crop a base64-encoded PNG so that its aspect ratio matches
 * `targetAspectRatio`. Returns the original image unchanged if the ratio is
 * already within `tolerance` (default 3%) or if the ratio string is invalid.
 */
export async function conformImageToAspectRatio(
  base64Image: string,
  targetAspectRatio: string | undefined,
  tolerance = 0.03,
): Promise<ConformResult> {
  const targetRatio = parseAspectRatio(targetAspectRatio);

  // Decode once up-front so we can always report dimensions.
  const bytes = decodeBase64(base64Image);
  const decoded = await Image.decode(bytes);
  const image = decoded as unknown as Image;
  const originalWidth = image.width;
  const originalHeight = image.height;

  if (!targetRatio) {
    return {
      base64: base64Image,
      width: originalWidth,
      height: originalHeight,
      wasModified: false,
      originalWidth,
      originalHeight,
    };
  }

  const currentRatio = originalWidth / originalHeight;
  const drift = Math.abs(currentRatio - targetRatio) / targetRatio;
  if (drift <= tolerance) {
    return {
      base64: base64Image,
      width: originalWidth,
      height: originalHeight,
      wasModified: false,
      originalWidth,
      originalHeight,
    };
  }

  // Compute the largest center-aligned rectangle with the target ratio that
  // fits inside the current image.
  let cropWidth: number;
  let cropHeight: number;
  if (currentRatio > targetRatio) {
    // Source is wider than target — shave the sides.
    cropHeight = originalHeight;
    cropWidth = Math.round(cropHeight * targetRatio);
  } else {
    // Source is taller than target — shave the top and bottom.
    cropWidth = originalWidth;
    cropHeight = Math.round(cropWidth / targetRatio);
  }

  // Clamp to image bounds (defensive).
  cropWidth = Math.min(cropWidth, originalWidth);
  cropHeight = Math.min(cropHeight, originalHeight);

  const x = Math.max(0, Math.round((originalWidth - cropWidth) / 2));
  const y = Math.max(0, Math.round((originalHeight - cropHeight) / 2));

  image.crop(x, y, cropWidth, cropHeight);

  const encoded = await image.encode();
  const re = encodeBytes(encoded);

  return {
    base64: re,
    width: cropWidth,
    height: cropHeight,
    wasModified: true,
    originalWidth,
    originalHeight,
  };
}
