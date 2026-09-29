/**
 * Convex production hides thrown-error bodies. Dest includes them after
 * `[Request ID] Server Error`. Madison toasts were showing only the wrapper.
 */

export function formatConvexServerError(errorMessage: string | null | undefined): string {
  const text = (errorMessage ?? "").trim();
  if (!text) return "Best Bottles Convex sync failed";

  const uncaught = text.match(/Uncaught Error:\s*([^\n]+)/);
  if (uncaught?.[1]) return uncaught[1].trim();

  const missing = text.match(/Could not find public function for '([^']+)'/);
  if (missing?.[1]) return `Best Bottles Convex is missing ${missing[1]}`;

  return text;
}

/**
 * `setProductGroupHeroFromApprovedSku` exists on dest, not on production.
 * Production reports the missing function as a bare `[Request ID] Server Error`.
 */
export function shouldFallbackCatalogHeroToPrimarySku(
  errorMessage: string | null | undefined,
): boolean {
  const text = (errorMessage ?? "").trim();
  if (
    /Could not find public function for 'products:setProductGroupHeroFromApprovedSku'/
      .test(text)
  ) {
    return true;
  }
  return /^\[[^\]]+\] Server Error$/.test(text);
}
