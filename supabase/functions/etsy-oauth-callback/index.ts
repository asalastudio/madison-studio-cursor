/**
 * Etsy OAuth Callback - Handle OAuth 2.0 Authorization Response
 * 
 * This edge function receives the authorization code from Etsy, exchanges it
 * for access/refresh tokens, and stores the connection in the database.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { encryptToken } from "../_shared/encryption.ts";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";

serve(async (req) => {
  // Handle CORS preflight
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description");

    // Check for errors from Etsy
    if (error) {
      console.error(`[etsy-oauth-callback] Etsy returned error: ${error} - ${errorDescription}`);
      return createRedirect(null, `etsy_error=${encodeURIComponent(errorDescription || error)}`);
    }

    if (!code || !state) {
      return createRedirect(null, "etsy_error=missing_code_or_state");
    }

    // Create Supabase client with service role for database operations
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Look up OAuth state
    const { data: oauthState, error: stateError } = await supabase
      .from("etsy_oauth_states")
      .select("*")
      .eq("state", state)
      .single();

    if (stateError || !oauthState) {
      console.error("[etsy-oauth-callback] Invalid or expired state:", stateError);
      return createRedirect(null, "etsy_error=invalid_state");
    }

    // Check if state has expired
    if (new Date(oauthState.expires_at) < new Date()) {
      // Clean up expired state
      await supabase.from("etsy_oauth_states").delete().eq("id", oauthState.id);
      return createRedirect(oauthState.redirect_url, "etsy_error=state_expired");
    }

    // Get Etsy credentials
    const clientId = Deno.env.get("ETSY_CLIENT_ID");
    const clientSecret = Deno.env.get("ETSY_CLIENT_SECRET");

    if (!clientId) {
      return createRedirect(oauthState.redirect_url, "etsy_error=not_configured");
    }

    // Exchange code for tokens
    const callbackUrl = `${supabaseUrl}/functions/v1/etsy-oauth-callback`;
    
    const tokenResponse = await fetch("https://api.etsy.com/v3/public/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        redirect_uri: callbackUrl,
        code: code,
        code_verifier: oauthState.code_verifier,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const tokenError = await tokenResponse.text();
      console.error("[etsy-oauth-callback] Token exchange failed:", tokenError);
      return createRedirect(oauthState.redirect_url, "etsy_error=token_exchange_failed");
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, expires_in } = tokenData;

    // Calculate token expiry
    const tokenExpiry = new Date(Date.now() + expires_in * 1000);

    // Fetch shop information using the access token
    // First, get the user's member ID from the token response
    // The access token includes the user ID in format: userId.accessToken
    
    // Get user's shops
    const shopsResponse = await fetch("https://openapi.etsy.com/v3/application/users/me/shops", {
      headers: {
        "Authorization": `Bearer ${access_token}`,
        "x-api-key": clientId,
      },
    });

    if (!shopsResponse.ok) {
      const shopsError = await shopsResponse.text();
      console.error("[etsy-oauth-callback] Failed to fetch shops:", shopsError);
      return createRedirect(oauthState.redirect_url, "etsy_error=failed_to_fetch_shop");
    }

    const shopsData = await shopsResponse.json();
    
    if (!shopsData.results || shopsData.results.length === 0) {
      return createRedirect(oauthState.redirect_url, "etsy_error=no_shop_found");
    }

    // Use the first shop (users typically have one shop)
    const shop = shopsData.results[0];
    const shopId = shop.shop_id.toString();
    const shopName = shop.shop_name;
    const shopUrl = shop.url;

    // Encrypt tokens with AES-GCM
    const ETSY_ENC_KEY = Deno.env.get("ETSY_TOKEN_ENCRYPTION_KEY");
    if (!ETSY_ENC_KEY) {
      console.error("[etsy-oauth-callback] ETSY_TOKEN_ENCRYPTION_KEY not configured");
      return createRedirect(oauthState.redirect_url, "etsy_error=encryption_not_configured");
    }

    const { ciphertextB64: encAccess, ivB64: ivAccess } = await encryptToken(access_token, ETSY_ENC_KEY);
    const { ciphertextB64: encRefresh, ivB64: ivRefresh } = await encryptToken(refresh_token, ETSY_ENC_KEY);

    // Check if connection already exists for this organization
    const { data: existingConnection } = await supabase
      .from("etsy_connections")
      .select("id")
      .eq("organization_id", oauthState.organization_id)
      .single();

    if (existingConnection) {
      // Update existing connection
      const { error: updateError } = await supabase
        .from("etsy_connections")
        .update({
          user_id: oauthState.user_id,
          shop_id: shopId,
          shop_name: shopName,
          shop_url: shopUrl,
          encrypted_access_token: encAccess,
          access_token_iv: ivAccess,
          encrypted_refresh_token: encRefresh,
          refresh_token_iv: ivRefresh,
          token_expiry: tokenExpiry.toISOString(),
          connected_at: new Date().toISOString(),
          is_active: true,
        })
        .eq("id", existingConnection.id);

      if (updateError) {
        console.error("[etsy-oauth-callback] Failed to update connection:", updateError);
        return createRedirect(oauthState.redirect_url, "etsy_error=failed_to_save");
      }
    } else {
      // Create new connection
      const { error: insertError } = await supabase
        .from("etsy_connections")
        .insert({
          user_id: oauthState.user_id,
          organization_id: oauthState.organization_id,
          shop_id: shopId,
          shop_name: shopName,
          shop_url: shopUrl,
          encrypted_access_token: encAccess,
          access_token_iv: ivAccess,
          encrypted_refresh_token: encRefresh,
          refresh_token_iv: ivRefresh,
          token_expiry: tokenExpiry.toISOString(),
        });

      if (insertError) {
        console.error("[etsy-oauth-callback] Failed to create connection:", insertError);
        return createRedirect(oauthState.redirect_url, "etsy_error=failed_to_save");
      }
    }

    // Clean up OAuth state
    await supabase.from("etsy_oauth_states").delete().eq("id", oauthState.id);

    console.log(`[etsy-oauth-callback] Successfully connected Etsy shop "${shopName}" for org ${oauthState.organization_id}`);

    // Redirect back to app with success
    return createRedirect(oauthState.redirect_url, `etsy_success=true&shop_name=${encodeURIComponent(shopName)}`);

  } catch (error) {
    console.error("[etsy-oauth-callback] Error:", error);
    return createRedirect(null, `etsy_error=${encodeURIComponent(error.message)}`);
  }
});

function createRedirect(baseUrl: string | null, queryParams: string): Response {
  const defaultUrl = Deno.env.get("APP_URL") || "https://app.madisonstudio.ai";
  const redirectUrl = baseUrl || `${defaultUrl}/settings?tab=integrations`;
  const separator = redirectUrl.includes("?") ? "&" : "?";
  
  return new Response(null, {
    status: 302,
    headers: {
      ...corsHeaders,
      "Location": `${redirectUrl}${separator}${queryParams}`,
    },
  });
}




































