# Best Bottles hero program — handoff, 2026-09-21

**Written 2026-09-21, ~23:00 PDT, by the outgoing agent (Claude Code), for the agent
taking over.** Every number below was read from the code, the manifests or the live
systems while writing this.

Read this together with **[`HANDOFF.md`](./HANDOFF.md) (2026-09-20)**. That document
explains the fundamentals — *the image model does not achieve the sizing, the rig
does*, the lock contract, how a family comes onto the lock, how a release ships,
and the traps. Its **state** sections (2 and 6) are out of date; this document
replaces them. Where the two disagree, this one wins.

---

## 0. Where the work lives

- **Madison repo worktree (work only here):**
  `/Users/jordanrichter/Projects/Madison Studio/madison-app/.claude/worktrees/bb-scale-card-rig-2026-09-16`
  - branch `feat/bb-scale-card-rig`, open PR
    https://github.com/asalastudio/madison-studio-cursor/pull/37 (80+ commits; its
    description has a dated section per day)
  - the main checkout `…/madison-app` is on `main` with another session's changes —
    do not work there
- **Website repo:** `/Users/jordanrichter/Projects/Clients/Nemat-International/Best-Bottles-Website-02-20-2026`
  - the main checkout sits on `feat/bottle-bodies-3d`; do not disturb it
  - every release goes through a fresh worktree off `origin/main`
- **Both GitHub repos are PUBLIC.** Scan added lines for secrets before every push.
  Client product imagery stays under gitignored `tmp/`, never in git (release PNGs in
  the website repo are the one sanctioned exception).
- **Render/rig harness:** Vite on `:8080` serving the worktree.
  - launch config `bb-rig-harness-8080` in the main checkout's `.claude/launch.json`
    (`npx vite --port 8080 --strictPort` run inside the worktree)
  - the batch runner drives the rig through that page
  - if Vite reloads mid-run, the run dies with
    `page.evaluate: Execution context was destroyed`
  - so do not edit files under `src/` or `public/` while a batch is rendering
- **Supabase:** project ref `likkskifwsrvszxdvufw`; the CLI at
  `/opt/homebrew/bin/supabase` is logged in.
- **Secrets:** scripts read `.env` / `.env.local` themselves, and nothing needs a key
  pasted into a command. Never print env values, and never grep env files broadly;
  the website's `.vercel/` env files hold deploy credentials.

## 1. Rules — do not break these

1. **Paid generation needs Jordan's explicit go, every time, naming the scope.**
   - cost is ~$0.42 per render
   - run with `BB_GEN_MAX_ATTEMPTS=1` and one dedicated `--manifest` per run
   - the permission classifier blocks spend that is only implied: "let me see Circle
     and Round" was refused; "run the Sleek 9" went through
   - ask for "run X" before rendering
2. **Edge deploys need Jordan's explicit go**, and must be diffed first (see 5.7).
   - live carries uncommitted files, so a deploy from a clean checkout of HEAD would
     roll them back
3. **Jordan's visual sign-off before any hero enters a release.** Show a sheet, then
   wait for approval.
4. **Madison never writes to Convex or Shopify.**
   - `push-bestbottles-grid-hero` and `push-shopify-product-images` write to the
     **live** Shopify store; never use them
   - heroes reach the storefront only through a website-repo release PR, which Jordan
     merges (account `asalastudio`)
   - never enable auto-merge
5. **Don't touch another session's uncommitted work** (listed in 2.4): no commit,
   revert or stash without Jordan.
   - stage only your own hunks
   - for a file that also holds someone else's edit, apply a patch of your change
     with `git apply --cached`
6. **Locks are one number per glass body, set by Jordan by eye on a target sheet.**
   - three copies change together, plus tests: `src/lib/bestBottlesShoulderLock.ts`,
     `supabase/functions/_shared/bestBottlesShoulderLock.ts`,
     `public/data/best-bottles-shoulder-lock-2026-09-07.json`
   - read targets from the page's `window.__shoulderTargets`, or from the JSON Jordan
     pastes; never from a screenshot
