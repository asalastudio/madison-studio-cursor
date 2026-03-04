import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { generateGeminiContent, extractTextFromGeminiResponse } from "../_shared/geminiClient.ts";
import { buildAuthorProfilesSection } from "../_shared/authorProfiles.ts";
import { buildBrandAuthoritiesSection } from "../_shared/brandAuthorities.ts";
import { getMadisonMasterContext, SQUAD_DEFINITIONS, CONTENT_TYPE_TO_SQUAD } from "../_shared/madisonMasters.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

// Helper function to fetch Madison's system training (STANDARDIZED)
async function getMadisonSystemConfig(supabaseClient: any) {
  try {
    const { data, error } = await supabaseClient
      .from('madison_system_config')
      .select('*')
      .limit(1)
      .maybeSingle();
    
    if (error || !data) return '';
    
    const configParts: string[] = [];
    configParts.push('\n╔══════════════════════════════════════════════════════════════════╗');
    configParts.push('║              MADISON\'S CORE EDITORIAL TRAINING                   ║');
    configParts.push('║         (Your foundational AI editorial guidelines)             ║');
    configParts.push('╚══════════════════════════════════════════════════════════════════╝');
    
    if (data.persona) {
      configParts.push('\n━━━ MADISON\'S PERSONA ━━━');
      configParts.push(data.persona);
    }
    if (data.editorial_philosophy) {
      configParts.push('\n━━━ EDITORIAL PHILOSOPHY ━━━');
      configParts.push(data.editorial_philosophy);
    }
    if (data.forbidden_phrases) {
      configParts.push('\n━━━ FORBIDDEN PHRASES (NEVER USE) ━━━');
      configParts.push(data.forbidden_phrases);
    }
    if (data.quality_standards) {
      configParts.push('\n━━━ QUALITY STANDARDS ━━━');
      configParts.push(data.quality_standards);
    }
    
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
    
    console.log('[BRAND CONTEXT] Madison system config loaded');
    return configParts.join('\n');
  } catch (error) {
    console.error('Error fetching Madison system config:', error);
    return '';
  }
}

// Helper function to build brand context from database (STANDARDIZED)
async function buildBrandContext(supabaseClient: any, organizationId: string) {
  try {
    console.log(`[BRAND CONTEXT] Fetching for organization: ${organizationId}`);
    
    // Fetch brand knowledge entries
    const { data: knowledgeData, error: knowledgeError } = await supabaseClient
      .from('brand_knowledge')
      .select('knowledge_type, content')
      .eq('organization_id', organizationId)
      .eq('is_active', true);
    
    if (knowledgeError) {
      console.error('Error fetching brand knowledge:', knowledgeError);
    }
    
    // ✨ BRAND KNOWLEDGE TRANSPARENCY LOGGING
    console.log('[BRAND KNOWLEDGE CHECK]', {
      organizationId,
      knowledgeCount: knowledgeData?.length || 0,
      knowledgeTypes: knowledgeData?.map((k: any) => k.knowledge_type) || [],
      totalBytes: knowledgeData?.reduce((sum: number, k: any) => 
        sum + JSON.stringify(k.content).length, 0
      ) || 0,
      priorityTypes: {
        hasBrandVoice: knowledgeData?.some((k: any) => k.knowledge_type === 'brand_voice'),
        hasVocabulary: knowledgeData?.some((k: any) => k.knowledge_type === 'vocabulary'),
        hasVisualStandards: knowledgeData?.some((k: any) => k.knowledge_type === 'visual_standards')
      }
    });
    
    // Fetch organization brand config
    const { data: orgData, error: orgError } = await supabaseClient
      .from('organizations')
      .select('name, brand_config')
      .eq('id', organizationId)
      .single();
    
    if (orgError) {
      console.error('Error fetching organization:', orgError);
    }
    
    // Build context string with consistent formatting
    const contextParts: string[] = [];
    
    contextParts.push('\n╔══════════════════════════════════════════════════════════════════╗');
    contextParts.push('║          MANDATORY BRAND GUIDELINES - FOLLOW EXACTLY             ║');
    contextParts.push('║         (Client-specific brand voice and requirements)           ║');
    contextParts.push('╚══════════════════════════════════════════════════════════════════╝');
    
    if (orgData?.name) {
      contextParts.push(`\n✦ ORGANIZATION: ${orgData.name}`);
    }
    
    // Add brand knowledge sections with proper structure
    if (knowledgeData && knowledgeData.length > 0) {
      const knowledgeMap = new Map();
      knowledgeData.forEach((k: any) => knowledgeMap.set(k.knowledge_type, k.content));
      
      // PRIORITY 1: Brand Voice
      const voiceData = knowledgeMap.get('brand_voice') as any;
      if (voiceData) {
        contextParts.push('\n━━━ BRAND VOICE PROFILE (HIGHEST PRIORITY) ━━━');
        if (voiceData.toneAttributes) contextParts.push(`✦ Tone: ${voiceData.toneAttributes.join(', ')}`);
        if (voiceData.writingStyle) contextParts.push(`✦ Style: ${voiceData.writingStyle}`);
      }
      
      // PRIORITY 2: Vocabulary
      const vocabularyData = knowledgeMap.get('vocabulary') as any;
      if (vocabularyData) {
        contextParts.push('\n━━━ VOCABULARY RULES ━━━');
        if (vocabularyData.forbiddenPhrases) {
          contextParts.push('✦ FORBIDDEN PHRASES (NEVER USE):');
          vocabularyData.forbiddenPhrases.forEach((phrase: string) => {
            contextParts.push(`   ✗ "${phrase}"`);
          });
        }
      }
      
      // Add other knowledge types
      for (const [type, content] of knowledgeMap.entries()) {
        if (type !== 'brand_voice' && type !== 'vocabulary') {
          contextParts.push(`\n━━━ ${type.toUpperCase().replace(/_/g, ' ')} ━━━`);
          if (typeof content === 'object') {
            contextParts.push(JSON.stringify(content, null, 2));
          } else {
            contextParts.push(String(content));
          }
        }
      }
    }
    
    // Add brand colors if available
    if (orgData?.brand_config) {
      const config = orgData.brand_config as any;
      if (config.brand_colors) {
        contextParts.push('\n━━━ VISUAL STANDARDS ━━━');
        contextParts.push(`✦ BRAND COLORS: ${config.brand_colors.join(', ')}`);
      }
    }
    
    const fullContext = contextParts.join('\n');
    console.log(`[BRAND CONTEXT] Built ${fullContext.length} characters, ${knowledgeData?.length || 0} knowledge entries`);
    
    return fullContext;
  } catch (error) {
    console.error('Error building brand context:', error);
    return '';
  }
}

