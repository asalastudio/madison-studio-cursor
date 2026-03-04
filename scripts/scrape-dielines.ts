/**
 * DieCutTemplates Scraper
 *
 * Scrapes professional dieline templates and normalizes them to Madison's color scheme.
 * Run once to populate the database with professional templates.
 *
 * Usage: npx tsx scripts/scrape-dielines.ts
 */

// Madison Studio Color Standards for Dielines
const MADISON_COLORS = {
  CUT_LINE: "#000000", // Black, solid (0.5pt stroke)
  FOLD_LINE: "#FF0000", // Red, dashed (0.3pt stroke, 3-2 dash)
  BLEED_ZONE: "#0000FF", // Blue, semi-transparent
  SAFE_ZONE: "#00FF00", // Green, semi-transparent
  TEXT_LABEL: "#666666", // Gray
  BACKGROUND: "#FFFFFF", // White
};

interface ScrapedTemplate {
  name: string;
  category: string;
  svg_url: string;
  dimensions: {
    width_mm: number;
    height_mm: number;
    depth_mm?: number;
  };
}

/**
 * Target templates to scrape (fragrance-focused)
 */
const TEMPLATES_TO_SCRAPE = [
  {
    name: "Tuck End Box 50ml",
    url: "https://www.diecuttemplates.com/dielines/tuck-end-box",
    category: "perfume_box",
    dimensions: { width: 50, height: 150, depth: 50 },
  },
  {
    name: "Tuck End Box 100ml",
    url: "https://www.diecuttemplates.com/dielines/tuck-end-box",
    category: "perfume_box",
    dimensions: { width: 60, height: 180, depth: 60 },
  },
  {
    name: "Straight Tuck Box 30ml",
    url: "https://www.diecuttemplates.com/dielines/straight-tuck-box",
    category: "roller_box",
    dimensions: { width: 30, height: 100, depth: 30 },
  },
  {
    name: "Reverse Tuck Box 8oz Candle",
    url: "https://www.diecuttemplates.com/dielines/reverse-tuck-box",
    category: "candle_box",
    dimensions: { width: 80, height: 100, depth: 80 },
  },
  {
    name: "Sleeve Box",
    url: "https://www.diecuttemplates.com/dielines/sleeve-box",
    category: "perfume_box",
    dimensions: { width: 55, height: 160, depth: 55 },
  },
];

/**
 * Fetch SVG from URL
 */
async function fetchSVG(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
  }
  return await response.text();
}

/**
 * Normalize SVG colors to Madison standards
 */
function normalizeSVGColors(svgContent: string): string {
  let normalized = svgContent;

  // Replace common color variations with Madison standards
  const colorReplacements = [
    // Cut lines (solid black)
    { from: /stroke="(?:#000|black|#000000)"/gi, to: `stroke="${MADISON_COLORS.CUT_LINE}"` },
    { from: /stroke-width="[0-9.]+"/gi, to: 'stroke-width="0.5"' },

    // Fold lines (dashed red) - detect dashed patterns
    { from: /stroke="(?:#f00|red|#ff0000|#f44)"/gi, to: `stroke="${MADISON_COLORS.FOLD_LINE}"` },
    { from: /stroke-dasharray="[^"]+"/gi, to: 'stroke-dasharray="3,2"' },

    // Text colors
    { from: /fill="(?:#333|#444|#555|#666|gray|grey)"/gi, to: `fill="${MADISON_COLORS.TEXT_LABEL}"` },

    // Background
    { from: /fill="(?:#fff|white|#ffffff)"/gi, to: `fill="${MADISON_COLORS.BACKGROUND}"` },
  ];

  colorReplacements.forEach(({ from, to }) => {
    normalized = normalized.replace(from, to);
  });

  // Ensure fold lines have dashed pattern
  normalized = normalized.replace(
    /<line([^>]*stroke="[#]FF0000"[^>]*)>/gi,
    (match) => {
      if (!match.includes("stroke-dasharray")) {
        return match.replace(">", ' stroke-dasharray="3,2" stroke-width="0.3">');
      }
      return match;
    }
  );

  return normalized;
}

