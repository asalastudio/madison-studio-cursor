import { applyBestBottlesCapColorOverride } from "./bestBottlesCapColorOverrides";
import { BestBottlesShadowPolicy, resolveBestBottlesShadowPolicy } from "./bestBottlesShadowPolicy";
import {
  BEST_BOTTLES_CATALOG_SCALE_VERSION,
  deriveBestBottlesBodyTargetPx,
} from "../config/bestBottlesCatalogScale";
import { getBestBottlesCatalogFramingProfile } from "../config/bestBottlesFamilyProfiles";
import { resolveShoulderLock } from "./bestBottlesShoulderLock";

export type BestBottlesGenerationIdentityStatus = "ready" | "blocked";

export const BEST_BOTTLES_PROMPT_VERSION = "best-bottles-reference-locked-v6.0";
export const BEST_BOTTLES_RIG_VERSION = "uniform-fit-box-2080x2288-v1";

export interface BestBottlesGenerationIdentity {
  graceSku: string | null;
  websiteSku: string | null;
  productId: string | null;
  productGroupId: string | null;
  family: string | null;
  capacityMl: number | null;
  bodyColor: string | null;
  inferredBodyColor: string | null;
  bodyMaterial: string | null;
  neckThreadSize: string | null;
  applicator: string | null;
  capStyle: string | null;
  capColor: string | null;
  trimColor: string | null;
  tasselColor: string | null;
  bulbColor: string | null;
  hoseColor: string | null;
  collarFinish: string | null;
  ringPresent: boolean | null;
  accessoryCode: string | null;
  reducerFinish: string | null;
  sourceReference: string | null;
  identityStatus: BestBottlesGenerationIdentityStatus;
  identityBlockers: string[];
  identityHash: string;
  promptVersion: string;
  scaleContractVersion: string;
  glassBodyKey: string | null;
  shoulderTargetPct: number | null;
  calibrationRegistryKey: string | null;
  resolvedAssembledTargetPct: number;
  resolvedBodyTargetPx: number | null;
  shadowOwner: BestBottlesShadowPolicy["owner"];
  shadowContract: BestBottlesShadowPolicy["contract"];
  rigVersion: string;
  qaStatus: "pending";
  canvas: "2080x2288";
}

