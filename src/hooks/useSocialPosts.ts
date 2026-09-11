/**
 * Scheduled / published social posts for the current organization.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import type { SocialPlatformId } from "@/config/socialPlatforms";

export type SocialPostStatus =
  | "draft"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed"
  | "cancelled";

export interface SocialPostRow {
  id: string;
  organization_id: string;
  group_id: string;
  connection_id: string | null;
  platform: SocialPlatformId;
  caption: string;
  link_url: string | null;
  first_comment: string | null;
  media: Array<{ url: string; type: "image" | "video" }>;
  options: Record<string, unknown>;
  status: SocialPostStatus;
  scheduled_for: string | null;
  published_at: string | null;
  permalink: string | null;
  external_post_id: string | null;
  error_code: string | null;
  error_message: string | null;
  attempt_count: number;
  max_attempts: number;
  created_at: string;
}

export const socialPostsKey = (organizationId: string | null) => ["social-posts", organizationId];

export function useSocialPosts(options: { limit?: number } = {}) {
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  const limit = options.limit ?? 100;

  const query = useQuery({
    queryKey: [...socialPostsKey(organizationId), limit],
    enabled: !!organizationId,
    staleTime: 15_000,
    retry: false,
    queryFn: async (): Promise<{ posts: SocialPostRow[]; schemaMissing: boolean }> => {
      if (!organizationId) return { posts: [], schemaMissing: false };
      const { data, error } = await supabase
        .from("social_posts")
        .select("*")
        .eq("organization_id", organizationId)
        .neq("status", "cancelled")
        .order("scheduled_for", { ascending: true, nullsFirst: false })
        .limit(limit);

      if (error) {
        if (error.code === "42P01" || error.code === "PGRST205") {
          return { posts: [], schemaMissing: true };
        }
        throw error;
      }
      return { posts: (data ?? []) as unknown as SocialPostRow[], schemaMissing: false };
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: socialPostsKey(organizationId) });
  };

  const retry = useMutation({
    mutationFn: async (postId: string) => {
      if (!organizationId) throw new Error("No organization selected.");
      const { data, error } = await supabase.functions.invoke("social-publish", {
        body: { action: "retry", organizationId, postId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: invalidate,
  });

  const cancel = useMutation({
    mutationFn: async (postId: string) => {
      if (!organizationId) throw new Error("No organization selected.");
      const { data, error } = await supabase.functions.invoke("social-publish", {
        body: { action: "cancel", organizationId, postId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: invalidate,
  });

  const posts = query.data?.posts ?? [];
  const now = Date.now();

  return {
    posts,
    upcoming: posts.filter(
      (post) =>
        (post.status === "scheduled" || post.status === "publishing") &&
        (!post.scheduled_for || new Date(post.scheduled_for).getTime() >= now - 60_000),
    ),
    failed: posts.filter((post) => post.status === "failed"),
    published: posts.filter((post) => post.status === "published"),
    schemaMissing: query.data?.schemaMissing ?? false,
    isLoading: query.isLoading,
    refetch: query.refetch,
    invalidate,
    retry,
    cancel,
  };
}
