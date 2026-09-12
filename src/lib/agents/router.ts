/**
 * AGENT 1: ROUTER (The Creative Director)
 *
 * Analyzes the user brief and creates an execution strategy.
 * Selects ONE primary squad, determines Schwartz stage, and identifies constraints.
 *
 * Model: Claude Sonnet 4 (fast, strategic)
 * Cost: ~$0.02 per brief
 */

import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '@/integrations/supabase/client';
import type {
  RouterInput,
  StrategyJSON,
  CopySquad,
  VisualSquad,
  AwarenessStage,
  BrandDNA,
} from '@/types/madison';

// ═══════════════════════════════════════════════════════════════════════════════
// SQUAD DEFINITIONS (for prompt construction)
// ═══════════════════════════════════════════════════════════════════════════════

const SQUAD_DEFINITIONS = `
## Copy Squads

### THE_SCIENTISTS
Philosophy: Trust is earned through specificity, data, and logical proof.
Masters: Ogilvy (Specificity), Hopkins (Reason-Why), Caples (Headlines)
Use When: Price > $100, technical products, skeptical audiences, product pages
Forbidden: romantic imagery, vague claims, metaphors, wandering narratives

### THE_STORYTELLERS
Philosophy: Products are portals to adventure, identity, and possibility.
Masters: Peterman (Romance), Collier (Conversation Hook)
Use When: Lifestyle products, fragrance, candles, brand building, Instagram
Forbidden: clinical language, percentages, data-driven claims, mechanism talk

### THE_DISRUPTORS
Philosophy: Break patterns to be seen. Challenge assumptions, provoke thought.
Masters: Clow (Disruption), Halbert (Urgency)
Use When: Paid ads, scroll-stopping content, launches, top of funnel
Forbidden: gentle language, qualifiers, long explanations, safe phrasing

## Visual Squads

### THE_MINIMALISTS
Philosophy: Clarity through subtraction. Pure white backgrounds, clinical precision.
Master: Avedon (Stark Isolation)
Use When: Luxury skincare, tech, product pages

### THE_STORYTELLERS
Philosophy: Context creates emotion. Natural settings, lifestyle integration.
Master: Leibovitz (Environmental)
Use When: Fragrance, candles, Instagram, brand story

### THE_DISRUPTORS
Philosophy: Break visual patterns. Flash, bold colors, scroll-stopping.
Masters: Richardson (Raw), Anderson (Symmetry)
Use When: Paid social, TikTok, pattern interruption
`;

const SCHWARTZ_STAGES = `
## Schwartz Awareness Stages

1. UNAWARE - Customer doesn't know they have a problem
   → Open with relatable observation, reveal hidden problem

2. PROBLEM_AWARE - Knows the problem, unsure of solutions
   → Validate pain, explain mechanism, provide proof

3. SOLUTION_AWARE - Knows solutions exist, evaluating options
   → Lead with USP, compare approaches, remove objections

4. PRODUCT_AWARE - Knows your product, needs final push
   → Reinforce good judgment, add new info, gentle urgency

5. MOST_AWARE - Ready to buy, just needs the offer
   → Lead with deal, bonuses, single CTA, minimal copy
`;

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ROUTER FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

