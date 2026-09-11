import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildComposerPlan,
  captionFor,
  emptyComposerState,
  selectMediaForPlatform,
  toPublishPayload,
  type ComposerConnection,
  type ComposerMedia,
} from "./composerPlan.ts";

const IMAGE: ComposerMedia = {
  url: "https://cdn.example.com/a.jpg",
  type: "image",
  width: 1000,
  height: 1250,
};
const IMAGE_2: ComposerMedia = { ...IMAGE, url: "https://cdn.example.com/b.jpg" };
const IMAGE_3: ComposerMedia = { ...IMAGE, url: "https://cdn.example.com/c.jpg" };
const VIDEO: ComposerMedia = {
  url: "https://cdn.example.com/a.mp4",
  type: "video",
  durationMs: 20_000,
};

const connections: ComposerConnection[] = [
  { id: "ig", platform: "instagram", accountName: "Best Bottles", accountHandle: "bestbottles", status: "active" },
  { id: "li", platform: "linkedin", accountName: "Best Bottles", status: "active" },
  { id: "pin", platform: "pinterest", accountName: "Best Bottles", accountHandle: "bestbottles", status: "active" },
  { id: "tt", platform: "tiktok", accountName: "Best Bottles", accountHandle: "bestbottles", status: "active" },
  { id: "fb", platform: "facebook", accountName: "Best Bottles Page", status: "needs_reauth" },
];

describe("selectMediaForPlatform", () => {
  it("keeps up to ten items for an Instagram carousel", () => {
    const media = Array.from({ length: 12 }, (_, i) => ({ ...IMAGE, url: `https://cdn.example.com/${i}.jpg` }));
    assert.equal(selectMediaForPlatform(media, "instagram").length, 10);
  });

  it("narrows to a single image for LinkedIn and Pinterest", () => {
    assert.deepEqual(selectMediaForPlatform([IMAGE, IMAGE_2, IMAGE_3], "linkedin"), [IMAGE]);
    assert.deepEqual(selectMediaForPlatform([IMAGE, IMAGE_2], "pinterest"), [IMAGE]);
  });

  it("drops images for TikTok and keeps the video", () => {
    assert.deepEqual(selectMediaForPlatform([IMAGE, VIDEO, IMAGE_2], "tiktok"), [VIDEO]);
  });

  it("does not mix kinds on Facebook", () => {
    assert.deepEqual(selectMediaForPlatform([IMAGE, VIDEO], "facebook"), [IMAGE]);
  });

  it("returns nothing when no attachment fits", () => {
    assert.deepEqual(selectMediaForPlatform([IMAGE], "tiktok"), []);
  });
});

describe("captionFor", () => {
  it("falls back to the base caption and honours an override", () => {
    const state = emptyComposerState({
      baseCaption: "Amber glass, 9ml.",
      captionOverrides: { linkedin: "Now shipping from stock: amber 9ml rollers." },
    });
    assert.equal(captionFor(state, "instagram"), "Amber glass, 9ml.");
    assert.equal(captionFor(state, "linkedin"), "Now shipping from stock: amber 9ml rollers.");
  });

  it("respects an intentionally blank override", () => {
    const state = emptyComposerState({ baseCaption: "Base", captionOverrides: { instagram: "" } });
    assert.equal(captionFor(state, "instagram"), "");
  });
});

