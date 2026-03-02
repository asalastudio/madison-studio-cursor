/**
 * Sync Etsy Products - Pull all listings from Etsy into Madison Studio
 *
 * This edge function fetches all active listings from an Etsy shop
 * and syncs them to the brand_products table with full details including
 * SKU, pricing, variants, images, and inventory.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";
import { encryptToken, decryptToken } from "../_shared/encryption.ts";

// Refresh Etsy access token if expired
async function refreshAccessToken(
  supabase: any,
  connection: any,
  clientId: string
): Promise<{ accessToken: string; error?: string }> {
  const encryptionKey = Deno.env.get("ETSY_TOKEN_ENCRYPTION_KEY");
  if (!encryptionKey) {
    return { accessToken: "", error: "ETSY_TOKEN_ENCRYPTION_KEY not configured" };
  }

  // Check if token is still valid (with 5 min buffer)
  const tokenExpiry = new Date(connection.token_expiry);
  const now = new Date(Date.now() + 5 * 60 * 1000);

  if (tokenExpiry > now) {
    return { accessToken: await decryptToken(connection.encrypted_access_token, connection.access_token_iv, encryptionKey) };
  }

  console.log("[sync-etsy-products] Token expired, refreshing...");

  const refreshToken = await decryptToken(connection.encrypted_refresh_token, connection.refresh_token_iv, encryptionKey);

  const tokenResponse = await fetch("https://api.etsy.com/v3/public/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      refresh_token: refreshToken,
    }).toString(),
  });

  if (!tokenResponse.ok) {
    const error = await tokenResponse.text();
    console.error("[sync-etsy-products] Token refresh failed:", error);
    return { accessToken: "", error: "Token refresh failed. Please reconnect your Etsy account." };
  }

  const tokenData = await tokenResponse.json();
  const { access_token, refresh_token, expires_in } = tokenData;
  const newExpiry = new Date(Date.now() + expires_in * 1000);

  // Update tokens in database with AES-GCM encryption
  const { ciphertextB64: encryptedAccessToken, ivB64: accessTokenIv } = await encryptToken(access_token, encryptionKey);
  const { ciphertextB64: encryptedRefreshToken, ivB64: refreshTokenIv } = await encryptToken(refresh_token, encryptionKey);

  await supabase
    .from("etsy_connections")
    .update({
      encrypted_access_token: encryptedAccessToken,
      access_token_iv: accessTokenIv,
      encrypted_refresh_token: encryptedRefreshToken,
      refresh_token_iv: refreshTokenIv,
      token_expiry: newExpiry.toISOString(),
    })
    .eq("id", connection.id);

  return { accessToken: access_token };
}

serve(async (req) => {
  // Handle CORS preflight
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;
  const corsHeaders = getCorsHeaders(req);
  }

  try {
    // Get request body
    let requestBody;
    try {
      requestBody = await req.json();
    } catch (e) {
      throw new Error("Invalid request body. Expected JSON.");
    }

    const { organization_id } = requestBody;

    if (!organization_id) {
      return new Response(
        JSON.stringify({ success: false, error: "organization_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    console.log(`[sync-etsy-products] Starting sync for organization: ${organization_id}`);

    // Fetch Etsy connection
    const { data: connection, error: connError } = await supabase
      .from("etsy_connections")
      .select("*")
      .eq("organization_id", organization_id)
      .eq("is_active", true)
      .single();

    if (connError || !connection) {
      return new Response(
        JSON.stringify({ success: false, error: "Etsy account not connected. Please connect your Etsy account in Settings." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get Etsy credentials
    const clientId = Deno.env.get("ETSY_CLIENT_ID");
    if (!clientId) {
      return new Response(
        JSON.stringify({ success: false, error: "Etsy integration not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get valid access token
    const { accessToken, error: tokenError } = await refreshAccessToken(supabase, connection, clientId);
    if (tokenError) {
      return new Response(
        JSON.stringify({ success: false, error: tokenError }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const shopId = connection.shop_id;
    console.log(`[sync-etsy-products] Fetching listings from Etsy shop: ${shopId}`);

    // Fetch all listings with pagination
    let allListings: any[] = [];
    let offset = 0;
    const limit = 100;

    do {
      const listingsUrl = `https://openapi.etsy.com/v3/application/shops/${shopId}/listings/active?limit=${limit}&offset=${offset}&includes=Images,Inventory,Videos`;

      const listingsResponse = await fetch(listingsUrl, {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "x-api-key": clientId,
        },
      });

      if (!listingsResponse.ok) {
        const errorText = await listingsResponse.text();
        console.error("[sync-etsy-products] Etsy API error:", errorText);
        throw new Error(`Etsy API error: ${listingsResponse.status} ${errorText}`);
      }

      const data = await listingsResponse.json();
      allListings = allListings.concat(data.results || []);

      // Check if there are more pages
      if (data.results?.length < limit) {
        break;
      }
      offset += limit;
    } while (true);

    console.log(`[sync-etsy-products] Fetched ${allListings.length} listings from Etsy`);

    // Map Etsy listings to brand_products schema
    const mappedProducts = allListings.map((listing: any) => {
      // Extract images
      const images = (listing.images || []).map((img: any, index: number) => ({
        id: img.listing_image_id?.toString(),
        src: img.url_fullxfull || img.url_570xN || img.url_75x75,
        position: index + 1,
        alt: listing.title,
        width: img.full_width,
        height: img.full_height,
        etsy_image_id: img.listing_image_id?.toString(),
      }));

      // Extract inventory/variants from offerings
      const inventory = listing.inventory || {};
      const offerings = inventory.products || [];

      const variants = offerings.flatMap((product: any, pIndex: number) => {
        return (product.offerings || []).map((offering: any, oIndex: number) => ({
          id: offering.offering_id?.toString(),
          title: product.property_values?.map((pv: any) => pv.values?.join(", ")).join(" / ") || `Option ${pIndex + 1}`,
          sku: product.sku || null,
          price: offering.price?.amount ? offering.price.amount / offering.price.divisor : listing.price?.amount / listing.price?.divisor,
          compare_at_price: null,
          inventory_quantity: offering.quantity || 0,
          inventory_policy: "deny",
          option1: product.property_values?.[0]?.values?.[0] || null,
          option2: product.property_values?.[1]?.values?.[0] || null,
          option3: product.property_values?.[2]?.values?.[0] || null,
          barcode: null,
          weight: null,
          weight_unit: "oz",
          requires_shipping: !listing.is_digital,
          etsy_offering_id: offering.offering_id?.toString(),
          etsy_product_id: product.product_id?.toString(),
          position: pIndex * 10 + oIndex + 1,
        }));
      });

      // If no variants, create a default one
      if (variants.length === 0) {
        variants.push({
          id: listing.listing_id?.toString(),
          title: "Default",
          sku: listing.sku?.[0] || null,
          price: listing.price?.amount ? listing.price.amount / listing.price.divisor : 0,
          compare_at_price: null,
          inventory_quantity: listing.quantity || 0,
          inventory_policy: "deny",
          option1: null,
          option2: null,
          option3: null,
          barcode: null,
          weight: listing.item_weight?.value || null,
          weight_unit: listing.item_weight?.unit || "oz",
          requires_shipping: !listing.is_digital,
          etsy_offering_id: null,
          position: 1,
        });
      }

      // Extract unique options
      const optionNames = new Set<string>();
      const optionValues: Record<string, Set<string>> = {};

      (offerings || []).forEach((product: any) => {
        (product.property_values || []).forEach((pv: any) => {
          if (pv.property_name) {
            optionNames.add(pv.property_name);
            if (!optionValues[pv.property_name]) {
              optionValues[pv.property_name] = new Set();
            }
            (pv.values || []).forEach((v: string) => optionValues[pv.property_name].add(v));
          }
        });
      });

      const options = Array.from(optionNames).map((name, index) => ({
        name,
        values: Array.from(optionValues[name] || []),
        position: index + 1,
      }));

      // Calculate primary price (from first variant or listing)
      const primaryPrice = variants[0]?.price || (listing.price?.amount ? listing.price.amount / listing.price.divisor : 0);
      const primarySku = variants[0]?.sku || listing.sku?.[0] || null;

      // Parse tags
      const tags = listing.tags || [];

      // Map materials
      const materials = listing.materials || [];

      // Generate handle from title
      const handle = listing.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 100);

      return {
        organization_id,
        name: listing.title,
        handle,
        description: listing.description || null,
        product_type: listing.taxonomy_path?.join(" > ") || "Uncategorized",
        collection: listing.taxonomy_path?.[0] || "Uncategorized",
        category: listing.taxonomy_path?.[1] || null,

        // E-commerce fields
        sku: primarySku,
        barcode: null,
        price: primaryPrice,
        compare_at_price: null,
        inventory_quantity: listing.quantity || 0,
        inventory_policy: "deny",
        track_inventory: true,
        weight: listing.item_weight?.value || null,
        weight_unit: listing.item_weight?.unit || "oz",
        requires_shipping: !listing.is_digital,

        // Variants and options
        variants: JSON.stringify(variants),
        options: JSON.stringify(options),

        // Images
        images: JSON.stringify(images),
        featured_image_url: images[0]?.src || null,

        // Vendor info
        vendor: connection.shop_name || null,

        // Status
        status: listing.state === "active" ? "active" : "draft",
        published_at: listing.state === "active" ? new Date().toISOString() : null,

        // Tags and materials
        tags,
        materials,

        // Etsy-specific fields
        etsy_listing_id: listing.listing_id?.toString(),
        etsy_shop_id: shopId?.toString(),
        etsy_state: listing.state,
        etsy_sync_status: "synced",
        last_etsy_sync: new Date().toISOString(),
        etsy_taxonomy_id: listing.taxonomy_id,
        etsy_who_made: listing.who_made,
        etsy_when_made: listing.when_made,
        etsy_is_supply: listing.is_supply,
      };
    });

    console.log(`[sync-etsy-products] Processing ${mappedProducts.length} products`);

    // Fetch existing products
    const etsyIds = mappedProducts.map((p: any) => p.etsy_listing_id);
    const { data: existingProducts } = await supabase
      .from("brand_products")
      .select("id, name, etsy_listing_id, description")
      .eq("organization_id", organization_id)
      .in("etsy_listing_id", etsyIds);

    const existingByEtsyId = new Map(existingProducts?.map(p => [p.etsy_listing_id, p]) || []);

    let updatedCount = 0;
    let insertedCount = 0;

    // Process each product
    for (const product of mappedProducts) {
      const existing = existingByEtsyId.get(product.etsy_listing_id);

      if (existing) {
        // Update existing product
        const { error } = await supabase
          .from("brand_products")
          .update({
            // Always sync these from Etsy
            name: product.name,
            handle: product.handle,
            sku: product.sku,
            price: product.price,
            compare_at_price: product.compare_at_price,
            inventory_quantity: product.inventory_quantity,
            variants: product.variants,
            options: product.options,
            images: product.images,
            featured_image_url: product.featured_image_url,
            tags: product.tags,
            materials: product.materials,
            status: product.status,
            etsy_state: product.etsy_state,
            etsy_sync_status: product.etsy_sync_status,
            last_etsy_sync: product.last_etsy_sync,
            // Only update description if currently empty
            ...((!existing.description || existing.description.length < 50) && {
              description: product.description,
            }),
          })
          .eq("id", existing.id);

        if (error) throw error;
        updatedCount++;
      } else {
        // Insert new product
        const { error } = await supabase
          .from("brand_products")
          .insert([product]);

        if (error) throw error;
        insertedCount++;
      }
    }

    console.log(`[sync-etsy-products] Sync complete: ${updatedCount} updated, ${insertedCount} new`);

    // Update connection last sync time
    await supabase
      .from("etsy_connections")
      .update({
        last_sync_at: new Date().toISOString(),
        sync_status: "idle",
      })
      .eq("id", connection.id);

    return new Response(
      JSON.stringify({
        success: true,
        updated: updatedCount,
        inserted: insertedCount,
        total: updatedCount + insertedCount,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[sync-etsy-products] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Unknown error occurred",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
