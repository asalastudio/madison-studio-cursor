/**
 * Centralized Image Settings
 * 
 * Single source of truth for all aspect ratios, visual squads, and platform specifications.
 * Used by Darkroom ProSettings, RightPanel, and image generation functions.
 */

import { 
  Square, 
  RectangleHorizontal, 
  RectangleVertical,
  Monitor,
  Smartphone,
  Image,
  ShoppingBag,
  Layout,
  LucideIcon
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type VisualSquad = 'THE_MINIMALISTS' | 'THE_STORYTELLERS' | 'THE_DISRUPTORS';

export interface AspectRatioOption {
  value: string;
  label: string;
  description: string;
  resolution?: string;
  platform?: string;
}

export interface AspectRatioCategory {
  name: string;
  icon: LucideIcon;
  options: AspectRatioOption[];
}

export interface VisualSquadOption {
  value: VisualSquad;
  label: string;
  description: string;
  master: string;
  bestFor: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// VISUAL SQUADS
// ═══════════════════════════════════════════════════════════════════════════════

export const VISUAL_SQUADS: VisualSquadOption[] = [
  {
    value: 'THE_MINIMALISTS',
    label: 'Minimalist',
    description: 'Clean, clinical, product as hero',
    master: 'AVEDON_ISOLATION',
    bestFor: ['Product pages', 'E-commerce', 'Amazon', 'Luxury skincare']
  },
  {
    value: 'THE_STORYTELLERS',
    label: 'Storyteller',
    description: 'Lifestyle, warm, environmental',
    master: 'LEIBOVITZ_ENVIRONMENT',
    bestFor: ['Instagram', 'Brand story', 'Fragrance', 'Candles']
  },
  {
    value: 'THE_DISRUPTORS',
    label: 'Disruptor',
    description: 'Bold, scroll-stopping, high contrast',
    master: 'RICHARDSON_RAW',
    bestFor: ['Social ads', 'TikTok', 'Launches', 'Attention-grabbing']
  }
];

// ═══════════════════════════════════════════════════════════════════════════════
// ASPECT RATIO CATEGORIES
// ═══════════════════════════════════════════════════════════════════════════════

export const ASPECT_RATIO_CATEGORIES: AspectRatioCategory[] = [
  // ─────────────────────────────────────────────────────────────────────────────
  // STANDARD / COMMON
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: "Standard",
    icon: Square,
    options: [
      { value: "1:1", label: "Square", description: "Universal, Instagram" },
      { value: "4:3", label: "Classic", description: "Traditional photo" },
      { value: "3:2", label: "Standard", description: "35mm film ratio" },
      { value: "16:9", label: "Widescreen", description: "Video, Desktop" },
      { value: "3:4", label: "Portrait", description: "Mobile, Portrait" },
    ]
  },
  
  // ─────────────────────────────────────────────────────────────────────────────
  // SOCIAL MEDIA
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: "Social Media",
    icon: Smartphone,
    options: [
      { value: "4:5", label: "Instagram Feed", description: "More screen space", resolution: "1080x1350", platform: "Instagram" },
      { value: "9:16", label: "Story / Reel", description: "TikTok, Reels, Stories", resolution: "1080x1920", platform: "Instagram/TikTok" },
      { value: "1:1", label: "Facebook Post", description: "Feed post", resolution: "1200x1200", platform: "Facebook" },
      { value: "1.91:1", label: "LinkedIn Post", description: "Link preview", resolution: "1200x627", platform: "LinkedIn" },
      { value: "2:3", label: "Pinterest Pin", description: "Vertical pins", resolution: "1000x1500", platform: "Pinterest" },
      { value: "16:9", label: "Twitter/X Post", description: "Landscape image", resolution: "1200x675", platform: "Twitter" },
      { value: "16:9", label: "YouTube Thumbnail", description: "Video thumbnail", resolution: "1280x720", platform: "YouTube" },
    ]
  },
  
  // ─────────────────────────────────────────────────────────────────────────────
  // E-COMMERCE
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: "E-commerce",
    icon: ShoppingBag,
    options: [
      { value: "1:1", label: "Shopify Product", description: "Square with zoom", resolution: "2048x2048", platform: "Shopify" },
      { value: "1:1", label: "Amazon Main", description: "White background", resolution: "2000x2000", platform: "Amazon" },
      { value: "4:3", label: "Etsy Listing", description: "Product photo", resolution: "2000x1500", platform: "Etsy" },
      { value: "1:1", label: "Product Hero", description: "High-res product", resolution: "2000x2000" },
      { value: "4:5", label: "Product Lifestyle", description: "In-context shot", resolution: "1500x1875" },
    ]
  },
  
  // ─────────────────────────────────────────────────────────────────────────────
  // BANNERS & HEADERS
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: "Banners",
    icon: Layout,
    options: [
      { value: "2:1", label: "Hero Standard", description: "Website hero", resolution: "2000x1000" },
      { value: "21:9", label: "Hero Ultrawide", description: "Cinematic desktop", resolution: "2520x1080" },
      { value: "16:9", label: "Hero Video", description: "Video-friendly", resolution: "1920x1080" },
      { value: "4:1", label: "Etsy Banner", description: "Shop banner", resolution: "1200x300", platform: "Etsy" },
      { value: "7.5:1", label: "Etsy Mini Banner", description: "Compact banner", resolution: "1200x160", platform: "Etsy" },
      { value: "3:1", label: "Email Header", description: "Email banner", resolution: "600x200" },
    ]
  },
  
  // ─────────────────────────────────────────────────────────────────────────────
  // VERTICAL / TALL
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: "Vertical",
    icon: RectangleVertical,
    options: [
      { value: "9:16", label: "Full Vertical", description: "Stories, Reels", resolution: "1080x1920" },
      { value: "2:3", label: "Portrait Tall", description: "Pinterest, Print", resolution: "1000x1500" },
      { value: "1:2", label: "Tall Banner", description: "Vertical display", resolution: "500x1000" },
      { value: "4:5", label: "Social Portrait", description: "Instagram Feed", resolution: "1080x1350" },
    ]
  },
  
  // ─────────────────────────────────────────────────────────────────────────────
  // HORIZONTAL / WIDE
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: "Horizontal",
    icon: RectangleHorizontal,
    options: [
      { value: "16:9", label: "Widescreen", description: "HD Video", resolution: "1920x1080" },
      { value: "2:1", label: "Wide Banner", description: "Panoramic", resolution: "2000x1000" },
      { value: "21:9", label: "Ultrawide", description: "Cinematic", resolution: "2520x1080" },
      { value: "3:2", label: "Classic Wide", description: "35mm landscape", resolution: "1500x1000" },
    ]
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// FLAT LIST FOR SIMPLE SELECTORS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Flattened list of all unique aspect ratios (deduplicated by value)
 */
