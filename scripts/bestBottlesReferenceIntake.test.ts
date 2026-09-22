import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import {
  buildReferenceIntakeUpdatePayload,
  buildRowsFromCliInputs,
  buildReferenceIntakePlan,
  defaultReferenceLocalRoots,
  deriveReferenceCoverageStatus,
  isMissingReferenceMetadataColumn,
  selectReferenceIntakeApplyRows,
  sourceForPath,
  sourceReferenceRowsWithFirecrawl,
  summarizeReferenceIntake,
  type ReferenceIntakeSkuRow,
} from "./bestBottlesReferenceIntake.ts";

function sku(overrides: Partial<ReferenceIntakeSkuRow>): ReferenceIntakeSkuRow {
  return {
    graceSku: "GB-BSR-CLR-30ML-BLK-S",
    websiteSku: "GBBstn1ozBlkCapSht",
    shopifySku: null,
    family: "Boston Round",
    productGroupSlug: "boston-round-30-clear-screw-cap",
    productGroupDisplayName: "Boston Round 30 ml",
    status: "needs-reference",
    hasReference: false,
    bestReferenceCandidatePath: null,
    coverageStatus: "missing_local_reference_image",
    liveReferenceUrl: null,
    ...overrides,
  };
}

describe("Best Bottles clean-lane cutover (coverage derivation + classification)", () => {
  it("classifies clean, flattened product truth, and legacy reference lanes distinctly", () => {
    assert.equal(
      sourceForPath(
        "/x/pipeline/best-bottles-reference-images-clean/01-transparent-png-candidates/_dryrun-2026-06-21/GB-CYL-CLR-50ML-RDC-WHT.png",
      ),
      "canonical-render",
    );
    assert.equal(
      sourceForPath("/x/pipeline/madison-hero-sync/renders/GB-CYL-CLR-50ML-RDC-WHT.png"),
      "local-legacy",
    );
    assert.equal(
      sourceForPath("/x/pipeline/aios-shopify-pdp-images/00-input/reference-flattened/foo.png"),
      "flattened-product-truth",
    );
  });

  it("flips coverage to covered_canonical only on a clean canonical match, else preserves state", () => {
    assert.equal(deriveReferenceCoverageStatus("canonical-render", "covered_needs_canonical_copy"), "covered_canonical");
    assert.equal(deriveReferenceCoverageStatus("canonical-render", "missing_local_reference_image"), "covered_canonical");
    // a legacy/opaque match keeps "needs canonical copy"; never auto-promoted
    assert.equal(deriveReferenceCoverageStatus("local-legacy", "covered_needs_canonical_copy"), "covered_needs_canonical_copy");
    assert.equal(
      deriveReferenceCoverageStatus("flattened-product-truth", "covered_needs_canonical_copy"),
      "covered_needs_canonical_copy",
    );
    // website-only / no match preserve the incoming state (no demotion either)
    assert.equal(deriveReferenceCoverageStatus("bestbottles-live", "missing_local_reference_image"), "missing_local_reference_image");
    assert.equal(deriveReferenceCoverageStatus("none", "covered_needs_canonical_copy"), "covered_needs_canonical_copy");
    assert.equal(deriveReferenceCoverageStatus(null, null), null);
  });
});

