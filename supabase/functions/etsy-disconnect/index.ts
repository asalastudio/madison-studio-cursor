/**
 * Etsy Disconnect - Disconnect Etsy account from organization
 * 
 * This edge function removes the Etsy connection for an organization,
 * revoking access and cleaning up stored tokens.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";


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
    const { organizationId } = await req.json();
    if (!organizationId) {
      return new Response(
        JSON.stringify({ error: "organizationId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user is admin/owner of the organization
    const { data: membership, error: memberError } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .single();

    if (memberError || !membership || !["owner", "admin"].includes(membership.role)) {
      return new Response(
        JSON.stringify({ error: "Only organization admins can disconnect Etsy" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Delete the Etsy connection
    const { error: deleteError } = await supabase
      .from("etsy_connections")
      .delete()
      .eq("organization_id", organizationId);

    if (deleteError) {
      console.error("[etsy-disconnect] Error deleting connection:", deleteError);
      return new Response(
        JSON.stringify({ error: "Failed to disconnect Etsy account" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Optionally: Clear Etsy-related fields from marketplace_listings
    // (keeping the listings but marking them as unsynced)
    await supabase
      .from("marketplace_listings")
      .update({
        etsy_state: null,
        last_etsy_sync: null,
        // Keep etsy_listing_id for reference
      })
      .eq("organization_id", organizationId)
      .eq("platform", "etsy");

    console.log(`[etsy-disconnect] Disconnected Etsy for org ${organizationId}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Etsy account disconnected successfully" 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[etsy-disconnect] Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});




































