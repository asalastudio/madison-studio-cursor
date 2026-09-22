import {
  getFamilyRigForProduct,
  isCylinderFamilyAlias,
  type FamilyRigConfig,
} from "./familyRig.ts";
import {
  BEST_BOTTLES_COMPARISON_PROVIDER_TAG,
  BEST_BOTTLES_PRODUCTION_MODEL,
  shouldForceBestBottlesOpenAIProvider,
} from "./bestBottlesProviderRouting.ts";

export type BestBottlesRenderingLane =
  | "bottle_catalog"
  | "component_enhancement"
  | "packaging_enhancement"
  | "blocked_unknown";

export type BestBottlesBottleScaleStatus =
  | "mapped"
  | "needs_review"
  | "not_bottle"
  | "blocked";

export type BestBottlesEnhancementStatus = "ready" | "needs_review" | "blocked";

export type BestBottlesContractStatus = "ready" | "needs_review" | "blocked";

export type BestBottlesPromptProfile =
  | "bottle_glass"
  | "component_enhancement"
  | "packaging_enhancement"
  | "blocked";

export interface BestBottlesContractCanvas {
  width: number;
  height: number;
  backgroundHex: string;
  baselinePct: number;
  primaryObjectCenterXPct: number;
}

export const BEST_BOTTLES_CONTRACT_CANVAS: BestBottlesContractCanvas = {
  width: 2080,
  height: 2288,
  backgroundHex: "#F5F3EF",
  baselinePct: 9,
  primaryObjectCenterXPct: 50,
};

export const BEST_BOTTLES_TOPOLOGY_WIDE_CANVAS: BestBottlesContractCanvas = {
  width: 1536,
  height: 1024,
  backgroundHex: "#F5F3EF",
  baselinePct: 9,
  // Preserve the bottle's catalog scale while reserving camera-left room for
  // the hose, bulb, and tassel. This matches the approved PSD composition.
  primaryObjectCenterXPct: 65,
};

export interface BestBottlesContractProduct {
  graceSku?: string | null;
  websiteSku?: string | null;
  family?: string | null;
  bottleCollection?: string | null;
  category?: string | null;
  itemName?: string | null;
  itemDescription?: string | null;
  color?: string | null;
  capacity?: string | null;
  capacityMl?: number | null;
  applicator?: string | null;
  capStyle?: string | null;
  capColor?: string | null;
  trimColor?: string | null;
  heightWithCap?: string | null;
  heightWithoutCap?: string | null;
  diameter?: string | null;
  bodyMaterial?: string | null;
  identityStatus?: string | null;
  identityBlockers?: string[] | null;
}

export interface BestBottlesCategorizedReferences {
  product: Array<{ url: string; description?: string; label?: string }>;
  component?: Array<{ url: string; description?: string; label?: string }>;
  background: Array<{ url: string; description?: string; label?: string }>;
  style: Array<{ url: string; description?: string; label?: string }>;
}

export interface BestBottlesRenderingContractInput {
  isBestBottlesStudioMasterRequest: boolean;
  isRefinement?: boolean;
  allowBestBottlesProviderOverride?: boolean | null;
  productContext?: Record<string, unknown> | null;
  precompiledPromptRecord?: unknown;
  categorizedRefs: BestBottlesCategorizedReferences;
  extraLibraryTags?: string[];
  referenceAuditValues?: readonly unknown[];
}

interface BestBottlesCanonicalGeometryContract {
  version: "best-bottles-canonical-geometry-v1";
  websiteSku: string;
  graceSku: string;
  canon_bodyHeightMm: string;
  canon_heightWithCapMm: string;
  canon_widthAxisMm: string;
  canon_secondAxisMm: string;
  sha256: string;
}

export interface BestBottlesProductTruthResolver {
  fetchProductBySku?: (sku: string) => Promise<BestBottlesContractProduct | null>;
  fetchProductByWebsiteSku?: (websiteSku: string) => Promise<BestBottlesContractProduct | null>;
}

