import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  BEST_BOTTLES_SCALE_CALIBRATION_VERSION,
  validateNormalizedBounds,
  type BestBottlesScaleCalibrationStatus,
  type NormalizedBounds,
} from "@/lib/bestBottlesScaleCalibrationModel";

export {
  BEST_BOTTLES_SCALE_CALIBRATION_VERSION,
  buildBestBottlesScaleCalibrationKeys,
  validateNormalizedBounds,
  type BestBottlesScaleCalibrationStatus,
  type NormalizedBounds,
} from "@/lib/bestBottlesScaleCalibrationModel";

type CalibrationRow =
  Database["public"]["Tables"]["best_bottles_scale_calibrations"]["Row"];
type CalibrationInsert =
  Database["public"]["Tables"]["best_bottles_scale_calibrations"]["Insert"];

export interface BestBottlesScaleCalibration {
  id: string;
  organizationId: string;
  family: string;
  geometryKey: string;
  topologyKey: string;
  calibrationVersion: string;
  graceSku: string;
  websiteSku: string | null;
  productGroupSlug: string;
  sourceReferenceUrl: string;
  sourceReferenceHash: string | null;
  sourceWidthPx: number;
  sourceHeightPx: number;
  glassFootYPct: number;
  glassRimYPct: number;
  fitmentTopYPct: number | null;
  primaryBounds: NormalizedBounds;
  detachedComponentBounds: NormalizedBounds | null;
  status: BestBottlesScaleCalibrationStatus;
  reviewNote: string | null;
  approvedAt: string | null;
}

export interface ScaleCalibrationDraftInput {
  organizationId: string;
  userId: string;
  family: string;
  geometryKey: string;
  topologyKey: string;
  graceSku: string;
  websiteSku?: string | null;
  productGroupSlug: string;
  sourceReferenceUrl: string;
  sourceReferenceHash?: string | null;
  sourceWidthPx: number;
  sourceHeightPx: number;
  glassFootYPct: number;
  glassRimYPct: number;
  fitmentTopYPct?: number | null;
  primaryBounds: NormalizedBounds;
  detachedComponentBounds?: NormalizedBounds | null;
  reviewNote?: string | null;
}

function isNormalizedBounds(value: Json | null): value is {
  left: number;
  top: number;
  right: number;
  bottom: number;
} {
  if (!value || Array.isArray(value) || typeof value !== "object") return false;
  const fields = ["left", "top", "right", "bottom"] as const;
  return fields.every((field) => {
    const entry = value[field];
    return typeof entry === "number" && Number.isFinite(entry);
  });
}

function toDomain(row: CalibrationRow): BestBottlesScaleCalibration {
  if (!isNormalizedBounds(row.primary_bounds)) {
    throw new Error(`Scale calibration ${row.id} has invalid primary bounds.`);
  }
  if (
    row.detached_component_bounds != null &&
    !isNormalizedBounds(row.detached_component_bounds)
  ) {
    throw new Error(`Scale calibration ${row.id} has invalid detached bounds.`);
  }
  const status = row.status as BestBottlesScaleCalibrationStatus;
  if (!["draft", "approved", "archived"].includes(status)) {
    throw new Error(`Scale calibration ${row.id} has invalid status ${row.status}.`);
  }
  return {
    id: row.id,
    organizationId: row.organization_id,
    family: row.family,
    geometryKey: row.geometry_key,
    topologyKey: row.topology_key,
    calibrationVersion: row.calibration_version,
    graceSku: row.grace_sku,
    websiteSku: row.website_sku,
    productGroupSlug: row.product_group_slug,
    sourceReferenceUrl: row.source_reference_url,
    sourceReferenceHash: row.source_reference_hash,
    sourceWidthPx: row.source_width_px,
    sourceHeightPx: row.source_height_px,
    glassFootYPct: row.glass_foot_y_pct,
    glassRimYPct: row.glass_rim_y_pct,
    fitmentTopYPct: row.fitment_top_y_pct,
    primaryBounds: row.primary_bounds,
    detachedComponentBounds: row.detached_component_bounds,
    status,
    reviewNote: row.review_note,
    approvedAt: row.approved_at,
  };
}

