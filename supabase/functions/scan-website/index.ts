import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractBrandAssets } from "../_shared/brandAssetsExtractor.ts";
import { extractColorPalette } from "../_shared/colorPaletteExtractor.ts";
import { fetchSiteCopy } from "../_shared/siteCopyExtractor.ts";
import { inferBrandProfile } from "../_shared/brandProfileInference.ts";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";

// Type definitions (inline for Deno compatibility)
type BrandReport = {
  site: {
    domain: string;
    url: string;
    logoUrl?: string;
    altLogos?: string[];
    faviconUrl?: string;
    ogImageUrl?: string;
    logoSource?: string;
    logoConfidenceScore?: number;
  };
  brandProfile: {
    brandName?: string;
    tagline?: string;
    positioning?: string;
    primaryAudience?: string[];
    toneTraits?: string[];
    visualKeywords?: string[];
    archetype?: string;
    mission?: string;
    values?: string[];
    essence?: string;
  };
  colors: {
    primary: string[];
    secondary: string[];
    neutrals: string[];
    accent?: string[];
    colorSource?: string;
    colorConfidenceScore?: number;
    rawSources?: any;
  };
  scanMeta: {
    scannedAt: string;
    version: string;
    sourceUrl: string;
    scanId?: string;
    extractionMethods?: {
      logo?: string[];
      colors?: string[];
      content?: string[];
    };
  };
  [key: string]: any; // Allow additional fields
};

