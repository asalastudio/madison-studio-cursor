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
    console.log(`[fetch-klaviyo-lists] Decrypted key looks valid? startsWith pk_:`, apiKey.startsWith("pk_"), `len=`, apiKey.length, `mask=`, masked);

    // Fetch lists from Klaviyo with profile_count (requires additional-fields parameter)
    const response = await fetch("https://a.klaviyo.com/api/lists/", {
      headers: {
        "Authorization": `Klaviyo-API-Key ${apiKey}`,
        "revision": "2024-07-15",
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Klaviyo API error (lists)", response.status, errorText);
      throw new Error(`Klaviyo lists failed (${response.status}): ${errorText}`);
    }

    const listsData = await response.json();
    
    // Transform the data to a simpler format
    const lists = listsData.data.map((list: any) => ({
      id: list.id,
      name: list.attributes.name,
      profile_count: list.attributes.profile_count || 0,
      created: list.attributes.created,
    }));

    console.log(`Fetched ${lists.length} Klaviyo lists for organization ${organization_id}`);

    return new Response(
      JSON.stringify({ lists }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error in fetch-klaviyo-lists function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
