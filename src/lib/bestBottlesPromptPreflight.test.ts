import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildBestBottlesPromptPreflight,
  buildBestBottlesPromptSkuFromProduct,
  inferBestBottlesPromptFamily,
} from "./bestBottlesPromptPreflight";
import { buildPromptForSku } from "./bestBottlesPromptCompiler";
import { resolveBestBottlesShadowPolicy } from "./bestBottlesShadowPolicy";
import { BEST_BOTTLES_CATALOG_CANON_PROMPT_FLAG } from "./bestBottlesCatalogCanonPrompt";
import { loadPromptSystem } from "../../scripts/generate-prompts";

const promptSystem = loadPromptSystem(process.cwd());

const baseProduct = {
  graceSku: "GB-CYL-CLR-9ML-SPR-GLD",
  websiteSku: "CYL9SWIRLGLD",
  itemName: "9 ml Clear Swirl Cylinder Fine Mist Sprayer with Gold Collar",
  itemDescription: "Clear glass swirl cylinder bottle with fine mist sprayer and loose overcap.",
  bottleCollection: "Cylinder",
  family: "Cylinder",
  category: "Plastic Bottles",
  color: "Clear",
  capacityMl: 9,
  applicator: "Fine Mist Sprayer",
  capColor: "White",
  trimColor: "Gold",
  heightWithoutCap: "78 mm",
  heightWithCap: "96 mm",
  diameter: "16 mm",
  imageUrl: "https://example.com/legacy.gif",
};

function buildThreeMlPreflight(
  graceSku: "GB-SPR-CLR-3ML-BLK" | "GB-SPR-CLR-3ML-WHT",
  websiteSku: "GBSpry3mlClBlk" | "GBSpry3mlClWht",
  capColor: "Black" | "White",
) {
  return buildBestBottlesPromptPreflight({
    product: {
      graceSku,
      websiteSku,
      family: "Cylinder",
      bottleCollection: "Cylinder",
      color: "Clear",
      capacityMl: 3,
      applicator: "Fine Mist Sprayer",
      capColor,
      heightWithCap: "54 ±1 mm",
      heightWithoutCap: "37 ±0.5 mm",
      diameter: "14 ±0.5 mm",
    },
    referenceImagePath: `approved/${websiteSku}.png`,
    bodyMaterial: "clear glass",
    canvas: { widthPx: 2080, heightPx: 2288 },
    system: promptSystem,
  });
}

