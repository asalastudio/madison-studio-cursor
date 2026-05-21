-- Best Bottles Madison SKU image jobs
--
-- Product groups remain the rollup surface in best_bottles_pipeline_groups.
-- This table stores the actual per-variant image workflow state so Madison can
-- generate in family/group batches while approving, pushing, and syncing each
-- SKU independently.

CREATE TABLE IF NOT EXISTS public.best_bottles_pipeline_sku_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pipeline_group_id UUID REFERENCES public.best_bottles_pipeline_groups(id) ON DELETE SET NULL,

  product_group_slug TEXT NOT NULL,
  product_group_display_name TEXT,
  family TEXT NOT NULL,
  catalog_reference_pages TEXT,
  category TEXT,
  capacity_ml INT,
  applicator TEXT,
  canonical_color TEXT,
  product_id TEXT,
  source_id TEXT,

  grace_sku TEXT NOT NULL,
  website_sku TEXT NOT NULL,
  shopify_sku TEXT,
  expected_canonical_filename TEXT,
  best_reference_candidate_path TEXT,
  coverage_status TEXT,

  status TEXT NOT NULL DEFAULT 'needs-reference'
    CHECK (status IN (
      'needs-reference',
      'ready-to-generate',
      'queued',
      'generating',
      'generated',
      'qa-pending',
      'approved',
      'rejected',
      'shopify-pushed',
      'synced'
    )),

  generated_image_id UUID,
  generated_image_url TEXT,
  approved_image_id UUID,
  approved_image_url TEXT,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id),

  shopify_product_id TEXT,
  shopify_variant_id TEXT,
  shopify_media_id TEXT,
  shopify_image_url TEXT,
  shopify_pushed_at TIMESTAMPTZ,
  convex_synced_at TIMESTAMPTZ,
  last_error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT best_bottles_pipeline_sku_jobs_org_grace_sku_unique
    UNIQUE (organization_id, grace_sku)
);

CREATE INDEX IF NOT EXISTS idx_best_bottles_pipeline_sku_jobs_org_status
  ON public.best_bottles_pipeline_sku_jobs (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_best_bottles_pipeline_sku_jobs_org_group
  ON public.best_bottles_pipeline_sku_jobs (organization_id, product_group_slug);

CREATE INDEX IF NOT EXISTS idx_best_bottles_pipeline_sku_jobs_org_family
  ON public.best_bottles_pipeline_sku_jobs (organization_id, family);

CREATE INDEX IF NOT EXISTS idx_best_bottles_pipeline_sku_jobs_org_shopify_sku
  ON public.best_bottles_pipeline_sku_jobs (organization_id, shopify_sku)
  WHERE shopify_sku IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_best_bottles_pipeline_sku_jobs_pipeline_group
  ON public.best_bottles_pipeline_sku_jobs (pipeline_group_id);

CREATE OR REPLACE FUNCTION public.best_bottles_pipeline_sku_jobs_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS best_bottles_pipeline_sku_jobs_touch_updated_at
  ON public.best_bottles_pipeline_sku_jobs;
CREATE TRIGGER best_bottles_pipeline_sku_jobs_touch_updated_at
  BEFORE UPDATE ON public.best_bottles_pipeline_sku_jobs
  FOR EACH ROW EXECUTE FUNCTION public.best_bottles_pipeline_sku_jobs_touch_updated_at();

ALTER TABLE public.best_bottles_pipeline_sku_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pipeline_sku_jobs_select_own_org" ON public.best_bottles_pipeline_sku_jobs;
CREATE POLICY "pipeline_sku_jobs_select_own_org"
  ON public.best_bottles_pipeline_sku_jobs
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "pipeline_sku_jobs_insert_own_org" ON public.best_bottles_pipeline_sku_jobs;
CREATE POLICY "pipeline_sku_jobs_insert_own_org"
  ON public.best_bottles_pipeline_sku_jobs
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "pipeline_sku_jobs_update_own_org" ON public.best_bottles_pipeline_sku_jobs;
CREATE POLICY "pipeline_sku_jobs_update_own_org"
  ON public.best_bottles_pipeline_sku_jobs
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "pipeline_sku_jobs_delete_own_org" ON public.best_bottles_pipeline_sku_jobs;
CREATE POLICY "pipeline_sku_jobs_delete_own_org"
  ON public.best_bottles_pipeline_sku_jobs
  FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.best_bottles_pipeline_sku_jobs IS
  'Best Bottles per-SKU Madison image workflow jobs. Seeded from May 14 + Convex coverage data; group table remains the rollup.';
