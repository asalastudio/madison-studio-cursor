import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode, decode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { formatVisualContext } from "../_shared/productFieldFilters.ts";
import { callGeminiImage } from "../_shared/aiProviders.ts";
import { enhancePromptWithOntology } from "../_shared/photographyOntology.ts";
import { generateImage as generateFreepikImage, type FreepikImageModel, type FreepikResolution, IMAGE_MODELS } from "../_shared/freepikProvider.ts";
import { generateImage as generateOpenAIImage, type OpenAIImageModel, type OpenAIImageSize, type OpenAIOutputFormat } from "../_shared/openaiProvider.ts";
import {
  beginGenerationAttempt,
  completeGenerationAttempt,
  type GenerationAttemptTracker,
} from "../_shared/generationAttemptLedger.ts";
import { getVisualStyleDirective, type VisualSquad } from "../_shared/visualMasters.ts";
import { buildBestBottlesFamilyRigPromptAdjustment } from "../_shared/bestBottlesFamilyRigPrompt.ts";
import { buildInlineRefinementStabilizerBlock } from "../_shared/inlineRefinementPrompt.ts";
import { buildBestBottlesApplicatorPromptRules } from "../_shared/bestBottlesApplicatorPromptRules.ts";
import {
  BEST_BOTTLES_REFERENCE_LOCKED_BONE_CANVAS_RGBA,
  buildBestBottlesBackgroundAndShadowPrompt,
} from "../_shared/bestBottlesBackgroundAndShadowPrompt.ts";
import { formatBestBottlesBodyMaterialSkuLock } from "../_shared/bestBottlesBodyMaterialPrompt.ts";
import { resolveBestBottlesPrecompiledPrompt } from "../_shared/bestBottlesPrecompiledPrompt.ts";
import {
  resolveBestBottlesProductionResolution,
  shouldForceBestBottlesOpenAIProvider,
} from "../_shared/bestBottlesProviderRouting.ts";
import {
  BEST_BOTTLES_CONTRACT_CANVAS,
  resolveBestBottlesRenderingContract,
  type BestBottlesRenderingContract,
} from "../_shared/bestBottlesRenderingContract.ts";
import { withHeartbeatJsonResponse } from "../_shared/streamingJsonResponse.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MAX_REQUESTED_CANVAS_PIXELS = 12_000_000;
const OPENAI_EXACT_SIZE_ALLOWLIST = new Set([
  "1024x1024",
  "1024x1536",
  "1536x1024",
  "1152x2048",
  "2048x1152",
  "2048x2048",
  "2080x2288",
  "2160x3840",
  "2880x2880",
  "3840x2160",
]);

function getExactCanvasForAspectRatio(aspectRatio?: string): { width: number; height: number } | null {
  const normalized = aspectRatio?.trim().toLowerCase().replace(/\s+/g, "");
  if (normalized === "10:11" || normalized === "2080:2288" || normalized === "2080x2288") {
    return { width: 2080, height: 2288 };
  }
  return null;
}

function greatestCommonDivisor(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || 1;
}

function parseRequestedOutputCanvas(
  imageConstraints: unknown,
): { width: number; height: number } | null {
  if (!imageConstraints || typeof imageConstraints !== "object") return null;
  const constraints = imageConstraints as Record<string, unknown>;
  const canvas = constraints.outputCanvas;
  if (!canvas || typeof canvas !== "object") return null;
  const { width, height } = canvas as Record<string, unknown>;
  const w = Number(width);
  const h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  const rounded = { width: Math.round(w), height: Math.round(h) };
  if (rounded.width * rounded.height > MAX_REQUESTED_CANVAS_PIXELS) return null;
  return rounded;
}

function aspectRatioForCanvas(canvas: { width: number; height: number }): string {
  const divisor = greatestCommonDivisor(canvas.width, canvas.height);
  return `${canvas.width / divisor}:${canvas.height / divisor}`;
}

function openAIExactSizeForCanvas(
  canvas: { width: number; height: number } | null,
): OpenAIImageSize | undefined {
  if (!canvas) return undefined;
  const size = `${canvas.width}x${canvas.height}`;
  return OPENAI_EXACT_SIZE_ALLOWLIST.has(size) ? size as OpenAIImageSize : undefined;
}

function normalizeOpenAIOutputFormat(value: unknown): OpenAIOutputFormat {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "jpg") return "jpeg";
  if (normalized === "jpeg" || normalized === "webp" || normalized === "png") {
    return normalized;
  }
  return "png";
}

async function conformGeneratedImage(
  base64Image: string,
  aspectRatio: string | undefined,
  exactCanvas: { width: number; height: number } | null,
  backgroundColor?: number,
) {
  const { conformImageToAspectRatio, containImageOnCanvas } = await import("../_shared/imageAspectRatio.ts");
  return exactCanvas
    ? containImageOnCanvas(base64Image, exactCanvas.width, exactCanvas.height, backgroundColor)
    : conformImageToAspectRatio(base64Image, aspectRatio);
}

interface BestBottlesBodyMaterialPromptRules {
  kind: "glass" | "aluminum" | "atomizer-metal" | "plastic";
  sourceTruthMaterial: string;
  styleReferenceScopeLine: string;
  photographicStyleLine: string;
  lightingLines: string[];
  bodyMaterialLine: string;
  forbiddenLines: string[];
  packshotRules: string[];
}

