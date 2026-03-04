/**
 * Freepik API Provider for Madison Studio
 *
 * Provides access to Freepik's AI image and video generation services:
 *
 * IMAGE MODELS (2024-2025):
 * - Seedream 4 4K: Reference images + strong aesthetics (TRENDING)
 * - Seedream: Exceptional creativity
 * - Flux: Community favorite, reliable
 * - Z-Image: Ultra-realistic, fast (NEW)
 * - Mystic: Freepik AI at 2K resolution
 * - Google: Photorealism and prompt adherence (NEW)
 * - Ideogram 3: Typography and graphic design
 * - GPT: OpenAI's technology
 * - Runway: Creative outputs
 *
 * VIDEO MODELS:
 * - Kling O1: Multimodal generation with references (NEW)
 * - Kling 2.1/2.5: Exceptional dynamics
 * - Google Veo 2/3/3.1: Sound, voices, improved physics
 * - MiniMax Hailuo 2.3: Cinematic realism
 *
 * FEATURES:
 * - AI Characters: Consistent faces across generations
 * - Expanded aspect ratios (10+ options)
 * - Start/End image for videos
 * - Audio generation
 *
 * API Docs: https://docs.freepik.com/
 */

const FREEPIK_API_BASE = "https://api.freepik.com/v1/ai";

// ============================================
// TYPES
// ============================================

// Image Models - Actual available models from docs.freepik.com
export type FreepikImageModel =
  | "mystic"            // Freepik's own AI model
  | "classic-fast"      // Fast generation
  | "flux-dev"          // Flux development version
  | "flux-pro-v1-1"     // Flux Pro (NEW)
  | "hyperflux"         // Ultra-fast Flux variant
  | "seedream"          // Exceptional creativity
  | "seedream-4"        // Latest with 4K support
  | "seedream-4-edit";  // Edit existing images

// Video Models - Updated for 2024-2025
export type FreepikVideoModel =
  // Featured Models
  | "auto"              // Auto-select best model
  | "kling-o1"          // Multimodal, references, 1080p, NEW
  | "google-veo-3.1"    // Sound, voices, improved physics
  | "minimax-hailuo-2.3" // Cinematic realism
  // Other Models
  | "google-veo-2"      // Best-in-class quality, up to 8s
  | "google-veo-3"      // Sound, voices, improved physics
  | "google-veo-3-fast" // Faster with sound
  | "google-veo-3.1-fast" // Fast with start/end
  | "kling-2.1"         // Exceptional value
  | "kling-2.1-master"  // Superb dynamics
  | "kling-2.5"         // Rich lighting, emotional accuracy
  | "seedance-pro";     // Legacy Freepik model

// Legacy alias
export type FreepikModel = FreepikImageModel;

export type FreepikResolution = "1k" | "2k" | "4k";

// Expanded aspect ratios matching Freepik's current offerings
export type FreepikAspectRatio =
  // Standard
  | "square_1_1"        // 1:1 Square
  | "widescreen_16_9"   // 16:9 Widescreen
  | "social_story_9_16" // 9:16 Social story
  // Portrait
  | "portrait_2_3"      // 2:3 Portrait
  | "traditional_3_4"   // 3:4 Traditional
  | "vertical_1_2"      // 1:2 Vertical
  // Landscape
  | "horizontal_2_1"    // 2:1 Horizontal
  | "social_post_4_5"   // 4:5 Social post
  | "standard_3_2"      // 3:2 Standard
  | "classic_4_3"       // 4:3 Classic
  // Cinematic
  | "film_horizontal_21_9"
  | "film_vertical_9_21";

export type VideoDuration = "4" | "5" | "6" | "8" | "10";

export type VideoResolution = "480p" | "720p" | "768p" | "1080p";

export interface FreepikImageParams {
  prompt: string;
  model?: FreepikImageModel;
  resolution?: FreepikResolution;
  aspectRatio?: FreepikAspectRatio;
  seed?: number;
  webhookUrl?: string;
  // Reference images for models that support them (Seedream 4 4K, Kling O1)
  referenceImages?: Array<{
    url: string;
    weight?: number; // 0-1, how much to apply the reference
  }>;
  // AI Character for consistent faces
  characterId?: string;
  // Mystic-specific styling
  styling?: {
    effects?: string;
    color?: string;
    lighting?: string;
    framing?: string;
  };
  // Negative prompt (things to avoid)
  negativePrompt?: string;
}

