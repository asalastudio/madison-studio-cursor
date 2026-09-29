import { Film } from "lucide-react";
import { Chip } from "@/components/darkroom/Chip";
import type { VideoJobStatus } from "@/lib/videoStudio";

interface VideoMonitorProps {
  videoUrl?: string | null;
  posterUrl?: string | null;
  aspectRatio: string;
  job: VideoJobStatus;
  onRetry?: () => void;
}

export function VideoMonitor({
  videoUrl,
  posterUrl,
  aspectRatio,
  job,
  onRetry,
}: VideoMonitorProps) {
  const showProgress = job.state === "queued" || job.state === "processing";
  const showFailure = job.state === "failed";

  return (
    <section className="video-studio__stage" aria-label="Preview">
      <div className="video-studio__card" data-ratio={aspectRatio}>
        {videoUrl ? (
          <video
            key={videoUrl}
            src={videoUrl}
            poster={posterUrl ?? undefined}
            controls
            autoPlay
            loop
            playsInline
          />
        ) : posterUrl ? (
          <img src={posterUrl} alt="Start frame" />
        ) : (
          <div className="video-studio-empty">
            <Film className="h-8 w-8 text-[var(--darkroom-accent)]" />
            <h2>Set the shot</h2>
            <p>
              Write a prompt, optionally pick a start frame from the Image Library
              or Dark Room, then press Action. Failures stay on this monitor.
            </p>
          </div>
        )}

        {showProgress ? (
          <div className="video-studio-job" data-state={job.state} role="status">
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.08em]">
              <span className="text-[var(--led-active)]">
                {job.state === "queued" ? "Queued" : "Rendering"}
              </span>
              <span className="text-[var(--darkroom-text-dim)]">{job.progress}%</span>
            </div>
            <div className="video-studio-job__bar">
              <span style={{ width: `${job.progress}%` }} />
            </div>
            <p className="text-[11px] text-[var(--darkroom-text)]">{job.message}</p>
          </div>
        ) : null}

        {showFailure ? (
          <div className="video-studio-job video-studio-job--failure" data-state="failed" role="alert">
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--led-error)]">
              Failed
            </span>
            <p className="text-[13px] text-[var(--darkroom-text)]">{job.message}</p>
            {onRetry ? (
              <Chip label="Retry" onClick={onRetry} />
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
