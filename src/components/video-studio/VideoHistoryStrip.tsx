import type { OrgStudioVideo } from "@/hooks/useOrgStudioMedia";

interface VideoHistoryStripProps {
  videos: OrgStudioVideo[];
  selectedId: string | null;
  onSelect: (video: OrgStudioVideo) => void;
}

export function VideoHistoryStrip({
  videos,
  selectedId,
  onSelect,
}: VideoHistoryStripProps) {
  return (
    <aside className="video-studio-history">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--darkroom-text-muted)]">
          Takes
        </span>
        <span className="font-mono text-[10px] text-[var(--darkroom-text-dim)]">
          {videos.length} in this org
        </span>
      </div>
      {videos.length === 0 ? (
        <p className="text-[12px] text-[var(--darkroom-text-dim)]">
          Completed and in-progress takes for this organization appear here.
        </p>
      ) : (
        <div className="video-studio-history__list">
          {videos.map((video) => (
            <button
              key={video.id}
              type="button"
              className="video-studio-take"
              data-active={video.id === selectedId}
              onClick={() => onSelect(video)}
            >
              <div className="video-studio-take__thumb">
                {video.videoUrl ? (
                  <video src={video.videoUrl} muted playsInline />
                ) : video.posterUrl ? (
                  <img src={video.posterUrl} alt="" />
                ) : null}
              </div>
              <div className="video-studio-take__meta">
                {video.status === "complete" ? "Ready" : video.status === "failed" ? "Failed" : "Pending"}
                {video.duration ? ` · ${video.duration}s` : ""}
              </div>
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}
