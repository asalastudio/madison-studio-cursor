export type ImageLibraryPublishDestination =
  | "tarife-sanity"
  | "best-bottles-grid"
  | "best-bottles-pdp";

export type ImageLibraryPublishDestinationOption = {
  value: ImageLibraryPublishDestination;
  label: string;
};

const BEST_BOTTLES_DESTINATIONS: ImageLibraryPublishDestinationOption[] = [
  {
    value: "best-bottles-grid",
    label: "Best Bottles group hero / grid thumbnail via Shopify",
  },
  {
    value: "best-bottles-pdp",
    label: "Best Bottles variant PDP image via Shopify",
  },
];

const TARIFE_DESTINATIONS: ImageLibraryPublishDestinationOption[] = [
  {
    value: "tarife-sanity",
    label: "Tarife product main image",
  },
];

export function getImageLibraryPublishDestinations(
  isBestBottlesOrg: boolean,
  isTarifeOrg = false,
): ImageLibraryPublishDestinationOption[] {
  if (isBestBottlesOrg) return BEST_BOTTLES_DESTINATIONS;
  if (isTarifeOrg) return TARIFE_DESTINATIONS;
  return [];
}

export function getDefaultImageLibraryPublishDestination({
  isBestBottlesOrg,
  isTarifeOrg = false,
  resolvedGroupSlug,
  resolvedWebsiteSku,
}: {
  isBestBottlesOrg: boolean;
  isTarifeOrg?: boolean;
  resolvedGroupSlug?: string | null;
  resolvedWebsiteSku?: string | null;
}): ImageLibraryPublishDestination | null {
  if (isBestBottlesOrg) {
    if (resolvedGroupSlug?.trim()) return "best-bottles-grid";
    if (resolvedWebsiteSku?.trim()) return "best-bottles-pdp";
    return "best-bottles-grid";
  }
  if (isTarifeOrg) return "tarife-sanity";
  return null;
}
