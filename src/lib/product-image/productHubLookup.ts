/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * PRODUCT HUB LOOKUP
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Resolves a Grace SKU (or website SKU) to its matching `product_hubs` row
 * in Madison's Supabase. Used by the image-generation pipelines to fetch
 * the canonical Bottle Specs payload that feeds prompt assembly.
 *
 * Lookup strategy (in order):
 *   1. Direct match: product_hubs.sku === graceSku
 *      (works for per-SKU imports, but our import groups SKUs into hubs)
 *   2. Variant match: any variant inside product_hubs.variants[].sku
 *      matches the given Grace SKU. This is the common path because the
 *      Best Bottles importer groups 2,321 Grace SKUs into 139 hubs and
 *      stores per-SKU details in the variants JSONB array.
 *   3. Legacy variant match: product_hubs.metadata.variants[].sku
 *   4. Family + capacity + color match: synthesize the group SKU
 *      "GROUP-{FAMILY}-{SIZE}ML-{COLOR}" and match directly. Fast fallback
 *      when only the SKU's parent attributes are known.
 *
 * Returns null when no match is found — the caller falls back to the
 * legacy Convex-based prompt path.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ProductHubLike } from "./productHubPromptInjector";

// ─── Org config ─────────────────────────────────────────────────────────────

/**
 * Best Bottles organization UUID. Hardcoded here too because the lookup
 * runs from the image-gen pipeline (no React context). Kept in sync with
 * the constant in ProductHub.tsx and the importer script.
 */
export const BEST_BOTTLES_ORG_ID = "4ab1ac72-cd7e-4faf-9152-5aa5f2862411";

// ─── Synthetic SKU helpers (must match the importer's familyCode/colorCode) ──

const COLOR_MAP: Record<string, string> = {
  Clear: "CLR", Frosted: "FRS", "Cobalt Blue": "CBL", Amber: "AMB",
  Swirl: "SWR", Black: "BLK", Green: "GRN", Pink: "PNK",
};

function familyCode(family: string | null | undefined): string {
  if (!family) return "UNK";
  return family.toUpperCase().replace(/[\s/]+/g, "-").replace(/[^A-Z0-9-]/g, "") || "UNK";
}

function colorCode(color: string | null | undefined): string {
  if (!color) return "XXX";
  if (COLOR_MAP[color]) return COLOR_MAP[color];
  return color.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) || "XXX";
}

function buildGroupSku(family: string, capacityMl: number | null, color: string | null): string {
  const cap = capacityMl != null && capacityMl > 0 ? `${Math.round(capacityMl)}ML` : capacityMl === 0 ? "0ML" : "XML";
  return `GROUP-${familyCode(family)}-${cap}-${colorCode(color)}`;
}

// ─── Lookup functions ───────────────────────────────────────────────────────

export interface HubLookupHints {
  /** Bottle family name from the SKU's catalog row, e.g. "Empire" */
  family?: string | null;
  /** Capacity in ml, e.g. 50 */
  capacityMl?: number | null;
  /** Glass color, e.g. "Clear" */
  color?: string | null;
}

/**
 * Fetch the Product Hub row matching a Grace SKU.
 *
 * @param graceSku - The Grace SKU to look up (e.g. "GB-EMP-CLR-50ML-AST-RED")
 * @param hints - Optional family/capacity/color hints that enable the
 *                synthetic-group fallback when variant lookup misses
 * @param organizationId - Defaults to Best Bottles. Override for other tenants.
 * @returns The matching product_hubs row or null if not found.
 */
export async function fetchProductHubBySku(
  graceSku: string,
  hints?: HubLookupHints,
  organizationId: string = BEST_BOTTLES_ORG_ID,
): Promise<ProductHubLike | null> {
  if (!graceSku) return null;

  // Strategy 1 — direct sku match (rare for grouped imports but possible)
  const direct = await supabase
    .from("product_hubs")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("sku", graceSku)
    .maybeSingle();
  if (direct.data) return direct.data as ProductHubLike;

  // Strategy 2 — variant match via JSONB containment.
  // variants is an array of {sku: ..., ...} objects.
  // Postgres JSONB lets us query "any variant has this sku" via @>.
  const variantQuery = JSON.stringify([{ sku: graceSku }]);
  const topLevelVariantMatch = await supabase
    .from("product_hubs")
    .select("*")
    .eq("organization_id", organizationId)
    .filter("variants", "cs", variantQuery)
    .limit(1)
    .maybeSingle();
  if (topLevelVariantMatch.data) return topLevelVariantMatch.data as ProductHubLike;

  // Strategy 3 — legacy grouped imports stored variants under metadata.
  const variantMatch = await supabase
    .from("product_hubs")
    .select("*")
    .eq("organization_id", organizationId)
    .filter("metadata->variants", "cs", variantQuery)
    .limit(1)
    .maybeSingle();
  if (variantMatch.data) return variantMatch.data as ProductHubLike;

  // Strategy 4 — synthesize the group SKU from hints (fastest path when
  // the caller already knows the parent family+capacity+color).
  if (hints?.family) {
    const groupSku = buildGroupSku(hints.family, hints.capacityMl ?? null, hints.color ?? null);
    const groupMatch = await supabase
      .from("product_hubs")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("sku", groupSku)
      .maybeSingle();
    if (groupMatch.data) return groupMatch.data as ProductHubLike;
  }

  return null;
}

