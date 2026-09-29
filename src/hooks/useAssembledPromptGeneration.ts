/**
 * Runs an assembled 4-layer prompt (SKU + preset + global + constraints)
 * through the existing `generate-madison-image` edge function, so the SKU
 * workflow shares the same generation + storage pipeline as Dark Room.
 *
 * Payload shape mirrors the DarkRoom caller at src/pages/DarkRoom.tsx:499
 * so we inherit its known-working defaults (`aiProvider`, `resolution`,
 * `sessionId`, `productContext`) instead of relying on the edge function's
 * optional-field handling.
 */

import { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOnboarding } from "@/hooks/useOnboarding";
import { useToast } from "@/hooks/use-toast";
import { DEFAULT_IMAGE_AI_PROVIDER } from "@/config/imageSettings";
import type { AssembledPrompt } from "@/lib/product-image/promptAssembler";
import { getBestBottlesReferenceUrlIssue } from "@/lib/bestBottlesReferenceValidation";
import { getRetiredTransparentBestBottlesReferenceIssue } from "@/lib/bestBottlesReferenceFilters";
import type { CylinderCanonicalGeometryContract } from "@/lib/bestBottlesCylinderRoleAuthority";
import { dataUrlToBlob } from "@/lib/product-image/colorCorrect";
import {
  measureReferencePrimaryAspectRatio,
  measureReferenceSidecarCapMetrics,
  normalizeBestBottlesRigBaseline,
  type RigBaselineNormalizeResult,
} from "@/lib/product-image/rigPostprocess";
import { getFamilyRigForProduct, isCylinderFamilyAlias } from "@/lib/product-image/familyRig";
import {
  getBestBottlesImageAssetRoleForPreset,
  recordBestBottlesRawImage,
  recordBestBottlesRigResult,
  requiresBestBottlesPipelineReconciliation,
  type RecordBestBottlesRawImageInput,
} from "@/lib/bestBottlesImageReconciliation";
import { shouldRunBestBottlesRigPostprocess } from "@/lib/product-image/bestBottlesRigPostprocessPolicy";
import {
  getExactOutputCanvasConstraints,
  resolveExactCanvasForAspectRatio,
} from "@/lib/product-image/exactOutputCanvas";
import type { PromptRecord } from "@/lib/bestBottlesPromptCompiler";
import {
  getBestBottlesShadowPolicyTags,
  resolveBestBottlesReconciliationPromptVersion,
  resolveBestBottlesShadowPolicy,
  type BestBottlesShadowOwner,
  type BestBottlesShadowPolicy,
} from "@/lib/bestBottlesShadowPolicy";
import { resolveBestBottlesShadowTopology } from "@/lib/bestBottlesShadowTopology";
import {
  applyResolvedBestBottlesVisualTargetPrompt,
  BEST_BOTTLES_VISUAL_TARGET_CANVAS_HEX,
  getBestBottlesProductReferenceDescription,
  getBestBottlesVisualTargetBindingIssue,
  resolveBestBottlesVisualTargetBinding,
  type BestBottlesVisualComponentTopology,
} from "@/config/bestBottlesVisualTarget";
import type { RigReviewEvidence } from "@/lib/product-image/rigReview";
import { resolveBestBottlesStyleReferenceUrl } from "@/lib/bestBottlesStyleReferenceRouting";
import {
  analyzeBestBottlesBackgroundImage,
  BEST_BOTTLES_BACKGROUND_QA_PASS_TAG,
  BEST_BOTTLES_CANVAS_HEX_TAG,
} from "@/lib/bestBottlesBackgroundQa";
import { addLibraryTag } from "@/lib/imageLibraryTags";
import {
  getApprovedBestBottlesScaleCalibration,
} from "@/lib/bestBottlesScaleCalibration";
import { buildBestBottlesScaleCalibrationKeys } from "@/lib/bestBottlesScaleCalibrationModel";
import type { RigScaleCalibration } from "@/lib/product-image/physicalScaleQa";


export interface AssembledGenerationResult {
  imageUrl: string;
  savedImageId: string | null;
  prompt: string;
  aspectRatio: string;
  canvas: { widthPx: number; heightPx: number };
  presetId: string;
  sessionId: string;
  rigReview: RigReviewEvidence | null;
  /**
   * The provider/model the server ACTUALLY executed (edge `usedProvider`),
   * which can differ from the dropdown selection — Best Bottles masters
   * force GPT Image 2 unless the comparison override is sent (2026-07-20:
   * Gemini selections silently ran GPT). Surfaced as a rig-review badge so
   * the operator always sees the truth.
   */
  usedProvider: string | null;
  /** Wall-clock generation time (invoke start → response), for the rig-review timer. */
  durationMs: number | null;
}

export interface AssembledGenerateOptions {
  /** Image provider/model id sent through to generate-madison-image. */
  aiProvider?: string;
  /** Optional geometry reference image (e.g. product.imageUrl from Convex). */
  referenceImageUrl?: string | null;
  /** Exact dotted-cap component truth, resolved fail-closed by thread and finish. */
  capIdentityReferenceImageUrl?: string | null;
  /** Optional style-only reference for realistic glass, specularity, and shadow behavior. */
  glassSpecularityReferenceImageUrl?: string | null;
  /**
   * Extra SKU metadata for the `productContext` field in the edge function
   * — drives per-product prompt tuning and visual-DNA enrichment.
   */
  productContext?: {
    name?: string;
    websiteSku?: string | null;
    eligibleGraceSkus?: string[];
    eligibleWebsiteSkus?: string[];
    itemDescription?: string | null;
    collection?: string;
    family?: string | null;
    category?: string;
    presetId?: string | null;
    capState?: string | null;
    mode?: string | null;
    componentTopology?: BestBottlesVisualComponentTopology;
    capOffReferenceId?: string | null;
    topologyReferenceId?: string | null;
    referenceRoleId?: string | null;
    bodyMaterial?: string | null;
    color?: string | null;
    scent_family?: string;
    sku?: string;
    capacityMl?: number | null;
    heightWithoutCap?: string | null;
    heightWithCap?: string | null;
    diameter?: string | null;
    neckThreadSize?: string | null;
    measurementSource?: string | null;
    measurementSourceUrl?: string | null;
    measurementSourceNote?: string | null;
    sourcePageUrl?: string | null;
    websiteTruthStatus?: string | null;
    websiteTruthIssues?: string[];
    capColor?: string | null;
    trimColor?: string | null;
    applicator?: string | null;
    tasselColor?: string | null;
    bulbColor?: string | null;
    hoseColor?: string | null;
    collarFinish?: string | null;
    ringPresent?: boolean | null;
    accessoryCode?: string | null;
    reducerFinish?: string | null;
    sourceReference?: string | null;
    referenceWorkflow?: string | null;
    maskReference?: string | null;
    maskQcStatus?: string | null;
    identityStatus?: "ready" | "blocked";
    identityBlockers?: string[];
    identityHash?: string;
    promptVersion?: string;
    rigVersion?: string;
    shadowOwner?: BestBottlesShadowOwner;
    shadowContract?: BestBottlesShadowPolicy["contract"];
    qaStatus?: "pending" | string;
    canvas?: "2080x2288" | string;
    canonicalGeometryContract?: CylinderCanonicalGeometryContract | null;
    capIdentityReferenceSku?: string | null;
  };
  /** JSON-driven Best Bottles prompt compiler output, used as the authoritative prompt for Studio masters. */
  precompiledPromptRecord?: PromptRecord | null;
  /** Extra tags merged into `extraLibraryTags` alongside preset/canvas tags. */
  extraLibraryTags?: string[];
  /**
   * Stable session id to correlate retries of the same master in the Library.
   * If omitted a fresh uuid is minted per call.
   */
  sessionId?: string;
  /**
   * Scene overlay — used by the Master · Scene-Flexible preset so the
   * operator can swap the background, framing aspect, and resolution
   * without editing the prompt. The edge function (Director Mode) appends
   * `BACKGROUND STYLE: <backgroundPrompt>` to the prompt and uses
   * `aspectRatio` / `resolution` directly. The strict catalog presets
   * leave these undefined to keep their canonical 10:11 / standard output.
   */
  sceneOverlay?: {
    backgroundPresetId?: string | null;
    backgroundPrompt?: string | null;
    aspectRatioOverride?: string | null;
    resolutionOverride?: "standard" | "high" | null;
    /**
     * Hero-grid composition contract (Jordan 2026-07-20): themed hero
     * THUMBNAILS share one pinned composition (centerline, shelf line,
     * bottle scale) so a grid of different stone/material themes reads as
     * one collection. OFF for free-flowing editorial/blog scenes.
     */
    heroGridBaseline?: boolean | null;
  };
}

