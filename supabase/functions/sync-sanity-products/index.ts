/**
 * Sync Sanity Products - Pull products from Sanity.io into Madison Studio
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";


// Helper: Convert Portable Text to plain string
function portableTextToPlain(blocks: any[]): string {
  if (!blocks || !Array.isArray(blocks)) return "";
  return blocks
    .map(block => {
      if (block._type !== "block" || !block.children) return "";
      return block.children.map((child: any) => child.text).join("");
    })
    .join("\n\n");
}

serve(async (req) => {
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;
  const corsHeaders = getCorsHeaders(req);
  }

  try {
    const requestBody = await req.json();
    const { organization_id, sanity_project_id, sanity_dataset } = requestBody;

    console.log("[sync-sanity-products] VERSION 10 - Request body:", JSON.stringify(requestBody));

    if (!organization_id) {
      return new Response(
        JSON.stringify({ success: false, error: "organization_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const projectId = sanity_project_id || "8h5l91ut";
    const dataset = sanity_dataset || "production";

    console.log(`[sync-sanity-products] Input project: ${sanity_project_id}, Input dataset: ${sanity_dataset}`);
    console.log(`[sync-sanity-products] Using project: ${projectId}, dataset: ${dataset}`);

    // Expanded GROQ query to fetch comprehensive product data
    const groqQuery = `*[_type == "product" && title != null][0...100]{
      _id,
      title,
      legacyName,
      internalName,
      "slugCurrent": slug.current,
      collectionType,

      // SKUs
      sku,
      sku6ml,
      sku12ml,
      "parentSku": parentSku,

      // Media
      mainImage,
      "galleryImages": gallery[]{asset},
      shopifyPreviewImageUrl,

      // Commerce
      price,
      compareAtPrice,
      inStock,
      scarcityNote,
      shopifyProductId,
      shopifyHandle,
      shopifyVariantId,
      shopifyVariant6mlId,
      shopifyVariant12mlId,

      // General Info
      volume,
      scentProfile,
      shortDescription,
      longDescription,
      inspiredBy,
      productFormat,
      perfumer,
      year,

      // Fragrance Architecture
      notes,
      scentFamily,
      longevity,
      sillage,
      bestSeasons,
      bestOccasions,
      baseCarrier,
      keyBenefits,
      features,

      // Atlas Collection Data
      "atlasAtmosphere": atlasData.atmosphere,
      "atlasGps": atlasData.gpsCoordinates,
      "atlasStory": atlasData.travelLog,
      "atlasBadges": atlasData.badges,

      // Relic Collection Data
      "relicOrigin": relicData.originRegion,
      "relicGps": relicData.gpsCoordinates,
      "relicStory": relicData.museumDescription,
      "relicBadges": relicData.badges,
      "relicDistillationYear": relicData.distillationYear,
      "relicViscosity": relicData.viscosity,
      "relicIsHeritage": relicData.isHeritageDistillation,
      "relicHeritageType": relicData.heritageType,

      // SEO
      seo
    }`;

    const fullUrl = `https://${projectId}.api.sanity.io/v2024-01-01/data/query/${dataset}?query=${encodeURIComponent(groqQuery)}`;

    console.log(`[sync-sanity-products] Fetching: ${fullUrl}`);

    const sanityResponse = await fetch(fullUrl);
    const responseText = await sanityResponse.text();

    console.log(`[sync-sanity-products] Response status: ${sanityResponse.status}`);

    if (!sanityResponse.ok) {
      throw new Error(`Sanity API error: ${sanityResponse.status} - ${responseText}`);
    }

    let sanityData;
    try {
      sanityData = JSON.parse(responseText);
    } catch (e) {
      throw new Error(`Failed to parse Sanity response: ${responseText.substring(0, 200)}`);
    }

    const allProducts = sanityData.result || [];
    // Filter out drafts in code (IDs starting with "drafts.")
    const products = allProducts.filter((p: any) => !p._id.startsWith("drafts."));
    console.log(`[sync-sanity-products] Found ${allProducts.length} total, ${products.length} non-draft products`);

    if (products.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No products found in Sanity",
          total: 0,
          inserted: 0,
          updated: 0,
          version: 10,
          debug: {
            sanityUrl: fullUrl,
            sanityStatus: sanityResponse.status
          }
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // ═══════════════════════════════════════════════════════════════════════════════
    // FETCH SHOPIFY PRICING & INVENTORY DATA
    // ═══════════════════════════════════════════════════════════════════════════════

    console.log(`[sync-sanity-products] Fetching Shopify pricing/inventory data...`);

    const { data: shopifyProducts, error: shopifyError } = await supabase
      .from("brand_products")
      .select("id, name, sku, price, compare_at_price, inventory_quantity, variants, featured_image_url")
      .eq("organization_id", organization_id);

    const skuPricingMap: Record<string, { price: number; compare_at_price: number | null; inventory_quantity: number; image_url?: string }> = {};

    if (shopifyProducts && !shopifyError) {
      for (const sp of shopifyProducts) {
        if (sp.sku) {
          skuPricingMap[sp.sku.toUpperCase()] = {
            price: sp.price || 0,
            compare_at_price: sp.compare_at_price || null,
            inventory_quantity: sp.inventory_quantity || 0,
            image_url: sp.featured_image_url || undefined
          };
        }
        if (sp.variants) {
          try {
            const variants = typeof sp.variants === 'string' ? JSON.parse(sp.variants) : sp.variants;
            if (Array.isArray(variants)) {
              for (const v of variants) {
                if (v.sku) {
                  skuPricingMap[v.sku.toUpperCase()] = {
                    price: v.price || 0,
                    compare_at_price: v.compare_at_price || null,
                    inventory_quantity: v.inventory_quantity || 0
                  };
                }
              }
            }
          } catch (e) {
            // Ignore parsing errors
          }
        }
      }
    }

    let insertedCount = 0;
    let updatedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    for (const product of products) {
      try {
        if (!product.title) continue;

        console.log(`[sync-sanity-products] Processing: ${product.title}`);

        // Generate slug
        const slug = product.slugCurrent || product.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

        // Build Variants (same logic as before)
        const variants: any[] = [];
        let primarySku = null;
        let primaryPrice = null;

        if (product.sku6ml) {
          const sku6mlUpper = product.sku6ml.toUpperCase();
          const shopifyData6ml = skuPricingMap[sku6mlUpper];
          variants.push({
            id: `sanity-${product._id}-6ml`,
            title: "6ml",
            sku: product.sku6ml,
            price: shopifyData6ml?.price || 0,
            compare_at_price: shopifyData6ml?.compare_at_price || null,
            inventory_quantity: shopifyData6ml?.inventory_quantity || 0,
            inventory_policy: "deny",
            option1: "6ml",
            position: 1,
            metadata: { source: "sanity", sanity_id: product._id, shopify_synced: !!shopifyData6ml }
          });
          primarySku = product.sku6ml;
          primaryPrice = shopifyData6ml?.price || null;
        }

        if (product.sku12ml) {
          const sku12mlUpper = product.sku12ml.toUpperCase();
          const shopifyData12ml = skuPricingMap[sku12mlUpper];
          variants.push({
            id: `sanity-${product._id}-12ml`,
            title: "12ml",
            sku: product.sku12ml,
            price: shopifyData12ml?.price || 0,
            compare_at_price: shopifyData12ml?.compare_at_price || null,
            inventory_quantity: shopifyData12ml?.inventory_quantity || 0,
            inventory_policy: "deny",
            option1: "12ml",
            position: 2,
            metadata: { source: "sanity", sanity_id: product._id, shopify_synced: !!shopifyData12ml }
          });
          if (!primarySku) {
            primarySku = product.sku12ml;
            primaryPrice = shopifyData12ml?.price || null;
          }
        }

        const options: any[] = [];
        if (variants.length > 0) {
          const sizeValues = variants.map(v => v.option1).filter(Boolean);
          if (sizeValues.length > 0) options.push({ name: "Size", values: sizeValues, position: 1 });
        }

        // Image URL
        let heroImageUrl = null;
        if (product.mainImage?.asset?._ref) {
          const ref = product.mainImage.asset._ref;
          const match = ref.match(/^image-([a-f0-9]+)-(\d+x\d+)-(\w+)$/);
          if (match) {
            const [, id, dimensions, format] = match;
            heroImageUrl = `https://cdn.sanity.io/images/${projectId}/${dataset}/${id}-${dimensions}.${format}`;
          }
        }

        // --- STORYTELLING EXTRACTION ---
        // Prioritize Atlas story, then Relic story, then raw description
        let rawStory = "";
        if (product.atlasStory) rawStory = portableTextToPlain(product.atlasStory);
        else if (product.relicStory) rawStory = portableTextToPlain(product.relicStory);
        else if (product.description) rawStory = product.description;

        // If no story but we have scent profile/notes, construct a basic one for context
        if (!rawStory && product.notes) {
          const top = product.notes.top?.join(", ");
          const heart = product.notes.heart?.join(", ");
          const base = product.notes.base?.join(", ");
          rawStory = `Fragrance Profile for ${product.title}.\nTop Notes: ${top || 'N/A'}\nHeart Notes: ${heart || 'N/A'}\nBase Notes: ${base || 'N/A'}`;
        }

        // --- END STORYTELLING EXTRACTION ---

        // Use Sanity price if available, otherwise fallback to Shopify pricing
        const finalPrice = product.price || primaryPrice;
        const finalCompareAt = product.compareAtPrice || null;

        // Build tags from badges
        const tags: string[] = [];
        if (product.atlasBadges) tags.push(...product.atlasBadges);
        if (product.relicBadges) tags.push(...product.relicBadges);
        if (product.features) tags.push(...product.features);

        // Short description / tagline
        const shortDesc = product.shortDescription || product.scentProfile || null;

        // Product line from collection type
        const productLine = product.collectionType ?
          product.collectionType.charAt(0).toUpperCase() + product.collectionType.slice(1) : null;

        const productData: Record<string, any> = {
          organization_id: organization_id,
          name: product.title,
          slug: slug,
          sku: product.parentSku || product.sku || primarySku,
          price: finalPrice,
          compare_at_price: finalCompareAt,
          status: product.inStock === false ? "archived" : "active",
          development_stage: "launched",
          category: "Fragrance",
          product_type: product.productFormat || "Attär",
          product_line: productLine,
          hero_image_external_url: heroImageUrl,
          short_description: shortDesc,
          tagline: product.scentProfile || null,
          long_description: rawStory || (product.longDescription ? portableTextToPlain(product.longDescription) : null),
          tags: tags.length > 0 ? tags : null,
          key_benefits: product.keyBenefits || null,
          variants: variants,
          options: options,
          external_ids: {
            sanity_id: product._id,
            shopify_product_id: product.shopifyProductId || null,
            shopify_handle: product.shopifyHandle || null,
            shopify_variant_id: product.shopifyVariantId || null,
            shopify_variant_6ml_id: product.shopifyVariant6mlId || null,
            shopify_variant_12ml_id: product.shopifyVariant12mlId || null,
          },
          metadata: {
            source: "sanity",
            imported_at: new Date().toISOString(),
            legacy_name: product.legacyName || null,
            internal_name: product.internalName || null,
            shopify_pricing_synced: Object.keys(skuPricingMap).length > 0,

            // SKUs
            sku_6ml: product.sku6ml || null,
            sku_12ml: product.sku12ml || null,
            parent_sku: product.parentSku || null,

            // Fragrance Architecture
            scent_notes: product.notes || null,
            scent_profile_summary: product.scentProfile || null,
            scent_family: product.scentFamily || null,
            longevity: product.longevity || null,
            sillage: product.sillage || null,
            best_seasons: product.bestSeasons || null,
            best_occasions: product.bestOccasions || null,
            base_carrier: product.baseCarrier || null,

            // Product Details
            volume: product.volume || null,
            inspired_by: product.inspiredBy || null,
            perfumer: product.perfumer || null,
            year: product.year || null,
            scarcity_note: product.scarcityNote || null,

            // Collection-Specific Data
            collection_type: product.collectionType || null,

            // Atlas Data
            atlas_atmosphere: product.atlasAtmosphere || null,
            atlas_gps: product.atlasGps || null,
            atlas_badges: product.atlasBadges || null,

            // Relic Data
            relic_origin_region: product.relicOrigin || null,
            relic_gps: product.relicGps || null,
            relic_distillation_year: product.relicDistillationYear || null,
            relic_viscosity: product.relicViscosity || null,
            relic_is_heritage: product.relicIsHeritage || null,
            relic_heritage_type: product.relicHeritageType || null,
            relic_badges: product.relicBadges || null,

            // SEO
            seo: product.seo || null,
          }
        };

        const { data: existing, error: selectError } = await supabase
          .from("product_hubs")
          .select("id")
          .eq("organization_id", organization_id)
          .eq("name", product.title)
          .maybeSingle();

        if (selectError) {
          console.error(`[sync-sanity-products] Select error for ${product.title}:`, selectError);
          errors.push(`Select ${product.title}: ${selectError.message}`);
          errorCount++;
          continue;
        }

        if (existing) {
          console.log(`[sync-sanity-products] Updating existing product: ${product.title}`);
          const { error: updateError } = await supabase
            .from("product_hubs")
            .update({
              sku: productData.sku,
              slug: productData.slug,
              price: productData.price,
              compare_at_price: productData.compare_at_price,
              product_type: productData.product_type,
              product_line: productData.product_line,
              hero_image_external_url: productData.hero_image_external_url,
              short_description: productData.short_description,
              tagline: productData.tagline,
              long_description: productData.long_description,
              tags: productData.tags,
              key_benefits: productData.key_benefits,
              variants: productData.variants,
              options: productData.options,
              external_ids: productData.external_ids,
              metadata: productData.metadata
            })
            .eq("id", existing.id);

          if (updateError) {
            console.error(`[sync-sanity-products] Update error:`, updateError);
            errors.push(`Update ${product.title}: ${updateError.message}`);
            errorCount++;
          } else {
            updatedCount++;
          }
        } else {
          const { error: insertError } = await supabase
            .from("product_hubs")
            .insert([productData]);

          if (insertError) {
            console.error(`[sync-sanity-products] Insert error:`, insertError);
            errors.push(`Insert ${product.title}: ${insertError.message}`);
            errorCount++;
          } else {
            insertedCount++;
          }
        }
      } catch (e: any) {
        console.error(`[sync-sanity-products] Error processing ${product.title}:`, e);
        errors.push(`Process ${product.title}: ${e.message}`);
        errorCount++;
      }
    }

    console.log(`[sync-sanity-products] Complete: ${insertedCount} inserted, ${updatedCount} updated, ${errorCount} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        inserted: insertedCount,
        updated: updatedCount,
        errors: errorCount,
        errorDetails: errors.slice(0, 5)
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[sync-sanity-products] Fatal error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
