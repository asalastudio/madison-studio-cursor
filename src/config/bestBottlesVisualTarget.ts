import { KEEP_MATERIAL } from "./bestBottlesCatalogCanon";
import { BEST_BOTTLES_GRID_BONE_BACKGROUND_HEX } from "./imagePresets";

export const BEST_BOTTLES_VISUAL_TARGET_VERSION = "best-bottles-pdp-v2" as const;

/** Canonical Best Bottles catalog canvas. Never derive this from style references. */
export const BEST_BOTTLES_VISUAL_TARGET_CANVAS_HEX =
  BEST_BOTTLES_GRID_BONE_BACKGROUND_HEX;

export type BestBottlesVisualTargetMaterial = "glass" | "aluminum";

/**
 * Material-surface exemplars (Jordan-elected 2026-07-19, v2): one real studio
 * photo per glass surface plus aluminum, hash-locked in the visual-targets
 * library. Selection keys off the inferred bodyMaterial string ONLY — never
 * SKU color segments, which inconsistently encode cap color vs body color.
 */
export type BestBottlesVisualTargetSurface =
  | "clear"
  | "cobalt"
  | "amber"
  | "green"
  | "swirl"
  | "frosted"
  | "aluminum";

const BEST_BOTTLES_SINGLE_PRODUCT_COMPOSITION_SAFETY =
  "COMPOSITION SAFETY: render exactly one finished SKU product and only the components physically attached to it in the primary Product Reference. The canvas must contain no detached cap, overcap, bottle, cylinder, accessory, duplicate, ghost object, packaging, prop, or second product anywhere. Never infer or stage a separate object. If a component is absent from the primary Product Reference, it must be absent from the final image.";

const BEST_BOTTLES_SIDECAR_COMPOSITION_SAFETY =
  "SIDECAR COMPOSITION SAFETY: render exactly one finished SKU product as shown in the primary Product Reference: the bottle upright with its exact fitment or applicator attached, plus exactly one matching cap or overcap detached on camera-right on the same shared baseline. Preserve the reference component count, component identities, fitment seating, sidecar position, spacing, and relative scale. Do not assemble the sidecar onto the bottle, omit it, duplicate it, substitute it, invent hidden hardware, or add any other bottle, accessory, packaging, prop, ghost object, or second product.";

export type BestBottlesVisualComponentTopology =
  | "assembled"
  | "fitment-attached-cap-right-sidecar"
  | "assembled-live-site-exception";

function compositionSafetyForTopology(
  componentTopology: BestBottlesVisualComponentTopology,
): string {
  return componentTopology === "fitment-attached-cap-right-sidecar"
    ? BEST_BOTTLES_SIDECAR_COMPOSITION_SAFETY
    : BEST_BOTTLES_SINGLE_PRODUCT_COMPOSITION_SAFETY;
}

export interface BestBottlesVisualTargetReference {
  material: BestBottlesVisualTargetMaterial;
  surface: BestBottlesVisualTargetSurface;
  imageId: string;
  imageUrl: string;
  exportSha256: string;
  role: "style-only";
  transferMode: "style" | "optical-material";
  /** True when an unmapped surface fell back to the clear-glass exemplar. */
  fallbackApplied: boolean;
}

export interface BestBottlesVisualTargetBinding {
  reference: BestBottlesVisualTargetReference;
  componentTopology: BestBottlesVisualComponentTopology;
  promptBlock: string;
  tags: string[];
}

type SurfaceRegistryEntry = Omit<BestBottlesVisualTargetReference, "fallbackApplied">;

/**
 * v2 exemplar set — real studio photos supplied and elected by Jordan
 * 2026-07-19, uploaded hash-named to the visual-targets library. Style-only:
 * product identity always comes from the SKU's primary byte-locked reference.
 */
export const BEST_BOTTLES_VISUAL_TARGET_SURFACES: Record<
  BestBottlesVisualTargetSurface,
  SurfaceRegistryEntry
