import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canonicalStudioProductGroupSlug,
  studioProductGroupSlugCandidates,
} from "./bestBottlesStudioSlug.ts";

describe("Studio product-group slug aliases", () => {
  it("retries screw-cap Pipeline slugs without -capclosure", () => {
    assert.deepEqual(
      studioProductGroupSlugCandidates("cylinder-5ml-clear-13-415-capclosure"),
      ["cylinder-5ml-clear-13-415-capclosure", "cylinder-5ml-clear-13-415"],
    );
    assert.equal(
      canonicalStudioProductGroupSlug("cylinder-5ml-clear-13-415-capclosure"),
      "cylinder-5ml-clear-13-415",
    );
    assert.equal(
      canonicalStudioProductGroupSlug("cylinder-9ml-frosted-17-415-rollon"),
      "cylinder-9ml-frosted-17-415-rollon",
    );
  });
});
