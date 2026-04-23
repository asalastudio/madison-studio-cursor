/**
 * Prompt builders for the paper-doll lane.
 *
 * Target model: OpenAI `gpt-image-2`. Builders return a payload describing
 * what to send (prompt text, mode, whether a reference image is required);
 * the actual model invocation is stubbed in a later PR so wiring the model
 * is an observable, reviewable step on its own.
 *
 * Prompt text mirrors `docs/product-image-system/prompt-pack.md`. Changes
 * should happen in both places.
 */

import type { GeometrySpec, MaterialVariantId, QcCheckId } from "./types";
import { getEnvironmentPlate } from "@/config/productImageEnvironment";

// ─── Types ──────────────────────────────────────────────────────────────────

export type GenerationMode = "thinking" | "instant";

export interface PromptPayload {
  /** The prompt text sent to gpt-image-2. */
  prompt: string;
  /**
   * Negative prompt additions for providers that support them. gpt-image-2
   * is quality-steered primarily through Thinking mode, so this is
   * secondary guidance, not a hard gate.
   */
  negative?: string;
  mode: GenerationMode;
  /**
   * True when the caller must attach a reference image to the payload.
   * Variant derivations always require the clear master.
   */
  referenceImageRequired: boolean;
  /** Debug label surfaced in logs / UI. */
  builderId: string;
}

