import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@1.2.2";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";


serve(async (req) => {
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;
  const corsHeaders = getCorsHeaders(req);
  }

  let docIdForFail: string | null = null;

  try {
    const { documentId } = await req.json();
    if (!documentId) throw new Error("documentId is required");
    docIdForFail = documentId;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("Processing Madison training document:", documentId);

    // Fetch document
    const { data: doc, error: docErr } = await supabase
      .from("madison_training_documents")
      .select("*")
      .eq("id", documentId)
      .single();

    if (docErr || !doc) throw new Error(`Failed to load document: ${docErr?.message}`);

    // Mark as processing
    await supabase
      .from("madison_training_documents")
      .update({ processing_status: "processing" })
      .eq("id", documentId);

    // Extract the storage path from file_url (handle both full URLs and paths)
    let filePath: string = doc.file_url;
    
    // If file_url is a full URL, extract just the path after the bucket name
    if (filePath.includes('storage/v1/object/')) {
      const match = filePath.match(/madison-training-docs\/(.+)$/);
      if (match && match[1]) {
        filePath = decodeURIComponent(match[1]);
      }
    }
    
    console.log("Downloading from bucket path:", filePath);
    const { data: fileData, error: dlErr } = await supabase
      .storage
      .from("madison-training-docs")
      .download(filePath);

    if (dlErr || !fileData) {
      console.error("Download error details:", dlErr);
      throw new Error(`Failed to download file: ${dlErr?.message || JSON.stringify(dlErr)}`);
    }

    let extracted: string;

    // Handle different file types
    if (doc.file_type === "application/pdf") {
    // Extract text from PDF using Deno-native library
    console.log("Parsing PDF to extract text...");
    const arrayBuffer = await fileData.arrayBuffer();
    const pdfBuffer = new Uint8Array(arrayBuffer);
    
    // Load PDF and extract text using unpdf
    const pdf = await getDocumentProxy(pdfBuffer);
    const { text } = await extractText(pdf, { mergePages: true });
      extracted = text;
    
    if (!extracted || extracted.trim().length < 20) {
      throw new Error("No text content found in PDF");
    }
    
    console.log("PDF text extracted successfully. Characters:", extracted.length);
    } else if (doc.file_type.includes('text') || doc.file_type.includes('markdown') || 
               doc.file_name.toLowerCase().endsWith('.txt') || 
               doc.file_name.toLowerCase().endsWith('.md') ||
               doc.file_name.toLowerCase().endsWith('.markdown')) {
      // Direct text file - read as text (most accurate, no extraction needed)
      console.log("Reading text file directly...");
      extracted = await fileData.text();
      
      if (!extracted || extracted.trim().length < 20) {
        throw new Error("No text content found in file");
      }
      
      console.log("Text file read successfully. Characters:", extracted.length);
    } else {
      throw new Error(`Unsupported file type: ${doc.file_type}. Supported: PDF, TXT, MD, Markdown`);
    }

    // Save extracted content
    await supabase
      .from("madison_training_documents")
      .update({ 
        extracted_content: extracted, 
        processing_status: "completed", 
        updated_at: new Date().toISOString() 
      })
      .eq("id", documentId);

    console.log("Document processing complete!");

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("process-madison-training-document error:", e);

    // Attempt to mark as failed
    try {
      if (docIdForFail) {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        await supabase
          .from("madison_training_documents")
          .update({ processing_status: "failed" })
          .eq("id", docIdForFail);
      }
    } catch (_) {}

    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
