import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  analyzeBestBottlesBackgroundPixels,
  BEST_BOTTLES_BACKGROUND_QA_VERSION,
} from "./bestBottlesBackgroundQa.ts";

function solidRgba(
  width: number,
  height: number,
  rgb: readonly [number, number, number],
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = rgb[0];
    data[offset + 1] = rgb[1];
    data[offset + 2] = rgb[2];
    data[offset + 3] = 255;
  }
  return data;
}

describe("Best Bottles background QA", () => {
  it("passes the canonical #F5F3EF canvas", () => {
    const result = analyzeBestBottlesBackgroundPixels({
      data: solidRgba(100, 110, [245, 243, 239]),
      width: 100,
      height: 110,
    });

    assert.equal(result.version, BEST_BOTTLES_BACKGROUND_QA_VERSION);
    assert.equal(result.status, "pass");
    assert.equal(result.measuredHex, "#F5F3EF");
    assert.equal(result.compliantRatio, 1);
  });

  it("rejects the retired #F6EFE8 canvas", () => {
    const result = analyzeBestBottlesBackgroundPixels({
      data: solidRgba(100, 110, [246, 239, 232]),
      width: 100,
      height: 110,
    });

    assert.equal(result.status, "fail");
    assert.equal(result.measuredHex, "#F6EFE8");
    assert.match(result.message, /regenerate on #F5F3EF/i);
  });

  it("allows minor PNG edge variation within tolerance", () => {
    const data = solidRgba(100, 110, [245, 243, 239]);
    for (let pixel = 0; pixel < 10; pixel += 1) {
      const offset = pixel * 4;
      data[offset] = 247;
      data[offset + 1] = 241;
      data[offset + 2] = 240;
    }

    const result = analyzeBestBottlesBackgroundPixels({
      data,
      width: 100,
      height: 110,
    });

    assert.equal(result.status, "pass");
  });
});
