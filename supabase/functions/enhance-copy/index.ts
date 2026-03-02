/**
 * Enhance Copy - AI-powered text enhancement for image overlays
 * 
 * Uses Gemini to enhance headlines and subtext for product images,
 * making them more compelling and brand-appropriate.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.2.1";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";


serve(async (req) => {
  // Handle CORS preflight
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;
  const corsHeaders = getCorsHeaders(req);
  }

  try {
    const { headline, subtext, context, style } = await req.json();

    if (!headline && !subtext) {
      return new Response(
        JSON.stringify({ error: "Either headline or subtext is required" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const apiKey = Deno.env.get("GOOGLE_AI_API_KEY") || Deno.env.get("GEMINI_API_KEY");
    
    if (!apiKey) {
      console.warn("No Gemini API key found, using fallback enhancement");
      // Fallback: Simple text improvements
      return new Response(
        JSON.stringify({
          headline: headline ? headline.toUpperCase() : null,
          subtext: subtext || null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `You are a luxury brand copywriter. Enhance the following text for a product image overlay.

Context: ${context || "luxury product advertisement"}
Style: ${style || "elegant, compelling, sophisticated"}

Current text:
${headline ? `Headline: "${headline}"` : ""}
${subtext ? `Subtext: "${subtext}"` : ""}

Rules:
1. Keep the enhanced text SHORT and PUNCHY (headline max 5 words, subtext max 10 words)
2. Make it sound luxurious and compelling
3. Maintain the core message but elevate the language
4. Use action words and emotional triggers
5. Avoid clichés

Respond ONLY with a JSON object in this exact format (no markdown, no explanation):
{"headline": "enhanced headline here", "subtext": "enhanced subtext here"}

If only headline was provided, only enhance headline. If only subtext was provided, only enhance subtext.`;

    console.log("🎨 Enhancing copy with Gemini...");

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();
    
    console.log("✅ Gemini response:", responseText);

    // Parse the JSON response
    let enhanced;
    try {
      // Remove any markdown code blocks if present
      const cleanJson = responseText.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      enhanced = JSON.parse(cleanJson);
    } catch (parseError) {
      console.error("Failed to parse Gemini response:", parseError);
      // Fallback
      enhanced = {
        headline: headline ? headline.toUpperCase() : null,
        subtext: subtext || null,
      };
    }

    return new Response(
      JSON.stringify({
        headline: enhanced.headline || headline,
        subtext: enhanced.subtext || subtext,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("❌ Enhance copy error:", error);

    return new Response(
      JSON.stringify({
        error: error.message || "Failed to enhance text",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
