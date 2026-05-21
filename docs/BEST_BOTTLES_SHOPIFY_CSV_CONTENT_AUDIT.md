# Best Bottles Shopify CSV Content Audit

Generated from: `/Users/jordanrichter/Downloads/products_export_1.csv`

## Executive Summary

- CSV rows parsed: 2336
- Unique products by handle: 345
- Variant rows: 2323
- Unique variant SKUs: 2322
- Product image rows: 136
- Duplicate variant SKUs: 0
- Google Shopping CSV columns present: 0

## Highest-Impact Gaps

- Missing Shopify standard product category: 342 / 345
- Missing SEO title: 345 / 345
- Missing SEO description: 345 / 345
- Missing or empty product description: 345 / 345
- Products with at least one missing image alt text: 1 / 345

## Core Field Completeness

| Field | Missing | Scope | Missing Share |
| --- | ---: | ---: | ---: |
| Handle | 0 | 345 | 0.0% |
| Title | 0 | 345 | 0.0% |
| Vendor | 0 | 345 | 0.0% |
| Product Category | 342 | 345 | 99.1% |
| Type | 1 | 345 | 0.3% |
| Tags | 2 | 345 | 0.6% |
| Published | 0 | 345 | 0.0% |
| Status | 0 | 345 | 0.0% |
| Variant SKU | 1 | 2323 | 0.0% |
| Variant Price | 0 | 2323 | 0.0% |
| Variant Requires Shipping | 0 | 2323 | 0.0% |
| Variant Taxable | 0 | 2323 | 0.0% |
| Variant Fulfillment Service | 0 | 2323 | 0.0% |
| Variant Inventory Policy | 0 | 2323 | 0.0% |
| Image Src | 328 | 345 | 95.1% |
| Image Alt Text | 1 | 136 | 0.7% |
| Body (HTML) | 345 | 345 | 100.0% |
| SEO Title | 345 | 345 | 100.0% |
| SEO Description | 345 | 345 | 100.0% |

## Issue Counts

| Issue | Products | Share |
| --- | ---: | ---: |
| missing_body_html | 345 | 100.0% |
| missing_seo_title | 345 | 100.0% |
| missing_seo_description | 345 | 100.0% |
| missing_bottle_family_metafield | 345 | 100.0% |
| missing_capacity_ml_metafield | 345 | 100.0% |
| missing_neck_thread_metafield | 345 | 100.0% |
| missing_height_metafield | 345 | 100.0% |
| missing_diameter_metafield | 345 | 100.0% |
| missing_shopify_product_category | 342 | 99.1% |
| missing_product_image | 328 | 95.1% |
| image_alt_text_over_125 | 16 | 4.6% |
| missing_tags | 2 | 0.6% |
| missing_product_type | 1 | 0.3% |
| missing_image_alt_text | 1 | 0.3% |
| missing_variant_sku | 1 | 0.3% |
| zero_or_invalid_variant_price | 1 | 0.3% |

## Family Hotspots

| Type / Family | Products | Total Issues | SEO Missing | Category Missing |
| --- | ---: | ---: | ---: | ---: |
| Cylinder | 48 | 480 | 48 | 48 |
| Elegant | 33 | 330 | 33 | 33 |
| Circle | 27 | 270 | 27 | 27 |
| Boston Round | 23 | 230 | 23 | 23 |
| Diva | 21 | 210 | 21 | 21 |
| Round | 21 | 210 | 21 | 21 |
| Sleek | 21 | 210 | 21 | 21 |
| Slim | 15 | 150 | 15 | 15 |
| Decorative | 12 | 120 | 12 | 12 |
| Empire | 11 | 110 | 11 | 11 |
| Cap/Closure | 9 | 90 | 9 | 9 |
| Cream Jar | 9 | 90 | 9 | 9 |
| Vial | 9 | 90 | 9 | 9 |
| Rectangle | 7 | 70 | 7 | 7 |
| Sprayer | 7 | 70 | 7 | 7 |
| Roll-On Cap | 7 | 69 | 7 | 6 |
| Tulip | 6 | 60 | 6 | 6 |
| Aluminum Bottle | 5 | 50 | 5 | 5 |
| Apothecary | 5 | 50 | 5 | 5 |
| Diamond | 5 | 50 | 5 | 5 |

