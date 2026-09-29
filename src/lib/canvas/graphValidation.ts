import {
  WEEK1_NODE_TYPES,
  type CanvasPortKind,
  type Week1NodeType,
} from "./types";

export interface PortSpec {
  id: string;
  kind: CanvasPortKind;
  direction: "in" | "out";
  label: string;
  multiple?: boolean;
}

export interface NodeTypeSpec {
  type: Week1NodeType;
  label: string;
  description: string;
  ports: PortSpec[];
}

export const NODE_TYPE_SPECS: Record<Week1NodeType, NodeTypeSpec> = {
  pack: {
    type: "pack",
    label: "Pack",
    description: "Pinned brand prompt pack. Outputs sets and shot types.",
    ports: [{ id: "pack", kind: "pack", direction: "out", label: "Pack" }],
  },
  product: {
    type: "product",
    label: "Product",
    description: "Product reference from a resolved SKU or upload.",
    ports: [{ id: "product", kind: "product", direction: "out", label: "Product" }],
  },
  set: {
    type: "set",
    label: "Set",
    description: "Backdrop and lighting. Bone Studio is the default.",
    ports: [
      { id: "pack", kind: "pack", direction: "in", label: "Pack" },
      { id: "set", kind: "set", direction: "out", label: "Set" },
    ],
  },
  shot: {
    type: "shot",
    label: "Shot",
    description: "One shot type (PDP main, 3/4, detail) plus an optional note.",
    ports: [
      { id: "pack", kind: "pack", direction: "in", label: "Pack" },
      { id: "set", kind: "set", direction: "in", label: "Set" },
      { id: "product", kind: "product", direction: "in", label: "Product" },
      { id: "shot", kind: "shot", direction: "out", label: "Shot" },
    ],
  },
  batch: {
    type: "batch",
    label: "Batch",
    description: "Fan-out of products × sets × shots. Run is week 2.",
    ports: [
      { id: "products", kind: "product", direction: "in", label: "Products", multiple: true },
      { id: "sets", kind: "set", direction: "in", label: "Sets", multiple: true },
      { id: "shots", kind: "shot", direction: "in", label: "Shots", multiple: true },
      { id: "jobs", kind: "job", direction: "out", label: "Jobs" },
    ],
  },
  image: {
    type: "image",
    label: "Image",
    description: "One generated still. Approve / reject lands in week 2.",
    ports: [
      { id: "job", kind: "job", direction: "in", label: "Job" },
      { id: "image", kind: "image", direction: "out", label: "Image" },
    ],
  },
};

export function isWeek1NodeType(value: string): value is Week1NodeType {
  return (WEEK1_NODE_TYPES as readonly string[]).includes(value);
}

export function getNodeTypeSpec(type: string): NodeTypeSpec | null {
  if (!isWeek1NodeType(type)) return null;
  return NODE_TYPE_SPECS[type];
}

export function getPortSpec(type: string, handleId: string | null | undefined): PortSpec | null {
  const spec = getNodeTypeSpec(type);
  if (!spec) return null;
  if (!handleId) return spec.ports[0] ?? null;
  return spec.ports.find((port) => port.id === handleId) ?? null;
}

export interface ConnectionCandidate {
  sourceType: string;
  targetType: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface ConnectionValidation {
  ok: boolean;
  reason?: string;
}

export function validateConnection(candidate: ConnectionCandidate): ConnectionValidation {
  const sourceSpec = getNodeTypeSpec(candidate.sourceType);
  const targetSpec = getNodeTypeSpec(candidate.targetType);
  if (!sourceSpec || !targetSpec) {
    return { ok: false, reason: "Unknown node type" };
  }

  const sourcePort = getPortSpec(candidate.sourceType, candidate.sourceHandle);
  const targetPort = getPortSpec(candidate.targetType, candidate.targetHandle);
  if (!sourcePort || sourcePort.direction !== "out") {
    return { ok: false, reason: "Source handle is not an output" };
  }
  if (!targetPort || targetPort.direction !== "in") {
    return { ok: false, reason: "Target handle is not an input" };
  }
  if (sourcePort.kind !== targetPort.kind) {
    return {
      ok: false,
      reason: `Cannot connect ${sourcePort.kind} to ${targetPort.kind}`,
    };
  }
  return { ok: true };
}

export interface GraphEdgeLike {
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface GraphNodeLike {
  id: string;
  type: string;
}

export function validateGraph(
  nodes: GraphNodeLike[],
  edges: GraphEdgeLike[],
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const byId = new Map(nodes.map((node) => [node.id, node]));

  for (const node of nodes) {
    if (!isWeek1NodeType(node.type)) {
      errors.push(`Node ${node.id} has unsupported type ${node.type}`);
    }
  }

  for (const edge of edges) {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) {
      errors.push(`Edge ${edge.source} → ${edge.target} references a missing node`);
      continue;
    }
    if (edge.source === edge.target) {
      errors.push(`Edge ${edge.source} cannot connect a node to itself`);
      continue;
    }
    const result = validateConnection({
      sourceType: source.type,
      targetType: target.type,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
    });
    if (!result.ok && result.reason) {
      errors.push(`${source.type} → ${target.type}: ${result.reason}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

export function isValidConnection(candidate: ConnectionCandidate): boolean {
  return validateConnection(candidate).ok;
}
