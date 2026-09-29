/**
 * Video — Madison Studio's image-to-video surface.
 * Dark Room tokens and panels; Higgsfield-style layout; Freepik-backed.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import { ImageLibraryModal } from "@/components/image-editor/ImageLibraryModal";
import {
  VideoControlRail,
  VideoHistoryStrip,
  VideoMonitor,
  VideoStudioHeader,
} from "@/components/video-studio";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentOrganizationId } from "@/hooks/useIndustryConfig";
import { useOrgStudioImages, useOrgStudioVideos, type OrgStudioVideo } from "@/hooks/useOrgStudioMedia";
import { supabase } from "@/integrations/supabase/client";
import { getSupabaseFunctionErrorMessage } from "@/lib/imageGenerationEdgeSafety";
import {
  VIDEO_STUDIO_MODELS,
  buildVideoGenerationRequest,
  estimateVideoCredits,
  mapVideoJobStatus,
  parseVideoStudioHandoff,
  videoModelSupportsEndFrame,
  type VideoJobStatus,
  type VideoStudioMotion,
} from "@/lib/videoStudio";
import "@/styles/darkroom.css";
import "@/styles/video-studio.css";

type FrameSlot = "start" | "end";

interface FrameValue {
  url: string;
  id?: string;
}

const POLL_MS = 3000;
const POLL_ATTEMPTS = 80;

function ledFromJob(job: VideoJobStatus) {
  if (job.state === "failed") return "error" as const;
  if (job.state === "queued" || job.state === "processing") return "processing" as const;
  if (job.state === "complete") return "ready" as const;
  return "off" as const;
}

export default function VideoStudio() {
  const location = useLocation();
  const { user } = useAuth();
  const { orgId } = useCurrentOrganizationId();

  const [prompt, setPrompt] = useState("");
  const [startFrame, setStartFrame] = useState<FrameValue | null>(null);
  const [endFrame, setEndFrame] = useState<FrameValue | null>(null);
  const [model, setModel] = useState(VIDEO_STUDIO_MODELS[0].id);
  const [duration, setDuration] = useState("5");
  const [resolution, setResolution] = useState("720p");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [motion, setMotion] = useState<VideoStudioMotion>("zoom-in");
  const [includeAudio, setIncludeAudio] = useState(false);
  const [multiShot, setMultiShot] = useState(false);
  const [pickerSlot, setPickerSlot] = useState<FrameSlot | null>(null);

  const [job, setJob] = useState<VideoJobStatus>(mapVideoJobStatus(""));
  const [activeVideoUrl, setActiveVideoUrl] = useState<string | null>(null);
  const [activePosterUrl, setActivePosterUrl] = useState<string | null>(null);
  const [selectedTakeId, setSelectedTakeId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const imagesQuery = useOrgStudioImages(orgId);
  const videosQuery = useOrgStudioVideos(orgId);

  useEffect(() => {
    const handoff = parseVideoStudioHandoff(location.state);
    if (!handoff) return;
    setStartFrame({ url: handoff.imageUrl, id: handoff.imageId });
    if (handoff.prompt) setPrompt(handoff.prompt);
    setActivePosterUrl(handoff.imageUrl);
    toast.success("Start frame loaded from Dark Room");
  }, [location.state]);

  useEffect(() => {
    const selected = VIDEO_STUDIO_MODELS.find((item) => item.id === model);
    if (selected && !selected.resolutions.includes(resolution as never)) {
      setResolution(selected.resolutions[0]);
    }
    if (!videoModelSupportsEndFrame(model)) {
      setEndFrame(null);
    }
  }, [model, resolution]);

  const libraryImages = useMemo(
    () =>
      (imagesQuery.data ?? []).map((image) => ({
        id: image.id,
        url: image.url,
        name: image.name,
        prompt: image.prompt,
        timestamp: Date.parse(image.createdAt),
      })),
    [imagesQuery.data],
  );

  const canGenerate = Boolean(prompt.trim() && user?.id && orgId && !isGenerating);
  const estimate = estimateVideoCredits({ model, duration, resolution, includeAudio });

  const applyTake = useCallback((video: OrgStudioVideo) => {
    setSelectedTakeId(video.id);
    setActiveVideoUrl(video.videoUrl);
    setActivePosterUrl(video.posterUrl);
    if (video.prompt) setPrompt(video.prompt);
    if (video.aspectRatio) setAspectRatio(video.aspectRatio);
    setJob(
      mapVideoJobStatus(
        video.status === "complete" ? "COMPLETED" : video.status === "failed" ? "FAILED" : "PENDING",
        video.status === "failed" ? "This take did not finish." : undefined,
      ),
    );
  }, []);

  const persistVideoUrl = useCallback(
    async (savedVideoId: string, videoUrl: string) => {
      if (!orgId) return;
      const { error } = await supabase
        .from("generated_images")
        .update({
          video_url: videoUrl,
          description: "Video complete",
        })
        .eq("id", savedVideoId)
        .eq("organization_id", orgId);
      if (error) {
        console.error("[VideoStudio] failed to persist video url", error);
      }
    },
    [orgId],
  );

  const persistFailure = useCallback(
    async (savedVideoId: string | undefined, message: string) => {
      if (!orgId || !savedVideoId) return;
      await supabase
        .from("generated_images")
        .update({
          description: `Video failed: ${message}`.slice(0, 180),
        })
        .eq("id", savedVideoId)
        .eq("organization_id", orgId);
    },
    [orgId],
  );

  const pollUntilDone = useCallback(
    async (taskId: string, usedModel: string, usedResolution: string) => {
      for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
        const { data, error } = await supabase.functions.invoke("generate-madison-video", {
          body: {
            action: "status",
            taskId,
            model: usedModel,
            resolution: usedResolution,
            organizationId: orgId,
            userId: user?.id,
          },
        });

        if (error) {
          throw new Error(await getSupabaseFunctionErrorMessage(error) || "Status check failed");
        }

        const mapped = mapVideoJobStatus(data?.status, data?.error);
        setJob(mapped);

        if (mapped.state === "complete" && data?.videoUrl) {
          return data.videoUrl as string;
        }
        if (mapped.state === "failed") {
          throw new Error(mapped.message);
        }

        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      }
      throw new Error("Timed out waiting for Freepik. The take is still listed if it finishes later.");
    },
    [orgId, user?.id],
  );

  const handleGenerate = useCallback(async () => {
    if (!user?.id || !orgId) {
      setJob(mapVideoJobStatus("FAILED", "Sign in to an organization before generating."));
      toast.error("Organization required");
      return;
    }

    let request;
    try {
      request = buildVideoGenerationRequest({
        prompt,
        userId: user.id,
        organizationId: orgId,
        imageUrl: startFrame?.url,
        imageId: startFrame?.id,
        endImageUrl: endFrame?.url,
        model,
        duration,
        resolution,
        aspectRatio,
        motion,
        includeAudio,
        multiShot,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid video request";
      setJob(mapVideoJobStatus("FAILED", message));
      toast.error(message);
      return;
    }

    setIsGenerating(true);
    setActiveVideoUrl(null);
    setActivePosterUrl(startFrame?.url ?? null);
    setJob(mapVideoJobStatus("PENDING", `${estimate.label} · sending to Freepik`));

    try {
      const { data, error } = await supabase.functions.invoke("generate-madison-video", {
        body: request,
      });

      if (error) {
        const message = await getSupabaseFunctionErrorMessage(error) || "Video generation failed";
        setJob(mapVideoJobStatus("FAILED", message));
        await persistFailure(undefined, message);
        toast.error(message);
        return;
      }

      if (data?.error) {
        setJob(mapVideoJobStatus("FAILED", data.error));
        toast.error(data.error);
        return;
      }

      const taskId = data?.taskId as string | undefined;
      const savedVideoId = data?.savedVideoId as string | undefined;
      const usedModel = (data?.model as string | undefined) ?? request.model;
      setSelectedTakeId(savedVideoId ?? null);
      setJob(mapVideoJobStatus("IN_PROGRESS", `Task ${taskId ?? "pending"}`));

      if (!taskId) {
        throw new Error("No Freepik task id returned. Nothing is rendering.");
      }

      try {
        const videoUrl = await pollUntilDone(taskId, usedModel, request.resolution);
        setActiveVideoUrl(videoUrl);
        setJob(mapVideoJobStatus("COMPLETED"));
        if (savedVideoId) {
          await persistVideoUrl(savedVideoId, videoUrl);
        }
        await videosQuery.refetch();
        toast.success("Take ready");
      } catch (pollError) {
        const message = pollError instanceof Error ? pollError.message : "Video generation failed";
        await persistFailure(savedVideoId, message);
        throw pollError;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Video generation failed";
      setJob(mapVideoJobStatus("FAILED", message));
      toast.error(message);
    } finally {
      setIsGenerating(false);
    }
  }, [
    aspectRatio,
    duration,
    endFrame?.url,
    estimate.label,
    includeAudio,
    model,
    motion,
    multiShot,
    orgId,
    persistFailure,
    persistVideoUrl,
    pollUntilDone,
    prompt,
    resolution,
    startFrame?.id,
    startFrame?.url,
    user?.id,
    videosQuery,
  ]);

  const handlePickFrame = useCallback(
    async (image: { url: string; file?: File; name?: string }) => {
      let url = image.url;
      let id = libraryImages.find((item) => item.url === image.url)?.id;

      if (image.file && orgId) {
        const path = `${orgId}/video-frames/${crypto.randomUUID()}-${image.file.name.replace(/[^\w.-]+/g, "-")}`;
        const { error } = await supabase.storage.from("generated-images").upload(path, image.file);
        if (error) {
          toast.error("Could not upload that frame to this organization");
          return;
        }
        const { data } = supabase.storage.from("generated-images").getPublicUrl(path);
        url = data.publicUrl;
      }

      const frame = { url, id };
      if (pickerSlot === "end") {
        setEndFrame(frame);
      } else {
        setStartFrame(frame);
        setActivePosterUrl(url);
      }
      setPickerSlot(null);
    },
    [libraryImages, orgId, pickerSlot],
  );

  const handleDownload = useCallback(() => {
    if (!activeVideoUrl) return;
    const link = document.createElement("a");
    link.href = activeVideoUrl;
    link.download = "madison-video.mp4";
    link.rel = "noopener";
    link.target = "_blank";
    link.click();
  }, [activeVideoUrl]);

  if (!orgId) {
    return (
      <div className="video-studio">
        <VideoStudioHeader ledState="error" jobLabel="No org" canDownload={false} />
        <section className="video-studio__stage">
          <div className="video-studio__card" data-ratio="16:9">
            <div className="video-studio-empty">
              <h2>Organization required</h2>
              <p>Video is org-scoped. Finish onboarding or switch workspace before generating.</p>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="video-studio">
      <VideoStudioHeader
        ledState={ledFromJob(job)}
        jobLabel={job.state === "idle" ? "Standby" : job.state}
        canDownload={Boolean(activeVideoUrl)}
        onDownload={handleDownload}
      />

      <VideoControlRail
        prompt={prompt}
        onPromptChange={setPrompt}
        startFrame={startFrame}
        endFrame={endFrame}
        onPickStart={() => setPickerSlot("start")}
        onPickEnd={() => setPickerSlot("end")}
        onClearStart={() => {
          setStartFrame(null);
          if (!activeVideoUrl) setActivePosterUrl(null);
        }}
        onClearEnd={() => setEndFrame(null)}
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
        isGenerating={isGenerating}
        canGenerate={canGenerate}
        onGenerate={handleGenerate}
      />

      <VideoMonitor
        videoUrl={activeVideoUrl}
        posterUrl={activePosterUrl}
        aspectRatio={aspectRatio}
        job={job}
      />

      <VideoHistoryStrip
        videos={videosQuery.data ?? []}
        selectedId={selectedTakeId}
        onSelect={applyTake}
        estimateLabel={estimate.label}
        canGenerate={canGenerate}
        isGenerating={isGenerating}
        onGenerate={handleGenerate}
      />

      <ImageLibraryModal
        open={pickerSlot !== null}
        onOpenChange={(open) => {
          if (!open) setPickerSlot(null);
        }}
        onSelectImage={handlePickFrame}
        libraryImages={libraryImages}
        title={pickerSlot === "end" ? "End frame" : "Start frame"}
        disableRemoteFetch
        allowDesktopUpload
      />
    </div>
  );
}
