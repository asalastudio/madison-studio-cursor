import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

type PipelineSkuJob = {
  id: string;
  organization_id: string;
  pipeline_group_id: string | null;
  product_group_slug: string | null;
  product_group_display_name: string | null;
  family: string | null;
  grace_sku: string | null;
  website_sku: string | null;
  shopify_sku: string | null;
  status: string | null;
  generated_image_id: string | null;
  generated_image_url: string | null;
  approved_image_id: string | null;
  approved_image_url: string | null;
  approved_at: string | null;
  shopify_media_id: string | null;
  shopify_image_url: string | null;
  shopify_pushed_at: string | null;
  convex_synced_at: string | null;
  last_error: string | null;
};

type PipelineGroup = {
  id: string;
  convex_slug: string | null;
  display_name: string | null;
  family: string | null;
};

type GeneratedImage = {
  id: string;
  image_url: string | null;
  description: string | null;
  library_tags: string[] | null;
  is_archived: boolean | null;
  created_at: string;
};

type Candidate = {
  id: string;
  imageUrl: string;
  createdAt: string;
  tags: string[];
  matchedBy: Array<"graceSku" | "websiteSku" | "shopifySku">;
};

type AuditRow = {
  bucket:
    | "already-approved"
    | "safe-to-auto-approve"
    | "multiple-candidates-review"
    | "no-image-found"
    | "missing-sku"
    | "missing-group-rollup";
  jobId: string;
  productGroupSlug: string;
  productGroupDisplayName: string;
  family: string;
  graceSku: string;
  websiteSku: string;
  shopifySku: string;
  status: string;
  groupRollupExists: boolean;
  approvedImageId: string;
  approvedImageUrl: string;
  shopifyPushed: boolean;
  convexSynced: boolean;
  candidateCount: number;
  selectedImageId: string;
  selectedImageUrl: string;
  selectedImageCreatedAt: string;
  candidateIds: string;
  notes: string;
};

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, "tmp", "bestbottles-audits");

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeSku(value: string | null | undefined): string {
  return clean(value).toUpperCase();
}

function csvEscape(value: unknown): string {
  const text = clean(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

function extractTagValue(tags: string[], prefix: string): string | null {
  const lowerPrefix = prefix.toLowerCase();
  const found = tags.find((tag) => tag.toLowerCase().startsWith(lowerPrefix));
  return found ? found.slice(prefix.length).trim() : null;
}

async function fetchAll<T>(
  table: string,
  select: string,
  applyFilters: (query: ReturnType<ReturnType<typeof createClient>["from"]>["select"]) => unknown,
): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    let query = supabase.from(table).select(select).range(from, from + pageSize - 1);
    query = applyFilters(query as never) as typeof query;
    const { data, error } = await query;
    if (error) throw new Error(`${table} fetch failed: ${error.message}`);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < pageSize) break;
  }

  return rows;
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

const groupFilter = argValue("group");
const familyFilter = argValue("family");
const orgFilter = argValue("organization");

const jobs = await fetchAll<PipelineSkuJob>(
  "best_bottles_pipeline_sku_jobs",
  [
    "id",
    "organization_id",
    "pipeline_group_id",
    "product_group_slug",
    "product_group_display_name",
    "family",
    "grace_sku",
    "website_sku",
    "shopify_sku",
    "status",
    "generated_image_id",
    "generated_image_url",
    "approved_image_id",
    "approved_image_url",
    "approved_at",
    "shopify_media_id",
    "shopify_image_url",
    "shopify_pushed_at",
    "convex_synced_at",
    "last_error",
  ].join(","),
  (query) => {
    let q = query as ReturnType<typeof supabase.from>["select"];
    if (groupFilter) q = q.eq("product_group_slug", groupFilter);
    if (familyFilter) q = q.eq("family", familyFilter);
    if (orgFilter) q = q.eq("organization_id", orgFilter);
    return q.order("product_group_slug", { ascending: true }).order("grace_sku", { ascending: true });
  },
);

const groups = await fetchAll<PipelineGroup>(
  "best_bottles_pipeline_groups",
  "id,convex_slug,display_name,family",
  (query) => {
    let q = query as ReturnType<typeof supabase.from>["select"];
    if (familyFilter) q = q.eq("family", familyFilter);
    if (orgFilter) q = q.eq("organization_id", orgFilter);
    return q.order("convex_slug", { ascending: true });
  },
);

const images = await fetchAll<GeneratedImage>(
  "generated_images",
  "id,image_url,description,library_tags,is_archived,created_at",
  (query) =>
    (query as ReturnType<typeof supabase.from>["select"])
      .eq("saved_to_library", true)
      .eq("media_type", "image")
      .order("created_at", { ascending: false }),
);

const groupsBySlug = new Set(groups.map((group) => clean(group.convex_slug)).filter(Boolean));
const candidatesBySku = new Map<string, Candidate[]>();

