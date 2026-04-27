/**
 * Best Bottles publish-master edge function.
 *
 * Takes an approved Madison master image (by `generated_images.id`) and a
 * Convex Grace SKU, then:
 *   1. Downloads the image from Supabase Storage (the `image_url` on the
 *      generated_images row).
 *   2. Looks up the Convex `products` row by graceSku to get the websiteSku
 *      that the Best Bottles website actually keys off.
 *   3. Uploads the image to Best Bottles' Sanity image-asset CDN
 *      (project gh97irjh, dataset production) under a deterministic
 *      `<websiteSku>_madison_master.png` filename so the legacy publish
 *      script can identify Madison-authored assets and skip them.
 *   4. Patches Convex `products.imageUrl` with the Sanity CDN URL via the
 *      public `products:setImageUrl` mutation.
 *   5. Optionally patches Convex `productGroups.heroImageUrl` via the
 *      public `productGroups:setHeroImageUrl` mutation when the operator
 *      flagged this as the group's primary colorway hero.
 *   6. Tags the originating Madison Library row with provenance markers
 *      (`published-to-bestbottles:<iso>`, `bb-website-sku:<sku>`,
 *      `bb-asset:<id>`) so the operator can audit what's live and so the
 *      legacy script can skip already-published rows.
 *
 * Body shape — single:
 *   { imageId: string, graceSku: string,
 *     setAsGroupHero?: boolean,
 *     groupSlug?: string }   // required when setAsGroupHero is true
 *
 * Body shape — batch (sequential with throttle):
 *   { batch: Array<{ imageId, graceSku, setAsGroupHero?, groupSlug? }> }
 *
 * Required Supabase secrets:
 *   BESTBOTTLES_CONVEX_URL          e.g. https://precise-raccoon-123.convex.cloud
 *   BESTBOTTLES_SANITY_WRITE_TOKEN  Sanity Editor-scope token, project gh97irjh
 *
 * Constants (hardcoded; they're public Sanity project identifiers):
 *   SANITY_PROJECT_ID = "gh97irjh"
 *   SANITY_DATASET    = "production"
 *   SANITY_API_VERSION = "2024-01-01"
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const SANITY_PROJECT_ID = "gh97irjh";
const SANITY_DATASET = "production";
const SANITY_API_VERSION = "2024-01-01";

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

interface PublishItem {
  imageId: string;
  graceSku: string;
  setAsGroupHero?: boolean;
  groupSlug?: string | null;
}

interface PublishResult {
  imageId: string;
  graceSku: string;
  ok: boolean;
  websiteSku?: string;
  sanityAssetId?: string;
  cdnUrl?: string;
  groupHeroSet?: boolean;
  error?: string;
  step?:
    | "lookup-image"
    | "lookup-convex-product"
    | "download-image"
    | "upload-sanity"
    | "patch-convex-product"
    | "patch-convex-group-hero"
    | "tag-library";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // === Auth: only signed-in Madison operators can publish.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);
  const userToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!userToken) return json({ error: "Empty bearer token" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !supabaseAnonKey) {
    return json({ error: "Supabase env not configured" }, 500);
  }

  // User-scoped client for auth check
  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
  const {
    data: { user },
    error: userError,
  } = await supabaseAuth.auth.getUser(userToken);
  if (userError || !user) {
    return json({ error: "Not signed in", detail: userError?.message }, 401);
  }

  // Service-role client for cross-row reads + tag updates
  const supabaseAdmin = createClient(
    supabaseUrl,
    supabaseServiceKey || supabaseAnonKey,
  );

  // === Required secrets
  const convexUrl = Deno.env.get("BESTBOTTLES_CONVEX_URL")?.replace(/\/$/, "");
  const sanityWriteToken = Deno.env.get("BESTBOTTLES_SANITY_WRITE_TOKEN");
  if (!convexUrl) {
    return json({ error: "BESTBOTTLES_CONVEX_URL secret not set" }, 500);
  }
  if (!sanityWriteToken) {
    return json({ error: "BESTBOTTLES_SANITY_WRITE_TOKEN secret not set" }, 500);
  }

  // === Parse body
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const body = parsed as { batch?: PublishItem[] } & PublishItem;
  const items: PublishItem[] = Array.isArray(body.batch)
    ? body.batch
    : body.imageId
      ? [{
          imageId: body.imageId,
          graceSku: body.graceSku,
          setAsGroupHero: body.setAsGroupHero,
          groupSlug: body.groupSlug ?? null,
        }]
      : [];
  if (items.length === 0) {
    return json({ error: "Body must contain { imageId, graceSku } or { batch: [...] }" }, 400);
  }

  // === Sequential publish loop with 200ms throttle (per integration report).
  // Sequential keeps us well under Sanity's write rate limit and lets us
  // surface per-item failures without partial-batch ambiguity.
  const results: PublishResult[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const result = await publishOne({
      item,
      supabaseAdmin,
      convexUrl,
      sanityWriteToken,
    });
    results.push(result);
    if (i < items.length - 1) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  return json({
    results,
    okCount,
    failCount: results.length - okCount,
    total: results.length,
  });
});

// =============================================================================

async function publishOne(args: {
  item: PublishItem;
  supabaseAdmin: ReturnType<typeof createClient>;
  convexUrl: string;
  sanityWriteToken: string;
}): Promise<PublishResult> {
  const { item, supabaseAdmin, convexUrl, sanityWriteToken } = args;
  const { imageId, graceSku, setAsGroupHero, groupSlug } = item;

  // 1. Look up the generated_images row in Madison.
  let imageUrl: string;
  try {
    const { data, error } = await supabaseAdmin
      .from("generated_images")
      .select("id, image_url, library_tags, organization_id")
      .eq("id", imageId)
      .single();
    if (error || !data) throw new Error(error?.message ?? "Image row not found");
    if (!data.image_url) throw new Error("Image row has no image_url");
    imageUrl = data.image_url as string;
  } catch (e) {
    return failure(item, "lookup-image", e);
  }

  // 2. Resolve graceSku → websiteSku via Convex public query.
  //    Best Bottles' Sanity uses websiteSku as the matching key, not graceSku.
  let websiteSku: string;
  try {
    const product = await convexQuery<{ websiteSku?: string } | null>(
      convexUrl,
      "products:getBySku",
      { graceSku },
    );
    if (!product || !product.websiteSku) {
      throw new Error(`No Convex product for graceSku="${graceSku}"`);
    }
    websiteSku = product.websiteSku;
  } catch (e) {
    return failure(item, "lookup-convex-product", e);
  }

  // 3. Download the image bytes from Supabase Storage.
  let imageBuffer: ArrayBuffer;
  let imageContentType: string;
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`Storage fetch ${res.status}: ${res.statusText}`);
    imageContentType = res.headers.get("Content-Type") || "image/png";
    imageBuffer = await res.arrayBuffer();
  } catch (e) {
    return failure(item, "download-image", e);
  }

  // 4. Upload to Sanity image-asset CDN.
  //    Filename uses `_madison_master` suffix so the legacy publish script
  //    can recognize Madison-authored assets and skip them on its next run.
  const sanityFilename = `${websiteSku}_madison_master.png`;
  let sanityAssetId: string;
  let cdnUrl: string;
  try {
    const sanityUploadUrl =
      `https://${SANITY_PROJECT_ID}.api.sanity.io/v${SANITY_API_VERSION}/assets/images/${SANITY_DATASET}` +
      `?filename=${encodeURIComponent(sanityFilename)}`;
    const sanityRes = await fetch(sanityUploadUrl, {
      method: "POST",
      headers: {
        "Content-Type": imageContentType,
        Authorization: `Bearer ${sanityWriteToken}`,
      },
      body: imageBuffer,
    });
    if (!sanityRes.ok) {
      const text = await sanityRes.text();
      throw new Error(`Sanity upload ${sanityRes.status}: ${text.slice(0, 400)}`);
    }
    const payload = (await sanityRes.json()) as {
      document?: { _id?: string; url?: string };
    };
    if (!payload.document?._id || !payload.document.url) {
      throw new Error("Sanity returned no asset _id/url");
    }
    sanityAssetId = payload.document._id;
    cdnUrl = payload.document.url;
  } catch (e) {
    return failure(item, "upload-sanity", e);
  }

  // 5. Patch Convex products.imageUrl with the Sanity CDN URL.
  try {
    const patchRes = await convexMutation<{ success?: boolean; error?: string }>(
      convexUrl,
      "products:setImageUrl",
      { websiteSku, imageUrl: cdnUrl },
    );
    if (!patchRes || patchRes.success === false) {
      throw new Error(patchRes?.error ?? "Convex setImageUrl returned not-success");
    }
  } catch (e) {
    return failure(item, "patch-convex-product", e, {
      websiteSku,
      sanityAssetId,
      cdnUrl,
    });
  }

  // 6. Optionally lift to productGroups.heroImageUrl (group-level catalog hero).
  //    Operator-controlled per generation; only fires when the publish UI's
  //    "Set as group hero" checkbox is on AND a groupSlug was provided.
  let groupHeroSet = false;
  if (setAsGroupHero && groupSlug) {
    try {
      const heroRes = await convexMutation<{ success?: boolean; error?: string }>(
        convexUrl,
        "productGroups:setHeroImageUrl",
        { slug: groupSlug, heroImageUrl: cdnUrl },
      );
      if (!heroRes || heroRes.success === false) {
        throw new Error(heroRes?.error ?? "Convex setHeroImageUrl returned not-success");
      }
      groupHeroSet = true;
    } catch (e) {
      return failure(item, "patch-convex-group-hero", e, {
        websiteSku,
        sanityAssetId,
        cdnUrl,
      });
    }
  }

  // 7. Tag the Madison Library row so the operator can audit what's live
  //    and so any legacy script can skip already-published images.
  try {
    const stamp = new Date().toISOString();
    const newTags = [
      `published-to-bestbottles:${stamp}`,
      `bb-website-sku:${websiteSku}`,
      `bb-asset:${sanityAssetId}`,
    ];
    const { data: row } = await supabaseAdmin
      .from("generated_images")
      .select("library_tags")
      .eq("id", imageId)
      .single();
    const existing: string[] = Array.isArray(row?.library_tags) ? row.library_tags : [];
    // Drop any prior published-to-bestbottles tag so the latest publish
    // timestamp wins and audits stay accurate.
    const filtered = existing.filter(
      (t) => typeof t === "string" && !t.startsWith("published-to-bestbottles:"),
    );
    const merged = Array.from(new Set([...filtered, ...newTags]));
    await supabaseAdmin
      .from("generated_images")
      .update({ library_tags: merged })
      .eq("id", imageId);
  } catch (e) {
    // Non-fatal: the image IS live on bestbottles.com at this point. Tag
    // failure just means the audit trail is missing. Surface in logs but
    // return success.
    console.warn("[bestbottles-publish-master] tag update failed", e);
  }

  return {
    imageId,
    graceSku,
    ok: true,
    websiteSku,
    sanityAssetId,
    cdnUrl,
    groupHeroSet,
  };
}

// =============================================================================
// Convex public HTTP API helpers — no auth required for public mutations.
// =============================================================================

async function convexQuery<T>(
  convexUrl: string,
  path: string,
  args: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${convexUrl}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, args, format: "json" }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Convex query ${res.status}: ${text.slice(0, 400)}`);
  }
  const body = (await res.json()) as { value?: T; status?: string; errorMessage?: string };
  if (body.status && body.status !== "success") {
    throw new Error(body.errorMessage ?? `Convex query ${path} returned ${body.status}`);
  }
  return body.value as T;
}

async function convexMutation<T>(
  convexUrl: string,
  path: string,
  args: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${convexUrl}/api/mutation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, args, format: "json" }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Convex mutation ${res.status}: ${text.slice(0, 400)}`);
  }
  const body = (await res.json()) as { value?: T; status?: string; errorMessage?: string };
  if (body.status && body.status !== "success") {
    throw new Error(body.errorMessage ?? `Convex mutation ${path} returned ${body.status}`);
  }
  return body.value as T;
}

function failure(
  item: PublishItem,
  step: PublishResult["step"],
  e: unknown,
  partial: Partial<PublishResult> = {},
): PublishResult {
  const message = e instanceof Error ? e.message : String(e);
  return {
    imageId: item.imageId,
    graceSku: item.graceSku,
    ok: false,
    step,
    error: message,
    ...partial,
  };
}
