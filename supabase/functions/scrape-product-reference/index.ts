/**
 * scrape-product-reference
 *
 * Fetches a product URL (currently only used for Best Bottles product pages)
 * and extracts the hero image so Madison can populate `legacy_hero_image_url`
 * automatically — no manual reference-image uploads per SKU.
 *
 * Why direct fetch + og:image instead of Firecrawl:
 *   • Every ecom product page (Shopify, WooCommerce, custom) sets
 *     `<meta property="og:image">` to the primary product image, because
 *     that's what controls the social-preview card.
 *   • Zero external dependencies, zero API keys, zero cost.
 *   • If og:image is missing we fall through to twitter:image and then to
 *     `<link rel="image_src">`. Failure case: we return `null` and the
 *     caller marks it as "sync failed" for that product.
 *
 * The function accepts a SINGLE URL per call; the client batches. This keeps
 * timeouts, rate-limiting, and partial-result reporting simple — a 291-row
 * catalog maps to 291 invocations driven by the client at whatever rate the
 * UI can surface progress for.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ScrapeRequest {
  productUrl: string;
}

interface ScrapeSuccess {
  imageUrl: string;
  source: "og-image" | "twitter-image" | "image-src";
}

interface ScrapeFailure {
  imageUrl: null;
  error: string;
}

type ScrapeResponse = ScrapeSuccess | ScrapeFailure;

/**
 * Pull the first matching meta/link tag value from an HTML string.
 * Intentionally simple regex — product pages set these in the document
 * head verbatim; no need for a full HTML parser and its cold-start cost.
 */
function extractMetaContent(html: string, pattern: RegExp): string | null {
  const match = html.match(pattern);
  if (!match || !match[1]) return null;
  return match[1].trim();
}

function resolveUrl(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

async function scrapeProductImage(
  productUrl: string,
): Promise<ScrapeResponse> {
  let url: URL;
  try {
    url = new URL(productUrl);
  } catch {
    return { imageUrl: null, error: `Invalid URL: ${productUrl}` };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { imageUrl: null, error: `Unsupported protocol: ${url.protocol}` };
  }

  const response = await fetch(url.toString(), {
    redirect: "follow",
    headers: {
      // Most ecom platforms gate bot traffic behind a UA check — masquerade
      // as a regular browser so we land on the product page HTML instead of
      // a stripped API response or a challenge page.
      "User-Agent":
        "Mozilla/5.0 (compatible; MadisonStudio/1.0; +https://madison.studio)",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  if (!response.ok) {
    return {
      imageUrl: null,
      error: `HTTP ${response.status} ${response.statusText}`,
    };
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("html")) {
    return {
      imageUrl: null,
      error: `Expected HTML, got ${contentType || "unknown"}`,
    };
  }

  const html = await response.text();

  // Try og:image first (nearly universal on ecom product pages), then
  // twitter:image (Twitter Card fallback), then <link rel="image_src">
  // (legacy spec, still set by older platforms).
  const ogImage = extractMetaContent(
    html,
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
  );
  if (ogImage) {
    return { imageUrl: resolveUrl(ogImage, url.toString()), source: "og-image" };
  }

  // Try the reverse attribute order — some platforms put `content` before
  // `property`, which the pattern above would miss.
  const ogImageReversed = extractMetaContent(
    html,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
  );
  if (ogImageReversed) {
    return {
      imageUrl: resolveUrl(ogImageReversed, url.toString()),
      source: "og-image",
    };
  }

  const twitterImage = extractMetaContent(
    html,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
  );
  if (twitterImage) {
    return {
      imageUrl: resolveUrl(twitterImage, url.toString()),
      source: "twitter-image",
    };
  }

  const imageSrc = extractMetaContent(
    html,
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i,
  );
  if (imageSrc) {
    return {
      imageUrl: resolveUrl(imageSrc, url.toString()),
      source: "image-src",
    };
  }

  return {
    imageUrl: null,
    error: "No og:image, twitter:image, or image_src tag found on the page.",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  try {
    const body = (await req.json()) as ScrapeRequest;
    const productUrl = body.productUrl;
    if (!productUrl || typeof productUrl !== "string") {
      return new Response(
        JSON.stringify({ error: "productUrl is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const result = await scrapeProductImage(productUrl);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[scrape-product-reference] unexpected error:", message);
    return new Response(
      JSON.stringify({ imageUrl: null, error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
