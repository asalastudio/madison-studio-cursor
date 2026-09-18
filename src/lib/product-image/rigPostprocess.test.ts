import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { FAMILY_RIG, getFamilyRigForProduct } from "./familyRig";
import {
  addDeterministicContactShadow,
  applyMaskControlledForegroundMatte,
  applyRigForegroundMatte,
  computeRigFrameTransform,
  detectAlphaControlBounds,
  detectControlledRigBounds,
  getMaskControlledBoundsQaIssues,
  getMaskControlledVisualContinuityQaIssues,
  getVisibleMatteArtifactQaIssues,
  detectStrongBounds,
  detectModelGeometryBaseline,
  detectModelShadowContactBounds,
  detectPrimaryBottleBounds,
  evaluateShoulderLockQa,
  evaluateDetachedCapGeometryQa,
  finalizeRigShadow,
  flattenBackgroundLikePixels,
  clampModelShadowGeometryToControlEnvelope,
  maskOutModelShadowGeometry,
  measureDetachedSidecarCapMetricsFromPixels,
  prepareUnmaskedRigRecanvasPixels,
  resolveRigShadowOwner,
} from "./rigPostprocess";
import * as rigPostprocess from "./rigPostprocess";
import { analyzeModelOwnedShadow } from "./shadowQa";

describe("primary bottle transform authority", () => {
  it("isolates the centered bottle from a right-sidecar component", () => {
    const width = 120;
    const height = 100;
    const bone = { r: 245, g: 243, b: 239 };
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let index = 0; index < pixels.length; index += 4) {
      pixels[index] = bone.r;
      pixels[index + 1] = bone.g;
      pixels[index + 2] = bone.b;
      pixels[index + 3] = 255;
    }
    const paint = (left: number, top: number, right: number, bottom: number) => {
      for (let y = top; y <= bottom; y += 1) {
        for (let x = left; x <= right; x += 1) {
          const index = (y * width + x) * 4;
          pixels[index] = 70;
          pixels[index + 1] = 70;
          pixels[index + 2] = 70;
        }
      }
    };
    paint(40, 20, 60, 70);
    paint(85, 45, 100, 70);

    assert.deepEqual(
      detectPrimaryBottleBounds(pixels, width, height, bone),
      { top: 20, bottom: 70, left: 40, right: 60 },
    );

    // Final recanvas remeasurement must use the governed control width so a
    // narrow pale sprayer actuator is not dropped after it was detected in the
    // primary lane before transformation.
    const controlledWidth = 1000;
    const controlledHeight = 500;
    const controlledPixels = new Uint8ClampedArray(controlledWidth * controlledHeight * 4);
    for (let index = 0; index < controlledPixels.length; index += 4) {
      controlledPixels[index] = bone.r;
      controlledPixels[index + 1] = bone.g;
      controlledPixels[index + 2] = bone.b;
      controlledPixels[index + 3] = 255;
    }
    const paintControlled = (
      left: number,
      top: number,
      right: number,
      bottom: number,
      color: { r: number; g: number; b: number },
    ) => {
      for (let y = top; y <= bottom; y += 1) {
        for (let x = left; x <= right; x += 1) {
          const index = (y * controlledWidth + x) * 4;
          controlledPixels[index] = color.r;
          controlledPixels[index + 1] = color.g;
          controlledPixels[index + 2] = color.b;
        }
      }
    };
    paintControlled(420, 150, 580, 450, { r: 70, g: 65, b: 55 });
    paintControlled(494, 40, 506, 100, { r: 255, g: 255, b: 255 });

    assert.deepEqual(
      detectControlledRigBounds(
        controlledPixels,
        controlledWidth,
        controlledHeight,
        bone,
        { left: 350, top: 40, right: 650, bottom: 450 },
      ),
      { left: 420, top: 40, right: 580, bottom: 450 },
    );
  });

  it("ignores detached sidecar width while sizing the full primary product", () => {
    const transform = computeRigFrameTransform({
      width: 2080,
      height: 2288,
      rig: {
        ...FAMILY_RIG.cylinder,
        fillHeightPct: 79,
        fillWidthPct: 96,
      },
      detectedBaselineYPx: 2000,
      strongBounds: { top: 200, bottom: 2000, left: 400, right: 1900 },
      primaryBounds: { top: 400, bottom: 2000, left: 500, right: 800 },
      capState: "detached",
    });

    const expectedScale = (2288 * 0.79) / 1600;
    assert.ok(Math.abs(transform.scale - expectedScale) < 1e-6);
    assert.notEqual(transform.shiftXPx, 0, "primary bottle should be centered independently");

    // The same geometry authority now grades the detached cap independently;
    // it never relies on the bottle-only framing pass to imply cap fidelity.
    const width = 120;
    const height = 160;
    const bone = { r: 245, g: 243, b: 239 };
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let index = 0; index < pixels.length; index += 4) {
      pixels[index] = bone.r;
      pixels[index + 1] = bone.g;
      pixels[index + 2] = bone.b;
      pixels[index + 3] = 255;
    }
    const paint = (left: number, top: number, right: number, bottom: number) => {
      for (let y = top; y <= bottom; y += 1) {
        for (let x = left; x <= right; x += 1) {
          const index = (y * width + x) * 4;
          pixels[index] = 35;
          pixels[index + 1] = 35;
          pixels[index + 2] = 35;
        }
      }
    };
    paint(30, 20, 59, 139); // bottle: 120 x 30
    paint(82, 110, 101, 139); // cap: 30 x 20

    const measured = measureDetachedSidecarCapMetricsFromPixels(
      pixels,
      width,
      height,
      bone,
      139,
    );
    assert.deepEqual(measured, {
      capAspectRatio: 1.5,
      capHeightPctOfBottle: 25,
    });

    const pass = evaluateDetachedCapGeometryQa({
      expected: measured,
      observed: { capAspectRatio: 1.56, capHeightPctOfBottle: 26.5 },
    });
    assert.equal(pass.status, "pass");
    assert.deepEqual(pass.failures, []);

    const stretched = evaluateDetachedCapGeometryQa({
      expected: measured,
      observed: { capAspectRatio: 1.8, capHeightPctOfBottle: 30 },
    });
    assert.equal(stretched.status, "fail");
    assert.equal(stretched.enforcement, "strict");
    assert.match(stretched.failures.join(" "), /aspect ratio.*drift/i);
    assert.match(stretched.failures.join(" "), /height.*bottle/i);
    assert.deepEqual(stretched.blockingFailures, stretched.failures);

    const translucent = evaluateDetachedCapGeometryQa({
      expected: measured,
      observed: { capAspectRatio: 3, capHeightPctOfBottle: 45 },
      enforcement: "advisory",
    });
    assert.equal(translucent.status, "fail");
    assert.equal(translucent.enforcement, "advisory");
    assert.match(translucent.failures.join(" "), /aspect ratio.*drift/i);
    assert.deepEqual(translucent.blockingFailures, []);

    const unresolved = evaluateDetachedCapGeometryQa({
      expected: measured,
      observed: null,
    });
    assert.equal(unresolved.status, "fail");
    assert.match(unresolved.failures.join(" "), /could not be measured/i);

    const resolveEnforcement = (
      rigPostprocess as typeof rigPostprocess & {
        resolveDetachedCapGeometryEnforcement?: (input: {
          family?: string | null;
          capState?: string | null;
          applicator?: string | null;
        }) => "strict" | "advisory";
      }
    ).resolveDetachedCapGeometryEnforcement;
    assert.equal(typeof resolveEnforcement, "function");
    assert.equal(resolveEnforcement?.({
      family: "Cylinder",
      capState: "detached",
      applicator: "Fine Mist Sprayer",
    }), "advisory");
    assert.equal(resolveEnforcement?.({
      family: "Cylinder",
      capState: "detached",
      applicator: "Metal Roller Ball",
    }), "strict");
  });

});

