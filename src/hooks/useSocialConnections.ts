/**
 * Connected social accounts for the current organization.
 *
 * Reads `social_connection_summaries`, the view that deliberately omits token
 * ciphertext — the client never has any business seeing it.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import type { SocialPlatformId } from "@/config/socialPlatforms";

export interface SocialConnectionSummary {
  id: string;
  organization_id: string;
  platform: SocialPlatformId;
  account_type: "personal" | "page" | "business" | "creator";
  external_account_id: string;
  external_account_name: string | null;
  external_account_handle: string | null;
  external_account_avatar_url: string | null;
  external_parent_id: string | null;
  external_parent_name: string | null;
  scopes: string[];
  status: "active" | "needs_reauth" | "revoked" | "disabled";
  status_detail: string | null;
  connected_at: string;
  last_verified_at: string | null;
  last_published_at: string | null;
  token_expires_at: string | null;
  token_expiring_soon: boolean;
  metadata: Record<string, unknown>;
}

export const socialConnectionsKey = (organizationId: string | null) => [
  "social-connections",
  organizationId,
];

export function useSocialConnections() {
  const { organizationId, role } = useOrganization();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: socialConnectionsKey(organizationId),
    enabled: !!organizationId,
    staleTime: 30_000,
    retry: false,
    queryFn: async (): Promise<{
      connections: SocialConnectionSummary[];
      schemaMissing: boolean;
    }> => {
      if (!organizationId) return { connections: [], schemaMissing: false };
      const { data, error } = await supabase
        .from("social_connection_summaries")
        .select("*")
        .eq("organization_id", organizationId)
        .order("platform", { ascending: true });

      if (error) {
        // Before the social publishing migration is applied the view does not
        // exist. Surface that as a setup state rather than a hard error, so the
        // Integrations tab still renders the channel list.
        if (isMissingRelationError(error)) {
          return { connections: [], schemaMissing: true };
        }
        throw error;
      }
      return {
        connections: (data ?? []) as unknown as SocialConnectionSummary[],
        schemaMissing: false,
      };
    },
  });

  const connect = useMutation({
    mutationFn: async (input: {
      platform: SocialPlatformId;
      connectionType?: "personal" | "business";
      redirectUrl?: string;
    }) => {
      if (!organizationId) throw new Error("No organization selected.");
      const { data, error } = await supabase.functions.invoke("social-oauth-start", {
        body: {
          platform: input.platform,
          organizationId,
          connectionType: input.connectionType ?? "business",
          redirectUrl: input.redirectUrl ?? `${window.location.origin}/settings?tab=integrations`,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.message ?? data.error);
      if (!data?.authUrl) throw new Error("No authorization URL was returned.");
      return data as { authUrl: string; scopes: string[]; platform: SocialPlatformId };
    },
  });

  const disconnect = useMutation({
    mutationFn: async (connectionId: string) => {
      // Deleting the row destroys the stored tokens, which is the point.
      const { error } = await supabase
        .from("social_connections")
        .delete()
        .eq("id", connectionId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: socialConnectionsKey(organizationId) });
    },
  });

  const connections = query.data?.connections ?? [];

  return {
    connections,
    activeConnections: connections.filter((connection) => connection.status === "active"),
    connectionsByPlatform: groupByPlatform(connections),
    /** True until supabase/migrations/20260911090000_social_publishing_core.sql is applied. */
    schemaMissing: query.data?.schemaMissing ?? false,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    connect,
    disconnect,
    organizationId,
    canManage: role === "owner" || role === "admin",
  };
}

function isMissingRelationError(error: { code?: string; message?: string }): boolean {
  // 42P01 = undefined_table; PostgREST also reports unknown relations as PGRST205.
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const message = error.message ?? "";
  return /social_connection_summaries/.test(message) && /does not exist|not find/i.test(message);
}

function groupByPlatform(connections: SocialConnectionSummary[]) {
  const map = new Map<SocialPlatformId, SocialConnectionSummary[]>();
  for (const connection of connections) {
    const existing = map.get(connection.platform) ?? [];
    existing.push(connection);
    map.set(connection.platform, existing);
  }
  return map;
}
