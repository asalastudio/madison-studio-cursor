import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";


interface BusinessTypeConfig {
  business_type: string;
  display_name: string;
  description: string;
  icon: string;
  enabled_sections: Record<string, boolean>;
  vocabulary: Record<string, string>;
  default_categories: string[];
  product_fields: {
    required: string[];
    recommended: string[];
    optional: string[];
    hidden: string[];
  };
  ai_context: {
    industry_terms: string[];
    content_focus: string;
    tone_hints: string;
    target_audience: string;
  };
  onboarding_config: {
    welcome_message: string;
    suggested_first_steps: string[];
    skip_sections: string[];
  };
}

serve(async (req) => {
  // Handle CORS preflight
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;
  const corsHeaders = getCorsHeaders(req);
  }

  try {
    const { organizationId, businessType } = await req.json();

    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    let targetBusinessType = businessType;

    // If organizationId provided, get the org's business type
    if (organizationId && !businessType) {
      const { data: org, error: orgError } = await supabaseClient
        .from("organizations")
        .select("business_type")
        .eq("id", organizationId)
        .single();

      if (orgError) {
        console.error("Error fetching organization:", orgError);
      }

      targetBusinessType = org?.business_type || "finished_goods";
    }

    // Default to finished_goods if nothing specified
    if (!targetBusinessType) {
      targetBusinessType = "finished_goods";
    }

    // Get the config for this business type
    const { data: config, error: configError } = await supabaseClient
      .from("business_type_config")
      .select("*")
      .eq("business_type", targetBusinessType)
      .eq("is_active", true)
      .single();

    if (configError) {
      console.error("Error fetching config:", configError);
      
      // Return default config if not found
      return new Response(
        JSON.stringify({
          success: true,
          config: {
            business_type: "finished_goods",
            display_name: "Finished Goods Brand",
            description: "Default configuration",
            icon: "sparkles",
            enabled_sections: {
              products: true,
              ingredients: true,
              specifications: true,
              marketing_campaigns: true,
              social_media: true,
              email_marketing: true,
              blog_content: true,
              product_photography: true,
            },
            vocabulary: {
              product: "Product",
              products: "Products",
              ingredient: "Ingredient",
              customer: "Customer",
            },
            default_categories: [],
            product_fields: {
              required: ["name"],
              recommended: ["description"],
              optional: [],
              hidden: [],
            },
            ai_context: {
              industry_terms: [],
              content_focus: "General marketing",
              tone_hints: "Professional and friendly",
              target_audience: "Consumers",
            },
            onboarding_config: {
              welcome_message: "Welcome to Madison Studio!",
              suggested_first_steps: ["Add your first product"],
              skip_sections: [],
            },
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Transform the config to match expected shape
    const transformedConfig: BusinessTypeConfig = {
      business_type: config.business_type,
      display_name: config.display_name,
      description: config.description || "",
      icon: config.icon || "package",
      enabled_sections: config.enabled_sections || {},
      vocabulary: config.vocabulary || {},
      default_categories: config.default_categories || [],
      product_fields: config.product_fields || {
        required: [],
        recommended: [],
        optional: [],
        hidden: [],
      },
      ai_context: config.ai_context || {
        industry_terms: [],
        content_focus: "",
        tone_hints: "",
        target_audience: "",
      },
      onboarding_config: config.onboarding_config || {
        welcome_message: "",
        suggested_first_steps: [],
        skip_sections: [],
      },
    };

    return new Response(
      JSON.stringify({
        success: true,
        config: transformedConfig,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in get-business-type-config:", errorMessage);

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
