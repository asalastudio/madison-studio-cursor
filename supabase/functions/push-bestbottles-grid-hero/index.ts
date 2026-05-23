/**
 * Push a Madison-generated Best Bottles product-group hero through Shopify.
 *
 * Product/catalog images that represent purchasable SKUs should live in
 * Shopify product/variant media. This route resolves a Best Bottles group slug
 * to its primary SKU, forwards the image to `push-shopify-product-images`, and
 * lets that function cache the returned Shopify CDN URL in Best Bottles Convex.
 *
 * POST /functions/v1/push-bestbottles-grid-hero
 * Authorization: Bearer <supabase user jwt>
 * Body: { imageUrl: string, slug: string, organizationId?: string }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type PipelineGroup = {
  id: string;
  organization_id: string;
  convex_slug: string | null;
  primary_website_sku: string | null;
  primary_grace_sku: string | null;
};

type ShopifyPushResult = {
  status?: string;
  sku?: string;
  shopifyImageUrl?: string | null;
  shopifyProductId?: string | null;
  shopifyVariantId?: string | null;
  mediaId?: string | null;
  message?: string;
  bestBottlesConvex?: {
    websiteSku?: string | null;
    mutation?: unknown;
    error?: string;
  } | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanSecret(value: string | undefined | null) {
  return value?.trim().replace(/^['"]|['"]$/g, "") || "";
}

function normalizeProductGroupSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function getUserOrganizationIds(params: {
  supabaseUrl: string;
  serviceRoleKey: string;
  userId: string;
}) {
  const serviceClient = createClient(params.supabaseUrl, params.serviceRoleKey);
  const { data, error } = await serviceClient
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", params.userId);

  if (error) throw new Error(`Organization lookup failed: ${error.message}`);
  return (data ?? [])
    .map((row) => normalizeOptionalString(row.organization_id))
    .filter(Boolean);
}

async function resolvePipelineGroup(params: {
  supabaseUrl: string;
  serviceRoleKey: string;
  inputSlug: string;
  allowedOrganizationIds: string[];
  requestedOrganizationId?: string;
}) {
  const normalizedSlug = normalizeProductGroupSlug(params.inputSlug);
  if (!normalizedSlug) return null;

  const allowedOrganizationIds = params.requestedOrganizationId
    ? params.allowedOrganizationIds.filter((id) => id === params.requestedOrganizationId)
    : params.allowedOrganizationIds;

  if (allowedOrganizationIds.length === 0) {
    throw new Error("No authorized organization was found for this user.");
  }

  const serviceClient = createClient(params.supabaseUrl, params.serviceRoleKey);
  const { data, error } = await serviceClient
    .from("best_bottles_pipeline_groups")
    .select("id, organization_id, convex_slug, primary_website_sku, primary_grace_sku")
    .in("organization_id", allowedOrganizationIds)
    .ilike("convex_slug", normalizedSlug)
    .limit(2);

  if (error) throw new Error(`Product group lookup failed: ${error.message}`);
  const matches = (data ?? []) as PipelineGroup[];
  if (matches.length > 1) {
    throw new Error(
      `Multiple Madison groups match "${normalizedSlug}". Choose a specific organization before publishing.`,
    );
  }
  return matches[0] ?? null;
}

async function patchPipelineGroupSyncStatus(params: {
  supabaseUrl: string;
  serviceRoleKey: string;
  groupId: string;
  convexSynced: boolean;
}) {
  const now = new Date().toISOString();
  const serviceClient = createClient(params.supabaseUrl, params.serviceRoleKey);
  const { error } = await serviceClient
    .from("best_bottles_pipeline_groups")
    .update({
      madison_shopify_synced_at: now,
      madison_convex_synced_at: params.convexSynced ? now : null,
      madison_last_error: null,
    })
    .eq("id", params.groupId);

  if (error) {
    console.warn("[push-bestbottles-grid-hero] group sync status update failed", {
      groupId: params.groupId,
      error: error.message,
    });
    return false;
  }
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Missing Authorization header" }, 401);
  }
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return json({ error: "Empty bearer token" }, 401);

  const supabaseUrl = cleanSecret(Deno.env.get("SUPABASE_URL"));
  const anonKey = cleanSecret(Deno.env.get("SUPABASE_ANON_KEY"));
  const serviceRoleKey = cleanSecret(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: "Supabase URL, anon key, and service role key are required." }, 500);
  }

  const supabase = createClient(supabaseUrl, anonKey);
  const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
  if (userError || !user) {
    return json({ error: "Not signed in", detail: userError?.message }, 401);
  }

  let body: { imageUrl?: string; slug?: string; organizationId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const imageUrl = normalizeOptionalString(body.imageUrl);
  const inputSlug = normalizeOptionalString(body.slug);
  const requestedOrganizationId = normalizeOptionalString(body.organizationId);

  if (!imageUrl || !inputSlug) {
    return json({ error: "imageUrl and slug are required" }, 400);
  }
  if (!imageUrl.startsWith("https://") && !imageUrl.startsWith("http://")) {
    return json({ error: "imageUrl must be http(s)" }, 400);
  }

  try {
    const allowedOrganizationIds = await getUserOrganizationIds({
      supabaseUrl,
      serviceRoleKey,
      userId: user.id,
    });
    const group = await resolvePipelineGroup({
      supabaseUrl,
      serviceRoleKey,
      inputSlug,
      allowedOrganizationIds,
      requestedOrganizationId,
    });

    if (!group?.convex_slug) {
      return json(
        {
          error: `No Madison product group found for slug "${normalizeProductGroupSlug(inputSlug)}". Confirm the group slug before publishing.`,
          inputSlug,
          sourceImageUrl: imageUrl,
        },
        404,
      );
    }

    const websiteSku = normalizeOptionalString(group.primary_website_sku);
    const graceSku = normalizeOptionalString(group.primary_grace_sku);
    const sku = websiteSku || graceSku;
    if (!sku) {
      return json(
        {
          error: `Product group "${group.convex_slug}" has no primary SKU to attach as Shopify media.`,
          inputSlug,
          slug: group.convex_slug,
          sourceImageUrl: imageUrl,
        },
        422,
      );
    }

    const pushResponse = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/push-shopify-product-images`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
        apikey: anonKey,
      },
      body: JSON.stringify({
        organizationId: group.organization_id,
        items: [
          {
            imageUrl,
            sku,
            websiteSku: websiteSku || undefined,
            graceSku: graceSku || undefined,
            altText: `${group.convex_slug} product hero`,
            mode: "cap-on",
          },
        ],
        attachToVariant: true,
        syncBestBottlesConvex: true,
      }),
    });

    let pushBody: unknown = null;
    try {
      pushBody = await pushResponse.json();
    } catch {
      return json(
        {
          error: "Shopify media push returned non-JSON.",
          inputSlug,
          slug: group.convex_slug,
          sourceImageUrl: imageUrl,
        },
        502,
      );
    }

    if (!pushResponse.ok) {
      return json(
        {
          error: `Shopify media push failed with ${pushResponse.status}.`,
          upstream: pushBody,
          inputSlug,
          slug: group.convex_slug,
          sourceImageUrl: imageUrl,
        },
        502,
      );
    }

    const firstResult = Array.isArray((pushBody as { results?: unknown[] })?.results)
      ? ((pushBody as { results: ShopifyPushResult[] }).results[0] ?? null)
      : null;

    if ((pushBody as { error?: string })?.error || !firstResult || firstResult.status === "failed") {
      return json(
        {
          error:
            (pushBody as { error?: string })?.error ||
            firstResult?.message ||
            "Shopify media push failed for the product-group primary SKU.",
          upstream: pushBody,
          inputSlug,
          slug: group.convex_slug,
          websiteSku: websiteSku || null,
          graceSku: graceSku || null,
          sourceImageUrl: imageUrl,
        },
        502,
      );
    }

    const groupPatched = await patchPipelineGroupSyncStatus({
      supabaseUrl,
      serviceRoleKey,
      groupId: group.id,
      convexSynced: Boolean(firstResult.bestBottlesConvex && !firstResult.bestBottlesConvex.error),
    });

    return json({
      success: true,
      source: "shopify",
      slug: group.convex_slug,
      inputSlug,
      organizationId: group.organization_id,
      websiteSku: firstResult.bestBottlesConvex?.websiteSku || websiteSku || null,
      graceSku: graceSku || null,
      sourceImageUrl: imageUrl,
      heroImageUrl: firstResult.shopifyImageUrl ?? null,
      shopifyImageUrl: firstResult.shopifyImageUrl ?? null,
      shopifyProductId: firstResult.shopifyProductId ?? null,
      shopifyVariantId: firstResult.shopifyVariantId ?? null,
      mediaId: firstResult.mediaId ?? null,
      convex: firstResult.bestBottlesConvex?.mutation ?? null,
      pipelineGroupPatched: groupPatched,
      forwarded: pushBody,
    });
  } catch (e) {
    console.error("[push-bestbottles-grid-hero]", e);
    return json(
      { error: e instanceof Error ? e.message : String(e) },
      500,
    );
  }
});
