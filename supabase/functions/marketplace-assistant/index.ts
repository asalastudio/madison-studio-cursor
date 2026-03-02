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
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;


// Helper to fetch Madison's system config
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
    console.error('Error fetching Madison config:', error);
    return '';
  }
}

// Helper to fetch brand knowledge (STANDARDIZED)
async function getBrandKnowledge(organizationId: string) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  try {
    const { data, error } = await supabase
      .from('brand_knowledge')
      .select('content, knowledge_type')
      .eq('organization_id', organizationId)
      .eq('is_active', true);
    
    if (error || !data) {
      console.warn('[BRAND CONTEXT] No brand knowledge found');
      return '';
    }
    
    console.log(`[BRAND CONTEXT] Loaded ${data.length} brand knowledge entries`);
    
    const contextParts = [];
    contextParts.push('\n╔══════════════════════════════════════════════════════════════════╗');
    contextParts.push('║          MANDATORY BRAND GUIDELINES - FOLLOW EXACTLY             ║');
    contextParts.push('║         (Client-specific brand voice and requirements)           ║');
    contextParts.push('╚══════════════════════════════════════════════════════════════════╝');
    
    const knowledgeMap = new Map();
    data.forEach(k => knowledgeMap.set(k.knowledge_type, k.content));
    
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
        const contentStr = typeof content === 'object' ? JSON.stringify(content, null, 2) : content;
        contextParts.push(contentStr);
      }
    }
    
    return contextParts.join('\n');
  } catch (error) {
    console.error('Error fetching brand knowledge:', error);
    return '';
  }
}

// Helper to fetch product data
async function getProductData(productId: string, organizationId: string) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  try {
    const { data, error } = await supabase
      .from('brand_products')
      .select('*')
      .eq('id', productId)
      .eq('organization_id', organizationId)
      .single();
    
    if (error || !data) return null;
    return data;
  } catch (error) {
    console.error('Error fetching product:', error);
    return null;
  }
}

