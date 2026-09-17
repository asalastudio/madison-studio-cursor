import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildBestBottlesFamilyRigPromptAdjustment } from "./bestBottlesFamilyRigPrompt";

describe("buildBestBottlesFamilyRigPromptAdjustment", () => {
  it("imposes the Cylinder rig for flattened product-truth references", () => {
    const adjustment = buildBestBottlesFamilyRigPromptAdjustment({
      family: "Cylinder",
      sku: "GB-CYL-CLR-9ML-SPR-GLD",
      websiteSku: "GBCylSwrl9SpryGl",
      applicator: "Fine Mist Sprayer",
      capacityMl: 9,
      heightWithCap: "73 mm",
      heightWithoutCap: "56 mm",
      referenceWorkflow: "single-flattened-product-truth",
      sourceReference: "https://example.com/storage/v1/object/public/generated-images/reference-intake/cylinder/gb-cyl-clr-9ml-spr-gld.png",
    });

    const sourceTruth = adjustment.sourceTruthLines.join("\n");
    const composition = adjustment.canvasCompositionLines.join("\n");
    const fullPromptPart = [adjustment.taskLine, sourceTruth, composition].join("\n");

    assert.equal(adjustment.rigImposed, true);
    assert.match(adjustment.taskLine, /Composition is set by the imposed studio rig/i);
    assert.match(sourceTruth, /source foreground size is not product truth/i);
    assert.match(composition, /IMPOSED STUDIO RIG/);
    assert.match(composition, /SCALE-CARD BARE GLASS/i);
    assert.match(composition, /foot-to-rim glass height = 40\.7%/i);
    assert.match(composition, /tag S60/);
    assert.doesNotMatch(composition, /Fit the full assembly within ~40\.7%/i);
    assert.match(composition, /Assembled framing hint/i);
    assert.doesNotMatch(fullPromptPart, /uploaded reference canvas is the placement lock/i);
    assert.doesNotMatch(fullPromptPart, /canvas placement, centerline, baseline, crop, camera distance, and scale are locked/i);
  });

  it("imposes the Cylinder rig when real body measurements are present", () => {
    const adjustment = buildBestBottlesFamilyRigPromptAdjustment({
      family: "Cylinder",
      sku: "GB-CYL-CLR-454ML-T",
      heightWithoutCap: "195 mm",
      heightWithCap: "199 mm",
    });

    assert.equal(adjustment.rigImposed, true);
    assert.match(adjustment.taskLine, /Composition is set by the imposed studio rig/i);
    assert.match(adjustment.sourceTruthLines.join("\n"), /reference governs product identity/i);
    assert.match(adjustment.sourceTruthLines.join("\n"), /excess transparent padding/i);
    assert.match(adjustment.sourceTruthLines.join("\n"), /source foreground size is not product truth/i);
    assert.doesNotMatch(adjustment.sourceTruthLines.join("\n"), /bounding-box footprint, centerline, baseline, crop, camera distance, and relative scale/i);
    assert.match(adjustment.canvasCompositionLines.join("\n"), /IMPOSED STUDIO RIG/);
    assert.match(adjustment.canvasCompositionLines.join("\n"), /resolved Cylinder Tall PDP framing target|SCALE-CARD BARE GLASS/i);
    assert.match(adjustment.canvasCompositionLines.join("\n"), /foot-to-rim glass height = 80%/i);
    assert.match(adjustment.canvasCompositionLines.join("\n"), /tag S200/);
    assert.doesNotMatch(adjustment.canvasCompositionLines.join("\n"), /Fit the full assembly within ~80%/i);
    assert.doesNotMatch(adjustment.canvasCompositionLines.join("\n"), /Do NOT vary the on-canvas size by ml capacity/i);
    assert.doesNotMatch(adjustment.canvasCompositionLines.join("\n"), /Fixed-family QA target/i);
    assert.doesNotMatch(adjustment.canvasCompositionLines.join("\n"), /uploaded reference canvas is the placement lock/i);
  });

  it("uses the universal PDP rig for families without a custom override", () => {
    const adjustment = buildBestBottlesFamilyRigPromptAdjustment({
      family: "Boston Round",
      sku: "GB-BOS-CLR-30ML-T",
      heightWithoutCap: "80 mm",
      heightWithCap: "90 mm",
    });

    assert.equal(adjustment.rigImposed, true);
    assert.match(adjustment.taskLine, /Composition is set by the imposed studio rig/i);
    assert.match(adjustment.sourceTruthLines.join("\n"), /source foreground size is not product truth/i);
    assert.match(adjustment.canvasCompositionLines.join("\n"), /UNIVERSAL PDP/);
    assert.match(adjustment.canvasCompositionLines.join("\n"), /SCALE-CARD BARE GLASS/i);
    assert.doesNotMatch(adjustment.canvasCompositionLines.join("\n"), /Do NOT vary the on-canvas size by ml capacity/i);
    assert.doesNotMatch(adjustment.canvasCompositionLines.join("\n"), /uploaded reference canvas is the placement lock/i);
    assert.doesNotMatch(adjustment.canvasCompositionLines.join("\n"), /Fixed-family QA target/i);
  });

  it("forbids reflective floor plates and inner background rectangles on PDP masters", () => {
    const adjustment = buildBestBottlesFamilyRigPromptAdjustment({
      family: "Cylinder",
      sku: "GB-SPR-CLR-3ML-WHT",
      websiteSku: "GBSpry3mlClWht",
      applicator: "Fine Mist Sprayer",
    });

    const composition = adjustment.canvasCompositionLines.join("\n");

    assert.match(composition, /no mirror reflection/i);
    assert.match(composition, /no rectangular studio plate/i);
    assert.match(composition, /flat Bone/i);
  });

  it("still imposes the rig when a rig family lacks body height", () => {
    const adjustment = buildBestBottlesFamilyRigPromptAdjustment({
      family: "Cylinder",
      sku: "GB-CYL-UNKNOWN",
      heightWithoutCap: null,
      heightWithCap: "199 mm",
    });

    assert.equal(adjustment.rigImposed, true);
    assert.match(adjustment.canvasCompositionLines.join("\n"), /IMPOSED STUDIO RIG/);
    assert.doesNotMatch(adjustment.canvasCompositionLines.join("\n"), /SCALE-CARD BARE GLASS/i);
    assert.doesNotMatch(adjustment.canvasCompositionLines.join("\n"), /uploaded reference canvas is the placement lock/i);
  });

  it("imposes the Circle cap-off rig for roll-on detached cap compositions", () => {
    const adjustment = buildBestBottlesFamilyRigPromptAdjustment({
      family: "Circle",
      sku: "GB-CIR-CLR-15ML-ROL",
      mode: "cap-off",
    });

    assert.equal(adjustment.rigImposed, true);
    assert.match(adjustment.canvasCompositionLines.join("\n"), /IMPOSED STUDIO RIG/);
    assert.match(adjustment.canvasCompositionLines.join("\n"), /CIRCLE/);
    assert.match(adjustment.canvasCompositionLines.join("\n"), /primary bottle BODY centered/i);
    assert.match(adjustment.canvasCompositionLines.join("\n"), /right-sidecar component/i);
    assert.match(adjustment.canvasCompositionLines.join("\n"), /same horizontal baseline/i);
  });

  it("passes detached state into the global Cylinder PDP scale contract", () => {
    const adjustment = buildBestBottlesFamilyRigPromptAdjustment({
      family: "Cylinder",
      sku: "GB-CYL-CLR-9ML-T-21",
      websiteSku: "GBCyl9SpryBlk",
      applicator: "Fine Mist Sprayer",
      capacityMl: 9,
      heightWithCap: "98 ±1 mm",
      heightWithoutCap: "70 ±1 mm",
      diameter: "20 ±0.5 mm",
      capState: "detached",
      mode: "fitment-attached-cap-right-sidecar",
    });

    const composition = adjustment.canvasCompositionLines.join("\n");
    assert.equal(adjustment.rigImposed, true);
    assert.match(composition, /SCALE-CARD BARE GLASS/i);
    assert.match(composition, /foot-to-rim glass height = 47\.8%/i);
    assert.match(composition, /tag S70/);
    assert.doesNotMatch(composition, /Fit the full assembly within ~47\.8%/i);
    assert.doesNotMatch(composition, /6 px per canonical millimeter/i);
    assert.match(composition, /8-10% up from the canvas bottom/i);
    assert.doesNotMatch(composition, /~25\.7% of the canvas height/i);
  });

  it("keeps roll-ons assembled unless cap-off is explicit", () => {
    const adjustment = buildBestBottlesFamilyRigPromptAdjustment({
      family: "Cylinder",
      sku: "GB-CYL-BLU-5ML-MRL-MBLK",
      websiteSku: "GBCylBlu5MrlMBlk",
      applicator: "Metal Roller Ball",
    });

    assert.equal(adjustment.rigImposed, true);
    const composition = adjustment.canvasCompositionLines.join("\n");
    const sourceTruth = adjustment.sourceTruthLines.join("\n");
    assert.match(composition, /ROLLER BOTTLE/);
    assert.match(composition, /~68% of the canvas height/i);
    assert.match(composition, /approved 65-70% fill-height range/i);
    assert.match(composition, /assembled bottle centered/i);
    assert.doesNotMatch(composition, /ONE two-object assembly/);
    assert.match(composition, /no detached cap/i);
    assert.match(sourceTruth, /Applicator type is not cap state/i);
  });

  it("infers detached-cap rig for Cylinder sprayers from exploded preset/source references", () => {
    const adjustment = buildBestBottlesFamilyRigPromptAdjustment({
      family: "Cylinder",
      sku: "GB-CYL-AMB-9ML-SPR-MSLV",
      websiteSku: "GBCylAmb9SpryMtSlv",
      applicator: "Perfume Spray Pump",
      presetId: "grid-card-exploded-2000x2200",
      sourceReference: "/best-bottles/cylinder/amber-9ml/cap-off/GB-CYL-AMB-9ML-SPR-MSLV.png",
    });

    assert.equal(adjustment.rigImposed, true);
    const composition = adjustment.canvasCompositionLines.join("\n");
    assert.match(composition, /CYLINDER/);
    assert.match(composition, /primary bottle BODY centered/i);
    assert.match(composition, /DETACHED cap upright in the right sidecar zone/);
    assert.match(composition, /only detached object is the matching over-cap/i);
    assert.match(composition, /Do not render a second loose cap/i);
    assert.match(composition, /same horizontal baseline/i);
  });

  it("keeps sprayers assembled without a cap-off/exploded signal", () => {
    const adjustment = buildBestBottlesFamilyRigPromptAdjustment({
      family: "Cylinder",
      sku: "GB-CYL-AMB-9ML-SPR-MSLV",
      websiteSku: "GBCylAmb9SpryMtSlv",
      applicator: "Perfume Spray Pump",
    });

    assert.equal(adjustment.rigImposed, true);
    const composition = adjustment.canvasCompositionLines.join("\n");
    assert.match(composition, /assembled bottle centered/i);
    assert.doesNotMatch(composition, /ONE two-object assembly/);
    assert.match(composition, /no detached cap/i);
    assert.match(composition, /no extra cap/i);
  });
});
