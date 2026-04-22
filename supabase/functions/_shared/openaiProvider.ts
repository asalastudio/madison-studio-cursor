/**
 * OpenAI Images Provider for Madison Studio
 *
 * Wraps OpenAI's Images API (https://developers.openai.com/api/docs/guides/images-vision)
 * around the same shape the edge function uses for Freepik/Gemini — so the
 * dark-room router, Consistency Mode, and the Best Bottles pipeline can all
 * hit OpenAI without any caller-side changes.
 *
 * Endpoints:
 *   - POST /v1/images/generations   (text → image, gpt-image-1 / dall-e-3)
 *   - POST /v1/images/edits         (image + prompt → image, gpt-image-1 only)
 *
 * gpt-image-1 returns base64 in `data[0].b64_json`; dall-e-3 returns a URL in
 * `data[0].url`. We normalize both to base64 so the caller always uploads the
 * bytes into Supabase Storage the same way (no CDN-expiry surprises like the
 * Freepik path had).
 */

import { encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const OPENAI_API_BASE = "https://api.openai.com/v1";

/**
 * Current OpenAI image model family (April 2026):
 *
 *   - gpt-image-2      → current flagship. 4x faster than 1.5, better text
 *                        rendering, better layout composition, improved
 *                        instruction following. Powers "ChatGPT Images 2.0".
 *                        API enum confirmed 2026-04-21.
 *   - gpt-image-1.5    → previous flagship, being deprecated as the default
 *                        but remains available for legacy support.
 *   - gpt-image-1      → legacy.
 *   - gpt-image-1-mini → cheaper / faster tier of the 1-series.
 *   - dall-e-3         → legacy, text-only.
 *
 * Default is gpt-image-2 so every caller (Dark Room, Consistency Mode,
 * Best Bottles pipeline) uses the current flagship by default. The
 * OPENAI_IMAGE_MODEL secret lets us flip to a future model without a
 * redeploy.
 */
function resolveDefaultOpenAIImageModel(): OpenAIImageModel {
  const raw = Deno.env.get("OPENAI_IMAGE_MODEL")?.trim();
  return (raw || "gpt-image-2") as OpenAIImageModel;
}

// ─── Types ────────────────────────────────────────────────────────────

export type OpenAIImageModel =
  | "gpt-image-2"        // April 2026 flagship — 4x faster, better text + layout
  | "gpt-image-1.5"      // previous flagship (being deprecated as default)
  | "gpt-image-1"        // legacy
  | "gpt-image-1-mini"   // smaller / faster tier of the 1-series
  | "dall-e-3";          // legacy text-only

export type OpenAIImageSize =
  | "auto"
  | "1024x1024"   // 1:1 square
  | "1024x1536"   // portrait (2:3 family)
  | "1536x1024"   // landscape (3:2 family)
  // dall-e-3 legacy sizes (kept for the dall-e-3 code path)
  | "1792x1024"
  | "1024x1792"
  // gpt-image-2 — additional sizes (Image API; generations path). Edits stay on 1024-class.
  | "1152x2048"
  | "2048x1152"
  | "2048x2048"
  | "2160x3840"
  | "2880x2880"
  | "3840x2160";

export type OpenAIImageQuality =
  | "auto"
  | "low"
  | "medium"
  | "high"
  // dall-e-3 aliases (kept for backward compatibility with that model)
  | "standard"
  | "hd";

export type OpenAIImageBackground = "auto" | "transparent" | "opaque";

export type OpenAIOutputFormat = "png" | "jpeg" | "webp";

export interface OpenAIReferenceImage {
  /** Raw base64 (no data-URL prefix). Same shape as Gemini's `inlineData.data`. */
  data: string;
  /** e.g. "image/png" or "image/jpeg". */
  mimeType: string;
}

export interface OpenAIImageParams {
  prompt: string;
  model?: OpenAIImageModel;
  /** Caller-neutral aspect ratio — we map this to OpenAI's discrete sizes. */
  aspectRatio?: string;
  /** Caller-neutral resolution label — "standard" | "high" | "4k". */
  resolution?: string;
  /** Explicit size override — if set, wins over aspectRatio. */
  size?: OpenAIImageSize;
  /** Explicit quality override — if set, wins over resolution. */
  quality?: OpenAIImageQuality;
  /** gpt-image-1 only: "transparent" | "opaque". Defaults to "auto". */
  background?: OpenAIImageBackground;
  /** gpt-image-1 only: output file format. Defaults to "png". */
  outputFormat?: OpenAIOutputFormat;
  /** Number of images. Defaults to 1. */
  n?: number;
  /**
   * Reference images, already base64-decoded by the edge function. When one
   * or more are provided and the model supports edits (gpt-image-1), we route
   * to the /images/edits endpoint so the model conditions on them instead of
   * text-only generating. DALL-E 3 does not support edits; references are
   * ignored with a warning.
   */
  referenceImages?: OpenAIReferenceImage[];
  /** Optional — passed through to OpenAI for output telemetry / abuse. */
  user?: string;
}

export interface OpenAIImageResult {
  /** Raw base64 PNG/JPEG/WebP bytes — no data-URL prefix. */
  imageBase64: string;
  /** MIME type so the caller can upload with the right Content-Type. */
  mimeType: string;
  /** Which model actually produced the image. */
  model: OpenAIImageModel;
  /** "generations" or "edits" — useful for logs. */
  endpoint: "generations" | "edits";
  /** Revised prompt if OpenAI rewrote it (dall-e-3 does this). */
  revisedPrompt?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────

function getApiKey(): string {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) {
    throw new Error("OPENAI_API_KEY not configured");
  }
  return key;
}

/** Strip charset etc. from Content-Type so Blob types stay valid. */
function sanitizeMimeType(mime: string | undefined): string {
  if (!mime) return "image/png";
  return mime.split(";")[0].trim().toLowerCase() || "image/png";
}

/**
 * gpt-image-2 does not support transparent backgrounds (OpenAI docs).
 * Coerce so /generations and /edits don't 400 and silently fall back to Gemini.
 */
function effectiveBackground(
  model: OpenAIImageModel,
  requested: OpenAIImageBackground | undefined,
): OpenAIImageBackground {
  const v = requested ?? "auto";
  if (model === "gpt-image-2" && v === "transparent") {
    console.warn(
      "[OpenAI] gpt-image-2 does not support background=transparent — using opaque",
    );
    return "opaque";
  }
  return v;
}

/**
 * gpt-image-2 accepts many output sizes; map Madison resolution + aspect to
 * documented 2K/4K presets on the generations endpoint only.
 */
function mapGptImage2GenerationSize(
  aspectRatio: string | undefined,
  resolution: string | undefined,
): OpenAIImageSize {
  const tier = resolution === "4k"
    ? "4k"
    : resolution === "high"
    ? "high"
    : "standard";

  if (tier === "standard") {
    return mapAspectRatioToSize(aspectRatio, "gpt-image-2");
  }

  const r = (aspectRatio ?? "").trim().toLowerCase();
  const isSquare = r === "1:1" || r === "square" || r === "square_1_1";
  const isPortrait = (
    r === "9:16" || r === "2:3" || r === "3:4" || r === "1:2" ||
    r === "9:21" || r === "4:5" ||
    r.includes("portrait") || r.includes("vertical") || r.includes("social_story")
  );
  const isLandscape = (
    r === "16:9" || r === "3:2" || r === "4:3" || r === "2:1" ||
    r === "21:9" ||
    r.includes("widescreen") || r.includes("horizontal") || r.includes("landscape") ||
    r.includes("standard") || r.includes("classic") || r.includes("film_horizontal")
  );

  if (tier === "high") {
    if (isSquare) return "2048x2048";
    if (isPortrait) return "1152x2048";
    if (isLandscape) return "2048x1152";
    return "2048x2048";
  }

  // 4K tier — sizes from OpenAI gpt-image-2 docs (within pixel budget)
  if (isSquare) return "2880x2880";
  if (isPortrait) return "2160x3840";
  if (isLandscape) return "3840x2160";
  return "2880x2880";
}

/**
 * Map a caller-neutral aspect ratio ("1:1", "16:9", "9:16", "2:3", …) to one
 * of OpenAI's supported discrete sizes. gpt-image-1 only ships three shapes
 * (square, portrait, landscape), so anything tall-ish → portrait and anything
 * wide-ish → landscape. dall-e-3 has its own wide set but we keep the mapping
 * aligned on aspect family, not exact pixels.
 */
export function mapAspectRatioToSize(
  aspectRatio: string | undefined,
  model: OpenAIImageModel,
): OpenAIImageSize {
  if (!aspectRatio) return "1024x1024";

  const r = aspectRatio.trim().toLowerCase();

  // 1:1 family
  if (r === "1:1" || r === "square" || r === "square_1_1") {
    return "1024x1024";
  }

  // Portrait families → tall
  if (
    r === "9:16" || r === "2:3" || r === "3:4" || r === "1:2" ||
    r === "9:21" || r === "4:5" ||
    r.includes("portrait") || r.includes("vertical") || r.includes("social_story")
  ) {
    return model === "dall-e-3" ? "1024x1792" : "1024x1536";
  }

  // Landscape families → wide
  if (
    r === "16:9" || r === "3:2" || r === "4:3" || r === "2:1" ||
    r === "21:9" ||
    r.includes("widescreen") || r.includes("horizontal") || r.includes("landscape") ||
    r.includes("standard") || r.includes("classic") || r.includes("film_horizontal")
  ) {
    return model === "dall-e-3" ? "1792x1024" : "1536x1024";
  }

  return "1024x1024";
}

/**
 * Map Madison's "standard" | "high" | "4k" label to OpenAI's quality enum.
 * OpenAI caps at `high` for gpt-image-1, so "4k" maps there. DALL-E 3 uses
 * "standard" | "hd".
 */
export function mapResolutionToQuality(
  resolution: string | undefined,
  model: OpenAIImageModel,
): OpenAIImageQuality {
  if (model === "dall-e-3") {
    return resolution === "high" || resolution === "4k" ? "hd" : "standard";
  }
  // gpt-image-1
  if (resolution === "4k") return "high";
  if (resolution === "high") return "high";
  if (resolution === "standard") return "medium";
  return "auto";
}

function pickMimeType(format: OpenAIOutputFormat): string {
  switch (format) {
    case "jpeg": return "image/jpeg";
    case "webp": return "image/webp";
    case "png":
    default: return "image/png";
  }
}

async function downloadUrlAsBase64(
  url: string,
): Promise<{ data: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download OpenAI image URL: ${res.status}`);
  }
  const buf = await res.arrayBuffer();
  return {
    data: encode(buf),
    mimeType: sanitizeMimeType(res.headers.get("content-type") || undefined),
  };
}

// ─── Generation (text → image) ────────────────────────────────────────

async function generateViaGenerations(
  params: OpenAIImageParams,
  model: OpenAIImageModel,
): Promise<OpenAIImageResult> {
  const size = params.size ??
    (model === "gpt-image-2"
      ? mapGptImage2GenerationSize(params.aspectRatio, params.resolution)
      : mapAspectRatioToSize(params.aspectRatio, model));
  const quality = params.quality ?? mapResolutionToQuality(params.resolution, model);
  const outputFormat = params.outputFormat ?? "png";
  const background = effectiveBackground(model, params.background);

  const body: Record<string, unknown> = {
    model,
    prompt: params.prompt,
    n: params.n ?? 1,
    size,
  };

  // gpt-image-1 always returns base64; dall-e-3 can do either but we force
  // b64_json so the upload path downstream is uniform.
  if (model === "dall-e-3") {
    body.response_format = "b64_json";
    // dall-e-3 rejects "auto" quality.
    body.quality = quality === "auto" ? "standard" : quality;
  } else {
    body.quality = quality;
    body.background = background;
    body.output_format = outputFormat;
  }

  if (params.user) body.user = params.user;

  console.log(`[OpenAI] ${model} generations request:`, {
    size, quality: body.quality, n: body.n,
    promptLength: params.prompt.length,
    outputFormat,
  });

  const res = await fetch(`${OPENAI_API_BASE}/images/generations`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI images/generations error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const first = data?.data?.[0];
  if (!first) {
    throw new Error("OpenAI returned no image data");
  }

  let imageBase64: string | undefined = first.b64_json;
  let mimeType = pickMimeType(outputFormat);

  if (!imageBase64 && first.url) {
    // Safety net in case response_format wasn't honored (e.g. older dall-e-3).
    const downloaded = await downloadUrlAsBase64(first.url);
    imageBase64 = downloaded.data;
    mimeType = downloaded.mimeType;
  }

  if (!imageBase64) {
    throw new Error(`OpenAI image had no b64_json or url. Got: ${JSON.stringify(first)}`);
  }

  return {
    imageBase64,
    mimeType,
    model,
    endpoint: "generations",
    revisedPrompt: first.revised_prompt,
  };
}

// ─── Edits (image + prompt → image) ───────────────────────────────────

async function generateViaEdits(
  params: OpenAIImageParams,
  model: OpenAIImageModel,
  references: OpenAIReferenceImage[],
): Promise<OpenAIImageResult> {
  if (model === "dall-e-3") {
    // DALL-E 3 doesn't support /edits with free-form prompts — fall back.
    console.warn(
      `[OpenAI] ${model} does not support edits with reference images. ` +
      `Falling back to text-only generation.`,
    );
    return generateViaGenerations(params, model);
  }

  const size = params.size ?? mapAspectRatioToSize(params.aspectRatio, model);
  const quality = params.quality ?? mapResolutionToQuality(params.resolution, model);
  const outputFormat = params.outputFormat ?? "png";
  const background = effectiveBackground(model, params.background);

  const form = new FormData();
  form.append("model", model);
  form.append("prompt", params.prompt);
  form.append("n", String(params.n ?? 1));
  form.append("size", size);
  form.append("quality", quality);
  form.append("background", background);
  form.append("output_format", outputFormat);
  if (params.user) form.append("user", params.user);

  // gpt-image-1 /edits accepts multiple `image[]` parts. Order matters —
  // the edge function hands us product refs first, then background, then
  // style, so passing them through preserves that hierarchy.
  references.forEach((ref, idx) => {
    const bytes = Uint8Array.from(atob(ref.data), (c) => c.charCodeAt(0));
    const mime = sanitizeMimeType(ref.mimeType);
    const blob = new Blob([bytes], { type: mime });
    const ext = (mime.split("/")[1] || "png").replace("jpeg", "jpg");
    form.append("image[]", blob, `reference-${idx}.${ext}`);
  });

  console.log(`[OpenAI] ${model} edits request:`, {
    size, quality, refs: references.length,
    promptLength: params.prompt.length,
  });

  const res = await fetch(`${OPENAI_API_BASE}/images/edits`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${getApiKey()}` }, // multipart sets its own Content-Type
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI images/edits error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const first = data?.data?.[0];
  let imageBase64: string | undefined = first?.b64_json;
  let outMime = pickMimeType(outputFormat);

  if (!imageBase64 && first?.url) {
    const downloaded = await downloadUrlAsBase64(first.url);
    imageBase64 = downloaded.data;
    outMime = downloaded.mimeType;
  }

  if (!imageBase64) {
    throw new Error(`OpenAI edits had no b64_json or url. Got: ${JSON.stringify(first)}`);
  }

  return {
    imageBase64,
    mimeType: outMime,
    model,
    endpoint: "edits",
    revisedPrompt: first.revised_prompt,
  };
}

