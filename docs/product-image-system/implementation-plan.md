# Implementation Plan — Paper-Doll Lane (Pilot)

Executable step-by-step plan. Each numbered step is one logical commit.

## Branch

`feature/product-image-system-pilot` — already created on disk.

## Commit 1 — Docs ✅ (in progress)

Files:
- `docs/product-image-system/PRD.md` (rewritten)
- `docs/product-image-system/madison-integration-map.md` (superseded banner added)
- `docs/product-image-system/schema.md` (superseded banner added)
- `docs/product-image-system/prompt-pack.md` (`gpt-image-2` note added)
- `docs/product-image-system/qc.md` (new)
- `docs/product-image-system/local-script-handoff.md` (new)
- `docs/product-image-system/implementation-plan.md` (this file)

## Commit 2 — SQL migration

One file: `supabase/migrations/<timestamp>_paper_doll_pipeline.sql`

- Rename `is_master_reference` → `is_hero_reference` + rename partial index
- Add `is_clear_master_reference BOOLEAN NOT NULL DEFAULT FALSE` + partial unique index
- Add `geometry_spec JSONB`
- Add column comments pointing at docs

Apply locally: `supabase db push` (dev database). No existing data loss; data carries through rename.

## Commit 3 — Types + config

New files:
- `src/lib/product-image/types.ts` — `EnvironmentPlate`, `GeometrySpec`, `ComponentManifest`, `QcResult`, `QcCheck`. Nothing else. Each type tight and documented.
- `src/config/productImageEnvironment.ts` — registers `parchment_cream_v1` (`#EEE6D4`) as the one-and-only plate.
- `src/config/productImageGeometry.ts` — hardcoded `cyl_9ml_v1` record using the real v8.3 numbers (body 70 × 20 mm, cap 13 mm, thread `17-415` → neck outer 17 mm, fitment seat depth defaults per fitment type).

Extensions (narrow):
- `src/lib/bestBottlesPipeline.ts` — rename `is_master_reference` → `is_hero_reference` across the existing helpers (5 call sites + type); add `is_clear_master_reference: boolean` and `geometry_spec: GeometrySpec | null` to `PipelineGroup`; add new helpers mirroring the existing master-reference helpers:
  - `getGeometrySpec(rowId)` / `setGeometrySpec(rowId, spec)`
  - `setClearMasterReference({ organizationId, rowId, family, capacityMl, threadSize })`
  - `clearClearMasterReference(rowId)`

## Commit 4 — Prompt builders + QC

New files:
- `src/lib/product-image/promptBuilders.ts` — builders for every entry in `prompt-pack.md`. Each builder takes a narrow input (family + variant + optional retry reason) and returns `{ prompt, mode: "thinking" | "instant", referenceImageRequired: boolean }`.
- `src/lib/product-image/qc.ts` — `runBodyQc`, `runVariantQc`, `runComponentQc`, `runAssemblyQc`. Deterministic checks implemented via a small pixel-sampler helper; heuristic checks stubbed per `qc.md` §4.

## Commit 5 — UI components

New files under `src/components/product-image/`:
- `PaperDollDrawer.tsx` — the shadcn `Sheet`-based side drawer, opened from the pipeline row.
- `PaperDollIngestDropzone.tsx` — drag-drop surface for the local script's output folder. Parses `manifest.json`, validates against the shape group, uploads PNGs to Supabase Storage.
- `FamilySpecCard.tsx` — readout of family / capacity / thread / anchors / environment plate.
- `VariantLineupPreview.tsx` — five-tile lineup (clear + cobalt + amber + frosted + swirl), each with status badge.
- `AssemblyPreviewCard.tsx` — body + fitment + cap assembly preview.

## Commit 6 — Pipeline page wiring

Extend `src/pages/BestBottlesPipeline.tsx`:
- Apply `is_master_reference` → `is_hero_reference` rename at the 5 call sites.
- Add a **Paper-Doll** button on `ShapeGroupCard`, beside the existing **Launch** button.
- Wire the button to `PaperDollDrawer`, passing the shape group as props.
- No other changes. Lane B (Launch → Consistency Mode) behavior is unchanged.

## Acceptance checklist

1. `tsc` passes.
2. `eslint` passes.
3. Supabase migration applies cleanly on the dev DB (`supabase db push`).
4. Existing Best Bottles Pipeline page loads without regressions; hero-image
   master-reference pin still works (just under a renamed flag).
5. Clicking **Paper-Doll** on a cyl-9ml shape group opens the drawer; the
   `FamilySpecCard` reads `Cylinder / 9 ml / 17-415` from the existing row
   plus hardcoded physical mm from config.
6. Dropping a mock folder (bottle.png + manifest.json for cyl-9ml) into the
   dropzone successfully parses, validates, and uploads — no errors.
7. Dropping a folder with a mismatched `family` or `capacityMl` surfaces a
   clear rejection, performs no writes.
8. Prompt builders return expected strings for all variants, each tagged
   with the correct `gpt-image-2` mode.
9. QC `runBodyQc` rejects a test image with a white background;
   `runVariantQc` rejects a test image with a shifted center.

## Explicitly NOT in this PR

- Actual `gpt-image-2` invocation. Prompt + payload are built; the call is
  a TODO pointing at a dedicated future PR so wiring the model is
  observable.
- Actual Supabase Storage bucket configuration. Code assumes a bucket named
  `product-image-ingest` exists; the bucket creation migration / RLS is a
  separate, reviewable piece of work.
- JSON import of the v8.3 catalog (Phase 2).
- Sanity / Convex / Shopify writeback for approved paper-doll outputs
  (Phase 3).
- `.psd` upload endpoint that runs the script as an edge function (Phase 4).

## If any commit fails

Each commit is independently revertible. Commits 3–6 depend on the SQL
migration in commit 2, so if the migration has to be rolled back, the code
from commits 3–6 compiles and runs but the helpers that hit the new
columns will fail at runtime. Nothing that already shipped breaks.