export interface FamilyPromptContext {
  familyName: string;
  capacityMl: number;
  geometry: GeometrySpec;
  environmentPlateId: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function plateClause(environmentPlateId: string): string {
  const plate = getEnvironmentPlate(environmentPlateId);
  const texture =
    plate.texture === "paper_grain_subtle"
      ? " with subtle paper grain"
      : plate.texture === "linen"
        ? " with faint linen texture"
        : plate.texture === "stone"
          ? " with faint stone texture"
          : "";
  return `photographed on a ${plate.name.toLowerCase()} (${plate.backgroundHex}) background${texture}`;
}

function lightingClause(): string {
  return "soft neutral studio lighting from above and slightly to the left";
}

function geometryClause(geometry: GeometrySpec): string {
  const parts: string[] = [];
  parts.push(`body ${geometry.bodyDimensionsMm.height} mm tall`);
  parts.push(`${geometry.bodyDimensionsMm.width} mm wide`);
  if (geometry.neckOuterMm != null) {
    parts.push(`neck ${geometry.neckOuterMm} mm outer diameter`);
  }
  return parts.join(", ");
}

// ─── Body — clear master ────────────────────────────────────────────────────

export function buildClearMasterPrompt(ctx: FamilyPromptContext): PromptPayload {
  const { familyName, capacityMl, geometry, environmentPlateId } = ctx;
  const prompt = [
    `A ${familyName.toLowerCase()} attar bottle, ${capacityMl} ml volume,`,
    `${geometryClause(geometry)},`,
    plateClause(environmentPlateId) + ".",
    lightingClause() + ".",
    "The glass is completely clear, colorless, and neutral — no blue,",
    "green, or yellow tint. Realistic photographic reflections: natural,",
    "broken highlights on the shoulders and body, not a single clean",
    "central stripe. Believable base thickness visible through the bottom",
    "of the glass. Neck threads are crisp and readable. Canvas centered",
    "horizontally, bottle bottom resting on a soft contact shadow at the",
    "canonical anchor line. No cap, no fitment, no accessories, no label.",
    "Editorial luxury product photography.",
  ].join(" ");

  const negative = [
    "tinted glass, blue glass, green tint, yellow tint,",
    "transparent background, checkerboard transparency,",
    "broad central CGI reflection stripe, floating bottle,",
    "cap installed, fitment installed, label on bottle.",
  ].join(" ");

  return {
    prompt,
    negative,
    mode: "thinking",
    referenceImageRequired: false,
    builderId: "body_clear_master",
  };
}

// ─── Body — material variants (derived from clear master) ──────────────────

const VARIANT_INSTRUCTIONS: Record<Exclude<MaterialVariantId, "clear">, string> = {
  cobalt: [
    "Using the provided clear-master image as the exact geometric reference,",
    "tint the entire bottle body to a saturated cobalt blue (rich",
    "royal-indigo transparent glass). Preserve the exact silhouette, neck",
    "shape, threads, base thickness, and contact shadow — only the glass",
    "color changes. Keep the #EEE6D4 background and subtle paper grain",
    "identical. Reflections should deepen naturally with the blue tint; do",
    "not add new highlights or change the lighting direction. No cap, no",
    "fitment, no label.",
  ].join(" "),
  amber: [
    "Using the provided clear-master image as the exact geometric reference,",
    "tint the entire bottle body to a warm amber (golden honey-brown",
    "transparent glass). Preserve the exact silhouette, neck shape, threads,",
    "base thickness, and contact shadow — only the glass color changes.",
    "Keep the #EEE6D4 background and subtle paper grain identical.",
    "Reflections should warm naturally with the amber tint; do not alter",
    "lighting direction or position. No cap, no fitment, no label.",
  ].join(" "),
  frosted: [
    "Using the provided clear-master image as the exact geometric reference,",
    "convert the bottle body surface to a uniformly frosted, matte,",
    "semi-translucent glass finish. Preserve the silhouette, neck shape,",
    "threads, base thickness, and contact shadow. Reflections become soft",
    "diffused highlights, not sharp mirror reflections. The glass remains",
    "colorless — it is not tinted. Keep the #EEE6D4 background identical.",
    "No cap, no fitment, no label.",
  ].join(" "),
  swirl: [
    "Using the provided clear-master image as the exact geometric reference,",
    "apply an organic multi-tone swirl pattern to the glass body — gentle",
    "sweeping lines of amber, rose, and smoke that remain inside the",
    "silhouette and do not bleed into the background. Preserve neck shape,",
    "threads, base thickness, and contact shadow. Keep the #EEE6D4",
    "background identical. No cap, no fitment, no label.",
  ].join(" "),
};

export function buildMaterialVariantPrompt(
  variant: Exclude<MaterialVariantId, "clear">,
): PromptPayload {
  return {
    prompt: VARIANT_INSTRUCTIONS[variant],
    mode: "thinking",
    referenceImageRequired: true,
    builderId: `body_${variant}_variant`,
  };
}

// ─── Reflection refine (clear body retry) ───────────────────────────────────

export function buildReflectionRefinePrompt(): PromptPayload {
  return {
    prompt: [
      "Refine the provided clear-glass bottle image. The current reflections",
      "look artificial: one broad central light stripe dominates the body.",
      "Replace with realistic photographic highlights — multiple smaller",
      "specular highlights scattered along the shoulder and curves, broken",
      "and irregular, consistent with a soft overhead studio light grazing",
      "from the left. Preserve geometry, canvas, background (#EEE6D4), neck,",
      "threads, and base thickness exactly. The glass must remain fully",
      "neutral and colorless.",
    ].join(" "),
    mode: "thinking",
    referenceImageRequired: true,
    builderId: "clear_reflection_refine",
  };
}

// ─── Fitment + cap (component normalization) ────────────────────────────────

export function buildFitmentPrompt(params: {
  fitmentType: string;
  environmentPlateId: string;
}): PromptPayload {
  const readable = params.fitmentType.replace(/-/g, " ");
  return {
    prompt: [
      `Product photograph of a ${readable} fitment component in isolation,`,
      plateClause(params.environmentPlateId) + ".",
      lightingClause() + ".",
      "The fitment is shown upright, centered, with the neck-seating collar",
      "visible at the bottom. Metal surfaces (if present) show realistic",
      "brushed or polished detail with natural reflections, not CGI-clean.",
      "No bottle, no cap, no hands. Editorial luxury product photography.",
    ].join(" "),
    mode: "instant",
    referenceImageRequired: true,
    builderId: "fitment_master",
  };
}

export function buildCapPrompt(params: {
  capType: string;
  surface: string;
  environmentPlateId: string;
}): PromptPayload {
  const readable = params.capType.replace(/-/g, " ");
  return {
    prompt: [
      `Product photograph of a ${readable} cap component in isolation,`,
      plateClause(params.environmentPlateId) + ".",
      lightingClause() + ".",
      "The cap is shown upright, centered, in its natural orientation",
      "(threaded opening downward). Surface treatment is",
      `${params.surface} — realistic material detail, no CGI sheen. No`,
      "bottle, no fitment, no hands. Editorial luxury product photography.",
    ].join(" "),
    mode: "instant",
    referenceImageRequired: true,
    builderId: "cap_master",
  };
}

// ─── Assembly preview ───────────────────────────────────────────────────────

export function buildAssemblyPreviewPrompt(ctx: FamilyPromptContext): PromptPayload {
  return {
    prompt: [
      "Assemble the provided clear-master bottle body, fitment, and cap",
      "into a single product photograph,",
      plateClause(ctx.environmentPlateId) + ".",
      lightingClause(),
      "identical to the source components.",
      "The fitment seats onto the bottle neck at its natural seat depth —",
      "no gap, no fusion, no penetration. The cap sits directly on top of",
      "the fitment, properly threaded. The composition is centered",
      "horizontally, the bottle bottom resting on the canonical anchor line",
      "with a natural contact shadow. Preserve every input's geometry",
      "exactly; only combine them. No label, no secondary props.",
    ].join(" "),
    mode: "thinking",
    referenceImageRequired: true,
    builderId: "assembly_preview_guidance",
  };
}

// ─── Retry prompts (mapped to QC failures) ──────────────────────────────────

export function buildRetryPromptForFailure(
  failureId: QcCheckId,
  hint?: string,
): PromptPayload | null {
  switch (failureId) {
    case "no_blue_tint_in_clear": {
      const tintLabel = hint ?? "blue";
      return {
        prompt: [
          `The provided clear-glass image has a visible residual ${tintLabel}`,
          "tint. Re-render with the glass completely neutral and colorless.",
          "Preserve geometry, canvas, background (#EEE6D4), and lighting",
          "exactly — change only the tint.",
        ].join(" "),
        mode: "thinking",
        referenceImageRequired: true,
        builderId: "retry_residual_tint_in_clear",
      };
    }
    case "no_broad_reflection_stripe":
      return buildReflectionRefinePrompt();
    case "no_internal_checkerboard":
      return {
        prompt: [
          "The provided image shows the parchment background bleeding",
          "through the bottle body in a way that looks like a cutout, not a",
          "photograph. Re-render so the glass body refracts the background",
          "realistically — the area behind the bottle is softly visible",
          "through the glass with subtle displacement, not a perfect",
          "pass-through.",
        ].join(" "),
        mode: "thinking",
        referenceImageRequired: true,
        builderId: "retry_background_contamination",
      };
    case "variant_silhouette_matches_master":
    case "variant_position_matches_master":
      return {
        prompt: [
          "The provided variant image has drifted from the clear-master",
          "silhouette (shoulders, neck, or base differ). Re-render with the",
          "exact clear-master silhouette preserved; only change the",
          "specified material treatment.",
        ].join(" "),
        mode: "thinking",
        referenceImageRequired: true,
        builderId: "retry_geometry_drift",
      };
    case "thread_crispness":
      return {
        prompt: [
          "The provided image has softened or blurred the neck thread",
          "detail. Re-render with crisp, readable neck threads matching the",
          "clear-master geometry exactly.",
        ].join(" "),
        mode: "thinking",
        referenceImageRequired: true,
        builderId: "retry_thread_softening",
      };
    default:
      return null;
  }
}
