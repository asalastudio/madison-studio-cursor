/**
 * Meta driver — Instagram Business accounts and Facebook Pages.
 *
 * Both surfaces come out of one Facebook Login grant: the user authorises the
 * app, we exchange for a long-lived user token, then read /me/accounts to get a
 * per-Page token plus whichever IG Business account is bound to that Page.
 *
 * Instagram publishing is a two-step container flow (create container from a
 * public media URL, then publish the container). Video and Reels containers are
 * processed asynchronously, so the container must be polled until FINISHED.
 */

import { META_GRAPH_VERSION } from "../oauthConfig.ts";
import type {
  ConnectionRef,
  DiscoveredAccount,
  DriverDeps,
  PublishRequest,
  PublishResult,
  SocialDriver,
} from "./types.ts";
import { failure, readBody, summarize } from "./types.ts";

const GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

/** Container processing budget: 30 polls x 5s = 2.5 minutes. */
const CONTAINER_POLL_ATTEMPTS = 30;
const CONTAINER_POLL_INTERVAL_MS = 5000;

interface GraphErrorShape {
  error?: { message?: string; type?: string; code?: number; error_subcode?: number };
}

function graphFailure(status: number, body: any, text: string, fallback: string) {
  const err = (body as GraphErrorShape | null)?.error;
  const code = err?.code !== undefined ? `meta_${err.code}` : "meta_error";
  const message = err?.message || text || fallback;
  return failure(code, message, status, summarize(body ?? text));
}

async function graphRequest(
  deps: DriverDeps,
  method: "GET" | "POST",
  path: string,
  params: Record<string, string | undefined>,
): Promise<{ ok: boolean; status: number; json: any; text: string }> {
  const url = new URL(`${GRAPH}${path}`);
  const body = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (method === "GET") url.searchParams.set(key, value);
    else body.set(key, value);
  }

  const response = await deps.fetchImpl(url.toString(), {
    method,
    headers: method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : undefined,
    body: method === "POST" ? body.toString() : undefined,
  });

  const { json, text } = await readBody(response);
  return { ok: response.ok, status: response.status, json, text };
}

// ---------------------------------------------------------------------------
// Account discovery (called from social-oauth-callback)
// ---------------------------------------------------------------------------

/**
 * Exchanges a short-lived user token for the ~60-day long-lived one. Page tokens
 * derived from a long-lived user token do not themselves expire, which is what
 * makes unattended scheduled publishing viable.
 */
export async function exchangeForLongLivedUserToken(
  deps: DriverDeps,
  input: { appId: string; appSecret: string; shortLivedToken: string },
): Promise<{ accessToken: string; expiresInSeconds: number | null } | { error: string }> {
  const result = await graphRequest(deps, "GET", "/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: input.appId,
    client_secret: input.appSecret,
    fb_exchange_token: input.shortLivedToken,
  });

  if (!result.ok || !result.json?.access_token) {
    return {
      error: result.json?.error?.message ?? result.text ?? "Long-lived token exchange failed.",
    };
  }

  return {
    accessToken: result.json.access_token as string,
    expiresInSeconds:
      typeof result.json.expires_in === "number" ? result.json.expires_in : null,
  };
}

/**
 * Lists every Page the user administers, plus the IG Business account bound to
 * each Page. Returns one DiscoveredAccount per publishable surface.
 */
export async function discoverMetaAccounts(
  deps: DriverDeps,
  input: { longLivedUserToken: string; scopes: string[]; userTokenExpiresAt: string | null },
): Promise<{ accounts: DiscoveredAccount[] } | { error: string }> {
  const result = await graphRequest(deps, "GET", "/me/accounts", {
    access_token: input.longLivedUserToken,
    fields:
      "id,name,username,access_token,picture{url},instagram_business_account{id,username,name,profile_picture_url}",
    limit: "100",
  });

  if (!result.ok) {
    return { error: result.json?.error?.message ?? result.text ?? "Could not list Facebook Pages." };
  }

  const pages: any[] = Array.isArray(result.json?.data) ? result.json.data : [];
  const accounts: DiscoveredAccount[] = [];

  for (const page of pages) {
    if (!page?.id || !page?.access_token) continue;

    accounts.push({
      platform: "facebook",
      accountType: "page",
      externalAccountId: String(page.id),
      externalAccountName: page.name ?? null,
      externalAccountHandle: page.username ?? null,
      externalAccountAvatarUrl: page.picture?.data?.url ?? null,
      accessToken: page.access_token,
      // Page tokens derived from a long-lived user token do not expire; we still
      // record the user token's horizon so the UI can nudge a periodic re-auth.
      tokenExpiresAt: input.userTokenExpiresAt,
      scopes: input.scopes,
      metadata: { source: "me/accounts", graphVersion: META_GRAPH_VERSION },
    });

    const ig = page.instagram_business_account;
    if (ig?.id) {
      accounts.push({
        platform: "instagram",
        accountType: "business",
        externalAccountId: String(ig.id),
        externalAccountName: ig.name ?? ig.username ?? null,
        externalAccountHandle: ig.username ?? null,
        externalAccountAvatarUrl: ig.profile_picture_url ?? null,
        externalParentId: String(page.id),
        externalParentName: page.name ?? null,
        // IG publishing authenticates with the *Page* token.
        accessToken: page.access_token,
        tokenExpiresAt: input.userTokenExpiresAt,
        scopes: input.scopes,
        metadata: { backingPageId: String(page.id), graphVersion: META_GRAPH_VERSION },
      });
    }
  }

  return { accounts };
}

