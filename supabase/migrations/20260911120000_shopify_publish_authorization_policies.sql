-- shopify_publish_authorizations had RLS enabled with no policies at all, so the
-- table was unreadable to every signed-in user (the security advisor flags this
-- as rls_enabled_no_policy). Authorizations are minted and consumed exclusively
-- by the service role in mint-shopify-publish-authorization and
-- push-shopify-product-images, so that part was working as intended — but org
-- members should be able to see that an authorization exists and whether it has
-- been consumed, for support and audit.
--
-- Reads: organization members.
-- Writes: service role only (deliberately no INSERT/UPDATE/DELETE policy — a
-- user-writable authorization table would defeat the publish guard entirely).

DROP POLICY IF EXISTS "Members can view shopify publish authorizations"
  ON public.shopify_publish_authorizations;
CREATE POLICY "Members can view shopify publish authorizations"
  ON public.shopify_publish_authorizations FOR SELECT
  USING (public.is_organization_member(auth.uid(), organization_id));

-- Expired, unconsumed authorizations are dead weight; they can never be claimed
-- because push-shopify-product-images requires expires_at > now() at claim time.
CREATE OR REPLACE FUNCTION public.cleanup_expired_shopify_publish_authorizations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted INTEGER;
BEGIN
  DELETE FROM public.shopify_publish_authorizations
  WHERE consumed_at IS NULL
    AND expires_at < now() - INTERVAL '7 days';
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_shopify_publish_authorizations() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_expired_shopify_publish_authorizations() FROM anon;
REVOKE ALL ON FUNCTION public.cleanup_expired_shopify_publish_authorizations() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_shopify_publish_authorizations() TO service_role;