describe("Best Bottles reference intake planner", () => {
  it("includes flattened Best Bottles repo references in the default local roots", () => {
    assert(
      defaultReferenceLocalRoots().some((root) =>
        root.endsWith("pipeline/aios-shopify-pdp-images/00-input/reference-flattened"),
      ),
      "default local roots should include reference-flattened product/component references",
    );
  });

  it("matches missing-reference SKUs to local legacy files by Grace SKU before website SKU", () => {
    const root = mkdtempSync(join(tmpdir(), "bb-ref-intake-"));
    mkdirSync(join(root, "legacy-products", "images"), { recursive: true });
    mkdirSync(join(root, "boston-round", "madison-upload-website-sku-png"), { recursive: true });
    const weakerWebsiteMatch = join(
      root,
      "legacy-products",
      "images",
      "SOME-OTHER-GRACE__GBBstn1ozBlkCapSht__legacy-reference__v001.gif",
    );
    const strongerGraceMatch = join(
      root,
      "boston-round",
      "madison-upload-website-sku-png",
      "GBBstn1ozBlkCapSht__GB-BSR-CLR-30ML-BLK-S__legacy-reference__v001.png",
    );
    writeFileSync(weakerWebsiteMatch, "gif");
    writeFileSync(strongerGraceMatch, "png");

    const plan = buildReferenceIntakePlan({
      rows: [sku({})],
      localRoots: [root],
    });

    assert.equal(plan.rows.length, 1);
    assert.equal(plan.rows[0].referenceSource, "local-legacy");
    assert.equal(plan.rows[0].matchKind, "grace-sku");
    assert.equal(plan.rows[0].referenceSourcePath, strongerGraceMatch);
    assert.equal(plan.rows[0].referenceIssue, null);
  });

  it("accepts flattened Cylinder product-truth exports named by exact Grace SKU", () => {
    const root = mkdtempSync(join(tmpdir(), "bb-ref-intake-"));
    const flattened = join(root, "reference-flattened", "Cylinder", "GB-CYL-CLR-9ML-SPR-GLD.png");
    mkdirSync(join(flattened, ".."), { recursive: true });
    writeFileSync(flattened, "png");

    const plan = buildReferenceIntakePlan({
      rows: [
        sku({
          graceSku: "GB-CYL-CLR-9ML-SPR-GLD",
          websiteSku: "GB9MlGoldSprayer",
          family: "Cylinder",
          productGroupSlug: "cylinder-9ml-swirl-17-415-finemist",
          productGroupDisplayName: "Cylinder 9 ml Swirl 17-415 Fine Mist",
        }),
      ],
      localRoots: [root],
    });

    assert.equal(plan.rows[0].referenceSource, "flattened-product-truth");
    assert.equal(plan.rows[0].matchKind, "grace-sku");
    assert.equal(plan.rows[0].referenceSourcePath, flattened);
    assert.equal(plan.rows[0].referenceIssue, null);
    assert.equal(plan.rows[0].nextAction, "import-local-reference");
  });

  it("rejects retired Cylinder transparent clean-lane references during intake", () => {
    const root = mkdtempSync(join(tmpdir(), "bb-ref-intake-"));
    const transparent = join(
      root,
      "pipeline",
      "best-bottles-reference-images-clean",
      "01-transparent-png-candidates",
      "cylinder",
      "cylinder-9ml-swirl-17-415-finemist",
      "GB-CYL-CLR-9ML-SPR-GLD.png",
    );
    mkdirSync(join(transparent, ".."), { recursive: true });
    writeFileSync(transparent, "png");

    const plan = buildReferenceIntakePlan({
      rows: [
        sku({
          graceSku: "GB-CYL-CLR-9ML-SPR-GLD",
          websiteSku: "GB9MlGoldSprayer",
          family: "Cylinder",
          productGroupSlug: "cylinder-9ml-swirl-17-415-finemist",
          productGroupDisplayName: "Cylinder 9 ml Swirl 17-415 Fine Mist",
        }),
      ],
      localRoots: [root],
    });

    assert.equal(plan.rows[0].referenceSource, "none");
    assert.equal(plan.rows[0].referenceSourcePath, null);
    assert.equal(plan.rows[0].nextAction, "needs-source-match");
  });

  it("does not auto-bind duplicate website-SKU aliases for Cylinder references", () => {
    const root = mkdtempSync(join(tmpdir(), "bb-ref-intake-"));
    const first = join(root, "reference-flattened", "Cylinder", "GB9MlGoldSprayer__v001.png");
    const second = join(root, "reference-flattened", "Cylinder", "GB9MlGoldSprayer__v002.png");
    mkdirSync(join(first, ".."), { recursive: true });
    writeFileSync(first, "png");
    writeFileSync(second, "png");

    const plan = buildReferenceIntakePlan({
      rows: [
        sku({
          graceSku: "GB-CYL-CLR-9ML-SPR-GLD",
          websiteSku: "GB9MlGoldSprayer",
          family: "Cylinder",
          productGroupSlug: "cylinder-9ml-swirl-17-415-finemist",
          productGroupDisplayName: "Cylinder 9 ml Swirl 17-415 Fine Mist",
        }),
      ],
      localRoots: [root],
    });

    assert.equal(plan.rows[0].referenceSource, "none");
    assert.equal(plan.rows[0].matchKind, "none");
    assert.equal(plan.rows[0].nextAction, "needs-source-match");
  });

  it("flags GIF local matches for conversion/import instead of treating them as generation-ready", () => {
    const root = mkdtempSync(join(tmpdir(), "bb-ref-intake-"));
    mkdirSync(join(root, "legacy-products", "images"), { recursive: true });
    const gif = join(
      root,
      "legacy-products",
      "images",
      "GB-BSR-CLR-30ML-BLK-S__GBBstn1ozBlkCapSht__legacy-reference__v001.gif",
    );
    writeFileSync(gif, "gif");

    const plan = buildReferenceIntakePlan({
      rows: [sku({})],
      localRoots: [root],
    });

    assert.equal(plan.rows[0].referenceSource, "local-legacy");
    assert.equal(plan.rows[0].referenceSourcePath, gif);
    assert.match(plan.rows[0].referenceIssue ?? "", /unsupported/i);
    assert.equal(plan.rows[0].nextAction, "import-local-reference");
  });

  it("flips a clean-lane canonical match to covered_canonical and keeps it pending import", () => {
    const root = mkdtempSync(join(tmpdir(), "bb-ref-intake-"));
    const renderPath = join(
      root,
      "pipeline",
      "best-bottles-reference-images-clean",
      "01-transparent-png-candidates",
      "_dryrun-2026-06-21",
      "apothecary",
      "apothecary-30ml-glass-stopper",
      "cap-on",
      "GB-APT-GRN-30ML-GRN-T.png",
    );
    mkdirSync(join(renderPath, ".."), { recursive: true });
    writeFileSync(renderPath, "png");

    const plan = buildReferenceIntakePlan({
      rows: [
        sku({
          graceSku: "GB-APT-GRN-30ML-GRN-T",
          websiteSku: "GB1ozApthGreen",
          family: "Apothecary",
          productGroupSlug: "apothecary-30ml-green-Ground-glassapplicator",
          productGroupDisplayName: "30 ml Green Apothecary Applicator Bottle",
          status: "ready-to-generate",
          hasReference: true,
          bestReferenceCandidatePath:
            "pipeline/best-bottles-reference-images-clean/01-transparent-png-candidates/_dryrun-2026-06-21/apothecary/apothecary-30ml-glass-stopper/cap-on/GB-APT-GRN-30ML-GRN-T.png",
          coverageStatus: "covered_needs_canonical_copy",
        }),
      ],
      localRoots: [root],
    });

    assert.equal(plan.rows.length, 1);
    assert.equal(plan.rows[0].referenceSource, "canonical-render");
    assert.equal(plan.rows[0].referenceSourcePath, renderPath);
    // The cutover: a matched clean canonical reference promotes coverage.
    assert.equal(plan.rows[0].coverageStatus, "covered_canonical");
    assert.equal(plan.rows[0].nextAction, "import-local-reference");
  });

  it("excludes _quarantine / _qa-checker / _manifests scratch dirs from the reference scan", () => {
    const root = mkdtempSync(join(tmpdir(), "bb-ref-intake-"));
    const quarantined = join(
      root,
      "pipeline",
      "best-bottles-reference-images-clean",
      "01-transparent-png-candidates",
      "_quarantine",
      "GB-APT-GRN-30ML-GRN-T.png",
    );
    mkdirSync(join(quarantined, ".."), { recursive: true });
    writeFileSync(quarantined, "png");

    const plan = buildReferenceIntakePlan({
      rows: [
        sku({
          graceSku: "GB-APT-GRN-30ML-GRN-T",
          family: "Apothecary",
          status: "ready-to-generate",
          coverageStatus: "covered_needs_canonical_copy",
        }),
      ],
      localRoots: [root],
    });

    // The quarantined (rejected) cutout must NOT bind or promote coverage.
    assert.equal(plan.rows[0].referenceSource, "none");
    assert.equal(plan.rows[0].coverageStatus, "covered_needs_canonical_copy");
  });

  it("uses live bestbottles.com URLs as source candidates when local files are absent", () => {
    const plan = buildReferenceIntakePlan({
      rows: [
        sku({
          liveReferenceUrl: "https://www.bestbottles.com/images/store/enlarged_pics/GBBstn1ozBlkCapSht.gif",
        }),
      ],
      localRoots: [],
    });

    assert.equal(plan.rows[0].referenceSource, "bestbottles-live");
    assert.equal(
      plan.rows[0].referenceSourceUrl,
      "https://www.bestbottles.com/images/store/enlarged_pics/GBBstn1ozBlkCapSht.gif",
    );
    assert.equal(plan.rows[0].nextAction, "source-website-reference");
  });

  it("summarizes local, live, unresolved, and duplicate candidates", () => {
    const root = mkdtempSync(join(tmpdir(), "bb-ref-intake-"));
    writeFileSync(join(root, "GB-ONE__OneWeb__legacy-reference__v001.png"), "png");
    writeFileSync(join(root, "GB-ONE__OneWeb__legacy-reference__v002.png"), "png");

    const plan = buildReferenceIntakePlan({
      rows: [
        sku({ graceSku: "GB-ONE", websiteSku: "OneWeb" }),
        sku({ graceSku: "GB-TWO", websiteSku: "TwoWeb", liveReferenceUrl: "https://www.bestbottles.com/images/store/enlarged_pics/TwoWeb.gif" }),
        sku({ graceSku: "GB-THREE", websiteSku: "ThreeWeb" }),
      ],
      localRoots: [root],
    });
    const summary = summarizeReferenceIntake(plan.rows);

    assert.equal(summary.totalRows, 3);
    assert.equal(summary.localMatches, 1);
    assert.equal(summary.liveSiteCandidates, 1);
    assert.equal(summary.unresolved, 1);
    assert.equal(summary.duplicateCandidates, 1);
  });
});

