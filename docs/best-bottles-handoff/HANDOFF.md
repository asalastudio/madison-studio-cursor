# Best Bottles hero images — handoff

**Written 2026-09-20 by the outgoing agent (Claude Code), for the agent continuing
this work in Codex / ChatGPT with native image generation.**
Every number below was re-measured while writing this, not recalled.

You are picking up a program to give every Best Bottles storefront product group
one hero image at a consistent, physically honest scale. Two families are done or
nearly done. Thirty-three are untouched. The hard problems are solved and the
tooling exists — what remains is mostly throughput, plus a handful of named gaps.

Read sections 1 and 2 before generating anything. They will save you the two days
they cost to learn.

---

## 1. The one idea that everything else depends on

**The image model does not achieve the sizing. The rig does.**

Every hero must place its glass so the *shoulder* — where the body ends and the
neck begins — sits at a locked percentage of canvas height above a shared
baseline. The prompt asks for that. The model only approximates it: across 46
locked Cylinder renders it missed the target shoulder by **221 px on average, 594
px worst**, and needed rescaling to as little as 0.59×. Madison's rig then
measures the real shoulder and re-seats the bottle, landing within about **1 px**.

> The prompt asks. The model approximates. The rig enforces.

This is why `framing_decision` is `normalize` on essentially every render. That
is the design working, not a failure.

**What this means for you.** If you generate with ChatGPT's native image tool,
your images never pass through Madison's rig — so they are not heroes yet, however
good they look. Run each one through:

```
npx tsx scripts/best-bottles/rig-external-image.ts --image out.png --sku <GRACE-SKU>
```

It writes `out.rigged.png` (2080×2288 master) and `out.hero.png` (1560×1716, the
size the site ships), prints the shoulder delta and confidence, and exits non-zero
if the image is not acceptable. It is local-only: no provider call, no database or
website write. It **refuses** a glass body that has no shoulder lock rather than
guessing. Verified on a sidecar image that was 268 px off (re-seated to within
2 px), an assembled dropper, and an unlocked family.

For a SKU missing from the catalog snapshot, describe the glass instead:
`--family Slim --capacity-ml 50 --applicator "Fine Mist Sprayer" --website-sku GBSlm50SpryMtGl`

It needs the Vite harness: from the worktree, `npx vite --port 8080 --strictPort`.

### What you give up by leaving Madison's generation lane

Be deliberate about this; it is a real trade.

- No `generated_images` / `best_bottles_image_reconciliations` rows, so nothing
  appears in Madison's Image Library and no SKU job is linked.
- No cost ledger entry.
- **The release audit's custody check (step 4) will fail**, because it proves a
  website file by re-deriving it from Madison's stored render. For natively
  generated images you must either import them into Madison first, or adapt that
  one check to a local manifest of `(graceSku, websiteSku, sha256)`. Do not simply
  delete the check — it caught a deliberately swapped pair in testing, and it is
  the only thing standing between a mis-filed image and the live storefront.

---

## 2. Where things stand

### Live on the storefront

`https://best-bottles-website.vercel.app` — all four releases merged and verified
returning 200 in production.

| Release | PR | Contents |
|---|---|---|
| 6 | #196 | 20 Cylinder |
| 7 | #198 | 3 Cylinder |
| 8 | #205 | 7 Cylinder |
| 9 | #207 | 10 Slim + 1 Cylinder |

**41 of 352 in-scope hero groups are shoulder-locked and live:
Cylinder 31 of 52, Slim 10 of 15.** Those 41 are the only ones that count as done.

Do not be misled by what else is on the site. Every group already shows *a*
hero, and 85 of them are Sunburst renders from **releases 1-5 (2026-09-10 to
09-16), made before the shoulder lock existed** and sized from millimetres:
Circle 27, Boston Round 23, Cylinder 14, Decorative 8, Dropper 3, Bell 3,
Atomizer 2, Vial 2, Tool 2, Apothecary 1. **Jordan ruled on 2026-09-19 that
releases 1-5 do not count** — only the shoulder-locked releases (6 onward) do.
The other 226 groups show legacy plates. So "untouched" below means "no
shoulder lock yet", not "no Sunburst image".

### Shoulder-target review sheets (built 2026-09-19)

`npx tsx scripts/best-bottles/build-shoulder-target-sheet.ts --all` builds one
sheet per family plus an index at
`http://localhost:8080/tmp/bestbottles-review/index.html` (gitignored; needs the
Vite harness on :8080).

- **One slider per bottle size, set from one north star.** Each size takes its
  proportions from its most trustworthy file (clear glass, uncapped, no bulb).
  Every other colour and closure at that size follows; a follower whose own
  reading disagrees has its shoulder placed from the north star and says so on
  its card. Jordan's rule: lock a Boston Round 30 ml once and every Boston Round
  30 ml holds that shoulder, whatever its colour or fitment.
