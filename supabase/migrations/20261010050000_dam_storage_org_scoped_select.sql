-- Scope SELECT on the dam-assets / dam-thumbnails storage objects to org members.
--
-- Finding: Madison audit archive-vault.md V17 (High). The original policies
-- (20251219211156_dam_storage_buckets.sql) granted SELECT with only
-- `bucket_id = '<bucket>'`, which lets anyone holding the anon key call the
-- storage list API and enumerate every tenant's `<org_id>/` prefixes and
-- filenames.
--
-- Public-bucket object URLs (/storage/v1/object/public/...) are served without
-- RLS, so existing file_url / thumbnail_url links keep working. What changes:
-- list() and createSignedUrl() now require membership in the org that owns the
-- path prefix (upload-dam-asset writes `${organizationId}/${file}`).
-- Service-role edge functions bypass RLS and are unaffected.
--
-- Uses public.get_user_organization_ids() (SECURITY DEFINER, from
-- 20251219211155_dam_foundation.sql), the helper the dam_* table policies use,
-- so this does not depend on storage.user_has_org_access() existing in prod.
-- Idempotent.
--
-- NOT APPLIED. Needs Jordan's explicit OK before running against production.

DROP POLICY IF EXISTS "dam_assets_public_read" ON storage.objects;
DROP POLICY IF EXISTS "dam_thumbnails_public_read" ON storage.objects;

DROP POLICY IF EXISTS "dam_assets_org_select" ON storage.objects;
CREATE POLICY "dam_assets_org_select"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'dam-assets'
  AND SPLIT_PART(name, '/', 1) = ANY (public.get_user_organization_ids()::text[])
);

DROP POLICY IF EXISTS "dam_thumbnails_org_select" ON storage.objects;
CREATE POLICY "dam_thumbnails_org_select"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'dam-thumbnails'
  AND SPLIT_PART(name, '/', 1) = ANY (public.get_user_organization_ids()::text[])
);
