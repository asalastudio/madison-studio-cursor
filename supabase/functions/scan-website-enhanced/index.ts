/**
 * ENHANCED BRAND SCANNER (Pomelli-Style)
 *
 * Uses Gemini Flash for pixel-based visual analysis.
 * Extracts colors, fonts, and brand DNA directly from screenshots.
 *
 * Supports three modes:
 * 1. URL + Screenshot API (automatic)
 * 2. URL + User-provided screenshot (manual)
 * 3. Screenshot only (for testing)
 *
 * Cost: ~$0.03 per full scan
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  analyzeScreenshot,
  buildBrandVisual,
  fetchLogoWithFallback,
  type VisualAnalysis
} from "../_shared/visualAnalyzer.ts";
import {
  assignSquadsFromAnalysis,
  type SquadAssignment
} from "../_shared/squadAssignment.ts";
import { storeDesignTokens } from "../_shared/designTokenGenerator.ts";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface RequestBody {
  url?: string;
  organizationId: string;
  screenshot?: string; // Base64 encoded screenshot
  screenshotMimeType?: string;
  forceRescan?: boolean;
}

interface BrandDNA {
  org_id: string;
  visual: Record<string, unknown>;
  essence: {
    mission?: string;
    keywords?: string[];
    tone?: string;
    copySquad?: string;
    visualSquad?: string;
    primaryCopyMaster?: string;
    primaryVisualMaster?: string;
  };
  constraints: {
    forbiddenWords?: string[];
    forbiddenStyles?: string[];
    voiceGuidelines?: string;
  };
  scan_method: string;
  scan_metadata: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

serve(async (req) => {
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const body: RequestBody = await req.json();
    const { url, organizationId, screenshot, screenshotMimeType, forceRescan } = body;

    // Validate required fields
    if (!organizationId) {
      return new Response(
        JSON.stringify({ error: "organizationId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!url && !screenshot) {
      return new Response(
        JSON.stringify({ error: "Either url or screenshot is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Enhanced Scan] Starting for org: ${organizationId}`);
    const startTime = Date.now();

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Normalize URL if provided
    const normalizedUrl = url ? (url.startsWith('http') ? url : `https://${url}`) : undefined;
    const domain = normalizedUrl ? new URL(normalizedUrl).hostname.replace('www.', '') : undefined;

    // ═══════════════════════════════════════════════════════════════════════════
    // CHECK FOR RECENT SCAN (Cache)
    // ═══════════════════════════════════════════════════════════════════════════
    if (!forceRescan && domain) {
      const { data: existingDNA } = await supabase
        .from('brand_dna')
        .select('*')
        .eq('org_id', organizationId)
        .single();

      if (existingDNA) {
        const scannedAt = existingDNA.scan_metadata?.scanned_at;
        if (scannedAt) {
          const scanAge = Date.now() - new Date(scannedAt).getTime();
          const twentyFourHours = 24 * 60 * 60 * 1000;

          if (scanAge < twentyFourHours) {
            console.log(`[Enhanced Scan] Returning cached result (${Math.round(scanAge / 1000 / 60)} minutes old)`);
            return new Response(
              JSON.stringify({
                brandDNA: existingDNA,
                cached: true,
                message: 'Using cached brand DNA (less than 24 hours old)'
              }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 1: Get Screenshot
    // ═══════════════════════════════════════════════════════════════════════════
    let screenshotBase64: string;
    const mimeType = screenshotMimeType || 'image/png';

    if (screenshot) {
      // User provided screenshot
      console.log(`[Enhanced Scan] Using provided screenshot`);
      screenshotBase64 = screenshot;
    } else if (normalizedUrl) {
      // Try to capture screenshot via API
      console.log(`[Enhanced Scan] Capturing screenshot for ${normalizedUrl}`);
      const screenshotResult = await captureScreenshotWithFallback(normalizedUrl);

      if (!screenshotResult) {
        return new Response(
          JSON.stringify({
            error: "Could not capture screenshot",
            message: "Please provide a screenshot manually or configure SCREENSHOT_API_KEY"
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      screenshotBase64 = screenshotResult;
    } else {
      return new Response(
        JSON.stringify({ error: "No screenshot available" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 2: Visual Analysis with Gemini Flash
    // ═══════════════════════════════════════════════════════════════════════════
    console.log(`[Enhanced Scan] Analyzing screenshot with Gemini Flash`);
    let visualAnalysis: VisualAnalysis;

    try {
      visualAnalysis = await analyzeScreenshot(screenshotBase64, mimeType);
    } catch (error) {
      console.error(`[Enhanced Scan] Visual analysis failed:`, error);
      return new Response(
        JSON.stringify({
          error: "Visual analysis failed",
          details: error instanceof Error ? error.message : 'Unknown error'
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Enhanced Scan] Analysis complete: ${visualAnalysis.brandTone} tone, ${visualAnalysis.visualStyle} style`);

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 3: Fetch Logo
    // ═══════════════════════════════════════════════════════════════════════════
    let logoUrl: string | undefined;
    let logoSource: 'clearbit' | 'favicon' | 'manual' = 'favicon';

    if (domain) {
      try {
        const logoResult = await fetchLogoWithFallback(domain, normalizedUrl!);
        logoUrl = logoResult.url;
        logoSource = logoResult.source;
        console.log(`[Enhanced Scan] Logo fetched: ${logoSource}`);
      } catch (error) {
        console.log(`[Enhanced Scan] Logo fetch failed:`, error);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 4: Auto-Assign Squads
    // ═══════════════════════════════════════════════════════════════════════════
    console.log(`[Enhanced Scan] Auto-assigning squads`);
    let squadAssignment: SquadAssignment;

    try {
      squadAssignment = await assignSquadsFromAnalysis(visualAnalysis, normalizedUrl || 'manual');
      console.log(`[Enhanced Scan] Squad assigned: ${squadAssignment.copySquad} / ${squadAssignment.visualSquad}`);
    } catch (error) {
      console.error(`[Enhanced Scan] Squad assignment failed:`, error);
      // Use defaults
      squadAssignment = {
        copySquad: 'THE_STORYTELLERS',
        visualSquad: 'THE_STORYTELLERS',
        primaryCopyMaster: 'PETERMAN_ROMANCE',
        primaryVisualMaster: 'LEIBOVITZ_ENVIRONMENT',
        reasoning: 'Default assignment (squad AI unavailable)'
      };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 5: Build Brand DNA
    // ═══════════════════════════════════════════════════════════════════════════
    const brandVisual = buildBrandVisual(visualAnalysis, logoUrl, logoSource);

    const brandDNA: BrandDNA = {
      org_id: organizationId,

      visual: brandVisual,

      essence: {
        mission: null, // To be filled by user or document upload
        keywords: visualAnalysis.designElements.slice(0, 5),
        tone: visualAnalysis.brandTone,
        copySquad: squadAssignment.copySquad,
        visualSquad: squadAssignment.visualSquad,
        primaryCopyMaster: squadAssignment.primaryCopyMaster,
        primaryVisualMaster: squadAssignment.primaryVisualMaster,
      },

      constraints: {
        forbiddenWords: [],
        forbiddenStyles: [],
        voiceGuidelines: "",
      },

      scan_method: 'url_scan_enhanced',
      scan_metadata: {
        source_url: normalizedUrl,
        scanned_at: new Date().toISOString(),
        confidence: visualAnalysis.confidence,
        gemini_model: 'gemini-2.5-flash',
        squad_reasoning: squadAssignment.reasoning,
        analysis_raw: visualAnalysis,
      },
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 6: Store in Database
    // ═══════════════════════════════════════════════════════════════════════════
    console.log(`[Enhanced Scan] Storing brand DNA`);

    const { data, error } = await supabase
      .from('brand_dna')
      .upsert(brandDNA, { onConflict: 'org_id' })
      .select()
      .single();

    if (error) {
      console.error('[Enhanced Scan] Database error:', error);
      throw error;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 7: Generate Design Tokens
    // ═══════════════════════════════════════════════════════════════════════════
    console.log(`[Enhanced Scan] Generating design tokens`);

    try {
      await storeDesignTokens(organizationId, brandVisual);
    } catch (error) {
      console.warn('[Enhanced Scan] Design token generation failed:', error);
      // Non-fatal - continue without tokens
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // DONE
    // ═══════════════════════════════════════════════════════════════════════════
    const duration = Date.now() - startTime;
    console.log(`[Enhanced Scan] Complete in ${duration}ms`);

    return new Response(
      JSON.stringify({
        brandDNA: data,
        squadAssignment,
        analysis: {
          colors: {
            primary: visualAnalysis.primaryColor,
            secondary: visualAnalysis.secondaryColor,
            accent: visualAnalysis.accentColor,
            palette: visualAnalysis.colorPalette,
          },
          tone: visualAnalysis.brandTone,
          style: visualAnalysis.visualStyle,
          confidence: visualAnalysis.confidence,
        },
        cached: false,
        duration,
        message: 'Brand DNA extracted successfully with Pomelli-style visual analysis'
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[Enhanced Scan] Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        details: error instanceof Error ? error.stack : String(error),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCREENSHOT CAPTURE HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Attempts to capture screenshot using multiple services
 */
