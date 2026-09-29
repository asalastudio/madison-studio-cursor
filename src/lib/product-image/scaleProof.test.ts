import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateScaleProof,
  SCALE_PROOF_TOLERANCE_PCT,
} from "./scaleProof";

describe("evaluateScaleProof", () => {
  it("resolves 9 Classic target Medium / 64% with ±2 band", () => {
    const proof = evaluateScaleProof({ heightWithoutCapMm: 70 });
    assert.equal(proof.target.glassHeightPct, 64);
    assert.equal(proof.target.tag, "Medium");
    assert.equal(proof.tolerancePct, SCALE_PROOF_TOLERANCE_PCT);
    assert.deepEqual(proof.range, { min: 62, max: 66 });
    assert.equal(proof.verdict, "pending");
    assert.equal(proof.measuredGlassHeightPct, null);
    assert.equal(proof.baselinePercent, 91);
  });

  it("passes when measured glass height is within ±2%", () => {
    const proof = evaluateScaleProof({
      heightWithoutCapMm: 70,
      measuredGlassHeightPct: 65.0,
    });
    assert.equal(proof.verdict, "pass");
    assert.equal(proof.deltaPct, 1.0);
  });

  it("fails when measured glass height is outside ±2%", () => {
    const proof = evaluateScaleProof({
      heightWithoutCapMm: 53,
      measuredGlassHeightPct: 47.8,
    });
    assert.equal(proof.target.glassHeightPct, 58);
    assert.equal(proof.verdict, "fail");
    assert.equal(proof.deltaPct, -10.2);
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
