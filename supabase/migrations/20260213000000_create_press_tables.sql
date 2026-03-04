-- =====================================================
-- THE PRESS - Packaging Design Studio
-- =====================================================
-- Tables for dieline templates, packaging projects, and exports

-- =====================================================
-- DIELINE TEMPLATES TABLE
-- =====================================================
-- Stores pre-loaded and user-uploaded dieline templates
CREATE TABLE IF NOT EXISTS public.dieline_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Template Info
  name text NOT NULL,
  description text,
  category text NOT NULL CHECK (category IN ('perfume_box', 'roller_box', 'label', 'candle_box', 'diffuser_box', 'spray_box', 'travel_box', 'serum_box', 'jar_box', 'tube_box')),
  subcategory text,

  -- Dimensions (in mm)
  dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Example: {"width_mm": 50, "height_mm": 150, "depth_mm": 50, "bleed_mm": 3, "safe_zone_mm": 5}

  -- Dieline Data
  dieline_svg text NOT NULL, -- SVG path data for the dieline
  panel_zones jsonb DEFAULT '[]'::jsonb, -- Array of panel definitions
  -- Example: [{"id": "front", "name": "Front Panel", "path": "M 0,0 L 100,0...", "type": "printable"}]

  -- Source & Metadata
  source text NOT NULL DEFAULT 'user_upload' CHECK (source IN ('madison_library', 'user_upload', 'generated')),
  source_url text,
  thumbnail_url text,
  is_public boolean DEFAULT false, -- true = Madison library, false = org-specific

  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on dieline_templates
ALTER TABLE public.dieline_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for dieline_templates
DO $$
BEGIN
  -- Public Madison library templates visible to all
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='dieline_templates' AND policyname='Public templates visible to all'
  ) THEN
    CREATE POLICY "Public templates visible to all"
    ON public.dieline_templates
    FOR SELECT
    USING (is_public = true);
  END IF;

  -- Organization members can view their org templates
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='dieline_templates' AND policyname='Members can view org templates'
  ) THEN
    CREATE POLICY "Members can view org templates"
    ON public.dieline_templates
    FOR SELECT
    USING (
      organization_id IS NOT NULL AND
      is_organization_member(auth.uid(), organization_id)
    );
  END IF;

  -- Organization members can create templates
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='dieline_templates' AND policyname='Members can create org templates'
  ) THEN
    CREATE POLICY "Members can create org templates"
    ON public.dieline_templates
    FOR INSERT
    WITH CHECK (
      organization_id IS NOT NULL AND
      is_organization_member(auth.uid(), organization_id)
    );
  END IF;

  -- Organization members can update their org templates
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='dieline_templates' AND policyname='Members can update org templates'
  ) THEN
    CREATE POLICY "Members can update org templates"
    ON public.dieline_templates
    FOR UPDATE
    USING (
      organization_id IS NOT NULL AND
      is_organization_member(auth.uid(), organization_id)
    );
  END IF;

  -- Organization members can delete their org templates
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='dieline_templates' AND policyname='Members can delete org templates'
  ) THEN
    CREATE POLICY "Members can delete org templates"
    ON public.dieline_templates
    FOR DELETE
    USING (
      organization_id IS NOT NULL AND
      is_organization_member(auth.uid(), organization_id)
    );
  END IF;
END $$;

-- Indexes for dieline_templates
CREATE INDEX IF NOT EXISTS idx_dieline_templates_org
  ON public.dieline_templates (organization_id);
CREATE INDEX IF NOT EXISTS idx_dieline_templates_category
  ON public.dieline_templates (category);
CREATE INDEX IF NOT EXISTS idx_dieline_templates_public
  ON public.dieline_templates (is_public) WHERE is_public = true;

-- =====================================================
-- PACKAGING PROJECTS TABLE
-- =====================================================
-- User's packaging design projects
CREATE TABLE IF NOT EXISTS public.packaging_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Project Info
  name text NOT NULL,
  description text,

  -- References
  dieline_template_id uuid REFERENCES public.dieline_templates(id) ON DELETE SET NULL,
  product_id uuid, -- References brand_products if linked

  -- Canvas State (Fabric.js serialized)
  canvas_state jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Layers
  artwork_layers jsonb DEFAULT '[]'::jsonb,
  -- Example: [{"source": "image_url", "position": {"x": 0, "y": 0}, "scale": 1, "rotation": 0}]

  text_layers jsonb DEFAULT '[]'::jsonb,
  -- Example: [{"content": "Product Name", "font": "Montserrat", "size": 24, "color": "#000000", "position": {...}}]

  -- Export Settings
  export_settings jsonb DEFAULT '{"color_space": "CMYK", "dpi": 300, "bleed": true, "marks": true}'::jsonb,

  -- Status
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'approved', 'exported')),

  -- Preview
  thumbnail_url text,

  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on packaging_projects
