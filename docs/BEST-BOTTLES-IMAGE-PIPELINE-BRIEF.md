# Best Bottles Image Pipeline — Design Brief & UI Spec
> Context handoff for the agent building the Madison Studio UI. Captures the model
> and decisions worked out with the operator (Cowork) on 2026-06-20. Read this
> before touching anything in the Best Bottles image/library/pipeline surface.

> **⚠️ PROMPT ARCHITECTURE UPDATE (2026-07) — read before the "prompt assembly" claims below.**
> The single authoritative catalog image prompt is now the **vendored canon** in
> `src/config/bestBottlesCatalogCanon.ts` (glass-type parametrized) plus a **per-family
> framing profile** from `src/config/bestBottlesFamilyProfiles.ts` (one profile per
> bottle family, all 28 catalog families covered), assembled by `buildFinalPrompt()` in
> `src/lib/bestBottlesPromptPreflight.ts`. This one string is what ships to `gpt-image-2`
> via `supabase/functions/generate-madison-image`. `src/utils/promptFormula.ts` (cited
> below) is a *different* feature (Dark Room "Pro Mode" camera/lighting) and does NOT
> drive catalog images. The `config/product_families.json` module system is validation-only
> (its prompt text is discarded). Paper-doll builders are deprecated/removed.

## 0. The one mental model that prevents mistakes

There are **two independent axes** on every product image. They are NOT the same
thing, and the UI must treat them separately:

1. **Lineage** — *what reference the image was made from.* Provenance metadata.
   - `reference-lineage:legacy`  → generated from the OLD extracted-PNG references
   - `reference-lineage:clean`   → generated from the NEW clean transparent references
   - keeper imports              → existing live images cataloged in (`keeper-backfill-*`)
2. **Quality / approval** — *is this image good enough to publish?* This drives "done".
   - `status:approved-keep`  → publishable; counts as DONE
   - `status:needs-regen`    → off-brand / trash; the real backlog
   - `status:unreviewed`     → not yet triaged

**"Done" is defined by quality, not lineage.** A `reference-lineage:legacy` image can
be `status:approved-keep` (kept forever) if it looks great. A `clean` image could be
`needs-regen` if it came out badly. **Never gate "complete" on provenance or on "has
any image_url".** Gate it on `status:approved-keep`.

The North Star: *every product variant has an `approved-keep`, on-brand image.* The
clean-reference pipeline is the tool to fill gaps and fix `needs-regen` — it is NOT a
mandate to discard good existing work.

## 1. Current data reality (Supabase `generated_images`, org `4ab1ac72-cd7e-4faf-9152-5aa5f2862411`)

As of 2026-06-20 the Best Bottles library holds **2,916** rows, all of which the UI
currently badges "Generated output" merely because they live in `generated_images`:
- **2,274** genuine generations (long `final_prompt`, `generation_provider`, made from
  OLD references) → being tagged `reference-lineage:legacy`. Quality VARIES — some are
  near-perfect, many are off. Curate by quality, keep the good ones.
- **642** `keeper-backfill-2026-06-12` imports (no real prompt, no reference, all
  `is_hero`) → existing live images. Generally weaker than the generations. Leave the
  `keeper-backfill` tag; triage by quality like everything else.
- **0** generated from the new clean references. The clean/drift-free count starts at
  **zero** — this is correct and is the honest baseline.

`library_tags` (TEXT[], migration `supabase/migrations/20260422010000_library_tags_column.sql`)
is the durable tagging surface. Existing tags seen in the wild: `brand:best-bottles`,
`sku-preset`, `studio-master`, `canvas:2080x2288`, `family:<x>`, `cap-on`,
`keeper-backfill-2026-06-12`, `local-generation`. New tags this project adds:
`reference-lineage:legacy|clean`, `status:approved-keep|needs-regen|unreviewed`.

## 2. The coverage state machine (reference layer)

`public/data/best-bottles-reference-intake.json` (built by
`scripts/bestBottlesReferenceIntake.ts`) is keyed by `graceSku` and drives the
pipeline UI. Its `coverageStatus` is a state machine for the REFERENCE (not the final
image):
- `missing_local_reference_image` (751) — no local reference yet
- `covered_needs_canonical_copy` (1,723) — has a reference, but it's the OLD opaque
  render; needs the clean transparent canonical copy
