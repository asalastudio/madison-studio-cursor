import { applyBestBottlesCapColorOverride } from "./bestBottlesCapColorOverrides";
import {
  buildPromptForSku,
  type PromptRecord,
  type PromptSku,
  type PromptSystem,
} from "./bestBottlesPromptCompiler";
import {
  BEST_BOTTLES_CATALOG_CANON_SOURCE_PATH,
  BEST_BOTTLES_CATALOG_CANON_PROMPT_FLAG,
  buildBestBottlesCatalogCanonPromptParts,
} from "./bestBottlesCatalogCanonPrompt";
import {
  getBestBottlesShadowPolicyTags,
  resolveBestBottlesShadowPolicy,
  type BestBottlesShadowPolicy,
} from "./bestBottlesShadowPolicy";
import {
  buildModelOwnedShadowPrompt,
  resolveBestBottlesShadowTopology,
  type BestBottlesShadowTopology,
} from "./bestBottlesShadowTopology";
import {
  getBestBottlesCatalogFramingProfile,
  getBestBottlesCylinderFamilyProfile,
  getBestBottlesCylinderHeightDiameterRatio,
  getBestBottlesFamilyProfileForProduct,
  type BestBottlesFamilyProfile,
} from "@/config/bestBottlesFamilyProfiles";
import { BEST_BOTTLES_CATALOG_SCALE_VERSION } from "@/config/bestBottlesCatalogScale";
import { isAssembledOnlyVintageBulbIdentity } from "./bestBottlesAssembledOnlyProduct";
import { resolveShoulderLock, type ResolvedShoulderLock } from "./bestBottlesShoulderLock";

type ProductLike = {
  graceSku?: string | null;
  websiteSku?: string | null;
  itemName?: string | null;
  itemDescription?: string | null;
  bottleCollection?: string | null;
  family?: string | null;
  category?: string | null;
  color?: string | null;
  capacityMl?: number | null;
  applicator?: string | null;
  capColor?: string | null;
  trimColor?: string | null;
  capStyle?: string | null;
  capState?: string | null;
  mode?: string | null;
  capOffReferenceId?: string | null;
  topologyReferenceId?: string | null;
  componentTopology?:
    | "assembled"
    | "fitment-attached-cap-right-sidecar"
    | "assembled-live-site-exception"
    | null;
  accessoryCode?: string | null;
  heightWithoutCap?: string | null;
  heightWithCap?: string | null;
  diameter?: string | null;
  neckThreadSize?: string | null;
};

export type BestBottlesPromptPreflightStatus = "ok" | "warn" | "error";

// The family-agnostic QA keys buildPromptForSku() always emits. Used as the QA
// floor when a family has no module and module validation is skipped.
const BASE_MODULE_QA_CHECKLIST = [
  "reference_png_identity_lock",
  "geometry_preserved",
  "material_truth_preserved",
  "framing_consistent",
];

export interface BestBottlesPromptPreflightInput {
  product: ProductLike;
  referenceImagePath: string | null | undefined;
  bodyMaterial?: string | null;
  canvas?: { widthPx: number; heightPx: number } | null;
  system: PromptSystem;
}

export interface BestBottlesPromptPreflight {
  status: BestBottlesPromptPreflightStatus;
  issue: string | null;
  warnings: string[];
  sku: PromptSku | null;
  record: PromptRecord | null;
}

interface BestBottlesCanvasPreflight {
  qaChecklist: string[];
  warnings: string[];
}

interface PromptSkuBuildInput {
  product: ProductLike;
  referenceImagePath: string | null | undefined;
  bodyMaterial?: string | null;
  canvas?: { widthPx: number; heightPx: number } | null;
}

