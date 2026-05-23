import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

type AuditRow = {
  bucket: string;
  jobId: string;
  productGroupSlug: string;
  family: string;
  graceSku: string;
  websiteSku: string;
  shopifySku: string;
  status: string;
  approvedImageId: string;
  approvedImageUrl: string;
  selectedImageId: string;
  selectedImageUrl: string;
  selectedImageCreatedAt: string;
};

type AuditReport = {
  summary?: {
    filters?: Record<string, unknown>;
  };
  rows: AuditRow[];
};

type CurrentJob = {
  id: string;
  family: string | null;
  grace_sku: string | null;
  website_sku: string | null;
  shopify_sku: string | null;
  status: string | null;
  approved_image_id: string | null;
  approved_image_url: string | null;
};

type PlanRow = {
  action: "update" | "skip";
  reason: string;
  jobId: string;
  productGroupSlug: string;
  family: string;
  graceSku: string;
  websiteSku: string;
  shopifySku: string;
  currentStatus: string;
  nextStatus: string;
  selectedImageId: string;
  selectedImageUrl: string;
  selectedImageCreatedAt: string;
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

function csvEscape(value: unknown): string {
  const text = clean(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

function latestAuditPath(): string {
  const files = fs
    .readdirSync(REPORT_DIR)
    .filter((file) => file.startsWith("bestbottles-image-backfill-audit-") && file.endsWith(".json"))
    .map((file) => path.join(REPORT_DIR, file))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  const latest = files[0];
  if (!latest) throw new Error(`No audit JSON files found in ${REPORT_DIR}`);
  return latest;
}

function readAudit(filePath: string): AuditReport {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as AuditReport;
  if (!Array.isArray(parsed.rows)) {
    throw new Error(`Audit file has no rows array: ${filePath}`);
  }
  return parsed;
}

function writePlan(rows: PlanRow[], baseName: string) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const jsonPath = path.join(REPORT_DIR, `${baseName}.json`);
  const csvPath = path.join(REPORT_DIR, `${baseName}.csv`);
  fs.writeFileSync(jsonPath, JSON.stringify(rows, null, 2));
  fs.writeFileSync(
    csvPath,
    [
      Object.keys(rows[0] ?? { action: "" }).join(","),
      ...rows.map((row) => Object.values(row).map(csvEscape).join(",")),
    ].join("\n"),
  );
  return { jsonPath, csvPath };
}

const auditPath = path.resolve(argValue("audit") ?? latestAuditPath());
const family = argValue("family") ?? "Empire";
const apply = process.argv.includes("--apply");
const bucket = argValue("bucket") ?? "safe-to-auto-approve";

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

const audit = readAudit(auditPath);
const candidates = audit.rows.filter(
  (row) =>
    row.bucket === bucket &&
    row.family === family &&
    row.selectedImageId &&
    row.selectedImageUrl,
);

const plan: PlanRow[] = [];
const now = new Date().toISOString();

for (const row of candidates) {
  const { data: current, error } = await supabase
    .from("best_bottles_pipeline_sku_jobs")
    .select("id,family,grace_sku,website_sku,shopify_sku,status,approved_image_id,approved_image_url")
    .eq("id", row.jobId)
    .maybeSingle();

  if (error) throw new Error(`Failed to verify ${row.jobId}: ${error.message}`);
  const job = current as CurrentJob | null;
  if (!job) {
    plan.push({ ...rowToPlan(row), action: "skip", reason: "Live job row no longer exists.", currentStatus: "" });
    continue;
  }

  const liveFamily = clean(job.family);
  const liveGraceSku = clean(job.grace_sku);
  const liveWebsiteSku = clean(job.website_sku);
  const liveShopifySku = clean(job.shopify_sku);
  const liveApprovedUrl = clean(job.approved_image_url);
  const liveStatus = clean(job.status);

  const skuStillMatches =
    liveGraceSku === row.graceSku &&
    liveWebsiteSku === row.websiteSku &&
    liveShopifySku === row.shopifySku;

  if (liveFamily !== family) {
    plan.push({
      ...rowToPlan(row),
      action: "skip",
      reason: `Live family changed from ${family} to ${liveFamily}.`,
      currentStatus: liveStatus,
    });
    continue;
  }
  if (!skuStillMatches) {
    plan.push({
      ...rowToPlan(row),
      action: "skip",
      reason: "Live SKU values changed since audit.",
      currentStatus: liveStatus,
    });
    continue;
  }
  if (liveApprovedUrl) {
    plan.push({
      ...rowToPlan(row),
      action: "skip",
      reason: "Live row already has an approved image.",
      currentStatus: liveStatus,
    });
    continue;
  }

  plan.push({
    ...rowToPlan(row),
    action: "update",
    reason: "Single exact SKU-tagged image candidate from audit.",
    currentStatus: liveStatus,
  });
}

if (apply) {
  for (const row of plan.filter((item) => item.action === "update")) {
    const { error } = await supabase
      .from("best_bottles_pipeline_sku_jobs")
      .update({
        generated_image_id: row.selectedImageId,
        generated_image_url: row.selectedImageUrl,
        approved_image_id: row.selectedImageId,
        approved_image_url: row.selectedImageUrl,
        approved_at: now,
        status: "approved",
        last_error: null,
      })
      .eq("id", row.jobId);
    if (error) throw new Error(`Failed to update ${row.graceSku}: ${error.message}`);
  }
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const baseName = `bestbottles-approved-image-backfill-${family.toLowerCase()}-${apply ? "applied" : "dry-run"}-${timestamp}`;
const { jsonPath, csvPath } = writePlan(plan, baseName);
const summary = {
  mode: apply ? "apply" : "dry-run",
  auditPath,
  family,
  bucket,
  candidates: candidates.length,
  plannedUpdates: plan.filter((row) => row.action === "update").length,
  skipped: plan.filter((row) => row.action === "skip").length,
  planJson: jsonPath,
  planCsv: csvPath,
};

console.log(JSON.stringify(summary, null, 2));

function rowToPlan(row: AuditRow): Omit<PlanRow, "action" | "reason" | "currentStatus"> {
  return {
    jobId: row.jobId,
    productGroupSlug: row.productGroupSlug,
    family: row.family,
    graceSku: row.graceSku,
    websiteSku: row.websiteSku,
    shopifySku: row.shopifySku,
    nextStatus: "approved",
    selectedImageId: row.selectedImageId,
    selectedImageUrl: row.selectedImageUrl,
    selectedImageCreatedAt: row.selectedImageCreatedAt,
  };
}
