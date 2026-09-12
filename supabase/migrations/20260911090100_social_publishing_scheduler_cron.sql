-- Social publishing scheduler (pg_cron -> pg_net -> social-scheduler edge function)
--
-- This migration is deliberately self-healing: if pg_cron / pg_net are not yet
-- enabled on the project, or the Vault secrets are missing, it records a NOTICE
-- and leaves the schedule uncreated rather than failing the migration. Re-run
-- public.install_social_scheduler_cron() once the prerequisites exist.
--
-- The cron job authenticates with SOCIAL_SCHEDULER_SECRET rather than the
-- service role key: the scheduler and token-refresh functions are the only
-- things it can reach, so a leaked database dump does not hand over full
-- service-role access to the project.
--
-- Prerequisites (see docs/SOCIAL_PUBLISHING.md):
--   1. Database -> Extensions: enable `pg_cron` and `pg_net`.
--   2. Store two Vault secrets (Project Settings -> Vault):
--        project_url             https://<project-ref>.supabase.co
--        social_scheduler_secret <same value as the SOCIAL_SCHEDULER_SECRET function secret>
--   3. SELECT public.install_social_scheduler_cron();

DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'social scheduler: could not create pg_cron (%). Enable it from the dashboard.', SQLERRM;
  END;

  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'social scheduler: could not create pg_net (%). Enable it from the dashboard.', SQLERRM;
  END;
END;
$$;

-- Reads a secret out of Supabase Vault, returning NULL when absent.
CREATE OR REPLACE FUNCTION public.social_vault_secret(p_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
DECLARE
  value TEXT;
BEGIN
  SELECT decrypted_secret INTO value
  FROM vault.decrypted_secrets
  WHERE name = p_name
  LIMIT 1;
  RETURN value;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.social_vault_secret(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.social_vault_secret(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.social_vault_secret(TEXT) FROM authenticated;

-- Fire-and-forget POST to one of the social edge functions.
CREATE OR REPLACE FUNCTION public.invoke_social_edge_function(
  p_function TEXT,
  p_body JSONB DEFAULT '{}'::jsonb
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  project_url TEXT := public.social_vault_secret('project_url');
  scheduler_secret TEXT := public.social_vault_secret('social_scheduler_secret');
  request_id BIGINT;
BEGIN
  IF p_function NOT IN ('social-scheduler', 'social-refresh-tokens') THEN
    RAISE EXCEPTION 'invoke_social_edge_function: % is not an allowed target', p_function;
  END IF;

  IF project_url IS NULL OR scheduler_secret IS NULL THEN
    RAISE NOTICE 'social scheduler: vault secrets project_url / social_scheduler_secret not set; skipping tick.';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := project_url || '/functions/v1/' || p_function,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-social-scheduler-secret', scheduler_secret
    ),
    body := p_body,
    timeout_milliseconds := 120000
  ) INTO request_id;

  RETURN request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_social_edge_function(TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invoke_social_edge_function(TEXT, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.invoke_social_edge_function(TEXT, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_social_edge_function(TEXT, JSONB) TO service_role;

-- Idempotent installer. Safe to run repeatedly.
CREATE OR REPLACE FUNCTION public.install_social_scheduler_cron()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RETURN 'pg_cron is not installed - enable it under Database > Extensions, then re-run.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RETURN 'pg_net is not installed - enable it under Database > Extensions, then re-run.';
  END IF;

  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname IN (
    'social-scheduler-tick',
    'social-token-refresh',
    'social-oauth-state-cleanup'
  );

  PERFORM cron.schedule(
    'social-scheduler-tick',
    '* * * * *',
    $job$SELECT public.invoke_social_edge_function('social-scheduler', jsonb_build_object('source', 'pg_cron', 'limit', 10));$job$
  );

  PERFORM cron.schedule(
    'social-token-refresh',
    '0 4 * * *',
    $job$SELECT public.invoke_social_edge_function('social-refresh-tokens');$job$
  );

  PERFORM cron.schedule(
    'social-oauth-state-cleanup',
    '17 * * * *',
    'SELECT public.cleanup_expired_social_oauth_states();'
  );

  RETURN 'Installed: social-scheduler-tick (every minute), social-token-refresh (daily 04:00 UTC), social-oauth-state-cleanup (hourly).';
END;
$$;

REVOKE ALL ON FUNCTION public.install_social_scheduler_cron() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.install_social_scheduler_cron() FROM anon;
REVOKE ALL ON FUNCTION public.install_social_scheduler_cron() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.install_social_scheduler_cron() TO service_role;

-- Try to install now; harmless no-op when prerequisites are missing.
DO $$
DECLARE
  result TEXT;
BEGIN
  result := public.install_social_scheduler_cron();
  RAISE NOTICE 'social scheduler: %', result;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'social scheduler: install deferred (%).', SQLERRM;
END;
$$;
