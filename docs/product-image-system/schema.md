# Schema — Product Image System

> **Status: superseded in part.** This doc was written before the pivot to a
> pipeline-native placement and uses a parallel `BottleFamilySpec` /
> `ProductImageJob` type system. The current design reads family metadata
> from the existing `PipelineGroup` row (see
> `src/lib/bestBottlesPipeline.ts`) plus a new `geometry_spec` JSONB column,
> and does not introduce `BottleFamilySpec` or `ProductImageJob`. Types
> actually shipping live in `src/lib/product-image/types.ts` — the current,
> narrower set is `EnvironmentPlate`, `GeometrySpec`, `ComponentManifest`,
> and `QcResult`. See `PRD.md` for current architecture.

TypeScript-first schemas. The canonical source is
`src/lib/product-image/types.ts`; this doc is the human-readable companion and
the place to add rationale for each field.

All types are **pure TypeScript** with no runtime dependencies — they exist to
govern prompt building, workflow decisions, QC, and PSD ingest. No Supabase
table is introduced in this pilot; if a given type becomes durable state, a
follow-up PR can project it into a table.

---

## `EnvironmentPlate`

Represents a governed presentation environment (background plate) for bodies
and assemblies.

```ts
interface EnvironmentPlate {
  id: string;                  // e.g. "parchment_cream_v1"
  name: string;                // e.g. "Parchment Cream"
  backgroundHex: string;       // e.g. "#EEE6D4"  — locked
  useAsFinalBackground: boolean; // true for this pilot (Option A)
  texture: "flat" | "paper_grain_subtle" | "linen" | "stone";
  lightingStyle: "soft_overhead" | "soft_side" | "neutral_studio";
  tone: "warm" | "neutral" | "cool";
}
```

Notes:
- `useAsFinalBackground=true` is the Option A decision: we render onto the
  plate, we do not composite later. This is also why we **do not** generate
  clear bodies on transparency.
- `texture` is intentionally a small enum; a "subtle paper grain" is the pilot
  value so renders do not look like flat PNG exports.
- The pilot registers exactly one plate: `parchment_cream_v1`.

---

## `BottleFamilySpec`

The canonical geometry and compatibility contract for a bottle family. A
family is the (shape + capacity) cohort — across material variants, the same
`BottleFamilySpec` applies.

```ts
interface BottleFamilySpec {
  familyId: string;             // "cyl_9ml_v1"
  familyName: string;           // "Cylindrical 9 ml"
  bottleType:
    | "cylindrical"
    | "square"
    | "ring"
    | "dome"
    | "teardrop"
    | "shoulder"
    | "flask"
    | "other";
  nominalCapacityMl: number;
  canonicalCanvas: {
    widthPx: number;
    heightPx: number;
  };
  centerXLocked: true;          // always true for this lane
  bottomAnchor: {
    y: number;                  // px from top of canvas
    toleranceY: number;         // allowed drift for QC
  };
  neckSpec: {
    threadId: string;           // e.g. "GL14"
    outerMm: number;
    innerMm: number;
  };
  compatibleFitments: string[]; // fitment ids
  compatibleCaps: string[];     // cap ids
  defaultEnvironmentPlateId: string; // "parchment_cream_v1"
}
```

Notes:
- `centerXLocked` is typed as the literal `true`: the whole lane assumes
  every canonical body is horizontally centered. Off-center layouts are a
  separate future concern, not a knob within this lane.
- `bottomAnchor.y` replaces "place the bottle on the ground" heuristics with
  a geometric contract.
- `compatibleFitments` / `compatibleCaps` are **string ids**, not enums, so
  new fitment/cap types can be registered without touching this type.

---

## `MaterialVariant`

The five governed material variants for a bottle body. These are the allowed
derivations from the clear master.

```ts
type MaterialVariantId =
  | "clear"
  | "cobalt"
  | "amber"
  | "frosted"
  | "swirl";

interface MaterialVariant {
  id: MaterialVariantId;
  label: string;                // "Cobalt"
  isMaster: boolean;            // true only for "clear"
  /**
   * High-level generation intent. Fine-grained prompt strings live in
   * promptBuilders.ts so writers can change them without touching this type.
   */
  derivationStyle:
    | "photographic_clear_glass"   // clear
    | "saturated_transparent_tint" // cobalt / amber
    | "matte_translucent_surface"  // frosted
    | "multi_tone_organic_pattern" // swirl
    ;
  /** Hint for QC — where residual tint / artifacts tend to appear. */
  knownArtifacts: readonly string[];
}
```

Notes:
- `isMaster: true` is enforced in the registry: exactly one variant may be
  the master. In config, `clear` is the master.
- Cobalt + amber share `saturated_transparent_tint` deliberately: they are
  the same technique (controlled hue) with different hue targets.

---

## `ProductImageJob`

The unit of work. Describes a single generation / enhancement request
produced by the workflow decision tree.

