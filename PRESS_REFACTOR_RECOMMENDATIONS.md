# Press Feature - Refactoring Recommendations

## Current Status: ✅ Working & Building Successfully

The Press feature is functional and the build passes. These are enhancement recommendations for improved architecture and maintainability.

---

## 1. State Management (Priority: HIGH)

### Current Issue
All state lives in `Press.tsx`, making it difficult to:
- Share state between components
- Test components in isolation
- Manage complex state interactions

### Recommendation: Create Context + Custom Hook

```typescript
// src/contexts/PressContext.tsx
interface PressState {
  // Project state
  projectName: string;
  selectedTemplate: string | null;

  // Canvas state
  canvasInstance: fabric.Canvas | null;
  zoomLevel: number;

  // Dieline state
  generatedDieline: DielineOutput | null;
  dielineSvgDataUrl: string | null;

  // Layer visibility
  showDieline: boolean;
  showDimensions: boolean;
  showArtwork: boolean;
}

interface PressActions {
  setProjectName: (name: string) => void;
  selectTemplate: (id: string) => void;
  generateDieline: (dieline: DielineOutput) => void;
  updateZoom: (level: number) => void;
  // ... etc
}
```

**Benefits:**
- Cleaner component code
- Easier to add undo/redo
- Better testing
- Prepare for future persistence layer

---

## 2. Template Data Management (Priority: HIGH)

### Current Issue
Templates are hardcoded in `Press.tsx` lines 74-99:
```typescript
const templates = [
  {
    id: "c8e8f4b0-1234-4a5b-8c9d-1234567890ab",
    name: "50ml Perfume Box - Tuck End",
    // ...
  },
  // ...
];
```

### Recommendation: Database Integration

**You already have migrations ready!**
- `supabase/migrations/20260213000000_create_press_tables.sql`
- `supabase/migrations/20260213000002_seed_starter_dielines.sql`

**Next Steps:**
1. Create `src/hooks/useTemplates.ts`:
```typescript
export function useTemplates() {
  const { data: templates, isLoading } = useQuery({
    queryKey: ['press-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('packaging_templates')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  return { templates, isLoading };
}
```

2. Update `Press.tsx` to use the hook:
```typescript
const { templates, isLoading } = useTemplates();
```

---

## 3. Type Safety Improvements (Priority: MEDIUM)

### Issues Found

