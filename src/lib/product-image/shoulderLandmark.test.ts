import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { detectGlassShoulderLandmark } from "./shoulderLandmark";

type Rgb = { r: number; g: number; b: number };

const BG: Rgb = { r: 245, g: 243, b: 239 };
const GLASS: Rgb = { r: 235, g: 234, b: 231 };
const EDGE: Rgb = { r: 118, g: 118, b: 115 };
const FITMENT: Rgb = { r: 36, g: 36, b: 34 };

function makePixels(width: number, height: number): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      writePixel(pixels, width, x, y, BG);
    }
  }
  return pixels;
}

function writePixel(
  pixels: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  color: Rgb,
): void {
  const index = (y * width + x) * 4;
  pixels[index] = color.r;
  pixels[index + 1] = color.g;
  pixels[index + 2] = color.b;
  pixels[index + 3] = 255;
}

function fillRect(
  pixels: Uint8ClampedArray,
  width: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
  color: Rgb,
): void {
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      writePixel(pixels, width, x, y, color);
    }
  }
}

function drawCylinder(input?: {
  sameWidthCollar?: boolean;
  lowContrastInterior?: boolean;
  detachedSidecar?: boolean;
  strongFitmentBand?: boolean;
}) {
  const width = 120;
  const height = 128;
  const shoulderY = 42;
  const footY = 112;
  const bodyLeft = 34;
  const bodyRight = 70;
  const pixels = makePixels(width, height);
  const interior = input?.lowContrastInterior ? BG : GLASS;

  fillRect(pixels, width, bodyLeft, shoulderY, bodyRight, footY, interior);
  fillRect(pixels, width, bodyLeft, shoulderY, bodyLeft + 2, footY, EDGE);
  fillRect(pixels, width, bodyRight - 2, shoulderY, bodyRight, footY, EDGE);
  fillRect(pixels, width, bodyLeft, shoulderY, bodyRight, shoulderY + 2, EDGE);
  fillRect(pixels, width, bodyLeft, footY - 2, bodyRight, footY, EDGE);

  const collarLeft = input?.sameWidthCollar ? bodyLeft : 42;
  const collarRight = input?.sameWidthCollar ? bodyRight : 62;
  fillRect(pixels, width, collarLeft, 18, collarRight, shoulderY - 1, FITMENT);
  if (input?.strongFitmentBand) {
    fillRect(pixels, width, collarLeft, 28, collarRight, 32, { r: 248, g: 248, b: 246 });
  }

  if (input?.detachedSidecar) {
    fillRect(pixels, width, 82, 72, 108, footY, FITMENT);
  }

  return {
    pixels,
    width,
    height,
    shoulderY,
    footY,
    primaryBounds: { top: 18, bottom: footY, left: 30, right: 74 },
  };
}

const HOUSING: Rgb = { r: 206, g: 208, b: 207 };

type ProductionClosure = "narrow-collar" | "body-width-collar" | "bare-neck";

/**
 * A Cylinder at production proportions. The toy scene above is 94 px tall, so
 * the detector's span-relative sampling offset rounds to 2 px and any bias it
 * introduces hides inside the ±2 px assertions. Real rigged heroes span
 * 1500–2000 px, where the same offset is 19–24 px — about one shoulder-curve
 * height. This scene is tall enough to expose that, and rounds the shoulder
 * corners the way every real render does.
 */
