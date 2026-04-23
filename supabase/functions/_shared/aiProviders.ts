import "https://deno.land/x/xhr@0.1.0/mod.ts";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const CLAUDE_TEXT_MODEL =
  Deno.env.get("CLAUDE_TEXT_MODEL") ?? "claude-3-sonnet-20240229";
const GEMINI_TEXT_MODEL =
  Deno.env.get("GEMINI_TEXT_MODEL") ?? "models/gemini-3-pro-preview";
const GEMINI_IMAGE_MODEL =
  Deno.env.get("GEMINI_IMAGE_MODEL") ??
  "models/gemini-3.1-flash-image-preview";
const GEMINI_API_ENDPOINT =
  Deno.env.get("GEMINI_API_ENDPOINT") ??
  "https://generativelanguage.googleapis.com/v1beta";
const AI_REQUEST_TIMEOUT_MS = Number(
  Deno.env.get("AI_REQUEST_TIMEOUT_MS") ?? "60000",
);

export interface GenerateTextOptions {
  prompt?: string;
  systemPrompt?: string;
  messages?: Array<{
    role: "system" | "user" | "assistant";
    content: string | Array<Record<string, unknown>>;
  }>;
  temperature?: number;
  maxOutputTokens?: number;
}

interface ClaudeMessage {
  role: "user" | "assistant";
  content: Array<{ type: "text"; text: string }>;
}

interface GeminiContent {
  role: string;
  parts: Array<Record<string, unknown>>;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs = AI_REQUEST_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const result = await promise;
    clearTimeout(timeout);
    return result;
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

function toClaudeMessages(options: GenerateTextOptions): ClaudeMessage[] {
  if (options.messages && options.messages.length > 0) {
    return options.messages
      .filter((msg) => msg.role !== "system")
      .map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: [
          {
            type: "text",
            text: Array.isArray(msg.content)
              ? msg.content.map((part: any) => part?.text ?? "").join("\n")
              : (msg.content as string),
          },
        ],
      }));
  }

  return [{
    role: "user",
    content: [{ type: "text", text: options.prompt ?? "" }],
  }];
}

function convertDataUri(uri: string) {
  const matches = uri.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) return null;
  return {
    mimeType: matches[1],
    data: matches[2],
  };
}

function toGeminiContents(options: GenerateTextOptions): GeminiContent[] {
  if (options.messages && options.messages.length > 0) {
    return options.messages
      .filter((msg) => msg.role !== "system")
      .map((msg) => ({
        role: msg.role === "assistant" ? "model" : "user",
        parts: Array.isArray(msg.content)
          ? msg.content.map((part: any) => {
            if (part?.type === "image_url" && part.image_url?.url) {
              const inlineData = convertDataUri(part.image_url.url);
              if (inlineData) {
                return {
                  inlineData: {
                    data: inlineData.data,
                    mimeType: inlineData.mimeType,
                  },
                };
              }
              return {
                fileData: {
                  mimeType: "image/png",
                  fileUri: part.image_url.url,
                },
              };
            }
            return { text: String(part?.text ?? part ?? "") };
          })
          : [{ text: String(msg.content ?? "") }],
      }));
  }

  return [{
    role: "user",
    parts: [{ text: options.prompt ?? "" }],
  }];
}

export async function callClaude(
  options: GenerateTextOptions,
): Promise<string> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const body = {
    model: CLAUDE_TEXT_MODEL,
    max_tokens: options.maxOutputTokens ?? 4096,
    temperature: options.temperature ?? 0.7,
    system: options.systemPrompt ?? "",
    messages: toClaudeMessages(options),
  };

  const response = await withTimeout(
    fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }),
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const textBlock = data.content?.find?.((item: any) => item.type === "text");
  if (!textBlock?.text) {
    throw new Error("Claude response missing text");
  }
  return textBlock.text;
}

