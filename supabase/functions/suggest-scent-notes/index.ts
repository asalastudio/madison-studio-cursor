import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;


interface ScentNote {
  id: string;
  name: string;
  note_type: "top" | "heart" | "base" | "modifier";
  scent_family: string;
  description: string | null;
  character_tags: string[];
  intensity: string | null;
  pairs_well_with: string[];
  natural_source: string | null;
}

serve(async (req) => {
  // Handle CORS preflight
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;
  const corsHeaders = getCorsHeaders(req);
  }

  try {
    // Create Supabase client
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Parse request
    const { query, noteType, scentFamily, limit = 20, existingNotes = [] } = await req.json();

    console.log("[suggest-scent-notes] Request:", { query, noteType, scentFamily, limit });

    // Build query
    let dbQuery = supabaseClient
      .from("scent_notes")
      .select("*")
      .eq("is_active", true);

    // Filter by note type if specified
    if (noteType && noteType !== "all") {
      dbQuery = dbQuery.eq("note_type", noteType);
    }

    // Filter by scent family if specified
    if (scentFamily && scentFamily !== "all") {
      dbQuery = dbQuery.eq("scent_family", scentFamily);
    }

    // Search by name if query provided
    if (query && query.trim().length > 0) {
      // Use ilike for partial matching
      dbQuery = dbQuery.ilike("name", `%${query.trim()}%`);
    }

    // Exclude already selected notes
    if (existingNotes && existingNotes.length > 0) {
      dbQuery = dbQuery.not("name", "in", `(${existingNotes.map((n: string) => `"${n}"`).join(",")})`);
    }

    // Order by usage count (popularity) and name
    dbQuery = dbQuery
      .order("usage_count", { ascending: false })
      .order("name", { ascending: true })
      .limit(limit);

    const { data: notes, error } = await dbQuery;

    if (error) {
      console.error("[suggest-scent-notes] Database error:", error);
      throw error;
    }

    console.log(`[suggest-scent-notes] Found ${notes?.length || 0} notes`);

    // Return formatted results
    return new Response(
      JSON.stringify({
        notes: notes || [],
        count: notes?.length || 0,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[suggest-scent-notes] Error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        notes: [],
        count: 0,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
