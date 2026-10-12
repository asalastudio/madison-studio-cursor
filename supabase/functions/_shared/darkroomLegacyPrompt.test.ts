import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  applyPropsAuthorityToText,
  assembleDarkRoomControlLayers,
  brandPaletteSetOnlyLine,
  buildEssentialModePrompt,
  catalogClosureLabel,
  catalogCrossCheckLine,
  lightingMandateBlock,
  proLightingDeltaBlock,
  resolvePropsAuthority,
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

  it("wires the same preset and props helpers into Essential and Director", () => {
    assert.match(director, /assembleDarkRoomControlLayers/);
    assert.match(director, /buildEssentialModePrompt\(\{/);
    assert.match(director, /backgroundPrompt,/);
    assert.match(director, /compositionPrompt,/);
    assert.match(director, /applyPropsAuthorityToText/);
    assert.doesNotMatch(director, /function buildEssentialModePrompt\(/);
    assert.doesNotMatch(director, /APPROVED PROPS:/);
  });
});

const BONE_STUDIO =
  "flat Bone #F5F3EF seamless studio background, premium product photography, soft upper-front-left key light, controlled contact shadow, no props";
const CENTERED_HERO =
  "Place the product prominently in the center of the frame as the hero subject. The product should dominate the composition, perfectly centered with the background scene framing it.";
const STORYTELLERS_PROPS = "- Include lifestyle props (wood surfaces, fabric, books, botanicals)";

describe("simple and Pro honor the same backdrop and composition presets", () => {
  it("includes Bone Studio and Centered Hero in Essential and Director control layers", () => {
    const artDirection = {
      backgroundPresetId: "studio-clean",
      backgroundPrompt: BONE_STUDIO,
      compositionPresetId: "hero-center",
      compositionPrompt: CENTERED_HERO,
    };

    const essential = buildEssentialModePrompt({
      userPrompt: "luxury shot",
      productRef: { url: "https://example.com/product.png" },
      artDirection,
    });
    const directorLayers = assembleDarkRoomControlLayers({
      userPrompt: "luxury shot",
      artDirection,
    });

    console.log("\n--- Essential Bone Studio (after) ---\n" + essential + "\n");
    console.log("\n--- Director control layers (after) ---\n" + [
      directorLayers.artDirectionBlock,
      directorLayers.propsBlock,
    ].filter(Boolean).join("\n") + "\n");

    for (const prompt of [essential, directorLayers.artDirectionBlock]) {
      assert.match(prompt, /BACKGROUND STYLE \(studio-clean\)/);
      assert.match(prompt, /#F5F3EF/);
      assert.match(prompt, /ARRANGEMENT \(hero-center\)/);
      assert.match(prompt, /center of the frame as the hero subject/);
    }

    assert.match(essential, /=== USER TWEAK ===\nluxury shot/);
    assert.ok(
      essential.indexOf("BACKGROUND STYLE") < essential.indexOf("=== USER TWEAK ==="),
      "set/shot layers should precede the user tweak in Essential",
    );
    assert.match(directorLayers.propsBlock, /PROPS AUTHORITY \(SET\): none/);
  });
});

describe("props authority", () => {
  it("lets an explicit user no-props choice win over template lifestyle props", () => {
    const authority = resolvePropsAuthority({
      userPrompt: "luxury shot, no props",
      setPrompt: "neutral backdrop with single eucalyptus branch",
    });
    assert.equal(authority.source, "user");
    assert.equal(authority.mode, "none");

    const stripped = applyPropsAuthorityToText(
      `${STORYTELLERS_PROPS}\nKeep composition minimal - product only, no props`,
      authority,
    );
    assert.doesNotMatch(stripped, /Include lifestyle props/);
    assert.match(
      assembleDarkRoomControlLayers({
        userPrompt: "luxury shot, no props",
        artDirection: { backgroundPrompt: "neutral backdrop with single eucalyptus branch" },
      }).propsBlock,
      /PROPS AUTHORITY \(USER\): none/,
    );
  });

  it("lets an explicit user prop request win over Bone Studio no-props", () => {
    const layers = assembleDarkRoomControlLayers({
      userPrompt: "luxury shot with a marble tray",
      artDirection: {
        backgroundPresetId: "studio-clean",
        backgroundPrompt: BONE_STUDIO,
      },
    });
    assert.equal(layers.authority.source, "user");
    assert.equal(layers.authority.mode, "required");
    assert.match(layers.propsBlock, /PROPS AUTHORITY \(USER\): required — marble tray/);
    assert.match(layers.artDirectionBlock, /BACKGROUND STYLE \(studio-clean\)/);
    assert.match(layers.artDirectionBlock, /#F5F3EF/);
    assert.doesNotMatch(layers.artDirectionBlock, /no props/i);
  });

  it("lets brand approved props win over Bone Studio no-props", () => {
    const layers = assembleDarkRoomControlLayers({
      userPrompt: "luxury shot",
      artDirection: { backgroundPrompt: BONE_STUDIO },
      brandApprovedProps: ["linen", "dried botanicals"],
    });
    assert.equal(layers.authority.source, "brand");
    assert.equal(layers.authority.mode, "approved");
    assert.match(layers.propsBlock, /PROPS AUTHORITY \(BRAND\): approved — linen, dried botanicals/);
    assert.doesNotMatch(layers.artDirectionBlock, /no props/i);
  });

  it("does not treat lighting language as a prop request", () => {
    const authority = resolvePropsAuthority({
      userPrompt: "luxury shot with soft lighting",
    });
    assert.equal(authority.mode, "unset");
  });
});
