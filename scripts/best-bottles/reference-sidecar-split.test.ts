import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { clipDetachedSidecar, findTouchingSidecar } from "./reference-sidecar-split";

// A clear bottle is its walls: a 4px outline on white, the way the flats read.
const WIDTH = 420;
const HEIGHT = 520;
const WHITE = { r: 255, g: 255, b: 255 };

function canvas() {
  const rgba = new Uint8ClampedArray(WIDTH * HEIGHT * 4).fill(255);
  const paint = (x: number, y: number) => {
    const index = (y * WIDTH + x) * 4;
    rgba[index] = 90;
    rgba[index + 1] = 90;
    rgba[index + 2] = 90;
  };
  const outline = (left: number, top: number, right: number, bottom: number) => {
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        if (x - left < 4 || right - x < 4 || y - top < 4 || bottom - y < 4) paint(x, y);
      }
    }
  };
  const fill = (left: number, top: number, right: number, bottom: number) => {
    for (let y = top; y <= bottom; y += 1) for (let x = left; x <= right; x += 1) paint(x, y);
  };
  const ink = (x: number, y: number) => rgba[(y * WIDTH + x) * 4]! < 243;
  return { rgba, outline, fill, ink };
}

function inkFrame(ink: (x: number, y: number) => boolean) {
  let left = WIDTH;
  let right = -1;
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      if (!ink(x, y)) continue;
      if (top < 0) top = y;
      bottom = y;
      left = Math.min(left, x);
      right = Math.max(right, x);
    }
  }
  return { left, right, top, bottom };
}

/** Neck and fitment, a body, and a belly wider than the body higher up. */
function bottle(draw: ReturnType<typeof canvas>, bellyRight: number) {
  draw.fill(130, 60, 170, 150);
  draw.outline(60, 150, 240, 500);
  draw.outline(40, 230, bellyRight, 330);
}

describe("findTouchingSidecar", () => {
  it("reads a frame with one object on the baseline as no cap at all", () => {
    const draw = canvas();
    bottle(draw, 260);
    assert.deepEqual(findTouchingSidecar(draw.ink, WIDTH, HEIGHT, inkFrame(draw.ink)), { kind: "no-cap" });
  });

  it("finds the cap tucked under a belly, where no empty column separates them", () => {
    const draw = canvas();
    bottle(draw, 300);
    draw.fill(280, 400, 380, 500);
    const frame = inkFrame(draw.ink);
    for (let x = frame.left + 40; x < frame.right; x += 1) {
      let empty = true;
      for (let y = frame.top; y <= frame.bottom && empty; y += 1) if (draw.ink(x, y)) empty = false;
      assert.equal(empty, false, `column ${x} is empty, so this frame does not test the touching case`);
    }
    assert.deepEqual(findTouchingSidecar(draw.ink, WIDTH, HEIGHT, frame), { kind: "cap", left: 280 });
  });

  it("leaves a cap fused to the glass unresolved", () => {
    const draw = canvas();
    bottle(draw, 260);
    draw.fill(280, 170, 380, 500);
    draw.fill(236, 200, 280, 206);
    assert.deepEqual(findTouchingSidecar(draw.ink, WIDTH, HEIGHT, inkFrame(draw.ink)), { kind: "unresolved" });
  });
});

describe("clipDetachedSidecar", () => {
  it("keeps the whole vessel when no cap is pictured beside the bottle", () => {
    const draw = canvas();
    bottle(draw, 260);
    const vessel = inkFrame(draw.ink);
    assert.equal(clipDetachedSidecar(draw.rgba, WIDTH, HEIGHT, WHITE, vessel), null);
  });

  it("ends the bottle where the touching cap starts", () => {
    const draw = canvas();
    bottle(draw, 300);
    draw.fill(280, 400, 380, 500);
    const vessel = inkFrame(draw.ink);
    assert.deepEqual(clipDetachedSidecar(draw.rgba, WIDTH, HEIGHT, WHITE, vessel), {
      left: vessel.left,
      right: 279,
      top: 60,
      bottom: 500,
    });
  });
});
