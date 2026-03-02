import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";
  GEMINI_API_BASE,
  getGeminiApiKey,
} from "../_shared/geminiClient.ts";


serve(async (req) => {
  console.log("[generate-image-with-nano] Function invoked");
  
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;
  const corsHeaders = getCorsHeaders(req);
  }

  try {
    const GEMINI_API_KEY = getGeminiApiKey();

    const { prompt } = await req.json();
    console.log('[generate-image-with-nano] Generating image for prompt:', prompt.substring(0, 100));

    const response = await fetch(`${GEMINI_API_BASE}/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          responseMimeType: 'image/png',
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[generate-image-with-nano] Nano Banana API error:', {
        status: response.status,
        statusText: response.statusText,
        errorText: errorText.substring(0, 500)
      });
      
      // Handle specific error cases
      if (response.status === 429) {
        throw new Error("Rate limit exceeded. Please wait a moment and try again.");
      }
      if (response.status === 402) {
        throw new Error("AI credits depleted. Please add credits to your workspace in Settings.");
      }
      if (response.status === 401) {
        throw new Error("API key invalid or expired. Please contact support.");
      }
      
      throw new Error(`Nano Banana API error: ${response.status} - ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((part: any) => part?.inlineData);
    const textPart = parts.find((part: any) => typeof part?.text === 'string');

    const inlineData = imagePart?.inlineData;
    const imageUrl = inlineData
      ? `data:${inlineData.mimeType || 'image/png'};base64,${inlineData.data}`
      : undefined;
    const description = textPart?.text || 'Image generated via Gemini';

    if (!imageUrl) {
      console.error('[generate-image-with-nano] No image in response:', JSON.stringify(data, null, 2).substring(0, 500));
      throw new Error('No image generated in response');
    }

    console.log('[generate-image-with-nano] Successfully generated image');

    return new Response(
      JSON.stringify({ imageUrl, description }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[generate-image-with-nano] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: error instanceof Error && errorMessage.includes('Rate limit') ? 429 :
                error instanceof Error && errorMessage.includes('credits') ? 402 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});