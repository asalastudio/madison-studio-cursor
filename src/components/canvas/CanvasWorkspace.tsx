import type { ReactNode } from "react";

interface CanvasWorkspaceProps {
  board: ReactNode;
  header: ReactNode;
  inspector: ReactNode;
  toolbar: ReactNode;
}

export function CanvasWorkspace({ board, header, inspector, toolbar }: CanvasWorkspaceProps) {
  return (
    <div className="madison-canvas dark-room-container">
      <div className="madison-canvas__workspace">
        <div className="madison-canvas__board">
          {board}
          <div className="madison-canvas__header">{header}</div>
          {toolbar}
        </div>
        {inspector}
      </div>
    </div>
  );
}
