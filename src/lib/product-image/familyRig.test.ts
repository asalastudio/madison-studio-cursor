import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FAMILY_RIG,
  buildImposedRigBlock,
  computePrimaryBottleRigScale,
  computeRigFitScale,
  getFamilyRig,
  getFamilyRigForProduct,
  hasFamilyRig,
} from "./familyRig";
import { computeRigFrameTransform } from "./rigPostprocess";

const approx = (a: number, b: number) => Math.abs(a - b) < 1e-6;

describe("family rig (profile-aware fit-to-box)", () => {
  const W = 2080;
  const H = 2288;

  it("fit-to-box binds on height for a tall, narrow assembly", () => {
    const cfg = FAMILY_RIG.cylinder; // fillHeightPct 76, fillWidthPct 62
    const scale = computeRigFitScale(cfg, 200, 1000, W, H);
    assert.ok(approx(scale, (cfg.fillHeightPct / 100) * H / 1000));
  });

  it("fit-to-box binds on width for a short, wide assembly", () => {
    const cfg = FAMILY_RIG.cylinder;
    const scale = computeRigFitScale(cfg, 1500, 300, W, H);
    assert.ok(approx(scale, (cfg.fillWidthPct / 100) * W / 1500));
  });

  it("fit-to-box always contains (takes the smaller scale)", () => {
    const cfg = FAMILY_RIG.cylinder;
    const scale = computeRigFitScale(cfg, 1500, 1000, W, H);
    const sH = (cfg.fillHeightPct / 100) * H / 1000;
    const sW = (cfg.fillWidthPct / 100) * W / 1500;
    assert.ok(approx(scale, Math.min(sH, sW)));
  });

  it("derives one persistent bare-glass target for cap-on and cap-off states", () => {
    const base = {
      family: "Cylinder",
      capacityMl: 100,
      heightWithCap: "150 ±2 mm",
      heightWithoutCap: "130 ±2 mm",
      diameter: "42 ±0.5 mm",
    } as const;
    const assembled = getFamilyRigForProduct(base);
    const detached = getFamilyRigForProduct({
      ...base,
      capState: "detached",
      mode: "fitment-attached-cap-right-sidecar",
    });

    assert.ok(assembled);
    assert.ok(detached);
    assert.equal(assembled.scaleContractVersion, "shoulder-lock-2026-09-07");
    assert.equal(assembled.glassBodyKey, "cylinder:100-standard");
    assert.equal(assembled.shoulderTargetPct, 67.5);
    assert.equal(assembled.shoulderYFromTopPct, 23.5);
    assert.equal(assembled.targetBodyHeightPx, Math.round(0.675 * 2288));
    assert.equal(assembled.scaleTag, "Cylinder 100 ml");
    assert.equal(assembled.bareGlassHeightMm, 130);
    assert.equal(assembled.glassHeightPct, undefined);
    assert.equal(detached.shoulderTargetPct, assembled.shoulderTargetPct);
    assert.equal(assembled.glassBodyAspect, 4.184);
    assert.equal(detached.glassBodyAspect, assembled.glassBodyAspect);
    assert.equal(detached.targetBodyHeightPx, assembled.targetBodyHeightPx);
    assert.notEqual(assembled.fillHeightPct, assembled.shoulderTargetPct);
  });

  it("derives the Cylinder rig glass target from heightWithoutCap only", () => {
    const rig = getFamilyRigForProduct({
      family: "Tall Cylinder",
      bottleCollection: "Cylinder",
      capacityMl: 9,
      heightWithCap: "111 ±2 mm",
      heightWithoutCap: "106 ±2 mm",
      diameter: "18 ±0.5 mm",
      applicator: "Fine Mist Sprayer",
    });
    assert.ok(rig);
    assert.equal(rig.scaleContractVersion, "shoulder-lock-2026-09-07");
    assert.equal(rig.glassBodyKey, "cylinder:9-tall");
    assert.equal(rig.shoulderTargetPct, 62.5);
    assert.equal(rig.glassBodyAspect, 5.326);
    assert.equal(rig.targetBodyHeightPx, Math.round(0.625 * 2288));
    assert.equal(rig.scaleTag, "Cylinder 9 ml tall");
    assert.equal(rig.bareGlassHeightMm, 106);
    assert.equal(rig.glassHeightPct, undefined);
  });

  it("tells the model a slender vial's width instead of asking it to fill the canvas", () => {
    const tall = getFamilyRigForProduct({
      family: "Tall Cylinder",
      bottleCollection: "Cylinder",
      capacityMl: 9,
      heightWithCap: "126 ±2 mm",
      heightWithoutCap: "106 ±2 mm",
      diameter: "18 ±0.5 mm",
      applicator: "Fine Mist Sprayer",
      capState: "detached",
      mode: "fitment-attached-cap-right-sidecar",
    });
    assert.ok(tall);
    const tallBlock = buildImposedRigBlock({ family: "Cylinder", capState: "detached", rig: tall });
    assert.ok(tallBlock);
    // 62.5% of 2288 = 1430px of glass; 1430 / 5.326 = 268px = 12.9% of 2080.
    assert.match(tallBlock, /SLENDER GLASS WIDTH LOCK/);
    assert.match(tallBlock, /5\.326:1 tall-to-wide/);
    assert.match(tallBlock, /268px wide — 12\.9% of the canvas width/);
    assert.match(tallBlock, /Vertical fill only/);
    assert.match(tallBlock, /Never widen, thicken, or enlarge the vial/);
    assert.doesNotMatch(tallBlock, /Ecommerce fill is mandatory/);
    assert.doesNotMatch(tallBlock, /excessive empty margins/);

    // Every other body keeps the prompt it already renders correctly with.
    const hundred = getFamilyRigForProduct({
      family: "Cylinder",
      bottleCollection: "Cylinder",
      capacityMl: 100,
      heightWithCap: "160 ±2 mm",
      heightWithoutCap: "140 ±2 mm",
      diameter: "38 ±0.5 mm",
      applicator: "Fine Mist Sprayer",
      capState: "detached",
      mode: "fitment-attached-cap-right-sidecar",
    });
    assert.ok(hundred);
    assert.equal(hundred.glassBodyAspect, 4.184);
    const hundredBlock = buildImposedRigBlock({ family: "Cylinder", capState: "detached", rig: hundred });
    assert.ok(hundredBlock);
    assert.doesNotMatch(hundredBlock, /SLENDER GLASS WIDTH LOCK/);
    assert.match(hundredBlock, /Ecommerce fill is mandatory/);
  });

  it("keeps a detached 9 ml Classic sidecar on the scale-card bare-glass contract", () => {
    const rig = getFamilyRigForProduct({
      family: "Cylinder",
      capacityMl: 9,
      heightWithCap: "98 ±1 mm",
      heightWithoutCap: "70 ±1 mm",
      diameter: "20 ±0.5 mm",
      capState: "detached",
      mode: "fitment-attached-cap-right-sidecar",
    });
    assert.ok(rig);
    assert.equal(rig.scaleContractVersion, "shoulder-lock-2026-09-07");
    assert.equal(rig.geometryScaleVersion, undefined);
    assert.equal(rig.glassBodyKey, "cylinder:9-standard");
    assert.equal(rig.shoulderTargetPct, 43.5);
    assert.equal(rig.targetBodyHeightPx, Math.round(0.435 * 2288));
    assert.equal(rig.baselinePct, 9);
    assert.equal(rig.scaleTag, "Cylinder 9 ml");
    assert.equal(rig.assembledHeightMm, 98);
    assert.equal(rig.assembledHeightPct, undefined);
    assert.equal(rig.glassHeightPct, undefined);

    const block = buildImposedRigBlock({ family: "Cylinder", capState: "detached", rig });
    assert.ok(block);
    assert.match(block, /SHOULDER LOCK/i);
    assert.match(block, /cylinder:9-standard/);
    assert.match(block, /MUST land at 43\.5%/i);
    assert.match(block, /47\.5% down from the top/i);
    assert.match(block, /heightWithoutCap = 70 mm/i);
    assert.match(block, /heightWithCap = 98 mm/i);
    assert.match(block, /do not scale the bottle to the top of the fitment/i);
    assert.doesNotMatch(block, /SCALE-CARD BARE GLASS/i);
    assert.doesNotMatch(block, /ASSEMBLED HEIGHT \(hard maximum\)/i);
    assert.doesNotMatch(block, /Fit the full assembly within ~64%/i);
    assert.doesNotMatch(block, /6 px per canonical millimeter/i);
    assert.match(block, /Ecommerce fill is mandatory/i);
    assert.match(block, /SHOULDER LOCK horizon/i);
  });

  it("locks same-glass siblings together and keeps 5 ml off the 9 ml horizon", () => {
    const fiveMl = getFamilyRigForProduct({
      family: "Cylinder",
      capacityMl: 5,
      heightWithoutCap: "53 ±1 mm",
      heightWithCap: "72 ±1 mm",
    });
    const nineMl = getFamilyRigForProduct({
      family: "Cylinder",
      capacityMl: 9,
      heightWithoutCap: "70 ±1 mm",
      heightWithCap: "98 ±1 mm",
    });
    const nineMlSameGlass = getFamilyRigForProduct({
      family: "Cylinder",
      capacityMl: 9,
      heightWithoutCap: "74 ±1 mm",
      heightWithCap: "83 ±1 mm",
    });
    assert.ok(fiveMl);
    assert.ok(nineMl);
    assert.ok(nineMlSameGlass);
    assert.equal(fiveMl.shoulderTargetPct, 36.5);
    assert.equal(nineMl.shoulderTargetPct, 43.5);
    assert.equal(nineMlSameGlass.shoulderTargetPct, nineMl.shoulderTargetPct);
    assert.notEqual(fiveMl.shoulderTargetPct, nineMl.shoulderTargetPct);
  });

  it("keeps 50 ml 18-415 and 50 ml roll-on on different locked shoulders", () => {
    const standard50 = getFamilyRigForProduct({
      family: "Cylinder",
      capacityMl: 50,
      heightWithoutCap: "117 ±2 mm",
      heightWithCap: "142 ±2 mm",
      applicator: "Perfume Spray Pump",
      requireScaleCard: true,
    });
    assert.ok(standard50);
    assert.equal(standard50.glassBodyKey, "cylinder:50-standard");
    assert.equal(standard50.shoulderTargetPct, 56);
    assert.equal(standard50.scaleTag, "Cylinder 50 ml 18-415");

    const rollon = getFamilyRigForProduct({
      family: "Cylinder",
      capacityMl: 50,
      heightWithoutCap: "98 ±1 mm",
      heightWithCap: "116 ±2 mm",
      applicator: "Metal Roller Ball",
      websiteSku: "GBCyl50MtlRollBlk",
      requireScaleCard: true,
    });
    assert.ok(rollon);
    assert.equal(rollon.glassBodyKey, "cylinder:50-rollon");
    assert.equal(rollon.shoulderTargetPct, 53);
    assert.equal(rollon.scaleTag, "Cylinder 50 ml 16 mm roll-on");
  });

  it("applies the Cylinder lock without heightWithoutCap and fails closed on unknown bodies", () => {
    const locked = getFamilyRigForProduct({
      family: "Cylinder",
      capacityMl: 9,
      heightWithCap: "98 ±1 mm",
      diameter: "20 ±0.5 mm",
    });
    assert.ok(locked);
    assert.equal(locked.scaleContractVersion, "shoulder-lock-2026-09-07");
    assert.equal(locked.shoulderTargetPct, 43.5);
    assert.equal(locked.bareGlassHeightMm, undefined);

    assert.throws(
      () => getFamilyRigForProduct({
        family: "Cylinder",
        capacityMl: 15,
        heightWithoutCap: "80 mm",
        requireScaleCard: true,
      }),
      /Shoulder lock is required for Cylinder masters/i,
    );

    const boston = {
      family: "Boston Round",
      capacityMl: 100,
      heightWithCap: "150 ±2 mm",
      diameter: "42 ±0.5 mm",
    } as const;
    const bostonLegacy = getFamilyRigForProduct({ ...boston, heightWithoutCap: null });
    assert.ok(bostonLegacy);
    assert.equal(bostonLegacy.targetBodyHeightPx, undefined);
    assert.notEqual(bostonLegacy.scaleContractVersion, "best-bottles-scale-card-v2-2026-09-18");
    assert.throws(
      () => getFamilyRigForProduct({ ...boston, requireScaleCard: true }),
      /bare-glass heightWithoutCap/i,
    );
  });


  it("scales the primary bottle without sidecar width participation", () => {
    const scale = computePrimaryBottleRigScale({
      primaryBoxWidthPx: 300,
      primaryBoxHeightPx: 1500,
      targetBodyHeightPx: 1567,
      maxPrimaryWidthPx: 1000,
    });
    assert.ok(approx(scale, 1567 / 1500));
  });

  it("normalizes Tall Cylinder to the Cylinder rig, enables Circle, and falls back to the universal PDP rig", () => {
    assert.equal(getFamilyRig("Tall Cylinder"), FAMILY_RIG.cylinder);
    assert.equal(hasFamilyRig("Tall Cylinder"), true);
    assert.deepEqual(getFamilyRig("Circle"), FAMILY_RIG.circle);
    assert.equal(hasFamilyRig("Circle"), true);
    assert.deepEqual(getFamilyRig("Boston Round"), FAMILY_RIG.defaultPdp);
    assert.deepEqual(getFamilyRig("Decorative"), FAMILY_RIG.defaultPdp);
    assert.equal(hasFamilyRig("Boston Round"), true);
  });

  it("resolves roller applicator SKUs before generic cylinder dimensions", () => {
    const rig = getFamilyRigForProduct({
      family: "Cylinder",
      bottleCollection: "Cylinder",
      graceSku: "GB-CYL-CLR-28ML-MRL-01",
      websiteSku: "GBMtlRoll28Blk",
      itemName: "Cylinder style 28 ml bottle with metal roller ball plug and black cap.",
      applicator: "Metal Roller Ball",
      capacityMl: 28,
      heightWithCap: "100 ±1 mm",
      heightWithoutCap: "81 ±1 mm",
      diameter: "31 ±0.5 mm",
    });

    assert.ok(rig);
    assert.equal(rig.profileId, "roller-bottle");
    assert.equal(rig.relativeScaleZoneId, "roller-tall");
    // Shoulder lock owns 28 ml Cylinder, not the roller zone band or v2 mm bands.
    assert.equal(rig.scaleContractVersion, "shoulder-lock-2026-09-07");
    assert.equal(rig.glassBodyKey, "cylinder:28-standard");
    assert.equal(rig.shoulderTargetPct, 50.5);
    assert.equal(rig.targetBodyHeightPx, Math.round(0.505 * 2288));
    assert.equal(rig.scaleTag, "Cylinder 28 ml");
    assert.notEqual(rig.fillHeightPct, rig.shoulderTargetPct);
  });

  it("builds a profile-capable imposed rig block with composition authority", () => {
    const block = buildImposedRigBlock({ family: "Cylinder", capState: "assembled" });

    assert.ok(block);
    assert.equal(FAMILY_RIG.cylinder.fillHeightPct, 76);
    assert.match(block, /IMPOSED STUDIO RIG/);
    assert.match(block, /SUPERSEDES/);
    assert.match(block, /8.?10% up from the canvas bottom/);
    assert.match(block, /visible bottom contact pixels/i);
    assert.match(block, /Do not lift the bottle base above this shelf line/i);
    assert.match(block, /FINAL ALIGNMENT QA/);
    assert.match(block, /resolved Cylinder PDP framing target/i);
    assert.match(block, /~76% of the canvas height and ~62% of the width/);
    assert.doesNotMatch(block, /Do NOT vary the on-canvas size by ml capacity/i);
  });

  it("places a detached cap to the right for cap-off composition", () => {
    const block = buildImposedRigBlock({ family: "Cylinder", capState: "detached" });

    assert.ok(block);
    assert.match(block, /DETACHED cap upright in the right sidecar zone/);
    assert.match(block, /primary bottle BODY centered on the canvas vertical centerline/i);
    assert.match(block, /sidecar zone/i);
    assert.match(block, /does not shift the primary bottle/i);
    assert.match(block, /detached pump, applicator, wand, dropper, or closure outside the bottle/i);
    assert.match(block, /must not be duplicated inside the bottle/i);
    assert.match(block, /same horizontal baseline/i);
    assert.match(block, /no sibling variant may float higher/i);
    assert.match(block, /6-10% of canvas width/i);
    assert.match(block, /roller ball plug seated on the bottle neck centerline/i);
    assert.match(block, /over-cap upright to the right/i);
  });

  it("guards cap-off sprayers against duplicate loose caps", () => {
    const block = buildImposedRigBlock({ family: "Cylinder", capState: "detached" });

    assert.ok(block);
    assert.match(block, /bottle top is the exposed sprayer/i);
    assert.match(block, /only detached object is the matching over-cap/i);
    assert.match(block, /Do not render a second loose cap/i);
  });

  it("builds a Circle rig with a wider round-bottle envelope", () => {
    const block = buildImposedRigBlock({ family: "Circle", capState: "detached" });

    assert.ok(block);
    assert.match(block, /IMPOSED STUDIO RIG/);
    assert.match(block, /CIRCLE/);
    assert.match(block, /~78% of the canvas height and ~68% of the width/);
  });

  it("computes a horizontal centering shift for assembled off-center outputs", () => {
    const result = computeRigFrameTransform({
      width: 2080,
      height: 2288,
      rig: FAMILY_RIG.cylinder,
      detectedBaselineYPx: 2082,
      strongBounds: { top: 343, bottom: 2082, left: 700, right: 900 },
      capState: "assembled",
    });

    assert.equal(result.scale, 1);
    assert.equal(result.shiftXPx, 240);
    assert.equal(result.transformedLeftXPx, 940);
    assert.equal(result.transformedRightXPx, 1140);
  });

  it("does not center the full foreground group for detached cap outputs", () => {
    const result = computeRigFrameTransform({
      width: 2080,
      height: 2288,
      rig: FAMILY_RIG.cylinder,
      detectedBaselineYPx: 2082,
      strongBounds: { top: 343, bottom: 2082, left: 700, right: 1200 },
      capState: "detached",
    });

    assert.equal(result.scale, 1);
    assert.equal(result.shiftXPx, 0);
  });

  it("builds a universal PDP rig for families without a custom override", () => {
    const block = buildImposedRigBlock({ family: "Decorative", capState: "assembled" });

    assert.ok(block);
    assert.equal(FAMILY_RIG.defaultPdp.fillHeightPct, 67);
    assert.match(block, /IMPOSED STUDIO RIG/);
    assert.match(block, /UNIVERSAL PDP/);
    assert.match(block, /~67% of the canvas height and ~60% of the width/);
    assert.doesNotMatch(block, /Do NOT vary the on-canvas size by ml capacity/i);
  });
});
