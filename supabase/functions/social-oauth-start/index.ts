/**
 * social-oauth-start — begins the OAuth flow for any supported platform.
 *
 * Replaces the per-provider *-oauth-start functions. The caller passes a
 * platform id; everything platform-specific comes from _shared/social/oauthConfig.
 *
 * POST { platform, organizationId, redirectUrl?, connectionType? }
 *   -> { authUrl, scopes, platform }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

import { isSocialPlatformId, getPlatformRule } from "../_shared/social/platformRules.ts";
import {
  buildAuthorizeUrl,
  getOAuthConfig,
  resolveScopes,
} from "../_shared/social/oauthConfig.ts";

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

function randomString(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const values = new Uint8Array(length);
  crypto.getRandomValues(values);
  let out = "";
  for (let i = 0; i < length; i += 1) out += chars[values[i] % chars.length];
  return out;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization header" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    const payload = await req.json();
    const { platform, organizationId, redirectUrl, connectionType = "business" } = payload ?? {};

    if (!isSocialPlatformId(platform)) {
      return json({ error: "Unknown platform", platform }, 400);
    }
    if (!organizationId) {
      return json({ error: "organizationId is required" }, 400);
    }

    const rule = getPlatformRule(platform);
    if (!rule.supported) {
      return json({ error: `${rule.label} publishing is not available yet.` }, 400);
    }

    // Only owners/admins may attach a publishing account to an organization.
    const { data: membership } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return json(
        { error: "Only organization owners and admins can connect a social account." },
        403,
      );
    }

    const config = getOAuthConfig(platform);
    const clientId = Deno.env.get(config.clientIdEnv);
    const clientSecret = Deno.env.get(config.clientSecretEnv);

    if (!clientId || !clientSecret) {
      return json(
        {
          error: `${rule.label} integration is not configured`,
          message: `Set ${config.clientIdEnv} and ${config.clientSecretEnv} as Supabase secrets.`,
          setup: {
            developerConsole: config.developerConsoleUrl,
            redirectUri: `${supabaseUrl}/functions/v1/social-oauth-callback`,
            scopes: config.scopes,
          },
        },
        500,
      );
    }

    const state = randomString(48);
    const codeVerifier = config.usesPkce ? randomString(64) : null;
    const codeChallenge = codeVerifier ? await pkceChallenge(codeVerifier) : undefined;
    const scopes = resolveScopes(config, connectionType === "personal" ? "personal" : "business");

    const finalRedirect =
      redirectUrl || `${req.headers.get("origin") ?? ""}/settings?tab=integrations`;

    const { error: stateError } = await supabase.from("social_oauth_states").insert({
      user_id: user.id,
      organization_id: organizationId,
      platform,
      state,
      code_verifier: codeVerifier,
      redirect_url: finalRedirect,
      requested_scopes: scopes,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });

    if (stateError) {
      console.error("[social-oauth-start] failed to store state", stateError);
      return json({ error: "Could not start the connection flow", details: stateError.message }, 500);
    }

    const authUrl = buildAuthorizeUrl({
      config,
      clientId,
      redirectUri: `${supabaseUrl}/functions/v1/social-oauth-callback`,
      state,
      codeChallenge,
      connectionType: connectionType === "personal" ? "personal" : "business",
    });

    console.log(`[social-oauth-start] ${platform} for org ${organizationId} by ${user.id}`);

    return json({ authUrl, scopes, platform });
  } catch (error) {
    console.error("[social-oauth-start] error", error);
    return json(
      { error: "Internal server error", details: error instanceof Error ? error.message : String(error) },
      500,
    );
  }
});
