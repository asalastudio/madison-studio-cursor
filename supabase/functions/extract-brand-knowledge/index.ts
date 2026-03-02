import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";
  generateGeminiContent,
  extractTextFromGeminiResponse,
} from "../_shared/geminiClient.ts";


serve(async (req) => {
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;
  const corsHeaders = getCorsHeaders(req);
  }

  try {
    const { extractedText, organizationId, documentName, detectVisualStandards, industry } = await req.json();

    // DEBUG: Check API Key existence
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('CRITICAL: GEMINI_API_KEY secret is missing or empty in Supabase.');
    }

    if (!extractedText || !organizationId) {
      throw new Error('extractedText and organizationId are required');
    }

    console.log(`Extracting brand knowledge from ${documentName || 'document'} for org: ${organizationId}, industry: ${industry || 'not specified'}`);
    
    // Check if document contains visual standards sections
    const hasVisualStandards = detectVisualStandards || 
      /visual standards|image generation|photography guidelines|product photography|lighting guidelines|composition rules|color palette guidelines/i.test(extractedText);

    // ALWAYS extract brand voice/vocabulary, AND extract visual standards if present
    let extractionPrompt: string;
    
    if (hasVisualStandards) {
      // Extract BOTH brand voice AND visual standards
      const industryContext = industry ? `This brand operates in the ${industry} industry.` : 'Analyze this brand objectively without assuming any specific industry.';
      
      extractionPrompt = `You are a brand strategist analyzing comprehensive brand guidelines.

${industryContext}

DOCUMENT TO ANALYZE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${extractedText.slice(0, 50000)} 
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This document contains BOTH brand voice guidelines AND visual standards. Extract BOTH.

Return your analysis as a JSON object with this exact structure:

{
  "voice": {
    "toneAttributes": ["sophisticated", "warm"],
    "personalityTraits": ["confident", "authentic"],
    "writingStyle": "description of overall writing approach",
    "keyCharacteristics": ["concise sentences", "sensory language"]
  },
  "vocabulary": {
    "approvedTerms": ["key terms the brand uses"],
    "forbiddenPhrases": ["phrases to avoid"],
    "industryTerminology": ["industry-specific terms"],
    "preferredPhrasing": {"term": "preferred alternative"}
  },
  "examples": {
    "goodExamples": [
      {
        "text": "Example of on-brand copy",
        "analysis": "Why this works"
      }
    ],
    "badExamples": [
      {
        "text": "Example to avoid",
        "analysis": "Why to avoid"
      }
    ]
  },
  "structure": {
    "sentenceStructure": "Mix of short and flowing",
    "paragraphLength": "Short to medium",
    "punctuationStyle": "Strategic use of em-dashes",
    "rhythmPatterns": "Varied cadence"
  },
  "visual_standards": {
    "golden_rule": "The overarching visual philosophy",
    "color_palette": [
      {
        "name": "Stone Beige",
        "hex": "#D8C8A9",
        "usage": "Primary background"
      }
    ],
    "lighting_mandates": "Lighting requirements",
    "templates": [
      {
        "name": "Hero Product Shot",
        "aspectRatio": "4:5",
        "prompt": "Example prompt template"
      }
    ],
    "forbidden_elements": ["elements to avoid"],
    "approved_props": ["approved elements"],
    "raw_document": "FULL EXTRACTED TEXT - include everything from visual standards section"
  },
  "brandIdentity": {
    "mission": "What the brand stands for",
    "values": ["core values"],
    "targetAudience": "Who they serve",
    "uniquePositioning": "What makes them different"
  }
}

CRITICAL INSTRUCTIONS:
- Extract BOTH voice/vocabulary AND visual standards if present
- Extract the brand AS IT APPEARS in the document - do NOT impose industry assumptions
- Do NOT try to fit this into fragrance/beauty categories unless explicitly stated
- Pay special attention to forbidden phrases and what NOT to write
- Return ONLY valid JSON, no additional commentary`;
    } else {
      // Extract brand voice/vocabulary only (no visual standards detected)
      // Build industry context dynamically
      const industryContext = industry ? `This brand operates in the ${industry} industry.` : 'Analyze this brand objectively without assuming any specific industry.';
      
      extractionPrompt = `You are a brand strategist analyzing brand guidelines to extract structured knowledge.

${industryContext}

DOCUMENT TO ANALYZE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${extractedText.slice(0, 50000)} 
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Return your analysis as a JSON object with this exact structure:

{
  "voice": {
    "toneAttributes": ["sophisticated", "warm"],
    "personalityTraits": ["confident", "authentic"],
    "writingStyle": "description of overall writing approach",
    "keyCharacteristics": ["concise sentences", "sensory language"]
  },
  "vocabulary": {
    "approvedTerms": ["key terms the brand uses"],
    "forbiddenPhrases": ["phrases to avoid"],
    "industryTerminology": ["industry-specific terms"],
    "preferredPhrasing": {"term": "preferred alternative"}
  },
  "examples": {
    "goodExamples": [
      {
        "text": "Example of on-brand copy",
        "analysis": "Why this works"
      }
    ],
    "badExamples": [
      {
        "text": "Example to avoid",
        "analysis": "Why to avoid"
      }
    ]
  },
  "structure": {
    "sentenceStructure": "Mix of short and flowing",
    "paragraphLength": "Short to medium",
    "punctuationStyle": "Strategic use of em-dashes",
    "rhythmPatterns": "Varied cadence"
  },
  "brandIdentity": {
    "mission": "What the brand stands for",
    "values": ["core values"],
    "targetAudience": "Who they serve",
    "uniquePositioning": "What makes them different"
  }
}

CRITICAL INSTRUCTIONS:
- Extract the brand's voice, vocabulary, and identity AS IT APPEARS in the document
- Do NOT impose assumptions about what industry this brand is in
- Do NOT try to fit this into fragrance/beauty categories unless explicitly stated
- Pay attention to what the brand actually does and how they describe themselves
- Return ONLY valid JSON, no additional commentary`;
    }

    const data = await generateGeminiContent({
      messages: [{ role: 'user', content: extractionPrompt }],
      temperature: 0.3,
      responseMimeType: 'application/json',
      maxOutputTokens: 4096,
    });

    const extractedContent = extractTextFromGeminiResponse(data);

    console.log('Raw AI response:', extractedContent.substring(0, 500));

    // Parse JSON from response (handle markdown code blocks if present)
    let parsedKnowledge;
    try {
      // Remove markdown code blocks if present
      const cleanJson = extractedContent
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      
      parsedKnowledge = JSON.parse(cleanJson);
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError);
      console.error('Response was:', extractedContent);
      
      // Return partial data if parsing fails
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to parse extraction results',
          rawResponse: extractedContent.substring(0, 1000)
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500
        }
      );
    }

    console.log(`Successfully extracted brand knowledge from ${documentName}`);
    
    // Return different structure based on document type
    if (hasVisualStandards && parsedKnowledge.visual_standards) {
      console.log('Visual standards detected:', parsedKnowledge.visual_standards.golden_rule);
      return new Response(
        JSON.stringify({
          success: true,
          isVisualStandards: true,
          visualStandards: parsedKnowledge.visual_standards,
          voice: parsedKnowledge.voice,
          vocabulary: parsedKnowledge.vocabulary,
          examples: parsedKnowledge.examples,
          structure: parsedKnowledge.structure,
          brandIdentity: parsedKnowledge.brandIdentity || {}
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      console.log('Voice attributes:', parsedKnowledge.voice?.toneAttributes);
      console.log('Approved terms count:', parsedKnowledge.vocabulary?.approvedTerms?.length);
      
      return new Response(
        JSON.stringify({
          success: true,
          isVisualStandards: false,
          voice: parsedKnowledge.voice,
          vocabulary: parsedKnowledge.vocabulary,
          examples: parsedKnowledge.examples,
          structure: parsedKnowledge.structure,
          brandIdentity: parsedKnowledge.brandIdentity || {}
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('Error in extract-brand-knowledge:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: errorMessage 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
