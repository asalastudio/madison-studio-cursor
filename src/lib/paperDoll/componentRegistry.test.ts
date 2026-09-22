import { test } from "node:test";
import assert from "node:assert/strict";

import {
  analyzeAlpha,
  approveRegistryEntry,
  buildBodyPlateId,
  buildClosureId,
  detectKeySide,
  measureBackgroundBoneDelta,
  measureEdgeHaloDelta,
  parseCanonGeometryRows,
  parseCsvLine,
  resolveCanonGeometry,
  runBodyPlateQa,
  runClosureQa,
  threadSizeExistsInCanon,
  upsertRegistryEntry,
  type RegistryEntry,
  type RgbaImage,
} from "./componentRegistry";

// ─── helpers ─────────────────────────────────────────────────────────

const BONE = { r: 0xf5, g: 0xf3, b: 0xef };

function makeImage(
  width: number,
  height: number,
  fill: (x: number, y: number) => [number, number, number, number],
  hasAlpha = true,
): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = fill(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return { data, width, height, hasAlpha };
}

/** Alpha cutout: gray box in the middle, transparent elsewhere. */
function cutoutImage(size = 400, keyLeft = true): RgbaImage {
  const lo = Math.round(size * 0.25);
  const hi = Math.round(size * 0.75);
  return makeImage(size, size, (x, y) => {
    const inside = x >= lo && x < hi && y >= lo && y < hi;
    if (!inside) return [0, 0, 0, 0];
    const t = (x - lo) / (hi - lo); // 0 at left edge of object → 1 at right
    const lum = keyLeft ? 200 - t * 80 : 120 + t * 80;
    return [lum, lum, lum, 255];
  });
}

// ─── ids & keys ──────────────────────────────────────────────────────

test("closure and body-plate ids are stable slugs", () => {
  assert.equal(
    buildClosureId({ neckThreadSize: "13-415", applicator: "Plastic Roller Ball", colorway: "Shiny Gold" }),
    "closure__13-415__plastic-roller-ball__shiny-gold",
  );
  assert.equal(
    buildBodyPlateId({ family: "Cylinder", capacityMl: 9, color: "Clear", bodyHeightMm: 70, widthAxisMm: 20 }),
    "body__cylinder__9ml__clear__70.0x20.0mm",
  );
});

// ─── upsert / freeze / approve ───────────────────────────────────────

function entryFixture(id: string, sha: string, status: RegistryEntry["status"] = "pending-review"): RegistryEntry {
  return {
    id,
    role: "closure",
    closureKey: { neckThreadSize: "13-415", applicator: "Fine Mist Sprayer", colorway: "Matte Gold" },
    asset: { path: "/tmp/x.png", sha256: sha, widthPx: 500, heightPx: 500, hasAlpha: true },
    provenance: { source: "psd-layer-export", intakeDate: "2026-07-31T00:00:00Z" },
    qa: {
      alphaCoverageRatio: 0.2,
      edgeHaloDelta: 3,
      keySide: "left",
      backgroundBoneDelta: null,
      minEdgePaddingPx: 10,
      issues: [],
      passed: true,
    },
    status,
  };
}

test("upsert creates, updates, and refuses to break an approved SHA freeze", () => {
  const a = entryFixture("closure__x", "a".repeat(64));
  let { entries, action } = upsertRegistryEntry([], a);
  assert.equal(action, "created");

  // Same sha + status → unchanged.
  assert.equal(upsertRegistryEntry(entries, a).action, "unchanged");

  // Pending entries may be replaced freely.
  const b = entryFixture("closure__x", "b".repeat(64));
  ({ entries, action } = upsertRegistryEntry(entries, b));
  assert.equal(action, "updated");

  // Approved entries are frozen.
  const approved = entryFixture("closure__x", "b".repeat(64), "approved");
  ({ entries } = upsertRegistryEntry(entries, approved));
  const c = entryFixture("closure__x", "c".repeat(64));
  assert.throws(() => upsertRegistryEntry(entries, c), /SHA-frozen/);
  assert.equal(upsertRegistryEntry(entries, c, { force: true }).action, "updated");
});

