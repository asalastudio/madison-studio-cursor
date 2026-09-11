import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { executePublish } from "./publishRunner.ts";
import type {
  AttemptRecord,
  PublishStore,
  StoredConnection,
  StoredPost,
} from "./publishRunner.ts";
import type { DriverDeps, PublishResult, SocialDriver } from "./drivers/types.ts";

const NOW = new Date("2026-09-11T12:00:00.000Z");

const deps: DriverDeps = {
  fetchImpl: (() => {
    throw new Error("fetch should not be called by the runner itself");
  }) as unknown as typeof fetch,
  sleep: async () => {},
  now: () => NOW,
  log: () => {},
};

function connection(overrides: Partial<StoredConnection> = {}): StoredConnection {
  return {
    id: "conn-1",
    platform: "instagram",
    accountType: "business",
    externalAccountId: "ig-123",
    externalAccountName: "Best Bottles",
    externalAccountHandle: "bestbottles",
    externalParentId: "page-1",
    accessTokenCipher: "v1:cipher",
    status: "active",
    metadata: {},
    ...overrides,
  };
}

function post(overrides: Partial<StoredPost> = {}): StoredPost {
  return {
    id: "post-1",
    organizationId: "org-1",
    platform: "instagram",
    connectionId: "conn-1",
    caption: "Amber glass, 9ml roller.",
    linkUrl: null,
    firstComment: null,
    media: [
      { url: "https://cdn.example.com/a.jpg", type: "image", width: 1000, height: 1250 },
    ],
    options: {},
    attemptCount: 1,
    maxAttempts: 5,
    ...overrides,
  };
}

interface Recorder {
  store: PublishStore;
  attempts: AttemptRecord[];
  published: unknown[];
  failed: unknown[];
  retries: unknown[];
  reauthFlags: unknown[];
}

function recorder(storedConnection: StoredConnection | null = connection()): Recorder {
  const attempts: AttemptRecord[] = [];
  const published: unknown[] = [];
  const failed: unknown[] = [];
  const retries: unknown[] = [];
  const reauthFlags: unknown[] = [];

  return {
    attempts,
    published,
    failed,
    retries,
    reauthFlags,
    store: {
      loadConnection: async () => storedConnection,
      recordAttempt: async (record) => {
        attempts.push(record);
      },
      markPublished: async (input) => {
        published.push(input);
      },
      markFailed: async (input) => {
        failed.push(input);
      },
      rescheduleForRetry: async (input) => {
        retries.push(input);
      },
      flagConnectionNeedsReauth: async (input) => {
        reauthFlags.push(input);
      },
      touchConnectionPublished: async () => {},
    },
  };
}

function driverReturning(result: PublishResult): (platform: string) => SocialDriver {
  return () =>
    ({
      platform: "instagram",
      publish: async () => result,
    }) as unknown as SocialDriver;
}

const decrypt = async () => "plain-token";