const TRANSFORMATION_PROMPTS = {
  email: `Transform this master content into an email newsletter.

TRANSFORMATION REQUIREMENTS:
- Condense to 30-40% of original length (target: 400-500 words)
- Add personalized opening that engages the reader
- Convert headings into flowing sentences (no formal headers)
- Add clear call-to-action at the end
- Maintain brand voice and tone throughout

STRUCTURE:
1. Personal greeting
2. Hook (main concept from master content)
3. 2-3 key insights (condensed from master)
4. Clear CTA with next step
5. Signature line

Generate 3 subject line options in this format at the start:
SUBJECT LINE 1: [question format]
SUBJECT LINE 2: [statement format]
SUBJECT LINE 3: [intrigue format]

PREVIEW TEXT: [40-60 characters]

Then generate the email body.`,

  instagram: `Repurpose this content for Instagram carousel format (5 slides + caption).

TRANSFORMATION REQUIREMENTS:
- Extract 4-5 key concepts that work as standalone slides
- Slide 1: Visual hook (one powerful statement, max 10 words)
- Slides 2-4: One insight per slide (max 30 words each, punchy)
- Slide 5: Clear call-to-action
- Caption: Condensed narrative version (150 words max)
- Include relevant hashtags based on content theme

SLIDE DESIGN NOTES:
- Each slide must capture attention on its own
- Use short sentences for clarity
- Build narrative: Slide 1 hooks → 2-4 develop → 5 invites action

CAPTION STRUCTURE:
1. Engaging opening
2. Core message (condensed from master)
3. Call to action
4. Relevant hashtags (3-5)

Format your response as:
SLIDE 1: [text]
SLIDE 2: [text]
SLIDE 3: [text]
SLIDE 4: [text]
SLIDE 5: [text]

CAPTION: [text with hashtags at the end]`,

  twitter: `Break this content into a Twitter/X thread (8-12 tweets) maintaining narrative flow.

THREAD REQUIREMENTS:
- Tweet 1: Most compelling hook from content (must stop scroll)
- Tweets 2-9: Build argument/story progressively
- Each tweet stands alone but connects to thread
- Tweet 10-12: Summary + CTA + link back
- Each tweet max 280 characters (aim for 240-260 for readability)

THREAD STRUCTURE:
1. Hook (provocation or question)
2-3. Problem statement or context
4-6. Solution or key insights
7-9. Supporting evidence or benefits
10. Summary
11. CTA + link

CONSTRAINTS:
- Maintain brand voice throughout
- Each tweet builds momentum
- No hashtags in thread body
- Link only in final tweet

Format as:
TWEET 1: [text]
TWEET 2: [text]
etc.`,

  product: `Adapt this content into a compelling product description.

TRANSFORMATION REQUIREMENTS:
Follow this structure:
1. Opening statement (2-3 sentences capturing product essence)
2. Key features and benefits
3. Emotional or experiential context (1-2 sentences)

CONSTRAINTS:
- Max 150 words total
- Extract the most product-relevant content
- Maintain brand voice and tone

Generate product description now.`,

  sms: `Ultra-condense this content to a single SMS message (160 characters max).

REQUIREMENTS:
- Extract ONE most powerful concept
- Include clear CTA with link placeholder [LINK]
- Maintain brand voice despite brevity
- Must feel authentic and compelling

FORMAT:
[Core concept in 8-12 words]. [CTA + link].

Generate 3 SMS options, each under 160 chars.`,

  linkedin: `Adapt this content for LinkedIn with a professional tone.

TRANSFORMATION REQUIREMENTS:
- Condense to 40% of original length (target: 400-600 words)
- Opening: Professional insight or industry observation
- Body: 2-3 paragraphs with core argument
- Tone: Professional yet authentic
- Closing: Clear takeaway + link

STRUCTURE:
1. First line: Engaging hook (professional context)
2. 2-3 paragraphs: Core argument from master content
3. Closing: Key insight or call to action
4. Link: "Read more: [URL]"

CONSTRAINTS:
- Maintain brand voice
- Avoid corporate jargon
- Keep content professional yet engaging
- Word count: 400-600 words

Generate LinkedIn post now.`,

  email_3part: `Transform this master content into a 3-part email sequence following the Welcome/Value/Invitation framework.

SEQUENCE STRUCTURE:
EMAIL 1 - THE WELCOME (Day 1):
- Subject: Warm, intriguing introduction
- Body: Establish relationship, set expectations, hint at journey ahead
- Tone: Welcoming and engaging
- CTA: "Tomorrow, we explore [key concept]"
- Length: 300-400 words

EMAIL 2 - THE VALUE (Day 3):
- Subject: Promise delivery from Email 1
- Body: Core philosophy/insight from master content (condensed 50%)
- Tone: This is what we believe, why it matters
- CTA: "One more thing to share with you"
- Length: 400-500 words

EMAIL 3 - THE INVITATION (Day 5):
- Subject: Clear call to action
- Body: Synthesize journey, extend invitation to engage further
- Tone: Confident without pressure
- CTA: Clear next step (visit collection, read full post, etc.)
- Length: 300-400 words

SEQUENCE CONSISTENCY:
- Maintain narrative thread across all 3 emails
- Each email must stand alone but build on previous
- Reference previous emails: "As I mentioned..." "Remember when..."
- Use consistent brand voice throughout

TIMING NOTES:
- Day 1, Day 3, Day 5 (2-day gaps between emails)

OUTPUT FORMAT:
EMAIL 1:
SUBJECT: [subject line]
PREVIEW: [40-60 chars]
BODY: [email content]

EMAIL 2:
SUBJECT: [subject line]
PREVIEW: [40-60 chars]
BODY: [email content]

EMAIL 3:
SUBJECT: [subject line]
PREVIEW: [40-60 chars]
BODY: [email content]

Generate the complete 3-part sequence now.`,

  email_5part: `Transform this master content into a 5-part email sequence following the extended nurture framework.

SEQUENCE STRUCTURE:
EMAIL 1 - THE OPENING (Day 1):
- Subject: Provocative question or observation
- Body: Hook reader, promise transformation of understanding
- Tone: Engaging and thought-provoking
- CTA: "Tomorrow: Why this matters to you"
- Length: 250-350 words

EMAIL 2 - THE PROBLEM (Day 2):
- Subject: Identify the challenge or pain point
- Body: Articulate what's broken in current paradigm
- Tone: Empathetic critique, not angry rant
- CTA: "There's another way..."
- Length: 350-450 words

EMAIL 3 - THE SOLUTION (Day 4):
- Subject: Introduce your philosophy/approach
- Body: Core content from master (condensed 40%)
- Tone: "This is how we do it differently"
- CTA: "Let me show you what this looks like in practice"
- Length: 400-500 words

EMAIL 4 - THE PROOF (Day 6):
- Subject: Evidence, testimonial, deeper dive
- Body: Expand on one key pillar or benefit from master content
- Tone: Confident and evidence-based
- CTA: "One final insight tomorrow"
- Length: 350-450 words

EMAIL 5 - THE INVITATION (Day 8):
- Subject: Clear next step
- Body: Synthesize journey, extend specific invitation
- Tone: Confident with clear value proposition
- CTA: Clear action (visit collection, book consultation, etc.)
- Length: 300-400 words

SEQUENCE CONSISTENCY:
- Build narrative tension: problem → solution → proof → invitation
- Reference previous emails to create continuity
- Each email must deliver standalone value
- Maintain consistent brand voice throughout

TIMING NOTES:
- Days 1, 2, 4, 6, 8 (varied spacing for rhythm)

OUTPUT FORMAT:
EMAIL 1:
SUBJECT: [subject line]
PREVIEW: [40-60 chars]
BODY: [email content]

EMAIL 2:
SUBJECT: [subject line]
PREVIEW: [40-60 chars]
BODY: [email content]

EMAIL 3:
SUBJECT: [subject line]
PREVIEW: [40-60 chars]
BODY: [email content]

EMAIL 4:
SUBJECT: [subject line]
PREVIEW: [40-60 chars]
BODY: [email content]

EMAIL 5:
SUBJECT: [subject line]
PREVIEW: [40-60 chars]
BODY: [email content]

Generate the complete 5-part sequence now.`,

  email_7part: `Transform this master content into a 7-part email sequence following the deep dive journey framework.

SEQUENCE STRUCTURE:
EMAIL 1 - THE ARRIVAL (Day 1):
- Subject: "Welcome to something different"
- Body: Welcome, set expectations for 2-week journey
- Tone: Welcoming and engaging
- CTA: "Tomorrow: A question to ponder"
- Length: 200-300 words

EMAIL 2 - THE QUESTION (Day 2):
- Subject: Provocative question that reframes thinking
- Body: Challenge assumptions, introduce tension
- Tone: Thoughtful provocation
- CTA: "More tomorrow"
- Length: 250-350 words

EMAIL 3 - THE CONTEXT (Day 4):
- Subject: Historical/cultural background
- Body: "How did we get here?" - Set up the problem
- Tone: Editorial and informative
- CTA: "Next: The turning point"
- Length: 400-500 words

EMAIL 4 - THE PHILOSOPHY (Day 6):
- Subject: Core belief system
- Body: Main content from master (condensed 30%)
- Tone: "This is what we believe and why"
- CTA: "Let me show you how this works"
- Length: 500-600 words

EMAIL 5 - THE PRACTICE (Day 8):
- Subject: Practical application
- Body: "Here's how to apply this philosophy"
- Tone: Instructive and helpful
- CTA: "Tomorrow: Real-world proof"
- Length: 400-500 words

EMAIL 6 - THE EVIDENCE (Day 10):
- Subject: Testimonials, case studies, deeper dive
- Body: Social proof + expanded pillar content
- Tone: Evidence-based and inspiring
- CTA: "Final invitation tomorrow"
- Length: 350-450 words

EMAIL 7 - THE THRESHOLD (Day 12):
- Subject: "Ready to take the next step?"
- Body: Synthesize entire journey, clear call to action
- Tone: Confident invitation with clear value
- CTA: Specific next step (visit collection, consultation, etc.)
- Length: 300-400 words

SEQUENCE CONSISTENCY:
- Arc from curiosity → understanding → action
- Rich narrative through-line across all 7 emails
- Each email references previous journey steps
- Deep exploration of key concepts
- Maintain consistent brand voice throughout

TIMING NOTES:
- Days 1, 2, 4, 6, 8, 10, 12 (2-day gaps after Email 2)

OUTPUT FORMAT:
EMAIL 1:
SUBJECT: [subject line]
PREVIEW: [40-60 chars]
BODY: [email content]

EMAIL 2:
SUBJECT: [subject line]
PREVIEW: [40-60 chars]
BODY: [email content]

EMAIL 3:
SUBJECT: [subject line]
PREVIEW: [40-60 chars]
BODY: [email content]

EMAIL 4:
SUBJECT: [subject line]
PREVIEW: [40-60 chars]
BODY: [email content]

EMAIL 5:
SUBJECT: [subject line]
PREVIEW: [40-60 chars]
BODY: [email content]

EMAIL 6:
SUBJECT: [subject line]
PREVIEW: [40-60 chars]
BODY: [email content]

EMAIL 7:
SUBJECT: [subject line]
PREVIEW: [40-60 chars]
BODY: [email content]

Generate the complete 7-part sequence now.`,

  tiktok: `Transform this master content into a TikTok video script (30-60 seconds).

TRANSFORMATION REQUIREMENTS:
- Write as a spoken script (natural, conversational speech)
- Hook in first 3 seconds (question, surprising fact, or bold statement)
- Keep total script under 300 characters for 60-second video
- Visual cues in brackets [like this] for editor
- Maintain brand voice while being authentic and engaging

SCRIPT STRUCTURE:
1. HOOK (0-3 sec): Attention-grabbing opening
2. SETUP (3-15 sec): Context or problem statement
3. CONTENT (15-45 sec): Core insight from master content
4. CTA (45-60 sec): Clear next step or invitation

TONE GUIDELINES:
- Authentic, not overly produced
- Conversational but still on-brand
- Can be educational, inspirational, or storytelling
- NO corporate speak or jargon

VISUAL NOTES:
- Include [VISUAL: description] for key moments
- Suggest text overlays where helpful
- Note any product shots or b-roll needs

OUTPUT FORMAT:
HOOK: [first 3 seconds]
[VISUAL: ...]

SETUP: [context]
[VISUAL: ...]

CONTENT: [main message]
[VISUAL: ...]

CTA: [call to action]
[VISUAL: ...]

Generate the TikTok script now.`,

  pinterest: `Adapt this content into a compelling Pinterest pin description.

TRANSFORMATION REQUIREMENTS:
- Extract the most visually compelling angle from master content
- Front-load the most important information (first 50 chars visible)
- Include relevant keywords naturally for search
- Target length: 300-500 characters
- Add subtle CTA to click through

DESCRIPTION STRUCTURE:
1. Opening (first 50 chars): Most compelling visual/benefit hook
2. Middle: Expand on the concept, add context or details
3. Closing: Gentle CTA with link invitation

PINTEREST BEST PRACTICES:
- Think visual-first: what would make someone stop scrolling?
- Use natural keywords (not hashtags on Pinterest)
- Emphasize inspiration, education, or aspiration
- Keep brand voice but optimize for discovery

TONE:
- Inspirational yet practical
- Authentic and relatable
- Avoid hard selling

Generate the Pinterest pin description now.`,

  youtube: `Transform this master content into a YouTube video description optimized for SEO and engagement.

TRANSFORMATION REQUIREMENTS:
- Condense main content into compelling video description (600-800 words)
- Front-load the most important information (first 150 characters are critical)
- Include natural keywords for SEO without keyword stuffing
- Add timestamps for key sections
- Include relevant links and CTAs
- Maintain brand voice while optimizing for discovery

DESCRIPTION STRUCTURE:
1. Opening Hook (first 150 chars): Compelling reason to watch - visible before "show more"
2. Video Overview (100-150 words): What viewers will learn/gain
3. Key Timestamps (5-8 sections): 
   [00:00] Introduction
   [01:30] Main concept
   [03:45] Key insight #1
   etc.
4. Detailed Breakdown (300-400 words): Expand on main points from master content
5. About Section (50-100 words): Brief brand/creator context
6. CTAs & Links:
   - Subscribe message
   - Related videos/playlists
   - Website/social links
   - Product links if relevant

SEO OPTIMIZATION:
- Include primary keyword in first sentence
- Use related keywords naturally throughout
- Add relevant hashtags (3-5 max)
- Keep it readable and engaging (SEO serves humans first)

TONE:
- Authentic and conversational
- Educational yet engaging
- Professional but approachable
- Maintain brand voice throughout

OUTPUT FORMAT:
[First 150 characters - the hook]

VIDEO OVERVIEW:
[What this video covers]

⏱️ TIMESTAMPS:
[00:00] Introduction
[XX:XX] Section name
[XX:XX] Section name
...

[Detailed breakdown - main content]

ABOUT:
[Brief brand/creator info]

🔗 LINKS & RESOURCES:
[Relevant links]

CONNECT:
[Social media handles]

#Hashtag1 #Hashtag2 #Hashtag3

Generate the YouTube video description now.`,

  facebook: `Transform this master content into an engaging Facebook post that drives community interaction.

TRANSFORMATION REQUIREMENTS:
- Condense to 30-40% of original length (target: 400-600 words)
- Opening must stop the scroll (question, surprising fact, relatable moment)
- Structure for readability with short paragraphs (2-3 sentences max)
- Include natural conversation starters
- Add clear CTA but make it feel organic
- Optimize for comments and shares

POST STRUCTURE:
1. Hook (1-2 sentences): Grab attention immediately - question, bold statement, or relatable scenario
2. Story/Context (2-3 short paragraphs): Share the core insight from master content in conversational tone
3. Value Delivery (2-3 paragraphs): Key takeaways or benefits, make it actionable
4. Community Prompt: Ask a question or invite opinions to drive comments
5. CTA: Soft invitation to learn more, visit link, or tag a friend

FACEBOOK BEST PRACTICES:
- Write like you're talking to a friend (conversational, warm)
- Use line breaks for readability (mobile-first formatting)
- Include 1-2 emoji for personality (don't overdo it)
- Ask questions to encourage comments
- Make shares feel natural ("Tag someone who needs to hear this")
- Keep brand voice but prioritize authenticity

ENGAGEMENT TACTICS:
- Pose a discussion question related to main content
- Invite personal stories/experiences in comments
- Create "tag a friend" moments
- Use light humor or relatable observations where appropriate

TONE:
- Warm and conversational
- Authentic, not corporate
- Community-focused
- Blend education with entertainment
- Maintain brand voice while feeling personal

OUTPUT FORMAT:
[Hook - 1-2 punchy sentences]

[Story/context paragraph]

[Value delivery paragraphs with line breaks for mobile readability]

[Community prompt - question or invitation]

[Soft CTA]

[Optional: 1-2 relevant hashtags]

Generate the Facebook post now.`,
};

