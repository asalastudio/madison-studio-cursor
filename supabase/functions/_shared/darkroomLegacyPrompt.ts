export function catalogClosureLabel(bottle: {
  isOil: boolean;
  isSpray: boolean;
}): string | null {
  if (bottle.isOil) return "dropper, roller or screw cap";
  if (bottle.isSpray) return "fine-mist sprayer";
  return null;
}

export function catalogCrossCheckLine(
  closureFromCatalog: string | null | undefined,
): string {
  if (!closureFromCatalog) return "";
  return `Catalog closure: ${closureFromCatalog}. This must match the reference; if it does not, reproduce the reference.`;
}

export function brandPaletteSetOnlyLine(
  colors: Array<{ name?: string; hex?: string }>,
): string {
  const listed = colors
    .slice(0, 5)
    .map((color) => {
      const name = color.name?.trim() || "Brand color";
      return color.hex ? `${name} (${color.hex})` : name;
    })
    .join(", ");

  return (
    `COLOR PALETTE (SET ONLY): ${listed}. ` +
    "Brand palette applies to the background and surfaces only, never to the product, glass, closure or liquid."
  );
}

export function lightingMandateBlock(mandate: string): string {
  return (
    `LIGHTING MANDATE (MANDATORY): ${mandate}\n` +
    "This is the only lighting authority."
  );
}

export function proLightingDeltaBlock(ontologySpecs: string): string {
  return (
    "USER LIGHTING DELTA (apply only if it does not conflict with the lighting mandate above):\n" +
    ontologySpecs.trim()
  );
}

export type ArtDirectionControls = {
  backgroundPresetId?: string;
  backgroundPrompt?: string;
  compositionPresetId?: string;
  compositionPrompt?: string;
};

export type PropsAuthoritySource = "user" | "brand" | "set" | "none";
export type PropsAuthorityMode = "none" | "required" | "approved" | "unset";

export type PropsAuthority = {
  source: PropsAuthoritySource;
  mode: PropsAuthorityMode;
  items: string[];
};

const PROP_NOUNS =
  "props?|accessories|tray|plinth|eucalyptus|botanicals?|books?|linen|velvet|marble|plants?|flowers?|vase|branch(?:es)?|fabric|wood surfaces?";

const USER_NO_PROPS_RE = new RegExp(
  String.raw`\b(?:no|without|do not add|don't add|dont add|exclude)\s+(?:any\s+)?(?:${PROP_NOUNS})\b`,
  "i",
);

const USER_EXCEPT_PROPS_RE = new RegExp(
  String.raw`\b(?:no|without)\s+(?:any\s+)?(?:${PROP_NOUNS}).{0,40}\b(?:except|besides|other than)\s+([^.\n]+)`,
  "i",
);

const USER_ADD_PROPS_RE = new RegExp(
  String.raw`\b(?:with|add|include|featuring|using)\s+(?:a |an |the |some |only )?([^.!?\n]{0,80}(?:${PROP_NOUNS}))\b`,
  "i",
);

const SET_NO_PROPS_RE = /\bno props\b/i;
const SET_SUGGESTS_PROPS_RE = new RegExp(
  String.raw`\b(?:${PROP_NOUNS}|petals|succulent|pampas)\b`,
  "i",
);

