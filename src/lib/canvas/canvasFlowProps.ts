import { SelectionMode, type ReactFlowProps } from "@xyflow/react";
import {
  CANVAS_MAX_ZOOM,
  CANVAS_MIN_ZOOM,
  CANVAS_SNAP_GRID,
} from "./boardInteraction";
import { CANVAS_FIT_VIEW_OPTIONS } from "./layout";

/**
 * Shared React Flow interaction props. Typed as Partial<ReactFlowProps>
 * (not `as const`) so key-code arrays stay assignable when spread onto
 * <ReactFlow>.
 */
export const CANVAS_FLOW_PROPS: Partial<ReactFlowProps> = {
  minZoom: CANVAS_MIN_ZOOM,
  maxZoom: CANVAS_MAX_ZOOM,
  fitViewOptions: { ...CANVAS_FIT_VIEW_OPTIONS },
  panOnScroll: true,
  zoomOnPinch: true,
  zoomOnScroll: true,
  zoomActivationKeyCode: ["Control", "Meta"],
  selectionOnDrag: true,
  selectionMode: SelectionMode.Partial,
  panOnDrag: [1, 2],
  panActivationKeyCode: "Space",
  multiSelectionKeyCode: "Shift",
  deleteKeyCode: ["Backspace", "Delete"],
  snapToGrid: true,
  snapGrid: [CANVAS_SNAP_GRID, CANVAS_SNAP_GRID],
  nodesDraggable: true,
  elementsSelectable: true,
  selectNodesOnDrag: true,
  elevateNodesOnSelect: true,
};
