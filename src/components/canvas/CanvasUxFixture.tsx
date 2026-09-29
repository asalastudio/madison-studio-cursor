import { useCallback, useMemo, useRef, useState } from "react";
import {
  ConnectionLineType,
  MarkerType,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { LEDIndicator, LCDDisplay } from "@/components/darkroom/LEDIndicator";
import {
  buildDefaultGraph,
  buildDefaultPackNodeData,
  buildDefaultSetNodeData,
  buildProductNodeData,
} from "@/lib/canvas/defaultGraph";
import { createCanvasHistory } from "@/lib/canvas/boardInteraction";
import { CANVAS_FLOW_PROPS } from "@/lib/canvas/canvasFlowProps";
import { defaultPositionForType, nextOpenCanvasSlot } from "@/lib/canvas/layout";
import { buildDefaultBatchNodeData, buildDefaultImageNodeData } from "@/lib/canvas/models";
import { DEFAULT_SHOT_TYPES, type Week1NodeType } from "@/lib/canvas/types";
import { CanvasBoardSurface } from "./CanvasBoardSurface";
import { canvasFitViewOnInit } from "./CanvasFitView";
import { CanvasInspector } from "./CanvasInspector";
import { CanvasRunProvider } from "./CanvasRunContext";
import { CanvasToolbar } from "./CanvasToolbar";
import { CanvasWorkspace } from "./CanvasWorkspace";
import { canvasNodeTypes } from "./nodes/canvasNodeTypes";

const EDGE_STYLE = {
  type: "default" as const,
  style: { stroke: "var(--darkroom-accent)", strokeWidth: 1.75 },
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: "var(--darkroom-accent)",
    width: 16,
    height: 16,
  },
};

const REARRANGED_POSITIONS: Record<string, { x: number; y: number }> = {
  pack: { x: 40, y: 40 },
  product: { x: 560, y: 220 },
  set: { x: 1080, y: 80 },
  shot: { x: 200, y: 620 },
  batch: { x: 760, y: 780 },
  image: { x: 1280, y: 520 },
};

function previewShot(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("shot");
}

function seedGraph(rearranged: boolean): { nodes: Node[]; edges: Edge[] } {
  const seeded = buildDefaultGraph({
    type: "pdp",
    skuHit: {
      sku: "GB-CYL-50-CLR",
      via: "product_hubs",
      productName: "Cylinder 50 ml",
      productHubId: "hub-1",
      imageUrl: undefined,
    },
  });

  const shotId = "fixture-shot";
  const batchId = "fixture-batch";
  const imageId = "fixture-image";
  const pack = seeded.nodes.find((node) => node.type === "pack");
  const set = seeded.nodes.find((node) => node.type === "set");
  const product = seeded.nodes.find((node) => node.type === "product");

  const placed = [...seeded.nodes].map((node) => ({
    id: node.id,
    type: node.type,
    position:
      rearranged && node.type && REARRANGED_POSITIONS[node.type]
        ? REARRANGED_POSITIONS[node.type]
        : node.position,
    data: node.data,
    draggable: true,
  }));

  const nodes: Node[] = [
    ...placed,
    {
      id: shotId,
      type: "shot",
      position: rearranged && REARRANGED_POSITIONS.shot
        ? REARRANGED_POSITIONS.shot
        : defaultPositionForType("shot"),
      data: {
        shotTypeId: "pdp_main",
        name: DEFAULT_SHOT_TYPES[0].name,
        size: DEFAULT_SHOT_TYPES[0].size,
        note: "Hero still",
      },
      draggable: true,
    },
    {
      id: batchId,
      type: "batch",
      position: rearranged && REARRANGED_POSITIONS.batch
        ? REARRANGED_POSITIONS.batch
        : defaultPositionForType("batch"),
      data: buildDefaultBatchNodeData(),
      draggable: true,
    },
    {
      id: imageId,
      type: "image",
      position: rearranged && REARRANGED_POSITIONS.image
        ? REARRANGED_POSITIONS.image
        : defaultPositionForType("image"),
      data: buildDefaultImageNodeData("PDP main · take 1"),
      draggable: true,
    },
  ];

  const edges: Edge[] = [
    ...seeded.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      ...EDGE_STYLE,
    })),
  ];

  if (pack && set && product) {
    edges.push(
      { id: "e-pack-shot", source: pack.id, target: shotId, sourceHandle: "pack", targetHandle: "pack", ...EDGE_STYLE },
      { id: "e-set-shot", source: set.id, target: shotId, sourceHandle: "set", targetHandle: "set", ...EDGE_STYLE },
      { id: "e-product-shot", source: product.id, target: shotId, sourceHandle: "product", targetHandle: "product", ...EDGE_STYLE },
      { id: "e-product-batch", source: product.id, target: batchId, sourceHandle: "product", targetHandle: "products", ...EDGE_STYLE },
      { id: "e-set-batch", source: set.id, target: batchId, sourceHandle: "set", targetHandle: "sets", ...EDGE_STYLE },
      { id: "e-shot-batch", source: shotId, target: batchId, sourceHandle: "shot", targetHandle: "shots", ...EDGE_STYLE },
      { id: "e-batch-image", source: batchId, target: imageId, sourceHandle: "jobs", targetHandle: "job", ...EDGE_STYLE },
    );
  }

  return { nodes, edges };
}

