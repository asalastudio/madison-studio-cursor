/**
 * Content-to-Visual Prompts Generator
 * 
 * Analyzes master content (blogs, articles, etc.) and generates
 * visual prompts that capture the same thematic DNA:
 * - Image Pack: Hero, Social, Email image prompts
 * - Video Script: Hero, Reel, Story video prompts
 * - Product Backgrounds: Scene prompts for product photography
 * 
 * Uses the generate-with-claude edge function for AI generation.
 * 
 * @module contentToVisualPrompts
 */

import { supabase } from '@/integrations/supabase/client';

// ═══════════════════════════════════════════════════════════════════════════════
// VISUAL MASTERS - Photographer Styles for Variety
// ═══════════════════════════════════════════════════════════════════════════════

const VISUAL_MASTERS = [
  { id: 'AVEDON_ISOLATION', name: 'Richard Avedon', style: 'Stark white backgrounds, isolated subjects, pure minimalism, clinical elegance' },
  { id: 'PENN_STILL_LIFE', name: 'Irving Penn', style: 'Sculptural compositions, textural detail, museum-quality luxury, timeless refinement' },
  { id: 'TESTINO_LUXURY', name: 'Mario Testino', style: 'Golden hour warmth, aspirational glamour, sun-kissed tones, effortless chic' },
  { id: 'NEWTON_GLAMOUR', name: 'Helmut Newton', style: 'High contrast drama, powerful poses, sophisticated edge, striking compositions' },
  { id: 'MEISEL_EDITORIAL', name: 'Steven Meisel', style: 'Avant-garde concepts, transformative beauty, high fashion polish, trendsetting' },
  { id: 'LEIBOVITZ_ENVIRONMENT', name: 'Annie Leibovitz', style: 'Environmental narratives, theatrical staging, cinematic storytelling, rich detail' },
  { id: 'ANDERSON_SYMMETRY', name: 'Wes Anderson', style: 'Perfect symmetry, pastel palettes, whimsical precision, nostalgic charm' },
  { id: 'WEBER_INTIMATE', name: 'Bruce Weber', style: 'Natural intimacy, candid moments, warm authenticity, lifestyle ease' },
];