export interface BestBottlesRenderingContract {
  version: "v1";
  status: BestBottlesContractStatus;
  error: string | null;
  product: BestBottlesContractProduct | null;
  productContext: Record<string, unknown>;
  sku: string | null;
  websiteSku: string | null;
  family: string | null;
  renderingLane: BestBottlesRenderingLane;
  bottleScaleStatus: BestBottlesBottleScaleStatus;
  enhancementStatus: BestBottlesEnhancementStatus;
  promptProfile: BestBottlesPromptProfile;
  canvas: BestBottlesContractCanvas;
  rig: FamilyRigConfig | null;
  providerPolicy: {
    provider: "openai" | "requested";
    model: "gpt-image-2.5-sunburst" | null;
    comparisonOnly: boolean;
  };
  qaPolicy: {
    kind: "bottle_framing_qa" | "component_enhancement_qa" | "packaging_enhancement_qa" | "blocked";
    enforceFillHeight: boolean;
    allowedDecisions: Array<"pass" | "normalize" | "reject">;
  };
  libraryTags: string[];
}

interface FamilyLaneDefinition {
  renderingLane: BestBottlesRenderingLane;
  bottleScaleStatus: BestBottlesBottleScaleStatus;
  enhancementStatus: BestBottlesEnhancementStatus;
}

const MAPPED_BOTTLE_FAMILIES = new Set([
  "aluminum bottle",
  "boston round",
  "cylinder",
  "diamond",
  "diva",
  "empire",
  "grace",
  "slim",
  "vial",
]);

const REVIEW_BOTTLE_FAMILIES = new Set([
  "apothecary",
  "atomizer",
  "bell",
  "circle",
  "cream jar",
  "decorative",
  "elegant",
  "flair",
  "lotion bottle",
  "pillar",
  "plastic bottle",
  "rectangle",
  "round",
  "royal",
  "sleek",
  "square",
  "tall cylinder",
  "teardrop",
  "tulip",
]);

const COMPONENT_FAMILIES = new Set([
  "cap/closure",
  "cap/component",
  "dropper",
  "lotion pump",
  "roll-on cap",
  "sprayer",
  "tool",
]);

const PACKAGING_FAMILIES = new Set([
  "gift bag",
  "gift box",
  "packaging supply",
]);

const RETIRED_REFERENCE_TOKENS = [
  "reference-imports/background-removed",
  "reference-imports/bg-removed",
  "background-removed",
  "background_removed",
  "bg-removed",
  "bg_removed",
  "transparent-png",
  "transparent",
  "paper-doll",
  "paperdoll",
  "mask-control",
  "mask_ref",
  "mask-ref",
  "studio-mask-control-references",
];

