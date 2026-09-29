/**
 * Treat caller-supplied rewrite / prohibit strings as literals.
 * Compiling them as raw regexes is a ReDoS and prompt-tampering risk.
 */

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function applyLiteralRewriteRules(
  text: string,
  rules: Record<string, unknown> | null | undefined,
): string {
  if (!rules || typeof rules !== "object") return text;
  let out = text;
  for (const [from, to] of Object.entries(rules)) {
    if (typeof from !== "string" || from.length === 0) continue;
    out = out.replace(new RegExp(escapeRegExp(from), "gi"), String(to ?? ""));
  }
  return out;
}

export function stripLiteralTerms(
  text: string,
  terms: unknown[] | null | undefined,
  options: { wordBoundary?: boolean } = {},
): string {
  if (!Array.isArray(terms)) return text;
  let out = text;
  const wordBoundary = options.wordBoundary !== false;
  for (const term of terms) {
    if (typeof term !== "string" || term.length === 0) continue;
    const pattern = wordBoundary
      ? `\\b${escapeRegExp(term)}\\b`
      : escapeRegExp(term);
    out = out.replace(new RegExp(pattern, "gi"), "");
  }
  return out;
}
