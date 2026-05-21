const SUPPORTED_REFERENCE_EXT = /\.(png|jpe?g|webp)(?:[?#].*)?$/i;
const UNSUPPORTED_REFERENCE_EXT = /\.(gif|heic|bmp|tiff?)(?:[?#].*)?$/i;

export function getBestBottlesReferenceUrlIssue(url: string | null | undefined): string | null {
  const value = String(url ?? "").trim();
  if (!value) return "Missing reference URL.";

  if (/^data:image\/(?:png|jpe?g|webp);base64,/i.test(value)) return null;
  if (/^data:/i.test(value)) {
    return "Reference must be a PNG, JPG, or WebP image.";
  }

  if (/^https?:\/\//i.test(value)) {
    if (UNSUPPORTED_REFERENCE_EXT.test(value)) {
      return "Reference format is unsupported for image edits. Use PNG, JPG, or WebP.";
    }
    return null;
  }

  if (/^(blob|file):/i.test(value)) {
    return "Reference is browser-local. Upload it to Madison storage before generating.";
  }

  if (value.startsWith("/") && SUPPORTED_REFERENCE_EXT.test(value)) {
    return "Reference is a local app path, not a public image URL. Upload or sync the PNG first.";
  }

  if (SUPPORTED_REFERENCE_EXT.test(value)) {
    return "Reference is a pipeline file path, not a fetchable image URL. Import/upload the PNG before generating.";
  }

  return "Reference is not a fetchable image URL.";
}

export function isBestBottlesReferenceUrlUsable(url: string | null | undefined): boolean {
  return getBestBottlesReferenceUrlIssue(url) === null;
}
