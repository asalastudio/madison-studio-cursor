import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  BEST_BOTTLES_PRODUCT_SHOT_LAYOUT,
  FLUX3_ASPECT_RATIOS,
  type Flux3BBox,
  type Flux3ClientRequest,
  type Flux3GenerateElement,
  type Flux3LayoutElement,
} from "../../../supabase/functions/_shared/bflFlux3Layout.ts";

interface Flux3LayoutEditorProps {
  value: Flux3ClientRequest;
  onChange: (next: Flux3ClientRequest) => void;
  disabled?: boolean;
}

function isGenerateElement(element: Flux3LayoutElement): element is Flux3GenerateElement {
  return "bbox" in element;
}

function boxOf(element: Flux3LayoutElement): Flux3BBox {
  if (isGenerateElement(element)) return element.bbox;
  return element.tgt_bbox ?? element.src_bbox ?? [100, 100, 400, 400];
}

function withBox(element: Flux3LayoutElement, bbox: Flux3BBox): Flux3GenerateElement {
  return { id: element.id, desc: element.desc, bbox };
}

function nextElementId(elements: Flux3LayoutElement[]): string {
  const used = new Set(elements.map((element) => element.id));
  let index = elements.length + 1;
  while (used.has(`element_${index}`)) index += 1;
  return `element_${index}`;
}

export function Flux3LayoutEditor({ value, onChange, disabled = false }: Flux3LayoutEditorProps) {
  const elements = value.elements ?? [];

  const updateElement = (index: number, next: Flux3LayoutElement) => {
    const copy = elements.slice();
    copy[index] = next;
    onChange({ ...value, elements: copy });
  };

  const applyProductShot = () => {
    onChange({
      ...value,
      caption: BEST_BOTTLES_PRODUCT_SHOT_LAYOUT.caption,
      aspectRatio: BEST_BOTTLES_PRODUCT_SHOT_LAYOUT.aspectRatio,
      resolution: BEST_BOTTLES_PRODUCT_SHOT_LAYOUT.resolution,
      elements: BEST_BOTTLES_PRODUCT_SHOT_LAYOUT.elements.map((element) => ({ ...element })),
      lockExceptId: undefined,
    });
  };

  return (
    <div className="space-y-3 rounded border border-border bg-card p-3 text-foreground">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-sans text-sm font-medium">FLUX 3 layout</p>
          <p className="font-sans text-xs text-muted-foreground">
            Boxes use a 0–1000 grid: top, left, bottom, right. Product shots prefer 2K or 4K.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={applyProductShot} disabled={disabled}>
          Bottle, surface, light
        </Button>
      </div>

      <label className="block space-y-1">
        <span className="font-sans text-xs text-muted-foreground">Scene caption</span>
        <Textarea
          value={value.caption ?? ""}
          onChange={(event) => onChange({ ...value, caption: event.target.value })}
          disabled={disabled}
          placeholder="Name each element in angle brackets, such as <bottle_1>."
          className="min-h-20 bg-background font-sans text-sm"
        />
      </label>

      <label className="block space-y-1">
        <span className="font-sans text-xs text-muted-foreground">Aspect ratio</span>
        <select
          value={value.aspectRatio ?? "4:5"}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, aspectRatio: event.target.value })}
          className="h-8 w-full rounded border border-border bg-background px-2 font-sans text-sm"
        >
          {FLUX3_ASPECT_RATIOS.filter((ratio) => ratio !== "auto").map((ratio) => (
            <option key={ratio} value={ratio}>{ratio}</option>
          ))}
        </select>
      </label>

      <div className="space-y-2">
        {elements.map((element, index) => {
          const box = boxOf(element);
          const setCoord = (coord: number, nextValue: string) => {
            const parsed = Number.parseInt(nextValue, 10);
            const next = box.slice() as Flux3BBox;
            next[coord] = Number.isFinite(parsed) ? parsed : 0;
            updateElement(index, withBox(element, next));
          };
          return (
            <div key={`${element.id}-${index}`} className="space-y-2 rounded border border-border bg-background p-2">
              <div className="flex gap-2">
                <Input
                  value={element.id}
                  disabled={disabled}
                  aria-label={`Element ${index + 1} id`}
                  onChange={(event) => updateElement(index, { ...withBox(element, box), id: event.target.value.trim() })}
                  className="bg-background font-sans text-sm"
                  placeholder="bottle_1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() => onChange({
                    ...value,
                    elements: elements.filter((_, elementIndex) => elementIndex !== index),
                    lockExceptId: value.lockExceptId === element.id ? undefined : value.lockExceptId,
                  })}
                >
                  Remove
                </Button>
              </div>
              <Input
                value={element.desc}
                disabled={disabled}
                aria-label={`Element ${element.id || index + 1} description`}
                onChange={(event) => updateElement(index, { ...withBox(element, box), desc: event.target.value })}
                className="bg-background font-sans text-sm"
                placeholder="What belongs in this box"
              />
              <div className="grid grid-cols-4 gap-2">
                {["Top", "Left", "Bottom", "Right"].map((label, coord) => (
                  <label key={label} className="space-y-1">
                    <span className="font-sans text-xs text-muted-foreground">{label}</span>
                    <Input
                      type="number"
                      min={0}
                      max={1000}
                      value={box[coord]}
                      disabled={disabled}
                      aria-label={`${element.id || "element"} ${label}`}
                      onChange={(event) => setCoord(coord, event.target.value)}
                      className="bg-background font-sans text-sm"
                    />
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={() => onChange({
            ...value,
            elements: [
              ...elements,
              {
                id: nextElementId(elements),
                bbox: [120, 120, 480, 480],
                desc: "",
              },
            ],
          })}
        >
          Add box
        </Button>
        <label className="flex items-center gap-2 font-sans text-xs text-muted-foreground">
          <span>Re-edit one box</span>
          <select
            value={value.lockExceptId ?? ""}
            disabled={disabled || elements.length === 0}
            onChange={(event) => onChange({
              ...value,
              lockExceptId: event.target.value || undefined,
            })}
            className="h-8 rounded border border-border bg-background px-2 font-sans text-sm text-foreground"
          >
            <option value="">Off</option>
            {elements.map((element) => (
              <option key={element.id} value={element.id}>{element.id}</option>
            ))}
          </select>
        </label>
      </div>
      {value.lockExceptId ? (
        <p className="font-sans text-xs text-muted-foreground">
          Only {value.lockExceptId} is regenerated. Every other box is locked to the first reference image, so that image has to be attached.
        </p>
      ) : null}
    </div>
  );
}