export function CanvasUxFixture() {
  const rearranged = previewShot() === "rearranged";
  const seed = useMemo(() => seedGraph(rearranged), [rearranged]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(seed.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(seed.edges);
  const [selectedIds, setSelectedIds] = useState<string[]>(seed.nodes[0] ? [seed.nodes[0].id] : []);
  const [runNote, setRunNote] = useState("Autosave on · generation is Week 2");
  const historyRef = useRef(createCanvasHistory());
  const graphRef = useRef({ nodes, edges });
  graphRef.current = { nodes, edges };

  const selectedNode = nodes.find((node) => node.id === selectedIds[0]) ?? null;

  const undo = useCallback(() => {
    const snapshot = historyRef.current.pop();
    if (!snapshot) return;
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
  }, [setEdges, setNodes]);

  const addNode = useCallback((type: Week1NodeType) => {
    const data =
      type === "pack"
        ? buildDefaultPackNodeData()
        : type === "set"
          ? buildDefaultSetNodeData()
          : type === "product"
            ? buildProductNodeData({
                sku: "NEW-SKU",
                via: "product_hubs",
                productName: "New product",
              })
            : type === "shot"
              ? { shotTypeId: "pdp_main", name: "PDP main", size: "2080 × 2288", note: "" }
              : type === "batch"
                ? buildDefaultBatchNodeData()
                : buildDefaultImageNodeData();
    const node: Node = {
      id: crypto.randomUUID(),
      type,
      position: nextOpenCanvasSlot(nodes, type),
      data,
      draggable: true,
    };
    historyRef.current.push(nodes, edges);
    setNodes((current) => [...current, node]);
    setSelectedIds([node.id]);
  }, [edges, nodes, setNodes]);

  return (
    <CanvasRunProvider
      onRun={(request) => {
        setRunNote(request.scope === "all" ? "Run all is Week 2" : `Run node ${request.nodeId ?? ""} is Week 2`);
      }}
    >
      <CanvasWorkspace
        board={
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={(changes) => {
              if (changes.some((change) => change.type === "remove")) {
                historyRef.current.push(graphRef.current.nodes, graphRef.current.edges);
              }
              onNodesChange(changes);
            }}
            onEdgesChange={(changes) => {
              if (changes.some((change) => change.type === "remove")) {
                historyRef.current.push(graphRef.current.nodes, graphRef.current.edges);
              }
              onEdgesChange(changes);
            }}
            onSelectionChange={({ nodes: selected }) => {
              setSelectedIds(selected.map((node) => node.id));
            }}
            nodeTypes={canvasNodeTypes}
            defaultEdgeOptions={EDGE_STYLE}
            connectionLineType={ConnectionLineType.Bezier}
            defaultViewport={rearranged ? { x: 80, y: 40, zoom: 0.38 } : undefined}
            onInit={rearranged ? undefined : canvasFitViewOnInit}
            proOptions={{ hideAttribution: true }}
            {...CANVAS_FLOW_PROPS}
          >
            <CanvasBoardSurface skipInitialFit={rearranged} onUndo={undo} />
          </ReactFlow>
        }
        header={
          <header className="dark-room-header">
            <div>
              <p className="madison-canvas__meta">pdp · GB-CYL-50-CLR</p>
              <h1 className="madison-canvas__title">Cylinder 50 ml</h1>
            </div>
            <div className="dark-room-header__session">
              <LEDIndicator state="ready" size="sm" label="Autosave status" />
              <LCDDisplay>{runNote}</LCDDisplay>
            </div>
          </header>
        }
        inspector={
          <CanvasInspector
            node={selectedNode}
            selectedCount={selectedIds.length}
            onChange={(nodeId, data) => {
              setNodes((current) => current.map((node) => (node.id === nodeId ? { ...node, data } : node)));
            }}
          />
        }
        toolbar={<CanvasToolbar onAddNode={addNode} />}
      />
    </CanvasRunProvider>
  );
}
