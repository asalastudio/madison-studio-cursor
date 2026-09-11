/**
 * social-scheduler — the cron tick that publishes due posts.
 *
 * Invoked every minute by pg_cron (see 20260911090100_social_publishing_scheduler_cron.sql)
 * using SOCIAL_SCHEDULER_SECRET, or manually with the service role key.
 *
 * Rows are leased through claim_due_social_posts(), which uses FOR UPDATE SKIP
 * LOCKED — two overlapping ticks can never claim the same post, so a slow
 * Instagram video upload cannot cause a double post.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

import { executePublish } from "../_shared/social/publishRunner.ts";
import { createSupabaseStore, mapPostRow } from "../_shared/social/supabaseStore.ts";
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

const DEFAULT_BATCH = 10;
const LEASE_SECONDS = 300;

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

  const startedAt = Date.now();

  try {
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    // Deployed with verify_jwt disabled so pg_cron can reach it, so this
    // function owns its own auth. Two accepted credentials:
    //   - x-social-scheduler-secret, verified against the Vault secret that
    //     pg_cron reads. The value is generated inside Postgres and never
    //     leaves it, so no operator (or agent) ever handles it.
    //   - the service role key as a bearer token, for manual drains.
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const presentedSecret = req.headers.get("x-social-scheduler-secret")?.trim();
    const presentedToken = (req.headers.get("Authorization") ?? "")
      .replace(/^Bearer\s+/i, "")
      .trim();

    let authorized = false;
    if (presentedSecret) {
      const { data, error: verifyError } = await admin.rpc(
        "verify_social_scheduler_secret",
        { p_secret: presentedSecret },
      );
      if (verifyError) {
        console.error("[social-scheduler] secret verification failed", verifyError.message);
      }
      authorized = data === true;
    } else if (serviceRoleKey && presentedToken) {
      authorized = timingSafeEqual(presentedToken, serviceRoleKey);
    }

    if (!authorized) {
      return json({ error: "Forbidden" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const limit = Number.isFinite(Number(body?.limit)) ? Number(body.limit) : DEFAULT_BATCH;

    const encryptionSecret = Deno.env.get("SOCIAL_TOKEN_ENCRYPTION_KEY");
    if (!encryptionSecret) {
      console.error("[social-scheduler] SOCIAL_TOKEN_ENCRYPTION_KEY is not set");
      return json({ error: "SOCIAL_TOKEN_ENCRYPTION_KEY is not set" }, 500);
    }
    const key = await importEncryptionKey(encryptionSecret);
    const decrypt = (cipher: string) => decryptToken(cipher, key);
    const store = createSupabaseStore(admin);

    const workerId = `social-scheduler:${crypto.randomUUID().slice(0, 8)}`;

    const { data: claimed, error: claimError } = await admin.rpc("claim_due_social_posts", {
      p_limit: limit,
      p_worker: workerId,
      p_lease_seconds: LEASE_SECONDS,
    });

    if (claimError) {
      console.error("[social-scheduler] claim failed", claimError);
      return json({ error: claimError.message }, 500);
    }

    const rows: any[] = claimed ?? [];
    if (rows.length === 0) {
      return json({ claimed: 0, published: 0, failed: 0, retried: 0, durationMs: Date.now() - startedAt });
    }

    console.log(`[social-scheduler] ${workerId} claimed ${rows.length} post(s)`);

    let published = 0;
    let failed = 0;
    let retried = 0;
    const results: Array<Record<string, unknown>> = [];

    for (const row of rows) {
      const outcome = await executePublish({
        post: mapPostRow(row),
        store,
        deps: defaultDeps,
        getDriver,
        decryptToken: decrypt,
        jitter: Math.random(),
      });

      if (outcome.status === "published") published += 1;
      else if (outcome.status === "retry_scheduled") retried += 1;
      else failed += 1;

      results.push({ postId: row.id, platform: row.platform, outcome });
      console.log(`[social-scheduler] ${row.platform} post ${row.id} -> ${outcome.status}`);
    }

    return json({
      worker: workerId,
      claimed: rows.length,
      published,
      failed,
      retried,
      results,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    console.error("[social-scheduler] error", error);
    return json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});
