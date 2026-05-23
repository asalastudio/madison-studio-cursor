import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type BackfillBody = {
  organizationId?: unknown;
  family?: unknown;
  productGroupSlug?: unknown;
  skus?: unknown;
  limit?: unknown;
  dryRun?: unknown;
  recoverMissingShopifyImageUrls?: unknown;
};

type PipelineSkuJob = {
  id: string;
  organization_id: string;
  product_group_slug: string;
  product_group_display_name: string | null;
  grace_sku: string | null;
  website_sku: string | null;
  shopify_sku: string | null;
  status: string;
  shopify_product_id?: string | null;
  shopify_variant_id?: string | null;
  shopify_media_id?: string | null;
  shopify_image_url: string | null;
  shopify_pushed_at: string | null;
  convex_synced_at: string | null;
};

type ShopifyConfig = {
  shopDomain: string;
  accessToken: string;
  apiVersion: string;
};

type ShopifyGraphqlBody<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
  raw?: string;
};

type ConvexResponseBody = {
  status?: string;
  errorMessage?: string;
  value?: unknown;
};

type BackfillResult = {
  id: string;
  graceSku: string | null;
  websiteSku: string | null;
  shopifySku: string | null;
  productGroupSlug: string;
  status: "dry-run" | "synced" | "failed" | "skipped";
  message?: string;
  field?: "imageUrl";
  shopifyImageUrl?: string | null;
  mutation?: unknown;
};

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

function getStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => getString(item))
        .filter(Boolean),
    ),
  );
}

function getLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 250;
  return Math.max(1, Math.min(1000, Math.floor(value)));
}

function normalizeShopDomain(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "");
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