> = {
  // v3 (Jordan 2026-07-19): cylinder-bodied clear exemplar replaces the square
  // bottle — the catalog is cylinders and curvature behavior (wall gradient,
  // edge density, elliptical base ring) is the whole point of the style ref.
  clear: {
    material: "glass",
    surface: "clear",
    imageId: "clear-v3-e2bdaaa1",
    imageUrl:
      "https://likkskifwsrvszxdvufw.supabase.co/storage/v1/object/public/reference-images/best-bottles/visual-targets/clear/v3/clear-cylinder__e2bdaaa1ac56c55d7133cbc64180560677ce3ed3fdf5c6dcc50c61a865bc6733.png",
    exportSha256: "e2bdaaa1ac56c55d7133cbc64180560677ce3ed3fdf5c6dcc50c61a865bc6733",
    role: "style-only",
    transferMode: "style",
  },
  // v3 test candidate (Jordan 2026-07-20): isolated cobalt glass material
  // plate. Stored under visual-target-candidates until the probe is reviewed;
  // product identity remains exclusively controlled by Image 1.
  cobalt: {
    material: "glass",
    surface: "cobalt",
    imageId: "cobalt-v3-candidate-81d0b658",
    imageUrl:
      "https://likkskifwsrvszxdvufw.supabase.co/storage/v1/object/public/reference-images/best-bottles/visual-target-candidates/cobalt/v3/cobalt-material-plate__81d0b658b9c46c2403dc3cf102d573aa667e1bcd7bd33773d70e6643a9167f80.png",
    exportSha256: "81d0b658b9c46c2403dc3cf102d573aa667e1bcd7bd33773d70e6643a9167f80",
    role: "style-only",
    transferMode: "optical-material",
  },
  // v3 test candidate (Jordan 2026-07-20): isolated amber glass material
  // plate. Stored under visual-target-candidates until the probe is reviewed;
  // product identity remains exclusively controlled by Image 1.
  amber: {
    material: "glass",
    surface: "amber",
    imageId: "amber-v3-candidate-e3d46bd0",
    imageUrl:
      "https://likkskifwsrvszxdvufw.supabase.co/storage/v1/object/public/reference-images/best-bottles/visual-target-candidates/amber/v3/amber-material-plate__e3d46bd038749a139b9840d1d7d539a9b854198176fb4c6b3664ebd545d7aca7.png",
    exportSha256: "e3d46bd038749a139b9840d1d7d539a9b854198176fb4c6b3664ebd545d7aca7",
    role: "style-only",
    transferMode: "optical-material",
  },
  green: {
    material: "glass",
    surface: "green",
    imageId: "green-v2-7521b239",
    imageUrl:
      "https://likkskifwsrvszxdvufw.supabase.co/storage/v1/object/public/reference-images/best-bottles/visual-targets/green/v2/green__7521b23978342f9e1daa5c1ba7b7044c281dcf1bbfca42c9ad1ade1fbf9b32b5.png",
    exportSha256: "7521b23978342f9e1daa5c1ba7b7044c281dcf1bbfca42c9ad1ade1fbf9b32b5",
    role: "style-only",
    transferMode: "style",
  },
  swirl: {
    material: "glass",
    surface: "swirl",
    imageId: "swirl-v2-ee1381f4",
    imageUrl:
      "https://likkskifwsrvszxdvufw.supabase.co/storage/v1/object/public/reference-images/best-bottles/visual-targets/swirl/v2/swirl__ee1381f4a0c9cf5102d5cd1b5756b07c43e4dc0b18a3c36393fa68671abd222c.png",
    exportSha256: "ee1381f4a0c9cf5102d5cd1b5756b07c43e4dc0b18a3c36393fa68671abd222c",
    role: "style-only",
    transferMode: "style",
  },
  frosted: {
    material: "glass",
    surface: "frosted",
    imageId: "frosted-v2-52333263",
    imageUrl:
      "https://likkskifwsrvszxdvufw.supabase.co/storage/v1/object/public/reference-images/best-bottles/visual-targets/frosted/v2/frosted__523332637c649c16331bc92e275a67c8bb43d5d4567c4ff3acac3ff4bee7f416.png",
    exportSha256: "523332637c649c16331bc92e275a67c8bb43d5d4567c4ff3acac3ff4bee7f416",
    role: "style-only",
    transferMode: "style",
  },
  aluminum: {
    material: "aluminum",
    surface: "aluminum",
    imageId: "aluminum-v2-d972c7d8",
    imageUrl:
      "https://likkskifwsrvszxdvufw.supabase.co/storage/v1/object/public/reference-images/best-bottles/visual-targets/aluminum/v2/aluminum__d972c7d814c83943d777c266c7d4b80eae9dd98957bf16d0e8c7aa45de85983a.png",
    exportSha256: "d972c7d814c83943d777c266c7d4b80eae9dd98957bf16d0e8c7aa45de85983a",
    role: "style-only",
    transferMode: "style",
  },
};

