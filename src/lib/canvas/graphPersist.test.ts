import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Node } from "@xyflow/react";
import { flowNodesToRecords, recordsToFlow } from "./graphSerialize";
import type { CanvasNodeRecord } from "./types";

describe("canvas graph persist", () => {
  it("round-trips custom node positions so reload keeps a drag", () => {
    const nodes = [
      {
        id: "pack-1",
        type: "pack",
        position: { x: 240, y: 80 },
        data: { name: "Bone v1" },
      },
    ] as Node[];

    const rows = flowNodesToRecords(nodes, {
      organizationId: "org-1",
      projectId: "proj-1",
      canvasId: "canvas-1",
    });
    assert.deepEqual(rows[0]?.position, { x: 240, y: 80 });

    const reloaded = recordsToFlow(rows as CanvasNodeRecord[], []);
    assert.deepEqual(reloaded.nodes[0]?.position, { x: 240, y: 80 });
    assert.equal(reloaded.nodes[0]?.id, "pack-1");
    assert.equal(reloaded.nodes[0]?.draggable, true);
  });
});
