import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDefaultGraph } from "./defaultGraph";
import {
  CANVAS_COLUMN_STRIDE,
  CANVAS_FIT_VIEW_OPTIONS,
  CANVAS_LTR_SLOTS,
  CANVAS_MIN_ZOOM,
  CANVAS_NODE_HEIGHT,
  CANVAS_NODE_WIDTH,
  CANVAS_ORIGIN,
  CANVAS_WRAP_COLUMNS,
  canvasSlotPosition,
  defaultPositionForType,
  nextOpenCanvasSlot,
  nodesOverlap,
} from "./layout";
import { WEEK1_NODE_TYPES } from "./types";

describe("canvas layout", () => {
  it("wraps the week-1 pipeline into two readable rows", () => {
    assert.deepEqual(CANVAS_LTR_SLOTS.pack, { column: 0, row: 0 });
    assert.deepEqual(CANVAS_LTR_SLOTS.product, { column: 1, row: 0 });
    assert.deepEqual(CANVAS_LTR_SLOTS.set, { column: 2, row: 0 });
    assert.deepEqual(CANVAS_LTR_SLOTS.shot, { column: 0, row: 1 });
    assert.deepEqual(CANVAS_LTR_SLOTS.batch, { column: 1, row: 1 });
    assert.deepEqual(CANVAS_LTR_SLOTS.image, { column: 2, row: 1 });
    assert.equal(CANVAS_WRAP_COLUMNS, 3);
    assert.ok(CANVAS_COLUMN_STRIDE >= CANVAS_NODE_WIDTH + 64);
    assert.ok(CANVAS_COLUMN_STRIDE <= CANVAS_NODE_WIDTH + 96);

    for (let i = 0; i < WEEK1_NODE_TYPES.length; i += 1) {
      for (let j = i + 1; j < WEEK1_NODE_TYPES.length; j += 1) {
        const left = WEEK1_NODE_TYPES[i];
        const right = WEEK1_NODE_TYPES[j];
        assert.ok(left && right);
        assert.equal(
          nodesOverlap(defaultPositionForType(left), defaultPositionForType(right)),
          false,
          `${left} overlaps ${right}`,
        );
      }
    }
  });

  it("lays a new PDP project out left to right on the top row", () => {
    const graph = buildDefaultGraph({
      type: "pdp",
      skuHit: {
        sku: "GB-CYL-50-CLR",
        via: "product_hubs",
        productName: "Cylinder 50 ml",
        productHubId: "hub-1",
      },
    });
    const pack = graph.nodes.find((node) => node.type === "pack");
    const product = graph.nodes.find((node) => node.type === "product");
    const set = graph.nodes.find((node) => node.type === "set");
    assert.ok(pack && product && set);
    assert.equal(nodesOverlap(pack.position, product.position), false);
    assert.equal(nodesOverlap(pack.position, set.position), false);
    assert.equal(nodesOverlap(product.position, set.position), false);
    assert.ok(product.position.x > pack.position.x);
    assert.ok(set.position.x > product.position.x);
    assert.equal(pack.position.y, product.position.y);
    assert.equal(pack.position.y, set.position.y);
  });

  it("keeps a two-row graph readable at minZoom 0.6 on a 1120px board", () => {
    assert.equal(CANVAS_FIT_VIEW_OPTIONS.padding, 0.15);
    assert.equal(CANVAS_FIT_VIEW_OPTIONS.minZoom, 0.6);
    assert.equal(CANVAS_MIN_ZOOM, 0.1);
    assert.ok(CANVAS_FIT_VIEW_OPTIONS.minZoom > CANVAS_MIN_ZOOM);

    const left = CANVAS_ORIGIN.x;
    const top = CANVAS_ORIGIN.y;
    const right = canvasSlotPosition(2, 0).x + CANVAS_NODE_WIDTH;
    const bottom = canvasSlotPosition(0, 1).y + CANVAS_NODE_HEIGHT;
    const contentWidth = right - left;
    const contentHeight = bottom - top;
    const availableWidth = 1120 * (1 - 2 * CANVAS_FIT_VIEW_OPTIONS.padding);
    const availableHeight = 900 * (1 - 2 * CANVAS_FIT_VIEW_OPTIONS.padding);
    const zoom = Math.min(availableWidth / contentWidth, availableHeight / contentHeight, 1);
    assert.ok(zoom >= CANVAS_FIT_VIEW_OPTIONS.minZoom, `expected zoom ${zoom} >= 0.6`);
  });

  it("places added nodes in the next free wrap slot instead of stacking", () => {
    const existing = WEEK1_NODE_TYPES.slice(0, 3).map((type) => ({
      type,
      position: defaultPositionForType(type),
    }));
    const next = nextOpenCanvasSlot(existing, "shot");
    assert.deepEqual(next, defaultPositionForType("shot"));
    assert.ok(next.y >= CANVAS_NODE_HEIGHT);

    const filled = WEEK1_NODE_TYPES.map((type) => ({
      type,
      position: defaultPositionForType(type),
    }));
    const overflow = nextOpenCanvasSlot(filled, "shot");
    assert.ok(overflow.x >= canvasSlotPosition(CANVAS_WRAP_COLUMNS).x);
    assert.equal(nodesOverlap(overflow, defaultPositionForType("image")), false);
  });
});
