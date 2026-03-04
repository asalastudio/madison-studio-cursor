-- ═══════════════════════════════════════════════════════════════════════════════
-- THE PRESS - STORAGE BUCKETS SETUP
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- This migration sets up storage buckets for The Press packaging design studio.
-- Creates buckets for dieline templates, packaging artwork, and exports.
--
-- Created: February 13, 2026
-- ═══════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════
-- BUCKET CREATION
-- ═══════════════════════════════════════════════════════════════════════════════

-- Bucket 1: press-dielines (dieline template files - SVG/PDF)
-- Settings:
--   - Public: true (dielines need to be accessible for canvas rendering)
--   - File size limit: 10485760 (10MB)
--   - Allowed MIME types: SVG, PDF

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'press-dielines',
  'press-dielines',
  true,
  10485760,
  ARRAY['image/svg+xml', 'application/pdf']
) ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Bucket 2: press-artwork (artwork files applied to packaging)
-- Settings:
--   - Public: true (artwork needs to be accessible)
--   - File size limit: 52428800 (50MB - high-res images for print)
--   - Allowed MIME types: images only

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'press-artwork',
  'press-artwork',
  true,
  52428800,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/tiff', 'image/svg+xml']
) ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Bucket 3: press-exports (exported print-ready PDFs and preview images)
-- Settings:
--   - Public: true (exports need to be downloadable)
--   - File size limit: 104857600 (100MB - large print-ready PDFs)
--   - Allowed MIME types: PDF, PNG, SVG

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'press-exports',
  'press-exports',
  true,
  104857600,
  ARRAY['application/pdf', 'image/png', 'image/svg+xml']
) ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Bucket 4: press-thumbnails (project thumbnails and previews)
-- Settings:
--   - Public: true (thumbnails need to be accessible)
--   - File size limit: 5242880 (5MB)
--   - Allowed MIME types: images only

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'press-thumbnails',
  'press-thumbnails',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
) ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ═══════════════════════════════════════════════════════════════════════════════
-- STORAGE POLICIES - PRESS-DIELINES
-- Path structure: {organization_id}/{template_id}.svg OR madison-library/{template_id}.svg
-- ═══════════════════════════════════════════════════════════════════════════════

-- Allow public read access (for rendering dielines in canvas)
CREATE POLICY "press_dielines_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'press-dielines');

-- Allow authenticated users to upload to their organization's folder
CREATE POLICY "press_dielines_org_insert"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'press-dielines'
  AND auth.role() = 'authenticated'
  AND (
    storage.user_has_org_access(SPLIT_PART(name, '/', 1))
    OR name LIKE 'madison-library/%'
  )
);

-- Allow authenticated users to update files in their organization's folder
CREATE POLICY "press_dielines_org_update"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'press-dielines'
  AND auth.role() = 'authenticated'
  AND storage.user_has_org_access(SPLIT_PART(name, '/', 1))
);

-- Allow authenticated users to delete files in their organization's folder
CREATE POLICY "press_dielines_org_delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'press-dielines'
  AND auth.role() = 'authenticated'
  AND storage.user_has_org_access(SPLIT_PART(name, '/', 1))
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- STORAGE POLICIES - PRESS-ARTWORK
-- Path structure: {organization_id}/{project_id}/{filename}
-- ═══════════════════════════════════════════════════════════════════════════════

-- Allow public read access (for rendering artwork in canvas)
CREATE POLICY "press_artwork_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'press-artwork');

-- Allow authenticated users to upload to their organization's folder
CREATE POLICY "press_artwork_org_insert"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'press-artwork'
  AND auth.role() = 'authenticated'
  AND storage.user_has_org_access(SPLIT_PART(name, '/', 1))
);

-- Allow authenticated users to update files in their organization's folder
CREATE POLICY "press_artwork_org_update"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'press-artwork'
  AND auth.role() = 'authenticated'
  AND storage.user_has_org_access(SPLIT_PART(name, '/', 1))
);

-- Allow authenticated users to delete files in their organization's folder
CREATE POLICY "press_artwork_org_delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'press-artwork'
  AND auth.role() = 'authenticated'
  AND storage.user_has_org_access(SPLIT_PART(name, '/', 1))
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- STORAGE POLICIES - PRESS-EXPORTS
-- Path structure: {organization_id}/{project_id}/{export_id}.{format}
-- ═══════════════════════════════════════════════════════════════════════════════

-- Allow public read access (for downloading exports)
CREATE POLICY "press_exports_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'press-exports');

-- Allow authenticated users to upload to their organization's folder
CREATE POLICY "press_exports_org_insert"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'press-exports'
  AND auth.role() = 'authenticated'
  AND storage.user_has_org_access(SPLIT_PART(name, '/', 1))
);

-- Allow authenticated users to delete exports in their organization's folder
CREATE POLICY "press_exports_org_delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'press-exports'
  AND auth.role() = 'authenticated'
  AND storage.user_has_org_access(SPLIT_PART(name, '/', 1))
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- STORAGE POLICIES - PRESS-THUMBNAILS
-- Path structure: {organization_id}/{project_id}.jpg
-- ═══════════════════════════════════════════════════════════════════════════════

-- Allow public read access (for displaying project thumbnails)
CREATE POLICY "press_thumbnails_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'press-thumbnails');

-- Allow service role and org members to insert thumbnails
CREATE POLICY "press_thumbnails_org_insert"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'press-thumbnails'
  AND (
    auth.role() = 'service_role'
    OR (
      auth.role() = 'authenticated'
      AND storage.user_has_org_access(SPLIT_PART(name, '/', 1))
    )
  )
);

-- Allow service role and org members to update thumbnails
CREATE POLICY "press_thumbnails_org_update"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'press-thumbnails'
  AND (
    auth.role() = 'service_role'
    OR (
      auth.role() = 'authenticated'
      AND storage.user_has_org_access(SPLIT_PART(name, '/', 1))
    )
  )
);

-- Allow deletion by org members
CREATE POLICY "press_thumbnails_org_delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'press-thumbnails'
  AND auth.role() = 'authenticated'
  AND storage.user_has_org_access(SPLIT_PART(name, '/', 1))
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- COMPLETE
-- ═══════════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE storage.buckets IS 'The Press storage buckets created: press-dielines, press-artwork, press-exports, press-thumbnails';
