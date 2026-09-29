import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  VIDEO_STUDIO_ASPECT_RATIOS,
  VIDEO_STUDIO_DURATIONS,
  VIDEO_STUDIO_MODELS,
  VIDEO_STUDIO_MOTIONS,
  VIDEO_STUDIO_RESOLUTIONS,
  assertOrgScopedVideoHistoryQuery,
  buildOrgScopedMediaQuery,
  buildVideoGenerationRequest,
  buildVideoMotionPrompt,
  estimateVideoCredits,
  getVideoStudioModel,
  isVideoStudioModelId,
  jobStatusFromTake,
  mapVideoJobStatus,
  parseVideoStudioHandoff,
  takeErrorMessageFromDescription,
  videoModelSupportsAudio,
  videoModelSupportsEndFrame,
  videoModelSupportsMultiShot,
} from "./videoStudio";

describe("VIDEO_STUDIO_MODELS", () => {
  it("only lists models that generate-madison-video actually calls on Freepik", () => {
    const ids = VIDEO_STUDIO_MODELS.map((model) => model.id);
    assert.deepEqual(ids, [
      "auto",
      "kling-o1",
      "kling-2.1",
      "kling-2.1-master",
      "kling-2.5",
      "minimax-hailuo-2.3",
      "seedance-pro",
    ]);
  });

  it("does not claim Google Veo — those ids remap to Kling in freepikProvider", () => {
    for (const model of VIDEO_STUDIO_MODELS) {
      assert.doesNotMatch(model.id, /veo/i);
      assert.doesNotMatch(model.name, /veo/i);
      assert.doesNotMatch(model.description, /veo/i);
    }
    assert.equal(isVideoStudioModelId("google-veo-3.1"), false);
    assert.equal(isVideoStudioModelId("kling-2.5"), true);
  });

  it("marks start/end, audio, and multi-shot only where the provider body sends them", () => {
    assert.equal(videoModelSupportsEndFrame("kling-o1"), true);
    assert.equal(videoModelSupportsEndFrame("kling-2.1"), true);
    assert.equal(videoModelSupportsEndFrame("kling-2.5"), false);
    assert.equal(videoModelSupportsEndFrame("auto"), false);

    assert.equal(videoModelSupportsAudio("kling-o1"), true);
    assert.equal(videoModelSupportsAudio("kling-2.5"), false);
    assert.equal(videoModelSupportsAudio("auto"), false);

    assert.equal(videoModelSupportsMultiShot("auto"), true);
    assert.equal(videoModelSupportsMultiShot("kling-o1"), false);
  });

  it("exposes the duration and ratio values the edge function accepts", () => {
    assert.deepEqual(VIDEO_STUDIO_DURATIONS, ["4", "5", "6", "8", "10"]);
    assert.ok(VIDEO_STUDIO_ASPECT_RATIOS.some((ratio) => ratio.id === "16:9"));
    assert.ok(VIDEO_STUDIO_ASPECT_RATIOS.some((ratio) => ratio.id === "9:16"));
    assert.ok(VIDEO_STUDIO_RESOLUTIONS.includes("720p"));
    assert.ok(VIDEO_STUDIO_MOTIONS.some((motion) => motion.id === "static"));
  });
});

describe("buildVideoMotionPrompt", () => {
  it("keeps the operator prompt and appends motion without Best Bottles or Tarife language", () => {
    const prompt = buildVideoMotionPrompt({
      prompt: "A ceramic mug turning on a sunlit table",
      motion: "orbit",
      cameraFixed: false,
    });
    assert.match(prompt, /ceramic mug/i);
    assert.match(prompt, /orbit|circle/i);
    assert.doesNotMatch(prompt, /bottle/i);
    assert.doesNotMatch(prompt, /best bottles/i);
    assert.doesNotMatch(prompt, /tarife/i);
  });

  it("does not invent camera movement when the camera is fixed", () => {
    const prompt = buildVideoMotionPrompt({
      prompt: "Still life of bread on linen",
      motion: "static",
      cameraFixed: true,
    });
    assert.match(prompt, /fixed camera|locked-off|static/i);
    assert.doesNotMatch(prompt, /zoom in/i);
  });
});

