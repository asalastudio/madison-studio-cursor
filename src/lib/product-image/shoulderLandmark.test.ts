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

  it("does not let an internal highlight on dark glass widen the bottle and excuse a wrong landmark", () => {
    // Cobalt body with a black body-width collar: the collar-to-glass boundary is
    // faint, and the strongest vertical edge on the left is a highlight well inside
    // the true wall. Proportions must still pick the closure edge, not the collar top.
    const width = 520;
    const height = 1200;
    const shoulderY = 520;
    const collarTopY = 360;
    const footY = 1100;
    const bodyLeft = 170;
    const bodyRight = 340;
    const COBALT: Rgb = { r: 22, g: 40, b: 150 };
    const HIGHLIGHT: Rgb = { r: 235, g: 240, b: 255 };
    const COLLAR: Rgb = { r: 12, g: 12, b: 14 };
    const pixels = makePixels(width, height);
    fillRect(pixels, width, bodyLeft, shoulderY, bodyRight, footY, COBALT);
    fillRect(pixels, width, bodyLeft + 46, shoulderY + 30, bodyLeft + 52, footY - 20, HIGHLIGHT);
    fillRect(pixels, width, bodyLeft + 4, collarTopY, bodyRight - 4, shoulderY - 1, COLLAR);
    fillRect(pixels, width, 215, 250, 295, collarTopY - 1, COLLAR);

    const result = detectGlassShoulderLandmark({
      pixels,
      width,
      height,
      primaryBounds: { top: 250, bottom: footY, left: bodyLeft - 6, right: bodyRight + 6 },
      footYPx: footY,
      expectedBodyAspectRatio: (footY - shoulderY) / (bodyRight - bodyLeft + 1),
    });

    assert.ok(result, "the closure edge fits the glass, so this must not be refused");
    assert.ok(
      Math.abs(result.shoulderYPx - shoulderY) <= 3,
      `expected the collar's bottom edge at y=${shoulderY}, got y=${result.shoulderYPx} (collar top is y=${collarTopY})`,
    );
    assert.ok(Math.abs(result.bodyAspectRatio * (bodyRight - bodyLeft + 1) - (footY - shoulderY)) <= 6);
  });

  for (const closure of ["narrow-collar", "bare-neck"] as const) {
    it(`finds frosted glass, whose only edge sits on the bounds line (${closure})`, () => {
      // Frosted glass on bone has no dark rim: the body is one light tone about 20
      // levels off the canvas, so the bounds hug it and the wall step lies ON the
      // bounds line. Measured on real renders: a search that starts inside the bounds
      // reads 2.7–4.5 where it needs 6, finds no wall, and blocks every frosted SKU.
      const width = 520;
      const height = 1200;
      const shoulderY = 520;
      const footY = 1100;
      const bodyLeft = 170;
      const bodyRight = 340;
      const cornerRadius = 12;
      const centerX = 255;
      const FROSTED: Rgb = { r: 226, g: 226, b: 226 };
      const FROSTED_BASE: Rgb = { r: 176, g: 176, b: 178 };
      const pixels = makePixels(width, height);
      for (let y = shoulderY; y <= footY; y += 1) {
        const dy = Math.max(0, shoulderY + cornerRadius - y);
        const inset = Math.round(cornerRadius - Math.sqrt(cornerRadius * cornerRadius - dy * dy));
        fillRect(pixels, width, bodyLeft + inset, y, bodyRight - inset, y, FROSTED);
      }
      // The thick base is the only part dark enough to define the bottle's bounds.
      fillRect(pixels, width, bodyLeft, footY - 14, bodyRight, footY, FROSTED_BASE);
      let closureTop: number;
      if (closure === "bare-neck") {
        fillRect(pixels, width, centerX - 45, 400, centerX + 45, shoulderY - 1, FROSTED);
        closureTop = 330;
        fillRect(pixels, width, centerX - 41, closureTop, centerX + 41, 399, FITMENT);
      } else {
        fillRect(pixels, width, bodyLeft + 38, 400, bodyRight - 38, shoulderY - 1, FITMENT);
        closureTop = 290;
        fillRect(pixels, width, centerX - 40, closureTop, centerX + 40, 399, FITMENT);
      }

      const result = detectGlassShoulderLandmark({
        pixels,
        width,
        height,
        // Exactly the body's extent, as detectTallestComponentBounds reports it.
        primaryBounds: { top: closureTop, bottom: footY, left: bodyLeft, right: bodyRight },
        footYPx: footY,
        expectedBodyAspectRatio: (footY - shoulderY) / (bodyRight - bodyLeft + 1),
      });

      assert.ok(result, "frosted glass must be detectable");
      assert.ok(
        Math.abs(result.shoulderYPx - shoulderY) <= 3,
        `expected the top of the frosted body at y=${shoulderY}, got y=${result.shoulderYPx}`,
      );
      assert.ok(
        Math.abs(result.bodyRightXPx - result.bodyLeftXPx - (bodyRight - bodyLeft)) <= 6,
        `walls should be the body's outer edges, got ${result.bodyLeftXPx}–${result.bodyRightXPx}`,
      );
    });
  }

  it("resolves a frosted bare neck on geometry alone when neck and body are one material", () => {
    // A wide frosted neck over a frosted body: no material changes at the shoulder, so
    // the material cue has nothing to find. The glass still narrows by 20%, and that is
    // the landmark. A real frosted roll-on cleared the material bar on the raw image and
    // fell under it after the rig rescaled, blocking an otherwise correct render.
    const width = 520;
    const height = 1200;
    const shoulderY = 520;
    const footY = 1100;
    const bodyLeft = 170;
    const bodyRight = 340;
    const centerX = 255;
    const neckHalf = 68;
    const FROSTED: Rgb = { r: 226, g: 226, b: 226 };
    const FROSTED_BASE: Rgb = { r: 176, g: 176, b: 178 };
    const pixels = makePixels(width, height);
    fillRect(pixels, width, bodyLeft, shoulderY, bodyRight, footY, FROSTED);
    fillRect(pixels, width, bodyLeft, footY - 14, bodyRight, footY, FROSTED_BASE);
    fillRect(pixels, width, centerX - neckHalf, 400, centerX + neckHalf, shoulderY - 1, FROSTED);
    fillRect(pixels, width, centerX - neckHalf + 4, 330, centerX + neckHalf - 4, 399, FITMENT);

    const result = detectGlassShoulderLandmark({
      pixels,
      width,
      height,
      primaryBounds: { top: 330, bottom: footY, left: bodyLeft, right: bodyRight },
      footYPx: footY,
      expectedBodyAspectRatio: (footY - shoulderY) / (bodyRight - bodyLeft + 1),
    });

    assert.ok(result, "the narrowing alone locates this shoulder");
    assert.ok(
      Math.abs(result.shoulderYPx - shoulderY) <= 3,
      `expected the top of the frosted body at y=${shoulderY}, got y=${result.shoulderYPx}`,
    );
    assert.equal(result.closureEdgeYPx, null);
    assert.equal(result.shoulderYPx, result.narrowingOnsetYPx);
    assert.ok(result.confidence < 0.7, "a single cue should not report full confidence");
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

type UrnNeck = "collar" | "bare-neck";

/**
 * A Diva-style urn at production proportions: pedestal foot, stem, a belly
 * that swells above the lower body, a dome, a short neck ring at 64% of the
 * belly, then the fitment. Shapes follow the Diva Photoshop sources row by row:
 * the ring's top is rounded, and the dome leaves the ring at the ring's own
 * width and widens gradually — there is no ledge where they meet. Frosted glass
 * reads ~17% thin along that crease and recovers within ~1% of the height.
 */
function drawUrn(input: {
  neck: UrnNeck;
  frostedCrease?: boolean;
  /** Collar half-width; 50 by default. 58 is a dropper-wide collar, a ~17% step. */
  collarHalf?: number;
  /** A narrower dropper bulb above the collar. */
  bulb?: boolean;
  /** Frosted on Bone: one light tone 11 levels off the canvas, no dark rim. */
  frostedBody?: boolean;
  /** A detached cap to the right, tall enough to reach the belly rows. */
  sidecar?: boolean;
}) {
  const width = 520;
  const height = 1200;
  const centerX = 260;
  const footY = 1100;
  const bellyY = 700;
  // The ring runs 16 rows, 2.2% of this frame, as Diva's rings measure 2.2-2.4%.
  const domeTopY = 596;
  const seatY = 580;
  const bellyHalf = 110;
  const ringHalf = 70;
  const pixels = makePixels(width, height);
  const FROSTED_BODY: Rgb = { r: 234, g: 232, b: 228 };
  const glassRow = (y: number, half: number) => {
    if (input.frostedBody) {
      fillRect(pixels, width, centerX - half, y, centerX + half, y, FROSTED_BODY);
      return;
    }
    fillRect(pixels, width, centerX - half, y, centerX + half, y, GLASS);
    fillRect(pixels, width, centerX - half, y, centerX - half + 2, y, EDGE);
    fillRect(pixels, width, centerX + half - 2, y, centerX + half, y, EDGE);
  };

  for (let y = 1040; y <= footY; y += 1) glassRow(y, 60);
  for (let y = 1010; y < 1040; y += 1) glassRow(y, 40);
  for (let y = bellyY; y < 1010; y += 1) {
    const t = (y - bellyY) / (1010 - bellyY);
    glassRow(y, Math.round(bellyHalf - t * t * 70));
  }
  for (let y = domeTopY; y < bellyY; y += 1) {
    const t = (y - domeTopY) / (bellyY - domeTopY);
    glassRow(y, Math.round(ringHalf + (bellyHalf - ringHalf) * Math.sin((Math.PI / 2) * t)));
  }
  for (let y = seatY; y < domeTopY; y += 1) {
    const rounding = Math.max(0, seatY + 7 - y);
    glassRow(y, ringHalf - Math.round((rounding * rounding) / 5));
  }
  if (input.frostedCrease) {
    for (let y = domeTopY - 1; y <= domeTopY + 6; y += 1) {
      glassRow(y, Math.round(58 + (12 * (y - domeTopY + 1)) / 7));
    }
  }

  let top: number;
  if (input.neck === "collar") {
    const collarHalf = input.collarHalf ?? 50;
    fillRect(pixels, width, centerX - collarHalf, 440, centerX + collarHalf, seatY - 1, FITMENT);
    if (input.bulb) {
      fillRect(pixels, width, centerX - 30, 330, centerX + 30, 439, { r: 250, g: 250, b: 250 });
      fillRect(pixels, width, centerX - 30, 330, centerX - 28, 439, EDGE);
      fillRect(pixels, width, centerX + 28, 330, centerX + 30, 439, EDGE);
      top = 330;
    } else {
      fillRect(pixels, width, centerX - 20, 380, centerX + 20, 439, FITMENT);
      top = 380;
    }
  } else {
    for (let y = 470; y < seatY; y += 1) glassRow(y, 45);
    for (const threadY of [490, 515, 540]) {
      fillRect(pixels, width, centerX - 50, threadY, centerX + 50, threadY + 3, EDGE);
    }
    fillRect(pixels, width, centerX - 38, 440, centerX + 38, 469, HOUSING);
    top = 440;
  }

  if (input.sidecar) {
    // Stood close to the foot and tall enough to reach the belly rows, as the
    // 100 ml reducer's cap did on its render.
    fillRect(pixels, width, centerX + 100, 900, centerX + 180, footY, FITMENT);
  }

  return {
    pixels,
    width,
    height,
    footY,
    seatY,
    bellyWidth: bellyHalf * 2 + 1,
    primaryBounds: {
      top,
      bottom: footY,
      left: centerX - bellyHalf - 6,
      right: input.sidecar ? centerX + 186 : centerX + bellyHalf + 6,
    },
  };
}

describe("detectGlassShoulderLandmark on an urn, measured to the closure seat", () => {
  for (const neck of ["collar", "bare-neck"] as const) {
    it(`lands where the cap starts at the neck, not in the body (${neck})`, () => {
      const scene = drawUrn({ neck });
      const result = detectGlassShoulderLandmark({
        pixels: scene.pixels,
        width: scene.width,
        height: scene.height,
        primaryBounds: scene.primaryBounds,
        footYPx: scene.footY,
        landmark: "closure-seat",
      });

      assert.ok(result, "the seat should be detectable");
      assert.ok(
        Math.abs(result.shoulderYPx - scene.seatY) <= 2,
        `expected the top of the neck ring at y=${scene.seatY}, got y=${result.shoulderYPx}`,
      );
      assert.equal(result.landmark, "closure-seat");
      assert.equal(result.outerBodyWidthPx, scene.bellyWidth);
      assert.ok(
        Math.abs(result.bodyAspectRatio - (scene.footY - scene.seatY) / scene.bellyWidth) < 0.02,
        `aspect should be foot-to-seat over the belly, got ${result.bodyAspectRatio}`,
      );
      assert.ok(result.confidence >= 0.8, `a clean step should be trusted, got ${result.confidence}`);
    });
  }

  it("is not fooled by frosted glass reading thin along the crease under the ring", () => {
    const scene = drawUrn({ neck: "collar", frostedCrease: true });
    const result = detectGlassShoulderLandmark({
      pixels: scene.pixels,
      width: scene.width,
      height: scene.height,
      primaryBounds: scene.primaryBounds,
      footYPx: scene.footY,
      landmark: "closure-seat",
    });

    assert.ok(result);
    assert.ok(
      Math.abs(result.shoulderYPx - scene.seatY) <= 2,
      `expected the seat at y=${scene.seatY}, not the crease under the ring; got y=${result.shoulderYPx}`,
    );
  });

  it("fails closed when the seat does not fit the locked proportions", () => {
    const scene = drawUrn({ neck: "collar" });
    const result = detectGlassShoulderLandmark({
      pixels: scene.pixels,
      width: scene.width,
      height: scene.height,
      primaryBounds: scene.primaryBounds,
      footYPx: scene.footY,
      landmark: "closure-seat",
      expectedBodyAspectRatio: 1.6,
    });

    assert.equal(result, null);
  });

  it("re-detects the seat inside the transformed-target window", () => {
    const scene = drawUrn({ neck: "collar" });
    const result = detectGlassShoulderLandmark({
      pixels: scene.pixels,
      width: scene.width,
      height: scene.height,
      primaryBounds: scene.primaryBounds,
      footYPx: scene.footY,
      landmark: "closure-seat",
      expectedShoulderYPx: scene.seatY + 8,
      expectedBodyAspectRatio: (scene.footY - scene.seatY) / scene.bellyWidth,
    });

    assert.ok(result);
    assert.ok(Math.abs(result.shoulderYPx - scene.seatY) <= 2);
  });

  it("does not walk past a dropper-wide collar whose rounded ring blurs the edge", () => {
    // A ~17% step into the collar, then a narrower bulb above it. Two short windows
    // across a rounded ring top read under 15% here; the seat is still the collar.
    const scene = drawUrn({ neck: "collar", collarHalf: 58, bulb: true });
    const result = detectGlassShoulderLandmark({
      pixels: scene.pixels,
      width: scene.width,
      height: scene.height,
      primaryBounds: scene.primaryBounds,
      footYPx: scene.footY,
      landmark: "closure-seat",
    });

    assert.ok(result);
    assert.ok(
      Math.abs(result.shoulderYPx - scene.seatY) <= 2,
      `expected the collar's bottom edge at y=${scene.seatY}, not the bulb; got y=${result.shoulderYPx}`,
    );
  });

  it("reads frosted glass that sits only a few levels off the canvas", () => {
    const scene = drawUrn({ neck: "collar", frostedBody: true });
    const result = detectGlassShoulderLandmark({
      pixels: scene.pixels,
      width: scene.width,
      height: scene.height,
      primaryBounds: scene.primaryBounds,
      footYPx: scene.footY,
      landmark: "closure-seat",
    });

    assert.ok(result, "frosted glass must be detectable");
    assert.ok(Math.abs(result.shoulderYPx - scene.seatY) <= 2, `got y=${result.shoulderYPx}`);
    assert.equal(result.outerBodyWidthPx, scene.bellyWidth);
  });

  it("keeps a detached cap that reaches the belly rows out of the belly", () => {
    const scene = drawUrn({ neck: "collar", sidecar: true });
    const result = detectGlassShoulderLandmark({
      pixels: scene.pixels,
      width: scene.width,
      height: scene.height,
      primaryBounds: scene.primaryBounds,
      footYPx: scene.footY,
      landmark: "closure-seat",
      expectedBodyAspectRatio: (scene.footY - scene.seatY) / scene.bellyWidth,
    });

    assert.ok(result);
    assert.ok(Math.abs(result.shoulderYPx - scene.seatY) <= 2);
    assert.equal(result.outerBodyWidthPx, scene.bellyWidth);
    assert.ok(result.bodyRightXPx <= 260 + 110, `the belly's right edge is the glass, got x=${result.bodyRightXPx}`);
  });

  it("leaves the shoulder rule as it was when no landmark is asked for", () => {
    const scene = drawProductionCylinder("narrow-collar");
    const plain = detectGlassShoulderLandmark({
      pixels: scene.pixels,
      width: scene.width,
      height: scene.height,
      primaryBounds: scene.primaryBounds,
      footYPx: scene.footY,
    });
    const explicit = detectGlassShoulderLandmark({
      pixels: scene.pixels,
      width: scene.width,
      height: scene.height,
      primaryBounds: scene.primaryBounds,
      footYPx: scene.footY,
      landmark: "shoulder",
    });

    assert.deepEqual(explicit, plain);
    assert.equal(plain?.landmark, undefined);
  });
});
