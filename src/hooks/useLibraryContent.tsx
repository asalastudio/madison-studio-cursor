import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { getDeliverableByValue } from "@/config/deliverableFormats";
import { logger } from "@/lib/logger";

export interface LibraryContentItem {
  id: string;
  title: string;
  contentType: string;
  collection: string | null;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  rating: number | null;
  wordCount: number | null;
  archived: boolean;
  status: string;
  sourceTable: "master_content" | "outputs" | "derivative_assets" | "generated_images";
  publishedTo?: string[];
  externalUrls?: Record<string, string>;
  publishNotes?: string;
  publishedAt?: string;
  brandConsistencyScore?: number;
  brandAnalysis?: any;
  lastBrandCheckAt?: string;
  imageUrl?: string;
  goalType?: string;
  aspectRatio?: string;
  finalPrompt?: string;
  featuredImageUrl?: string; // For blog posts
  platformSpecs?: Record<string, unknown> | null;
}

export const useLibraryContent = (groupBySessions = false, page = 1, limit = 30) => {
  const { user } = useAuth();
  const offset = (page - 1) * limit;

  return useQuery({
    queryKey: ["library-content", user?.id, groupBySessions, page],
    queryFn: async () => {
      if (!user) return [];

      const items: LibraryContentItem[] = [];

      // Fetch TEXT content only (images are in dedicated Image Library)
      // No longer fetching generated_images - those go to /image-library
      const [
        { data: masterContent, error: masterError },
        { data: outputs, error: outputsError },
        { data: derivatives, error: derivativesError }
      ] = await Promise.all([
        supabase
          .from("master_content")
          .select("id, title, content_type, collection, full_content, created_at, updated_at, quality_rating, is_archived, status, published_to, external_urls, publish_notes, brand_consistency_score, brand_analysis, last_brand_check_at, featured_image_url")
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1),
        
        supabase
          .from("outputs")
          .select("id, created_at, generated_content, quality_rating, is_archived, prompts(title, content_type, collection)")
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1),
        
        supabase
          .from("derivative_assets")
          .select("id, asset_type, generated_content, created_at, quality_rating, is_archived, approval_status, published_to, external_urls, publish_notes, published_at, platform_specs, master_content(title, collection), brand_consistency_score, brand_analysis, last_brand_check_at")
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1)
      ]);

      if (masterError) {
        logger.error("Error fetching master content:", masterError);
      } else if (masterContent) {
        items.push(
          ...masterContent.map((item: any) => {
            const deliverable = getDeliverableByValue(item.content_type);
            return {
              id: item.id,
              title: item.title,
              contentType: item.content_type,
              collection: item.collection,
              content: item.full_content,
              createdAt: new Date(item.created_at),
              updatedAt: new Date(item.updated_at),
              rating: item.quality_rating,
              wordCount: item.full_content?.split(/\s+/).filter(Boolean).length || 0,
              archived: item.is_archived,
              status: item.status || "draft",
              sourceTable: "master_content" as const,
              publishedTo: item.published_to as string[] | undefined,
              externalUrls: item.external_urls as Record<string, string> | undefined,
              publishNotes: item.publish_notes || undefined,
              brandConsistencyScore: item.brand_consistency_score || undefined,
              brandAnalysis: item.brand_analysis || undefined,
              lastBrandCheckAt: item.last_brand_check_at || undefined,
              featuredImageUrl: item.featured_image_url || undefined,
            };
          })
        );
      }

      // Fetch outputs
      if (outputsError) {
        logger.error("Error fetching outputs:", outputsError);
      } else if (outputs) {
        items.push(
          ...outputs.map((item) => {
            const contentType = item.prompts?.content_type || "output";
            const deliverable = getDeliverableByValue(contentType);
            return {
              id: item.id,
              title: item.prompts?.title || "Untitled Output",
              contentType: contentType,
              collection: item.prompts?.collection || null,
              content: item.generated_content,
              createdAt: new Date(item.created_at),
              updatedAt: new Date(item.created_at),
              rating: item.quality_rating,
              wordCount: item.generated_content?.split(/\s+/).filter(Boolean).length || 0,
              archived: item.is_archived,
              status: "generated",
              sourceTable: "outputs" as const,
            };
          })
        );
      }

      // Fetch derivative assets
      if (derivativesError) {
        logger.error("Error fetching derivatives:", derivativesError);
      } else if (derivatives) {
        // Debug: Log raw derivative data - check for the specific ID
        console.log('[useLibraryContent] 📥 Fetched derivatives count:', derivatives.length);
        const linkedInPosts = derivatives.filter((d: any) => d.asset_type?.toLowerCase().includes('linkedin'));
        linkedInPosts.forEach((d: any) => {
          const content = d.generated_content || '';
          console.log('[useLibraryContent] LinkedIn post:', {
            id: d.id,
            contentLength: content.length,
            contentPreview: content.substring(0, 200),
            hasReadMore: content.toLowerCase().includes('read more'),
            hasUrl: content.includes('http')
          });
        });
        
        items.push(
          ...derivatives.map((item) => {
            const deliverable = getDeliverableByValue(item.asset_type);
            return {
              id: item.id,
              title: (typeof item.platform_specs === 'object' && item.platform_specs !== null && 'title' in item.platform_specs ? item.platform_specs.title as string : null) || item.master_content?.title || "Untitled Derivative",
              contentType: item.asset_type,
              collection: item.master_content?.collection || null,
              content: item.generated_content || "",
              createdAt: new Date(item.created_at),
              updatedAt: new Date(item.created_at),
              rating: item.quality_rating,
              wordCount: item.generated_content?.split(/\s+/).filter(Boolean).length || 0,
              archived: item.is_archived,
              status: item.approval_status || "pending",
              sourceTable: "derivative_assets" as const,
              publishedTo: item.published_to as string[] | undefined,
              externalUrls: item.external_urls as Record<string, string> | undefined,
              publishNotes: item.publish_notes || undefined,
              publishedAt: item.published_at || undefined,
              brandConsistencyScore: item.brand_consistency_score || undefined,
              brandAnalysis: item.brand_analysis || undefined,
              lastBrandCheckAt: item.last_brand_check_at || undefined,
              platformSpecs: (item.platform_specs as Record<string, unknown> | null) || null,
            };
          })
        );
      }

      // NOTE: Generated images are no longer fetched here
      // They now live in the dedicated Image Library (/image-library)

      // Sort all items by date (most recent first)
      items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      return items;
    },
    staleTime: 30 * 1000, // Cache for 30 seconds - ensures fresher data after edits
    enabled: !!user,
  });
};