const BLOCKED_CONTRACT = {
  version: "v1" as const,
  product: null,
  productContext: {},
  sku: null,
  websiteSku: null,
  family: null,
  renderingLane: "blocked_unknown" as const,
  bottleScaleStatus: "blocked" as const,
  enhancementStatus: "blocked" as const,
  promptProfile: "blocked" as const,
  canvas: BEST_BOTTLES_CONTRACT_CANVAS,
  rig: null,
  providerPolicy: {
    provider: "openai" as const,
    model: BEST_BOTTLES_PRODUCTION_MODEL,
    comparisonOnly: false,
  },
  qaPolicy: {
    kind: "blocked" as const,
    enforceFillHeight: false,
    allowedDecisions: ["reject" as const],
  },
  libraryTags: ["contract:v1", "contract-status:blocked", "rendering-lane:blocked_unknown"],
};

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeFamily(value: unknown): string {
  return textValue(value).toLowerCase().replace(/[_]+/g, " ").replace(/\s+/g, " ");
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizedIdentity(value: unknown): string {
  return textValue(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function nominalMillimeters(value: unknown): number | null {
  const normalized = textValue(value);
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function resolveSealedCanonicalCylinderProduct(
  input: BestBottlesRenderingContractInput,
  product: BestBottlesContractProduct,
): Promise<{ product: BestBottlesContractProduct; geometry: BestBottlesCanonicalGeometryContract | null; error: string | null }> {
  const family = product.family ?? product.bottleCollection;
  if (!isCylinderFamilyAlias(family)) return { product, geometry: null, error: null };
  const raw = readRecord(input.productContext?.canonicalGeometryContract);
  if (!raw) {
    return {
      product,
      geometry: null,
      error: "Best Bottles Cylinder generation requires a sealed canonical geometry contract.",
    };
  }

  const geometry = {
    version: textValue(raw.version),
    websiteSku: textValue(raw.websiteSku),
    graceSku: textValue(raw.graceSku),
    canon_bodyHeightMm: textValue(raw.canon_bodyHeightMm),
    canon_heightWithCapMm: textValue(raw.canon_heightWithCapMm),
    canon_widthAxisMm: textValue(raw.canon_widthAxisMm),
    canon_secondAxisMm: textValue(raw.canon_secondAxisMm),
    sha256: textValue(raw.sha256).toLowerCase(),
  };
  if (
    geometry.version !== "best-bottles-canonical-geometry-v1"
    || !/^[a-f0-9]{64}$/.test(geometry.sha256)
    || [
      geometry.canon_bodyHeightMm,
      geometry.canon_heightWithCapMm,
      geometry.canon_widthAxisMm,
      geometry.canon_secondAxisMm,
    ].some((value) => nominalMillimeters(value) == null)
  ) {
    return { product, geometry: null, error: "Best Bottles sealed canonical geometry contract is malformed." };
  }
  const sealInput = {
    version: geometry.version,
    websiteSku: geometry.websiteSku,
    graceSku: geometry.graceSku,
    canon_bodyHeightMm: geometry.canon_bodyHeightMm,
    canon_heightWithCapMm: geometry.canon_heightWithCapMm,
    canon_widthAxisMm: geometry.canon_widthAxisMm,
    canon_secondAxisMm: geometry.canon_secondAxisMm,
  };
  if (await sha256Hex(JSON.stringify(sealInput)) !== geometry.sha256) {
    return { product, geometry: null, error: "Best Bottles sealed canonical geometry contract SHA-256 is invalid." };
  }
  if (
    normalizedIdentity(geometry.websiteSku) !== normalizedIdentity(product.websiteSku)
    || normalizedIdentity(geometry.graceSku) !== normalizedIdentity(product.graceSku)
  ) {
    return { product, geometry: null, error: "Best Bottles sealed canonical geometry contract does not match the exact dual identity." };
  }

  return {
    product: {
      ...product,
      heightWithoutCap: `${geometry.canon_bodyHeightMm} mm`,
      heightWithCap: `${geometry.canon_heightWithCapMm} mm`,
      diameter: `${geometry.canon_widthAxisMm} mm`,
    },
    geometry: geometry as BestBottlesCanonicalGeometryContract,
    error: null,
  };
}

function readSkuCandidates(input: BestBottlesRenderingContractInput): string[] {
  const productContext = input.productContext ?? {};
  const precompiled = readRecord(input.precompiledPromptRecord);
  const tagSku = input.extraLibraryTags
    ?.find((tag) => tag.startsWith("sku:"))
    ?.slice("sku:".length);

  return Array.from(new Set([
    textValue(precompiled?.sku),
    textValue(productContext.sku),
    textValue(productContext.graceSku),
    textValue(tagSku),
    textValue(productContext.websiteSku),
  ].filter(Boolean)));
}

const CALLER_ROLE_TOPOLOGY_FIELDS = [
  "presetId",
  "capState",
  "mode",
  "componentTopology",
  "capOffReferenceId",
  "topologyReferenceId",
  "referenceRoleId",
  "roleId",
  "capIdentityReferenceSku",
  "styleReferenceSurface",
  "styleReferenceImageId",
  "styleReferenceImageUrl",
  "styleReferenceExportSha256",
] as const;

function callerRoleTopologyContext(
  inputContext: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!inputContext) return {};
  return Object.fromEntries(
    CALLER_ROLE_TOPOLOGY_FIELDS
      .filter((field) => Object.prototype.hasOwnProperty.call(inputContext, field))
      .map((field) => [field, inputContext[field]]),
  );
}

function contractProductContext(
  product: BestBottlesContractProduct,
  inputContext?: Record<string, unknown> | null,
  canvas: BestBottlesContractCanvas = BEST_BOTTLES_CONTRACT_CANVAS,
): Record<string, unknown> {
  return {
    ...product,
    ...callerRoleTopologyContext(inputContext),
    sku: product.graceSku ?? null,
    name: product.itemName ?? null,
    collection: product.bottleCollection ?? null,
    canvas: `${canvas.width}x${canvas.height}`,
    primaryObjectCenterXPct: canvas.primaryObjectCenterXPct,
    rigVersion: "best-bottles-rendering-contract-v1",
  };
}

function isTopologyWideProduct(product: BestBottlesContractProduct): boolean {
  return [
    product.graceSku,
    product.websiteSku,
    product.itemName,
    product.itemDescription,
    product.applicator,
    product.capStyle,
  ].some((value) => /\b(?:tassel|antique\s+bulb|vintage\s+bulb)\b/i.test(textValue(value)));
}

export function resolveBestBottlesContractCanvas(
  product: BestBottlesContractProduct,
  inputContext?: Record<string, unknown> | null,
): BestBottlesContractCanvas {
  const presetId = textValue(inputContext?.presetId);
  if (
    presetId === "grid-card-wide-low-1536x1024"
    && isTopologyWideProduct(product)
  ) {
    return BEST_BOTTLES_TOPOLOGY_WIDE_CANVAS;
  }
  return BEST_BOTTLES_CONTRACT_CANVAS;
}

async function resolveProductTruth(
  input: BestBottlesRenderingContractInput,
  resolver: BestBottlesProductTruthResolver,
): Promise<BestBottlesContractProduct | null> {
  for (const candidate of readSkuCandidates(input)) {
    const bySku = resolver.fetchProductBySku
      ? await resolver.fetchProductBySku(candidate)
      : null;
    if (bySku) return bySku;

    const byWebsiteSku = resolver.fetchProductByWebsiteSku
      ? await resolver.fetchProductByWebsiteSku(candidate)
      : null;
    if (byWebsiteSku) return byWebsiteSku;
  }
  return null;
}

function getFamilyLaneDefinition(family: string): FamilyLaneDefinition {
  const normalized = normalizeFamily(family);
  if (!normalized || normalized === "unknown") {
    return {
      renderingLane: "blocked_unknown",
      bottleScaleStatus: "blocked",
      enhancementStatus: "blocked",
    };
  }
  if (COMPONENT_FAMILIES.has(normalized)) {
    return {
      renderingLane: "component_enhancement",
      bottleScaleStatus: "not_bottle",
      enhancementStatus: "needs_review",
    };
  }
  if (PACKAGING_FAMILIES.has(normalized)) {
    return {
      renderingLane: "packaging_enhancement",
      bottleScaleStatus: "not_bottle",
      enhancementStatus: "needs_review",
    };
  }
  if (isCylinderFamilyAlias(normalized)) {
    return {
      renderingLane: "bottle_catalog",
      bottleScaleStatus: "mapped",
      enhancementStatus: "needs_review",
    };
  }
  if (MAPPED_BOTTLE_FAMILIES.has(normalized)) {
    return {
      renderingLane: "bottle_catalog",
      bottleScaleStatus: "mapped",
      enhancementStatus: "needs_review",
    };
  }
  if (REVIEW_BOTTLE_FAMILIES.has(normalized)) {
    return {
      renderingLane: "bottle_catalog",
      bottleScaleStatus: "needs_review",
      enhancementStatus: "needs_review",
    };
  }
  return {
    renderingLane: "blocked_unknown",
    bottleScaleStatus: "blocked",
    enhancementStatus: "blocked",
  };
}

function componentRig(profileId: "component-enhancement" | "packaging-enhancement"): FamilyRigConfig {
  return {
    family: profileId,
    profileId,
    profileLabel: profileId === "component-enhancement" ? "Component Enhancement" : "Packaging Enhancement",
    relativeScaleZoneId: profileId,
    relativeScaleZoneLabel: profileId === "component-enhancement" ? "Component enhancement" : "Packaging enhancement",
    fillHeightPct: profileId === "component-enhancement" ? 62 : 72,
    fillHeightRangePct: profileId === "component-enhancement" ? { min: 50, max: 74 } : { min: 55, max: 82 },
    fillWidthPct: 70,
    baselinePct: BEST_BOTTLES_CONTRACT_CANVAS.baselinePct,
    primaryObjectCenterXPct: BEST_BOTTLES_CONTRACT_CANVAS.primaryObjectCenterXPct,
  };
}

function resolveRig(
  product: BestBottlesContractProduct,
  lane: BestBottlesRenderingLane,
  canvas: BestBottlesContractCanvas,
  inputContext?: Record<string, unknown> | null,
): FamilyRigConfig | null {
  if (lane === "component_enhancement") return componentRig("component-enhancement");
  if (lane === "packaging_enhancement") return componentRig("packaging-enhancement");
  if (lane !== "bottle_catalog") return null;
  const rig = getFamilyRigForProduct({
    family: product.family,
    bottleCollection: product.bottleCollection,
    category: product.category,
    sku: product.graceSku,
    websiteSku: product.websiteSku,
    name: product.itemName,
    itemDescription: product.itemDescription,
    applicator: product.applicator,
    capacity: product.capacity,
    capacityMl: product.capacityMl ?? null,
    heightWithCap: product.heightWithCap,
    heightWithoutCap: product.heightWithoutCap,
    diameter: product.diameter,
    capState: textValue(inputContext?.capState) || null,
    mode: textValue(inputContext?.mode) || null,
    // Bottle catalog masters are the scale-card fail-closed lane.
    requireScaleCard: true,
  });
  if (!rig) return null;
  return {
    ...rig,
    baselinePct: canvas.baselinePct,
    primaryObjectCenterXPct: canvas.primaryObjectCenterXPct,
    ...(typeof (rig.shoulderTargetPct ?? rig.glassHeightPct) === "number"
      ? {
          targetBodyHeightPx: Math.round(
            ((rig.shoulderTargetPct ?? rig.glassHeightPct)! / 100) * canvas.height,
          ),
        }
      : {}),
  };
}

function resolvePromptProfile(lane: BestBottlesRenderingLane): BestBottlesPromptProfile {
  if (lane === "component_enhancement") return "component_enhancement";
  if (lane === "packaging_enhancement") return "packaging_enhancement";
  if (lane === "bottle_catalog") return "bottle_glass";
  return "blocked";
}

function resolveQaPolicy(lane: BestBottlesRenderingLane): BestBottlesRenderingContract["qaPolicy"] {
  if (lane === "component_enhancement") {
    return {
      kind: "component_enhancement_qa",
      enforceFillHeight: false,
      allowedDecisions: ["pass", "normalize", "reject"],
    };
  }
  if (lane === "packaging_enhancement") {
    return {
      kind: "packaging_enhancement_qa",
      enforceFillHeight: false,
      allowedDecisions: ["pass", "normalize", "reject"],
    };
  }
  if (lane === "bottle_catalog") {
    return {
      kind: "bottle_framing_qa",
      enforceFillHeight: true,
      allowedDecisions: ["pass", "normalize", "reject"],
    };
  }
  return {
    kind: "blocked",
    enforceFillHeight: false,
    allowedDecisions: ["reject"],
  };
}

function getReferenceCountIssue(input: BestBottlesRenderingContractInput): string | null {
  const refs = input.categorizedRefs;
  if (refs.product.length !== 1) {
    return "Best Bottles master generation requires exactly one product reference image.";
  }
  if (refs.background.length > 0 || refs.style.length > 1) {
    return "Best Bottles master generation accepts exactly one product reference, no background references, and at most one Cylinder-only style calibration reference.";
  }
  if ((refs.component?.length ?? 0) > 1) {
    return "Best Bottles master generation accepts at most one dedicated cap identity reference.";
  }
  if ((refs.component?.length ?? 0) === 1) {
    const expectedSku = textValue(input.productContext?.capIdentityReferenceSku).toUpperCase();
    const componentUrl = normalizeReferenceValue(refs.component?.[0]?.url).toUpperCase();
    if (
      !/^CMP-ROC-(?:BLK|PNK|SLV)-(?:13415|17415)-DOT$/.test(expectedSku) ||
      !componentUrl.includes(expectedSku)
    ) {
      return "Best Bottles dedicated cap identity reference must exactly match capIdentityReferenceSku.";
    }
  }
  return null;
}

function normalizeReferenceValue(value: unknown): string {
  if (value == null) return "";
  let normalized = String(value).trim().toLowerCase().replace(/\\/g, "/");
  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    // Keep undecodable values as-is.
  }
  return normalized.replace(/\s+/g, " ");
}

function expectedBestBottlesStyleSurface(product: BestBottlesContractProduct): string {
  const sku = textValue(product.graceSku).toUpperCase();
  const text = [
    product.bodyMaterial,
    product.color,
    product.itemName,
    product.itemDescription,
  ].map(textValue).join(" ").toLowerCase();
  if (/alumin(?:um|ium)|metal atomizer/.test(text)) return "aluminum";
  if (/-AMB-/.test(sku) || /\bamber\b/.test(text)) return "amber";
  if (/-(?:BLU|CBL)-/.test(sku) || /\b(?:cobalt|cobalt blue|blue glass)\b/.test(text)) return "cobalt";
  if (/-GRN-/.test(sku) || /\b(?:green|emerald)\b/.test(text)) return "green";
  if (/-FRS-/.test(sku) || /\bfrost(?:ed)?\b/.test(text)) return "frosted";
  if (/-SWL-/.test(sku) || /\b(?:swirl|fluted?)\b/.test(text)) return "swirl";
  return "clear";
}

function getBestBottlesStyleReferenceBindingIssue(
  input: BestBottlesRenderingContractInput,
  product: BestBottlesContractProduct,
  family: string | null,
): string | null {
  if (!isCylinderFamilyAlias(family) || input.categorizedRefs.style.length === 0) return null;
  const context = input.productContext ?? {};
  const surface = textValue(context.styleReferenceSurface).toLowerCase();
  const imageId = textValue(context.styleReferenceImageId);
  const imageUrl = textValue(context.styleReferenceImageUrl);
  const exportSha256 = textValue(context.styleReferenceExportSha256).toLowerCase();
  if (!surface || !imageId || !imageUrl || !exportSha256) {
    return "Cylinder style reference requires one complete resolved material binding.";
  }
  const expectedSurface = expectedBestBottlesStyleSurface(product);
  if (surface !== expectedSurface) {
    return `Cylinder style surface ${surface} does not match product truth ${expectedSurface}.`;
  }
  const attachedUrl = textValue(input.categorizedRefs.style[0]?.url);
  if (attachedUrl !== imageUrl) {
    return "Cylinder style reference URL does not match its resolved material binding.";
  }
  if (!/^[a-f0-9]{64}$/.test(exportSha256) || !imageUrl.includes(exportSha256)) {
    return "Cylinder style reference hash does not match its resolved material binding URL.";
  }
  const precompiled = readRecord(input.precompiledPromptRecord);
  if (precompiled) {
    const prompt = textValue(precompiled.final_prompt);
    if (!prompt.includes(`Secondary reference image ${imageId} is STYLE-ONLY.`)) {
      return "Cylinder style reference prompt does not match its resolved material binding.";
    }
    const qaChecklist = Array.isArray(precompiled.qa_checklist)
      ? precompiled.qa_checklist.filter((tag): tag is string => typeof tag === "string")
      : [];
    const expectedTags = [
      `style-reference-image:${imageId}`,
      `style-reference-sha256:${exportSha256}`,
      `style-surface:${surface}`,
    ];
    if (expectedTags.some((tag) => !qaChecklist.includes(tag))) {
      return "Cylinder style reference tags do not match its resolved material binding.";
    }
  }
  return null;
}

function collectReferenceValues(value: unknown, seen = new WeakSet<object>(), depth = 0): unknown[] {
  if (value == null || depth > 5) return [];
  if (typeof value !== "object") return [value];
  if (seen.has(value)) return [];
  seen.add(value);
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectReferenceValues(entry, seen, depth + 1));
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => [
    key,
    ...collectReferenceValues(entry, seen, depth + 1),
  ]);
}

