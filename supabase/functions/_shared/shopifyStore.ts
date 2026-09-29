/**
 * Shopify store selection for edge functions.
 *
 * The project-wide SHOPIFY_ACCESS_TOKEN / SHOPIFY_SHOP_DOMAIN secrets belong
 * to Best Bottles. Other orgs must use their own shopify_connections row.
 * The org connection is always preferred when present.
 */

import { isBestBottlesOrgId } from "./orgFeatures.ts";

export type ShopifyConnectionRow = {
  shop_domain?: string | null;
  access_token_encrypted?: string | null;
  access_token_iv?: string | null;
};

export type ShopifyStorePick =
  | {
    source: "connection";
    shopDomain: string;
    access_token_encrypted: string;
    access_token_iv: string;
  }
  | {
    source: "env";
    shopDomain: string;
    accessToken: string;
  }
  | {
    source: "none";
    error: string;
  };

export function cleanShopifySecret(value: string | undefined | null): string {
  return (value ?? "").trim().replace(/^['"]|['"]$/g, "");
}

export function normalizeShopDomain(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "");
}

function hasUsableConnection(
  connection: ShopifyConnectionRow | null | undefined,
): connection is {
  shop_domain: string;
  access_token_encrypted: string;
  access_token_iv: string;
} {
  return Boolean(
    connection &&
      cleanShopifySecret(connection.shop_domain) &&
      cleanShopifySecret(connection.access_token_encrypted) &&
      cleanShopifySecret(connection.access_token_iv),
  );
}

/**
 * Prefer the organization's own Shopify connection. Fall back to the
 * project env token only for the Best Bottles org so that org keeps
 * working when the store is configured as a project secret.
 */
export function pickShopifyStore(input: {
  organizationId: string;
  connection?: ShopifyConnectionRow | null;
  envToken?: string | null;
  envDomain?: string | null;
}): ShopifyStorePick {
  if (hasUsableConnection(input.connection)) {
    return {
      source: "connection",
      shopDomain: normalizeShopDomain(input.connection.shop_domain),
      access_token_encrypted: input.connection.access_token_encrypted,
      access_token_iv: input.connection.access_token_iv,
    };
  }

  const envToken = cleanShopifySecret(input.envToken);
  const envDomain = cleanShopifySecret(input.envDomain);
  if (envToken && envDomain && isBestBottlesOrgId(input.organizationId)) {
    return {
      source: "env",
      shopDomain: normalizeShopDomain(envDomain),
      accessToken: envToken,
    };
  }

  if (envToken && envDomain && !isBestBottlesOrgId(input.organizationId)) {
    return {
      source: "none",
      error:
        "Shopify is not connected for this organization. Connect Shopify in Settings.",
    };
  }

  return {
    source: "none",
    error:
      "Shopify is not connected for this organization. Connect Shopify in Settings.",
  };
}

export function resolveListingShopifyProductId(
  listingExternalId: unknown,
  requestedId: unknown,
): { ok: true; shopifyProductId: string } | { ok: false; error: string } {
  const listingId = typeof listingExternalId === "string" || typeof listingExternalId === "number"
    ? String(listingExternalId).trim()
    : "";
  const requested = typeof requestedId === "string" || typeof requestedId === "number"
    ? String(requestedId).trim()
    : "";

  if (!listingId) {
    return {
      ok: false,
      error: "This listing is not linked to a Shopify product.",
    };
  }
  if (requested && requested !== listingId) {
    return {
      ok: false,
      error: "shopify_product_id does not belong to this listing.",
    };
  }
  return { ok: true, shopifyProductId: listingId };
}
