/**
 * Canonical per-platform publishing constraints.
 *
 * This module is the single source of truth for what each network will accept.
 * It is intentionally dependency-free (no Deno globals, no remote imports) so it
 * can be unit tested with `tsx --test` and imported by both the edge functions
 * and the front-end validation mirror in src/config/socialPlatforms.ts.
 *
 * Numbers here are the documented platform limits as of 2026-09. When a platform
 * tightens a limit, change it here and both lanes follow.
 */

export type SocialPlatformId =
  | "instagram"
  | "facebook"
  | "linkedin"
  | "pinterest"
  | "tiktok"
  | "threads";

export type SocialMediaKind = "image" | "video";

export interface SocialPlatformRule {
  id: SocialPlatformId;
  label: string;
  /** False while no publishing driver exists; the UI shows it as "coming soon". */
  supported: boolean;
  /** Maximum caption/body length in characters. */
  captionMaxLength: number;
  /** Optional separate title field (Pinterest, YouTube). */
  titleMaxLength?: number;
  /** Post cannot be created without at least one media item. */
  mediaRequired: boolean;
  minMediaCount: number;
  maxMediaCount: number;
  allowedMediaKinds: SocialMediaKind[];
  /** Mixing images and video in one post is rejected by most networks. */
  allowsMixedMedia: boolean;
  /** Platform fetches media from a public HTTPS URL rather than a binary upload. */
  requiresPublicMediaUrl: boolean;
  /** Accepted image aspect ratios (width / height), inclusive. */
  imageAspectRatio?: { min: number; max: number };
  videoDurationSeconds?: { min: number; max: number };
  /** A destination/link field exists separately from the caption. */
  supportsLinkField: boolean;
  /** Links inside the caption are rendered as plain text, not clickable. */
  linksInCaptionAreClickable: boolean;
  supportsFirstComment: boolean;
  /** Soft cap — we warn rather than block. */
  recommendedHashtagLimit?: number;
  hashtagHardLimit?: number;
  /** Extra fields the composer must collect before the post is publishable. */
  requiredOptions: string[];
  /** Documented publishing quota, used for operator-facing copy only. */
  publishQuotaNote?: string;
}

export const SOCIAL_PLATFORM_RULES: Record<SocialPlatformId, SocialPlatformRule> = {
  instagram: {
    id: "instagram",
    label: "Instagram",
    supported: true,
    captionMaxLength: 2200,
    mediaRequired: true,
    minMediaCount: 1,
    maxMediaCount: 10,
    allowedMediaKinds: ["image", "video"],
    allowsMixedMedia: true, // carousels may mix images and video
    requiresPublicMediaUrl: true,
    imageAspectRatio: { min: 0.8, max: 1.91 },
    videoDurationSeconds: { min: 3, max: 900 },
    supportsLinkField: false,
    linksInCaptionAreClickable: false,
    supportsFirstComment: true,
    recommendedHashtagLimit: 10,
    hashtagHardLimit: 30,
    requiredOptions: [],
    publishQuotaNote: "50 published posts per IG account per rolling 24 hours.",
  },
  facebook: {
    id: "facebook",
    label: "Facebook Page",
    supported: true,
    captionMaxLength: 63206,
    mediaRequired: false,
    minMediaCount: 0,
    maxMediaCount: 10,
    allowedMediaKinds: ["image", "video"],
    allowsMixedMedia: false,
    requiresPublicMediaUrl: true,
    supportsLinkField: true,
    linksInCaptionAreClickable: true,
    supportsFirstComment: true,
    recommendedHashtagLimit: 3,
    requiredOptions: [],
  },
  linkedin: {
    id: "linkedin",
    label: "LinkedIn",
    supported: true,
    captionMaxLength: 3000,
    mediaRequired: false,
    minMediaCount: 0,
    maxMediaCount: 1,
    allowedMediaKinds: ["image"],
    allowsMixedMedia: false,
    requiresPublicMediaUrl: true,
    supportsLinkField: true,
    linksInCaptionAreClickable: true,
    supportsFirstComment: false,
    recommendedHashtagLimit: 5,
    requiredOptions: [],
  },
  pinterest: {
    id: "pinterest",
    label: "Pinterest",
    supported: true,
    captionMaxLength: 800,
    titleMaxLength: 100,
    mediaRequired: true,
    minMediaCount: 1,
    maxMediaCount: 1,
    allowedMediaKinds: ["image"],
    allowsMixedMedia: false,
    requiresPublicMediaUrl: true,
    supportsLinkField: true,
    linksInCaptionAreClickable: true,
    supportsFirstComment: false,
    recommendedHashtagLimit: 0,
    requiredOptions: ["boardId"],
  },
  tiktok: {
    id: "tiktok",
    label: "TikTok",
    supported: true,
    captionMaxLength: 2200,
    mediaRequired: true,
    minMediaCount: 1,
    maxMediaCount: 1,
    allowedMediaKinds: ["video"],
    allowsMixedMedia: false,
    requiresPublicMediaUrl: true,
    videoDurationSeconds: { min: 3, max: 600 },
    supportsLinkField: false,
    linksInCaptionAreClickable: false,
    supportsFirstComment: false,
    recommendedHashtagLimit: 5,
    requiredOptions: ["privacyLevel"],
    publishQuotaNote:
      "Apps that have not passed TikTok's content-posting audit can only publish as SELF_ONLY (private).",
  },
  threads: {
    id: "threads",
    label: "Threads",
    supported: false,
    captionMaxLength: 500,
    mediaRequired: false,
    minMediaCount: 0,
    maxMediaCount: 10,
    allowedMediaKinds: ["image", "video"],
    allowsMixedMedia: true,
    requiresPublicMediaUrl: true,
    supportsLinkField: true,
    linksInCaptionAreClickable: true,
    supportsFirstComment: false,
    requiredOptions: [],
  },
};

/** Every platform id the schema's CHECK constraint accepts. */
export const ALL_SOCIAL_PLATFORMS = Object.keys(
  SOCIAL_PLATFORM_RULES,
) as SocialPlatformId[];

/** Platforms with a working publishing driver. */
export const SUPPORTED_SOCIAL_PLATFORMS = ALL_SOCIAL_PLATFORMS.filter(
  (id) => SOCIAL_PLATFORM_RULES[id].supported,
);

export function isSocialPlatformId(value: unknown): value is SocialPlatformId {
  return typeof value === "string" && value in SOCIAL_PLATFORM_RULES;
}

export function getPlatformRule(platform: SocialPlatformId): SocialPlatformRule {
  const rule = SOCIAL_PLATFORM_RULES[platform];
  if (!rule) {
    throw new Error(`Unknown social platform: ${platform}`);
  }
  return rule;
}
