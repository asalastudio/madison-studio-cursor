/**
 * VISUAL MASTERS INTEGRATION
 *
 * Fetches and applies visual master training for AI image generation.
 * Parallel to madisonMasters.ts but for visual content.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type VisualSquad = 'THE_MINIMALISTS' | 'THE_STORYTELLERS' | 'THE_DISRUPTORS';

export interface VisualMaster {
  master_name: string;
  squad: VisualSquad;
  full_content: string;
  summary: string;
  example_images: string[];
  forbidden_styles: string[];
  prompt_template: string;
  composition_rules: string;
  lighting_rules: string;
  metadata?: Record<string, any>;
}

export interface VisualStrategy {
  visualSquad: VisualSquad;
  primaryVisualMaster: string;
  secondaryVisualMaster?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// VISUAL SQUAD DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const VISUAL_SQUAD_DEFINITIONS = `
╔══════════════════════════════════════════════════════════════════╗
║                    VISUAL SQUAD SYSTEM                           ║
╚══════════════════════════════════════════════════════════════════╝

━━━ THE MINIMALISTS ━━━
Philosophy: "Less is more. The product IS the hero."
Best for: Luxury skincare, tech products, high-price items, clinical positioning
Masters:
  • AVEDON_ISOLATION: Stark white backgrounds, clinical precision, soft directional light
Style: Clean, precise, editorial, timeless
Avoid: Cluttered backgrounds, lifestyle props, warm color grading

━━━ THE STORYTELLERS ━━━
Philosophy: "Context creates desire. Show the life, not just the product."
Best for: Fragrance, candles, lifestyle brands, emotional products, heritage brands
Masters:
  • LEIBOVITZ_ENVIRONMENT: Natural settings, warm window light, intimate atmosphere
Style: Lifestyle, editorial, magazine quality, film grain
Avoid: Clinical white backgrounds, harsh lighting, isolated products

━━━ THE DISRUPTORS ━━━
Philosophy: "Stop the scroll. Bold beats beautiful."
Best for: Social ads, TikTok, launches, attention-grabbing visuals
Masters:
  • RICHARDSON_RAW: Direct flash, high contrast, raw energy, 90s aesthetic
  • ANDERSON_SYMMETRY: Hyper-symmetry, bold colors, centered compositions
Style: Bold, graphic, high-contrast, scroll-stopping
Avoid: Subtle compositions, muted colors, traditional product photography
`;

// ═══════════════════════════════════════════════════════════════════════════════
// PLATFORM-SPECIFIC IMAGE SPECS
// ═══════════════════════════════════════════════════════════════════════════════

export interface PlatformImageSpec {
  aspectRatio: string;
  resolution: string;
  maxFileSize: string;
  notes: string;
}

export const PLATFORM_IMAGE_SPECS: Record<string, PlatformImageSpec> = {
  // Instagram
  'instagram_feed': {
    aspectRatio: '1:1 (square) or 4:5 (portrait)',
    resolution: '1080x1080 (square) or 1080x1350 (portrait)',
    maxFileSize: '30MB',
    notes: 'Portrait (4:5) gets more screen real estate. Square for consistency.'
  },
  'instagram_story': {
    aspectRatio: '9:16 (vertical)',
    resolution: '1080x1920',
    maxFileSize: '30MB',
    notes: 'Full-screen vertical. Keep key content in safe zone (center 60%).'
  },
  'instagram_reel': {
    aspectRatio: '9:16 (vertical)',
    resolution: '1080x1920',
    maxFileSize: '4GB video',
    notes: 'Same as story. Thumbnail matters for feed display.'
  },

  // Facebook
  'facebook_feed': {
    aspectRatio: '1:1 or 4:5',
    resolution: '1200x1200 (square) or 1200x1500 (portrait)',
    maxFileSize: '30MB',
    notes: '1:1 is safest. 4:5 for mobile-first.'
  },
  'facebook_ad': {
    aspectRatio: '1:1 (feed), 9:16 (stories), 16:9 (video)',
    resolution: '1080x1080 minimum',
    maxFileSize: '30MB',
    notes: 'Less than 20% text on image for best delivery.'
  },

  // LinkedIn
  'linkedin_post': {
    aspectRatio: '1.91:1 (landscape) or 1:1 (square)',
    resolution: '1200x627 (landscape) or 1200x1200 (square)',
    maxFileSize: '8MB',
    notes: 'Landscape is default link preview. Square for standalone.'
  },
  'linkedin_article': {
    aspectRatio: '1.91:1',
    resolution: '1200x627',
    maxFileSize: '8MB',
    notes: 'Header image for articles.'
  },

  // Twitter/X
  'twitter_post': {
    aspectRatio: '16:9 or 1:1',
    resolution: '1200x675 (landscape) or 1200x1200 (square)',
    maxFileSize: '5MB (GIF: 15MB)',
    notes: 'Single image: 16:9. Multi-image: square.'
  },

  // Pinterest
  'pinterest_pin': {
    aspectRatio: '2:3 (vertical)',
    resolution: '1000x1500',
    maxFileSize: '32MB',
    notes: 'Vertical performs best. Include text overlay for context.'
  },

  // TikTok
  'tiktok_cover': {
    aspectRatio: '9:16',
    resolution: '1080x1920',
    maxFileSize: '287.6MB video',
    notes: 'Cover image for video thumbnail.'
  },

  // YouTube
  'youtube_thumbnail': {
    aspectRatio: '16:9',
    resolution: '1280x720 minimum (1920x1080 recommended)',
    maxFileSize: '2MB',
    notes: 'High contrast, readable text, expressive faces perform best.'
  },

  // Website Banners / Hero Images
  'hero_banner_wide': {
    aspectRatio: '21:9 (ultrawide)',
    resolution: '2520x1080',
    maxFileSize: 'No limit for web',
    notes: 'Desktop hero banners, cinematic feel. Keep subject centered for mobile crop.'
  },
  'hero_banner_standard': {
    aspectRatio: '2:1',
    resolution: '2000x1000',
    maxFileSize: 'No limit for web',
    notes: 'Standard website hero. Works well across devices.'
  },
  'hero_banner_16x9': {
    aspectRatio: '16:9',
    resolution: '1920x1080',
    maxFileSize: 'No limit for web',
    notes: 'Video-friendly aspect ratio. YouTube covers, presentations.'
  },

  // Product Photography
  'product_hero': {
    aspectRatio: '1:1 or 4:3',
    resolution: '2000x2000 minimum',
    maxFileSize: 'No limit for web',
    notes: 'High-res for zoom. White or lifestyle background.'
  },
  'product_detail': {
    aspectRatio: '1:1',
    resolution: '1000x1000 minimum',
    maxFileSize: 'No limit for web',
    notes: 'Close-up details, texture shots.'
  },
  'product_lifestyle': {
    aspectRatio: '4:5 or 3:4',
    resolution: '1500x1875 (4:5) or 1500x2000 (3:4)',
    maxFileSize: 'No limit for web',
    notes: 'Product in context/use. Environmental setting.'
  },

  // E-commerce
  'shopify_product': {
    aspectRatio: '1:1 (recommended)',
    resolution: '2048x2048 (zoom enabled)',
    maxFileSize: '20MB',
    notes: 'Square for consistency. Minimum 800x800 for zoom.'
  },
  'etsy_listing': {
    aspectRatio: '4:3',
    resolution: '2000x1500 minimum',
    maxFileSize: '20MB',
    notes: 'First image is most important. Variety of angles.'
  },
  'etsy_banner': {
    aspectRatio: '1200:300 (4:1)',
    resolution: '1200x300 (minimum) or 3360x840 (large)',
    maxFileSize: '20MB',
    notes: 'Shop banner. Keep text/logo in center 760x100 safe zone for mobile.'
  },
  'etsy_mini_banner': {
    aspectRatio: '1200:160 (7.5:1)',
    resolution: '1200x160',
    maxFileSize: '20MB',
    notes: 'Smaller banner option. Very horizontal — use simple patterns or centered logo.'
  },
  'amazon_main': {
    aspectRatio: '1:1',
    resolution: '2000x2000 minimum',
    maxFileSize: '10MB',
    notes: 'Pure white background required. Product fills 85% of frame.'
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// CONTENT TYPE TO VISUAL SQUAD MAPPING
// ═══════════════════════════════════════════════════════════════════════════════

export const VISUAL_CONTENT_TO_SQUAD: Record<string, VisualSquad> = {
  // Product Photography
  'product_hero': 'THE_MINIMALISTS',
  'product_photography': 'THE_MINIMALISTS',
  'product_detail': 'THE_MINIMALISTS',
  'product_lifestyle': 'THE_STORYTELLERS',

  // Social Media
  'instagram_feed': 'THE_STORYTELLERS',
  'instagram_story': 'THE_DISRUPTORS',
  'instagram_reel': 'THE_DISRUPTORS',
  'facebook_feed': 'THE_STORYTELLERS',
  'facebook_ad': 'THE_DISRUPTORS',
  'linkedin_post': 'THE_MINIMALISTS',
  'linkedin_article': 'THE_MINIMALISTS',
  'twitter_post': 'THE_DISRUPTORS',
  'pinterest_pin': 'THE_STORYTELLERS',
  'tiktok_cover': 'THE_DISRUPTORS',
  'youtube_thumbnail': 'THE_DISRUPTORS',

  // E-commerce
  'shopify_product': 'THE_MINIMALISTS',
  'etsy_listing': 'THE_STORYTELLERS',
  'amazon_main': 'THE_MINIMALISTS',

  // Campaign/Creative
  'campaign_hero': 'THE_STORYTELLERS',
  'ad_creative': 'THE_DISRUPTORS',
  'email_hero': 'THE_STORYTELLERS',
  'landing_page_hero': 'THE_DISRUPTORS',

  // Default
  'default': 'THE_STORYTELLERS'
};

// ═══════════════════════════════════════════════════════════════════════════════
// HARDCODED VISUAL STYLE DIRECTIVES (No Database Required)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get strong, explicit visual style directives for each squad
 * These are injected directly into the prompt to ensure style differentiation
 */
