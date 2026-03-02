import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";


Deno.serve(async (req) => {
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;
  const corsHeaders = getCorsHeaders(req);
  }

  try {
    // Log incoming headers for debugging
    console.log('Incoming headers:', {
      hasAuth: !!req.headers.get('Authorization'),
      authHeader: req.headers.get('Authorization')?.substring(0, 20) + '...'
    });

    // Extract token explicitly from Authorization header
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Bind token explicitly to auth.getUser()
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    
    console.log('Auth check result:', { 
      hasUser: !!user, 
      userId: user?.id,
      userError: userError?.message 
    });
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { listing_id, shopify_product_id } = await req.json();
    
    if (!listing_id) {
      return new Response(JSON.stringify({ error: 'listing_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Fetching listing:', listing_id);

    // Fetch the listing
    const { data: listing, error: listingError } = await supabaseClient
      .from('marketplace_listings')
      .select('*, brand_products(*)')
      .eq('id', listing_id)
      .single();

    if (listingError || !listing) {
      console.error('Error fetching listing:', listingError);
      return new Response(JSON.stringify({ error: 'Listing not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use passed shopify_product_id or fall back to listing's external_id
    const effectiveShopifyId = shopify_product_id || listing.external_id;
    if (!effectiveShopifyId) {
      return new Response(JSON.stringify({ error: 'Shopify Product ID required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Try environment secrets first (recommended), fall back to DB
    const envToken = Deno.env.get('SHOPIFY_ACCESS_TOKEN');
    const envDomain = Deno.env.get('SHOPIFY_SHOP_DOMAIN');
    
    let shopDomain = envDomain;
    let accessToken = envToken;
    
    // If no env secrets, try DB connection
    if (!shopDomain || !accessToken) {
      console.log('No env secrets found, fetching Shopify connection from DB for org:', listing.organization_id);
      
      const { data: connection, error: connectionError } = await supabaseClient
        .from('shopify_connections')
        .select('shop_domain, access_token_encrypted, access_token_iv')
        .eq('organization_id', listing.organization_id)
        .single();

      if (connectionError || !connection) {
        console.error('Error fetching Shopify connection:', connectionError);
        return new Response(JSON.stringify({ 
          error: 'Shopify not connected. Please add SHOPIFY_ACCESS_TOKEN and SHOPIFY_SHOP_DOMAIN secrets or connect via Settings.' 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!connection.access_token_encrypted || !connection.access_token_iv) {
        console.error('Shopify connection missing encrypted token data');
        return new Response(JSON.stringify({ 
          error: 'Shopify connection is missing encrypted token data. Please reconnect.' 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      shopDomain = connection.shop_domain;
      
      // Decrypt the access token
      const ENC_KEY = Deno.env.get('SHOPIFY_TOKEN_ENCRYPTION_KEY');
      if (!ENC_KEY) {
        console.error('Shopify token encryption key not configured');
        return new Response(JSON.stringify({ 
          error: 'Shopify token encryption key not configured' 
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Decrypt helper functions
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

      try {
        accessToken = await decryptText(connection.access_token_encrypted, connection.access_token_iv, ENC_KEY);
      } catch (decryptError) {
        console.error('Error decrypting Shopify token:', decryptError);
        return new Response(JSON.stringify({ 
          error: 'Failed to decrypt Shopify access token' 
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      console.log('Shopify connection found in DB and decrypted:', {
        shopDomain: shopDomain,
        hasAccessToken: !!accessToken,
      });
    } else {
      console.log('Using Shopify credentials from environment secrets');
    }
    
    // Validate credentials
    if (!shopDomain || !accessToken) {
      return new Response(JSON.stringify({ 
        error: 'Shopify credentials incomplete. Missing shop domain or access token.' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const platformData = listing.platform_data as any;
    
    // Helper: Convert plain text to HTML for Shopify
    const convertTextToHTML = (text: string): string => {
      if (!text) return '';
      const lines = text.split('\n');
      const output: string[] = [];
      let inBulletList = false;
      let inNumberedList = false;
      let paragraphBuffer: string[] = [];

      const flushParagraph = () => {
        if (paragraphBuffer.length > 0) {
          const content = paragraphBuffer.join('<br>\n').trim();
          if (content) output.push(`<p>${content}</p>`);
          paragraphBuffer = [];
        }
      };

      const closeLists = () => {
        if (inBulletList) { output.push('</ul>'); inBulletList = false; }
        if (inNumberedList) { output.push('</ol>'); inNumberedList = false; }
      };

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) { closeLists(); flushParagraph(); continue; }
        
        if (/^[-*]\s+/.test(trimmed)) {
          flushParagraph();
          if (inNumberedList) { output.push('</ol>'); inNumberedList = false; }
          if (!inBulletList) { output.push('<ul>'); inBulletList = true; }
          output.push(`<li>${trimmed.replace(/^[-*]\s+/, '')}</li>`);
          continue;
        }
        
        if (/^\d+\.\s+/.test(trimmed)) {
          flushParagraph();
          if (inBulletList) { output.push('</ul>'); inBulletList = false; }
          if (!inNumberedList) { output.push('<ol>'); inNumberedList = true; }
          output.push(`<li>${trimmed.replace(/^\d+\.\s+/, '')}</li>`);
          continue;
        }
        
        closeLists();
        paragraphBuffer.push(trimmed);
      }
      
      closeLists();
      flushParagraph();
      return output.join('\n');
    };
    
    // Build minimal product update payload with HTML-formatted description
    const descriptionHTML = convertTextToHTML(platformData?.description || '');
    const productUpdate = {
      product: {
        id: parseInt(effectiveShopifyId),
        body_html: descriptionHTML,
      },
    };

    console.log('Pushing to Shopify:', productUpdate);

    // Call Shopify Admin API 2025-10
    const shopifyUrl = `https://${shopDomain}/admin/api/2025-10/products/${effectiveShopifyId}.json`;
    console.log('Shopify API call:', {
      url: shopifyUrl,
      method: 'PUT',
      hasToken: !!accessToken,
      tokenPrefix: accessToken?.substring(0, 6) + '...',
      productId: effectiveShopifyId
    });
    
    const shopifyResponse = await fetch(shopifyUrl, {
      method: 'PUT',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(productUpdate),
    });

    if (!shopifyResponse.ok) {
      const errorText = await shopifyResponse.text();
      let errorDetails;
      try {
        errorDetails = JSON.parse(errorText);
      } catch {
        errorDetails = errorText;
      }

      console.error('Shopify API error:', {
        status: shopifyResponse.status,
        statusText: shopifyResponse.statusText,
        url: shopifyUrl,
        error: errorDetails
      });
      
      // Update listing with error
      await supabaseClient
        .from('marketplace_listings')
        .update({
          push_status: 'failed',
          push_error: errorText,
        })
        .eq('id', listing_id);

      // Return helpful error message
      let userMessage = 'Failed to push to Shopify';
      if (shopifyResponse.status === 401) {
        userMessage = 'Unauthorized: Please check your Shopify access token and ensure it has read_products and write_products scopes.';
      } else if (shopifyResponse.status === 404) {
        userMessage = 'Product not found in Shopify. Please verify the product ID.';
      }

      return new Response(JSON.stringify({ 
        error: userMessage,
        details: errorDetails,
        status: shopifyResponse.status
      }), {
        status: shopifyResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const shopifyData = await shopifyResponse.json();
    console.log('Shopify update successful:', shopifyData);

    // Update listing with success and save the effective Shopify ID
    await supabaseClient
      .from('marketplace_listings')
      .update({
        external_id: effectiveShopifyId,
        push_status: 'success',
        push_error: null,
        last_pushed_at: new Date().toISOString(),
      })
      .eq('id', listing_id);

    // Log to publish history
    await supabaseClient
      .from('shopify_publish_log')
      .insert({
        organization_id: listing.organization_id,
        product_id: listing.product_id,
        shopify_product_id: effectiveShopifyId,
        published_content: platformData,
        published_by: user.id,
      });

    return new Response(
      JSON.stringify({ 
        success: true,
        shopify_product_id: effectiveShopifyId,
        message: 'Successfully pushed to Shopify'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in update-shopify-product function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
