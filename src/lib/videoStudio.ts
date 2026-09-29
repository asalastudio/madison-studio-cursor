/**
 * Video studio contract.
 *
 * The UI may only offer models and fields that `generate-madison-video`
 * actually forwards to Freepik. Google Veo ids exist in VIDEO_MODELS but
 * `getVideoEndpoint` remaps them to Kling — they are not surfaced here.
 */

export const VIDEO_STUDIO_DURATIONS = ["4", "5", "6", "8", "10"] as const;
export type VideoStudioDuration = (typeof VIDEO_STUDIO_DURATIONS)[number];

export const VIDEO_STUDIO_RESOLUTIONS = ["480p", "720p", "768p", "1080p"] as const;
export type VideoStudioResolution = (typeof VIDEO_STUDIO_RESOLUTIONS)[number];

export const VIDEO_STUDIO_ASPECT_RATIOS = [
  { id: "16:9", name: "Landscape", hint: "YouTube, web" },
  { id: "9:16", name: "Portrait", hint: "Reels, Stories" },
  { id: "1:1", name: "Square", hint: "Feed" },
  { id: "4:5", name: "Social post", hint: "Instagram" },
  { id: "21:9", name: "Film", hint: "Cinematic" },
] as const;
export type VideoStudioAspectRatio = (typeof VIDEO_STUDIO_ASPECT_RATIOS)[number]["id"];

export const VIDEO_STUDIO_MOTIONS = [
  { id: "static", label: "Locked off", prompt: "Steady locked-off camera, no pan or zoom." },
  { id: "zoom-in", label: "Push in", prompt: "Smooth cinematic push-in, building focus." },
  { id: "zoom-out", label: "Pull out", prompt: "Gentle pull-out revealing the full frame." },
  { id: "pan-left", label: "Pan left", prompt: "Slow pan from right to left across the scene." },
  { id: "pan-right", label: "Pan right", prompt: "Slow pan from left to right across the scene." },
  { id: "orbit", label: "Orbit", prompt: "Soft orbital move circling the subject." },
] as const;
export type VideoStudioMotion = (typeof VIDEO_STUDIO_MOTIONS)[number]["id"];

export type VideoStudioModelId =
  | "auto"
  | "kling-o1"
  | "kling-2.1"
  | "kling-2.1-master"
  | "kling-2.5"
  | "minimax-hailuo-2.3"
  | "seedance-pro";

export interface VideoStudioModel {
  id: VideoStudioModelId;
  name: string;
  description: string;
  /** Real Freepik image-to-video endpoint this id maps to. */
  freepikEndpoint: string;
  supportsEndFrame: boolean;
  supportsAudio: boolean;
  supportsMultiShot: boolean;
  supportsCameraFixed: boolean;
  resolutions: readonly VideoStudioResolution[];
}

/**
 * Only models whose Freepik mapping is a real, distinct endpoint.
 * Veo ids remap to Kling and are omitted on purpose.
 */
export const VIDEO_STUDIO_MODELS: readonly VideoStudioModel[] = [
  {
    id: "auto",
    name: "Auto",
    description: "Kling 2.0 — default balance of speed and quality",
    freepikEndpoint: "kling-v2",
    supportsEndFrame: false,
    supportsAudio: false,
    supportsMultiShot: true,
    supportsCameraFixed: true,
    resolutions: ["480p", "720p", "1080p"],
  },
  {
    id: "kling-o1",
    name: "Kling O1",
    description: "Start/end frames and optional audio",
    freepikEndpoint: "kling-pro",
    supportsEndFrame: true,
    supportsAudio: true,
    supportsMultiShot: false,
    supportsCameraFixed: true,
    resolutions: ["720p", "1080p"],
  },
  {
    id: "kling-2.1",
    name: "Kling 2.1",
    description: "Efficient image-to-video with start/end frames",
    freepikEndpoint: "kling-v2-1-std",
    supportsEndFrame: true,
    supportsAudio: false,
    supportsMultiShot: false,
    supportsCameraFixed: true,
    resolutions: ["720p", "1080p"],
  },
  {
    id: "kling-2.1-master",
    name: "Kling 2.1 Master",
    description: "Stronger motion and prompt adherence",
    freepikEndpoint: "kling-v2-1-master",
    supportsEndFrame: false,
    supportsAudio: false,
    supportsMultiShot: false,
    supportsCameraFixed: true,
    resolutions: ["1080p"],
  },
  {
    id: "kling-2.5",
    name: "Kling 2.5",
    description: "Richer lighting and more accurate motion",
    freepikEndpoint: "kling-v2-5-pro",
    supportsEndFrame: false,
    supportsAudio: false,
    supportsMultiShot: false,
    supportsCameraFixed: true,
    resolutions: ["720p", "1080p"],
  },
  {
    id: "minimax-hailuo-2.3",
    name: "MiniMax Hailuo 2.3",
    description: "Cinematic realism from a still",
    freepikEndpoint: "minimax-hailuo-02-768p",
    supportsEndFrame: false,
    supportsAudio: false,
    supportsMultiShot: false,
    supportsCameraFixed: false,
    resolutions: ["768p", "1080p"],
  },
  {
    id: "seedance-pro",
    name: "Seedance Pro",
    description: "Freepik native model",
    freepikEndpoint: "seedance-pro-720p",
    supportsEndFrame: false,
    supportsAudio: false,
    supportsMultiShot: false,
    supportsCameraFixed: true,
    resolutions: ["720p", "1080p"],
  },
] as const;

