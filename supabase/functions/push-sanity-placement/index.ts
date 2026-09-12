// deno-lint-ignore-file no-import-prefix no-explicit-any
/**
 * Placement-aware Sanity publisher.
 *
 * This function is intentionally separate from the legacy Tarife-specific
 * push-to-sanity functions. It targets exactly one Sanity document field per
 * publish and records inspection/publish audit rows in Supabase.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient as createSanityClient } from "https://esm.sh/@sanity/client@6.8.6";
import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  bestBottlesProductTruthRule,
  buildImageField,
  buildPatchSet,
  buildSelectorParams,
  needsProfileSpecificDestination,
  normalizeDestinationKey,
  type SanityDestinationRow,
  selectDestinationConfig,
  validatePlacementRequest,
} from "../_shared/sanityPlacement.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type InspectBody = {
  action: "inspect";
  organizationId?: unknown;
  connectionId?: unknown;
  projectId?: unknown;
  dataset?: unknown;
};

type PublishBody = {
  action: "publish";
  organizationId?: unknown;
  connectionId?: unknown;
  destinationKey?: unknown;
  imageUrl?: unknown;
  metadata?: unknown;
  dryRun?: unknown;
};

type RequestBody = InspectBody | PublishBody;

type User = {
  id: string;
};

type SanityConnection = {
  id: string;
  organization_id: string;
  project_id: string;
  dataset: string;
  studio_url: string | null;
  api_version: string;
  write_token_secret_name: string;
  schema_profile: string;
};

type Destination = SanityDestinationRow & {
  id: string;
  organization_id: string | null;
  destination_key: string;
  schema_profile: string;
  sanity_document_type: string;
  selector_query: string;
  target_field_path: string;
  target_list_query?: string | null;
};

type SanityConfig = {
  connectionId: string | null;
  projectId: string;
  dataset: string;
  apiVersion: string;
  schemaProfile: string;
  token?: string;
};

type BestBottlesSkuJob = {
  id: string;
  product_group_slug: string | null;
  product_group_display_name: string | null;
  grace_sku: string | null;
  website_sku: string | null;
  shopify_sku: string | null;
  status: string | null;
  shopify_product_id: string | null;
  shopify_variant_id: string | null;
  shopify_media_id: string | null;
};

function cleanSecret(value: string | undefined | null) {
  return value?.trim().replace(/^['"]|['"]$/g, "") || "";
}

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTruthKey(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function normalizeSlugKey(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function metadataText(
  metadata: Record<string, unknown>,
  ...keys: string[]
) {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function classifyInspectionError(message: string): "blocked" | "error" {
  return /dataset .*not found|project .*not found|not found|permission|unauthorized|forbidden/i
      .test(message)
    ? "blocked"
    : "error";
}

function sanitizeFilename(value: unknown, fallback: string) {
  const raw = typeof value === "string" && value.trim()
    ? value.trim()
    : fallback;
  return raw.replace(/[^a-z0-9._-]+/gi, "-").replace(/-+/g, "-").slice(0, 80) ||
    fallback;
}

async function getUser(
  req: Request,
  supabaseUrl: string,
  anonKey: string,
): Promise<User | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return null;
  const authClient = createSupabaseClient(supabaseUrl, anonKey);
  const { data, error } = await authClient.auth.getUser(jwt);
  if (error || !data.user) return null;
  return { id: data.user.id };
}

async function assertOrganizationMember(
  serviceClient: any,
  userId: string,
  organizationId: string,
) {
  const { data, error } = await serviceClient
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) {
    throw new Error(`Organization membership lookup failed: ${error.message}`);
  }
  if (!data) throw new Error("You are not a member of this organization.");
}

async function loadConnection(
  serviceClient: any,
  organizationId: string,
  connectionId: string,
): Promise<SanityConnection | null> {
  let query = serviceClient
    .from("sanity_connections")
    .select(
      "id, organization_id, project_id, dataset, studio_url, api_version, write_token_secret_name, schema_profile",
    )
    .eq("organization_id", organizationId)
    .limit(1);

  if (connectionId) {
    query = query.eq("id", connectionId);
  } else {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    throw new Error(`Sanity connection lookup failed: ${error.message}`);
  }
  return data as SanityConnection | null;
}

function resolveSanityConfig(
  connection: SanityConnection | null,
  body: InspectBody | PublishBody,
): SanityConfig {
  if (connection) {
    const token = cleanSecret(Deno.env.get(connection.write_token_secret_name));
    return {
      connectionId: connection.id,
      projectId: connection.project_id,
      dataset: connection.dataset,
      apiVersion: connection.api_version || "2024-01-01",
      schemaProfile: connection.schema_profile || "generic",
      token: token || undefined,
    };
  }

  const projectId = normalizeOptionalString((body as InspectBody).projectId);
  const dataset = normalizeOptionalString((body as InspectBody).dataset) ||
    "production";
  if (!projectId) {
    throw new Error(
      "No Sanity connection found and no projectId was provided for inspection.",
    );
  }
  return {
    connectionId: null,
    projectId,
    dataset,
    apiVersion: "2024-01-01",
    schemaProfile: "generic",
  };
}

function makeSanityClient(config: SanityConfig) {
  return createSanityClient({
    projectId: config.projectId,
    dataset: config.dataset,
    token: config.token,
    apiVersion: config.apiVersion,
    useCdn: false,
  });
}

async function inspectSanitySchema(sanityClient: any) {
  const query = `{
    "observedDocumentTypes": array::unique(*[defined(_type)]._type),
    "sampledDocuments": *[defined(_type) && !(_id in path("drafts.**"))] | order(_updatedAt desc)[0...40]{
      _id,
      _type,
      _updatedAt,
      title,
      name,
      "slug": slug.current,
      heroImage,
      hero,
      mainImage,
      featuredImage,
      image,
      coverImage,
      sections
    },
    "destinationMatches": {
      "blog_post": *[_type in ["post", "article", "blog_article", "journalEntry", "fieldJournal"] && !(_id in path("drafts.**"))][0...10]{_id,_type,title,name,"slug": slug.current,featuredImage,heroImage,mainImage},
      "homepage_hero": *[_type in ["homePage", "homepage", "siteSettings", "settings", "landingPage"] && !(_id in path("drafts.**"))][0...10]{_id,_type,title,name,heroImage,hero,mainImage},
      "product_family_hero": *[_type in ["productFamily", "productGroup", "collection", "category"] && !(_id in path("drafts.**"))][0...10]{_id,_type,title,name,"slug": slug.current,heroImage,mainImage,image},
      "product_main_image": *[_type in ["product", "tarifeProduct"] && !(_id in path("drafts.**"))][0...10]{_id,_type,title,name,"slug": slug.current,mainImage,heroImage,featuredImage},
      "paper_doll_component": *[_type in ["paperDollComponent", "componentAsset", "productComponent"] && !(_id in path("drafts.**"))][0...10]{_id,_type,title,name,cohortSlug,role,image,mainImage}
    }
  }`;

  try {
    const result = await sanityClient.fetch(query);
    return {
      status: "ok" as const,
      observedDocumentTypes: result?.observedDocumentTypes ?? [],
      sampledDocuments: result?.sampledDocuments ?? [],
      destinationMatches: result?.destinationMatches ?? {},
      errorMessage: null,
    };
  } catch (error) {
    const message = errorMessage(error);
    return {
      status: classifyInspectionError(message),
      observedDocumentTypes: [],
      sampledDocuments: [],
      destinationMatches: {},
      errorMessage: message,
    };
  }
}

async function insertInspection(
  serviceClient: any,
  params: {
    organizationId: string;
    connectionId: string | null;
    config: SanityConfig;
    inspectedBy: string;
    inspection: Awaited<ReturnType<typeof inspectSanitySchema>>;
  },
) {
  const { error } = await serviceClient.from("sanity_schema_inspections")
    .insert({
      organization_id: params.organizationId,
      connection_id: params.connectionId,
      project_id: params.config.projectId,
      dataset: params.config.dataset,
      status: params.inspection.status,
      observed_document_types: params.inspection.observedDocumentTypes,
      sampled_documents: params.inspection.sampledDocuments,
      destination_matches: params.inspection.destinationMatches,
      error_message: params.inspection.errorMessage,
      inspected_by: params.inspectedBy,
    });
  if (error) {
    console.warn(
      "[push-sanity-placement] inspection log insert failed",
      error.message,
    );
  }

  if (params.connectionId) {
    await serviceClient
      .from("sanity_connections")
      .update({
        last_schema_inspected_at: new Date().toISOString(),
        last_schema_status: params.inspection.status,
        last_error: params.inspection.errorMessage,
      })
      .eq("id", params.connectionId);
  }
}

async function insertPublishLog(
  serviceClient: any,
  params: {
    organizationId: string;
    connectionId: string | null;
    operation: "inspect" | "publish";
    destinationKey?: string | null;
    status: "success" | "failed" | "blocked" | "dry_run";
    sourceImageUrl?: string | null;
    sanityAssetId?: string | null;
    sanityDocumentId?: string | null;
    sanityDocumentType?: string | null;
    targetFieldPath?: string | null;
    metadata?: Record<string, unknown>;
    requestPayload?: Record<string, unknown>;
    responsePayload?: Record<string, unknown>;
    errorMessage?: string | null;
    publishedBy: string;
  },
) {
  const { error } = await serviceClient.from("sanity_publish_log").insert({
    organization_id: params.organizationId,
    connection_id: params.connectionId,
    operation: params.operation,
    destination_key: params.destinationKey ?? null,
    status: params.status,
    source_image_url: params.sourceImageUrl ?? null,
    sanity_asset_id: params.sanityAssetId ?? null,
    sanity_document_id: params.sanityDocumentId ?? null,
    sanity_document_type: params.sanityDocumentType ?? null,
    target_field_path: params.targetFieldPath ?? null,
    metadata: params.metadata ?? {},
    request_payload: params.requestPayload ?? {},
    response_payload: params.responsePayload ?? {},
    error_message: params.errorMessage ?? null,
    published_by: params.publishedBy,
  });
  if (error) {
    console.warn(
      "[push-sanity-placement] publish log insert failed",
      error.message,
    );
  }
}

async function loadDestinationRows(
  serviceClient: any,
  destinationKey: string,
): Promise<Destination[]> {
  const { data, error } = await serviceClient
    .from("sanity_destination_registry")
    .select("*")
    .eq("destination_key", destinationKey)
    .eq("is_active", true);
  if (error) {
    throw new Error(`Sanity destination lookup failed: ${error.message}`);
  }
  return (data ?? []) as Destination[];
}

async function loadBestBottlesSkuJobs(
  serviceClient: any,
  organizationId: string,
  field: "website_sku" | "grace_sku" | "product_group_slug",
  value: string,
  limit = 3,
): Promise<BestBottlesSkuJob[]> {
  if (!value) return [];
  const { data, error } = await serviceClient
    .from("best_bottles_pipeline_sku_jobs")
    .select(
      "id, product_group_slug, product_group_display_name, grace_sku, website_sku, shopify_sku, status, shopify_product_id, shopify_variant_id, shopify_media_id",
    )
    .eq("organization_id", organizationId)
    .eq(field, value)
    .limit(limit);
  if (error) {
    throw new Error(
      `Best Bottles product truth lookup failed: ${error.message}`,
    );
  }
  return (data ?? []) as BestBottlesSkuJob[];
}

function publicProductTruthRow(row: BestBottlesSkuJob) {
  return {
    id: row.id,
    productGroupSlug: row.product_group_slug,
    productGroupDisplayName: row.product_group_display_name,
    graceSku: row.grace_sku,
    websiteSku: row.website_sku,
    shopifySku: row.shopify_sku,
    status: row.status,
    shopifyProductId: row.shopify_product_id,
    shopifyVariantId: row.shopify_variant_id,
    shopifyMediaId: row.shopify_media_id,
  };
}

async function validateBestBottlesProductTruth(
  serviceClient: any,
  organizationId: string,
  destinationKey: string,
  metadata: Record<string, unknown>,
) {
  const rule = bestBottlesProductTruthRule(destinationKey);
  if (!rule) return { ok: true as const, errors: [], evidence: {} };

  const errors: string[] = [];
  for (const key of rule.requiredKeys) {
    if (!metadataText(metadata, key)) {
      errors.push(
        `metadata.${key} is required for Best Bottles product truth.`,
      );
    }
  }
  if (errors.length > 0) {
    return { ok: false as const, errors, evidence: {} };
  }

  const websiteSku = metadataText(metadata, "websiteSku", "legacySku");
  const graceSku = metadataText(metadata, "graceSku");
  const shopifySku = metadataText(metadata, "shopifySku");
  const familySlug = metadataText(
    metadata,
    "familySlug",
    "productGroupSlug",
    "slug",
  );

  let primaryJob: BestBottlesSkuJob | null = null;
  const evidence: Record<string, unknown> = {};

  if (rule.skuScoped) {
    const jobs = await loadBestBottlesSkuJobs(
      serviceClient,
      organizationId,
      "website_sku",
      websiteSku,
      2,
    );
    evidence.websiteSkuMatches = jobs.map(publicProductTruthRow);
    if (jobs.length !== 1) {
      errors.push(
        jobs.length === 0
          ? `No Best Bottles SKU job matched websiteSku ${websiteSku}.`
          : `Multiple Best Bottles SKU jobs matched websiteSku ${websiteSku}.`,
      );
    } else {
      primaryJob = jobs[0];
    }
  }

  if (rule.familyScoped) {
    const jobs = await loadBestBottlesSkuJobs(
      serviceClient,
      organizationId,
      "product_group_slug",
      familySlug,
      5,
    );
    evidence.familyMatches = jobs.map(publicProductTruthRow);
    if (jobs.length === 0) {
      errors.push(
        `No Best Bottles SKU jobs matched product family slug ${familySlug}.`,
      );
    } else {
      primaryJob = jobs[0];
    }
  }

  if (graceSku) {
    const graceMatches = await loadBestBottlesSkuJobs(
      serviceClient,
      organizationId,
      "grace_sku",
      graceSku,
      2,
    );
    evidence.graceSkuMatches = graceMatches.map(publicProductTruthRow);
    if (graceMatches.length !== 1) {
      errors.push(
        graceMatches.length === 0
          ? `No Best Bottles SKU job matched graceSku ${graceSku}.`
          : `Multiple Best Bottles SKU jobs matched graceSku ${graceSku}.`,
      );
    } else if (primaryJob && graceMatches[0].id !== primaryJob.id) {
      errors.push(
        `graceSku ${graceSku} does not match the selected Best Bottles product truth row.`,
      );
    }
  }

  if (
    primaryJob?.grace_sku &&
    graceSku &&
    normalizeTruthKey(primaryJob.grace_sku) !== normalizeTruthKey(graceSku)
  ) {
    errors.push(
      `metadata.graceSku ${graceSku} does not match product truth ${primaryJob.grace_sku}.`,
    );
  }
  if (
    primaryJob?.product_group_slug &&
    familySlug &&
    normalizeSlugKey(primaryJob.product_group_slug) !==
      normalizeSlugKey(familySlug)
  ) {
    errors.push(
      `metadata.familySlug ${familySlug} does not match product truth ${primaryJob.product_group_slug}.`,
    );
  }
  if (
    primaryJob?.shopify_sku &&
    shopifySku &&
    normalizeTruthKey(primaryJob.shopify_sku) !== normalizeTruthKey(shopifySku)
  ) {
    errors.push(
      `metadata.shopifySku ${shopifySku} does not match product truth ${primaryJob.shopify_sku}.`,
    );
  }

  return errors.length === 0
    ? { ok: true as const, errors: [], evidence }
    : { ok: false as const, errors, evidence };
}

async function fetchImageBlob(imageUrl: string) {
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(
      `Failed to fetch image (${imageResponse.status}): ${imageResponse.statusText}`,
    );
  }
  return await imageResponse.blob();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const supabaseUrl = cleanSecret(Deno.env.get("SUPABASE_URL"));
  const anonKey = cleanSecret(Deno.env.get("SUPABASE_ANON_KEY"));
  const serviceRoleKey = cleanSecret(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json(500, {
      error:
        "SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are required.",
    });
  }

  const user = await getUser(req, supabaseUrl, anonKey);
  if (!user) return json(401, { error: "Not signed in." });

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }

  const action = body.action;
  if (action !== "inspect" && action !== "publish" && action !== "targets") {
    return json(400, { error: "action must be inspect, publish or targets." });
  }

  const organizationId = normalizeOptionalString(body.organizationId);
  if (!organizationId) {
    return json(400, { error: "organizationId is required." });
  }

  const serviceClient = createSupabaseClient(supabaseUrl, serviceRoleKey);

  try {
    await assertOrganizationMember(serviceClient, user.id, organizationId);
  } catch (error) {
    return json(403, { error: errorMessage(error) });
  }

  const connectionId = normalizeOptionalString(body.connectionId);
  let connection: SanityConnection | null = null;
  try {
    connection = await loadConnection(
      serviceClient,
      organizationId,
      connectionId,
    );
  } catch (error) {
    return json(500, { error: errorMessage(error) });
  }

  let config: SanityConfig;
  try {
    config = resolveSanityConfig(connection, body);
  } catch (error) {
    return json(400, { error: errorMessage(error) });
  }

  const sanityClient = makeSanityClient(config);

  // "targets" lets the UI offer real, pickable destinations instead of asking a
  // human to type a Sanity document id. Each registry row may declare a GROQ
  // list query returning [{label, metadata}]; the chosen item's metadata is what
  // the caller sends back on publish, where the existing selector_query resolves
  // it to a document. Read-only.
  if (action === "targets") {
    const destinationKey = normalizeDestinationKey(
      (body as PublishBody).destinationKey,
    );
    if (!destinationKey) {
      return json(400, { error: "destinationKey is required for targets." });
    }

    let destination: Destination | null = null;
    try {
      const destinationRows = await loadDestinationRows(
        serviceClient,
        destinationKey,
      );
      destination = selectDestinationConfig(
        destinationRows,
        destinationKey,
        config.schemaProfile,
        organizationId,
      ) as Destination | null;
    } catch (error) {
      return json(500, { error: errorMessage(error) });
    }
    if (!destination) {
      return json(400, {
        error:
          `No active Sanity destination registry row found for ${destinationKey} / ${config.schemaProfile}.`,
      });
    }

    if (!destination?.target_list_query) {
      return json(200, {
        success: true,
        destinationKey,
        targets: [],
        message:
          `No target list is configured for ${destinationKey}; enter a document id manually.`,
      });
    }

    try {
      const rows = await sanityClient.fetch(destination.target_list_query, {});
      const targets = Array.isArray(rows) ? rows : [];
      return json(200, {
        success: true,
        destinationKey,
        documentType: destination.sanity_document_type,
        targets,
      });
    } catch (error) {
      return json(502, {
        error: `Sanity target lookup failed: ${errorMessage(error)}`,
      });
    }
  }

  if (action === "inspect") {
    const inspection = await inspectSanitySchema(sanityClient);
    await insertInspection(serviceClient, {
      organizationId,
      connectionId: config.connectionId,
      config,
      inspectedBy: user.id,
      inspection,
    });
    await insertPublishLog(serviceClient, {
      organizationId,
      connectionId: config.connectionId,
      operation: "inspect",
      status: inspection.status === "ok"
        ? "success"
        : inspection.status === "blocked"
        ? "blocked"
        : "failed",
      requestPayload: {
        projectId: config.projectId,
        dataset: config.dataset,
        connectionId: config.connectionId,
      },
      responsePayload: {
        observedDocumentTypes: inspection.observedDocumentTypes,
        destinationMatches: inspection.destinationMatches,
      },
      errorMessage: inspection.errorMessage,
      publishedBy: user.id,
    });

    return json(inspection.status === "ok" ? 200 : 409, {
      success: inspection.status === "ok",
      status: inspection.status,
      projectId: config.projectId,
      dataset: config.dataset,
      observedDocumentTypes: inspection.observedDocumentTypes,
      sampledDocuments: inspection.sampledDocuments,
      destinationMatches: inspection.destinationMatches,
      error: inspection.errorMessage,
    });
  }

  if (!connection) {
    return json(400, {
      error: "publish requires an active org-scoped Sanity connection.",
    });
  }
  if (!config.token) {
    return json(500, {
      error:
        `Sanity write token secret "${connection.write_token_secret_name}" is not configured.`,
    });
  }

  const destinationKey = normalizeDestinationKey(body.destinationKey);
  if (!destinationKey) {
    return json(400, { error: "Unknown Sanity destinationKey." });
  }

  const metadata = metadataObject(body.metadata);
  const imageUrl = normalizeOptionalString(body.imageUrl);
  const dryRun = body.dryRun === true;

  let destination: Destination | null = null;
  try {
    const destinationRows = await loadDestinationRows(
      serviceClient,
      destinationKey,
    );
    destination = selectDestinationConfig(
      destinationRows,
      destinationKey,
      config.schemaProfile,
      organizationId,
    ) as Destination | null;
  } catch (error) {
    return json(500, { error: errorMessage(error) });
  }
  if (!destination) {
    return json(400, {
      error:
        `No active Sanity destination registry row found for ${destinationKey} / ${config.schemaProfile}.`,
    });
  }
  if (needsProfileSpecificDestination(destination, config.schemaProfile)) {
    const message =
      `Schema profile "${config.schemaProfile}" requires an org-specific Sanity destination row for ${destinationKey}; generic fallback is blocked until the live schema is confirmed.`;
    await insertPublishLog(serviceClient, {
      organizationId,
      connectionId: config.connectionId,
      operation: "publish",
      destinationKey,
      status: "blocked",
      sourceImageUrl: imageUrl || null,
      targetFieldPath: destination.target_field_path,
      metadata,
      requestPayload: { destinationKey, imageUrl, metadata, dryRun },
      errorMessage: message,
      publishedBy: user.id,
    });
    return json(400, { error: message });
  }

  const validation = validatePlacementRequest(
    { imageUrl, metadata },
    destination,
  );
  if (!validation.ok) {
    await insertPublishLog(serviceClient, {
      organizationId,
      connectionId: config.connectionId,
      operation: "publish",
      destinationKey,
      status: "blocked",
      sourceImageUrl: imageUrl || null,
      targetFieldPath: destination.target_field_path,
      metadata,
      requestPayload: { destinationKey, imageUrl, metadata, dryRun },
      errorMessage: validation.errors.join(" "),
      publishedBy: user.id,
    });
    return json(400, {
      error: "Sanity placement request failed validation.",
      details: validation.errors,
    });
  }

  if (config.schemaProfile === "best_bottles") {
    try {
      const productTruth = await validateBestBottlesProductTruth(
        serviceClient,
        organizationId,
        destinationKey,
        metadata,
      );
      if (!productTruth.ok) {
        await insertPublishLog(serviceClient, {
          organizationId,
          connectionId: config.connectionId,
          operation: "publish",
          destinationKey,
          status: "blocked",
          sourceImageUrl: imageUrl,
          targetFieldPath: destination.target_field_path,
          metadata,
          requestPayload: { destinationKey, imageUrl, metadata, dryRun },
          responsePayload: { productTruth: productTruth.evidence },
          errorMessage: productTruth.errors.join(" "),
          publishedBy: user.id,
        });
        return json(400, {
          error: "Best Bottles product truth validation failed.",
          details: productTruth.errors,
          productTruth: productTruth.evidence,
        });
      }
    } catch (error) {
      const message = errorMessage(error);
      await insertPublishLog(serviceClient, {
        organizationId,
        connectionId: config.connectionId,
        operation: "publish",
        destinationKey,
        status: "blocked",
        sourceImageUrl: imageUrl,
        targetFieldPath: destination.target_field_path,
        metadata,
        requestPayload: { destinationKey, imageUrl, metadata, dryRun },
        errorMessage: message,
        publishedBy: user.id,
      });
      return json(500, { error: message });
    }
  }

  const inspection = await inspectSanitySchema(sanityClient);
  await insertInspection(serviceClient, {
    organizationId,
    connectionId: config.connectionId,
    config,
    inspectedBy: user.id,
    inspection,
  });
  if (inspection.status !== "ok") {
    await insertPublishLog(serviceClient, {
      organizationId,
      connectionId: config.connectionId,
      operation: "publish",
      destinationKey,
      status: "blocked",
      sourceImageUrl: imageUrl,
      targetFieldPath: destination.target_field_path,
      metadata,
      requestPayload: { destinationKey, imageUrl, metadata, dryRun },
      responsePayload: { inspection },
      errorMessage: inspection.errorMessage,
      publishedBy: user.id,
    });
    return json(409, {
      error: "Sanity schema inspection did not pass; publish blocked.",
      inspection,
    });
  }

  try {
    const selectorParams = buildSelectorParams(destination, metadata);
    const targetDoc = await sanityClient.fetch(
      destination.selector_query,
      selectorParams,
    );
    if (!targetDoc?._id) {
      throw new Error(
        `No Sanity document matched destination ${destinationKey} selector for ${destination.sanity_document_type}.`,
      );
    }

    if (dryRun) {
      await insertPublishLog(serviceClient, {
        organizationId,
        connectionId: config.connectionId,
        operation: "publish",
        destinationKey,
        status: "dry_run",
        sourceImageUrl: imageUrl,
        sanityDocumentId: targetDoc._id,
        sanityDocumentType: targetDoc._type ?? destination.sanity_document_type,
        targetFieldPath: destination.target_field_path,
        metadata,
        requestPayload: {
          destinationKey,
          imageUrl,
          metadata,
          dryRun,
          selectorParams,
        },
        responsePayload: { targetDoc },
        publishedBy: user.id,
      });
      return json(200, {
        success: true,
        dryRun: true,
        destinationKey,
        sanityDocumentId: targetDoc._id,
        sanityDocumentType: targetDoc._type ?? destination.sanity_document_type,
        targetFieldPath: destination.target_field_path,
      });
    }

    const imageBlob = await fetchImageBlob(imageUrl);
    const filename = sanitizeFilename(
      metadata.filename,
      `${destinationKey}-${targetDoc._id}-${Date.now()}.png`,
    );
    const asset = await sanityClient.assets.upload("image", imageBlob, {
      filename,
    });
    const imageField = buildImageField(asset._id, metadata);
    const patchSet = buildPatchSet(destination.target_field_path, imageField);
    const patchResult = await sanityClient.patch(targetDoc._id).set(patchSet)
      .commit();

    await insertPublishLog(serviceClient, {
      organizationId,
      connectionId: config.connectionId,
      operation: "publish",
      destinationKey,
      status: "success",
      sourceImageUrl: imageUrl,
      sanityAssetId: asset._id,
      sanityDocumentId: targetDoc._id,
      sanityDocumentType: targetDoc._type ?? destination.sanity_document_type,
      targetFieldPath: destination.target_field_path,
      metadata,
      requestPayload: { destinationKey, imageUrl, metadata, selectorParams },
      responsePayload: { assetId: asset._id, patchResult },
      publishedBy: user.id,
    });

    return json(200, {
      success: true,
      destinationKey,
      sanityAssetId: asset._id,
      sanityDocumentId: targetDoc._id,
      sanityDocumentType: targetDoc._type ?? destination.sanity_document_type,
      targetFieldPath: destination.target_field_path,
      patchResult,
    });
  } catch (error) {
    const message = errorMessage(error);
    await insertPublishLog(serviceClient, {
      organizationId,
      connectionId: config.connectionId,
      operation: "publish",
      destinationKey,
      status: "failed",
      sourceImageUrl: imageUrl,
      targetFieldPath: destination.target_field_path,
      metadata,
      requestPayload: { destinationKey, imageUrl, metadata, dryRun },
      errorMessage: message,
      publishedBy: user.id,
    });
    return json(500, { error: message });
  }
});
