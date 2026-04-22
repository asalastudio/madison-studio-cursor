/**
 * Consistency Mode orchestrator.
 *
 * Runs a bulk-variation generation by invoking `generate-madison-image` once
 * per variation, passing the SAME seed + SAME master reference + SAME
 * generation settings, so every image in the set shares background,
 * lighting, camera, and composition.
 *
 * This deliberately runs sequentially (not parallel) to:
 *   1. Respect per-function rate limits
 *   2. Let the UI surface "generating 3 of 8…" progress as each finishes
 *   3. Make a single cancel button reliable
 */

import { supabase } from "@/integrations/supabase/client";
import {
  buildSceneAnchor,
  buildVariationDescriptor,
  buildVariationLabel,
  expandVariationMatrix,
  DEFAULT_STUDIO_SETTINGS,
  type CompositionId,
  type StudioSettings,
  type VariationOption,
} from "@/config/consistencyVariations";

const MAX_INT32 = 2147483647;

export type VariationItemStatus = "pending" | "running" | "complete" | "error" | "cancelled";

export interface VariationItem {
  /** Stable index within the set (0-based). */
  position: number;
  /** What's different about this one (e.g. "Amber · Polished Gold"). */
  label: string;
  /** Full prompt fragment fed into the edge function. */
  descriptor: string;
  /** Per-axis picks that produced this item. */
  selection: {
    bottleColor?: VariationOption;
    capColor?: VariationOption;
    fitmentType?: VariationOption;
  };
  status: VariationItemStatus;
  /** Image URL once generation completes. */
  imageUrl?: string;
  /** Saved-image ID in generated_images. */
  savedImageId?: string;
  /** Error message if status === "error". */
  error?: string;
}

export interface ConsistencySetPayload {
  /** URL of the master reference image (already uploaded to storage). */
  masterImageUrl: string;
  /** User's free-text brief — appended after the locked scene anchor. */
  userPrompt: string;
  /** Organization the set belongs to. */
  organizationId: string;
  /** The user kicking off the set. */
  userId: string;
  /** Session id (reuse Dark Room's). */
  sessionId: string;
  /** Aspect ratio shared by every variation. */
  aspectRatio?: string;
  /** Resolution tier shared by every variation. */
  resolution?: "standard" | "high" | "4k";
  /** AI provider routing shared by every variation. */
  aiProvider?: string;
  /** Pro mode controls (camera/lighting/environment) shared by every variation. */
  proModeControls?: { camera?: string; lighting?: string; environment?: string };
  /** User's matrix selection — Cartesian-expanded into items by the orchestrator. */
  selection: {
    bottleColor: VariationOption[];
    capColor: VariationOption[];
    fitmentType: VariationOption[];
  };
  /**
   * Optional per-option material reference images, keyed by VariationOption.id
   * (e.g. "swirl" → { url, name }). When present for an option used in a
   * given variation, the orchestrator adds that image as a SECOND product
   * reference on that variation's API call, labelled so the edge function
   * treats it as a material / finish anchor for the axis it belongs to.
   */
  materialReferences?: Record<string, { url: string; name?: string } | undefined>;
  /** Composition preset — "assembled" (default) or "exploded-uncapped". */
  composition?: CompositionId;
  /**
   * Studio controls — backdrop colour, light direction, shadow direction,
   * shadow intensity. Shared across every variation in the set so the
   * entire grid lands under one locked studio treatment. When omitted
   * the default (bone backdrop, classic 45° light, soft SW shadow) is
   * used — identical to the pre-studio-controls behaviour.
   */
  studio?: StudioSettings;
}

export interface ConsistencyRunHandle {
  setId: string;
  seed: number;
  items: VariationItem[];
  cancel: () => void;
}

export interface ConsistencyRunCallbacks {
  onItemUpdate: (item: VariationItem) => void;
  onComplete: (items: VariationItem[]) => void;
  onError: (error: Error) => void;
}

/**
 * Start a consistency run. Returns immediately with a handle containing the
 * expanded item list so the UI can render the queue skeleton, then fills in
 * each item's status via the `onItemUpdate` callback.
 */