describe("Best Bottles reference intake apply selection", () => {
  it("targets selected local and website fallback SKUs together", () => {
    const root = mkdtempSync(join(tmpdir(), "bb-ref-intake-"));
    writeFileSync(join(root, "GB-LOCAL__LocalWeb__legacy-reference__v001.png"), "png");
    const plan = buildReferenceIntakePlan({
      rows: [
        sku({ graceSku: "GB-LOCAL", websiteSku: "LocalWeb" }),
        sku({
          graceSku: "GB-WEBSITE",
          websiteSku: "WebsiteWeb",
          liveReferenceUrl: "https://www.bestbottles.com/images/store/enlarged_pics/WebsiteWeb.gif",
        }),
        sku({ graceSku: "GB-OTHER", websiteSku: "OtherWeb" }),
      ],
      localRoots: [root],
    });

    const rows = selectReferenceIntakeApplyRows(plan.rows, {
      skus: ["GB-LOCAL", "WebsiteWeb"],
      limit: 100,
    });

    assert.deepEqual(rows.map((row) => row.graceSku), ["GB-LOCAL", "GB-WEBSITE"]);
    assert.equal(rows[0].nextAction, "import-local-reference");
    assert.equal(rows[1].nextAction, "source-website-reference");
  });

  it("builds a mixed smoke sample with local and website fallback rows", () => {
    const root = mkdtempSync(join(tmpdir(), "bb-ref-intake-"));
    writeFileSync(join(root, "GB-LOCAL-ONE__LocalOne__legacy-reference__v001.png"), "png");
    writeFileSync(join(root, "GB-LOCAL-TWO__LocalTwo__legacy-reference__v001.png"), "png");
    const plan = buildReferenceIntakePlan({
      rows: [
        sku({ graceSku: "GB-LOCAL-ONE", websiteSku: "LocalOne" }),
        sku({ graceSku: "GB-LOCAL-TWO", websiteSku: "LocalTwo" }),
        sku({
          graceSku: "GB-WEBSITE-ONE",
          websiteSku: "WebsiteOne",
          liveReferenceUrl: "https://www.bestbottles.com/images/store/enlarged_pics/WebsiteOne.gif",
        }),
        sku({
          graceSku: "GB-WEBSITE-TWO",
          websiteSku: "WebsiteTwo",
          liveReferenceUrl: "https://www.bestbottles.com/images/store/enlarged_pics/WebsiteTwo.gif",
        }),
      ],
      localRoots: [root],
    });

    const rows = selectReferenceIntakeApplyRows(plan.rows, {
      sampleLocal: 1,
      sampleWebsite: 1,
      limit: 100,
    });

    assert.deepEqual(rows.map((row) => row.graceSku), ["GB-LOCAL-ONE", "GB-WEBSITE-ONE"]);
  });
});

