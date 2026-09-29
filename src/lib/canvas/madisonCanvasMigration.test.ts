import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const migrationUrl = new URL(
  "../../../supabase/migrations/20260929010000_madison_canvas_week1.sql",
  import.meta.url,
);

function policyBodies(sql: string): string[] {
  const bodies: string[] = [];
  const re = /CREATE POLICY[\s\S]*?;/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(sql))) {
    bodies.push(match[0]);
  }
  return bodies;
}

describe("Madison Canvas week 1 migration", () => {
  const sql = readFileSync(migrationUrl, "utf8");

  it("creates projects, canvases, nodes, and edges with organization_id", () => {
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.canvas_projects/i);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.canvases/i);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.canvas_nodes/i);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.canvas_edges/i);
    assert.match(sql, /CONSTRAINT canvas_projects_pdp_requires_sku/i);
    assert.match(sql, /canvas_projects_one_active_pdp_per_sku/i);

    for (const table of ["canvas_projects", "canvases", "canvas_nodes", "canvas_edges"]) {
      const block = sql.slice(sql.indexOf(`CREATE TABLE IF NOT EXISTS public.${table}`));
      assert.match(block, /organization_id uuid NOT NULL/);
    }
  });

  it("does not create week-2 run, credit, slot, or push tables", () => {
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.canvas_runs/i);
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.canvas_jobs/i);
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.credit_ledger/i);
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.project_slots/i);
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.shopify_pushes/i);
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.project_schedules/i);
  });

  it("enables and forces RLS on every canvas table", () => {
    for (const table of ["canvas_projects", "canvases", "canvas_nodes", "canvas_edges"]) {
      assert.match(
        sql,
        new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, "i"),
      );
      assert.match(
        sql,
        new RegExp(`ALTER TABLE public\\.${table} FORCE ROW LEVEL SECURITY`, "i"),
      );
    }
  });

  it("scopes every policy to authenticated org members and never opens the table", () => {
    const policies = policyBodies(sql);
    assert.equal(policies.length, 16, "4 tables × 4 commands");
    for (const policy of policies) {
      assert.match(policy, /TO authenticated/);
      assert.match(policy, /is_organization_member\(\(select auth\.uid\(\)\), organization_id\)/);
      assert.doesNotMatch(policy, /USING\s*\(\s*true\s*\)/i);
      assert.doesNotMatch(policy, /TO public/i);
      assert.doesNotMatch(policy, /TO anon/i);
      assert.doesNotMatch(policy, /service_role/i);
    }
  });

  it("revokes PUBLIC/anon and does not grant the service role", () => {
    assert.match(sql, /REVOKE ALL ON TABLE public\.canvas_projects FROM PUBLIC, anon/i);
    assert.match(sql, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.canvas_projects TO authenticated/i);
    assert.doesNotMatch(sql, /GRANT .* TO service_role/i);
    assert.doesNotMatch(sql, /CREATE POLICY .* TO service_role/i);
  });

  it("locks organization_id and requires child rows to match the parent org", () => {
    assert.match(sql, /organization_id is immutable/i);
    assert.match(sql, /organization_id must match the parent project\/canvas/i);
    assert.match(sql, /canvas_lock_organization_id/i);
    assert.match(sql, /canvas_enforce_parent_organization/i);
  });

  it("stores product_hubs as the first SKU resolution source", () => {
    assert.match(sql, /'product_hubs'/);
    assert.match(sql, /product_hub_id uuid REFERENCES public\.product_hubs/);
  });
});