export const ALL_ASPECT_RATIOS: AspectRatioOption[] = (() => {
  const seen = new Set<string>();
  const result: AspectRatioOption[] = [];
  
  ASPECT_RATIO_CATEGORIES.forEach(category => {
    category.options.forEach(option => {
      if (!seen.has(option.value)) {
        seen.add(option.value);
        result.push(option);
      }
    });
  });
  
  return result;
})();

/**
 * Common aspect ratios for quick selection (most frequently used)
 */
// Canonical list used by EVERY aspect-ratio picker in the Dark Room. If you
// change this, the Settings panel and the Madison panel both update in lock
// step. All values here are natively supported by Gemini Nano Banana and
// Freepik — no silent snapping happens for the user's selection.
export const COMMON_ASPECT_RATIOS: AspectRatioOption[] = [
  { value: "1:1", label: "Square", description: "Products, IG posts" },
  { value: "16:9", label: "Landscape", description: "Web, YouTube" },
  { value: "9:16", label: "Story/Reel", description: "TikTok, IG Reels" },
  { value: "4:5", label: "Social", description: "IG Feed" },
  { value: "4:3", label: "Classic", description: "Etsy, Print" },
  { value: "21:9", label: "Banner", description: "Hero / wide" },
];

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get aspect ratio by value
 */
