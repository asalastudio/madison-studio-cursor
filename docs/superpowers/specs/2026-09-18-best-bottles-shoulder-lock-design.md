# Best Bottles shoulder lock — design

Date: 2026-09-18
Status: approved by Jordan (driver decision: Sep 7 shoulder lock wins over scale-card v2 mm bands)
Supersedes: the scale driver in `2026-09-16-best-bottles-scale-card-rig-design.md` (canvas, baseline and QA plumbing from that spec stay)

## Problem

Every Cylinder render from the 2026-09-18 small-end remaster was scaled on the full
assembly envelope (roller ball top, sprayer trim, pump head) to a per-SKU assembled
percentage. Same-glass SKUs therefore rendered at two or three different sizes. Root
causes, confirmed in the batch manifest:

1. `scripts/best-bottles/generate-family-batch.ts` never passes `scaleCalibration` to
   `normalizeBestBottlesRigBaseline`, so glass bounds cannot be located under a fitment.
2. `rigPostprocess.ts` fails **open**: when glass bounds are missing it drops the glass
   target, falls back to legacy assembled `fillHeightPct`, and emits a warning the batch
   script whitelists as non-blocking.
3. The scale driver itself (scale-card v2 mm bands, `glassHeightPct` from
   `heightWithoutCap`) conflicts with the already-approved lock: v2 puts 5 ml glass at
   58% of canvas; the lock puts the 5 ml shoulder at 36.5%.

Meanwhile a source of truth already exists and was approved on 2026-09-07:
`hero-reviews/catalog-replacements-2026-09-07/data.json` in the Best Bottles repo has 52
Cylinder SKUs with `sizingLocked: true`, measurement mode `glass_shoulder`, one shoulder
target per glass body, and every fitment in a body measured within ±0.1% of it.

## The rule

One horizon per glass body, drawn at the **glass shoulder** — where the body ends and the
neck begins; under a fitment, where glass meets cap or collar. Baseline is 91% of canvas
height. Every SKU sharing a glass body lands its shoulder on that horizon regardless of
roller, sprayer, pump or cap. Fitments rise above the line by their own physical height;
nothing is scaled to them. For irregular bodies the shoulder is wherever the neck starts.

## Locked values (Cylinder, `shoulder-lock-2026-09-07`)

| glass_body_key | shoulder % above 91% baseline | SKUs |
|---|---|---|
| cylinder:3.3-standard | 26.5 | 1 |
| cylinder:4-standard | 31.5 | 1 |
| cylinder:5-standard | 36.5 | 7 |
| cylinder:9-standard | 43.5 | 15 |
| cylinder:9-tall | 62.5 | 6 |
| cylinder:25-standard | 46.5 | 6 |
| cylinder:28-standard | 50.5 | 1 |
| cylinder:30-standard | 46.0 | 1 |
| cylinder:50-standard | 56.0 | 6 |
| cylinder:100-standard | 67.5 | 5 |
| cylinder:114-standard | 49.5 | 1 |
| cylinder:227-standard | 63.0 | 1 |
| cylinder:454-standard | 71.5 | 1 |

The remaining 145 shoulder-sized rows in that collection (Boston Round, Slim, Tulip,
Diamond, Grace, Aluminum, …) are seeded as `draft` — same mechanism, not yet locked.

## Components

### A. Shoulder target table (source of truth)

Supabase `public.best_bottles_shoulder_targets`:

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| organization_id | uuid fk | RLS like `best_bottles_scale_calibrations` |
| family | text | `Cylinder` |
| glass_body_key | text | `cylinder:9-standard` |
| label | text | `Cylinder 9 ml · 70–74 mm glass` |
| shoulder_pct | numeric(6,2) | above baseline, canvas-height % |
| baseline_pct | numeric(5,2) | 91 |
| status | text | `draft` / `locked` / `archived` |
| lock_version | text | `shoulder-lock-2026-09-07` |
| source_collection | text | `hero-reviews/catalog-replacements-2026-09-07` |
| member_skus | jsonb | `[{graceSku, websiteSku, measuredShoulderPct}]` |
| review_note, created_by, locked_by, locked_at, created_at, updated_at | | |

Constraints: unique `(organization_id, family, glass_body_key, lock_version)`; partial
unique index on `(organization_id, family, glass_body_key) where status = 'locked'`.

Seed: a migration inserts the 13 locked Cylinder rows and 145 drafts, generated from the
hero-review JSON by `scripts/best-bottles/seed-shoulder-lock.ts`. The same script writes
`public/data/best-bottles-shoulder-lock-2026-09-07.json` (committed) so the lock is
versioned in git, not DB-only. The Best Bottles repo keeps the hero-review collection
archive as provenance.

### B. Glass-body resolver

`src/lib/bestBottlesGlassBody.ts` — `resolveGlassBodyKey(product): string | null`.
Deterministic from `family`, `capacityMl`, and variant evidence (`Tall` in item name /
website SKU, `heightWithoutCap` band). Pure, unit-tested against all 52 locked SKUs plus
the 22 SKUs in the Sep 18 cohort. `null` → fail closed at prompt-build time, before
provider spend.

### C. Rig: shoulder as the scale driver

