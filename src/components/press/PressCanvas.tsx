import { useEffect, useRef, useState } from "react";
import { fabric } from "fabric";
import { Button } from "@/components/ui/button";
import { Upload, Trash2, AlignCenter, AlignLeft, AlignRight, Ruler } from "lucide-react";
import { addDimensionAnnotations, removeDimensionAnnotations } from "@/lib/press/canvas-annotations";
import type { DielineOutput } from "@/lib/press/generators";

interface PressCanvasProps {
  dielineSvgPath?: string;
  dielineData?: DielineOutput | null; // Full dieline data with annotations
  onCanvasReady?: (canvas: fabric.Canvas) => void;
}

export function PressCanvas({ dielineSvgPath, dielineData, onCanvasReady }: PressCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
  const [selectedObject, setSelectedObject] = useState<fabric.Object | null>(null);
  const [showDimensions, setShowDimensions] = useState<boolean>(true);

  // Initialize Fabric.js canvas
  useEffect(() => {
    if (!canvasRef.current) return;

    // Create canvas with white background
    const canvas = new fabric.Canvas(canvasRef.current, {
      width: 800,
      height: 1000,
      backgroundColor: "#ffffff",
      selection: true,
      preserveObjectStacking: true,
    });

    fabricCanvasRef.current = canvas;

    // Selection event handlers
    canvas.on("selection:created", (e) => {
      setSelectedObject(e.selected?.[0] || null);
    });

    canvas.on("selection:updated", (e) => {
      setSelectedObject(e.selected?.[0] || null);
    });

    canvas.on("selection:cleared", () => {
      setSelectedObject(null);
    });

    // Notify parent component
    onCanvasReady?.(canvas);

    // Cleanup
    return () => {
      canvas.dispose();
      fabricCanvasRef.current = null;
    };
  }, [onCanvasReady]);

  // Load dieline SVG when path changes
  useEffect(() => {
    if (!fabricCanvasRef.current || !dielineSvgPath) return;

    const canvas = fabricCanvasRef.current;

    // Clear existing dieline layers and annotations
    const existingDieline = canvas.getObjects().find((obj) => obj.name === "dieline");
    if (existingDieline) {
      canvas.remove(existingDieline);
    }
    removeDimensionAnnotations(canvas);

    // Load SVG dieline
    fabric.loadSVGFromURL(dielineSvgPath, (objects, options) => {
      const svgGroup = fabric.util.groupSVGElements(objects, options);

      svgGroup.set({
        name: "dieline",
        selectable: false, // Dieline shouldn't be movable
        evented: false,
        opacity: 0.5, // Semi-transparent so artwork shows through
      });

      // Center the dieline on canvas
      svgGroup.set({
        left: canvas.width! / 2,
        top: canvas.height! / 2,
        originX: "center",
        originY: "center",
      });

      // Scale to fit canvas (with padding)
      const scale = Math.min(
        (canvas.width! * 0.8) / svgGroup.width!,
        (canvas.height! * 0.8) / svgGroup.height!
      );
      svgGroup.scale(scale);

      canvas.add(svgGroup);
      canvas.sendToBack(svgGroup); // Keep dieline as background

      // Add dimension annotations if available
      if (dielineData?.annotations && showDimensions) {
        addDimensionAnnotations(canvas, dielineData.annotations, scale);
      }

      canvas.renderAll();
    });
  }, [dielineSvgPath, dielineData, showDimensions]);

  // Handle artwork upload
  const handleArtworkUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !fabricCanvasRef.current) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const imageUrl = e.target?.result as string;

      fabric.Image.fromURL(imageUrl, (img) => {
        if (!fabricCanvasRef.current) return;

        const canvas = fabricCanvasRef.current;

        // Scale image to reasonable size
        const maxWidth = canvas.width! * 0.4;
        const maxHeight = canvas.height! * 0.4;
        const scale = Math.min(maxWidth / img.width!, maxHeight / img.height!);

        img.set({
          left: canvas.width! / 2,
          top: canvas.height! / 2,
          originX: "center",
          originY: "center",
          scaleX: scale,
          scaleY: scale,
          name: "artwork",
        });

        canvas.add(img);
        canvas.setActiveObject(img);
        canvas.renderAll();
      });
    };
    reader.readAsDataURL(file);
  };

  // Delete selected object
  const handleDelete = () => {
    if (!fabricCanvasRef.current || !selectedObject) return;
    fabricCanvasRef.current.remove(selectedObject);
    fabricCanvasRef.current.renderAll();
    setSelectedObject(null);
  };

  // Alignment helpers
  const alignObject = (alignment: "left" | "center" | "right") => {
    if (!fabricCanvasRef.current || !selectedObject) return;

    const canvas = fabricCanvasRef.current;
    const obj = selectedObject;

    switch (alignment) {
      case "left":
        obj.set({ left: obj.width! * obj.scaleX! / 2 });
        break;
      case "center":
        obj.set({ left: canvas.width! / 2 });
        break;
      case "right":
        obj.set({ left: canvas.width! - (obj.width! * obj.scaleX! / 2) });
        break;
    }

    canvas.renderAll();
  };

  // Bring to front
  const bringToFront = () => {
    if (!fabricCanvasRef.current || !selectedObject) return;
    fabricCanvasRef.current.bringToFront(selectedObject);
    fabricCanvasRef.current.renderAll();
  };

  // Send to back (but keep above dieline)
  const sendToBack = () => {
    if (!fabricCanvasRef.current || !selectedObject) return;
    const canvas = fabricCanvasRef.current;
    const dieline = canvas.getObjects().find((obj) => obj.name === "dieline");
    canvas.sendToBack(selectedObject);
    if (dieline) {
      canvas.sendToBack(dieline);
    }
    canvas.renderAll();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Canvas Toolbar */}
      <div className="flex items-center gap-2 p-3 border-b border-border bg-card">
        <label htmlFor="artwork-upload">
          <Button variant="outline" size="sm" asChild>
            <span>
              <Upload className="w-4 h-4 mr-2" />
              Upload Artwork
            </span>
          </Button>
        </label>
        <input
          id="artwork-upload"
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleArtworkUpload}
        />

        <div className="h-6 w-px bg-border mx-1" />

        {/* Dimension Toggle */}
        <Button
          variant={showDimensions ? "default" : "ghost"}
          size="sm"
          onClick={() => setShowDimensions(!showDimensions)}
          title="Toggle Dimensions"
          className={showDimensions ? "bg-[#00f0ff]/20 hover:bg-[#00f0ff]/30" : ""}
        >
          <Ruler className="w-4 h-4" />
        </Button>

        <div className="h-6 w-px bg-border mx-1" />

        {/* Object controls (only show when something is selected) */}
        {selectedObject && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => alignObject("left")}
              title="Align Left"
            >
              <AlignLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => alignObject("center")}
              title="Align Center"
            >
              <AlignCenter className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => alignObject("right")}
              title="Align Right"
            >
              <AlignRight className="w-4 h-4" />
            </Button>

            <div className="h-6 w-px bg-border mx-1" />

            <Button
              variant="ghost"
              size="sm"
              onClick={bringToFront}
              title="Bring to Front"
            >
              ↑
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={sendToBack}
              title="Send to Back"
            >
              ↓
            </Button>

            <div className="h-6 w-px bg-border mx-1" />

            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              title="Delete"
            >
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          </>
        )}

        {!selectedObject && (
          <span className="text-sm text-muted-foreground ml-2">
            Select an object to edit
          </span>
        )}
      </div>

      {/* Canvas Container */}
      <div className="flex-1 overflow-auto bg-[#F5F5F5] p-8">
        <div className="flex items-center justify-center min-h-full">
          <div className="bg-white rounded-lg shadow-lg p-4">
            <canvas ref={canvasRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
