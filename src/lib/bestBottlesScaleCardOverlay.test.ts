import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { BEST_BOTTLES_SCALE_CARD_BASELINE_PERCENT } from "./../config/bestBottlesCatalogScale.ts";
import {
  buildBestBottlesScaleCardLibraryTags,
  getCatalogHeroScaleReviewPath,
  resolveScaleCardOverlayModel,
  summarizeScaleCardOverlayModels,
} from "./bestBottlesScaleCardOverlay.ts";

const currentDir = dirname(fileURLToPath(import.meta.url));
const editorSource = readFileSync(
  resolve(currentDir, "../components/image-editor/ImageEditorModal.tsx"),
  "utf8",
);
const librarySource = readFileSync(
  resolve(currentDir, "../pages/ImageLibrary.tsx"),
  "utf8",
);

describe("Best Bottles scale-card library overlay", () => {
  it("makes the Sep 7 shoulder lock authoritative for a 5 ml Cylinder", () => {
    const model = resolveScaleCardOverlayModel({
      family: "Cylinder",
      graceSku: "GB-CYL-CLR-5ML-SPR-SGLD",
      capacityMl: 5,
      heightWithoutCap: "53 mm",
      canvasHeightPx: 2288,
      measuredShoulderYPx: 1217,
    });

    assert.equal(model.mode, "shoulder-lock");
    assert.equal(model.version, "shoulder-lock-2026-09-07");
    assert.equal(model.shoulder?.glassBodyKey, "cylinder:5-standard");
    assert.equal(model.shoulder?.targetShoulderPct, 36.5);
    assert.equal(model.shoulder?.targetTopPercent, 54.5);
    assert.equal(model.shoulder?.measuredTopPercent, 53.2);
    assert.equal(model.shoulder?.measuredShoulderPct, 37.8);
    assert.equal(model.ticks.length, 0);
    assert.equal(model.target, null);
    assert.equal(model.assembledTarget, null);
  });

  it("resolves the tall 9 ml lock from its measured glass height", () => {
    const model = resolveScaleCardOverlayModel({
      family: "Cylinder",
      capacityMl: 9,
      heightWithoutCap: "105 mm",
      canvasHeightPx: 2288,
      measuredShoulderYPx: 881,
    });

    assert.equal(model.mode, "shoulder-lock");
    assert.equal(model.shoulder?.glassBodyKey, "cylinder:9-tall");
    assert.equal(model.shoulder?.targetTopPercent, 28.5);
  });

  it("wires persisted shoulder evidence from Library reconciliation into the editor", () => {
    assert.match(librarySource, /measuredShoulderYPx:\s*reconciliation\.detected_shoulder_y_px/);
    assert.match(librarySource, /canvasHeightPx:\s*reconciliation\.canvas_height_px/);
    assert.match(librarySource, /shoulderConfidence:\s*reconciliation\.shoulder_confidence/);
    assert.match(editorSource, /measuredShoulderYPx:\s*image\.scaleCard\?\.measuredShoulderYPx/);
    assert.match(editorSource, /family:\s*image\.product\?\.family/);
    assert.match(editorSource, /return model\.shoulder \|\| model\.target \? model : null/);
  });

  it("builds durable height and target tags from a verified mm reading", () => {
    assert.deepEqual(
      buildBestBottlesScaleCardLibraryTags({ heightWithoutCapMm: 70 }),
      [
        "height-mm:70",
        "scale-tag:Medium",
        "scale-target-pct:64",
        "scale-proof:pending",
      ],
    );
    assert.deepEqual(
      buildBestBottlesScaleCardLibraryTags({
        heightWithoutCapMm: 70,
        measuredGlassHeightPct: 50.3,
      }),
      [
        "height-mm:70",
        "scale-tag:Medium",
        "scale-target-pct:64",
        "measured-glass-pct:50.3",
        "scale-proof:fail",
      ],
    );
    assert.deepEqual(
      buildBestBottlesScaleCardLibraryTags({ heightWithoutCapMm: null }),
      [],
    );
  });

  it("resolves the 91% baseline, control-point ticks, and SKU target rim", () => {
    const model = resolveScaleCardOverlayModel({
      tags: ["sku:GB-CYL-FRS-9ML-ROL-BKDT", "height-mm:70"],
    });

    assert.equal(model.baselinePercent, BEST_BOTTLES_SCALE_CARD_BASELINE_PERCENT);
    assert.equal(model.target?.tag, "Medium");
    assert.equal(model.target?.glassHeightPct, 64);
    assert.equal(model.target?.topPercent, 27);
    assert.equal(model.proof?.verdict, "pending");
    assert.equal(model.ticks.some((tick) => tick.tag === "Medium" && tick.isTarget), true);
    assert.equal(model.ticks.find((tick) => tick.mm === 37)?.glassHeightPct, 52);
    assert.equal(model.ticks.find((tick) => tick.mm === 154)?.glassHeightPct, 74);
    assert.equal(model.ticks.length, 5);
  });

  it("falls back to catalog heightWithoutCap when tags omit millimeters", () => {
    const model = resolveScaleCardOverlayModel({
      tags: ["sku:GB-CYL-FRS-9ML-ROL-BKDT"],
      heightWithoutCap: "70 ±1 mm",
      measuredGlassHeightPct: 63.5,
    });
    assert.equal(model.target?.heightWithoutCapMm, 70);
    assert.equal(model.measured?.glassHeightPct, 63.5);
    assert.equal(model.proof?.verdict, "pass");
  });

  it("draws the 98 mm assembled maximum from the 70 mm glass scale", () => {
    const model = resolveScaleCardOverlayModel({
      heightWithoutCap: "70 ±1 mm",
      heightWithCap: "98 ±1 mm",
      measuredGlassHeightPct: 64,
    });

    assert.equal(model.assembledTarget?.heightWithCapMm, 98);
    assert.equal(model.assembledTarget?.heightPct, 89.6);
    assert.equal(model.assembledTarget?.topPercent, 1.4);
  });

  it("still draws the generic scale card when no SKU height is known", () => {
    const model = resolveScaleCardOverlayModel({ tags: ["studio-master"] });
    assert.equal(model.target, null);
    assert.equal(model.proof, null);
    assert.equal(model.ticks.length, 5);
  });

  it("opens Catalog heroes with the scale-card overlay already on", () => {
    assert.equal(
      getCatalogHeroScaleReviewPath("Cylinder"),
      "/image-library?catalogHeroes=1&scaleCard=1&family=cylinder",
    );
  });

  it("summarizes pass / fail / pending / unknown for a finished batch", () => {
    const summary = summarizeScaleCardOverlayModels([
      resolveScaleCardOverlayModel({ heightWithoutCap: 70, measuredGlassHeightPct: 64 }),
      resolveScaleCardOverlayModel({ heightWithoutCap: 53, measuredGlassHeightPct: 47.8 }),
      resolveScaleCardOverlayModel({ heightWithoutCap: 106 }),
      resolveScaleCardOverlayModel({ tags: [] }),
    ]);
    assert.deepEqual(summary, { pass: 1, fail: 1, pending: 1, unknown: 1 });
  });
});
