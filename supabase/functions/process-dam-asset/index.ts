import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";


interface ProcessRequest {
  assetId: string;
  organizationId: string;
  generateThumbnail?: boolean;
  analyzeWithAI?: boolean;
  generateEmbedding?: boolean;
}

interface ImageDimensions {
  width: number;
  height: number;
}

/**
 * Fetch image and get its dimensions
 */
async function getImageDimensions(imageUrl: string): Promise<ImageDimensions | null> {
  try {
    // For now, we'll use a simple approach
    // In production, you might use a service like sharp or imagemagick
    const response = await fetch(imageUrl);
    if (!response.ok) return null;
    
    const buffer = await response.arrayBuffer();
    
    // Simple PNG/JPEG dimension detection
    const view = new DataView(buffer);
    
    // Check for PNG
    if (view.getUint8(0) === 0x89 && view.getUint8(1) === 0x50) {
      // PNG: dimensions at bytes 16-23
      return {
        width: view.getUint32(16, false),
        height: view.getUint32(20, false),
      };
    }
    
    // Check for JPEG
    if (view.getUint8(0) === 0xFF && view.getUint8(1) === 0xD8) {
      // JPEG: need to parse markers
      let offset = 2;
      while (offset < buffer.byteLength) {
        if (view.getUint8(offset) !== 0xFF) break;
        const marker = view.getUint8(offset + 1);
        
        // SOF markers contain dimensions
        if (marker >= 0xC0 && marker <= 0xC3) {
          return {
            height: view.getUint16(offset + 5, false),
            width: view.getUint16(offset + 7, false),
          };
        }
        
        const length = view.getUint16(offset + 2, false);
        offset += 2 + length;
      }
    }
    
    return null;
  } catch (error) {
    console.warn('Failed to get image dimensions:', error);
    return null;
  }
}

/**
 * Analyze image using AI (Gemini Vision or OpenAI)
 */
async function analyzeImageWithAI(
  imageUrl: string,
  geminiKey?: string
): Promise<Record<string, unknown> | null> {
  if (!geminiKey) {
    console.warn('No Gemini API key available for image analysis');
    return null;
  }

  try {
    // Fetch image as base64
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      console.warn('Failed to fetch image for analysis');
      return null;
    }
    
    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Image = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));
    const mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';

    // Call Gemini Vision API
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                text: `Analyze this image and provide a JSON response with the following structure:
{
  "description": "A concise description of what's in the image (1-2 sentences)",
  "detected_objects": ["list", "of", "main", "objects"],
  "dominant_colors": ["#hex1", "#hex2", "#hex3"],
  "sentiment": "one word describing the mood/feel (e.g., luxury, playful, professional, minimalist)",
  "suggested_tags": ["relevant", "tags", "for", "searchability"],
  "text_content": "any text visible in the image, or null if none",
  "image_type": "product|lifestyle|editorial|portrait|abstract|document|other",
  "quality_score": 1-100 rating of image quality
}

Respond ONLY with valid JSON, no markdown or explanation.`
              },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Image
                }
              }
            ]
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1024,
          }
        })
      }
    );

    if (!response.ok) {
      console.warn('Gemini API error:', response.status);
      return null;
    }

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!text) {
      console.warn('No text in Gemini response');
      return null;
    }

    // Parse JSON from response (handle potential markdown wrapping)
    let jsonText = text.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.slice(7);
    }
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.slice(3);
    }
    if (jsonText.endsWith('```')) {
      jsonText = jsonText.slice(0, -3);
    }

    return JSON.parse(jsonText.trim());
  } catch (error) {
    console.error('AI analysis error:', error);
    return null;
  }
}

/**
 * Generate embedding for semantic search
 */
async function generateEmbedding(
  text: string,
  openaiKey?: string
): Promise<number[] | null> {
  if (!openaiKey || !text) {
    return null;
  }

  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-ada-002',
        input: text.slice(0, 8000), // Token limit safety
      }),
    });

    if (!response.ok) {
      console.warn('OpenAI embedding error:', response.status);
      return null;
    }

    const result = await response.json();
    return result.data?.[0]?.embedding || null;
  } catch (error) {
    console.error('Embedding generation error:', error);
    return null;
  }
}

