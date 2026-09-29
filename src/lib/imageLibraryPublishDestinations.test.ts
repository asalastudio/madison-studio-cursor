import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getDefaultImageLibraryPublishDestination,
  getImageLibraryPublishDestinations,
} from "./imageLibraryPublishDestinations";

describe("Image Library publish destinations", () => {
  it("shows only Shopify-backed Best Bottles destinations for Best Bottles orgs", () => {
    const destinations = getImageLibraryPublishDestinations(true);

    assert.deepEqual(destinations.map((destination) => destination.value), [
      "best-bottles-grid",
      "best-bottles-pdp",
    ]);
    assert.equal(
      destinations.some((destination) => destination.value === "tarife-sanity"),
      false,
    );
  });

  it("shows the Tarife Sanity destination only for Tarife orgs", () => {
    assert.deepEqual(
      getImageLibraryPublishDestinations(false, true).map((destination) =>
        destination.value
      ),
      ["tarife-sanity"],
    );
  });

  it("hides Best Bottles and Tarife destinations for other orgs", () => {
    assert.deepEqual(getImageLibraryPublishDestinations(false), []);
    assert.equal(
      getDefaultImageLibraryPublishDestination({ isBestBottlesOrg: false }),
      null,
    );
  });

  it("defaults Tarife orgs to the Sanity product destination", () => {
    assert.equal(
      getDefaultImageLibraryPublishDestination({
        isBestBottlesOrg: false,
        isTarifeOrg: true,
      }),
      "tarife-sanity",
    );
  });

  it("defaults Best Bottles publish to group hero when a product group is known", () => {
    assert.equal(
      getDefaultImageLibraryPublishDestination({
        isBestBottlesOrg: true,
        resolvedGroupSlug: "empire-50ml-clear",
        resolvedWebsiteSku: "GBEmp50RdcrShnGl",
      }),
      "best-bottles-grid",
    );
  });

  it("defaults Best Bottles publish to PDP media when only a variant SKU is known", () => {
    assert.equal(
      getDefaultImageLibraryPublishDestination({
        isBestBottlesOrg: true,
        resolvedGroupSlug: "",
        resolvedWebsiteSku: "GBEmp50RdcrShnGl",
      }),
      "best-bottles-pdp",
    );
  });
});
