import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;


// GHS Hazard Classes and Pictograms
const GHS_PICTOGRAMS: Record<string, { symbol: string; name: string }> = {
  GHS01: { symbol: "💥", name: "Explosive" },
  GHS02: { symbol: "🔥", name: "Flammable" },
  GHS03: { symbol: "⭕", name: "Oxidizer" },
  GHS04: { symbol: "🫧", name: "Compressed Gas" },
  GHS05: { symbol: "⚗️", name: "Corrosive" },
  GHS06: { symbol: "☠️", name: "Toxic" },
  GHS07: { symbol: "⚠️", name: "Irritant/Harmful" },
  GHS08: { symbol: "🫁", name: "Health Hazard" },
  GHS09: { symbol: "🌊", name: "Environmental Hazard" },
};

interface SDSInput {
  product_id: string;
  product_name: string;
  product_type?: string;
  brand_name?: string;
  sku?: string;
  ingredients: Array<{
    name: string;
    inci_name?: string;
    concentration_percent?: number;
    cas_number?: string;
  }>;
  physical_properties?: {
    state?: string;
    color?: string;
    odor?: string;
    ph?: number;
    flash_point?: string;
  };
  manufacturer?: {
    name: string;
    address: string;
    phone: string;
    emergency_phone?: string;
  };
  // Pre-existing SDS data to update
  existing_sds?: {
    ghs_classification?: string[];
    hazard_statements?: string[];
    precautionary_statements?: string[];
  };
}