7. **Measurements come from the canonical truth sheet**
   (`docs/best-bottles-canonical-truth/best-bottles-master-truth.csv`, `canon_*`
   columns only) — never raw Convex `diameter` or `widthMm`/`depthMm`. See 4.3.

## 2. State at hand-off

### 2.1 Storefront

- **Merged and live:** releases 1–13.
  - release 12 = 12 Diva heroes (PR #222)
  - release 13 = 13 Sleek heroes (PR #223)
  - production deploy of `f54f1c2f` is green
- **Open:** https://github.com/asalastudio/best-bottles-website/pull/224, release 14,
  9 Sleek heroes. CI (`verify`, Vercel) was still running when this was written.
- **Done count** (Jordan's rule: only shoulder-locked releases 6+ count): 104 of 370
  ladder groups before release 14.
  - Cylinder 31, Elegant 19, Boston Round 19, Sleek 13, Diva 12, Slim 10
  - release 14 re-does 7 Sleek groups and adds 2, so Sleek becomes 15

### 2.2 Edge function

- `generate-madison-image` **v237**, deployed 2026-09-21 22:43 PDT from the worktree.
- **v235 and later bundle the uncommitted "no white glass" contract**
  (`supabase/functions/_shared/bestBottlesRenderingContract.ts`, working-tree version).
  A deploy from clean HEAD would roll that back. v237 = the worktree at commit
  `0e73c35` plus those uncommitted files.

### 2.3 Lock table — 40 bodies (all three copies agree)

- Cylinder (14, the Sep 7 lock): 3.3 ml 26.5 · 4 ml 31.5 · 5 ml 36.5 · 9 ml 43.5 ·
  9 ml tall 62.5 · 25 ml 46.5 · 28 ml 50.5 · 30 ml 46.0 · 50 ml 18-415 56.0 ·
  50 ml 16 mm roll-on 53 · 100 ml 67.5 · 114 ml plastic 49.5 · 227 ml plastic 63.0 ·
  454 ml plastic 71.5
- Slim: 30 ml 48.5 · 50 ml 54 · 100 ml 67.5
- Elegant: 15 ml 39 · 30 ml 43 · 60 ml 47 · 100 ml 57
- Sleek: **5 ml 33** (was 37 until 09-21) · 8 ml 43 · 30 ml 47 · 50 ml 56 · 100 ml 60.5
- Boston Round: 15 ml 42 · 30 ml 45 · 60 ml 52
- Diva: 30 ml 40 · 46 ml 47 · 100 ml 57 *(closure seat)*
- Circle: 15 ml 40 · 30 ml 44 · 50 ml 48 · 100 ml 56 *(closure seat)*
- Round: 78 ml 42.5 · 128 ml 52 *(closure seat)*
- Empire: 50 ml 47.5 · 100 ml 57.5

**Closure-seat families** (`CLOSURE_SEAT_FAMILIES`: diva, circle, round) are measured
from the foot to where the cap starts at the neck, not to the shoulder. On Round,
which has no neck ring, the seat is the corner where the body meets the collar or
threads.

The lock `bodyAspect` is used by the proportion checks. The fixed target sheets
(4.2) reproduce every locked aspect exactly.

### 2.4 Uncommitted in the Madison worktree — not ours, leave alone

The "no white glass" surface fix, written 2026-09-18 by session `377d9f64`:
- `scripts/best-bottles/generate-family-batch.ts` — one 8-line hunk around line 929
  (surface hints from the website SKU, and a throw on `surfaceIssue`)
- `src/config/bestBottlesVisualTarget.ts` and `.test.ts`
- `src/hooks/useAssembledPromptGeneration.ts`
- `supabase/functions/_shared/bestBottlesRenderingContract.ts` and `.test.ts`
- untracked: `public/data/reference-exports/cylinder/2026-09-19/*.UNSIGNED*.json`

The edge half is live (2.2), and the batch runner uses the client half from the
working tree; every render on 09-21 ran with it. Ask Jordan before committing it.

### 2.5 Commits on 2026-09-21 (`feat/bb-scale-card-rig`, all pushed)

- `e793ac3`, `f562464`, `aaeec86` — closure-seat detector (urns, frosted, cap beside the
  bottle, Round's corner rule)
- `227f692` — the client prompt names the closure seat
- `2970377` — Diva locked; `d285b18` — Circle and Round locked
- `26e4232` — rig holds a closure-seat bottle beside its cap to the belly; the runner
  measures a detached reference without its cap
- `725f8fe` — **touching-cap split fix** (4.2)
- `91c2753` → `8085b70` — Empire locked (48/57, then Jordan's 47.5/57.5)
- `9e18017` — **canonical millimetres for every family** (4.3)
- `0aa0c70` → `0e73c35` — Sleek 5 ml → 33, with the 8 ml kept at 43

## 3. Next actions, in order

### 3.1 Release 14 — PR #224 (9 Sleek, approved, awaiting Jordan's merge)

- Contents:
  - GBSleek5Gl, GBSleek5SpryGlMatt (new 33% lock)
  - GBSleek8Gl, GBSleek8SpryGlMatt, GBSleek8MtlRollGlMatt
  - GBSlk30SpryMtGl, GBSlk100SpryMtGl
  - GBSlk30RdcrShnGl, GBSlk50RdcrShnGl (these two replace legacy plates; cap beside)
- Approval record: `tmp/bestbottles-generation/sleek-release14.selections.json`.
  Already applied with `--execute`: 9 tagged `status:approved-keep`.
- Deliverable builder: `tmp/diag/build-rel14.mts`. It builds exactly the selection
  file's URLs, flattened on Bone and resized 1560×1716.
- Checks passed:
  - audit: 9 of 9 verified end to end
  - `catalog-approved-heroes`: 396 pass
  - the full local vitest run fails only on packages missing from the borrowed
    `node_modules` (`@sentry/nextjs`, `next-intl`, `posthog-js`); CI has them
- **To do:** watch CI `verify`.
  - If a test pinned to older hero hashes fails, don't "fix" the test. Repoint the
    superseded rows in the pinned manifest with a `supersededBy` block, as release 12
    did in `docs/reviews/diva-family-final-manifest-2026-09-06.json` (commit
    `e9221959`): keep `prior*` fields and add `{release, card, approvedBy, approvedAt, note}`.
  - After Jordan merges, confirm the production image URLs return 200.

### 3.2 Redo the 50 ml lotion pump — `LB-SLK-CLR-50ML-LPM-MGLD` / `LBSlk50LtnMtGl`

- Jordan: "all looks fine on sleek but this needs to be redone" (this = the 50 ml lotion
  render). It stays on its release-13 image meanwhile.
- **Not the wrong product.** Sleek's lotion pump is a treatment pump; on the Photoshop
  source it looks almost identical to the fine-mist sprayer (gold actuator with an
  orifice).
- **What differs:** against its PSD, the render reads slimmer, with an oversized pump
  collar (about 86% of the bottle width, against about 73% on the PSD).
  - the rig's proportion check passed (6.22 vs 6.25), because it compares the whole
    vessel, so this is a visual call
  - if you can, ask Jordan what bothers them before paying
- Re-render once (paid, and confirm the go) with its own manifest, then compare
  against the PSD `tmp/bestbottles-generation/sleek-hero-references/LBSlk50LtnMtGl__LB-SLK-CLR-50ML-LPM-MGLD.png`
  before showing it.

### 3.3 Retry the 5 ml roll-on — `GB-SLK-CLR-5ML-MRL-MGLD` / `GBSleek5MtlRollGlMatt` (needs a go, ~$0.42)

- It failed the proportion check twice:
  - 09-20 at 37%: 3.71 vs 2.96
  - 09-21 at 33%: 3.74 vs 2.96
- It passed once, 09-21 at 37%.
- The model sometimes draws it about 26% too tall and thin. It's a model draw, not a
  rig fault, so retry it.
- When it passes, it and the lotion pump can ship together as release 15.

### 3.4 Circle 20, Round 14, Empire 7 — ready, need Jordan's explicit go (~$17)

- Locks are deployed (v237).
- References are staged in `tmp/bestbottles-generation/{circle,round,empire}-hero-references/`
  (each with a `.manifest.json`).
- Dry runs resolved 20, 14 and 7 targets, with correct prompts, e.g. Circle 100: "The
  closure seat … MUST land at 56%".
- Held for the wide-canvas lane (3.7): 7 Circle, 7 Round and 4 Empire bulb or tassel
  rows.
- Frosted rows ran fine on Diva without the `frosted-finish-v2` addendum. If a frosted
  reducer comes out clear, re-rig it with the addendum (see the HANDOFF.md traps).
- Empire's lotion-pump references don't picture the clear overcap. Watch whether the
  render invents one.
- After rendering: review sheet (5.5), then sign-off, then release.

### 3.5 Other Sleek heroes still carrying the junk widths — ask Jordan

- These release-13 heroes were rendered while the prompt still carried Convex's wrong
  widths, and have not been redone:
  - `GBSlk100RdcrShnGl`: about 17% too wide by eye; recommend redoing
  - `GBSlk50SpryMtGl`, `GBSlk30DrpGl`: looked fine
- The three lotion pumps had correct widths.

### 3.6 Next families to target

The sheets were rebuilt with the split fix on 09-21. There are 23 bodies awaiting
targets: http://localhost:8080/tmp/bestbottles-review/index.html (rebuild with
`build-shoulder-target-sheet.ts --all`).

| Family | Ladder groups | On sheet | Notes |
|---|---|---|---|
| Vial | 17 | 9 heroes, 3 bodies | 8 have no Photoshop source |
| Rectangle | 7 | 7, 3 bodies | includes a tall 10 ml variant |
| Tulip | 6 | 6, 2 bodies | |
| Decorative | 12 | 3, one hero per body | |
| Apothecary | 5 | 3 bodies | |
| Diamond, Grace | 5 each | 1 body each | |
| Royal | 4 | 1 body | |
| Square, Flair | 3 each | 1 body each | |
| Atomizer | 2 | 1 body | |
| Aluminum Bottle | 7 | 1 body, 2 heroes | |

- **No Photoshop source at all:** Cream Jar (13), Teardrop, Bell, Pillar, Lotion Bottle,
  Plastic Bottle.
- **Out of scope:** Gift Bag and Gift Box.
- **Undecided — ask:** Bell, Tool, Pillar, Lotion Bottle, Packaging Supply.
- **Groups left on locked families:** Cylinder 21, Elegant 14, Diva 9, Slim 5,
  Boston Round 4, Sleek (after release 14) the 4 bulbs/tassels plus 3.2 and 3.3.
  Many are bulbs or tassels (3.7).

### 3.7 The wide-canvas lane (not built)

- The staging helper skips every `AnSp` (bulb) and `AnSpTsl` (tassel) hero (regex
  `/Tsl/` or `/AnSp/i`).
- They exist across Sleek, Circle, Round, Diva, Elegant, Empire, Grace, Diamond and
  others.
- Needs a design decision with Jordan before any code: bulb placement, canvas width,
  and how it inherits each size's lock.

### 3.8 Diva droppers — held for a catalog conflict

- Convex and the CSV map `GB-DVA-FRS-46ML-DRP-GLD` to the clear dropper
  `GBDiva46DrpGl`, and the website's frosted group uses the same grace SKU.
- The site's clear grace SKU `GB-DVA-CLR-46ML-DRP-GLD` isn't in the catalog.
- The website/Convex lane has to decide; Madison can't.

### 3.9 Jev (TypeSafe) — proposal delivered, nothing built

Jordan asked where Jev could help. Three options were proposed; the recommended start
is the first:
1. a **catalog-contradiction report** — `noul` questions on name vs colour, cap colour
   and applicator, per row, reviewed by a person
   - it builds on `src/lib/bestBottlesJev.ts` and the
     `scripts/best-bottles/qualify-family-bodies.ts` pattern
2. the **copy-squad and awareness router** in `supabase/functions/_shared/madisonMasters.ts`
   - its substring matching misfires: "ad" matches "made", "stop" matches "stopper",
     "ready" matches "already"
   - a whole-word fix is worth doing regardless
3. the **Shopify product category** — `sync-shopify-products/index.ts:288` hardcodes
   `personal_fragrance`

Jev must not decide locks, measurements, glass finish (the website SKU token is
authoritative) or anything visual; it is text-only. Wait for Jordan's choice.

### 3.10 Lower priority

The 5 ml clear Cylinder roll-on card on a local storefront build showed the Convex
plate fallback, even though a release-6 hero exists. The card logic is
`getCatalogHero` plus `resolveLiveCatalogCardHero`, where a Shopify-CDN `heroImageUrl`
overrides the static hero. Unresolved.

## 4. What changed on 09-21, and why — don't undo it

### 4.1 Closure-seat landmark

- **Where:** `src/lib/product-image/shoulderLandmark.ts`, `detectClosureSeatLandmark`,
  called with `landmark: "closure-seat"`.
- **How it reads the seat:**
  - finds the belly, then climbs to the first lasting step of 15% or more (10%
    pre-filter), or to a corner where there's no ring
  - uses threshold 8, so frosted glass shows
- **Cap beside the bottle:** a mirror keeps the cap out of the belly.
- **Prompt:** "The closure seat — the top edge of the glass neck ring, exactly where the
  cap or collar starts — MUST land at X%", in both `familyRig.ts` twins and the client
  preflight.
- **Shoulder mode is unchanged byte for byte.**

### 4.2 Touching-cap split

- **Where:** `scripts/best-bottles/reference-sidecar-split.ts` → `findTouchingSidecar`,
  shared by the sheet builder and the runner's reference check.
- **The bug:** when no empty column separated the bottle and cap, the old code split at
  the emptiest column. On clear glass that column is inside the bottle, which:
  - cut the Empire 100 ml lotion pump down its dip tube
  - trimmed assembled droppers, producing a fake second Empire 50 ml body
  - halved bulb sprayers (the red cards)
- It also ran on assembled and capped frames, which picture no cap.
- **Now:**
  - only detached-sidecar frames split
  - one object on the baseline means no cap
  - a separate connected cap means split at its left edge
  - a fused or odd shape keeps the old fallback
- **Result:**
  - across 27 sheets, every changed hero now matches its body's north star
  - the fixed sheets reproduce the locked aspects exactly
  - three Circle/Round references stopped measuring their cap or the inside of their disc
- Unit tests: `reference-sidecar-split.test.ts`.

### 4.3 Canonical millimetres for every family

- **Where:** `scripts/best-bottles/canon-truth.ts` → `withCanonTruthGeometry`, used by
  `generate-family-batch.ts`.
- **The bug:** only Cylinder went through the canonical path. Every other family sent
  Convex's raw mm, and the edge's measurement block tells the model "the rendered body
  height-to-width relationship must match these measurements".
- **Rows that were wrong:**
  - Sleek went out at 23/37/72/78 mm for 17/28/28/36 mm glass (release 13 came out fat)
  - Circle 30/100 sent their depth (37/78) as the face width (60/89)
  - a Round frosted dropper went out as 78.7 × 85 for 83 × 69
- **Now:** heightWithoutCap, heightWithCap and diameter come from `canon_*`. A row the
  sheet doesn't know keeps its values.
- Tests: `canon-truth.test.ts`.
- Side effect: prompt hashes changed for non-Cylinder rows, so older raws can't be
  re-rigged under the new prompt.

## 5. Runbooks

All commands run from the Madison worktree unless marked otherwise.

### 5.1 Stage references for a locked family

```bash
npx tsx tmp/diag/stage-family-refs.mts Circle circle   # <Family> <slug>
```

- Output: `tmp/bestbottles-generation/<slug>-hero-references/` plus `.manifest.json`.
- It skips bulbs and tassels, and anything with no Photoshop flat on disk. The flats
  come from the target-sheet build under
  `tmp/bestbottles-review/<slug>/img/<websiteSku>.<presentation>.flat.png`.

### 5.2 Dry run (free)

```bash
BB_GEN_MAX_ATTEMPTS=1 npx tsx scripts/best-bottles/generate-family-batch.ts --family Circle --reference-folder tmp/bestbottles-generation/circle-hero-references --allow-flattened-psd-reference --manifest tmp/bestbottles-generation/circle-batch.json --dry-run
```

- Add `--skus <grace,grace>` to target specific rows.
- `BB_GEN_DUMP_PROMPT=<file>` writes the sample prompt.
- Check the `GLASS BODY SPECIFICATION` and `SHOULDER LOCK` lines.

### 5.3 Render (only after Jordan's go)

- Use the same command without `--dry-run`, with a new, dedicated manifest name.
- Needs the `:8080` harness running.
- Each render takes about 40 s.
- Results are listed as `✓`/`✗` in the log and stored in the manifest (`entries[grace].imageUrl`).

### 5.4 Free re-rig of an existing raw

- Add `--resume-raw-image-id <id>` with the **same manifest**, one SKU per run.
- It only works when the prompt hash and reference hash match. A lock change or a
  prompt-text change breaks the match.

### 5.5 Review sheet for Jordan

- `tmp/diag/sleek-regen-sheet.mts` draws the live image beside the new render, with
  lock lines.
- Environment: `S=<out dir>`, `MANIFEST=<manifest>`, `OUT=<name>.png`,
  `LOCK='{"5":33,...}'`.
- Send the PNG to Jordan. Wait for approval.

### 5.6 Release (after sign-off)

1. Write the selections JSON (format: `sleek-release14.selections.json`), then:
   ```bash
   npx tsx scripts/best-bottles/apply-gallery-selections.ts tmp/bestbottles-generation/<x>.selections.json
   npx tsx scripts/best-bottles/apply-gallery-selections.ts tmp/bestbottles-generation/<x>.selections.json --execute
   ```
2. Build the deliverables and `approved-lock.json` with a copy of
   `tmp/diag/build-rel14.mts`: set the selections file, manifests and card name, then
   run it with `OUT=<dir>`.
3. Create a website worktree:
   ```bash
   git -C <site> fetch origin main
   git -C <site> worktree add -b sunburst-heroes-release-<n> <dir> origin/main
   ```
   Symlink the main checkout's `node_modules` into it.
4. Copy the lock to `docs/reviews/sunburst-heroes-release-<n>/approved-lock.json`, then:
   ```bash
   node scripts/publish-sunburst-heroes.mjs release-<n>   # inside the website worktree
   ```
   This repoints the registry rows and copies the PNGs to `public/images/catalog/bone-review/`.
5. Test and audit:
   ```bash
   npx vitest run tests/catalog-approved-heroes.test.ts   # in the website worktree
   npx tsx scripts/best-bottles/audit-hero-release.ts --release <n> --site <website worktree>   # from the Madison worktree
   ```
   The audit must report N of N.
6. Remove the `node_modules` symlink before staging. Stage the specific files,
   commit, push, and open a PR (`gh pr create -R asalastudio/best-bottles-website`).
   Jordan merges. The next release number is **15**.

### 5.7 Edge deploy (only after Jordan's go)

```bash
mkdir -p <scratch>/live/supabase
cd <scratch>/live && supabase functions download generate-madison-image --project-ref likkskifwsrvszxdvufw --workdir <scratch>/live
# back in the worktree: cmp every file under <scratch>/live/supabase/functions against supabase/functions
supabase functions deploy generate-madison-image --project-ref likkskifwsrvszxdvufw   # from the worktree
supabase functions list --project-ref likkskifwsrvszxdvufw -o json   # parse for the new version; don't print the ~31 KB blob
```

- Never run `functions download` without `--workdir`: it overwrites local source.
- Before deploying, confirm the only differing files are the ones you meant to change.

### 5.8 Target sheets and locking a family

```bash
npx tsx scripts/best-bottles/build-shoulder-target-sheet.ts --family Vial   # or --all; add --include-locked to see locked bodies
```

- Open http://localhost:8080/tmp/bestbottles-review/<slug>/index.html
- Jordan drags the sliders and pastes the JSON.
- Add the bodies to all three lock copies (family entry in `CAPACITY_KEYED_FAMILIES` in
  both TS copies), then add tests, including a fail-closed case.
- Commit, then deploy (with a go), stage references, dry-run, and render (with a go).

## 6. Traps that cost time on 09-21

- **Deploying from a clean HEAD would have rolled back live code.** Always diff live
  first (5.7).
- **Python `open(p, "w").write(edit(open(p).read()))` truncates the file before reading
  it.** It emptied `generate-family-batch.ts` once; restored byte-identical. Read into a
  variable first.
- **zsh treats `echo ======` as `=` expansion and aborts the rest of the command.**
- **`cd` into another repo or folder resets the session's cwd** and loses the worktree
  context. Use `git -C` and absolute paths.
- **The shoulder detector is unreliable on finished renders of clear square bottles.**
  At 0.60 confidence it latched onto the inner cavity. For renders, trust the rig's
  own measurements in the manifest (`geometryQa.report.measurements`) plus an eye check.
- **The proportion gate compares whole-vessel aspect**, so render-vs-reference can
  "pass" while the bottle-to-pump ratio is visibly off (3.2).
- **"Looks fine" is visual approval; "cut the release" is the release go.** When Jordan
  said "yes all renders that we did that are not commit, commit and create a PR", that
  was the release go.
- **The Sleek 5 ml and 8 ml share 17 mm glass.** Each size is scaled by its own lock, so
  small bodies draw at a larger mm-scale. Put neighbours side by side before locking
  (the 09-21 preview technique: re-scale an existing render about the 91% baseline;
  it's free).

## 7. File map

- Lock and landmarks:
  - `src/lib/bestBottlesShoulderLock.ts`, with its Deno twin in `supabase/functions/_shared/`
  - `src/lib/product-image/shoulderLandmark.ts`
  - `src/lib/product-image/familyRig.ts`, with its Deno twin
- Rig: `src/lib/product-image/rigPostprocess.ts` (runs client-side in the `:8080`
  harness)
- Runner: `scripts/best-bottles/generate-family-batch.ts`, `canon-truth.ts`,
  `reference-sidecar-split.ts`
- Sheets: `scripts/best-bottles/build-shoulder-target-sheet.ts`;
  `index-psd-source-coverage.ts` → `tmp/bestbottles-generation/psd-source-coverage.json`
- Release: `scripts/best-bottles/apply-gallery-selections.ts`, `audit-hero-release.ts`;
  website `scripts/publish-sunburst-heroes.mjs`
- Local-only helpers (gitignored `tmp/diag/`): `stage-family-refs.mts`,
  `sleek-regen-sheet.mts`, `build-rel14.mts`, `split-ab.mts`, `valley-audit.mts`,
  `sheet-diff.py`
- Manifests (gitignored `tmp/bestbottles-generation/`): `sleek-regen-2026-09-21.json`,
  `sleek-5ml-33-2026-09-21.json`, `diva-batch.json`, `sleek-batch.json`, plus the
  `*-hero-references` folders
- Truth: `docs/best-bottles-canonical-truth/` (read `AGENT-HANDOFF.md` first)

## 8. Spend on 09-21

About $12 on OpenAI renders:
- Diva 14 (about $5.90)
- Sleek 9 ($3.80)
- Sleek 5 ml ×3 ($1.26)

Jordan's $100 monthly OpenAI budget marker was already exceeded before today. Quote
the cost with every request for a go.
