import { Film } from "lucide-react";
import type { VideoJobStatus } from "@/lib/videoStudio";

interface VideoMonitorProps {
  videoUrl?: string | null;
  posterUrl?: string | null;
  aspectRatio: string;
  job: VideoJobStatus;
}

export function VideoMonitor({
  videoUrl,
  posterUrl,
  aspectRatio,
  job,
}: VideoMonitorProps) {
  const showJob = job.state === "queued" || job.state === "processing" || job.state === "failed";

  return (
    <section className="video-studio-monitor center-canvas">
      <div className="center-canvas__viewport video-studio-player">
        <div className="video-studio-frame" data-ratio={aspectRatio}>
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

          {showJob ? (
            <div className="video-studio-job" data-state={job.state} role="status">
              <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.08em]">
                <span className={job.state === "failed" ? "text-[var(--led-error)]" : "text-[var(--led-active)]"}>
                  {job.state === "failed" ? "Failed" : job.state === "queued" ? "Queued" : "Rendering"}
                </span>
                <span className="text-[var(--darkroom-text-dim)]">{job.progress}%</span>
              </div>
              <div className="video-studio-job__bar">
                <span style={{ width: `${job.progress}%` }} />
              </div>
              <p className="text-[11px] text-[var(--darkroom-text)]">{job.message}</p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
