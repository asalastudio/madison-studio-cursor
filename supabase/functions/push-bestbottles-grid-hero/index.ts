/**
 * Patch Best Bottles live catalog hero data.
 *
 * Catalog/product-group hero images are curated site imagery, so this uploads
 * the Madison Library image into Best Bottles Sanity and then sets Convex
 * `productGroups.heroImageUrl` to the resulting Sanity CDN URL.
 *
 * POST /functions/v1/push-bestbottles-grid-hero
 * Authorization: Bearer <supabase user jwt>
 * Body: { imageUrl: string, slug: string }
 *
 * Env: BESTBOTTLES_CONVEX_URL, BESTBOTTLES_SANITY_PROJECT_ID,
 *      BESTBOTTLES_SANITY_WRITE_TOKEN
 */

import { createClient as createSanityClient } from "https://esm.sh/@sanity/client@6.8.6";
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

function getBestBottlesSanityConfig() {
  return {
    projectId:
      cleanSecret(Deno.env.get("BESTBOTTLES_SANITY_PROJECT_ID")) ||
      cleanSecret(Deno.env.get("BB_SANITY_PROJECT_ID")),
    dataset:
      cleanSecret(Deno.env.get("BESTBOTTLES_SANITY_DATASET")) ||
      cleanSecret(Deno.env.get("BB_SANITY_DATASET")) ||
      "production",
    token:
      cleanSecret(Deno.env.get("BESTBOTTLES_SANITY_WRITE_TOKEN")) ||
      cleanSecret(Deno.env.get("BESTBOTTLES_SANITY_API_TOKEN")) ||
      cleanSecret(Deno.env.get("BB_SANITY_WRITE_TOKEN")) ||
      cleanSecret(Deno.env.get("BB_SANITY_API_TOKEN")),
    apiVersion:
      cleanSecret(Deno.env.get("BESTBOTTLES_SANITY_API_VERSION")) ||
      cleanSecret(Deno.env.get("BB_SANITY_API_VERSION")) ||
      "2024-01-01",
  };
}

function getBestBottlesSanityClient() {
  const config = getBestBottlesSanityConfig();
  if (!config.projectId || !config.token) {
    throw new Error(
      "Missing Best Bottles Sanity configuration. Set BESTBOTTLES_SANITY_PROJECT_ID and BESTBOTTLES_SANITY_WRITE_TOKEN in Madison Supabase secrets.",
    );
  }

  return createSanityClient({
    projectId: config.projectId,
    dataset: config.dataset,
    token: config.token,
    apiVersion: config.apiVersion,
    useCdn: false,
  });
}

function safeFilenameBase(slug: string) {
  return `${slug}-hero`.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 90);
}

async function uploadHeroToSanity(params: {
  imageUrl: string;
  slug: string;
}): Promise<{ sanityImageUrl: string; sanityAssetId: string }> {
  const sanityClient = getBestBottlesSanityClient();
  const imageRes = await fetch(params.imageUrl);
  if (!imageRes.ok) {
    throw new Error(`Failed to fetch Madison image (${imageRes.status}): ${imageRes.statusText}`);
  }

  const imageBlob = await imageRes.blob();
  const contentType = imageRes.headers.get("content-type") || imageBlob.type || "image/png";
  const extension =
    contentType.includes("jpeg") || contentType.includes("jpg")
      ? "jpg"
      : contentType.includes("webp")
        ? "webp"
        : "png";
  const asset = await sanityClient.assets.upload("image", imageBlob, {
    filename: `${safeFilenameBase(params.slug)}.${extension}`,
  });

  if (!asset?._id || !asset?.url) {
    throw new Error("Sanity upload completed without an asset id or CDN URL.");
  }

  return { sanityImageUrl: asset.url, sanityAssetId: asset._id };
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
  const inputSlug = typeof body.slug === "string" ? body.slug.trim() : "";
  const slug = normalizeProductGroupSlug(inputSlug);

  if (!imageUrl || !slug) {
    return json({ error: "imageUrl and slug are required" }, 400);
  }
  if (!imageUrl.startsWith("https://") && !imageUrl.startsWith("http://")) {
    return json({ error: "imageUrl must be http(s)" }, 400);
  }

  const convexUrl =
    cleanSecret(Deno.env.get("BB_CONVEX_URL")) ||
    cleanSecret(Deno.env.get("BESTBOTTLES_CONVEX_URL"));
  if (!convexUrl) {
    return json(
      { error: "BESTBOTTLES_CONVEX_URL is not configured for this deployment." },
      500,
    );
  }

  let sanityUpload: { sanityImageUrl: string; sanityAssetId: string };
  try {
    sanityUpload = await uploadHeroToSanity({ imageUrl, slug });
  } catch (e) {
    return json(
      {
        error: `Best Bottles Sanity hero upload failed: ${e instanceof Error ? e.message : String(e)}`,
        inputSlug,
        slug,
        sourceImageUrl: imageUrl,
      },
      500,
    );
  }

  const heroImageUrl = sanityUpload.sanityImageUrl;

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
      return json(
        {
          error: "Convex returned non-JSON",
          sourceImageUrl: imageUrl,
          heroImageUrl,
          sanityAssetId: sanityUpload.sanityAssetId,
        },
        502,
      );
    }

    if (!convexResponse.ok) {
      return json(
        {
          error: `Convex ${convexResponse.status}`,
          upstream: convexBody,
          sourceImageUrl: imageUrl,
          heroImageUrl,
          sanityAssetId: sanityUpload.sanityAssetId,
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
          error:
            parsed.errorMessage ||
            "Convex mutation failed. Confirm productGroups:setHeroImageUrl is deployed in Best Bottles Convex.",
          inputSlug,
          slug,
          sourceImageUrl: imageUrl,
          heroImageUrl,
          sanityAssetId: sanityUpload.sanityAssetId,
        },
        502,
      );
    }

    const value = parsed?.value as
      | { success?: boolean; error?: string; slug?: string }
      | undefined;
    if (value && value.success === false && value.error === "not_found") {
      return json(
        {
          error: `No product group found in Convex for slug "${slug}". Check the slug matches productGroups.slug.`,
          inputSlug,
          sourceImageUrl: imageUrl,
          heroImageUrl,
          sanityAssetId: sanityUpload.sanityAssetId,
          convex: value,
        },
        404,
      );
    }

    return json({
      success: true,
      slug,
      inputSlug,
      sourceImageUrl: imageUrl,
      heroImageUrl,
      sanityImageUrl: sanityUpload.sanityImageUrl,
      sanityAssetId: sanityUpload.sanityAssetId,
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
