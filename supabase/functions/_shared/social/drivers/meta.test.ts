import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { discoverMetaAccounts, facebookDriver, instagramDriver } from "./meta.ts";
import type { ConnectionRef, DriverDeps } from "./types.ts";

interface RecordedCall {
  method: string;
  url: string;
  body: string | null;
}

function stubFetch(handler: (call: RecordedCall) => { status?: number; body: unknown }) {
  const calls: RecordedCall[] = [];
  const fetchImpl = (async (input: unknown, init?: RequestInit) => {
    const call: RecordedCall = {
      method: init?.method ?? "GET",
      url: String(input),
      body: typeof init?.body === "string" ? init.body : null,
    };
    calls.push(call);
    const { status = 200, body } = handler(call);
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;

  return { calls, fetchImpl };
}

function deps(fetchImpl: typeof fetch): DriverDeps {
  return {
    fetchImpl,
    sleep: async () => {},
    now: () => new Date("2026-09-11T12:00:00.000Z"),
    log: () => {},
  };
}

const igConnection: ConnectionRef = {
  id: "conn-1",
  platform: "instagram",
  accountType: "business",
  externalAccountId: "17841400000000000",
  externalAccountName: "Best Bottles",
  externalAccountHandle: "bestbottles",
  externalParentId: "page-1",
  metadata: {},
};

const pageConnection: ConnectionRef = {
  ...igConnection,
  platform: "facebook",
  accountType: "page",
  externalAccountId: "page-1",
};

describe("instagram driver", () => {
  it("creates a container then publishes it for a single image", async () => {
    const { calls, fetchImpl } = stubFetch((call) => {
      if (call.url.includes("fields=permalink")) {
        return { body: { permalink: "https://www.instagram.com/p/XYZ/" } };
      }
      if (call.url.includes("/media_publish")) return { body: { id: "media-9" } };
      return { body: { id: "container-1" } };
    });

    const result = await instagramDriver.publish(
      {
        caption: "Amber glass roller, 9ml.",
        media: [{ url: "https://cdn.example.com/a.jpg", type: "image", alt: "Amber roller" }],
        options: {},
      },
      { accessToken: "page-token", connection: igConnection, deps: deps(fetchImpl) },
    );

    assert.equal(result.ok, true);
    assert.equal(result.ok && result.externalPostId, "media-9");
    assert.equal(result.ok && result.permalink, "https://www.instagram.com/p/XYZ/");

    assert.equal(calls[0].method, "POST");
    assert.ok(calls[0].url.endsWith(`/${igConnection.externalAccountId}/media`));
    assert.ok(calls[0].body?.includes("image_url=https%3A%2F%2Fcdn.example.com%2Fa.jpg"));
    assert.ok(calls[0].body?.includes("alt_text=Amber+roller"));

    assert.ok(calls[1].url.endsWith("/media_publish"));
    assert.ok(calls[1].body?.includes("creation_id=container-1"));
  });

  it("waits for a video container to finish processing", async () => {
    let statusChecks = 0;
    const { calls, fetchImpl } = stubFetch((call) => {
      if (call.url.includes("fields=permalink")) {
        return { body: { permalink: "https://www.instagram.com/reel/ABC/" } };
      }
      if (call.url.includes("/media_publish")) return { body: { id: "media-reel" } };
      if (call.method === "POST" && call.url.includes("/media")) return { body: { id: "c-1" } };
      statusChecks += 1;
      return { body: { status_code: statusChecks < 3 ? "IN_PROGRESS" : "FINISHED" } };
    });

    const result = await instagramDriver.publish(
      {
        caption: "Filling line, 30 seconds.",
        media: [
          { url: "https://cdn.example.com/a.mp4", type: "video", durationMs: 30_000 },
        ],
        options: {},
      },
      { accessToken: "page-token", connection: igConnection, deps: deps(fetchImpl) },
    );

    assert.equal(result.ok, true);
    assert.equal(statusChecks, 3);
    assert.ok(calls[0].body?.includes("media_type=REELS"));
    assert.ok(calls[0].body?.includes("video_url="));
  });

  it("surfaces a container processing error instead of publishing", async () => {
    const { fetchImpl } = stubFetch((call) => {
      if (call.method === "POST" && call.url.includes("/media")) return { body: { id: "c-1" } };
      return { body: { status_code: "ERROR", status: "Media download failed" } };
    });

    const result = await instagramDriver.publish(
      {
        caption: "x",
        media: [{ url: "https://cdn.example.com/a.mp4", type: "video" }],
        options: {},
      },
      { accessToken: "t", connection: igConnection, deps: deps(fetchImpl) },
    );

    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.code, "meta_container_failed");
  });

  it("builds a carousel from multiple images", async () => {
    let childCounter = 0;
    const { calls, fetchImpl } = stubFetch((call) => {
      if (call.url.includes("fields=permalink")) {
        return { body: { permalink: "https://www.instagram.com/p/CAR/" } };
      }
      if (call.url.includes("/media_publish")) return { body: { id: "media-carousel" } };
      if (call.method === "POST" && call.url.includes("/media")) {
        childCounter += 1;
        return { body: { id: `c-${childCounter}` } };
      }
      return { body: { status_code: "FINISHED" } };
    });

    const result = await instagramDriver.publish(
      {
        caption: "Three closures, one body.",
        media: [
          { url: "https://cdn.example.com/1.jpg", type: "image" },
          { url: "https://cdn.example.com/2.jpg", type: "image" },
          { url: "https://cdn.example.com/3.jpg", type: "image" },
        ],
        options: {},
      },
      { accessToken: "t", connection: igConnection, deps: deps(fetchImpl) },
    );

    assert.equal(result.ok, true);
    assert.ok(calls[0].body?.includes("is_carousel_item=true"));
    const carouselCall = calls.find((call) => call.body?.includes("media_type=CAROUSEL"));
    assert.ok(carouselCall, "expected a CAROUSEL container call");
    assert.ok(carouselCall!.body?.includes("children=c-1%2Cc-2%2Cc-3"));
  });

  it("maps a Graph API error onto a driver failure", async () => {
    const { fetchImpl } = stubFetch(() => ({
      status: 400,
      body: { error: { code: 190, message: "Error validating access token" } },
    }));

    const result = await instagramDriver.publish(
      {
        caption: "x",
        media: [{ url: "https://cdn.example.com/a.jpg", type: "image" }],
        options: {},
      },
      { accessToken: "t", connection: igConnection, deps: deps(fetchImpl) },
    );

    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.code, "meta_190");
    assert.equal(!result.ok && result.httpStatus, 400);
  });

  it("posts a first comment after publishing", async () => {
    const { calls, fetchImpl } = stubFetch((call) => {
      if (call.url.includes("fields=permalink")) {
        return { body: { permalink: "https://www.instagram.com/p/XYZ/" } };
      }
      if (call.url.includes("/comments")) return { body: { id: "comment-1" } };
      if (call.url.includes("/media_publish")) return { body: { id: "media-9" } };
      return { body: { id: "container-1" } };
    });

    await instagramDriver.publish(
      {
        caption: "Amber glass.",
        firstComment: "Full spec in the link in bio.",
        media: [{ url: "https://cdn.example.com/a.jpg", type: "image" }],
        options: {},
      },
      { accessToken: "t", connection: igConnection, deps: deps(fetchImpl) },
    );

    const commentCall = calls.find((call) => call.url.includes("/comments"));
    assert.ok(commentCall, "expected a comment call");
    assert.ok(commentCall!.body?.includes("message=Full+spec"));
  });
});

