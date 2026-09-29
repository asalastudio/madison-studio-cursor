import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Edge, Node, NodeChange } from "@xyflow/react";
import {
  CANVAS_MAX_ZOOM,
  CANVAS_MIN_ZOOM,
  CANVAS_SNAP_GRID,
  createCanvasHistory,
  deleteSelectedGraph,
  formatZoomPercent,
  shouldPersistNodeChanges,
  snapToCanvasGrid,
} from "./boardInteraction";
import { CANVAS_FLOW_PROPS } from "./canvasFlowProps";
import { CANVAS_FIT_VIEW_OPTIONS } from "./layout";

describe("canvas board interaction", () => {
  it("keeps a readable initial fit while the board can zoom far out", () => {
    assert.equal(CANVAS_MIN_ZOOM, 0.1);
    assert.equal(CANVAS_MAX_ZOOM, 2);
    assert.equal(CANVAS_FIT_VIEW_OPTIONS.minZoom, 0.6);
    assert.ok(CANVAS_FIT_VIEW_OPTIONS.minZoom > CANVAS_MIN_ZOOM);
    assert.equal(formatZoomPercent(0.37), "37%");
    assert.equal(formatZoomPercent(1), "100%");
    assert.equal(CANVAS_FLOW_PROPS.minZoom, 0.1);
    assert.equal(CANVAS_FLOW_PROPS.maxZoom, 2);
    assert.equal(CANVAS_FLOW_PROPS.panOnScroll, true);
    assert.equal(CANVAS_FLOW_PROPS.selectionOnDrag, true);
    assert.equal(CANVAS_FLOW_PROPS.snapToGrid, true);
    assert.deepEqual(CANVAS_FLOW_PROPS.snapGrid, [20, 20]);
    assert.deepEqual(CANVAS_FLOW_PROPS.deleteKeyCode, ["Backspace", "Delete"]);
    assert.equal(CANVAS_FLOW_PROPS.multiSelectionKeyCode, "Shift");
    assert.equal(CANVAS_FLOW_PROPS.panActivationKeyCode, "Space");
  });

  it("snaps positions to the same 20px grid as the dot background", () => {
    assert.equal(CANVAS_SNAP_GRID, 20);
    assert.deepEqual(snapToCanvasGrid({ x: 47, y: 33 }), { x: 40, y: 40 });
    assert.deepEqual(snapToCanvasGrid({ x: 50, y: 10 }), { x: 60, y: 20 });
  });

  it("persists position and topology changes, not selection", () => {
    const selectOnly = [{ type: "select", id: "n1", selected: true }] as NodeChange[];
    const drag = [{ type: "position", id: "n1", position: { x: 40, y: 20 } }] as NodeChange[];
    assert.equal(shouldPersistNodeChanges(selectOnly), false);
    assert.equal(shouldPersistNodeChanges(drag), true);
  });

  it("deletes a selection and restores it from a simple undo stack", () => {
    const nodes = [
      { id: "pack", type: "pack", position: { x: 0, y: 0 }, data: {} },
      { id: "set", type: "set", position: { x: 80, y: 0 }, data: {} },
    ] as Node[];
    const edges = [{ id: "e1", source: "pack", target: "set" }] as Edge[];
    const history = createCanvasHistory();
    history.push(nodes, edges);

    const deleted = deleteSelectedGraph(nodes, edges, new Set(["set"]));
    assert.deepEqual(deleted.nodes.map((node) => node.id), ["pack"]);
    assert.equal(deleted.edges.length, 0);

    const restored = history.pop();
    assert.ok(restored);
    assert.deepEqual(restored.nodes.map((node) => node.id), ["pack", "set"]);
    assert.equal(restored.edges.length, 1);
  });
});
