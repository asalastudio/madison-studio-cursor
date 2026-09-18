-- The status view selects r.*. Recreate it so the appended detector columns
-- are exposed to the Image Library and editor without changing column order.
drop view if exists public.best_bottles_image_reconciliation_status;

alter table public.best_bottles_image_reconciliations
  add column if not exists pre_transform_shoulder_y_px double precision,
  add column if not exists detected_shoulder_y_px double precision,
  add column if not exists target_shoulder_y_px double precision,
  add column if not exists shoulder_delta_pct double precision,
  add column if not exists shoulder_confidence double precision;

alter table public.best_bottles_image_reconciliations
  drop constraint if exists best_bottles_image_reconciliations_shoulder_confidence_check;

alter table public.best_bottles_image_reconciliations
  add constraint best_bottles_image_reconciliations_shoulder_confidence_check
  check (
    shoulder_confidence is null
    or (shoulder_confidence >= 0 and shoulder_confidence <= 1)
  );

comment on column public.best_bottles_image_reconciliations.pre_transform_shoulder_y_px
  is 'Glass shoulder landmark measured on provider pixels before deterministic rigging.';
comment on column public.best_bottles_image_reconciliations.detected_shoulder_y_px
  is 'Glass shoulder landmark re-detected on final rigged pixels.';
comment on column public.best_bottles_image_reconciliations.target_shoulder_y_px
  is 'Locked glass shoulder Y coordinate for the final canvas.';
comment on column public.best_bottles_image_reconciliations.shoulder_delta_pct
  is 'Final detected shoulder Y minus target Y in canvas percentage points.';
comment on column public.best_bottles_image_reconciliations.shoulder_confidence
  is 'Final shoulder landmark detector confidence from 0 to 1.';

