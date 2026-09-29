import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useCanvasProjects } from "@/hooks/useCanvasProjects";
import type { CanvasProjectType } from "@/lib/canvas/types";

interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewProjectDialog({ open, onOpenChange }: NewProjectDialogProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { createProject, isCreating } = useCanvasProjects();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<CanvasProjectType>("pdp");
  const [sku, setSku] = useState("");

  const reset = () => {
    setTitle("");
    setType("pdp");
    setSku("");
  };

  const handleSubmit = async () => {
    try {
      const result = await createProject({
        title,
        type,
        sku: type === "pdp" ? sku : undefined,
      });
      toast({
        title: "Project created",
        description: type === "pdp"
          ? "A Product node was added from the resolved SKU."
          : "Campaign canvas is ready. Add product references as needed.",
      });
      reset();
      onOpenChange(false);
      navigate(`/projects/${result.project.id}/canvas`);
    } catch (error) {
      toast({
        title: "Could not create project",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-serif flex items-center gap-2">
            <LayoutDashboard className="w-5 h-5 text-primary" />
            New canvas project
          </DialogTitle>
          <DialogDescription>
            A project lives on this company profile and owns its canvas.
            PDP projects require a SKU from Product Hub first.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="canvas-project-title">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="canvas-project-title"
              className="bg-background"
              placeholder="Cylinder 50 ml Clear"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={(value) => setType(value as CanvasProjectType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pdp">PDP — one SKU, later Shopify slots</SelectItem>
                <SelectItem value="campaign">Campaign — no SKU, library export later</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {type === "pdp" && (
            <div className="space-y-2">
              <Label htmlFor="canvas-project-sku">
                SKU <span className="text-destructive">*</span>
              </Label>
              <Input
                id="canvas-project-sku"
                className="bg-background"
                placeholder="GB-CYL-CLR-50ML"
                value={sku}
                onChange={(event) => setSku(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Resolved against this company&apos;s Product Hub first, then variants, then legacy products.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCreating}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={isCreating || !title.trim() || (type === "pdp" && !sku.trim())}
          >
            {isCreating ? "Creating…" : "Create project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
