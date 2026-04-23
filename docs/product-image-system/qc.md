# QC — Product Image System (Paper-Doll Lane)

QC checks run after each `gpt-image-2` generation and before the operator's
Approve button becomes live. They produce a `QcResult` with a `checks` array
and a `passed` boolean that is true iff every `hard_fail` check passed.

The QC module is in `src/lib/product-image/qc.ts`. It's deliberately scoped
narrow for the pilot — hard checks are either **purely deterministic**
(background hex sampling, canvas dimension check) or **flagged for human
review** (reflection aesthetics, "feels real"). No ML classifier runs at
this stage.

## 1. Severity levels

- **`hard_fail`** — the image fails QC. Blocks Approve. Operator can retry
  with a retry prompt from `prompt-pack.md`.
- **`soft_warning`** — the image passes QC. Surfaces a warning in the UI so
  the operator can review and decide. Does not block Approve.

## 2. Check catalog

### Shared checks (all body + component + variant outputs)

| Check id | Severity | What it checks |
|---|---|---|
| `background_exact_hex` | hard_fail | Samples 9 points in the 50px-from-edge border region. Each sampled pixel must be within a small tolerance of `#EEE6D4` (sRGB). Rejects anything that came back with transparency, a white background, a mismatched tint, or an image crop. |
| `canvas_size_matches_family` | hard_fail | Image dimensions must equal the family's `geometry_spec.canonicalCanvas`. A mismatch means the generator returned the wrong size. |
| `center_alignment` | hard_fail | Horizontal centroid of the non-background foreground pixels must fall within a small `±tolerancePx` window of canvas center. Rejects off-center outputs. |
| `bottom_anchor_locked` | hard_fail | Bottom-most foreground pixel row must match `geometry_spec.bottomAnchor.y` within `toleranceY` (typically ±6 px). Catches geometry drift. |
| `aspect_ratio_sane` | soft_warning | Bounding box aspect ratio must be within reasonable bounds for the family (e.g. cyl-9ml body aspect ≈ 3.5:1 ± 10%). Flags obvious distortions. |

### Clear body (`body_clear_master` and `body_enhanced`)

| Check id | Severity | What it checks |
|---|---|---|
| `no_blue_tint_in_clear` | hard_fail | Samples mid-body pixels. Mean hue must be achromatic within tolerance; mean saturation must be under a low threshold. Blocks bodies that came back blue / green / yellow. |
| `no_broad_reflection_stripe` | soft_warning | Detects a single bright vertical strip dominating the body midline (heuristic: percentage of saturated-white pixels along a central column). Flags the "CGI light bar" failure. |
| `no_internal_checkerboard` | hard_fail | Inside the body bounding box, no pixel should be fully transparent. Catches the "transparency leaked into the bottle" failure mode. |
| `thread_crispness` | soft_warning | Measures local gradient strength at the `neckRegion` Y band. Flags softened / blurred threads. Heuristic — warn only. |
| `base_thickness_believable` | soft_warning | Measures vertical variance at `bottomAnchor.y ± 30 px`. Flags suspiciously thin or fake-looking bases. Heuristic — warn only. |

### Material variants (cobalt / amber / frosted / swirl)

| Check id | Severity | What it checks |
|---|---|---|
| `variant_silhouette_matches_master` | hard_fail | Compute the silhouette mask of the variant and the clear master. Intersection-over-union must exceed a threshold (pilot: 0.95). Catches geometry drift between master and variant — the single most important derivation failure. |
| `variant_hue_within_target` | soft_warning | For tinted variants, the mean hue of body pixels must fall within the expected band (cobalt: blue range; amber: orange-yellow range). Flags variants that came back under- or over-tinted. |
| `variant_position_matches_master` | hard_fail | Center-X and bottom-anchor must match the clear master exactly (same tolerances as the shared checks). |

### Frosted variant (additional)

| Check id | Severity | What it checks |
|---|---|---|
| `frosted_is_not_tinted` | soft_warning | Frosted should be achromatic. Same as `no_blue_tint_in_clear` but run on the frosted variant. Warn if any residual tint. |

### Components (fitments / caps)

| Check id | Severity | What it checks |
|---|---|---|
| `component_on_plate` | hard_fail | Same as `background_exact_hex` — fitments and caps in this lane also render on parchment cream. |
| `component_centered` | hard_fail | Fitments and caps are also centered horizontally on the canvas. |

### Assembly preview

| Check id | Severity | What it checks |
|---|---|---|
| `fitment_seating_natural` | soft_warning | Heuristic: the fitment's bottom edge must visually overlap the bottle's neck region without a visible gap or a visible penetration band. Warn only — aesthetic judgment still lands with the operator. |
| `cap_seating_natural` | soft_warning | Same for the cap on the fitment. |
| `no_phantom_base_shadow` | soft_warning | The assembly's contact shadow must match the clear master's shadow position and intensity. Flags doubled / misaligned shadows. |

## 3. `QcResult` construction

```ts
const result: QcResult = {
  passed: checks.every((c) => c.severity === "soft_warning" || c.passed),
  checks,
  retryNeeded: checks.some((c) => c.severity === "hard_fail" && !c.passed),
  retryReasons: checks
    .filter((c) => c.severity === "hard_fail" && !c.passed)
    .map((c) => c.note),
};
```

`retryReasons` feeds directly into the retry-prompt selection in
`src/lib/product-image/promptBuilders.ts`. Each failure id has a corresponding
retry prompt documented in `prompt-pack.md`.

## 4. What the pilot QC module actually ships

All the checks above are **scaffolded** in `qc.ts` as pure functions that
take an image + family spec and return a `QcCheck`. For the pilot:

- **Deterministic checks** (`background_exact_hex`, `canvas_size_matches_family`,
  `center_alignment`, `bottom_anchor_locked`, `no_internal_checkerboard`,
  `variant_silhouette_matches_master`, `variant_position_matches_master`)
  are **implemented** using a small canvas / pixel-sampling helper.
- **Heuristic checks** (everything else) ship as `soft_warning`-only stubs
  that return `passed: true` with a TODO note so they don't block the flow.
  These can be fleshed out per-failure as QC learns what real `gpt-image-2`
  outputs fail on.

This keeps the pilot honest: the hard gates are real, and the operator
still sees every variant in the lineup to judge aesthetically before
clicking Approve.