function getRetiredReferenceIssue(input: BestBottlesRenderingContractInput): string | null {
  // Transparent/background-removed/paper-doll/mask lineage is prohibited in
  // every reference role—product, style, and background—not just geometry.
  const values = [
    ...input.categorizedRefs.product,
    ...(input.categorizedRefs.component ?? []),
    ...input.categorizedRefs.style,
    ...input.categorizedRefs.background,
    ...(input.referenceAuditValues ?? []),
  ].flatMap((value) => collectReferenceValues(value));
  const retired = values
    .map(normalizeReferenceValue)
    .some((value) => RETIRED_REFERENCE_TOKENS.some((token) => value.includes(token)));
  return retired
    ? "Best Bottles rendering contract blocked retired transparent or background-removed reference lineage."
    : null;
}

function resolveProviderPolicy(
  input: BestBottlesRenderingContractInput,
): BestBottlesRenderingContract["providerPolicy"] {
  const forceOpenAI = shouldForceBestBottlesOpenAIProvider({
    isBestBottlesReferenceLocked: true,
    allowBestBottlesProviderOverride: input.allowBestBottlesProviderOverride,
  });
  if (forceOpenAI) {
    return {
      provider: "openai",
      model: BEST_BOTTLES_PRODUCTION_MODEL,
      comparisonOnly: false,
    };
  }
  return {
    provider: "requested",
    model: null,
    comparisonOnly: true,
  };
}

