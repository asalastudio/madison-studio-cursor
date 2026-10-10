import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isEntitledStatus, must, resolvePlanId } from "./stripeBilling";

const PLAN = "11111111-2222-3333-4444-555555555555";
function client(rows: Record<string, string>) {
  const calls: string[] = [];
  return {
    calls,
    from(table: string) {
      assert.equal(table, "subscription_plans");
      let col = "", val = "";
      const q = {
        select: () => q,
        eq: (c: string, v: string) => { col = c; val = v; return q; },
        maybeSingle: async () => { calls.push(`${col}=${val}`); return { data: rows[`${col}=${val}`] ? { id: rows[`${col}=${val}`] } : null, error: null }; },
      };
      return q;
    },
  };
}

describe("resolvePlanId", () => {
  it("uses a uuid from metadata", async () => {
    const c = client({ [`id=${PLAN}`]: PLAN });
    assert.equal(await resolvePlanId(c, PLAN, null), PLAN);
    assert.deepEqual(c.calls, [`id=${PLAN}`]);
  });
  it("maps a legacy slug in metadata to the plan id instead of querying id='studio'", async () => {
    const c = client({ "slug=studio": PLAN });
    assert.equal(await resolvePlanId(c, "studio", null), PLAN);
    assert.deepEqual(c.calls, ["slug=studio"]);
  });
  it("falls back to the monthly then yearly Stripe price", async () => {
    const c = client({ "stripe_price_id_yearly=price_y": PLAN });
    assert.equal(await resolvePlanId(c, "", "price_y"), PLAN);
    assert.deepEqual(c.calls, ["stripe_price_id_monthly=price_y", "stripe_price_id_yearly=price_y"]);
  });
  it("returns null when nothing matches", async () => {
    assert.equal(await resolvePlanId(client({}), "nope", "price_x"), null);
  });
});

describe("entitlement + errors", () => {
  it("only active/trialing are entitled", () => {
    assert.equal(isEntitledStatus("active"), true);
    assert.equal(isEntitledStatus("trialing"), true);
    for (const s of ["past_due", "canceled", "incomplete", "unpaid", null]) assert.equal(isEntitledStatus(s), false);
  });
  it("must() throws on a Supabase error so the webhook returns 500", () => {
    assert.throws(() => must({ error: { message: "boom" } }, "upsert"), /upsert: boom/);
    assert.doesNotThrow(() => must({ error: null }, "ok"));
  });
});
