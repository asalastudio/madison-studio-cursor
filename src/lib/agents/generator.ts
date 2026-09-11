/**
 * AGENT 3: GENERATOR (Madison the Writer)
 * 
 * Creates content using the assembled context.
 * Applies master principles, negative constraints, and Schwartz framework.
 * 
 * Model: Claude Sonnet 4 (or Opus 4 for best quality)
 * Cost: ~$0.10-$0.20 per generation
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  StrategyJSON,
  ContextPackage,
  CopySquad,
} from '@/types/madison';
import { getIndustryById, type IndustryConfig } from '@/config/industries';

// ═══════════════════════════════════════════════════════════════════════════════
// MADISON IDENTITY DOCUMENT
// ═══════════════════════════════════════════════════════════════════════════════

const MADISON_IDENTITY = `
You are Madison, the world-class copywriter and brand designer.

## Your Core Identity
- You write with the precision of Ogilvy and the romance of Peterman
- You never use marketing fluff or empty superlatives
- Every word must earn its place
- You respect the reader's intelligence
- You believe products are portals to identity transformation

## Your Philosophy
"I don't write copy. I write doors that open to the life your customers want to live."

## Your Rules
1. Story before product (always)
2. Specific beats vague (every time)
3. One voice per piece (no mixing squads)
4. Forbidden language is sacred (never break it)
5. Structure follows awareness (Schwartz is the OS)
`;

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN GENERATOR FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

export async function generatorAgent(
  userBrief: string,
  strategy: StrategyJSON,
  context: ContextPackage
): Promise<string> {
  console.log('[Generator] Creating content as', strategy.copySquad);

  // Build prompts
  const systemPrompt = buildSystemPrompt(strategy);
  const userPrompt = buildUserPrompt(userBrief, strategy, context);

  // Call Claude
  const anthropic = new Anthropic({
    apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY,
  });

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const draft = message.content[0].type === 'text' 
    ? message.content[0].text 
    : '';

  console.log(`[Generator] Draft created: ${draft.length} characters`);
  return draft;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT CONSTRUCTION
// ═══════════════════════════════════════════════════════════════════════════════

function buildSystemPrompt(strategy: StrategyJSON): string {
  return `${MADISON_IDENTITY}

<CURRENT_ASSIGNMENT>
You are writing as ${strategy.copySquad}.
Your primary master is ${strategy.primaryCopyMaster}.
You must follow the ${strategy.schwartzStage} awareness structure.
</CURRENT_ASSIGNMENT>

<CRITICAL_CONSTRAINTS>
❌ FORBIDDEN SQUADS: ${strategy.forbiddenCopySquads.join(', ')}

You are ${strategy.copySquad}. 
Do NOT use language from ${strategy.forbiddenCopySquads.join(' or ')}.

Specifically NEVER use these words/phrases:
${strategy.forbiddenLanguage.join(', ')}

If you catch yourself writing like a forbidden squad, STOP and rewrite.
</CRITICAL_CONSTRAINTS>
`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// USER PROMPT CONSTRUCTION
// ═══════════════════════════════════════════════════════════════════════════════

function buildUserPrompt(
  userBrief: string,
  strategy: StrategyJSON,
  context: ContextPackage
): string {
  // Build sections
  const masterSection = context.masterDocuments.length > 0 
    ? `<MASTER_DOCUMENTS>
${context.masterDocuments.join('\n\n---\n\n')}
</MASTER_DOCUMENTS>`
    : '';

  const schwartzSection = `<SCHWARTZ_TEMPLATE>
${context.schwartzTemplate}
</SCHWARTZ_TEMPLATE>`;

  // Get industry-specific context if available
  const industryId = context.industryConfig?.id;
  const industryConfig = industryId ? getIndustryById(industryId) : null;

  const brandSection = context.brandDNA ? `<BRAND_DNA>
Mission: ${context.brandDNA.essence?.mission || 'Create beautiful things'}
Tone: ${context.brandDNA.essence?.tone || 'sophisticated'}
Colors: ${JSON.stringify(context.brandDNA.visual?.colors || {})}
Typography: ${JSON.stringify(context.brandDNA.visual?.typography || {})}
</BRAND_DNA>` : '';

  // Brand Knowledge from uploaded documents (PRIORITY SOURCE)
  const brandKnowledgeSection = context.brandKnowledge ? `<BRAND_KNOWLEDGE>
${context.brandKnowledge.brandIdentity ? `
BRAND IDENTITY:
Mission: ${context.brandKnowledge.brandIdentity.mission || ''}
Values: ${context.brandKnowledge.brandIdentity.values?.join(', ') || ''}
Target Audience: ${context.brandKnowledge.brandIdentity.targetAudience || ''}
Unique Positioning: ${context.brandKnowledge.brandIdentity.uniquePositioning || ''}
` : ''}

${context.brandKnowledge.voice ? `
BRAND VOICE:
Tone Attributes: ${context.brandKnowledge.voice.toneAttributes?.join(', ') || ''}
Personality Traits: ${context.brandKnowledge.voice.personalityTraits?.join(', ') || ''}
Writing Style: ${context.brandKnowledge.voice.writingStyle || ''}
Key Characteristics: ${context.brandKnowledge.voice.keyCharacteristics?.join(', ') || ''}
` : ''}

${context.brandKnowledge.vocabulary ? `
VOCABULARY:
Approved Terms: ${context.brandKnowledge.vocabulary.approvedTerms?.join(', ') || ''}
Forbidden Phrases: ${context.brandKnowledge.vocabulary.forbiddenPhrases?.join(', ') || ''}
Industry Terminology: ${context.brandKnowledge.vocabulary.industryTerminology?.join(', ') || ''}
` : ''}

${context.brandKnowledge.structure ? `
WRITING STRUCTURE:
Sentence Structure: ${context.brandKnowledge.structure.sentenceStructure || ''}
Paragraph Length: ${context.brandKnowledge.structure.paragraphLength || ''}
Punctuation Style: ${context.brandKnowledge.structure.punctuationStyle || ''}
` : ''}

⚠️ CRITICAL: The above BRAND_KNOWLEDGE is extracted from the brand's official documentation. 
This is the PRIMARY source of truth for how this brand communicates. Follow it precisely.
</BRAND_KNOWLEDGE>` : '';

  // Industry-specific guidance for Madison
  const industrySection = industryConfig ? `<INDUSTRY_CONTEXT>
Industry: ${industryConfig.name}
Description: ${industryConfig.description}

VOCABULARY GUIDANCE:
- Words to embrace: ${industryConfig.defaults.wordsWeLove.join(', ')}
- Words to avoid: ${industryConfig.defaults.wordsWeAvoid.join(', ')}

TONE GUIDANCE:
- Preferred tones: ${industryConfig.defaults.tones.join(', ')}
- Personality traits: ${industryConfig.defaults.personalityTraits.join(', ')}

CONTENT STYLE:
${getIndustryStyleGuidance(industryConfig)}
</INDUSTRY_CONTEXT>` : '';

  const productSection = context.productData ? `<PRODUCT_DATA>
${JSON.stringify(context.productData, null, 2)}
</PRODUCT_DATA>` : '';

  const examplesSection = context.writingExamples.length > 0 ? `<BRAND_EXAMPLES>
${context.writingExamples.map(ex => ex.content).join('\n\n---\n\n')}
</BRAND_EXAMPLES>` : '';

  const forbiddenSection = `<FORBIDDEN_REMINDER>
❌ You are ${strategy.copySquad}. 

DO NOT write like ${strategy.forbiddenCopySquads[0]}:
${generateForbiddenExample(strategy.forbiddenCopySquads[0])}

INSTEAD, write like ${strategy.copySquad}:
${generateApprovedExample(strategy.copySquad)}
</FORBIDDEN_REMINDER>`;

  return `<STRATEGY>
Copy Squad: ${strategy.copySquad}
Visual Squad: ${strategy.visualSquad}
Primary Master: ${strategy.primaryCopyMaster}
Schwartz Stage: ${strategy.schwartzStage}
</STRATEGY>

${masterSection}

${schwartzSection}

${brandKnowledgeSection}

${brandSection}

${industrySection}

${productSection}

${examplesSection}

${forbiddenSection}

<USER_BRIEF>
${userBrief}
</USER_BRIEF>

<INSTRUCTIONS>
Write the content now. 
- Follow the master principles exactly
- Use the Schwartz structure for the ${strategy.schwartzStage} stage
- Respect ALL forbidden constraints
- Match the brand tone and voice
- If product data is provided, use it accurately

Output the final content directly. No preamble, no explanation.
</INSTRUCTIONS>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXAMPLE GENERATION FOR CONSTRAINTS
// ═══════════════════════════════════════════════════════════════════════════════

function generateForbiddenExample(forbiddenSquad: CopySquad): string {
  const examples: Record<CopySquad, string> = {
    'THE_SCIENTISTS': `"Clinically proven to reduce wrinkles by 23% in 8 weeks. Our formula contains 12% niacinamide and was tested on 200 subjects in a double-blind study."`,
    'THE_STORYTELLERS': `"The sun rose over the lavender fields of Grasse, and in that golden moment, we captured something transcendent—a scent that whispers of distant journeys and dreams yet to unfold."`,
    'THE_DISRUPTORS': `"Stop wasting money on serums that don't work. Your skincare routine is lying to you. Here's the truth no one wants to tell you."`,
  };
  return examples[forbiddenSquad] || '';
}

function generateApprovedExample(squad: CopySquad): string {
  const examples: Record<CopySquad, string> = {
    'THE_SCIENTISTS': `"Contains 0.5% encapsulated retinol for gradual release over 8 hours. The lipid encapsulation prevents irritation while maintaining clinical efficacy. 87% of users saw visible reduction in fine lines within 12 weeks."`,
    'THE_STORYTELLERS': `"There's a valley in Bulgaria where roses bloom at dawn. Not the roses you buy at the store—these are Rosa damascena, the ancient kind, with petals so fragile they must be picked by hand before sunrise. We traveled there in May."`,
    'THE_DISRUPTORS': `"Retinol is hurting your skin. Not the ingredient. The delivery. Most serums dump the active all at once. We encapsulate it. Time-release over 8 hours. Same results. Zero irritation."`,
  };
  return examples[squad] || '';
}

// ═══════════════════════════════════════════════════════════════════════════════
// INDUSTRY-SPECIFIC STYLE GUIDANCE
// ═══════════════════════════════════════════════════════════════════════════════

function getIndustryStyleGuidance(industry: IndustryConfig): string {
  const guidance: Record<string, string> = {
    'fragrance-beauty': `
- Use sensory language: describe scents, textures, and the feeling of application
- Reference ingredients with reverence, like a sommelier describes wine notes
- Evoke ritual and self-care moments
- Connect products to identity transformation and emotional states
- Paint scenes: "the moment after a warm bath", "the quiet of your morning routine"`,
    
    'luxury-goods': `
- Emphasize craftsmanship and the human hands behind the product
- Use heritage and provenance as narrative anchors
- Describe materials with specificity (full-grain vs top-grain leather)
- Reference time: "heirloom quality", "patinas that develop over years"
- Less is more: understated elegance, not loud luxury`,
    
    'hospitality-realestate': `
- Paint experiential scenes: what does it feel like to wake up here?
- Use specific sensory details: the texture of linens, the view at golden hour
- Balance aspiration with attainability
- Highlight what makes this place unique, not generic luxury descriptors
- Create urgency through scarcity or seasonal moments`,
    
    'expert-brands': `
- Lead with insight, not credentials
- Use "you" language: speak directly to the reader's ambitions
- Share frameworks and mental models
- Balance confidence with approachability
- Avoid jargon; translate complexity into clarity
- Make the reader feel understood before offering solutions`,
  };
  
  return guidance[industry.id] || '';
}

// ═══════════════════════════════════════════════════════════════════════════════
// IMAGE PROMPT GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate an image prompt based on strategy and visual master
 */
