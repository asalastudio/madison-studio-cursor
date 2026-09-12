/**
 * AGENT 4: EDITOR (Quality Control)
 *
 * Validates Generator output against constraints.
 * Catches forbidden language, verifies structure, and fixes issues.
 *
 * Model: Claude Sonnet 4 (fast validation)
 * Cost: ~$0.03 per review
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  StrategyJSON,
  ContextPackage,
} from '@/types/madison';

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EDITOR FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

export async function editorAgent(
  draft: string,
  strategy: StrategyJSON,
  context: ContextPackage
): Promise<string> {
  console.log('[Editor] Validating draft against constraints');

  // 1. Quick local check for obvious forbidden words
  const forbiddenFound = quickForbiddenCheck(draft, strategy.forbiddenLanguage);

  // 2. If no obvious issues, do a lightweight approval
  if (forbiddenFound.length === 0) {
    console.log('[Editor] Draft passed quick check');
    // Still do AI validation but in approval mode
  }

  // 3. Build editor prompt
  const editorPrompt = buildEditorPrompt(draft, strategy, context, forbiddenFound);

  // 4. Call Claude for validation/editing
  const anthropic = new Anthropic({
    apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY,
  });

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 4096,
    messages: [{ role: 'user', content: editorPrompt }],
  });

  let finalContent = message.content[0].type === 'text'
    ? message.content[0].text
    : '';

  // 5. Clean up response markers
  finalContent = cleanEditorResponse(finalContent);

  console.log('[Editor] Content validated and approved');
  return finalContent;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOCAL VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

function quickForbiddenCheck(draft: string, forbiddenLanguage: string[]): string[] {
  const lowerDraft = draft.toLowerCase();
  const found: string[] = [];

  for (const word of forbiddenLanguage) {
    if (lowerDraft.includes(word.toLowerCase())) {
      found.push(word);
    }
  }

  return found;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EDITOR PROMPT CONSTRUCTION
// ═══════════════════════════════════════════════════════════════════════════════

function buildEditorPrompt(
  draft: string,
  strategy: StrategyJSON,
  context: ContextPackage,
  forbiddenFound: string[]
): string {
  const foundWarning = forbiddenFound.length > 0
    ? `⚠️ WARNING: The following forbidden words were detected: ${forbiddenFound.join(', ')}
These MUST be removed or replaced in your edited version.`
    : '';

  const masterCriteria = getMasterValidationCriteria(strategy.primaryCopyMaster);
  const schwartzCriteria = getSchwartzValidationCriteria(strategy.schwartzStage);

  return `You are the Editorial Director reviewing Madison's draft.

<DRAFT_TO_REVIEW>
${draft}
</DRAFT_TO_REVIEW>

<STRATEGY>
Copy Squad: ${strategy.copySquad}
Primary Master: ${strategy.primaryCopyMaster}
Schwartz Stage: ${strategy.schwartzStage}
Forbidden Squads: ${strategy.forbiddenCopySquads.join(', ')}
Forbidden Language: ${strategy.forbiddenLanguage.slice(0, 20).join(', ')}${strategy.forbiddenLanguage.length > 20 ? '...' : ''}
</STRATEGY>

${foundWarning}

<VALIDATION_CHECKLIST>
1. ❌ FORBIDDEN LANGUAGE CHECK
   Did the draft accidentally use ${strategy.forbiddenCopySquads[0]} language?
   Scan for: ${strategy.forbiddenLanguage.slice(0, 10).join(', ')}

2. ✅ MASTER PRINCIPLES CHECK
   Does it follow ${strategy.primaryCopyMaster} principles?
   ${masterCriteria}

3. ✅ SCHWARTZ STRUCTURE CHECK
   Does it use the ${strategy.schwartzStage} structure?
   ${schwartzCriteria}

${context.productData ? `4. ✅ PRODUCT ACCURACY CHECK
   Verify product facts are accurate:
   Price: ${context.productData.price || 'Not specified'}
   Key benefits: ${context.productData.benefits?.slice(0, 3).join(', ') || 'Not specified'}
` : ''}

5. ✅ BRAND TONE CHECK
   Expected tone: ${context.brandDNA?.essence?.tone || 'sophisticated'}
</VALIDATION_CHECKLIST>

<INSTRUCTIONS>
Review the draft against all checkpoints above.

If there are violations or errors:
- Rewrite ONLY the problematic sections
- Maintain the overall structure and good parts
- Replace forbidden words with on-brand alternatives
- Ensure master principles are applied

If everything is correct:
- Return the draft exactly as-is
- Add "APPROVED:" at the very beginning

Output the final version now. Nothing else.
</INSTRUCTIONS>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION CRITERIA BY MASTER
// ═══════════════════════════════════════════════════════════════════════════════

function getMasterValidationCriteria(masterName: string): string {
  const criteria: Record<string, string> = {
    'OGILVY_SPECIFICITY': `
   - Uses specific numbers, dates, percentages
   - Avoids vague claims like "amazing" or "incredible"
   - Includes proof for every benefit
   - Confident tone without hype`,

    'HOPKINS_REASON_WHY': `
   - Explains mechanism ("because...")
   - Compares to alternatives
   - Provides concrete proof
   - Respects reader intelligence`,

    'CAPLES_HEADLINES': `
   - Headline creates curiosity gap
   - Specific, not generic
   - Promises clear benefit
   - First paragraph delivers on promise`,

    'PETERMAN_ROMANCE': `
   - Story comes before product
   - Sensory details (smell, texture, sound)
   - Second person ("you") for immersion
   - No marketing jargon or hype`,

    'COLLIER_CONVERSATION': `
   - Opens with reader's existing thought/feeling
   - Smooth bridge to product
   - Personal, intimate tone
   - Appeals to desire before logic`,

    'CLOW_DISRUPTION': `
   - Headline 7 words or fewer
   - Challenges an assumption
   - No qualifiers (perhaps, maybe, possibly)
   - Pattern-interrupting`,

    'HALBERT_URGENCY': `
   - Stakes clear within opening
   - Urgency backed by facts (not hype)
   - Short paragraphs (3 sentences max)
   - Human-to-human voice`,
  };

  return criteria[masterName] || 'Follows master principles correctly';
}

function getSchwartzValidationCriteria(stage: string): string {
  const criteria: Record<string, string> = {
    'unaware': `
   - Opens with relatable observation (not problem)
   - Gently reveals hidden problem
   - Shows why it matters
   - Introduces solution category (not product pitch)`,

    'problem_aware': `
   - Validates their pain immediately
   - Explains why problem persists (mechanism)
   - Presents unique approach
   - Includes proof/evidence`,

    'solution_aware': `
   - Acknowledges they're evaluating options
   - Leads with unique selling proposition
   - Compares approaches (not brands)
   - Removes final objections`,

    'product_aware': `
   - Reinforces their good judgment
   - Adds new information they didn't know
   - Creates genuine urgency (not fake scarcity)
   - Makes purchase easy`,

    'most_aware': `
   - Offer is clear and prominent
   - Includes bonuses/guarantees
   - Single, obvious CTA
   - Minimal convincing copy`,
  };

  return criteria[stage] || 'Follows awareness stage structure';
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESPONSE CLEANING
// ═══════════════════════════════════════════════════════════════════════════════

function cleanEditorResponse(response: string): string {
  // Remove "APPROVED:" marker if present
  let cleaned = response.replace(/^APPROVED:?\s*/i, '');

  // Remove any markdown code blocks if the AI wrapped the response
  cleaned = cleaned.replace(/^```[\w]*\n?/g, '').replace(/\n?```$/g, '');

  // Trim whitespace
  cleaned = cleaned.trim();

  return cleaned;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BATCH VALIDATION (for multiple drafts)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Quick validation without AI for performance-critical paths
 */