**Issue 1:** `any` type in canvas state ([Press.tsx:27](src/pages/Press.tsx#L27))
```typescript
const [canvasInstance, setCanvasInstance] = useState<any>(null); // ❌
```
**Fix:**
```typescript
const [canvasInstance, setCanvasInstance] = useState<fabric.Canvas | null>(null); // ✅
```

**Issue 2:** Loose template type definition
```typescript
const templates = [ /* ... */ ]; // No explicit type
```
**Fix:**
```typescript
interface PackagingTemplate {
  id: string;
  name: string;
  category: 'perfume_box' | 'roller_box' | 'label' | 'candle_box' | 'jar_box';
  thumbnail?: string;
  dimensions: string;
  description?: string;
  isPremium?: boolean;
}

const templates: PackagingTemplate[] = [ /* ... */ ];
```

---

## 4. Component Extraction (Priority: LOW-MEDIUM)

### Opportunity: Canvas Toolbar

The toolbar in [PressCanvas.tsx](src/components/press/PressCanvas.tsx) (lines 197-295) could be extracted:

```typescript
// src/components/press/CanvasToolbar.tsx
interface CanvasToolbarProps {
  selectedObject: fabric.Object | null;
  showDimensions: boolean;
  onShowDimensionsToggle: () => void;
  onArtworkUpload: (file: File) => void;
  onAlign: (alignment: 'left' | 'center' | 'right') => void;
  onDelete: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
}
```

**Benefits:**
- Easier to test toolbar logic
- Cleaner PressCanvas component
- Reusable if you add more canvas views

---

## 5. Custom Hooks for Canvas Operations (Priority: MEDIUM)

### Recommendation: Extract Canvas Logic

Create hooks to encapsulate Fabric.js complexity:

```typescript
// src/hooks/useCanvasSetup.ts
export function useCanvasSetup(canvasRef: RefObject<HTMLCanvasElement>) {
  const [canvas, setCanvas] = useState<fabric.Canvas | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const fabricCanvas = new fabric.Canvas(canvasRef.current, {
      width: 800,
      height: 1000,
      backgroundColor: "#ffffff",
      selection: true,
      preserveObjectStacking: true,
    });

    setCanvas(fabricCanvas);

    return () => {
      fabricCanvas.dispose();
    };
  }, [canvasRef]);

  return canvas;
}

// src/hooks/useCanvasSelection.ts
export function useCanvasSelection(canvas: fabric.Canvas | null) {
  const [selectedObject, setSelectedObject] = useState<fabric.Object | null>(null);

  useEffect(() => {
    if (!canvas) return;

    const handleSelection = (e: fabric.IEvent) => {
      setSelectedObject(e.selected?.[0] || null);
    };

    canvas.on('selection:created', handleSelection);
    canvas.on('selection:updated', handleSelection);
    canvas.on('selection:cleared', () => setSelectedObject(null));

    return () => {
      canvas.off('selection:created', handleSelection);
      canvas.off('selection:updated', handleSelection);
      canvas.off('selection:cleared');
    };
  }, [canvas]);

  return selectedObject;
}
```

---

## 6. Error Boundaries & Loading States (Priority: MEDIUM)

### Current State
- Basic error boundary at route level
- No loading states in components

### Recommendations

1. **Add loading states:**
```typescript
// In TemplateLibrary
if (isLoading) {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map(i => (
        <Card key={i} className="loading-shimmer h-24" />
      ))}
    </div>
  );
}
```

2. **Add error handling:**
```typescript
if (error) {
  return (
    <div className="text-center py-8">
      <p className="text-destructive">Failed to load templates</p>
      <Button onClick={refetch}>Retry</Button>
    </div>
  );
}
```

---

## 7. File Organization (Priority: LOW)

### Current Structure
```
src/
├── components/press/          ✅ Good
├── lib/press/                 ✅ Good
├── pages/Press.tsx            ✅ Good
└── styles/press.css           ✅ Good
```

### Future Consideration
As the feature grows, consider:
```
src/features/press/
├── components/
│   ├── canvas/
│   │   ├── PressCanvas.tsx
│   │   ├── CanvasToolbar.tsx
│   │   └── useCanvasOperations.ts
│   ├── library/
│   │   └── TemplateLibrary.tsx
│   └── preview/
│       └── Box3DPreview.tsx
├── contexts/
│   └── PressContext.tsx
├── hooks/
│   ├── useTemplates.ts
│   ├── useCanvasSetup.ts
│   └── useDielineGenerator.ts
├── lib/
│   └── generators/
├── types/
│   └── press.types.ts
├── Press.tsx
└── press.css
```

---

## 8. Database Integration Checklist (Priority: HIGH)

Your migrations are ready! Here's what's missing:

- [ ] Run migrations to create tables
- [ ] Seed initial templates
- [ ] Create `useTemplates` hook
- [ ] Create `useSaveProject` hook for persistence
- [ ] Add project loading/saving UI
- [ ] Connect to Supabase storage for artwork uploads

**Migrations to run:**
1. `20260213000000_create_press_tables.sql` - Press tables
2. `20260213000001_press_storage_buckets.sql` - Storage setup
3. `20260213000002_seed_starter_dielines.sql` - Starter templates
4. `20260213160618_create_packaging_tables.sql` - Extended packaging schema
5. `20260213160619_seed_packaging_templates.sql` - More templates

---

## 9. Feature Completeness Roadmap

### Phase 1: MVP (Current) ✅
- [x] Template library UI
- [x] Parametric dieline generation
- [x] Canvas editing with Fabric.js
- [x] Dimension annotations
- [x] Basic export (PNG preview)

### Phase 2: Integration (Next)
- [ ] Database-driven templates
- [ ] Project save/load
- [ ] Artwork upload to Supabase Storage
- [ ] Connect to Image Studio for AI artwork
- [ ] User-specific project management

### Phase 3: Advanced Features
- [ ] 3D preview with React Three Fiber
- [ ] Export formats (AI, PDF, DXF)
- [ ] Real-time collaboration
- [ ] Template customization
- [ ] Print-ready file generation

---

## 10. Performance Considerations

### Current Status: Good ✅
- Lazy loading for Press page
- Efficient SVG rendering
- Fabric.js is performant

### Future Optimizations
1. **Template thumbnails**: Generate and cache in storage
2. **Canvas virtualization**: For very large dielines
3. **Debounce dimension inputs**: Reduce re-renders during typing
4. **Web Workers**: For heavy SVG generation if needed

---

## Implementation Priority

**Do First (High ROI):**
1. ✅ Fix build error (DONE)
2. 🔄 Run database migrations
3. 🔄 Create useTemplates hook
4. 🔄 Fix `any` types in canvas state
5. 🔄 Add loading/error states

**Do Next (Medium ROI):**
1. Create PressContext for state management
2. Extract canvas logic into custom hooks
3. Add project save/load functionality
4. Connect artwork upload to storage

**Do Later (Polish):**
1. Extract CanvasToolbar component
2. Reorganize file structure
3. Add undo/redo functionality
4. Implement 3D preview

---

## Testing Recommendations

Currently no tests for Press. Consider adding:

```typescript
// Example: Template library filtering
describe('TemplateLibrary', () => {
  it('filters templates by search query', () => {
    // ...
  });

  it('filters templates by category', () => {
    // ...
  });
});

// Example: Dieline generation
describe('generateTuckEndBox', () => {
  it('generates valid SVG with correct dimensions', () => {
    const result = generateTuckEndBox({ width: 50, height: 150, depth: 50 });
    expect(result.svg).toContain('<svg');
    expect(result.dimensions.outer).toEqual({ width: 50, height: 150, depth: 50 });
  });
});
```

---

## Summary

**Overall Assessment: 🌟 Strong Foundation**

You've built a solid MVP with:
- Clean architecture
- Professional dieline generation
- Polished UI with consistent design system
- Good separation of concerns

**Critical Path Forward:**
1. Integrate with database (migrations are ready!)
2. Improve type safety (quick wins)
3. Add state management (PressContext)
4. Connect to other features (Image Studio, Products)

The codebase is in good shape and ready to scale. Focus on database integration next, then enhance state management as the feature grows.