describe("shadow ownership", () => {
  const width = 80;
  const height = 100;
  const bone = { r: 245, g: 243, b: 239 };
  const productBounds = { top: 20, bottom: 60, left: 32, right: 41 };
  const baseline = 60;

  const makePixels = () => {
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let p = 0; p < width * height; p += 1) {
      const i = p * 4;
      pixels[i] = bone.r;
      pixels[i + 1] = bone.g;
      pixels[i + 2] = bone.b;
      pixels[i + 3] = 255;
    }
    for (let y = productBounds.top; y <= productBounds.bottom; y += 1) {
      for (let x = productBounds.left; x <= productBounds.right; x += 1) {
        const i = (y * width + x) * 4;
        pixels[i] = 60;
        pixels[i + 1] = 58;
        pixels[i + 2] = 54;
      }
    }
    // A small model-owned contact lane immediately below the product.
    for (let y = baseline + 1; y <= baseline + 1; y += 1) {
      for (let x = productBounds.left; x <= productBounds.right + 2; x += 1) {
        const i = (y * width + x) * 4;
        pixels[i] = 190;
        pixels[i + 1] = 188;
        pixels[i + 2] = 184;
      }
    }
    return pixels;
  };

  it("detects separate bottle and sidecar contact bounds from final pixels", () => {
    const pixels = new Uint8ClampedArray(120 * 100 * 4);
    for (let index = 0; index < pixels.length; index += 4) {
      pixels[index] = bone.r;
      pixels[index + 1] = bone.g;
      pixels[index + 2] = bone.b;
      pixels[index + 3] = 255;
    }
    const paint = (left: number, top: number, right: number, bottom: number) => {
      for (let y = top; y <= bottom; y += 1) {
        for (let x = left; x <= right; x += 1) {
          const index = (y * 120 + x) * 4;
          pixels[index] = 70;
          pixels[index + 1] = 70;
          pixels[index + 2] = 70;
        }
      }
    };
    paint(40, 20, 60, 70);
    paint(85, 50, 100, 70);

    const bounds = detectModelShadowContactBounds({
      pixels,
      width: 120,
      height: 100,
      background: bone,
      groupBounds: { left: 40, right: 100, top: 20, bottom: 70 },
      baselineYPx: 70,
      topology: {
        kind: "detached-sidecar",
        expectedContacts: ["bottle", "sidecar"],
        source: "reviewed-reference",
      },
    });

    assert.deepEqual(bounds.bottle, { left: 40, right: 60, top: 20, bottom: 70 });
    assert.deepEqual(bounds.sidecar, { left: 85, right: 100, top: 50, bottom: 70 });
  });

  it("derives detached contact segments above a faint bridging floor lane", () => {
    const testWidth = 120;
    const testHeight = 100;
    const pixels = new Uint8ClampedArray(testWidth * testHeight * 4);
    for (let index = 0; index < pixels.length; index += 4) {
      pixels[index] = bone.r;
      pixels[index + 1] = bone.g;
      pixels[index + 2] = bone.b;
      pixels[index + 3] = 255;
    }
    const paint = (
      left: number,
      top: number,
      right: number,
      bottom: number,
      delta: number,
    ) => {
      for (let y = top; y <= bottom; y += 1) {
        for (let x = left; x <= right; x += 1) {
          const index = (y * testWidth + x) * 4;
          pixels[index] = bone.r - delta;
          pixels[index + 1] = bone.g - delta;
          pixels[index + 2] = bone.b - delta;
        }
      }
    };
    paint(40, 20, 60, 70, 150);
    paint(85, 45, 100, 70, 150);
    // Strong enough for the object threshold, but confined to the governed
    // lower floor/shadow lane. It must not merge the two physical objects.
    paint(61, 62, 84, 70, 8);

    const bounds = detectModelShadowContactBounds({
      pixels,
      width: testWidth,
      height: testHeight,
      background: bone,
      groupBounds: { left: 40, right: 100, top: 20, bottom: 70 },
      baselineYPx: 70,
      topology: {
        kind: "detached-sidecar",
        expectedContacts: ["bottle", "sidecar"],
        source: "reviewed-reference",
      },
    });

    assert.deepEqual(bounds.bottle, { left: 40, right: 60, top: 20, bottom: 70 });
    assert.deepEqual(bounds.sidecar, { left: 85, right: 100, top: 45, bottom: 70 });
  });

  it("preserves a model-owned shadow mask during Bone recanvas", () => {
    const pixels = makePixels();
    const shadowMask = new Uint8Array(width * height);
    const shadowX = productBounds.right + 1;
    const shadowY = baseline + 1;
    shadowMask[shadowY * width + shadowX] = 1;
    const originalShadowPixel = Array.from(pixels.slice((shadowY * width + shadowX) * 4, (shadowY * width + shadowX) * 4 + 4));

    const result = prepareUnmaskedRigRecanvasPixels(
      pixels,
      width,
      height,
      bone,
      productBounds,
      { preserveMask: shadowMask },
    );

    assert.deepEqual(
      Array.from(pixels.slice((shadowY * width + shadowX) * 4, (shadowY * width + shadowX) * 4 + 4)),
      originalShadowPixel,
    );
    assert.deepEqual(Array.from(pixels.slice(0, 4)), [bone.r, bone.g, bone.b, 255]);
    assert.ok(result.preservedShadowPixels > 0);
  });

  it("skips deterministic paint when the model owns the shadow", () => {
    const pixels = makePixels();
    const output = finalizeRigShadow({
      owner: "model",
      pixels,
      width,
      height,
      background: bone,
      objectBounds: productBounds,
      baselineYPx: baseline,
    });

    assert.equal(output.deterministicShadowPixels, 0);
    // Analyzer removed from the flow (Jordan 2026-07-19): model-owned shadows
    // report no QA object; human review judges them.
    assert.equal(output.shadowQa, null);
  });

  it("retains deterministic paint for rig ownership", () => {
    const pixels = makePixels();
    const output = finalizeRigShadow({
      owner: "rig",
      pixels,
      width,
      height,
      background: bone,
      objectBounds: productBounds,
      baselineYPx: baseline,
    });

    assert.ok(output.deterministicShadowPixels > 0);
    assert.equal(output.shadowQa, null);
  });

  it("leaves model-owned pixels untouched with no QA report even without a baseline", () => {
    const pixels = makePixels();
    const before = Array.from(pixels);
    const output = finalizeRigShadow({
      owner: "model",
      pixels,
      width,
      height,
      background: bone,
      objectBounds: productBounds,
      baselineYPx: null,
    });

    assert.equal(output.deterministicShadowPixels, 0);
    assert.equal(output.shadowQa, null);
    assert.deepEqual(Array.from(pixels), before);
  });

  it("coerces direct-call ownership to reviewed family policy", () => {
    assert.equal(
      resolveRigShadowOwner({
        graceSku: "GB-SPR-CLR-3ML-WHT",
        family: "Circle",
        shadowOwner: "model",
      }),
      "model",
    );
    assert.equal(
      resolveRigShadowOwner({ family: "Cap/Closure", shadowOwner: "model" }),
      "rig",
    );
    assert.equal(
      resolveRigShadowOwner({
        graceSku: "GB-SPR-CLR-3ML-BLK",
        family: "Cylinder",
      }),
      "model",
    );
  });
});

describe("model shadow geometry exclusion", () => {
  it("removes disconnected and overlong shadow candidates from geometry metrics", () => {
    const width = 120;
    const height = 160;
    const background = { r: 245, g: 243, b: 239 };
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = background.r;
      pixels[i + 1] = background.g;
      pixels[i + 2] = background.b;
      pixels[i + 3] = 255;
    }
    for (let y = 30; y <= 100; y += 1) {
      for (let x = 50; x <= 70; x += 1) {
        const i = (y * width + x) * 4;
        pixels[i] = 48;
        pixels[i + 1] = 46;
        pixels[i + 2] = 44;
      }
    }
    const paintShadow = (left: number, right: number, top: number, bottom: number, delta: number) => {
      for (let y = top; y <= bottom; y += 1) {
        for (let x = left; x <= right; x += 1) {
          const i = (y * width + x) * 4;
          pixels[i] = background.r - delta;
          pixels[i + 1] = background.g - delta;
          pixels[i + 2] = background.b - delta;
        }
      }
    };
    // Valid contact component, a disconnected component, and an overlong tail.
    // Include a dark contact component: baseline derivation must not mistake
    // a high-contrast, narrow model shadow for the product's final row.
    paintShadow(68, 78, 101, 104, 100);
    paintShadow(49, 52, 102, 104, 20);
    paintShadow(72, 75, 105, 130, 12);
    // Low-contrast out-of-lane noise is intentionally below the strong-bounds
    // detector; the control-envelope clamp still removes it from geometry.
    paintShadow(0, 18, 102, 105, 10);

    const rawBounds = detectStrongBounds(pixels, width, height, background);
    assert.ok(rawBounds);
    const rawBaseline = detectModelGeometryBaseline(
      pixels,
      width,
      height,
      background,
      rawBounds,
      130,
    );
    assert.equal(rawBaseline, 100);

    const analysis = analyzeModelOwnedShadow({
      pixels,
      width,
      height,
      background,
      objectBounds: { ...rawBounds, bottom: rawBaseline },
      baselineYPx: rawBaseline,
    });
    assert.ok(analysis.candidateMask.some((value) => value === 1));
    assert.ok(analysis.report.measurements.componentCount >= 2);

    const geometryPixels = new Uint8ClampedArray(pixels);
    const removed = maskOutModelShadowGeometry(
      geometryPixels,
      analysis.candidateMask,
      background,
    );
    const clamped = clampModelShadowGeometryToControlEnvelope(
      geometryPixels,
      width,
      height,
      background,
      { top: 30, bottom: rawBaseline, left: 50, right: 70 },
      rawBaseline,
    );
    assert.ok(removed > 0);
    assert.ok(clamped > 0);
    assert.deepEqual(
      detectStrongBounds(geometryPixels, width, height, background),
      { top: 30, bottom: 100, left: 50, right: 70 },
    );
  });
});

describe("addDeterministicContactShadow", () => {
  it("adds a soft back-right grounding shadow without repainting product pixels", () => {
    const width = 80;
    const height = 80;
    const bg = { r: 245, g: 243, b: 239 };
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = bg.r;
      pixels[i + 1] = bg.g;
      pixels[i + 2] = bg.b;
      pixels[i + 3] = 255;
    }
    const write = (x: number, y: number, color: { r: number; g: number; b: number }) => {
      const i = (y * width + x) * 4;
      pixels[i] = color.r;
      pixels[i + 1] = color.g;
      pixels[i + 2] = color.b;
    };
    const read = (x: number, y: number) => {
      const i = (y * width + x) * 4;
      return Array.from(pixels.slice(i, i + 4));
    };

    const productPixel = { r: 70, g: 68, b: 64 };
    write(40, 60, productPixel);

    const result = addDeterministicContactShadow(pixels, width, height, bg, {
      objectBounds: { top: 18, bottom: 60, left: 34, right: 46 },
      baselineYPx: 60,
    });

    assert.ok(result.shadowPixels > 0);
    assert.deepEqual(read(40, 60), [productPixel.r, productPixel.g, productPixel.b, 255]);
    assert.deepEqual(read(4, 4), [bg.r, bg.g, bg.b, 255]);
    assert.ok(read(45, 62)[0] < bg.r, "expected visible shadow immediately back-right of the base");
    assert.ok(
      read(50, 62)[0] < read(30, 62)[0],
      "expected the camera-right shadow extension to be stronger than camera-left",
    );
  });

  it("keeps the visible shadow attached to the baseline instead of forming a floating oval", () => {
    const width = 400;
    const height = 1000;
    const baseline = 800;
    const bg = { r: 246, g: 239, b: 232 };
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = bg.r;
      pixels[i + 1] = bg.g;
      pixels[i + 2] = bg.b;
      pixels[i + 3] = 255;
    }
    const read = (x: number, y: number) => {
      const i = (y * width + x) * 4;
      return Array.from(pixels.slice(i, i + 4));
    };
    const productPixelIndex = (baseline * width + width / 2) * 4;
    pixels[productPixelIndex] = 70;
    pixels[productPixelIndex + 1] = 68;
    pixels[productPixelIndex + 2] = 64;

    addDeterministicContactShadow(pixels, width, height, bg, {
      objectBounds: { top: 220, bottom: baseline, left: 150, right: 250 },
      baselineYPx: baseline,
    });

    assert.ok(
      read(width / 2, baseline + 1)[0] <= bg.r - 25,
      "expected a visible contact core on the first row below the bottle base",
    );
    assert.deepEqual(
      read(width / 2, baseline + 15),
      [bg.r, bg.g, bg.b, 255],
      "expected the grounding shadow to feather out before it can read as a detached oval",
    );
  });
});