function cleanedList(items?: readonly string[] | null): string[] {
  return (items ?? [])
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function listMeansNone(items: readonly string[]): boolean {
  if (items.length === 0) return false;
  return items.every((item) => /^(none|no props?|n\/a|nothing)$/i.test(item));
}

function forbiddenMeansNoProps(items: readonly string[]): boolean {
  return items.some((item) => /^(props|accessories|lifestyle props)$/i.test(item));
}

function inferSetPropsMode(setPrompt?: string | null): PropsAuthorityMode {
  const text = setPrompt?.trim() ?? "";
  if (!text) return "unset";
  if (SET_NO_PROPS_RE.test(text)) return "none";
  if (SET_SUGGESTS_PROPS_RE.test(text)) return "required";
  return "unset";
}

export function resolvePropsAuthority(input: {
  userPrompt: string;
  brandApprovedProps?: readonly string[] | null;
  brandForbiddenElements?: readonly string[] | null;
  setPrompt?: string | null;
}): PropsAuthority {
  const userPrompt = input.userPrompt.trim();
  const exceptMatch = USER_EXCEPT_PROPS_RE.exec(userPrompt);
  if (exceptMatch?.[1]) {
    return {
      source: "user",
      mode: "required",
      items: [exceptMatch[1].trim().replace(/[.,;]+$/, "")],
    };
  }
  if (USER_NO_PROPS_RE.test(userPrompt)) {
    return { source: "user", mode: "none", items: [] };
  }
  const addMatch = USER_ADD_PROPS_RE.exec(userPrompt);
  if (addMatch?.[1]) {
    return {
      source: "user",
      mode: "required",
      items: [addMatch[1].trim().replace(/[.,;]+$/, "")],
    };
  }

  const approved = cleanedList(input.brandApprovedProps);
  if (listMeansNone(approved) || forbiddenMeansNoProps(cleanedList(input.brandForbiddenElements))) {
    return { source: "brand", mode: "none", items: [] };
  }
  if (approved.length > 0) {
    return { source: "brand", mode: "approved", items: approved.slice(0, 10) };
  }

  const setMode = inferSetPropsMode(input.setPrompt);
  if (setMode === "none") {
    return { source: "set", mode: "none", items: [] };
  }
  if (setMode === "required") {
    return { source: "set", mode: "required", items: [] };
  }

  return { source: "none", mode: "unset", items: [] };
}

export function formatPropsAuthorityBlock(authority: PropsAuthority): string {
  if (authority.mode === "unset") return "";

  const source = authority.source.toUpperCase();
  if (authority.mode === "none") {
    return (
      `PROPS AUTHORITY (${source}): none. ` +
      "Do not add props, accessories, botanicals, books, fabric, trays, or lifestyle objects. " +
      "Ignore any props suggested by scene, style, or preset templates."
    );
  }

  if (authority.items.length > 0) {
    const label = authority.mode === "required" ? "required" : "approved";
    return (
      `PROPS AUTHORITY (${source}): ${label} — ${authority.items.join(", ")}. ` +
      "Use only these props. Ignore props suggested by scene, style, or preset templates that are not in this list."
    );
  }

  return (
    `PROPS AUTHORITY (${source}): the selected set may include its own scene objects. ` +
    "Do not add extra lifestyle props from style templates."
  );
}

export function applyPropsAuthorityToText(
  text: string,
  authority: PropsAuthority,
): string {
  if (!text || authority.mode === "unset") return text;

  let next = text;
  const dropLifestyle = [
    /^- Include lifestyle props[^\n]*/gim,
    /^- Add lifestyle props[^\n]*/gim,
    /Include lifestyle props[^\n]*/gi,
    /Add lifestyle props[^\n]*/gi,
  ];
  for (const pattern of dropLifestyle) {
    next = next.replace(pattern, "");
  }

  if (authority.mode === "none") {
    next = next.replace(/\n━━━ PROPS & STYLING ━━━[\s\S]*?(?=\n━━━|\n⚠️|$)/g, "");
    return next.replace(/\n{3,}/g, "\n\n").trimEnd();
  }

  next = next.replace(/Keep composition minimal - product only, no props/gi, "Keep composition minimal");
  next = next.replace(/, no labels, no props, no decorative scene elements/gi, "");
  next = next.replace(/, no props/gi, "");
  next = next.replace(/\bno props\b/gi, "");
  next = next.replace(/\n━━━ PROPS & STYLING ━━━[\s\S]*?(?=\n━━━|\n⚠️|$)/g, "");
  return next.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trimEnd();
}

function trimOptional(value?: string): string {
  return value?.trim() ?? "";
}

export function formatArtDirectionControls(
  controls?: ArtDirectionControls | null,
  options?: { omitBackground?: boolean },
): string {
  const backgroundPrompt = options?.omitBackground ? "" : trimOptional(controls?.backgroundPrompt);
  const compositionPrompt = trimOptional(controls?.compositionPrompt);
  if (!backgroundPrompt && !compositionPrompt) return "";

  let block = "=== DARK ROOM ART DIRECTION CONTROLS ===\n";
  if (backgroundPrompt) {
    const preset = trimOptional(controls?.backgroundPresetId);
    block += `BACKGROUND STYLE${preset ? ` (${preset})` : ""}: ${backgroundPrompt}\n`;
    block += "Treat this as a deliberate background/surface directive that should materially shape the scene.\n";
  }
  if (compositionPrompt) {
    const preset = trimOptional(controls?.compositionPresetId);
    block += `ARRANGEMENT${preset ? ` (${preset})` : ""}: ${compositionPrompt}\n`;
    block += "Treat this as the required product placement, grouping, and framing instruction.\n";
  }
  return block;
}

export function assembleDarkRoomControlLayers(input: {
  userPrompt: string;
  artDirection?: ArtDirectionControls | null;
  omitBackground?: boolean;
  omitProps?: boolean;
  brandApprovedProps?: readonly string[] | null;
  brandForbiddenElements?: readonly string[] | null;
}): {
  authority: PropsAuthority;
  sanitizedArtDirection: ArtDirectionControls | undefined;
  artDirectionBlock: string;
  propsBlock: string;
} {
  const authority = input.omitProps
    ? { source: "none" as const, mode: "unset" as const, items: [] }
    : resolvePropsAuthority({
        userPrompt: input.userPrompt,
        brandApprovedProps: input.brandApprovedProps,
        brandForbiddenElements: input.brandForbiddenElements,
        setPrompt: input.artDirection?.backgroundPrompt,
      });

  const sanitizedArtDirection = input.artDirection
    ? {
        ...input.artDirection,
        backgroundPrompt: input.artDirection.backgroundPrompt
          ? applyPropsAuthorityToText(input.artDirection.backgroundPrompt, authority)
          : input.artDirection.backgroundPrompt,
        compositionPrompt: input.artDirection.compositionPrompt
          ? applyPropsAuthorityToText(input.artDirection.compositionPrompt, authority)
          : input.artDirection.compositionPrompt,
      }
    : undefined;

  return {
    authority,
    sanitizedArtDirection,
    artDirectionBlock: formatArtDirectionControls(sanitizedArtDirection, {
      omitBackground: input.omitBackground,
    }),
    propsBlock: input.omitProps ? "" : formatPropsAuthorityBlock(authority),
  };
}

export function buildEssentialModePrompt(input: {
  userPrompt: string;
  productRef: { url: string; description?: string } | null;
  brandContext?: { colors?: string[]; styleKeywords?: string[] } | null;
  catalogClosureLabel?: string | null;
  artDirection?: ArtDirectionControls | null;
  brandApprovedProps?: readonly string[] | null;
  brandForbiddenElements?: readonly string[] | null;
  brandColorNames?: readonly string[] | null;
}): string {
  const layers = assembleDarkRoomControlLayers({
    userPrompt: input.userPrompt,
    artDirection: input.artDirection,
    brandApprovedProps: input.brandApprovedProps,
    brandForbiddenElements: input.brandForbiddenElements,
  });

  const parts: string[] = [];
  const crossCheck = catalogCrossCheckLine(input.catalogClosureLabel);
  if (crossCheck) parts.push(crossCheck);

  const brandColors = cleanedList(input.brandColorNames);
  if (brandColors.length > 0) {
    parts.push(`Brand Colors: ${brandColors.slice(0, 3).join(", ")}`);
  }

  if (layers.propsBlock) parts.push(layers.propsBlock);
  if (layers.artDirectionBlock) parts.push(layers.artDirectionBlock.trimEnd());

  parts.push(`=== USER TWEAK ===\n${input.userPrompt.trim()}`);

  if (input.productRef) {
    parts.push("Use the uploaded product image as the exact subject. Place it in the scene described above.");
  }

  if (input.brandContext?.colors && input.brandContext.colors.length > 0) {
    parts.push(`Incorporate ${input.brandContext.colors.join(" and ")} color tones.`);
  }
  if (input.brandContext?.styleKeywords && input.brandContext.styleKeywords.length > 0) {
    parts.push(`Apply ${input.brandContext.styleKeywords.join(", ")} aesthetic.`);
  }

  return parts.join("\n\n");
}
