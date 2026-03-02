import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";


Deno.serve(async (req) => {
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;
  const corsHeaders = getCorsHeaders(req);
  }

  try {
    // 1️⃣ Extract the Authorization header
    const authHeader = req.headers.get('Authorization');
    console.log('Auth header check:', {
      hasAuthHeader: !!authHeader,
      authHeaderPrefix: authHeader?.substring(0, 20) + '...'
    });

    if (!authHeader) {
      return new Response(
        JSON.stringify({ ok: false, message: '❌ Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2️⃣ Create Supabase client with the incoming user's token
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // 3️⃣ Try to fetch the current user
    const { data: { user }, error } = await supabase.auth.getUser();

    console.log('User fetch result:', {
      hasUser: !!user,
      userId: user?.id,
      userEmail: user?.email,
      error: error?.message
    });

    // 4️⃣ Return clear results for debugging
    if (error) {
      return new Response(
        JSON.stringify({ 
          ok: false, 
          message: 'Auth error', 
          error: error.message 
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!user) {
      return new Response(
        JSON.stringify({ 
          ok: false, 
          message: 'No user found, token invalid or expired' 
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5️⃣ Success — token is valid
    return new Response(
      JSON.stringify({
        ok: true,
        message: '✅ Token recognized successfully',
        user: {
          id: user.id,
          email: user.email,
          created_at: user.created_at
        },
        receivedAuthHeader: authHeader.split(' ')[0] + ' ***' // just to confirm header arrived
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('Unexpected error in check-auth:', err);
    return new Response(
      JSON.stringify({ 
        ok: false, 
        message: 'Unexpected error', 
        error: err instanceof Error ? err.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
