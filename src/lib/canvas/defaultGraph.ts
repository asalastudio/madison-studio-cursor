import { defaultPositionForType } from "./layout";
import {
  BONE_STUDIO_HEX,
  BONE_STUDIO_SET_ID,
  DEFAULT_PACK_SETS,
  DEFAULT_SHOT_TYPES,
  PLATFORM_BONE_PACK_ID,
  type CanvasNodeType,
} from "./types";
import type { SkuResolutionHit } from "./skuResolution";

export interface DraftNode {
  id: string;
  type: CanvasNodeType;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  status: "idle";
}

export interface DraftEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
}

export interface DraftGraph {
  nodes: DraftNode[];
  edges: DraftEdge[];
}

function id(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function buildDefaultPackNodeData() {
  return {
    packId: PLATFORM_BONE_PACK_ID,
    name: "Bone v1",
    brand: "Platform default",
    sets: DEFAULT_PACK_SETS.map((set) => ({ ...set })),
    shotTypes: DEFAULT_SHOT_TYPES.map((shot) => ({ ...shot })),
    note: "Pinned later from prompt_pack_versions. Bone #F5F3EF is the default set.",
  };
}

export function buildDefaultSetNodeData() {
  return {
    setId: BONE_STUDIO_SET_ID,
    name: "Bone Studio",
    hex: BONE_STUDIO_HEX,
    prompt: DEFAULT_PACK_SETS[0].prompt,
  };
}

export function buildProductNodeData(hit: SkuResolutionHit) {
  return {
    sku: hit.sku,
    name: hit.productName,
    productHubId: hit.productHubId ?? null,
    brandProductId: hit.brandProductId ?? null,
    shopifyProductGid: hit.shopifyProductGid ?? null,
    shopifyVariantGid: hit.shopifyVariantGid ?? null,
    imageUrl: hit.imageUrl ?? null,
    resolvedVia: hit.via,
  };
}

export function buildDefaultGraph(options: {
  type: "pdp" | "campaign";
  skuHit?: SkuResolutionHit | null;
}): DraftGraph {
  const packId = id("pack");
  const setId = id("set");
  const nodes: DraftNode[] = [
    {
      id: packId,
      type: "pack",
      position: defaultPositionForType("pack"),
      data: buildDefaultPackNodeData(),
      status: "idle",
    },
    {
      id: setId,
      type: "set",
      position: defaultPositionForType("set"),
      data: buildDefaultSetNodeData(),
      status: "idle",
    },
  ];
  const edges: DraftEdge[] = [
    {
      id: id("edge"),
      source: packId,
      target: setId,
      sourceHandle: "pack",
      targetHandle: "pack",
    },
  ];

  if (options.type === "pdp" && options.skuHit) {
    nodes.push({
      id: id("product"),
      type: "product",
      position: defaultPositionForType("product"),
      data: buildProductNodeData(options.skuHit),
      status: "idle",
    });
  }

  return { nodes, edges };
}