function statusForDefinition(definition: FamilyLaneDefinition): BestBottlesContractStatus {
  if (definition.renderingLane === "blocked_unknown") return "blocked";
  if (definition.renderingLane === "bottle_catalog" && definition.bottleScaleStatus === "mapped") {
    return "ready";
  }
  return "needs_review";
}

function libraryTagsForContract(contract: Omit<BestBottlesRenderingContract, "libraryTags">): string[] {
  const tags = [
    "contract:v1",
    `contract-status:${contract.status}`,
    `rendering-lane:${contract.renderingLane}`,
    `bottle-scale:${contract.bottleScaleStatus}`,
    `enhancement-status:${contract.enhancementStatus}`,
    `prompt-profile:${contract.promptProfile}`,
    `canvas:${contract.canvas.width}x${contract.canvas.height}`,
    `qa-policy:${contract.qaPolicy.kind}`,
    contract.providerPolicy.comparisonOnly
      ? BEST_BOTTLES_COMPARISON_PROVIDER_TAG
      : "contract-provider:openai-image-2.5-sunburst",
    contract.sku ? `sku:${contract.sku}` : null,
    contract.rig?.profileId ? `profile:${contract.rig.profileId}` : null,
    contract.rig?.relativeScaleZoneId ? `scale-zone:${contract.rig.relativeScaleZoneId}` : null,
  ].filter((tag): tag is string => Boolean(tag));

  return Array.from(new Set(tags));
}

