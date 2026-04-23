import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode, decode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { formatVisualContext } from "../_shared/productFieldFilters.ts";
import { callGeminiImage } from "../_shared/aiProviders.ts";
import { conformImageToAspectRatio } from "../_shared/imageAspectRatio.ts";
import { enhancePromptWithOntology } from "../_shared/photographyOntology.ts";
import { generateImage as generateFreepikImage, type FreepikImageModel, type FreepikResolution, IMAGE_MODELS } from "../_shared/freepikProvider.ts";
import { generateImage as generateOpenAIImage, type OpenAIImageModel } from "../_shared/openaiProvider.ts";
import { getVisualStyleDirective, type VisualSquad } from "../_shared/visualMasters.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * ------------------------------
 * REFERENCE IMAGE CATEGORIZATION
 * ------------------------------
 */

interface CategorizedReferences {
  product: Array<{ url: string; description?: string; label?: string }>;
  background: Array<{ url: string; description?: string; label?: string }>;
  style: Array<{ url: string; description?: string; label?: string }>;
}

function categorizeReferences(
  references: Array<{ url: string; description?: string; label?: string }>
): CategorizedReferences {
  const categorized: CategorizedReferences = {
    product: [],
    background: [],
    style: [],
  };

  for (const ref of references || []) {
    const label = (ref.label || "").toLowerCase();
    if (label.includes("product") || label.includes("subject")) {
      categorized.product.push(ref);
    } else if (label.includes("background") || label.includes("scene")) {
      categorized.background.push(ref);
    } else if (label.includes("style") || label.includes("lighting") || label.includes("reference")) {
      categorized.style.push(ref);
    } else {
      // Default: if no label, assume it's the product (backward compatibility)
      categorized.product.push(ref);
    }
  }

  return categorized;
}

/**
 * ------------------------------
 * BOTTLE TYPE DETECTION (CRITICAL)
 * ------------------------------
 * This function determines if a product is an OIL (dropper/roller) or SPRAY (atomizer)
 * This is CRITICAL for accurate product rendering - wrong bottle type breaks the workflow
 */

function detectBottleType(productData: any): {
  isOil: boolean;
  isSpray: boolean;
  confidence: 'high' | 'medium' | 'low';
} {
  if (!productData) {
    return { isOil: false, isSpray: false, confidence: 'low' };
  }

  // PRIORITY 1: Check explicit bottle_type field (user-set, highest priority)
  const explicitBottleType = productData.bottle_type?.toLowerCase();
  if (explicitBottleType === 'oil') {
    return { isOil: true, isSpray: false, confidence: 'high' };
  }
  if (explicitBottleType === 'spray') {
    return { isOil: false, isSpray: true, confidence: 'high' };
  }
  // If bottle_type is 'auto' or null, fall through to auto-detection

  // PRIORITY 2: Auto-detection from product fields (only if bottle_type is 'auto' or null)
  const productNameLower = (productData.name || '').toLowerCase();
  const formatLower = (productData.format || '').toLowerCase();
  const productTypeLower = (productData.product_type || '').toLowerCase();
  const categoryLower = (productData.category || '').toLowerCase();
  const descriptionLower = (productData.description || '').toLowerCase();
  
  // OIL INDICATORS (comprehensive list)
  const oilIndicators = [
    'oil',
    'attar',
    'concentrate',
    'roller',
    'dropper',
    'roll-on',
    'roll on',
    'perfume oil',
    'fragrance oil',
    'essential oil',
    'carrier oil',
    'diluted oil',
    'pure oil',
    'oil-based',
    'oil based',
    'viscous',
    'thick oil',
    'dense oil',
  ];
  
  // SPRAY INDICATORS (comprehensive list)
  const sprayIndicators = [
    'spray',
    'atomizer',
    'pump',
    'mist',
    'eau de',
    'cologne',
    'perfume spray',
    'spray bottle',
    'sprayer',
    'atomizing',
    'aerosol',
  ];
  
  // Check all fields for oil indicators
  const hasOilIndicator = oilIndicators.some(indicator => 
    productNameLower.includes(indicator) ||
    formatLower.includes(indicator) ||
    productTypeLower.includes(indicator) ||
    descriptionLower.includes(indicator)
  );
  
  // Check all fields for spray indicators
  const hasSprayIndicator = sprayIndicators.some(indicator =>
    productNameLower.includes(indicator) ||
    formatLower.includes(indicator) ||
    productTypeLower.includes(indicator) ||
    descriptionLower.includes(indicator)
  );
  
  // Special case: "perfume oil" or "fragrance oil" = OIL (not spray)
  const isPerfumeOil = 
    productNameLower.includes('perfume oil') ||
    productNameLower.includes('fragrance oil') ||
    formatLower.includes('perfume oil') ||
    formatLower.includes('fragrance oil');
  
  // Special case: category = 'skincare' usually means oil
  const isSkincare = categoryLower === 'skincare';
  
  // Decision logic: OIL takes precedence if detected
  let isOil = false;
  let isSpray = false;
  let confidence: 'high' | 'medium' | 'low' = 'low';
  
  if (isPerfumeOil || isSkincare || hasOilIndicator) {
    isOil = true;
    confidence = isPerfumeOil ? 'high' : hasOilIndicator ? 'medium' : 'low';
  } else if (hasSprayIndicator && !hasOilIndicator) {
    isSpray = true;
    confidence = 'medium';
  }
  
  return { isOil, isSpray, confidence };
}

/**
 * ------------------------------
 * VIRTUAL ART DIRECTOR PROMPT CONSTRUCTION
 * ------------------------------
 */

