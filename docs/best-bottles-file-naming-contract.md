# Best Bottles file naming — reference to UI

**Drafted 2026-09-19.** One convention per stage, from a Photoshop export to a
hero on the storefront. Most of this already exists and is working; the gap it
closes is the Cowork drop, which had no defined shape.

Validate a drop with:

```
npx tsx scripts/best-bottles/validate-reference-export-drop.ts <drop-dir> [--fix-names]
```

## The chain

| # | Stage | Owner | Location | Name |
|---|---|---|---|---|
| 1 | PSD source | Nemat | `BBUAT-Upload-Files/` or `Best-Bottles-Original-Photoshop-Sources/` | as-is, never renamed |
| 2 | **Export drop** | Cowork | `public/data/reference-exports/<family>/<YYYY-MM-DD>/<role>/` | `<websiteSku>__<graceSku>.png` |
| 3 | Promoted reference | Madison | `best-bottles/production-references/<family>/<v1\|sidecar-v2>/<sha[0:2]>/` | `<WEBSITESKU>__<GRACESKU>__<sha256>.png` |
| 4 | Raw generation | Madison | Supabase `generated_images` | content-addressed, no filename |
| 5 | Hero deliverable | Madison | release staging | `<websiteSku>.png` at 1560×1716 |
| 6 | **Site hero** | Website | `public/images/catalog/bone-review/` | `<websiteSku>.<sha12>.png` |
| 7 | Release record | Website | `docs/reviews/sunburst-heroes-release-<n>/` | `approved-lock.json`, `madison-provenance.json`, `registry-rollback.json`, `README.md` |

Stages 3, 6 and 7 are already established and unchanged — stage 6 is what makes
a push to the UI a one-line registry repoint, because the content hash is in the
filename and the registry row points at it.

## Stage 2 — the drop (new)

```
public/data/reference-exports/
  cylinder/
    2026-09-19/
      identity-cap-on/
        GBCyl50SpryMtGl__GB-CYL-CLR-50ML-SPR-MGLD.png
      pdp-cap-off-sidecar/
        GBCyl50SpryMtGl__GB-CYL-CLR-50ML-SPR-MGLD.png
      manifest.json          ← written by the validator, do not hand-edit
```

**Role is the folder, never the filename.** Role is the one field a reviewer
must not be able to get wrong by typo, and a folder is checkable at a glance.

**Both SKUs are in the filename** because the promotion identity key is the
exact `(websiteSku, graceSku)` pair — `GBCyl50SpryMtGl|GB-CYL-CLR-50ML-SPR-MGLD`.
Either alone is ambiguous: one website SKU can front several Grace SKUs.

**Separator is a double underscore.** Grace SKUs contain single hyphens and
website SKUs are camel case, so `__` is the only separator that survives both.

**Dated folders, never overwritten.** A re-export is a new dated drop. Nothing
downstream mutates a drop after promotion, so history stays readable.

### What the validator enforces

| Check | Rule |
|---|---|
| Dimensions | exactly **2080 × 2288** |
| Alpha | fully opaque — any partial alpha fails |
| Corners | Bone `#F5F3EF` (245, 243, 239) within ±2 |
| Filename | resolves to a real hero group in `catalog-heroes.json` |
| Grace SKU | matches that group's registry Grace SKU |
| Role | folder is `identity-cap-on` or `pdp-cap-off-sidecar` |

It exits non-zero on any failure, and `--fix-names` repairs case and separator
drift only — it never invents a mapping and never touches pixels.

It will reject a 1560×1716 site hero, which is deliberate: those are the current
storefront images, and upscaling one to 2080×2288 would bind a canonical-geometry
hash to interpolated pixels. Re-export from the PSD instead.

## Naming traps

**`Mtl` is not an abbreviation.** The estates write `Mt` for `Matt` and `Sh` for
`Sht`, which is safe to match on. But `GBTallCyl9RollMtlBlkDot` and
`GBTallCyl9RollBlkDot` are a metal roller ball and a plastic one — two products.
Any normaliser that strips `Mtl` merges them silently.

**Storefront capacity labels drift from SKU capacity.** The "25 ml" Cylinder
group is mislabelled; the SKU and both estates call that bottle 30 ml
(`GBcyl25SpryMtGl` → `GBCyl30SpryMtGl.psd`). Always match on the SKU, never the
displayed capacity.

**Trailing spaces exist in estate directory names** (`.../1. PSD Uncapped /`).
Quote every path.

## Why stage 6 makes the UI push easy

`<websiteSku>.<sha12>.png` means the filename carries its own content hash, so:

- the registry row's `url` is the proof of which bytes are live;
- a re-render lands at a new path, so caches never serve a stale image;
- `registry-rollback.json` can restore the exact previous bytes;
- `publish-sunburst-heroes.mjs` can hash-check, size-check and corner-check every
  file before repointing, and repoints only SKUs that already have a row.

Keep that property. It is the reason a hero release is an indexing step that
touches no Shopify, Convex or hosted media.
