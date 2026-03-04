import { useState } from "react";
import { Package, Sparkles, FileDown, Save, Undo2, Redo2, ZoomIn, ZoomOut, Box } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { PressCanvas } from "@/components/press/PressCanvas";
import { DimensionInput } from "@/components/press/DimensionInput";
import { TemplateLibrary } from "@/components/press/TemplateLibrary";
import { TechnicalSpecsOverlay, LineLegend } from "@/components/press/TechnicalSpecsOverlay";
import { Box3DPreview } from "@/components/press/Box3DPreview";
import type { DielineOutput } from "@/lib/press/generators";
import "@/styles/press.css";

/**
 * The Press - Packaging Design Studio
 *
 * AI-powered packaging design studio for luxury fragrance brands.
 * Create print-ready labels, boxes, and packaging using dieline templates
 * and AI-generated artwork from Image Studio.
 *
 * Phase 1 MVP: Basic UI shell with dieline template selector
 */
export default function Press() {
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("Untitled Packaging Project");
  const [canvasInstance, setCanvasInstance] = useState<any>(null);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [generatedDieline, setGeneratedDieline] = useState<DielineOutput | null>(null);
  const [dielineSvgDataUrl, setDielineSvgDataUrl] = useState<string | null>(null);

  const handleDielineGenerated = (dieline: DielineOutput) => {
    setGeneratedDieline(dieline);
    // Convert SVG string to data URL for canvas
    const svgBlob = new Blob([dieline.svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(svgBlob);
    setDielineSvgDataUrl(url);
  };

  // Zoom handlers
  const handleZoomIn = () => {
    if (!canvasInstance) return;
    const newZoom = Math.min(zoomLevel + 10, 200);
    const zoom = newZoom / 100;
    canvasInstance.setZoom(zoom);
    setZoomLevel(newZoom);
  };

  const handleZoomOut = () => {
    if (!canvasInstance) return;
    const newZoom = Math.max(zoomLevel - 10, 50);
    const zoom = newZoom / 100;
    canvasInstance.setZoom(zoom);
    setZoomLevel(newZoom);
  };

  // Export preview (PNG)
  const handleExportPreview = () => {
    if (!canvasInstance) return;
    const dataUrl = canvasInstance.toDataURL({
      format: "png",
      quality: 1,
      multiplier: 2, // 2x resolution for better quality
    });

    // Download the image
    const link = document.createElement("a");
    link.download = `${projectName.replace(/\s+/g, "-").toLowerCase()}-preview.png`;
    link.href = dataUrl;
    link.click();
  };

  // Placeholder templates - will be loaded from database
  const templates = [
    {
      id: "c8e8f4b0-1234-4a5b-8c9d-1234567890ab",
      name: "50ml Perfume Box - Tuck End",
      category: "perfume_box",
      thumbnail: "/dielines/50ml-perfume-box-tuck-end.svg",
      dimensions: "50×150×50mm",
      description: "Standard perfume box with tuck flap closure",
    },
    {
      id: "d9f9f5c1-2345-4b6c-9d0e-2345678901bc",
      name: "10ml Roller Bottle Box",
      category: "roller_box",
      thumbnail: "/dielines/10ml-roller-box-small.svg",
      dimensions: "30×100×30mm",
      description: "Compact box for roller bottles",
    },
    {
      id: "e0a0a6d2-3456-4c7d-0e1f-3456789012cd",
      name: "Perfume Bottle Label - Wraparound",
      category: "label",
      thumbnail: "/dielines/perfume-bottle-label-wraparound.svg",
      dimensions: "200×80mm",
      description: "360° wraparound label for bottles",
    },
  ];

  return (
    <div className="flex h-screen bg-background">
      {/* Left Sidebar - Templates & Layers */}
      <div className="w-80 border-r border-border bg-card p-4 overflow-y-auto">
        <div className="space-y-6">
          {/* Header */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Package className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">The Press</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Design print-ready packaging
            </p>
          </div>

          <Separator />

          {/* Enhanced Template Library */}
          <TemplateLibrary
            templates={templates}
            onSelectTemplate={setSelectedTemplate}
            selectedTemplateId={selectedTemplate}
          />

          <Separator />

          {/* Layers (Placeholder) */}
          {selectedTemplate && (
            <DimensionInput
              templateType={selectedTemplate}
              onGenerate={handleDielineGenerated}
            />
          )}

          <Separator />

          <div>
            <h3 className="text-sm font-medium mb-3">Layers</h3>
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="p-2 rounded bg-muted/50">
                <span className="text-xs">☐ Dieline</span>
              </div>
              <div className="p-2 rounded bg-muted/50">
                <span className="text-xs">☐ Artwork</span>
              </div>
              <div className="p-2 rounded bg-muted/50">
                <span className="text-xs">☐ Text</span>
              </div>
            </div>
          </div>

          {generatedDieline && (
            <>
              <Separator />
              <LineLegend />
            </>
          )}
        </div>
      </div>

      {/* Center - Canvas Area */}
      <div className="flex-1 flex flex-col">
        {/* Top Toolbar */}
        <div className="border-b border-border bg-card p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="text-lg font-medium bg-transparent border-none outline-none focus:outline-none"
              />
              <Badge variant="outline">Draft</Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon">
                <Undo2 className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon">
                <Redo2 className="w-4 h-4" />
              </Button>
              <Separator orientation="vertical" className="h-6" />
              <Button variant="ghost" size="icon" onClick={handleZoomOut} disabled={!canvasInstance}>
                <ZoomOut className="w-4 h-4" />
              </Button>
              <span className="text-sm text-muted-foreground">{zoomLevel}%</span>
              <Button variant="ghost" size="icon" onClick={handleZoomIn} disabled={!canvasInstance}>
                <ZoomIn className="w-4 h-4" />
              </Button>
              <Separator orientation="vertical" className="h-6" />
              <Button variant="outline" size="sm" className="cyber-button" disabled={!canvasInstance}>
                <Save className="w-4 h-4 mr-2" />
                Save
              </Button>
              <Button size="sm" className="cyber-button" onClick={handleExportPreview} disabled={!canvasInstance}>
                <FileDown className="w-4 h-4 mr-2" />
                Export Preview
              </Button>
            </div>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 overflow-hidden canvas-background relative">
          {selectedTemplate && dielineSvgDataUrl ? (
            <>
              <PressCanvas
                dielineSvgPath={dielineSvgDataUrl}
                dielineData={generatedDieline}
                onCanvasReady={setCanvasInstance}
              />

              {/* Technical Overlays */}
              {generatedDieline && (
                <TechnicalSpecsOverlay
                  dimensions={{
                    outer: generatedDieline.dimensions.outer,
                    inner: generatedDieline.dimensions.inner,
                    manufacture: generatedDieline.dimensions.manufacture,
                  }}
                  className="absolute top-4 right-4"
                />
              )}
            </>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-muted-foreground max-w-md">
                <Sparkles className="w-16 h-16 mx-auto mb-4 text-[#00f0ff]/50" />
                <h3 className="text-xl font-medium mb-2">Select a Template to Begin</h3>
                <p className="text-sm mb-6">
                  Choose a dieline template from the left sidebar to start designing your packaging.
                </p>
                <p className="text-xs text-muted-foreground/70">
                  Or create a new project from your Products page
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Sidebar - 3D Preview & Export */}
      <div className="w-80 border-l border-border bg-card p-4 overflow-y-auto">
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-medium mb-3">3D Preview</h3>

            {generatedDieline ? (
              <Box3DPreview
                dielineData={generatedDieline}
                artworkUrl={null}
              />
            ) : (
              <Card className="glass-panel p-8 text-center">
                <Box className="w-12 h-12 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-xs text-muted-foreground">
                  Select a template to see 3D preview
                </p>
              </Card>
            )}
          </div>

          <Separator />

          <div>
            <h3 className="text-sm font-medium mb-3">Artwork</h3>
            <Button variant="outline" size="sm" className="w-full cyber-button" disabled>
              <Sparkles className="w-4 h-4 mr-2" />
              From Image Studio
            </Button>
          </div>

          <Separator />

          <div>
            <h3 className="text-sm font-medium mb-3">Export Formats</h3>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" className="cyber-button" disabled>
                AI Dieline
              </Button>
              <Button variant="outline" size="sm" className="cyber-button" disabled>
                PDF Dieline
              </Button>
              <Button variant="outline" size="sm" className="cyber-button" disabled>
                DXF Dieline
              </Button>
              <Button variant="outline" size="sm" className="cyber-button" disabled>
                3D Mockup
              </Button>
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="text-sm font-medium mb-3">Export Settings</h3>
            <div className="space-y-2 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Color Space:</span>
                <span>CMYK</span>
              </div>
              <div className="flex justify-between">
                <span>DPI:</span>
                <span>300</span>
              </div>
              <div className="flex justify-between">
                <span>Format:</span>
                <span>PDF/X-4</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