// ---------------------------------------------------------------------------
// Instagram publishing
// ---------------------------------------------------------------------------

async function createIgContainer(
  deps: DriverDeps,
  input: {
    igUserId: string;
    accessToken: string;
    params: Record<string, string | undefined>;
  },
): Promise<{ id: string } | PublishResult> {
  const result = await graphRequest(deps, "POST", `/${input.igUserId}/media`, {
    access_token: input.accessToken,
    ...input.params,
  });

  if (!result.ok || !result.json?.id) {
    return graphFailure(result.status, result.json, result.text, "Could not create IG container.");
  }
  return { id: String(result.json.id) };
}

/** Polls a container until Meta finishes transcoding, or gives up. */
async function waitForContainer(
  deps: DriverDeps,
  input: { containerId: string; accessToken: string },
): Promise<{ ready: true } | PublishResult> {
  for (let attempt = 0; attempt < CONTAINER_POLL_ATTEMPTS; attempt += 1) {
    const result = await graphRequest(deps, "GET", `/${input.containerId}`, {
      access_token: input.accessToken,
      fields: "status_code,status",
    });

    if (!result.ok) {
      return graphFailure(result.status, result.json, result.text, "Container status check failed.");
    }

    const status = result.json?.status_code;
    if (status === "FINISHED") return { ready: true };
    if (status === "ERROR" || status === "EXPIRED") {
      return failure(
        "meta_container_failed",
        `Instagram could not process the media (${status}): ${result.json?.status ?? "no detail"}`,
        undefined,
        summarize(result.json),
      );
    }

    await deps.sleep(CONTAINER_POLL_INTERVAL_MS);
  }

  return failure(
    "meta_container_timeout",
    "Instagram was still processing the media after 2.5 minutes; the post was not published.",
  );
}

async function publishInstagram(
  request: PublishRequest,
  context: { accessToken: string; connection: ConnectionRef; deps: DriverDeps },
): Promise<PublishResult> {
  const { deps, accessToken } = context;
  const igUserId = context.connection.externalAccountId;
  const media = request.media;

  if (media.length === 0) {
    return failure("media_required", "Instagram posts require at least one image or video.");
  }

  let containerId: string;

  if (media.length === 1) {
    const item = media[0];
    const isVideo = item.type === "video";
    const postAsReel = request.options.postAsReel !== false; // single videos default to Reels
    const created = await createIgContainer(deps, {
      igUserId,
      accessToken,
      params: isVideo
        ? {
            media_type: postAsReel ? "REELS" : "VIDEO",
            video_url: item.url,
            caption: request.caption,
            share_to_feed: request.options.shareToFeed === false ? "false" : "true",
          }
        : {
            image_url: item.url,
            caption: request.caption,
            alt_text: item.alt ?? undefined,
          },
    });
    if ("ok" in created) return created;
    containerId = created.id;

    if (isVideo) {
      const ready = await waitForContainer(deps, { containerId, accessToken });
      if ("ok" in ready) return ready;
    }
  } else {
    // Carousel: every child is created as a carousel item first.
    const childIds: string[] = [];
    for (const item of media) {
      const child = await createIgContainer(deps, {
        igUserId,
        accessToken,
        params:
          item.type === "video"
            ? { media_type: "VIDEO", video_url: item.url, is_carousel_item: "true" }
            : { image_url: item.url, is_carousel_item: "true", alt_text: item.alt ?? undefined },
      });
      if ("ok" in child) return child;
      childIds.push(child.id);

      if (item.type === "video") {
        const ready = await waitForContainer(deps, { containerId: child.id, accessToken });
        if ("ok" in ready) return ready;
      }
    }

    const carousel = await createIgContainer(deps, {
      igUserId,
      accessToken,
      params: {
        media_type: "CAROUSEL",
        children: childIds.join(","),
        caption: request.caption,
      },
    });
    if ("ok" in carousel) return carousel;
    containerId = carousel.id;

    const ready = await waitForContainer(deps, { containerId, accessToken });
    if ("ok" in ready) return ready;
  }

  const published = await graphRequest(deps, "POST", `/${igUserId}/media_publish`, {
    access_token: accessToken,
    creation_id: containerId,
  });

  if (!published.ok || !published.json?.id) {
    return graphFailure(
      published.status,
      published.json,
      published.text,
      "Instagram rejected the publish step.",
    );
  }

  const mediaId = String(published.json.id);

  // Permalink is a nice-to-have; never fail a published post over it.
  let permalink: string | null = null;
  const permalinkResult = await graphRequest(deps, "GET", `/${mediaId}`, {
    access_token: accessToken,
    fields: "permalink",
  });
  if (permalinkResult.ok && permalinkResult.json?.permalink) {
    permalink = String(permalinkResult.json.permalink);
  }

  if (request.firstComment && request.firstComment.trim().length > 0) {
    const comment = await graphRequest(deps, "POST", `/${mediaId}/comments`, {
      access_token: accessToken,
      message: request.firstComment,
    });
    if (!comment.ok) {
      deps.log("[meta] first comment failed", { mediaId, status: comment.status });
    }
  }

  return {
    ok: true,
    externalPostId: mediaId,
    permalink,
    responseSummary: summarize({ containerId, mediaId }),
  };
}

