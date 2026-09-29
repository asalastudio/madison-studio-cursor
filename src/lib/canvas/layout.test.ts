import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDefaultGraph } from "./defaultGraph";
import {
  CANVAS_COLUMN_STRIDE,
  CANVAS_LTR_COLUMNS,
  CANVAS_NODE_HEIGHT,
  CANVAS_NODE_WIDTH,
  defaultPositionForType,
  nextOpenCanvasSlot,
  nodesOverlap,
} from "./layout";
import { WEEK1_NODE_TYPES } from "./types";

describe("canvas layout", () => {
  it("places week-1 types left to right with a full card of space between them", () => {
    const columns = WEEK1_NODE_TYPES.map((type) => CANVAS_LTR_COLUMNS[type]);
    assert.deepEqual(columns, [0, 1, 2, 3, 4, 5]);
    assert.ok(CANVAS_COLUMN_STRIDE >= CANVAS_NODE_WIDTH + 80);

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
        assert.ok(
          defaultPositionForType(right).x >= defaultPositionForType(left).x + CANVAS_NODE_WIDTH,
        );
      }
    }
  });

  it("lays a new PDP project out without Pack/Product or Set overlap", () => {
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
    assert.ok(product.position.x - pack.position.x >= CANVAS_NODE_WIDTH);
    assert.ok(set.position.x - product.position.x >= CANVAS_NODE_WIDTH);
    assert.equal(pack.position.y, product.position.y);
    assert.equal(pack.position.y, set.position.y);
  });

  it("keeps the full week-1 pipeline in one left-to-right row", () => {
    const positions = WEEK1_NODE_TYPES.map((type) => defaultPositionForType(type));
    for (let i = 0; i < positions.length; i += 1) {
      const current = positions[i];
      assert.ok(current);
      assert.equal(current.y, positions[0]?.y);
      for (let j = i + 1; j < positions.length; j += 1) {
        const other = positions[j];
        assert.ok(other);
        assert.equal(nodesOverlap(current, other), false);
      }
    }
  });

  it("places added nodes in the next free column instead of stacking", () => {
    const existing = WEEK1_NODE_TYPES.slice(0, 3).map((type) => ({
      type,
      position: defaultPositionForType(type),
    }));
    const next = nextOpenCanvasSlot(existing, "shot");
    assert.deepEqual(next, defaultPositionForType("shot"));
    const overflow = nextOpenCanvasSlot(
      [...existing, { type: "shot", position: defaultPositionForType("shot") }],
      "shot",
    );
    assert.ok(overflow.x >= defaultPositionForType("shot").x + CANVAS_NODE_WIDTH);
    assert.ok(overflow.y < CANVAS_NODE_HEIGHT);
  });
});
