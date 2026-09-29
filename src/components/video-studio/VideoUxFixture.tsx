import { useMemo, useState } from "react";
import { MemoryRouter } from "react-router-dom";
import type { OrgStudioVideo } from "@/hooks/useOrgStudioMedia";
import {
  VIDEO_STUDIO_MODELS,
  estimateVideoCredits,
  mapVideoJobStatus,
  type VideoStudioMotion,
} from "@/lib/videoStudio";
import { VideoControlRail } from "./VideoControlRail";
import { VideoHistoryStrip } from "./VideoHistoryStrip";
import { VideoMonitor } from "./VideoMonitor";
import { VideoStudioHeader } from "./VideoStudioHeader";
import "@/styles/darkroom.css";
import "@/styles/video-studio.css";

const FIXTURE_POSTER =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">
      <rect fill="#0a0a0a" width="640" height="360"/>
      <rect x="250" y="90" width="140" height="180" rx="18" fill="#1a1816" stroke="#B8956A" stroke-width="2"/>
      <text x="320" y="300" fill="#B8956A" font-family="Georgia" font-size="18" text-anchor="middle">Start frame</text>
    </svg>`,
  );

const FIXTURE_TAKES: OrgStudioVideo[] = [
  {
    id: "take-ready",
    posterUrl: FIXTURE_POSTER,
    videoUrl: null,
    prompt: "A ceramic mug turning on a sunlit table",
    duration: 5,
    aspectRatio: "16:9",
    model: "kling-2.5",
    status: "complete",
    createdAt: "2026-09-29T00:00:00.000Z",
  },
  {
    id: "take-failed",
    posterUrl: FIXTURE_POSTER,
    videoUrl: null,
    prompt: "Orbit the mug",
    duration: 5,
    aspectRatio: "16:9",
    model: "kling-2.5",
    status: "failed",
    createdAt: "2026-09-29T00:01:00.000Z",
  },
  {
    id: "take-queued",
    posterUrl: FIXTURE_POSTER,
    videoUrl: null,
    prompt: "Push in",
    duration: 8,
    aspectRatio: "16:9",
    model: "auto",
    status: "queued",
    createdAt: "2026-09-29T00:02:00.000Z",
  },
];

export function VideoUxFixture() {
  const [prompt, setPrompt] = useState("A ceramic mug turning on a sunlit table");
  const [model, setModel] = useState<(typeof VIDEO_STUDIO_MODELS)[number]["id"]>("kling-2.5");
  const [duration, setDuration] = useState("5");
  const [resolution, setResolution] = useState("720p");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [motion, setMotion] = useState<VideoStudioMotion>("orbit");
  const [includeAudio, setIncludeAudio] = useState(false);
  const [multiShot, setMultiShot] = useState(false);
  const [selectedTakeId, setSelectedTakeId] = useState("take-ready");

  const estimate = useMemo(
    () => estimateVideoCredits({ model, duration, resolution, includeAudio }),
    [duration, includeAudio, model, resolution],
  );

  return (
    <MemoryRouter>
      <div className="video-studio">
        <VideoStudioHeader ledState="ready" jobLabel="Standby" canDownload={false} />
        <VideoControlRail
          prompt={prompt}
          onPromptChange={setPrompt}
          startFrame={{ url: FIXTURE_POSTER, id: "frame-1" }}
          endFrame={null}
          onPickStart={() => undefined}
          onPickEnd={() => undefined}
          onClearStart={() => undefined}
          onClearEnd={() => undefined}
          model={model}
          onModelChange={setModel}
          duration={duration}
          onDurationChange={setDuration}
          resolution={resolution}
          onResolutionChange={setResolution}
          aspectRatio={aspectRatio}
          onAspectRatioChange={setAspectRatio}
          motion={motion}
          onMotionChange={setMotion}
          includeAudio={includeAudio}
          onIncludeAudioChange={setIncludeAudio}
          multiShot={multiShot}
          onMultiShotChange={setMultiShot}
          isGenerating={false}
          canGenerate={Boolean(prompt.trim())}
          onGenerate={() => undefined}
        />
        <VideoMonitor
          posterUrl={FIXTURE_POSTER}
          aspectRatio={aspectRatio}
          job={mapVideoJobStatus("")}
        />
        <VideoHistoryStrip
          videos={FIXTURE_TAKES}
          selectedId={selectedTakeId}
          onSelect={(video) => setSelectedTakeId(video.id)}
          estimateLabel={estimate.label}
          canGenerate={Boolean(prompt.trim())}
          isGenerating={false}
          onGenerate={() => undefined}
        />
      </div>
    </MemoryRouter>
  );
}
