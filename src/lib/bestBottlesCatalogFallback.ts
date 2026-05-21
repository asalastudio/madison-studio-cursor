import type { Product, ProductGroup } from "@/integrations/convex/bestBottles";

interface BestBottlesCatalogLite {
  source?: {
    sourceFile?: string | null;
    generatedAt?: string | null;
    modelVersion?: string | null;
    rowCount?: number | null;
  };
  products?: Product[];
}

interface BestBottlesPipelineGroupLite {
  productGroupSlug?: string;
  displayName?: string;
  family?: string;
  catalogReferencePages?: string;
  category?: string;
  capacityMl?: string | number | null;
  applicatorTypes?: string;
  variantCount?: string | number | null;
  hasGroupHeroImageUrl?: string;
  hasShopifyProductId?: string;
  sampleGraceSkus?: string;
}

interface BestBottlesPipelineProductLite {
  productGroupSlug?: string;
  graceSku?: string;
  websiteSku?: string;
  shopifySku?: string;
  category?: string;
}

interface BestBottlesPipelineUiLite {
  productGroups?: BestBottlesPipelineGroupLite[];
  products?: BestBottlesPipelineProductLite[];
}

const CATALOG_PATH = "/data/best-bottles-catalog-lite.json";
const PIPELINE_UI_PATH = "/data/best-bottles-madison-pipeline-ui.json";

let catalogPromise: Promise<Product[]> | null = null;
let catalogGroupsPromise: Promise<ProductGroup[]> | null = null;
let pipelineUiPromise: Promise<BestBottlesPipelineUiLite> | null = null;

