-- Server-side invite-only gate for Madison signups (PR #58).
--
-- A Supabase `before-user-created` Auth hook runs for every new user regardless
-- of method: email/password signUp, magic link / OTP, OAuth (Google), and
-- admin invites. It allows the user only when
--   (a) public.auth_signup_config.open_signup is true, or
--   (b) a pending (accepted_at IS NULL), unexpired team_invitations row exists
--       for the email (case-insensitive).
-- Otherwise it returns an error and Auth refuses to create the user.
--
-- Enabling it is a dashboard step (Authentication -> Hooks -> Before User
-- Created -> Postgres -> public.hook_before_user_created_invite_only). See
-- docs/deploy/invite-only-signup.md. NOT APPLIED.

CREATE TABLE IF NOT EXISTS public.auth_signup_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  open_signup boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.auth_signup_config (id, open_signup) VALUES (true, false)
ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.auth_signup_config ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role / postgres (and the hook, below) can read it.

CREATE OR REPLACE FUNCTION public.hook_before_user_created_invite_only(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email text := lower(nullif(trim(event #>> '{user,email}'), ''));
  v_open boolean;
BEGIN
  SELECT open_signup INTO v_open FROM public.auth_signup_config WHERE id;
  IF coalesce(v_open, false) THEN
    RETURN '{}'::jsonb;
  END IF;

  IF v_email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.team_invitations ti
    WHERE lower(ti.email) = v_email
      AND ti.accepted_at IS NULL
      AND ti.expires_at > now()
  ) THEN
    RETURN '{}'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'Madison is invite-only. Use the link in your invitation email.'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.hook_before_user_created_invite_only(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hook_before_user_created_invite_only(jsonb) TO supabase_auth_admin;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
