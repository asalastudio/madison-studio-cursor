/**
 * The driver contract every platform implements.
 *
 * Drivers receive their dependencies (fetch, sleep, clock, logger) rather than
 * reaching for globals, so each one can be exercised against a stub fetch in
 * `tsx --test` without a network or a Deno runtime.
 */

import type { SocialPlatformId } from "../platformRules.ts";
import type { SocialMediaItem } from "../validation.ts";

export interface DriverDeps {
  fetchImpl: typeof fetch;
  /** Awaits `ms` milliseconds. Stubbed to a no-op in tests. */
  sleep: (ms: number) => Promise<void>;
  now: () => Date;
  log: (message: string, meta?: Record<string, unknown>) => void;
}

export interface ConnectionRef {
  id: string;
  platform: SocialPlatformId;
  accountType: string;
  externalAccountId: string;
  externalAccountName?: string | null;
  externalAccountHandle?: string | null;
  externalParentId?: string | null;
  metadata: Record<string, unknown>;
}

export interface PublishRequest {
  caption: string;
  title?: string | null;
  linkUrl?: string | null;
  firstComment?: string | null;
  media: SocialMediaItem[];
  options: Record<string, unknown>;
}

export interface PublishSuccess {
  ok: true;
  externalPostId: string;
  permalink?: string | null;
  /** Trimmed platform response kept in the attempt ledger. */
  responseSummary?: Record<string, unknown>;
}

export interface PublishFailure {
  ok: false;
  httpStatus?: number;
  code: string;
  message: string;
  responseSummary?: Record<string, unknown>;
}

export type PublishResult = PublishSuccess | PublishFailure;

export interface SocialDriver {
  platform: SocialPlatformId;
  publish(
    request: PublishRequest,
    context: { accessToken: string; connection: ConnectionRef; deps: DriverDeps },
  ): Promise<PublishResult>;
}

/** An account surfaced by a platform after OAuth, ready to be stored. */
export interface DiscoveredAccount {
  platform: SocialPlatformId;
  accountType: "personal" | "page" | "business" | "creator";
  externalAccountId: string;
  externalAccountName?: string | null;
  externalAccountHandle?: string | null;
  externalAccountAvatarUrl?: string | null;
  externalParentId?: string | null;
  externalParentName?: string | null;
  /** Token to store for this specific surface (Meta issues per-Page tokens). */
  accessToken: string;
  refreshToken?: string | null;
  tokenExpiresAt?: string | null;
  refreshTokenExpiresAt?: string | null;
  scopes: string[];
  metadata?: Record<string, unknown>;
}

export function failure(
  code: string,
  message: string,
  httpStatus?: number,
  responseSummary?: Record<string, unknown>,
): PublishFailure {
  return { ok: false, code, message, httpStatus, responseSummary };
}

/** Reads a response body once, tolerating non-JSON error pages. */
export async function readBody(response: Response): Promise<{ json: any; text: string }> {
  const text = await response.text();
  try {
    return { json: JSON.parse(text), text };
  } catch {
    return { json: null, text };
  }
}

/** Truncates a platform payload so the attempt ledger stays small. */
export function summarize(value: unknown, maxChars = 2000): Record<string, unknown> {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) return {};
    return {
      payload:
        serialized.length > maxChars ? `${serialized.slice(0, maxChars)}…[truncated]` : serialized,
    };
  } catch {
    return { payload: "[unserializable]" };
  }
}

export const defaultDeps: DriverDeps = {
  fetchImpl: (...args) => fetch(...args),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => new Date(),
  log: (message, meta) => console.log(message, meta ?? ""),
};
