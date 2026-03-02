import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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
    const { masterContent } = await req.json();
    
    if (!masterContent) {
      throw new Error("Master content is required");
    }

    // Build system prompt for Smart Amplify analysis
    const systemPrompt = `You are a content amplification strategist analyzing master content to recommend the best derivative formats.

Available derivative types:
- email: Newsletter-style email
- email_3part: 3-part email nurture sequence
- email_5part: 5-part email sequence
- email_7part: 7-part email sequence
- instagram: Instagram posts and captions
- linkedin: Professional network posts
- facebook: Community engagement posts
- youtube: Video descriptions & scripts
- product: Product page descriptions
- pinterest: Pinterest pin descriptions
- sms: SMS marketing messages
- tiktok: TikTok video scripts
- twitter: Twitter/X threads

Analyze the provided content and recommend 2-3 derivative types that would work best for amplifying this specific content.

For each recommendation, provide:
1. derivativeType: The type ID
2. confidence: "high", "medium", or "low"
3. reason: Brief explanation (30-50 words) why this derivative would work well
4. priority: Number 1-6 (1 being highest priority)

Consider:
- Content length and depth
- Subject matter and tone
- Audience fit for each platform
- Potential for engagement
- Content structure and format compatibility`;

    const userPrompt = `Analyze this master content and recommend the best derivative formats:

Title: ${masterContent.title}
Content Type: ${masterContent.contentType || 'general'}
Content Preview: ${masterContent.content}

Return 2-3 recommendations prioritized by fit and potential impact.`;

    const data = await generateGeminiContent({
      systemPrompt,
      messages: [
        {
          role: "user",
          content: `${userPrompt}

Return ONLY valid JSON in this format:
{
  "recommendations": [
    {
      "derivativeType": "email",
      "confidence": "high",
      "reason": "3-4 sentence rationale",
      "priority": 1
    }
  ]
}`,
        },
      ],
      responseMimeType: "application/json",
      temperature: 0.5,
      maxOutputTokens: 1024,
    });

    const raw = extractTextFromGeminiResponse(data);
    if (!raw) {
      throw new Error("No response from AI service");
    }

    const result = JSON.parse(raw);
    
    return new Response(
      JSON.stringify({ recommendations: result.recommendations }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("Error in analyze-amplify-fit:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        recommendations: [] 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