function getBodyMaterialLabel(productContext: AssembledGenerateOptions["productContext"]): string {
  const haystack = [
    productContext?.bodyMaterial,
    productContext?.family,
    productContext?.collection,
    productContext?.category,
    productContext?.name,
    productContext?.sku,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  if (haystack.includes("aluminum") || haystack.includes("aluminium") || haystack.includes("ab-alu")) {
    return "opaque brushed/satin aluminum metal";
  }
  if (
    haystack.includes("atomizer") ||
    haystack.includes("metal atomizer") ||
    /(?:^|\s)gb-[a-z0-9-]+-(?:5ml|10ml)-atm-/i.test(haystack)
  ) {
    return "opaque colored/anodized metal atomizer casing";
  }
  return "the exact referenced bottle body material";
}

export function useAssembledPromptGeneration() {
  const { user } = useAuth();
  const { currentOrganizationId } = useOnboarding();
  const { toast } = useToast();

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AssembledGenerationResult | null>(null);

  const generate = async (
    assembled: AssembledPrompt,
    options: AssembledGenerateOptions = {},
  ): Promise<AssembledGenerationResult | null> => {
    if (!user) {
      const message = "Sign in required to generate images.";
      setError(message);
      toast({ title: "Not signed in", description: message, variant: "destructive" });
      return null;
    }
    if (!currentOrganizationId) {
      const message = "No organization selected — finish onboarding first.";
      setError(message);
      toast({ title: "No organization", description: message, variant: "destructive" });
      return null;
    }

    setIsGenerating(true);
    setError(null);
    setResult(null);

    const sessionId = options.sessionId ?? uuidv4();

    // Best Bottles Convex stores `imageUrl` as .gif (legacy bestbottles.com
    // thumbnails). The reference-locked PDP flow needs a fetchable product
    // reference. GPT image edits accepts PNG, JPG, and WebP inputs, so only
    // skip formats the provider path cannot reliably pass through.
    //
    // Reference shape: the edge function's `categorizeReferences` keys off
    // `ref.url` and `ref.label`. Sending a bare URL string silently fails
    // downstream (`processReferenceImage(undefined)`), so the model never
    // actually sees the reference. Always pass objects.
    const rawRef = options.referenceImageUrl?.trim() || "";
    const rawCapIdentityRef = options.capIdentityReferenceImageUrl?.trim() || "";
    const isBestBottlesStudioMasterRequest =
      Boolean(options.extraLibraryTags?.includes("brand:best-bottles")) &&
      Boolean(options.extraLibraryTags?.includes("studio-master"));
    const visualTargetBinding = resolveBestBottlesVisualTargetBinding(
      options.productContext?.bodyMaterial,
      // Body-color evidence: catalog color field + grace SKU body segment.
      // Without these, every colored-glass bottle fell back to the clear
      // exemplar (style-surface:clear on the 2026-07-20 amber renders).
      {
        color: options.productContext?.color ?? null,
        graceSku: options.productContext?.sku ?? null,
      },
      options.productContext?.componentTopology,
    );
    const rawGlassRef = resolveBestBottlesStyleReferenceUrl({
      explicitStyleReferenceUrl: options.glassSpecularityReferenceImageUrl,
      fallbackCylinderStyleReferenceUrl: visualTargetBinding.reference.imageUrl,
      isBestBottlesStudioMasterRequest,
      family: options.productContext?.family,
    });
    const rawMaskRef = options.productContext?.maskReference?.trim() || "";
    const usesRegistryMaterialBinding =
      isBestBottlesStudioMasterRequest &&
      isCylinderFamilyAlias(options.productContext?.family);
    const productReferenceIssue = getBestBottlesReferenceUrlIssue(rawRef);
    const expectedCapReferenceSku = options.productContext?.capIdentityReferenceSku?.trim().toUpperCase() || "";
    const capIdentityReferenceIssue = rawCapIdentityRef && (
      !/^CMP-ROC-(?:BLK|PNK|SLV)-(?:13415|17415)-DOT$/.test(expectedCapReferenceSku) ||
      !decodeURIComponent(rawCapIdentityRef).toUpperCase().includes(expectedCapReferenceSku) ||
      /\.(gif|heic|bmp)(\?|$)/i.test(rawCapIdentityRef)
    );
    const retiredReferenceIssue =
      isBestBottlesStudioMasterRequest
        ? getRetiredTransparentBestBottlesReferenceIssue([
            {
              url: rawRef,
              sourceReference: options.productContext?.sourceReference,
              referenceWorkflow: options.productContext?.referenceWorkflow,
              role: "product-reference",
            },
            {
              url: rawGlassRef,
              role: "style-reference",
            },
            {
              url: rawCapIdentityRef,
              role: "cap-identity-reference",
            },
            {
              url: rawMaskRef,
              role: "mask-reference",
            },
          ])
        : null;
    if (retiredReferenceIssue) {
      const message = retiredReferenceIssue;
      setError(message);
      setIsGenerating(false);
      toast({
        title: "Flattened product truth required",
        description: message,
        variant: "destructive",
      });
      return null;
    }
    if (isBestBottlesStudioMasterRequest && productReferenceIssue) {
      const message = `Reference is not usable: ${productReferenceIssue}`;
      setError(message);
      setIsGenerating(false);
      toast({
        title: "Usable reference required",
        description: message,
        variant: "destructive",
      });
      return null;
    }
    if (isBestBottlesStudioMasterRequest && capIdentityReferenceIssue) {
      const message = "The dotted-cap reference does not exactly match its approved component SKU or uses an unsupported image format.";
      setError(message);
      setIsGenerating(false);
      toast({ title: "Exact cap identity required", description: message, variant: "destructive" });
      return null;
    }
    if (
      usesRegistryMaterialBinding &&
      rawGlassRef !== visualTargetBinding.reference.imageUrl
    ) {
      const message = "The attached style reference URL does not match the resolved Best Bottles material target.";
      setError(message);
      setIsGenerating(false);
      toast({ title: "Material reference mismatch", description: message, variant: "destructive" });
      return null;
    }
    if (isBestBottlesStudioMasterRequest && rawMaskRef) {
      const message =
        "Best Bottles generation does not accept mask/control references. Use one approved opaque flattened-white product reference and, only when approved, one opaque style-only reference.";
      setError(message);
      setIsGenerating(false);
      toast({
        title: "Mask/control reference prohibited",
        description: message,
        variant: "destructive",
      });
      return null;
    }
    const refIsSupported =
      rawRef.length > 0 && productReferenceIssue === null;
    const glassRefIsSupported =
      rawGlassRef.length > 0 && !/\.(gif|heic|bmp)(\?|$)/i.test(rawGlassRef);
    const referenceImagesList: Array<{ url: string; label: string; description: string }> = [];
    const bodyMaterialLabel = getBodyMaterialLabel(options.productContext);
    const isMetalBody = bodyMaterialLabel.includes("aluminum") || bodyMaterialLabel.includes("metal atomizer");
    const styleReferenceLabel = isMetalBody
      ? "Metal Lighting-Only Style Reference"
      : "Glass Specularity Style Reference";
    const isColoredGlassStyle =
      visualTargetBinding.reference.material === "glass" &&
      ["amber", "cobalt", "green"].includes(visualTargetBinding.reference.surface);
    if (refIsSupported) {
      referenceImagesList.push({
        url: rawRef,
        label: "Product Reference",
        description: getBestBottlesProductReferenceDescription(
          bodyMaterialLabel,
          visualTargetBinding,
        ),
      });
    }
    if (rawCapIdentityRef) {
      referenceImagesList.push({
        url: rawCapIdentityRef,
        label: "Dotted Cap Identity Reference",
        description:
          "Exact component truth for this detached dotted roll-on cap. Copy its finish and alternating staggered 3/2 stud-column topology exactly; do not use it to change bottle geometry, placement, or scale.",
      });
    }
    if (glassRefIsSupported) {
      referenceImagesList.push({
        url: rawGlassRef,
        label: styleReferenceLabel,
        description:
          [
            "Secondary style-only reference.",
            isMetalBody
              ? `Use only for lighting direction, reflection-card rhythm, opaque metal edge glints, contact shadow, ambient occlusion, and premium studio polish. Do not use this image to change the product material: the body must remain ${bodyMaterialLabel}.`
              : isColoredGlassStyle
                ? "Use for realistic glass-body hue, transmitted color, density, thin-section glow, refraction, edge glints, specular highlight rhythm, contact shadow, ambient occlusion, and premium studio polish. Do not copy hardware or closure colors."
                : "Use only for realistic glass transparency, refraction, edge glints, specular highlight rhythm, contact shadow, ambient occlusion, and premium studio polish. Do not use it to recolor the product or components.",
            "Do not copy or infer this reference's product silhouette, cap, label, geometry, camera angle, composition, background, props, brand, or scene.",
            "Image 1 Product Reference remains the only product identity and placement source.",
          ].join(" "),
      });
    }
    const referenceImages = referenceImagesList.length > 0 ? referenceImagesList : undefined;
    const hasProductReference = refIsSupported;

    // Keep this hook compatible with the general Dark Room generator, but
    // Best Bottles masters are now recognized server-side by their tags and
    // routed to the short reference-locked retouch prompt instead of this
    // assembled art-direction prompt.
    const proModeControls = hasProductReference
      ? { productAccuracy: "strict" as const }
      : undefined;

    const baseTags = [
      "sku-preset",
      `preset:${assembled.preset.id}`,
      `canvas:${assembled.canvas.widthPx}x${assembled.canvas.heightPx}`,
    ];
    const visualTargetTags = isBestBottlesStudioMasterRequest
      ? visualTargetBinding.tags
      : [];
    const shadowPolicy = resolveBestBottlesShadowPolicy({
      graceSku: options.productContext?.sku,
      websiteSku: options.productContext?.websiteSku,
      family: options.productContext?.family,
      bottleCollection: options.productContext?.collection,
    });
    const shadowTopology = resolveBestBottlesShadowTopology(
      {
        family: options.productContext?.family,
        capState: options.productContext?.capState,
        mode: options.productContext?.mode,
        applicator: options.productContext?.applicator,
        accessoryCode: options.productContext?.accessoryCode,
        itemName: options.productContext?.name,
        itemDescription: options.productContext?.itemDescription,
      },
      {
        sku: options.productContext?.sku,
        detached_components:
          options.productContext?.capState === "detached" ||
          options.productContext?.mode === "cap-off"
            ? ["cap"]
            : [],
        applicator_type: options.productContext?.applicator,
      },
    );
    // Shadow ownership is resolved from reviewed family context. Caller-supplied
    // prompt/shadow metadata cannot override the canonical policy.
    const resolvedShadowPolicy: BestBottlesShadowPolicy = shadowPolicy;
    const shadowPolicyTags = isBestBottlesStudioMasterRequest
      ? getBestBottlesShadowPolicyTags(resolvedShadowPolicy)
      : [];
    const callerLibraryTags = isBestBottlesStudioMasterRequest
      ? (options.extraLibraryTags ?? []).filter(
          (tag) => !/^(?:prompt-version|prompt|shadow-owner|shadow-contract|shadow-smoke-sku|shadow-rollout):/i.test(tag),
        )
      : options.extraLibraryTags ?? [];
    const extraLibraryTags = options.extraLibraryTags
      ? Array.from(new Set([
          ...baseTags,
          ...callerLibraryTags,
          ...visualTargetTags,
          ...shadowPolicyTags,
        ]))
      : Array.from(new Set([...baseTags, ...visualTargetTags, ...shadowPolicyTags]));
    const isBestBottlesStudioMaster =
      hasProductReference &&
      extraLibraryTags.includes("brand:best-bottles") &&
      extraLibraryTags.includes("studio-master");
    const precompiledPrompt = options.precompiledPromptRecord?.final_prompt?.trim() || null;
    const uncalibratedRequestPrompt = isBestBottlesStudioMaster
      ? precompiledPrompt ?? [
          "REFERENCE-LOCKED BEST BOTTLES LUXURY PRODUCT PHOTOGRAPHY V5.1.",
          "Use the uploaded product reference as the source of truth.",
          "Server will build the full locked prompt from productContext, measurements, and reference metadata.",
        ].join("\n")
      : assembled.prompt;
    // Detached-sidecar lanes: canon mm can't describe the pictured cap-off
    // bottle (body + attached fitment), so measure the byte-locked reference's
    // actual bottle ratio and tell the model the exact number the aspect QA
    // gate will grade it against. Same measurement feeds the rig gate below.
    const detachedAspectReferenceUrl =
      options.productContext?.sourceReference || rawRef || null;
    const referenceAspectRatio =
      isBestBottlesStudioMaster &&
      options.productContext?.capState === "detached" &&
      detachedAspectReferenceUrl
        ? await measureReferencePrimaryAspectRatio(detachedAspectReferenceUrl)
        : null;
    // Detached cap proportions, measured from the same byte-locked reference.
    // Without this the model applies its own roll-on prior to the cap: on the
    // tall 13-415 bottle (cap ≈21% of bottle height vs ≈31% on the standard
    // 9 ml) it stretched the cap and grew an extra row of dots.
    // Cap metrics are best-effort. Clear/translucent sidecars often fail
    // component detection against bone; blocking those lanes regresses spray
    // generation. Opaque dotted roll-ons usually measure and get the lock.
    const referenceCapMetrics =
      isBestBottlesStudioMaster &&
      options.productContext?.capState === "detached" &&
      detachedAspectReferenceUrl
        ? await measureReferenceSidecarCapMetrics(detachedAspectReferenceUrl)
        : null;
    const appendMeasuredProportionLock = (prompt: string): string => {
      const blocks: string[] = [prompt.trim()];
      if (referenceAspectRatio != null) {
        blocks.push(
          `MEASURED REFERENCE PROPORTION LOCK: the primary bottle in the attached Product Reference measures exactly ${referenceAspectRatio.toFixed(2)}:1 height-to-width. Render the bottle at exactly this height-to-width relationship — do not elongate, slim, or stretch it; QA rejects any render whose bottle deviates from this ratio.`,
        );
      }
      if (referenceCapMetrics) {
        blocks.push(
          `MEASURED DETACHED CAP LOCK: the detached cap in the attached Product Reference measures exactly ${referenceCapMetrics.capAspectRatio.toFixed(2)}:1 height-to-width, and its total height is exactly ${referenceCapMetrics.capHeightPctOfBottle.toFixed(0)}% of the bottle's height. Reproduce the cap at exactly these proportions. Do NOT lengthen, shorten, widen, or "normalize" the cap toward a more typical roll-on cap — a tall slender bottle legitimately pairs with a proportionally short cap. Copy the cap's surface decoration exactly as it appears: reproduce the SAME NUMBER of dots, studs, bands, or facets in the SAME rows and spacing as the reference. Never add, remove, or extrapolate an extra row of decoration to fill a different cap length.`,
        );
      }
      return blocks.join("\n");
    };
    // Scene/marketing presets: the operator's background direction must BEAT
    // the reference-locked prompt's studio laws ("flat Bone background only",
    // no-props bans), which otherwise steamroll the server's one-line
    // BACKGROUND STYLE note (observed 2026-07-20: Natural Stone chip run
    // returned a bone-studio replica). Identity stays locked; only the
    // environment is released. PDP presets never get this block.
    const presetAssetRole = getBestBottlesImageAssetRoleForPreset(assembled.preset.id);
    const sceneEnvironmentPrompt =
      presetAssetRole === "scene" || presetAssetRole === "marketing"
        ? options.sceneOverlay?.backgroundPrompt?.trim() || null
        : null;
    const heroGridBaselineActive = Boolean(
      sceneEnvironmentPrompt && options.sceneOverlay?.heroGridBaseline,
    );
    // Pinned composition for hero-grid THUMBNAILS: themes vary (stones,
    // materials, light), but the bottle's position, scale, and shelf line
    // never do. The numbers come from the product's OWN PDP rig (shared
    // baseline + capacity-derived catalog scale), so a themed hero card can
    // sit beside — or replace — the bone-studio PDP card in the storefront
    // grid with the same shelf line and the same relative bottle size
    // (Jordan 2026-07-20: heroes must coexist with PDP cards).
    const heroGridRig = heroGridBaselineActive
      ? getFamilyRigForProduct({
          family: options.productContext?.family ?? null,
          bottleCollection: options.productContext?.collection ?? null,
          category: options.productContext?.category ?? null,
          itemName: options.productContext?.name ?? null,
          capacityMl: options.productContext?.capacityMl ?? null,
          heightWithCap: options.productContext?.heightWithCap ?? null,
          heightWithoutCap: options.productContext?.heightWithoutCap ?? null,
          diameter: options.productContext?.diameter ?? null,
        })
      : null;
    const heroGridBaselinePct = heroGridRig?.baselinePct ?? 12;
    const heroGridFillPct = heroGridRig?.fillHeightPct ?? 62;
    const HERO_GRID_COMPOSITION_CONTRACT =
      `HERO GRID COMPOSITION CONTRACT (GRID-CONSISTENCY AUTHORITY — applies on top of the scene direction): this render belongs to a themed hero-thumbnail series that must align in a storefront grid NEXT TO this product's standard catalog card, so it uses the catalog card's exact framing numbers. Pin the composition: bottle perfectly upright and centered at 50% of canvas width; bottle base seated on the catalog shelf line, about ${heroGridBaselinePct}% up from the canvas bottom; bottle occupies about ${heroGridFillPct}% of canvas height — the same catalog scale as its product-page card, so larger bottles read larger across the grid; camera at a consistent straight-on eye level with the same lens feel across the series. Scene props (stones, materials, botanicals) stay low around or behind the base — they must not lift or tilt the bottle, change its scale, or cover more than the bottom tenth of the bottle. Keep generous even margins. The theme changes between renders; the bottle's position, scale, and shelf line never change.`;
    const appendSceneEnvironmentOverride = (prompt: string): string =>
      sceneEnvironmentPrompt
        ? [
            `${prompt.trim()}\nSCENE ENVIRONMENT OVERRIDE (ENVIRONMENT AUTHORITY — this block supersedes every earlier background, surface, prop, and environment rule in this prompt, including the flat-Bone-background law and all no-prop / no-texture / single-background bans): stage the SAME locked bottle in this environment: ${sceneEnvironmentPrompt}. Product identity remains fully locked — geometry, silhouette, proportions, colors, cap state, component count, and material identity must not change. Only the backdrop, surface, props, lighting mood, and shadow behavior follow this scene direction.`,
            ...(heroGridBaselineActive ? [HERO_GRID_COMPOSITION_CONTRACT] : []),
          ].join("\n")
        : prompt;
    const requestPrompt = isBestBottlesStudioMaster
      ? appendSceneEnvironmentOverride(
          appendMeasuredProportionLock(
            applyResolvedBestBottlesVisualTargetPrompt(
              uncalibratedRequestPrompt,
              visualTargetBinding,
            ),
          ),
        )
      : uncalibratedRequestPrompt;
    const calibratedPromptRecord =
      isBestBottlesStudioMaster && options.precompiledPromptRecord
        ? {
            ...options.precompiledPromptRecord,
            // prompt_version must stay the EXACT canonical string — the edge
            // validator hard-requires "best-bottles-reference-locked-v6.1"
            // (a "+scene-overlay" suffix failed generation, 2026-07-20).
            // Scene provenance rides in qa_checklist instead.
            prompt_version: resolvedShadowPolicy.promptVersion,
            shadow_owner: resolvedShadowPolicy.owner,
            final_prompt: appendSceneEnvironmentOverride(
              appendMeasuredProportionLock(
                applyResolvedBestBottlesVisualTargetPrompt(
                  options.precompiledPromptRecord.final_prompt,
                  visualTargetBinding,
                ),
              ),
            ),
            qa_checklist: Array.from(
              new Set([
                ...options.precompiledPromptRecord.qa_checklist.filter(
                  (tag) => !/^(?:prompt-version|prompt|shadow-owner|shadow-contract|shadow-smoke-sku|shadow-rollout):/i.test(tag),
                ),
                ...visualTargetTags,
                ...shadowPolicyTags,
                ...(sceneEnvironmentPrompt
                  ? [
                      `scene-overlay:${options.sceneOverlay?.backgroundPresetId ?? "custom"}`,
                    ]
                  : []),
                ...(heroGridBaselineActive ? ["hero-grid:baseline"] : []),
              ]),
            ),
          }
        : options.precompiledPromptRecord;

    const materialBindingIssue = usesRegistryMaterialBinding
      ? getBestBottlesVisualTargetBindingIssue({
          binding: visualTargetBinding,
          attachedStyleReferenceUrl: rawGlassRef,
          prompt: requestPrompt,
          tags: visualTargetTags,
        })
      : null;
    if (materialBindingIssue) {
      setError(materialBindingIssue);
      setIsGenerating(false);
      toast({
        title: "Material reference contract blocked",
        description: materialBindingIssue,
        variant: "destructive",
      });
      return null;
    }

    try {
      const generationStartedAtMs = Date.now();
      const { data, error: invokeError } = await supabase.functions.invoke(
        "generate-madison-image",
        {
          body: {
            prompt: requestPrompt,
            userId: user.id,
            organizationId: currentOrganizationId,
            sessionId,
            goalType: "product_photography",
            // Scene-Flexible preset can override aspect ratio per generation
            // so a 16:9 hero or 1:1 marketplace tile still uses the same
            // SKU lock-in. Default falls through to the preset's canonical
            // ratio (10:11 for Grid Card, 4:5 for Sanity Hero, etc.).
            aspectRatio:
              options.sceneOverlay?.aspectRatioOverride ?? assembled.preset.aspectRatio,
            outputFormat: "png",
            referenceImages,
            proModeControls,
            aiProvider: options.aiProvider ?? DEFAULT_IMAGE_AI_PROVIDER,
            // Provider policy (Jordan 2026-07-20): pdp-primary/pdp-secondary
            // presets ALWAYS render on GPT Image 2 — the server force stands
            // and the override hatch is not sent (Gemini comparison runs broke
            // the rig contract: -29% aspect on the tall roll-on, 17% under-fill
            // on the swirl sprayer). marketing/scene presets are the Nano
            // Banana lane: a non-OpenAI dropdown selection there sends the
            // hatch so the requested model actually executes.
            allowBestBottlesProviderOverride:
              ["marketing", "scene"].includes(
                getBestBottlesImageAssetRoleForPreset(assembled.preset.id),
              ) &&
              Boolean(options.aiProvider && options.aiProvider !== "openai-image-2"),
            // Resolution override is locked to standard|high. "high" gives
            // visibly better cap-texture / refraction / neck-thread detail
            // per the OpenAI gpt-image-2 guide, BUT on the larger 2080×2288
            // canvas it pushes past the Supabase gateway timeout (504 GW
            // Timeout, observed 2026-04-26). Default reverted to "standard"
            // so single-generate stays responsive; operator can opt into
            // "high" per-generation via the Scene-Flexible preset's
            // resolution dropdown when fidelity matters more than latency.
            // Future fix: lengthen the edge function / gateway timeout, or
            // stream the response so high-resolution returns aren't
            // gated by wall-clock budget.
            resolution: options.sceneOverlay?.resolutionOverride ?? "standard",
            imageConstraints: options.sceneOverlay?.aspectRatioOverride
              ? undefined
              : getExactOutputCanvasConstraints(assembled.preset.canvas),
            // Background overlay flows through the same fields Dark Room
            // uses; the edge function's Director Mode appends them as a
            // BACKGROUND STYLE block ahead of the bottle's product spec.
            backgroundPresetId: options.sceneOverlay?.backgroundPresetId ?? undefined,
            backgroundPrompt: options.sceneOverlay?.backgroundPrompt ?? undefined,
            extraLibraryTags,
            productContext: options.productContext
              ? {
                  ...options.productContext,
                  ...(isBestBottlesStudioMasterRequest
                    ? {
                        promptVersion: resolvedShadowPolicy.promptVersion,
                        shadowOwner: resolvedShadowPolicy.owner,
                        shadowContract: resolvedShadowPolicy.contract,
                        styleReferenceSurface: visualTargetBinding.reference.surface,
                        styleReferenceImageId: visualTargetBinding.reference.imageId,
                        styleReferenceImageUrl: visualTargetBinding.reference.imageUrl,
                        styleReferenceExportSha256: visualTargetBinding.reference.exportSha256,
                      }
                    : {}),
                }
              : options.productContext,
            precompiledPromptRecord: calibratedPromptRecord ?? undefined,
          },
        },
      );

      if (invokeError) {
        // Full diagnostic logging so the browser console always has the raw
        // shape, regardless of what the toast can display. If the toast still
        // shows "[object Object]" after a refresh, dev server hasn't picked
        // up this build.
        console.error("[useAssembledPromptGeneration] invoke error", {
          error: invokeError,
          errorName: (invokeError as { name?: unknown }).name,
          errorMessage: (invokeError as { message?: unknown }).message,
          errorContext: (invokeError as { context?: unknown }).context,
          status:
            (invokeError as { context?: { status?: unknown } }).context?.status,
        });

        let message = "Image generation failed.";
        const rawMessage = (invokeError as { message?: unknown }).message;
        if (typeof rawMessage === "string" && rawMessage.trim()) {
          message = rawMessage;
        } else if (rawMessage != null) {
          try {
            message = JSON.stringify(rawMessage);
          } catch {
            message = String(rawMessage);
          }
        }

        // Try JSON body first, then text body fallback for non-JSON responses
        // (HTML error pages, plain text, etc.). Log everything we find.
        const ctx = (invokeError as {
          context?: {
            json?: () => Promise<unknown>;
            text?: () => Promise<string>;
            clone?: () => { json?: () => Promise<unknown>; text?: () => Promise<string> };
            status?: number;
          };
        }).context;
        if (ctx) {
          try {
            const clone = typeof ctx.clone === "function" ? ctx.clone() : null;
            if (typeof ctx.json === "function") {
              try {
                const body = await ctx.json();
                console.error("[useAssembledPromptGeneration] body (json)", body);
                if (body && typeof body === "object") {
                  const bodyError = (body as { error?: unknown }).error;
                  if (typeof bodyError === "string" && bodyError.trim()) {
                    message = bodyError;
                  } else if (bodyError != null) {
                    try {
                      message = JSON.stringify(bodyError);
                    } catch {
                      message = String(bodyError);
                    }
                  }
                }
              } catch (jsonErr) {
                // Not JSON — try the cloned body as text.
                if (clone && typeof clone.text === "function") {
                  try {
                    const text = await clone.text();
                    console.error("[useAssembledPromptGeneration] body (text)", text);
                    if (text && text.trim()) {
                      message = text.slice(0, 500);
                    }
                  } catch {
                    console.error(
                      "[useAssembledPromptGeneration] body unreadable as text after JSON fail",
                      jsonErr,
                    );
                  }
                }
              }
            }
          } catch (ctxErr) {
            console.error("[useAssembledPromptGeneration] context read failed", ctxErr);
          }
        }

        setError(message);
        toast({ title: "Generation failed", description: message, variant: "destructive" });
        return null;
      }

      // Under the heartbeat-streaming response (requests that outlive the edge
      // gateway's idle window), failures arrive as HTTP 200 with an `error`
      // field in the body instead of a non-2xx status. Surface the real
      // server-side message rather than a generic "no image URL".
      const streamedError = (data as { error?: unknown } | null)?.error;
      if (typeof streamedError === "string" && streamedError.trim()) {
        console.error("[useAssembledPromptGeneration] streamed body error", data);
        setError(streamedError);
        toast({ title: "Generation failed", description: streamedError, variant: "destructive" });
        return null;
      }

      if (!data?.imageUrl) {
        const message = "Edge function returned no image URL.";
        setError(message);
        toast({ title: "No image returned", description: message, variant: "destructive" });
        return null;
      }

      const resolvedAspectRatio =
        options.sceneOverlay?.aspectRatioOverride ?? assembled.preset.aspectRatio;
      const resolvedCanvas =
        resolveExactCanvasForAspectRatio(resolvedAspectRatio) ?? assembled.canvas;

      // Snap the rendered Bone background to the exact target hex and apply
      // the client-side rig baseline pass. The Edge function stays a provider
      // coordinator because 2080x2288 image re-encoding can exhaust worker
      // limits; the browser can safely perform the final Studio acceptance
      // pass before the Library URL is patched.
      const savedImageId = data.savedImageId ?? null;
      if (isBestBottlesStudioMaster && !savedImageId) {
        throw new Error("Best Bottles generation returned no durable Image Library row.");
      }
      const rigPostprocessDecision = shouldRunBestBottlesRigPostprocess({
        libraryTags: extraLibraryTags,
        family: options.productContext?.family,
        presetId: assembled.preset.id,
        aspectRatio: resolvedAspectRatio,
        canvas: resolvedCanvas,
        sceneOverlay: options.sceneOverlay,
      });
      const reconciliationAssetRole = getBestBottlesImageAssetRoleForPreset(
        assembled.preset.id,
      );
      const requiresPipelineReconciliation =
        requiresBestBottlesPipelineReconciliation(reconciliationAssetRole);
      const reconciliationBase: RecordBestBottlesRawImageInput | null =
        isBestBottlesStudioMaster && savedImageId && currentOrganizationId
          ? {
              imageId: savedImageId,
              organizationId: currentOrganizationId,
              graceSku: options.productContext?.sku,
              websiteSku: options.productContext?.websiteSku,
              family: options.productContext?.family,
              sourceReferenceUrl: options.productContext?.sourceReference ?? rawRef,
              prompt:
                typeof data.finalPrompt === "string" && data.finalPrompt.trim()
                  ? data.finalPrompt
                  : requestPrompt,
              promptVersion: resolveBestBottlesReconciliationPromptVersion(
                {
                  graceSku: options.productContext?.sku,
                  websiteSku: options.productContext?.websiteSku,
                  family: options.productContext?.family,
                  bottleCollection: options.productContext?.collection,
                },
                isBestBottlesStudioMasterRequest,
                options.productContext?.promptVersion,
              ),
              rigVersion: options.productContext?.rigVersion,
              providerModel: options.aiProvider ?? DEFAULT_IMAGE_AI_PROVIDER,
              shadowOwner: resolvedShadowPolicy.owner,
              shadowQa: null,
              shadowTopology,
              catalogTruth: {
                name: options.productContext?.name ?? null,
                graceSku: options.productContext?.sku ?? null,
                websiteSku: options.productContext?.websiteSku ?? null,
                eligibleGraceSkus:
                  options.productContext?.eligibleGraceSkus ??
                  (options.productContext?.sku ? [options.productContext.sku] : []),
                eligibleWebsiteSkus:
                  options.productContext?.eligibleWebsiteSkus ??
                  (options.productContext?.websiteSku ? [options.productContext.websiteSku] : []),
                family: options.productContext?.family ?? null,
                category: options.productContext?.category ?? null,
                capacityMl: options.productContext?.capacityMl ?? null,
                heightWithoutCap: options.productContext?.heightWithoutCap ?? null,
                heightWithCap: options.productContext?.heightWithCap ?? null,
                diameter: options.productContext?.diameter ?? null,
                neckThreadSize: options.productContext?.neckThreadSize ?? null,
                applicator: options.productContext?.applicator ?? null,
                capState: options.productContext?.capState ?? null,
                capColor: options.productContext?.capColor ?? null,
                trimColor: options.productContext?.trimColor ?? null,
                bodyMaterial: options.productContext?.bodyMaterial ?? null,
                color: options.productContext?.color ?? null,
                identityStatus: options.productContext?.identityStatus ?? null,
                identityBlockers: options.productContext?.identityBlockers ?? [],
                identityHash: options.productContext?.identityHash ?? null,
                sourceReferenceUrl: options.productContext?.sourceReference || rawRef || null,
                sourcePageUrl: options.productContext?.sourcePageUrl ?? null,
                measurementSource: options.productContext?.measurementSource ?? null,
                measurementSourceUrl: options.productContext?.measurementSourceUrl ?? null,
                measurementSourceNote: options.productContext?.measurementSourceNote ?? null,
                websiteTruthStatus: options.productContext?.websiteTruthStatus ?? null,
                websiteTruthIssues: options.productContext?.websiteTruthIssues ?? [],
              },
              assetRole: reconciliationAssetRole,
              requiresPipelineReconciliation,
              rawImageUrl: data.imageUrl,
              canvasWidthPx: resolvedCanvas.widthPx,
              canvasHeightPx: resolvedCanvas.heightPx,
            }
          : null;
      if (reconciliationBase) {
        await recordBestBottlesRawImage(reconciliationBase);
      }
      let finalImageUrl = data.imageUrl;
      let riggedSnapshot: RigBaselineNormalizeResult | null = null;
      if (rigPostprocessDecision.run && currentOrganizationId) {
        try {
          // Geometry-only rig. Global paint-after color correction is intentionally
          // retired because it shifts the product material and washes out clear glass.
          // The aspect gate's truth for detached lanes is the reference ratio
          // measured above — the same number injected into the prompt lock.
          let scaleCalibration: RigScaleCalibration | null = null;
          if (isCylinderFamilyAlias(options.productContext?.family)) {
            const calibrationKeys = buildBestBottlesScaleCalibrationKeys({
              family: options.productContext?.family,
              heightWithoutCap: options.productContext?.heightWithoutCap,
              diameter: options.productContext?.diameter,
              neckThreadSize: options.productContext?.neckThreadSize,
              applicator: options.productContext?.applicator,
              capState:
                options.productContext?.capState === "assembled"
                  ? "assembled"
                  : "detached",
            });
            if (
              !calibrationKeys.geometryKey.includes("unknown") &&
              !calibrationKeys.topologyKey.includes("unknown")
            ) {
              const approvedCalibration =
                await getApprovedBestBottlesScaleCalibration({
                  organizationId: currentOrganizationId,
                  family: options.productContext?.family ?? "Cylinder",
                  geometryKey: calibrationKeys.geometryKey,
                  topologyKey: calibrationKeys.topologyKey,
                });
              if (approvedCalibration) {
                scaleCalibration = {
                  id: approvedCalibration.id,
                  version: approvedCalibration.calibrationVersion,
                  sourceReferenceUrl: approvedCalibration.sourceReferenceUrl,
                  sourceReferenceHash: approvedCalibration.sourceReferenceHash,
                  glassFootYPct: approvedCalibration.glassFootYPct,
                  glassRimYPct: approvedCalibration.glassRimYPct,
                  fitmentTopYPct: approvedCalibration.fitmentTopYPct,
                  primaryBounds: approvedCalibration.primaryBounds,
                  detachedComponentBounds:
                    approvedCalibration.detachedComponentBounds,
                };
              }
            }
          }
          const rigged = await normalizeBestBottlesRigBaseline(data.imageUrl, {
            family: options.productContext?.family,
            bottleCollection: options.productContext?.collection,
            graceSku: options.productContext?.sku,
            websiteSku: options.productContext?.websiteSku,
            itemName: options.productContext?.name,
            itemDescription: options.productContext?.itemDescription,
            applicator: options.productContext?.applicator,
            capacityMl: options.productContext?.capacityMl,
            heightWithCap: options.productContext?.heightWithCap,
            heightWithoutCap: options.productContext?.heightWithoutCap,
            diameter: options.productContext?.diameter,
            capState: options.productContext?.capState,
            mode: options.productContext?.mode,
            targetBackgroundHex: BEST_BOTTLES_VISUAL_TARGET_CANVAS_HEX,
            shadowOwner: resolvedShadowPolicy.owner,
            shadowTopology,
            maskReferenceUrl: null,
            requireMaskControl: false,
            expectedPrimaryAspectRatio: referenceAspectRatio,
            expectedDetachedCapMetrics: referenceCapMetrics,
            scaleCalibration,
          });
          riggedSnapshot = rigged;
          const finalMeasurements = rigged.framingQa?.measurements ?? null;
          const requiresPhysicalScaleCalibration = isCylinderFamilyAlias(
            options.productContext?.family,
          );
          const physicalScaleNeedsReview =
            requiresPhysicalScaleCalibration &&
            (rigged.physicalScaleQa.verdict === "review" ||
              rigged.physicalScaleQa.verdict === "unverified");
          const bodyControlMissPrefix =
            "Exact glass body-control bounds could not be derived";
          const blockingRigIssues = rigged.qaIssues.filter(
            (issue) =>
              !(
                physicalScaleNeedsReview &&
                issue.startsWith(bodyControlMissPrefix)
              ),
          );
          if (
            !finalMeasurements ||
            finalMeasurements.baselineYPx === null ||
            !Number.isFinite(finalMeasurements.targetBaselineYPx)
          ) {
            throw new Error("Rig baseline was not detectable in the final rendered image.");
          }
          if (
            blockingRigIssues.length > 0 ||
            (requiresPhysicalScaleCalibration &&
              rigged.physicalScaleQa.verdict === "fail")
          ) {
            throw new Error(`Rig QA failed: ${blockingRigIssues.join(" ")}`);
          }
          const backgroundQa = await analyzeBestBottlesBackgroundImage(
            rigged.dataUrl,
          );
          if (backgroundQa.status !== "pass") {
            throw new Error(`Background QA failed: ${backgroundQa.message}`);
          }
          // Shadow QA is advisory, never blocking (Jordan standing policy
          // 2026-07-18, reaffirmed 2026-07-19): measurements are recorded in
          // shadowQa for display; only framing/geometry issues gate.
          const reviewQaIssues = [
            ...rigged.qaIssues,
            ...(physicalScaleNeedsReview
              ? [
                  rigged.physicalScaleQa.verdict === "unverified"
                    ? "Approved scale calibration is missing; physical scale remains review-pending."
                    : `Physical scale requires review (height Δ ${rigged.physicalScaleQa.deltaMm} mm${
                        rigged.physicalScaleQa.diameterDeltaMm != null
                          ? `, diameter Δ ${rigged.physicalScaleQa.diameterDeltaMm} mm`
                          : ""
                      }${
                        rigged.physicalScaleQa.assembledDeltaMm != null
                          ? `, assembled height Δ ${rigged.physicalScaleQa.assembledDeltaMm} mm`
                          : ""
                      }).`,
                ]
              : []),
          ];
          console.info("[useAssembledPromptGeneration] Best Bottles rig postprocess", {
            shifted: rigged.shifted,
            shiftXPx: rigged.shiftXPx,
            shiftYPx: rigged.shiftYPx,
            scale: rigged.scale,
            maskControlled: rigged.maskControlled,
            qaIssues: rigged.qaIssues,
            framingQa: rigged.framingQa,
            detectedBaselineYPx: rigged.detectedBaselineYPx,
            targetBaselineYPx: rigged.targetBaselineYPx,
            reason: rigPostprocessDecision.reason,
            family: options.productContext?.family,
            capState: options.productContext?.capState,
            mode: options.productContext?.mode,
          });
          const blob = dataUrlToBlob(rigged.dataUrl);
          const ts = Date.now();
          const rand = Math.random().toString(36).slice(2, 8);
          const path = `${currentOrganizationId}/${user.id}/paper-doll/master_rigged_${ts}_${rand}.png`;
          const { error: uploadError } = await supabase.storage
            .from("generated-images")
            .upload(path, blob, {
              cacheControl: "3600",
              upsert: false,
              contentType: "image/png",
            });
          if (uploadError) {
            throw new Error(`Rigged master upload failed: ${uploadError.message}`);
          } else {
            const { data: urlData } = supabase.storage
              .from("generated-images")
              .getPublicUrl(path);
            if (!urlData?.publicUrl) {
              throw new Error("Rigged master upload returned no public URL.");
            }
            finalImageUrl = urlData.publicUrl;
            if (savedImageId) {
              const { error: updateError } = await supabase
                .from("generated_images")
                .update({ image_url: finalImageUrl })
                .eq("id", savedImageId);
              if (updateError) {
                throw new Error(`Library row rig patch failed: ${updateError.message}`);
              }
              for (const tag of [
                BEST_BOTTLES_BACKGROUND_QA_PASS_TAG,
                BEST_BOTTLES_CANVAS_HEX_TAG,
              ]) {
                const nextTags = await addLibraryTag(savedImageId, tag);
                if (!nextTags) {
                  throw new Error(
                    `Library row background QA tag failed for ${tag}.`,
                  );
                }
              }
            }
            if (reconciliationBase) {
              await recordBestBottlesRigResult({
                ...reconciliationBase,
                finalImageUrl,
                preTransformBaselineYPx: rigged.preTransformBaselineYPx,
                detectedBaselineYPx: finalMeasurements.baselineYPx,
                targetBaselineYPx: finalMeasurements.targetBaselineYPx,
                fillHeightPct: finalMeasurements.fillHeightPct,
                centerXPct: finalMeasurements.centerXPct,
                targetCenterXPct: finalMeasurements.targetCenterXPct,
                centerDeltaPct: finalMeasurements.centerDeltaPct,
                shiftXPx: rigged.shiftXPx,
                shiftYPx: rigged.shiftYPx,
                scaleFactor: rigged.scale,
                maskControlled: rigged.maskControlled,
                preTransformObjectBounds: rigged.preTransformObjectBounds,
                transformControlBounds: rigged.transformControlBounds,
                objectBounds: rigged.objectBounds,
                framingQa: rigged.framingQa,
                shadowOwner: rigged.shadowOwner,
                shadowQa: rigged.shadowQa,
                qaIssues: reviewQaIssues,
                framingDecision: physicalScaleNeedsReview
                  ? "normalize"
                  : rigged.framingDecision,
                lifecycleState: physicalScaleNeedsReview
                  ? "review-pending"
                  : "qa-passed",
                lastError: null,
              });
            }
          }
        } catch (e) {
          const message = e instanceof Error ? e.message : "Best Bottles rig postprocess failed.";
          console.error("[useAssembledPromptGeneration] Best Bottles rig postprocess failed", {
            error: e,
            savedImageId,
            rawImageUrl: data.imageUrl,
            family: options.productContext?.family,
          });
          if (reconciliationBase) {
            try {
              const failedMeasurements = riggedSnapshot?.framingQa?.measurements ?? null;
              await recordBestBottlesRigResult({
                ...reconciliationBase,
                finalImageUrl: null,
                preTransformBaselineYPx: riggedSnapshot?.preTransformBaselineYPx ?? null,
                detectedBaselineYPx: failedMeasurements?.baselineYPx ?? null,
                targetBaselineYPx: failedMeasurements?.targetBaselineYPx ?? null,
                fillHeightPct: failedMeasurements?.fillHeightPct ?? null,
                centerXPct: failedMeasurements?.centerXPct ?? null,
                targetCenterXPct: failedMeasurements?.targetCenterXPct ?? null,
                centerDeltaPct: failedMeasurements?.centerDeltaPct ?? null,
                shiftXPx: riggedSnapshot?.shiftXPx ?? null,
                shiftYPx: riggedSnapshot?.shiftYPx ?? null,
                scaleFactor: riggedSnapshot?.scale ?? null,
                maskControlled: riggedSnapshot?.maskControlled ?? false,
                preTransformObjectBounds: riggedSnapshot?.preTransformObjectBounds ?? null,
                transformControlBounds: riggedSnapshot?.transformControlBounds ?? null,
                objectBounds: riggedSnapshot?.objectBounds ?? null,
                framingQa: riggedSnapshot?.framingQa ?? null,
                shadowOwner: riggedSnapshot?.shadowOwner ?? resolvedShadowPolicy.owner,
                shadowQa: riggedSnapshot?.shadowQa ?? null,
                qaIssues: riggedSnapshot?.qaIssues ?? [message],
                framingDecision: riggedSnapshot?.framingDecision ?? null,
                lifecycleState: "qa-failed",
                lastError: message,
              });
            } catch (reconciliationError) {
              console.error(
                "[useAssembledPromptGeneration] Failed to persist rig failure state",
                reconciliationError,
              );
            }
          }
          setError(message);
          toast({ title: "Rig post-process failed", description: message, variant: "destructive" });
          return null;
        }
      } else if (extraLibraryTags.includes("brand:best-bottles") && extraLibraryTags.includes("studio-master")) {
        if (reconciliationBase) {
          await recordBestBottlesRigResult({
            ...reconciliationBase,
            finalImageUrl,
            shadowOwner: resolvedShadowPolicy.owner,
            shadowQa: null,
            qaIssues: [`Rig bypassed: ${rigPostprocessDecision.reason}`],
            lifecycleState: "review-pending",
            lastError: null,
          });
        }
        console.info("[useAssembledPromptGeneration] Best Bottles rig postprocess not required", {
          reason: rigPostprocessDecision.reason,
          family: options.productContext?.family,
          aspectRatio: resolvedAspectRatio,
          canvas: resolvedCanvas,
          sceneOverlay: options.sceneOverlay,
        });
      }

      const generated: AssembledGenerationResult = {
        imageUrl: finalImageUrl,
        savedImageId,
        usedProvider:
          typeof data.usedProvider === "string" && data.usedProvider.trim()
            ? data.usedProvider
            : null,
        durationMs: Date.now() - generationStartedAtMs,
        prompt: typeof data.finalPrompt === "string" && data.finalPrompt.trim()
          ? data.finalPrompt
          : assembled.prompt,
        aspectRatio: resolvedAspectRatio,
        canvas: resolvedCanvas,
        presetId: assembled.preset.id,
        sessionId,
        rigReview: {
          required: rigPostprocessDecision.run,
          applied: riggedSnapshot !== null,
          reason: rigPostprocessDecision.reason,
          framingDecision: riggedSnapshot?.framingDecision ?? null,
          framingQa: riggedSnapshot?.framingQa ?? null,
          // Model-owned shadows carry no machine QA (analyzer removed, Jordan
          // 2026-07-19) — human visual confirmation is the only shadow review.
          qaIssues: riggedSnapshot?.qaIssues ?? [],
          objectBounds: riggedSnapshot?.objectBounds ?? null,
          preTransformObjectBounds: riggedSnapshot?.preTransformObjectBounds ?? null,
          shiftXPx: riggedSnapshot?.shiftXPx ?? null,
          shiftYPx: riggedSnapshot?.shiftYPx ?? null,
          scaleFactor: riggedSnapshot?.scale ?? null,
          maskControlled: riggedSnapshot?.maskControlled ?? false,
          shadowOwner: riggedSnapshot?.shadowOwner ?? resolvedShadowPolicy.owner,
          shadowQa: riggedSnapshot?.shadowQa ?? null,
          shadowTopology,
          promptVersion: resolvedShadowPolicy.promptVersion,
          sourceReferenceHash: null,
        },
      };
      setResult(generated);
      toast({
        title: "Image generated",
        description: `${assembled.preset.label} · ${resolvedCanvas.widthPx} × ${resolvedCanvas.heightPx}`,
      });
      return generated;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unexpected generation error.";
      setError(message);
      toast({ title: "Generation failed", description: message, variant: "destructive" });
      return null;
    } finally {
      setIsGenerating(false);
    }
  };

  const reset = () => {
    setResult(null);
    setError(null);
  };

  return { generate, isGenerating, error, result, reset };
}
