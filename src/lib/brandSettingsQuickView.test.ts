import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { brandQuickViewFromOrganization } from "./brandSettingsQuickView.ts";

describe("brand settings stand in for a missing brand_dna row", () => {
  it("shows the saved palette and Luxury Goods industry", () => {
    const view = brandQuickViewFromOrganization({
      name: "Best Bottles",
      settings: {
        brand_studio: {
          industry: "luxury-goods",
          visual: { colors: ["#b8956a"] },
        },
      },
      brand_config: { industry: "luxury-goods" },
    });

    assert.equal(view?.colors.primary, "#b8956a");
    assert.equal(view?.tone, "Luxury Goods");
    assert.equal(view?.brandName, "Best Bottles");
  });

  it("stays empty when neither palette nor industry was saved", () => {
    assert.equal(brandQuickViewFromOrganization({ settings: {}, brand_config: {} }), null);
  });
});
