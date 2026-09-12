/**
 * Image Library Modal — a contact sheet with a loupe.
 *
 * The first version was a 600px dialog showing four cropped squares per row:
 * a tall product shot became a slice of amber glass, eight images fit on
 * screen, and the only way to see what you were choosing was to choose it.
 *
 * Every image-reference picker we compared does the opposite. Lightroom-style
 * contact sheets keep the whole frame visible at an adjustable cell size, and
 * a loupe shows the one you are on at full aspect before you commit —
 * Leonardo's Image Guidance panel, WordPress's attachment sidebar and
 * Midjourney's images panel all share that shape.
 *
 * So: the dialog takes the viewport, thumbnails are *fit* rather than cropped
 * (uniform cells, full frame inside), S/M/L cell size persists, a search box
 * filters name / tags / prompt, and the loupe on the right shows the selection
 * at full aspect with its ratio, date and tags. Double-click or Enter uses the
 * image; arrow keys move the selection. Drop a file anywhere to add it.
 *
 * Props are unchanged — every existing call site keeps working.
 */

import {
    useState,
    useRef,
    useCallback,
    useEffect,
    useMemo,
    type KeyboardEvent,
    type DragEvent,
} from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Upload,
    FolderOpen,
    Check,
    Plus,
    Image as ImageIcon,
    Loader2,
    Search,
    X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useImageLibrary } from "@/hooks/useImageLibrary";
import { storageThumbnailUrl } from "@/lib/storageThumbnails";

interface LibraryImage {
    id: string;
    url: string;
    name: string;
    timestamp?: number;
    aspectRatio?: string;
    goalType?: string;
    prompt?: string;
    libraryTags?: string[];
}

interface ImageLibraryModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelectImage: (image: { url: string; file?: File; name?: string }) => void;
    libraryImages?: LibraryImage[];
    title?: string;
    /** When set, only loads generated_images rows whose library_tags include this token. */
    libraryTagFilter?: string;
    /** OR filter: any of these tags. If set, takes precedence over `libraryTagFilter`. */
    libraryTagContainsAny?: string[];
    /** Hide desktop upload when a calling surface owns its own fallback. */
    allowDesktopUpload?: boolean;
}

const STORAGE_KEY = "madison-image-library";
const CELL_SIZE_KEY = "madison-library-picker-cell";

// Load images from localStorage
function getStoredImages(): LibraryImage[] {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

// Save images to localStorage
function saveStoredImages(images: LibraryImage[]) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(images));
    } catch (e) {
        console.error("Failed to save images to library:", e);
    }
}

/** Contact-sheet cell size. Lightroom's grid slider, reduced to three stops. */
type CellSize = "s" | "m" | "l";
const CELL_PX: Record<CellSize, number> = { s: 116, m: 164, l: 236 };
const CELL_LABEL: Record<CellSize, string> = { s: "S", m: "M", l: "L" };

function readCellSize(): CellSize {
    try {
        const value = localStorage.getItem(CELL_SIZE_KEY);
        return value === "s" || value === "m" || value === "l" ? value : "m";
    } catch {
        return "m";
    }
}

/**
 * Quick filters derived from the tags the pipeline already writes. Only the
 * kinds actually present are offered, and none when the caller has already
 * narrowed the library (background scenes only, say).
 */
type ImageKind = "product" | "background" | "hero";
const KIND_LABEL: Record<ImageKind, string> = {
    product: "Products",
    background: "Backgrounds",
    hero: "Heroes",
};
const KIND_ORDER: ImageKind[] = ["product", "background", "hero"];

function imageKind(image: LibraryImage): ImageKind | null {
    const tags = (image.libraryTags ?? []).map((tag) => tag.toLowerCase());
    const goal = (image.goalType ?? "").toLowerCase();
    if (tags.includes("role:background-scene") || tags.includes("kind:darkroom-background-scene")) {
        return "background";
    }
    if (tags.includes("intended-use:homepage-hero") || goal.includes("hero")) {
        return "hero";
    }
    if (
        tags.includes("role:product-image") ||
        tags.includes("intended-use:pdp-candidate") ||
        tags.includes("studio-master") ||
        goal.includes("product")
    ) {
        return "product";
    }
    return null;
}

