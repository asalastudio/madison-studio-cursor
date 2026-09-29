import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { pickFixedBackgroundVariation } from "./darkroomBackgroundVariation";

describe("pickFixedBackgroundVariation", () => {
  it("returns the same first variation on every call", () => {
    const variations = [
      "flat Bone #F5F3EF seamless studio background",
      "clean bone editorial studio canvas",
      "minimal bone backdrop without hex",
    ];

    assert.equal(
      pickFixedBackgroundVariation(variations),
      "flat Bone #F5F3EF seamless studio background",
    );
    assert.equal(
      pickFixedBackgroundVariation(variations),
      pickFixedBackgroundVariation(variations),
    );
  });

  it("returns empty string when there is no preset", () => {
    assert.equal(pickFixedBackgroundVariation(undefined), "");
    assert.equal(pickFixedBackgroundVariation([]), "");
  });
});
