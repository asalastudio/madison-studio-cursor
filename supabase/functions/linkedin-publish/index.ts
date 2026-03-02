/**
 * LinkedIn Publish - Post content to LinkedIn
 * 
 * This edge function publishes content to a user's LinkedIn profile or company page.
 * Supports text posts, posts with images, and posts with article links.
 * 
 * LinkedIn Share API Documentation:
 * https://learn.microsoft.com/en-us/linkedin/marketing/integrations/community-management/shares/share-api
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";


// Decrypt token (simple base64 for now)
function decryptToken(encrypted: string): string {
  if (encrypted.startsWith("enc:")) {
    return atob(encrypted.slice(4));
  }
  return encrypted;
}

/**
 * Register and upload an image to LinkedIn
 * Returns the image asset URN for use in a post
 */
async function uploadImageToLinkedIn(
  accessToken: string,
  authorUrn: string,
  imageUrl: string
): Promise<string | null> {
  try {
    console.log("[linkedin-publish] Starting image upload for:", imageUrl);

    // Step 1: Register the image upload
    const registerResponse = await fetch("https://api.linkedin.com/v2/assets?action=registerUpload", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        registerUploadRequest: {
          recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
          owner: authorUrn,
          serviceRelationships: [{
            relationshipType: "OWNER",
            identifier: "urn:li:userGeneratedContent"
          }]
        }
      }),
    });

    if (!registerResponse.ok) {
      const errorText = await registerResponse.text();
      console.error("[linkedin-publish] Image register failed:", registerResponse.status, errorText);
      return null;
    }

    const registerData = await registerResponse.json();
    const uploadUrl = registerData.value?.uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]?.uploadUrl;
    const asset = registerData.value?.asset;

    if (!uploadUrl || !asset) {
      console.error("[linkedin-publish] Missing uploadUrl or asset in register response");
      return null;
    }

    console.log("[linkedin-publish] Got upload URL, downloading image from:", imageUrl);

    // Step 2: Download the image from the provided URL
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      console.error("[linkedin-publish] Failed to fetch image:", imageResponse.status);
      return null;
    }

    const imageBlob = await imageResponse.blob();
    const imageBuffer = await imageBlob.arrayBuffer();

    console.log("[linkedin-publish] Uploading image to LinkedIn, size:", imageBuffer.byteLength);

    // Step 3: Upload the image binary to LinkedIn
    const uploadResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": imageBlob.type || "image/jpeg",
      },
      body: imageBuffer,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error("[linkedin-publish] Image upload failed:", uploadResponse.status, errorText);
      return null;
    }

    console.log("[linkedin-publish] Image uploaded successfully, asset:", asset);
    return asset;

  } catch (error) {
    console.error("[linkedin-publish] Image upload error:", error);
    return null;
  }
}

