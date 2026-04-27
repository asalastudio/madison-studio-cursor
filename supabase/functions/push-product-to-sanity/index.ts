/**
 * Push Product to Sanity Edge Function
 * VERSION 3 - Updates EXISTING product documents in Sanity (not tarifeProduct)
 *
 * Finds existing Sanity product by title and patches it with Madison formulation data
 * This allows immediate display on the website without code changes
 *
 * Usage:
 * POST /functions/v1/push-product-to-sanity
 * {
 *   productId: string (Madison product_hubs.id),
 *   publish: boolean (optional, default: false)
 * }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient as createSanityClient } from "https://esm.sh/@sanity/client@6.8.6";
import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERSION = "3.1.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SanityConfig {
  projectId: string;
  dataset: string;
  token: string;
  apiVersion: string;
}

interface PushProductRequest {
  productId: string;
  publish?: boolean;
  /** When set (e.g. Image Library render URL), uploads to Sanity and sets `mainImage` on the product document. */
  libraryImageUrl?: string;
}

/**
 * Get Sanity configuration from environment
 */
function getSanityConfig(): SanityConfig {
  const projectId = Deno.env.get("SANITY_PROJECT_ID");
  const dataset = Deno.env.get("SANITY_DATASET") || "production";
  // Support both SANITY_WRITE_TOKEN and SANITY_API_TOKEN for backward compatibility
  const token = Deno.env.get("SANITY_WRITE_TOKEN") || Deno.env.get("SANITY_API_TOKEN");
  const apiVersion = Deno.env.get("SANITY_API_VERSION") || "2024-01-01";

  if (!projectId || !token) {
    throw new Error(
      "Missing Sanity configuration. Set SANITY_PROJECT_ID and SANITY_WRITE_TOKEN in Supabase secrets."
    );
  }

  return { projectId, dataset, token, apiVersion };
}

/**
 * Fetch a public image URL and upload it to Sanity assets; returns a Sanity image field value.
 */
async function imageUrlToSanityImageField(
  sanityClient: any,
  imageUrl: string,
  filenameBase: string,
): Promise<{ _type: "image"; asset: { _type: "reference"; _ref: string } }> {
  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) {
    throw new Error(`Failed to fetch image (${imageRes.status}): ${imageRes.statusText}`);
  }
  const imageBlob = await imageRes.blob();
  const safe = filenameBase.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 48) || "madison-library";
  const asset = await sanityClient.assets.upload("image", imageBlob, {
    filename: `${safe}-library.png`,
  });
  return {
    _type: "image",
    asset: { _type: "reference", _ref: asset._id },
  };
}

/**
 * Convert markdown text to Sanity Portable Text blocks
 */
function textToPortableText(text: string): any[] {
  if (!text) return [];

  const lines = text.split("\n");
  const blocks: any[] = [];
  let currentParagraph: string[] = [];

  const createBlock = (style: string, text: string) => ({
    _type: "block",
    _key: crypto.randomUUID().replace(/-/g, "").substring(0, 10),
    style,
    children: [
      {
        _type: "span",
        _key: crypto.randomUUID().replace(/-/g, "").substring(0, 10),
        text,
        marks: [],
      },
    ],
  });

  const flushParagraph = () => {
    if (currentParagraph.length > 0) {
      blocks.push(createBlock("normal", currentParagraph.join(" ")));
      currentParagraph = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("# ")) {
      flushParagraph();
      blocks.push(createBlock("h1", trimmed.substring(2)));
    } else if (trimmed.startsWith("## ")) {
      flushParagraph();
      blocks.push(createBlock("h2", trimmed.substring(3)));
    } else if (trimmed.startsWith("### ")) {
      flushParagraph();
      blocks.push(createBlock("h3", trimmed.substring(4)));
    } else if (trimmed === "") {
      flushParagraph();
    } else {
      currentParagraph.push(trimmed);
    }
  }

  flushParagraph();

  return blocks.length > 0 ? blocks : [createBlock("normal", text)];
}

/**
 * Parse scent notes from formulation or product metadata
 */
