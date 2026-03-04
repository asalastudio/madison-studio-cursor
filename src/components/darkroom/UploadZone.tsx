import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, X, Check, Replace } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export type UploadType = "product" | "background" | "style";

interface UploadedImage {
  url: string;
  file?: File;
  name?: string;
}

interface UploadZoneProps {
  type: UploadType;
  label: string;
  description: string;
  image: UploadedImage | null;
  onUpload: (image: UploadedImage) => void;
  onRemove?: () => void;
  onLibraryOpen?: () => void;
  disabled?: boolean;
  className?: string;
}

export function UploadZone({
  label,
  description,
  image,
  onUpload,
  onRemove,
  onLibraryOpen,
  disabled = false,
  className,
}: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        toast.error("Please select an image file");
        return;
      }

      if (file.size > 20 * 1024 * 1024) {
        toast.error("File too large (max 20MB)");
        return;
      }

      setIsUploading(true);

      try {
        const reader = new FileReader();
        reader.onloadend = () => {
          onUpload({
            url: reader.result as string,
            file,
            name: file.name,
          });
          setIsUploading(false);
        };
        reader.onerror = () => {
          toast.error("Failed to read file");
          setIsUploading(false);
        };
        reader.readAsDataURL(file);
      } catch (error) {
        toast.error("Failed to process image");
        setIsUploading(false);
      }
    },
    [onUpload]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (disabled) return;

      const file = e.dataTransfer.files?.[0];
      if (file && file.type.startsWith("image/")) {
        processFile(file);
      }
    },
    [disabled, processFile]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        processFile(file);
      }
      // Reset input so same file can be selected again
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    },
    [processFile]
  );

  const handleClick = useCallback(() => {
    if (disabled) return;
    if (onLibraryOpen) {
      onLibraryOpen();
    } else if (inputRef.current) {
      inputRef.current.click();
    }
  }, [disabled, onLibraryOpen]);

  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRemove?.();
    },
    [onRemove]
  );

  const handleReplace = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (inputRef.current) {
        inputRef.current.click();
      }
    },
    []
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3 }}
      className={cn("upload-zone-container", className)}
    >
      <label className="upload-zone-label">{label}</label>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
        disabled={disabled}
      />

      <div
        className={cn(
          "upload-zone",
          isDragging && "dragging",
          image && "has-image",
          disabled && "opacity-50 cursor-not-allowed"
        )}
        onClick={!image ? handleClick : undefined}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <AnimatePresence mode="wait">
          {!image ? (
            // Empty State
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="upload-empty"
            >
              {isUploading ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                >
                  <Upload className="upload-icon" />
                </motion.div>
              ) : (
                <motion.div
                  whileHover={{ scale: 1.1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 10 }}
                >
                  <Upload className="upload-icon" />
                </motion.div>
              )}
              <p className="upload-text">Drop or click to upload</p>
              <p className="upload-description">{description}</p>
            </motion.div>
          ) : (
            // Filled State
            <motion.div
              key="filled"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="upload-filled"
            >
              <img src={image.url} alt={label} />

              {/* Success Badge with Animation */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{
                  type: "spring",
                  stiffness: 400,
                  damping: 15,
                  delay: 0.2,
                }}
                className="upload-success-badge"
              >
                <Check size={12} />
              </motion.div>

              {/* Remove Button */}
              {onRemove && (
                <button onClick={handleRemove} className="upload-remove">
                  <X size={16} />
                </button>
              )}

              {/* Hover Overlay with Replace */}
              <div className="upload-zone__preview-overlay">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleReplace}
                  className="h-8 px-3 bg-white/10 hover:bg-white/20 text-white border-0"
                >
                  <Replace className="w-3.5 h-3.5 mr-1.5" />
                  Replace
                </Button>
                {onRemove && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleRemove}
                    className="h-8 px-3 bg-red-500/20 hover:bg-red-500/30 text-red-400 border-0"
                  >
                    <X className="w-3.5 h-3.5 mr-1.5" />
                    Remove
                  </Button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Animated Glow Border on Drag */}
        <AnimatePresence>
          {isDragging && (
            <motion.div
              className="upload-glow-border"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
          )}
        </AnimatePresence>
      </div>

      <p className="upload-zone-help">{description}</p>
    </motion.div>
  );
}
