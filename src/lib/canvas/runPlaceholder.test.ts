import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WEEK2_RUN_DESCRIPTION, week2RunToast } from "./runPlaceholder";

describe("canvas run placeholder", () => {
  it("keeps run and run-all as week-2 placeholders", () => {
    const node = week2RunToast("node");
    const all = week2RunToast("all");
    assert.equal(node.description, WEEK2_RUN_DESCRIPTION);
    assert.equal(all.description, WEEK2_RUN_DESCRIPTION);
    assert.match(all.title, /Week 2/);
    assert.doesNotMatch(node.description, /generate-madison-image|openai|gemini/i);
  });
});