export function getBestBottlesVisualTargetMaterial(bodyMaterial?: string | null): BestBottlesVisualTargetMaterial {
  const value = bodyMaterial?.toLowerCase() ?? "";
  return value.includes("aluminum") || value.includes("aluminium") || value.includes("metal atomizer")
    ? "aluminum"
    : "glass";
}

/**
 * Map the inferred bodyMaterial string to an exemplar surface. Returns null
 * for surfaces with no exemplar (plastics, fabrics, unknown finishes) — the
 * caller applies the Jordan-approved fallback: clear glass, recorded.
 */
/**
 * Body-color evidence for surface selection. `inferBestBottlesBodyMaterial`
 * collapses every glass bottle to the string "glass", which mapped ALL colored
 * glass to the clear exemplar (2026-07-20: amber 9 ml rendered spotty/cloudy
 * with `style-surface:clear`). The catalog `color` field and the grace SKU's
 * BODY segment carry the true glass color; cap-finish tokens (SBLK/BKDT/...)
 * are deliberately ignored — cap color slots lie about the body.
 */
export interface BestBottlesVisualTargetSurfaceHints {
  color?: string | null;
  graceSku?: string | null;
}

function surfaceFromHints(
  hints?: BestBottlesVisualTargetSurfaceHints | null,
): BestBottlesVisualTargetSurface | null {
  if (!hints) return null;
  const color = (hints.color ?? "").toLowerCase();
  if (color.includes("swirl")) return "swirl";
  if (color.includes("frost")) return "frosted";
  if (color.includes("amber")) return "amber";
  if (color.includes("cobalt") || color.includes("blue")) return "cobalt";
  if (color.includes("green")) return "green";
  const sku = (hints.graceSku ?? "").toUpperCase();
  if (/-AMB-/.test(sku)) return "amber";
  if (/-(?:BLU|CBL)-/.test(sku)) return "cobalt";
  if (/-FRS-/.test(sku)) return "frosted";
  if (/-GRN-/.test(sku)) return "green";
  if (/-SWL-/.test(sku)) return "swirl";
  return null;
}

export function getBestBottlesVisualTargetSurface(
  bodyMaterial?: string | null,
  hints?: BestBottlesVisualTargetSurfaceHints | null,
): BestBottlesVisualTargetSurface | null {
  const value = bodyMaterial?.toLowerCase() ?? "";
  // Opaque metals win outright — a colored aluminum body must never pick a
  // colored-GLASS exemplar.
  if (value.includes("aluminum") || value.includes("aluminium") || value.includes("metal atomizer")) {
    return "aluminum";
  }
  if (value.includes("swirl")) return "swirl";
  if (value.includes("frosted") && value.includes("glass")) return "frosted";
  if (value.includes("amber")) return "amber";
  if (value.includes("cobalt")) return "cobalt";
  if (value.includes("green") && value.includes("glass")) return "green";
  const hinted = surfaceFromHints(hints);
  if (hinted) return hinted;
  if (value.includes("clear_glass") || value === "glass") return "clear";
  return null;
}

export function getBestBottlesVisualTargetReference(
  bodyMaterial?: string | null,
  hints?: BestBottlesVisualTargetSurfaceHints | null,
): BestBottlesVisualTargetReference {
  const surface = getBestBottlesVisualTargetSurface(bodyMaterial, hints);
  if (surface) {
    return { ...BEST_BOTTLES_VISUAL_TARGET_SURFACES[surface], fallbackApplied: false };
  }
  // Fallback rule (Jordan 2026-07-19): unmapped surfaces use the clear-glass
  // exemplar, and the fallback is recorded in lineage tags — never blocked,
  // never silent.
  return { ...BEST_BOTTLES_VISUAL_TARGET_SURFACES.clear, fallbackApplied: true };
}

