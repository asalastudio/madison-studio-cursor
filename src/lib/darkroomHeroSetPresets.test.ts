import test from "node:test";
import assert from "node:assert/strict";
import {
  BEST_BOTTLES_HERO_SET_PRESETS,
  HERO_SET_ASPECT_RATIO,
  HERO_SET_CANVAS,
  MOOD_MOCK_ADDON,
  buildHeroSetPrompt,
  getHeroSetPreset,
  heroSetPromptOmissions,
} from "./darkroomHeroSetPresets";

test("ships ten distinct hero directions", () => {
  assert.equal(BEST_BOTTLES_HERO_SET_PRESETS.length, 10);
  const ids = BEST_BOTTLES_HERO_SET_PRESETS.map((p) => p.id);
  assert.equal(new Set(ids).size, 10, "preset ids must be unique");
  const labels = BEST_BOTTLES_HERO_SET_PRESETS.map((p) => p.label);
  assert.equal(new Set(labels).size, 10, "labels must be unique");
});

test("every prompt carries all four anti-rework rules", () => {
  for (const preset of BEST_BOTTLES_HERO_SET_PRESETS) {
    assert.deepEqual(
      heroSetPromptOmissions(preset.prompt),
      [],
      `${preset.id} is missing required prompt clauses`,
    );
  }
});

test("the canvas satisfies every GPT Image 2.5 size constraint", () => {
  const { widthPx, heightPx } = HERO_SET_CANVAS;
  assert.equal(widthPx % 16, 0, "width must be a multiple of 16");
  assert.equal(heightPx % 16, 0, "height must be a multiple of 16");
  assert.ok(widthPx <= 3840 && heightPx <= 3840, "neither edge may exceed 3840");

  const ratio = widthPx / heightPx;
  assert.ok(ratio <= 3 && ratio >= 1 / 3, "aspect must sit between 1:3 and 3:1");

  const totalPixels = widthPx * heightPx;
  assert.ok(totalPixels >= 655_360, "below the minimum pixel budget");
  assert.ok(totalPixels <= 8_294_400, "above the maximum pixel budget");
});

test("the canvas is the 21:9 the site actually uses", () => {
  assert.equal(HERO_SET_ASPECT_RATIO, "21:9");
  // 2688x1152 is 7:3 exactly; the site calls its ultra-wide slot 21:9.
  assert.ok(Math.abs(HERO_SET_CANVAS.widthPx / HERO_SET_CANVAS.heightPx - 21 / 9) < 0.02);
});

test("no prompt invites a product into an empty set", () => {
  for (const preset of BEST_BOTTLES_HERO_SET_PRESETS) {
    assert.match(preset.prompt, /no bottles, no jars, no products/i, preset.id);
    assert.doesNotMatch(preset.prompt, /\bplace (?:three|a|the) .*bottle/i, preset.id);
  }
});

test("the mood mock is opt-in and grounds every placeholder", () => {
  const plain = buildHeroSetPrompt("silver-travertine");
  assert.doesNotMatch(plain, /placeholders/i);

  const mocked = buildHeroSetPrompt("silver-travertine", { includeMoodMock: true });
  assert.ok(mocked.startsWith(plain), "the add-on appends, never rewrites");
  assert.ok(mocked.includes(MOOD_MOCK_ADDON));
  assert.match(MOOD_MOCK_ADDON, /contact shadow directly beneath/i);
  assert.match(MOOD_MOCK_ADDON, /none of them floats/i);
  assert.match(MOOD_MOCK_ADDON, /left 45%/i);
});

test("an unknown id falls back to the control direction", () => {
  assert.equal(
    getHeroSetPreset("does-not-exist" as never).id,
    "silver-travertine",
  );
});

test("the omission checker actually fails an incomplete prompt", () => {
  const omissions = heroSetPromptOmissions("A nice set with some stone.");
  assert.ok(omissions.length >= 5, "a bare prompt must report multiple omissions");
  assert.ok(omissions.some((o) => o.includes("LEFT 45%")));
});
