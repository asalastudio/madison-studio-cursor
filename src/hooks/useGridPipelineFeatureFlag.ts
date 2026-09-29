import { useOrganization } from "@/hooks/useOrganization";
import { brandConfigFromOrganization, orgHasGridPipeline, orgHasTarife } from "@/lib/orgFeatures";

/**
 * Feature flags from `organizations.brand_config.features`.
 * `grid_pipeline` = Best Bottles production surfaces.
 * `tarife` = Tarife-only destinations and the TARIFE_NATIVE copy lane.
 */
export function useOrgFeatureFlags(): {
  gridPipeline: boolean;
  tarife: boolean;
  isLoading: boolean;
  organizationId: string | null;
} {
  const { organization, isLoading } = useOrganization();
  const brandConfig = brandConfigFromOrganization(organization);

  return {
    gridPipeline: orgHasGridPipeline(brandConfig),
    tarife: orgHasTarife(brandConfig),
    isLoading,
    organizationId: organization?.id ?? null,
  };
}

/**
 * Returns true when the current organization has the Grid Pipeline feature
 * enabled via `organizations.brand_config.features.grid_pipeline = true`.
 *
 * Used to gate the Best Bottles-specific Pipeline page + nav entry. Flipping
 * the flag is a one-line SQL/UI update per org; no code deploy needed.
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
