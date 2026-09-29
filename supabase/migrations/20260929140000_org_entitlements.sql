-- Owner-proof feature entitlements. Members may read; only the service role
-- (or a migration) may write. This replaces brand_config.features as the
-- source of truth for Best Bottles / Tarife gates.

CREATE TABLE IF NOT EXISTS public.org_entitlements (
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, feature)
);

CREATE INDEX IF NOT EXISTS idx_org_entitlements_feature
  ON public.org_entitlements (feature);

ALTER TABLE public.org_entitlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_entitlements_select ON public.org_entitlements;
CREATE POLICY org_entitlements_select ON public.org_entitlements
  FOR SELECT
  USING (public.is_organization_member(auth.uid(), organization_id));

-- Backfill from any existing brand_config flags, plus known org identities.
INSERT INTO public.org_entitlements (organization_id, feature)
SELECT id, 'grid_pipeline'
FROM public.organizations
WHERE COALESCE(brand_config->'features'->>'grid_pipeline', '') = 'true'
   OR id = '4ab1ac72-cd7e-4faf-9152-5aa5f2862411'
ON CONFLICT DO NOTHING;

INSERT INTO public.org_entitlements (organization_id, feature)
SELECT id, 'tarife'
FROM public.organizations
WHERE COALESCE(brand_config->'features'->>'tarife', '') = 'true'
   OR name ILIKE 'Tarife Attar%'
ON CONFLICT DO NOTHING;

COMMENT ON TABLE public.org_entitlements IS
  'Server-managed org feature grants. Owners cannot write these rows.';
