-- Sanity placement lane
--
-- `push-sanity-placement` has been written for a while but reads four tables
-- that were never created, so the whole editorial-image lane was inert. This
-- migration creates them and registers the Best Bottles destinations.
--
-- Division of labour (verified against the bb-main-qa site, 2026-09-11):
--   * Product photography  -> Shopify hosts, Convex points, site renders.
--     The PDP/catalog only accept Shopify CDN URLs
--     (`isPreferredProductImageUrl = isShopifyCdnImageUrl && !isLegacy...`),
--     so a Sanity image can never become a product shot. `product_main_image`
--     is deliberately NOT registered for Best Bottles.
--   * Editorial / marketing imagery -> Sanity, via this lane.
--
-- Two constraints from the function that shape the registry:
--   1. `isSafeFieldPath` accepts dotted paths only — no array indices. Homepage
--      slots like `heroSlides[0].image` are therefore unreachable by design.
--   2. The publisher PATCHES an existing document and errors when the selector
--      matches nothing. It never creates documents.
--   Together these mean Madison fills an image field on a document an editor
--   owns, rather than reaching into the homepage document's arrays — which
--   would fight the editor and break on every reorder.

-- ---------------------------------------------------------------------------
-- 1. Connections
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sanity_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  dataset TEXT NOT NULL DEFAULT 'production',
  studio_url TEXT,
  api_version TEXT NOT NULL DEFAULT '2024-10-01',

  -- Name of the Supabase secret holding the write token, never the token
  -- itself. Keeps Sanity credentials out of the database entirely.
  write_token_secret_name TEXT NOT NULL,

  -- Selects which destination rows apply ('generic' or a client profile).
  schema_profile TEXT NOT NULL DEFAULT 'generic',
  is_active BOOLEAN NOT NULL DEFAULT true,

  last_schema_inspected_at TIMESTAMPTZ,
  last_schema_status TEXT,
  last_error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One active connection per organization; the publisher resolves by is_active.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sanity_connections_active_per_org
  ON public.sanity_connections (organization_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_sanity_connections_org
  ON public.sanity_connections (organization_id);

-- ---------------------------------------------------------------------------
-- 2. Destination registry
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sanity_destination_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL = a generic destination available to any org on the 'generic' profile.
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  destination_key TEXT NOT NULL CHECK (destination_key IN (
    'blog_post', 'homepage_hero', 'product_family_hero',
    'product_main_image', 'paper_doll_component'
  )),
  schema_profile TEXT NOT NULL DEFAULT 'generic',

  sanity_document_type TEXT NOT NULL,
  -- GROQ returning exactly one document. Params come from selector_params.
  selector_query TEXT NOT NULL,
  -- { paramName: "metadataKey" } pulls from the request metadata;
  -- any non-matching value is passed through as a literal.
  selector_params JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Dotted path only — see isSafeFieldPath.
  target_field_path TEXT NOT NULL,

  publish_mode TEXT NOT NULL DEFAULT 'patch',
  requires_image BOOLEAN NOT NULL DEFAULT true,
  required_metadata JSONB NOT NULL DEFAULT '[]'::jsonb,

  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT sanity_destination_field_path_is_dotted
    CHECK (target_field_path ~ '^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sanity_destination_unique
  ON public.sanity_destination_registry (
    COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
    destination_key,
    schema_profile
  ) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_sanity_destination_key
  ON public.sanity_destination_registry (destination_key) WHERE is_active;

-- ---------------------------------------------------------------------------
-- 3. Publish log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sanity_publish_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES public.sanity_connections(id) ON DELETE SET NULL,
  operation TEXT NOT NULL,
  destination_key TEXT,
  status TEXT NOT NULL,
  source_image_url TEXT,
  sanity_asset_id TEXT,
  sanity_document_id TEXT,
  sanity_document_type TEXT,
  target_field_path TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  published_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sanity_publish_log_org
  ON public.sanity_publish_log (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sanity_publish_log_destination
  ON public.sanity_publish_log (destination_key, created_at DESC);

-- ---------------------------------------------------------------------------
-- 4. Schema inspections
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sanity_schema_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES public.sanity_connections(id) ON DELETE SET NULL,
  project_id TEXT,
  dataset TEXT,
  status TEXT NOT NULL,
  observed_document_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  sampled_documents JSONB NOT NULL DEFAULT '[]'::jsonb,
  destination_matches JSONB NOT NULL DEFAULT '[]'::jsonb,
  error_message TEXT,
  inspected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sanity_schema_inspections_org
  ON public.sanity_schema_inspections (organization_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 5. updated_at triggers
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS sanity_connections_updated_at ON public.sanity_connections;
CREATE TRIGGER sanity_connections_updated_at
  BEFORE UPDATE ON public.sanity_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS sanity_destination_registry_updated_at ON public.sanity_destination_registry;
CREATE TRIGGER sanity_destination_registry_updated_at
  BEFORE UPDATE ON public.sanity_destination_registry
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 6. RLS — members read, service role writes
-- ---------------------------------------------------------------------------
ALTER TABLE public.sanity_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sanity_destination_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sanity_publish_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sanity_schema_inspections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view sanity connections" ON public.sanity_connections;
CREATE POLICY "Members can view sanity connections"
  ON public.sanity_connections FOR SELECT
  USING (public.is_organization_member(auth.uid(), organization_id));

DROP POLICY IF EXISTS "Admins can manage sanity connections" ON public.sanity_connections;
CREATE POLICY "Admins can manage sanity connections"
  ON public.sanity_connections FOR ALL
  USING (
    public.has_organization_role(auth.uid(), organization_id, 'owner'::organization_role)
    OR public.has_organization_role(auth.uid(), organization_id, 'admin'::organization_role)
  )
  WITH CHECK (
    public.has_organization_role(auth.uid(), organization_id, 'owner'::organization_role)
    OR public.has_organization_role(auth.uid(), organization_id, 'admin'::organization_role)
  );

-- Destinations are readable by members of the owning org, plus the shared
-- generic rows. Writes stay service-role only: a user-writable registry would
-- let anyone repoint a publish at an arbitrary document field.
DROP POLICY IF EXISTS "Members can view sanity destinations" ON public.sanity_destination_registry;
CREATE POLICY "Members can view sanity destinations"
  ON public.sanity_destination_registry FOR SELECT
  USING (
    organization_id IS NULL
    OR public.is_organization_member(auth.uid(), organization_id)
  );

DROP POLICY IF EXISTS "Members can view sanity publish log" ON public.sanity_publish_log;
CREATE POLICY "Members can view sanity publish log"
  ON public.sanity_publish_log FOR SELECT
  USING (public.is_organization_member(auth.uid(), organization_id));

DROP POLICY IF EXISTS "Members can view sanity schema inspections" ON public.sanity_schema_inspections;
CREATE POLICY "Members can view sanity schema inspections"
  ON public.sanity_schema_inspections FOR SELECT
  USING (public.is_organization_member(auth.uid(), organization_id));
