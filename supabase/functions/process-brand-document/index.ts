import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import {
  generateGeminiContent,
  extractTextFromGeminiResponse,
} from "../_shared/geminiClient.ts";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";

// Simple, best-effort PDF text extractor (no OCR)
// Parses text tokens from PDF content streams as a fallback when AI extraction fails
function simplePdfExtract(buffer: ArrayBuffer): string {
  try {
    const raw = new TextDecoder('latin1').decode(new Uint8Array(buffer));
    const parts: string[] = [];

    // Split into text object blocks (BT ... ET)
    const blocks = raw.split(/\bBT\b/g);
    for (const block of blocks) {
      const segment = block.split(/\bET\b/)[0] ?? block;
      // Capture strings inside parentheses before Tj/TJ operators
      const regex = /\((?:\\.|[^\\])*?\)\s*(?:Tj|TJ)/gms;
      let m: RegExpExecArray | null;
      while ((m = regex.exec(segment)) !== null) {
        const token = m[0];
        const start = token.indexOf('(');
        const end = token.lastIndexOf(')');
        if (start >= 0 && end > start) {
          let text = token.slice(start + 1, end);
          // Unescape common sequences
          text = text
            .replace(/\\\)/g, ')')
            .replace(/\\\(/g, '(')
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '')
            .replace(/\\t/g, ' ')
            .replace(/\\(\d{3})/g, (_m, oct) => String.fromCharCode(parseInt(oct, 8)));
          parts.push(text);
        }
      }
      parts.push('\n');
    }

    const joined = parts.join('').replace(/\s{3,}/g, ' ').replace(/\n{3,}/g, '\n\n');
    return joined.trim();
  } catch (_) {
    return '';
  }
}