function buildDirectorModePrompt(
  userPrompt: string,
  categorizedRefs: CategorizedReferences,
  proModeControls: any,
  brandKnowledge: any,
  productData: any,
  aspectRatio?: string,
  visualMasterContext?: string,
  artDirectionControls?: {
    backgroundPresetId?: string;
    backgroundPrompt?: string;
    compositionPresetId?: string;
    compositionPrompt?: string;
  }
): string {
  let prompt = "";

  // === SECTION 0: CRITICAL BOTTLE TYPE SPECIFICATION (HIGHEST PRIORITY - MUST BE FIRST) ===
  // This MUST come before ANY other instructions, including reference images
  // Reference images might show wrong bottle type - this overrides them
  if (productData) {
    const bottleType = detectBottleType(productData);
    
    if (bottleType.isOil) {
      prompt += "╔══════════════════════════════════════════════════════════════════╗\n";
      prompt += "║  ⚠️ CRITICAL BOTTLE SPECIFICATION (MANDATORY - NO EXCEPTIONS)   ║\n";
      prompt += "║  THIS OVERRIDES ALL REFERENCE IMAGES AND OTHER INSTRUCTIONS      ║\n";
      prompt += "╚══════════════════════════════════════════════════════════════════╝\n\n";
      prompt += "PRODUCT TYPE: OIL-BASED FRAGRANCE (NON-SPRAY)\n";
      prompt += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
      prompt += "✅ REQUIRED CLOSURE TYPES (ONLY THESE):\n";
      prompt += "  • Glass dropper with pipette\n";
      prompt += "  • Roller ball applicator\n";
      prompt += "  • Screw cap (if dropper/roller is separate)\n";
      prompt += "  • Glass wand (dipstick applicator)\n\n";
      prompt += "❌ ABSOLUTELY FORBIDDEN (NEVER INCLUDE - EVEN IF IN REFERENCE IMAGES):\n";
      prompt += "  • Perfume sprayer / atomizer / pump mechanism\n";
      prompt += "  • Crimped metal spray neck\n";
      prompt += "  • Spray nozzle / misting device\n";
      prompt += "  • Dip tube / hose / straw (the tube inside spray bottles)\n";
      prompt += "  • Any form of spray dispenser\n";
      prompt += "  • Aerosol mechanism\n";
      prompt += "  • ANY visible tube, hose, or pipe extending into the liquid\n\n";
      prompt += "VISUAL CHARACTERISTICS:\n";
      prompt += "  • The liquid is viscous oil (thicker, more dense)\n";
      prompt += "  • Bottle designed for direct application (not spraying)\n";
      prompt += "  • Closure is for controlled dispensing, not atomization\n";
      prompt += "  • NO internal tubes, hoses, or dip sticks visible inside the bottle\n\n";
      prompt += "⚠️ CRITICAL: If you render a spray mechanism, dip tube, hose, or ANY tube extending into the liquid, the image is INCORRECT and unusable.\n";
      prompt += "⚠️ CRITICAL: Even if reference images show a spray mechanism, you MUST render an oil bottle with dropper/roller instead.\n";
      prompt += "This is a fundamental product accuracy requirement. There are NO exceptions.\n\n";
    } else if (bottleType.isSpray) {
      prompt += "╔══════════════════════════════════════════════════════════════════╗\n";
      prompt += "║  ⚠️ CRITICAL BOTTLE SPECIFICATION (MANDATORY - NO EXCEPTIONS)   ║\n";
      prompt += "║  THIS OVERRIDES ALL REFERENCE IMAGES AND OTHER INSTRUCTIONS      ║\n";
      prompt += "╚══════════════════════════════════════════════════════════════════╝\n\n";
      prompt += "PRODUCT TYPE: SPRAY PERFUME (ALCOHOL-BASED)\n";
      prompt += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
      prompt += "✅ REQUIRED CLOSURE TYPE:\n";
      prompt += "  • Spray pump mechanism with atomizer\n";
      prompt += "  • Visible crimped metal neck\n";
      prompt += "  • Spray nozzle for misting\n";
      prompt += "  • Dip tube / hose extending into the liquid (for spray mechanism)\n\n";
      prompt += "❌ ABSOLUTELY FORBIDDEN:\n";
      prompt += "  • Dropper / pipette\n";
      prompt += "  • Roller ball applicator\n";
      prompt += "  • Glass wand / dipstick\n\n";
      prompt += "VISUAL CHARACTERISTICS:\n";
      prompt += "  • The liquid is alcohol-based (thinner, more fluid)\n";
      prompt += "  • Bottle designed for atomization and misting\n";
      prompt += "  • Closure includes spray mechanism with dip tube\n\n";
    }
  }

  // === SECTION 1: REFERENCE IMAGE INSTRUCTIONS ===
  prompt += "=== REFERENCE IMAGE DIRECTIVES ===\n\n";

  if (categorizedRefs.product.length > 0) {
    const isMultiProduct = categorizedRefs.product.length > 1;
    
    if (isMultiProduct) {
      // Multi-product compositing mode
      prompt += `🎨 MULTI-PRODUCT COMPOSITE (${categorizedRefs.product.length} products):\n\n`;
      prompt += "╔══════════════════════════════════════════════════════════════════╗\n";
      prompt += "║  ⚠️ CRITICAL: USE THE EXACT PRODUCTS FROM REFERENCE IMAGES       ║\n";
      prompt += "║  DO NOT CREATE NEW BOTTLES OR PRODUCTS - USE WHAT IS PROVIDED    ║\n";
      prompt += "╚══════════════════════════════════════════════════════════════════╝\n\n";
      prompt += "The reference images provided show the EXACT products you must use.\n";
      prompt += "DO NOT generate new products, bottles, or containers.\n";
      prompt += "COPY the exact products from the reference images into the scene.\n\n";
      prompt += "COMPOSITING REQUIREMENTS:\n";
      prompt += "- Place the EXACT products from reference images into the scene\n";
      prompt += "- Arrange them artistically (not in a grid)\n";
      prompt += "- Create visual harmony (consistent lighting, shadows, reflections)\n";
      prompt += "- Use varying heights, angles, and positions for visual interest\n";
      prompt += "- Products may overlap slightly or be grouped naturally\n";
      prompt += "- Maintain accurate proportions between all products\n";
      prompt += "- Every product must be clearly visible and identifiable\n\n";
      prompt += "PRODUCT ACCURACY (MANDATORY):\n";
      prompt += "- ⚠️ PRESERVE the EXACT shape from reference images\n";
      prompt += "- ⚠️ PRESERVE the EXACT colors from reference images\n";
      prompt += "- ⚠️ PRESERVE the EXACT design and branding from reference images\n";
      prompt += "- ⚠️ PRESERVE all labels, text, and decorative elements\n";
      prompt += "- DO NOT modify, redesign, or reimagine the products\n";
      prompt += "- The products in output MUST match the reference images exactly\n\n";
      
      categorizedRefs.product.forEach((ref, idx) => {
        prompt += `📦 Product ${idx + 1}: ${ref.label || "Product"}\n`;
        if (ref.description) {
          prompt += `   Description: ${ref.description}\n`;
        }
      });
      prompt += "\n";
    } else {
      // Single product mode (original behavior)
      prompt += `PRODUCT REFERENCE (${categorizedRefs.product.length} image):\n\n`;
      prompt += "⚠️ CRITICAL: Use the EXACT product from the reference image.\n";
      prompt += "DO NOT create a new product - COPY the exact product shown.\n\n";
      prompt += "MANDATORY PRESERVATION:\n";
      prompt += "- EXACT product shape, proportions, and design from reference\n";
      prompt += "- EXACT product colors (match precisely)\n";
      prompt += "- EXACT product texture and material finish\n";
      prompt += "- EXACT branding, labels, and decorative elements\n";
      prompt += "- The product in output MUST be the same product from reference\n";
      if (productData) {
        const bottleType = detectBottleType(productData);
        if (bottleType.isOil) {
          prompt += "\n⚠️ IMPORTANT: If the reference image shows a spray mechanism, IGNORE IT.\n";
          prompt += "You MUST render an oil bottle with dropper/roller instead (as specified in Section 0).\n";
          prompt += "The bottle type specification in Section 0 takes absolute priority over reference images.\n";
        } else if (bottleType.isSpray) {
          prompt += "\n⚠️ IMPORTANT: If the reference image shows a dropper/roller, IGNORE IT.\n";
          prompt += "You MUST render a spray bottle with atomizer instead (as specified in Section 0).\n";
          prompt += "The bottle type specification in Section 0 takes absolute priority over reference images.\n";
        }
      }
      prompt += "\n";
      
      categorizedRefs.product.forEach((ref, idx) => {
        if (ref.description) {
          prompt += `Product Ref ${idx + 1} Note: ${ref.description}\n`;
        }
      });
      prompt += "\n";
    }
  }

  if (categorizedRefs.background.length > 0) {
    prompt += `BACKGROUND REFERENCE (${categorizedRefs.background.length} image${categorizedRefs.background.length > 1 ? "s" : ""}):\n`;
    prompt += "Use this/these as the ENVIRONMENTAL CONTEXT:\n";
    prompt += "- Replicate the scene, setting, or backdrop\n";
    prompt += "- Match the mood and atmosphere\n";
    prompt += "- Preserve spatial relationships and depth\n\n";
    
    categorizedRefs.background.forEach((ref, idx) => {
      if (ref.description) {
        prompt += `Background Ref ${idx + 1} Note: ${ref.description}\n`;
      }
    });
    prompt += "\n";
  }

  if (categorizedRefs.style.length > 0) {
    prompt += `STYLE REFERENCE (${categorizedRefs.style.length} image${categorizedRefs.style.length > 1 ? "s" : ""}):\n`;
    prompt += "Extract and apply these PHOTOGRAPHIC ELEMENTS:\n";
    prompt += "- Lighting style (direction, quality, color temperature)\n";
    prompt += "- Composition and framing\n";
    prompt += "- Color grading and post-processing aesthetic\n";
    prompt += "- Camera angle and perspective\n";
    prompt += "- Depth of field and focus technique\n\n";
    
    categorizedRefs.style.forEach((ref, idx) => {
      if (ref.description) {
        prompt += `Style Ref ${idx + 1} Note: ${ref.description}\n`;
      }
    });
    prompt += "\n";
  }

  // === SECTION 2: USER'S CREATIVE INTENT ===
  prompt += "=== CREATIVE DIRECTION ===\n";
  prompt += `${userPrompt}\n\n`;

  if (artDirectionControls?.backgroundPrompt || artDirectionControls?.compositionPrompt) {
    prompt += "=== DARK ROOM ART DIRECTION CONTROLS ===\n";

    if (artDirectionControls.backgroundPrompt) {
      prompt += `BACKGROUND STYLE${artDirectionControls.backgroundPresetId ? ` (${artDirectionControls.backgroundPresetId})` : ""}: ${artDirectionControls.backgroundPrompt}\n`;
      prompt += "Treat this as a deliberate background/surface directive that should materially shape the scene.\n";
    }

    if (artDirectionControls.compositionPrompt) {
      prompt += `ARRANGEMENT${artDirectionControls.compositionPresetId ? ` (${artDirectionControls.compositionPresetId})` : ""}: ${artDirectionControls.compositionPrompt}\n`;
      prompt += "Treat this as the required product placement, grouping, and framing instruction.\n";
    }

    prompt += "\n";
  }

  // === SECTION 3: VISUAL MASTER TRAINING ===
  if (visualMasterContext) {
    prompt += "=== VISUAL MASTER TRAINING ===\n";
    prompt += visualMasterContext;
    prompt += "\n\n";
  }

  // === SECTION 4: PROFESSIONAL PHOTOGRAPHY SPECIFICATIONS ===
  prompt += "=== PHOTOGRAPHIC SPECIFICATIONS ===\n";
  prompt += "You are a Virtual Art Director with expertise in high-end commercial photography.\n";
  prompt += "Apply professional photography ontology concepts:\n\n";

  // Apply Photography Ontology if Pro Mode is active
  if (proModeControls && Object.keys(proModeControls).length > 0) {
    // Use the ontology mapper to translate Pro Mode controls into professional terminology
    const ontologySpecs = enhancePromptWithOntology("", proModeControls);
    prompt += ontologySpecs + "\n\n";
  } else {
    // Default specifications when Pro Mode is not active
    // Add variety to prevent repetitive images
    const lightingVariations = [
      { setup: "Butterfly (Paramount)", quality: "Soft/Diffused", contrast: "3:1" },
      { setup: "Rembrandt", quality: "Soft with subtle shadow", contrast: "4:1" },
      { setup: "Loop", quality: "Soft directional", contrast: "3.5:1" },
      { setup: "Split", quality: "Dramatic but controlled", contrast: "5:1" },
      { setup: "Broad", quality: "Even and flattering", contrast: "2.5:1" },
    ];
    
    // Randomly select a lighting variation (using timestamp for pseudo-randomness)
    const lightingIndex = Date.now() % lightingVariations.length;
    const selectedLighting = lightingVariations[lightingIndex];
    
    if (categorizedRefs.style.length > 0) {
      prompt += "LIGHTING: Match the lighting style from the style reference(s)\n";
    } else {
      prompt += `LIGHTING SETUP: ${selectedLighting.setup} - Commercial standard\n`;
      prompt += `LIGHT QUALITY: ${selectedLighting.quality} (flattering, commercial look)\n`;
      prompt += `CONTRAST RATIO: ${selectedLighting.contrast} (balanced, professional)\n`;
    }
    
    // Add composition variety
    if (artDirectionControls?.compositionPrompt) {
      prompt += `COMPOSITION: ${artDirectionControls.compositionPrompt}\n`;
      prompt += "Honor this chosen arrangement over the default composition rotation.\n";
    } else {
      const compositionStyles = [
        "Rule of Thirds (classic, balanced)",
        "Centered composition (symmetrical, bold)",
        "Leading lines (dynamic, engaging)",
        "Negative space (minimalist, elegant)",
        "Diagonal composition (energetic, modern)",
      ];
      const compositionIndex = (Date.now() + 1) % compositionStyles.length;
      prompt += `COMPOSITION: ${compositionStyles[compositionIndex]}\n`;
    }
    
    prompt += "LENS CHARACTER: Spherical (clean, modern commercial look)\n";
  }

  // Technical defaults for high-end output
  prompt += "\nTECHNICAL REQUIREMENTS:\n";
  prompt += "- 8K resolution, sharp focus\n";
  prompt += "- Professional color grading\n";
  prompt += "- Realistic shadows and reflections\n";
  prompt += "- Accurate material physics (glass refraction IOR 1.5, metal specular highlights, fabric diffuse reflection)\n";
  prompt += "- No distortion, artifacts, or watermarks\n\n";

  // === SECTION 5: BRAND CONTEXT ===
  if (brandKnowledge?.visualStandards) {
    const vs = brandKnowledge.visualStandards;
    prompt += "=== BRAND VISUAL STANDARDS (MANDATORY) ===\n";
    
    // GOLDEN RULE: Most important - the overarching visual philosophy
    if (vs.golden_rule) {
      prompt += `\n✨ GOLDEN RULE (HIGHEST PRIORITY): ${vs.golden_rule}\n`;
      prompt += `This is the PRIMARY directive. All other specifications must align with this philosophy.\n\n`;
    }
    
    if (vs.color_palette?.length > 0) {
      prompt += `COLOR PALETTE (MANDATORY): ${vs.color_palette.slice(0, 5).map((c: any) => `${c.name} (${c.hex})`).join(", ")}\n`;
      prompt += `Use these exact colors. Do not deviate from this palette.\n`;
    }
    if (vs.lighting_mandates) {
      prompt += `LIGHTING MANDATE (MANDATORY): ${vs.lighting_mandates}\n`;
      prompt += `Override default lighting specifications with this mandate.\n`;
    }
    if (vs.approved_props?.length > 0) {
      prompt += `APPROVED PROPS: ${vs.approved_props.slice(0, 10).join(", ")}\n`;
      prompt += `Only use props from this approved list.\n`;
    }
    if (vs.forbidden_elements?.length > 0) {
      prompt += `FORBIDDEN ELEMENTS (NEVER INCLUDE): ${vs.forbidden_elements.join(", ")}\n`;
      prompt += `These elements are explicitly prohibited. Do not include them under any circumstances.\n`;
    }
    
    // Add bottle type to forbidden elements if it's an oil product
    if (productData) {
      const bottleType = detectBottleType(productData);
      if (bottleType.isOil && vs.forbidden_elements) {
        // Ensure spray mechanisms are in forbidden list
        const forbiddenList = Array.isArray(vs.forbidden_elements) ? vs.forbidden_elements : [];
        if (!forbiddenList.some((el: string) => el.toLowerCase().includes('spray') || el.toLowerCase().includes('atomizer'))) {
          prompt += `FORBIDDEN ELEMENTS (ADDITIONAL): Perfume sprayer, atomizer, pump, spray nozzle, misting device\n`;
        }
      }
    }
    
    // Include raw document context if available (for AI to understand full context)
    if (vs.raw_document) {
      prompt += `\nADDITIONAL CONTEXT: Refer to the full visual standards document for complete brand guidelines.\n`;
    }
    
    prompt += "\n";
  }

  // === SECTION 6: PRODUCT-SPECIFIC CONTEXT ===
  if (productData) {
    prompt += "=== PRODUCT VISUAL DNA ===\n";
    // This will be enhanced by formatVisualContext, but we add a header
    prompt += "Apply product-specific visual characteristics from the product data.\n\n";
  }

  // === SECTION 7: ASPECT RATIO ===
  if (aspectRatio) {
    prompt += `=== OUTPUT SPECIFICATIONS ===\n`;
    prompt += `ASPECT RATIO: ${aspectRatio}\n`;
    prompt += `Compose the image to work perfectly at this ratio.\n\n`;
  }

  // === SECTION 8: NEGATIVE PROMPT (What to Avoid) ===
  prompt += "=== AVOID ===\n";
  prompt += "- Blurry or out-of-focus elements\n";
  prompt += "- Distorted text or logos\n";
  prompt += "- Unrealistic proportions\n";
  prompt += "- Watermarks or signatures\n";
  prompt += "- Low quality or pixelation\n";
  prompt += "- Frames, borders, or decorative edges around the image\n";
  prompt += "- White borders, beige frames, or any background frame elements\n";
  prompt += "- The image should fill the entire canvas edge-to-edge with no visible frame\n";
  
  // Add bottle-type-specific negative prompts (reinforce Section 0)
  if (productData) {
    const bottleType = detectBottleType(productData);
    if (bottleType.isOil) {
      prompt += "- ⚠️ CRITICAL: Perfume sprayers, atomizers, pumps, spray nozzles, misting devices, or ANY spray mechanism\n";
      prompt += "- ⚠️ CRITICAL: Crimped metal spray necks or aerosol mechanisms\n";
      prompt += "- ⚠️ CRITICAL: Dip tubes, hoses, straws, or ANY tube extending into the liquid (these are ONLY for spray bottles)\n";
      prompt += "- ⚠️ CRITICAL: Any visible internal tube, pipe, or hose inside the bottle\n";
    } else if (bottleType.isSpray) {
      prompt += "- ⚠️ CRITICAL: Droppers, pipettes, roller balls, glass wands, or ANY non-spray applicator\n";
    }
  }

  return prompt;
}

