/**
 * Canvas Sync Edge Function
 *
 * Handles bidirectional sync between Sanity Canvas and Madison Studio
 *
 * Actions:
 * - list: List available Canvas documents
 * - import: Import Canvas document to Madison format
 * - push: Push Madison content to Canvas
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@sanity/client@6.8.6";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";

interface SanityConfig {
  projectId: string;
  dataset: string;
  token: string;
  apiVersion: string;
}

interface CanvasSyncRequest {
  action: "list" | "import" | "push";
  documentId?: string;
  content?: string;
  title?: string;
  contentType?: string;
  canvasDocumentType?: string;
}

/**
 * Get Sanity configuration from Supabase secrets
 */
async function getSanityConfig(): Promise<SanityConfig> {
  const projectId = Deno.env.get("SANITY_PROJECT_ID");
  const dataset = Deno.env.get("SANITY_DATASET") || "production";
  const token = Deno.env.get("SANITY_API_TOKEN");
  const apiVersion = Deno.env.get("SANITY_API_VERSION") || "2024-01-01";

  if (!projectId || !token) {
    throw new Error(
      "Missing Sanity configuration. Set SANITY_PROJECT_ID and SANITY_API_TOKEN in Supabase secrets."
    );
  }

  return { projectId, dataset, token, apiVersion };
}

/**
 * Convert Canvas blocks to plain text/Markdown
 */
function canvasBlocksToText(blocks: any[]): string {
  if (!blocks || blocks.length === 0) return "";

  const textParts: string[] = [];

  for (const block of blocks) {
    if (block._type === "canvas.text" || block._type === "block") {
      // Extract text from block content
      if (block.children) {
        for (const child of block.children) {
          if (child.text) {
            textParts.push(child.text);
          }
        }
      }
      if (block.text) {
        textParts.push(block.text);
      }
    } else if (block._type === "canvas.heading") {
      const level = block.level || 1;
      const prefix = "#".repeat(level) + " ";
      if (block.text) {
        textParts.push(prefix + block.text);
      }
    } else if (block._type === "canvas.paragraph") {
      if (block.text) {
        textParts.push(block.text);
      }
    }
  }

  return textParts.join("\n\n");
}

/**
 * Convert Canvas document to Madison format
 */
function canvasToMadison(canvasDoc: any): { content: string; title: string; metadata: any } {
  const title = canvasDoc.title || canvasDoc.name || "Imported from Canvas";

  // Extract content from blocks
  let content = "";
  if (canvasDoc.blocks) {
    content = canvasBlocksToText(canvasDoc.blocks);
  } else if (canvasDoc.content) {
    // Handle different content structures
    if (Array.isArray(canvasDoc.content)) {
      content = canvasBlocksToText(canvasDoc.content);
    } else if (typeof canvasDoc.content === "string") {
      content = canvasDoc.content;
    }
  }

  // Extract metadata
  const metadata = {
    canvasId: canvasDoc._id,
    canvasType: canvasDoc._type,
    importedAt: new Date().toISOString(),
    ...canvasDoc.metadata,
  };

  return { content, title, metadata };
}

/**
 * Convert Madison content to Canvas blocks
 */
