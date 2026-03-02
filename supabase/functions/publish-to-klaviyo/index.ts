import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import juice from "https://esm.sh/juice@10.0.1";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";
import { decryptToken } from "../_shared/encryption.ts";

serve(async (req) => {
  console.log("[publish-to-klaviyo] Function invoked");
  
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;
  const corsHeaders = getCorsHeaders(req);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("[publish-to-klaviyo] Missing authorization header");
      throw new Error("Unauthorized");
    }

    const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    console.log("[publish-to-klaviyo] Auth header present, token length:", accessToken.length);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);
    if (userError || !user) {
      console.error("[publish-to-klaviyo] Auth error:", userError);
      throw new Error("Unauthorized");
    }
    console.log("[publish-to-klaviyo] User authenticated:", user.id);

    const { 
      organization_id, 
      audience_type = "list",
      audience_id,
      campaign_name,
      subject, 
      preview_text, 
      content_html,
      content_id,
      content_title,
      from_email,
      from_name,
      reply_to_email
    } = await req.json();

    console.log("[publish-to-klaviyo] Request params:", {
      organization_id,
      audience_type,
      audience_id,
      campaign_name,
      subject,
      hasContent: !!content_html,
      contentLength: content_html?.length || 0,
      from_email,
      from_name
    });

    if (!organization_id || !subject || !content_html) {
      const missing = [];
      if (!organization_id) missing.push("organization_id");
      if (!subject) missing.push("subject");
      if (!content_html) missing.push("content_html");
      console.error("[publish-to-klaviyo] Missing required fields:", missing);
      throw new Error(`Missing required fields: ${missing.join(", ")}`);
    }

    if (!from_email || !from_name) {
      console.error("[publish-to-klaviyo] Missing sender info");
      throw new Error("From email and from name are required");
    }

    // Validate audience_id is provided unless we're updating an existing campaign
    if (!audience_id) {
      console.error("[publish-to-klaviyo] Missing audience_id");
      throw new Error("Missing audience_id (list, segment, or campaign ID)");
    }

    console.log("[publish-to-klaviyo] All required fields present");

    // Get the encrypted API key
    const { data: connection, error: connectionError } = await supabase
      .from("klaviyo_connections")
      .select("api_key_encrypted, api_key_iv")
      .eq("organization_id", organization_id)
      .maybeSingle();

    if (connectionError || !connection) {
      throw new Error("Klaviyo not connected for this organization");
    }

    // Decrypt the API key
    const encryptionKey = Deno.env.get("KLAVIYO_TOKEN_ENCRYPTION_KEY");
    if (!encryptionKey) {
      throw new Error("Encryption key not configured");
    }

    const apiKeyRaw = await decryptToken(connection.api_key_encrypted, connection.api_key_iv, encryptionKey);
    const apiKey = apiKeyRaw.trim();
    const masked = apiKey.length > 6 ? `${apiKey.slice(0,3)}***${apiKey.slice(-3)}` : "***";
    console.log(`[publish-to-klaviyo] Decrypted key looks valid? startsWith pk_:`, apiKey.startsWith("pk_"), `len=`, apiKey.length, `mask=`, masked);

    // Inline CSS styles for Klaviyo (Klaviyo strips <head> and <style> tags)
    console.log("Inlining CSS styles for Klaviyo compatibility...");
    let inlinedHtml = content_html;
    try {
      inlinedHtml = juice(content_html, {
        preserveMediaQueries: true,
        preserveFontFaces: true,
        preserveKeyFrames: true,
        removeStyleTags: true,
        applyWidthAttributes: true,
        applyHeightAttributes: true,
        applyAttributesTableElements: true,
      });
      console.log("CSS inlining successful");
    } catch (inlineError) {
      console.error("CSS inlining failed, using original HTML:", inlineError);
      // Continue with original HTML if inlining fails
    }

    // Get environment variables for Klaviyo API
    const apiBaseUrl = Deno.env.get("KLAVIYO_API_BASE_URL") || "https://a.klaviyo.com/api";
    const apiRevision = Deno.env.get("KLAVIYO_API_REVISION") || "2024-07-15";
    
    console.log(`[publish-to-klaviyo] Using API: ${apiBaseUrl}, Revision: ${apiRevision}`);

    // Handle two scenarios: 
    // 1. Update existing campaign (audience_type === "campaign")
    // 2. Create new campaign (audience_type === "list" or "segment")
    
    let campaignId: string;
    let messageId: string | undefined;

    if (audience_type === "campaign") {
      // Scenario 1: Update an EXISTING campaign
      campaignId = audience_id;
      console.log(`Updating existing campaign ${campaignId}...`);
      
      // Fetch existing campaign messages
      const messagesResponse = await fetch(`${apiBaseUrl}/campaigns/${campaignId}/campaign-messages`, {
        method: "GET",
        headers: {
          "Authorization": `Klaviyo-API-Key ${apiKey}`,
          "revision": apiRevision,
          "Accept": "application/json",
        },
      });

      if (!messagesResponse.ok) {
        const errorText = await messagesResponse.text();
        console.error("Failed to fetch campaign messages:", errorText);
        throw new Error("Failed to fetch campaign messages");
      }

      const messagesData = await messagesResponse.json();
      messageId = messagesData.data?.[0]?.id as string | undefined;

      if (!messageId) {
        throw new Error("No email message found in the selected campaign");
      }
      
      console.log(`Found message ID: ${messageId} in existing campaign`);

      // Update the campaign message with content
      console.log("Updating campaign message with content...");
      const messageUpdatePayload = {
        data: {
          type: "campaign-message",
          id: messageId,
          attributes: {
            content: {
              subject: subject,
              preview_text: preview_text || subject,
              from_email: from_email,
              from_label: from_name,
              reply_to_email: reply_to_email || from_email,
              html_content: inlinedHtml
            }
          }
        }
      };

      const messageUpdateResponse = await fetch(`${apiBaseUrl}/campaign-messages/${messageId}`, {
        method: "PATCH",
        headers: {
          "Authorization": `Klaviyo-API-Key ${apiKey}`,
          "revision": apiRevision,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(messageUpdatePayload),
      });

      if (!messageUpdateResponse.ok) {
        const errorText = await messageUpdateResponse.text();
        console.error("Failed to update campaign message:", errorText);
        
        // Parse and extract detailed Klaviyo error
        let errorDetail = "Failed to update campaign message";
        try {
          const errorJson = JSON.parse(errorText);
          const firstError = errorJson.errors?.[0];
          if (firstError) {
            // Check for sender email verification error
            if (firstError.detail?.includes("from_email") || firstError.source?.pointer === "/data/attributes/content/from_email") {
              errorDetail = `Sender email '${from_email}' is not verified in your Klaviyo account. Please verify it in Klaviyo Settings > Email > Sender Profiles.`;
            } else {
              errorDetail = firstError.detail || firstError.title || errorDetail;
            }
          }
        } catch (e) {
          errorDetail = errorText || errorDetail;
        }
        throw new Error(errorDetail);
      }

      console.log("Successfully updated campaign message");
    } else {
      // Scenario 2: Create a NEW campaign for list/segment with INLINE message content
      const campaignPayload = {
        data: {
          type: "campaign",
          attributes: {
            name: campaign_name || content_title || subject,
            audiences: {
              included: [audience_id],
              excluded: []
            },
            send_strategy: {
              method: "immediate"
            },
            send_options: {
              use_smart_sending: true,
              ignore_unsubscribes: false
            },
            "campaign-messages": {
              data: [
                {
                  type: "campaign-message",
                  attributes: {
                    channel: "email",
                    label: subject,
                    content: {
                      subject: subject,
                      preview_text: preview_text || subject,
                      from_email: from_email,
                      from_label: from_name,
                      reply_to_email: reply_to_email || from_email,
                      html_content: inlinedHtml
                    }
                  }
                }
              ]
            }
          },
          relationships: (() => {
            const senderId = Deno.env.get("KLAVIYO_SENDER_ID");
            if (senderId) {
              console.log(`[publish-to-klaviyo] Using sender ID: ${senderId}`);
              return {
                sender: {
                  data: {
                    type: "sender",
                    id: senderId
                  }
                }
              };
            }
            console.log("[publish-to-klaviyo] No sender ID configured, using Klaviyo default");
            return {};
          })()
        }
      };

      console.log("Creating new Klaviyo campaign with inline message content...");
      console.log("[publish-to-klaviyo] Campaign payload structure:", {
        campaign_name: campaignPayload.data.attributes.name,
        audience_count: campaignPayload.data.attributes.audiences.included.length,
        send_method: campaignPayload.data.attributes.send_strategy.method,
        has_message: !!campaignPayload.data.attributes["campaign-messages"],
        has_sender: !!campaignPayload.data.relationships
      });
      
      const campaignResponse = await fetch(`${apiBaseUrl}/campaigns`, {
        method: "POST",
        headers: {
          "Authorization": `Klaviyo-API-Key ${apiKey}`,
          "revision": apiRevision,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(campaignPayload),
      });

      if (!campaignResponse.ok) {
        const errorText = await campaignResponse.text();
        console.error("[publish-to-klaviyo] Klaviyo campaign creation failed:", {
          status: campaignResponse.status,
          statusText: campaignResponse.statusText,
          errorText: errorText.substring(0, 500)
        });
        let errorDetail = "Failed to create Klaviyo campaign";
        try {
          const errorJson = JSON.parse(errorText);
          console.error("[publish-to-klaviyo] Klaviyo error JSON:", JSON.stringify(errorJson, null, 2));
          const firstError = errorJson.errors?.[0];
          if (firstError) {
            // Check for sender email verification error
            if (firstError.detail?.includes("from_email") || firstError.detail?.includes("sender")) {
              errorDetail = `Sender email '${from_email}' is not verified in your Klaviyo account. Please verify it in Klaviyo Settings > Email > Sender Profiles.`;
            } else {
              errorDetail = firstError.detail || firstError.title || errorDetail;
            }
          }
        } catch (e) {
          console.error("[publish-to-klaviyo] Failed to parse error JSON:", e);
          errorDetail = errorText || errorDetail;
        }
        throw new Error(errorDetail);
      }

      const campaignData = await campaignResponse.json();
      campaignId = campaignData.data.id;
      
      // Extract message ID from the response
      const messages = campaignData.included?.filter((item: any) => item.type === "campaign-message");
      messageId = messages?.[0]?.id;
      
      console.log(`[publish-to-klaviyo] Successfully created campaign ${campaignId}`, {
        messageId,
        status: campaignData.data.attributes?.status
      });
    }

    // Log to publishing history
    if (content_id) {
      await supabase
        .from("publishing_history")
        .insert({
          content_id,
          content_type: "master_content",
          platform: "klaviyo",
          external_id: campaignId,
          external_url: `https://www.klaviyo.com/campaign/${campaignId}`,
          published_by: user.id,
          organization_id,
          status: "draft",
          metadata: {
            audience_type,
            audience_id,
            message_id: messageId,
            subject,
            preview_text
          }
        });
    }

    console.log(`Successfully published to Klaviyo campaign ${campaignId}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        campaign_id: campaignId,
        message_id: messageId,
        campaign_url: `https://www.klaviyo.com/campaign/${campaignId}`,
        message: "Content published to Klaviyo successfully" 
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error in publish-to-klaviyo function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
