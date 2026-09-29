import { Maximize2, Minus, Plus } from "lucide-react";
import { useReactFlow, useStore } from "@xyflow/react";
import { formatZoomPercent } from "@/lib/canvas/boardInteraction";
import { CANVAS_ZOOM_TO_FIT_OPTIONS } from "@/lib/canvas/layout";

export function CanvasViewportControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const zoom = useStore((state) => state.transform[2]);

  return (
    <div className="madison-canvas__viewport-controls nodrag nopan nowheel" role="group" aria-label="Canvas zoom">
      <button
        type="button"
        className="madison-canvas__viewport-button"
        aria-label="Zoom out"
        onClick={() => {
          void zoomOut({ duration: 120 });
        }}
      >
        <Minus />
      </button>
      <span className="madison-canvas__viewport-zoom" aria-live="polite">
        {formatZoomPercent(zoom)}
      </span>
      <button
        type="button"
        className="madison-canvas__viewport-button"
        aria-label="Zoom in"
        onClick={() => {
          void zoomIn({ duration: 120 });
        }}
      >
        <Plus />
      </button>
      <button
        type="button"
        className="madison-canvas__viewport-button"
        aria-label="Zoom to fit"
        onClick={() => {
          void fitView(CANVAS_ZOOM_TO_FIT_OPTIONS);
        }}
      >
        <Maximize2 />
      </button>
    </div>
  );
}