test("approve stamps reviewer and refuses failing QA", () => {
  const bad = entryFixture("closure__bad", "d".repeat(64));
  bad.qa = { ...bad.qa, passed: false, issues: ["no_alpha_channel"] };
  assert.throws(() => approveRegistryEntry([bad], "closure__bad", "jordan", "2026-07-31T01:00:00Z"), /failing intake QA/);

  const good = entryFixture("closure__good", "e".repeat(64));
  const approved = approveRegistryEntry([good], "closure__good", "jordan", "2026-07-31T01:00:00Z");
  assert.equal(approved[0].status, "approved");
  assert.equal(approved[0].reviewedBy, "jordan");
});

// ─── pixel QA ────────────────────────────────────────────────────────

test("analyzeAlpha reports coverage and edge padding", () => {
  const img = cutoutImage(400);
  const { coverageRatio, minEdgePaddingPx } = analyzeAlpha(img);
  assert.ok(coverageRatio > 0.2 && coverageRatio < 0.3, `coverage ${coverageRatio}`);
  assert.equal(minEdgePaddingPx, 100);
});

test("detectKeySide reads the lit side of the foreground", () => {
  assert.equal(detectKeySide(cutoutImage(400, true)), "left");
  assert.equal(detectKeySide(cutoutImage(400, false)), "right");
});

test("edge halo compares the fringe to the OBJECT color, not the canvas", () => {
  // Clean straight-alpha cutout: fringe carries the object's own color.
  const clean = makeImage(100, 100, (x) => (x === 50 ? [90, 90, 90, 128] : x < 50 ? [90, 90, 90, 255] : [0, 0, 0, 0]));
  const cleanDelta = measureEdgeHaloDelta(clean);
  assert.ok(cleanDelta !== null && cleanDelta < 2, `clean ${cleanDelta}`);

  // Fringe contaminated by a pure-white source background → high delta.
  const halo = makeImage(100, 100, (x) => (x === 50 ? [255, 255, 255, 128] : x < 50 ? [90, 90, 90, 255] : [0, 0, 0, 0]));
  const haloDelta = measureEdgeHaloDelta(halo);
  assert.ok(haloDelta !== null && haloDelta > 40, `halo ${haloDelta}`);

  // Bone-colored fringe on a dark object is ALSO contamination (the first
  // real estate part proved the old vs-Bone comparison backwards).
  const boneFringe = makeImage(100, 100, (x) => (x === 50 ? [BONE.r, BONE.g, BONE.b, 128] : x < 50 ? [90, 90, 90, 255] : [0, 0, 0, 0]));
  const boneDelta = measureEdgeHaloDelta(boneFringe);
  assert.ok(boneDelta !== null && boneDelta > 40, `boneFringe ${boneDelta}`);
});

test("background Bone delta is ~0 on Bone and high on white", () => {
  const onBone = makeImage(200, 200, () => [BONE.r, BONE.g, BONE.b, 255], false);
  assert.ok(measureBackgroundBoneDelta(onBone) < 0.5);
  const onWhite = makeImage(200, 200, () => [255, 255, 255, 255], false);
  assert.ok(measureBackgroundBoneDelta(onWhite) > 8);
});

test("closure QA rejects flattened composites and passes clean cutouts", () => {
  const flattened: RgbaImage = { ...cutoutImage(400), hasAlpha: false };
  const flat = runClosureQa(flattened);
  assert.equal(flat.passed, false);
  assert.ok(flat.issues.some((i) => i.startsWith("no_alpha_channel")));

  const clean = runClosureQa(cutoutImage(400));
  assert.equal(clean.passed, true, clean.issues.join("; "));
  assert.equal(clean.keySide, "left");
});

test("body-plate QA requires a Bone background and resolution floor", () => {
  const whitePlate = makeImage(1200, 1200, () => [255, 255, 255, 255], false);
  const white = runBodyPlateQa(whitePlate);
  assert.equal(white.passed, false);
  assert.ok(white.issues.some((i) => i.startsWith("background_not_bone")));

  const bonePlate = makeImage(1200, 1200, (x, y) => {
    const inside = x > 400 && x < 800 && y > 200 && y < 1000;
    return inside ? [120, 120, 120, 255] : [BONE.r, BONE.g, BONE.b, 255];
  }, false);
  const bone = runBodyPlateQa(bonePlate);
  assert.equal(bone.passed, true, bone.issues.join("; "));

  const tiny = runBodyPlateQa(makeImage(400, 400, () => [BONE.r, BONE.g, BONE.b, 255], false));
  assert.equal(tiny.passed, false);
});

