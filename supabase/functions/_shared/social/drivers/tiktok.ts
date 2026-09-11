/**
 * TikTok driver — Content Posting API (direct post, PULL_FROM_URL).
 *
 * Two things about TikTok that bite every integration:
 *
 *  1. Until the app passes TikTok's content-posting audit, every post is forced
 *     to SELF_ONLY (visible only to the posting account). The driver reads the
 *     creator_info endpoint first and refuses a public post the account cannot
 *     actually make, rather than silently publishing something nobody can see.
 *  2. PULL_FROM_URL requires the media host to be a verified domain on the app.
 *     A 4xx mentioning url ownership means domain verification is missing.
 */

import type {
  ConnectionRef,
  DiscoveredAccount,
  DriverDeps,
  PublishRequest,
  PublishResult,
  SocialDriver,
} from "./types.ts";
import { failure, readBody, summarize } from "./types.ts";

const API = "https://open.tiktokapis.com/v2";
const STATUS_POLL_ATTEMPTS = 24;
const STATUS_POLL_INTERVAL_MS = 5000;

export const TIKTOK_PRIVACY_LEVELS = [
  "PUBLIC_TO_EVERYONE",
  "MUTUAL_FOLLOW_FRIENDS",
  "FOLLOWER_OF_CREATOR",
  "SELF_ONLY",
] as const;

export async function discoverTikTokAccounts(
  deps: DriverDeps,
  input: {
    accessToken: string;
    scopes: string[];
    tokenExpiresAt: string | null;
    refreshToken?: string | null;
    refreshTokenExpiresAt?: string | null;
    openId?: string | null;
  },
): Promise<{ accounts: DiscoveredAccount[] } | { error: string }> {
  const response = await deps.fetchImpl(
    `${API}/user/info/?fields=open_id,union_id,avatar_url,display_name,username`,
    { headers: { Authorization: `Bearer ${input.accessToken}` } },
  );
  const body = await readBody(response);

  const user = body.json?.data?.user;
  if (!response.ok || !user?.open_id) {
    return {
      error:
        body.json?.error?.message ?? body.text ?? "Could not read the TikTok account profile.",
    };
  }

  return {
    accounts: [
      {
        platform: "tiktok",
        accountType: "creator",
        externalAccountId: String(user.open_id),
        externalAccountName: user.display_name ?? null,
        externalAccountHandle: user.username ?? null,
        externalAccountAvatarUrl: user.avatar_url ?? null,
        accessToken: input.accessToken,
        refreshToken: input.refreshToken ?? null,
        tokenExpiresAt: input.tokenExpiresAt,
        refreshTokenExpiresAt: input.refreshTokenExpiresAt ?? null,
        scopes: input.scopes,
        metadata: { unionId: user.union_id ?? null },
      },
    ],
  };
}

interface CreatorInfo {
  privacyLevelOptions: string[];
  maxVideoPostDurationSec: number | null;
  nickname: string | null;
}

