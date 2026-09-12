/**
 * The one code path that actually publishes a post.
 *
 * Both `social-publish` (publish now) and `social-scheduler` (publish when due)
 * call executePublish, so retry semantics, the attempt ledger, re-auth flagging
 * and validation cannot drift between the two.
 *
 * Persistence is behind the PublishStore interface rather than a Supabase client
 * so the whole decision tree is unit-testable against an in-memory store.
 */

import type { SocialPlatformId } from "./platformRules.ts";
import { validateSocialPost, type SocialMediaItem } from "./validation.ts";
import { classifyPublishFailure, planNextAttempt } from "./retry.ts";
import type { ConnectionRef, DriverDeps, PublishResult, SocialDriver } from "./drivers/types.ts";

export interface StoredPost {
  id: string;
  organizationId: string;
  platform: SocialPlatformId;
  connectionId: string | null;
  caption: string;
  linkUrl: string | null;
  firstComment: string | null;
  media: SocialMediaItem[];
  options: Record<string, unknown>;
  attemptCount: number;
  maxAttempts: number;
}

export interface StoredConnection {
  id: string;
  platform: SocialPlatformId;
  accountType: string;
  externalAccountId: string;
  externalAccountName: string | null;
  externalAccountHandle: string | null;
  externalParentId: string | null;
  accessTokenCipher: string;
  status: string;
  metadata: Record<string, unknown>;
}

export interface AttemptRecord {
  postId: string;
  organizationId: string;
  platform: SocialPlatformId;
  attemptNumber: number;
  outcome: "success" | "retryable_error" | "permanent_error";
  httpStatus?: number;
  errorCode?: string;
  errorMessage?: string;
  responseSummary?: Record<string, unknown>;
}

export interface PublishStore {
  loadConnection(connectionId: string): Promise<StoredConnection | null>;
  recordAttempt(record: AttemptRecord): Promise<void>;
  markPublished(input: {
    postId: string;
    externalPostId: string;
    permalink: string | null;
    publishedAt: string;
  }): Promise<void>;
  markFailed(input: {
    postId: string;
    errorCode: string;
    errorMessage: string;
  }): Promise<void>;
  rescheduleForRetry(input: {
    postId: string;
    publishAfter: string;
    errorCode: string;
    errorMessage: string;
  }): Promise<void>;
  flagConnectionNeedsReauth(input: { connectionId: string; detail: string }): Promise<void>;
  touchConnectionPublished(input: { connectionId: string; at: string }): Promise<void>;
}

export interface ExecutePublishInput {
  post: StoredPost;
  store: PublishStore;
  deps: DriverDeps;
  getDriver: (platform: SocialPlatformId) => SocialDriver;
  decryptToken: (cipher: string) => Promise<string>;
  /** 0..1, folded into the retry backoff so concurrent retries fan out. */
  jitter?: number;
}

export type ExecutePublishOutcome =
  | { status: "published"; externalPostId: string; permalink: string | null }
  | { status: "retry_scheduled"; publishAfter: string; errorCode: string; errorMessage: string }
  | { status: "failed"; errorCode: string; errorMessage: string };

