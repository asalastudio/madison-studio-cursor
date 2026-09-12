import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildAuthorizeUrl,
  buildRefreshRequest,
  buildTokenRequest,
  getOAuthConfig,
  resolveScopes,
} from "./oauthConfig.ts";

describe("buildAuthorizeUrl", () => {
  it("builds a Meta authorize URL with comma-separated scopes", () => {
    const url = new URL(
      buildAuthorizeUrl({
        config: getOAuthConfig("instagram"),
        clientId: "app-123",
        redirectUri: "https://project.supabase.co/functions/v1/social-oauth-callback",
        state: "state-abc",
      }),
    );
    assert.equal(url.hostname, "www.facebook.com");
    assert.equal(url.searchParams.get("client_id"), "app-123");
    assert.equal(url.searchParams.get("state"), "state-abc");
    assert.ok(url.searchParams.get("scope")?.includes("instagram_content_publish"));
    assert.ok(url.searchParams.get("scope")?.includes(","));
  });

  it("uses client_key and PKCE for TikTok", () => {
    const url = new URL(
      buildAuthorizeUrl({
        config: getOAuthConfig("tiktok"),
        clientId: "key-123",
        redirectUri: "https://project.supabase.co/functions/v1/social-oauth-callback",
        state: "state-abc",
        codeChallenge: "challenge-value",
      }),
    );
    assert.equal(url.searchParams.get("client_key"), "key-123");
    assert.equal(url.searchParams.get("client_id"), null);
    assert.equal(url.searchParams.get("code_challenge"), "challenge-value");
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  });

  it("refuses to build a PKCE URL without a challenge", () => {
    assert.throws(() =>
      buildAuthorizeUrl({
        config: getOAuthConfig("tiktok"),
        clientId: "key-123",
        redirectUri: "https://example.com/cb",
        state: "s",
      }),
    );
  });
});

describe("resolveScopes", () => {
  it("drops organization scopes for a personal LinkedIn connection", () => {
    const config = getOAuthConfig("linkedin");
    const personal = resolveScopes(config, "personal");
    assert.ok(!personal.includes("w_organization_social"));
    assert.ok(personal.includes("w_member_social"));
    assert.ok(resolveScopes(config, "business").includes("w_organization_social"));
  });
});

describe("buildTokenRequest", () => {
  it("sends Pinterest credentials as HTTP basic auth", () => {
    const request = buildTokenRequest({
      config: getOAuthConfig("pinterest"),
      clientId: "id",
      clientSecret: "secret",
      code: "code-1",
      redirectUri: "https://example.com/cb",
    });
    assert.equal(request.headers.Authorization, `Basic ${btoa("id:secret")}`);
    assert.ok(!request.body.includes("client_secret"));
  });

  it("sends LinkedIn credentials in the body", () => {
    const request = buildTokenRequest({
      config: getOAuthConfig("linkedin"),
      clientId: "id",
      clientSecret: "secret",
      code: "code-1",
      redirectUri: "https://example.com/cb",
    });
    assert.equal(request.headers.Authorization, undefined);
    assert.ok(request.body.includes("client_secret=secret"));
  });

  it("includes the TikTok code verifier and client_key", () => {
    const request = buildTokenRequest({
      config: getOAuthConfig("tiktok"),
      clientId: "key",
      clientSecret: "secret",
      code: "code-1",
      redirectUri: "https://example.com/cb",
      codeVerifier: "verifier-1",
    });
    assert.ok(request.body.includes("client_key=key"));
    assert.ok(request.body.includes("code_verifier=verifier-1"));
  });

  it("refuses a PKCE exchange without the stored verifier", () => {
    assert.throws(() =>
      buildTokenRequest({
        config: getOAuthConfig("tiktok"),
        clientId: "key",
        clientSecret: "secret",
        code: "code-1",
        redirectUri: "https://example.com/cb",
      }),
    );
  });
});

describe("buildRefreshRequest", () => {
  it("uses the refresh_token grant", () => {
    const request = buildRefreshRequest({
      config: getOAuthConfig("pinterest"),
      clientId: "id",
      clientSecret: "secret",
      refreshToken: "refresh-1",
    });
    assert.ok(request.body.includes("grant_type=refresh_token"));
    assert.ok(request.body.includes("refresh_token=refresh-1"));
  });
});
