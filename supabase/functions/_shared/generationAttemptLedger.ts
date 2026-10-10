type LedgerClient = { from: (table: string) => any };

export const GENERATION_ATTEMPTS_TABLE = "generation_attempts";
export const LEDGER_ERROR_MAX_CHARS = 2000;

export interface GenerationAttemptTracker {
  id: string | null;
  startedAtMs: number;
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function estimateUnverifiedCostUsd(provider: string, model?: string | null): number | null {
  return provider === "openai" && model === "gpt-image-2" ? 0.42 : null;
}

export interface GenerationAttemptInsertInput {
  organizationId: string | null;
  userId: string | null;
  sessionId?: string | null;
  lane: string;
  provider: string;
  model: string;
  endpoint: string | null;
  requestSize?: string | null;
  requestResolution?: string | null;
  prompt: string;
  /** Precomputed SHA-256 hex fingerprints of the reference payloads. */
  referenceSha256s?: string[];
  /**
   * Raw reference payloads (base64 strings or bytes). Hashed here when
   * referenceSha256s is not supplied. Never stored.
   */
  referenceFingerprintSources?: Array<string | Uint8Array<ArrayBuffer>>;
  referenceUrls?: string[];
  graceSku?: string | null;
  websiteSku?: string | null;
  productGroupSlug?: string | null;
  seed?: number | null;
  codeCommit?: string | null;
  requestParams?: Record<string, unknown>;
}

async function sha256HexBytes(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function resolveReferenceSha256s(input: Pick<GenerationAttemptInsertInput, "referenceSha256s" | "referenceFingerprintSources">): Promise<string[]> {
  if (Array.isArray(input.referenceSha256s)) return input.referenceSha256s;
  const sources = Array.isArray(input.referenceFingerprintSources) ? input.referenceFingerprintSources : [];
  return Promise.all(
    sources.map((source) => (typeof source === "string" ? sha256Hex(source) : sha256HexBytes(source))),
  );
}

export async function buildGenerationAttemptInsert(input: GenerationAttemptInsertInput) {
  const referenceSha256s = await resolveReferenceSha256s(input);
  return {
    organization_id: input.organizationId,
    user_id: input.userId,
    session_id: input.sessionId ?? null,
    lane: input.lane,
    provider: input.provider,
    model: input.model,
    endpoint: input.endpoint,
    request_size: input.requestSize ?? null,
    request_resolution: input.requestResolution ?? null,
    prompt_sha256: await sha256Hex(input.prompt ?? ""),
    prompt_chars: (input.prompt ?? "").length,
    reference_count: referenceSha256s.length,
    reference_sha256s: referenceSha256s,
    reference_urls: input.referenceUrls ?? null,
    grace_sku: input.graceSku ?? null,
    website_sku: input.websiteSku ?? null,
    product_group_slug: input.productGroupSlug ?? null,
    seed: typeof input.seed === "number" && Number.isFinite(input.seed) ? Math.trunc(input.seed) : null,
    status: "pending",
    estimated_cost_usd: estimateUnverifiedCostUsd(input.provider, input.model),
    code_commit: input.codeCommit ?? null,
    request_params: input.requestParams ?? null,
  };
}

export function buildGenerationAttemptCompletion(
  tracker: GenerationAttemptTracker,
  input: {
    status: "succeeded" | "failed";
    errorMessage?: string;
    outputUrl?: string;
    revisedPrompt?: string;
  },
  nowMs = Date.now(),
) {
  return {
    status: input.status,
    completed_at: new Date(nowMs).toISOString(),
    latency_ms: Math.max(0, Math.round(nowMs - tracker.startedAtMs)),
    ...(input.errorMessage ? { error_message: input.errorMessage.slice(0, LEDGER_ERROR_MAX_CHARS) } : {}),
    ...(input.outputUrl ? { output_url: input.outputUrl } : {}),
    ...(input.revisedPrompt ? { revised_prompt: input.revisedPrompt } : {}),
  };
}

export async function beginGenerationAttempt(
  client: LedgerClient,
  input: Parameters<typeof buildGenerationAttemptInsert>[0],
): Promise<GenerationAttemptTracker> {
  const tracker: GenerationAttemptTracker = { id: null, startedAtMs: Date.now() };
  try {
    const { data, error } = await client
      .from(GENERATION_ATTEMPTS_TABLE)
      .insert(await buildGenerationAttemptInsert(input))
      .select("id")
      .single();
    if (error) throw error;
    tracker.id = data?.id ?? null;
  } catch (error) {
    console.warn("[paper-doll generation ledger] begin failed:", error);
  }
  return tracker;
}

export async function completeGenerationAttempt(
  client: LedgerClient,
  tracker: GenerationAttemptTracker | null,
  input: Parameters<typeof buildGenerationAttemptCompletion>[1],
): Promise<void> {
  if (!tracker?.id) return;
  try {
    const { error } = await client
      .from(GENERATION_ATTEMPTS_TABLE)
      .update(buildGenerationAttemptCompletion(tracker, input))
      .eq("id", tracker.id);
    if (error) throw error;
  } catch (error) {
    console.warn("[paper-doll generation ledger] completion failed:", error);
  }
}