export async function executePublish(
  input: ExecutePublishInput,
): Promise<ExecutePublishOutcome> {
  const { post, store, deps } = input;
  const attemptNumber = Math.max(1, post.attemptCount);

  const fail = async (
    code: string,
    message: string,
    httpStatus?: number,
    responseSummary?: Record<string, unknown>,
  ): Promise<ExecutePublishOutcome> => {
    const failure = classifyPublishFailure({ httpStatus, code, message });
    const plan = planNextAttempt({
      failure,
      attemptCount: attemptNumber,
      maxAttempts: post.maxAttempts,
      now: deps.now(),
      jitter: input.jitter ?? 0,
    });

    await store.recordAttempt({
      postId: post.id,
      organizationId: post.organizationId,
      platform: post.platform,
      attemptNumber,
      outcome: failure.outcome,
      httpStatus,
      errorCode: failure.code,
      errorMessage: failure.message,
      responseSummary,
    });

    if (failure.requiresReauth && post.connectionId) {
      await store.flagConnectionNeedsReauth({
        connectionId: post.connectionId,
        detail: failure.message,
      });
    }

    if (plan.status === "scheduled" && plan.publishAfter) {
      await store.rescheduleForRetry({
        postId: post.id,
        publishAfter: plan.publishAfter,
        errorCode: failure.code,
        errorMessage: failure.message,
      });
      return {
        status: "retry_scheduled",
        publishAfter: plan.publishAfter,
        errorCode: failure.code,
        errorMessage: failure.message,
      };
    }

    await store.markFailed({
      postId: post.id,
      errorCode: failure.code,
      errorMessage: failure.message,
    });
    return { status: "failed", errorCode: failure.code, errorMessage: failure.message };
  };

  if (!post.connectionId) {
    return fail("connection_missing", "This post is not linked to a connected account.");
  }

  const connection = await store.loadConnection(post.connectionId);
  if (!connection) {
    return fail("connection_missing", "The connected account no longer exists.");
  }
  if (connection.status !== "active") {
    return fail(
      "connection_inactive",
      `The ${connection.platform} connection is ${connection.status}. Reconnect it in Settings → Integrations.`,
    );
  }

  // Re-validate at publish time: media can be deleted or replaced between the
  // moment a post is scheduled and the moment it goes out.
  const validation = validateSocialPost({
    platform: post.platform,
    caption: post.caption,
    title: typeof post.options.title === "string" ? post.options.title : null,
    linkUrl: post.linkUrl,
    firstComment: post.firstComment,
    media: post.media,
    options: post.options,
  });
  if (!validation.valid) {
    return fail(
      validation.errors[0]?.code ?? "validation_failed",
      validation.errors.map((issue) => issue.message).join(" "),
    );
  }

  let accessToken: string;
  try {
    accessToken = await input.decryptToken(connection.accessTokenCipher);
  } catch (error) {
    return fail(
      "token_decrypt_failed",
      error instanceof Error ? error.message : "Stored token could not be decrypted.",
    );
  }

  const connectionRef: ConnectionRef = {
    id: connection.id,
    platform: connection.platform,
    accountType: connection.accountType,
    externalAccountId: connection.externalAccountId,
    externalAccountName: connection.externalAccountName,
    externalAccountHandle: connection.externalAccountHandle,
    externalParentId: connection.externalParentId,
    metadata: connection.metadata ?? {},
  };

  let result: PublishResult;
  try {
    const driver = input.getDriver(post.platform);
    result = await driver.publish(
      {
        caption: post.caption,
        title: typeof post.options.title === "string" ? post.options.title : null,
        linkUrl: post.linkUrl,
        firstComment: post.firstComment,
        media: post.media,
        options: post.options,
      },
      { accessToken, connection: connectionRef, deps },
    );
  } catch (error) {
    return fail(
      "driver_threw",
      error instanceof Error ? error.message : "The publishing driver threw an error.",
    );
  }

  if (!result.ok) {
    return fail(result.code, result.message, result.httpStatus, result.responseSummary);
  }

  const publishedAt = deps.now().toISOString();
  await store.recordAttempt({
    postId: post.id,
    organizationId: post.organizationId,
    platform: post.platform,
    attemptNumber,
    outcome: "success",
    responseSummary: result.responseSummary,
  });
  await store.markPublished({
    postId: post.id,
    externalPostId: result.externalPostId,
    permalink: result.permalink ?? null,
    publishedAt,
  });
  await store.touchConnectionPublished({ connectionId: connection.id, at: publishedAt });

  return {
    status: "published",
    externalPostId: result.externalPostId,
    permalink: result.permalink ?? null,
  };
}
