/**
 * Supabase Storage image-transformation URLs for grid thumbnails.
 *
 * The Image Library renders the stored original in every tile. Best Bottles
 * masters are 2080×2288 PNGs, so a tile that displays at ~250px was pulling
 * roughly a megabyte. Measured on a live library object:
 *
 *   original (PNG)                        1050 KB
 *   ?width=400&quality=70                  248 KB   ← still PNG
 *   ?width=500&quality=75&format=webp       22 KB   ← 48× smaller
 *
 * `quality` alone does almost nothing to a PNG; `format=webp` is what makes
 * the difference, so both are always sent together here.
 *
 * `resize` defaults to `cover` on the render endpoint, and with only a width
 * given that does NOT preserve the aspect ratio: the same 2080×2288 source
 * came back as 400×2288 — a full-height strip cropped to 400px wide, which
 * is why every grid showed a sliver of bottle instead of the frame.
 * `resize=contain` scales the whole image (400×440 here) and is always sent.
 *
 * Transformations are served from `/storage/v1/render/image/public/...`, which
 * is enabled on this project. Anything that is not a public Supabase Storage
 * object URL is returned untouched, so callers can pass Shopify CDN URLs,
 * Sanity URLs, data: URLs and blob: URLs without special-casing.
 */

const PUBLIC_OBJECT_SEGMENT = "/storage/v1/object/public/";
const RENDER_SEGMENT = "/storage/v1/render/image/public/";

export interface StorageThumbnailOptions {
  /** Rendered CSS width in device-independent pixels; ~2× it for retina. */
  width?: number;
  /** 20–100. 75 keeps product edges clean at thumbnail scale. */
  quality?: number;
}

/**
 * Rewrite a public Supabase Storage URL to a resized WebP rendition.
 * Returns the input unchanged when it is not such a URL, when it already
 * points at the render endpoint, or when it already carries a query string.
 */
export function storageThumbnailUrl(
  url: string | null | undefined,
  options: StorageThumbnailOptions = {},
): string {
  if (!url) return "";
  if (!url.includes(PUBLIC_OBJECT_SEGMENT)) return url;
  if (url.includes(RENDER_SEGMENT)) return url;
  // A caller-supplied query string may already encode a transform or a signed
  // token; appending ours could conflict with it, so leave it alone.
  if (url.includes("?")) return url;

  const width = Math.round(options.width ?? 500);
  const quality = Math.round(options.quality ?? 75);
  if (!Number.isFinite(width) || width <= 0) return url;

  return `${url.replace(PUBLIC_OBJECT_SEGMENT, RENDER_SEGMENT)}?width=${width}&quality=${quality}&format=webp&resize=contain`;
}