export function runConsistencySet(
  payload: ConsistencySetPayload,
  callbacks: ConsistencyRunCallbacks,
): ConsistencyRunHandle {
  const setId = crypto.randomUUID();
  const seed = Math.floor(Math.random() * MAX_INT32);

  const combinations = expandVariationMatrix(payload.selection);

  if (combinations.length === 0) {
    callbacks.onError(
      new Error(
        "Select at least one option from at least one variation axis before generating.",
      ),
    );
    return {
      setId,
      seed,
      items: [],
      cancel: () => {},
    };
  }

  const items: VariationItem[] = combinations.map((selection, index) => ({
    position: index,
    label: buildVariationLabel(selection),
    descriptor: buildVariationDescriptor(selection),
    selection,
    status: "pending",
  }));

  let cancelled = false;

  const cancel = () => {
    cancelled = true;
    // Flip any still-pending items to cancelled so the UI reflects state.
    for (const item of items) {
      if (item.status === "pending") {
        item.status = "cancelled";
        callbacks.onItemUpdate({ ...item });
      }
    }
  };

  // Fire the async runner but return the handle synchronously.
  void (async () => {
    try {
      for (const item of items) {
        if (cancelled) break;

        item.status = "running";
        callbacks.onItemUpdate({ ...item });

        try {
          const finalPrompt = buildFinalPrompt(
            payload.userPrompt,
            item.descriptor,
            payload.composition,
            payload.studio,
          );

          // Build this variation's reference images. Always include the
          // master as the primary product reference. Additionally, for each
          // axis where the user attached a per-option material reference,
          // include that image as a secondary product reference. Labels
          // identify the role so the edge function can categorize correctly
          // and Gemini can interpret which image governs what.
          const variationRefs: Array<{ url: string; label: string; description: string }> = [
            {
              url: payload.masterImageUrl,
              label: "Product",
              description:
                "Master reference — use for EXACT shape, silhouette, proportions, neck, shoulder, and base geometry. The material and colour of this image are not final; the VARIATION DETAILS below decide the material.",
            },
          ];

          const maybeAddMaterialRef = (
            axisLabel: string,
            option: VariationOption | undefined,
          ) => {
            if (!option) return;
            const ref = payload.materialReferences?.[option.id];
            if (!ref?.url) return;
            // Label deliberately NOT "Product" — the edge function's
            // categorizer routes anything labelled "Product" into
            // multi-product-composite mode, which would cause the model to
            // try placing a SECOND bottle in the scene. "Style Reference"
            // lands in the style bucket, which is scoped to surface/finish
            // details and doesn't trigger compositing.
            variationRefs.push({
              url: ref.url,
              label: "Style Reference",
              description: `Material reference for ${axisLabel}. Use this image ONLY as a guide for the SURFACE MATERIAL / FINISH / COLOUR / TEXTURE of the ${axisLabel.toLowerCase()} on the bottle described by the master reference. Do NOT copy this image's background, transparency, framing, composition, lighting, or any second product visible in it. The scene anchor governs the studio backdrop and lighting; the master reference governs shape. This reference contributes material only.`,
            });
          };

          maybeAddMaterialRef("Bottle Material", item.selection.bottleColor);
          maybeAddMaterialRef("Cap Finish", item.selection.capColor);
          maybeAddMaterialRef("Fitment", item.selection.fitmentType);

          const { data, error } = await supabase.functions.invoke(
            "generate-madison-image",
            {
              body: {
                // Core generation fields
                prompt: finalPrompt,
                userId: payload.userId,
                organizationId: payload.organizationId,
                sessionId: payload.sessionId,
                goalType: "product_photography",
                aspectRatio: payload.aspectRatio ?? "1:1",
                outputFormat: "png",
                referenceImages: variationRefs,
                // Shared generation settings
                proModeControls: payload.proModeControls,
                aiProvider: payload.aiProvider ?? "auto",
                resolution: payload.resolution ?? "high",
                // Consistency Mode fields.
                // - variationPrompt: the RICH descriptor (BOTTLE BODY / CAP /
                //   FITMENT blocks with full material/finish language) that
                //   gets appended to the Gemini prompt so the model knows
                //   exactly which element gets which treatment.
                // - variationLabel: the SHORT human-readable label
                //   ("Amber · Polished Gold") used for the DB column and
                //   Library display. Keep them separate so the AI doesn't
                //   just see "Swirl · Polished Gold" with no instructions.
                fixedSeed: seed,
                consistencySetId: setId,
                variationPrompt: item.descriptor,
                variationLabel: item.label,
                setPosition: item.position,
              },
            },
          );

          if (cancelled) break;

          if (error) {
            const msg = extractErrorMessage(error);
            item.status = "error";
            item.error = msg;
            callbacks.onItemUpdate({ ...item });
            continue;
          }

          if (!data?.imageUrl || !data?.savedImageId) {
            item.status = "error";
            item.error = "No image returned from server.";
            callbacks.onItemUpdate({ ...item });
            continue;
          }

          item.status = "complete";
          item.imageUrl = data.imageUrl;
          item.savedImageId = data.savedImageId;
          callbacks.onItemUpdate({ ...item });
        } catch (err) {
          if (cancelled) break;
          item.status = "error";
          item.error = err instanceof Error ? err.message : String(err);
          callbacks.onItemUpdate({ ...item });
        }
      }

      callbacks.onComplete(items);
    } catch (err) {
      callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    }
  })();

  return { setId, seed, items, cancel };
}

function buildFinalPrompt(
  userPrompt: string,
  _variationDescriptor: string,
  composition?: CompositionId,
  studio?: StudioSettings,
): string {
  const sceneAnchor = buildSceneAnchor(
    composition,
    studio ?? DEFAULT_STUDIO_SETTINGS,
  );
  const trimmed = userPrompt.trim();
  const base = trimmed.length > 0
    ? `${trimmed}\n\n${sceneAnchor}`
    : sceneAnchor;
  // The variation descriptor is ALSO appended on the server in the edge
  // function (when variationDescriptor is passed), so we only need the scene
  // anchor + user prompt here. Returning just the base keeps the wire
  // payload small and avoids double-injection.
  return base;
}

function extractErrorMessage(error: unknown): string {
  if (!error) return "Unknown error";
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const msg = (error as { message?: unknown }).message;
    if (typeof msg === "string") return msg;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
