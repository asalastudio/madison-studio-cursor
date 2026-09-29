/**
 * Thin proxy from madison-app → Best Bottles Convex HTTP API.
 *
 * Madison consumes the Best Bottles Convex project but doesn't define its
 * schema. To avoid adding the `convex` client as a browser dependency and
 * to keep the deployment URL server-side, every Convex read from madison-app
 * flows through this function.
 *
 * Body shape:
 *   { "path": "products:getProductGroup", "args": { "slug": "cylinder-9ml-clear" } }
 *
 * Env required:
 *   BESTBOTTLES_CONVEX_URL — e.g. "https://precise-raccoon-123.convex.cloud"
 *
 * Requires a signed-in Supabase user who belongs to the Best Bottles org
 * (or a service-role / super-admin caller).
 */

import { guardOrganization } from "../_shared/edgeAuth.ts";
import { BEST_BOTTLES_ORG_ID } from "../_shared/orgFeatures.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

function getConvexUrl() {
  const rawUrl = cleanSecret(Deno.env.get("BESTBOTTLES_CONVEX_URL"));
  if (!rawUrl) {
    return {
      error: "BESTBOTTLES_CONVEX_URL is not configured in the edge function environment.",
    };
  }

  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("Invalid protocol");
    }
    return { url: rawUrl.replace(/\/+$/, "") };
  } catch {
    return {
      error:
        "BESTBOTTLES_CONVEX_URL must be a full Convex cloud URL, for example https://helpful-elephant-638.convex.cloud.",
    };
  }
}

const PRODUCT_FIELDS = [
  "_id",
  "_creationTime",
  "websiteSku",
  "graceSku",
  "productId",
  "category",
  "family",
  "color",
  "capacity",
  "capacityMl",
  "capacityOz",
  "heightWithCap",
  "heightWithoutCap",
  "diameter",
  "neckThreadSize",
  "applicator",
  "capStyle",
  "capColor",
  "trimColor",
  "bottleCollection",
  "itemName",
  "itemDescription",
  "useCaseDescription",
  "imageUrl",
  "imageUrlCapOff",
  "stockStatus",
  "verified",
  "productGroupId",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function trimProduct(value: unknown) {
  if (!isRecord(value)) return value;
  const out: Record<string, unknown> = {};
  for (const field of PRODUCT_FIELDS) {
    if (field in value) out[field] = value[field];
  }
  return out;
}

function trimProductArray(value: unknown) {
  return Array.isArray(value) ? value.map(trimProduct) : value;
}

function trimConvexValue(path: string, value: unknown): unknown {
  if (
    path === "products:getByFamily" ||
    path === "products:searchProducts" ||
    path === "products:getCatalogProducts" ||
    path === "products:listAll"
  ) {
    return trimProductArray(value);
  }

  if (path === "products:getBySku" || path === "products:getByWebsiteSku") {
    return trimProduct(value);
  }

  if (path === "products:getProductGroup" && isRecord(value)) {
    return {
      ...value,
      variants: trimProductArray(value.variants),
    };
  }

  return value;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const convexConfig = getConvexUrl();
  if ("error" in convexConfig) {
    return json({ error: convexConfig.error }, 500);
  }

  const guard = await guardOrganization(req, BEST_BOTTLES_ORG_ID, corsHeaders);
  if ("response" in guard) return guard.response;

  let parsed: { path?: unknown; args?: unknown };
  try {
    parsed = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const path = typeof parsed.path === "string" ? parsed.path.trim() : "";
  if (!path || !path.includes(":")) {
    return json({ error: "Body.path must be a string like 'module:function'" }, 400);
  }
  const args =
    parsed.args && typeof parsed.args === "object" && !Array.isArray(parsed.args)
      ? (parsed.args as Record<string, unknown>)
      : {};

  const target = `${convexConfig.url}/api/query`;
  let convexResponse: Response;
  try {
    convexResponse = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, args, format: "json" }),
    });
  } catch (e) {
    return json(
      {
        error: `Best Bottles Convex request failed: ${e instanceof Error ? e.message : String(e)}`,
      },
      502,
    );
  }

  let convexBody: unknown;
  try {
    convexBody = await convexResponse.json();
  } catch {
    return json({ error: "Best Bottles Convex returned a non-JSON response." }, 502);
  }

  if (!convexResponse.ok) {
    return json(
      {
        error: `Convex ${convexResponse.status}`,
        upstream: convexBody,
      },
      502,
    );
  }

  const body = convexBody as { status?: string; value?: unknown; errorMessage?: string };
  if (body?.status === "error") {
    return json({ error: body.errorMessage || "Convex returned error" }, 400);
  }

  return json({ value: trimConvexValue(path, body?.value ?? null) }, 200);
});