describe("Best Bottles website fallback sourcing", () => {
  it("uses catalog bestbottles.com image URLs when no local reference is available", () => {
    const root = mkdtempSync(join(tmpdir(), "bb-ref-intake-cli-"));
    const readinessPath = join(root, "readiness.json");
    const pipelinePath = join(root, "pipeline.json");
    const catalogPath = join(root, "catalog.json");

    writeFileSync(
      readinessPath,
      JSON.stringify({
        rows: [
          {
            status: "needs-reference",
            graceSku: "AB-ALU-CLR-100ML-SPR-BLK",
            websiteSku: "Alu100mlSprayBlack",
            productGroupSlug: "aluminum-bottle-100ml-mixed-20-410",
            productGroupDisplayName: "100 ml Aluminum Bottle",
            family: "Aluminum Bottle",
            hasReference: false,
            bestReferenceCandidatePath: "",
            coverageStatus: "missing_local_reference_image",
          },
        ],
      }),
    );
    writeFileSync(
      pipelinePath,
      JSON.stringify({
        products: [
          {
            graceSku: "AB-ALU-CLR-100ML-SPR-BLK",
            websiteSku: "Alu100mlSprayBlack",
            shopifySku: "AB-ALU-CLR-100ML-SPR-BLK",
          },
        ],
      }),
    );
    writeFileSync(
      catalogPath,
      JSON.stringify({
        products: [
          {
            graceSku: "AB-ALU-CLR-100ML-SPR-BLK",
            websiteSku: "Alu100mlSprayBlack",
            imageUrl: "https://www.bestbottles.com/images/store/enlarged_pics/Alu100mlSprayBlack.gif",
          },
        ],
      }),
    );

    const rows = buildRowsFromCliInputs({
      readinessPath,
      pipelinePath,
      liveAuditPath: null,
      catalogPath,
    });
    const plan = buildReferenceIntakePlan({ rows, localRoots: [] });

    assert.equal(
      plan.rows[0].referenceSourceUrl,
      "https://www.bestbottles.com/images/store/enlarged_pics/Alu100mlSprayBlack.gif",
    );
    assert.equal(plan.rows[0].nextAction, "source-website-reference");
  });
});

