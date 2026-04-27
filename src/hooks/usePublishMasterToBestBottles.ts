/**
 * Hook for publishing approved Madison masters to the Best Bottles website.
 *
 * Calls the `bestbottles-publish-master` edge function which:
 *   1. Uploads the image to Best Bottles' Sanity image-asset CDN
 *   2. Patches Convex `products.imageUrl` with the Sanity CDN URL
 *   3. Optionally lifts to `productGroups.heroImageUrl` (group catalog hero)
 *   4. Tags the Madison Library row with provenance markers so the legacy
 *      publish-heroes script can identify Madison-authored assets
 *
 * Single-publish (`publishOne`) is the operator's normal flow — generate,
 * approve, publish. Bulk (`publishBatch`) is for "publish all approved" UI
 * that fires multiple SKUs sequentially through the same edge function.
 */

import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface PublishItem {
  imageId: string;
  graceSku: string;
  /** Lift this image to `productGroups.heroImageUrl` in addition to per-SKU. */
  setAsGroupHero?: boolean;
  /** Required when `setAsGroupHero` is true. */
  groupSlug?: string | null;
}

export interface PublishResult {
  imageId: string;
  graceSku: string;
  ok: boolean;
  websiteSku?: string;
  sanityAssetId?: string;
  cdnUrl?: string;
  groupHeroSet?: boolean;
  error?: string;
  step?: string;
}

export interface PublishBatchProgress {
  current: number;
  total: number;
  currentSku: string;
}

export function usePublishMasterToBestBottles() {
  const { toast } = useToast();
  const [isPublishing, setIsPublishing] = useState(false);
  const [batchProgress, setBatchProgress] = useState<PublishBatchProgress | null>(null);
  const [lastResult, setLastResult] = useState<PublishResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const publishOne = async (item: PublishItem): Promise<PublishResult | null> => {
    setIsPublishing(true);
    setError(null);
    setLastResult(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        "bestbottles-publish-master",
        { body: item },
      );
      if (invokeError) throw invokeError;
      const result: PublishResult = (data?.results?.[0] ?? data) as PublishResult;
      setLastResult(result);
      if (result.ok) {
        toast({
          title: "Published to Best Bottles",
          description: `${result.websiteSku ?? item.graceSku} is live on bestbottles.com${
            result.groupHeroSet ? " (also set as group hero)" : ""
          }.`,
        });
      } else {
        const message = `${result.error ?? "Unknown error"} (step: ${result.step ?? "?"})`;
        setError(message);
        toast({
          title: "Publish failed",
          description: message.slice(0, 240),
          variant: "destructive",
        });
      }
      return result;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      toast({
        title: "Publish failed",
        description: message.slice(0, 240),
        variant: "destructive",
      });
      return null;
    } finally {
      setIsPublishing(false);
    }
  };

  /**
   * Sequential bulk publish. The edge function itself loops with a 200ms
   * throttle, but invoking it once with a batch payload keeps the round-trip
   * to a single edge-function call (no per-item Vercel function cold-start).
   * For UX progress we run client-side iteration so the operator sees each
   * SKU's publish status as it lands. Sequential, ~200ms gap, mirrors
   * `Generate all matched`.
   */
  const publishBatch = async (
    items: PublishItem[],
  ): Promise<PublishResult[]> => {
    if (items.length === 0) return [];
    setIsPublishing(true);
    setError(null);
    const results: PublishResult[] = [];
    try {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        setBatchProgress({
          current: i + 1,
          total: items.length,
          currentSku: item.graceSku,
        });
        const result = await publishOneSilently(item);
        results.push(result);
        // Small client-side gap between calls — the edge function also
        // throttles, but this keeps the UI breathing and avoids hammering.
        if (i < items.length - 1) await new Promise((r) => setTimeout(r, 150));
      }
      const okCount = results.filter((r) => r.ok).length;
      const failCount = results.length - okCount;
      toast({
        title: failCount > 0 ? "Bulk publish finished with errors" : "Bulk publish complete",
        description:
          failCount > 0
            ? `${okCount} published · ${failCount} failed (${results
                .filter((r) => !r.ok)
                .map((r) => r.graceSku)
                .join(", ")})`
            : `Published ${okCount} masters to Best Bottles.`,
        variant: failCount > 0 ? "destructive" : "default",
      });
    } finally {
      setBatchProgress(null);
      setIsPublishing(false);
    }
    return results;
  };

  /**
   * Lower-level publish that doesn't fire toasts — used inside the bulk
   * loop so we get one summary toast at the end instead of N spam.
   */
  const publishOneSilently = async (item: PublishItem): Promise<PublishResult> => {
    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        "bestbottles-publish-master",
        { body: item },
      );
      if (invokeError) {
        return {
          imageId: item.imageId,
          graceSku: item.graceSku,
          ok: false,
          error: invokeError.message ?? "invoke error",
        };
      }
      return (data?.results?.[0] ?? data) as PublishResult;
    } catch (e: unknown) {
      return {
        imageId: item.imageId,
        graceSku: item.graceSku,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  };

  const reset = () => {
    setLastResult(null);
    setError(null);
    setBatchProgress(null);
  };

  return {
    publishOne,
    publishBatch,
    isPublishing,
    batchProgress,
    lastResult,
    error,
    reset,
  };
}
