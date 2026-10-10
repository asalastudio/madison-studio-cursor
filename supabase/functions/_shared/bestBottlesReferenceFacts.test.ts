import assert from "node:assert/strict";
import test from "node:test";

import {
  buildReferenceProductFactsBlock,
  capacityMlFromSku,
  factsFromLibraryTags,
  FITTED_CLOSURE_LINE,
  graceSkuFromText,
  mergeFacts,
  referenceShowsLooseCap,
  relativeSizeLine,
  UPRIGHT_NO_OVERLAP_LINE,
} from "./bestBottlesReferenceFacts.ts";

const BSR_URL =
  "https://x.supabase.co/storage/v1/object/public/generated-images/o/u/family-batch/boston-round-2026/rigged/GB-BSR-CLR-60ML-RBL-MGLD__rigged.png";

test("SKU and capacity come from rigged reference filenames", () => {
  assert.equal(graceSkuFromText(BSR_URL), "GB-BSR-CLR-60ML-RBL-MGLD");
  assert.equal(graceSkuFromText("…/GB-SLK-CLR-5ML-MRL-MGLD__rigged.png"), "GB-SLK-CLR-5ML-MRL-MGLD");
  assert.equal(graceSkuFromText("https://x/y/master_corrected_1.png"), null);
  assert.equal(capacityMlFromSku("GB-DVA-CLR-100ML-SPR-MGLD"), 100);
});

test("library tags give topology, closure, glass body and scale", () => {
  const f = factsFromLibraryTags([
    "sku:GB-BSR-CLR-60ML-RBL-MGLD",
    "component-topology:fitment-attached-cap-right-sidecar",
    "prompt-closure:metal_roller_ball",
    "glass-body:boston-round:60-standard",
    "scale-body-target-px:1190",
    "family:boston-round",
  ]);
  assert.equal(f.capacityMl, 60);
  assert.equal(f.glassBody, "boston-round:60-standard");
  assert.equal(f.bodyTargetPx, 1190);
  assert.equal(f.closure, "metal roller ball");
  assert.ok(referenceShowsLooseCap(mergeFacts(f)));
});

test("composite block: capacities, relative size, fitted closure, upright no overlap", () => {
  const facts = [
    mergeFacts({ sku: "GB-SLK-CLR-5ML-MRL-MGLD", displayName: "5 ml Clear Sleek Roll-On Bottle", applicator: "Metal Roller Ball" }),
    mergeFacts({ sku: "GB-DVA-CLR-100ML-SPR-MGLD", displayName: "100 ml Clear Diva Bottle", applicator: "Perfume Spray Pump" }),
    mergeFacts({ sku: "GB-BSR-CLR-60ML-RBL-MGLD", displayName: "60 ml Clear Boston Round Roll-On Bottle" }),
  ];
  const block = buildReferenceProductFactsBlock(facts, { brandBestBottles: true });
  assert.match(block, /Product 1: 5 ml Clear Sleek Roll-On Bottle \(applicator: Metal Roller Ball\) \[GB-SLK-CLR-5ML-MRL-MGLD\]/);
  assert.match(block, /Product 1 \(5 ml\) < Product 3 \(60 ml\) < Product 2 \(100 ml\)/);
  assert.ok(block.includes(FITTED_CLOSURE_LINE));
  assert.ok(block.includes(UPRIGHT_NO_OVERLAP_LINE));
});

test("relative heights use the scale rig when every product has it", () => {
  const line = relativeSizeLine([mergeFacts({ sku: "a", bodyTargetPx: 595 }), mergeFacts({ sku: "b", bodyTargetPx: 1190 })]);
  assert.match(line!, /Product 1 glass body ≈ 50% of the tallest/);
});

test("single non-Best-Bottles product gets the closure line only for a loose-cap reference", () => {
  const plain = buildReferenceProductFactsBlock([mergeFacts({ sku: null, capacityMl: 30 })], { brandBestBottles: false });
  assert.ok(!plain.includes(FITTED_CLOSURE_LINE));
  assert.ok(!plain.includes(UPRIGHT_NO_OVERLAP_LINE));
  const loose = buildReferenceProductFactsBlock([mergeFacts({ sku: null, topology: "fitment-attached-cap-right-sidecar" })], { brandBestBottles: false });
  assert.ok(loose.includes(FITTED_CLOSURE_LINE));
});
