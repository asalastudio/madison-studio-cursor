import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import {
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";
  generateGeminiContent,
  extractTextFromGeminiResponse,
} from "../_shared/geminiClient.ts";


serve(async (req) => {
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;
  const corsHeaders = getCorsHeaders(req);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check if a specific organizationId was provided
    const body = await req.json().catch(() => ({}));
    const targetOrgId = body?.organizationId;

    // Get enabled organizations (filter by targetOrgId if provided)
    let query = supabase
      .from('agent_preferences')
      .select('organization_id, last_scan_at')
      .eq('competitive_intelligence_enabled', true);
    
    if (targetOrgId) {
      query = query.eq('organization_id', targetOrgId);
    }

    const { data: enabledOrgs, error: orgsError } = await query;

    if (orgsError) throw orgsError;

    console.log(`Found ${enabledOrgs?.length || 0} organizations with competitive intelligence enabled`);

    const results = [];

    for (const org of enabledOrgs || []) {
      console.log(`Processing organization: ${org.organization_id}`);

      // Get competitors for this org
      const { data: competitors, error: competitorsError } = await supabase
        .from('competitor_watchlist')
        .select('*')
        .eq('organization_id', org.organization_id)
        .eq('is_active', true);

      if (competitorsError) {
        console.error(`Error fetching competitors for ${org.organization_id}:`, competitorsError);
        continue;
      }

      // Get brand context
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('brand_config')
        .eq('id', org.organization_id)
        .single();

      if (orgError) {
        console.error(`Error fetching org data for ${org.organization_id}:`, orgError);
        continue;
      }

      const brandConfig = orgData?.brand_config as any;
      const brandName = brandConfig?.brandName || 'Your Brand';

      // Get brand knowledge
      const { data: brandKnowledge } = await supabase
        .from('brand_knowledge')
        .select('knowledge_type, content')
        .eq('organization_id', org.organization_id)
        .eq('is_active', true);

      const brandVoice = brandKnowledge?.find(k => k.knowledge_type === 'brand_voice')?.content || '';
      const vocabulary = brandKnowledge?.find(k => k.knowledge_type === 'vocabulary')?.content || '';

      // Process each competitor
      for (const competitor of competitors || []) {
        console.log(`Analyzing competitor: ${competitor.competitor_name}`);

        try {
          // Scrape competitor website (simple fetch)
          const scrapeResponse = await fetch(competitor.competitor_url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; MadisonBot/1.0)',
            },
          });

          if (!scrapeResponse.ok) {
            console.error(`Failed to fetch ${competitor.competitor_url}: ${scrapeResponse.status}`);
            continue;
          }

          const html = await scrapeResponse.text();
          
          // Extract text content (basic HTML stripping)
          const textContent = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 8000); // Limit content size

          // Analyze with Gemini AI
          const aiPrompt = `You are Madison's competitive research assistant.

OUR BRAND:
- Name: ${brandName}
- Voice: ${JSON.stringify(brandVoice).substring(0, 500)}
- Vocabulary: ${JSON.stringify(vocabulary).substring(0, 500)}

COMPETITOR: ${competitor.competitor_name}
URL: ${competitor.competitor_url}

COMPETITOR CONTENT:
${textContent}

Analyze this competitor and identify 3-5 specific insights. Focus on:
1. Messaging differences (how they position vs. our brand)
2. Pricing or value proposition observations
3. Content strategies we could learn from
4. Opportunities or threats to our positioning

Return a JSON array of insights with this structure:
[
  {
    "insight_type": "messaging" | "pricing" | "content_strategy" | "positioning" | "opportunity",
    "finding": "Clear, specific observation with actionable context"
  }
]

Be specific, actionable, and brand-aware.`;

          const aiData = await generateGeminiContent({
            systemPrompt: 'You are a competitive intelligence analyst. Return only valid JSON.',
            messages: [{ role: 'user', content: aiPrompt }],
            responseMimeType: 'application/json',
            temperature: 0.7,
            maxOutputTokens: 1536,
          });

          const aiContent = extractTextFromGeminiResponse(aiData) || '';

          // Parse insights
          let insights = [];
          try {
            // Try to extract JSON from markdown code blocks
            const jsonMatch = aiContent.match(/```json\s*([\s\S]*?)\s*```/) || 
                            aiContent.match(/\[[\s\S]*?\]/);
            const jsonString = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : aiContent;
            insights = JSON.parse(jsonString);
          } catch (e) {
            console.error('Failed to parse AI response as JSON:', e);
            // Create single insight from raw text
            insights = [{
              insight_type: 'general',
              finding: aiContent.substring(0, 500)
            }];
          }

          // Store insights in database
          for (const insight of insights) {
            const { error: insertError } = await supabase
              .from('competitive_insights')
              .insert({
                organization_id: org.organization_id,
                competitor_name: competitor.competitor_name,
                insight_type: insight.insight_type,
                finding: insight.finding,
                source_url: competitor.competitor_url,
              });

            if (insertError) {
              console.error('Error inserting insight:', insertError);
            }
          }

          console.log(`✅ Analyzed ${competitor.competitor_name}: ${insights.length} insights`);

        } catch (error) {
          console.error(`Error analyzing ${competitor.competitor_name}:`, error);
        }
      }

      // Update last scan time
      await supabase
        .from('agent_preferences')
        .update({ last_scan_at: new Date().toISOString() })
        .eq('organization_id', org.organization_id);

      results.push({
        organization_id: org.organization_id,
        competitors_analyzed: competitors?.length || 0,
        status: 'completed'
      });
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        results,
        message: `Analyzed competitors for ${results.length} organizations`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Competitive intelligence error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