const MODEL_IDS = new Set<string>(VIDEO_STUDIO_MODELS.map((model) => model.id));

export function isVideoStudioModelId(value: string): value is VideoStudioModelId {
  return MODEL_IDS.has(value);
}

export function getVideoStudioModel(id: string): VideoStudioModel | undefined {
  return VIDEO_STUDIO_MODELS.find((model) => model.id === id);
}

export function videoModelSupportsEndFrame(id: string): boolean {
  return getVideoStudioModel(id)?.supportsEndFrame === true;
}

export function videoModelSupportsAudio(id: string): boolean {
  return getVideoStudioModel(id)?.supportsAudio === true;
}

export function videoModelSupportsMultiShot(id: string): boolean {
  return getVideoStudioModel(id)?.supportsMultiShot === true;
}

export interface VideoMotionPromptInput {
  prompt: string;
  motion?: VideoStudioMotion;
  cameraFixed?: boolean;
}

export function buildVideoMotionPrompt(input: VideoMotionPromptInput): string {
  const base = input.prompt.trim();
  const motion = VIDEO_STUDIO_MOTIONS.find((item) => item.id === input.motion)
    ?? VIDEO_STUDIO_MOTIONS[0];
  const locked = input.cameraFixed || motion.id === "static";

  const parts = [base];
  if (locked) {
    if (!/fixed camera|locked-off|static/i.test(base)) {
      parts.push("Steady locked-off camera, no pan or zoom.");
    }
  } else if (!/camera|pan|zoom|orbit/i.test(base)) {
    parts.push(motion.prompt);
  }

  if (!/light/i.test(base)) {
    parts.push("Natural, even lighting.");
  }

  return parts.filter(Boolean).join(" ");
}

export interface VideoGenerationDraft {
  prompt: string;
  userId: string;
  organizationId: string;
  imageUrl?: string | null;
  imageId?: string | null;
  endImageUrl?: string | null;
  model?: string;
  duration?: string;
  resolution?: string;
  aspectRatio?: string;
  motion?: VideoStudioMotion;
  cameraFixed?: boolean;
  includeAudio?: boolean;
  multiShot?: boolean;
}

export interface VideoGenerationRequest {
  action: "create";
  prompt: string;
  userId: string;
  organizationId: string;
  model: VideoStudioModelId;
  duration: VideoStudioDuration;
  resolution: VideoStudioResolution;
  aspectRatio: VideoStudioAspectRatio;
  cameraFixed: boolean;
  includeAudio: boolean;
  multiShot: boolean;
  imageUrl?: string;
  imageId?: string;
  endImageUrl?: string;
}

function asDuration(value: string | undefined): VideoStudioDuration {
  return VIDEO_STUDIO_DURATIONS.includes(value as VideoStudioDuration)
    ? (value as VideoStudioDuration)
    : "5";
}

function asResolution(value: string | undefined, model: VideoStudioModel): VideoStudioResolution {
  if (VIDEO_STUDIO_RESOLUTIONS.includes(value as VideoStudioResolution)) {
    const resolution = value as VideoStudioResolution;
    if (model.resolutions.includes(resolution)) return resolution;
  }
  return model.resolutions[0] ?? "720p";
}

function asAspectRatio(value: string | undefined): VideoStudioAspectRatio {
  return VIDEO_STUDIO_ASPECT_RATIOS.some((ratio) => ratio.id === value)
    ? (value as VideoStudioAspectRatio)
    : "16:9";
}

export function buildVideoGenerationRequest(draft: VideoGenerationDraft): VideoGenerationRequest {
  const organizationId = draft.organizationId.trim();
  if (!organizationId) {
    throw new Error("Organization id is required to generate video.");
  }
  if (!draft.prompt.trim()) {
    throw new Error("A prompt is required to generate video.");
  }

  const model = getVideoStudioModel(draft.model ?? "") ?? VIDEO_STUDIO_MODELS[0];
  const motion = draft.motion ?? (draft.cameraFixed ? "static" : "zoom-in");
  const cameraFixed = draft.cameraFixed ?? motion === "static";

  const request: VideoGenerationRequest = {
    action: "create",
    prompt: buildVideoMotionPrompt({
      prompt: draft.prompt,
      motion,
      cameraFixed,
    }),
    userId: draft.userId,
    organizationId,
    model: model.id,
    duration: asDuration(draft.duration),
    resolution: asResolution(draft.resolution, model),
    aspectRatio: asAspectRatio(draft.aspectRatio),
    cameraFixed,
    includeAudio: model.supportsAudio && draft.includeAudio === true,
    multiShot: model.supportsMultiShot && draft.multiShot === true,
  };

  if (draft.imageUrl) {
    request.imageUrl = draft.imageUrl;
  }
  if (draft.imageId) {
    request.imageId = draft.imageId;
  }
  if (model.supportsEndFrame && draft.endImageUrl) {
    request.endImageUrl = draft.endImageUrl;
  }

  return request;
}

