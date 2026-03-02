/**
 * Etsy Push Listing - Push a Madison listing to Etsy as a draft
 * 
 * This edge function takes a Madison marketplace listing and creates
 * a corresponding draft listing on Etsy, including image uploads.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { encryptToken, decryptToken } from "../_shared/encryption.ts";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";

// Refresh Etsy access token if expired
async function refreshAccessToken(
  supabase: any,
  connection: any,
  clientId: string
): Promise<{ accessToken: string; error?: string }> {
  const ETSY_ENC_KEY = Deno.env.get("ETSY_TOKEN_ENCRYPTION_KEY");
  if (!ETSY_ENC_KEY) {
    return { accessToken: "", error: "Etsy encryption key not configured" };
  }

  // Check if token is still valid (with 5 min buffer)
  const tokenExpiry = new Date(connection.token_expiry);
  const now = new Date(Date.now() + 5 * 60 * 1000);

  if (tokenExpiry > now) {
    const plainAccess = await decryptToken(
      connection.encrypted_access_token, connection.access_token_iv, ETSY_ENC_KEY
    );
    return { accessToken: plainAccess };
  }

  console.log("[etsy-push-listing] Token expired, refreshing...");

  const plainRefresh = await decryptToken(
    connection.encrypted_refresh_token, connection.refresh_token_iv, ETSY_ENC_KEY
  );

  const tokenResponse = await fetch("https://api.etsy.com/v3/public/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      refresh_token: plainRefresh,
    }).toString(),
  });

  if (!tokenResponse.ok) {
    const error = await tokenResponse.text();
    console.error("[etsy-push-listing] Token refresh failed:", error);
    return { accessToken: "", error: "Token refresh failed. Please reconnect your Etsy account." };
  }

  const tokenData = await tokenResponse.json();
  const { access_token, refresh_token, expires_in } = tokenData;
  const newExpiry = new Date(Date.now() + expires_in * 1000);

  // Re-encrypt fresh tokens with AES-GCM
  const { ciphertextB64: encAccess, ivB64: ivAccess } = await encryptToken(access_token, ETSY_ENC_KEY);
  const { ciphertextB64: encRefresh, ivB64: ivRefresh } = await encryptToken(refresh_token, ETSY_ENC_KEY);

  await supabase
    .from("etsy_connections")
    .update({
      encrypted_access_token: encAccess,
      access_token_iv: ivAccess,
      encrypted_refresh_token: encRefresh,
      refresh_token_iv: ivRefresh,
      token_expiry: newExpiry.toISOString(),
    })
    .eq("id", connection.id);

  return { accessToken: access_token };
}

// Map Madison category to Etsy taxonomy ID
function mapCategoryToTaxonomy(category: string): number {
  // Default Etsy taxonomy mappings
  // Full list: https://www.etsy.com/developers/documentation/reference/taxonomy
  const categoryMap: Record<string, number> = {
    // Art & Collectibles
    "art": 1,
    "collectibles": 3,
    "prints": 128,
    
    // Home & Living
    "home": 891,
    "home_decor": 891,
    "furniture": 891,
    "kitchen": 891,
    
    // Jewelry
    "jewelry": 68,
    "necklaces": 68,
    "rings": 68,
    "bracelets": 68,
    
    // Clothing
    "clothing": 69,
    "apparel": 69,
    "shirts": 69,
    "dresses": 69,
    
    // Bath & Beauty
    "beauty": 1630,
    "bath": 1630,
    "skincare": 1630,
    "fragrance": 1630,
    "perfume": 1630,
    "cologne": 1630,
    "candles": 1630,
    
    // Craft Supplies
    "supplies": 1,
    "craft": 1,
    
    // Bags & Purses
    "bags": 77,
    "purses": 77,
    
    // Accessories
    "accessories": 68,
    
    // Default fallback
    "default": 891, // Home & Living
  };

  const normalizedCategory = category?.toLowerCase().replace(/[^a-z]/g, "_") || "default";
  
  for (const [key, value] of Object.entries(categoryMap)) {
    if (normalizedCategory.includes(key)) {
      return value;
    }
  }
  
  return categoryMap.default;
}

// Validate and clean tags for Etsy
function cleanTags(tags: string[]): string[] {
  return tags
    .slice(0, 13) // Max 13 tags
    .map(tag => tag.trim().slice(0, 20)) // Max 20 chars each
    .filter(tag => tag.length > 0);
}

serve(async (req) => {
  // Handle CORS preflight
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    // Get auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase clients
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    // Get current user
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const { listingId } = await req.json();
    if (!listingId) {
      return new Response(
        JSON.stringify({ error: "listingId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the listing
    const { data: listing, error: listingError } = await userClient
      .from("marketplace_listings")
      .select("*, products(*)")
      .eq("id", listingId)
      .single();

    if (listingError || !listing) {
      return new Response(
        JSON.stringify({ error: "Listing not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch Etsy connection for this organization
    const { data: connection, error: connError } = await serviceClient
      .from("etsy_connections")
      .select("*")
      .eq("organization_id", listing.organization_id)
      .eq("is_active", true)
      .single();

    if (connError || !connection) {
      return new Response(
        JSON.stringify({ error: "Etsy account not connected. Please connect your Etsy account in Settings." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get Etsy credentials
    const clientId = Deno.env.get("ETSY_CLIENT_ID");
    if (!clientId) {
      return new Response(
        JSON.stringify({ error: "Etsy integration not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get valid access token
    const { accessToken, error: tokenError } = await refreshAccessToken(serviceClient, connection, clientId);
    if (tokenError) {
      return new Response(
        JSON.stringify({ error: tokenError }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Prepare listing data
    const platformData = listing.platform_data as any || {};
    const title = listing.title?.slice(0, 140) || "Untitled Listing";
    const description = platformData.description?.slice(0, 50000) || "";
    const price = parseFloat(platformData.price) || 0;
    const quantity = parseInt(platformData.quantity) || 1;
    const tags = cleanTags(platformData.tags || []);
    const taxonomyId = mapCategoryToTaxonomy(platformData.category);

    // Validate required fields
    if (price <= 0) {
      return new Response(
        JSON.stringify({ error: "Price must be greater than 0" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build Etsy listing payload
    const etsyPayload = {
      title,
      description,
      price: price,
      quantity,
      tags,
      taxonomy_id: taxonomyId,
      who_made: connection.default_who_made || "i_did",
      when_made: connection.default_when_made || "made_to_order",
      is_supply: connection.default_is_supply || false,
      state: "draft", // Always create as draft
      type: "physical", // physical or download
      ...(connection.default_shipping_profile_id && {
        shipping_profile_id: connection.default_shipping_profile_id
      }),
      // SKU from product if available
      ...(listing.products?.sku && { sku: listing.products.sku }),
    };

    console.log(`[etsy-push-listing] Creating draft listing for shop ${connection.shop_id}:`, {
      title,
      price,
      quantity,
      tags: tags.length,
      taxonomy_id: taxonomyId,
    });

    // Create listing on Etsy
    const createResponse = await fetch(
      `https://openapi.etsy.com/v3/application/shops/${connection.shop_id}/listings`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "x-api-key": clientId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(etsyPayload),
      }
    );

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error("[etsy-push-listing] Etsy API error:", errorText);
      
      // Update listing with error
      await userClient
        .from("marketplace_listings")
        .update({
          etsy_sync_error: `Failed to create: ${errorText}`,
          etsy_state: "error",
        })
        .eq("id", listingId);

      return new Response(
        JSON.stringify({ error: "Failed to create Etsy listing", details: errorText }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const etsyListing = await createResponse.json();
    const etsyListingId = etsyListing.listing_id;
    const etsyUrl = `https://www.etsy.com/listing/${etsyListingId}`;

    console.log(`[etsy-push-listing] Created Etsy listing ${etsyListingId}`);

    // Upload images if available
    const images = platformData.images || [];
    let uploadedImageCount = 0;

    for (let i = 0; i < Math.min(images.length, 10); i++) {
      const imageUrl = images[i];
      try {
        // Fetch the image
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) continue;

        const imageBlob = await imageResponse.blob();
        const imageBuffer = await imageBlob.arrayBuffer();

        // Create form data for image upload
        const formData = new FormData();
        formData.append("image", new Blob([imageBuffer], { type: imageBlob.type }), `image-${i}.jpg`);
        formData.append("rank", (i + 1).toString());

        // Upload to Etsy
        const uploadResponse = await fetch(
          `https://openapi.etsy.com/v3/application/shops/${connection.shop_id}/listings/${etsyListingId}/images`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "x-api-key": clientId,
            },
            body: formData,
          }
        );

        if (uploadResponse.ok) {
          uploadedImageCount++;
          console.log(`[etsy-push-listing] Uploaded image ${i + 1}/${images.length}`);
        } else {
          const uploadError = await uploadResponse.text();
          console.error(`[etsy-push-listing] Failed to upload image ${i + 1}:`, uploadError);
        }
      } catch (imgError) {
        console.error(`[etsy-push-listing] Error uploading image ${i + 1}:`, imgError);
      }
    }

    // Update Madison listing with Etsy info
    await userClient
      .from("marketplace_listings")
      .update({
        etsy_listing_id: etsyListingId,
        etsy_state: "draft",
        last_etsy_sync: new Date().toISOString(),
        external_url: etsyUrl,
        etsy_sync_error: null,
      })
      .eq("id", listingId);

    // Update connection last sync time
    await serviceClient
      .from("etsy_connections")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("id", connection.id);

    return new Response(
      JSON.stringify({
        success: true,
        etsyListingId,
        etsyUrl,
        imagesUploaded: uploadedImageCount,
        message: `Listing created on Etsy as draft with ${uploadedImageCount} images`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[etsy-push-listing] Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});




































