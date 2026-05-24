export type BestBottlesVisualProduct = {
  graceSku?: string | null;
  websiteSku?: string | null;
  family?: string | null;
  category?: string | null;
  color?: string | null;
  applicator?: string | null;
  capStyle?: string | null;
  capColor?: string | null;
  trimColor?: string | null;
  itemName?: string | null;
  itemDescription?: string | null;
};

export type BestBottlesProductType =
  | "perfume-spray"
  | "antique-bulb-sprayer"
  | "antique-bulb-sprayer-tassel"
  | "closure"
  | "roll-on"
  | "lotion-pump"
  | "dropper"
  | "vial"
  | "metal-atomizer"
  | "jar"
  | "glass-only"
  | "unknown";

export type BestBottlesVisualIdentityResult = {
  graceSku: string;
  websiteSku: string;
  productFamily: string;
  productApplicatorType: BestBottlesProductType;
  resolvedVisualIdentity: string;
  resolvedVisualIdentityCanonical: string;
  secondaryVisualAttributes: string[];
  confidence: "high" | "medium" | "low";
  reason: string;
  blockingWarnings: string[];
  safeToPush: boolean;
};

type VisualToken = {
  pattern: RegExp;
  identity: string;
  reasonLabel: string;
};

export const BEST_BOTTLES_VISUAL_IDENTITY_OPTIONS = [
  "Clear",
  "Amber",
  "Cobalt Blue",
  "Blue",
  "Green",
  "Frosted",
  "Gold",
  "Matte Gold",
  "Shiny Gold",
  "Ivory + Gold",
  "Ivory + Silver",
  "Shiny Black",
  "Matte Black",
  "Matte Silver",
  "Shiny Silver",
  "Silver",
  "Copper",
  "Matte Copper",
  "Black",
  "White",
  "Pink",
  "Lavender",
  "Red",
  "Turquoise",
  "Brown Leather",
  "Light Brown Leather",
  "Ivory Leather",
  "Pink Leather",
  "Silver Dots",
  "Black Dots",
  "Metal Roller",
  "Plastic Roller",
  "Clear Overcap",
];

function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function textOf(product: BestBottlesVisualProduct | null | undefined): string {
  if (!product) return "";
  return [
    product.graceSku,
    product.websiteSku,
    product.family,
    product.category,
    product.color,
    product.applicator,
    product.capStyle,
    product.capColor,
    product.trimColor,
    product.itemName,
    product.itemDescription,
  ]
    .filter(Boolean)
    .join(" ");
}