function getBestBottlesProductText(productContext?: Record<string, unknown> | null): string {
  return [
    productContext?.bodyMaterial,
    productContext?.family,
    productContext?.name,
    productContext?.websiteSku,
    productContext?.itemDescription,
    productContext?.collection,
    productContext?.category,
    productContext?.color,
    productContext?.sku,
    productContext?.applicator,
    productContext?.capColor,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
}

function buildCylinderQualityAndAlignmentPrompt(
  productContext?: Record<string, unknown> | null,
): string | null {
  const family = typeof productContext?.family === "string"
    ? productContext.family.trim().toLowerCase()
    : "";
  if (family !== "cylinder" && family !== "tall cylinder") {
    return null;
  }

  return [
    "CYLINDER FAMILY QUALITY AND ALIGNMENT CONTRACT:",
    "- Render as a high-end editorial photorealistic studio image for premium ecommerce, not a legacy catalog cutout.",
    "- Preserve the Cylinder bottle's exact tube geometry, circular base, straight vertical sidewalls, shoulder/neck proportions, cap state, and SKU-specific component identity.",
    "- Increase perceived quality through sharper glass edge definition, realistic wall thickness, controlled refraction, clean neck threads, believable clean base mass, precise cap material finish, and a physically plausible contact shadow.",
    "- Baseline alignment is mandatory: all Cylinder siblings of the same capacity must share the same imaginary shelf line, vertical bottle centerline, object scale, side margins, top air, bottom padding, camera distance, and optical compression.",
    "- If the model must choose between beauty and family alignment, choose family alignment. Do not zoom, crop, enlarge, shrink, tilt, or recompose to make the image feel more dramatic.",
  ].join("\n");
}

function buildBestBottlesBodyMaterialPromptRules(
  productContext?: Record<string, unknown> | null,
): BestBottlesBodyMaterialPromptRules {
  const productText = getBestBottlesProductText(productContext);

  const isAluminum =
    productText.includes("aluminum") ||
    productText.includes("aluminium") ||
    productText.includes("ab-alu");
  const isAtomizerMetal =
    productText.includes("atomizer") ||
    productText.includes("metal atomizer") ||
    productText.includes("metal shell") ||
    productText.includes("travel size purse atomizer") ||
    /\bgbatom(?:5|10)/i.test(productText) ||
    /\bgb-[a-z0-9-]+-(?:5ml|10ml)-atm-/i.test(productText);
  if (isAtomizerMetal) {
    return {
      kind: "atomizer-metal",
      sourceTruthMaterial:
        "refillable metal-shell perfume atomizer/travel atomizer, opaque colored/anodized aluminum outer casing, exact cylindrical metal sleeve, cap/sprayer metal transitions, slim shell proportions, pump/actuator geometry, colors, decorative pattern if present, and material identity. The body and cap are solid metal outer shells, not transparent glass.",
      styleReferenceScopeLine:
        "- Use any secondary style/specularity reference only for lighting quality, reflection-card gradients, edge glints on opaque metal, contact shadow, ambient occlusion, and premium studio polish. It must not make the atomizer casing transparent, translucent, glassy, refractive, crystalline, acrylic, or plastic.",
      photographicStyleLine:
        "- Secondary style/specularity reference influence, if provided, is lighting and metal-realism only: warm directional drama, soft elongated shadow behavior, vertical reflection rhythm, tactile anodized/brushed metal finish, cap texture, and premium pack-shot polish. The Best Bottles metal-shell atomizer shape and opaque metal casing remain the only product truth.",
      lightingLines: [
        "- Use professional metal-product lighting, not flat front lighting.",
        "- Soft warm key light from upper front-left, gentle negative fill, controlled black-card edge lines, and white reflection cards creating clean vertical metallic highlights across the cylindrical metal sleeve and cap.",
        "- Translate window/curtain-like inspiration into abstract reflection-card behavior on the metal casing: slender warm vertical highlights, dark edge density, and soft luminous bands across the opaque metal. Do not generate actual curtains, window frames, fabric, wood, flowers, or scene props.",
        "- Keep the Bone background flat and quiet; put the visual drama inside the product through metal reflectance, anodized color depth, cap texture, shoulder/collar highlight, and grounding shadow.",
        "- The atomizer body and cap should be defined by opaque metal reflectance, subtle anisotropic grain or anodized sheen, clean vertical highlight falloff, and realistic metal tonal gradients. No transmitted light, no refraction, no visible back wall, no glass wall thickness.",
      ],
      bodyMaterialLine:
        "- Atomizer body/cap: preserve an opaque colored/anodized metal shell perfume atomizer. It must be solid metal, not transparent, not translucent, not glass, not crystal, not acrylic, and not clear plastic. Enhance metallic reflectivity, fine vertical grain or anodized sheen, soft cylindrical highlight bands, controlled dark edge lines, and realistic colored metal tonal variation while preserving the exact reference shape and pattern.",
      forbiddenLines: [
        "- Do not turn the atomizer casing into glass, clear plastic, translucent material, acrylic, crystal, liquid-filled glass, frosted glass, or a transparent perfume bottle.",
        "- No refraction through the atomizer body, no visible back wall, no internal caustics, no wall thickness, no glass rim sparkle, no transparent edges, no translucent blue glow, no liquid, and no interior dip tube visible through the metal body.",
      ],
      packshotRules: [
        "LOCK GEOMETRY, RELIGHT OPAQUE METAL: the reference locks silhouette, proportions, cap shape, sprayer/collar geometry, camera angle, pattern placement, and casing color; it does not lock poor exposure, weak contrast, flat white fill, dull metal, missing metal grain, or low-end capture quality.",
        "Do not perform a simple background cleanup or silhouette trace. Reconstruct the same refillable metal-shell perfume atomizer as a true luxury e-commerce pack shot inside the exact same outline.",
        "Lighting/material inspiration is allowed only as a photographic quality target: warm quiet drama, controlled directionality, dense but soft shadows, premium colored/anodized metal realism, and tactile metal texture. Never copy another bottle shape, label, cap design, scene, prop, tabletop, flower, curtain, or brand mark.",
        "Opaque atomizer metal must not become transparent. It needs visible metal structure: fine grain or anodized sheen, soft vertical reflection-card bands, shoulder/collar highlight, gentle edge darkening, realistic cap texture, and strong tonal separation from the Bone background.",
        "Use product-photography cards: controlled black-card edge lines on left/right metal boundaries, white-card vertical highlights across the cylindrical body and cap, and soft reflection gradients that describe metal curvature without becoming broad CGI stripes.",
        "Metal texture target: dust-free luxury retouch with real satin/anodized-metal irregularity, subtle manufacturing micro-imperfections, edge density, and polished pack-shot separation. It should feel photographed, not rendered.",
        "The body should read as opaque colored/anodized metal with volume, not glass, not a white cutout, not a blank void, not a traced outline, not milky plastic, and not a tinted transparent vial.",
        "Retouching intensity target: premium commercial retouch, enough to visibly improve fidelity and polish while preserving every structural edge from Image 1.",
      ],
    };
  }
  if (isAluminum) {
    return {
      kind: "aluminum",
      sourceTruthMaterial:
        "opaque brushed/satin aluminum body material, exact metal grain direction, soft vertical metallic sheen, shoulder highlights, crimp/neck metal/plastic transitions, cap texture, silhouette, proportions, component relationships, colors, and material identity.",
      styleReferenceScopeLine:
        "- Use any secondary style/specularity reference only for lighting quality, reflection-card gradients, edge glints on opaque metal, contact shadow, ambient occlusion, and premium studio polish. It must not make the aluminum transparent, glassy, refractive, crystalline, or plastic.",
      photographicStyleLine:
        "- Secondary style/specularity reference influence, if provided, is lighting and metal-realism only: warm directional drama, soft elongated shadow behavior, vertical reflection rhythm, tactile satin/brushed aluminum grain, cap texture, and premium pack-shot polish. The Best Bottles aluminum product shape and opaque metal substrate remain the only product truth.",
      lightingLines: [
        "- Use professional metal-product lighting, not flat front lighting.",
        "- Soft warm key light from upper front-left, gentle negative fill, subtle side strip reflections to reveal the cylinder curvature, black cards/flags creating controlled dark edge lines, and white reflection cards creating clean vertical metallic highlights.",
        "- Translate window/curtain-like inspiration into abstract reflection-card behavior on the aluminum: slender warm vertical highlights, dark edge density, and soft luminous bands across the satin/brushed metal. Do not generate actual curtains, window frames, fabric, wood, flowers, or scene props.",
        "- Keep the Bone background flat and quiet; put the visual drama inside the product through metal reflectance, brushed grain, cap texture, shoulder highlight, and grounding shadow.",
        "- The aluminum body should be defined by opaque metal reflectance, subtle anisotropic grain, clean vertical highlight falloff, and realistic satin-metal tonal gradients. No transmitted light, no refraction, no visible back wall, no glass wall thickness.",
      ],
      bodyMaterialLine:
        "- Aluminum body: preserve an opaque satin/brushed aluminum substrate. It must be solid metal, not transparent, not translucent, not glass, not crystal, and not clear plastic. Enhance fine vertical metal grain, subtle micro-scratches, soft cylindrical highlight bands, shoulder curvature, and realistic silver-gray metal tonal variation while preserving the exact reference shape.",
      forbiddenLines: [
        "- Do not turn the aluminum body into glass, clear plastic, translucent material, crystal, chrome mirror, liquid-filled glass, frosted glass, or a transparent perfume bottle.",
        "- No refraction through the aluminum body, no visible back wall, no internal caustics, no wall thickness, no glass rim sparkle, no transparent edges, no liquid, and no interior dip tube visible through the metal body.",
      ],
      packshotRules: [
        "LOCK GEOMETRY, RELIGHT OPAQUE METAL: the reference locks silhouette, proportions, cap shape, sprayer/collar geometry, camera angle, and placement; it does not lock poor exposure, weak contrast, flat white fill, dull metal, missing metal grain, or low-end capture quality.",
        "Do not perform a simple background cleanup or silhouette trace. Reconstruct the same aluminum bottle as a true luxury e-commerce pack shot inside the exact same outline.",
        "Lighting/material inspiration is allowed only as a photographic quality target: warm quiet drama, controlled directionality, dense but soft shadows, premium satin/brushed aluminum realism, and tactile metal texture. Never copy another bottle shape, label, cap design, scene, prop, tabletop, flower, curtain, or brand mark.",
        "Opaque aluminum must not become transparent. It needs visible metal structure: fine grain, soft vertical reflection-card bands, shoulder highlight, gentle edge darkening, realistic cap texture, and subtle silver-gray tonal separation from the Bone background.",
        "Use product-photography cards: controlled black-card edge lines on left/right metal boundaries, white-card vertical highlights across the cylindrical body and shoulder, and soft reflection gradients that describe the metal curvature without becoming broad CGI stripes.",
        "Aluminum texture target: dust-free luxury retouch with real satin-metal irregularity, subtle brushed grain, faint manufacturing micro-imperfections, edge density, and polished pack-shot separation. It should feel photographed, not rendered.",
        "The body should read as opaque brushed/satin aluminum with volume, not glass, not a white cutout, not a blank void, not a traced outline, and not milky plastic.",
        "Retouching intensity target: premium commercial retouch, enough to visibly improve fidelity and polish while preserving every structural edge from Image 1.",
      ],
    };
  }

  const rules = [
    "LOCK GEOMETRY, RELIGHT MATERIAL: the reference locks silhouette, proportions, facets, cap shape, camera angle, and placement; it does not lock poor exposure, weak contrast, flat white fill, silhouetted glass, missing refraction, or low-end capture quality.",
    "Do not perform a simple background cleanup or silhouette trace. Reconstruct the same bottle as a true luxury e-commerce pack shot inside the exact same outline.",
    "Lighting/material inspiration is allowed only as a photographic quality target: warm quiet drama, controlled sunlight-like directionality, dense but soft shadows, premium fragrance-glass realism, and tactile optical texture. Never copy another bottle shape, label, cap design, scene, prop, tabletop, flower, curtain, or brand mark.",
    "Clear glass must not disappear into the Bone background. It needs visible optical structure: inner wall lines, back-wall refraction, rim thickness, shoulder thickness, base mass, bevel glints, clean curved base refraction, and neutral edge separation inside the glass without cloudy fill.",
    "Pale or white regions visible inside clear glass in Image 1 are supplier background/matte showing through transparent glass, not product material, not liquid, not plastic, not a white insert, and not identity. Do not preserve them as a solid lower block.",
    "Use product-photography cards: controlled black-card edge lines on left/right glass boundaries and inner facets, white-card specular highlights on bevels and shoulders, and transmitted warm backlight through the bottle. Reflections should describe shape, not become broad white glare.",
    "Glass texture target: dust-free luxury retouch with real optical irregularity, subtle surface waviness, faint molded-glass micro-imperfections, edge density, internal shadowing, refracted background bends, and clean base rim/refraction highlights. It should feel photographed, not rendered.",
    "The body should read as transparent glass with volume, not a white cutout, not a blank void, not a traced outline, and not milky plastic.",
    "Retouching intensity target: premium commercial retouch, enough to visibly improve fidelity and polish while preserving every structural edge from Image 1.",
  ];
  const isClearGlassProduct =
    productText.includes("clear") &&
    !/(?:amber|cobalt|blue|green|frost|swirl|colored|coloured)/.test(productText);

  if (
    productText.includes("diamond") ||
    productText.includes("faceted") ||
    productText.includes("facet")
  ) {
    rules.push(
      "DIAMOND/FACETED BOTTLE REQUIREMENT: preserve the exact central diamond panel and all diagonal bevel geometry from Image 1. The diagonal facet ridges, corner prisms, inner diamond edges, and thick base facets must remain readable through refraction and edge highlights.",
      "The central diamond panel cannot be an empty white diamond. Add subtle refracted background bend, soft gray edge density, tiny bevel highlights, and shadowed internal facet lines so it reads as cut glass with depth.",
    );
  }

  return {
    kind: "glass",
    sourceTruthMaterial:
      "glass thickness, transparent body substrate, silhouette, proportions, component relationships, colors, and material identity.",
    styleReferenceScopeLine:
      "- Use any secondary style/specularity reference only for realistic glass transparency, refraction, rim glints, specular highlight rhythm, contact shadow, ambient occlusion, and premium studio polish.",
    photographicStyleLine:
      "- Secondary glass/specularity reference influence, if provided, is lighting and glass realism only: warm directional sunlight-like drama, soft elongated shadow behavior, amber-cream tonal warmth, vertical reflection rhythm, tactile glass thickness, and premium fragrance-campaign polish. The Best Bottles product shape remains the only product shape.",
    lightingLines: [
      "- Use professional glass-product lighting, not flat front lighting.",
      "- Soft warm key light from upper front-left, gentle negative fill, large diffused backlight through the glass, subtle side strip reflections to define edges, black cards/flags creating controlled dark edge lines, and white reflection cards creating clean specular highlights.",
      "- Translate window/curtain-like inspiration into abstract reflection-card behavior on the product: slender warm vertical highlights, dark edge density, and soft luminous bands inside the glass. Do not generate actual curtains, window frames, fabric, wood, flowers, or scene props.",
      "- Keep the Bone background flat and quiet; put the visual drama inside the product through reflections, refractions, edge density, clean base rim/refraction highlights, cap texture, and shadow.",
      "- The glass should be defined by transmitted light, rim light, refraction, and edge reflections.",
    ],
    bodyMaterialLine: "",
    forbiddenLines: isClearGlassProduct
      ? [
          "- Clear glass must remain optically clean, empty, colorless, and see-through: no cloudy white fill, milky haze, frosted interior, residue, dust, smoke, sediment, bubbles, paint-like patches, opaque white material, chalky blob, white plug, fogged insert, or internal matte patch inside the bottle body, shoulder, funnel, or base.",
          "- Lower clear-glass bottle/base must not become a solid white rectangle, white column, milk-filled chamber, or opaque block. Preserve circular base rings and transparent wall thickness instead.",
        ]
      : [],
    packshotRules: rules,
  };
}

function textField(record: Record<string, unknown> | null | undefined, key: string): string {
  const value = record?.[key];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Dedicated cap-identity reference scope, shared by the bottle and non-bottle
 * reference-locked prompt builders. Empty string when no component reference
 * is attached (callers render it as `scope || null`).
 */
function buildComponentIdentityScopeBlock(categorizedRefs: CategorizedReferences): string {
  if (categorizedRefs.component.length === 0) return "";
  return [
    "DEDICATED CAP IDENTITY REFERENCE SCOPE:",
    "- Image 1 remains the product and placement truth. The dedicated cap image controls only the detached cap's identity, finish, and decoration topology.",
    "- For dotted caps, reproduce alternating staggered columns of three and two studs. Never make every column the same count and never add or extrapolate another row.",
    ...categorizedRefs.component
      .map((ref, idx) => ref.description ? `Cap Identity Reference ${idx + 1}: ${ref.description}` : null)
      .filter((line): line is string => Boolean(line)),
  ].join("\n");
}

function buildReferenceLockedBestBottlesNonBottlePrompt(
  categorizedRefs: CategorizedReferences,
  aspectRatio: string | undefined,
  productContext: Record<string, unknown> | null | undefined,
  operatorRefinement: string | undefined,
  inlineRefinementStabilizerBlock: string | null | undefined,
  promptProfile: "component_enhancement" | "packaging_enhancement",
): string {
  const isPackaging = promptProfile === "packaging_enhancement";
  const refNote = categorizedRefs.product
    .map((ref, idx) => ref.description ? `Reference ${idx + 1}: ${ref.description}` : null)
    .filter((line): line is string => Boolean(line))
    .join("\n");
  const componentIdentityScope = buildComponentIdentityScopeBlock(categorizedRefs);
  const cleanOperatorRefinement =
    typeof operatorRefinement === "string" && operatorRefinement.trim()
      ? operatorRefinement.trim().slice(0, 900)
      : "";
  const identityLines = [
    textField(productContext, "sku") ? `SKU: ${textField(productContext, "sku")}` : null,
    textField(productContext, "websiteSku") ? `Website SKU: ${textField(productContext, "websiteSku")}` : null,
    textField(productContext, "family") ? `Family: ${textField(productContext, "family")}` : null,
    textField(productContext, "itemName") ? `Name: ${textField(productContext, "itemName")}` : null,
    textField(productContext, "color") ? `Color/material color: ${textField(productContext, "color")}` : null,
  ].filter(Boolean).join("\n");

  return [
    isPackaging
      ? "REFERENCE-LOCKED BEST BOTTLES PACKAGING ENHANCEMENT V1."
      : "REFERENCE-LOCKED BEST BOTTLES COMPONENT ENHANCEMENT V1.",
    "",
    isPackaging
      ? "Task: enhance the attached packaging reference into a clean premium ecommerce pack shot while preserving exact packaging geometry, material, color, folds, window openings, seams, proportions, and orientation."
      : "Task: enhance the attached component or fitment reference into a clean premium ecommerce pack shot while preserving exact component geometry, material, color, finish, threading, actuator/dropper/pump/cap details, proportions, and orientation.",
    "",
    "SOURCE OF TRUTH:",
    "- Image 1 is the only product identity source. Do not redesign, recolor, duplicate, remove, simplify, relabel, or invent any component.",
    "- This is a material-and-lighting enhancement, not a new product design.",
    "- Preserve the reference camera angle unless the fixed studio baseline requires minor straightening.",
    "",
    "CANVAS AND COMPOSITION:",
    "- Canvas: exact 2080 x 2288, 10:11 portrait ecommerce master.",
    "- Background: seamless flat Best Bottles Bone #F5F3EF.",
    "- Center the primary object on the vertical centerline.",
    "- Seat the lowest visible contact edge on the shared studio baseline approximately 8-10% above the bottom edge.",
    "- Keep the full object visible with comfortable margins. Do not crop, float, tilt, or add sidecar objects.",
    "",
    "MATERIAL ENHANCEMENT:",
    isPackaging
      ? "- Preserve paper, cardboard, plastic window, ribbon, pouch, or packaging-supply material exactly as shown. Improve cleanliness, edge definition, tonal separation, and premium ecommerce polish."
      : "- Preserve metal, plastic, rubber, glass, textile, or mixed-material finish exactly as shown. Improve material separation, edge definition, threading/detail readability, and premium ecommerce polish.",
    "- Use controlled studio reflections and soft contact shadow only where physically plausible.",
    "- Do not apply bottle glass transparency rules unless the reference component itself is glass.",
    "",
    "FORBIDDEN:",
    "- No labels, text, brand marks, props, hands, lifestyle scene, tabletop edge, horizon line, vignette, decorative background, or extra components.",
    "- No liquid, bottle body, glass bottle silhouette, frosted glass, cloudy fill, refraction effects, or bottle-specific sidewall highlights unless explicitly present in the reference component.",
    "- No artificial parallel lines, texture noise, smears, dust, scratches, halo, bloom, CGI plasticity, or painterly rendering.",
    "",
    inlineRefinementStabilizerBlock || null,
    inlineRefinementStabilizerBlock ? "" : null,
    cleanOperatorRefinement
      ? `OPERATOR RETOUCH REQUEST - apply only if it does not conflict with the reference identity lock:\n${cleanOperatorRefinement}`
      : null,
    identityLines ? `PRODUCT TRUTH:\n${identityLines}` : null,
    refNote || null,
    aspectRatio ? `OUTPUT: ${aspectRatio} aspect ratio, exact 2080 x 2288 PDP canvas when available.` : null,
  ].filter((section): section is string => Boolean(section)).join("\n\n");
}

function buildReferenceLockedBestBottlesPrompt(
  categorizedRefs: CategorizedReferences,
  aspectRatio?: string,
  productContext?: Record<string, unknown> | null,
  operatorRefinement?: string,
  inlineRefinementStabilizerBlock?: string | null,
): string {
  const promptProfile = textField(productContext, "promptProfile");
  if (promptProfile === "component_enhancement" || promptProfile === "packaging_enhancement") {
    return buildReferenceLockedBestBottlesNonBottlePrompt(
      categorizedRefs,
      aspectRatio,
      productContext,
      operatorRefinement,
      inlineRefinementStabilizerBlock,
      promptProfile,
    );
  }

  const refNote = categorizedRefs.product
    .map((ref, idx) => ref.description ? `Reference ${idx + 1}: ${ref.description}` : null)
    .filter((line): line is string => Boolean(line))
    .join("\n");
  const bodyMaterialRules = buildBestBottlesBodyMaterialPromptRules(productContext);
  const secondaryStyleScope = categorizedRefs.style.length > 0
    ? [
        "SECONDARY STYLE REFERENCE SCOPE:",
        "- Image 1 remains the only bottle identity, geometry, placement, color, applicator, and camera-angle source. The dedicated cap identity reference is the sole exception for the detached cap's finish and decoration topology.",
        bodyMaterialRules.styleReferenceScopeLine,
        "- Do not copy the secondary reference's product silhouette, cap, label, typography, brand, colorway, camera angle, composition, background, props, tabletop, flowers, curtains, or scene.",
        ...categorizedRefs.style
          .map((ref, idx) => ref.description ? `Style Reference ${idx + 1}: ${ref.description}` : null)
          .filter((line): line is string => Boolean(line)),
      ].join("\n")
    : "";
  const applicatorRules = buildBestBottlesApplicatorPromptRules(productContext);
  const sourceTruth =
    bodyMaterialRules.kind === "aluminum" || bodyMaterialRules.kind === "atomizer-metal"
      ? [
          applicatorRules.sourceTruth
            .replace(/,?\s*glass thickness/gi, "")
            .replace(/,?\s*visible wall thickness/gi, "")
            .replace(/,?\s*transparent body substrate/gi, ""),
          bodyMaterialRules.sourceTruthMaterial,
        ].join(" ")
      : applicatorRules.sourceTruth;
  const expectedColor = [
    formatBestBottlesBodyMaterialSkuLock(bodyMaterialRules.kind, productContext?.bodyMaterial),
    typeof productContext?.family === "string" ? `Family: ${productContext.family}` : null,
    typeof productContext?.color === "string" ? `Body color: ${productContext.color}` : null,
    typeof productContext?.capColor === "string" ? `${applicatorRules.colorLabel}: ${productContext.capColor}` : null,
    typeof productContext?.trimColor === "string" ? `Trim metal: ${productContext.trimColor}` : null,
    typeof productContext?.applicator === "string" ? `Applicator: ${productContext.applicator}` : null,
    typeof productContext?.tasselColor === "string" ? `Tassel color: ${productContext.tasselColor}` : null,
    typeof productContext?.bulbColor === "string" ? `Bulb color: ${productContext.bulbColor}` : null,
    typeof productContext?.hoseColor === "string" ? `Hose color: ${productContext.hoseColor}` : null,
    typeof productContext?.collarFinish === "string" ? `Collar finish: ${productContext.collarFinish}` : null,
    typeof productContext?.ringPresent === "boolean" ? `Ring present: ${productContext.ringPresent ? "yes" : "no"}` : null,
    typeof productContext?.accessoryCode === "string" ? `Accessory code: ${productContext.accessoryCode}` : null,
    typeof productContext?.reducerFinish === "string" ? `Reducer/leather finish: ${productContext.reducerFinish}` : null,
  ].filter(Boolean).join("\n");
  const qaMetadata = [
    typeof productContext?.identityHash === "string" ? `Identity hash: ${productContext.identityHash}` : null,
    typeof productContext?.promptVersion === "string" ? `Prompt version: ${productContext.promptVersion}` : null,
    typeof productContext?.rigVersion === "string" ? `Rig version: ${productContext.rigVersion}` : null,
    typeof productContext?.canvas === "string" ? `Canvas contract: ${productContext.canvas}` : null,
    typeof productContext?.sourceReference === "string" ? `Source reference: ${productContext.sourceReference}` : null,
  ].filter(Boolean).join("\n");
  const measurementLock = [
    typeof productContext?.sku === "string" ? `SKU: ${productContext.sku}` : null,
    typeof productContext?.capacityMl === "number" ? `Capacity: ${productContext.capacityMl} ml` : null,
    typeof productContext?.heightWithoutCap === "string" ? `Body height without cap: ${productContext.heightWithoutCap}` : null,
    typeof productContext?.heightWithCap === "string" ? `Assembled height with cap/applicator: ${productContext.heightWithCap}` : null,
    typeof productContext?.diameter === "string" ? `Face width / diameter: ${productContext.diameter}` : null,
    "The rendered body height-to-width relationship must match these measurements. 50 ml and 100 ml variants must share the family width/depth system but differ in body height according to their measured catalog rows.",
  ].filter(Boolean).join("\n");
  const cleanOperatorRefinement =
    typeof operatorRefinement === "string" && operatorRefinement.trim()
      ? operatorRefinement.trim().slice(0, 900)
      : "";
  const cylinderQualityAndAlignmentPrompt = buildCylinderQualityAndAlignmentPrompt(productContext);
  const familyRigPrompt = buildBestBottlesFamilyRigPromptAdjustment(productContext);
  const capStateLine = familyRigPrompt.rigImposed
    ? "- Preserve the exact cap/component state and visible components from Image 1. If a detached cap or over-cap is present, keep the cap-off/exploded relationship but place it according to the imposed rig baseline, gap, and spacing. For roll-on references, the exposed roller ball plug stays centered on the bottle neck and the detached over-cap stays upright to the right."
    : "- Preserve the exact cap/component state from Image 1: if an actuator/nozzle or roller ball is exposed and a detached cap is visible beside the bottle, keep both exactly as photographed. Do not add, remove, close, or relocate the cap.";
  const operatorConflictScope = familyRigPrompt.rigImposed
    ? "reference identity lock and imposed studio rig"
    : "reference lock";
  const componentIdentityScope = buildComponentIdentityScopeBlock(categorizedRefs);

  return [
    "REFERENCE-LOCKED BEST BOTTLES LUXURY PRODUCT PHOTOGRAPHY V5.1.",
    "",
    familyRigPrompt.taskLine,
    cylinderQualityAndAlignmentPrompt,
    "",
    "GEOMETRY LOCK VS PACK-SHOT UPGRADE:",
    ...bodyMaterialRules.packshotRules.map((rule) => `- ${rule}`),
    "",
    "SOURCE OF TRUTH:",
    `- Use Image 1 only as the product reference: ${sourceTruth}`,
    componentIdentityScope || null,
    secondaryStyleScope || null,
    ...familyRigPrompt.sourceTruthLines,
    capStateLine,
    `- ${applicatorRules.fullVisibility}`,
    "",
    "CANVAS AND COMPOSITION:",
    familyRigPrompt.canvasCompositionLines[0],
    `- ${applicatorRules.canvasBounds}`,
    ...familyRigPrompt.canvasCompositionLines.slice(1),
    "",
    "PHOTOGRAPHIC STYLE:",
    "- High-end editorial photorealistic studio image, as if captured on a Hasselblad medium-format studio camera with a 100mm macro/product lens at f/8–f/11, ISO 100, tripod-stable capture, high dynamic range, controlled exposure, crisp edge acuity, and realistic optical compression.",
    "- Quiet luxury editorial restraint: Kinfolk-like negative space and warmth, Aesop-like minimal product staging and material honesty. Match only the mood, restraint, warm neutrals, and premium photographic discipline. Do not imitate Aesop products, labels, packaging, typography, or brand assets.",
    bodyMaterialRules.photographicStyleLine,
    "",
    "LIGHTING:",
    ...bodyMaterialRules.lightingLines,
    "",
    "MATERIAL ENHANCEMENT:",
    "- The result must show a clear visible quality lift over the reference, not a near-duplicate. Increase material separation, controlled contrast, micro-detail, and studio polish while preserving product truth.",
    bodyMaterialRules.bodyMaterialLine || applicatorRules.glassMaterialLine,
    applicatorRules.fitmentMaterialLine,
    applicatorRules.textileMaterialLine || null,
    "",
    ...buildBestBottlesBackgroundAndShadowPrompt({
      shadowContact: applicatorRules.shadowContact,
    }),
    "",
    "FORBIDDEN:",
    ...applicatorRules.forbiddenLines,
    ...bodyMaterialRules.forbiddenLines,
    "- No heavy/long/hard shadow, dark smear, doubled shadow, horizon line, tabletop edge, or obvious floor plane.",
    bodyMaterialRules.kind === "aluminum" || bodyMaterialRules.kind === "atomizer-metal"
      ? "- No fake bevels, extra facets, broad central CGI stripe, chrome-mirror body, softened/melted edges, or plastic-looking metal."
      : "- No fake bevels, extra facets, broad central CGI stripe, softened/melted edges, or plastic-looking glass.",
    bodyMaterialRules.kind === "aluminum" || bodyMaterialRules.kind === "atomizer-metal"
      ? "- No blank white metal body, no empty white central panel, no silhouette-only cutout, no line-art outline, no low-contrast metal that disappears into the background."
      : "- No blank white glass body, no empty white central panel, no silhouette-only cutout, no line-art outline, no low-contrast glass that disappears into the background.",
    "- No copied reference bottle shape, designer perfume logo, label typography, decorative cap, curtain scene, flower prop, wood surface, mirror tabletop, or lifestyle room setup.",
    "- No label, text, badge, watermark, brand name, UI pill, card frame, rounded border, props, hands, flowers, spray mist, pure-white cutout look, tabletop edge, vignette, or decorative canvas treatment.",
    "",
    inlineRefinementStabilizerBlock || null,
    inlineRefinementStabilizerBlock ? "" : null,
    cleanOperatorRefinement
      ? `OPERATOR RETOUCH REQUEST — apply only if it does not conflict with the ${operatorConflictScope}:\n${cleanOperatorRefinement}`
      : null,
    expectedColor ? `SKU COLOR LOCK:\n${expectedColor}` : null,
    qaMetadata ? `GENERATION QA METADATA:\n${qaMetadata}` : null,
    measurementLock ? `MEASUREMENT LOCK:\n${measurementLock}` : null,
    refNote || null,
    aspectRatio ? `OUTPUT: ${aspectRatio} aspect ratio, exact 2080 x 2288 PDP canvas when available.` : null,
  ].filter((section): section is string => Boolean(section)).join("\n\n");
}

function parseMeasurementMm(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw !== "string") return null;
  const match = raw.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function getBestBottlesMeasurementIssue(productContext?: Record<string, unknown> | null): string | null {
  const heightMm = parseMeasurementMm(productContext?.heightWithoutCap);
  const widthMm = parseMeasurementMm(productContext?.diameter);
  if (heightMm == null && widthMm == null) {
    return "Missing body height and face width/diameter.";
  }
  if (heightMm == null) return "Missing body height.";
  if (widthMm == null) return "Missing face width/diameter.";
  return null;
}

function getBestBottlesIdentityIssue(productContext?: Record<string, unknown> | null): string | null {
  if (!productContext || productContext.identityStatus !== "blocked") return null;
  const blockers = Array.isArray(productContext.identityBlockers)
    ? productContext.identityBlockers.filter((entry): entry is string =>
        typeof entry === "string" && entry.trim().length > 0
      )
    : [];
  return blockers.length > 0
    ? blockers.join(" ")
    : "Best Bottles product identity is blocked.";
}

const RETIRED_TRANSPARENT_BEST_BOTTLES_REFERENCE_TOKENS = [
  "best-bottles/clean-references/cylinder/",
  "clean-references/cylinder/",
  "reference-imports/background-removed",
  "reference-imports/bg-removed",
  "/paper-doll/",
  "paper-doll/",
  "paperdoll",
  "mask-control",
  "mask_control",
  "maskcontrol",
  "mask-ref",
  "mask_ref",
  "maskref",
  "studio-mask-control-references",
  "best-bottles/mask-imports/",
  "mask-imports",
  "transparent",
  "transparent-png",
  "background-removed",
  "background_removed",
  "backgroundremoved",
  "bg-removed",
  "bg_removed",
  "bgremoved",
  "remove-background",
  "removed-background",
  "removed_background",
  "background removed",
  "remove background",
];

const RETIRED_REFERENCE_METADATA_KEY_FRAGMENTS = [
  "url",
  "path",
  "name",
  "filename",
  "file",
  "storage",
  "session",
  "tag",
  "library",
  "source",
  "lineage",
  "role",
  "label",
  "metadata",
  "meta",
  "reference",
  "origin",
  "folder",
  "directory",
  "key",
];

const RETIRED_REFERENCE_METADATA_SKIP_KEYS = new Set([
  "prompt",
  "finalprompt",
  "final_prompt",
  "description",
  "body",
  "content",
  "text",
]);

function normalizeReferenceFingerprint(value: unknown): string {
  if (value == null) return "";
  let normalized = String(value).trim().toLowerCase().replace(/\\/g, "/");
  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    // Keep the raw fingerprint when decoding fails.
  }
  return normalized.replace(/\s+/g, " ");
}

function isRetiredTransparentBestBottlesReferenceValue(value: unknown): boolean {
  const normalized = normalizeReferenceFingerprint(value);
  if (!normalized) return false;
  return RETIRED_TRANSPARENT_BEST_BOTTLES_REFERENCE_TOKENS.some((token) =>
    normalized.includes(token),
  );
}

function normalizeMetadataKey(value: string): string {
  return normalizeReferenceFingerprint(value).replace(/[^a-z0-9]+/g, "");
}

function shouldInspectRetiredReferenceMetadataValue(key: string): boolean {
  const normalizedKey = normalizeMetadataKey(key);
  if (!normalizedKey || RETIRED_REFERENCE_METADATA_SKIP_KEYS.has(normalizedKey)) {
    return false;
  }
  if (isRetiredTransparentBestBottlesReferenceValue(key)) return true;
  return RETIRED_REFERENCE_METADATA_KEY_FRAGMENTS.some((fragment) =>
    normalizedKey.includes(fragment),
  );
}

function collectReferenceFingerprintValues(
  value: unknown,
  seen = new WeakSet<object>(),
  depth = 0,
): unknown[] {
  if (value == null || depth > 5) return [];
  if (typeof value !== "object") return [value];
  if (seen.has(value)) return [];
  seen.add(value);

  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectReferenceFingerprintValues(entry, seen, depth + 1));
  }

  const record = value as Record<string, unknown>;
  const values: unknown[] = [];
  for (const [key, entry] of Object.entries(record)) {
    if (!shouldInspectRetiredReferenceMetadataValue(key)) continue;
    if (
      isRetiredTransparentBestBottlesReferenceValue(key) &&
      entry !== false &&
      entry != null
    ) {
      values.push(key);
    }
    values.push(...collectReferenceFingerprintValues(entry, seen, depth + 1));
  }
  return values;
}

