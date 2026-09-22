/**
 * Apply review-gallery selections as the official approval state.
 *
 * Input: the JSON exported by the cylinder review gallery ("Export selections"
 * button → bb-cylinder-selections.json). For each selected render, finds its
 * `generated_images` row by exact image_url (org-scoped) and appends the
 * canonical `status:approved-keep` tag (`BEST_BOTTLES_STATUS_TAG_APPROVED_KEEP`
 * in src/lib/bestBottlesImageCoverage.ts) to `library_tags` — the ONLY status
 * that makes a variant complete / PDP-live. Idempotent; never removes tags.
 *
 * An item may carry `"status": "needs-regen"` to record a rejection instead
 * (`status:needs-regen`, the backlog tag in the pipeline brief). A rejection
 * never downgrades an image that is already approved-keep: that is reported as
 * a conflict and left for a person to resolve.
 *
 * Downstream: the Shopify publish preflight consumes approved-keep images —
 * this script deliberately does NOT push to Shopify itself.
 *
 * Usage:
 *   npx tsx scripts/best-bottles/apply-gallery-selections.ts <selections.json>            # dry run
 *   npx tsx scripts/best-bottles/apply-gallery-selections.ts <selections.json> --execute  # write tags
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
for (const f of [".env", ".env.local"]) {
  try { for (const l of readFileSync(f, "utf8").split(/\r?\n/)) { const m = l.match(/^\s*([A-Za-z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ""); } } catch { /* */ }
}
const ORG = "4ab1ac72-cd7e-4faf-9152-5aa5f2862411";
const APPROVED_TAG = "status:approved-keep";
const NEEDS_REGEN_TAG = "status:needs-regen";

(async () => {
  const file = process.argv[2];
  const execute = process.argv.includes("--execute");
  if (!file) throw new Error("Usage: apply-gallery-selections.ts <bb-cylinder-selections.json> [--execute]");
  const parsed = JSON.parse(readFileSync(path.resolve(file), "utf8")) as { items: Array<{ sku: string; url: string; status?: "approved-keep" | "needs-regen" }> };
  const items = parsed.items ?? [];
  if (items.length === 0) { console.log("No selections in file — nothing to do."); return; }
  console.log(`Selections: ${items.length} (${execute ? "EXECUTE" : "DRY RUN"})`);

  const sb = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  let approved = 0, already = 0, missing = 0, failed = 0, rejected = 0, conflicts = 0;
  const skusApproved: string[] = [];
  for (const item of items) {
    const { data, error } = await sb.from("generated_images").select("id,library_tags").eq("organization_id", ORG).eq("image_url", item.url).limit(2);
    if (error) { console.log(`  ! ${item.sku}: query failed — ${error.message}`); failed++; continue; }
    if (!data || data.length === 0) { console.log(`  ? ${item.sku}: no row for URL (purged already?)`); missing++; continue; }
    const row = data[0];
    const tags: string[] = Array.isArray(row.library_tags) ? row.library_tags : [];
    if (item.status === "needs-regen") {
      if (tags.includes(APPROVED_TAG)) { console.log(`  ! ${item.sku}: already approved-keep — not downgrading; resolve by hand`); conflicts++; continue; }
      if (tags.includes(NEEDS_REGEN_TAG)) { rejected++; continue; }
      if (execute) {
        const { error: upErr } = await sb.from("generated_images").update({ library_tags: [...tags, NEEDS_REGEN_TAG] }).eq("id", row.id);
        if (upErr) { console.log(`  ! ${item.sku}: update failed — ${upErr.message}`); failed++; continue; }
      }
      rejected++;
      continue;
    }
    if (tags.includes(NEEDS_REGEN_TAG)) { console.log(`  ! ${item.sku}: tagged needs-regen — not approving over a rejection; resolve by hand`); conflicts++; continue; }
    if (tags.includes(APPROVED_TAG)) { already++; skusApproved.push(item.sku); continue; }
    if (execute) {
      const { error: upErr } = await sb.from("generated_images").update({ library_tags: [...tags, APPROVED_TAG] }).eq("id", row.id);
      if (upErr) { console.log(`  ! ${item.sku}: update failed — ${upErr.message}`); failed++; continue; }
    }
    approved++; skusApproved.push(item.sku);
  }
  console.log(`\n${execute ? "tagged" : "would tag"} approved-keep : ${approved}`);
  console.log(`already approved              : ${already}`);
  console.log(`${execute ? "tagged" : "would tag"} needs-regen   : ${rejected}`);
  console.log(`conflicts left alone          : ${conflicts}`);
  console.log(`missing rows                  : ${missing}`);
  console.log(`failures                      : ${failed}`);
  console.log(`distinct SKUs now approved    : ${new Set(skusApproved).size}`);
  if (!execute) console.log(`\nDry run — re-run with --execute to write the tags.`);
})();
