import { AI_MODEL_OPTIONS } from "@/config/imageSettings";

/**
 * Google image models `generate-madison-image` actually maps.
 * Do not list OpenAI / Auto / Freepik ids here — the Week 1 Batch node
 * only offers backends the edge function already accepts as Gemini.
 */
export const CANVAS_IMAGE_MODELS = AI_MODEL_OPTIONS.filter((option) => option.group === "gemini");

/**
 * Same id as `generate-madison-image`'s default `effectiveGeminiModel`
 * (`models/gemini-3-pro-image-preview`), without the `models/` prefix
 * used on the Gemini client.
 */
export const CANVAS_DEFAULT_IMAGE_MODEL = "gemini-3-pro-image-preview";

export function isCanvasImageModel(modelId: string): boolean {
  return CANVAS_IMAGE_MODELS.some((option) => option.value === modelId);
}

export function resolveCanvasImageModel(modelId: unknown): string {
  return typeof modelId === "string" && isCanvasImageModel(modelId)
    ? modelId
    : CANVAS_DEFAULT_IMAGE_MODEL;
}

export function canvasImageModelLabel(modelId: unknown): string {
  const resolved = resolveCanvasImageModel(modelId);
  return CANVAS_IMAGE_MODELS.find((option) => option.value === resolved)?.label ?? "Gemini 3.1 Pro";
}

export function buildDefaultBatchNodeData() {
  return {
    takes: 3,
    model: CANVAS_DEFAULT_IMAGE_MODEL,
  };
}

export function buildDefaultImageNodeData(name = "Image") {
  return {
    name,
    status: "idle",
    model: CANVAS_DEFAULT_IMAGE_MODEL,
  };
}
