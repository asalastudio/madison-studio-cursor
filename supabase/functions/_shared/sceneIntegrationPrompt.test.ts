import assert from "node:assert/strict";
import test from "node:test";

import { buildSceneIntegrationBlock, PRODUCT_FIDELITY_RELIGHT_LINE, sceneIntegrationSentence } from "./sceneIntegrationPrompt.ts";

test("integration block names light authority, shadows, bounce and no cut-out", () => {
  const block = buildSceneIntegrationBlock();
  for (const needle of [/light is authoritative/, /contact shadow/, /cast shadow/, /colour bounce/, /cut-out/]) {
    assert.match(block, needle);
  }
  assert.match(PRODUCT_FIDELITY_RELIGHT_LINE, /exact silhouette, glass thickness, threads, closure and proportions; change only the scene light falling on it/);
  assert.doesNotMatch(sceneIntegrationSentence(), /do not copy/i);
  assert.doesNotMatch(sceneIntegrationSentence(), /\n/);
  assert.doesNotMatch(block + PRODUCT_FIDELITY_RELIGHT_LINE, /COPY/);
});
