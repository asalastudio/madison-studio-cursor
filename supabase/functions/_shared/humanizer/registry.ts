/**
 * Every text-model caller in the app is either wired through
 * humanizeGeneratedCopy or listed here with a reason. The registry test fails
 * when a new caller shows up unclassified.
 */

export interface ClassifiedPath {
  path: string;
  reason: string;
}

/** Model callers whose customer-facing copy is humanized before return or save. */
export const WIRED_GENERATION_PATHS = [
  "supabase/functions/generate-with-claude/index.ts",
  "supabase/functions/enhance-copy/index.ts",
  "supabase/functions/repurpose-content/index.ts",
  "supabase/functions/marketplace-assistant/index.ts",
  "supabase/functions/suggest-brand-knowledge/index.ts",
  "supabase/functions/think-mode-chat/index.ts",
  "src/lib/agents/generator.ts",
  "src/lib/agents/editor.ts",
  "src/src/lib/madisonLLM.ts",
] as const;

/** Saves or returns copy produced by the generators above. */
export const WIRED_SAVE_PATHS = [
  "src/lib/agents/pipeline.ts",
] as const;

/**
 * Model callers that are not customer copy. Humanizing them would corrupt
 * images, quotes, measurements, or placeholder syntax.
 */
export const UNWIRED_MODEL_PATHS: readonly ClassifiedPath[] = [
  {
    path: "supabase/functions/_shared/aiProviders.ts",
    reason: "Shared Claude/Gemini transport. The humanizer calls generateText from here. This file does not write customer copy.",
  },
  {
    path: "supabase/functions/_shared/geminiClient.ts",
    reason: "Gemini HTTP client. Copy paths call it and then humanizeGeneratedCopy. The client itself does not choose customer copy.",
  },
  {
    path: "supabase/functions/_shared/humanizer/humanize.ts",
    reason: "This is the humanizer step. It loads SKILL.md and rewrites copy; it is not a copy source.",
  },
  {
    path: "src/lib/humanizer/humanizeGeneratedCopy.ts",
    reason: "Client humanizer step. It loads the vendored SKILL.md and rewrites copy; it is not a copy source.",
  },
  {
    path: "supabase/functions/_shared/brandProfileInference.ts",
    reason: "Infers a structured profile from scraped site copy. Mission and tagline are the site's own words. A rewrite would replace them.",
  },
  {
    path: "supabase/functions/_shared/squadAssignment.ts",
    reason: "Assigns internal creative-squad labels from a brand analysis. The output is routing data, not a caption, description, or email.",
  },
  {
    path: "supabase/functions/_shared/visualAnalyzer.ts",
    reason: "Describes a reference image for the image pipeline (composition and lighting). It does not write customer copy.",
  },
  {
    path: "supabase/functions/add-text-to-image/index.ts",
    reason: "Renders text the user already supplied onto an image. The function does not invent the words.",
  },
  {
    path: "supabase/functions/analyze-amplify-fit/index.ts",
    reason: "Ranks which derivative formats fit a master. repurpose-content writes those derivatives and humanizes them.",
  },
  {
    path: "supabase/functions/analyze-brand-consistency/index.ts",
    reason: "Scores existing content against the brand voice. It critiques published work and does not return new copy.",
  },
  {
    path: "supabase/functions/analyze-brand-dna/index.ts",
    reason: "Extracts visual brand DNA as JSON (hex colors, font names, logo). A prose rewrite would corrupt those tokens.",
  },
  {
    path: "supabase/functions/analyze-brand-health/index.ts",
    reason: "Returns gap-analysis JSON (missing components and recommendations), not a caption, description, or email.",
  },
  {
    path: "supabase/functions/competitive-intelligence/index.ts",
    reason: "Stores research findings about competitors. Rewriting a finding would change the observation that was saved.",
  },
  {
    path: "supabase/functions/extract-brand-knowledge/index.ts",
    reason: "Extracts voice, vocabulary, and example sentences from a brand document. The examples have to stay quotes from the source.",
  },
  {
    path: "supabase/functions/generate-bestbottles-material-pilot/index.ts",
    reason: "Generates Best Bottles material-pilot product images. The output is a picture, not a caption, description, or email.",
  },
  {
    path: "supabase/functions/generate-image-with-nano/index.ts",
    reason: "Generates a product image with the Nano image model. The output is a picture, not a caption, description, or email.",
  },
  {
    path: "supabase/functions/generate-madison-image/index.ts",
    reason: "Generates Madison product images. The output is a picture, not a caption, description, or email.",
  },
  {
    path: "supabase/functions/generate-paper-doll-component/index.ts",
    reason: "Generates paper-doll component images. The output is a picture, not a caption, description, or email.",
  },
  {
    path: "supabase/functions/parse-content-worksheet/index.ts",
    reason: "Reads a photographed worksheet into form fields. It extracts; it does not write copy.",
  },
  {
    path: "supabase/functions/process-brand-document/index.ts",
    reason: "Transcribes an uploaded document. The output has to stay a verbatim extraction.",
  },
  {
    path: "supabase/functions/process-dam-asset/index.ts",
    reason: "Vision metadata for search (objects, hex colors, a one-line description of the file). A second pass cannot see the image, so it would drift from the file and change the embedding.",
  },
  {
    path: "supabase/functions/refine-prompt-template/index.ts",
    reason: "Builds reusable prompt templates with {{PLACEHOLDER}} tokens. Humanizing would break the placeholder syntax.",
  },
  {
    path: "supabase/functions/scan-brand-document/index.ts",
    reason: "Extracts existing quotes and guidelines from an uploaded PDF. Rewriting would replace the brand's own words.",
  },
  {
    path: "supabase/functions/scrape-brand-website/index.ts",
    reason: "Builds a strategic audit JSON from the live site. Rewriting would replace observed positioning with new prose.",
  },
  {
    path: "src/lib/agents/router.ts",
    reason: "Returns strategy JSON (squad, stage, constraints) for the writer. generator.ts and editor.ts humanize the copy.",
  },
  {
    path: "scripts/best-bottles/generate-cylinder-beauty-heroes.ts",
    reason: "Offline hero-image generation script, not customer copy.",
  },
  {
    path: "scripts/paper-doll/process-paper-doll-candidate.ts",
    reason: "Offline paper-doll image candidate script, not customer copy.",
  },
  {
    path: "scripts/paper-doll/regenerate-closures.ts",
    reason: "Offline closure-image generation script, not customer copy.",
  },
  {
    path: "scripts/prescreen-bestbottles-library-quality.ts",
    reason: "Scores library photographs. The chat call is image QA, not a caption, description, or email.",
  },
];

