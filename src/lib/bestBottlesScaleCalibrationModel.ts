import { BEST_BOTTLES_SCALE_CARD_VERSION } from "@/config/bestBottlesCatalogScale";
import { parseDimensionMm } from "@/lib/product-image/skuInjector";

export const BEST_BOTTLES_SCALE_CALIBRATION_VERSION =
  `${BEST_BOTTLES_SCALE_CARD_VERSION}:landmarks-v1` as const;

export type BestBottlesScaleCalibrationStatus = "draft" | "approved" | "archived";

export type NormalizedBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

function slugPart(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function mmPart(value: string | number | null | undefined): string {
  const parsed =
    typeof value === "number"
      ? value
      : parseDimensionMm(typeof value === "string" ? value : null);
  return parsed != null && Number.isFinite(parsed)
    ? String(Math.round(parsed * 10) / 10).replace(".", "p")
    : "unknown";
}

export function buildBestBottlesScaleCalibrationKeys(input: {
  family?: string | null;
  heightWithoutCap?: string | number | null;
  diameter?: string | number | null;
  neckThreadSize?: string | null;
  applicator?: string | null;
  capState?: "assembled" | "sidecar" | "detached" | null;
}): { geometryKey: string; topologyKey: string } {
  return {
    geometryKey: [
      slugPart(input.family),
      `h${mmPart(input.heightWithoutCap)}`,
      `d${mmPart(input.diameter)}`,
      `n${slugPart(input.neckThreadSize)}`,
    ].join(":"),
    topologyKey: [
      input.capState === "assembled" ? "assembled" : "sidecar",
      slugPart(input.applicator ?? "cap-closure"),
    ].join(":"),
  };
}

export function validateNormalizedBounds(bounds: NormalizedBounds): void {
  const values = [bounds.left, bounds.top, bounds.right, bounds.bottom];
  if (values.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) {
    throw new Error("Calibration bounds must be normalized between 0 and 1.");
  }
  if (bounds.right <= bounds.left || bounds.bottom <= bounds.top) {
    throw new Error("Calibration bounds must have positive width and height.");
  }
}