export interface BestBottlesIdentityProductLike {
  graceSku?: string | null;
  websiteSku?: string | null;
  productId?: string | null;
  productGroupId?: string | null;
  family?: string | null;
  bottleCollection?: string | null;
  category?: string | null;
  capacityMl?: number | null;
  color?: string | null;
  bodyMaterial?: string | null;
  neckThreadSize?: string | null;
  applicator?: string | null;
  capStyle?: string | null;
  capColor?: string | null;
  trimColor?: string | null;
  itemName?: string | null;
  itemDescription?: string | null;
  heightWithCap?: string | null;
  heightWithoutCap?: string | null;
  diameter?: string | null;
  capState?: string | null;
  mode?: string | null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(value: unknown): string | null {
  const v = text(value);
  return v.length > 0 ? v : null;
}

function positiveNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  const match = text(value).match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function slug(value: string | null | undefined): string {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function boolOrNull(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (["true", "yes", "y", "1", "ring", "with ring"].includes(v)) return true;
    if (["false", "no", "n", "0", "no ring", "without ring"].includes(v)) return false;
  }
  return null;
}

function normalizeColor(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function labelColor(value: string): string {
  return value.replace(/\b\w/g, (c) => c.toUpperCase());
}

function sourceText(product: BestBottlesIdentityProductLike): string {
  return [
    product.graceSku,
    product.websiteSku,
    product.family,
    product.color,
    product.applicator,
    product.capStyle,
    product.capColor,
    product.trimColor,
    product.itemName,
    product.itemDescription,
  ].filter(Boolean).join(" ");
}

function isAmbiguousCapColor(value: string | null | undefined): boolean {
  const normalized = normalizeColor(value);
  return normalized === "clear" || normalized === "transparent";
}

function capColorEvidenceText(product: BestBottlesIdentityProductLike): string {
  const explicit = optionalText(product.capColor);
  return [
    product.graceSku,
    product.websiteSku,
    product.family,
    product.color,
    product.applicator,
    product.capStyle,
    explicit && !isAmbiguousCapColor(explicit) ? explicit : null,
    product.trimColor,
    product.itemName,
    product.itemDescription,
  ].filter(Boolean).join(" ");
}

function inferBodyColorFromWebsiteSku(product: BestBottlesIdentityProductLike): string | null {
  const value = [product.websiteSku, product.itemName, product.itemDescription]
    .filter(Boolean)
    .join(" ");
  if (/\bfr(?:o|st|sted)?\b|frst|frosted/i.test(value)) return "Frosted";
  if (/\bamber\b|\bamb\b/i.test(value)) return "Amber";
  if (/\bcobalt\b|\bcobalt\s*blue\b/i.test(value)) return "Cobalt Blue";
  if (/\bgreen\b|\bgrn\b/i.test(value)) return "Green";
  // "pink" in a Best Bottles name almost always describes a CAP, leather reducer,
  // or spray accent ("pink dot cap", "Reducer Pink Leather", "Antique spray Pink")
  // — NOT the glass body. Pink GLASS is encoded in the graceSku color code (-PNK-)
  // and the Convex color field, handled elsewhere. So only infer a pink BODY from
  // explicit body context; otherwise a clear/cobalt bottle with a pink cap would
  // misattribute the cap's pink to the glass and hit a false body-color conflict.
  if (/\bpink\s+(?:glass|bottle|cylinder|body)\b/i.test(value)) return "Pink";
  return null;
}

function bodyColorCodeFromGraceSku(graceSku: string | null): string | null {
  const code = graceSku?.split("-")[2]?.toUpperCase() ?? null;
  if (!code) return null;
  const map: Record<string, string> = {
    CLR: "Clear",
    FRS: "Frosted",
    FRO: "Frosted",
    AMB: "Amber",
    BLU: "Cobalt Blue",
    CBL: "Cobalt Blue",
    GRN: "Green",
    PNK: "Pink",
    BLK: "Black",
  };
  return map[code] ?? null;
}

function inferColorFromPatterns(value: string, patterns: Array<[RegExp, string]>): string | null {
  for (const [pattern, label] of patterns) {
    if (pattern.test(value)) return label;
  }
  return null;
}

function inferTasselColor(product: BestBottlesIdentityProductLike): string | null {
  const explicit = optionalText((product as Record<string, unknown>).tasselColor);
  if (explicit) return explicit;
  const value = sourceText(product);
  const inferred = inferColorFromPatterns(value, [
    [/(?:tsl|tassel)[\s_-]*(?:blk|black)|(?:blk|black)[\s_-]*(?:tsl|tassel)/i, "Black"],
    [/(?:tsl|tassel)[\s_-]*(?:gld|gold)|(?:gld|gold)[\s_-]*(?:tsl|tassel)/i, "Gold"],
    [/(?:tsl|tassel)[\s_-]*(?:iv|ivory)|(?:iv|ivory)[\s_-]*(?:tsl|tassel)/i, "Ivory"],
    [/(?:tsl|tassel)[\s_-]*(?:lvn|lav|lavender)|(?:lvn|lav|lavender)[\s_-]*(?:tsl|tassel)/i, "Lavender"],
    [/(?:tsl|tassel)[\s_-]*(?:slv|silver)|(?:slv|silver)[\s_-]*(?:tsl|tassel)/i, "Silver"],
    [/(?:tsl|tassel)[\s_-]*(?:red)|(?:red)[\s_-]*(?:tsl|tassel)/i, "Red"],
    [/(?:tsl|tassel)[\s_-]*(?:trq|turquoise)|(?:trq|turquoise)[\s_-]*(?:tsl|tassel)/i, "Turquoise"],
    [/(?:tsl|tassel)[\s_-]*(?:wht|white)|(?:wht|white)[\s_-]*(?:tsl|tassel)/i, "White"],
  ]);
  if (inferred) return inferred;
  return optionalText(product.capColor);
}

function inferCollarFinish(product: BestBottlesIdentityProductLike): string | null {
  const explicit =
    optionalText((product as Record<string, unknown>).collarFinish) ??
    optionalText(product.trimColor);
  if (explicit) return explicit;
  const value = sourceText(product);
  return inferColorFromPatterns(value, [
    [/shiny\s*silver|sslv/i, "Shiny Silver"],
    [/shiny\s*gold|sgld/i, "Shiny Gold"],
    [/matte\s*silver|mslv/i, "Matte Silver"],
    [/matte\s*gold|mgld/i, "Matte Gold"],
    [/matte\s*black|mblk/i, "Matte Black"],
    [/shiny\s*black|sblk/i, "Shiny Black"],
    [/copper|cpr/i, "Copper"],
  ]);
}

function inferReducerFinish(product: BestBottlesIdentityProductLike): string | null {
  const explicit = optionalText((product as Record<string, unknown>).reducerFinish);
  if (explicit) return explicit;
  const value = sourceText(product);
  return inferColorFromPatterns(value, [
    [/black\s*leather|blklt|bklt/i, "Black Leather"],
    [/light\s*brown\s*leather|ltbrn|lbrn/i, "Light Brown Leather"],
    [/\bbrown\s*leather|brnlt/i, "Brown Leather"],
    [/ivory\s*leather|ivlt/i, "Ivory Leather"],
    [/pink\s*leather|pnklt/i, "Pink Leather"],
  ]);
}

function inferCapColor(product: BestBottlesIdentityProductLike): string | null {
  const explicit = optionalText(product.capColor);
  const inferred = inferColorFromPatterns(capColorEvidenceText(product), [
    [/matte\s*black|mt\s*black|mblk|mblck/i, "Matte Black"],
    [/shiny\s*black|sblk|shnblk|blkdot|black\s*(?:shiny|dot|dots)/i, "Shiny Black"],
    [/matte\s*silver|mt\s*silver|mslv|mtslv/i, "Matte Silver"],
    [/shiny\s*silver|sslv|shnslv/i, "Shiny Silver"],
    [/matte\s*gold|mt\s*gold|mgld|mtgld/i, "Matte Gold"],
    [/shiny\s*gold|sgld|shngld/i, "Shiny Gold"],
    [/\bcopper\b|cpr/i, "Copper"],
    [/sprytur|(?:^|[\s_-])tur(?:$|[\s_-])|\bturq(?:uoise)?\b|\btrq\b/i, "Turquoise"],
    [/spryrd|\bred\b|\brd\b/i, "Red"],
    [/\bwhite\b|wht/i, "White"],
    [/\bblack\b|blk/i, "Black"],
    [/\bsilver\b|slv/i, "Silver"],
    [/\bgold\b|gld/i, "Gold"],
  ]);
  if (inferred) return inferred;
  if (explicit && !isAmbiguousCapColor(explicit)) return explicit;
  return null;
}

function inferRingPresent(product: BestBottlesIdentityProductLike): boolean | null {
  const explicit =
    boolOrNull((product as Record<string, unknown>).ringPresent) ??
    boolOrNull((product as Record<string, unknown>).hasRing);
  if (explicit !== null) return explicit;
  const value = sourceText(product).toLowerCase();
  if (/\bno\s*ring\b|without\s*ring/.test(value)) return false;
  if (/\bring\b|rng/.test(value)) return true;
  return null;
}

function accessoryCodeFor(tasselColor: string | null, ringPresent: boolean | null): string | null {
  if (!tasselColor) return null;
  const codeMap: Record<string, string> = {
    black: "BLK",
    gold: "GLD",
    ivory: "IV",
    lavender: "LVN",
    silver: "SLV",
    red: "RED",
    turquoise: "TRQ",
    white: "WHT",
  };
  const code = codeMap[normalizeColor(tasselColor)];
  if (!code) return null;
  return `AST-${code}${ringPresent === true ? "-RNG" : ""}`;
}

function stableHash(parts: Array<string | number | boolean | null | undefined>): string {
  const input = parts.map((part) => String(part ?? "")).join("|");
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function buildBestBottlesGenerationIdentity(
  rawProduct: BestBottlesIdentityProductLike,
  options?: { bodyMaterial?: string | null; sourceReference?: string | null },
): BestBottlesGenerationIdentity {
  // Correct known-bad catalog color fields before any inference runs, so both
  // the blockers and the identity hash see the fixed value.
  const product = applyBestBottlesCapColorOverride(rawProduct);
  const scaleProfile = getBestBottlesCatalogFramingProfile({
    family: product.family,
    bottleCollection: product.bottleCollection,
    category: product.category,
    graceSku: product.graceSku,
    websiteSku: product.websiteSku,
    itemName: product.itemName,
    itemDescription: product.itemDescription,
    applicator: product.applicator,
    capacityMl: product.capacityMl,
    heightWithCap: product.heightWithCap,
    heightWithoutCap: product.heightWithoutCap,
    diameter: product.diameter,
    capState: product.capState,
    mode: product.mode,
  });
  const assembledHeightMm = positiveNumber(product.heightWithCap);
  const bodyHeightMm = positiveNumber(product.heightWithoutCap);
  const shoulderLock = resolveShoulderLock({
    family: product.family,
    bottleCollection: product.bottleCollection,
    graceSku: product.graceSku,
    websiteSku: product.websiteSku,
    itemName: product.itemName,
    capacityMl: product.capacityMl,
    heightWithoutCap: product.heightWithoutCap,
    applicator: product.applicator,
  });
  const scaleContractVersion = shoulderLock?.lockVersion ?? BEST_BOTTLES_CATALOG_SCALE_VERSION;
  const glassBodyKey = shoulderLock?.glassBodyKey ?? null;
  const shoulderTargetPct = shoulderLock?.shoulderPct ?? null;
  const resolvedBodyTargetPx = shoulderLock
    ? Math.round((shoulderLock.shoulderPct / 100) * scaleProfile.canvas.heightPx)
    : assembledHeightMm != null
      && bodyHeightMm != null
      && bodyHeightMm <= assembledHeightMm
        ? deriveBestBottlesBodyTargetPx({
            canvasHeightPx: scaleProfile.canvas.heightPx,
            assembledHeightPct: scaleProfile.targetProductHeightPct,
            verifiedBodyHeightMm: bodyHeightMm,
            verifiedAssembledHeightMm: assembledHeightMm,
          })
        : null;
  const registryFamily = slug(product.family || product.bottleCollection || product.category);
  const registryOwner = optionalText(product.productGroupId) ?? optionalText(product.graceSku);
  const calibrationRegistryKey =
    registryFamily && product.capacityMl && registryOwner
      ? `${registryFamily}:${product.capacityMl}:${registryOwner}`
      : null;
  const graceSku = optionalText(product.graceSku);
  const shadowPolicy = resolveBestBottlesShadowPolicy({
    graceSku,
    websiteSku: product.websiteSku,
    family: product.family,
  });
  const websiteSku = optionalText(product.websiteSku);
  const bodyColor = optionalText(product.color);
  const inferredBodyColor = inferBodyColorFromWebsiteSku(product);
  const graceColor = bodyColorCodeFromGraceSku(graceSku);
  const textLower = sourceText(product).toLowerCase();
  const applicator = optionalText(product.applicator);
  const capColor = inferCapColor(product);
  const websiteSkuEvidence = text(product.websiteSku);
  const isTassel =
    /\btassel\b/.test(textLower) ||
    /\btsl\b/i.test(sourceText(product)) ||
    /ansptsl/i.test(websiteSkuEvidence) ||
    /Tsl(?:[A-Z]|$)/.test(websiteSkuEvidence) ||
    /tassel/i.test(applicator ?? "");
  const isReducer =
    /reducer/.test(textLower) ||
    /reducer/i.test(applicator ?? "");
  const tasselColor = isTassel ? inferTasselColor(product) : optionalText((product as Record<string, unknown>).tasselColor);
  const bulbColor =
    optionalText((product as Record<string, unknown>).bulbColor) ??
    (isTassel ? tasselColor : null) ??
    (/bulb|antique|vintage/.test(textLower) ? optionalText(product.capColor) : null);
  const hoseColor =
    optionalText((product as Record<string, unknown>).hoseColor) ??
    (isTassel || /bulb|antique|vintage/.test(textLower) ? bulbColor : null);
  const collarFinish = inferCollarFinish(product);
  const ringPresent = inferRingPresent(product);
  const reducerFinish = isReducer ? inferReducerFinish(product) ?? optionalText(product.capColor) : null;
  const accessoryCode =
    optionalText((product as Record<string, unknown>).accessoryCode) ??
    accessoryCodeFor(tasselColor, ringPresent);

  const blockers: string[] = [];
  const skuLooksGeneric = /-(?:T|S)-\d{1,3}$/i.test(graceSku ?? "");
  const needsCapColor =
    /roll|roller|spray|sprayer|pump|fine\s*mist|cap|closure|applicator/i.test(
      [applicator, product.itemName, product.itemDescription, websiteSku].filter(Boolean).join(" "),
    );
  if (isTassel && !tasselColor) {
    blockers.push("Tassel SKU is missing tassel color.");
  }
  if (isTassel && !collarFinish) {
    blockers.push("Tassel SKU is missing collar/trim finish.");
  }
  if (isReducer && skuLooksGeneric && !reducerFinish) {
    blockers.push("Generic reducer SKU is missing reducer/leather finish.");
  }
  if (skuLooksGeneric && needsCapColor && !capColor) {
    blockers.push("Generic SKU is missing cap/closure color; attach website SKU evidence or explicit cap color before generation.");
  }
  if (
    skuLooksGeneric &&
    graceColor &&
    inferredBodyColor &&
    normalizeColor(graceColor) !== normalizeColor(inferredBodyColor)
  ) {
    blockers.push(
      `Generic SKU color code says ${graceColor}, but product evidence says ${inferredBodyColor}.`,
    );
  }
  if (bodyColor && inferredBodyColor && normalizeColor(bodyColor) !== normalizeColor(inferredBodyColor)) {
    blockers.push(
      `Product row color says ${bodyColor}, but product evidence says ${inferredBodyColor}.`,
    );
  }

  const identityStatus: BestBottlesGenerationIdentityStatus =
    blockers.length === 0 ? "ready" : "blocked";

  const identityHash = stableHash([
    graceSku,
    websiteSku,
    product.productId,
    product.productGroupId,
    product.family,
    product.capacityMl,
    bodyColor,
    inferredBodyColor,
    options?.bodyMaterial,
    product.neckThreadSize,
    applicator,
    product.capStyle,
    capColor,
    product.trimColor,
    tasselColor,
    bulbColor,
    hoseColor,
    collarFinish,
    ringPresent,
    accessoryCode,
    reducerFinish,
    options?.sourceReference,
    shadowPolicy.promptVersion,
    shadowPolicy.owner,
    shadowPolicy.contract,
    scaleContractVersion,
    glassBodyKey,
    shoulderTargetPct,
    calibrationRegistryKey,
    scaleProfile.targetProductHeightPct,
    resolvedBodyTargetPx,
    BEST_BOTTLES_RIG_VERSION,
  ]);

  return {
    graceSku,
    websiteSku,
    productId: optionalText(product.productId),
    productGroupId: optionalText(product.productGroupId),
    family: optionalText(product.family),
    capacityMl: product.capacityMl ?? null,
    bodyColor,
    inferredBodyColor: inferredBodyColor ? labelColor(inferredBodyColor) : null,
    bodyMaterial: options?.bodyMaterial ?? optionalText(product.bodyMaterial),
    neckThreadSize: optionalText(product.neckThreadSize),
    applicator,
    capStyle: optionalText(product.capStyle),
    capColor,
    trimColor: optionalText(product.trimColor),
    tasselColor,
    bulbColor,
    hoseColor,
    collarFinish,
    ringPresent,
    accessoryCode,
    reducerFinish,
    sourceReference: options?.sourceReference ?? null,
    identityStatus,
    identityBlockers: blockers,
    identityHash,
    promptVersion: shadowPolicy.promptVersion,
    scaleContractVersion,
    glassBodyKey,
    shoulderTargetPct,
    calibrationRegistryKey,
    resolvedAssembledTargetPct: scaleProfile.targetProductHeightPct,
    resolvedBodyTargetPx,
    shadowOwner: shadowPolicy.owner,
    shadowContract: shadowPolicy.contract,
    rigVersion: BEST_BOTTLES_RIG_VERSION,
    qaStatus: "pending",
    canvas: "2080x2288",
  };
}

export function getBestBottlesGenerationIdentityIssue(
  identity: BestBottlesGenerationIdentity,
): string | null {
  if (identity.identityStatus !== "blocked") return null;
  return identity.identityBlockers.join(" ");
}
