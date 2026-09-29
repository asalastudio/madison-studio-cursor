# Best Bottles Scale-Card Rig Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Madison generate Best Bottles heroes with
`gpt-image-2.5-sunburst` while deterministic code sizes bare glass from the
approved universal scale card.

**Architecture:** Best Bottles owns the canonical JSON standard. Madison keeps
runtime-compatible Vite/Node and Supabase/Deno mirrors, resolves
`heightWithoutCap` through the same monotone PCHIP curve, and carries the exact
glass target through prompt, postprocess, QA, and localhost proof UI.

**Tech Stack:** TypeScript, React, Vite, Supabase Edge/Deno, Node test runner,
Sharp/browser canvas, GPT Image 2.5 Sunburst.

## Global Constraints

- Model is exactly `gpt-image-2.5-sunburst`; no fallback.
- Scale uses verified `heightWithoutCap`, never capacity or `heightWithCap`.
- Glass foot is on the 91% line; deliverable canvas is 1560×1716.
- One physical glass has one size across colours and fitments.
- Missing/disputed measurements or missing body-control geometry fail closed.
- No Supabase, Shopify, Convex, or storefront writes during localhost proof.
- Every size change gets same-zoom before/after proof with the number.
- Load and classify all approved flat PNGs before any bulk provider spend.
- Generate one canonical representative hero per storefront product group while
  preserving physical fitment identity within that group.
- Cylinder has exactly 47 targets: 51 source product-group IDs minus three
  plastic groups and one duplicate Tall Cylinder 9 ml Clear 13-415 group.

---

### Task 1: Canonical scale-card contract

**Files:**
- Create in Best Bottles: `data/asset-ledger/scale-card.json`
- Create in Best Bottles: `tests/scale-card-standard.test.ts`
- Create in Best Bottles: dated amendment files beside the Cylinder and Boston locks

**Interfaces:**
- Consumes: eight approved millimetre-to-percent control points.
- Produces: versioned JSON with canvas, baseline, PCHIP points, and S-tag rule.

- [ ] Write a failing test that pins the version, all eight points, 91% baseline,
  monotonic ordering, and S20–S200 tag bounds.
- [ ] Run `npx vitest run tests/scale-card-standard.test.ts` and confirm it fails
  because the canonical JSON does not exist.
- [ ] Add the JSON and dated amendments.
- [ ] Re-run the test and confirm it passes.
- [ ] Stage only those exact paths and commit.

### Task 2: Madison scale resolver and runtime parity

**Files:**
- Modify: `src/config/bestBottlesCatalogScale.ts`
- Modify: `src/config/bestBottlesCatalogScale.test.ts`
- Modify: `src/lib/product-image/familyRig.ts`
- Modify: `src/lib/product-image/familyRig.test.ts`
- Modify: `supabase/functions/_shared/familyRig.ts`
- Modify: `supabase/functions/_shared/familyRig.test.ts`

**Interfaces:**
- Produces:
  `resolveBestBottlesGlassScale(heightWithoutCapMm) -> { glassHeightPct, targetGlassHeightPx, tag }`.
- `getFamilyRigForProduct()` exposes the same target for all cap states.

- [ ] Replace capacity-knot assertions with failing scale-card control-point,
  interpolation, tag, invalid-input, and Cylinder pilot assertions.
- [ ] Run the targeted Vite/Node and Deno-twin tests and confirm expected failures.
- [ ] Implement monotone PCHIP without dependencies and resolve target glass pixels
  directly from bare-glass percentage.
- [ ] Wire the resolver into both family-rig runtimes; capacity must not participate.
- [ ] Re-run targeted tests and confirm browser/Deno parity.

### Task 3: Cross-family flat-PNG intake and fitment cohorts

**Files:**
- Modify: `scripts/bestBottlesReferenceIntake.ts`
- Modify: `scripts/bestBottlesReferenceIntake.test.ts`
- Modify: `src/lib/paperDoll/componentRegistry.ts`
- Modify: `src/lib/paperDoll/componentRegistry.test.ts`
- Modify: `src/components/darkroom/ComponentsTabPanel.tsx`
- Modify: `src/pages/BestBottlesPipeline.tsx`

**Interfaces:**
- Intake manifest assigns every approved flat PNG to family, body identity, source
  SHA, and physical fitment cohort.
- Family readiness is blocked until every source is classified or explicitly
  rejected.
- Batch budget equals missing canonical storefront-group representatives, not raw
  SKU count.

- [ ] Write failing tests for family totals, SHA dedupe, physical fitment keys,
  and the exact 47-target Cylinder group manifest.
- [ ] Extend the intake artifact with by-family loaded/classified/blocked counts
  and canonical cohort assignments.
- [ ] Fix Components tab slot keys so equal labels on different neck sizes or cap
  states cannot collapse into one fitment.
- [ ] Expose the family readiness matrix and product-group generation count on
  localhost.
- [ ] Run intake in dry-run mode across all configured flat-PNG roots and inspect
  unresolved/duplicate rows before any upload or provider spend.
- [ ] Load approved references only after the manifest reaches 100% classified or
  each remaining row has an explicit rejection reason.

### Task 4: Sunburst provider lock

**Files:**
- Modify: `supabase/functions/generate-madison-image/index.ts`
- Modify/add focused provider-policy tests beside the rendering contract.
- Modify: `scripts/best-bottles/generate-family-batch.ts`

**Interfaces:**
- Best Bottles scale-card requests resolve only to
  `provider=openai`, `model=gpt-image-2.5-sunburst`.

- [ ] Write failing tests proving the old GPT Image 2 force and capacity-based batch
  default are rejected.
- [ ] Lock provider policy and batch default to Sunburst.
- [ ] Reject a non-Sunburst resolved model before Best Bottles provider spend;
  do not fall back to GPT Image 2, Flare, Gemini, or an environment-selected
  model.
- [ ] Re-run provider-policy and batch request tests.

### Task 5: Deterministic body-scale gate

**Files:**
- Modify: `src/lib/product-image/rigPostprocess.ts`
- Modify: `src/lib/product-image/rigPostprocess.test.ts`

**Interfaces:**
- Postprocess consumes body-control bounds and scales the entire assembly about
  the glass foot to `targetGlassHeightPx`.

- [ ] Write a failing transform test using separate glass-body control bounds and
  full-assembly bounds.
- [ ] Add the body-control transform; fail closed when exact body bounds are absent.
- [ ] Re-run family rig and postprocess tests.

### Task 6: Localhost Cylinder proof

**Files:**
- Create: `src/pages/BestBottlesScaleCardPilot.tsx`
- Create: `src/pages/bestBottlesScaleCardPilot.ts`
- Create: `src/pages/bestBottlesScaleCardPilot.test.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Route: `/best-bottles/scale-card-pilot`
- Shows: 5 ml, 9 ml Classic, 9 ml Slim, 50 ml, and 100 ml at current and target
  sizes, one zoom, with millimetres, percentage, delta, and S-tag.

- [ ] Write failing data-model tests for the five exact target values and deltas.
- [ ] Implement the pure pilot model and pass its tests.
- [ ] Build the review page from that model and add a protected route.
- [ ] Verify visually at `http://localhost:8080/best-bottles/scale-card-pilot`.
- [ ] Run `npm run test:bestbottles:catalog-scale`, focused rig tests,
  `npx tsc --noEmit`, and `npm run build`.
- [ ] Do not generate or publish until Jordan approves the localhost proof.
