import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ConnectionLineType,
  MarkerType,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LCDDisplay, LEDIndicator } from "@/components/darkroom/LEDIndicator";
import { useToast } from "@/hooks/use-toast";
import { useOrganization } from "@/hooks/useOrganization";
import { useCanvasDocument, useCanvasProject, useCanvasRecords } from "@/hooks/useCanvasProjects";
import { createCanvasHistory, shouldPersistNodeChanges } from "@/lib/canvas/boardInteraction";
import { CANVAS_FLOW_PROPS } from "@/lib/canvas/canvasFlowProps";
import { persistCanvasGraph } from "@/lib/canvas/graphPersist";
import { recordsToFlow } from "@/lib/canvas/graphSerialize";
import { isValidConnection, validateConnection } from "@/lib/canvas/graphValidation";
import { nextOpenCanvasSlot } from "@/lib/canvas/layout";
import {
  buildDefaultBatchNodeData,
  buildDefaultImageNodeData,
} from "@/lib/canvas/models";
import { week2RunToast } from "@/lib/canvas/runPlaceholder";
import {
  DEFAULT_SHOT_TYPES,
  type Week1NodeType,
} from "@/lib/canvas/types";
import { buildDefaultPackNodeData, buildDefaultSetNodeData } from "@/lib/canvas/defaultGraph";
import { CanvasBoardSurface } from "./CanvasBoardSurface";
import { canvasFitViewOnInit } from "./CanvasFitView";
import { CanvasInspector } from "./CanvasInspector";
import { CanvasRunProvider, type CanvasRunRequest } from "./CanvasRunContext";
import { CanvasToolbar } from "./CanvasToolbar";
import { CanvasWorkspace } from "./CanvasWorkspace";
import { canvasNodeTypes } from "./nodes/canvasNodeTypes";

const AUTOSAVE_MS = 800;

const DEFAULT_EDGE_OPTIONS = {
  type: "default",
  style: { stroke: "var(--darkroom-accent)", strokeWidth: 1.75 },
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: "var(--darkroom-accent)",
    width: 16,
    height: 16,
  },
};

function newId(): string {
  return crypto.randomUUID();
}

function defaultData(type: Week1NodeType): Record<string, unknown> {
  if (type === "pack") return buildDefaultPackNodeData();
  if (type === "set") return buildDefaultSetNodeData();
  if (type === "product") return { name: "Product", sku: "" };
  if (type === "shot") {
    return {
      shotTypeId: "pdp_main",
      name: DEFAULT_SHOT_TYPES[0].name,
      size: DEFAULT_SHOT_TYPES[0].size,
      note: "",
    };
  }
  if (type === "batch") return buildDefaultBatchNodeData();
  return buildDefaultImageNodeData();
}

function saveLed(state: "idle" | "saving" | "saved" | "error") {
  if (state === "saving") return "processing" as const;
  if (state === "saved") return "ready" as const;
  if (state === "error") return "error" as const;
  return "off" as const;
}

interface CanvasBoardProps {
  projectId: string;
}

