import { z } from "zod";

export const CandidateProviderSchema = z.enum(["blender", "openai", "google", "manual"]);
export const CandidateProviderModels = {
  blender: ["cyl9-rollon-blender-v1"],
  openai: ["gpt-image-2.5-sunburst", "gpt-image-2.5-flare", "gpt-image-2"],
  google: ["gemini-3.1-flash-image", "gemini-3-pro-image"],
  manual: ["manual-v1"],
} as const;
export const CandidateJobStatusSchema = z.enum([
  "queued",
  "running",
  "clamping",
  "qa",
  "candidate_ready",
  "failed",
  "cancelled",
]);

const SHA256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const RelativeObjectPathSchema = z.string().min(1).superRefine((value, context) => {
  if (
    value.startsWith("/")
    || value.includes("\\")
    || value.split("/").includes("..")
    || /^[a-z][a-z0-9+.-]*:\/\//i.test(value)
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Asset path must be relative and URL-free." });
  }
});

export const PrivateAssetRefSchema = z.object({
  bucket: z.enum(["paper-doll-sources", "paper-doll-candidates", "paper-doll-approved"]),
  path: RelativeObjectPathSchema,
  sha256: SHA256Schema,
  contentType: z.string().min(1),
  byteSize: z.number().int().positive(),
}).superRefine((value, context) => {
  const filename = value.path.split("/").at(-1);
  if (!filename?.startsWith(`${value.sha256}.`)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Asset filename must be content-addressed." });
  }
});

export const OriginalFilenameSchema = z.string()
  .min(1)
  .max(255)
  .refine((name) => Array.from(name).every((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint > 31 && codePoint !== 127;
  }), {
    message: "Filename contains control characters.",
  });

export const ManualCandidateAssetRefSchema = PrivateAssetRefSchema.and(z.object({
  originalFilename: OriginalFilenameSchema,
}));

const HistoricalManualCandidateAssetRefSchema = PrivateAssetRefSchema.and(z.object({
  originalFilename: OriginalFilenameSchema.optional(),
}));

const CandidateTransformSchema = z.object({
  translateXPx: z.number().int().min(-2080).max(2080),
  translateYPx: z.number().int().min(-2288).max(2288),
  scaleX: z.number().positive().min(0.1).max(10),
  scaleY: z.number().positive().min(0.1).max(10),
}).refine(({ scaleX, scaleY }) => scaleX === scaleY, {
  message: "Asymmetric stretching is prohibited.",
  path: ["scaleY"],
});

export const CandidateJobRequestSchema = z.object({
  organizationId: z.string().uuid(),
  requirementKey: z.string().regex(/^CYL-9ML:(BODY|OVERCAP|ROLLER):/),
  componentId: z.string().uuid(),
  parentComponentVersionId: z.string().uuid(),
  parentSha256: SHA256Schema,
  provider: CandidateProviderSchema,
  model: z.string().trim().min(1),
  instruction: z.string().trim().min(1).max(12_000),
  source: PrivateAssetRefSchema,
  authoritativeMask: PrivateAssetRefSchema,
  editMask: PrivateAssetRefSchema,
  assemblyContext: PrivateAssetRefSchema.optional(),
  manualOutput: ManualCandidateAssetRefSchema.optional(),
  transform: CandidateTransformSchema,
  selectionKind: z.enum(["whole-layer", "rectangle", "brush"]).default("whole-layer"),
}).superRefine((value, context) => {
  if (!(CandidateProviderModels[value.provider] as readonly string[]).includes(value.model)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["model"],
      message: `Model ${value.model} is not allowed for ${value.provider}; no fallback will run.`,
    });
  }
  if (
    value.requirementKey.startsWith("CYL-9ML:OVERCAP:")
    && /\b(aluminium|aluminum|anodised|anodized|brushed|machined)\b/i.test(value.instruction)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["instruction"],
      message: "Overcap instructions must describe moulded phenolic plastic and may not use metal-part fabrication language.",
    });
  }
  for (const [field, asset] of [
    ["source", value.source],
    ["authoritativeMask", value.authoritativeMask],
    ["editMask", value.editMask],
    ["assemblyContext", value.assemblyContext],
    ["manualOutput", value.manualOutput],
  ] as const) {
    if (asset && asset.path.split("/", 1)[0] !== value.organizationId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field, "path"],
        message: "Asset organization must match the job organization.",
      });
    }
  }
  if (value.provider === "manual" && !value.manualOutput) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["manualOutput"], message: "Manual jobs require an immutable manualOutput." });
  }
  if (value.provider !== "manual" && value.manualOutput) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["manualOutput"], message: "manualOutput is only valid for the manual provider." });
  }
});

export const CandidateJobRecordSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  requirementKey: z.string().min(1),
  componentId: z.string().uuid(),
  parentComponentVersionId: z.string().uuid(),
  parentSha256: SHA256Schema,
  provider: CandidateProviderSchema,
  model: z.string().min(1),
  status: CandidateJobStatusSchema,
  promptSha256: SHA256Schema,
  generationAttemptId: z.string().uuid().nullable(),
  candidateComponentVersionId: z.string().uuid().nullable(),
  manualOutput: HistoricalManualCandidateAssetRefSchema.nullable(),
  output: PrivateAssetRefSchema.nullable(),
  outputMetadata: z.record(z.string(), z.unknown()),
  initiatedBy: z.string().uuid(),
  errorMessage: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
});

export const CandidateApprovalRequestSchema = z.object({
  organizationId: z.string().uuid(),
  candidateComponentVersionId: z.string().uuid(),
  expectedCandidateSha256: SHA256Schema,
  decision: z.enum(["approved", "rejected"]),
  approverDisplayName: z.string().trim().min(1).max(200),
  evidenceIds: z.array(z.string().uuid()).min(1),
});

export type CandidateProvider = z.infer<typeof CandidateProviderSchema>;
export type PrivateAssetRef = z.infer<typeof PrivateAssetRefSchema>;
export type ManualCandidateAssetRef = z.infer<typeof ManualCandidateAssetRefSchema>;
export type CandidateJobRequest = z.infer<typeof CandidateJobRequestSchema>;
export type CandidateJobRecord = z.infer<typeof CandidateJobRecordSchema>;
export type CandidateApprovalRequest = z.infer<typeof CandidateApprovalRequestSchema>;
