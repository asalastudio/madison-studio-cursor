import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BFL_FLUX3_ENDPOINT } from "./bflFlux3Layout.ts";
import { BflProviderError, generateFlux3Image } from "./bflProvider.ts";

const POLL_URL = "https://api.bfl.ai/v1/get_result?id=task_123";
const SAMPLE_URL = "https://delivery.bfl.ai/sample.png";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("FLUX 3 provider client", () => {
  it("fails clearly when BFL_API_KEY is missing", async () => {
    await assert.rejects(
      () => generateFlux3Image(
        { prompt: "A bottle." },
        { getEnv: () => undefined, fetchImpl: fetch },
      ),
      (error: unknown) => {
        assert.ok(error instanceof BflProviderError);
        assert.equal(error.code, "missing_api_key");
        assert.match(error.message, /BFL_API_KEY/);
        return true;
      },
    );
  });

  it("submits documented fields, polls to Ready, and downloads the sample without the API key", async () => {
    const calls: Array<{ url: string; method: string; headers: Headers; body: string | undefined }> = [];
    const statuses = ["Pending", "Reasoning", "Generating", "Ready"];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      const url = String(input);
      calls.push({
        url,
        method: init?.method ?? "GET",
        headers,
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      if (url === SAMPLE_URL) {
        return new Response(Uint8Array.from([9, 8, 7]), {
          status: 200,
          headers: { "content-type": "image/png" },
        });
      }
      if (init?.method === "POST") {
        return jsonResponse({ id: "task_123", polling_url: POLL_URL, cost: 4 });
      }
      const status = statuses.shift();
      if (status !== "Ready") return jsonResponse({ status });
      return jsonResponse({
        status: "Ready",
        result: { sample: SAMPLE_URL, prompt: "expanded bottle prompt", duration: 3.5 },
      });
    }) as typeof fetch;

    const result = await generateFlux3Image(
      {
        prompt: "A clear bottle on stone.",
        aspectRatio: "4:5",
        resolution: "2k",
        images: ["https://cdn.example.com/ref.png"],
        pollIntervalMs: 0,
      },
      {
        getEnv: (name) => (name === "BFL_API_KEY" ? "test-key" : undefined),
        fetchImpl,
        sleep: async () => {},
        now: () => 0,
      },
    );

    assert.equal(calls[0]?.url, BFL_FLUX3_ENDPOINT);
    assert.equal(calls[0]?.method, "POST");
    assert.equal(calls[0]?.headers.get("x-key"), "test-key");
    const submitted = JSON.parse(calls[0]?.body ?? "{}") as Record<string, unknown>;
    assert.deepEqual(Object.keys(submitted).sort(), ["aspect_ratio", "images", "prompt", "resolution"]);
    assert.equal(submitted.seed, undefined);
    assert.equal(submitted.width, undefined);
    assert.equal(submitted.input_image, undefined);

    const sampleCall = calls.find((call) => call.url === SAMPLE_URL);
    assert.ok(sampleCall);
    assert.equal(sampleCall?.headers.get("x-key"), null);
    assert.equal(result.taskId, "task_123");
    assert.equal(result.revisedPrompt, "expanded bottle prompt");
    assert.equal(result.mimeType, "image/png");
    assert.ok(result.imageBytes.byteLength > 0);
  });

  it("surfaces moderation, task errors, and HTTP 422 field names", async () => {
    const pollModerated = (async (input: RequestInfo | URL) => {
      if (String(input) === BFL_FLUX3_ENDPOINT) return jsonResponse({ id: "task_1", polling_url: POLL_URL });
      return jsonResponse({ status: "Request Moderated" });
    }) as typeof fetch;

    await assert.rejects(
      () => generateFlux3Image(
        { prompt: "blocked", pollIntervalMs: 0 },
        { getEnv: () => "test-key", fetchImpl: pollModerated, sleep: async () => {}, now: () => 0 },
      ),
      /Request Moderated/,
    );

    const pollError = (async (input: RequestInfo | URL) => {
      if (String(input) === BFL_FLUX3_ENDPOINT) return jsonResponse({ id: "task_1", polling_url: POLL_URL });
      return jsonResponse({ status: "Error", detail: "transient worker" });
    }) as typeof fetch;
    await assert.rejects(
      () => generateFlux3Image(
        { prompt: "fail", pollIntervalMs: 0 },
        { getEnv: () => "test-key", fetchImpl: pollError, sleep: async () => {}, now: () => 0 },
      ),
      /transient worker/,
    );

    const rejected = (async () => jsonResponse({
      detail: [{ loc: ["body", "aspect_ratio"], msg: "Input should be '4:5'", type: "enum" }],
    }, 422)) as typeof fetch;
    await assert.rejects(
      () => generateFlux3Image(
        { prompt: "bad ratio" },
        { getEnv: () => "test-key", fetchImpl: rejected, sleep: async () => {}, now: () => 0 },
      ),
      (error: unknown) => {
        assert.ok(error instanceof BflProviderError);
        assert.equal(error.httpStatus, 422);
        assert.match(error.message, /aspect_ratio/);
        return true;
      },
    );
  });

  it("treats a 503 poll body with status Ready as a finished task", async () => {
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return jsonResponse({ id: "task_503", polling_url: POLL_URL });
      if (String(input) === SAMPLE_URL) {
        return new Response(Uint8Array.from([1, 2, 3]), { status: 200, headers: { "content-type": "image/webp" } });
      }
      return jsonResponse({ status: "Ready", result: { sample: SAMPLE_URL } }, 503);
    }) as typeof fetch;

    const result = await generateFlux3Image(
      { prompt: "ok", pollIntervalMs: 0 },
      { getEnv: () => "test-key", fetchImpl, sleep: async () => {}, now: () => 0 },
    );
    assert.equal(result.mimeType, "image/webp");
    assert.equal(result.taskId, "task_503");
  });
});

describe("FLUX 3 live smoke", () => {
  const live = process.env.BFL_FLUX3_LIVE_SMOKE === "1" && Boolean(process.env.BFL_API_KEY?.trim());

  it("generates a tiny image when BFL_FLUX3_LIVE_SMOKE=1", { skip: !live }, async () => {
    const result = await generateFlux3Image({
      prompt: "A single clear glass bottle centered on warm stone. No text.",
      aspectRatio: "1:1",
      resolution: "768sq",
      pollTimeoutMs: 180_000,
    });
    assert.ok(result.imageBytes.byteLength > 32);
  });
});
