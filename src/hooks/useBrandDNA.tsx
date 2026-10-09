/**
 * useBrandDNA Hook
 * 
 * Fetches and manages Brand DNA data for the current organization.
 * Provides the data needed for the Brand Quick View Panel.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "./useOrganization";
import { brandQuickViewFromOrganization } from "@/lib/brandSettingsQuickView";
import type { BrandDNA, BrandQuickView, DesignTokens } from "@/types/madison";

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN HOOK
// ═══════════════════════════════════════════════════════════════════════════════

export function useBrandDNA() {
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();

  // Fetch Brand DNA
  const {
    data: brandDNA,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["brand-dna", organizationId],
    queryFn: async () => {
      if (!organizationId) return null;

      const { data, error } = await supabase
        .from("brand_dna")
        .select("*")
        .eq("org_id", organizationId)
        .maybeSingle();

      if (error) throw error;
      return data as BrandDNA | null;
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Fetch Design Tokens
  const { data: designTokens } = useQuery({
    queryKey: ["design-tokens", organizationId],
    queryFn: async (): Promise<DesignTokens | null> => {
      if (!organizationId) return null;

      const { data, error } = await supabase
        .from("design_systems")
        .select("tokens")
        .eq("org_id", organizationId)
        .maybeSingle();

      if (error) {
        console.warn("[useBrandDNA] Design tokens fetch error:", error.message);
        return null; // Return null instead of throwing - tokens are optional
      }
      
      // Explicitly return null if no data (prevents undefined warning)
      return (data?.tokens as DesignTokens) ?? null;
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: organizationBrand, isLoading: organizationBrandLoading } = useQuery({
    queryKey: ["org-brand-settings", organizationId],
    queryFn: async () => {
      if (!organizationId) return null;
      const { data, error: orgError } = await supabase
        .from("organizations")
        .select("name, settings, brand_config, industry_type")
        .eq("id", organizationId)
        .maybeSingle();
      if (orgError) throw orgError;
      return data;
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  });

  const settingsView = brandQuickViewFromOrganization(organizationBrand);

  // Transform to Quick View format. A brand_dna scan wins, and Brand Studio
  // settings fill whatever the scan never wrote.
  const quickView: BrandQuickView | null = brandDNA || settingsView
    ? {
        logoUrl: brandDNA?.visual?.logo?.url,
        brandName: settingsView?.brandName,
        colors: {
          primary: brandDNA?.visual?.colors?.primary || settingsView?.colors.primary,
          secondary: brandDNA?.visual?.colors?.secondary || settingsView?.colors.secondary,
          accent: brandDNA?.visual?.colors?.accent || settingsView?.colors.accent,
          palette: brandDNA?.visual?.colors?.palette || settingsView?.colors.palette,
        },
        typography: {
          headline: brandDNA?.visual?.typography?.headline?.family || settingsView?.typography.headline,
          body: brandDNA?.visual?.typography?.body?.family || settingsView?.typography.body,
        },
        tone: brandDNA?.essence?.tone,
        industryLabel: settingsView?.industryLabel,
        copySquad: brandDNA?.essence?.copySquad,
        visualSquad: brandDNA?.essence?.visualSquad,
        mission: brandDNA?.essence?.mission,
        keywords: brandDNA?.essence?.keywords,
        scanConfidence: brandDNA?.scan_metadata?.confidence,
        lastScanned: brandDNA?.scan_metadata?.scanned_at,
      }
    : null;

  // Mutation to trigger rescan
  const rescanMutation = useMutation({
    mutationFn: async (url?: string) => {
      if (!organizationId) throw new Error("No organization");

      const response = await supabase.functions.invoke("scan-website-enhanced", {
        body: {
          organizationId,
          url,
          forceRescan: true,
        },
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brand-dna", organizationId] });
      queryClient.invalidateQueries({ queryKey: ["design-tokens", organizationId] });
    },
  });

  return {
    brandDNA,
    quickView,
    designTokens,
    isLoading: isLoading || organizationBrandLoading,
    error,
    refetch,
    rescan: rescanMutation.mutate,
    isRescanning: rescanMutation.isPending,
    hasBrandDNA: !!brandDNA || !!settingsView,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook to get just the color palette
 */
export function useBrandColors() {
  const { quickView, isLoading } = useBrandDNA();

  return {
    colors: quickView?.colors || null,
    isLoading,
  };
}

/**
 * Hook to get squad assignments
 */
export function useBrandSquads() {
  const { quickView, isLoading } = useBrandDNA();

  return {
    copySquad: quickView?.copySquad || null,
    visualSquad: quickView?.visualSquad || null,
    isLoading,
  };
}

export default useBrandDNA;












