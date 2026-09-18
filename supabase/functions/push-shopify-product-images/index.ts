import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  bestBottlesVisualIdentitiesCompatible,
  canonicalBestBottlesVisualIdentity,
  type BestBottlesVisualProduct,
  validateBestBottlesImageIdentity,
} from "../_shared/bestBottlesVisualIdentity.ts";
import { buildShopifyPushDryRunResult } from "../_shared/shopifyPushDryRun.ts";
import {
  formatConvexServerError,
  shouldFallbackCatalogHeroToPrimarySku,
} from "../_shared/bestBottlesConvexError.ts";
import {
  buildStagedUploadsCreateInput,
  SHOPIFY_GRAPHQL_TIMEOUT_MS,
  SHOPIFY_SOURCE_IMAGE_TIMEOUT_MS,
  shouldStageShopifyImageUpload,
} from "../_shared/shopifyStagedUpload.ts";
import {
  assertCylinderShopifyPublishAuthorized,
  executeCylinderShopifyGuardedMutation,
  isCylinderProductSku,
  isExactConfiguredServiceRoleToken,
} from "../_shared/shopifyPublishGuard.ts";
import type {
  CylinderShopifyPublishGuardInput,
  TrustedCylinderShopifyPublishAuthorization,
} from "../_shared/shopifyPublishGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type RequestItem = {
  pipelineSkuJobId?: string;
  publishAuthorizationId?: string;
  imageId?: string;
  imageUrl?: string;
  sku?: string;
  websiteSku?: string;
  graceSku?: string;
  expectedCapColor?: string;
  manualVisualIdentityApproval?: {
    visualFinish?: string;
    capHeight?: string;
    confirmed?: boolean;
    reviewedAt?: string;
    reviewedBy?: string | null;
    reason?: string;
    notes?: string;
  };
  altText?: string;
  mode?: "cap-on" | "cap-off";
};

type ShopifyConfig = {
  shopDomain: string;
  accessToken: string;
  apiVersion: string;
};

type ShopifyVariant = {
  id: string;
  sku: string | null;
  title: string | null;
  product: {
    id: string;
    title: string;
    handle: string | null;
    legacyResourceId?: string | null;
  };
};

type ShopifyVariantMedia = {
  id: string;
  alt: string | null;
  imageUrl: string | null;
};

type ShopifyGraphqlBody<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
  raw?: string;
};

class ConfigurationError extends Error {
  status = 424;
}

type ConvexResponseBody = {
  status?: string;
  errorMessage?: string;
  value?: unknown;
};

type BestBottlesProductLookup = {
  websiteSku?: unknown;
  graceSku?: unknown;
  category?: unknown;
  family?: unknown;
  color?: unknown;
  applicator?: unknown;
  capStyle?: unknown;
  capColor?: unknown;
  trimColor?: unknown;
  itemName?: unknown;
};

function toBestBottlesVisualProduct(
  product: BestBottlesProductLookup | null,
): BestBottlesVisualProduct | null {
  if (!product) return null;
  return {
    websiteSku: getString(product.websiteSku) || null,
    graceSku: getString(product.graceSku) || null,
    category: getString(product.category) || null,
    family: getString(product.family) || null,
    color: getString(product.color) || null,
    applicator: getString(product.applicator) || null,
    capStyle: getString(product.capStyle) || null,
    capColor: getString(product.capColor) || null,
    trimColor: getString(product.trimColor) || null,
    itemName: getString(product.itemName) || null,
  };
}

type PipelineSkuJobLookup = {
  id?: string | null;
  organization_id?: string | null;
  family?: string | null;
  grace_sku?: string | null;
  website_sku?: string | null;
  shopify_sku?: string | null;
  product_group_slug?: string | null;
  status?: string | null;
  generated_image_id?: string | null;
  generated_image_url?: string | null;
  approved_image_id?: string | null;
  approved_image_url?: string | null;
};

type ResolvedBestBottlesProduct = {
  inputSku: string;
  websiteSku: string;
  graceSku: string | null;
  resolvedVia: "websiteSku" | "graceSku" | "pipelineSkuJob";
  product: BestBottlesProductLookup | null;
};

const SHOPIFY_IMAGE_ALT_TEXT_MAX_CHARS = 512;
const SHOPIFY_MEDIA_READY_MAX_ATTEMPTS = 12;
const SHOPIFY_MEDIA_READY_POLL_MS = 1000;
const GLASS_WAND_9ML_VIAL_GRACE_SKU = "GB-CYL-CLR-9ML-T-01";
const GLASS_WAND_9ML_VIAL_WEBSITE_SKU = "GB09BlackCapApp";
const BEST_BOTTLES_SHOPIFY_SKU_ALIASES: Array<{ matches: string[]; aliases: string[] }> = [
  {
    matches: [
      "AB-ALU-CLR-250ML-SPR-BLK",
      "Alu250mlSprayBlack",
      "Alu250SpryBl",
      "BB-ALU250SPRYBL",
    ],
    aliases: ["BB-ALU250SPRYBL", "Alu250SpryBl"],
  },
  {
    matches: [
      GLASS_WAND_9ML_VIAL_GRACE_SKU,
      GLASS_WAND_9ML_VIAL_WEBSITE_SKU,
      "vial-9ml-clear-18-400-glasswand",
    ],
    aliases: [GLASS_WAND_9ML_VIAL_GRACE_SKU, GLASS_WAND_9ML_VIAL_WEBSITE_SKU],
  },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanSecret(value: string | undefined | null): string {
  return value?.trim().replace(/^['"]|['"]$/g, "") || "";
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueTrimmedStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim() ?? "")
        .filter(Boolean),
    ),
  );
}

function matchesGlassWand9MlVialSku(value: string | null | undefined): boolean {
  const text = (value ?? "").trim().toLowerCase();
  return (
    text === GLASS_WAND_9ML_VIAL_GRACE_SKU.toLowerCase() ||
    text === GLASS_WAND_9ML_VIAL_WEBSITE_SKU.toLowerCase() ||
    text === "vial-9ml-clear-18-400-glasswand"
  );
}

function expandBestBottlesSkuCandidates(values: Array<string | null | undefined>): string[] {
  const base = uniqueTrimmedStrings(values);
  if (!base.some(matchesGlassWand9MlVialSku)) return base;
  return uniqueTrimmedStrings([
    GLASS_WAND_9ML_VIAL_GRACE_SKU,
    GLASS_WAND_9ML_VIAL_WEBSITE_SKU,
    ...base,
  ]);
}

