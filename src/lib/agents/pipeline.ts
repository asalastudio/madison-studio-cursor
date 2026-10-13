/**
 * MADISON 4-AGENT PIPELINE
 *
 * The complete content generation pipeline:
 *   1. ROUTER → Analyzes brief, creates strategy
 *   2. ASSEMBLER → Fetches all context from Three Silos
 *   3. GENERATOR → Creates content using assembled context
 *   4. EDITOR → Validates output against constraints
 *
 * Usage:
 *   const result = await madisonPipeline("Write Instagram post for rose candle", orgId);
 *   console.log(result.content);
 */

import { routerAgent } from './router';
import { assemblerAgent } from './assembler';
import { generatorAgent, generateImagePrompt } from './generator';
import { editorAgent } from './editor';
import { humanizeGeneratedCopy } from '@/lib/humanizer/humanizeGeneratedCopy';
import { fetchVisualMaster } from './assembler';
import { supabase } from '@/integrations/supabase/client';
import type {
  PipelineOutput,
  StrategyJSON,
  ContextPackage,
  RouterInput,
} from '@/types/madison';

// ═══════════════════════════════════════════════════════════════════════════════
// PIPELINE OPTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export interface PipelineOptions {
  /** Specific channel (instagram, email, product_page, etc.) */
  channel?: string;
  /** Specific product ID to reference */
  productId?: string;
  /** Generate image prompt alongside copy */
  includeImagePrompt?: boolean;
  /** Skip editor validation (faster but riskier) */
  skipEditor?: boolean;
  /** Log detailed pipeline steps */
  verbose?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PIPELINE FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

export async function madisonPipeline(
  userBrief: string,
  orgId: string,
  options: PipelineOptions = {}
): Promise<PipelineOutput> {
  const { channel, productId, includeImagePrompt, skipEditor, verbose } = options;
  const startTime = Date.now();

  const log = verbose
    ? (msg: string) => console.log(`[Pipeline] ${msg}`)
    : () => {};

  log('Starting Madison pipeline');

  // ═══════════════════════════════════════════════════════════════════════════
  // AGENT 1: ROUTER
  // ═══════════════════════════════════════════════════════════════════════════
  log('Agent 1: Router analyzing brief');

  const routerInput: RouterInput = {
    userBrief,
    orgId,
    channel,
    productId,
  };

  const strategy = await routerAgent(routerInput);
  log(`Strategy: ${strategy.copySquad} / ${strategy.visualSquad} @ ${strategy.schwartzStage}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // AGENT 2: ASSEMBLER
  // ═══════════════════════════════════════════════════════════════════════════
  log('Agent 2: Assembler fetching context');

  const context = await assemblerAgent(strategy, orgId, userBrief);
  log(`Loaded ${context.masterDocuments.length} master docs, ${context.writingExamples.length} examples`);

  // ═══════════════════════════════════════════════════════════════════════════
  // AGENT 3: GENERATOR
  // ═══════════════════════════════════════════════════════════════════════════
  log('Agent 3: Generator creating content');

  const draft = await generatorAgent(userBrief, strategy, context);
  log(`Draft generated: ${draft.length} characters`);

  // ═══════════════════════════════════════════════════════════════════════════
  // AGENT 4: EDITOR
  // ═══════════════════════════════════════════════════════════════════════════
  let finalContent: string;

  if (skipEditor) {
    log('Agent 4: Editor SKIPPED (per options)');
    finalContent = draft;
  } else {
    log('Agent 4: Editor validating output');
    finalContent = await editorAgent(draft, strategy, context);
    log('Content approved');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // OPTIONAL: IMAGE PROMPT
  // ═══════════════════════════════════════════════════════════════════════════
  let imagePrompt: string | undefined;

  if (includeImagePrompt) {
    log('Generating image prompt');
    const visualMaster = await fetchVisualMaster(strategy.primaryVisualMaster);
    imagePrompt = generateImagePrompt(
      extractProductFromBrief(userBrief),
      strategy,
      visualMaster || undefined
    );
    log(`Image prompt: ${imagePrompt.substring(0, 100)}...`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECORD GENERATION (for analytics)
  // ═══════════════════════════════════════════════════════════════════════════
  finalContent = await humanizeGeneratedCopy(finalContent);

  const duration = Date.now() - startTime;
  log(`Complete in ${duration}ms`);

  // Optionally save to generated_content table for tracking
  await recordGeneration(orgId, finalContent, strategy, context, duration, userBrief, channel);

  return {
    content: finalContent,
    imageUrl: imagePrompt, // This is actually the prompt, not URL - rename if needed
    strategy,
    metadata: {
      duration,
      copySquad: strategy.copySquad,
      visualSquad: strategy.visualSquad,
      schwartzStage: strategy.schwartzStage,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SIMPLIFIED PIPELINE (for quick generation)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Quick generation with sensible defaults
 * For when you just need copy fast
 */
export async function quickGenerate(
  userBrief: string,
  orgId: string
): Promise<string> {
  const result = await madisonPipeline(userBrief, orgId, {
    skipEditor: true,
    verbose: false,
  });
  return result.content;
}

/**
 * Generate with full pipeline and image
 * For complete content creation
 */
export async function fullGenerate(
  userBrief: string,
  orgId: string,
  channel?: string
): Promise<PipelineOutput> {
  return madisonPipeline(userBrief, orgId, {
    channel,
    includeImagePrompt: true,
    verbose: true,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function extractProductFromBrief(brief: string): string {
  // Simple extraction - could be improved with NLP
  const productPatterns = [
    /for (?:the |our |my )?([^,.]+(?:candle|serum|cream|oil|perfume|cologne|soap|lotion))/i,
    /(?:about|featuring|for) (?:the |our |my )?([^,.]+)/i,
  ];

  for (const pattern of productPatterns) {
    const match = brief.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  return 'luxury product';
}

async function recordGeneration(
  orgId: string,
  content: string,
  strategy: StrategyJSON,
  context: ContextPackage,
  duration: number,
  userBrief: string,
  channel?: string
): Promise<void> {
  try {
    await supabase.from('generated_content').insert({
      org_id: orgId,
      content_type: 'copy',
      content,
      strategy_used: strategy,
      context_used: {
        masterDocuments: context.masterDocuments.map(d => d.substring(0, 100) + '...'),
        writingExamplesCount: context.writingExamples.length,
        visualExamplesCount: context.visualExamples.length,
      },
      user_brief: userBrief,
      channel,
      performance: {},
      approved: false,
      pipeline_duration_ms: duration,
    });
  } catch (error) {
    // Don't fail the pipeline if recording fails
    console.warn('[Pipeline] Failed to record generation:', error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// INDIVIDUAL AGENT EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export { routerAgent } from './router';
export { assemblerAgent, fetchVisualMaster } from './assembler';
export { generatorAgent, generateImagePrompt } from './generator';
export { editorAgent, quickValidate, suggestAlternatives } from './editor';

// ═══════════════════════════════════════════════════════════════════════════════
// RE-EXPORT TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type {
  RouterInput,
  StrategyJSON,
  ContextPackage,
  PipelineOutput,
} from '@/types/madison';





























