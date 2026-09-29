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
import { isRetiredTransparentBestBottlesReferenceCandidate } from "@/lib/bestBottlesReferenceFilters";

export interface UseImageLibraryOptions {
  /** When set, only rows whose `library_tags` contains this string are returned. */
  libraryTagContains?: string;
  /** When set, rows that contain any of these tags (OR). Overrides `libraryTagContains` if both are passed. */
  libraryTagContainsAny?: string[];
  /** Exclude rows whose `library_tags` include any of these exact tokens. */
  libraryTagExcludeAny?: string[];
  /** Exclude rows whose image_url contains any of these case-insensitive fragments. */
  imageUrlExcludeContainsAny?: string[];
  /** Exclude retired Best Bottles transparent/background-removed reference rows. */
  excludeRetiredBestBottlesTransparentReferences?: boolean;
  /** When false, skip the query (used by org-strict pickers that pass their own rows). */
  enabled?: boolean;
}

export interface LibraryImage {
    id: string;
    url: string;
    name: string;
    timestamp?: number;
    goalType?: string;
    aspectRatio?: string;
    prompt?: string;
    libraryTags?: string[];
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
    library_tags?: string[] | null;
}

const GENERATED_IMAGE_SELECT =
    "id, image_url, session_name, goal_type, aspect_ratio, final_prompt, created_at, is_archived, library_tags";

/**
 * Fetch library rows with org-first / user fallback (matches existing hook behavior).
 * Do not use PostgREST `.or(library_tags.cs.{…})` for multiple tags — values like
 * `role:background-scene` contain `:` and break filter parsing, returning zero rows.
 */
async function fetchGeneratedImageRowsForLibrary(
    userId: string,
    orgId: string | null | undefined,
    libraryTag: string | null,
): Promise<GeneratedImageRow[]> {
    let data: GeneratedImageRow[] | null = null;

    const applyTag = <Q extends { contains: (col: string, val: string[]) => Q }>(q: Q): Q =>
        libraryTag ? q.contains("library_tags", [libraryTag]) : q;

    if (orgId) {
        let q = supabase
            .from("generated_images")
            .select(GENERATED_IMAGE_SELECT)
            .eq("organization_id", orgId)
            .eq("is_archived", false)
            .order("created_at", { ascending: false })
            .limit(200);
        q = applyTag(q);
        const result = await q;

        if (!result.error && result.data && result.data.length > 0) {
            data = result.data as GeneratedImageRow[];
        } else if (result.error) {
            console.error("❌ useImageLibrary org query error:", result.error);
        }
    }

    if (!data || data.length === 0) {
        console.log("📸 useImageLibrary fallback to user_id...");
        let q = supabase
            .from("generated_images")
            .select(GENERATED_IMAGE_SELECT)
            .eq("user_id", userId)
            .eq("is_archived", false)
            .order("created_at", { ascending: false })
            .limit(200);
        q = applyTag(q);
        const result = await q;

        if (result.error) {
            console.error("❌ useImageLibrary user query error:", result.error);
            return [];
        }
        data = (result.data ?? []) as GeneratedImageRow[];
    }

    return data ?? [];
}

function normalizeContainsList(values?: string[]) {
    return (values ?? [])
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
}

function rowHasExcludedTag(row: GeneratedImageRow, excludedTags: string[]): boolean {
    if (excludedTags.length === 0) return false;
    const tags = (row.library_tags ?? []).map((tag) => tag.toLowerCase());
    return tags.some((tag) => excludedTags.includes(tag));
}

function rowUrlContainsExcludedToken(row: GeneratedImageRow, excludedUrlTokens: string[]): boolean {
    if (excludedUrlTokens.length === 0) return false;
    const url = row.image_url.toLowerCase();
    return excludedUrlTokens.some((token) => url.includes(token));
}

function rowIsRetiredBestBottlesTransparentReference(row: GeneratedImageRow): boolean {
    return isRetiredTransparentBestBottlesReferenceCandidate([
        {
            url: row.image_url,
            imageUrl: row.image_url,
            name: row.session_name,
            sessionName: row.session_name,
            libraryTags: row.library_tags ?? [],
            library_tags: row.library_tags ?? [],
        },
    ]);
}

export function useImageLibrary(options: UseImageLibraryOptions = {}) {
    const {
        libraryTagContains,
        libraryTagContainsAny,
        libraryTagExcludeAny,
        imageUrlExcludeContainsAny,
        excludeRetiredBestBottlesTransparentReferences = false,
        enabled = true,
    } = options;
    const tagFilters =
        libraryTagContainsAny && libraryTagContainsAny.length > 0
            ? libraryTagContainsAny
            : libraryTagContains
              ? [libraryTagContains]
              : [];
    const tagExcludes = normalizeContainsList(libraryTagExcludeAny);
    const urlExcludes = normalizeContainsList(imageUrlExcludeContainsAny);
    const { user } = useAuth();
    const { orgId } = useCurrentOrganizationId();

    return useQuery({
        queryKey: [
            "image-library-hook",
            orgId,
            user?.id,
            tagFilters,
            tagExcludes,
            urlExcludes,
            excludeRetiredBestBottlesTransparentReferences,
        ],
        queryFn: async (): Promise<LibraryImage[]> => {
            if (!user) return [];

            console.log("📸 useImageLibrary fetching...", {
                orgId,
                userId: user.id,
                tagFilters,
                tagExcludes,
                urlExcludes,
                excludeRetiredBestBottlesTransparentReferences,
            });

            let data: GeneratedImageRow[];

            if (tagFilters.length <= 1) {
                data = await fetchGeneratedImageRowsForLibrary(
                    user.id,
                    orgId,
                    tagFilters.length === 1 ? tagFilters[0] : null,
                );
            } else {
                const byId = new Map<string, GeneratedImageRow>();
                for (const tag of tagFilters) {
                    const rows = await fetchGeneratedImageRowsForLibrary(user.id, orgId, tag);
                    for (const row of rows) {
                        byId.set(row.id, row);
                    }
                }
                data = Array.from(byId.values()).sort(
                    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
                );
                data = data.slice(0, 200);
            }

            data = data.filter(
                (row) =>
                    !rowHasExcludedTag(row, tagExcludes) &&
                    !rowUrlContainsExcludedToken(row, urlExcludes) &&
                    (!excludeRetiredBestBottlesTransparentReferences ||
                        !rowIsRetiredBestBottlesTransparentReference(row)),
            );

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
                libraryTags: img.library_tags ?? [],
            }));
        },
        enabled: enabled && !!user,
        staleTime: 60 * 1000, // Cache for 1 minute to prevent flickering
        refetchOnWindowFocus: false, // Prevent random refetches that cause "disappearing"
    });
}
