import type { Edge, Node } from "@xyflow/react";
import type { CanvasEdgeRecord, CanvasNodeRecord } from "./types";

export function flowNodesToRecords(
  nodes: Node[],
  context: { organizationId: string; projectId: string; canvasId: string },
) {
  return nodes.map((node) => ({
    id: node.id,
    organization_id: context.organizationId,
    project_id: context.projectId,
    canvas_id: context.canvasId,
    type: node.type,
    position: node.position,
    data: (node.data ?? {}) as Record<string, unknown>,
    status: "idle" as const,
  }));
}

export function recordsToFlow(
  nodes: CanvasNodeRecord[],
  edges: CanvasEdgeRecord[],
): { nodes: Node[]; edges: Edge[] } {
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: node.data,
      draggable: true,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source_node_id,
      target: edge.target_node_id,
      sourceHandle: edge.source_handle ?? undefined,
      targetHandle: edge.target_handle ?? undefined,
      type: "default",
    })),
  };
}
