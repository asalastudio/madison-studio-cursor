import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
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

  let uploadId: string | undefined;
  let requestBody: any;

  try {
    // Read request body once
    requestBody = await req.json();
    const { uploadId: id, fileUrl, organizationId } = requestBody;
    uploadId = id;

    if (!uploadId || !fileUrl) {
      throw new Error('Missing required parameters');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Update status to processing
    await supabase
      .from('worksheet_uploads')
      .update({ processing_status: 'processing' })
      .eq('id', uploadId);

    console.log('Downloading file from storage:', fileUrl);

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('worksheet-uploads')
      .download(fileUrl);

    if (downloadError) {
      throw new Error(`Failed to download file: ${downloadError.message}`);
    }

    // Convert file to base64 using chunked processing to avoid stack overflow
    const arrayBuffer = await fileData.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const chunkSize = 8192; // Process 8KB at a time
    let binary = '';
    
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.slice(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    
    const base64 = btoa(binary);
    const mimeType = fileUrl.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 
                     fileUrl.toLowerCase().match(/\.(jpg|jpeg)$/i) ? 'image/jpeg' : 'image/png';
    const dataUrl = `data:${mimeType};base64,${base64}`;

    console.log('Calling Gemini AI to parse worksheet...');

    const systemPrompt = `You are a document parser for Madison Studio content worksheets.
Extract the following information from the uploaded worksheet:

1. Product/Collection Name (text field)
2. Deliverable Format (one of: Email Campaign, Blog Post, Social Media Post, Product Description, Newsletter, Website Copy)
3. Target Audience (text description)
4. Content Goal (text description)
5. Style Overlay (one of: Brand Voice, J. Peterman Style, Ogilvy Style, Hybrid Narrative, Minimal & Modern)
6. Additional Editorial Direction (text description)

Return the extracted data as JSON in this exact format:
{
  "product": "extracted product name or null",
  "format": "extracted format or null",
  "audience": "extracted audience description or null",
  "goal": "extracted goal description or null",
  "style": "extracted style choice (brand-voice, poetic, direct, story, or minimal) or null",
  "additionalContext": "extracted additional direction or null"
}

For style, convert the values to lowercase with hyphens:
- "Brand Voice" or "Your Brand Voice" → "brand-voice"
- "J. Peterman Style" or "Poetic" → "poetic"
- "Ogilvy Style" or "Direct" → "direct"
- "Hybrid Narrative" or "Story" → "story"
- "Minimal & Modern" or "Minimal" → "minimal"

For format, use the exact options:
- Email Campaign, Blog Post, Social Media Post, Product Description, Newsletter, Website Copy

Return confidence scores (0-1) for each field. If handwriting is unclear, return lower confidence.
If a field is completely blank or unreadable, return null for that field and confidence of 0.`;

    const aiData = await generateGeminiContent({
      systemPrompt,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Please extract the data from this content brief worksheet.' },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      responseMimeType: 'application/json',
      model: 'models/gemini-2.5-flash',
      maxOutputTokens: 2048,
      temperature: 0.2,
    });

    console.log('AI response received:', JSON.stringify(aiData, null, 2));

    const content = extractTextFromGeminiResponse(aiData);
    if (!content) {
      throw new Error('No content in AI response');
    }

    let extractedData;
    try {
      extractedData = JSON.parse(content);
    } catch (parseError) {
      console.error('Failed to parse AI response:', content);
      throw new Error('Invalid JSON from AI');
    }

    // Generate confidence scores (simple heuristic based on field presence)
    const confidenceScores = {
      product: extractedData.product ? 0.9 : 0,
      format: extractedData.format ? 0.85 : 0,
      audience: extractedData.audience ? 0.8 : 0,
      goal: extractedData.goal ? 0.8 : 0,
      style: extractedData.style ? 0.9 : 0,
      additionalContext: extractedData.additionalContext ? 0.75 : 0
    };

    console.log('Extracted data:', extractedData);
    console.log('Confidence scores:', confidenceScores);

    // Update database with extracted data
    const { error: updateError } = await supabase
      .from('worksheet_uploads')
      .update({
        extracted_data: extractedData,
        confidence_scores: confidenceScores,
        processing_status: 'completed'
      })
      .eq('id', uploadId);

    if (updateError) {
      throw new Error(`Failed to update record: ${updateError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        uploadId,
        extractedData,
        confidenceScores
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Parse worksheet error:', error);

    // Try to update status to failed if we have uploadId (from the already-parsed request body)
    if (uploadId) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        await supabase
          .from('worksheet_uploads')
          .update({
            processing_status: 'failed',
            error_message: error instanceof Error ? error.message : 'Unknown error'
          })
          .eq('id', uploadId);
      } catch (updateError) {
        console.error('Failed to update error status:', updateError);
      }
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
