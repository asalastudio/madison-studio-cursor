-- Processed Stripe webhook events (PR #60). The webhook records each event id
-- after it is handled successfully, so retried or duplicate deliveries are
-- acknowledged without reprocessing. Service-role only. NOT APPLIED.
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  id text PRIMARY KEY,               -- Stripe event id (evt_...)
  type text NOT NULL,
  event_created_at timestamptz,
  outcome text NOT NULL DEFAULT 'processed',
  processed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role (webhook) reads or writes.
CREATE INDEX IF NOT EXISTS stripe_webhook_events_processed_at_idx ON public.stripe_webhook_events (processed_at);
