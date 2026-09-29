export const CANVAS_PROJECT_TYPES = ["pdp", "campaign"] as const;
export type CanvasProjectType = (typeof CANVAS_PROJECT_TYPES)[number];

export const CANVAS_PROJECT_STATUSES = ["active", "paused", "archived"] as const;
export type CanvasProjectStatus = (typeof CANVAS_PROJECT_STATUSES)[number];

export const SKU_RESOLVED_VIA = [
  "product_hubs",
  "product_variants",
  "brand_products",
  "bb_pipeline_sku_jobs",
  "shopify_live",
] as const;
export type SkuResolvedVia = (typeof SKU_RESOLVED_VIA)[number];

export const WEEK1_NODE_TYPES = [
  "pack",
  "product",
  "set",
  "shot",
  "batch",
  "image",
] as const;
export type Week1NodeType = (typeof WEEK1_NODE_TYPES)[number];

export const CANVAS_NODE_TYPES = [
  ...WEEK1_NODE_TYPES,
  "edit",
  "motion",
  "copy",
  "shopify_slots",
  "export",
  "note",
  "group",
] as const;
export type CanvasNodeType = (typeof CANVAS_NODE_TYPES)[number];

export const CANVAS_NODE_STATUSES = [
  "idle",
  "queued",
  "running",
  "done",
  "failed",
  "pending_review",
  "approved",
  "rejected",
] as const;
export type CanvasNodeStatus = (typeof CANVAS_NODE_STATUSES)[number];

export const CANVAS_PORT_KINDS = [
  "pack",
  "product",
  "set",
  "shot",
  "job",
  "image",
] as const;
export type CanvasPortKind = (typeof CANVAS_PORT_KINDS)[number];

export interface CanvasViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface CanvasProject {
  id: string;
  organization_id: string;
  type: CanvasProjectType;
  title: string;
  sku: string | null;
  status: CanvasProjectStatus;
  pack_version_id: string | null;
  brand_product_id: string | null;
  product_hub_id: string | null;
  shopify_product_gid: string | null;
  shopify_variant_gid: string | null;
  sku_resolved_via: SkuResolvedVia | null;
  sku_resolved_at: string | null;
  monthly_credit_cap: number | null;
  auto_publish_allowed: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CanvasDocument {
  id: string;
  organization_id: string;
  project_id: string;
  name: string;
  pack_version_id: string | null;
  viewport: CanvasViewport;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CanvasNodeRecord {
  id: string;
  organization_id: string;
  project_id: string;
  canvas_id: string;
  type: CanvasNodeType;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  status: CanvasNodeStatus;
  output_ref: Record<string, unknown> | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface CanvasEdgeRecord {
  id: string;
  organization_id: string;
  project_id: string;
  canvas_id: string;
  source_node_id: string;
  target_node_id: string;
  source_handle: string | null;
  target_handle: string | null;
  created_at: string;
}

export const BONE_STUDIO_HEX = "#F5F3EF";
export const BONE_STUDIO_SET_ID = "bone_studio";
export const PLATFORM_BONE_PACK_ID = "platform-bone-v1";

export const DEFAULT_PACK_SETS = [
  {
    id: BONE_STUDIO_SET_ID,
    name: "Bone Studio",
    hex: BONE_STUDIO_HEX,
    prompt:
      "Seamless Bone #F5F3EF studio background, matte and edge to edge. It must visibly read as warm off-white cream, not white and not grey.",
  },
] as const;

export const DEFAULT_SHOT_TYPES = [
  { id: "pdp_main", name: "PDP main", size: "2080 × 2288" },
  { id: "gallery_three_quarter", name: "3/4 gallery", size: "2080 × 2288" },
  { id: "detail", name: "Detail", size: "2080 × 2288" },
] as const;

export const FEATURE_FLAG_KEY = "madison_canvas";
export const FEATURE_FLAG_ENV = "VITE_MADISON_CANVAS";
