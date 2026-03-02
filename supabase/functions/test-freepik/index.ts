/**
 * Test endpoint for Freepik API integration
 * 
 * Use this to verify your API key is working before full integration.
 * 
 * Test with:
 * curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/test-freepik \
 *   -H "Content-Type: application/json" \
 *   -d '{"test": "image", "prompt": "A luxury perfume bottle on marble"}'
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { generateImage, generateVideo } from "../_shared/freepikProvider.ts";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";


serve(async (req) => {
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;
  const corsHeaders = getCorsHeaders(req);
  }

  try {
    const body = await req.json();
    const { test, prompt, imageUrl } = body;

    console.log("🧪 Freepik Test Request:", { test, promptLength: prompt?.length });

    // Check API key is configured
    const apiKey = Deno.env.get("FREEPIK_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "FREEPIK_API_KEY not configured",
        }),
        { status: 500, headers: corsHeaders }
      );
    }

    // Validate API key format
    if (!apiKey.startsWith("FPSX")) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid API key format (should start with FPSX)",
        }),
        { status: 500, headers: corsHeaders }
      );
    }

    console.log("✅ API Key configured:", apiKey.substring(0, 10) + "...");

    // Run the requested test
    if (test === "image") {
      if (!prompt) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "prompt is required for image test",
          }),
          { status: 400, headers: corsHeaders }
        );
      }

      console.log("🎨 Testing image generation with Freepik Mystic...");
      
      const result = await generateImage({
        prompt,
        model: "mystic",
        resolution: "1k", // Use 1K for faster testing
        aspectRatio: "square_1_1",
      });

      return new Response(
        JSON.stringify({
          success: true,
          test: "image",
          result: {
            imageUrl: result.imageUrl,
            taskId: result.taskId,
            model: result.model,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (test === "video") {
      if (!imageUrl) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "imageUrl is required for video test",
          }),
          { status: 400, headers: corsHeaders }
        );
      }

      if (!prompt) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "prompt is required for video test",
          }),
          { status: 400, headers: corsHeaders }
        );
      }

      console.log("🎬 Testing video generation with Freepik Seedance...");

      const result = await generateVideo({
        imageUrl,
        prompt,
        duration: "5",
        resolution: "720p",
        cameraFixed: false,
      });

      return new Response(
        JSON.stringify({
          success: true,
          test: "video",
          result: {
            videoUrl: result.videoUrl,
            taskId: result.taskId,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Default: just verify connection
    return new Response(
      JSON.stringify({
        success: true,
        message: "Freepik API key is configured",
        apiKeyPrefix: apiKey.substring(0, 10) + "...",
        availableTests: ["image", "video"],
        usage: {
          image: { test: "image", prompt: "Your prompt here" },
          video: { test: "video", imageUrl: "https://...", prompt: "Motion description" },
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("❌ Test error:", error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Test failed",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
