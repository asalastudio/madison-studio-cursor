/**
 * push-bestbottles-pdp-image
 * ─────────────────────────────────────────────────────────────────────────
 * Uploads a Madison Library image to Best Bottles Sanity, then patches
 * Best Bottles Convex `products.imageUrl` (cap-on) or
 * `products.imageUrlCapOff` (cap-off) for a specific SKU with the Sanity CDN URL.
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
 * Validation:
 *   - cap-off mode is rejected for applicators not in NEEDS_CAP_OFF
 *     (sprayers / atomizers / roll-ons / lotion pumps only)
 *
 * Returns:
 *   200 { ok: true, websiteSku, mode, field, sanityImageUrl, sanityAssetId, mutationResult }
 *   400 { error: "..." }
 *   404 { error: "websiteSku not found in BB Convex" }
 *   500 { error: "..." }
 */

// deno-lint-ignore-file no-explicit-any

import { createClient as createSanityClient } from "https://esm.sh/@sanity/client@6.8.6";
import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const NEEDS_CAP_OFF: ReadonlySet<string> = new Set([
  "Perfume Spray Pump",
  "Fine Mist Sprayer",
  "Atomizer",
  "Metal Atomizer",
  "Metal Roller Ball",
  "Plastic Roller Ball",
  "Lotion Pump",
]);

type PushBody = {
  imageUrl?: unknown;
  websiteSku?: unknown;
  mode?: unknown;
};

type ConvexProductLookup = {
  value?: {
    websiteSku?: unknown;
    graceSku?: unknown;
    applicator?: unknown;
  } | null;
};

type ResolvedWebsiteSku = {
  inputSku: string;
  websiteSku: string;
  product: ConvexProductLookup["value"];
  resolvedVia: "websiteSku" | "graceSku";
};

type ConvexSetVariantImagesResult = {
  success?: boolean;
  error?: string;
  [key: string]: unknown;
};

type ConvexMutationBody = {
  status?: string;
  errorMessage?: string;
  value?: ConvexSetVariantImagesResult | null;
};

