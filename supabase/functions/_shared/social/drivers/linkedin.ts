/**
 * LinkedIn driver — member profiles and company pages.
 *
 * Posting uses the UGC Posts API, which is what the pre-existing
 * `linkedin-publish` function already used; the image path (registerUpload ->
 * binary PUT -> attach asset URN) is preserved so behaviour does not change for
 * accounts already connected.
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

const API = "https://api.linkedin.com";
const RESTLI_HEADERS = { "X-Restli-Protocol-Version": "2.0.0" };

function authorUrn(connection: ConnectionRef): string {
  return connection.accountType === "page" || connection.accountType === "business"
    ? `urn:li:organization:${connection.externalAccountId}`
    : `urn:li:person:${connection.externalAccountId}`;
}

// ---------------------------------------------------------------------------
// Account discovery
// ---------------------------------------------------------------------------

export async function discoverLinkedInAccounts(
  deps: DriverDeps,
  input: {
    accessToken: string;
    scopes: string[];
    tokenExpiresAt: string | null;
    refreshToken?: string | null;
    refreshTokenExpiresAt?: string | null;
  },
): Promise<{ accounts: DiscoveredAccount[] } | { error: string }> {
  const accounts: DiscoveredAccount[] = [];

  const profileResponse = await deps.fetchImpl(`${API}/v2/userinfo`, {
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });
  const profile = await readBody(profileResponse);

  if (!profileResponse.ok || !profile.json?.sub) {
    return {
      error:
        profile.json?.message ?? profile.text ?? "Could not read the LinkedIn member profile.",
    };
  }

  accounts.push({
    platform: "linkedin",
    accountType: "personal",
    externalAccountId: String(profile.json.sub),
    externalAccountName: profile.json.name ?? null,
    externalAccountHandle: profile.json.email ?? null,
    externalAccountAvatarUrl: profile.json.picture ?? null,
    accessToken: input.accessToken,
    refreshToken: input.refreshToken ?? null,
    tokenExpiresAt: input.tokenExpiresAt,
    refreshTokenExpiresAt: input.refreshTokenExpiresAt ?? null,
    scopes: input.scopes,
    metadata: { email: profile.json.email ?? null },
  });

  // Company pages require the Community Management API products; a 403 here just
  // means the app is not approved for org posting yet, which is not fatal.
  const aclUrl =
    `${API}/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED` +
    `&projection=(elements*(organization~(id,localizedName,vanityName)))`;
  const orgResponse = await deps.fetchImpl(aclUrl, {
    headers: { Authorization: `Bearer ${input.accessToken}`, ...RESTLI_HEADERS },
  });

  if (orgResponse.ok) {
    const orgs = await readBody(orgResponse);
    const elements: any[] = Array.isArray(orgs.json?.elements) ? orgs.json.elements : [];
    for (const element of elements) {
      const org = element["organization~"];
      const orgUrn: string | undefined = element.organization;
      const orgId = org?.id ?? orgUrn?.split(":").pop();
      if (!orgId) continue;

      accounts.push({
        platform: "linkedin",
        accountType: "page",
        externalAccountId: String(orgId),
        externalAccountName: org?.localizedName ?? `Company ${orgId}`,
        externalAccountHandle: org?.vanityName ?? null,
        accessToken: input.accessToken,
        refreshToken: input.refreshToken ?? null,
        tokenExpiresAt: input.tokenExpiresAt,
        refreshTokenExpiresAt: input.refreshTokenExpiresAt ?? null,
        scopes: input.scopes,
        metadata: { vanityName: org?.vanityName ?? null },
      });
    }
  } else {
    deps.log("[linkedin] organizationAcls unavailable", { status: orgResponse.status });
  }

  return { accounts };
}

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------

async function uploadImage(
  deps: DriverDeps,
  input: { accessToken: string; owner: string; imageUrl: string },
): Promise<{ asset: string } | PublishResult> {
  const registerResponse = await deps.fetchImpl(`${API}/v2/assets?action=registerUpload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
      ...RESTLI_HEADERS,
    },
    body: JSON.stringify({
      registerUploadRequest: {
        recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
        owner: input.owner,
        serviceRelationships: [
          { relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" },
        ],
      },
    }),
  });

  const registered = await readBody(registerResponse);
  if (!registerResponse.ok) {
    return failure(
      "linkedin_register_upload_failed",
      registered.json?.message ?? registered.text ?? "LinkedIn refused the image upload.",
      registerResponse.status,
      summarize(registered.json ?? registered.text),
    );
  }

  const uploadUrl =
    registered.json?.value?.uploadMechanism?.[
      "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
    ]?.uploadUrl;
  const asset = registered.json?.value?.asset;
  if (!uploadUrl || !asset) {
    return failure(
      "linkedin_register_upload_incomplete",
      "LinkedIn did not return an upload URL for the image.",
      registerResponse.status,
    );
  }

  const imageResponse = await deps.fetchImpl(input.imageUrl);
  if (!imageResponse.ok) {
    return failure(
      "media_fetch_failed",
      `Could not download the image from ${input.imageUrl} (HTTP ${imageResponse.status}).`,
      imageResponse.status,
    );
  }
  const contentType = imageResponse.headers.get("content-type") ?? "image/jpeg";
  const bytes = await imageResponse.arrayBuffer();

  const uploadResponse = await deps.fetchImpl(uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${input.accessToken}`, "Content-Type": contentType },
    body: bytes,
  });

  if (!uploadResponse.ok) {
    const uploaded = await readBody(uploadResponse);
    return failure(
      "linkedin_image_upload_failed",
      uploaded.text || "LinkedIn rejected the image upload.",
      uploadResponse.status,
    );
  }

  return { asset: String(asset) };
}

async function publishLinkedIn(
  request: PublishRequest,
  context: { accessToken: string; connection: ConnectionRef; deps: DriverDeps },
): Promise<PublishResult> {
  const { deps, accessToken, connection } = context;
  const owner = authorUrn(connection);
  const visibility =
    typeof request.options.visibility === "string" ? request.options.visibility : "PUBLIC";

  const shareContent: Record<string, unknown> = {
    shareCommentary: { text: request.caption },
    shareMediaCategory: "NONE",
  };

  const image = request.media.find((item) => item.type === "image");
  if (image) {
    const uploaded = await uploadImage(deps, {
      accessToken,
      owner,
      imageUrl: image.url,
    });
    if ("ok" in uploaded) return uploaded;

    shareContent.shareMediaCategory = "IMAGE";
    shareContent.media = [
      {
        status: "READY",
        media: uploaded.asset,
        description: { text: image.alt ?? request.title ?? "" },
        title: { text: request.title ?? "" },
      },
    ];
  } else if (request.linkUrl) {
    shareContent.shareMediaCategory = "ARTICLE";
    shareContent.media = [
      {
        status: "READY",
        originalUrl: request.linkUrl,
        title: { text: request.title ?? "Read more" },
        description: { text: "" },
      },
    ];
  }

  const payload = {
    author: owner,
    lifecycleState: "PUBLISHED",
    specificContent: { "com.linkedin.ugc.ShareContent": shareContent },
    visibility: { "com.linkedin.ugc.MemberNetworkVisibility": visibility },
  };

  const response = await deps.fetchImpl(`${API}/v2/ugcPosts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...RESTLI_HEADERS,
    },
    body: JSON.stringify(payload),
  });

  const body = await readBody(response);
  if (!response.ok) {
    const message = body.json?.message ?? body.text ?? "LinkedIn rejected the post.";
    const code = body.text?.includes("DUPLICATE")
      ? "linkedin_duplicate"
      : (body.json?.serviceErrorCode ? `linkedin_${body.json.serviceErrorCode}` : "linkedin_error");
    return failure(code, message, response.status, summarize(body.json ?? body.text));
  }

  const urn = body.json?.id ?? response.headers.get("x-restli-id");
  if (!urn) {
    return failure("linkedin_missing_id", "LinkedIn accepted the post but returned no id.", 200);
  }

  return {
    ok: true,
    externalPostId: String(urn),
    permalink: `https://www.linkedin.com/feed/update/${urn}/`,
    responseSummary: summarize(body.json),
  };
}

export const linkedinDriver: SocialDriver = {
  platform: "linkedin",
  publish: publishLinkedIn,
};
