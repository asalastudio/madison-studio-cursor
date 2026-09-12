export type SanityDestinationKey =
  | "blog_post"
  | "homepage_hero"
  | "homepage_hero_mobile"
  | "homepage_start_here_card"
  | "homepage_mobile_category_card"
  | "homepage_mega_menu_panel"
  | "product_family_hero"
  | "product_main_image"
  | "paper_doll_component";

export type SanityDestinationRow = {
  organization_id?: string | null;
  destination_key?: string | null;
  schema_profile?: string | null;
  sanity_document_type?: string | null;
  selector_query?: string | null;
  selector_params?: Record<string, unknown> | null;
  target_field_path?: string | null;
  publish_mode?: string | null;
  requires_image?: boolean | null;
  required_metadata?: unknown;
  /** GROQ that lists concrete targets (slides, cards, posts) as {label, metadata, hasImage}. */
  target_list_query?: string | null;
  description?: string | null;
};

/** One row of a destination's target list, as the picker shows it. */
export type SanityPlacementTarget = {
  label: string;
  metadata: Record<string, string>;
  hasImage: boolean;
};

export type ProductTruthMetadataRule = {
  requiredKeys: string[];
  skuScoped: boolean;
  familyScoped: boolean;
};

export type PlacementValidationInput = {
  imageUrl?: unknown;
  metadata?: Record<string, unknown> | null;
};

export type SanityImageField = {
  _type: "image";
  asset: { _type: "reference"; _ref: string };
  alt?: string;
  caption?: string;
};

const DESTINATION_KEYS: SanityDestinationKey[] = [
  "blog_post",
  "homepage_hero",
  "homepage_hero_mobile",
  "homepage_start_here_card",
  "homepage_mobile_category_card",
  "homepage_mega_menu_panel",
  "product_family_hero",
  "product_main_image",
  "paper_doll_component",
];

const destinationKeySet = new Set<string>(DESTINATION_KEYS);

export function normalizeDestinationKey(
  value: unknown,
): SanityDestinationKey | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_");
  return destinationKeySet.has(normalized)
    ? (normalized as SanityDestinationKey)
    : null;
}

export function selectDestinationConfig<T extends SanityDestinationRow>(
  rows: T[],
  destinationKey: SanityDestinationKey | string,
  schemaProfile: string | null | undefined,
  organizationId?: string | null,
): T | null {
  const key = normalizeDestinationKey(destinationKey);
  if (!key) return null;
  const profile = schemaProfile?.trim() || "generic";
  const orgId = organizationId?.trim() || null;
  const candidates = rows.filter((row) =>
    normalizeDestinationKey(row.destination_key) === key
  );

  return (
    candidates.find((row) =>
      row.organization_id === orgId && row.schema_profile === profile
    ) ??
      candidates.find((row) =>
        row.organization_id === orgId && row.schema_profile === "generic"
      ) ??
      candidates.find((row) =>
        !row.organization_id && row.schema_profile === profile
      ) ??
      candidates.find((row) =>
        !row.organization_id && row.schema_profile === "generic"
      ) ??
      null
  );
}

export function needsProfileSpecificDestination(
  destination: SanityDestinationRow | null | undefined,
  schemaProfile: string | null | undefined,
): boolean {
  const profile = schemaProfile?.trim() || "generic";
  return profile !== "generic" && !destination?.organization_id;
}

export function bestBottlesProductTruthRule(
  destinationKey: SanityDestinationKey | string | null | undefined,
): ProductTruthMetadataRule | null {
  const key = normalizeDestinationKey(destinationKey);
  if (key === "product_main_image") {
    return {
      requiredKeys: ["websiteSku", "graceSku"],
      skuScoped: true,
      familyScoped: false,
    };
  }
  if (key === "product_family_hero") {
    return {
      requiredKeys: ["familySlug"],
      skuScoped: false,
      familyScoped: true,
    };
  }
  if (key === "paper_doll_component") {
    return {
      requiredKeys: ["familySlug", "role"],
      skuScoped: false,
      familyScoped: true,
    };
  }
  return null;
}