describe("facebook driver", () => {
  it("publishes a single photo through /photos", async () => {
    const { calls, fetchImpl } = stubFetch(() => ({ body: { id: "photo-1", post_id: "page-1_99" } }));

    const result = await facebookDriver.publish(
      {
        caption: "New roller bottle line.",
        media: [{ url: "https://cdn.example.com/a.jpg", type: "image" }],
        options: {},
      },
      { accessToken: "t", connection: pageConnection, deps: deps(fetchImpl) },
    );

    assert.equal(result.ok, true);
    assert.equal(result.ok && result.externalPostId, "page-1_99");
    assert.ok(calls[0].url.endsWith("/page-1/photos"));
  });

  it("uploads unpublished photos then attaches them to one feed post", async () => {
    let uploads = 0;
    const { calls, fetchImpl } = stubFetch((call) => {
      if (call.url.endsWith("/photos")) {
        uploads += 1;
        return { body: { id: `ph-${uploads}` } };
      }
      return { body: { id: "page-1_100" } };
    });

    const result = await facebookDriver.publish(
      {
        caption: "Three finishes.",
        media: [
          { url: "https://cdn.example.com/1.jpg", type: "image" },
          { url: "https://cdn.example.com/2.jpg", type: "image" },
        ],
        options: {},
      },
      { accessToken: "t", connection: pageConnection, deps: deps(fetchImpl) },
    );

    assert.equal(result.ok, true);
    assert.equal(uploads, 2);
    const feedCall = calls[calls.length - 1];
    assert.ok(feedCall.url.endsWith("/page-1/feed"));
    assert.ok(feedCall.body?.includes("attached_media%5B0%5D"));
    assert.ok(feedCall.body?.includes("ph-1"));
  });

  it("uses the video endpoint when the post carries a video", async () => {
    const { calls, fetchImpl } = stubFetch(() => ({ body: { id: "vid-1" } }));

    const result = await facebookDriver.publish(
      {
        caption: "Line in motion.",
        media: [{ url: "https://cdn.example.com/a.mp4", type: "video" }],
        options: {},
      },
      { accessToken: "t", connection: pageConnection, deps: deps(fetchImpl) },
    );

    assert.equal(result.ok, true);
    assert.ok(calls[0].url.endsWith("/page-1/videos"));
    assert.ok(calls[0].body?.includes("file_url="));
  });
});

