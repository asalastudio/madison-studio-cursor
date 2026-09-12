// deno-lint-ignore-file no-import-prefix
import { decode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { Image } from "https://deno.land/x/imagescript@1.2.17/mod.ts";

import { callGeminiImage } from "../_shared/aiProviders.ts";
// Single line on purpose: the Supabase function bundler's asset scanner does
// not follow a multi-line `default, { named }` import, so the split form made
// this function fail to deploy with "Module not found … openaiProvider.ts".
import OpenAIProvider, { type OpenAIImageModel } from "../_shared/openaiProvider.ts";
import {
  buildCandidateStoragePaths,
  buildProviderPlan,
  clampDecodedMaterialToAuthority,
  type DecodedAuthorityMask,
  type PixelBounds,
  validateOriginalFilename,
} from "../_shared/paperDollComponentGeneration.ts";
import {
  createPaperDollActionContext,
  databaseError,
  jsonResponse,
  requireRecord,
  requireString,
  runPaperDollAction,
  sha256Hex,
  stableJson,
} from "../_shared/paperDollEdge.ts";
import { PaperDollActionError } from "../_shared/paperDollLifecycle.ts";

const CANDIDATE_BUCKET = "paper-doll-candidates";
const AUTHORITY_BUCKET = "paper-doll-authority";

function storageLocation(
  value: string,
  fallbackBucket: string,
): { bucket: string; path: string } {
  const match = value.match(/^private:\/\/([^/]+)\/(.+)$/);
  if (match) return { bucket: match[1], path: match[2] };
  return { bucket: fallbackBucket, path: value.replace(/^\/+/, "") };
}

function pixelBounds(value: unknown, field: string): PixelBounds {
  const record = requireRecord(value, field);
  const result = {
    left: Number(record.left),
    top: Number(record.top),
    width: Number(record.width),
    height: Number(record.height),
  };
  if (
    Object.values(result).some((entry) => !Number.isInteger(entry)) ||
    result.left < 0 || result.top < 0 || result.width <= 0 || result.height <= 0
  ) {
    throw new PaperDollActionError(
      422,
      "invalid_pixel_bounds",
      `${field} is invalid.`,
      [
        {
          field,
          message:
            "Pixel bounds require non-negative integer left/top and positive integer width/height.",
        },
      ],
    );
  }
  return result;
}

function detectedAlphaBounds(image: Image): PixelBounds {
  let left = image.width;
  let top = image.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (image.bitmap[(y * image.width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) {
    throw new PaperDollActionError(
      422,
      "empty_authority_mask",
      "Authority mask is empty.",
      [
        {
          field: "authorityMask",
          message: "Authority mask must contain non-transparent pixels.",
        },
      ],
    );
  }
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

async function downloadBytes(
  service: ReturnType<typeof createPaperDollActionContext> extends
    Promise<infer T> ? T extends { service: infer S } ? S : never
    : never,
  bucket: string,
  path: string,
): Promise<Uint8Array> {
  const { data, error } = await service.storage.from(bucket).download(path);
  if (error || !data) {
    databaseError(
      error,
      `Private artifact ${bucket}/${path} could not be read.`,
      422,
    );
  }
  return new Uint8Array(await data.arrayBuffer());
}

async function loadReferences(
  service: Parameters<typeof downloadBytes>[0],
  payload: Record<string, unknown>,
): Promise<Array<{ data: string; mimeType: string }>> {
  if (!Array.isArray(payload.references)) return [];
  const references = [];
  for (let index = 0; index < payload.references.length; index++) {
    const reference = requireRecord(
      payload.references[index],
      `references.${index}`,
    );
    const bucket = requireString(
      reference.bucket,
      `references.${index}.bucket`,
    );
    const path = requireString(reference.path, `references.${index}.path`);
    const mimeType = typeof reference.mimeType === "string"
      ? reference.mimeType
      : "image/png";
    const bytes = await downloadBytes(service, bucket, path);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    references.push({ data: btoa(binary), mimeType });
  }
  return references;
}

async function acquireSource(
  service: Parameters<typeof downloadBytes>[0],
  requestRow: Record<string, unknown>,
  payload: Record<string, unknown>,
): Promise<
  {
    bytes: Uint8Array;
    mimeType: string;
    providerRequestId: string | null;
    endpoint: string;
  }
> {
  const provider = requireString(requestRow.provider, "provider") as
    | "openai"
    | "google"
    | "higgsfield"
    | "manual"
    | "blender"
    | "deterministic";
  const model = requireString(requestRow.model, "model");
  const plan = buildProviderPlan({ provider, model });
  if (!plan.invokeProvider) {
    const sourceBucket = requireString(
      payload.sourceBucket,
      "requestPayload.sourceBucket",
    );
    const sourcePath = requireString(
      payload.sourcePath,
      "requestPayload.sourcePath",
    );
    return {
      bytes: await downloadBytes(service, sourceBucket, sourcePath),
      mimeType: typeof payload.sourceMimeType === "string"
        ? payload.sourceMimeType
        : "image/png",
      providerRequestId: null,
      endpoint: "private-storage",
    };
  }

  const prompt = requireString(payload.prompt, "requestPayload.prompt");
  const references = await loadReferences(service, payload);
  if (provider === "openai") {
    // GPT Image 2.5 adds `xhigh` above `high`, and editing precision is the
    // whole reason Sunburst is the default here. gpt-image-2 caps at `high`,
    // so it keeps the exact request it has always sent.
    //
    // `background` stays "opaque" for every model, including 2.5, which *can*
    // emit true transparency: clampDecodedMaterialToAuthority overwrites alpha
    // with the authority mask byte-for-byte, so generated alpha is discarded
    // anyway, and an opaque render guarantees painted RGB under every mask
    // pixel instead of sampling unpainted fringe at the silhouette edge.
    const openAIModel = model as OpenAIImageModel;
    const isGptImage25 = openAIModel === "gpt-image-2.5-sunburst" ||
      openAIModel === "gpt-image-2.5-flare";
    const result = await OpenAIProvider.generateImage({
      prompt,
      model: openAIModel,
      size: "2080x2288",
      quality: isGptImage25 ? "xhigh" : "high",
      background: "opaque",
      referenceImages: references,
      user: String(requestRow.requested_by),
    });
    return {
      bytes: decode(result.imageBase64),
      mimeType: result.mimeType,
      providerRequestId: null,
      endpoint: result.endpoint,
    };
  }
  if (provider === "google") {
    const result = await callGeminiImage({
      prompt,
      model,
      aspectRatio: "10:11",
      imageSize: "2K",
      referenceImages: references,
    });
    return {
      bytes: decode(result.data),
      mimeType: result.mimeType ?? "image/png",
      providerRequestId: null,
      endpoint: "generateContent",
    };
  }
  throw new PaperDollActionError(
    422,
    "provider_not_configured",
    "Higgsfield generation is not configured for this worker.",
    [
      {
        field: "provider",
        message: "Choose OpenAI, Google, or a versioned manual/Blender source.",
      },
    ],
  );
}

Deno.serve((request) =>
  runPaperDollAction(request, async () => {
    const body = requireRecord(await request.json());
    const organizationId = requireString(body.organizationId, "organizationId");
    const workerId = requireString(body.workerId, "workerId");
    const context = await createPaperDollActionContext(request, organizationId);

    const { data: claimedRows, error: claimError } = await context.service.rpc(
      "paper_doll_claim_candidate_request",
      { p_organization_id: organizationId, p_worker_id: workerId },
    );
    if (claimError) {
      databaseError(claimError, "Candidate request could not be claimed.");
    }
    const requestRow = Array.isArray(claimedRows)
      ? claimedRows[0] as Record<string, unknown> | undefined
      : undefined;
    if (!requestRow) {
      return jsonResponse(200, { status: "idle", claimed: false });
    }

    const requestId = requireString(requestRow.id, "request.id");
    const payload = requireRecord(requestRow.request_payload, "requestPayload");
    validateOriginalFilename(
      requireString(requestRow.original_filename, "originalFilename"),
    );
    const { data: lastAttempt, error: lastAttemptError } = await context.service
      .from("paper_doll_candidate_attempts")
      .select("attempt_number")
      .eq("organization_id", organizationId)
      .eq("request_id", requestId)
      .order("attempt_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastAttemptError) {
      databaseError(lastAttemptError, "Candidate attempt allocation failed.");
    }
    const { data: attempt, error: attemptError } = await context.service
      .from("paper_doll_candidate_attempts")
      .insert({
        organization_id: organizationId,
        request_id: requestId,
        attempt_number: Number(lastAttempt?.attempt_number ?? 0) + 1,
        attempt_status: "running",
        worker_id: workerId,
      })
      .select("id, attempt_number")
      .single();
    if (attemptError || !attempt) {
      databaseError(attemptError, "Candidate attempt could not be appended.");
    }

    try {
      const authorityPathInput = requireString(
        payload.authorityMaskPath,
        "requestPayload.authorityMaskPath",
      );
      const authorityLocation = storageLocation(
        authorityPathInput,
        AUTHORITY_BUCKET,
      );
      const authorityBytes = await downloadBytes(
        context.service,
        authorityLocation.bucket,
        authorityLocation.path,
      );
      const actualAuthoritySha256 = await sha256Hex(authorityBytes);
      const expectedAuthoritySha256 = requireString(
        payload.authorityMaskSha256,
        "requestPayload.authorityMaskSha256",
      );
      if (actualAuthoritySha256 !== expectedAuthoritySha256) {
        throw new PaperDollActionError(
          409,
          "stale_authority_mask",
          "Authority-mask content changed before generation.",
          [
            {
              field: "authorityMaskSha256",
              message: "Exact authority-mask SHA-256 does not match.",
            },
          ],
        );
      }
      const decodedAuthority = await Image.decode(authorityBytes) as Image;
      const authority: DecodedAuthorityMask = {
        width: decodedAuthority.width,
        height: decodedAuthority.height,
        alpha: new Uint8Array(decodedAuthority.width * decodedAuthority.height),
        bounds: detectedAlphaBounds(decodedAuthority),
      };
      for (let index = 0; index < authority.alpha.length; index++) {
        authority.alpha[index] = decodedAuthority.bitmap[index * 4 + 3];
      }
      const expectedAuthorityBounds = pixelBounds(
        payload.authorityBounds,
        "requestPayload.authorityBounds",
      );
      if (
        stableJson(authority.bounds) !== stableJson(expectedAuthorityBounds)
      ) {
        throw new PaperDollActionError(
          409,
          "stale_authority_bounds",
          "Authority bounds differ from reviewed bounds.",
          [
            {
              field: "authorityBounds",
              message: "Recalibrate the authority mask before generation.",
            },
          ],
        );
      }

      const source = await acquireSource(context.service, requestRow, payload);
      const sourceSha256 = await sha256Hex(source.bytes);
      const material = await Image.decode(source.bytes) as Image;
      const sourceBounds = pixelBounds(
        payload.sourceBounds,
        "requestPayload.sourceBounds",
      );
      const clamped = clampDecodedMaterialToAuthority({
        material: {
          width: material.width,
          height: material.height,
          rgba: material.bitmap,
        },
        sourceBounds,
        authority,
      });
      const finalImage = new Image(authority.width, authority.height);
      finalImage.bitmap.set(clamped.rgba);
      const finalBytes = await finalImage.encode();
      const normalizedSha256 = await sha256Hex(finalBytes);
      const candidateId = crypto.randomUUID();
      const paths = buildCandidateStoragePaths({
        organizationId,
        familyKey: requireString(requestRow.family_key, "familyKey"),
        candidateId,
        sourceSha256,
      });
      const manifest = {
        candidateId,
        requestId,
        attemptId: attempt.id,
        originalFilename: requestRow.original_filename,
        provider: requestRow.provider,
        model: requestRow.model,
        sourceSha256,
        normalizedSha256,
        authorityMaskSha256: actualAuthoritySha256,
        sourceBounds,
        editBounds: pixelBounds(
          payload.editBounds,
          "requestPayload.editBounds",
        ),
        authorityBounds: authority.bounds,
        placementBounds: pixelBounds(
          payload.placementBounds,
          "requestPayload.placementBounds",
        ),
        qa: clamped.qa,
      };
      const artifacts: Array<
        { path: string; bytes: Uint8Array; contentType: string }
      > = [
        { path: paths.raw, bytes: source.bytes, contentType: source.mimeType },
        { path: paths.candidate, bytes: finalBytes, contentType: "image/png" },
        { path: paths.layer, bytes: finalBytes, contentType: "image/png" },
        { path: paths.review, bytes: finalBytes, contentType: "image/png" },
        {
          path: paths.manifest,
          bytes: new TextEncoder().encode(stableJson(manifest)),
          contentType: "application/json",
        },
      ];
      for (const artifact of artifacts) {
        const { error } = await context.service.storage.from(CANDIDATE_BUCKET)
          .upload(
            artifact.path,
            artifact.bytes,
            { contentType: artifact.contentType, upsert: false },
          );
        if (error) {
          databaseError(
            error,
            `Candidate artifact ${artifact.path} could not be stored.`,
          );
        }
      }

      const { data: candidate, error: candidateError } = await context.service
        .from("paper_doll_component_candidates")
        .insert({
          id: candidateId,
          organization_id: organizationId,
          request_id: requestId,
          attempt_id: attempt.id,
          component_id: requestRow.component_id,
          variant_key: requestRow.variant_key,
          original_filename: requestRow.original_filename,
          source_path: `private://${CANDIDATE_BUCKET}/${paths.raw}`,
          source_sha256: sourceSha256,
          normalized_path: `private://${CANDIDATE_BUCKET}/${paths.candidate}`,
          normalized_sha256: normalizedSha256,
          layer_path: `private://${CANDIDATE_BUCKET}/${paths.layer}`,
          layer_sha256: normalizedSha256,
          authority_mask_path:
            `private://${authorityLocation.bucket}/${authorityLocation.path}`,
          authority_mask_sha256: actualAuthoritySha256,
          source_bounds: sourceBounds,
          edit_bounds: manifest.editBounds,
          authority_bounds: authority.bounds,
          placement_bounds: manifest.placementBounds,
          provider: requestRow.provider,
          model: requestRow.model,
          prompt_sha256: requestRow.prompt_sha256,
          estimated_cost_usd: typeof payload.estimatedCostUsd === "number"
            ? payload.estimatedCostUsd
            : null,
          qa: clamped.qa,
          lifecycle_state: "candidate",
        })
        .select("id")
        .single();
      if (candidateError || !candidate) {
        databaseError(
          candidateError,
          "Normalized candidate could not be appended.",
        );
      }

      const completedAt = new Date().toISOString();
      const attemptResult = {
        candidateId,
        paths,
        sourceSha256,
        normalizedSha256,
        authorityMaskSha256: actualAuthoritySha256,
        qa: clamped.qa,
        providerEndpoint: source.endpoint,
      };
      const { error: completeAttemptError } = await context.service
        .from("paper_doll_candidate_attempts")
        .update({
          attempt_status: "succeeded",
          provider_request_id: source.providerRequestId,
          result: attemptResult,
          completed_at: completedAt,
        })
        .eq("id", attempt.id)
        .eq("attempt_status", "running");
      if (completeAttemptError) {
        databaseError(
          completeAttemptError,
          "Candidate attempt completion could not be recorded.",
        );
      }
      const { error: completeRequestError } = await context.service
        .from("paper_doll_candidate_requests")
        .update({ request_status: "succeeded", completed_at: completedAt })
        .eq("id", requestId)
        .eq("request_status", "claimed")
        .eq("claimed_by", workerId);
      if (completeRequestError) {
        databaseError(
          completeRequestError,
          "Candidate request completion could not be recorded.",
        );
      }

      return jsonResponse(200, {
        status: "candidate",
        claimed: true,
        requestId,
        attemptId: attempt.id,
        candidateId,
        qa: clamped.qa,
        lifecycleState: "candidate",
        approved: false,
        released: false,
        sanityChanged: false,
      });
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "Candidate generation failed.";
      const completedAt = new Date().toISOString();
      await context.service.from("paper_doll_candidate_attempts").update({
        attempt_status: "failed",
        error_message: message,
        completed_at: completedAt,
      }).eq("id", attempt.id).eq("attempt_status", "running");
      await context.service.from("paper_doll_candidate_requests").update({
        request_status: "failed",
        completed_at: completedAt,
      }).eq("id", requestId).eq("request_status", "claimed").eq(
        "claimed_by",
        workerId,
      );
      throw error;
    }
  })
);
