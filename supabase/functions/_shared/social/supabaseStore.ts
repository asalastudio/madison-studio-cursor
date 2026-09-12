/**
 * Supabase-backed PublishStore + row mappers.
 *
 * Deno-only (pulls in @supabase/supabase-js); all decision logic lives in
 * publishRunner.ts, which stays runtime-agnostic and testable.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

import type { SocialPlatformId } from "./platformRules.ts";
import type { SocialMediaItem } from "./validation.ts";
import type {
  AttemptRecord,
  PublishStore,
  StoredConnection,
  StoredPost,
} from "./publishRunner.ts";

export function mapPostRow(row: any): StoredPost {
  return {
    id: row.id,
    organizationId: row.organization_id,
    platform: row.platform as SocialPlatformId,
    connectionId: row.connection_id ?? null,
    caption: row.caption ?? "",
    linkUrl: row.link_url ?? null,
    firstComment: row.first_comment ?? null,
    media: normalizeMedia(row.media),
    options: (row.options ?? {}) as Record<string, unknown>,
    attemptCount: typeof row.attempt_count === "number" ? row.attempt_count : 0,
    maxAttempts: typeof row.max_attempts === "number" ? row.max_attempts : 5,
  };
}

export function normalizeMedia(value: unknown): SocialMediaItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object" && typeof (item as any).url === "string")
    .map((item: any) => ({
      url: item.url,
      type: item.type === "video" ? "video" : "image",
      alt: item.alt ?? null,
      width: typeof item.width === "number" ? item.width : null,
      height: typeof item.height === "number" ? item.height : null,
      durationMs: typeof item.duration_ms === "number"
        ? item.duration_ms
        : typeof item.durationMs === "number"
          ? item.durationMs
          : null,
      thumbnailUrl: item.thumbnail_url ?? item.thumbnailUrl ?? null,
    }));
}

function mapConnectionRow(row: any): StoredConnection {
  return {
    id: row.id,
    platform: row.platform as SocialPlatformId,
    accountType: row.account_type,
    externalAccountId: row.external_account_id,
    externalAccountName: row.external_account_name ?? null,
    externalAccountHandle: row.external_account_handle ?? null,
    externalParentId: row.external_parent_id ?? null,
    accessTokenCipher: row.access_token_cipher,
    status: row.status,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
  };
}

export function createSupabaseStore(admin: SupabaseClient): PublishStore {
  return {
    async loadConnection(connectionId: string): Promise<StoredConnection | null> {
      const { data, error } = await admin
        .from("social_connections")
        .select("*")
        .eq("id", connectionId)
        .maybeSingle();
      if (error || !data) return null;
      return mapConnectionRow(data);
    },

    async recordAttempt(record: AttemptRecord): Promise<void> {
      const { error } = await admin.from("social_publish_attempts").insert({
        post_id: record.postId,
        organization_id: record.organizationId,
        platform: record.platform,
        attempt_number: record.attemptNumber,
        finished_at: new Date().toISOString(),
        outcome: record.outcome,
        http_status: record.httpStatus ?? null,
        error_code: record.errorCode ?? null,
        error_message: record.errorMessage ?? null,
        response_summary: record.responseSummary ?? {},
      });
      // The ledger is diagnostic; never let it sink a successful publish.
      if (error) console.error("[social] attempt ledger write failed", error.message);
    },

    async markPublished(input): Promise<void> {
      const { error } = await admin
        .from("social_posts")
        .update({
          status: "published",
          external_post_id: input.externalPostId,
          permalink: input.permalink,
          published_at: input.publishedAt,
          error_code: null,
          error_message: null,
          lease_expires_at: null,
          locked_by: null,
          publish_after: null,
        })
        .eq("id", input.postId);
      if (error) throw new Error(`Failed to mark post published: ${error.message}`);
    },

    async markFailed(input): Promise<void> {
      const { error } = await admin
        .from("social_posts")
        .update({
          status: "failed",
          error_code: input.errorCode,
          error_message: input.errorMessage,
          lease_expires_at: null,
          locked_by: null,
        })
        .eq("id", input.postId);
      if (error) console.error("[social] failed to mark post failed", error.message);
    },

    async rescheduleForRetry(input): Promise<void> {
      const { error } = await admin
        .from("social_posts")
        .update({
          status: "scheduled",
          publish_after: input.publishAfter,
          error_code: input.errorCode,
          error_message: input.errorMessage,
          lease_expires_at: null,
          locked_by: null,
        })
        .eq("id", input.postId);
      if (error) console.error("[social] failed to reschedule post", error.message);
    },

    async flagConnectionNeedsReauth(input): Promise<void> {
      const { error } = await admin
        .from("social_connections")
        .update({ status: "needs_reauth", status_detail: input.detail.slice(0, 500) })
        .eq("id", input.connectionId);
      if (error) console.error("[social] failed to flag connection", error.message);
    },

    async touchConnectionPublished(input): Promise<void> {
      const { error } = await admin
        .from("social_connections")
        .update({ last_published_at: input.at })
        .eq("id", input.connectionId);
      if (error) console.error("[social] failed to touch connection", error.message);
    },
  };
}