function buildBestBottlesVisualTargetPromptBlockFromReference(
  target: BestBottlesVisualTargetReference,
  componentTopology: BestBottlesVisualComponentTopology = "assembled",
): string {
  const surfaceDirections: Record<BestBottlesVisualTargetSurface, string> = {
    clear:
      "Match the approved target's clear-glass wall definition, edge density, refraction, specular rhythm, material separation, and premium glass finish.",
    cobalt:
      "Match the approved target's saturated cobalt transmitted color, inner glow at thin sections, deep-blue wall density, specular rhythm, and premium colored-glass finish.",
    amber:
      "Match the approved target's warm amber transmitted depth, tonal gradation from thick base to thin shoulder, wall density, specular rhythm, and premium colored-glass finish.",
    green:
      "Match the approved target's deep green transmitted color, lighter glow at thin shoulder and neck sections, wall density, specular rhythm, and premium colored-glass finish.",
    swirl:
      "Match the approved target's helical swirl relief definition, highlight play across the raised pattern, refraction between ridges, and premium textured-glass finish.",
    frosted:
      "Match the approved target's satin frosted diffusion, soft light falloff, subtle translucency without gloss hotspots, and premium etched-glass finish.",
    aluminum:
      "Match the approved target's satin-metal gradient, controlled reflection-card rhythm, edge glints, material separation, and premium opaque-metal finish.",
  };
  const materialDirection = surfaceDirections[target.surface];
  const coloredGlassAuthority = target.material === "glass" && ["amber", "cobalt", "green"].includes(target.surface)
    ? "Use the secondary reference's glass-body hue, transmitted color, density, edge saturation, thin-section glow, and refraction as material authority. Do not copy hardware or closure colors; those remain controlled only by the primary Product Reference."
    : "Do not use the secondary reference to recolor the product or any component; product color remains controlled only by the primary Product Reference.";
  const materialPlateGuard = ["amber", "cobalt"].includes(target.surface)
    ? "Treat the secondary reference as a material plate only. Transfer optical material behavior only; never transfer its slab silhouette, outline, corners, top edge, rectangular curvature, camera angle, crop, geometry, or proportions."
    : null;

  const referenceStatus = target.imageUrl
    ? `Secondary reference image ${target.imageId} is STYLE-ONLY.`
    : "No secondary style reference is authorized for this material until an approved opaque non-paper-doll image is registered.";
  return [
    `VISUAL CALIBRATION TARGET — ${BEST_BOTTLES_VISUAL_TARGET_VERSION}.`,
    referenceStatus,
    materialDirection,
    coloredGlassAuthority,
    ...(materialPlateGuard ? [materialPlateGuard] : []),
    target.imageUrl
      ? `Render the final canvas in the approved warm tone ${BEST_BOTTLES_VISUAL_TARGET_CANVAS_HEX} and match the reference's refined natural contact/drop shadow: local grounding, soft feathered falloff, restrained spread, and no pasted-on or floating appearance.`
      : `Render the final canvas in the approved warm tone ${BEST_BOTTLES_VISUAL_TARGET_CANVAS_HEX} with a refined natural contact/drop shadow: local grounding, soft feathered falloff, restrained spread, and no pasted-on or floating appearance.`,
    "Do not copy the secondary reference's silhouette, bottle family, closure, applicator, scale, crop, geometry, composition, component design, label, typography, brand, or scene.",
    "The primary Product Reference is the sole authority for product identity, geometry, component count, closure state, scale relationships, centerline, and baseline.",
    compositionSafetyForTopology(componentTopology),
  ].join("\n");
}

function tagsForBestBottlesVisualTarget(target: BestBottlesVisualTargetReference): string[] {
  return [
    `visual-target:${BEST_BOTTLES_VISUAL_TARGET_VERSION}`,
    `style-reference-image:${target.imageId}`,
    `style-reference-sha256:${target.exportSha256}`,
    `style-transfer:${target.transferMode}`,
    `material-profile:${target.material}`,
    `style-surface:${target.surface}`,
    ...(target.fallbackApplied ? ["style-surface-fallback:clear"] : []),
  ];
}