function parseScentNotes(product: any, formulation: any): { top: string[]; heart: string[]; base: string[] } | null {
  // Check formulation first (primary source)
  if (formulation?.scent_profile) {
    const profile = typeof formulation.scent_profile === 'string'
      ? JSON.parse(formulation.scent_profile)
      : formulation.scent_profile;
    if (profile.top?.length || profile.heart?.length || profile.base?.length) {
      return profile;
    }
  }

  // Then check metadata
  if (product.metadata?.scent_notes) {
    return product.metadata.scent_notes;
  }

  // Try to parse from description as fallback
  const description = product.long_description || product.short_description || "";
  const notes = { top: [] as string[], heart: [] as string[], base: [] as string[] };

  const topMatch = description.match(/top\s*notes?:?\s*([^.\n]+)/i);
  const heartMatch = description.match(/(?:heart|middle)\s*notes?:?\s*([^.\n]+)/i);
  const baseMatch = description.match(/base\s*notes?:?\s*([^.\n]+)/i);

  if (topMatch) notes.top = topMatch[1].split(/[,&]/).map((s: string) => s.trim()).filter(Boolean);
  if (heartMatch) notes.heart = heartMatch[1].split(/[,&]/).map((s: string) => s.trim()).filter(Boolean);
  if (baseMatch) notes.base = baseMatch[1].split(/[,&]/).map((s: string) => s.trim()).filter(Boolean);

  return (notes.top.length || notes.heart.length || notes.base.length) ? notes : null;
}

/**
 * Map Madison longevity values to Sanity-friendly display values
 */
function mapLongevity(longevity: string | null): string | null {
  if (!longevity) return null;
  const map: Record<string, string> = {
    "fleeting": "1-2 hours",
    "moderate": "3-4 hours",
    "long_lasting": "4-8 hours",
    "very_long": "8-12 hours",
    "extreme": "12+ hours",
  };
  return map[longevity] || longevity;
}

/**
 * Map Madison sillage to Sanity schema values
 */
function mapSillage(sillage: string | null): string | null {
  if (!sillage) return null;
  const map: Record<string, string> = {
    "intimate": "intimate",
    "moderate": "moderate",
    "strong": "strong",
    "enormous": "beast",
  };
  return map[sillage] || sillage;
}

/**
 * Map concentration type to display text
 */
function mapConcentrationType(type: string | null): string | null {
  if (!type) return null;
  const map: Record<string, string> = {
    "parfum": "Parfum (20-30%)",
    "eau_de_parfum": "Eau de Parfum (15-20%)",
    "eau_de_toilette": "Eau de Toilette (5-15%)",
    "eau_de_cologne": "Eau de Cologne (2-5%)",
    "eau_fraiche": "Eau Fraîche (1-3%)",
    "perfume_oil": "Perfume Oil",
    "attar": "Attär",
    "solid_perfume": "Solid Perfume",
    "body_mist": "Body Mist",
  };
  return map[type] || type;
}

/**
 * Map base carrier to display text
 */
function mapBaseCarrier(carrier: string | null): string | null {
  if (!carrier) return null;
  const map: Record<string, string> = {
    "alcohol": "Alcohol",
    "fractionated_coconut": "Fractionated Coconut Oil",
    "jojoba": "Jojoba Oil",
    "sweet_almond": "Sweet Almond Oil",
    "argan": "Argan Oil",
    "squalane": "Squalane",
    "sandalwood_oil": "Sandalwood Oil",
    "dpg": "DPG (Dipropylene Glycol)",
    "custom": "Custom Blend",
  };
  return map[carrier] || carrier;
}

/**
 * Map seasons to display text
 */
function mapSeasons(seasons: string[] | null): string[] {
  if (!seasons || seasons.length === 0) return [];
  const map: Record<string, string> = {
    "spring": "🌸 Spring",
    "summer": "☀️ Summer",
    "fall": "🍂 Fall",
    "winter": "❄️ Winter",
    "all_season": "🌍 All Season",
  };
  return seasons.map(s => map[s] || s);
}