function madisonToCanvasBlocks(content: string): any[] {
  if (!content) return [];

  const lines = content.split("\n");
  const blocks: any[] = [];
  let currentParagraph: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("# ")) {
      // H1
      if (currentParagraph.length > 0) {
        blocks.push({
          _type: "canvas.paragraph",
          _key: crypto.randomUUID().replace(/-/g, "").substring(0, 10),
          text: currentParagraph.join(" "),
        });
        currentParagraph = [];
      }
      blocks.push({
        _type: "canvas.heading",
        _key: crypto.randomUUID().replace(/-/g, "").substring(0, 10),
        level: 1,
        text: trimmed.substring(2),
      });
    } else if (trimmed.startsWith("## ")) {
      // H2
      if (currentParagraph.length > 0) {
        blocks.push({
          _type: "canvas.paragraph",
          _key: crypto.randomUUID().replace(/-/g, "").substring(0, 10),
          text: currentParagraph.join(" "),
        });
        currentParagraph = [];
      }
      blocks.push({
        _type: "canvas.heading",
        _key: crypto.randomUUID().replace(/-/g, "").substring(0, 10),
        level: 2,
        text: trimmed.substring(3),
      });
    } else if (trimmed.startsWith("### ")) {
      // H3
      if (currentParagraph.length > 0) {
        blocks.push({
          _type: "canvas.paragraph",
          _key: crypto.randomUUID().replace(/-/g, "").substring(0, 10),
          text: currentParagraph.join(" "),
        });
        currentParagraph = [];
      }
      blocks.push({
        _type: "canvas.heading",
        _key: crypto.randomUUID().replace(/-/g, "").substring(0, 10),
        level: 3,
        text: trimmed.substring(4),
      });
    } else if (trimmed === "") {
      // Empty line
      if (currentParagraph.length > 0) {
        blocks.push({
          _type: "canvas.paragraph",
          _key: crypto.randomUUID().replace(/-/g, "").substring(0, 10),
          text: currentParagraph.join(" "),
        });
        currentParagraph = [];
      }
    } else {
      currentParagraph.push(trimmed);
    }
  }

  // Add remaining paragraph
  if (currentParagraph.length > 0) {
    blocks.push({
      _type: "canvas.paragraph",
      _key: crypto.randomUUID().replace(/-/g, "").substring(0, 10),
      text: currentParagraph.join(" "),
    });
  }

  return blocks.length > 0 ? blocks : [
    {
      _type: "canvas.paragraph",
      _key: crypto.randomUUID().replace(/-/g, "").substring(0, 10),
      text: content,
    },
  ];
}

serve(async (req) => {
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const {
      action,
      documentId,
      content,
      title,
      contentType,
      canvasDocumentType = "canvas.document",
    }: CanvasSyncRequest = await req.json();

    if (!action) {
      return new Response(
        JSON.stringify({ error: "Missing required field: action" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get Sanity config
    const sanityConfig = await getSanityConfig();

    // Initialize Sanity client
    const sanityClient = createClient({
      projectId: sanityConfig.projectId,
      dataset: sanityConfig.dataset,
      token: sanityConfig.token,
      apiVersion: sanityConfig.apiVersion,
      useCdn: false,
    });

    if (action === "list") {
      // List Canvas documents
      // Query for documents that might be Canvas documents
      // This is a flexible query - adjust based on your Canvas schema
      const query = `*[_type match "*canvas*" || _type == "canvas.document" || _type == "canvas"] | order(_createdAt desc) [0...50] {
        _id,
        _type,
        title,
        name,
        blocks,
        content,
        metadata,
        _createdAt
      }`;

      const documents = await sanityClient.fetch(query);

      return new Response(
        JSON.stringify({
          success: true,
          documents: documents || [],
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } else if (action === "import") {
      // Import Canvas document to Madison format
      if (!documentId) {
        return new Response(
          JSON.stringify({ error: "Missing required field: documentId" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Fetch Canvas document
      const canvasDoc = await sanityClient.getDocument(documentId);

      if (!canvasDoc) {
        return new Response(
          JSON.stringify({ error: `Canvas document not found: ${documentId}` }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Convert to Madison format
      const madisonContent = canvasToMadison(canvasDoc);

      return new Response(
        JSON.stringify({
          success: true,
          ...madisonContent,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } else if (action === "push") {
      // Push Madison content to Canvas
      if (!content || !title) {
        return new Response(
          JSON.stringify({ error: "Missing required fields: content, title" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Convert Madison content to Canvas blocks
      const blocks = madisonToCanvasBlocks(content);

      // Create Canvas document
      const canvasDoc = {
        _type: canvasDocumentType,
        title,
        blocks,
        metadata: {
          madisonContentType: contentType,
          syncedAt: new Date().toISOString(),
        },
      };

      // Create document in Sanity
      const result = await sanityClient.create(canvasDoc);

      return new Response(
        JSON.stringify({
          success: true,
          canvasDocumentId: result._id,
          canvasDocument: result,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } else {
      return new Response(
        JSON.stringify({ error: `Unknown action: ${action}` }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
  } catch (error: any) {
    console.error("Error in Canvas sync:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Failed to sync with Canvas",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});



