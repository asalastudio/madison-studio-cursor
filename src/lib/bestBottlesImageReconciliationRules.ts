export type BestBottlesImageAssetRole =
  | "pdp-primary"
  | "pdp-secondary"
  | "marketing"
  | "scene";

export function getBestBottlesImageAssetRoleForPreset(
  presetId: string,
): BestBottlesImageAssetRole {
  if (presetId === "master-scene-flexible-2000x2200") return "scene";
  if (presetId === "master-marketing-2080x2288") return "marketing";
  if (presetId === "master-angle-2080x2288") return "pdp-secondary";
  // Both grid-card presets are catalog heroes. The cap-off sidecar
  // composition is the canonical Cylinder hero (reference lane
  // `sidecar-v2`), so it must stay on the exact-SKU pipeline path:
  // `requires_pipeline_reconciliation` gates link/approve in Postgres.
  return "pdp-primary";
}

export function requiresBestBottlesPipelineReconciliation(
  assetRole: BestBottlesImageAssetRole,
): boolean {
  return assetRole === "pdp-primary";
}

export interface BestBottlesCatalogTruthSnapshot {
  name: string | null;
  graceSku: string | null;
  websiteSku: string | null;
  eligibleGraceSkus: string[];
  eligibleWebsiteSkus: string[];
  family: string | null;
  category: string | null;
  capacityMl: number | null;
  heightWithoutCap: string | null;
  heightWithCap: string | null;
  diameter: string | null;
  neckThreadSize: string | null;
  applicator: string | null;
  capState: string | null;
  capColor: string | null;
  trimColor: string | null;
  bodyMaterial: string | null;
  color: string | null;
  identityStatus: string | null;
  identityBlockers: string[];
  identityHash: string | null;
  sourceReferenceUrl: string | null;
  sourcePageUrl: string | null;
  measurementSource: string | null;
  measurementSourceUrl: string | null;
  measurementSourceNote: string | null;
  websiteTruthStatus: string | null;
  websiteTruthIssues: string[];
}