// ---------------------------------------------------------------------------
// Facebook Page publishing
// ---------------------------------------------------------------------------

async function publishFacebook(
  request: PublishRequest,
  context: { accessToken: string; connection: ConnectionRef; deps: DriverDeps },
): Promise<PublishResult> {
  const { deps, accessToken } = context;
  const pageId = context.connection.externalAccountId;
  const media = request.media;

  // Video: one call, its own endpoint.
  const video = media.find((item) => item.type === "video");
  if (video) {
    const result = await graphRequest(deps, "POST", `/${pageId}/videos`, {
      access_token: accessToken,
      file_url: video.url,
      description: request.caption,
      title: request.title ?? undefined,
    });
    if (!result.ok || !result.json?.id) {
      return graphFailure(result.status, result.json, result.text, "Facebook rejected the video.");
    }
    const id = String(result.json.id);
    return {
      ok: true,
      externalPostId: id,
      permalink: `https://www.facebook.com/${id}`,
      responseSummary: summarize(result.json),
    };
  }

  const images = media.filter((item) => item.type === "image");

  // Single image: /photos publishes directly and returns post_id.
  if (images.length === 1) {
    const result = await graphRequest(deps, "POST", `/${pageId}/photos`, {
      access_token: accessToken,
      url: images[0].url,
      caption: request.caption,
    });
    if (!result.ok || !result.json?.id) {
      return graphFailure(result.status, result.json, result.text, "Facebook rejected the photo.");
    }
    const postId = String(result.json.post_id ?? result.json.id);
    return {
      ok: true,
      externalPostId: postId,
      permalink: `https://www.facebook.com/${postId}`,
      responseSummary: summarize(result.json),
    };
  }

  // Multi-image: upload each unpublished, then attach to one feed post.
  const attachedMediaIds: string[] = [];
  for (const image of images) {
    const upload = await graphRequest(deps, "POST", `/${pageId}/photos`, {
      access_token: accessToken,
      url: image.url,
      published: "false",
    });
    if (!upload.ok || !upload.json?.id) {
      return graphFailure(
        upload.status,
        upload.json,
        upload.text,
        "Facebook rejected one of the photos.",
      );
    }
    attachedMediaIds.push(String(upload.json.id));
  }

  const feedParams: Record<string, string | undefined> = {
    access_token: accessToken,
    message: request.caption,
    link: attachedMediaIds.length === 0 ? (request.linkUrl ?? undefined) : undefined,
  };
  attachedMediaIds.forEach((mediaId, index) => {
    feedParams[`attached_media[${index}]`] = JSON.stringify({ media_fbid: mediaId });
  });

  const result = await graphRequest(deps, "POST", `/${pageId}/feed`, feedParams);
  if (!result.ok || !result.json?.id) {
    return graphFailure(result.status, result.json, result.text, "Facebook rejected the post.");
  }

  const postId = String(result.json.id);
  return {
    ok: true,
    externalPostId: postId,
    permalink: `https://www.facebook.com/${postId}`,
    responseSummary: summarize(result.json),
  };
}

export const instagramDriver: SocialDriver = {
  platform: "instagram",
  publish: publishInstagram,
};

export const facebookDriver: SocialDriver = {
  platform: "facebook",
  publish: publishFacebook,
};
