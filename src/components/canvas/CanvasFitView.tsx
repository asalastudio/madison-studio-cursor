import { useEffect, useRef } from "react";
import { useNodesInitialized, useReactFlow, type ReactFlowInstance } from "@xyflow/react";
import { CANVAS_FIT_VIEW_OPTIONS } from "@/lib/canvas/layout";

interface CanvasFitViewProps {
  /** Re-run fitView when the hydrated graph changes. Board resizes are observed separately. */
  trigger?: string | number | boolean;
}

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

export function CanvasFitView({ trigger = "ready" }: CanvasFitViewProps) {
  const { fitView } = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  const fittedFor = useRef<string | number | boolean | null>(null);

  useEffect(() => {
    if (!nodesInitialized) return;
    if (fittedFor.current === trigger) return;
    fittedFor.current = trigger;
    const frame = scheduleFitView(() => {
      void fitView(CANVAS_FIT_VIEW_OPTIONS);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [fitView, nodesInitialized, trigger]);

  useEffect(() => {
    if (!nodesInitialized) return;
    const board = document.querySelector(".madison-canvas__board");
    if (!board) return;

    let lastWidth = board.clientWidth;
    let lastHeight = board.clientHeight;
    let skipFirst = true;
    let timer = 0;

    const observer = new ResizeObserver((entries) => {
      if (skipFirst) {
        skipFirst = false;
        return;
      }
      const entry = entries[0];
      if (!entry) return;
      const width = entry.contentRect.width;
      const height = entry.contentRect.height;
      if (Math.abs(width - lastWidth) < 2 && Math.abs(height - lastHeight) < 2) return;
      lastWidth = width;
      lastHeight = height;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void fitView(CANVAS_FIT_VIEW_OPTIONS);
      }, 80);
    });
    observer.observe(board);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [fitView, nodesInitialized]);

  return null;
}
