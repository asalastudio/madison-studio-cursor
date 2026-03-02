import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;


interface LabelInput {
  product_name: string;
  product_type?: string;
  net_weight?: string;
  ingredients: Array<{
    name: string;
    inci_name?: string;
    concentration_percent?: number;
    is_allergen?: boolean;
  }>;
  allergens: string[];
  certifications: string[];
  warnings?: string[];
  usage_instructions?: string;
  brand_name?: string;
  manufacturer_address?: string;
  country_of_origin?: string;
  batch_code_placeholder?: boolean;
  expiry_info?: string;
  region: "eu" | "us" | "both";
}

serve(async (req) => {
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;
  const corsHeaders = getCorsHeaders(req);
  }

  try {
    const input = await req.json() as LabelInput;

    console.log("[generate-label-text] Generating label for:", input.product_name);

    // Build INCI list (sorted by concentration)
    const sortedIngredients = [...input.ingredients].sort((a, b) => {
      return (b.concentration_percent ?? 0) - (a.concentration_percent ?? 0);
    });

    const inciList = sortedIngredients
      .map((i) => (i.inci_name || i.name).toUpperCase())
      .join(", ");

    // Build allergen warning
    const allergenWarning = input.allergens.length > 0
      ? `May Contain: ${input.allergens.map((a) => a.toUpperCase()).join(", ")}.`
      : "";

    // Build certification icons text
    const certificationText = input.certifications.length > 0
      ? input.certifications.map((c) => {
          const certMap: Record<string, string> = {
            cruelty_free: "🐰 Cruelty-Free",
            vegan: "🌱 Vegan",
            organic: "🌿 Organic",
            halal: "☪️ Halal",
            kosher: "✡️ Kosher",
            fair_trade: "🤝 Fair Trade",
            leaping_bunny: "🐰 Leaping Bunny Certified",
            peta: "🐰 PETA Approved",
          };
          return certMap[c] || c;
        }).join(" | ")
      : "";

    // Standard warnings based on product type
    const standardWarnings: string[] = [...(input.warnings || [])];
    
    // Add standard cosmetic warnings
    standardWarnings.push("For external use only.");
    standardWarnings.push("Avoid contact with eyes.");
    standardWarnings.push("Discontinue use if irritation occurs.");
    if (input.product_type?.toLowerCase().includes("fragrance") ||
        input.product_type?.toLowerCase().includes("perfume")) {
      standardWarnings.push("Keep away from flame.");
    }

    // Build EU-compliant label
    const euLabel = {
      header: input.brand_name ? `${input.brand_name.toUpperCase()}` : "",
      product_name: input.product_name,
      net_weight: input.net_weight || "",
      ingredients_header: "INGREDIENTS:",
      ingredients: inciList,
      allergen_warning: allergenWarning,
      warnings: standardWarnings,
      usage: input.usage_instructions || "",
      certifications: certificationText,
      manufacturer: input.manufacturer_address || "[Manufacturer Address Required]",
      country: input.country_of_origin ? `Made in ${input.country_of_origin}` : "",
      batch: input.batch_code_placeholder ? "Batch: [BATCH CODE]" : "",
      expiry: input.expiry_info || "",
      // EU requires PAO symbol for products with >30 month shelf life
      pao: "12M", // Period After Opening
    };

    // Build US-compliant label (FDA)
    const usLabel = {
      header: input.brand_name ? `${input.brand_name.toUpperCase()}` : "",
      product_name: input.product_name,
      net_weight: input.net_weight || "",
      ingredients_header: "INGREDIENTS:",
      ingredients: inciList,
      // US doesn't require allergen listing for cosmetics (but recommended)
      allergen_warning: allergenWarning,
      warnings: standardWarnings,
      usage: input.usage_instructions || "",
      certifications: certificationText,
      distributor: input.manufacturer_address || "[Distributor Address Required]",
      country: input.country_of_origin ? `Made in ${input.country_of_origin}` : "",
    };

    // Generate copy-ready label text
    const formatLabel = (label: typeof euLabel, region: string) => {
      const lines: string[] = [];
      
      if (label.header) lines.push(label.header);
      lines.push(label.product_name);
      if (label.net_weight) lines.push(label.net_weight);
      lines.push("");
      lines.push(label.ingredients_header);
      lines.push(label.ingredients);
      
      if (label.allergen_warning) {
        lines.push("");
        lines.push(label.allergen_warning);
      }
      
      if (label.warnings.length > 0) {
        lines.push("");
        lines.push("WARNINGS:");
        label.warnings.forEach((w) => lines.push(`• ${w}`));
      }
      
      if (label.usage) {
        lines.push("");
        lines.push("DIRECTIONS:");
        lines.push(label.usage);
      }
      
      if (label.certifications) {
        lines.push("");
        lines.push(label.certifications);
      }
      
      lines.push("");
      if ("manufacturer" in label && label.manufacturer) {
        lines.push(label.manufacturer);
      }
      if ("distributor" in label && label.distributor) {
        lines.push(`Distributed by: ${label.distributor}`);
      }
      if (label.country) lines.push(label.country);
      if ("batch" in label && label.batch) lines.push(label.batch);
      if ("expiry" in label && label.expiry) lines.push(label.expiry);
      if ("pao" in label && label.pao) lines.push(`${label.pao} ⏱️`);
      
      return lines.join("\n");
    };

    // Generate labels based on region
    let euLabelText = "";
    let usLabelText = "";

    if (input.region === "eu" || input.region === "both") {
      euLabelText = formatLabel(euLabel, "EU");
    }
    if (input.region === "us" || input.region === "both") {
      usLabelText = formatLabel(usLabel as any, "US");
    }

    return new Response(
      JSON.stringify({
        eu_label: euLabelText,
        us_label: usLabelText,
        inci_list: inciList,
        allergen_warning: allergenWarning,
        ingredient_count: input.ingredients.length,
        allergen_count: input.allergens.length,
        certification_count: input.certifications.length,
        // Structured data for custom formatting
        structured: {
          eu: euLabel,
          us: usLabel,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[generate-label-text] Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
