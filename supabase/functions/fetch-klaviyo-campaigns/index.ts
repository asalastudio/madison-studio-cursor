import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";
import { decryptToken } from "../_shared/encryption.ts";

serve(async (req) => {
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;
  const corsHeaders = getCorsHeaders(req);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("Missing authorization header");
      throw new Error("Unauthorized: Missing authorization header");
    }
    const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();

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
      console.error("Auth error:", userError);
      throw new Error("Unauthorized: Invalid authentication");
    }

    const { organization_id } = await req.json();

    if (!organization_id) {
      throw new Error("Organization ID is required");
    }

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
    console.log(`[fetch-klaviyo-campaigns] Decrypted key startsWith pk_:`, apiKey.startsWith("pk_"), `len=`, apiKey.length, `mask=`, masked);

    // Fetch campaigns from Klaviyo (email campaigns only)
    const response = await fetch("https://a.klaviyo.com/api/campaigns/?filter=equals(messages.channel,'email')", {
      method: "GET",
      headers: {
        "Authorization": `Klaviyo-API-Key ${apiKey}`,
        "revision": "2024-07-15",
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Klaviyo API error (campaigns)", response.status, errorText);
      throw new Error(`Klaviyo campaigns failed (${response.status}): ${errorText}`);
    }

    const campaignsData = await response.json();

    const campaigns = (campaignsData?.data || []).map((c: any) => ({
      id: c.id,
      name: c.attributes?.name,
      status: c.attributes?.status,
      channel: c.attributes?.channel,
      created: c.attributes?.created,
      updated: c.attributes?.updated,
    }));

    console.log(`Fetched ${campaigns.length} Klaviyo campaigns for organization ${organization_id}`);

    return new Response(
      JSON.stringify({ campaigns }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error in fetch-klaviyo-campaigns function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});