- Bodies that are already locked (all of Cylinder and Slim) are not asked again.
- Each card says what is live for that hero today (shoulder-locked / Sunburst
  pre-lock / legacy plate), read from the website repo's `origin/main`.
- Decisions are read back from `window.__shoulderTargetsDecided` on a family
  page, or `window.__allShoulderTargets` on the index. An untouched slider is an
  opening guess and is never stored as a decision.
- State on 2026-09-19: Elegant's four bodies are decided and locked. **35 glass
  bodies across 18 families still await a target; 120 heroes are on sheets.** Held off the sheets: 46 with no
  Photoshop source, 37 on curved glass where the detector finds no shoulder
  (Circle 50/100 ml, Round 128 ml, parts of Diva), 27 tassel bulb sprayers
  (wide-canvas lane; they inherit a lock, they do not set one), and the 7
  closure/accessory families (26 groups), which have no glass shoulder and need
  their own sizing rule.

**The scale card** Jordan refers to is `src/config/bestBottlesCatalogScale.ts`
(scale-card v2, 2026-09-18): five levels keyed on bare-glass height in mm, giving
the glass foot-to-RIM fill — Mini <45 mm 52%, Small 45-65 mm 58%, Medium 65-95 mm
64%, Large 95-135 mm 70%, Standard 135 mm+ 74%. It is keyed on millimetres, never
on ml. The shoulder lock replaced it as the scale driver for locked bodies; each
sheet shows a body's scale-card level for orientation.

### Rendered, not yet shipped

- `GB-CYL-CLR-5ML-SPR-MBLK` (`cylinder-5.5ml-clear-13-415-finemist`) — passes QA,
  recovered at zero cost after the 2 mm tolerance change. **Awaiting Jordan's
  visual sign-off**; do not release it without one.

### Madison repo

- Remote `asalastudio/madison-studio-cursor` — **PUBLIC**.
- Work lives in a git worktree, not the main checkout:
  `~/Projects/Madison Studio/madison-app/.claude/worktrees/bb-scale-card-rig-2026-09-16`
- Branch `feat/bb-scale-card-rig`, fully pushed. Last code commit before this
  handoff: `d7ffc1d`.
- **45+ commits ahead of `origin/main` and never merged.** Local `main` is stale.
  Nothing here is on main yet; decide with Jordan when it should be.
- Edge function `generate-madison-image` was redeployed three times this session
  and carries the Slim lock, the 5.5 ml alias and the slender-vial prompt lines.
- DB function `link_best_bottles_generated_image` was patched live (see 7.2).

### Website repo

- Remote `asalastudio/best-bottles-website` — **PUBLIC**.
- Local: `~/Projects/Clients/Nemat-International/Best-Bottles-Website-02-20-2026`.
  Jordan's checkout sits on a feature branch with many worktrees — **make a fresh
  worktree from `origin/main`; do not disturb the checkout.**
- PR #191 (Convex group-hero mutation) is now **merged**.

### Things in the working tree that are not mine — leave them, or ask

- Six modified files from another session's glass-finish fix:
  `scripts/best-bottles/generate-family-batch.ts` (an 8-line hunk),
  `src/config/bestBottlesVisualTarget.{ts,test.ts}`,
  `src/hooks/useAssembledPromptGeneration.ts`,
  `supabase/functions/_shared/bestBottlesRenderingContract.{ts,test.ts}`.
  Idle since 2026-09-18 22:02. Their 58 tests pass.
  **The deployed edge function already contains their uncommitted contract
  change** — `supabase functions deploy` bundles the working tree, and I deployed
  from it. It is paired with their uncommitted client change, so deploying from a
  clean checkout would un-pair them. That work needs committing by its owner.
  I staged my own edits to the shared runner file by blob so theirs stayed out.
- Two `*.UNSIGNED.json` files under `public/data/reference-exports/cylinder/2026-09-19/`
  — someone else's, deliberately unsigned.
- The **main checkout** holds older uncommitted work on the Shopify push path
  (9 files, +314 lines). Not reviewed by me.

---

## 3. The contract — do not improvise on these

| | |
|---|---|
| Master canvas | **2080 × 2288**, exactly 10:11 |
| Deliverable | **1560 × 1716** (exact 0.75×), PNG |
| Background | Bone **`#F5F3EF`** (245, 243, 239). Locked by Jordan; corners are checked ±2 |
| Baseline | glass foot on the shared **91%** line |
| Shadow | ambient contact only — no cast shadow, no floor plane, no reflection |
| Bottle | primary bottle centred on the vertical centreline |
| Detached cap | upright, to the right, on the same baseline; never shifts the bottle |
| Model | `gpt-image-2.5-sunburst` was the locked model in Madison |
| Tolerance | shoulder within **2 mm**, never tighter than 1% of canvas |

### Shoulder lock table — 21 bodies