describe("buildVideoGenerationRequest", () => {
  it("refuses to build a request without an organization id", () => {
    assert.throws(
      () =>
        buildVideoGenerationRequest({
          prompt: "A chair in a loft",
          userId: "user-1",
          organizationId: "",
        }),
      /organization/i,
    );
  });

  it("sends only fields generate-madison-video reads, always with organizationId", () => {
    const request = buildVideoGenerationRequest({
      prompt: "A chair in a loft",
      userId: "user-1",
      organizationId: "org-1",
      imageUrl: "https://example.com/start.png",
      imageId: "img-1",
      endImageUrl: "https://example.com/end.png",
      model: "kling-o1",
      duration: "8",
      resolution: "1080p",
      aspectRatio: "9:16",
      motion: "zoom-in",
      includeAudio: true,
    });

    assert.equal(request.organizationId, "org-1");
    assert.equal(request.userId, "user-1");
    assert.equal(request.model, "kling-o1");
    assert.equal(request.duration, "8");
    assert.equal(request.resolution, "1080p");
    assert.equal(request.aspectRatio, "9:16");
    assert.equal(request.imageUrl, "https://example.com/start.png");
    assert.equal(request.endImageUrl, "https://example.com/end.png");
    assert.equal(request.includeAudio, true);
    assert.equal(request.cameraFixed, false);
    assert.equal(request.action, "create");
    assert.equal("aiProvider" in request, false);
    assert.doesNotMatch(request.prompt, /bottle/i);
  });

  it("drops end-frame, audio, and multi-shot when the selected model cannot send them", () => {
    const request = buildVideoGenerationRequest({
      prompt: "Rain on a window",
      userId: "user-1",
      organizationId: "org-1",
      endImageUrl: "https://example.com/end.png",
      model: "minimax-hailuo-2.3",
      includeAudio: true,
      multiShot: true,
      motion: "static",
    });

    assert.equal(request.endImageUrl, undefined);
    assert.equal(request.includeAudio, false);
    assert.equal(request.multiShot, false);
    assert.equal(request.cameraFixed, true);
  });

  it("keeps multi-shot only on auto", () => {
    const request = buildVideoGenerationRequest({
      prompt: "A market stall",
      userId: "user-1",
      organizationId: "org-1",
      model: "auto",
      multiShot: true,
    });
    assert.equal(request.multiShot, true);
  });

  it("falls back to auto when the UI is handed a Veo id", () => {
    const request = buildVideoGenerationRequest({
      prompt: "A hallway",
      userId: "user-1",
      organizationId: "org-1",
      model: "google-veo-3.1" as never,
    });
    assert.equal(request.model, "auto");
  });
});

describe("estimateVideoCredits", () => {
  it("returns a visible estimate that grows with duration and resolution", () => {
    const base = estimateVideoCredits({
      model: "auto",
      duration: "5",
      resolution: "720p",
    });
    const longer = estimateVideoCredits({
      model: "auto",
      duration: "10",
      resolution: "720p",
    });
    const sharper = estimateVideoCredits({
      model: "auto",
      duration: "5",
      resolution: "1080p",
    });
    const audio = estimateVideoCredits({
      model: "kling-o1",
      duration: "5",
      resolution: "720p",
      includeAudio: true,
    });

    assert.ok(base.credits > 0);
    assert.ok(longer.credits > base.credits);
    assert.ok(sharper.credits > base.credits);
    assert.ok(audio.credits > base.credits);
    assert.match(base.label, /estimat/i);
    assert.equal(base.isEstimate, true);
  });

  it("explains the drivers so the operator sees why the number moved", () => {
    const estimate = estimateVideoCredits({
      model: "kling-2.5",
      duration: "8",
      resolution: "1080p",
      includeAudio: false,
    });
    assert.ok(estimate.breakdown.length >= 2);
    assert.ok(estimate.breakdown.some((line) => /8s|duration/i.test(line)));
    assert.equal(getVideoStudioModel("kling-2.5")?.name, "Kling 2.5");
  });
});

