/**
 * Thin client for the Best Bottles Convex project from madison-app.
 *
 * Routes every query through the `bestbottles-convex` Supabase edge function
 * so the Convex deployment URL stays server-side and browser CORS is not a
 * concern. See `supabase/functions/bestbottles-convex/index.ts`.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  getStaticBestBottlesCatalogGroups,
  getStaticBestBottlesCatalogProducts,
  getStaticBestBottlesProductsByFamily,
} from "@/lib/bestBottlesCatalogFallback";

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
  try {
    const result = await invoke<Product[] | null>("products:getByFamily", { family });
    return result ?? [];
  } catch (error) {
    console.warn("[bestBottles] products:getByFamily unavailable; using static catalog fallback", error);
    return await getStaticBestBottlesProductsByFamily(family);
  }
}

export async function getProductGroupsByFamily(family: string): Promise<ProductGroup[]> {
  try {
    const result = await invoke<ProductGroup[] | null>("products:getProductGroupsByFamily", { family });
    return result ?? [];
  } catch (error) {
    console.warn(
      "[bestBottles] products:getProductGroupsByFamily unavailable; using static product group fallback",
      error,
    );
    const target = family.trim().toLowerCase();
    const groups = await getStaticBestBottlesCatalogGroups(0);
    return groups.filter((group) => group.family.trim().toLowerCase() === target);
  }
}

export async function getBestBottlesCatalogGroups(limit = 1000): Promise<ProductGroup[]> {
  try {
    const result = await invoke<ProductGroup[] | null>("products:getCatalogGroups", { limit });
    return result ?? [];
  } catch (error) {
    console.warn("[bestBottles] products:getCatalogGroups unavailable; using static product group fallback", error);
    return await getStaticBestBottlesCatalogGroups(limit);
  }
}

export async function getBestBottlesCatalogProducts(limit = 3000): Promise<Product[]> {
  try {
    const result = await invoke<Product[] | null>("products:getCatalogProducts", { limit });
    return result ?? [];
  } catch (error) {
    console.warn("[bestBottles] products:getCatalogProducts unavailable; using static catalog fallback", error);
    return await getStaticBestBottlesCatalogProducts(limit);
  }
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

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const current = nextIndex++;
      results[current] = await mapper(items[current]);
    }
  });
  await Promise.all(workers);
  return results;
}

function normalizeThread(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/[.\s_/]+/g, "-") ?? null;
}

function sameThread(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const l = normalizeThread(left);
  const r = normalizeThread(right);
  return !l || !r || l === r;
}

function normalizeColor(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

function sameGroupColor(
  productColor: string | null | undefined,
  groupColor: string | null | undefined,
): boolean {
  const group = normalizeColor(groupColor);
  if (!group || group === "mixed") return true;
  return normalizeColor(productColor) === group;
}

function uniqueProductsByGraceSku(products: Product[]): Product[] {
  const seen = new Set<string>();
  const unique: Product[] = [];
  for (const product of products) {
    const key = product.graceSku?.trim().toUpperCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(product);
  }
  return unique;
}

function filterApplicatorSiblingVariants(group: ProductGroup, products: Product[]): Product[] {
  return products.filter((product) => {
    if (product.productGroupId && product.productGroupId === group._id) return true;
    return (
      product.capacityMl === group.capacityMl &&
      sameGroupColor(product.color, group.color) &&
      sameThread(product.neckThreadSize, group.neckThreadSize)
    );
  });
}

async function getStaticFamilyProducts(family: string): Promise<Product[]> {
  try {
    return await getStaticBestBottlesProductsByFamily(family);
  } catch (error) {
    console.warn("[bestBottles] static catalog fallback unavailable", error);
    return [];
  }
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
 * productGroups), then fetch each lightweight sibling group by slug. We do
 * not use `products:getByFamily` here because Best Bottles caps that query at
 * 100 rows to avoid Convex read limits; Cylinder alone is 300+ SKUs, so that
 * cap silently drops valid 9ml/13-415/color variants from Madison Studio.
 */
export async function getProductGroupWithApplicatorSiblings(
  slug: string,
): Promise<ExpandedProductGroupResult | null> {
  const primary = await getProductGroup(slug);
  if (!primary) return null;

  const { group } = primary;
  let familyGroups: ProductGroup[] = [];
  try {
    familyGroups = await getProductGroupsByFamily(group.family);
  } catch (error) {
    console.warn(
      "[bestBottles] products:getProductGroupsByFamily unavailable; falling back to capped products:getByFamily",
      error,
    );
    const [convexFamilyProducts, staticFamilyProducts] = await Promise.all([
      getProductsByFamily(group.family),
      getStaticFamilyProducts(group.family),
    ]);
    const familyProducts = uniqueProductsByGraceSku([
      ...convexFamilyProducts,
      ...staticFamilyProducts,
    ]);
    const allVariants = filterApplicatorSiblingVariants(group, familyProducts);
    return buildExpandedProductGroupResult(group, allVariants, familyProducts);
  }
  const groupsToLoad = familyGroups.length > 0 ? familyGroups : [group];
  const groupResults = await mapWithConcurrency(groupsToLoad, 8, async (familyGroup) => {
    if (familyGroup.slug === group.slug) return primary;
    return getProductGroup(familyGroup.slug);
  });
  const [staticFamilyProducts] = await Promise.all([
    getStaticFamilyProducts(group.family),
  ]);
  const familyProducts = uniqueProductsByGraceSku([
    ...groupResults.flatMap((result) => result?.variants ?? []),
    ...staticFamilyProducts,
  ]);

  const allVariants = filterApplicatorSiblingVariants(group, familyProducts);

  return buildExpandedProductGroupResult(group, allVariants, familyProducts);
}

function buildExpandedProductGroupResult(
  group: ProductGroup,
  allVariants: Product[],
  familyProducts: Product[],
): ExpandedProductGroupResult {
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
