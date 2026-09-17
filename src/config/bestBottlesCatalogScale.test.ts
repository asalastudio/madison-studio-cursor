import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BEST_BOTTLES_SCALE_CARD_CONTROL_POINTS,
  BEST_BOTTLES_SCALE_CARD_VERSION,
  BEST_BOTTLES_SCALE_CARD_GENERATE_HEIGHT_PX,
  BEST_BOTTLES_SCALE_CARD_DELIVER_HEIGHT_PX,
  BEST_BOTTLES_SCALE_CARD_BASELINE_PERCENT,
  resolveBestBottlesGlassScale,
} from "./bestBottlesCatalogScale";

const CYLINDER_PILOTS = [
  { label: "5 ml", heightWithoutCapMm: 53, glassHeightPct: 39.2 },
  { label: "9 Classic", heightWithoutCapMm: 70, glassHeightPct: 47.8 },
  { label: "9 Slim", heightWithoutCapMm: 106, glassHeightPct: 65.5 },
  { label: "50 ml", heightWithoutCapMm: 117, glassHeightPct: 68.0 },
  { label: "100 ml", heightWithoutCapMm: 154, glassHeightPct: 74.0 },
] as const;

describe("Best Bottles scale-card glass resolver", () => {
  it("pins the approved scale-card version and canvas contract", () => {
    assert.equal(BEST_BOTTLES_SCALE_CARD_VERSION, "best-bottles-scale-card-v1-2026-09-16");
    assert.equal(BEST_BOTTLES_SCALE_CARD_BASELINE_PERCENT, 91);
    assert.equal(BEST_BOTTLES_SCALE_CARD_GENERATE_HEIGHT_PX, 2288);
    assert.equal(BEST_BOTTLES_SCALE_CARD_DELIVER_HEIGHT_PX, 1716);
  });

  it("pins every approved control point exactly", () => {
    assert.deepEqual(
      BEST_BOTTLES_SCALE_CARD_CONTROL_POINTS.map(({ mm, glassPct }) => [mm, glassPct]),
      [
        [20, 23.0],
        [40, 33.0],
        [68, 46.7],
        [78, 52.4],
        [106, 65.5],
        [117, 68.0],
        [154, 74.0],
        [195, 80.0],
      ],
    );

    for (const point of BEST_BOTTLES_SCALE_CARD_CONTROL_POINTS) {
      const resolved = resolveBestBottlesGlassScale(point.mm);
      assert.equal(resolved.glassHeightPct, point.glassPct);
      assert.equal(
        resolved.targetGlassHeightPx,
        Math.round((point.glassPct / 100) * BEST_BOTTLES_SCALE_CARD_GENERATE_HEIGHT_PX),
      );
    }
  });

  it("interpolates monotonically between control points", () => {
    const samples = [];
    for (let mm = 20; mm <= 195; mm += 1) {
      samples.push(resolveBestBottlesGlassScale(mm).glassHeightPct);
    }
    for (let index = 1; index < samples.length; index += 1) {
      assert.ok(
        samples[index]! >= samples[index - 1]!,
        `expected monotone at mm=${20 + index} (${samples[index - 1]} -> ${samples[index]})`,
      );
    }
  });

  it("resolves nearest decade S-tags clamped to S20…S200", () => {
    assert.equal(resolveBestBottlesGlassScale(20).tag, "S20");
    assert.equal(resolveBestBottlesGlassScale(53).tag, "S50");
    assert.equal(resolveBestBottlesGlassScale(70).tag, "S70");
    assert.equal(resolveBestBottlesGlassScale(106).tag, "S110");
    assert.equal(resolveBestBottlesGlassScale(117).tag, "S120");
    assert.equal(resolveBestBottlesGlassScale(154).tag, "S150");
    assert.equal(resolveBestBottlesGlassScale(195).tag, "S200");
    assert.equal(resolveBestBottlesGlassScale(15).tag, "S20");
    assert.equal(resolveBestBottlesGlassScale(204).tag, "S200");
  });

  it("clamps heights outside the calibrated millimetre range", () => {
    assert.equal(resolveBestBottlesGlassScale(10).glassHeightPct, 23.0);
    assert.equal(resolveBestBottlesGlassScale(250).glassHeightPct, 80.0);
  });

  it("rejects invalid bare-glass height inputs", () => {
    assert.throws(() => resolveBestBottlesGlassScale(0), /positive.*height|bare-glass/i);
    assert.throws(() => resolveBestBottlesGlassScale(-5), /positive.*height|bare-glass/i);
    assert.throws(() => resolveBestBottlesGlassScale(Number.NaN), /positive.*height|bare-glass/i);
    assert.throws(
      () => resolveBestBottlesGlassScale(Number.POSITIVE_INFINITY),
      /positive.*height|bare-glass/i,
    );
  });

  it("pins the five Cylinder pilot targets to one decimal", () => {
    for (const pilot of CYLINDER_PILOTS) {
      const resolved = resolveBestBottlesGlassScale(pilot.heightWithoutCapMm);
      assert.equal(
        resolved.glassHeightPct,
        pilot.glassHeightPct,
        `${pilot.label} at ${pilot.heightWithoutCapMm} mm`,
      );
      assert.equal(
        resolved.targetGlassHeightPx,
        Math.round((pilot.glassHeightPct / 100) * BEST_BOTTLES_SCALE_CARD_GENERATE_HEIGHT_PX),
      );
    }
  });

  it("does not accept capacity as a scale input", () => {
    // Capacity must never drive glass scale: the public API is height-only.
    assert.equal(resolveBestBottlesGlassScale.length, 1);
    const fiveMlGlass = resolveBestBottlesGlassScale(53);
    const nineClassicGlass = resolveBestBottlesGlassScale(70);
    assert.notEqual(fiveMlGlass.glassHeightPct, nineClassicGlass.glassHeightPct);
    assert.equal(fiveMlGlass.glassHeightPct, 39.2);
    assert.equal(nineClassicGlass.glassHeightPct, 47.8);
  });
});
