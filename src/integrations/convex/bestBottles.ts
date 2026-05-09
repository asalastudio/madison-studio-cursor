/**
 * Thin client for the Best Bottles Convex project from madison-app.
 *
 * Routes every query through the `bestbottles-convex` Supabase edge function
 * so the Convex deployment URL stays server-side and browser CORS is not a
 * concern. See `supabase/functions/bestbottles-convex/index.ts`.
 */

import { supabase } from "@/integrations/supabase/client";

/** Shape of `productGroups` rows in best-bottles-website/convex/schema.ts. */
export interface ProductGroup {
  _id: string;
  _creationTime: number;
  slug: string;
  displayName: string;
  family: string;
  capacity: string | null;
  capacityMl: number | null;
  color: string | null;
  category: string;
  bottleCollection: string | null;
  neckThreadSize: string | null;
  variantCount: number;
  priceRangeMin: number | null;
  priceRangeMax: number | null;
  applicatorTypes?: string[];
  shopifyProductId?: string | null;
  sanitySlug?: string | null;
  heroImageUrl?: string | null;
  primaryGraceSku?: string | null;
  primaryWebsiteSku?: string | null;
  groupDescription?: string | null;
  paperDollFamilyKey?: string | null;
}

/** Narrow subset of `products` row used by madison-app. Mirrors ConvexProductLike
 * in `src/lib/product-image/skuInjector.ts`, plus identifiers + a few extra
 * fields the Studio page surfaces. */
export interface Product {
  _id: string;
  websiteSku: string;
  graceSku: string;
  productId?: string | null;
  category: string;
  family: string | null;
  color: string | null;
  capacity: string | null;
  capacityMl: number | null;
  capacityOz: number | null;
  heightWithCap: string | null;
  heightWithoutCap: string | null;
  diameter: string | null;
  neckThreadSize: string | null;
  applicator: string | null;
  capStyle: string | null;
  capColor: string | null;
  trimColor: string | null;
  bottleCollection: string | null;
  itemName: string;
  itemDescription: string | null;
  useCaseDescription?: string | null;
  imageUrl?: string | null;
  stockStatus: string | null;
  verified: boolean;
  productGroupId?: string | null;
}

async function invoke<T>(path: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("bestbottles-convex", {
    body: { path, args },
  });
  if (error) {
    let message = error.message || "Best Bottles Convex query failed.";
    try {
      const ctx = (error as { context?: { json?: () => Promise<unknown> } }).context;
      if (ctx && typeof ctx.json === "function") {
        const body = await ctx.json();
        if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
          message = body.error;
        }
      }
    } catch {
      // fall through
    }
    throw new Error(message);
  }
  if (!data || typeof data !== "object" || !("value" in data)) {
    throw new Error("Edge function returned no value.");
  }
  return (data as { value: T }).value;
}

export interface ProductGroupResult {
  group: ProductGroup;
  variants: Product[];
}

export async function getProductGroup(slug: string): Promise<ProductGroupResult | null> {
  return invoke<ProductGroupResult | null>("products:getProductGroup", { slug });
}

export async function getProductBySku(graceSku: string): Promise<Product | null> {
  return invoke<Product | null>("products:getBySku", { graceSku });
}

export async function getProductsByFamily(family: string): Promise<Product[]> {
  const result = await invoke<Product[] | null>("products:getByFamily", { family });
  return result ?? [];
}

export async function getBestBottlesCatalogProducts(limit = 3000): Promise<Product[]> {
  const result = await invoke<Product[] | null>("products:getCatalogProducts", { limit });
  return result ?? [];
}

export interface ApplicatorBucket {
  applicator: string;
  count: number;
  variants: Product[];
}

export interface ExpandedProductGroupResult {
  /** The primary productGroup the Studio was opened on. */
  group: ProductGroup;
  /** Every variant across every applicator sibling in the family+capacity+color cohort. */
  variants: Product[];
  /** Same variants, bucketed by applicator for grouped rendering in the UI. */
  applicatorBuckets: ApplicatorBucket[];
  /**
   * Every variant across the ENTIRE family (any capacity, any color). The
   * Masters tab uses this for reference-folder coverage analysis: when an
   * operator drops a folder spanning multiple capacities, files for the
   * non-current capacity should still bind correctly rather than appearing
   * as orphans purely because the current group view is filtered.
   */
  allFamilyProducts: Product[];
}

/**
 * Fetch a productGroup plus every variant across its applicator siblings.
 *
 * Convex productGroups are keyed by (family × capacity × color × applicator),
 * so a single "shape" like Empire 50ml Clear has 6 separate productGroups
 * (perfume spray, lotion pump, dropper, bulb sprayer, bulb sprayer w/ tassel,
 * reducer). Operators need to see ALL of them in one Studio session.
 *
 * Implementation: 2 parallel Convex calls (primary group + family-wide
 * products), then filter the family list client-side to (capacityMl + color)
 * matching the primary group. Simpler and faster than N+1 per-sibling fetches.
 */
export async function getProductGroupWithApplicatorSiblings(
  slug: string,
): Promise<ExpandedProductGroupResult | null> {
  const primary = await getProductGroup(slug);
  if (!primary) return null;

  const { group } = primary;
  const familyProducts = await getProductsByFamily(group.family);

  const allVariants = familyProducts.filter(
    (p) =>
      p.capacityMl === group.capacityMl &&
      (p.color ?? null) === (group.color ?? null),
  );

  // Bucket by applicator, preserving deterministic ordering by descending count.
  const byApp = new Map<string, Product[]>();
  for (const v of allVariants) {
    const key = v.applicator ?? "Unspecified";
    const arr = byApp.get(key) ?? [];
    arr.push(v);
    byApp.set(key, arr);
  }
  const applicatorBuckets: ApplicatorBucket[] = Array.from(byApp.entries())
    .map(([applicator, variants]) => ({
      applicator,
      count: variants.length,
      variants,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    group,
    variants: allVariants,
    applicatorBuckets,
    allFamilyProducts: familyProducts,
  };
}
