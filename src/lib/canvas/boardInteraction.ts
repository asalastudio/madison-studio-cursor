import type { Edge, Node, NodeChange } from "@xyflow/react";

export const CANVAS_SNAP_GRID = 20;
export const CANVAS_MIN_ZOOM = 0.1;
export const CANVAS_MAX_ZOOM = 2;
export const CANVAS_HISTORY_LIMIT = 30;

export function snapToCanvasGrid(
  position: { x: number; y: number },
  grid = CANVAS_SNAP_GRID,
): { x: number; y: number } {
  return {
    x: Math.round(position.x / grid) * grid,
    y: Math.round(position.y / grid) * grid,
  };
}

export function formatZoomPercent(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}

export function shouldPersistNodeChanges(changes: NodeChange[]): boolean {
  return changes.some(
    (change) =>
      change.type === "position" ||
      change.type === "remove" ||
      change.type === "add" ||
      change.type === "replace",
  );
}

export interface CanvasSnapshot {
  nodes: Node[];
  edges: Edge[];
}

export function cloneCanvasSnapshot(nodes: Node[], edges: Edge[]): CanvasSnapshot {
  return {
    nodes: nodes.map((node) => ({
      ...node,
      position: { ...node.position },
      data: { ...(node.data ?? {}) },
    })),
    edges: edges.map((edge) => ({ ...edge })),
  };
}

export function deleteSelectedGraph(
  nodes: Node[],
  edges: Edge[],
  selectedIds: Set<string>,
): CanvasSnapshot {
  const nextNodes = nodes.filter((node) => !selectedIds.has(node.id));
  const remaining = new Set(nextNodes.map((node) => node.id));
  return {
    nodes: nextNodes,
    edges: edges.filter(
      (edge) =>
        !selectedIds.has(edge.id) && remaining.has(edge.source) && remaining.has(edge.target),
    ),
  };
}

export function createCanvasHistory(limit = CANVAS_HISTORY_LIMIT) {
  const stack: CanvasSnapshot[] = [];
  return {
    push(nodes: Node[], edges: Edge[]) {
      stack.push(cloneCanvasSnapshot(nodes, edges));
      if (stack.length > limit) stack.shift();
    },
    pop(): CanvasSnapshot | null {
      return stack.pop() ?? null;
    },
    get length() {
      return stack.length;
    },
  };
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}
