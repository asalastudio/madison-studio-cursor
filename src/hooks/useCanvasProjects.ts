import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import {
  asCanvasDocument,
  asCanvasEdge,
  asCanvasNode,
  asCanvasProject,
  canvasEdgesTable,
  canvasNodesTable,
  canvasProjectsTable,
  canvasesTable,
} from "@/lib/canvas/database";
import { buildDefaultGraph } from "@/lib/canvas/defaultGraph";
import { resolveOrganizationSku } from "@/lib/canvas/fetchSkuCatalog";
import type { CanvasProject, CanvasProjectStatus, CanvasProjectType } from "@/lib/canvas/types";
import type { SkuResolutionHit } from "@/lib/canvas/skuResolution";

export interface CreateCanvasProjectInput {
  title: string;
  type: CanvasProjectType;
  sku?: string;
}

export interface CreateCanvasProjectResult {
  project: CanvasProject;
  canvasId: string;
}

async function insertDefaultGraph(options: {
  organizationId: string;
  projectId: string;
  canvasId: string;
  type: CanvasProjectType;
  skuHit?: SkuResolutionHit | null;
}) {
  const graph = buildDefaultGraph({ type: options.type, skuHit: options.skuHit });

  const { error: nodeError } = await canvasNodesTable().insert(
    graph.nodes.map((node) => ({
      id: node.id,
      organization_id: options.organizationId,
      project_id: options.projectId,
      canvas_id: options.canvasId,
      type: node.type,
      position: node.position,
      data: node.data,
      status: node.status,
    })),
  );
  if (nodeError) throw nodeError;

  if (graph.edges.length === 0) return;

  const { error: edgeError } = await canvasEdgesTable().insert(
    graph.edges.map((edge) => ({
      id: edge.id,
      organization_id: options.organizationId,
      project_id: options.projectId,
      canvas_id: options.canvasId,
      source_node_id: edge.source,
      target_node_id: edge.target,
      source_handle: edge.sourceHandle,
      target_handle: edge.targetHandle,
    })),
  );
  if (edgeError) throw edgeError;
}

export function useCanvasProjects() {
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ["canvas-projects", organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await canvasProjectsTable()
        .select("*")
        .eq("organization_id", organizationId as string)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (Array.isArray(data) ? data : []).map(asCanvasProject);
    },
  });

  const createMutation = useMutation({
    mutationFn: async (input: CreateCanvasProjectInput): Promise<CreateCanvasProjectResult> => {
      if (!organizationId || !user?.id) {
        throw new Error("You must be signed in to an organization");
      }

      const title = input.title.trim();
      if (!title) throw new Error("Title is required");

      let sku: string | null = input.sku?.trim() || null;
      let skuHit: SkuResolutionHit | null = null;

      if (input.type === "pdp") {
        if (!sku) throw new Error("PDP projects require a SKU");
        const resolution = await resolveOrganizationSku(organizationId, sku);
        if (resolution.status === "unresolved" || resolution.status === "ambiguous") {
          throw new Error(resolution.message);
        }
        skuHit = resolution.hit;
        sku = resolution.hit.sku;
      } else {
        sku = null;
      }

      const { data: projectRow, error: projectError } = await canvasProjectsTable()
        .insert({
          organization_id: organizationId,
          type: input.type,
          title,
          sku,
          status: "active",
          product_hub_id: skuHit?.productHubId ?? null,
          brand_product_id: skuHit?.brandProductId ?? null,
          shopify_product_gid: skuHit?.shopifyProductGid ?? null,
          shopify_variant_gid: skuHit?.shopifyVariantGid ?? null,
          sku_resolved_via: skuHit?.via ?? null,
          sku_resolved_at: skuHit ? new Date().toISOString() : null,
          created_by: user.id,
        })
        .select("*")
        .single();

      if (projectError || !projectRow) {
        throw new Error(projectError?.message ?? "Could not create the project");
      }

      const project = asCanvasProject(projectRow);

      const { data: canvasRow, error: canvasError } = await canvasesTable()
        .insert({
          organization_id: organizationId,
          project_id: project.id,
          name: "Main",
          viewport: { x: 0, y: 0, zoom: 1 },
          created_by: user.id,
        })
        .select("*")
        .single();

      if (canvasError || !canvasRow) {
        throw new Error(canvasError?.message ?? "Could not create the canvas");
      }

      const canvas = asCanvasDocument(canvasRow);
      await insertDefaultGraph({
        organizationId,
        projectId: project.id,
        canvasId: canvas.id,
        type: input.type,
        skuHit,
      });

      return { project, canvasId: canvas.id };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["canvas-projects", organizationId] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (projectId: string) => {
      const { error } = await canvasProjectsTable()
        .update({ status: "archived" as CanvasProjectStatus })
        .eq("id", projectId)
        .eq("organization_id", organizationId as string);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["canvas-projects", organizationId] });
    },
  });

  return {
    projects: listQuery.data ?? [],
    isLoading: listQuery.isLoading,
    error: listQuery.error,
    createProject: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    archiveProject: archiveMutation.mutateAsync,
    refetch: listQuery.refetch,
  };
}

export function useCanvasProject(projectId: string | undefined) {
  const { organizationId } = useOrganization();

  return useQuery({
    queryKey: ["canvas-project", organizationId, projectId],
    enabled: Boolean(organizationId && projectId),
    queryFn: async () => {
      const { data, error } = await canvasProjectsTable()
        .select("*")
        .eq("id", projectId as string)
        .eq("organization_id", organizationId as string)
        .maybeSingle();
      if (error) throw error;
      return data ? asCanvasProject(data) : null;
    },
  });
}

export function useCanvasDocument(projectId: string | undefined) {
  const { organizationId } = useOrganization();

  return useQuery({
    queryKey: ["canvas-document", organizationId, projectId],
    enabled: Boolean(organizationId && projectId),
    queryFn: async () => {
      const { data, error } = await canvasesTable()
        .select("*")
        .eq("project_id", projectId as string)
        .eq("organization_id", organizationId as string)
        .eq("name", "Main")
        .maybeSingle();
      if (error) throw error;
      return data ? asCanvasDocument(data) : null;
    },
  });
}

export function useCanvasRecords(canvasId: string | undefined) {
  const { organizationId } = useOrganization();

  return useQuery({
    queryKey: ["canvas-records", organizationId, canvasId],
    enabled: Boolean(organizationId && canvasId),
    queryFn: async () => {
      const [nodes, edges] = await Promise.all([
        canvasNodesTable()
          .select("*")
          .eq("canvas_id", canvasId as string)
          .eq("organization_id", organizationId as string),
        canvasEdgesTable()
          .select("*")
          .eq("canvas_id", canvasId as string)
          .eq("organization_id", organizationId as string),
      ]);
      if (nodes.error) throw nodes.error;
      if (edges.error) throw edges.error;
      return {
        nodes: (Array.isArray(nodes.data) ? nodes.data : []).map(asCanvasNode),
        edges: (Array.isArray(edges.data) ? edges.data : []).map(asCanvasEdge),
      };
    },
  });
}
