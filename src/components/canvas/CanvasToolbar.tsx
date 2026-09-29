import { Aperture, Box, ImageIcon, Layers, Package, Play, Sparkles } from "lucide-react";
import { Chip, ChipRow } from "@/components/darkroom/Chip";
import { WEEK1_NODE_TYPES, type Week1NodeType } from "@/lib/canvas/types";
import { useCanvasRun } from "./CanvasRunContext";

const ADD_NODE_META: Record<Week1NodeType, { label: string; icon: typeof Package }> = {
  pack: { label: "Pack", icon: Package },
  product: { label: "Product", icon: Box },
  set: { label: "Set", icon: Sparkles },
  shot: { label: "Shot", icon: Aperture },
  batch: { label: "Batch", icon: Layers },
  image: { label: "Image", icon: ImageIcon },
};

interface CanvasToolbarProps {
  onAddNode: (type: Week1NodeType) => void;
}

export function CanvasToolbar({ onAddNode }: CanvasToolbarProps) {
  const onRun = useCanvasRun();

  return (
    <div className="madison-canvas__toolbar nodrag nopan nowheel" role="toolbar" aria-label="Add canvas nodes">
      <ChipRow className="flex-nowrap">
        {WEEK1_NODE_TYPES.map((type) => {
          const meta = ADD_NODE_META[type];
          const Icon = meta.icon;
          return (
            <Chip
              key={type}
              label={meta.label}
              icon={<Icon />}
              onClick={() => onAddNode(type)}
            />
          );
        })}
      </ChipRow>
      <span className="madison-canvas__toolbar-divider" aria-hidden="true" />
      <Chip
        label="Run all"
        icon={<Play />}
        onClick={() => onRun({ scope: "all" })}
      />
    </div>
  );
}
