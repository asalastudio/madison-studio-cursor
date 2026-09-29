import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyLiteralRewriteRules, escapeRegExp, stripLiteralTerms } from "./literalReplace";

describe("literalReplace", () => {
  it("escapes regex metacharacters so user patterns stay literals", () => {
    assert.equal(escapeRegExp("a+b(c)"), "a\\+b\\(c\\)");
  });

  it("rewrites literals case-insensitively without compiling user regexes", () => {
    const out = applyLiteralRewriteRules("Bone studio. BONE canvas.", {
      bone: "cream",
      "(.*)": "should-not-capture",
    });
    assert.equal(out, "cream studio. cream canvas.");
  });

  it("strips prohibited terms as literals, including regex-looking strings", () => {
    const out = stripLiteralTerms("keep (.*) extra sage here", ["sage", "(.*)"], {
      wordBoundary: false,
    });
    assert.equal(out.replace(/\s+/g, " ").trim(), "keep extra here");
  });
});
