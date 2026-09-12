/**
 * social-publish — create, schedule, retry or cancel social posts.
 *
 * Actions
 *   create  { organizationId, targets[], mode: "now"|"schedule"|"draft", scheduledFor?, ... }
 *   retry   { organizationId, postId }
 *   cancel  { organizationId, postId }
 *
 * "create" always writes the rows first, then publishes. If the platform call
 * fails after the row exists we still have a durable record with an error on it,
 * rather than a post that vanished into a failed HTTP request.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

import { isSocialPlatformId, type SocialPlatformId } from "../_shared/social/platformRules.ts";
import { validateSocialPost, type SocialMediaItem } from "../_shared/social/validation.ts";
import { executePublish } from "../_shared/social/publishRunner.ts";
import { createSupabaseStore, mapPostRow, normalizeMedia } from "../_shared/social/supabaseStore.ts";
import { getDriver } from "../_shared/social/drivers/index.ts";
import { defaultDeps } from "../_shared/social/drivers/types.ts";
import { decryptToken, importEncryptionKey } from "../_shared/social/tokenCrypto.ts";

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

interface TargetInput {
  platform: SocialPlatformId;
  connectionId: string;
  caption?: string;
  title?: string | null;
  linkUrl?: string | null;
  firstComment?: string | null;
  media?: SocialMediaItem[];
  options?: Record<string, unknown>;
}

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

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    const payload = await req.json();
    const action: string = payload?.action ?? "create";
    const organizationId: string | undefined = payload?.organizationId;
    if (!organizationId) return json({ error: "organizationId is required" }, 400);

    const { data: membership } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership) return json({ error: "Not a member of this organization" }, 403);

    const encryptionSecret = Deno.env.get("SOCIAL_TOKEN_ENCRYPTION_KEY");
    if (!encryptionSecret) {
      return json(
        {
          error: "SOCIAL_TOKEN_ENCRYPTION_KEY is not set",
          message: "Generate one with `openssl rand -base64 32` and add it as a Supabase secret.",
        },
        500,
      );
    }
    const key = await importEncryptionKey(encryptionSecret);
    const decrypt = (cipher: string) => decryptToken(cipher, key);
    const store = createSupabaseStore(admin);

    // -----------------------------------------------------------------------
    if (action === "cancel") {
      const postId: string | undefined = payload?.postId;
      if (!postId) return json({ error: "postId is required" }, 400);

      const { error } = await admin
        .from("social_posts")
        .update({ status: "cancelled", lease_expires_at: null, locked_by: null })
        .eq("id", postId)
        .eq("organization_id", organizationId)
        .in("status", ["draft", "scheduled", "failed"]);

      if (error) return json({ error: error.message }, 500);
      return json({ success: true, postId, status: "cancelled" });
    }

    // -----------------------------------------------------------------------
    if (action === "retry") {
      const postId: string | undefined = payload?.postId;
      if (!postId) return json({ error: "postId is required" }, 400);

      const { data: row, error } = await admin
        .from("social_posts")
        .select("*")
        .eq("id", postId)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (error || !row) return json({ error: "Post not found" }, 404);
      if (row.status === "published") return json({ error: "Post is already published" }, 400);

      await admin
        .from("social_posts")
        .update({
          status: "publishing",
          attempt_count: (row.attempt_count ?? 0) + 1,
          publish_after: null,
          lease_expires_at: new Date(Date.now() + 300_000).toISOString(),
          locked_by: `user:${user.id}`,
        })
        .eq("id", postId);

      const outcome = await executePublish({
        post: { ...mapPostRow(row), attemptCount: (row.attempt_count ?? 0) + 1 },
        store,
        deps: defaultDeps,
        getDriver,
        decryptToken: decrypt,
        jitter: Math.random(),
      });

      return json({ success: outcome.status === "published", postId, outcome });
    }

    // -----------------------------------------------------------------------
    // action === "create"
    const targets: TargetInput[] = Array.isArray(payload?.targets) ? payload.targets : [];
    if (targets.length === 0) return json({ error: "At least one target is required" }, 400);

    const mode: "now" | "schedule" | "draft" = payload?.mode ?? "now";
    const scheduledFor: string | null = payload?.scheduledFor ?? null;
    if (mode === "schedule" && !scheduledFor) {
      return json({ error: "scheduledFor is required when mode is 'schedule'" }, 400);
    }

    // Validate everything before writing anything: a partially created fan-out
    // is worse than a rejected one.
    const validations = [];
    for (const target of targets) {
      if (!isSocialPlatformId(target.platform)) {
        return json({ error: `Unknown platform: ${target.platform}` }, 400);
      }
      if (!target.connectionId) {
        return json({ error: `Missing connectionId for ${target.platform}` }, 400);
      }
      const result = validateSocialPost({
        platform: target.platform,
        caption: target.caption ?? "",
        title: target.title ?? null,
        linkUrl: target.linkUrl ?? null,
        firstComment: target.firstComment ?? null,
        media: normalizeMedia(target.media ?? []),
        options: target.options ?? {},
      });
      validations.push(result);
    }

    const invalid = validations.filter((result) => !result.valid);
    if (invalid.length > 0) {
      return json({ error: "Validation failed", validations: invalid }, 422);
    }

    // Confirm every connection belongs to this org and is usable.
    const connectionIds = [...new Set(targets.map((target) => target.connectionId))];
    const { data: connections } = await admin
      .from("social_connections")
      .select("id, platform, status, organization_id")
      .in("id", connectionIds)
      .eq("organization_id", organizationId);

    const connectionById = new Map((connections ?? []).map((row) => [row.id, row]));
    for (const target of targets) {
      const connection = connectionById.get(target.connectionId);
      if (!connection) {
        return json({ error: `Connection ${target.connectionId} not found for this organization` }, 400);
      }
      if (connection.platform !== target.platform) {
        return json(
          { error: `Connection ${target.connectionId} is a ${connection.platform} account, not ${target.platform}` },
          400,
        );
      }
      if (connection.status !== "active") {
        return json(
          { error: `The ${connection.platform} connection needs to be reconnected (status: ${connection.status}).` },
          400,
        );
      }
    }

    const groupId: string = payload?.groupId ?? crypto.randomUUID();
    const status = mode === "schedule" ? "scheduled" : mode === "draft" ? "draft" : "publishing";
    const baseIdempotencyKey: string | null = payload?.idempotencyKey ?? null;

    const rows = targets.map((target, index) => ({
      organization_id: organizationId,
      created_by: user.id,
      group_id: groupId,
      connection_id: target.connectionId,
      platform: target.platform,
      caption: target.caption ?? "",
      link_url: target.linkUrl ?? null,
      first_comment: target.firstComment ?? null,
      media: target.media ?? [],
      options: { ...(target.options ?? {}), ...(target.title ? { title: target.title } : {}) },
      scheduled_content_id: payload?.scheduledContentId ?? null,
      master_content_id: payload?.masterContentId ?? null,
      derivative_asset_id: payload?.derivativeAssetId ?? null,
      status,
      scheduled_for: mode === "schedule" ? scheduledFor : mode === "now" ? new Date().toISOString() : null,
      timezone: payload?.timezone ?? "UTC",
      attempt_count: mode === "now" ? 1 : 0,
      lease_expires_at:
        mode === "now" ? new Date(Date.now() + 300_000).toISOString() : null,
      locked_by: mode === "now" ? `user:${user.id}` : null,
      idempotency_key: baseIdempotencyKey ? `${baseIdempotencyKey}:${target.platform}:${index}` : null,
    }));

    const { data: inserted, error: insertError } = await admin
      .from("social_posts")
      .insert(rows)
      .select("*");

    if (insertError) {
      // A unique violation here means the composer double-submitted.
      if (insertError.code === "23505") {
        return json({ error: "This post was already submitted.", code: "duplicate_submission" }, 409);
      }
      console.error("[social-publish] insert failed", insertError);
      return json({ error: insertError.message }, 500);
    }

    if (mode !== "now") {
      return json({
        success: true,
        groupId,
        mode,
        posts: (inserted ?? []).map((row) => ({
          id: row.id,
          platform: row.platform,
          status: row.status,
          scheduledFor: row.scheduled_for,
        })),
        warnings: validations.flatMap((result) => result.warnings),
      });
    }

    // Publish now: run each target, collecting outcomes.
    const results = [];
    for (const row of inserted ?? []) {
      const outcome = await executePublish({
        post: mapPostRow(row),
        store,
        deps: defaultDeps,
        getDriver,
        decryptToken: decrypt,
        jitter: Math.random(),
      });
      results.push({ postId: row.id, platform: row.platform, outcome });
    }

    const published = results.filter((entry) => entry.outcome.status === "published");

    return json({
      success: published.length > 0,
      groupId,
      publishedCount: published.length,
      totalCount: results.length,
      results,
      warnings: validations.flatMap((result) => result.warnings),
    });
  } catch (error) {
    console.error("[social-publish] error", error);
    return json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});
