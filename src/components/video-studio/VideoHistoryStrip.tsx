import { Clapperboard } from "lucide-react";
import { Chip } from "@/components/darkroom/Chip";
import type { OrgStudioVideo } from "@/hooks/useOrgStudioMedia";

interface VideoHistoryStripProps {
  videos: OrgStudioVideo[];
  selectedId: string | null;
  onSelect: (video: OrgStudioVideo) => void;
  estimateLabel?: string;
  canGenerate?: boolean;
  isGenerating?: boolean;
  onGenerate?: () => void;
}

function takeLabel(video: OrgStudioVideo): string {
  if (video.status === "complete") return "Ready";
  if (video.status === "failed") return "Failed";
  if (video.status === "processing") return "Rendering";
  return "Queued";
}

export function VideoHistoryStrip({
  videos,
  selectedId,
  onSelect,
  estimateLabel,
  canGenerate,
  isGenerating,
  onGenerate,
}: VideoHistoryStripProps) {
  return (
    <div className="video-studio__toolbar" role="toolbar" aria-label="Takes">
      {videos.length === 0 ? (
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--darkroom-text-dim)]">
          No takes in this org yet
        </span>
      ) : (
        <div className="video-studio__takes">
          {videos.map((video) => (
            <button
              key={video.id}
              type="button"
              className="video-studio-take"
              data-active={video.id === selectedId}
              onClick={() => onSelect(video)}
            >
              <span className="video-studio-take__thumb">
                {video.videoUrl ? (
                  <video src={video.videoUrl} muted playsInline />
                ) : video.posterUrl ? (
                  <img src={video.posterUrl} alt="" />
                ) : null}
              </span>
              <span>
                {takeLabel(video)}
                {video.duration ? ` · ${video.duration}s` : ""}
              </span>
            </button>
          ))}
        </div>
      )}

      {onGenerate ? (
        <>
          <span className="video-studio__toolbar-divider" aria-hidden="true" />
          {estimateLabel ? (
            <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--darkroom-text-dim)]">
              {estimateLabel}
            </span>
          ) : null}
          <Chip
            label={isGenerating ? "Rendering…" : "Action"}
            icon={<Clapperboard />}
            disabled={!canGenerate || isGenerating}
            onClick={onGenerate}
          />
        </>
      ) : null}
    </div>
  );
}
