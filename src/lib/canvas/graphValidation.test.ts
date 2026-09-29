import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  validateConnection,
  validateGraph,
  NODE_TYPE_SPECS,
} from "./graphValidation";
import { WEEK1_NODE_TYPES } from "./types";
import { buildDefaultGraph } from "./defaultGraph";

describe("canvas graph validation", () => {
  it("defines typed ports for every week-1 node", () => {
    for (const type of WEEK1_NODE_TYPES) {
      const spec = NODE_TYPE_SPECS[type];
      assert.ok(spec.ports.length > 0, type);
      assert.ok(spec.ports.some((port) => port.direction === "out") || type === "image");
    }
  });

  it("allows pack → set and product → batch", () => {
    assert.equal(
      validateConnection({
        sourceType: "pack",
        targetType: "set",
        sourceHandle: "pack",
        targetHandle: "pack",
      }).ok,
      true,
    );
    assert.equal(
      validateConnection({
        sourceType: "product",
        targetType: "batch",
        sourceHandle: "product",
        targetHandle: "products",
      }).ok,
      true,
    );
    assert.equal(
      validateConnection({
        sourceType: "batch",
        targetType: "image",
        sourceHandle: "jobs",
        targetHandle: "job",
      }).ok,
      true,
    );
  });

  it("rejects mismatched port kinds", () => {
    const result = validateConnection({
      sourceType: "pack",
      targetType: "image",
      sourceHandle: "pack",
      targetHandle: "job",
    });
    assert.equal(result.ok, false);
    assert.match(result.reason ?? "", /Cannot connect pack to job/);
  });

  it("rejects connecting an input as a source", () => {
    const result = validateConnection({
      sourceType: "set",
      targetType: "shot",
      sourceHandle: "pack",
      targetHandle: "set",
    });
    assert.equal(result.ok, false);
  });

  it("accepts the default PDP graph", () => {
    const graph = buildDefaultGraph({
      type: "pdp",
      skuHit: {
        sku: "GB-CYL-50-CLR",
        via: "product_hubs",
        productName: "Cylinder 50 ml",
        productHubId: "hub-1",
      },
    });
    const result = validateGraph(
      graph.nodes,
      graph.edges.map((edge) => ({
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
      })),
    );
    assert.equal(result.ok, true, result.errors.join("; "));
    assert.ok(graph.nodes.some((node) => node.type === "product"));
    assert.equal(graph.nodes.find((node) => node.type === "set")?.data.hex, "#F5F3EF");
  });

  it("does not auto-create a product node on campaign projects", () => {
    const graph = buildDefaultGraph({ type: "campaign" });
    assert.equal(graph.nodes.some((node) => node.type === "product"), false);
  });
});