const BEST_BOTTLES_OPTICAL_MATERIAL_AUTHORITY = `MATERIAL AUTHORITY SPLIT (overrides every earlier instruction to preserve Image 1's glass color or finish):
Image 2 is the sole authority for the glass-body material appearance: hue, chroma, optical density, light transmission, refraction, edge saturation, thin-section glow, and specular/highlight behavior. The model must alter the glass material from Image 1 as needed to match Image 2 visibly and faithfully.
Image 1 remains the sole authority for product geometry and component identity. Material transfer must not alter silhouette, dimensions, proportions, wall boundaries, neck, threads, base, hardware, closure, or component topology. Hardware and closure colors and finishes come only from Image 1.
The exact original glass-body spatial envelope and silhouette from Image 1 are immutable. Do not redraw, widen, shorten, reshape, or resynthesize the bottle outline. Apply Image 2 optics only inside those exact Image 1 glass boundaries.
The bottle remains empty. Transfer glass optics only; do not add liquid, labels, props, slab geometry, or any object from Image 2.`;

const BEST_BOTTLES_PRIMARY_COMPONENT_RECOLOR_LOCK =
  "Do not redesign, recolor, resize, reposition, duplicate, remove, or add any product component.";
const BEST_BOTTLES_STUDIO_COLOR_MATERIAL_LOCK =
  "The catalog contract remains absolute: preserve the exact 2080x2288 canvas, product fill-height target, shared baseline, centerline, crop, product scale, detached-cap sidecar position, geometry, color, material, and component placement.";

export function getBestBottlesProductReferenceDescription(
  bodyMaterialLabel: string,
  binding: BestBottlesVisualTargetBinding,
): string {
  if (binding.reference.transferMode === "optical-material") {
    return [
      "Canonical bottle geometry and component reference (PSD-rendered PNG).",
      `Use this image as an exact product-identity lock: preserve bottle geometry, camera angle, scale relationships, body substrate (${bodyMaterialLabel}), cap texture, fitment, applicator, hose/bulb/tassel color, collar/ring details, reducer finish, trim metal, and every non-glass surface detail.`,
      "The exact glass-body spatial mask, outer contour, wall boundaries, and proportions from Image 1 are immutable. Image 2 controls glass hue, transmission, refraction, and specular behavior only inside those exact boundaries.",
      "Do not redesign, rotate, resize, reposition, duplicate, remove, or add any product component. Do not recolor hardware, closures, fitments, or applicators. Allow only the authorized Image 2 glass-optics transfer and the server-directed staging, lighting, background, shadow, and PDP placement.",
    ].join(" ");
  }
  return [
    "Canonical bottle reference (PSD-rendered PNG).",
    `Use this image as an exact product-identity lock: preserve the bottle geometry, camera angle, scale relationships, body material/substrate (${bodyMaterialLabel}), cap texture, fitment, applicator, body color, hose/bulb/tassel color, collar/ring details, reducer finish, trim metal, and all surface details.`,
    "Do not redesign, restyle, recolor, rotate, or reinterpret the product components.",
    "Do allow luxury catalog staging, lighting, background replacement, shadow, and refined PDP canvas placement as instructed by the server prompt.",
  ].join(" ");
}

function applyOpticalMaterialAuthority(
  prompt: string,
  binding: BestBottlesVisualTargetBinding,
): string {
  if (binding.reference.transferMode !== "optical-material") return prompt;
  const materialPrompt = prompt.includes(KEEP_MATERIAL)
    ? prompt.replace(KEEP_MATERIAL, BEST_BOTTLES_OPTICAL_MATERIAL_AUTHORITY)
    : `${prompt.trim()}\n\n${BEST_BOTTLES_OPTICAL_MATERIAL_AUTHORITY}`;
  return materialPrompt
    .replace(
      BEST_BOTTLES_PRIMARY_COMPONENT_RECOLOR_LOCK,
      "Do not redesign, resize, reposition, duplicate, remove, or add any product component. Do not recolor hardware, closures, fitments, or applicators. The glass body is the sole recolor/material exception and follows MATERIAL AUTHORITY SPLIT.",
    )
    .replace(
      BEST_BOTTLES_STUDIO_COLOR_MATERIAL_LOCK,
      "The catalog contract remains absolute: preserve the exact 2080x2288 canvas, product fill-height target, shared baseline, centerline, crop, product scale, detached-cap sidecar position, geometry, and component placement. Preserve every non-glass component color and material from Image 1; the glass-body appearance follows MATERIAL AUTHORITY SPLIT.",
    );
}

