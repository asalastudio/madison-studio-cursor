import { CANVAS_MAX_ZOOM, CANVAS_MIN_ZOOM, CANVAS_SNAP_GRID } from "./boardInteraction";
import type { Week1NodeType } from "./types";

export { CANVAS_MAX_ZOOM, CANVAS_MIN_ZOOM, CANVAS_SNAP_GRID };

/** Higgsfield media card: 280px wide, ~320px tall with bar + media + settings. */
export const CANVAS_NODE_WIDTH = 280;
export const CANVAS_NODE_HEIGHT = 320;
export const CANVAS_COLUMN_GAP = 80;
export const CANVAS_ROW_GAP = 80;
export const CANVAS_ORIGIN = { x: 32, y: 72 } as const;
export const CANVAS_WRAP_COLUMNS = 3;

export const CANVAS_COLUMN_STRIDE = CANVAS_NODE_WIDTH + CANVAS_COLUMN_GAP;
export const CANVAS_ROW_STRIDE = CANVAS_NODE_HEIGHT + CANVAS_ROW_GAP;

/** Readable first paint only — board zoom limits stay 0.1–2. */
export const CANVAS_FIT_VIEW_OPTIONS = {
  padding: 0.15,
  duration: 0,
  minZoom: 0.6,
  maxZoom: 1,
} as const;

export const CANVAS_ZOOM_TO_FIT_OPTIONS = {
  padding: 0.15,
  duration: 200,
} as const;

/**
 * Two-row pipeline so six cards stay readable at minZoom 0.6
 * inside the board (inspector is docked, not overlaid).
 * Top: Pack, Product, Set. Bottom: Shot, Batch, Image.
 */
export const CANVAS_LTR_SLOTS: Record<Week1NodeType, { column: number; row: number }> = {
  pack: { column: 0, row: 0 },
  product: { column: 1, row: 0 },
  set: { column: 2, row: 0 },
  shot: { column: 0, row: 1 },
  batch: { column: 1, row: 1 },
  image: { column: 2, row: 1 },
};

export const CANVAS_LTR_COLUMNS: Record<Week1NodeType, number> = {
  pack: CANVAS_LTR_SLOTS.pack.column,
  product: CANVAS_LTR_SLOTS.product.column,
  set: CANVAS_LTR_SLOTS.set.column,
  shot: CANVAS_LTR_SLOTS.shot.column,
  batch: CANVAS_LTR_SLOTS.batch.column,
  image: CANVAS_LTR_SLOTS.image.column,
};

export function canvasSlotPosition(column: number, row = 0): { x: number; y: number } {
  return {
    x: CANVAS_ORIGIN.x + column * CANVAS_COLUMN_STRIDE,
    y: CANVAS_ORIGIN.y + row * CANVAS_ROW_STRIDE,
  };
}

export function defaultPositionForType(type: Week1NodeType): { x: number; y: number } {
  const slot = CANVAS_LTR_SLOTS[type];
  return canvasSlotPosition(slot.column, slot.row);
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

  for (let row = 0; row < 2; row += 1) {
    for (let column = 0; column < CANVAS_WRAP_COLUMNS; column += 1) {
      const candidate = canvasSlotPosition(column, row);
      if (!nodes.some((node) => nodesOverlap(node.position, candidate))) {
        return candidate;
      }
    }
  }

  const usedColumns = nodes.map((node) =>
    Math.round((node.position.x - CANVAS_ORIGIN.x) / CANVAS_COLUMN_STRIDE),
  );
  const nextColumn = usedColumns.length === 0 ? 0 : Math.max(...usedColumns, CANVAS_WRAP_COLUMNS - 1) + 1;
  return canvasSlotPosition(nextColumn);
}
