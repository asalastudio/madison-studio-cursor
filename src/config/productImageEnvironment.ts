/**
 * Environment plate registry for the paper-doll lane.
 *
 * Exactly one plate is registered for the pilot: `parchment_cream_v1` at
 * `#EEE6D4`. `useAsFinalBackground: true` is the Option A decision —
 * rendering happens on the plate; we do not generate clear glass on
 * transparency and composite later.
 */

import type { EnvironmentPlate } from "@/lib/product-image/types";

export const PARCHMENT_CREAM_V1: EnvironmentPlate = {
  id: "parchment_cream_v1",
  name: "Parchment Cream",
  backgroundHex: "#EEE6D4",
  useAsFinalBackground: true,
  texture: "paper_grain_subtle",
  lightingStyle: "neutral_studio",
  tone: "warm",
};

export const ENVIRONMENT_PLATES: Record<string, EnvironmentPlate> = {
  [PARCHMENT_CREAM_V1.id]: PARCHMENT_CREAM_V1,
};

export const DEFAULT_PAPER_DOLL_PLATE_ID = PARCHMENT_CREAM_V1.id;

export function getEnvironmentPlate(id: string): EnvironmentPlate {
  const plate = ENVIRONMENT_PLATES[id];
  if (!plate) {
    throw new Error(
      `Unknown environment plate "${id}". Registered ids: ${Object.keys(
        ENVIRONMENT_PLATES,
      ).join(", ")}`,
    );
  }
  return plate;
}
