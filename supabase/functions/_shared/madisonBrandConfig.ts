/**
 * Madison brand config — image prompt adapter.
 *
 * Pulls the subset of `madison_system_config` fields that actually steer
 * image generation (editorial philosophy, voice spectrum, quality standards)
 * and formats them as a compact PROMPT suffix suitable for appending to
 * every product_photography request.
 *
 * Why not reuse generate-with-claude's `getMadisonSystemConfig()` directly:
 *   - That function returns a ~15KB string with training-document dumps,
 *     persona box drawings, author profiles, and brand-authority sections —
 *     all of which are valuable for text/copy generation but noise for
 *     image models (which can't parse ASCII box drawings or author matrices
 *     and get confused by the 8-author copywriter routing).
 *   - Image prompts need to stay tight (1-3KB total) or the provider starts
 *     ignoring the bottom of the prompt. We extract only the visual-relevant
 *     fields and render them as a single terse paragraph.
 *
 * What this returns:
 *   - Empty string if the org hasn't populated madison_system_config yet
 *     (lets the caller short-circuit without a conditional branch)
 *   - Otherwise a ~500-1500 char "BRAND STANDARD" block with:
 *       • Editorial philosophy (tone/direction)
 *       • Voice spectrum (adjectives that shape visual register)
 *       • Quality standards (what good looks like)
 *   - We deliberately skip `persona`, `writing_influences`, `forbidden_phrases`
 *     — those are for text generation. Injecting them into image prompts
 *     has been observed to bias the model toward adding text overlays,
 *     handwritten captions, and author signatures, which is the opposite
 *     of Muted Luxury product photography.
 */

// deno-lint-ignore-file no-explicit-any

interface MadisonBrandImageContext {
  /** Pre-formatted PROMPT suffix, empty string if no config exists. */
  promptSuffix: string;
  /** True if any madison_system_config row was read. */
  hasConfig: boolean;
  /** Number of characters in the suffix — useful for token-budget logging. */
  suffixLength: number;
}

/**
 * Fetch madison_system_config and format the image-relevant fields as a
 * prompt suffix. Safe to call on every invocation — fails silently and
 * returns an empty suffix if the table is missing, empty, or errors.
 *
 * @param supabase - Supabase client (should be service-role-scoped so it
 *                   can read across RLS — the settings table is gated to
 *                   super_admin writes but we read it via service role)
 */
export async function getMadisonBrandImageContext(
  supabase: any,
): Promise<MadisonBrandImageContext> {
  const empty: MadisonBrandImageContext = {
    promptSuffix: "",
    hasConfig: false,
    suffixLength: 0,
  };

  try {
    const { data, error } = await supabase
      .from("madison_system_config")
      .select(
        "editorial_philosophy, voice_spectrum, quality_standards",
      )
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn("[madisonBrandConfig] Failed to fetch config:", error.message);
      return empty;
    }
    if (!data) return empty;

    const parts: string[] = [];

    // Each field is optional. Only include non-empty ones. Keep the labels
    // short — image models respond better to compact instructions than to
    // long decorative headers.
    if (typeof data.editorial_philosophy === "string" && data.editorial_philosophy.trim()) {
      parts.push(`EDITORIAL: ${truncate(data.editorial_philosophy, 600)}`);
    }
    if (typeof data.voice_spectrum === "string" && data.voice_spectrum.trim()) {
      parts.push(`VOICE: ${truncate(data.voice_spectrum, 400)}`);
    }
    if (typeof data.quality_standards === "string" && data.quality_standards.trim()) {
      parts.push(`QUALITY: ${truncate(data.quality_standards, 600)}`);
    }

    if (parts.length === 0) return { ...empty, hasConfig: true };

    const suffix = `\n\nBRAND STANDARD (do not add text overlays or signatures — this steers lighting, tonal register, and mood only):\n${parts.join("\n")}`;
    return {
      promptSuffix: suffix,
      hasConfig: true,
      suffixLength: suffix.length,
    };
  } catch (err) {
    console.warn(
      "[madisonBrandConfig] Unexpected error:",
      err instanceof Error ? err.message : String(err),
    );
    return empty;
  }
}

/**
 * Single-line truncation that preserves word boundaries. Image prompts
 * don't need the "... [truncated]" suffix that the text path uses, because
 * they're already a compact directive — a clean break mid-sentence is fine.
 */
function truncate(s: string, max: number): string {
  const trimmed = s.trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) return trimmed;
  const slice = trimmed.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  return lastSpace > max - 50 ? slice.slice(0, lastSpace) : slice;
}