function blockedContract(error: string): BestBottlesRenderingContract {
  return {
    ...BLOCKED_CONTRACT,
    status: "blocked",
    error,
    libraryTags: Array.from(new Set([
      ...BLOCKED_CONTRACT.libraryTags,
      "prompt-profile:blocked",
      "qa-policy:blocked",
    ])),
  };
}

export async function resolveBestBottlesRenderingContract(
  input: BestBottlesRenderingContractInput,
  resolver: BestBottlesProductTruthResolver = createBestBottlesConvexProductTruthResolver(),
): Promise<BestBottlesRenderingContract | null> {
  if (!input.isBestBottlesStudioMasterRequest) return null;

  const referenceCountIssue = getReferenceCountIssue(input);
  if (referenceCountIssue) return blockedContract(referenceCountIssue);

  const retiredReferenceIssue = getRetiredReferenceIssue(input);
  if (retiredReferenceIssue) return blockedContract(retiredReferenceIssue);

  const resolvedProduct = await resolveProductTruth(input, resolver);
  if (!resolvedProduct) {
    return blockedContract("Best Bottles rendering contract could not resolve product truth from Convex.");
  }

  const sealedCanonical = await resolveSealedCanonicalCylinderProduct(input, resolvedProduct);
  if (sealedCanonical.error) return blockedContract(sealedCanonical.error);
  const product = sealedCanonical.product;
  const family = product.family ?? product.bottleCollection ?? null;
  const styleReferenceBindingIssue = getBestBottlesStyleReferenceBindingIssue(
    input,
    product,
    family,
  );
  if (styleReferenceBindingIssue) return blockedContract(styleReferenceBindingIssue);
  const definition = getFamilyLaneDefinition(family ?? "");
  if (definition.renderingLane === "blocked_unknown") {
    return {
      ...blockedContract("Best Bottles rendering contract blocked unknown product truth or family mapping."),
      product,
      productContext: contractProductContext(product, input.productContext),
      sku: product.graceSku ?? null,
      websiteSku: product.websiteSku ?? null,
      family,
    };
  }

  const canvas = resolveBestBottlesContractCanvas(product, input.productContext);
  const providerPolicy = resolveProviderPolicy(input);
  const rig = resolveRig(product, definition.renderingLane, canvas, input.productContext);
  const status = statusForDefinition(definition);
  const promptProfile = resolvePromptProfile(definition.renderingLane);
  const productContext = {
    ...contractProductContext(product, input.productContext, canvas),
    ...(sealedCanonical.geometry ? { canonicalGeometryContract: sealedCanonical.geometry } : {}),
    renderingLane: definition.renderingLane,
    bottleScaleStatus: definition.bottleScaleStatus,
    enhancementStatus: definition.enhancementStatus,
    promptProfile,
    contractVersion: "v1",
  };
  const partial: Omit<BestBottlesRenderingContract, "libraryTags"> = {
    version: "v1",
    status,
    error: null,
    product,
    productContext,
    sku: product.graceSku ?? null,
    websiteSku: product.websiteSku ?? null,
    family,
    renderingLane: definition.renderingLane,
    bottleScaleStatus: definition.bottleScaleStatus,
    enhancementStatus: definition.enhancementStatus,
    promptProfile,
    canvas,
    rig,
    providerPolicy,
    qaPolicy: resolveQaPolicy(definition.renderingLane),
  };

  return {
    ...partial,
    libraryTags: libraryTagsForContract(partial),
  };
}