function getRetiredTransparentBestBottlesReferenceIssue(values: readonly unknown[]): string | null {
  const retired = values
    .flatMap((value) => collectReferenceFingerprintValues(value))
    .some(isRetiredTransparentBestBottlesReferenceValue);
  return retired
    ? "Cylinder master generation requires one flattened product-truth reference with the original/source background. Transparent/background-removed references are retired."
    : null;
}

function isCylinderBestBottlesProductContext(productContext?: Record<string, unknown> | null): boolean {
  const family = typeof productContext?.family === "string"
    ? productContext.family.trim().toLowerCase()
    : "";
  return family === "cylinder" || family === "tall cylinder";
}

/**
 * ------------------------------
 * REFERENCE IMAGE CATEGORIZATION
 * ------------------------------
 */

interface CategorizedReferences {
  product: Array<{ url: string; description?: string; label?: string }>;
  component: Array<{ url: string; description?: string; label?: string }>;
  background: Array<{ url: string; description?: string; label?: string }>;
  style: Array<{ url: string; description?: string; label?: string }>;
}

function categorizeReferences(
  references: Array<{ url: string; description?: string; label?: string }>
): CategorizedReferences {
  const categorized: CategorizedReferences = {
    product: [],
    component: [],
    background: [],
    style: [],
  };

  for (const ref of references || []) {
    const label = (ref.label || "").toLowerCase();
    if (label.includes("cap identity") || label.includes("component identity")) {
      categorized.component.push(ref);
    } else if (label.includes("product") || label.includes("subject")) {
      categorized.product.push(ref);
    } else if (label.includes("background") || label.includes("scene")) {
      categorized.background.push(ref);
    } else if (label.includes("style") || label.includes("lighting") || label.includes("reference")) {
      categorized.style.push(ref);
    } else {
      // Default: if no label, assume it's the product (backward compatibility)
      categorized.product.push(ref);
    }
  }

  return categorized;
}

/**
 * ------------------------------
 * BOTTLE TYPE DETECTION (CRITICAL)
 * ------------------------------
 * This function determines if a product is an OIL (dropper/roller) or SPRAY (atomizer)
 * This is CRITICAL for accurate product rendering - wrong bottle type breaks the workflow
 */

function detectBottleType(productData: any): {
  isOil: boolean;
  isSpray: boolean;
  confidence: 'high' | 'medium' | 'low';
} {
  if (!productData) {
    return { isOil: false, isSpray: false, confidence: 'low' };
  }

  // PRIORITY 1: Check explicit bottle_type field (user-set, highest priority)
  const explicitBottleType = productData.bottle_type?.toLowerCase();
  if (explicitBottleType === 'oil') {
    return { isOil: true, isSpray: false, confidence: 'high' };
  }
  if (explicitBottleType === 'spray') {
    return { isOil: false, isSpray: true, confidence: 'high' };
  }
  // If bottle_type is 'auto' or null, fall through to auto-detection

  // PRIORITY 2: Auto-detection from product fields (only if bottle_type is 'auto' or null)
  const productNameLower = (productData.name || '').toLowerCase();
  const formatLower = (productData.format || '').toLowerCase();
  const productTypeLower = (productData.product_type || '').toLowerCase();
  const categoryLower = (productData.category || '').toLowerCase();
  const descriptionLower = (productData.description || '').toLowerCase();
  
  // OIL INDICATORS (comprehensive list)
  const oilIndicators = [
    'oil',
    'attar',
    'concentrate',
    'roller',
    'dropper',
    'roll-on',
    'roll on',
    'perfume oil',
    'fragrance oil',
    'essential oil',
    'carrier oil',
    'diluted oil',
    'pure oil',
    'oil-based',
    'oil based',
    'viscous',
    'thick oil',
    'dense oil',
  ];
  
  // SPRAY INDICATORS (comprehensive list)
  const sprayIndicators = [
    'spray',
    'atomizer',
    'pump',
    'mist',
    'eau de',
    'cologne',
    'perfume spray',
    'spray bottle',
    'sprayer',
    'atomizing',
    'aerosol',
  ];
  
  // Check all fields for oil indicators
  const hasOilIndicator = oilIndicators.some(indicator => 
    productNameLower.includes(indicator) ||
    formatLower.includes(indicator) ||
    productTypeLower.includes(indicator) ||
    descriptionLower.includes(indicator)
  );
  
  // Check all fields for spray indicators
  const hasSprayIndicator = sprayIndicators.some(indicator =>
    productNameLower.includes(indicator) ||
    formatLower.includes(indicator) ||
    productTypeLower.includes(indicator) ||
    descriptionLower.includes(indicator)
  );
  
  // Special case: "perfume oil" or "fragrance oil" = OIL (not spray)
  const isPerfumeOil = 
    productNameLower.includes('perfume oil') ||
    productNameLower.includes('fragrance oil') ||
    formatLower.includes('perfume oil') ||
    formatLower.includes('fragrance oil');
  
  // Special case: category = 'skincare' usually means oil
  const isSkincare = categoryLower === 'skincare';
  
  // Decision logic: OIL takes precedence if detected
  let isOil = false;
  let isSpray = false;
  let confidence: 'high' | 'medium' | 'low' = 'low';
  
  if (isPerfumeOil || isSkincare || hasOilIndicator) {
    isOil = true;
    confidence = isPerfumeOil ? 'high' : hasOilIndicator ? 'medium' : 'low';
  } else if (hasSprayIndicator && !hasOilIndicator) {
    isSpray = true;
    confidence = 'medium';
  }
  
  return { isOil, isSpray, confidence };
}

/**
 * ------------------------------
 * VIRTUAL ART DIRECTOR PROMPT CONSTRUCTION
 * ------------------------------
 */

