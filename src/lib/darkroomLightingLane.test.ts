import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildPlacePrompt,
  buildSetPrompt,
  MATCH_LIGHT_PROMPT,
  planLightingLane,
  splitPlacementAddon,
} from "./darkroomLightingLane";
import { buildHeroSetPrompt } from "./darkroomHeroSetPresets";

const base = {
  hasProductReference: true,
  hasSetImage: false,
  backgroundPlateMode: false,
  styleReferenceMode: false,
};

describe("planLightingLane", () => {
  it("is the single request unless a product is there to place", () => {
    assert.deepEqual(planLightingLane({ ...base, lane: "single" }), []);
    assert.deepEqual(planLightingLane({ ...base, lane: "set-place", hasProductReference: false }), []);
    assert.deepEqual(planLightingLane({ ...base, lane: "set-place", backgroundPlateMode: true }), []);
    assert.deepEqual(planLightingLane({ ...base, lane: "set-place-match", styleReferenceMode: true }), []);
  });

  it("shoots the set first only when none is loaded", () => {
    assert.deepEqual(planLightingLane({ ...base, lane: "set-place" }), ["set", "place"]);
    assert.deepEqual(planLightingLane({ ...base, lane: "set-place", hasSetImage: true }), ["place"]);
  });

  it("adds the match pass on the three-pass lane", () => {
    assert.deepEqual(planLightingLane({ ...base, lane: "set-place-match" }), ["set", "place", "match"]);
    assert.deepEqual(planLightingLane({ ...base, lane: "set-place-match", hasSetImage: true }), ["place", "match"]);
  });
});

describe("splitPlacementAddon", () => {
  it("strips a hero preset's placement addon and remembers it", () => {
    const prompt = buildHeroSetPrompt("silver-travertine", { population: "place-product" });
    const { scenePrompt, hasPlacementAddon } = splitPlacementAddon(prompt);
    assert.equal(hasPlacementAddon, true);
    assert.doesNotMatch(scenePrompt, /Now place the product/);
    assert.ok(scenePrompt.length > 40);
  });

  it("strips the mood-mock addon without flagging hero framing", () => {
    const prompt = buildHeroSetPrompt("silver-travertine", { population: "mood-mock" });
    const { scenePrompt, hasPlacementAddon } = splitPlacementAddon(prompt);
    assert.equal(hasPlacementAddon, false);
    assert.doesNotMatch(scenePrompt, /stand-in/i);
  });

  it("leaves a plain prompt alone", () => {
    assert.deepEqual(splitPlacementAddon("  Cobalt roll-on on a stone plinth  "), {
      scenePrompt: "Cobalt roll-on on a stone plinth",
      hasPlacementAddon: false,
    });
  });
});

describe("pass prompts", () => {
  it("the set pass forbids the product", () => {
    const prompt = buildSetPrompt("Travertine plinth, soft daylight from upper camera-left.");
    assert.match(prompt, /^Travertine plinth/);
    assert.match(prompt, /No product, no bottle, no stand-in/);
  });

  it("the place pass carries the set description, the light contract and the framing", () => {
    const hero = buildPlacePrompt("Travertine plinth, soft daylight.", { heroFraming: true });
    assert.match(hero, /SET DESCRIPTION/);
    assert.match(hero, /INTEGRATE THE LIGHT/);
    assert.match(hero, /LEFT 45% of the frame/);
    assert.match(hero, /PHENOLIC PLASTIC, NOT METAL/);

    const general = buildPlacePrompt("Travertine plinth, soft daylight.");
    assert.doesNotMatch(general, /LEFT 45%/);
    assert.match(general, /focal point/);
  });

  it("the match pass changes only the light", () => {
    assert.match(MATCH_LIGHT_PROMPT, /change nothing else/);
    assert.match(MATCH_LIGHT_PROMPT, /Do not move, resize, restyle or replace/);
  });
});
