import "https://deno.land/x/xhr@0.1.0/mod.ts";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const CLAUDE_TEXT_MODEL =
  Deno.env.get("CLAUDE_TEXT_MODEL") ?? "claude-3-sonnet-20240229";
const GEMINI_TEXT_MODEL =
  Deno.env.get("GEMINI_TEXT_MODEL") ?? "models/gemini-3-pro-preview";
const GEMINI_IMAGE_MODEL =
  Deno.env.get("GEMINI_IMAGE_MODEL") ??
  "models/gemini-2.5-flash-image";
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
  negativePrompt?: string;
  seed?: number; // For variety - different seeds produce different variations
  referenceImages?: Array<{
    data: string;
    mimeType: string;
  }>;
  model?: string; // Optional model override (e.g., "models/gemini-2.0-flash-exp")
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
  
  // Add the text prompt AFTER the images
  parts.push({ text: request.prompt });

  const body: Record<string, unknown> = {
    contents: [{
      role: "user",
      parts: parts,
    }],
  };

  // Add generation config with aspect ratio, seed, and negative prompt if provided
  body.generationConfig = {
    responseModalities: ["IMAGE"],
  };
  
  if (request.negativePrompt) {
    (body.generationConfig as any).negativePrompt = request.negativePrompt;
  }
  
  // Add seed for variety (if Gemini API supports it)
  if (request.seed !== undefined) {
    (body.generationConfig as any).seed = request.seed;
  }

  console.log(`🤖 Calling Gemini model: ${modelToUse}`);

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

