import { Image as ImageIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface VideoFrameSlotProps {
  label: string;
  hint: string;
  imageUrl?: string | null;
  onPick: () => void;
  onClear?: () => void;
  disabled?: boolean;
}

export function VideoFrameSlot({
  label,
  hint,
  imageUrl,
  onPick,
  onClear,
  disabled = false,
}: VideoFrameSlotProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--darkroom-text-muted)]">
          {label}
        </span>
        {imageUrl && onClear ? (
          <button
            type="button"
            onClick={onClear}
            className="text-[var(--darkroom-text-dim)] transition-colors hover:text-[var(--darkroom-text)]"
            aria-label={`Clear ${label}`}
          >
            <X className="h-3 w-3" />
          </button>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onPick}
        disabled={disabled}
        className={cn(
          "video-studio-frame-slot flex w-full items-center justify-center transition-colors",
          "hover:border-[color-mix(in_srgb,var(--darkroom-accent)_40%,transparent)]",
          "disabled:cursor-not-allowed disabled:opacity-40",
        )}
      >
        {imageUrl ? (
          <img src={imageUrl} alt={label} />
        ) : (
          <span className="flex flex-col items-center gap-1 px-3 text-[var(--darkroom-text-dim)]">
            <ImageIcon className="h-4 w-4" />
            <span className="font-mono text-[9px] uppercase tracking-[0.08em]">{hint}</span>
          </span>
        )}
      </button>
    </div>
  );
}
