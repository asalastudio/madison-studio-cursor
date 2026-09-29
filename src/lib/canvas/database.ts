import { supabase } from "@/integrations/supabase/client";
import type {
  CanvasDocument,
  CanvasEdgeRecord,
  CanvasNodeRecord,
  CanvasProject,
} from "./types";

/**
 * Accessors for week-1 canvas tables. The generated Database type does not
 * include these tables yet, so we go through an untyped from() and recast
 * rows. Callers never use the service role — only the user session client.
 */
function table(name: "canvas_projects" | "canvases" | "canvas_nodes" | "canvas_edges") {
  return (supabase as unknown as { from: (tableName: string) => UntypedQuery }).from(name);
}

type UntypedQuery = {
  select: (columns?: string) => UntypedQuery;
  insert: (values: unknown) => UntypedQuery;
  update: (values: unknown) => UntypedQuery;
  upsert: (values: unknown, options?: { onConflict?: string }) => UntypedQuery;
  delete: () => UntypedQuery;
  eq: (column: string, value: unknown) => UntypedQuery;
  in: (column: string, values: unknown[]) => UntypedQuery;
  order: (column: string, options?: { ascending?: boolean }) => UntypedQuery;
  maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>;
  single: () => Promise<{ data: unknown; error: { message: string } | null }>;
  then: (
    onfulfilled?: (value: { data: unknown; error: { message: string } | null }) => unknown,
    onrejected?: (reason: unknown) => unknown,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export const canvasProjectsTable = () => table("canvas_projects");
export const canvasesTable = () => table("canvases");
export const canvasNodesTable = () => table("canvas_nodes");
export const canvasEdgesTable = () => table("canvas_edges");

export function asCanvasProject(row: unknown): CanvasProject {
  return row as CanvasProject;
}

export function asCanvasDocument(row: unknown): CanvasDocument {
  const record = row as CanvasDocument & { viewport?: unknown };
  const viewport = record.viewport && typeof record.viewport === "object"
    ? record.viewport as CanvasDocument["viewport"]
    : { x: 0, y: 0, zoom: 1 };
  return { ...record, viewport };
}

export function asCanvasNode(row: unknown): CanvasNodeRecord {
  const record = row as CanvasNodeRecord;
  const position = record.position && typeof record.position === "object"
    ? record.position
    : { x: 0, y: 0 };
  return { ...record, position };
}

export function asCanvasEdge(row: unknown): CanvasEdgeRecord {
  return row as CanvasEdgeRecord;
}
