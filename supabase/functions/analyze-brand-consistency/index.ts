import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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
    const { contentId, contentType, content, title, organizationId } = await req.json();

    if (!contentId || !contentType || !content || !organizationId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch brand knowledge
    const { data: brandKnowledge } = await supabase
      .from('brand_knowledge')
      .select('content, knowledge_type')
      .eq('organization_id', organizationId)
      .eq('is_active', true);

    if (!brandKnowledge || brandKnowledge.length === 0) {
      return new Response(
        JSON.stringify({ 
          error: 'no_brand_knowledge',
          message: 'No brand guidelines found. Please upload brand documents first.',
          score: null
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prepare brand context
    const brandContext = brandKnowledge.map(kb => 
      `${kb.knowledge_type}: ${JSON.stringify(kb.content)}`
    ).join('\n\n');

    // Call AI service for brand consistency analysis
    const prompt = `You are a brand consistency analyzer. Analyze the following content against the brand guidelines and provide a detailed assessment.

BRAND GUIDELINES:
${brandContext}

CONTENT TO ANALYZE:
Title: ${title}
Type: ${contentType}
Content: ${content}

Provide your analysis in the following JSON format:
{
  "score": <number 0-100>,
  "overall_assessment": "<brief summary>",
  "strengths": ["<strength 1>", "<strength 2>"],
  "weaknesses": ["<weakness 1>", "<weakness 2>"],
  "voice_alignment": <number 0-100>,
  "tone_alignment": <number 0-100>,
  "terminology_alignment": <number 0-100>,
  "recommendations": ["<recommendation 1>", "<recommendation 2>"]
}

Be specific and actionable in your feedback.`;

    const aiData = await generateGeminiContent({
      systemPrompt: 'You are a brand consistency expert. Always respond with valid JSON only.',
      messages: [{ role: 'user', content: prompt }],
      responseMimeType: 'application/json',
      temperature: 0.3,
      maxOutputTokens: 1536,
    });
    const analysisText = extractTextFromGeminiResponse(aiData);

    // Parse the AI response
    let analysis;
    try {
      // Remove markdown code blocks if present
      const cleanedText = analysisText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      analysis = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('Failed to parse AI response:', analysisText);
      return new Response(
        JSON.stringify({ error: 'Failed to parse analysis', details: analysisText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update the content with brand analysis
    const tableName = contentType === 'master' ? 'master_content' : 'derivative_assets';
    
    const { error: updateError } = await supabase
      .from(tableName)
      .update({
        brand_consistency_score: analysis.score,
        brand_analysis: analysis,
        last_brand_check_at: new Date().toISOString(),
      })
      .eq('id', contentId);

    if (updateError) {
      console.error('Error updating content:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to save analysis', details: updateError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Brand analysis complete for ${contentType} ${contentId}: ${analysis.score}%`);

    return new Response(
      JSON.stringify({ success: true, analysis }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in analyze-brand-consistency:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});