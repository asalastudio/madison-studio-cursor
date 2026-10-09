import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGenerationAttemptCompletion,
  buildGenerationAttemptInsert,
  estimateUnverifiedCostUsd,
  sha256Hex,
} from "./generationAttemptLedger";

test("pending attempt records exact provider, model, prompt and references", async () => {
  const row = await buildGenerationAttemptInsert({
    organizationId: "10000000-0000-4000-8000-000000000001",
    userId: "20000000-0000-4000-8000-000000000002",
    lane: "paper-doll-candidate",
    provider: "google",
    model: "gemini-3.1-flash-image",
    endpoint: "interactions",
    prompt: "abc",
    referenceSha256s: ["a".repeat(64)],
  });
  assert.equal(row.status, "pending");
  assert.equal(row.model, "gemini-3.1-flash-image");
  assert.equal(row.prompt_sha256, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(row.reference_count, 1);
});

test("completion records latency and exact-model cost does not leak to other providers", () => {
  assert.equal(estimateUnverifiedCostUsd("openai", "gpt-image-2"), 0.42);
  assert.equal(estimateUnverifiedCostUsd("google", "gemini-3.1-flash-image"), null);
  const patch = buildGenerationAttemptCompletion(
    { id: "attempt", startedAtMs: 100 },
    { status: "succeeded" },
    150,
  );
  assert.equal(patch.latency_ms, 50);
});

test("insert hashes raw reference payloads when the caller sends fingerprint sources", async () => {
  const row = await buildGenerationAttemptInsert({
    organizationId: null,
    userId: null,
    lane: "darkroom",
    provider: "openai",
    model: "gpt-image-2.5-flare",
    endpoint: "edits",
    prompt: "abc",
    referenceFingerprintSources: ["aGVsbG8=", new Uint8Array([1, 2, 3])],
    requestSize: null,
  });
  assert.equal(row.reference_count, 2);
  assert.equal(row.reference_sha256s[0], await sha256Hex("aGVsbG8="));
  assert.equal(row.reference_sha256s[1].length, 64);
  assert.equal(row.request_size, null);
});

test("insert tolerates no references at all", async () => {
  const row = await buildGenerationAttemptInsert({
    organizationId: null, userId: null, lane: "darkroom", provider: "openai",
    model: "m", endpoint: "generations", prompt: "x",
  });
  assert.equal(row.reference_count, 0);
  assert.deepEqual(row.reference_sha256s, []);
});
