-- Storage RLS: scope generated-images and brand-documents writes to the
-- caller's organization. Both buckets previously allowed any authenticated
-- user to write (and, for generated-images, delete) files in ANY org's
-- folder — the policies checked only bucket_id. This mirrors the existing,
-- correct brand-assets policies (foldername[1] must be an org the user
-- belongs to). Safe because: client uploads already use
-- "<organizationId>/<file>", and every generated-images write comes from an
-- edge function on the service role, which bypasses RLS.

-- generated-images: upload (was: bucket_id only)
DROP POLICY IF EXISTS "Users can upload images for their organization" ON storage.objects;
CREATE POLICY "Users can upload images for their organization"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'generated-images'
    AND (storage.foldername(name))[1] IN (
      SELECT o.id::text FROM public.organizations o
      WHERE public.is_organization_member(auth.uid(), o.id)
    )
  );

-- generated-images: delete (was: bucket_id only)
DROP POLICY IF EXISTS "Users can delete their organization's images" ON storage.objects;
CREATE POLICY "Users can delete their organization's images"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'generated-images'
    AND (storage.foldername(name))[1] IN (
      SELECT o.id::text FROM public.organizations o
      WHERE public.is_organization_member(auth.uid(), o.id)
    )
  );

-- brand-documents: upload (was: any authenticated user, any path)
DROP POLICY IF EXISTS "Organization members can upload brand documents" ON storage.objects;
CREATE POLICY "Organization members can upload brand documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'brand-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT o.id::text FROM public.organizations o
      WHERE public.is_organization_member(auth.uid(), o.id)
    )
  );

-- brand-documents: update (was: any authenticated user, and no WITH CHECK)
DROP POLICY IF EXISTS "Organization members can update brand documents" ON storage.objects;
CREATE POLICY "Organization members can update brand documents"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'brand-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT o.id::text FROM public.organizations o
      WHERE public.is_organization_member(auth.uid(), o.id)
    )
  )
  WITH CHECK (
    bucket_id = 'brand-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT o.id::text FROM public.organizations o
      WHERE public.is_organization_member(auth.uid(), o.id)
    )
  );

-- Image Library hot path:
--   WHERE organization_id = ? AND is_archived = false ORDER BY created_at DESC
-- (and the user-scoped fallback of the same shape). The existing
-- idx_generated_images_library places saved_to_library between the org and
-- created_at columns, so it does not serve this predicate cleanly. These
-- partial indexes match it exactly. ~14k rows: the build lock is momentary.
CREATE INDEX IF NOT EXISTS idx_generated_images_org_active
  ON public.generated_images (organization_id, created_at DESC)
  WHERE is_archived = false;

CREATE INDEX IF NOT EXISTS idx_generated_images_user_active
  ON public.generated_images (user_id, created_at DESC)
  WHERE is_archived = false;
