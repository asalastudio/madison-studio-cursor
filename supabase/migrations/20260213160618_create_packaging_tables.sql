-- Create packaging_templates table (global template library)
CREATE TABLE IF NOT EXISTS public.packaging_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('folding', 'tuck_end', 'mailer', 'display', 'tray', 'rigid', 'paper_bags', 'pouches', 'envelopes', 'custom')),
  description TEXT,
  thumbnail_url TEXT,
  dieline_svg TEXT NOT NULL,
  panel_definitions JSONB NOT NULL,
  base_dimensions JSONB NOT NULL,
  dimension_constraints JSONB,
  material_options TEXT[] DEFAULT ARRAY['white_board', 'kraft'],
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  fefco_code TEXT,
  is_active BOOLEAN DEFAULT true,
  is_popular BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create packaging_projects table (org-scoped user projects)
CREATE TABLE IF NOT EXISTS public.packaging_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES public.packaging_templates(id),
  name TEXT NOT NULL DEFAULT 'Untitled Package Design',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'ready', 'exported')),
  dimensions JSONB NOT NULL,
  canvas_state JSONB,
  artwork_layers JSONB,
  thumbnail_url TEXT,
  mockup_url TEXT,
  export_history JSONB DEFAULT '[]'::jsonb,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create packaging_assets table (org-scoped uploaded assets)
CREATE TABLE IF NOT EXISTS public.packaging_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.packaging_projects(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER,
  width INTEGER,
  height INTEGER,
  source TEXT DEFAULT 'upload' CHECK (source IN ('upload', 'image_studio', 'brand_asset', 'ai_generated')),
  source_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_packaging_templates_category ON public.packaging_templates(category);
CREATE INDEX IF NOT EXISTS idx_packaging_templates_active ON public.packaging_templates(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_packaging_projects_org_id ON public.packaging_projects(org_id);
CREATE INDEX IF NOT EXISTS idx_packaging_projects_org_status ON public.packaging_projects(org_id, status);
CREATE INDEX IF NOT EXISTS idx_packaging_projects_user_id ON public.packaging_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_packaging_assets_org_id ON public.packaging_assets(org_id);
CREATE INDEX IF NOT EXISTS idx_packaging_assets_project_id ON public.packaging_assets(project_id);

-- Enable Row Level Security
ALTER TABLE public.packaging_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packaging_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packaging_assets ENABLE ROW LEVEL SECURITY;

-- RLS Policies for packaging_templates
-- Templates are viewable by all authenticated users
CREATE POLICY "Templates are viewable by all authenticated users"
  ON public.packaging_templates
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- RLS Policies for packaging_projects
-- Users can view their organization's projects
CREATE POLICY "Users can view their org's projects"
  ON public.packaging_projects
  FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Users can create projects in their organization
CREATE POLICY "Users can create projects in their org"
  ON public.packaging_projects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
    )
    AND user_id = auth.uid()
  );

-- Users can update their organization's projects
CREATE POLICY "Users can update their org's projects"
  ON public.packaging_projects
  FOR UPDATE
  TO authenticated
  USING (
    org_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Users can delete their organization's projects
CREATE POLICY "Users can delete their org's projects"
  ON public.packaging_projects
  FOR DELETE
  TO authenticated
  USING (
    org_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for packaging_assets
-- Users can manage (CRUD) their organization's assets
CREATE POLICY "Users can manage their org's assets"
  ON public.packaging_assets
  FOR ALL
  TO authenticated
  USING (
    org_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Trigger for updating updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_packaging_projects_updated_at
  BEFORE UPDATE ON public.packaging_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE public.packaging_templates IS 'Global library of box/packaging die-line templates';
COMMENT ON TABLE public.packaging_projects IS 'User packaging design projects (org-scoped)';
COMMENT ON TABLE public.packaging_assets IS 'Uploaded assets used in packaging designs (org-scoped)';
