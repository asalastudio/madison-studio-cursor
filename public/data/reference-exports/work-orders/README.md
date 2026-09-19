# Reference re-export work orders

Generated 2026-09-19T07:13:22.640Z from `psd-source-coverage.json`.
Regenerate: `npx tsx scripts/best-bottles/index-psd-source-coverage.ts && npx tsx scripts/best-bottles/emit-reference-work-orders.ts`

One CSV per family. Each row is one **role** of one hero group, with the exact
Photoshop file to open. Export to `2080x2288`, opaque, Bone `#F5F3EF`, and save
as `exportFileName` inside the matching role folder — see
`docs/best-bottles-file-naming-contract.md`.

A located PSD is a candidate for re-export, **not** an approved reference.
Promotion additionally requires a human review signature.

| Tier | Family | Groups | Sourced | Both roles | Work order |
|---|---|---|---|---|---|
| 1 | Circle | 27 | 27 | 19 | [`circle.csv`](circle.csv) |
| 1 | Sleek | 21 | 21 | 16 | [`sleek.csv`](sleek.csv) |
| 1 | Diva | 21 | 21 | 14 | [`diva.csv`](diva.csv) |
| 1 | Round | 21 | 21 | 13 | [`round.csv`](round.csv) |
| 1 | Slim | 15 | 15 | 10 | [`slim.csv`](slim.csv) |
| 1 | Empire | 11 | 11 | 7 | [`empire.csv`](empire.csv) |
| 1 | Rectangle | 7 | 7 | 5 | [`rectangle.csv`](rectangle.csv) |
| 1 | Tulip | 6 | 6 | 6 | [`tulip.csv`](tulip.csv) |
| 1 | Diamond | 5 | 5 | 3 | [`diamond.csv`](diamond.csv) |
| 1 | Grace | 5 | 5 | 3 | [`grace.csv`](grace.csv) |
| 1 | Royal | 4 | 4 | 3 | [`royal.csv`](royal.csv) |
| 1 | Flair | 3 | 3 | 3 | [`flair.csv`](flair.csv) |
| 1 | Square | 3 | 3 | 3 | [`square.csv`](square.csv) |
| 2 | Cylinder | 52 | 43 | 33 | [`cylinder.csv`](cylinder.csv) |
| 2 | Elegant | 33 | 32 | 24 | [`elegant.csv`](elegant.csv) |
| 2 | Boston Round | 23 | 22 | 22 | [`boston-round.csv`](boston-round.csv) |
| 2 | Vial | 17 | 13 | 2 | [`vial.csv`](vial.csv) |
| 2 | Decorative | 12 | 10 | 0 | [`decorative.csv`](decorative.csv) |
| 2 | Apothecary | 5 | 5 | 0 | [`apothecary.csv`](apothecary.csv) |
| 2 | Aluminum Bottle | 7 | 4 | 0 | [`aluminum-bottle.csv`](aluminum-bottle.csv) |
| 2 | Atomizer | 2 | 2 | 0 | [`atomizer.csv`](atomizer.csv) |
| 3 | Roll-On Cap | 6 | 6 | 0 | [`roll-on-cap.csv`](roll-on-cap.csv) |
| 3 | Cream Jar | 13 | 5 | 0 | [`cream-jar.csv`](cream-jar.csv) |
| 3 | Sprayer | 7 | 4 | 0 | [`sprayer.csv`](sprayer.csv) |
| 3 | Cap/Closure | 4 | 3 | 0 | [`cap-closure.csv`](cap-closure.csv) |
| 3 | Teardrop | 3 | 3 | 0 | [`teardrop.csv`](teardrop.csv) |
| 3 | Dropper | 3 | 3 | 0 | [`dropper.csv`](dropper.csv) |
| 3 | Plastic Bottle | 2 | 1 | 0 | [`plastic-bottle.csv`](plastic-bottle.csv) |
| 3 | Lotion Pump | 1 | 1 | 0 | [`lotion-pump.csv`](lotion-pump.csv) |
| 4 | Bell | 3 | 0 | 0 | [`bell.csv`](bell.csv) |
| 4 | Lotion Bottle | 3 | 0 | 0 | [`lotion-bottle.csv`](lotion-bottle.csv) |
| 4 | Tool | 3 | 0 | 0 | [`tool.csv`](tool.csv) |
| 4 | Pillar | 2 | 0 | 0 | [`pillar.csv`](pillar.csv) |
| 4 | Packaging Supply | 2 | 0 | 0 | [`packaging-supply.csv`](packaging-supply.csv) |

**Tier 1** fully sourced, start here · **Tier 2** high coverage, a few gaps ·
**Tier 3** role needs a human call · **Tier 4** no source, needs photography or
a scope decision.

## Status values

| Status | Meaning |
|---|---|
| `ready` | PSD located for this role; re-export it |
| `missing-role` | the other role was found, this one was not |
| `needs-role-decision` | a source exists but sits outside the capped/uncapped trees |
| `no-source` | nothing found in either estate |

