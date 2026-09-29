import { useCallback, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  Controls,
  MarkerType,
  MiniMap,
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
import { DEFAULT_SHOT_TYPES, type Week1NodeType } from "@/lib/canvas/types";
import { CanvasInspector } from "./CanvasInspector";
import { CanvasRunProvider } from "./CanvasRunContext";
import { CanvasToolbar } from "./CanvasToolbar";
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

function seedGraph(): { nodes: Node[]; edges: Edge[] } {
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

  const nodes: Node[] = [
    ...seeded.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: node.data,
    })),
    {
      id: shotId,
      type: "shot",
      position: { x: 420, y: 360 },
      data: {
        shotTypeId: "pdp_main",
        name: DEFAULT_SHOT_TYPES[0].name,
        size: DEFAULT_SHOT_TYPES[0].size,
        note: "Hero still",
      },
    },
    {
      id: batchId,
      type: "batch",
      position: { x: 760, y: 200 },
      data: { takes: 3 },
    },
    {
      id: imageId,
      type: "image",
      position: { x: 1100, y: 200 },
      data: { name: "PDP main · take 1", status: "idle" },
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
  const seed = useMemo(() => seedGraph(), []);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(seed.nodes);
  const [edges, , onEdgesChange] = useEdgesState<Edge>(seed.edges);
  const [selectedId, setSelectedId] = useState<string | null>(seed.nodes[0]?.id ?? null);
  const [runNote, setRunNote] = useState("Autosave on · generation is Week 2");

  const selectedNode = nodes.find((node) => node.id === selectedId) ?? null;

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
                ? { takes: 3 }
                : { name: "Image", status: "idle" };
    const node: Node = {
      id: crypto.randomUUID(),
      type,
      position: { x: 160 + nodes.length * 28, y: 520 },
      data,
    };
    setNodes((current) => [...current, node]);
    setSelectedId(node.id);
  }, [nodes.length, setNodes]);

  return (
    <CanvasRunProvider
      onRun={(request) => {
        setRunNote(request.scope === "all" ? "Run all is Week 2" : `Run node ${request.nodeId ?? ""} is Week 2`);
      }}
    >
      <div className="madison-canvas dark-room-container">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onSelectionChange={({ nodes: selected }) => setSelectedId(selected[0]?.id ?? selectedId)}
          nodeTypes={canvasNodeTypes}
          defaultEdgeOptions={EDGE_STYLE}
          connectionLineType={ConnectionLineType.Bezier}
          fitView
          elevateNodesOnSelect
          proOptions={{ hideAttribution: true }}
        >
          <Background
            id="madison-dots"
            variant={BackgroundVariant.Dots}
            gap={22}
            size={1.4}
            color="rgba(255, 255, 255, 0.08)"
          />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable />
        </ReactFlow>

        <div className="madison-canvas__header">
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
        </div>

        <CanvasInspector
          node={selectedNode}
          onChange={(nodeId, data) => {
            setNodes((current) => current.map((node) => (node.id === nodeId ? { ...node, data } : node)));
          }}
        />
        <CanvasToolbar onAddNode={addNode} />
      </div>
    </CanvasRunProvider>
  );
}
