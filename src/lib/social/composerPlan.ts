/**
 * Turns one composer state into the per-platform targets sent to social-publish.
 *
 * The interesting part is media fan-out: a single upload set has to become a
 * 10-image Instagram carousel, a single-image LinkedIn post, one Pinterest pin
 * and a TikTok video without the user curating four separate posts by hand.
 *
 * Client-side checks here are for immediate feedback only — `social-publish`
 * re-runs the full rule set server-side and is the authority. src/config/
 * socialPlatforms.test.ts keeps the two limit sets from drifting.
 */

import {
  SOCIAL_PLATFORMS,
  type SocialMediaKind,
  type SocialPlatformId,
} from "@/config/socialPlatforms";

export interface ComposerMedia {
  url: string;
  type: SocialMediaKind;
  alt?: string;
  width?: number;
  height?: number;
  durationMs?: number;
}

export interface ComposerConnection {
  id: string;
  platform: SocialPlatformId;
  accountName: string;
  accountHandle?: string | null;
  status: string;
}

export interface ComposerState {
  baseCaption: string;
  /** Per-platform caption overrides; absent means "use the base caption". */
  captionOverrides: Partial<Record<SocialPlatformId, string>>;
  title: string;
  linkUrl: string;
  firstComment: string;
  media: ComposerMedia[];
  selectedConnectionIds: string[];
  platformOptions: Partial<Record<SocialPlatformId, Record<string, unknown>>>;
}

export interface ComposerTarget {
  platform: SocialPlatformId;
  connectionId: string;
  connectionLabel: string;
  caption: string;
  title: string | null;
  linkUrl: string | null;
  firstComment: string | null;
  media: ComposerMedia[];
  options: Record<string, unknown>;
  /** Blocking problems — the composer disables submit while any exist. */
  errors: string[];
  /** Non-blocking notes, e.g. "the link will be dropped on Instagram". */
  notes: string[];
}

export interface ComposerPlan {
  targets: ComposerTarget[];
  /** True when every selected target is publishable. */
  canPublish: boolean;
  errorCount: number;
}

export function emptyComposerState(overrides: Partial<ComposerState> = {}): ComposerState {
  return {
    baseCaption: "",
    captionOverrides: {},
    title: "",
    linkUrl: "",
    firstComment: "",
    media: [],
    selectedConnectionIds: [],
    platformOptions: {},
    ...overrides,
  };
}

export function captionFor(state: ComposerState, platform: SocialPlatformId): string {
  const override = state.captionOverrides[platform];
  return override !== undefined && override !== null ? override : state.baseCaption;
}

/**
 * Picks the subset of the uploaded media a given platform can actually accept.
 * Networks that refuse mixed media get whichever kind leads the selection.
 */
export function selectMediaForPlatform(
  media: ComposerMedia[],
  platform: SocialPlatformId,
): ComposerMedia[] {
  const spec = SOCIAL_PLATFORMS[platform];
  let usable = media.filter((item) => spec.allowedMediaKinds.includes(item.type));

  if (!spec.allowsMixedMedia) {
    const kinds = new Set(usable.map((item) => item.type));
    if (kinds.size > 1) {
      // Video-first platforms lead with video; everything else leads with the
      // kind of the first usable asset.
      const preferred: SocialMediaKind = spec.allowedMediaKinds.includes("video")
        && spec.allowedMediaKinds.length === 1
        ? "video"
        : usable[0].type;
      usable = usable.filter((item) => item.type === preferred);
    }
  }

  return usable.slice(0, spec.maxMediaCount);
}

function hashtagCount(text: string): number {
  return (text.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? []).length;
}