describe("Best Bottles Firecrawl reference fallback", () => {
  it("promotes unresolved source-match rows when Firecrawl finds SKU-backed bestbottles.com image evidence", async () => {
    const result = await sourceReferenceRowsWithFirecrawl(
      [
        sku({
          graceSku: "GB-SOURCE-MATCH",
          websiteSku: "SourceMatchWeb",
          productUrl: "https://www.bestbottles.com/product/source-match-web",
        }),
      ],
      {
        scrapePage: async () => ({
          markdown:
            "Product page for SourceMatchWeb\n\n![SourceMatchWeb](https://www.bestbottles.com/images/store/enlarged_pics/SourceMatchWeb.gif)",
        }),
      },
    );

    const plan = buildReferenceIntakePlan({ rows: result.rows, localRoots: [] });

    assert.equal(result.summary.sourced, 1);
    assert.equal(
      plan.rows[0].referenceSourceUrl,
      "https://www.bestbottles.com/images/store/enlarged_pics/SourceMatchWeb.gif",
    );
    assert.equal(plan.rows[0].nextAction, "source-website-reference");
  });

  it("keeps Firecrawl image candidates unresolved when the scrape has no SKU evidence", async () => {
    const result = await sourceReferenceRowsWithFirecrawl(
      [
        sku({
          graceSku: "GB-SOURCE-MATCH",
          websiteSku: "SourceMatchWeb",
          productUrl: "https://www.bestbottles.com/product/source-match-web",
        }),
      ],
      {
        scrapePage: async () => ({
          markdown:
            "A visually similar bottle\n\n![Bottle](https://www.bestbottles.com/images/store/enlarged_pics/SomeOtherBottle.gif)",
        }),
      },
    );

    const plan = buildReferenceIntakePlan({ rows: result.rows, localRoots: [] });

    assert.equal(result.summary.sourced, 0);
    assert.equal(plan.rows[0].referenceSource, "none");
    assert.equal(plan.rows[0].nextAction, "needs-source-match");
  });

  it("can restrict Firecrawl fallback to explicit unresolved SKU keys", async () => {
    const result = await sourceReferenceRowsWithFirecrawl(
      [
        sku({
          graceSku: "GB-TARGET",
          websiteSku: "TargetWeb",
          productUrl: "https://www.bestbottles.com/product/target-web",
        }),
        sku({
          graceSku: "GB-SKIP",
          websiteSku: "SkipWeb",
          productUrl: "https://www.bestbottles.com/product/skip-web",
        }),
      ],
      {
        skuKeys: ["GB-TARGET"],
        scrapePage: async (_url, row) => ({
          markdown: `${row.websiteSku}\nhttps://www.bestbottles.com/images/store/enlarged_pics/${row.websiteSku}.gif`,
        }),
      },
    );

    assert.equal(result.summary.targeted, 1);
    assert.equal(result.summary.sourced, 1);
    assert.equal(result.rows[0].liveReferenceUrl, "https://www.bestbottles.com/images/store/enlarged_pics/TargetWeb.gif");
    assert.equal(result.rows[1].liveReferenceUrl, null);
  });
});