export interface VideoCreditEstimate {
  credits: number;
  label: string;
  isEstimate: boolean;
  breakdown: string[];
}

const DURATION_WEIGHT: Record<VideoStudioDuration, number> = {
  "4": 8,
  "5": 10,
  "6": 12,
  "8": 16,
  "10": 20,
};

const RESOLUTION_WEIGHT: Record<VideoStudioResolution, number> = {
  "480p": 0.7,
  "720p": 1,
  "768p": 1.1,
  "1080p": 1.6,
};

const MODEL_WEIGHT: Record<VideoStudioModelId, number> = {
  auto: 1,
  "kling-2.1": 1,
  "seedance-pro": 1.1,
  "minimax-hailuo-2.3": 1.3,
  "kling-2.1-master": 1.4,
  "kling-2.5": 1.5,
  "kling-o1": 1.6,
};

export function estimateVideoCredits(input: {
  model: string;
  duration: string;
  resolution: string;
  includeAudio?: boolean;
}): VideoCreditEstimate {
  const model = getVideoStudioModel(input.model) ?? VIDEO_STUDIO_MODELS[0];
  const duration = asDuration(input.duration);
  const resolution = asResolution(input.resolution, model);
  const audio = model.supportsAudio && input.includeAudio === true;

  const durationCredits = DURATION_WEIGHT[duration];
  const credits = Math.round(
    durationCredits * RESOLUTION_WEIGHT[resolution] * MODEL_WEIGHT[model.id] + (audio ? 4 : 0),
  );

  const breakdown = [
    `${duration}s duration · ${durationCredits} base`,
    `${resolution} · ×${RESOLUTION_WEIGHT[resolution]}`,
    `${model.name} · ×${MODEL_WEIGHT[model.id]}`,
  ];
  if (audio) breakdown.push("Audio · +4");

  return {
    credits,
    label: `Estimated ${credits} credits`,
    isEstimate: true,
    breakdown,
  };
}

export type VideoJobState = "idle" | "queued" | "processing" | "complete" | "failed";

export interface VideoJobStatus {
  state: VideoJobState;
  progress: number;
  message: string;
}

export function mapVideoJobStatus(status: string | null | undefined, detail?: string): VideoJobStatus {
  const raw = (status ?? "").trim();
  const key = raw.toUpperCase();

  if (!raw) {
    return { state: "idle", progress: 0, message: "Ready" };
  }

  if (key === "PENDING" || key === "CREATED" || key === "QUEUED") {
    return { state: "queued", progress: 12, message: detail || "Queued at Freepik" };
  }

  if (key === "IN_PROGRESS" || key === "PROCESSING" || key === "RUNNING") {
    return { state: "processing", progress: 55, message: detail || "Rendering" };
  }

  if (key === "COMPLETED" || key === "COMPLETE" || key === "SUCCESS") {
    return { state: "complete", progress: 100, message: detail || "Ready" };
  }

  if (key === "FAILED" || key === "ERROR" || key === "CANCELLED" || key === "CANCELED") {
    return { state: "failed", progress: 0, message: detail || raw || "Generation failed" };
  }

  return {
    state: "failed",
    progress: 0,
    message: detail || `Unexpected status: ${raw}`,
  };
}

export interface OrgScopedMediaQuery {
  organizationId: string;
  mediaType: "image" | "video";
  userIdFallback: false;
}

export function buildOrgScopedMediaQuery(input: {
  organizationId: string;
  mediaType: "image" | "video";
}): OrgScopedMediaQuery {
  const organizationId = input.organizationId.trim();
  if (!organizationId) {
    throw new Error("Organization id is required to load studio media.");
  }
  return {
    organizationId,
    mediaType: input.mediaType,
    userIdFallback: false,
  };
}

export function assertOrgScopedVideoHistoryQuery(query: {
  organizationId?: string;
  mediaType?: string;
  userIdFallback?: boolean;
}): boolean {
  return Boolean(
    query.organizationId &&
      query.mediaType === "video" &&
      query.userIdFallback === false,
  );
}

export interface VideoStudioHandoff {
  imageUrl: string;
  imageId?: string;
  prompt?: string;
}

export function parseVideoStudioHandoff(state: unknown): VideoStudioHandoff | null {
  if (!state || typeof state !== "object") return null;
  const starting = (state as { startingImage?: unknown }).startingImage;
  if (!starting || typeof starting !== "object") return null;
  const image = starting as { url?: unknown; id?: unknown; prompt?: unknown };
  if (typeof image.url !== "string" || !image.url.trim()) return null;
  return {
    imageUrl: image.url,
    imageId: typeof image.id === "string" ? image.id : undefined,
    prompt: typeof image.prompt === "string" ? image.prompt : undefined,
  };
}
