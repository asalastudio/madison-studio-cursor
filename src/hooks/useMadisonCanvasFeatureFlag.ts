import { useOrganization } from "@/hooks/useOrganization";
import { isMadisonCanvasEnabled, type BrandConfigLike } from "@/lib/canvas/featureFlag";

export function useMadisonCanvasFeatureFlag(): {
  enabled: boolean;
  isLoading: boolean;
  organizationId: string | null;
} {
  const { organization, organizationId, isLoading } = useOrganization();
  const brandConfig = (organization?.brand_config ?? null) as BrandConfigLike | null;

  return {
    enabled: isMadisonCanvasEnabled({
      brandConfig,
    }),
    isLoading,
    organizationId,
  };
}
