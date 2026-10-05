/**
 * Black Forest Labs FLUX 3 Image client.
 *
 * POST https://api.bfl.ai/v1/flux-3-image with header x-key: $BFL_API_KEY.
 * The submit response is async: poll polling_url until status is Ready, then
 * download result.sample. The sample URL expires in about an hour and must be
 * fetched without the API key.
 *
 * Docs: https://docs.bfl.ai/flux_3/flux3_image_generate
 */

import {
  BFL_FLUX3_ENDPOINT,
  buildFlux3RequestBody,
  type Flux3RequestInput,
} from "./bflFlux3Layout.ts";
import { isPubliclyFetchableUrl } from "./urlSafety.ts";

const IN_PROGRESS = new Set(["Pending", "Reasoning", "Generating"]);
const DEFAULT_SUBMIT_TIMEOUT_MS = 60_000;
const DEFAULT_POLL_TIMEOUT_MS = 180_000;
const DEFAULT_POLL_INTERVAL_MS = 1_500;
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 120_000;

export class BflProviderError extends Error {
  readonly code: string;
  readonly httpStatus: number | undefined;

  constructor(message: string, code = "bfl_error", httpStatus?: number) {
    super(message);
    this.name = "BflProviderError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export interface BflClientDeps {
  getEnv: (name: string) => string | undefined;
  fetchImpl: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

export interface Flux3GenerateParams extends Flux3RequestInput {
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  submitTimeoutMs?: number;
  downloadTimeoutMs?: number;
}

export interface Flux3GenerateResult {
  imageBytes: Uint8Array;
  mimeType: string;
  taskId: string;
  pollingUrl: string;
  revisedPrompt?: string;
  durationSeconds?: number;
  cost?: number | null;
}

function defaultGetEnv(name: string): string | undefined {
  const deno = (globalThis as { Deno?: { env: { get: (key: string) => string | undefined } } }).Deno;
  const fromDeno = deno?.env?.get?.(name);
  if (fromDeno && fromDeno.trim()) return fromDeno;
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env?.[name];
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function resolveBflDeps(overrides?: Partial<BflClientDeps>): BflClientDeps {
  return {
    getEnv: overrides?.getEnv ?? defaultGetEnv,
    fetchImpl: overrides?.fetchImpl ?? fetch,
    sleep: overrides?.sleep ?? defaultSleep,
    now: overrides?.now ?? Date.now,
  };
}

export function readBflApiKey(getEnv: BflClientDeps["getEnv"] = defaultGetEnv): string {
  const key = getEnv("BFL_API_KEY")?.trim();
  if (!key) {
    throw new BflProviderError(
      "FLUX 3 Image requires BFL_API_KEY. Add it as a Supabase edge secret and to the local edge environment, then redeploy generate-madison-image. No key is bundled with Madison.",
      "missing_api_key",
    );
  }
  return key;
}

function timeoutSignal(ms: number): AbortSignal {
  return AbortSignal.timeout(ms);
}

async function readBody(response: Response): Promise<{ json: Record<string, unknown> | null; text: string }> {
  const text = await response.text();
  if (!text.trim()) return { json: null, text };
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { json: parsed as Record<string, unknown>, text };
    }
    return { json: null, text };
  } catch {
    return { json: null, text };
  }
}

function formatValidationDetail(json: Record<string, unknown> | null, text: string): string {
  const detail = json?.detail;
  if (typeof detail === "string" && detail.trim()) return detail.trim();
  if (Array.isArray(detail)) {
    const parts = detail.map((entry) => {
      if (!entry || typeof entry !== "object") return String(entry);
      const record = entry as Record<string, unknown>;
      const loc = Array.isArray(record.loc)
        ? record.loc.filter((part) => part !== "body").join(".")
        : "";
      const msg = typeof record.msg === "string" ? record.msg : "invalid";
      return loc ? `${loc}: ${msg}` : msg;
    });
    if (parts.length > 0) return parts.join("; ");
  }
  return text.trim().slice(0, 500) || "The request was rejected.";
}

function assertBflPollingUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new BflProviderError("FLUX 3 returned a polling URL Madison cannot use.", "bad_polling_url");
  }
  const host = parsed.hostname.toLowerCase();
  const allowed = host === "api.bfl.ai" || host.endsWith(".bfl.ai") || host === "api.bfl.ml" || host.endsWith(".bfl.ml");
  if (parsed.protocol !== "https:" || !allowed) {
    throw new BflProviderError("FLUX 3 returned a polling URL outside the Black Forest Labs API.", "bad_polling_url");
  }
  return parsed;
}

function statusOf(json: Record<string, unknown> | null): string | null {
  return json && typeof json.status === "string" ? json.status : null;
}

function failureForStatus(status: string, json: Record<string, unknown>): BflProviderError {
  if (status === "Request Moderated") {
    return new BflProviderError(
      "FLUX 3 blocked the prompt or a reference image (Request Moderated). Change the input and try again. Retrying the same request will fail again.",
      "request_moderated",
    );
  }
  if (status === "Content Moderated") {
    return new BflProviderError(
      "FLUX 3 blocked the generated image (Content Moderated). Adjust the prompt and submit again.",
      "content_moderated",
    );
  }
  if (status === "Task not found") {
    return new BflProviderError(
      "FLUX 3 could not find this task. It may have expired. Submit a new request.",
      "task_not_found",
    );
  }
  if (status === "Error") {
    const detail = json.detail ?? json.error ?? json.result;
    const extra = detail ? ` ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 400)}` : "";
    return new BflProviderError(`FLUX 3 Image failed.${extra}`, "task_error");
  }
  return new BflProviderError(`FLUX 3 Image returned status "${status}".`, "unexpected_status");
}