export function resolveBestBottlesVisualTargetBinding(
  bodyMaterial?: string | null,
  hints?: BestBottlesVisualTargetSurfaceHints | null,
  componentTopology: BestBottlesVisualComponentTopology = "assembled",
): BestBottlesVisualTargetBinding {
  const reference = getBestBottlesVisualTargetReference(bodyMaterial, hints);
  return {
    reference,
    componentTopology,
    promptBlock: buildBestBottlesVisualTargetPromptBlockFromReference(reference, componentTopology),
    tags: tagsForBestBottlesVisualTarget(reference),
  };
}

export function buildBestBottlesVisualTargetPromptBlock(
  bodyMaterial?: string | null,
  componentTopology: BestBottlesVisualComponentTopology = "assembled",
): string {
  return resolveBestBottlesVisualTargetBinding(
    bodyMaterial,
    null,
    componentTopology,
  ).promptBlock;
}

export function applyResolvedBestBottlesVisualTargetPrompt(
  prompt: string,
  binding: BestBottlesVisualTargetBinding,
): string {
  const materialAuthorizedPrompt = applyOpticalMaterialAuthority(prompt, binding);
  const safety = compositionSafetyForTopology(
    binding.componentTopology,
  );
  if (!materialAuthorizedPrompt.includes(`VISUAL CALIBRATION TARGET — ${BEST_BOTTLES_VISUAL_TARGET_VERSION}`)) {
    return `${materialAuthorizedPrompt.trim()}\n\n${binding.promptBlock}`;
  }
  if (materialAuthorizedPrompt.includes(safety)) return materialAuthorizedPrompt;
  if (materialAuthorizedPrompt.includes(BEST_BOTTLES_SINGLE_PRODUCT_COMPOSITION_SAFETY)) {
    return materialAuthorizedPrompt.replace(BEST_BOTTLES_SINGLE_PRODUCT_COMPOSITION_SAFETY, safety);
  }
  if (materialAuthorizedPrompt.includes(BEST_BOTTLES_SIDECAR_COMPOSITION_SAFETY)) {
    return materialAuthorizedPrompt.replace(BEST_BOTTLES_SIDECAR_COMPOSITION_SAFETY, safety);
  }
  return `${materialAuthorizedPrompt.trim()}\n${safety}`;
}

export function applyBestBottlesVisualTargetPrompt(
  prompt: string,
  bodyMaterial?: string | null,
  componentTopology: BestBottlesVisualComponentTopology = "assembled",
  hints?: BestBottlesVisualTargetSurfaceHints | null,
): string {
  return applyResolvedBestBottlesVisualTargetPrompt(
    prompt,
    resolveBestBottlesVisualTargetBinding(bodyMaterial, hints, componentTopology),
  );
}

export function getBestBottlesVisualTargetTags(
  bodyMaterial?: string | null,
  hints?: BestBottlesVisualTargetSurfaceHints | null,
): string[] {
  return tagsForBestBottlesVisualTarget(getBestBottlesVisualTargetReference(bodyMaterial, hints));
}

export function getBestBottlesVisualTargetBindingIssue(input: {
  binding: BestBottlesVisualTargetBinding;
  attachedStyleReferenceUrl: string;
  prompt: string;
  tags: readonly string[];
}): string | null {
  const { reference } = input.binding;
  if (input.attachedStyleReferenceUrl.trim() !== reference.imageUrl) {
    return "Style reference URL does not match the resolved material target.";
  }
  if (
    !reference.imageUrl.includes(reference.exportSha256)
    || !/^[a-f0-9]{64}$/.test(reference.exportSha256)
  ) {
    return "Style reference hash does not match the resolved material target URL.";
  }
  if (!input.prompt.includes(`Secondary reference image ${reference.imageId} is STYLE-ONLY.`)) {
    return "Style reference prompt does not match the resolved material target.";
  }
  if (
    reference.transferMode === "optical-material"
    && (
      !input.prompt.includes("MATERIAL AUTHORITY SPLIT")
      || /preserve the glass's exact color/i.test(input.prompt)
      || /preserve the exact hue and chroma shown in the reference/i.test(input.prompt)
    )
  ) {
    return "Optical material authority conflicts with the primary-reference color lock.";
  }
  const expectedTags = tagsForBestBottlesVisualTarget(reference);
  if (expectedTags.some((tag) => !input.tags.includes(tag))) {
    return "Style reference tags do not match the resolved material target.";
  }
  return null;
}
