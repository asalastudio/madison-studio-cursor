/**
 * SQUAD AUTO-ASSIGNMENT
 *
 * Uses Claude Sonnet to intelligently assign copy and visual squads
 * based on brand analysis.
 *
 * Cost: ~$0.02 per assignment
 */

import Anthropic from "npm:@anthropic-ai/sdk@0.32.1";
import type { VisualAnalysis } from "./visualAnalyzer.ts";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type CopySquad = 'THE_SCIENTISTS' | 'THE_STORYTELLERS' | 'THE_DISRUPTORS';
export type VisualSquad = 'THE_MINIMALISTS' | 'THE_STORYTELLERS' | 'THE_DISRUPTORS';

export interface SquadAssignment {
  copySquad: CopySquad;
  visualSquad: VisualSquad;
  primaryCopyMaster: string;
  primaryVisualMaster: string;
  reasoning: string;
}

interface DocumentAnalysis {
  mission?: string;
  voiceAttributes?: string[];
  toneGuidelines?: string;
  visualGuidelines?: string;
}

interface ManualBrandData {
  essence?: {
    mission?: string;
    tone?: string;
    keywords?: string[];
  };
  visual?: {
    colors?: {
      primary?: string;
      secondary?: string;
      accent?: string;
    };
    typography?: {
      headline?: { family?: string };
      body?: { family?: string };
    };
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SQUAD DEFINITIONS PROMPT
// ═══════════════════════════════════════════════════════════════════════════════

const SQUAD_DEFINITIONS = `
COPY SQUADS:
1. THE_SCIENTISTS - Use for: High-price products ($100+), technical/clinical brands, skeptical audiences
   Masters: OGILVY_SPECIFICITY (data-driven proof), HOPKINS_REASON_WHY (mechanism explanation), CAPLES_HEADLINES (curiosity gaps)
   Best for: Skincare with actives, supplements, professional services

2. THE_STORYTELLERS - Use for: Lifestyle products, fragrance/candles, loyal audiences, brand-building
   Masters: PETERMAN_ROMANCE (sensory narratives), COLLIER_CONVERSATION (enter their mind)
   Best for: Fragrance, candles, luxury goods, heritage brands

3. THE_DISRUPTORS - Use for: Paid ads, attention-grabbing content, bold brands
   Masters: CLOW_DISRUPTION (pattern interruption), HALBERT_URGENCY (stakes-first)
   Best for: Facebook ads, TikTok, launches, scroll-stopping content

VISUAL SQUADS:
1. THE_MINIMALISTS - Use for: Luxury skincare, tech products, clinical positioning
   Masters: AVEDON_ISOLATION (white backgrounds, clinical precision)
   Best for: Product pages, high-price items, scientific brands

2. THE_STORYTELLERS - Use for: Lifestyle brands, fragrance, candles, emotional products
   Masters: LEIBOVITZ_ENVIRONMENT (natural settings, warm light)
   Best for: Instagram, brand story, lifestyle imagery

3. THE_DISRUPTORS - Use for: Scroll-stopping social ads, bold brands
   Masters: RICHARDSON_RAW (flash, high contrast), ANDERSON_SYMMETRY (bold colors, perfect symmetry)
   Best for: TikTok, Facebook ads, attention-grabbing visuals
`;

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ASSIGNMENT FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Assigns squads based on URL scan visual analysis
 */
export async function assignSquadsFromAnalysis(
  analysis: VisualAnalysis,
  sourceUrl: string
): Promise<SquadAssignment> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    console.log('[Squad Assignment] No API key, using heuristic assignment');
    return heuristicAssignment(analysis.brandTone, analysis.visualStyle);
  }

  const anthropic = new Anthropic({ apiKey });