function drawProductionCylinder(closure: ProductionClosure) {
  const width = 520;
  const height = 1200;
  const shoulderY = 520;
  const footY = 1100;
  const bodyLeft = 170;
  const bodyRight = 340;
  const cornerRadius = 12;
  const centerX = Math.round((bodyLeft + bodyRight) / 2);
  const pixels = makePixels(width, height);

  for (let y = shoulderY; y <= footY; y += 1) {
    const dy = Math.max(0, shoulderY + cornerRadius - y);
    const inset = Math.round(
      cornerRadius - Math.sqrt(cornerRadius * cornerRadius - dy * dy),
    );
    const rowLeft = bodyLeft + inset;
    const rowRight = bodyRight - inset;
    fillRect(pixels, width, rowLeft, y, rowRight, y, GLASS);
    fillRect(pixels, width, rowLeft, y, rowLeft + 2, y, EDGE);
    fillRect(pixels, width, rowRight - 2, y, rowRight, y, EDGE);
  }
  fillRect(
    pixels,
    width,
    bodyLeft + cornerRadius,
    shoulderY,
    bodyRight - cornerRadius,
    shoulderY + 2,
    EDGE,
  );
  fillRect(pixels, width, bodyLeft, footY - 2, bodyRight, footY, EDGE);

  let closureTop: number;
  if (closure === "bare-neck") {
    const neckLeft = centerX - 45;
    const neckRight = centerX + 45;
    const neckTop = 400;
    fillRect(pixels, width, neckLeft, neckTop, neckRight, shoulderY - 1, GLASS);
    fillRect(pixels, width, neckLeft, neckTop, neckLeft + 2, shoulderY - 1, EDGE);
    fillRect(pixels, width, neckRight - 2, neckTop, neckRight, shoulderY - 1, EDGE);
    for (const threadY of [420, 445, 470]) {
      fillRect(pixels, width, neckLeft - 5, threadY, neckRight + 5, threadY + 3, EDGE);
    }
    closureTop = neckTop - 70;
    fillRect(pixels, width, neckLeft + 4, closureTop, neckRight - 4, neckTop - 1, HOUSING);
  } else {
    const collarInset = closure === "body-width-collar" ? 7 : 38;
    const collarTop = 400;
    fillRect(
      pixels,
      width,
      bodyLeft + collarInset,
      collarTop,
      bodyRight - collarInset,
      shoulderY - 1,
      FITMENT,
    );
    closureTop = collarTop - 110;
    fillRect(pixels, width, centerX - 40, closureTop, centerX + 40, collarTop - 1, FITMENT);
  }

  return {
    pixels,
    width,
    height,
    shoulderY,
    footY,
    cornerRadius,
    primaryBounds: { top: closureTop, bottom: footY, left: bodyLeft - 6, right: bodyRight + 6 },
  };
}

describe("detectGlassShoulderLandmark at production scale", () => {
  const closures: ProductionClosure[] = ["narrow-collar", "body-width-collar", "bare-neck"];

  for (const closure of closures) {
    it(`lands on the top edge of the glass shoulder, not a curve-height below it (${closure})`, () => {
      const scene = drawProductionCylinder(closure);
      const result = detectGlassShoulderLandmark({
        pixels: scene.pixels,
        width: scene.width,
        height: scene.height,
        primaryBounds: scene.primaryBounds,
        footYPx: scene.footY,
      });

      assert.ok(result, "shoulder should be detectable");
      assert.ok(
        Math.abs(result.shoulderYPx - scene.shoulderY) <= 2,
        `expected the closure/neck-to-shoulder edge at y=${scene.shoulderY}, got y=${result.shoulderYPx} ` +
          `(${result.shoulderYPx - scene.shoulderY} px off; corner radius ${scene.cornerRadius})`,
      );
    });
  }

  it("follows a sloped shoulder down to where the wall starts, not up to the neck", () => {
    // 5 ml-style body: the glass widens from the neck to the wall over a long slope.
    // The Sep 7 lock sits near the bottom of that slope, right before the wall.
    const width = 520;
    const height = 1200;
    const neckBaseY = 460;
    const wallStartY = 520;
    const footY = 1100;
    const bodyLeft = 170;
    const bodyRight = 340;
    const centerX = 255;
    const neckHalf = 45;
    const pixels = makePixels(width, height);
    for (let y = neckBaseY; y <= footY; y += 1) {
      const t = Math.min(1, (y - neckBaseY) / (wallStartY - neckBaseY));
      const half = Math.round(neckHalf + t * ((bodyRight - bodyLeft) / 2 - neckHalf));
      fillRect(pixels, width, centerX - half, y, centerX + half, y, GLASS);
      fillRect(pixels, width, centerX - half, y, centerX - half + 2, y, EDGE);
      fillRect(pixels, width, centerX + half - 2, y, centerX + half, y, EDGE);
    }
    fillRect(pixels, width, bodyLeft, footY - 2, bodyRight, footY, EDGE);
    fillRect(pixels, width, centerX - neckHalf, 340, centerX + neckHalf, neckBaseY - 1, GLASS);
    fillRect(pixels, width, centerX - neckHalf, 340, centerX - neckHalf + 2, neckBaseY - 1, EDGE);
    fillRect(pixels, width, centerX + neckHalf - 2, 340, centerX + neckHalf, neckBaseY - 1, EDGE);
    for (const threadY of [360, 385, 410]) {
      fillRect(pixels, width, centerX - neckHalf - 5, threadY, centerX + neckHalf + 5, threadY + 3, EDGE);
    }
    fillRect(pixels, width, centerX - neckHalf + 4, 270, centerX + neckHalf - 4, 339, HOUSING);

    const result = detectGlassShoulderLandmark({
      pixels,
      width,
      height,
      primaryBounds: { top: 270, bottom: footY, left: bodyLeft - 6, right: bodyRight + 6 },
      footYPx: footY,
    });

    assert.ok(result, "shoulder should be detectable");
    // 8% narrower than the 170 px wall is reached ~10 px above the wall start.
    assert.ok(
      result.shoulderYPx >= wallStartY - 16 && result.shoulderYPx <= wallStartY,
      `expected just above the wall start (y≈${wallStartY - 10}), got y=${result.shoulderYPx}; neck base is y=${neckBaseY}`,
    );
    assert.equal(result.shoulderYPx, result.narrowingOnsetYPx);
  });

  it("re-detects the same top edge inside the transformed-target window", () => {
    const scene = drawProductionCylinder("narrow-collar");
    const result = detectGlassShoulderLandmark({
      pixels: scene.pixels,
      width: scene.width,
      height: scene.height,
      primaryBounds: scene.primaryBounds,
      footYPx: scene.footY,
      expectedShoulderYPx: scene.shoulderY + 9,
    });

    assert.ok(result);
    assert.ok(Math.abs(result.shoulderYPx - scene.shoulderY) <= 2);
  });
});

