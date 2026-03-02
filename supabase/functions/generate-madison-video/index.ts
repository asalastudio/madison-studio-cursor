/**
 * Madison Studio - Video Generation Edge Function
 * 
 * Converts generated images into dynamic product videos using Freepik's video APIs.
 * 
 * Supported Models (2024-2025):
 * - Auto: Balance speed and quality (default)
 * - Kling O1: Multimodal with references, audio support (NEW)
 * - Google Veo 3.1: Sound, voices, improved physics
 * - MiniMax Hailuo 2.3: Cinematic realism
 * - Kling 2.1/2.5: Various quality tiers
 * - Seedance Pro: Legacy Freepik model
 * 
 * Features:
 * - Image-to-video conversion
 * - Start/End frame support (for transitions)
 * - 4-10s duration
 * - 480p-1080p resolution
 * - Fixed or dynamic camera motion
 * - Audio generation (Veo 3+, Kling O1)
 * - Multiple aspect ratios for social media
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateVideo, type FreepikVideoModel, VIDEO_MODELS } from "../_shared/freepikProvider.ts";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";


serve(async (req) => {
  // Handle CORS preflight
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;
  const corsHeaders = getCorsHeaders(req);
  }

  try {
    const body = await req.json();

    const {
      imageUrl,
      endImageUrl,        // For start/end frame transitions
      imageId,
      prompt,
      model = "auto",     // Video model selection
      duration = "5",
      resolution = "720p",
      aspectRatio = "16:9",
      cameraFixed = false,
      includeAudio = false, // Audio generation (Veo 3+, Kling O1)
      multiShot = false,    // Multi-shot mode (auto model)
      userId,
      organizationId,
    } = body;

    // Validation
    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: "imageUrl is required" }),
        { status: 400, headers: corsHeaders }
      );
    }

    if (!prompt) {
      return new Response(
        JSON.stringify({ error: "prompt is required for video generation" }),
        { status: 400, headers: corsHeaders }
      );
    }

    console.log("🎬 Video Generation Request:", {
      imageId,
      model,
      duration,
      resolution,
      aspectRatio,
      cameraFixed,
      includeAudio,
      hasEndImage: !!endImageUrl,
      promptLength: prompt.length,
    });

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Resolve organization if not provided
    let resolvedOrgId = organizationId;

    if (!resolvedOrgId && userId) {
      const { data } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", userId)
        .limit(1)
        .single();

      if (data?.organization_id) {
        resolvedOrgId = data.organization_id;
      }
    }

    if (!resolvedOrgId) {
      return new Response(
        JSON.stringify({ error: "Could not resolve organization" }),
        { status: 400, headers: corsHeaders }
      );
    }

    /**
     * Check subscription tier - Video requires Signature tier
     * Actual tiers: essentials ($49), studio ($149), signature ($349)
     * Super admins get full access regardless of tier
     */
    let videoAllowed = false;
    let subscriptionTier = "essentials";
    let isSuperAdmin = false;
    
    // Check if user is a super admin (gets full access for testing)
    if (userId) {
      try {
        const { data: superAdminData } = await supabase
          .from("super_admins")
          .select("id")
          .eq("user_id", userId)
          .maybeSingle();
        
        if (superAdminData) {
          isSuperAdmin = true;
          videoAllowed = true;
          console.log("👑 Super Admin detected - Full video access enabled");
        }
      } catch (saError) {
        console.warn("Could not check super admin status:", saError);
      }
    }

    // If not super admin, check organization tier
    if (!isSuperAdmin) {
      try {
        const { data: orgData } = await supabase
          .from("organizations")
          .select("subscription_tier, stripe_subscription_status")
          .eq("id", resolvedOrgId)
          .single();
        
        if (orgData) {
          subscriptionTier = (orgData.subscription_tier || "essentials").toLowerCase();
          const isActive = orgData.stripe_subscription_status === "active" || 
                          orgData.stripe_subscription_status === "trialing";
          
          // Video requires Signature tier (highest tier with apiAccess)
          if (isActive || subscriptionTier === "free_trial") {
            if (subscriptionTier === "signature") {
              videoAllowed = true;
            }
          }
        }
      } catch (tierError) {
        console.warn("Could not fetch subscription tier:", tierError);
      }
    }

    console.log(`📊 Video Tier Check:`, { tier: subscriptionTier, videoAllowed, isSuperAdmin });

    if (!videoAllowed) {
      return new Response(
        JSON.stringify({ 
          error: "Video generation requires Signature plan ($349/mo)",
          tier: subscriptionTier,
          upgrade_required: true
        }),
        { status: 403, headers: corsHeaders }
      );
    }

    // Build motion prompt with product photography context
    const enhancedPrompt = buildVideoPrompt(prompt, cameraFixed);

    console.log(`🎥 Starting Freepik video generation with model: ${model}...`);

    // Generate video using Freepik
    const { videoUrl, taskId, model: usedModel } = await generateVideo({
      imageUrl,
      endImageUrl,
      prompt: enhancedPrompt,
      model: model as FreepikVideoModel,
      duration: duration as "4" | "5" | "6" | "8" | "10",
      resolution: resolution as "480p" | "720p" | "768p" | "1080p",
      aspectRatio: mapToFreepikRatio(aspectRatio),
      cameraFixed,
      includeAudio,
      multiShot,
    });

    console.log("✅ Video generated:", { taskId, videoUrl, usedModel });

    // Save to database
    const { data: savedVideo, error: dbError } = await supabase
      .from("generated_images")
      .insert({
        organization_id: resolvedOrgId,
        user_id: userId,
        media_type: "video",
        image_url: imageUrl, // Original source image
        video_url: videoUrl,
        video_duration: parseInt(duration),
        source_image_id: imageId || null,
        final_prompt: enhancedPrompt,
        goal_type: "product_video",
        aspect_ratio: aspectRatio,
        description: `Product video (${duration}s, ${resolution}, ${usedModel})`,
        generation_provider: `freepik-${usedModel}`,
        saved_to_library: true,
      })
      .select()
      .single();

    if (dbError) {
      console.error("Database error:", dbError);
      // Still return the video URL even if DB save fails
    }

    return new Response(
      JSON.stringify({
        videoUrl,
        savedVideoId: savedVideo?.id,
        taskId,
        model: usedModel,
        duration: parseInt(duration),
        resolution,
        hasAudio: includeAudio && (usedModel.includes("veo-3") || usedModel === "kling-o1"),
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("❌ Video generation error:", error);
    
    return new Response(
      JSON.stringify({
        error: error.message || "Video generation failed",
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

/**
 * Build an enhanced motion prompt for product videos
 */
function buildVideoPrompt(userPrompt: string, cameraFixed: boolean): string {
  let prompt = userPrompt;

  // If user didn't specify motion, add professional defaults
  if (!prompt.toLowerCase().includes("camera") && !cameraFixed) {
    prompt += ". Smooth, cinematic camera movement with gentle zoom.";
  }

  // Add professional video quality cues
  if (!prompt.toLowerCase().includes("lighting")) {
    prompt += " Professional studio lighting with soft shadows.";
  }

  // Ensure product focus
  if (!prompt.toLowerCase().includes("product") && !prompt.toLowerCase().includes("bottle")) {
    prompt += " Keep the product as the main focus throughout.";
  }

  return prompt;
}

/**
 * Map common aspect ratios to Freepik's format
 */
function mapToFreepikRatio(ratio: string): any {
  const mapping: Record<string, string> = {
    "1:1": "square_1_1",
    "16:9": "widescreen_16_9",
    "9:16": "social_story_9_16",
    "2:3": "portrait_2_3",
    "3:4": "traditional_3_4",
    "1:2": "vertical_1_2",
    "2:1": "horizontal_2_1",
    "4:5": "social_post_4_5",
    "3:2": "standard_3_2",
    "4:3": "classic_4_3",
    "21:9": "film_horizontal_21_9",
    "9:21": "film_vertical_9_21",
  };

  return mapping[ratio] || "widescreen_16_9";
}

/**
 * Get available video models info (for frontend use)
 */
export function getVideoModelsInfo() {
  return VIDEO_MODELS;
}
