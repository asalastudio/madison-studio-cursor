import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const css = readFileSync(new URL("../../../src/styles/madison-canvas.css", import.meta.url), "utf8");

describe("madison canvas styles", () => {
  it("reuses Dark Room tokens for board chrome and keeps Bone off the UI", () => {
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");
    assert.match(rules, /--darkroom-bg/);
    assert.match(rules, /--darkroom-surface/);
    assert.match(rules, /--darkroom-accent/);
    assert.match(rules, /--font-display/);
    assert.match(rules, /--lcd-font/);
    assert.match(rules, /camera-panel/);
    assert.match(rules, /\.madison-canvas-node__run/);
    assert.match(rules, /\.madison-canvas__toolbar/);
    assert.match(rules, /\.madison-canvas__workspace/);
    assert.match(rules, /\.madison-canvas__board/);
    assert.match(rules, /flex:\s*0 0 320px/);
    assert.doesNotMatch(rules, /#F5F3EF/i);
    assert.doesNotMatch(rules, /#F5F1E8/i);
    assert.doesNotMatch(rules, /hsl\(var\(--background\)\)/);
  });
});
