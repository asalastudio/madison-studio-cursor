export const PAPER_DOLL_PROVIDER_MODELS = {
  blender: ["cyl9-rollon-blender-v1"],
  openai: ["gpt-image-2.5-sunburst", "gpt-image-2.5-flare", "gpt-image-2"],
  google: ["gemini-3.1-flash-image", "gemini-3-pro-image"],
  manual: ["manual-v1"],
} as const;

export type PaperDollProvider = keyof typeof PAPER_DOLL_PROVIDER_MODELS;
export type PaperDollAssetBucket =
  | "paper-doll-sources"
  | "paper-doll-candidates"
  | "paper-doll-approved";

export interface PaperDollPrivateAssetRef {
  bucket: PaperDollAssetBucket;
  path: string;
  sha256: string;
  contentType: string;
  byteSize: number;
}

export interface PaperDollManualAssetRef extends PaperDollPrivateAssetRef {
  originalFilename: string;
}

export interface PaperDollCandidateRequest {
  organizationId: string;
  requirementKey: string;
  componentId: string;
  parentComponentVersionId: string;
  parentSha256: string;
  provider: PaperDollProvider;
  model: string;
  instruction: string;
  source: PaperDollPrivateAssetRef;
  authoritativeMask: PaperDollPrivateAssetRef;
  editMask: PaperDollPrivateAssetRef;
  assemblyContext?: PaperDollPrivateAssetRef;
  manualOutput?: PaperDollManualAssetRef;
  transform: { translateXPx: number; translateYPx: number; scaleX: number; scaleY: number };
  selectionKind: "whole-layer" | "rectangle" | "brush";
}

export interface ProviderReference {
  role: "source" | "authoritative-mask" | "edit-mask" | "assembly-context";
  data: string;
  mimeType: string;
}

export interface ProviderDispatch {
  provider: "openai" | "google";
  model: string;
  endpoint: "images/edits" | "interactions";
  fallback: null;
  orderedInputs: Array<
    | { type: "image"; role: ProviderReference["role"]; data: string; mimeType: string }
    | { type: "text"; text: string }
  >;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const BUCKETS = new Set<PaperDollAssetBucket>([
  "paper-doll-sources",
  "paper-doll-candidates",
  "paper-doll-approved",
]);

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  return value.trim();
}

function uuid(value: unknown, label: string): string {
  const parsed = string(value, label);
  if (!UUID.test(parsed)) throw new Error(`${label} must be a UUID.`);
  return parsed;
}

function sha(value: unknown, label: string): string {
  const parsed = string(value, label);
  if (!SHA256.test(parsed)) throw new Error(`${label} must be a lowercase SHA-256 digest.`);
  return parsed;
}

function originalFilename(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 255) {
    throw new Error(`${label} must be between 1 and 255 characters.`);
  }
  if (/[\u0000-\u001f\u007f]/.test(value)) throw new Error(`${label} contains control characters.`);
  return value;
}

function asset(value: unknown, label: string, organizationId: string): PaperDollPrivateAssetRef {
  const parsed = record(value, label);
  const bucket = string(parsed.bucket, `${label}.bucket`) as PaperDollAssetBucket;
  if (!BUCKETS.has(bucket)) throw new Error(`${label}.bucket is unsupported.`);
  const path = string(parsed.path, `${label}.path`);
  const digest = sha(parsed.sha256, `${label}.sha256`);
  const byteSize = parsed.byteSize;
  if (
    path.startsWith("/")
    || path.includes("\\")
    || path.split("/").includes("..")
    || /^[a-z][a-z0-9+.-]*:\/\//i.test(path)
  ) throw new Error(`${label}.path must be relative and URL-free.`);
  if (path.split("/", 1)[0] !== organizationId) throw new Error(`${label} organization does not match the job.`);
  if (!path.split("/").at(-1)?.startsWith(`${digest}.`)) throw new Error(`${label}.path is not content-addressed.`);
  if (!Number.isSafeInteger(byteSize) || (byteSize as number) <= 0) throw new Error(`${label}.byteSize must be positive.`);
  return {
    bucket,
    path,
    sha256: digest,
    contentType: string(parsed.contentType, `${label}.contentType`),
    byteSize: byteSize as number,
  };
}

function manualAsset(value: unknown, label: string, organizationId: string): PaperDollManualAssetRef {
  const parsed = record(value, label);
  return {
    ...asset(parsed, label, organizationId),
    originalFilename: originalFilename(parsed.originalFilename, `${label}.originalFilename`),
  };
}