async function queryCreatorInfo(
  deps: DriverDeps,
  accessToken: string,
): Promise<CreatorInfo | PublishResult> {
  const response = await deps.fetchImpl(`${API}/post/publish/creator_info/query/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
  });
  const body = await readBody(response);

  if (!response.ok || !body.json?.data) {
    return failure(
      body.json?.error?.code ? `tiktok_${body.json.error.code}` : "tiktok_creator_info_failed",
      body.json?.error?.message ?? body.text ?? "TikTok would not return creator info.",
      response.status,
      summarize(body.json ?? body.text),
    );
  }

  const data = body.json.data;
  return {
    privacyLevelOptions: Array.isArray(data.privacy_level_options)
      ? data.privacy_level_options.map(String)
      : [],
    maxVideoPostDurationSec:
      typeof data.max_video_post_duration_sec === "number"
        ? data.max_video_post_duration_sec
        : null,
    nickname: data.creator_nickname ?? null,
  };
}

async function publishTikTok(
  request: PublishRequest,
  context: { accessToken: string; connection: ConnectionRef; deps: DriverDeps },
): Promise<PublishResult> {
  const { deps, accessToken } = context;

  const video = request.media.find((item) => item.type === "video");
  if (!video) {
    return failure("media_required", "A TikTok post needs one video.");
  }

  const requestedPrivacy =
    typeof request.options.privacyLevel === "string"
      ? request.options.privacyLevel
      : "SELF_ONLY";

  const creatorInfo = await queryCreatorInfo(deps, accessToken);
  if ("ok" in creatorInfo) return creatorInfo;

  if (
    creatorInfo.privacyLevelOptions.length > 0 &&
    !creatorInfo.privacyLevelOptions.includes(requestedPrivacy)
  ) {
    return failure(
      "tiktok_privacy_not_permitted",
      `This TikTok account cannot post as ${requestedPrivacy}. Allowed: ${creatorInfo.privacyLevelOptions.join(", ")}. ` +
        "Unaudited apps are restricted to SELF_ONLY until TikTok approves content posting.",
    );
  }

  if (
    creatorInfo.maxVideoPostDurationSec &&
    video.durationMs &&
    video.durationMs / 1000 > creatorInfo.maxVideoPostDurationSec
  ) {
    return failure(
      "tiktok_video_too_long",
      `This account can post videos up to ${creatorInfo.maxVideoPostDurationSec}s; the clip is ${(video.durationMs / 1000).toFixed(1)}s.`,
    );
  }

  const initResponse = await deps.fetchImpl(`${API}/post/publish/video/init/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({
      post_info: {
        title: request.caption.slice(0, 2200),
        privacy_level: requestedPrivacy,
        disable_duet: request.options.disableDuet === true,
        disable_comment: request.options.disableComment === true,
        disable_stitch: request.options.disableStitch === true,
        video_cover_timestamp_ms:
          typeof request.options.coverTimestampMs === "number"
            ? request.options.coverTimestampMs
            : 1000,
      },
      source_info: { source: "PULL_FROM_URL", video_url: video.url },
    }),
  });

  const initBody = await readBody(initResponse);
  const publishId = initBody.json?.data?.publish_id;

  if (!initResponse.ok || !publishId) {
    const message =
      initBody.json?.error?.message ?? initBody.text ?? "TikTok rejected the upload.";
    const hint = /url|domain|ownership/i.test(message)
      ? " Verify the media domain under your TikTok app's URL properties."
      : "";
    return failure(
      initBody.json?.error?.code ? `tiktok_${initBody.json.error.code}` : "tiktok_init_failed",
      `${message}${hint}`,
      initResponse.status,
      summarize(initBody.json ?? initBody.text),
    );
  }

  // TikTok downloads and transcodes asynchronously; poll until it commits.
  for (let attempt = 0; attempt < STATUS_POLL_ATTEMPTS; attempt += 1) {
    await deps.sleep(STATUS_POLL_INTERVAL_MS);

    const statusResponse = await deps.fetchImpl(`${API}/post/publish/status/fetch/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({ publish_id: publishId }),
    });
    const statusBody = await readBody(statusResponse);

    if (!statusResponse.ok) {
      return failure(
        "tiktok_status_failed",
        statusBody.json?.error?.message ?? statusBody.text ?? "TikTok status check failed.",
        statusResponse.status,
      );
    }

    const status = statusBody.json?.data?.status;
    if (status === "PUBLISH_COMPLETE") {
      const postId = statusBody.json?.data?.publicaly_available_post_id?.[0];
      return {
        ok: true,
        externalPostId: String(postId ?? publishId),
        permalink: postId
          ? `https://www.tiktok.com/@${context.connection.externalAccountHandle ?? ""}/video/${postId}`
          : null,
        responseSummary: summarize(statusBody.json?.data),
      };
    }

    if (status === "FAILED") {
      return failure(
        statusBody.json?.data?.fail_reason
          ? `tiktok_${statusBody.json.data.fail_reason}`
          : "tiktok_publish_failed",
        `TikTok could not publish the video: ${statusBody.json?.data?.fail_reason ?? "unknown reason"}.`,
        undefined,
        summarize(statusBody.json?.data),
      );
    }
  }

  return failure(
    "tiktok_publish_timeout",
    "TikTok was still processing the video after two minutes. Check the account before retrying — the post may still land.",
  );
}

export const tiktokDriver: SocialDriver = {
  platform: "tiktok",
  publish: publishTikTok,
};
