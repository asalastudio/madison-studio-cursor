/**
 * Shopify productCreateMedia({ originalSource: publicUrl }) asks Shopify's
 * servers to fetch the image. For Madison Supabase public URLs that fetch
 * hangs long enough that the Edge gateway returns a raw 502 after the
 * Cylinder publish authorization has already been consumed.
 *
 * Stage the bytes ourselves, then pass Shopify its own resource URL.
 */

export const SHOPIFY_GRAPHQL_TIMEOUT_MS = 20_000;
export const SHOPIFY_SOURCE_IMAGE_TIMEOUT_MS = 20_000;
export const SHOPIFY_STAGED_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;

export function shouldStageShopifyImageUpload(imageUrl: string): boolean {
  return /^https:\/\//i.test(imageUrl.trim());
}

export function stagedUploadFilename(imageUrl: string, sku: string): string {
  const cleanSku = sku.trim().replace(/[^A-Za-z0-9._-]+/g, "-") || "product";
  try {
    const pathname = new URL(imageUrl).pathname;
    const ext = pathname.match(/\.(png|jpe?g|webp|gif)$/i)?.[1]?.toLowerCase();
    return `${cleanSku}.${ext === "jpeg" ? "jpg" : ext ?? "png"}`;
  } catch {
    return `${cleanSku}.png`;
  }
}

export function stagedUploadMimeType(filename: string): string {
  if (filename.endsWith(".jpg") || filename.endsWith(".jpeg")) return "image/jpeg";
  if (filename.endsWith(".webp")) return "image/webp";
  if (filename.endsWith(".gif")) return "image/gif";
  return "image/png";
}

export function buildStagedUploadsCreateInput(input: {
  imageUrl: string;
  sku: string;
  fileSize: number;
}): {
  resource: "PRODUCT_IMAGE";
  filename: string;
  mimeType: string;
  httpMethod: "POST";
  fileSize: string;
} {
  if (input.fileSize <= 0) {
    throw new Error("Shopify staged upload requires a downloaded image with a non-zero size.");
  }
  if (input.fileSize > SHOPIFY_STAGED_UPLOAD_MAX_BYTES) {
    throw new Error(
      `Shopify staged upload rejected a ${input.fileSize}-byte image (max ${SHOPIFY_STAGED_UPLOAD_MAX_BYTES}).`,
    );
  }
  const filename = stagedUploadFilename(input.imageUrl, input.sku);
  return {
    resource: "PRODUCT_IMAGE",
    filename,
    mimeType: stagedUploadMimeType(filename),
    httpMethod: "POST",
    fileSize: String(input.fileSize),
  };
}
