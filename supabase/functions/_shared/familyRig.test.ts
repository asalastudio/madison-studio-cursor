import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FAMILY_RIG as NODE_FAMILY_RIG,
  computeRigFitScale as computeNodeRigFitScale,
  getFamilyRigForProduct as getNodeFamilyRigForProduct,
} from "../../../src/lib/product-image/familyRig";
import {
  BEST_BOTTLES_SCALE_CARD_CONTROL_POINTS as NODE_CONTROL_POINTS,
  BEST_BOTTLES_SCALE_CARD_VERSION as NODE_SCALE_CARD_VERSION,
  resolveBestBottlesGlassScale as resolveNodeGlassScale,
} from "../../../src/config/bestBottlesCatalogScale";
import {
  FAMILY_RIG as DENO_FAMILY_RIG,
  BEST_BOTTLES_SCALE_CARD_CONTROL_POINTS as DENO_CONTROL_POINTS,
  BEST_BOTTLES_SCALE_CARD_VERSION as DENO_SCALE_CARD_VERSION,
  buildImposedRigBlock,
  computeRigFitScale,
  getFamilyRig,
  getFamilyRigForProduct,
  hasFamilyRig,
  resolveBestBottlesGlassScale as resolveDenoGlassScale,
} from "./familyRig";

describe("Deno familyRig twin", () => {
  it("keeps family constants numerically identical to the Node rig", () => {
    assert.deepEqual(DENO_FAMILY_RIG.cylinder, NODE_FAMILY_RIG.cylinder);
    assert.deepEqual(DENO_FAMILY_RIG.circle, NODE_FAMILY_RIG.circle);
  });

  it("pins the scale-card version and every control point identically across runtimes", () => {
    assert.equal(DENO_SCALE_CARD_VERSION, NODE_SCALE_CARD_VERSION);
    assert.equal(DENO_SCALE_CARD_VERSION, "best-bottles-scale-card-v1-2026-09-16");
    assert.deepEqual(DENO_CONTROL_POINTS, NODE_CONTROL_POINTS);
    for (const point of NODE_CONTROL_POINTS) {
      assert.deepEqual(
        resolveDenoGlassScale(point.mm),
        resolveNodeGlassScale(point.mm),
      );
    }
  });

  it("computes the same Cylinder fit scale as the Node rig", () => {
    const denoScale = computeRigFitScale(DENO_FAMILY_RIG.cylinder, 200, 1000, 2080, 2288);
    const nodeScale = computeNodeRigFitScale(NODE_FAMILY_RIG.cylinder, 200, 1000, 2080, 2288);

    assert.deepEqual(denoScale, nodeScale);
  });

  it("normalizes Tall Cylinder, enables Circle, and falls back to the universal PDP rig", () => {
    assert.equal(getFamilyRig("Tall Cylinder"), DENO_FAMILY_RIG.cylinder);
    assert.equal(hasFamilyRig("Cylinder"), true);
    assert.deepEqual(getFamilyRig("Circle"), DENO_FAMILY_RIG.circle);
    assert.equal(hasFamilyRig("Circle"), true);
    assert.deepEqual(getFamilyRig("Boston Round"), DENO_FAMILY_RIG.defaultPdp);
    assert.equal(hasFamilyRig("Boston Round"), true);
  });

  it("sizes 13-415 slim 9ml Cylinder sprayers from bare-glass height, not capacity", () => {
    const input = {
      family: "Cylinder",
      bottleCollection: "Cylinder",
      capacityMl: 9,
      heightWithCap: "118 ±2 mm",
      heightWithoutCap: "106 ±2 mm",
      diameter: "18 ±0.5 mm",
      applicator: "Fine Mist Sprayer",
      name: "Tall cylinder design 9ml, 1/3oz Clear glass bottle with shiny black spray.",
      websiteSku: "GBTallCyl9SpryBlkSh",
      sku: "GB-CYL-CLR-9ML-SPR-SBLK",
    };
    const rig = getFamilyRigForProduct(input);
    const nodeRig = getNodeFamilyRigForProduct(input);

    assert.ok(rig);
    assert.ok(nodeRig);
    assert.equal(rig.profileId, "cylinder-standard");
    assert.equal(rig.relativeScaleZoneId, "standard-cylinder");
    assert.equal(rig.scaleContractVersion, "best-bottles-scale-card-v1-2026-09-16");
    assert.equal(rig.fillHeightPct, 65.5);
    assert.equal(rig.targetBodyHeightPx, Math.round(0.655 * 2288));
    assert.equal(rig.fillHeightPct, nodeRig.fillHeightPct);
    assert.equal(rig.targetBodyHeightPx, nodeRig.targetBodyHeightPx);
  });

  it("keeps 5ml short Cylinder sprayers below regular 9ml roll-ons and slim 9ml sprayers", () => {
    const fiveMl = getFamilyRigForProduct({
      family: "Cylinder",
      bottleCollection: "Cylinder",
      capacityMl: 5,
      heightWithCap: "72 ±1 mm",
      heightWithoutCap: "53 ±1 mm",
      diameter: "17 ±0.5 mm",
      applicator: "Fine Mist Sprayer",
      name: "Cylinder design 5ml clear glass bottle with shiny black spray.",
      websiteSku: "GBCyl5SpryBlkSh",
      sku: "GB-CYL-CLR-5ML-SPR-SBLK",
    });
    const regular9Ml = getFamilyRigForProduct({
      family: "Cylinder",
      bottleCollection: "Cylinder",
      capacityMl: 9,
      heightWithCap: "83 ±1 mm",
      heightWithoutCap: "70 ±1 mm",
      diameter: "20 ±0.5 mm",
      applicator: "Plastic Roller Ball",
      name: "Cylinder design 9ml clear glass bottle with plastic roller ball plug and black dot cap.",
      websiteSku: "GBCyl9RollBlkDot",
      sku: "GB-CYL-CLR-9ML-T-11",
    });
    const slim9Ml = getFamilyRigForProduct({
      family: "Cylinder",
      bottleCollection: "Cylinder",
      capacityMl: 9,
      heightWithCap: "126 ±2 mm",
      heightWithoutCap: "106 ±2 mm",
      diameter: "18 ±0.5 mm",
      applicator: "Fine Mist Sprayer",
      name: "Tall cylinder design 9ml clear glass bottle with shiny black spray.",
      websiteSku: "GBTallCyl9SpryBlkSh",
      sku: "GB-CYL-CLR-9ML-SPR-SBLK",
    });

    assert.ok(fiveMl);
    assert.ok(regular9Ml);
    assert.ok(slim9Ml);
    assert.equal(fiveMl.fillHeightPct, 39.2);
    assert.equal(regular9Ml.fillHeightPct, 47.8);
    assert.equal(slim9Ml.fillHeightPct, 65.5);
    assert.ok(fiveMl.fillHeightPct < regular9Ml.fillHeightPct);
    assert.ok(regular9Ml.fillHeightPct < slim9Ml.fillHeightPct);
  });

  it("uses the scale-card bare-glass curve for detached Cylinder sidecars", () => {
    const input = {
      family: "Cylinder",
      bottleCollection: "Cylinder",
      capacityMl: 9,
      heightWithCap: "98 ±1 mm",
      heightWithoutCap: "70 ±1 mm",
      diameter: "20 ±0.5 mm",
      applicator: "Fine Mist Sprayer",
      capState: "detached",
      mode: "fitment-attached-cap-right-sidecar",
      websiteSku: "GBCyl9SpryBlk",
      sku: "GB-CYL-CLR-9ML-T-21",
    };
    const rig = getFamilyRigForProduct(input);
    const nodeRig = getNodeFamilyRigForProduct(input);

    assert.ok(rig);
    assert.ok(nodeRig);
    assert.equal(rig.geometryScaleVersion, undefined);
    assert.equal(rig.scaleContractVersion, "best-bottles-scale-card-v1-2026-09-16");
    assert.equal(rig.fillHeightPct, 47.8);
    assert.equal(rig.targetBodyHeightPx, Math.round(0.478 * 2288));
    assert.equal(rig.baselinePct, 9);
    assert.equal(rig.fillHeightPct, nodeRig.fillHeightPct);
    assert.equal(rig.targetBodyHeightPx, nodeRig.targetBodyHeightPx);

    const block = buildImposedRigBlock({ family: "Cylinder", capState: "detached", rig });
    assert.ok(block);
    assert.match(block, /~47\.8% of the canvas height/i);
    assert.doesNotMatch(block, /6 px per canonical millimeter/i);
    assert.match(block, /Do not leave the product tiny with excessive empty margins/i);
  });

  it("builds the same imposed rig language shape for edge prompts", () => {
    const block = buildImposedRigBlock({
      family: "Cylinder",
      capState: "assembled",
    });

    assert.ok(block);
    assert.equal(DENO_FAMILY_RIG.cylinder.fillHeightPct, 76);
    assert.match(block, /IMPOSED STUDIO RIG/);
    assert.match(block, /visible bottom contact pixels/i);
    assert.match(block, /Do not lift the bottle base above this shelf line/i);
    assert.match(block, /resolved Cylinder PDP framing target/i);
    assert.match(block, /~76% of the canvas height and ~62% of the width/);
    assert.match(block, /FINAL ALIGNMENT QA/);
    assert.doesNotMatch(block, /Do NOT vary the on-canvas size by ml capacity/i);
  });

  it("builds detached Circle cap-off assembly guidance for edge prompts", () => {
    const block = buildImposedRigBlock({
      family: "Circle",
      capState: "detached",
    });

    assert.ok(block);
    assert.match(block, /CIRCLE/);
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

  it("guards edge cap-off sprayers against duplicate loose caps", () => {
    const block = buildImposedRigBlock({
      family: "Cylinder",
      capState: "detached",
    });

    assert.ok(block);
    assert.match(block, /bottle top is the exposed sprayer/i);
    assert.match(block, /only detached object is the matching over-cap/i);
    assert.match(block, /Do not render a second loose cap/i);
  });

  it("builds universal PDP rig language for non-custom families on the edge", () => {
    const block = buildImposedRigBlock({
      family: "Decorative",
      capState: "assembled",
    });

    assert.ok(block);
    assert.equal(DENO_FAMILY_RIG.defaultPdp.fillHeightPct, 67);
    assert.match(block, /UNIVERSAL PDP/);
    assert.match(block, /~67% of the canvas height and ~60% of the width/);
    assert.doesNotMatch(block, /Do NOT vary the on-canvas size by ml capacity/i);
  });
});
