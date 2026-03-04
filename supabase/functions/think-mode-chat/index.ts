import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import {
  generateGeminiContent,
  extractTextFromGeminiResponse,
  createOpenAISSEStream,
  OpenAIMessage,
} from "../_shared/geminiClient.ts";
import { buildAuthorProfilesSection } from "../_shared/authorProfiles.ts";
import { buildBrandAuthoritiesSection } from "../_shared/brandAuthorities.ts";
import { getMadisonMasterContext, SQUAD_DEFINITIONS } from "../_shared/madisonMasters.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Strategic Knowledge Base
const STRATEGIC_FRAMEWORKS = `
=== STRATEGIC KNOWLEDGE BASE ===
You have access to the following strategic frameworks. Use them to analyze problems and propose solutions.

1. JAY ABRAHAM - STRATEGY OF PREEMINENCE & GROWTH
- Philosophy: Fall in love with the client, not the product. You are their trusted advisor for life. Treat them as a valued friend you are protecting.
- The 3 Ways to Grow a Business:
  1. Increase number of clients
  2. Increase average transaction value (upsells, cross-sells)
  3. Increase frequency of repurchase (residual value)
- Risk Reversal: Take the risk off the buyer's shoulders (guarantees, trials) to lower the barrier to entry.
- Optimization: Getting the maximum yield out of every action, asset, and relationship.

2. PETER DRUCKER - MANAGEMENT & EFFECTIVENESS
- The 5 Questions:
  1. What is our mission?
  2. Who is our customer?
  3. What does the customer value?
  4. What are our results?
  5. What is our plan?
- Theory of the Business: Ensure your assumptions about the market, mission, and core competencies match reality.
- Efficiency vs. Effectiveness: Efficiency is doing things right; effectiveness is doing the right things.
- Innovation: The specific tool of entrepreneurs, the means by which they exploit change as an opportunity.

3. TONY ROBBINS - BUSINESS MASTERY
- 7 Forces of Business Mastery:
  1. Effective Business Map (Where are we really?)
  2. Strategic Innovation (Adding more value than anyone else)
  3. World-Class Marketing (Getting found)
  4. Sales Mastery Systems (Conversion)
  5. Financial & Legal Analysis (Knowing the numbers)
  6. Optimization & Maximization (Small changes, big results)
  7. Raving Fan Culture (Creating advocates)
- RPM (Result, Purpose, Massive Action Plan): Always start with the Outcome. Why do we want it? What actions will get us there?

4. MARK JOYNER - INTEGRATION MARKETING & OFFERS
- The Irresistible Offer: Must have High ROI, Low Risk, Clear Value, and a "Touchstone" (believability).
- Integration Marketing: The fastest way to grow is to integrate your offer into the traffic streams of others (O.P.T. - Other People's Traffic).

5. BLUE OCEAN STRATEGY
- Don't compete with rivals; make them irrelevant.
- Create uncontested market space.
- Value Innovation: Pursue differentiation and low cost simultaneously.

6. STRATEGIC READINESS & PREREQUISITES (THE "PANIC FILTER")
- The "Deep End" Danger: Marketing strategies (launches, cash injections) fail without prerequisites.
- Assessment First: Before prescribing a tactic (e.g., "send email blast"), verify the asset (e.g., "is the list clean/warm?").
- The Haste Trap: Business owners in panic mode often skip foundations. Slow them down to speed them up.
- Readiness Checklist:
  1. Audience: Do you have permission? Is the list clean? When did they last hear from you?
  2. Offer: Is it proven? Can you fulfill it?
  3. Tech: Is the checkout working? Are pixels firing?
  4. Trust: Do they know who you are right now?

USE THESE FRAMEWORKS TO STRUCTURE YOUR ADVICE. CITE THEM WHEN RELEVANT TO ADD AUTHORITY AND CLARITY.
`;

