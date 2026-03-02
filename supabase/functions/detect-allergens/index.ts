import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;


interface Ingredient {
  name: string;
  inci_name?: string;
  concentration_percent?: number;
}

interface AllergenMatch {
  allergen_name: string;
  inci_name: string;
  source_ingredient: string;
  allergen_type: string;
  disclosure_threshold: number;
  requires_disclosure: boolean;
  warning_text: string;
}

serve(async (req) => {
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;
  const corsHeaders = getCorsHeaders(req);
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { ingredients, product_type } = await req.json() as {
      ingredients: Ingredient[];
      product_type?: "leave_on" | "rinse_off";
    };

    console.log("[detect-allergens] Checking", ingredients.length, "ingredients");

    // Fetch all active allergens
    const { data: allergenRegistry, error: allergenError } = await supabase
      .from("allergen_registry")
      .select("*")
      .eq("is_active", true);

    if (allergenError) {
      throw allergenError;
    }

    // Determine disclosure threshold based on product type
    // EU: 0.001% for rinse-off, 0.01% for leave-on
    const thresholdMultiplier = product_type === "rinse_off" ? 1 : 10;

    const detectedAllergens: AllergenMatch[] = [];
    const warnings: string[] = [];

    // Check each ingredient against allergen registry
    for (const ingredient of ingredients) {
      const ingredientName = ingredient.name.toLowerCase();
      const inciName = ingredient.inci_name?.toLowerCase() || "";
      const concentration = ingredient.concentration_percent || 0;

      for (const allergen of allergenRegistry || []) {
        let isMatch = false;
        let matchReason = "";

        // Check if ingredient name matches allergen name
        if (ingredientName.includes(allergen.name.toLowerCase()) ||
            allergen.name.toLowerCase().includes(ingredientName)) {
          isMatch = true;
          matchReason = "name match";
        }

        // Check if INCI name matches
        if (allergen.inci_name && inciName &&
            (inciName.includes(allergen.inci_name.toLowerCase()) ||
             allergen.inci_name.toLowerCase().includes(inciName))) {
          isMatch = true;
          matchReason = "INCI match";
        }

        // Check if ingredient is a common source
        if (allergen.common_sources) {
          for (const source of allergen.common_sources) {
            if (ingredientName.includes(source.toLowerCase()) ||
                source.toLowerCase().includes(ingredientName)) {
              isMatch = true;
              matchReason = `contains ${source}`;
              break;
            }
          }
        }

        if (isMatch) {
          const effectiveThreshold = (allergen.disclosure_threshold || 0.001) * thresholdMultiplier;
          const requiresDisclosure = concentration >= effectiveThreshold || concentration === 0;

          // Avoid duplicates
          const existing = detectedAllergens.find(
            (a) => a.allergen_name === allergen.name && a.source_ingredient === ingredient.name
          );

          if (!existing) {
            detectedAllergens.push({
              allergen_name: allergen.name,
              inci_name: allergen.inci_name || allergen.name,
              source_ingredient: ingredient.name,
              allergen_type: allergen.allergen_type,
              disclosure_threshold: effectiveThreshold,
              requires_disclosure: requiresDisclosure,
              warning_text: allergen.display_warning || `Contains ${allergen.name}`,
            });

            if (requiresDisclosure && !warnings.includes(allergen.display_warning)) {
              warnings.push(allergen.display_warning || `Contains ${allergen.name}`);
            }
          }
        }
      }
    }

    // Sort allergens by type and name
    detectedAllergens.sort((a, b) => {
      if (a.allergen_type !== b.allergen_type) {
        return a.allergen_type.localeCompare(b.allergen_type);
      }
      return a.allergen_name.localeCompare(b.allergen_name);
    });

    console.log("[detect-allergens] Found", detectedAllergens.length, "potential allergens");

    return new Response(
      JSON.stringify({
        detected_allergens: detectedAllergens,
        allergen_count: detectedAllergens.length,
        requires_disclosure_count: detectedAllergens.filter((a) => a.requires_disclosure).length,
        warnings,
        // Generate label-ready allergen list
        label_allergens: [...new Set(detectedAllergens.filter(a => a.requires_disclosure).map((a) => a.inci_name))],
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[detect-allergens] Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        detected_allergens: [],
        warnings: [],
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
