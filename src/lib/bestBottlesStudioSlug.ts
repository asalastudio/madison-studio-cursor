/**
 * Pipeline workbench slugs are not always Convex slugs. Screw-cap / phenolic
 * cards are often labeled `…-capclosure` in Madison, while Convex stores the
 * same group without that suffix (`cylinder-5ml-clear-13-415`).
 */

export function studioProductGroupSlugCandidates(slug: string): string[] {
  const trimmed = slug.trim();
  if (!trimmed) return [];
  const aliases = [trimmed];
  if (trimmed.endsWith("-capclosure")) {
    aliases.push(trimmed.slice(0, -"-capclosure".length));
  }
  return [...new Set(aliases)];
}

export function canonicalStudioProductGroupSlug(slug: string): string {
  const candidates = studioProductGroupSlugCandidates(slug);
  return candidates[candidates.length - 1] ?? slug.trim();
}