One number per **glass body**, not per SKU. Foot-to-shoulder as a share of canvas
height above the 91% baseline. `bodyAspect` is foot-to-shoulder ÷ glass width and
lets the rig reject a wrong landmark.

| Body | Lock | Aspect | | Body | Lock | Aspect |
|---|---|---|---|---|---|---|
| cylinder:3.3-standard | 26.5% | 2.109 | | cylinder:50-standard | 56% | 3.167 |
| cylinder:4-standard | 31.5% | 2.714 | | cylinder:50-rollon | 53% | 2.354 |
| cylinder:5-standard | 36.5% | 2.362 | | cylinder:100-standard | 67.5% | 4.184 |
| cylinder:9-standard | 43.5% | 3.127 | | cylinder:114-standard | 49.5% | 2.673 |
| cylinder:9-tall | 62.5% | 5.326 | | cylinder:227-standard | 63% | 3.045 |
| cylinder:25-standard | 46.5% | 2.134 | | cylinder:454-standard | 71.5% | 3.22 |
| cylinder:28-standard | 50.5% | 2.203 | | **slim:30-standard** | **48.5%** | 2.496 |
| cylinder:30-standard | 46% | 2.65 | | **slim:50-standard** | **54%** | 3.492 |
| | | | | **slim:100-standard** | **67.5%** | 4.372 |
| **elegant:15-standard** | **39%** | 1.358 | | **elegant:60-standard** | **47%** | 1.253 |
| **elegant:30-standard** | **43%** | 1.381 | | **elegant:100-standard** | **57%** | 1.517 |

Elegant was locked by Jordan on 2026-09-19 from the all-family sheet, one north
star per size (the clear fine-mist sprayer). Slim and Elegant are
capacity-keyed: add a family to `CAPACITY_KEYED_FAMILIES` in both lock files
rather than writing a new resolver. **The deployed edge function does not carry
the Elegant lock yet** — it needs a redeploy, which needs Jordan's go. Until
then Madison-side generation for Elegant has no lock in its prompt;
`rig-external-image.ts` reads the local table and works now.

**Update, same day:** redeployed as `generate-madison-image` v232 (verified first
that the live bundle differed from the tree in the lock table only). A
four-bottle practice run — the clear fine-mist sprayer at each size — seated
every shoulder within 1 px of target (Y 1190 / 1098 / 1007 / 777-778,
confidence 1). **But the batch passed only the 100 ml.** The other three were
rejected by a different check: the 6% "primary bottle aspect vs reference" gate
for detached heroes. That is a measurement bug, not a bad render:
`detectStrongBounds` in `rigPostprocess.ts` counts a pixel as bottle only when it
is >= 52 from the background, or >= 16 and brighter than it. Cylinder walls are
dark thick lines and register; Elegant's flat faces render as thin grey walls,
darker than Bone and under 52, so they are invisible to it. Measured aspect came
out 2.76 against a true ~2.1 on the 15 ml (width collapsed onto the sprayer) and
1.76 against ~1.9 on the 60 ml. Reproduce at no cost with
`rig-external-image.ts --expected-primary-aspect <reference aspect>`.

**Fixed the same day.** My first diagnosis above (the `detectStrongBounds`
threshold) was wrong about the mechanism. The detached-hero aspect is measured
by `resolveWholeVesselBounds`, which reunites the fragments of one clear vessel
only when a base-aligned piece is at least 0.65 as tall as the tallest piece.
Elegant's glass reads 0.627-0.653 of its sprayer column, so the vessel
collapsed onto the sprayer. Across the 41 approved heroes plus the practice
set, a real detached cap never read above 0.47 — except reducer caps at ~0.85,
which already clear that cut and are held apart by the interior-evidence rule.
The cut is now 0.55 (`SIBLING_FRAGMENT_MIN_HEIGHT_RATIO`). It changed the
whole-vessel bounds of **0 of the 41** approved heroes, and the 6% tolerance did
not move. The three stored raws were then re-rigged through the pipeline with
`--resume-raw-image-id` at no provider cost. All four practice heroes are
`review-pending` with no QA issues: aspect drift -1.7 / -1.4 / -1.4 / -5.7%
(the 100 ml is the one to eyeball). Jordan signed off those four and approved
the other 18.

**Elegant after the full run (2026-09-20): 22 rendered, 19 passing in Madison
(`review-pending`), 3 failed with raws stored.** Shoulders within 5 px of target
on all 19; aspect drift within 5.3%. Spend about $9.30. What it took:

- *Assembled heroes (in-bottle droppers) were held to the wrong number.* The
  gate used catalog `heightWithCap / diameter` — 2.57 and 2.82 for a flask whose
  front view is 2.03. Exactly the flat-family trap in CLAUDE.md. The rig now takes
  `canonWidthAxisMm` / `canonHeightWithCapMm`; `scripts/best-bottles/canon-truth.ts`
  supplies them to both the batch runner and `rig-external-image.ts`. The
  measurement changed too: assembly height over the glass, edge to edge, because
  strong bounds include the contact shadow under a wide base. A first attempt
  (whole-vessel union) under-read the approved Slim 30 ml dropper by 17% and was
  dropped; the shipped version reads it at -0.1%.
