import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const currentDir = dirname(fileURLToPath(import.meta.url));
const edgeSource = readFileSync(resolve(currentDir, "../generate-madison-image/index.ts"), "utf8");
const batchSource = readFileSync(
  resolve(currentDir, "../../../scripts/best-bottles/generate-family-batch.ts"),
  "utf8",
);

describe("Best Bottles Sunburst production lock", () => {
  it("locks the resolved edge provider and model before the attempt ledger or provider call", () => {
    const productionRouting = edgeSource.slice(
      edgeSource.indexOf("const forceBestBottlesOpenAIProvider"),
    );

    assert.match(productionRouting, /effectiveProvider = BEST_BOTTLES_PRODUCTION_PROVIDER/);
    assert.match(productionRouting, /effectiveOpenAIModel = BEST_BOTTLES_PRODUCTION_MODEL/);
    assert.match(productionRouting, /getBestBottlesProductionProviderIssue\(/);
    assert.ok(
      productionRouting.indexOf("getBestBottlesProductionProviderIssue(")
        < productionRouting.indexOf("beginGenerationAttempt("),
      "the production provider invariant must be checked before spend is recorded",
    );
    assert.doesNotMatch(productionRouting, /effectiveOpenAIModel = "gpt-image-2"/);
  });

  it("defaults the production family batch to Sunburst instead of GPT Image 2", () => {
    assert.match(
      batchSource,
      /const aiProvider = process\.env\.BB_GEN_AI_PROVIDER\?\.trim\(\) \|\| "openai-image-2\.5-sunburst"/,
    );
    assert.doesNotMatch(
      batchSource,
      /const aiProvider = process\.env\.BB_GEN_AI_PROVIDER\?\.trim\(\) \|\| "openai-image-2"/,
    );
  });

  it("applies the comparison-only filter to the final persisted tag merge", () => {
    const persistence = edgeSource.slice(
      edgeSource.indexOf("// Auto-tag pipeline-originated images"),
      edgeSource.indexOf("const savedImage = await insertGeneratedImageRecord"),
    );

    assert.match(
      persistence,
      /insertPayload\.library_tags = buildBestBottlesPersistedLibraryTags\(\{/,
    );
    assert.match(persistence, /comparisonOnly: bestBottlesComparisonOnly/);
    assert.match(persistence, /parent: parentImageTags/);
    assert.match(persistence, /caller: callerExtraTags/);
  });
});
