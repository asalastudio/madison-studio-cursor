/**
 * BRAND DOCUMENT SCANNER
 *
 * Analyzes brand guidelines PDFs using Claude's native PDF support.
 * Extracts voice, mission, constraints, and writing examples.
 *
 * Cost: ~$0.05 per document
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.32.1";
import {
  assignSquadsFromDocument,
  inferToneFromAttributes
} from "../_shared/squadAssignment.ts";
import { storeDesignTokens } from "../_shared/designTokenGenerator.ts";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface DocumentAnalysis {
  brandName: string;
  mission: string | null;
  voiceAttributes: string[];
  toneGuidelines: string | null;
  colors: {
    primary: string | null;
    secondary: string | null;
    palette: string[];
  };
  typography: {
    headline: string | null;
    body: string | null;
  };
  forbiddenWords: string[];
  forbiddenStyles: string[];
  writingExamples: string[];
  visualGuidelines: string | null;
  logoUsageRules: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

serve(async (req) => {
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    // Parse multipart form data
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const organizationId = formData.get('organizationId') as string | null;

    // Validation
    if (!file || !organizationId) {
      return new Response(
        JSON.stringify({ error: "file and organizationId are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (file.type !== 'application/pdf') {
      return new Response(
        JSON.stringify({ error: "Only PDF files are supported" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Document Scan] Processing ${file.name} for org: ${organizationId}`);
    const startTime = Date.now();

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 1: Convert PDF to Base64
    // ═══════════════════════════════════════════════════════════════════════════
    const arrayBuffer = await file.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 2: Send to Claude for Analysis
    // ═══════════════════════════════════════════════════════════════════════════
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const anthropic = new Anthropic({ apiKey });

    const extractionPrompt = `You are analyzing a brand guidelines document. Extract brand identity information and return ONLY valid JSON (no markdown, no preamble):

{
  "brandName": "exact brand name from document",
  "mission": "1-2 sentence brand purpose or mission statement (or null if not found)",
  "voiceAttributes": ["array", "of", "3-5", "adjectives", "describing", "voice"],
  "toneGuidelines": "How the brand should sound in writing (2-3 sentences, or null)",
  "colors": {
    "primary": "hex code or color name (or null)",
    "secondary": "hex code or color name (or null)",
    "palette": ["all", "brand", "colors"]
  },
  "typography": {
    "headline": "font family name for headlines (or null)",
    "body": "font family name for body text (or null)"
  },
  "forbiddenWords": ["words", "or", "phrases", "brand", "never", "uses"],
  "forbiddenStyles": ["visual", "styles", "to", "avoid"],
  "writingExamples": [
    "Extract 2-3 example sentences that demonstrate the brand voice",
    "Include actual quotes from the document if present",
    "These will be used as reference examples"
  ],
  "visualGuidelines": "Summary of photography, imagery, and design rules (2-3 sentences, or null)",
  "logoUsageRules": "Any specific rules about logo usage, spacing, or restrictions (or null)"
}

Important:
- Extract EXACT quotes for writingExamples
- Be thorough - this is the source of truth for brand voice
- If information is missing, use null (not empty strings)
- Focus on actionable guidelines, not generic statements`;

    console.log(`[Document Scan] Sending to Claude Sonnet`);

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: base64
            }
          },
          {
            type: 'text',
            text: extractionPrompt
          }
        ]
      }]
    });

    const responseText = message.content[0].type === 'text'
      ? message.content[0].text
      : '';

    // Clean response
    const cleanedResponse = responseText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    let analysis: DocumentAnalysis;
    try {
      analysis = JSON.parse(cleanedResponse);
    } catch (error) {
      console.error('[Document Scan] Failed to parse response:', cleanedResponse);
      return new Response(
        JSON.stringify({ error: "Failed to parse document analysis" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Document Scan] Analysis complete for ${analysis.brandName}`);

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 3: Fetch Existing Brand DNA (if URL scan already ran)
    // ═══════════════════════════════════════════════════════════════════════════
    const { data: existingDNA } = await supabase
      .from('brand_dna')
      .select('*')
      .eq('org_id', organizationId)
      .single();

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 4: Merge with Existing Data or Create New
    // ═══════════════════════════════════════════════════════════════════════════
    const inferredTone = inferToneFromAttributes(analysis.voiceAttributes);

    const mergedDNA = {
      org_id: organizationId,

      // Visual Identity - prefer existing (from URL scan) or use PDF data
      visual: existingDNA?.visual || {
        logo: { url: null, source: 'manual', variants: {} },
        colors: {
          primary: analysis.colors.primary,
          secondary: analysis.colors.secondary,
          accent: analysis.colors.palette[0] || analysis.colors.primary,
          palette: analysis.colors.palette,
          usage: {
            primary: "Headlines, CTAs, brand moments",
            secondary: "Backgrounds, subtle accents",
            accent: "Highlights, urgency indicators"
          }
        },
        typography: {
          headline: {
            family: analysis.typography.headline || 'Cormorant Garamond',
            weights: [400, 600, 700],
            usage: "Headlines, hero text"
          },
          body: {
            family: analysis.typography.body || 'Lato',
            weights: [400, 500],
            usage: "Body copy, descriptions"
          }
        },
        visualStyle: {
          photography: 'mixed',
          composition: 'centered',
          lighting: 'natural',
          colorGrading: 'neutral'
        }
      },

      // Brand Essence - merge with existing
      essence: {
        mission: analysis.mission || existingDNA?.essence?.mission,
        keywords: analysis.voiceAttributes,
        tone: inferredTone,
        copySquad: existingDNA?.essence?.copySquad || null,
        visualSquad: existingDNA?.essence?.visualSquad || null,
        primaryCopyMaster: existingDNA?.essence?.primaryCopyMaster || null,
        primaryVisualMaster: existingDNA?.essence?.primaryVisualMaster || null
      },

      // Constraints - new data from PDF (merge with existing)
      constraints: {
        forbiddenWords: [
          ...(existingDNA?.constraints?.forbiddenWords || []),
          ...analysis.forbiddenWords
        ].filter((v, i, a) => a.indexOf(v) === i), // Dedupe
        forbiddenStyles: [
          ...(existingDNA?.constraints?.forbiddenStyles || []),
          ...analysis.forbiddenStyles
        ].filter((v, i, a) => a.indexOf(v) === i),
        voiceGuidelines: analysis.toneGuidelines || existingDNA?.constraints?.voiceGuidelines,
        logoUsageRules: analysis.logoUsageRules || existingDNA?.constraints?.logoUsageRules
      },

      // Metadata
      scan_method: existingDNA ? 'url_scan_enhanced' : 'document_only',
      scan_metadata: {
        ...(existingDNA?.scan_metadata || {}),
        document_analyzed_at: new Date().toISOString(),
        document_name: file.name,
        claude_model: 'claude-sonnet-4-20250514'
      }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 5: Store Merged Brand DNA
    // ═══════════════════════════════════════════════════════════════════════════
    const { data, error } = await supabase
      .from('brand_dna')
      .upsert(mergedDNA, { onConflict: 'org_id' })
      .select()
      .single();

    if (error) {
      console.error('[Document Scan] Database error:', error);
      throw error;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 6: Store Writing Examples in Silo C
    // ═══════════════════════════════════════════════════════════════════════════
    let examplesStored = 0;

    if (analysis.writingExamples && analysis.writingExamples.length > 0) {
      for (const example of analysis.writingExamples) {
        if (example && example.length > 20) { // Only store meaningful examples
          const { error: exampleError } = await supabase
            .from('brand_writing_examples')
            .insert({
              org_id: organizationId,
              content: example,
              source: 'uploaded_pdf',
              tone_tags: analysis.voiceAttributes,
              metadata: {
                document_name: file.name,
                extracted_at: new Date().toISOString()
              }
            });

          if (!exampleError) {
            examplesStored++;
          }
        }
      }
      console.log(`[Document Scan] Stored ${examplesStored} writing examples`);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 7: Re-assign Squads (if not already assigned)
    // ═══════════════════════════════════════════════════════════════════════════
    if (!existingDNA?.essence?.copySquad) {
      console.log(`[Document Scan] Assigning squads from document analysis`);

      try {
        const squadAssignment = await assignSquadsFromDocument({
          mission: analysis.mission || undefined,
          voiceAttributes: analysis.voiceAttributes,
          toneGuidelines: analysis.toneGuidelines || undefined,
          visualGuidelines: analysis.visualGuidelines || undefined
        });

        await supabase
          .from('brand_dna')
          .update({
            essence: {
              ...data.essence,
              copySquad: squadAssignment.copySquad,
              visualSquad: squadAssignment.visualSquad,
              primaryCopyMaster: squadAssignment.primaryCopyMaster,
              primaryVisualMaster: squadAssignment.primaryVisualMaster
            }
          })
          .eq('org_id', organizationId);

        console.log(`[Document Scan] Squad assigned: ${squadAssignment.copySquad}`);
      } catch (error) {
        console.warn('[Document Scan] Squad assignment failed:', error);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 8: Generate Design Tokens (if we have colors)
    // ═══════════════════════════════════════════════════════════════════════════
    if (mergedDNA.visual?.colors?.primary) {
      try {
        await storeDesignTokens(organizationId, mergedDNA.visual);
      } catch (error) {
        console.warn('[Document Scan] Design token generation failed:', error);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // DONE
    // ═══════════════════════════════════════════════════════════════════════════
    const duration = Date.now() - startTime;
    console.log(`[Document Scan] Complete in ${duration}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        brandDNA: data,
        analysis: {
          brandName: analysis.brandName,
          mission: analysis.mission,
          voiceAttributes: analysis.voiceAttributes,
          forbiddenWords: analysis.forbiddenWords.length,
          writingExamples: examplesStored
        },
        examplesStored,
        duration,
        message: 'Brand guidelines processed successfully'
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[Document Scan] Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        details: error instanceof Error ? error.stack : String(error),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});





























