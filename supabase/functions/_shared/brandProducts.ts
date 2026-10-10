/**
 * brand_products after 20251210000002_fix_migration_conflicts.sql recreated it:
 *   id, org_id, product_id (unique per org), name, specs jsonb, copy_hints jsonb,
 *   images text[], metadata jsonb, created_at, updated_at
 *
 * Edge functions still used the pre-December shape (`organization_id`,
 * `handle`, `sku`, `price`, `shopify_product_id`, ...). Every such query errored
 * ("column brand_products.organization_id does not exist"), so the Etsy and
 * Shopify syncs wrote nothing and readers silently got no products.
 */
type Client = { from: (table: string) => any };

export const BRAND_PRODUCTS_ORG_COLUMN = "org_id" as const;

export interface BrandProductRow {
  org_id: string;
  product_id: string;
  name: string;
  specs: Record<string, unknown>;
  images: string[];
  metadata: Record<string, unknown>;
  copy_hints?: Record<string, unknown>;
}

const SPEC_KEYS = [
  "sku", "barcode", "price", "compare_at_price", "currency", "inventory_quantity",
  "inventory_policy", "track_inventory", "weight", "weight_unit", "requires_shipping",
  "category", "product_type", "collection", "vendor", "status", "variants", "options",
  "tags", "materials",
] as const;

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}

function imageSrcs(images: unknown, featured?: unknown): string[] {
  const list = parseMaybeJson(images);
  const out: string[] = [];
  if (typeof featured === "string" && featured) out.push(featured);
  if (Array.isArray(list)) {
    for (const img of list) {
      const src = typeof img === "string" ? img : (img as { src?: unknown })?.src;
      if (typeof src === "string" && src && !out.includes(src)) out.push(src);
    }
  }
  return out;
}

/** Pack a legacy flat product object (as the sync mappers build it) into the live row shape. */
export function legacyToBrandProductRow(
  orgId: string,
  source: "shopify" | "etsy",
  externalId: string,
  legacy: Record<string, unknown>,
): BrandProductRow {
  const specs: Record<string, unknown> = {};
  const metadata: Record<string, unknown> = { source };
  for (const [key, raw] of Object.entries(legacy)) {
    if (key === "organization_id" || key === "name" || key === "images") continue;
    const value = parseMaybeJson(raw);
    if (value === undefined) continue;
    if ((SPEC_KEYS as readonly string[]).includes(key)) specs[key] = value;
    else metadata[key] = value;
  }
  return {
    org_id: orgId,
    product_id: `${source}:${externalId}`,
    name: String(legacy.name ?? externalId),
    specs,
    images: imageSrcs(legacy.images, legacy.featured_image_url),
    metadata,
  };
}

/** Flatten a live row so legacy readers (`p.collection`, `p.sku`, `p.description`) keep working. */
export function flattenBrandProduct<T extends Record<string, any>>(row: T): Record<string, any> {
  const specs = (row?.specs ?? {}) as Record<string, unknown>;
  const metadata = (row?.metadata ?? {}) as Record<string, unknown>;
  return {
    ...metadata,
    ...specs,
    ...row,
    organization_id: row?.org_id,
    featured_image_url: Array.isArray(row?.images) ? row.images[0] ?? null : null,
  };
}

/**
 * Upsert rows on (org_id, product_id). Keeps copy_hints and any manual metadata,
 * and keeps an existing description of 50+ chars (the old sync's rule).
 */
export async function upsertBrandProducts(
  client: Client,
  orgId: string,
  rows: BrandProductRow[],
): Promise<{ inserted: number; updated: number }> {
  if (rows.length === 0) return { inserted: 0, updated: 0 };
  const ids = rows.map((r) => r.product_id);
  const { data: existing, error: selectError } = await client
    .from("brand_products")
    .select("product_id, metadata")
    .eq(BRAND_PRODUCTS_ORG_COLUMN, orgId)
    .in("product_id", ids);
  if (selectError) throw selectError;
  const prior = new Map<string, Record<string, unknown>>(
    (existing ?? []).map((r: { product_id: string; metadata: Record<string, unknown> | null }) => [r.product_id, r.metadata ?? {}]),
  );
  const payload = rows.map((row) => {
    const old = prior.get(row.product_id);
    if (!old) return row;
    const metadata = { ...old, ...row.metadata };
    const oldDesc = old.description;
    if (typeof oldDesc === "string" && oldDesc.length >= 50) metadata.description = oldDesc;
    return { ...row, metadata };
  });
  const { error } = await client
    .from("brand_products")
    .upsert(payload, { onConflict: "org_id,product_id" });
  if (error) throw error;
  const updated = payload.filter((r) => prior.has(r.product_id)).length;
  return { inserted: payload.length - updated, updated };
}
