/**
 * mint-shopify-publish-authorization
 *
 * Issues the single-use authorizations that the Cylinder Shopify publish guard
 * demands. Without this, `shopify_publish_authorizations` stays empty and every
 * guarded push fails with "Cylinder Shopify write requires explicit trusted
 * server publish authorization" — which is exactly what was happening.
 *
 * The important property: minting runs the *same* guard that enforcement runs,
 * in dry-run mode. `assertCylinderShopifyPublishAuthorized` with `dryRun: true`
 * performs every identity and approval check and returns before the
 * authorization requirement itself. So the criteria for issuing an
 * authorization can never drift from the criteria for accepting one — a
 * rubber-stamp minter would defeat the whole guard.
 *
 * POST {
 *   organizationId: string,
 *   items: [{ pipelineSkuJobId, imageId, imageUrl?, sku, websiteSku, graceSku }]
 * }
 *   -> { authorizations: [{ pipelineSkuJobId, generatedImageId, authorizationId, expiresAt }],
 *        rejected: [{ pipelineSkuJobId, reason }] }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

import {
  assertCylinderShopifyPublishAuthorized,
  isCylinderShopifyGuardRequired,
  type CylinderShopifyPublishGuardInput,
} from "../_shared/shopifyPublishGuard.ts";

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

/**
 * Short window: the authorization exists only to bridge the gap between the
 * user pressing Push and the push function consuming it moments later.
 */
const AUTHORIZATION_TTL_MS = 10 * 60 * 1000;
const MAX_ITEMS = 50;

const JOB_SELECT = [
  "id", "organization_id", "family", "grace_sku", "website_sku", "shopify_sku",
  "product_group_slug", "status", "generated_image_id", "generated_image_url",
  "approved_image_id", "approved_image_url",
].join(",");

type RequestItem = {
  pipelineSkuJobId?: string;
  imageId?: string;
  imageUrl?: string;
  sku?: string;
  websiteSku?: string;
  graceSku?: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization header" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({})) as {
      organizationId?: string;
      items?: unknown;
    };

    const organizationId = body.organizationId?.trim();
    if (!organizationId) return json({ error: "organizationId is required" }, 400);

    const items = Array.isArray(body.items) ? body.items as RequestItem[] : [];
    if (items.length === 0) return json({ error: "items is required" }, 400);
    if (items.length > MAX_ITEMS) {
      return json({ error: `Batch limit is ${MAX_ITEMS} authorizations at a time` }, 400);
    }

    // Membership is verified against the caller's own JWT, not a claim in the body.
    const { data: membership } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership) {
      return json({ error: "Not a member of this organization" }, 403);
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const expiresAt = new Date(now.getTime() + AUTHORIZATION_TTL_MS).toISOString();

    const authorizations: Array<Record<string, unknown>> = [];
    const rejected: Array<{ pipelineSkuJobId: string | null; reason: string }> = [];
    const pendingRows: Array<Record<string, unknown>> = [];

    for (const item of items) {
      const pipelineSkuJobId = item.pipelineSkuJobId?.trim() ?? "";
      const imageId = item.imageId?.trim() ?? "";

      try {
        if (!pipelineSkuJobId) {
          throw new Error("pipelineSkuJobId is required to mint an authorization.");
        }
        if (!imageId) {
          throw new Error("imageId is required to mint an authorization.");
        }

        const { data: job, error: jobError } = await admin
          .from("best_bottles_pipeline_sku_jobs")
          .select(JOB_SELECT)
          .eq("organization_id", organizationId)
          .eq("id", pipelineSkuJobId)
          .maybeSingle();
        if (jobError) throw new Error(`Pipeline job lookup failed: ${jobError.message}`);
        if (!job) throw new Error("Pipeline job not found for this organization.");

        const { data: image, error: imageError } = await admin
          .from("generated_images")
          .select("id, organization_id, image_url, library_tags")
          .eq("id", imageId)
          .maybeSingle();
        if (imageError) throw new Error(`Generated image lookup failed: ${imageError.message}`);
        if (!image) throw new Error("Generated image not found.");

        const guardInput: CylinderShopifyPublishGuardInput = {
          organizationId,
          // Dry run: run every identity/approval check, stop before the
          // authorization requirement we are about to satisfy.
          dryRun: true,
          isServiceRoleRequest: false,
          authenticatedUserId: user.id,
          organizationMembershipVerified: true,
          now: nowIso,
          item: {
            pipelineSkuJobId,
            imageId,
            imageUrl: item.imageUrl,
            sku: item.sku,
            websiteSku: item.websiteSku,
            graceSku: item.graceSku,
          },
          trustedAuthorization: null,
          job: job as CylinderShopifyPublishGuardInput["job"],
          image: image as CylinderShopifyPublishGuardInput["image"],
        };

        // Non-Cylinder products are not guarded, so an authorization would be
        // meaningless. Say so rather than writing a row nothing will consume.
        if (!isCylinderShopifyGuardRequired(guardInput)) {
          rejected.push({
            pipelineSkuJobId,
            reason: "Product is not guarded; no publish authorization is required.",
          });
          continue;
        }

        assertCylinderShopifyPublishAuthorized(guardInput);

        pendingRows.push({
          organization_id: organizationId,
          pipeline_sku_job_id: pipelineSkuJobId,
          generated_image_id: imageId,
          website_sku: (job as { website_sku?: string }).website_sku,
          grace_sku: (job as { grace_sku?: string }).grace_sku,
          purpose: "shopify-product-image-publish",
          authorized_by_user_id: user.id,
          authorized_at: nowIso,
          expires_at: expiresAt,
        });
      } catch (itemError) {
        rejected.push({
          pipelineSkuJobId: pipelineSkuJobId || null,
          reason: itemError instanceof Error ? itemError.message : String(itemError),
        });
      }
    }

    if (pendingRows.length > 0) {
      const { data: inserted, error: insertError } = await admin
        .from("shopify_publish_authorizations")
        .insert(pendingRows)
        .select("id, pipeline_sku_job_id, generated_image_id, expires_at");

      if (insertError) {
        console.error("[mint-shopify-publish-authorization] insert failed", insertError);
        return json({ error: `Could not issue authorizations: ${insertError.message}` }, 500);
      }

      for (const row of inserted ?? []) {
        authorizations.push({
          authorizationId: row.id,
          pipelineSkuJobId: row.pipeline_sku_job_id,
          generatedImageId: row.generated_image_id,
          expiresAt: row.expires_at,
        });
      }
    }

    console.log(
      `[mint-shopify-publish-authorization] org=${organizationId} user=${user.id} issued=${authorizations.length} rejected=${rejected.length}`,
    );

    return json({
      issuedCount: authorizations.length,
      rejectedCount: rejected.length,
      expiresAt,
      authorizations,
      rejected,
    });
  } catch (error) {
    console.error("[mint-shopify-publish-authorization] error", error);
    return json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});
