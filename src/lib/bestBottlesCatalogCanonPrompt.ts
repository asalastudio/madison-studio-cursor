// The canonical catalog prompt now lives IN this repo (vendored, authoritative).
// See src/config/bestBottlesCatalogCanon.ts — the external Best Bottles pipeline
// module is a mirror/consumer of this copy, not the source.
import {
  BEST_BOTTLES_CATALOG_CANON_VERSION,
  CLEAR_GLASS,
  FINAL_V2_STUDIO_CHECK,
  KEEP_MATERIAL,
  MODEL_OWNED_GROUNDING_SHADOW,
  PRESERVE,
  STUDIO_DIRECTION,
  buildPrompt,
} from "@/config/bestBottlesCatalogCanon";

import type { PromptSku } from "./bestBottlesPromptCompiler";
import type { BestBottlesShadowOwner, BestBottlesShadowPolicy } from "./bestBottlesShadowPolicy";
import { resolveBestBottlesShadowPolicy } from "./bestBottlesShadowPolicy";
import {
  buildModelOwnedShadowPrompt,
  resolveBestBottlesShadowTopology,
} from "./bestBottlesShadowTopology";

export const BEST_BOTTLES_CATALOG_CANON_SOURCE_PATH =
  `src/config/bestBottlesCatalogCanon.ts@${BEST_BOTTLES_CATALOG_CANON_VERSION}`;

export const BEST_BOTTLES_CATALOG_CANON_PROMPT_FLAG = "catalog_canon_v3_prompt";

const MODEL_BONE_CANVAS_CONTRACT =
  "CYLINDER V6.1 BONE CANVAS CONTRACT: Render the output on the Best Bottles Bone canvas #F5F3EF at 2080 × 2288. Keep this canvas color flat, seamless, and texture-free; this contract applies to reviewed Cylinder-family generation context.";
const CLEAR_GLASS_SOURCE_ANCHOR =
  "The background should be visible through the glass with natural refraction and slight optical displacement.";
const STUDIO_RIG_SHADOW_SENTENCE =
  "Shadow direction may become slightly more dimensional and premium, but it must remain one realistic contact-only shadow under the bottle base and any detached cap. No floor plane, reflection, hard cast shadow, smear, horizon, vignette, or background texture.";
const FINAL_STUDIO_MEASUREMENTS_SENTENCE =
  "Respect the resolved family framing measurements while making the photograph feel like the approved v2 studio direction.";
const MODEL_FINAL_STUDIO_CHECK_SENTENCE =
  "The resolved Cylinder V6.1 model-owned contact-shadow contract does not weaken product identity, geometry, material, canvas, or framing authority.";

function replaceCanonSourceText(source: string, exactText: string, replacement: string, label: string): string {
  const first = source.indexOf(exactText);
  if (first < 0 || first !== source.lastIndexOf(exactText)) {
    throw new Error(`Best Bottles canon drift: expected one exact ${label} source text.`);
  }
  return source.slice(0, first) + replacement + source.slice(first + exactText.length);
}

export function clearGlassForShadowOwner(owner: BestBottlesShadowOwner): string {
  if (owner === "rig") return CLEAR_GLASS;
  const guardedClearGlass = replaceCanonSourceText(
    CLEAR_GLASS,
    CLEAR_GLASS_SOURCE_ANCHOR,
    CLEAR_GLASS_SOURCE_ANCHOR,
    "clear-glass source",
  );
  return `${guardedClearGlass}\n\n${MODEL_BONE_CANVAS_CONTRACT}`;
}

export function studioDirectionForShadowOwner(owner: BestBottlesShadowOwner): string {
  if (owner === "rig") return STUDIO_DIRECTION;
  return replaceCanonSourceText(
    STUDIO_DIRECTION,
    STUDIO_RIG_SHADOW_SENTENCE,
    "The declared model-owned contact shadow is the sole grounding shadow; do not add or alter any second shadow, floor plane, reflection, hard cast shadow, smear, horizon, vignette, or background texture.",
    "studio shadow policy",
  );
}

export function finalStudioCheckForShadowOwner(owner: BestBottlesShadowOwner): string {
  if (owner === "rig") return FINAL_V2_STUDIO_CHECK;
  return replaceCanonSourceText(
    FINAL_V2_STUDIO_CHECK,
    FINAL_STUDIO_MEASUREMENTS_SENTENCE,
    `${FINAL_STUDIO_MEASUREMENTS_SENTENCE}\n${MODEL_FINAL_STUDIO_CHECK_SENTENCE}`,
    "final studio check",
  );
}

