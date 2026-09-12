/**
 * Pre-flight validation for a single platform target.
 *
 * Runs in three places against the same rules: the composer (live, as the user
 * types), social-publish (before anything is written), and the scheduler (again
 * at publish time, because media can be deleted between scheduling and posting).
 *
 * Dependency-free by design — see platformRules.ts.
 */

import {
  getPlatformRule,
  type SocialMediaKind,
  type SocialPlatformId,
} from "./platformRules.ts";

export interface SocialMediaItem {
  url: string;
  type: SocialMediaKind;
  alt?: string | null;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  thumbnailUrl?: string | null;
}

export interface SocialPostDraft {
  platform: SocialPlatformId;
  caption: string;
  title?: string | null;
  linkUrl?: string | null;
  firstComment?: string | null;
  media: SocialMediaItem[];
  options?: Record<string, unknown>;
}

export interface SocialValidationIssue {
  field: string;
  code: string;
  message: string;
}

export interface SocialValidationResult {
  platform: SocialPlatformId;
  valid: boolean;
  errors: SocialValidationIssue[];
  warnings: SocialValidationIssue[];
}

const HASHTAG_PATTERN = /(^|\s)#[\p{L}\p{N}_]+/gu;

export function countHashtags(text: string): number {
  const matches = text.match(HASHTAG_PATTERN);
  return matches ? matches.length : 0;
}

export function isPubliclyFetchableUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local")) return false;
  // Anything that resolves inside a private range can't be fetched by a platform.
  if (/^(10|127)\./.test(host)) return false;
  if (/^192\.168\./.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
  return true;
}

function aspectRatio(item: SocialMediaItem): number | null {
  if (!item.width || !item.height) return null;
  if (item.height <= 0) return null;
  return item.width / item.height;
}