export function CanvasBoard({ projectId }: CanvasBoardProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { organizationId } = useOrganization();
  const projectQuery = useCanvasProject(projectId);
  const canvasQuery = useCanvasDocument(projectId);
  const recordsQuery = useCanvasRecords(canvasQuery.data?.id);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, zoom: 1 });
  const hydratedRef = useRef(false);
  const dirtyRef = useRef(false);
  const historyRef = useRef(createCanvasHistory());
  const graphRef = useRef({ nodes, edges });
  graphRef.current = { nodes, edges };

  useEffect(() => {
    if (!recordsQuery.data || hydratedRef.current) return;
    const flow = recordsToFlow(recordsQuery.data.nodes, recordsQuery.data.edges);
    setNodes(flow.nodes);
    setEdges(flow.edges);
    if (canvasQuery.data?.viewport) {
      viewportRef.current = canvasQuery.data.viewport;
    }
    hydratedRef.current = true;
  }, [canvasQuery.data?.viewport, recordsQuery.data, setEdges, setNodes]);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedIds[0]) ?? null,
    [nodes, selectedIds],
  );

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
  }, []);

  const undo = useCallback(() => {
    const snapshot = historyRef.current.pop();
    if (!snapshot) return;
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
    markDirty();
  }, [markDirty, setEdges, setNodes]);

  const save = useCallback(async () => {
    if (!organizationId || !canvasQuery.data || !dirtyRef.current) return;
    dirtyRef.current = false;
    setSaveState("saving");
    try {
      await persistCanvasGraph({
        organizationId,
        projectId,
        canvasId: canvasQuery.data.id,
        nodes,
        edges,
        viewport: viewportRef.current,
      });
      setSaveState("saved");
    } catch (error) {
      dirtyRef.current = true;
      setSaveState("error");
      toast({
        title: "Autosave failed",
        description: error instanceof Error ? error.message : "Could not save the canvas",
        variant: "destructive",
      });
    }
  }, [canvasQuery.data, edges, nodes, organizationId, projectId, toast]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    const timer = window.setTimeout(() => {
      void save();
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [edges, nodes, save]);

  const onConnect = useCallback(
    (connection: Connection) => {
      const source = nodes.find((node) => node.id === connection.source);
      const target = nodes.find((node) => node.id === connection.target);
      const result = validateConnection({
        sourceType: source?.type ?? "",
        targetType: target?.type ?? "",
        sourceHandle: connection.sourceHandle,
        targetHandle: connection.targetHandle,
      });
      if (!result.ok) {
        toast({
          title: "Invalid connection",
          description: result.reason,
          variant: "destructive",
        });
        return;
      }
      historyRef.current.push(nodes, edges);
      setEdges((current) => addEdge({ ...DEFAULT_EDGE_OPTIONS, ...connection, id: newId() }, current));
      markDirty();
    },
    [edges, markDirty, nodes, setEdges, toast],
  );

  const addNode = useCallback((type: Week1NodeType) => {
    const node: Node = {
      id: newId(),
      type,
      position: nextOpenCanvasSlot(nodes, type),
      data: defaultData(type),
      draggable: true,
    };
    historyRef.current.push(nodes, edges);
    setNodes((current) => [...current, node]);
    setSelectedIds([node.id]);
    markDirty();
  }, [edges, markDirty, nodes, setNodes]);

  const updateNodeData = useCallback((nodeId: string, data: Record<string, unknown>) => {
    setNodes((current) => current.map((node) => (node.id === nodeId ? { ...node, data } : node)));
    markDirty();
  }, [markDirty, setNodes]);

  const handleRun = useCallback((request: CanvasRunRequest) => {
    toast(week2RunToast(request.scope));
  }, [toast]);

  if (projectQuery.isLoading || canvasQuery.isLoading) {
    return (
      <div className="madison-canvas dark-room-container flex items-center justify-center">
        <LCDDisplay>Loading canvas…</LCDDisplay>
      </div>
    );
  }

  if (!projectQuery.data || !canvasQuery.data) {
    return (
      <div className="madison-canvas dark-room-container flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="madison-canvas__title">Project not found</p>
          <Button
            variant="ghost"
            className="text-[var(--darkroom-text-muted)] hover:text-[var(--darkroom-text)] hover:bg-white/5"
            onClick={() => navigate("/projects")}
          >
            Back to projects
          </Button>
        </div>
      </div>
    );
  }

  return (
    <CanvasRunProvider onRun={handleRun}>
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
              if (shouldPersistNodeChanges(changes)) markDirty();
            }}
            onEdgesChange={(changes) => {
              if (changes.some((change) => change.type === "remove")) {
                historyRef.current.push(graphRef.current.nodes, graphRef.current.edges);
              }
              onEdgesChange(changes);
              if (changes.some((change) => change.type !== "select")) markDirty();
            }}
            onConnect={onConnect}
            onSelectionChange={({ nodes: selected }) => {
              setSelectedIds(selected.map((node) => node.id));
            }}
            onMoveEnd={(_, viewport) => {
              viewportRef.current = viewport;
              markDirty();
            }}
            isValidConnection={(connection) => {
              const source = nodes.find((node) => node.id === connection.source);
              const target = nodes.find((node) => node.id === connection.target);
              return isValidConnection({
                sourceType: source?.type ?? "",
                targetType: target?.type ?? "",
                sourceHandle: connection.sourceHandle,
                targetHandle: connection.targetHandle,
              });
            }}
            nodeTypes={canvasNodeTypes}
            defaultViewport={canvasQuery.data.viewport}
            defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
            connectionLineType={ConnectionLineType.Bezier}
            onInit={canvasFitViewOnInit}
            proOptions={{ hideAttribution: true }}
            {...CANVAS_FLOW_PROPS}
          >
            <CanvasBoardSurface onUndo={undo} />
          </ReactFlow>
        }
        header={
          <header className="dark-room-header">
            <div className="flex items-center gap-2 min-w-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/projects")}
                className="h-8 w-8 p-0 text-[var(--darkroom-text-muted)] hover:text-[var(--darkroom-text)] hover:bg-white/5"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div className="min-w-0">
                <p className="madison-canvas__meta">
                  {projectQuery.data.type} · {projectQuery.data.sku ?? "no SKU"}
                </p>
                <h1 className="madison-canvas__title truncate">{projectQuery.data.title}</h1>
              </div>
            </div>
            <div className="dark-room-header__session">
              <LEDIndicator state={saveLed(saveState)} size="sm" label="Autosave status" />
              <LCDDisplay>
                {saveState === "saving" && "Saving"}
                {saveState === "saved" && "Saved"}
                {saveState === "error" && "Save fail"}
                {saveState === "idle" && "Autosave"}
              </LCDDisplay>
            </div>
          </header>
        }
        inspector={
          <CanvasInspector
            node={selectedNode}
            selectedCount={selectedIds.length}
            onChange={updateNodeData}
          />
        }
        toolbar={<CanvasToolbar onAddNode={addNode} />}
      />
    </CanvasRunProvider>
  );
}
