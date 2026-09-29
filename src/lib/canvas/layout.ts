import type { Week1NodeType } from "./types";

/** Higgsfield media card: 280px wide, ~320px tall with bar + media + settings. */
export const CANVAS_NODE_WIDTH = 280;
export const CANVAS_NODE_HEIGHT = 320;
export const CANVAS_COLUMN_GAP = 140;
export const CANVAS_ROW_GAP = 100;
export const CANVAS_ORIGIN = { x: 48, y: 88 } as const;

export const CANVAS_COLUMN_STRIDE = CANVAS_NODE_WIDTH + CANVAS_COLUMN_GAP;
export const CANVAS_ROW_STRIDE = CANVAS_NODE_HEIGHT + CANVAS_ROW_GAP;

export const CANVAS_FIT_VIEW_OPTIONS = {
  padding: 0.2,
  duration: 200,
  maxZoom: 1,
} as const;

/** Left-to-right pipeline columns. One node per column so tall cards never overlap. */
export const CANVAS_LTR_COLUMNS: Record<Week1NodeType, number> = {
  pack: 0,
  product: 1,
  set: 2,
  shot: 3,
  batch: 4,
  image: 5,
};

export function canvasSlotPosition(column: number, row = 0): { x: number; y: number } {
  return {
    x: CANVAS_ORIGIN.x + column * CANVAS_COLUMN_STRIDE,
    y: CANVAS_ORIGIN.y + row * CANVAS_ROW_STRIDE,
  };
}

export function defaultPositionForType(type: Week1NodeType): { x: number; y: number } {
  return canvasSlotPosition(CANVAS_LTR_COLUMNS[type]);
}

export function nodesOverlap(
  a: { x: number; y: number },
  b: { x: number; y: number },
  width = CANVAS_NODE_WIDTH,
  height = CANVAS_NODE_HEIGHT,
): boolean {
  return a.x < b.x + width && a.x + width > b.x && a.y < b.y + height && a.y + height > b.y;
}

export function nextOpenCanvasSlot(
  nodes: Array<{ type?: string; position: { x: number; y: number } }>,
  type?: Week1NodeType,
): { x: number; y: number } {
  if (type) {
    const preferred = defaultPositionForType(type);
    const occupied = nodes.some((node) => nodesOverlap(node.position, preferred));
    if (!occupied) return preferred;
  }

  const usedColumns = nodes.map((node) =>
    Math.round((node.position.x - CANVAS_ORIGIN.x) / CANVAS_COLUMN_STRIDE),
  );
  const nextColumn = usedColumns.length === 0 ? 0 : Math.max(...usedColumns) + 1;
  return canvasSlotPosition(nextColumn);
}
