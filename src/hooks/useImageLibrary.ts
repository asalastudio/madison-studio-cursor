/**
 * useImageLibrary - Fetch generated images from the database
 *
 * This hook provides access to the user's generated images library.
 * It's used by ImageLibraryModal and the ImageLibrary page to display images.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useCurrentOrganizationId } from "./useIndustryConfig";

export interface LibraryImage {
    id: string;
    url: string;
    name: string;
    timestamp?: number;
    goalType?: string;
    aspectRatio?: string;
    prompt?: string;
}

interface GeneratedImageRow {
    id: string;
    image_url: string;
    session_name: string | null;
    goal_type: string | null;
    aspect_ratio: string | null;
    final_prompt: string | null;
    created_at: string;
    is_archived: boolean;
}

export function useImageLibrary() {
    const { user } = useAuth();
    const { orgId } = useCurrentOrganizationId();

    return useQuery({
        queryKey: ["image-library-hook", orgId, user?.id],
        queryFn: async (): Promise<LibraryImage[]> => {
            if (!user) return [];

            console.log("📸 useImageLibrary fetching...", { orgId, userId: user.id });

            let data: GeneratedImageRow[] | null = null;
            let error: Error | null = null;

            // First try with organization_id if available
            if (orgId) {
                const result = await supabase
                    .from("generated_images")
                    .select("id, image_url, session_name, goal_type, aspect_ratio, final_prompt, created_at, is_archived")
                    .eq("organization_id", orgId)
                    .eq("is_archived", false)
                    .order("created_at", { ascending: false })
                    .limit(200); // Reasonable limit for modal performance

                if (!result.error && result.data && result.data.length > 0) {
                    data = result.data as GeneratedImageRow[];
                } else if (result.error) {
                    console.error("❌ useImageLibrary org query error:", result.error);
                }
            }

            // Fallback: fetch by user_id
            if (!data || data.length === 0) {
                console.log("📸 useImageLibrary fallback to user_id...");
                const result = await supabase
                    .from("generated_images")
                    .select("id, image_url, session_name, goal_type, aspect_ratio, final_prompt, created_at, is_archived")
                    .eq("user_id", user.id)
                    .eq("is_archived", false)
                    .order("created_at", { ascending: false })
                    .limit(200);

                if (result.error) {
                    console.error("❌ useImageLibrary user query error:", result.error);
                    return [];
                }
                data = result.data as GeneratedImageRow[];
            }

            console.log(`✅ useImageLibrary loaded ${data?.length || 0} images`);

            // Transform to LibraryImage format for the modal
            return (data || []).map((img) => ({
                id: img.id,
                url: img.image_url,
                name: img.session_name || `Image ${new Date(img.created_at).toLocaleDateString()}`,
                timestamp: new Date(img.created_at).getTime(),
                goalType: img.goal_type || undefined,
                aspectRatio: img.aspect_ratio || undefined,
                prompt: img.final_prompt || undefined,
            }));
        },
        enabled: !!user,
        staleTime: 60 * 1000, // Cache for 1 minute to prevent flickering
        refetchOnWindowFocus: false, // Prevent random refetches that cause "disappearing"
    });
}
