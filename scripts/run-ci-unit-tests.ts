#!/usr/bin/env tsx
/**
 * Shared test:ci unit list for the Create / Dark Room / dead-end-UI stack.
 *
 * Every branch in that stack must keep this file and the package.json `test:ci`
 * script byte-identical so they can land in order without re-conflicting
 * package.json. Files that are not on the current branch are skipped so a
 * branch can run the union list before the other PRs have landed.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

export const CI_UNIT_TEST_FILES = [
  "src/lib/storageThumbnails.test.ts",
  "src/lib/darkroomHeroSetPresets.test.ts",
  "src/lib/darkroomGenerationCanvas.test.ts",
  "supabase/functions/_shared/openaiImageSize.test.ts",
  "src/lib/darkroomLightingLane.test.ts",
  "src/lib/lightTableOutputRatio.test.ts",
  "src/lib/sanityPlacementUi.test.ts",
  "src/lib/repurposeBlogRequest.test.ts",
  "supabase/functions/_shared/sanityPlacement.test.ts",
  "supabase/functions/_shared/markdownToPortableText.test.ts",
  "supabase/functions/_shared/journalPost.test.ts",
  "supabase/functions/_shared/edgeAuth.test.ts",
  "supabase/functions/_shared/htmlEscape.test.ts",
  "supabase/functions/_shared/urlSafety.test.ts",
  "supabase/functions/_shared/literalReplace.test.ts",
  "supabase/functions/_shared/orgFeatures.test.ts",
  "supabase/functions/_shared/shopifyStore.test.ts",
  "supabase/functions/_shared/oauthState.test.ts",
  "supabase/functions/_shared/generateModePromptParts.test.ts",
  "supabase/functions/_shared/aiRequestUtils.test.ts",
  "supabase/functions/_shared/generateWithClaudeWiring.test.ts",
  "supabase/functions/_shared/resolveCopyProduct.test.ts",
  "src/lib/darkroomBackgroundVariation.test.ts",
  "src/lib/darkroomPromptDedup.test.ts",
  "src/lib/darkroomDebrand.test.ts",
  "supabase/functions/_shared/darkroomLegacyPrompt.test.ts",
] as const;

const existing = CI_UNIT_TEST_FILES.filter((path) => existsSync(path));
const missing = CI_UNIT_TEST_FILES.filter((path) => !existsSync(path));

if (existing.length === 0) {
  console.error("run-ci-unit-tests: no listed test files exist");
  process.exit(1);
}

if (missing.length > 0) {
  console.log(
    `run-ci-unit-tests: skipping ${missing.length} file(s) not on this branch:\n${missing.map((path) => `  ${path}`).join("\n")}`,
  );
}

const tsxBin = existsSync("node_modules/.bin/tsx")
  ? "node_modules/.bin/tsx"
  : "npx";
const tsxArgs =
  tsxBin === "npx" ? ["tsx", "--test", ...existing] : ["--test", ...existing];
const result = spawnSync(tsxBin, tsxArgs, {
  stdio: "inherit",
  env: process.env,
});

process.exit(result.status === null ? 1 : result.status);
