\set ON_ERROR_STOP on

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(8);

SELECT has_table('public', 'canvas_projects', 'canvas_projects exists');
SELECT has_table('public', 'canvases', 'canvases exists');
SELECT has_table('public', 'canvas_nodes', 'canvas_nodes exists');
SELECT has_table('public', 'canvas_edges', 'canvas_edges exists');

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.canvas_projects'::regclass),
  'canvas_projects has RLS enabled'
);

SELECT is(
  (
    SELECT count(*)::INTEGER
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('canvas_projects', 'canvases', 'canvas_nodes', 'canvas_edges')
      AND (
        qual ILIKE '%true%'
        OR with_check ILIKE '%true%'
        AND qual NOT ILIKE '%is_organization_member%'
      )
  ),
  0,
  'no permissive true policies on canvas tables'
);

SELECT is(
  (
    SELECT count(*)::INTEGER
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('canvas_projects', 'canvases', 'canvas_nodes', 'canvas_edges')
      AND roles::text ILIKE '%service_role%'
  ),
  0,
  'no service-role policies on canvas tables'
);

SELECT is(
  (
    SELECT count(*)::INTEGER
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('canvas_projects', 'canvases', 'canvas_nodes', 'canvas_edges')
      AND qual ILIKE '%is_organization_member%'
  ),
  16,
  'every canvas policy requires organization membership'
);

SELECT * FROM finish();
ROLLBACK;
