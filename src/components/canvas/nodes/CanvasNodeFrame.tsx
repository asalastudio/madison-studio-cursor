import type { ReactNode } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { getNodeTypeSpec, type PortSpec } from "@/lib/canvas/graphValidation";

interface CanvasNodeFrameProps {
  selected?: boolean;
  type: string;
  title: string;
  subtitle?: string;
  children?: ReactNode;
}

function handlePosition(_port: PortSpec, index: number, total: number) {
  const offset = total === 1 ? 50 : 24 + (index * 52) / Math.max(total - 1, 1);
  return { top: `${offset}%` };
}

export function CanvasNodeFrame({ selected, type, title, subtitle, children }: CanvasNodeFrameProps) {
  const spec = getNodeTypeSpec(type);
  const inputs = spec?.ports.filter((port) => port.direction === "in") ?? [];
  const outputs = spec?.ports.filter((port) => port.direction === "out") ?? [];

  return (
    <div
      className={cn(
        "w-64 rounded-lg border bg-card shadow-level-1 transition-all duration-300",
        selected ? "border-primary shadow-level-2" : "border-border",
      )}
    >
      {inputs.map((port, index) => (
        <Handle
          key={port.id}
          id={port.id}
          type="target"
          position={Position.Left}
          style={handlePosition(port, index, inputs.length)}
          className="!w-3 !h-3 !bg-primary !border-background"
          title={port.label}
        />
      ))}
      {outputs.map((port, index) => (
        <Handle
          key={port.id}
          id={port.id}
          type="source"
          position={Position.Right}
          style={handlePosition(port, index, outputs.length)}
          className="!w-3 !h-3 !bg-primary !border-background"
          title={port.label}
        />
      ))}
      <div className="border-b border-border px-4 py-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{spec?.label ?? type}</p>
        <h3 className="font-serif text-lg text-foreground leading-tight">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {children && <div className="px-4 py-3 text-sm text-muted-foreground space-y-1">{children}</div>}
    </div>
  );
}

export function asNodeData(props: NodeProps): Record<string, unknown> {
  return (props.data ?? {}) as Record<string, unknown>;
}

export function textValue(data: Record<string, unknown>, key: string, fallback = "—"): string {
  const value = data[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}
