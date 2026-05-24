# Madison app — agent notes

## Product image pipeline — pixel sizes

| Stage | Dimensions | Ratio |
|-------|------------|--------|
| OpenAI raw output (`grid-images/output/openai/raw/*.png`) | 2080 × 2288 | 10:11 |
| Paper-doll composition canvas (`manifest` / `geometry_spec`) | 1000 × 1300 | 10:13 |
| Example Sanity CDN hero (paper-doll group) | 928 × 1152 | ~4:5 |

Note: as of 2026-04-26 catalog masters render at 2080×2288 (was 2000×2200) so both edges are multiples of 16, complying with gpt-image-2's size constraint. The 10:11 ratio is exact and preserved.

Constants: `src/config/productImageDimensions.ts`. Detail: `docs/product-image-system/pixel-contracts.md`.