describe("computeRigFrameTransform", () => {
  it("maps the detected glass shoulder and foot to the shoulder-lock landmarks", () => {
    const height = 2288;
    const rig = getFamilyRigForProduct({
      graceSku: "GB-CYL-CLR-9ML-SPR-MBLK",
      family: "Cylinder",
      bottleCollection: "Cylinder",
      capacityMl: 9,
      applicator: "Fine Mist Sprayer",
      heightWithCap: "126 mm",
      heightWithoutCap: "105 mm",
      diameter: "20 mm",
    });
    assert.ok(rig);
    assert.equal(rig.shoulderTargetPct, 62.5);
    assert.equal(rig.targetShoulderYPx, Math.round(height * 0.285));

    const sourceShoulderYPx = 881;
    const sourceFootYPx = 2082;
    const result = computeRigFrameTransform({
      width: 2080,
      height,
      rig,
      detectedBaselineYPx: sourceFootYPx,
      strongBounds: { top: 502, bottom: sourceFootYPx, left: 771, right: 1028 },
      primaryBounds: { top: 502, bottom: sourceFootYPx, left: 771, right: 1028 },
      bodyControlBounds: {
        top: sourceShoulderYPx,
        bottom: sourceFootYPx,
        left: 811,
        right: 988,
      },
      capState: "detached",
      preserveGeneratedScale: true,
    });

    assert.equal(
      Math.round(sourceShoulderYPx * result.scale + result.shiftYPx),
      rig.targetShoulderYPx,
    );
    assert.equal(
      Math.round(sourceFootYPx * result.scale + result.shiftYPx),
      result.targetBaselineYPx,
    );
  });

  it("fails shoulder QA when the landmark is missing or more than one percent off", () => {
    assert.deepEqual(
      evaluateShoulderLockQa({
        canvasHeight: 2288,
        targetShoulderYPx: 652,
        measuredShoulderYPx: null,
      }),
      {
        status: "fail",
        deltaPct: null,
        issue: "Cylinder glass shoulder landmark was not detectable after normalization.",
      },
    );
    const offTarget = evaluateShoulderLockQa({
      canvasHeight: 2288,
      targetShoulderYPx: 652,
      measuredShoulderYPx: 686,
    });
    assert.equal(offTarget.status, "fail");
    assert.equal(offTarget.deltaPct, 1.5);
    assert.match(offTarget.issue ?? "", /1\.5% from target/i);

    assert.deepEqual(
      evaluateShoulderLockQa({
        canvasHeight: 2288,
        targetShoulderYPx: 652,
        measuredShoulderYPx: 662,
      }),
      { status: "pass", deltaPct: 0.4, issue: null },
    );
  });

  it("preserves provider scale for production masters while still seating the baseline", () => {
    const result = computeRigFrameTransform({
      width: 2080,
      height: 2288,
      rig: {
        ...FAMILY_RIG.cylinder,
        fillHeightPct: 69,
        fillHeightRangePct: { min: 67, max: 71 },
        targetBodyHeightPx: 1094,
      },
      detectedBaselineYPx: 1980,
      strongBounds: { top: 250, bottom: 1980, left: 650, right: 1450 },
      primaryBounds: { top: 250, bottom: 1980, left: 650, right: 1050 },
      capState: "detached",
      preserveGeneratedScale: true,
    });

    assert.equal(result.scale, 1);
    assert.equal(result.targetBaselineYPx, 2082);
    assert.equal(result.shiftYPx, 102);
  });

  it("scales the full assembly about the glass foot from body-control bounds, not the assembly envelope", () => {
    const canvasHeight = 2288;
    const targetBodyHeightPx = Math.round(0.478 * canvasHeight); // 9 ml Classic scale-card target
    // Glass-only body is shorter than the seated sprayer + glass assembly envelope.
    const bodyControlBounds = { top: 1100, bottom: 2000, left: 900, right: 1180 }; // 900px glass
    const assemblyBounds = { top: 600, bottom: 2000, left: 900, right: 1180 }; // 1400px assembly
    const result = computeRigFrameTransform({
      width: 2080,
      height: canvasHeight,
      rig: {
        ...FAMILY_RIG.cylinder,
        fillHeightPct: 47.8,
        targetBodyHeightPx,
        fillHeightRangePct: { min: 45.8, max: 49.8 },
      },
      detectedBaselineYPx: 2000,
      strongBounds: assemblyBounds,
      primaryBounds: assemblyBounds,
      bodyControlBounds,
      capState: "assembled",
    });

    const measuredBodyHeightPx = bodyControlBounds.bottom - bodyControlBounds.top;
    const scaledBodyHeightPx = measuredBodyHeightPx * result.scale;
    assert.ok(
      Math.abs(scaledBodyHeightPx - targetBodyHeightPx) <= 1,
      `expected body ${targetBodyHeightPx}px, got ${scaledBodyHeightPx.toFixed(1)}px`,
    );

    const assemblyEnvelopeScale = (canvasHeight * (47.8 / 100)) / (assemblyBounds.bottom - assemblyBounds.top);
    assert.ok(
      Math.abs(result.scale - assemblyEnvelopeScale) > 0.05,
      "must not size from the taller assembly envelope",
    );
    assert.equal(
      Math.round(result.detectedBaselineYPx * result.scale + result.shiftYPx),
      2082,
      "glass foot must remain on the shared baseline",
    );
  });

  it("fails closed when scale-card body target lacks exact body-control bounds", () => {
    const rig = getFamilyRigForProduct({
      graceSku: "GB-CYL-BLU-9ML-MRL-MCPR",
      family: "Cylinder",
      bottleCollection: "Cylinder",
      capacityMl: 9,
      applicator: "Metal Roller Ball",
      heightWithCap: "83 ±1 mm",
      heightWithoutCap: "70 ±1 mm",
      diameter: "20 ±0.5 mm",
    });
    assert.ok(rig);
    assert.ok(rig.targetBodyHeightPx);

    assert.throws(
      () =>
        computeRigFrameTransform({
          width: 2080,
          height: 2288,
          rig,
          detectedBaselineYPx: 1800,
          strongBounds: { top: 800, bottom: 1800, left: 396, right: 1682 },
          primaryBounds: { top: 800, bottom: 1800, left: 620, right: 920 },
          capState: "detached",
        }),
      /body-control bounds/i,
    );
  });

  it("derives glass body-control bounds from vessel × heightWithoutCap/heightWithCap", async () => {
    const { deriveGlassBodyControlBounds } = await import("./rigPostprocess");
    const vessel = { top: 600, bottom: 2000, left: 900, right: 1180 };
    const derived = deriveGlassBodyControlBounds({
      vesselBounds: vessel,
      detectedBaselineYPx: 2000,
      heightWithoutCap: "70 mm",
      heightWithCap: "98 mm",
    });
    assert.ok(derived);
    assert.equal(derived.bottom, 2000);
    assert.equal(derived.left, 900);
    assert.equal(derived.right, 1180);
    // 1400 * (70/98) ≈ 1000
    assert.equal(derived.top, 2000 - Math.round(1400 * (70 / 98)));
    assert.notEqual(derived.top, vessel.top);
  });

  it("reduces a 9 ml PDP sidecar so bare glass lands on targetBodyHeightPx", () => {
    const rig = getFamilyRigForProduct({
      graceSku: "GB-CYL-CLR-9ML-T-21",
      family: "Cylinder",
      bottleCollection: "Cylinder",
      capacityMl: 9,
      applicator: "Fine Mist Sprayer",
      heightWithCap: "98 ±1 mm",
      heightWithoutCap: "70 ±1 mm",
      diameter: "20 ±0.5 mm",
      capState: "detached",
      mode: "fitment-attached-cap-right-sidecar",
    });
    assert.ok(rig);
    assert.ok(rig.targetBodyHeightPx);
    // Assembly includes seated sprayer above glass; body-control is glass only.
    const bodyControlBounds = { top: 480, bottom: 1980, left: 700, right: 1050 }; // 1500px glass
    const primaryBounds = { top: 250, bottom: 1980, left: 700, right: 1050 }; // 1730px primary
    const result = computeRigFrameTransform({
      width: 2080,
      height: 2288,
      rig,
      detectedBaselineYPx: 1980,
      strongBounds: { top: 250, bottom: 1980, left: 700, right: 1600 },
      primaryBounds,
      bodyControlBounds,
      capState: "detached",
    });

    const scaledBodyHeightPx = (bodyControlBounds.bottom - bodyControlBounds.top) * result.scale;
    assert.ok(Math.abs(scaledBodyHeightPx - rig.targetBodyHeightPx!) <= 1);
    assert.equal(Math.round(result.detectedBaselineYPx * result.scale + result.shiftYPx), 2082);
  });

  it("scales down a too-tall output while keeping the rig baseline fixed", () => {
    const rig = FAMILY_RIG.cylinder;
    const result = computeRigFrameTransform({
      width: 2080,
      height: 2288,
      rig,
      detectedBaselineYPx: 1999,
      strongBounds: { top: 12, bottom: 2000 },
    });

    assert.ok(result.scale < 0.95);
    assert.equal(result.shiftXPx, 0);
    assert.ok(result.shiftYPx > 120);
    assert.equal(Math.round(result.detectedBaselineYPx * result.scale + result.shiftYPx), 2082);
    assert.ok(result.transformedTopYPx >= 120);
    assert.ok(result.transformedBottomYPx <= 2276);
  });

  it("leaves an already 76%-rig-sized output essentially unchanged", () => {
    const rig = FAMILY_RIG.cylinder;
    const result = computeRigFrameTransform({
      width: 2080,
      height: 2288,
      rig,
      detectedBaselineYPx: 2082,
      strongBounds: { top: 343, bottom: 2082 },
    });

    assert.equal(result.scale, 1);
    assert.equal(result.shiftXPx, 0);
    assert.equal(result.shiftYPx, 0);
  });

  it("scales up small outputs without crowding the top of the canvas", () => {
    const rig = FAMILY_RIG.cylinder;
    const result = computeRigFrameTransform({
      width: 2080,
      height: 2288,
      rig,
      detectedBaselineYPx: 1660,
      strongBounds: { top: 610, bottom: 1660 },
    });

    assert.ok(result.scale > 1);
    assert.equal(Math.round(result.detectedBaselineYPx * result.scale + result.shiftYPx), 2082);
    assert.ok(result.transformedTopYPx != null);
    assert.ok(result.transformedTopYPx >= 340);
    assert.ok(result.transformedTopYPx <= 350);
  });

  it("normalizes the oversized 3 ml fine-mist sprayer envelope to the Cylinder target", () => {
    const rig = FAMILY_RIG.cylinder;
    const result = computeRigFrameTransform({
      width: 2080,
      height: 2288,
      rig,
      detectedBaselineYPx: 2093,
      strongBounds: { top: 154, bottom: 2093 },
    });

    assert.ok(result.scale < 0.9);
    assert.equal(Math.round(result.detectedBaselineYPx * result.scale + result.shiftYPx), 2082);
    assert.ok(result.transformedTopYPx != null);
    assert.ok(result.transformedBottomYPx != null);
    assert.ok(result.transformedTopYPx >= 340);
    assert.ok(result.transformedTopYPx <= 350);
    assert.ok(result.transformedBottomYPx >= 2081);
    assert.ok(result.transformedBottomYPx <= 2083);
  });
});