export function requiredMetadataKeys(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string =>
      typeof entry === "string" && entry.trim().length > 0
    );
  }
  if (value && typeof value === "object") {
    const maybeKeys = (value as { keys?: unknown }).keys;
    if (Array.isArray(maybeKeys)) {
      return maybeKeys.filter((entry): entry is string =>
        typeof entry === "string" && entry.trim().length > 0
      );
    }
  }
  return [];
}

function hasMetadataValue(
  metadata: Record<string, unknown>,
  key: string,
): boolean {
  const value = metadata[key];
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return trimmed.startsWith("https://") || trimmed.startsWith("http://");
}

export function validatePlacementRequest(
  input: PlacementValidationInput,
  destination: SanityDestinationRow,
): { ok: true; errors: [] } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const metadata = input.metadata ?? {};
  if (destination.requires_image !== false && !isHttpUrl(input.imageUrl)) {
    errors.push("imageUrl must be an http(s) URL.");
  }

  for (const key of requiredMetadataKeys(destination.required_metadata)) {
    if (!hasMetadataValue(metadata, key)) {
      errors.push(
        `metadata.${key} is required for ${
          destination.destination_key ?? "this destination"
        }.`,
      );
    }
  }

  if (
    !destination.target_field_path ||
    !isSafeFieldPathTemplate(destination.target_field_path)
  ) {
    errors.push(
      "destination target_field_path must be a safe Sanity field path.",
    );
  }

  return errors.length === 0 ? { ok: true, errors: [] } : { ok: false, errors };
}

export function buildSelectorParams(
  destination: Pick<
    SanityDestinationRow,
    "sanity_document_type" | "selector_params"
  >,
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const params: Record<string, unknown> = {
    documentType: destination.sanity_document_type ?? null,
  };
  if (metadata.documentId != null) params.documentId = metadata.documentId;
  if (metadata.slug != null) params.slug = metadata.slug;

  for (
    const [paramName, source] of Object.entries(
      destination.selector_params ?? {},
    )
  ) {
    if (
      typeof source === "string" &&
      Object.prototype.hasOwnProperty.call(metadata, source)
    ) {
      params[paramName] = metadata[source];
    } else {
      params[paramName] = source;
    }
  }

  return params;
}

export function buildImageField(
  assetId: string,
  metadata: Record<string, unknown> = {},
): SanityImageField {
  const image: SanityImageField = {
    _type: "image",
    asset: { _type: "reference", _ref: assetId },
  };
  if (typeof metadata.altText === "string" && metadata.altText.trim()) {
    image.alt = metadata.altText.trim();
  }
  if (typeof metadata.caption === "string" && metadata.caption.trim()) {
    image.caption = metadata.caption.trim();
  }
  return image;
}

/**
 * Field paths.
 *
 * The homepage keeps its hero, family cards and category cards as inline
 * arrays on one `homepagePage` document, so a placement has to address one
 * element: `heroSlides[_key=="k9x"].image`. A registry row stores that as a
 * template — `heroSlides[_key==$slideKey].image` — and the picked target's
 * metadata fills the key at publish time. Named object fields work the same
 * way with a bare parameter segment: `megaMenuPanels.$panel.featuredImage`.
 *
 * Both the template and the resolved path are validated against a closed
 * grammar (identifiers, `[_key=="…"]` with a [A-Za-z0-9_-] key) so nothing a
 * user types can reach a Sanity patch as a path expression.
 */
const PLAIN_SEGMENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const KEYED_SEGMENT = /^([A-Za-z_][A-Za-z0-9_]*)\[_key=="([A-Za-z0-9_-]+)"\]$/;
const KEYED_TEMPLATE_SEGMENT =
  /^([A-Za-z_][A-Za-z0-9_]*)\[_key==\$([A-Za-z_][A-Za-z0-9_]*)\]$/;
const PARAM_SEGMENT = /^\$([A-Za-z_][A-Za-z0-9_]*)$/;
const SAFE_KEY = /^[A-Za-z0-9_-]+$/;