function compactSku(value: string): string {
  return value.trim().replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function canonicalBestBottlesFinish(value: string | null | undefined): string {
  const normalized = (value ?? "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\b(?:spray|screw cap|lotion pump|roller|dropper|atomizer|reducer|cap|collar|finish|with)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  if (normalized.includes("ivory") && normalized.includes("gold")) return "ivory gold";
  if (normalized.includes("ivory") && normalized.includes("silver")) return "ivory silver";
  if (normalized.includes("copper")) return "copper";
  if (normalized.includes("matte gold")) return "matte gold";
  if (normalized.includes("shiny gold") || normalized === "gold") return "shiny gold";
  if (normalized.includes("matte silver")) return "matte silver";
  if (normalized.includes("shiny silver") || normalized === "silver") return "shiny silver";
  if (normalized.includes("shiny black")) return "shiny black";
  if (normalized.includes("matte black")) return "matte black";
  if (normalized.includes("black leather")) return "black leather";
  if (normalized.includes("light brown leather")) return "light brown leather";
  if (normalized.includes("brown leather")) return "brown leather";
  if (normalized.includes("ivory leather")) return "ivory leather";
  if (normalized.includes("pink leather")) return "pink leather";
  if (normalized.includes("ivory")) return "ivory";
  if (normalized.includes("black")) return "black";
  if (normalized.includes("white")) return "white";
  if (normalized.includes("pink")) return "pink";
  if (normalized.includes("lavender")) return "lavender";
  if (normalized.includes("red")) return "red";
  if (normalized.includes("turquoise")) return "turquoise";
  if (normalized.includes("cobalt")) return "cobalt blue";
  if (normalized.includes("blue")) return "blue";
  if (normalized.includes("green")) return "green";
  if (normalized.includes("amber")) return "amber";
  if (normalized.includes("frosted")) return "frosted";
  if (normalized.includes("clear")) return "clear";
  if (normalized.includes("silver dots")) return "silver dots";
  if (normalized.includes("black dots")) return "black dots";
  if (normalized.includes("metal roller")) return "metal roller";
  if (normalized.includes("plastic roller")) return "plastic roller";
  return normalized;
}

type BestBottlesVisualIdentity = {
  label: string;
  canonical: string;
  fieldLabel: string;
};

const BEST_BOTTLES_SKU_VISUAL_TOKENS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /(?:^|[-_])IVGD(?:$|[-_])|IVGD$/i, label: "Ivory + Gold" },
  { pattern: /(?:^|[-_])IVSL(?:$|[-_])|IVSL$/i, label: "Ivory + Silver" },
  { pattern: /(?:^|[-_])MGLD(?:$|[-_])|MTGL$/i, label: "Matte Gold" },
  { pattern: /(?:^|[-_])SGLD(?:$|[-_])|SHNGL$/i, label: "Shiny Gold" },
  { pattern: /(?:^|[-_])MSLV(?:$|[-_])|MTSL$/i, label: "Matte Silver" },
  { pattern: /(?:^|[-_])SSLV(?:$|[-_])|SHNSL$/i, label: "Shiny Silver" },
  { pattern: /(?:^|[-_])SBLK(?:$|[-_])|SHNBLK$/i, label: "Shiny Black" },
  { pattern: /(?:^|[-_])MBLK(?:$|[-_])|MTBLK$/i, label: "Matte Black" },
  { pattern: /(?:^|[-_])CPR(?:$|[-_])|CU$/i, label: "Copper" },
  { pattern: /ATOM\d*GL\b|(?:^|[-_])GLD(?:$|[-_])|GOLD/i, label: "Gold" },
  { pattern: /ATOM\d*BLU\b|(?:^|[-_])BLU(?:$|[-_])|COBALT|BLUE/i, label: "Blue" },
  { pattern: /ATOM\d*GRN\b|(?:^|[-_])GRN(?:$|[-_])|GREEN/i, label: "Green" },
  { pattern: /(?:^|[-_])LVN(?:$|[-_])|LVN|LAV/i, label: "Lavender" },
  { pattern: /(?:^|[-_])PNK(?:$|[-_])|PNK|PINK/i, label: "Pink" },
  { pattern: /(?:^|[-_])RED(?:$|[-_])/i, label: "Red" },
  { pattern: /(?:^|[-_])WHT(?:$|[-_])|WHT|WHITE/i, label: "White" },
  { pattern: /(?:^|[-_])BLK(?:$|[-_])|BLK|BLACK/i, label: "Black" },
  { pattern: /(?:^|[-_])GLD(?:$|[-_])|GOLD/i, label: "Shiny Gold" },
  { pattern: /(?:^|[-_])IV(?:$|[-_])|IVORY/i, label: "Ivory" },
];

function bestBottlesSkuVisualIdentity(product: BestBottlesProductLookup | null): BestBottlesVisualIdentity | null {
  const text = [getString(product?.graceSku), getString(product?.websiteSku)].filter(Boolean).join(" ");
  if (!text) return null;
  const hit = BEST_BOTTLES_SKU_VISUAL_TOKENS.find((token) => token.pattern.test(text));
  if (!hit) return null;
  return {
    label: hit.label,
    canonical: canonicalBestBottlesFinish(hit.label),
    fieldLabel: "SKU token",
  };
}

function bestBottlesProductContext(product: BestBottlesProductLookup | null): string {
  return [
    getString(product?.category),
    getString(product?.family),
    getString(product?.applicator),
    getString(product?.capStyle),
    getString(product?.itemName),
    getString(product?.graceSku),
    getString(product?.websiteSku),
  ].filter(Boolean).join(" ").toLowerCase();
}

function isBestBottlesBottleColorVariant(product: BestBottlesProductLookup | null): boolean {
  const text = bestBottlesProductContext(product);
  if (!text) return false;
  if (/\b(?:spr|spray|mist|pump|lotion|treatment|roller|dropper|reducer|cap|closure|overcap|bulb|antique|vintage|tassel|jar|vial|atomizer|metal shell)\b/.test(text)) {
    return false;
  }
  return /\b(?:bottle|glass)\b/.test(text);
}

function resolveBestBottlesVisualIdentity(product: BestBottlesProductLookup | null): BestBottlesVisualIdentity | null {
  if (!product) return null;
  const text = bestBottlesProductContext(product);
  const skuIdentity = bestBottlesSkuVisualIdentity(product);
  const isComponentDriven = /\b(?:spr|spray|mist|pump|lotion|treatment|roller|dropper|reducer|cap|closure|overcap|bulb|antique|vintage|tassel|vial|atomizer|metal shell)\b/.test(text);
  if (skuIdentity && isComponentDriven) return skuIdentity;

  const color = getString(product.color);
  if (isBestBottlesBottleColorVariant(product) && color) {
    return { label: color, canonical: canonicalBestBottlesFinish(color), fieldLabel: "glass color" };
  }

  const capColor = getString(product.capColor);
  if (capColor) {
    return {
      label: capColor,
      canonical: canonicalBestBottlesFinish(capColor),
      fieldLabel: isComponentDriven ? "component visual identity" : "cap/finish",
    };
  }

  if (skuIdentity) return skuIdentity;

  const trimColor = getString(product.trimColor);
  if (trimColor) {
    return { label: trimColor, canonical: canonicalBestBottlesFinish(trimColor), fieldLabel: "trim/collar finish" };
  }

  if (color) {
    return { label: color, canonical: canonicalBestBottlesFinish(color), fieldLabel: "glass color" };
  }

  return null;
}

function inferExpectedVisualIdentityFromBestBottlesSku(candidates: string[]): string {
  const text = candidates.filter(Boolean).join(" ");
  const tokenRules: Array<[RegExp, string]> = [
    [/(?:^|[-_])SGLD(?:$|[-_])|SHNGL|SHGL/i, "Shiny Gold"],
    [/(?:^|[-_])MGLD(?:$|[-_])|MTGL|MTGD/i, "Matte Gold"],
    [/(?:^|[-_])SSLV(?:$|[-_])|SHNSL|SHSL/i, "Shiny Silver"],
    [/(?:^|[-_])MSLV(?:$|[-_])|MTSL/i, "Matte Silver"],
    [/(?:^|[-_])SBLK(?:$|[-_])|SHNBLK|SHBK/i, "Shiny Black"],
    [/(?:^|[-_])CPR(?:$|[-_])|CU\b|MTCP/i, "Copper"],
    [/ATOM\d*GL\b|(?:^|[-_])GLD(?:$|[-_])|GOLD/i, "Gold"],
    [/ATOM\d*BLU\b|(?:^|[-_])BLU(?:$|[-_])|COBALT|BLUE/i, "Blue"],
    [/ATOM\d*GRN\b|(?:^|[-_])GRN(?:$|[-_])|GREEN/i, "Green"],
    [/ATOM\d*RED\b|(?:^|[-_])RED(?:$|[-_])|RED/i, "Red"],
    [/ATOM\d*PNK\b|(?:^|[-_])PNK(?:$|[-_])|PINK/i, "Pink"],
    [/(?:^|[-_])WHT(?:$|[-_])|WHITE/i, "White"],
    [/(?:^|[-_])BLK(?:$|[-_])|BLACK/i, "Black"],
    [/(?:^|[-_])GLD(?:$|[-_])|GB[A-Za-z0-9]+Gl(?:$|[A-Z])/i, "Shiny Gold"],
    [/(?:^|[-_])SLV(?:$|[-_])|GB[A-Za-z0-9]+Sl(?:$|[A-Z])/i, "Shiny Silver"],
  ];
  return tokenRules.find(([pattern]) => pattern.test(text))?.[1] ?? "";
}

