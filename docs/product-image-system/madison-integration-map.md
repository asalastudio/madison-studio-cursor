# Madison Integration Map — Product Image System (Modular Bottle Paper-Doll)

> **Status: superseded in part.** This doc describes an earlier pivot where
> the paper-doll lane was going to live behind a new top-level route
> (`/product-image-workflow`). After review, we pivoted to placing the lane
> **inside the existing Best Bottles Pipeline page** as a drawer opened from
> each shape-group card. See `PRD.md` for the current architecture; sections
> below describing a standalone page or route are historical and kept for
> reference only.

This document describes where the new **Product Image System** workflow lane
plugs into the current Madison Studio codebase. It is explicitly **additive**:
nothing in the current Image Studio, Dark Room, or Best Bottles Pipeline is
replaced or renamed. The goal is a separately-governed workflow lane for
modular product imagery (bottle bodies, fitments, caps) that coexists with the
general-purpose image-generation surfaces.

---

## 1. Existing Surfaces (inventory)

The following surfaces are the closest neighbours to the new system. They stay
untouched for this pilot.

### Image generation / editing

| Surface | Path | Role |
|---|---|---|
| Image Editor (legacy) | `src/pages/ImageEditor.tsx` | General image workflow — kept for backward compatibility. |
| Dark Room | `src/pages/DarkRoom.tsx` + `src/components/darkroom/*` | Primary image-generation studio. |
| Consistency Mode | `src/components/darkroom/ConsistencyMode/*` + `src/lib/consistencyMode.ts` | Bulk variation runner built on Dark Room's generator. |
| Image Editor Modals | `src/components/image-editor/*` | Floating/guided assistants used elsewhere in the app. |
| Create flow | `src/pages/Create.tsx`, `src/components/create/*` | General "start from blank" flow. |

### Bottle-specific

| Surface | Path | Role |
|---|---|---|
| Best Bottles Pipeline | `src/pages/BestBottlesPipeline.tsx` | CSV-driven grid-tracker for Best Bottles catalog. |
| Pipeline lib | `src/lib/bestBottlesPipeline.ts` | Supabase-backed data layer for the tracker. |
| Pipeline bridge | `src/lib/bestBottlesPipelineBridge.ts` | Hand-off from tracker to Dark Room prefill. |
| Reference sync | `src/lib/bestBottlesReferenceSync.ts` | Legacy hero → master-reference hydration. |

### Supporting

| Surface | Path | Role |
|---|---|---|
| Image settings | `src/config/imageSettings.ts` | Aspect ratios, visual squads. |
| Prompt guidelines | `src/config/imagePromptGuidelines.ts` | Reusable prompt templates for general marketing shots. |
| Library | `src/pages/Library.tsx`, `src/pages/ImageLibrary.tsx`, `src/pages/DAMLibrary.tsx` | Asset storage + retrieval. |
| Products | `src/pages/Products.tsx`, `src/pages/ProductHub.tsx` | Product model surfaces. |
| Router | `src/App.tsx` | Route registration. |
| Sidebar | `src/components/AppSidebar.tsx` | Navigation groups (Studio, Library, Products, etc). |

---

## 2. Recommended Insertion Points

The new workflow lane is a **new mode**, not a rewrite of Image Editor or
Dark Room. It sits alongside them.

### New top-level route
- `/product-image-workflow` — pilot entry point for bottle paper-doll imagery.

### Sidebar placement (later, not in this pilot)
- Add under the existing `Studio` collapsible group in `AppSidebar.tsx` as a
  new entry: **"Product Photography"**.
- **Pilot policy:** do NOT wire the sidebar link yet. The route is reachable
  directly via URL for operator testing. We add the sidebar link only after
  the pilot family is validated so we don't expose a partially-stubbed lane to
  all users.

### Where to hand off to existing generation
- The prompt builders (`src/lib/product-image/promptBuilders.ts`) produce
  strings that can be fed into the existing `generate-madison-image`
  edge-function call path that Dark Room + Consistency Mode already use.
  **No changes** to the edge function or `src/lib/consistencyMode.ts` are made
  in this pilot — the new code only _prepares_ payloads.

---

## 3. What Stays Untouched (do not modify yet)

- `src/pages/ImageEditor.tsx`
- `src/pages/DarkRoom.tsx` + `src/components/darkroom/**`
- `src/lib/consistencyMode.ts`
- `src/pages/BestBottlesPipeline.tsx`
- `src/lib/bestBottlesPipeline.ts`, `bestBottlesPipelineBridge.ts`,
  `bestBottlesReferenceSync.ts`
- `src/config/imagePromptGuidelines.ts`
- `src/config/imageSettings.ts`
- `src/components/AppSidebar.tsx`
- The `generate-madison-image` edge function (Supabase functions)
- Any existing Supabase schema / RLS policies

**Rationale:** the pilot is a vertical slice that reads existing concepts
(family, capacity, thread, fitment, glass color) but writes through new types
and helpers only. When the pilot ships, a follow-up PR can migrate parts of
the pipeline to the new governed types.

