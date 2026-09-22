import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BEST_BOTTLES_CATALOG_CANON_SOURCE_PATH,
  buildBestBottlesCatalogCanonPrompt,
  buildBestBottlesCatalogCanonPromptParts,
  clearGlassForShadowOwner,
  finalStudioCheckForShadowOwner,
  studioDirectionForShadowOwner,
} from "./bestBottlesCatalogCanonPrompt";
import {
  CLEAR_GLASS,
  FINAL_V2_STUDIO_CHECK,
  KEEP_MATERIAL,
  PRESERVE,
  STUDIO_DIRECTION,
  buildPrompt,
} from "@/config/bestBottlesCatalogCanon";
import type { PromptSku } from "./bestBottlesPromptCompiler";

const clearRollerSku: PromptSku = {
  sku: "GB-CYL-CLR-9ML-T-06",
  filename: "GB-CYL-CLR-9ML-T-06.png",
  product_family: "cylinder",
  frame_class: "standard",
  body_shape: "cylinder",
  body_material: "clear_glass",
  body_color: "clear",
  closure_type: "metal_roller_ball",
  closure_material: "black metal cap",
  cap_color: "black",
  collar_material: "none",
  applicator_type: "metal_roller_ball",
  detached_components: ["black_cap"],
  orientation: "front",
  transparency_type: "transparent",
  special_geometry_notes: "",
  reference_image_path: "/references/GB-CYL-CLR-9ML-T-06.png",
  output_canvas_width: 2080,
  output_canvas_height: 2288,
};

describe("Best Bottles catalog canon prompt", () => {
  it("keeps rig canon strings byte-for-byte while exposing model-owned variants", () => {
    assert.equal(clearGlassForShadowOwner("rig"), CLEAR_GLASS);
    assert.equal(studioDirectionForShadowOwner("rig"), STUDIO_DIRECTION);
    assert.equal(finalStudioCheckForShadowOwner("rig"), FINAL_V2_STUDIO_CHECK);

    const modelGlass = clearGlassForShadowOwner("model");
    const modelStudio = studioDirectionForShadowOwner("model");
    const modelFinal = finalStudioCheckForShadowOwner("model");
    assert.doesNotMatch(modelGlass, /contact shadow are handled deterministically/i);
    assert.doesNotMatch(modelGlass, /deterministic post-processing responsibilities/i);
    assert.doesNotMatch(modelStudio, /Madison applies both deterministically after generation/i);
    assert.match(modelGlass, /#F5F3EF/);
    assert.match(
      modelFinal,
      /resolved Cylinder V6\.1 model-owned contact-shadow contract/,
    );
    assert.throws(
      () => buildBestBottlesCatalogCanonPromptParts(clearRollerSku, {
        promptVersion: "best-bottles-reference-locked-v6.0",
        owner: "rig",
        contract: "deterministic-contact-v1",
        rollout: null,
      }),
      /policy must resolve from reviewed family context/,
    );
  });

  it("exports the approved Kinfolk/Aesop v2 studio direction as a modular canon block", () => {
    const studioDirection = STUDIO_DIRECTION;

    // Canon is now vendored inside this repo (single source of truth), not the external pipeline.
    assert.match(BEST_BOTTLES_CATALOG_CANON_SOURCE_PATH, /bestBottlesCatalogCanon/);
    assert.equal(typeof studioDirection, "string");
    assert.match(studioDirection, /Kinfolk/);
    assert.match(studioDirection, /Aesop/);
    assert.match(studioDirection, /mood reference/i);
    assert.match(studioDirection, /fill-height target/i);
    assert.match(studioDirection, /shared baseline/i);
    assert.match(studioDirection, /centerline/i);
    assert.match(studioDirection, /contact-only/i);
    assert.match(studioDirection, /Do not add props/i);
    assert.doesNotMatch(studioDirection, /negative space/i);
    assert.doesNotMatch(studioDirection, /editorial/i);
  });

  it("assembles buildPrompt() from the vendored canon blocks in the correct order", () => {
    const clear = buildPrompt(true);
    const colored = buildPrompt(false);

    assert.equal(clear, [PRESERVE, CLEAR_GLASS, STUDIO_DIRECTION, FINAL_V2_STUDIO_CHECK].join("\n\n"));
    assert.equal(colored, [PRESERVE, KEEP_MATERIAL, STUDIO_DIRECTION, FINAL_V2_STUDIO_CHECK].join("\n\n"));
    // Clear-glass path must not leak the colored-material instruction and vice versa.
    assert.doesNotMatch(clear, /preserve the glass's exact color/);
    assert.doesNotMatch(colored, /PRIMARY GOAL:/);
  });

  it("assembles clear-glass canon as compact material truth with v2 studio direction last", () => {
    const prompt = buildBestBottlesCatalogCanonPrompt(clearRollerSku);

    const materialIndex = prompt.indexOf("PRIMARY GOAL:");
    const studioDirectionIndex = prompt.indexOf("STUDIO DIRECTION:");
    const finalCheckIndex = prompt.indexOf("FINAL V2 STUDIO CHECK:");

    assert.ok(materialIndex >= 0);
    assert.ok(studioDirectionIndex > materialIndex);
    assert.ok(finalCheckIndex > studioDirectionIndex);
    assert.doesNotMatch(prompt, /BACKGROUND AND COMPOSITION:/);
    assert.doesNotMatch(prompt, /NEGATIVE CONSTRAINTS:/);
    assert.doesNotMatch(prompt, /FINAL CHECK BEFORE OUTPUT:/);
    assert.doesNotMatch(prompt, /TEST-ONLY MATERIAL POLISH ADDENDUM/);
    assert.match(
      prompt.trimEnd(),
      /The resolved Cylinder V6\.1 model-owned contact-shadow contract does not weaken product identity, geometry, material, canvas, or framing authority\.$/,
    );
  });
});
