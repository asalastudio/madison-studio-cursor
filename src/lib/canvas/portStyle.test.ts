import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CANVAS_PORT_KINDS } from "./types";
import { PORT_KIND_CSS_VARS, portKindCssVar } from "./portStyle";

describe("canvas port style", () => {
  it("maps every port kind to a Dark Room CSS variable", () => {
    for (const kind of CANVAS_PORT_KINDS) {
      const value = portKindCssVar(kind);
      assert.match(value, /^var\(--/);
      assert.equal(value, PORT_KIND_CSS_VARS[kind]);
    }
  });

  it("never uses Bone #F5F3EF as UI chrome or a handle colour", () => {
    for (const kind of CANVAS_PORT_KINDS) {
      const value = portKindCssVar(kind);
      assert.doesNotMatch(value, /#F5F3EF/i);
      assert.doesNotMatch(value, /bone/i);
    }
  });
});