function buildDirectorModePrompt(
  userPrompt: string,
  categorizedRefs: CategorizedReferences,
  proModeControls: any,
  brandKnowledge: any,
  productData: any,
  aspectRatio?: string,
  visualMasterContext?: string,
  artDirectionControls?: {
    backgroundPresetId?: string;
    backgroundPrompt?: string;
    compositionPresetId?: string;
    compositionPrompt?: string;
  }
): string {
  let prompt = "";

  // === SECTION 0: CRITICAL BOTTLE TYPE SPECIFICATION (HIGHEST PRIORITY - MUST BE FIRST) ===
  // This MUST come before ANY other instructions, including reference images
  // Reference images might show wrong bottle type - this overrides them
  if (productData) {
    const bottleType = detectBottleType(productData);
    
    if (bottleType.isOil) {
      prompt += "╔══════════════════════════════════════════════════════════════════╗\n";
      prompt += "║  ⚠️ CRITICAL BOTTLE SPECIFICATION (MANDATORY - NO EXCEPTIONS)   ║\n";
      prompt += "║  THIS OVERRIDES ALL REFERENCE IMAGES AND OTHER INSTRUCTIONS      ║\n";
      prompt += "╚══════════════════════════════════════════════════════════════════╝\n\n";
      prompt += "PRODUCT TYPE: OIL-BASED FRAGRANCE (NON-SPRAY)\n";
      prompt += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
      prompt += "✅ REQUIRED CLOSURE TYPES (ONLY THESE):\n";
      prompt += "  • Glass dropper with pipette\n";
      prompt += "  • Roller ball applicator\n";
      prompt += "  • Screw cap (if dropper/roller is separate)\n";
      prompt += "  • Glass wand (dipstick applicator)\n\n";
      prompt += "❌ ABSOLUTELY FORBIDDEN (NEVER INCLUDE - EVEN IF IN REFERENCE IMAGES):\n";
      prompt += "  • Perfume sprayer / atomizer / pump mechanism\n";
      prompt += "  • Crimped metal spray neck\n";
      prompt += "  • Spray nozzle / misting device\n";
      prompt += "  • Dip tube / hose / straw (the tube inside spray bottles)\n";
      prompt += "  • Any form of spray dispenser\n";
      prompt += "  • Aerosol mechanism\n";
      prompt += "  • ANY visible tube, hose, or pipe extending into the liquid\n\n";
      prompt += "VISUAL CHARACTERISTICS:\n";
      prompt += "  • The liquid is viscous oil (thicker, more dense)\n";
      prompt += "  • Bottle designed for direct application (not spraying)\n";
      prompt += "  • Closure is for controlled dispensing, not atomization\n";
      prompt += "  • NO internal tubes, hoses, or dip sticks visible inside the bottle\n\n";
      prompt += "⚠️ CRITICAL: If you render a spray mechanism, dip tube, hose, or ANY tube extending into the liquid, the image is INCORRECT and unusable.\n";
      prompt += "⚠️ CRITICAL: Even if reference images show a spray mechanism, you MUST render an oil bottle with dropper/roller instead.\n";
      prompt += "This is a fundamental product accuracy requirement. There are NO exceptions.\n\n";
    } else if (bottleType.isSpray) {
      prompt += "╔══════════════════════════════════════════════════════════════════╗\n";
      prompt += "║  ⚠️ CRITICAL BOTTLE SPECIFICATION (MANDATORY - NO EXCEPTIONS)   ║\n";
      prompt += "║  THIS OVERRIDES ALL REFERENCE IMAGES AND OTHER INSTRUCTIONS      ║\n";
      prompt += "╚══════════════════════════════════════════════════════════════════╝\n\n";
      prompt += "PRODUCT TYPE: SPRAY PERFUME (ALCOHOL-BASED)\n";
      prompt += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
      prompt += "✅ REQUIRED CLOSURE TYPE:\n";
      prompt += "  • Spray pump mechanism with atomizer\n";
      prompt += "  • Visible crimped metal neck\n";
      prompt += "  • Spray nozzle for misting\n";
      prompt += "  • Dip tube / hose extending into the liquid (for spray mechanism)\n\n";
      prompt += "❌ ABSOLUTELY FORBIDDEN:\n";
      prompt += "  • Dropper / pipette\n";
      prompt += "  • Roller ball applicator\n";
      prompt += "  • Glass wand / dipstick\n\n";
      prompt += "VISUAL CHARACTERISTICS:\n";
      prompt += "  • The liquid is alcohol-based (thinner, more fluid)\n";
      prompt += "  • Bottle designed for atomization and misting\n";
      prompt += "  • Closure includes spray mechanism with dip tube\n\n";
    }
  }

  // === SECTION 1: REFERENCE IMAGE INSTRUCTIONS ===
  prompt += "=== REFERENCE IMAGE DIRECTIVES ===\n\n";

  if (categorizedRefs.product.length > 0) {
    const isMultiProduct = categorizedRefs.product.length > 1;
    
    if (isMultiProduct) {
      // Multi-product compositing mode
      prompt += `🎨 MULTI-PRODUCT COMPOSITE (${categorizedRefs.product.length} products):\n\n`;
      prompt += "╔══════════════════════════════════════════════════════════════════╗\n";
      prompt += "║  ⚠️ CRITICAL: USE THE EXACT PRODUCTS FROM REFERENCE IMAGES       ║\n";
      prompt += "║  DO NOT CREATE NEW BOTTLES OR PRODUCTS - USE WHAT IS PROVIDED    ║\n";
      prompt += "╚══════════════════════════════════════════════════════════════════╝\n\n";
      prompt += "The reference images provided show the EXACT products you must use.\n";
      prompt += "DO NOT generate new products, bottles, or containers.\n";
      prompt += "COPY the exact products from the reference images into the scene.\n\n";
      prompt += "COMPOSITING REQUIREMENTS:\n";
      prompt += "- Place the EXACT products from reference images into the scene\n";
      prompt += "- Arrange them artistically (not in a grid)\n";
      prompt += "- Create visual harmony (consistent lighting, shadows, reflections)\n";
      prompt += "- Use varying heights, angles, and positions for visual interest\n";
      prompt += "- Products may overlap slightly or be grouped naturally\n";
      prompt += "- Maintain accurate proportions between all products\n";
      prompt += "- Every product must be clearly visible and identifiable\n\n";
      prompt += "PRODUCT ACCURACY (MANDATORY):\n";
      prompt += "- ⚠️ PRESERVE the EXACT shape from reference images\n";
      prompt += "- ⚠️ PRESERVE the EXACT colors from reference images\n";
      prompt += "- ⚠️ PRESERVE the EXACT design and branding from reference images\n";
      prompt += "- ⚠️ PRESERVE all labels, text, and decorative elements\n";
      prompt += "- DO NOT modify, redesign, or reimagine the products\n";
      prompt += "- The products in output MUST match the reference images exactly\n\n";
      
      categorizedRefs.product.forEach((ref, idx) => {
        prompt += `📦 Product ${idx + 1}: ${ref.label || "Product"}\n`;
        if (ref.description) {
          prompt += `   Description: ${ref.description}\n`;
        }
      });
      prompt += "\n";
    } else {
      // Single product mode (original behavior)
      prompt += `PRODUCT REFERENCE (${categorizedRefs.product.length} image):\n\n`;
      prompt += "⚠️ CRITICAL: Use the EXACT product from the reference image.\n";
      prompt += "DO NOT create a new product - COPY the exact product shown.\n\n";
      prompt += "MANDATORY PRESERVATION:\n";
      prompt += "- EXACT product shape, proportions, and design from reference\n";
      prompt += "- EXACT product colors (match precisely)\n";
      prompt += "- EXACT product texture and material finish\n";
      prompt += "- EXACT branding, labels, and decorative elements\n";
      prompt += "- The product in output MUST be the same product from reference\n";
      if (productData) {
        const bottleType = detectBottleType(productData);
        if (bottleType.isOil) {
          prompt += "\n⚠️ IMPORTANT: If the reference image shows a spray mechanism, IGNORE IT.\n";
          prompt += "You MUST render an oil bottle with dropper/roller instead (as specified in Section 0).\n";
          prompt += "The bottle type specification in Section 0 takes absolute priority over reference images.\n";
        } else if (bottleType.isSpray) {
          prompt += "\n⚠️ IMPORTANT: If the reference image shows a dropper/roller, IGNORE IT.\n";
          prompt += "You MUST render a spray bottle with atomizer instead (as specified in Section 0).\n";
          prompt += "The bottle type specification in Section 0 takes absolute priority over reference images.\n";
        }
      }
      prompt += "\n";
      
      categorizedRefs.product.forEach((ref, idx) => {
        if (ref.description) {
          prompt += `Product Ref ${idx + 1} Note: ${ref.description}\n`;
        }
      });
      prompt += "\n";
    }
  }

  if (categorizedRefs.background.length > 0) {
    prompt += `BACKGROUND REFERENCE (${categorizedRefs.background.length} image${categorizedRefs.background.length > 1 ? "s" : ""}):\n`;
    prompt += "Use this/these as the ENVIRONMENTAL CONTEXT:\n";
    prompt += "- Replicate the scene, setting, or backdrop\n";
    prompt += "- Match the mood and atmosphere\n";
    prompt += "- Preserve spatial relationships and depth\n\n";
    
    categorizedRefs.background.forEach((ref, idx) => {
      if (ref.description) {
        prompt += `Background Ref ${idx + 1} Note: ${ref.description}\n`;
      }
    });
    prompt += "\n";
  }

  if (categorizedRefs.style.length > 0) {
    prompt += `STYLE REFERENCE (${categorizedRefs.style.length} image${categorizedRefs.style.length > 1 ? "s" : ""}):\n`;
    prompt += "Extract and apply these PHOTOGRAPHIC ELEMENTS:\n";
    prompt += "- Lighting style (direction, quality, color temperature)\n";
    prompt += "- Composition and framing\n";
    prompt += "- Color grading and post-processing aesthetic\n";
    prompt += "- Camera angle and perspective\n";
    prompt += "- Depth of field and focus technique\n\n";
    
    categorizedRefs.style.forEach((ref, idx) => {
      if (ref.description) {
        prompt += `Style Ref ${idx + 1} Note: ${ref.description}\n`;
      }
    });
    prompt += "\n";
  }

  // === SECTION 2: USER'S CREATIVE INTENT ===
  prompt += "=== CREATIVE DIRECTION ===\n";
  prompt += `${userPrompt}\n\n`;

  if (artDirectionControls?.backgroundPrompt || artDirectionControls?.compositionPrompt) {
    prompt += "=== DARK ROOM ART DIRECTION CONTROLS ===\n";

    if (artDirectionControls.backgroundPrompt) {
      prompt += `BACKGROUND STYLE${artDirectionControls.backgroundPresetId ? ` (${artDirectionControls.backgroundPresetId})` : ""}: ${artDirectionControls.backgroundPrompt}\n`;
      prompt += "Treat this as a deliberate background/surface directive that should materially shape the scene.\n";
    }

    if (artDirectionControls.compositionPrompt) {
      prompt += `ARRANGEMENT${artDirectionControls.compositionPresetId ? ` (${artDirectionControls.compositionPresetId})` : ""}: ${artDirectionControls.compositionPrompt}\n`;
      prompt += "Treat this as the required product placement, grouping, and framing instruction.\n";
    }

    prompt += "\n";
  }

  // === SECTION 3: VISUAL MASTER TRAINING ===
  if (visualMasterContext) {
    prompt += "=== VISUAL MASTER TRAINING ===\n";
    prompt += visualMasterContext;
    prompt += "\n\n";
  }

  // === SECTION 4: PROFESSIONAL PHOTOGRAPHY SPECIFICATIONS ===
  prompt += "=== PHOTOGRAPHIC SPECIFICATIONS ===\n";
  prompt += "You are a Virtual Art Director with expertise in high-end commercial photography.\n";
  prompt += "Apply professional photography ontology concepts:\n\n";

  // Apply Photography Ontology if Pro Mode is active
  if (proModeControls && Object.keys(proModeControls).length > 0) {
    // Use the ontology mapper to translate Pro Mode controls into professional terminology
    const ontologySpecs = enhancePromptWithOntology("", proModeControls);
    prompt += ontologySpecs + "\n\n";
  } else {
    // Default specifications when Pro Mode is not active
    // Add variety to prevent repetitive images
    const lightingVariations = [
      { setup: "Butterfly (Paramount)", quality: "Soft/Diffused", contrast: "3:1" },
      { setup: "Rembrandt", quality: "Soft with subtle shadow", contrast: "4:1" },
      { setup: "Loop", quality: "Soft directional", contrast: "3.5:1" },
      { setup: "Split", quality: "Dramatic but controlled", contrast: "5:1" },
      { setup: "Broad", quality: "Even and flattering", contrast: "2.5:1" },
    ];
    
    // Randomly select a lighting variation (using timestamp for pseudo-randomness)
    const lightingIndex = Date.now() % lightingVariations.length;
    const selectedLighting = lightingVariations[lightingIndex];
    
    if (categorizedRefs.style.length > 0) {
      prompt += "LIGHTING: Match the lighting style from the style reference(s)\n";
    } else {
      prompt += `LIGHTING SETUP: ${selectedLighting.setup} - Commercial standard\n`;
      prompt += `LIGHT QUALITY: ${selectedLighting.quality} (flattering, commercial look)\n`;
      prompt += `CONTRAST RATIO: ${selectedLighting.contrast} (balanced, professional)\n`;
    }
    
    // Add composition variety
    if (artDirectionControls?.compositionPrompt) {
      prompt += `COMPOSITION: ${artDirectionControls.compositionPrompt}\n`;
      prompt += "Honor this chosen arrangement over the default composition rotation.\n";
    } else {
      const compositionStyles = [
        "Rule of Thirds (classic, balanced)",
        "Centered composition (symmetrical, bold)",
        "Leading lines (dynamic, engaging)",
        "Negative space (minimalist, elegant)",
        "Diagonal composition (energetic, modern)",
      ];
      const compositionIndex = (Date.now() + 1) % compositionStyles.length;
      prompt += `COMPOSITION: ${compositionStyles[compositionIndex]}\n`;
    }
    
    prompt += "LENS CHARACTER: Spherical (clean, modern commercial look)\n";
  }

  // Technical defaults for high-end output
  prompt += "\nTECHNICAL REQUIREMENTS:\n";
  prompt += "- 8K resolution, sharp focus\n";
  prompt += "- Professional color grading\n";
  prompt += "- Realistic shadows and reflections\n";
  prompt += "- Accurate material physics (glass refraction IOR 1.5, metal specular highlights, fabric diffuse reflection)\n";
  prompt += "- No distortion, artifacts, or watermarks\n\n";

  // === SECTION 5: BRAND CONTEXT ===
  if (brandKnowledge?.visualStandards) {
    const vs = brandKnowledge.visualStandards;
    prompt += "=== BRAND VISUAL STANDARDS (MANDATORY) ===\n";
    
    // GOLDEN RULE: Most important - the overarching visual philosophy
    if (vs.golden_rule) {
      prompt += `\n✨ GOLDEN RULE (HIGHEST PRIORITY): ${vs.golden_rule}\n`;
      prompt += `This is the PRIMARY directive. All other specifications must align with this philosophy.\n\n`;
    }
    
    if (vs.color_palette?.length > 0) {
      prompt += `COLOR PALETTE (MANDATORY): ${vs.color_palette.slice(0, 5).map((c: any) => `${c.name} (${c.hex})`).join(", ")}\n`;
      prompt += `Use these exact colors. Do not deviate from this palette.\n`;
    }
    if (vs.lighting_mandates) {
      prompt += `LIGHTING MANDATE (MANDATORY): ${vs.lighting_mandates}\n`;
      prompt += `Override default lighting specifications with this mandate.\n`;
    }
    if (vs.approved_props?.length > 0) {
      prompt += `APPROVED PROPS: ${vs.approved_props.slice(0, 10).join(", ")}\n`;
      prompt += `Only use props from this approved list.\n`;
    }
    if (vs.forbidden_elements?.length > 0) {
      prompt += `FORBIDDEN ELEMENTS (NEVER INCLUDE): ${vs.forbidden_elements.join(", ")}\n`;
      prompt += `These elements are explicitly prohibited. Do not include them under any circumstances.\n`;
    }
    
    // Add bottle type to forbidden elements if it's an oil product
    if (productData) {
      const bottleType = detectBottleType(productData);
      if (bottleType.isOil && vs.forbidden_elements) {
        // Ensure spray mechanisms are in forbidden list
        const forbiddenList = Array.isArray(vs.forbidden_elements) ? vs.forbidden_elements : [];
        if (!forbiddenList.some((el: string) => el.toLowerCase().includes('spray') || el.toLowerCase().includes('atomizer'))) {
          prompt += `FORBIDDEN ELEMENTS (ADDITIONAL): Perfume sprayer, atomizer, pump, spray nozzle, misting device\n`;
        }
      }
    }
    
    // Include raw document context if available (for AI to understand full context)
    if (vs.raw_document) {
      prompt += `\nADDITIONAL CONTEXT: Refer to the full visual standards document for complete brand guidelines.\n`;
    }
    
    prompt += "\n";
  }

  // === SECTION 6: PRODUCT-SPECIFIC CONTEXT ===
  if (productData) {
    prompt += "=== PRODUCT VISUAL DNA ===\n";
    // This will be enhanced by formatVisualContext, but we add a header
    prompt += "Apply product-specific visual characteristics from the product data.\n\n";
  }

  // === SECTION 7: ASPECT RATIO ===
  if (aspectRatio) {
    prompt += `=== OUTPUT SPECIFICATIONS ===\n`;
    prompt += `ASPECT RATIO: ${aspectRatio}\n`;
    prompt += `Compose the image to work perfectly at this ratio.\n\n`;
  }

  // === SECTION 8: NEGATIVE PROMPT (What to Avoid) ===
  prompt += "=== AVOID ===\n";
  prompt += "- Blurry or out-of-focus elements\n";
  prompt += "- Distorted text or logos\n";
  prompt += "- Unrealistic proportions\n";
  prompt += "- Watermarks or signatures\n";
  prompt += "- Low quality or pixelation\n";
  prompt += "- Frames, borders, or decorative edges around the image\n";
  prompt += "- White borders, beige frames, or any background frame elements\n";
  prompt += "- The image should fill the entire canvas edge-to-edge with no visible frame\n";
  
  // Add bottle-type-specific negative prompts (reinforce Section 0)
  if (productData) {
    const bottleType = detectBottleType(productData);
    if (bottleType.isOil) {
      prompt += "- ⚠️ CRITICAL: Perfume sprayers, atomizers, pumps, spray nozzles, misting devices, or ANY spray mechanism\n";
      prompt += "- ⚠️ CRITICAL: Crimped metal spray necks or aerosol mechanisms\n";
      prompt += "- ⚠️ CRITICAL: Dip tubes, hoses, straws, or ANY tube extending into the liquid (these are ONLY for spray bottles)\n";
      prompt += "- ⚠️ CRITICAL: Any visible internal tube, pipe, or hose inside the bottle\n";
    } else if (bottleType.isSpray) {
      prompt += "- ⚠️ CRITICAL: Droppers, pipettes, roller balls, glass wands, or ANY non-spray applicator\n";
    }
  }

  return prompt;
}

function buildEssentialModePrompt(
  userPrompt: string,
  productRef: { url: string; description?: string } | null,
  brandContext: any,
  productData?: any
): string {
  let prompt = "";

  // === CRITICAL BOTTLE TYPE SPECIFICATION (MUST BE FIRST) ===
  if (productData) {
    const bottleType = detectBottleType(productData);
    
    if (bottleType.isOil) {
      prompt += "╔══════════════════════════════════════════════════════════════════╗\n";
      prompt += "║     ⚠️ CRITICAL: OIL BOTTLE - NO SPRAY MECHANISM ALLOWED         ║\n";
      prompt += "╚══════════════════════════════════════════════════════════════════╝\n\n";
      prompt += "This is an OIL-BASED FRAGRANCE. REQUIRED: Dropper or roller ball ONLY.\n";
      prompt += "FORBIDDEN: Perfume sprayer, atomizer, pump, spray nozzle, dip tube, hose, or ANY spray mechanism.\n";
      prompt += "FORBIDDEN: ANY visible tube, hose, or pipe extending into the liquid (these are ONLY for spray bottles).\n";
      prompt += "If you render a spray mechanism, dip tube, or any internal tube, the image is INCORRECT.\n\n";
    } else if (bottleType.isSpray) {
      prompt += "╔══════════════════════════════════════════════════════════════════╗\n";
      prompt += "║     ⚠️ CRITICAL: SPRAY PERFUME - ATOMIZER REQUIRED               ║\n";
      prompt += "╚══════════════════════════════════════════════════════════════════╝\n\n";
      prompt += "This is a SPRAY PERFUME. REQUIRED: Spray pump with atomizer.\n";
      prompt += "FORBIDDEN: Dropper, roller ball, or any non-spray applicator.\n\n";
    }
  }

  prompt += userPrompt;

  if (productRef) {
    prompt += "\n\nUse the uploaded product image as the exact subject. Place it in the scene described above.";
  }

  if (brandContext?.colors?.length > 0) {
    prompt += ` Incorporate ${brandContext.colors.join(" and ")} color tones.`;
  }

  if (brandContext?.styleKeywords?.length > 0) {
    prompt += ` Apply ${brandContext.styleKeywords.join(", ")} aesthetic.`;
  }

  return prompt;
}

function buildChainPrompt(originalPrompt: string, refinement: string, depth: number) {
  const base = originalPrompt.replace(
    /\b(with|featuring|showing|adjust:|refinement:)\b.*/gi,
    ""
  ).trim();

  const r = refinement.toLowerCase();

  if (r.match(/\b(darker|lighter|brighter|cooler|warmer)\b/)) {
    return `${originalPrompt}. Adjust: ${refinement}`;
  }
  if (r.match(/\b(add|include|with)\b/)) {
    return `${originalPrompt}. ${refinement}`;
  }
  if (r.match(/\b(remove|without|exclude)\b/)) {
    return `${base}. ${refinement}`;
  }

  return `${originalPrompt}. Refinement: ${refinement}`;
}

/**
 * ------------------------------
 * MAIN EDGE FUNCTION
 * ------------------------------
 */

function extractMissingColumn(message: string) {
  const patterns = [
    /column generated_images\.([a-zA-Z0-9_]+)/i,
    /"generated_images"\."([a-zA-Z0-9_]+)"/i,
    /'([a-zA-Z0-9_]+)' column of 'generated_images'/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

async function insertGeneratedImageRecord(
  supabase: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
) {
  const attemptPayload = { ...payload };
  const maxAttempts = Object.keys(payload).length + 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data, error } = await supabase
      .from("generated_images")
      .insert(attemptPayload)
      .select()
      .single();

    if (!error) {
      return data;
    }

    const column = extractMissingColumn(error.message ?? "");
    if (column && column in attemptPayload) {
      console.warn(
        `[generate-madison-image] Column '${column}' missing in generated_images. Retrying without it.`,
      );

      delete attemptPayload[column];
      continue;
    }

    throw error;
  }

  throw new Error(
    "Failed to insert generated_images record after removing missing columns.",
  );
}

