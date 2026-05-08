import type { PipelineStatus } from "@/lib/bestBottlesPipeline";
import type { VariationOption } from "@/config/consistencyVariations";

export interface PipelineRowDescriptor {
  id: string;
  family: string;
  capacityMl: number | null;
  threadSize: string | null;
  glassColor: string | null;
  applicatorTypes: string | null;
  displayName: string;
  convexSlug: string | null;
  primaryGraceSku: string | null;
  primaryWebsiteSku: string | null;
  productUrl: string | null;
  legacyHasHeroImage: boolean;
  legacyHeroImageUrl: string | null;
  madisonStatus: PipelineStatus;
}

export interface PipelineVariationSelection {
  bottleColor?: VariationOption;
  fitmentType?: VariationOption;
}

export const GLASS_COLOR_TO_OPTION: Record<string, string> = {
  Clear: "clear",
  Frosted: "frosted",
  "Cobalt Blue": "blue",
  Amber: "amber",
  Green: "green",
  Swirl: "swirl",
};

export const APPLICATOR_TO_FITMENT: Record<string, string> = {
  "Metal Roller Ball": "roller-ball",
  "Plastic Roller Ball": "roller-ball-plastic",
  "Fine Mist Sprayer": "fine-mist-metal",
  "Plastic Fine Mist Sprayer": "fine-mist-plastic",
  "Perfume Spray Pump": "perfume-spray-pump",
  Atomizer: "fine-mist-metal",
  "Vintage Bulb Sprayer": "vintage-bulb-sprayer",
  "Vintage Bulb Sprayer with Tassel": "vintage-bulb-sprayer-tassel",
  "Antique Bulb Sprayer": "vintage-bulb-sprayer",
  "Antique Bulb Sprayer with Tassel": "vintage-bulb-sprayer-tassel",
  "Lotion Pump": "lotion-pump",
  Dropper: "dropper",
  Reducer: "reducer",
  "Glass Stopper": "glass-stopper",
  "Cap/Closure": "cap-closure",
  "Applicator Cap": "cap-closure",
  "Over Cap": "over-cap",
};

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function splitApplicators(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(/[,;/]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function optionIdForGlassColor(value: string | null | undefined): string | null {
  if (!value) return null;
  const exact = GLASS_COLOR_TO_OPTION[value.trim()];
  if (exact) return exact;
  const lower = normalize(value);
  if (lower.includes("cobalt") || lower.includes("blue")) return "blue";
  if (lower.includes("frost")) return "frosted";
  if (lower.includes("amber")) return "amber";
  if (lower.includes("swirl")) return "swirl";
  if (lower.includes("clear")) return "clear";
  return null;
}

export function optionIdsForApplicatorTypes(value: string | null | undefined): string[] {
  const ids = new Set<string>();
  for (const part of splitApplicators(value)) {
    const exact = APPLICATOR_TO_FITMENT[part];
    if (exact) {
      ids.add(exact);
      continue;
    }
    const lower = normalize(part);
    if (lower.includes("plastic") && lower.includes("fine")) ids.add("fine-mist-plastic");
    else if (lower.includes("fine") || lower.includes("atomizer")) ids.add("fine-mist-metal");
    else if (lower.includes("perfume") && lower.includes("spray")) ids.add("perfume-spray-pump");
    else if (lower.includes("lotion")) ids.add("lotion-pump");
    else if (lower.includes("plastic") && lower.includes("roller")) ids.add("roller-ball-plastic");
    else if (lower.includes("roller")) ids.add("roller-ball");
    else if (lower.includes("tassel")) ids.add("vintage-bulb-sprayer-tassel");
    else if (lower.includes("bulb")) ids.add("vintage-bulb-sprayer");
    else if (lower.includes("dropper")) ids.add("dropper");
    else if (lower.includes("reducer")) ids.add("reducer");
    else if (lower.includes("stopper")) ids.add("glass-stopper");
    else if (lower.includes("over cap")) ids.add("over-cap");
    else if (lower.includes("cap") || lower.includes("closure")) ids.add("cap-closure");
  }
  return Array.from(ids);
}

export function matchPipelineRowsForSelection(
  rows: PipelineRowDescriptor[],
  selection: PipelineVariationSelection,
): PipelineRowDescriptor[] {
  const hasTrackerAxis = !!selection.bottleColor || !!selection.fitmentType;
  if (!hasTrackerAxis) return rows;

  return rows.filter((row) => {
    if (selection.bottleColor) {
      const rowColorId = optionIdForGlassColor(row.glassColor);
      if (rowColorId !== selection.bottleColor.id) return false;
    }

    if (selection.fitmentType) {
      const fitmentIds = optionIdsForApplicatorTypes(row.applicatorTypes);
      if (!fitmentIds.includes(selection.fitmentType.id)) return false;
    }

    return true;
  });
}

export function describePipelineRows(rows: PipelineRowDescriptor[]): string {
  if (rows.length === 0) return "No matched tracker rows";
  if (rows.length === 1) return rows[0].displayName;
  return `${rows.length} matched tracker rows`;
}
