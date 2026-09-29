-- ═══════════════════════════════════════════════════════════════════════════════
-- MADISON CANVAS — WEEK 1
-- Organization → Project → Canvas → Nodes / Edges
--
-- Hard rules for this migration:
--   * Do not apply to a live Supabase project from an agent.
--   * Every row carries organization_id.
--   * RLS is enabled on every table. No USING (true). No anon policies.
--   * Policies require membership via is_organization_member((select auth.uid()), …).
--   * organization_id is immutable after insert.
--   * No service-role policies. Clients must use the authenticated role.
--
-- Week 1 tables only. Runs, jobs, credits, slots, pushes, and schedules
-- belong to later weeks and are intentionally omitted.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Projects ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.canvas_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('pdp', 'campaign')),
  title text NOT NULL CHECK (char_length(btrim(title)) > 0),
  sku text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  pack_version_id uuid,
  brand_product_id uuid REFERENCES public.brand_products(id) ON DELETE SET NULL,
  product_hub_id uuid REFERENCES public.product_hubs(id) ON DELETE SET NULL,
  shopify_product_gid text,
  shopify_variant_gid text,
  sku_resolved_via text CHECK (
    sku_resolved_via IS NULL
    OR sku_resolved_via IN (
      'product_hubs',
      'product_variants',
      'brand_products',
      'bb_pipeline_sku_jobs',
      'shopify_live'
    )
  ),
  sku_resolved_at timestamptz,
  monthly_credit_cap integer,
  auto_publish_allowed boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT canvas_projects_pdp_requires_sku CHECK (type <> 'pdp' OR sku IS NOT NULL)
);

CREATE UNIQUE INDEX canvas_projects_one_active_pdp_per_sku
  ON public.canvas_projects (organization_id, upper(sku))
  WHERE type = 'pdp' AND status <> 'archived' AND sku IS NOT NULL;

CREATE INDEX canvas_projects_org_status_idx
  ON public.canvas_projects (organization_id, status, created_at DESC);

CREATE INDEX canvas_projects_org_sku_idx
  ON public.canvas_projects (organization_id, sku);

-- ── Canvases (one primary canvas per project in week 1) ─────────────────────

CREATE TABLE IF NOT EXISTS public.canvases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.canvas_projects(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Main',
  pack_version_id uuid,
  viewport jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT canvases_org_matches_project CHECK (organization_id IS NOT NULL)
);

CREATE UNIQUE INDEX canvases_one_primary_per_project
  ON public.canvases (project_id)
  WHERE name = 'Main';

CREATE INDEX canvases_org_project_idx
  ON public.canvases (organization_id, project_id);

-- ── Nodes ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.canvas_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.canvas_projects(id) ON DELETE CASCADE,
  canvas_id uuid NOT NULL REFERENCES public.canvases(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN (
    'pack',
    'product',
    'set',
    'shot',
    'batch',
    'image',
    'edit',
    'motion',
    'copy',
    'shopify_slots',
    'export',
    'note',
    'group'
  )),
  position jsonb NOT NULL DEFAULT '{"x":0,"y":0}'::jsonb,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'idle' CHECK (status IN (
    'idle',
    'queued',
    'running',
    'done',
    'failed',
    'pending_review',
    'approved',
    'rejected'
  )),
  output_ref jsonb,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX canvas_nodes_canvas_idx ON public.canvas_nodes (canvas_id);
CREATE INDEX canvas_nodes_project_idx ON public.canvas_nodes (project_id);
CREATE INDEX canvas_nodes_org_idx ON public.canvas_nodes (organization_id, canvas_id);

-- ── Edges ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.canvas_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.canvas_projects(id) ON DELETE CASCADE,
  canvas_id uuid NOT NULL REFERENCES public.canvases(id) ON DELETE CASCADE,
  source_node_id uuid NOT NULL REFERENCES public.canvas_nodes(id) ON DELETE CASCADE,
  target_node_id uuid NOT NULL REFERENCES public.canvas_nodes(id) ON DELETE CASCADE,
  source_handle text,
  target_handle text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT canvas_edges_no_self_loop CHECK (source_node_id <> target_node_id)
);

