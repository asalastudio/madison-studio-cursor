import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useMadisonCanvasFeatureFlag } from "@/hooks/useMadisonCanvasFeatureFlag";

export function CanvasFeatureGuard({ children }: { children: React.ReactNode }) {
  const { enabled, isLoading } = useMadisonCanvasFeatureFlag();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--darkroom-bg)]">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--darkroom-accent)]" />
      </div>
    );
  }

  if (!enabled) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