  const assignmentPrompt = `You are a brand strategist assigning creative squads based on brand analysis.

<VISUAL_ANALYSIS>
${JSON.stringify(analysis, null, 2)}
</VISUAL_ANALYSIS>

<SOURCE_URL>${sourceUrl}</SOURCE_URL>

Based on this analysis, assign the appropriate creative squads.

<SQUAD_DEFINITIONS>
${SQUAD_DEFINITIONS}
</SQUAD_DEFINITIONS>

<DECISION_FACTORS>
Consider:
1. Brand tone (clinical vs. romantic vs. disruptive)
2. Visual style (minimalist vs. lifestyle vs. bold)
3. Product category implied by the website
4. Color palette (muted/clinical vs. warm/lifestyle vs. bold/vibrant)
5. Typography style (serif/elegant vs. sans/modern vs. bold/display)
</DECISION_FACTORS>

Return ONLY valid JSON (no markdown):
{
  "copySquad": "THE_SCIENTISTS" | "THE_STORYTELLERS" | "THE_DISRUPTORS",
  "visualSquad": "THE_MINIMALISTS" | "THE_STORYTELLERS" | "THE_DISRUPTORS",
  "primaryCopyMaster": "OGILVY_SPECIFICITY" | "HOPKINS_REASON_WHY" | "CAPLES_HEADLINES" | "PETERMAN_ROMANCE" | "COLLIER_CONVERSATION" | "CLOW_DISRUPTION" | "HALBERT_URGENCY",
  "primaryVisualMaster": "AVEDON_ISOLATION" | "LEIBOVITZ_ENVIRONMENT" | "RICHARDSON_RAW" | "ANDERSON_SYMMETRY",
  "reasoning": "1-2 sentence explanation of why these squads fit"
}`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: assignmentPrompt }]
    });

    const responseText = message.content[0].type === 'text'
      ? message.content[0].text
      : '';

    const cleanedResponse = responseText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    console.log('[Squad Assignment] Claude response:', cleanedResponse);
    return JSON.parse(cleanedResponse) as SquadAssignment;
  } catch (error) {
    console.error('[Squad Assignment] Claude failed, using heuristics:', error);
    return heuristicAssignment(analysis.brandTone, analysis.visualStyle);
  }
}

/**
 * Assigns squads based on PDF document analysis
 */
export async function assignSquadsFromDocument(
  analysis: DocumentAnalysis
): Promise<SquadAssignment> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return heuristicAssignmentFromText(analysis.toneGuidelines || '');
  }

  const anthropic = new Anthropic({ apiKey });

  const assignmentPrompt = `Based on this brand guidelines document analysis, assign creative squads:

<DOCUMENT_ANALYSIS>
Mission: ${analysis.mission || 'Not specified'}
Voice Attributes: ${analysis.voiceAttributes?.join(', ') || 'Not specified'}
Tone Guidelines: ${analysis.toneGuidelines || 'Not specified'}
Visual Guidelines: ${analysis.visualGuidelines || 'Not specified'}
</DOCUMENT_ANALYSIS>

<SQUAD_DEFINITIONS>
${SQUAD_DEFINITIONS}
</SQUAD_DEFINITIONS>

Return ONLY valid JSON with squad assignments and reasoning:
{
  "copySquad": "THE_SCIENTISTS" | "THE_STORYTELLERS" | "THE_DISRUPTORS",
  "visualSquad": "THE_MINIMALISTS" | "THE_STORYTELLERS" | "THE_DISRUPTORS",
  "primaryCopyMaster": "master name",
  "primaryVisualMaster": "visual master name",
  "reasoning": "1-2 sentence explanation"
}`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: assignmentPrompt }]
    });

    const responseText = message.content[0].type === 'text'
      ? message.content[0].text
      : '';

    const cleanedResponse = responseText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    return JSON.parse(cleanedResponse) as SquadAssignment;
  } catch (error) {
    console.error('[Squad Assignment] Document assignment failed:', error);
    return heuristicAssignmentFromText(analysis.toneGuidelines || '');
  }
}

/**
 * Assigns squads based on manual entry data
 */