function cleanEnv(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/^['"]|['"]$/g, "") : "";
}

function getBestBottlesConvexUrl(): string {
  const deno = globalThis as unknown as { Deno?: { env?: { get?: (key: string) => string | undefined } } };
  return cleanEnv(deno.Deno?.env?.get?.("BESTBOTTLES_CONVEX_URL"));
}

async function queryBestBottlesConvex(
  path: string,
  args: Record<string, unknown>,
): Promise<BestBottlesContractProduct | null> {
  const rawUrl = getBestBottlesConvexUrl();
  if (!rawUrl) {
    throw new Error("BESTBOTTLES_CONVEX_URL is required to resolve Best Bottles product truth.");
  }
  const target = `${rawUrl.replace(/\/+$/, "")}/api/query`;
  const response = await fetch(target, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, args, format: "json" }),
  });
  if (!response.ok) {
    throw new Error(`Best Bottles Convex product truth query failed: ${response.status}`);
  }
  const body = await response.json() as { status?: string; value?: unknown; errorMessage?: string };
  if (body.status === "error") {
    throw new Error(body.errorMessage || "Best Bottles Convex returned error.");
  }
  return readRecord(body.value) as BestBottlesContractProduct | null;
}

export function createBestBottlesConvexProductTruthResolver(): BestBottlesProductTruthResolver {
  return {
    fetchProductBySku: (sku) => queryBestBottlesConvex("products:getBySku", { graceSku: sku }),
    fetchProductByWebsiteSku: (websiteSku) => queryBestBottlesConvex("products:getByWebsiteSku", { websiteSku }),
  };
}