describe("buildComposerPlan", () => {
  it("fans one submission out to every selected channel", () => {
    const plan = buildComposerPlan({
      connections,
      state: emptyComposerState({
        baseCaption: "Amber glass, 9ml roller.",
        media: [IMAGE, IMAGE_2],
        selectedConnectionIds: ["ig", "li"],
      }),
    });

    assert.equal(plan.canPublish, true);
    assert.equal(plan.targets.length, 2);
    assert.equal(plan.targets[0].media.length, 2);
    assert.equal(plan.targets[1].media.length, 1);
    assert.ok(plan.targets[1].notes.some((note) => note.includes("will not be sent")));
  });

  it("blocks a target whose connection needs re-auth", () => {
    const plan = buildComposerPlan({
      connections,
      state: emptyComposerState({
        baseCaption: "Hello",
        selectedConnectionIds: ["fb"],
      }),
    });
    assert.equal(plan.canPublish, false);
    assert.ok(plan.targets[0].errors.some((error) => error.includes("reconnected")));
  });

  it("requires a Pinterest board and reports it as an error", () => {
    const plan = buildComposerPlan({
      connections,
      state: emptyComposerState({
        baseCaption: "Amber glass roller.",
        media: [IMAGE],
        selectedConnectionIds: ["pin"],
      }),
    });
    assert.equal(plan.canPublish, false);
    assert.ok(plan.targets[0].errors.some((error) => error.includes("a board")));
  });

  it("clears once the board and privacy level are supplied", () => {
    const plan = buildComposerPlan({
      connections,
      state: emptyComposerState({
        baseCaption: "Amber glass roller.",
        title: "Amber roller",
        media: [IMAGE, VIDEO],
        selectedConnectionIds: ["pin", "tt"],
        platformOptions: {
          pinterest: { boardId: "board-1" },
          tiktok: { privacyLevel: "SELF_ONLY" },
        },
      }),
    });
    assert.equal(plan.errorCount, 0, JSON.stringify(plan.targets.map((t) => t.errors)));
    assert.equal(plan.canPublish, true);
  });

  it("errors when a required-media platform gets nothing it can use", () => {
    const plan = buildComposerPlan({
      connections,
      state: emptyComposerState({
        baseCaption: "Video coming soon.",
        media: [IMAGE],
        selectedConnectionIds: ["tt"],
        platformOptions: { tiktok: { privacyLevel: "SELF_ONLY" } },
      }),
    });
    assert.equal(plan.canPublish, false);
    assert.ok(plan.targets[0].errors.some((error) => error.includes("None of the attached media")));
  });

  it("flags a caption that only overflows on one platform", () => {
    const plan = buildComposerPlan({
      connections,
      state: emptyComposerState({
        baseCaption: "x".repeat(2500),
        media: [IMAGE],
        selectedConnectionIds: ["ig", "li"],
      }),
    });
    const instagram = plan.targets.find((target) => target.platform === "instagram")!;
    const linkedin = plan.targets.find((target) => target.platform === "linkedin")!;
    // 2500 characters is over Instagram's 2200 but inside LinkedIn's 3000.
    assert.ok(instagram.errors.some((error) => error.includes("over the Instagram limit")));
    assert.deepEqual(linkedin.errors, []);
    assert.equal(plan.canPublish, false);
  });

  it("drops the link for platforms without a link field and notes it", () => {
    const plan = buildComposerPlan({
      connections,
      state: emptyComposerState({
        baseCaption: "Amber glass.",
        linkUrl: "https://bestbottles.com/amber",
        media: [IMAGE],
        selectedConnectionIds: ["ig", "li"],
      }),
    });
    const instagram = plan.targets.find((target) => target.platform === "instagram")!;
    const linkedin = plan.targets.find((target) => target.platform === "linkedin")!;
    assert.equal(instagram.linkUrl, null);
    assert.ok(instagram.notes.some((note) => note.includes("no link field")));
    assert.equal(linkedin.linkUrl, "https://bestbottles.com/amber");
  });

  it("keeps the first comment only where it is supported", () => {
    const plan = buildComposerPlan({
      connections,
      state: emptyComposerState({
        baseCaption: "Amber glass.",
        firstComment: "Spec sheet in bio.",
        media: [IMAGE],
        selectedConnectionIds: ["ig", "li"],
      }),
    });
    assert.equal(plan.targets.find((t) => t.platform === "instagram")!.firstComment, "Spec sheet in bio.");
    assert.equal(plan.targets.find((t) => t.platform === "linkedin")!.firstComment, null);
  });

  it("ignores selections that reference a connection that no longer exists", () => {
    const plan = buildComposerPlan({
      connections,
      state: emptyComposerState({
        baseCaption: "Hello",
        media: [IMAGE],
        selectedConnectionIds: ["ig", "deleted-connection"],
      }),
    });
    assert.equal(plan.targets.length, 1);
  });

  it("cannot publish with nothing selected", () => {
    const plan = buildComposerPlan({
      connections,
      state: emptyComposerState({ baseCaption: "Hello" }),
    });
    assert.equal(plan.canPublish, false);
    assert.equal(plan.targets.length, 0);
  });
});

describe("toPublishPayload", () => {
  it("serialises media with snake_case duration for the edge function", () => {
    const plan = buildComposerPlan({
      connections,
      state: emptyComposerState({
        baseCaption: "Clip.",
        media: [VIDEO],
        selectedConnectionIds: ["tt"],
        platformOptions: { tiktok: { privacyLevel: "SELF_ONLY" } },
      }),
    });

    const payload = toPublishPayload({
      plan,
      organizationId: "org-1",
      mode: "schedule",
      scheduledFor: "2026-09-12T09:00:00.000Z",
      timezone: "Europe/London",
    }) as any;

    assert.equal(payload.action, "create");
    assert.equal(payload.mode, "schedule");
    assert.equal(payload.scheduledFor, "2026-09-12T09:00:00.000Z");
    assert.equal(payload.targets.length, 1);
    assert.equal(payload.targets[0].media[0].duration_ms, 20_000);
    assert.deepEqual(payload.targets[0].options, { privacyLevel: "SELF_ONLY" });
  });
});