export async function callGeminiText(
  options: GenerateTextOptions,
): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  const requestBody: Record<string, unknown> = {
    contents: toGeminiContents(options),
    generationConfig: {
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxOutputTokens ?? 2048,
    },
  };

  if (options.systemPrompt) {
    requestBody.systemInstruction = {
      role: "system",
      parts: [{ text: options.systemPrompt }],
    };
  }

  const response = await withTimeout(
    fetch(
      `${GEMINI_API_ENDPOINT}/${GEMINI_TEXT_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      },
    ),
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];
  const part = candidate?.content?.parts?.find?.((p: any) => p.text);
  if (!part?.text) {
    throw new Error("Gemini response missing text");
  }
  return part.text;
}

export async function generateText(
  options: GenerateTextOptions,
): Promise<string> {
  try {
    return await callClaude(options);
  } catch (error) {
    console.warn("Claude failed, falling back to Gemini:", error);
    return await callGeminiText(options);
  }
}

export interface GeminiImageRequest {
  prompt: string;
  aspectRatio?: string;
  // Gemini image models accept "512" | "1K" | "2K" | "4K" via
  // generationConfig.imageConfig.imageSize. Default is 1K.
  imageSize?: "512" | "1K" | "2K" | "4K";
  negativePrompt?: string;
  seed?: number; // For variety - different seeds produce different variations
  referenceImages?: Array<{
    data: string;
    mimeType: string;
  }>;
  model?: string; // Optional model override (e.g., "models/gemini-2.0-flash-exp")
}

// Gemini image models accept a fixed set of aspect ratios, per
// https://ai.google.dev/gemini-api/docs/image-generation. Anything outside
// the set is silently ignored and the output reverts to square — so map
// unsupported ratios to the nearest supported one before calling.
const GEMINI_SUPPORTED_ASPECT_RATIOS = [
  "1:1",
  "1:4",
  "1:8",
  "2:3",
  "3:2",
  "3:4",
  "4:1",
  "4:3",
  "4:5",
  "5:4",
  "8:1",
  "9:16",
  "16:9",
  "21:9",
] as const;

export function normalizeGeminiAspectRatio(raw?: string): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if ((GEMINI_SUPPORTED_ASPECT_RATIOS as readonly string[]).includes(trimmed)) {
    return trimmed;
  }
  // Snap anything else to its closest supported neighbor.
  const parts = trimmed.split(":").map(Number);
  if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n) || n <= 0)) {
    return "1:1";
  }
  const target = parts[0] / parts[1];
  let best = "1:1";
  let bestDelta = Infinity;
  for (const candidate of GEMINI_SUPPORTED_ASPECT_RATIOS) {
    const [w, h] = candidate.split(":").map(Number);
    const delta = Math.abs(w / h - target);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = candidate;
    }
  }
  return best;
}

// Pixel dimensions the Gemini image model is expected to produce for each
// supported aspect ratio. Used when we need to reinforce the shape by
// writing explicit dimensions into the prompt — some API surfaces honor the
// imageConfig field, others require the prompt to state the dimensions.
const GEMINI_ASPECT_DIMENSIONS: Record<string, { width: number; height: number; label: string }> = {
  "1:1": { width: 1024, height: 1024, label: "square" },
  "2:3": { width: 832, height: 1248, label: "portrait" },
  "3:2": { width: 1248, height: 832, label: "landscape" },
  "3:4": { width: 896, height: 1184, label: "portrait" },
  "4:3": { width: 1184, height: 896, label: "landscape" },
  "4:5": { width: 912, height: 1136, label: "vertical social" },
  "5:4": { width: 1136, height: 912, label: "horizontal" },
  "9:16": { width: 768, height: 1344, label: "vertical story / reel" },
  "16:9": { width: 1344, height: 768, label: "widescreen landscape" },
  "21:9": { width: 1536, height: 672, label: "ultrawide banner" },
};

// Build a short, explicit aspect-ratio directive that we prepend to the
// prompt. This is the safety net for API versions that ignore imageConfig.
// Pixel counts scale with imageSize so we do not contradict imageConfig.imageSize
// (e.g. prompt said 1024×1024 while API asked for 2K).
export function buildAspectRatioDirective(
  aspectRatio?: string,
  imageSize?: "512" | "1K" | "2K" | "4K",
): string {
  const resolved = normalizeGeminiAspectRatio(aspectRatio);
  if (!resolved) return "";
  const dims = GEMINI_ASPECT_DIMENSIONS[resolved];
  if (!dims) return "";

  const tier = imageSize ?? "1K";
  const mul = tier === "4K" ? 4 : tier === "2K" ? 2 : tier === "512" ? 0.5 : 1;
  const w = Math.max(256, Math.round(dims.width * mul));
  const h = Math.max(256, Math.round(dims.height * mul));

  const shapeLine = resolved === "1:1"
    ? `The final image MUST be perfectly square (1:1) at ${w}×${h}.`
    : `The final image MUST preserve ${resolved} (${dims.label}) at ${w}×${h} — do not force a square crop.`;

  return (
    `OUTPUT DIMENSIONS (CRITICAL): Generate the image at exactly ${w}×${h} pixels ` +
    `(${resolved} aspect ratio, ${dims.label} orientation; output tier ${tier}). ` +
    `${shapeLine} Compose edge-to-edge with no frame or letterboxing.`
  );
}

export async function callGeminiImage(
  request: GeminiImageRequest,
) {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  // Use provided model or fall back to default
  const modelToUse = request.model || GEMINI_IMAGE_MODEL;

  // Build content parts array
  // CRITICAL: Reference images MUST come BEFORE the text prompt
  // This tells Gemini "here are the exact items to preserve" before giving instructions
  const parts: Array<Record<string, unknown>> = [];
  
  // Add reference images FIRST if provided (Gemini needs to "see" them before instructions)
  if (request.referenceImages?.length) {
    console.log(`📸 Adding ${request.referenceImages.length} reference images BEFORE prompt`);
    for (const img of request.referenceImages) {
      parts.push({
        inlineData: {
          data: img.data,
          mimeType: img.mimeType,
        },
      });
    }
  }

  // Resolve and normalize aspect ratio once. It's applied in three places:
  //   (a) generationConfig.imageConfig.aspectRatio — the canonical Gemini
  //       API field per https://ai.google.dev/gemini-api/docs/image-generation
  //   (b) prepended to the prompt text as an explicit dimensions directive
  //       (belt for older/edge model versions that ignore imageConfig)
  //   (c) used by the server-side center-crop in imageAspectRatio.ts
  //       (suspenders — guarantees correct shape even if both above fail)
  const resolvedAspectRatio = normalizeGeminiAspectRatio(request.aspectRatio);
  const aspectDirective = buildAspectRatioDirective(request.aspectRatio, request.imageSize);

  // Prepend the dimensions directive so it's the first instruction Gemini
  // reads in the text prompt. This is the most reliable lever — the model
  // will frame the composition for that shape even if it ignores the config
  // fields.
  const finalPrompt = aspectDirective
    ? `${aspectDirective}\n\n${request.prompt}`
    : request.prompt;
  parts.push({ text: finalPrompt });

  const body: Record<string, unknown> = {
    contents: [{
      role: "user",
      parts: parts,
    }],
  };

  // Add generation config with aspect ratio, seed, and negative prompt if provided
  const generationConfig: Record<string, unknown> = {
    responseModalities: ["IMAGE"],
  };

  // Gemini's canonical image-generation fields live at
  // generationConfig.imageConfig. Never put imageConfig at the top level —
  // that returns 400 "Unknown name imageConfig".
  const imageConfig: Record<string, unknown> = {};
  if (resolvedAspectRatio) {
    imageConfig.aspectRatio = resolvedAspectRatio;
  }
  if (request.imageSize) {
    // Valid values: "512" (Flash only), "1K", "2K", "4K"
    imageConfig.imageSize = request.imageSize;
  }
  if (Object.keys(imageConfig).length > 0) {
    generationConfig.imageConfig = imageConfig;
  }

  if (request.negativePrompt) {
    generationConfig.negativePrompt = request.negativePrompt;
  }

  if (request.seed !== undefined) {
    generationConfig.seed = request.seed;
  }

  body.generationConfig = generationConfig;

  console.log(`🤖 Calling Gemini model: ${modelToUse}`, {
    requestedAspectRatio: request.aspectRatio,
    resolvedAspectRatio,
    imageSize: request.imageSize ?? "default(1K)",
    strategy: "imageConfig + prompt-directive + server-side-crop",
    promptPreview: finalPrompt.slice(0, 180),
  });

  const response = await withTimeout(
    fetch(
      `${GEMINI_API_ENDPOINT}/${modelToUse}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    ),
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini image error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  // Try different response formats
  const candidate = data.candidates?.[0];
  const contentParts = candidate?.content?.parts || [];
  const imagePart = contentParts.find((p: any) => p.inlineData);
  
  if (imagePart?.inlineData) {
    return imagePart.inlineData;
  }
  
  // Fallback to old format
  const image = data.generatedImages?.[0]?.inlineData ??
    data.data?.[0];
  if (!image) {
    throw new Error("No image returned from Gemini");
  }

  return image;
}

