# The Press - Implementation Guide

Quick reference for integrating Pacdora-inspired enhancements with Madison's Anti-Gravity design.

---

## ✅ What You've Got Now

I've created these new components for you:

### 1. **Enhanced Template Library**
[TemplateLibrary.tsx](../src/components/press/TemplateLibrary.tsx)
- Visual SVG thumbnails instead of placeholder icons
- Search functionality
- Category filtering (All, Boxes, Labels, Bags)
- Anti-Gravity styling with cyan glows and glass panels

### 2. **Technical Specs Overlay**
[TechnicalSpecsOverlay.tsx](../src/components/press/TechnicalSpecsOverlay.tsx)
- Shows manufacturer, inner, and outer dimensions
- Line type legend (Bleed, Trim, Crease)
- Glassmorphism panels with backdrop blur
- JetBrains Mono for technical data

### 3. **3D Preview Placeholder**
[Box3DPreview.tsx](../src/components/press/Box3DPreview.tsx)
- Fold animation slider
- Rotation controls
- View presets (Front, Side, Top)
- Future React Three Fiber integration notes

### 4. **Anti-Gravity CSS**
[press.css](../src/styles/press.css)
- Custom scrollbars
- Glass panel effects
- Cyber button styles
- Particle animations
- Orbital ring effects
- Scanline overlay

---

## 🚀 Integration Steps

### Step 1: Import the CSS
Add to your [Press.tsx](../src/pages/Press.tsx):

```tsx
import "@/styles/press.css";
```

### Step 2: Replace Left Sidebar Template Selector
Replace the current template cards section (lines 114-140) with:

```tsx
import { TemplateLibrary } from "@/components/press/TemplateLibrary";

// In your JSX:
<TemplateLibrary
  onSelectTemplate={setSelectedTemplate}
  selectedTemplateId={selectedTemplate}
/>
```

### Step 3: Add Technical Overlays to Canvas
Add to your canvas area (after the `PressCanvas` component):

```tsx
import { TechnicalSpecsOverlay, LineLegend } from "@/components/press/TechnicalSpecsOverlay";

// Inside the canvas container:
{generatedDieline && (
  <>
    <TechnicalSpecsOverlay
      dimensions={{
        outer: { width: 50, height: 150, depth: 50 },
        inner: { width: 48, height: 148, depth: 48 },
        manufacture: { width: 52, height: 152, depth: 52 },
      }}
      className="absolute top-4 right-4"
    />
    <LineLegend className="absolute top-4 left-4" />
  </>
)}
```

### Step 4: Add 3D Preview to Right Sidebar
Replace the right sidebar properties section with:

```tsx
import { Box3DPreview } from "@/components/press/Box3DPreview";

// In right sidebar:
<Box3DPreview
  dielineData={generatedDieline}
  artworkUrl={null}
/>
```

---

## 🎨 Styling Enhancements

### Apply Anti-Gravity Classes

Replace existing card/button classes with cyber variants:

```tsx
// Before:
<Button variant="outline">Upload</Button>

// After:
<Button variant="outline" className="cyber-button">
  Upload
</Button>

// Before:
<Card className="p-4">

// After:
<Card className="glass-panel p-4">
```

### Add Canvas Background
```tsx
<div className="flex-1 overflow-hidden canvas-background">
  {/* Your canvas content */}
</div>
```

### Add Scanline Effect (Optional)
```tsx
<div className="relative">
  <PressCanvas />
  <div className="scanline-overlay" />
</div>
```

---

## 📐 Component Integration Example

Here's how your updated [Press.tsx](../src/pages/Press.tsx) structure should look:

```tsx
import { TemplateLibrary } from "@/components/press/TemplateLibrary";
import { TechnicalSpecsOverlay, LineLegend } from "@/components/press/TechnicalSpecsOverlay";
import { Box3DPreview } from "@/components/press/Box3DPreview";
import "@/styles/press.css";

export default function Press() {
  // ... existing state ...

  return (
    <div className="flex h-screen bg-background">
      {/* LEFT SIDEBAR - Enhanced Template Library */}
      <div className="w-80 border-r border-border bg-card p-4 overflow-y-auto">
        <div className="space-y-6">
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

          {/* NEW: Enhanced Template Library */}
          <TemplateLibrary
            onSelectTemplate={setSelectedTemplate}
            selectedTemplateId={selectedTemplate}
          />

          <Separator />

          {/* Dimension Input (keep existing) */}
          {selectedTemplate && (
            <DimensionInput
              templateType={selectedTemplate}
              onGenerate={handleDielineGenerated}
            />
          )}
        </div>
      </div>

      {/* CENTER - Canvas with Overlays */}
      <div className="flex-1 flex flex-col">
        {/* Top Toolbar (keep existing) */}
        <div className="border-b border-border bg-card p-3">
          {/* ... existing toolbar ... */}
        </div>

        {/* Canvas with Background and Overlays */}
        <div className="flex-1 overflow-hidden canvas-background relative">
          {selectedTemplate && dielineSvgDataUrl ? (
            <>
              <PressCanvas
                dielineSvgPath={dielineSvgDataUrl}
                onCanvasReady={setCanvasInstance}
              />

              {/* NEW: Technical Overlays */}
              {generatedDieline && (
                <>
                  <TechnicalSpecsOverlay
                    dimensions={{
                      outer: { width: 50, height: 150, depth: 50 },
                      inner: { width: 48, height: 148, depth: 48 },
                      manufacture: { width: 52, height: 152, depth: 52 },
                    }}
                    className="absolute top-4 right-4"
                  />
                  <LineLegend className="absolute top-4 left-4" />
                </>
              )}

              {/* Optional: Scanline Effect */}
              <div className="scanline-overlay" />
            </>
          ) : (
            <div className="flex items-center justify-center h-full">
              {/* ... existing empty state ... */}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT SIDEBAR - 3D Preview */}
      <div className="w-80 border-l border-border bg-card p-4 overflow-y-auto">
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-medium mb-3">3D Preview</h3>

            {/* NEW: 3D Mockup */}
            {generatedDieline ? (
              <Box3DPreview
                dielineData={generatedDieline}
                artworkUrl={null}
              />
            ) : (
              <Card className="glass-panel p-8 text-center">
                <Cube className="w-12 h-12 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-xs text-muted-foreground">
                  Select a template to see 3D preview
                </p>
              </Card>
            )}
          </div>

          <Separator />

          {/* Export Settings (keep existing, add cyber-button class) */}
          <div>
            <h3 className="text-sm font-medium mb-3">Export Formats</h3>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" className="cyber-button">
                AI Dieline
              </Button>
              <Button variant="outline" size="sm" className="cyber-button">
                PDF Dieline
              </Button>
              <Button variant="outline" size="sm" className="cyber-button">
                DXF Dieline
              </Button>
              <Button variant="outline" size="sm" className="cyber-button">
                3D Mockup
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

---

## 🎯 Key Pacdora Patterns Implemented

| Pacdora Feature | Madison Implementation | Status |
|----------------|------------------------|--------|
| Visual template library | `TemplateLibrary` component | ✅ Ready |
| Search & filter | Built into `TemplateLibrary` | ✅ Ready |
| Technical dimensions overlay | `TechnicalSpecsOverlay` | ✅ Ready |
| Line type legend | `LineLegend` component | ✅ Ready |
| 3D mockup preview | `Box3DPreview` (placeholder) | 🚧 Future |
| Fold animation | Slider in `Box3DPreview` | 🚧 Future |
| Export format selector | Button grid with `cyber-button` | ✅ Ready |
| Anti-Gravity styling | `press.css` | ✅ Ready |

---

## 🔮 Future Enhancements (Phase 3)

### 3D Preview with React Three Fiber
```bash
npm install three @react-three/fiber @react-three/drei
```

Then implement the actual 3D canvas in [Box3DPreview.tsx](../src/components/press/Box3DPreview.tsx).

### Dimension Annotations on Canvas
Add Fabric.js text and line objects to show measurements directly on the dieline:

```typescript
// In PressCanvas.tsx
const addDimensionAnnotations = (canvas: fabric.Canvas, dieline: DielineOutput) => {
  dieline.dimensions.forEach((dim) => {
    // Add dimension line
    const line = new fabric.Line([dim.x1, dim.y1, dim.x2, dim.y2], {
      stroke: '#00f0ff',
      strokeWidth: 1,
      selectable: false,
    });

    // Add label
    const label = new fabric.Text(`${dim.value}mm`, {
      left: (dim.x1 + dim.x2) / 2,
      top: (dim.y1 + dim.y2) / 2 - 20,
      fontSize: 10,
      fill: '#00f0ff',
      fontFamily: 'JetBrains Mono',
      selectable: false,
    });

    canvas.add(line, label);
  });
};
```

### Export Functionality
Implement actual export logic for AI, PDF, DXF formats using libraries like:
- `jspdf` for PDF export
- `svg-to-pdf` for AI/PDF conversion
- `dxf-writer` for DXF format

---

## 📱 Responsive Considerations

The current implementation works best on desktop (1280px+). For mobile/tablet:

1. **Stack panels vertically** on small screens
2. **Hide 3D preview** below 768px
3. **Simplify template cards** on mobile
4. **Use bottom sheet** for dimension input

Add to your CSS:
```css
@media (max-width: 1024px) {
  .press-layout {
    flex-direction: column;
  }

  .sidebar-left,
  .sidebar-right {
    width: 100%;
    max-height: 300px;
  }
}
```

---

## 🎨 Color Customization

All colors use Anti-Gravity design tokens from the design system:

```css
--electric-cyan: #00f0ff;
--nebula-purple: #8b5cf6;
--deep-space: #030305;
--space-black: #050508;
--orbital-dark: #0a0a0f;
--nebula-gray: #12121a;
```

To adjust, edit values in [press.css](../src/styles/press.css).

---

## 🐛 Troubleshooting

**Template thumbnails not showing:**
- Ensure SVG files exist in `/public/dielines/`
- Check file paths in template definitions

**Glass panels not visible:**
- Make sure `press.css` is imported in Press.tsx
- Check that backdrop-filter is supported in your browser

**Cyber buttons not glowing:**
- Verify CSS custom properties are defined
- Check for conflicting Tailwind classes

**3D preview blank:**
- This is expected - it's a placeholder until React Three Fiber is implemented
- See implementation notes in [Box3DPreview.tsx](../src/components/press/Box3DPreview.tsx)

---

## 📚 Related Documentation

- [Anti-Gravity Design System](./ANTIGRAVITY_DESIGN_SYSTEM.md)
- [Pacdora Inspiration Doc](./PRESS_PACDORA_INSPIRATION.md)
- [Component Source Files](../src/components/press/)

---

**Ready to integrate?** Follow the steps above and you'll have a Pacdora-quality workflow with Madison's signature Anti-Gravity aesthetic! 🚀
