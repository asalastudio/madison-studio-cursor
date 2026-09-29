import { Clapperboard, Film, Ratio, Timer } from "lucide-react";
import { Chip, ChipRow } from "@/components/darkroom/Chip";
import { CameraPanelHeader, LEDIndicator } from "@/components/darkroom/LEDIndicator";
import { VideoFrameSlot } from "./VideoFrameSlot";
import {
  VIDEO_STUDIO_ASPECT_RATIOS,
  VIDEO_STUDIO_DURATIONS,
  VIDEO_STUDIO_MODELS,
  VIDEO_STUDIO_MOTIONS,
  VIDEO_STUDIO_RESOLUTIONS,
  estimateVideoCredits,
  videoModelSupportsAudio,
  videoModelSupportsEndFrame,
  videoModelSupportsMultiShot,
  type VideoStudioMotion,
} from "@/lib/videoStudio";

interface FrameValue {
  url: string;
  id?: string;
}

interface VideoControlRailProps {
  prompt: string;
  onPromptChange: (value: string) => void;
  startFrame: FrameValue | null;
  endFrame: FrameValue | null;
  onPickStart: () => void;
  onPickEnd: () => void;
  onClearStart: () => void;
  onClearEnd: () => void;
  model: string;
  onModelChange: (value: typeof VIDEO_STUDIO_MODELS[number]["id"]) => void;
  duration: string;
  onDurationChange: (value: string) => void;
  resolution: string;
  onResolutionChange: (value: string) => void;
  aspectRatio: string;
  onAspectRatioChange: (value: string) => void;
  motion: VideoStudioMotion;
  onMotionChange: (value: VideoStudioMotion) => void;
  includeAudio: boolean;
  onIncludeAudioChange: (value: boolean) => void;
  multiShot: boolean;
  onMultiShotChange: (value: boolean) => void;
  isGenerating: boolean;
  canGenerate: boolean;
  onGenerate: () => void;
}