describe("detectStrongBounds", () => {
  it("samples a near-white generated canvas before measuring product bounds", () => {
    const prepareAnalysis = (
      rigPostprocess as unknown as Record<string, unknown>
    ).prepareRigAnalysisPixels;
    assert.equal(typeof prepareAnalysis, "function");
    if (typeof prepareAnalysis !== "function") return;

    const width = 120;
    const height = 140;
    const targetBone = { r: 246, g: 239, b: 232 };
    const sourceCanvas = { r: 254, g: 254, b: 254 };
    const pixels = new Uint8ClampedArray(width * height * 4);
    const write = (x: number, y: number, color: { r: number; g: number; b: number }) => {
      const i = (y * width + x) * 4;
      pixels[i] = color.r;
      pixels[i + 1] = color.g;
      pixels[i + 2] = color.b;
      pixels[i + 3] = 255;
    };

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) write(x, y, sourceCanvas);
    }
    for (let y = 30; y <= 120; y += 1) {
      for (let x = 54; x <= 66; x += 1) write(x, y, { r: 24, g: 24, b: 24 });
    }

    assert.deepEqual(detectStrongBounds(pixels, width, height, targetBone), {
      top: 0,
      bottom: 138,
      left: 0,
      right: 118,
    });

    const analysisPixels = new Uint8ClampedArray(pixels);
    const prepared = prepareAnalysis(
      analysisPixels,
      width,
      height,
      targetBone,
    ) as { background: { r: number; g: number; b: number } };

    assert.deepEqual(prepared.background, sourceCanvas);
    assert.deepEqual(detectStrongBounds(analysisPixels, width, height, prepared.background), {
      top: 30,
      bottom: 120,
      left: 54,
      right: 66,
    });
  });

  it("counts low-contrast pale caps as foreground against the Bone background", () => {
    const width = 200;
    const height = 260;
    const bg = { r: 238, g: 230, b: 212 };
    const paleCap = { r: 245, g: 241, b: 232 };
    const darkBody = { r: 80, g: 72, b: 58 };
    const pixels = new Uint8ClampedArray(width * height * 4);

    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = bg.r;
      pixels[i + 1] = bg.g;
      pixels[i + 2] = bg.b;
      pixels[i + 3] = 255;
    }

    const paintRect = (
      x0: number,
      y0: number,
      x1: number,
      y1: number,
      color: { r: number; g: number; b: number },
    ) => {
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const i = (y * width + x) * 4;
          pixels[i] = color.r;
          pixels[i + 1] = color.g;
          pixels[i + 2] = color.b;
        }
      }
    };

    paintRect(84, 30, 116, 76, paleCap);
    paintRect(76, 76, 124, 220, darkBody);

    const bounds = detectStrongBounds(pixels, width, height, bg);

    assert.deepEqual(bounds, { top: 30, bottom: 218, left: 76, right: 122 });
  });

  it("ignores isolated pale background noise when finding foreground bounds", () => {
    const width = 200;
    const height = 260;
    const bg = { r: 238, g: 230, b: 212 };
    const noise = { r: 248, g: 242, b: 232 };
    const darkBody = { r: 80, g: 72, b: 58 };
    const pixels = new Uint8ClampedArray(width * height * 4);

    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = bg.r;
      pixels[i + 1] = bg.g;
      pixels[i + 2] = bg.b;
      pixels[i + 3] = 255;
    }

    for (const [x, y] of [[20, 10], [171, 18], [110, 24]]) {
      const i = (y * width + x) * 4;
      pixels[i] = noise.r;
      pixels[i + 1] = noise.g;
      pixels[i + 2] = noise.b;
    }

    for (let y = 82; y < 220; y += 1) {
      for (let x = 76; x < 124; x += 1) {
        const i = (y * width + x) * 4;
        pixels[i] = darkBody.r;
        pixels[i + 1] = darkBody.g;
        pixels[i + 2] = darkBody.b;
      }
    }

    const bounds = detectStrongBounds(pixels, width, height, bg);

    assert.deepEqual(bounds, { top: 82, bottom: 218, left: 76, right: 122 });
  });
});

describe("detectAlphaControlBounds", () => {
  it("uses transparent mask alpha as the deterministic product envelope", () => {
    const width = 20;
    const height = 24;
    const mask = new Uint8ClampedArray(width * height * 4);

    for (let y = 5; y <= 18; y += 1) {
      for (let x = 8; x <= 12; x += 1) {
        mask[(y * width + x) * 4 + 3] = 255;
      }
    }

    const bounds = detectAlphaControlBounds({ data: mask, width, height });

    assert.deepEqual(bounds, {
      left: 8,
      right: 12,
      top: 5,
      bottom: 18,
      foregroundPixels: 70,
      foregroundPixelRatio: 70 / (width * height),
    });
  });
});

describe("detectGlassBodyWidthBounds", () => {
  it("measures lower glass walls without counting a wider fitment or sidecar cap", () => {
    const width = 100;
    const height = 120;
    const bg = { r: 245, g: 243, b: 239 };
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = bg.r;
      pixels[i + 1] = bg.g;
      pixels[i + 2] = bg.b;
      pixels[i + 3] = 255;
    }
    const paint = (left: number, right: number, top: number, bottom: number) => {
      for (let y = top; y <= bottom; y += 1) {
        for (let x = left; x <= right; x += 1) {
          const i = (y * width + x) * 4;
          pixels[i] = 70;
          pixels[i + 1] = 70;
          pixels[i + 2] = 70;
        }
      }
    };
    paint(25, 75, 20, 35); // wider sprayer / fitment
    paint(35, 37, 80, 108); // left glass wall
    paint(64, 66, 80, 108); // right glass wall
    paint(82, 95, 82, 109); // detached sidecar, outside primary control

    const bounds = rigPostprocess.detectGlassBodyWidthBounds(
      pixels,
      width,
      height,
      bg,
      { top: 20, bottom: 110, left: 20, right: 80 },
    );

    assert.equal(bounds?.left, 35);
    assert.equal(bounds?.right, 66);
  });
});