describe("Best Bottles reference intake database update payload", () => {
  it("recognizes PostgREST schema cache errors for missing reference metadata columns", () => {
    assert.equal(
      isMissingReferenceMetadataColumn({
        code: "PGRST204",
        message: "Could not find the 'reference_imported_at' column of 'best_bottles_pipeline_sku_jobs' in the schema cache",
      }),
      true,
    );
  });

  it("can omit reference metadata columns for live databases that have not migrated yet", () => {
    const row = {
      ...sku({
        graceSku: "AB-ALU-CLR-100ML-SPR-BLK",
        websiteSku: "Alu100mlSprayBlack",
        liveReferenceUrl: "https://www.bestbottles.com/images/store/enlarged_pics/Alu100mlSprayBlack.gif",
      }),
      referenceSource: "bestbottles-live" as const,
      referenceSourcePath: null,
      referenceSourceUrl: "https://www.bestbottles.com/images/store/enlarged_pics/Alu100mlSprayBlack.gif",
      referenceIssue: null,
      referenceImportedAt: null,
      matchKind: "none" as const,
      duplicateCandidateCount: 0,
      nextAction: "source-website-reference" as const,
    };

    const migrated = buildReferenceIntakeUpdatePayload({
      row,
      publicUrl: "https://storage.example/reference.png",
      existingStatus: "needs-reference",
      importedAt: "2026-06-15T12:00:00.000Z",
      includeMetadataColumns: true,
    });
    const legacy = buildReferenceIntakeUpdatePayload({
      row,
      publicUrl: "https://storage.example/reference.png",
      existingStatus: "needs-reference",
      importedAt: "2026-06-15T12:00:00.000Z",
      includeMetadataColumns: false,
    });

    assert.equal(migrated.reference_source, "bestbottles-live");
    assert.equal(migrated.reference_source_url, row.referenceSourceUrl);
    assert.equal(legacy.reference_source, undefined);
    assert.equal(legacy.reference_source_url, undefined);
    assert.equal(legacy.best_reference_candidate_path, "https://storage.example/reference.png");
    assert.equal(legacy.status, "ready-to-generate");
  });
});