function formatDate(timestamp?: number): string | null {
    if (!timestamp) return null;
    return new Date(timestamp).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

/** "role:product-image" → "product-image": the namespace is noise in a chip. */
function shortTag(tag: string): string {
    const index = tag.indexOf(":");
    return index > 0 ? tag.slice(index + 1) : tag;
}

export function ImageLibraryModal({
    open,
    onOpenChange,
    onSelectImage,
    libraryImages: externalImages,
    title = "Select Image",
    libraryTagFilter,
    libraryTagContainsAny,
    allowDesktopUpload = true,
}: ImageLibraryModalProps) {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [localImages, setLocalImages] = useState<LibraryImage[]>(() => getStoredImages());
    const [isDragging, setIsDragging] = useState(false);
    const [search, setSearch] = useState("");
    const [kind, setKind] = useState<ImageKind | null>(null);
    const [cellSize, setCellSize] = useState<CellSize>(() => readCellSize());
    const dragDepth = useRef(0);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const gridRef = useRef<HTMLDivElement>(null);
    const { toast } = useToast();

    // Fetch from Supabase
    const { data: supabaseImages = [], isLoading } = useImageLibrary(
        libraryTagContainsAny?.length
            ? { libraryTagContainsAny }
            : libraryTagFilter
              ? { libraryTagContains: libraryTagFilter }
              : {},
    );

    // Merge: external prop → supabase → localStorage (dedup by id)
    const allImages = useMemo(() => {
        const seen = new Set<string>();
        return [...(externalImages || []), ...supabaseImages, ...localImages].filter((img) => {
            if (seen.has(img.id)) return false;
            seen.add(img.id);
            return true;
        });
    }, [externalImages, supabaseImages, localImages]);

    // A fresh open is a fresh sheet: no stale filter hiding half the library.
    useEffect(() => {
        if (open) {
            setSearch("");
            setKind(null);
            dragDepth.current = 0;
            setIsDragging(false);
        }
    }, [open]);

    const callerNarrowed = Boolean(libraryTagContainsAny?.length || libraryTagFilter);
    const kindsPresent = useMemo(() => {
        if (callerNarrowed) return [] as ImageKind[];
        const present = new Set<ImageKind>();
        for (const image of allImages) {
            const k = imageKind(image);
            if (k) present.add(k);
        }
        return KIND_ORDER.filter((k) => present.has(k));
    }, [allImages, callerNarrowed]);

    const visibleImages = useMemo(() => {
        const query = search.trim().toLowerCase();
        return allImages.filter((image) => {
            if (kind && imageKind(image) !== kind) return false;
            if (!query) return true;
            return [image.name, image.prompt, image.goalType, image.aspectRatio, ...(image.libraryTags ?? [])]
                .some((value) => value?.toLowerCase().includes(query));
        });
    }, [allImages, kind, search]);

    const selectedImage = allImages.find((img) => img.id === selectedId) ?? null;

    const changeCellSize = (size: CellSize) => {
        setCellSize(size);
        try {
            localStorage.setItem(CELL_SIZE_KEY, size);
        } catch {
            // Per-viewer convenience only; losing it costs nothing.
        }
    };

    const processFile = useCallback((file: File) => {
        if (!file.type.startsWith('image/')) {
            toast({
                title: "Invalid file type",
                description: "Please select an image file",
                variant: "destructive",
            });
            return;
        }

        if (file.size > 20 * 1024 * 1024) {
            toast({
                title: "File too large",
                description: "Maximum file size is 20MB",
                variant: "destructive",
            });
            return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
            const newImage: LibraryImage = {
                id: `img-${Date.now()}`,
                url: reader.result as string,
                name: file.name,
                timestamp: Date.now()
            };

            // Add to local library
            const updated = [newImage, ...localImages];
            setLocalImages(updated);
            saveStoredImages(updated);

            // Auto-select the new image
            setSelectedId(newImage.id);

            toast({
                title: "Image added to library",
                description: file.name,
            });
        };
        reader.readAsDataURL(file);
    }, [localImages, toast]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) processFile(file);
        e.target.value = "";
    };

    // Drop anywhere on the dialog. Child elements fire enter/leave pairs as the
    // pointer crosses them, so a depth counter is what keeps the overlay steady.
    const handleDragEnter = (e: DragEvent) => {
        if (!allowDesktopUpload) return;
        e.preventDefault();
        dragDepth.current += 1;
        setIsDragging(true);
    };
    const handleDragLeave = (e: DragEvent) => {
        if (!allowDesktopUpload) return;
        e.preventDefault();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setIsDragging(false);
    };
    const handleDrop = (e: DragEvent) => {
        if (!allowDesktopUpload) return;
        e.preventDefault();
        dragDepth.current = 0;
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) processFile(file);
    };

    const confirmImage = useCallback((image: LibraryImage | null) => {
        if (!image) return;
        onSelectImage({
            url: image.url,
            name: image.name
        });
        onOpenChange(false);
        setSelectedId(null);
    }, [onOpenChange, onSelectImage]);

    const handleConfirm = () => confirmImage(selectedImage);

    /** Arrow keys walk the sheet; Enter uses what's under the cursor. */
    const handleGridKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        if (visibleImages.length === 0) return;
        if (e.key === "Enter") {
            if (selectedImage) {
                e.preventDefault();
                confirmImage(selectedImage);
            }
            return;
        }
        const columns = (() => {
            const grid = gridRef.current;
            if (!grid) return 1;
            const template = getComputedStyle(grid).gridTemplateColumns;
            return Math.max(1, template.split(" ").filter(Boolean).length);
        })();
        const delta =
            e.key === "ArrowRight" ? 1
            : e.key === "ArrowLeft" ? -1
            : e.key === "ArrowDown" ? columns
            : e.key === "ArrowUp" ? -columns
            : 0;
        if (delta === 0) return;
        e.preventDefault();
        const currentIndex = visibleImages.findIndex((img) => img.id === selectedId);
        const nextIndex = currentIndex < 0
            ? 0
            : Math.min(visibleImages.length - 1, Math.max(0, currentIndex + delta));
        const next = visibleImages[nextIndex];
        setSelectedId(next.id);
        const button = gridRef.current?.querySelector<HTMLButtonElement>(
            `[data-image-id="${CSS.escape(next.id)}"]`,
        );
        button?.focus({ preventScroll: true });
        button?.scrollIntoView({ block: "nearest" });
    };

    const thumbWidth = cellSize === "l" ? 640 : 400;
    const description = libraryTagFilter
        ? "Images tagged for this use in Dark Room. Generate more from Background plate mode if this list is empty."
        : "Click to preview, double-click or press Enter to use. Drop a file anywhere to add it.";

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                onDragEnter={handleDragEnter}
                onDragOver={(e) => { if (allowDesktopUpload) e.preventDefault(); }}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className="flex h-[min(880px,92vh)] w-[min(1240px,94vw)] max-w-none flex-col gap-0 overflow-hidden p-0 bg-[#0a0a0f] border-[#1a1a1f] text-white"
            >
                {/* Drop overlay */}
                {isDragging && (
                    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-lg border-2 border-dashed border-brand-brass bg-[#0a0a0f]/85">
                        <div className="flex items-center gap-3 text-brand-brass">
                            <Plus className="h-6 w-6" />
                            <span className="text-sm font-medium">Drop to add to the library</span>
                        </div>
                    </div>
                )}

                {/* Header: title, upload, search, filters, size */}
                <DialogHeader className="space-y-3 border-b border-[#1a1a1f] px-5 pb-3 pt-5 text-left">
                    <div className="flex items-start justify-between gap-4 pr-8">
                        <div className="min-w-0 space-y-1">
                            <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-[#f0f0f0]">
                                <FolderOpen className="h-5 w-5 text-brand-brass" />
                                {title}
                            </DialogTitle>
                            <DialogDescription className="text-sm text-[#888899]">
                                {description}
                            </DialogDescription>
                        </div>
                        {allowDesktopUpload && (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => fileInputRef.current?.click()}
                                className="shrink-0 border-[#2a2a35] bg-[#12121a] text-[#c8c8d0] hover:border-brand-brass hover:bg-brand-brass/10 hover:text-white"
                            >
                                <Plus className="mr-1.5 h-4 w-4 text-brand-brass" />
                                Add from desktop
                            </Button>
                        )}
                        <Input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleFileChange}
                            className="hidden"
                        />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative min-w-[200px] flex-1">
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#555566]" />
                            <Input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search name, tag or prompt"
                                aria-label="Search library"
                                className="h-8 border-[#2a2a35] bg-[#12121a] pl-8 pr-8 text-sm text-white placeholder:text-[#555566] focus-visible:ring-brand-brass"
                            />
                            {search && (
                                <button
                                    type="button"
                                    onClick={() => setSearch("")}
                                    aria-label="Clear search"
                                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-[#555566] hover:text-white"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>

                        {kindsPresent.length > 1 && (
                            <div className="flex items-center gap-1" role="group" aria-label="Filter by kind">
                                {([null, ...kindsPresent] as (ImageKind | null)[]).map((k) => {
                                    const active = kind === k;
                                    return (
                                        <button
                                            key={k ?? "all"}
                                            type="button"
                                            aria-pressed={active}
                                            onClick={() => setKind(k)}
                                            className={cn(
                                                "rounded-full border px-2.5 py-1 text-[11px] leading-none transition-colors",
                                                active
                                                    ? "border-brand-brass/60 bg-brand-brass/10 text-brand-brass"
                                                    : "border-[#2a2a35] text-[#888899] hover:border-[#3a3a45] hover:text-white",
                                            )}
                                        >
                                            {k ? KIND_LABEL[k] : "All"}
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        <div className="ml-auto flex items-center gap-1" role="group" aria-label="Thumbnail size">
                            <span className="mr-1 text-[11px] text-[#555566]">Size</span>
                            {(["s", "m", "l"] as CellSize[]).map((size) => (
                                <button
                                    key={size}
                                    type="button"
                                    aria-pressed={cellSize === size}
                                    onClick={() => changeCellSize(size)}
                                    className={cn(
                                        "h-7 w-7 rounded border text-[11px] font-medium transition-colors",
                                        cellSize === size
                                            ? "border-brand-brass/60 bg-brand-brass/10 text-brand-brass"
                                            : "border-[#2a2a35] text-[#888899] hover:border-[#3a3a45] hover:text-white",
                                    )}
                                >
                                    {CELL_LABEL[size]}
                                </button>
                            ))}
                        </div>
                    </div>
                </DialogHeader>

                {/* Body: contact sheet + loupe */}
                <div className="flex min-h-0 flex-1">
                    <div
                        className="min-h-0 flex-1 overflow-y-auto p-4"
                        onKeyDown={handleGridKeyDown}
                    >
                        {isLoading ? (
                            <div className="flex h-full flex-col items-center justify-center py-12 text-center">
                                <Loader2 className="mb-3 h-8 w-8 animate-spin text-[#888899]" />
                                <p className="text-sm text-[#888899]">Loading your library…</p>
                            </div>
                        ) : visibleImages.length === 0 ? (
                            <div className="flex h-full flex-col items-center justify-center py-12 text-center">
                                <ImageIcon className="mb-3 h-12 w-12 text-[#555566]" />
                                {allImages.length === 0 ? (
                                    <>
                                        <p className="text-sm text-[#888899]">No images in library</p>
                                        <p className="mt-1 text-xs text-[#555566]">Upload images to build your collection</p>
                                    </>
                                ) : (
                                    <>
                                        <p className="text-sm text-[#888899]">Nothing matches</p>
                                        <button
                                            type="button"
                                            onClick={() => { setSearch(""); setKind(null); }}
                                            className="mt-1 text-xs text-brand-brass underline underline-offset-2"
                                        >
                                            Clear search and filters
                                        </button>
                                    </>
                                )}
                            </div>
                        ) : (
                            <div
                                ref={gridRef}
                                role="group"
                                aria-label="Library images"
                                className="grid gap-3"
                                style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${CELL_PX[cellSize]}px, 1fr))` }}
                            >
                                {visibleImages.map((image) => {
                                    const isSelected = selectedId === image.id;
                                    return (
                                        <button
                                            key={image.id}
                                            type="button"
                                            data-image-id={image.id}
                                            aria-pressed={isSelected}
                                            title={image.name}
                                            onClick={() => setSelectedId(image.id)}
                                            onDoubleClick={() => confirmImage(image)}
                                            className={cn(
                                                "group relative aspect-square overflow-hidden rounded-lg border-2 bg-[#0e0e14] transition-all",
                                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-brass focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0f]",
                                                isSelected
                                                    ? "border-brand-brass ring-2 ring-brand-brass/30"
                                                    : "border-transparent hover:border-[#3a3a45]",
                                            )}
                                        >
                                            {/* Fit, not crop: the whole frame is the point of a contact sheet. */}
                                            <img
                                                src={storageThumbnailUrl(image.url, { width: thumbWidth })}
                                                alt={image.name}
                                                className="absolute inset-0 h-full w-full object-contain p-1"
                                                loading="lazy"
                                                decoding="async"
                                            />
                                            {image.aspectRatio && (
                                                <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 py-0.5 font-mono text-[9px] text-white/80">
                                                    {image.aspectRatio}
                                                </span>
                                            )}
                                            {isSelected && (
                                                <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-brass text-black">
                                                    <Check className="h-3 w-3" />
                                                </span>
                                            )}
                                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-1.5 pt-4 opacity-0 transition-opacity group-hover:opacity-100">
                                                <p className="truncate text-[10px] text-white">{image.name}</p>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Loupe: the selection at full aspect, with what we know about it. */}
                    <aside className="hidden w-[320px] shrink-0 flex-col border-l border-[#1a1a1f] bg-[#0c0c12] lg:flex">
                        {selectedImage ? (
                            <>
                                <div className="flex min-h-0 flex-1 items-center justify-center bg-[#08080c] p-4">
                                    <img
                                        src={storageThumbnailUrl(selectedImage.url, { width: 800 })}
                                        alt={selectedImage.name}
                                        className="max-h-full max-w-full rounded object-contain"
                                        decoding="async"
                                    />
                                </div>
                                <div className="space-y-2 border-t border-[#1a1a1f] p-4">
                                    <p className="truncate text-sm font-medium text-[#f0f0f0]" title={selectedImage.name}>
                                        {selectedImage.name}
                                    </p>
                                    <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#888899]">
                                        {[selectedImage.aspectRatio, formatDate(selectedImage.timestamp), selectedImage.goalType]
                                            .filter(Boolean)
                                            .join(" · ") || "No details recorded"}
                                    </p>
                                    {selectedImage.libraryTags && selectedImage.libraryTags.length > 0 && (
                                        <div className="flex flex-wrap gap-1">
                                            {selectedImage.libraryTags.slice(0, 6).map((tag) => (
                                                <span
                                                    key={tag}
                                                    title={tag}
                                                    className="rounded-full border border-[#2a2a35] px-1.5 py-0.5 text-[9px] text-[#888899]"
                                                >
                                                    {shortTag(tag)}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    {selectedImage.prompt && (
                                        <p className="line-clamp-3 text-[11px] leading-snug text-[#555566]" title={selectedImage.prompt}>
                                            {selectedImage.prompt}
                                        </p>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
                                <ImageIcon className="mb-3 h-10 w-10 text-[#2a2a35]" />
                                <p className="text-sm text-[#888899]">Select an image to preview it here</p>
                                <p className="mt-1 text-xs text-[#555566]">Full frame, ratio, date and tags</p>
                            </div>
                        )}
                    </aside>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between gap-3 border-t border-[#1a1a1f] px-5 py-3">
                    <p className="min-w-0 truncate text-[11px] text-[#555566]">
                        {isLoading
                            ? "Loading…"
                            : visibleImages.length === allImages.length
                                ? `${allImages.length} images`
                                : `${visibleImages.length} of ${allImages.length} images`}
                        <span className="hidden sm:inline"> · Arrow keys move · Enter uses</span>
                        {selectedImage && (
                            <span className="lg:hidden"> · Selected: {selectedImage.name}</span>
                        )}
                    </p>
                    <div className="flex shrink-0 gap-2">
                        <Button
                            variant="ghost"
                            onClick={() => onOpenChange(false)}
                            className="text-[#888899] hover:bg-[#1a1a1f] hover:text-white"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleConfirm}
                            disabled={!selectedImage}
                            className="bg-brand-brass font-medium text-black hover:bg-brand-brass/90"
                        >
                            <Upload className="mr-2 h-4 w-4" />
                            Use Selected
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
