import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  JEV_AUTO_CONFIDENCE,
  JEV_REVIEW_CONFIDENCE,
  JevError,
  askJev,
  resolveJevApiKey,
  routeByConfidence,
} from "./bestBottlesJev";

const stubFetch = (
  body: unknown,
  init: { ok?: boolean; status?: number } = {},
  capture?: { request?: { url: string; init: RequestInit } },
) =>
  (async (url: string, requestInit: RequestInit) => {
    if (capture) capture.request = { url, init: requestInit };
    return {
      ok: init.ok ?? true,
      status: init.status ?? 200,
      json: async () => body,
      text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    };
  }) as unknown as typeof fetch;

describe("bestBottlesJev", () => {
  it("posts model, state and questions to the System One endpoint", async () => {
    const capture: { request?: { url: string; init: RequestInit } } = {};
    const response = await askJev(
      { productName: "Slim design 50 ml clear glass bottle", diameter: "72 ±1 mm" },
      {
        bulb: { type: "noul", instructions: "This product has a vintage squeeze bulb atomizer." },
      },
      {
        apiKey: "test-key",
        fetchImpl: stubFetch(
          { model: "jev-latest", answers: { bulb: { type: "noul", noul: 0.02 } } },
          {},
          capture,
        ),
      },
    );

    assert.equal(response.answers.bulb.noul, 0.02);
    assert.equal(capture.request?.url, "https://api.typesafe.ai/v1/systemone");
    const headers = capture.request!.init.headers as Record<string, string>;
    assert.equal(headers.Authorization, "Bearer test-key");
    const sent = JSON.parse(String(capture.request!.init.body));
    assert.equal(sent.model, "jev-latest");
    assert.equal(sent.state.diameter, "72 ±1 mm");
    assert.equal(sent.questions.bulb.type, "noul");
  });

  it("fails loudly rather than returning a partial verdict", async () => {
    await assert.rejects(
      () =>
        askJev(
          "state",
          { a: { type: "noul", instructions: "x" }, b: { type: "noul", instructions: "y" } },
          { apiKey: "k", fetchImpl: stubFetch({ model: "jev-latest", answers: { a: { type: "noul", noul: 1 } } }) },
        ),
      (error: Error) => error instanceof JevError && /omitted an answer for "b"/.test(error.message),
    );

    await assert.rejects(
      () => askJev("state", { a: { type: "noul", instructions: "x" } }, { apiKey: "k", fetchImpl: stubFetch("upstream exploded", { ok: false, status: 503 }) }),
      (error: Error) => error instanceof JevError && /Jev returned 503/.test(error.message),
    );

    await assert.rejects(
      () => askJev("state", {} as never, { apiKey: "k", fetchImpl: stubFetch({}) }),
      (error: Error) => /at least one question/.test(error.message),
    );
  });

  it("rejects a Choice question that exceeds the documented option limit", async () => {
    const criteria = Object.fromEntries(
      Array.from({ length: 256 }, (_, index) => [`option-${index}`, null]),
    );
    await assert.rejects(
      () =>
        askJev(
          "state",
          { body: { type: "choice", instructions: "pick", criteria } },
          { apiKey: "k", fetchImpl: stubFetch({}) },
        ),
      (error: Error) => /exceeds the 255-option limit/.test(error.message),
    );
  });

  it("names the website repo when the key is missing", () => {
    assert.throws(
      () => resolveJevApiKey({}),
      (error: Error) => error instanceof JevError && /website repo carries it in \.env\.local/.test(error.message),
    );
    assert.equal(resolveJevApiKey({ TYPESAFE_API_KEY: " abc " }), "abc");
  });

  it("routes an absent or unsure confidence to a human, never to auto", () => {
    // Confidence is distribution shape, not probability of correctness, so the
    // unknown case must fail toward review.
    assert.equal(routeByConfidence(undefined), "review");
    assert.equal(routeByConfidence(null), "review");
    assert.equal(routeByConfidence(Number.NaN), "review");

    assert.equal(routeByConfidence(JEV_REVIEW_CONFIDENCE - 0.01), "review");
    assert.equal(routeByConfidence(JEV_REVIEW_CONFIDENCE), "confirm");
    assert.equal(routeByConfidence(JEV_AUTO_CONFIDENCE - 0.01), "confirm");
    assert.equal(routeByConfidence(JEV_AUTO_CONFIDENCE), "auto");
    assert.equal(routeByConfidence(1), "auto");

    // Irreversible work can demand a stricter bar than the default.
    assert.equal(routeByConfidence(0.92, { auto: 0.95 }), "confirm");
  });
});