describe("getMaskControlledBoundsQaIssues", () => {
  it("blocks tiny generated products even when the mask envelope is large enough", () => {
    const issues = getMaskControlledBoundsQaIssues({
      generatedBounds: { left: 18, right: 22, top: 38, bottom: 45 },
      controlBounds: {
        left: 8,
        right: 30,
        top: 5,
        bottom: 45,
        foregroundPixels: 700,
        foregroundPixelRatio: 0.2,
      },
    });

    assert.match(issues.join(" "), /too small/i);
  });

  it("blocks generated products that do not overlap the transparent mask envelope", () => {
    const issues = getMaskControlledBoundsQaIssues({
      generatedBounds: { left: 2, right: 8, top: 5, bottom: 20 },
      controlBounds: {
        left: 24,
        right: 32,
        top: 5,
        bottom: 45,
        foregroundPixels: 700,
        foregroundPixelRatio: 0.2,
      },
    });

    assert.match(issues.join(" "), /does not overlap/i);
  });

  it("passes generated products that align with the mask envelope", () => {
    const issues = getMaskControlledBoundsQaIssues({
      generatedBounds: { left: 10, right: 28, top: 7, bottom: 44 },
      controlBounds: {
        left: 8,
        right: 30,
        top: 5,
        bottom: 45,
        foregroundPixels: 700,
        foregroundPixelRatio: 0.2,
      },
    });

    assert.deepEqual(issues, []);
  });
});

describe("getMaskControlledVisualContinuityQaIssues", () => {
  it("blocks generated products that collapse into disconnected sparse foreground", () => {
    const width = 120;
    const height = 160;
    const bg = { r: 238, g: 230, b: 212 };
    const pixels = new Uint8ClampedArray(width * height * 4);
    const controlBounds = {
      left: 42,
      right: 78,
      top: 18,
      bottom: 138,
      foregroundPixels: 3200,
      foregroundPixelRatio: 3200 / (width * height),
    };

    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = bg.r;
      pixels[i + 1] = bg.g;
      pixels[i + 2] = bg.b;
      pixels[i + 3] = 255;
    }

    const paintRect = (
      x0: number,
      y0: number,
      x1: number,
      y1: number,
      color: { r: number; g: number; b: number },
    ) => {
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const i = (y * width + x) * 4;
          pixels[i] = color.r;
          pixels[i + 1] = color.g;
          pixels[i + 2] = color.b;
        }
      }
    };

    paintRect(55, 20, 66, 30, { r: 180, g: 172, b: 154 });
    paintRect(54, 112, 67, 138, { r: 72, g: 68, b: 60 });

    const issues = getMaskControlledVisualContinuityQaIssues({
      pixels,
      width,
      height,
      bg,
      controlBounds,
    });

    assert.match(issues.join(" "), /discontinuous|too little visible/i);
  });

  it("passes clear-glass products with continuous edge signal through the mask envelope", () => {
    const width = 120;
    const height = 160;
    const bg = { r: 238, g: 230, b: 212 };
    const pixels = new Uint8ClampedArray(width * height * 4);
    const controlBounds = {
      left: 42,
      right: 78,
      top: 18,
      bottom: 138,
      foregroundPixels: 3200,
      foregroundPixelRatio: 3200 / (width * height),
    };

    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = bg.r;
      pixels[i + 1] = bg.g;
      pixels[i + 2] = bg.b;
      pixels[i + 3] = 255;
    }

    for (let y = 20; y <= 136; y += 1) {
      for (const x of [45, 46, 74, 75]) {
        const i = (y * width + x) * 4;
        pixels[i] = 90;
        pixels[i + 1] = 84;
        pixels[i + 2] = 74;
      }
    }

    const issues = getMaskControlledVisualContinuityQaIssues({
      pixels,
      width,
      height,
      bg,
      controlBounds,
    });

    assert.deepEqual(issues, []);
  });

  it("blocks pale mask-shaped silhouettes that do not contain real product detail", () => {
    const width = 120;
    const height = 160;
    const bg = { r: 238, g: 230, b: 212 };
    const pixels = new Uint8ClampedArray(width * height * 4);
    const controlBounds = {
      left: 38,
      right: 82,
      top: 18,
      bottom: 138,
      foregroundPixels: 4200,
      foregroundPixelRatio: 4200 / (width * height),
    };

    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = bg.r;
      pixels[i + 1] = bg.g;
      pixels[i + 2] = bg.b;
      pixels[i + 3] = 255;
    }

    for (let y = 20; y <= 136; y += 1) {
      for (let x = 42; x <= 78; x += 1) {
        const i = (y * width + x) * 4;
        pixels[i] = 250;
        pixels[i + 1] = 246;
        pixels[i + 2] = 236;
      }
      for (const x of [42, 78]) {
        const i = (y * width + x) * 4;
        pixels[i] = 78;
        pixels[i + 1] = 72;
        pixels[i + 2] = 62;
      }
    }

    const issues = getMaskControlledVisualContinuityQaIssues({
      pixels,
      width,
      height,
      bg,
      controlBounds,
    });

    assert.match(issues.join(" "), /detail|visible foreground/i);
  });
});

describe("flattenBackgroundLikePixels", () => {
  it("removes cream plate drift without flattening the cap, product, or contact shadow", () => {
    const bg = { r: 238, g: 230, b: 212 };
    const nearCreamPlate = { r: 245, g: 236, b: 218 };
    const subtleDarkerPlate = { r: 228, g: 220, b: 202 };
    const whiteCap = { r: 252, g: 250, b: 242 };
    const shadow = { r: 198, g: 187, b: 164 };
    const darkProduct = { r: 44, g: 42, b: 36 };
    const pixels = new Uint8ClampedArray(5 * 4);

    const write = (pixelIndex: number, color: { r: number; g: number; b: number }) => {
      const i = pixelIndex * 4;
      pixels[i] = color.r;
      pixels[i + 1] = color.g;
      pixels[i + 2] = color.b;
      pixels[i + 3] = 255;
    };

    write(0, nearCreamPlate);
    write(1, subtleDarkerPlate);
    write(2, whiteCap);
    write(3, shadow);
    write(4, darkProduct);

    const result = flattenBackgroundLikePixels(pixels, bg);

    assert.deepEqual(Array.from(pixels.slice(0, 3)), [bg.r, bg.g, bg.b]);
    assert.deepEqual(Array.from(pixels.slice(4, 7)), [bg.r, bg.g, bg.b]);
    assert.deepEqual(Array.from(pixels.slice(8, 11)), [whiteCap.r, whiteCap.g, whiteCap.b]);
    assert.deepEqual(Array.from(pixels.slice(12, 15)), [shadow.r, shadow.g, shadow.b]);
    assert.deepEqual(Array.from(pixels.slice(16, 19)), [darkProduct.r, darkProduct.g, darkProduct.b]);
    assert.equal(result.flattenedPixels, 2);
  });
});

describe("getVisibleMatteArtifactQaIssues", () => {
  const bg = { r: 238, g: 230, b: 212 };

  function makePixels(width: number, height: number): Uint8ClampedArray {
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = bg.r;
      pixels[i + 1] = bg.g;
      pixels[i + 2] = bg.b;
      pixels[i + 3] = 255;
    }
    return pixels;
  }

  function paintRect(
    pixels: Uint8ClampedArray,
    width: number,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    color: { r: number; g: number; b: number },
  ) {
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const i = (y * width + x) * 4;
        pixels[i] = color.r;
        pixels[i + 1] = color.g;
        pixels[i + 2] = color.b;
        pixels[i + 3] = 255;
      }
    }
  }

  it("flags a large pale matte rectangle left behind by generation", () => {
    const width = 120;
    const height = 140;
    const pixels = makePixels(width, height);

    paintRect(pixels, width, 58, 28, 98, 124, { r: 250, g: 246, b: 235 });
    paintRect(pixels, width, 46, 76, 56, 126, { r: 34, g: 32, b: 30 });

    const issues = getVisibleMatteArtifactQaIssues({ pixels, width, height, bg });

    assert.match(issues.join(" "), /matte|blotch/i);
  });

  it("allows a clean product with a local contact shadow on Bone", () => {
    const width = 120;
    const height = 140;
    const pixels = makePixels(width, height);

    paintRect(pixels, width, 54, 32, 66, 126, { r: 34, g: 32, b: 30 });
    paintRect(pixels, width, 64, 119, 88, 126, { r: 202, g: 190, b: 166 });

    const issues = getVisibleMatteArtifactQaIssues({ pixels, width, height, bg });

    assert.deepEqual(issues, []);
  });
});

