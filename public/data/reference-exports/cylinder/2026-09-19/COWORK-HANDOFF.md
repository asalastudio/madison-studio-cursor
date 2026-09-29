# Cylinder reference re-export — Cowork drop 2026-09-19

33 PNGs, 21 hero groups (12 with both roles). All 2080×2288, RGB (no alpha channel),
Bone #F5F3EF, PSD-native layer composite, **no upscaling**. Every file is a CANDIDATE:
nothing here is reviewed, signed or approved.

Validate: `npx tsx scripts/best-bottles/validate-reference-export-drop.ts public/data/reference-exports/cylinder/2026-09-19`
(Cowork ran an equivalent Python check — size, mode, corners, 40px border, registry names,
baseline, source-PSD hash unchanged — 33/33 pass. The tsx validator itself was not run.)

- `cowork-export-provenance.json` — per file: source PSD path + SHA-256, output SHA-256, layers kept/dropped, native px, scale.
- `candidates.UNSIGNED.template.json` — ReviewedCylinderRoleCandidate shape, review + sealed-artifact fields left null on purpose.
- QA, review sheets, exporter script, held files: `tmp/bestbottles-generation/cowork-cylinder-reexport-2026-09-19/`

## How it was exported
Full-canvas opaque white background layer dropped; remaining visible art layers composited with the
artist's own alpha over Bone; trimmed; centred; foot baseline y=2105 (0.92·H). Native pixels wherever
the product fits inside a 4% top / 5% side margin; otherwise Lanczos **down**scale only
(100 ml spray/lotion/reducer ×0.77–0.87, 3 ml ×0.94, 4 ml ×0.84–0.88). Clear glass is painted opaque
white in the PSDs and is exported literally (Jordan's call, 2026-09-19).

## Needs a human before signing
1. **Mtl roll-ons** (GBTallCyl9MtlRollBlkDot, GBTallCylFrst9MtlRollBlkDot): sidecars exported from BBUAT
   `26. …MtlRollBlkDot.psd`. The render shows a dark chrome ball; the plastic sibling `27. …RollBlkDot.psd`
   shows a translucent one (comparison in QA `leads-unconfirmed/`). Confirm. Their fitment layer carried a
   flat white cover-up polygon, which was knocked out (pixel count in provenance).
2. Their **cap-on** sources exist as `26. … copy.psd` (the coverage index misses the " copy" suffix) but the cap
   layer is an un-cut photo with a near-white surround — not a clean source. Held in QA `needs-artist-unclean-source/`.
3. **3 ml / 4 ml**: each SKU is a PSD pair (overcap on / overcap beside); names are swapped between sizes
   (`GBSpry3mlClBlk..psd` = cap-on, `GBSpry4mlClBlk.psd` = cap-on). 3 ml sidecar has the overcap on the LEFT —
   held in QA `needs-role-decision/`. 3 ml canon-police conflict still open.
4. **Bulb / tassel atomizers** (25/50/100 ml AnSp, AnSpTsl — 6 cap-on files): exported because spec table A lists them,
   but the spec also says bulb/tassel groups are held for the 1536×1024 canvas. Drop them if that hold applies.
   The 100 ml pair comes from 720×1152 / 1152×1152 PSDs, so the product is only ~1,090 px tall on the canvas.
5. Scale is per-source, not per-family: a 100 ml spray (×0.77) and a 100 ml atomizer (native, small PSD) are not
   mutually to scale. Canonical geometry must come from canon, not from these pixels.

## No source (unchanged from spec)
PbClear4oz/8oz, PbNat16oz; GBSpry1ozGl (only the silver `GBSpry1ozSl.psd` exists — Decorative Glass bottles);
matte-gold short caps ×4 (estate has `28. …Gl.psd` / `29. …Sl.psd` shiny short caps — renders in QA
`leads-unconfirmed/`, not the matte SKU); GBMtlRoll28Blk. The `BOSpry1oz`, `BOSpry1ozSl`, `BOCylRoll28` folders in BBUAT are empty.
