import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { buildPlacePrompt } from "./darkroomLightingLane";

const rightPanel = readFileSync(
  new URL("../components/darkroom/RightPanel.tsx", import.meta.url),
  "utf8",
);
const leftRail = readFileSync(
  new URL("../components/darkroom/LeftRail.tsx", import.meta.url),
  "utf8",
);
const visualMasters = readFileSync(
  new URL("../../supabase/functions/_shared/visualMasters.ts", import.meta.url),
  "utf8",
);

describe("Dark Room PR2: de-brand generic lanes", () => {
  it("makes Bone Studio brand-neutral and keeps #F5F3EF", () => {
    const studioBlock = rightPanel.slice(
      rightPanel.indexOf('id: "studio-clean"'),
      rightPanel.indexOf('id: "natural-stone"'),
    );
    assert.match(studioBlock, /#F5F3EF/);
    assert.doesNotMatch(studioBlock, /Best Bottles/);
  });

  it("removes lying-down products from Loose Scatter", () => {
    assert.doesNotMatch(rightPanel, /Some products can be lying down/);
  });

  it("gates schematic and stone-hero UI on the Best Bottles flag", () => {
    assert.match(leftRail, /showHeroSetPresets && \([\s\S]*Schematic preset/);
    assert.match(leftRail, /showHeroSetPresets && \([\s\S]*Best Bottles hero/);
  });

  it("keeps phenolic closures off the generic place prompt", () => {
    const generic = buildPlacePrompt("Travertine plinth, soft daylight.");
    assert.doesNotMatch(generic, /PHENOLIC PLASTIC/);

    const branded = buildPlacePrompt("Travertine plinth, soft daylight.", {
      includeBestBottlesClosureRule: true,
    });
    assert.match(branded, /PHENOLIC PLASTIC/);
  });

  it("drops Minimalist white background and cool grading so Bone can own the set", () => {
    const start = visualMasters.indexOf("case 'THE_MINIMALISTS':");
    const end = visualMasters.indexOf("case 'THE_STORYTELLERS':");
    const minimalist = visualMasters.slice(start, end);
    assert.doesNotMatch(minimalist, /Pure white \(#FFFFFF\)/);
    assert.doesNotMatch(minimalist, /COLOR GRADING:/);
    assert.doesNotMatch(minimalist, /Use warm color grading/);
    assert.match(minimalist, /COMPOSITION:/);
    assert.match(minimalist, /MOOD:/);
  });
});
