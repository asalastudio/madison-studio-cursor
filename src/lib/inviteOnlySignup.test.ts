import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isSignupAllowed } from "./inviteOnlySignup";

describe("isSignupAllowed", () => {
  it("is false for a plain /auth visit", () => assert.equal(isSignupAllowed("", undefined), false));
  it("is true for invite links", () => {
    assert.equal(isSignupAllowed("?mode=signup", undefined), true);
    assert.equal(isSignupAllowed("?invite=abc", undefined), true);
  });
  it("ignores other modes", () => assert.equal(isSignupAllowed("?mode=signin", undefined), false));
  it("honours the open-signup flag", () => assert.equal(isSignupAllowed("", "true"), true));
});
