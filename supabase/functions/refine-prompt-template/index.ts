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
    const { purpose, contentType, collection, tone, keyElements, constraints } = await req.json();

    // Category-specific prompt templates
    const categoryTemplates = {
      blog: "Write a blog post on {{TOPIC}} for {{AUDIENCE}}. Include {{NUMBER}} sections with headers. Tone: {{TONE}}. Length: {{WORD_COUNT}} words.",
      email: "Generate {{NUMBER}} email subject lines for {{CAMPAIGN_TYPE}} featuring {{PRODUCT_NAME}}. Keep under {{CHAR_LIMIT}} characters. Write body copy for {{OFFER}}. Tone: {{TONE}}.",
      product: "Write a product description for {{PRODUCT_NAME}}. Include {{TOP_NOTES}}, {{HEART_NOTES}}, {{BASE_NOTES}}. Emphasize {{USP}}. Tone: {{TONE}}.",
      social: "Write a social media caption for {{PRODUCT_NAME}}. Include storytelling hook, {{NUMBER}} hashtags, and CTA. Platform: {{PLATFORM}}. Tone: {{TONE}}.",
      visual: "Create an image prompt in {{STYLE_REFERENCE}} style for {{PRODUCT_NAME}}. Emphasize {{VISUAL_ELEMENTS}}, {{MOOD}}, {{COLOR_PALETTE}}. Format: {{PLATFORM}}."
    };

    const systemPrompt = `You are a prompt engineering expert specializing in content creation templates.

Your task: Transform natural language input into a clean, reusable prompt template with proper placeholder syntax.

Rules:
1. Use {{PLACEHOLDER_NAME}} syntax for all variables (uppercase with underscores)
2. Keep prompts concise (1-3 sentences max)
3. Be action-oriented and specific
4. Include all key elements mentioned by the user
5. Format according to the content type category

Category-Specific Formats:
- Blog: Include {{TOPIC}}, {{AUDIENCE}}, {{WORD_COUNT}}, tone
- Email: Include {{CAMPAIGN_TYPE}}, {{PRODUCT_NAME}}, {{OFFER}}, character limits
- Product: Include {{PRODUCT_NAME}}, {{TOP_NOTES}}, {{HEART_NOTES}}, {{BASE_NOTES}}, {{USP}}
- Social: Include {{PRODUCT_NAME}}, {{PLATFORM}}, {{NUMBER}} (for hashtags), CTA
- Visual: Include {{STYLE_REFERENCE}}, {{PRODUCT_NAME}}, {{VISUAL_ELEMENTS}}, {{MOOD}}, {{COLOR_PALETTE}}

Example Input:
Purpose: "Create engaging Instagram posts for perfume launches"
Content Type: "social"
Tone: "playful"
Key Elements: "product name, scent notes, storytelling"

Example Output:
"Write a playful Instagram caption for {{PRODUCT_NAME}}. Open with a sensory storytelling hook about {{SCENT_NOTES}}. Include {{NUMBER}} relevant hashtags and a clear call-to-action to visit our website."

Now transform this input into a clean template:`;

    const userPrompt = `Content Type: ${contentType}
Purpose: ${purpose}
Collection: ${collection}
Tone: ${tone}
Key Elements: ${keyElements}
${constraints ? `Constraints: ${constraints}` : ''}

Create a reusable prompt template with {{PLACEHOLDERS}}.`;

    const data = await generateGeminiContent({
      systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      temperature: 0.6,
      maxOutputTokens: 512,
    });

    const refinedPrompt = extractTextFromGeminiResponse(data) || "";

    // Extract placeholders from refined prompt
    const placeholderMatches = refinedPrompt.match(/\{\{([A-Z_]+)\}\}/g) || [];
    const detectedPlaceholders = [...new Set(placeholderMatches.map((p: string) => p.slice(2, -2)))];

    // Generate a suggested title
    const titlePrefix = contentType.charAt(0).toUpperCase() + contentType.slice(1);
    const titleSuffix = purpose.substring(0, 40);
    const suggestedTitle = `${titlePrefix}: ${titleSuffix}${titleSuffix.length >= 40 ? '...' : ''}`;

    return new Response(
      JSON.stringify({
        refinedPrompt,
        suggestedTitle,
        detectedPlaceholders,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in refine-prompt-template:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        fallback: true 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
