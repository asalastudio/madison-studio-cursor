# The Press - Pacdora UI Workflow Inspiration

## Overview
This document outlines UI/UX enhancements for The Press inspired by Pacdora's dieline generator, while maintaining Madison Studio's Anti-Gravity design system.

---

## 🎨 Design Philosophy

**Pacdora's Strengths:**
- Clean, professional packaging industry aesthetic
- Technical precision with visible measurements
- Clear workflow from template → customize → export
- 3D preview provides instant visual feedback

**Madison's Anti-Gravity Translation:**
- Replace Pacdora's clean whites with Deep Space blacks (#050508)
- Add subtle cyan glow (#00f0ff33) on active elements
- Integrate floating particle effects near interactive zones
- Use glassmorphism for panels instead of solid backgrounds
- Add orbital ring motifs to frame key areas

---

## 📐 Layout Structure

### Three-Panel Layout (Keep Current Structure)
```
┌─────────────────────────────────────────────────┐
│  [Left Sidebar] [Center Canvas] [Right Preview] │
│      280px           Flex-1           340px     │
└─────────────────────────────────────────────────┘
```

---

## 🎯 LEFT SIDEBAR - Template Library

### Current State
✅ Has template cards with basic info
❌ No visual thumbnails (using placeholder icon)
❌ No search/filter
❌ No category grouping

### Pacdora Inspiration
- Visual grid of actual dieline previews
- "Library" vs "My" tabs (our version: "Templates" vs "Projects")
- Search bar at top
- Category chips (Folding Boxes, Trays, Sleeves, Labels)

### Madison Enhancement - Phase 1
```tsx
// Enhanced Template Library Component

<div className="sidebar-left">
  {/* Search */}
  <div className="search-bar">
    <Input
      placeholder="Search templates..."
      className="cyber-input" // Cyan glow on focus
    />
  </div>

  {/* Category Tabs */}
  <Tabs defaultValue="all">
    <TabsList className="glass-tabs">
      <TabsTrigger value="all">All</TabsTrigger>
      <TabsTrigger value="boxes">Boxes</TabsTrigger>
      <TabsTrigger value="labels">Labels</TabsTrigger>
      <TabsTrigger value="bags">Bags</TabsTrigger>
    </TabsList>
  </Tabs>

  {/* Template Grid - Visual Thumbnails */}
  <div className="template-grid">
    {templates.map(template => (
      <TemplateCard
        thumbnail={template.svgPreview} // Actual dieline preview
        name={template.name}
        dimensions={template.defaultDimensions}
        onClick={() => selectTemplate(template)}
        isActive={selectedTemplate === template.id}
      />
    ))}
  </div>

  {/* Dimension Input (When template selected) */}
  {selectedTemplate && (
    <DimensionPanel template={selectedTemplate} />
  )}
</div>
```

**Visual Enhancement:**
- Show actual dieline thumbnails (mini SVG renders)
- Add subtle particle effects floating near hovered cards
- Use cyan glow border on selected template
- Glassmorphism card backgrounds with backdrop-blur

---

## 🖼️ CENTER CANVAS - Technical Dieline View

### Current State
✅ Fabric.js canvas working
✅ SVG dieline loading
❌ No dimension annotations on dieline
❌ No bleed/trim/crease line indicators
❌ No ruler guides

### Pacdora Inspiration
- **Dimension Labels** - Measurements shown directly on dieline
- **Color-Coded Lines:**
  - Bleed (green outline)
  - Trim (blue dashed line)
  - Crease/Score (red dotted line)
- Technical specifications panel (top-left of canvas)
- Ruler guides along edges

### Madison Enhancement - Phase 2
```tsx
// Canvas with Dimension Annotations

interface DielineAnnotation {
  type: 'dimension' | 'bleed' | 'trim' | 'crease';
  label: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string; // Madison colors
}

// Add annotation layer OVER the dieline
const addDimensionLines = (canvas: fabric.Canvas, dieline: DielineOutput) => {
  dieline.dimensions.forEach(dim => {
    // Create dimension line with arrows
    const line = new fabric.Line([dim.x1, dim.y1, dim.x2, dim.y2], {
      stroke: '#00f0ff', // Cyan for Madison
      strokeWidth: 1,
      selectable: false,
      evented: false,
    });

    // Add text label
    const label = new fabric.Text(dim.label, {
      left: (dim.x1 + dim.x2) / 2,
      top: (dim.y1 + dim.y2) / 2 - 20,
      fontSize: 10,
      fill: '#00f0ff',
      fontFamily: 'JetBrains Mono', // Monospace from Anti-Gravity
      selectable: false,
      evented: false,
    });

    canvas.add(line, label);
  });
};
```

**Line Type Legend (Top-Left Panel):**
```tsx
<Card className="absolute top-4 left-4 glass-panel">
  <div className="text-xs space-y-1">
    <div className="flex items-center gap-2">
      <div className="w-8 h-px border-t-2 border-[#8b5cf6]" /> {/* Purple */}
      <span>Bleed</span>
    </div>
    <div className="flex items-center gap-2">
      <div className="w-8 h-px border-t-2 border-[#00f0ff]" /> {/* Cyan */}
      <span>Trim</span>
    </div>
    <div className="flex items-center gap-2">
      <div className="w-8 h-px border-t-2 border-[#ff3366] border-dashed" /> {/* Red */}
      <span>Crease</span>
    </div>
  </div>
</Card>
```

**Technical Specs Panel:**
```tsx
<Card className="absolute top-4 right-4 glass-panel">
  <h4 className="text-xs uppercase tracking-wide mb-2">Specifications</h4>
  <div className="text-xs space-y-1 font-mono">
    <div>Outer: {dieline.outerDimensions}</div>
    <div>Inner: {dieline.innerDimensions}</div>
    <div>Manufact: {dieline.manufactureDimensions}</div>
  </div>
</Card>
```

---

## 📦 RIGHT SIDEBAR - 3D Preview & Export

### Current State
✅ Basic properties panel
❌ No 3D mockup preview
❌ Export options not prominent

### Pacdora Inspiration
- **3D Mockup Preview** - Live 3D render of the box
- Open/Close animation slider
- File format selector (AI, PDF, DXF, 3D mockup)
- "You will get" feature list

### Madison Enhancement - Phase 3

**3D Preview Implementation:**
```tsx
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';

function Box3DPreview({ dieline }: { dieline: DielineOutput }) {
  const [foldState, setFoldState] = useState(0); // 0 = open, 1 = closed

  return (
    <div className="3d-preview-container">
      <Canvas
        camera={{ position: [0, 2, 5], fov: 50 }}
        className="rounded-lg"
      >
        <ambientLight intensity={0.5} />
        <spotLight position={[10, 10, 10]} intensity={1} />

        {/* 3D Box Mesh generated from dieline */}
        <Box3DMesh
          geometry={convertDielineToGeometry(dieline)}
          foldState={foldState}
        />

        <OrbitControls enableZoom={true} />

        {/* Anti-Gravity: Particle field background */}
        <StarField count={200} />
      </Canvas>

      {/* Fold Animation Slider */}
      <div className="mt-4">
        <Label className="text-xs">Fold Animation</Label>
        <Slider
          value={[foldState]}
          onValueChange={([v]) => setFoldState(v)}
          min={0}
          max={1}
          step={0.01}
          className="cyber-slider"
        />
        <div className="flex justify-between text-xs mt-1">
          <span>Open</span>
          <span>Close</span>
        </div>
      </div>
    </div>
  );
}
```

**Export Options Panel:**
```tsx
<div className="export-section">
  <h3 className="font-medium mb-3">File Formats</h3>

  <div className="grid grid-cols-2 gap-2">
    <Button variant="outline" className="cyber-button">
      <FileText className="w-4 h-4 mr-2" />
      AI Dieline
    </Button>
    <Button variant="outline" className="cyber-button">
      <FileText className="w-4 h-4 mr-2" />
      PDF Dieline
    </Button>
    <Button variant="outline" className="cyber-button">
      <FileText className="w-4 h-4 mr-2" />
      DXF Dieline
    </Button>
    <Button variant="outline" className="cyber-button">
      <Cube className="w-4 h-4 mr-2" />
      3D Mockup
    </Button>
  </div>

  {/* Feature List */}
  <Card className="mt-4 glass-panel p-3">
    <h4 className="text-xs font-medium mb-2">You Will Get</h4>
    <ul className="text-xs space-y-2 text-muted-foreground">
      <li>✓ Print-ready files within minutes</li>
      <li>✓ Structurally verified dimensions</li>
      <li>✓ Bleed, trim, crease lines included</li>
      <li>✓ CMYK color space, 300 DPI</li>
      <li>✓ No watermarks, locally editable</li>
    </ul>
  </Card>
</div>
```

---

## 🎨 Anti-Gravity Styling Enhancements

### Component Styles

**Cyber Button:**
```css
.cyber-button {
  background: rgba(0, 240, 255, 0.05);
  border: 1px solid rgba(0, 240, 255, 0.2);
  color: #f0f0f0;
  transition: all 0.3s ease;
}

.cyber-button:hover {
  background: rgba(0, 240, 255, 0.1);
  border-color: #00f0ff;
  box-shadow: 0 0 20px rgba(0, 240, 255, 0.3);
}
```

**Glass Panel:**
```css
.glass-panel {
  background: rgba(18, 18, 26, 0.6);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(0, 240, 255, 0.1);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}
```

**Floating Particles:**
```tsx
// Add to canvas background
<Particles
  className="absolute inset-0 pointer-events-none"
  quantity={50}
  color="#00f0ff"
  size={1}
  speed={0.5}
  opacity={0.3}
/>
```

---

## 🔄 Workflow Comparison

### Pacdora Workflow
1. Select template from library
2. Adjust dimensions
3. View live preview with measurements
4. Download multiple file formats

### Madison Enhanced Workflow
1. **Discover** - Browse visual template library (Anti-Gravity cards)
2. **Customize** - Input dimensions with live 3D preview
3. **Design** - Add artwork from Image Studio
4. **Refine** - See technical specs with dimension annotations
5. **Export** - Download print-ready files (AI, PDF, DXF, 3D mockup)

---

## 📋 Implementation Priority

### Phase 1 (Current Sprint) ⚡
- [ ] Enhanced template library with actual SVG thumbnails
- [ ] Search and category filtering
- [ ] Anti-Gravity styling (glass panels, cyan glows)

### Phase 2 (Next Sprint) 🎯
- [ ] Dimension annotations on canvas
- [ ] Bleed/trim/crease line visualization
- [ ] Technical specs overlay panel
- [ ] Ruler guides

### Phase 3 (Future) 🚀
- [ ] 3D mockup preview (React Three Fiber)
- [ ] Fold animation slider
- [ ] Multiple export formats
- [ ] "Design Online" button (collaborate feature)

---

## 🎬 UX Micro-Interactions

**Pacdora Inspiration:**
- Smooth template selection transitions
- Dimension values update in real-time on canvas
- 3D mockup rotates smoothly

**Madison Enhancement:**
- Add particle burst on template selection
- Cyan glow pulse when dimension updates
- Smooth zoom animation (Anti-Gravity float effect)
- Orbital ring rotation around active elements
- Scan line effect on canvas load

---

*Document created: 2026-02-13*
*Design System: Anti-Gravity ID*
*Inspired by: Pacdora Dieline Generator*