- `covered_canonical` (9) — clean canonical reference present

`scripts/bestBottlesReferenceIntake.ts` has `DEFAULT_CANONICAL_RENDER_ROOT` pointing at
the OLD `pipeline/madison-hero-sync/renders` (opaque). The cutover: repoint the canonical
root to the clean lane (`pipeline/best-bottles-reference-images-clean/02-transparent-png-approved`),
rebuild, and rows flip `covered_needs_canonical_copy → covered_canonical`.

NOTE: `public/data/best-bottles-madison-pipeline-ui.json` is a STALE 2026-05-14
snapshot (says 0 approved generations). Reality has moved on — don't trust its
absolute counts; rebuild from intake + the live `generated_images` table.

## 3. What the UI needs to do (build targets)

1. **Provenance-gate the "COMPLETE / PDP LIVE" metric.** Today the workbench counts a
   row done if it has any image. Change it: a variant is COMPLETE only when it has a
   `status:approved-keep` image. This single change de-muddies the whole UI (cylinder's
   "260 live" collapses to the true clean/approved count). Logic lives in
   `src/lib/bestBottlesImageCoverage.ts` (`hasSkuJobConvexDestination`, the `complete`
   nextAction) and `src/lib/bestBottlesPipeline.ts`; surfaced in `src/pages/BestBottlesPipeline.tsx`.
2. **Legacy/clean library filter.** In the Image Library (the `/image-library` route),
   add a filter that defaults the view to EXCLUDE `reference-lineage:legacy` (and
   optionally keepers), so only the new clean/approved work surfaces. Since clean = 0
   today, the filtered view starts empty and fills only with drift-free work.
3. **"Every image to create, starting at zero" worklist.** A view listing every
   catalog variant × required view (cap-on / cap-off) as the master to-create backlog,
   with progress = count of `status:approved-keep`. Source the variant list from the
   reference-intake / catalog join; required views from cap-state.
4. **Surface the two axes everywhere a product image appears** — show lineage and
   approval status as distinct badges, not a single "Generated output" chip. Use
   `src/lib/bestBottlesImageProvenance.ts` (kinds: generated-output, keeper-backfill,
   reference-import, shopify-source) PLUS the new `status:*` tag.
5. **Read the quality decisions.** Cowork produces `bb-quality-prescreen.json` (AI tier
   per image) and, after human review, a decisions export → a migration that writes
   `status:*`. The UI just needs to read those tags. Don't rebuild the review tool.

## 4. The on-brand rubric (for any UI that shows/scores quality)

From `src/config/imagePresets.ts`: background = flat Best Bottles **Bone `#F5F3EF`**
(never white/transparent/checkerboard); single soft key light upper-front-left;
contact shadow back-right ~2:00–2:30 (never directly beneath, never left/back-left);
exactly one product matching the reference identity (geometry, color, cap, applicator,
cap-state, placement/scale); no label/text/props/secondary-product/hands/mist; no
chrome-CGI sheen on plastic caps; no other-brand shapes. Generation engine:
`supabase/functions/generate-madison-image`; catalog prompt assembly in
`src/lib/bestBottlesPromptPreflight.ts` (`buildFinalPrompt` = vendored canon
`src/config/bestBottlesCatalogCanon.ts` + per-family framing profile
`src/config/bestBottlesFamilyProfiles.ts`). (Historical note: earlier drafts of this
brief pointed at `src/utils/promptFormula.ts`, which is actually Dark Room "Pro Mode",
not the catalog path.)

## 5. Lane split & single-writer discipline (how the two agents coexist)

- **This agent (Claude Code in the Madison repo) = sole owner of the Madison app +
  Supabase + the generation engine.** It builds the UI, the schema, the edge
  functions, and is the ONLY thing that applies DB migrations / deploys. One writer to
  this system.
- **Cowork = reference prep (PSD → clean transparent `{graceSku}.png`), Shopify
  publishing, and cross-system QA/planning.** It stays READ-ONLY on this database and
  hands over reviewed artifacts: clean reference PNGs, intake updates, SQL migrations,
  the quality pre-screen JSON, and decision exports.
- **Contract = reviewed artifacts, never concurrent writes to the same system.** Do not
  let both agents migrate Supabase or edit the same files at once.

