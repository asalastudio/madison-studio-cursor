import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  buildOrgScopedMediaQuery,
  type VideoJobState,
} from "@/lib/videoStudio";

export interface OrgStudioImage {
  id: string;
  url: string;
  name: string;
  prompt?: string;
  createdAt: string;
  source: "dark-room" | "library";
}

export interface OrgStudioVideo {
  id: string;
  posterUrl: string | null;
  videoUrl: string | null;
  prompt: string;
  duration: number | null;
  aspectRatio: string | null;
  model: string | null;
  status: VideoJobState;
  createdAt: string;
  taskId?: string;
}

interface GeneratedMediaRow {
  id: string;
  image_url: string | null;
  video_url: string | null;
  video_duration: number | null;
  final_prompt: string | null;
  aspect_ratio: string | null;
  generation_provider: string | null;
  media_type: string | null;
  goal_type: string | null;
  session_name: string | null;
  created_at: string;
  metadata: unknown;
}

function rowName(row: GeneratedMediaRow): string {
  return row.session_name || row.goal_type || `Frame ${new Date(row.created_at).toLocaleDateString()}`;
}

function rowStatus(row: GeneratedMediaRow): VideoJobState {
  if (row.video_url) return "complete";
  const metadata = row.metadata && typeof row.metadata === "object"
    ? (row.metadata as { status?: string })
    : {};
  const status = (metadata.status ?? "").toLowerCase();
  if (status === "failed" || status === "error") return "failed";
  if (status === "pending" || status === "processing") return "processing";
  return row.video_url ? "complete" : "queued";
}

function rowTaskId(row: GeneratedMediaRow): string | undefined {
  if (!row.metadata || typeof row.metadata !== "object") return undefined;
  const taskId = (row.metadata as { task_id?: unknown }).task_id;
  return typeof taskId === "string" ? taskId : undefined;
}

export function useOrgStudioImages(organizationId: string | null) {
  return useQuery({
    queryKey: ["org-studio-images", organizationId],
    enabled: Boolean(organizationId),
    staleTime: 30_000,
    queryFn: async (): Promise<OrgStudioImage[]> => {
      if (!organizationId) return [];
      const query = buildOrgScopedMediaQuery({
        organizationId,
        mediaType: "image",
      });

      const { data, error } = await supabase
        .from("generated_images")
        .select("id, image_url, video_url, video_duration, final_prompt, aspect_ratio, generation_provider, media_type, goal_type, session_name, created_at, metadata")
        .eq("organization_id", query.organizationId)
        .eq("is_archived", false)
        .not("image_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(80);

      if (error) {
        console.error("[useOrgStudioImages]", error);
        throw error;
      }

      return ((data ?? []) as GeneratedMediaRow[])
        .filter((row) => row.image_url)
        .map((row) => ({
          id: row.id,
          url: row.image_url as string,
          name: rowName(row),
          prompt: row.final_prompt ?? undefined,
          createdAt: row.created_at,
          source: row.goal_type === "magic_seed" || row.media_type === "video"
            ? "library"
            : "dark-room",
        }));
    },
  });
}

export function useOrgStudioVideos(organizationId: string | null) {
  return useQuery({
    queryKey: ["org-studio-videos", organizationId],
    enabled: Boolean(organizationId),
    staleTime: 15_000,
    queryFn: async (): Promise<OrgStudioVideo[]> => {
      if (!organizationId) return [];
      const query = buildOrgScopedMediaQuery({
        organizationId,
        mediaType: "video",
      });

      const { data, error } = await supabase
        .from("generated_images")
        .select("id, image_url, video_url, video_duration, final_prompt, aspect_ratio, generation_provider, media_type, goal_type, session_name, created_at, metadata")
        .eq("organization_id", query.organizationId)
        .eq("media_type", query.mediaType)
        .eq("is_archived", false)
        .order("created_at", { ascending: false })
        .limit(40);

      if (error) {
        console.error("[useOrgStudioVideos]", error);
        throw error;
      }

      return ((data ?? []) as GeneratedMediaRow[]).map((row) => ({
        id: row.id,
        posterUrl: row.image_url,
        videoUrl: row.video_url,
        prompt: row.final_prompt ?? "",
        duration: row.video_duration,
        aspectRatio: row.aspect_ratio,
        model: row.generation_provider,
        status: rowStatus(row),
        createdAt: row.created_at,
        taskId: rowTaskId(row),
      }));
    },
  });
}
