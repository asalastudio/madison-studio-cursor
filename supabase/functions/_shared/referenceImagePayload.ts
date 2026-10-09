/**
 * Reference image payloads for generate-madison-image.
 *
 * The edge worker has a small CPU budget. The old path downloaded each
 * reference, base64-encoded it, then the OpenAI provider decoded it back with a
 * per-byte callback (`Uint8Array.from(atob(x), c => c.charCodeAt(0))`). With
 * three ~2 MB rigged PNGs that round trip alone exceeded the CPU limit
 * (546 "CPU Time exceeded", Oct 9 2026 12:34 PT).
 *
 * Now:
 * - Supabase Storage references are fetched through the Storage image
 *   transformer, so they arrive already shrunk to REFERENCE_MAX_EDGE_PX
 *   (WebP keeps product alpha). The resize costs this worker nothing.
 * - Bytes are kept as bytes. Base64 is produced lazily, once, only for
 *   providers that need it (Gemini inlineData, FLUX 3 raw base64).
 * - A combined-size budget is enforced before any provider call.
 * Dependency-free so it runs under both Deno and node:test.
 */

export const REFERENCE_MAX_EDGE_PX = 1536;
export const REFERENCE_TRANSFORM_QUALITY = 85;
export const MAX_REFERENCE_IMAGE_BYTES = 5 * 1024 * 1024;
/** Single-reference requests may use up to this many bytes. */
export const MAX_TOTAL_REFERENCE_IMAGE_BYTES = 12 * 1024 * 1024;
/**
 * Multi-reference requests get a tighter budget: every extra image is extra
 * multipart/base64 work inside one CPU-limited worker.
 */
export const MAX_MULTI_REFERENCE_TOTAL_BYTES = 6 * 1024 * 1024;

export interface ReferenceImagePayload {
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly mimeType: string;
  /** Raw base64, computed on first read and cached. */
  readonly data: string;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + chunk) as unknown as number[],
    );
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64.replace(/\s/g, ""));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function createReferencePayload(
  bytes: Uint8Array<ArrayBuffer>,
  mimeType: string,
  knownBase64?: string,
): ReferenceImagePayload {
  let cached: string | undefined = knownBase64;
  return {
    bytes,
    mimeType,
    get data() {
      if (cached === undefined) cached = bytesToBase64(bytes);
      return cached;
    },
  };
}

/** Bytes for a payload that may come from older callers with only `data`. */
export function referenceBytes(ref: { bytes?: Uint8Array<ArrayBuffer>; data: string }): Uint8Array<ArrayBuffer> {
  return ref.bytes instanceof Uint8Array ? ref.bytes : base64ToBytes(ref.data);
}

/**
 * Rewrite a public Supabase Storage object URL to the image transformer so
 * the reference arrives at most `maxEdge` px on its long side. Returns null
 * for anything that is not a public object URL on this project.
 */
export function storageTransformUrl(
  url: string,
  supabaseUrl: string | undefined | null,
  maxEdge = REFERENCE_MAX_EDGE_PX,
  quality = REFERENCE_TRANSFORM_QUALITY,
): string | null {
  if (!supabaseUrl) return null;
  let parsed: URL;
  let base: URL;
  try {
    parsed = new URL(url);
    base = new URL(supabaseUrl);
  } catch {
    return null;
  }
  if (parsed.origin !== base.origin) return null;
  const marker = "/storage/v1/object/public/";
  if (!parsed.pathname.startsWith(marker)) return null;
  const objectPath = parsed.pathname.slice(marker.length);
  if (!objectPath) return null;
  const out = new URL(`${base.origin}/storage/v1/render/image/public/${objectPath}`);
  out.searchParams.set("width", String(maxEdge));
  out.searchParams.set("height", String(maxEdge));
  out.searchParams.set("resize", "contain");
  out.searchParams.set("quality", String(quality));
  return out.toString();
}

export class ReferenceBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReferenceBudgetError";
  }
}

export function totalReferenceBudget(expectedCount: number): number {
  return expectedCount > 1 ? MAX_MULTI_REFERENCE_TOTAL_BYTES : MAX_TOTAL_REFERENCE_IMAGE_BYTES;
}

/** Throws before the provider call when one or all references are too large. */
export function assertReferenceBudget(
  sizes: number[],
  nextSize: number,
  expectedCount: number,
): void {
  if (nextSize > MAX_REFERENCE_IMAGE_BYTES) {
    throw new ReferenceBudgetError(
      `Reference image is too large for edge generation (${(nextSize / 1024 / 1024).toFixed(1)}MB). Use a PNG, JPG or WebP under 5MB.`,
    );
  }
  const total = sizes.reduce((a, b) => a + b, 0) + nextSize;
  const budget = totalReferenceBudget(expectedCount);
  if (total > budget) {
    throw new ReferenceBudgetError(
      expectedCount > 1
        ? `The ${expectedCount} reference images are too large together (${(total / 1024 / 1024).toFixed(1)}MB, limit ${(budget / 1024 / 1024).toFixed(0)}MB). Use smaller images or fewer references.`
        : "Combined reference images are too large for edge generation. Remove one reference or use smaller source images.",
    );
  }
}