describe("detectGlassShoulderLandmark", () => {
  it("finds a Cylinder shoulder from the stable glass walls", () => {
    const scene = drawCylinder();
    const result = detectGlassShoulderLandmark({
      pixels: scene.pixels,
      width: scene.width,
      height: scene.height,
      primaryBounds: scene.primaryBounds,
      footYPx: scene.footY,
    });

    assert.ok(result);
    assert.ok(Math.abs(result.shoulderYPx - scene.shoulderY) <= 2);
    assert.equal(result.footYPx, scene.footY);
    assert.ok(result.confidence >= 0.7);
  });

  it("uses the horizontal material transition when the collar is body-width", () => {
    const scene = drawCylinder({ sameWidthCollar: true });
    const result = detectGlassShoulderLandmark({
      pixels: scene.pixels,
      width: scene.width,
      height: scene.height,
      primaryBounds: scene.primaryBounds,
      footYPx: scene.footY,
    });

    assert.ok(result);
    assert.ok(Math.abs(result.shoulderYPx - scene.shoulderY) <= 2);
  });

  it("rejects stronger decorative transitions inside the fitment", () => {
    const scene = drawCylinder({ sameWidthCollar: true, strongFitmentBand: true });
    const result = detectGlassShoulderLandmark({
      pixels: scene.pixels,
      width: scene.width,
      height: scene.height,
      primaryBounds: scene.primaryBounds,
      footYPx: scene.footY,
    });

    assert.ok(result);
    assert.ok(Math.abs(result.shoulderYPx - scene.shoulderY) <= 2);
  });

  it("uses the transformed target as a narrow re-detection window", () => {
    const scene = drawCylinder();
    fillRect(scene.pixels, scene.width, 34, 50, 70, 55, FITMENT);
    const result = detectGlassShoulderLandmark({
      pixels: scene.pixels,
      width: scene.width,
      height: scene.height,
      primaryBounds: scene.primaryBounds,
      footYPx: scene.footY,
      expectedShoulderYPx: scene.shoulderY,
    });

    assert.ok(result);
    assert.ok(Math.abs(result.shoulderYPx - scene.shoulderY) <= 2);
  });

  it("detects clear glass whose interior matches the background", () => {
    const scene = drawCylinder({ lowContrastInterior: true });
    const result = detectGlassShoulderLandmark({
      pixels: scene.pixels,
      width: scene.width,
      height: scene.height,
      primaryBounds: scene.primaryBounds,
      footYPx: scene.footY,
    });

    assert.ok(result);
    assert.ok(Math.abs(result.shoulderYPx - scene.shoulderY) <= 2);
  });

  it("ignores a detached sidecar outside the primary bottle bounds", () => {
    const scene = drawCylinder({ detachedSidecar: true });
    const result = detectGlassShoulderLandmark({
      pixels: scene.pixels,
      width: scene.width,
      height: scene.height,
      primaryBounds: scene.primaryBounds,
      footYPx: scene.footY,
    });

    assert.ok(result);
    assert.ok(Math.abs(result.shoulderYPx - scene.shoulderY) <= 2);
    assert.ok(result.bodyRightXPx <= scene.primaryBounds.right);
  });

  it("returns null when no stable pair of glass walls exists", () => {
    const pixels = makePixels(120, 128);
    const result = detectGlassShoulderLandmark({
      pixels,
      width: 120,
      height: 128,
      primaryBounds: { top: 18, bottom: 112, left: 30, right: 74 },
      footYPx: 112,
    });

    assert.equal(result, null);
  });
});
