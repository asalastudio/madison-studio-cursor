/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * PRODUCT HUB → AI IMAGE-GEN PROMPT INJECTOR
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Madison Product Hub is the canonical source of truth for AI image-gen
 * prompts. This module reads `product_hubs.metadata.bottle_specs` (populated
 * by the Best Bottles importer + the Bottle Specs editing UI) and emits a
 * comprehensive structured prompt block.
 *
 * Architecture:
 *   - Editing the spec in Madison's Product Hub UI → next render uses the
 *     updated values. No Convex round-trip required.
 *   - Schematic dimensions (bounding envelope, per-landmark heights/diameters,
 *     transition radii, wall thickness) are emitted as a HARD CONSTRAINT block
 *     the model treats as authoritative geometry.
 *   - Material, manufacturing, decoration, and certification fields enrich the
 *     prompt without overriding the dimensional contract.
 *
 * Replaces (eventually) the Convex-based `skuInjector.buildProductSpecBlock`.
 * For now the two paths coexist — Product Hub is preferred when present.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import type { BottleSpecs } from "@/components/products/BottleSpecsSection";
import { getApplicatorShapeDescriptor } from "@/config/applicatorShapeDescriptors";

// ─── Types ───────────────────────────────────────────────────────────────────

/** The narrow shape of a `product_hubs` row this injector needs. */
export interface ProductHubLike {
  name?: string | null;
  sku?: string | null;
  slug?: string | null;
  category?: string | null;
  product_type?: string | null;
  long_description?: string | null;
  short_description?: string | null;
  variants?: Array<{ sku?: string | null }> | string | null;
  metadata?: { bottle_specs?: BottleSpecs; variants?: Array<{ sku?: string | null }> } | string | null;
}

