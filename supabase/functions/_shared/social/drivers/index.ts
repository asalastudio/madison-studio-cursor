/**
 * Driver registry + post-OAuth account discovery dispatch.
 */

import type { SocialPlatformId } from "../platformRules.ts";
import { facebookDriver, instagramDriver, discoverMetaAccounts } from "./meta.ts";
import { linkedinDriver, discoverLinkedInAccounts } from "./linkedin.ts";
import { pinterestDriver, discoverPinterestAccounts } from "./pinterest.ts";
import { tiktokDriver, discoverTikTokAccounts } from "./tiktok.ts";
import type { DiscoveredAccount, DriverDeps, SocialDriver } from "./types.ts";

export const SOCIAL_DRIVERS: Partial<Record<SocialPlatformId, SocialDriver>> = {
  instagram: instagramDriver,
  facebook: facebookDriver,
  linkedin: linkedinDriver,
  pinterest: pinterestDriver,
  tiktok: tiktokDriver,
};

export function getDriver(platform: SocialPlatformId): SocialDriver {
  const driver = SOCIAL_DRIVERS[platform];
  if (!driver) {
    throw new Error(`No publishing driver for platform: ${platform}`);
  }
  return driver;
}

export interface DiscoveryInput {
  platform: SocialPlatformId;
  accessToken: string;
  refreshToken?: string | null;
  tokenExpiresAt: string | null;
  refreshTokenExpiresAt?: string | null;
  scopes: string[];
  /** Meta needs these to exchange for a long-lived token before discovery. */
  appId?: string;
  appSecret?: string;
}

/**
 * Turns a freshly granted OAuth token into the set of surfaces we can publish
 * to. Meta returns several (every Page plus its IG account); the others return
 * one or two.
 */
export async function discoverAccounts(
  deps: DriverDeps,
  input: DiscoveryInput,
): Promise<{ accounts: DiscoveredAccount[] } | { error: string }> {
  switch (input.platform) {
    case "instagram":
    case "facebook": {
      if (!input.appId || !input.appSecret) {
        return { error: "META_APP_ID / META_APP_SECRET are not configured." };
      }
      const longLived = await exchangeMeta(deps, input);
      if ("error" in longLived) return longLived;
      return discoverMetaAccounts(deps, {
        longLivedUserToken: longLived.accessToken,
        scopes: input.scopes,
        userTokenExpiresAt: longLived.expiresAt,
      });
    }
    case "linkedin":
      return discoverLinkedInAccounts(deps, {
        accessToken: input.accessToken,
        scopes: input.scopes,
        tokenExpiresAt: input.tokenExpiresAt,
        refreshToken: input.refreshToken,
        refreshTokenExpiresAt: input.refreshTokenExpiresAt,
      });
    case "pinterest":
      return discoverPinterestAccounts(deps, {
        accessToken: input.accessToken,
        scopes: input.scopes,
        tokenExpiresAt: input.tokenExpiresAt,
        refreshToken: input.refreshToken,
        refreshTokenExpiresAt: input.refreshTokenExpiresAt,
      });
    case "tiktok":
      return discoverTikTokAccounts(deps, {
        accessToken: input.accessToken,
        scopes: input.scopes,
        tokenExpiresAt: input.tokenExpiresAt,
        refreshToken: input.refreshToken,
        refreshTokenExpiresAt: input.refreshTokenExpiresAt,
      });
    default:
      return { error: `Account discovery is not implemented for ${input.platform}.` };
  }
}

async function exchangeMeta(
  deps: DriverDeps,
  input: DiscoveryInput,
): Promise<{ accessToken: string; expiresAt: string | null } | { error: string }> {
  const { exchangeForLongLivedUserToken } = await import("./meta.ts");
  const exchanged = await exchangeForLongLivedUserToken(deps, {
    appId: input.appId!,
    appSecret: input.appSecret!,
    shortLivedToken: input.accessToken,
  });
  if ("error" in exchanged) return exchanged;

  return {
    accessToken: exchanged.accessToken,
    expiresAt: exchanged.expiresInSeconds
      ? new Date(deps.now().getTime() + exchanged.expiresInSeconds * 1000).toISOString()
      : null,
  };
}

export type { DiscoveredAccount, DriverDeps, SocialDriver };
