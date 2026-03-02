/**
 * LinkedIn OAuth Callback - Handle OAuth 2.0 Authorization Response
 *
 * This edge function receives the authorization code from LinkedIn, exchanges it
 * for access tokens, fetches user/organization info, and stores the connection.
 *
 * LinkedIn OAuth 2.0 Documentation:
 * https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";
import { encryptToken } from "../_shared/encryption.ts";


serve(async (req) => {
  // Handle CORS preflight
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;
  const corsHeaders = getCorsHeaders(req);
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description");

    // Check for errors from LinkedIn
    if (error) {
      console.error(`[linkedin-oauth-callback] LinkedIn returned error: ${error} - ${errorDescription}`);
      return createRedirect(null, `linkedin_error=${encodeURIComponent(errorDescription || error)}`);
    }

    if (!code || !state) {
      return createRedirect(null, "linkedin_error=missing_code_or_state");
    }

    // Create Supabase client with service role for database operations
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Look up OAuth state
    const { data: oauthState, error: stateError } = await supabase
      .from("linkedin_oauth_states")
      .select("*")
      .eq("state", state)
      .single();

    if (stateError || !oauthState) {
      console.error("[linkedin-oauth-callback] Invalid or expired state:", stateError);
      return createRedirect(null, "linkedin_error=invalid_state");
    }

    // Check if state has expired
    if (new Date(oauthState.expires_at) < new Date()) {
      await supabase.from("linkedin_oauth_states").delete().eq("id", oauthState.id);
      return createRedirect(oauthState.redirect_url, "linkedin_error=state_expired");
    }

    // Get LinkedIn credentials
    const clientId = Deno.env.get("LINKEDIN_CLIENT_ID");
    const clientSecret = Deno.env.get("LINKEDIN_CLIENT_SECRET");

    if (!clientId || !clientSecret) {
      return createRedirect(oauthState.redirect_url, "linkedin_error=not_configured");
    }

    // Exchange code for tokens
    const callbackUrl = `${supabaseUrl}/functions/v1/linkedin-oauth-callback`;

    const tokenResponse = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const tokenError = await tokenResponse.text();
      console.error("[linkedin-oauth-callback] Token exchange failed:", tokenError);
      return createRedirect(oauthState.redirect_url, "linkedin_error=token_exchange_failed");
    }

    const tokenData = await tokenResponse.json();
    const { access_token, expires_in, refresh_token, refresh_token_expires_in } = tokenData;

    // Calculate token expiry
    const tokenExpiry = new Date(Date.now() + (expires_in || 5184000) * 1000); // Default 60 days

    // Fetch user profile using LinkedIn API v2
    // Using OpenID Connect userinfo endpoint for basic profile
    const userInfoResponse = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: {
        "Authorization": `Bearer ${access_token}`,
      },
    });

    let linkedinUserId = "";
    let linkedinUserName = "";
    let linkedinEmail = "";
    let profilePictureUrl = "";

    if (userInfoResponse.ok) {
      const userInfo = await userInfoResponse.json();
      linkedinUserId = userInfo.sub || "";
      linkedinUserName = userInfo.name || "";
      linkedinEmail = userInfo.email || "";
      profilePictureUrl = userInfo.picture || "";
    } else {
      // Fallback to /v2/me endpoint
      const meResponse = await fetch("https://api.linkedin.com/v2/me", {
        headers: {
          "Authorization": `Bearer ${access_token}`,
        },
      });

      if (meResponse.ok) {
        const meData = await meResponse.json();
        linkedinUserId = meData.id || "";
        linkedinUserName = `${meData.localizedFirstName || ""} ${meData.localizedLastName || ""}`.trim();
      }
    }

    if (!linkedinUserId) {
      console.error("[linkedin-oauth-callback] Could not fetch LinkedIn user info");
      return createRedirect(oauthState.redirect_url, "linkedin_error=failed_to_fetch_profile");
    }

    // Check for organization/company page access
    // This requires w_organization_social scope and Marketing Developer Platform approval
    let linkedinOrgId = null;
    let linkedinOrgName = null;
    let linkedinOrgVanityName = null;
    const linkedinOrgLogoUrl = null;
    let connectionType = "personal";

    try {
      // Try to fetch organizations the user administers
      const orgsResponse = await fetch(
        "https://api.linkedin.com/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(organization~(localizedName,vanityName,logoV2(original~:playableStreams))))",
        {
          headers: {
            "Authorization": `Bearer ${access_token}`,
            "X-Restli-Protocol-Version": "2.0.0",
          },
        }
      );

      if (orgsResponse.ok) {
        const orgsData = await orgsResponse.json();
        if (orgsData.elements && orgsData.elements.length > 0) {
          // Use the first organization the user administers
          const org = orgsData.elements[0];
          const orgUrn = org.organization;
          linkedinOrgId = orgUrn?.split(":").pop() || null;
          linkedinOrgName = org["organization~"]?.localizedName || null;
          linkedinOrgVanityName = org["organization~"]?.vanityName || null;
          connectionType = "organization";
          console.log(`[linkedin-oauth-callback] Found org: ${linkedinOrgName} (${linkedinOrgId})`);
        }
      }
    } catch (orgError) {
      // Organization access not available, continue with personal profile
      console.log("[linkedin-oauth-callback] No organization access:", orgError);
    }

    // Encrypt tokens with AES-GCM
    const tokenEncryptionKey = Deno.env.get("LINKEDIN_TOKEN_ENCRYPTION_KEY");
    if (!tokenEncryptionKey) {
      console.error("[linkedin-oauth-callback] LINKEDIN_TOKEN_ENCRYPTION_KEY not configured");
      return createRedirect(oauthState.redirect_url, "linkedin_error=encryption_not_configured");
    }
    const { ciphertextB64: encryptedAccessToken, ivB64: accessTokenIv } = await encryptToken(access_token, tokenEncryptionKey);
    let encryptedRefreshToken: string | null = null;
    let refreshTokenIv: string | null = null;
    if (refresh_token) {
      const refreshResult = await encryptToken(refresh_token, tokenEncryptionKey);
      encryptedRefreshToken = refreshResult.ciphertextB64;
      refreshTokenIv = refreshResult.ivB64;
    }

    // Extract scopes that were granted
    const grantedScopes = tokenData.scope ? tokenData.scope.split(" ") : [];

    // Check if connection already exists for this organization
    const { data: existingConnection } = await supabase
      .from("linkedin_connections")
      .select("id")
      .eq("organization_id", oauthState.organization_id)
      .single();

    const connectionData = {
      user_id: oauthState.user_id,
      linkedin_user_id: linkedinUserId,
      linkedin_user_name: linkedinUserName,
      linkedin_email: linkedinEmail,
      profile_picture_url: profilePictureUrl,
      linkedin_org_id: linkedinOrgId,
      linkedin_org_name: linkedinOrgName,
      linkedin_org_vanity_name: linkedinOrgVanityName,
      linkedin_org_logo_url: linkedinOrgLogoUrl,
      encrypted_access_token: encryptedAccessToken,
      access_token_iv: accessTokenIv,
      encrypted_refresh_token: encryptedRefreshToken,
      refresh_token_iv: refreshTokenIv,
      token_expiry: tokenExpiry.toISOString(),
      scopes: grantedScopes,
      connected_at: new Date().toISOString(),
      is_active: true,
      connection_type: connectionType,
    };

    if (existingConnection) {
      // Update existing connection
      const { error: updateError } = await supabase
        .from("linkedin_connections")
        .update(connectionData)
        .eq("id", existingConnection.id);

      if (updateError) {
        console.error("[linkedin-oauth-callback] Failed to update connection:", updateError);
        return createRedirect(oauthState.redirect_url, "linkedin_error=failed_to_save");
      }
    } else {
      // Create new connection
      const { error: insertError } = await supabase
        .from("linkedin_connections")
        .insert({
          ...connectionData,
          organization_id: oauthState.organization_id,
        });

      if (insertError) {
        console.error("[linkedin-oauth-callback] Failed to create connection:", insertError);
        return createRedirect(oauthState.redirect_url, "linkedin_error=failed_to_save");
      }
    }

    // Clean up OAuth state
    await supabase.from("linkedin_oauth_states").delete().eq("id", oauthState.id);

    const displayName = linkedinOrgName || linkedinUserName || "LinkedIn";
    console.log(`[linkedin-oauth-callback] Successfully connected LinkedIn "${displayName}" for org ${oauthState.organization_id}`);

    // Redirect back to app with success
    return createRedirect(
      oauthState.redirect_url,
      `linkedin_success=true&linkedin_name=${encodeURIComponent(displayName)}&connection_type=${connectionType}`
    );

  } catch (error) {
    console.error("[linkedin-oauth-callback] Error:", error);
    return createRedirect(null, `linkedin_error=${encodeURIComponent(error.message)}`);
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


















