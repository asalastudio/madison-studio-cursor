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
import { colorCorrectToTarget, dataUrlToBlob } from "@/lib/product-image/colorCorrect";

const PAPER_DOLL_TARGET_CREAM = "#EEE6D4";

export interface AssembledGenerationResult {
  imageUrl: string;
  savedImageId: string | null;
  prompt: string;
  aspectRatio: string;
  canvas: { widthPx: number; heightPx: number };
  presetId: string;
  sessionId: string;
}

export interface AssembledGenerateOptions {
  /** Image provider/model id sent through to generate-madison-image. */
  aiProvider?: string;
  /** Optional geometry reference image (e.g. product.imageUrl from Convex). */
  referenceImageUrl?: string | null;
  /** Optional style-only reference for realistic glass, specularity, and shadow behavior. */
  glassSpecularityReferenceImageUrl?: string | null;
  /**
   * Extra SKU metadata for the `productContext` field in the edge function
   * — drives per-product prompt tuning and visual-DNA enrichment.
   */
  productContext?: {
    name?: string;
    websiteSku?: string | null;
    itemDescription?: string | null;
    collection?: string;
    family?: string | null;
    category?: string;
    bodyMaterial?: string | null;
    color?: string | null;
    scent_family?: string;
    sku?: string;
    capacityMl?: number | null;
    heightWithoutCap?: string | null;
    heightWithCap?: string | null;
    diameter?: string | null;
    capColor?: string | null;
    trimColor?: string | null;
    applicator?: string | null;
  };
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
  };
}

function getExactCanvasForAspectRatio(aspectRatio: string): { widthPx: number; heightPx: number } | null {
  const normalized = aspectRatio.trim().toLowerCase().replace(/\s+/g, "");
  return normalized === "10:11" || normalized === "2080:2288" || normalized === "2080x2288"
    ? { widthPx: 2080, heightPx: 2288 }
    : null;
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
    const rawGlassRef = options.glassSpecularityReferenceImageUrl?.trim() || "";
    const isBestBottlesStudioMasterRequest =
      Boolean(options.extraLibraryTags?.includes("brand:best-bottles")) &&
      Boolean(options.extraLibraryTags?.includes("studio-master"));
    const productReferenceIssue = getBestBottlesReferenceUrlIssue(rawRef);
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
    if (refIsSupported) {
      referenceImagesList.push({
        url: rawRef,
        label: "Product Reference",
        description:
          [
            "Canonical bottle reference (PSD-rendered PNG).",
            `Use this image as an exact product-identity lock: preserve the bottle geometry, camera angle, scale relationships, body material/substrate (${bodyMaterialLabel}), cap texture, fitment, applicator, body color, hose/bulb/tassel color, trim metal, and all surface details.`,
            "Do not redesign, restyle, recolor, rotate, or reinterpret the product components.",
            "Do allow luxury catalog staging, lighting, background replacement, shadow, and refined PDP canvas placement as instructed by the server prompt.",
          ].join(" "),
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
              : "Use only for realistic glass transparency, refraction, edge glints, specular highlight rhythm, contact shadow, ambient occlusion, and premium studio polish.",
            "Do not copy or infer this reference's product silhouette, cap, label, colors, geometry, camera angle, composition, background, props, brand, or scene.",
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
    const extraLibraryTags = options.extraLibraryTags
      ? Array.from(new Set([...baseTags, ...options.extraLibraryTags]))
      : baseTags;
    const isBestBottlesStudioMaster =
      hasProductReference &&
      extraLibraryTags.includes("brand:best-bottles") &&
      extraLibraryTags.includes("studio-master");
    const requestPrompt = isBestBottlesStudioMaster
      ? [
          "REFERENCE-LOCKED BEST BOTTLES LUXURY PRODUCT PHOTOGRAPHY V5.1.",
          "Use the uploaded product reference as the source of truth.",
          "Server will build the full locked prompt from productContext, measurements, and reference metadata.",
        ].join("\n")
      : assembled.prompt;

    try {
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
            // Background overlay flows through the same fields Dark Room
            // uses; the edge function's Director Mode appends them as a
            // BACKGROUND STYLE block ahead of the bottle's product spec.
            backgroundPresetId: options.sceneOverlay?.backgroundPresetId ?? undefined,
            backgroundPrompt: options.sceneOverlay?.backgroundPrompt ?? undefined,
            extraLibraryTags,
            productContext: options.productContext,
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

      if (!data?.imageUrl) {
        const message = "Edge function returned no image URL.";
        setError(message);
        toast({ title: "No image returned", description: message, variant: "destructive" });
        return null;
      }

      // Snap the rendered cream background to the exact target hex.
      // gpt-image-2 drifts a few percent off #EEE6D4 even when the prompt
      // locks the hex; without this, library renders show inconsistent
      // cream tones across batches. Only runs for Best Bottles renders
      // that target the canonical cream plate (Scene-Flexible custom
      // backgrounds are left alone).
      const savedImageId = data.savedImageId ?? null;
      const shouldColorCorrect =
        extraLibraryTags.includes("brand:best-bottles") &&
        !options.sceneOverlay?.backgroundPresetId &&
        !options.sceneOverlay?.backgroundPrompt;
      let finalImageUrl = data.imageUrl;
      if (shouldColorCorrect && currentOrganizationId) {
        try {
          const correctedDataUrl = await colorCorrectToTarget(
            data.imageUrl,
            PAPER_DOLL_TARGET_CREAM,
          );
          const blob = dataUrlToBlob(correctedDataUrl);
          const ts = Date.now();
          const rand = Math.random().toString(36).slice(2, 8);
          const path = `${currentOrganizationId}/${user.id}/paper-doll/master_corrected_${ts}_${rand}.png`;
          const { error: uploadError } = await supabase.storage
            .from("generated-images")
            .upload(path, blob, {
              cacheControl: "3600",
              upsert: false,
              contentType: "image/png",
            });
          if (uploadError) {
            console.warn("[useAssembledPromptGeneration] color-corrected upload failed", uploadError);
          } else {
            const { data: urlData } = supabase.storage
              .from("generated-images")
              .getPublicUrl(path);
            if (urlData?.publicUrl) {
              finalImageUrl = urlData.publicUrl;
              if (savedImageId) {
                const { error: updateError } = await supabase
                  .from("generated_images")
                  .update({ image_url: finalImageUrl })
                  .eq("id", savedImageId);
                if (updateError) {
                  console.warn(
                    "[useAssembledPromptGeneration] generated_images.image_url patch failed",
                    updateError,
                  );
                }
              }
            }
          }
        } catch (e) {
          console.warn("[useAssembledPromptGeneration] color correction skipped", e);
        }
      }

      const resolvedAspectRatio =
        options.sceneOverlay?.aspectRatioOverride ?? assembled.preset.aspectRatio;
      const resolvedCanvas =
        getExactCanvasForAspectRatio(resolvedAspectRatio) ?? assembled.canvas;
      const generated: AssembledGenerationResult = {
        imageUrl: finalImageUrl,
        savedImageId,
        prompt: typeof data.finalPrompt === "string" && data.finalPrompt.trim()
          ? data.finalPrompt
          : assembled.prompt,
        aspectRatio: resolvedAspectRatio,
        canvas: resolvedCanvas,
        presetId: assembled.preset.id,
        sessionId,
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