- *Frosted glass lost its shoulder.* The detector's search window falls back to
  the bottle lane, which ends at a fixed 70% of the canvas, and the sidecar cap
  usually starts before that (primary bounds of 40 of 41 approved heroes run to
  exactly 70.0%). Clear and dark glass out-shout the cap's edge; a frosted wall
  does not. Now a second look inside the whole vessel, only when the first finds
  nothing or under 0.8 confidence. Two broader fixes were tried and dropped on
  regression evidence — moving the lane edge shifted 40 of 41 approved heroes'
  bounds (they feed centring), and searching the vessel first moved two approved
  coloured Cylinders' shoulders by 1%.
- *A duplicate filter of mine hid three heroes.* The catalog files each frosted
  15 ml twice under one website SKU (a wrong `CLR` row and the correct `FRS` row).
  The filter claimed the reference file for the first row even when that row was
  then refused. It now claims on acceptance.

**Jordan's review, 2026-09-20:** 17 approved (the 4 practice + 13), 2 rejected.
Recorded with `scripts/best-bottles/apply-gallery-selections.ts` — the sanctioned
path; it writes `status:approved-keep` by exact image URL, and now
`status:needs-regen` for an item marked `"status": "needs-regen"`, never
downgrading an approval. (Madison's `approve_best_bottles_reconciled_image` RPC
has never been used in this lane and would refuse these rows: it still demands
`framing_decision = 'pass'`, which the rig never writes. All 41 live Cylinder and
Slim heroes are still `review-pending` in the database; the approval of record
has been the website release lock.) The Supabase MCP's `execute_sql` is
read-only — use the script, not `apply_migration`, for data.

