import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";


interface Ingredient {
  name: string;
  inci_name?: string;
  common_name?: string;
  concentration_percent?: number;
  is_allergen?: boolean;
  origin?: string;
}

interface INCIListOptions {
  format: "eu" | "us" | "simple";
  include_percentages: boolean;
  include_allergens_separate: boolean;
  uppercase: boolean;
  separator: ", " | " / " | "\n";
}

serve(async (req) => {
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;
  const corsHeaders = getCorsHeaders(req);
  }

  try {
    const { ingredients, options } = await req.json() as {
      ingredients: Ingredient[];
      options?: Partial<INCIListOptions>;
    };

    const defaultOptions: INCIListOptions = {
      format: "eu",
      include_percentages: false,
      include_allergens_separate: true,
      uppercase: true,
      separator: ", ",
    };

    const opts = { ...defaultOptions, ...options };

    console.log("[generate-inci-list] Processing", ingredients.length, "ingredients");

    // Sort ingredients by concentration (descending)
    // INCI lists must be sorted by concentration
    const sortedIngredients = [...ingredients].sort((a, b) => {
      const concA = a.concentration_percent ?? 0;
      const concB = b.concentration_percent ?? 0;
      return concB - concA;
    });

    // Separate main ingredients from those under 1%
    // EU regulation allows ingredients under 1% to be listed in any order
    const aboveOnePercent = sortedIngredients.filter(
      (i) => (i.concentration_percent ?? 0) >= 1
    );
    const belowOnePercent = sortedIngredients.filter(
      (i) => (i.concentration_percent ?? 0) < 1 && (i.concentration_percent ?? 0) > 0
    );
    const unknownConcentration = sortedIngredients.filter(
      (i) => i.concentration_percent === undefined || i.concentration_percent === null
    );

    // Format ingredient name
    const formatName = (ingredient: Ingredient): string => {
      let name = ingredient.inci_name || ingredient.name;
      
      if (opts.uppercase) {
        name = name.toUpperCase();
      }

      if (opts.include_percentages && ingredient.concentration_percent !== undefined) {
        name += ` (${ingredient.concentration_percent}%)`;
      }

      return name;
    };

    // Build the list
    let mainList: string[] = [];
    let allergenList: string[] = [];

    // Add ingredients above 1% (must be in descending concentration order)
    mainList = mainList.concat(aboveOnePercent.map(formatName));

    // Add ingredients below 1% (can be in any order, typically alphabetical)
    if (belowOnePercent.length > 0) {
      const sortedBelowOne = [...belowOnePercent].sort((a, b) => {
        const nameA = (a.inci_name || a.name).toLowerCase();
        const nameB = (b.inci_name || b.name).toLowerCase();
        return nameA.localeCompare(nameB);
      });
      mainList = mainList.concat(sortedBelowOne.map(formatName));
    }

    // Add unknown concentration at the end
    if (unknownConcentration.length > 0) {
      mainList = mainList.concat(unknownConcentration.map(formatName));
    }

    // Extract allergens if needed
    if (opts.include_allergens_separate) {
      allergenList = sortedIngredients
        .filter((i) => i.is_allergen)
        .map((i) => {
          let name = i.inci_name || i.name;
          if (opts.uppercase) name = name.toUpperCase();
          return name;
        });
    }

    // Format output based on region
    let output = "";
    
    if (opts.format === "eu") {
      // EU format: "Ingredients: LIST. May Contain: ALLERGENS"
      output = `Ingredients: ${mainList.join(opts.separator)}.`;
      if (allergenList.length > 0) {
        output += `\n\nMay Contain: ${allergenList.join(opts.separator)}.`;
      }
    } else if (opts.format === "us") {
      // US format: "Ingredients: LIST"
      output = `Ingredients: ${mainList.join(opts.separator)}.`;
      // US doesn't require separate allergen listing for cosmetics
    } else {
      // Simple format: just the list
      output = mainList.join(opts.separator);
    }

    // Generate additional formats
    const copyReadyList = mainList.join(", ");
    const lineBreakList = mainList.join("\n");

    return new Response(
      JSON.stringify({
        formatted_list: output,
        copy_ready: copyReadyList,
        line_break_list: lineBreakList,
        ingredient_count: mainList.length,
        allergen_list: allergenList,
        allergen_count: allergenList.length,
        // Metadata
        has_unknown_concentrations: unknownConcentration.length > 0,
        ingredients_above_1_percent: aboveOnePercent.length,
        ingredients_below_1_percent: belowOnePercent.length,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[generate-inci-list] Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        formatted_list: "",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