function assertBestBottlesFinishMatch(
  expectedCapColor: string | undefined,
  product: BestBottlesProductLookup | null,
  manualApproval?: RequestItem["manualVisualIdentityApproval"],
  expectedVisualIdentityFromSku = "",
): void {
  const declaredExpectedVisualIdentity =
    expectedCapColor ||
    manualApproval?.visualFinish?.trim() ||
    expectedVisualIdentityFromSku;
  const validation = validateBestBottlesImageIdentity(
    declaredExpectedVisualIdentity,
    toBestBottlesVisualProduct(product),
  );
  if (validation.ok) return;

  const manualReviewable =
    Boolean(product) &&
    !validation.resolution.safeToPush &&
    validation.resolution.blockingWarnings.length > 0 &&
    validation.resolution.blockingWarnings.every((warning) =>
      [
        "Visual identity is ambiguous; needs review.",
        "Resolver confidence is low; manual review required.",
        "Antique bulb sprayer resolved to Clear, which is likely glass color rather than bulb color.",
      ].includes(warning),
    );

  const manuallyApproved = Boolean(
    manualApproval?.confirmed &&
      manualApproval.visualFinish?.trim() &&
      manualApproval.capHeight?.trim(),
  );

  if (manualReviewable && manuallyApproved) {
    if (
      expectedVisualIdentityFromSku &&
      !bestBottlesVisualIdentitiesCompatible(
        canonicalBestBottlesVisualIdentity(manualApproval?.visualFinish),
        canonicalBestBottlesVisualIdentity(expectedVisualIdentityFromSku),
        validation.resolution.productApplicatorType,
      )
    ) {
      throw new Error(
        `Manual visual identity ${manualApproval?.visualFinish} does not match selected SKU identity ${expectedVisualIdentityFromSku}.`,
      );
    }
    return;
  }
  if (manualReviewable) {
    throw new Error("Manual visual identity approval is required before pushing this matched Best Bottles variant.");
  }
  throw new Error(validation.message);
}

function findBestBottlesShopifySkuAliases(candidates: string[]): string[] {
  const normalizedCandidates = new Set<string>();
  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    normalizedCandidates.add(trimmed.toUpperCase());
    normalizedCandidates.add(compactSku(trimmed));
  }

  const aliases: string[] = [];
  for (const rule of BEST_BOTTLES_SHOPIFY_SKU_ALIASES) {
    const matches = rule.matches.some((match) => {
      const trimmed = match.trim();
      return (
        normalizedCandidates.has(trimmed.toUpperCase()) ||
        normalizedCandidates.has(compactSku(trimmed))
      );
    });
    if (matches) aliases.push(...rule.aliases);
  }

  return uniqueTrimmedStrings(aliases);
}

function postgrestEqValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/,/g, "\\,");
}

function isMissingShopifySkuColumn(error: unknown): boolean {
  const maybeError = error as { code?: string; message?: string } | null | undefined;
  return Boolean(
    maybeError?.code === "42703" ||
      /shopify_sku/i.test(maybeError?.message ?? ""),
  );
}

async function findPipelineSkuJob(
  supabase: SupabaseClient,
  organizationId: string,
  candidates: string[],
  exactJobId?: string,
): Promise<PipelineSkuJobLookup | null> {
  const selectFields = [
    "id", "organization_id", "family", "grace_sku", "website_sku", "shopify_sku",
    "product_group_slug", "status", "generated_image_id", "generated_image_url",
    "approved_image_id", "approved_image_url",
  ].join(",");
  if (exactJobId?.trim()) {
    const { data, error } = await supabase
      .from("best_bottles_pipeline_sku_jobs")
      .select(selectFields)
      .eq("organization_id", organizationId)
      .eq("id", exactJobId.trim())
      .maybeSingle();
    if (error) throw new Error(`Exact pipeline job lookup failed: ${error.message}`);
    return data as PipelineSkuJobLookup | null;
  }
  const skuCandidates = uniqueTrimmedStrings(candidates);
  if (skuCandidates.length === 0) return null;

  for (const candidate of skuCandidates) {
    const lookup = async (includeShopifySku: boolean) => {
      const select = includeShopifySku
        ? selectFields
        : [
            "id", "organization_id", "family", "grace_sku", "website_sku",
            "product_group_slug", "status", "generated_image_id", "generated_image_url",
            "approved_image_id", "approved_image_url",
          ].join(",");
      const clauses = [
        `grace_sku.eq.${postgrestEqValue(candidate)}`,
        `website_sku.eq.${postgrestEqValue(candidate)}`,
      ];
      if (includeShopifySku) {
        clauses.push(`shopify_sku.eq.${postgrestEqValue(candidate)}`);
      }
      return await supabase
        .from("best_bottles_pipeline_sku_jobs")
        .select(select)
        .eq("organization_id", organizationId)
        .or(clauses.join(","))
        .limit(1);
    };

    let { data, error } = await lookup(true);
    if (error && isMissingShopifySkuColumn(error)) {
      ({ data, error } = await lookup(false));
    }
    if (error) continue;
    const row = data?.[0] as PipelineSkuJobLookup | undefined;
    if (row) return row;
  }

  return null;
}

type ShopifyPublishAuthorizationRow = {
  id: string;
  purpose: "shopify-product-image-publish";
  organization_id: string;
  pipeline_sku_job_id: string;
  generated_image_id: string;
  website_sku: string;
  grace_sku: string;
  authorized_by_user_id: string;
  authorized_at: string;
  expires_at: string;
  consumed_at: string | null;
};

async function loadTrustedShopifyPublishAuthorization(
  supabase: SupabaseClient,
  organizationId: string,
  authorizationId: string | undefined,
): Promise<TrustedCylinderShopifyPublishAuthorization | null> {
  const exactAuthorizationId = authorizationId?.trim();
  if (!exactAuthorizationId) return null;

  const { data, error } = await supabase
    .from("shopify_publish_authorizations")
    .select([
      "id", "purpose", "organization_id", "pipeline_sku_job_id", "generated_image_id",
      "website_sku", "grace_sku", "authorized_by_user_id", "authorized_at", "expires_at",
      "consumed_at",
    ].join(","))
    .eq("id", exactAuthorizationId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(`Shopify publish authorization lookup failed: ${error.message}`);
  if (!data) return null;

  const row = data as unknown as ShopifyPublishAuthorizationRow;
  return {
    id: row.id,
    purpose: row.purpose,
    organizationId: row.organization_id,
    pipelineSkuJobId: row.pipeline_sku_job_id,
    generatedImageId: row.generated_image_id,
    websiteSku: row.website_sku,
    graceSku: row.grace_sku,
    authorizedByUserId: row.authorized_by_user_id,
    authorizedAt: row.authorized_at,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
    singleUse: true,
  };
}

async function claimTrustedShopifyPublishAuthorization(
  supabase: SupabaseClient,
  input: {
    authorizationId: string;
    organizationId: string;
    pipelineSkuJobId: string;
    generatedImageId: string;
    websiteSku: string;
    graceSku: string;
    consumedByUserId: string | null;
    consumedAt: string;
  },
): Promise<boolean> {
  const { data, error } = await supabase
    .from("shopify_publish_authorizations")
    .update({
      consumed_at: input.consumedAt,
      consumed_by_user_id: input.consumedByUserId,
    })
    .eq("id", input.authorizationId)
    .eq("organization_id", input.organizationId)
    .eq("pipeline_sku_job_id", input.pipelineSkuJobId)
    .eq("generated_image_id", input.generatedImageId)
    .eq("website_sku", input.websiteSku)
    .eq("grace_sku", input.graceSku)
    .eq("purpose", "shopify-product-image-publish")
    .is("consumed_at", null)
    .gt("expires_at", input.consumedAt)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`Shopify publish authorization claim failed: ${error.message}`);
  return Boolean(data?.id);
}

function looksLikeProductGroupSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(value.trim()) && /\b\d+ml\b/i.test(value);
}

function getBestBottlesConvexUrl(): string {
  const rawUrl =
    cleanSecret(Deno.env.get("BB_CONVEX_URL")) ||
    cleanSecret(Deno.env.get("BESTBOTTLES_CONVEX_URL"));
  if (!rawUrl) return "";

  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("Invalid protocol");
    }
    return rawUrl.replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function getBestBottlesConvexWriteToken(): string {
  return cleanSecret(Deno.env.get("BEST_BOTTLES_CONVEX_WRITE_TOKEN"));
}

