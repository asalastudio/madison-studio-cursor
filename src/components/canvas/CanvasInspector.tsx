import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getNodeTypeSpec } from "@/lib/canvas/graphValidation";
import { DEFAULT_PACK_SETS, DEFAULT_SHOT_TYPES, type Week1NodeType } from "@/lib/canvas/types";
import type { Node } from "@xyflow/react";

interface CanvasInspectorProps {
  node: Node | null;
  onChange: (nodeId: string, data: Record<string, unknown>) => void;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function CanvasInspector({ node, onChange }: CanvasInspectorProps) {
  if (!node) {
    return (
      <Card className="bg-card border border-border h-full">
        <CardHeader>
          <CardTitle className="font-serif text-xl">Inspector</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Select a node to edit its typed inputs. Connections are validated by port kind.
        </CardContent>
      </Card>
    );
  }

  const spec = getNodeTypeSpec(node.type ?? "");
  const data = (node.data ?? {}) as Record<string, unknown>;
  const patch = (partial: Record<string, unknown>) => onChange(node.id, { ...data, ...partial });

  return (
    <Card className="bg-card border border-border h-full overflow-y-auto">
      <CardHeader>
        <CardTitle className="font-serif text-xl">{spec?.label ?? node.type}</CardTitle>
        <p className="text-sm text-muted-foreground">{spec?.description}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {spec && (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Ports</p>
            <div className="flex flex-wrap gap-2">
              {spec.ports.map((port) => (
                <span
                  key={`${port.direction}-${port.id}`}
                  className="text-xs border border-border rounded px-2 py-1 text-muted-foreground"
                >
                  {port.direction === "in" ? "In" : "Out"} · {port.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {(node.type === "pack") && (
          <Field label="Pack name">
            <Input
              className="bg-background"
              value={typeof data.name === "string" ? data.name : ""}
              onChange={(event) => patch({ name: event.target.value })}
            />
          </Field>
        )}

        {node.type === "product" && (
          <>
            <Field label="Product name">
              <Input
                className="bg-background"
                value={typeof data.name === "string" ? data.name : ""}
                onChange={(event) => patch({ name: event.target.value })}
              />
            </Field>
            <Field label="SKU">
              <Input
                className="bg-background"
                value={typeof data.sku === "string" ? data.sku : ""}
                onChange={(event) => patch({ sku: event.target.value })}
              />
            </Field>
          </>
        )}

        {node.type === "set" && (
          <Field label="Set">
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
              <SelectTrigger>
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
          </Field>
        )}

        {node.type === "shot" && (
          <>
            <Field label="Shot type">
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
                <SelectTrigger>
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
            </Field>
            <Field label="Note (optional, ≤300)">
              <Textarea
                className="bg-background"
                maxLength={300}
                value={typeof data.note === "string" ? data.note : ""}
                onChange={(event) => patch({ note: event.target.value.slice(0, 300) })}
              />
            </Field>
          </>
        )}

        {node.type === "batch" && (
          <Field label="Takes per combo">
            <Input
              className="bg-background"
              type="number"
              min={1}
              max={10}
              value={typeof data.takes === "number" ? data.takes : 3}
              onChange={(event) => patch({ takes: Number(event.target.value) || 1 })}
            />
          </Field>
        )}

        {node.type === "image" && (
          <p className="text-sm text-muted-foreground">
            Status and cost appear after week 2 runs. Approve / reject is not live yet.
          </p>
        )}

        <Button variant="ghost" size="sm" disabled>
          Run node — week 2
        </Button>
      </CardContent>
    </Card>
  );
}

export function isInspectableType(type: string | undefined): type is Week1NodeType {
  return Boolean(type && getNodeTypeSpec(type));
}