## 6. Reference-prep contract (the input you'll ingest)

Cowork's clean references are PNG-32, transparent, **2080×2288**, native scale (no
upscale — identity references, not final images), horizontally centered, foot at
0.92·H, filename exactly `{graceSku}.png`. Cap states are exactly `cap-on` / `cap-off`
(cap-off = cap shown beside the bottle). The reference-prep logic is packaged as the
`bestbottles-reference-prep` skill (PSD layer-alpha primary; rembg/BiRefNet fallback).

## 7. Key files (verified 2026-06-20)
- `src/lib/bestBottlesImageCoverage.ts` — coverage/`complete` logic (change the done gate here)
- `src/lib/bestBottlesPipeline.ts` — pipeline metrics
- `src/lib/bestBottlesImageProvenance.ts` — provenance kinds (extend display, don't fight it)
- `src/pages/BestBottlesPipeline.tsx` — the workbench UI
- Image Library page — grep the `/image-library` route component (add the lineage/clean filter here)
- `scripts/bestBottlesReferenceIntake.ts` — builds reference-intake.json; `DEFAULT_CANONICAL_RENDER_ROOT`
- `public/data/best-bottles-reference-intake.json` — coverageStatus state machine
- `public/data/best-bottles-madison-generation-batches.json` — bulk generation batches (use; don't rebuild)
- `supabase/migrations/20260422010000_library_tags_column.sql` — library_tags surface
- `supabase/functions/generate-madison-image` — generation engine
- `src/config/imagePresets.ts` — on-brand rubric (#F5F3EF)

## 8. Guardrails
- Don't do a destructive reset of the pipeline. Generation history + the 642 keepers +
  live-reference URLs + measurement intake are real signal. Reclassify, don't wipe.
- Keep good images regardless of origin; quality decides "done", not provenance.
- Don't push to Shopify or mutate references from the UI build — those are Cowork lanes.
- The clean/drift-free count is supposed to start at 0. Don't backfill it from legacy.

---

## 9. Shopify publish authorization (Cylinder guard) — added 2026-09-11

Cylinder SKUs (`GB-CYL-*`, `GB-TCYL-*`, `GBCyl*`, `GBTallCyl*`) are covered by a
publish guard in `supabase/functions/_shared/shopifyPublishGuard.ts`. Before it
will let an image reach Shopify it requires all of:

- the exact `pipelineSkuJobId` on the push item, matching the job row;
- the job owned by the org, `status = 'approved'`, with
  `generated_image_id = approved_image_id = item.imageId`;
- the image carrying exactly one status tag, `status:approved-keep`;
- the image URL https and identical to both job image URLs;
- **a single-use authorization row** in `shopify_publish_authorizations`, passed
  as `item.publishAuthorizationId` and claimed atomically at push time.

### Getting an authorization

`mint-shopify-publish-authorization` issues them. It runs the *same* guard in
dry-run mode before writing a row, so minting criteria cannot drift from
enforcement criteria — a rubber-stamp minter would defeat the guard. Rows are
single-use, expire after 10 minutes, and are consumed by
`push-shopify-product-images`.

Client side, call `attachPublishAuthorizations` from
`src/lib/bestBottlesShopifyPublishAuthorizationClient.ts` **between the dry-run
preflight and the real push**. It mints only for guarded SKUs and throws rather
than authorizing a partial batch.

### Two traps to remember

1. **The guard short-circuits on `dryRun`**, returning before the authorization
   check. A clean preflight therefore does *not* mean the write will succeed.
   This is why the original break looked like it came out of nowhere.
2. **Ad-hoc pushes cannot satisfy the guard.** The Image Library bulk push has no
   pipeline job identity, so it refuses Cylinder SKUs up front and points the
   user at Pipeline / Product Hub. Do not "fix" that by minting from the library
   path — the job identity is the whole point of the guard.

### History

The guard shipped in `dbe4c7d` (2026-07-20) but nothing ever minted
authorizations, and `buildBestBottlesShopifyPushItemFromSkuJob` never set
`pipelineSkuJobId`. The guarded build went live 2026-09-05 05:45 UTC, 23 minutes
after the last successful Cylinder push, so the break sat latent — no Cylinder
job has been in `status = 'approved'` since. Both gaps were closed 2026-09-11.