async function captureScreenshotWithFallback(url: string): Promise<string | null> {
  // Strategy 1: ScreenshotAPI.net (if configured)
  const screenshotApiKey = Deno.env.get("SCREENSHOT_API_KEY");
  if (screenshotApiKey) {
    try {
      const result = await captureWithScreenshotApi(url, screenshotApiKey);
      if (result) return result;
    } catch (error) {
      console.log(`[Screenshot] ScreenshotAPI failed:`, error);
    }
  }

  // Strategy 2: Screenshot Machine (if configured)
  const screenshotMachineKey = Deno.env.get("SCREENSHOT_MACHINE_KEY");
  if (screenshotMachineKey) {
    try {
      const result = await captureWithScreenshotMachine(url, screenshotMachineKey);
      if (result) return result;
    } catch (error) {
      console.log(`[Screenshot] Screenshot Machine failed:`, error);
    }
  }

  // Strategy 3: Microlink (free tier, lower quality)
  try {
    const result = await captureWithMicrolink(url);
    if (result) return result;
  } catch (error) {
    console.log(`[Screenshot] Microlink failed:`, error);
  }

  return null;
}

async function captureWithScreenshotApi(url: string, apiKey: string): Promise<string | null> {
  const apiUrl = `https://shot.screenshotapi.net/screenshot?token=${apiKey}&url=${encodeURIComponent(url)}&width=1920&height=1080&output=base64&full_page=false`;

  const response = await fetch(apiUrl);
  if (!response.ok) return null;

  const data = await response.json();
  return data.screenshot || null;
}

async function captureWithScreenshotMachine(url: string, apiKey: string): Promise<string | null> {
  const apiUrl = `https://api.screenshotmachine.com?key=${apiKey}&url=${encodeURIComponent(url)}&dimension=1920x1080&format=png`;

  const response = await fetch(apiUrl);
  if (!response.ok) return null;

  const arrayBuffer = await response.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
  return base64;
}

async function captureWithMicrolink(url: string): Promise<string | null> {
  const apiUrl = `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true&meta=false&embed=screenshot.url`;

  const response = await fetch(apiUrl);
  if (!response.ok) return null;

  const data = await response.json();
  if (!data.data?.screenshot?.url) return null;

  // Fetch the image and convert to base64
  const imageResponse = await fetch(data.data.screenshot.url);
  if (!imageResponse.ok) return null;

  const arrayBuffer = await imageResponse.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
  return base64;
}





