function cleanSecret(value: string | undefined | null) {
  return value?.trim().replace(/^['"]|['"]$/g, "") || "";
}

function getBestBottlesConvexUrl() {
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

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

function safeFilenameBase(websiteSku: string, mode: "cap-on" | "cap-off") {
  return `${websiteSku}-${mode}`.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80);
}

async function callConvex(
  bbConvexUrl: string,
  endpoint: "query" | "mutation",
  path: string,
  args: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; body: any }> {
  const res = await fetch(`${bbConvexUrl}/api/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, args, format: "json" }),
  });

  let body: any = null;
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

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function looksLikeProductGroupSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(value.trim()) && /\b\d+ml\b/i.test(value);
}

async function resolveWebsiteSku(
  bbConvexUrl: string,
  rawSku: string,
): Promise<ResolvedWebsiteSku | null> {
  const inputSku = rawSku.trim();
  if (!inputSku) return null;

  const byWebsite = await callConvex(
    bbConvexUrl,
    "query",
    "products:getByWebsiteSku",
    { websiteSku: inputSku },
  );
  if (byWebsite.ok && byWebsite.body?.value) {
    const product = byWebsite.body.value as ConvexProductLookup["value"];
    const websiteSku = getString(product?.websiteSku) || inputSku;
    return { inputSku, websiteSku, product, resolvedVia: "websiteSku" };
  }

  const byGrace = await callConvex(
    bbConvexUrl,
    "query",
    "products:getBySku",
    { graceSku: inputSku },
  );
  if (byGrace.ok && byGrace.body?.value) {
    const product = byGrace.body.value as ConvexProductLookup["value"];
    const websiteSku = getString(product?.websiteSku);
    if (websiteSku) return { inputSku, websiteSku, product, resolvedVia: "graceSku" };
  }

  if (looksLikeProductGroupSlug(inputSku) || byWebsite.ok) return null;

  return { inputSku, websiteSku: inputSku, product: null, resolvedVia: "websiteSku" };
}

async function uploadImageToBestBottlesSanity(params: {
  imageUrl: string;
  websiteSku: string;
  mode: "cap-on" | "cap-off";
}): Promise<{ sanityImageUrl: string; sanityAssetId: string }> {
  const sanityClient = getBestBottlesSanityClient();
  const imageRes = await fetch(params.imageUrl);
  if (!imageRes.ok) {
    throw new Error(`Failed to fetch Madison image (${imageRes.status}): ${imageRes.statusText}`);
  }

  const imageBlob = await imageRes.blob();
  const contentType = imageRes.headers.get("content-type") || imageBlob.type || "image/png";
  const extension = contentType.includes("jpeg") || contentType.includes("jpg") ? "jpg" : "png";
  const asset = await sanityClient.assets.upload("image", imageBlob, {
    filename: `${safeFilenameBase(params.websiteSku, params.mode)}.${extension}`,
  });

  if (!asset?._id || !asset?.url) {
    throw new Error("Sanity upload completed without an asset id or CDN URL.");
  }

  return { sanityImageUrl: asset.url, sanityAssetId: asset._id };
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

  const bbConvexUrl = getBestBottlesConvexUrl();
  if (!bbConvexUrl) {
    return jsonResponse(500, {
      error:
        "Missing or invalid Best Bottles Convex configuration. Set BESTBOTTLES_CONVEX_URL to a full Convex cloud URL like https://helpful-elephant-638.convex.cloud.",
    });
  }

  // ── 1. Resolve the caller input into the real Convex websiteSku.
  // Madison Library tags historically held a mix of values:
  //   - true websiteSku, e.g. GBEmp50RdcrBlkLthr
  //   - Grace SKU, e.g. GB-EMP-CLR-50ML-RDCR-BLK
  // The Convex mutation only accepts websiteSku, so normalize before upload.
  // Product-group slugs are reserved for group-level hero/thumbnail updates;
  // PDP product images must target one exact variant SKU.
  let resolved: ResolvedWebsiteSku | null = null;
  try {
    resolved = await resolveWebsiteSku(bbConvexUrl, requestedWebsiteSku);
  } catch (e) {
    console.warn("[push-bestbottles-pdp-image] SKU resolution failed", e);
    resolved = null;
  }

  if (!resolved) {
    return jsonResponse(404, {
      error:
        `Website SKU or Grace SKU "${requestedWebsiteSku}" was not found in Best Bottles Convex.`,
      websiteSku: requestedWebsiteSku,
    });
  }

  // ── 2. Validate cap-off is allowed for this applicator
  if (mode === "cap-off" && typeof resolved.product?.applicator === "string") {
    const applicator = resolved.product.applicator;
    if (!NEEDS_CAP_OFF.has(applicator)) {
      return jsonResponse(400, {
        error: `cap-off mode is not used for applicator "${applicator}". ` +
               `Only sprayers, atomizers, roll-ons, and lotion pumps need cap-off images.`,
        applicator,
        websiteSku: resolved.websiteSku,
        requestedWebsiteSku,
      });
    }
  }

  // ── 3. Upload Madison image into the Best Bottles Sanity project
  let sanityUpload: { sanityImageUrl: string; sanityAssetId: string };
  try {
    sanityUpload = await uploadImageToBestBottlesSanity({
      imageUrl,
      websiteSku: resolved.websiteSku,
      mode,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return jsonResponse(500, {
      error: `Best Bottles Sanity upload failed: ${message}`,
      websiteSku: resolved.websiteSku,
      requestedWebsiteSku,
      mode,
    });
  }

  // ── 4. Determine which Convex field to patch
  const field = mode === "cap-on" ? "imageUrl" : "imageUrlCapOff";

  // ── 5. Call the Convex mutation with the Sanity CDN URL
  let mutationResult: ConvexSetVariantImagesResult | null | undefined;
  try {
    const mutation = await callConvex(
      bbConvexUrl,
      "mutation",
      "products:setVariantImages",
      { websiteSku: resolved.websiteSku, [field]: sanityUpload.sanityImageUrl },
    );

    const mutBody = mutation.body as ConvexMutationBody;
    if (!mutation.ok) {
      return jsonResponse(mutation.status === 404 ? 404 : 500, {
        error: mutBody?.errorMessage || "Convex mutation failed",
        websiteSku: resolved.websiteSku,
        requestedWebsiteSku,
        mode,
        field,
        details: mutBody,
      });
    }
    mutationResult = mutBody.value ?? mutBody;
    if (mutationResult?.success === false) {
      return jsonResponse(mutationResult.error === "not_found" ? 404 : 400, {
        error:
          mutationResult.error === "not_found"
            ? `Website SKU "${resolved.websiteSku}" was not found in Best Bottles Convex.`
            : mutationResult.error || "Best Bottles Convex did not update the product image.",
        websiteSku: resolved.websiteSku,
        requestedWebsiteSku,
        mode,
        field,
        details: mutationResult,
      });
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return jsonResponse(500, {
      error: `Convex mutation request failed: ${message}`,
      websiteSku: resolved.websiteSku,
      requestedWebsiteSku,
      mode,
      field,
    });
  }

  return jsonResponse(200, {
    ok: true,
    websiteSku: resolved.websiteSku,
    requestedWebsiteSku,
    resolvedVia: resolved.resolvedVia,
    mode,
    field,
    sourceImageUrl: imageUrl,
    sanityImageUrl: sanityUpload.sanityImageUrl,
    sanityAssetId: sanityUpload.sanityAssetId,
    mutationResult,
  });
});
