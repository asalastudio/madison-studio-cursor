# Best Bottles SKU Alignment Audit

Generated: 2026-05-20T20:42:56.700Z

## Rule Check

- `graceSku` is the internal generation identity and reference-image key.
- `websiteSku` is the legacy BestBottles item/page identity.
- `shopifySku` / commerce-facing SKU is not present in the current product exports, so values like `ALU 500` cannot be inferred safely from the existing Convex/product rows.
- Final canonical filenames are aligned: they include both `graceSku` and `websiteSku`.
- Source reference image paths are Grace-SKU keyed only; that is expected for matching references before final approval.

## Source Coverage

| Source | Rows | Key finding |
| --- | ---: | --- |
| Convex live products | 2483 | 4 missing websiteSku, 30 missing productId, 150 image URL stems differ from websiteSku |
| Product knowledge export | 2483 | 0 Shopify variant ids, Shopify SKU column present: no |
| Readiness report | 2483 | filenames missing Grace SKU: 0; filenames missing website SKU: 0 |
| Reference coverage | 2483 | 1732 have local reference image; filenames missing Grace/website SKU: 0/0 |
| Reference image index | 1724 | output paths missing Grace SKU: 0; output paths missing website SKU: 1724 |
| Rename plan | 1732 | canonical filenames missing Grace/website SKU: 0/0 |
| Legacy page crosswalk | 8 | explicit SKU labels: 0; item/SKU candidate matches websiteSku: 7 |

## 500 ml Aluminum Example

- websiteSku: `Alu500` · graceSku: `AB-ALU-CLR-500ML` · productId: `BB-AL-500-0001` · productUrl: https://www.bestbottles.com/product/Aluminum-Bottle-Can-white-cap-500ml

The current data supports `Alu500` and `AB-ALU-CLR-500ML`. It does not contain a separate commerce/display SKU such as `ALU 500`.
Legacy page fetch confirms the page candidate is `Alu500` from `item-name`.

## Exceptions

Wrote 284 sampled/typed exceptions to `tmp/best-bottles-sku-alignment-exceptions.csv`. The largest bucket is image URL stem mismatch; many of those are harmless because some URLs now point at generated hashes or legacy filename variants rather than exact websiteSku stems.

## Recommendation

Add an explicit commerce SKU field, preferably `shopifySku`, to the Convex product record and Madison pipeline SKU jobs. Populate it from a Shopify variant export/API sync, not from string heuristics. Then use SKU candidates in this order when pushing:

1. `shopifySku`
2. `websiteSku`
3. `graceSku`
4. `productId` as a last-resort diagnostic label only

This preserves the current image-generation rule while making Shopify matching deterministic.

## Source Paths

- convexLive: /Users/jordanrichter/Projects/Madison Studio/madison-app/tmp/best-bottles-convex-live-products.csv
- readiness: /Users/jordanrichter/Projects/Madison Studio/madison-app/tmp/best-bottles-generation-readiness.csv
- productKnowledge: /Users/jordanrichter/Projects/Clients/Nemat-International/Best-Bottles-Website-02-20-2026/outputs/product-knowledge-2026-05-14/best_bottles_product_knowledge_products_2026-05-14.csv
- productGroups: /Users/jordanrichter/Projects/Clients/Nemat-International/Best-Bottles-Website-02-20-2026/outputs/product-knowledge-2026-05-14/best_bottles_product_groups_2026-05-14.csv
- masterMeasurements: /Users/jordanrichter/Downloads/best-bottles-master-measurements (1).csv
- referenceCoverage: /Users/jordanrichter/Projects/Clients/Nemat-International/Best-Bottles-Website-02-20-2026/data/source-of-truth/best-bottles-image-control-center-2026-05-20/coverage-audits/convex_product_reference_coverage.csv
- referenceImageIndex: /Users/jordanrichter/Desktop/AI-OS/outputs/best-bottles-image-testing/2026-05-08/all-families-grace-sku-image-index.csv
- referenceRenamePlan: /Users/jordanrichter/Projects/Clients/Nemat-International/Best-Bottles-Website-02-20-2026/data/source-of-truth/best-bottles-image-control-center-2026-05-20/rename-plans/canonical_reference_rename_best_candidate_plan.csv