function validateDraft(input: ScaleCalibrationDraftInput): void {
  validateNormalizedBounds(input.primaryBounds);
  if (input.detachedComponentBounds) {
    validateNormalizedBounds(input.detachedComponentBounds);
  }
  if (
    !Number.isFinite(input.glassRimYPct) ||
    !Number.isFinite(input.glassFootYPct) ||
    input.glassRimYPct < 0 ||
    input.glassFootYPct > 100 ||
    input.glassFootYPct - input.glassRimYPct < 1
  ) {
    throw new Error("Glass rim and foot must define at least 1% of the source height.");
  }
}

export async function listBestBottlesScaleCalibrations(input: {
  organizationId: string;
  family?: string;
  status?: BestBottlesScaleCalibrationStatus;
}): Promise<BestBottlesScaleCalibration[]> {
  let query = supabase
    .from("best_bottles_scale_calibrations")
    .select("*")
    .eq("organization_id", input.organizationId)
    .order("updated_at", { ascending: false });
  if (input.family) query = query.eq("family", input.family);
  if (input.status) query = query.eq("status", input.status);
  const { data, error } = await query;
  if (error) throw new Error(`Scale calibration list failed: ${error.message}`);
  return (data ?? []).map(toDomain);
}

export async function getApprovedBestBottlesScaleCalibration(input: {
  organizationId: string;
  family: string;
  geometryKey: string;
  topologyKey: string;
}): Promise<BestBottlesScaleCalibration | null> {
  const { data, error } = await supabase
    .from("best_bottles_scale_calibrations")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("family", input.family)
    .eq("geometry_key", input.geometryKey)
    .eq("topology_key", input.topologyKey)
    .eq("status", "approved")
    .maybeSingle();
  if (error) throw new Error(`Scale calibration lookup failed: ${error.message}`);
  return data ? toDomain(data) : null;
}

export async function upsertBestBottlesScaleCalibrationDraft(
  input: ScaleCalibrationDraftInput,
): Promise<BestBottlesScaleCalibration> {
  validateDraft(input);
  const row: CalibrationInsert = {
    organization_id: input.organizationId,
    family: input.family,
    geometry_key: input.geometryKey,
    topology_key: input.topologyKey,
    calibration_version: BEST_BOTTLES_SCALE_CALIBRATION_VERSION,
    grace_sku: input.graceSku,
    website_sku: input.websiteSku ?? null,
    product_group_slug: input.productGroupSlug,
    source_reference_url: input.sourceReferenceUrl,
    source_reference_hash: input.sourceReferenceHash ?? null,
    source_width_px: input.sourceWidthPx,
    source_height_px: input.sourceHeightPx,
    glass_foot_y_pct: input.glassFootYPct,
    glass_rim_y_pct: input.glassRimYPct,
    fitment_top_y_pct: input.fitmentTopYPct ?? null,
    primary_bounds: input.primaryBounds,
    detached_component_bounds: input.detachedComponentBounds ?? null,
    status: "draft",
    review_note: input.reviewNote ?? null,
    created_by: input.userId,
  };
  const { data, error } = await supabase
    .from("best_bottles_scale_calibrations")
    .upsert(row, {
      onConflict:
        "organization_id,family,geometry_key,topology_key,calibration_version",
    })
    .select("*")
    .single();
  if (error) throw new Error(`Scale calibration save failed: ${error.message}`);
  return toDomain(data);
}

export async function approveBestBottlesScaleCalibration(input: {
  organizationId: string;
  calibrationId: string;
  reviewNote?: string | null;
}): Promise<BestBottlesScaleCalibration> {
  const { data, error } = await supabase.rpc(
    "approve_best_bottles_scale_calibration",
    {
      p_organization_id: input.organizationId,
      p_calibration_id: input.calibrationId,
      p_review_note: input.reviewNote ?? undefined,
    },
  );
  if (error) throw new Error(`Scale calibration approval failed: ${error.message}`);
  return toDomain(data);
}
