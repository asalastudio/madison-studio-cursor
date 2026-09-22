-- The terminal link guard required `framing_decision = 'pass'`, which the
-- shoulder-lock rig can never produce. `framing_decision` is derived in
-- `rigPostprocess` from the PRE-transform framing report, and is forced to
-- 'normalize' whenever `physicalScale.verdict` is 'review' or 'unverified'.
-- Since the Sep 7 shoulder lock became the scale authority, physicalScale is
-- 'unverified' on every Cylinder row (no verified-mm path runs), so the rig
-- writes 'normalize' 90 times out of 90 — including all 20 heroes that shipped
-- to the catalog in website PR #196. Those only reached the site because their
-- jobs were already 'synced' and skipped this RPC; any job still at 'queued'
-- could never be linked.
--
-- 'reject' remains excluded: that is the genuine failure verdict (out of
-- tolerance by more than 12 points, shoulder QA failed, or physical scale
-- failed). Every other condition is unchanged — empty qa_issues, the allowed
-- lifecycle states, exact SKU identity, and a present final_image_url.

CREATE OR REPLACE FUNCTION public.link_best_bottles_generated_image(
  p_organization_id uuid,
  p_pipeline_sku_job_id uuid,
  p_image_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_final_image_url TEXT;
  v_job_status TEXT;
  v_approved_image_id UUID;
BEGIN
  PERFORM public.best_bottles_assert_org_member(p_organization_id);

  SELECT j.status, j.approved_image_id
  INTO v_job_status, v_approved_image_id
  FROM public.best_bottles_pipeline_sku_jobs j
  WHERE j.id = p_pipeline_sku_job_id
    AND j.organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SKU job % was not found in organization %',
      p_pipeline_sku_job_id, p_organization_id;
  END IF;

  IF v_job_status IN ('approved', 'shopify-pushed', 'synced')
    OR v_approved_image_id IS NOT NULL THEN
    RAISE EXCEPTION 'Terminal SKU job % cannot be relinked from status % or approved image %',
      p_pipeline_sku_job_id, v_job_status, v_approved_image_id;
  END IF;

  SELECT r.final_image_url INTO v_final_image_url
  FROM public.best_bottles_image_reconciliations r
  JOIN public.best_bottles_pipeline_sku_jobs j
    ON j.id = p_pipeline_sku_job_id
   AND j.organization_id = p_organization_id
  WHERE r.image_id = p_image_id
    AND r.organization_id = p_organization_id
    AND r.requires_pipeline_reconciliation = TRUE
    AND r.lifecycle_state IN ('qa-passed', 'review-pending', 'approved', 'published', 'reconciled')
    AND r.framing_decision IN ('pass', 'normalize')
    AND COALESCE(cardinality(r.qa_issues), 0) = 0
    AND (
      upper(NULLIF(r.grace_sku, '')) = upper(j.grace_sku)
      OR upper(NULLIF(r.website_sku, '')) = upper(j.website_sku)
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(COALESCE(r.catalog_truth->'eligibleGraceSkus', '[]'::JSONB)) eligible(grace_sku)
        WHERE upper(eligible.grace_sku) = upper(j.grace_sku)
      )
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(COALESCE(r.catalog_truth->'eligibleWebsiteSkus', '[]'::JSONB)) eligible(website_sku)
        WHERE upper(eligible.website_sku) = upper(j.website_sku)
      )
    );

  IF v_final_image_url IS NULL THEN
    RAISE EXCEPTION 'Image % is missing passing QA, a final URL, or exact SKU identity for job %',
      p_image_id, p_pipeline_sku_job_id;
  END IF;

  INSERT INTO public.best_bottles_pipeline_sku_images (
    organization_id,
    sku_job_id,
    image_id,
    decision,
    link_source,
    expected_image_url,
    linked_by
  ) VALUES (
    p_organization_id,
    p_pipeline_sku_job_id,
    p_image_id,
    'unreviewed',
    'generation',
    v_final_image_url,
    auth.uid()
  )
  ON CONFLICT (sku_job_id, image_id) DO UPDATE
  SET expected_image_url = EXCLUDED.expected_image_url,
      linked_at = now(),
      linked_by = auth.uid(),
      updated_at = now();

  UPDATE public.best_bottles_pipeline_sku_jobs
  SET status = 'generated',
      generated_image_id = p_image_id,
      generated_image_url = v_final_image_url,
      last_error = NULL,
      updated_at = now()
  WHERE id = p_pipeline_sku_job_id
    AND organization_id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SKU job % was not found in organization %', p_pipeline_sku_job_id, p_organization_id;
  END IF;

  UPDATE public.best_bottles_image_reconciliations
  SET lifecycle_state = CASE
        WHEN lifecycle_state IN ('approved', 'published', 'reconciled') THEN lifecycle_state
        ELSE 'review-pending'
      END,
      updated_at = now()
  WHERE image_id = p_image_id AND organization_id = p_organization_id;
END;
$function$;
