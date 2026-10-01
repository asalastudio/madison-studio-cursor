-- Give Tarife Attar its own Sanity connection so blog publishes no longer
-- inherit the shared SANITY_PROJECT_ID / SANITY_WRITE_TOKEN pair (now used
-- by Best Bottles). The token stays in the SANITY_API_TOKEN secret — the
-- name from the original Tarife setup docs — never in this table.
--
-- Idempotent: skips orgs that already have an active connection.

insert into public.sanity_connections (
  organization_id,
  project_id,
  dataset,
  studio_url,
  api_version,
  write_token_secret_name,
  schema_profile,
  is_active
)
select
  o.id,
  '8h5l91ut',
  'production',
  'https://www.tarifeattar.com/studio',
  '2024-01-01',
  'SANITY_API_TOKEN',
  'generic',
  true
from public.organizations o
where (
  o.name ilike '%Tarife Attar%'
  or o.name ilike '%Tarife Attär%'
)
and not exists (
  select 1
  from public.sanity_connections sc
  where sc.organization_id = o.id
    and sc.is_active = true
);