export function VideoControlRail({
  prompt,
  onPromptChange,
  startFrame,
  endFrame,
  onPickStart,
  onPickEnd,
  onClearStart,
  onClearEnd,
  model,
  onModelChange,
  duration,
  onDurationChange,
  resolution,
  onResolutionChange,
  aspectRatio,
  onAspectRatioChange,
  motion,
  onMotionChange,
  includeAudio,
  onIncludeAudioChange,
  multiShot,
  onMultiShotChange,
  isGenerating,
  canGenerate,
  onGenerate,
}: VideoControlRailProps) {
  const selectedModel = VIDEO_STUDIO_MODELS.find((item) => item.id === model) ?? VIDEO_STUDIO_MODELS[0];
  const showEnd = videoModelSupportsEndFrame(model);
  const showAudio = videoModelSupportsAudio(model);
  const showMulti = videoModelSupportsMultiShot(model);
  const estimate = estimateVideoCredits({
    model,
    duration,
    resolution,
    includeAudio: showAudio && includeAudio,
  });
  const allowedResolutions = selectedModel.resolutions;
  const inspectorLed = isGenerating ? "processing" : canGenerate ? "ready" : "off";

  return (
    <aside className="video-studio__inspector" aria-label="Shot inspector">
      <div className={`camera-panel ${canGenerate || isGenerating ? "camera-panel--active" : ""}`}>
        <CameraPanelHeader title="Shot" ledState={inspectorLed} />
        <div className="video-studio__inspector-body">
          <div className="space-y-2">
            <div className="video-studio__section-label">Prompt</div>
            <textarea
              className="prompt-input prompt-input--tall"
              value={prompt}
              onChange={(event) => onPromptChange(event.target.value)}
              placeholder="Describe the shot — subject, motion, light."
              rows={5}
            />
          </div>

          <div className="space-y-2">
            <div className="video-studio__section-label">Frames</div>
            <VideoFrameSlot
              label="Start frame"
              hint="Library or Dark Room"
              imageUrl={startFrame?.url}
              onPick={onPickStart}
              onClear={startFrame ? onClearStart : undefined}
            />
            {showEnd ? (
              <VideoFrameSlot
                label="End frame"
                hint="Optional last frame"
                imageUrl={endFrame?.url}
                onPick={onPickEnd}
                onClear={endFrame ? onClearEnd : undefined}
              />
            ) : (
              <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--darkroom-text-dim)]">
                End frame is only sent for Kling O1 and Kling 2.1
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="video-studio__section-label">Model</div>
            <ChipRow>
              {VIDEO_STUDIO_MODELS.map((item) => (
                <Chip
                  key={item.id}
                  label={item.name}
                  title={item.description}
                  active={model === item.id}
                  onClick={() => onModelChange(item.id)}
                />
              ))}
            </ChipRow>
            <p className="text-[11px] text-[var(--darkroom-text-dim)]">{selectedModel.description}</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Timer className="h-3 w-3 text-[var(--darkroom-accent)]" />
              <span className="video-studio__section-label">Duration</span>
            </div>
            <ChipRow>
              {VIDEO_STUDIO_DURATIONS.map((value) => (
                <Chip
                  key={value}
                  label={`${value}s`}
                  active={duration === value}
                  onClick={() => onDurationChange(value)}
                />
              ))}
            </ChipRow>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Ratio className="h-3 w-3 text-[var(--darkroom-accent)]" />
              <span className="video-studio__section-label">Frame</span>
            </div>
            <ChipRow>
              {VIDEO_STUDIO_ASPECT_RATIOS.map((ratio) => (
                <Chip
                  key={ratio.id}
                  label={ratio.id}
                  title={ratio.hint}
                  active={aspectRatio === ratio.id}
                  onClick={() => onAspectRatioChange(ratio.id)}
                />
              ))}
            </ChipRow>
            <ChipRow>
              {VIDEO_STUDIO_RESOLUTIONS.filter((value) => allowedResolutions.includes(value)).map((value) => (
                <Chip
                  key={value}
                  label={value}
                  active={resolution === value}
                  onClick={() => onResolutionChange(value)}
                />
              ))}
            </ChipRow>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Film className="h-3 w-3 text-[var(--darkroom-accent)]" />
              <span className="video-studio__section-label">Camera</span>
            </div>
            <ChipRow>
              {VIDEO_STUDIO_MOTIONS.map((item) => (
                <Chip
                  key={item.id}
                  label={item.label}
                  title={item.prompt}
                  active={motion === item.id}
                  onClick={() => onMotionChange(item.id)}
                />
              ))}
            </ChipRow>
            <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--darkroom-text-dim)]">
              Motion is written into the prompt. Freepik only receives a locked-camera flag.
            </p>
          </div>

          {(showAudio || showMulti) && (
            <ChipRow>
              {showAudio ? (
                <Chip
                  label="Audio"
                  active={includeAudio}
                  onClick={() => onIncludeAudioChange(!includeAudio)}
                />
              ) : null}
              {showMulti ? (
                <Chip
                  label="Multi-shot"
                  active={multiShot}
                  onClick={() => onMultiShotChange(!multiShot)}
                />
              ) : null}
            </ChipRow>
          )}

          <div className="video-studio-cost" data-estimate="true">
            <div className="flex items-center justify-between">
              <span>{estimate.label}</span>
              <span>{duration}s · {resolution}</span>
            </div>
            <ul className="mt-1 space-y-0.5 text-[var(--darkroom-text-dim)]">
              {estimate.breakdown.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>

          <div className="generate-button-container">
            <div className="mb-3 flex items-center justify-center gap-3">
              <LEDIndicator state={isGenerating ? "processing" : canGenerate ? "ready" : "off"} />
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--darkroom-text-dim)]">
                {isGenerating ? "Rolling" : canGenerate ? "Ready" : "Standby"}
              </span>
            </div>
            <button
              type="button"
              className={`generate-button ${isGenerating ? "generate-button--generating" : ""}`}
              onClick={onGenerate}
              disabled={!canGenerate || isGenerating}
            >
              <span className="button-content">
                <Clapperboard size={18} />
                <span>{isGenerating ? "Rendering…" : "Action"}</span>
              </span>
            </button>
            {!prompt.trim() ? (
              <p className="generate-tip">Write a prompt to roll a take.</p>
            ) : null}
          </div>
        </div>
      </div>
    </aside>
  );
}
