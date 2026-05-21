import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

type PipelineProduct = {
  productGroupSlug?: string;
  productGroupDisplayName?: string;
  family?: string;
  catalogReferencePages?: string;
  category?: string;
  capacityMl?: string | number | null;
  applicator?: string;
  canonicalColor?: string;
  color?: string;
  capStyle?: string;
  capColor?: string;
  graceSku?: string;
  websiteSku?: string;
  shopifySku?: string | null;
  productId?: string;
  sourceId?: string;
  productGroupId?: string;
  expectedCanonicalFilename?: string;
  bestReferenceCandidatePath?: string;
  heightWithoutCap?: string | number | null;
  diameter?: string | number | null;
  catalogHeightWithoutCap?: string | number | null;
  catalogDiameter?: string | number | null;
  measurementSource?: string | null;
  measurementOverrideSource?: string | null;
  measurementOverrideUrl?: string | null;
  measurementOverrideNote?: string | null;
  neckThreadSize?: string | null;
};

type ExistingProductHub = {
  id: string;
  name: string | null;
  slug: string | null;
  sku: string | null;
  category: string | null;
  product_type: string | null;
  product_line?: string | null;
  short_description: string | null;
  long_description: string | null;
  seo_title: string | null;
  seo_description: string | null;
  tags: string[] | null;
  metadata: Record<string, unknown> | null;
  external_ids: Record<string, unknown> | null;
  hero_image_id?: string | null;
  hero_image_external_url?: string | null;
};

type Group = {
  slug: string;
  displayName: string;
  family: string;
  category: string | null;
  capacityMl: number | null;
  canonicalColor: string | null;
  catalogReferencePages: string | null;
  neckThread: string | null;
  material: string | null;
  containerType: string;
  isComponentException: boolean;
  products: PipelineProduct[];
  missingSpecFields: string[];
  specsComplete: boolean;
};

const ROOT = process.cwd();
const DEFAULT_PIPELINE_DATA = path.join(ROOT, "public/data/best-bottles-madison-pipeline-ui.json");
const DEFAULT_READINESS_DATA = path.join(ROOT, "public/data/best-bottles-generation-readiness.json");
const OUT_SQL = path.join(ROOT, "tmp/best-bottles-product-hub-enrichment.sql");
const OUT_REVIEW = path.join(ROOT, "tmp/best-bottles-product-hub-enrichment-preview.csv");

const COMPONENT_FAMILIES = new Set([
  "Cap/Closure",
  "Cap/Component",
  "Decorative",
  "Dropper",
  "Gift Bag",
  "Gift Box",
  "Lotion Pump",
  "Packaging Supply",
  "Roll-On Cap",
  "Sprayer",
  "Tool",
]);
const COMPONENT_CATEGORIES = new Set(["Accessory", "Cap/Closure", "Component", "Packaging"]);
const GLASS_FAMILIES = new Set([
  "Apothecary",
  "Bell",
  "Boston Round",
  "Circle",
  "Cream Jar",
  "Cylinder",
  "Diamond",
  "Diva",
  "Elegant",
  "Empire",
  "Flair",
  "Grace",
  "Pillar",
  "Rectangle",
  "Round",
  "Royal",
  "Sleek",
  "Slim",
  "Square",
  "Tall Cylinder",
  "Teardrop",
  "Tulip",
  "Vial",
]);

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function csvEscape(value: unknown): string {
  const text = Array.isArray(value) ? value.join("; ") : clean(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

function sqlString(value: unknown): string {
  const text = clean(value);
  return text ? `'${text.replace(/'/g, "''")}'` : "NULL";
}

function sqlJson(value: unknown): string {
  return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
}

function toInt(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd();
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map(clean).filter(Boolean))];
}

function firstText(values: unknown[]): string | null {
  return values.map(clean).find(Boolean) ?? null;
}

