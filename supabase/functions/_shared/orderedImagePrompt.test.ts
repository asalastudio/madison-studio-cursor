import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BEST_BOTTLES_LIVE_SITE_BRAND_PROMPT,
  buildBestBottlesOnBrandPrompt,
  findPromptContradiction,
  OPENAI_IMAGE_MODEL_ID,
} from "./orderedImagePrompt.ts";

const BEFORE_LAYERS = {
  brandNotes: "Golden rule: moody dark editorial on a bone background #F5F3EF. Lighting: chiaroscuro.",
  product: "Cylinder 9ml clear glass bottle with a black metal roller cap. Empty. No sprayer.",
  shotType: "A clean studio product shot on a pure white background, soft shadow, high-resolution lighting.",
  style: [
    "High-end editorial perfume shot, dramatic lighting, deep contrast, cinematic tone.",
    "Do not use pure white backgrounds. Warm window light, lifestyle setting, film grain.",
    "Illustration style, painterly, moody dark.",
  ].join(" "),
  system: "LIGHTING: Soft, diffused studio lighting. Even illumination. No harsh shadows. ASPECT RATIO: 21:9.",
  negative: "NEGATIVE: clinical, pure white background, flash, sterile. Avoid blur and watermarks.",
  refine: "Create an image prompt in illustration style for a perfume. Mood: moody dark. Print BEST BOTTLES EAU DE PARFUM 100 ML on the label.",
  suffix: "Incorporate navy and gold color tones. Apply moody, illustration style aesthetic. hyperrealistic, 8k --ar 1:1 --style raw.",
};

describe("Best Bottles ordered image prompt", () => {
  it("uses gpt-image-2.5-flare and drops contradictory layers", () => {
    const result = buildBestBottlesOnBrandPrompt(BEFORE_LAYERS);

    assert.equal(OPENAI_IMAGE_MODEL_ID, "gpt-image-2.5-flare");
    assert.equal(findPromptContradiction(result.prompt), null);
    assert.match(result.prompt, /pure white #FFFFFF/);
    assert.match(result.prompt, /photorealistic/i);
    assert.match(result.prompt, /even illumination/i);
    assert.match(result.prompt, /Cylinder 9ml clear glass bottle/);
    assert.match(result.prompt, /Do not invent labels/);
    assert.doesNotMatch(result.prompt, /EAU DE PARFUM/);
    assert.doesNotMatch(result.prompt, /moody dark/i);
    assert.doesNotMatch(result.prompt, /illustration style/i);
    assert.doesNotMatch(result.prompt, /#F5F3EF/);
    assert.doesNotMatch(result.prompt, /21:9/);
    assert.ok(result.dropped.some((item) => item.reason === "even-light"));
    assert.ok(result.dropped.some((item) => item.reason === "no-invented-text"));
    assert.match(result.log, /"model":"gpt-image-2\.5-flare"/);
    assert.match(BEST_BOTTLES_LIVE_SITE_BRAND_PROMPT, /www\.bestbottles\.com/);
  });

  it("allows label text only when the product record supplies it", () => {
    const bare = buildBestBottlesOnBrandPrompt({ product: "Clear 10ml bottle." });
    assert.match(bare.prompt, /No label text was supplied/);
    assert.doesNotMatch(bare.prompt, /EAU DE PARFUM/);

    const labeled = buildBestBottlesOnBrandPrompt({
      product: "Clear 10ml bottle.",
      suppliedLabelText: "Nemat No. 4",
    });
    assert.match(labeled.prompt, /only text allowed anywhere in the image is this supplied label, rendered exactly: Nemat No\. 4/);
    assert.equal(findPromptContradiction(labeled.prompt), null);
  });
});