serve(async (req) => {
  // Handle CORS
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;
  const corsHeaders = getCorsHeaders(req);
  }

  try {
    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get API keys
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    // Parse request
    const body: ProcessRequest = await req.json();
    const { 
      assetId, 
      organizationId,
      generateThumbnail = true,
      analyzeWithAI = true,
      generateEmbedding: shouldGenerateEmbedding = true,
    } = body;

    if (!assetId || !organizationId) {
      return new Response(
        JSON.stringify({ success: false, error: 'assetId and organizationId are required' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`🔄 Processing DAM asset: ${assetId}`);

    // Fetch asset
    const { data: asset, error: assetError } = await supabase
      .from('dam_assets')
      .select('*')
      .eq('id', assetId)
      .single();

    if (assetError || !asset) {
      console.error('Asset not found:', assetError);
      return new Response(
        JSON.stringify({ success: false, error: 'Asset not found' }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const updates: Record<string, unknown> = {};
    const isImage = asset.file_type.startsWith('image/');

    // 1. Get image dimensions if applicable
    if (isImage) {
      const dimensions = await getImageDimensions(asset.file_url);
      if (dimensions) {
        updates.metadata = {
          ...asset.metadata,
          dimensions,
        };
        console.log(`📐 Got dimensions: ${dimensions.width}x${dimensions.height}`);
      }
    }

    // 2. Generate thumbnail (for images, we use the original for now)
    // In production, you'd use a service like Cloudflare Images or imgix
    if (generateThumbnail && isImage) {
      // For now, use original URL with transformation params if available
      // You can integrate with Supabase's image transformation or external service
      updates.thumbnail_url = asset.file_url;
      console.log(`🖼️ Thumbnail set`);
    }

    // 3. AI Analysis
    if (analyzeWithAI && isImage && geminiKey) {
      console.log(`🤖 Running AI analysis...`);
      const analysis = await analyzeImageWithAI(asset.file_url, geminiKey);
      if (analysis) {
        updates.ai_analysis = analysis;
        
        // Auto-add suggested tags
        if (analysis.suggested_tags && Array.isArray(analysis.suggested_tags)) {
          const existingTags = asset.tags || [];
          const newTags = [...new Set([...existingTags, ...analysis.suggested_tags])];
          updates.tags = newTags.slice(0, 20); // Limit to 20 tags
        }
        
        // Auto-categorize based on image_type
        if (analysis.image_type && !asset.categories?.length) {
          updates.categories = [analysis.image_type as string];
        }
        
        console.log(`✅ AI analysis complete`);
      }
    }

    // 4. Generate embedding for semantic search
    if (shouldGenerateEmbedding && openaiKey) {
      // Create text representation for embedding
      const textParts = [
        asset.name,
        ...(asset.tags || []),
        ...(asset.categories || []),
      ];
      
      // Add AI analysis text if available
      const analysis = updates.ai_analysis || asset.ai_analysis;
      if (analysis) {
        if (analysis.description) textParts.push(analysis.description);
        if (analysis.detected_objects) textParts.push(...analysis.detected_objects);
        if (analysis.text_content) textParts.push(analysis.text_content);
      }
      
      const embeddingText = textParts.filter(Boolean).join(' ');
      
      if (embeddingText.trim()) {
        console.log(`🧮 Generating embedding...`);
        const embedding = await generateEmbedding(embeddingText, openaiKey);
        if (embedding) {
          updates.embedding = embedding;
          console.log(`✅ Embedding generated`);
        }
      }
    }

    // 5. Update status to active
    updates.status = 'active';

    // Update asset
    const { error: updateError } = await supabase
      .from('dam_assets')
      .update(updates)
      .eq('id', assetId);

    if (updateError) {
      console.error('Failed to update asset:', updateError);
      return new Response(
        JSON.stringify({ success: false, error: `Failed to update asset: ${updateError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log activity
    await supabase
      .from('dam_activity_log')
      .insert({
        organization_id: organizationId,
        asset_id: assetId,
        action: 'ai_analyze',
        actor_type: 'system',
        context: {
          generated_thumbnail: !!updates.thumbnail_url,
          generated_analysis: !!updates.ai_analysis,
          generated_embedding: !!updates.embedding,
        },
      });

    console.log(`✅ Asset processing complete: ${assetId}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed: {
          thumbnail: !!updates.thumbnail_url,
          analysis: !!updates.ai_analysis,
          embedding: !!updates.embedding,
          dimensions: !!(updates.metadata as Record<string, unknown>)?.dimensions,
        }
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("❌ Processing error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
