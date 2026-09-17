# Best Bottles Scale-Card Rig Design

**Status:** Approved by Jordan Richter on 2026-09-16.

## Outcome

Madison Studio will generate Best Bottles catalog heroes with
`gpt-image-2.5-sunburst` while deterministic code owns physical scale,
baseline, centerline, canvas, and QA. The approved universal scale card replaces Madison's
capacity-based assembled-height scale for Best Bottles catalog masters.

## Scale contract

- Canonical source: Best Bottles
  `data/asset-ledger/scale-card.json`.
- Version: `best-bottles-scale-card-v1-2026-09-16`.
- Input: verified bare-glass `heightWithoutCap` in millimetres.
- Mapping: monotone PCHIP through:
  `20→23.0`, `40→33.0`, `68→46.7`, `78→52.4`, `106→65.5`,
  `117→68.0`, `154→74.0`, `195→80.0`.
- Output: bare glass foot-to-rim height as a percentage of the 10:11 canvas.
- Baseline: glass foot at 91% from the canvas top (`baselinePct: 9` from bottom).
- Tag: nearest 10 mm, clamped to `S20…S200`.
- Canvas: generate at 2080×2288; deliver at 1560×1716. Percentage targets are
  identical on both canvases.

## Ownership

- Best Bottles owns the canonical JSON, approval record, previous-lock
  amendments, and storefront release.
- Madison carries a versioned mirror of the contract because its Vite/Node and
  Supabase/Deno runtimes cannot import the Best Bottles repository.
- A parity test pins the version and every control point in both Madison
  runtimes.
- `gpt-image-2.5-sunburst` owns photoreal glass, metal, lighting, and contact
  shadow only. The Best Bottles scale-card lane has no model fallback and
  ignores a stale `OPENAI_IMAGE_MODEL` override.
- The deterministic rig owns PSD/reference geometry, glass size, fitment
  proportion, centerline, baseline, recanvas, and acceptance.

## Generation flow

1. Inventory and load every approved flat PNG reference into its exact family,
   body, and fitment cohort before generation.
2. Deduplicate fitments only by physical identity:
   `neckThreadSize × applicator geometry × finish/color × cap state`.
3. Read verified `heightWithoutCap`.
4. Resolve scale-card percent, target glass pixels, and S-tag.
5. Add the exact glass target and baseline to the GPT prompt.
6. Generate one canonical example per physical fitment cohort with
   `gpt-image-2.5-sunburst`; reject any other resolved model
   before provider spend.
7. Use source/body control geometry to scale the whole assembly about the
   glass foot until bare glass lands on the exact target.
8. Reuse an approved, SHA-pinned fitment master across matching family variants
   instead of spending on duplicate generations.
9. Reject missing or disputed measurements, missing body control geometry,
   geometry drift, baseline drift, wrong canvas, or wrong background.
10. Produce same-zoom before/after proofs with current percent, target percent,
   millimetres, and S-tag.
11. Publish only after Jordan approves the proof.

## First vertical slice

The localhost review surface covers five Cylinder bodies selected to expose the
largest scale changes: 5 ml, 9 ml Classic, 9 ml Slim, 50 ml, and 100 ml. It
shows current and proposed framing side by side and identifies whether each
record has enough body-control evidence for deterministic generation.

The same review surface includes a family reference-readiness matrix. A family
cannot enter bulk generation until all approved flat PNGs are loaded, hashed,
classified, and either assigned to a body/fitment cohort or explicitly rejected.
Its generation budget is the count of missing approved physical fitment cohorts,
not its raw SKU count.

No live GPT generation, Supabase write, Shopify write, Convex write, or
storefront hero swap happens from the preview without a separate explicit
approval.

## Acceptance

- The resolver reproduces every control point exactly and remains monotone.
- The five Cylinder targets are 39.2%, 47.8%, 65.5%, 68.0%, and 74.0%
  respectively (rounded to one decimal).
- The same bare glass receives the same target across every colour and fitment.
- Capacity never participates in scale calculation.
- Missing or invalid bare-glass measurements fail closed.
- Browser and Deno contract copies return identical results.
- Every family reaches 100% classified flat-PNG reference coverage before bulk
  provider spend.
- Fitment reuse never crosses a physical cohort boundary.
- The batch manifest spends at most once per unapproved physical fitment cohort.
- The localhost proof is readable at one zoom and labels every change.
