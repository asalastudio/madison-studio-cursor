# Cylinder reference re-export — Cowork spec

**Status:** ready for the reference-prep lane · drafted 2026-09-19
**Blocks:** 16 of the 29 remaining Cylinder hero groups
**Madison-side owner of the downstream steps:** this repo (promotion + generation)

## Why this exists

29 Cylinder product groups still have no Madison-rendered hero. None of them are
generation problems — Madison's rig, prompt and QA are working, and the three
heroes shipped in website release 7 prove the path end to end.

They are blocked because their approved reference is a 360×480 or 350×450
thumbnail, against a 0.4 megapixel founder-approved floor.

The obvious shortcut does not work, and should not be made to work. Pointing the
batch runner at better local images (`--reference-folder`) passes preflight —
"ready-to-generate: 16" — and then fails at
`invokeWithCylinderVerifiedReference` in
`src/lib/bestBottlesCylinderRoleAuthority.ts`:

> Cylinder generation invocation requires its exact immutable role URL.

That guard requires the reference handed to the provider to be byte-identical to
the approved immutable role reference: matching `publicUrl`, matching
`exportSha256`, matching `roleId`. It is the only bridge from verification to
generation, and it exists precisely to stop a better-looking image being
substituted for an approved one. **Do not route around it.** The way to use a
better image is to make it the approved one.

## What Madison needs back

New exports that can enter the sealed readiness artifact as the *source* role
reference, so that `promote-cylinder-reviewed-role-references.ts` can promote
them and generation can consume them.

### Output contract (hard — the promotion script rejects anything else)

| Property | Required value | Enforced at |
|---|---|---|
| Dimensions | exactly **2080 × 2288** | `validate…Candidate`, output check |
| Alpha | fully opaque, no partial alpha | promotion + batch preflight |
| Background | Bone `#F5F3EF` (245, 243, 239) | canvas lock |
| Format | PNG | storage contract |
| Resolution origin | **native PSD re-export, never an upscale** | see note below |

The site heroes at 1560×1716 are *not* an acceptable input. Scaling 1560 → 2080
invents detail, and the candidate would bind a `canonicalGeometrySha256` to
pixels that were interpolated rather than photographed.

### Role and topology

Each export declares one role:

- `identity-cap-on` — assembled, cap on. `topology: "assembled-cap-on"`,
  `approvedException: null`.
- `pdp-cap-off-sidecar` — bottle with its closure detached and standing to the
  right on the same baseline. `topology: "fitment-attached-cap-right-sidecar"`.

The `2. 18-415 Bottles/31. Capped & Uncapped, …` tree already carries both
states for several SKUs, which is the shape this wants.

### Review signature (per candidate, no default)

`promote-cylinder-reviewed-role-references.ts` refuses a candidate without:

- `review.finalStatus` — `approved` or `reviewed`
- `review.reviewerId` — a real person
- `review.reviewedAt` — parseable timestamp
- `review.sourceSha256` / `review.outputSha256` / `review.canonicalGeometrySha256`
  binding the exact bytes reviewed

This signature is a human act. Madison cannot generate it.

## Scope — 16 recoverable, 13 not

Full machine-readable map: `tmp/bestbottles-generation/cylinder-remaining-29.json`
plus the PSD index built against
`~/Projects/Clients/Nemat-International/Best-Bottles-Original-Photoshop-Sources`
(4,493 PSD/PSB files).

### A. Source located, ready to re-export (14)

| Website SKU | PSD location (relative to the estate root) |
|---|---|
| `GBSpry3mlClBlk` | `Small spray bottles 3ml and 4ml/GBSpry3mlClBlk.psd` |
| `GBSpry4mlClBlk` | `Small spray bottles 3ml and 4ml/GBSpry4mlClBlk..psd` |
| `GBCyl5SpryBlkMatt` | `5. 13-415 Bottles PSD/2. Clear 5ml Cylinder/3. GBCyl5SpryBlkMt.psd` |
| `GBTallCyl9MtlRollBlkDot` | `5. 13-415 Bottles PSD/13. Tall Cylinder 9ml/` — **see ambiguity below** |
| `GBCyl50AnSpMtSl` | `2. 18-415 Bottles/2. Cylindrical 50ml/1. Cylindrical 50ml PSD/35. GBCyl50AnSpMtSl.psd` |
| `GBCyl50AnSpTslMtSl` | `…/2. Cylindrical 50ml/1. Cylindrical 50ml PSD/49. GBCyl50AnSpTslMtSl.psd` |
| `GBCyl50SpryMtGl` | `…/2. Cylindrical 50ml/1. Cylindrical 50ml PSD/11. GBCyl50SpryMtGl.psd` |
| `LBCyl50LtnMtGl` | `…/2. Cylindrical 50ml/1. Cylindrical 50ml PSD/14. LBCyl50LtnMtGl.psd` |
| `GBCyl50RdcrMtSl` | `…/2. Cylindrical 50ml/1. Cylindrical 50ml PSD/9. GBCyl50RdcrMtSl.psd` |
| `GBCyl100AnSpMtSl` | `…/3. Cylindrical 100ml/1. Cylindrical 100ml PSD/35. GBCyl100AnSpMtSl.psd` |
| `GBCyl100AnSpTslMtSl` | `…/3. Cylindrical 100ml/1. Cylindrical 100ml PSD/49. GBCyl100AnSpTslMtSl.psd` |
| `GBCyl100SpryMtGl` | `…/31. Capped & Uncapped, 18-415 Lotion and Sprayers/Capped/3. 100ml Cyl…` |
| `LBCyl100LtnMtGl` | `…/31. Capped & Uncapped, 18-415 Lotion and Sprayers/Capped/3. 100ml Cyl…` |
| `GBCyl100RdcrMtSl` | `…/3. Cylindrical 100ml/1. Cylindrical 100ml PSD/9. GBCyl100RdcrMtSl.psd` |

