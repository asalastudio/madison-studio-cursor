/**
 * Push to Sanity Edge Function
 *
 * Pushes Madison Studio content to Sanity.io
 *
 * Usage:
 * POST /functions/v1/push-to-sanity
 * {
 *   contentId: string,
 *   contentType: 'master' | 'derivative' | 'output',
 *   sanityDocumentType: 'post' | 'article' | 'emailCampaign' | 'socialPost',
 *   publish: boolean (optional, default: false)
 * }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@sanity/client@6.8.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SanityConfig {
  projectId: string;
  dataset: string;
  token: string;
  apiVersion: string;
  /** Studio URL for "Open in Studio" links (optional). */
  studioUrl?: string;
  /**
   * Tarife Attar-specific behavior (journalEntry aliasing, location
   * auto-detection from title). Defaults to `true` for orgs that rely on
   * env-var fallback (historical behavior). Brand-config-driven orgs must
   * opt in explicitly via `brand_config.sanity.legacyTarifeFeatures = true`.
   */
  legacyTarifeFeatures: boolean;
  /**
   * Optional override for the Sanity document type. If set, replaces the
   * client-supplied sanityDocumentType. Useful when a new client's schema
   * uses `post` or `blogPost` instead of Tarife's `journalEntry`.
   */
  documentType?: string;
  /** Which fields to populate with the featured image asset reference. */
  imageFieldNames?: string[];
  /** Which fields to populate with the linked product reference. */
  productReferenceFieldNames?: string[];
}

interface PushRequest {
  contentId: string;
  contentType: "master" | "derivative" | "output";
  sanityDocumentType: string;
  organizationId?: string;
  linkedProductId?: string;
  linkedProductName?: string;
  publish?: boolean;
  fieldMapping?: Record<string, string>; // Custom field mapping
  category?: string; // Journal category (field-notes, behind-the-blend, etc.)
}

/**
 * Fetch `brand_config.sanity` for an org, if set. Returns null on any
 * failure (network, missing, malformed) so the caller can fall back to env.
 */
