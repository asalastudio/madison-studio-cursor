import assert from "node:assert/strict";
import test from "node:test";

import { resolveOrgSubscriptionTier } from "./orgSubscriptionTier.ts";

function fakeClient(rows: Record<string, unknown>) {
  const calls: string[] = [];
  const client = {
    from(table: string) {
      calls.push(table);
      const q: any = {
        select: (cols: string) => {
          assert.doesNotMatch(cols, /subscription_tier|stripe_subscription_status/);
          return q;
        },
        eq: () => q, order: () => q, limit: () => q,
        maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
      };
      return q;
    },
  };
  return { client, calls };
}

test("tier comes from subscriptions → subscription_plans.slug", async () => {
  const { client, calls } = fakeClient({ subscriptions: { status: "active", plan_id: "p1" }, subscription_plans: { slug: "Signature" } });
  assert.deepEqual(await resolveOrgSubscriptionTier(client, "org"), { tier: "signature", status: "active", isActive: true });
  assert.deepEqual(calls, ["subscriptions", "subscription_plans"]);
});

test("no subscription row falls back to essentials, inactive", async () => {
  const { client, calls } = fakeClient({});
  assert.deepEqual(await resolveOrgSubscriptionTier(client, "org"), { tier: "essentials", status: null, isActive: false });
  assert.deepEqual(calls, ["subscriptions"]);
  assert.equal((await resolveOrgSubscriptionTier(client, null)).tier, "essentials");
});