test("disjoint stray content fails intake (the metal-roller junk-patch lesson)", () => {
  // Fitment blob + separated junk patch, like the real PSD layer.
  const dirty = makeImage(400, 400, (x, y) => {
    const fitment = x >= 150 && x < 250 && y >= 40 && y < 160;
    const junk = x >= 100 && x < 300 && y >= 240 && y < 360;
    return fitment || junk ? [200, 200, 205, 255] : [0, 0, 0, 0];
  });
  const result = runClosureQa(dirty);
  assert.equal(result.passed, false);
  assert.ok(result.issues.some((i) => i.startsWith("multiple_disjoint_foreground_regions")));

  const clean = runClosureQa(cutoutImage(400));
  assert.equal(clean.issues.some((i) => i.startsWith("multiple_disjoint")), false);
});

test("mm-aware resolution floor scales with the part's physical size", () => {
  // 200px-tall foreground on a small canvas.
  const smallPart = makeImage(160, 220, (x, y) => {
    const inside = x >= 30 && x < 130 && y >= 10 && y < 210;
    return inside ? [180, 180, 185, 255] : [0, 0, 0, 0];
  });
  // 15mm part: 200px / (15×22=330) ≈ 0.61× → usable, warned.
  const warned = runClosureQa(smallPart, { heightMm: 15 });
  assert.equal(warned.passed, true, warned.issues.join("; "));
  assert.ok((warned.warnings ?? []).some((w) => w.startsWith("resolution_upscaled")));
  // 25mm part: 200px / 550 ≈ 0.36× → unusable.
  const failed = runClosureQa(smallPart, { heightMm: 25 });
  assert.equal(failed.passed, false);
  assert.ok(failed.issues.some((i) => i.startsWith("resolution_below_mm_floor")));
  // No declared mm → legacy absolute floor applies.
  const legacy = runClosureQa(smallPart);
  assert.ok(legacy.issues.some((i) => i.startsWith("resolution_below_floor")));
});

test("halo tolerance widens for mirror finishes but not matte ones", () => {
  // Same moderate fringe deviation (~Δ51) on two finishes.
  const box = { lo: 100, hi: 300 };
  const makeFinish = (solidAt: (x: number) => number) =>
    makeImage(400, 400, (x, y) => {
      const inside = x >= box.lo && x < box.hi && y >= box.lo && y < box.hi;
      const fringe = x === box.hi && y >= box.lo && y < box.hi;
      if (fringe) return [178, 178, 178, 128];
      if (!inside) return [0, 0, 0, 0];
      const lum = solidAt(x);
      return [lum, lum, lum, 255];
    });

  // Mirror: alternating white/black bands → high foreground σ.
  const mirror = runClosureQa(makeFinish((x) => (x % 4 < 2 ? 255 : 0)));
  assert.equal(mirror.issues.some((i) => i.startsWith("edge_halo")), false,
    mirror.issues.join("; "));
  assert.ok((mirror.warnings ?? []).some((w) => w.startsWith("edge_halo_specular_tolerance")));

  // Matte: uniform mid-gray → same fringe deviation is contamination.
  const matte = runClosureQa(makeFinish(() => 127));
  assert.ok(matte.issues.some((i) => i.startsWith("edge_halo")));
});

// ─── canon join ──────────────────────────────────────────────────────

const CANON_CSV = [
  "graceSku,family,color,capacityMl,neckThreadSize,canon_bodyHeightMm,canon_widthAxisMm",
  "A,Cylinder,Clear,9,13-415,70.0,20.0",
  "B,Cylinder,Clear,9,13-415,70.0,20.0",
  'C,"Cylinder",Amber,9,13-415,70.0,21.0',
  "D,Cylinder,Frosted,9,13-415,74.0,20.0",
  "E,Cylinder,Frosted,9,13-415,74.0,21.0",
].join("\n");

