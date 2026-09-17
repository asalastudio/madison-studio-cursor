import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateScaleProof,
  SCALE_PROOF_TOLERANCE_PCT,
} from "./scaleProof";

describe("evaluateScaleProof", () => {
  it("resolves 9 Classic target S70 / 47.8% with ±2 band", () => {
    const proof = evaluateScaleProof({ heightWithoutCapMm: 70 });
    assert.equal(proof.target.glassHeightPct, 47.8);
    assert.equal(proof.target.tag, "S70");
    assert.equal(proof.tolerancePct, SCALE_PROOF_TOLERANCE_PCT);
    assert.deepEqual(proof.range, { min: 45.8, max: 49.8 });
    assert.equal(proof.verdict, "pending");
    assert.equal(proof.measuredGlassHeightPct, null);
    assert.equal(proof.baselinePercent, 91);
  });

  it("passes when measured glass height is within ±2%", () => {
    const proof = evaluateScaleProof({
      heightWithoutCapMm: 70,
      measuredGlassHeightPct: 49.0,
    });
    assert.equal(proof.verdict, "pass");
    assert.equal(proof.deltaPct, 1.2);
  });

  it("fails when measured glass height is outside ±2%", () => {
    const proof = evaluateScaleProof({
      heightWithoutCapMm: 53,
      measuredGlassHeightPct: 47.8,
    });
    assert.equal(proof.target.glassHeightPct, 39.2);
    assert.equal(proof.verdict, "fail");
    assert.equal(proof.deltaPct, 8.6);
  });

  it("treats missing measurement as pending", () => {
    assert.equal(
      evaluateScaleProof({ heightWithoutCapMm: 106, measuredGlassHeightPct: null }).verdict,
      "pending",
    );
    assert.equal(
      evaluateScaleProof({ heightWithoutCapMm: 106 }).verdict,
      "pending",
    );
  });
});
