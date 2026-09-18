import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BEST_BOTTLES_CATALOG_HERO_DEFAULT_FAMILY,
  BEST_BOTTLES_CATALOG_HERO_LANE_TAG,
  BEST_BOTTLES_CATALOG_HERO_LINEAGE_TAG,
  buildBestBottlesCatalogHeroLibraryTags,
  catalogHeroCapStateForPreset,
  getCatalogHeroLibraryPreset,
  isBestBottlesCatalogHeroLibraryImage,
  isBestBottlesCatalogHeroPresetId,
} from "./bestBottlesCatalogHeroLibrary.ts";

describe("Best Bottles catalog-hero library stack", () => {
  it("recognizes only the two catalog-grid presets", () => {
    assert.equal(isBestBottlesCatalogHeroPresetId("grid-card-2000x2200"), true);
    assert.equal(isBestBottlesCatalogHeroPresetId("grid-card-exploded-2000x2200"), true);
    assert.equal(isBestBottlesCatalogHeroPresetId("master-marketing-2080x2288"), false);
    assert.equal(isBestBottlesCatalogHeroPresetId("master-scene-flexible-2000x2200"), false);
  });

  it("maps cap-off sidecar and cap-on assembled from the preset", () => {
    assert.equal(catalogHeroCapStateForPreset("grid-card-exploded-2000x2200"), "sidecar");
    assert.equal(catalogHeroCapStateForPreset("grid-card-2000x2200"), "assembled");
  });

  it("writes the same lane tags for every family", () => {
    assert.deepEqual(
      buildBestBottlesCatalogHeroLibraryTags({
        presetId: "grid-card-exploded-2000x2200",
        scaleCardVersion: "best-bottles-scale-card-v2-2026-09-18",
      }),
      [
        BEST_BOTTLES_CATALOG_HERO_LANE_TAG,
        BEST_BOTTLES_CATALOG_HERO_LINEAGE_TAG,
        "cap-state:sidecar",
        "scale-card:best-bottles-scale-card-v2-2026-09-18",
      ],
    );
    assert.deepEqual(
      buildBestBottlesCatalogHeroLibraryTags({
        presetId: "grid-card-2000x2200",
      }),
      [
        BEST_BOTTLES_CATALOG_HERO_LANE_TAG,
        BEST_BOTTLES_CATALOG_HERO_LINEAGE_TAG,
        "cap-state:assembled",
      ],
    );
    assert.deepEqual(
      buildBestBottlesCatalogHeroLibraryTags({
        presetId: "master-marketing-2080x2288",
      }),
      [],
    );
  });

  it("matches new lane tags and already-generated studio grid-card masters", () => {
    assert.equal(
      isBestBottlesCatalogHeroLibraryImage([
        "brand:best-bottles",
        BEST_BOTTLES_CATALOG_HERO_LANE_TAG,
        "family:empire",
      ]),
      true,
    );
    assert.equal(
      isBestBottlesCatalogHeroLibraryImage([
        "brand:best-bottles",
        "studio-master",
        "preset:grid-card-exploded-2000x2200",
        "family:cylinder",
      ]),
      true,
    );
    assert.equal(
      isBestBottlesCatalogHeroLibraryImage([
        "brand:best-bottles",
        "studio-master",
        "preset:master-marketing-2080x2288",
      ]),
      false,
    );
    assert.equal(
      isBestBottlesCatalogHeroLibraryImage(["brand:best-bottles", "keeper-backfill-2026-06-12"]),
      false,
    );
  });

  it("opens on Cylinder and keeps the same stack for later families", () => {
    assert.deepEqual(getCatalogHeroLibraryPreset(), {
      assetType: "catalog-heroes",
      lineage: "all",
      family: BEST_BOTTLES_CATALOG_HERO_DEFAULT_FAMILY,
      skuSize: "all",
    });
    assert.deepEqual(getCatalogHeroLibraryPreset("Empire"), {
      assetType: "catalog-heroes",
      lineage: "all",
      family: "empire",
      skuSize: "all",
    });
  });
});