// Utility: strip Markdown and common formatting to plain text
const stripMarkdown = (text: string): string => {
  return text
    // Bold/italics
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    // Headings
    .replace(/^#{1,6}\s*/gm, '')
    // Code fences and inline code
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    // Links and images
    .replace(/!\[[^\]]*\]\([^\)]*\)/g, '')
    .replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '$1')
    // Blockquotes and HRs
    .replace(/^>\s?/gm, '')
    .replace(/^(-{3,}|\*{3,}|_{3,})$/gm, '')
    // Lists (bulleted and ordered)
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    // Extra whitespace
    .replace(/[\t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 200,
      headers: corsHeaders 
    });
  }

  try {
    const { masterContentId, derivativeTypes, masterContent } = await req.json();
    
    const authHeader = req.headers.get('Authorization');
    console.log('Auth header present:', !!authHeader);
    
    if (!authHeader) {
      console.error('Missing authorization header');
      return new Response(JSON.stringify({ 
        error: 'Missing authorization header',
        success: false,
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { 
        global: { 
          headers: { Authorization: authHeader } 
        },
        auth: {
          persistSession: false
        }
      }
    );

    // Get user using the bearer token explicitly to avoid session issues
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError) {
      console.error('Auth error:', userError);
      return new Response(JSON.stringify({ 
        error: 'Authentication failed: ' + userError.message,
        success: false,
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    if (!user) {
      console.error('No user found');
      return new Response(JSON.stringify({ 
        error: 'User not authenticated',
        success: false,
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Repurposing content for user ${user.id}, master: ${masterContentId}`);
    console.log(`Derivative types requested:`, derivativeTypes);

    // Fetch master content to get organization_id
    const { data: masterContentRecord, error: masterError } = await supabaseClient
      .from('master_content')
      .select('organization_id')
      .eq('id', masterContentId)
      .single();

    if (masterError || !masterContentRecord) {
      console.error('Error fetching master content:', masterError);
      return new Response(JSON.stringify({ 
        error: 'Master content not found or unauthorized',
        success: false,
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Using organization_id: ${masterContentRecord.organization_id}`);

    // Check for Gemini first (cost-effective), fallback to Anthropic
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    
    if (!GEMINI_API_KEY && !ANTHROPIC_API_KEY) {
      throw new Error('Neither GEMINI_API_KEY nor ANTHROPIC_API_KEY is configured');
    }
    
    const DEFAULT_ANTHROPIC_MODEL = 'claude-3-haiku-20240307';
    const configuredAnthropicModel = Deno.env.get('ANTHROPIC_MODEL') || DEFAULT_ANTHROPIC_MODEL;
    const useGemini = !!GEMINI_API_KEY;

    // Fetch brand context for consistent voice
    const brandContext = await buildBrandContext(supabaseClient, masterContentRecord.organization_id);

    const results: any[] = [];

    // Generate each derivative type
    for (const derivativeType of derivativeTypes) {
      console.log(`Generating ${derivativeType} derivative...`);
      
      const transformationPrompt = TRANSFORMATION_PROMPTS[derivativeType as keyof typeof TRANSFORMATION_PROMPTS];
      if (!transformationPrompt) {
        console.warn(`No transformation prompt for type: ${derivativeType}`);
        continue;
      }

      // Build context
      let contextInfo = '';
      if (masterContent.collection) {
        contextInfo += `\nCOLLECTION: ${masterContent.collection}`;
      }
      if (masterContent.dip_week) {
        contextInfo += `\nDIP WEEK: Week ${masterContent.dip_week}`;
      }
      if (masterContent.pillar_focus) {
        contextInfo += `\nPILLAR FOCUS: ${masterContent.pillar_focus}`;
      }

      const fullPrompt = `${transformationPrompt}
\n${contextInfo}
\nIMPORTANT OUTPUT RULES:\n- Return PLAIN TEXT only.\n- Do NOT use any Markdown or markup (no **bold**, *italics*, # headings, lists, or backticks).\n- Keep labels like SLIDE 1:, TWEET 1:, SUBJECT LINE 1: as plain text when applicable.\n\nMASTER CONTENT:\n${masterContent.full_content}\n\nGenerate the ${derivativeType} version now.`;

      // Build brand-aware system prompt with Codex v2 and Madison Masters
      
      // Map derivative types to content types for squad routing
      const derivativeToContentType: Record<string, string> = {
        'email': 'product_description',
        'email_3part': 'product_description',
        'email_5part': 'product_description',
        'email_7part': 'product_description',
        'instagram': 'instagram_caption',
        'twitter': 'social_post',
        'product': 'product_description',
        'sms': 'ad_copy',
        'linkedin': 'social_post',
        'tiktok': 'ad_copy',
        'pinterest': 'social_post',
        'youtube': 'product_description',
        'facebook': 'social_post',
      };
      
      const contentTypeForRouting = derivativeToContentType[derivativeType] || 'product_description';
      
      // Fetch Madison Masters context (new Three Silos architecture)
      const supabaseForMasters = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      
      const { strategy: madisonStrategy, masterContext: madisonMasterContext } = await getMadisonMasterContext(
        supabaseForMasters,
        contentTypeForRouting,
        masterContent.full_content || ''
      );
      
      console.log(`[Madison Masters] Routed to: ${madisonStrategy.copySquad}, Primary: ${madisonStrategy.primaryCopyMaster}`);
      
      let systemPrompt = `╔══════════════════════════════════════════════════════════════════╗
║           MADISON MASTERS — COPY TRAINING                        ║
╚══════════════════════════════════════════════════════════════════╝

${madisonMasterContext}

╔══════════════════════════════════════════════════════════════════╗
║                      GLOBAL SYSTEM PROMPT                         ║
║                        (Codex v2 — Universal)                     ║
╚══════════════════════════════════════════════════════════════════╝

CORE PRINCIPLES:

1. Clarity & Specificity
   - Always prefer concrete details over vague adjectives
   - Replace generalizations ("great," "amazing") with tangible attributes

2. Respect Intelligence
   - Assume the audience is sophisticated
   - Never condescend, oversimplify, or use filler hype

3. Understated Elegance
   - Quality is implied through substance, not shouted through superlatives
   - Vary rhythm and structure; avoid monotony

4. Accuracy First
   - Prioritize truthfulness, fact-checking, and alignment with provided brand or industry data

BANNED WORDS (Universal):

Aggressively avoid the following categories:
- AI clichés: unlock, unleash, delve, tapestry, elevate, landscape
- Marketing clichés: game-changing, revolutionary, must-have, seamlessly, holy grail
- Empty adjectives: amazing, beautiful, incredible, fantastic

EVALUATION CHECKLIST:

Before final output, verify:
✓ Is the copy specific and free of vague adjectives?
✓ Does it avoid banned words?
✓ Is the rhythm and structure varied?
✓ Is it factually accurate?

OUTPUT RULES:

- Return clean, copy-paste ready text with NO Markdown formatting
- No asterisks, bold, italics, headers, or special formatting
- No emojis, no excessive enthusiasm
- ONLY the requested copy content

You are a precise editorial assistant following Codex v2 Universal Principles and the Madison Masters training above. Follow instructions exactly and return clean text.`;
      
      // Fetch Madison's legacy system-wide training (for backward compatibility)
      const madisonSystemConfig = await getMadisonSystemConfig(supabaseClient);
      
      if (brandContext) {
        systemPrompt = `${madisonSystemConfig}

${brandContext}

╔══════════════════════════════════════════════════════════════════╗
║                      GLOBAL SYSTEM PROMPT                         ║
║                        (Codex v2 — Universal)                     ║
╚══════════════════════════════════════════════════════════════════╝

IDENTITY & ROLE:

**Ghostwriter**: Generates first drafts of manuscripts, assets, and editions. Produces copy aligned to brand DNA and task schema.

CORE PRINCIPLES:

1. Clarity & Specificity
   - Always prefer concrete details over vague adjectives
   - Replace generalizations ("great," "amazing") with tangible attributes

2. Respect Intelligence
   - Assume the audience is sophisticated
   - Never condescend, oversimplify, or use filler hype

3. Understated Elegance
   - Quality is implied through substance, not shouted through superlatives
   - Vary rhythm and structure; avoid monotony

4. Accuracy First
   - Prioritize truthfulness, fact-checking, and alignment with provided brand or industry data

WORKFLOW (Universal Sequence):

1. Analyze → Read the task, brand DNA, and industry baseline
2. Context → Identify audience, medium, and purpose
3. Angle → Choose a narrative or rhetorical angle appropriate to the task
4. Voice → Adopt the brand's voice and tone, respecting do's/don'ts
5. Draft → Compose the copy according to schema
6. Self-Review → Check banned words, tone alignment, specificity, rhythm. Revise

BANNED WORDS (Universal):

Aggressively avoid the following categories:
- AI clichés: unlock, unleash, delve, tapestry, elevate, landscape
- Marketing clichés: game-changing, revolutionary, must-have, seamlessly, holy grail
- Empty adjectives: amazing, beautiful, incredible, fantastic

EVALUATION CHECKLIST:

Before final output, verify:
✓ Is the copy specific and free of vague adjectives?
✓ Does it align with the injected Brand DNA pillars?
✓ Does it avoid banned words?
✓ Is the rhythm and structure varied?
✓ Is it factually accurate?

OUTPUT RULES:

- Always return text in the required schema (email, social, product, etc.)
- Stay concise where schema limits apply
- Return clean, copy-paste ready text with NO Markdown formatting
- No asterisks, bold, italics, headers, or special formatting
- No emojis, no excessive enthusiasm
- ONLY the requested copy content

=== YOUR ROLE AS GHOSTWRITER ===

You are the official editorial assistant for this organization with ABSOLUTE adherence to:
1. Brand guidelines above
2. Codex v2 Universal Principles
3. The transformation instructions provided

INSTRUCTIONS:
- Always adhere to Codex v2 banned words list
- Always adhere to the brand voice guidelines provided
- Use approved vocabulary and avoid forbidden terms as specified
- Maintain tone consistency with the brand personality
- Follow transformation instructions exactly and return clean text
- Verify specificity over vague generalizations

FAILURE TO FOLLOW CODEX V2 PRINCIPLES OR BRAND GUIDELINES IS UNACCEPTABLE.`;
      }

      // Call Gemini first (cost-effective), fallback to Anthropic
      const callGemini = async () => {
        console.log(`Calling Gemini for ${derivativeType}...`);
        try {
          const geminiResponse = await generateGeminiContent({
            model: 'models/gemini-2.5-flash',
            systemPrompt,
            messages: [{ role: 'user', content: fullPrompt }],
            maxOutputTokens: 1200,
            temperature: 0.7,
          });
          return extractTextFromGeminiResponse(geminiResponse);
        } catch (error) {
          console.error(`Gemini error for ${derivativeType}:`, error);
          throw error;
        }
      };

      const callAnthropic = async (model: string) => {
        console.log(`Calling Anthropic with model: ${model}`);
        return await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': ANTHROPIC_API_KEY!,
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model,
            max_tokens: 1200,
            system: systemPrompt,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: fullPrompt,
                  },
                ],
              },
            ],
          }),
        });
      };

      let generatedContent = '';
      
      // Try Gemini first if available
      if (useGemini) {
        try {
          generatedContent = await callGemini();
          console.log(`✅ Gemini generated ${derivativeType} successfully`);
        } catch (geminiError) {
          console.warn(`Gemini failed for ${derivativeType}, falling back to Anthropic:`, geminiError);
          // Fallback to Anthropic
          if (!ANTHROPIC_API_KEY) {
            throw new Error(`Gemini failed and ANTHROPIC_API_KEY not configured: ${geminiError}`);
          }
          let modelToUse = configuredAnthropicModel;
          let aiResponse = await callAnthropic(modelToUse);

          // If the configured model isn't available, fall back automatically
          if (aiResponse.status === 404 && modelToUse !== DEFAULT_ANTHROPIC_MODEL) {
            console.warn(`Anthropic model ${modelToUse} not found. Falling back to ${DEFAULT_ANTHROPIC_MODEL}.`);
            modelToUse = DEFAULT_ANTHROPIC_MODEL;
            aiResponse = await callAnthropic(modelToUse);
          }

          if (!aiResponse.ok) {
            const t = await aiResponse.text();
            console.error(`AI gateway error for ${derivativeType}:`, aiResponse.status, t);
            if (aiResponse.status === 429) throw new Error('AI rate limits exceeded. Please wait a moment and retry.');
            if (aiResponse.status === 402) throw new Error('AI billing error: please verify your API account.');
            throw new Error(`AI gateway error: ${aiResponse.status}`);
          }

          const aiData = await aiResponse.json();
          generatedContent = aiData.content?.[0]?.text ?? '';
        }
      } else {
        // Use Anthropic directly
        if (!ANTHROPIC_API_KEY) {
          throw new Error('ANTHROPIC_API_KEY not configured');
        }
        let modelToUse = configuredAnthropicModel;
        let aiResponse = await callAnthropic(modelToUse);

        // If the configured model isn't available, fall back automatically
        if (aiResponse.status === 404 && modelToUse !== DEFAULT_ANTHROPIC_MODEL) {
          console.warn(`Anthropic model ${modelToUse} not found. Falling back to ${DEFAULT_ANTHROPIC_MODEL}.`);
          modelToUse = DEFAULT_ANTHROPIC_MODEL;
          aiResponse = await callAnthropic(modelToUse);
        }

        if (!aiResponse.ok) {
          const t = await aiResponse.text();
          console.error(`AI gateway error for ${derivativeType}:`, aiResponse.status, t);
          if (aiResponse.status === 429) throw new Error('Anthropic rate limits exceeded. Please wait a moment and retry.');
          if (aiResponse.status === 402) throw new Error('Anthropic billing error: please verify your Anthropic account.');
          throw new Error(`AI gateway error: ${aiResponse.status}`);
        }

        const aiData = await aiResponse.json();
        generatedContent = aiData.content?.[0]?.text ?? '';
      }

      const cleanedContent = stripMarkdown(generatedContent);

      // Parse platform-specific specs (from cleaned text to avoid markdown tokens)
      let platformSpecs: any = {};
      if (derivativeType === 'email') {
        const subjectMatch = cleanedContent.match(/SUBJECT LINE \d+: (.+)/g);
        const previewMatch = cleanedContent.match(/PREVIEW TEXT: (.+)/);
        platformSpecs = {
          subjectLines: subjectMatch?.map((s: string) => s.replace(/SUBJECT LINE \d+: /, '').trim()) || [],
          previewText: previewMatch?.[1]?.trim() || '',
        };
      } else if (derivativeType === 'instagram') {
        const slides = cleanedContent.match(/SLIDE \d+: (.+)/g);
        const captionMatch = cleanedContent.match(/CAPTION: ([\s\S]+)/);
        platformSpecs = {
          slideCount: slides?.length || 5,
          slides: slides?.map((s: string) => s.replace(/SLIDE \d+: /, '').trim()) || [],
          caption: captionMatch?.[1]?.trim() || '',
        };
      } else if (derivativeType === 'twitter') {
        const tweets = cleanedContent.match(/TWEET \d+: (.+)/g);
        platformSpecs = {
          tweetCount: tweets?.length || 0,
          tweets: tweets?.map((t: string) => t.replace(/TWEET \d+: /, '').trim()) || [],
        };
      } else if (derivativeType === 'sms') {
        const smsOptions = cleanedContent.split('\n').filter((line: string) => line.trim() && !line.startsWith('REQUIREMENTS') && !line.startsWith('FORMAT'));
        platformSpecs = { options: smsOptions.slice(0, 3) };
      } else if (derivativeType === 'email_3part' || derivativeType === 'email_5part' || derivativeType === 'email_7part') {
        // More permissive regex to handle variations in formatting
        const emailMatches = cleanedContent.match(/EMAIL\s+\d+:?\s*[\r\n]+SUBJECT:?\s*(.+?)[\r\n]+PREVIEW:?\s*(.+?)[\r\n]+BODY:?\s*([\s\S]+?)(?=EMAIL\s+\d+:|$)/gi);
        const emails = emailMatches?.map((match: string) => {
          const subjectMatch = match.match(/SUBJECT:?\s*(.+)/i);
          const previewMatch = match.match(/PREVIEW:?\s*(.+)/i);
          const bodyMatch = match.match(/BODY:?\s*([\s\S]+)/i);
          return {
            subject: subjectMatch?.[1]?.trim() || '',
            preview: previewMatch?.[1]?.trim() || '',
            body: bodyMatch?.[1]?.trim() || '',
          };
        }) || [];
        platformSpecs = {
          emailCount: emails.length,
          emails: emails,
          sequenceType: derivativeType,
        };
      }

      // Save to database
      const { data: derivative, error: saveError } = await supabaseClient
        .from('derivative_assets')
        .insert({
          master_content_id: masterContentId,
          asset_type: derivativeType,
          generated_content: cleanedContent,
          platform_specs: platformSpecs,
          approval_status: 'pending',
          created_by: user.id,
          organization_id: masterContentRecord.organization_id,
        })
        .select()
        .single();

      if (saveError) {
        console.error(`Error saving ${derivativeType} derivative:`, saveError);
        throw saveError;
      }

      console.log(`Successfully generated and saved ${derivativeType} derivative`);
      results.push(derivative);
    }

    return new Response(JSON.stringify({ 
      success: true,
      derivatives: results,
      message: `Generated ${results.length} derivative assets`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in repurpose-content function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error details:', errorMessage);
    
    return new Response(JSON.stringify({ 
      error: errorMessage,
      success: false,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
