import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CLAUDE_FALLBACK_MAX_TOKENS,
  buildContinuationUserPrompt,
  geminiAuthHeaders,
  geminiGenerateContentUrl,
  isTruncatedFinishReason,
  shouldFallbackToClaude,
  withTimeout,
  fetchWithRetryOn503,
} from "./aiRequestUtils.ts";

describe("shouldFallbackToClaude", () => {
  it("falls back on quota, auth, and gateway errors", () => {
    assert.equal(shouldFallbackToClaude(429), true);
    assert.equal(shouldFallbackToClaude(403), true);
    assert.equal(shouldFallbackToClaude(502), true);
    assert.equal(shouldFallbackToClaude(503), true);
    assert.equal(shouldFallbackToClaude(504), true);
    assert.equal(shouldFallbackToClaude(400, "quota exceeded for this project"), true);
    assert.equal(shouldFallbackToClaude(400, "rate limit"), true);
  });

  it("does not fall back on ordinary client errors", () => {
    assert.equal(shouldFallbackToClaude(400, "invalid argument"), false);
    assert.equal(shouldFallbackToClaude(404), false);
    assert.equal(shouldFallbackToClaude(500), false);
  });
});

describe("isTruncatedFinishReason", () => {
  it("detects provider truncation signals", () => {
    assert.equal(isTruncatedFinishReason("MAX_TOKENS"), true);
    assert.equal(isTruncatedFinishReason("max_tokens"), true);
    assert.equal(isTruncatedFinishReason("length"), true);
    assert.equal(isTruncatedFinishReason("STOP"), false);
    assert.equal(isTruncatedFinishReason(undefined), false);
  });
});

describe("Claude fallback budget", () => {
  it("is high enough for a 1,500-word blog or a 7-email series", () => {
    assert.ok(CLAUDE_FALLBACK_MAX_TOKENS >= 16384);
  });
});

describe("buildContinuationUserPrompt", () => {
  it("asks the model to resume without repeating earlier text", () => {
    const prompt = buildContinuationUserPrompt(
      "Write a 1500 word blog.",
      "Once upon a time in Grasse,",
    );
    assert.match(prompt, /cut off/i);
    assert.match(prompt, /Do not repeat/i);
    assert.match(prompt, /Once upon a time in Grasse,/);
  });
});

describe("geminiAuthHeaders", () => {
  it("puts the key in x-goog-api-key and never in a query string helper", () => {
    const headers = geminiAuthHeaders("secret-test-key");
    assert.equal(headers["x-goog-api-key"], "secret-test-key");
    assert.equal(headers["Content-Type"], "application/json");

    const url = geminiGenerateContentUrl(
      "https://generativelanguage.googleapis.com/v1beta",
      "models/gemini-3.5-flash",
    );
    assert.equal(
      url,
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent",
    );
    assert.doesNotMatch(url, /[?&]key=/);
  });
});

describe("withTimeout", () => {
  it("aborts the in-flight work via AbortSignal", async () => {
    let observedAborted = false;
    await assert.rejects(
      () =>
        withTimeout(async (signal) => {
          await new Promise<void>((_, reject) => {
            signal.addEventListener("abort", () => {
              observedAborted = true;
              reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
            });
          });
          return "never";
        }, 20),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        return error.name === "AbortError" || /abort|timeout/i.test(error.message);
      },
    );
    assert.equal(observedAborted, true);
  });
});

describe("fetchWithRetryOn503", () => {
  it("retries 503 responses with backoff and then returns the success", async () => {
    const statuses = [503, 503, 200];
    let calls = 0;
    const delays: number[] = [];

    const response = await fetchWithRetryOn503(
      async () => {
        const status = statuses[calls] ?? 200;
        calls += 1;
        return new Response(JSON.stringify({ ok: status === 200 }), { status });
      },
      {
        maxRetries: 3,
        initialDelayMs: 1,
        sleep: async (ms) => {
          delays.push(ms);
        },
      },
    );

    assert.equal(response.status, 200);
    assert.equal(calls, 3);
    assert.deepEqual(delays, [1, 2]);
  });

  it("does not retry a 400", async () => {
    let calls = 0;
    const response = await fetchWithRetryOn503(
      async () => {
        calls += 1;
        return new Response("bad", { status: 400 });
      },
      { maxRetries: 3, initialDelayMs: 1, sleep: async () => undefined },
    );
    assert.equal(response.status, 400);
    assert.equal(calls, 1);
  });
});
