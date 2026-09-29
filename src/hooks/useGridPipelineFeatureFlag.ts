import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { isBestBottlesOrgId } from "@/lib/orgFeatures";

/**
 * Feature grants from `org_entitlements` (service-role / migration writes only).
 * Best Bottles is also allowlisted by organization id so that org keeps
 * working even before the entitlement row exists.
 */
export function useOrgFeatureFlags(): {
  gridPipeline: boolean;
  tarife: boolean;
  isLoading: boolean;
  organizationId: string | null;
} {
  const { organization, organizationId, isLoading: orgLoading } = useOrganization();
  const resolvedOrgId = organizationId ?? organization?.id ?? null;

  const { data: features = [], isLoading: entitlementsLoading } = useQuery({
    queryKey: ["org-entitlements", resolvedOrgId],
    queryFn: async () => {
      if (!resolvedOrgId) return [] as string[];
      const { data, error } = await supabase
        .from("org_entitlements")
        .select("feature")
        .eq("organization_id", resolvedOrgId);
      if (error) {
        console.error("[org-entitlements] lookup failed:", error);
        return [] as string[];
      }
      return (data ?? []).map((row) => row.feature);
    },
    enabled: Boolean(resolvedOrgId),
    staleTime: 5 * 60 * 1000,
  });

  const granted = new Set(features);

  return {
    gridPipeline: granted.has("grid_pipeline") || isBestBottlesOrgId(resolvedOrgId),
    tarife: granted.has("tarife"),
    isLoading: orgLoading || (Boolean(resolvedOrgId) && entitlementsLoading),
    organizationId: resolvedOrgId,
  };
}

/**
 * Returns true when the current organization has the Grid Pipeline entitlement
 * (or is the canonical Best Bottles org).
 */
export function useGridPipelineFeatureFlag(): {
  enabled: boolean;
  isLoading: boolean;
  organizationId: string | null;
} {
  const flags = useOrgFeatureFlags();
  return {
    enabled: flags.gridPipeline,
    isLoading: flags.isLoading,
    organizationId: flags.organizationId,
  };
}
