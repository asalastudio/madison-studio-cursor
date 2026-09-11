/**
 * Failure classification and backoff for the publishing scheduler.
 *
 * The scheduler must distinguish three outcomes, because they have different
 * consequences for an operator: a transient network/rate-limit failure (retry),
 * a token problem (stop and flag the connection for re-auth), and a content
 * problem (stop and surface the error — retrying will never help).
 */

export type PublishOutcome = "success" | "retryable_error" | "permanent_error";

export interface ClassifiedFailure {
  outcome: Exclude<PublishOutcome, "success">;
  /** Connection should be marked needs_reauth and the operator prompted. */
  requiresReauth: boolean;
  code: string;
  message: string;
  httpStatus?: number;
}

/** Error codes that mean the token is dead regardless of HTTP status. */
const REAUTH_CODES = new Set([
  "invalid_token",
  "token_expired",
  "REVOKED_ACCESS_TOKEN",
  "invalid_grant",
  "access_denied",
]);

export function classifyPublishFailure(input: {
  httpStatus?: number;
  code?: string | null;
  message?: string | null;
}): ClassifiedFailure {
  const status = input.httpStatus;
  const code = input.code ?? "publish_failed";
  const message = input.message ?? "Publishing failed.";
  const haystack = `${code} ${message}`.toLowerCase();

  const looksLikeAuth =
    REAUTH_CODES.has(code) ||
    status === 401 ||
    haystack.includes("access token") ||
    haystack.includes("token has expired") ||
    haystack.includes("session has expired") ||
    haystack.includes("re-authenticate");

  if (looksLikeAuth) {
    return {
      outcome: "permanent_error",
      requiresReauth: true,
      code,
      message,
      httpStatus: status,
    };
  }

  // Rate limits and platform-side hiccups are worth another pass.
  const retryable =
    status === 429 ||
    (status !== undefined && status >= 500) ||
    haystack.includes("rate limit") ||
    haystack.includes("please retry") ||
    haystack.includes("try again") ||
    haystack.includes("temporarily unavailable") ||
    haystack.includes("timeout") ||
    haystack.includes("etimedout") ||
    haystack.includes("econnreset") ||
    haystack.includes("network");

  return {
    outcome: retryable ? "retryable_error" : "permanent_error",
    requiresReauth: false,
    code,
    message,
    httpStatus: status,
  };
}

/**
 * Exponential backoff with a deterministic jitter seed so tests can assert it.
 * attemptCount is 1-based (the first failure produces attemptCount === 1).
 */
export function backoffDelaySeconds(attemptCount: number, jitter = 0): number {
  const safeAttempt = Math.max(1, Math.min(attemptCount, 10));
  const base = 60 * Math.pow(2, safeAttempt - 1); // 60s, 120s, 240s, 480s...
  const capped = Math.min(base, 3600);
  const spread = Math.round(capped * 0.2 * clamp01(jitter));
  return capped + spread;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export interface NextAttemptPlan {
  status: "scheduled" | "failed";
  publishAfter: string | null;
  retriesRemaining: number;
}

/**
 * Decides what the scheduler writes back after a failed attempt.
 */
export function planNextAttempt(input: {
  failure: ClassifiedFailure;
  attemptCount: number;
  maxAttempts: number;
  now: Date;
  jitter?: number;
}): NextAttemptPlan {
  const retriesRemaining = Math.max(0, input.maxAttempts - input.attemptCount);

  if (input.failure.outcome === "permanent_error" || retriesRemaining === 0) {
    return { status: "failed", publishAfter: null, retriesRemaining };
  }

  const delay = backoffDelaySeconds(input.attemptCount, input.jitter ?? 0);
  const next = new Date(input.now.getTime() + delay * 1000);
  return {
    status: "scheduled",
    publishAfter: next.toISOString(),
    retriesRemaining,
  };
}
