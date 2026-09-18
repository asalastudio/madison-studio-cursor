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
