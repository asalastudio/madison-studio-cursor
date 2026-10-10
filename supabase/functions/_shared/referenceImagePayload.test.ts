import assert from "node:assert/strict";
import test from "node:test";

import {
  assertReferenceBudget,
  base64ToBytes,
  bytesToBase64,
  createReferencePayload,
  MAX_MULTI_REFERENCE_TOTAL_BYTES,
  ReferenceBudgetError,
  referenceBytes,
  storageTransformUrl,
} from "./referenceImagePayload.ts";

const SB = "https://abc.supabase.co";

test("public storage object URLs go through the image transformer at 2048px", () => {
  const out = storageTransformUrl(`${SB}/storage/v1/object/public/generated-images/org/a%20b/x__rigged.png`, SB);
  assert.ok(out);
  const u = new URL(out!);
  assert.equal(u.pathname, "/storage/v1/render/image/public/generated-images/org/a%20b/x__rigged.png");
  assert.equal(u.searchParams.get("width"), "2048");
  assert.equal(u.searchParams.get("height"), "2048");
  assert.equal(u.searchParams.get("resize"), "contain");
});

test("foreign, signed and malformed URLs are not rewritten", () => {
  assert.equal(storageTransformUrl("https://cdn.example.com/x.png", SB), null);
  assert.equal(storageTransformUrl(`${SB}/storage/v1/object/sign/b/x.png?token=t`, SB), null);
  assert.equal(storageTransformUrl("not a url", SB), null);
  assert.equal(storageTransformUrl(`${SB}/storage/v1/object/public/b/x.png`, undefined), null);
});

test("base64 is lazy, cached and round-trips", () => {
  const bytes = new Uint8Array(100_000).map((_, i) => i % 251);
  const p = createReferencePayload(bytes, "image/png");
  const b64 = p.data;
  assert.equal(p.data, b64);
  assert.deepEqual(base64ToBytes(b64), bytes);
  assert.equal(bytesToBase64(new Uint8Array([104, 105])), "aGk=");
  assert.deepEqual(referenceBytes({ data: "aGk=" }), new Uint8Array([104, 105]));
  assert.equal(referenceBytes(p), bytes);
});

test("multi-reference requests get the tighter combined budget", () => {
  const mb = 1024 * 1024;
  // Three un-shrunk 2.5 MB references are refused with a clear message
  // instead of running the worker out of CPU.
  assert.throws(() => assertReferenceBudget([2.5 * mb, 2.5 * mb], 2.5 * mb, 3), ReferenceBudgetError);
  assert.doesNotThrow(() => assertReferenceBudget([1 * mb, 1 * mb], 1 * mb, 3));
  assert.doesNotThrow(() => assertReferenceBudget([], 4 * mb, 1));
  assert.throws(() => assertReferenceBudget([], 6 * mb, 1), /under 5MB/);
  assert.ok(MAX_MULTI_REFERENCE_TOTAL_BYTES < 12 * mb);
});
