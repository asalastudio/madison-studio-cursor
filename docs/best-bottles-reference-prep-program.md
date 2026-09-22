# Best Bottles reference prep — the whole program

**Drafted 2026-09-19** · companion to
`docs/best-bottles-cylinder-reference-reexport-spec.md`
**Machine-readable:** `tmp/bestbottles-generation/psd-source-coverage.json`
**Regenerate:** `npx tsx scripts/best-bottles/index-psd-source-coverage.ts`

## The number that matters

The deliverable is **one hero per storefront product group**, not per SKU:
**370 distinct groups** in `catalog-heroes.json` (391 rows; 21 groups carry a
second row). Not 2,480 — that is the SKU-job count and has never been the target.

Every remaining hero is blocked on the same thing: an approved immutable role
reference at 2080×2288. Generation is not the bottleneck. Madison's rig, prompt,
shoulder lock and QA are proven — website releases 6 and 7 put 23 Cylinder heroes
on the live site.

So the real question is "which families *can* be prepared", and the answer is
better than expected:

**306 of 370 groups (83%) have a Photoshop source located. 186 have both roles.**

Indexed across two estates, ~10,800 files:

| Estate | Files | Shape |
|---|---|---|
| `BBUAT-Upload-Files` | 6,337 | splits `1. PSD Uncapped` / `2. PSD Capped` — exactly the two reference roles |
| `Best-Bottles-Original-Photoshop-Sources` | 4,493 | organised by thread size; holds products BBUAT does not |

They are not interchangeable. BBUAT's capped/uncapped split is what makes
`identity-cap-on` and `pdp-cap-off-sidecar` separable without re-compositing.

## Coverage by family

`both` = capped and uncapped sources both present, the ideal case.
`unk` = source found but outside the capped/uncapped trees, so the role needs a
human call.

| Family | Groups | Sourced | Both | capOff | capOn | unk | None | Cover |
|---|---|---|---|---|---|---|---|---|
| Cylinder | 52 | 43 | 33 | 2 | 6 | 2 | 9 | 83% |
| Elegant | 33 | 32 | 24 | 0 | 8 | 0 | 1 | 97% |
| Circle | 27 | 27 | 19 | 0 | 8 | 0 | 0 | **100%** |
| Boston Round | 23 | 22 | 22 | 0 | 0 | 0 | 1 | 96% |
| Sleek | 21 | 21 | 16 | 0 | 5 | 0 | 0 | **100%** |
| Diva | 21 | 21 | 14 | 0 | 7 | 0 | 0 | **100%** |
| Round | 21 | 21 | 13 | 0 | 8 | 0 | 0 | **100%** |
| Slim | 15 | 15 | 10 | 0 | 5 | 0 | 0 | **100%** |
| Vial | 17 | 13 | 2 | 0 | 9 | 2 | 4 | 77% |
| Empire | 11 | 11 | 7 | 0 | 4 | 0 | 0 | **100%** |
| Decorative | 12 | 10 | 0 | 2 | 3 | 5 | 2 | 83% |
| Rectangle | 7 | 7 | 5 | 1 | 1 | 0 | 0 | **100%** |
| Tulip | 6 | 6 | 6 | 0 | 0 | 0 | 0 | **100%** |
| Roll-On Cap | 6 | 6 | 0 | 0 | 0 | 6 | 0 | **100%** |
| Cream Jar | 13 | 5 | 0 | 0 | 0 | 5 | 8 | 39% |
| Apothecary / Diamond / Grace | 15 | 15 | 6 | 0 | 9 | 0 | 0 | **100%** |
| Aluminum Bottle | 7 | 4 | 0 | 0 | 2 | 2 | 3 | 57% |
| Sprayer | 7 | 4 | 0 | 0 | 0 | 4 | 3 | 57% |
| Royal / Flair / Square / Teardrop / Dropper / Atomizer / Lotion Pump / Cap-Closure | 23 | 22 | 9 | 0 | 2 | 11 | 1 | 96% |
| Plastic Bottle | 2 | 1 | 0 | 0 | 0 | 1 | 1 | 50% |
| **Gift Bag** | 11 | 0 | — | — | — | — | 11 | **0%** |
| **Gift Box** | 7 | 0 | — | — | — | — | 7 | **0%** |
| **Bell / Lotion Bottle / Tool / Pillar / Packaging Supply** | 13 | 0 | — | — | — | — | 13 | **0%** |

## The handoff itself