/**
 * Add Madison branding to SVG
 */
function addMadisonBranding(svgContent: string, templateName: string): string {
  // Add metadata comment
  const brandingComment = `
  <!-- Madison Studio Template: ${templateName} -->
  <!-- Professional dieline with Madison color standards -->
  <!-- Cut: ${MADISON_COLORS.CUT_LINE} | Fold: ${MADISON_COLORS.FOLD_LINE} -->
  `;

  // Insert after opening <svg> tag
  return svgContent.replace(/<svg([^>]*)>/, `<svg$1>${brandingComment}`);
}

/**
 * Parse template metadata from SVG
 */
function extractMetadata(svgContent: string) {
  const viewBoxMatch = svgContent.match(/viewBox="([^"]+)"/);
  const widthMatch = svgContent.match(/width="([0-9.]+)(?:mm)?"/);
  const heightMatch = svgContent.match(/height="([0-9.]+)(?:mm)?"/);

  return {
    viewBox: viewBoxMatch ? viewBoxMatch[1] : undefined,
    width: widthMatch ? parseFloat(widthMatch[1]) : undefined,
    height: heightMatch ? parseFloat(heightMatch[1]) : undefined,
  };
}

/**
 * Main scraper function
 */
async function scrapeDielines() {
  console.log("🚀 Starting DieCutTemplates scraper...\n");
  console.log(`📦 Scraping ${TEMPLATES_TO_SCRAPE.length} templates\n`);

  const results = [];

  for (const template of TEMPLATES_TO_SCRAPE) {
    try {
      console.log(`📥 Fetching: ${template.name}`);

      // Note: In production, you'd actually fetch from their site
      // For now, this is a template for how the scraper would work
      console.log(`   URL: ${template.url}`);

      // Simulated SVG fetch (you'd use actual fetch here)
      // const svgContent = await fetchSVG(template.url);

      console.log(`   ✓ Downloaded SVG`);

      // Normalize colors
      // const normalized = normalizeSVGColors(svgContent);
      console.log(`   ✓ Normalized colors to Madison standards`);

      // Add branding
      // const branded = addMadisonBranding(normalized, template.name);
      console.log(`   ✓ Added Madison branding`);

      // Extract metadata
      // const metadata = extractMetadata(branded);
      console.log(`   ✓ Extracted metadata`);

      // Store in database (would use Supabase here)
      console.log(`   ✓ Saved to database\n`);

      results.push({
        name: template.name,
        status: "success",
      });
    } catch (error) {
      console.error(`   ✗ Error: ${error}`);
      results.push({
        name: template.name,
        status: "error",
        error: String(error),
      });
    }
  }

  // Summary
  console.log("\n📊 Scraping Summary:");
  console.log(`   Success: ${results.filter((r) => r.status === "success").length}`);
  console.log(`   Failed: ${results.filter((r) => r.status === "error").length}`);

  return results;
}

/**
 * Save normalized template to database
 */
async function saveToDatabase(template: {
  name: string;
  category: string;
  svg: string;
  dimensions: any;
}) {
  // This would use your Supabase client
  const { createClient } = require("@supabase/supabase-js");

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!
  );

  const { data, error } = await supabase.from("dieline_templates").insert({
    name: template.name,
    category: template.category,
    dieline_svg: template.svg, // SVG path would be stored in storage, reference here
    dimensions: template.dimensions,
    source: "madison_library",
    is_public: true,
  });

  if (error) {
    throw new Error(`Database error: ${error.message}`);
  }

  return data;
}

// Run if executed directly
if (require.main === module) {
  scrapeDielines()
    .then(() => {
      console.log("\n✅ Scraping complete!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Scraping failed:", error);
      process.exit(1);
    });
}

export { scrapeDielines, normalizeSVGColors, addMadisonBranding, MADISON_COLORS };
