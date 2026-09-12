import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { backoffDelaySeconds, classifyPublishFailure, planNextAttempt } from "./retry.ts";

describe("classifyPublishFailure", () => {
  it("treats 401 as permanent and re-auth worthy", () => {
    const result = classifyPublishFailure({ httpStatus: 401, message: "Unauthorized" });
    assert.equal(result.outcome, "permanent_error");
    assert.equal(result.requiresReauth, true);
  });

  it("detects an expired token from the message alone", () => {
    const result = classifyPublishFailure({
      httpStatus: 400,
      code: "meta_190",
      message: "Error validating access token: Session has expired",
    });
    assert.equal(result.requiresReauth, true);
    assert.equal(result.outcome, "permanent_error");
  });

  it("treats rate limits and 5xx as retryable", () => {
    assert.equal(
      classifyPublishFailure({ httpStatus: 429, message: "Rate limit reached" }).outcome,
      "retryable_error",
    );
    assert.equal(
      classifyPublishFailure({ httpStatus: 503, message: "Service unavailable" }).outcome,
      "retryable_error",
    );
  });

  it("treats a content rejection as permanent without re-auth", () => {
    const result = classifyPublishFailure({
      httpStatus: 400,
      code: "aspect_ratio_out_of_range",
      message: "Instagram accepts aspect ratios between 0.8 and 1.91",
    });
    assert.equal(result.outcome, "permanent_error");
    assert.equal(result.requiresReauth, false);
  });
});

describe("backoffDelaySeconds", () => {
  it("doubles per attempt and caps at an hour", () => {
    assert.equal(backoffDelaySeconds(1), 60);
    assert.equal(backoffDelaySeconds(2), 120);
    assert.equal(backoffDelaySeconds(3), 240);
    assert.equal(backoffDelaySeconds(9), 3600);
    assert.equal(backoffDelaySeconds(50), 3600);
  });

  it("adds up to 20% jitter", () => {
    assert.equal(backoffDelaySeconds(1, 1), 72);
    assert.equal(backoffDelaySeconds(1, 0.5), 66);
    assert.equal(backoffDelaySeconds(1, -3), 60);
  });
});

describe("planNextAttempt", () => {
  const now = new Date("2026-09-11T10:00:00.000Z");

  it("reschedules a retryable failure with backoff", () => {
    const plan = planNextAttempt({
      failure: classifyPublishFailure({ httpStatus: 429, message: "Rate limit reached" }),
      attemptCount: 1,
      maxAttempts: 5,
      now,
    });
    assert.equal(plan.status, "scheduled");
    assert.equal(plan.publishAfter, "2026-09-11T10:01:00.000Z");
    assert.equal(plan.retriesRemaining, 4);
  });

  it("gives up once attempts are exhausted", () => {
    const plan = planNextAttempt({
      failure: classifyPublishFailure({ httpStatus: 429, message: "Rate limit reached" }),
      attemptCount: 5,
      maxAttempts: 5,
      now,
    });
    assert.equal(plan.status, "failed");
    assert.equal(plan.publishAfter, null);
  });

  it("never retries a permanent failure", () => {
    const plan = planNextAttempt({
      failure: classifyPublishFailure({ httpStatus: 400, message: "Caption too long" }),
      attemptCount: 1,
      maxAttempts: 5,
      now,
    });
    assert.equal(plan.status, "failed");
  });
});