export function validateSocialPost(draft: SocialPostDraft): SocialValidationResult {
  const rule = getPlatformRule(draft.platform);
  const errors: SocialValidationIssue[] = [];
  const warnings: SocialValidationIssue[] = [];
  const media = draft.media ?? [];
  const options = draft.options ?? {};

  if (!rule.supported) {
    errors.push({
      field: "platform",
      code: "platform_unsupported",
      message: `${rule.label} publishing is not available yet.`,
    });
  }

  // --- caption -------------------------------------------------------------
  const caption = draft.caption ?? "";
  if (caption.length > rule.captionMaxLength) {
    errors.push({
      field: "caption",
      code: "caption_too_long",
      message: `${rule.label} captions are limited to ${rule.captionMaxLength} characters (currently ${caption.length}).`,
    });
  }
  if (caption.trim().length === 0 && media.length === 0) {
    errors.push({
      field: "caption",
      code: "empty_post",
      message: "A post needs either text or media.",
    });
  }

  // --- title ---------------------------------------------------------------
  const title = draft.title ?? "";
  if (rule.titleMaxLength && title.length > rule.titleMaxLength) {
    errors.push({
      field: "title",
      code: "title_too_long",
      message: `${rule.label} titles are limited to ${rule.titleMaxLength} characters (currently ${title.length}).`,
    });
  }

  // --- media count ---------------------------------------------------------
  if (rule.mediaRequired && media.length < Math.max(rule.minMediaCount, 1)) {
    errors.push({
      field: "media",
      code: "media_required",
      message: `${rule.label} requires at least ${Math.max(rule.minMediaCount, 1)} media item.`,
    });
  }
  if (media.length > rule.maxMediaCount) {
    errors.push({
      field: "media",
      code: "too_many_media",
      message: `${rule.label} accepts at most ${rule.maxMediaCount} media item${rule.maxMediaCount === 1 ? "" : "s"} (currently ${media.length}).`,
    });
  }

  // --- media shape ---------------------------------------------------------
  const kinds = new Set(media.map((item) => item.type));
  for (const kind of kinds) {
    if (!rule.allowedMediaKinds.includes(kind)) {
      errors.push({
        field: "media",
        code: "media_kind_unsupported",
        message: `${rule.label} does not accept ${kind} media from the API.`,
      });
    }
  }
  if (!rule.allowsMixedMedia && kinds.size > 1) {
    errors.push({
      field: "media",
      code: "mixed_media",
      message: `${rule.label} cannot mix images and video in one post.`,
    });
  }

  media.forEach((item, index) => {
    if (rule.requiresPublicMediaUrl && !isPubliclyFetchableUrl(item.url)) {
      errors.push({
        field: `media.${index}.url`,
        code: "media_url_not_public",
        message: `${rule.label} downloads media itself, so every asset needs a public HTTPS URL.`,
      });
    }

    if (item.type === "image" && rule.imageAspectRatio) {
      const ratio = aspectRatio(item);
      if (ratio !== null) {
        if (ratio < rule.imageAspectRatio.min || ratio > rule.imageAspectRatio.max) {
          errors.push({
            field: `media.${index}`,
            code: "aspect_ratio_out_of_range",
            message: `${rule.label} accepts aspect ratios between ${rule.imageAspectRatio.min} and ${rule.imageAspectRatio.max}; this asset is ${ratio.toFixed(2)}.`,
          });
        }
      } else {
        warnings.push({
          field: `media.${index}`,
          code: "aspect_ratio_unknown",
          message: "Image dimensions are unknown, so the aspect ratio could not be checked.",
        });
      }
    }

    if (item.type === "video" && rule.videoDurationSeconds && item.durationMs) {
      const seconds = item.durationMs / 1000;
      if (seconds < rule.videoDurationSeconds.min || seconds > rule.videoDurationSeconds.max) {
        errors.push({
          field: `media.${index}`,
          code: "duration_out_of_range",
          message: `${rule.label} accepts videos between ${rule.videoDurationSeconds.min}s and ${rule.videoDurationSeconds.max}s; this one is ${seconds.toFixed(1)}s.`,
        });
      }
    }
  });

  // --- required platform options ------------------------------------------
  for (const key of rule.requiredOptions) {
    const value = options[key];
    if (value === undefined || value === null || value === "") {
      errors.push({
        field: `options.${key}`,
        code: "missing_required_option",
        message: `${rule.label} requires "${key}" to be set before publishing.`,
      });
    }
  }

  // --- link ----------------------------------------------------------------
  if (draft.linkUrl) {
    if (!rule.supportsLinkField) {
      warnings.push({
        field: "linkUrl",
        code: "link_field_unsupported",
        message: `${rule.label} has no link field; the URL will be dropped${rule.linksInCaptionAreClickable ? "" : " (and pasting it in the caption will not be clickable)"}.`,
      });
    } else {
      try {
        const parsed = new URL(draft.linkUrl);
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
          errors.push({
            field: "linkUrl",
            code: "invalid_link",
            message: "Destination link must be an http(s) URL.",
          });
        }
      } catch {
        errors.push({
          field: "linkUrl",
          code: "invalid_link",
          message: "Destination link is not a valid URL.",
        });
      }
    }
  }

  // --- first comment -------------------------------------------------------
  if (draft.firstComment && !rule.supportsFirstComment) {
    warnings.push({
      field: "firstComment",
      code: "first_comment_unsupported",
      message: `${rule.label} does not support an automatic first comment; it will be ignored.`,
    });
  }

  // --- hashtags ------------------------------------------------------------
  const hashtags = countHashtags(caption);
  if (rule.hashtagHardLimit !== undefined && hashtags > rule.hashtagHardLimit) {
    errors.push({
      field: "caption",
      code: "too_many_hashtags",
      message: `${rule.label} rejects posts with more than ${rule.hashtagHardLimit} hashtags (currently ${hashtags}).`,
    });
  } else if (
    rule.recommendedHashtagLimit !== undefined &&
    hashtags > rule.recommendedHashtagLimit
  ) {
    warnings.push({
      field: "caption",
      code: "hashtags_above_recommendation",
      message:
        rule.recommendedHashtagLimit === 0
          ? `${rule.label} posts perform better without hashtags.`
          : `${rule.label} posts perform better with ${rule.recommendedHashtagLimit} hashtags or fewer (currently ${hashtags}).`,
    });
  }

  return {
    platform: draft.platform,
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
