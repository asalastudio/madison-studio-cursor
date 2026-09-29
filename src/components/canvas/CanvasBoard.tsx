import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
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
import { ArrowLeft, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useOrganization } from "@/hooks/useOrganization";
import { useCanvasDocument, useCanvasProject, useCanvasRecords } from "@/hooks/useCanvasProjects";
import { persistCanvasGraph, recordsToFlow } from "@/lib/canvas/graphPersist";
import { isValidConnection, validateConnection } from "@/lib/canvas/graphValidation";
import {
  DEFAULT_SHOT_TYPES,
  WEEK1_NODE_TYPES,
  type Week1NodeType,
} from "@/lib/canvas/types";
import { buildDefaultPackNodeData, buildDefaultSetNodeData } from "@/lib/canvas/defaultGraph";
import { CanvasInspector } from "./CanvasInspector";
import { canvasNodeTypes } from "./nodes/canvasNodeTypes";

const AUTOSAVE_MS = 800;

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
  if (type === "batch") return { takes: 3 };
  return { name: "Image", status: "idle" };
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, zoom: 1 });
  const hydratedRef = useRef(false);
  const dirtyRef = useRef(false);

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
    () => nodes.find((node) => node.id === selectedId) ?? null,
    [nodes, selectedId],
  );

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
  }, []);

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
      setEdges((current) => addEdge({ ...connection, id: newId() }, current));
      markDirty();
    },
    [markDirty, nodes, setEdges, toast],
  );

  const addNode = useCallback((type: Week1NodeType) => {
    const node: Node = {
      id: newId(),
      type,
      position: { x: 180 + nodes.length * 24, y: 180 + nodes.length * 16 },
      data: defaultData(type),
    };
    setNodes((current) => [...current, node]);
    setSelectedId(node.id);
    markDirty();
  }, [markDirty, nodes.length, setNodes]);

  const updateNodeData = useCallback((nodeId: string, data: Record<string, unknown>) => {
    setNodes((current) => current.map((node) => (node.id === nodeId ? { ...node, data } : node)));
    markDirty();
  }, [markDirty, setNodes]);

  if (projectQuery.isLoading || canvasQuery.isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">
        Loading canvas…
      </div>
    );
  }

  if (!projectQuery.data || !canvasQuery.data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="font-serif text-2xl">Project not found</p>
          <Button variant="outline" onClick={() => navigate("/projects")}>Back to projects</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-background flex flex-col">
      <header className="h-16 border-b border-border bg-card px-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => navigate("/projects")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {projectQuery.data.type} · {projectQuery.data.sku ?? "no SKU"}
            </p>
            <h1 className="font-serif text-xl truncate">{projectQuery.data.title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto">
          {WEEK1_NODE_TYPES.map((type) => (
            <Button key={type} variant="outline" size="sm" onClick={() => addNode(type)}>
              <Plus className="w-3 h-3" />
              {type}
            </Button>
          ))}
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {saveState === "saving" && "Saving…"}
            {saveState === "saved" && "Saved"}
            {saveState === "error" && "Save failed"}
            {saveState === "idle" && "Autosave on"}
          </span>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] min-h-0">
        <div className="min-h-0">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={(changes) => {
              onNodesChange(changes);
              markDirty();
            }}
            onEdgesChange={(changes) => {
              onEdgesChange(changes);
              markDirty();
            }}
            onConnect={onConnect}
            onSelectionChange={({ nodes: selected }) => setSelectedId(selected[0]?.id ?? null)}
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
            fitView
            proOptions={{ hideAttribution: true }}
            className="bg-background"
          >
            <Background color="var(--border)" gap={24} />
            <Controls />
            <MiniMap
              pannable
              zoomable
              className="!bg-card !border !border-border"
            />
          </ReactFlow>
        </div>
        <aside className="border-t lg:border-t-0 lg:border-l border-border p-4 bg-background overflow-y-auto">
          <CanvasInspector node={selectedNode} onChange={updateNodeData} />
        </aside>
      </div>
    </div>
  );
}
