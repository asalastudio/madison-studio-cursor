-- Social publishing core
--
-- Platform-neutral replacement for the per-provider tables (linkedin_connections /
-- linkedin_oauth_states / linkedin_posts). One connection row per (org, platform,
-- external account); one social_posts row per platform target; a group_id ties the
-- fan-out of a single composer submission back together.
--
-- Publishing is driven by claim_due_social_posts(), which leases rows with
-- FOR UPDATE SKIP LOCKED so multiple scheduler invocations cannot double-post.

-- ---------------------------------------------------------------------------
-- 1. Connections
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.social_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  platform TEXT NOT NULL CHECK (platform IN (
    'instagram', 'facebook', 'linkedin', 'pinterest', 'tiktok', 'threads'
  )),

  -- Which surface we post to. 'personal' = a member profile, everything else is
  -- a business surface (IG business account, FB Page, LinkedIn company page,
  -- Pinterest business account, TikTok creator/business account).
  account_type TEXT NOT NULL DEFAULT 'business'
    CHECK (account_type IN ('personal', 'page', 'business', 'creator')),

  -- Stable platform identifier for the posting surface:
  --   instagram -> IG User ID        facebook  -> Page ID
  --   linkedin  -> member/org URN    pinterest -> account username
  --   tiktok    -> open_id           threads   -> Threads user ID
  external_account_id TEXT NOT NULL,
  external_account_name TEXT,
  external_account_handle TEXT,
  external_account_avatar_url TEXT,

  -- Parent surface where one exists (the FB Page that backs an IG account, the
  -- LinkedIn member who administers a company page).
  external_parent_id TEXT,
  external_parent_name TEXT,

  -- Tokens are stored as ciphertext produced by _shared/social/tokenCrypto.ts
  -- ("v1:<iv>:<ciphertext>", AES-256-GCM under SOCIAL_TOKEN_ENCRYPTION_KEY).
  access_token_cipher TEXT NOT NULL,
  refresh_token_cipher TEXT,
  token_expires_at TIMESTAMPTZ,
  refresh_token_expires_at TIMESTAMPTZ,
  scopes TEXT[] NOT NULL DEFAULT '{}',

  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'needs_reauth', 'revoked', 'disabled')),
  status_detail TEXT,

  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_verified_at TIMESTAMPTZ,
  last_published_at TIMESTAMPTZ,

  -- Platform extras that do not deserve a column: default Pinterest board,
  -- IG media limits observed, TikTok creator_info snapshot, etc.
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (organization_id, platform, external_account_id)
);

CREATE INDEX IF NOT EXISTS idx_social_connections_org
  ON public.social_connections (organization_id);
CREATE INDEX IF NOT EXISTS idx_social_connections_org_platform
  ON public.social_connections (organization_id, platform) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_social_connections_expiring
  ON public.social_connections (token_expires_at) WHERE status = 'active';

-- ---------------------------------------------------------------------------
-- 2. OAuth state (CSRF + PKCE)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.social_oauth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  state TEXT NOT NULL UNIQUE,
  code_verifier TEXT,
  redirect_url TEXT NOT NULL,
  requested_scopes TEXT[] NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '10 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_oauth_states_state
  ON public.social_oauth_states (state);
CREATE INDEX IF NOT EXISTS idx_social_oauth_states_expiry
  ON public.social_oauth_states (expires_at);

