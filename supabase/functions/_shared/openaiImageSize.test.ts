import test from "node:test";
import assert from "node:assert/strict";
import { resolveGptImageSize } from "./openaiImageSize.ts";

const MAX_EDGE = 3840;
const MIN_PIXELS = 655_360;
const MAX_PIXELS = 8_294_400;

function parse(size: string): { w: number; h: number } {
  const [w, h] = size.split("x").map(Number);
  return { w, h };
}

/** Every constraint the API enforces. A violation here is a hard 400. */
function assertValid(size: string, label: string) {
  const { w, h } = parse(size);
  assert.ok(Number.isInteger(w) && Number.isInteger(h), `${label}: non-integer ${size}`);
  assert.equal(w % 16, 0, `${label}: width ${w} not a multiple of 16`);
  assert.equal(h % 16, 0, `${label}: height ${h} not a multiple of 16`);
  assert.ok(w <= MAX_EDGE && h <= MAX_EDGE, `${label}: edge over 3840 in ${size}`);
  const ratio = w / h;
  assert.ok(ratio <= 3 && ratio >= 1 / 3, `${label}: aspect ${ratio.toFixed(2)} outside 1:3..3:1`);
  const total = w * h;
  assert.ok(total >= MIN_PIXELS, `${label}: ${total} below the pixel floor`);
  assert.ok(total <= MAX_PIXELS, `${label}: ${total} above the pixel ceiling`);
}

const UI_RATIOS = ["1:1", "16:9", "9:16", "2:3", "3:4", "1:2", "2:1", "4:5", "3:2", "4:3", "21:9"];
const TIERS = ["standard", "high", "4k"];

test("every UI ratio at every tier satisfies all four API constraints", () => {
  for (const ratio of UI_RATIOS) {
    for (const tier of TIERS) {
      assertValid(resolveGptImageSize(ratio, tier), `${ratio}@${tier}`);
    }
  }
});

test("every UI ratio is actually honoured, not snapped to a bucket", () => {
  for (const ratio of UI_RATIOS) {
    const [rw, rh] = ratio.split(":").map(Number);
    const want = rw / rh;
    for (const tier of TIERS) {
      const { w, h } = parse(resolveGptImageSize(ratio, tier));
      const got = w / h;
      // A 16px grid cannot hit every ratio exactly; 2% is far tighter than the
      // 1.50-vs-2.33 the bucketed mapper produced for 21:9.
      const drift = Math.abs(got - want) / want;
      assert.ok(
        drift < 0.02,
        `${ratio}@${tier}: wanted ${want.toFixed(3)}, got ${got.toFixed(3)} (${w}x${h}), drift ${(drift * 100).toFixed(1)}%`,
      );
    }
  }
});

test("the regression that started this: 21:9 is no longer 3:2 or 16:9", () => {
  for (const tier of TIERS) {
    const size = resolveGptImageSize("21:9", tier);
    assert.notEqual(size, "1536x1024");
    assert.notEqual(size, "2048x1152");
    assert.notEqual(size, "3840x2160");
    const { w, h } = parse(size);
    assert.ok(Math.abs(w / h - 21 / 9) < 0.05, `21:9@${tier} produced ${size}`);
  }
});

test("portrait ratios stay portrait and distinct from one another", () => {
  const nineSixteen = parse(resolveGptImageSize("9:16", "high"));
  const fourFive = parse(resolveGptImageSize("4:5", "high"));
  const twoThree = parse(resolveGptImageSize("2:3", "high"));
  for (const p of [nineSixteen, fourFive, twoThree]) {
    assert.ok(p.h > p.w, "portrait must be taller than wide");
  }
  // The bucketed mapper collapsed all three onto 1152x2048.
  const ratios = [nineSixteen, fourFive, twoThree].map((p) => (p.w / p.h).toFixed(3));
  assert.equal(new Set(ratios).size, 3, `expected three distinct ratios, got ${ratios.join(", ")}`);
});

test("higher tiers give more pixels at the same ratio", () => {
  for (const ratio of ["1:1", "21:9", "9:16"]) {
    const std = parse(resolveGptImageSize(ratio, "standard"));
    const high = parse(resolveGptImageSize(ratio, "high"));
    assert.ok(high.w * high.h > std.w * std.h, `${ratio}: high must exceed standard`);
  }
});

test("ratios beyond 3:1 are clamped into range rather than rejected", () => {
  for (const extreme of ["5:1", "1:5", "10:1"]) {
    const size = resolveGptImageSize(extreme, "high");
    assertValid(size, extreme);
    const { w, h } = parse(size);
    const ratio = w / h;
    assert.ok(ratio <= 3.02 && ratio >= 1 / 3.02, `${extreme} produced ${ratio.toFixed(2)}`);
  }
});

test("an unparseable or missing ratio falls back to square", () => {
  for (const bad of [undefined, "", "not-a-ratio", "0:0"]) {
    const size = resolveGptImageSize(bad, "standard");
    assertValid(size, String(bad));
    const { w, h } = parse(size);
    assert.equal(w, h, `${bad} should be square, got ${size}`);
  }
});