CREATE INDEX canvas_edges_canvas_idx ON public.canvas_edges (canvas_id);
CREATE INDEX canvas_edges_project_idx ON public.canvas_edges (project_id);
CREATE UNIQUE INDEX canvas_edges_unique_connection
  ON public.canvas_edges (canvas_id, source_node_id, target_node_id, COALESCE(source_handle, ''), COALESCE(target_handle, ''));

-- ── updated_at helper ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.canvas_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER canvas_projects_set_updated_at
  BEFORE UPDATE ON public.canvas_projects
  FOR EACH ROW EXECUTE FUNCTION public.canvas_set_updated_at();

CREATE TRIGGER canvases_set_updated_at
  BEFORE UPDATE ON public.canvases
  FOR EACH ROW EXECUTE FUNCTION public.canvas_set_updated_at();

CREATE TRIGGER canvas_nodes_set_updated_at
  BEFORE UPDATE ON public.canvas_nodes
  FOR EACH ROW EXECUTE FUNCTION public.canvas_set_updated_at();

-- ── Immutable organization_id + parent-org consistency ──────────────────────

CREATE OR REPLACE FUNCTION public.canvas_lock_organization_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'organization_id is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.canvas_enforce_parent_organization()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_org uuid;
BEGIN
  IF TG_TABLE_NAME = 'canvases' THEN
    SELECT organization_id INTO parent_org
    FROM public.canvas_projects
    WHERE id = NEW.project_id;
  ELSIF TG_TABLE_NAME IN ('canvas_nodes', 'canvas_edges') THEN
    SELECT organization_id INTO parent_org
    FROM public.canvases
    WHERE id = NEW.canvas_id;
  END IF;

  IF parent_org IS NULL THEN
    RAISE EXCEPTION 'parent row not found for organization check';
  END IF;

  IF NEW.organization_id IS DISTINCT FROM parent_org THEN
    RAISE EXCEPTION 'organization_id must match the parent project/canvas';
  END IF;

  IF TG_TABLE_NAME IN ('canvas_nodes', 'canvas_edges') THEN
    IF NEW.project_id IS DISTINCT FROM (
      SELECT project_id FROM public.canvases WHERE id = NEW.canvas_id
    ) THEN
      RAISE EXCEPTION 'project_id must match the parent canvas';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER canvas_projects_lock_org
  BEFORE UPDATE ON public.canvas_projects
  FOR EACH ROW EXECUTE FUNCTION public.canvas_lock_organization_id();

CREATE TRIGGER canvases_lock_org
  BEFORE UPDATE ON public.canvases
  FOR EACH ROW EXECUTE FUNCTION public.canvas_lock_organization_id();

CREATE TRIGGER canvas_nodes_lock_org
  BEFORE UPDATE ON public.canvas_nodes
  FOR EACH ROW EXECUTE FUNCTION public.canvas_lock_organization_id();

CREATE TRIGGER canvas_edges_lock_org
  BEFORE UPDATE ON public.canvas_edges
  FOR EACH ROW EXECUTE FUNCTION public.canvas_lock_organization_id();

CREATE TRIGGER canvases_enforce_parent_org
  BEFORE INSERT OR UPDATE ON public.canvases
  FOR EACH ROW EXECUTE FUNCTION public.canvas_enforce_parent_organization();

CREATE TRIGGER canvas_nodes_enforce_parent_org
  BEFORE INSERT OR UPDATE ON public.canvas_nodes
  FOR EACH ROW EXECUTE FUNCTION public.canvas_enforce_parent_organization();

CREATE TRIGGER canvas_edges_enforce_parent_org
  BEFORE INSERT OR UPDATE ON public.canvas_edges
  FOR EACH ROW EXECUTE FUNCTION public.canvas_enforce_parent_organization();

