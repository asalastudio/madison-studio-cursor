import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";


// Decrypt tokens from shopify_connections table
function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function decryptText(ciphertextB64: string, ivB64: string, keyB64: string): Promise<string> {
  const keyBytes = base64ToBytes(keyB64);
  const keyCopy = new Uint8Array(keyBytes.length);
  keyCopy.set(keyBytes);
  const keyBuffer: ArrayBuffer = keyCopy.buffer;
  const cryptoKey = await crypto.subtle.importKey('raw', keyBuffer, { name: 'AES-GCM' }, false, ['decrypt']);
  const ivBytes = base64ToBytes(ivB64);
  const ivCopy = new Uint8Array(ivBytes.length);
  ivCopy.set(ivBytes);
  const iv: ArrayBuffer = ivCopy.buffer;
  const ciphertextBytes = base64ToBytes(ciphertextB64);
  const ciphertextCopy = new Uint8Array(ciphertextBytes.length);
  ciphertextCopy.set(ciphertextBytes);
  const ciphertext: ArrayBuffer = ciphertextCopy.buffer;
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, ciphertext);
  return new TextDecoder().decode(plaintext);
}

serve(async (req) => {
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
      throw new Error('Invalid request body. Expected JSON.');
    }

    const { organization_id } = requestBody;

    if (!organization_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'organization_id is required',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing Supabase configuration:', {
        hasUrl: !!supabaseUrl,
        hasKey: !!supabaseKey,
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Server configuration error',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`Starting Shopify product sync for organization: ${organization_id}`);

    // Fetch Shopify connection details
    const { data: connection, error: connectionError } = await supabase
      .from('shopify_connections')
      .select('id, access_token_encrypted, access_token_iv, shop_domain')
      .eq('organization_id', organization_id)
      .single();

    if (connectionError || !connection) {
      console.error('Connection fetch error:', connectionError);
      throw new Error('Shopify connection not found');
    }

    const { shop_domain, access_token_encrypted, access_token_iv } = connection;

    console.log('Connection data:', {
      has_encrypted: !!access_token_encrypted,
      has_iv: !!access_token_iv,
      shop_domain: shop_domain,
      encrypted_length: access_token_encrypted?.length,
      iv_length: access_token_iv?.length,
    });

    if (!access_token_encrypted) {
      throw new Error('Shopify connection is missing encrypted token. Please reconnect your Shopify account.');
    }

    if (!access_token_iv) {
      throw new Error('Shopify connection is missing encryption IV. Please disconnect and reconnect your Shopify account to enable encryption.');
    }

    // Decrypt the access token
    const ENC_KEY = Deno.env.get('SHOPIFY_TOKEN_ENCRYPTION_KEY');
    if (!ENC_KEY) {
      console.error('SHOPIFY_TOKEN_ENCRYPTION_KEY not found in environment');
      throw new Error('Shopify token encryption key not configured');
    }

    let accessToken: string;
    try {
      accessToken = await decryptText(access_token_encrypted, access_token_iv, ENC_KEY);
      console.log('Token decrypted successfully, length:', accessToken.length);
    } catch (decryptError: any) {
      console.error('Error decrypting Shopify token:', {
        error: decryptError.message,
        stack: decryptError.stack,
        has_encrypted: !!access_token_encrypted,
        has_iv: !!access_token_iv,
      });
      throw new Error('Failed to decrypt Shopify access token. Please reconnect your Shopify account.');
    }

    console.log(`Fetching products from Shopify store: ${shop_domain}`);

    // Fetch products from Shopify Admin API with all fields including variants and images
    // Using 2024-01 API version for full variant and inventory support
    let allProducts: any[] = [];
    let pageInfo: string | null = null;

    do {
      const url = pageInfo
        ? `https://${shop_domain}/admin/api/2024-01/products.json?limit=250&page_info=${pageInfo}`
        : `https://${shop_domain}/admin/api/2024-01/products.json?limit=250`;

      const shopifyResponse = await fetch(url, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      });

      if (!shopifyResponse.ok) {
        const errorText = await shopifyResponse.text();
        console.error('Shopify API error:', errorText);
        throw new Error(`Shopify API error: ${shopifyResponse.status} ${errorText}`);
      }

      const shopifyData = await shopifyResponse.json();
      allProducts = allProducts.concat(shopifyData.products || []);

      // Check for pagination
      const linkHeader = shopifyResponse.headers.get('link');
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const nextMatch = linkHeader.match(/<[^>]*page_info=([^>&]+)[^>]*>; rel="next"/);
        pageInfo = nextMatch ? nextMatch[1] : null;
      } else {
        pageInfo = null;
      }
    } while (pageInfo);

    const products = allProducts;

    console.log(`Fetched ${products.length} products from Shopify`);

    // Log tag parsing for debugging
    if (products.length > 0) {
      const sampleProduct = products[0];
      console.log(`Sample product tags: ${sampleProduct.tags}`);
      console.log(`Sample product type: ${sampleProduct.product_type}`);
    }

    // Map Shopify products to brand_products schema with FULL e-commerce data
    const mappedProducts = products.map((product: any) => {
      const firstVariant = product.variants?.[0] || {};

      // Generate handle from product title if not provided
      const handle = product.handle || product.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

      // Parse Shopify tags for Madison-specific metadata
      const rawTags = product.tags ? product.tags.split(',').map((t: string) => t.trim()) : [];

      // Extract collection from tags (e.g., "collection:Humanities")
      const collectionTag = rawTags.find((tag: string) => tag.startsWith('collection:'));
      const collection = collectionTag
        ? collectionTag.replace('collection:', '').trim()
        : product.product_type || 'Uncategorized';

      // Extract scent_family from tags (e.g., "scent_family:warm")
      const scentFamilyTag = rawTags.find((tag: string) => tag.startsWith('scent_family:'));
      const scent_family = scentFamilyTag
        ? scentFamilyTag.replace('scent_family:', '').trim()
        : null;

      // Extract tone from tags (e.g., "tone:elegant")
      const toneTag = rawTags.find((tag: string) => tag.startsWith('tone:'));
      const tone = toneTag ? toneTag.replace('tone:', '').trim() : null;

      // Strip HTML from body_html for description
      const description = product.body_html
        ? product.body_html
            .replace(/<[^>]*>/g, '') // Remove HTML tags
            .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
            .replace(/&amp;/g, '&')  // Decode &amp;
            .replace(/&lt;/g, '<')   // Decode &lt;
            .replace(/&gt;/g, '>')   // Decode &gt;
            .replace(/&quot;/g, '"') // Decode &quot;
            .replace(/&#39;/g, "'")  // Decode &#39;
            .trim()
        : null;

      // Map ALL variants with full details
      const variants = (product.variants || []).map((v: any, index: number) => ({
        id: v.id?.toString(),
        title: v.title || `Variant ${index + 1}`,
        sku: v.sku || null,
        price: parseFloat(v.price) || 0,
        compare_at_price: v.compare_at_price ? parseFloat(v.compare_at_price) : null,
        inventory_quantity: v.inventory_quantity || 0,
        inventory_policy: v.inventory_policy || 'deny',
        option1: v.option1 || null,
        option2: v.option2 || null,
        option3: v.option3 || null,
        barcode: v.barcode || null,
        weight: v.weight || null,
        weight_unit: v.weight_unit || 'lb',
        requires_shipping: v.requires_shipping !== false,
        shopify_variant_id: v.id?.toString(),
        position: v.position || index + 1,
      }));

      // Map product options (Size, Color, etc.)
      const options = (product.options || []).map((opt: any) => ({
        name: opt.name,
        values: opt.values || [],
        position: opt.position,
      }));

      // Map product images
      const images = (product.images || []).map((img: any) => ({
        id: img.id?.toString(),
        src: img.src,
        position: img.position,
        alt: img.alt || product.title,
        width: img.width,
        height: img.height,
        shopify_image_id: img.id?.toString(),
      }));

      // Get featured image
      const featuredImage = product.image?.src || images[0]?.src || null;

      // Filter regular tags (exclude Madison-specific tags)
      const tags = rawTags.filter((tag: string) =>
        !tag.startsWith('collection:') &&
        !tag.startsWith('scent_family:') &&
        !tag.startsWith('tone:')
      );

      return {
        organization_id,
        name: product.title,
        handle: handle,
        collection: collection,
        scent_family: scent_family,
        category: 'personal_fragrance',
        product_type: product.product_type,
        shopify_product_id: product.id.toString(),
        shopify_variant_id: firstVariant.id?.toString(),
        shopify_sync_status: 'synced',
        last_shopify_sync: new Date().toISOString(),
        description: description,
        usp: null, // To be filled manually with selling points
        tone: tone,
        // NEW E-COMMERCE FIELDS
        sku: firstVariant.sku || null,
        barcode: firstVariant.barcode || null,
        price: parseFloat(firstVariant.price) || null,
        compare_at_price: firstVariant.compare_at_price ? parseFloat(firstVariant.compare_at_price) : null,
        inventory_quantity: firstVariant.inventory_quantity || 0,
        inventory_policy: firstVariant.inventory_policy || 'deny',
        track_inventory: firstVariant.inventory_management === 'shopify',
        weight: firstVariant.weight || null,
        weight_unit: firstVariant.weight_unit || 'lb',
        requires_shipping: firstVariant.requires_shipping !== false,
        variants: JSON.stringify(variants),
        options: JSON.stringify(options),
        images: JSON.stringify(images),
        featured_image_url: featuredImage,
        vendor: product.vendor || null,
        status: product.status || 'active',
        published_at: product.published_at || null,
        tags: tags,
        seo_title: product.metafields_global_title_tag || null,
        seo_description: product.metafields_global_description_tag || null,
      };
    });

    console.log(`Processing ${mappedProducts.length} products for sync`);

    // Fetch existing products by NAME (since CSV products don't have handles)
    const names = mappedProducts.map((p: any) => p.name);

    const { data: existingProducts } = await supabase
      .from('brand_products')
      .select('id, name, handle, shopify_product_id, description, collection, scent_family, tone, sku, price, variants, images')
      .eq('organization_id', organization_id)
      .in('name', names);

    const existingByName = new Map(existingProducts?.map(p => [p.name, p]) || []);
    const existingByShopifyId = new Map(existingProducts?.map(p => [p.shopify_product_id, p]) || []);

    let updatedCount = 0;
    let insertedCount = 0;

    // Process each product - match by NAME first (for CSV products), fallback to shopify_product_id
    for (const product of mappedProducts) {
      const existingByNameMatch = existingByName.get(product.name);
      const existingByShopifyMatch = existingByShopifyId.get(product.shopify_product_id);
      const existing = existingByNameMatch || existingByShopifyMatch;

      if (existing) {
        // Update existing product - Update Shopify-specific fields + e-commerce data
        // DO NOT overwrite rich 49-field CSV data (visual DNA, archetypes, etc.)
        const updateData: any = {
          // Core Shopify sync fields - always update
          shopify_product_id: product.shopify_product_id,
          shopify_variant_id: product.shopify_variant_id,
          shopify_sync_status: product.shopify_sync_status,
          last_shopify_sync: product.last_shopify_sync,
          handle: product.handle,

          // E-commerce fields - always sync from Shopify (source of truth for pricing/inventory)
          sku: product.sku,
          barcode: product.barcode,
          price: product.price,
          compare_at_price: product.compare_at_price,
          inventory_quantity: product.inventory_quantity,
          inventory_policy: product.inventory_policy,
          track_inventory: product.track_inventory,
          weight: product.weight,
          weight_unit: product.weight_unit,
          requires_shipping: product.requires_shipping,
          variants: product.variants,
          options: product.options,
          images: product.images,
          featured_image_url: product.featured_image_url,
          vendor: product.vendor,
          status: product.status,
          published_at: product.published_at,
          tags: product.tags,
        };

        // Only update these fields if they're currently empty (preserve manual edits)
        if (!existing.description || existing.description.length < 50) {
          updateData.description = product.description;
        }
        if (!existing.collection) {
          updateData.collection = product.collection;
        }
        if (!existing.scent_family) {
          updateData.scent_family = product.scent_family;
        }
        if (!existing.tone) {
          updateData.tone = product.tone;
        }

        const { error } = await supabase
          .from('brand_products')
          .update(updateData)
          .eq('id', existing.id);

        if (error) throw error;
        updatedCount++;
      } else {
        // Insert new product from Shopify
        const { error } = await supabase
          .from('brand_products')
          .insert([product]);

        if (error) throw error;
        insertedCount++;
      }
    }

    console.log(`Successfully synced: ${updatedCount} updated, ${insertedCount} new products`);

    // Update connection sync timestamp
    await supabase
      .from('shopify_connections')
      .update({
        last_synced_at: new Date().toISOString(),
        sync_status: 'idle'
      })
      .eq('id', connection.id);

    return new Response(
      JSON.stringify({
        success: true,
        updated: updatedCount,
        inserted: insertedCount,
        total: updatedCount + insertedCount,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Error syncing Shopify products:', error);

    // Provide more detailed error information
    let errorMessage = error.message || 'Unknown error occurred';
    let statusCode = 400;

    // Handle specific error cases
    if (errorMessage.includes('missing encrypted token data')) {
      errorMessage = 'Shopify connection needs to be reconnected. Please disconnect and reconnect your Shopify account.';
      statusCode = 400;
    } else if (errorMessage.includes('Failed to decrypt')) {
      errorMessage = 'Token decryption failed. Please reconnect your Shopify account.';
      statusCode = 500;
    } else if (errorMessage.includes('encryption key not configured')) {
      errorMessage = 'Server configuration error. Please contact support.';
      statusCode = 500;
    } else if (errorMessage.includes('Shopify API error')) {
      // Keep the Shopify API error message but make it more user-friendly
      statusCode = 400;
    } else if (errorMessage.includes('connection not found')) {
      errorMessage = 'Shopify connection not found. Please reconnect your Shopify account.';
      statusCode = 404;
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: statusCode,
      }
    );
  }
});
