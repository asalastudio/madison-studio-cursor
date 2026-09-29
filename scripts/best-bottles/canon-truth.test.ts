import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { withCanonTruthGeometry } from "./canon-truth";

describe("withCanonTruthGeometry", () => {
  it("replaces a junk catalog width with the canonical one", () => {
    // Convex still says 78 mm for Sleek 100 ml glass that is 36 mm across.
    const product = withCanonTruthGeometry({
      graceSku: "GB-SLK-CLR-100ML-SPR-MGLD",
      heightWithoutCap: "149 ±1 mm",
      heightWithCap: "190 ±1 mm",
      diameter: "78 ±0.5 mm",
    });
    assert.equal(product.diameter, "36 mm");
    assert.equal(product.heightWithoutCap, "149 mm");
    assert.equal(product.heightWithCap, "190 mm");
    assert.equal(product.canonicalWidthAxisMm, 36);
    assert.equal(product.measurementSource, "best-bottles-canonical-truth-2026-07-12");
  });

  it("gives a flat flask its face width, not its depth", () => {
    const product = withCanonTruthGeometry({ graceSku: "GB-CIR-CLR-30ML-SPR-MGLD", diameter: "37 mm" });
    assert.equal(product.diameter, "60 mm");
  });

  it("keeps a row the truth sheet does not know", () => {
    const row = { graceSku: "NOT-A-REAL-SKU", heightWithoutCap: "50 mm", diameter: "20 mm" };
    assert.deepEqual(withCanonTruthGeometry(row), row);
  });
});
