import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const darkRoom = readFileSync(new URL("../pages/DarkRoom.tsx", import.meta.url), "utf8");
const director = readFileSync(
  new URL("../../supabase/functions/generate-madison-image/index.ts", import.meta.url),
  "utf8",
);
const rightPanel = readFileSync(
  new URL("../components/darkroom/RightPanel.tsx", import.meta.url),
  "utf8",
);

describe("Dark Room PR1: no client concatenation or randomness", () => {
  it("does not append Background: or Composition: onto the typed prompt", () => {
    assert.doesNotMatch(
      darkRoom,
      /effectivePrompt = `\$\{effectivePrompt\}\. Background:/,
    );
    assert.doesNotMatch(
      darkRoom,
      /effectivePrompt = `\$\{effectivePrompt\}\. Composition:/,
    );
  });

  it("still sends preset IDs and the resolved prompt texts as separate fields", () => {
    assert.match(darkRoom, /backgroundPresetId:\s*selectedBackgroundPreset/);
    assert.match(darkRoom, /backgroundPrompt:\s*appliedBackgroundPrompt/);
    assert.match(darkRoom, /compositionPresetId:/);
    assert.match(darkRoom, /compositionPrompt:/);
  });

  it("collapses getRandomBackgroundVariation to a fixed first variation", () => {
    assert.doesNotMatch(rightPanel, /Math\.random\(\)/);
    assert.match(rightPanel, /pickFixedBackgroundVariation/);
  });

  it("removes Director random lighting/composition, 8K, and beige-frame negatives", () => {
    assert.doesNotMatch(director, /Date\.now\(\)\s*%\s*lightingVariations/);
    assert.doesNotMatch(director, /Date\.now\(\)\s*\+\s*1\)\s*%\s*compositionStyles/);
    assert.doesNotMatch(director, /8K resolution/);
    assert.doesNotMatch(director, /beige frames/);
    assert.doesNotMatch(
      director,
      /prompt \+= `COMPOSITION: \$\{artDirectionControls\.compositionPrompt\}/,
    );
  });
});