/**
 * Map occasions to display text
 */
function mapOccasions(occasions: string[] | null): string[] {
  if (!occasions || occasions.length === 0) return [];
  const map: Record<string, string> = {
    "daily": "Daily Wear",
    "office": "Office/Work",
    "evening": "Evening",
    "special_occasion": "Special Occasion",
    "romantic": "Romantic",
    "casual": "Casual",
    "formal": "Formal",
  };
  return occasions.map(o => map[o] || o);
}

/**
 * Map Madison product + formulation to Sanity tarifeProduct document
 */
function transformProductToSanity(product: any, formulation: any, shopifyData?: any): any {
  console.log(`[push-product-to-sanity v${VERSION}] Transforming product: ${product.name}`);
  console.log(`[push-product-to-sanity] Formulation data:`, formulation ? 'found' : 'not found');

  // Parent SKU (no size suffix) - for the product family
  const parentSku = (product.metadata?.parent_sku as string) || null;

  // Primary SKU (default variant - typically 6ml)
  const primarySku = product.sku || null;

  // Extract variant SKUs from metadata (6ml and 12ml)
  const sku6ml = (product.metadata?.sku_6ml as string) || null;
  const sku12ml = (product.metadata?.sku_12ml as string) || null;

  // Legacy name (formerly known as) - preserved from Sanity
  const legacyName = (product.metadata?.legacy_name as string) || null;

  const doc: any = {
    _type: "tarifeProduct",
    _id: `madison-product-${product.id}`,
    title: product.name,
    slug: {
      _type: "slug",
      current: product.slug || product.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    },
    // Legacy name (e.g., "Oud Fire" for ADEN)
    legacyName: legacyName,
    // Parent SKU (no size - e.g., "PETAL-RITUAL")
    parentSku: parentSku,
    // Primary variant SKU (default size - e.g., "PETAL-RITUAL-6ML")
    sku: primarySku,
    // Individual variant SKUs
    sku6ml: sku6ml,
    sku12ml: sku12ml,
    shortDescription: product.short_description || product.tagline || null,
    price: product.price || null,
    compareAtPrice: product.compare_at_price || null,
    inStock: product.status === "active",
    isNew: product.tags?.includes("new") || false,
    isBestseller: product.tags?.includes("bestseller") || false,
    madisonProductId: product.id,
    madisonSyncedAt: new Date().toISOString(),
  };

  // Long description as Portable Text
  if (product.long_description) {
    doc.longDescription = textToPortableText(product.long_description);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // SCENT PROFILE DATA (from formulation)
  // ═══════════════════════════════════════════════════════════════════════════════

  // Scent notes (from formulation or product metadata)
  const scentNotes = parseScentNotes(product, formulation);
  if (scentNotes) {
    doc.scentNotes = scentNotes;
    console.log(`[push-product-to-sanity] Scent notes: top=${scentNotes.top?.length || 0}, heart=${scentNotes.heart?.length || 0}, base=${scentNotes.base?.length || 0}`);
  }

  // Scent family from formulation
  if (formulation?.scent_family) {
    const scentFamilyMap: Record<string, string> = {
      "woody": "woody",
      "floral": "floral",
      "fresh": "fresh",
      "oriental": "oriental",
      "aquatic": "aquatic",
      "spicy": "spicy",
      "gourmand": "gourmand",
    };
    const family = formulation.scent_family.toLowerCase();
    doc.scentFamily = scentFamilyMap[family] || family;
    console.log(`[push-product-to-sanity] Scent family: ${doc.scentFamily}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // CONCENTRATION & BASE (from formulation)
  // ═══════════════════════════════════════════════════════════════════════════════

  if (formulation?.concentration_type) {
    doc.concentrationType = mapConcentrationType(formulation.concentration_type);
    console.log(`[push-product-to-sanity] Concentration: ${doc.concentrationType}`);
  }

  if (formulation?.base_carrier) {
    doc.baseCarrier = mapBaseCarrier(formulation.base_carrier);
    console.log(`[push-product-to-sanity] Base carrier: ${doc.baseCarrier}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // PERFORMANCE (from formulation)
  // ═══════════════════════════════════════════════════════════════════════════════

  if (formulation?.longevity) {
    doc.longevity = mapLongevity(formulation.longevity);
    console.log(`[push-product-to-sanity] Longevity: ${doc.longevity}`);
  }

  if (formulation?.sillage) {
    doc.sillage = mapSillage(formulation.sillage);
    console.log(`[push-product-to-sanity] Sillage: ${doc.sillage}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // BEST FOR (seasons & occasions from formulation)
  // ═══════════════════════════════════════════════════════════════════════════════

  if (formulation?.season_suitability?.length > 0) {
    doc.bestSeasons = mapSeasons(formulation.season_suitability);
    console.log(`[push-product-to-sanity] Best seasons: ${doc.bestSeasons.join(', ')}`);
  }

  if (formulation?.occasion_suitability?.length > 0) {
    doc.bestOccasions = mapOccasions(formulation.occasion_suitability);
    console.log(`[push-product-to-sanity] Best occasions: ${doc.bestOccasions.join(', ')}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // COLLECTION & CATEGORIES
  // ═══════════════════════════════════════════════════════════════════════════════

  if (product.collections?.length > 0) {
    const collectionMap: Record<string, string> = {
      "terra": "terra",
      "petal": "petal",
      "tidal": "tidal",
      "relic": "relic",
      "atlas": "atlas",
      "humanities": "humanities",
    };
    const collection = product.collections.find((c: string) => collectionMap[c.toLowerCase()]);
    if (collection) doc.collection = collectionMap[collection.toLowerCase()];
  }

  // Fallback: product type → scent family mapping (if not set from formulation)
  if (!doc.scentFamily && product.product_type) {
    const scentFamilyMap: Record<string, string> = {
      "woody": "woody",
      "floral": "floral",
      "fresh": "fresh",
      "oriental": "oriental",
      "aquatic": "aquatic",
      "spicy": "spicy",
      "gourmand": "gourmand",
    };
    const family = Object.keys(scentFamilyMap).find(
      (f) => product.product_type.toLowerCase().includes(f)
    );
    if (family) doc.scentFamily = scentFamilyMap[family];
  }

  // Key benefits and features
  if (product.key_benefits?.length > 0) {
    doc.keyBenefits = product.key_benefits;
  }
  if (product.key_differentiators?.length > 0) {
    doc.features = product.key_differentiators;
  }

  // SEO
  if (product.seo_title || product.seo_description || product.seo_keywords?.length > 0) {
    doc.seo = {
      title: product.seo_title || null,
      description: product.seo_description || null,
      keywords: product.seo_keywords || [],
    };
  }

  // Tags as features
  if (product.tags?.length > 0 && !doc.features) {
    doc.features = product.tags;
  }

  // Shopify link if available
  if (product.external_ids?.shopify_product_id) {
    doc.shopifyProductId = product.external_ids.shopify_product_id;
  } else if (shopifyData?.id) {
    doc.shopifyProductId = `gid://shopify/Product/${shopifyData.id}`;
  }

  return doc;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  console.log(`[push-product-to-sanity v${VERSION}] Starting...`);

  try {
    const { productId, publish = false, libraryImageUrl }: PushProductRequest = await req.json();

    if (!productId) {
      return new Response(
        JSON.stringify({ error: "Missing required field: productId" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createSupabaseClient(supabaseUrl, supabaseKey);

    // Fetch product from Madison
    console.log(`[push-product-to-sanity] Fetching product: ${productId}`);
    const { data: product, error: productError } = await supabase
      .from("product_hubs")
      .select("*")
      .eq("id", productId)
      .single();

    if (productError || !product) {
      console.error("Product fetch error:", productError);
      return new Response(
        JSON.stringify({ error: "Product not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`[push-product-to-sanity] Found product: ${product.name}`);

    // Fetch formulation data (scent profile, concentration, performance)
    console.log(`[push-product-to-sanity] Fetching formulation for product...`);
    const { data: formulation, error: formulationError } = await supabase
      .from("product_formulations")
      .select("*")
      .eq("product_id", productId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (formulationError) {
      console.warn(`[push-product-to-sanity] Formulation fetch warning (non-critical):`, formulationError.message);
    } else if (formulation) {
      console.log(`[push-product-to-sanity] Found formulation v${formulation.version}: ${formulation.formula_name || 'unnamed'}`);
      console.log(`[push-product-to-sanity] - Scent profile:`, formulation.scent_profile ? 'present' : 'empty');
      console.log(`[push-product-to-sanity] - Concentration:`, formulation.concentration_type || 'not set');
      console.log(`[push-product-to-sanity] - Longevity:`, formulation.longevity || 'not set');
      console.log(`[push-product-to-sanity] - Sillage:`, formulation.sillage || 'not set');
    } else {
      console.log(`[push-product-to-sanity] No formulation found for product`);
    }

    // Get Sanity config and client
    const sanityConfig = getSanityConfig();
    const sanityClient = createSanityClient({
      projectId: sanityConfig.projectId,
      dataset: sanityConfig.dataset,
      token: sanityConfig.token,
      apiVersion: sanityConfig.apiVersion,
      useCdn: false,
    });

    let mainImageField: { _type: "image"; asset: { _type: "reference"; _ref: string } } | null = null;
    if (libraryImageUrl && typeof libraryImageUrl === "string" && libraryImageUrl.trim()) {
      const trimmed = libraryImageUrl.trim();
      if (!trimmed.startsWith("https://") && !trimmed.startsWith("http://")) {
        return new Response(
          JSON.stringify({ error: "libraryImageUrl must be an http(s) URL" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      try {
        console.log(`[push-product-to-sanity] Uploading library image to Sanity: ${trimmed}`);
        mainImageField = await imageUrlToSanityImageField(
          sanityClient,
          trimmed,
          product.name || "product",
        );
        console.log(`[push-product-to-sanity] Library image asset: ${mainImageField.asset._ref}`);
      } catch (imgErr: any) {
        console.error(`[push-product-to-sanity] Library image upload failed:`, imgErr);
        return new Response(
          JSON.stringify({
            error: imgErr?.message || "Failed to upload library image to Sanity",
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // FIND EXISTING PRODUCT IN SANITY BY TITLE
    // ═══════════════════════════════════════════════════════════════════════════════
    console.log(`[push-product-to-sanity] Searching for existing product "${product.name}" in Sanity...`);

    const existingProducts = await sanityClient.fetch(
      `*[_type == "product" && title == $title][0...2]{_id, title, _type}`,
      { title: product.name }
    );

    let sanityDocId: string | null = null;

    if (existingProducts && existingProducts.length > 0) {
      // Use the first match (prefer non-draft if available)
      const nonDraft = existingProducts.find((p: any) => !p._id.startsWith('drafts.'));
      const target = nonDraft || existingProducts[0];
      sanityDocId = target._id;
      console.log(`[push-product-to-sanity] ✅ Found existing product: ${sanityDocId}`);
    } else {
      console.log(`[push-product-to-sanity] ⚠️ No existing product found with title "${product.name}"`);
      // Fall back to creating a new tarifeProduct document
      const sanityDoc = transformProductToSanity(product, formulation);
      if (mainImageField) {
        sanityDoc.mainImage = mainImageField;
      }
      console.log(`[push-product-to-sanity] Creating new tarifeProduct: ${sanityDoc._id}`);
      const result = await sanityClient.createOrReplace(sanityDoc);

      await supabase
        .from("product_hubs")
        .update({
          metadata: {
            ...product.metadata,
            sanity_synced_at: new Date().toISOString(),
            sanity_document_id: result._id,
          },
        })
        .eq("id", productId);

      return new Response(
        JSON.stringify({
          success: true,
          sanityDocumentId: result._id,
          message: `Product "${product.name}" created as new tarifeProduct (no existing product found)`,
          formulationIncluded: !!formulation,
          isNewDocument: true,
          mainImageFromLibrary: !!mainImageField,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // BUILD PATCH FOR EXISTING PRODUCT
    // ═══════════════════════════════════════════════════════════════════════════════
    console.log(`[push-product-to-sanity] Building patch for existing product...`);

    const patchData: Record<string, any> = {
      madisonProductId: product.id,
      madisonSyncedAt: new Date().toISOString(),
    };

    // Add description if available
    if (product.short_description) {
      patchData.shortDescription = product.short_description;
    }

    // Add scent notes from formulation
    const scentNotes = parseScentNotes(product, formulation);
    if (scentNotes && (scentNotes.top?.length || scentNotes.heart?.length || scentNotes.base?.length)) {
      patchData.scentNotes = scentNotes;
      console.log(`[push-product-to-sanity] Adding scent notes: top=${scentNotes.top?.length || 0}, heart=${scentNotes.heart?.length || 0}, base=${scentNotes.base?.length || 0}`);
    }

    // Add scent family
    if (formulation?.scent_family) {
      patchData.scentFamily = formulation.scent_family.toLowerCase();
      console.log(`[push-product-to-sanity] Adding scent family: ${patchData.scentFamily}`);
    }

    // Add concentration type
    if (formulation?.concentration_type) {
      patchData.productFormat = mapConcentrationType(formulation.concentration_type);
      console.log(`[push-product-to-sanity] Adding concentration: ${patchData.productFormat}`);
    }

    // Add base carrier
    if (formulation?.base_carrier) {
      patchData.baseCarrier = mapBaseCarrier(formulation.base_carrier);
      console.log(`[push-product-to-sanity] Adding base carrier: ${patchData.baseCarrier}`);
    }

    // Add performance data
    if (formulation?.longevity) {
      patchData.longevity = mapLongevity(formulation.longevity);
      console.log(`[push-product-to-sanity] Adding longevity: ${patchData.longevity}`);
    }

    if (formulation?.sillage) {
      patchData.sillage = mapSillage(formulation.sillage);
      console.log(`[push-product-to-sanity] Adding sillage: ${patchData.sillage}`);
    }

    // Add seasons and occasions
    if (formulation?.season_suitability?.length > 0) {
      patchData.bestSeasons = mapSeasons(formulation.season_suitability);
      console.log(`[push-product-to-sanity] Adding seasons: ${patchData.bestSeasons.join(', ')}`);
    }

    if (formulation?.occasion_suitability?.length > 0) {
      patchData.bestOccasions = mapOccasions(formulation.occasion_suitability);
      console.log(`[push-product-to-sanity] Adding occasions: ${patchData.bestOccasions.join(', ')}`);
    }

    if (mainImageField) {
      patchData.mainImage = mainImageField;
      console.log(`[push-product-to-sanity] Setting mainImage from library render`);
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // APPLY PATCH TO EXISTING DOCUMENT
    // ═══════════════════════════════════════════════════════════════════════════════
    console.log(`[push-product-to-sanity] Patching document ${sanityDocId} with:`, Object.keys(patchData).join(', '));

    const result = await sanityClient
      .patch(sanityDocId)
      .set(patchData)
      .commit();

    console.log(`[push-product-to-sanity] ✅ Patch successful!`);

    // Update Madison product with Sanity sync status
    await supabase
      .from("product_hubs")
      .update({
        metadata: {
          ...product.metadata,
          sanity_synced_at: new Date().toISOString(),
          sanity_document_id: sanityDocId,
        },
      })
      .eq("id", productId);

    console.log(`[push-product-to-sanity] ✅ Success! Product "${product.name}" updated in Sanity`);

    return new Response(
      JSON.stringify({
        success: true,
        sanityDocumentId: sanityDocId,
        message: `Product "${product.name}" updated in Sanity with formulation data`,
        formulationIncluded: !!formulation,
        fieldsUpdated: Object.keys(patchData),
        isNewDocument: false,
        mainImageFromLibrary: !!mainImageField,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error(`[push-product-to-sanity] ❌ Error:`, error);
    return new Response(
      JSON.stringify({
        error: error.message || "Failed to push product to Sanity",
        details: error.stack || null,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