function httpFailure(httpStatus: number, json: Record<string, unknown> | null, text: string): BflProviderError {
  if (httpStatus === 402) {
    return new BflProviderError(
      "FLUX 3 Image credits depleted (HTTP 402). Add credits in the Black Forest Labs dashboard.",
      "payment_required",
      402,
    );
  }
  if (httpStatus === 429) {
    return new BflProviderError(
      "FLUX 3 Image rate limit reached (HTTP 429). Wait a moment and try again.",
      "rate_limited",
      429,
    );
  }
  if (httpStatus === 422) {
    return new BflProviderError(
      `FLUX 3 Image rejected the request (HTTP 422): ${formatValidationDetail(json, text)}`,
      "validation",
      422,
    );
  }
  if (httpStatus === 400) {
    return new BflProviderError(
      `FLUX 3 Image rejected a reference image (HTTP 400): ${formatValidationDetail(json, text)}`,
      "bad_request",
      400,
    );
  }
  return new BflProviderError(
    `FLUX 3 Image request failed (HTTP ${httpStatus}): ${formatValidationDetail(json, text)}`,
    "http_error",
    httpStatus,
  );
}

export async function generateFlux3Image(
  params: Flux3GenerateParams,
  overrides?: Partial<BflClientDeps>,
): Promise<Flux3GenerateResult> {
  const deps = resolveBflDeps(overrides);
  const apiKey = readBflApiKey(deps.getEnv);
  const body = buildFlux3RequestBody(params);
  const submitTimeout = params.submitTimeoutMs ?? DEFAULT_SUBMIT_TIMEOUT_MS;
  const pollTimeout = params.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
  const pollInterval = params.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const downloadTimeout = params.downloadTimeoutMs ?? DEFAULT_DOWNLOAD_TIMEOUT_MS;

  let submitResponse: Response;
  try {
    submitResponse = await deps.fetchImpl(BFL_FLUX3_ENDPOINT, {
      method: "POST",
      headers: {
        "x-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: timeoutSignal(submitTimeout),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "network error";
    throw new BflProviderError(`FLUX 3 Image submit failed: ${message}`, "submit_failed");
  }

  const submitted = await readBody(submitResponse);
  if (!submitResponse.ok) {
    throw httpFailure(submitResponse.status, submitted.json, submitted.text);
  }
  const pollingUrlRaw = submitted.json?.polling_url;
  const taskId = submitted.json?.id;
  if (typeof pollingUrlRaw !== "string" || typeof taskId !== "string") {
    throw new BflProviderError("FLUX 3 Image submit did not return id and polling_url.", "bad_submit");
  }
  const pollingUrl = assertBflPollingUrl(pollingUrlRaw).toString();

  const started = deps.now();
  let resultJson: Record<string, unknown> | null = null;
  while (true) {
    if (deps.now() - started > pollTimeout) {
      throw new BflProviderError(
        "FLUX 3 Image timed out while generating. Try again, or use 2K instead of 4K.",
        "poll_timeout",
      );
    }
    await deps.sleep(pollInterval);
    if (deps.now() - started > pollTimeout) {
      throw new BflProviderError(
        "FLUX 3 Image timed out while generating. Try again, or use 2K instead of 4K.",
        "poll_timeout",
      );
    }

    let pollResponse: Response;
    try {
      pollResponse = await deps.fetchImpl(pollingUrl, {
        method: "GET",
        headers: { "x-key": apiKey },
        signal: timeoutSignal(submitTimeout),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "network error";
      throw new BflProviderError(`FLUX 3 Image poll failed: ${message}`, "poll_failed");
    }
    const polled = await readBody(pollResponse);
    const status = statusOf(polled.json);
    if (!pollResponse.ok && pollResponse.status !== 503) {
      throw httpFailure(pollResponse.status, polled.json, polled.text);
    }
    if (pollResponse.status === 503 && !status) {
      continue;
    }
    if (!polled.json || !status) {
      throw new BflProviderError("FLUX 3 Image poll returned a response Madison could not read.", "bad_poll");
    }
    if (IN_PROGRESS.has(status)) continue;
    if (status === "Ready") {
      resultJson = polled.json;
      break;
    }
    throw failureForStatus(status, polled.json);
  }

  const result = resultJson?.result;
  const sample = result && typeof result === "object"
    ? (result as Record<string, unknown>).sample
    : undefined;
  if (typeof sample !== "string" || !isPubliclyFetchableUrl(sample)) {
    throw new BflProviderError("FLUX 3 Image finished without a downloadable image URL.", "missing_sample");
  }

  let imageResponse: Response;
  try {
    imageResponse = await deps.fetchImpl(sample, {
      method: "GET",
      signal: timeoutSignal(downloadTimeout),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "network error";
    throw new BflProviderError(`FLUX 3 Image download failed: ${message}`, "download_failed");
  }
  if (!imageResponse.ok) {
    throw new BflProviderError(
      `FLUX 3 Image download failed (HTTP ${imageResponse.status}). The sample URL expires after about an hour.`,
      "download_failed",
      imageResponse.status,
    );
  }
  const bytes = new Uint8Array(await imageResponse.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new BflProviderError("FLUX 3 Image download was empty.", "download_failed");
  }
  const mime = imageResponse.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() || "image/png";
  const resultRecord = result as Record<string, unknown>;
  return {
    imageBytes: bytes,
    mimeType: mime.startsWith("image/") ? mime : "image/png",
    taskId,
    pollingUrl,
    revisedPrompt: typeof resultRecord.prompt === "string" ? resultRecord.prompt : undefined,
    durationSeconds: typeof resultRecord.duration === "number" ? resultRecord.duration : undefined,
    cost: typeof submitted.json?.cost === "number" ? submitted.json.cost : null,
  };
}