export function isSafeFieldPath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  return value.split(".").every((segment) =>
    PLAIN_SEGMENT.test(segment) || KEYED_SEGMENT.test(segment)
  );
}

export function isSafeFieldPathTemplate(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  return value.split(".").every((segment) =>
    PLAIN_SEGMENT.test(segment) ||
    KEYED_SEGMENT.test(segment) ||
    KEYED_TEMPLATE_SEGMENT.test(segment) ||
    PARAM_SEGMENT.test(segment)
  );
}

function metadataString(
  metadata: Record<string, unknown>,
  key: string,
): string {
  const value = metadata[key];
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

export function resolveTargetFieldPath(
  template: unknown,
  metadata: Record<string, unknown> = {},
): { ok: true; path: string } | { ok: false; error: string } {
  if (!isSafeFieldPathTemplate(template)) {
    return {
      ok: false,
      error: `Unsafe Sanity field path template: ${String(template)}`,
    };
  }
  const segments: string[] = [];
  for (const segment of template.split(".")) {
    const keyed = KEYED_TEMPLATE_SEGMENT.exec(segment);
    if (keyed) {
      const value = metadataString(metadata, keyed[2]);
      if (!value) {
        return {
          ok: false,
          error: `metadata.${keyed[2]} is required to address ${keyed[1]}.`,
        };
      }
      if (!SAFE_KEY.test(value)) {
        return {
          ok: false,
          error: `metadata.${keyed[2]} is not a valid Sanity array key.`,
        };
      }
      segments.push(`${keyed[1]}[_key=="${value}"]`);
      continue;
    }
    const param = PARAM_SEGMENT.exec(segment);
    if (param) {
      const value = metadataString(metadata, param[1]);
      if (!value) {
        return {
          ok: false,
          error: `metadata.${param[1]} is required to address this field.`,
        };
      }
      if (!PLAIN_SEGMENT.test(value)) {
        return {
          ok: false,
          error: `metadata.${param[1]} is not a valid Sanity field name.`,
        };
      }
      segments.push(value);
      continue;
    }
    segments.push(segment);
  }
  const path = segments.join(".");
  return isSafeFieldPath(path)
    ? { ok: true, path }
    : { ok: false, error: `Unsafe Sanity field path: ${path}` };
}

/** `drafts.<id>` for a published id; unchanged for an id that already is one. */
export function draftDocumentId(id: string): string {
  return id.startsWith("drafts.") ? id : `drafts.${id}`;
}

export function publishedDocumentId(id: string): string {
  return id.replace(/^drafts\./, "");
}

/**
 * Shape a `target_list_query` result for the picker. Entries without any
 * metadata are useless as targets and are dropped; a missing label falls back
 * to the metadata values so nothing shows as a blank row.
 */
export function normalizeTargetList(
  value: unknown,
  limit = 100,
): SanityPlacementTarget[] {
  if (!Array.isArray(value)) return [];
  const targets: SanityPlacementTarget[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const metadata: Record<string, string> = {};
    const rawMetadata = record.metadata;
    if (rawMetadata && typeof rawMetadata === "object") {
      for (const [key, raw] of Object.entries(rawMetadata as Record<string, unknown>)) {
        if (typeof raw === "string" && raw.trim()) metadata[key] = raw.trim();
        else if (typeof raw === "number" && Number.isFinite(raw)) metadata[key] = String(raw);
      }
    }
    if (Object.keys(metadata).length === 0) continue;
    const label = typeof record.label === "string" && record.label.trim()
      ? record.label.trim()
      : Object.values(metadata).join(" · ");
    targets.push({ label, metadata, hasImage: record.hasImage === true });
    if (targets.length >= limit) break;
  }
  return targets;
}

export function buildPatchSet(
  fieldPath: string,
  imageField: SanityImageField,
): Record<string, SanityImageField> {
  if (!isSafeFieldPath(fieldPath)) {
    throw new Error(`Unsafe Sanity field path: ${fieldPath}`);
  }
  return { [fieldPath]: imageField };
}
