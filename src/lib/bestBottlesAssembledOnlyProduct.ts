export const CAP_OFF_SIDECAR_PRESET_ID = "grid-card-exploded-2000x2200";
export const ASSEMBLED_GRID_PRESET_ID = "grid-card-2000x2200";

export type AssembledOnlyProductIdentity = {
  graceSku?: string | null;
  websiteSku?: string | null;
  applicator?: string | null;
  itemName?: string | null;
  itemDescription?: string | null;
  family?: string | null;
  productGroupSlug?: string | null;
};

export type AssembledOnlyPdpMode = "cap-on" | "cap-off";

export type AssembledOnlyGenerationState = {
  capState: "assembled" | "detached";
  mode: AssembledOnlyPdpMode;
  requiresCapOffReference: boolean;
};

function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function identityText(identity: AssembledOnlyProductIdentity | null | undefined): string {
  if (!identity) return "";
  return [
    identity.graceSku,
    identity.websiteSku,
    identity.applicator,
    identity.itemName,
    identity.itemDescription,
    identity.productGroupSlug,
  ]
    .map(clean)
    .filter(Boolean)
    .join(" ");
}

export function isAssembledOnlyVintageBulbIdentity(
  identity: AssembledOnlyProductIdentity | null | undefined,
): boolean {
  if (!identity) return false;

  const graceSku = clean(identity.graceSku).toUpperCase();
  const websiteSku = clean(identity.websiteSku);
  const haystack = identityText(identity).toLowerCase();

  if (/(?:^|-)ASP(?:-|$)/.test(graceSku) || /(?:^|-)AST(?:-|$)/.test(graceSku)) {
    return true;
  }
  if (/ansp/i.test(websiteSku) || /antiquespray/i.test(haystack)) {
    return true;
  }
  if (/(?:vintage|antique).*(?:bulb|spray)/.test(haystack)) return true;
  if (/\bbulb sprayer\b/.test(haystack)) return true;
  if (/\btassel\b/.test(haystack) && /\b(?:bulb|antique|vintage|sprayer)\b/.test(haystack)) {
    return true;
  }
  return false;
}

export function allowsCapOffSidecarPreset(
  identity: AssembledOnlyProductIdentity | null | undefined,
): boolean {
  return !isAssembledOnlyVintageBulbIdentity(identity);
}

export function resolveAssembledOnlyPdpMode(
  identity: AssembledOnlyProductIdentity | null | undefined,
  requestedMode: AssembledOnlyPdpMode,
): AssembledOnlyPdpMode {
  return isAssembledOnlyVintageBulbIdentity(identity) ? "cap-on" : requestedMode;
}

export function resolveAssembledOnlyCatalogPresetId(
  identity: AssembledOnlyProductIdentity | null | undefined,
  presetId: string,
): string {
  if (isAssembledOnlyVintageBulbIdentity(identity) && presetId === CAP_OFF_SIDECAR_PRESET_ID) {
    return ASSEMBLED_GRID_PRESET_ID;
  }
  return presetId;
}

export function resolveAssembledOnlyGenerationState(
  identity: AssembledOnlyProductIdentity | null | undefined,
  presetId: string,
): AssembledOnlyGenerationState {
  const resolvedPresetId = resolveAssembledOnlyCatalogPresetId(identity, presetId);
  const detachedSidecar = resolvedPresetId === CAP_OFF_SIDECAR_PRESET_ID;
  return {
    capState: detachedSidecar ? "detached" : "assembled",
    mode: detachedSidecar ? "cap-off" : "cap-on",
    requiresCapOffReference: detachedSidecar,
  };
}
