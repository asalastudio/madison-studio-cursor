import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BEST_BOTTLES_SCALE_CARD_PILOT_ROWS,
  buildBestBottlesScaleCardPilot,
  type ScaleCardPilotRow,
} from "./bestBottlesScaleCardPilotModel";
import { resolveBestBottlesGlassScale } from "@/config/bestBottlesCatalogScale";

const EXPECTED_PILOTS = [
  {
    id: "cyl-5ml",
    label: "5 ml",
    heightWithoutCapMm: 53,
    currentGlassHeightPct: 47.8,
    targetGlassHeightPct: 39.2,
    deltaPct: -18.0,
    tag: "S50",
  },
  {
    id: "cyl-9-classic",
    label: "9 Classic",
    heightWithoutCapMm: 70,
    currentGlassHeightPct: 53.2,
    targetGlassHeightPct: 47.8,
    deltaPct: -10.2,
    tag: "S70",
  },
  {
    id: "cyl-9-slim",
    label: "9 Slim",
    heightWithoutCapMm: 106,
    currentGlassHeightPct: 61.0,
    targetGlassHeightPct: 65.5,
    deltaPct: 7.4,
    tag: "S110",
  },
  {
    id: "cyl-50ml",
    label: "50 ml",
    heightWithoutCapMm: 117,
    currentGlassHeightPct: 63.8,
    targetGlassHeightPct: 68.0,
    deltaPct: 6.6,
    tag: "S120",
  },
  {
    id: "cyl-100ml",
    label: "100 ml",
    heightWithoutCapMm: 154,
    currentGlassHeightPct: 74.7,
    targetGlassHeightPct: 74.0,
    deltaPct: -0.9,
    tag: "S150",
  },
] as const;

describe("Best Bottles scale-card Cylinder pilot model", () => {
  it("pins exactly five Cylinder pilot bodies in review order", () => {
    assert.equal(BEST_BOTTLES_SCALE_CARD_PILOT_ROWS.length, 5);
    assert.deepEqual(
      BEST_BOTTLES_SCALE_CARD_PILOT_ROWS.map((row) => row.label),
      ["5 ml", "9 Classic", "9 Slim", "50 ml", "100 ml"],
    );
  });

  it("locks mm, current %, target %, delta, and S-tag for every pilot", () => {
    const pilot = buildBestBottlesScaleCardPilot();
    assert.equal(pilot.rows.length, 5);

    for (let index = 0; index < EXPECTED_PILOTS.length; index += 1) {
      const expected = EXPECTED_PILOTS[index]!;
      const row = pilot.rows[index]! as ScaleCardPilotRow;
      assert.equal(row.id, expected.id, expected.label);
      assert.equal(row.label, expected.label);
      assert.equal(row.heightWithoutCapMm, expected.heightWithoutCapMm);
      assert.equal(row.currentGlassHeightPct, expected.currentGlassHeightPct);
      assert.equal(row.targetGlassHeightPct, expected.targetGlassHeightPct);
      assert.equal(row.deltaPct, expected.deltaPct);
      assert.equal(row.tag, expected.tag);
      assert.equal(
        row.targetGlassHeightPx,
        resolveBestBottlesGlassScale(expected.heightWithoutCapMm).targetGlassHeightPx,
      );
    }
  });

  it("derives target % and S-tag from resolveBestBottlesGlassScale", () => {
    const pilot = buildBestBottlesScaleCardPilot();
    for (const row of pilot.rows) {
      const resolved = resolveBestBottlesGlassScale(row.heightWithoutCapMm);
      assert.equal(row.targetGlassHeightPct, resolved.glassHeightPct);
      assert.equal(row.tag, resolved.tag);
      assert.equal(row.targetGlassHeightPx, resolved.targetGlassHeightPx);
    }
  });

  it("computes delta as relative % change (target/current − 1), matching scale-card.json", () => {
    const pilot = buildBestBottlesScaleCardPilot();
    for (const row of pilot.rows) {
      const expected =
        Math.round((row.targetGlassHeightPct / row.currentGlassHeightPct - 1) * 1000) / 10;
      assert.equal(row.deltaPct, expected);
    }
  });

  it("keeps current and target on the same zoom baseline contract", () => {
    const pilot = buildBestBottlesScaleCardPilot();
    assert.equal(pilot.baselinePercent, 91);
    assert.equal(pilot.canvasHeightPx, 1716);
    assert.equal(pilot.sameZoom, true);
    for (const row of pilot.rows) {
      assert.ok(row.currentGlassHeightPct > 0);
      assert.ok(row.targetGlassHeightPct > 0);
      assert.equal(row.baselinePercent, 91);
    }
  });
});