export interface BuildProductHubBlockOptions {
  /**
   * Paper-doll component scope. Default "full". When "body", omits cap +
   * applicator chatter so the prompt stays bottle-only. When "fitment",
   * inverts that.
   */
  componentScope?: "full" | "body" | "fitment" | "cap";
  /**
   * When true (default), missing dimensions are explicitly flagged with
   * `[NOT IN HUB — fill in Bottle Specs]` so the model never silently
   * invents a number and the operator sees what to backfill.
   */
  flagMissingDimensions?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MISSING = "[NOT IN HUB — fill in Bottle Specs]";

function parseSpecs(metadata: ProductHubLike["metadata"]): BottleSpecs | null {
  if (!metadata) return null;
  if (typeof metadata === "string") {
    try {
      const parsed = JSON.parse(metadata) as { bottle_specs?: BottleSpecs };
      return parsed?.bottle_specs ?? null;
    } catch {
      return null;
    }
  }
  return metadata.bottle_specs ?? null;
}

/** Format a number with optional unit; return MISSING for null/undefined. */
function fmt(value: number | string | null | undefined, unit?: string, flagMissing = true): string {
  if (value === null || value === undefined || value === "") return flagMissing ? MISSING : "";
  return unit ? `${value} ${unit}` : String(value);
}

/** Build "X → Y" range, or single value, or MISSING. */
function range(start: number | null | undefined, end: number | null | undefined, unit = "mm"): string {
  if (start == null && end == null) return MISSING;
  if (start != null && end != null) return `${start}→${end} ${unit}`;
  return `${start ?? "?"}→${end ?? "?"} ${unit}`;
}

/** Render a list of "key=value" pairs, omitting null/undefined entries. */
function kvList(pairs: Array<[string, string | number | null | undefined]>, sep = " · "): string {
  return pairs
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k} ${v}`)
    .join(sep);
}

// ─── Main builder ────────────────────────────────────────────────────────────

export function buildProductHubPromptBlock(
  hub: ProductHubLike,
  options: BuildProductHubBlockOptions = {},
): string {
  const scope = options.componentScope ?? "full";
  const flag = options.flagMissingDimensions ?? true;
  const specs = parseSpecs(hub.metadata) ?? {};
  const cap = specs.cap ?? {};
  const physical = specs.physical ?? {};
  const neck = specs.neck ?? {};
  const material = specs.material ?? {};
  const manufacturing = specs.manufacturing ?? {};
  const packaging = specs.packaging ?? {};
  const decoration = specs.decoration ?? {};
  const compatibility = specs.compatibility ?? {};
  const rollOn = specs.roll_on ?? {};
  const sustainability = specs.sustainability ?? {};
  const schematic = specs.schematic ?? {};
  const sBox = schematic.bounding_box_mm ?? {};
  const sH = schematic.heights_mm ?? {};
  const sD = schematic.diameters_mm ?? {};
  const sW = schematic.widths_mm ?? {};
  const sR = schematic.radii_mm ?? {};
  const sWT = schematic.wall_thickness_mm ?? {};
  const sRatios = schematic.ratios ?? {};

  const includeBody = scope !== "fitment" && scope !== "cap";
  const includeFitment = scope !== "body";
  const includeCap = scope !== "body" && scope !== "fitment";

  const lines: string[] = [];
  const headerScope =
    scope === "body"
      ? " (BOTTLE BODY ONLY — no fitment, no cap)"
      : scope === "fitment"
        ? " (FITMENT ONLY — no bottle body)"
        : scope === "cap"
          ? " (CAP ONLY — no bottle body, no fitment)"
          : "";
  lines.push(
    `PRODUCT HUB DATA${headerScope} — Madison Product Hub is the canonical source. All dimensions in millimeters unless noted.`,
    "",
  );

  // ─── Identity ──────────────────────────────────────────────────────────────
  lines.push("IDENTITY:");
  lines.push(`- SKU: ${hub.sku ?? "(no SKU)"}${hub.name ? `  (${hub.name})` : ""}`);
  if (hub.product_type || specs.family) {
    lines.push(`- Family: ${specs.family ?? hub.product_type ?? "(unspecified)"}`);
  }
  if (specs.shape) lines.push(`- Shape: ${specs.shape}`);
  if (specs.glass_color) lines.push(`- Glass color: ${specs.glass_color}`);
  if (specs.variant_count) lines.push(`- Variants in this hub: ${specs.variant_count}`);
  lines.push("");

  // ─── Capacity ──────────────────────────────────────────────────────────────
  if (includeBody) {
    const capParts: string[] = [];
    if (specs.capacity?.display) capParts.push(`labeled ${specs.capacity.display}`);
    else if (specs.capacity?.ml != null)
      capParts.push(`labeled ${specs.capacity.ml} ml${specs.capacity.oz ? ` (${specs.capacity.oz} fl oz)` : ""}`);
    if (specs.capacity?.brimful_ml != null) capParts.push(`brimful ${specs.capacity.brimful_ml} ml`);
    if (specs.capacity?.fill_ml != null) capParts.push(`fill ${specs.capacity.fill_ml} ml`);
    if (capParts.length > 0) {
      lines.push("CAPACITY:");
      lines.push(`- ${capParts.join(" · ")}`);
      lines.push("");
    }
  }

  // ─── Neck & Thread ─────────────────────────────────────────────────────────
  if (includeBody) {
    const neckCode = neck.finish_code ?? specs.neck_thread;
    const neckParts: string[] = [];
    if (neckCode) neckParts.push(`finish ${neckCode}${neck.standard ? ` (${neck.standard})` : ""}`);
    if (neck.outer_diameter_mm != null) neckParts.push(`outer Ø ${neck.outer_diameter_mm} mm`);
    if (neck.inner_diameter_mm != null) neckParts.push(`bore Ø ${neck.inner_diameter_mm} mm`);
    if (neckParts.length > 0) {
      lines.push("NECK & THREAD:");
      lines.push(`- ${neckParts.join(" · ")}`);
      if (neck.cetie_reference) lines.push(`- CETIE drawing: ${neck.cetie_reference}`);
      if (neck.fea_reference) lines.push(`- FEA reference: ${neck.fea_reference}`);
      lines.push("");
    }
  }

  // ─── Schematic envelope (HARD CONSTRAINT) ─────────────────────────────────
  // This is the dimensional contract. The model MUST match these numbers.
  if (includeBody) {
    const hasAnySchematic =
      Object.values(sBox).some((v) => v != null) ||
      Object.values(sH).some((v) => v != null) ||
      Object.values(sD).some((v) => v != null) ||
      Object.values(sW).some((v) => v != null) ||
      Object.values(sR).some((v) => v != null) ||
      Object.values(sWT).some((v) => v != null) ||
      schematic.profile ||
      schematic.base_shape;

    if (hasAnySchematic || flag) {
      lines.push("SCHEMATIC ENVELOPE (HARD CONSTRAINT — dimensional contract; the model MUST respect these):");

      // Profile descriptors
      const profileBits = kvList([
        ["profile", schematic.profile],
        ["base shape", schematic.base_shape],
        ["body taper", schematic.body_taper],
      ]);
      if (profileBits) lines.push(`- ${profileBits}`);

      // Bounding box — the box the bottle must fit inside
      const heightWithCap = sBox.height_with_cap ?? physical.height_with_cap_mm;
      const heightNoCap = sBox.height_without_cap ?? physical.height_without_cap_mm;
      const width = sBox.width ?? physical.diameter_mm;
      const depth = sBox.depth ?? physical.diameter_mm; // cylindrical: depth = diameter
      lines.push(
        `- Bounding box: ${fmt(width, undefined, flag)} W × ${fmt(depth, undefined, flag)} D × ${fmt(heightWithCap, undefined, flag)} H (with cap), ${fmt(heightNoCap, undefined, flag)} H (no cap)`,
      );

      // Heights at landmarks (cumulative from base = 0)
      const heightsBits: string[] = [];
      if (sH.base != null) heightsBits.push(`base 0→${sH.base}`);
      if (sH.body_start != null && sH.shoulder_start != null) heightsBits.push(`body ${sH.body_start}→${sH.shoulder_start}`);
      if (sH.shoulder_start != null && sH.shoulder_end != null) heightsBits.push(`shoulder ${sH.shoulder_start}→${sH.shoulder_end}`);
      if (sH.shoulder_end != null && sH.neck != null) heightsBits.push(`neck ${sH.shoulder_end}→${sH.shoulder_end + sH.neck}`);
      if (sH.cap != null) heightsBits.push(`cap height ${sH.cap}`);
      if (heightsBits.length > 0) lines.push(`- Heights from base (mm): ${heightsBits.join(", ")}`);

      // Diameters at landmarks
      const dia = kvList([
        ["base", sD.base ?? physical.base_diameter_mm],
        ["body min", sD.body_min],
        ["body max", sD.body_max ?? physical.diameter_mm],
        ["shoulder", sD.shoulder],
        ["neck outer", sD.neck_outer ?? neck.outer_diameter_mm],
        ["bore", sD.neck_inner_bore ?? neck.inner_diameter_mm],
        ["cap max", sD.cap_max],
      ], ", ");
      if (dia) lines.push(`- Diameters Ø (mm): ${dia}`);

      // Width × depth at landmarks (for non-cylindrical bottles)
      const isNonCyl = schematic.profile && !/cylindrical/i.test(schematic.profile);
      if (isNonCyl) {
        const wdBits: string[] = [];
        if (sW.base_w && sW.base_d) wdBits.push(`base ${sW.base_w}×${sW.base_d}`);
        if (sW.body_max_w && sW.body_max_d) wdBits.push(`body ${sW.body_max_w}×${sW.body_max_d}`);
        if (sW.shoulder_w && sW.shoulder_d) wdBits.push(`shoulder ${sW.shoulder_w}×${sW.shoulder_d}`);
        if (wdBits.length > 0) lines.push(`- Width×Depth (mm): ${wdBits.join(", ")}`);
      }

      // Transition radii
      const radii = kvList([
        ["heel", sR.heel],
        ["shoulder", sR.shoulder],
        ["neck transition", sR.neck_transition],
        ["corner", sR.corner],
      ], ", ");
      if (radii) lines.push(`- Transition radii (mm): ${radii}`);

      // Wall thickness
      const wt = kvList([
        ["base", sWT.base ?? physical.wall_thickness_mm],
        ["body", sWT.body],
        ["shoulder", sWT.shoulder],
        ["neck", sWT.neck],
      ], ", ");
      if (wt) lines.push(`- Wall thickness (mm): ${wt}`);

      // Proportional ratios
      const ratios = kvList([
        ["aspect H:W", sRatios.aspect_ratio?.toFixed(2)],
        ["cap-to-bottle", sRatios.cap_to_bottle?.toFixed(2)],
        ["neck-to-body", sRatios.neck_to_body?.toFixed(2)],
        ["shoulder-to-body", sRatios.shoulder_to_body?.toFixed(2)],
      ], ", ");
      if (ratios) lines.push(`- Proportional ratios: ${ratios}`);

      if (schematic.draft_angle_degrees != null) {
        lines.push(`- Mold draft angle: ${schematic.draft_angle_degrees}°`);
      }
      if (schematic.reference_orientation) {
        lines.push(`- Reference orientation: ${schematic.reference_orientation}`);
      }
      lines.push("");
    }
  }

  // ─── Material ──────────────────────────────────────────────────────────────
  if (includeBody) {
    const matBits: string[] = [];
    if (material.type) matBits.push(material.type);
    if (material.family) matBits.push(`(${material.family})`);
    const certBits: string[] = [];
    if (material.lead_free === true) certBits.push("lead-free");
    if (material.cadmium_free === true) certBits.push("cadmium-free");
    if (matBits.length > 0 || certBits.length > 0) {
      lines.push("MATERIAL:");
      if (matBits.length > 0) lines.push(`- Glass: ${matBits.join(" ")}`);
      if (certBits.length > 0) lines.push(`- Certifications: ${certBits.join(", ")}`);
      lines.push("");
    }
  }

  // ─── Manufacturing ─────────────────────────────────────────────────────────
  // The manufacturing process informs subtle visible artifacts (mould seams,
  // tooling marks at the base) that gpt-image-2 renders distinctly.
  if (includeBody && (manufacturing.process || manufacturing.cavity_count || manufacturing.factory_origin)) {
    lines.push("MANUFACTURING:");
    if (manufacturing.process) {
      const processNote =
        manufacturing.process === "NNPB"
          ? " — Narrow Neck Press & Blow (visible faint mould seam at the parting line)"
          : manufacturing.process === "BB"
            ? " — Blow & Blow (subtle vertical mould seam, slightly thicker walls)"
            : manufacturing.process === "P&B"
              ? " — Press & Blow (cleaner finish, less visible seams)"
              : manufacturing.process === "Hand-Blown"
                ? " — Hand-blown (slight asymmetry, organic surface variations)"
                : "";
      lines.push(`- Process: ${manufacturing.process}${processNote}`);
    }
    if (manufacturing.cavity_count) lines.push(`- Cavity count: ${manufacturing.cavity_count}`);
    if (manufacturing.factory_origin) lines.push(`- Factory: ${manufacturing.factory_origin}`);
    lines.push("");
  }

  // ─── Applicator & Cap (per-variant — uses defaults from the hub) ─────────
  //
  // Critical: when a specific applicator is selected for this variant, we MUST
  // emit the rich shape descriptor (the "NO bulb. NO sprayer mechanism. NO
  // dip tube. Simple closure with..." negative constraints) from
  // applicatorShapeDescriptors. Without it, gpt-image-2 falls back to whichever
  // variant of the family is most photographically distinctive in its training
  // data — for Empire 50ml that's the antique-spray-with-tassel, which then
  // gets rendered for SKUs that should be Reducers, Cap/Closures, etc.
  //
  // We intentionally DO NOT list "other available applicators in this hub"
  // anymore. That informational line was leaking variant names like
  // "Antique Spray Tassel" into the prompt, where the model latched onto them
  // as visual anchors instead of the targeted variant's applicator.
  if (includeFitment) {
    const fitParts: string[] = [];
    if (specs.applicator) fitParts.push(`type: ${specs.applicator}`);
    if (specs.ball_material) fitParts.push(`ball: ${specs.ball_material}`);
    if (rollOn.ball_diameter_mm != null) fitParts.push(`ball Ø ${rollOn.ball_diameter_mm} mm`);
    if (rollOn.fitment_material) fitParts.push(`fitment ${rollOn.fitment_material}`);
    if (fitParts.length > 0) {
      lines.push("APPLICATOR / FITMENT:");
      lines.push(`- ${fitParts.join(" · ")}`);
      // Inject the per-applicator shape descriptor with explicit negative
      // constraints — this is what keeps a Reducer from rendering as a tassel.
      if (specs.applicator) {
        const descriptor = getApplicatorShapeDescriptor(specs.applicator);
        if (descriptor) {
          lines.push(`- shape: ${descriptor}`);
        }
      }
      lines.push("");
    }
  }
  if (includeCap) {
    const capParts: string[] = [];
    if (cap.style) capParts.push(`style: ${cap.style}`);
    if (cap.color) capParts.push(`color: ${cap.color}`);
    if (cap.height) capParts.push(`height: ${cap.height}`);
    if (cap.trim_color) capParts.push(`trim: ${cap.trim_color}`);
    if (capParts.length > 0) {
      lines.push("CAP:");
      lines.push(`- ${capParts.join(" · ")}`);
      lines.push("");
    }
  }

  // ─── Decoration & Compatibility ───────────────────────────────────────────
  if (includeBody) {
    const decoBits: string[] = [];
    if (decoration.available_finishes && decoration.available_finishes.length > 0) {
      decoBits.push(`available finishes: ${decoration.available_finishes.join(", ")}`);
    }
    if (decoration.compatible_methods && decoration.compatible_methods.length > 0) {
      decoBits.push(`decoration methods: ${decoration.compatible_methods.join(", ")}`);
    }
    if (compatibility.compatible_pumps && compatibility.compatible_pumps.length > 0) {
      decoBits.push(`compatible pumps: ${compatibility.compatible_pumps.join(", ")}`);
    }
    if (compatibility.dip_tube_length_mm != null) {
      decoBits.push(`dip tube ${compatibility.dip_tube_length_mm} mm`);
    }
    if (decoBits.length > 0) {
      lines.push("DECORATION & COMPATIBILITY:");
      for (const b of decoBits) lines.push(`- ${b}`);
      lines.push("");
    }
  }

  // ─── Sustainability (informational only — does not affect render) ────────
  if (sustainability.pcr_content_percent != null && sustainability.pcr_content_percent > 0) {
    lines.push("SUSTAINABILITY (informational):");
    lines.push(
      `- ${sustainability.pcr_content_percent}% post-consumer recycled glass${
        sustainability.pcr_content_percent >= 70
          ? " — visible faint cullet inclusions are acceptable for high-PCR glass"
          : ""
      }`,
    );
    lines.push("");
  }

  // ─── Render-time enforcement clause ───────────────────────────────────────
  lines.push("RENDER ENFORCEMENT (how to use this data):");
  lines.push("- Treat SCHEMATIC ENVELOPE numbers as authoritative geometry — match them exactly");
  lines.push("- If reference image and SCHEMATIC numbers conflict, defer to SCHEMATIC for proportions; reference may guide material/lighting");
  lines.push("- Do not invent dimensions; if a value is marked [NOT IN HUB], use reference image only — do NOT estimate");
  lines.push("- Manufacturing process implies specific surface artifacts (see MANUFACTURING note); render them subtly");

  return lines.join("\n");
}

// ─── Migration helper — let existing Convex callers transition gradually ───

/**
 * Take a Convex-style row and a Product Hub row and prefer Product Hub when
 * present. Returns a `ProductHubLike` ready to feed into
 * `buildProductHubPromptBlock`. Used during the Convex → Product Hub
 * transition so call sites can pass both.
 */
export function preferProductHub<T extends ProductHubLike>(
  productHub: T | null | undefined,
  convexFallback?: { graceSku?: string | null; family?: string | null; shape?: string | null; color?: string | null } | null,
): ProductHubLike | null {
  if (productHub && parseSpecs(productHub.metadata)) return productHub;
  if (convexFallback?.graceSku) {
    return {
      sku: convexFallback.graceSku,
      product_type: convexFallback.family ?? null,
      metadata: {
        bottle_specs: {
          family: convexFallback.family ?? null,
          shape: convexFallback.shape ?? null,
          glass_color: convexFallback.color ?? null,
        },
      },
    };
  }
  return null;
}