describe("executePublish", () => {
  it("publishes and records a success", async () => {
    const rec = recorder();
    const outcome = await executePublish({
      post: post(),
      store: rec.store,
      deps,
      getDriver: driverReturning({
        ok: true,
        externalPostId: "media-1",
        permalink: "https://instagram.com/p/abc",
      }) as never,
      decryptToken: decrypt,
    });

    assert.deepEqual(outcome, {
      status: "published",
      externalPostId: "media-1",
      permalink: "https://instagram.com/p/abc",
    });
    assert.equal(rec.attempts.length, 1);
    assert.equal(rec.attempts[0].outcome, "success");
    assert.deepEqual(rec.published, [
      {
        postId: "post-1",
        externalPostId: "media-1",
        permalink: "https://instagram.com/p/abc",
        publishedAt: NOW.toISOString(),
      },
    ]);
  });

  it("schedules a retry after a rate limit", async () => {
    const rec = recorder();
    const outcome = await executePublish({
      post: post(),
      store: rec.store,
      deps,
      getDriver: driverReturning({
        ok: false,
        httpStatus: 429,
        code: "meta_4",
        message: "Application request limit reached",
      }) as never,
      decryptToken: decrypt,
    });

    assert.equal(outcome.status, "retry_scheduled");
    assert.equal(rec.attempts[0].outcome, "retryable_error");
    assert.equal(rec.retries.length, 1);
    assert.equal(rec.failed.length, 0);
    assert.deepEqual(rec.retries[0], {
      postId: "post-1",
      publishAfter: "2026-09-11T12:01:00.000Z",
      errorCode: "meta_4",
      errorMessage: "Application request limit reached",
    });
  });

  it("flags the connection for re-auth on an expired token and does not retry", async () => {
    const rec = recorder();
    const outcome = await executePublish({
      post: post(),
      store: rec.store,
      deps,
      getDriver: driverReturning({
        ok: false,
        httpStatus: 401,
        code: "meta_190",
        message: "Error validating access token: Session has expired",
      }) as never,
      decryptToken: decrypt,
    });

    assert.equal(outcome.status, "failed");
    assert.equal(rec.retries.length, 0);
    assert.equal(rec.failed.length, 1);
    assert.deepEqual(rec.reauthFlags, [
      {
        connectionId: "conn-1",
        detail: "Error validating access token: Session has expired",
      },
    ]);
  });

  it("re-validates at publish time and never calls the driver on invalid content", async () => {
    const rec = recorder();
    let driverCalled = false;
    const outcome = await executePublish({
      post: post({ caption: "x".repeat(2500) }),
      store: rec.store,
      deps,
      getDriver: (() => {
        driverCalled = true;
        return { platform: "instagram", publish: async () => ({ ok: true, externalPostId: "x" }) };
      }) as never,
      decryptToken: decrypt,
    });

    assert.equal(driverCalled, false);
    assert.equal(outcome.status, "failed");
    assert.equal((outcome as { errorCode: string }).errorCode, "caption_too_long");
  });

  it("fails cleanly when the connection has been disconnected", async () => {
    const rec = recorder(null);
    const outcome = await executePublish({
      post: post(),
      store: rec.store,
      deps,
      getDriver: driverReturning({ ok: true, externalPostId: "x" }) as never,
      decryptToken: decrypt,
    });

    assert.equal(outcome.status, "failed");
    assert.equal((outcome as { errorCode: string }).errorCode, "connection_missing");
  });

  it("stops when the connection is already flagged for re-auth", async () => {
    const rec = recorder(connection({ status: "needs_reauth" }));
    const outcome = await executePublish({
      post: post(),
      store: rec.store,
      deps,
      getDriver: driverReturning({ ok: true, externalPostId: "x" }) as never,
      decryptToken: decrypt,
    });

    assert.equal(outcome.status, "failed");
    assert.equal((outcome as { errorCode: string }).errorCode, "connection_inactive");
  });

  it("converts a thrown driver error into a recorded failure", async () => {
    const rec = recorder();
    const outcome = await executePublish({
      post: post(),
      store: rec.store,
      deps,
      getDriver: (() => ({
        platform: "instagram",
        publish: async () => {
          throw new Error("socket hang up");
        },
      })) as never,
      decryptToken: decrypt,
    });

    assert.equal(outcome.status, "failed");
    assert.equal(rec.attempts[0].errorCode, "driver_threw");
  });

  it("gives up once max attempts are reached", async () => {
    const rec = recorder();
    const outcome = await executePublish({
      post: post({ attemptCount: 5, maxAttempts: 5 }),
      store: rec.store,
      deps,
      getDriver: driverReturning({
        ok: false,
        httpStatus: 503,
        code: "meta_2",
        message: "Service temporarily unavailable",
      }) as never,
      decryptToken: decrypt,
    });

    assert.equal(outcome.status, "failed");
    assert.equal(rec.retries.length, 0);
  });
});