export function generateImagePrompt(
  productDescription: string,
  strategy: StrategyJSON,
  visualMaster?: {
    promptTemplate: string;
    compositionRules: Record<string, unknown>;
    lightingRules: Record<string, unknown>;
  }
): string {
  // Start with visual master template if available
  let basePrompt = visualMaster?.promptTemplate || getDefaultPromptTemplate(strategy.primaryVisualMaster);
  
  // Replace placeholder with product description
  basePrompt = basePrompt.replace('[Product]', productDescription);
  basePrompt = basePrompt.replace('[Product name]', productDescription);
  
  // Add forbidden styles as negative prompts
  const negativePrompts = strategy.forbiddenStyles.length > 0
    ? ` --no ${strategy.forbiddenStyles.join(' --no ')}`
    : '';

  return basePrompt + negativePrompts;
}

function getDefaultPromptTemplate(masterName: string): string {
  const templates: Record<string, string> = {
    'AVEDON_ISOLATION': '[Product] on pure white background, Richard Avedon style product photography, centered composition, clinical lighting, soft directional light from top-left, no shadows, isolated subject, minimalist aesthetic, professional commercial photography, hyperrealistic, 8k resolution --ar 1:1 --style raw --no props --no context',
    'LEIBOVITZ_ENVIRONMENT': '[Product] in natural setting, Annie Leibovitz style environmental portrait, lifestyle photography, soft natural window light, warm color grading, editorial magazine quality, film grain texture, Kinfolk aesthetic, intimate atmosphere --ar 4:5 --style raw --no clinical --no white background',
    'RICHARDSON_RAW': '[Product] on bold color background, high contrast, bold graphic style, commercial advertising photography, dramatic lighting, scroll-stopping visual, modern bold aesthetic --ar 9:16 --style raw --no subtle --no muted',
    'ANDERSON_SYMMETRY': '[Product] overhead flat lay, Wes Anderson symmetrical composition, bold graphic style, centered perfectly, hyperrealistic, bold colors --ar 9:16 --style raw',
  };
  return templates[masterName] || templates['LEIBOVITZ_ENVIRONMENT'];
}

export default generatorAgent;












