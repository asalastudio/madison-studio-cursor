import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  generateGeminiContent,
  extractTextFromGeminiResponse,
} from "../_shared/geminiClient.ts";
import { buildAuthorProfilesSection } from "../_shared/authorProfiles.ts";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";

serve(async (req) => {
  console.log('[suggest-brand-knowledge] Function invoked, method:', req.method);

  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    console.log('[suggest-brand-knowledge] Starting request...');
    
    // Check for required environment variables
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) {
      console.error('[suggest-brand-knowledge] GEMINI_API_KEY is not configured!');
      throw new Error('GEMINI_API_KEY is not configured. Please set it in Supabase Edge Function secrets.');
    }
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[suggest-brand-knowledge] No Authorization header');
      throw new Error('No Authorization header provided');
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const body = await req.json();
    const { knowledge_type, recommendation, organizationId: passedOrgId } = body;
    
    console.log('[suggest-brand-knowledge] Request body:', { knowledge_type, hasRecommendation: !!recommendation, passedOrgId });

    // Get organization ID
    let organizationId = passedOrgId;
    if (!organizationId) {
      const { data: orgMember } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!orgMember) {
        throw new Error('Organization not found');
      }
      organizationId = orgMember.organization_id;
    }

    console.log('[suggest-brand-knowledge] Fetching data for org:', organizationId);
    
    // Fetch existing brand knowledge
    const { data: existingKnowledge, error: knowledgeError } = await supabase
      .from('brand_knowledge')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true);
    
    if (knowledgeError) {
      console.error('[suggest-brand-knowledge] Error fetching brand_knowledge:', knowledgeError);
    }

    // Fetch uploaded brand documents with extracted content
    const { data: brandDocuments, error: docsError } = await supabase
      .from('brand_documents')
      .select('file_name, extracted_content, content_preview')
      .eq('organization_id', organizationId)
      .eq('processing_status', 'completed')
      .order('created_at', { ascending: false });
    
    if (docsError) {
      console.error('[suggest-brand-knowledge] Error fetching brand_documents:', docsError);
    }
    
    console.log('[suggest-brand-knowledge] Found:', {
      brandDocuments: brandDocuments?.length || 0,
      existingKnowledge: existingKnowledge?.length || 0,
      docsWithContent: brandDocuments?.filter(d => d.extracted_content)?.length || 0
    });

    // Fetch sample content (limited to recent items)
    const { data: masterContent } = await supabase
      .from('master_content')
      .select('title, content_type, full_content')
      .eq('organization_id', organizationId)
      .limit(5)
      .order('created_at', { ascending: false });

    // Fetch products
    const { data: products } = await supabase
      .from('brand_products')
      .select('name, collection, category, usp, tone')
      .eq('organization_id', organizationId)
      .limit(10);

    // Build context for AI
    const contextParts = [];
    
    // PRIORITY: Include uploaded brand documents first (most valuable source)
    if (brandDocuments && brandDocuments.length > 0) {
      contextParts.push('UPLOADED BRAND DOCUMENTS:');
      brandDocuments.forEach(doc => {
        if (doc.extracted_content) {
          // Limit each document to ~2000 chars to avoid token limits
          const content = doc.extracted_content.substring(0, 2000);
          contextParts.push(`\n--- ${doc.file_name} ---`);
          contextParts.push(content);
          if (doc.extracted_content.length > 2000) {
            contextParts.push('...[content truncated]');
          }
        }
      });
    }
    
    if (existingKnowledge && existingKnowledge.length > 0) {
      contextParts.push('\nEXISTING BRAND KNOWLEDGE:');
      existingKnowledge.forEach(kb => {
        contextParts.push(`${kb.knowledge_type}: ${JSON.stringify(kb.content)}`);
      });
    }

    if (masterContent && masterContent.length > 0) {
      contextParts.push('\nRECENT CONTENT SAMPLES:');
      masterContent.forEach(content => {
        const preview = content.full_content?.substring(0, 300) || '';
        contextParts.push(`- ${content.title} (${content.content_type}): ${preview}...`);
      });
    }

    if (products && products.length > 0) {
      contextParts.push('\nPRODUCTS:');
      products.forEach(product => {
        contextParts.push(`- ${product.name}: ${product.usp || product.tone || ''}`);
      });
    }

    // Add ALL Legendary Copywriter Context using the shared builder
    // This ensures all 8 authors (Halbert, Ogilvy, Hopkins, Schwartz, Collier, Peterman, Joyner, Caples) are included
    contextParts.push(buildAuthorProfilesSection());

    let context = contextParts.join('\n');
    
    // Limit context to ~60000 chars to stay within token limits (increased for all 8 profiles)
    if (context.length > 60000) {
      console.log(`[suggest-brand-knowledge] Context too long (${context.length} chars), truncating to 60000`);
      context = context.substring(0, 60000) + '\n...[context truncated for length]';
    }
    
    console.log(`[suggest-brand-knowledge] Context built: ${brandDocuments?.length || 0} docs, ${existingKnowledge?.length || 0} knowledge items, ${products?.length || 0} products, ${context.length} chars`);

    // Build tool definition based on knowledge_type
    let systemPrompt: string;
    let userPrompt: string;
    let schemaExample: Record<string, unknown> | string = {};

    switch (knowledge_type) {
      case 'target_audience':
        systemPrompt = `You are Madison, an expert editorial director. Based on the brand context below, create a clear, specific target audience description.

ADVISOR STRATEGY:
- Consult Eugene Schwartz's "Awareness Levels" to define what they already know/feel.
- Use Robert Collier's principle of "entering the conversation already in their mind."

CONTEXT:
${context}

GUIDELINES:
- Be specific about demographics, psychographics, and needs
- Include pain points and motivations
- Keep it 2-3 sentences, actionable and clear
- Reference patterns you observe in their content/products`;

        userPrompt = "Generate a target audience suggestion based on the context.";
        schemaExample = {
          target_audience: "2-3 sentence description of the specific ideal customer, their psychographics, and motivations."
        };
        break;

      case 'brand_voice':
      case 'voice_tone':
        systemPrompt = `You are Madison, an expert editorial director. Based on the brand context below, define their brand voice and tone.

ADVISOR STRATEGY:
- Channel David Ogilvy's "Authority without Arrogance" and class.
- Blend with J. Peterman's "Narrative Identity" to ensure it feels human, not corporate.

CONTEXT:
${context}

GUIDELINES:
- Describe personality traits and communication style
- Be specific about tone (warm, professional, playful, etc.)
- Include do's and don'ts if patterns are clear
- Voice guidelines should be 3-4 sentences
- Tone spectrum should describe how tone varies across contexts`;

        userPrompt = "Generate brand voice guidelines and tone spectrum based on the context.";
        schemaExample = {
          voice_guidelines: "3-4 sentence description covering personality traits, tone, do's and don'ts.",
          tone_spectrum: "Description of how tone varies across different contexts (educational, promotional, support, etc.)"
        };
        break;

      case 'core_identity':
        systemPrompt = `You are Madison, an expert editorial director. Based on the brand context below, craft the core brand identity elements: mission, vision, values, and personality.

ADVISOR STRATEGY:
- Adopt Mark Joyner's "Simplicity is Power" to cut through noise.
- Use J. Peterman's "Origin Story" approach to find the soul of the brand.

CONTEXT:
${context}

GUIDELINES:
- Mission: Answer "Why does this brand exist?" (2-3 sentences)
- Vision: What future is the brand working towards? (2-3 sentences)
- Values: What principles guide brand decisions? (3-5 core values with brief explanations)
- Personality: If the brand were a person, describe their character (2-3 sentences)
- Be specific and grounded in the context provided
- Reference patterns you observe in their existing content/products`;

        userPrompt = "Generate mission, vision, values, and personality based on the context.";
        schemaExample = {
          mission: "2-3 sentence mission statement explaining why this brand exists.",
          vision: "2-3 sentence vision statement describing the future the brand is working towards.",
          values: "3-5 core values with brief explanations of each.",
          personality: "2-3 sentence description of the brand's character and personality traits."
        };
        break;

      case 'mission':
        systemPrompt = `You are Madison, an expert editorial director. Based on the brand context below, craft a clear mission statement.

ADVISOR STRATEGY:
- Use Mark Joyner's "Irresistible Offer" mindset: What is the high-level value?
- Keep it simple enough for Leo Burnett ("Big Idea").

CONTEXT:
${context}

GUIDELINES:
- Answer "Why does this brand exist?"
- Focus on the value they create or problem they solve
- Keep it inspiring but grounded
- 2-3 sentences maximum`;

        userPrompt = "Generate a mission statement based on the context.";
        schemaExample = {
          mission: "2-3 sentence inspiring mission statement grounded in brand impact."
        };
        break;

      case 'usp':
        systemPrompt = `You are Madison, an expert editorial director. Based on the brand context below, identify what makes this brand unique.

ADVISOR STRATEGY:
- Apply Claude Hopkins' "Pre-emptive Advantage" (claim the common process if others haven't).
- Use David Ogilvy's "Specificity" (facts/numbers) to prove it.

CONTEXT:
${context}

GUIDELINES:
- Focus on what they do differently or better
- Be specific and credible
- Highlight competitive advantages
- 2-3 sentences`;

        userPrompt = "Generate a USP based on the context.";
        schemaExample = {
          differentiator: "Concise paragraph describing what makes the brand unique."
        };
        break;

      case 'key_messages':
        systemPrompt = `You are Madison, an expert editorial director. Based on the brand context below, identify 3-5 core messages.

ADVISOR STRATEGY:
- Use John Caples' "Tested Hooks" mindset to ensure messages grab attention.
- Use Gary Halbert's "Punchiness" to keep them memorable and direct.

CONTEXT:
${context}

GUIDELINES:
- Short, memorable phrases (not full sentences)
- Cover different aspects: quality, values, benefits, etc.
- Easy to remember and repeat
- Return exactly 3-5 messages`;

        userPrompt = "Generate 3-5 key brand messages based on the context.";
        schemaExample = {
          messages: [
            "Short, memorable hook",
            "Another key message"
          ]
        };
        break;

      case 'content_strategy':
        systemPrompt = `You are Madison, an expert editorial director. Based on the brand context below, create a comprehensive content marketing strategy.

ADVISOR STRATEGY:
- Adopt Leo Burnett's "Big Idea" approach to themes (keep them simple/visual).
- Use David Ogilvy's "Research-First" structure for credibility.

CONTEXT:
${context}

RECOMMENDATION CONTEXT: ${recommendation ? `${recommendation.title} - ${recommendation.description}` : 'Develop a content marketing strategy focused on engaging the target audience and promoting products.'}

GUIDELINES:
- Define primary content goals (e.g. awareness, education, conversion)
- Outline 3-4 content pillars or themes specific to this brand
- Suggest key channels and formats (blog, social, email, video)
- Recommend a high-level publication cadence
- Keep it actionable and strategic
- Do NOT use bolding (**) or heavy markdown headers
- Use simple bullet points (•) or plain text lists
- Return a structured strategy document in clean text format`;

        userPrompt = "Generate a content marketing strategy for this brand.";
        schemaExample = {
          content: "Content Strategy\n\nGoals: ...\n\nContent Pillars:\n• Pillar 1...\n• Pillar 2...\n\nChannels & Formats:..."
        };
        break;

      case 'product_development':
        systemPrompt = `You are Madison, a product strategy expert. Create a product development and launch roadmap.

ADVISOR STRATEGY:
- Follow Claude Hopkins' "Reason Why" logic: Build the marketing INTO the product process.
- Use Gary Halbert's "Starving Crowd" concept: Verify demand first.

CONTEXT:
${context}

GUIDELINES:
- Create a practical roadmap for product development and launch
- Focus on steps from concept to market
- Include sourcing, manufacturing considerations, and marketing launch tactics
- Do NOT use markdown formatting like **bold**, # headers, or *italics*
- Use simple bullet points (•) or numbered lists
- Keep it clean, plain text style`;
        
        userPrompt = "Create a product development and launch strategy.";
        schemaExample = {
          content: "Phase 1: Concept & Sourcing\n• Define product specs...\n\nPhase 2: Production..."
        };
        break;

      case 'product_descriptions':
        systemPrompt = `You are Madison, an expert copywriter. Create guidelines for writing product descriptions.

ADVISOR STRATEGY:
- Blend David Ogilvy's "Factual Specificity" (count the stitches, name the origin).
- With J. Peterman's "Romance & Identity" (who does the user become?).

CONTEXT:
${context}

GUIDELINES:
- Define the structure for a product description (e.g. Hook, Benefits, Features, Sensory Details)
- Specify tone and vocabulary to use
- Highlight key benefits relevant to the target audience
- Do NOT use markdown formatting like **bold**, # headers, or *italics*
- Use simple bullet points (•)
- Keep it clean, plain text style`;

        userPrompt = "Create guidelines for writing product descriptions.";
        schemaExample = {
          content: "Structure:\n1. Opening Hook...\n2. Sensory Experience...\n\nKey Benefits to Highlight:\n• ..."
        };
        break;

      case 'content_guidelines':
        systemPrompt = `You are Madison, an expert editorial director. Based on the brand context below, create comprehensive content guidelines for various channels.

ADVISOR STRATEGY:
- Social Media: Channel John Caples (curiosity) and J. Peterman (visuals).
- Email: Channel Gary Halbert (personal/urgent) and Robert Collier (hooks).
- Website: Channel David Ogilvy (clarity/proof).

CONTEXT:
${context}

GUIDELINES:
- Create guidelines for Social Media (Instagram, LinkedIn, etc.) - focusing on tone, caption length, and hashtag strategy
- Create guidelines for Email Marketing - subject line style, body structure
- Create guidelines for Website Copy - headlines, CTAs
- Do NOT use markdown formatting like **bold**, # headers, or *italics*
- Use simple bullet points (•) or numbered lists
- Keep it clean, plain text style`;

        userPrompt = "Generate content guidelines for social media, email, and website.";
        schemaExample = {
          content: "Social Media Guidelines:\n• Tone: ...\n• Captions: ...\n\nEmail Marketing:\n• Subject Lines: ...\n\nWebsite Copy:\n• ..."
        };
        break;

      case 'collections_transparency':
        systemPrompt = `You are Madison, an expert editorial director. Based on the brand context below, write a transparency statement for a product collection.

ADVISOR STRATEGY:
- Use David Ogilvy's "Radical Transparency" - facts build trust.
- Use Claude Hopkins' "Process Reveal" - explain how it's made to prove value.

CONTEXT:
${context}

RECOMMENDATION CONTEXT: ${recommendation ? `${recommendation.title} - ${recommendation.description}` : 'Create a transparency statement regarding sourcing and impact.'}

GUIDELINES:
- Focus on ethical sourcing, manufacturing, and environmental impact
- Be transparent and authentic
- Use the brand's voice
- 2-3 paragraphs maximum`;

        userPrompt = "Generate a transparency statement for the collection based on the context.";
        schemaExample = {
          content: "Transparency statement detailing sourcing, manufacturing, and environmental impact."
        };
        break;

      default:
        // Fallback for dynamic knowledge types
        systemPrompt = `You are Madison, an expert editorial director. Based on the brand context below, create suggestions.

ADVISOR STRATEGY:
- Review the specific 'knowledge_type' requested (${knowledge_type}).
- DYNAMICALLY SELECT the 1-2 Legendary Copywriters from your knowledge base who are most authoritative on this specific topic.
- Explicitly apply their frameworks to this task.

CONTEXT:
${context}

${recommendation ? `\nRECOMMENDATION CONTEXT: ${recommendation.title} - ${recommendation.description}` : ''}`;

        userPrompt = `Generate brand guideline suggestions for: ${knowledge_type}`;
        schemaExample = {
          content: "Guideline content tailored to the requested knowledge type."
        };
    }

    const jsonInstruction = typeof schemaExample === 'string'
      ? schemaExample
      : JSON.stringify(schemaExample, null, 2);

    console.log('[suggest-brand-knowledge] Calling Gemini API for knowledge_type:', knowledge_type);
    console.log('[suggest-brand-knowledge] Context length:', context.length, 'chars');
    
    // If context is empty, provide a fallback message
    if (!context || context.length < 10) {
      console.log('[suggest-brand-knowledge] Context is empty, returning empty suggestions with guidance');
      return new Response(JSON.stringify({ 
        suggestions: {
          mission: "Please upload brand documents or add products to help Madison generate suggestions.",
          vision: "Once you provide brand materials, Madison can analyze your brand and suggest appropriate content.",
          values: "Upload your brand guide, product information, or existing content to get started.",
          personality: "Madison needs brand context to generate personalized suggestions."
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    let geminiResponse;
    try {
      geminiResponse = await generateGeminiContent({
        systemPrompt,
        messages: [
          {
            role: 'user',
            content: `${userPrompt}

Respond ONLY with valid JSON matching this structure:
${jsonInstruction}`,
          },
        ],
        // Note: responseMimeType removed for compatibility with gemini-2.0-flash-exp
        temperature: 0.4,
        maxOutputTokens: 1024,
      });
      console.log('[suggest-brand-knowledge] Gemini response received');
    } catch (geminiError) {
      console.error('[suggest-brand-knowledge] Gemini API error:', geminiError);
      // Return a helpful fallback instead of failing completely
      return new Response(JSON.stringify({ 
        suggestions: {
          mission: "Madison couldn't generate suggestions at this time. Please try again later.",
          vision: "Try uploading more brand content to improve suggestions.",
          values: "",
          personality: ""
        },
        error: geminiError instanceof Error ? geminiError.message : 'AI generation failed'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let rawSuggestions = extractTextFromGeminiResponse(geminiResponse);
    if (!rawSuggestions) {
      const fallbackPart = geminiResponse?.candidates?.[0]?.content?.parts?.[0]?.text;
      rawSuggestions = typeof fallbackPart === 'string' ? fallbackPart : '';
    }
    
    console.log('[suggest-brand-knowledge] Raw Gemini response:', rawSuggestions?.substring(0, 500));

    let suggestions;
    try {
      // Try to extract JSON from markdown code blocks or raw text
      let jsonStr = rawSuggestions;
      
      // Remove markdown code blocks if present
      if (jsonStr) {
        // Match ```json ... ``` or ``` ... ``` blocks
        const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlockMatch) {
          jsonStr = codeBlockMatch[1].trim();
        }
        
        // Try to find JSON object/array if wrapped in other text
        const jsonMatch = jsonStr.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
        if (jsonMatch) {
          jsonStr = jsonMatch[1];
        }
      }
      
      suggestions = jsonStr ? JSON.parse(jsonStr) : {};
    } catch (parseError) {
      console.error('Failed to parse Gemini response:', parseError, rawSuggestions);
      // Return a helpful fallback instead of error
      return new Response(JSON.stringify({ 
        suggestions: {
          mission: rawSuggestions?.substring(0, 500) || "Unable to generate suggestion. Please try again.",
          vision: "",
          values: "",
          personality: ""
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Generated suggestions:', suggestions);

    return new Response(JSON.stringify({ suggestions }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in suggest-brand-knowledge:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error instanceof Error ? error.stack : undefined
      }), 
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
