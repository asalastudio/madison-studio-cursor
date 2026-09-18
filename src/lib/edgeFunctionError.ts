const GATEWAY_FAILURE = /non-2xx|502|504|internal server error|request idle timeout/i;

export async function extractFunctionErrorMessage(
  error: unknown,
  fallback: string,
): Promise<string> {
  if (!error) return fallback;
  try {
    const context = (
      error as { context?: { json?: () => Promise<unknown>; text?: () => Promise<string> } }
    ).context;
    if (context && typeof context.json === "function") {
      const body = await context.json();
      if (body && typeof body === "object" && "error" in body) {
        const message = (body as { error?: unknown }).error;
        if (typeof message === "string" && message.trim()) {
          return annotateGatewayFailure(message);
        }
      }
    }
    if (context && typeof context.text === "function") {
      const text = await context.text();
      if (text.trim()) return annotateGatewayFailure(text);
    }
  } catch {
    // Fall back to the top-level error below.
  }

  return annotateGatewayFailure(error instanceof Error ? error.message : fallback);
}

function annotateGatewayFailure(message: string): string {
  const trimmed = message.trim();
  if (!GATEWAY_FAILURE.test(trimmed)) return trimmed;
  return (
    "Shopify publish died after authorization (gateway 502). " +
    "The live write no longer asks Shopify to fetch the Madison image URL; it uploads the bytes. " +
    "Try Publish once more. If it 502s again, the Shopify media ingest itself failed."
  );
}
