import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BEST_BOTTLES_SCALE_CARD_CONTROL_POINTS,
  BEST_BOTTLES_SCALE_CARD_HEIGHT_BANDS,
  BEST_BOTTLES_SCALE_CARD_VERSION,
  BEST_BOTTLES_SCALE_CARD_GENERATE_HEIGHT_PX,
  BEST_BOTTLES_SCALE_CARD_DELIVER_HEIGHT_PX,
  BEST_BOTTLES_SCALE_CARD_BASELINE_PERCENT,
  isBestBottlesScaleCardV2SmallEnd,
  resolveBestBottlesGlassScale,
  resolveBestBottlesScaleCardBand,
} from "./bestBottlesCatalogScale";

const CYLINDER_PILOTS = [
  { label: "5 ml", heightWithoutCapMm: 53, glassHeightPct: 58, level: "Small" },
  { label: "9 Classic", heightWithoutCapMm: 70, glassHeightPct: 64, level: "Medium" },
  { label: "9 Slim", heightWithoutCapMm: 106, glassHeightPct: 70, level: "Large" },
  { label: "50 ml", heightWithoutCapMm: 117, glassHeightPct: 70, level: "Large" },
  { label: "100 ml", heightWithoutCapMm: 154, glassHeightPct: 74, level: "Standard" },
] as const;

describe("Best Bottles scale-card glass resolver", () => {
  it("pins the approved scale-card v2 version and canvas contract", () => {
    assert.equal(BEST_BOTTLES_SCALE_CARD_VERSION, "best-bottles-scale-card-v2-2026-09-18");
    assert.equal(BEST_BOTTLES_SCALE_CARD_BASELINE_PERCENT, 91);
    assert.equal(BEST_BOTTLES_SCALE_CARD_GENERATE_HEIGHT_PX, 2288);
    assert.equal(BEST_BOTTLES_SCALE_CARD_DELIVER_HEIGHT_PX, 1716);
  });

  it("pins the five ecommerce height bands", () => {
    assert.deepEqual(
      BEST_BOTTLES_SCALE_CARD_HEIGHT_BANDS.map((band) => [
        band.level,
        band.mmMinInclusive,
        band.mmMaxExclusive,
        band.glassPct,
      ]),
      [
        ["Mini", 0, 45, 52],
        ["Small", 45, 65, 58],
        ["Medium", 65, 95, 64],
        ["Large", 95, 135, 70],
        ["Standard", 135, Number.POSITIVE_INFINITY, 74],
      ],
    );
  });

  it("resolves discrete band fills for overlay control samples", () => {
    for (const point of BEST_BOTTLES_SCALE_CARD_CONTROL_POINTS) {
      const resolved = resolveBestBottlesGlassScale(point.mm);
      assert.equal(resolved.glassHeightPct, point.glassPct);
      assert.equal(resolved.level, point.level);
      assert.equal(resolved.tag, point.level);
      assert.equal(
        resolved.targetGlassHeightPx,
        Math.round((point.glassPct / 100) * BEST_BOTTLES_SCALE_CARD_GENERATE_HEIGHT_PX),
      );
    }
  });

  it("is monotone non-decreasing across bare-glass height", () => {
    const samples: number[] = [];
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

  it("uses half-open band boundaries", () => {
    assert.equal(resolveBestBottlesScaleCardBand(44.9).level, "Mini");
    assert.equal(resolveBestBottlesScaleCardBand(45).level, "Small");
    assert.equal(resolveBestBottlesScaleCardBand(64.9).level, "Small");
    assert.equal(resolveBestBottlesScaleCardBand(65).level, "Medium");
    assert.equal(resolveBestBottlesScaleCardBand(94.9).level, "Medium");
    assert.equal(resolveBestBottlesScaleCardBand(95).level, "Large");
    assert.equal(resolveBestBottlesScaleCardBand(134.9).level, "Large");
    assert.equal(resolveBestBottlesScaleCardBand(135).level, "Standard");
  });

  it("flags the small-end remaster cohort below Large", () => {
    assert.equal(isBestBottlesScaleCardV2SmallEnd(37), true);
    assert.equal(isBestBottlesScaleCardV2SmallEnd(70), true);
    assert.equal(isBestBottlesScaleCardV2SmallEnd(94.9), true);
    assert.equal(isBestBottlesScaleCardV2SmallEnd(95), false);
    assert.equal(isBestBottlesScaleCardV2SmallEnd(154), false);
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

  it("pins the five Cylinder pilot targets to ecommerce bands", () => {
    for (const pilot of CYLINDER_PILOTS) {
      const resolved = resolveBestBottlesGlassScale(pilot.heightWithoutCapMm);
      assert.equal(
        resolved.glassHeightPct,
        pilot.glassHeightPct,
        `${pilot.label} at ${pilot.heightWithoutCapMm} mm`,
      );
      assert.equal(resolved.level, pilot.level);
      assert.equal(
        resolved.targetGlassHeightPx,
        Math.round((pilot.glassHeightPct / 100) * BEST_BOTTLES_SCALE_CARD_GENERATE_HEIGHT_PX),
      );
    }
  });

  it("does not accept capacity as a scale input", () => {
    assert.equal(resolveBestBottlesGlassScale.length, 1);
    const fiveMlGlass = resolveBestBottlesGlassScale(53);
    const nineClassicGlass = resolveBestBottlesGlassScale(70);
    assert.notEqual(fiveMlGlass.glassHeightPct, nineClassicGlass.glassHeightPct);
    assert.equal(fiveMlGlass.glassHeightPct, 58);
    assert.equal(nineClassicGlass.glassHeightPct, 64);
  });

  it("raises the ecommerce floor vs legacy v1 undersize", () => {
    // v1 put 3 ml / 37 mm near 31.5% — too much empty canvas.
    assert.equal(resolveBestBottlesGlassScale(37).glassHeightPct, 52);
    assert.equal(resolveBestBottlesGlassScale(53).glassHeightPct, 58);
    // 100 ml stays at the Standard 74% floor.
    assert.equal(resolveBestBottlesGlassScale(154).glassHeightPct, 74);
  });
});
