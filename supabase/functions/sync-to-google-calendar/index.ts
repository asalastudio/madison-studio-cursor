import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";


// Decrypt tokens from google_calendar_tokens table
function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
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

async function encryptText(plain: string, keyB64: string): Promise<{ ciphertextB64: string; ivB64: string }> {
  const keyBytes = base64ToBytes(keyB64);
  const keyCopy = new Uint8Array(keyBytes.length);
  keyCopy.set(keyBytes);
  const keyBuffer: ArrayBuffer = keyCopy.buffer;
  const cryptoKey = await crypto.subtle.importKey('raw', keyBuffer, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plain);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, encoded);
  return { ciphertextB64: bytesToBase64(new Uint8Array(ciphertext)), ivB64: bytesToBase64(iv) };
}

interface SyncRequest {
  operation: 'create' | 'update' | 'delete';
  scheduledContentId: string;
  eventData?: {
    title: string;
    date: string;
    time?: string;
    notes?: string;
    platform?: string;
  };
  googleEventId?: string;
}

serve(async (req) => {
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;
  const corsHeaders = getCorsHeaders(req);
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { operation, scheduledContentId, eventData, googleEventId }: SyncRequest = await req.json();

    console.log('Sync operation:', operation, 'for user:', user.id);

    // Get user's encrypted tokens from google_calendar_tokens table
    const { data: tokenData, error: tokenError } = await supabaseClient
      .from('google_calendar_tokens')
      .select('encrypted_access_token, access_token_iv, encrypted_refresh_token, refresh_token_iv, token_expiry')
      .eq('user_id', user.id)
      .maybeSingle();

    if (tokenError || !tokenData) {
      throw new Error('Google Calendar not connected. Please connect your Google Calendar first.');
    }

    if (!tokenData.encrypted_access_token || !tokenData.encrypted_refresh_token) {
      throw new Error('Invalid tokens. Please reconnect your Google Calendar.');
    }

    const ENC_KEY = Deno.env.get('GOOGLE_TOKEN_ENCRYPTION_KEY');
    if (!ENC_KEY) throw new Error('Token encryption key not configured');

    // Decrypt tokens
    const refreshToken = await decryptText(tokenData.encrypted_refresh_token, tokenData.refresh_token_iv, ENC_KEY);
    
    // Check if access token is expired and refresh if needed
    let accessToken: string;
    const tokenExpiry = new Date(tokenData.token_expiry);
    const now = new Date();

    if (now >= tokenExpiry) {
      console.log('Access token expired, refreshing...');
      const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: Deno.env.get('GOOGLE_CLIENT_ID'),
          client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET'),
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      if (!refreshResponse.ok) {
        throw new Error('Failed to refresh access token');
      }

      const refreshData = await refreshResponse.json();
      accessToken = refreshData.access_token;

      // Encrypt and update new access token
      const { ciphertextB64: encAccess, ivB64: ivAccess } = await encryptText(accessToken, ENC_KEY);
      
      await supabaseClient
        .from('google_calendar_tokens')
        .update({
          encrypted_access_token: encAccess,
          access_token_iv: ivAccess,
          token_expiry: new Date(Date.now() + refreshData.expires_in * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);
    } else {
      // Decrypt existing access token
      accessToken = await decryptText(tokenData.encrypted_access_token, tokenData.access_token_iv, ENC_KEY);
    }

    // Get calendar ID and timezone from settings
    const { data: syncSettings } = await supabaseClient
      .from('google_calendar_sync')
      .select('calendar_id, sync_enabled')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!syncSettings?.sync_enabled) {
      throw new Error('Google Calendar sync is disabled');
    }

    const { data: calendarSettings } = await supabaseClient
      .from('calendar_settings')
      .select('timezone')
      .eq('user_id', user.id)
      .maybeSingle();

    const calendarId = syncSettings.calendar_id || 'primary';
    const timezone = calendarSettings?.timezone || 'America/Los_Angeles';

    let result: any = {};

    if (operation === 'create' && eventData) {
      // Create Google Calendar event
      const event: any = {
        summary: eventData.title,
        description: `${eventData.notes || ''}\n\nPlatform: ${eventData.platform || 'N/A'}`,
      };

      // Handle date/time properly for Google Calendar API
      if (eventData.time) {
        // Specific time - use dateTime with timezone
        const normalizedTime = ensureHms(eventData.time);
        const normalizedEndTime = addHour(eventData.time);
        const startDateTime = `${eventData.date}T${normalizedTime}`;
        const endDateTime = `${eventData.date}T${normalizedEndTime}`;
        
        event.start = {
          dateTime: startDateTime,
          timeZone: timezone,
        };
        event.end = {
          dateTime: endDateTime,
          timeZone: timezone,
        };
      } else {
        // All-day event - use date field only (end date is exclusive, so next day)
        event.start = {
          date: eventData.date,
        };
        event.end = {
          date: addOneDay(eventData.date),
        };
      }

      console.log('Creating Google Calendar event:', JSON.stringify(event, null, 2));

      const createResponse = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(event),
        }
      );

      if (!createResponse.ok) {
        const error = await createResponse.text();
        console.error('Google Calendar API error:', error);
        throw new Error('Failed to create Google Calendar event');
      }

      result = await createResponse.json();

      // Update scheduled_content with google_event_id and sync_status
      await supabaseClient
        .from('scheduled_content')
        .update({
          google_event_id: result.id,
          sync_status: 'synced',
        })
        .eq('id', scheduledContentId);

    } else if (operation === 'update' && eventData && googleEventId) {
      // Update Google Calendar event
      const event: any = {
        summary: eventData.title,
        description: `${eventData.notes || ''}\n\nPlatform: ${eventData.platform || 'N/A'}`,
      };

      // Handle date/time properly for Google Calendar API
      if (eventData.time) {
        // Specific time - use dateTime with timezone
        const normalizedTime = ensureHms(eventData.time);
        const normalizedEndTime = addHour(eventData.time);
        const startDateTime = `${eventData.date}T${normalizedTime}`;
        const endDateTime = `${eventData.date}T${normalizedEndTime}`;
        
        event.start = {
          dateTime: startDateTime,
          timeZone: timezone,
        };
        event.end = {
          dateTime: endDateTime,
          timeZone: timezone,
        };
      } else {
        // All-day event - use date field only (end date is exclusive, so next day)
        event.start = {
          date: eventData.date,
        };
        event.end = {
          date: addOneDay(eventData.date),
        };
      }

      console.log('Updating Google Calendar event:', JSON.stringify(event, null, 2));

      const updateResponse = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${googleEventId}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(event),
        }
      );

      if (!updateResponse.ok) {
        const error = await updateResponse.text();
        console.error('Google Calendar API error:', error);
        throw new Error('Failed to update Google Calendar event');
      }

      result = await updateResponse.json();

      // Update sync_status
      await supabaseClient
        .from('scheduled_content')
        .update({ sync_status: 'synced' })
        .eq('id', scheduledContentId);

    } else if (operation === 'delete' && googleEventId) {
      // Delete Google Calendar event
      const deleteResponse = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${googleEventId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      if (!deleteResponse.ok && deleteResponse.status !== 404) {
        const error = await deleteResponse.text();
        console.error('Google Calendar API error:', error);
        throw new Error('Failed to delete Google Calendar event');
      }

      result = { deleted: true };
    }

    return new Response(
      JSON.stringify({ success: true, result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in sync-to-google-calendar:', error);
    
    // Update sync_status to failed if scheduledContentId is available
    if (error.scheduledContentId) {
      try {
        const supabaseClient = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );
        
        await supabaseClient
          .from('scheduled_content')
          .update({ sync_status: 'failed' })
          .eq('id', error.scheduledContentId);
      } catch (updateError) {
        console.error('Failed to update sync_status:', updateError);
      }
    }

    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

// Helper function to normalize time to HH:MM:SS format
function ensureHms(time: string): string {
  const parts = time.split(':');
  if (parts.length === 2) {
    // HH:MM -> HH:MM:SS
    const [hh, mm] = parts;
    return `${hh.padStart(2, '0')}:${mm.padStart(2, '0')}:00`;
  }
  if (parts.length >= 3) {
    // HH:MM:SS (or more) -> HH:MM:SS
    const [hh, mm, ss = '00'] = parts;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  }
  // Fallback: append :00:00
  return `${time.padStart(2, '0')}:00:00`;
}

// Helper function to add one hour to a time string (returns HH:MM:SS)
function addHour(time: string): string {
  const normalized = ensureHms(time);
  const [hours, minutes, seconds] = normalized.split(':').map(Number);
  const newHours = (hours + 1) % 24;
  return `${String(newHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Helper function to add one day to a date string (YYYY-MM-DD)
function addOneDay(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().split('T')[0];
}
