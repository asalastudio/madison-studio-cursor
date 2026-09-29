import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AI_MODEL_OPTIONS } from "@/config/imageSettings";
import {
  CANVAS_DEFAULT_IMAGE_MODEL,
  CANVAS_IMAGE_MODELS,
  buildDefaultBatchNodeData,
  canvasImageModelLabel,
  isCanvasImageModel,
  resolveCanvasImageModel,
} from "./models";

describe("canvas image models", () => {
  it("defaults to the Google model generate-madison-image already uses", () => {
    assert.equal(CANVAS_DEFAULT_IMAGE_MODEL, "gemini-3-pro-image-preview");
    assert.equal(canvasImageModelLabel(undefined), "Gemini 3.1 Pro");
    assert.equal(buildDefaultBatchNodeData().model, CANVAS_DEFAULT_IMAGE_MODEL);
    assert.equal(buildDefaultBatchNodeData().takes, 3);
  });

  it("only lists Gemini ids the image backend maps", () => {
    assert.ok(CANVAS_IMAGE_MODELS.length > 0);
    for (const option of CANVAS_IMAGE_MODELS) {
      assert.equal(option.group, "gemini");
      assert.equal(isCanvasImageModel(option.value), true);
    }
    assert.deepEqual(
      CANVAS_IMAGE_MODELS.map((option) => option.value),
      AI_MODEL_OPTIONS.filter((option) => option.group === "gemini").map((option) => option.value),
    );
    assert.equal(CANVAS_IMAGE_MODELS.some((option) => /gpt|openai|auto|freepik/i.test(option.value)), false);
    assert.equal(CANVAS_IMAGE_MODELS.some((option) => /gpt image/i.test(option.label)), false);
  });

  it("rejects unsupported model ids instead of showing them", () => {
    assert.equal(resolveCanvasImageModel("GPT Image 2.5"), CANVAS_DEFAULT_IMAGE_MODEL);
    assert.equal(resolveCanvasImageModel("openai-image-2.5-sunburst"), CANVAS_DEFAULT_IMAGE_MODEL);
    assert.equal(resolveCanvasImageModel("gemini-3-pro-image-preview"), "gemini-3-pro-image-preview");
    assert.equal(isCanvasImageModel("openai-image-2.5-sunburst"), false);
  });
});