// Normalize domain helper
function normalizeDomain(urlOrDomain: string): string {
  let domain = urlOrDomain.replace(/^https?:\/\//, '');
  domain = domain.replace(/^www\./, '');
  domain = domain.replace(/\/$/, '');
  domain = domain.split('/')[0];
  domain = domain.split(':')[0];
  return domain.toLowerCase().trim();
}

// Normalize brand report helper
function normalizeBrandReport(report: Partial<BrandReport>, url: string): BrandReport {
  const domain = normalizeDomain(url);
  
  return {
    site: {
      domain: report.site?.domain || domain,
      url: report.site?.url || url,
      logoUrl: report.site?.logoUrl,
      altLogos: report.site?.altLogos || [],
      faviconUrl: report.site?.faviconUrl,
      ogImageUrl: report.site?.ogImageUrl,
      logoSource: report.site?.logoSource,
      logoConfidenceScore: report.site?.logoConfidenceScore,
    },
    brandProfile: {
      brandName: report.brandProfile?.brandName || domain.split('.')[0],
      tagline: report.brandProfile?.tagline,
      positioning: report.brandProfile?.positioning,
      primaryAudience: report.brandProfile?.primaryAudience || [],
      toneTraits: report.brandProfile?.toneTraits || [],
      visualKeywords: report.brandProfile?.visualKeywords || [],
      archetype: report.brandProfile?.archetype,
      mission: report.brandProfile?.mission,
      values: report.brandProfile?.values || [],
      essence: report.brandProfile?.essence,
    },
    colors: {
      primary: report.colors?.primary || [],
      secondary: report.colors?.secondary || [],
      neutrals: report.colors?.neutrals || [],
      accent: report.colors?.accent || [],
      colorSource: report.colors?.colorSource,
      colorConfidenceScore: report.colors?.colorConfidenceScore,
      rawSources: report.colors?.rawSources,
    },
    scanMeta: {
      scannedAt: report.scanMeta?.scannedAt || new Date().toISOString(),
      version: report.scanMeta?.version || '1.0.0',
      sourceUrl: report.scanMeta?.sourceUrl || url,
      scanId: report.scanMeta?.scanId,
      extractionMethods: report.scanMeta?.extractionMethods,
    },
    ...report, // Include any additional fields
  };
}

/**
 * /api/scan endpoint
 *
 * Orchestrates the full website scanning and brand extraction process.
 *
 * Request body: { url: string, organizationId: string, forceRescan?: boolean }
 */
serve(async (req) => {
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const { url, organizationId, forceRescan = false } = await req.json();

    if (!url || !organizationId) {
      return new Response(
        JSON.stringify({ error: "url and organizationId are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[scan] Starting scan for URL: ${url}, org: ${organizationId}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 2.1 & 2.2: Normalize URL and ensure Domain record exists
    const normalizedDomain = normalizeDomain(url);
    const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;
    
    console.log(`[scan] Normalized domain: ${normalizedDomain}`);

    // Get or create Domain record
    let domainRecord;
    const { data: existingDomain } = await supabase
      .from('domains')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('domain', normalizedDomain)
      .single();

    if (existingDomain) {
      domainRecord = existingDomain;
      console.log(`[scan] Found existing domain record: ${domainRecord.id}`);
    } else {
      const { data: newDomain, error: domainError } = await supabase
        .from('domains')
        .insert({
          organization_id: organizationId,
          domain: normalizedDomain,
          display_name: normalizedDomain,
          metadata: {
            firstScannedAt: new Date().toISOString(),
            scanCount: 0,
          },
        })
        .select()
        .single();

      if (domainError) {
        throw new Error(`Failed to create domain record: ${domainError.message}`);
      }
      domainRecord = newDomain;
      console.log(`[scan] Created new domain record: ${domainRecord.id}`);
    }

    // Check if we should skip (if not forceRescan and recent scan exists)
    if (!forceRescan) {
      const { data: recentScan } = await supabase
        .from('brand_scans')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('domain', normalizedDomain)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      // If scan is less than 24 hours old, return it
      if (recentScan) {
        const scanAge = Date.now() - new Date(recentScan.created_at).getTime();
        const twentyFourHours = 24 * 60 * 60 * 1000;
        if (scanAge < twentyFourHours) {
          console.log(`[scan] Returning recent scan (${Math.round(scanAge / 1000 / 60)} minutes old)`);
          return new Response(
            JSON.stringify({
              scan: recentScan,
              report: recentScan.scan_data,
              cached: true,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    // Create scan record with pending status
    const { data: scanRecord, error: scanCreateError } = await supabase
      .from('brand_scans')
      .insert({
        organization_id: organizationId,
        domain: normalizedDomain,
        domain_id: domainRecord.id,
        scan_type: 'brand_dna',
        status: 'processing',
        scan_data: {},
      })
      .select()
      .single();

    if (scanCreateError) {
      throw new Error(`Failed to create scan record: ${scanCreateError.message}`);
    }

    console.log(`[scan] Created scan record: ${scanRecord.id}`);

    const startTime = Date.now();
    const rawToolsResult: any = {};

    try {
      // 2.3: Extract brand assets and site copy first (site copy needed for color CSS parsing)
      console.log(`[scan] Starting extraction...`);
      
      // Fetch site copy first (needed for HTML content in color extraction)
      const siteCopy = await fetchSiteCopy(normalizedUrl).catch(err => {
        console.error('[scan] Site copy extraction failed:', err);
        throw err; // Site copy is critical, fail if it fails
      });
      
      // Extract brand assets and colors in parallel (colors can use HTML from site copy)
      const htmlContent = siteCopy.homepage.html || '';
      const [brandAssets, colorPalette] = await Promise.all([
        extractBrandAssets(normalizedDomain).catch(err => {
          console.error('[scan] Brand assets extraction failed:', err);
          return { primaryLogoUrl: undefined, confidenceScore: 0, source: 'none' as const };
        }),
        extractColorPalette(normalizedDomain, htmlContent).catch(err => {
          console.error('[scan] Color extraction failed:', err);
          return { primary: [], secondary: [], neutrals: [], confidenceScore: 0, source: 'none' as const };
        }),
      ]);

      rawToolsResult.brandAssets = brandAssets;
      rawToolsResult.colorPalette = colorPalette;
      rawToolsResult.siteCopy = siteCopy;

      console.log(`[scan] ✅ Extracted assets, colors, and copy`);

      // 2.4: Infer brand profile from site copy
      console.log(`[scan] Inferring brand profile...`);
      const brandProfile = await inferBrandProfile({
        siteCopy,
        domain: normalizedDomain,
        url: normalizedUrl,
      });

      rawToolsResult.brandProfile = brandProfile;
      console.log(`[scan] ✅ Inferred brand profile`);

      // 2.5: Assemble BrandReport
      const brandReport: BrandReport = normalizeBrandReport({
        site: {
          domain: normalizedDomain,
          url: normalizedUrl,
          logoUrl: brandAssets.primaryLogoUrl,
          altLogos: brandAssets.alternativeLogos,
          faviconUrl: brandAssets.faviconUrl,
          ogImageUrl: brandAssets.ogImageUrl,
          logoSource: brandAssets.source,
          logoConfidenceScore: brandAssets.confidenceScore,
        },
        brandProfile: brandProfile,
        colors: {
          primary: colorPalette.primary,
          secondary: colorPalette.secondary,
          neutrals: colorPalette.neutrals,
          accent: colorPalette.accent,
          colorSource: colorPalette.source,
          colorConfidenceScore: colorPalette.confidenceScore,
          rawSources: {
            fromBrandApi: brandAssets.colors ? {
              source: brandAssets.source === 'brandfetch' ? 'brandfetch' : 'unknown',
              colors: [],
            } : undefined,
          },
        },
        brandVoice: {
          tone: brandProfile.toneTraits || [],
          style: brandProfile.writingStyle,
          perspective: brandProfile.perspective,
          vocabulary: brandProfile.vocabulary,
        },
        typography: {
          headlineFont: brandProfile.fonts?.headline,
          bodyFont: brandProfile.fonts?.body,
        },
        scanMeta: {
          scannedAt: new Date().toISOString(),
          version: '1.0.0',
          sourceUrl: normalizedUrl,
          scanId: scanRecord.id,
          extractionMethods: {
            logo: brandAssets.source !== 'none' ? [brandAssets.source] : [],
            colors: colorPalette.source !== 'none' ? [colorPalette.source] : [],
            content: ['html_parsing', 'ai_analysis'],
          },
        },
      }, normalizedUrl);

      // Update scan record with results
      const duration = Date.now() - startTime;
      const { error: updateError } = await supabase
        .from('brand_scans')
        .update({
          scan_data: brandReport,
          status: 'completed',
          metadata: {
            duration,
            extractionMethods: brandReport.scanMeta.extractionMethods,
            rawToolsResult,
          },
        })
        .eq('id', scanRecord.id);

      if (updateError) {
        throw new Error(`Failed to update scan record: ${updateError.message}`);
      }

      // Update domain metadata
      const { data: domainScans } = await supabase
        .from('brand_scans')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('domain', normalizedDomain)
        .eq('status', 'completed');

      const scanCount = domainScans?.length || 0;
      const isFirstScan = scanCount === 1;

      await supabase
        .from('domains')
        .update({
          metadata: {
            ...domainRecord.metadata,
            lastScannedAt: new Date().toISOString(),
            scanCount: scanCount,
          },
        })
        .eq('id', domainRecord.id);

      console.log(`[scan] ✅ Scan completed successfully in ${duration}ms`);

      // Send email on first scan
      if (isFirstScan) {
        try {
          // Get user email from organization
          const { data: orgData } = await supabase
            .from('organizations')
            .select('id, name')
            .eq('id', organizationId)
            .single();

          // Get organization owner/member email
          const { data: memberData } = await supabase
            .from('organization_members')
            .select('user_id, role')
            .eq('organization_id', organizationId)
            .eq('role', 'owner')
            .limit(1)
            .maybeSingle();

          if (memberData) {
            const { data: userData } = await supabase.auth.admin.getUserById(memberData.user_id);
            const userEmail = userData?.user?.email;

            if (userEmail) {
              const frontendUrl = Deno.env.get("FRONTEND_URL") || "https://app.madisonstudio.io";
              const reportUrl = `${frontendUrl}/reports/${encodeURIComponent(normalizedDomain)}?scanId=latest`;
              
              // Call email function (don't await - fire and forget)
              fetch(`${supabaseUrl}/functions/v1/send-report-email`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${supabaseKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  userEmail,
                  domain: normalizedDomain,
                  reportUrl,
                  brandName: brandReport.brandProfile.brandName,
                  // pdfUrl will be added when PDF generation is implemented
                }),
              }).catch(err => {
                console.warn('[scan] Failed to send report email:', err);
                // Don't fail the scan if email fails
              });
              
              console.log(`[scan] 📧 Report email queued for ${userEmail}`);
            }
          }
        } catch (emailError) {
          console.warn('[scan] Error sending report email:', emailError);
          // Don't fail the scan if email fails
        }
      }

      return new Response(
        JSON.stringify({
          scan: {
            ...scanRecord,
            scan_data: brandReport,
            status: 'completed',
          },
          report: brandReport,
          cached: false,
          isFirstScan,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } catch (error) {
      // Update scan record with error
      await supabase
        .from('brand_scans')
        .update({
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error',
        })
        .eq('id', scanRecord.id);

      throw error;
    }

  } catch (error) {
    console.error("[scan] Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        details: error instanceof Error ? error.stack : String(error),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