async function getShopifyConfig(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<ShopifyConfig> {
  const envToken = cleanSecret(Deno.env.get("SHOPIFY_ACCESS_TOKEN"));
  const envDomain = cleanSecret(Deno.env.get("SHOPIFY_SHOP_DOMAIN"));
  const apiVersion = cleanSecret(Deno.env.get("SHOPIFY_API_VERSION")) || "2026-04";

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

  if (error) throw new Error(error.message);
  const shopifyConnection = connection as {
    shop_domain?: string | null;
    access_token_encrypted?: string | null;
    access_token_iv?: string | null;
  } | null;
  if (!shopifyConnection) throw new Error("Shopify is not connected for this organization.");
  if (!shopifyConnection.access_token_encrypted || !shopifyConnection.access_token_iv) {
    throw new Error("Shopify connection is missing encrypted token data.");
  }

  const encryptionKey = cleanSecret(Deno.env.get("SHOPIFY_TOKEN_ENCRYPTION_KEY"));
  if (!encryptionKey) throw new Error("SHOPIFY_TOKEN_ENCRYPTION_KEY is not configured.");

  return {
    accessToken: await decryptText(
      shopifyConnection.access_token_encrypted,
      shopifyConnection.access_token_iv,
      encryptionKey,
    ),
    shopDomain: normalizeShopDomain(shopifyConnection.shop_domain ?? ""),
    apiVersion,
  };
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

async function fetchShopifyMediaUrls(
  config: ShopifyConfig,
  mediaIds: string[],
): Promise<Map<string, string>> {
  const query = `
    query MediaUrls($ids: [ID!]!) {
      nodes(ids: $ids) {
        id
        ... on MediaImage {
          status
          image {
            url
          }
        }
      }
    }
  `;
  const out = new Map<string, string>();

  for (let i = 0; i < mediaIds.length; i += 50) {
    const ids = mediaIds.slice(i, i + 50);
    const data = await shopifyGraphql<{
      nodes?: Array<{ id?: string | null; image?: { url?: string | null } | null } | null>;
    }>(config, query, { ids });

    for (const node of data.nodes ?? []) {
      const id = node?.id?.trim();
      const url = node?.image?.url?.trim();
      if (id && url) out.set(id, url);
    }
  }

  return out;
}

type ShopifyVariantMediaMatch = {
  productId: string;
  variantId: string;
  mediaId: string | null;
  imageUrl: string;
};

async function fetchShopifyVariantMediaBySku(
  config: ShopifyConfig,
  productId: string,
  skuCandidates: string[],
): Promise<ShopifyVariantMediaMatch | null> {
  const skuSet = new Set(skuCandidates.map((sku) => sku.trim()).filter(Boolean));
  if (!productId || skuSet.size === 0) return null;

  const query = `
    query ProductVariantMedia($id: ID!) {
      product(id: $id) {
        id
        variants(first: 100) {
          nodes {
            id
            sku
            image {
              url
            }
            media(first: 10) {
              nodes {
                id
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
    }
  `;
  const data = await shopifyGraphql<{
    product?: {
      id?: string | null;
      variants?: {
        nodes?: Array<{
          id?: string | null;
          sku?: string | null;
          image?: { url?: string | null } | null;
          media?: {
            nodes?: Array<{
              id?: string | null;
              image?: { url?: string | null } | null;
            } | null>;
          } | null;
        } | null>;
      } | null;
    } | null;
  }>(config, query, { id: productId });

  for (const variant of data.product?.variants?.nodes ?? []) {
    const sku = variant?.sku?.trim() ?? "";
    if (!sku || !skuSet.has(sku) || !variant?.id) continue;
    const media = (variant.media?.nodes ?? [])
      .find((node) => Boolean(node?.image?.url?.trim()));
    const mediaUrl = media?.image?.url?.trim();
    const imageUrl = mediaUrl || variant.image?.url?.trim();
    if (!imageUrl) return null;
    return {
      productId: data.product?.id?.trim() || productId,
      variantId: variant.id,
      mediaId: media?.id?.trim() || null,
      imageUrl,
    };
  }

  return null;
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

async function callBestBottlesConvexMutation(
  bbConvexUrl: string,
  path: string,
  args: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; body: ConvexResponseBody | null }> {
  const res = await fetch(`${bbConvexUrl}/api/mutation`, {
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

async function isAuthorized(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) return false;

  const serviceRoleKey =
    cleanSecret(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) ||
    cleanSecret(Deno.env.get("SUPABASE_SERVICE_KEY"));
  if (serviceRoleKey && token === serviceRoleKey) return true;
  try {
    const [, payload] = token.split(".");
    const parsed = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as {
      role?: unknown;
    };
    if (parsed.role === "service_role") return true;
  } catch {
    // Fall through to user-token validation.
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
  );
  const { data: { user } } = await supabase.auth.getUser(token);
  return Boolean(user);
}

function skuMatches(row: PipelineSkuJob, skus: Set<string>): boolean {
  if (skus.size === 0) return true;
  const candidates = [row.grace_sku, row.website_sku, row.shopify_sku]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean);
  return candidates.some((candidate) => skus.has(candidate));
}

async function recoverMissingShopifyImageUrls(params: {
  supabase: SupabaseClient;
  organizationId: string;
  family: string;
  productGroupSlug: string;
  skuFilter: Set<string>;
  limit: number;
  dryRun: boolean;
}): Promise<{ scanned: number; recoverable: number; recovered: number; missing: number }> {
  const { supabase, organizationId, family, productGroupSlug, skuFilter, limit, dryRun } = params;

  let query = supabase
    .from("best_bottles_pipeline_sku_jobs")
    .select(
      [
        "id",
        "organization_id",
        "product_group_slug",
        "product_group_display_name",
        "grace_sku",
        "website_sku",
        "shopify_sku",
        "status",
        "shopify_product_id",
        "shopify_variant_id",
        "shopify_media_id",
        "shopify_image_url",
        "shopify_pushed_at",
        "convex_synced_at",
      ].join(","),
    )
    .eq("organization_id", organizationId)
    .is("shopify_image_url", null)
    .order("product_group_slug", { ascending: true })
    .order("website_sku", { ascending: true })
    .limit(limit);

  if (family) query = query.ilike("product_group_slug", `${family.toLowerCase()}-%`);
  if (productGroupSlug) query = query.eq("product_group_slug", productGroupSlug);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = ((data ?? []) as unknown as PipelineSkuJob[])
    .filter((row) => skuMatches(row, skuFilter));
  const rowsWithMediaIds = rows.filter((row) => Boolean(row.shopify_media_id?.trim()));
  const rowsNeedingVariantLookup = rows.filter((row) => !row.shopify_media_id?.trim());
  const mediaIds = Array.from(new Set(rowsWithMediaIds.map((row) => row.shopify_media_id?.trim() ?? "").filter(Boolean)));

  const shopifyConfig = await getShopifyConfig(supabase, organizationId);
  const mediaUrls = await fetchShopifyMediaUrls(shopifyConfig, mediaIds);
  let recovered = 0;
  let recoverable = rowsWithMediaIds.filter((row) => mediaUrls.has(row.shopify_media_id?.trim() ?? "")).length;

  if (!dryRun) {
    for (const row of rowsWithMediaIds) {
      const mediaId = row.shopify_media_id?.trim() ?? "";
      const shopifyImageUrl = mediaUrls.get(mediaId);
      if (!shopifyImageUrl) continue;
      const { error: updateError } = await supabase
        .from("best_bottles_pipeline_sku_jobs")
        .update({ shopify_image_url: shopifyImageUrl, last_error: null })
        .eq("id", row.id);
      if (updateError) throw new Error(updateError.message);
      recovered += 1;
    }

    for (const row of rowsNeedingVariantLookup) {
      const directProductId = row.shopify_product_id?.trim() ?? "";
      let productId = directProductId;
      if (!productId && row.product_group_slug) {
        const { data: sibling, error: siblingError } = await supabase
          .from("best_bottles_pipeline_sku_jobs")
          .select("shopify_product_id")
          .eq("organization_id", organizationId)
          .eq("product_group_slug", row.product_group_slug)
          .not("shopify_product_id", "is", null)
          .limit(1)
          .maybeSingle();
        if (siblingError) throw new Error(siblingError.message);
        productId = ((sibling as { shopify_product_id?: string | null } | null)?.shopify_product_id ?? "").trim();
      }

      const match = await fetchShopifyVariantMediaBySku(
        shopifyConfig,
        productId,
        [row.shopify_sku, row.grace_sku, row.website_sku].filter(Boolean) as string[],
      );
      if (!match) continue;
      recoverable += 1;
      const { error: updateError } = await supabase
        .from("best_bottles_pipeline_sku_jobs")
        .update({
          status: "shopify-pushed",
          shopify_product_id: match.productId,
          shopify_variant_id: match.variantId,
          shopify_media_id: match.mediaId,
          shopify_image_url: match.imageUrl,
          shopify_pushed_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", row.id);
      if (updateError) throw new Error(updateError.message);
      recovered += 1;
    }
  }

  return {
    scanned: data?.length ?? 0,
    recoverable,
    recovered,
    missing: Math.max(0, rows.length - recoverable),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  if (!(await isAuthorized(req))) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let body: BackfillBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const organizationId = getString(body.organizationId);
  if (!organizationId) {
    return jsonResponse({ error: "organizationId is required" }, 400);
  }

  const bbConvexUrl = getBestBottlesConvexUrl();
  if (!bbConvexUrl) {
    return jsonResponse(
      { error: "BESTBOTTLES_CONVEX_URL or BB_CONVEX_URL is required for Convex backfill." },
      424,
    );
  }
  const bbConvexWriteToken = getBestBottlesConvexWriteToken();
  if (!bbConvexWriteToken) {
    return jsonResponse(
      { error: "BEST_BOTTLES_CONVEX_WRITE_TOKEN is required for Convex backfill." },
      424,
    );
  }

  const dryRun = body.dryRun !== false;
  const family = getString(body.family);
  const productGroupSlug = getString(body.productGroupSlug);
  const skuFilter = new Set(getStringArray(body.skus));
  const limit = getLimit(body.limit);
  const shouldRecoverMissingShopifyImageUrls = body.recoverMissingShopifyImageUrls === true;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    cleanSecret(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")),
  );

  let recovery = { scanned: 0, recoverable: 0, recovered: 0, missing: 0 };
  if (shouldRecoverMissingShopifyImageUrls) {
    try {
      recovery = await recoverMissingShopifyImageUrls({
        supabase,
        organizationId,
        family,
        productGroupSlug,
        skuFilter,
        limit,
        dryRun,
      });
    } catch (error) {
      return jsonResponse(
        {
          error: error instanceof Error ? error.message : String(error),
          phase: "recoverMissingShopifyImageUrls",
        },
        500,
      );
    }
  }

  let query = supabase
    .from("best_bottles_pipeline_sku_jobs")
    .select(
      [
        "id",
        "organization_id",
        "product_group_slug",
        "product_group_display_name",
        "grace_sku",
        "website_sku",
        "shopify_sku",
        "status",
        "shopify_image_url",
        "shopify_pushed_at",
        "convex_synced_at",
      ].join(","),
    )
    .eq("organization_id", organizationId)
    .in("status", ["shopify-pushed", "synced"])
    .not("shopify_pushed_at", "is", null)
    .not("shopify_image_url", "is", null)
    .order("product_group_slug", { ascending: true })
    .order("website_sku", { ascending: true })
    .limit(limit);

  if (family) query = query.ilike("product_group_slug", `${family.toLowerCase()}-%`);
  if (productGroupSlug) query = query.eq("product_group_slug", productGroupSlug);

  const { data, error } = await query;
  if (error) return jsonResponse({ error: error.message }, 500);

  const candidates = ((data ?? []) as unknown as PipelineSkuJob[])
    .filter((row) => skuMatches(row, skuFilter))
    .filter((row) => Boolean(row.website_sku?.trim() && row.shopify_image_url?.trim()));

  const now = new Date().toISOString();
  const results: BackfillResult[] = [];
  const seenWebsiteSkus = new Map<string, BackfillResult>();

  for (const row of candidates) {
    const websiteSku = row.website_sku?.trim() ?? "";
    const shopifyImageUrl = row.shopify_image_url?.trim() ?? "";
    if (!websiteSku || !shopifyImageUrl) {
      results.push({
        id: row.id,
        graceSku: row.grace_sku,
        websiteSku: row.website_sku,
        shopifySku: row.shopify_sku,
        productGroupSlug: row.product_group_slug,
        status: "skipped",
        message: "Missing website SKU or Shopify image URL.",
      });
      continue;
    }

    const prior = seenWebsiteSkus.get(websiteSku);
    if (prior?.status === "synced" || prior?.status === "dry-run") {
      if (!dryRun && prior.status === "synced") {
        const { error: updateError } = await supabase
          .from("best_bottles_pipeline_sku_jobs")
          .update({ status: "synced", convex_synced_at: now, last_error: null })
          .eq("id", row.id);
        if (updateError) {
          results.push({
            id: row.id,
            graceSku: row.grace_sku,
            websiteSku,
            shopifySku: row.shopify_sku,
            productGroupSlug: row.product_group_slug,
            status: "failed",
            message: updateError.message,
          });
          continue;
        }
      }

      results.push({
        id: row.id,
        graceSku: row.grace_sku,
        websiteSku,
        shopifySku: row.shopify_sku,
        productGroupSlug: row.product_group_slug,
        status: dryRun ? "dry-run" : "synced",
        field: "imageUrl",
        shopifyImageUrl,
        message: "Reused earlier mutation for duplicate website SKU.",
      });
      continue;
    }

    if (dryRun) {
      const result: BackfillResult = {
        id: row.id,
        graceSku: row.grace_sku,
        websiteSku,
        shopifySku: row.shopify_sku,
        productGroupSlug: row.product_group_slug,
        status: "dry-run",
        field: "imageUrl",
        shopifyImageUrl,
      };
      results.push(result);
      seenWebsiteSkus.set(websiteSku, result);
      continue;
    }

    const mutation = await callBestBottlesConvexMutation(
      bbConvexUrl,
      "products:setVariantImages",
      { websiteSku, imageUrl: shopifyImageUrl, writeToken: bbConvexWriteToken },
    );

    if (!mutation.ok) {
      const message =
        mutation.body?.errorMessage ||
        `Best Bottles Convex sync failed with status ${mutation.status}`;
      await supabase
        .from("best_bottles_pipeline_sku_jobs")
        .update({ last_error: message })
        .eq("id", row.id);
      const result: BackfillResult = {
        id: row.id,
        graceSku: row.grace_sku,
        websiteSku,
        shopifySku: row.shopify_sku,
        productGroupSlug: row.product_group_slug,
        status: "failed",
        message,
        field: "imageUrl",
        shopifyImageUrl,
        mutation: mutation.body,
      };
      results.push(result);
      seenWebsiteSkus.set(websiteSku, result);
      continue;
    }

    const { error: updateError } = await supabase
      .from("best_bottles_pipeline_sku_jobs")
      .update({ status: "synced", convex_synced_at: now, last_error: null })
      .eq("id", row.id);

    if (updateError) {
      results.push({
        id: row.id,
        graceSku: row.grace_sku,
        websiteSku,
        shopifySku: row.shopify_sku,
        productGroupSlug: row.product_group_slug,
        status: "failed",
        message: updateError.message,
        field: "imageUrl",
        shopifyImageUrl,
        mutation: mutation.body?.value ?? mutation.body,
      });
      continue;
    }

    const result: BackfillResult = {
      id: row.id,
      graceSku: row.grace_sku,
      websiteSku,
      shopifySku: row.shopify_sku,
      productGroupSlug: row.product_group_slug,
      status: "synced",
      field: "imageUrl",
      shopifyImageUrl,
      mutation: mutation.body?.value ?? mutation.body,
    };
    results.push(result);
    seenWebsiteSkus.set(websiteSku, result);
  }

  const syncedCount = results.filter((result) => result.status === "synced").length;
  const failedCount = results.filter((result) => result.status === "failed").length;
  const skippedCount = results.filter((result) => result.status === "skipped").length;

  return jsonResponse({
    dryRun,
    recovery,
    scanned: data?.length ?? 0,
    candidateCount: candidates.length,
    syncedCount,
    failedCount,
    skippedCount,
    results,
  });
});