function normalizeFamily(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function publicDataUrl(path: string): string {
  const base = import.meta.env.BASE_URL || "/";
  return `${base.replace(/\/$/, "")}${path}`;
}

function normalizeSlug(value: string | null | undefined): string {
  const raw = value?.trim() ?? "";
  return raw
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function numberOrNull(value: string | number | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function splitList(value: string | null | undefined): string[] {
  return Array.from(
    new Set(
      (value ?? "")
        .split(/[;,]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function firstListItem(value: string | null | undefined): string | null {
  return splitList(value)[0] ?? null;
}

function skuKey(value: string | null | undefined): string {
  return value?.trim().toUpperCase() ?? "";
}

function isComponentPipelineProduct(value: BestBottlesPipelineProductLite): boolean {
  return value.category?.trim().toLowerCase() === "component";
}

function shouldReplacePipelineCrosswalk(
  current: BestBottlesPipelineProductLite | undefined,
  next: BestBottlesPipelineProductLite,
): boolean {
  if (!current) return true;
  const currentHasSlug = Boolean(normalizeSlug(current.productGroupSlug));
  const nextHasSlug = Boolean(normalizeSlug(next.productGroupSlug));
  if (currentHasSlug !== nextHasSlug) return nextHasSlug;
  const currentIsComponent = isComponentPipelineProduct(current);
  const nextIsComponent = isComponentPipelineProduct(next);
  if (currentIsComponent !== nextIsComponent) return !nextIsComponent;
  return false;
}

function buildPipelineProductCrosswalk(
  products: BestBottlesPipelineProductLite[] | null | undefined,
): Map<string, BestBottlesPipelineProductLite> {
  const map = new Map<string, BestBottlesPipelineProductLite>();
  for (const product of products ?? []) {
    for (const sku of [product.graceSku, product.websiteSku, product.shopifySku]) {
      const key = skuKey(sku);
      if (!key) continue;
      if (shouldReplacePipelineCrosswalk(map.get(key), product)) {
        map.set(key, product);
      }
    }
  }
  return map;
}

async function loadBestBottlesPipelineUi(): Promise<BestBottlesPipelineUiLite> {
  if (!pipelineUiPromise) {
    pipelineUiPromise = fetch(publicDataUrl(PIPELINE_UI_PATH), { cache: "force-cache" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Static Best Bottles pipeline UI failed to load (${response.status})`);
        }
        return (await response.json()) as BestBottlesPipelineUiLite;
      })
      .catch((error) => {
        console.warn("[bestBottlesCatalogFallback] pipeline UI unavailable", error);
        return {};
      });
  }
  return pipelineUiPromise;
}

async function loadBestBottlesCatalog(): Promise<Product[]> {
  if (!catalogPromise) {
    catalogPromise = Promise.all([
      fetch(publicDataUrl(CATALOG_PATH), { cache: "force-cache" }),
      loadBestBottlesPipelineUi(),
    ])
      .then(async ([response, pipelineUi]) => {
        if (!response.ok) {
          throw new Error(`Static Best Bottles catalog failed to load (${response.status})`);
        }
        const payload = (await response.json()) as BestBottlesCatalogLite;
        const products = Array.isArray(payload.products) ? payload.products : [];
        const pipelineProductsBySku = buildPipelineProductCrosswalk(pipelineUi.products);

        return products.map((product) => {
          const crosswalk =
            pipelineProductsBySku.get(skuKey(product.graceSku)) ??
            pipelineProductsBySku.get(skuKey(product.websiteSku)) ??
            pipelineProductsBySku.get(skuKey(product.shopifySku));
          const productGroupSlug = normalizeSlug(product.productGroupSlug) || normalizeSlug(crosswalk?.productGroupSlug);
          const shopifySku = product.shopifySku ?? crosswalk?.shopifySku ?? null;
          if (!productGroupSlug && !shopifySku) return product;
          return {
            ...product,
            productGroupSlug: productGroupSlug || product.productGroupSlug || null,
            shopifySku,
          };
        });
      })
      .catch((error) => {
        console.warn("[bestBottlesCatalogFallback] unavailable", error);
        return [];
      });
  }
  return catalogPromise;
}

async function loadBestBottlesCatalogGroups(): Promise<ProductGroup[]> {
  if (!catalogGroupsPromise) {
    catalogGroupsPromise = loadBestBottlesPipelineUi()
      .then(async (payload) => {
        const rows = Array.isArray(payload.productGroups) ? payload.productGroups : [];
        return rows
          .map((row) => {
            const slug = normalizeSlug(row.productGroupSlug);
            if (!slug) return null;
            const capacityMl = numberOrNull(row.capacityMl);
            const primaryGraceSku = firstListItem(row.sampleGraceSkus);
            return {
              _id: `static:${slug}`,
              _creationTime: 0,
              slug,
              displayName: row.displayName?.trim() || slug,
              family: row.family?.trim() || "",
              capacity: capacityMl === null ? null : `${capacityMl} ml`,
              capacityMl,
              color: null,
              category: row.category?.trim() || row.family?.trim() || "",
              bottleCollection: row.family?.trim() || null,
              neckThreadSize: slug.match(/\b\d{2}-\d{3}\b/)?.[0] ?? null,
              variantCount: numberOrNull(row.variantCount) ?? 0,
              priceRangeMin: null,
              priceRangeMax: null,
              applicatorTypes: splitList(row.applicatorTypes),
              shopifyProductId: null,
              sanitySlug: null,
              heroImageUrl: null,
              primaryGraceSku,
              primaryWebsiteSku: null,
              groupDescription: null,
              paperDollFamilyKey: null,
            } satisfies ProductGroup;
          })
          .filter((group): group is ProductGroup => Boolean(group));
      })
      .catch((error) => {
        console.warn("[bestBottlesCatalogFallback] product groups unavailable", error);
        return [];
      });
  }
  return catalogGroupsPromise;
}

export async function getStaticBestBottlesProductsByFamily(
  family: string | null | undefined,
): Promise<Product[]> {
  const target = normalizeFamily(family);
  if (!target) return [];
  const catalog = await loadBestBottlesCatalog();
  return catalog.filter((product) => normalizeFamily(product.family) === target);
}

export async function getStaticBestBottlesCatalogProducts(limit = 3000): Promise<Product[]> {
  const catalog = await loadBestBottlesCatalog();
  return limit > 0 ? catalog.slice(0, limit) : catalog;
}

export async function getStaticBestBottlesCatalogGroups(limit = 1000): Promise<ProductGroup[]> {
  const groups = await loadBestBottlesCatalogGroups();
  return limit > 0 ? groups.slice(0, limit) : groups;
}