Per-family work orders live in
**`public/data/reference-exports/work-orders/`** — one CSV per family, 36 of
them, plus a `README.md` index ordered by tier.

Each row is **one role of one hero group**, carrying the exact Photoshop file to
open and the exact filename to save:

| Column | Meaning |
|---|---|
| `groupSlug`, `websiteSku`, `graceSku` | the hero group this serves |
| `exportFileName` | save as exactly this — `<websiteSku>__<graceSku>.png` |
| `role` | which folder it goes in |
| `psdEstate`, `psdPath` | the file to open |
| `status` | `ready` / `missing-role` / `needs-role-decision` / `no-source` |
| `note` | flags SKU-alias matches, e.g. the 25 ml → 30 ml relabel |

Across all families: **778 role rows — 454 ready, 158 missing the second role,
38 needing a role decision, 128 with no source.**

A family is pickable when its CSV has `ready` rows. Nothing else needs reading
first except the output contract below.

Regenerate both artifacts after any estate or registry change:

```
npx tsx scripts/best-bottles/index-psd-source-coverage.ts
npx tsx scripts/best-bottles/emit-reference-work-orders.ts
```

## How to sequence this

### Tier 1 — start here (128 groups, 100% sourced)

Circle 27, Sleek 21, Diva 21, Round 21, Slim 15, Empire 11, Rectangle 7, Tulip 6.
Every group has a source, and most have both roles. These need no decisions, only
export capacity.

**Slim is the best first family.** 15 groups, 100% sourced, 10 with both roles,
and its glass-body structure is already understood: 129 SKUs report 10 distinct
height × diameter pairs but collapse to **3 bodies** once the known junk
diameters (72/78 mm) are dropped —
`slim:30-standard` 87×30, `slim:50-standard` 121×31, `slim:100-standard` 154×37.
Madison can propose and flag the residual contradictions with
`npx tsx scripts/best-bottles/qualify-family-bodies.ts --family Slim`.

### Tier 2 — high coverage, one or two decisions (65 groups)

Elegant 33 (1 missing), Boston Round 23 (1 missing, and 22 of 22 have both
roles — the cleanest ratio in the catalog), Apothecary/Diamond/Grace 15.

### Tier 3 — needs a role call before export (≈30 groups)

Roll-On Cap 6, Cream Jar 5, Sprayer 4, Teardrop 3, Dropper 3, Decorative 5: a
source exists but sits outside the capped/uncapped trees, so which role it fills
is a human judgement.

### Tier 4 — no source at all (64 groups)

**31 of these are probably not bottle-pipeline work**: Gift Bag 11, Gift Box 7,
Bell 3, Lotion Bottle 3, Tool 3, Pillar 2, Packaging Supply 2. Before anyone
photographs anything, decide whether these belong in the hero program at all.

The rest — Cylinder 9, Cream Jar 8, Vial 4, Aluminum 3, Sprayer 3 — need
photography or a catalog decision.

## Output contract (identical for every family)

| Property | Required |
|---|---|
| Dimensions | exactly **2080 × 2288** |
| Alpha | fully opaque |
| Background | Bone `#F5F3EF` (245, 243, 239) |
| Format | PNG |
| Origin | **native PSD re-export, never an upscale** |

Plus a per-candidate human review signature (`reviewerId`, `reviewedAt`,
`finalStatus: approved`) binding the exact source, output and canonical-geometry
hashes. Madison cannot generate that signature.

Full rationale, the promotion chain, and the guard that makes shortcuts
impossible: `docs/best-bottles-cylinder-reference-reexport-spec.md`.

## Two traps, both already paid for

**1. `Mtl` is not an abbreviation.** The estates write `Mt` for `Matt` and `Sh`
for `Sht` — safe to match on. But `GBTallCyl9RollMtlBlkDot` and
`GBTallCyl9RollBlkDot` are a metal roller ball and a plastic one: two different
products. A normaliser that strips `Mtl` merges them silently. Madison's first
matching pass made exactly this mistake.

**2. Storefront capacity labels can be wrong.** The "25 ml" Cylinder group is
mislabelled — the SKU and both estates call that bottle **30 ml**
(`GBcyl25SpryMtGl` → `GBCyl30SpryMtGl.psd`). Six groups were reported as having
no source until that alias was applied. Assume other families carry similar
label drift, and match on the SKU rather than the displayed capacity.

## What this is not

A located PSD is a **candidate for re-export**, not an approved reference.
Nothing in this document authorises generation. The coverage index writes to no
external system and makes no approval claim.