ALTER TABLE public.packaging_projects ENABLE ROW LEVEL SECURITY;

-- RLS Policies for packaging_projects
DO $$
BEGIN
  -- Organization members can view their org projects
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='packaging_projects' AND policyname='Members can view org projects'
  ) THEN
    CREATE POLICY "Members can view org projects"
    ON public.packaging_projects
    FOR SELECT
    USING (is_organization_member(auth.uid(), organization_id));
  END IF;

  -- Organization members can create projects
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='packaging_projects' AND policyname='Members can create org projects'
  ) THEN
    CREATE POLICY "Members can create org projects"
    ON public.packaging_projects
    FOR INSERT
    WITH CHECK (is_organization_member(auth.uid(), organization_id));
  END IF;

  -- Organization members can update their org projects
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='packaging_projects' AND policyname='Members can update org projects'
  ) THEN
    CREATE POLICY "Members can update org projects"
    ON public.packaging_projects
    FOR UPDATE
    USING (is_organization_member(auth.uid(), organization_id));
  END IF;

  -- Organization members can delete their org projects
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='packaging_projects' AND policyname='Members can delete org projects'
  ) THEN
    CREATE POLICY "Members can delete org projects"
    ON public.packaging_projects
    FOR DELETE
    USING (is_organization_member(auth.uid(), organization_id));
  END IF;
END $$;

-- Indexes for packaging_projects
CREATE INDEX IF NOT EXISTS idx_packaging_projects_org
  ON public.packaging_projects (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_packaging_projects_user
  ON public.packaging_projects (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_packaging_projects_product
  ON public.packaging_projects (product_id) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_packaging_projects_status
  ON public.packaging_projects (organization_id, status);

-- =====================================================
-- PACKAGING EXPORTS TABLE
-- =====================================================
-- Export history for packaging projects
CREATE TABLE IF NOT EXISTS public.packaging_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.packaging_projects(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Export Info
  file_url text NOT NULL,
  file_format text NOT NULL DEFAULT 'pdf' CHECK (file_format IN ('pdf', 'png', 'svg')),
  file_size_bytes bigint,

  -- Export Settings Used
  export_settings jsonb DEFAULT '{}'::jsonb,

  -- Timestamps
  exported_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on packaging_exports
ALTER TABLE public.packaging_exports ENABLE ROW LEVEL SECURITY;

-- RLS Policies for packaging_exports
DO $$
BEGIN
  -- Organization members can view their org exports
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='packaging_exports' AND policyname='Members can view org exports'
  ) THEN
    CREATE POLICY "Members can view org exports"
    ON public.packaging_exports
    FOR SELECT
    USING (is_organization_member(auth.uid(), organization_id));
  END IF;

  -- Organization members can create exports
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='packaging_exports' AND policyname='Members can create org exports'
  ) THEN
    CREATE POLICY "Members can create org exports"
    ON public.packaging_exports
    FOR INSERT
    WITH CHECK (is_organization_member(auth.uid(), organization_id));
  END IF;

  -- Organization members can delete their org exports
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='packaging_exports' AND policyname='Members can delete org exports'
  ) THEN
    CREATE POLICY "Members can delete org exports"
    ON public.packaging_exports
    FOR DELETE
    USING (is_organization_member(auth.uid(), organization_id));
  END IF;
END $$;

-- Indexes for packaging_exports
CREATE INDEX IF NOT EXISTS idx_packaging_exports_project
  ON public.packaging_exports (project_id, exported_at DESC);
CREATE INDEX IF NOT EXISTS idx_packaging_exports_org
  ON public.packaging_exports (organization_id, exported_at DESC);
CREATE INDEX IF NOT EXISTS idx_packaging_exports_user
  ON public.packaging_exports (user_id, exported_at DESC);

-- =====================================================
-- UPDATED_AT TRIGGERS
-- =====================================================
-- Automatically update updated_at timestamps

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for dieline_templates
DROP TRIGGER IF EXISTS set_dieline_templates_updated_at ON public.dieline_templates;
CREATE TRIGGER set_dieline_templates_updated_at
  BEFORE UPDATE ON public.dieline_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Trigger for packaging_projects
DROP TRIGGER IF EXISTS set_packaging_projects_updated_at ON public.packaging_projects;
CREATE TRIGGER set_packaging_projects_updated_at
  BEFORE UPDATE ON public.packaging_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON TABLE public.dieline_templates IS 'Dieline templates for packaging design (pre-loaded Madison library + user uploads)';
COMMENT ON TABLE public.packaging_projects IS 'User packaging design projects with canvas state and artwork layers';
COMMENT ON TABLE public.packaging_exports IS 'Export history for packaging projects (PDF, PNG, SVG)';
