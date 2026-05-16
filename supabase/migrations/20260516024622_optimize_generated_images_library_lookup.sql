-- Speed up Image Library queries:
--   where organization_id = ?
--     and is_archived = false
--   order by created_at desc
--
-- The fallback user query has the same shape. Partial indexes keep archived
-- rows out of the hot path while preserving the existing table/API shape.
create index if not exists idx_generated_images_org_active_created_at
  on public.generated_images (organization_id, created_at desc)
  where is_archived = false;

create index if not exists idx_generated_images_user_active_created_at
  on public.generated_images (user_id, created_at desc)
  where is_archived = false;