describe("applyRigForegroundMatte", () => {
  it("retains coherent gray cap edges after a cool plate is converted to warm Bone", () => {
    const detectControlled = (
      rigPostprocess as unknown as Record<string, unknown>
    ).detectControlledRigBounds;
    assert.equal(typeof detectControlled, "function");
    if (typeof detectControlled !== "function") return;

    const width = 100;
    const height = 140;
    const targetBone = { r: 246, g: 239, b: 232 };
    const sourceBackground = { r: 248, g: 248, b: 248 };
    const translucentGrayCap = { r: 230, g: 230, b: 230 };
    const darkBottle = { r: 38, g: 36, b: 34 };
    const pixels = new Uint8ClampedArray(width * height * 4);
    const paint = (
      left: number,
      top: number,
      right: number,
      bottom: number,
      color: { r: number; g: number; b: number },
    ) => {
      for (let y = top; y <= bottom; y += 1) {
        for (let x = left; x <= right; x += 1) {
          const i = (y * width + x) * 4;
          pixels[i] = color.r;
          pixels[i + 1] = color.g;
          pixels[i + 2] = color.b;
          pixels[i + 3] = 255;
        }
      }
    };

    paint(0, 0, width - 1, height - 1, sourceBackground);
    paint(44, 30, 56, 59, translucentGrayCap);
    paint(42, 60, 58, 120, darkBottle);
    const sourceBounds = detectStrongBounds(pixels, width, height, sourceBackground);
    assert.deepEqual(sourceBounds, { top: 30, bottom: 120, left: 42, right: 58 });

    prepareUnmaskedRigRecanvasPixels(pixels, width, height, targetBone, sourceBounds);
    assert.deepEqual(
      detectStrongBounds(pixels, width, height, targetBone),
      { top: 60, bottom: 120, left: 42, right: 58 },
      "the global detector reproduces the warm-background undercount",
    );
    assert.deepEqual(
      detectControlled(pixels, width, height, targetBone, sourceBounds),
      sourceBounds,
      "the product-envelope detector should recover coherent translucent cap edges",
    );
  });

  it("preserves a pale clear-cap envelope while converting the source plate to Bone", () => {
    const width = 100;
    const height = 140;
    const targetBone = { r: 246, g: 239, b: 232 };
    const sourceBackground = { r: 245, g: 245, b: 245 };
    const paleClearCap = { r: 251, g: 251, b: 251 };
    const darkBottle = { r: 38, g: 36, b: 34 };
    const pixels = new Uint8ClampedArray(width * height * 4);
    const paintRect = (
      left: number,
      top: number,
      right: number,
      bottom: number,
      color: { r: number; g: number; b: number },
    ) => {
      for (let y = top; y <= bottom; y += 1) {
        for (let x = left; x <= right; x += 1) {
          const i = (y * width + x) * 4;
          pixels[i] = color.r;
          pixels[i + 1] = color.g;
          pixels[i + 2] = color.b;
          pixels[i + 3] = 255;
        }
      }
    };

    paintRect(0, 0, width - 1, height - 1, sourceBackground);
    paintRect(44, 30, 56, 59, paleClearCap);
    paintRect(42, 60, 58, 120, darkBottle);

    const initialBounds = detectStrongBounds(pixels, width, height, sourceBackground);
    assert.deepEqual(initialBounds, { top: 30, bottom: 120, left: 42, right: 58 });

    prepareUnmaskedRigRecanvasPixels(
      pixels,
      width,
      height,
      targetBone,
      initialBounds,
    );

    assert.deepEqual(
      detectStrongBounds(pixels, width, height, targetBone),
      initialBounds,
      "expected the final QA detector to retain the full pale cap measured before recanvas",
    );
  });

  it("normalizes an unmasked source plate before translation without erasing clear detail", () => {
    const prepare = (
      rigPostprocess as unknown as Record<string, unknown>
    ).prepareUnmaskedRigRecanvasPixels;
    assert.equal(typeof prepare, "function");
    if (typeof prepare !== "function") return;

    const width = 16;
    const height = 12;
    const bg = { r: 246, g: 239, b: 232 };
    const sourceBackground = { r: 248, g: 248, b: 248 };
    const product = { r: 28, g: 26, b: 24 };
    const pixels = new Uint8ClampedArray(width * height * 4);
    const write = (x: number, y: number, color: { r: number; g: number; b: number }) => {
      const i = (y * width + x) * 4;
      pixels[i] = color.r;
      pixels[i + 1] = color.g;
      pixels[i + 2] = color.b;
      pixels[i + 3] = 255;
    };

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) write(x, y, sourceBackground);
    }
    for (let y = 3; y <= 10; y += 1) {
      write(6, y, product);
      write(9, y, product);
    }
    write(7, 6, { r: 250, g: 248, b: 244 });

    prepare(pixels, width, height, bg, { left: 6, right: 9, top: 3, bottom: 10 });

    const rgbaAt = (x: number, y: number) => {
      const i = (y * width + x) * 4;
      return Array.from(pixels.slice(i, i + 4));
    };
    assert.deepEqual(rgbaAt(0, 0), [bg.r, bg.g, bg.b, 255]);
    assert.deepEqual(rgbaAt(15, 11), [bg.r, bg.g, bg.b, 255]);
    assert.deepEqual(rgbaAt(6, 6), [product.r, product.g, product.b, 255]);
    assert.notDeepEqual(rgbaAt(7, 6), [bg.r, bg.g, bg.b, 255]);
    assert.deepEqual(rgbaAt(8, 6), [bg.r, bg.g, bg.b, 255]);
  });

  it("removes pale matte pollution inside protected clear-glass bounds while preserving real edges and faint material", () => {
    const width = 28;
    const height = 32;
    const bg = { r: 245, g: 243, b: 239 };
    const darkGlassEdge = { r: 86, g: 88, b: 86 };
    const paleInterior = { r: 255, g: 255, b: 255 };
    // Only ~5 units above bg on every channel — reads as background-like by NO
    // established threshold in this file (isPaleBackgroundLike needs +6/+10/+14).
    // This is what a genuinely faint, correctly-rendered pale component (e.g. a
    // clear plastic overcap) looks like, and must be preserved, not erased.
    const faintRealMaterial = { r: 250, g: 248, b: 244 };
    const looseHalo = { r: 255, g: 255, b: 255 };
    const pixels = new Uint8ClampedArray(width * height * 4);

    const write = (x: number, y: number, color: { r: number; g: number; b: number }) => {
      const i = (y * width + x) * 4;
      pixels[i] = color.r;
      pixels[i + 1] = color.g;
      pixels[i + 2] = color.b;
      pixels[i + 3] = 255;
    };

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        write(x, y, bg);
      }
    }

    for (let y = 7; y < 27; y += 1) {
      write(10, y, darkGlassEdge);
      write(17, y, darkGlassEdge);
    }
    for (let y = 12; y < 22; y += 1) {
      for (let x = 12; x < 16; x += 1) {
        write(x, y, paleInterior);
      }
    }
    write(14, 16, faintRealMaterial);
    for (let y = 12; y < 22; y += 1) {
      for (let x = 2; x < 6; x += 1) {
        write(x, y, looseHalo);
      }
    }

    applyRigForegroundMatte(pixels, width, height, bg, {
      protectedProductBounds: { left: 10, right: 17, top: 7, bottom: 26 },
    });

    const alphaAt = (x: number, y: number) => pixels[(y * width + x) * 4 + 3];

    assert.equal(alphaAt(10, 16), 255);
    assert.equal(alphaAt(17, 16), 255);
    assert.equal(alphaAt(13, 16), 0);
    // Faint real material (only ~5 units above bg) is preserved, not erased.
    assert.equal(alphaAt(14, 16), 255);
    assert.equal(alphaAt(3, 16), 0);
  });

  it("removes a generated background plate while preserving product pixels and contact shadow", () => {
    const width = 12;
    const height = 10;
    const bg = { r: 238, g: 230, b: 212 };
    const plate = { r: 230, g: 221, b: 204 };
    const darkGlass = { r: 68, g: 62, b: 52 };
    const paleCap = { r: 252, g: 248, b: 238 };
    const shadow = { r: 190, g: 180, b: 158 };
    const pixels = new Uint8ClampedArray(width * height * 4);

    const write = (x: number, y: number, color: { r: number; g: number; b: number }) => {
      const i = (y * width + x) * 4;
      pixels[i] = color.r;
      pixels[i + 1] = color.g;
      pixels[i + 2] = color.b;
      pixels[i + 3] = 255;
    };

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        write(x, y, bg);
      }
    }

    for (let y = 2; y < 9; y += 1) {
      for (let x = 2; x < 11; x += 1) {
        write(x, y, plate);
      }
    }

    write(5, 2, paleCap);
    write(5, 3, paleCap);
    write(5, 4, darkGlass);
    write(5, 5, darkGlass);
    write(5, 6, darkGlass);
    write(5, 7, darkGlass);
    write(6, 8, shadow);
    write(7, 8, shadow);

    const result = applyRigForegroundMatte(pixels, width, height, bg);

    const alphaAt = (x: number, y: number) => pixels[(y * width + x) * 4 + 3];

    assert.equal(alphaAt(2, 2), 0);
    assert.equal(alphaAt(10, 8), 0);
    assert.equal(alphaAt(5, 2), 255);
    assert.equal(alphaAt(5, 5), 255);
    assert.ok(alphaAt(6, 8) > 0);
    assert.ok(alphaAt(6, 8) < 255);
    assert.equal(result.mattedBackgroundPixels, 112);
    assert.equal(result.opaqueForegroundPixels, 6);
    assert.equal(result.shadowPixels, 2);
  });

  it("removes diffuse pale halo texture away from the product", () => {
    const width = 24;
    const height = 20;
    const bg = { r: 238, g: 230, b: 212 };
    const halo = { r: 252, g: 247, b: 236 };
    const darkGlass = { r: 62, g: 58, b: 48 };
    const paleCap = { r: 252, g: 248, b: 238 };
    const pixels = new Uint8ClampedArray(width * height * 4);

    const write = (x: number, y: number, color: { r: number; g: number; b: number }) => {
      const i = (y * width + x) * 4;
      pixels[i] = color.r;
      pixels[i + 1] = color.g;
      pixels[i + 2] = color.b;
      pixels[i + 3] = 255;
    };

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        write(x, y, bg);
      }
    }

    for (let y = 4; y < 14; y += 1) {
      for (let x = 3; x < 21; x += 1) {
        write(x, y, halo);
      }
    }

    for (let y = 5; y < 9; y += 1) {
      for (let x = 10; x < 14; x += 1) {
        write(x, y, paleCap);
      }
    }
    for (let y = 8; y < 17; y += 1) {
      write(9, y, darkGlass);
      write(14, y, darkGlass);
    }

    applyRigForegroundMatte(pixels, width, height, bg);

    const alphaAt = (x: number, y: number) => pixels[(y * width + x) * 4 + 3];

    assert.equal(alphaAt(4, 5), 0);
    assert.equal(alphaAt(19, 12), 0);
    assert.equal(alphaAt(11, 6), 255);
    assert.equal(alphaAt(9, 12), 255);
  });

  it("keeps contact shadow near the product but removes far shadow plate texture", () => {
    const width = 24;
    const height = 20;
    const bg = { r: 238, g: 230, b: 212 };
    const darkGlass = { r: 62, g: 58, b: 48 };
    const shadow = { r: 190, g: 180, b: 158 };
    const pixels = new Uint8ClampedArray(width * height * 4);

    const write = (x: number, y: number, color: { r: number; g: number; b: number }) => {
      const i = (y * width + x) * 4;
      pixels[i] = color.r;
      pixels[i + 1] = color.g;
      pixels[i + 2] = color.b;
      pixels[i + 3] = 255;
    };

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        write(x, y, bg);
      }
    }

    for (let y = 7; y < 17; y += 1) {
      write(9, y, darkGlass);
      write(14, y, darkGlass);
    }
    write(15, 16, shadow);
    write(16, 16, shadow);
    write(22, 16, shadow);

    applyRigForegroundMatte(pixels, width, height, bg, { shadowNeighborhoodPx: 4 });

    const alphaAt = (x: number, y: number) => pixels[(y * width + x) * 4 + 3];

    assert.ok(alphaAt(15, 16) > 0);
    assert.ok(alphaAt(15, 16) < 255);
    assert.equal(alphaAt(22, 16), 0);
  });

  it("removes disconnected lower-right texture while keeping the close contact shadow", () => {
    const width = 60;
    const height = 60;
    const bg = { r: 238, g: 230, b: 212 };
    const darkGlass = { r: 62, g: 58, b: 48 };
    const contactShadow = { r: 190, g: 180, b: 158 };
    const grittyTexture = { r: 198, g: 188, b: 166 };
    const pixels = new Uint8ClampedArray(width * height * 4);

    const write = (x: number, y: number, color: { r: number; g: number; b: number }) => {
      const i = (y * width + x) * 4;
      pixels[i] = color.r;
      pixels[i + 1] = color.g;
      pixels[i + 2] = color.b;
      pixels[i + 3] = 255;
    };

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        write(x, y, bg);
      }
    }

    for (let y = 20; y < 48; y += 1) {
      write(26, y, darkGlass);
      write(27, y, darkGlass);
    }

    for (let x = 28; x <= 33; x += 1) {
      write(x, 48, contactShadow);
      write(x, 49, contactShadow);
    }

    for (let y = 44; y <= 52; y += 2) {
      for (let x = 42; x <= 48; x += 2) {
        write(x, y, grittyTexture);
      }
    }

    applyRigForegroundMatte(pixels, width, height, bg);

    const alphaAt = (x: number, y: number) => pixels[(y * width + x) * 4 + 3];

    assert.ok(alphaAt(30, 48) > 0);
    assert.ok(alphaAt(30, 48) < 255);
    assert.equal(alphaAt(42, 48), 0);
  });

  it("removes a long horizontal shadow smear beyond the close grounding zone", () => {
    const width = 60;
    const height = 60;
    const bg = { r: 238, g: 230, b: 212 };
    const darkGlass = { r: 62, g: 58, b: 48 };
    const contactShadow = { r: 190, g: 180, b: 158 };
    const pixels = new Uint8ClampedArray(width * height * 4);

    const write = (x: number, y: number, color: { r: number; g: number; b: number }) => {
      const i = (y * width + x) * 4;
      pixels[i] = color.r;
      pixels[i + 1] = color.g;
      pixels[i + 2] = color.b;
      pixels[i + 3] = 255;
    };

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        write(x, y, bg);
      }
    }

    for (let y = 20; y < 48; y += 1) {
      write(26, y, darkGlass);
      write(27, y, darkGlass);
    }

    for (let x = 28; x <= 31; x += 1) {
      write(x, 48, contactShadow);
    }
    write(34, 48, contactShadow);

    applyRigForegroundMatte(pixels, width, height, bg);

    const alphaAt = (x: number, y: number) => pixels[(y * width + x) * 4 + 3];

    assert.ok(alphaAt(30, 48) > 0);
    assert.ok(alphaAt(30, 48) < 255);
    assert.equal(alphaAt(34, 48), 0);
  });
});

