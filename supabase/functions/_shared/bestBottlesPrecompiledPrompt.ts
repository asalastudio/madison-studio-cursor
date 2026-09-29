export interface BestBottlesPrecompiledPromptResolutionOptions {
  isBestBottlesStudioMasterRequest: boolean;
  family?: string | null;
  bottleCollection?: string | null;
}

export interface BestBottlesPrecompiledPromptResolution {
  prompt: string | null;
  error: string | null;
  sku: string | null;
  referenceImagePath: string | null;
  qaChecklist: string[];
  promptVersion: string | null;
  shadowOwner: string | null;
  shadowContract: string | null;
  shadowTopology: string | null;
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function readStringArray(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function errorResult(message: string): BestBottlesPrecompiledPromptResolution {
  return {
    prompt: null,
    error: message,
    sku: null,
    referenceImagePath: null,
    qaChecklist: [],
    promptVersion: null,
    shadowOwner: null,
    shadowContract: null,
    shadowTopology: null,
  };
}

const LEGACY_PDP_MASTER_PREFIX = "REFERENCE-LOCKED BEST BOTTLES PDP MASTER";
const CATALOG_CANON_PREFIXES = [
  "You are ENHANCING an existing product reference photograph",
  "You are enhancing the attached product reference image",
];
const CATALOG_CANON_PROMPT_FLAGS = new Set([
  "catalog_canon_v1_prompt",
  "catalog_canon_v1_1_draft_prompt",
  "catalog_canon_v2_prompt",
  "catalog_canon_v3_prompt",
]);

export const BEST_BOTTLES_STUDIO_DIRECTION_V2 = `STUDIO DIRECTION:
Strict studio-direction refinement for restrained premium ecommerce photography:
Use the restrained studio product-photography sensibility associated with Kinfolk and Aesop only as a mood reference: quiet premium lighting, clean restraint, and a subtle dimensional contact shadow.
This is not lifestyle photography. Do not add props, labels, packaging, typography, scenes, brand marks, retail environments, Aesop-style product design, or any brand-specific asset.
The catalog contract remains absolute: preserve the exact 2080x2288 canvas, product fill-height target, shared baseline, centerline, crop, product scale, detached-cap sidecar position, geometry, color, material, and component placement.
Shadow direction may become slightly more dimensional and premium, but it must remain one realistic contact-only shadow under the bottle base and any detached cap. No floor plane, reflection, hard cast shadow, smear, horizon, vignette, or background texture.
Preserve the photographed surface texture, translucency, edge density, tonal variation, highlights, and imperfections of every cap, actuator, collar, fitment, and detached sidecar exactly as shown in the Product Reference. Studio direction may change only the illumination falling on those components, never their material finish or surface character.
The attached Product Reference remains the source of truth. Changes are limited to scene lighting, the specified glass treatment, the flat Bone background, and contact shadow realism.`;

export const BEST_BOTTLES_FINAL_V2_STUDIO_CHECK = `FINAL V2 STUDIO CHECK:
This v2 studio direction is the final controlling instruction for visual style and finish. Do not apply any older Best Bottles parchment, darkroom, paper-doll, visual-squad, generic ecommerce, or post-generation prompt language after this point.
Only the reference identity lock, essential material truth, and resolved Madison framing contract are allowed to constrain it.
Respect the resolved family framing measurements while making the photograph feel like the approved v2 studio direction.`;

const DEPRECATED_CANON_BLOCK_HEADERS = [
  "STUDIO DIRECTION:",
  "BACKGROUND AND COMPOSITION:",
  "SHADOW:",
  "MATERIAL ACCURACY:",
  "QUALITY TARGET:",
  "NEGATIVE CONSTRAINTS:",
  "FINAL CHECK BEFORE OUTPUT:",
  "FINAL V2 STUDIO CHECK:",
];

const FRAMING_PROFILE_PATTERN =
  /(?:^|\n)[A-Z0-9][^\n]* FRAMING PROFILE \(CANVAS COMPOSITION AUTHORITY\):/;

function isAcceptedPromptPrefix(prompt: string, qaChecklist: string[]): boolean {
  if (prompt.startsWith(LEGACY_PDP_MASTER_PREFIX)) return true;
  return CATALOG_CANON_PREFIXES.some((prefix) => prompt.startsWith(prefix)) &&
    qaChecklist.some((item) => CATALOG_CANON_PROMPT_FLAGS.has(item));
}

function hasBestBottlesStudioDirection(prompt: string): boolean {
  return (
    prompt.includes("Strict studio-direction refinement") &&
    prompt.includes("Kinfolk") &&
    prompt.includes("Aesop") &&
    prompt.includes("fill-height target") &&
    prompt.includes("contact-only")
  );
}

function findFirstBlockIndex(prompt: string, headers: string[]): number {
  const indices = headers
    .map((header) => prompt.indexOf(header))
    .filter((index) => index >= 0);
  if (indices.length === 0) return -1;
  return Math.min(...indices);
}

function findFramingProfileIndex(prompt: string): number {
  const match = prompt.match(FRAMING_PROFILE_PATTERN);
  if (!match || match.index == null) return -1;
  return match[0].startsWith("\n") ? match.index + 1 : match.index;
}

function extractFramingProfile(prompt: string): string | null {
  const start = findFramingProfileIndex(prompt);
  if (start < 0) return null;

  const nextControlIndex = findFirstBlockIndex(
    prompt.slice(start + 1),
    DEPRECATED_CANON_BLOCK_HEADERS,
  );
  const end = nextControlIndex < 0 ? prompt.length : start + 1 + nextControlIndex;
  return prompt.slice(start, end).trim();
}

export function replaceBestBottlesPrecompiledFramingProfile(
  prompt: string,
  authoritativeCanvasLines: readonly string[],
): string {
  const start = findFramingProfileIndex(prompt);
  if (start < 0 || authoritativeCanvasLines.length === 0) return prompt;

  const remaining = prompt.slice(start + 1);
  const nextBlockIndex = findFirstBlockIndex(remaining, [
    "GROUNDING SHADOW — MODEL OWNED:",
    ...DEPRECATED_CANON_BLOCK_HEADERS,
  ]);
  const end =
    nextBlockIndex < 0 ? prompt.length : start + 1 + nextBlockIndex;
  const replacement = [
    "CANVAS AND COMPOSITION — SCALE-CARD AUTHORITY:",
    ...authoritativeCanvasLines,
  ].join("\n");

  return [
    prompt.slice(0, start).trimEnd(),
    replacement,
    prompt.slice(end).trimStart(),
  ]
    .filter((part) => part.length > 0)
    .join("\n\n");
}

export function ensureBestBottlesStudioDirection(prompt: string): string {
  const framingProfile = extractFramingProfile(prompt);
  const framingIndex = findFramingProfileIndex(prompt);
  const firstDeprecatedBlockIndex = findFirstBlockIndex(prompt, DEPRECATED_CANON_BLOCK_HEADERS);
  const baseEndCandidates = [framingIndex, firstDeprecatedBlockIndex].filter((index) => index >= 0);
  const baseEnd = baseEndCandidates.length > 0 ? Math.min(...baseEndCandidates) : prompt.length;
  const basePrompt = prompt.slice(0, baseEnd).trimEnd();

  const finalPrompt = [
    basePrompt,
    framingProfile,
    BEST_BOTTLES_STUDIO_DIRECTION_V2,
    BEST_BOTTLES_FINAL_V2_STUDIO_CHECK,
  ]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join("\n\n");

  return hasBestBottlesStudioDirection(finalPrompt) ? finalPrompt : prompt;
}

export function resolveBestBottlesPrecompiledPrompt(
  input: unknown,
  options: BestBottlesPrecompiledPromptResolutionOptions,
): BestBottlesPrecompiledPromptResolution {
  if (input == null) {
    return {
      prompt: null,
      error: null,
      sku: null,
      referenceImagePath: null,
      qaChecklist: [],
      promptVersion: null,
      shadowOwner: null,
      shadowContract: null,
      shadowTopology: null,
    };
  }
  if (!options.isBestBottlesStudioMasterRequest) {
    return errorResult("Precompiled prompts are only supported for Best Bottles Studio masters.");
  }
  if (typeof input !== "object" || Array.isArray(input)) {
    return errorResult("Precompiled prompt record must be an object.");
  }

  const record = input as Record<string, unknown>;
  const prompt = readString(record, "final_prompt");
  const sku = readString(record, "sku");
  const referenceImagePath = readString(record, "reference_image_path");
  const qaChecklist = readStringArray(record, "qa_checklist");
  const promptVersion = readString(record, "prompt_version") || null;
  const shadowOwner = readString(record, "shadow_owner") || null;
  const productFamily = readString(record, "product_family");
  const normalizedFamily = String(
    options.family || options.bottleCollection || productFamily,
  )
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const isCylinder = normalizedFamily === "cylinder" || normalizedFamily === "tall cylinder";
  const nonBottleFamilies = new Set([
    "cap closure", "cap component", "dropper", "gift bag", "gift box",
    "lotion pump", "packaging supply", "roll on cap", "sprayer", "tool", "unknown",
  ]);
  const isBottleFamily = normalizedFamily.length > 0 && !nonBottleFamilies.has(normalizedFamily);
  const shadowContractTag = qaChecklist.find((tag) => tag.startsWith("shadow-contract:"));
  const shadowContract = shadowContractTag?.slice("shadow-contract:".length) || null;
  const topologyTags = qaChecklist.filter((tag) => tag.startsWith("shadow-topology:"));
  const shadowTopology = topologyTags[0]?.slice("shadow-topology:".length) || null;
  const componentTopologyTags = qaChecklist.filter((tag) =>
    tag.startsWith("component-topology:")
  );
  const componentTopology = componentTopologyTags[0]
    ?.slice("component-topology:".length) || null;

  if (!sku) return errorResult("Precompiled prompt record is missing sku.");
  if (!referenceImagePath) return errorResult(`Precompiled prompt record for ${sku} is missing reference_image_path.`);
  if (qaChecklist.length === 0) return errorResult(`Precompiled prompt record for ${sku} is missing qa_checklist.`);
  if (!prompt) return errorResult(`Precompiled prompt record for ${sku} is missing final_prompt.`);
  if (!isAcceptedPromptPrefix(prompt, qaChecklist)) {
    return errorResult(`Precompiled prompt record for ${sku} is missing the PDP master header or catalog canon marker.`);
  }
  if (prompt.length < 500) {
    return errorResult(`Precompiled prompt record for ${sku} is too short to be the compiled PDP prompt.`);
  }

  if (promptVersion === "best-bottles-reference-locked-v6.1-shadow-smoke") {
    return errorResult(`Historical V6.1 smoke lineage is not valid for new generation (${sku}).`);
  }

  if (isBottleFamily && (promptVersion != null || shadowOwner != null)) {
    if (promptVersion !== "best-bottles-reference-locked-v6.1") {
      return errorResult(`Best Bottles family ${normalizedFamily} ${sku} requires canonical V6.1 prompt lineage.`);
    }
    if (shadowOwner !== "model") {
      return errorResult(`Best Bottles family ${normalizedFamily} ${sku} requires model-owned shadow authority.`);
    }
    if (
      !qaChecklist.includes("prompt-version:best-bottles-reference-locked-v6.1") ||
      !qaChecklist.includes("shadow-owner:model") ||
      !qaChecklist.includes("shadow-contract:contact-back-right-v1") ||
      !qaChecklist.includes("shadow-rollout:all-bottle-families")
    ) {
      return errorResult(`Model-owned shadow for ${sku} is missing policy QA lineage.`);
    }
    if (
      !qaChecklist.includes("scale-contract:best-bottles-catalog-scale-v1") ||
      !qaChecklist.some((tag) => tag.startsWith("scale-global-target:")) ||
      !qaChecklist.some((tag) => tag.startsWith("scale-family-correction:")) ||
      !qaChecklist.some((tag) => tag.startsWith("scale-assembled-target:"))
    ) {
      return errorResult(`Global catalog scale for ${sku} is missing policy QA lineage.`);
    }
    if (
      topologyTags.length !== 1 ||
      !["assembled", "detached-sidecar", "complex-contact"].includes(
        shadowTopology ?? "",
      )
    ) {
      return errorResult(`Cylinder ${sku} is missing valid shadow topology lineage.`);
    }
    const expectedShadowTopologyByComponent: Record<string, string> = {
      assembled: "assembled",
      "fitment-attached-cap-right-sidecar": "detached-sidecar",
      "assembled-live-site-exception": "complex-contact",
      "assembled-closure-live-site-exception": "assembled",
    };
    if (
      componentTopologyTags.length !== 1
      || !componentTopology
      || !(componentTopology in expectedShadowTopologyByComponent)
    ) {
      return errorResult(`Cylinder ${sku} is missing valid component topology lineage.`);
    }
    if (expectedShadowTopologyByComponent[componentTopology] !== shadowTopology) {
      return errorResult(
        `Cylinder ${sku} component topology ${componentTopology} conflicts with shadow topology ${shadowTopology}.`,
      );
    }
    const blockCount = (prompt.match(/GROUNDING SHADOW — MODEL OWNED:/g) ?? []).length;
    const mixedAuthority = /deterministic post-processing responsibilities|Madison applies both deterministically after generation/i.test(prompt);
    if (blockCount !== 1 || mixedAuthority) {
      return errorResult(`Model-owned shadow for ${sku} has conflicting shadow ownership.`);
    }
  } else if (shadowOwner === "model") {
    return errorResult(`Model-owned shadow is only valid for bottle-family context (${sku}).`);
  }

  const resolvedPrompt = shadowOwner === "model"
    ? prompt
    : qaChecklist.includes("catalog_canon_v3_prompt")
      ? ensureBestBottlesStudioDirection(prompt)
      : prompt;

  if (isBottleFamily && shadowOwner === "model") {
    console.info("[best-bottles-precompiled-prompt] Best Bottles V6.1 policy", {
      sku,
      promptVersion,
      shadowOwner,
      shadowContract,
      shadowTopology,
    });
  }

  return {
    prompt: resolvedPrompt,
    error: null,
    sku,
    referenceImagePath,
    qaChecklist,
    promptVersion,
    shadowOwner,
    shadowContract,
    shadowTopology,
  };
}
