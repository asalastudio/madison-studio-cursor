import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  brandPaletteSetOnlyLine,
  catalogClosureLabel,
  catalogCrossCheckLine,
  lightingMandateBlock,
  proLightingDeltaBlock,
} from "./darkroomLegacyPrompt.ts";

const director = readFileSync(
  new URL("../generate-madison-image/index.ts", import.meta.url),
  "utf8",
);

describe("catalog cross-check", () => {
  it("describes catalog closure once and tells the model the photo wins", () => {
    assert.equal(catalogClosureLabel({ isOil: false, isSpray: true }), "fine-mist sprayer");
    assert.equal(
      catalogClosureLabel({ isOil: true, isSpray: false }),
      "dropper, roller or screw cap",
    );
    assert.equal(catalogClosureLabel({ isOil: false, isSpray: false }), null);

    const line = catalogCrossCheckLine("fine-mist sprayer");
    assert.equal(
      line,
      "Catalog closure: fine-mist sprayer. This must match the reference; if it does not, reproduce the reference.",
    );
  });
});

describe("set-only palette and lighting authority", () => {
  it("applies the palette to the set only", () => {
    const line = brandPaletteSetOnlyLine([
      { name: "Bone", hex: "#F5F3EF" },
      { name: "Ink", hex: "#1A1816" },
    ]);
    assert.match(line, /COLOR PALETTE \(SET ONLY\)/);
    assert.match(line, /Bone \(#F5F3EF\)/);
    assert.match(line, /never to the product, glass, closure or liquid/);
  });

  it("states the brand lighting mandate once and labels Pro lighting as a delta", () => {
    const mandate = lightingMandateBlock("Soft key from upper-front-left.");
    const delta = proLightingDeltaBlock("soft box studio lighting");
    assert.match(mandate, /LIGHTING MANDATE \(MANDATORY\)/);
    assert.match(mandate, /only lighting authority/);
    assert.match(delta, /USER LIGHTING DELTA/);
    assert.match(delta, /does not conflict with the lighting mandate/);
  });
});

describe("legacy builder wiring", () => {
  it("no longer lets catalog closure override the reference photo", () => {
    assert.doesNotMatch(director, /THIS OVERRIDES ALL REFERENCE IMAGES/);
    assert.doesNotMatch(director, /If the reference image shows a dropper\/roller, IGNORE IT/);
    assert.doesNotMatch(director, /If the reference image shows a spray mechanism, IGNORE IT/);
    assert.match(director, /catalogCrossCheckLine/);
    assert.match(director, /brandPaletteSetOnlyLine/);
    assert.match(director, /USER LIGHTING DELTA|proLightingDeltaBlock/);
  });
});