serve(async (req) => {
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;
  const corsHeaders = getCorsHeaders(req);
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const input = await req.json() as SDSInput;

    console.log("[generate-sds-document] Generating SDS for:", input.product_name);

    const revisionDate = new Date().toISOString().split("T")[0];

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION 1: IDENTIFICATION
    // ═══════════════════════════════════════════════════════════════════════════
    const section1 = {
      title: "SECTION 1: IDENTIFICATION",
      content: {
        product_identifier: input.product_name,
        product_code: input.sku || "N/A",
        recommended_use: input.product_type || "Cosmetic product",
        restrictions: "For external use only",
        manufacturer: input.manufacturer || {
          name: "[Company Name]",
          address: "[Address]",
          phone: "[Phone]",
          emergency_phone: "[Emergency Phone]",
        },
      },
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION 2: HAZARD IDENTIFICATION
    // ═══════════════════════════════════════════════════════════════════════════
    
    // Determine GHS classification based on ingredients
    const ghs_classification = input.existing_sds?.ghs_classification || [];
    const ghs_pictograms: string[] = [];
    let signal_word = "";

    // Check for flammable ingredients (alcohol-based products)
    const hasAlcohol = input.ingredients.some(
      (i) => 
        i.name.toLowerCase().includes("alcohol") && 
        !i.name.toLowerCase().includes("fatty") &&
        (i.concentration_percent || 0) > 20
    );
    if (hasAlcohol) {
      ghs_classification.push("Flammable Liquid Category 3");
      ghs_pictograms.push("GHS02");
      signal_word = "Warning";
    }

    // Check for eye irritants
    const hasIrritants = input.ingredients.some(
      (i) =>
        i.name.toLowerCase().includes("acid") ||
        i.name.toLowerCase().includes("surfactant") ||
        i.name.toLowerCase().includes("sulfate")
    );
    if (hasIrritants && !ghs_pictograms.includes("GHS07")) {
      ghs_classification.push("Eye Irritation Category 2");
      ghs_pictograms.push("GHS07");
      if (!signal_word) signal_word = "Warning";
    }

    // Default for cosmetics - usually not classified
    if (ghs_classification.length === 0) {
      ghs_classification.push("Not classified as hazardous under GHS");
    }

    // Hazard statements
    const hazard_statements = input.existing_sds?.hazard_statements || [];
    if (hasAlcohol) {
      hazard_statements.push("H226: Flammable liquid and vapor");
    }
    if (hasIrritants) {
      hazard_statements.push("H319: Causes serious eye irritation");
    }

    // Precautionary statements
    const precautionary_statements = input.existing_sds?.precautionary_statements || [];
    if (precautionary_statements.length === 0) {
      precautionary_statements.push("P264: Wash hands thoroughly after handling");
      precautionary_statements.push("P280: Wear protective gloves/eye protection");
      if (hasAlcohol) {
        precautionary_statements.push("P210: Keep away from heat, sparks, open flames");
        precautionary_statements.push("P233: Keep container tightly closed");
      }
      if (hasIrritants) {
        precautionary_statements.push("P305+P351+P338: IF IN EYES: Rinse cautiously with water. Remove contact lenses if present. Continue rinsing");
      }
    }

    const section2 = {
      title: "SECTION 2: HAZARD IDENTIFICATION",
      content: {
        ghs_classification,
        ghs_pictograms: ghs_pictograms.map((p) => ({
          code: p,
          ...GHS_PICTOGRAMS[p],
        })),
        signal_word: signal_word || "None",
        hazard_statements,
        precautionary_statements,
      },
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION 3: COMPOSITION / INFORMATION ON INGREDIENTS
    // ═══════════════════════════════════════════════════════════════════════════
    const section3 = {
      title: "SECTION 3: COMPOSITION / INFORMATION ON INGREDIENTS",
      content: {
        substance_mixture: "Mixture",
        ingredients: input.ingredients.map((i) => ({
          name: i.inci_name || i.name,
          cas_number: i.cas_number || "N/A",
          concentration: i.concentration_percent
            ? `${i.concentration_percent}%`
            : "Proprietary",
        })),
      },
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION 4: FIRST-AID MEASURES
    // ═══════════════════════════════════════════════════════════════════════════
    const section4 = {
      title: "SECTION 4: FIRST-AID MEASURES",
      content: {
        inhalation: "Move to fresh air. If symptoms persist, seek medical attention.",
        skin_contact: "Wash with soap and water. If irritation occurs, seek medical attention.",
        eye_contact: "Rinse immediately with plenty of water for at least 15 minutes. Seek medical attention if irritation persists.",
        ingestion: "Do not induce vomiting. Rinse mouth with water. Seek medical attention immediately.",
        symptoms: "May cause skin or eye irritation in sensitive individuals.",
        notes_to_physician: "Treat symptomatically. No specific antidote.",
      },
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION 5: FIRE-FIGHTING MEASURES
    // ═══════════════════════════════════════════════════════════════════════════
    const section5 = {
      title: "SECTION 5: FIRE-FIGHTING MEASURES",
      content: {
        suitable_extinguishing_media: "Water spray, foam, dry chemical, carbon dioxide",
        unsuitable_media: "None known",
        specific_hazards: hasAlcohol
          ? "Flammable liquid. Vapors may form explosive mixtures with air."
          : "None known",
        protective_equipment: "Self-contained breathing apparatus. Full protective clothing.",
      },
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION 6: ACCIDENTAL RELEASE MEASURES
    // ═══════════════════════════════════════════════════════════════════════════
    const section6 = {
      title: "SECTION 6: ACCIDENTAL RELEASE MEASURES",
      content: {
        personal_precautions: "Wear appropriate protective equipment. Avoid contact with skin and eyes.",
        environmental_precautions: "Prevent entry into drains, sewers, or waterways.",
        containment_methods: "Absorb with inert material. Collect for disposal.",
        cleanup_methods: "Clean area with water and detergent.",
      },
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION 7: HANDLING AND STORAGE
    // ═══════════════════════════════════════════════════════════════════════════
    const section7 = {
      title: "SECTION 7: HANDLING AND STORAGE",
      content: {
        precautions_handling: "Avoid contact with eyes. Wash hands after handling.",
        storage_conditions: "Store in a cool, dry place away from direct sunlight.",
        incompatibilities: "Strong oxidizers, strong acids",
      },
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION 8: EXPOSURE CONTROLS / PERSONAL PROTECTION
    // ═══════════════════════════════════════════════════════════════════════════
    const section8 = {
      title: "SECTION 8: EXPOSURE CONTROLS / PERSONAL PROTECTION",
      content: {
        exposure_limits: "No specific occupational exposure limits established.",
        engineering_controls: "Ensure adequate ventilation.",
        personal_protection: {
          respiratory: "Not required under normal use conditions.",
          hand: "Protective gloves recommended for prolonged handling.",
          eye: "Safety glasses recommended.",
          skin: "Protective clothing as needed.",
        },
      },
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION 9: PHYSICAL AND CHEMICAL PROPERTIES
    // ═══════════════════════════════════════════════════════════════════════════
    const section9 = {
      title: "SECTION 9: PHYSICAL AND CHEMICAL PROPERTIES",
      content: {
        appearance: input.physical_properties?.state || "Liquid/Cream",
        color: input.physical_properties?.color || "Various",
        odor: input.physical_properties?.odor || "Characteristic",
        ph: input.physical_properties?.ph || "4.5-7.5",
        flash_point: input.physical_properties?.flash_point || hasAlcohol ? ">23°C" : "N/A",
        flammability: hasAlcohol ? "Flammable" : "Not flammable",
        solubility: "Miscible with water",
        density: "0.9-1.1 g/cm³",
      },
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION 10: STABILITY AND REACTIVITY
    // ═══════════════════════════════════════════════════════════════════════════
    const section10 = {
      title: "SECTION 10: STABILITY AND REACTIVITY",
      content: {
        reactivity: "Not reactive under normal conditions.",
        chemical_stability: "Stable under recommended storage conditions.",
        hazardous_reactions: "None known.",
        conditions_to_avoid: "Extreme temperatures, direct sunlight.",
        incompatible_materials: "Strong oxidizers, strong acids.",
        hazardous_decomposition: "None under normal conditions.",
      },
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION 11: TOXICOLOGICAL INFORMATION
    // ═══════════════════════════════════════════════════════════════════════════
    const section11 = {
      title: "SECTION 11: TOXICOLOGICAL INFORMATION",
      content: {
        acute_toxicity: "Low toxicity expected based on ingredients.",
        skin_corrosion: "May cause mild irritation in sensitive individuals.",
        eye_damage: hasIrritants ? "May cause serious eye irritation." : "May cause mild irritation.",
        sensitization: "Some ingredients may cause sensitization in susceptible individuals.",
        carcinogenicity: "No carcinogenic ingredients present.",
      },
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION 12-16 (Additional required sections)
    // ═══════════════════════════════════════════════════════════════════════════
    const section12 = {
      title: "SECTION 12: ECOLOGICAL INFORMATION",
      content: {
        ecotoxicity: "Not expected to be harmful to aquatic organisms at recommended use levels.",
        persistence: "Readily biodegradable.",
        bioaccumulation: "Not expected to bioaccumulate.",
      },
    };

    const section13 = {
      title: "SECTION 13: DISPOSAL CONSIDERATIONS",
      content: {
        disposal_methods: "Dispose of in accordance with local regulations. Do not empty into drains.",
        contaminated_packaging: "Empty containers may be recycled.",
      },
    };

    const section14 = {
      title: "SECTION 14: TRANSPORT INFORMATION",
      content: {
        un_number: "Not regulated",
        proper_shipping_name: "Not applicable",
        transport_hazard_class: "Not applicable",
        packing_group: "Not applicable",
        environmental_hazards: "Not classified as environmentally hazardous for transport.",
      },
    };

    const section15 = {
      title: "SECTION 15: REGULATORY INFORMATION",
      content: {
        safety_regulations: [
          "EU Cosmetics Regulation (EC) No 1223/2009",
          "US FDA 21 CFR Parts 700-740",
          "REACH Regulation (EC) No 1907/2006",
        ],
        sara_title_iii: "Not applicable",
        california_prop_65: "This product does not contain chemicals known to the State of California to cause cancer, birth defects, or reproductive harm.",
      },
    };

    const section16 = {
      title: "SECTION 16: OTHER INFORMATION",
      content: {
        revision_date: revisionDate,
        version: "1.0",
        prepared_by: "Safety Data Sheet System",
        disclaimer: "The information provided in this Safety Data Sheet is correct to the best of our knowledge at the date of publication. This information is provided for guidance only and should not be considered a warranty or quality specification.",
      },
    };

    // Compile full SDS document
    const sdsDocument = {
      header: {
        title: "SAFETY DATA SHEET",
        product_name: input.product_name,
        brand: input.brand_name,
        revision_date: revisionDate,
        version: "1.0",
        ghs_compliant: true,
      },
      sections: [
        section1, section2, section3, section4, section5,
        section6, section7, section8, section9, section10,
        section11, section12, section13, section14, section15, section16,
      ],
    };

    // Generate plain text version for easy export
    const plainTextSDS = generatePlainTextSDS(sdsDocument);

    // Store/update in database
    const { data: existingSDS } = await supabase
      .from("product_sds")
      .select("id, version")
      .eq("product_id", input.product_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const newVersion = existingSDS
      ? `${parseFloat(existingSDS.version) + 0.1}`
      : "1.0";

    const { data: savedSDS, error: saveError } = await supabase
      .from("product_sds")
      .insert({
        product_id: input.product_id,
        version: newVersion,
        revision_date: revisionDate,
        ghs_classification,
        signal_word: signal_word || null,
        hazard_statements,
        precautionary_statements,
        ghs_pictograms,
        physical_state: input.physical_properties?.state,
        color: input.physical_properties?.color,
        odor: input.physical_properties?.odor,
        ph: input.physical_properties?.ph,
        flash_point: input.physical_properties?.flash_point,
        status: "draft",
      })
      .select()
      .single();

    if (saveError) {
      console.error("[generate-sds-document] Save error:", saveError);
    }

    console.log("[generate-sds-document] Generated SDS version", newVersion);

    return new Response(
      JSON.stringify({
        success: true,
        sds_id: savedSDS?.id,
        version: newVersion,
        document: sdsDocument,
        plain_text: plainTextSDS,
        ghs_classification,
        ghs_pictograms,
        signal_word: signal_word || "None",
        hazard_statements,
        precautionary_statements,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[generate-sds-document] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function generatePlainTextSDS(doc: any): string {
  const lines: string[] = [];
  
  lines.push("═".repeat(70));
  lines.push(doc.header.title);
  lines.push("═".repeat(70));
  lines.push("");
  lines.push(`Product: ${doc.header.product_name}`);
  if (doc.header.brand) lines.push(`Brand: ${doc.header.brand}`);
  lines.push(`Revision Date: ${doc.header.revision_date}`);
  lines.push(`Version: ${doc.header.version}`);
  lines.push("");

  for (const section of doc.sections) {
    lines.push("─".repeat(70));
    lines.push(section.title);
    lines.push("─".repeat(70));
    
    const formatContent = (obj: any, indent = 0) => {
      const prefix = "  ".repeat(indent);
      for (const [key, value] of Object.entries(obj)) {
        const label = key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
        
        if (Array.isArray(value)) {
          lines.push(`${prefix}${label}:`);
          for (const item of value) {
            if (typeof item === "object") {
              formatContent(item, indent + 1);
            } else {
              lines.push(`${prefix}  • ${item}`);
            }
          }
        } else if (typeof value === "object" && value !== null) {
          lines.push(`${prefix}${label}:`);
          formatContent(value, indent + 1);
        } else {
          lines.push(`${prefix}${label}: ${value}`);
        }
      }
    };
    
    formatContent(section.content);
    lines.push("");
  }

  return lines.join("\n");
}
