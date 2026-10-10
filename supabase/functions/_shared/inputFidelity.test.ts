import assert from "node:assert/strict";
const test = (name: string, fn: () => void) => Deno.test(name, fn);

import { inputFidelityForModel, isInputFidelityRejection } from "./openaiProvider.ts";

test("input_fidelity is sent only where OpenAI documents it", () => {
  assert.equal(inputFidelityForModel("gpt-image-1.5").send, true);
  assert.equal(inputFidelityForModel("gpt-image-1").send, true);
  assert.equal(inputFidelityForModel("gpt-image-1-mini").send, false);
  assert.equal(inputFidelityForModel("gpt-image-2.5-flare").send, false);
  assert.match(inputFidelityForModel("gpt-image-2.5-flare").reason, /always uses high/);
  assert.equal(isInputFidelityRejection(400, '{"error":{"param":"input_fidelity"}}'), true);
  assert.equal(isInputFidelityRejection(500, "input_fidelity"), false);
});