serve(async (req) => {
  // Handle CORS preflight
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;
  const corsHeaders = getCorsHeaders(req);
  }

  try {
    // Get auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const { 
      organizationId, 
      text,
      imageUrl,      // Optional: URL of image to attach
      articleUrl,    // Optional: URL of article/blog to link
      articleTitle,  // Optional: Title for the article link
      contentId,
      contentTable,
      visibility = "PUBLIC" // PUBLIC, CONNECTIONS
    } = await req.json();

    if (!organizationId) {
      return new Response(
        JSON.stringify({ error: "organizationId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!text || text.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Post text is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // LinkedIn has a 3000 character limit for posts
    if (text.length > 3000) {
      return new Response(
        JSON.stringify({ error: "Post text exceeds LinkedIn's 3000 character limit" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get LinkedIn connection for this organization
    const { data: connection, error: connectionError } = await supabase
      .from("linkedin_connections")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .single();

    if (connectionError || !connection) {
      return new Response(
        JSON.stringify({ 
          error: "LinkedIn not connected", 
          message: "Please connect your LinkedIn account in Settings → Integrations"
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if token is expired
    if (new Date(connection.token_expiry) < new Date()) {
      // TODO: Implement token refresh using refresh_token
      return new Response(
        JSON.stringify({ 
          error: "LinkedIn token expired", 
          message: "Please reconnect your LinkedIn account in Settings → Integrations"
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Decrypt access token
    const accessToken = decryptToken(connection.encrypted_access_token);

    // Determine the author URN (person or organization)
    let authorUrn: string;
    if (connection.connection_type === "organization" && connection.linkedin_org_id) {
      authorUrn = `urn:li:organization:${connection.linkedin_org_id}`;
    } else {
      authorUrn = `urn:li:person:${connection.linkedin_user_id}`;
    }

    // Build the post payload
    // Using the Posts API (v2)
    const postPayload: any = {
      author: authorUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: {
            text: text
          },
          shareMediaCategory: "NONE"
        }
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": visibility
      }
    };

    // Handle image upload if provided
    let uploadedImageAsset: string | null = null;
    if (imageUrl) {
      console.log("[linkedin-publish] Uploading image:", imageUrl);
      uploadedImageAsset = await uploadImageToLinkedIn(accessToken, authorUrn, imageUrl);
      
      if (uploadedImageAsset) {
        // Add image to the post
        postPayload.specificContent["com.linkedin.ugc.ShareContent"].shareMediaCategory = "IMAGE";
        postPayload.specificContent["com.linkedin.ugc.ShareContent"].media = [{
          status: "READY",
          description: {
            text: articleTitle || "Shared image"
          },
          media: uploadedImageAsset,
          title: {
            text: articleTitle || ""
          }
        }];
        console.log("[linkedin-publish] Image added to post payload");
      } else {
        console.warn("[linkedin-publish] Image upload failed, posting without image");
      }
    }

    // Handle article link if provided (and no image was uploaded)
    if (articleUrl && !uploadedImageAsset) {
      console.log("[linkedin-publish] Adding article link:", articleUrl);
      postPayload.specificContent["com.linkedin.ugc.ShareContent"].shareMediaCategory = "ARTICLE";
      postPayload.specificContent["com.linkedin.ugc.ShareContent"].media = [{
        status: "READY",
        description: {
          text: "Read the full article"
        },
        originalUrl: articleUrl,
        title: {
          text: articleTitle || "Read more"
        }
      }];
    }

    // If we have both image and article URL, add the article URL to the text
    if (articleUrl && uploadedImageAsset) {
      console.log("[linkedin-publish] Adding article URL to text since image is primary media");
      // Article URL is already in the text or will be added by user
    }

    console.log(`[linkedin-publish] Publishing to ${authorUrn}, text length: ${text.length}, hasImage: ${!!uploadedImageAsset}, hasArticle: ${!!articleUrl}`);

    // Post to LinkedIn using UGC Post API
    const postResponse = await fetch("https://api.linkedin.com/v2/ugcPosts", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify(postPayload),
    });

    if (!postResponse.ok) {
      const errorText = await postResponse.text();
      console.error("[linkedin-publish] LinkedIn API error:", postResponse.status, errorText);
      
      // Parse error for user-friendly message
      let errorMessage = "Failed to publish to LinkedIn";
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.message || errorJson.error || errorMessage;
      } catch {
        if (errorText.includes("DUPLICATE")) {
          errorMessage = "This content was recently posted. LinkedIn prevents duplicate posts.";
        }
      }

      return new Response(
        JSON.stringify({ error: errorMessage, details: errorText }),
        { status: postResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const postResult = await postResponse.json();
    const postId = postResult.id;
    const postUrn = postId; // UGC post URN

    // Extract the activity/share ID for the URL
    // Format: urn:li:ugcPost:123456789 or urn:li:share:123456789
    const activityId = postUrn?.split(":").pop();
    
    // Build post URL
    let postUrl = "";
    if (connection.connection_type === "organization" && connection.linkedin_org_vanity_name) {
      postUrl = `https://www.linkedin.com/company/${connection.linkedin_org_vanity_name}/posts/`;
    } else {
      postUrl = `https://www.linkedin.com/feed/update/${postUrn}/`;
    }

    // Record the post in our database
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminSupabase = createClient(supabaseUrl, serviceRoleKey);

    const { error: recordError } = await adminSupabase
      .from("linkedin_posts")
      .insert({
        linkedin_connection_id: connection.id,
        organization_id: organizationId,
        content_id: contentId || null,
        content_table: contentTable || null,
        linkedin_post_id: activityId,
        linkedin_post_urn: postUrn,
        post_url: postUrl,
        post_text: text,
        status: "published",
        published_at: new Date().toISOString(),
      });

    if (recordError) {
      console.error("[linkedin-publish] Failed to record post:", recordError);
      // Don't fail - the post was successful
    }

    // Update last_post_at on connection
    await adminSupabase
      .from("linkedin_connections")
      .update({ last_post_at: new Date().toISOString() })
      .eq("id", connection.id);

    console.log(`[linkedin-publish] Successfully published post ${postUrn}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        postId: activityId,
        postUrn: postUrn,
        postUrl: postUrl,
        message: `Successfully posted to LinkedIn ${connection.linkedin_org_name || connection.linkedin_user_name}`
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[linkedin-publish] Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});






