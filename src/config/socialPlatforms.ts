/**
 * Front-end mirror of the publishing constraints in
 * supabase/functions/_shared/social/platformRules.ts, plus the presentation
 * details (icon, brand colour, operator-facing notes) the edge runtime has no
 * use for.
 *
 * The two files are kept in step by src/config/socialPlatforms.test.ts, which
 * imports the edge module directly and asserts every shared number matches.
 * `tsconfig.app.json` excludes supabase/functions from the app build, so the
 * cross-import lives in the test only.
 */

import { Instagram, Facebook, Linkedin, Music2, AtSign, type LucideIcon } from "lucide-react";

export type SocialPlatformId =
  | "instagram"
  | "facebook"
  | "linkedin"
  | "pinterest"
  | "tiktok"
  | "threads";

export type SocialMediaKind = "image" | "video";

export interface SocialPlatformUiSpec {
  id: SocialPlatformId;
  label: string;
  supported: boolean;
  icon: LucideIcon;
  brandColor: string;
  /** One line explaining why this channel is worth the setup effort. */
  valueNote: string;
  /** What the operator has to do outside Madison before this can go live. */
  setupNote: string;
  captionMaxLength: number;
  titleMaxLength?: number;
  mediaRequired: boolean;
  minMediaCount: number;
  maxMediaCount: number;
  allowedMediaKinds: SocialMediaKind[];
  allowsMixedMedia: boolean;
  supportsLinkField: boolean;
  linksInCaptionAreClickable: boolean;
  supportsFirstComment: boolean;
  recommendedHashtagLimit?: number;
  hashtagHardLimit?: number;
  requiredOptions: string[];
}

/**
 * Pinterest has no Lucide glyph; the shared `AtSign` stand-in keeps the row
 * visually consistent rather than shipping a half-right logo.
 */
export const SOCIAL_PLATFORMS: Record<SocialPlatformId, SocialPlatformUiSpec> = {
  instagram: {
    id: "instagram",
    label: "Instagram",
    supported: true,
    icon: Instagram,
    brandColor: "#E4405F",
    valueNote:
      "Where packaging is actually judged. Carousels carry a body plus its closures in one post.",
    setupNote:
      "Needs a Business/Creator account linked to a Facebook Page, plus Meta app review for instagram_content_publish.",
    captionMaxLength: 2200,
    mediaRequired: true,
    minMediaCount: 1,
    maxMediaCount: 10,
    allowedMediaKinds: ["image", "video"],
    allowsMixedMedia: true,
    supportsLinkField: false,
    linksInCaptionAreClickable: false,
    supportsFirstComment: true,
    recommendedHashtagLimit: 10,
    hashtagHardLimit: 30,
    requiredOptions: [],
  },
  facebook: {
    id: "facebook",
    label: "Facebook Page",
    supported: true,
    icon: Facebook,
    brandColor: "#1877F2",
    valueNote:
      "Comes free with the Instagram grant, and is still where trade buyers and distributors live.",
    setupNote: "Same Meta app as Instagram — pages_manage_posts, granted in the same review.",
    captionMaxLength: 63206,
    mediaRequired: false,
    minMediaCount: 0,
    maxMediaCount: 10,
    allowedMediaKinds: ["image", "video"],
    allowsMixedMedia: false,
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
    icon: Linkedin,
    brandColor: "#0A66C2",
    valueNote:
      "The B2B channel for a packaging supplier: procurement, brand founders, contract fillers.",
    setupNote:
      "Personal posting works immediately; company-page posting needs the Community Management API product.",
    captionMaxLength: 3000,
    mediaRequired: false,
    minMediaCount: 0,
    maxMediaCount: 1,
    allowedMediaKinds: ["image"],
    allowsMixedMedia: false,
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
    icon: AtSign,
    brandColor: "#E60023",
    valueNote:
      "Every pin is a permanent link to a product page. The highest-leverage channel for a catalogue that does not change often.",
    setupNote:
      "Business account plus a Pinterest app; standard access covers pin creation without a lengthy review.",
    captionMaxLength: 800,
    titleMaxLength: 100,
    mediaRequired: true,
    minMediaCount: 1,
    maxMediaCount: 1,
    allowedMediaKinds: ["image"],
    allowsMixedMedia: false,
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
    icon: Music2,
    brandColor: "#000000",
    valueNote: "Where the perfume brands are. Video only — worth it once there is footage to post.",
    setupNote:
      "Until TikTok approves content posting, every post is forced to SELF_ONLY. Media domain must be verified on the app.",
    captionMaxLength: 2200,
    mediaRequired: true,
    minMediaCount: 1,
    maxMediaCount: 1,
    allowedMediaKinds: ["video"],
    allowsMixedMedia: false,
    supportsLinkField: false,
    linksInCaptionAreClickable: false,
    supportsFirstComment: false,
    recommendedHashtagLimit: 5,
    requiredOptions: ["privacyLevel"],
  },
  threads: {
    id: "threads",
    label: "Threads",
    supported: false,
    icon: AtSign,
    brandColor: "#000000",
    valueNote: "Cheap to add later — same Meta identity, separate API.",
    setupNote: "No driver yet.",
    captionMaxLength: 500,
    mediaRequired: false,
    minMediaCount: 0,
    maxMediaCount: 10,
    allowedMediaKinds: ["image", "video"],
    allowsMixedMedia: true,
    supportsLinkField: true,
    linksInCaptionAreClickable: true,
    supportsFirstComment: false,
    requiredOptions: [],
  },
};

/**
 * Connection order in the UI, highest value first for a packaging supplier and
 * the perfume brands it sells to.
 */
export const SOCIAL_PLATFORM_ORDER: SocialPlatformId[] = [
  "instagram",
  "linkedin",
  "pinterest",
  "facebook",
  "tiktok",
  "threads",
];

export const CONNECTABLE_SOCIAL_PLATFORMS = SOCIAL_PLATFORM_ORDER.filter(
  (id) => SOCIAL_PLATFORMS[id].supported,
);

export function getSocialPlatform(id: SocialPlatformId): SocialPlatformUiSpec {
  return SOCIAL_PLATFORMS[id];
}

export function isSocialPlatformId(value: unknown): value is SocialPlatformId {
  return typeof value === "string" && value in SOCIAL_PLATFORMS;
}

export const TIKTOK_PRIVACY_OPTIONS = [
  { value: "SELF_ONLY", label: "Private (only me)" },
  { value: "FOLLOWER_OF_CREATOR", label: "Followers" },
  { value: "MUTUAL_FOLLOW_FRIENDS", label: "Friends" },
  { value: "PUBLIC_TO_EVERYONE", label: "Public" },
];

export const LINKEDIN_VISIBILITY_OPTIONS = [
  { value: "PUBLIC", label: "Anyone" },
  { value: "CONNECTIONS", label: "Connections only" },
];