async function fetchOrgSanityOverrides(
  supabaseUrl: string,
  supabaseKey: string,
  organizationId: string,
): Promise<Partial<SanityConfig> | null> {
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/organizations?id=eq.${organizationId}&select=brand_config`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      },
    );
    if (!res.ok) return null;
    const rows = await res.json();
    const sanity = rows?.[0]?.brand_config?.sanity;
    if (!sanity || typeof sanity !== "object") return null;
    return {
      projectId: sanity.projectId ?? sanity.project_id,
      dataset: sanity.dataset,
      token: sanity.writeToken ?? sanity.write_token ?? sanity.token,
      apiVersion: sanity.apiVersion ?? sanity.api_version,
      studioUrl: sanity.studioUrl ?? sanity.studio_url,
      legacyTarifeFeatures:
        typeof sanity.legacyTarifeFeatures === "boolean"
          ? sanity.legacyTarifeFeatures
          : false,
      documentType: sanity.documentType ?? sanity.document_type,
      imageFieldNames: Array.isArray(sanity.imageFieldNames)
        ? sanity.imageFieldNames
        : undefined,
      productReferenceFieldNames: Array.isArray(sanity.productReferenceFieldNames)
        ? sanity.productReferenceFieldNames
        : undefined,
    };
  } catch (err) {
    console.warn("[push-to-sanity] Failed to read brand_config.sanity:", err);
    return null;
  }
}

/**
 * Resolve Sanity configuration: per-org override from brand_config.sanity
 * first, then environment variables. No hardcoded project IDs — if both
 * sources are missing the required fields we throw so nothing accidentally
 * publishes to the wrong project.
 */
async function getSanityConfig(
  supabaseUrl: string,
  supabaseKey: string,
  organizationId?: string,
): Promise<SanityConfig> {
  const orgOverrides = organizationId
    ? await fetchOrgSanityOverrides(supabaseUrl, supabaseKey, organizationId)
    : null;

  const projectId = orgOverrides?.projectId || Deno.env.get("SANITY_PROJECT_ID");
  const dataset =
    orgOverrides?.dataset || Deno.env.get("SANITY_DATASET") || "production";
  const token = orgOverrides?.token || Deno.env.get("SANITY_WRITE_TOKEN");
  const apiVersion =
    orgOverrides?.apiVersion ||
    Deno.env.get("SANITY_API_VERSION") ||
    "2024-01-01";

  if (!projectId || !token) {
    throw new Error(
      "Sanity is not configured for this organization. Go to Settings → Integrations → Sanity and paste the project ID and write token, or set SANITY_PROJECT_ID / SANITY_WRITE_TOKEN in Supabase secrets.",
    );
  }

  // Default Tarife-specific behaviors ON only when the org has no
  // explicit brand_config.sanity (env-fallback path = legacy Tarife).
  // Orgs with their own config are opt-in.
  const legacyTarifeFeatures =
    orgOverrides?.legacyTarifeFeatures ?? !orgOverrides;

  return {
    projectId,
    dataset,
    token,
    apiVersion,
    studioUrl: orgOverrides?.studioUrl,
    legacyTarifeFeatures,
    documentType: orgOverrides?.documentType,
    imageFieldNames: orgOverrides?.imageFieldNames,
    productReferenceFieldNames: orgOverrides?.productReferenceFieldNames,
  };
}

/**
 * Convert Markdown to Sanity Portable Text blocks
 * Simple implementation - can be enhanced with full markdown parser
 */
function markdownToPortableText(markdown: string): any[] {
  if (!markdown) return [];

  // Remove potential HTML tags if any (very simple)
  const cleanMarkdown = markdown.replace(/<[^>]*>/g, "");
  const lines = cleanMarkdown.split("\n");
  const blocks: any[] = [];
  let currentParagraph: string[] = [];

  const flushParagraph = () => {
    if (currentParagraph.length > 0) {
      const text = currentParagraph.join(" ");
      blocks.push(buildTextBlock(text, "normal"));
      currentParagraph = [];
    }
  };

  const buildTextBlock = (text: string, style: string) => {
    // Basic bold/italic parsing
    // This is still simple but handles standard markdown patterns
    const children = [];
    let lastIndex = 0;

    // Pattern for bold (** or __) and italic (* or _)
    // Simplified regex for basic cases
    const regex = /(\*\*|__)(.*?)\1|(\*|_)(.*?)\3/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      // Add plain text before match
      if (match.index > lastIndex) {
        children.push({
          _type: "span",
          _key: crypto.randomUUID().substring(0, 10),
          text: text.substring(lastIndex, match.index),
          marks: [],
        });
      }

      const isBold = match[1] === "**" || match[1] === "__";
      const isItalic = match[3] === "*" || match[3] === "_";
      const content = isBold ? match[2] : match[4];

      children.push({
        _type: "span",
        _key: crypto.randomUUID().substring(0, 10),
        text: content,
        marks: isBold ? ["strong"] : isItalic ? ["em"] : [],
      });

      lastIndex = regex.lastIndex;
    }

    // Add remaining plain text
    if (lastIndex < text.length) {
      children.push({
        _type: "span",
        _key: crypto.randomUUID().substring(0, 10),
        text: text.substring(lastIndex),
        marks: [],
      });
    }

    return {
      _type: "block",
      _key: crypto.randomUUID().substring(0, 10),
      style: style,
      children: children.length > 0 ? children : [{
        _type: "span",
        _key: crypto.randomUUID().substring(0, 10),
        text: text,
        marks: [],
      }],
    };
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("# ")) {
      flushParagraph();
      blocks.push(buildTextBlock(trimmed.substring(2), "h1"));
    } else if (trimmed.startsWith("## ")) {
      flushParagraph();
      blocks.push(buildTextBlock(trimmed.substring(3), "h2"));
    } else if (trimmed.startsWith("### ")) {
      flushParagraph();
      blocks.push(buildTextBlock(trimmed.substring(4), "h3"));
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      flushParagraph();
      blocks.push({
        ...buildTextBlock(trimmed.substring(2), "normal"),
        listItem: "bullet",
        level: 1,
      });
    } else if (/^\d+\. /.test(trimmed)) {
      flushParagraph();
      blocks.push({
        ...buildTextBlock(trimmed.replace(/^\d+\. /, ""), "normal"),
        listItem: "number",
        level: 1,
      });
    } else if (trimmed === "") {
      flushParagraph();
    } else {
      currentParagraph.push(trimmed);
    }
  }

  flushParagraph();

  return blocks.length > 0 ? blocks : [buildTextBlock(markdown, "normal")];
}

/**
 * Transform Madison content to Sanity document
 */
async function transformContentToSanity(
  content: any,
  contentType: string,
  sanityDocumentType: string,
  sanityClient: any,
  sanityConfig: SanityConfig,
  extraMetadata?: any,
  linkedProduct?: { id: string; name: string; sanityId: string }
): Promise<any> {
  // Document type resolution:
  // 1. Per-org override (brand_config.sanity.documentType) wins.
  // 2. Legacy Tarife aliasing (journalEntry) applies only when the org
  //    falls through to the env-var config path.
  // 3. Otherwise the client-supplied type is used verbatim.
  let finalDocumentType = sanityConfig.documentType || sanityDocumentType;
  if (
    !sanityConfig.documentType &&
    sanityConfig.legacyTarifeFeatures &&
    ['fieldJournal', 'journal', 'post', 'blog_article', 'article'].includes(sanityDocumentType)
  ) {
    finalDocumentType = 'journalEntry';
    console.log(`[push-to-sanity] [legacy-tarife] Aliasing '${sanityDocumentType}' to 'journalEntry' to match schema.`);
  }

  const baseDoc: any = {
    _type: finalDocumentType,
    _id: `madison-${content.id}`,
  };

  if (extraMetadata) {
    Object.assign(baseDoc, extraMetadata);
  }

  const mappings: Record<string, any> = {
    title: content.title || "Untitled",
    madisonId: content.id,
    madisonContentType: contentType,
    madisonSyncStatus: "synced",
    madisonSyncedAt: new Date().toISOString(),
  };

  // Add content based on document type
  if (finalDocumentType === "journalEntry" || finalDocumentType === "emailCampaign" /* Fallback for legacy checks */) {
    // RESTORED INBOX METADATA & GENERATION SOURCE:
    mappings.status = 'inbox';
    mappings.state = 'inbox';
    mappings.workflow = 'inbox';
    mappings.readyForReview = true;
    mappings.lastSyncedFromMadison = new Date().toISOString();

    // keys found in your console warnings:
    mappings.generationSource = "madison-studio";

    const contentField = contentType === "master"
      ? content.full_content
      : content.generated_content || content.content || "";

    const portableText = markdownToPortableText(contentField);

    if (finalDocumentType === "journalEntry") {
      // Use category from request, default to field-notes
      mappings.category = extraMetadata.category || "field-notes";

      // UNIFIED CONTENT MAPPING:
      // We populate ALL likely content fields to avoid "Unknown Field" errors
      // or "Missing Content" issues in different schema versions.
      mappings.body = portableText;
      mappings.travelLog = portableText; // Crucial for Travel Journals
      mappings.description = contentField; // Plain text fallback
      mappings.content = portableText;
    }

    // Removed "Brute Force" fields to prevent "Unknown Field" errors in strict schemas:
    // mappings.content = portableText;
    // mappings.longDescription = portableText;
    // mappings.description = portableText;
    // mappings.text = portableText;
    // mappings.blocks = portableText;
    // mappings.article_body = portableText;

    const slugValue = content.title
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || `post-${content.id.substring(0, 8)}`;

    const slugRef = {
      _type: "slug",
      current: slugValue,
    };

    mappings.slug = slugRef;
    mappings.path = slugRef; // Some schemas use 'path'
    mappings.publishedAt = content.published_at || content.created_at || new Date().toISOString();
    mappings.date = mappings.publishedAt;

    // Automated Location Detection (Tarife Attar-specific — only runs when
    // the org has no explicit brand_config.sanity override).
    const locationCoords: Record<string, { lat: number; lng: number; name: string }> = sanityConfig.legacyTarifeFeatures ? {
      "havana": { lat: 23.1136, lng: -82.3666, name: "Havana, Cuba" },
      "riyadh": { lat: 24.7136, lng: 46.6753, name: "Riyadh, Saudi Arabia" },
      "kashmir": { lat: 34.0837, lng: 74.7973, name: "Kashmir, India" },
      "aden": { lat: 12.7855, lng: 45.0186, name: "Aden, Yemen" },
      "makkah": { lat: 21.3891, lng: 39.8579, name: "Makkah, Saudi Arabia" },
      "medina": { lat: 24.5247, lng: 39.5692, name: "Medina, Saudi Arabia" },
      "taif": { lat: 21.2854, lng: 40.4248, name: "Taif, Saudi Arabia" },
      "oman": { lat: 23.5859, lng: 58.4059, name: "Muscat, Oman" },
    } : {};

    const searchKey = (content.title || "").toLowerCase();
    const detectedLocation = Object.keys(locationCoords).find(loc => searchKey.includes(loc));

    if (detectedLocation) {
      const coords = locationCoords[detectedLocation];
      console.log(`[push-to-sanity] Detected location "${detectedLocation}", adding coordinates:`, coords);

      // Exact field names from Sanity schema
      mappings.locationName = coords.name;
      mappings.latitude = coords.lat.toString();
      mappings.longitude = coords.lng.toString();

      // Format: "23.1136° N, 82.3666° W"
      const latDir = coords.lat >= 0 ? "N" : "S";
      const lngDir = coords.lng >= 0 ? "E" : "W";
      const formattedCoords = `${Math.abs(coords.lat).toFixed(4)}° ${latDir}, ${Math.abs(coords.lng).toFixed(4)}° ${lngDir}`;
      mappings.displayFormat = formattedCoords;

      // Map based on screenshot labels (Inspiration Point)
      mappings.inspirationPoint = formattedCoords; // String format for frontend
      mappings.gpsCoordinates = formattedCoords;   // String format for frontend

      // Removed "Brute Force" coordinates to prevent "Unknown Field" errors
      // mappings.coordinates = { _type: "geopoint", lat: coords.lat, lng: coords.lng };
      // mappings.location = { _type: "geopoint", lat: coords.lat, lng: coords.lng };
      // mappings.lat = coords.lat;
      // mappings.lng = coords.lng;
    }

    if (content.featured_image_url) {
      try {
        console.log("[push-to-sanity] Uploading image to Sanity:", content.featured_image_url);

        // Fetch the image from the URL
        const imageRes = await fetch(content.featured_image_url);
        if (!imageRes.ok) throw new Error(`Failed to fetch image: ${imageRes.statusText}`);

        const imageBlob = await imageRes.blob();

        // Upload to Sanity
        const asset = await sanityClient.assets.upload('image', imageBlob, {
          filename: content.title ? `${content.title.substring(0, 20)}.jpg` : 'featured-image.jpg'
        });

        const imageRef = {
          _type: "image",
          asset: {
            _type: "reference",
            _ref: asset._id,
          },
        };

        // Image field mapping:
        // - If org supplies `imageFieldNames`, populate only those (clean path).
        // - Otherwise fall back to the legacy brute-force list that
        //   historically matches Tarife's schema variants.
        const imageFields = sanityConfig.imageFieldNames?.length
          ? sanityConfig.imageFieldNames
          : [
              "featuredImage",
              "mainImage",
              "image",
              "media",
              "heroImage",
              "thumbnail",
              "coverImage",
              "asset",
              "landscape_image",
              "article_image",
            ];
        for (const fieldName of imageFields) {
          mappings[fieldName] = imageRef;
        }

        console.log("[push-to-sanity] Image uploaded successfully:", asset._id);
      } catch (imgError) {
        console.error("[push-to-sanity] Image upload failed, skipping image:", imgError);
        // We continue without the image rather than failing the whole push
      }
    }

    // Add product reference if linked. Field names default to a
    // broad list (including Tarife's `perfume`) and can be overridden
    // via brand_config.sanity.productReferenceFieldNames.
    if (linkedProduct?.sanityId) {
      const productRef = {
        _type: "reference",
        _ref: linkedProduct.sanityId,
      };
      const productFields = sanityConfig.productReferenceFieldNames?.length
        ? sanityConfig.productReferenceFieldNames
        : ["product", "perfume", "relatedProduct"];
      for (const fieldName of productFields) {
        mappings[fieldName] = productRef;
      }
    }
  } else if (sanityDocumentType === "emailCampaign") {
    mappings.subject = content.metadata?.subject || content.title;
    mappings.htmlContent = content.full_content || content.generated_content;
    mappings.plainText = (content.full_content || content.generated_content || "")
      .replace(/<[^>]*>/g, ""); // Strip HTML
  } else if (sanityDocumentType === "socialPost") {
    mappings.platform = content.asset_type || content.content_type;
    mappings.caption = content.generated_content || content.content;
    mappings.scheduledAt = content.scheduled_date || null;
  }

  // Apply extra metadata if provided
  if (extraMetadata) {
    Object.entries(extraMetadata).forEach(([key, value]) => {
      mappings[key] = value;
    });
  }

  return { ...baseDoc, ...mappings };
}

/**
 * Fetch content from Supabase
 */
async function fetchContent(
  supabaseUrl: string,
  supabaseKey: string,
  contentId: string,
  contentType: string
): Promise<any> {
  const tableMap: Record<string, string> = {
    master: "master_content",
    derivative: "derivative_assets",
    output: "outputs",
  };

  const table = tableMap[contentType];
  if (!table) {
    throw new Error(`Invalid contentType: ${contentType}`);
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/${table}?id=eq.${contentId}&select=*`,
    {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch content: ${response.statusText}`);
  }

  const data = await response.json();
  if (!data || data.length === 0) {
    throw new Error(`Content not found: ${contentId}`);
  }

  return data[0];
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      contentId,
      contentType,
      sanityDocumentType,
      organizationId,
      linkedProductId,
      linkedProductName,
      publish = false,
      fieldMapping,
      category,
    }: PushRequest = await req.json();

    if (!contentId || !contentType || !sanityDocumentType) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields: contentId, contentType, sanityDocumentType",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("[push-to-sanity] Request received:", { contentId, contentType, sanityDocumentType, organizationId, publish });

    // Get Supabase config
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    console.log("[push-to-sanity] Supabase URL exists:", !!supabaseUrl);
    console.log("[push-to-sanity] Service key exists:", !!supabaseKey);

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase configuration");
    }

    // Fetch content from Supabase
    console.log("[push-to-sanity] Fetching content from table...");
    const content = await fetchContent(supabaseUrl, supabaseKey, contentId, contentType);
    console.log("[push-to-sanity] Content fetched:", content?.title || content?.id);

    // Get Sanity config (per-org override from brand_config.sanity, env fallback)
    const sanityConfig = await getSanityConfig(
      supabaseUrl,
      supabaseKey,
      organizationId,
    );

    // Initialize Sanity client
    const sanityClient = createClient({
      projectId: sanityConfig.projectId as string,
      dataset: sanityConfig.dataset as string,
      token: sanityConfig.token as string,
      apiVersion: sanityConfig.apiVersion as string,
      useCdn: false,
    });

    // Discovery: Sniff out the Sanity schema for fieldJournal/post
    console.log(`[push-to-sanity] Sniffing out existing documents for schema discovery...`);
    try {
      const sample = await sanityClient.fetch(
        `*[_type in ["fieldJournal", "post", "blog_article", "journal"]][0]`
      );
      if (sample) {
        console.log(`[push-to-sanity] SCHEMA DISCOVERY - Found document type "${sample._type}":`, JSON.stringify(Object.keys(sample)));
        // Log coordinates if they exist
        if (sample.coordinates) console.log(`[push-to-sanity] SCHEMA DISCOVERY - Coordinates structure:`, JSON.stringify(sample.coordinates));
        if (sample.location) console.log(`[push-to-sanity] SCHEMA DISCOVERY - Location structure:`, JSON.stringify(sample.location));
      } else {
        console.log(`[push-to-sanity] SCHEMA DISCOVERY - No existing documents found to sniff.`);
      }
    } catch (sniffErr) {
      console.warn(`[push-to-sanity] Schema sniffing failed:`, sniffErr);
    }

    // Lookup linked product in Sanity if provided
    let linkedProductData = null;
    if (linkedProductId && linkedProductName) {
      console.log(`[push-to-sanity] Looking up linked product: ${linkedProductName} (ID: ${linkedProductId})`);
      try {
        // More robust lookup: check title (case-insensitive), madisonProductId, and SKU
        const existingProducts = await sanityClient.fetch(
          `*[_type in ["product", "tarifeProduct"] && (
            lower(title) == lower($title) ||
            sku == $sku ||
            madisonProductId == $id ||
            _id == $id ||
            _id == "drafts." + $id
          )][0]`,
          { title: linkedProductName, id: linkedProductId, sku: linkedProductId }
        );

        if (existingProducts) {
          linkedProductData = {
            id: linkedProductId,
            name: linkedProductName,
            sanityId: existingProducts._id
          };
          console.log(`[push-to-sanity] Found linked product in Sanity: ${existingProducts._id}`);
        } else {
          console.log(`[push-to-sanity] ⚠️ Could not find product "${linkedProductName}" in Sanity. Connection will be skipped.`);
        }
      } catch (err) {
        console.warn(`[push-to-sanity] Failed to lookup linked product:`, err);
      }
    }

    // Standard fields for Sanity Inboxes/Workflows
    const inboxMetadata = {
      status: 'inbox',
      state: 'inbox',
      workflow: 'inbox',
      readyForReview: true,
      lastSyncedFromMadison: new Date().toISOString(),
      category: category || undefined,
    };

    // Transform content to Sanity format
    const sanityDoc = await transformContentToSanity(
      content,
      contentType,
      sanityDocumentType,
      sanityClient,
      sanityConfig,
      inboxMetadata,
      linkedProductData
    );

    // Create or update document in Sanity
    // We prefix with drafts. to ensure it shows up in the Sanity Studio inbox
    const draftId = `drafts.madison-${content.id}`;
    const finalDoc = { ...sanityDoc, _id: draftId };

    console.log("[push-to-sanity] Attempting createOrReplace for:", draftId);
    console.log("[push-to-sanity] Payload Preview:", JSON.stringify(finalDoc, null, 2));

    // TYPE SAFETY CHECK:
    // Sanity does not allow changing _type of an existing document.
    // We must check if it exists with a different type and delete it first.
    try {
      // Check draft
      const existingDraft = await sanityClient.getDocument(draftId);
      if (existingDraft && existingDraft._type !== finalDoc._type) {
        console.warn(`[push-to-sanity] Type mismatch on DRAFT! Existing: ${existingDraft._type}, New: ${finalDoc._type}. Deleting to allow type change.`);
        await sanityClient.delete(draftId);
      }

      // Check published (just in case, as they should match)
      const publishedId = `madison-${content.id}`;
      const existingPublished = await sanityClient.getDocument(publishedId);
      if (existingPublished && existingPublished._type !== finalDoc._type) {
        console.warn(`[push-to-sanity] Type mismatch on PUBLISHED! Existing: ${existingPublished._type}, New: ${finalDoc._type}. Deleting to allow type change.`);
        await sanityClient.delete(publishedId);
      }

    } catch (checkErr) {
      console.warn("[push-to-sanity] Error checking existing document types:", checkErr);
    }

    let result;
    try {
      result = await sanityClient.createOrReplace(finalDoc);
      console.log("[push-to-sanity] Sanity Response:", result);
    } catch (err) {
      console.error("[push-to-sanity] FATAL Sanity Error:", err);
      throw err;
    }

    // Verify it exists right after creation
    const verify = await sanityClient.getDocument(result._id);
    console.log("[push-to-sanity] Verification - Document exists in Sanity:", !!verify);

    // -------------------------------------------------------------------------
    // STRATEGY UPDATE:
    // We strictly CREATE the journal entry. We do NOT patch the product.
    // Madison = Storytelling. Sanity = Product Data.
    // -------------------------------------------------------------------------

    // Publish if requested (this removes the drafts. prefix for a live version)
    if (publish) {
      console.log("[push-to-sanity] Publishing document...");
      await sanityClient.createOrReplace({
        ...result,
        _id: `madison-${content.id}`
      });
      // Optionally delete the draft after publishing
      await sanityClient.delete(draftId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        sanityDocumentId: result._id,
        verified: !!verify,
        published: publish,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error pushing to Sanity:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Failed to push content to Sanity",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});



