import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { escapeHtml } from "./htmlEscape";

describe("escapeHtml", () => {
  it("escapes markup and quotes that would break HTML email interpolation", () => {
    assert.equal(
      escapeHtml(`<a href="https://evil.example">x</a> & 'y'`),
      "&lt;a href=&quot;https://evil.example&quot;&gt;x&lt;/a&gt; &amp; &#39;y&#39;",
    );
  });

  it("stringifies nullish values to an empty string", () => {
    assert.equal(escapeHtml(null), "");
    assert.equal(escapeHtml(undefined), "");
  });
});
