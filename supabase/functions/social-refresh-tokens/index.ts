/**
 * social-refresh-tokens — keeps connections alive.
 *
 * Pinterest, TikTok and LinkedIn issue refresh tokens; those are exchanged
 * before expiry. Meta does not — Page tokens derived from a long-lived user
 * token are effectively permanent, so instead we probe the token and flag the
 * connection for re-auth the moment Meta stops accepting it.
 *
 * Intended to run daily. Add to cron alongside the scheduler:
 *   SELECT cron.schedule('social-token-refresh', '0 4 * * *',
 *     'SELECT public.invoke_social_edge_function(''social-refresh-tokens'')');
 * or invoke it manually with the service role key.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

import { buildRefreshRequest, getOAuthConfig, META_GRAPH_VERSION } from "../_shared/social/oauthConfig.ts";
import type { SocialPlatformId } from "../_shared/social/platformRules.ts";
import { decryptToken, encryptToken, importEncryptionKey } from "../_shared/social/tokenCrypto.ts";

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

/** Refresh anything expiring inside this window. */
const REFRESH_HORIZON_DAYS = 14;

/** Constant-time comparison so a wrong secret cannot be probed byte by byte. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Same auth contract as social-scheduler (see the note there).
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const presentedSecret = req.headers.get("x-social-scheduler-secret")?.trim();
    const presentedToken = (req.headers.get("Authorization") ?? "")
      .replace(/^Bearer\s+/i, "")
      .trim();

    let authorized = false;
    if (presentedSecret) {
      const { data } = await admin.rpc("verify_social_scheduler_secret", {
        p_secret: presentedSecret,
      });
      authorized = data === true;
    } else if (serviceRoleKey && presentedToken) {
      authorized = timingSafeEqual(presentedToken, serviceRoleKey);
    }

    if (!authorized) return json({ error: "Forbidden" }, 403);

    const encryptionSecret = Deno.env.get("SOCIAL_TOKEN_ENCRYPTION_KEY");
    if (!encryptionSecret) return json({ error: "SOCIAL_TOKEN_ENCRYPTION_KEY is not set" }, 500);
    const key = await importEncryptionKey(encryptionSecret);

    const horizon = new Date(Date.now() + REFRESH_HORIZON_DAYS * 86_400_000).toISOString();

    const { data: connections, error } = await admin
      .from("social_connections")
      .select("*")
      .eq("status", "active")
      .or(`token_expires_at.is.null,token_expires_at.lte.${horizon}`);

    if (error) return json({ error: error.message }, 500);

    const summary = { checked: 0, refreshed: 0, flagged: 0, skipped: 0, errors: [] as string[] };

    for (const connection of connections ?? []) {
      summary.checked += 1;
      const platform = connection.platform as SocialPlatformId;

      try {
        if (connection.refresh_token_cipher) {
          const config = getOAuthConfig(platform);
          const clientId = Deno.env.get(config.clientIdEnv);
          const clientSecret = Deno.env.get(config.clientSecretEnv);
          if (!clientId || !clientSecret) {
            summary.skipped += 1;
            continue;
          }

          const refreshToken = await decryptToken(connection.refresh_token_cipher, key);
          const request = buildRefreshRequest({ config, clientId, clientSecret, refreshToken });
          const response = await fetch(request.url, {
            method: "POST",
            headers: request.headers,
            body: request.body,
          });
          const text = await response.text();
          let body: any = null;
          try {
            body = JSON.parse(text);
          } catch {
            body = null;
          }
          const data = body?.data ?? body;

          if (!response.ok || !data?.access_token) {
            await flagReauth(admin, connection.id, `Token refresh failed: ${text.slice(0, 300)}`);
            summary.flagged += 1;
            continue;
          }

          const now = Date.now();
          const expiresIn = Number(data.expires_in);
          const refreshExpiresIn = Number(data.refresh_expires_in);

          await admin
            .from("social_connections")
            .update({
              access_token_cipher: await encryptToken(data.access_token, key),
              refresh_token_cipher: data.refresh_token
                ? await encryptToken(data.refresh_token, key)
                : connection.refresh_token_cipher,
              token_expires_at: Number.isFinite(expiresIn)
                ? new Date(now + expiresIn * 1000).toISOString()
                : connection.token_expires_at,
              refresh_token_expires_at: Number.isFinite(refreshExpiresIn)
                ? new Date(now + refreshExpiresIn * 1000).toISOString()
                : connection.refresh_token_expires_at,
              last_verified_at: new Date().toISOString(),
              status_detail: null,
            })
            .eq("id", connection.id);

          summary.refreshed += 1;
          continue;
        }

        // No refresh token (Meta): probe the token instead.
        if (platform === "facebook" || platform === "instagram") {
          const accessToken = await decryptToken(connection.access_token_cipher, key);
          const probeUrl = new URL(
            `https://graph.facebook.com/${META_GRAPH_VERSION}/${connection.external_account_id}`,
          );
          probeUrl.searchParams.set("fields", "id");
          probeUrl.searchParams.set("access_token", accessToken);

          const probe = await fetch(probeUrl.toString());
          if (probe.ok) {
            await admin
              .from("social_connections")
              .update({ last_verified_at: new Date().toISOString(), status_detail: null })
              .eq("id", connection.id);
          } else {
            const detail = (await probe.text()).slice(0, 300);
            await flagReauth(admin, connection.id, `Meta rejected the stored token: ${detail}`);
            summary.flagged += 1;
          }
          continue;
        }

        summary.skipped += 1;
      } catch (connectionError) {
        const message =
          connectionError instanceof Error ? connectionError.message : String(connectionError);
        summary.errors.push(`${connection.id}: ${message}`);
      }
    }

    console.log("[social-refresh-tokens]", JSON.stringify(summary));
    return json(summary);
  } catch (error) {
    console.error("[social-refresh-tokens] error", error);
    return json(
      { error: "Internal server error", details: error instanceof Error ? error.message : String(error) },
      500,
    );
  }
});

async function flagReauth(admin: any, connectionId: string, detail: string) {
  await admin
    .from("social_connections")
    .update({ status: "needs_reauth", status_detail: detail })
    .eq("id", connectionId);
}
