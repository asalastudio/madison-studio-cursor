import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import Stripe from "npm:stripe@14.21.0";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";
import { checkRateLimit } from "../_shared/rateLimit.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!;
const APP_URL = Deno.env.get('APP_URL') || 'http://localhost:5173';

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
});

serve(async (req) => {
  // Handle CORS preflight
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[create-checkout-session] Missing authorization header');
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract token from header
    const token = authHeader.replace('Bearer ', '').trim();
    
    console.log('[create-checkout-session] Token received, length:', token?.length);
    console.log('[create-checkout-session] SUPABASE_URL:', SUPABASE_URL ? 'set' : 'NOT SET');
    console.log('[create-checkout-session] SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY ? 'set' : 'NOT SET');
    
    // Create Supabase client with service role for database operations
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify the user's JWT token
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    console.log('[create-checkout-session] Auth result - user:', user?.id, 'error:', userError?.message);
    
    if (userError || !user) {
      console.error('[create-checkout-session] Auth error:', userError?.message || 'No user found');
      return new Response(
        JSON.stringify({ error: 'Unauthorized', details: userError?.message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('[create-checkout-session] User authenticated:', user.id);

    // Rate limit check
    const { allowed, retryAfter } = checkRateLimit(`checkout:${user.id}`, 5, 60);
    if (!allowed) {
      return new Response(
        JSON.stringify({ error: "Too many requests. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(retryAfter) } }
      );
    }

    // Parse request body
    const { planId, billingInterval = 'month' } = await req.json();
    if (!planId) {
      return new Response(
        JSON.stringify({ error: 'Missing planId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get organization for user
    const { data: orgMember } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!orgMember) {
      return new Response(
        JSON.stringify({ error: 'No organization found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is owner/admin
    if (orgMember.role !== 'owner' && orgMember.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Only owners and admins can manage subscriptions' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const organizationId = orgMember.organization_id;

    // Get plan details - try by ID first, then by slug (for fallback tier IDs)
    let plan = null;
    let planError = null;
    
    // Check if planId looks like a UUID
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(planId);
    
    if (isUUID) {
      const result = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('id', planId)
        .eq('is_active', true)
        .single();
      plan = result.data;
      planError = result.error;
    } else {
      // Try by slug (for fallback tier IDs like 'essentials', 'studio', 'signature')
      const result = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('slug', planId)
        .eq('is_active', true)
        .single();
      plan = result.data;
      planError = result.error;
    }

    if (planError || !plan) {
      console.error('[create-checkout-session] Plan not found:', planId, planError?.message);
      return new Response(
        JSON.stringify({ error: `Plan not found: ${planId}` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('[create-checkout-session] Found plan:', plan.name, plan.id);

    // Get organization details
    const { data: organization } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', organizationId)
      .single();

    // Get or create Stripe customer
    let stripeCustomerId: string;

    // Check for existing subscription in our database
    const { data: existingSubscription } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (existingSubscription?.stripe_customer_id) {
      stripeCustomerId = existingSubscription.stripe_customer_id;
      console.log('[create-checkout-session] Using existing customer from subscription:', stripeCustomerId);
    } else {
      // No subscription record - check if customer already exists in Stripe by email
      try {
        const existingCustomers = await stripe.customers.list({
          email: user.email,
          limit: 1,
        });
        
        if (existingCustomers.data.length > 0) {
          stripeCustomerId = existingCustomers.data[0].id;
          console.log('[create-checkout-session] Found existing Stripe customer by email:', stripeCustomerId);
        } else {
          // Create new Stripe customer
          const customer = await stripe.customers.create({
            email: user.email,
            name: organization?.name || 'Organization',
            metadata: {
              organization_id: organizationId,
              user_id: user.id,
            },
          });
          stripeCustomerId = customer.id;
          console.log('[create-checkout-session] Created new Stripe customer:', stripeCustomerId);
        }
      } catch (stripeError) {
        console.error('[create-checkout-session] Error checking/creating Stripe customer:', stripeError);
        // Fallback: create new customer
        const customer = await stripe.customers.create({
          email: user.email,
          name: organization?.name || 'Organization',
          metadata: {
            organization_id: organizationId,
            user_id: user.id,
          },
        });
        stripeCustomerId = customer.id;
        console.log('[create-checkout-session] Created new Stripe customer (fallback):', stripeCustomerId);
      }
    }

    // Determine price ID based on billing interval
    const priceId = billingInterval === 'year' 
      ? plan.stripe_price_id_yearly 
      : plan.stripe_price_id_monthly;

    if (!priceId) {
      return new Response(
        JSON.stringify({ error: `Price ID not configured for ${billingInterval} billing` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${APP_URL}/settings?tab=billing&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/settings?tab=billing&canceled=true`,
      metadata: {
        organization_id: organizationId,
        plan_id: planId,
        billing_interval: billingInterval,
      },
      subscription_data: {
        metadata: {
          organization_id: organizationId,
          plan_id: planId,
        },
      },
    });

    return new Response(
      JSON.stringify({ 
        sessionId: session.id,
        url: session.url 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});



