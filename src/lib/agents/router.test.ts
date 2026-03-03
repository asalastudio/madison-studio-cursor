import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StrategyJSON, BrandDNA } from '@/types/madison';

// ═══════════════════════════════════════════════════════════════════════════════
// MOCKS
// ═══════════════════════════════════════════════════════════════════════════════

const { mockSingle, mockEq, mockSelect, mockFrom, mockCreate } = vi.hoisted(() => {
  const mockSingle = vi.fn();
  const mockEq = vi.fn(() => ({ single: mockSingle }));
  const mockSelect = vi.fn(() => ({ eq: mockEq }));
  const mockFrom = vi.fn(() => ({ select: mockSelect }));
  const mockCreate = vi.fn();
  return { mockSingle, mockEq, mockSelect, mockFrom, mockCreate };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate };
    },
  };
});

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function makeAnthropicResponse(text: string) {
  return {
    content: [{ type: 'text', text }],
  };
}

function makeValidStrategyJSON(overrides: Partial<StrategyJSON> = {}): StrategyJSON {
  return {
    copySquad: 'THE_SCIENTISTS',
    visualSquad: 'THE_MINIMALISTS',
    primaryCopyMaster: 'OGILVY_SPECIFICITY',
    primaryVisualMaster: 'AVEDON_ISOLATION',
    forbiddenCopySquads: ['THE_STORYTELLERS', 'THE_DISRUPTORS'],
    forbiddenLanguage: ['vague', 'maybe'],
    forbiddenVisualSquads: ['THE_STORYTELLERS', 'THE_DISRUPTORS'],
    forbiddenStyles: ['romantic', 'chaotic'],
    schwartzStage: 'problem_aware',
    reasoning: 'Technical product with skeptical audience.',
    ...overrides,
  };
}

