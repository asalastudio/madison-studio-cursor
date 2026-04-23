-- Paper-Doll Lane (Lane A) — schema additions to best_bottles_pipeline_groups
--
-- Adds governance for the modular paper-doll workflow alongside the existing
-- hero-image (Lane B) governance on the same table.
--
-- Changes:
--   1. Rename `is_master_reference` -> `is_hero_reference`. This column has
--      always meant "hero master reference for Consistency Mode" (Lane B);
--      the rename makes that explicit now that Lane A introduces a second,
--      distinct kind of master reference (the clear body used for material
--      variant derivation).
--   2. Add `is_clear_master_reference BOOLEAN` — Lane A's clear-glass body
--      master, pinned per shape group, used as the reference-image input to
--      gpt-image-2 when deriving cobalt/amber/frosted/swirl variants.
--   3. Add `geometry_spec JSONB` — paper-doll canvas + anchor contract
--      combined with physical-mm measurements for the shape group. Written
--      during ingest of the local script's output folder. See
--      docs/product-image-system/local-script-handoff.md for the JSON shape.
--
-- Existing rows preserve their data through the rename. The two new columns
-- default to safe "not set" values (FALSE and NULL). No data migration step
-- is required.

-- ─── 1. Rename is_master_reference -> is_hero_reference ─────────────────────

ALTER TABLE public.best_bottles_pipeline_groups
  RENAME COLUMN is_master_reference TO is_hero_reference;

ALTER INDEX public.idx_best_bottles_pipeline_one_master_per_shape
  RENAME TO idx_best_bottles_pipeline_one_hero_per_shape;

COMMENT ON COLUMN public.best_bottles_pipeline_groups.is_hero_reference IS
  'Operator-pinned hero-image master reference for Lane B (Consistency Mode).
At most one row per (org, family, capacity_ml, thread_size) shape group may
have this set. When set, the Pipeline Launch button uses this row''s
legacy_hero_image_url as the master reference for Consistency Mode; otherwise
falls back to the first row in the group with a URL. Independent of
is_clear_master_reference, which governs Lane A (paper-doll).';

-- ─── 2. Add is_clear_master_reference ──────────────────────────────────────

ALTER TABLE public.best_bottles_pipeline_groups
  ADD COLUMN IF NOT EXISTS is_clear_master_reference BOOLEAN NOT NULL DEFAULT FALSE;

-- Partial unique index mirroring the existing hero-reference index: at most
-- one clear-master row per shape group. COALESCE handles NULL shape-key cols
-- so NULL values collide as equal (Postgres otherwise treats NULL as
-- distinct, which would let two rows be pinned within a group where
-- capacity_ml or thread_size is NULL).
CREATE UNIQUE INDEX IF NOT EXISTS idx_best_bottles_pipeline_one_clear_master_per_shape
  ON public.best_bottles_pipeline_groups (
    organization_id,
    family,
    COALESCE(capacity_ml, -1),
    COALESCE(thread_size, '')
  )
  WHERE is_clear_master_reference = TRUE;

COMMENT ON COLUMN public.best_bottles_pipeline_groups.is_clear_master_reference IS
  'Operator-pinned clear-glass body master for Lane A (paper-doll). At most
one row per (org, family, capacity_ml, thread_size) shape group may have
this set. When set, this row''s ingested clear-body PNG is the reference
image passed to gpt-image-2 when deriving cobalt/amber/frosted/swirl
variants. Independent of is_hero_reference, which governs Lane B.';

-- ─── 3. Add geometry_spec ──────────────────────────────────────────────────

ALTER TABLE public.best_bottles_pipeline_groups
  ADD COLUMN IF NOT EXISTS geometry_spec JSONB;

COMMENT ON COLUMN public.best_bottles_pipeline_groups.geometry_spec IS
  'Paper-doll canvas contract + physical-mm measurements for the row''s
shape group. JSONB blob with keys: canonicalCanvas {widthPx, heightPx},
centerXLocked, bottomAnchor {y, toleranceY}, threadSize, neckOuterMm,
bodyDimensionsMm {height, width}, capHeightMm, fitmentSeatDepthMm
{<fitmentType>: mm}, anchorVersion, source. Populated by the Paper-Doll
Drawer at ingest time from the local script''s manifest.json merged with
Madison-side per-family physical-mm defaults. See
docs/product-image-system/local-script-handoff.md and schema.md for the
exact shape. NULL means this shape group has not been ingested for
paper-doll yet.';