export function getAspectRatioByValue(value: string): AspectRatioOption | undefined {
  for (const category of ASPECT_RATIO_CATEGORIES) {
    const found = category.options.find(opt => opt.value === value);
    if (found) return found;
  }
  return undefined;
}

/**
 * Get visual squad by value
 */
export function getVisualSquadByValue(value: VisualSquad): VisualSquadOption | undefined {
  return VISUAL_SQUADS.find(squad => squad.value === value);
}

/**
 * Get aspect ratios for a specific platform
 */
export function getAspectRatiosForPlatform(platform: string): AspectRatioOption[] {
  const result: AspectRatioOption[] = [];
  
  ASPECT_RATIO_CATEGORIES.forEach(category => {
    category.options.forEach(option => {
      if (option.platform?.toLowerCase().includes(platform.toLowerCase())) {
        result.push(option);
      }
    });
  });
  
  return result;
}

/**
 * Parse aspect ratio string to numeric ratio
 */
export function parseAspectRatio(value: string): { width: number; height: number } {
  const [w, h] = value.split(':').map(Number);
  return { width: w || 1, height: h || 1 };
}

/**
 * Calculate dimensions from aspect ratio and max dimension
 */
export function calculateDimensions(
  aspectRatio: string, 
  maxDimension: number
): { width: number; height: number } {
  const { width, height } = parseAspectRatio(aspectRatio);
  
  if (width >= height) {
    return {
      width: maxDimension,
      height: Math.round(maxDimension * (height / width))
    };
  } else {
    return {
      width: Math.round(maxDimension * (width / height)),
      height: maxDimension
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// AI MODEL + RESOLUTION (generate-madison-image — shared by Dark Room & Image Editor)
// ═══════════════════════════════════════════════════════════════════════════════

export interface AiModelOption {
  value: string;
  label: string;
  description: string;
  badge: string | null;
  group: "auto" | "gemini" | "openai" | "freepik";
}

export const DEFAULT_IMAGE_AI_PROVIDER = "openai-image-2";
export const DEFAULT_IMAGE_AI_FALLBACK_LABEL = "Gemini 3.1 Pro";

/** Values must stay in sync with `generate-madison-image` aiProvider mapping. */
export const AI_MODEL_OPTIONS: AiModelOption[] = [
  { value: "openai-image-2", label: "GPT Image 2", description: "Default — falls back to Gemini 3.1 Pro if needed", badge: "DEFAULT", group: "openai" },
  { value: "auto", label: "Auto (GPT Image 2 -> Gemini 3.1 Pro)", description: "Legacy compatibility path", badge: null, group: "auto" },
  { value: "gemini-3.1-flash-image-preview", label: "Nano Banana 2", description: "Fast, improved aspect ratio", badge: "NEW", group: "gemini" },
  { value: "gemini-3-pro-image-preview", label: "Gemini 3.1 Pro", description: "Latest Gemini image model", badge: "BEST", group: "gemini" },
  { value: "gemini-2.5-flash-image", label: "Nano Banana", description: "Stable fallback", badge: "FREE", group: "gemini" },
  { value: "freepik-seedream-4", label: "Seedream 4", description: "4K capable", badge: "4K", group: "freepik" },
  { value: "freepik-flux-pro", label: "Flux Pro v1.1", description: "Premium", badge: "NEW", group: "freepik" },
  { value: "freepik-hyperflux", label: "Hyperflux", description: "Ultra-fast", badge: "FAST", group: "freepik" },
  { value: "freepik-flux", label: "Flux Dev", description: "Community favorite", badge: "POPULAR", group: "freepik" },
  { value: "freepik-mystic", label: "Mystic", description: "2K resolution", badge: null, group: "freepik" },
];

export interface ImageGenResolutionOption {
  value: string;
  label: string;
  description: string;
  badge?: string;
}

export const IMAGE_GEN_RESOLUTION_OPTIONS: ImageGenResolutionOption[] = [
  { value: "standard", label: "Standard", description: "1K (1024px)" },
  { value: "high", label: "High", description: "2K (2048px)" },
  { value: "4k", label: "4K Ultra", description: "4K (4096px)", badge: "Signature" },
];