function normalizedSkuText(sku: PromptSku): string {
  return [
    sku.sku,
    sku.body_material,
    sku.body_color,
    sku.product_family,
    sku.body_shape,
    sku.special_geometry_notes,
  ]
    .join(" ")
    .toLowerCase();
}

/**
 * Grace SKU BODY-segment color codes (-AMB-, -BLU-, -CBL-, -FRS-, -GRN-,
 * -SWL-). The word checks below miss them ("amber" ≠ "AMB"), which sent
 * colored-glass SKUs down the CLEAR_GLASS path whenever the catalog color
 * field was empty — the 2026-07-20 muddy-amber renders were prompted
 * "transparent, colorless, no tint" against an amber reference. Segment
 * codes are body slots only; cap-finish tokens (MBLU/SBLK/…) don't match.
 */
function skuBodyColorSegment(sku: PromptSku): string | null {
  const value = (sku.sku ?? "").toUpperCase();
  if (/-AMB-/.test(value)) return "amber";
  if (/-(?:BLU|CBL)-/.test(value)) return "cobalt";
  if (/-FRS-/.test(value)) return "frosted";
  if (/-GRN-/.test(value)) return "green";
  if (/-SWL-/.test(value)) return "swirl";
  return null;
}

export function getBestBottlesCatalogGlassType(sku: PromptSku): string {
  const text = normalizedSkuText(sku);
  const segment = skuBodyColorSegment(sku);
  if (text.includes("frost") || segment === "frosted") return "frosted";
  if (text.includes("swirl") || text.includes("flute") || segment === "swirl") return "swirl";
  if (text.includes("cobalt") || text.includes("blue") || segment === "cobalt") return "cobalt";
  if (text.includes("amber") || segment === "amber") return "amber";
  if (text.includes("green") || text.includes("emerald") || segment === "green") return "green";
  if (text.includes("apothecary")) return "apothecary";
  if (text.includes("heart") || text.includes("keychain") || text.includes("novelty")) return "novelty";
  return "colored";
}

export function isBestBottlesCatalogClearGlass(sku: PromptSku): boolean {
  const text = normalizedSkuText(sku);
  return (
    sku.body_material === "clear_glass" &&
    skuBodyColorSegment(sku) === null &&
    !text.includes("frost") &&
    !text.includes("swirl") &&
    !text.includes("amber") &&
    !text.includes("cobalt") &&
    !text.includes("blue") &&
    !text.includes("green")
  );
}

export function buildBestBottlesCatalogCanonPrompt(sku: PromptSku): string {
  const isClearGlass = isBestBottlesCatalogClearGlass(sku);
  const policy = resolveBestBottlesShadowPolicy({
    graceSku: sku.sku,
    family: sku.product_family,
  });
  if (policy.owner === "rig") return buildPrompt(isClearGlass);
  return [
    PRESERVE,
    isClearGlass ? clearGlassForShadowOwner(policy.owner) : KEEP_MATERIAL,
    buildModelOwnedShadowPrompt(resolveBestBottlesShadowTopology({}, sku)),
    studioDirectionForShadowOwner(policy.owner),
    finalStudioCheckForShadowOwner(policy.owner),
  ].join("\n\n");
}

export interface BestBottlesCatalogCanonPromptParts {
  basePrompt: string;
  finalStudioDirection: string;
}

function assertPolicyMatchesSku(sku: PromptSku, policy: BestBottlesShadowPolicy): void {
  const resolved = resolveBestBottlesShadowPolicy({
    graceSku: sku.sku,
    family: sku.product_family,
  });
  if (
    policy.promptVersion !== resolved.promptVersion ||
    policy.owner !== resolved.owner ||
    policy.contract !== resolved.contract ||
    policy.rollout !== resolved.rollout
  ) {
    throw new Error(
      `Best Bottles shadow policy mismatch for ${sku.sku}: policy must resolve from reviewed family context.`,
    );
  }
}

export function buildBestBottlesCatalogCanonPromptParts(
  sku: PromptSku,
  policy: BestBottlesShadowPolicy = resolveBestBottlesShadowPolicy({
    graceSku: sku.sku,
    family: sku.product_family,
  }),
): BestBottlesCatalogCanonPromptParts {
  assertPolicyMatchesSku(sku, policy);
  const isClearGlass = isBestBottlesCatalogClearGlass(sku);
  return {
    basePrompt: [PRESERVE, isClearGlass ? clearGlassForShadowOwner(policy.owner) : KEEP_MATERIAL].join("\n\n"),
    finalStudioDirection: [
      studioDirectionForShadowOwner(policy.owner),
      finalStudioCheckForShadowOwner(policy.owner),
    ].join("\n\n"),
  };
}

export { MODEL_OWNED_GROUNDING_SHADOW };
