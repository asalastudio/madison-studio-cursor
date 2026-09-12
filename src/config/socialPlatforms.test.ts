import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SOCIAL_PLATFORMS, SOCIAL_PLATFORM_ORDER } from "./socialPlatforms.ts";
// Test-only cross-import: the app build excludes supabase/functions, but the
// two registries must not drift, so the drift check lives here.
import { SOCIAL_PLATFORM_RULES } from "../../supabase/functions/_shared/social/platformRules.ts";

const SHARED_KEYS = [
  "supported",
  "captionMaxLength",
  "titleMaxLength",
  "mediaRequired",
  "minMediaCount",
  "maxMediaCount",
  "allowsMixedMedia",
  "supportsLinkField",
  "linksInCaptionAreClickable",
  "supportsFirstComment",
  "recommendedHashtagLimit",
  "hashtagHardLimit",
] as const;

describe("socialPlatforms registry", () => {
  it("covers exactly the platforms the edge rules define", () => {
    assert.deepEqual(
      Object.keys(SOCIAL_PLATFORMS).sort(),
      Object.keys(SOCIAL_PLATFORM_RULES).sort(),
    );
  });

  it("lists every platform exactly once in the display order", () => {
    assert.deepEqual([...SOCIAL_PLATFORM_ORDER].sort(), Object.keys(SOCIAL_PLATFORMS).sort());
    assert.equal(new Set(SOCIAL_PLATFORM_ORDER).size, SOCIAL_PLATFORM_ORDER.length);
  });

  it("matches the edge publishing rules field for field", () => {
    for (const [id, ui] of Object.entries(SOCIAL_PLATFORMS)) {
      const rule = SOCIAL_PLATFORM_RULES[id as keyof typeof SOCIAL_PLATFORM_RULES];
      for (const key of SHARED_KEYS) {
        assert.equal(
          (ui as unknown as Record<string, unknown>)[key],
          (rule as unknown as Record<string, unknown>)[key],
          `${id}.${key} drifted between the UI registry and the edge rules`,
        );
      }
      assert.deepEqual(ui.allowedMediaKinds, rule.allowedMediaKinds, `${id}.allowedMediaKinds`);
      assert.deepEqual(ui.requiredOptions, rule.requiredOptions, `${id}.requiredOptions`);
      assert.equal(ui.label, rule.label, `${id}.label`);
    }
  });
});