create or replace view public.best_bottles_image_reconciliation_status
with (security_invoker = true)
as
with assignment_facts as (
  select
    a.image_id,
    a.id as assignment_id,
    a.sku_job_id,
    a.decision,
    a.link_source,
    a.expected_image_url,
    a.shopify_verification_state,
    a.shopify_verified_image_url,
    a.shopify_verified_image_hash,
    a.shopify_verified_at,
    a.shopify_verification_error,
    a.convex_verification_state,
    a.convex_verified_image_url,
    a.convex_verified_image_hash,
    a.convex_verified_at,
    a.convex_verification_error,
    a.linked_at,
    a.reviewed_at,
    j.grace_sku as job_grace_sku,
    j.website_sku as job_website_sku,
    j.status as sku_job_status,
    j.generated_image_id,
    j.approved_image_id,
    j.shopify_pushed_at,
    j.convex_synced_at,
    (j.generated_image_id = a.image_id or j.approved_image_id = a.image_id) as pipeline_image_matches,
    (j.approved_image_id = a.image_id and a.decision = 'approved-keep') as assignment_approved,
    (j.shopify_pushed_at is not null) as shopify_write_recorded,
    (j.convex_synced_at is not null) as convex_write_recorded
  from public.best_bottles_pipeline_sku_images a
  join public.best_bottles_pipeline_sku_jobs j on j.id = a.sku_job_id
  where a.decision <> 'superseded'
), assignment_rollup as (
  select
    image_id,
    count(*)::integer as assignment_count,
    jsonb_agg(
      jsonb_build_object(
        'assignmentId', assignment_id,
        'skuJobId', sku_job_id,
        'graceSku', job_grace_sku,
        'websiteSku', job_website_sku,
        'decision', decision,
        'linkSource', link_source,
        'expectedImageUrl', expected_image_url,
        'skuJobStatus', sku_job_status,
        'generatedImageId', generated_image_id,
        'approvedImageId', approved_image_id,
        'shopifyPushedAt', shopify_pushed_at,
        'convexSyncedAt', convex_synced_at,
        'shopifyVerificationState', shopify_verification_state,
        'shopifyVerifiedImageUrl', shopify_verified_image_url,
        'shopifyVerifiedImageHash', shopify_verified_image_hash,
        'shopifyVerifiedAt', shopify_verified_at,
        'shopifyVerificationError', shopify_verification_error,
        'convexVerificationState', convex_verification_state,
        'convexVerifiedImageUrl', convex_verified_image_url,
        'convexVerifiedImageHash', convex_verified_image_hash,
        'convexVerifiedAt', convex_verified_at,
        'convexVerificationError', convex_verification_error,
        'linkedAt', linked_at,
        'reviewedAt', reviewed_at
      ) order by linked_at
    ) as assignments,
    bool_and(pipeline_image_matches) as all_pipeline_images_match,
    bool_and(assignment_approved) as all_assignments_approved,
    bool_or(assignment_approved) as any_assignment_approved,
    bool_and(shopify_write_recorded) as all_shopify_writes_recorded,
    bool_and(shopify_verification_state = 'matched') as all_shopify_verified,
    bool_and(convex_write_recorded) as all_convex_writes_recorded,
    bool_and(convex_verification_state = 'matched') as all_convex_verified,
    bool_or(
      shopify_verification_state in ('mismatch', 'error')
      or convex_verification_state in ('mismatch', 'error')
    ) as any_destination_mismatch
  from assignment_facts
  group by image_id
)
select
  r.*,
  coalesce(ar.assignment_count, 0) as assignment_count,
  coalesce(ar.assignments, '[]'::jsonb) as assignments,
  coalesce(ar.all_pipeline_images_match, false) as all_pipeline_images_match,
  coalesce(ar.all_assignments_approved, false) as all_assignments_approved,
  coalesce(ar.any_assignment_approved, false) as any_assignment_approved,
  coalesce(ar.all_shopify_writes_recorded, false) as all_shopify_writes_recorded,
  coalesce(ar.all_shopify_verified, false) as all_shopify_verified,
  coalesce(ar.all_convex_writes_recorded, false) as all_convex_writes_recorded,
  coalesce(ar.all_convex_verified, false) as all_convex_verified,
  coalesce(ar.any_destination_mismatch, false) as any_destination_mismatch,
  coalesce(g.library_tags, '{}'::text[]) @> array['status:approved-keep']::text[] as library_approved,
  case
    when not r.requires_pipeline_reconciliation then 'library-only'
    when r.lifecycle_state in ('failed', 'qa-failed') then 'qa-failed'
    when r.catalog_truth is null or nullif(r.catalog_truth->>'websiteTruthStatus', '') is null then 'truth-missing'
    when r.catalog_truth->>'websiteTruthStatus' not in ('ready', 'alias_exception')
      or r.catalog_truth->>'identityStatus' is distinct from 'ready'
      or coalesce(jsonb_array_length(r.catalog_truth->'identityBlockers'), 0) > 0 then 'truth-conflict'
    when r.detected_baseline_y_px is null or r.target_baseline_y_px is null then 'measurement-missing'
    when lower(coalesce(r.family, '')) in ('cylinder', 'tall cylinder')
      and (
        r.detected_shoulder_y_px is null
        or r.target_shoulder_y_px is null
        or abs(coalesce(r.shoulder_delta_pct, 999)) > 1
      ) then 'measurement-missing'
    when r.lifecycle_state in ('raw-generated', 'rigging') then 'rig-pending'
    when not public.best_bottles_shadow_evidence_passes(
      r.family,
      r.prompt_version,
      r.shadow_owner,
      r.shadow_topology,
      r.shadow_qa
    ) then 'review-pending'
    when coalesce(ar.assignment_count, 0) = 0 then 'unlinked'
    when not coalesce(ar.all_pipeline_images_match, false) then 'pipeline-image-mismatch'
    when coalesce(ar.any_assignment_approved, false)
      is distinct from (coalesce(g.library_tags, '{}'::text[]) @> array['status:approved-keep']::text[])
      then 'approval-divergence'
    when coalesce(ar.any_destination_mismatch, false) then 'destination-mismatch'
    when not coalesce(ar.all_assignments_approved, false) then 'review-pending'
    when not coalesce(ar.all_shopify_writes_recorded, false) then 'approved-pending-shopify'
    when not coalesce(ar.all_shopify_verified, false) then 'shopify-verification-pending'
    when not coalesce(ar.all_convex_writes_recorded, false) then 'shopify-pending-convex'
    when not coalesce(ar.all_convex_verified, false) then 'convex-verification-pending'
    else 'reconciled'
  end as reconciliation_status,
  (
    r.requires_pipeline_reconciliation
    and r.lifecycle_state not in ('failed', 'qa-failed')
    and r.detected_baseline_y_px is not null
    and r.target_baseline_y_px is not null
    and (
      lower(coalesce(r.family, '')) not in ('cylinder', 'tall cylinder')
      or (
        r.detected_shoulder_y_px is not null
        and r.target_shoulder_y_px is not null
        and abs(coalesce(r.shoulder_delta_pct, 999)) <= 1
      )
    )
    and r.catalog_truth->>'identityStatus' = 'ready'
    and r.catalog_truth->>'websiteTruthStatus' in ('ready', 'alias_exception')
    and coalesce(jsonb_array_length(r.catalog_truth->'identityBlockers'), 0) = 0
    and public.best_bottles_shadow_evidence_passes(
      r.family,
      r.prompt_version,
      r.shadow_owner,
      r.shadow_topology,
      r.shadow_qa
    )
    and coalesce(ar.assignment_count, 0) > 0
    and coalesce(ar.all_pipeline_images_match, false)
    and coalesce(ar.all_assignments_approved, false)
    and coalesce(g.library_tags, '{}'::text[]) @> array['status:approved-keep']::text[]
    and coalesce(ar.all_shopify_writes_recorded, false)
    and coalesce(ar.all_shopify_verified, false)
    and coalesce(ar.all_convex_writes_recorded, false)
    and coalesce(ar.all_convex_verified, false)
  ) as is_reconciled
from public.best_bottles_image_reconciliations r
join public.generated_images g
  on g.id = r.image_id
  and g.organization_id = r.organization_id
left join assignment_rollup ar on ar.image_id = r.image_id;

revoke all on table public.best_bottles_image_reconciliation_status from anon, authenticated;
grant select on table public.best_bottles_image_reconciliation_status to authenticated;