**Frosted glass drawn clear is a model behaviour, not bad luck.** Jordan approved
4 more renders (the 2 rejected, plus the frosted 15 ml roll-on and fine mist):
3 passed the rig and ALL 3 came out clear again; the fine mist failed the rig.
Across the run, frosted heroes wearing a sprayer, pump or dropper came out
frosted 5 of 5; frosted heroes with a **bare neck** (plain cap, reducer,
roll-on) came out clear 5 of 5. The prompt is identical between them and already
carries a "preserve the frosting EXACTLY" line plus a STYLE-ONLY frosted
reference (`frosted-v2-…`). Likely cause: the neck of a frosted bottle really is
clear glass, and with nothing covering it that is the strongest glass cue in a
white-on-white reference. Do not re-roll these — it is about $0.42 each for the
same result. Next step is a finish directive for frosted bare-neck heroes
("body is acid-etched and opaque; only the threaded neck is clear; no dark
refraction outlines"), tested on two renders, and a finish check in the rig,
which today measures geometry only.

**Finish-lock test, 2026-09-20 (Jordan approved; 2 renders, ~$0.84): 1 of 2.**
`BB_GEN_PROMPT_ADDENDUM=frosted-body-clear-neck-v1` (in
`scripts/best-bottles/smoke-prompt-addendums.ts`; opt-in, tags the image
`prompt-addendum:…`) states that the body is frosted and only the threaded neck
is clear. The frosted 100 ml reducer came out properly frosted and passed the
rig (shoulder 778/778, drift -4.3%) — awaiting Jordan's sign-off. The frosted
30 ml plain cap came out as **the wrong product**: a tall frosted cylinder
roll-on with a black dotted cap, i.e. the secondary STYLE-ONLY reference
(`frosted-v2-…`) reproduced as the subject. The rig refused it on proportions
(4.64 against ~2.2), which is the geometry gate doing its job. Nine earlier
frosted renders without the addendum never leaked the style reference, so the
addendum plausibly pushed the model toward that image; n=1, not proven. Jordan
also rejected the three clear-glass renders from the previous round
(`status:needs-regen`). Next idea, untested: keep the finish lock but name the
subject in it ("this flat rectangular flask from the primary reference") and
forbid borrowing the style reference's bottle or cap — or drop the secondary
style image for bare-neck frosted heroes and let the text carry the finish.

**Open on Elegant:**
- **Rejected, need the prompt fix before re-rendering:** `GB-ELG-FRS-30ML-GLD-T` and
  `GB-ELG-FRS-100ML-RDC-SGLD` passed the rig but were rendered as CLEAR glass.
  **The rig checks geometry, not glass finish** — nothing automated catches a
  frosted SKU drawn clear, and being drawn clear is why these two sailed through
  the shoulder detector. Look at every frosted hero by eye.
- **3 failed, raws stored, no spend needed:** frosted 15 ml plain cap (first look
  answers 0.6 and 11% off; the second look reads 0.99 in isolation but does not
  displace it in the live flow), frosted 60 ml sprayer (lost after
  normalisation), frosted 60 ml reducer (not found before it).
- **2 ready, not yet approved to render:** frosted 15 ml roll-on and fine mist,
  unblocked by the duplicate-filter fix.
- 8 bulb/tassel sprayers belong to the wide-canvas lane; `GBElg15MinarCu` has no
  uncapped source.
- The harness on :8080 is the `bb-rig-harness-8080` launch configuration. Check
  it serves the worktree before a paid run (`curl` the rig source and grep for a
  recent symbol); the rig runs client-side, so a stale harness silently applies
  old QA to a paid render.

Source of truth: `src/lib/bestBottlesShoulderLock.ts`, mirrored in
`supabase/functions/_shared/bestBottlesShoulderLock.ts` and
`public/data/best-bottles-shoulder-lock-2026-09-07.json`. **All three change
together**; a test pins them.

**Why one number per body is enough.** On the flattened uncapped Photoshop
sources, foot-to-shoulder is identical *to the pixel* across every fitment on a
body — Slim 30 ml: 1002/1002/1002/1002; 50 ml: 1442/1443/1442; 100 ml:
1874/1874/1874. Closure, colour and cap never move the shoulder.

**Why a lock is mandatory.** With no lock the rig sizes the *whole assembly*, so
identical 50 ml glass rendered anywhere from 55.9% to 65.7% of canvas — 17.7%
apart — purely from closure height.

### Jordan's standing rules

- **One hero per product group, never per SKU.** Target is **352** groups.
  The 2,480 figure is SKU jobs and has never been the goal.
- **Gift bags and gift boxes are out of scope** (2026-09-19). Bell, Tool, Pillar,
  Lotion Bottle and Packaging Supply are *undecided* — ask before photographing.
- **Droppers sit inside the bottle** for heroes — never a sidecar
  (`src/lib/bestBottlesHeroPresentation.ts`). So a dropper hero is drawn from the
  **capped** source, not the uncapped one.
- **Remaining generations come from flattened Photoshop sources.**
- **Roll-on over-caps are phenolic plastic**, even in gold or silver colourways.
  Only the roller ball is steel. "Metal cap" language produces chrome-CGI failures.
- **There is no white glass.** The "White" catalog group is *swirl glass with a
  white cap*. Trust the finish segment in the website SKU (`Swrl`, `Frst`).
- **Visual sign-off before any release.** The release record stamps each image as
  approved by Jordan, so only include what they have actually seen.

---

## 4. How to bring a family onto the lock

Proven end to end on Slim. 9 of 10 heroes landed first pass.

1. **Find sources.** `npx tsx scripts/best-bottles/index-psd-source-coverage.ts`
2. **Build the target sheet.**
   `npx tsx scripts/best-bottles/build-shoulder-target-sheet.ts --family Elegant`
   → `http://localhost:8080/tmp/bestbottles-review/elegant/index.html`
   Every hero group appears, grouped by glass body, one slider per body, with the
   locked Cylinder ladder on top for scale. Sliders open on that ladder read
   across by **glass height in mm** — 53 mm→36.5%, 70→43.5%, 83→46.5%, 117→56%,
   154→67.5%, near linear. A red card means the fitment would crop.
3. **Jordan sets the targets by eye.** Read them from `window.__shoulderTargets`
   in the page. Do not transcribe from a screenshot.
4. **Add the bodies** to the lock table (all three copies) plus a family branch in
   `resolveGlassBodyKey`. Resolve by *stated capacity*; fail closed on anything
   else. Add tests, including a fail-closed case and a no-leak case.
5. **Redeploy** `generate-madison-image` if generating through Madison.
6. **Generate** from flattened sources, then rig, then check.
7. **Review sheet → Jordan's sign-off → release → audit.**

Flatten a PSD on macOS: `sips -s format png "<file>.psd" --out out.png`.
The target-sheet builder leaves flats under
`tmp/bestbottles-review/<family>/img/<websiteSku>.<presentation>.flat.png`.

### Prompts

`docs/best-bottles-handoff/prompt-exemplars/` holds three **verbatim** prompts as
the model actually received them — detached sidecar, assembled dropper, and
slender vial. Use these as your starting point. They are the *sent* text, which
is not the same as the client draft (see 7.1).

---

## 5. Shipping to the storefront

A release is an **indexing step**: PNGs into the website repo, a registry row
repointed at each. It touches no Shopify, Convex or hosted media.

1. Fresh worktree from `origin/main`.
2. Deliverables at 1560×1716, Bone corners.
3. `docs/reviews/sunburst-heroes-release-<n>/approved-lock.json` —
   `websiteSku → { sha256, file, card, family, approvedAt, lockedAt }`.
4. `node scripts/publish-sunburst-heroes.mjs release-<n>` — it hash-, size- and
   corner-checks each file and **only repoints SKUs that already have a registry
   row**. Pick SKUs *from* `src/lib/products/catalog-heroes.json`.
5. Copy each PNG to `public/images/catalog/bone-review/<websiteSku>.<sha12>.png`.
6. `npx vitest run tests/catalog-approved-heroes.test.ts` → 396 pass.
7. `npx tsx scripts/best-bottles/audit-hero-release.ts --release <n>` (from the
   Madison worktree) → must be N of N.
8. PR. Jordan merges. Vercel deploys. Verify the image URLs return 200.

**If you add heroes to a release already published on its branch:** reset the
registry and manifest to `origin/main` and publish **once** with the full lock,
or `registry-rollback.json` records the wrong originals.

**Check the PR is still open before adding to it.** I added eleven heroes to a
branch whose PR had already merged with seven, then re-titled the merged PR —
briefly a false public record. I corrected it; release 9 exists because of it.

**Never use Madison's Shopify push for a demo.** `push-bestbottles-grid-hero` and
`push-shopify-product-images` write to the **live** Shopify store.

The next release number is **10**.

---

## 6. What is left

Regenerate: `index-psd-source-coverage.ts` then `emit-reference-work-orders.ts`.
Per-family work orders with exact PSD paths and export filenames:
`public/data/reference-exports/work-orders/<family>.csv`.

| Family | Hero groups | Live (Madison) | PSD sourced | Both roles | No source | Shoulder lock |
|---|---|---|---|---|---|---|
| Cylinder | 52 | 31 | 43 | 33 | 9 | 14 bodies |
| Elegant | 33 | 0 | 32 | 24 | 1 | **none yet** |
| Circle | 27 | 0 | 27 | 19 | 0 | **none yet** |
| Boston Round | 23 | 0 | 22 | 22 | 1 | **none yet** |
| Sleek | 21 | 0 | 21 | 16 | 0 | **none yet** |
| Diva | 21 | 0 | 21 | 14 | 0 | **none yet** |
| Round | 21 | 0 | 21 | 13 | 0 | **none yet** |
| Slim | 15 | 10 | 15 | 10 | 0 | 3 bodies |
| Vial | 17 | 0 | 13 | 2 | 4 | **none yet** |
| Empire | 11 | 0 | 11 | 7 | 0 | **none yet** |
| Decorative | 12 | 0 | 10 | 0 | 2 | **none yet** |
| Rectangle | 7 | 0 | 7 | 5 | 0 | **none yet** |
| Tulip | 6 | 0 | 6 | 6 | 0 | **none yet** |
| Roll-On Cap | 6 | 0 | 6 | 0 | 0 | **none yet** |
| Cream Jar | 13 | 0 | 5 | 0 | 8 | **none yet** |
| Apothecary | 5 | 0 | 5 | 0 | 0 | **none yet** |
| Diamond | 5 | 0 | 5 | 3 | 0 | **none yet** |
| Grace | 5 | 0 | 5 | 3 | 0 | **none yet** |
| Aluminum Bottle | 7 | 0 | 4 | 0 | 3 | **none yet** |
| Sprayer | 7 | 0 | 4 | 0 | 3 | **none yet** |
| Royal | 4 | 0 | 4 | 3 | 0 | **none yet** |
| Cap/Closure | 4 | 0 | 3 | 0 | 1 | **none yet** |
| Flair | 3 | 0 | 3 | 3 | 0 | **none yet** |
| Square | 3 | 0 | 3 | 3 | 0 | **none yet** |
| Teardrop | 3 | 0 | 3 | 0 | 0 | **none yet** |
| Dropper | 3 | 0 | 3 | 0 | 0 | **none yet** |
| Atomizer | 2 | 0 | 2 | 0 | 0 | **none yet** |
| Plastic Bottle | 2 | 0 | 1 | 0 | 1 | **none yet** |
| Lotion Pump | 1 | 0 | 1 | 0 | 0 | **none yet** |
| Bell | 3 | 0 | 0 | 0 | 3 | **none yet** |
| Lotion Bottle | 3 | 0 | 0 | 0 | 3 | **none yet** |
| Tool | 3 | 0 | 0 | 0 | 3 | **none yet** |
| Pillar | 2 | 0 | 0 | 0 | 2 | **none yet** |
| Packaging Supply | 2 | 0 | 0 | 0 | 2 | **none yet** |
| **Total** | **352** | **41** | **306** | **186** | **46** | |

**The gating work for every family after Slim is the lock, not the rendering.**
Thirty-three families have none. Suggested order — fully sourced, mostly both
roles: **Circle 27, Sleek 21, Diva 21, Round 21, Empire 11, Rectangle 7, Tulip 6**,
then Elegant 33 and Boston Round 23.

### Cylinder — the 21 still without a Madison hero

| Count | Why | Groups |
|---|---|---|
| 6 | Bulb / tassel — held for the 1536×1024 wide canvas by design | 25/50/100 ml antique spray and tassel |
| 8 | **No PSD in either estate** — needs photography or a scope decision | 118 / 227 / 454 ml plastics, 30 ml fine mist (`GBSpry1ozGl`), and four matte short-cap variants: `GBCyl5GlMattSht`, `GBCylBlu5SlMattSht`, `GBTallCyl9GlMattSht`, `GBTallCylFrst9GlMattSht` |
| 3 | PSD ready, but the SKU is **missing from the 27 June catalog snapshot** | 25 ml dropper, fine mist, reducer |
| 2 | PSD exists outside the capped/uncapped trees — role needs a human call | 3.3 ml and 4 ml fine mist |
| 1 | Rendered, **awaiting sign-off** | 5.5 ml fine mist |
| 1 | **Detector cannot find the shoulder** (see 7.6) | 9 ml frosted tall roll-on |

Two of the "no PSD" short-cap variants are cards Jordan specifically asked for —
*9 ml Clear Tall Cylinder Bottle with Cap* and its frosted twin. Their gold and
silver tall-cap siblings exist but are condemned by canon police for a reference
aspect of 5.478 against a canon body of 5.889.

### Slim — 5 left
All five are antique-spray / tassel bulb assemblies on the wide-canvas lane.

---

## 7. Traps — each one cost real time

**7.1 The edge function throws away the client's framing block.**
`generate-madison-image` calls `replaceBestBottlesPrecompiledFramingProfile`, which
deletes the client's `… FRAMING PROFILE` block and substitutes its own imposed-rig
block. Anything written into that block in `bestBottlesPromptPreflight.ts` never
reaches the model — including a "canonical proportion lock" I added and
wondered why it did nothing. To change what the model is told about framing, edit
`buildImposedRigBlock` in **both** `src/lib/product-image/familyRig.ts` and
`supabase/functions/_shared/familyRig.ts`, and redeploy. `BB_GEN_DUMP_PROMPT`
dumps the *client* draft; the truth is `generated_images.final_prompt`.

**7.2 The DB link guard could never pass.** It required
`framing_decision = 'pass'`; the rig writes `'normalize'` on ~every row. Fixed live
to `IN ('pass','normalize')` — `reject` still excluded. Committed as
`supabase/migrations/20260918060000_link_guard_accepts_normalized_framing.sql` but
applied out-of-band, adding to pre-existing **migration drift**. Do not run
`supabase db push` blindly.

**7.3 233 bottle SKUs were misfiled as closures.**
`inferBestBottlesPromptFamily` matched "lotion pump" / "dropper" in the *item
name*, so a Slim bottle sold with a pump resolved a non-bottle shadow policy and
threw. Eleven families affected; fixed. Cylinder never hit it, which is why it
surfaced only on the second family.

**7.4 Slender vials come back too fat.** The lock pins the height, so "fill the
canvas" can only be obeyed by widening the glass. Bodies with aspect ≥ 4.5 (only
`cylinder:9-tall` today) now get an explicit on-canvas width — "268px wide, 12.9%
of canvas" — and a vertical-fill-only line. Result: 268 px against a 268 px target.

