import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { encryptToken } from "../_shared/encryption.ts";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";

async function storeConnectionEncrypted(
  supabase: any,
  organizationId: string,
  shopDomain: string,
  accessToken: string
): Promise<void> {
  const ENC_KEY = Deno.env.get('SHOPIFY_TOKEN_ENCRYPTION_KEY');
  if (!ENC_KEY) throw new Error('Shopify token encryption key not configured');

  console.log(`Encrypting Shopify token for organization ${organizationId}`);
  const { ciphertextB64: encAccess, ivB64: ivAccess } = await encryptToken(accessToken, ENC_KEY);

  // Check if record exists for this organization
  const { data: existing, error: fetchErr } = await supabase
    .from('shopify_connections')
    .select('id')
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (fetchErr) {
    console.error('Error querying shopify_connections:', fetchErr);
    throw new Error('Failed to query connection storage');
  }

  if (existing?.id) {
    const { error: updateErr } = await supabase
      .from('shopify_connections')
      .update({
        shop_domain: shopDomain,
        access_token_encrypted: encAccess,
        access_token_iv: ivAccess,
        sync_status: 'idle',
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);

    if (updateErr) {
      console.error('Error updating encrypted connection:', updateErr);
      throw new Error('Failed to update encrypted connection');
    }
    console.log('Updated encrypted Shopify connection');
  } else {
    const { error: insertErr } = await supabase.from('shopify_connections').insert({
      organization_id: organizationId,
      shop_domain: shopDomain,
      access_token_encrypted: encAccess,
      access_token_iv: ivAccess,
      sync_status: 'idle',
    });

    if (insertErr) {
      console.error('Error inserting encrypted connection:', insertErr);
      throw new Error('Failed to insert encrypted connection');
    }
    console.log('Stored encrypted Shopify connection');
  }
}

serve(async (req) => {
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { organization_id, shop_domain, access_token } = await req.json();

    if (!organization_id || !shop_domain || !access_token) {
      throw new Error('Missing required fields: organization_id, shop_domain, access_token');
    }

    // Verify user has access to this organization
    const { data: orgMember, error: orgError } = await supabase
      .from('organization_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('organization_id', organization_id)
      .maybeSingle();

    if (orgError || !orgMember) {
      throw new Error('Organization access denied');
    }

    // Only admins and owners can manage connections
    if (orgMember.role !== 'owner' && orgMember.role !== 'admin') {
      throw new Error('Insufficient permissions');
    }

    // Encrypt and store the connection
    await storeConnectionEncrypted(supabase, organization_id, shop_domain, access_token);

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Error connecting Shopify:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
