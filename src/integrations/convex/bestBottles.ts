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
import {
  canonicalStudioProductGroupSlug,
  studioProductGroupSlugCandidates,
} from "@/lib/bestBottlesStudioSlug";

export { canonicalStudioProductGroupSlug, studioProductGroupSlugCandidates };

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
  imageUrlCapOff?: string | null;
  stockStatus: string | null;
  verified: boolean;
  productGroupId?: string | null;
  /** Static Madison pipeline crosswalk fallback; live Convex rows use productGroupId. */
  productGroupSlug?: string | null;
  /** Shopify export / legacy variant SKU when it differs from Grace SKU. */
  shopifySku?: string | null;
}

interface PaginatedResult<T> {
  page: T[];
  isDone: boolean;
  continueCursor: string;
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

export interface StudioFamilyCapacityBucket {
  capacityKey: string;
  capacityLabel: string;
  capacityMl: number | null;
  groups: ProductGroup[];
}

export function studioFamilyCapacityKey(group: Pick<ProductGroup, "capacity" | "capacityMl">): string {
  if (group.capacityMl != null && Number.isFinite(group.capacityMl)) {
    return String(group.capacityMl);
  }
  return (group.capacity ?? "unknown").trim().toLowerCase() || "unknown";
}

export function studioFamilyCapacityLabel(group: Pick<ProductGroup, "capacity" | "capacityMl">): string {
  const labeled = group.capacity?.trim();
  if (labeled) return labeled;
  if (group.capacityMl != null && Number.isFinite(group.capacityMl)) {
    return `${group.capacityMl} ml`;
  }
  return "Unknown";
}

export function groupStudioFamilyGroupsByCapacity(
  groups: readonly ProductGroup[],
): StudioFamilyCapacityBucket[] {
  const buckets = new Map<string, StudioFamilyCapacityBucket>();
  for (const group of groups) {
    const capacityKey = studioFamilyCapacityKey(group);
    const existing = buckets.get(capacityKey);
    if (existing) {
      existing.groups.push(group);
      continue;
    }
    buckets.set(capacityKey, {
      capacityKey,
      capacityLabel: studioFamilyCapacityLabel(group),
      capacityMl: group.capacityMl,
      groups: [group],
    });
  }

  return Array.from(buckets.values())
    .map((bucket) => ({
      ...bucket,
      groups: [...bucket.groups].sort((left, right) =>
        left.displayName.localeCompare(right.displayName),
      ),
    }))
    .sort((left, right) => {
      const leftMl = left.capacityMl;
      const rightMl = right.capacityMl;
      if (leftMl != null && rightMl != null && leftMl !== rightMl) return leftMl - rightMl;
      if (leftMl != null && rightMl == null) return -1;
      if (leftMl == null && rightMl != null) return 1;
      return left.capacityLabel.localeCompare(right.capacityLabel);
    });
}

export async function getProductGroup(slug: string): Promise<ProductGroupResult | null> {
  for (const candidate of studioProductGroupSlugCandidates(slug)) {
    const result = await invoke<ProductGroupResult | null>("products:getProductGroup", { slug: candidate });
    if (result) return result;
  }
  return null;
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
    const products: Product[] = [];
    let cursor: string | null = null;
    while (products.length < limit) {
      const result = await invoke<PaginatedResult<Product> | null>("products:getCatalogProductIndexPage", {
        cursor,
        limit: Math.min(150, limit - products.length),
      });
      if (!result) break;
      products.push(...result.page);
      if (result.isDone) break;
      cursor = result.continueCursor;
      if (!cursor) break;
    }
    return products;
  } catch (error) {
    console.warn("[bestBottles] products:getCatalogProductIndexPage unavailable; using static catalog fallback", error);
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
  /** Every Convex product group in this family, used to switch sizes in Studio. */
  familyGroups: ProductGroup[];
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
    const catalogGroups = await getBestBottlesCatalogGroups();
    const familyKey = group.family.trim().toLowerCase();
    familyGroups = catalogGroups.filter(
      (familyGroup) => familyGroup.family.trim().toLowerCase() === familyKey,
    );
    const allVariants = filterApplicatorSiblingVariants(group, familyProducts);
    return buildExpandedProductGroupResult(group, allVariants, familyProducts, familyGroups);
  }
  if (familyGroups.length === 0) {
    const catalogGroups = await getBestBottlesCatalogGroups();
    const familyKey = group.family.trim().toLowerCase();
    familyGroups = catalogGroups.filter(
      (familyGroup) => familyGroup.family.trim().toLowerCase() === familyKey,
    );
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

  return buildExpandedProductGroupResult(group, allVariants, familyProducts, familyGroups);
}

function buildExpandedProductGroupResult(
  group: ProductGroup,
  allVariants: Product[],
  familyProducts: Product[],
  familyGroups: ProductGroup[] = [group],
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

  const uniqueFamilyGroups = new Map<string, ProductGroup>();
  for (const familyGroup of familyGroups.length > 0 ? familyGroups : [group]) {
    uniqueFamilyGroups.set(familyGroup.slug, familyGroup);
  }
  if (!uniqueFamilyGroups.has(group.slug)) {
    uniqueFamilyGroups.set(group.slug, group);
  }

  return {
    group,
    variants: allVariants,
    applicatorBuckets,
    allFamilyProducts: familyProducts,
    familyGroups: Array.from(uniqueFamilyGroups.values()),
  };
}
