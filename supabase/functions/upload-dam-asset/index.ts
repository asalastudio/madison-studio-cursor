import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";


interface UploadRequest {
  organizationId: string;
  folderId?: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileData: string; // Base64 encoded file data
  tags?: string[];
  categories?: string[];
  metadata?: Record<string, unknown>;
  sourceType?: 'upload' | 'generated' | 'external_sync' | 'derivative' | 'system';
  sourceRef?: Record<string, unknown>;
}

interface UploadResponse {
  success: boolean;
  asset?: {
    id: string;
    name: string;
    file_url: string;
    thumbnail_url?: string;
    folder_id?: string;
  };
  error?: string;
}

/**
 * Get file extension from MIME type or filename
 */
function getFileExtension(fileName: string, mimeType: string): string {
  // Try to get from filename first
  const parts = fileName.split('.');
  if (parts.length > 1) {
    return parts.pop()?.toLowerCase() || '';
  }
  
  // Fallback to MIME type mapping
  const mimeToExt: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'application/pdf': 'pdf',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  };
  
  return mimeToExt[mimeType] || 'bin';
}

/**
 * Generate a unique filename with timestamp
 */
function generateUniqueFileName(originalName: string, extension: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const sanitizedName = originalName
    .replace(/\.[^/.]+$/, '') // Remove extension
    .replace(/[^a-zA-Z0-9-_]/g, '-') // Replace special chars
    .substring(0, 50); // Limit length
  
  return `${sanitizedName}-${timestamp}-${random}.${extension}`;
}

/**
 * Validate file upload
 */
function validateUpload(req: UploadRequest): { valid: boolean; error?: string } {
  // Required fields
  if (!req.organizationId) {
    return { valid: false, error: 'Organization ID is required' };
  }
  if (!req.fileName) {
    return { valid: false, error: 'File name is required' };
  }
  if (!req.fileType) {
    return { valid: false, error: 'File type is required' };
  }
  if (!req.fileData) {
    return { valid: false, error: 'File data is required' };
  }
  
  // File size limit (50MB)
  const maxSize = 50 * 1024 * 1024;
  if (req.fileSize > maxSize) {
    return { valid: false, error: 'File size exceeds 50MB limit' };
  }
  
  // Allowed file types
  const allowedTypes = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'video/mp4', 'video/quicktime', 'video/webm',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];
  
  if (!allowedTypes.includes(req.fileType)) {
    return { valid: false, error: `File type ${req.fileType} is not allowed` };
  }
  
  return { valid: true };
}

serve(async (req) => {
  // Handle CORS
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;
  const corsHeaders = getCorsHeaders(req);
  }

  try {
    // Get authorization
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Also create a client with the user's token for RLS
    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } }
    });

    // Get user from token
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body: UploadRequest = await req.json();
    
    // Validate
    const validation = validateUpload(body);
    if (!validation.valid) {
      return new Response(
        JSON.stringify({ success: false, error: validation.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user has access to organization
    const { data: membership, error: membershipError } = await supabaseUser
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('organization_id', body.organizationId)
      .single();

    if (membershipError || !membership) {
      return new Response(
        JSON.stringify({ success: false, error: "Access denied to organization" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`📤 Uploading DAM asset for org ${body.organizationId}:`, body.fileName);

    // Decode base64 file data
    const fileBuffer = Uint8Array.from(atob(body.fileData), c => c.charCodeAt(0));
    
    // Generate storage path
    const extension = getFileExtension(body.fileName, body.fileType);
    const uniqueFileName = generateUniqueFileName(body.fileName, extension);
    const storagePath = `${body.organizationId}/${uniqueFileName}`;

    // Upload to storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('dam-assets')
      .upload(storagePath, fileBuffer, {
        contentType: body.fileType,
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      console.error('❌ Storage upload error:', uploadError);
      return new Response(
        JSON.stringify({ success: false, error: `Storage upload failed: ${uploadError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('dam-assets')
      .getPublicUrl(storagePath);

    // Determine folder - use provided folder or get inbox
    let folderId = body.folderId;
    if (!folderId) {
      // Get or create inbox folder
      const { data: inboxFolder } = await supabase
        .from('dam_folders')
        .select('id')
        .eq('organization_id', body.organizationId)
        .eq('folder_type', 'inbox')
        .single();
      
      folderId = inboxFolder?.id || null;
    }

    // Create DAM asset record
    const assetData = {
      organization_id: body.organizationId,
      folder_id: folderId,
      name: body.fileName,
      file_type: body.fileType,
      file_extension: extension,
      file_size: body.fileSize,
      file_url: publicUrl,
      source_type: body.sourceType || 'upload',
      source_ref: body.sourceRef || null,
      tags: body.tags || [],
      categories: body.categories || [],
      metadata: {
        ...body.metadata,
        original_name: body.fileName,
        storage_path: storagePath,
      },
      status: 'processing', // Will be updated after thumbnail generation
      uploaded_by: user.id,
    };

    const { data: asset, error: assetError } = await supabase
      .from('dam_assets')
      .insert(assetData)
      .select()
      .single();

    if (assetError) {
      console.error('❌ Asset record creation error:', assetError);
      // Try to clean up uploaded file
      await supabase.storage.from('dam-assets').remove([storagePath]);
      return new Response(
        JSON.stringify({ success: false, error: `Failed to create asset record: ${assetError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log activity
    await supabase
      .from('dam_activity_log')
      .insert({
        organization_id: body.organizationId,
        asset_id: asset.id,
        folder_id: folderId,
        action: 'upload',
        actor_type: 'user',
        actor_id: user.id,
        actor_name: user.email,
        context: {
          file_name: body.fileName,
          file_type: body.fileType,
          file_size: body.fileSize,
        },
      });

    // Trigger async processing (thumbnail generation, AI analysis)
    // This is done via a separate edge function call to not block the response
    try {
      const processUrl = `${supabaseUrl}/functions/v1/process-dam-asset`;
      fetch(processUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assetId: asset.id,
          organizationId: body.organizationId,
        }),
      }).catch(err => {
        console.warn('⚠️ Failed to trigger async processing:', err);
      });
    } catch (err) {
      console.warn('⚠️ Failed to trigger async processing:', err);
    }

    console.log(`✅ DAM asset created: ${asset.id}`);

    const response: UploadResponse = {
      success: true,
      asset: {
        id: asset.id,
        name: asset.name,
        file_url: asset.file_url,
        folder_id: asset.folder_id,
      },
    };

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("❌ Upload error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
