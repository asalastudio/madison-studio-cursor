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
  source: "shopify" | "etsy" | "manual" | "csv",
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

/** Hand-curated fields a sync must never overwrite once set (old sync rule). */
export const PRESERVED_KEYS = ["collection", "scent_family", "tone"] as const;

const isEmpty = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

type ExistingRow = {
  product_id: string;
  name: string | null;
  specs: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  copy_hints?: Record<string, unknown> | null;
};

/**
 * Merge an incoming row over the stored one: specs and metadata are merged
 * (incoming wins), except PRESERVED_KEYS keep a non-empty stored value, and a
 * stored description of 50+ chars is kept. copy_hints are never touched.
 */
export function mergeWithExisting(row: BrandProductRow, old: ExistingRow, preserveManual = true): BrandProductRow {
  const oldSpecs = old.specs ?? {};
  const oldMeta = old.metadata ?? {};
  const specs: Record<string, unknown> = { ...oldSpecs, ...row.specs };
  const metadata: Record<string, unknown> = { ...oldMeta, ...row.metadata };
  for (const key of preserveManual ? PRESERVED_KEYS : []) {
    if (!isEmpty(oldSpecs[key])) specs[key] = oldSpecs[key];
    if (!isEmpty(oldMeta[key])) metadata[key] = oldMeta[key];
  }
  const oldDesc = oldMeta.description;
  if (preserveManual && typeof oldDesc === "string" && oldDesc.length >= 50) metadata.description = oldDesc;
  const { copy_hints: _ignored, ...rest } = row;
  return { ...rest, product_id: old.product_id, specs, metadata };
}

const norm = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : "");

/**
 * Upsert rows on (org_id, product_id). Marketplace syncs keep hand-curated
 * fields (preserveManual, default); a manual/CSV edit passes false so it wins.
 * A row whose source key (shopify:/etsy:)
 * is new is first matched to an existing org product by handle, then by name,
 * and updates that row instead of creating a duplicate.
 */
export async function upsertBrandProducts(
  client: Client,
  orgId: string,
  rows: BrandProductRow[],
  options: { preserveManual?: boolean } = {},
): Promise<{ inserted: number; updated: number }> {
  if (rows.length === 0) return { inserted: 0, updated: 0 };
  const preserveManual = options.preserveManual ?? true;
  const { data: existing, error: selectError } = await client
    .from("brand_products")
    .select("product_id, name, specs, metadata")
    .eq(BRAND_PRODUCTS_ORG_COLUMN, orgId);
  if (selectError) throw selectError;
  const all = (existing ?? []) as ExistingRow[];
  const byId = new Map(all.map((r) => [r.product_id, r]));
  const byHandle = new Map<string, ExistingRow>();
  const byName = new Map<string, ExistingRow>();
  for (const r of all) {
    const h = norm(r.metadata?.handle);
    if (h && !byHandle.has(h)) byHandle.set(h, r);
    const n = norm(r.name);
    if (n && !byName.has(n)) byName.set(n, r);
  }
  const claimed = new Set<string>();
  let updated = 0;
  const payload = rows.map((row) => {
    let old = byId.get(row.product_id);
    if (!old) {
      const candidate = byHandle.get(norm(row.metadata.handle)) ?? byName.get(norm(row.name));
      // Only adopt a row that is not itself another synced product of this batch.
      if (candidate && !claimed.has(candidate.product_id) && !rows.some((r) => r.product_id === candidate.product_id)) {
        old = candidate;
      }
    }
    if (!old || claimed.has(old.product_id)) return row;
    claimed.add(old.product_id);
    updated += 1;
    return mergeWithExisting(row, old, preserveManual);
  });
  const { error } = await client
    .from("brand_products")
    .upsert(payload, { onConflict: "org_id,product_id" });
  if (error) throw error;
  return { inserted: payload.length - updated, updated };
}

/**
 * Build a live row from a UI/CSV form with legacy flat field names
 * (collection, tone, scent_family, top_notes, description, handle, ...).
 */
export function formToBrandProductRow(
  orgId: string,
  productId: string,
  form: Record<string, unknown>,
  source: "manual" | "csv" = "manual",
): BrandProductRow {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(form)) if (!isEmpty(v)) clean[k] = v;
  const row = legacyToBrandProductRow(orgId, source, productId, clean);
  return { ...row, product_id: productId };
}

/** Stable product_id for a manual/CSV product: its handle or a slug of the name. */
export function manualProductId(name: string, handle?: string | null): string {
  const base = (handle || name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `manual:${base || "product"}`;
}
