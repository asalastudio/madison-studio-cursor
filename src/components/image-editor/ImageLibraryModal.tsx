/**
 * Image Library Modal
 *
 * A modal that allows users to:
 * 1. Pick from their existing image library
 * 2. Upload a new image from desktop
 */

import { useState, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, FolderOpen, Check, Plus, Image as ImageIcon, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useImageLibrary } from "@/hooks/useImageLibrary";

interface LibraryImage {
    id: string;
    url: string;
    name: string;
    timestamp?: number;
}

interface ImageLibraryModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelectImage: (image: { url: string; file?: File; name?: string }) => void;
    libraryImages?: LibraryImage[];
    title?: string;
}

const STORAGE_KEY = "madison-image-library";

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

export function ImageLibraryModal({
    open,
    onOpenChange,
    onSelectImage,
    libraryImages: externalImages,
    title = "Select Image"
}: ImageLibraryModalProps) {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [localImages, setLocalImages] = useState<LibraryImage[]>(() => getStoredImages());
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();

    // Fetch from Supabase
    const { data: supabaseImages = [], isLoading } = useImageLibrary();

    // Merge: external prop → supabase → localStorage (dedup by id)
    const seen = new Set<string>();
    const allImages = [...(externalImages || []), ...supabaseImages, ...localImages].filter(img => {
        if (seen.has(img.id)) return false;
        seen.add(img.id);
        return true;
    });

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
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) processFile(file);
    };

    const handleConfirm = () => {
        const selected = allImages.find(img => img.id === selectedId);
        if (selected) {
            onSelectImage({
                url: selected.url,
                name: selected.name
            });
            onOpenChange(false);
            setSelectedId(null);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px] bg-[#0a0a0f] border-[#1a1a1f] text-white">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-[#f0f0f0]">
                        <FolderOpen className="w-5 h-5 text-brand-brass" />
                        {title}
                    </DialogTitle>
                    <DialogDescription className="text-sm text-[#888899]">
                        Choose an existing library image or add a new one from desktop.
                    </DialogDescription>
                </DialogHeader>

                {/* Upload Area */}
                <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                        "flex items-center justify-center gap-3 p-4 border-2 border-dashed rounded-lg cursor-pointer transition-all",
                        isDragging
                            ? "border-brand-brass bg-brand-brass/10"
                            : "border-[#2a2a35] hover:border-[#3a3a45] bg-[#12121a]"
                    )}
                >
                    <Plus className="w-5 h-5 text-brand-brass" />
                    <span className="text-sm text-[#888899]">
                        {isDragging ? "Drop image here" : "Add from Desktop"}
                    </span>
                    <Input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="hidden"
                    />
                </div>

                {/* Image Grid */}
                <ScrollArea className="h-[300px] mt-4">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center h-full text-center py-12">
                            <Loader2 className="w-8 h-8 text-[#888899] mb-3 animate-spin" />
                            <p className="text-sm text-[#888899]">Loading your library…</p>
                        </div>
                    ) : allImages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center py-12">
                            <ImageIcon className="w-12 h-12 text-[#555566] mb-3" />
                            <p className="text-sm text-[#888899]">No images in library</p>
                            <p className="text-xs text-[#555566] mt-1">Upload images to build your collection</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-4 gap-3 p-1">
                            {allImages.map((image) => (
                                <button
                                    key={image.id}
                                    onClick={() => setSelectedId(image.id)}
                                    className={cn(
                                        "relative aspect-square rounded-lg overflow-hidden border-2 transition-all group",
                                        selectedId === image.id
                                            ? "border-brand-brass ring-2 ring-brand-brass/30"
                                            : "border-transparent hover:border-[#3a3a45]"
                                    )}
                                >
                                    <img
                                        src={image.url}
                                        alt={image.name}
                                        className="w-full h-full object-cover"
                                        loading="lazy"
                                        decoding="async"
                                    />
                                    {selectedId === image.id && (
                                        <div className="absolute inset-0 bg-brand-brass/20 flex items-center justify-center">
                                            <Check className="w-6 h-6 text-brand-brass" />
                                        </div>
                                    )}
                                    <div className="absolute bottom-0 left-0 right-0 p-1 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                                        <p className="text-[10px] text-white truncate">{image.name}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </ScrollArea>

                {/* Actions */}
                <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-[#1a1a1f]">
                    <Button
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        className="text-[#888899] hover:text-white hover:bg-[#1a1a1f]"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={!selectedId}
                        className="bg-brand-brass hover:bg-brand-brass/90 text-black font-medium"
                    >
                        <Upload className="w-4 h-4 mr-2" />
                        Use Selected
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
