/**
 * Collapse a background-preset variation list to one deterministic text.
 * Random draws made identical clicks produce different lighting and hex.
 */
export function pickFixedBackgroundVariation(
  variations: readonly string[] | undefined,
): string {
  return variations?.[0] ?? "";
}
