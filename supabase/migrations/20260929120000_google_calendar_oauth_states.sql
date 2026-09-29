-- Single-use Google Calendar OAuth state. The edge function stores a random
-- nonce plus the trusted app origin; the browser-visible state is HMAC-signed.
-- Service role (the edge function) is the only writer. RLS stays on with no
-- user policies so PostgREST cannot mint or replay states.

CREATE TABLE IF NOT EXISTS public.google_calendar_oauth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nonce TEXT NOT NULL UNIQUE,
  app_origin TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '10 minutes'),
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_google_calendar_oauth_states_nonce
  ON public.google_calendar_oauth_states (nonce);

CREATE INDEX IF NOT EXISTS idx_google_calendar_oauth_states_expires
  ON public.google_calendar_oauth_states (expires_at);

ALTER TABLE public.google_calendar_oauth_states ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.google_calendar_oauth_states IS
  'Single-use CSRF state for Google Calendar OAuth. Written only by the google-calendar-oauth edge function.';