// Helper function to fetch Madison's system training
async function getMadisonSystemConfig() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  try {
    const { data, error } = await supabase
      .from('madison_system_config')
      .select('*')
      .limit(1)
      .maybeSingle();
    
    if (error || !data) return '';
    
    const configParts = [];
    
    if (data.persona) configParts.push(`PERSONA: ${data.persona}`);
    if (data.editorial_philosophy) configParts.push(`\nEDITORIAL PHILOSOPHY: ${data.editorial_philosophy}`);
    if (data.writing_influences) configParts.push(`\nWRITING INFLUENCES: ${data.writing_influences}`);
    if (data.voice_spectrum) configParts.push(`\nVOICE SPECTRUM: ${data.voice_spectrum}`);
    if (data.forbidden_phrases) configParts.push(`\nFORBIDDEN PHRASES: ${data.forbidden_phrases}`);
    if (data.quality_standards) configParts.push(`\nQUALITY STANDARDS: ${data.quality_standards}`);
    
    // ✨ Add author profiles directly from codebase
    try {
      const authorProfilesSection = buildAuthorProfilesSection();
      configParts.push(authorProfilesSection);
    } catch (error) {
      console.error('Error loading author profiles:', error);
      // Continue without author profiles if there's an error
    }
    
    // ✨ Add brand intelligence authorities directly from codebase
    try {
      const brandAuthoritiesSection = buildBrandAuthoritiesSection();
      configParts.push(brandAuthoritiesSection);
    } catch (error) {
      console.error('Error loading brand authorities:', error);
      // Continue without brand authorities if there's an error
    }
    
    return configParts.join('\n');
  } catch (error) {
    console.error('Error fetching Madison system config:', error);
    return '';
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Early check: GEMINI_API_KEY is required
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
  if (!GEMINI_API_KEY || GEMINI_API_KEY.trim() === '') {
    console.error('GEMINI_API_KEY is not configured in Supabase Edge Function secrets');
    return new Response(
      JSON.stringify({
        error: 'AI service is not configured. Please add GEMINI_API_KEY in Supabase Dashboard → Project Settings → Edge Functions → Secrets.',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Authenticate the request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('Missing Authorization header');
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Missing authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
    
    if (authError || !user) {
      console.error('Authentication failed:', authError?.message);
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Authenticated request from user: ${user.id}`);

    // Create a Supabase client with the user's token for RLS-scoped queries
    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    let messages: OpenAIMessage[];
    let userName: string | undefined;
    let mode: 'creative' | 'strategic';

    try {
      const body = await req.json() as { messages?: OpenAIMessage[]; userName?: string; mode?: string };
      messages = body.messages;
      userName = body.userName;
      mode = body.mode === 'strategic' ? 'strategic' : 'creative';

      if (!Array.isArray(messages) || messages.length === 0) {
        return new Response(
          JSON.stringify({ error: 'Request must include a non-empty messages array' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } catch (parseError) {
      console.error('Failed to parse request body:', parseError);
      return new Response(
        JSON.stringify({ error: 'Invalid request body. Expected JSON with messages array.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Think Mode chat request (${mode}), messages:`, messages.length);
    const lastMessageContent = messages[messages.length - 1]?.content;
    console.log('Last user message:', typeof lastMessageContent === 'string' ? lastMessageContent.substring(0, 100) : 'Non-string content');

    // Fetch Madison's system-wide training (legacy)
    const legacyMadisonConfig = await getMadisonSystemConfig();
    console.log('Legacy Madison config loaded:', legacyMadisonConfig ? `${legacyMadisonConfig.length} chars` : 'none');
    
    // Fetch Madison Masters context (new Three Silos architecture)
    let madisonStrategy = { copySquad: 'THE_STORYTELLERS' as const, primaryCopyMaster: 'PETERMAN_ROMANCE' };
    let madisonMasterContext = '';

    try {
      const supabaseForMasters = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const lastMessage = messages[messages.length - 1]?.content;
      const briefText = typeof lastMessage === 'string' ? lastMessage : '';

      const result = await getMadisonMasterContext(
        supabaseForMasters,
        undefined, // content type not specified in think mode
        briefText
      );
      madisonStrategy = result.strategy;
      madisonMasterContext = result.masterContext;
      console.log(`Madison Masters: ${madisonStrategy.copySquad}, Primary: ${madisonStrategy.primaryCopyMaster}`);
    } catch (mastersError) {
      console.warn('Madison Masters context failed, using defaults:', mastersError);
      // Continue with empty master context - strategic mode will still work
    }
    
    // Fetch User's Brand Context (Products, Knowledge, Config)
    let brandContext = "No brand context available.";
    let isBrandContextSparse = true;

    try {
      // 1. Fetch Brand Products (use supabaseUser for RLS-scoped org data)
      const { data: products, error: productsError } = await supabaseUser
        .from('brand_products')
        .select('name, collection, scent_family, description')
        .limit(5); // Fetch top 5 products for context

      // 2. Fetch Brand Knowledge (Voice, Guidelines)
      const { data: knowledge, error: knowledgeError } = await supabaseUser
        .from('brand_knowledge')
        .select('knowledge_type, content')
        .eq('is_active', true)
        .limit(3);

      // 3. Fetch Organization Brand Config
      const { data: orgs, error: orgError } = await supabaseUser
        .from('organizations')
        .select('brand_config')
        .limit(1)
        .maybeSingle();

      if (!productsError && !knowledgeError && !orgError) {
        const productList = products?.map(p => `- ${p.name} (${p.collection || 'No Collection'}): ${p.description || 'No Description'}`).join('\n') || "No products found.";
        const knowledgeList = knowledge?.map(k => `- ${k.knowledge_type}: ${JSON.stringify(k.content).substring(0, 100)}...`).join('\n') || "No specific brand knowledge found.";
        const brandConfig = orgs?.brand_config ? JSON.stringify(orgs.brand_config) : "No brand config found.";

        brandContext = `
=== CURRENT BRAND CONTEXT ===
PRODUCTS:
${productList}

KNOWLEDGE BASE:
${knowledgeList}

BRAND CONFIGURATION:
${brandConfig}
`;
        // Determine if context is sparse (simplistic check)
        if (products && products.length > 0) isBrandContextSparse = false;
        if (knowledge && knowledge.length > 0) isBrandContextSparse = false;
        if (orgs?.brand_config && Object.keys(orgs.brand_config).length > 0) isBrandContextSparse = false;
      }
    } catch (err) {
      console.error("Error fetching brand context:", err);
    }

    let systemContent = "";

    if (mode === 'strategic') {
      // STRATEGIC ADVISOR PROMPT
      systemContent = `You are Madison, a High-Level Strategic Business Advisor. You are no longer just an editor; you are a seasoned consultant helping business owners solve critical problems, scale operations, and find hidden assets.

=== YOUR STRATEGIC KNOWLEDGE ===
${STRATEGIC_FRAMEWORKS}

${brandContext}

=== CONTEXT AWARENESS & MISSING INFO ===
You have access to the User's "Current Brand Context" above.
${isBrandContextSparse ? `
WARNING: THE USER HAS SPARSE OR MISSING BRAND DOCUMENTATION.
- They may have skipped onboarding or only provided a name.
- BEFORE giving generic advice, you MUST Guide them to provide this info.
- STRATEGY: Use this session to "Interview" them about their brand (Target Audience, Unique Mechanism, Offer).
- INSTRUCTION: Encouragingly instruct them to add this data to the "Brand Knowledge Center" in Settings.
- Tell them: "To give you the best strategy, I need to know more about your business. Let's define that now, and then you can save it to your Brand Knowledge Center."
` : `
- The user has provided brand context. Use the specific product names and details from the context above to make your examples concrete.
`}

=== YOUR ROLE ===
Your goal is to provide clear, actionable, framework-driven advice. You are helping users who need templates, clear directions, and immediate solutions to "massive fires" or growth challenges.
Analyze their business, product line, or situation using the frameworks above.

=== YOUR APPROACH ===
1. DIAGNOSE: Identify the core constraint or opportunity. Is it a traffic problem? A conversion problem? A retention problem?
2. CHECK PREREQUISITES: If the user seems panicked or asks for "quick cash," STOP and verify their assets (list health, offer readiness) before giving a strategy. Don't throw them into the deep end.
3. APPLY FRAMEWORKS: Use Jay Abraham's 3 Pillars, or Peter Drucker's 5 Questions, or Tony Robbins' RPM to structure your answer.
4. BE DIRECT: Do not use fluff. Give specific steps.
5. SOLVE THE PROBLEM: If they need cash, focus on immediate revenue-generating activities (offers, reactivation). If they need scale, focus on systems and leverage.

=== TONE ===
- Authoritative but supportive (like a high-paid consultant).
- Analytical and precise.
- "The Strategy of Preeminence": You put their interests above your own transaction. You tell them the truth, even if it's hard.

=== OUTPUT FORMATTING ===
- Use clear headings (CAPITALIZED) to structure your advice.
- Use bullet points for steps.
- Keep paragraphs concise.
- NO markdown formatting (bold, italics) in the output text itself (the frontend renders plain text).
- CRITICAL: ALWAYS end your response with "Choose Your Next Step" and provide 2-3 distinct actionable paths.
- Format the options EXACTLY like this at the very end:
<<ACTION: Short Label | The prompt for the user to send next>>
<<ACTION: Another Label | Another prompt for the user>>

Example:
<<ACTION: Audit Assets | Help me audit my hidden assets>>
<<ACTION: Save to Brand Profile | Please summarize the brand details we just discussed so I can save them to my Knowledge Center>>
`;

    } else {
      // CREATIVE / BRAINSTORMING PROMPT (Think Mode with Madison Masters)
      systemContent = `You are Madison, Editorial Director at Madison Studio. You're helping users brainstorm and refine content ideas in Think Mode (Creative Brainstorming).

=== MADISON MASTERS — YOUR WRITING TRAINING ===
${madisonMasterContext}

=== SQUAD SYSTEM ===
You have been trained by the legendary Copy Masters. Based on the user's request, you'll naturally draw from:

THE_SCIENTISTS (Ogilvy, Hopkins, Caples):
${SQUAD_DEFINITIONS.THE_SCIENTISTS.philosophy}
Use for: ${SQUAD_DEFINITIONS.THE_SCIENTISTS.useWhen.join(', ')}

THE_STORYTELLERS (Peterman, Collier):
${SQUAD_DEFINITIONS.THE_STORYTELLERS.philosophy}
Use for: ${SQUAD_DEFINITIONS.THE_STORYTELLERS.useWhen.join(', ')}

THE_DISRUPTORS (Halbert, Bernbach):
${SQUAD_DEFINITIONS.THE_DISRUPTORS.philosophy}
Use for: ${SQUAD_DEFINITIONS.THE_DISRUPTORS.useWhen.join(', ')}

Currently routed to: ${madisonStrategy.copySquad} (${madisonStrategy.primaryCopyMaster})
`;
      
      systemContent += `
\n
CORE IDENTITY:
You're a seasoned creative professional with deep expertise in luxury fragrance, beauty, and personal care content. You learned your craft on Madison Avenue and bring decades of experience to every conversation.

YOUR ROLE IN THINK MODE - PROACTIVE BRAINSTORMING:
Think Mode is your creative studio. Your job is to IMMEDIATELY generate ideas, angles, and strategies—not wait for clarification. Take whatever the user gives you (even if it's vague or incomplete) and immediately start brainstorming concrete, actionable directions.

CRITICAL: ALWAYS GENERATE CONTENT
- Never say "I need more information" or "try again"
- Even from minimal input, immediately offer 2-3 specific angles or approaches
- Take initiative: if they mention "sustainability," immediately brainstorm 3-5 specific sustainability angles

PROACTIVE BRAINSTORMING APPROACH:
1. IMMEDIATELY identify 2-3 specific angles from their input
2. Offer concrete examples: "Here are three ways to approach this..."
3. Provide specific hooks, angles, or frameworks
4. Suggest audience segments or positioning strategies

VOICE CHARACTERISTICS:
- Measured confidence (calm, assured, never rushed)
- Warm but professional (supportive mentor, not cheerleader)
- Sophisticated without pretension (accessible expertise)
- Proactive and generative

FORBIDDEN:
- Marketing clichés (revolutionary, game-changing)
- Excessive enthusiasm (!!!, OMG)
- Vague responses
- Asking for clarification without first offering ideas

YOUR PHILOSOPHY:
The more facts you tell, the more you sell. Take whatever input you receive and immediately transform it into specific, actionable creative directions.

CRITICAL OUTPUT FORMATTING:
- Output PLAIN TEXT ONLY - absolutely NO markdown formatting
- NO bold (**text**), NO italics (*text*), NO headers (# or ##)
- NO decorative characters (━, ═, ╔, ║, •, ✦, etc.)
- NO bullet points with symbols - use simple hyphens if needed
- Write in clean, conversational prose as you would in an email
`;
    }
    
    // Add personalization if user name is provided
    if (userName) {
      systemContent += `\n\n(Note: You're speaking with ${userName}. Use their name naturally—especially in opening greetings ("Hi ${userName}!"), when praising good ideas ("That's insightful, ${userName}"), or when emphasizing key points. Keep it professional and warm.)`;
    }

    console.log('Calling streamGeminiTextResponse with system prompt length:', systemContent.length);
    console.log('Messages count:', messages.length);
    
    try {
      const completion = await generateGeminiContent({
        systemPrompt: systemContent,
        messages,
        temperature: mode === 'strategic' ? 0.5 : 0.65, // Lower temp for strategy
        maxOutputTokens: 2048,
      });

      const content = extractTextFromGeminiResponse(completion) ||
        "I'm sorry—I couldn't generate a response right now.";

      const stream = createOpenAISSEStream(content, 300);

      return new Response(stream, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        },
      });
    } catch (error) {
      console.error("Think Mode completion error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      if (errorMessage.includes("GEMINI_API_KEY") || errorMessage.includes("not configured")) {
        return new Response(
          JSON.stringify({ error: "AI service is not configured. Please contact support." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({ error: `Failed to generate response: ${errorMessage}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('Think Mode error:', err.message, err.stack);
    const isDev = Deno.env.get('DENO_ENV') === 'development';
    return new Response(
      JSON.stringify({
        error: err.message,
        ...(isDev && err.stack && { stack: err.stack }),
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});