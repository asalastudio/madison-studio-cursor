import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildOutputRatioChips,
  buildReframePrompt,
  canonicalizeAspectRatio,
  resolveLightTableOutput,
  sameAspectRatio,
} from "./lightTableOutputRatio";
import type { PreserveSourceCanvasConstraints } from "./imageCanvasMetadata";

const heroCanvas: PreserveSourceCanvasConstraints = {
  preserveSourceCanvas: true,
  outputCanvas: { width: 2688, height: 1152 },
};

describe("sameAspectRatio", () => {
  it("compares by value, so a measured 7:3 is the 21:9 chip", () => {
    assert.equal(sameAspectRatio("7:3", "21:9"), true);
    assert.equal(sameAspectRatio("10:11", "1:1"), false);
    assert.equal(sameAspectRatio("9:16", "16:9"), false);
  });

  it("never matches an unknown or malformed ratio", () => {
    assert.equal(sameAspectRatio(null, "1:1"), false);
    assert.equal(sameAspectRatio("wide", "16:9"), false);
    assert.equal(sameAspectRatio("0:1", "0:1"), false);
  });
});

describe("canonicalizeAspectRatio", () => {
  it("maps a reduced measurement onto the common ratio it equals", () => {
    assert.equal(canonicalizeAspectRatio("7:3"), "21:9");
    assert.equal(canonicalizeAspectRatio("2:3"), "2:3");
    assert.equal(canonicalizeAspectRatio("10:11"), "10:11");
    assert.equal(canonicalizeAspectRatio(null), null);
  });
});

describe("buildOutputRatioChips", () => {
  it("marks the common chip that equals the source, adding nothing", () => {
    const chips = buildOutputRatioChips("7:3");
    assert.equal(chips.length, 6);
    assert.deepEqual(
      chips.filter((chip) => chip.isSource).map((chip) => chip.value),
      ["21:9"],
    );
  });

  it("prepends an Original chip when the source matches no common ratio", () => {
    const chips = buildOutputRatioChips("10:11");
    assert.equal(chips.length, 7);
    assert.equal(chips[0].label, "Original");
    assert.equal(chips[0].value, "10:11");
    assert.equal(chips[0].isSource, true);
    assert.equal(chips.slice(1).some((chip) => chip.isSource), false);
  });

  it("marks nothing when the source ratio is unknown", () => {
    const chips = buildOutputRatioChips(null);
    assert.equal(chips.length, 6);
    assert.equal(chips.some((chip) => chip.isSource), false);
  });
});

describe("resolveLightTableOutput", () => {
  it("keeps the source ratio and its exact canvas when nothing is overridden", () => {
    const output = resolveLightTableOutput({
      sourceAspectRatio: "21:9",
      sourceImageConstraints: heroCanvas,
      outputRatioOverride: null,
      prompt: "soften the contact shadow",
    });
    assert.equal(output.aspectRatio, "21:9");
    assert.equal(output.imageConstraints, heroCanvas);
    assert.equal(output.prompt, "soften the contact shadow");
    assert.equal(output.reframe, null);
  });

  it("treats an override equal to the source by value as keeping it", () => {
    const output = resolveLightTableOutput({
      sourceAspectRatio: "7:3",
      sourceImageConstraints: heroCanvas,
      outputRatioOverride: "21:9",
      prompt: "",
    });
    assert.equal(output.aspectRatio, "7:3");
    assert.equal(output.imageConstraints, heroCanvas);
    assert.equal(output.prompt, "");
    assert.equal(output.reframe, null);
  });

  it("reframes: new ratio, no source-canvas pin, instruction after the edit", () => {
    const output = resolveLightTableOutput({
      sourceAspectRatio: "7:3",
      sourceImageConstraints: heroCanvas,
      outputRatioOverride: "9:16",
      prompt: "soften the contact shadow.",
    });
    assert.equal(output.aspectRatio, "9:16");
    assert.equal(output.imageConstraints, undefined);
    assert.deepEqual(output.reframe, { from: "21:9", to: "9:16" });
    assert.match(output.prompt, /^soften the contact shadow\. Reframe this exact scene to a 9:16 story\/reel canvas \(it was 21:9\)\./);
    assert.match(output.prompt, /Do not stretch, squash or crop the product\.$/);
  });

  it("reframes with an empty edit using the instruction alone", () => {
    const output = resolveLightTableOutput({
      sourceAspectRatio: null,
      sourceImageConstraints: undefined,
      outputRatioOverride: "4:5",
      prompt: "   ",
    });
    assert.equal(output.aspectRatio, "4:5");
    assert.deepEqual(output.reframe, { from: null, to: "4:5" });
    assert.match(output.prompt, /^Reframe this exact scene to a 4:5 social canvas\./);
    assert.doesNotMatch(output.prompt, /it was/);
  });

  it("falls back to 1:1 only when nothing is known and nothing is chosen", () => {
    const output = resolveLightTableOutput({
      sourceAspectRatio: undefined,
      sourceImageConstraints: undefined,
      outputRatioOverride: null,
      prompt: "warmer light",
    });
    assert.equal(output.aspectRatio, "1:1");
    assert.equal(output.reframe, null);
  });
});

describe("buildReframePrompt", () => {
  it("strips trailing punctuation from the edit before joining", () => {
    const prompt = buildReframePrompt("crop tighter...  ", { from: "1:1", to: "16:9" });
    assert.match(prompt, /^crop tighter\. Reframe this exact scene to a 16:9 landscape canvas \(it was 1:1\)\./);
  });
});
