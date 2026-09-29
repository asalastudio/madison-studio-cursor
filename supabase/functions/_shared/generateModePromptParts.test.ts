import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildFormatInstructions } from "./deliverableSpecs.ts";
import {
  DEDICATED_VIDEO_SCRIPT_TYPES,
  formatInstructionsForGenerateMode,
  resolveCopywritingStyleSection,
} from "./generateModePromptParts.ts";

describe("resolveCopywritingStyleSection", () => {
  it("uses the Phase 3.5 sequencing context instead of the style overlay", () => {
    const section = resolveCopywritingStyleSection({
      usePhase3: false,
      usePhase35: true,
      copywritingStyleContext: "SEQUENCE: Problem → Agitate → Solve",
      selectedStyleOverlay: "LEGACY OGILVY OVERLAY",
    });

    assert.equal(section, "SEQUENCE: Problem → Agitate → Solve");
  });

  it("uses the Phase 3 style-selection context when Phase 3.5 is off", () => {
    const section = resolveCopywritingStyleSection({
      usePhase3: true,
      usePhase35: false,
      copywritingStyleContext: "Choose between Ogilvy and Bernbach",
      selectedStyleOverlay: "LEGACY OGILVY OVERLAY",
    });

    assert.equal(section, "Choose between Ogilvy and Bernbach");
  });

  it("falls back to the style overlay when neither phase produced context", () => {
    const section = resolveCopywritingStyleSection({
      usePhase3: false,
      usePhase35: false,
      copywritingStyleContext: "",
      selectedStyleOverlay: "LEGACY OGILVY OVERLAY",
    });

    assert.equal(section, "LEGACY OGILVY OVERLAY");
  });
});

describe("formatInstructionsForGenerateMode", () => {
  it("injects per-format rules for a selected content type", () => {
    const blog = formatInstructionsForGenerateMode("blog_article");
    const expected = buildFormatInstructions("blog_article");

    assert.ok(expected.length > 0, "deliverableSpecs must define blog_article");
    assert.match(blog, /FORMAT REQUIREMENTS/);
    assert.ok(blog.includes(expected));
  });

  it("injects email-sequence structure without relying on the video-script block", () => {
    const series = formatInstructionsForGenerateMode("email_7part");

    assert.match(series, /FORMAT REQUIREMENTS/);
    assert.match(series, /EMAIL 1/i);
  });

  it("skips format-spec injection for the dedicated video-script block types", () => {
    for (const contentType of DEDICATED_VIDEO_SCRIPT_TYPES) {
      assert.equal(formatInstructionsForGenerateMode(contentType), "");
    }
  });

  it("returns empty string for unknown or missing types", () => {
    assert.equal(formatInstructionsForGenerateMode(""), "");
    assert.equal(formatInstructionsForGenerateMode(undefined), "");
    assert.equal(formatInstructionsForGenerateMode("not_a_real_format"), "");
  });
});
