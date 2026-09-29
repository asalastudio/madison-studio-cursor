import type { Edge, Node, Viewport } from "@xyflow/react";
import {
  canvasEdgesTable,
  canvasNodesTable,
  canvasesTable,
} from "./database";
import { flowNodesToRecords } from "./graphSerialize";

export { flowNodesToRecords, recordsToFlow } from "./graphSerialize";

export async function persistCanvasGraph(options: {
  organizationId: string;
  projectId: string;
  canvasId: string;
  nodes: Node[];
  edges: Edge[];
  viewport: Viewport;
}): Promise<void> {
  const { organizationId, projectId, canvasId, nodes, edges, viewport } = options;

  const { error: viewportError } = await canvasesTable()
    .update({ viewport })
    .eq("id", canvasId)
    .eq("organization_id", organizationId);
  if (viewportError) throw viewportError;

  const { data: existingNodes, error: existingNodeError } = await canvasNodesTable()
    .select("id")
    .eq("canvas_id", canvasId)
    .eq("organization_id", organizationId);
  if (existingNodeError) throw existingNodeError;

  const nextNodeIds = new Set(nodes.map((node) => node.id));
  const staleNodeIds = (Array.isArray(existingNodes) ? existingNodes : [])
    .map((row) => (row as { id: string }).id)
    .filter((id) => !nextNodeIds.has(id));

  if (staleNodeIds.length > 0) {
    const { error } = await canvasNodesTable()
      .delete()
      .eq("organization_id", organizationId)
      .in("id", staleNodeIds);
    if (error) throw error;
  }

  if (nodes.length > 0) {
    const { error } = await canvasNodesTable().upsert(
      flowNodesToRecords(nodes, { organizationId, projectId, canvasId }),
      { onConflict: "id" },
    );
    if (error) throw error;
  }

  const { error: deleteEdgesError } = await canvasEdgesTable()
    .delete()
    .eq("canvas_id", canvasId)
    .eq("organization_id", organizationId);
  if (deleteEdgesError) throw deleteEdgesError;

  if (edges.length === 0) return;

  const { error: insertEdgesError } = await canvasEdgesTable().insert(
    edges.map((edge) => ({
      id: edge.id,
      organization_id: organizationId,
      project_id: projectId,
      canvas_id: canvasId,
      source_node_id: edge.source,
      target_node_id: edge.target,
      source_handle: edge.sourceHandle ?? null,
      target_handle: edge.targetHandle ?? null,
    })),
  );
  if (insertEdgesError) throw insertEdgesError;
}
