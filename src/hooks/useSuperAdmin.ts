import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * True when the signed-in user has a row in `super_admins`.
 * Matches the Madison Training tab check.
 */
export function useSuperAdmin(): { isSuperAdmin: boolean; isLoading: boolean } {
  const { user, loading: authLoading } = useAuth();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setIsSuperAdmin(false);
      setChecking(false);
      return;
    }

    let cancelled = false;
    setChecking(true);

    void supabase
      .from("super_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        setIsSuperAdmin(Boolean(data) && !error);
        setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  return { isSuperAdmin, isLoading: authLoading || checking };
}