## Highest-Issue Products

| Handle | Title | Type | Issues | First Issues |
| --- | --- | --- | ---: | --- |
| webhook-test-draft-23-10-35 | Webhook test draft 23:10:35 (updated) | Internal | 12 | missing_body_html, missing_tags, missing_seo_title, missing_seo_description, missing_image_alt_text, missing_variant_sku |
| test-service | Test Service | Unknown | 11 | missing_body_html, missing_product_type, missing_tags, missing_seo_title, missing_seo_description, missing_product_image |
| aluminum-bottle-100ml-mixed-20-410 | 100 ml Aluminum Bottle Bottle with Cap | Aluminum Bottle | 10 | missing_body_html, missing_shopify_product_category, missing_seo_title, missing_seo_description, missing_product_image, missing_bottle_family_metafield |
| aluminum-bottle-120ml-mixed-20-410 | 120 ml Aluminum Bottle Bottle with Cap | Aluminum Bottle | 10 | missing_body_html, missing_shopify_product_category, missing_seo_title, missing_seo_description, missing_product_image, missing_bottle_family_metafield |
| aluminum-bottle-500ml-mixed-20-410 | 500 ml Aluminum Bottle Bottle with Cap | Aluminum Bottle | 10 | missing_body_html, missing_shopify_product_category, missing_seo_title, missing_seo_description, missing_product_image, missing_bottle_family_metafield |
| aluminum-bottle-65ml-mixed-20-410 | 65 ml Aluminum Bottle Bottle with Cap | Aluminum Bottle | 10 | missing_body_html, missing_shopify_product_category, missing_seo_title, missing_seo_description, missing_product_image, missing_bottle_family_metafield |
| apothecary-15ml-cobalt-blue-ground-glassapplicator | 15 ml Cobalt Blue Apothecary Applicator Bottle | Apothecary | 10 | missing_body_html, missing_shopify_product_category, missing_seo_title, missing_seo_description, missing_product_image, missing_bottle_family_metafield |
| apothecary-30ml-clear-ground-glassapplicator | 30 ml Clear Apothecary Applicator Bottle | Apothecary | 10 | missing_body_html, missing_shopify_product_category, missing_seo_title, missing_seo_description, missing_product_image, missing_bottle_family_metafield |
| apothecary-30ml-cobalt-blue-ground-glassapplicator | 30 ml Cobalt Blue Apothecary Applicator Bottle | Apothecary | 10 | missing_body_html, missing_shopify_product_category, missing_seo_title, missing_seo_description, missing_product_image, missing_bottle_family_metafield |
| apothecary-30ml-green-ground-glassapplicator | 30 ml Green Apothecary Applicator Bottle | Apothecary | 10 | missing_body_html, missing_shopify_product_category, missing_seo_title, missing_seo_description, missing_product_image, missing_bottle_family_metafield |
| atomizer-10ml | 10 ml Atomizer Bottle | Atomizer | 10 | missing_body_html, missing_shopify_product_category, missing_seo_title, missing_seo_description, missing_product_image, missing_bottle_family_metafield |
| atomizer-5ml | 5 ml Atomizer Bottle | Atomizer | 10 | missing_body_html, missing_shopify_product_category, missing_seo_title, missing_seo_description, missing_product_image, missing_bottle_family_metafield |
| bell-10ml-clear-13-415 | 10.0 ml Clear Bell Bottle with Cap | Bell | 10 | missing_body_html, missing_shopify_product_category, missing_seo_title, missing_seo_description, missing_product_image, missing_bottle_family_metafield |
| bell-10ml-clear-13-415-capclosure | 10 ml Clear Bell Bottle | Bell | 10 | missing_body_html, missing_shopify_product_category, missing_seo_title, missing_seo_description, missing_product_image, missing_bottle_family_metafield |
| bell-10ml-clear-13-415-finemist | 10 ml Clear Bell Fine Mist Spray Bottle | Bell | 10 | missing_body_html, missing_shopify_product_category, missing_seo_title, missing_seo_description, missing_product_image, missing_bottle_family_metafield |
| bell-10ml-clear-13-415-rollon | 10 ml Clear Bell Roll-On Bottle | Bell | 10 | missing_body_html, missing_shopify_product_category, missing_seo_title, missing_seo_description, missing_product_image, missing_bottle_family_metafield |
| boston-round-15ml-amber-18-400 | 15 ml Amber Boston Round Bottle with Cap | Boston Round | 10 | missing_body_html, missing_shopify_product_category, missing_seo_title, missing_seo_description, missing_product_image, missing_bottle_family_metafield |
| boston-round-15ml-amber-18-400-dropper | 15 ml Amber Boston Round Dropper Bottle | Boston Round | 10 | missing_body_html, missing_shopify_product_category, missing_seo_title, missing_seo_description, missing_product_image, missing_bottle_family_metafield |
| boston-round-15ml-clear-18-400 | 15 ml Clear Boston Round Bottle with Cap | Boston Round | 10 | missing_body_html, missing_shopify_product_category, missing_seo_title, missing_seo_description, missing_product_image, missing_bottle_family_metafield |
| boston-round-15ml-cobalt-blue-18-400 | 15 ml Cobalt Blue Boston Round Bottle with Cap | Boston Round | 10 | missing_body_html, missing_shopify_product_category, missing_seo_title, missing_seo_description, missing_product_image, missing_bottle_family_metafield |
| boston-round-15ml-cobalt-blue-18-400-dropper | 15 ml Cobalt Blue Boston Round Dropper Bottle | Boston Round | 10 | missing_body_html, missing_shopify_product_category, missing_seo_title, missing_seo_description, missing_product_image, missing_bottle_family_metafield |
| boston-round-30ml-amber-20-400 | 30 ml Amber Boston Round Bottle with Cap | Boston Round | 10 | missing_body_html, missing_shopify_product_category, missing_seo_title, missing_seo_description, missing_product_image, missing_bottle_family_metafield |
| boston-round-30ml-amber-20-400-dropper | 30 ml Amber Boston Round Dropper Bottle | Boston Round | 10 | missing_body_html, missing_shopify_product_category, missing_seo_title, missing_seo_description, missing_product_image, missing_bottle_family_metafield |
| boston-round-30ml-amber-20-400-rollon | 30 ml Amber Boston Round Roll-On Bottle | Boston Round | 10 | missing_body_html, missing_shopify_product_category, missing_seo_title, missing_seo_description, missing_product_image, missing_bottle_family_metafield |
| boston-round-30ml-clear-20-400 | 30 ml Clear Boston Round Bottle with Cap | Boston Round | 10 | missing_body_html, missing_shopify_product_category, missing_seo_title, missing_seo_description, missing_product_image, missing_bottle_family_metafield |

