import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CameraPanelHeader, LEDIndicator, SettingsRow } from "@/components/darkroom/LEDIndicator";
import { Chip } from "@/components/darkroom/Chip";
import { getNodeTypeSpec } from "@/lib/canvas/graphValidation";
import { DEFAULT_PACK_SETS, DEFAULT_SHOT_TYPES, type Week1NodeType } from "@/lib/canvas/types";
import { week2RunToast } from "@/lib/canvas/runPlaceholder";
import type { Node } from "@xyflow/react";
import { useCanvasRun } from "./CanvasRunContext";

interface CanvasInspectorProps {
  node: Node | null;
  onChange: (nodeId: string, data: Record<string, unknown>) => void;
}

export function CanvasInspector({ node, onChange }: CanvasInspectorProps) {
  const onRun = useCanvasRun();

  if (!node) {
    return (
      <aside className="madison-canvas__inspector nodrag nopan nowheel">
        <div className="camera-panel h-full">
          <CameraPanelHeader title="Inspector" ledState="off" />
          <div className="madison-canvas__inspector-body text-sm text-[var(--darkroom-text-muted)]">
            Select a node to edit typed inputs. Ports stay kind-checked. Run stays a Week 2 placeholder.
          </div>
        </div>
      </aside>
    );
  }

  const spec = getNodeTypeSpec(node.type ?? "");
  const data = (node.data ?? {}) as Record<string, unknown>;
  const patch = (partial: Record<string, unknown>) => onChange(node.id, { ...data, ...partial });
  const runCopy = week2RunToast("node");

  return (
    <aside className="madison-canvas__inspector nodrag nopan nowheel">
      <div className="camera-panel camera-panel--active h-full">
        <CameraPanelHeader title={spec?.label ?? node.type ?? "Node"} ledState="ready" />
        <div className="madison-canvas__inspector-body space-y-4">
          <p className="text-xs text-[var(--darkroom-text-muted)]">{spec?.description}</p>

          {spec && (
            <div className="flex flex-wrap gap-1.5">
              {spec.ports.map((port) => (
                <span key={`${port.direction}-${port.id}`} className="madison-canvas-chip">
                  {port.direction === "in" ? "In" : "Out"}
                  <strong>{port.label}</strong>
                </span>
              ))}
            </div>
          )}

          {node.type === "pack" && (
            <SettingsRow label="Pack name" ledState="ready">
              <Input
                className="nodrag bg-[var(--darkroom-bg)] border-[var(--darkroom-border)] text-[var(--darkroom-text)]"
                value={typeof data.name === "string" ? data.name : ""}
                onChange={(event) => patch({ name: event.target.value })}
              />
            </SettingsRow>
          )}

          {node.type === "product" && (
            <>
              <SettingsRow label="Product name" ledState="ready">
                <Input
                  className="nodrag bg-[var(--darkroom-bg)] border-[var(--darkroom-border)] text-[var(--darkroom-text)]"
                  value={typeof data.name === "string" ? data.name : ""}
                  onChange={(event) => patch({ name: event.target.value })}
                />
              </SettingsRow>
              <SettingsRow label="SKU" ledState="ready">
                <Input
                  className="nodrag bg-[var(--darkroom-bg)] border-[var(--darkroom-border)] text-[var(--darkroom-text)]"
                  value={typeof data.sku === "string" ? data.sku : ""}
                  onChange={(event) => patch({ sku: event.target.value })}
                />
              </SettingsRow>
            </>
          )}

          {node.type === "set" && (
            <SettingsRow label="Set / backdrop" ledState="ready">
              <Select
                value={typeof data.setId === "string" ? data.setId : "bone_studio"}
                onValueChange={(value) => {
                  const set = DEFAULT_PACK_SETS.find((item) => item.id === value);
                  patch({
                    setId: value,
                    name: set?.name,
                    hex: set?.hex,
                    prompt: set?.prompt,
                  });
                }}
              >
                <SelectTrigger className="nodrag bg-[var(--darkroom-bg)] border-[var(--darkroom-border)] text-[var(--darkroom-text)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEFAULT_PACK_SETS.map((set) => (
                    <SelectItem key={set.id} value={set.id}>
                      {set.name} · {set.hex}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingsRow>
          )}

          {node.type === "shot" && (
            <>
              <SettingsRow label="Shot type" ledState="ready">
                <Select
                  value={typeof data.shotTypeId === "string" ? data.shotTypeId : "pdp_main"}
                  onValueChange={(value) => {
                    const shot = DEFAULT_SHOT_TYPES.find((item) => item.id === value);
                    patch({
                      shotTypeId: value,
                      name: shot?.name,
                      size: shot?.size,
                    });
                  }}
                >
                  <SelectTrigger className="nodrag bg-[var(--darkroom-bg)] border-[var(--darkroom-border)] text-[var(--darkroom-text)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEFAULT_SHOT_TYPES.map((shot) => (
                      <SelectItem key={shot.id} value={shot.id}>
                        {shot.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SettingsRow>
              <SettingsRow label="Note" ledState="off">
                <Textarea
                  className="nodrag bg-[var(--darkroom-bg)] border-[var(--darkroom-border)] text-[var(--darkroom-text)]"
                  maxLength={300}
                  value={typeof data.note === "string" ? data.note : ""}
                  onChange={(event) => patch({ note: event.target.value.slice(0, 300) })}
                />
              </SettingsRow>
            </>
          )}

          {node.type === "batch" && (
            <SettingsRow label="Takes per combo" ledState="ready">
              <Input
                className="nodrag bg-[var(--darkroom-bg)] border-[var(--darkroom-border)] text-[var(--darkroom-text)]"
                type="number"
                min={1}
                max={10}
                value={typeof data.takes === "number" ? data.takes : 3}
                onChange={(event) => patch({ takes: Number(event.target.value) || 1 })}
              />
            </SettingsRow>
          )}

          {node.type === "image" && (
            <p className="text-xs text-[var(--darkroom-text-muted)]">
              Status and cost appear after week 2 runs. Approve / reject is not live yet.
            </p>
          )}

          <div className="flex items-center justify-between gap-2 pt-2">
            <span className="inline-flex items-center gap-2 text-[10px] uppercase tracking-wide text-[var(--darkroom-text-dim)]">
              <LEDIndicator state="off" size="sm" label="Run standby" />
              {runCopy.title}
            </span>
            <Chip label="Run node" onClick={() => onRun({ scope: "node", nodeId: node.id })} />
          </div>
        </div>
      </div>
    </aside>
  );
}

export function isInspectableType(type: string | undefined): type is Week1NodeType {
  return Boolean(type && getNodeTypeSpec(type));
}
