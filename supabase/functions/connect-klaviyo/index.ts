import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { encryptToken } from "../_shared/encryption.ts";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";

serve(async (req) => {
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;
  const corsHeaders = getCorsHeaders(req);

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

    const { api_key, organization_id } = await req.json();

    if (!api_key || !organization_id) {
      throw new Error("API key and organization ID are required");
    }

    // Verify user has access to this organization
    const { data: membership, error: membershipError } = await supabase
      .from("organization_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", organization_id)
      .single();

    const role = (membership?.role || "").toLowerCase();
    if (membershipError || !membership) {
      throw new Error("Unauthorized: User is not a member of this organization");
    }
    // Allow owners and admins (case-insensitive). Log others for debugging.
    if (!["owner", "admin", "editor"].includes(role)) {
      console.log("Klaviyo connect blocked due to role:", role);
      throw new Error("Unauthorized: You need admin or owner access to manage Klaviyo connections");
    }

    // Test the API key by fetching lists
    const testResponse = await fetch("https://a.klaviyo.com/api/lists/", {
      headers: {
        "Authorization": `Klaviyo-API-Key ${api_key}`,
        "revision": "2024-10-15",
        "Accept": "application/json",
      },
    });

    if (!testResponse.ok) {
      const errorText = await testResponse.text();
      console.error("Klaviyo API test failed:", errorText);
      throw new Error("Invalid Klaviyo API key or insufficient permissions");
    }

    const listsData = await testResponse.json();
    const listCount = listsData.data?.length || 0;

    // Encrypt the API key with AES-GCM
    const encryptionKey = Deno.env.get("KLAVIYO_TOKEN_ENCRYPTION_KEY");
    if (!encryptionKey) {
      throw new Error("Encryption key not configured");
    }

    const { ciphertextB64, ivB64 } = await encryptToken(api_key, encryptionKey);

    // Store the encrypted API key
    const { error: upsertError } = await supabase
      .from("klaviyo_connections")
      .upsert({
        organization_id,
        api_key_encrypted: ciphertextB64,
        api_key_iv: ivB64,
        list_count: listCount,
        last_synced_at: new Date().toISOString(),
        sync_status: "idle",
      }, {
        onConflict: "organization_id",
      });

    if (upsertError) {
      console.error("Error storing Klaviyo connection:", upsertError);
      throw upsertError;
    }

    console.log(`Successfully connected Klaviyo for organization ${organization_id}`);

    return new Response(
      JSON.stringify({
        success: true,
        list_count: listCount,
        message: "Klaviyo connected successfully"
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error in connect-klaviyo function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
