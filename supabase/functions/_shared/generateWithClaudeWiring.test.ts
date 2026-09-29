import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(
  new URL("../generate-with-claude/index.ts", import.meta.url),
  "utf8",
);

describe("generate-with-claude wiring", () => {
  it("imports format specs and uses Phase 3.5 context", () => {
    assert.match(source, /formatInstructionsForGenerateMode/);
    assert.match(source, /resolveCopywritingStyleSection/);
    assert.match(source, /usePhase35/);
    assert.match(source, /CLAUDE_FALLBACK_MAX_TOKENS/);
    assert.match(source, /shouldFallbackToClaude/);
    assert.match(source, /truncated/);
    assert.match(source, /geminiAuthHeaders/);
    assert.doesNotMatch(
      source,
      /generateContent\?key=\$\{GEMINI_API_KEY\}/,
    );
    assert.doesNotMatch(source, /max_tokens:\s*4096/);
  });
});
