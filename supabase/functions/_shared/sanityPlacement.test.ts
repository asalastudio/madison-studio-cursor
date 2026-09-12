import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  bestBottlesProductTruthRule,
  buildImageField,
  buildPatchSet,
  buildSelectorParams,
  draftDocumentId,
  isSafeFieldPath,
  needsProfileSpecificDestination,
  normalizeDestinationKey,
  normalizeTargetList,
  publishedDocumentId,
  resolveTargetFieldPath,
  selectDestinationConfig,
  validatePlacementRequest,
} from "./sanityPlacement";

describe("sanity placement rules", () => {
  it("normalizes only known placement destinations", () => {
    assert.equal(normalizeDestinationKey("homepage-hero"), "homepage_hero");
    assert.equal(
      normalizeDestinationKey(" product family hero "),
      "product_family_hero",
    );
    assert.equal(normalizeDestinationKey("variant_pdp"), null);
  });

  it("prefers org/profile destination rows before global or generic fallbacks", () => {
    const selected = selectDestinationConfig(
      [
        {
          organization_id: null,
          destination_key: "homepage_hero",
          schema_profile: "generic",
          target_field_path: "heroImage",
        },
        {
          organization_id: null,
          destination_key: "homepage_hero",
          schema_profile: "best_bottles",
          target_field_path: "homeHero",
        },
        {
          organization_id: "org_1",
          destination_key: "homepage_hero",
          schema_profile: "best_bottles",
          target_field_path: "homepage.hero.image",
        },
      ],
      "homepage_hero",
      "best_bottles",
      "org_1",
    );

    assert.equal(selected?.target_field_path, "homepage.hero.image");
  });

  it("blocks non-generic schema profiles from using generic destination rows", () => {
    assert.equal(
      needsProfileSpecificDestination(
        {
          organization_id: null,
          destination_key: "homepage_hero",
          schema_profile: "generic",
        },
        "best_bottles",
      ),
      true,
    );
    assert.equal(
      needsProfileSpecificDestination(
        {
          organization_id: "org_1",
          destination_key: "homepage_hero",
          schema_profile: "best_bottles",
        },
        "best_bottles",
      ),
      false,
    );
  });

  it("defines Best Bottles product-truth metadata gates for product placements", () => {
    assert.deepEqual(bestBottlesProductTruthRule("product_main_image"), {
      requiredKeys: ["websiteSku", "graceSku"],
      skuScoped: true,
      familyScoped: false,
    });
    assert.deepEqual(bestBottlesProductTruthRule("product_family_hero"), {
      requiredKeys: ["familySlug"],
      skuScoped: false,
      familyScoped: true,
    });
    assert.equal(bestBottlesProductTruthRule("blog_post"), null);
  });

  it("requires image URL and destination metadata before publish", () => {
    const result = validatePlacementRequest(
      { imageUrl: "notaurl", metadata: { slug: "home" } },
      {
        destination_key: "homepage_hero",
        requires_image: true,
        required_metadata: ["documentId", "altText"],
      },
    );

    assert.equal(result.ok, false);
    assert.match(result.errors.join(" "), /imageUrl must be an http/);
    assert.match(result.errors.join(" "), /documentId/);
    assert.match(result.errors.join(" "), /altText/);
  });

  it("builds selector params from metadata and destination defaults", () => {
    const params = buildSelectorParams(
      {
        destination_key: "product_family_hero",
        sanity_document_type: "productFamily",
        selector_params: { familySlug: "slug", fixedType: "productFamily" },
      },
      {
        slug: "empire-50ml-clear",
        documentId: "family.empire-50ml-clear",
      },
    );

    assert.deepEqual(params, {
      documentType: "productFamily",
      documentId: "family.empire-50ml-clear",
      slug: "empire-50ml-clear",
      familySlug: "empire-50ml-clear",
      fixedType: "productFamily",
    });
  });

  it("builds a single Sanity image field patch", () => {
    const image = buildImageField("image-abc-1000x1300-png", {
      altText: "Bottle family hero",
      caption: "Approved Madison render",
    });

    assert.deepEqual(image, {
      _type: "image",
      asset: { _type: "reference", _ref: "image-abc-1000x1300-png" },
      alt: "Bottle family hero",
      caption: "Approved Madison render",
    });
    assert.deepEqual(buildPatchSet("heroImage", image), { heroImage: image });
  });
});

describe("keyed field paths and target lists", () => {
  it("accepts keyed array segments and rejects everything else", () => {
    assert.equal(isSafeFieldPath('heroSlides[_key=="k9x-1"].image'), true);
    assert.equal(isSafeFieldPath("megaMenuPanels.bottles.featuredImage"), true);
    assert.equal(isSafeFieldPath("heroSlides[0].image"), false);
    assert.equal(isSafeFieldPath('heroSlides[_key=="a"]"].image'), false);
    assert.equal(isSafeFieldPath("a..b"), false);
    assert.equal(isSafeFieldPath("heroSlides[_key==$slideKey].image"), false);
  });

  it("resolves a template from the picked target's metadata", () => {
    assert.deepEqual(
      resolveTargetFieldPath("heroSlides[_key==$slideKey].image", { slideKey: "k9x-1" }),
      { ok: true, path: 'heroSlides[_key=="k9x-1"].image' },
    );
    assert.deepEqual(
      resolveTargetFieldPath("megaMenuPanels.$panel.featuredImage", { panel: "closures" }),
      { ok: true, path: "megaMenuPanels.closures.featuredImage" },
    );
    assert.deepEqual(resolveTargetFieldPath("image", {}), { ok: true, path: "image" });
  });

  it("refuses missing or unsafe template values", () => {
    const missing = resolveTargetFieldPath("heroSlides[_key==$slideKey].image", {});
    assert.equal(missing.ok, false);
    assert.match(missing.ok ? "" : missing.error, /metadata\.slideKey is required/);

    const unsafe = resolveTargetFieldPath("heroSlides[_key==$slideKey].image", {
      slideKey: 'x"]||true',
    });
    assert.equal(unsafe.ok, false);

    const badPanel = resolveTargetFieldPath("megaMenuPanels.$panel.featuredImage", {
      panel: "bottles.evil",
    });
    assert.equal(badPanel.ok, false);
  });

  it("validates a templated destination path before publish", () => {
    const result = validatePlacementRequest(
      { imageUrl: "https://example.com/hero.png", metadata: { slideKey: "abc" } },
      {
        destination_key: "homepage_hero",
        required_metadata: ["slideKey"],
        target_field_path: "heroSlides[_key==$slideKey].image",
      },
    );
    assert.deepEqual(result, { ok: true, errors: [] });
  });

  it("derives draft and published ids without doubling prefixes", () => {
    assert.equal(draftDocumentId("abc"), "drafts.abc");
    assert.equal(draftDocumentId("drafts.abc"), "drafts.abc");
    assert.equal(publishedDocumentId("drafts.abc"), "abc");
  });

  it("normalizes a target list and drops entries with no metadata", () => {
    assert.deepEqual(
      normalizeTargetList([
        { label: "Beautifully Contained", metadata: { slideKey: "k1" }, hasImage: true },
        { metadata: { cardKey: "c2", familySlug: "Cylinder" } },
        { label: "no metadata" },
        "junk",
      ]),
      [
        { label: "Beautifully Contained", metadata: { slideKey: "k1" }, hasImage: true },
        { label: "c2 · Cylinder", metadata: { cardKey: "c2", familySlug: "Cylinder" }, hasImage: false },
      ],
    );
  });
});