export function buildComposerPlan(input: {
  state: ComposerState;
  connections: ComposerConnection[];
}): ComposerPlan {
  const { state } = input;
  const byId = new Map(input.connections.map((connection) => [connection.id, connection]));

  const targets: ComposerTarget[] = [];

  for (const connectionId of state.selectedConnectionIds) {
    const connection = byId.get(connectionId);
    if (!connection) continue;

    const platform = connection.platform;
    const spec = SOCIAL_PLATFORMS[platform];
    const caption = captionFor(state, platform);
    const media = selectMediaForPlatform(state.media, platform);
    const options = { ...(state.platformOptions[platform] ?? {}) };

    const errors: string[] = [];
    const notes: string[] = [];

    if (connection.status !== "active") {
      errors.push(`${spec.label} needs to be reconnected before it can publish.`);
    }
    if (!spec.supported) {
      errors.push(`${spec.label} publishing is not available yet.`);
    }
    if (caption.length > spec.captionMaxLength) {
      errors.push(
        `Caption is ${caption.length - spec.captionMaxLength} characters over the ${spec.label} limit.`,
      );
    }
    if (caption.trim().length === 0 && media.length === 0) {
      errors.push(`${spec.label} needs text or media.`);
    }
    if (spec.mediaRequired && media.length === 0) {
      const uploaded = state.media.length;
      errors.push(
        uploaded === 0
          ? `${spec.label} requires media.`
          : `None of the attached media is a ${spec.allowedMediaKinds.join(" or ")} that ${spec.label} accepts.`,
      );
    }
    for (const key of spec.requiredOptions) {
      const value = options[key];
      if (value === undefined || value === null || value === "") {
        errors.push(`${spec.label} needs ${humanizeOption(key)}.`);
      }
    }
    if (spec.titleMaxLength && state.title.length > spec.titleMaxLength) {
      errors.push(`Title is over the ${spec.label} ${spec.titleMaxLength}-character limit.`);
    }
    if (spec.hashtagHardLimit !== undefined && hashtagCount(caption) > spec.hashtagHardLimit) {
      errors.push(`${spec.label} rejects more than ${spec.hashtagHardLimit} hashtags.`);
    }

    if (state.media.length > media.length) {
      notes.push(
        `${state.media.length - media.length} of ${state.media.length} attachments will not be sent to ${spec.label}.`,
      );
    }
    if (state.linkUrl && !spec.supportsLinkField) {
      notes.push(
        spec.linksInCaptionAreClickable
          ? `${spec.label} has no link field; add the URL to the caption instead.`
          : `${spec.label} has no link field and caption links are not clickable.`,
      );
    }
    if (state.firstComment && !spec.supportsFirstComment) {
      notes.push(`${spec.label} does not support a first comment; it will be skipped.`);
    }
    if (
      spec.recommendedHashtagLimit !== undefined &&
      hashtagCount(caption) > spec.recommendedHashtagLimit &&
      (spec.hashtagHardLimit === undefined || hashtagCount(caption) <= spec.hashtagHardLimit)
    ) {
      notes.push(
        spec.recommendedHashtagLimit === 0
          ? `${spec.label} posts perform better without hashtags.`
          : `${spec.label} posts perform better with ${spec.recommendedHashtagLimit} hashtags or fewer.`,
      );
    }

    targets.push({
      platform,
      connectionId,
      connectionLabel: connection.accountHandle
        ? `${connection.accountName} (@${connection.accountHandle})`
        : connection.accountName,
      caption,
      title: state.title ? state.title : null,
      linkUrl: spec.supportsLinkField && state.linkUrl ? state.linkUrl : null,
      firstComment: spec.supportsFirstComment && state.firstComment ? state.firstComment : null,
      media,
      options,
      errors,
      notes,
    });
  }

  const errorCount = targets.reduce((total, target) => total + target.errors.length, 0);

  return {
    targets,
    canPublish: targets.length > 0 && errorCount === 0,
    errorCount,
  };
}

function humanizeOption(key: string): string {
  switch (key) {
    case "boardId":
      return "a board";
    case "privacyLevel":
      return "a privacy level";
    default:
      return `"${key}"`;
  }
}

/** Shapes a plan into the payload social-publish expects. */
export function toPublishPayload(input: {
  plan: ComposerPlan;
  organizationId: string;
  mode: "now" | "schedule" | "draft";
  scheduledFor?: string | null;
  timezone?: string;
  idempotencyKey?: string;
  scheduledContentId?: string | null;
  masterContentId?: string | null;
  derivativeAssetId?: string | null;
}): Record<string, unknown> {
  return {
    action: "create",
    organizationId: input.organizationId,
    mode: input.mode,
    scheduledFor: input.scheduledFor ?? null,
    timezone: input.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    idempotencyKey: input.idempotencyKey,
    scheduledContentId: input.scheduledContentId ?? null,
    masterContentId: input.masterContentId ?? null,
    derivativeAssetId: input.derivativeAssetId ?? null,
    targets: input.plan.targets.map((target) => ({
      platform: target.platform,
      connectionId: target.connectionId,
      caption: target.caption,
      title: target.title,
      linkUrl: target.linkUrl,
      firstComment: target.firstComment,
      media: target.media.map((item) => ({
        url: item.url,
        type: item.type,
        alt: item.alt ?? null,
        width: item.width ?? null,
        height: item.height ?? null,
        duration_ms: item.durationMs ?? null,
      })),
      options: target.options,
    })),
  };
}
