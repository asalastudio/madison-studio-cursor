import { useEffect, useRef } from "react";
import { useNodesInitialized, useReactFlow } from "@xyflow/react";
import { CANVAS_FIT_VIEW_OPTIONS } from "@/lib/canvas/layout";

interface CanvasFitViewProps {
  /** Re-run fitView when the hydrated graph changes. Board resizes are observed separately. */
  trigger?: string | number | boolean;
}

export function CanvasFitView({ trigger = "ready" }: CanvasFitViewProps) {
  const { fitView } = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  const fittedFor = useRef<string | number | boolean | null>(null);

  useEffect(() => {
    if (!nodesInitialized) return;
    if (fittedFor.current === trigger) return;
    fittedFor.current = trigger;
    const frame = window.requestAnimationFrame(() => {
      void fitView(CANVAS_FIT_VIEW_OPTIONS);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [fitView, nodesInitialized, trigger]);

  useEffect(() => {
    const board = document.querySelector(".madison-canvas__board");
    if (!board) return;

    let timer = 0;
    const observer = new ResizeObserver(() => {
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
  }, [fitView]);

  return null;
}