/**
 * Adjacent surfaces that do not call a text model. Listed so a later model
 * call in one of these files fails the registry until it is classified.
 */
export const NON_MODEL_PATHS: readonly ClassifiedPath[] = [
  {
    path: "supabase/functions/generate-label-text/index.ts",
    reason: "Assembles a regulatory cosmetic label (INCI order, allergen line, warnings) from supplied fields. Rewriting warning or ingredient text is unsafe.",
  },
  {
    path: "supabase/functions/generate-sds-document/index.ts",
    reason: "Assembles a safety data sheet from product and ingredient records. Safety language must not be rewritten.",
  },
  {
    path: "supabase/functions/generate-inci-list/index.ts",
    reason: "Formats ingredient nomenclature. INCI names are controlled terms, not prose.",
  },
  {
    path: "supabase/functions/detect-allergens/index.ts",
    reason: "Classifies allergens from ingredient data. It does not write customer copy.",
  },
  {
    path: "supabase/functions/suggest-scent-notes/index.ts",
    reason: "Looks up scent notes already stored in the catalog. It does not generate prose.",
  },
  {
    path: "supabase/functions/send-welcome-email/index.ts",
    reason: "Sends a fixed transactional template. It does not generate copy.",
  },
  {
    path: "supabase/functions/send-report-email/index.ts",
    reason: "Sends a fixed report notification. It does not generate copy.",
  },
  {
    path: "supabase/functions/send-team-invitation/index.ts",
    reason: "Sends a fixed invitation template. It does not generate copy.",
  },
  {
    path: "src/lib/agents/contentToVisualPrompts.ts",
    reason: "Asks generate-with-claude for image and video prompt JSON. It passes artifact visual-prompt so photography instructions are not rewritten.",
  },
];

export const MODEL_CALL_PATTERNS: readonly RegExp[] = [
  /generateGeminiContent\s*\(/,
  /messages\.create\s*\(/,
  /new GoogleGenerativeAI\s*\(/,
  /new Anthropic\s*\(/,
  /api\.anthropic\.com\/v1\/messages/,
  /api\.openai\.com\/v1\/chat\/completions/,
  /generativelanguage\.googleapis\.com/,
  /GEMINI_API_BASE/,
  /callGeminiImage\s*\(/,
  /callGeminiText\s*\(/,
  /generateText\s*\(/,
];