describe("mapVideoJobStatus", () => {
  it("maps Freepik and Madison statuses into visible job states", () => {
    assert.equal(mapVideoJobStatus("pending").state, "queued");
    assert.equal(mapVideoJobStatus("IN_PROGRESS").state, "processing");
    assert.equal(mapVideoJobStatus("PROCESSING").state, "processing");
    assert.equal(mapVideoJobStatus("COMPLETED").state, "complete");
    assert.equal(mapVideoJobStatus("FAILED").state, "failed");
    assert.equal(mapVideoJobStatus("ERROR", "Freepik rejected the frame").state, "failed");
    assert.match(mapVideoJobStatus("FAILED", "timeout").message ?? "", /timeout/i);
    assert.ok((mapVideoJobStatus("IN_PROGRESS").progress ?? 0) > 0);
    assert.equal(mapVideoJobStatus("COMPLETED").progress, 100);
  });

  it("never swallows an unknown failure into a silent success", () => {
    const unknown = mapVideoJobStatus("SOMETHING_WEIRD");
    assert.notEqual(unknown.state, "complete");
    assert.ok(unknown.message);
  });
});

describe("jobStatusFromTake", () => {
  it("shows a failed overlay with the stored reason", () => {
    const job = jobStatusFromTake({
      status: "failed",
      errorMessage: "Freepik timed out waiting for Kling 2.5.",
    });
    assert.equal(job.state, "failed");
    assert.match(job.message, /timed out/i);
  });

  it("maps queued and rendering takes to a visible progress overlay", () => {
    assert.equal(jobStatusFromTake({ status: "queued" }).state, "queued");
    assert.ok(jobStatusFromTake({ status: "queued" }).progress > 0);
    assert.equal(jobStatusFromTake({ status: "processing" }).state, "processing");
    assert.ok(jobStatusFromTake({ status: "processing" }).progress > 0);
  });

  it("hides the overlay for a complete take", () => {
    assert.equal(jobStatusFromTake({ status: "complete" }).state, "complete");
  });

  it("falls back to a generic failure when no reason was stored", () => {
    assert.match(jobStatusFromTake({ status: "failed" }).message, /did not finish/i);
  });
});

describe("takeErrorMessageFromDescription", () => {
  it("strips the persisted Video failed prefix", () => {
    assert.equal(
      takeErrorMessageFromDescription("Video failed: Freepik timed out waiting for Kling 2.5."),
      "Freepik timed out waiting for Kling 2.5.",
    );
  });
});

describe("org-scoped media queries", () => {
  it("builds a history query that always pins organization_id and media_type=video", () => {
    const query = buildOrgScopedMediaQuery({
      organizationId: "org-1",
      mediaType: "video",
    });
    assert.equal(query.organizationId, "org-1");
    assert.equal(query.mediaType, "video");
    assert.equal(query.userIdFallback, false);
    assert.ok(assertOrgScopedVideoHistoryQuery(query));
  });

  it("refuses a history query that would fall back to user_id", () => {
    assert.equal(
      assertOrgScopedVideoHistoryQuery({
        organizationId: "org-1",
        mediaType: "video",
        userIdFallback: true,
      }),
      false,
    );
    assert.equal(
      assertOrgScopedVideoHistoryQuery({
        organizationId: "",
        mediaType: "video",
        userIdFallback: false,
      }),
      false,
    );
  });

  it("refuses to query when organization id is missing", () => {
    assert.throws(
      () => buildOrgScopedMediaQuery({ organizationId: "", mediaType: "image" }),
      /organization/i,
    );
  });
});

describe("parseVideoStudioHandoff", () => {
  it("accepts a Dark Room start frame without inventing Best Bottles copy", () => {
    const handoff = parseVideoStudioHandoff({
      startingImage: {
        url: "https://example.com/frame.png",
        id: "img-9",
        prompt: "Marble shelf, morning light",
      },
    });
    assert.equal(handoff?.imageUrl, "https://example.com/frame.png");
    assert.equal(handoff?.imageId, "img-9");
    assert.equal(handoff?.prompt, "Marble shelf, morning light");
    assert.doesNotMatch(handoff?.prompt ?? "", /best bottles|tarife/i);
  });

  it("ignores empty or malformed navigation state", () => {
    assert.equal(parseVideoStudioHandoff(undefined), null);
    assert.equal(parseVideoStudioHandoff({ startingImage: { url: "" } }), null);
  });
});
