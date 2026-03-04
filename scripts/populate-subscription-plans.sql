-- Populate subscription_plans table with correct Stripe Price IDs
-- This ensures webhooks can properly match subscriptions to plans

-- First, clean up any existing plans (optional - comment out if you want to keep existing data)
-- DELETE FROM subscription_plans WHERE slug IN ('essentials', 'studio', 'signature');

-- Insert/Update Essentials plan
INSERT INTO subscription_plans (
  name,
  slug,
  description,
  price_monthly,
  price_yearly,
  stripe_price_id_monthly,
  stripe_price_id_yearly,
  features,
  is_active,
  sort_order
) VALUES (
  'Essentials',
  'essentials',
  'Perfect for small businesses and solo creators',
  2900,  -- $29.00
  29000,  -- $290.00/year (save $58)
  'price_1SbA3SRcevBEPUM5Dtsbo4l5',  -- Monthly price ID from .env
  'price_1SbA5hRcevBEPUM5vrXYqO20',  -- Yearly price ID from .env
  '[
    "10 master content pieces/month",
    "50 derivative assets/month",
    "100 AI-generated images/month",
    "1 brand, 10 products each",
    "Madison AI assistant (100 queries/month)",
    "2 team members"
  ]'::jsonb,
  true,
  1
)
ON CONFLICT (slug)
DO UPDATE SET
  stripe_price_id_monthly = EXCLUDED.stripe_price_id_monthly,
  stripe_price_id_yearly = EXCLUDED.stripe_price_id_yearly,
  price_monthly = EXCLUDED.price_monthly,
  price_yearly = EXCLUDED.price_yearly,
  features = EXCLUDED.features,
  is_active = EXCLUDED.is_active;

-- Insert/Update Studio plan
INSERT INTO subscription_plans (
  name,
  slug,
  description,
  price_monthly,
  price_yearly,
  stripe_price_id_monthly,
  stripe_price_id_yearly,
  features,
  is_active,
  sort_order
) VALUES (
  'Studio',
  'studio',
  'For growing teams and established brands',
  9900,  -- $99.00
  99000,  -- $990.00/year (save $198)
  'price_1SbA7JRcevBEPUM5YjOM4JGR',  -- Monthly price ID from .env
  'price_1SbA7sRcevBEPUM5Gk3cRoS8',  -- Yearly price ID from .env
  '[
    "50 master content pieces/month",
    "250 derivative assets/month",
    "500 AI-generated images/month",
    "3 brands, 50 products each",
    "Madison AI assistant (500 queries/month)",
    "10 team members",
    "Shopify & Etsy integration"
  ]'::jsonb,
  true,
  2
)
ON CONFLICT (slug)
DO UPDATE SET
  stripe_price_id_monthly = EXCLUDED.stripe_price_id_monthly,
  stripe_price_id_yearly = EXCLUDED.stripe_price_id_yearly,
  price_monthly = EXCLUDED.price_monthly,
  price_yearly = EXCLUDED.price_yearly,
  features = EXCLUDED.features,
  is_active = EXCLUDED.is_active;

-- Insert/Update Signature plan
INSERT INTO subscription_plans (
  name,
  slug,
  description,
  price_monthly,
  price_yearly,
  stripe_price_id_monthly,
  stripe_price_id_yearly,
  features,
  is_active,
  sort_order
) VALUES (
  'Signature',
  'signature',
  'For agencies and enterprise brands',
  29900,  -- $299.00
  299000,  -- $2990.00/year (save $598)
  'price_1SbA8oRcevBEPUM5fwfcuTkO',  -- Monthly price ID from .env
  'price_1SbA9ERcevBEPUM5PEPa3icy',  -- Yearly price ID from .env
  '[
    "Unlimited master content",
    "Unlimited derivatives",
    "2000 AI-generated images/month",
    "Unlimited brands, unlimited products each",
    "Madison AI assistant (unlimited queries)",
    "Unlimited team members",
    "Shopify & Etsy integration",
    "API access",
    "Full white-label included"
  ]'::jsonb,
  true,
  3
)
ON CONFLICT (slug)
DO UPDATE SET
  stripe_price_id_monthly = EXCLUDED.stripe_price_id_monthly,
  stripe_price_id_yearly = EXCLUDED.stripe_price_id_yearly,
  price_monthly = EXCLUDED.price_monthly,
  price_yearly = EXCLUDED.price_yearly,
  features = EXCLUDED.features,
  is_active = EXCLUDED.is_active;

-- Verify the data was inserted
SELECT
  name,
  slug,
  price_monthly / 100.0 as monthly_price,
  price_yearly / 100.0 as yearly_price,
  stripe_price_id_monthly,
  stripe_price_id_yearly,
  is_active
FROM subscription_plans
ORDER BY sort_order;
