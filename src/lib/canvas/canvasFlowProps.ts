import { SelectionMode } from "@xyflow/react";
import {
  CANVAS_MAX_ZOOM,
  CANVAS_MIN_ZOOM,
  CANVAS_SNAP_GRID,
} from "./boardInteraction";
import { CANVAS_FIT_VIEW_OPTIONS } from "./layout";

export const CANVAS_FLOW_PROPS = {
  minZoom: CANVAS_MIN_ZOOM,
  maxZoom: CANVAS_MAX_ZOOM,
  fitViewOptions: CANVAS_FIT_VIEW_OPTIONS,
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
  snapGrid: [CANVAS_SNAP_GRID, CANVAS_SNAP_GRID] as [number, number],
  nodesDraggable: true,
  elementsSelectable: true,
  selectNodesOnDrag: true,
  elevateNodesOnSelect: true,
} as const;
