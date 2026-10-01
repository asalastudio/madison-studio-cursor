-- The first Tarife connection migration only inserts when no active row
-- exists. A row that already points at the Best Bottles project, or that
-- names SANITY_WRITE_TOKEN, still publishes with a token Sanity rejects:
-- "Unauthorized - Session does not match project host".
--
-- Point those Tarife rows at project 8h5l91ut and the SANITY_API_TOKEN
-- secret. Leave any other organization's connection alone.

update public.sanity_connections sc
set
  project_id = '8h5l91ut',
  dataset = case when sc.dataset is null or btrim(sc.dataset) = '' then 'production' else sc.dataset end,
  write_token_secret_name = 'SANITY_API_TOKEN',
  schema_profile = case
    when sc.schema_profile = 'best-bottles' then 'generic'
    else sc.schema_profile
  end
from public.organizations o
where sc.organization_id = o.id
  and sc.is_active = true
  and (
    o.name ilike '%Tarife Attar%'
    or o.name ilike '%Tarife Attär%'
  )
  and (
    sc.project_id is distinct from '8h5l91ut'
    or sc.write_token_secret_name is distinct from 'SANITY_API_TOKEN'
    or sc.schema_profile = 'best-bottles'
  );
