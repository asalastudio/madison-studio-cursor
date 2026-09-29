import { useEffect, useRef } from "react";
import { useNodesInitialized, useReactFlow, type ReactFlowInstance } from "@xyflow/react";
import { CANVAS_FIT_VIEW_OPTIONS } from "@/lib/canvas/layout";

function scheduleFitView(fit: () => void): number {
  return window.requestAnimationFrame(() => {
    fit();
  });
}

/** Call from ReactFlow `onInit` so the first fit happens after the board exists. */
export function canvasFitViewOnInit(instance: ReactFlowInstance) {
  scheduleFitView(() => {
    void instance.fitView(CANVAS_FIT_VIEW_OPTIONS);
  });
}

export function CanvasFitView() {
  const { fitView } = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  const fitted = useRef(false);

  useEffect(() => {
    if (!nodesInitialized || fitted.current) return;
    fitted.current = true;
    const frame = scheduleFitView(() => {
      void fitView(CANVAS_FIT_VIEW_OPTIONS);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [fitView, nodesInitialized]);

  return null;
}