function compact(values: Array<string | null | undefined>): string {
  return values
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ");
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function keyFromText(value: string | null | undefined): string {
  return normalizeText(value ?? "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

function skuOrCatalogText(product: ProductLike): string {
  return normalizeText(compact([
    product.graceSku,
    product.websiteSku,
    product.itemName,
    product.itemDescription,
    product.applicator,
    product.capColor,
    product.trimColor,
  ]));
}

function getSku(product: ProductLike): string {
  return (product.graceSku || product.websiteSku || "UNKNOWN-SKU").trim();
}

function getFilename(referenceImagePath: string | null | undefined, sku: string): string {
  const reference = referenceImagePath?.trim();
  if (!reference) return `${sku}.png`;
  const lastSegment = reference.split(/[/?#]/)[reference.split(/[/?#]/).length - 1] || reference;
  return lastSegment || `${sku}.png`;
}

export function inferBestBottlesPromptFamily(product: ProductLike): string {
  const haystack = normalizeText(compact([
    product.graceSku,
    product.websiteSku,
    product.family,
    product.bottleCollection,
    product.category,
    product.itemName,
    product.itemDescription,
    product.applicator,
  ]));

  if (includesAny(haystack, ["cylinder", "tall cylinder", "gb-cyl", "lb-cyl", "-cyl-", "swirl"])) {
    return "cylinder";
  }
  if (includesAny(haystack, ["cream jar", " jar", "gb-jar", "cosmetic jar"])) return "cream_jar";
  if (includesAny(haystack, ["roll-on", "roll on", "roller", "-mrl-", "-rol-"])) return "roll_on";
  if (includesAny(haystack, ["boston round", "gb-bos", " boston"])) return "boston_round";
  if (includesAny(haystack, ["atomizer", "gb-atm", "-atm-"])) return "atomizer";
  // A bottle that ships WITH a dropper or lotion pump is still a bottle. The
  // haystack includes the item name and applicator, so without this guard a
  // Slim or Elegant glass bottle was filed under its closure, resolved the
  // non-bottle shadow policy, and threw on the policy check — 233 bottle SKUs
  // across 11 families could not generate. Cylinder never hit it because it is
  // matched above. Only a product whose own catalog family IS the closure, or
  // which has no family at all, may be filed as one.
  const catalogFamily = normalizeText(compact([product.family, product.bottleCollection]));
  const mayBeClosureFamily = (names: string[]) =>
    catalogFamily.length === 0 || includesAny(catalogFamily, names);
  if (includesAny(haystack, ["dropper", "-drp-", " pipette"]) && mayBeClosureFamily(["dropper"])) {
    return "dropper";
  }
  if (includesAny(haystack, ["vintage bulb", "bulb sprayer", "tassel"])) return "vintage_bulb_sprayer";
  if (includesAny(haystack, ["lotion pump"]) && mayBeClosureFamily(["lotion pump"])) return "lotion_pump";
  if (includesAny(haystack, ["classic spray"])) return "classic_spray";
  if (includesAny(haystack, ["fine mist"])) {
    return includesAny(haystack, ["cylinder", "gb-cyl", "-cyl-"]) ? "cylinder" : "fine_mist_sprayer";
  }
  if (includesAny(haystack, ["rectangular", "rectangle"])) return "rectangular";
  if (includesAny(haystack, ["empire"])) return "empire";
  if (includesAny(haystack, ["vial", "gb-via"])) return "vial";
  if (includesAny(haystack, ["reducer", "orifice"])) return "orifice_reducer";
  if (includesAny(haystack, ["splash"])) return "splash_bottle";
  if (includesAny(haystack, ["aluminum", "aluminium"])) return "aluminum_bottle";
  if (includesAny(haystack, ["apothecary"])) return "apothecary_bottle";
  // Decorative / "heavy perfume" bucket — map the distinct decorative family names to
  // the existing decorative_bottle module (cylinder/empire/etc. are matched earlier, so
  // they win over these). Only affects validation QA seeds, not the shipped canon prompt.
  if (includesAny(haystack, ["decorative", "diva", "diamond", "elegant", "grace", "sleek", "slim"])) {
    return "decorative_bottle";
  }
  if (includesAny(haystack, ["box", "carton"])) return "box";
  if (includesAny(haystack, ["bag", "organza", "velvet"])) return "bag";

  return keyFromText(product.family || product.bottleCollection || product.category || product.itemName);
}

export function inferBestBottlesPromptBodyMaterial(
  product: ProductLike,
  declaredBodyMaterial?: string | null,
): string {
  const family = inferBestBottlesPromptFamily(product);
  const haystack = normalizeText(compact([
    declaredBodyMaterial,
    product.graceSku,
    product.websiteSku,
    product.family,
    product.bottleCollection,
    product.category,
    product.itemName,
    product.itemDescription,
    product.color,
  ]));
  const color = normalizeText(product.color ?? "");

  if (family === "atomizer" || includesAny(haystack, ["atomizer", "aluminum", "aluminium", "-atm-", "gb-atm"])) {
    return "brushed_aluminum";
  }
  if (includesAny(haystack, ["paperboard", "carton", "box"])) return "folding_carton_paperboard";
  if (includesAny(haystack, ["organza"])) return "organza_fabric";
  if (includesAny(haystack, ["velvet"])) return "velvet_fabric";
  if (family === "cream_jar" || includesAny(haystack, ["white plastic", "opaque white"])) return "white_plastic";
  if (includesAny(haystack, ["black plastic", "opaque black"])) return "black_plastic";
  if (
    family === "cylinder" &&
    includesAny(haystack, ["swirl", "swirled", "swrl", "spiral", "helical", "fluted"])
  ) {
    return "swirl_glass";
  }
  if (includesAny(haystack, ["frosted glass"]) || (color.includes("frost") && !haystack.includes("plastic"))) {
    return "frosted_glass";
  }
  if (includesAny(haystack, ["frosted plastic"])) return "frosted_plastic";
  if (includesAny(haystack, ["amber"])) return "amber_glass";
  if (includesAny(haystack, ["cobalt", "blue glass"]) || color.includes("blue")) return "cobalt_glass";
  if (includesAny(haystack, ["green glass"]) || color.includes("green")) return "green_glass";
  if (
    includesAny(haystack, ["clear plastic", "molded plastic"]) &&
    family !== "cylinder" &&
    family !== "boston_round" &&
    family !== "roll_on" &&
    family !== "dropper" &&
    family !== "classic_spray"
  ) {
    return "clear_molded_plastic";
  }

  return "clear_glass";
}

export function inferBestBottlesPromptClosure(product: ProductLike): string {
  const haystack = normalizeText(compact([
    product.graceSku,
    product.websiteSku,
    product.applicator,
    product.capStyle,
    product.itemName,
    product.itemDescription,
  ]));

  if (includesAny(haystack, ["roll-on", "roll on", "roller", "-mrl-", "-rol-"])) return "metal_roller_ball";
  if (includesAny(haystack, ["dropper", "-drp-", "pipette"])) return "dropper";
  if (includesAny(haystack, ["atomizer", "-atm-", "gb-atm"])) return "atomizer_sprayer";
  if (includesAny(haystack, ["vintage bulb", "bulb sprayer", "tassel"])) return "vintage_bulb_sprayer";
  if (includesAny(haystack, ["lotion pump"])) return "lotion_pump";
  if (includesAny(haystack, ["fine mist", "sprayer", "-spr-"])) return "fine_mist_sprayer";
  if (includesAny(haystack, ["pump"])) return "classic_spray_pump";
  if (includesAny(haystack, ["reducer", "orifice"])) return "orifice_reducer";
  if (includesAny(haystack, ["splash"])) return "splash_cap";
  if (includesAny(haystack, ["carton", "box", "bag"])) return "none";
  return "screw_cap";
}

function inferFrameClass(productFamily: string, product: ProductLike): string {
  if (productFamily === "cream_jar") return "low_wide_jar";
  if (productFamily === "box" || productFamily === "bag") return "box_or_bag";
  if (
    productFamily === "empire" ||
    productFamily === "vintage_bulb_sprayer" ||
    productFamily === "decorative_bottle"
  ) {
    return "decorative_silhouette";
  }
  if (
    productFamily === "cylinder" ||
    productFamily === "roll_on" ||
    productFamily === "atomizer" ||
    productFamily === "vial" ||
    productFamily === "fine_mist_sprayer"
  ) {
    if (
      productFamily === "cylinder" &&
      getBestBottlesCylinderFamilyProfile(product).id === "sample-vial"
    ) {
      return "medium_upright";
    }
    return "tall_narrow";
  }
  return "medium_upright";
}

function inferBodyShape(product: ProductLike, productFamily: string): string {
  const capacity = product.capacityMl ? `${product.capacityMl} ml ` : "";
  const color = product.color ? `${product.color} ` : "";
  const familyLabel = (product.family || product.bottleCollection || productFamily).replace(/_/g, " ");
  return `${capacity}${color}${familyLabel}`.trim();
}

function inferFineMistCollarMaterial(product: ProductLike): string {
  const haystack = skuOrCatalogText(product);
  const trim = normalizeText(product.trimColor ?? "");
  const cap = normalizeText(product.capColor ?? "");
  if (
    trim.includes("matte silver") ||
    cap.includes("matte silver") ||
    includesAny(haystack, ["-mslv", " mslv", "matte silver", "matt silver", "ltnmtsl"])
  ) {
    return "matte_silver_metal";
  }
  if (
    trim.includes("gold") ||
    cap === "gold" ||
    includesAny(haystack, ["-gld", " gld", "gold collar", "polished gold", "shiny gold"])
  ) {
    return "polished_gold_metal";
  }
  if (
    trim.includes("silver") ||
    trim.includes("chrome") ||
    cap === "silver" ||
    cap === "chrome" ||
    includesAny(haystack, ["-slv", " slv", "silver collar", "chrome collar", "polished silver"])
  ) {
    return "polished_silver_metal";
  }
  if (trim.includes("black") || cap === "black" || includesAny(haystack, ["black collar"])) {
    return "black plastic";
  }
  return "none";
}

function formatMaterialLabel(material: string): string {
  if (material === "polished_gold_metal") return "polished gold";
  if (material === "polished_silver_metal") return "polished silver";
  if (material === "matte_silver_metal") return "matte silver";
  if (material === "black plastic") return "black";
  if (material === "white plastic") return "white";
  return material.replace(/_/g, " ");
}

function inferClosureMaterial(product: ProductLike, closureType: string): string {
  const cap = product.capColor?.trim() || "";
  if (closureType === "fine_mist_sprayer") {
    const collar = inferFineMistCollarMaterial(product);
    const collarLabel = collar === "none" ? "" : ` with ${formatMaterialLabel(collar)} collar`;
    return `white plastic actuator${collarLabel}`;
  }
  if (closureType === "lotion_pump") {
    const collar = inferFineMistCollarMaterial(product);
    const collarLabel = collar === "none" ? "" : ` with ${formatMaterialLabel(collar)} collar`;
    return `white plastic pump${collarLabel}`;
  }
  if (closureType === "metal_roller_ball") return `metal roller ball${cap ? ` with ${cap} cap` : ""}`;
  if (closureType === "dropper") return `${cap || "black"} dropper with rubber bulb and glass pipette`;
  if (closureType === "atomizer_sprayer") return `${cap || product.color || "opaque"} metal atomizer sprayer`;
  if (closureType === "none") return "none";
  return cap ? `${cap} closure` : closureType.replace(/_/g, " ");
}

function inferCollarMaterial(product: ProductLike): string {
  const closure = inferBestBottlesPromptClosure(product);
  if (closure === "fine_mist_sprayer" || closure === "lotion_pump") {
    return inferFineMistCollarMaterial(product);
  }
  const trim = normalizeText(product.trimColor ?? "");
  if (trim.includes("gold")) return "polished_gold_metal";
  if (trim.includes("silver") || trim.includes("chrome")) return "polished_silver_metal";
  if (trim.includes("black")) return "black plastic";
  if (trim.includes("white")) return "white plastic";
  return product.trimColor?.trim() || "none";
}

function inferCapColor(product: ProductLike, closureType: string): string {
  if (closureType === "fine_mist_sprayer" || closureType === "lotion_pump") {
    return "clear or white over-cap";
  }
  return product.capColor?.trim().toLowerCase() || "none";
}

function inferDetachedComponents(product: ProductLike, closureType: string): string[] {
  const haystack = normalizeText(compact([
    product.itemName,
    product.itemDescription,
    product.capStyle,
    product.capColor,
    product.applicator,
  ]));
  if (includesAny(haystack, ["detached cap", "loose cap", "overcap", "over-cap", "cap off"])) {
    if (includesAny(haystack, ["clear", "translucent", "white"])) return ["clear_or_white_overcap"];
    return ["overcap"];
  }
  return [];
}

function inferTransparency(product: ProductLike, bodyMaterial: string): string {
  if (bodyMaterial.includes("glass") || bodyMaterial === "clear_molded_plastic") return "transparent";
  if (bodyMaterial.includes("frosted")) return "translucent";
  if (bodyMaterial.includes("fabric") || bodyMaterial.includes("paperboard")) return bodyMaterial.replace(/_/g, " ");
  return "opaque";
}

function buildSpecialGeometryNotes(product: ProductLike, family: string, closureType: string): string {
  const notes: string[] = [];
  const name = normalizeText(compact([product.itemName, product.itemDescription]));
  if (family === "cylinder") notes.push("Straight vertical Cylinder sidewalls, circular base, and family baseline remain locked.");
  if (
    includesAny(name, ["swirl", "swirled", "swrl", "spiral", "helical", "fluted"])
  ) {
    notes.push(
      "Preserve swirl-fluted clear glass: shallow diagonal helical ribs belong only to the bottle body; keep the cap, sprayer, collar, tube, and detached over-cap smooth and non-swirl.",
    );
  }
  if (closureType === "fine_mist_sprayer") {
    notes.push("Preserve white plastic actuator/nozzle face, polished collar stack, and exactly one cap state from the reference.");
    notes.push("Do not merge the white actuator, gold/silver collar, clear/white over-cap, or internal dip tube into the body; each component must stay visually separate.");
    notes.push("Clear or white over-cap must remain visible with rim ellipse, sidewall edge, top lip, inner back edge, and local shadow separation.");
  }
  if (closureType === "lotion_pump") {
    notes.push("Preserve white plastic pump head, nozzle face, matte/polished collar stack, and exactly one cap state from the reference.");
    notes.push("Do not merge the white pump, gold/silver collar, clear/white over-cap, or internal dip tube into the body; each component must stay visually separate.");
    notes.push("Clear or white over-cap must remain visible with rim ellipse, sidewall edge, top lip, inner back edge, and local shadow separation.");
  }
  const spec = glassBodyPromptSpec(product, resolveProductShoulderLock(product));
  if (spec.bareMm != null || spec.diameterMm != null || spec.neck) {
    notes.push(
      `Measurement hint: body height ${spec.bareMm != null ? `${spec.bareMm} mm` : "unknown"}, diameter/width ${spec.diameterMm != null ? `${spec.diameterMm} mm` : "unknown"}${spec.neck ? `, neck ${spec.neck}` : ""}.`,
    );
  }
  return notes.join(" ");
}

function selectedCanvasLabel(sku: PromptSku): string {
  return `${sku.output_canvas_width}x${sku.output_canvas_height}`;
}

function isTopologyWideCanvas(product: ProductLike, sku: PromptSku): boolean {
  return (
    selectedCanvasLabel(sku) === "1536x1024"
    && /\b(?:tassel|antique\s+bulb|vintage\s+bulb)\b/i.test(
      skuOrCatalogText(product),
    )
  );
}

function buildCanvasPreflight(product: ProductLike, sku: PromptSku): BestBottlesCanvasPreflight {
  const selectedCanvas = selectedCanvasLabel(sku);
  const qaChecklist = [`canvas_selected:${selectedCanvas}`];
  const warnings: string[] = [];

  if (sku.product_family !== "cylinder") {
    return { qaChecklist, warnings };
  }

  const profile = getBestBottlesFamilyProfileForProduct(product) ?? getBestBottlesCylinderFamilyProfile(product);
  const ratio = getBestBottlesCylinderHeightDiameterRatio(product);
  const ratioText = ratio == null ? "unknown" : ratio.toFixed(2);
  const recommendedCanvas = `${profile.canvas.widthPx}x${profile.canvas.heightPx}`;

  if (isTopologyWideCanvas(product, sku)) {
    qaChecklist.push("canvas_contract:topology-wide-v1");
    qaChecklist.push("primary_object_centerline:65pct");
  } else {
    qaChecklist.push("canvas_recommendation:fixed_studio_2080x2288");
    qaChecklist.push("primary_object_centerline:canvas_center");
  }
  qaChecklist.push(`cylinder_family_profile:${profile.id}`);
  qaChecklist.push(`relative_scale_zone:${profile.relativeScaleZoneId}`);
  qaChecklist.push("detached_component_sidecar:right_does_not_shift_primary");

  if (selectedCanvas !== recommendedCanvas && !isTopologyWideCanvas(product, sku)) {
    warnings.push(
      `Cylinder family uses the fixed 2080 x 2288 studio canvas; selected ${selectedCanvas}. Profile ${profile.id} uses relative scale zone ${profile.relativeScaleZoneId} with target height ${profile.targetProductHeightPct}% inside the ${profile.targetProductHeightRangePct.min}-${profile.targetProductHeightRangePct.max}% fill-height range. Primary bottle remains centered. Measured height/diameter ratio is ${ratioText}:1.`,
    );
  }

  return { qaChecklist, warnings };
}

// Grounding-shadow directive shared by every family's framing block. The catalog
// canon only asks for a vague "contact-only shadow" with no target, so shadows
// rendered faint and inconsistent. This quantified directive makes the shadow
// clearly present and repeatable across families. Tune the opacity/feather here —
// it is the single knob for catalog shadow strength. (Shadows are still model-
// drawn, so this tightens the distribution rather than pixel-locking it; the
// post-generation color-correct preserves whatever the model draws.)
const BEST_BOTTLES_CONTACT_SHADOW_DIRECTIVE =
  "- Ground the product with a soft but clearly visible contact shadow directly beneath the bottle base, and a matching one beneath the detached cap: darkest right at the contact line at roughly 32-42% opacity, feathering outward and fading within about 15-20% of the bottle's width. One soft key light means one soft-edged shadow — no hard outline, no long dramatic cast, no doubled shadow, no mirror reflection, and no visible floor plane.";

function parseLeadingMm(value: string | null | undefined): number | null {
  const match = String(value ?? "").match(/[\d.]+/);
  const parsed = match ? Number(match[0]) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Numeric proportion anchor. The framing block gives the model a numeric HEIGHT
 * target but historically nothing numeric about width, so the model satisfied
 * fill height with its slender-vial prior (+11%/+23% vertical stretch measured
 * 2026-07-19). Anchoring the second axis with canonical mm closes that gap;
 * the aspect-ratio framing QA gate catches whatever drift remains.
 */
const CANONICAL_FIFTY_ML_GLASS: Record<
  string,
  { bareMm: number; diameterMm: number; neck: string; withCapMm: number | null }
> = {
  "cylinder:50-standard": { bareMm: 117, diameterMm: 32, neck: "18-415", withCapMm: null },
  "cylinder:50-rollon": { bareMm: 98, diameterMm: 37, neck: "16 mm", withCapMm: 116 },
};

type GlassBodyPromptSpec = {
  bareMm: number | null;
  diameterMm: number | null;
  neck: string | null;
  withCapMm: number | null;
  catalogDisagrees: boolean;
};

function neckMatchesCanonical(neck: string | null | undefined, canonical: string): boolean {
  if (!neck) return false;
  if (canonical === "16 mm") {
    return /\b16\s*mm\b/i.test(neck) && !/\b18\s*[-/]?\s*415\b/i.test(neck);
  }
  return /\b18\s*[-/]?\s*415\b/i.test(neck);
}

function glassBodyPromptSpec(
  product: ProductLike,
  lock: ResolvedShoulderLock | null,
): GlassBodyPromptSpec {
  const catalogBare = parseLeadingMm(product.heightWithoutCap);
  const catalogDiameter = parseLeadingMm(product.diameter);
  const catalogWithCap = parseLeadingMm(product.heightWithCap);
  const canonical = lock ? CANONICAL_FIFTY_ML_GLASS[lock.glassBodyKey] : undefined;
  if (!canonical) {
    return {
      bareMm: catalogBare,
      diameterMm: catalogDiameter,
      neck: product.neckThreadSize ?? null,
      withCapMm: catalogWithCap,
      catalogDisagrees: false,
    };
  }

  const bareAgrees = catalogBare != null && Math.abs(catalogBare - canonical.bareMm) <= 8;
  const diameterAgrees = catalogDiameter == null || Math.abs(catalogDiameter - canonical.diameterMm) <= 1;
  const withCapMm = catalogWithCap != null && catalogWithCap >= canonical.bareMm
    ? catalogWithCap
    : canonical.withCapMm;
  return {
    bareMm: bareAgrees ? catalogBare : canonical.bareMm,
    diameterMm: diameterAgrees && catalogDiameter != null ? catalogDiameter : canonical.diameterMm,
    neck: neckMatchesCanonical(product.neckThreadSize, canonical.neck)
      ? product.neckThreadSize ?? canonical.neck
      : canonical.neck,
    withCapMm,
    catalogDisagrees: !bareAgrees || !diameterAgrees,
  };
}

function formatGlassBodySpecification(spec: GlassBodyPromptSpec): string | null {
  if (spec.bareMm == null) return null;
  const parts = [`${spec.bareMm} mm bare glass`];
  if (spec.diameterMm != null) parts.push(`${spec.diameterMm} mm diameter`);
  if (spec.neck) parts.push(`neck ${spec.neck}`);
  if (spec.withCapMm != null) parts.push(`${spec.withCapMm} mm with cap`);
  return parts.join(", ");
}

function resolveProductShoulderLock(product: ProductLike): ResolvedShoulderLock | null {
  return resolveShoulderLock({
    family: product.family,
    bottleCollection: product.bottleCollection,
    graceSku: product.graceSku,
    websiteSku: product.websiteSku,
    itemName: product.itemName,
    capacityMl: product.capacityMl,
    heightWithoutCap: product.heightWithoutCap,
    applicator: product.applicator,
    neckThreadSize: product.neckThreadSize,
  });
}

function buildShoulderLockScaleLines(
  product: ProductLike,
  lock: ResolvedShoulderLock,
): string[] {
  const spec = glassBodyPromptSpec(product, lock);
  const specification = formatGlassBodySpecification(spec);
  const specSentence = specification
    ? spec.catalogDisagrees
      ? `- GLASS BODY SPECIFICATION: ${specification}. The catalog row for this SKU disagrees (heightWithoutCap = ${product.heightWithoutCap ?? "missing"}; diameter = ${product.diameter ?? "missing"}). Use the glass body specification, not that row. These millimeters describe the physical bottle. They do not choose the on-canvas percentage.`
      : `- GLASS BODY SPECIFICATION: ${specification}. These millimeters describe the physical bottle. They do not choose the on-canvas percentage.`
    : null;
  return [
    specSentence,
    lock.landmark === "closure-seat"
      ? `- SHOULDER LOCK (${lock.lockVersion} · ${lock.glassBodyKey}): seat the glass foot on the shared 91% baseline. The closure seat — the top edge of the glass neck ring, exactly where the cap or collar starts — MUST land at ${lock.shoulderPct}% of canvas height above that baseline (${lock.shoulderYFromTopPct}% down from the top of the canvas). The whole glass body, from its foot up through the rounded body to that neck ring, sits below this line. Every SKU that shares this glass body (${lock.label}) uses this same horizon. Fitments (roller, sprayer, pump, cap) rise above the closure seat by their real physical height; do not scale the bottle to the top of the fitment.`
      : `- SHOULDER LOCK (${lock.lockVersion} · ${lock.glassBodyKey}): seat the glass foot on the shared 91% baseline. The glass shoulder — where the body ends and the neck begins, or where glass meets the cap/collar — MUST land at ${lock.shoulderPct}% of canvas height above that baseline (${lock.shoulderYFromTopPct}% down from the top of the canvas). Every SKU that shares this glass body (${lock.label}) uses this same shoulder horizon. Fitments (roller, sprayer, pump, cap) rise above the shoulder by their real physical height; do not scale the bottle to the top of the fitment.`,
    "- Do not use assembled envelope or fitment top as the scale driver.",
    "- Fitments rise above the locked shoulder by their real physical height. Do not treat the full assembly (glass + cap/applicator) as the scale driver.",
    "- Ecommerce fill is mandatory: the SHOULDER LOCK horizon above must dominate the canvas. Do not leave the product tiny with excessive empty margins, and do not crop any part (cap, base, applicator, detached cap, or grounding shadow).",
  ].filter((line): line is string => Boolean(line));
}

function buildProportionLockLine(
  product: ProductLike,
  profile: BestBottlesFamilyProfile,
  topology: BestBottlesShadowTopology,
  lock: ResolvedShoulderLock | null,
): string | null {
  const spec = glassBodyPromptSpec(product, lock);
  const bodyHeightMm = spec.bareMm;
  const capHeightMm = spec.withCapMm;
  const diameterMm = spec.diameterMm;
  if (diameterMm == null || (bodyHeightMm == null && capHeightMm == null)) return null;

  const parts: string[] = ["- Canonical proportion lock:"];
  if (bodyHeightMm != null) {
    parts.push(
      `the glass body is ${bodyHeightMm} mm tall × ${diameterMm} mm wide (${(bodyHeightMm / diameterMm).toFixed(2)}:1 height-to-width)`,
    );
  }
  if (capHeightMm != null) {
    parts.push(
      `${bodyHeightMm != null ? "and " : "the product is "}${capHeightMm} mm tall with cap (${(capHeightMm / diameterMm).toFixed(2)}:1)`,
    );
  }
  if (!lock && topology.kind === "assembled" && capHeightMm != null) {
    const widthPct = Math.round(
      ((profile.targetProductHeightPct / 100) * profile.canvas.heightPx *
        (diameterMm / capHeightMm) / profile.canvas.widthPx) * 100,
    );
    parts.push(
      `— at the ${profile.targetProductHeightPct}% fill height the body spans approximately ${widthPct}% of the canvas width`,
    );
  }
  parts.push(
    ". Match this width-to-height relationship exactly; never render the product taller, thinner, or more slender than these canonical proportions.",
  );
  return parts.join(" ").replace(/\s+\./g, ".");
}

function buildFramingProfilePrompt(
  product: ProductLike,
  profile: BestBottlesFamilyProfile | null,
  policy: BestBottlesShadowPolicy,
  topology: BestBottlesShadowTopology,
  bodyMaterial: PromptSku["body_material"],
): string | null {
  if (!profile) return null;
  const label = profile.label.toUpperCase();
  const baselineLow = profile.baselinePct - 1;
  const baselineHigh = profile.baselinePct + 1;
  const shoulderLock = resolveProductShoulderLock(product);
  const scaleLines = shoulderLock
    ? buildShoulderLockScaleLines(product, shoulderLock)
    : [
        profile.geometryScaleVersion
          ? `- Relative scale zone: ${profile.relativeScaleZoneLabel} (${profile.relativeScaleZoneId}). Reconciled body geometry owns assembled height through ${profile.geometryScaleVersion}; this zone classifies composition only.`
          : `- Relative scale zone: ${profile.relativeScaleZoneLabel} (${profile.relativeScaleZoneId}). The versioned global catalog curve owns assembled height; this zone classifies composition only.`,
        `- Approved fill-height range: ${profile.targetProductHeightRangePct.min}-${profile.targetProductHeightRangePct.max}% of the canvas height for this family profile.`,
        `- Render the full assembled product so it fills approximately ${profile.targetProductHeightPct}% of the canvas height and no more than ${profile.fillWidthPct}% of the canvas width.`,
      ];

  return [
    `${label} FRAMING PROFILE (CANVAS COMPOSITION AUTHORITY):`,
    `- Canvas is fixed at ${profile.canvas.widthPx} × ${profile.canvas.heightPx}. Do not change aspect ratio, crop, or canvas size.`,
    "- The reference image is product truth, not framing truth. Preserve the product identity and proportions, but do not inherit the reference image's tiny source scale, source crop, source padding, or off-center placement.",
    ...scaleLines,
    buildProportionLockLine(product, profile, topology, shoulderLock),
    `- Seat the visible bottle base on the shared studio baseline at ${baselineLow}-${baselineHigh}% up from the canvas bottom.`,
    `- Keep the primary bottle centered on the canvas vertical centerline at ${profile.primaryObjectCenterXPct}% width.`,
    profile.detachedComponentPlacement === "right-sidecar"
      && !isAssembledOnlyVintageBulbIdentity(product)
      ? "- If a detached cap or applicator is present, keep it as a right-sidecar component on the same baseline; it must not shift the primary bottle off center."
      : isAssembledOnlyVintageBulbIdentity(product)
        ? "- Vintage style bulb and vintage style bulb tassel are one complete assembled image. Do not invent a cap-off state, detached cap, or sidecar."
        : null,
    policy.owner === "model"
      ? buildModelOwnedShadowPrompt(topology)
      : BEST_BOTTLES_CONTACT_SHADOW_DIRECTIVE,
    // Clear round glass needs an optical volume cue because a white-background
    // product reference otherwise reads as a flat white cutout on the Bone canvas.
    // Keep this scoped to clear_glass profiles that explicitly declare the cue.
    // The separate component material-targeting cue remains intentionally absent,
    // so this cannot reintroduce cap / sidecar refinishing or "paint stripped" drift.
    bodyMaterial === "clear_glass" ? profile.glassGeometryHint : null,
    "- Keep all physical proportions locked to the reference; this framing profile controls only placement, scale on canvas, baseline, centering, and grounding shadow.",
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function buildFinalPrompt(product: ProductLike, sku: PromptSku): string {
  const policy = resolveBestBottlesShadowPolicy({
    graceSku: sku.sku,
    websiteSku: product.websiteSku,
    family: product.family ?? sku.product_family,
    bottleCollection: product.bottleCollection,
  });
  const canonParts = buildBestBottlesCatalogCanonPromptParts(sku, policy);
  const topology = resolveBestBottlesShadowTopology(product, sku);
  const baseProfile = getBestBottlesCatalogFramingProfile(product);
  const profile = baseProfile && isTopologyWideCanvas(product, sku)
    ? {
        ...baseProfile,
        canvas: {
          widthPx: sku.output_canvas_width,
          heightPx: sku.output_canvas_height,
        },
        fillWidthPct: 94,
        primaryObjectCenterXPct: 65,
      }
    : baseProfile;
  // Use the catalog-path resolver so EVERY family ships a real FRAMING PROFILE
  // block — never a blank one (previous behavior for unprofiled families).
  const prompt = [
    canonParts.basePrompt,
    buildFramingProfilePrompt(
      product,
      profile,
      policy,
      topology,
      sku.body_material,
    ),
    canonParts.finalStudioDirection,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n\n");
  if (!isTopologyWideCanvas(product, sku)) return prompt;
  return prompt
    .replace(/2080 × 2288/g, "1536 × 1024")
    .replace(/2080 x 2288/g, "1536 x 1024")
    .replace(/2080x2288/g, "1536x1024");
}

export function buildBestBottlesPromptSkuFromProduct(rawInput: PromptSkuBuildInput): PromptSku {
  // Same catalog color correction the generation-identity layer applies, so the
  // compiled prompt's cap/closure language matches the real product.
  const input = { ...rawInput, product: applyBestBottlesCapColorOverride(rawInput.product) };
  const sku = getSku(input.product);
  const productFamily = inferBestBottlesPromptFamily(input.product);
  const bodyMaterial = inferBestBottlesPromptBodyMaterial(input.product, input.bodyMaterial);
  const closureType = inferBestBottlesPromptClosure(input.product);
  const widthPx = input.canvas?.widthPx ?? 2080;
  const heightPx = input.canvas?.heightPx ?? 2288;
  const referenceImagePath = input.referenceImagePath?.trim() ?? "";

  return {
    sku,
    filename: getFilename(referenceImagePath, sku),
    product_family: productFamily,
    frame_class: inferFrameClass(productFamily, input.product),
    body_shape: inferBodyShape(input.product, productFamily),
    body_material: bodyMaterial,
    body_color: input.product.color?.trim().toLowerCase() || "unknown",
    closure_type: closureType,
    closure_material: inferClosureMaterial(input.product, closureType),
    cap_color: inferCapColor(input.product, closureType),
    collar_material: inferCollarMaterial(input.product),
    applicator_type: closureType,
    detached_components: inferDetachedComponents(input.product, closureType),
    orientation: "front",
    transparency_type: inferTransparency(input.product, bodyMaterial),
    special_geometry_notes: buildSpecialGeometryNotes(input.product, productFamily, closureType),
    reference_image_path: referenceImagePath,
    output_canvas_width: widthPx,
    output_canvas_height: heightPx,
  };
}

function getWarnings(
  product: ProductLike,
  sku: PromptSku,
  declaredBodyMaterial?: string | null,
  canvasWarnings: string[] = [],
): string[] {
  const warnings: string[] = [...canvasWarnings];
  const declared = normalizeText(declaredBodyMaterial ?? "");
  const productText = normalizeText(compact([product.category, product.family, product.bottleCollection, product.itemName]));
  if (
    declared.includes("plastic") &&
    sku.body_material.includes("glass") &&
    (sku.product_family === "cylinder" || sku.product_family === "roll_on" || sku.product_family === "boston_round")
  ) {
    warnings.push("Catalog material says plastic, but this SKU compiles as glass from the product family/color identity.");
  }
  if (
    productText.includes("plastic") &&
    sku.body_material.includes("glass") &&
    (sku.product_family === "cylinder" || sku.product_family === "roll_on" || sku.product_family === "boston_round")
  ) {
    warnings.push("Catalog category includes plastic wording; prompt locks visible body material as glass.");
  }
  if (
    includesAny(normalizeText(compact([sku.cap_color, sku.closure_material, product.capColor])), [
      "white",
      "clear",
      "translucent",
      "pale",
    ])
  ) {
    warnings.push("White or translucent cap risk: QA must verify cap lip, sidewall, nozzle, and loose cap remain visible.");
  }
  if (sku.detached_components.length > 0) {
    warnings.push("Detached cap expected: QA must verify exactly one loose cap on the shared baseline.");
  }
  return Array.from(new Set(warnings));
}

export function buildBestBottlesPromptPreflight(
  rawInput: BestBottlesPromptPreflightInput,
): BestBottlesPromptPreflight {
  const input = { ...rawInput, product: applyBestBottlesCapColorOverride(rawInput.product) };
  if (!input.referenceImagePath?.trim()) {
    return {
      status: "error",
      issue: "A flattened product-truth reference is required before this SKU can be compiled.",
      warnings: [],
      sku: null,
      record: null,
    };
  }

  const requestedState = `${input.product.capState ?? ""} ${input.product.mode ?? ""}`.toLowerCase();
  const explicitlyDetached = /\b(?:detached|cap[-_\s]?off|exploded)\b/.test(requestedState);
  if (
    input.product.componentTopology === "fitment-attached-cap-right-sidecar"
    && !explicitlyDetached
  ) {
    return {
      status: "error",
      issue: "Fitment-attached cap-right-sidecar topology requires detached cap state.",
      warnings: [],
      sku: null,
      record: null,
    };
  }
  if (explicitlyDetached && !input.product.capOffReferenceId?.trim()) {
    return {
      status: "error",
      issue: "Explicit cap-off generation requires a confirmed cap-off PSD reference ID.",
      warnings: [],
      sku: null,
      record: null,
    };
  }
  const topologyText = [
    input.product.itemName,
    input.product.itemDescription,
    input.product.applicator,
    input.product.capStyle,
  ].filter(Boolean).join(" ");
  if (
    /\b(?:vintage|antique|bulb|tassel|two[- ]piece)\b/i.test(topologyText)
    && !input.product.topologyReferenceId?.trim()
    && !isAssembledOnlyVintageBulbIdentity(input.product)
  ) {
    return {
      status: "error",
      issue: "Multi-component generation requires confirmed topology PSD evidence.",
      warnings: [],
      sku: null,
      record: null,
    };
  }

  const sku = buildBestBottlesPromptSkuFromProduct(input);
  const policy = resolveBestBottlesShadowPolicy({
    graceSku: sku.sku,
    websiteSku: input.product.websiteSku,
    family: input.product.family ?? sku.product_family,
    bottleCollection: input.product.bottleCollection,
  });
  const shadowTopology = resolveBestBottlesShadowTopology(input.product, sku);
  const canvasPreflight = buildCanvasPreflight(input.product, sku);
  const warnings = getWarnings(input.product, sku, input.bodyMaterial, canvasPreflight.warnings);
  // NOTE: buildPromptForSku() (the config/product_families.json + master_pdp_prompt.md
  // module system) is run ONLY to VALIDATE the SKU and to seed family-specific qa_checklist
  // entries. Its own `final_prompt` output is intentionally DISCARDED and replaced by
  // buildFinalPrompt() — the vendored catalog canon (src/config/bestBottlesCatalogCanon.ts)
  // + the per-family framing profile. The canon+framing string is the ONLY prompt that
  // actually ships to the image model. Do not "fix" this by using the module final_prompt.
  //
  // A missing module (a catalog family we have not added to product_families.json) must NOT
  // block generation: the shipped canon+framing prompt does not depend on the module system.
  // So module validation is best-effort — on failure we degrade to canon-only QA + a warning
  // instead of erroring, and every bottle family still generates.
  const moduleWarnings: string[] = [];
  let moduleQaChecklist: string[] = [];
  try {
    moduleQaChecklist = buildPromptForSku(sku, input.system).qa_checklist;
  } catch (error) {
    moduleQaChecklist = BASE_MODULE_QA_CHECKLIST;
    moduleWarnings.push(
      `Module validation skipped for family "${sku.product_family}" (${
        error instanceof Error ? error.message : "unknown module"
      }); shipping the catalog canon + framing prompt without family-specific QA seeds.`,
    );
  }

  let finalPrompt: string;
  try {
    finalPrompt = buildFinalPrompt(input.product, sku);
  } catch (error) {
    return {
      status: "error",
      issue: error instanceof Error ? error.message : "Prompt compilation failed.",
      warnings,
      sku,
      record: null,
    };
  }

  const scaleProfile = getBestBottlesCatalogFramingProfile(input.product);
  // The validation-only module compiler can emit capacity-derived scale tags.
  // The shipped catalog prompt is compiled later from canonical product geometry,
  // so retain exactly one authoritative set and never expose contradictory tags
  // to downstream QA parsers.
  const moduleQaWithoutScale = moduleQaChecklist.filter(
    (tag) => (
      !tag.startsWith("scale-")
      && !tag.startsWith("geometry-scale:")
      && !tag.startsWith("shadow-topology:")
      && !tag.startsWith("shadow-contact:")
      && !tag.startsWith("component-topology:")
      && !tag.startsWith("cap-off-psd:")
      && !tag.startsWith("topology-psd:")
    ),
  );
  const record: PromptRecord = {
    sku: sku.sku,
    reference_image_path: sku.reference_image_path,
    product_family: sku.product_family,
    frame_class: sku.frame_class,
    prompt_version: policy.promptVersion,
    shadow_owner: policy.owner,
    final_prompt: finalPrompt,
    qa_checklist: Array.from(
      new Set([
        ...moduleQaWithoutScale,
        ...canvasPreflight.qaChecklist,
        ...getBestBottlesShadowPolicyTags(policy),
        `scale-contract:${BEST_BOTTLES_CATALOG_SCALE_VERSION}`,
        `scale-global-target:${scaleProfile.globalTargetProductHeightPct}`,
        `scale-family-correction:${scaleProfile.familyScaleCorrectionPct}`,
        `scale-assembled-target:${scaleProfile.targetProductHeightPct}`,
        ...(scaleProfile.geometryScaleVersion
          ? [`geometry-scale:${scaleProfile.geometryScaleVersion}`]
          : []),
        ...(input.product.capOffReferenceId
          ? [`cap-off-psd:${input.product.capOffReferenceId}`]
          : []),
        ...(input.product.topologyReferenceId
          ? [`topology-psd:${input.product.topologyReferenceId}`]
          : []),
        ...(input.product.componentTopology
          ? [`component-topology:${input.product.componentTopology}`]
          : []),
        `shadow-topology:${shadowTopology.kind}`,
        ...shadowTopology.expectedContacts.map(
          (contact) => `shadow-contact:${contact}`,
        ),
        BEST_BOTTLES_CATALOG_CANON_PROMPT_FLAG,
        `catalog_canon_source:${BEST_BOTTLES_CATALOG_CANON_SOURCE_PATH}`,
      ]),
    ),
  };
  const allWarnings = Array.from(new Set([...warnings, ...moduleWarnings]));
  return {
    status: allWarnings.length > 0 ? "warn" : "ok",
    issue: null,
    warnings: allWarnings,
    sku,
    record,
  };
}
