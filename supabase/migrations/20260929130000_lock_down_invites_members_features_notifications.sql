-- Multi-tenant lock-down from the later security audit:
-- F1 bind invitation accept to auth.uid() + confirmed email + expires_at
-- F2 organization_members UPDATE must have WITH CHECK (admins cannot become owners)
-- F13 owners must not write brand_config.features
-- F16 notifications INSERT must not be WITH CHECK (true)

-- ─── F1: invitation accept ──────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.accept_pending_invitations_for_user(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.accept_pending_invitations_for_user()
RETURNS TABLE (
  invitation_id UUID,
  organization_id UUID,
  role TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  current_email TEXT;
  invitation_record RECORD;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT u.email
  INTO current_email
  FROM auth.users u
  WHERE u.id = current_user_id
    AND u.email_confirmed_at IS NOT NULL;

  IF current_email IS NULL OR btrim(current_email) = '' THEN
    RAISE EXCEPTION 'A confirmed email is required to accept invitations';
  END IF;

  FOR invitation_record IN
    SELECT ti.id, ti.organization_id, ti.role::TEXT
    FROM public.team_invitations ti
    WHERE LOWER(ti.email) = LOWER(current_email)
      AND ti.accepted_at IS NULL
      AND ti.expires_at > now()
  LOOP
    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (
      invitation_record.organization_id,
      current_user_id,
      invitation_record.role::organization_role
    )
    ON CONFLICT (organization_id, user_id) DO NOTHING;

    UPDATE public.team_invitations
    SET accepted_at = now()
    WHERE id = invitation_record.id;

    invitation_id := invitation_record.id;
    organization_id := invitation_record.organization_id;
    role := invitation_record.role;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_pending_invitations_for_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_pending_invitations_for_user() TO authenticated;

-- ─── F2: members UPDATE WITH CHECK ──────────────────────────────────────────

DROP POLICY IF EXISTS "Owners and admins can update members" ON public.organization_members;

CREATE POLICY "Owners and admins can update members"
  ON public.organization_members
  FOR UPDATE
  USING (
    public.has_organization_role(auth.uid(), organization_id, 'owner')
    OR (
      public.has_organization_role(auth.uid(), organization_id, 'admin')
      AND role <> 'owner'
    )
  )
  WITH CHECK (
    public.has_organization_role(auth.uid(), organization_id, 'owner')
    OR (
      public.has_organization_role(auth.uid(), organization_id, 'admin')
      AND role <> 'owner'
    )
  );

-- ─── F13: preserve brand_config.features against owner writes ────────────────

CREATE OR REPLACE FUNCTION public.protect_org_brand_config_features()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service-role / migration callers have no auth.uid(); they may set features.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.brand_config IS DISTINCT FROM OLD.brand_config THEN
    IF OLD.brand_config ? 'features' THEN
      NEW.brand_config := jsonb_set(
        COALESCE(NEW.brand_config, '{}'::jsonb),
        '{features}',
        OLD.brand_config->'features',
        true
      );
    ELSIF NEW.brand_config ? 'features' THEN
      NEW.brand_config := NEW.brand_config - 'features';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_org_brand_config_features ON public.organizations;
CREATE TRIGGER protect_org_brand_config_features
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_org_brand_config_features();

-- ─── F16: notifications insert scoped to self ───────────────────────────────
-- Triggers and the service role still insert for other users (bypass RLS).

DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
CREATE POLICY "notifications_insert" ON public.notifications
  FOR INSERT
  WITH CHECK (user_id = auth.uid());
