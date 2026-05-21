import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type RequestItem = {
  imageId?: string;
  imageUrl?: string;
  sku?: string;
  websiteSku?: string;
  graceSku?: string;
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
  applicator?: unknown;
};

type PipelineSkuJobLookup = {
  grace_sku?: string | null;
  website_sku?: string | null;
  shopify_sku?: string | null;
  product_group_slug?: string | null;
};

type ResolvedBestBottlesProduct = {
  inputSku: string;
  websiteSku: string;
  graceSku: string | null;
  resolvedVia: "websiteSku" | "graceSku" | "pipelineSkuJob";
  product: BestBottlesProductLookup | null;
};

const SHOPIFY_IMAGE_ALT_TEXT_MAX_CHARS = 512;

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
): Promise<PipelineSkuJobLookup | null> {
  const skuCandidates = uniqueTrimmedStrings(candidates);
  if (skuCandidates.length === 0) return null;

  for (const candidate of skuCandidates) {
    const lookup = async (includeShopifySku: boolean) => {
      const select = includeShopifySku
        ? "grace_sku,website_sku,shopify_sku,product_group_slug"
        : "grace_sku,website_sku,product_group_slug";
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
  const skuCandidates = Array.from(
    new Set(
      [rawSku, ...alternates]
        .map((candidate) => candidate.trim())
        .filter(Boolean),
    ),
  );
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
  const response = await fetch(
    `https://${config.shopDomain}/admin/api/${config.apiVersion}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": config.accessToken,
      },
      body: JSON.stringify({ query, variables }),
    },
  );

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
    const exact =
      nodes.find((node) => node.sku === sku) ??
      nodes.find((node) => node.sku?.toUpperCase() === sku.toUpperCase());
    if (exact) return exact;
    if (nodes[0]) return nodes[0];
  }

  return null;
}

async function createProductMedia(
  config: ShopifyConfig,
  productId: string,
  imageUrl: string,
  altText: string,
): Promise<{ id: string; status?: string; url?: string | null }> {
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
        originalSource: imageUrl,
        alt: altText,
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForMediaImageUrl(
  config: ShopifyConfig,
  mediaId: string,
): Promise<string | null> {
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

  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (attempt > 0) await sleep(750);
    const data = await shopifyGraphql<{
      node?: { status?: string | null; image?: { url?: string | null } | null } | null;
    }>(config, query, { id: mediaId });
    const url = data.node?.image?.url;
    if (url) return url;
    if (data.node?.status === "FAILED") return null;
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
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({})) as {
      items?: unknown;
      organizationId?: string;
      attachToVariant?: boolean;
      syncBestBottlesConvex?: boolean;
    };
    const items = Array.isArray(body.items) ? body.items as RequestItem[] : [];
    if (items.length === 0) {
      return jsonResponse({ error: "items is required" }, 400);
    }
    if (items.length > 50) {
      return jsonResponse({ error: "Batch limit is 50 images at a time" }, 400);
    }

    const organizationId = await resolveOrganizationId(supabase, user.id, body.organizationId);
    const shopifyConfig = await getShopifyConfig(supabase, organizationId);
    const syncBestBottlesConvex = body.syncBestBottlesConvex === true;
    const bbConvexUrl = syncBestBottlesConvex ? getBestBottlesConvexUrl() : "";
    if (syncBestBottlesConvex && !bbConvexUrl) {
      return jsonResponse({
        error:
          "BESTBOTTLES_CONVEX_URL is required when syncBestBottlesConvex is true.",
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
    }>();

    if (imageIds.length > 0) {
      const { data: images, error: imagesError } = await supabase
        .from("generated_images")
        .select("id, image_url, session_name, final_prompt, organization_id, user_id")
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
      const dbImage = item.imageId ? imageById.get(item.imageId) : null;
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
        dbImage &&
        dbImage.organization_id !== organizationId &&
        dbImage.user_id !== user.id
      ) {
        results.push({ imageId: item.imageId, sku, status: "failed", message: "Image does not belong to this organization" });
        continue;
      }

      try {
        const pipelineSkuJob = syncBestBottlesConvex
          ? await findPipelineSkuJob(
              supabase,
              organizationId,
              [sku, requestedWebsiteSku ?? "", requestedGraceSku ?? ""],
            )
          : null;

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
        }

        const shopifySkuCandidates = Array.from(new Set(
          [
            pipelineSkuJob?.shopify_sku,
            pipelineSkuJob?.grace_sku,
            sku,
            requestedWebsiteSku,
            requestedGraceSku,
            bestBottlesProduct?.graceSku,
            bestBottlesProduct?.websiteSku,
          ].filter((candidate): candidate is string => Boolean(candidate)),
        ));
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

        const media = await createProductMedia(
          shopifyConfig,
          variant.product.id,
          imageUrl,
          label,
        );

        if (body.attachToVariant !== false) {
          await appendMediaToVariant(shopifyConfig, variant.product.id, variant.id, media.id);
        }

        const shopifyImageUrl = media.url ?? await waitForMediaImageUrl(shopifyConfig, media.id);
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
            { websiteSku: bestBottlesProduct.websiteSku, [field]: shopifyImageUrl },
          );
          if (!mutation.ok) {
            throw new Error(
              mutation.body?.errorMessage ||
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

          bestBottlesConvex = {
            websiteSku: bestBottlesProduct.websiteSku,
            resolvedVia: bestBottlesProduct.resolvedVia,
            field,
            imageUrl: shopifyImageUrl,
            mutation: mutation.body?.value ?? null,
          };
        }

        await supabase.from("shopify_publish_log").insert({
          organization_id: organizationId,
          product_id: null,
          shopify_product_id: variant.product.id,
          published_by: user.id,
          published_content: {
            type: "product_image",
            source: "image_library_batch",
            sku,
            matchedShopifySku,
            requestedWebsiteSku: requestedWebsiteSku ?? null,
            requestedGraceSku: requestedGraceSku ?? null,
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
            mediaStatus: media.status ?? null,
            variantId: variant.id,
            productTitle: variant.product.title,
            bestBottlesConvex,
          },
        });

        results.push({
          imageId: item.imageId,
          sku,
          matchedShopifySku,
          mode,
          status: "success",
          shopifyProductId: variant.product.id,
          shopifyVariantId: variant.id,
          mediaId: media.id,
          mediaStatus: media.status ?? null,
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

    const successCount = results.filter((result) => result.status === "success").length;
    const failedCount = results.length - successCount;

    return jsonResponse({
      success: failedCount === 0,
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