/**
 * Batch lookup — resolves N Grace SKUs to their matching hubs in a single
 * query. Returns a Map keyed by Grace SKU. Missing SKUs are absent from the
 * map (not null entries). Useful for grid/batch generation where each
 * preview tile needs its own hub.
 */
export async function fetchProductHubsBySkus(
  graceSkus: string[],
  organizationId: string = BEST_BOTTLES_ORG_ID,
): Promise<Map<string, ProductHubLike>> {
  const result = new Map<string, ProductHubLike>();
  if (graceSkus.length === 0) return result;

  // Pull every hub for the org once (cheap — only 139 rows for BB) and
  // index variants by SKU client-side. Avoids N round-trips.
  const all = await supabase
    .from("product_hubs")
    .select("*")
    .eq("organization_id", organizationId);

  if (!all.data) return result;

  const skuSet = new Set(graceSkus);
  for (const hub of all.data as ProductHubLike[]) {
    // Direct match (rare)
    if (hub.sku && skuSet.has(hub.sku)) result.set(hub.sku, hub);

    // Variant match
    const topLevelVariants = normalizeVariants(hub.variants);
    for (const v of topLevelVariants) {
      if (v.sku && skuSet.has(v.sku) && !result.has(v.sku)) {
        result.set(v.sku, hub);
      }
    }

    // Legacy metadata variant match
    const meta =
      typeof hub.metadata === "string"
        ? (safeParse(hub.metadata) as Record<string, unknown> | null)
        : (hub.metadata as Record<string, unknown> | null);
    const variants = normalizeVariants(meta?.variants);
    for (const v of variants) {
      if (v.sku && skuSet.has(v.sku) && !result.has(v.sku)) {
        result.set(v.sku, hub);
      }
    }
  }

  return result;
}

function safeParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}

function normalizeVariants(value: unknown): Array<{ sku?: string }> {
  if (Array.isArray(value)) return value as Array<{ sku?: string }>;
  if (typeof value === "string") {
    const parsed = safeParse(value);
    return Array.isArray(parsed) ? parsed as Array<{ sku?: string }> : [];
  }
  return [];
}

// ─── React hook ─────────────────────────────────────────────────────────────

export interface UseProductHubResult {
  hub: ProductHubLike | null;
  loading: boolean;
  error: string | null;
}

/**
 * React hook that resolves a Grace SKU to a Product Hub row. Re-fetches
 * when the SKU changes. Returns hub=null while loading or if not found.
 *
 * Use in image-gen panels:
 *   const { hub } = useProductHub(selectedSku?.graceSku, {
 *     family: selectedSku?.family,
 *     capacityMl: selectedSku?.capacityMl,
 *     color: selectedSku?.color,
 *   });
 *   const assembled = assemblePrompt({ presetId, sku: selectedSku, productHub: hub });
 */
export function useProductHub(
  graceSku: string | null | undefined,
  hints?: HubLookupHints,
  organizationId: string = BEST_BOTTLES_ORG_ID,
): UseProductHubResult {
  const [state, setState] = useState<UseProductHubResult>({
    hub: null,
    loading: false,
    error: null,
  });

  // Stable JSON key for hint deps so we don't refetch on identical objects
  const hintKey = JSON.stringify(hints ?? {});

  useEffect(() => {
    if (!graceSku) {
      setState({ hub: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState({ hub: null, loading: true, error: null });
    fetchProductHubBySku(graceSku, hints, organizationId)
      .then((hub) => {
        if (cancelled) return;
        setState({ hub, loading: false, error: null });
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setState({ hub: null, loading: false, error: err.message });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graceSku, hintKey, organizationId]);

  return state;
}

// ─── Feature flag ───────────────────────────────────────────────────────────

/**
 * Opt-in feature flag for Product-Hub-based prompts. When OFF (default),
 * the image-gen pipeline uses the legacy Convex skuInjector path — same
 * behavior as before this change. When ON, the pipeline fetches the
 * matching hub and passes it to assemblePrompt, which switches the SKU
 * DATA layer to the richer schematic-aware block.
 *
 * Stored in localStorage so it persists per-operator. UI surface lives
 * in the Dark Room sidebar (one-line checkbox).
 *
 * Default OFF reasoning: most product_hubs rows are sparsely populated
 * right now (we just imported the basics from Convex). Until operators
 * fill in schematic dimensions, the legacy Convex prompt is denser. Flip
 * the default once the hub data quality matches or exceeds Convex.
 */
const FLAG_KEY = "madison.useProductHubPrompts";

export function getUseProductHubPrompts(): boolean {
  if (typeof window === "undefined") return false;
  const stored = window.localStorage.getItem(FLAG_KEY);
  return stored === "true";
}

export function setUseProductHubPrompts(enabled: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FLAG_KEY, enabled ? "true" : "false");
  // Notify any listening hooks
  window.dispatchEvent(new CustomEvent("madison:flag-change", { detail: { flag: FLAG_KEY, value: enabled } }));
}

/** React hook that reads the flag + subscribes to changes from setUseProductHubPrompts. */
export function useUseProductHubPrompts(): [boolean, (v: boolean) => void] {
  const [enabled, setEnabled] = useState<boolean>(() => getUseProductHubPrompts());
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ flag: string; value: boolean }>).detail;
      if (detail?.flag === FLAG_KEY) setEnabled(detail.value);
    };
    window.addEventListener("madison:flag-change", handler);
    return () => window.removeEventListener("madison:flag-change", handler);
  }, []);
  return [enabled, setUseProductHubPrompts];
}