**7.5 Width is not locked — open issue.** The lock fixes height; the rig scales
uniformly, so the model's drawn proportions survive. Slim came out between 2.5 mm
narrow and 2.4 mm wide on a ~30 mm bottle. Jordan judged that acceptable under
the "1 or 2 mm" rule, with two borderline. Extending the 7.4 width line to every
locked body is the obvious fix; I left it because it rewrites approved prompts.

**7.6 Frosted tall vials defeat the shoulder detector.** `GB-CYL-FRS-9ML-T-02` has
failed four generations and one zero-cost re-rig. The rig cannot find the shoulder *before* normalising, so it
never truly locks. Widening the tolerance does not fix this and must not be used
to hide it.

**7.7 Matching SKUs to Photoshop files.**
- The estates abbreviate `Matt→Mt` and `Sht→Sh`. Safe to match on.
- **Never strip `Mtl`.** `GBTallCyl9RollMtlBlkDot` (metal roller) and
  `GBTallCyl9RollBlkDot` (plastic) are different products. My first matcher merged
  them and reported confident false matches.
- **Storefront capacity labels drift.** The "25 ml" Cylinder is the **30 ml**
  bottle (`GBcyl25SpryMtGl` → `GBCyl30SpryMtGl.psd`). "5.5 ml" is the 5 ml glass.
  Match on the SKU, never the displayed capacity.