describe("applyMaskControlledForegroundMatte", () => {
  it("removes the generated white matte rectangle outside the mask-controlled product", () => {
    const width = 40;
    const height = 50;
    const bg = { r: 238, g: 230, b: 212 };
    const whiteMatte = { r: 255, g: 252, b: 244 };
    const darkGlass = { r: 56, g: 52, b: 44 };
    const shadow = { r: 194, g: 184, b: 162 };
    const pixels = new Uint8ClampedArray(width * height * 4);
    const mask = new Uint8ClampedArray(width * height * 4);

    const write = (target: Uint8ClampedArray, x: number, y: number, color: { r: number; g: number; b: number }, alpha = 255) => {
      const i = (y * width + x) * 4;
      target[i] = color.r;
      target[i + 1] = color.g;
      target[i + 2] = color.b;
      target[i + 3] = alpha;
    };

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        write(pixels, x, y, bg);
      }
    }

    for (let y = 17; y < 46; y += 1) {
      for (let x = 12; x < 29; x += 1) {
        write(pixels, x, y, whiteMatte);
      }
    }
    for (let y = 20; y < 42; y += 1) {
      for (let x = 18; x < 22; x += 1) {
        write(pixels, x, y, darkGlass);
        mask[(y * width + x) * 4 + 3] = 255;
      }
    }
    for (let x = 22; x <= 28; x += 1) {
      write(pixels, x, 42, shadow);
    }

    const result = applyMaskControlledForegroundMatte(pixels, width, height, bg, {
      data: mask,
      width,
      height,
    });
    const alphaAt = (x: number, y: number) => pixels[(y * width + x) * 4 + 3];

    assert.equal(alphaAt(13, 18), 0);
    assert.equal(alphaAt(27, 44), 0);
    assert.equal(alphaAt(19, 30), 255);
    assert.ok(alphaAt(23, 42) > 0);
    assert.ok(alphaAt(23, 42) < 255);
    assert.ok(result.mattedBackgroundPixels > 0);
    assert.ok(result.opaqueForegroundPixels > 0);
    assert.ok(result.shadowPixels > 0);
  });

  it("supports a no-shadow recanvas before final model shadow QA", () => {
    const width = 40;
    const height = 50;
    const bg = { r: 238, g: 230, b: 212 };
    const pixels = new Uint8ClampedArray(width * height * 4);
    const mask = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = bg.r;
      pixels[i + 1] = bg.g;
      pixels[i + 2] = bg.b;
      pixels[i + 3] = 255;
    }
    for (let y = 20; y < 42; y += 1) {
      const i = (y * width + 20) * 4;
      pixels[i] = 56;
      pixels[i + 1] = 52;
      pixels[i + 2] = 44;
      mask[i + 3] = 255;
    }
    for (let x = 22; x <= 28; x += 1) {
      const i = (42 * width + x) * 4;
      pixels[i] = 194;
      pixels[i + 1] = 184;
      pixels[i + 2] = 162;
    }

    const result = applyMaskControlledForegroundMatte(
      pixels,
      width,
      height,
      bg,
      { data: mask, width, height },
      { controlBounds: { left: 20, right: 20, top: 20, bottom: 41, foregroundPixels: 22, foregroundPixelRatio: 22 / (width * height) }, paintShadow: false },
    );

    assert.equal(result.shadowPixels, 0);
    assert.equal(pixels[(42 * width + 23) * 4 + 3], 0);
  });
});

describe("detectTallestComponentBounds", () => {
  it("isolates the tallest component instead of merging bottle and sidecar cap", () => {
    const width = 200;
    const height = 100;
    const bg = { r: 246, g: 239, b: 232 };
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i += 1) {
      pixels[i * 4] = bg.r; pixels[i * 4 + 1] = bg.g; pixels[i * 4 + 2] = bg.b; pixels[i * 4 + 3] = 255;
    }
    const paint = (x0: number, x1: number, y0: number, y1: number) => {
      for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) {
        const i = (y * width + x) * 4;
        pixels[i] = 40; pixels[i + 1] = 40; pixels[i + 2] = 40;
      }
    };
    paint(40, 59, 10, 89);   // tall narrow bottle: h=80 w=20
    paint(120, 159, 60, 89); // short wide sidecar cap: h=30 w=40

    const bounds = rigPostprocess.detectTallestComponentBounds(pixels, width, height, bg);
    assert.ok(bounds);
    assert.equal(bounds?.left, 40);
    assert.equal(bounds?.right, 59);
    assert.equal(bounds?.top, 10);
    assert.equal(bounds?.bottom, 89);
  });
});

describe("detectComplexAssemblyBottleBounds", () => {
  it("isolates the baseline-reaching bottle from a connected bulb and tassel", () => {
    const width = 300;
    const height = 180;
    const baseline = 164;
    const bg = { r: 245, g: 243, b: 239 };
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i += 1) {
      pixels[i * 4] = bg.r;
      pixels[i * 4 + 1] = bg.g;
      pixels[i * 4 + 2] = bg.b;
      pixels[i * 4 + 3] = 255;
    }
    const paint = (x0: number, x1: number, y0: number, y1: number) => {
      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          const i = (y * width + x) * 4;
          pixels[i] = 45;
          pixels[i + 1] = 45;
          pixels[i + 2] = 45;
        }
      }
    };

    paint(205, 244, 28, baseline); // bottle + assembled sprayer
    paint(24, 90, 82, baseline); // bulb and tassel
    paint(88, 207, 24, 34); // connected braided hose

    const bounds = rigPostprocess.detectComplexAssemblyBottleBounds(
      pixels,
      width,
      height,
      bg,
      baseline,
    );

    assert.deepEqual(bounds, {
      left: 205,
      right: 244,
      top: 28,
      bottom: baseline,
    });
  });
});

