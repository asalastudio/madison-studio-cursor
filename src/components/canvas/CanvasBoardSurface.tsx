import { useEffect } from "react";
import { Background, BackgroundVariant, MiniMap } from "@xyflow/react";
import { CANVAS_SNAP_GRID, isTypingTarget } from "@/lib/canvas/boardInteraction";
import { CanvasFitView } from "./CanvasFitView";
import { CanvasViewportControls } from "./CanvasViewportControls";

interface CanvasBoardSurfaceProps {
  skipInitialFit?: boolean;
  onUndo?: () => void;
}

export function CanvasBoardSurface({ skipInitialFit = false, onUndo }: CanvasBoardSurfaceProps) {
  useEffect(() => {
    const board = document.querySelector(".madison-canvas__board");

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" && !isTypingTarget(event.target) && !event.repeat) {
        event.preventDefault();
        board?.classList.add("is-space-panning");
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !event.shiftKey) {
        if (isTypingTarget(event.target)) return;
        event.preventDefault();
        onUndo?.();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        board?.classList.remove("is-space-panning");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      board?.classList.remove("is-space-panning");
    };
  }, [onUndo]);

  return (
    <>
      {skipInitialFit ? null : <CanvasFitView />}
      <Background
        id="madison-dots"
        variant={BackgroundVariant.Dots}
        gap={CANVAS_SNAP_GRID}
        size={1.4}
        color="rgba(255, 255, 255, 0.08)"
      />
      <CanvasViewportControls />
      <MiniMap pannable zoomable ariaLabel="Canvas minimap" />
    </>
  );
}
