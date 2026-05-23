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

function classifyBestBottlesProduct(product: BestBottlesVisualProduct): BestBottlesProductType {
  const graceSku = clean(product.graceSku).toUpperCase();
  const websiteSku = clean(product.websiteSku);
  const text = textOf(product).toLowerCase();
  if (/-AST-/.test(graceSku) || /ansptsl/i.test(websiteSku) || /\btassel\b/.test(text)) return "antique-bulb-sprayer-tassel";
  if (/-ASP-/.test(graceSku) || /ansp/i.test(websiteSku) || /\b(?:antique|vintage|bulb)\b.*\bspray/.test(text)) return "antique-bulb-sprayer";
  if (/-SPR-/.test(graceSku) || /\b(?:perfume spray|fine mist|mist spray|collar sprayer)\b/.test(text) || /spry/i.test(websiteSku)) return "perfume-spray";
  if (/-LPM-|-PMP-/.test(graceSku) || /\b(?:lotion|treatment)\s+pump\b/.test(text)) return "lotion-pump";
  if (/-DRP-/.test(graceSku) || /\bdropper\b/.test(text)) return "dropper";
  if (/-ROL-|-MRL-|-RBL-/.test(graceSku) || /\b(?:roll-on|roller ball|metal roller)\b/.test(text)) return "roll-on";
  if (/-RDC-|-CAP-|-SHT-/.test(graceSku) || /\b(?:reducer|screw cap|short cap|tall cap|closure)\b/.test(text) || /rdcr|lthr|cap/i.test(websiteSku)) return "closure";
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
  ...SPRAY_FINISH_TOKENS,
];

const ROLL_ON_TOKENS: VisualToken[] = [
  { pattern: /BLDOT|BLKDOT/i, identity: "Black Dots", reasonLabel: "BLDOT/BlkDot" },
  { pattern: /SLDOT|SLDOT/i, identity: "Silver Dots", reasonLabel: "SLDOT/SlDot" },
  ...SPRAY_FINISH_TOKENS,
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
  if (expected !== resolution.resolvedVisualIdentityCanonical) {
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
  ]);
  return hit?.identity ?? textIdentity({ itemName: text }, "perfume-spray");
}
