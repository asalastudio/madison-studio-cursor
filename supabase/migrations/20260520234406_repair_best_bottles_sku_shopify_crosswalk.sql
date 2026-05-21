-- Repair drift from early Best Bottles Pipeline SKU job deployments.
--
-- The 20260520010000 migration created `shopify_sku`, but some remote
-- environments already had `best_bottles_pipeline_sku_jobs`, so
-- CREATE TABLE IF NOT EXISTS skipped the column definition. This column is
-- the SKU crosswalk used by Image Library, Pipeline reconciliation, and
-- Shopify variant pushes.

ALTER TABLE public.best_bottles_pipeline_sku_jobs
  ADD COLUMN IF NOT EXISTS shopify_sku TEXT;

UPDATE public.best_bottles_pipeline_sku_jobs
SET shopify_sku = grace_sku
WHERE shopify_sku IS NULL
  AND grace_sku IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_best_bottles_pipeline_sku_jobs_org_shopify_sku
  ON public.best_bottles_pipeline_sku_jobs (organization_id, shopify_sku)
  WHERE shopify_sku IS NOT NULL;
