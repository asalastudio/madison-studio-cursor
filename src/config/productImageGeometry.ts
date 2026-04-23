/**
 * Paper-doll pilot geometry registry.
 *
 * Carries the Madison-side physical-mm measurements for the pilot family
 * (`cyl_9ml_v1`). Numbers are from the dominant cyl-9ml configuration in
 * `BestBottles_Master_v8.3_Verification.xlsx` (Master Products sheet, rows
 * BB-GB-009-0003 through BB-GB-009-0008).
 *
 * Phase 2 replaces this hardcoded registry with an import of the same v8.3
 * document, populating `geometry_spec` for every shape group. The pilot
 * uses this hardcode because:
 *   1. We already know these numbers for this one family.
 *   2. Zero Convex/file-import infrastructure is in the critical path.
 *   3. The pilot is judged on cyl-9ml only; multi-family is Phase 2.
 *
 * The hardcoded record is shaped to match `GeometrySpec`'s physical-mm
 * fields exactly, so Phase 2 wiring swaps the source without downstream
 * changes.
 */

import type { FitmentSeatDepthByType } from "@/lib/product-image/types";

export interface PilotPhysicalDimensions {
  family: string;
  capacityMl: number;
  threadSize: string;
  neckOuterMm: number;
  bodyHeightMm: number;
  bodyWidthMm: number;
  capHeightMm: number;
  fitmentSeatDepthMm: FitmentSeatDepthByType;
  anchorVersion: string;
  source: string;
}

// ─── Fitment seat depth defaults ─────────────────────────────────────────────
//
// NOT in the v8.3 catalog — these are Madison-side defaults per fitment
// type, sourced from typical supplier specs for GPI 415/400 thread finishes.
// Keyed by the fitment type ids used in the existing APPLICATOR_TO_FITMENT
// map in `src/pages/BestBottlesPipeline.tsx`.

export const DEFAULT_FITMENT_SEAT_DEPTH_MM: FitmentSeatDepthByType = {
  "roller-ball": 5,
  "roller-ball-plastic": 5,
  "fine-mist-metal": 8,
  "perfume-spray-pump": 9,
  "vintage-bulb-sprayer": 7,
  "vintage-bulb-sprayer-tassel": 7,
  "lotion-pump": 10,
  dropper: 14,
  reducer: 4,
  "glass-stopper": 7,
  "cap-closure": 3,
};

// ─── Pilot family — cyl_9ml_v1 ───────────────────────────────────────────────

export const CYL_9ML_V1: PilotPhysicalDimensions = {
  family: "Cylinder", // matches v8.3 Master Products "Family" value
  capacityMl: 9,
  threadSize: "17-415",
  neckOuterMm: 17, // first number in the GPI thread code
  bodyHeightMm: 70, // v8.3 "Height without Cap"
  bodyWidthMm: 20, // v8.3 "Diameter"
  capHeightMm: 13, // v8.3 "Height with Cap" (83) − Height without Cap (70)
  fitmentSeatDepthMm: DEFAULT_FITMENT_SEAT_DEPTH_MM,
  anchorVersion: "1.0",
  source: "hardcoded-from-v8.3-cyl-9ml-dominant-row",
};

/**
 * Pilot registry. Keyed by the synthetic `familyKey` we use in code — NOT
 * the catalog's `family` string. Phase 2 adds more entries or replaces this
 * entirely with a query against the imported v8.3 catalog.
 */
export const PILOT_GEOMETRY: Record<string, PilotPhysicalDimensions> = {
  cyl_9ml_v1: CYL_9ML_V1,
};

/**
 * Resolve the pilot physical-mm record for a given Best Bottles shape
 * group. Matches on `(family, capacityMl, threadSize)`. Returns null if
 * the family is outside the pilot scope — the caller should surface a
 * "not yet supported" message rather than guess.
 */
export function resolvePilotGeometry(params: {
  family: string;
  capacityMl: number | null;
  threadSize: string | null;
}): PilotPhysicalDimensions | null {
  const { family, capacityMl, threadSize } = params;
  for (const rec of Object.values(PILOT_GEOMETRY)) {
    if (
      rec.family === family &&
      rec.capacityMl === capacityMl &&
      rec.threadSize === threadSize
    ) {
      return rec;
    }
  }
  return null;
}

/**
 * Parse the catalog's thread-size string into a neck outer diameter in mm.
 * Handles the two common v8.3 conventions:
 *   - `<mm>-<finish>` e.g. "17-415" -> 17
 *   - `<mm>mm`        e.g. "13mm"   -> 13
 * Returns null for non-standard codes (`"Apothecary"`, `"PRESS-FIT"`, etc.).
 */
export function parseNeckOuterMm(threadSize: string | null): number | null {
  if (!threadSize) return null;
  const trimmed = threadSize.trim();

  const dashMatch = /^(\d+(?:\.\d+)?)-\d+$/.exec(trimmed);
  if (dashMatch) return Number.parseFloat(dashMatch[1]);

  const mmMatch = /^(\d+(?:\.\d+)?)mm$/i.exec(trimmed);
  if (mmMatch) return Number.parseFloat(mmMatch[1]);

  return null;
}
