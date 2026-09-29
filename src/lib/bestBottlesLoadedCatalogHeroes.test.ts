import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  resolveLoadedCatalogHeroMembership,
  resolveLoadedCatalogHeroes,
} from "./bestBottlesLoadedCatalogHeroes.ts";

describe("loaded catalog-hero working set", () => {
  it("uses scanned folder files as the selectable set across sizes", () => {
    const heroes = resolveLoadedCatalogHeroes({
      folderEntries: [
        { matchKey: "GB-CYL-CLR-9ML-ROL-BKDT", url: "https://img/9.png", name: "GB-CYL-CLR-9ML-ROL-BKDT.png" },
        { matchKey: "GB-CYL-CLR-5ML-SPR-SBLK", url: "https://img/5.png", name: "GB-CYL-CLR-5ML-SPR-SBLK.png" },
        { matchKey: "GB-CYL-CLR-5ML-SPR-SBLK--sidecar", url: "https://img/5b.png", name: "dup.png" },
        { matchKey: "UNKNOWN-SKU", url: "https://img/x.png", name: "unknown.png" },
      ],
      products: [
        {
          graceSku: "GB-CYL-CLR-9ML-ROL-BKDT",
          productGroupId: "group-9",
          family: "Cylinder",
          capacity: "9 ml",
          capacityMl: 9,
          heightWithoutCap: "70 mm",
          diameter: "16.6 mm",
          neckThreadSize: "17-415",
          applicator: "Roll-On",
        },
        {
          graceSku: "GB-CYL-CLR-5ML-SPR-SBLK",
          productGroupId: "group-5",
          family: "Cylinder",
          capacity: "5 ml",
          capacityMl: 5,
          heightWithoutCap: "48 mm",
          diameter: "16.6 mm",
          neckThreadSize: "13-415",
          applicator: "Fine Mist Sprayer",
        },
      ],
      productGroups: [
        { _id: "group-9", slug: "cylinder-9ml-clear-17-415-rollon" },
        { _id: "group-5", slug: "cylinder-5ml-clear-13-415-spray" },
      ],
    });

    assert.deepEqual(
      heroes.map((hero) => [hero.graceSku, hero.capacityLabel, hero.imageUrl]),
      [
        ["GB-CYL-CLR-5ML-SPR-SBLK", "5 ml", "https://img/5.png"],
        ["GB-CYL-CLR-9ML-ROL-BKDT", "9 ml", "https://img/9.png"],
      ],
    );
    assert.deepEqual(
      heroes.map((hero) => hero.productGroupSlug),
      [
        "cylinder-5ml-clear-13-415-spray",
        "cylinder-9ml-clear-17-415-rollon",
      ],
    );
    assert.ok(heroes.every((hero) => !hero.geometryKey.includes("unknown")));
    assert.ok(heroes.every((hero) => !hero.topologyKey.includes("unknown")));
  });

  it("fails closed when exact SKU membership is missing or conflicting", () => {
    const groups = [
      { _id: "group-9", slug: "cylinder-9ml-clear-17-415-rollon" },
      { _id: "group-5", slug: "cylinder-5ml-clear-13-415-spray" },
    ];

    assert.deepEqual(
      resolveLoadedCatalogHeroMembership(
        { graceSku: "GB-CYL-CLR-9ML-ROL-BKDT" },
        groups,
      ),
      {
        ok: false,
        reason:
          "SKU GB-CYL-CLR-9ML-ROL-BKDT has no exact product group membership.",
      },
    );
    const conflicting = resolveLoadedCatalogHeroMembership(
      {
        graceSku: "GB-CYL-CLR-9ML-ROL-BKDT",
        productGroupId: "group-9",
        productGroupSlug: "cylinder-5ml-clear-13-415-spray",
      },
      groups,
    );
    assert.equal(conflicting.ok, false);
    if (conflicting.ok) assert.fail("Expected conflicting membership");
    assert.match(conflicting.reason, /conflicting product group membership/i);
  });
});