describe("Task 3: cross-family flat-PNG intake and Cylinder generation budget", () => {
  it("builds an exact 47-target Cylinder storefront-group manifest from catalog productGroupIds", async () => {
    const {
      buildCylinderCanonicalStorefrontManifest,
      CYLINDER_CANONICAL_STOREFRONT_TARGET_COUNT,
    } = await import("./bestBottlesReferenceIntake.ts");
    const catalog = JSON.parse(
      readFileSync(new URL("../public/data/best-bottles-catalog-lite.json", import.meta.url), "utf8"),
    ) as { products: Array<Record<string, unknown>> };

    const manifest = buildCylinderCanonicalStorefrontManifest(catalog.products);

    assert.equal(manifest.sourceGroupCount, 51);
    assert.equal(manifest.excluded.length, 4);
    assert.equal(manifest.targets.length, CYLINDER_CANONICAL_STOREFRONT_TARGET_COUNT);
    assert.equal(CYLINDER_CANONICAL_STOREFRONT_TARGET_COUNT, 47);

    const reasons = manifest.excluded.map((row) => row.reason).sort();
    assert.deepEqual(reasons, [
      "duplicate-tall-cylinder-9ml-clear-13-415",
      "plastic-cylinder",
      "plastic-cylinder",
      "plastic-cylinder",
    ]);

    const ids = new Set(manifest.targets.map((row) => row.productGroupId));
    assert.equal(ids.size, 47);
    for (const target of manifest.targets) {
      assert.ok(target.representativeGraceSku);
      assert.ok(target.productGroupId);
    }
  });

  it("dedupes flat PNG sources by SHA while preserving family cohort assignments", async () => {
    const { dedupeFlatPngSourcesBySha } = await import("./bestBottlesReferenceIntake.ts");
    const rows = [
      {
        absolutePath: "/a/one.png",
        relativePath: "one.png",
        sourceSha256: "aa".repeat(32),
        family: "Cylinder",
        bodyIdentityKey: "cylinder|9|clear",
        physicalFitmentKey: "13-415|fine-mist-sprayer|matte-black|assembled-cap-on",
        productGroupId: "group-a",
        classificationStatus: "classified" as const,
        rejectionReason: null,
      },
      {
        absolutePath: "/b/dup.png",
        relativePath: "dup.png",
        sourceSha256: "aa".repeat(32),
        family: "Cylinder",
        bodyIdentityKey: "cylinder|9|clear",
        physicalFitmentKey: "13-415|fine-mist-sprayer|matte-black|assembled-cap-on",
        productGroupId: "group-a",
        classificationStatus: "classified" as const,
        rejectionReason: null,
      },
      {
        absolutePath: "/c/other.png",
        relativePath: "other.png",
        sourceSha256: "bb".repeat(32),
        family: "Boston Round",
        bodyIdentityKey: "boston-round|30|clear",
        physicalFitmentKey: "18-415|fine-mist-sprayer|shiny-gold|assembled-cap-on",
        productGroupId: "group-b",
        classificationStatus: "classified" as const,
        rejectionReason: null,
      },
    ];

    const deduped = dedupeFlatPngSourcesBySha(rows);
    assert.equal(deduped.unique.length, 2);
    assert.equal(deduped.duplicateCount, 1);
    assert.equal(deduped.unique[0]?.sourceSha256, "aa".repeat(32));
  });

  it("summarizes by-family loaded/classified/blocked and fails closed until every row is classified or rejected", async () => {
    const {
      summarizeFlatPngFamilyReadiness,
      assertFlatPngFamiliesReadyForBulkGeneration,
    } = await import("./bestBottlesReferenceIntake.ts");

    const readiness = summarizeFlatPngFamilyReadiness([
      {
        absolutePath: "/a.png",
        relativePath: "a.png",
        sourceSha256: "11".repeat(32),
        family: "Cylinder",
        bodyIdentityKey: "cylinder|5|clear",
        physicalFitmentKey: "13-415|cap-closure|white|assembled-cap-on",
        productGroupId: "g1",
        classificationStatus: "classified",
        rejectionReason: null,
      },
      {
        absolutePath: "/b.png",
        relativePath: "b.png",
        sourceSha256: "22".repeat(32),
        family: "Cylinder",
        bodyIdentityKey: null,
        physicalFitmentKey: null,
        productGroupId: null,
        classificationStatus: "unclassified",
        rejectionReason: null,
      },
      {
        absolutePath: "/c.png",
        relativePath: "c.png",
        sourceSha256: "33".repeat(32),
        family: "Boston Round",
        bodyIdentityKey: null,
        physicalFitmentKey: null,
        productGroupId: null,
        classificationStatus: "rejected",
        rejectionReason: "not-a-product-reference",
      },
    ]);

    const cylinder = readiness.byFamily.find((row) => row.family === "Cylinder");
    assert.ok(cylinder);
    assert.equal(cylinder.loaded, 2);
    assert.equal(cylinder.classified, 1);
    assert.equal(cylinder.blocked, 1);
    assert.equal(cylinder.rejected, 0);
    assert.equal(cylinder.ready, false);

    const boston = readiness.byFamily.find((row) => row.family === "Boston Round");
    assert.ok(boston);
    assert.equal(boston.ready, true);

    assert.equal(readiness.allReady, false);
    assert.throws(
      () => assertFlatPngFamiliesReadyForBulkGeneration(readiness),
      /blocked|unclassified|not ready/i,
    );

    const cleared = summarizeFlatPngFamilyReadiness([
      {
        absolutePath: "/a.png",
        relativePath: "a.png",
        sourceSha256: "11".repeat(32),
        family: "Cylinder",
        bodyIdentityKey: "cylinder|5|clear",
        physicalFitmentKey: "13-415|cap-closure|white|assembled-cap-on",
        productGroupId: "g1",
        classificationStatus: "classified",
        rejectionReason: null,
      },
      {
        absolutePath: "/b.png",
        relativePath: "b.png",
        sourceSha256: "22".repeat(32),
        family: "Cylinder",
        bodyIdentityKey: null,
        physicalFitmentKey: null,
        productGroupId: null,
        classificationStatus: "rejected",
        rejectionReason: "duplicate-opaque-legacy",
      },
    ]);
    assert.equal(cleared.allReady, true);
    assert.doesNotThrow(() => assertFlatPngFamiliesReadyForBulkGeneration(cleared));
  });

  it("reports missing flat-PNG intake roots clearly in dry-run without uploading", async () => {
    const { inspectReferenceLocalRoots } = await import("./bestBottlesReferenceIntake.ts");
    const missing = join(tmpdir(), `bb-missing-root-${Date.now()}`);
    const present = mkdtempSync(join(tmpdir(), "bb-present-root-"));
    const report = inspectReferenceLocalRoots([missing, present]);
    assert.equal(report.missingRoots.length, 1);
    assert.equal(report.missingRoots[0], resolve(missing));
    assert.equal(report.existingRoots.length, 1);
    assert.equal(report.existingRoots[0], resolve(present));
  });

  it("pins Cylinder generation budget to missing canonical storefront groups, not raw SKU count", async () => {
    const {
      buildCylinderCanonicalStorefrontManifest,
      computeCanonicalStorefrontGenerationBudget,
    } = await import("./bestBottlesReferenceIntake.ts");
    const catalog = JSON.parse(
      readFileSync(new URL("../public/data/best-bottles-catalog-lite.json", import.meta.url), "utf8"),
    ) as { products: Array<Record<string, unknown>> };
    const manifest = buildCylinderCanonicalStorefrontManifest(catalog.products);
    const alreadyGenerated = new Set(manifest.targets.slice(0, 10).map((t) => t.productGroupId));
    const budget = computeCanonicalStorefrontGenerationBudget(manifest, alreadyGenerated);
    assert.equal(budget.totalTargets, 47);
    assert.equal(budget.missingRepresentatives, 37);
    assert.notEqual(budget.missingRepresentatives, catalog.products.filter((p) => {
      const family = String(p.family ?? "");
      return family === "Cylinder" || family === "Tall Cylinder";
    }).length);
  });
});
