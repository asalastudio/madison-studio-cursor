export const CLAUDE_FALLBACK_MAX_TOKENS = 16384;

const FALLBACK_STATUSES = new Set([429, 403, 502, 503, 504]);

export function shouldFallbackToClaude(
  status: number,
  errorText = "",
): boolean {
  if (FALLBACK_STATUSES.has(status)) {
    return true;
  }

  if (status === 400) {
    const lower = errorText.toLowerCase();
    return (
      lower.includes("quota") ||
      lower.includes("rate") ||
      lower.includes("limit")
    );
  }

  return false;
}

export function isTruncatedFinishReason(
  reason: string | undefined,
): boolean {
  if (!reason) return false;
  const normalized = reason.toUpperCase();
  return normalized === "MAX_TOKENS" || normalized === "LENGTH";
}

export function buildContinuationUserPrompt(
  originalPrompt: string,
  partialText: string,
): string {
  return [
    originalPrompt,
    "",
    "Your previous response was cut off. Continue exactly from where you left off. Do not repeat earlier text.",
    "",
    "--- PREVIOUS OUTPUT (truncated) ---",
    partialText,
  ].join("\n");
}

export function geminiAuthHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-goog-api-key": apiKey,
  };
}

export function geminiGenerateContentUrl(
  endpoint: string,
  model: string,
): string {
  const base = endpoint.replace(/\/+$/, "");
  const path = model.startsWith("models/") ? model : `models/${model}`;
  return `${base}/${path}:generateContent`;
}

export async function withTimeout<T>(
  factory: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await factory(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      const abortError = new Error("API request timed out. Please try again.");
      abortError.name = "AbortError";
      throw abortError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export interface RetryOn503Options {
  maxRetries?: number;
  initialDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function fetchWithRetryOn503(
  factory: () => Promise<Response>,
  options: RetryOn503Options = {},
): Promise<Response> {
  const maxRetries = options.maxRetries ?? 3;
  const initialDelayMs = options.initialDelayMs ?? 500;
  const sleep = options.sleep ?? defaultSleep;

  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    lastResponse = await factory();
    if (lastResponse.status !== 503 || attempt === maxRetries - 1) {
      return lastResponse;
    }
    await sleep(initialDelayMs * Math.pow(2, attempt));
  }

  return lastResponse as Response;
}
