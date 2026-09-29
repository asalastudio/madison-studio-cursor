import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  resolveBestBottlesHeroPresentation,
  resolveBestBottlesHeroReferenceRole,
} from "./bestBottlesHeroPresentation";

describe("Best Bottles hero presentation", () => {
  it("puts the dropper inside the bottle, whichever field names it", () => {
    for (const input of [
      { groupSlug: "slim-30ml-clear-18-415-dropper" },
      { applicator: "Dropper" },
      { applicator: "Glass Pipette" },
      { websiteSku: "GBSlm30DrpCu" },
      { websiteSku: "GBCyl25DrpGl" },
    ]) {
      assert.equal(resolveBestBottlesHeroPresentation(input), "assembled", JSON.stringify(input));
      assert.equal(resolveBestBottlesHeroReferenceRole(input), "identity-cap-on", JSON.stringify(input));
    }
  });

  it("keeps every other fitment on the detached sidecar", () => {
    for (const input of [
      { groupSlug: "slim-50ml-clear-18-415-perfumespray", applicator: "Fine Mist Sprayer", websiteSku: "GBSlm50SpryMtGl" },
      { groupSlug: "slim-50ml-clear-18-415-lotionpump", applicator: "Lotion Pump", websiteSku: "LBSlm50LtnMtGl" },
      { groupSlug: "slim-50ml-clear-18-415-reducer", applicator: "Reducer", websiteSku: "GBSlm50RdcrShnGl" },
      { groupSlug: "cylinder-9ml-clear-17-415-rollon", applicator: "Metal Roller Ball", websiteSku: "GBCyl9MtlRollBlkDot" },
      {},
    ]) {
      assert.equal(resolveBestBottlesHeroPresentation(input), "detached-sidecar", JSON.stringify(input));
      assert.equal(resolveBestBottlesHeroReferenceRole(input), "pdp-cap-off-sidecar", JSON.stringify(input));
    }
  });

  it("does not mistake a lookalike for a dropper", () => {
    // "Drp" must be its own SKU segment, and "dropper" its own slug segment.
    assert.equal(resolveBestBottlesHeroPresentation({ websiteSku: "GBDrpsyGl" }), "detached-sidecar");
    assert.equal(resolveBestBottlesHeroPresentation({ groupSlug: "eyedropper-case-18-415-cap" }), "detached-sidecar");
  });
});