export async function assignSquadsFromManual(
  brandData: ManualBrandData
): Promise<SquadAssignment> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return heuristicAssignment(brandData.essence?.tone || 'sophisticated', 'lifestyle');
  }

  const anthropic = new Anthropic({ apiKey });

  const assignmentPrompt = `Based on this manually-entered brand profile, assign creative squads:

<BRAND_DATA>
Mission: ${brandData.essence?.mission || 'Not specified'}
Tone: ${brandData.essence?.tone || 'Not specified'}
Keywords: ${brandData.essence?.keywords?.join(', ') || 'Not specified'}
Colors: ${JSON.stringify(brandData.visual?.colors || {})}
Typography: ${JSON.stringify(brandData.visual?.typography || {})}
</BRAND_DATA>

<SQUAD_DEFINITIONS>
${SQUAD_DEFINITIONS}
</SQUAD_DEFINITIONS>

Return ONLY valid JSON:
{
  "copySquad": "THE_SCIENTISTS" | "THE_STORYTELLERS" | "THE_DISRUPTORS",
  "visualSquad": "THE_MINIMALISTS" | "THE_STORYTELLERS" | "THE_DISRUPTORS",
  "primaryCopyMaster": "master name",
  "primaryVisualMaster": "visual master name",
  "reasoning": "1-2 sentence explanation"
}`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: assignmentPrompt }]
    });

    const responseText = message.content[0].type === 'text'
      ? message.content[0].text
      : '';

    const cleanedResponse = responseText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    return JSON.parse(cleanedResponse) as SquadAssignment;
  } catch (error) {
    console.error('[Squad Assignment] Manual assignment failed:', error);
    return heuristicAssignment(brandData.essence?.tone || 'sophisticated', 'lifestyle');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HEURISTIC FALLBACKS (No API Required)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fallback heuristic assignment based on tone and visual style
 */
function heuristicAssignment(
  brandTone: string,
  visualStyle: string
): SquadAssignment {
  // Copy Squad based on tone
  let copySquad: CopySquad;
  let primaryCopyMaster: string;

  switch (brandTone) {
    case 'clinical':
      copySquad = 'THE_SCIENTISTS';
      primaryCopyMaster = 'OGILVY_SPECIFICITY';
      break;
    case 'disruptive':
      copySquad = 'THE_DISRUPTORS';
      primaryCopyMaster = 'CLOW_DISRUPTION';
      break;
    case 'romantic':
    case 'sophisticated':
    case 'authentic':
    case 'playful':
    default:
      copySquad = 'THE_STORYTELLERS';
      primaryCopyMaster = 'PETERMAN_ROMANCE';
      break;
  }

  // Visual Squad based on style
  let visualSquad: VisualSquad;
  let primaryVisualMaster: string;

  switch (visualStyle) {
    case 'minimalist':
    case 'corporate':
      visualSquad = 'THE_MINIMALISTS';
      primaryVisualMaster = 'AVEDON_ISOLATION';
      break;
    case 'playful':
      visualSquad = 'THE_DISRUPTORS';
      primaryVisualMaster = 'ANDERSON_SYMMETRY';
      break;
    case 'lifestyle':
    case 'editorial':
    default:
      visualSquad = 'THE_STORYTELLERS';
      primaryVisualMaster = 'LEIBOVITZ_ENVIRONMENT';
      break;
  }

  return {
    copySquad,
    visualSquad,
    primaryCopyMaster,
    primaryVisualMaster,
    reasoning: `Heuristic assignment: ${brandTone} tone → ${copySquad}, ${visualStyle} style → ${visualSquad}`
  };
}

/**
 * Fallback heuristic based on text analysis
 */
function heuristicAssignmentFromText(text: string): SquadAssignment {
  const lowerText = text.toLowerCase();

  // Detect tone from keywords
  let tone = 'sophisticated';
  if (lowerText.match(/clinical|scientific|proven|data|research/)) {
    tone = 'clinical';
  } else if (lowerText.match(/bold|disruptive|innovative|challenge/)) {
    tone = 'disruptive';
  } else if (lowerText.match(/romantic|elegant|beautiful|sensory|poetic/)) {
    tone = 'romantic';
  } else if (lowerText.match(/playful|fun|energetic|vibrant/)) {
    tone = 'playful';
  }

  return heuristicAssignment(tone, 'lifestyle');
}

/**
 * Infer brand tone from voice attributes
 */
export function inferToneFromAttributes(attributes: string[]): string {
  const lowerAttrs = attributes.map(a => a.toLowerCase()).join(' ');

  if (lowerAttrs.match(/clinical|professional|precise|scientific/)) {
    return 'clinical';
  }
  if (lowerAttrs.match(/romantic|poetic|elegant|beautiful/)) {
    return 'romantic';
  }
  if (lowerAttrs.match(/playful|fun|energetic|bold/)) {
    return 'playful';
  }
  if (lowerAttrs.match(/sophisticated|refined|luxurious|premium/)) {
    return 'sophisticated';
  }
  if (lowerAttrs.match(/disruptive|innovative|bold|unconventional/)) {
    return 'disruptive';
  }
  if (lowerAttrs.match(/authentic|honest|genuine|real/)) {
    return 'authentic';
  }

  return 'sophisticated'; // Default
}





























