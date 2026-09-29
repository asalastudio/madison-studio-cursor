-- Explicitly replace a terminal SKU job's approved image for a new catalog
-- hero. This preserves the normal link + approval gates and only resets the
-- terminal destination state inside the same transaction.
CREATE OR REPLACE FUNCTION public.replace_best_bottles_sku_job_hero(
  p_organization_id UUID,
  p_pipeline_sku_job_id UUID,
  p_image_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_approved_image_id UUID;
  v_tags TEXT[];
BEGIN
  PERFORM public.best_bottles_assert_org_member(p_organization_id);

  SELECT j.status, j.approved_image_id
  INTO v_status, v_approved_image_id
  FROM public.best_bottles_pipeline_sku_jobs AS j
  WHERE j.id = p_pipeline_sku_job_id
    AND j.organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SKU job % was not found in organization %',
      p_pipeline_sku_job_id, p_organization_id;
  END IF;

  SELECT COALESCE(image.library_tags, '{}'::TEXT[])
  INTO v_tags
  FROM public.generated_images AS image
  WHERE image.id = p_image_id
    AND image.organization_id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Image Library row % was not found in organization %',
      p_image_id, p_organization_id;
  END IF;
  IF NOT ('background-qa:pass' = ANY(v_tags))
    OR NOT ('canvas-hex:#F5F3EF' = ANY(v_tags)) THEN
    RAISE EXCEPTION 'Image % has not passed the canonical #F5F3EF background gate',
      p_image_id;
  END IF;

  IF v_approved_image_id = p_image_id
    AND v_status IN ('approved', 'shopify-pushed', 'synced') THEN
    RETURN;
  END IF;

  IF v_status IN ('approved', 'shopify-pushed', 'synced')
    OR v_approved_image_id IS NOT NULL THEN
    PERFORM set_config('app.best_bottles_approval_rpc', 'on', true);
    UPDATE public.best_bottles_pipeline_sku_jobs
    SET status = 'qa-pending',
        generated_image_id = NULL,
        generated_image_url = NULL,
        approved_image_id = NULL,
        approved_image_url = NULL,
        approved_at = NULL,
        approved_by = NULL,
        shopify_product_id = NULL,
        shopify_variant_id = NULL,
        shopify_media_id = NULL,
        shopify_image_url = NULL,
        shopify_pushed_at = NULL,
        convex_synced_at = NULL,
        last_error = NULL,
        updated_at = now()
    WHERE id = p_pipeline_sku_job_id
      AND organization_id = p_organization_id;
    PERFORM set_config('app.best_bottles_approval_rpc', 'off', true);
  END IF;

  PERFORM public.link_best_bottles_generated_image(
    p_organization_id,
    p_pipeline_sku_job_id,
    p_image_id
  );
  PERFORM public.approve_best_bottles_reconciled_image(
    p_organization_id,
    p_pipeline_sku_job_id,
    p_image_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.replace_best_bottles_sku_job_hero(UUID, UUID, UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_best_bottles_sku_job_hero(UUID, UUID, UUID)
  TO authenticated;

COMMENT ON FUNCTION public.replace_best_bottles_sku_job_hero(UUID, UUID, UUID) IS
  'Explicit operator replacement for a group hero using the exact SKU job. Requires canonical background tags and reuses strict reconciliation approval.';
