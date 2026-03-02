/**
 * Simple in-memory rate limiter for edge functions.
 *
 * Usage:
 *   import { checkRateLimit } from "../_shared/rateLimit.ts";
 *
 *   const { allowed, retryAfter } = checkRateLimit(`generate:${userId}`, 10, 60);
 *   if (!allowed) {
 *     return new Response(JSON.stringify({ error: "Too many requests" }), {
 *       status: 429,
 *       headers: { ...corsHeaders, "Retry-After": String(retryAfter) },
 *     });
 *   }
 *
 * Note: Resets on cold start, which is acceptable for edge functions.
 * For stricter rate limiting, use a Redis-backed solution.
 */

const buckets = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number
): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true };
  }

  if (bucket.count >= maxRequests) {
    return {
      allowed: false,
      retryAfter: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }

  bucket.count++;
  return { allowed: true };
}
