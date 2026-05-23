import assert from "node:assert/strict";
import { resolveBestBottlesVisualIdentity, validateBestBottlesImageIdentity } from "../src/lib/bestBottlesVisualIdentity";

const fixtures = [
  ["GB-DVA-CLR-46ML-SPR-SGLD", "GBDiva46SpryShnGl", "Shiny Gold", "perfume-spray"],
  ["GB-DVA-CLR-46ML-SPR-SBLK", "GBDiva46SpryShnBlk", "Shiny Black", "perfume-spray"],
  ["GB-DVA-CLR-46ML-SPR-SSLV", "GBDiva46SpryShnSl", "Shiny Silver", "perfume-spray"],
  ["GB-DVA-CLR-46ML-ASP-BLK", "GBDiva46AnSpBlk", "Black", "antique-bulb-sprayer"],
  ["GB-DVA-CLR-46ML-ASP-WHT", "GBDiva46AnSpWht", "White", "antique-bulb-sprayer"],
  ["GB-DVA-CLR-46ML-ASP-MSLV", "GBDiva46AnSpMtSl", "Matte Silver", "antique-bulb-sprayer"],
  ["GB-DVA-CLR-46ML-T-03", "GBDiva46AnSpLvn", "Lavender", "antique-bulb-sprayer"],
  ["GB-DVA-CLR-46ML-T-11", "GBDiva46AnSpWhtRng", "White", "antique-bulb-sprayer"],
  ["GB-DVA-CLR-46ML-T-08", "GBDiva46AnSpTslLvnRng", "Lavender", "antique-bulb-sprayer-tassel"],
  ["GB-DVA-CLR-46ML-T-39", "GBDivaFrst46RdcrShnGl", "Shiny Gold", "closure"],
  ["GB-DVA-CLR-46ML-T-40", "GBDivaFrst46RdcrShnSl", "Shiny Silver", "closure"],
  ["GB-DVA-CLR-46ML-T-30", "GBDivaFrst46RdcrBlkLthr", "Black Leather", "closure"],
] as const;

for (const [graceSku, websiteSku, expectedIdentity, expectedType] of fixtures) {
  const result = resolveBestBottlesVisualIdentity({
    graceSku,
    websiteSku,
    family: "Diva",
    category: "Glass Bottle",
    color: "Clear",
    applicator: websiteSku.includes("AnSpTsl")
      ? "Vintage Bulb Sprayer with Tassel"
      : websiteSku.includes("AnSp")
        ? "Vintage Bulb Sprayer"
        : websiteSku.includes("Rdcr")
          ? "Reducer"
          : "Perfume Spray",
    capColor: "Clear",
    itemName: `${websiteSku} clear glass bottle`,
  });

  assert.equal(result.productApplicatorType, expectedType, `${graceSku} product type`);
  assert.equal(result.resolvedVisualIdentity, expectedIdentity, `${graceSku} visual identity`);
  assert.equal(result.safeToPush, true, `${graceSku} safeToPush`);
  assert.equal(validateBestBottlesImageIdentity(expectedIdentity, { graceSku, websiteSku }).ok, true, `${graceSku} validation`);
}

const mismatch = validateBestBottlesImageIdentity("Black", {
  graceSku: "GB-DVA-CLR-46ML-SPR-SGLD",
  websiteSku: "GBDiva46SpryShnGl",
  applicator: "Perfume Spray",
});
assert.equal(mismatch.ok, false, "black image must not pass a shiny gold spray SKU");

const clearTrap = resolveBestBottlesVisualIdentity({
  graceSku: "GB-DVA-CLR-46ML-T-03",
  websiteSku: "GBDiva46AnSpLvn",
  color: "Clear",
  capColor: "Clear",
  applicator: "Vintage Bulb Sprayer",
  itemName: "Diva clear glass bottle with lavender vintage style bulb sprayer",
});
assert.equal(clearTrap.resolvedVisualIdentity, "Lavender", "antique sprayer must not resolve to Clear");

console.log(`Best Bottles visual identity resolver: ${fixtures.length + 2} checks passed`);