```ts
type ProductImageAssetType =
  | "body"       // bottle body, any material variant
  | "fitment"    // cap-top component like a sprayer / roller / pump
  | "cap"        // overcap / screw cap
  | "assembly"   // composed preview of body + fitment + cap
  ;

type ProductImageMode =
  | "component_extracted"  // take a clean extracted source and normalize
  | "body_enhanced"        // preserve geometry, improve realism
  | "body_regenerated"     // regenerate canonical master from spec
  | "variant_derived"      // derive material variant from clear master
  | "assembly_preview"     // assemble components into preview
  ;

interface ProductImageJob {
  assetType: ProductImageAssetType;
  mode: ProductImageMode;
  familyId: string;
  materialVariant: MaterialVariantId | null;  // null for fitment/cap
  sourceAssetId: string | null;               // e.g. clear master or extracted component
  geometryLock: {
    canonicalCanvas: { widthPx: number; heightPx: number };
    centerXLocked: boolean;
    bottomAnchorY: number | null;
  };
  targetEnvironmentPlate: string;             // "parchment_cream_v1"
  outputProfile: {
    format: "png" | "webp";
    dpi: number;                              // 72 for web
    colorSpace: "sRGB";
  };
}
```

Notes:
- `sourceAssetId` is required for `variant_derived` (the clear master) and
  `component_extracted` (the extracted source) — the workflow decision tree
  enforces this invariant.
- `materialVariant` is only populated for body + variant jobs; QC rejects
  a fitment job with a material variant set.

---

## `QcResult`

```ts
type QcCheckId =
  | "background_exact_hex"
  | "center_alignment"
  | "bottom_anchor_locked"
  | "scale_consistency"
  | "no_blue_tint_in_clear"
  | "no_broad_reflection_stripe"
  | "no_internal_checkerboard"
  | "thread_crispness"
  | "base_thickness_believable"
  | "fitment_seating_natural"
  | "cap_seating_natural"
  | "variant_silhouette_matches_master";

interface QcCheck {
  id: QcCheckId;
  passed: boolean;
  severity: "hard_fail" | "soft_warning";
  /** One-line summary of what was checked and why. */
  note: string;
}

interface QcResult {
  passed: boolean;              // true iff every hard_fail check passed
  checks: QcCheck[];
  retryNeeded: boolean;
  retryReasons: string[];       // human-readable lines for operator UI
}
```

---

## `PsdModularIngestResult`

Accepts pre-parsed PSD layer metadata and produces a normalized,
classified result.

```ts
type ComponentRole =
  | "body"
  | "fitment"
  | "cap"
  | "label"      // decoration — future
  | "shadow"     // drop shadow — future
  | "background" // often discarded
  | "unknown";

interface PsdLayer {
  name: string;
  widthPx: number;
  heightPx: number;
  boundsPx: { x: number; y: number; w: number; h: number };
  hasAlpha: boolean;
  /**
   * Optional: if the external parser already produced a PNG data URL for the
   * layer, it can be passed through. Not required for the decision tree.
   */
  previewUrl?: string;
}

interface ClassifiedComponent {
  role: ComponentRole;
  sourceLayerName: string;
  confidence: number; // 0..1
}

interface NormalizedComponentExport {
  role: ComponentRole;
  canonicalCanvas: { widthPx: number; heightPx: number };
  centeredX: boolean;
  bottomAnchorY: number | null;
  exportedUrl: string | null; // null in this pilot
}

interface PsdModularIngestResult {
  sourceFile: string;                           // filename or storage path
  parsedLayers: PsdLayer[];
  classifiedComponents: ClassifiedComponent[];
  normalizedOutputs: NormalizedComponentExport[];
  assemblyPreviewGenerated: boolean;
}
```

---

## `ComponentAnchorSpec`

Describes how a fitment or cap seats onto a bottle body at assembly time.

```ts
type ComponentAnchorRole = "fitment" | "cap";
type AnchorType = "neck_seat" | "overcap_top" | "shoulder_ring";

interface ComponentAnchorSpec {
  componentRole: ComponentAnchorRole;
  anchorType: AnchorType;
  /** Pixel offset from the body's `bottomAnchor.y` reference. */
  offsetX: number; // usually 0 given centerXLocked
  offsetY: number; // upward from anchor (negative = higher on canvas)
  /** How deep the component seats into the neck (for fitments). */
  seatDepth: number;
  /** Stacking order during assembly preview. */
  zIndex: number;
}
```

---

## `AssemblyPreviewSpec`

The bundle of inputs needed to render a paper-doll preview of a body + one
fitment + one cap on a specific environment plate.

```ts
interface AssemblyPreviewSpec {
  familyId: string;
  bodyAssetId: string;
  fitmentAssetId: string | null;
  capAssetId: string | null;
  environmentPlateId: string;
  centered: true;               // literal — the lane is always centered
  bottomAnchorLocked: true;     // literal — anchor is always locked
}
```

---

## Invariants enforced across the system

- Every `ProductImageJob` targeting the body lane carries
  `targetEnvironmentPlate = "parchment_cream_v1"`.
- Exactly one `MaterialVariant` in the registry has `isMaster: true`.
- `BottleFamilySpec.centerXLocked` is `true` for every registered family in
  this pilot lane.
- `variant_derived` jobs require a non-null `sourceAssetId` pointing at the
  clear master.
- `component_extracted` jobs require a non-null `sourceAssetId` pointing at
  the extracted source.
