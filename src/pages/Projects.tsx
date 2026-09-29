import { ProjectList } from "@/components/canvas/ProjectList";
import { CanvasFeatureGuard } from "@/components/canvas/CanvasFeatureGuard";

export default function Projects() {
  return (
    <CanvasFeatureGuard>
      <div className="min-h-screen bg-background">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-10">
          <ProjectList />
        </div>
      </div>
    </CanvasFeatureGuard>
  );
}
