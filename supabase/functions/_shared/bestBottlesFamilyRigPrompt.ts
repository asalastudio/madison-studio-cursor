import { buildImposedRigBlock, getFamilyRigForProduct, type RigCapState } from "./familyRig.ts";

export interface BestBottlesFamilyRigProductContext {
  family?: unknown;
  sku?: unknown;
  websiteSku?: unknown;
  name?: unknown;
  itemDescription?: unknown;
  applicator?: unknown;
  capState?: unknown;
  mode?: unknown;
  presetId?: unknown;
  referenceWorkflow?: unknown;
  sourceReference?: unknown;
  bottleCollection?: unknown;
  category?: unknown;
  capacity?: unknown;
  capacityMl?: unknown;
  heightWithCap?: unknown;
  heightWithoutCap?: unknown;
  diameter?: unknown;
}

export interface BestBottlesFamilyRigPromptAdjustment {
  rigImposed: boolean;
  taskLine: string;
  sourceTruthLines: string[];
  canvasCompositionLines: string[];
}

function textValue(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

function contextText(productContext?: BestBottlesFamilyRigProductContext | null): string {
  return [
    productContext?.sku,
    productContext?.websiteSku,
    productContext?.name,
    productContext?.itemDescription,
    productContext?.applicator,
    productContext?.capState,
    productContext?.mode,
    productContext?.presetId,
    productContext?.sourceReference,
  ].map(textValue).join(" ").toLowerCase();
}

function looksLikeCapOffOrDetached(productContext?: BestBottlesFamilyRigProductContext | null): boolean {
  const text = contextText(productContext);
  return (
    /\b(?:cap[-_\s]?off|cap\s+removed|detached|exploded|over[-_\s]?cap|overcap|loose\s+cap|cap\s+beside|cap\s+to\s+the\s+right)\b/.test(text) ||
    /(?:^|[-_/\\\s])(?:cap-off|cap_off|capoff|detached|exploded)(?:[-_/\\\s.]|$)/.test(text)
  );
}

function isAssembledOnlyVintageBulb(productContext?: BestBottlesFamilyRigProductContext | null): boolean {
  const sku = textValue(productContext?.sku).toUpperCase();
  const websiteSku = textValue(productContext?.websiteSku);
  const text = contextText(productContext);
  if (/(?:^|-)ASP(?:-|$)/.test(sku) || /(?:^|-)AST(?:-|$)/.test(sku)) return true;
  if (/ansp/i.test(websiteSku) || /antiquespray/i.test(text)) return true;
  if (/(?:vintage|antique).*(?:bulb|spray)/.test(text)) return true;
  if (/\bbulb sprayer\b/.test(text)) return true;
  return /\btassel\b/.test(text) && /\b(?:bulb|antique|vintage|sprayer)\b/.test(text);
}

function resolveCapState(productContext?: BestBottlesFamilyRigProductContext | null): RigCapState {
  if (isAssembledOnlyVintageBulb(productContext)) return "assembled";
  const capState = textValue(productContext?.capState).toLowerCase();
  const mode = textValue(productContext?.mode).toLowerCase();
  if (
    capState === "detached" ||
    capState === "cap-off" ||
    mode === "detached" ||
    mode === "cap-off"
  ) {
    return "detached";
  }
  if (
    capState === "assembled" ||
    capState === "cap-on" ||
    mode === "assembled" ||
    mode === "cap-on"
  ) {
    return "assembled";
  }
  if (looksLikeCapOffOrDetached(productContext)) {
    return "detached";
  }
  return "assembled";
}

const LEGACY_TASK_LINE =
  "Task: transform the uploaded real product reference into a high-end editorial photorealistic studio image and PDP master. The product geometry, proportions, colors, component shapes, camera angle, material identity, canvas placement, centerline, baseline, crop, camera distance, and scale are locked. The flat white source background, weak lighting, missing shadow, and extracted-PNG look are not locked.";

const LEGACY_SOURCE_TRUTH_LINES = [
  "- Preserve the source camera angle, product component relationships, bounding-box footprint, centerline, baseline, crop, camera distance, and relative scale inside the 2080 x 2288 canvas. Do not redesign, redraw, recolor, rotate, stretch, simplify, recenter, zoom, crop, or reinterpret the product.",
  "- Family alignment is mission-critical: this SKU must align with sibling images from the same family/capacity as if all were photographed on one fixed studio rig. The bottle base sits on the same imaginary horizontal baseline; the bottle body uses the same vertical centerline and visual height envelope.",
  "- Catalog grid standard: render this as part of a professional e-commerce product family grid, not as an isolated creative hero. Keep a stable invisible shelf line, consistent object magnification, matching top air, matching side margins, and identical body footprint across sibling cards.",
  "- Cap/closure/roller/sprayer color, finish, or cap height may change only the purchasable component. It must not change zoom, camera distance, product body size, body width, base position, top clearance, detached-cap scale, or overall framing.",
  "- Do not preserve the reference image's flat lighting, pure-white background, weak shadow, or low-end capture finish. Re-stage the same locked product as a luxury catalog photograph without moving it.",
];

const LEGACY_CANVAS_COMPOSITION_LINES = [
  "- Canvas: exact 2080 x 2288, 10:11 portrait PDP master.",
  "- The uploaded reference canvas is the placement lock. Preserve the same product centerline, baseline, bounding-box footprint, side padding, top padding, and bottom padding.",
  "- Fixed-family QA target: centerline drift <= 10 px, baseline drift <= 12 px, and product-height drift <= 2% versus the attached reference or family master. Do not exceed these tolerances.",
  "- Do not recompose or normalize the product to a new fill percentage. The image must read like the same product photo professionally retouched.",
];

export function buildBestBottlesCapStatePromptLine(
  productContext: BestBottlesFamilyRigProductContext | null | undefined,
  rigImposed: boolean,
): string {
  if (isAssembledOnlyVintageBulb(productContext)) {
    return "- This is one complete assembled image. The vintage style bulb and any tassel stay attached. There is no cap-off state, no detached cap, and no sidecar object.";
  }
  return rigImposed
    ? "- Preserve the exact cap/component state and visible components from Image 1. If a detached cap or over-cap is present, keep the cap-off/exploded relationship but place it according to the imposed rig baseline, gap, and spacing. For roll-on references, the exposed roller ball plug stays centered on the bottle neck and the detached over-cap stays upright to the right."
    : "- Preserve the exact cap/component state from Image 1: if an actuator/nozzle or roller ball is exposed and a detached cap is visible beside the bottle, keep both exactly as photographed. Do not add, remove, close, or relocate the cap.";
}

export function buildBestBottlesFamilyRigPromptAdjustment(
  productContext?: BestBottlesFamilyRigProductContext | null,
): BestBottlesFamilyRigPromptAdjustment {
  const family = textValue(productContext?.family);
  const resolvedCapState = resolveCapState(productContext);
  const rig = getFamilyRigForProduct({
    family,
    bottleCollection: textValue(productContext?.bottleCollection),
    category: textValue(productContext?.category),
    sku: textValue(productContext?.sku),
    websiteSku: textValue(productContext?.websiteSku),
    name: textValue(productContext?.name),
    itemDescription: textValue(productContext?.itemDescription),
    applicator: textValue(productContext?.applicator),
    capacity: textValue(productContext?.capacity),
    capacityMl: typeof productContext?.capacityMl === "number" ? productContext.capacityMl : null,
    heightWithCap: textValue(productContext?.heightWithCap),
    heightWithoutCap: textValue(productContext?.heightWithoutCap),
    diameter: textValue(productContext?.diameter),
    capState: resolvedCapState,
    mode: textValue(productContext?.mode),
  });
  const rigBlock = rig
    ? buildImposedRigBlock({
        family,
        capState: resolvedCapState,
        rig,
      })
    : null;

  if (!rigBlock) {
    return {
      rigImposed: false,
      taskLine: LEGACY_TASK_LINE,
      sourceTruthLines: LEGACY_SOURCE_TRUTH_LINES,
      canvasCompositionLines: LEGACY_CANVAS_COMPOSITION_LINES,
    };
  }

  return {
    rigImposed: true,
    taskLine:
      "Task: transform the uploaded real product reference into a high-end editorial photorealistic studio image and PDP master. Product geometry, proportions, colors, component shapes, camera angle, material identity, and cap state are locked to Image 1. Composition is set by the imposed studio rig, not by the reference canvas placement, centerline, baseline, crop, camera distance, or scale. The flat white source background, weak lighting, missing shadow, and extracted-PNG look are not locked.",
    sourceTruthLines: [
      "- Preserve the source camera angle and product component relationships. The reference governs product identity, geometry, proportions, color, cap state, component count, and material truth; the imposed studio rig governs placement and scale.",
      "- Do not preserve the reference image's canvas placement, centerline, baseline, crop, camera distance, or scale when it conflicts with the imposed studio rig.",
      "- If the uploaded background-removed PNG has excess transparent padding, a tiny foreground, or an oversized foreground, mentally trim to the true product/component bounds before applying the rig. The source foreground size is not product truth.",
      "- Family alignment is mission-critical: this SKU must align with sibling images from the same family as if all were photographed on one fixed studio rig. The imposed rig supplies the shared shelf line, vertical centerline, visual height envelope, and uniform master framing.",
      "- Catalog grid standard: render this as part of a professional e-commerce product family grid, not as an isolated creative hero. Keep the stable invisible shelf line and fixed camera system defined by the imposed rig.",
      "- Cap/closure/roller/sprayer color, finish, or cap height may change only the purchasable component. It must not change product body identity, camera angle, component relationships, or the imposed rig placement.",
      "- Applicator type is not cap state: roll-on, roller-ball, sprayer, pump, and closure SKUs remain assembled/cap-on unless product context or reference filename explicitly says cap-off, detached, exploded, over-cap, loose cap, cap beside, or cap to the right.",
      ...(isAssembledOnlyVintageBulb(productContext)
        ? [
            "- Vintage style bulb and vintage style bulb tassel are one complete assembled image. The bulb, hose, and tassel stay attached. There is no cap-off state, no detached cap, and no sidecar object.",
          ]
        : []),
      "- Do not preserve the reference image's flat lighting, pure-white background, weak shadow, or low-end capture finish. Re-stage the same locked product as a luxury catalog photograph on the imposed rig.",
    ],
    canvasCompositionLines: [
      "- Canvas: exact 2080 x 2288, 10:11 portrait PDP master.",
      rigBlock,
      "- Do not treat the uploaded reference canvas as the placement lock. The imposed studio rig sets centerline, baseline, product scale, crop, and placement.",
      "- Do not perform an editorial recomposition outside the rig. The image must read like the same product professionally retouched and placed on the fixed family studio system.",
    ],
  };
}
