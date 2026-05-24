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
  ["GB-CIR-CLR-100ML-RDC-SBLK", "GBCrc100RdcrShnBlk", "Shiny Black", "closure"],
  ["GB-CYL-BLU-5ML-GLD-T", "GBCylBlu5Gl", "Shiny Gold", "closure"],
  ["GB-CYL-BLU-5ML-SLV-T", "GBCylBlu5Sl", "Shiny Silver", "closure"],
  ["GB-VIA-CLR-1ML-BLK-T", "GB1mlVBlk", "Black", "vial"],
  ["GB-VIA-CLR-2ML-WHT-T", "GBVialClr2mlWhtCap", "White", "vial"],
  ["GB-VIA-AMB-1ML-WHT-T", "GB1mlAmbVialWht", "White", "vial"],
  ["GB-ATM-GLD-5ML", "GBAtom5Gl", "Gold", "metal-atomizer"],
  ["GB-ATM-BLU-5ML", "GBAtom5Blu", "Blue", "metal-atomizer"],
  ["GB-CYL-PNK-10ML-ATN", "GBCylPnk10Atm", "Pink", "metal-atomizer"],
] as const;

for (const [graceSku, websiteSku, expectedIdentity, expectedType] of fixtures) {
  const applicator = websiteSku.includes("AnSpTsl")
    ? "Vintage Bulb Sprayer with Tassel"
    : websiteSku.includes("AnSp")
      ? "Vintage Bulb Sprayer"
      : websiteSku.includes("Rdcr")
        ? "Reducer"
        : /^GB-VIA-/.test(graceSku)
          ? "Vial with Cap"
          : /Atom|ATN|ATM/i.test(`${graceSku} ${websiteSku}`)
            ? "Refillable metal shell perfume atomizer"
            : /-(?:GLD|SLV)-(?:T|S)$/.test(graceSku)
              ? "Cap/Closure"
              : "Perfume Spray";
  const result = resolveBestBottlesVisualIdentity({
    graceSku,
    websiteSku,
    family: "Diva",
    category: "Glass Bottle",
    color: "Clear",
    applicator,
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

const shortBlackCap = validateBestBottlesImageIdentity("Black", {
  graceSku: "GB-CIR-CLR-100ML-RDC-SBLK",
  websiteSku: "GBCrc100RdcrShnBlk",
  applicator: "Reducer",
  capStyle: "Short Cap",
});
assert.equal(shortBlackCap.ok, true, "plain black image selection should pass a shiny-black reducer/short-cap SKU");

const cobaltBlueTallGoldCap = validateBestBottlesImageIdentity("Shiny Gold", {
  graceSku: "GB-CYL-BLU-5ML-GLD-T",
  websiteSku: "GBCylBlu5Gl",
  family: "Cylinder",
  color: "Cobalt Blue",
});
assert.equal(cobaltBlueTallGoldCap.ok, true, "cobalt blue tall gold cap SKU should resolve without manual review");

const cobaltBlueWrongFinish = validateBestBottlesImageIdentity("Red", {
  graceSku: "GB-CYL-BLU-5ML-GLD-T",
  websiteSku: "GBCylBlu5Gl",
  family: "Cylinder",
  color: "Cobalt Blue",
});
assert.equal(cobaltBlueWrongFinish.ok, false, "red image selection should not pass a shiny-gold tall cap SKU");

const clearTrap = resolveBestBottlesVisualIdentity({
  graceSku: "GB-DVA-CLR-46ML-T-03",
  websiteSku: "GBDiva46AnSpLvn",
  color: "Clear",
  capColor: "Clear",
  applicator: "Vintage Bulb Sprayer",
  itemName: "Diva clear glass bottle with lavender vintage style bulb sprayer",
});
assert.equal(clearTrap.resolvedVisualIdentity, "Lavender", "antique sprayer must not resolve to Clear");

console.log(`Best Bottles visual identity resolver: ${fixtures.length + 4} checks passed`);
