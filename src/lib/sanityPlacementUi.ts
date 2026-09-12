/**
 * Sanity placement — what the dialog can offer and what it must collect.
 *
 * The registry on the server decides *where* an image lands (document type,
 * selector, field path). This file only carries the user-facing catalogue and
 * the form rules. Since the Best Bottles homepage keeps its hero, family and
 * category cards as inline arrays on one document, every homepage destination
 * lists concrete targets (a slide, a card, a panel) and the user picks one —
 * nobody types a document ID.
 */
export type SanityPlacementDestinationKey =
  | "homepage_hero"
  | "homepage_hero_mobile"
  | "product_family_hero"
  | "homepage_start_here_card"
  | "homepage_mobile_category_card"
  | "homepage_mega_menu_panel"
  | "blog_post"
  | "product_main_image"
  | "paper_doll_component";

export type SanityPlacementGroup = "Homepage" | "Editorial" | "Product";

export type SanityPlacementDestination = {
  key: SanityPlacementDestinationKey;
  group: SanityPlacementGroup;
  label: string;
  description: string;
  /** The registry lists concrete targets for this destination; one must be picked. */
  pickTarget?: boolean;
  requiresFamilySlug?: boolean;
  requiresRole?: boolean;
  requiresBestBottlesSkuTruth?: boolean;
};

/** A row from the destination's target list, as returned by `action: "targets"`. */
export type SanityPlacementTargetChoice = {
  label: string;
  metadata: Record<string, string>;
  hasImage?: boolean;
};

export type SanityPlacementFormInput = {
  destinationKey: SanityPlacementDestinationKey;
  target?: SanityPlacementTargetChoice | null;
  documentId?: string | null;
  altText?: string | null;
  caption?: string | null;
  familySlug?: string | null;
  role?: string | null;
  websiteSku?: string | null;
  graceSku?: string | null;
  shopifySku?: string | null;
  generatedImageId?: string | null;
  isBestBottlesOrg: boolean;
};

export const SANITY_PLACEMENT_DESTINATIONS: SanityPlacementDestination[] = [
  {
    key: "homepage_hero",
    group: "Homepage",
    label: "Homepage hero",
    description:
      "Desktop hero image for one slide of the homepage slider. Lands as a draft — publish it in Sanity Studio.",
    pickTarget: true,
  },
  {
    key: "homepage_hero_mobile",
    group: "Homepage",
    label: "Homepage hero (mobile)",
    description: "Portrait hero image for one slide, shown on phones. Lands as a draft.",
    pickTarget: true,
  },
  {
    key: "product_family_hero",
    group: "Homepage",
    label: "Design family card",
    description: "Image for one bottle-family card in the homepage carousel. Lands as a draft.",
    pickTarget: true,
  },
  {
    key: "homepage_start_here_card",
    group: "Homepage",
    label: "Start Here card",
    description: "Image for one Guided Browsing card. Lands as a draft.",
    pickTarget: true,
  },
  {
    key: "homepage_mobile_category_card",
    group: "Homepage",
    label: "Mobile category card",
    description: "Image for one Shop-by-Application card on mobile. Lands as a draft.",
    pickTarget: true,
  },
  {
    key: "homepage_mega_menu_panel",
    group: "Homepage",
    label: "Mega menu panel",
    description: "Featured image for the Bottles, Closures or Specialty dropdown. Lands as a draft.",
    pickTarget: true,
  },
  {
    key: "blog_post",
    group: "Editorial",
    label: "Blog post image",
    description: "Hero image for a Journal article, picked from the list.",
    pickTarget: true,
  },
  {
    key: "product_main_image",
    group: "Product",
    label: "Product main image",
    description:
      "Patch a Sanity product image field. Best Bottles commerce PDP media stays Shopify-first.",
    requiresBestBottlesSkuTruth: true,
  },
  {
    key: "paper_doll_component",
    group: "Product",
    label: "Paper-doll component",
    description: "Patch a component image such as cap, top, applicator, or bottle body.",
    requiresFamilySlug: true,
    requiresRole: true,
  },
];

export const SANITY_PLACEMENT_GROUPS: SanityPlacementGroup[] = ["Homepage", "Editorial", "Product"];

export function getSanityPlacementDestination(
  key: SanityPlacementDestinationKey | string,
): SanityPlacementDestination | null {
  return SANITY_PLACEMENT_DESTINATIONS.find((destination) => destination.key === key) ?? null;
}

export function getDefaultSanityPlacementDestination({
  familySlug,
}: {
  familySlug?: string | null;
} = {}): SanityPlacementDestinationKey {
  return familySlug?.trim() ? "product_family_hero" : "homepage_hero";
}

function clean(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export function validateSanityPlacementForm(
  input: SanityPlacementFormInput,
): { ok: true; errors: [] } | { ok: false; errors: string[] } {
  const destination = getSanityPlacementDestination(input.destinationKey);
  const errors: string[] = [];
  if (!destination) errors.push("Choose a Sanity destination.");
  if (destination?.pickTarget && !input.target) {
    errors.push("Choose where on the site this image goes.");
  }
  if (!clean(input.altText)) errors.push("Alt text is required.");
  if (destination?.requiresFamilySlug && !clean(input.familySlug)) {
    errors.push("Family slug is required for this Sanity placement.");
  }
  if (destination?.requiresRole && !clean(input.role)) {
    errors.push("Component role is required for this Sanity placement.");
  }
  if (
    input.isBestBottlesOrg &&
    destination?.requiresBestBottlesSkuTruth
  ) {
    if (!clean(input.websiteSku)) {
      errors.push("Website SKU is required for Best Bottles product image placement.");
    }
    if (!clean(input.graceSku)) {
      errors.push("Grace SKU is required for Best Bottles product image placement.");
    }
  }
  return errors.length === 0 ? { ok: true, errors: [] } : { ok: false, errors };
}

/**
 * Metadata for the push. The picked target's keys go on last: it is the
 * authority for where the image lands, even when the form was pre-filled
 * with a family slug from the image's tags.
 */
export function buildSanityPlacementMetadata(
  input: Omit<SanityPlacementFormInput, "isBestBottlesOrg">,
): Record<string, string> {
  const metadata: Record<string, string> = {};
  const fields = {
    documentId: input.documentId,
    altText: input.altText,
    caption: input.caption,
    familySlug: input.familySlug,
    role: input.role,
    websiteSku: input.websiteSku,
    graceSku: input.graceSku,
    shopifySku: input.shopifySku,
    generatedImageId: input.generatedImageId,
  };

  for (const [key, value] of Object.entries(fields)) {
    const cleaned = clean(value);
    if (cleaned) metadata[key] = cleaned;
  }

  if (input.target) {
    for (const [key, value] of Object.entries(input.target.metadata)) {
      const cleaned = clean(value);
      if (cleaned) metadata[key] = cleaned;
    }
    const label = clean(input.target.label);
    if (label) metadata.targetLabel = label;
  }

  return metadata;
}