- Estate directory names contain **trailing spaces** (`…/1. PSD Uncapped /`).

**7.8 Two estates, not one.**
`~/Projects/Clients/Nemat-International/BBUAT-Upload-Files` (6,337 files, split
`1. PSD Uncapped ` / `2. PSD Capped ` — exactly the two reference roles) and
`…/Best-Bottles-Original-Photoshop-Sources` (4,493, organised by thread size).
Searching only one badly understates coverage.
**These live on Jordan's Mac, not in any repo.** A cloud agent cannot see them.

**7.9 Cylinder is fenced.** `invokeWithCylinderVerifiedReference` requires the
exact promoted immutable reference. Jordan lifted that for flattened sources via
the explicit `--allow-flattened-psd-reference` flag, which needs a
`--reference-folder`, applies only to targets read from it, keeps the byte-drift
check, and tags images `reference-route:flattened-psd`. Off by default. Do not
delete the guard.

**7.10 My "validation" of `derive-shoulder-lock-from-renders.ts` was circular.**
It reads the *post*-normalisation shoulder, so checking it against an existing
lock just returns the lock. The honest validation is the target-sheet builder:
measured straight off Photoshop sources, it matches the hand-derived Sep 7 values
— 25 ml 2.133 vs 2.134, 50 ml 3.155 vs 3.167, 100 ml 4.179 vs 4.184.