// ─── Public entry point ───────────────────────────────────────────────

/**
 * Generate an image via OpenAI. When reference images are provided and the
 * model supports edits, routes to /images/edits; otherwise /images/generations.
 */
export async function generateImage(
  params: OpenAIImageParams,
): Promise<OpenAIImageResult> {
  const model = params.model ?? resolveDefaultOpenAIImageModel();
  const refs = params.referenceImages ?? [];

  // /edits supports the entire gpt-image-* family. dall-e-3 is text-only.
  const supportsEdits = model.startsWith("gpt-image-");
  if (refs.length > 0 && supportsEdits) {
    return generateViaEdits(params, model, refs);
  }
  return generateViaGenerations(params, model);
}

// ─── UI metadata ──────────────────────────────────────────────────────

export const OPENAI_IMAGE_MODELS = [
  {
    id: "gpt-image-2",
    name: "GPT Image 2",
    description: "OpenAI's flagship — 4× faster, better text + layout",
    badge: "NEW",
    supportsReferences: true,
  },
  {
    id: "gpt-image-1.5",
    name: "GPT Image 1.5",
    description: "Previous flagship — being deprecated, still available",
    badge: "LEGACY",
    supportsReferences: true,
  },
  {
    id: "gpt-image-1",
    name: "GPT Image 1",
    description: "Older OpenAI image model",
    badge: null,
    supportsReferences: true,
  },
  {
    id: "gpt-image-1-mini",
    name: "GPT Image Mini",
    description: "Fast and inexpensive OpenAI image tier",
    badge: "FAST",
    supportsReferences: true,
  },
  {
    id: "dall-e-3",
    name: "DALL·E 3",
    description: "Legacy OpenAI model (text-only)",
    badge: null,
    supportsReferences: false,
  },
] as const;

export const OpenAIProvider = {
  generateImage,
  mapAspectRatioToSize,
  mapResolutionToQuality,
  OPENAI_IMAGE_MODELS,
};

export default OpenAIProvider;