-- ── Privileges: authenticated members only. No anon. No PUBLIC. ─────────────

REVOKE ALL ON TABLE public.canvas_projects FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.canvases FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.canvas_nodes FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.canvas_edges FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.canvas_projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.canvases TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.canvas_nodes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.canvas_edges TO authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.canvas_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canvases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canvas_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canvas_edges ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.canvas_projects FORCE ROW LEVEL SECURITY;
ALTER TABLE public.canvases FORCE ROW LEVEL SECURITY;
ALTER TABLE public.canvas_nodes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.canvas_edges FORCE ROW LEVEL SECURITY;

-- Projects
CREATE POLICY canvas_projects_select_member
  ON public.canvas_projects FOR SELECT TO authenticated
  USING (public.is_organization_member((select auth.uid()), organization_id));

CREATE POLICY canvas_projects_insert_member
  ON public.canvas_projects FOR INSERT TO authenticated
  WITH CHECK (
    public.is_organization_member((select auth.uid()), organization_id)
    AND created_by = (select auth.uid())
  );

CREATE POLICY canvas_projects_update_member
  ON public.canvas_projects FOR UPDATE TO authenticated
  USING (public.is_organization_member((select auth.uid()), organization_id))
  WITH CHECK (public.is_organization_member((select auth.uid()), organization_id));

CREATE POLICY canvas_projects_delete_member
  ON public.canvas_projects FOR DELETE TO authenticated
  USING (public.is_organization_member((select auth.uid()), organization_id));

-- Canvases
CREATE POLICY canvases_select_member
  ON public.canvases FOR SELECT TO authenticated
  USING (public.is_organization_member((select auth.uid()), organization_id));

CREATE POLICY canvases_insert_member
  ON public.canvases FOR INSERT TO authenticated
  WITH CHECK (public.is_organization_member((select auth.uid()), organization_id));

CREATE POLICY canvases_update_member
  ON public.canvases FOR UPDATE TO authenticated
  USING (public.is_organization_member((select auth.uid()), organization_id))
  WITH CHECK (public.is_organization_member((select auth.uid()), organization_id));

CREATE POLICY canvases_delete_member
  ON public.canvases FOR DELETE TO authenticated
  USING (public.is_organization_member((select auth.uid()), organization_id));

-- Nodes
CREATE POLICY canvas_nodes_select_member
  ON public.canvas_nodes FOR SELECT TO authenticated
  USING (public.is_organization_member((select auth.uid()), organization_id));

CREATE POLICY canvas_nodes_insert_member
  ON public.canvas_nodes FOR INSERT TO authenticated
  WITH CHECK (public.is_organization_member((select auth.uid()), organization_id));

CREATE POLICY canvas_nodes_update_member
  ON public.canvas_nodes FOR UPDATE TO authenticated
  USING (public.is_organization_member((select auth.uid()), organization_id))
  WITH CHECK (public.is_organization_member((select auth.uid()), organization_id));

CREATE POLICY canvas_nodes_delete_member
  ON public.canvas_nodes FOR DELETE TO authenticated
  USING (public.is_organization_member((select auth.uid()), organization_id));

-- Edges
CREATE POLICY canvas_edges_select_member
  ON public.canvas_edges FOR SELECT TO authenticated
  USING (public.is_organization_member((select auth.uid()), organization_id));

CREATE POLICY canvas_edges_insert_member
  ON public.canvas_edges FOR INSERT TO authenticated
  WITH CHECK (public.is_organization_member((select auth.uid()), organization_id));

CREATE POLICY canvas_edges_update_member
  ON public.canvas_edges FOR UPDATE TO authenticated
  USING (public.is_organization_member((select auth.uid()), organization_id))
  WITH CHECK (public.is_organization_member((select auth.uid()), organization_id));

CREATE POLICY canvas_edges_delete_member
  ON public.canvas_edges FOR DELETE TO authenticated
  USING (public.is_organization_member((select auth.uid()), organization_id));