**7.11 Smaller ones.**
- `-01` twin catalog rows share a website SKU and double-billed a render until I
  de-duplicated by reference file.
- Root `npx tsc --noEmit` is vacuous — use `-p tsconfig.app.json` (~1,200
  baseline errors; grep for your own files).
- `best_bottles_image_reconciliations` primary key is `image_id`, not `id`.
- Cursor has twice bulk-emptied files in this worktree. Recover with
  `git checkout HEAD --`. Commit as soon as work validates.
- Both repos are public: scan added lines for secrets before every push.

---

## 8. Tools

All under `scripts/best-bottles/` in the Madison worktree.

| Script | Purpose |
|---|---|
| `rig-external-image.ts` | **Rig an image made anywhere.** Start here for native generation |
| `index-psd-source-coverage.ts` | Which hero groups have a Photoshop source, per role |
| `emit-reference-work-orders.ts` | Per-family CSVs with exact PSD paths and export names |
| `build-shoulder-target-sheet.ts` | Adjustable per-family sheet for setting targets by eye |
| `validate-reference-export-drop.ts` | Gate a reference drop (2080×2288, opaque, Bone, naming) |
| `audit-hero-release.ts` | Prove each released hero is the right image on the right product |
| `generate-family-batch.ts` | Madison's own batch generator (`--dry-run`, `--skus`, `--manifest`, `--reference-folder`, `--allow-flattened-psd-reference`, `--resume-raw-image-id` re-rigs a saved raw at zero cost) |
| `qualify-family-bodies.ts` | Jev-backed proposal of a family's glass bodies + contradictory catalog rows |
| `derive-shoulder-lock-from-renders.ts` | Reads measured shoulders back — see the caveat in 7.10 |

Docs: `docs/best-bottles-reference-prep-program.md`,
`docs/best-bottles-cylinder-reference-reexport-spec.md`,
`docs/best-bottles-file-naming-contract.md`, and the repo's `CLAUDE.md`.

**Jev (TypeSafe)** — `src/lib/bestBottlesJev.ts`. Text-only, so it cannot look at
an image. Scored 36/0/39/0 (100%) reproducing human-reviewed bulb labels from
product names in 2.7 s, and partitioned Slim's 129 SKUs into 3 bodies while
flagging the 7 junk-diameter lotion pumps. It **proposes**; `resolveShoulderLock`
stays the authority. `TYPESAFE_API_KEY` lives in the *website* repo's `.env.local`.

---

## 9. Working with Jordan

- **Answer yes or no first**, then explain. They were frustrated early on by
  validation loops — "going in circles". Do not add checking layers unprompted.
- **Ask before every spend and every deploy.** Approval in one context does not
  carry to the next. Real cost is about **$0.42 per image**, not the $0.095 in old
  constants. The last day was about 29 provider calls (~$12): 4 were deliberate
  practice renders, and 6 missed QA, one of which was later recovered for free.
  Earlier in the same effort there were roughly 50 more calls.
- **Report misses plainly.** They will push back when something looks wrong, and
  they are often right — they caught the 25→30 ml mislabel, and were right that
  the 30 ml looking stubbier is accurate (87×30 mm vs 121×31 mm).
- **Measure rather than assert.** Their catalog millimetres independently
  confirmed my Photoshop-derived aspects: both Slim bodies imply the same ~12.4 mm
  neck, the 18-415 finish.
- Never print `.env` values. Madison never writes to Convex.

---

## 10. Suggested first moves

1. Get Jordan's sign-off on the 5.5 ml fine mist; it is a free win for release 10.
2. Pick the next family with them — I would take **Circle** (27 groups, 100%
   sourced, 19 with both roles) — and run section 4 from step 1.
3. Decide with Jordan how natively generated images enter Madison's library, so
   the custody check in section 1 stays meaningful.
4. Ask whether `feat/bb-scale-card-rig` should be merged to `main`. It is 45
   commits ahead and everything above depends on it.
