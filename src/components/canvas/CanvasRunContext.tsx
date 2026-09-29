import { createContext, useContext, type ReactNode } from "react";

export type CanvasRunScope = "node" | "all";

export interface CanvasRunRequest {
  scope: CanvasRunScope;
  nodeId?: string;
}

const CanvasRunContext = createContext<(request: CanvasRunRequest) => void>(() => undefined);

export function CanvasRunProvider({
  children,
  onRun,
}: {
  children: ReactNode;
  onRun: (request: CanvasRunRequest) => void;
}) {
  return <CanvasRunContext.Provider value={onRun}>{children}</CanvasRunContext.Provider>;
}

export function useCanvasRun() {
  return useContext(CanvasRunContext);
}