export function getVisualStyleDirective(squad: VisualSquad): string {
  switch (squad) {
    case 'THE_MINIMALISTS':
      return `
╔══════════════════════════════════════════════════════════════════╗
║               VISUAL STYLE: THE MINIMALISTS                       ║
║               "Less is more. Product as hero."                    ║
╚══════════════════════════════════════════════════════════════════╝

MANDATORY STYLE REQUIREMENTS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BACKGROUND: Pure white (#FFFFFF) or neutral gray gradient. NO environmental props.
LIGHTING: Soft, diffused studio lighting. Even illumination. No harsh shadows.
COMPOSITION: Product centered, breathing room, negative space emphasized.
MOOD: Clinical, precise, editorial, timeless, sophisticated.
COLOR GRADING: Cool tones, desaturated, clean whites.

✅ DO:
- Place product on pure white or light gray seamless background
- Use soft directional light from above-left (Avedon style)
- Keep composition minimal - product only, no props
- Emphasize product details and craftsmanship
- Sharp focus, high clarity

❌ DO NOT:
- Add lifestyle props (books, plants, fabric, wood surfaces)
- Use warm color grading
- Include environmental context
- Add texture to background
- Use dramatic shadows

REFERENCE: Think Apple product photography, luxury skincare campaigns, Richard Avedon portraits.
`;

    case 'THE_STORYTELLERS':
      return `
╔══════════════════════════════════════════════════════════════════╗
║               VISUAL STYLE: THE STORYTELLERS                      ║
║               "Context creates desire."                           ║
╚══════════════════════════════════════════════════════════════════╝

MANDATORY STYLE REQUIREMENTS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BACKGROUND: Natural environment, lifestyle setting, lived-in spaces.
LIGHTING: Warm window light, golden hour, soft natural illumination.
COMPOSITION: Product in context, environmental storytelling, magazine editorial.
MOOD: Warm, inviting, aspirational, intimate, nostalgic.
COLOR GRADING: Warm tones, golden highlights, rich shadows, film-like.

✅ DO:
- Place product in a natural, lived-in environment
- Use warm, directional window light (Leibovitz style)
- Include lifestyle props (wood surfaces, fabric, books, botanicals)
- Create atmosphere and mood
- Add subtle film grain for editorial feel
- Show product being used or in context

❌ DO NOT:
- Use pure white backgrounds
- Use harsh studio lighting
- Isolate product completely
- Use cool/clinical color grading
- Make it look like e-commerce

REFERENCE: Think Vanity Fair editorials, Annie Leibovitz environmental portraits, luxury fragrance campaigns.
`;

    case 'THE_DISRUPTORS':
      return `
╔══════════════════════════════════════════════════════════════════╗
║               VISUAL STYLE: THE DISRUPTORS                        ║
║               "Stop the scroll. Bold beats beautiful."            ║
╚══════════════════════════════════════════════════════════════════╝

MANDATORY STYLE REQUIREMENTS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BACKGROUND: Bold solid color, dramatic gradient, or high-contrast scene.
LIGHTING: Direct flash, hard light, dramatic shadows, high contrast.
COMPOSITION: Dynamic angles, bold framing, unexpected crops, graphic impact.
MOOD: Energetic, bold, provocative, attention-grabbing, raw.
COLOR GRADING: High contrast, saturated colors, punchy, bold.

✅ DO:
- Use bold, solid color backgrounds (black, deep blue, vibrant colors)
- Add dramatic lighting with hard shadows
- Create high contrast imagery
- Use unexpected angles (low angle, Dutch angle)
- Make it scroll-stopping and attention-grabbing
- Add motion blur or action elements if appropriate

❌ DO NOT:
- Use soft, diffused lighting
- Create muted, subtle compositions
- Use beige/neutral backgrounds
- Make it look traditional or safe
- Use warm, cozy aesthetics

REFERENCE: Think Terry Richardson flash photography, Wes Anderson symmetry, Nike ads, TikTok viral content.
`;

    default:
      return '';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// VISUAL MASTER ROUTING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Routes to appropriate visual squad based on content type and brief
 */
export function routeToVisualSquad(
  imageType: string,
  brief: string,
  brandTone?: string
): VisualStrategy {
  const briefLower = brief.toLowerCase();

  // Check for explicit style mentions in brief
  if (briefLower.includes('minimal') || briefLower.includes('white background') || briefLower.includes('clinical') || briefLower.includes('clean')) {
    return {
      visualSquad: 'THE_MINIMALISTS',
      primaryVisualMaster: 'AVEDON_ISOLATION'
    };
  }

  if (briefLower.includes('lifestyle') || briefLower.includes('natural') || briefLower.includes('warm') || briefLower.includes('cozy')) {
    return {
      visualSquad: 'THE_STORYTELLERS',
      primaryVisualMaster: 'LEIBOVITZ_ENVIRONMENT'
    };
  }

  // Whole-word / phrase checks only. A naive `includes("ad")` matched "shadow", "gradient", etc.
  const disruptorCue =
    /\bbold\b/.test(briefLower) ||
    /\bscroll(?:-stopping)?\b/.test(briefLower) ||
    /\battention\b/.test(briefLower) ||
    /\b(?:ad|ads)\b/.test(briefLower) ||
    /\badvertisement\b/.test(briefLower) ||
    /\bsocial\s+ad\b/.test(briefLower) ||
    /\btiktok\b/.test(briefLower);
  if (disruptorCue) {
    const isSymmetric = briefLower.includes('symmetr') || briefLower.includes('flat lay') || briefLower.includes('overhead');
    return {
      visualSquad: 'THE_DISRUPTORS',
      primaryVisualMaster: isSymmetric ? 'ANDERSON_SYMMETRY' : 'RICHARDSON_RAW'
    };
  }

  // Fall back to content type mapping
  const mappedSquad = VISUAL_CONTENT_TO_SQUAD[imageType] || VISUAL_CONTENT_TO_SQUAD['default'];

  // Determine primary master based on squad
  let primaryMaster: string;
  switch (mappedSquad) {
    case 'THE_MINIMALISTS':
      primaryMaster = 'AVEDON_ISOLATION';
      break;
    case 'THE_STORYTELLERS':
      primaryMaster = 'LEIBOVITZ_ENVIRONMENT';
      break;
    case 'THE_DISRUPTORS':
      // Choose based on content type
      primaryMaster = imageType.includes('flat') || imageType.includes('overhead')
        ? 'ANDERSON_SYMMETRY'
        : 'RICHARDSON_RAW';
      break;
    default:
      primaryMaster = 'LEIBOVITZ_ENVIRONMENT';
  }

  return {
    visualSquad: mappedSquad,
    primaryVisualMaster: primaryMaster
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DATABASE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch a specific visual master from the database
 */
export async function fetchVisualMaster(
  supabase: SupabaseClient,
  masterName: string
): Promise<VisualMaster | null> {
  const { data, error } = await supabase
    .from('visual_masters')
    .select('*')
    .eq('master_name', masterName)
    .maybeSingle();

  if (error) {
    console.error(`[Visual Masters] Error fetching ${masterName}:`, error);
    return null;
  }

  return data;
}

/**
 * Fetch all visual masters for a squad
 */
export async function fetchVisualMastersBySquad(
  supabase: SupabaseClient,
  squad: VisualSquad
): Promise<VisualMaster[]> {
  const { data, error } = await supabase
    .from('visual_masters')
    .select('*')
    .eq('squad', squad);

  if (error) {
    console.error(`[Visual Masters] Error fetching squad ${squad}:`, error);
    return [];
  }

  return data || [];
}

/**
 * Build visual master context for image generation prompts
 */
export function buildVisualMasterContext(master: VisualMaster): string {
  const parts: string[] = [];

  parts.push(`━━━ VISUAL MASTER: ${master.master_name} ━━━`);
  parts.push(`Squad: ${master.squad}`);
  parts.push('');

  if (master.summary) {
    parts.push(`Summary: ${master.summary}`);
    parts.push('');
  }

  if (master.composition_rules) {
    parts.push('COMPOSITION RULES:');
    parts.push(master.composition_rules);
    parts.push('');
  }

  if (master.lighting_rules) {
    parts.push('LIGHTING RULES:');
    parts.push(master.lighting_rules);
    parts.push('');
  }

  if (master.forbidden_styles && master.forbidden_styles.length > 0) {
    parts.push('FORBIDDEN STYLES (avoid these):');
    master.forbidden_styles.forEach(style => {
      parts.push(`  ✗ ${style}`);
    });
    parts.push('');
  }

  if (master.prompt_template) {
    parts.push('PROMPT TEMPLATE:');
    parts.push(master.prompt_template);
    parts.push('');
  }

  return parts.join('\n');
}

/**
 * Get complete visual master context for image generation
 */
export async function getVisualMasterContext(
  supabase: SupabaseClient,
  imageType: string,
  brief: string,
  brandTone?: string
): Promise<{ strategy: VisualStrategy; masterContext: string; platformSpec?: PlatformImageSpec }> {
  // Route to squad
  const strategy = routeToVisualSquad(imageType, brief, brandTone);

  console.log(`[Visual Masters] Routed to: ${strategy.visualSquad}, Primary: ${strategy.primaryVisualMaster}`);

  // Fetch the master
  const master = await fetchVisualMaster(supabase, strategy.primaryVisualMaster);

  let masterContext = '';

  if (master) {
    masterContext = buildVisualMasterContext(master);
  } else {
    // Fallback to squad definitions
    masterContext = VISUAL_SQUAD_DEFINITIONS;
    console.log(`[Visual Masters] Master ${strategy.primaryVisualMaster} not found, using squad definitions`);
  }

  // Get platform spec if applicable
  const platformSpec = PLATFORM_IMAGE_SPECS[imageType];

  return {
    strategy,
    masterContext,
    platformSpec
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROMPT ENHANCEMENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Enhance a user's image prompt with visual master training
 */
export async function enhanceImagePrompt(
  supabase: SupabaseClient,
  userPrompt: string,
  imageType: string,
  brandColors?: string[],
  productName?: string
): Promise<string> {
  const { strategy, masterContext, platformSpec } = await getVisualMasterContext(
    supabase,
    imageType,
    userPrompt
  );

  const master = await fetchVisualMaster(supabase, strategy.primaryVisualMaster);

  if (!master?.prompt_template) {
    // Return user prompt with basic enhancements
    return userPrompt;
  }

  // Replace placeholders in template
  let enhancedPrompt = master.prompt_template
    .replace(/\[Product name\]/gi, productName || '[Product]')
    .replace(/\[Product\]/gi, productName || '[Product]');

  // Add brand colors if provided
  if (brandColors && brandColors.length > 0) {
    enhancedPrompt = enhancedPrompt.replace(
      /\[bold color\]/gi,
      brandColors[0]
    );
  }

  // Add aspect ratio if platform spec exists
  if (platformSpec) {
    const arMatch = platformSpec.aspectRatio.match(/(\d+:\d+)/);
    if (arMatch) {
      // Replace or append aspect ratio
      if (enhancedPrompt.includes('--ar')) {
        enhancedPrompt = enhancedPrompt.replace(/--ar \d+:\d+/g, `--ar ${arMatch[1]}`);
      } else {
        enhancedPrompt += ` --ar ${arMatch[1]}`;
      }
    }
  }

  // Blend user prompt with template
  // The template provides structure, user prompt provides specifics
  const finalPrompt = enhancedPrompt.replace('[Product]', userPrompt);

  return finalPrompt;
}

// ═══════════════════════════════════════════════════════════════════════════════
// IMAGE GENERATION SPECS FOR DELIVERABLE FORMATS
// ═══════════════════════════════════════════════════════════════════════════════

export const IMAGE_DELIVERABLE_SPECS = {
  'visual-asset': {
    platformNotes: `
AI IMAGE GENERATION FORMAT:

BEFORE GENERATING, DETERMINE:
1. Platform/use case (product page, Instagram, ad, etc.)
2. Visual squad (Minimalists, Storytellers, or Disruptors)
3. Aspect ratio requirements
4. Brand visual guidelines

PROMPT STRUCTURE:
[Subject] + [Style/Master reference] + [Composition] + [Lighting] + [Color notes] + [Technical params]

VISUAL SQUADS:

THE MINIMALISTS (AVEDON_ISOLATION):
- Pure white or neutral backgrounds
- Clinical, precise lighting
- Product as hero, no distractions
- Best for: Product pages, luxury items, e-commerce
- Example: "[Product] centered on pure white background, soft directional light from top-left, hyperrealistic, 8k --ar 1:1 --style raw"

THE STORYTELLERS (LEIBOVITZ_ENVIRONMENT):
- Natural settings, environmental context
- Warm window light, golden hour
- Lifestyle integration
- Best for: Instagram, brand story, fragrance/candles
- Example: "[Product] in natural setting, soft window light, warm color grading, lifestyle photography, magazine quality --ar 4:5"

THE DISRUPTORS (RICHARDSON_RAW / ANDERSON_SYMMETRY):
Richardson: Direct flash, high contrast, raw energy
Anderson: Hyper-symmetry, bold colors, centered
- Best for: Social ads, TikTok, scroll-stopping content
- Example Richardson: "[Product] direct flash photography, high contrast, raw aesthetic --ar 9:16"
- Example Anderson: "[Product] overhead flat lay, perfect symmetry, bold [color] background --ar 1:1"

FORBIDDEN:
- "Beautiful" or "amazing" — be specific
- Mixing incompatible styles
- Wrong aspect ratio for platform
    `,
    structure: [
      'Subject (what is being photographed)',
      'Style reference (visual master)',
      'Composition (centered, rule of thirds, overhead)',
      'Lighting (natural, studio, flash)',
      'Color/mood notes',
      'Technical parameters (--ar, --style, etc.)'
    ]
  },

  'image_prompt': {
    platformNotes: `
IMAGE PROMPT (RECIPE) FORMAT:

Create a reusable image prompt template that can be adapted for different products.

PROVIDE:
1. PROMPT TEMPLATE: The full prompt with [PRODUCT] placeholder
2. STYLE NOTES: What visual master this follows
3. BEST FOR: Use cases this works for
4. VARIATIONS: 2-3 alternative versions
5. NEGATIVE PROMPT: What to avoid/exclude

EXAMPLE OUTPUT:
---
TEMPLATE: [PRODUCT] on weathered marble surface, soft diffused natural light from window, editorial product photography, muted earth tones, film grain texture, 85mm lens aesthetic --ar 4:5 --style raw --no harsh shadows --no pure white

STYLE: Leibovitz Environment (Storytellers)
BEST FOR: Instagram feed, product story, fragrance/skincare
VARIATIONS:
1. Swap marble for aged wood for warmth
2. Add botanical elements for organic brands
3. Change to 1:1 for e-commerce use

NEGATIVE PROMPT: clinical, white background, flash, sterile, generic stock photo
---
    `
  },

  'campaign_concept_visual': {
    platformNotes: `
CAMPAIGN VISUAL DIRECTION FORMAT:

Define the visual language for an entire campaign.

INCLUDE:
1. HERO SHOT CONCEPT: The main campaign image
2. VISUAL SQUAD: Which squad and master to follow
3. COLOR DIRECTION: Palette, grading, mood
4. LIGHTING STYLE: Natural, studio, flash, mixed
5. COMPOSITION RULES: Symmetry, negative space, cropping
6. PROPS & STYLING: What appears in frame
7. PLATFORM BREAKDOWNS: How this adapts to each channel

PROVIDE PROMPTS FOR:
- Hero image (campaign anchor)
- Instagram feed version
- Story/Reel version
- Ad version (if applicable)
- Product detail shot

MOOD BOARD REFERENCES: Name 2-3 visual references (brands, photographers, campaigns)
    `
  },

  'ad_creative_prompt': {
    platformNotes: `
AD CREATIVE VISUAL FORMAT:

Scroll-stopping visuals for paid advertising.

REQUIREMENTS:
- Hook in first 0.5 seconds (visual equivalent)
- High contrast for small screens
- Clear focal point
- Works with and without text overlay
- Compliant with platform guidelines (no excessive text)

SQUAD: Usually THE_DISRUPTORS
- Richardson: Flash, raw, authentic
- Anderson: Bold colors, symmetry, graphic

PROVIDE:
1. STATIC AD PROMPT: High-impact still image
2. VIDEO AD SHOT LIST: 3-5 scenes for video ad
3. CAROUSEL SLIDES: Visual for each carousel slide
4. TEXT OVERLAY SAFE ZONES: Where copy can go

ASPECT RATIOS NEEDED:
- 1:1 (Feed)
- 4:5 (Feed mobile)
- 9:16 (Stories/Reels)
- 16:9 (YouTube pre-roll)
    `
  }
};

/**
 * Get image-specific format instructions
 */
export function getImageFormatInstructions(contentType: string): string {
  const spec = IMAGE_DELIVERABLE_SPECS[contentType as keyof typeof IMAGE_DELIVERABLE_SPECS];

  if (!spec) {
    return '';
  }

  const parts: string[] = [];

  parts.push('═══ VISUAL FORMAT REQUIREMENTS ═══');

  if (spec.platformNotes) {
    parts.push(spec.platformNotes.trim());
  }

  if (spec.structure && spec.structure.length > 0) {
    parts.push('\nREQUIRED ELEMENTS:');
    spec.structure.forEach((item, i) => {
      parts.push(`${i + 1}. ${item}`);
    });
  }

  return parts.join('\n');
}
























