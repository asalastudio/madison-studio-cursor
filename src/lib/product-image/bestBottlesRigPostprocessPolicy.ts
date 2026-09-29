import { getFamilyRig } from "./familyRig";
import { getBestBottlesCanvasTierForKnownFamily } from "@/config/productImageCanvasTiers";

export interface BestBottlesRigPostprocessPolicyInput {
  libraryTags: string[];
  family?: string | null;
  presetId?: string | null;
  aspectRatio: string;
  canvas: { widthPx: number; heightPx: number };
  sceneOverlay?: {
    backgroundPresetId?: string | null;
    backgroundPrompt?: string | null;
    aspectRatioOverride?: string | null;
    resolutionOverride?: string | null;
  } | null;
}

export type BestBottlesRigPostprocessSkipReason =
  | "not-best-bottles-studio-master"
  | "non-canonical-master-canvas"
  | "scene-background"
  | "family-has-no-rig";

export type BestBottlesRigPostprocessDecision =
  | { run: true; reason: "rig-family-canonical-master" }
  | { run: false; reason: BestBottlesRigPostprocessSkipReason };

const CANONICAL_MASTER_WIDTH = 2080;
const CANONICAL_MASTER_HEIGHT = 2288;
const TOPOLOGY_WIDE_PRESET_ID = "grid-card-wide-low-1536x1024";
const TOPOLOGY_WIDE_WIDTH = 1536;
const TOPOLOGY_WIDE_HEIGHT = 1024;

function isCanonicalMasterCanvas(input: BestBottlesRigPostprocessPolicyInput): boolean {
  const aspect = input.aspectRatio.trim().toLowerCase().replace(/\s+/g, "");
  const isTopologyWideCanvas =
    input.presetId === TOPOLOGY_WIDE_PRESET_ID
    && input.canvas.widthPx === TOPOLOGY_WIDE_WIDTH
    && input.canvas.heightPx === TOPOLOGY_WIDE_HEIGHT
    && (
      aspect === "3:2"
      || aspect === `${TOPOLOGY_WIDE_WIDTH}:${TOPOLOGY_WIDE_HEIGHT}`
      || aspect === `${TOPOLOGY_WIDE_WIDTH}x${TOPOLOGY_WIDE_HEIGHT}`
    );
  if (isTopologyWideCanvas) return true;

  const isLegacyPdpCanvas =
    input.canvas.widthPx === CANONICAL_MASTER_WIDTH &&
    input.canvas.heightPx === CANONICAL_MASTER_HEIGHT &&
    (aspect === "10:11" || aspect === "2080:2288" || aspect === "2080x2288");
  if (isLegacyPdpCanvas) return true;

  const familyTier = getBestBottlesCanvasTierForKnownFamily(input.family);
  if (!familyTier) return false;

  return (
    input.canvas.widthPx === familyTier.canvas.widthPx &&
    input.canvas.heightPx === familyTier.canvas.heightPx &&
    (aspect === familyTier.aspectRatio || aspect === `${familyTier.canvas.widthPx}:${familyTier.canvas.heightPx}` ||
      aspect === `${familyTier.canvas.widthPx}x${familyTier.canvas.heightPx}`)
  );
}

export function shouldRunBestBottlesRigPostprocess(
  input: BestBottlesRigPostprocessPolicyInput,
): BestBottlesRigPostprocessDecision {
  const tagSet = new Set(input.libraryTags);
  if (!tagSet.has("brand:best-bottles") || !tagSet.has("studio-master")) {
    return { run: false, reason: "not-best-bottles-studio-master" };
  }

  if (!isCanonicalMasterCanvas(input)) {
    return { run: false, reason: "non-canonical-master-canvas" };
  }

  if (input.sceneOverlay?.backgroundPresetId || input.sceneOverlay?.backgroundPrompt) {
    return { run: false, reason: "scene-background" };
  }

  if (!getFamilyRig(input.family)) {
    return { run: false, reason: "family-has-no-rig" };
  }

  return { run: true, reason: "rig-family-canonical-master" };
}
