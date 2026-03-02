/**
 * LinkedIn OAuth Start - Initiate OAuth 2.0 Authorization Flow
 *
 * This edge function generates the LinkedIn authorization URL and stores
 * the OAuth state for CSRF protection.
 *
 * LinkedIn OAuth 2.0 Documentation:
 * https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";


// Generate a random string for state (CSRF protection)
function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length];
  }
  return result;
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
    const { organizationId, redirectUrl, connectionType = 'personal' } = await req.json();
    if (!organizationId) {
      return new Response(
        JSON.stringify({ error: "organizationId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get LinkedIn credentials from environment
    const clientId = Deno.env.get("LINKEDIN_CLIENT_ID");
    if (!clientId) {
      return new Response(
        JSON.stringify({
          error: "LinkedIn integration not configured",
          message: "Please add LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET to environment variables.",
          setup_instructions: `
To enable LinkedIn integration:
1. Go to https://www.linkedin.com/developers/apps
2. Create a new app or select existing one
3. Go to the "Auth" tab
4. Add the callback URL: ${supabaseUrl}/functions/v1/linkedin-oauth-callback
5. Copy the Client ID and Client Secret
6. Add them as Supabase secrets:
   - LINKEDIN_CLIENT_ID
   - LINKEDIN_CLIENT_SECRET
7. Request the following products in LinkedIn Developer Portal:
   - Share on LinkedIn (for w_member_social scope)
   - Sign In with LinkedIn using OpenID Connect (for openid, profile, email)
   - For company pages: Marketing Developer Platform (for w_organization_social)
          `
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate state for CSRF protection
    const state = generateRandomString(32);

    // Determine the callback URL
    const callbackUrl = `${supabaseUrl}/functions/v1/linkedin-oauth-callback`;
    const finalRedirectUrl = redirectUrl || `${req.headers.get("origin")}/settings?tab=integrations`;

    // Store state in database
    const { error: stateError } = await supabase
      .from("linkedin_oauth_states")
      .insert({
        user_id: user.id,
        organization_id: organizationId,
        state: state,
        redirect_url: finalRedirectUrl,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 minutes
      });

    if (stateError) {
      console.error("[linkedin-oauth-start] Error storing OAuth state:", stateError);
      return new Response(
        JSON.stringify({ error: "Failed to initiate OAuth flow", details: stateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Define scopes based on connection type
    // Personal profile posting: w_member_social
    // Company page posting: w_organization_social (requires Marketing Developer Platform approval)
    // Profile info: openid, profile, email
    const scopes = connectionType === 'organization'
      ? ['openid', 'profile', 'email', 'w_member_social', 'w_organization_social', 'r_organization_social']
      : ['openid', 'profile', 'email', 'w_member_social'];

    // Build LinkedIn authorization URL
    // Using OAuth 2.0 Authorization Code Flow
    const authUrl = new URL("https://www.linkedin.com/oauth/v2/authorization");
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", callbackUrl);
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("scope", scopes.join(" "));

    console.log(`[linkedin-oauth-start] Generated OAuth URL for user ${user.id}, org ${organizationId}, type: ${connectionType}`);

    return new Response(
      JSON.stringify({
        authUrl: authUrl.toString(),
        message: "Redirect user to authUrl to authorize LinkedIn access",
        scopes: scopes,
        connectionType: connectionType
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[linkedin-oauth-start] Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});


















