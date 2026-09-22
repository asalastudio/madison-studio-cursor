# Best Bottles Shoulder Landmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Cylinder rig detect, seat, verify, persist, and display the approved glass-shoulder lock.

**Architecture:** Add a pure pixel landmark detector that works inside the browser rig and isolates the primary bottle from detached sidecars. Use its shoulder and foot as the two points of a deterministic affine scale, verify the transformed shoulder, persist the measured values in reconciliation metadata, and make the editor render the shoulder target and measured shoulder instead of the legacy millimeter/rim guide.

**Tech Stack:** TypeScript, React, browser Canvas `ImageData`, Node test runner via `tsx --test`.

## Global Constraints

- Cylinder scale source of truth is `shoulder-lock-2026-09-07`.
- Foot target is 91% from the top of the 2080×2288 canvas.
- Shoulder target is `91 - shoulderPct` percent from the top.
- Fitments never determine scale.
- Cylinder shoulder misses fail closed; non-Cylinder behavior remains unchanged.
- Post-transform shoulder tolerance is ±1 percentage point of canvas height.
- The detector must exclude detached caps and sidecars from the primary bottle landmark.
- Convex millimeter measurements remain diagnostics and never choose Cylinder canvas scale.

---

### Task 1: Shoulder landmark detector

**Files:**
- Create: `src/lib/product-image/shoulderLandmark.ts`
- Create: `src/lib/product-image/shoulderLandmark.test.ts`

**Interfaces:**
- Produces: `detectGlassShoulderLandmark(input): GlassShoulderLandmark | null`
- Input includes RGBA pixels, canvas dimensions, primary bottle bounds, and detected foot Y.
- Output includes shoulder Y, foot Y, confidence, and detection evidence.

- [ ] Write synthetic failing tests for a straight Cylinder body, an attached same-width collar, a transparent low-contrast body, and a detached sidecar.
- [ ] Run `npx tsx --test src/lib/product-image/shoulderLandmark.test.ts` and verify failures are caused by the missing detector.
- [ ] Implement edge/row-width analysis constrained to the primary bottle bounds. Scan upward from the foot for the stable body-wall run, then locate the sustained body-to-neck/collar transition.
- [ ] Run the detector tests and verify they pass.

### Task 2: Shoulder-based rig transform and fail-closed QA

**Files:**
- Modify: `src/lib/product-image/rigPostprocess.ts`
- Modify: `src/lib/product-image/rigPostprocess.test.ts`

**Interfaces:**
- Consumes: `detectGlassShoulderLandmark`.
- Produces: `measuredShoulderYPx`, `measuredShoulderPct`, `targetShoulderYPx`, and `shoulderDeltaPct` in normalization output/framing measurements.

- [ ] Write failing tests proving the transform solves both landmarks with `scale = (targetFootY - targetShoulderY) / (sourceFootY - sourceShoulderY)` and that missing/off-target Cylinder shoulders block.
- [ ] Run the focused tests and confirm expected failures.
- [ ] Use the detector for shoulder-locked rigs, apply the two-landmark transform to the complete scene, and re-detect after rendering.
- [ ] Remove the current shoulder-lock fallback that clears `targetBodyHeightPx`; emit `shoulder-unresolved` or `shoulder-off-target` instead.
- [ ] Run focused tests and the existing rig/family tests.

### Task 3: Batch propagation and persistence

**Files:**
- Modify: `scripts/best-bottles/generate-family-batch.ts`
- Modify: `scripts/best-bottles/generate-family-batch-cutover.test.ts`
- Modify: `src/lib/bestBottlesImageReconciliation.ts`
- Modify: `src/lib/bestBottlesImageReconciliation.test.ts`

**Interfaces:**
- Consumes: shoulder measurements from rig normalization.
- Produces: reconciliation shoulder measurements and blocking batch behavior.

- [ ] Write failing source-contract and reconciliation tests for shoulder measurement persistence and blocking shoulder QA.
- [ ] Run focused tests and confirm expected failures.
- [ ] Stop whitelisting missing body/shoulder bounds for shoulder-locked Cylinders and persist the four shoulder fields.
- [ ] Run focused tests and verify they pass.

### Task 4: Editor shoulder overlay

**Files:**
- Modify: `src/lib/bestBottlesScaleCardOverlay.ts`
- Modify: `src/lib/bestBottlesScaleCardOverlay.test.ts`
- Modify: `src/components/best-bottles/ScaleCardOverlay.tsx`
- Modify: `src/components/image-editor/ImageEditorModal.tsx`
- Modify: `src/pages/ImageLibrary.tsx`

**Interfaces:**
- Consumes: `glassBodyKey`, `shoulderTargetPct`, and measured shoulder reconciliation fields.
- Produces: green locked-shoulder line, orange measured-shoulder line, and red baseline.

- [ ] Write failing overlay-model tests for the 5 ml target at 54.5% from top and measured shoulder rendering.
- [ ] Run the overlay tests and confirm expected failures.
- [ ] Resolve the shoulder lock from product identity, make shoulder mode authoritative for locked Cylinders, and retain the legacy scale card only for non-locked products.
- [ ] Render green “Shoulder lock” and orange “Current shoulder” guides; suppress legacy millimeter/rim ticks in shoulder mode.
- [ ] Run focused tests and verify they pass.

### Task 5: Offline proof and verification

**Files:**
- Modify only if required by verified defects from the proof run.

- [ ] Run all focused shoulder, rig, overlay, reconciliation, and batch tests.
- [ ] Run ESLint and TypeScript checks on edited files.
- [ ] Re-rig the seven existing raw examples without a new provider call and verify baseline ±3 px, shoulder ±1 percentage point, no clipping, and preserved identity/aspect.
- [ ] Open the editor and confirm the 5 ml card shows a green shoulder at 54.5%, an orange measured shoulder, and no green `53 mm · 58%` rim target.
