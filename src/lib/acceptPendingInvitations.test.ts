import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  acceptPendingInvitations,
  type InvitationRpc,
} from "./acceptPendingInvitations.ts";

describe("accept_pending_invitations_for_user", () => {
  it("uses the two-argument function that production still serves", async () => {
    const calls: string[] = [];
    const rpc: InvitationRpc = async (_fn, args) => {
      calls.push(args ? "legacy" : "zero");
      if (!args) return { data: null, error: { status: 404, message: "not found" } };
      return { data: [], error: null };
    };

    const result = await acceptPendingInvitations(rpc, {
      id: "user-1",
      email: "abbass@example.com",
    });

    assert.deepEqual(calls, ["legacy"]);
    assert.equal(result.via, "legacy-args");
    assert.equal(result.error, null);
  });

  it("falls through to the zero-argument function after the legacy signature is removed", async () => {
    const rpc: InvitationRpc = async (_fn, args) => {
      if (args) return { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
      return { data: [{ invitation_id: "inv" }], error: null };
    };

    const result = await acceptPendingInvitations(rpc, {
      id: "user-1",
      email: "abbass@example.com",
    });

    assert.equal(result.via, "zero-arg");
    assert.ok(Array.isArray(result.data));
  });
});