async function callBestBottlesConvex(
  bbConvexUrl: string,
  endpoint: "query" | "mutation",
  path: string,
  args: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; body: ConvexResponseBody | null }> {
  const res = await fetch(`${bbConvexUrl}/api/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, args, format: "json" }),
  });

  let body: ConvexResponseBody | null = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  return {
    ok: res.ok && body?.status !== "error",
    status: res.status,
    body,
  };
}

async function resolveBestBottlesProduct(
  bbConvexUrl: string,
  rawSku: string,
  alternates: string[] = [],
): Promise<ResolvedBestBottlesProduct | null> {
  const skuCandidates = expandBestBottlesSkuCandidates([rawSku, ...alternates]);
  if (skuCandidates.length === 0) return null;

  for (const inputSku of skuCandidates) {
    const byWebsite = await callBestBottlesConvex(
      bbConvexUrl,
      "query",
      "products:getByWebsiteSku",
      { websiteSku: inputSku },
    );
    if (byWebsite.ok && byWebsite.body?.value) {
      const product = byWebsite.body.value as BestBottlesProductLookup;
      const websiteSku = getString(product.websiteSku) || inputSku;
      const graceSku = getString(product.graceSku) || null;
      return { inputSku, websiteSku, graceSku, resolvedVia: "websiteSku", product };
    }
  }

  for (const inputSku of skuCandidates) {
    const byGrace = await callBestBottlesConvex(
      bbConvexUrl,
      "query",
      "products:getBySku",
      { graceSku: inputSku },
    );
    if (byGrace.ok && byGrace.body?.value) {
      const product = byGrace.body.value as BestBottlesProductLookup;
      const websiteSku = getString(product.websiteSku);
      if (websiteSku) {
        return {
          inputSku,
          websiteSku,
          graceSku: getString(product.graceSku) || inputSku,
          resolvedVia: "graceSku",
          product,
        };
      }
    }
  }

  return null;
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function decryptText(ciphertextB64: string, ivB64: string, keyB64: string): Promise<string> {
  const keyBytes = base64ToBytes(keyB64);
  const keyCopy = new Uint8Array(keyBytes.length);
  keyCopy.set(keyBytes);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyCopy.buffer,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  const ivBytes = base64ToBytes(ivB64);
  const ivCopy = new Uint8Array(ivBytes.length);
  ivCopy.set(ivBytes);
  const ciphertextBytes = base64ToBytes(ciphertextB64);
  const ciphertextCopy = new Uint8Array(ciphertextBytes.length);
  ciphertextCopy.set(ciphertextBytes);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivCopy.buffer },
    cryptoKey,
    ciphertextCopy.buffer,
  );
  return new TextDecoder().decode(plaintext);
}

function normalizeShopDomain(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "");
}

function escapeShopifySearchValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function userErrorMessage(errors: Array<{ field?: string[] | null; message: string }> | undefined): string {
  return (errors ?? [])
    .map((error) => {
      const field = error.field?.length ? `${error.field.join(".")}: ` : "";
      return `${field}${error.message}`;
    })
    .join("; ");
}

function isNonReadyMediaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /non-ready media|media cannot be attached/i.test(message);
}

function isVariantAlreadyHasMediaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /variant(?:Media)?\d*\.variantId.*already has attached media|already has attached media/i.test(message);
}

function toShopifyAltText(value: string | null | undefined, fallback: string): string {
  const normalized = (value?.trim() || fallback).replace(/\s+/g, " ").trim();
  if (normalized.length <= SHOPIFY_IMAGE_ALT_TEXT_MAX_CHARS) return normalized;
  return `${normalized.slice(0, SHOPIFY_IMAGE_ALT_TEXT_MAX_CHARS - 3).trimEnd()}...`;
}

async function shopifyGraphql<T>(
  config: ShopifyConfig,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(
      `https://${config.shopDomain}/admin/api/${config.apiVersion}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": config.accessToken,
        },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(SHOPIFY_GRAPHQL_TIMEOUT_MS),
      },
    );
  } catch (error) {
    const timedOut = error instanceof Error && /abort|timeout/i.test(error.message);
    throw new Error(
      timedOut
        ? `Shopify API timed out after ${SHOPIFY_GRAPHQL_TIMEOUT_MS}ms.`
        : `Shopify API request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const text = await response.text();
  let body: ShopifyGraphqlBody<T> = {};
  try {
    const parsed: unknown = text ? JSON.parse(text) : {};
    body = parsed && typeof parsed === "object"
      ? parsed as ShopifyGraphqlBody<T>
      : { raw: text };
  } catch {
    body = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`Shopify API ${response.status}: ${JSON.stringify(body)}`);
  }
  if (Array.isArray(body.errors) && body.errors.length > 0) {
    throw new Error(body.errors.map((error: { message?: string }) => error.message).join("; "));
  }

  return body.data as T;
}

async function resolveOrganizationId(
  supabase: SupabaseClient,
  userId: string,
  organizationId?: string,
): Promise<string> {
  if (organizationId) {
    const { data: member, error } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", userId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (error || !member) throw new Error("Organization access denied");
    return organizationId;
  }

  const { data: member, error } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (error || !member?.organization_id) {
    throw new Error("No organization found for this user");
  }

  return member.organization_id;
}

async function getShopifyConfig(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<ShopifyConfig> {
  const envToken = Deno.env.get("SHOPIFY_ACCESS_TOKEN");
  const envDomain = Deno.env.get("SHOPIFY_SHOP_DOMAIN");
  const apiVersion = Deno.env.get("SHOPIFY_API_VERSION") ?? "2026-04";

  if (envToken && envDomain) {
    return {
      accessToken: envToken,
      shopDomain: normalizeShopDomain(envDomain),
      apiVersion,
    };
  }

  const { data: connection, error } = await supabase
    .from("shopify_connections")
    .select("shop_domain, access_token_encrypted, access_token_iv")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !connection) {
    throw new ConfigurationError(
      "Shopify is not connected for this organization. Connect Shopify in Settings, or configure SHOPIFY_ACCESS_TOKEN and SHOPIFY_SHOP_DOMAIN for this Supabase project.",
    );
  }
  if (!connection.access_token_encrypted || !connection.access_token_iv) {
    throw new ConfigurationError("Shopify connection is missing encrypted token data. Please reconnect Shopify.");
  }

  const encryptionKey = Deno.env.get("SHOPIFY_TOKEN_ENCRYPTION_KEY");
  if (!encryptionKey) {
    throw new ConfigurationError("SHOPIFY_TOKEN_ENCRYPTION_KEY is not configured for this Supabase project.");
  }

  return {
    accessToken: await decryptText(
      connection.access_token_encrypted,
      connection.access_token_iv,
      encryptionKey,
    ),
    shopDomain: normalizeShopDomain(connection.shop_domain),
    apiVersion,
  };
}

async function findVariantBySku(config: ShopifyConfig, sku: string): Promise<ShopifyVariant | null> {
  const query = `
    query FindVariantBySku($query: String!) {
      productVariants(first: 10, query: $query) {
        nodes {
          id
          sku
          title
          product {
            id
            title
            handle
            legacyResourceId
          }
        }
      }
    }
  `;

  const attempts = [
    `sku:'${escapeShopifySearchValue(sku)}'`,
    `sku:${sku}`,
  ];

  for (const search of attempts) {
    const data = await shopifyGraphql<{ productVariants?: { nodes?: ShopifyVariant[] } }>(
      config,
      query,
      { query: search },
    );
    const nodes = data.productVariants?.nodes ?? [];
    const exactMatches = nodes.filter((node) => node.sku === sku || node.sku?.toUpperCase() === sku.toUpperCase());
    if (exactMatches.length > 1) {
      throw new Error(`Multiple Shopify variants found for SKU ${sku}; expected exactly one.`);
    }
    if (exactMatches.length === 1) return exactMatches[0];
  }

  return null;
}

async function downloadShopifySourceImage(imageUrl: string): Promise<Uint8Array> {
  let response: Response;
  try {
    response = await fetch(imageUrl, {
      signal: AbortSignal.timeout(SHOPIFY_SOURCE_IMAGE_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && /abort|timeout/i.test(error.message);
    throw new Error(
      timedOut
        ? `Timed out downloading the Madison source image after ${SHOPIFY_SOURCE_IMAGE_TIMEOUT_MS}ms.`
        : `Could not download the Madison source image: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!response.ok) {
    throw new Error(`Could not download the Madison source image (${response.status}).`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function stageShopifyProductImage(
  config: ShopifyConfig,
  sku: string,
  imageUrl: string,
  bytes: Uint8Array,
): Promise<string> {
  const stagedInput = buildStagedUploadsCreateInput({
    imageUrl,
    sku,
    fileSize: bytes.byteLength,
  });
  const data = await shopifyGraphql<{
    stagedUploadsCreate?: {
      stagedTargets?: Array<{
        url?: string | null;
        resourceUrl?: string | null;
        parameters?: Array<{ name?: string | null; value?: string | null }>;
      }>;
      userErrors?: Array<{ field?: string[] | null; message: string }>;
    };
  }>(config, `
    mutation StagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters { name value }
        }
        userErrors { field message }
      }
    }
  `, { input: [stagedInput] });

  const stagedErrors = data.stagedUploadsCreate?.userErrors ?? [];
  if (stagedErrors.length > 0) {
    throw new Error(`Shopify staged upload failed: ${userErrorMessage(stagedErrors)}`);
  }
  const target = data.stagedUploadsCreate?.stagedTargets?.[0];
  if (!target?.url || !target.resourceUrl) {
    throw new Error("Shopify staged upload did not return a resource URL.");
  }

  const form = new FormData();
  for (const parameter of target.parameters ?? []) {
    if (parameter.name && parameter.value != null) {
      form.append(parameter.name, parameter.value);
    }
  }
  form.append(
    "file",
    new Blob([bytes], { type: stagedInput.mimeType }),
    stagedInput.filename,
  );

  let uploadResponse: Response;
  try {
    uploadResponse = await fetch(target.url, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(SHOPIFY_SOURCE_IMAGE_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(
      `Shopify staged binary upload failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!uploadResponse.ok) {
    throw new Error(`Shopify staged binary upload failed (${uploadResponse.status}).`);
  }
  return target.resourceUrl;
}

async function createProductMedia(
  config: ShopifyConfig,
  productId: string,
  imageUrl: string,
  altText: string,
  sku: string,
): Promise<{ id: string; status?: string; url?: string | null }> {
  const originalSource = shouldStageShopifyImageUpload(imageUrl)
    ? await stageShopifyProductImage(
      config,
      sku,
      imageUrl,
      await downloadShopifySourceImage(imageUrl),
    )
    : imageUrl;

  const mutation = `
    mutation ProductImageCreate($productId: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $productId, media: $media) {
        media {
          id
          alt
          status
          mediaContentType
          ... on MediaImage {
            image {
              url
            }
          }
        }
        mediaUserErrors {
          field
          message
        }
      }
    }
  `;

  const data = await shopifyGraphql<{
    productCreateMedia?: {
      media?: Array<{ id: string; status?: string; image?: { url?: string | null } | null }>;
      mediaUserErrors?: Array<{ field?: string[] | null; message: string }>;
    };
  }>(config, mutation, {
    productId,
    media: [
      {
        mediaContentType: "IMAGE",
        originalSource,
        alt: altText.slice(0, 512),
      },
    ],
  });

  const errors = data.productCreateMedia?.mediaUserErrors ?? [];
  if (errors.length > 0) {
    throw new Error(userErrorMessage(errors));
  }

  const media = data.productCreateMedia?.media?.[0];
  if (!media?.id) {
    throw new Error("Shopify did not return a media ID for the uploaded image");
  }

  return { id: media.id, status: media.status, url: media.image?.url ?? null };
}

async function appendMediaToVariant(
  config: ShopifyConfig,
  productId: string,
  variantId: string,
  mediaId: string,
): Promise<void> {
  const mutation = `
    mutation AppendVariantMedia($productId: ID!, $variantMedia: [ProductVariantAppendMediaInput!]!) {
      productVariantAppendMedia(productId: $productId, variantMedia: $variantMedia) {
        productVariants {
          id
          sku
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const data = await shopifyGraphql<{
    productVariantAppendMedia?: {
      userErrors?: Array<{ field?: string[] | null; message: string }>;
    };
  }>(config, mutation, {
    productId,
    variantMedia: [
      {
        variantId,
        mediaIds: [mediaId],
      },
    ],
  });

  const errors = data.productVariantAppendMedia?.userErrors ?? [];
  if (errors.length > 0) {
    throw new Error(userErrorMessage(errors));
  }
}

async function listVariantMediaIds(
  config: ShopifyConfig,
  variantId: string,
): Promise<string[]> {
  return (await listVariantMedia(config, variantId)).map((media) => media.id);
}

async function listVariantMedia(
  config: ShopifyConfig,
  variantId: string,
): Promise<ShopifyVariantMedia[]> {
  const query = `
    query VariantAttachedMedia($variantId: ID!) {
      node(id: $variantId) {
        ... on ProductVariant {
          media(first: 20) {
            nodes {
              id
              alt
              ... on MediaImage {
                image {
                  url
                }
              }
            }
          }
        }
      }
    }
  `;

  const data = await shopifyGraphql<{
    node?: {
      media?: {
        nodes?: Array<{
          id?: string | null;
          alt?: string | null;
          image?: { url?: string | null } | null;
        }>;
      };
    } | null;
  }>(config, query, { variantId });

  return (data.node?.media?.nodes ?? [])
    .map((node) => ({
      id: node.id?.trim() ?? "",
      alt: node.alt ?? null,
      imageUrl: node.image?.url ?? null,
    }))
    .filter((media) => Boolean(media.id));
}

async function detachMediaFromVariant(
  config: ShopifyConfig,
  productId: string,
  variantId: string,
  mediaIds: string[],
): Promise<void> {
  if (mediaIds.length === 0) return;

  const mutation = `
    mutation DetachVariantMedia($productId: ID!, $variantMedia: [ProductVariantDetachMediaInput!]!) {
      productVariantDetachMedia(productId: $productId, variantMedia: $variantMedia) {
        productVariants {
          id
          sku
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const data = await shopifyGraphql<{
    productVariantDetachMedia?: {
      userErrors?: Array<{ field?: string[] | null; message: string }>;
    };
  }>(config, mutation, {
    productId,
    variantMedia: [
      {
        variantId,
        mediaIds,
      },
    ],
  });

  const errors = data.productVariantDetachMedia?.userErrors ?? [];
  if (errors.length > 0) {
    throw new Error(userErrorMessage(errors));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getMediaImageStatus(
  config: ShopifyConfig,
  mediaId: string,
): Promise<{ status: string | null; url: string | null }> {
  const query = `
    query MediaImageUrl($id: ID!) {
      node(id: $id) {
        ... on MediaImage {
          status
          image {
            url
          }
        }
      }
    }
  `;

  const data = await shopifyGraphql<{
    node?: { status?: string | null; image?: { url?: string | null } | null } | null;
  }>(config, query, { id: mediaId });

  return {
    status: data.node?.status ?? null,
    url: data.node?.image?.url ?? null,
  };
}

async function waitForMediaReady(
  config: ShopifyConfig,
  mediaId: string,
  initialStatus?: string | null,
  initialUrl?: string | null,
): Promise<{ status: string | null; url: string | null }> {
  let latest = {
    status: initialStatus ?? null,
    url: initialUrl ?? null,
  };

  if (latest.status === "READY") return latest;

  for (let attempt = 0; attempt < SHOPIFY_MEDIA_READY_MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 0) await sleep(SHOPIFY_MEDIA_READY_POLL_MS);
    latest = await getMediaImageStatus(config, mediaId);

    if (latest.status === "READY") return latest;
    if (latest.status === "FAILED") {
      throw new Error("Shopify media processing failed before it could be attached to the variant");
    }
  }

  throw new Error(
    `Shopify media was not ready for variant attachment. Last status: ${latest.status ?? "unknown"}`,
  );
}

async function appendReadyMediaToVariant(
  config: ShopifyConfig,
  productId: string,
  variantId: string,
  media: { id: string; status?: string | null; url?: string | null },
): Promise<{ status: string | null; url: string | null }> {
  let readyMedia = await waitForMediaReady(config, media.id, media.status ?? null, media.url ?? null);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await appendMediaToVariant(config, productId, variantId, media.id);
      return readyMedia;
    } catch (error) {
      if (isVariantAlreadyHasMediaError(error)) {
        const attachedMediaIds = await listVariantMediaIds(config, variantId);
        await detachMediaFromVariant(config, productId, variantId, attachedMediaIds);
        await appendMediaToVariant(config, productId, variantId, media.id);
        return readyMedia;
      }
      if (!isNonReadyMediaError(error) || attempt === 2) throw error;
      await sleep(SHOPIFY_MEDIA_READY_POLL_MS);
      readyMedia = await waitForMediaReady(config, media.id, readyMedia.status, readyMedia.url);
    }
  }

  return readyMedia;
}

async function waitForMediaImageUrl(
  config: ShopifyConfig,
  mediaId: string,
): Promise<string | null> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (attempt > 0) await sleep(750);
    const media = await getMediaImageStatus(config, mediaId);
    if (media.url) return media.url;
    if (media.status === "FAILED") return null;
  }

  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401);

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "Supabase service configuration missing" }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const isServiceRoleRequest = isExactConfiguredServiceRoleToken(token, serviceRoleKey);
    const { data: { user }, error: userError } = isServiceRoleRequest
      ? { data: { user: null }, error: null }
      : await supabase.auth.getUser(token);
    if (!isServiceRoleRequest && (userError || !user)) return jsonResponse({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({})) as {
      items?: unknown;
      organizationId?: string;
      attachToVariant?: boolean;
      syncBestBottlesConvex?: boolean;
      enforceBestBottlesFinishMatch?: boolean;
      catalogHeroProductGroupSlug?: string;
      dryRun?: boolean;
      includeExistingVariantMedia?: boolean;
    };
    const items = Array.isArray(body.items) ? body.items as RequestItem[] : [];
    if (items.length === 0) {
      return jsonResponse({ error: "items is required" }, 400);
    }
    if (items.length > 50) {
      return jsonResponse({ error: "Batch limit is 50 images at a time" }, 400);
    }

    if (isServiceRoleRequest && !body.organizationId) {
      return jsonResponse({ error: "organizationId is required for service-role requests" }, 400);
    }
    const organizationId = isServiceRoleRequest
      ? body.organizationId!
      : await resolveOrganizationId(supabase, user!.id, body.organizationId);
    const shopifyConfig = await getShopifyConfig(supabase, organizationId);
    const dryRun = body.dryRun === true;
    const syncBestBottlesConvex = body.syncBestBottlesConvex === true;
    const catalogHeroProductGroupSlug =
      body.catalogHeroProductGroupSlug?.trim() ?? "";
    const bbConvexUrl = syncBestBottlesConvex ? getBestBottlesConvexUrl() : "";
    const bbConvexWriteToken = syncBestBottlesConvex && !dryRun ? getBestBottlesConvexWriteToken() : "";
    if (syncBestBottlesConvex && !bbConvexUrl) {
      return jsonResponse({
        error:
          "BESTBOTTLES_CONVEX_URL is required when syncBestBottlesConvex is true.",
      }, 500);
    }
    if (syncBestBottlesConvex && !dryRun && !bbConvexWriteToken) {
      return jsonResponse({
        error:
          "BEST_BOTTLES_CONVEX_WRITE_TOKEN is required when syncBestBottlesConvex is true.",
      }, 500);
    }

    const imageIds = items
      .map((item) => item.imageId)
      .filter((imageId): imageId is string => Boolean(imageId));
    const imageById = new Map<string, {
      id: string;
      image_url: string;
      session_name: string | null;
      final_prompt: string | null;
      organization_id: string | null;
      user_id: string;
      library_tags: string[] | null;
    }>();

    if (imageIds.length > 0) {
      const { data: images, error: imagesError } = await supabase
        .from("generated_images")
        .select("id, image_url, session_name, final_prompt, organization_id, user_id, library_tags")
        .in("id", imageIds);

      if (imagesError) throw new Error(imagesError.message);
      for (const image of images ?? []) {
        imageById.set(image.id, image);
      }
    }

    const results = [];

    for (const item of items) {
      const sku = item.sku?.trim();
      const requestedWebsiteSku = item.websiteSku?.trim();
      const requestedGraceSku = item.graceSku?.trim();
      const expectedCapColor = item.expectedCapColor?.trim();
      const manualVisualIdentityApproval = item.manualVisualIdentityApproval
        ? {
            visualFinish: item.manualVisualIdentityApproval.visualFinish?.trim() ?? "",
            capHeight: item.manualVisualIdentityApproval.capHeight?.trim() ?? "",
            confirmed: item.manualVisualIdentityApproval.confirmed === true,
            reviewedAt: item.manualVisualIdentityApproval.reviewedAt?.trim() ?? new Date().toISOString(),
            reviewedBy: item.manualVisualIdentityApproval.reviewedBy ?? user?.email ?? user?.id ?? null,
            reason:
              item.manualVisualIdentityApproval.reason?.trim() ||
              "User confirmed visual identity despite resolver low confidence",
            notes: item.manualVisualIdentityApproval.notes?.trim() ?? "",
          }
        : undefined;
      const dbImage = item.imageId ? imageById.get(item.imageId) ?? null : null;
      const imageUrl = dbImage?.image_url ?? item.imageUrl?.trim();
      const label = toShopifyAltText(
        item.altText?.trim() || dbImage?.session_name,
        sku ? `${sku} product image` : "Product image",
      );
      const mode = item.mode === "cap-off" ? "cap-off" : "cap-on";

      if (!sku) {
        results.push({ imageId: item.imageId, sku, status: "failed", message: "Missing SKU" });
        continue;
      }
      if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
        results.push({ imageId: item.imageId, sku, status: "failed", message: "Missing public image URL" });
        continue;
      }
      if (
        !isServiceRoleRequest &&
        dbImage &&
        dbImage.organization_id !== organizationId &&
        dbImage.user_id !== user!.id
      ) {
        results.push({ imageId: item.imageId, sku, status: "failed", message: "Image does not belong to this organization" });
        continue;
      }

      try {
        // Exact guarded-job resolution is independent of the optional Convex sync path.
        // When an exact id is supplied, never fall back to a fuzzy SKU match.
        const pipelineSkuJob = item.pipelineSkuJobId?.trim()
          ? await findPipelineSkuJob(supabase, organizationId, [], item.pipelineSkuJobId)
          : syncBestBottlesConvex
          ? await findPipelineSkuJob(
              supabase,
              organizationId,
              [sku, requestedWebsiteSku ?? "", requestedGraceSku ?? ""],
            )
          : null;
        if (catalogHeroProductGroupSlug) {
          if (!pipelineSkuJob) {
            throw new Error(
              "Catalog hero publication requires the exact pipeline SKU job.",
            );
          }
          if (!pipelineSkuJob.product_group_slug?.trim()) {
            throw new Error(
              "The exact pipeline SKU job has no product group membership.",
            );
          }
          if (
            pipelineSkuJob.product_group_slug.trim().toLowerCase() !==
            catalogHeroProductGroupSlug.toLowerCase()
          ) {
            throw new Error(
              `Exact SKU job belongs to ${pipelineSkuJob.product_group_slug}, not ${catalogHeroProductGroupSlug}.`,
            );
          }
          if (mode !== "cap-on") {
            throw new Error("Catalog group heroes must use the main product image slot.");
          }
          const tags = dbImage?.library_tags ?? [];
          if (
            !tags.includes("background-qa:pass") ||
            !tags.includes("canvas-hex:#F5F3EF")
          ) {
            throw new Error(
              "Catalog hero publication requires canonical #F5F3EF background QA.",
            );
          }
        }

        let bestBottlesProduct: ResolvedBestBottlesProduct | null = null;
        if (syncBestBottlesConvex) {
          bestBottlesProduct = await resolveBestBottlesProduct(
            bbConvexUrl,
            sku,
            [
              requestedWebsiteSku ?? "",
              requestedGraceSku ?? "",
              pipelineSkuJob?.website_sku ?? "",
              pipelineSkuJob?.grace_sku ?? "",
              pipelineSkuJob?.shopify_sku ?? "",
            ],
          );
          if (!bestBottlesProduct && pipelineSkuJob?.website_sku) {
            bestBottlesProduct = {
              inputSku: sku,
              websiteSku: pipelineSkuJob.website_sku,
              graceSku: pipelineSkuJob.grace_sku ?? null,
              resolvedVia: "pipelineSkuJob",
              product: null,
            };
          }
          if (!bestBottlesProduct) {
            results.push({
              imageId: item.imageId,
              sku,
              mode,
              status: "failed",
              message: `No Best Bottles Convex product found for SKU ${sku}`,
            });
            continue;
          }
          if (body.enforceBestBottlesFinishMatch === true) {
            assertBestBottlesFinishMatch(
              expectedCapColor || manualVisualIdentityApproval?.visualFinish,
              bestBottlesProduct.product,
              manualVisualIdentityApproval,
              inferExpectedVisualIdentityFromBestBottlesSku([
                sku,
                requestedWebsiteSku ?? "",
                requestedGraceSku ?? "",
                bestBottlesProduct.websiteSku,
                bestBottlesProduct.graceSku ?? "",
              ]),
            );
          }
        }

        const cylinderPublishRequested = (
          /^(?:tall\s+)?cylinder$/i.test(getString(pipelineSkuJob?.family))
          || /^(?:tall\s+)?cylinder$/i.test(getString(bestBottlesProduct?.product?.family))
          || [
            sku,
            requestedWebsiteSku,
            requestedGraceSku,
            pipelineSkuJob?.website_sku,
            pipelineSkuJob?.grace_sku,
            bestBottlesProduct?.websiteSku,
            bestBottlesProduct?.graceSku,
          ].some(isCylinderProductSku)
        );
        const guardNow = new Date().toISOString();
        const trustedAuthorization = !dryRun && cylinderPublishRequested
          ? await loadTrustedShopifyPublishAuthorization(
              supabase,
              organizationId,
              item.publishAuthorizationId,
            )
          : null;
        const cylinderGuardInput: CylinderShopifyPublishGuardInput = {
          organizationId,
          dryRun,
          isCylinderProduct: cylinderPublishRequested,
          isServiceRoleRequest,
          authenticatedUserId: user?.id ?? null,
          organizationMembershipVerified: !isServiceRoleRequest,
          now: guardNow,
          item,
          trustedAuthorization,
          job: pipelineSkuJob,
          image: dbImage,
        };
        assertCylinderShopifyPublishAuthorized(cylinderGuardInput);

        const baseShopifySkuCandidates = expandBestBottlesSkuCandidates([
            pipelineSkuJob?.shopify_sku,
            pipelineSkuJob?.grace_sku,
            sku,
            requestedWebsiteSku,
            requestedGraceSku,
            bestBottlesProduct?.graceSku,
            bestBottlesProduct?.websiteSku,
        ]);
        const shopifySkuCandidates = uniqueTrimmedStrings([
          ...baseShopifySkuCandidates,
          ...findBestBottlesShopifySkuAliases(baseShopifySkuCandidates),
        ]);
        let variant: ShopifyVariant | null = null;
        let matchedShopifySku = sku;
        for (const candidate of shopifySkuCandidates) {
          variant = await findVariantBySku(shopifyConfig, candidate);
          if (variant) {
            matchedShopifySku = candidate;
            break;
          }
        }
        if (!variant) {
          const tried = shopifySkuCandidates.length > 0
            ? ` Tried: ${shopifySkuCandidates.join(", ")}.`
            : "";
          results.push({
            imageId: item.imageId,
            sku,
            status: "failed",
            message: `No Shopify variant found for SKU ${sku}.${tried}`,
          });
          continue;
        }
        const actualShopifySku = variant.sku ?? matchedShopifySku;

        if (dryRun) {
          const field = mode === "cap-off" ? "imageUrlCapOff" : "imageUrl";
          const existingVariantMedia = body.includeExistingVariantMedia === true
            ? await listVariantMedia(shopifyConfig, variant.id)
            : [];
          results.push(buildShopifyPushDryRunResult({
            imageId: item.imageId,
            sku,
            matchedShopifySku,
            actualShopifySku,
            expectedCapColor: expectedCapColor ?? null,
            manualVisualIdentityApproval: manualVisualIdentityApproval ?? null,
            mode,
            variant,
            bestBottlesConvex: bestBottlesProduct
              ? {
                  websiteSku: bestBottlesProduct.websiteSku,
                  graceSku: bestBottlesProduct.graceSku,
                  resolvedVia: bestBottlesProduct.resolvedVia,
                  field,
                }
              : null,
            existingVariantMedia,
            legacyMediaCleanupDisposition: existingVariantMedia.length > 0
              ? "detach-after-successful-replacement"
              : "no-existing-variant-media",
          }));
          continue;
        }

        const media = await executeCylinderShopifyGuardedMutation(
          cylinderGuardInput,
          () => createProductMedia(
            shopifyConfig,
            variant.product.id,
            imageUrl,
            label,
            sku,
          ),
          (authorizationId) => claimTrustedShopifyPublishAuthorization(supabase, {
            authorizationId,
            organizationId,
            pipelineSkuJobId: pipelineSkuJob?.id ?? "",
            generatedImageId: dbImage?.id ?? "",
            websiteSku: pipelineSkuJob?.website_sku ?? "",
            graceSku: pipelineSkuJob?.grace_sku ?? "",
            consumedByUserId: user?.id ?? null,
            consumedAt: new Date().toISOString(),
          }),
        );

        let readyMedia: { status: string | null; url: string | null } = {
          status: media.status ?? null,
          url: media.url ?? null,
        };
        if (body.attachToVariant !== false) {
          readyMedia = await appendReadyMediaToVariant(
            shopifyConfig,
            variant.product.id,
            variant.id,
            media,
          );
        }

        const shopifyImageUrl = readyMedia.url ?? await waitForMediaImageUrl(shopifyConfig, media.id);
        const attachedVariantMediaIds = body.attachToVariant === false
          ? []
          : await listVariantMediaIds(shopifyConfig, variant.id);
        const shopifyReadbackMatched = attachedVariantMediaIds.includes(media.id);
        let convexReadbackMatched: boolean | null = null;
        let convexReadbackImageUrl: string | null = null;
        let bestBottlesConvex: Record<string, unknown> | null = null;
        if (syncBestBottlesConvex && bestBottlesProduct) {
          if (!shopifyImageUrl) {
            throw new Error("Shopify accepted the image but did not return a CDN URL for Convex sync");
          }

          const field = mode === "cap-off" ? "imageUrlCapOff" : "imageUrl";
          const mutation = await callBestBottlesConvex(
            bbConvexUrl,
            "mutation",
            "products:setVariantImages",
            { websiteSku: bestBottlesProduct.websiteSku, [field]: shopifyImageUrl, writeToken: bbConvexWriteToken },
          );
          if (!mutation.ok) {
            throw new Error(
              formatConvexServerError(mutation.body?.errorMessage) ||
                `Best Bottles Convex sync failed with status ${mutation.status}`,
            );
          }

          const mutationValue = mutation.body?.value as { success?: boolean; error?: string } | null | undefined;
          if (mutationValue?.success === false) {
            throw new Error(
              mutationValue.error ||
                "Best Bottles Convex did not update the product image",
            );
          }

          if (!bestBottlesProduct.graceSku) {
            throw new Error(
              "Best Bottles Convex read-back requires the resolved canonical Grace SKU.",
            );
          }
          let groupHeroMutationValue: unknown = null;
          if (catalogHeroProductGroupSlug) {
            const groupHeroMutation = await callBestBottlesConvex(
              bbConvexUrl,
              "mutation",
              "products:setProductGroupHeroFromApprovedSku",
              {
                productGroupSlug: catalogHeroProductGroupSlug,
                websiteSku: bestBottlesProduct.websiteSku,
                graceSku: bestBottlesProduct.graceSku,
                heroImageUrl: shopifyImageUrl,
                writeToken: bbConvexWriteToken,
              },
            );
            if (
              !groupHeroMutation.ok &&
              shouldFallbackCatalogHeroToPrimarySku(groupHeroMutation.body?.errorMessage)
            ) {
              const primarySkuMutation = await callBestBottlesConvex(
                bbConvexUrl,
                "mutation",
                "products:setProductGroupPrimarySku",
                {
                  productGroupSlug: catalogHeroProductGroupSlug,
                  websiteSku: bestBottlesProduct.websiteSku,
                  graceSku: bestBottlesProduct.graceSku,
                  writeToken: bbConvexWriteToken,
                },
              );
              if (!primarySkuMutation.ok) {
                throw new Error(
                  formatConvexServerError(primarySkuMutation.body?.errorMessage) ||
                    `Best Bottles group hero fallback failed with status ${primarySkuMutation.status}`,
                );
              }
              const primarySkuResult = primarySkuMutation.body?.value as {
                success?: boolean;
                heroImageUrl?: string | null;
                error?: string;
              } | null;
              if (
                primarySkuResult?.success !== true ||
                primarySkuResult.heroImageUrl !== shopifyImageUrl
              ) {
                throw new Error(
                  primarySkuResult?.error ||
                    "Best Bottles primary-SKU fallback did not confirm the exact Shopify CDN URL.",
                );
              }
              groupHeroMutationValue = {
                ...primarySkuResult,
                fallback: "setProductGroupPrimarySku",
              };
            } else if (!groupHeroMutation.ok) {
              throw new Error(
                formatConvexServerError(groupHeroMutation.body?.errorMessage) ||
                  `Best Bottles group hero sync failed with status ${groupHeroMutation.status}`,
              );
            } else {
              groupHeroMutationValue = groupHeroMutation.body?.value ?? null;
              const groupHeroMutationResult = groupHeroMutationValue as {
                success?: boolean;
                heroImageUrl?: string;
              } | null;
              if (
                groupHeroMutationResult?.success !== true ||
                groupHeroMutationResult.heroImageUrl !== shopifyImageUrl
              ) {
                throw new Error(
                  "Best Bottles group hero mutation did not confirm the exact Shopify CDN URL.",
                );
              }
            }
          }
          const convexReadback = await callBestBottlesConvex(
            bbConvexUrl,
            "query",
            "products:getBySku",
            { graceSku: bestBottlesProduct.graceSku },
          );
          const convexReadbackValue = convexReadback.body?.value as Record<string, unknown> | null | undefined;
          convexReadbackImageUrl = typeof convexReadbackValue?.[field] === "string"
            ? String(convexReadbackValue[field]).trim()
            : null;
          convexReadbackMatched = convexReadback.ok && convexReadbackImageUrl === shopifyImageUrl;

          bestBottlesConvex = {
            websiteSku: bestBottlesProduct.websiteSku,
            resolvedVia: bestBottlesProduct.resolvedVia,
            field,
            imageUrl: shopifyImageUrl,
            readbackImageUrl: convexReadbackImageUrl,
            readbackMatched: convexReadbackMatched,
            mutation: mutation.body?.value ?? null,
            groupHeroMutation: groupHeroMutationValue,
          };
        }

        const finalMediaStatus = readyMedia.status ?? (body.attachToVariant !== false ? "READY" : media.status ?? null);

        await supabase.from("shopify_publish_log").insert({
          organization_id: organizationId,
          product_id: null,
          shopify_product_id: variant.product.id,
          published_by: user?.id ?? dbImage?.user_id ?? null,
          published_content: {
            type: "product_image",
            source: "image_library_batch",
            sku,
            matchedShopifySku,
            actualShopifySku,
            requestedWebsiteSku: requestedWebsiteSku ?? null,
            requestedGraceSku: requestedGraceSku ?? null,
            expectedCapColor: expectedCapColor ?? null,
            manualVisualIdentityApproval: manualVisualIdentityApproval
                ? {
                  visualFinish: manualVisualIdentityApproval.visualFinish || null,
                  capHeight: manualVisualIdentityApproval.capHeight || null,
                  confirmed: manualVisualIdentityApproval.confirmed,
                  reviewedAt: manualVisualIdentityApproval.reviewedAt || null,
                  reviewedBy: manualVisualIdentityApproval.reviewedBy ?? null,
                  reason: manualVisualIdentityApproval.reason || null,
                  notes: manualVisualIdentityApproval.notes || null,
                }
              : null,
            pipelineSkuJob: pipelineSkuJob
              ? {
                  graceSku: pipelineSkuJob.grace_sku ?? null,
                  websiteSku: pipelineSkuJob.website_sku ?? null,
                  shopifySku: pipelineSkuJob.shopify_sku ?? null,
                  productGroupSlug: pipelineSkuJob.product_group_slug ?? null,
                }
              : null,
            mode,
            imageId: item.imageId ?? null,
            imageUrl,
            shopifyImageUrl: shopifyImageUrl ?? null,
            mediaId: media.id,
            mediaStatus: finalMediaStatus,
            variantId: variant.id,
            productTitle: variant.product.title,
            bestBottlesConvex,
          },
        });

        if (pipelineSkuJob?.id && item.imageId && shopifyImageUrl) {
          const { error: skuJobUpdateError } = await supabase
            .from("best_bottles_pipeline_sku_jobs")
            .update({
              status: syncBestBottlesConvex ? "synced" : "shopify-pushed",
              approved_image_url: imageUrl,
              shopify_product_id: variant.product.id,
              shopify_variant_id: variant.id,
              shopify_media_id: media.id,
              shopify_image_url: shopifyImageUrl,
              shopify_sku: actualShopifySku,
              shopify_pushed_at: new Date().toISOString(),
              convex_synced_at: syncBestBottlesConvex ? new Date().toISOString() : null,
              last_error: null,
            })
            .eq("id", pipelineSkuJob.id);
          if (skuJobUpdateError) throw new Error(skuJobUpdateError.message);

          const { error: shopifyVerificationError } = await supabase.rpc(
            "record_best_bottles_destination_verification",
            {
              p_organization_id: organizationId,
              p_pipeline_sku_job_id: pipelineSkuJob.id,
              p_image_id: item.imageId,
              p_destination: "shopify",
              p_state: shopifyReadbackMatched ? "matched" : "mismatch",
              p_verified_image_url: shopifyImageUrl,
              p_verified_image_hash: null,
              p_error: shopifyReadbackMatched
                ? null
                : `Shopify media ${media.id} was not present on variant ${variant.id} after attachment.`,
            },
          );
          if (shopifyVerificationError) throw new Error(shopifyVerificationError.message);

          if (syncBestBottlesConvex) {
            const { error: convexVerificationError } = await supabase.rpc(
              "record_best_bottles_destination_verification",
              {
                p_organization_id: organizationId,
                p_pipeline_sku_job_id: pipelineSkuJob.id,
                p_image_id: item.imageId,
                p_destination: "convex",
                p_state: convexReadbackMatched ? "matched" : "mismatch",
                p_verified_image_url: convexReadbackImageUrl,
                p_verified_image_hash: null,
                p_error: convexReadbackMatched
                  ? null
                  : "Convex read-back did not equal the verified Shopify CDN URL.",
              },
            );
            if (convexVerificationError) throw new Error(convexVerificationError.message);
          }

          if (!shopifyReadbackMatched) {
            throw new Error("Shopify write completed but variant-media read-back did not match.");
          }
          if (syncBestBottlesConvex && !convexReadbackMatched) {
            throw new Error("Convex write completed but product read-back did not match.");
          }
        }

        results.push({
          imageId: item.imageId,
          sku,
          matchedShopifySku,
          actualShopifySku,
          expectedCapColor: expectedCapColor ?? null,
          manualVisualIdentityApproval: manualVisualIdentityApproval ?? null,
          mode,
          status: "success",
          shopifyProductId: variant.product.id,
          shopifyVariantId: variant.id,
          mediaId: media.id,
          mediaStatus: finalMediaStatus,
          shopifyImageUrl: shopifyImageUrl ?? null,
          bestBottlesConvex,
        });
      } catch (error) {
        results.push({
          imageId: item.imageId,
          sku,
          status: "failed",
          message: error instanceof Error ? error.message : "Unknown Shopify error",
        });
      }
    }

    const successCount = results.filter((result) => result.status === "success" || result.status === "dry-run").length;
    const failedCount = results.length - successCount;

    return jsonResponse({
      success: failedCount === 0,
      dryRun,
      successCount,
      failedCount,
      results,
    });
  } catch (error) {
    console.error("push-shopify-product-images error:", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      error instanceof ConfigurationError ? error.status : 500,
    );
  }
});
