# PRD — Product Image System (Paper-Doll Lane / Lane A)

## Three image lanes — what this PRD is and isn't

Madison Studio has three distinct image-generation surfaces. They are
**intentionally separate** and share infrastructure without sharing governance.

| Lane | Purpose | Status | Primary surface |
|---|---|---|---|
| **A. Paper-Doll Architecture** *(this PRD)* | Modular layered configurator components (body + fitment + cap) that compose into a product-page configurator. Locked geometry, locked environment plate, derived material variants. | **Building now** | Drawer inside `/best-bottles/pipeline` |
| **B. Product Image Grid / Hero Tiles** | Single cinematic front-facing hero per SKU, consistent across the catalog grid. | Shipped | `/best-bottles/pipeline` → Consistency Mode on `/darkroom` |
| **C. General Marketing Imagery** | Editorial brand imagery for web hero banners, social, email. | Shipped | `/create`, `/darkroom` (free mode) |

This document governs **Lane A only.** Lanes B and C are untouched.

## Problem

Bottle SKUs explode combinatorially across shape × capacity × thread × glass
color × fitment × cap. Regenerating each SKU end-to-end is expensive and
produces geometry drift between siblings. The previous attempt (local
extraction pipeline → Google "Nano Banana" generation) failed because the
image model could not preserve geometry during material variation. The model
has since advanced (`gpt-image-2`, April 2026), which is the unlock.

## Current state (from diagnostic zip and repo)

- **Local extraction pipeline** (out of repo, on operator's machine) takes a
  layered PSD and produces aligned, canvas-normalized, background-removed
  component PNGs with a naming convention. This already works.
- **Best Bottles Pipeline** (`src/pages/BestBottlesPipeline.tsx`) is the
  existing hub: CSV-imported catalog, shape-group view, reference sync from
  bestbottles.com, master-reference pinning, status lifecycle (`queued` →
  `generating` → `generated` → `qa-pending` → `approved` → `synced`).
- **Consistency Mode** (`/darkroom` + `src/lib/consistencyMode.ts`) handles
  single-master → many-variant generation for lane B. Not reused by this lane
  because the variants differ semantically (lane B: composition variants of a
  hero; lane A: material variants of a clear master).
- **No geometry contract yet.** The tracker knows family + capacity + thread
  as strings; it does not know canonical canvas pixels, center-X, bottom
  anchor, or physical millimeters.

## New lane — paper-doll workflow

A narrow drawer inside the existing Best Bottles Pipeline page. Per shape
group, a **Paper-Doll** button opens a drawer that does three things:

1. **Ingest.** Drag-drop the local script's output folder (component PNGs +
   `manifest.json`). The drawer matches the folder to the current shape
   group, uploads PNGs to Supabase Storage, and writes `geometry_spec` onto
   the pipeline row.
2. **Generate.** Using `gpt-image-2` in Thinking mode with the clear-body PNG
   as a reference image, derive four material variants (cobalt / amber /
   frosted / swirl) on the locked `#EEE6D4` parchment plate. Preserves
   geometry exactly.
3. **Sign off.** Operator reviews the five-variant lineup, clicks Approve.
   `madison_status` transitions `queued` → `generating` → `generated` →
   `approved`. `madison_approved_image_id` / `madison_approved_at` /
   `madison_approved_by` are filled by existing pipeline helpers.

## User goals

- **Catalog operator** needs to produce a consistent lineup across many SKUs
  without per-SKU art direction.
- **Brand stakeholder** needs guaranteed geometric + environmental
  consistency across every bottle (same scale, center, base, lighting).
- **E-commerce manager** needs material variants that are obviously the same
  physical bottle as the clear master.
- **Engineer** needs a config-driven system where future families require
  data additions, not code changes.

## Scope (this PR)

- Documentation set (this PRD, schema, prompt-pack, QC, implementation-plan,
  local-script-handoff, integration-map) under `docs/product-image-system/`.
- SQL migration that renames `is_master_reference` → `is_hero_reference` and
  adds `is_clear_master_reference BOOLEAN` + `geometry_spec JSONB`.
- Geometry + QC types under `src/lib/product-image/types.ts` (narrow).
- Environment plate + pilot geometry registries under `src/config/`.
- Prompt pack (`gpt-image-2` Thinking mode) under
  `src/lib/product-image/promptBuilders.ts`.
- QC heuristics under `src/lib/product-image/qc.ts`.
- Paper-Doll drawer + supporting components under
  `src/components/product-image/`.
- One additive button on each shape-group card in
  `src/pages/BestBottlesPipeline.tsx`.
- Pilot family: cylindrical 9 ml, hardcoded in TS config.

## Non-goals (this PR)