export function canonicalBestBottlesVisualIdentity(value: string | null | undefined): string {
  const normalized = (value ?? "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\b(?:spray|screw cap|lotion pump|roller|dropper|atomizer|reducer|cap|collar|finish|with)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  if (normalized.includes("ivory") && normalized.includes("gold")) return "ivory gold";
  if (normalized.includes("ivory") && normalized.includes("silver")) return "ivory silver";
  if (normalized.includes("light brown leather")) return "light brown leather";
  if (normalized.includes("brown leather")) return "brown leather";
  if (normalized.includes("black leather")) return "black leather";
  if (normalized.includes("ivory leather")) return "ivory leather";
  if (normalized.includes("pink leather")) return "pink leather";
  if (normalized.includes("matte copper")) return "matte copper";
  if (normalized.includes("copper")) return "copper";
  if (normalized.includes("matte gold")) return "matte gold";
  if (normalized.includes("shiny gold")) return "shiny gold";
  if (normalized === "gold" || normalized.includes(" gold")) return "gold";
  if (normalized.includes("matte silver")) return "matte silver";
  if (normalized.includes("shiny silver")) return "shiny silver";
  if (normalized === "silver") return "shiny silver";
  if (normalized.includes("shiny black")) return "shiny black";
  if (normalized.includes("matte black")) return "matte black";
  if (normalized.includes("silver dots")) return "silver dots";
  if (normalized.includes("black dots")) return "black dots";
  if (normalized.includes("metal roller")) return "metal roller";
  if (normalized.includes("plastic roller")) return "plastic roller";
  if (normalized.includes("clear overcap")) return "clear overcap";
  if (normalized.includes("ivory")) return "ivory";
  if (normalized.includes("lavender")) return "lavender";
  if (normalized.includes("turquoise")) return "turquoise";
  if (normalized.includes("cobalt")) return "cobalt blue";
  if (normalized.includes("blue")) return "blue";
  if (normalized.includes("green")) return "green";
  if (normalized.includes("frosted")) return "frosted";
  if (normalized.includes("amber")) return "amber";
  if (normalized.includes("black")) return "black";
  if (normalized.includes("white")) return "white";
  if (normalized.includes("pink")) return "pink";
  if (normalized.includes("red")) return "red";
  if (normalized.includes("clear")) return "clear";
  return normalized;
}

export function displayBestBottlesVisualIdentity(value: string): string {
  const canonical = canonicalBestBottlesVisualIdentity(value);
  const found = BEST_BOTTLES_VISUAL_IDENTITY_OPTIONS.find(
    (option) => canonicalBestBottlesVisualIdentity(option) === canonical,
  );
  return found ?? value.replace(/\b\w/g, (char) => char.toUpperCase());
}

function bestBottlesVisualIdentitiesCompatible(
  expected: string,
  resolved: string,
  productType: BestBottlesProductType,
): boolean {
  if (expected === resolved) return true;
  const copperFamily = new Set(["copper", "matte copper"]);
  if (copperFamily.has(expected) && copperFamily.has(resolved)) return true;

  if (productType === "metal-atomizer") {
    const blueFamily = new Set(["blue", "cobalt blue"]);
    if (blueFamily.has(expected) && blueFamily.has(resolved)) return true;
  }

  const isClosureLike =
    productType === "closure" ||
    productType === "lotion-pump" ||
    productType === "dropper" ||
    productType === "vial";
  if (!isClosureLike) return false;

  const blackFamily = new Set(["black", "shiny black", "matte black"]);
  if (blackFamily.has(expected) && blackFamily.has(resolved)) return true;

  return false;
}

function classifyBestBottlesProduct(product: BestBottlesVisualProduct): BestBottlesProductType {
  const graceSku = clean(product.graceSku).toUpperCase();
  const websiteSku = clean(product.websiteSku);
  const text = textOf(product).toLowerCase();
  const legacyCapSku = /-(?:GLD|SLV|BLK|WHT)-(?:T|S)(?:-|$)/.test(graceSku);
  if (/-AST-/.test(graceSku) || /ansptsl/i.test(websiteSku) || /\btassel\b/.test(text)) return "antique-bulb-sprayer-tassel";
  if (/-ASP-/.test(graceSku) || /ansp/i.test(websiteSku) || /\b(?:antique|vintage|bulb)\b.*\bspray/.test(text)) return "antique-bulb-sprayer";
  if (/-SPR-/.test(graceSku) || /\b(?:perfume spray|fine mist|mist spray|collar sprayer)\b/.test(text) || /spry/i.test(websiteSku)) return "perfume-spray";
  if (/-LPM-|-PMP-/.test(graceSku) || /\b(?:lotion|treatment)\s+pump\b/.test(text)) return "lotion-pump";
  if (/-DRP-/.test(graceSku) || /\bdropper\b/.test(text)) return "dropper";
  if (/-ROL-|-MRL-|-RBL-/.test(graceSku) || /\b(?:roll-on|roller ball|metal roller)\b/.test(text)) return "roll-on";
  if (/-AT(?:M|N)(?:-|$)/.test(graceSku) || /atom/i.test(websiteSku) || /\b(?:atomizer|metal shell|travel atomizer)\b/.test(text)) return "metal-atomizer";
  if (/^GB-VIA-/.test(graceSku) || /vial/i.test(websiteSku) || /\bvial\b/.test(text)) return "vial";
  if (legacyCapSku || /-RDC-|-CAP-|-SHT-/.test(graceSku) || /\b(?:reducer|screw cap|short cap|tall cap|closure)\b/.test(text) || /rdcr|lthr|cap/i.test(websiteSku)) return "closure";
  if (/\bjar\b/.test(text)) return "jar";
  if (/\b(?:bottle|glass)\b/.test(text) && !/\b(?:spray|pump|dropper|roller|cap|closure|reducer|bulb|tassel)\b/.test(text)) return "glass-only";
  return "unknown";
}

function matchToken(text: string, tokens: VisualToken[]): VisualToken | null {
  return tokens.find((token) => token.pattern.test(text)) ?? null;
}

const SPRAY_FINISH_TOKENS: VisualToken[] = [
  { pattern: /(?:^|[-_])SGLD(?:$|[-_])|SHNGL|SHGL/i, identity: "Shiny Gold", reasonLabel: "SGLD/ShnGl" },
  { pattern: /(?:^|[-_])MGLD(?:$|[-_])|MTGL|MTGD/i, identity: "Matte Gold", reasonLabel: "MGLD/MtGl" },
  { pattern: /(?:^|[-_])SSLV(?:$|[-_])|SHNSL|SHSL/i, identity: "Shiny Silver", reasonLabel: "SSLV/ShnSl" },
  { pattern: /(?:^|[-_])MSLV(?:$|[-_])|MTSL/i, identity: "Matte Silver", reasonLabel: "MSLV/MtSl" },
  { pattern: /(?:^|[-_])SBLK(?:$|[-_])|SHNBLK|SHBK/i, identity: "Shiny Black", reasonLabel: "SBLK/ShnBlk" },
  { pattern: /(?:^|[-_])CPR(?:$|[-_])|CU\b|MTCP/i, identity: "Copper", reasonLabel: "CPR/Cu" },
  { pattern: /(?:^|[-_])WHT(?:$|[-_])|WHT|WHITE/i, identity: "White", reasonLabel: "WHT/Wht" },
  { pattern: /(?:^|[-_])BLK(?:$|[-_])|BLK|BLACK/i, identity: "Black", reasonLabel: "BLK/Blk" },
];

const ANTIQUE_BULB_TOKENS: VisualToken[] = [
  { pattern: /(?:^|[-_])IVSL(?:$|[-_])|IVYSL|IVSL/i, identity: "Ivory + Silver", reasonLabel: "IVSL/IvySl" },
  { pattern: /(?:^|[-_])IVGD(?:$|[-_])|IVYGL|GDIV|IVGL/i, identity: "Ivory + Gold", reasonLabel: "IVGD/IvyGl" },
  { pattern: /(?:^|[-_])MSLV(?:$|[-_])|MTSL/i, identity: "Matte Silver", reasonLabel: "MSLV/MtSl" },
  { pattern: /(?:^|[-_])LVN(?:$|[-_])|LVN|LAV/i, identity: "Lavender", reasonLabel: "LVN/Lvn" },
  { pattern: /(?:^|[-_])PNK(?:$|[-_])|PNK|PINK/i, identity: "Pink", reasonLabel: "PNK/Pnk" },
  { pattern: /(?:^|[-_])RED(?:$|[-_])|RED/i, identity: "Red", reasonLabel: "RED/Red" },
  { pattern: /(?:^|[-_])WHT(?:$|[-_])|WHT|WHITE/i, identity: "White", reasonLabel: "WHT/Wht" },
  { pattern: /(?:^|[-_])BLK(?:$|[-_])|BLK|BLACK/i, identity: "Black", reasonLabel: "BLK/Blk" },
  { pattern: /(?:^|[-_])GLD(?:$|[-_])|(?<!SHN)GL(?!D)|GOLD/i, identity: "Gold", reasonLabel: "GLD/Gl" },
];

const CLOSURE_TOKENS: VisualToken[] = [
  { pattern: /BKLT|BLKLTHR/i, identity: "Black Leather", reasonLabel: "BKLT/BlkLthr" },
  { pattern: /BRLT|BRWNLTHR/i, identity: "Brown Leather", reasonLabel: "BRLT/BrwnLthr" },
  { pattern: /IVLT|IVYLTHR/i, identity: "Ivory Leather", reasonLabel: "IVLT/IvyLthr" },
  { pattern: /PNKLTHR/i, identity: "Pink Leather", reasonLabel: "PnkLthr" },
  { pattern: /(?:^|[-_])GLD(?:$|[-_])|(?:CYL|CRC)[A-Z0-9]*GL$/i, identity: "Shiny Gold", reasonLabel: "GLD/Gl" },
  { pattern: /(?:^|[-_])SLV(?:$|[-_])|(?:CYL|CRC)[A-Z0-9]*SL$/i, identity: "Shiny Silver", reasonLabel: "SLV/Sl" },
  ...SPRAY_FINISH_TOKENS,
];

const ROLL_ON_TOKENS: VisualToken[] = [
  { pattern: /BLDOT|BLKDOT/i, identity: "Black Dots", reasonLabel: "BLDOT/BlkDot" },
  { pattern: /SLDOT|SLDOT/i, identity: "Silver Dots", reasonLabel: "SLDOT/SlDot" },
  ...SPRAY_FINISH_TOKENS,
];

const VIAL_CAP_TOKENS: VisualToken[] = [
  { pattern: /(?:^|[-_])BLK(?:$|[-_])|VBLK|BLACKCAP|BLKCAP|BLACK/i, identity: "Black", reasonLabel: "BLK/VBlk/BlackCap" },
  { pattern: /(?:^|[-_])WHT(?:$|[-_])|VWHT|WHTCAP|WHITE/i, identity: "White", reasonLabel: "WHT/VWht/WhtCap" },
  { pattern: /(?:^|[-_])GLD(?:$|[-_])|GOLDCAP/i, identity: "Shiny Gold", reasonLabel: "GLD/GoldCap" },
  { pattern: /(?:^|[-_])SLV(?:$|[-_])|SILVERCAP/i, identity: "Shiny Silver", reasonLabel: "SLV/SilverCap" },
];

const VIAL_GLASS_TOKENS: VisualToken[] = [
  { pattern: /(?:^|[-_])AMB(?:$|[-_])|AMBV|AMBER/i, identity: "Amber", reasonLabel: "AMB/Amber" },
  { pattern: /(?:^|[-_])BLU(?:$|[-_])|COBALT|BLUE/i, identity: "Cobalt Blue", reasonLabel: "BLU/Cobalt" },
  { pattern: /(?:^|[-_])CLR(?:$|[-_])|CLR|CLEAR/i, identity: "Clear", reasonLabel: "CLR/Clear" },
  { pattern: /(?:^|[-_])WHT(?:$|[-_])|WHITE/i, identity: "White", reasonLabel: "WHT/White" },
];

const METAL_ATOMIZER_TOKENS: VisualToken[] = [
  { pattern: /ATOM\d*GL\b|(?:^|[-_])GLD(?:$|[-_])|GOLD/i, identity: "Gold", reasonLabel: "AtomGl/GLD/Gold" },
  { pattern: /ATOM\d*BLU\b|(?:^|[-_])BLU(?:$|[-_])|COBALT|BLUE/i, identity: "Blue", reasonLabel: "AtomBlu/BLU/Blue" },
  { pattern: /ATOM\d*GRN\b|(?:^|[-_])GRN(?:$|[-_])|GREEN/i, identity: "Green", reasonLabel: "AtomGrn/GRN/Green" },
  { pattern: /ATOM\d*RED\b|(?:^|[-_])RED(?:$|[-_])|RED/i, identity: "Red", reasonLabel: "AtomRed/RED" },
  { pattern: /ATOM\d*PNK\b|(?:^|[-_])PNK(?:$|[-_])|PINK/i, identity: "Pink", reasonLabel: "AtomPnk/PNK/Pink" },
  { pattern: /ATOM\d*WHT\b|(?:^|[-_])WHT(?:$|[-_])|WHITE/i, identity: "White", reasonLabel: "AtomWht/WHT/White" },
  { pattern: /ATOM\d*BLK\b|(?:^|[-_])BLK(?:$|[-_])|BLACK/i, identity: "Black", reasonLabel: "AtomBlk/BLK/Black" },
  { pattern: /ATOM\d*SLV\b|(?:^|[-_])SLV(?:$|[-_])|SILVER/i, identity: "Shiny Silver", reasonLabel: "AtomSlv/SLV/Silver" },
  { pattern: /BLDOT|BLKDOT|DOTS/i, identity: "Black Dots", reasonLabel: "Dots/Dotted shell" },
];

function secondaryAttributesFor(product: BestBottlesVisualProduct, productType: BestBottlesProductType): string[] {
  const attrs = new Set<string>();
  const text = textOf(product);
  if (product.trimColor && productType !== "perfume-spray") attrs.add(`${product.trimColor} collar`);
  if (/ring/i.test(`${product.websiteSku ?? ""} ${text}`)) attrs.add("Ring");
  if (/tassel|tsl/i.test(`${product.websiteSku ?? ""} ${text}`)) attrs.add("Tassel");
  if (/overcap/i.test(text)) attrs.add("Overcap");
  if (/tall/i.test(text) || /-T(?:-|$)/i.test(clean(product.graceSku))) attrs.add("Tall cap");
  if (/short/i.test(text) || /-S(?:-|$)/i.test(clean(product.graceSku))) attrs.add("Short cap");
  if (productType === "vial") {
    const glassHit = matchToken(tokenText(product), VIAL_GLASS_TOKENS);
    if (glassHit) attrs.add(`${glassHit.identity} vial`);
  }
  if (productType === "metal-atomizer") {
    attrs.add("Solid metal shell");
  }
  if (/metal roller/i.test(text)) attrs.add("Metal roller");
  if (/plastic roller/i.test(text)) attrs.add("Plastic roller");
  return Array.from(attrs);
}

function tokenText(product: BestBottlesVisualProduct): string {
  return [product.websiteSku, product.graceSku].filter(Boolean).join(" ");
}

function textIdentity(product: BestBottlesVisualProduct, productType: BestBottlesProductType): string {
  const text = textOf(product);
  const tokens =
    productType === "antique-bulb-sprayer" || productType === "antique-bulb-sprayer-tassel"
      ? ANTIQUE_BULB_TOKENS
      : productType === "closure"
        ? CLOSURE_TOKENS
        : productType === "roll-on"
          ? ROLL_ON_TOKENS
          : productType === "vial"
            ? [...VIAL_CAP_TOKENS, ...VIAL_GLASS_TOKENS]
            : productType === "metal-atomizer"
              ? METAL_ATOMIZER_TOKENS
          : SPRAY_FINISH_TOKENS;
  return matchToken(text, tokens)?.identity ?? "";
}

export function resolveBestBottlesVisualIdentity(
  product: BestBottlesVisualProduct | null | undefined,
): BestBottlesVisualIdentityResult {
  const blockingWarnings: string[] = [];
  if (!product) {
    return {
      graceSku: "",
      websiteSku: "",
      productFamily: "",
      productApplicatorType: "unknown",
      resolvedVisualIdentity: "",
      resolvedVisualIdentityCanonical: "",
      secondaryVisualAttributes: [],
      confidence: "low",
      reason: "No Best Bottles product row was provided.",
      blockingWarnings: ["No matched Best Bottles product row."],
      safeToPush: false,
    };
  }

  const graceSku = clean(product.graceSku);
  const websiteSku = clean(product.websiteSku);
  const productFamily = clean(product.family);
  const productType = classifyBestBottlesProduct(product);
  const secondaryVisualAttributes = secondaryAttributesFor(product, productType);
  const tokenSource = productType === "antique-bulb-sprayer" || productType === "antique-bulb-sprayer-tassel"
    ? ANTIQUE_BULB_TOKENS
    : productType === "closure"
      ? CLOSURE_TOKENS
      : productType === "roll-on"
        ? ROLL_ON_TOKENS
        : productType === "vial"
          ? [...VIAL_CAP_TOKENS, ...VIAL_GLASS_TOKENS]
          : productType === "metal-atomizer"
            ? METAL_ATOMIZER_TOKENS
            : SPRAY_FINISH_TOKENS;
  const tokenHit = matchToken(tokenText(product), tokenSource);

  let identity = "";
  let reason = "";
  let confidence: BestBottlesVisualIdentityResult["confidence"] = "low";

  if (tokenHit && productType !== "glass-only") {
    identity = tokenHit.identity;
    confidence = "high";
    reason = `Parsed ${tokenHit.reasonLabel} from SKU fields ${[graceSku, websiteSku].filter(Boolean).join(" / ")}.`;
  } else if (productType === "glass-only" && product.color) {
    identity = product.color;
    confidence = "high";
    reason = `Plain bottle row; using glass color ${product.color}.`;
  } else if (productType === "jar") {
    identity = [product.color, product.capColor].filter(Boolean).join(" + ");
    confidence = identity ? "medium" : "low";
    reason = identity ? "Jar row; using jar color plus lid/cap finish." : "Jar row has no jar color or lid/cap finish.";
  } else if (productType === "vial") {
    const capTokenHit = matchToken(tokenText(product), VIAL_CAP_TOKENS);
    const glassTokenHit = matchToken(tokenText(product), VIAL_GLASS_TOKENS);
    identity = capTokenHit?.identity ?? glassTokenHit?.identity ?? product.capColor ?? product.color ?? "";
    confidence = identity ? (capTokenHit || glassTokenHit ? "high" : "medium") : "low";
    reason = capTokenHit
      ? `Vial row; parsed cap/plug identity ${capTokenHit.reasonLabel} from SKU fields ${[graceSku, websiteSku].filter(Boolean).join(" / ")}.`
      : glassTokenHit
        ? `Vial row; parsed vial glass identity ${glassTokenHit.reasonLabel} from SKU fields ${[graceSku, websiteSku].filter(Boolean).join(" / ")}.`
        : identity
          ? "Vial row; using structured cap or glass color because no stronger SKU token was found."
          : "Vial row has no cap/plug or vial glass identity.";
  } else if (productType === "metal-atomizer") {
    identity = tokenHit?.identity ?? product.color ?? product.capColor ?? "";
    confidence = identity ? (tokenHit ? "high" : "medium") : "low";
    reason = tokenHit
      ? `Metal atomizer row; parsed shell color ${tokenHit.reasonLabel} from SKU fields ${[graceSku, websiteSku].filter(Boolean).join(" / ")}.`
      : identity
        ? "Metal atomizer row; using structured shell/body color because no stronger SKU token was found."
        : "Metal atomizer row has no shell/body color identity.";
  } else if (["perfume-spray", "lotion-pump", "dropper"].includes(productType) && product.capColor) {
    identity = product.capColor;
    confidence = "medium";
    reason = `Using component finish from capColor because no stronger SKU token was found.`;
  } else {
    identity = textIdentity(product, productType);
    confidence = identity ? "medium" : "low";
    reason = identity ? "Parsed visual identity from item name/product description." : "Could not resolve a visual identity from structured fields, SKU tokens, or item text.";
  }

  const canonical = canonicalBestBottlesVisualIdentity(identity);
  if (!canonical) blockingWarnings.push("Visual identity is ambiguous; needs review.");
  if (confidence === "low") blockingWarnings.push("Resolver confidence is low; manual review required.");
  if ((productType === "antique-bulb-sprayer" || productType === "antique-bulb-sprayer-tassel") && canonical === "clear") {
    blockingWarnings.push("Antique bulb sprayer resolved to Clear, which is likely glass color rather than bulb color.");
  }

  return {
    graceSku,
    websiteSku,
    productFamily,
    productApplicatorType: productType,
    resolvedVisualIdentity: displayBestBottlesVisualIdentity(identity),
    resolvedVisualIdentityCanonical: canonical,
    secondaryVisualAttributes,
    confidence,
    reason,
    blockingWarnings,
    safeToPush: blockingWarnings.length === 0,
  };
}

export function validateBestBottlesImageIdentity(
  expectedVisualIdentity: string | null | undefined,
  product: BestBottlesVisualProduct | null | undefined,
): { ok: boolean; message: string; resolution: BestBottlesVisualIdentityResult } {
  const resolution = resolveBestBottlesVisualIdentity(product);
  if (!resolution.safeToPush) {
    return { ok: false, message: resolution.blockingWarnings.join(" "), resolution };
  }
  const expected = canonicalBestBottlesVisualIdentity(expectedVisualIdentity);
  if (!expected) {
    return {
      ok: false,
      message: `Declare image visual identity before replacing ${resolution.resolvedVisualIdentity} variant media.`,
      resolution,
    };
  }
  if (!bestBottlesVisualIdentitiesCompatible(expected, resolution.resolvedVisualIdentityCanonical, resolution.productApplicatorType)) {
    return {
      ok: false,
      message: `Image identity says ${expectedVisualIdentity}; resolved Best Bottles identity is ${resolution.resolvedVisualIdentity}.`,
      resolution,
    };
  }
  return { ok: true, message: "", resolution };
}

export function detectBestBottlesVisualIdentityFromText(value: string | null | undefined): string {
  const text = value ?? "";
  const hit = matchToken(text, [
    ...ANTIQUE_BULB_TOKENS,
    ...VIAL_CAP_TOKENS,
    ...VIAL_GLASS_TOKENS,
    ...METAL_ATOMIZER_TOKENS,
    ...ROLL_ON_TOKENS,
    ...CLOSURE_TOKENS,
    ...SPRAY_FINISH_TOKENS,
  ]);
  return hit?.identity ?? textIdentity({ itemName: text }, "perfume-spray");
}