describe("Best Bottles prompt preflight", () => {
  it("files a bottle under its own family, not under the closure it ships with", () => {
    // The family haystack includes the item name and applicator. A Slim glass
    // bottle sold with a lotion pump used to be filed as the closure family
    // "lotion_pump", which is a NON-bottle shadow context — so its policy
    // contradicted its real family and generation threw. 233 bottle SKUs across
    // 11 families were blocked; Cylinder escaped only because it matches first.
    const slimWithPump = {
      graceSku: "LB-SLM-CLR-50ML-LPM-MGLD",
      websiteSku: "LBSlm50LtnMtGl",
      family: "Slim",
      bottleCollection: "Slim",
      category: "Glass Bottle",
      itemName: "Slim design 50 ml, 1.7oz clear glass bottle with matte gold lotion pump.",
      applicator: "Lotion Pump",
    };
    const elegantWithDropper = {
      graceSku: "GB-ELG-CLR-60ML-DRP-GLD",
      family: "Elegant",
      bottleCollection: "Elegant",
      category: "Glass Bottle",
      itemName: "Elegant design 60 ml clear glass bottle with gold dropper.",
      applicator: "Dropper",
    };
    for (const bottle of [slimWithPump, elegantWithDropper]) {
      const inferred = inferBestBottlesPromptFamily(bottle);
      assert.notEqual(inferred, "lotion_pump");
      assert.notEqual(inferred, "dropper");
      assert.deepEqual(
        resolveBestBottlesShadowPolicy({ graceSku: bottle.graceSku, family: inferred }),
        resolveBestBottlesShadowPolicy({ graceSku: bottle.graceSku, family: bottle.family }),
        `${bottle.graceSku} must resolve the same shadow policy from its inferred and catalog family`,
      );
    }

    // A product whose own catalog family IS the closure is still a closure.
    assert.equal(
      inferBestBottlesPromptFamily({
        graceSku: "CMP-LPM-MGLD-18-415",
        family: "Lotion Pump",
        category: "Closure",
        itemName: "Matte gold lotion pump, 18-415.",
      }),
      "lotion_pump",
    );
    // With no catalog family at all, the text is the only signal left.
    assert.equal(inferBestBottlesPromptFamily({ itemName: "Replacement glass dropper with pipette" }), "dropper");
  });

  it("blocks explicit cap-off generation without confirmed PSD evidence", () => {
    const blocked = buildBestBottlesPromptPreflight({
      product: { ...baseProduct, capState: "detached" },
      referenceImagePath: "/references/GB-CYL-CLR-9ML-SPR-GLD.png",
      bodyMaterial: "swirl glass",
      canvas: { widthPx: 2080, heightPx: 2288 },
      system: promptSystem,
    });
    assert.equal(blocked.status, "error");
    assert.match(blocked.issue ?? "", /cap-off PSD/i);

    const confirmed = buildBestBottlesPromptPreflight({
      product: { ...baseProduct, capState: "detached", capOffReferenceId: "approved-cap-off-psd" },
      referenceImagePath: "/references/GB-CYL-CLR-9ML-SPR-GLD.png",
      bodyMaterial: "swirl glass",
      canvas: { widthPx: 2080, heightPx: 2288 },
      system: promptSystem,
    });
    assert.notEqual(confirmed.status, "error");
    assert.ok(confirmed.record?.qa_checklist.includes("cap-off-psd:approved-cap-off-psd"));
  });

  it("requires consistent structured sidecar topology authority", () => {
    const blocked = buildBestBottlesPromptPreflight({
      product: {
        ...baseProduct,
        capState: "assembled",
        componentTopology: "fitment-attached-cap-right-sidecar",
        capOffReferenceId: "approved-sidecar-reference",
        topologyReferenceId: "approved-sidecar-reference",
      },
      referenceImagePath: "/references/GB-CYL-CLR-9ML-SPR-GLD.png",
      bodyMaterial: "swirl glass",
      canvas: { widthPx: 2080, heightPx: 2288 },
      system: promptSystem,
    });
    assert.equal(blocked.status, "error");
    assert.match(blocked.issue ?? "", /requires detached cap state/i);

    const confirmed = buildBestBottlesPromptPreflight({
      product: {
        ...baseProduct,
        itemDescription: "Clear glass cylinder bottle with fine mist sprayer.",
        capState: "detached",
        componentTopology: "fitment-attached-cap-right-sidecar",
        capOffReferenceId: "approved-sidecar-reference",
        topologyReferenceId: "approved-sidecar-reference",
      },
      referenceImagePath: "/references/GB-CYL-CLR-9ML-SPR-GLD.png",
      bodyMaterial: "swirl glass",
      canvas: { widthPx: 2080, heightPx: 2288 },
      system: promptSystem,
    });
    assert.notEqual(confirmed.status, "error");
    assert.ok(confirmed.record?.qa_checklist.includes(
      "component-topology:fitment-attached-cap-right-sidecar",
    ));
    assert.ok(confirmed.record?.qa_checklist.includes("shadow-topology:detached-sidecar"));
    assert.equal(
      confirmed.record?.qa_checklist.some((tag) => tag.startsWith("geometry-scale:")),
      false,
    );
    assert.ok(confirmed.record?.qa_checklist.includes(
      "scale-assembled-target:69",
    ));
    assert.deepEqual(
      confirmed.record?.qa_checklist.filter((tag) => tag.startsWith("shadow-topology:")),
      ["shadow-topology:detached-sidecar"],
    );
    assert.deepEqual(
      confirmed.record?.qa_checklist.filter((tag) => tag.startsWith("shadow-contact:")),
      ["shadow-contact:bottle", "shadow-contact:sidecar"],
    );
  });

  it("compiles detached-sidecar contact instructions into the shipped prompt", () => {
    const preflight = buildBestBottlesPromptPreflight({
      product: baseProduct,
      referenceImagePath: "/references/GB-CYL-CLR-9ML-SPR-GLD.png",
      bodyMaterial: "swirl glass",
      canvas: { widthPx: 2080, heightPx: 2288 },
      system: promptSystem,
    });

    assert.match(preflight.record?.final_prompt ?? "", /bottle and the detached cap/i);
  });

  it("compiles canonical model-owned V6.1 policy for Cylinder siblings", () => {
    const smoke = buildThreeMlPreflight("GB-SPR-CLR-3ML-BLK", "GBSpry3mlClBlk", "Black");
    const prompt = smoke.record?.final_prompt ?? "";
    assert.equal(smoke.record?.prompt_version, "best-bottles-reference-locked-v6.1");
    assert.equal(smoke.record?.shadow_owner, "model");
    assert.equal(prompt.match(/GROUNDING SHADOW — MODEL OWNED:/g)?.length, 1);
    assert.doesNotMatch(prompt, /deterministic post-processing responsibilities/i);
    assert.doesNotMatch(prompt, /Madison applies both deterministically after generation/i);
    // Jordan 2026-07-19: plain-language shadow direction, no numeric engineering.
    assert.match(prompt, /very subtle, light, softly feathered grounded shadow/);
    assert.doesNotMatch(prompt, /% opacity|extension ratio/i);
    const directCompilerRecord = buildPromptForSku(smoke.sku!, promptSystem);
    assert.equal(directCompilerRecord.prompt_version, "best-bottles-reference-locked-v6.1");
    assert.equal(directCompilerRecord.shadow_owner, "model");
    assert.equal(directCompilerRecord.final_prompt.match(/GROUNDING SHADOW — MODEL OWNED:/g)?.length, 1);
    assert.match(directCompilerRecord.final_prompt, /#F5F3EF/);
    assert.doesNotMatch(directCompilerRecord.final_prompt, /Madison applies both deterministically after generation/i);
    assert.ok(smoke.record?.qa_checklist.includes("prompt-version:best-bottles-reference-locked-v6.1"));
    assert.ok(smoke.record?.qa_checklist.includes("shadow-owner:model"));
    assert.ok(smoke.record?.qa_checklist.includes("shadow-contract:contact-back-right-v1"));
    assert.ok(smoke.record?.qa_checklist.includes("shadow-rollout:all-bottle-families"));
    assert.ok(smoke.record?.qa_checklist.includes("scale-contract:best-bottles-catalog-scale-v1"));
    assert.ok(smoke.record?.qa_checklist.includes("scale-global-target:56"));
    assert.ok(smoke.record?.qa_checklist.includes("scale-family-correction:0"));
    assert.ok(smoke.record?.qa_checklist.includes("scale-assembled-target:56"));
    assert.equal(
      smoke.record?.qa_checklist.some((tag) => tag.startsWith("geometry-scale:")),
      false,
    );
    assert.equal(smoke.record?.qa_checklist.filter((tag) => tag.startsWith("scale-global-target:")).length, 1);
    assert.equal(smoke.record?.qa_checklist.filter((tag) => tag.startsWith("scale-assembled-target:")).length, 1);
    assert.equal(
      smoke.record?.qa_checklist.some((tag) => tag.startsWith("shadow-smoke-sku:")),
      false,
    );

    const sibling = buildThreeMlPreflight("GB-SPR-CLR-3ML-WHT", "GBSpry3mlClWht", "White");
    assert.equal(sibling.record?.prompt_version, "best-bottles-reference-locked-v6.1");
    assert.equal(sibling.record?.shadow_owner, "model");
    assert.match(sibling.record?.final_prompt ?? "", /MODEL OWNED/);
  });

  it("classifies swirl Cylinder fine-mist sprayers as swirl-fluted glass despite catalog plastic category text", () => {
    const sku = buildBestBottlesPromptSkuFromProduct({
      product: baseProduct,
      referenceImagePath: "/references/GB-CYL-CLR-9ML-SPR-GLD.png",
      bodyMaterial: "plastic",
      canvas: { widthPx: 2080, heightPx: 2288 },
    });

    assert.equal(sku.product_family, "cylinder");
    assert.equal(sku.frame_class, "tall_narrow");
    assert.equal(sku.body_material, "swirl_glass");
    assert.equal(sku.closure_type, "fine_mist_sprayer");
    assert.equal(sku.collar_material, "polished_gold_metal");
    assert.deepEqual(sku.detached_components, ["clear_or_white_overcap"]);
  });

  it("does not infer detached caps from ordinary assembled clear-cap fine-mist wording", () => {
    const sku = buildBestBottlesPromptSkuFromProduct({
      product: {
        ...baseProduct,
        graceSku: "GB-SPR-CLR-4ML-BLK",
        websiteSku: "GBSpry4mlClBlk",
        itemName: "Clear Glass Bottle with Black Spray Pump and Clear Cap. Capacity: 4ml",
        itemDescription: "Clear glass sample spray bottle with black fine mist sprayer and clear cap.",
        capacityMl: 4,
        heightWithCap: "67 ±1 mm",
        heightWithoutCap: "49 ±0.5 mm",
        diameter: "14 ±0.5 mm",
      },
      referenceImagePath: "/references/GB-SPR-CLR-4ML-BLK.png",
      bodyMaterial: "glass",
      canvas: { widthPx: 2080, heightPx: 2288 },
    });

    assert.deepEqual(sku.detached_components, []);
  });

  it("compiles a visible preflight record with cap-preservation warnings for pale caps", () => {
    const preflight = buildBestBottlesPromptPreflight({
      product: baseProduct,
      referenceImagePath: "/references/GB-CYL-CLR-9ML-SPR-GLD.png",
      bodyMaterial: "plastic",
      canvas: { widthPx: 2080, heightPx: 2288 },
      system: promptSystem,
    });

    assert.equal(preflight.status, "warn");
    assert.equal(preflight.issue, null);
    assert.ok(preflight.record);
    assert.match(preflight.record.final_prompt, /^You are enhancing the attached product reference image/);
    assert.match(preflight.record.final_prompt, /GLASS: preserve the glass's exact color/i);
    assert.match(preflight.record.final_prompt, /For swirl glass: the swirl pattern must remain visible and intact/i);
    assert.match(preflight.record.final_prompt, /CYLINDER STANDARD FRAMING PROFILE/i);
    assert.match(preflight.record.final_prompt, /STUDIO DIRECTION:/i);
    assert.match(preflight.record.final_prompt, /FINAL V2 STUDIO CHECK:/i);
    assert.doesNotMatch(preflight.record.final_prompt, /ENHANCE ONLY THE PRESENTATION/i);
    assert.doesNotMatch(preflight.record.final_prompt, /BACKGROUND AND COMPOSITION:/i);
    assert.doesNotMatch(preflight.record.final_prompt, /NEGATIVE CONSTRAINTS:/i);
    assert.ok(
      preflight.record.final_prompt.indexOf("CYLINDER STANDARD FRAMING PROFILE") <
        preflight.record.final_prompt.indexOf("STUDIO DIRECTION:"),
    );
    assert.ok(
      preflight.record.final_prompt.indexOf("STUDIO DIRECTION:") <
        preflight.record.final_prompt.indexOf("FINAL V2 STUDIO CHECK:"),
    );
    assert.doesNotMatch(preflight.record.final_prompt, /back-right at clock 2:00-2:30/i);
    assert.doesNotMatch(preflight.record.final_prompt, /#EEE6D4/i);
    assert.doesNotMatch(preflight.record.final_prompt, /Aesop \/ Kinfolk/i);
    assert.doesNotMatch(preflight.record.final_prompt, /slightly polished off-white surface/i);
    assert.doesNotMatch(preflight.record.final_prompt, /faint, slightly darker reflection/i);
    assert.doesNotMatch(preflight.record.final_prompt, /surface reads as paper/i);
    assert.doesNotMatch(preflight.record.final_prompt, /Body material: swirl-fluted clear glass/i);
    assert.ok(preflight.record.qa_checklist.includes("white_caps_visible"));
    assert.ok(preflight.record.qa_checklist.includes("swirl_flutes_preserved"));
    assert.ok(preflight.record.qa_checklist.includes(BEST_BOTTLES_CATALOG_CANON_PROMPT_FLAG));
    assert.ok(preflight.warnings.some((warning) => /catalog material says plastic/i.test(warning)));
    assert.ok(preflight.warnings.some((warning) => /white or translucent cap/i.test(warning)));
  });

  it("treats Cylinder SPR-GLD as white or clear sprayer parts with a polished gold collar", () => {
    const actualCatalogShape = {
      ...baseProduct,
      websiteSku: "GBCylSwrl9SpryGl",
      itemName: "9 ml Swirl Cylinder Fine Mist Sprayer",
      itemDescription: null,
      color: "Swirl",
      capColor: "Gold",
      trimColor: null,
      heightWithoutCap: "74 +/-1 mm",
      diameter: "21 +/-0.5 mm",
    };

    const sku = buildBestBottlesPromptSkuFromProduct({
      product: actualCatalogShape,
      referenceImagePath:
        "https://example.com/best-bottles/reference-intake/cylinder/gb-cyl-clr-9ml-spr-gld.png",
      bodyMaterial: "plastic",
      canvas: { widthPx: 2080, heightPx: 2288 },
    });

    assert.equal(sku.closure_type, "fine_mist_sprayer");
    assert.equal(sku.body_material, "swirl_glass");
    assert.equal(sku.closure_material, "white plastic actuator with polished gold collar");
    assert.equal(sku.cap_color, "clear or white over-cap");
    assert.equal(sku.collar_material, "polished_gold_metal");
    assert.deepEqual(sku.detached_components, []);

    const preflight = buildBestBottlesPromptPreflight({
      product: actualCatalogShape,
      referenceImagePath:
        "https://example.com/best-bottles/reference-intake/cylinder/gb-cyl-clr-9ml-spr-gld.png",
      bodyMaterial: "plastic",
      canvas: { widthPx: 2080, heightPx: 2288 },
      system: promptSystem,
    });

    assert.ok(preflight.record);
    assert.match(preflight.record.final_prompt, /^You are enhancing the attached product reference image/);
    assert.match(preflight.record.final_prompt, /GLASS: preserve the glass's exact color/i);
    assert.match(preflight.record.final_prompt, /For swirl glass: the swirl pattern must remain visible and intact/i);
    assert.match(preflight.record.final_prompt, /Cross-polarized capture/i);
    assert.equal(preflight.sku?.closure_material, "white plastic actuator with polished gold collar");
    assert.equal(preflight.sku?.cap_color, "clear or white over-cap");
    assert.deepEqual(preflight.sku?.detached_components, []);
  });

  it("keeps Cylinder lotion-pump variants in the Cylinder family while compiling pump closure truth", () => {
    const lotionPumpVariant = {
      ...baseProduct,
      graceSku: "LB-CYL-CLR-9ML-LPM-MSLV",
      websiteSku: "LBCylSwrl9LtnMtSl",
      itemName: "9 ml Swirl Cylinder Lotion Pump",
      itemDescription: null,
      color: "Swirl",
      applicator: "Lotion Pump",
      capColor: "Matte Silver",
      trimColor: null,
      heightWithoutCap: "74 +/-1 mm",
      diameter: "21 +/-0.5 mm",
    };

    const sku = buildBestBottlesPromptSkuFromProduct({
      product: lotionPumpVariant,
      referenceImagePath:
        "https://example.com/best-bottles/reference-intake/cylinder/lb-cyl-clr-9ml-lpm-mslv.png",
      bodyMaterial: "plastic",
      canvas: { widthPx: 2080, heightPx: 2288 },
    });

    assert.equal(sku.product_family, "cylinder");
    assert.equal(sku.frame_class, "tall_narrow");
    assert.equal(sku.body_material, "swirl_glass");
    assert.equal(sku.closure_type, "lotion_pump");
    assert.equal(sku.closure_material, "white plastic pump with matte silver collar");
    assert.equal(sku.cap_color, "clear or white over-cap");
    assert.equal(sku.collar_material, "matte_silver_metal");
    assert.deepEqual(sku.detached_components, []);
  });

  it("compiles Circle families for the square-round canvas tier", () => {
    const circleVariant = {
      ...baseProduct,
      graceSku: "GB-CIR-WHT-15ML-WHT-S",
      websiteSku: "GBCir15WhtSht",
      itemName: "15 ml Clear Circle Bottle with Cap",
      itemDescription:
        "Circle design 15ml, 1/2oz Clear glass bottle with short white cap.",
      bottleCollection: "Circle",
      family: "Circle",
      category: "Glass Bottles",
      color: "Clear",
      capacityMl: 15,
      applicator: "Cap/Closure",
      capColor: "White",
      trimColor: null,
      heightWithoutCap: "45 mm",
      heightWithCap: "57 mm",
      diameter: "30 mm",
    };

    const preflight = buildBestBottlesPromptPreflight({
      product: circleVariant,
      referenceImagePath: "/references/GB-CIR-WHT-15ML-WHT-S.png",
      bodyMaterial: "clear glass",
      canvas: { widthPx: 2048, heightPx: 2048 },
      system: promptSystem,
    });

    assert.notEqual(preflight.status, "error");
    assert.equal(preflight.issue, null);
    assert.ok(preflight.record);
    assert.equal(preflight.sku?.product_family, "circle");
    assert.equal(preflight.sku?.frame_class, "medium_upright");
    assert.match(preflight.record.final_prompt, /^You are enhancing the attached product reference image/);
    assert.match(preflight.record.final_prompt, /PRIMARY GOAL:/i);
    assert.match(preflight.record.final_prompt, /Make the clear glass look like real luxury product-photography glass/i);
    assert.match(preflight.record.final_prompt, /GLASS APPEARANCE:/i);
    assert.match(preflight.record.final_prompt, /STUDIO DIRECTION:/i);
    assert.match(preflight.record.final_prompt, /FINAL V2 STUDIO CHECK:/i);
    assert.doesNotMatch(preflight.record.final_prompt, /BACKGROUND AND COMPOSITION:/i);
    assert.doesNotMatch(preflight.record.final_prompt, /NEGATIVE CONSTRAINTS:/i);
    assert.doesNotMatch(preflight.record.final_prompt, /Do not create barcode-like vertical stripes/i);
    assert.doesNotMatch(preflight.record.final_prompt, /FINAL CHECK BEFORE OUTPUT:/i);
    assert.doesNotMatch(preflight.record.final_prompt, /vertical highlight band/i);
    assert.doesNotMatch(preflight.record.final_prompt, /softer secondary band/i);
    assert.doesNotMatch(preflight.record.final_prompt, /TEST-ONLY MATERIAL POLISH ADDENDUM/i);
    assert.match(preflight.record.final_prompt, /rear wall of the bottle should be faintly visible through the front wall/i);
    assert.match(preflight.record.final_prompt, /exact 2080x2288 canvas/i);
    assert.doesNotMatch(preflight.record.final_prompt, /This kills surface haze/i);
    assert.doesNotMatch(preflight.record.final_prompt, /#EEE6D4/i);
    assert.ok(preflight.record.qa_checklist.includes(BEST_BOTTLES_CATALOG_CANON_PROMPT_FLAG));
    assert.doesNotMatch(preflight.record.final_prompt, /2048 x 2048 portrait PDP canvas/i);
  });

  it("marks measured Cylinder SKUs for the fixed 2080 x 2288 studio canvas", () => {
    const preflight = buildBestBottlesPromptPreflight({
      product: baseProduct,
      referenceImagePath: "/references/GB-CYL-CLR-9ML-SPR-GLD.png",
      bodyMaterial: "plastic",
      canvas: { widthPx: 2080, heightPx: 2288 },
      system: promptSystem,
    });

    assert.notEqual(preflight.status, "error");
    assert.equal(preflight.sku?.output_canvas_width, 2080);
    assert.equal(preflight.sku?.output_canvas_height, 2288);
    assert.ok(preflight.record?.qa_checklist.includes("canvas_recommendation:fixed_studio_2080x2288"));
    assert.ok(preflight.record?.qa_checklist.includes("cylinder_family_profile:cylinder-standard"));
    assert.ok(preflight.record?.qa_checklist.includes("primary_object_centerline:canvas_center"));
    assert.ok(preflight.record?.qa_checklist.includes("detached_component_sidecar:right_does_not_shift_primary"));
    assert.ok(preflight.record?.qa_checklist.includes("canvas_selected:2080x2288"));
    assert.equal(
      preflight.warnings.some((warning) => /Cylinder family uses the fixed 2080 x 2288 studio canvas/i.test(warning)),
      false,
    );
  });

  it("warns when a Cylinder SKU is placed on a non-fixed canvas", () => {
    const preflight = buildBestBottlesPromptPreflight({
      product: baseProduct,
      referenceImagePath: "/references/GB-CYL-CLR-9ML-SPR-GLD.png",
      bodyMaterial: "plastic",
      canvas: { widthPx: 2048, heightPx: 2048 },
      system: promptSystem,
    });

    assert.notEqual(preflight.status, "error");
    assert.ok(preflight.record?.qa_checklist.includes("canvas_recommendation:fixed_studio_2080x2288"));
    assert.ok(preflight.record?.qa_checklist.includes("cylinder_family_profile:cylinder-standard"));
    assert.ok(
      preflight.warnings.some((warning) =>
        /Cylinder family uses the fixed 2080 x 2288 studio canvas/i.test(warning),
      ),
    );
  });

  it("compiles an approved vintage tassel master for the topology-wide canvas", () => {
    const preflight = buildBestBottlesPromptPreflight({
      product: {
        ...baseProduct,
        graceSku: "GB-CYL-CLR-50ML-AST-BLK",
        websiteSku: "GBCyl50AnSpTslBlk",
        itemName: "50 ml Clear Cylinder Vintage Bulb Sprayer with Tassel",
        itemDescription: "Clear glass bottle with vintage bulb, braided hose, and tassel.",
        applicator: "Vintage Bulb Sprayer with Tassel",
        capacityMl: 50,
        heightWithoutCap: "97 mm",
        heightWithCap: "126 mm",
        diameter: "32 mm",
        topologyReferenceId: "approved-tassel-psd-sha256",
      },
      referenceImagePath: "/references/GBCyl50AnSpTslBlk.png",
      bodyMaterial: "clear glass",
      canvas: { widthPx: 1536, heightPx: 1024 },
      system: promptSystem,
    });

    assert.notEqual(preflight.status, "error");
    assert.ok(preflight.record?.qa_checklist.includes("canvas_selected:1536x1024"));
    assert.ok(preflight.record?.qa_checklist.includes("canvas_contract:topology-wide-v1"));
    assert.ok(preflight.record?.qa_checklist.includes("primary_object_centerline:65pct"));
    assert.equal(
      preflight.warnings.some((warning) => /fixed 2080 x 2288 studio canvas/i.test(warning)),
      false,
    );
    assert.match(preflight.record?.final_prompt ?? "", /Canvas is fixed at 1536 × 1024/);
    assert.match(preflight.record?.final_prompt ?? "", /vertical centerline at 65% width/);
    assert.doesNotMatch(preflight.record?.final_prompt ?? "", /2080(?:x| × | x )2288/);
  });

  it("routes the compact 3ml Cylinder fine-mist SKU to the standard 10:11 frame", () => {
    const compactCylinder = {
      ...baseProduct,
      graceSku: "GB-SPR-CLR-3ML-BLK",
      websiteSku: "GBSpry3mlClBlk",
      itemName: "3 ml Clear Cylinder Fine Mist Sprayer",
      itemDescription: "3.3ml Clear Glass Bottle with Black Spray Pump and Clear Cap.",
      applicator: "Fine Mist Sprayer",
      trimColor: "Black",
      heightWithoutCap: "37 mm",
      heightWithCap: "54 mm",
      diameter: "14 mm",
      capacityMl: 3,
    };

    const tallCanvasPreflight = buildBestBottlesPromptPreflight({
      product: compactCylinder,
      referenceImagePath: "/references/GB-SPR-CLR-3ML-BLK.png",
      bodyMaterial: "clear glass",
      canvas: { widthPx: 1024, heightPx: 1536 },
      system: promptSystem,
    });

    assert.notEqual(tallCanvasPreflight.status, "error");
    assert.equal(tallCanvasPreflight.sku?.frame_class, "medium_upright");
    assert.ok(tallCanvasPreflight.record?.qa_checklist.includes("canvas_recommendation:fixed_studio_2080x2288"));
    assert.ok(tallCanvasPreflight.record?.qa_checklist.includes("cylinder_family_profile:sample-vial"));
    assert.ok(tallCanvasPreflight.record?.qa_checklist.includes("canvas_selected:1024x1536"));
    assert.match(
      tallCanvasPreflight.warnings[0] ?? "",
      /Cylinder family uses the fixed 2080 x 2288 studio canvas/i,
    );

    const standardCanvasPreflight = buildBestBottlesPromptPreflight({
      product: compactCylinder,
      referenceImagePath: "/references/GB-SPR-CLR-3ML-BLK.png",
      bodyMaterial: "clear glass",
      canvas: { widthPx: 2080, heightPx: 2288 },
      system: promptSystem,
    });

    assert.notEqual(standardCanvasPreflight.status, "error");
    assert.ok(standardCanvasPreflight.record?.qa_checklist.includes("canvas_recommendation:fixed_studio_2080x2288"));
    assert.ok(standardCanvasPreflight.record?.qa_checklist.includes("cylinder_family_profile:sample-vial"));
    assert.ok(standardCanvasPreflight.record?.qa_checklist.includes("canvas_selected:2080x2288"));
    assert.equal(
      standardCanvasPreflight.warnings.some((warning) => /fixed 2080 x 2288 studio canvas/i.test(warning)),
      false,
    );
  });

  it("adds resolved Cylinder framing profile instructions to the canon prompt", () => {
    const compactCylinder = {
      ...baseProduct,
      graceSku: "GB-SPR-CLR-3ML-BLK",
      websiteSku: "GBSpry3mlClBlk",
      itemName: "3 ml Clear Cylinder Fine Mist Sprayer",
      itemDescription: "3.3ml Clear Glass Bottle with Black Spray Pump and Clear Cap.",
      applicator: "Fine Mist Sprayer",
      trimColor: "Black",
      heightWithoutCap: "37 mm",
      heightWithCap: "54 mm",
      diameter: "14 mm",
      capacityMl: 3,
    };

    const compactPreflight = buildBestBottlesPromptPreflight({
      product: compactCylinder,
      referenceImagePath: "/references/GB-SPR-CLR-3ML-BLK.png",
      bodyMaterial: "clear glass",
      canvas: { widthPx: 2080, heightPx: 2288 },
      system: promptSystem,
    });
    const tallPreflight = buildBestBottlesPromptPreflight({
      product: baseProduct,
      referenceImagePath: "/references/GB-CYL-CLR-9ML-SPR-GLD.png",
      bodyMaterial: "plastic",
      canvas: { widthPx: 2080, heightPx: 2288 },
      system: promptSystem,
    });

    assert.ok(compactPreflight.record);
    assert.ok(tallPreflight.record);
    assert.match(compactPreflight.record.final_prompt, /CYLINDER SAMPLE VIAL FRAMING PROFILE/i);
    assert.match(compactPreflight.record.final_prompt, /SHOULDER LOCK \(shoulder-lock-2026-09-07 · cylinder:3\.3-standard\)/i);
    assert.match(compactPreflight.record.final_prompt, /MUST land at 26\.5% of canvas height/i);
    assert.doesNotMatch(compactPreflight.record.final_prompt, /Approved fill-height range:/i);
    assert.doesNotMatch(compactPreflight.record.final_prompt, /fills approximately/i);
    assert.doesNotMatch(compactPreflight.record.final_prompt, /versioned global catalog curve owns assembled height/i);
    assert.match(compactPreflight.record.final_prompt, /primary bottle centered on the canvas vertical centerline/i);
    assert.match(compactPreflight.record.final_prompt, /PRIMARY GOAL:/i);
    assert.match(compactPreflight.record.final_prompt, /The base should show clear curved glass geometry, transparent thickness, and crisp circular base rings/i);
    assert.doesNotMatch(compactPreflight.record.final_prompt, /A subtle internal caustic where the back wall meets the sidewall at the base/i);
    assert.doesNotMatch(compactPreflight.record.final_prompt, /NEGATIVE CONSTRAINTS:/i);
    assert.doesNotMatch(compactPreflight.record.final_prompt, /vertical highlight band/i);
    assert.doesNotMatch(compactPreflight.record.final_prompt, /secondary band/i);
    assert.doesNotMatch(compactPreflight.record.final_prompt, /paired sidewall lines/i);
    assert.doesNotMatch(compactPreflight.record.final_prompt, /Do not create cloudy white fill/i);
    assert.doesNotMatch(compactPreflight.record.final_prompt, /Do not create milky haze/i);
    assert.doesNotMatch(compactPreflight.record.final_prompt, /Do not create frosted glass/i);
    assert.doesNotMatch(compactPreflight.record.final_prompt, /Do not create opaque white patches inside the bottle/i);
    assert.doesNotMatch(compactPreflight.record.final_prompt, /Do not create a white plug or solid base block/i);
    assert.doesNotMatch(compactPreflight.record.final_prompt, /Do not create bubbles, dust, smoke, sediment, residue, scratches, speckles/i);
    assert.match(compactPreflight.record.final_prompt, /STUDIO DIRECTION:/i);
    assert.match(compactPreflight.record.final_prompt, /FINAL V2 STUDIO CHECK:/i);
    assert.ok(
      compactPreflight.record.final_prompt.indexOf("PRIMARY GOAL:") <
        compactPreflight.record.final_prompt.indexOf("CYLINDER SAMPLE VIAL FRAMING PROFILE"),
    );
    assert.ok(
      compactPreflight.record.final_prompt.indexOf("CYLINDER SAMPLE VIAL FRAMING PROFILE") <
        compactPreflight.record.final_prompt.indexOf("STUDIO DIRECTION:"),
    );
    assert.ok(
      compactPreflight.record.final_prompt.indexOf("STUDIO DIRECTION:") <
        compactPreflight.record.final_prompt.indexOf("FINAL V2 STUDIO CHECK:"),
    );
    assert.doesNotMatch(compactPreflight.record.final_prompt, /CLEAR GLASS POLLUTION GUARD/i);
    assert.doesNotMatch(compactPreflight.record.final_prompt, /CLEAR GLASS SIDEWALL CLEANLINESS GUARD/i);
    assert.doesNotMatch(compactPreflight.record.final_prompt, /SPRAYER \/ PUMP GLASS BOUNDARY GUARD/i);
    assert.doesNotMatch(compactPreflight.record.final_prompt, /white pump housing must be centered/i);
    assert.doesNotMatch(compactPreflight.record.final_prompt, /Do not stack multiple opaque or translucent pump cylinders/i);
    assert.doesNotMatch(compactPreflight.record.final_prompt, /Do not render it as a distinct rectangular white block below the cap/i);
    assert.doesNotMatch(compactPreflight.record.final_prompt, /exactly as Image 1 shows it/i);
    assert.doesNotMatch(compactPreflight.record.final_prompt, /external pump housing position/i);
    assert.match(tallPreflight.record.final_prompt, /CYLINDER STANDARD FRAMING PROFILE/i);
    assert.match(tallPreflight.record.final_prompt, /SHOULDER LOCK \(shoulder-lock-2026-09-07 · cylinder:9-standard\)/i);
    assert.match(tallPreflight.record.final_prompt, /MUST land at 43\.5% of canvas height/i);
    assert.doesNotMatch(tallPreflight.record.final_prompt, /Approved fill-height range:/i);
    assert.doesNotMatch(tallPreflight.record.final_prompt, /fills approximately/i);
    assert.doesNotMatch(compactPreflight.record.final_prompt, /Do NOT vary the on-canvas size by ml capacity/i);
    assert.doesNotMatch(tallPreflight.record.final_prompt, /Do NOT vary the on-canvas size by ml capacity/i);
  });

  it("adds the smooth round-glass volume cue to clear Cylinder prompts without restoring cap refinishing", () => {
    const preflight = buildBestBottlesPromptPreflight({
      product: {
        ...baseProduct,
        graceSku: "GB-CYL-CLR-9ML-T-21",
        websiteSku: "GBCyl9SpryBlk",
        itemName: "9 ml Clear Cylinder Fine Mist Spray Bottle",
        itemDescription: "9 ml clear round glass Cylinder bottle with black fine mist sprayer.",
        color: "Clear",
        heightWithoutCap: "70 mm",
        heightWithCap: "98 mm",
        diameter: "20 mm",
      },
      referenceImagePath: "/references/GB-CYL-CLR-9ML-T-21.png",
      bodyMaterial: "clear glass",
      canvas: { widthPx: 2080, heightPx: 2288 },
      system: promptSystem,
    });

    assert.notEqual(preflight.status, "error");
    assert.ok(preflight.record);
    assert.match(preflight.record.final_prompt, /Round-glass volume cue:/i);
    assert.match(preflight.record.final_prompt, /curved cylinder, not a flat pane/i);
    assert.match(preflight.record.final_prompt, /half-tone deeper than the bare canvas/i);
    assert.match(preflight.record.final_prompt, /PERFECTLY SMOOTH/i);
    assert.match(preflight.record.final_prompt, /must remain visibly dimensional at ecommerce thumbnail size/i);
    assert.match(preflight.record.final_prompt, /uniform Bone-colored rectangle or empty cutout window/i);
    assert.match(preflight.record.final_prompt, /narrow asymmetric studio-card reflections.*curved sidewalls/i);
    assert.match(preflight.record.final_prompt, /never resolve into a discrete dark rail/i);
    assert.doesNotMatch(preflight.record.final_prompt, /continuous fine dark glass edge line/i);
    assert.doesNotMatch(preflight.record.final_prompt, /Component material targeting:/i);
  });

  it("uses the roller-bottle profile for Cylinder roller products in prompt and QA", () => {
    const cylinderRoller = {
      ...baseProduct,
      graceSku: "GB-CYL-CLR-28ML-MRL-01",
      websiteSku: "GBMtlRoll28Blk",
      itemName: "28 ml Clear Cylinder Metal Roller Bottle",
      itemDescription: "28 ml clear cylinder bottle with metal roller ball and black cap.",
      applicator: "Metal Roller Ball",
      capColor: "Clear",
      trimColor: null,
      heightWithoutCap: "81 mm",
      heightWithCap: "100 mm",
      diameter: "31 mm",
      capacityMl: 28,
    };

    const preflight = buildBestBottlesPromptPreflight({
      product: cylinderRoller,
      referenceImagePath: "/references/GB-CYL-CLR-28ML-MRL-01.png",
      bodyMaterial: "clear glass",
      canvas: { widthPx: 2080, heightPx: 2288 },
      system: promptSystem,
    });

    assert.notEqual(preflight.status, "error");
    assert.ok(preflight.record);
    assert.equal(preflight.sku?.product_family, "cylinder");
    assert.match(preflight.record.final_prompt, /ROLLER BOTTLE FRAMING PROFILE/i);
    assert.match(preflight.record.final_prompt, /SHOULDER LOCK \(shoulder-lock-2026-09-07 · cylinder:28-standard\)/i);
    assert.match(preflight.record.final_prompt, /MUST land at 50\.5% of canvas height/i);
    assert.doesNotMatch(preflight.record.final_prompt, /Approved fill-height range:/i);
    assert.doesNotMatch(preflight.record.final_prompt, /fills approximately/i);
    assert.ok(preflight.record.qa_checklist.includes("cylinder_family_profile:roller-bottle"));
    assert.equal(preflight.record.qa_checklist.includes("cylinder_family_profile:cylinder-standard"), false);
  });

  it("locks every Cylinder glass body, including the 50 ml roll-on, to its shoulder", () => {
    const lockedBodies = [
      { capacityMl: 4, heightWithoutCap: "44 mm", key: "cylinder:4-standard", pct: "31.5" },
      { capacityMl: 5, heightWithoutCap: "50 mm", key: "cylinder:5-standard", pct: "36.5" },
      { capacityMl: 9, heightWithoutCap: "112 mm", itemName: "9 ml Tall Cylinder", key: "cylinder:9-tall", pct: "62.5" },
      { capacityMl: 25, heightWithoutCap: "70 mm", key: "cylinder:25-standard", pct: "46.5" },
      { capacityMl: 30, heightWithoutCap: "85 mm", key: "cylinder:30-standard", pct: "46" },
      { capacityMl: 50, heightWithoutCap: "117 mm", key: "cylinder:50-standard", pct: "56" },
      { capacityMl: 100, heightWithoutCap: "140 mm", key: "cylinder:100-standard", pct: "67.5" },
      { capacityMl: 114, heightWithoutCap: "120 mm", key: "cylinder:114-standard", pct: "49.5" },
      { capacityMl: 227, heightWithoutCap: "160 mm", key: "cylinder:227-standard", pct: "63" },
      { capacityMl: 454, heightWithoutCap: "200 mm", key: "cylinder:454-standard", pct: "71.5" },
    ] as const;

    for (const body of lockedBodies) {
      const preflight = buildBestBottlesPromptPreflight({
        product: {
          ...baseProduct,
          graceSku: `GB-CYL-CLR-${body.capacityMl}ML-SPR`,
          itemName: "itemName" in body ? body.itemName : `${body.capacityMl} ml Clear Cylinder`,
          capacityMl: body.capacityMl,
          heightWithoutCap: body.heightWithoutCap,
          applicator: "Fine Mist Sprayer",
        },
        referenceImagePath: `/references/${body.key}.png`,
        bodyMaterial: "clear glass",
        canvas: { widthPx: 2080, heightPx: 2288 },
        system: promptSystem,
      });
      assert.ok(preflight.record, body.key);
      assert.match(
        preflight.record.final_prompt,
        new RegExp(`SHOULDER LOCK \\(shoulder-lock-2026-09-07 · ${body.key.replace(".", "\\.")}\\)`),
        body.key,
      );
      assert.match(
        preflight.record.final_prompt,
        new RegExp(`MUST land at ${body.pct}% of canvas height`),
        body.key,
      );
      assert.doesNotMatch(preflight.record.final_prompt, /fills approximately/i, body.key);
      assert.doesNotMatch(preflight.record.final_prompt, /owns assembled height/i, body.key);
    }

    const rollon = buildBestBottlesPromptPreflight({
      product: {
        ...baseProduct,
        graceSku: "GB-CYL-CLR-50ML-MRL-01",
        websiteSku: "GBCyl50MtlRollBlk",
        itemName: "50 ml Clear Cylinder Metal Roller",
        applicator: "Metal Roller Ball",
        capacityMl: 50,
        heightWithoutCap: "98 mm",
      },
      referenceImagePath: "/references/GB-CYL-CLR-50ML-MRL-01.png",
      bodyMaterial: "clear glass",
      canvas: { widthPx: 2080, heightPx: 2288 },
      system: promptSystem,
    });
    assert.ok(rollon.record);
    assert.match(
      rollon.record.final_prompt,
      /SHOULDER LOCK \(shoulder-lock-2026-09-07 · cylinder:50-rollon\)/,
    );
    assert.match(rollon.record.final_prompt, /MUST land at 53% of canvas height/);
    assert.match(rollon.record.final_prompt, /98 mm bare glass, 37 mm diameter, neck 16 mm/);
    assert.doesNotMatch(rollon.record.final_prompt, /cylinder:50-standard/);
    assert.doesNotMatch(rollon.record.final_prompt, /fills approximately/i);

    const badVintage = buildBestBottlesPromptPreflight({
      product: {
        ...baseProduct,
        graceSku: "GB-CYL-CLR-50ML-ASP-WHT",
        itemName: "50 ml Clear Cylinder Vintage Bulb",
        applicator: "Vintage Bulb",
        capacityMl: 50,
        heightWithoutCap: "85 ±1 mm",
        heightWithCap: "110 ±2 mm",
        diameter: "30 ±0.5 mm",
        neckThreadSize: "18-415",
      },
      referenceImagePath: "/references/GB-CYL-CLR-50ML-ASP-WHT.png",
      bodyMaterial: "clear glass",
      canvas: { widthPx: 2080, heightPx: 2288 },
      system: promptSystem,
    });
    assert.ok(badVintage.record);
    assert.match(badVintage.record.final_prompt, /cylinder:50-standard/);
    assert.match(badVintage.record.final_prompt, /117 mm bare glass, 32 mm diameter, neck 18-415/);
    assert.doesNotMatch(badVintage.record.final_prompt, /85 mm bare glass/);
    assert.doesNotMatch(badVintage.record.final_prompt, /cylinder:50-rollon/);
  });

  it("blocks missing references before prompt compilation", () => {
    const preflight = buildBestBottlesPromptPreflight({
      product: baseProduct,
      referenceImagePath: "",
      bodyMaterial: "clear glass",
      canvas: { widthPx: 2080, heightPx: 2288 },
      system: promptSystem,
    });

    assert.equal(preflight.status, "error");
    assert.equal(preflight.record, null);
    assert.match(preflight.issue ?? "", /flattened product-truth reference/i);
  });

  it("degrades gracefully for unknown modules — still ships the canon + generic framing", () => {
    const preflight = buildBestBottlesPromptPreflight({
      product: {
        ...baseProduct,
        graceSku: "GB-MYS-001",
        websiteSku: "MYS001",
        family: "Mystery Family",
        bottleCollection: "Mystery Family",
        category: "Unknown",
        itemName: "Mystery Bottle",
        itemDescription: "Unclassified product with no known Best Bottles family cues.",
        applicator: "Unknown",
      },
      referenceImagePath: "/references/GB-MYSTERY.png",
      bodyMaterial: "unobtanium",
      canvas: { widthPx: 2080, heightPx: 2288 },
      system: promptSystem,
    });

    // A family with no module must NOT block generation: the shipped canon+framing
    // prompt does not depend on the module system. We degrade to a warning + record.
    assert.notEqual(preflight.status, "error");
    assert.ok(preflight.record, "unknown-module family should still produce a record");
    assert.equal(preflight.issue, null);
    assert.match(preflight.record.final_prompt, /^You are enhancing the attached product reference image/);
    assert.match(preflight.record.final_prompt, /FRAMING PROFILE \(CANVAS COMPOSITION AUTHORITY\)/i);
    assert.match(preflight.record.final_prompt, /FINAL V2 STUDIO CHECK:/i);
    assert.ok(preflight.record.qa_checklist.includes(BEST_BOTTLES_CATALOG_CANON_PROMPT_FLAG));
    assert.ok(
      preflight.warnings.some((warning) => /Module validation skipped/i.test(warning)),
      "should warn that module validation was skipped",
    );
  });

  it("ships a real framing profile for every previously-uncovered bottle family (render sampler)", () => {
    const samplers = [
      { family: "Empire", label: /EMPIRE BOTTLE FRAMING PROFILE/i, height: "116 mm" },
      { family: "Cream Jar", label: /CREAM JAR FRAMING PROFILE/i, height: "48 mm" },
      { family: "Round", label: /ROUND BOTTLE FRAMING PROFILE/i, height: "90 mm" },
      { family: "Square", label: /SQUARE BOTTLE FRAMING PROFILE/i, height: "70 mm" },
      { family: "Apothecary", label: /APOTHECARY BOTTLE FRAMING PROFILE/i, height: "150 mm" },
    ];

    for (const sampler of samplers) {
      const preflight = buildBestBottlesPromptPreflight({
        product: {
          ...baseProduct,
          graceSku: `GB-${sampler.family.replace(/\s+/g, "").toUpperCase()}-CLR-15`,
          websiteSku: `SAMP-${sampler.family.replace(/\s+/g, "")}`,
          family: sampler.family,
          bottleCollection: sampler.family,
          category: "Glass Bottles",
          itemName: `${sampler.family} clear glass bottle`,
          itemDescription: `${sampler.family} design clear glass bottle with cap.`,
          applicator: "Cap/Closure",
          color: "Clear",
          capacityMl: 15,
          heightWithCap: sampler.height,
          heightWithoutCap: sampler.height,
          diameter: "30 mm",
        },
        referenceImagePath: `/references/${sampler.family.replace(/\s+/g, "")}.png`,
        bodyMaterial: "clear glass",
        canvas: { widthPx: 2080, heightPx: 2288 },
        system: promptSystem,
      });

      assert.notEqual(preflight.status, "error", `${sampler.family} must not error`);
      assert.ok(preflight.record, `${sampler.family} must produce a record`);
      // Canon identity + material block present.
      assert.match(preflight.record.final_prompt, /^You are enhancing the attached product reference image/);
      // Per-family framing block present (the fix) on the fixed studio canvas.
      assert.match(preflight.record.final_prompt, sampler.label);
      assert.match(preflight.record.final_prompt, /Canvas is fixed at 2080 × 2288/);
      // Studio direction still the final controlling instruction.
      assert.match(preflight.record.final_prompt, /FINAL V2 STUDIO CHECK:/i);
      assert.ok(
        preflight.record.final_prompt.indexOf("FRAMING PROFILE (CANVAS COMPOSITION AUTHORITY)") <
          preflight.record.final_prompt.indexOf("FINAL V2 STUDIO CHECK:"),
        `${sampler.family} framing must precede the final studio check`,
      );
      assert.ok(preflight.record.qa_checklist.includes(BEST_BOTTLES_CATALOG_CANON_PROMPT_FLAG));
    }
  });
});
