/**
 * social-oauth-callback — exchanges the authorization code, discovers every
 * publishable surface behind that grant, and stores one encrypted connection
 * per surface.
 *
 * The platform is read from the stored state row, so one callback URL serves
 * every network (each provider only needs this single redirect URI registered).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

import { isSocialPlatformId, type SocialPlatformId } from "../_shared/social/platformRules.ts";
import { buildTokenRequest, getOAuthConfig } from "../_shared/social/oauthConfig.ts";
import { discoverAccounts } from "../_shared/social/drivers/index.ts";
import { defaultDeps } from "../_shared/social/drivers/types.ts";
import { encryptToken, importEncryptionKey } from "../_shared/social/tokenCrypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function redirect(base: string | null, params: Record<string, string>): Response {
  const target = base || "/";
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    // Relative redirect_url (shouldn't happen) — fall back to a plain message.
    return new Response(JSON.stringify(params), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return new Response(null, { status: 302, headers: { ...corsHeaders, Location: url.toString() } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const oauthErrorDescription =
    url.searchParams.get("error_description") ?? url.searchParams.get("error_reason");

  if (!state) {
    return redirect(null, { social_error: "missing_state" });
  }

  const { data: stateRow } = await admin
    .from("social_oauth_states")
    .select("*")
    .eq("state", state)
    .maybeSingle();

  if (!stateRow) {
    return redirect(null, { social_error: "invalid_state" });
  }

  // Single-use: burn the state row regardless of how this turns out.
  await admin.from("social_oauth_states").delete().eq("id", stateRow.id);

  const redirectUrl: string = stateRow.redirect_url;
  const platform = stateRow.platform as SocialPlatformId;

  if (new Date(stateRow.expires_at) < new Date()) {
    return redirect(redirectUrl, { social_error: "state_expired", social_platform: platform });
  }
  if (oauthError) {
    return redirect(redirectUrl, {
      social_error: oauthErrorDescription || oauthError,
      social_platform: platform,
    });
  }
  if (!code) {
    return redirect(redirectUrl, { social_error: "missing_code", social_platform: platform });
  }
  if (!isSocialPlatformId(platform)) {
    return redirect(redirectUrl, { social_error: "unknown_platform" });
  }

  try {
    const config = getOAuthConfig(platform);
    const clientId = Deno.env.get(config.clientIdEnv);
    const clientSecret = Deno.env.get(config.clientSecretEnv);
    if (!clientId || !clientSecret) {
      return redirect(redirectUrl, {
        social_error: "not_configured",
        social_platform: platform,
      });
    }

    const tokenRequest = buildTokenRequest({
      config,
      clientId,
      clientSecret,
      code,
      redirectUri: `${supabaseUrl}/functions/v1/social-oauth-callback`,
      codeVerifier: stateRow.code_verifier,
    });

    const tokenResponse = await fetch(tokenRequest.url, {
      method: "POST",
      headers: tokenRequest.headers,
      body: tokenRequest.body,
    });
    const tokenText = await tokenResponse.text();
    let tokenBody: any = null;
    try {
      tokenBody = JSON.parse(tokenText);
    } catch {
      // Meta historically returned form-encoded token responses.
      const parsed = new URLSearchParams(tokenText);
      if (parsed.has("access_token")) {
        tokenBody = Object.fromEntries(parsed.entries());
      }
    }

    // TikTok nests the payload under `data`.
    const tokenData = tokenBody?.data ?? tokenBody;
    const accessToken: string | undefined = tokenData?.access_token;

    if (!tokenResponse.ok || !accessToken) {
      console.error("[social-oauth-callback] token exchange failed", platform, tokenText);
      return redirect(redirectUrl, {
        social_error: "token_exchange_failed",
        social_platform: platform,
      });
    }

    const now = Date.now();
    const expiresIn = Number(tokenData.expires_in);
    const refreshExpiresIn = Number(tokenData.refresh_expires_in);
    const tokenExpiresAt = Number.isFinite(expiresIn)
      ? new Date(now + expiresIn * 1000).toISOString()
      : null;
    const refreshTokenExpiresAt = Number.isFinite(refreshExpiresIn)
      ? new Date(now + refreshExpiresIn * 1000).toISOString()
      : null;

    const grantedScopes: string[] =
      typeof tokenData.scope === "string"
        ? tokenData.scope.split(/[\s,]+/).filter(Boolean)
        : (stateRow.requested_scopes ?? []);

    const discovery = await discoverAccounts(defaultDeps, {
      platform,
      accessToken,
      refreshToken: tokenData.refresh_token ?? null,
      tokenExpiresAt,
      refreshTokenExpiresAt,
      scopes: grantedScopes,
      appId: clientId,
      appSecret: clientSecret,
    });

    if ("error" in discovery) {
      console.error("[social-oauth-callback] discovery failed", platform, discovery.error);
      return redirect(redirectUrl, {
        social_error: discovery.error.slice(0, 200),
        social_platform: platform,
      });
    }

    // For Meta, one grant yields both facebook and instagram surfaces; keep them
    // all so the user can connect either without re-authorising.
    const accounts = discovery.accounts;
    if (accounts.length === 0) {
      return redirect(redirectUrl, {
        social_error:
          platform === "instagram" || platform === "facebook"
            ? "no_pages_found"
            : "no_accounts_found",
        social_platform: platform,
      });
    }

    const encryptionSecret = Deno.env.get("SOCIAL_TOKEN_ENCRYPTION_KEY");
    if (!encryptionSecret) {
      console.error("[social-oauth-callback] SOCIAL_TOKEN_ENCRYPTION_KEY is not set");
      return redirect(redirectUrl, {
        social_error: "encryption_key_missing",
        social_platform: platform,
      });
    }
    const key = await importEncryptionKey(encryptionSecret);

    const rows = [];
    for (const account of accounts) {
      rows.push({
        organization_id: stateRow.organization_id,
        connected_by: stateRow.user_id,
        platform: account.platform,
        account_type: account.accountType,
        external_account_id: account.externalAccountId,
        external_account_name: account.externalAccountName ?? null,
        external_account_handle: account.externalAccountHandle ?? null,
        external_account_avatar_url: account.externalAccountAvatarUrl ?? null,
        external_parent_id: account.externalParentId ?? null,
        external_parent_name: account.externalParentName ?? null,
        access_token_cipher: await encryptToken(account.accessToken, key),
        refresh_token_cipher: account.refreshToken
          ? await encryptToken(account.refreshToken, key)
          : null,
        token_expires_at: account.tokenExpiresAt ?? null,
        refresh_token_expires_at: account.refreshTokenExpiresAt ?? null,
        scopes: account.scopes,
        status: "active",
        status_detail: null,
        connected_at: new Date().toISOString(),
        last_verified_at: new Date().toISOString(),
        metadata: account.metadata ?? {},
      });
    }

    const { error: upsertError } = await admin
      .from("social_connections")
      .upsert(rows, { onConflict: "organization_id,platform,external_account_id" });

    if (upsertError) {
      console.error("[social-oauth-callback] upsert failed", upsertError);
      return redirect(redirectUrl, {
        social_error: "connection_save_failed",
        social_platform: platform,
      });
    }

    const primary =
      accounts.find((account) => account.platform === platform) ?? accounts[0];

    console.log(
      `[social-oauth-callback] stored ${rows.length} ${platform} surface(s) for org ${stateRow.organization_id}`,
    );

    return redirect(redirectUrl, {
      social_success: "1",
      social_platform: platform,
      social_account: primary.externalAccountName ?? primary.externalAccountId,
      social_accounts_connected: String(rows.length),
    });
  } catch (error) {
    console.error("[social-oauth-callback] error", error);
    return redirect(redirectUrl, {
      social_error: "unexpected_error",
      social_platform: platform,
    });
  }
});