- New top-level route or page. Everything lives inside the existing pipeline.
- Parallel `BottleFamilySpec` type system. We read from the existing
  `PipelineGroup` row plus the new `geometry_spec` column.
- Live Convex SDK integration. Multi-family geometry comes from a **JSON
  import** (Phase 2) that re-uses the same v8.3 document pushed to Convex.
- Sanity / Convex / Shopify writebacks for paper-doll outputs.
- Real PSD binary parsing in the browser. Parsing stays in the local script.
- Touching Dark Room, Image Editor, Consistency Mode, or Lane C surfaces.

## Decisions locked

1. Final background for bodies in this lane: **`#EEE6D4`** (parchment cream).
   Not transparency. Rendered on plate (Option A).
2. Clear glass is the canonical master. Cobalt / amber / frosted / swirl
   derive from it via `gpt-image-2` Thinking mode with reference image input.
3. **No direct transparency generation** for clear glass body.
4. PSDs are parsed by the operator's local script, not by Madison. Madison
   ingests the script's output folder via a `manifest.json` handshake.
5. Wrong source canvas is a normalization problem solved upstream (local
   script) — Madison validates, does not re-cut.
6. Existing Best Bottles Pipeline lifecycle (`madison_status` column +
   `madison_approved_*` columns) is the sign-off + filing record. No
   parallel tracking.

## Hand-off: local script → Madison

The local script's output folder per run:

```
cyl-9ml-GL14-run-2026-04-23-1430/
├── bottle.png
├── fitment-roller-ball-metal.png
├── cap-screw-metal.png
└── manifest.json
```

`manifest.json` schema in `docs/product-image-system/local-script-handoff.md`.

## Success criteria (pilot = `cyl_9ml_v1`)

1. SQL migration applies cleanly on dev DB. Existing rows retain data; new
   columns default safely.
2. Paper-Doll drawer opens from the Best Bottles Pipeline page for any shape
   group. The drawer reads family / capacity / thread from the existing
   `PipelineGroup` row (no parallel spec lookup).
3. Operator can drag-drop a folder containing PNGs + `manifest.json`. The
   drawer parses the manifest, validates it against the shape group, and
   uploads to Supabase Storage. Errors surface clearly if mismatched.
4. Prompt builders produce the expected strings for clear master, each of
   cobalt / amber / frosted / swirl, fitment, cap, and assembly preview —
   each tagged for Thinking vs Instant mode.
5. QC helpers produce a `QcResult` for each asset class.
6. For `cyl_9ml_v1`, the prompt builder pulls hardcoded physical mm from
   `productImageGeometry.ts` and merges with manifest canvas numbers to
   produce a complete `geometry_spec` for the row.
7. `tsc`, `eslint` pass. No existing test breaks.
8. The existing pipeline row expander / SKU list / Launch button continue to
   behave exactly as before for lane B.

## Pilot family — `cyl_9ml_v1`

Numbers are the dominant cyl-9ml configuration in
`BestBottles_Master_v8.3_Verification.xlsx` (`Master Products` sheet, rows
`BB-GB-009-0003` through `...-0008`).

- `family`: `"Cylinder"`, `capacityMl`: 9, `threadSize`: `"17-415"` — matches
  existing `PipelineGroup` string fields; no new family identifier.
- Hardcoded physical mm (pilot):
  - body height (w/o cap): **70 mm** (±1)
  - body width (diameter): **20 mm** (±0.5)
  - height with cap: **83 mm** (±1)
  - cap height: **13 mm** (computed `83 − 70`)
  - neck outer: **17 mm** (parsed from `17-415`; first number in the GPI
    thread code is neck outer diameter in mm)
  - neck inner: not used by `gpt-image-2` external rendering; omitted
  - fitment seat depth: per-fitment defaults in `productImageGeometry.ts`
    (roller-ball 5 mm, perfume pump 9 mm, fine-mist 8 mm, dropper 14 mm,
    glass stopper 7 mm). Not in v8.3; Madison-side config for the pilot.
- Canonical canvas: read from the local script's `manifest.json` at ingest
  time. Pilot expectation is a portrait canvas (roughly 2000 × 2400 px) with
  `centerXLocked: true` and a fixed `bottomAnchor.y`; the script is the
  source of truth for exact numbers.
- Default environment plate: `parchment_cream_v1` (`#EEE6D4`).

## Future phases (not this PR)

- **Phase 2** — JSON import of the v8.3 bottle catalog to populate
  `geometry_spec` for all families. Uses the same upload pattern as CSV
  import. No Convex SDK. This is what unlocks multi-family paper-doll.
- **Phase 3** — wire approved paper-doll assets into the existing Sanity /
  Convex / Shopify sync path (reusing the `madison_*_synced_at` columns).
- **Phase 4** — deploy the local script as a Supabase edge function so
  operators can drop the raw `.psd` instead of a folder.
