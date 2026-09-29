import type { ReactNode } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Play } from "lucide-react";
import { LEDIndicator } from "@/components/darkroom/LEDIndicator";
import { cn } from "@/lib/utils";
import { getNodeTypeSpec, type PortSpec } from "@/lib/canvas/graphValidation";
import { portKindCssVar } from "@/lib/canvas/portStyle";
import { useCanvasRun } from "../CanvasRunContext";

export interface CanvasNodeSetting {
  label: string;
  value: string;
}

interface CanvasNodeFrameProps {
  id: string;
  selected?: boolean;
  type: string;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  media?: ReactNode;
  settings?: CanvasNodeSetting[];
  children?: ReactNode;
}

function handleOffset(index: number, total: number) {
  const offset = total === 1 ? 50 : 28 + (index * 44) / Math.max(total - 1, 1);
  return { top: `${offset}%` };
}

export function CanvasNodeFrame({
  id,
  selected,
  type,
  title,
  subtitle,
  icon,
  media,
  settings = [],
  children,
}: CanvasNodeFrameProps) {
  const onRun = useCanvasRun();
  const spec = getNodeTypeSpec(type);
  const inputs = spec?.ports.filter((port) => port.direction === "in") ?? [];
  const outputs = spec?.ports.filter((port) => port.direction === "out") ?? [];

  return (
    <div className={cn("madison-canvas-node", selected && "is-selected")}>
      {inputs.map((port, index) => (
        <PortHandle key={`in-${port.id}`} port={port} index={index} total={inputs.length} />
      ))}
      {outputs.map((port, index) => (
        <PortHandle key={`out-${port.id}`} port={port} index={index} total={outputs.length} />
      ))}

      <div className="madison-canvas-node__bar">
        <div className="madison-canvas-node__kind">
          <LEDIndicator state={selected ? "ready" : "off"} size="sm" label={`${spec?.label ?? type} status`} />
          {icon}
          <span>{spec?.label ?? type}</span>
        </div>
        <button
          type="button"
          className="madison-canvas-node__run nodrag nopan"
          onClick={(event) => {
            event.stopPropagation();
            onRun({ scope: "node", nodeId: id });
          }}
        >
          <Play />
          Run
        </button>
      </div>

      <div className="madison-canvas-node__media">{media}</div>

      <div className="madison-canvas-node__body">
        <h3 className="madison-canvas-node__title">{title}</h3>
        {subtitle ? <p className="madison-canvas-node__subtitle">{subtitle}</p> : null}
        {settings.length > 0 && (
          <div className="madison-canvas-node__settings">
            {settings.map((setting) => (
              <span key={`${setting.label}-${setting.value}`} className="madison-canvas-chip">
                {setting.label}
                <strong>{setting.value}</strong>
              </span>
            ))}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

function PortHandle({
  port,
  index,
  total,
}: {
  port: PortSpec;
  index: number;
  total: number;
}) {
  const isInput = port.direction === "in";
  return (
    <>
      <Handle
        id={port.id}
        type={isInput ? "target" : "source"}
        position={isInput ? Position.Left : Position.Right}
        style={{
          ...handleOffset(index, total),
          background: portKindCssVar(port.kind),
          color: portKindCssVar(port.kind),
        }}
        title={port.label}
      />
      <span
        className={cn("madison-canvas-port-label", isInput ? "is-in" : "is-out")}
        style={handleOffset(index, total)}
      >
        {port.label}
      </span>
    </>
  );
}

export function asNodeData(props: NodeProps): Record<string, unknown> {
  return (props.data ?? {}) as Record<string, unknown>;
}

export function textValue(data: Record<string, unknown>, key: string, fallback = "—"): string {
  const value = data[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}
