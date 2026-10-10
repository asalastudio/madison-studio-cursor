\set ON_ERROR_STOP on
-- Run against a local Supabase stack after migrations:
--   psql "$LOCAL_DB_URL" -f supabase/tests/dam_storage_org_scoped_select.test.sql
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(7);

SELECT ok(NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
  AND policyname IN ('dam_assets_public_read','dam_thumbnails_public_read')), 'legacy public-read policies are gone');

SELECT ok(NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
  AND cmd IN ('SELECT','ALL') AND 'anon' = ANY(roles)
  AND (qual LIKE '%dam-assets%' OR qual LIKE '%dam-thumbnails%')), 'no anon SELECT on DAM buckets');

SELECT ok(NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
  AND cmd IN ('SELECT','ALL') AND 'public' = ANY(roles)
  AND (qual LIKE '%dam-assets%' OR qual LIKE '%dam-thumbnails%')), 'no PUBLIC-role SELECT on DAM buckets');

-- Behavioural check with two orgs and one member of org A.
INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-0000000000a1','a@test.local');
INSERT INTO public.organizations (id, name, created_by) VALUES
  ('00000000-0000-0000-0000-00000000000a','Org A','00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-00000000000b','Org B','00000000-0000-0000-0000-0000000000a1');
INSERT INTO public.organization_members (organization_id, user_id, role) VALUES
  ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a1','owner');
INSERT INTO storage.buckets (id, name, public) VALUES ('dam-assets','dam-assets',true),('dam-thumbnails','dam-thumbnails',true)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.objects (bucket_id, name) VALUES
  ('dam-assets','00000000-0000-0000-0000-00000000000a/a.png'),
  ('dam-assets','00000000-0000-0000-0000-00000000000b/b.png'),
  ('dam-thumbnails','00000000-0000-0000-0000-00000000000b/b.webp');

SET LOCAL ROLE anon;
SELECT is((SELECT count(*) FROM storage.objects WHERE bucket_id IN ('dam-assets','dam-thumbnails')), 0::bigint, 'anon cannot list DAM objects');
RESET ROLE;

SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM storage.objects WHERE bucket_id='dam-assets'), 1::bigint, 'member sees only own-org dam-assets');
SELECT is((SELECT name FROM storage.objects WHERE bucket_id='dam-assets'), '00000000-0000-0000-0000-00000000000a/a.png', 'the visible object is org A''s');
SELECT is((SELECT count(*) FROM storage.objects WHERE bucket_id='dam-thumbnails'), 0::bigint, 'member cannot see other-org thumbnails');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