// Rotate through masters to ensure variety
let lastMasterIndex = -1;
function getRandomVisualMaster() {
  // Pick a different master than last time
  let newIndex;
  do {
    newIndex = Math.floor(Math.random() * VISUAL_MASTERS.length);
  } while (newIndex === lastMasterIndex && VISUAL_MASTERS.length > 1);
  
  lastMasterIndex = newIndex;
  return VISUAL_MASTERS[newIndex];
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ContentAnalysis {
  themes: string[];           // "luxury", "intimacy", "transformation"
  mood: string;               // "contemplative", "energetic", "serene"
  visualElements: string[];   // "golden light", "marble surfaces"
  colorPalette: string[];     // extracted or inferred colors
  actions: string[];          // movement/transformation cues for video
  surfaces: string[];         // materials/textures for backgrounds
  atmosphere: string;         // overall feeling
  suggestedVisualMaster: string;
}

export interface ImagePrompt {
  prompt: string;
  aspectRatio: string;
  purpose: string;
  negativePrompt?: string;
}

export interface VideoPrompt {
  prompt: string;
  duration: string;
  purpose: string;
  cameraMovement?: string;
}

export interface BackgroundPrompt {
  prompt: string;
  aspectRatio: string;
  purpose: string;
  surface: string;
  lighting: string;
}

export interface ImagePackOutput {
  hero: ImagePrompt;
  social: ImagePrompt;
  emailHeader: ImagePrompt;
}

export interface VideoScriptOutput {
  hero: VideoPrompt;
  reel: VideoPrompt;
  story: VideoPrompt;
}

export interface ProductBackgroundOutput {
  productHero: BackgroundPrompt;
  lifestyle: BackgroundPrompt;
  detail: BackgroundPrompt;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER: Call generate-with-claude edge function
// ═══════════════════════════════════════════════════════════════════════════════

async function callClaudeAPI(prompt: string, organizationId?: string): Promise<string> {
  console.log('[VisualPrompts] Calling edge function with organizationId:', organizationId || 'none');
  console.log('[VisualPrompts] Prompt length:', prompt.length);
  
  const { data, error } = await supabase.functions.invoke('generate-with-claude', {
    body: {
      prompt,
      organizationId,
      mode: 'generate',
      styleOverlay: 'brand-voice',
      artifact: 'visual-prompt',
    },
  });

  if (error) {
    console.error('[VisualPrompts] Edge function error:', {
      error,
      message: error.message,
      name: error.name,
      context: error.context,
    });
    // Try to get more details from the error
    const errorDetail = error.message || error.context?.body || 'Failed to generate content';
    throw new Error(errorDetail);
  }

  if (!data?.generatedContent) {
    console.error('[VisualPrompts] No content in response:', data);
    // If there's an error in the data, show it
    if (data?.error) {
      throw new Error(data.error);
    }
    throw new Error('No content received from AI');
  }

  return data.generatedContent;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTENT ANALYZER
// ═══════════════════════════════════════════════════════════════════════════════

export async function analyzeContent(content: string, title?: string, organizationId?: string): Promise<ContentAnalysis> {
  const prompt = `You are Madison's Visual Intelligence module. Analyze this content and extract its visual DNA - the themes, mood, colors, textures, and atmosphere that would translate into compelling imagery.

<CONTENT>
${title ? `Title: ${title}\n\n` : ''}${content}
</CONTENT>

Extract and return a JSON object with:
{
  "themes": ["array of 3-5 key themes"],
  "mood": "single word or short phrase describing the emotional tone",
  "visualElements": ["5-8 specific visual elements mentioned or implied"],
  "colorPalette": ["4-6 colors that match this content's feeling"],
  "actions": ["3-5 movements or transformations for video"],
  "surfaces": ["3-5 materials/textures for product backgrounds"],
  "atmosphere": "2-3 sentence description of the overall atmosphere",
  "suggestedVisualMaster": "Choose ONE based on content mood"
}

VISUAL MASTER OPTIONS (choose the BEST match for this specific content):

1. AVEDON_ISOLATION - Richard Avedon style
   Best for: Minimalist, clean, product-focused, stark white backgrounds
   Mood: Pure, clinical, focused, elegant simplicity
   
2. LEIBOVITZ_ENVIRONMENT - Annie Leibovitz style  
   Best for: Narrative scenes, environmental context, storytelling
   Mood: Theatrical, dramatic, cinematic, rich detail
   
3. RICHARDSON_RAW - Terry Richardson style
   Best for: Edgy, authentic, bold, flash photography
   Mood: Raw, unfiltered, energetic, provocative
   
4. ANDERSON_SYMMETRY - Wes Anderson style
   Best for: Whimsical, vintage, pastel palettes, precise compositions
   Mood: Quirky, nostalgic, playful, meticulously styled

5. PENN_STILL_LIFE - Irving Penn style
   Best for: Luxury products, textural detail, sculptural compositions
   Mood: Timeless, refined, artistic, museum-quality

6. NEWTON_GLAMOUR - Helmut Newton style
   Best for: Fashion-forward, bold, high contrast, dramatic lighting
   Mood: Provocative, powerful, sophisticated, striking

7. MEISEL_EDITORIAL - Steven Meisel style
   Best for: High fashion, conceptual, transformative beauty
   Mood: Avant-garde, polished, influential, trendsetting

8. TESTINO_LUXURY - Mario Testino style
   Best for: Aspirational luxury, golden hour, warm tones
   Mood: Glamorous, sun-kissed, effortlessly chic

Choose the style that BEST matches the content's themes and mood. Avoid defaulting to the same style repeatedly.

Return ONLY the JSON object, no other text.`;

  const responseText = await callClaudeAPI(prompt, organizationId);
  
  try {
    // Extract JSON from response (handle potential markdown wrapping)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as ContentAnalysis;
    }
    throw new Error('No JSON found in response');
  } catch (error) {
    console.error('[ContentAnalyzer] Failed to parse analysis:', error);
    // Return default analysis with random visual master for variety
    const visualMasters = [
      'AVEDON_ISOLATION',
      'LEIBOVITZ_ENVIRONMENT', 
      'PENN_STILL_LIFE',
      'TESTINO_LUXURY',
      'ANDERSON_SYMMETRY',
      'NEWTON_GLAMOUR',
    ];
    const randomMaster = visualMasters[Math.floor(Math.random() * visualMasters.length)];
    
    return {
      themes: ['elegance', 'quality', 'craftsmanship'],
      mood: 'sophisticated',
      visualElements: ['soft lighting', 'clean lines', 'premium materials'],
      colorPalette: ['#1A1816', '#B8956A', '#F5F1E8', '#2F2A26'],
      actions: ['slow reveal', 'gentle movement', 'light play'],
      surfaces: ['marble', 'wood', 'linen'],
      atmosphere: 'A refined, contemplative atmosphere with attention to detail and quiet luxury.',
      suggestedVisualMaster: randomMaster,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// IMAGE PACK GENERATOR
// ═══════════════════════════════════════════════════════════════════════════════

export async function generateImagePack(
  content: string,
  analysis: ContentAnalysis,
  brandColors?: string[],
  organizationId?: string
): Promise<ImagePackOutput> {
  const colorContext = brandColors?.length 
    ? `Brand colors to incorporate: ${brandColors.join(', ')}`
    : `Suggested palette: ${analysis.colorPalette.join(', ')}`;

  // FORCE variety by randomly selecting a visual master
  const selectedMaster = getRandomVisualMaster();
  console.log('[ImagePack] Using visual master:', selectedMaster.name);

  const prompt = `You are Madison's Image Prompt specialist. Create prompts for AI image generation that capture the soul of written content.

Based on this content analysis, generate 3 image prompts:

<ANALYSIS>
Themes: ${analysis.themes.join(', ')}
Mood: ${analysis.mood}
Visual Elements: ${analysis.visualElements.join(', ')}
${colorContext}
Atmosphere: ${analysis.atmosphere}
</ANALYSIS>

MANDATORY VISUAL STYLE - You MUST use this photographer's aesthetic:
Photographer: ${selectedMaster.name}
Style: ${selectedMaster.style}

Apply ${selectedMaster.name}'s distinctive visual language to ALL prompts below.

Generate prompts for:
1. HERO (16:9) - Editorial quality for website/blog headers
2. SOCIAL (1:1) - Bold, scroll-stopping for Instagram
3. EMAIL (3:1) - Clean, minimal for email headers

Return JSON:
{
  "hero": {
    "prompt": "detailed prompt for hero image",
    "aspectRatio": "16:9",
    "purpose": "Blog/website header",
    "negativePrompt": "things to avoid"
  },
  "social": {
    "prompt": "detailed prompt for social image",
    "aspectRatio": "1:1",
    "purpose": "Instagram/social media",
    "negativePrompt": "things to avoid"
  },
  "emailHeader": {
    "prompt": "detailed prompt for email header",
    "aspectRatio": "3:1",
    "purpose": "Email newsletter header",
    "negativePrompt": "things to avoid"
  }
}

Return ONLY the JSON object.`;

  const responseText = await callClaudeAPI(prompt, organizationId);
  
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as ImagePackOutput;
    }
    throw new Error('No JSON found in response');
  } catch (error) {
    console.error('[ImagePack] Failed to parse prompts:', error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// VIDEO SCRIPT GENERATOR
// ═══════════════════════════════════════════════════════════════════════════════

export async function generateVideoScript(
  content: string,
  analysis: ContentAnalysis,
  organizationId?: string
): Promise<VideoScriptOutput> {
  // FORCE variety by randomly selecting a visual master for video aesthetic
  const selectedMaster = getRandomVisualMaster();
  console.log('[VideoScript] Using visual master:', selectedMaster.name);

  const prompt = `You are Madison's Video Prompt specialist. Create prompts for AI video generation that bring written content to life.

Based on this content analysis, generate 3 video prompts:

<ANALYSIS>
Themes: ${analysis.themes.join(', ')}
Mood: ${analysis.mood}
Visual Elements: ${analysis.visualElements.join(', ')}
Actions/Movements: ${analysis.actions.join(', ')}
Atmosphere: ${analysis.atmosphere}
</ANALYSIS>

MANDATORY VISUAL STYLE - Apply this cinematographer/photographer aesthetic:
Reference: ${selectedMaster.name}
Style: ${selectedMaster.style}

Generate prompts for:
1. HERO (10-15s) - Cinematic for website/landing page
2. REEL (5-8s) - Vertical-friendly for Instagram/TikTok
3. STORY (3-5s) - Quick attention grab

Return JSON:
{
  "hero": {
    "prompt": "detailed video prompt with subject, action, setting, camera, lighting",
    "duration": "10-15s",
    "purpose": "Website/landing page hero",
    "cameraMovement": "slow dolly in / static / pan / etc"
  },
  "reel": {
    "prompt": "detailed video prompt optimized for vertical",
    "duration": "5-8s",
    "purpose": "Instagram Reels/TikTok",
    "cameraMovement": "camera movement description"
  },
  "story": {
    "prompt": "short punchy video prompt",
    "duration": "3-5s",
    "purpose": "Stories/quick attention",
    "cameraMovement": "camera movement description"
  }
}

Return ONLY the JSON object.`;

  const responseText = await callClaudeAPI(prompt, organizationId);
  
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as VideoScriptOutput;
    }
    throw new Error('No JSON found in response');
  } catch (error) {
    console.error('[VideoScript] Failed to parse prompts:', error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRODUCT BACKGROUND GENERATOR
// ═══════════════════════════════════════════════════════════════════════════════

export async function generateProductBackgrounds(
  content: string,
  analysis: ContentAnalysis,
  productType?: string,
  organizationId?: string
): Promise<ProductBackgroundOutput> {
  const productContext = productType 
    ? `Product type (for context only, DO NOT include in background): ${productType}`
    : 'General luxury product';

  // FORCE variety by randomly selecting a visual master
  const selectedMaster = getRandomVisualMaster();
  console.log('[ProductBG] Using visual master:', selectedMaster.name);

  const prompt = `You are Madison's Product Background specialist. Create scene/background prompts for product photography that capture the mood of written content WITHOUT including the product itself.

Based on this content analysis, generate 3 product background prompts:

<ANALYSIS>
Themes: ${analysis.themes.join(', ')}
Mood: ${analysis.mood}
Visual Elements: ${analysis.visualElements.join(', ')}
Surfaces/Materials: ${analysis.surfaces.join(', ')}
Colors: ${analysis.colorPalette.join(', ')}
Atmosphere: ${analysis.atmosphere}
${productContext}
</ANALYSIS>

MANDATORY VISUAL STYLE - Apply this photographer's background aesthetic:
Reference: ${selectedMaster.name}
Style: ${selectedMaster.style}

Generate BACKGROUND-ONLY prompts for:
1. PRODUCT HERO (1:1) - Clean, centered space for main product shot
2. LIFESTYLE (16:9) - Wider environmental context
3. DETAIL (4:5) - Textured close-up for Pinterest/editorial

Return JSON:
{
  "productHero": {
    "prompt": "detailed background prompt with surface, lighting, atmosphere --no product",
    "aspectRatio": "1:1",
    "purpose": "E-commerce main image background",
    "surface": "primary surface material",
    "lighting": "lighting description"
  },
  "lifestyle": {
    "prompt": "wider environmental background prompt --no product",
    "aspectRatio": "16:9",
    "purpose": "Website banner background",
    "surface": "primary surface material",
    "lighting": "lighting description"
  },
  "detail": {
    "prompt": "textured detail background prompt --no product",
    "aspectRatio": "4:5",
    "purpose": "Pinterest/editorial background",
    "surface": "primary surface material",
    "lighting": "lighting description"
  }
}

IMPORTANT: All prompts must end with "--no product --no bottle --no package --no item"

Return ONLY the JSON object.`;

  const responseText = await callClaudeAPI(prompt, organizationId);
  
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as ProductBackgroundOutput;
    }
    throw new Error('No JSON found in response');
  } catch (error) {
    console.error('[ProductBackground] Failed to parse prompts:', error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a complete Image Pack from master content
 */
export async function generateImagePackFromContent(
  content: string,
  title?: string,
  brandColors?: string[],
  organizationId?: string
): Promise<{ analysis: ContentAnalysis; images: ImagePackOutput }> {
  console.log('[VisualPrompts] Generating Image Pack...', { organizationId });
  
  const analysis = await analyzeContent(content, title, organizationId);
  console.log('[VisualPrompts] Content analyzed:', analysis.mood, analysis.themes);
  
  const images = await generateImagePack(content, analysis, brandColors, organizationId);
  console.log('[VisualPrompts] Image Pack generated');
  
  return { analysis, images };
}

/**
 * Generate Video Scripts from master content
 */
export async function generateVideoScriptFromContent(
  content: string,
  title?: string,
  organizationId?: string
): Promise<{ analysis: ContentAnalysis; videos: VideoScriptOutput }> {
  console.log('[VisualPrompts] Generating Video Scripts...', { organizationId });
  
  const analysis = await analyzeContent(content, title, organizationId);
  console.log('[VisualPrompts] Content analyzed:', analysis.mood, analysis.actions);
  
  const videos = await generateVideoScript(content, analysis, organizationId);
  console.log('[VisualPrompts] Video Scripts generated');
  
  return { analysis, videos };
}

/**
 * Generate Product Backgrounds from master content
 */
export async function generateProductBackgroundsFromContent(
  content: string,
  title?: string,
  productType?: string,
  organizationId?: string
): Promise<{ analysis: ContentAnalysis; backgrounds: ProductBackgroundOutput }> {
  console.log('[VisualPrompts] Generating Product Backgrounds...', { organizationId });
  
  const analysis = await analyzeContent(content, title, organizationId);
  console.log('[VisualPrompts] Content analyzed:', analysis.mood, analysis.surfaces);
  
  const backgrounds = await generateProductBackgrounds(content, analysis, productType, organizationId);
  console.log('[VisualPrompts] Product Backgrounds generated');
  
  return { analysis, backgrounds };
}