describe("resolveWholeVesselBounds — clear-glass sliver fix", () => {
  const width = 600;
  const height = 1000;
  const bg = { r: 246, g: 239, b: 232 };

  /**
   * Synthetic bare clear-glass cap-off frame reproducing the production
   * failure: strong side walls, an interior whose glass evidence sits BELOW
   * the silver-proof occupancy threshold (delta 14) but ABOVE the interior
   * evidence threshold (delta 12), and a detached cap on the right.
   */
  function makeClearBottleFrame(options?: { interiorEvidence?: boolean }) {
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i += 1) {
      pixels[i * 4] = bg.r; pixels[i * 4 + 1] = bg.g; pixels[i * 4 + 2] = bg.b; pixels[i * 4 + 3] = 255;
    }
    const paint = (x0: number, x1: number, y0: number, y1: number, delta: number) => {
      for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) {
        const i = (y * width + x) * 4;
        pixels[i] = bg.r - delta; pixels[i + 1] = bg.g - delta; pixels[i + 2] = bg.b - delta;
      }
    };
    // Bottle walls: strong refractive edges (delta 60), 800 px tall.
    paint(100, 115, 100, 899, 60); // left wall
    paint(385, 400, 100, 899, 60); // right wall
    if (options?.interiorEvidence !== false) {
      // Interior glass: shoulder gradient + base thickness band at delta 14 —
      // fails the occupancy scan (> 14 required) so the detector still splits
      // the bottle, but carries interior evidence (> 12) for the resolver.
      paint(116, 384, 100, 140, 14); // shoulder band
      paint(116, 384, 860, 899, 14); // base band
    }
    // Detached sidecar cap to the right: 200 px tall (25% of bottle) — must
    // never merge into the vessel (extent alignment fails by construction).
    paint(470, 530, 700, 899, 60);
    return pixels;
  }

  it("reunites the two wall slivers of one transparent vessel", () => {
    const pixels = makeClearBottleFrame();
    // Prove the production failure exists: the raw tallest silver-proof
    // component is a wall sliver, not the vessel.
    const sliver = rigPostprocess.tallestSilverProofBounds(pixels, width, height, bg);
    assert.ok(sliver);
    assert.ok((sliver!.right - sliver!.left + 1) <= 20, "expected raw detector to see a wall sliver");

    const vessel = rigPostprocess.resolveWholeVesselBounds(pixels, width, height, bg);
    assert.ok(vessel);
    assert.equal(vessel?.left, 100);
    assert.equal(vessel?.right, 400);
    assert.equal(vessel?.top, 100);
    assert.equal(vessel?.bottom, 899);
    const aspect = (vessel!.bottom - vessel!.top + 1) / (vessel!.right - vessel!.left + 1);
    assert.ok(aspect > 2.5 && aspect < 2.8, `vessel aspect ${aspect} should be ~2.66, not a sliver ratio`);
  });

  it("never merges the detached sidecar cap into the vessel", () => {
    const vessel = rigPostprocess.resolveWholeVesselBounds(makeClearBottleFrame(), width, height, bg);
    assert.ok(vessel);
    assert.ok(vessel!.right < 470, "cap must stay outside the vessel bounds");
  });

  it("reunites walls with a taller closure-bearing center column (capped morphology)", () => {
    // Production case GB-CYL-CLR-50ML-RDC-MSLV-T: wall / center / wall, where
    // the center column carries the reducer cap and tops out ~12% of frame
    // height above the walls. Base-aligned, height ratio 0.86.
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i += 1) {
      pixels[i * 4] = bg.r; pixels[i * 4 + 1] = bg.g; pixels[i * 4 + 2] = bg.b; pixels[i * 4 + 3] = 255;
    }
    const paint = (x0: number, x1: number, y0: number, y1: number, delta: number) => {
      for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) {
        const i = (y * width + x) * 4;
        pixels[i] = bg.r - delta; pixels[i + 1] = bg.g - delta; pixels[i + 2] = bg.b - delta;
      }
    };
    paint(100, 115, 220, 899, 60);  // left wall (body only)
    paint(230, 270, 100, 899, 60);  // center column incl. cap above shoulder
    paint(385, 400, 222, 899, 60);  // right wall
    paint(116, 384, 860, 899, 14);  // base band evidence across the interior
    paint(470, 530, 700, 899, 60);  // detached sidecar cap (25% height)

    const vessel = rigPostprocess.resolveWholeVesselBounds(pixels, width, height, bg);
    assert.ok(vessel);
    assert.equal(vessel?.left, 100);
    assert.equal(vessel?.right, 400);
    assert.equal(vessel?.top, 100, "vessel top must include the closure");
    assert.equal(vessel?.bottom, 899);
    assert.ok(vessel!.right < 470, "sidecar cap must stay excluded");
  });

  it("reunites 50 ml roll-on glass walls that are shorter than the roller column", () => {
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i += 1) {
      pixels[i * 4] = bg.r; pixels[i * 4 + 1] = bg.g; pixels[i * 4 + 2] = bg.b; pixels[i * 4 + 3] = 255;
    }
    const paint = (x0: number, x1: number, y0: number, y1: number, delta: number) => {
      for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) {
        const i = (y * width + x) * 4;
        pixels[i] = bg.r - delta; pixels[i + 1] = bg.g - delta; pixels[i + 2] = bg.b - delta;
      }
    };
    // Walls are ~0.69 of the roller column, the live 50 ml roll-on sidecar split.
    paint(100, 115, 348, 899, 60);
    paint(230, 270, 100, 899, 60);
    paint(385, 400, 350, 899, 60);
    paint(116, 384, 860, 899, 14);
    paint(470, 530, 650, 899, 60);

    const vessel = rigPostprocess.resolveWholeVesselBounds(pixels, width, height, bg);
    assert.ok(vessel);
    assert.equal(vessel?.left, 100);
    assert.equal(vessel?.right, 400);
    assert.equal(vessel?.top, 100);
    assert.ok(vessel!.right < 470, "sidecar cap must stay excluded");
  });

  it("refuses to fuse aligned objects with clean background between them", () => {
    const pixels = makeClearBottleFrame({ interiorEvidence: false });
    const vessel = rigPostprocess.resolveWholeVesselBounds(pixels, width, height, bg);
    assert.ok(vessel);
    // Without interior glass evidence the walls stay separate objects.
    assert.ok((vessel!.right - vessel!.left + 1) <= 20, "no-evidence gap must not merge");
  });

  it("measures the real detached cap against the whole vessel, not a wall sliver", () => {
    const metrics = rigPostprocess.measureDetachedSidecarCapMetricsFromPixels(
      makeClearBottleFrame(), width, height, bg,
    );
    assert.ok(metrics);
    // Cap: 200 px of an 800 px bottle = 25%; a wall-sliver bottle would have
    // reported the right wall (~100%) or graded the cap against 800/16.
    assert.ok(Math.abs(metrics!.capHeightPctOfBottle - 25) < 2, `capHeightPct ${metrics!.capHeightPctOfBottle} should be ~25`);
    const expectedCapAspect = 200 / 61;
    assert.ok(Math.abs(metrics!.capAspectRatio - expectedCapAspect) < 0.2, `capAspect ${metrics!.capAspectRatio} should be ~${expectedCapAspect.toFixed(2)}`);
  });
});

describe("trimModelOwnedShadowIntoBand", () => {
  it("clips over-extended feather and stray blobs while keeping in-band shadow", () => {
    const width = 400, height = 1000, baseline = 900;
    const bg = { r: 246, g: 239, b: 232 };
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i += 1) {
      pixels[i * 4] = bg.r; pixels[i * 4 + 1] = bg.g; pixels[i * 4 + 2] = bg.b; pixels[i * 4 + 3] = 255;
    }
    const paint = (x0: number, x1: number, y0: number, y1: number, v: number) => {
      for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) {
        const i = (y * width + x) * 4;
        pixels[i] = v; pixels[i + 1] = v; pixels[i + 2] = v;
      }
    };
    paint(100, 179, 100, baseline, 40);        // bottle above baseline: width 80
    paint(100, 340, baseline + 2, baseline + 8, 170); // feather extending 161px right of bottle (2x width)
    paint(360, 390, baseline + 2, baseline + 10, 170); // stray disconnected blob
    const changed = rigPostprocess.trimModelOwnedShadowIntoBand({
      pixels, width, height, bg, baselineYPx: baseline,
    });
    assert.ok(changed > 0);
    const shadowAt = (x: number) => {
      const i = ((baseline + 3) * width + x) * 4;
      return Math.abs(pixels[i] - bg.r) > 12;
    };
    assert.ok(shadowAt(190), "in-band feather must survive");   // within right+0.29w-fade
    assert.ok(!shadowAt(230), "feather beyond keep-zone must be gone"); // 179+23=202 cutoff
    assert.ok(!shadowAt(370), "stray blob must be erased");
  });

  it("declares only band/blob/depth failures trimmable", () => {
    assert.ok(rigPostprocess.isModelShadowFailureTrimmable([
      "sidecar: Shadow right extension ratio 0.353 exceeds 0.32.",
      "Multiple connected shadow components detected (2).",
    ]));
    assert.ok(!rigPostprocess.isModelShadowFailureTrimmable([
      "Shadow right extension ratio 0.353 exceeds 0.32.",
      "Lower shadow feather is darker than the contact band.",
    ]));
    assert.ok(!rigPostprocess.isModelShadowFailureTrimmable([]));
  });
});

describe("shoulder landmark wiring", () => {
  it("hands the detector the locked glass body's proportions and the canvas colour", () => {
    // Without the proportions the detector cannot refuse a wrong landmark, and the
    // rig's own shoulder QA re-detects around its target, so nothing else would.
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "rigPostprocess.ts"),
      "utf8",
    );
    assert.match(source, /expectedBodyAspectRatio:\s*input\.rig\.glassBodyAspect/);
    assert.match(source, /background:\s*input\.bg/);
  });
});
