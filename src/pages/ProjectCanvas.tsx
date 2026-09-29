import { useParams } from "react-router-dom";
import { CanvasBoard } from "@/components/canvas/CanvasBoard";
import { CanvasFeatureGuard } from "@/components/canvas/CanvasFeatureGuard";
import "@/styles/darkroom.css";
import "@/styles/madison-canvas.css";

export default function ProjectCanvas() {
  const { id } = useParams<{ id: string }>();

  return (
    <CanvasFeatureGuard>
      {id ? <CanvasBoard projectId={id} /> : null}
    </CanvasFeatureGuard>
  );
}