serve(async (req) => {
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;
  const corsHeaders = getCorsHeaders(req);

  let documentId: string | null = null;
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Parse request body with error handling
    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      console.error('[ERROR] Failed to parse request body:', parseError);
      return new Response(
        JSON.stringify({ error: 'Invalid request body. Expected JSON with documentId.' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    documentId = body?.documentId;

    if (!documentId) {
      return new Response(
        JSON.stringify({ error: 'documentId is required in request body' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`[CHECKPOINT] Processing document: ${documentId}`);

    // Get document details
    const { data: document, error: docError } = await supabase
      .from('brand_documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (docError || !document) {
      throw new Error(`Failed to fetch document: ${docError?.message}`);
    }

    console.log(`Document found: ${document.file_name}, type: ${document.file_type}`);

    // Update status to processing
    await supabase
      .from('brand_documents')
      .update({ 
        processing_status: 'processing',
        processing_stage: 'downloading'
      })
      .eq('id', documentId);

    // Download the file from storage (use full path, not just filename)
    console.log(`[CHECKPOINT] Downloading file from path: ${document.file_url}`);
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from('brand-documents')
      .download(document.file_url);

    if (downloadError || !fileData) {
      throw new Error(`Failed to download file: ${downloadError?.message}`);
    }

    console.log(`[CHECKPOINT] File downloaded, size: ${fileData.size} bytes`);

    let extractedText = '';

    // Extract text based on file type
    if (document.file_type === 'application/pdf') {
      console.log('[CHECKPOINT] Processing PDF with AI document understanding...');
      
      // Update stage
      await supabase
        .from('brand_documents')
        .update({ processing_stage: 'extracting_text' })
        .eq('id', documentId);
      
      let pdfArrayBuffer: ArrayBuffer | null = null;
      try {
        // Convert PDF to base64 for AI processing
        pdfArrayBuffer = await fileData.arrayBuffer();
        const bytes = new Uint8Array(pdfArrayBuffer);
        // Convert to base64 in chunks to avoid "Maximum call stack size exceeded"
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);
        
        console.log('Sending PDF to AI for text extraction...');
        
        const aiData = await generateGeminiContent({
          systemPrompt: 'You are a precise document transcription engine. Extract every readable piece of text from the provided PDF and return ONLY the raw text (no commentary). Preserve paragraph breaks when possible.',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Extract all text content from this PDF document.',
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:application/pdf;base64,${base64}`,
                  },
                },
              ],
            },
          ],
          maxOutputTokens: 8192,
          temperature: 0.1,
        });

        extractedText = extractTextFromGeminiResponse(aiData) || '';
        
        if (!extractedText) {
          throw new Error('No text extracted from PDF');
        }
        
        console.log(`[CHECKPOINT] PDF text extracted successfully: ${extractedText.length} characters`);
      } catch (pdfError) {
          console.error('[ERROR] PDF processing error:', pdfError);
          const errMsg = pdfError instanceof Error ? pdfError.message : 'Unknown PDF parsing error';

          // Fallback: try a lightweight PDF text extractor from raw bytes (no OCR)
          try {
            if (pdfArrayBuffer) {
              const fallback = simplePdfExtract(pdfArrayBuffer);
              if (fallback && fallback.length > 100) {
                extractedText = fallback;
                console.warn('Using simple PDF text extraction fallback (no OCR).');
              }
            }
          } catch (fallbackErr) {
            console.warn('Fallback PDF extractor failed:', fallbackErr);
          }
          
          // If still nothing meaningful, fail
          if (!extractedText || extractedText.length < 50) {
            throw new Error(`Failed to process PDF: ${errMsg}`);
          }
          console.warn('PDF processing had errors but continuing with extracted text');
        }
    } else if (
      document.file_type.includes('text') || 
      document.file_type.includes('markdown') ||
      document.file_name.toLowerCase().endsWith('.txt') ||
      document.file_name.toLowerCase().endsWith('.md') ||
      document.file_name.toLowerCase().endsWith('.markdown')
    ) {
      console.log('[CHECKPOINT] Processing text/markdown file...');
      extractedText = await fileData.text();
      console.log(`[CHECKPOINT] Text file read successfully: ${extractedText.length} characters`);
    } else {
      throw new Error(`Unsupported file type: ${document.file_type}. Supported: PDF, TXT, MD, Markdown`);
    }

    console.log(`Extracted ${extractedText.length} characters`);

    if (!extractedText || extractedText.length < 50) {
      throw new Error('Failed to extract meaningful content from document');
    }

    // Create content preview (first 500 chars)
    const contentPreview = extractedText.slice(0, 500) + (extractedText.length > 500 ? '...' : '');

    // Update stage
    await supabase
      .from('brand_documents')
      .update({ processing_stage: 'extracting_knowledge' })
      .eq('id', documentId);

    // NEW: Extract structured brand knowledge using AI
    console.log('[CHECKPOINT] Extracting structured brand knowledge with AI...');
    
    // Fetch organization's industry to guide extraction
    let organizationIndustry: string | undefined;
    try {
      const { data: orgData } = await supabase
        .from('organizations')
        .select('brand_config')
        .eq('id', document.organization_id)
        .maybeSingle();
      
      if (orgData?.brand_config) {
        const brandConfig = orgData.brand_config as any;
        // Try new industry_config structure first, then fall back to legacy industry field
        organizationIndustry = brandConfig.industry_config?.id || brandConfig.industry;
      }
      
      console.log(`Organization industry: ${organizationIndustry || 'not set'}`);
    } catch (orgError) {
      console.warn('Could not fetch organization industry:', orgError);
      // Continue without industry context
    }
    
    // Detect if this is a visual standards document
    const isVisualStandards = /visual|photo|image|lighting|color palette|aspect ratio|template|composition|forbidden element/i.test(extractedText.slice(0, 2000));
    
    let extractionData: any = null;
    let extractionError: any = null;
    
    // Wrap extraction in try-catch with timeout protection
    try {
      // Add timeout wrapper (60 seconds max)
      const extractionPromise = supabase.functions.invoke(
        'extract-brand-knowledge',
        {
          body: { 
            extractedText,
            organizationId: document.organization_id,
            documentName: document.file_name,
            detectVisualStandards: isVisualStandards,
            industry: organizationIndustry
          }
        }
      );
      
      // Race between extraction and timeout
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Extraction timeout after 60 seconds')), 60000)
      );
      
      const result = await Promise.race([extractionPromise, timeoutPromise]) as any;
      extractionData = result.data;
      extractionError = result.error;
    } catch (err) {
      console.error('Brand knowledge extraction failed with exception:', err);
      extractionError = err;
      // Continue with basic save, don't fail entire process
    }

    if (extractionError) {
      console.error('Brand knowledge extraction failed:', extractionError);
      console.log('Continuing with document processing despite extraction failure');
      // Continue with basic save, don't fail entire process
    } else if (extractionData?.success) {
      console.log('Successfully extracted structured brand knowledge');
      
      // Save structured knowledge to brand_knowledge table
      const knowledgeInserts = [];
      
      // Handle visual standards separately
      if (extractionData.isVisualStandards && extractionData.visualStandards) {
        console.log('Saving visual standards to brand_knowledge...');
        knowledgeInserts.push({
          organization_id: document.organization_id,
          document_id: documentId,
          knowledge_type: 'visual_standards',
          content: extractionData.visualStandards,
          is_active: true,
          version: 1
        });
      }
      
      if (extractionData.voice) {
        knowledgeInserts.push({
          organization_id: document.organization_id,
          document_id: documentId,
          knowledge_type: 'brand_voice',
          content: extractionData.voice,
          is_active: true,
          version: 1
        });
      }
      
      if (extractionData.vocabulary) {
        knowledgeInserts.push({
          organization_id: document.organization_id,
          document_id: documentId,
          knowledge_type: 'vocabulary',
          content: extractionData.vocabulary,
          is_active: true,
          version: 1
        });
      }
      
      if (extractionData.examples) {
        knowledgeInserts.push({
          organization_id: document.organization_id,
          document_id: documentId,
          knowledge_type: 'writing_examples',
          content: extractionData.examples,
          is_active: true,
          version: 1
        });
      }
      
      if (extractionData.structure) {
        knowledgeInserts.push({
          organization_id: document.organization_id,
          document_id: documentId,
          knowledge_type: 'structural_guidelines',
          content: extractionData.structure,
          is_active: true,
          version: 1
        });
      }
      
      // CRITICAL: Save brandIdentity (mission, values, target audience, positioning)
      if (extractionData.brandIdentity) {
          knowledgeInserts.push({
            organization_id: document.organization_id,
            document_id: documentId,
          knowledge_type: 'brandIdentity',
          content: extractionData.brandIdentity,
            is_active: true,
            version: 1
          });
        }
        
      // REMOVED: Old fragrance-specific categories (no longer extracted)
      // These were causing Madison to misinterpret brands as fragrance companies
      
      if (knowledgeInserts.length > 0) {
        const { error: insertError } = await supabase
          .from('brand_knowledge')
          .insert(knowledgeInserts);
        
        if (insertError) {
          console.error('Failed to save brand knowledge:', insertError);
        } else {
          console.log(`✓ Saved ${knowledgeInserts.length} structured brand knowledge entries`);
        }
      }
    } else {
      console.warn('Brand knowledge extraction returned no data');
    }

    // Update stage
    await supabase
      .from('brand_documents')
      .update({ processing_stage: 'saving' })
      .eq('id', documentId);

    // Save extracted content
    console.log('[CHECKPOINT] Saving extracted content to database');
    const { error: updateError } = await supabase
      .from('brand_documents')
      .update({
        extracted_content: extractedText,
        content_preview: contentPreview,
        processing_status: 'completed',
        processing_stage: null, // Clear stage when complete
      })
      .eq('id', documentId);

    if (updateError) {
      throw new Error(`Failed to save extracted content: ${updateError.message}`);
    }

    console.log(`[SUCCESS] Processed document: ${document.file_name}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        contentLength: extractedText.length,
        preview: contentPreview 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[ERROR] Processing document:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    // Update status to failed using documentId captured at start
    if (documentId) {
      try {
        await supabase
          .from('brand_documents')
          .update({ 
            processing_status: 'failed',
            processing_stage: null,
            content_preview: `Error: ${errorMessage}`
          })
          .eq('id', documentId);
        
        console.log(`[CHECKPOINT] Marked document ${documentId} as failed`);
      } catch (updateError) {
        console.error('[ERROR] Failed to update error status:', updateError);
      }
    } else {
      console.error('[ERROR] No documentId available to mark as failed');
    }

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
