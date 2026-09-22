-- Reusable physical-scale annotations for Best Bottles catalog heroes.
-- One approved row is authoritative for a glass geometry + fitment topology.

CREATE TABLE IF NOT EXISTS public.best_bottles_scale_calibrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  family TEXT NOT NULL,
  geometry_key TEXT NOT NULL,
  topology_key TEXT NOT NULL,
  calibration_version TEXT NOT NULL,
  grace_sku TEXT NOT NULL,
  website_sku TEXT,
  product_group_slug TEXT NOT NULL,
  source_reference_url TEXT NOT NULL,
  source_reference_hash TEXT,
  source_width_px INTEGER NOT NULL CHECK (source_width_px > 0),
  source_height_px INTEGER NOT NULL CHECK (source_height_px > 0),
  glass_foot_y_pct NUMERIC(7, 4) NOT NULL CHECK (glass_foot_y_pct BETWEEN 0 AND 100),
  glass_rim_y_pct NUMERIC(7, 4) NOT NULL CHECK (glass_rim_y_pct BETWEEN 0 AND 100),
  fitment_top_y_pct NUMERIC(7, 4) CHECK (fitment_top_y_pct IS NULL OR fitment_top_y_pct BETWEEN 0 AND 100),
  primary_bounds JSONB NOT NULL,
  detached_component_bounds JSONB,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'archived')),
  review_note TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT best_bottles_scale_calibration_landmarks_valid
    CHECK (glass_rim_y_pct < glass_foot_y_pct),
  CONSTRAINT best_bottles_scale_calibration_scope_unique
    UNIQUE (organization_id, family, geometry_key, topology_key, calibration_version)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_best_bottles_scale_calibrations_one_approved
  ON public.best_bottles_scale_calibrations (
    organization_id,
    family,
    geometry_key,
    topology_key
  )
  WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS idx_best_bottles_scale_calibrations_org_family
  ON public.best_bottles_scale_calibrations (organization_id, family, status);

CREATE OR REPLACE FUNCTION public.best_bottles_scale_calibration_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_best_bottles_scale_calibration_touch_updated_at
  ON public.best_bottles_scale_calibrations;
CREATE TRIGGER trg_best_bottles_scale_calibration_touch_updated_at
BEFORE UPDATE ON public.best_bottles_scale_calibrations
FOR EACH ROW
EXECUTE FUNCTION public.best_bottles_scale_calibration_touch_updated_at();

ALTER TABLE public.best_bottles_scale_calibrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view Best Bottles scale calibrations"
  ON public.best_bottles_scale_calibrations;
CREATE POLICY "Members can view Best Bottles scale calibrations"
ON public.best_bottles_scale_calibrations
FOR SELECT TO authenticated
USING (public.is_organization_member(auth.uid(), organization_id));

DROP POLICY IF EXISTS "Members can create Best Bottles scale calibrations"
  ON public.best_bottles_scale_calibrations;
CREATE POLICY "Members can create Best Bottles scale calibrations"
ON public.best_bottles_scale_calibrations
FOR INSERT TO authenticated
WITH CHECK (
  public.is_organization_member(auth.uid(), organization_id)
  AND created_by = auth.uid()
  AND status = 'draft'
);

DROP POLICY IF EXISTS "Members can update Best Bottles scale calibration drafts"
  ON public.best_bottles_scale_calibrations;
CREATE POLICY "Members can update Best Bottles scale calibration drafts"
ON public.best_bottles_scale_calibrations
FOR UPDATE TO authenticated
USING (
  public.is_organization_member(auth.uid(), organization_id)
  AND status = 'draft'
)
WITH CHECK (
  public.is_organization_member(auth.uid(), organization_id)
  AND status = 'draft'
);

CREATE OR REPLACE FUNCTION public.approve_best_bottles_scale_calibration(
  p_organization_id UUID,
  p_calibration_id UUID,
  p_review_note TEXT DEFAULT NULL
)
RETURNS public.best_bottles_scale_calibrations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.best_bottles_scale_calibrations;
BEGIN
  PERFORM public.best_bottles_assert_org_member(p_organization_id);

  SELECT *
  INTO v_row
  FROM public.best_bottles_scale_calibrations
  WHERE id = p_calibration_id
    AND organization_id = p_organization_id
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Scale calibration % was not found in organization %',
      p_calibration_id, p_organization_id;
  END IF;

  IF v_row.glass_foot_y_pct - v_row.glass_rim_y_pct < 1 THEN
    RAISE EXCEPTION 'Glass foot-to-rim annotation must span at least 1%% of the source canvas';
  END IF;

  UPDATE public.best_bottles_scale_calibrations
  SET status = 'archived'
  WHERE organization_id = p_organization_id
    AND family = v_row.family
    AND geometry_key = v_row.geometry_key
    AND topology_key = v_row.topology_key
    AND status = 'approved'
    AND id <> v_row.id;

  UPDATE public.best_bottles_scale_calibrations
  SET
    status = 'approved',
    review_note = COALESCE(p_review_note, review_note),
    approved_by = auth.uid(),
    approved_at = now()
  WHERE id = v_row.id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON TABLE public.best_bottles_scale_calibrations FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.best_bottles_scale_calibrations TO authenticated;
GRANT ALL ON TABLE public.best_bottles_scale_calibrations TO service_role;

REVOKE ALL ON FUNCTION public.approve_best_bottles_scale_calibration(UUID, UUID, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_best_bottles_scale_calibration(UUID, UUID, TEXT)
  TO authenticated, service_role;