Plus `GBSpry1ozGl` (30 ml fine mist): the tree
`2. 18-415 Bottles/1. Cylindrical 30ml/1. Cylindrical 30ml PSD` exists but no
filename matched — **please confirm by eye** whether the source is there under
another name. That SKU is also one of the two canon-police conflicts below.

> ### ⚠ Naming ambiguity Cowork must resolve, not Madison
>
> The estate abbreviates where the website SKU spells out: `Matt` → `Mt`,
> `Sht` → `Sh`. Matching on that is safe.
>
> **`Mtl` is not safe.** The Tall Cylinder 9 ml tree carries *both*
> `26. GBTallCyl9RollMtlBlkDot.psd` and `27. GBTallCyl9RollBlkDot.psd` — a metal
> roller ball and a plastic one, two different products. A normaliser that
> strips `Mtl` collapses them into one key. Every roll-on in this list needs a
> human to confirm which file is the metal-roller version before export.
> (Madison's own first pass made exactly this mistake; it is recorded here so it
> is not repeated downstream.)

### B. No source in the estate (13) — not a re-export job

These need photography or a different source, and should not be blocked on
Cowork's export queue:

- **25 ml group (6):** `GBcyl25AnSpIvyGl`, `GBcyl25AnSpTslIvyGl`, `GBCyl25DrpGl`,
  `GBcyl25SpryMtGl`, `LBCyl25LtnMtGl`, `GBCyl25RdcrShnGl`. The estate has 30, 50
  and 100 ml cylinders under 18-415 and **no 25 ml tree at all** — zero files
  match `cyl25`.
- **Plastics (3):** `PbClear4ozFlpWh`, `PbClear8ozFlpWh`, `PbNat16ozFlpWh`. The
  plastic tree holds only 1 oz and 10 ml.
- **Matte-gold short-cap variants (4):** `GBCyl5GlMattSht`, `GBCylBlu5SlMattSht`,
  `GBTallCyl9GlMattSht`, `GBTallCylFrst9GlMattSht`. The trees hold `BlkSht` and
  `WhtSht` but no gold-matte short cap. These are also missing from Madison's
  27 June Convex snapshot, so they need a catalog re-sync regardless.

### C. Two data conflicts worth a human look

Independent of resolution, canon police condemns these because the reference and
the catalog disagree about the bottle's shape:

- `GB-SPR-CLR-30ML-GLD` — reference vessel aspect **4.081** vs canon body
  **1.210** (ratio 3.37; allowed 0.97–1.55)
- `GB-SPR-CLR-3ML-BLK` — aspect **4.212** vs canon **2.643** (ratio 1.59)

One of the two sources is wrong. Worth resolving before exporting either.

## Downstream, once the artifact lands

Madison runs, in order:

1. `npx tsx scripts/best-bottles/build-cylinder-role-aware-readiness.ts`
   — re-seals `public/data/best-bottles-cylinder-sidecar-promotion.json` from the
   production-readiness file and the promotion/execution manifests under
   `tmp/best-bottles-reference-production/`.
2. `npx tsx scripts/best-bottles/promote-cylinder-reviewed-role-references.ts --candidates … --role-artifact … --canonical-roster …`
   — dry run first, then `--execute` to upload to immutable storage.
3. `npx tsx scripts/best-bottles/generate-family-batch.ts --family Cylinder --skus … --manifest …`
   — with `BB_GEN_MAX_ATTEMPTS=1` and a dedicated manifest.
4. Index the approved outputs into a website hero release
   (`scripts/publish-sunburst-heroes.mjs release-<n>`), as releases 6 and 7 did.

Steps 2–4 are mechanical and already covered by tests. Step 1 is the one that
must consume Cowork's artifact rather than anything Madison invents.

## What this unblocks

14–15 of the 29 remaining groups, taking Cylinder from 23 of 52 to roughly 38.
The other 13 need a catalog decision or new photography, and the 5 bulb/tassel
groups remain held for the 1536×1024 canvas by design.
