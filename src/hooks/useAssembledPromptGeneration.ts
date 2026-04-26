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
  /** Optional geometry reference image (e.g. product.imageUrl from Convex). */
  referenceImageUrl?: string | null;
  /**
   * Extra SKU metadata for the `productContext` field in the edge function
   * — drives per-product prompt tuning and visual-DNA enrichment.
   */
  productContext?: {
    name?: string;
    collection?: string;
    category?: string;
    scent_family?: string;
  };
  /** Extra tags merged into `extraLibraryTags` alongside preset/canvas tags. */
  extraLibraryTags?: string[];
  /**
   * Stable session id to correlate retries of the same master in the Library.
   * If omitted a fresh uuid is minted per call.
   */
  sessionId?: string;
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
    // thumbnails). OpenAI /images/edits only accepts PNG references and 500s
    // on gif/webp, so we skip unsupported formats rather than ship a broken
    // reference. The SKU data block is rich enough to produce a good output
    // without a visual reference; future work can PNG-convert upstream.
    //
    // Reference shape: the edge function's `categorizeReferences` keys off
    // `ref.url` and `ref.label`. Sending a bare URL string silently fails
    // downstream (`processReferenceImage(undefined)`), so the model never
    // actually sees the reference. Always pass objects.
    const rawRef = options.referenceImageUrl?.trim() || "";
    const refIsSupported =
      rawRef.length > 0 && !/\.(gif|webp|heic|bmp)(\?|$)/i.test(rawRef);
    const referenceImages = refIsSupported
      ? [
          {
            url: rawRef,
            label: "Product Reference",
            description:
              "Canonical bottle reference (PSD-rendered PNG). Preserve exact bottle geometry, cap texture, fitment, applicator, glass color, and all surface details. Do not redesign, restyle, or reinterpret the product.",
          },
        ]
      : undefined;

    // Trigger Director Mode in the edge function whenever a reference is
    // attached. Essential Mode appends one weak sentence ("Use the uploaded
    // product image as the exact subject"); Director Mode prepends a strict
    // PRESERVE-EXACT-PRODUCT directive block that gpt-image-2 actually obeys.
    // Without this, the assembled 4-layer prompt completely overrides the
    // reference and the model regenerates the bottle from its own knowledge.
    const proModeControls = referenceImages
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

    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        "generate-madison-image",
        {
          body: {
            prompt: assembled.prompt,
            userId: user.id,
            organizationId: currentOrganizationId,
            sessionId,
            goalType: "product_photography",
            aspectRatio: assembled.preset.aspectRatio,
            outputFormat: "png",
            referenceImages,
            proModeControls,
            aiProvider: DEFAULT_IMAGE_AI_PROVIDER,
            resolution: "standard",
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

      const generated: AssembledGenerationResult = {
        imageUrl: data.imageUrl,
        savedImageId: data.savedImageId ?? null,
        prompt: assembled.prompt,
        aspectRatio: assembled.preset.aspectRatio,
        canvas: assembled.canvas,
        presetId: assembled.preset.id,
        sessionId,
      };
      setResult(generated);
      toast({
        title: "Image generated",
        description: `${assembled.preset.label} · ${assembled.canvas.widthPx} × ${assembled.canvas.heightPx}`,
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