test("csv line parser handles quoted commas and escaped quotes", () => {
  assert.deepEqual(parseCsvLine('a,"b,c","d""x"'), ["a", "b,c", 'd"x']);
});

test("canon geometry resolves unique bodies and rejects ambiguity", () => {
  const rows = parseCanonGeometryRows(CANON_CSV);
  assert.deepEqual(resolveCanonGeometry(rows, "Cylinder", 9, "Clear"), { bodyHeightMm: 70, widthAxisMm: 20 });
  // Frosted 9ml spans two width geometries → must be resolved explicitly.
  assert.throws(() => resolveCanonGeometry(rows, "Cylinder", 9, "Frosted"), /Ambiguous canon geometry/);
  assert.throws(() => resolveCanonGeometry(rows, "Cylinder", 9, "Cobalt"), /No canon geometry/);
  assert.equal(threadSizeExistsInCanon(rows, "13-415"), true);
  assert.equal(threadSizeExistsInCanon(rows, "99-999"), false);
});

test("neck gate measures thread CREST, not the median of the whole band", async () => {
  const { measureNeckThreadCrestWidth } = await import("./componentRegistry");
  const bodyW = 363;
  // Synthetic profile mirroring the real v3 plate: bore, then threads
  // oscillating crest/valley, then the shoulder flare.
  const widths: number[] = [];
  widths.push(148, 200, 230);                       // rim + bore (narrow)
  for (let i = 0; i < 28; i++) {                    // thread band
    widths.push(i % 2 === 0 ? 269 : 236);           // crest 74% / valley 65%
  }
  widths.push(353, 363, 363);                       // shoulder + body

  const crest = measureNeckThreadCrestWidth(widths, bodyW);
  assert.ok(crest !== null);
  // Must land on the crest (~74%), not the median of crest+valley+bore (~68%).
  const pct = (crest! / bodyW) * 100;
  assert.ok(pct > 72 && pct < 76, `crest read ${pct.toFixed(1)}% — expected ~74%`);

  // The shoulder must be excluded — a crest at 97% would mean contamination.
  assert.ok(crest! < bodyW * 0.9);

  // Too few neck rows → null rather than a bogus number.
  assert.equal(measureNeckThreadCrestWidth([300, 363, 363], bodyW), null);
});

// ─── Task 3: physical fitment keys (neck × applicator × finish × cap state) ─

test("physical fitment keys keep neck size and cap state distinct", async () => {
  const { buildPhysicalFitmentKey, buildFitmentSlotId } = await import("./componentRegistry");

  const shared = {
    applicator: "Fine Mist Sprayer",
    finishColor: "Matte Black",
  };

  const neckA = buildPhysicalFitmentKey({
    ...shared,
    neckThreadSize: "13-415",
    capState: "assembled-cap-on",
  });
  const neckB = buildPhysicalFitmentKey({
    ...shared,
    neckThreadSize: "17-415",
    capState: "assembled-cap-on",
  });
  const capOff = buildPhysicalFitmentKey({
    ...shared,
    neckThreadSize: "13-415",
    capState: "cap-off-applicator-exposed",
  });

  assert.notEqual(neckA, neckB);
  assert.notEqual(neckA, capOff);
  assert.equal(
    buildFitmentSlotId({
      neckThreadSize: "13-415",
      applicator: "Fine Mist Sprayer",
      capColor: "Matte Black",
      capState: "assembled-cap-on",
    }),
    "fitment-13-415-fine-mist-sprayer-matte-black-assembled-cap-on",
  );
});

test("equal applicator+capColor labels on different necks do not collapse", async () => {
  const { buildFitmentSlotId } = await import("./componentRegistry");
  const a = buildFitmentSlotId({
    applicator: "Plastic Roller Ball",
    capColor: "Black",
    neckThreadSize: "13-415",
    capState: "assembled-cap-on",
  });
  const b = buildFitmentSlotId({
    applicator: "Plastic Roller Ball",
    capColor: "Black",
    neckThreadSize: "16mm",
    capState: "assembled-cap-on",
  });
  assert.notEqual(a, b);
});
