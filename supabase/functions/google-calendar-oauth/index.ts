import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import {
  defaultTrustedAppOrigin,
  generateOAuthNonce,
  parseSignedOAuthState,
  signOAuthNonce,
  trustedAppOrigin,
} from "../_shared/oauthState.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Encrypt and store Google tokens in application table (no Vault)
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function encryptText(plain: string, keyB64: string): Promise<{ ciphertextB64: string; ivB64: string }> {
  const keyBytes = base64ToBytes(keyB64);
  // Create a fresh ArrayBuffer to satisfy Deno's BufferSource typing
  const keyCopy = new Uint8Array(keyBytes.length);
  keyCopy.set(keyBytes);
  const keyBuffer: ArrayBuffer = keyCopy.buffer;
  const cryptoKey = await crypto.subtle.importKey('raw', keyBuffer, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plain);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, encoded);
  return { ciphertextB64: bytesToBase64(new Uint8Array(ciphertext)), ivB64: bytesToBase64(iv) };
}

async function storeTokensEncrypted(
  supabase: any,
  userId: string,
  accessToken: string,
  refreshToken: string,
  tokenExpiry: Date
): Promise<void> {
  const ENC_KEY = Deno.env.get('GOOGLE_TOKEN_ENCRYPTION_KEY');
  if (!ENC_KEY) throw new Error('Token encryption key not configured');

  console.log(`Encrypting Google tokens for user ${userId}`);
  const { ciphertextB64: encAccess, ivB64: ivAccess } = await encryptText(accessToken, ENC_KEY);
  const { ciphertextB64: encRefresh, ivB64: ivRefresh } = await encryptText(refreshToken, ENC_KEY);

  // Check if record exists for this user
  const { data: existing, error: fetchErr } = await supabase
    .from('google_calendar_tokens')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchErr) {
    console.error('Error querying google_calendar_tokens:', fetchErr);
    throw new Error('Failed to query token storage');
  }

  if (existing?.id) {
    const { error: updateErr } = await supabase
      .from('google_calendar_tokens')
      .update({
        encrypted_access_token: encAccess,
        access_token_iv: ivAccess,
        encrypted_refresh_token: encRefresh,
        refresh_token_iv: ivRefresh,
        token_expiry: tokenExpiry.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);

    if (updateErr) {
      console.error('Error updating encrypted tokens:', updateErr);
      throw new Error('Failed to update encrypted tokens');
    }
    console.log('Updated encrypted Google tokens');
  } else {
    const { error: insertErr } = await supabase.from('google_calendar_tokens').insert({
      user_id: userId,
      encrypted_access_token: encAccess,
      access_token_iv: ivAccess,
      encrypted_refresh_token: encRefresh,
      refresh_token_iv: ivRefresh,
      token_expiry: tokenExpiry.toISOString(),
    });

    if (insertErr) {
      console.error('Error inserting encrypted tokens:', insertErr);
      throw new Error('Failed to insert encrypted tokens');
    }
    console.log('Stored encrypted Google tokens');
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.split('/').pop();

    const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
    const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      throw new Error('Google OAuth credentials not configured');
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Step 1: Redirect to Google OAuth consent screen
    if (path === 'auth') {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        throw new Error('No authorization header');
      }

      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      
      if (authError || !user) {
        throw new Error('Unauthorized');
      }

      const body = await req.json().catch(() => ({}));
      const frontendUrl = Deno.env.get('FRONTEND_URL');
      const appOrigin = trustedAppOrigin(body?.app_origin, frontendUrl)
        ?? defaultTrustedAppOrigin(frontendUrl);

      const hmacSecret = Deno.env.get('GOOGLE_TOKEN_ENCRYPTION_KEY');
      if (!hmacSecret) {
        throw new Error('Token encryption key not configured');
      }

      const nonce = generateOAuthNonce();
      const state = await signOAuthNonce(nonce, hmacSecret);
      const { error: stateErr } = await supabase.from('google_calendar_oauth_states').insert({
        user_id: user.id,
        nonce,
        app_origin: appOrigin,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });
      if (stateErr) {
        console.error('Failed to store Google Calendar OAuth state:', stateErr);
        throw new Error('Failed to initiate OAuth flow');
      }

      const redirectUri = `${SUPABASE_URL}/functions/v1/google-calendar-oauth/callback`;
      
      const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      googleAuthUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
      googleAuthUrl.searchParams.set('redirect_uri', redirectUri);
      googleAuthUrl.searchParams.set('response_type', 'code');
      googleAuthUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/calendar');
      googleAuthUrl.searchParams.set('access_type', 'offline');
      googleAuthUrl.searchParams.set('prompt', 'consent');
      googleAuthUrl.searchParams.set('state', state);

      return new Response(JSON.stringify({ authUrl: googleAuthUrl.toString() }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 2: Handle OAuth callback from Google
    if (path === 'callback') {
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');
      const hmacSecret = Deno.env.get('GOOGLE_TOKEN_ENCRYPTION_KEY');
      const fallbackOrigin = defaultTrustedAppOrigin(Deno.env.get('FRONTEND_URL'));

      const parsedState = hmacSecret ? await parseSignedOAuthState(state, hmacSecret) : null;
      let userId: string | null = null;
      let appOrigin = fallbackOrigin;

      if (parsedState) {
        const { data: consumed, error: consumeErr } = await supabase
          .from('google_calendar_oauth_states')
          .update({ used_at: new Date().toISOString() })
          .eq('nonce', parsedState.nonce)
          .is('used_at', null)
          .gt('expires_at', new Date().toISOString())
          .select('user_id, app_origin')
          .maybeSingle();

        if (consumeErr) {
          console.error('Failed to consume Google Calendar OAuth state:', consumeErr);
        }
        if (consumed?.user_id) {
          userId = consumed.user_id;
          const storedOrigin = trustedAppOrigin(consumed.app_origin, Deno.env.get('FRONTEND_URL'));
          if (storedOrigin) appOrigin = storedOrigin;
        }
      }

      if (error) {
        console.error('OAuth error:', error);
        return Response.redirect(`${appOrigin}/schedule?error=access_denied`);
      }

      if (!code || !state || !userId) {
        return new Response(JSON.stringify({ error: 'Invalid or expired OAuth state' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const redirectUri = `${SUPABASE_URL}/functions/v1/google-calendar-oauth/callback`;

      // Exchange authorization code for tokens
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text();
        console.error('Token exchange failed:', errorData);
        throw new Error('Failed to exchange authorization code');
      }

      const tokens = await tokenResponse.json();
      const { access_token, refresh_token, expires_in } = tokens;

      if (!refresh_token) {
        throw new Error('No refresh token received. User may need to revoke access and re-authorize.');
      }

      const tokenExpiry = new Date(Date.now() + expires_in * 1000);

      // Encrypt and store tokens in application table (no Vault)
      await storeTokensEncrypted(supabase, userId, access_token, refresh_token, tokenExpiry);

      // Enable sync by default
      await supabase
        .from('google_calendar_sync')
        .upsert({
          user_id: userId,
          sync_enabled: true,
          calendar_id: 'primary',
        }, {
          onConflict: 'user_id'
        });

      console.log('Successfully stored tokens for user:', userId);

      // Redirect back to schedule page with success
      return Response.redirect(`${appOrigin}/schedule?connected=true`);
    }

    return new Response(JSON.stringify({ error: 'Invalid endpoint' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('OAuth function error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