for (const image of images) {
  if (image.is_archived || !image.image_url) continue;
  const tags = Array.isArray(image.library_tags) ? image.library_tags.map(clean).filter(Boolean) : [];
  const sku = normalizeSku(extractTagValue(tags, "sku:"));
  const websiteSku = normalizeSku(extractTagValue(tags, "websiteSku:"));
  const pairs: Array<[string, "graceSku" | "websiteSku" | "shopifySku"]> = [];
  if (sku) {
    pairs.push([sku, "graceSku"]);
    pairs.push([sku, "shopifySku"]);
  }
  if (websiteSku) pairs.push([websiteSku, "websiteSku"]);

  for (const [key, matchedBy] of pairs) {
    const existing = candidatesBySku.get(key) ?? [];
    const prior = existing.find((candidate) => candidate.id === image.id);
    if (prior) {
      if (!prior.matchedBy.includes(matchedBy)) prior.matchedBy.push(matchedBy);
      continue;
    }
    existing.push({
      id: image.id,
      imageUrl: image.image_url,
      createdAt: image.created_at,
      tags,
      matchedBy: [matchedBy],
    });
    candidatesBySku.set(key, existing);
  }
}

function candidatesForJob(job: PipelineSkuJob): Candidate[] {
  const keys = [
    normalizeSku(job.grace_sku),
    normalizeSku(job.website_sku),
    normalizeSku(job.shopify_sku),
  ].filter(Boolean);
  const byId = new Map<string, Candidate>();
  for (const key of keys) {
    for (const candidate of candidatesBySku.get(key) ?? []) {
      byId.set(candidate.id, candidate);
    }
  }
  return Array.from(byId.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function classify(job: PipelineSkuJob, candidates: Candidate[]): AuditRow["bucket"] {
  if (!job.grace_sku && !job.website_sku && !job.shopify_sku) return "missing-sku";
  if (job.approved_image_url) return "already-approved";
  if (candidates.length === 0) return "no-image-found";
  if (candidates.length === 1) return "safe-to-auto-approve";
  return "multiple-candidates-review";
}

const rows: AuditRow[] = [];
for (const job of jobs) {
  const productGroupSlug = clean(job.product_group_slug);
  const groupRollupExists = productGroupSlug ? groupsBySlug.has(productGroupSlug) : false;
  const candidates = candidatesForJob(job);
  const selected = candidates[0];
  const bucket = classify(job, candidates);
  rows.push({
    bucket: groupRollupExists ? bucket : "missing-group-rollup",
    jobId: job.id,
    productGroupSlug,
    productGroupDisplayName: clean(job.product_group_display_name),
    family: clean(job.family),
    graceSku: clean(job.grace_sku),
    websiteSku: clean(job.website_sku),
    shopifySku: clean(job.shopify_sku),
    status: clean(job.status),
    groupRollupExists,
    approvedImageId: clean(job.approved_image_id),
    approvedImageUrl: clean(job.approved_image_url),
    shopifyPushed: Boolean(job.shopify_pushed_at || job.shopify_image_url || job.shopify_media_id),
    convexSynced: Boolean(job.convex_synced_at || job.status === "synced"),
    candidateCount: candidates.length,
    selectedImageId: selected?.id ?? "",
    selectedImageUrl: selected?.imageUrl ?? "",
    selectedImageCreatedAt: selected?.createdAt ?? "",
    candidateIds: candidates.map((candidate) => candidate.id).join("|"),
    notes: !groupRollupExists
      ? "Product group rollup row missing; import/fix best_bottles_pipeline_groups before group-level workflow."
      : bucket === "multiple-candidates-review"
        ? "Multiple exact SKU-tagged library images found; review newest image before auto-approval."
        : bucket === "safe-to-auto-approve"
          ? "Single exact SKU-tagged library image found; safe candidate for later approval backfill."
          : bucket === "already-approved"
            ? "SKU job already has an approved image."
            : bucket === "no-image-found"
              ? "No exact sku:/websiteSku: image-library tag match found."
              : "Missing SKU values.",
  });
}

const counts = rows.reduce<Record<string, number>>((acc, row) => {
  acc[row.bucket] = (acc[row.bucket] ?? 0) + 1;
  return acc;
}, {});

const statusCounts = rows.reduce<Record<string, number>>((acc, row) => {
  const key = row.status || "unknown";
  acc[key] = (acc[key] ?? 0) + 1;
  return acc;
}, {});

const groupRollupMissing = Array.from(
  new Set(rows.filter((row) => !row.groupRollupExists).map((row) => row.productGroupSlug).filter(Boolean)),
).sort();

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
fs.mkdirSync(REPORT_DIR, { recursive: true });
const baseName = `bestbottles-image-backfill-audit-${timestamp}`;
const jsonPath = path.join(REPORT_DIR, `${baseName}.json`);
const csvPath = path.join(REPORT_DIR, `${baseName}.csv`);

const summary = {
  generatedAt: new Date().toISOString(),
  filters: { group: groupFilter, family: familyFilter, organization: orgFilter },
  totals: {
    skuJobs: jobs.length,
    generatedImagesScanned: images.length,
    productGroups: groups.length,
  },
  buckets: counts,
  statuses: statusCounts,
  groupRollupMissing,
};

fs.writeFileSync(jsonPath, JSON.stringify({ summary, rows }, null, 2));
fs.writeFileSync(
  csvPath,
  [
    Object.keys(rows[0] ?? { bucket: "" }).join(","),
    ...rows.map((row) => Object.values(row).map(csvEscape).join(",")),
  ].join("\n"),
);

console.log(JSON.stringify(summary, null, 2));
console.log(`JSON report: ${jsonPath}`);
console.log(`CSV report: ${csvPath}`);
