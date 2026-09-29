import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const css = readFileSync(new URL("../../src/styles/video-studio.css", import.meta.url), "utf8");
const rail = readFileSync(new URL("../../src/components/video-studio/VideoControlRail.tsx", import.meta.url), "utf8");
const header = readFileSync(new URL("../../src/components/video-studio/VideoStudioHeader.tsx", import.meta.url), "utf8");
const strip = readFileSync(new URL("../../src/components/video-studio/VideoHistoryStrip.tsx", import.meta.url), "utf8");
const monitor = readFileSync(new URL("../../src/components/video-studio/VideoMonitor.tsx", import.meta.url), "utf8");

describe("video studio styles", () => {
  it("reuses Dark Room tokens and the Canvas-family chrome without cream UI", () => {
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");
    assert.match(rules, /--darkroom-bg/);
    assert.match(rules, /--darkroom-surface/);
    assert.match(rules, /--darkroom-accent/);
    assert.match(rules, /--font-display/);
    assert.match(rules, /--lcd-font/);
    assert.match(rules, /\.video-studio__inspector/);
    assert.match(rules, /\.camera-panel/);
    assert.match(rules, /\.video-studio__toolbar/);
    assert.match(rules, /radial-gradient/);
    assert.match(rules, /border-radius: 16px/);
    assert.match(rules, /scrollbar-width: thin/);
    assert.match(rules, /scrollbar-color: var\(--darkroom-border\)/);
    assert.match(rules, /\.video-studio__inspector-body::-webkit-scrollbar/);
    assert.match(rules, /\.video-studio-job--failure/);
    assert.doesNotMatch(rules, /#F5F3EF/i);
    assert.doesNotMatch(rules, /#F5F1E8/i);
    assert.doesNotMatch(rules, /hsl\(var\(--background\)\)/);
  });

  it("imports Dark Room primitives directly, not through the barrel", () => {
    assert.match(rail, /@\/components\/darkroom\/Chip/);
    assert.match(rail, /@\/components\/darkroom\/LEDIndicator/);
    assert.match(header, /@\/components\/darkroom\/LEDIndicator/);
    assert.match(strip, /@\/components\/darkroom\/Chip/);
    assert.match(monitor, /@\/components\/darkroom\/Chip/);
    assert.match(monitor, /Retry/);
    assert.doesNotMatch(rail, /from "@\/components\/darkroom"/);
    assert.doesNotMatch(header, /from "@\/components\/darkroom"/);
  });
});
