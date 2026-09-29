import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BEST_BOTTLES_PRODUCTION_MODEL,
  BEST_BOTTLES_PRODUCTION_PROVIDER,
  buildBestBottlesPersistedLibraryTags,
  getBestBottlesProductionProviderIssue,
  resolveBestBottlesProductionResolution,
  shouldForceBestBottlesOpenAIProvider,
} from "./bestBottlesProviderRouting";

describe("Best Bottles provider routing", () => {
  it("forces OpenAI for reference-locked masters by default", () => {
    assert.equal(
      shouldForceBestBottlesOpenAIProvider({
        isBestBottlesReferenceLocked: true,
        allowBestBottlesProviderOverride: false,
      }),
      true,
    );
  });

  it("allows explicit comparison runs to use the requested non-OpenAI provider", () => {
    assert.equal(
      shouldForceBestBottlesOpenAIProvider({
        isBestBottlesReferenceLocked: true,
        allowBestBottlesProviderOverride: true,
      }),
      false,
    );
  });

  it("locks production routing to OpenAI GPT Image 2.5 Sunburst", () => {
    assert.equal(BEST_BOTTLES_PRODUCTION_PROVIDER, "openai");
    assert.equal(BEST_BOTTLES_PRODUCTION_MODEL, "gpt-image-2.5-sunburst");
    assert.equal(
      getBestBottlesProductionProviderIssue({
        isBestBottlesReferenceLocked: true,
        comparisonOnly: false,
        provider: "openai",
        model: "gpt-image-2.5-sunburst",
      }),
      null,
    );
  });

  it("rejects every non-Sunburst resolution before production spend", () => {
    for (const [provider, model] of [
      ["openai", "gpt-image-2"],
      ["openai", "gpt-image-2.5-flare"],
      ["gemini", "gemini"],
      ["freepik", "mystic"],
      ["auto", "gpt-image-2.5-sunburst"],
    ] as const) {
      assert.match(
        getBestBottlesProductionProviderIssue({
          isBestBottlesReferenceLocked: true,
          comparisonOnly: false,
          provider,
          model,
        }) ?? "",
        /requires provider=openai and model=gpt-image-2\.5-sunburst/,
      );
    }
  });

  it("keeps explicit comparison routing outside the production-safe lock", () => {
    assert.equal(
      getBestBottlesProductionProviderIssue({
        isBestBottlesReferenceLocked: true,
        comparisonOnly: true,
        provider: "gemini",
        model: "gemini",
      }),
      null,
    );
  });

  it("strips stale and malicious production tags from the final comparison tag set", () => {
    const persistedTags = buildBestBottlesPersistedLibraryTags({
      comparisonOnly: true,
      existing: ["studio-master", "sku:GB-SPR-CLR-3ML-BLK"],
      parent: [
        "contract-provider:openai-image-2.5-sunburst",
        "contract-provider:openai-image-2",
        "family:cylinder",
      ],
      pipeline: ["brand:best-bottles", "reference-lineage:clean"],
      contract: ["contract-provider:comparison", "contract-status:ready"],
      caller: [
        "studio-master",
        "family-batch:live",
        "contract-provider:openai-image-2.5-sunburst",
        "identity:sealed-product",
      ],
    });

    assert.deepEqual(persistedTags, [
      "sku:GB-SPR-CLR-3ML-BLK",
      "family:cylinder",
      "brand:best-bottles",
      "reference-lineage:clean",
      "contract-provider:comparison",
      "contract-status:ready",
      "identity:sealed-product",
    ]);
  });

  it("does not force OpenAI for non-Best-Bottles requests", () => {
    assert.equal(
      shouldForceBestBottlesOpenAIProvider({
        isBestBottlesReferenceLocked: false,
        allowBestBottlesProviderOverride: false,
      }),
      false,
    );
  });

  it("forces high OpenAI quality for Best Bottles reference-locked production requests", () => {
    assert.equal(
      resolveBestBottlesProductionResolution({
        isBestBottlesReferenceLocked: true,
        resolution: "standard",
      }),
      "high",
    );
    assert.equal(
      resolveBestBottlesProductionResolution({
        isBestBottlesReferenceLocked: true,
        resolution: undefined,
      }),
      "high",
    );
  });

  it("preserves requested resolution for non-Best-Bottles requests", () => {
    assert.equal(
      resolveBestBottlesProductionResolution({
        isBestBottlesReferenceLocked: false,
        resolution: "standard",
      }),
      "standard",
    );
  });
});