function firstInt(values: unknown[]): number | null {
  for (const value of values) {
    const parsed = toInt(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function normalizeKey(value: unknown): string {
  return clean(value).toUpperCase();
}

function inferThreadSize(...values: unknown[]): string | null {
  for (const value of values) {
    const normalized = clean(value);
    const finish = normalized.match(/\b\d{1,2}[-/]\d{3}\b/i);
    if (finish) return finish[0].replace("/", "-");
    const millimeter = normalized.match(/\b\d{1,2}\s*mm\b/i);
    if (millimeter) return millimeter[0].replace(/\s+/g, "").toUpperCase();
    if (/\bground\b/i.test(normalized)) return "Ground";
    if (/\bplug\b/i.test(normalized)) return "Plug";
  }
  return null;
}

function isComponentGroup(family: string, category: string | null, displayName: string): boolean {
  if (COMPONENT_FAMILIES.has(family)) return true;
  if (category && COMPONENT_CATEGORIES.has(category)) return true;
  return /\b(cap|closure|sprayer|pump|dropper|fitment|component|accessory|bag|box|tool)\b/i.test(displayName);
}

function inferMaterial(family: string, category: string | null, displayName: string): string | null {
  const searchable = `${family} ${category ?? ""} ${displayName}`.toLowerCase();
  if (searchable.includes("aluminum")) return "Aluminum";
  if (searchable.includes("plastic")) return "Plastic";
  if (searchable.includes("metal atomizer") || searchable.includes("atomizer")) return "Metal";
  if (searchable.includes("gift bag")) return "Paper";
  if (searchable.includes("gift box")) return "Paperboard";
  if (searchable.includes("packaging")) return "Packaging";
  if (GLASS_FAMILIES.has(family) || searchable.includes("glass")) return "Glass";
  if (/\b(cap|closure|sprayer|pump|dropper|fitment|component|accessory|tool)\b/i.test(searchable)) {
    return "Component";
  }
  return null;
}

function inferContainerType(group: Pick<Group, "family" | "category" | "displayName" | "isComponentException">): string {
  const searchable = `${group.family} ${group.category ?? ""} ${group.displayName}`.toLowerCase();
  if (searchable.includes("jar")) return "Jar";
  if (searchable.includes("bag")) return "Bag";
  if (searchable.includes("box")) return "Box";
  if (searchable.includes("pump")) return "Pump";
  if (searchable.includes("sprayer")) return "Sprayer";
  if (searchable.includes("dropper")) return "Dropper";
  if (searchable.includes("cap") || searchable.includes("closure")) return "Closure";
  if (group.isComponentException) return "Component";
  return "Bottle";
}

function componentRequiresThread(family: string, category: string | null, displayName: string): boolean {
  if (!isComponentGroup(family, category, displayName)) return true;
  return /\b(cap|closure|sprayer|pump|dropper|fitment)\b/i.test(`${family} ${category ?? ""} ${displayName}`);
}

function mergePipelineAndReadinessProducts(pipelineProducts: PipelineProduct[], readinessRows: PipelineProduct[]): PipelineProduct[] {
  if (readinessRows.length === 0) return pipelineProducts;
  const pipelineByGrace = new Map(pipelineProducts.map((product) => [normalizeKey(product.graceSku), product]));
  const pipelineByWebsite = new Map(pipelineProducts.map((product) => [normalizeKey(product.websiteSku), product]));

  return readinessRows.map((row) => {
    const pipeline =
      pipelineByGrace.get(normalizeKey(row.graceSku)) ??
      pipelineByWebsite.get(normalizeKey(row.websiteSku)) ??
      {};
    return {
      ...pipeline,
      ...row,
      canonicalColor: clean(row.color) || clean(row.canonicalColor) || clean(pipeline.canonicalColor) || undefined,
      shopifySku: clean(pipeline.shopifySku) || clean(row.shopifySku) || null,
    };
  });
}

function buildDescription(group: Group): { short: string; long: string; seoTitle: string; seoDescription: string } {
  const applicators = unique(group.products.map((product) => product.applicator));
  const colors = unique(group.products.map((product) => clean(product.canonicalColor) || clean(product.color)));
  const skuCount = group.products.length;
  const capacity = group.capacityMl ? `${group.capacityMl} ml` : group.isComponentException ? "component" : "multi-capacity";
  const material = group.material ? `${group.material.toLowerCase()} ` : "";
  const color = group.canonicalColor || colors[0] || "mixed";
  const applicatorPhrase = applicators.length > 0 ? ` with ${applicators.join(", ")}` : "";
  const threadPhrase = group.neckThread ? ` Thread/finish: ${group.neckThread}.` : "";
  const dimension = firstDimensions(group.products);
  const dimensionPhrase =
    dimension?.heightWithoutCap && dimension?.diameter
      ? ` Body dimensions: ${dimension.heightWithoutCap} mm height without cap x ${dimension.diameter} mm diameter.`
      : "";

  const short = `${group.displayName} is a Best Bottles ${group.family} product group for ${capacity} ${color.toLowerCase()} ${material}packaging${applicatorPhrase}.`;
  const long = [
    short,
    `This Product Hub record centralizes SKU, media, image-generation, Shopify, and Convex sync data for ${skuCount} SKU${skuCount === 1 ? "" : "s"}.`,
    threadPhrase.trim(),
    dimensionPhrase.trim(),
    group.catalogReferencePages ? `Catalog reference pages: ${group.catalogReferencePages}.` : "",
  ].filter(Boolean).join(" ");
  const seoTitle = truncate(`${group.displayName} | Best Bottles`, 70);
  const seoDescription = truncate(
    `${group.displayName}: ${capacity} ${group.family.toLowerCase()} packaging with SKU-level specs, media, and Shopify sync data from Best Bottles.`,
    320,
  );

  return { short, long, seoTitle, seoDescription };
}

function firstDimensions(products: PipelineProduct[]): {
  heightWithoutCap: number | null;
  diameter: number | null;
  source: string | null;
  sourceUrl: string | null;
  note: string | null;
} | null {
  const row = products.find((product) => toNumber(product.heightWithoutCap) || toNumber(product.diameter));
  if (!row) return null;
  return {
    heightWithoutCap: toNumber(row.heightWithoutCap),
    diameter: toNumber(row.diameter),
    source: firstText([row.measurementOverrideSource, row.measurementSource]),
    sourceUrl: clean(row.measurementOverrideUrl) || null,
    note: clean(row.measurementOverrideNote) || null,
  };
}

function buildBottleSpecs(group: Group): Record<string, unknown> {
  const dimensions = firstDimensions(group.products);
  const colors = unique(group.products.map((product) => clean(product.canonicalColor) || clean(product.color)));
  const applicators = unique(group.products.map((product) => product.applicator));
  const capStyles = unique(group.products.map((product) => product.capStyle));
  const capColors = unique(group.products.map((product) => product.capColor));

  return {
    source: {
      name: "best_bottles_generation_readiness",
      generatedAt: new Date().toISOString(),
      note: "Backfilled from Convex/pipeline readiness data; safe to refresh from canonical Best Bottles sources.",
    },
    productGroup: {
      slug: group.slug,
      displayName: group.displayName,
      family: group.family,
      category: group.category,
      componentException: group.isComponentException,
    },
    capacity: {
      ml: group.capacityMl,
      display: group.capacityMl ? `${group.capacityMl} ml` : null,
      required: !group.isComponentException,
    },
    neck: {
      finish_code: group.neckThread,
      thread_size: group.neckThread,
    },
    material: {
      primary: group.material,
      body: group.material,
    },
    container: {
      type: group.containerType,
      applicators,
      capStyles,
      capColors,
    },
    color: {
      canonical: group.canonicalColor,
      variants: colors,
    },
    dimensions: {
      unit: "mm",
      height_without_cap: dimensions?.heightWithoutCap ?? null,
      diameter: dimensions?.diameter ?? null,
      required: !group.isComponentException,
      source: dimensions?.source ?? null,
      source_url: dimensions?.sourceUrl ?? null,
      note: dimensions?.note ?? null,
      variants: group.products.map((product) => ({
        graceSku: clean(product.graceSku) || null,
        websiteSku: clean(product.websiteSku) || null,
        height_without_cap: toNumber(product.heightWithoutCap),
        diameter: toNumber(product.diameter),
        measurementSource: clean(product.measurementOverrideSource) || clean(product.measurementSource) || null,
      })),
    },
    catalog: {
      referencePages: group.catalogReferencePages,
    },
    completeness: {
      complete: group.specsComplete,
      missingFields: group.missingSpecFields,
    },
  };
}

function missingSpecFieldsForGroup(group: Omit<Group, "missingSpecFields" | "specsComplete" | "containerType">): string[] {
  const missing: string[] = [];
  const hasDimensions = Boolean(firstDimensions(group.products)?.heightWithoutCap && firstDimensions(group.products)?.diameter);

  if (!group.family) missing.push("family");
  if (!group.category) missing.push("category");
  if (!group.isComponentException && !group.capacityMl) missing.push("capacity");
  if (componentRequiresThread(group.family, group.category, group.displayName) && !group.neckThread) {
    missing.push("thread/finish");
  }
  if (!group.material) missing.push("material");
  if (!group.isComponentException && !group.canonicalColor) missing.push("color");
  if (!group.isComponentException && !hasDimensions) missing.push("dimensions");
  if (!group.catalogReferencePages) missing.push("catalog pages");

  return missing;
}

function buildBestBottlesMetadata(group: Group): Record<string, unknown> {
  const first = group.products[0];
  return {
    family: group.family,
    productGroupSlug: group.slug,
    productGroupDisplayName: group.displayName,
    graceSku: clean(first.graceSku) || null,
    websiteSku: clean(first.websiteSku) || null,
    shopifySku: clean(first.shopifySku) || null,
    capacityMl: group.capacityMl,
    neckThread: group.neckThread,
    applicator: unique(group.products.map((product) => product.applicator)).join(", ") || null,
    canonicalColor: group.canonicalColor,
    material: group.material,
    convexProductId: clean(first.productId) || null,
    convexProductGroupId: clean(first.productGroupId) || null,
    convexSourceId: clean(first.sourceId) || null,
    catalogReferencePages: group.catalogReferencePages,
    componentException: group.isComponentException,
    specsComplete: group.specsComplete,
    missingSpecFields: group.missingSpecFields,
    skuCount: group.products.length,
    skus: group.products.map((product) => ({
      graceSku: clean(product.graceSku) || null,
      websiteSku: clean(product.websiteSku) || null,
      shopifySku: clean(product.shopifySku) || null,
      capacityMl: toInt(product.capacityMl),
      applicator: clean(product.applicator) || null,
      canonicalColor: clean(product.canonicalColor) || clean(product.color) || null,
      capStyle: clean(product.capStyle) || null,
      capColor: clean(product.capColor) || null,
      heightWithoutCap: toNumber(product.heightWithoutCap),
      diameter: toNumber(product.diameter),
    })),
  };
}

function mergeMetadata(existing: Record<string, unknown> | null | undefined, group: Group): Record<string, unknown> {
  const current = existing && typeof existing === "object" && !Array.isArray(existing) ? existing : {};
  const currentBestBottles =
    current.best_bottles && typeof current.best_bottles === "object" && !Array.isArray(current.best_bottles)
      ? (current.best_bottles as Record<string, unknown>)
      : {};
  const currentBottleSpecs =
    current.bottle_specs && typeof current.bottle_specs === "object" && !Array.isArray(current.bottle_specs)
      ? (current.bottle_specs as Record<string, unknown>)
      : {};

  return {
    ...current,
    best_bottles: {
      ...currentBestBottles,
      ...buildBestBottlesMetadata(group),
    },
    bottle_specs: {
      ...currentBottleSpecs,
      ...buildBottleSpecs(group),
    },
  };
}

function buildGroups(products: PipelineProduct[]): Group[] {
  const groupMap = new Map<string, PipelineProduct[]>();
  for (const product of products) {
    const slug = clean(product.productGroupSlug);
    if (!slug) continue;
    groupMap.set(slug, [...(groupMap.get(slug) ?? []), product]);
  }

  return [...groupMap.entries()]
    .map(([slug, rows]) => {
      const first = rows[0];
      const displayName = clean(first.productGroupDisplayName) || slug;
      const family = clean(first.family) || "Unknown";
      const category = clean(first.category) || null;
      const isComponentException = isComponentGroup(family, category, displayName);
      const partial = {
        slug,
        displayName,
        family,
        category,
        capacityMl: firstInt(rows.map((product) => product.capacityMl)),
        canonicalColor: firstText(rows.map((product) => clean(product.canonicalColor) || clean(product.color))),
        catalogReferencePages: firstText(rows.map((product) => product.catalogReferencePages)),
        neckThread: firstText(rows.map((product) => product.neckThreadSize)) || inferThreadSize(slug, displayName, ...rows.map((product) => product.category)),
        material: inferMaterial(family, category, displayName),
        isComponentException,
        products: rows,
      };
      const missingSpecFields = missingSpecFieldsForGroup(partial);
      const containerType = inferContainerType({ ...partial, containerType: "", missingSpecFields, specsComplete: false });

      return {
        ...partial,
        containerType,
        missingSpecFields,
        specsComplete: missingSpecFields.length === 0,
      };
    })
    .sort((a, b) => a.family.localeCompare(b.family) || a.displayName.localeCompare(b.displayName));
}

function buildTags(group: Group, existing: string[] | null | undefined): string[] {
  return unique([...(existing ?? []), "best-bottles", group.family, group.slug, group.material, group.containerType]);
}

function nonEmptyOr(value: string | null | undefined, fallback: string, overwrite: boolean): string {
  if (overwrite) return fallback;
  return clean(value) || fallback;
}

function buildUpdatePayload(group: Group, existing: ExistingProductHub | null, overwriteCopy: boolean): Record<string, unknown> {
  const first = group.products[0];
  const copy = buildDescription(group);
  return {
    sku: clean(existing?.sku) || clean(first.graceSku) || null,
    category: clean(existing?.category) || group.category || "Packaging",
    product_type: clean(existing?.product_type) || group.family,
    product_line: clean(existing?.product_line) || group.family,
    tags: buildTags(group, existing?.tags),
    short_description: nonEmptyOr(existing?.short_description, copy.short, overwriteCopy),
    long_description: nonEmptyOr(existing?.long_description, copy.long, overwriteCopy),
    seo_title: nonEmptyOr(existing?.seo_title, copy.seoTitle, overwriteCopy),
    seo_description: nonEmptyOr(existing?.seo_description, copy.seoDescription, overwriteCopy),
    external_ids: {
      ...(existing?.external_ids ?? {}),
      best_bottles_product_group_slug: group.slug,
      best_bottles_product_group_id: clean(first.productGroupId) || null,
      best_bottles_source_id: clean(first.sourceId) || null,
    },
    metadata: mergeMetadata(existing?.metadata, group),
  };
}

function buildInsertPayload(group: Group, organizationId: string, overwriteCopy: boolean): Record<string, unknown> {
  const first = group.products[0];
  const copy = buildDescription(group);
  return {
    organization_id: organizationId,
    name: group.displayName,
    slug: group.slug,
    sku: clean(first.graceSku) || null,
    category: group.category ?? "Packaging",
    product_type: group.family,
    product_line: group.family,
    status: "active",
    visibility: "internal",
    development_stage: "launched",
    short_description: copy.short,
    long_description: copy.long,
    seo_title: copy.seoTitle,
    seo_description: copy.seoDescription,
    tags: buildTags(group, null),
    external_ids: {
      best_bottles_product_group_slug: group.slug,
      best_bottles_product_group_id: clean(first.productGroupId) || null,
      best_bottles_source_id: clean(first.sourceId) || null,
    },
    metadata: mergeMetadata({}, group),
  };
}

async function applyEnrichment(groups: Group[], organizationId: string, overwriteCopy: boolean): Promise<{ inserted: number; updated: number }> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for --apply.");
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const slugs = groups.map((group) => group.slug);
  const { data: existingRows, error: existingError } = await supabase
    .from("product_hubs")
    .select("id,name,slug,sku,category,product_type,product_line,short_description,long_description,seo_title,seo_description,tags,metadata,external_ids,hero_image_id,hero_image_external_url")
    .eq("organization_id", organizationId)
    .in("slug", slugs);

  if (existingError) throw existingError;
  const existingBySlug = new Map((existingRows ?? []).map((row) => [clean(row.slug), row as ExistingProductHub]));

  let inserted = 0;
  let updated = 0;
  for (const group of groups) {
    const existing = existingBySlug.get(group.slug) ?? null;
    if (existing) {
      const { error } = await supabase
        .from("product_hubs")
        .update(buildUpdatePayload(group, existing, overwriteCopy))
        .eq("id", existing.id);
      if (error) throw new Error(`${group.slug}: ${error.message}`);
      updated += 1;
    } else {
      const { error } = await supabase
        .from("product_hubs")
        .insert(buildInsertPayload(group, organizationId, overwriteCopy));
      if (error) throw new Error(`${group.slug}: ${error.message}`);
      inserted += 1;
    }
  }

  return { inserted, updated };
}

function writePreview(groups: Group[]): void {
  fs.mkdirSync(path.join(ROOT, "tmp"), { recursive: true });
  fs.writeFileSync(
    OUT_REVIEW,
    [
      [
        "slug",
        "displayName",
        "family",
        "skuCount",
        "specsComplete",
        "missingSpecFields",
        "material",
        "containerType",
        "capacityMl",
        "neckThread",
        "heightWithoutCapMm",
        "diameterMm",
        "primaryGraceSku",
        "primaryWebsiteSku",
        "primaryShopifySku",
      ].join(","),
      ...groups.map((group) => {
        const first = group.products[0];
        const dimensions = firstDimensions(group.products);
        return [
          group.slug,
          group.displayName,
          group.family,
          group.products.length,
          group.specsComplete ? "yes" : "no",
          group.missingSpecFields,
          group.material,
          group.containerType,
          group.capacityMl,
          group.neckThread,
          dimensions?.heightWithoutCap,
          dimensions?.diameter,
          clean(first.graceSku),
          clean(first.websiteSku),
          clean(first.shopifySku),
        ].map(csvEscape).join(",");
      }),
    ].join("\n") + "\n",
  );
}

function writeReviewSql(groups: Group[], organizationId: string, overwriteCopy: boolean): void {
  const sql: string[] = [
    "-- Best Bottles Product Hub enrichment.",
    "-- Review-only SQL mirror of the direct --apply path.",
    "-- Default behavior fills blank copy fields and preserves manual Product Hub edits.",
    "BEGIN;",
  ];

  for (const group of groups) {
    const first = group.products[0];
    const copy = buildDescription(group);
    const tags = buildTags(group, null);
    const copyAssignments = overwriteCopy
      ? [
          `short_description = ${sqlString(copy.short)}`,
          `long_description = ${sqlString(copy.long)}`,
          `seo_title = ${sqlString(copy.seoTitle)}`,
          `seo_description = ${sqlString(copy.seoDescription)}`,
        ]
      : [
          `short_description = COALESCE(NULLIF(short_description, ''), ${sqlString(copy.short)})`,
          `long_description = COALESCE(NULLIF(long_description, ''), ${sqlString(copy.long)})`,
          `seo_title = COALESCE(NULLIF(seo_title, ''), ${sqlString(copy.seoTitle)})`,
          `seo_description = COALESCE(NULLIF(seo_description, ''), ${sqlString(copy.seoDescription)})`,
        ];
    const metadata = mergeMetadata({}, group);
    const externalIds = {
      best_bottles_product_group_slug: group.slug,
      best_bottles_product_group_id: clean(first.productGroupId) || null,
      best_bottles_source_id: clean(first.sourceId) || null,
    };

    sql.push(
      [
        "WITH updated AS (",
        "  UPDATE public.product_hubs",
        "  SET",
        `    sku = COALESCE(NULLIF(sku, ''), ${sqlString(first.graceSku)}),`,
        `    category = COALESCE(NULLIF(category, ''), ${sqlString(group.category ?? "Packaging")}),`,
        `    product_type = COALESCE(NULLIF(product_type, ''), ${sqlString(group.family)}),`,
        `    product_line = COALESCE(NULLIF(product_line, ''), ${sqlString(group.family)}),`,
        `    tags = ARRAY(SELECT DISTINCT unnest(COALESCE(tags, ARRAY[]::text[]) || ARRAY[${tags.map(sqlString).join(", ")}]::text[])),`,
        `    ${copyAssignments.join(",\n    ")},`,
        `    external_ids = COALESCE(external_ids, '{}'::jsonb) || ${sqlJson(externalIds)},`,
        `    metadata = COALESCE(metadata, '{}'::jsonb) || ${sqlJson(metadata)},`,
        "    updated_at = now()",
        `  WHERE organization_id = ${sqlString(organizationId)}::uuid`,
        `    AND slug = ${sqlString(group.slug)}`,
        "  RETURNING id",
        ")",
        "INSERT INTO public.product_hubs (",
        "  organization_id, name, slug, sku, category, product_type, product_line, status, visibility, development_stage,",
        "  short_description, long_description, seo_title, seo_description, tags, external_ids, metadata",
        ")",
        "SELECT",
        `  ${sqlString(organizationId)}::uuid,`,
        `  ${sqlString(group.displayName)},`,
        `  ${sqlString(group.slug)},`,
        `  ${sqlString(first.graceSku)},`,
        `  ${sqlString(group.category ?? "Packaging")},`,
        `  ${sqlString(group.family)},`,
        `  ${sqlString(group.family)},`,
        "  'active',",
        "  'internal',",
        "  'launched',",
        `  ${sqlString(copy.short)},`,
        `  ${sqlString(copy.long)},`,
        `  ${sqlString(copy.seoTitle)},`,
        `  ${sqlString(copy.seoDescription)},`,
        `  ARRAY[${tags.map(sqlString).join(", ")}]::text[],`,
        `  ${sqlJson(externalIds)},`,
        `  ${sqlJson(metadata)}`,
        "WHERE NOT EXISTS (SELECT 1 FROM updated);",
      ].join("\n"),
    );
  }

  sql.push("COMMIT;", "");
  fs.writeFileSync(OUT_SQL, sql.join("\n\n"));
}

const pipelinePath = argValue("pipeline") ?? DEFAULT_PIPELINE_DATA;
const readinessPath = argValue("readiness") ?? DEFAULT_READINESS_DATA;
const organizationId = argValue("organization") ?? "__ORGANIZATION_ID__";
const overwriteCopy = process.argv.includes("--overwrite-copy");
const apply = process.argv.includes("--apply");

if (!fs.existsSync(pipelinePath)) {
  throw new Error(`Pipeline data not found: ${pipelinePath}`);
}

const pipelineData = JSON.parse(fs.readFileSync(pipelinePath, "utf8")) as { products?: PipelineProduct[] };
const readinessData = fs.existsSync(readinessPath)
  ? JSON.parse(fs.readFileSync(readinessPath, "utf8")) as { rows?: PipelineProduct[] }
  : { rows: [] };
const products = mergePipelineAndReadinessProducts(pipelineData.products ?? [], readinessData.rows ?? []);
const groups = buildGroups(products);

writePreview(groups);
writeReviewSql(groups, organizationId, overwriteCopy);

const baseResult = {
  pipelinePath,
  readinessPath: fs.existsSync(readinessPath) ? readinessPath : null,
  organizationId,
  overwriteCopy,
  apply,
  groups: groups.length,
  products: products.length,
  specsCompleteGroups: groups.filter((group) => group.specsComplete).length,
  groupsMissingSpecs: groups.filter((group) => !group.specsComplete).length,
  missingSpecFieldCounts: groups.reduce<Record<string, number>>((counts, group) => {
    for (const field of group.missingSpecFields) counts[field] = (counts[field] ?? 0) + 1;
    return counts;
  }, {}),
  outputs: [
    path.relative(ROOT, OUT_SQL),
    path.relative(ROOT, OUT_REVIEW),
  ],
};

if (apply) {
  if (organizationId === "__ORGANIZATION_ID__") {
    throw new Error("Pass --organization=<uuid> when using --apply.");
  }
  const applied = await applyEnrichment(groups, organizationId, overwriteCopy);
  console.log(JSON.stringify({ ...baseResult, ...applied }, null, 2));
} else {
  console.log(JSON.stringify(baseResult, null, 2));
}
