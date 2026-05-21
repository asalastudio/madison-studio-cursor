import type { Product } from "@/integrations/convex/bestBottles";

interface BestBottlesCatalogLite {
  source?: {
    sourceFile?: string | null;
    generatedAt?: string | null;
    modelVersion?: string | null;
    rowCount?: number | null;
  };
  products?: Product[];
}

const CATALOG_PATH = "/data/best-bottles-catalog-lite.json";

let catalogPromise: Promise<Product[]> | null = null;

function normalizeFamily(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function catalogUrl(): string {
  const base = import.meta.env.BASE_URL || "/";
  return `${base.replace(/\/$/, "")}${CATALOG_PATH}`;
}

async function loadBestBottlesCatalog(): Promise<Product[]> {
  if (!catalogPromise) {
    catalogPromise = fetch(catalogUrl(), { cache: "force-cache" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Static Best Bottles catalog failed to load (${response.status})`);
        }
        const payload = (await response.json()) as BestBottlesCatalogLite;
        return Array.isArray(payload.products) ? payload.products : [];
      })
      .catch((error) => {
        console.warn("[bestBottlesCatalogFallback] unavailable", error);
        return [];
      });
  }
  return catalogPromise;
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
