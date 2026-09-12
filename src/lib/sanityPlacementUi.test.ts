import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildSanityPlacementMetadata,
  getDefaultSanityPlacementDestination,
  getSanityPlacementDestination,
  SANITY_PLACEMENT_DESTINATIONS,
  validateSanityPlacementForm,
} from "./sanityPlacementUi";

describe("Sanity placement UI rules", () => {
  it("exposes the media destinations supported by the placement edge function", () => {
    assert.deepEqual(
      SANITY_PLACEMENT_DESTINATIONS.map((destination) => destination.key),
      [
        "homepage_hero",
        "homepage_hero_mobile",
        "product_family_hero",
        "homepage_start_here_card",
        "homepage_mobile_category_card",
        "homepage_mega_menu_panel",
        "blog_post",
        "product_main_image",
        "paper_doll_component",
      ],
    );
    assert.equal(
      getSanityPlacementDestination("product_family_hero")?.label,
      "Design family card",
    );
    // Every homepage and editorial destination is picked from a list — no IDs typed.
    for (const destination of SANITY_PLACEMENT_DESTINATIONS) {
      if (destination.group !== "Product") assert.equal(destination.pickTarget, true, destination.key);
    }
  });

  it("defaults family-tagged Best Bottles media to the design family card", () => {
    assert.equal(
      getDefaultSanityPlacementDestination({
        familySlug: "sleek-5ml-clear-13-415-rollon",
      }),
      "product_family_hero",
    );
    assert.equal(getDefaultSanityPlacementDestination(), "homepage_hero");
  });

  it("requires a picked target and alt text for list-driven placements — never a document ID", () => {
    const result = validateSanityPlacementForm({
      destinationKey: "homepage_hero",
      altText: "",
      isBestBottlesOrg: true,
    });

    assert.equal(result.ok, false);
    assert.match(result.errors.join(" "), /Choose where on the site/);
    assert.match(result.errors.join(" "), /Alt text/);
    assert.doesNotMatch(result.errors.join(" "), /document ID/i);

    const withTarget = validateSanityPlacementForm({
      destinationKey: "homepage_hero",
      target: { label: "Beautifully Contained", metadata: { slideKey: "k1" } },
      altText: "Cylinder roll-on on natural stone",
      isBestBottlesOrg: true,
    });
    assert.deepEqual(withTarget, { ok: true, errors: [] });
  });

  it("requires family and role metadata where placement fields need them", () => {
    const component = validateSanityPlacementForm({
      destinationKey: "paper_doll_component",
      altText: "Cap",
      familySlug: "",
      role: "",
      isBestBottlesOrg: true,
    });

    assert.equal(component.ok, false);
    assert.match(component.errors.join(" "), /Family slug/);
    assert.match(component.errors.join(" "), /Component role/);
  });

  it("requires Best Bottles SKU truth for product main image placement", () => {
    const result = validateSanityPlacementForm({
      destinationKey: "product_main_image",
      altText: "PDP master",
      websiteSku: "",
      graceSku: "",
      isBestBottlesOrg: true,
    });

    assert.equal(result.ok, false);
    assert.match(result.errors.join(" "), /Website SKU/);
    assert.match(result.errors.join(" "), /Grace SKU/);
  });

  it("builds trimmed metadata with the picked target's keys winning", () => {
    const metadata = buildSanityPlacementMetadata({
      destinationKey: "product_family_hero",
      target: {
        label: "Cylinder · Cylinder",
        metadata: { cardKey: "c-9", familySlug: "Cylinder" },
      },
      altText: "  Cylinder family  ",
      caption: "",
      familySlug: "cylinder-9ml-clear-from-tags",
      generatedImageId: "img-1",
    });

    assert.deepEqual(metadata, {
      altText: "Cylinder family",
      familySlug: "Cylinder",
      generatedImageId: "img-1",
      cardKey: "c-9",
      targetLabel: "Cylinder · Cylinder",
    });
  });
});
