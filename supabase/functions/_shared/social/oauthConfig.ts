/**
 * Per-platform OAuth wiring, as data.
 *
 * Kept pure so the authorize-URL construction (the part that is easy to get
 * subtly wrong and impossible to notice until a user is staring at a platform
 * error page) is unit tested rather than discovered in production.
 */

import type { SocialPlatformId } from "./platformRules.ts";

export const META_GRAPH_VERSION = "v21.0";

export type TokenAuthStyle = "body" | "basic";

export interface PlatformOAuthConfig {
  platform: SocialPlatformId;
  /** Env var names the operator must set (surfaced in the "not configured" error). */
  clientIdEnv: string;
  clientSecretEnv: string;
  authorizeUrl: string;
  tokenUrl: string;
  /** Scopes requested for a business/page connection. */
  scopes: string[];
  /** Scopes requested when connecting a personal profile, where that differs. */
  personalScopes?: string[];
  scopeSeparator: string;
  usesPkce: boolean;
  /** Where client credentials go on the token request. */
  tokenAuthStyle: TokenAuthStyle;
  /** Extra query params the authorize URL requires. */
  extraAuthorizeParams?: Record<string, string>;
  /** Human-readable pointer for the setup docs. */
  developerConsoleUrl: string;
}

export const SOCIAL_OAUTH_CONFIGS: Partial<
  Record<SocialPlatformId, PlatformOAuthConfig>
> = {
  // One Facebook Login flow yields both the Page token (facebook) and the
  // IG Business account bound to that Page (instagram).
  facebook: {
    platform: "facebook",
    clientIdEnv: "META_APP_ID",
    clientSecretEnv: "META_APP_SECRET",
    authorizeUrl: `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`,
    tokenUrl: `https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`,
    scopes: [
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_posts",
      "business_management",
      "instagram_basic",
      "instagram_content_publish",
      "instagram_manage_comments",
    ],
    scopeSeparator: ",",
    usesPkce: false,
    tokenAuthStyle: "body",
    developerConsoleUrl: "https://developers.facebook.com/apps",
  },
  instagram: {
    platform: "instagram",
    clientIdEnv: "META_APP_ID",
    clientSecretEnv: "META_APP_SECRET",
    authorizeUrl: `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`,
    tokenUrl: `https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`,
    scopes: [
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_posts",
      "business_management",
      "instagram_basic",
      "instagram_content_publish",
      "instagram_manage_comments",
    ],
    scopeSeparator: ",",
    usesPkce: false,
    tokenAuthStyle: "body",
    developerConsoleUrl: "https://developers.facebook.com/apps",
  },
  linkedin: {
    platform: "linkedin",
    clientIdEnv: "LINKEDIN_CLIENT_ID",
    clientSecretEnv: "LINKEDIN_CLIENT_SECRET",
    authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    scopes: [
      "openid",
      "profile",
      "email",
      "w_member_social",
      "w_organization_social",
      "r_organization_social",
      "rw_organization_admin",
    ],
    personalScopes: ["openid", "profile", "email", "w_member_social"],
    scopeSeparator: " ",
    usesPkce: false,
    tokenAuthStyle: "body",
    developerConsoleUrl: "https://www.linkedin.com/developers/apps",
  },
  pinterest: {
    platform: "pinterest",
    clientIdEnv: "PINTEREST_APP_ID",
    clientSecretEnv: "PINTEREST_APP_SECRET",
    authorizeUrl: "https://www.pinterest.com/oauth/",
    tokenUrl: "https://api.pinterest.com/v5/oauth/token",
    scopes: [
      "user_accounts:read",
      "boards:read",
      "boards:write",
      "pins:read",
      "pins:write",
    ],
    scopeSeparator: ",",
    usesPkce: false,
    tokenAuthStyle: "basic",
    developerConsoleUrl: "https://developers.pinterest.com/apps",
  },
  tiktok: {
    platform: "tiktok",
    clientIdEnv: "TIKTOK_CLIENT_KEY",
    clientSecretEnv: "TIKTOK_CLIENT_SECRET",
    authorizeUrl: "https://www.tiktok.com/v2/auth/authorize/",
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    scopes: ["user.info.basic", "user.info.profile", "video.publish", "video.upload"],
    scopeSeparator: ",",
    usesPkce: true,
    tokenAuthStyle: "body",
    developerConsoleUrl: "https://developers.tiktok.com/apps",
  },
};

export function getOAuthConfig(platform: SocialPlatformId): PlatformOAuthConfig {
  const config = SOCIAL_OAUTH_CONFIGS[platform];
  if (!config) {
    throw new Error(`No OAuth configuration for platform: ${platform}`);
  }
  return config;
}

export interface AuthorizeUrlInput {
  config: PlatformOAuthConfig;
  clientId: string;
  redirectUri: string;
  state: string;
  /** Present only when config.usesPkce. */
  codeChallenge?: string;
  connectionType?: "personal" | "business";
}

export function resolveScopes(
  config: PlatformOAuthConfig,
  connectionType: "personal" | "business" = "business",
): string[] {
  if (connectionType === "personal" && config.personalScopes) {
    return config.personalScopes;
  }
  return config.scopes;
}

export function buildAuthorizeUrl(input: AuthorizeUrlInput): string {
  const { config, clientId, redirectUri, state } = input;
  const url = new URL(config.authorizeUrl);
  const scopes = resolveScopes(config, input.connectionType ?? "business");

  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", scopes.join(config.scopeSeparator));

  // TikTok is the odd one out: it keys the app by client_key, not client_id,
  // and rejects the request outright without PKCE.
  if (config.platform === "tiktok") {
    url.searchParams.delete("client_id");
    url.searchParams.set("client_key", clientId);
  }

  if (config.usesPkce) {
    if (!input.codeChallenge) {
      throw new Error(`${config.platform} requires PKCE but no code challenge was supplied.`);
    }
    url.searchParams.set("code_challenge", input.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  }

  for (const [key, value] of Object.entries(config.extraAuthorizeParams ?? {})) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

/** Builds the token-exchange request (URL + headers + body) for a platform. */
export function buildTokenRequest(input: {
  config: PlatformOAuthConfig;
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  codeVerifier?: string | null;
}): { url: string; headers: Record<string, string>; body: string } {
  const { config, clientId, clientSecret, code, redirectUri } = input;
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  if (config.platform === "tiktok") {
    params.set("client_key", clientId);
    params.set("client_secret", clientSecret);
  } else if (config.tokenAuthStyle === "basic") {
    headers.Authorization = `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
  } else {
    params.set("client_id", clientId);
    params.set("client_secret", clientSecret);
  }

  if (config.usesPkce) {
    if (!input.codeVerifier) {
      throw new Error(`${config.platform} requires PKCE but no code verifier was stored.`);
    }
    params.set("code_verifier", input.codeVerifier);
  }

  return { url: config.tokenUrl, headers, body: params.toString() };
}

export function buildRefreshRequest(input: {
  config: PlatformOAuthConfig;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): { url: string; headers: Record<string, string>; body: string } {
  const { config, clientId, clientSecret, refreshToken } = input;
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  if (config.platform === "tiktok") {
    params.set("client_key", clientId);
    params.set("client_secret", clientSecret);
  } else if (config.tokenAuthStyle === "basic") {
    headers.Authorization = `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
  } else {
    params.set("client_id", clientId);
    params.set("client_secret", clientSecret);
  }

  return { url: config.tokenUrl, headers, body: params.toString() };
}
