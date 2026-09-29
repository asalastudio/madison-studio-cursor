import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BEST_BOTTLES_PROMPT_VERSION,
  buildBestBottlesGenerationIdentity,
  getBestBottlesGenerationIdentityIssue,
} from "./bestBottlesGenerationIdentity";

describe("buildBestBottlesGenerationIdentity", () => {
  it("records the deterministic-background prompt synchronization as v6", () => {
    assert.equal(BEST_BOTTLES_PROMPT_VERSION, "best-bottles-reference-locked-v6.0");
  });

  it("assigns canonical V6.1 model-owned shadow policy to Cylinder identities", () => {
    const identity = buildBestBottlesGenerationIdentity({
      graceSku: "GB-SPR-CLR-3ML-BLK",
      family: "Cylinder",
      capacityMl: 3,
      color: "Clear",
    });

    assert.equal(identity.promptVersion, "best-bottles-reference-locked-v6.1");
    assert.equal(identity.shadowOwner, "model");
    assert.equal(identity.shadowContract, "contact-back-right-v1");
    assert.equal(identity.scaleContractVersion, "shoulder-lock-2026-09-07");
    assert.equal(identity.glassBodyKey, "cylinder:3.3-standard");
    assert.equal(identity.shoulderTargetPct, 26.5);
    assert.equal(identity.resolvedBodyTargetPx, Math.round(0.265 * 2288));
  });

  it("assigns canonical V6.1 and global scale lineage to every bottle family", () => {
    const identity = buildBestBottlesGenerationIdentity({
      graceSku: "GB-BOS-CLR-100ML-S",
      websiteSku: "GBBoston100ShortCap",
      productGroupId: "group-boston-100",
      family: "Boston Round",
      bottleCollection: "Boston Round",
      capacityMl: 100,
      color: "Clear",
      heightWithCap: "150 ±2 mm",
      heightWithoutCap: "130 ±2 mm",
      diameter: "42 ±0.5 mm",
    });

    assert.equal(identity.promptVersion, "best-bottles-reference-locked-v6.1");
    assert.equal(identity.shadowOwner, "model");
    assert.equal(identity.scaleContractVersion, "best-bottles-catalog-scale-v1");
    assert.equal(identity.resolvedAssembledTargetPct, 79);
    assert.equal(identity.resolvedBodyTargetPx, 1567);
    assert.equal(identity.calibrationRegistryKey, "boston-round:100:group-boston-100");
  });

  it("blocks generic Diva tassel SKUs when color evidence conflicts", () => {
    const identity = buildBestBottlesGenerationIdentity({
      graceSku: "GB-DVA-CLR-46ML-T-20",
      websiteSku: "GBDivaFrst46AnSpTslBlk",
      productId: "example",
      productGroupId: "diva-46ml-frosted-18-415-tassel",
      family: "Diva",
      capacityMl: 46,
      color: "Clear",
      applicator: "Vintage Bulb Sprayer with Tassel",
      trimColor: "Shiny Silver",
      itemName: "Diva Frosted 46ml Antique Spray Tassel Black",
    });

    assert.equal(identity.identityStatus, "blocked");
    assert.equal(identity.tasselColor, "Black");
    assert.equal(identity.collarFinish, "Shiny Silver");
    assert.match(getBestBottlesGenerationIdentityIssue(identity) ?? "", /Frosted/);
  });

  it("allows corrected tassel identities and emits accessory truth", () => {
    const identity = buildBestBottlesGenerationIdentity({
      graceSku: "GB-DVA-FRS-46ML-AST-BLK",
      websiteSku: "GBDivaFrst46AnSpTslBlk",
      family: "Diva",
      capacityMl: 46,
      color: "Frosted",
      applicator: "Vintage Bulb Sprayer with Tassel",
      trimColor: "Shiny Silver",
      itemName: "Diva Frosted 46ml Antique Spray Tassel Black",
    });

    assert.equal(identity.identityStatus, "ready");
    assert.equal(identity.tasselColor, "Black");
    assert.equal(identity.bulbColor, "Black");
    assert.equal(identity.hoseColor, "Black");
    assert.equal(identity.collarFinish, "Shiny Silver");
    assert.equal(identity.canvas, "2080x2288");
    assert.match(identity.rigVersion, /2080x2288/);
  });

  it("infers reducer leather finish when encoded in product truth", () => {
    const identity = buildBestBottlesGenerationIdentity({
      graceSku: "GB-CYL-CLR-50ML-RDC-BKLT",
      websiteSku: "GBCyl50RdcrBlkLthr",
      family: "Cylinder",
      capacityMl: 50,
      color: "Clear",
      applicator: "Reducer",
      capColor: "Black Leather",
      itemName: "Cylinder 50ml Reducer Black Leather",
    });

    assert.equal(identity.identityStatus, "ready");
    assert.equal(identity.reducerFinish, "Black Leather");
  });

  it("blocks generic roll-on SKUs when cap color cannot be resolved", () => {
    const identity = buildBestBottlesGenerationIdentity({
      graceSku: "GB-CYL-CLR-9ML-T-11",
      family: "Cylinder",
      capacityMl: 9,
      color: "Clear",
      applicator: "Plastic Roller Ball",
      capColor: "Clear",
      itemName: "9 ml Clear Cylinder Roll On",
    });

    assert.equal(identity.identityStatus, "blocked");
    assert.match(getBestBottlesGenerationIdentityIssue(identity) ?? "", /cap\/closure color/i);
  });

  it("resolves generic roll-on cap color from website SKU evidence", () => {
    const identity = buildBestBottlesGenerationIdentity({
      graceSku: "GB-CYL-CLR-9ML-T-11",
      websiteSku: "GBCylSwrl9RollWht",
      family: "Cylinder",
      capacityMl: 9,
      color: "Clear",
      applicator: "Plastic Roller Ball",
      itemName: "9 ml Clear Cylinder Roll On White Cap",
    });

    assert.equal(identity.identityStatus, "ready");
    assert.equal(identity.capColor, "White");
  });

  it("uses product description cap evidence over leaked Clear capColor on generic rows", () => {
    const identity = buildBestBottlesGenerationIdentity({
      graceSku: "GB-CYL-CLR-9ML-T-11",
      family: "Cylinder",
      capacityMl: 9,
      color: "Clear",
      applicator: "Plastic Roller Ball",
      capColor: "Clear",
      itemDescription: "Cylinder design 9ml clear glass bottle with plastic roller ball plug and black shiny cap with dots.",
    });

    assert.equal(identity.identityStatus, "ready");
    assert.equal(identity.capColor, "Shiny Black");
  });

  it("does not treat matte silver spray website SKU evidence as a tassel", () => {
    const identity = buildBestBottlesGenerationIdentity({
      graceSku: "GB-CYL-CLR-9ML-SPR-MSLV-01",
      websiteSku: "GBCylSwrl9SpryMattSl",
      family: "Cylinder",
      capacityMl: 9,
      color: "Swirl",
      applicator: "Fine Mist Sprayer",
    });

    assert.equal(identity.identityStatus, "ready");
    assert.equal(identity.capColor, "Matte Silver");
    assert.equal(identity.tasselColor, null);
  });

  it("resolves generic turquoise spray identity from website SKU evidence", () => {
    const identity = buildBestBottlesGenerationIdentity({
      graceSku: "GB-CYL-CLR-9ML-T-27",
      websiteSku: "GBCylSwrl9SpryTur",
      family: "Cylinder",
      capacityMl: 9,
      color: "Swirl",
      applicator: "Fine Mist Sprayer",
    });

    assert.equal(identity.identityStatus, "ready");
    assert.equal(identity.capColor, "Turquoise");
  });

  it("resolves generic red spray identity from website SKU and description evidence", () => {
    const identity = buildBestBottlesGenerationIdentity({
      graceSku: "GB-CYL-CLR-9ML-T-24",
      websiteSku: "GBCyl9SpryRd",
      family: "Cylinder",
      capacityMl: 9,
      color: "Clear",
      applicator: "Fine Mist Sprayer",
      capColor: "Clear",
      itemDescription:
        "Cylinder design 9ml clear glass bottle with fine mist sprayer with red trim and plastic overcap.",
    });

    assert.equal(identity.identityStatus, "ready");
    assert.equal(identity.capColor, "Red");
  });
});
