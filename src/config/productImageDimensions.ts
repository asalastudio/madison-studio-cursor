/**
 * Authoritative pixel dimensions across the product-image / paper-doll pipeline.
 *
 * Use these constants in UI copy, QC expectations, and docs — not magic numbers.
 * Sanity and CDN heroes are delivery-sized; composition canvas and raw OpenAI
 * outputs are upstream artifacts (different stages).
 */

/**
 * Raw PNGs from pipeline image-gen (OpenAI path), e.g. `grid-images/output/openai/raw/*.png`.
 *
 * Bumped 2026-04-26 from 2000×2200 to 2080×2288 to comply with
 * gpt-image-2's "both edges multiple of 16" constraint (2200/16=137.5
 * is invalid). Ratio preserved exactly: 2080:2288 = 10:11.
 */
export const PIPELINE_OPENAI_RAW_PX = {
  width: 2080,
  height: 2288,
} as const;

/** Aspect width:height = 10:11 (exact) */
export const PIPELINE_OPENAI_RAW_RATIO = 2080 / 2288;

/**
 * Representative live Sanity CDN hero from a paper-doll group (sample; actual
 * assets may vary slightly with transforms).
 */
export const SANITY_HERO_SAMPLE_PX = {
  width: 928,
  height: 1152,
} as const;

/** ≈ 4:5 */
export const SANITY_HERO_SAMPLE_RATIO = 928 / 1152;

/**
 * Paper-doll composition canvas — components and manifest `canonicalCanvas`
 * for the local extract → Madison ingest handoff.
 */
export const PAPER_DOLL_CANVAS_PX = {
  width: 1000,
  height: 1300,
} as const;

/** Aspect width:height = 10:13 */
export const PAPER_DOLL_CANVAS_RATIO = 1000 / 1300;
