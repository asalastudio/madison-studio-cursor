import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LayoutDashboard, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCanvasProjects } from "@/hooks/useCanvasProjects";
import { NewProjectDialog } from "./NewProjectDialog";
import type { CanvasProject, CanvasProjectStatus, CanvasProjectType } from "@/lib/canvas/types";

function statusLabel(status: CanvasProjectStatus) {
  if (status === "active") return "Active";
  if (status === "paused") return "Paused";
  return "Archived";
}

function ProjectRow({ project }: { project: CanvasProject }) {
  const navigate = useNavigate();
  return (
    <Card
      className="bg-card border border-border hover:border-primary hover:shadow-level-2 transition-all duration-300 cursor-pointer"
      onClick={() => navigate(`/projects/${project.id}/canvas`)}
    >
      <CardContent className="p-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h3 className="font-serif text-xl text-foreground">{project.title}</h3>
          <p className="text-sm text-muted-foreground">
            {project.sku ? `SKU ${project.sku}` : "No SKU"}
            {project.sku_resolved_via ? ` · via ${project.sku_resolved_via}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="capitalize">{project.type}</Badge>
          <Badge variant="outline">{statusLabel(project.status)}</Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              navigate(`/projects/${project.id}/canvas`);
            }}
          >
            Open canvas
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function ProjectList() {
  const { projects, isLoading } = useCanvasProjects();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | CanvasProjectType>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | CanvasProjectStatus>("all");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return projects.filter((project) => {
      if (typeFilter !== "all" && project.type !== typeFilter) return false;
      if (statusFilter !== "all" && project.status !== statusFilter) return false;
      if (!needle) return true;
      return (
        project.title.toLowerCase().includes(needle) ||
        (project.sku ?? "").toLowerCase().includes(needle)
      );
    });
  }, [projects, query, statusFilter, typeFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="font-serif text-2xl text-foreground flex items-center gap-2">
            <LayoutDashboard className="w-5 h-5 text-primary" />
            Canvas projects
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Production canvases for this company. Dark Room stays the exploration tool.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="w-4 h-4" />
          New project
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="bg-background pl-9"
            placeholder="Filter by title or SKU"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as "all" | CanvasProjectType)}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="pdp">PDP</SelectItem>
            <SelectItem value="campaign">Campaign</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | CanvasProjectStatus)}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid gap-4">
          {[1, 2, 3].map((key) => (
            <div key={key} className="h-24 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="bg-card border border-border border-dashed">
          <CardContent className="p-10 text-center space-y-3">
            <p className="font-serif text-xl text-foreground">No projects yet</p>
            <p className="text-sm text-muted-foreground">
              Create a PDP project with a SKU to auto-place a Product node on Bone.
            </p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="w-4 h-4" />
              New project
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filtered.map((project) => (
            <ProjectRow key={project.id} project={project} />
          ))}
        </div>
      )}

      <NewProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
