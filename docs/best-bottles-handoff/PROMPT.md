# Kickoff prompt — paste this to the next agent

You are taking over the Best Bottles hero-image program from another agent. The
goal is one hero image per storefront product group — **352 groups** — at a
consistent, physically honest scale. **41 are done and live** (Cylinder 31 of 52,
Slim 10 of 15) — done means shoulder-locked. Thirty-three families have no
shoulder lock yet. 85 other groups carry Sunburst renders from releases 1-5,
made before the lock existed; Jordan has ruled those do not count.

**Read this first, in full, before generating anything:**
`docs/best-bottles-handoff/HANDOFF.md` in the repo `asalastudio/madison-studio-cursor`,
branch **`feat/bb-scale-card-rig`** (45+ commits ahead of `main`, not merged — do
not work from `main`).

The three things most likely to trip you:

1. **The image model does not achieve the sizing — Madison's rig does.** The model
   misses the target shoulder by ~221 px on average; the rig measures the real
   shoulder and re-seats the bottle to within ~1 px. If you generate with native
   image tools, an image is *not a hero* until it has been through
   `npx tsx scripts/best-bottles/rig-external-image.ts --image <png> --sku <GRACE-SKU>`,
   which writes the 2080×2288 master and the 1560×1716 deliverable and exits
   non-zero if the image fails. It refuses any glass body that has no lock.

2. **A family cannot be generated until its glass bodies are locked.** One number
   per glass body, set by Jordan by eye on an adjustable sheet
   (`build-shoulder-target-sheet.ts`). Only Cylinder (14 bodies) and Slim (3) have
   locks. Without one, identical glass renders up to 17.7% different in size.
   This — not rendering — is the gating work for every remaining family.

3. **References are flattened Photoshop sources that live on Jordan's Mac**, in two
   estates (~10,800 files), not in any repository. If you run in the cloud you
   cannot see them; they must be provided to you. Per-family work orders with
   exact paths are in `public/data/reference-exports/work-orders/`.

Non-negotiables: canvas 2080×2288 → deliverable 1560×1716; Bone `#F5F3EF`; glass
foot on the 91% baseline; ambient contact shadow only; droppers seated **inside**
the bottle, never a sidecar; roll-on caps are phenolic plastic, not metal; there is
no white glass (it is swirl glass with a white cap); shoulder tolerance 2 mm.

Verbatim prompts as the model actually received them are in
`docs/best-bottles-handoff/prompt-exemplars/` — start from those, not from scratch.

Working with Jordan: answer yes or no first; ask before every spend (~$0.42 per
image) and every deploy; get visual sign-off before any release; never push to
Shopify for a demo — it is the live store. Both repositories are public, so scan
for secrets before every push.

Suggested first moves: get sign-off on the one rendered-but-unshipped hero
(5.5 ml fine mist), then lock and generate **Circle** (27 groups, fully sourced).
Before you generate natively at volume, agree with Jordan how those images enter
Madison's library — otherwise the release audit's custody check cannot vouch for
them, and that check is what stops a mis-filed image reaching the storefront.
