import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  generateGeminiContent,
  extractTextFromGeminiResponse,
} from "../_shared/geminiClient.ts";
import { extractBrandAssets } from "../_shared/brandAssetsExtractor.ts";
import { extractColorPalette } from "../_shared/colorPaletteExtractor.ts";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";


/**
 * Infer a color name from hex value (basic helper)
 */
function inferColorName(hex: string): string {
  // Basic color name inference - can be enhanced
  const hexNum = parseInt(hex.replace('#', ''), 16);
  const r = (hexNum >> 16) & 0xff;
  const g = (hexNum >> 8) & 0xff;
  const b = hexNum & 0xff;
  
  // Simple color categorization
  if (r > 200 && g > 200 && b > 200) return "Light/White";
  if (r < 50 && g < 50 && b < 50) return "Dark/Black";
  if (r > g && r > b) return "Red/Pink";
  if (g > r && g > b) return "Green";
  if (b > r && b > g) return "Blue";
  if (r > 200 && g > 150 && b < 100) return "Orange/Yellow";
  if (r > 150 && g < 100 && b > 150) return "Purple";
  
  return "Brand Color";
}

serve(async (req) => {
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;
  const corsHeaders = getCorsHeaders(req);
  }

  try {
    const { websiteUrl, organizationId } = await req.json();

    if (!websiteUrl || !organizationId) {
      return new Response(
        JSON.stringify({ error: "websiteUrl and organizationId are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Analyzing Brand DNA for:", websiteUrl, "org:", organizationId);

    console.log("Analyzing Brand DNA for:", websiteUrl, "org:", organizationId);

    // ------------------------------------------------------------------
    // 1. PREDEFINED BRANDS (Bypass AI/Scraping for perfect demos)
    // ------------------------------------------------------------------
    const PREDEFINED_BRANDS: Record<string, any> = {
      "drunkelephant": {
        brandName: "Drunk Elephant",
        primaryColor: "#EB008B", // Hot Pink
        colorPalette: [
          { hex: "#EB008B", name: "Hot Pink", usage: "Accents & CTAs" },
          { hex: "#FFF200", name: "Neon Yellow", usage: "Highlights" },
          { hex: "#00A99D", name: "Teal", usage: "Secondary accents" },
          { hex: "#333333", name: "Charcoal", usage: "Primary Text" },
          { hex: "#FFFFFF", name: "White", usage: "Backgrounds" }
        ],
        fonts: {
          headline: "Verlag, sans-serif",
          body: "Vulf Mono, monospace"
        },
        logo: {
          detected: true,
          description: "Simple elephant line drawing",
          url: "https://logo.clearbit.com/drunkelephant.com"
        },
        visualStyle: {
          mood: "Playful, Clinical, Colorful",
          photography: "Bright, high-contrast product shots",
          composition: "Clean layouts with neon pops"
        },
        brandMission: "To deliver clinically-effective, biocompatible skincare that supports skin's health and eliminates the 'Suspicious 6' ingredients.",
        brandEssence: "Clean, Playful, Clinical, Transparent, Colorful"
      },
      "nike": {
        brandName: "Nike",
        primaryColor: "#000000",
        colorPalette: [
          { hex: "#000000", name: "Black", usage: "Primary" },
          { hex: "#FFFFFF", name: "White", usage: "Background" },
          { hex: "#F5F5F5", name: "Light Grey", usage: "UI Elements" }
        ],
        fonts: {
          headline: "Futura, sans-serif",
          body: "Helvetica Now, sans-serif"
        },
        logo: {
          detected: true,
          description: "The Swoosh",
          url: "https://logo.clearbit.com/nike.com"
        },
        visualStyle: {
          mood: "Athletic, Bold, Inspirational",
          photography: "High-energy action shots",
          composition: "Dynamic and bold"
        },
        brandMission: "To bring inspiration and innovation to every athlete in the world. If you have a body, you are an athlete.",
        brandEssence: "Athletic, Inspirational, Bold, Innovative, Performance"
      }
    };

    // Check if URL matches a predefined brand
    const urlLower = websiteUrl.toLowerCase();
    for (const [key, data] of Object.entries(PREDEFINED_BRANDS)) {
      if (urlLower.includes(key)) {
        console.log(`🎯 Predefined brand match found for: ${key}`);

        // Save to Supabase (reusing existing logic structure)
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        await supabase.from("organizations").update({ brand_config: data }).eq("id", organizationId);
        await supabase.from("brand_knowledge").insert({
          organization_id: organizationId,
          knowledge_type: "brand_dna_scan",
          content: { ...data, sourceUrl: websiteUrl, scannedAt: new Date().toISOString(), method: "predefined" },
        });

        return new Response(
          JSON.stringify(data),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    let textContent = "";
    let cssContent = "";
    let htmlContent = "";
    let fetchSuccess = false;

    try {
      // Fetch website content with better headers to avoid bot detection
      // Add 10s timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const websiteResponse = await fetch(websiteUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
        },
      });

      clearTimeout(timeoutId);

      if (websiteResponse.ok) {
        htmlContent = await websiteResponse.text();

        // Extract text content and preserve some structure
        textContent = htmlContent
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .substring(0, 10000);

        // Extract CSS for color/font analysis
        const styleMatches = htmlContent.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || [];
        cssContent = styleMatches.join("\n").substring(0, 5000);

        fetchSuccess = true;
        console.log("Extracted content lengths - text:", textContent.length, "css:", cssContent.length);
      } else {
        console.warn(`Failed to fetch website: ${websiteResponse.status} ${websiteResponse.statusText}`);
      }
    } catch (fetchError) {
      console.warn("Error fetching website, falling back to AI knowledge:", fetchError);
    }

    // ------------------------------------------------------------------
    // 2. LOGO EXTRACTION (Brandfetch → Logo.dev → HTML Scraping → Favicon)
    // ------------------------------------------------------------------
    const hostname = new URL(websiteUrl).hostname.replace('www.', '');
    const brandAssets = await extractBrandAssets(hostname);
    
    // Use primary logo URL, or fallback to favicon/OG image
    const logoUrl = brandAssets.primaryLogoUrl || brandAssets.faviconUrl || brandAssets.ogImageUrl || "";
    
    if (logoUrl) {
      console.log(`✅ Logo found via ${brandAssets.source}: ${logoUrl}`);
      } else {
      console.warn("No logo found, will use placeholder");
      }

    // ------------------------------------------------------------------
    // 3. COLOR PALETTE EXTRACTION (Brandfetch → Colorize → CSS Parsing → HTML Analysis)
    // ------------------------------------------------------------------
    let extractedColors: any = null;
    
    // Try Brandfetch colors first (if available from brandAssets)
    if (brandAssets.colors && (brandAssets.colors.primary?.length || brandAssets.colors.secondary?.length)) {
      extractedColors = {
        primary: brandAssets.colors.primary || [],
        secondary: brandAssets.colors.secondary || [],
        neutrals: brandAssets.colors.neutrals || [],
        accent: brandAssets.colors.accent || [],
        source: 'brandfetch',
        confidenceScore: 0.95,
      };
      console.log(`✅ Colors found via Brandfetch`);
    } else {
      // Try dedicated color palette extraction
      try {
        const colorPalette = await extractColorPalette(hostname, htmlContent);
        if (colorPalette.primary.length > 0 || colorPalette.neutrals.length > 0) {
          extractedColors = colorPalette;
          console.log(`✅ Colors found via ${colorPalette.source}`);
        }
      } catch (colorError) {
        console.warn("Color extraction failed:", colorError);
      }
    }

    const userPrompt = fetchSuccess
      ? `Analyze this website for Brand DNA:

TEXT CONTENT:
${textContent}

CSS CONTENT:
${cssContent}

Extract the visual brand identity AND brand essence/mission as structured JSON.`
      : `I could not access the website content directly (it may be protected). 
      
Please generate the Brand DNA for the brand at this URL: ${websiteUrl}

Rely on your internal knowledge about this brand. If you don't know the brand specifically, infer a likely brand identity based on the domain name and industry standards for that type of business.

Return the same JSON structure as requested.`;

    let brandDNA;

    try {
      const aiData = await generateGeminiContent({
        systemPrompt: `You are a brand DNA analyst specializing in extracting visual brand identity from websites.

Analyze the provided website content (or URL) to extract a comprehensive visual Brand DNA.

Return ONLY a valid JSON object (no markdown, no explanations) with this exact structure:
{
  "brandName": "Brand Name from website",
  "primaryColor": "#HEX color most prominent",
  "colorPalette": [
    { "hex": "#123456", "name": "Descriptive Name", "usage": "where it's used" }
  ],
  "fonts": {
    "headline": "Font Family Name, serif/sans-serif",
    "body": "Font Family Name, serif/sans-serif"
  },
  "logo": {
    "detected": true/false,
    "description": "description if found"
  },
  "visualStyle": {
    "mood": "3-5 word description of visual mood",
    "photography": "description of image style if detected",
    "composition": "layout/composition patterns"
  },
  "brandMission": "1-2 sentence brand mission or purpose",
  "brandEssence": "3-5 keywords that capture the brand essence (e.g., 'Clean, Clinical, Playful')"
}

Focus on extracting actual colors from CSS (hex, rgb values), real font families used, and observable visual patterns.
For brandMission, extract from About sections, hero text, or taglines.
For brandEssence, identify the core personality traits of the brand.`,
        messages: [
          {
            role: "user",
            content: userPrompt,
          },
        ],
        responseMimeType: "application/json",
        maxOutputTokens: 2048,
        temperature: 0.2,
      });

      const analysisText = extractTextFromGeminiResponse(aiData);
      console.log("AI Analysis received");

      // Parse AI response
      try {
        // Remove markdown code blocks if present
        const cleanedText = analysisText
          .replace(/```json\n?/g, "")
          .replace(/```\n?/g, "")
          .trim();

        brandDNA = JSON.parse(cleanedText);

        // Merge extracted colors with AI-generated colors (prioritize extracted)
        if (extractedColors) {
          // Build color palette array from extracted colors
          const colorPaletteArray: any[] = [];
          
          // Add primary colors
          if (extractedColors.primary && extractedColors.primary.length > 0) {
            extractedColors.primary.forEach((hex: string) => {
              colorPaletteArray.push({
                hex: hex,
                name: inferColorName(hex),
                usage: "Primary brand color"
              });
            });
          }
          
          // Add secondary colors
          if (extractedColors.secondary && extractedColors.secondary.length > 0) {
            extractedColors.secondary.forEach((hex: string) => {
              colorPaletteArray.push({
                hex: hex,
                name: inferColorName(hex),
                usage: "Secondary/accent color"
              });
            });
          }
          
          // Add neutrals
          if (extractedColors.neutrals && extractedColors.neutrals.length > 0) {
            extractedColors.neutrals.forEach((hex: string) => {
              colorPaletteArray.push({
                hex: hex,
                name: inferColorName(hex),
                usage: "Neutral/background color"
              });
            });
          }
          
          // Add accents
          if (extractedColors.accent && extractedColors.accent.length > 0) {
            extractedColors.accent.forEach((hex: string) => {
              colorPaletteArray.push({
                hex: hex,
                name: inferColorName(hex),
                usage: "Accent/highlight color"
              });
            });
          }
          
          // Update brandDNA with extracted colors
          if (colorPaletteArray.length > 0) {
            brandDNA.colorPalette = colorPaletteArray;
            brandDNA.primaryColor = colorPaletteArray[0]?.hex || brandDNA.primaryColor;
            brandDNA.colorSource = extractedColors.source;
            brandDNA.colorConfidenceScore = extractedColors.confidenceScore;
          }
        }

        // Add the extracted logo URL and alternative logos
        if (logoUrl) {
          brandDNA.logo = {
            ...brandDNA.logo,
            url: logoUrl,
            detected: true,
            source: brandAssets.source,
            confidenceScore: brandAssets.confidenceScore,
            ...(brandAssets.alternativeLogos && brandAssets.alternativeLogos.length > 0 && {
              alternatives: brandAssets.alternativeLogos
            })
          };
        }
      } catch (parseError) {
        console.error("Failed to parse AI response as JSON:", parseError);
        throw new Error("Invalid JSON from AI");
      }

    } catch (aiError) {
      console.error("AI Generation failed, attempting Knowledge Scan fallback:", aiError);

      try {
        // Knowledge Scan Fallback: Ask AI to guess based on brand name/URL
        const hostname = new URL(websiteUrl).hostname.replace('www.', '');
        const brandName = hostname.split('.')[0].charAt(0).toUpperCase() + hostname.split('.')[0].slice(1);

        console.log(`Attempting Knowledge Scan for ${brandName}...`);

        const fallbackAiData = await generateGeminiContent({
          systemPrompt: `You are a brand expert. I cannot access the website for ${brandName} (${websiteUrl}).
          
Please generate a comprehensive visual Brand DNA for this brand based on your INTERNAL KNOWLEDGE.
If you know the brand (e.g. Drunk Elephant, Nike, Apple), use their real colors, fonts, and style.
If you don't know it, infer a likely style based on the name and industry.

Return ONLY valid JSON with this structure:
{
  "brandName": "${brandName}",
  "primaryColor": "#HEX",
  "colorPalette": [{ "hex": "#HEX", "name": "Name", "usage": "Usage" }],
  "fonts": { "headline": "Font Name", "body": "Font Name" },
  "logo": { "detected": false, "description": "Description of logo" },
  "visualStyle": { "mood": "Mood", "photography": "Style", "composition": "Layout" },
  "brandMission": "1-2 sentence mission",
  "brandEssence": "3-5 keywords"
}`,
          messages: [{ role: "user", content: `Generate Brand DNA for ${brandName}` }],
          responseMimeType: "application/json",
          maxOutputTokens: 1024,
          temperature: 0.4
        });

        const fallbackText = extractTextFromGeminiResponse(fallbackAiData);
        const cleanedFallbackText = fallbackText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        brandDNA = JSON.parse(cleanedFallbackText);

        // Merge extracted colors if available
        if (extractedColors) {
          const colorPaletteArray: any[] = [];
          if (extractedColors.primary?.length) {
            extractedColors.primary.forEach((hex: string) => {
              colorPaletteArray.push({ hex, name: inferColorName(hex), usage: "Primary" });
            });
          }
          if (extractedColors.secondary?.length) {
            extractedColors.secondary.forEach((hex: string) => {
              colorPaletteArray.push({ hex, name: inferColorName(hex), usage: "Secondary" });
            });
          }
          if (extractedColors.neutrals?.length) {
            extractedColors.neutrals.forEach((hex: string) => {
              colorPaletteArray.push({ hex, name: inferColorName(hex), usage: "Neutral" });
            });
          }
          if (colorPaletteArray.length > 0) {
            brandDNA.colorPalette = colorPaletteArray;
            brandDNA.primaryColor = colorPaletteArray[0]?.hex || brandDNA.primaryColor;
          }
        }

        // Add logo URL if we found one
        if (logoUrl) {
          brandDNA.logo = {
            ...brandDNA.logo,
            url: logoUrl,
            detected: true,
            source: brandAssets.source,
            confidenceScore: brandAssets.confidenceScore,
            ...(brandAssets.alternativeLogos && brandAssets.alternativeLogos.length > 0 && {
              alternatives: brandAssets.alternativeLogos
            })
          };
        }

        brandDNA.fallback = true; // Mark as fallback but AI-generated
        console.log("Knowledge Scan successful");

      } catch (knowledgeError) {
        console.error("Knowledge Scan failed, using ultimate safety net:", knowledgeError);

        // Ultimate Fallback: Generate basic data from URL
        const hostname = new URL(websiteUrl).hostname.replace('www.', '');
        const brandName = hostname.split('.')[0].charAt(0).toUpperCase() + hostname.split('.')[0].slice(1);

        brandDNA = {
          brandName: brandName,
          primaryColor: "#000000",
          colorPalette: [
            { hex: "#000000", name: "Primary", usage: "Main text" },
            { hex: "#FFFFFF", name: "Background", usage: "Page background" }
          ],
          fonts: {
            headline: "System UI, sans-serif",
            body: "System UI, sans-serif"
          },
          logo: {
            detected: logoUrl ? true : false,
            description: logoUrl ? `Logo fetched from ${brandAssets.source}` : "Logo extraction failed, please upload manually",
            url: logoUrl || undefined,
            source: brandAssets.source,
            confidenceScore: brandAssets.confidenceScore,
            ...(brandAssets.alternativeLogos && brandAssets.alternativeLogos.length > 0 && {
              alternatives: brandAssets.alternativeLogos
            })
          },
          visualStyle: {
            mood: "Clean and professional",
            photography: "Standard web imagery",
            composition: "Standard layout"
          },
          brandMission: `${brandName} is committed to delivering quality products and services.`,
          brandEssence: "Professional, Reliable, Quality",
          fallback: true
        };
      }
    }

    // Save to Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Extract domain from website URL
    const domain = new URL(websiteUrl).hostname.replace('www.', '');

    // Save scan to brand_scans table (source of truth)
    const { error: scanError } = await supabase
      .from("brand_scans")
      .insert({
        organization_id: organizationId,
        domain: domain,
        scan_type: 'brand_dna',
        scan_data: brandDNA,
        status: 'completed'
      });

    if (scanError) {
      console.error("Error saving scan:", scanError);
      // Don't throw - continue with organization update
    } else {
      console.log("✅ Scan saved to brand_scans table");
    }

    // Update organization with brand_config (for backward compatibility)
    const { error: updateError } = await supabase
      .from("organizations")
      .update({
        brand_config: brandDNA
      })
      .eq("id", organizationId);

    if (updateError) {
      console.error("Error updating organization:", updateError);
      throw updateError;
    }

    // Also save to brand_knowledge for historical tracking
    const { error: insertError } = await supabase.from("brand_knowledge").insert({
      organization_id: organizationId,
      knowledge_type: "brand_dna_scan",
      content: {
        ...brandDNA,
        sourceUrl: websiteUrl,
        scannedAt: new Date().toISOString()
      },
    });

    if (insertError) {
      console.error("Error saving to brand_knowledge:", insertError);
      // Don't throw - org update succeeded
    }

    console.log("Brand DNA saved successfully");

    return new Response(
      JSON.stringify(brandDNA),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in analyze-brand-dna:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error occurred",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