describe("discoverMetaAccounts", () => {
  it("returns one Page surface plus its bound Instagram account", async () => {
    const { fetchImpl } = stubFetch(() => ({
      body: {
        data: [
          {
            id: "page-1",
            name: "Best Bottles",
            access_token: "page-token-1",
            picture: { data: { url: "https://cdn.example.com/page.png" } },
            instagram_business_account: {
              id: "ig-1",
              username: "bestbottles",
              name: "Best Bottles",
              profile_picture_url: "https://cdn.example.com/ig.png",
            },
          },
          { id: "page-2", name: "No IG Page", access_token: "page-token-2" },
        ],
      },
    }));

    const result = await discoverMetaAccounts(deps(fetchImpl), {
      longLivedUserToken: "user-token",
      scopes: ["pages_manage_posts"],
      userTokenExpiresAt: "2026-11-10T12:00:00.000Z",
    });

    assert.ok("accounts" in result);
    const accounts = (result as { accounts: any[] }).accounts;
    assert.equal(accounts.length, 3);

    const instagram = accounts.find((account) => account.platform === "instagram");
    assert.equal(instagram.externalAccountId, "ig-1");
    assert.equal(instagram.externalParentId, "page-1");
    // Instagram publishing authenticates with the Page token, not a separate one.
    assert.equal(instagram.accessToken, "page-token-1");

    const pages = accounts.filter((account) => account.platform === "facebook");
    assert.deepEqual(
      pages.map((page) => page.externalAccountId),
      ["page-1", "page-2"],
    );
  });

  it("reports an error when the Pages call fails", async () => {
    const { fetchImpl } = stubFetch(() => ({
      status: 403,
      body: { error: { message: "Requires pages_show_list permission" } },
    }));

    const result = await discoverMetaAccounts(deps(fetchImpl), {
      longLivedUserToken: "user-token",
      scopes: [],
      userTokenExpiresAt: null,
    });

    assert.ok("error" in result);
  });
});