export async function routerAgent(input: RouterInput): Promise<StrategyJSON> {
  const { userBrief, orgId, productId, channel } = input;

  // 1. Fetch Brand DNA (if exists)
  let brandDNA: BrandDNA | null = null;
  try {
    const { data } = await supabase
      .from('brand_dna')
      .select('*')
      .eq('org_id', orgId)
      .single();
    brandDNA = data as BrandDNA;
  } catch {
    console.log('[Router] No brand DNA found, using defaults');
  }

  // 2. Construct the routing prompt
  const prompt = buildRouterPrompt(userBrief, brandDNA, channel, productId);

  // 3. Call Claude Sonnet for strategic analysis
  const anthropic = new Anthropic({
    apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY,
  });

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  // 4. Parse response
  const responseText = message.content[0].type === 'text'
    ? message.content[0].text
    : '';

  const strategy = parseStrategyResponse(responseText, brandDNA);

  // 5. Enrich with product ID if provided
  if (productId) {
    strategy.productId = productId;
  }

  return strategy;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROMPT CONSTRUCTION
// ═══════════════════════════════════════════════════════════════════════════════

function buildRouterPrompt(
  userBrief: string,
  brandDNA: BrandDNA | null,
  channel?: string,
  productId?: string
): string {
  const brandContext = brandDNA ? `
<BRAND_DNA>
Mission: ${brandDNA.essence?.mission || 'Not specified'}
Tone: ${brandDNA.essence?.tone || 'Not specified'}
Default Copy Squad: ${brandDNA.essence?.copySquad || 'Not specified'}
Default Visual Squad: ${brandDNA.essence?.visualSquad || 'Not specified'}
Forbidden Words: ${brandDNA.constraints?.forbiddenWords?.join(', ') || 'None'}
</BRAND_DNA>
` : `<BRAND_DNA>No brand DNA on file - use brief context to determine best approach</BRAND_DNA>`;

  return `You are the Creative Director for Madison Studio.
Analyze this brief and create an execution strategy.

<USER_BRIEF>
${userBrief}
</USER_BRIEF>

${brandContext}

<CHANNEL>
${channel || 'Not specified - infer from brief'}
</CHANNEL>

<PRODUCT_ID>
${productId || 'No specific product'}
</PRODUCT_ID>

<SQUAD_SYSTEM>
${SQUAD_DEFINITIONS}
</SQUAD_SYSTEM>

<AWARENESS_STAGES>
${SCHWARTZ_STAGES}
</AWARENESS_STAGES>

<INSTRUCTIONS>
Select ONE primary squad for copy and ONE for visuals.
Consider:
1. Product category and price point (if identifiable)
2. Channel constraints (Instagram = Storytellers, Paid ads = Disruptors)
3. Brand DNA defaults (respect them unless brief clearly requires different)
4. Audience awareness stage based on the brief context

CRITICAL: When you select a squad, the OTHER squads become forbidden.
For example: If you select THE_STORYTELLERS for copy, then THE_SCIENTISTS and THE_DISRUPTORS are forbidden.

Return ONLY valid JSON with no markdown formatting:
</INSTRUCTIONS>

{
  "copySquad": "THE_SCIENTISTS" | "THE_STORYTELLERS" | "THE_DISRUPTORS",
  "visualSquad": "THE_MINIMALISTS" | "THE_STORYTELLERS" | "THE_DISRUPTORS",
  "primaryCopyMaster": "OGILVY_SPECIFICITY" | "HOPKINS_REASON_WHY" | "CAPLES_HEADLINES" | "PETERMAN_ROMANCE" | "COLLIER_CONVERSATION" | "CLOW_DISRUPTION" | "HALBERT_URGENCY",
  "primaryVisualMaster": "AVEDON_ISOLATION" | "LEIBOVITZ_ENVIRONMENT" | "RICHARDSON_RAW" | "ANDERSON_SYMMETRY",
  "forbiddenCopySquads": ["...", "..."],
  "forbiddenLanguage": ["word1", "word2", "..."],
  "forbiddenVisualSquads": ["...", "..."],
  "forbiddenStyles": ["style1", "style2"],
  "schwartzStage": "unaware" | "problem_aware" | "solution_aware" | "product_aware" | "most_aware",
  "reasoning": "Brief explanation of why you made these choices"
}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESPONSE PARSING
// ═══════════════════════════════════════════════════════════════════════════════

function parseStrategyResponse(responseText: string, brandDNA: BrandDNA | null): StrategyJSON {
  try {
    // Clean JSON from response (remove markdown if present)
    const cleanedJson = responseText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    const parsed = JSON.parse(cleanedJson);

    // Validate and ensure all required fields
    const strategy: StrategyJSON = {
      copySquad: validateCopySquad(parsed.copySquad),
      visualSquad: validateVisualSquad(parsed.visualSquad),
      primaryCopyMaster: parsed.primaryCopyMaster || getDefaultMaster(parsed.copySquad, 'copy'),
      primaryVisualMaster: parsed.primaryVisualMaster || getDefaultMaster(parsed.visualSquad, 'visual'),
      forbiddenCopySquads: parsed.forbiddenCopySquads || getForbiddenCopySquads(parsed.copySquad),
      forbiddenLanguage: [
        ...(parsed.forbiddenLanguage || []),
        ...(brandDNA?.constraints?.forbiddenWords || []),
      ],
      forbiddenVisualSquads: parsed.forbiddenVisualSquads || getForbiddenVisualSquads(parsed.visualSquad),
      forbiddenStyles: [
        ...(parsed.forbiddenStyles || []),
        ...(brandDNA?.constraints?.forbiddenStyles || []),
      ],
      schwartzStage: validateAwarenessStage(parsed.schwartzStage),
      reasoning: parsed.reasoning || 'No reasoning provided',
    };

    return strategy;
  } catch (error) {
    console.error('[Router] Failed to parse strategy response:', error);
    console.error('[Router] Raw response:', responseText);

    // Return sensible defaults
    return getDefaultStrategy(brandDNA);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function validateCopySquad(squad: string): CopySquad {
  const valid: CopySquad[] = ['THE_SCIENTISTS', 'THE_STORYTELLERS', 'THE_DISRUPTORS'];
  return valid.includes(squad as CopySquad) ? squad as CopySquad : 'THE_STORYTELLERS';
}

function validateVisualSquad(squad: string): VisualSquad {
  const valid: VisualSquad[] = ['THE_MINIMALISTS', 'THE_STORYTELLERS', 'THE_DISRUPTORS'];
  return valid.includes(squad as VisualSquad) ? squad as VisualSquad : 'THE_STORYTELLERS';
}

function validateAwarenessStage(stage: string): AwarenessStage {
  const valid: AwarenessStage[] = ['unaware', 'problem_aware', 'solution_aware', 'product_aware', 'most_aware'];
  return valid.includes(stage as AwarenessStage) ? stage as AwarenessStage : 'solution_aware';
}

function getDefaultMaster(squad: string, type: 'copy' | 'visual'): string {
  if (type === 'copy') {
    const map: Record<string, string> = {
      'THE_SCIENTISTS': 'OGILVY_SPECIFICITY',
      'THE_STORYTELLERS': 'PETERMAN_ROMANCE',
      'THE_DISRUPTORS': 'CLOW_DISRUPTION',
    };
    return map[squad] || 'PETERMAN_ROMANCE';
  } else {
    const map: Record<string, string> = {
      'THE_MINIMALISTS': 'AVEDON_ISOLATION',
      'THE_STORYTELLERS': 'LEIBOVITZ_ENVIRONMENT',
      'THE_DISRUPTORS': 'RICHARDSON_RAW',
    };
    return map[squad] || 'LEIBOVITZ_ENVIRONMENT';
  }
}

function getForbiddenCopySquads(selectedSquad: string): CopySquad[] {
  const all: CopySquad[] = ['THE_SCIENTISTS', 'THE_STORYTELLERS', 'THE_DISRUPTORS'];
  return all.filter(s => s !== selectedSquad);
}

function getForbiddenVisualSquads(selectedSquad: string): VisualSquad[] {
  const all: VisualSquad[] = ['THE_MINIMALISTS', 'THE_STORYTELLERS', 'THE_DISRUPTORS'];
  return all.filter(s => s !== selectedSquad);
}

function getDefaultStrategy(brandDNA: BrandDNA | null): StrategyJSON {
  const copySquad = (brandDNA?.essence?.copySquad as CopySquad) || 'THE_STORYTELLERS';
  const visualSquad = (brandDNA?.essence?.visualSquad as VisualSquad) || 'THE_STORYTELLERS';

  return {
    copySquad,
    visualSquad,
    primaryCopyMaster: getDefaultMaster(copySquad, 'copy'),
    primaryVisualMaster: getDefaultMaster(visualSquad, 'visual'),
    forbiddenCopySquads: getForbiddenCopySquads(copySquad),
    forbiddenLanguage: brandDNA?.constraints?.forbiddenWords || [],
    forbiddenVisualSquads: getForbiddenVisualSquads(visualSquad),
    forbiddenStyles: brandDNA?.constraints?.forbiddenStyles || [],
    schwartzStage: 'solution_aware',
    reasoning: 'Default strategy based on brand DNA or system defaults',
  };
}

export default routerAgent;





























