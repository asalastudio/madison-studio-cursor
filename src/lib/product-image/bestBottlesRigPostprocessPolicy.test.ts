import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { shouldRunBestBottlesRigPostprocess } from "./bestBottlesRigPostprocessPolicy";

describe("shouldRunBestBottlesRigPostprocess", () => {
  it("requires the rig pass for canonical Cylinder PDP studio masters", () => {
    const decision = shouldRunBestBottlesRigPostprocess({
      libraryTags: ["brand:best-bottles", "studio-master"],
      family: "Cylinder",
      aspectRatio: "10:11",
      canvas: { widthPx: 2080, heightPx: 2288 },
      sceneOverlay: undefined,
    });

    assert.deepEqual(decision, { run: true, reason: "rig-family-canonical-master" });
  });

  it("skips old Cylinder masters on the retired 1024 x 1536 canvas", () => {
    const decision = shouldRunBestBottlesRigPostprocess({
      libraryTags: ["brand:best-bottles", "studio-master"],
      family: "Cylinder",
      aspectRatio: "2:3",
      canvas: { widthPx: 1024, heightPx: 1536 },
      sceneOverlay: undefined,
    });

    assert.deepEqual(decision, { run: false, reason: "non-canonical-master-canvas" });
  });

  it("runs the rig for the explicit topology-wide preset", () => {
    const decision = shouldRunBestBottlesRigPostprocess({
      libraryTags: ["brand:best-bottles", "studio-master"],
      family: "Cylinder",
      presetId: "grid-card-wide-low-1536x1024",
      aspectRatio: "3:2",
      canvas: { widthPx: 1536, heightPx: 1024 },
      sceneOverlay: undefined,
    });

    assert.deepEqual(decision, { run: true, reason: "rig-family-canonical-master" });
  });

  it("does not treat a generic landscape preset as a governed wide master", () => {
    const decision = shouldRunBestBottlesRigPostprocess({
      libraryTags: ["brand:best-bottles", "studio-master"],
      family: "Cylinder",
      aspectRatio: "3:2",
      canvas: { widthPx: 1536, heightPx: 1024 },
      sceneOverlay: undefined,
    });

    assert.deepEqual(decision, { run: false, reason: "non-canonical-master-canvas" });
  });

  it("still runs for angle overlays when the canvas remains the canonical PDP master", () => {
    const decision = shouldRunBestBottlesRigPostprocess({
      libraryTags: ["brand:best-bottles", "studio-master", "angle"],
      family: "Cylinder",
      aspectRatio: "10:11",
      canvas: { widthPx: 2080, heightPx: 2288 },
      sceneOverlay: {
        backgroundPresetId: null,
        backgroundPrompt: null,
        aspectRatioOverride: "10:11",
        resolutionOverride: "standard",
      },
    });

    assert.equal(decision.run, true);
  });

  it("skips flexible scene or marketing generations that intentionally use a background", () => {
    const decision = shouldRunBestBottlesRigPostprocess({
      libraryTags: ["brand:best-bottles", "studio-master", "scene-flexible"],
      family: "Cylinder",
      aspectRatio: "16:9",
      canvas: { widthPx: 2560, heightPx: 1440 },
      sceneOverlay: {
        backgroundPresetId: "natural-stone",
        backgroundPrompt: "travertine slab studio scene",
        aspectRatioOverride: "16:9",
        resolutionOverride: "standard",
      },
    });

    assert.deepEqual(decision, { run: false, reason: "non-canonical-master-canvas" });
  });

  it("runs the universal PDP rig for non-custom families on canonical masters", () => {
    const decision = shouldRunBestBottlesRigPostprocess({
      libraryTags: ["brand:best-bottles", "studio-master"],
      family: "Diva",
      aspectRatio: "10:11",
      canvas: { widthPx: 2080, heightPx: 2288 },
      sceneOverlay: undefined,
    });

    assert.deepEqual(decision, { run: true, reason: "rig-family-canonical-master" });
  });
});