function buildEssentialModePrompt(
  userPrompt: string,
  productRef: { url: string; description?: string } | null,
  brandContext: any,
  productData?: any
): string {
  let prompt = "";

  // === CRITICAL BOTTLE TYPE SPECIFICATION (MUST BE FIRST) ===
  if (productData) {
    const bottleType = detectBottleType(productData);
    
    if (bottleType.isOil) {
      prompt += "╔══════════════════════════════════════════════════════════════════╗\n";
      prompt += "║     ⚠️ CRITICAL: OIL BOTTLE - NO SPRAY MECHANISM ALLOWED         ║\n";
      prompt += "╚══════════════════════════════════════════════════════════════════╝\n\n";
      prompt += "This is an OIL-BASED FRAGRANCE. REQUIRED: Dropper or roller ball ONLY.\n";
      prompt += "FORBIDDEN: Perfume sprayer, atomizer, pump, spray nozzle, dip tube, hose, or ANY spray mechanism.\n";
      prompt += "FORBIDDEN: ANY visible tube, hose, or pipe extending into the liquid (these are ONLY for spray bottles).\n";
      prompt += "If you render a spray mechanism, dip tube, or any internal tube, the image is INCORRECT.\n\n";
    } else if (bottleType.isSpray) {
      prompt += "╔══════════════════════════════════════════════════════════════════╗\n";
      prompt += "║     ⚠️ CRITICAL: SPRAY PERFUME - ATOMIZER REQUIRED               ║\n";
      prompt += "╚══════════════════════════════════════════════════════════════════╝\n\n";
      prompt += "This is a SPRAY PERFUME. REQUIRED: Spray pump with atomizer.\n";
      prompt += "FORBIDDEN: Dropper, roller ball, or any non-spray applicator.\n\n";
    }
  }

  prompt += userPrompt;

  if (productRef) {
    prompt += "\n\nUse the uploaded product image as the exact subject. Place it in the scene described above.";
  }

  if (brandContext?.colors?.length > 0) {
    prompt += ` Incorporate ${brandContext.colors.join(" and ")} color tones.`;
  }

  if (brandContext?.styleKeywords?.length > 0) {
    prompt += ` Apply ${brandContext.styleKeywords.join(", ")} aesthetic.`;
  }

  return prompt;
}

function buildChainPrompt(originalPrompt: string, refinement: string, depth: number) {
  const base = originalPrompt.replace(
    /\b(with|featuring|showing|adjust:|refinement:)\b.*/gi,
    ""
  ).trim();

  const r = refinement.toLowerCase();

  if (r.match(/\b(darker|lighter|brighter|cooler|warmer)\b/)) {
    return `${originalPrompt}. Adjust: ${refinement}`;
  }
  if (r.match(/\b(add|include|with)\b/)) {
    return `${originalPrompt}. ${refinement}`;
  }
  if (r.match(/\b(remove|without|exclude)\b/)) {
    return `${base}. ${refinement}`;
  }

  return `${originalPrompt}. Refinement: ${refinement}`;
}