`familyRig.ts` — `applyShoulderLockTarget(rig, target)` replaces
`applyScaleCardGlassTarget`. Rig gains `shoulderTargetPct`, `targetShoulderYPx =
(91 − shoulder_pct)/100 × H`, `scaleContractVersion = "shoulder-lock-2026-09-07"`.
`glassHeightPct`/mm bands remain as diagnostics only (physical-scale QA still compares
mm-derived expectations) and never set the transform.

`rigPostprocess.ts` — `computeRigFrameTransform` scales so detected shoulder → horizon and
detected foot → baseline (`scale = (targetBaselineY − targetShoulderY) / (footY −
shoulderY)`). When a shoulder cannot be resolved and the rig carries a shoulder target the
result is a **blocking** QA issue (`shoulder-unresolved`), not a warning; the transform is
not applied and the batch script does not upload or link the render.

`generate-family-batch.ts` — looks up the shoulder target and the locator (D) for each
SKU, passes both, and removes the warning whitelist for missing glass bounds. Generation
identity hashes `lock_version`, `glass_body_key`, `shoulder_pct`.

### D. Shoulder locator

Two sources, both required to agree within 1% before a render ships:

1. **Landmark calibration** (existing `best_bottles_scale_calibrations`, per geometry +
   fitment topology). Add `glass_shoulder_y_pct numeric(7,4)` (nullable for legacy rows;
   the Workbench gets a fourth draggable "shoulder" guide). Shoulder position within the
   assembled envelope is a fixed ratio for a geometry+topology, so one approved
   calibration locates the shoulder in any render of that topology.
   `resolveCalibratedGlassBodyBounds` returns `{shoulder, foot, left, right}`.
2. **Width-transition detector** on the primary vessel mask, same definition as the Sep 7
   measurement (`measure-circle-shoulders.py`): scan row widths from the foot upward; the
   glass body is the run within 8% of the maximum body width; the shoulder is the first
   row above it where width drops by more than 8% for 5 consecutive rows. Pure function,
   unit-tested with synthetic masks (cylinder + roller, cylinder + same-width collar,
   detached cap beside).

Resolution order: calibration if approved; detector otherwise. When both exist and
disagree by > 1% of canvas height → `shoulder-disagreement` review, no ship. Missing
calibrations for `cylinder:h74:*` and `cylinder:h70:*` topologies are drafted
programmatically from the clearest existing raw render per fitment (approved by Jordan in
the Workbench before use) — decision recorded 2026-09-18.

### E. Workbench tool: "Shoulder Targets"

New tab on `src/pages/BestBottlesScaleCardPilot.tsx`, component
`src/components/best-bottles/ShoulderTargetsPanel.tsx`:

- Table of glass bodies (family filter) with status, shoulder %, lock version, member
  count. Locked rows are read-only until "Unlock to draft" (explicit confirm).
- Body detail: one representative hero with the horizon and 91% baseline drawn; adjust by
  dragging the horizon or typing a number. Saving writes a `draft`; "Lock" requires a
  typed confirmation, sets `locked`, archives the prior locked row and bumps
  `lock_version` to `shoulder-lock-<date>`.
- Contact-sheet view: all member SKUs (locked heroes and latest Madison renders) on one
  continuous horizon, measured shoulder delta per tile, green within ±1%, red beyond.
  This is the hero-review sheet from 2026-09-07 rebuilt on the DB.
- Export JSON (same shape as the committed snapshot).

Data access through `src/lib/bestBottlesShoulderTargets.ts` (list / getLocked / saveDraft
/ lock / archive), mirroring `bestBottlesScaleCalibration.ts`.

## Data flow

product → `resolveGlassBodyKey` → locked shoulder target → `applyShoulderLockTarget` →
prompt (unchanged wording, plus shoulder horizon in scale-proof overlay) → provider →
`normalizeBestBottlesRigBaseline(image, {shoulderTarget, scaleCalibration})` → locator
(D) → transform (C) → framing QA (`measuredShoulderPct`, delta) → upload only on pass.

## Error handling

| condition | behaviour |
|---|---|
| no glass body for SKU | block before generation, identity `blocked` |
| body has no `locked` target | block before generation ("draft target — lock it in the Workbench") |
| shoulder unresolved in render | blocking QA, no upload, retry allowed |
| locator disagreement > 1% | review state, render kept, no link |
| measured shoulder off horizon > 1% after transform | fail (second seat pass already exists; if still off → fail) |

## Testing

- Unit: resolver (all 52 locked + 22 cohort SKUs), width-transition detector (synthetic
  masks), transform math (shoulder→horizon, foot→baseline), target table client.
- Integration: `scripts/best-bottles/re-rig-check.ts` re-rigs the 20 Sep 18 raw images
  offline (no provider spend) and asserts every 5 ml lands at 36.5 ± 1 and every 9 ml at
  43.5 ± 1; output is the contact sheet from E.
- Manual: Workbench lock/unlock round-trip; seed migration idempotent.

## Out of scope

- Re-deriving shoulder values from mm bands (rejected 2026-09-18).
- Locking non-Cylinder families (seeded as drafts only).
- Shopify/Sanity publishing of re-rigged assets.

## Rollout

1. Migration + seed + committed snapshot. 2. Resolver + rig + fail-closed. 3. Batch
wiring + re-rig the 20 raws offline; review contact sheet. 4. Workbench tab. 5. Draft the
h74/h70 locator calibrations, approve, regenerate the 2 failed SKUs.
