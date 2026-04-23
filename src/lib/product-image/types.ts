/**
 * Paper-Doll Lane — TypeScript types.
 *
 * Intentionally narrow. This lane does NOT introduce a parallel
 * `BottleFamilySpec` or `ProductImageJob` abstraction — family metadata is
 * read from the existing `PipelineGroup` row (see
 * `src/lib/bestBottlesPipeline.ts`) plus the `geometry_spec` JSONB column
 * added in the 20260423140000 migration.
 *
 * Docs: docs/product-image-system/PRD.md (architecture),
 *       docs/product-image-system/local-script-handoff.md (manifest shape),
 *       docs/product-image-system/qc.md (check catalog).
 */

// ─── Environment plates ──────────────────────────────────────────────────────

/**
 * A governed presentation environment for bottle bodies and components. For
 * the pilot, exactly one plate is registered: `parchment_cream_v1` at
 * `#EEE6D4`. `useAsFinalBackground: true` means renders happen ON the plate
 * (Option A) rather than on transparency — this is why we do not generate
 * clear glass on a transparent canvas.
 */
export interface EnvironmentPlate {
  id: string;
  name: string;
  backgroundHex: string;
  useAsFinalBackground: boolean;
  texture: "flat" | "paper_grain_subtle" | "linen" | "stone";
  lightingStyle: "soft_overhead" | "soft_side" | "neutral_studio";
  tone: "warm" | "neutral" | "cool";
}

// ─── Geometry spec (stored as JSONB on the pipeline row) ─────────────────────

/**
 * Per-fitment seat depth (mm). Keyed by fitment type id matching the values
 * used in the existing `APPLICATOR_TO_FITMENT` map in
 * `src/pages/BestBottlesPipeline.tsx`. Madison-side defaults live in
 * `src/config/productImageGeometry.ts` — not in the v8.3 catalog. Phase 2
 * can override these per row if supplier specs become available.
 */
export type FitmentSeatDepthByType = Record<string, number>;

/**
 * The paper-doll contract for a shape group. Written to
 * `best_bottles_pipeline_groups.geometry_spec` at ingest time by merging:
 *   - canvas + anchor numbers from the local script's `manifest.json`
 *   - physical-mm measurements from the hardcoded pilot registry (or, in
 *     Phase 2, from the imported v8.3 catalog).
 *
 * Numbers are intentionally in different units: pixels for canvas/anchors
 * (script owns these), millimeters for physical dimensions (catalog owns
 * these). Do not mix.
 */
export interface GeometrySpec {
  canonicalCanvas: { widthPx: number; heightPx: number };
  centerXLocked: boolean;
  bottomAnchor: { y: number; toleranceY: number };

  /** Pass-through of the shape-group's thread code (e.g. "17-415"). */
  threadSize: string | null;
  /**
   * Neck outer diameter in mm, parsed from `threadSize` when the thread
   * code follows the `<mm>-<finish>` or `<mm>mm` conventions. Null for
   * non-standard codes (e.g. `"Apothecary"`, `"PRESS-FIT"`).
   */
  neckOuterMm: number | null;

  bodyDimensionsMm: { height: number; width: number };
  capHeightMm: number;
  fitmentSeatDepthMm: FitmentSeatDepthByType;

  /** Bump on incompatible changes so old `geometry_spec` blobs are flagged. */
  anchorVersion: string;
  /** Human-readable provenance line for debugging. */
  source: string;
}

// ─── Component manifest (the local script's output handshake) ────────────────

export type ComponentRole = "bottle" | "fitment" | "cap";

export interface ManifestComponent {
  role: ComponentRole;
  file: string;
  anchorY: number;
  /** Sub-type for fitments/caps (e.g. "roller-ball-metal", "screw-metal"). */
  type?: string;
}

/**
 * Shape of the `manifest.json` the local script writes alongside the
 * component PNGs. See `docs/product-image-system/local-script-handoff.md`
 * for the full contract and failure modes.
 */
export interface ComponentManifest {
  manifestVersion: string;
  runId: string;
  sourceFile: string;
  scriptVersion: string;

  family: string;
  capacityMl: number;
  threadSize: string;
  glassColor: string;

  canonicalCanvas: { widthPx: number; heightPx: number };
  centerXLocked: boolean;
  bottomAnchor: { y: number };

  components: ManifestComponent[];
}

// ─── QC ──────────────────────────────────────────────────────────────────────

export type QcCheckId =
  // shared
  | "background_exact_hex"
  | "canvas_size_matches_family"
  | "center_alignment"
  | "bottom_anchor_locked"
  | "aspect_ratio_sane"
  // clear body
  | "no_blue_tint_in_clear"
  | "no_broad_reflection_stripe"
  | "no_internal_checkerboard"
  | "thread_crispness"
  | "base_thickness_believable"
  // variants
  | "variant_silhouette_matches_master"
  | "variant_hue_within_target"
  | "variant_position_matches_master"
  | "frosted_is_not_tinted"
  // components
  | "component_on_plate"
  | "component_centered"
  // assembly
  | "fitment_seating_natural"
  | "cap_seating_natural"
  | "no_phantom_base_shadow";

export interface QcCheck {
  id: QcCheckId;
  passed: boolean;
  severity: "hard_fail" | "soft_warning";
  /** One-line note — shown in the drawer when a check fails. */
  note: string;
}

export interface QcResult {
  passed: boolean;
  checks: QcCheck[];
  retryNeeded: boolean;
  retryReasons: string[];
}

// ─── Material variants ───────────────────────────────────────────────────────

export type MaterialVariantId =
  | "clear"
  | "cobalt"
  | "amber"
  | "frosted"
  | "swirl";

export const MATERIAL_VARIANT_IDS: readonly MaterialVariantId[] = [
  "clear",
  "cobalt",
  "amber",
  "frosted",
  "swirl",
] as const;

/**
 * The clear master is the only variant that is generated standalone. All
 * other variants are derived from the clear master via `gpt-image-2`
 * Thinking mode with the clear body PNG passed as the reference image.
 */
export const CLEAR_MASTER_VARIANT: MaterialVariantId = "clear";
export const DERIVED_VARIANTS: readonly MaterialVariantId[] = [
  "cobalt",
  "amber",
  "frosted",
  "swirl",
] as const;