serve(async (req) => {
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;
  const corsHeaders = getCorsHeaders(req);
  }

  try {
    // Authenticate
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Missing authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { messages, platform, organizationId, formData, productId, actionType, userName } = await req.json() as {
      messages: OpenAIMessage[];
      platform: string;
      organizationId?: string;
      formData?: Record<string, unknown>;
      productId?: string;
      actionType?: string;
      userName?: string;
    };

    console.log('Marketplace assistant request:', { platform, actionType, hasProduct: !!productId, organizationId, productId });

    // Gather context
    const [madisonConfig, brandKnowledge, productData] = await Promise.all([
      getMadisonSystemConfig(),
      organizationId ? getBrandKnowledge(organizationId) : Promise.resolve(''),
      productId && organizationId ? getProductData(productId, organizationId) : Promise.resolve(null)
    ]);
    
    // Fetch Madison Masters context (new Three Silos architecture)
    const supabaseForMasters = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const lastMessage = messages[messages.length - 1]?.content;
    const briefText = typeof lastMessage === 'string' ? lastMessage : '';
    
    // Route to Storytellers for marketplace listings (emotional appeal)
    const { strategy: madisonStrategy, masterContext: madisonMasterContext } = await getMadisonMasterContext(
      supabaseForMasters,
      'product_description', // Marketplace listings are product-focused
      briefText
    );

    // Debug logging
    console.log('Madison config fetched:', !!madisonConfig, madisonConfig ? `${madisonConfig.substring(0, 100)}...` : 'EMPTY');
    console.log('Brand knowledge fetched:', !!brandKnowledge, brandKnowledge ? `Length: ${brandKnowledge.length} chars` : 'EMPTY');
    console.log('Product data fetched:', !!productData, productData ? productData.name : 'NONE');
    console.log(`Madison Masters: ${madisonStrategy.copySquad}, Primary: ${madisonStrategy.primaryCopyMaster}`);

    // Platform-specific templates
    const platformTemplates: Record<string, any> = {
      etsy: {
        name: 'Etsy',
        description: 'Handmade & vintage marketplace - Artisan storytelling',
        validation: { titleMaxLength: 140, descriptionMaxLength: 5000, tagsMax: 13 },
        aiTemplate: `Create Etsy listing content with:
- Story-driven, emotional language emphasizing craft and artistry
- Sensory, evocative descriptions
- SEO-optimized long-tail keywords
- Personal connection and authenticity
- Artisan craftsmanship focus`,
        categories: ['Bath & Beauty', 'Home Fragrance', 'Perfume & Cologne', 'Candles']
      },
      tiktok_shop: {
        name: 'TikTok Shop',
        description: 'Social commerce for Gen Z - Viral-worthy products',
        validation: { titleMaxLength: 255, descriptionMaxLength: 3000, tagsMax: 10 },
        aiTemplate: `Create TikTok Shop listing with viral appeal:
- Snappy Gen Z slang with emojis ✨🔥
- FOMO-driven language ("limited", "trending", "going viral")
- Short, punchy sentences
- Social proof and trends
- Excitement and energy`,
        categories: ['Beauty & Personal Care', 'Home & Garden', 'Fashion', 'Lifestyle']
      },
      shopify: {
        name: 'Shopify',
        description: 'E-commerce platform - Professional product listings',
        validation: { titleMaxLength: 255, descriptionMaxLength: 5000, tagsMax: 250 },
        aiTemplate: `Create professional Shopify listing content with:
- Clear, searchable product title optimized for Google Shopping
- Detailed product description highlighting benefits and features
- SEO-friendly language that converts browsers to buyers
- Professional, trustworthy tone
- Mobile-friendly formatting (short paragraphs, scannable)
- Strategic use of tags for store organization and search
- Technical accuracy and specifications`,
        categories: ['Fragrance', 'Bath & Body', 'Home Fragrance', 'Candles', 'Gift Sets', 'Wellness']
      }
    };

    const platformInfo = platformTemplates[platform] || platformTemplates.etsy;

    // Build system prompt with Madison Masters
    let systemContent = `You are Madison, Editorial Director helping create marketplace listings.

=== MADISON MASTERS — COPY TRAINING ===
${madisonMasterContext}
`;
    
    if (madisonConfig) {
      systemContent += `\n=== LEGACY TRAINING ===\n${madisonConfig}\n`;
    }
    
    systemContent += `\n\n=== PLATFORM CONTEXT ===
MARKETPLACE: ${platformInfo.name} - ${platformInfo.description}

PLATFORM REQUIREMENTS:
- Title: Max ${platformInfo.validation.titleMaxLength} characters
- Description: Max ${platformInfo.validation.descriptionMaxLength} characters
- Tags: Max ${platformInfo.validation.tagsMax} tags
- Popular Categories: ${platformInfo.categories.join(', ')}

${platformInfo.aiTemplate}
`;

    if (brandKnowledge) {
      systemContent += `\n\n=== BRAND KNOWLEDGE ===\n${brandKnowledge}\n`;
    }

    if (productData) {
      systemContent += `\n\n=== PRODUCT DATA ===
Name: ${productData.name}
Collection: ${productData.collection || 'N/A'}
Category: ${productData.category || 'N/A'}
Scent Family: ${productData.scent_family || 'N/A'}
Top Notes: ${productData.top_notes || 'N/A'}
Middle Notes: ${productData.middle_notes || 'N/A'}
Base Notes: ${productData.base_notes || 'N/A'}
Key Ingredients: ${productData.key_ingredients || 'N/A'}
Benefits: ${productData.benefits || 'N/A'}
USP: ${productData.usp || 'N/A'}
`;
    }

    if (formData) {
      systemContent += `\n\n=== CURRENT LISTING STATE ===
${JSON.stringify(formData, null, 2)}
`;
    }

    systemContent += `\n\nYOUR ROLE:
- Generate marketplace-optimized content that stays true to the brand voice
- Balance platform requirements with brand authenticity
- Provide specific, actionable suggestions
- Format responses for easy copying into listing fields
- When generating tags, provide them as a comma-separated list

QUICK ACTIONS:
- "Generate Description": Create full product description
- "Suggest Tags": Provide SEO-optimized tag list
- "Optimize Title": Craft compelling, keyword-rich title

CRITICAL OUTPUT FORMATTING:
- Output PLAIN TEXT ONLY - absolutely NO markdown
- NO bold (**text**), NO italics (*text*), NO headers (#)
- NO decorative symbols: ✨ 🔥 ━ ═ • ✦ ─ etc.
- NO emoji unless specifically appropriate for TikTok Shop
- Write in clean, copy-paste ready text
- Use simple hyphens (-) for lists if needed
- Format like professional marketplace copy, not a formatted document

Always maintain brand voice while optimizing for the platform's audience and algorithm.`;
    
    // Add personalization if user name is provided
    if (userName) {
      systemContent += `\n\n(Note: You're assisting ${userName} with this listing. Use their name naturally in greetings or when acknowledging their work. Example: "Great choice, ${userName}!" or "Here's what I suggest, ${userName}...")`;
    }

    try {
      const completion = await generateGeminiContent({
        systemPrompt: systemContent,
        messages,
        temperature: 0.7,
        maxOutputTokens: 2048,
      });

      const content = extractTextFromGeminiResponse(completion) ||
        "I couldn’t generate marketplace copy right now. Please try again.";

      const stream = createOpenAISSEStream(content, 300);

      return new Response(stream, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        },
      });
    } catch (error) {
      console.error("Marketplace assistant completion error:", error);
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
    console.error('Marketplace assistant error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
