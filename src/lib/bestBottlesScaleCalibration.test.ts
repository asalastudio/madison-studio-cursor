import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildBestBottlesScaleCalibrationKeys,
  validateNormalizedBounds,
} from "./bestBottlesScaleCalibrationModel.ts";

describe("Best Bottles scale calibration", () => {
  it("deduplicates color and finish while retaining glass geometry and topology", () => {
    const common = {
      family: "Cylinder",
      heightWithoutCap: "70 mm",
      diameter: "16.64 mm",
      neckThreadSize: "17-415",
      applicator: "Fine Mist Sprayer",
      capState: "detached" as const,
    };
    const clear = buildBestBottlesScaleCalibrationKeys(common);
    const cobalt = buildBestBottlesScaleCalibrationKeys(common);

    assert.deepEqual(clear, cobalt);
    assert.equal(clear.geometryKey, "cylinder:h70:d16p6:n17-415");
    assert.equal(clear.topologyKey, "sidecar:fine-mist-sprayer");
  });

  it("keeps assembled and sidecar topologies separate", () => {
    const base = {
      family: "Cylinder",
      heightWithoutCap: 70,
      diameter: 16.6,
      neckThreadSize: "17-415",
      applicator: "Metal Roller Ball",
    };
    const assembled = buildBestBottlesScaleCalibrationKeys({
      ...base,
      capState: "assembled",
    });
    const sidecar = buildBestBottlesScaleCalibrationKeys({
      ...base,
      capState: "detached",
    });

    assert.notEqual(assembled.topologyKey, sidecar.topologyKey);
  });

  it("uses the cap/closure topology when catalog applicator data is empty", () => {
    const keys = buildBestBottlesScaleCalibrationKeys({
      family: "Cylinder",
      heightWithoutCap: "106 ±2 mm",
      diameter: "18 ±0.5 mm",
      neckThreadSize: "13-415",
      applicator: null,
      capState: "detached",
    });

    assert.equal(keys.topologyKey, "sidecar:cap-closure");
  });

  it("rejects non-normalized or inverted bounds", () => {
    assert.throws(
      () => validateNormalizedBounds({ left: 0, top: 0.8, right: 1, bottom: 0.2 }),
      /positive width and height/,
    );
    assert.throws(
      () => validateNormalizedBounds({ left: -0.1, top: 0, right: 1, bottom: 1 }),
      /between 0 and 1/,
    );
  });
});
