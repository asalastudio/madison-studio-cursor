import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import Stripe from "npm:stripe@14.21.0";
import { must, resolvePlanId } from "../_shared/stripeBilling.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!;
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
});

// Deno has no sync HMAC; constructEvent() throws "SubtleCryptoProvider cannot be
// used in a synchronous context", so every webhook was rejected as a bad signature.
const cryptoProvider = Stripe.createSubtleCryptoProvider();

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const signature = req.headers.get('stripe-signature');
    if (!signature) {
      return new Response(
        JSON.stringify({ error: 'Missing stripe-signature header' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.text();
    let event: Stripe.Event;

    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, STRIPE_WEBHOOK_SECRET, undefined, cryptoProvider);
    } catch (err) {
      console.error('Webhook signature verification failed:', err instanceof Error ? err.message : 'unknown');
      return new Response(
        JSON.stringify({ error: 'Webhook signature verification failed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle different event types
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdate(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionCanceled(subscription);
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaid(invoice);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaymentFailed(invoice);
        break;
      }

      case 'payment_method.attached': {
        const paymentMethod = event.data.object as Stripe.PaymentMethod;
        await handlePaymentMethodAttached(paymentMethod);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(
      JSON.stringify({ received: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(
      JSON.stringify({ error: 'Webhook handler failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  let organizationId = subscription.metadata.organization_id;
  let planId = subscription.metadata.plan_id;

  // If metadata is missing, try to get from existing subscription
  if (!organizationId || !planId) {
    const { data: existingSub } = await supabase
      .from('subscriptions')
      .select('organization_id, plan_id')
      .eq('stripe_subscription_id', subscription.id)
      .maybeSingle();

    if (existingSub) {
      organizationId = organizationId || existingSub.organization_id;
      planId = planId || existingSub.plan_id;
    }

    // If still missing organization_id, try to get from customer metadata
    if (!organizationId && subscription.customer) {
      try {
        const customer = await stripe.customers.retrieve(subscription.customer as string) as Stripe.Customer;
        organizationId = customer.metadata?.organization_id || organizationId;
      } catch (err) {
        console.error('Error fetching customer:', err);
      }
    }

  }

  if (!organizationId) {
    console.error('Missing organization_id in subscription:', subscription.id);
    return;
  }

  // The live price wins (portal upgrades keep the old metadata). Metadata may
  // hold a legacy slug ("studio"); resolvePlanId maps that too.
  const priceId = subscription.items?.data?.[0]?.price?.id ?? null;
  planId = (await resolvePlanId(supabase, null, priceId)) ?? (await resolvePlanId(supabase, planId, null));
  if (!planId) {
    // Throw so Stripe retries once the plan/price mapping is fixed.
    throw new Error(`No subscription_plans row for subscription ${subscription.id}`);
  }


  // Upsert subscription
  const { error } = await supabase
    .from('subscriptions')
    .upsert({
      stripe_subscription_id: subscription.id,
      stripe_customer_id: subscription.customer as string,
      organization_id: organizationId,
      plan_id: planId,
      status: subscription.status,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end,
      canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null,
      trial_start: subscription.trial_start ? new Date(subscription.trial_start * 1000).toISOString() : null,
      trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
    }, {
      onConflict: 'stripe_subscription_id',
    });

  must({ error }, 'upsert subscription');

  // Update organization subscription_id
  const { data: subRecord } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('stripe_subscription_id', subscription.id)
    .single();

  if (subRecord) {
    must(await supabase
      .from('organizations')
      .update({ subscription_id: subRecord.id })
      .eq('id', organizationId), 'link organization subscription');
  }
}

async function handleSubscriptionCanceled(subscription: Stripe.Subscription) {
  let organizationId = subscription.metadata.organization_id;

  // If metadata is missing, try to get from existing subscription
  if (!organizationId) {
    const { data: existingSub } = await supabase
      .from('subscriptions')
      .select('organization_id')
      .eq('stripe_subscription_id', subscription.id)
      .maybeSingle();

    if (existingSub) {
      organizationId = existingSub.organization_id;
    }

    // If still missing, try to get from customer metadata
    if (!organizationId && subscription.customer) {
      try {
        const customer = await stripe.customers.retrieve(subscription.customer as string) as Stripe.Customer;
        organizationId = customer.metadata?.organization_id || organizationId;
      } catch (err) {
        console.error('Error fetching customer:', err);
      }
    }
  }

  if (!organizationId) {
    console.error('Missing organization_id in subscription:', subscription.id);
    return;
  }

  // Update subscription status
  await supabase
    .from('subscriptions')
    .update({
      status: 'canceled',
      canceled_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', subscription.id);

  // Remove subscription_id from organization
  await supabase
    .from('organizations')
    .update({ subscription_id: null })
    .eq('id', organizationId);
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const subscriptionId = invoice.subscription as string;
  if (!subscriptionId) return;

  // Get subscription to find organization
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('id, organization_id')
    .eq('stripe_subscription_id', subscriptionId)
    .single();

  if (!subscription) {
    console.error('Subscription not found for invoice:', invoice.id);
    return;
  }

  // Create or update invoice record
  await supabase
    .from('invoices')
    .upsert({
      stripe_invoice_id: invoice.id,
      stripe_charge_id: invoice.charge as string || null,
      organization_id: subscription.organization_id,
      subscription_id: subscription.id,
      amount: invoice.amount_paid,
      currency: invoice.currency,
      status: invoice.status || 'paid',
      invoice_pdf_url: invoice.invoice_pdf || null,
      hosted_invoice_url: invoice.hosted_invoice_url || null,
      period_start: invoice.period_start ? new Date(invoice.period_start * 1000).toISOString() : null,
      period_end: invoice.period_end ? new Date(invoice.period_end * 1000).toISOString() : null,
      paid_at: invoice.status_transitions?.paid_at ? new Date(invoice.status_transitions.paid_at * 1000).toISOString() : null,
    }, {
      onConflict: 'stripe_invoice_id',
    });
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = invoice.subscription as string;
  if (!subscriptionId) return;

  // Get subscription
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('id, organization_id')
    .eq('stripe_subscription_id', subscriptionId)
    .single();

  if (!subscription) return;

  // Update invoice status
  await supabase
    .from('invoices')
    .upsert({
      stripe_invoice_id: invoice.id,
      organization_id: subscription.organization_id,
      subscription_id: subscription.id,
      amount: invoice.amount_due,
      currency: invoice.currency,
      status: 'open',
      period_start: invoice.period_start ? new Date(invoice.period_start * 1000).toISOString() : null,
      period_end: invoice.period_end ? new Date(invoice.period_end * 1000).toISOString() : null,
    }, {
      onConflict: 'stripe_invoice_id',
    });

  // Update subscription status if needed
  await supabase
    .from('subscriptions')
    .update({ status: 'past_due' })
    .eq('stripe_subscription_id', subscriptionId);
}

async function handlePaymentMethodAttached(paymentMethod: Stripe.PaymentMethod) {
  const customerId = paymentMethod.customer as string;
  if (!customerId) return;

  // Get subscription to find organization
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('organization_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();

  if (!subscription) return;

  // Get card details
  if (paymentMethod.type === 'card' && paymentMethod.card) {
    await supabase
      .from('payment_methods')
      .upsert({
        stripe_payment_method_id: paymentMethod.id,
        stripe_customer_id: customerId,
        organization_id: subscription.organization_id,
        type: 'card',
        card_brand: paymentMethod.card.brand,
        card_last4: paymentMethod.card.last4,
        card_exp_month: paymentMethod.card.exp_month,
        card_exp_year: paymentMethod.card.exp_year,
        is_default: paymentMethod.id === (await stripe.customers.retrieve(customerId) as Stripe.Customer).invoice_settings?.default_payment_method as string,
      }, {
        onConflict: 'stripe_payment_method_id',
      });
  }
}









