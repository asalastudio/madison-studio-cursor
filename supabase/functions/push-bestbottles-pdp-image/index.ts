/**
 * push-bestbottles-pdp-image
 * ─────────────────────────────────────────────────────────────────────────
 * Legacy compatibility endpoint.
 *
 * Product images now belong in Shopify Plus, not Sanity. This endpoint keeps
 * old Madison clients working by forwarding PDP image requests to
 * `push-shopify-product-images`, which uploads to Shopify product media,
 * attaches the media to the matched variant, then patches Best Bottles Convex
 * `products.imageUrl` (cap-on) or `products.imageUrlCapOff` (cap-off) with
 * the Shopify CDN URL.
 *
 * Companion to:
 *   push-bestbottles-grid-hero    — patches productGroups.heroImageUrl
 *
 * Body:
 *   {
 *     imageUrl:    string;                       // public Madison/Supabase image URL
 *     websiteSku:  string;                       // e.g. "GBEmp50RdcrBlkLthr"
 *     mode:        "cap-on" | "cap-off";         // which slot to fill
 *   }
 *
 * Auth: Supabase JWT (caller must be signed in to Madison).
 *
 * Returns:
 *   200 { ok: true, websiteSku, mode, field, shopifyImageUrl, mutationResult }
 *   400 { error: "..." }
 *   404 { error: "websiteSku not found in BB Convex" }
 *   500 { error: "..." }
 */

import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type PushBody = {
  imageUrl?: unknown;
  websiteSku?: unknown;
  mode?: unknown;
};

type ForwardedResult = {
  status?: string;
  message?: string;
  shopifyImageUrl?: string | null;
  shopifyProductId?: string | null;
  shopifyVariantId?: string | null;
  mediaId?: string | null;
  bestBottlesConvex?: {
    websiteSku?: string;
    field?: string;
    mutation?: unknown;
  } | null;
};

type ForwardedBody = {
  error?: string;
  results?: ForwardedResult[];
};

function cleanSecret(value: string | undefined | null) {
  return value?.trim().replace(/^['"]|['"]$/g, "") || "";
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse(401, { error: "Missing Authorization header" });
  }
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return jsonResponse(401, { error: "Empty bearer token" });

  const supabase = createSupabaseClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
  );
  const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
  if (userError || !user) {
    return jsonResponse(401, { error: "Not signed in", detail: userError?.message });
  }

  let body: PushBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
  const requestedWebsiteSku = typeof body.websiteSku === "string" ? body.websiteSku.trim() : "";
  const mode = body.mode === "cap-on" || body.mode === "cap-off" ? body.mode : null;

  if (!imageUrl) return jsonResponse(400, { error: "Missing imageUrl" });
  if (!requestedWebsiteSku) return jsonResponse(400, { error: "Missing websiteSku" });
  if (!mode) return jsonResponse(400, { error: "Missing or invalid mode (must be cap-on or cap-off)" });
  if (!imageUrl.startsWith("https://") && !imageUrl.startsWith("http://")) {
    return jsonResponse(400, { error: "imageUrl must be http(s)" });
  }

  const supabaseUrl = cleanSecret(Deno.env.get("SUPABASE_URL")).replace(/\/+$/, "");
  const anonKey = cleanSecret(Deno.env.get("SUPABASE_ANON_KEY"));
  if (!supabaseUrl || !anonKey) {
    return jsonResponse(500, {
      error:
        "SUPABASE_URL and SUPABASE_ANON_KEY are required to forward Best Bottles PDP images to Shopify.",
    });
  }

  try {
    const forwarded = await fetch(`${supabaseUrl}/functions/v1/push-shopify-product-images`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authHeader,
        "apikey": anonKey,
      },
      body: JSON.stringify({
        items: [
          {
            imageUrl,
            sku: requestedWebsiteSku,
            altText: requestedWebsiteSku,
            mode,
          },
        ],
        attachToVariant: true,
        syncBestBottlesConvex: true,
      }),
    });

    let forwardedBody: ForwardedBody | null = null;
    try {
      const parsed: unknown = await forwarded.json();
      forwardedBody =
        parsed && typeof parsed === "object"
          ? parsed as ForwardedBody
          : null;
    } catch {
      forwardedBody = null;
    }

    if (!forwarded.ok || forwardedBody?.error) {
      return jsonResponse(forwarded.ok ? 500 : forwarded.status, {
        error:
          forwardedBody?.error ||
          `push-shopify-product-images returned ${forwarded.status}`,
        upstream: forwardedBody,
      });
    }

    const firstResult = Array.isArray(forwardedBody?.results)
      ? forwardedBody.results[0]
      : null;
    if (firstResult?.status === "failed") {
      return jsonResponse(400, {
        error: firstResult.message || "Shopify image publish failed",
        upstream: forwardedBody,
      });
    }

    return jsonResponse(200, {
      ok: true,
      websiteSku:
        firstResult?.bestBottlesConvex?.websiteSku ||
        requestedWebsiteSku,
      requestedWebsiteSku,
      mode,
      field: firstResult?.bestBottlesConvex?.field || (mode === "cap-off" ? "imageUrlCapOff" : "imageUrl"),
      sourceImageUrl: imageUrl,
      shopifyImageUrl: firstResult?.shopifyImageUrl ?? null,
      shopifyProductId: firstResult?.shopifyProductId ?? null,
      shopifyVariantId: firstResult?.shopifyVariantId ?? null,
      mediaId: firstResult?.mediaId ?? null,
      mutationResult: firstResult?.bestBottlesConvex?.mutation ?? null,
      forwarded: forwardedBody,
    });
  } catch (e: unknown) {
    return jsonResponse(500, {
      error: `Shopify product image forward failed: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});