function makeBrandDNA(overrides: Partial<BrandDNA> = {}): BrandDNA {
  return {
    id: 'brand-1',
    org_id: 'org-1',
    visual: {},
    essence: {
      mission: 'Make great products',
      tone: 'sophisticated',
      copySquad: 'THE_SCIENTISTS',
      visualSquad: 'THE_MINIMALISTS',
    },
    constraints: {
      forbiddenWords: ['cheap', 'discount'],
      forbiddenStyles: ['grunge'],
    },
    scan_method: 'manual',
    scan_metadata: {},
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('routerAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no brand DNA found
    mockSingle.mockResolvedValue({ data: null, error: null });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 1. Returns valid strategy with correct JSON response from Claude
  // ─────────────────────────────────────────────────────────────────────────

  it('returns a valid strategy when Claude responds with correct JSON', async () => {
    const { routerAgent } = await import('./router');

    const strategyData = makeValidStrategyJSON();
    mockCreate.mockResolvedValue(makeAnthropicResponse(JSON.stringify(strategyData)));

    const result = await routerAgent({
      userBrief: 'Write a product page for our new serum',
      orgId: 'org-123',
    });

    expect(result.copySquad).toBe('THE_SCIENTISTS');
    expect(result.visualSquad).toBe('THE_MINIMALISTS');
    expect(result.primaryCopyMaster).toBe('OGILVY_SPECIFICITY');
    expect(result.primaryVisualMaster).toBe('AVEDON_ISOLATION');
    expect(result.forbiddenCopySquads).toEqual(['THE_STORYTELLERS', 'THE_DISRUPTORS']);
    expect(result.forbiddenVisualSquads).toEqual(['THE_STORYTELLERS', 'THE_DISRUPTORS']);
    expect(result.schwartzStage).toBe('problem_aware');
    expect(result.reasoning).toBe('Technical product with skeptical audience.');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Handles markdown-wrapped JSON (```json ... ```)
  // ─────────────────────────────────────────────────────────────────────────

  it('handles markdown-wrapped JSON in Claude response', async () => {
    const { routerAgent } = await import('./router');

    const strategyData = makeValidStrategyJSON({ copySquad: 'THE_DISRUPTORS' });
    const wrappedJson = '```json\n' + JSON.stringify(strategyData, null, 2) + '\n```';
    mockCreate.mockResolvedValue(makeAnthropicResponse(wrappedJson));

    const result = await routerAgent({
      userBrief: 'Create a scroll-stopping TikTok ad',
      orgId: 'org-123',
    });

    expect(result.copySquad).toBe('THE_DISRUPTORS');
    expect(result.primaryCopyMaster).toBe(strategyData.primaryCopyMaster);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Uses defaults when parsing fails (invalid JSON)
  // ─────────────────────────────────────────────────────────────────────────

  it('uses default strategy when Claude returns invalid JSON', async () => {
    const { routerAgent } = await import('./router');

    mockCreate.mockResolvedValue(
      makeAnthropicResponse('This is not valid JSON at all {{{')
    );

    const result = await routerAgent({
      userBrief: 'Something vague',
      orgId: 'org-123',
    });

    // Should fall back to getDefaultStrategy(null) since no brand DNA
    expect(result.copySquad).toBe('THE_STORYTELLERS');
    expect(result.visualSquad).toBe('THE_STORYTELLERS');
    expect(result.primaryCopyMaster).toBe('PETERMAN_ROMANCE');
    expect(result.primaryVisualMaster).toBe('LEIBOVITZ_ENVIRONMENT');
    expect(result.schwartzStage).toBe('solution_aware');
    expect(result.reasoning).toBe('Default strategy based on brand DNA or system defaults');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 4. Merges brand DNA forbidden words into strategy
  // ─────────────────────────────────────────────────────────────────────────

  it('merges brand DNA forbidden words and styles into strategy', async () => {
    const { routerAgent } = await import('./router');

    const brandDNA = makeBrandDNA();
    mockSingle.mockResolvedValue({ data: brandDNA, error: null });

    const strategyData = makeValidStrategyJSON({
      forbiddenLanguage: ['aggressive'],
      forbiddenStyles: ['neon'],
    });
    mockCreate.mockResolvedValue(makeAnthropicResponse(JSON.stringify(strategyData)));

    const result = await routerAgent({
      userBrief: 'Write copy for our luxury product',
      orgId: 'org-1',
    });

    // forbiddenLanguage should include both Claude's response and brand DNA forbidden words
    expect(result.forbiddenLanguage).toContain('aggressive');
    expect(result.forbiddenLanguage).toContain('cheap');
    expect(result.forbiddenLanguage).toContain('discount');

    // forbiddenStyles should include both Claude's response and brand DNA forbidden styles
    expect(result.forbiddenStyles).toContain('neon');
    expect(result.forbiddenStyles).toContain('grunge');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 5. Sets productId when provided
  // ─────────────────────────────────────────────────────────────────────────

  it('sets productId on the strategy when provided in input', async () => {
    const { routerAgent } = await import('./router');

    const strategyData = makeValidStrategyJSON();
    mockCreate.mockResolvedValue(makeAnthropicResponse(JSON.stringify(strategyData)));

    const result = await routerAgent({
      userBrief: 'Write copy for product X',
      orgId: 'org-123',
      productId: 'prod-456',
    });

    expect(result.productId).toBe('prod-456');
  });

  it('does not set productId when not provided in input', async () => {
    const { routerAgent } = await import('./router');

    const strategyData = makeValidStrategyJSON();
    mockCreate.mockResolvedValue(makeAnthropicResponse(JSON.stringify(strategyData)));

    const result = await routerAgent({
      userBrief: 'Write generic brand copy',
      orgId: 'org-123',
    });

    expect(result.productId).toBeUndefined();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 6. Uses defaults when no brand DNA exists
  // ─────────────────────────────────────────────────────────────────────────

  it('uses defaults when no brand DNA exists and Claude returns invalid response', async () => {
    const { routerAgent } = await import('./router');

    // No brand DNA
    mockSingle.mockResolvedValue({ data: null, error: null });

    // Invalid JSON triggers default strategy
    mockCreate.mockResolvedValue(makeAnthropicResponse('not json'));

    const result = await routerAgent({
      userBrief: 'Create an ad',
      orgId: 'org-no-brand',
    });

    // With null brand DNA, default strategy uses THE_STORYTELLERS for both
    expect(result.copySquad).toBe('THE_STORYTELLERS');
    expect(result.visualSquad).toBe('THE_STORYTELLERS');
    expect(result.primaryCopyMaster).toBe('PETERMAN_ROMANCE');
    expect(result.primaryVisualMaster).toBe('LEIBOVITZ_ENVIRONMENT');
    expect(result.forbiddenLanguage).toEqual([]);
    expect(result.forbiddenStyles).toEqual([]);
    expect(result.schwartzStage).toBe('solution_aware');
  });

  it('uses brand DNA squad defaults when parsing fails and brand DNA exists', async () => {
    const { routerAgent } = await import('./router');

    const brandDNA = makeBrandDNA({
      essence: {
        mission: 'Disrupt the industry',
        tone: 'disruptive',
        copySquad: 'THE_DISRUPTORS',
        visualSquad: 'THE_DISRUPTORS',
      },
      constraints: {
        forbiddenWords: ['boring'],
        forbiddenStyles: ['minimal'],
      },
    });
    mockSingle.mockResolvedValue({ data: brandDNA, error: null });

    mockCreate.mockResolvedValue(makeAnthropicResponse('totally broken json!!!'));

    const result = await routerAgent({
      userBrief: 'Something disruptive',
      orgId: 'org-1',
    });

    // Should use brand DNA squads as defaults
    expect(result.copySquad).toBe('THE_DISRUPTORS');
    expect(result.visualSquad).toBe('THE_DISRUPTORS');
    expect(result.primaryCopyMaster).toBe('CLOW_DISRUPTION');
    expect(result.primaryVisualMaster).toBe('RICHARDSON_RAW');
    expect(result.forbiddenLanguage).toContain('boring');
    expect(result.forbiddenStyles).toContain('minimal');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 7. Validation: invalid squad falls back to default
  // ─────────────────────────────────────────────────────────────────────────

  it('falls back to default squads when Claude returns invalid squad names', async () => {
    const { routerAgent } = await import('./router');

    const strategyData = {
      copySquad: 'INVALID_SQUAD',
      visualSquad: 'ALSO_INVALID',
      primaryCopyMaster: 'OGILVY_SPECIFICITY',
      primaryVisualMaster: 'AVEDON_ISOLATION',
      forbiddenCopySquads: ['THE_SCIENTISTS'],
      forbiddenLanguage: [],
      forbiddenVisualSquads: ['THE_MINIMALISTS'],
      forbiddenStyles: [],
      schwartzStage: 'problem_aware',
      reasoning: 'Some reasoning',
    };
    mockCreate.mockResolvedValue(makeAnthropicResponse(JSON.stringify(strategyData)));

    const result = await routerAgent({
      userBrief: 'Test brief',
      orgId: 'org-123',
    });

    // Invalid copySquad should default to THE_STORYTELLERS
    expect(result.copySquad).toBe('THE_STORYTELLERS');
    // Invalid visualSquad should default to THE_STORYTELLERS
    expect(result.visualSquad).toBe('THE_STORYTELLERS');
  });

  it('falls back to default awareness stage when Claude returns invalid stage', async () => {
    const { routerAgent } = await import('./router');

    const strategyData = makeValidStrategyJSON({
      schwartzStage: 'INVALID_STAGE' as never,
    });
    mockCreate.mockResolvedValue(makeAnthropicResponse(JSON.stringify(strategyData)));

    const result = await routerAgent({
      userBrief: 'Test brief',
      orgId: 'org-123',
    });

    // Invalid stage should default to solution_aware
    expect(result.schwartzStage).toBe('solution_aware');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 8. Forbidden squads computation returns other two squads
  // ─────────────────────────────────────────────────────────────────────────

  it('computes forbidden copy squads as the two non-selected squads', async () => {
    const { routerAgent } = await import('./router');

    // Return a strategy without forbiddenCopySquads to trigger getForbiddenCopySquads
    const strategyData = {
      copySquad: 'THE_SCIENTISTS',
      visualSquad: 'THE_MINIMALISTS',
      primaryCopyMaster: 'OGILVY_SPECIFICITY',
      primaryVisualMaster: 'AVEDON_ISOLATION',
      // Deliberately omit forbiddenCopySquads to trigger the default computation
      forbiddenLanguage: [],
      // Deliberately omit forbiddenVisualSquads to trigger the default computation
      forbiddenStyles: [],
      schwartzStage: 'product_aware',
      reasoning: 'Testing forbidden squads computation',
    };
    mockCreate.mockResolvedValue(makeAnthropicResponse(JSON.stringify(strategyData)));

    const result = await routerAgent({
      userBrief: 'Test forbidden squads',
      orgId: 'org-123',
    });

    // THE_SCIENTISTS selected -> forbidden should be THE_STORYTELLERS and THE_DISRUPTORS
    expect(result.forbiddenCopySquads).toHaveLength(2);
    expect(result.forbiddenCopySquads).toContain('THE_STORYTELLERS');
    expect(result.forbiddenCopySquads).toContain('THE_DISRUPTORS');
    expect(result.forbiddenCopySquads).not.toContain('THE_SCIENTISTS');

    // THE_MINIMALISTS selected -> forbidden should be THE_STORYTELLERS and THE_DISRUPTORS
    expect(result.forbiddenVisualSquads).toHaveLength(2);
    expect(result.forbiddenVisualSquads).toContain('THE_STORYTELLERS');
    expect(result.forbiddenVisualSquads).toContain('THE_DISRUPTORS');
    expect(result.forbiddenVisualSquads).not.toContain('THE_MINIMALISTS');
  });

  it('computes forbidden visual squads correctly for THE_STORYTELLERS', async () => {
    const { routerAgent } = await import('./router');

    const strategyData = {
      copySquad: 'THE_STORYTELLERS',
      visualSquad: 'THE_STORYTELLERS',
      primaryCopyMaster: 'PETERMAN_ROMANCE',
      primaryVisualMaster: 'LEIBOVITZ_ENVIRONMENT',
      forbiddenLanguage: [],
      forbiddenStyles: [],
      schwartzStage: 'unaware',
      reasoning: 'Lifestyle brand needs storytelling',
    };
    mockCreate.mockResolvedValue(makeAnthropicResponse(JSON.stringify(strategyData)));

    const result = await routerAgent({
      userBrief: 'Write Instagram copy for candle brand',
      orgId: 'org-123',
    });

    // Copy: THE_STORYTELLERS selected -> forbidden should be THE_SCIENTISTS and THE_DISRUPTORS
    expect(result.forbiddenCopySquads).toEqual(
      expect.arrayContaining(['THE_SCIENTISTS', 'THE_DISRUPTORS'])
    );
    expect(result.forbiddenCopySquads).not.toContain('THE_STORYTELLERS');

    // Visual: THE_STORYTELLERS selected -> forbidden should be THE_MINIMALISTS and THE_DISRUPTORS
    expect(result.forbiddenVisualSquads).toEqual(
      expect.arrayContaining(['THE_MINIMALISTS', 'THE_DISRUPTORS'])
    );
    expect(result.forbiddenVisualSquads).not.toContain('THE_STORYTELLERS');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Additional edge cases
  // ─────────────────────────────────────────────────────────────────────────

  it('uses default copy master when primaryCopyMaster is missing from response', async () => {
    const { routerAgent } = await import('./router');

    const strategyData = {
      copySquad: 'THE_DISRUPTORS',
      visualSquad: 'THE_DISRUPTORS',
      // Deliberately omit primaryCopyMaster and primaryVisualMaster
      forbiddenCopySquads: ['THE_SCIENTISTS', 'THE_STORYTELLERS'],
      forbiddenLanguage: [],
      forbiddenVisualSquads: ['THE_MINIMALISTS', 'THE_STORYTELLERS'],
      forbiddenStyles: [],
      schwartzStage: 'most_aware',
      reasoning: 'Testing default master selection',
    };
    mockCreate.mockResolvedValue(makeAnthropicResponse(JSON.stringify(strategyData)));

    const result = await routerAgent({
      userBrief: 'Launch ad',
      orgId: 'org-123',
    });

    // THE_DISRUPTORS copy -> CLOW_DISRUPTION
    expect(result.primaryCopyMaster).toBe('CLOW_DISRUPTION');
    // THE_DISRUPTORS visual -> RICHARDSON_RAW
    expect(result.primaryVisualMaster).toBe('RICHARDSON_RAW');
  });

  it('calls supabase with the correct org_id', async () => {
    const { routerAgent } = await import('./router');

    const strategyData = makeValidStrategyJSON();
    mockCreate.mockResolvedValue(makeAnthropicResponse(JSON.stringify(strategyData)));

    await routerAgent({
      userBrief: 'Test brief',
      orgId: 'org-specific-id',
    });

    expect(mockFrom).toHaveBeenCalledWith('brand_dna');
    expect(mockSelect).toHaveBeenCalledWith('*');
    expect(mockEq).toHaveBeenCalledWith('org_id', 'org-specific-id');
  });
});