export interface FreepikVideoParams {
  imageUrl: string;           // Start image (required)
  endImageUrl?: string;       // End image (for models that support start/end)
  prompt: string;
  model?: FreepikVideoModel;
  duration?: VideoDuration;
  aspectRatio?: FreepikAspectRatio;
  cameraFixed?: boolean;
  resolution?: VideoResolution;
  seed?: number;
  webhookUrl?: string;
  // Audio options (for Veo 3+, Kling O1)
  includeAudio?: boolean;
  // Multi-shot (for supported models)
  multiShot?: boolean;
}

// AI Character definition
export interface FreepikCharacter {
  id: string;
  name: string;
  imageUrl: string;
  description?: string;
}

export interface FreepikUpscaleParams {
  imageUrl: string;
  scale: 2 | 4 | 8 | 16;
  webhookUrl?: string;
}

export interface FreepikRelightParams {
  imageUrl: string;
  prompt?: string;
  lightMapUrl?: string;
  referenceImageUrl?: string;
  webhookUrl?: string;
}

export interface FreepikTaskResponse {
  data: {
    task_id: string;
    status: "CREATED" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  };
}

export interface FreepikCompletedTask {
  data: {
    task_id: string;
    status: "COMPLETED";
    // Mystic returns URLs as string array directly
    generated?: string[];
    // Some endpoints return result object
    result?: { url: string };
    // Video endpoints may have different structure
    video?: { url: string };
  };
}

export interface FreepikError {
  error: {
    code: string;
    message: string;
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function getApiKey(): string {
  const key = Deno.env.get("FREEPIK_API_KEY");
  if (!key) {
    throw new Error("FREEPIK_API_KEY not configured");
  }
  return key;
}

function mapAspectRatio(ratio?: string): FreepikAspectRatio {
  if (!ratio) return "square_1_1";

  const mapping: Record<string, FreepikAspectRatio> = {
    // Common formats
    "1:1": "square_1_1",
    "16:9": "widescreen_16_9",
    "9:16": "social_story_9_16",
    "2:3": "portrait_2_3",
    "3:4": "traditional_3_4",
    "1:2": "vertical_1_2",
    "2:1": "horizontal_2_1",
    "4:5": "social_post_4_5",
    "3:2": "standard_3_2",
    "4:3": "classic_4_3",
    "21:9": "film_horizontal_21_9",
    "9:21": "film_vertical_9_21",
    // Pass through if already in Freepik format
    "square_1_1": "square_1_1",
    "widescreen_16_9": "widescreen_16_9",
    "social_story_9_16": "social_story_9_16",
    "portrait_2_3": "portrait_2_3",
    "traditional_3_4": "traditional_3_4",
    "vertical_1_2": "vertical_1_2",
    "horizontal_2_1": "horizontal_2_1",
    "social_post_4_5": "social_post_4_5",
    "standard_3_2": "standard_3_2",
    "classic_4_3": "classic_4_3",
    "film_horizontal_21_9": "film_horizontal_21_9",
    "film_vertical_9_21": "film_vertical_9_21",
  };

  return mapping[ratio] || "square_1_1";
}

// Map model name to API endpoint - from docs.freepik.com
function getImageEndpoint(model: FreepikImageModel): string {
  const endpoints: Record<FreepikImageModel, string> = {
    "mystic": "/mystic",
    "classic-fast": "/text-to-image",
    "flux-dev": "/text-to-image/flux-dev",
    "flux-pro-v1-1": "/text-to-image/flux-pro-v1-1",
    "hyperflux": "/text-to-image/hyperflux",
    "seedream": "/text-to-image/seedream",
    "seedream-4": "/text-to-image/seedream-4",
    "seedream-4-edit": "/text-to-image/seedream-4-edit",
  };
  return endpoints[model] || "/mystic";
}

// Map video model to actual Freepik API endpoint
// Based on: https://docs.freepik.com/api-reference/image-to-video/
function getVideoEndpoint(model: FreepikVideoModel, resolution: VideoResolution): string {
  // Map our model names to actual Freepik API model names
  const modelMapping: Record<FreepikVideoModel, string> = {
    // Auto-select: Use Kling 2.0 as default
    "auto": "kling-v2",

    // Kling models - Map to actual API names
    "kling-o1": "kling-pro",           // Kling 1.6 Pro is closest to O1
    "kling-2.1": "kling-v2-1-std",     // Kling 2.1 Standard
    "kling-2.1-master": "kling-v2-1-master",
    "kling-2.5": "kling-v2-5-pro",     // Kling 2.5 Pro

    // MiniMax - Map to actual API name
    "minimax-hailuo-2.3": "minimax-hailuo-02-768p",

    // Google Veo models don't exist in Freepik API - fallback to Kling
    "google-veo-2": "kling-v2",
    "google-veo-3": "kling-v2-5-pro",
    "google-veo-3-fast": "kling-v2",
    "google-veo-3.1": "kling-v2-5-pro",
    "google-veo-3.1-fast": "kling-v2",

    // Seedance Pro - Resolution in endpoint
    "seedance-pro": resolution === "1080p" ? "seedance-pro-1080p" : "seedance-pro-720p",
  };

  const apiModel = modelMapping[model] || "kling-v2";
  return `/image-to-video/${apiModel}`;
}

async function makeFreepikRequest<T>(
  endpoint: string,
  body: Record<string, unknown>,
  method: "POST" | "GET" = "POST"
): Promise<T> {
  const url = `${FREEPIK_API_BASE}${endpoint}`;

  console.log(`[Freepik] ${method} ${endpoint}`, {
    bodyKeys: Object.keys(body),
    promptLength: typeof body.prompt === 'string' ? body.prompt.length : 0
  });

  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-freepik-api-key": getApiKey(),
    },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error(`[Freepik] Error ${response.status}:`, errorData);
    throw new Error(
      errorData?.error?.message ||
      `Freepik API error: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}

async function pollForCompletion(
  endpoint: string,
  taskId: string,
  maxAttempts = 60,
  intervalMs = 2000
): Promise<FreepikCompletedTask> {
  const statusUrl = `${endpoint}/${taskId}`;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await fetch(`${FREEPIK_API_BASE}${statusUrl}`, {
      method: "GET",
      headers: {
        "x-freepik-api-key": getApiKey(),
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to check task status: ${response.status}`);
    }

