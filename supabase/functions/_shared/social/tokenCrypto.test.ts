import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  decryptToken,
  encryptToken,
  importEncryptionKey,
  isLegacyCipher,
  TokenCryptoError,
} from "./tokenCrypto.ts";

const BASE64_KEY = "c2VjcmV0LWtleS1mb3ItbWFkaXNvbi10ZXN0cy0zMmI=";
const HEX_KEY = "a".repeat(64);

describe("importEncryptionKey", () => {
  it("accepts a base64 32-byte key", async () => {
    const key = await importEncryptionKey(BASE64_KEY);
    assert.ok(key);
  });

  it("accepts a 64-character hex key", async () => {
    const key = await importEncryptionKey(HEX_KEY);
    assert.ok(key);
  });

  it("rejects an empty secret", async () => {
    await assert.rejects(() => importEncryptionKey(""), TokenCryptoError);
  });

  it("rejects a key of the wrong length", async () => {
    await assert.rejects(() => importEncryptionKey(btoa("too short")), TokenCryptoError);
  });
});

describe("encryptToken / decryptToken", () => {
  it("round-trips a token", async () => {
    const key = await importEncryptionKey(BASE64_KEY);
    const cipher = await encryptToken("EAAG-page-token-value", key);
    assert.ok(cipher.startsWith("v1:"));
    assert.equal(await decryptToken(cipher, key), "EAAG-page-token-value");
  });

  it("produces a different ciphertext each time (fresh IV)", async () => {
    const key = await importEncryptionKey(BASE64_KEY);
    const a = await encryptToken("same-token", key);
    const b = await encryptToken("same-token", key);
    assert.notEqual(a, b);
    assert.equal(await decryptToken(a, key), await decryptToken(b, key));
  });

  it("refuses to encrypt an empty token", async () => {
    const key = await importEncryptionKey(BASE64_KEY);
    await assert.rejects(() => encryptToken("", key), TokenCryptoError);
  });

  it("fails closed when the key has been rotated", async () => {
    const key = await importEncryptionKey(BASE64_KEY);
    const otherKey = await importEncryptionKey(HEX_KEY);
    const cipher = await encryptToken("token", key);
    await assert.rejects(() => decryptToken(cipher, otherKey), TokenCryptoError);
  });

  it("still reads the legacy LinkedIn enc: format", async () => {
    const key = await importEncryptionKey(BASE64_KEY);
    const legacy = `enc:${btoa("legacy-linkedin-token")}`;
    assert.equal(isLegacyCipher(legacy), true);
    assert.equal(await decryptToken(legacy, key), "legacy-linkedin-token");
  });

  it("rejects an unrecognised ciphertext shape", async () => {
    const key = await importEncryptionKey(BASE64_KEY);
    await assert.rejects(() => decryptToken("plain-token", key), TokenCryptoError);
    await assert.rejects(() => decryptToken("v1:only-two-parts", key), TokenCryptoError);
  });
});