-- ---------------------------------------------------------------------------
-- 3. Posts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- One composer submission -> N rows (one per platform) sharing a group_id.
  group_id UUID NOT NULL DEFAULT gen_random_uuid(),

  connection_id UUID REFERENCES public.social_connections(id) ON DELETE SET NULL,
  platform TEXT NOT NULL CHECK (platform IN (
    'instagram', 'facebook', 'linkedin', 'pinterest', 'tiktok', 'threads'
  )),

  -- Content
  caption TEXT NOT NULL DEFAULT '',
  link_url TEXT,
  first_comment TEXT,
  -- [{ url, type: 'image'|'video', alt, width, height, duration_ms, thumbnail_url }]
  media JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Per-platform extras: pinterest board_id/title, tiktok privacy_level,
  -- instagram share_to_feed / post_as_reel, linkedin visibility.
  options JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Provenance back into the Madison content model
  scheduled_content_id UUID REFERENCES public.scheduled_content(id) ON DELETE SET NULL,
  master_content_id UUID REFERENCES public.master_content(id) ON DELETE SET NULL,
  derivative_asset_id UUID REFERENCES public.derivative_assets(id) ON DELETE SET NULL,

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'scheduled', 'publishing', 'published', 'failed', 'cancelled'
  )),
  scheduled_for TIMESTAMPTZ,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  -- Next moment the scheduler may attempt this row (exponential backoff target).
  publish_after TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,

  -- Lease held by whichever scheduler invocation claimed the row.
  lease_expires_at TIMESTAMPTZ,
  locked_by TEXT,

  -- Guards against double submission from the composer / retried invocations.
  idempotency_key TEXT,

  -- Result
  external_post_id TEXT,
  permalink TEXT,
  published_at TIMESTAMPTZ,
  error_code TEXT,
  error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT social_posts_scheduled_requires_time
    CHECK (status <> 'scheduled' OR scheduled_for IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_social_posts_idempotency
  ON public.social_posts (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_social_posts_org_scheduled
  ON public.social_posts (organization_id, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_social_posts_group
  ON public.social_posts (group_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_connection
  ON public.social_posts (connection_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_scheduled_content
  ON public.social_posts (scheduled_content_id);
-- The scheduler's hot path: due rows only.
CREATE INDEX IF NOT EXISTS idx_social_posts_due
  ON public.social_posts (scheduled_for)
  WHERE status IN ('scheduled', 'publishing');

-- ---------------------------------------------------------------------------
-- 4. Attempt ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.social_publish_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  outcome TEXT CHECK (outcome IN ('success', 'retryable_error', 'permanent_error')),
  http_status INTEGER,
  error_code TEXT,
  error_message TEXT,
  request_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_summary JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_social_publish_attempts_post
  ON public.social_publish_attempts (post_id, attempt_number);
CREATE INDEX IF NOT EXISTS idx_social_publish_attempts_org
  ON public.social_publish_attempts (organization_id, started_at DESC);

-- ---------------------------------------------------------------------------
-- 5. updated_at triggers
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS social_connections_updated_at ON public.social_connections;
CREATE TRIGGER social_connections_updated_at
  BEFORE UPDATE ON public.social_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS social_posts_updated_at ON public.social_posts;
CREATE TRIGGER social_posts_updated_at
  BEFORE UPDATE ON public.social_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.social_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_publish_attempts ENABLE ROW LEVEL SECURITY;

-- Connections: any member can see that a channel is connected (the UI needs the
-- account name/avatar), only owners and admins can connect or disconnect.
-- Token ciphertext is never selected by the client; the composer reads the view
-- below, and the edge functions use the service role.
DROP POLICY IF EXISTS "Members can view social connections" ON public.social_connections;
CREATE POLICY "Members can view social connections"
  ON public.social_connections FOR SELECT
  USING (public.is_organization_member(auth.uid(), organization_id));

DROP POLICY IF EXISTS "Admins can manage social connections" ON public.social_connections;
CREATE POLICY "Admins can manage social connections"
  ON public.social_connections FOR ALL
  USING (
    public.has_organization_role(auth.uid(), organization_id, 'owner'::organization_role)
    OR public.has_organization_role(auth.uid(), organization_id, 'admin'::organization_role)
  )
  WITH CHECK (
    public.has_organization_role(auth.uid(), organization_id, 'owner'::organization_role)
    OR public.has_organization_role(auth.uid(), organization_id, 'admin'::organization_role)
  );

DROP POLICY IF EXISTS "Users manage their own social oauth states" ON public.social_oauth_states;
CREATE POLICY "Users manage their own social oauth states"
  ON public.social_oauth_states FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Members can view social posts" ON public.social_posts;
CREATE POLICY "Members can view social posts"
  ON public.social_posts FOR SELECT
  USING (public.is_organization_member(auth.uid(), organization_id));

DROP POLICY IF EXISTS "Members can manage social posts" ON public.social_posts;
CREATE POLICY "Members can manage social posts"
  ON public.social_posts FOR ALL
  USING (public.is_organization_member(auth.uid(), organization_id))
  WITH CHECK (public.is_organization_member(auth.uid(), organization_id));

DROP POLICY IF EXISTS "Members can view social publish attempts" ON public.social_publish_attempts;
CREATE POLICY "Members can view social publish attempts"
  ON public.social_publish_attempts FOR SELECT
  USING (public.is_organization_member(auth.uid(), organization_id));

-- ---------------------------------------------------------------------------
-- 7. Safe connection view (never exposes ciphertext)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.social_connection_summaries
WITH (security_invoker = true) AS
SELECT
  c.id,
  c.organization_id,
  c.platform,
  c.account_type,
  c.external_account_id,
  c.external_account_name,
  c.external_account_handle,
  c.external_account_avatar_url,
  c.external_parent_id,
  c.external_parent_name,
  c.scopes,
  c.status,
  c.status_detail,
  c.connected_at,
  c.last_verified_at,
  c.last_published_at,
  c.token_expires_at,
  c.metadata,
  (c.token_expires_at IS NOT NULL AND c.token_expires_at < now() + INTERVAL '7 days')
    AS token_expiring_soon
FROM public.social_connections c;

GRANT SELECT ON public.social_connection_summaries TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. Scheduler claim function
-- ---------------------------------------------------------------------------
-- Atomically leases up to p_limit due posts. A row is due when it is 'scheduled'
-- with scheduled_for <= now() and no backoff pending, OR it is stuck in
-- 'publishing' with an expired lease (previous invocation died mid-flight).
CREATE OR REPLACE FUNCTION public.claim_due_social_posts(
  p_limit INTEGER DEFAULT 10,
  p_worker TEXT DEFAULT 'social-scheduler',
  p_lease_seconds INTEGER DEFAULT 300
)
RETURNS SETOF public.social_posts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT p.id
    FROM public.social_posts p
    WHERE (
        p.status = 'scheduled'
        AND p.scheduled_for IS NOT NULL
        AND p.scheduled_for <= now()
        AND (p.publish_after IS NULL OR p.publish_after <= now())
      )
      OR (
        p.status = 'publishing'
        AND p.lease_expires_at IS NOT NULL
        AND p.lease_expires_at < now()
      )
    ORDER BY p.scheduled_for ASC
    LIMIT GREATEST(p_limit, 0)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.social_posts p
  SET status = 'publishing',
      locked_by = p_worker,
      lease_expires_at = now() + make_interval(secs => GREATEST(p_lease_seconds, 30)),
      attempt_count = p.attempt_count + 1,
      updated_at = now()
  FROM due
  WHERE p.id = due.id
  RETURNING p.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_due_social_posts(INTEGER, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_due_social_posts(INTEGER, TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.claim_due_social_posts(INTEGER, TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_social_posts(INTEGER, TEXT, INTEGER) TO service_role;

-- ---------------------------------------------------------------------------
-- 9. Expired OAuth state cleanup
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_expired_social_oauth_states()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted INTEGER;
BEGIN
  DELETE FROM public.social_oauth_states WHERE expires_at < now();
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;

-- REVOKE FROM PUBLIC alone is not enough on Supabase: anon and authenticated
-- hold EXECUTE explicitly, so they need explicit revokes too.
REVOKE ALL ON FUNCTION public.cleanup_expired_social_oauth_states() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_expired_social_oauth_states() FROM anon;
REVOKE ALL ON FUNCTION public.cleanup_expired_social_oauth_states() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_social_oauth_states() TO service_role;