const handleGenerateMadisonImage = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Attempt-ledger handle, declared outside the try so the catch can mark the
  // attempt failed. Populated at provider dispatch; ledger writes never throw.
  const attemptLedgerRef: {
    client: Parameters<typeof completeGenerationAttempt>[0] | null;
    tracker: GenerationAttemptTracker | null;
  } = { client: null, tracker: null };

  try {
    /**
     * 1. Parse incoming request
     */
    const body = await req.json();

    const {
      prompt,
      organizationId,
      userId,
      goalType,
      aspectRatio,
      outputFormat = "png",
      selectedTemplate,
      userRefinements,
      referenceImages,
      brandContext,
      imageConstraints,

      parentImageId,
      isRefinement,
      refinementInstruction,
      parentPrompt,

      proModeControls,
      allowBestBottlesProviderOverride = false,

      sessionId,

      product_id,

      // Provider selection (new)
      provider = "auto", // "auto" | "gemini" | "freepik" | "openai"
      freepikModel, // "mystic" | "flux-dev" | "flux-pro-v1-1"
      freepikResolution, // "1k" | "2k" | "4k"
      
      // Frontend-friendly aliases (Pro Settings)
      aiProvider, // "openai-image-2" | "auto" | "gemini" | "freepik-*"
      resolution, // "standard" | "high" | "4k"
      visualSquad, // "THE_MINIMALISTS" | "THE_STORYTELLERS" | "THE_DISRUPTORS"
      backgroundPresetId,
      backgroundPrompt,
      compositionPresetId,
      compositionPrompt,

      // Consistency Mode (bulk variation generation) — OPTIONAL.
      // When fixedSeed is provided, the edge function uses it instead of a
      // random seed, guaranteeing identical random initialization across
      // every variation in a set. consistencySetId groups related outputs
      // in the Library. See migration 20260422000000_consistency_set_columns.
      fixedSeed, // number | undefined — identical seed across a variation set
      consistencySetId, // UUID | undefined — groups variations in the Library
      // variationPrompt: the RICH prompt fragment appended to the AI
      // instructions (e.g. "BOTTLE BODY: hand-swirled artisan glass …").
      variationPrompt,
      // variationLabel: the SHORT human label stored in the DB and shown
      // in the Library grid (e.g. "Swirl · Polished Gold").
      variationLabel,
      // Legacy alias — kept for backward compatibility with any older
      // client that still passes variationDescriptor instead of the
      // separated prompt/label fields. Interpreted as "use this for both".
      variationDescriptor,
      setPosition, // number | undefined — 0-indexed order within the set

      // Best Bottles Grid Pipeline context — present only when the run was
      // launched from the Pipeline page. Drives library_tags and the
      // human-readable storage filename below so the client's team can
      // locate outputs by family/capacity/thread instead of UUIDs.
      pipelineContext,
      // Per-call library_tags (e.g. applicator/colour for Consistency
      // Mode variations) that the client computes because the axis
      // identifiers aren't part of pipelineContext. Merged into
      // library_tags alongside the group-level pipelineMeta tags below.
      extraLibraryTags,
      productContext,
      precompiledPromptRecord,
    } = body;
    let requestedOutputCanvas = parseRequestedOutputCanvas(imageConstraints);
    let generationAspectRatio = requestedOutputCanvas
      ? aspectRatioForCanvas(requestedOutputCanvas)
      : aspectRatio;
    const openAIOutputFormat = normalizeOpenAIOutputFormat(outputFormat);

    // Resolve the two separate roles from whatever fields the client sent.
    const effectiveVariationPrompt: string | undefined =
      typeof variationPrompt === "string" && variationPrompt.trim()
        ? variationPrompt.trim()
        : typeof variationDescriptor === "string" && variationDescriptor.trim()
          ? variationDescriptor.trim()
          : undefined;
    const effectiveVariationLabel: string | undefined =
      typeof variationLabel === "string" && variationLabel.trim()
        ? variationLabel.trim()
        : typeof variationDescriptor === "string" && variationDescriptor.trim()
          ? variationDescriptor.trim()
          : undefined;
    const callerExtraTagsEarly = Array.isArray(extraLibraryTags)
      ? (extraLibraryTags as unknown[]).filter(
          (tag): tag is string => typeof tag === "string" && tag.trim().length > 0,
        )
      : [];
    const isBestBottlesStudioMasterRequest =
      callerExtraTagsEarly.includes("brand:best-bottles") &&
      callerExtraTagsEarly.includes("studio-master") &&
      Array.isArray(referenceImages) &&
      referenceImages.length > 0;
    const precompiledPromptResolution = resolveBestBottlesPrecompiledPrompt(
      precompiledPromptRecord,
      { isBestBottlesStudioMasterRequest },
    );
    if (precompiledPromptResolution.error) {
      return new Response(
        JSON.stringify({ error: precompiledPromptResolution.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    // ─── Best Bottles Pipeline meta ───────────────────────────────────
    // When this run was launched from the Grid Pipeline, compute a
    // canonical set of library_tags and a human-readable storage path
    // so the client's team can locate outputs by family/capacity/thread
    // in the Library instead of UUID hunting. For non-pipeline runs this
    // stays null and the rest of the pipeline behaves exactly as before.
    const slugify = (v: unknown): string => {
      if (v == null) return "";
      return String(v)
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
    };
    const pipelineMeta: {
      libraryTags: string[];
      storagePathPrefix: string;
      variationSlug: string;
    } | null = (() => {
      const ctx = pipelineContext as
        | {
            source?: string;
            family?: string;
            capacityMl?: number | null;
            threadSize?: string | null;
            shapeKey?: string;
            pipelineGroupIds?: string[];
          }
        | undefined;
      if (!ctx || ctx.source !== "best-bottles-pipeline") return null;
      const familySlug = slugify(ctx.family) || "unknown-family";
      const capSlug =
        typeof ctx.capacityMl === "number" && Number.isFinite(ctx.capacityMl)
          ? `${ctx.capacityMl}ml`
          : null;
      const threadSlug = ctx.threadSize ? slugify(ctx.threadSize) : null;
      const shapeSlug = [familySlug, capSlug, threadSlug]
        .filter(Boolean)
        .join("-");
      const variationSlug =
        slugify(effectiveVariationLabel) ||
        (typeof setPosition === "number" ? `pos-${setPosition}` : "variation");

      // Tag vocabulary mirrors the Pipeline tracker's filter dimensions so
      // the Library can be filtered the same way the tracker is:
      //   - Bare slugs ("best-bottles", "pipeline", "cylinder", "cylinder-5ml-13-415")
      //     kept for back-compat with anything already querying them.
      //   - Structured key:value tags ("brand:best-bottles", "family:cylinder",
      //     "capacity:5ml", "thread:13-415", "shape:cylinder-5ml-13-415")
      //     for precise filtering — avoids "cylinder" the family colliding
      //     with "cylinder" some other free-text use.
      //   - "pipeline-group:<uuid>" tags per tracker row this run covers,
      //     so we can join an image back to the exact SKUs it serves.
      const structuredTags: string[] = [
        "brand:best-bottles",
        // Axis-1 lineage (two-axis model): every pipeline-launched generation is
        // born from the new clean references, so it is stamped clean here. This
        // is what fills the Image Library "Clean / new" filter over time. Mirror
        // of BEST_BOTTLES_LINEAGE_TAG_CLEAN in src/lib/bestBottlesImageCoverage.ts
        // (literal here because Deno edge functions can't import src/lib).
        "reference-lineage:clean",
        `family:${familySlug}`,
      ];
      if (capSlug) structuredTags.push(`capacity:${capSlug}`);
      if (threadSlug) structuredTags.push(`thread:${threadSlug}`);
      if (shapeSlug) structuredTags.push(`shape:${shapeSlug}`);

      const pipelineRowTags = Array.isArray(ctx.pipelineGroupIds)
        ? ctx.pipelineGroupIds
            .filter((id): id is string => typeof id === "string" && id.length > 0)
            .map((id) => `pipeline-group:${id}`)
        : [];

      const libraryTags = Array.from(
        new Set(
          [
            "best-bottles",
            "pipeline",
            familySlug,
            shapeSlug,
            ...structuredTags,
            ...pipelineRowTags,
          ].filter((t) => t && t.length > 0),
        ),
      );
      return {
        libraryTags,
        storagePathPrefix: `pipeline/${familySlug}/${shapeSlug}`,
        variationSlug,
      };
    })();

    // Map frontend-friendly names to backend values
    // aiProvider maps to: provider + freepikModel + geminiModel
    // resolution maps to: freepikResolution
    let effectiveProvider = provider;
    let effectiveFreepikModel = freepikModel;
    let effectiveFreepikResolution = freepikResolution;
    // Default OpenAI model when user picks the "OpenAI" group from the UI.
    // As of 2026-05, GPT Image 2 supports Image API generations/edits and
    // high-fidelity image inputs. The OPENAI_IMAGE_MODEL secret overrides
    // the default without a redeploy.
    const openaiModelSecret = Deno.env.get("OPENAI_IMAGE_MODEL")?.trim();
    let effectiveOpenAIModel: OpenAIImageModel =
      (openaiModelSecret || "gpt-image-2") as OpenAIImageModel;
    // Default Gemini fallback is the highest-quality image model we currently
    // expose in Madison: Gemini 3.1 Pro Image Preview. If that is unavailable,
    // the Gemini execution path steps down to 3.1 Flash, then 2.5 Flash.
    let effectiveGeminiModel: string = "models/gemini-3-pro-image-preview";

    if (aiProvider) {
      // Gemini image models (must support responseModalities: ["IMAGE"])
      if (
        aiProvider === "gemini-3.1-flash-image-preview" ||
        aiProvider === "gemini-3.1-flash" ||
        aiProvider === "nano-banana-2"
      ) {
        effectiveProvider = "gemini";
        effectiveGeminiModel = "models/gemini-3.1-flash-image-preview";
      } else if (
        aiProvider === "gemini-3-pro-image" ||
        aiProvider === "gemini-3" ||
        aiProvider === "gemini-3.1" ||
        aiProvider === "gemini-3.1-pro-image" ||
        aiProvider === "gemini-3-pro-image-preview" ||
        aiProvider === "nano-banana-pro"
      ) {
        effectiveProvider = "gemini";
        effectiveGeminiModel = "models/gemini-3-pro-image-preview";
      } else if (
        aiProvider === "gemini" ||
        aiProvider === "gemini-2.5-flash-image" ||
        aiProvider === "gemini-2.0-flash" ||
        aiProvider === "gemini-2.0-flash-exp"
      ) {
        effectiveProvider = "gemini";
        effectiveGeminiModel = "models/gemini-2.5-flash-image";
      }
      // Freepik models (actual available models from docs.freepik.com)
      else if (aiProvider === "freepik-seedream-4") {
        effectiveProvider = "freepik";
        effectiveFreepikModel = "seedream-4";
      } else if (aiProvider === "freepik-flux-pro") {
        effectiveProvider = "freepik";
        effectiveFreepikModel = "flux-pro-v1-1";
      } else if (aiProvider === "freepik-hyperflux") {
        effectiveProvider = "freepik";
        effectiveFreepikModel = "hyperflux";
      } else if (aiProvider === "freepik-flux") {
        effectiveProvider = "freepik";
        effectiveFreepikModel = "flux-dev";
      } else if (aiProvider === "freepik-seedream") {
        effectiveProvider = "freepik";
        effectiveFreepikModel = "seedream";
      } else if (aiProvider === "freepik-mystic") {
        effectiveProvider = "freepik";
        effectiveFreepikModel = "mystic";
      } else if (aiProvider === "freepik-classic") {
        effectiveProvider = "freepik";
        effectiveFreepikModel = "classic-fast";
      }
      // OpenAI image models (gpt-image-* family + dall-e-3).
      // GPT Image 2.5 (2026-09-08): Flare is the fast everyday tier, Sunburst
      // the editing-precision tier. Both accept the same size grid and add
      // the `xhigh` / `max` quality settings.
      else if (
        aiProvider === "openai-image-2.5-flare" ||
        aiProvider === "openai-gpt-image-2.5-flare" ||
        aiProvider === "gpt-image-2.5-flare"
      ) {
        effectiveProvider = "openai";
        effectiveOpenAIModel = "gpt-image-2.5-flare";
      } else if (
        aiProvider === "openai-image-2.5-sunburst" ||
        aiProvider === "openai-gpt-image-2.5-sunburst" ||
        aiProvider === "gpt-image-2.5-sunburst" ||
        aiProvider === "openai-image-2.5" ||
        aiProvider === "gpt-image-2.5"
      ) {
        effectiveProvider = "openai";
        effectiveOpenAIModel = "gpt-image-2.5-sunburst";
      } else if (
        aiProvider === "openai-image-2" ||
        aiProvider === "openai-gpt-image-2" ||
        aiProvider === "gpt-image-2"
      ) {
        effectiveProvider = "openai";
        effectiveOpenAIModel = "gpt-image-2";
      } else if (
        aiProvider === "openai-gpt-image-1.5" ||
        aiProvider === "gpt-image-1.5"
      ) {
        effectiveProvider = "openai";
        effectiveOpenAIModel = "gpt-image-1.5";
      } else if (aiProvider === "openai-gpt-image-1" || aiProvider === "gpt-image-1") {
        effectiveProvider = "openai";
        effectiveOpenAIModel = "gpt-image-1";
      } else if (aiProvider === "openai-gpt-image-mini" || aiProvider === "gpt-image-1-mini") {
        effectiveProvider = "openai";
        effectiveOpenAIModel = "gpt-image-1-mini";
      } else if (aiProvider === "openai-dalle-3" || aiProvider === "dall-e-3") {
        effectiveProvider = "openai";
        effectiveOpenAIModel = "dall-e-3";
      } else if (aiProvider === "auto") {
        effectiveProvider = "auto";
        effectiveGeminiModel = "models/gemini-3-pro-image-preview";
      }
    }
    
    if (resolution) {
      if (resolution === "standard") {
        effectiveFreepikResolution = "1k";
      } else if (resolution === "high") {
        effectiveFreepikResolution = "2k";
      } else if (resolution === "4k") {
        effectiveFreepikResolution = "4k";
      }
    }

    console.log("🎨 Incoming Request", {
      goalType,
      aspectRatio: generationAspectRatio,
      requestedCanvas: requestedOutputCanvas
        ? `${requestedOutputCanvas.width}×${requestedOutputCanvas.height}`
        : undefined,
      isRefinement,
      references: referenceImages?.length || 0,
      proMode: !!proModeControls,
      productId: product_id || "none",
    });

    /**
     * 2. Supabase Client
     */
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    /**
     * 3. Resolve organizationId if missing
     */
    let resolvedOrgId = organizationId;

    console.log("🔍 Organization Resolution:", {
      providedOrgId: organizationId,
      userId,
      parentImageId,
    });

    if (!resolvedOrgId && parentImageId) {
      const { data, error } = await supabase
        .from("generated_images")
        .select("organization_id")
        .eq("id", parentImageId)
        .single();

      if (error) {
        console.log("⚠️ Could not fetch from generated_images:", error.message);
      }
      if (data?.organization_id) {
        resolvedOrgId = data.organization_id;
        console.log("✅ Resolved org from parent image:", resolvedOrgId);
      }
    }

    if (!resolvedOrgId && userId) {
      const { data, error } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", userId)
        .limit(1)
        .single();

      if (error) {
        console.log("⚠️ Could not fetch from organization_members:", error.message, { userId });
      }
      if (data?.organization_id) {
        resolvedOrgId = data.organization_id;
        console.log("✅ Resolved org from membership:", resolvedOrgId);
      }
    }

    // Last resort: check if user created any organizations
    if (!resolvedOrgId && userId) {
      const { data, error } = await supabase
        .from("organizations")
        .select("id")
        .eq("created_by", userId)
        .limit(1)
        .single();

      if (error) {
        console.log("⚠️ Could not fetch from organizations:", error.message);
      }
      if (data?.id) {
        resolvedOrgId = data.id;
        console.log("✅ Resolved org from created_by:", resolvedOrgId);
        
        // Auto-create the missing membership
        await supabase.from("organization_members").upsert({
          organization_id: resolvedOrgId,
          user_id: userId,
        }, { onConflict: "organization_id,user_id" });
        console.log("✅ Auto-created missing organization membership");
      }
    }

    if (!resolvedOrgId) {
      console.error("❌ Could not resolve organization for user:", userId);
      return new Response(
        JSON.stringify({
          error: "Could not resolve organization. Please ensure you have completed onboarding.",
          debug: { userId, providedOrgId: organizationId, parentImageId }
        }),
        { status: 400, headers: corsHeaders }
      );
    }
    
    console.log("✅ Final resolved organization:", resolvedOrgId);

    /**
     * 4. Load Brand Knowledge
     */
    const { data: brandKnowledgeData } = await supabase
      .from("brand_knowledge")
      .select("knowledge_type, content")
      .eq("organization_id", resolvedOrgId)
      .eq("is_active", true);

    const brandKnowledge = {
      visualStandards:
        brandKnowledgeData?.find((k) => k.knowledge_type === "visual_standards")
          ?.content || null,
      vocabulary:
        brandKnowledgeData?.find((k) => k.knowledge_type === "vocabulary")
          ?.content || null,
      brandVoice:
        brandKnowledgeData?.find((k) => k.knowledge_type === "brand_voice")
          ?.content || null,
    };

    /**
     * 5. Load Product Data (all 49 fields)
     */
    let productData = null;
    if (product_id) {
      const { data } = await supabase
        .from("brand_products")
        .select("*")
        .eq("id", product_id)
        .eq("organization_id", resolvedOrgId)
        .maybeSingle();
      productData = data || null;
    }

    /**
     * 6. Categorize and prepare reference images
     */
    let actualReferenceImages = referenceImages || [];
    let parentImageTags: string[] = [];
    let parentImagePrompt: string | null = null;

    // Auto-include parent image for refinements
    if (isRefinement && parentImageId) {
      const { data: parent } = await supabase
        .from("generated_images")
        .select("image_url, final_prompt, chain_depth, library_tags")
        .eq("id", parentImageId)
        .single();

      if (parent) {
        parentImageTags = Array.isArray(parent.library_tags)
          ? parent.library_tags.filter((tag): tag is string => typeof tag === "string")
          : [];
        parentImagePrompt = typeof parent.final_prompt === "string" ? parent.final_prompt : null;
        actualReferenceImages = [
          {
            url: parent.image_url,
            label: "Previous iteration",
            description: "Auto-included parent reference",
          },
          ...actualReferenceImages,
        ];
      }
    }

    // Categorize references by type
    const categorizedRefs = categorizeReferences(actualReferenceImages);
    const bestBottlesTagSet = new Set([...callerExtraTagsEarly, ...parentImageTags]);
    const isBestBottlesReferenceLocked =
      bestBottlesTagSet.has("brand:best-bottles") &&
      bestBottlesTagSet.has("studio-master") &&
      categorizedRefs.product.length > 0;
    const normalizedProductContext = productContext && typeof productContext === "object"
      ? productContext as Record<string, unknown>
      : null;
    let bestBottlesRenderingContract: BestBottlesRenderingContract | null = null;
    let contractProductContext: Record<string, unknown> | null = normalizedProductContext;
    if (!isRefinement && isBestBottlesStudioMasterRequest) {
      try {
        bestBottlesRenderingContract = await resolveBestBottlesRenderingContract({
          isBestBottlesStudioMasterRequest,
          isRefinement,
          allowBestBottlesProviderOverride,
          productContext: normalizedProductContext,
          precompiledPromptRecord,
          categorizedRefs,
          extraLibraryTags: callerExtraTagsEarly,
          referenceAuditValues: [
            ...categorizedRefs.product.map((ref) => ({ url: ref.url, label: ref.label })),
            {
              sourceReference: normalizedProductContext?.sourceReference,
              referenceWorkflow: normalizedProductContext?.referenceWorkflow,
            },
          ],
        });
      } catch (contractError) {
        const message = contractError instanceof Error
          ? contractError.message
          : "Best Bottles rendering contract failed to resolve.";
        console.error("[generate-madison-image] Best Bottles rendering contract error", {
          message,
        });
        return new Response(
          JSON.stringify({ error: message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (bestBottlesRenderingContract?.status === "blocked") {
        return new Response(
          JSON.stringify({
            error: bestBottlesRenderingContract.error || "Best Bottles rendering contract blocked generation.",
            bestBottlesRenderingContract,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (bestBottlesRenderingContract) {
        contractProductContext = bestBottlesRenderingContract.productContext;
        requestedOutputCanvas = {
          width: BEST_BOTTLES_CONTRACT_CANVAS.width,
          height: BEST_BOTTLES_CONTRACT_CANVAS.height,
        };
        generationAspectRatio = aspectRatioForCanvas(requestedOutputCanvas);
      }

      if (
        bestBottlesRenderingContract?.renderingLane === "bottle_catalog" &&
        !precompiledPromptResolution.prompt
      ) {
        return new Response(
          JSON.stringify({
            error:
              "Best Bottles bottle catalog master generation requires a JSON precompiled prompt record.",
            bestBottlesRenderingContract,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }
    const isCylinderBestBottlesStudioMasterRequest =
      !isRefinement &&
      isBestBottlesStudioMasterRequest &&
      isCylinderBestBottlesProductContext(contractProductContext);

    if (isCylinderBestBottlesStudioMasterRequest) {
      const totalReferences =
        categorizedRefs.product.length +
        categorizedRefs.component.length +
        categorizedRefs.background.length +
        categorizedRefs.style.length;
      const expectedCapReferenceSku = typeof contractProductContext?.capIdentityReferenceSku === "string"
        ? contractProductContext.capIdentityReferenceSku.trim().toUpperCase()
        : "";
      const hasValidCapIdentityReference = categorizedRefs.component.length === 0 || (
        categorizedRefs.component.length === 1 &&
        /^CMP-ROC-(?:BLK|PNK|SLV)-(?:13415|17415)-DOT$/.test(expectedCapReferenceSku) &&
        decodeURIComponent(categorizedRefs.component[0].url).toUpperCase().includes(expectedCapReferenceSku)
      );
      const hasValidCylinderReferenceSet =
        categorizedRefs.product.length === 1 &&
        categorizedRefs.component.length <= 1 &&
        hasValidCapIdentityReference &&
        categorizedRefs.background.length === 0 &&
        categorizedRefs.style.length <= 1 &&
        totalReferences >= 1 &&
        totalReferences <= 3;
      if (!hasValidCylinderReferenceSet) {
        return new Response(
          JSON.stringify({
            error:
              "Cylinder master generation accepts exactly one flattened product-truth reference, optionally one style-only reference, and at most one exact dotted-cap identity reference whose URL matches capIdentityReferenceSku. Background, mask/control, paper-doll, arbitrary component, and additional product references are blocked.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const maskReference = typeof contractProductContext?.maskReference === "string"
        ? contractProductContext.maskReference.trim()
        : "";
      if (maskReference) {
        return new Response(
          JSON.stringify({
            error:
              "Cylinder master generation no longer accepts a mask/control reference. Use one flattened product-truth reference only.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const retiredReferenceIssue = getRetiredTransparentBestBottlesReferenceIssue([
        ...categorizedRefs.product.map((ref) => ({
          url: ref.url,
          label: ref.label,
        })),
        {
          sourceReference: contractProductContext?.sourceReference,
          referenceWorkflow: contractProductContext?.referenceWorkflow,
        },
      ]);
      if (retiredReferenceIssue) {
        return new Response(
          JSON.stringify({ error: retiredReferenceIssue }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    if (!isRefinement && isBestBottlesStudioMasterRequest) {
      const measurementIssue = getBestBottlesMeasurementIssue(
        contractProductContext,
      );
      if (measurementIssue) {
        console.warn(
          "[generate-madison-image] Best Bottles measurement metadata incomplete; continuing with reference lock.",
          {
            measurementIssue,
            sku: contractProductContext?.sku,
          },
        );
      }
      const identityIssue = getBestBottlesIdentityIssue(contractProductContext);
      if (identityIssue) {
        return new Response(
          JSON.stringify({
            error: `Best Bottles product identity is unresolved: ${identityIssue}`,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    if (
      bestBottlesTagSet.has("brand:best-bottles") &&
      bestBottlesTagSet.has("studio-master") &&
      categorizedRefs.product.length === 0
    ) {
      return new Response(
        JSON.stringify({
          error: "Best Bottles master generation requires an uploaded product reference image.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Determine mode: "Essential" (simple) vs "Director" (pro)
    const isDirectorMode = 
      proModeControls && Object.keys(proModeControls).length > 0 ||
      categorizedRefs.style.length > 0 ||
      categorizedRefs.background.length > 0 ||
      categorizedRefs.product.length > 1;

    /**
     * 7. Visual Master style directives — ONLY when the client sends a real squad.
     *
     * We intentionally do not auto-route from goalType/prompt here: heuristic routing
     * surprised users (e.g. "shadow" matched a naive `includes("ad")` → DISRUPTORS).
     * Pick Minimalist / Storyteller / Disruptor in Pro settings (Dark Room) to apply.
     */
    let visualMasterContext: string | undefined;

    const SQUADS: VisualSquad[] = [
      "THE_MINIMALISTS",
      "THE_STORYTELLERS",
      "THE_DISRUPTORS",
    ];
    const resolvedVisualSquad: VisualSquad | undefined =
      typeof visualSquad === "string" &&
      visualSquad !== "auto" &&
      visualSquad.trim() !== "" &&
      (SQUADS as string[]).includes(visualSquad)
        ? (visualSquad as VisualSquad)
        : undefined;

    if (resolvedVisualSquad) {
      visualMasterContext = getVisualStyleDirective(resolvedVisualSquad);
      console.log(`🎨 Visual Squad (explicit): ${resolvedVisualSquad}`, {
        directiveLength: visualMasterContext?.length || 0,
      });
    } else {
      console.log(
        `🎨 Visual Squad: none — no style directive injected (set Pro → Visual Style in Dark Room if you want one)`,
      );
    }

    /**
     * 8. Build enhanced prompt based on mode
     */
    let enhancedPrompt: string;

    if (!isRefinement && isBestBottlesStudioMasterRequest && precompiledPromptResolution.prompt) {
      enhancedPrompt = precompiledPromptResolution.prompt;
      console.log("[generate-madison-image] Using precompiled Best Bottles prompt", {
        sku: precompiledPromptResolution.sku,
        promptVersion: precompiledPromptResolution.promptVersion,
        shadowOwner: precompiledPromptResolution.shadowOwner,
        qaCount: precompiledPromptResolution.qaChecklist.length,
      });
    } else if (isBestBottlesReferenceLocked) {
      // Best Bottles PDP masters and their Image Editor refinements are
      // retouch passes over real references. Inline editor refinements keep
      // the parent prompt as a bounded stabilizer block while the operator
      // request remains a short delta, so the model edits instead of recreating.
      enhancedPrompt = buildReferenceLockedBestBottlesPrompt(
        categorizedRefs,
        generationAspectRatio,
        contractProductContext,
        isRefinement ? refinementInstruction || prompt : undefined,
        isRefinement
          ? buildInlineRefinementStabilizerBlock(parentPrompt || parentImagePrompt || prompt)
          : null,
      );
    } else if (isRefinement && refinementInstruction) {
      // Refinements use chain logic
      enhancedPrompt = buildChainPrompt(parentPrompt || prompt, refinementInstruction, 0);
    } else if (isBestBottlesStudioMasterRequest) {
      // Best Bottles PDP masters are fidelity-enhancement passes over real
      // PSD/camera references. Keep the product locked and make the model
      // polish/stage the reference instead of re-art-directing it.
      enhancedPrompt = buildReferenceLockedBestBottlesPrompt(
        categorizedRefs,
        generationAspectRatio,
        contractProductContext,
      );
    } else if (isDirectorMode) {
      // DIRECTOR MODE: Full "Virtual Art Director" treatment
      enhancedPrompt = buildDirectorModePrompt(
        prompt,
        categorizedRefs,
        proModeControls,
        brandKnowledge,
        productData,
        generationAspectRatio,
        visualMasterContext,
        {
          backgroundPresetId,
          backgroundPrompt,
          compositionPresetId,
          compositionPrompt,
        }
      );

      // Add product visual DNA if available
      if (productData) {
        const visualDNA = formatVisualContext(productData);
        enhancedPrompt += `\n\n${visualDNA}`;
      }
    } else {
      // ESSENTIAL MODE: Simple, fast workflow
      const productRef = categorizedRefs.product[0] || null;
      enhancedPrompt = buildEssentialModePrompt(prompt, productRef, brandContext, productData);

      // Add basic brand context
      if (brandKnowledge.visualStandards) {
        const vs = brandKnowledge.visualStandards;
        if (vs.color_palette?.length > 0) {
          enhancedPrompt += `\n\nBrand Colors: ${vs.color_palette
            .slice(0, 3)
            .map((c: any) => c.name)
            .join(", ")}`;
        }
      }

      // Aspect ratio is now applied by the provider (Gemini imageConfig /
       // Freepik aspect_ratio) — no need to stuff it into the prompt text.
    }

    // Consistency Mode: append the rich variation prompt as the final line
    // of the prompt. Placing it last gives the model the strongest "this is
    // the specific thing that changes" signal while all earlier framing —
    // scene, lighting, composition, reference image — stays identical
    // across the entire variation set.
    if (effectiveVariationPrompt) {
      enhancedPrompt += `\n\nVARIATION DETAILS: ${effectiveVariationPrompt}`;
    }

    // Apply image constraints (rewrite rules, prohibited terms)
    if (imageConstraints?.rewriteRules) {
      for (const [from, to] of Object.entries(imageConstraints.rewriteRules)) {
        enhancedPrompt = enhancedPrompt.replace(new RegExp(from, "gi"), String(to || ""));
      }
    }

    if (imageConstraints?.prohibitedTerms) {
      for (const term of imageConstraints.prohibitedTerms) {
        enhancedPrompt = enhancedPrompt.replace(
          new RegExp(`\\b${term}\\b`, "gi"),
          ""
        );
      }
    }

    /**
     * -------------------------
     * 8. Convert reference images to base64 in ORDERED SEQUENCE
     * -------------------------
     * Order matters: Product → Background → Style
     * This helps Gemini understand the hierarchy
     * 
     * IMPORTANT: Handles both:
     * - Regular URLs (https://...) - fetched and converted
     * - Base64 Data URLs (data:image/...) - parsed directly (from frontend file uploads)
     */
    
    // Helper function to process a reference image URL (handles both URL types)
    const MAX_REFERENCE_IMAGE_BYTES = 5 * 1024 * 1024;
    const MAX_TOTAL_REFERENCE_IMAGE_BYTES = 12 * 1024 * 1024;
    let totalReferenceImageBytes = 0;

    async function processReferenceImage(url: string): Promise<{ data: string; mimeType: string } | null> {
      if (!url) return null;
      
      // Check if it's a base64 data URL (from frontend file upload)
      if (url.startsWith('data:')) {
        // Parse data URL: data:image/png;base64,xxxxx
        const matches = url.match(/^data:([^;]+);base64,(.+)$/);
        if (matches && matches[1] && matches[2]) {
          const byteSize = Math.ceil((matches[2].length * 3) / 4);
          if (byteSize > MAX_REFERENCE_IMAGE_BYTES) {
            throw new Error(
              `Reference image is too large for edge generation (${Math.round(byteSize / 1024 / 1024)}MB). Use a smaller PNG/JPG under 5MB.`,
            );
          }
          if (totalReferenceImageBytes + byteSize > MAX_TOTAL_REFERENCE_IMAGE_BYTES) {
            throw new Error(
              "Combined reference images are too large for edge generation. Remove one reference or use smaller source images.",
            );
          }
          totalReferenceImageBytes += byteSize;
          console.log(`✅ Parsed base64 data URL (${matches[1]})`, { byteSize, totalReferenceImageBytes });
          return {
            mimeType: matches[1],
            data: matches[2],
          };
        } else {
          console.warn(`⚠️ Invalid data URL format: ${url.substring(0, 50)}...`);
          return null;
        }
      }
      
      // Otherwise, fetch the URL
      try {
        const response = await fetch(url);
        if (!response.ok) {
          console.warn(`⚠️ Failed to fetch reference: ${url.substring(0, 50)}... (${response.status})`);
          return null;
        }
        const contentLength = Number(response.headers.get("content-length") || "0");
        if (contentLength > MAX_REFERENCE_IMAGE_BYTES) {
          throw new Error(
            `Reference image is too large for edge generation (${Math.round(contentLength / 1024 / 1024)}MB). Use a smaller PNG/JPG under 5MB.`,
          );
        }
        if (contentLength > 0 && totalReferenceImageBytes + contentLength > MAX_TOTAL_REFERENCE_IMAGE_BYTES) {
          throw new Error(
            "Combined reference images are too large for edge generation. Remove one reference or use smaller source images.",
          );
        }
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength > MAX_REFERENCE_IMAGE_BYTES) {
          throw new Error(
            `Reference image is too large for edge generation (${Math.round(buffer.byteLength / 1024 / 1024)}MB). Use a smaller PNG/JPG under 5MB.`,
          );
        }
        if (totalReferenceImageBytes + buffer.byteLength > MAX_TOTAL_REFERENCE_IMAGE_BYTES) {
          throw new Error(
            "Combined reference images are too large for edge generation. Remove one reference or use smaller source images.",
          );
        }
        totalReferenceImageBytes += buffer.byteLength;
        const base64 = encode(new Uint8Array(buffer));
        console.log(`✅ Fetched and encoded URL reference`, {
          byteSize: buffer.byteLength,
          totalReferenceImageBytes,
        });
        return {
          data: base64,
          mimeType: response.headers.get("content-type") || "image/png",
        };
      } catch (err) {
        console.error(`❌ Error processing reference ${url.substring(0, 50)}...:`, err);
        throw err;
      }
    }
    
    const referenceImagesPayload = [];
    let processedProductReferenceCount = 0;

    // Order: Product references first (the "star")
    for (const ref of categorizedRefs.product) {
      const processed = await processReferenceImage(ref.url);
      if (processed) {
        referenceImagesPayload.push(processed);
        processedProductReferenceCount += 1;
      }
    }

    // Exact component identity reference follows Image 1 product truth and
    // precedes style direction. It is admitted only by the fail-closed guard.
    for (const ref of categorizedRefs.component) {
      const processed = await processReferenceImage(ref.url);
      if (processed) referenceImagesPayload.push(processed);
    }

    if (
      bestBottlesTagSet.has("brand:best-bottles") &&
      bestBottlesTagSet.has("studio-master") &&
      categorizedRefs.product.length > 0 &&
      processedProductReferenceCount === 0
    ) {
      return new Response(
        JSON.stringify({
          error:
            "Best Bottles master generation could not load the product reference image. Upload/import a public PNG, JPG, or WebP reference before generating.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Then: Background references (the "stage")
    for (const ref of categorizedRefs.background) {
      const processed = await processReferenceImage(ref.url);
      if (processed) {
        referenceImagesPayload.push(processed);
      }
    }

    // Finally: Style references (the "direction")
    for (const ref of categorizedRefs.style) {
      const processed = await processReferenceImage(ref.url);
      if (processed) {
        referenceImagesPayload.push(processed);
      }
    }

    console.log(`📸 Reference Images Prepared:`, {
      product: categorizedRefs.product.length,
      component: categorizedRefs.component.length,
      background: categorizedRefs.background.length,
      style: categorizedRefs.style.length,
      total: referenceImagesPayload.length,
      mode: isDirectorMode ? "Director" : "Essential",
    });

    /**
     * -------------------------
     * 9. Check Subscription Tier & Determine Provider
     * -------------------------
     * 
     * TIER ACCESS:
     * - Essentials ($49): Gemini only
     * - Studio ($149): Gemini + Freepik Flux Pro (limited)
     * - Signature ($349): Full Freepik (Mystic 4K, Video, etc.)
     * - Super Admins: Full access to all features for testing
     * 
     * FALLBACK: Freepik fails → Gemini
     */
    
    // Fetch organization's subscription tier
    let subscriptionTier = "essentials"; // Default to lowest tier
    let freepikAllowed = false;
    let freepik4KAllowed = false;
    let freepikVideoAllowed = false;
    let isSuperAdmin = false;
    
    // Check if user is a super admin (gets full access for testing)
    if (userId) {
      try {
        const { data: superAdminData } = await supabase
          .from("super_admins")
          .select("id")
          .eq("user_id", userId)
          .maybeSingle();
        
        if (superAdminData) {
          isSuperAdmin = true;
          freepikAllowed = true;
          freepik4KAllowed = true;
          freepikVideoAllowed = true;
          console.log("👑 Super Admin detected - Full Freepik access enabled");
        }
      } catch (saError) {
        console.warn("Could not check super admin status:", saError);
      }
    }
    
    // If not a super admin, check subscription tier
    if (!isSuperAdmin) {
      try {
        const { data: orgData } = await supabase
          .from("organizations")
          .select("subscription_tier, stripe_subscription_status")
          .eq("id", resolvedOrgId)
          .single();
        
        if (orgData) {
          subscriptionTier = (orgData.subscription_tier || "essentials").toLowerCase();
          const isActive = orgData.stripe_subscription_status === "active" || 
                          orgData.stripe_subscription_status === "trialing";
          
          // Determine Freepik access based on tier
          // Actual tiers: essentials ($49), studio ($149), signature ($349)
          if (isActive || subscriptionTier === "free_trial") {
            // Studio and Signature get basic Freepik access (Flux Pro)
            if (subscriptionTier === "studio" || subscriptionTier === "signature") {
              freepikAllowed = true;
            }
            // Only Signature gets 4K and Video (premium Freepik features)
            if (subscriptionTier === "signature") {
              freepik4KAllowed = true;
              freepikVideoAllowed = true;
            }
          }
        }
      } catch (tierError) {
        console.warn("Could not fetch subscription tier, defaulting to Gemini:", tierError);
      }
    }
    
    const effectiveMadisonResolution = resolveBestBottlesProductionResolution({
      isBestBottlesReferenceLocked,
      resolution,
    });
    if (effectiveMadisonResolution !== resolution) {
      console.log("Best Bottles reference-locked master -> forcing OpenAI high quality.", {
        requestedResolution: resolution ?? "(default standard)",
        effectiveResolution: effectiveMadisonResolution,
      });
    }
    if (effectiveMadisonResolution === "standard") {
      effectiveFreepikResolution = "1k";
    } else if (effectiveMadisonResolution === "high") {
      effectiveFreepikResolution = "2k";
    } else if (effectiveMadisonResolution === "4k") {
      effectiveFreepikResolution = "4k";
    }

    console.log(`📊 Subscription Tier Check:`, {
      tier: isSuperAdmin ? "super_admin" : subscriptionTier,
      isSuperAdmin,
      freepikAllowed,
      freepik4KAllowed,
      aiProviderFromClient: aiProvider ?? "(none)",
      requestedProvider: effectiveProvider,
      requestedModel: effectiveFreepikModel,
      requestedResolution: effectiveFreepikResolution,
      madisonResolution: effectiveMadisonResolution ?? "(default standard)",
    });

    const forceBestBottlesOpenAIProvider = bestBottlesRenderingContract
      ? bestBottlesRenderingContract.providerPolicy.provider === "openai"
      : shouldForceBestBottlesOpenAIProvider({
          isBestBottlesReferenceLocked,
          allowBestBottlesProviderOverride,
        });

    // NOTE: this lane stays pinned to gpt-image-2 on purpose. The Best Bottles
    // reference-locked contract (canvas, Bone background, ambient-contact
    // shadow, light contract) was validated against gpt-image-2 output; moving
    // it to GPT Image 2.5 is a contract change that needs its own re-validation
    // pass, not a silent model bump. See bestBottlesRenderingContract.ts.
    if (forceBestBottlesOpenAIProvider) {
      if (effectiveProvider !== "openai" || effectiveOpenAIModel !== "gpt-image-2") {
        console.log(
          "Best Bottles reference-locked master -> forcing OpenAI GPT Image 2; no Gemini/Freepik fallback on this path.",
          {
            requestedProvider: effectiveProvider,
            requestedModel: aiProvider ?? provider ?? "(none)",
          },
        );
      }
      effectiveProvider = "openai";
      effectiveOpenAIModel = "gpt-image-2";
    } else if (isBestBottlesReferenceLocked) {
      console.log("Best Bottles reference-locked provider override enabled for comparison run.", {
        requestedProvider: effectiveProvider,
        requestedModel: aiProvider ?? provider ?? "(none)",
        contractStatus: bestBottlesRenderingContract?.status ?? "(none)",
      });
    }

    if (effectiveProvider === "auto") {
      console.log(
        `ℹ️ Provider Auto → prefer OpenAI GPT Image 2, then fall back to Gemini 3.1 Pro if OpenAI is unavailable or fails.`,
      );
    }

    // Seed selection. Default: random seed per call for variety. Consistency
    // Mode (bulk variation) overrides with a fixed seed shared by every
    // variation in the set — combined with the same reference image and
    // prompt base, this drives Gemini toward pixel-stable output.
    // Gemini API requires INT32 (0 – 2_147_483_647).
    const MAX_INT32 = 2147483647;
    const clampedFixedSeed = typeof fixedSeed === "number" && Number.isFinite(fixedSeed)
      ? Math.max(0, Math.min(MAX_INT32, Math.floor(fixedSeed)))
      : null;
    const randomSeed = clampedFixedSeed ?? Math.floor(Math.random() * MAX_INT32);
    if (clampedFixedSeed !== null) {
      console.log("🔒 Consistency Mode active — using fixed seed:", clampedFixedSeed, {
        consistencySetId: consistencySetId ?? "(none)",
        setPosition: setPosition ?? "(none)",
      });
    }

    // Determine which provider to use based on tier and request.
    // Best Bottles reference-locked masters are OpenAI GPT Image 2 only.
    // Other modes keep the broader Madison fallback behavior.
    let selectedProvider: "gemini" | "freepik" | "openai" = "gemini";
    let tierRestrictionApplied = false;

    if (effectiveProvider === "openai") {
      // OpenAI GPT Image 2 is the Darkroom default and primary path.
      if (Deno.env.get("OPENAI_API_KEY")) {
        selectedProvider = "openai";
      } else if (isBestBottlesReferenceLocked) {
        return new Response(
          JSON.stringify({
            error: "Best Bottles reference-locked master generation requires OPENAI_API_KEY for GPT Image 2.",
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      } else {
        console.warn("⚠️ OpenAI requested but OPENAI_API_KEY not set — falling back to Gemini");
        tierRestrictionApplied = true;
      }
    } else if (effectiveProvider === "freepik" || effectiveFreepikModel) {
      // User explicitly requested Freepik
      if (freepikAllowed) {
        // Check if they're requesting 4K (requires higher tier)
        if (effectiveFreepikResolution === "4k" && !freepik4KAllowed) {
          console.log("⚠️ 4K requested but not allowed on this tier, downgrading to 2K");
          tierRestrictionApplied = true;
          selectedProvider = "freepik";
        } else {
          selectedProvider = "freepik";
        }
      } else {
        // Freepik not allowed on this tier - fall back to Gemini
        console.log("⚠️ Freepik requested but not available on Essentials tier, using Gemini");
        tierRestrictionApplied = true;
      }
    } else if (effectiveProvider === "auto") {
      if (Deno.env.get("OPENAI_API_KEY")) {
        selectedProvider = "openai";
      } else {
        console.warn("⚠️ Auto requested but OPENAI_API_KEY not set — defaulting to Gemini 3.1 Pro");
      }
    }
    // effectiveProvider === "gemini" → stays as gemini

    let imageUrl: string;
    let usedProvider: string = selectedProvider;
    let didFallback = false;
    let providerRevisedPrompt: string | null = null;

    // ── Attempt ledger (Paper-Doll Rig task 0): record the attempt BEFORE the
    // provider call so failures and timeouts are counted, not just successes.
    attemptLedgerRef.client = supabase;
    attemptLedgerRef.tracker = await beginGenerationAttempt(supabase, {
      organizationId: resolvedOrgId ?? null,
      userId: userId ?? null,
      sessionId: typeof sessionId === "string" ? sessionId : null,
      lane: isBestBottlesReferenceLocked ? "best-bottles-reference-locked" : "darkroom",
      provider: selectedProvider,
      model: selectedProvider === "openai"
        ? effectiveOpenAIModel
        : selectedProvider === "freepik"
          ? (effectiveFreepikModel || "mystic")
          : "gemini",
      endpoint: selectedProvider === "openai"
        ? (referenceImagesPayload.length > 0 ? "edits" : "generations")
        : null,
      requestSize: isBestBottlesReferenceLocked ? "2080x2288" : null,
      requestResolution: effectiveMadisonResolution ?? null,
      prompt: enhancedPrompt,
      referenceFingerprintSources: referenceImagesPayload.map((ref) => ref.data),
      referenceUrls: Array.isArray(actualReferenceImages)
        ? actualReferenceImages.filter((u): u is string => typeof u === "string")
        : undefined,
      graceSku: typeof (productContext as Record<string, unknown> | null | undefined)?.sku === "string"
        ? String((productContext as Record<string, unknown>).sku)
        : null,
      websiteSku: typeof (productContext as Record<string, unknown> | null | undefined)?.websiteSku === "string"
        ? String((productContext as Record<string, unknown>).websiteSku)
        : null,
      productGroupSlug: typeof (productContext as Record<string, unknown> | null | undefined)?.productGroupSlug === "string"
        ? String((productContext as Record<string, unknown>).productGroupSlug)
        : null,
      seed: randomSeed,
      codeCommit: Deno.env.get("MADISON_GIT_COMMIT") ?? null,
      requestParams: {
        aspectRatio: generationAspectRatio,
        outputFormat,
        isDirectorMode: Boolean(isDirectorMode),
      },
    });

    if (selectedProvider === "freepik") {
      /**
       * FREEPIK GENERATION PATH
       */
      // Ensure resolution is allowed
      const finalResolution = (effectiveFreepikResolution === "4k" && !freepik4KAllowed) 
        ? "2k" 
        : (effectiveFreepikResolution || "2k");
      
      console.log("🎨 Using Freepik for image generation...", {
        model: effectiveFreepikModel || "mystic",
        resolution: finalResolution,
        tierRestrictionApplied,
      });

      try {
        // Check if this model supports reference images
        const modelInfo = IMAGE_MODELS.find(m => m.id === effectiveFreepikModel);
        const supportsReferences = modelInfo?.supportsReferences ?? false;
        
        // Prepare reference images for models that support them (Seedream 4 4K, Seedream)
        const freepikReferenceImages = supportsReferences && categorizedRefs.product.length > 0
          ? categorizedRefs.product.map(ref => ({
              url: ref.url,
              weight: 0.8, // High weight for product accuracy
            }))
          : undefined;

        const freepikResult = await generateFreepikImage({
          prompt: enhancedPrompt,
          model: (effectiveFreepikModel as FreepikImageModel) || "mystic",
          resolution: finalResolution as FreepikResolution,
          aspectRatio: generationAspectRatio as any,
          seed: randomSeed,
          referenceImages: freepikReferenceImages,
        });

        // Re-upload Freepik image to Supabase Storage for a permanent URL.
        // Freepik CDN URLs expire, so we must persist the image ourselves.
        const freepikFetch = await fetch(freepikResult.imageUrl);
        if (!freepikFetch.ok) {
          throw new Error(`Failed to fetch Freepik image for re-upload: ${freepikFetch.status}`);
        }
        const freepikBuffer = await freepikFetch.arrayBuffer();
        let freepikUploadBytes = new Uint8Array(freepikBuffer);
        const freepikExactCanvas = requestedOutputCanvas ?? getExactCanvasForAspectRatio(generationAspectRatio);

        if (freepikExactCanvas) {
          const conformed = await conformGeneratedImage(
            encode(freepikBuffer),
            generationAspectRatio,
            freepikExactCanvas,
            isBestBottlesReferenceLocked ? BEST_BOTTLES_REFERENCE_LOCKED_BONE_CANVAS_RGBA : undefined,
          );
          freepikUploadBytes = new Uint8Array(decode(conformed.base64));

          console.log("🖼️ Freepik canvas conformance:", {
            requested: generationAspectRatio,
            exactCanvas: `${freepikExactCanvas.width}×${freepikExactCanvas.height}`,
            originalDimensions: `${conformed.originalWidth}×${conformed.originalHeight}`,
            finalDimensions: `${conformed.width}×${conformed.height}`,
            modified: conformed.wasModified,
          });
        }

        // Pipeline-aware storage path when launched from the Grid Pipeline;
        // UUID path (unchanged) for everything else.
        const freepikShortId = crypto.randomUUID().slice(0, 8);
        const freepikPosition =
          typeof setPosition === "number" && Number.isFinite(setPosition)
            ? Math.max(0, Math.floor(setPosition))
            : 0;
        const freepikFilename = pipelineMeta
          ? `${resolvedOrgId}/${pipelineMeta.storagePathPrefix}/${pipelineMeta.variationSlug}-pos${freepikPosition}-${freepikShortId}.png`
          : `${resolvedOrgId}/${Date.now()}-${crypto.randomUUID()}.png`;

        const { error: freepikUploadErr } = await supabase.storage
          .from("generated-images")
          .upload(freepikFilename, freepikUploadBytes, { contentType: "image/png" });

        if (freepikUploadErr) {
          console.error("Storage upload error for Freepik image", freepikUploadErr);
          throw freepikUploadErr;
        }

        const { data: freepikUrlData } = supabase.storage
          .from("generated-images")
          .getPublicUrl(freepikFilename);

        imageUrl = freepikUrlData.publicUrl;
        usedProvider = `freepik-${freepikResult.model}`;

        console.log(`✅ Freepik Image Generated & Uploaded to Storage:`, {
          taskId: freepikResult.taskId,
          model: freepikResult.model,
          usedReferences: !!freepikReferenceImages,
          storedUrl: imageUrl,
        });
      } catch (freepikError) {
        console.error("❌ Freepik generation failed, falling back to Gemini:", freepikError);
        // Fall back to Gemini
        selectedProvider = "gemini";
        didFallback = true;
      }
    }

    if (selectedProvider === "openai") {
      /**
       * OPENAI GENERATION PATH
       *
       * Uses OpenAI's Images API (gpt-image-* family). References, when
       * present, route to /images/edits so the model conditions on them;
       * otherwise we hit /images/generations. Output is always returned as
       * base64 so the upload path mirrors the Gemini branch exactly.
       *
       * Default model is gpt-image-2 (Image API). For reference-locked Best
       * Bottles retouches, OpenAI errors bubble instead of silently falling
       * back to a different model.
       */
      console.log("🎨 Using OpenAI for image generation...", {
        model: effectiveOpenAIModel,
        resolution: effectiveMadisonResolution,
        outputFormat: openAIOutputFormat,
        aspectRatio: generationAspectRatio,
        requestedCanvas: requestedOutputCanvas
          ? `${requestedOutputCanvas.width}×${requestedOutputCanvas.height}`
          : undefined,
        references: referenceImagesPayload.length,
      });

      try {
        const exactCanvas = requestedOutputCanvas ?? getExactCanvasForAspectRatio(generationAspectRatio);
        const requestedOpenAIExactSize = openAIExactSizeForCanvas(exactCanvas);
        const openaiResult = await generateOpenAIImage({
          prompt: enhancedPrompt,
          model: effectiveOpenAIModel,
          aspectRatio: generationAspectRatio,
          resolution: effectiveMadisonResolution,
          size: requestedOpenAIExactSize ??
            (isBestBottlesReferenceLocked ? "2080x2288" : undefined),
          outputFormat: openAIOutputFormat,
          referenceImages: referenceImagesPayload.length > 0
            ? referenceImagesPayload
            : undefined,
          user: userId ?? undefined,
        });

        let openaiImageBase64 = openaiResult.imageBase64;
        let openaiMimeType = openaiResult.mimeType;
        const shouldTrustOpenAIExactCanvas = Boolean(
          exactCanvas &&
            requestedOpenAIExactSize &&
            (effectiveOpenAIModel === "gpt-image-2" ||
              effectiveOpenAIModel === "gpt-image-2.5-flare" ||
              effectiveOpenAIModel === "gpt-image-2.5-sunburst"),
        );

        if (exactCanvas && (isBestBottlesReferenceLocked || shouldTrustOpenAIExactCanvas)) {
          // A 2080×2288 decode + contain + PNG re-encode can exhaust Supabase
          // Edge Function CPU/memory and return 546 before our catch block runs.
          // Keep the function as a coordinator on this path. For GPT Image 2,
          // we already requested the exact supported size, so another decode
          // and re-encode here is redundant and can kill interactive Darkroom
          // generations before our catch block can return a useful JSON error.
          console.log("🖼️ OpenAI canvas conformance skipped for exact-size run", {
            requested: generationAspectRatio,
            targetCanvas: `${exactCanvas.width}×${exactCanvas.height}`,
            exactSizeRequested: requestedOpenAIExactSize ?? "(none)",
            reason: shouldTrustOpenAIExactCanvas
              ? "exact GPT Image output size requested; avoid edge WORKER_LIMIT during ImageScript resize/re-encode"
              : "avoid edge WORKER_LIMIT during ImageScript resize/re-encode",
          });
        } else {
          const openaiImage = await conformGeneratedImage(
            openaiResult.imageBase64,
            generationAspectRatio,
            exactCanvas,
            isBestBottlesReferenceLocked ? BEST_BOTTLES_REFERENCE_LOCKED_BONE_CANVAS_RGBA : undefined,
          );
          openaiImageBase64 = openaiImage.base64;
          openaiMimeType = openaiImage.wasModified ? "image/png" : openaiResult.mimeType;

          console.log("🖼️ OpenAI canvas conformance:", {
            requested: generationAspectRatio,
            exactCanvas: exactCanvas ? `${exactCanvas.width}×${exactCanvas.height}` : "(aspect only)",
            originalDimensions: `${openaiImage.originalWidth}×${openaiImage.originalHeight}`,
            finalDimensions: `${openaiImage.width}×${openaiImage.height}`,
            modified: openaiImage.wasModified,
          });
        }

        // Write base64 bytes to Supabase Storage. Pipeline-aware filename
        // when launched from the Grid Pipeline; UUID path otherwise.
        const openaiShortId = crypto.randomUUID().slice(0, 8);
        const openaiPosition =
          typeof setPosition === "number" && Number.isFinite(setPosition)
            ? Math.max(0, Math.floor(setPosition))
            : 0;
        const ext = openaiMimeType === "image/jpeg" ? "jpg"
          : openaiMimeType === "image/webp" ? "webp"
          : "png";
        const openaiFilename = pipelineMeta
          ? `${resolvedOrgId}/${pipelineMeta.storagePathPrefix}/${pipelineMeta.variationSlug}-pos${openaiPosition}-${openaiShortId}.${ext}`
          : `${resolvedOrgId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

        const { error: openaiUploadErr } = await supabase.storage
          .from("generated-images")
          .upload(openaiFilename, decode(openaiImageBase64), {
            contentType: openaiMimeType,
          });

        if (openaiUploadErr) {
          console.error("Storage upload error for OpenAI image", openaiUploadErr);
          throw openaiUploadErr;
        }

        const { data: openaiUrlData } = supabase.storage
          .from("generated-images")
          .getPublicUrl(openaiFilename);

        imageUrl = openaiUrlData.publicUrl;
        usedProvider = `openai-${openaiResult.model}`;
        providerRevisedPrompt = openaiResult.revisedPrompt ?? null;

        console.log(`✅ OpenAI Image Generated & Uploaded to Storage:`, {
          model: openaiResult.model,
          endpoint: openaiResult.endpoint,
          revisedPrompt: openaiResult.revisedPrompt ? "(rewritten)" : "(as-sent)",
          storedUrl: imageUrl,
        });
      } catch (openaiError) {
        if (isBestBottlesReferenceLocked) {
          console.error("❌ OpenAI reference-locked Best Bottles generation failed:", openaiError);
          throw openaiError;
        }
        if (aiProvider && String(aiProvider).startsWith("openai")) {
          console.error("❌ Explicit OpenAI generation failed:", openaiError);
          throw openaiError;
        }
        console.error("❌ OpenAI generation failed, falling back to Gemini:", openaiError);
        selectedProvider = "gemini";
        didFallback = true;
      }
    }

    if (selectedProvider === "gemini") {
      /**
       * GEMINI GENERATION PATH (default)
       *
       * We try the requested model first. If that 404s (e.g. preview not
       * released to this API key), fall through to the stable
       * gemini-2.5-flash-image so the user never sees a dead-model error.
       *
       * Primary is gemini-3-pro-image-preview (verified live on our key
       * and honors aspect ratio natively). If Google renames the preview
       * model in the future, override via the GEMINI_IMAGE_MODEL secret
       * without a redeploy.
       */
      // Preference order: user's pick → next-best Gemini 3-class model →
      // stable 2.5. If the requested preview isn't yet released to this
      // API key, we quietly step down and still generate an image.
      const GEMINI_PRO_PRIMARY = "models/gemini-3-pro-image-preview";
      const GEMINI_FLASH_SECONDARY = "models/gemini-3.1-flash-image-preview";
      const GEMINI_STABLE_FALLBACK = "models/gemini-2.5-flash-image";
      const rawChain: string[] = [
        effectiveGeminiModel,
        GEMINI_PRO_PRIMARY,
        GEMINI_FLASH_SECONDARY,
        GEMINI_STABLE_FALLBACK,
      ];
      const seen = new Set<string>();
      const geminiModelPreference = rawChain.filter((m) => {
        if (seen.has(m)) return false;
        seen.add(m);
        return true;
      });

      // Map the user's Resolution setting to Gemini's native imageSize
      // parameter. Gemini 3 Pro / 3.1 Flash can produce 1K/2K/4K directly —
      // no Freepik detour needed for high-res.
      const geminiImageSize: "1K" | "2K" | "4K" =
        effectiveMadisonResolution === "4k" ? "4K" :
        effectiveMadisonResolution === "high" ? "2K" :
        "1K";

      console.log("🎨 Using Gemini for image generation...", {
        primaryModel: effectiveGeminiModel || "default",
        fallbackChain: geminiModelPreference,
        imageSize: geminiImageSize,
      });

      let geminiImage: any = null;
      let lastError: unknown = null;
      let modelUsed = effectiveGeminiModel;

      for (const candidateModel of geminiModelPreference) {
        try {
          geminiImage = await callGeminiImage({
            prompt: enhancedPrompt,
            aspectRatio: generationAspectRatio,
            imageSize: geminiImageSize,
            seed: randomSeed,
            model: candidateModel,
            referenceImages: referenceImagesPayload.length > 0
              ? referenceImagesPayload
              : undefined,
          });
          modelUsed = candidateModel;
          break;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          // Only fall through on "model not found / not supported" style
          // errors. Any other failure (auth, quota, network) should bubble.
          const isModelMissing = /\b404\b|not found|not supported|INVALID_ARGUMENT.*model/i.test(msg);
          if (!isModelMissing) throw err;
          console.warn(`⚠️ Gemini model ${candidateModel} unavailable, falling back:`, msg);
          lastError = err;
        }
      }

      if (!geminiImage) {
        throw lastError ?? new Error("All Gemini image models failed");
      }

      effectiveGeminiModel = modelUsed;

      const rawBase64Image = geminiImage?.data ?? geminiImage?.bytesBase64 ?? geminiImage?.base64;

      if (!rawBase64Image) {
        throw new Error("Gemini returned no image. Check prompt and reference images.");
      }

      // Image providers can bias toward square output even when we pass the
      // requested aspect ratio via native config. For Best Bottles catalog
      // product masters, conform all saved images to the canonical PDP canvas.
      const exactCanvas = requestedOutputCanvas ?? getExactCanvasForAspectRatio(generationAspectRatio);
      let base64Image = rawBase64Image;

      // Skip conformance for ALL Best Bottles reference-locked runs, not just
      // OpenAI-forced ones: Gemini comparison runs (provider override) hit the
      // same 2080×2288 ImageScript resize and died with WORKER_LIMIT / empty
      // responses (2026-07-20). The client-side rig re-canvases masters anyway.
      if (exactCanvas && isBestBottlesReferenceLocked) {
        console.log("🖼️ Gemini canvas conformance skipped for Best Bottles reference-locked run", {
          requested: generationAspectRatio,
          targetCanvas: `${exactCanvas.width}×${exactCanvas.height}`,
          reason: "avoid edge WORKER_LIMIT during ImageScript resize/re-encode",
        });
      } else {
        const conformed = await conformGeneratedImage(
          rawBase64Image,
          generationAspectRatio,
          exactCanvas,
          isBestBottlesReferenceLocked ? BEST_BOTTLES_REFERENCE_LOCKED_BONE_CANVAS_RGBA : undefined,
        );
        base64Image = conformed.base64;

        console.log("🖼️ Gemini aspect-ratio conformance:", {
          requested: generationAspectRatio,
          exactCanvas: exactCanvas ? `${exactCanvas.width}×${exactCanvas.height}` : "(aspect only)",
          originalDimensions: `${conformed.originalWidth}×${conformed.originalHeight}`,
          finalDimensions: `${conformed.width}×${conformed.height}`,
          cropped: conformed.wasModified,
        });
      }

      // Upload Gemini's base64 image to Supabase Storage. Pipeline-aware
      // path when launched from the Grid Pipeline; UUID path otherwise.
      const geminiShortId = crypto.randomUUID().slice(0, 8);
      const geminiPosition =
        typeof setPosition === "number" && Number.isFinite(setPosition)
          ? Math.max(0, Math.floor(setPosition))
          : 0;
      const filename = pipelineMeta
        ? `${resolvedOrgId}/${pipelineMeta.storagePathPrefix}/${pipelineMeta.variationSlug}-pos${geminiPosition}-${geminiShortId}.png`
        : `${resolvedOrgId}/${Date.now()}-${crypto.randomUUID()}.png`;

      const { error: uploadErr } = await supabase.storage
        .from("generated-images")
        .upload(filename, decode(base64Image), {
          contentType: "image/png",
        });

      if (uploadErr) {
        console.error("Storage upload error", uploadErr);
        throw uploadErr;
      }

      const { data: urlData } = supabase.storage
        .from("generated-images")
        .getPublicUrl(filename);

      imageUrl = urlData.publicUrl;
      usedProvider = didFallback ? "gemini (fallback)" : "gemini";

      console.log(`✅ Gemini Image Generated Successfully`, { didFallback });
    }

    console.log(`✅ Image Generation Complete`, {
      provider: usedProvider,
      subscriptionTier,
      didFallback,
      tierRestrictionApplied,
      mode: isDirectorMode ? "Director Mode" : "Essential Mode",
      promptLength: enhancedPrompt.length,
      referencesUsed: referenceImagesPayload.length,
    });

    /**
     * -------------------------
     * 10. Save DB record to generated_images
     * -------------------------
     */
    
    // library_category is constrained to: 'content', 'marketplace', or 'both'
    // Use 'content' as default for all generated images (they go to Image Library)
    // The goal_type field stores the detailed category (product, lifestyle, etc.)
    const libraryCategory = 'content';
    
    console.log(`[generate-madison-image] Library category: ${libraryCategory}, goal_type: ${goalType}`);
    
    const insertPayload: Record<string, unknown> = {
      organization_id: resolvedOrgId,
      user_id: userId,
      session_id: sessionId,
      goal_type: goalType,
      library_category: libraryCategory, // For Image Library filtering
      aspect_ratio: generationAspectRatio,
      output_format: outputFormat,
      final_prompt: enhancedPrompt,
      image_url: imageUrl,
      generation_provider: usedProvider,
      media_type: "image",
      description: isDirectorMode 
        ? `${usedProvider} generated image (Director Mode - Pro Photography)` 
        : `${usedProvider} generated image (Essential Mode)`,
    };

    if (selectedTemplate) insertPayload.selected_template = selectedTemplate;
    if (userRefinements) insertPayload.user_refinements = userRefinements;
    if (actualReferenceImages?.length) {
      insertPayload.reference_images = actualReferenceImages;
    }

    if (brandContext || brandKnowledge.visualStandards || bestBottlesRenderingContract) {
      insertPayload.brand_context_used = {
        ...brandContext,
        knowledgeUsed: {
          hasVisualStandards: !!brandKnowledge.visualStandards,
        },
        bestBottlesRenderingContract: bestBottlesRenderingContract ?? undefined,
      };
    }

    // Note: image_generator column doesn't exist in schema, removed
    insertPayload.saved_to_library = true;
    insertPayload.parent_image_id = isRefinement ? parentImageId : null;
    insertPayload.chain_depth = isRefinement ? 1 : 0;
    insertPayload.is_chain_origin = !isRefinement;
    insertPayload.refinement_instruction = isRefinement
      ? refinementInstruction
      : null;

    // Consistency Mode grouping — set when the caller is part of a bulk
    // variation set. Columns added in migration 20260422000000.
    if (typeof consistencySetId === "string" && consistencySetId) {
      insertPayload.consistency_set_id = consistencySetId;
    }
    if (effectiveVariationLabel) {
      insertPayload.variation_descriptor = effectiveVariationLabel;
    }
    if (typeof setPosition === "number" && Number.isFinite(setPosition)) {
      insertPayload.set_position = Math.max(0, Math.floor(setPosition));
    }

    // Auto-tag pipeline-originated images so the client's team can filter
    // the Library by brand/family/shape without coordinating on tag names.
    // Four sources get merged, de-duped, into library_tags:
    //   1. Anything already on insertPayload (future-proof — no callers today)
    //   2. Parent image tags for refinements — preserves SKU/publish metadata
    //      across edit chains so Library bulk-publish can still auto-resolve.
    //   3. pipelineMeta.libraryTags (brand/family/shape/pipeline-group refs —
    //      only present for pipeline-originated runs)
    //   4. extraLibraryTags from the request body (per-variation tags like
    //      applicator:fine-mist-metal, color:amber — emitted by Consistency
    //      Mode for every run, not just pipeline ones, so non-pipeline sets
    //      are still searchable by axis)
    const callerExtraTags = Array.isArray(extraLibraryTags)
      ? (extraLibraryTags as unknown[]).filter(
          (t): t is string => typeof t === "string" && t.length > 0,
        )
      : [];
    if (
      pipelineMeta ||
      parentImageTags.length > 0 ||
      callerExtraTags.length > 0 ||
      bestBottlesRenderingContract
    ) {
      const existing = Array.isArray(insertPayload.library_tags)
        ? (insertPayload.library_tags as string[])
        : [];
      insertPayload.library_tags = Array.from(
        new Set([
          ...existing,
          ...parentImageTags,
          ...(pipelineMeta ? pipelineMeta.libraryTags : []),
          ...(bestBottlesRenderingContract ? bestBottlesRenderingContract.libraryTags : []),
          ...callerExtraTags,
        ]),
      );
    }

    const savedImage = await insertGeneratedImageRecord(
      supabase,
      insertPayload,
    );

    /**
     * -------------------------
     * 11. NOTE: Images are saved to generated_images table ONLY
     * -------------------------
     * Previously, images were also saved to the prompts table, but this caused
     * them to appear in both Archives and Image Library. Now images only go to
     * generated_images table and the Image Library reads from there directly.
     * 
     * The prompts table is for TEXT prompts/recipes, not generated images.
     */
    console.log(`[generate-madison-image] ✅ Image saved to generated_images table: ${savedImage?.id}`);
    console.log(`[generate-madison-image] Image will appear in Image Library via generated_images table`);

    // ── Attempt ledger: mark succeeded with final provider (fallbacks change
    // it mid-request), output linkage, and provider-revised prompt if any.
    const savedImageIdForLedger = (savedImage as { id?: unknown } | null | undefined)?.id;
    await completeGenerationAttempt(supabase, attemptLedgerRef.tracker, {
      status: "succeeded",
      generatedImageId: typeof savedImageIdForLedger === "string" ? savedImageIdForLedger : null,
      outputUrl: imageUrl!,
      revisedPrompt: providerRevisedPrompt,
      finalProvider: didFallback ? usedProvider : null,
    });

    /**
     * -------------------------
     * 12. Return response
     * -------------------------
     */
    return new Response(
      JSON.stringify({
        imageUrl,
        savedImageId: savedImage?.id,
        finalPrompt: enhancedPrompt,
        usedProvider,
        promptMode: isBestBottlesReferenceLocked
          ? "best-bottles-reference-locked"
          : isDirectorMode
            ? "director"
            : "essential",
        description: `Generated via ${usedProvider}`,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    // Robustly extract a useful message from whatever was thrown. Upstream
    // code (provider SDKs, fetch, etc.) sometimes throws plain objects, not
    // Error instances — `String(plainObject)` is "[object Object]" which
    // produced a useless catch message. We now inspect every common shape.
    let errMsg = "Image generation failed.";
    let stack: string | undefined;
    let errorType = "unknown";

    if (error instanceof Error) {
      errorType = error.name || "Error";
      errMsg = error.message || errMsg;
      stack = error.stack;
    } else if (typeof error === "string") {
      errorType = "string";
      errMsg = error;
    } else if (error && typeof error === "object") {
      const obj = error as Record<string, unknown>;
      errorType = typeof obj.name === "string" ? obj.name : "object";
      if (typeof obj.message === "string" && obj.message.trim()) {
        errMsg = obj.message;
      } else if (typeof obj.error === "string" && obj.error.trim()) {
        errMsg = obj.error;
      } else if (
        obj.error && typeof obj.error === "object" &&
        typeof (obj.error as { message?: unknown }).message === "string"
      ) {
        errMsg = (obj.error as { message: string }).message;
      } else {
        try {
          errMsg = JSON.stringify(error).slice(0, 800);
        } catch {
          errMsg = "Image generation failed (non-serializable error).";
        }
      }
      if (typeof obj.stack === "string") stack = obj.stack;
    }

    // ── Attempt ledger: count the failure (this is the data full-regeneration
    // never had — failed attempts were previously invisible).
    if (attemptLedgerRef.client && attemptLedgerRef.tracker) {
      await completeGenerationAttempt(attemptLedgerRef.client, attemptLedgerRef.tracker, {
        status: "failed",
        errorMessage: errMsg,
      });
    }

    // Log the FULL raw error too so dashboard logs always have the original
    // shape regardless of what we send back to the client.
    console.error(
      "❌ generate-madison-image Error:",
      JSON.stringify({ errorType, errMsg, stack }, null, 2),
    );
    try {
      console.error("❌ raw thrown value:", error);
    } catch {
      console.error("❌ raw thrown value: <unloggable>");
    }

    return new Response(
      JSON.stringify({
        error: errMsg,
        errorType,
        details: stack,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
};

// gpt-image-2 at 2080×2288 quality=high routinely takes 120–155s, tripping the
// Supabase gateway's 150s IDLE_TIMEOUT. The heartbeat wrapper streams whitespace
// keepalives once a request outlives the defer window, then appends the real
// JSON body — supabase-js invoke() parses it unchanged (JSON.parse ignores
// leading whitespace). Fast paths (all validation 4xx) return verbatim with
// their real status codes. See _shared/streamingJsonResponse.ts.
serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  return withHeartbeatJsonResponse(
    () => handleGenerateMadisonImage(req),
    { ...corsHeaders, "Content-Type": "application/json" },
  );
});
