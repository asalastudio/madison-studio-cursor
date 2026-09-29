import assert from "node:assert/strict";
import test from "node:test";
import {
  allowsCapOffSidecarPreset,
  isAssembledOnlyVintageBulbIdentity,
  resolveAssembledOnlyCatalogPresetId,
  resolveAssembledOnlyGenerationState,
  resolveAssembledOnlyPdpMode,
} from "./bestBottlesAssembledOnlyProduct";

const CAP_OFF_SIDECAR_PRESET_ID = "grid-card-exploded-2000x2200";
const ASSEMBLED_GRID_PRESET_ID = "grid-card-2000x2200";

test("treats vintage bulb and vintage bulb tassel SKUs as assembled-only single images", () => {
  const assembledOnly = [
    { graceSku: "GB-CYL-CLR-50ML-ASP-BLK", websiteSku: "GBCyl50AnSpBlk" },
    { graceSku: "GB-CYL-CLR-50ML-AST-BLK", websiteSku: "GBCyl50AnSpTslBlk" },
    { graceSku: "GB-EMP-CLR-50ML-AST-RED", websiteSku: "GBEmp50AnSpTslRed" },
    { websiteSku: "GBDivaFrst46AnSpTslWht", applicator: "Antique bulb sprayer with tassel" },
    { itemName: "100 ml clear cylinder with vintage style bulb" },
    { applicator: "Vintage style bulb tassel" },
  ];

  for (const identity of assembledOnly) {
    assert.equal(
      isAssembledOnlyVintageBulbIdentity(identity),
      true,
      JSON.stringify(identity),
    );
    assert.equal(allowsCapOffSidecarPreset(identity), false);
    assert.equal(resolveAssembledOnlyPdpMode(identity, "cap-off"), "cap-on");
    assert.equal(
      resolveAssembledOnlyCatalogPresetId(identity, CAP_OFF_SIDECAR_PRESET_ID),
      ASSEMBLED_GRID_PRESET_ID,
    );
    assert.deepEqual(
      resolveAssembledOnlyGenerationState(identity, CAP_OFF_SIDECAR_PRESET_ID),
      {
        capState: "assembled",
        mode: "cap-on",
        requiresCapOffReference: false,
      },
    );
  }
});

test("leaves ordinary dual-state closures and sprayers on the cap-off sidecar path", () => {
  const dualState = [
    { graceSku: "GB-CYL-CLR-50ML-SPR-GLD", websiteSku: "GBCyl50SpryShnGl", applicator: "Fine mist sprayer" },
    { graceSku: "GB-CYL-CLR-100ML-LPM-CLR", websiteSku: "GBCyl100LtnClOvrCap", applicator: "Lotion pump" },
    { graceSku: "GB-CYL-CLR-9ML-DRP-BLK", websiteSku: "GBCyl9DrpBlk", applicator: "Dropper" },
    { family: "Cylinder", applicator: "Screw cap" },
  ];

  for (const identity of dualState) {
    assert.equal(
      isAssembledOnlyVintageBulbIdentity(identity),
      false,
      JSON.stringify(identity),
    );
    assert.equal(allowsCapOffSidecarPreset(identity), true);
    assert.equal(resolveAssembledOnlyPdpMode(identity, "cap-off"), "cap-off");
    assert.equal(
      resolveAssembledOnlyCatalogPresetId(identity, CAP_OFF_SIDECAR_PRESET_ID),
      CAP_OFF_SIDECAR_PRESET_ID,
    );
    assert.deepEqual(
      resolveAssembledOnlyGenerationState(identity, CAP_OFF_SIDECAR_PRESET_ID),
      {
        capState: "detached",
        mode: "cap-off",
        requiresCapOffReference: true,
      },
    );
  }
});
