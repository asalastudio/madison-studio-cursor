/**
 * Turn a scanned hero-reference folder into the Studio working set.
 * The uploaded files, not the current product-group picker, decide
 * which SKUs appear for catalog-hero work.
 */

import { buildBestBottlesScaleCalibrationKeys } from "./bestBottlesScaleCalibrationModel";

export type LoadedCatalogHeroProduct = {
  graceSku: string;
  websiteSku?: string | null;
  productGroupId?: string | null;
  productGroupSlug?: string | null;
  family?: string | null;
  capacity?: string | null;
  capacityMl?: number | null;
  color?: string | null;
  applicator?: string | null;
  capColor?: string | null;
  itemName?: string | null;
  heightWithoutCap?: string | number | null;
  diameter?: string | number | null;
  neckThreadSize?: string | null;
};

export type LoadedCatalogHero = {
  graceSku: string;
  productGroupId: string;
  productGroupSlug: string;
  product: LoadedCatalogHeroProduct;
  imageUrl: string;
  name: string;
  capacityLabel: string;
  capacityKey: string;
  geometryKey: string;
  topologyKey: string;
};

export type LoadedCatalogHeroFolderEntry = {
  matchKey: string;
  url: string;
  name: string;
};

export type LoadedCatalogHeroProductGroup = {
  _id: string;
  slug: string;
};

export type LoadedCatalogHeroMembership =
  | {
      ok: true;
      productGroupId: string;
      productGroupSlug: string;
    }
  | {
      ok: false;
      reason: string;
    };

function normalizeSku(value: string): string {
  return value.trim().toUpperCase();
}

function folderBaseSku(matchKey: string): string {
  return normalizeSku(matchKey.split("--")[0] ?? matchKey);
}

export function resolveLoadedCatalogHeroMembership(
  product: LoadedCatalogHeroProduct,
  productGroups: readonly LoadedCatalogHeroProductGroup[],
): LoadedCatalogHeroMembership {
  const groupsById = new Map(
    productGroups.map((group) => [group._id, group] as const),
  );
  const groupsBySlug = new Map(
    productGroups.map((group) => [group.slug.trim().toLowerCase(), group] as const),
  );
  const groupById = product.productGroupId
    ? groupsById.get(product.productGroupId)
    : undefined;
  const groupBySlug = product.productGroupSlug
    ? groupsBySlug.get(product.productGroupSlug.trim().toLowerCase())
    : undefined;

  if (product.productGroupId && !groupById) {
    return {
      ok: false,
      reason: `SKU ${product.graceSku} references an unknown product group ID.`,
    };
  }
  if (product.productGroupSlug && !groupBySlug) {
    return {
      ok: false,
      reason: `SKU ${product.graceSku} references an unknown product group slug.`,
    };
  }
  if (groupById && groupBySlug && groupById._id !== groupBySlug._id) {
    return {
      ok: false,
      reason: `SKU ${product.graceSku} has conflicting product group membership.`,
    };
  }

  const group = groupById ?? groupBySlug;
  if (!group) {
    return {
      ok: false,
      reason: `SKU ${product.graceSku} has no exact product group membership.`,
    };
  }
  return {
    ok: true,
    productGroupId: group._id,
    productGroupSlug: group.slug,
  };
}

export function loadedHeroCapacityLabel(
  product: Pick<LoadedCatalogHeroProduct, "capacity" | "capacityMl">,
): string {
  const labeled = product.capacity?.trim();
  if (labeled) return labeled;
  if (product.capacityMl != null && Number.isFinite(product.capacityMl)) {
    return `${product.capacityMl} ml`;
  }
  return "Unknown";
}

export function loadedHeroCapacityKey(
  product: Pick<LoadedCatalogHeroProduct, "capacity" | "capacityMl">,
): string {
  if (product.capacityMl != null && Number.isFinite(product.capacityMl)) {
    return String(product.capacityMl);
  }
  return (product.capacity ?? "unknown").trim().toLowerCase() || "unknown";
}

export function resolveLoadedCatalogHeroes<T extends LoadedCatalogHeroProduct>(input: {
  folderEntries: readonly LoadedCatalogHeroFolderEntry[];
  products: readonly T[];
  productGroups: readonly LoadedCatalogHeroProductGroup[];
}): Array<LoadedCatalogHero & { product: T }> {
  const productsBySku = new Map<string, T[]>();
  for (const product of input.products) {
    const sku = normalizeSku(product.graceSku);
    if (!sku) continue;
    const matches = productsBySku.get(sku) ?? [];
    matches.push(product);
    productsBySku.set(sku, matches);
  }

  const heroes = new Map<string, LoadedCatalogHero & { product: T }>();
  for (const entry of input.folderEntries) {
    const graceSku = folderBaseSku(entry.matchKey);
    const products = productsBySku.get(graceSku) ?? [];
    if (products.length !== 1 || heroes.has(graceSku)) continue;
    const product = products[0]!;
    const membership = resolveLoadedCatalogHeroMembership(
      product,
      input.productGroups,
    );
    if (!membership.ok) continue;
    const calibrationKeys = buildBestBottlesScaleCalibrationKeys({
      family: product.family,
      heightWithoutCap: product.heightWithoutCap,
      diameter: product.diameter,
      neckThreadSize: product.neckThreadSize,
      applicator: product.applicator,
      capState:
        !product.applicator ||
        product.applicator.trim().toLowerCase() === "cap/closure"
          ? "assembled"
          : "detached",
    });
    if (
      calibrationKeys.geometryKey.includes("unknown") ||
      calibrationKeys.topologyKey.includes("unknown")
    ) {
      continue;
    }
    heroes.set(graceSku, {
      graceSku,
      productGroupId: membership.productGroupId,
      productGroupSlug: membership.productGroupSlug,
      product,
      imageUrl: entry.url,
      name: entry.name,
      capacityLabel: loadedHeroCapacityLabel(product),
      capacityKey: loadedHeroCapacityKey(product),
      geometryKey: calibrationKeys.geometryKey,
      topologyKey: calibrationKeys.topologyKey,
    });
  }

  return Array.from(heroes.values()).sort((left, right) => {
    const leftMl = left.product.capacityMl;
    const rightMl = right.product.capacityMl;
    if (leftMl != null && rightMl != null && leftMl !== rightMl) return leftMl - rightMl;
    return left.graceSku.localeCompare(right.graceSku);
  });
}
