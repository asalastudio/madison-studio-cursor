import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultTrustedAppOrigin,
  parseSignedOAuthState,
  signOAuthNonce,
  trustedAppOrigin,
} from "./oauthState.ts";

describe("oauthState", () => {
  it("allowlists Madison and preview origins and rejects open redirects", () => {
    assert.equal(
      trustedAppOrigin("https://app.madisonstudio.io"),
      "https://app.madisonstudio.io",
    );
    assert.equal(
      trustedAppOrigin("https://madison-studio-cursor.vercel.app"),
      "https://madison-studio-cursor.vercel.app",
    );
    assert.equal(trustedAppOrigin("https://evil.example"), null);
    assert.equal(trustedAppOrigin("https://the-whispered-codex.lovable.app"), null);
    assert.equal(
      trustedAppOrigin("https://preview.example", "https://preview.example"),
      "https://preview.example",
    );
    assert.equal(defaultTrustedAppOrigin(undefined), "https://app.madisonstudio.io");
  });

  it("round-trips a signed nonce and rejects a forged hmac", async () => {
    const signed = await signOAuthNonce("aabbccddeeff00112233445566778899aabbccdd", "secret");
    const parsed = await parseSignedOAuthState(signed, "secret");
    assert.deepEqual(parsed, { nonce: "aabbccddeeff00112233445566778899aabbccdd" });
    assert.equal(await parseSignedOAuthState(signed, "other-secret"), null);
    assert.equal(
      await parseSignedOAuthState(
        "aabbccddeeff00112233445566778899aabbccdd.0000000000000000000000000000000000000000000000000000000000000000",
        "secret",
      ),
      null,
    );
    assert.equal(await parseSignedOAuthState("not-signed", "secret"), null);
  });
});
