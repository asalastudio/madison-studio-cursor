/**
 * Patch Best Bottles live catalog data: sets Convex `productGroups.heroImageUrl`
 * for the given slug using the library image URL (public Supabase storage URL).
 * No Sanity hop — the storefront reads hero URLs from Convex.
 *
 * POST /functions/v1/push-bestbottles-grid-hero
 * Authorization: Bearer <supabase user jwt>
 * Body: { imageUrl: string, slug: string }
 *
 * Env: BESTBOTTLES_CONVEX_URL
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
  );
  const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
  if (userError || !user) {
    return json({ error: "Not signed in", detail: userError?.message }, 401);
  }

  let body: { imageUrl?: string; slug?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";

  if (!imageUrl || !slug) {
    return json({ error: "imageUrl and slug are required" }, 400);
  }
  if (!imageUrl.startsWith("https://") && !imageUrl.startsWith("http://")) {
    return json({ error: "imageUrl must be http(s)" }, 400);
  }

  const convexUrl = Deno.env.get("BESTBOTTLES_CONVEX_URL");
  if (!convexUrl) {
    return json(
      { error: "BESTBOTTLES_CONVEX_URL is not configured for this deployment." },
      500,
    );
  }

  const heroImageUrl = imageUrl;

  try {
    const mutationUrl = `${convexUrl.replace(/\/$/, "")}/api/mutation`;
    const convexResponse = await fetch(mutationUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "productGroups:setHeroImageUrl",
        args: { slug, heroImageUrl },
        format: "json",
      }),
    });

    let convexBody: unknown;
    try {
      convexBody = await convexResponse.json();
    } catch {
      return json({ error: "Convex returned non-JSON", heroImageUrl }, 502);
    }

    if (!convexResponse.ok) {
      return json(
        {
          error: `Convex ${convexResponse.status}`,
          upstream: convexBody,
          heroImageUrl,
        },
        502,
      );
    }

    const parsed = convexBody as {
      status?: string;
      value?: unknown;
      errorMessage?: string;
    };
    if (parsed?.status === "error") {
      return json(
        {
          error: parsed.errorMessage || "Convex mutation failed",
          heroImageUrl,
        },
        400,
      );
    }

    const value = parsed?.value as
      | { success?: boolean; error?: string; slug?: string }
      | undefined;
    if (value && value.success === false && value.error === "not_found") {
      return json(
        {
          error: `No product group found in Convex for slug "${slug}". Check the slug matches productGroups.slug.`,
          heroImageUrl,
          convex: value,
        },
        404,
      );
    }

    return json({
      success: true,
      slug,
      heroImageUrl,
      convex: value ?? null,
    });
  } catch (e) {
    console.error("[push-bestbottles-grid-hero]", e);
    return json(
      { error: e instanceof Error ? e.message : String(e) },
      500,
    );
  }
});
