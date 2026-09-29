import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isBlockedSsrfHostname, isPubliclyFetchableUrl } from "./urlSafety";

describe("urlSafety", () => {
  it("blocks private, loopback, and metadata hosts", () => {
    for (const host of [
      "localhost",
      "127.0.0.1",
      "10.0.0.8",
      "192.168.1.1",
      "172.16.0.1",
      "169.254.169.254",
      "metadata.google.internal",
      "something.internal",
      "printer.local",
    ]) {
      assert.equal(isBlockedSsrfHostname(host), true, host);
    }
  });

  it("allows public hostnames", () => {
    assert.equal(isBlockedSsrfHostname("bestbottles.com"), false);
    assert.equal(isPubliclyFetchableUrl("https://bestbottles.com/product"), true);
  });

  it("rejects non-https by default and file/data schemes always", () => {
    assert.equal(isPubliclyFetchableUrl("http://example.com"), false);
    assert.equal(isPubliclyFetchableUrl("http://example.com", { protocol: "http" }), true);
    assert.equal(isPubliclyFetchableUrl("file:///etc/passwd"), false);
    assert.equal(isPubliclyFetchableUrl("not a url"), false);
  });
});