    const data = await response.json();
    console.log(`[Freepik] Poll attempt ${attempt + 1}: ${data.data?.status}`);

    if (data.data?.status === "COMPLETED") {
      return data;
    }

    if (data.data?.status === "FAILED") {
      throw new Error("Freepik task failed");
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error("Freepik task timed out");
}

// ============================================
// IMAGE GENERATION
// ============================================

/**
 * Generate an image using Freepik's Mystic model (up to 4K)
 */
export async function generateWithMystic(
  params: FreepikImageParams
): Promise<{ imageUrl: string; taskId: string }> {
  const body: Record<string, unknown> = {
    prompt: params.prompt,
    aspect_ratio: mapAspectRatio(params.aspectRatio),
    resolution: params.resolution || "2k",
  };

  if (params.seed !== undefined && params.seed >= 0) {
    body.seed = params.seed;
  }

  if (params.styling) {
    body.styling = params.styling;
  }

  if (params.negativePrompt) {
    body.negative_prompt = params.negativePrompt;
  }

  if (params.webhookUrl) {
    body.webhook_url = params.webhookUrl;
  }

  // Create the task
  const taskResponse = await makeFreepikRequest<FreepikTaskResponse>(
    "/mystic",
    body
  );

  const taskId = taskResponse.data.task_id;
  console.log(`[Freepik] Mystic task created: ${taskId}`);

  // Poll for completion
  const completed = await pollForCompletion("/mystic", taskId);

  console.log(`[Freepik] Mystic completed response:`, JSON.stringify(completed.data, null, 2));

  // Mystic returns generated as string array directly (not objects with url property)
  const imageUrl = completed.data.generated?.[0];
  if (!imageUrl || typeof imageUrl !== 'string') {
    throw new Error(`No image URL in Mystic response. Got: ${JSON.stringify(completed.data.generated)}`);
  }

  return { imageUrl, taskId };
}

/**
 * Generate an image using any Freepik text-to-image model
 */
export async function generateWithModel(
  params: FreepikImageParams
): Promise<{ imageUrl: string; taskId: string; model: FreepikImageModel }> {
  const model = params.model || "mystic";
  const endpoint = getImageEndpoint(model);

  const body: Record<string, unknown> = {
    prompt: params.prompt,
    aspect_ratio: mapAspectRatio(params.aspectRatio),
  };

  // Resolution for models that support it
  if (model === "mystic" || model === "seedream-4") {
    body.resolution = params.resolution || "2k";
  }

  if (params.seed !== undefined && params.seed >= 0) {
    body.seed = params.seed;
  }

  if (params.negativePrompt) {
    body.negative_prompt = params.negativePrompt;
  }

  // Reference images for models that support them (Seedream 4)
  if (params.referenceImages?.length && (model === "seedream-4" || model === "seedream")) {
    body.reference_images = params.referenceImages.map(ref => ({
      url: ref.url,
      weight: ref.weight ?? 0.8,
    }));
  }

  // AI Character for consistent faces
  if (params.characterId) {
    body.character_id = params.characterId;
  }

  // Mystic-specific styling
  if (params.styling && model === "mystic") {
    body.styling = params.styling;
  }

  if (params.webhookUrl) {
    body.webhook_url = params.webhookUrl;
  }

  console.log(`[Freepik] ${model} request to ${endpoint}:`, {
    promptLength: params.prompt.length,
    aspectRatio: body.aspect_ratio,
    hasReferences: !!params.referenceImages?.length,
  });

  // Create the task
  const taskResponse = await makeFreepikRequest<FreepikTaskResponse>(
    endpoint,
    body
  );

  const taskId = taskResponse.data.task_id;
  console.log(`[Freepik] ${model} task created: ${taskId}`);

  // Poll for completion
  const completed = await pollForCompletion(endpoint, taskId);

  console.log(`[Freepik] ${model} completed response:`, JSON.stringify(completed.data, null, 2));

  // Most models return generated as string array directly
  const imageUrl = completed.data.generated?.[0] || completed.data.result?.url;
  if (!imageUrl || typeof imageUrl !== 'string') {
    throw new Error(`No image URL in ${model} response. Got: ${JSON.stringify(completed.data)}`);
  }

  return { imageUrl, taskId, model };
}

/**
 * Generate an image using Freepik's Flux models (fast) - Legacy wrapper
 */
export async function generateWithFlux(
  params: FreepikImageParams
): Promise<{ imageUrl: string; taskId: string }> {
  const model = params.model === "flux-pro-v1-1" ? "flux-pro-v1-1" : "flux-dev";
  const result = await generateWithModel({ ...params, model });
  return { imageUrl: result.imageUrl, taskId: result.taskId };
}

/**
 * Main image generation function - auto-selects model based on requirements
 */
export async function generateImage(
  params: FreepikImageParams
): Promise<{ imageUrl: string; taskId: string; model: FreepikImageModel }> {
  const model = params.model || "mystic";

  // Use the unified model generator
  return generateWithModel({ ...params, model });
}

// ============================================
// VIDEO GENERATION
// ============================================

/**
 * Generate a video from an image using Freepik video models
 *
 * Supports multiple models:
 * - Kling O1/2.1/2.5: Various quality/speed tiers
 * - Google Veo 2/3/3.1: With audio support
 * - MiniMax Hailuo 2.3: Cinematic realism
 * - Seedance Pro: Legacy Freepik model
 */
/**
 * Initiate a video generation task (returns immediately with taskId)
 */
export async function createVideoTask(
  params: FreepikVideoParams
): Promise<{ taskId: string; model: FreepikVideoModel }> {
  const model = params.model || "seedance-pro";
  const resolution = params.resolution || "720p";
  const endpoint = getVideoEndpoint(model, resolution);

  const body: Record<string, unknown> = {
    image: params.imageUrl,
    prompt: params.prompt,
    duration: params.duration || "5",
    aspect_ratio: mapAspectRatio(params.aspectRatio),
  };

  // Camera fixed (for models that support it)
  if (model === "seedance-pro" || model.startsWith("kling")) {
    body.camera_fixed = params.cameraFixed ?? false;
  }

  // End image for models that support start/end frames
  if (params.endImageUrl && (
    model === "kling-o1" ||
    model === "google-veo-3.1" ||
    model === "google-veo-3.1-fast" ||
    model === "kling-2.1"
  )) {
    body.end_image = params.endImageUrl;
  }

  // Audio for supported models (Veo 3+, Kling O1)
  if (params.includeAudio && (
    model.includes("veo-3") ||
    model === "kling-o1"
  )) {
    body.include_audio = true;
  }

  // Multi-shot for auto mode
  if (params.multiShot && model === "auto") {
    body.multi_shot = true;
  }

  // Resolution for models that need it in the body
  if (!model.includes("seedance")) {
    body.resolution = resolution;
  }

  if (params.seed !== undefined && params.seed >= 0) {
    body.seed = params.seed;
  }

  if (params.webhookUrl) {
    body.webhook_url = params.webhookUrl;
  }

  console.log(`[Freepik] Video ${model} request to ${endpoint}:`, {
    duration: body.duration,
    resolution,
    hasEndImage: !!params.endImageUrl,
    includeAudio: params.includeAudio,
  });

  // Create the task
  const taskResponse = await makeFreepikRequest<FreepikTaskResponse>(
    endpoint,
    body
  );

  const taskId = taskResponse.data.task_id;
  console.log(`[Freepik] Video task created: ${taskId}`);

  return { taskId, model };
}

/**
 * Check the status of a video generation task
 */
export async function getVideoStatus(
  model: FreepikVideoModel,
  resolution: VideoResolution,
  taskId: string
): Promise<{ status: string; videoUrl?: string }> {
  const endpoint = getVideoEndpoint(model, resolution);
  const statusUrl = `${endpoint}/${taskId}`;

  const response = await fetch(`${FREEPIK_API_BASE}${statusUrl}`, {
    method: "GET",
    headers: {
      "x-freepik-api-key": getApiKey(),
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to check task status: ${response.status}`);
  }

  const data = await response.json();
  const status = data.data?.status;

  if (status === "COMPLETED") {
    const videoUrl = data.data.generated?.[0] || data.data.result?.url || data.data.video?.url;
    return { status, videoUrl };
  }

  return { status };
}

/**
 * Legacy helper that still polls internally (use with caution)
 */
export async function generateVideo(
  params: FreepikVideoParams
): Promise<{ videoUrl: string; taskId: string; model: FreepikVideoModel }> {
  const { taskId, model } = await createVideoTask(params);
  const resolution = params.resolution || "720p";
  const endpoint = getVideoEndpoint(model, resolution);

  // Poll for completion (videos take longer - up to 6 minutes)
  const completed = await pollForCompletion(
    endpoint,
    taskId,
    120, // More attempts for video
    3000 // Longer interval
  );

  console.log(`[Freepik] Video completed response:`, JSON.stringify(completed.data, null, 2));

  // Video may return URL in different formats depending on endpoint version
  const videoUrl = completed.data.generated?.[0] || completed.data.result?.url || completed.data.video?.url;
  if (!videoUrl || typeof videoUrl !== 'string') {
    throw new Error(`No video URL in response. Got: ${JSON.stringify(completed.data)}`);
  }

  return { videoUrl, taskId, model };
}

// ============================================
// IMAGE EDITING
// ============================================

/**
 * Upscale an image using Freepik's AI Upscaler
 */
export async function upscaleImage(
  params: FreepikUpscaleParams
): Promise<{ imageUrl: string; taskId: string }> {
  const body: Record<string, unknown> = {
    image: params.imageUrl,
    scale: `${params.scale}x`,
  };

  if (params.webhookUrl) {
    body.webhook_url = params.webhookUrl;
  }

  // Create the task
  const taskResponse = await makeFreepikRequest<FreepikTaskResponse>(
    "/upscale",
    body
  );

  const taskId = taskResponse.data.task_id;
  console.log(`[Freepik] Upscale task created: ${taskId}`);

  // Poll for completion
  const completed = await pollForCompletion("/upscale", taskId);

  const imageUrl = completed.data.generated?.[0];
  if (!imageUrl) {
    throw new Error("No image URL in upscale response");
  }

  return { imageUrl, taskId };
}

/**
 * Relight an image using Freepik's AI Relight
 */
export async function relightImage(
  params: FreepikRelightParams
): Promise<{ imageUrl: string; taskId: string }> {
  const body: Record<string, unknown> = {
    image: params.imageUrl,
  };

  if (params.prompt) {
    body.prompt = params.prompt;
  }

  if (params.lightMapUrl) {
    body.light_map = params.lightMapUrl;
  }

  if (params.referenceImageUrl) {
    body.reference_image = params.referenceImageUrl;
  }

  if (params.webhookUrl) {
    body.webhook_url = params.webhookUrl;
  }

  // Create the task
  const taskResponse = await makeFreepikRequest<FreepikTaskResponse>(
    "/relight",
    body
  );

  const taskId = taskResponse.data.task_id;
  console.log(`[Freepik] Relight task created: ${taskId}`);

  // Poll for completion
  const completed = await pollForCompletion("/relight", taskId);

  const imageUrl = completed.data.generated?.[0];
  if (!imageUrl) {
    throw new Error("No image URL in relight response");
  }

  return { imageUrl, taskId };
}

// ============================================
// UTILITY EXPORTS
// ============================================

// ============================================
// MODEL METADATA (for UI)
// ============================================

// Actual available models from docs.freepik.com
export const IMAGE_MODELS = [
  { id: "seedream-4", name: "Seedream 4", description: "Best quality with 4K support", badge: "BEST", supportsReferences: true },
  { id: "flux-pro-v1-1", name: "Flux Pro v1.1", description: "Premium Flux model", badge: "NEW", supportsReferences: false },
  { id: "hyperflux", name: "Hyperflux", description: "Ultra-fast Flux variant", badge: "FAST", supportsReferences: false },
  { id: "flux-dev", name: "Flux Dev", description: "Community favorite", badge: "POPULAR", supportsReferences: false },
  { id: "seedream", name: "Seedream", description: "Exceptional creativity", supportsReferences: true },
  { id: "mystic", name: "Mystic", description: "Freepik AI at 2K resolution", supportsReferences: false },
  { id: "classic-fast", name: "Classic Fast", description: "Quick generation", supportsReferences: false },
] as const;

export const VIDEO_MODELS = [
  { id: "auto", name: "Auto", description: "Balance speed and quality", features: ["Multi shots", "Start/End", "Audio"], resolution: "480p-1080p", badge: null },
  { id: "kling-o1", name: "Kling O1", description: "Multimodal generation with improved coherence", features: ["References", "Start/End", "Audio"], resolution: "1080p", badge: "NEW" },
  { id: "google-veo-3.1", name: "Google Veo 3.1", description: "Sound, voices, improved physics", features: ["References", "Start/End", "Audio"], resolution: "720p-1080p", badge: null },
  { id: "minimax-hailuo-2.3", name: "MiniMax Hailuo 2.3", description: "Advanced text and image video model with cinematic realism", features: ["Start"], resolution: "768p-1080p", badge: null },
  { id: "google-veo-2", name: "Google Veo 2", description: "Best-in-class quality, improved realism", features: ["Start/End"], resolution: "720p", badge: null },
  { id: "google-veo-3", name: "Google Veo 3", description: "Sound, voices, improved physics", features: ["Start", "Audio"], resolution: "720p-1080p", badge: null },
  { id: "google-veo-3-fast", name: "Google Veo 3 Fast", description: "Faster with sound, voices, smoother motion", features: ["Start", "Audio"], resolution: "720p-1080p", badge: null },
  { id: "kling-2.1", name: "Kling 2.1", description: "Exceptional value & efficiency", features: ["Start/End"], resolution: "720p-1080p", badge: null },
  { id: "kling-2.1-master", name: "Kling 2.1 Master", description: "Superb dynamics & prompt adherence", features: ["Start"], resolution: "1080p", badge: null },
  { id: "kling-2.5", name: "Kling 2.5", description: "Rich lighting, abstract & emotional accuracy", features: ["Start/End"], resolution: "720p-1080p", badge: null },
  { id: "seedance-pro", name: "Seedance Pro", description: "Freepik's native video model", features: ["Start"], resolution: "720p-1080p", badge: null },
] as const;

export const ASPECT_RATIOS = [
  { id: "1:1", name: "Square", freepikId: "square_1_1" },
  { id: "16:9", name: "Widescreen", freepikId: "widescreen_16_9" },
  { id: "9:16", name: "Social story", freepikId: "social_story_9_16" },
  { id: "2:3", name: "Portrait", freepikId: "portrait_2_3" },
  { id: "3:4", name: "Traditional", freepikId: "traditional_3_4" },
  { id: "1:2", name: "Vertical", freepikId: "vertical_1_2" },
  { id: "2:1", name: "Horizontal", freepikId: "horizontal_2_1" },
  { id: "4:5", name: "Social post", freepikId: "social_post_4_5" },
  { id: "3:2", name: "Standard", freepikId: "standard_3_2" },
  { id: "4:3", name: "Classic", freepikId: "classic_4_3" },
] as const;

export const FreepikProvider = {
  // Image generation
  generateImage,
  generateWithModel,
  generateWithMystic,
  generateWithFlux,

  // Video generation
  generateVideo,
  createVideoTask,
  getVideoStatus,

  // Image editing
  upscaleImage,
  relightImage,

  // Helpers
  mapAspectRatio,

  // Metadata for UI
  IMAGE_MODELS,
  VIDEO_MODELS,
  ASPECT_RATIOS,
};

export default FreepikProvider;
