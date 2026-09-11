-- Scheduler shared secret, generated and verified entirely inside Postgres.
--
-- pg_cron reads the secret from Vault to set the request header; the edge
-- function hands the presented header back to verify_social_scheduler_secret()
-- rather than holding a copy of its own. The plaintext therefore never leaves
-- the database — no operator, and no agent, ever handles it.
--
-- This is deliberately not the service role key: the cron job can reach only
-- the two social functions, so a leaked database dump does not hand over full
-- service-role access to the project.

CREATE OR REPLACE FUNCTION public.ensure_social_scheduler_secret()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $fn$
DECLARE
  existing UUID;
BEGIN
  SELECT id INTO existing FROM vault.secrets WHERE name = 'social_scheduler_secret' LIMIT 1;
  IF existing IS NOT NULL THEN
    RETURN 'social_scheduler_secret already present';
  END IF;

  PERFORM vault.create_secret(
    encode(extensions.gen_random_bytes(32), 'hex'),
    'social_scheduler_secret',
    'Shared secret pg_cron presents to the social-scheduler edge function.'
  );
  RETURN 'social_scheduler_secret created';
END;
$fn$;

REVOKE ALL ON FUNCTION public.ensure_social_scheduler_secret() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_social_scheduler_secret() FROM anon;
REVOKE ALL ON FUNCTION public.ensure_social_scheduler_secret() FROM authenticated;

-- Compares digests rather than raw strings so a timing difference cannot
-- reveal a prefix of the secret.
CREATE OR REPLACE FUNCTION public.verify_social_scheduler_secret(p_secret TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $fn$
DECLARE
  stored TEXT;
BEGIN
  IF p_secret IS NULL OR length(p_secret) = 0 THEN
    RETURN false;
  END IF;

  SELECT decrypted_secret INTO stored
  FROM vault.decrypted_secrets
  WHERE name = 'social_scheduler_secret'
  LIMIT 1;

  IF stored IS NULL THEN
    RETURN false;
  END IF;

  RETURN extensions.digest(p_secret, 'sha256') = extensions.digest(stored, 'sha256');
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$fn$;

REVOKE ALL ON FUNCTION public.verify_social_scheduler_secret(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_social_scheduler_secret(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.verify_social_scheduler_secret(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.verify_social_scheduler_secret(TEXT) TO service_role;

-- Final install step. `project_url` is the only value an operator supplies, and
-- it is not a secret. Run once per environment:
--
--   DO $$
--   BEGIN
--     IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'project_url') THEN
--       PERFORM vault.create_secret('https://<project-ref>.supabase.co', 'project_url', 'Edge function base URL for pg_cron.');
--     END IF;
--     PERFORM public.ensure_social_scheduler_secret();
--     PERFORM public.install_social_scheduler_cron();
--   END;
--   $$;