## Recommended Field Policy

### Shopify Import Safety

- Keep `Handle`, `Title`, `Option1 Name`, `Option1 Value`, `Variant SKU`, and `Variant Price` intact when updating variants.
- Do not edit option values unless you intend to recreate variant IDs.
- Keep the file UTF-8 encoded.

### SEO / AEO / GEO Product Content

- Fill `SEO Title` for every product, max 70 characters.
- Fill `SEO Description` for every product, max 320 characters.
- Fill `Body (HTML)` with product facts: material, capacity, shape/family, closure/applicator, thread, dimensions, case quantity, usage.
- Fill `Image Alt Text` for every product image, ideally 125 characters or fewer.
- Fill `Product Category` using Shopify Standard Product Taxonomy.
- Keep `Type`, bottle family, capacity, thread, height, diameter, and compatible-thread metafields populated for filtering, search, and answer-engine retrieval.

### Merchant / Feed Readiness

- If Google Merchant Center is driven by a feed/app outside this CSV, map SKU as item ID, product title, description, link, image link, availability, price, brand, item group ID, material, size/capacity, and product category there.
- If a CSV-driven Google Shopping app consumes Shopify export columns, add the app-supported `Google Shopping / ...` columns through Shopify/admin definitions rather than arbitrary extra columns.