/**
 * ------------------------------
 * MAIN EDGE FUNCTION
 * ------------------------------
 */

function extractMissingColumn(message: string) {
  const patterns = [
    /column generated_images\.([a-zA-Z0-9_]+)/i,
    /"generated_images"\."([a-zA-Z0-9_]+)"/i,
    /'([a-zA-Z0-9_]+)' column of 'generated_images'/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

async function insertGeneratedImageRecord(
  supabase: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
) {
  const attemptPayload = { ...payload };
  const maxAttempts = Object.keys(payload).length + 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data, error } = await supabase
      .from("generated_images")
      .insert(attemptPayload)
      .select()
      .single();

    if (!error) {
      return data;
    }

    const column = extractMissingColumn(error.message ?? "");
    if (column && column in attemptPayload) {
      console.warn(
        `[generate-madison-image] Column '${column}' missing in generated_images. Retrying without it.`,
      );

      delete attemptPayload[column];
      continue;
    }

    throw error;
  }

  throw new Error(
    "Failed to insert generated_images record after removing missing columns.",
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    /**
     * 1. Parse incoming request
     */
    const body = await req.json();

    const {
      prompt,
      organizationId,
      userId,
      goalType,
      aspectRatio,
      outputFormat = "png",
      selectedTemplate,
      userRefinements,
      referenceImages,
      brandContext,
      imageConstraints,

      parentImageId,
      isRefinement,
      refinementInstruction,
      parentPrompt,

      proModeControls,

      sessionId,

      product_id,

      // Provider selection (new)
      provider = "auto", // "auto" | "gemini" | "freepik" | "openai"
      freepikModel, // "mystic" | "flux-dev" | "flux-pro-v1-1"
      freepikResolution, // "1k" | "2k" | "4k"
      
      // Frontend-friendly aliases (Pro Settings)
      aiProvider, // "openai-image-2" | "auto" | "gemini" | "freepik-*"
      resolution, // "standard" | "high" | "4k"
      visualSquad, // "THE_MINIMALISTS" | "THE_STORYTELLERS" | "THE_DISRUPTORS"
      backgroundPresetId,
      backgroundPrompt,
      compositionPresetId,
      compositionPrompt,

      // Consistency Mode (bulk variation generation) — OPTIONAL.
      // When fixedSeed is provided, the edge function uses it instead of a
      // random seed, guaranteeing identical random initialization across
      // every variation in a set. consistencySetId groups related outputs
      // in the Library. See migration 20260422000000_consistency_set_columns.
      fixedSeed, // number | undefined — identical seed across a variation set
      consistencySetId, // UUID | undefined — groups variations in the Library
      // variationPrompt: the RICH prompt fragment appended to the AI
      // instructions (e.g. "BOTTLE BODY: hand-swirled artisan glass …").
      variationPrompt,
      // variationLabel: the SHORT human label stored in the DB and shown
      // in the Library grid (e.g. "Swirl · Polished Gold").
      variationLabel,
      // Legacy alias — kept for backward compatibility with any older
      // client that still passes variationDescriptor instead of the
      // separated prompt/label fields. Interpreted as "use this for both".
      variationDescriptor,
      setPosition, // number | undefined — 0-indexed order within the set

      // Best Bottles Grid Pipeline context — present only when the run was
      // launched from the Pipeline page. Drives library_tags and the
      // human-readable storage filename below so the client's team can
      // locate outputs by family/capacity/thread instead of UUIDs.
      pipelineContext,
      // Per-call library_tags (e.g. applicator/colour for Consistency
      // Mode variations) that the client computes because the axis
      // identifiers aren't part of pipelineContext. Merged into
      // library_tags alongside the group-level pipelineMeta tags below.
      extraLibraryTags,
    } = body;

    // Resolve the two separate roles from whatever fields the client sent.
    const effectiveVariationPrompt: string | undefined =
      typeof variationPrompt === "string" && variationPrompt.trim()
        ? variationPrompt.trim()
        : typeof variationDescriptor === "string" && variationDescriptor.trim()
          ? variationDescriptor.trim()
          : undefined;
    const effectiveVariationLabel: string | undefined =
      typeof variationLabel === "string" && variationLabel.trim()
        ? variationLabel.trim()
        : typeof variationDescriptor === "string" && variationDescriptor.trim()
          ? variationDescriptor.trim()
          : undefined;

    // ─── Best Bottles Pipeline meta ───────────────────────────────────
    // When this run was launched from the Grid Pipeline, compute a
    // canonical set of library_tags and a human-readable storage path
    // so the client's team can locate outputs by family/capacity/thread
    // in the Library instead of UUID hunting. For non-pipeline runs this
    // stays null and the rest of the pipeline behaves exactly as before.
    const slugify = (v: unknown): string => {
      if (v == null) return "";
      return String(v)
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
    };
    const pipelineMeta: {
      libraryTags: string[];
      storagePathPrefix: string;
      variationSlug: string;
    } | null = (() => {
      const ctx = pipelineContext as
        | {
            source?: string;
            family?: string;
            capacityMl?: number | null;
            threadSize?: string | null;
            shapeKey?: string;
            pipelineGroupIds?: string[];
          }
        | undefined;
      if (!ctx || ctx.source !== "best-bottles-pipeline") return null;
      const familySlug = slugify(ctx.family) || "unknown-family";
      const capSlug =
        typeof ctx.capacityMl === "number" && Number.isFinite(ctx.capacityMl)
          ? `${ctx.capacityMl}ml`
          : null;
      const threadSlug = ctx.threadSize ? slugify(ctx.threadSize) : null;
      const shapeSlug = [familySlug, capSlug, threadSlug]
        .filter(Boolean)
        .join("-");
      const variationSlug =
        slugify(effectiveVariationLabel) ||
        (typeof setPosition === "number" ? `pos-${setPosition}` : "variation");

      // Tag vocabulary mirrors the Pipeline tracker's filter dimensions so
      // the Library can be filtered the same way the tracker is:
      //   - Bare slugs ("best-bottles", "pipeline", "cylinder", "cylinder-5ml-13-415")
      //     kept for back-compat with anything already querying them.
      //   - Structured key:value tags ("brand:best-bottles", "family:cylinder",
      //     "capacity:5ml", "thread:13-415", "shape:cylinder-5ml-13-415")
      //     for precise filtering — avoids "cylinder" the family colliding
      //     with "cylinder" some other free-text use.
      //   - "pipeline-group:<uuid>" tags per tracker row this run covers,
      //     so we can join an image back to the exact SKUs it serves.
      const structuredTags: string[] = [
        "brand:best-bottles",
        `family:${familySlug}`,
      ];
      if (capSlug) structuredTags.push(`capacity:${capSlug}`);
      if (threadSlug) structuredTags.push(`thread:${threadSlug}`);
      if (shapeSlug) structuredTags.push(`shape:${shapeSlug}`);

      const pipelineRowTags = Array.isArray(ctx.pipelineGroupIds)
        ? ctx.pipelineGroupIds
            .filter((id): id is string => typeof id === "string" && id.length > 0)
            .map((id) => `pipeline-group:${id}`)
        : [];

      const libraryTags = Array.from(
        new Set(
          [
            "best-bottles",
            "pipeline",
            familySlug,
            shapeSlug,
            ...structuredTags,
            ...pipelineRowTags,
          ].filter((t) => t && t.length > 0),
        ),
      );
      return {
        libraryTags,
        storagePathPrefix: `pipeline/${familySlug}/${shapeSlug}`,
        variationSlug,
      };
    })();

    // Map frontend-friendly names to backend values
    // aiProvider maps to: provider + freepikModel + geminiModel
    // resolution maps to: freepikResolution
    let effectiveProvider = provider;
    let effectiveFreepikModel = freepikModel;
    let effectiveFreepikResolution = freepikResolution;
    // Default OpenAI model when user picks the "OpenAI" group from the UI.
    // As of 2026-04-21, OpenAI's current flagship is gpt-image-2 (4× faster
    // than 1.5, better text rendering, better layout composition). The
    // OPENAI_IMAGE_MODEL secret overrides the default without a redeploy.
    const openaiModelSecret = Deno.env.get("OPENAI_IMAGE_MODEL")?.trim();
    let effectiveOpenAIModel: OpenAIImageModel =
      (openaiModelSecret || "gpt-image-2") as OpenAIImageModel;
    // Default Gemini fallback is the highest-quality image model we currently
    // expose in Madison: Gemini 3.1 Pro Image Preview. If that is unavailable,
    // the Gemini execution path steps down to 3.1 Flash, then 2.5 Flash.
    let effectiveGeminiModel: string = "models/gemini-3-pro-image-preview";

    if (aiProvider) {
      // Gemini image models (must support responseModalities: ["IMAGE"])
      if (
        aiProvider === "gemini-3.1-flash-image-preview" ||
        aiProvider === "gemini-3.1-flash" ||
        aiProvider === "nano-banana-2"
      ) {
        effectiveProvider = "gemini";
        effectiveGeminiModel = "models/gemini-3.1-flash-image-preview";
      } else if (
        aiProvider === "gemini-3-pro-image" ||
        aiProvider === "gemini-3" ||
        aiProvider === "gemini-3.1" ||
        aiProvider === "gemini-3.1-pro-image" ||
        aiProvider === "gemini-3-pro-image-preview" ||
        aiProvider === "nano-banana-pro"
      ) {
        effectiveProvider = "gemini";
        effectiveGeminiModel = "models/gemini-3-pro-image-preview";
      } else if (aiProvider === "gemini" || aiProvider === "gemini-2.0-flash" || aiProvider === "gemini-2.0-flash-exp") {
        effectiveProvider = "gemini";
        effectiveGeminiModel = "models/gemini-2.5-flash-image";
      }
      // Freepik models (actual available models from docs.freepik.com)
      else if (aiProvider === "freepik-seedream-4") {
        effectiveProvider = "freepik";
        effectiveFreepikModel = "seedream-4";
      } else if (aiProvider === "freepik-flux-pro") {
        effectiveProvider = "freepik";
        effectiveFreepikModel = "flux-pro-v1-1";
      } else if (aiProvider === "freepik-hyperflux") {
        effectiveProvider = "freepik";
        effectiveFreepikModel = "hyperflux";
      } else if (aiProvider === "freepik-flux") {
        effectiveProvider = "freepik";
        effectiveFreepikModel = "flux-dev";
      } else if (aiProvider === "freepik-seedream") {
        effectiveProvider = "freepik";
        effectiveFreepikModel = "seedream";
      } else if (aiProvider === "freepik-mystic") {
        effectiveProvider = "freepik";
        effectiveFreepikModel = "mystic";
      } else if (aiProvider === "freepik-classic") {
        effectiveProvider = "freepik";
        effectiveFreepikModel = "classic-fast";
      }
      // OpenAI image models (gpt-image-* family + dall-e-3)
      // "openai-image-2" is the UI label — as of 2026-04-21 it maps to the
      // real gpt-image-2 API enum (previously it temporarily mapped to 1.5
      // while gpt-image-2 wasn't yet exposed on the enum).
      else if (
        aiProvider === "openai-image-2" ||
        aiProvider === "openai-gpt-image-2" ||
        aiProvider === "gpt-image-2"
      ) {
        effectiveProvider = "openai";
        effectiveOpenAIModel = "gpt-image-2";
      } else if (
        aiProvider === "openai-gpt-image-1.5" ||
        aiProvider === "gpt-image-1.5"
      ) {
        effectiveProvider = "openai";
        effectiveOpenAIModel = "gpt-image-1.5";
      } else if (aiProvider === "openai-gpt-image-1" || aiProvider === "gpt-image-1") {
        effectiveProvider = "openai";
        effectiveOpenAIModel = "gpt-image-1";
      } else if (aiProvider === "openai-gpt-image-mini" || aiProvider === "gpt-image-1-mini") {
        effectiveProvider = "openai";
        effectiveOpenAIModel = "gpt-image-1-mini";
      } else if (aiProvider === "openai-dalle-3" || aiProvider === "dall-e-3") {
        effectiveProvider = "openai";
        effectiveOpenAIModel = "dall-e-3";
      } else if (aiProvider === "auto") {
        effectiveProvider = "auto";
        effectiveGeminiModel = "models/gemini-3-pro-image-preview";
      }
    }
    
    if (resolution) {
      if (resolution === "standard") {
        effectiveFreepikResolution = "1k";
      } else if (resolution === "high") {
        effectiveFreepikResolution = "2k";
      } else if (resolution === "4k") {
        effectiveFreepikResolution = "4k";
      }
    }

    console.log("🎨 Incoming Request", {
      goalType,
      aspectRatio,
      isRefinement,
      references: referenceImages?.length || 0,
      proMode: !!proModeControls,
      productId: product_id || "none",
    });

    /**
     * 2. Supabase Client
     */
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    /**
     * 3. Resolve organizationId if missing
     */
    let resolvedOrgId = organizationId;

    console.log("🔍 Organization Resolution:", {
      providedOrgId: organizationId,
      userId,
      parentImageId,
    });

    if (!resolvedOrgId && parentImageId) {
      const { data, error } = await supabase
        .from("generated_images")
        .select("organization_id")
        .eq("id", parentImageId)
        .single();

      if (error) {
        console.log("⚠️ Could not fetch from generated_images:", error.message);
      }
      if (data?.organization_id) {
        resolvedOrgId = data.organization_id;
        console.log("✅ Resolved org from parent image:", resolvedOrgId);
      }
    }

    if (!resolvedOrgId && userId) {
      const { data, error } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", userId)
        .limit(1)
        .single();

      if (error) {
        console.log("⚠️ Could not fetch from organization_members:", error.message, { userId });
      }
      if (data?.organization_id) {
        resolvedOrgId = data.organization_id;
        console.log("✅ Resolved org from membership:", resolvedOrgId);
      }
    }

    // Last resort: check if user created any organizations
    if (!resolvedOrgId && userId) {
      const { data, error } = await supabase
        .from("organizations")
        .select("id")
        .eq("created_by", userId)
        .limit(1)
        .single();

      if (error) {
        console.log("⚠️ Could not fetch from organizations:", error.message);
      }
      if (data?.id) {
        resolvedOrgId = data.id;
        console.log("✅ Resolved org from created_by:", resolvedOrgId);
        
        // Auto-create the missing membership
        await supabase.from("organization_members").upsert({
          organization_id: resolvedOrgId,
          user_id: userId,
        }, { onConflict: "organization_id,user_id" });
        console.log("✅ Auto-created missing organization membership");
      }
    }

    if (!resolvedOrgId) {
      console.error("❌ Could not resolve organization for user:", userId);
      return new Response(
        JSON.stringify({
          error: "Could not resolve organization. Please ensure you have completed onboarding.",
          debug: { userId, providedOrgId: organizationId, parentImageId }
        }),
        { status: 400, headers: corsHeaders }
      );
    }
    
    console.log("✅ Final resolved organization:", resolvedOrgId);

    /**
     * 4. Load Brand Knowledge
     */
    const { data: brandKnowledgeData } = await supabase
      .from("brand_knowledge")
      .select("knowledge_type, content")
      .eq("organization_id", resolvedOrgId)
      .eq("is_active", true);

    const brandKnowledge = {
      visualStandards:
        brandKnowledgeData?.find((k) => k.knowledge_type === "visual_standards")
          ?.content || null,
      vocabulary:
        brandKnowledgeData?.find((k) => k.knowledge_type === "vocabulary")
          ?.content || null,
      brandVoice:
        brandKnowledgeData?.find((k) => k.knowledge_type === "brand_voice")
          ?.content || null,
    };

    /**
     * 5. Load Product Data (all 49 fields)
     */
    let productData = null;
    if (product_id) {
      const { data } = await supabase
        .from("brand_products")
        .select("*")
        .eq("id", product_id)
        .eq("organization_id", resolvedOrgId)
        .maybeSingle();
      productData = data || null;
    }

    /**
     * 6. Categorize and prepare reference images
     */
    let actualReferenceImages = referenceImages || [];

    // Auto-include parent image for refinements
    if (isRefinement && parentImageId) {
      const { data: parent } = await supabase
        .from("generated_images")
        .select("image_url, final_prompt, chain_depth")
        .eq("id", parentImageId)
        .single();

      if (parent) {
        actualReferenceImages = [
          {
            url: parent.image_url,
            label: "Previous iteration",
            description: "Auto-included parent reference",
          },
          ...actualReferenceImages,
        ];
      }
    }

    // Categorize references by type
    const categorizedRefs = categorizeReferences(actualReferenceImages);

    // Determine mode: "Essential" (simple) vs "Director" (pro)
    const isDirectorMode = 
      proModeControls && Object.keys(proModeControls).length > 0 ||
      categorizedRefs.style.length > 0 ||
      categorizedRefs.background.length > 0 ||
      categorizedRefs.product.length > 1;

    /**
     * 7. Visual Master style directives — ONLY when the client sends a real squad.
     *
     * We intentionally do not auto-route from goalType/prompt here: heuristic routing
     * surprised users (e.g. "shadow" matched a naive `includes("ad")` → DISRUPTORS).
     * Pick Minimalist / Storyteller / Disruptor in Pro settings (Dark Room) to apply.
     */
    let visualMasterContext: string | undefined;

    const SQUADS: VisualSquad[] = [
      "THE_MINIMALISTS",
      "THE_STORYTELLERS",
      "THE_DISRUPTORS",
    ];
    const resolvedVisualSquad: VisualSquad | undefined =
      typeof visualSquad === "string" &&
      visualSquad !== "auto" &&
      visualSquad.trim() !== "" &&
      (SQUADS as string[]).includes(visualSquad)
        ? (visualSquad as VisualSquad)
        : undefined;

    if (resolvedVisualSquad) {
      visualMasterContext = getVisualStyleDirective(resolvedVisualSquad);
      console.log(`🎨 Visual Squad (explicit): ${resolvedVisualSquad}`, {
        directiveLength: visualMasterContext?.length || 0,
      });
    } else {
      console.log(
        `🎨 Visual Squad: none — no style directive injected (set Pro → Visual Style in Dark Room if you want one)`,
      );
    }

    /**
     * 8. Build enhanced prompt based on mode
     */
    let enhancedPrompt: string;

    if (isRefinement && refinementInstruction) {
      // Refinements use chain logic
      enhancedPrompt = buildChainPrompt(parentPrompt || prompt, refinementInstruction, 0);
    } else if (isDirectorMode) {
      // DIRECTOR MODE: Full "Virtual Art Director" treatment
      enhancedPrompt = buildDirectorModePrompt(
        prompt,
        categorizedRefs,
        proModeControls,
        brandKnowledge,
        productData,
        aspectRatio,
        visualMasterContext,
        {
          backgroundPresetId,
          backgroundPrompt,
          compositionPresetId,
          compositionPrompt,
        }
      );

      // Add product visual DNA if available
      if (productData) {
        const visualDNA = formatVisualContext(productData);
        enhancedPrompt += `\n\n${visualDNA}`;
      }
    } else {
      // ESSENTIAL MODE: Simple, fast workflow
      const productRef = categorizedRefs.product[0] || null;
      enhancedPrompt = buildEssentialModePrompt(prompt, productRef, brandContext, productData);

      // Add basic brand context
      if (brandKnowledge.visualStandards) {
        const vs = brandKnowledge.visualStandards;
        if (vs.color_palette?.length > 0) {
          enhancedPrompt += `\n\nBrand Colors: ${vs.color_palette
            .slice(0, 3)
            .map((c: any) => c.name)
            .join(", ")}`;
        }
      }

      // Aspect ratio is now applied by the provider (Gemini imageConfig /
       // Freepik aspect_ratio) — no need to stuff it into the prompt text.
    }

    // Consistency Mode: append the rich variation prompt as the final line
    // of the prompt. Placing it last gives the model the strongest "this is
    // the specific thing that changes" signal while all earlier framing —
    // scene, lighting, composition, reference image — stays identical
    // across the entire variation set.
    if (effectiveVariationPrompt) {
      enhancedPrompt += `\n\nVARIATION DETAILS: ${effectiveVariationPrompt}`;
    }

    // Apply image constraints (rewrite rules, prohibited terms)
    if (imageConstraints?.rewriteRules) {
      for (const [from, to] of Object.entries(imageConstraints.rewriteRules)) {
        enhancedPrompt = enhancedPrompt.replace(new RegExp(from, "gi"), String(to || ""));
      }
    }

    if (imageConstraints?.prohibitedTerms) {
      for (const term of imageConstraints.prohibitedTerms) {
        enhancedPrompt = enhancedPrompt.replace(
          new RegExp(`\\b${term}\\b`, "gi"),
          ""
        );
      }
    }

    /**
     * -------------------------
     * 8. Convert reference images to base64 in ORDERED SEQUENCE
     * -------------------------
     * Order matters: Product → Background → Style
     * This helps Gemini understand the hierarchy
     * 
     * IMPORTANT: Handles both:
     * - Regular URLs (https://...) - fetched and converted
     * - Base64 Data URLs (data:image/...) - parsed directly (from frontend file uploads)
     */
    
    // Helper function to process a reference image URL (handles both URL types)
    async function processReferenceImage(url: string): Promise<{ data: string; mimeType: string } | null> {
      if (!url) return null;
      
      // Check if it's a base64 data URL (from frontend file upload)
      if (url.startsWith('data:')) {
        // Parse data URL: data:image/png;base64,xxxxx
        const matches = url.match(/^data:([^;]+);base64,(.+)$/);
        if (matches && matches[1] && matches[2]) {
          console.log(`✅ Parsed base64 data URL (${matches[1]})`);
          return {
            mimeType: matches[1],
            data: matches[2],
          };
        } else {
          console.warn(`⚠️ Invalid data URL format: ${url.substring(0, 50)}...`);
          return null;
        }
      }
      
      // Otherwise, fetch the URL
      try {
        const response = await fetch(url);
        if (!response.ok) {
          console.warn(`⚠️ Failed to fetch reference: ${url.substring(0, 50)}... (${response.status})`);
          return null;
        }
        const buffer = await response.arrayBuffer();
        const base64 = encode(new Uint8Array(buffer));
        console.log(`✅ Fetched and encoded URL reference`);
        return {
          data: base64,
          mimeType: response.headers.get("content-type") || "image/png",
        };
      } catch (err) {
        console.error(`❌ Error processing reference ${url.substring(0, 50)}...:`, err);
        return null;
      }
    }
    
    const referenceImagesPayload = [];

    // Order: Product references first (the "star")
    for (const ref of categorizedRefs.product) {
      const processed = await processReferenceImage(ref.url);
      if (processed) {
        referenceImagesPayload.push(processed);
      }
    }

    // Then: Background references (the "stage")
    for (const ref of categorizedRefs.background) {
      const processed = await processReferenceImage(ref.url);
      if (processed) {
        referenceImagesPayload.push(processed);
      }
    }

    // Finally: Style references (the "direction")
    for (const ref of categorizedRefs.style) {
      const processed = await processReferenceImage(ref.url);
      if (processed) {
        referenceImagesPayload.push(processed);
      }
    }

    console.log(`📸 Reference Images Prepared:`, {
      product: categorizedRefs.product.length,
      background: categorizedRefs.background.length,
      style: categorizedRefs.style.length,
      total: referenceImagesPayload.length,
      mode: isDirectorMode ? "Director" : "Essential",
    });

    /**
     * -------------------------
     * 9. Check Subscription Tier & Determine Provider
     * -------------------------
     * 
     * TIER ACCESS:
     * - Essentials ($49): Gemini only
     * - Studio ($149): Gemini + Freepik Flux Pro (limited)
     * - Signature ($349): Full Freepik (Mystic 4K, Video, etc.)
     * - Super Admins: Full access to all features for testing
     * 
     * FALLBACK: Freepik fails → Gemini
     */
    
    // Fetch organization's subscription tier
    let subscriptionTier = "essentials"; // Default to lowest tier
    let freepikAllowed = false;
    let freepik4KAllowed = false;
    let freepikVideoAllowed = false;
    let isSuperAdmin = false;
    
    // Check if user is a super admin (gets full access for testing)
    if (userId) {
      try {
        const { data: superAdminData } = await supabase
          .from("super_admins")
          .select("id")
          .eq("user_id", userId)
          .maybeSingle();
        
        if (superAdminData) {
          isSuperAdmin = true;
          freepikAllowed = true;
          freepik4KAllowed = true;
          freepikVideoAllowed = true;
          console.log("👑 Super Admin detected - Full Freepik access enabled");
        }
      } catch (saError) {
        console.warn("Could not check super admin status:", saError);
      }
    }
    
    // If not a super admin, check subscription tier
    if (!isSuperAdmin) {
      try {
        const { data: orgData } = await supabase
          .from("organizations")
          .select("subscription_tier, stripe_subscription_status")
          .eq("id", resolvedOrgId)
          .single();
        
        if (orgData) {
          subscriptionTier = (orgData.subscription_tier || "essentials").toLowerCase();
          const isActive = orgData.stripe_subscription_status === "active" || 
                          orgData.stripe_subscription_status === "trialing";
          
          // Determine Freepik access based on tier
          // Actual tiers: essentials ($49), studio ($149), signature ($349)
          if (isActive || subscriptionTier === "free_trial") {
            // Studio and Signature get basic Freepik access (Flux Pro)
            if (subscriptionTier === "studio" || subscriptionTier === "signature") {
              freepikAllowed = true;
            }
            // Only Signature gets 4K and Video (premium Freepik features)
            if (subscriptionTier === "signature") {
              freepik4KAllowed = true;
              freepikVideoAllowed = true;
            }
          }
        }
      } catch (tierError) {
        console.warn("Could not fetch subscription tier, defaulting to Gemini:", tierError);
      }
    }
    
    console.log(`📊 Subscription Tier Check:`, {
      tier: isSuperAdmin ? "super_admin" : subscriptionTier,
      isSuperAdmin,
      freepikAllowed,
      freepik4KAllowed,
      aiProviderFromClient: aiProvider ?? "(none)",
      requestedProvider: effectiveProvider,
      requestedModel: effectiveFreepikModel,
      requestedResolution: effectiveFreepikResolution,
      madisonResolution: resolution ?? "(default standard)",
    });

    if (effectiveProvider === "auto") {
      console.log(
        `ℹ️ Provider Auto → prefer OpenAI GPT Image 2, then fall back to Gemini 3.1 Pro if OpenAI is unavailable or fails.`,
      );
    }

    // Seed selection. Default: random seed per call for variety. Consistency
    // Mode (bulk variation) overrides with a fixed seed shared by every
    // variation in the set — combined with the same reference image and
    // prompt base, this drives Gemini toward pixel-stable output.
    // Gemini API requires INT32 (0 – 2_147_483_647).
    const MAX_INT32 = 2147483647;
    const clampedFixedSeed = typeof fixedSeed === "number" && Number.isFinite(fixedSeed)
      ? Math.max(0, Math.min(MAX_INT32, Math.floor(fixedSeed)))
      : null;
    const randomSeed = clampedFixedSeed ?? Math.floor(Math.random() * MAX_INT32);
    if (clampedFixedSeed !== null) {
      console.log("🔒 Consistency Mode active — using fixed seed:", clampedFixedSeed, {
        consistencySetId: consistencySetId ?? "(none)",
        setPosition: setPosition ?? "(none)",
      });
    }

    // Determine which provider to use based on tier and request.
    // Default path now prefers GPT Image 2; Gemini 3.1 Pro is the fallback.
    let selectedProvider: "gemini" | "freepik" | "openai" = "gemini";
    let tierRestrictionApplied = false;

    if (effectiveProvider === "openai") {
      // OpenAI is selectable from the UI but never the auto-pick — Nano Banana
      // stays primary. OPENAI_API_KEY must be configured; if it isn't we
      // transparently fall back to Gemini instead of failing the request.
      if (Deno.env.get("OPENAI_API_KEY")) {
        selectedProvider = "openai";
      } else {
        console.warn("⚠️ OpenAI requested but OPENAI_API_KEY not set — falling back to Gemini");
        tierRestrictionApplied = true;
      }
    } else if (effectiveProvider === "freepik" || effectiveFreepikModel) {
      // User explicitly requested Freepik
      if (freepikAllowed) {
        // Check if they're requesting 4K (requires higher tier)
        if (effectiveFreepikResolution === "4k" && !freepik4KAllowed) {
          console.log("⚠️ 4K requested but not allowed on this tier, downgrading to 2K");
          tierRestrictionApplied = true;
          selectedProvider = "freepik";
        } else {
          selectedProvider = "freepik";
        }
      } else {
        // Freepik not allowed on this tier - fall back to Gemini
        console.log("⚠️ Freepik requested but not available on Essentials tier, using Gemini");
        tierRestrictionApplied = true;
      }
    } else if (effectiveProvider === "auto") {
      if (Deno.env.get("OPENAI_API_KEY")) {
        selectedProvider = "openai";
      } else {
        console.warn("⚠️ Auto requested but OPENAI_API_KEY not set — defaulting to Gemini 3.1 Pro");
      }
    }
    // effectiveProvider === "gemini" → stays as gemini

    let imageUrl: string;
    let usedProvider: string = selectedProvider;
    let didFallback = false;

    if (selectedProvider === "freepik") {
      /**
       * FREEPIK GENERATION PATH
       */
      // Ensure resolution is allowed
      const finalResolution = (effectiveFreepikResolution === "4k" && !freepik4KAllowed) 
        ? "2k" 
        : (effectiveFreepikResolution || "2k");
      
      console.log("🎨 Using Freepik for image generation...", {
        model: effectiveFreepikModel || "mystic",
        resolution: finalResolution,
        tierRestrictionApplied,
      });

      try {
        // Check if this model supports reference images
        const modelInfo = IMAGE_MODELS.find(m => m.id === effectiveFreepikModel);
        const supportsReferences = modelInfo?.supportsReferences ?? false;
        
        // Prepare reference images for models that support them (Seedream 4 4K, Seedream)
        const freepikReferenceImages = supportsReferences && categorizedRefs.product.length > 0
          ? categorizedRefs.product.map(ref => ({
              url: ref.url,
              weight: 0.8, // High weight for product accuracy
            }))
          : undefined;

        const freepikResult = await generateFreepikImage({
          prompt: enhancedPrompt,
          model: (effectiveFreepikModel as FreepikImageModel) || "mystic",
          resolution: finalResolution as FreepikResolution,
          aspectRatio: aspectRatio as any,
          seed: randomSeed,
          referenceImages: freepikReferenceImages,
        });

        // Re-upload Freepik image to Supabase Storage for a permanent URL.
        // Freepik CDN URLs expire, so we must persist the image ourselves.
        const freepikFetch = await fetch(freepikResult.imageUrl);
        if (!freepikFetch.ok) {
          throw new Error(`Failed to fetch Freepik image for re-upload: ${freepikFetch.status}`);
        }
        const freepikBuffer = await freepikFetch.arrayBuffer();
        // Pipeline-aware storage path when launched from the Grid Pipeline;
        // UUID path (unchanged) for everything else.
        const freepikShortId = crypto.randomUUID().slice(0, 8);
        const freepikPosition =
          typeof setPosition === "number" && Number.isFinite(setPosition)
            ? Math.max(0, Math.floor(setPosition))
            : 0;
        const freepikFilename = pipelineMeta
          ? `${resolvedOrgId}/${pipelineMeta.storagePathPrefix}/${pipelineMeta.variationSlug}-pos${freepikPosition}-${freepikShortId}.png`
          : `${resolvedOrgId}/${Date.now()}-${crypto.randomUUID()}.png`;

        const { error: freepikUploadErr } = await supabase.storage
          .from("generated-images")
          .upload(freepikFilename, freepikBuffer, { contentType: "image/png" });

        if (freepikUploadErr) {
          console.error("Storage upload error for Freepik image", freepikUploadErr);
          throw freepikUploadErr;
        }

        const { data: freepikUrlData } = supabase.storage
          .from("generated-images")
          .getPublicUrl(freepikFilename);

        imageUrl = freepikUrlData.publicUrl;
        usedProvider = `freepik-${freepikResult.model}`;

        console.log(`✅ Freepik Image Generated & Uploaded to Storage:`, {
          taskId: freepikResult.taskId,
          model: freepikResult.model,
          usedReferences: !!freepikReferenceImages,
          storedUrl: imageUrl,
        });
      } catch (freepikError) {
        console.error("❌ Freepik generation failed, falling back to Gemini:", freepikError);
        // Fall back to Gemini
        selectedProvider = "gemini";
        didFallback = true;
      }
    }

    if (selectedProvider === "openai") {
      /**
       * OPENAI GENERATION PATH
       *
       * Uses OpenAI's Images API (gpt-image-* family). References, when
       * present, route to /images/edits so the model conditions on them;
       * otherwise we hit /images/generations. Output is always returned as
       * base64 so the upload path mirrors the Gemini branch exactly.
       *
       * Default model is gpt-image-2 (Image API). Fallback on any failure is
       * Gemini, same pattern as the Freepik branch.
       */
      console.log("🎨 Using OpenAI for image generation...", {
        model: effectiveOpenAIModel,
        resolution,
        aspectRatio,
        references: referenceImagesPayload.length,
      });

      try {
        const openaiResult = await generateOpenAIImage({
          prompt: enhancedPrompt,
          model: effectiveOpenAIModel,
          aspectRatio,
          resolution,
          referenceImages: referenceImagesPayload.length > 0
            ? referenceImagesPayload
            : undefined,
          user: userId ?? undefined,
        });

        // Write base64 bytes to Supabase Storage. Pipeline-aware filename
        // when launched from the Grid Pipeline; UUID path otherwise.
        const openaiShortId = crypto.randomUUID().slice(0, 8);
        const openaiPosition =
          typeof setPosition === "number" && Number.isFinite(setPosition)
            ? Math.max(0, Math.floor(setPosition))
            : 0;
        const ext = openaiResult.mimeType === "image/jpeg" ? "jpg"
          : openaiResult.mimeType === "image/webp" ? "webp"
          : "png";
        const openaiFilename = pipelineMeta
          ? `${resolvedOrgId}/${pipelineMeta.storagePathPrefix}/${pipelineMeta.variationSlug}-pos${openaiPosition}-${openaiShortId}.${ext}`
          : `${resolvedOrgId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

        const { error: openaiUploadErr } = await supabase.storage
          .from("generated-images")
          .upload(openaiFilename, decode(openaiResult.imageBase64), {
            contentType: openaiResult.mimeType,
          });

        if (openaiUploadErr) {
          console.error("Storage upload error for OpenAI image", openaiUploadErr);
          throw openaiUploadErr;
        }

        const { data: openaiUrlData } = supabase.storage
          .from("generated-images")
          .getPublicUrl(openaiFilename);

        imageUrl = openaiUrlData.publicUrl;
        usedProvider = `openai-${openaiResult.model}`;

        console.log(`✅ OpenAI Image Generated & Uploaded to Storage:`, {
          model: openaiResult.model,
          endpoint: openaiResult.endpoint,
          revisedPrompt: openaiResult.revisedPrompt ? "(rewritten)" : "(as-sent)",
          storedUrl: imageUrl,
        });
      } catch (openaiError) {
        console.error("❌ OpenAI generation failed, falling back to Gemini:", openaiError);
        selectedProvider = "gemini";
        didFallback = true;
      }
    }

    if (selectedProvider === "gemini") {
      /**
       * GEMINI GENERATION PATH (default)
       *
       * We try the requested model first. If that 404s (e.g. preview not
       * released to this API key), fall through to the stable
       * gemini-2.5-flash-image so the user never sees a dead-model error.
       *
       * Primary is gemini-3-pro-image-preview (verified live on our key
       * and honors aspect ratio natively). If Google renames the preview
       * model in the future, override via the GEMINI_IMAGE_MODEL secret
       * without a redeploy.
       */
      // Preference order: user's pick → next-best Gemini 3-class model →
      // stable 2.5. If the requested preview isn't yet released to this
      // API key, we quietly step down and still generate an image.
      const GEMINI_PRO_PRIMARY = "models/gemini-3-pro-image-preview";
      const GEMINI_FLASH_SECONDARY = "models/gemini-3.1-flash-image-preview";
      const GEMINI_STABLE_FALLBACK = "models/gemini-2.5-flash-image";
      const rawChain: string[] = [
        effectiveGeminiModel,
        GEMINI_PRO_PRIMARY,
        GEMINI_FLASH_SECONDARY,
        GEMINI_STABLE_FALLBACK,
      ];
      const seen = new Set<string>();
      const geminiModelPreference = rawChain.filter((m) => {
        if (seen.has(m)) return false;
        seen.add(m);
        return true;
      });

      // Map the user's Resolution setting to Gemini's native imageSize
      // parameter. Gemini 3 Pro / 3.1 Flash can produce 1K/2K/4K directly —
      // no Freepik detour needed for high-res.
      const geminiImageSize: "1K" | "2K" | "4K" =
        resolution === "4k" ? "4K" :
        resolution === "high" ? "2K" :
        "1K";

      console.log("🎨 Using Gemini for image generation...", {
        primaryModel: effectiveGeminiModel || "default",
        fallbackChain: geminiModelPreference,
        imageSize: geminiImageSize,
      });

      let geminiImage: any = null;
      let lastError: unknown = null;
      let modelUsed = effectiveGeminiModel;

      for (const candidateModel of geminiModelPreference) {
        try {
          geminiImage = await callGeminiImage({
            prompt: enhancedPrompt,
            aspectRatio,
            imageSize: geminiImageSize,
            seed: randomSeed,
            model: candidateModel,
            referenceImages: referenceImagesPayload.length > 0
              ? referenceImagesPayload
              : undefined,
          });
          modelUsed = candidateModel;
          break;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          // Only fall through on "model not found / not supported" style
          // errors. Any other failure (auth, quota, network) should bubble.
          const isModelMissing = /\b404\b|not found|not supported|INVALID_ARGUMENT.*model/i.test(msg);
          if (!isModelMissing) throw err;
          console.warn(`⚠️ Gemini model ${candidateModel} unavailable, falling back:`, msg);
          lastError = err;
        }
      }

      if (!geminiImage) {
        throw lastError ?? new Error("All Gemini image models failed");
      }

      effectiveGeminiModel = modelUsed;

      const rawBase64Image = geminiImage?.data ?? geminiImage?.bytesBase64 ?? geminiImage?.base64;

      if (!rawBase64Image) {
        throw new Error("Gemini returned no image. Check prompt and reference images.");
      }

      // Gemini Nano Banana biases toward square output even when we pass the
      // requested aspect ratio via imageConfig. Center-crop the returned
      // image server-side to guarantee the user sees the shape they asked
      // for, regardless of what the model actually produced.
      const conformed = await conformImageToAspectRatio(rawBase64Image, aspectRatio);
      const base64Image = conformed.base64;

      console.log("🖼️ Gemini aspect-ratio conformance:", {
        requested: aspectRatio,
        originalDimensions: `${conformed.originalWidth}×${conformed.originalHeight}`,
        finalDimensions: `${conformed.width}×${conformed.height}`,
        cropped: conformed.wasModified,
      });

      // Upload Gemini's base64 image to Supabase Storage. Pipeline-aware
      // path when launched from the Grid Pipeline; UUID path otherwise.
      const geminiShortId = crypto.randomUUID().slice(0, 8);
      const geminiPosition =
        typeof setPosition === "number" && Number.isFinite(setPosition)
          ? Math.max(0, Math.floor(setPosition))
          : 0;
      const filename = pipelineMeta
        ? `${resolvedOrgId}/${pipelineMeta.storagePathPrefix}/${pipelineMeta.variationSlug}-pos${geminiPosition}-${geminiShortId}.png`
        : `${resolvedOrgId}/${Date.now()}-${crypto.randomUUID()}.png`;

      const { error: uploadErr } = await supabase.storage
        .from("generated-images")
        .upload(filename, decode(base64Image), {
          contentType: "image/png",
        });

      if (uploadErr) {
        console.error("Storage upload error", uploadErr);
        throw uploadErr;
      }

      const { data: urlData } = supabase.storage
        .from("generated-images")
        .getPublicUrl(filename);

      imageUrl = urlData.publicUrl;
      usedProvider = didFallback ? "gemini (fallback)" : "gemini";

      console.log(`✅ Gemini Image Generated Successfully`, { didFallback });
    }

    console.log(`✅ Image Generation Complete`, {
      provider: usedProvider,
      subscriptionTier,
      didFallback,
      tierRestrictionApplied,
      mode: isDirectorMode ? "Director Mode" : "Essential Mode",
      promptLength: enhancedPrompt.length,
      referencesUsed: referenceImagesPayload.length,
    });

    /**
     * -------------------------
     * 10. Save DB record to generated_images
     * -------------------------
     */
    
    // library_category is constrained to: 'content', 'marketplace', or 'both'
    // Use 'content' as default for all generated images (they go to Image Library)
    // The goal_type field stores the detailed category (product, lifestyle, etc.)
    const libraryCategory = 'content';
    
    console.log(`[generate-madison-image] Library category: ${libraryCategory}, goal_type: ${goalType}`);
    
    const insertPayload: Record<string, unknown> = {
      organization_id: resolvedOrgId,
      user_id: userId,
      session_id: sessionId,
      goal_type: goalType,
      library_category: libraryCategory, // For Image Library filtering
      aspect_ratio: aspectRatio,
      output_format: outputFormat,
      final_prompt: enhancedPrompt,
      image_url: imageUrl,
      generation_provider: usedProvider,
      media_type: "image",
      description: isDirectorMode 
        ? `${usedProvider} generated image (Director Mode - Pro Photography)` 
        : `${usedProvider} generated image (Essential Mode)`,
    };

    if (selectedTemplate) insertPayload.selected_template = selectedTemplate;
    if (userRefinements) insertPayload.user_refinements = userRefinements;
    if (actualReferenceImages?.length) {
      insertPayload.reference_images = actualReferenceImages;
    }

    if (brandContext || brandKnowledge.visualStandards) {
      insertPayload.brand_context_used = {
        ...brandContext,
        knowledgeUsed: {
          hasVisualStandards: !!brandKnowledge.visualStandards,
        },
      };
    }

    // Note: image_generator column doesn't exist in schema, removed
    insertPayload.saved_to_library = true;
    insertPayload.parent_image_id = isRefinement ? parentImageId : null;
    insertPayload.chain_depth = isRefinement ? 1 : 0;
    insertPayload.is_chain_origin = !isRefinement;
    insertPayload.refinement_instruction = isRefinement
      ? refinementInstruction
      : null;

    // Consistency Mode grouping — set when the caller is part of a bulk
    // variation set. Columns added in migration 20260422000000.
    if (typeof consistencySetId === "string" && consistencySetId) {
      insertPayload.consistency_set_id = consistencySetId;
    }
    if (effectiveVariationLabel) {
      insertPayload.variation_descriptor = effectiveVariationLabel;
    }
    if (typeof setPosition === "number" && Number.isFinite(setPosition)) {
      insertPayload.set_position = Math.max(0, Math.floor(setPosition));
    }

    // Auto-tag pipeline-originated images so the client's team can filter
    // the Library by brand/family/shape without coordinating on tag names.
    // Three sources get merged, de-duped, into library_tags:
    //   1. Anything already on insertPayload (future-proof — no callers today)
    //   2. pipelineMeta.libraryTags (brand/family/shape/pipeline-group refs —
    //      only present for pipeline-originated runs)
    //   3. extraLibraryTags from the request body (per-variation tags like
    //      applicator:fine-mist-metal, color:amber — emitted by Consistency
    //      Mode for every run, not just pipeline ones, so non-pipeline sets
    //      are still searchable by axis)
    const callerExtraTags = Array.isArray(extraLibraryTags)
      ? (extraLibraryTags as unknown[]).filter(
          (t): t is string => typeof t === "string" && t.length > 0,
        )
      : [];
    if (pipelineMeta || callerExtraTags.length > 0) {
      const existing = Array.isArray(insertPayload.library_tags)
        ? (insertPayload.library_tags as string[])
        : [];
      insertPayload.library_tags = Array.from(
        new Set([
          ...existing,
          ...(pipelineMeta ? pipelineMeta.libraryTags : []),
          ...callerExtraTags,
        ]),
      );
    }

    const savedImage = await insertGeneratedImageRecord(
      supabase,
      insertPayload,
    );

    /**
     * -------------------------
     * 11. NOTE: Images are saved to generated_images table ONLY
     * -------------------------
     * Previously, images were also saved to the prompts table, but this caused
     * them to appear in both Archives and Image Library. Now images only go to
     * generated_images table and the Image Library reads from there directly.
     * 
     * The prompts table is for TEXT prompts/recipes, not generated images.
     */
    console.log(`[generate-madison-image] ✅ Image saved to generated_images table: ${savedImage?.id}`);
    console.log(`[generate-madison-image] Image will appear in Image Library via generated_images table`);

    /**
     * -------------------------
     * 12. Return response
     * -------------------------
     */
    return new Response(
      JSON.stringify({
        imageUrl,
        savedImageId: savedImage?.id,
        description: "Generated via Gemini",
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const errMsg = err.message || "Image generation failed.";
    console.error("❌ generate-madison-image Error:", errMsg, err.stack);
    return new Response(
      JSON.stringify({
        error: errMsg,
        details: Deno.env.get("ENVIRONMENT") === "development" ? err.stack : undefined,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});