export function quickValidate(
  draft: string,
  forbiddenLanguage: string[]
): { isValid: boolean; violations: string[] } {
  const violations = quickForbiddenCheck(draft, forbiddenLanguage);
  return {
    isValid: violations.length === 0,
    violations,
  };
}

/**
 * Suggest alternatives for forbidden words
 */
export function suggestAlternatives(
  forbiddenWord: string,
  context: 'scientists' | 'storytellers' | 'disruptors'
): string[] {
  const alternatives: Record<string, Record<string, string[]>> = {
    'amazing': {
      scientists: ['effective', 'proven', 'measurable'],
      storytellers: ['remarkable', 'unforgettable', 'transformative'],
      disruptors: ['game-changing', 'revolutionary'],
    },
    'journey': {
      scientists: ['process', 'progression', 'development'],
      storytellers: ['adventure', 'story', 'experience'],
      disruptors: ['path', 'shift'],
    },
    'clinical': {
      scientists: ['clinical'],
      storytellers: ['precise', 'careful', 'considered'],
      disruptors: ['sharp', 'exact'],
    },
    'proven': {
      scientists: ['proven'],
      storytellers: ['trusted', 'beloved', 'cherished'],
      disruptors: ['tested', 'battle-tested'],
    },
  };

  const wordAlts = alternatives[forbiddenWord.toLowerCase()];
  if (wordAlts && wordAlts[context]) {
    return wordAlts[context];
  }

  return ['[find appropriate alternative]'];
}

export default editorAgent;





