export function assertProviderModel(provider: string, model: string): asserts provider is PaperDollProvider {
  if (!(provider in PAPER_DOLL_PROVIDER_MODELS)) throw new Error(`Provider ${provider || "(empty)"} is not allowed.`);
  const models = PAPER_DOLL_PROVIDER_MODELS[provider as PaperDollProvider] as readonly string[];
  if (!models.includes(model)) throw new Error(`Model ${model || "(empty)"} is not allowed for ${provider}; no fallback will run.`);
}

export function parsePaperDollCandidateRequest(value: unknown): PaperDollCandidateRequest {
  const raw = record(value, "Candidate request");
  const organizationId = uuid(raw.organizationId, "organizationId");
  const provider = string(raw.provider, "provider");
  const model = string(raw.model, "model");
  assertProviderModel(provider, model);
  const instruction = string(raw.instruction, "instruction");
  if (instruction.length > 12_000) throw new Error("instruction exceeds 12,000 characters.");
  const requirementKey = string(raw.requirementKey, "requirementKey");
  if (!/^CYL-9ML:(BODY|OVERCAP|ROLLER):/.test(requirementKey)) throw new Error("requirementKey is outside CYL-9ML scope.");
  if (
    requirementKey.startsWith("CYL-9ML:OVERCAP:")
    && /\b(aluminium|aluminum|anodised|anodized|brushed|machined)\b/i.test(instruction)
  ) {
    throw new Error("Overcap instructions must describe moulded phenolic plastic and may not use metal-part fabrication language.");
  }
  const transform = record(raw.transform, "transform");
  const translateXPx = transform.translateXPx;
  const translateYPx = transform.translateYPx;
  const scaleX = transform.scaleX;
  const scaleY = transform.scaleY;
  if (![translateXPx, translateYPx, scaleX, scaleY].every((number) => typeof number === "number" && Number.isFinite(number))) {
    throw new Error("transform values must be finite numbers.");
  }
  if (!Number.isInteger(translateXPx) || !Number.isInteger(translateYPx)) throw new Error("transform translation must use integer pixels.");
  if ((scaleX as number) <= 0 || scaleX !== scaleY) throw new Error("Asymmetric stretching is prohibited.");
  const selectionKind = raw.selectionKind ?? "whole-layer";
  if (!(["whole-layer", "rectangle", "brush"] as unknown[]).includes(selectionKind)) {
    throw new Error("selectionKind is unsupported.");
  }
  const manualOutput = raw.manualOutput == null
    ? undefined
    : manualAsset(raw.manualOutput, "manualOutput", organizationId);
  if (provider === "manual" && !manualOutput) throw new Error("manualOutput is required for manual jobs.");
  if (provider !== "manual" && manualOutput) throw new Error("manualOutput is only valid for manual jobs.");
  return {
    organizationId,
    requirementKey,
    componentId: uuid(raw.componentId, "componentId"),
    parentComponentVersionId: uuid(raw.parentComponentVersionId, "parentComponentVersionId"),
    parentSha256: sha(raw.parentSha256, "parentSha256"),
    provider,
    model,
    instruction,
    source: asset(raw.source, "source", organizationId),
    authoritativeMask: asset(raw.authoritativeMask, "authoritativeMask", organizationId),
    editMask: asset(raw.editMask, "editMask", organizationId),
    assemblyContext: raw.assemblyContext == null
      ? undefined
      : asset(raw.assemblyContext, "assemblyContext", organizationId),
    manualOutput,
    transform: {
      translateXPx: translateXPx as number,
      translateYPx: translateYPx as number,
      scaleX: scaleX as number,
      scaleY: scaleY as number,
    },
    selectionKind: selectionKind as PaperDollCandidateRequest["selectionKind"],
  };
}

export function buildProviderDispatch(input: {
  provider: string;
  model: string;
  instruction: string;
  references: ProviderReference[];
}): ProviderDispatch {
  assertProviderModel(input.provider, input.model);
  if (input.provider !== "openai" && input.provider !== "google") {
    throw new Error(`${input.provider} does not use a network provider dispatch.`);
  }
  if (input.references.length === 0) throw new Error("Provider dispatch requires at least one reference image.");
  return {
    provider: input.provider,
    model: input.model,
    endpoint: input.provider === "openai" ? "images/edits" : "interactions",
    fallback: null,
    orderedInputs: [
      ...input.references.map((reference) => ({
        type: "image" as const,
        role: reference.role,
        data: reference.data,
        mimeType: reference.mimeType,
      })),
      { type: "text" as const, text: input.instruction },
    ],
  };
}