---

## 4. What Gets Extended (light touches)

Only two existing files gain a one-line extension:

1. **`src/App.tsx`** — one new `const ProductImageWorkflow = lazy(...)` and the
   matching `<Route path="/product-image-workflow" ... />` registration in
   both sidebar and no-sidebar branches. No other logic changes.

No other existing file is modified in this pilot.

---

## 5. New Files / Modules

### Docs (`docs/product-image-system/`)
- `madison-integration-map.md` *(this file)*
- `PRD.md`
- `schema.md`
- `prompt-pack.md`
- `workflow-decision-tree.md`
- `qc.md`
- `implementation-plan.md`
- `psd-modular-ingest.md`

### Types (`src/lib/product-image/`)
- `types.ts` — `EnvironmentPlate`, `BottleFamilySpec`, `MaterialVariant`,
  `ProductImageJob`, `QcResult`, `PsdModularIngestResult`,
  `ComponentAnchorSpec`, `AssemblyPreviewSpec`.

### Config (`src/config/`)
- `productImageEnvironment.ts` — registry of environment plates
  (pilot: `parchment_cream_v1` with `#EEE6D4`).
- `productImageVariants.ts` — material variant registry
  (clear / cobalt / amber / frosted / swirl) + pilot family config for the
  cylindrical 9ml body.

### Helpers (`src/lib/product-image/`)
- `promptBuilders.ts` — prompt pack for clear master, material variants,
  reflection refine, fitment, cap, assembly preview, plus retry prompts.
- `workflowDecisionTree.ts` — decide which lane (component_extracted,
  body_enhanced, body_regenerated) an asset should take.
- `qc.ts` — QC rule scaffolding for bodies, variants, components, assembly.
- `psdIngest.ts` — PSD layer parsing + normalization stubs + anchor spec
  generation.

### UI (`src/pages/` + `src/components/product-image/`)
- `src/pages/ProductImageWorkflow.tsx` — pilot workflow lane page.
- `src/components/product-image/ProductImageWorkflowPanel.tsx` — mode switcher
  (PSD ingest / enhance / regenerate), variant selector, environment plate
  read-out.
- `src/components/product-image/FamilySpecCard.tsx` — canonical family spec
  summary.
- `src/components/product-image/VariantLineupPreview.tsx` — 4-tile material
  variant lineup.
- `src/components/product-image/AssemblyPreviewCard.tsx` — body + fitment +
  cap assembly preview.

---

## 6. Explicit "Do Not Modify Yet" List

- Supabase schema / RLS
- Existing tables: `best_bottles_pipeline_groups`, `generated_images`,
  `consistency_sets`, etc.
- `generate-madison-image` edge function
- `src/lib/bestBottlesPipeline.ts` — future PR may unify `PipelineStatus`
  with `ProductImageJob.mode`, but not now.
- `AppSidebar.tsx` nav tree — pilot uses direct URL access.

Any future change to these files should come with its own migration plan
and should not be bundled into the pilot scaffolding.

---

## 7. Integration Risks + Mitigations

| Risk | Mitigation |
|---|---|
| New code is mistaken for a replacement of Image Studio. | Page copy, PRD, and sidebar grouping (later) label it "Product Photography" / "Paper Doll Mode". |
| Pipeline row schema drifts from new `BottleFamilySpec`. | `BottleFamilySpec` is additive + config-driven; the Supabase row shape in `bestBottlesPipeline.ts` is not touched. Mapping lives in a future PR. |
| PSD parsing is external and brittle. | `psdIngest.ts` ships with a **schema-first, stubbed** implementation that accepts pre-parsed layer metadata. Actual PSD parsing is a future step. |
| Prompt regressions in Dark Room. | We do not modify Dark Room prompts. The new `promptBuilders.ts` is only consumed by the new workflow lane. |
| Two sources of truth for bottle color ids. | The new config declares its own `MaterialVariant` ids; the existing tracker's `GLASS_COLOR_TO_OPTION` map is left in place. A reconciliation doc will accompany the future unification PR. |

---

## 8. Assumptions Carried into the Pilot

1. Final rendered bottle bodies in this workflow sit on **`#EEE6D4`** (parchment
   cream). No transparency output for clear glass in the body lane.
2. Clear glass is the canonical master material; cobalt / amber / frosted /
   swirl are **derived** from the clear master.
3. PSDs used as ingestion sources may (but are not required to) have separate
   layers for `bottle`, `fitment`, `cap`. Parsing is external; this system
   accepts layer metadata as input for now.
4. Existing CSV-driven catalog (`PipelineGroup`) is the system-of-record for
   "which SKUs exist". The new `BottleFamilySpec` is the system-of-record for
   "what are the canonical canvas and anchors for a family".
5. The existing `generate-madison-image` edge function is the eventual
   generation target. The pilot builds prompts and job payloads only.
