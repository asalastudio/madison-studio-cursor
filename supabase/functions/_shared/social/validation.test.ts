import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { countHashtags, isPubliclyFetchableUrl, validateSocialPost } from "./validation.ts";
import type { SocialPostDraft } from "./validation.ts";

function draft(overrides: Partial<SocialPostDraft> = {}): SocialPostDraft {
  return {
    platform: "instagram",
    caption: "A clean 9ml roller in amber glass.",
    media: [
      {
        url: "https://cdn.example.com/bottle.jpg",
        type: "image",
        width: 1000,
        height: 1250,
      },
    ],
    ...overrides,
  };
}

describe("isPubliclyFetchableUrl", () => {
  it("accepts public https urls", () => {
    assert.equal(isPubliclyFetchableUrl("https://cdn.example.com/a.jpg"), true);
  });

  it("rejects http, localhost and private ranges", () => {
    assert.equal(isPubliclyFetchableUrl("http://cdn.example.com/a.jpg"), false);
    assert.equal(isPubliclyFetchableUrl("https://localhost:5180/a.jpg"), false);
    assert.equal(isPubliclyFetchableUrl("https://192.168.1.10/a.jpg"), false);
    assert.equal(isPubliclyFetchableUrl("https://172.16.4.2/a.jpg"), false);
    assert.equal(isPubliclyFetchableUrl("not a url"), false);
  });
});

describe("countHashtags", () => {
  it("counts leading-hash words but not mid-word hashes", () => {
    assert.equal(countHashtags("#packaging design #perfume"), 2);
    assert.equal(countHashtags("colour#3 is approved"), 0);
  });
});

describe("validateSocialPost", () => {
  it("accepts a well-formed Instagram post", () => {
    const result = validateSocialPost(draft());
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  it("rejects a caption over the platform limit", () => {
    const result = validateSocialPost(draft({ caption: "x".repeat(2201) }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((issue) => issue.code === "caption_too_long"));
  });

  it("rejects media the platform cannot fetch", () => {
    const result = validateSocialPost(
      draft({ media: [{ url: "http://localhost:5180/a.jpg", type: "image" }] }),
    );
    assert.ok(result.errors.some((issue) => issue.code === "media_url_not_public"));
  });

  it("rejects an out-of-range Instagram aspect ratio", () => {
    const result = validateSocialPost(
      draft({
        media: [
          { url: "https://cdn.example.com/a.jpg", type: "image", width: 2000, height: 500 },
        ],
      }),
    );
    assert.ok(result.errors.some((issue) => issue.code === "aspect_ratio_out_of_range"));
  });

  it("warns rather than fails when dimensions are unknown", () => {
    const result = validateSocialPost(
      draft({ media: [{ url: "https://cdn.example.com/a.jpg", type: "image" }] }),
    );
    assert.equal(result.valid, true);
    assert.ok(result.warnings.some((issue) => issue.code === "aspect_ratio_unknown"));
  });

  it("blocks Instagram posts above the 30 hashtag hard limit", () => {
    const tags = Array.from({ length: 31 }, (_, i) => `#tag${i}`).join(" ");
    const result = validateSocialPost(draft({ caption: tags }));
    assert.ok(result.errors.some((issue) => issue.code === "too_many_hashtags"));
  });

  it("requires a Pinterest board", () => {
    const result = validateSocialPost(
      draft({ platform: "pinterest", title: "Amber roller bottle", options: {} }),
    );
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((issue) => issue.field === "options.boardId"));
  });

  it("accepts a Pinterest pin once a board is chosen", () => {
    const result = validateSocialPost(
      draft({
        platform: "pinterest",
        caption: "Amber glass roller, 9ml.",
        title: "Amber roller",
        linkUrl: "https://bestbottles.com/products/amber-roller",
        options: { boardId: "board-123" },
      }),
    );
    assert.equal(result.valid, true, JSON.stringify(result.errors));
  });

  it("rejects images on TikTok and requires a privacy level", () => {
    const result = validateSocialPost(draft({ platform: "tiktok" }));
    assert.ok(result.errors.some((issue) => issue.code === "media_kind_unsupported"));
    assert.ok(result.errors.some((issue) => issue.field === "options.privacyLevel"));
  });

  it("warns that a link will be dropped on Instagram", () => {
    const result = validateSocialPost(draft({ linkUrl: "https://bestbottles.com" }));
    assert.equal(result.valid, true);
    assert.ok(result.warnings.some((issue) => issue.code === "link_field_unsupported"));
  });

  it("rejects an empty post with no media", () => {
    const result = validateSocialPost(
      draft({ platform: "linkedin", caption: "   ", media: [] }),
    );
    assert.ok(result.errors.some((issue) => issue.code === "empty_post"));
  });

  it("rejects more media than LinkedIn accepts", () => {
    const result = validateSocialPost(
      draft({
        platform: "linkedin",
        media: [
          { url: "https://cdn.example.com/a.jpg", type: "image" },
          { url: "https://cdn.example.com/b.jpg", type: "image" },
        ],
      }),
    );
    assert.ok(result.errors.some((issue) => issue.code === "too_many_media"));
  });

  it("marks unsupported platforms as invalid", () => {
    const result = validateSocialPost(draft({ platform: "threads", media: [] }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((issue) => issue.code === "platform_unsupported"));
  });
});
