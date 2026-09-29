import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applySmokePromptAddendum,
  getSmokePromptAddendum,
} from "./smoke-prompt-addendums";

describe("Best Bottles smoke prompt addendums", () => {
  it("returns no addendum when no smoke addendum id is supplied", () => {
    assert.equal(getSmokePromptAddendum(undefined), null);
    assert.equal(getSmokePromptAddendum(""), null);
  });

  it("defines the clear glass polish addendum as material-only and geometry-safe", () => {
    const addendum = getSmokePromptAddendum("clear-glass-polish-v1");

    assert.equal(addendum?.id, "clear-glass-polish-v1");
    assert.match(addendum?.text ?? "", /clear transparent glass/i);
    assert.match(addendum?.text ?? "", /do not change geometry/i);
    assert.match(addendum?.text ?? "", /do not create literal/i);
    assert.match(addendum?.text ?? "", /no fog/i);
    assert.match(addendum?.text ?? "", /no liquid/i);
  });

  it("retires the Kinfolk/Aesop v1 studio direction because it is too loose for production", () => {
    assert.throws(
      () => getSmokePromptAddendum("kinfolk-aesop-studio-v1"),
      /Retired Best Bottles smoke prompt addendum: kinfolk-aesop-studio-v1/,
    );
  });

  it("defines the Kinfolk/Aesop v2 studio direction without loosening the catalog contract", () => {
    const addendum = getSmokePromptAddendum("kinfolk-aesop-studio-v2");
    const text = addendum?.text ?? "";

    assert.equal(addendum?.id, "kinfolk-aesop-studio-v2");
    assert.match(text, /Kinfolk/);
    assert.match(text, /Aesop/);
    assert.match(text, /mood reference/i);
    assert.match(text, /fill-height target/i);
    assert.match(text, /shared baseline/i);
    assert.match(text, /centerline/i);
    assert.match(text, /contact-only/i);
    assert.match(text, /Do not add props/i);
    assert.doesNotMatch(text, /negative space/i);
    assert.doesNotMatch(text, /editorial/i);
  });

  it("appends the addendum under an explicit test-only section", () => {
    const addendum = getSmokePromptAddendum("clear-glass-polish-v1");
    const prompt = applySmokePromptAddendum("CANON PROMPT", addendum);

    assert.match(prompt, /^CANON PROMPT\n\nTEST-ONLY MATERIAL POLISH ADDENDUM/);
    assert.match(prompt, /clear-glass-polish-v1/);
    assert.match(prompt, /CANON PROMPT/);
  });

  it("states the frosted finish without ever naming the look it must not have", () => {
    // Jordan, 2026-09-20: remove the words "clear glass". An image model hears a
    // negated look as a look, and v1 of this addendum said it three times.
    const addendum = getSmokePromptAddendum("frosted-finish-v2");
    assert.ok(addendum?.replaceGlassLine);
    const everything = `${addendum!.replaceGlassLine}\n${addendum!.text}`;
    assert.doesNotMatch(everything, /clear|transparen|see-through|not\s/i);
    assert.match(everything, /frosted glass/i);
    assert.match(everything, /from the shoulder to the base/i);
  });

  it("swaps the canon's multi-material GLASS paragraph for the frosted one, and only that", () => {
    const canon = [
      "PRESERVE BLOCK",
      "",
      "GLASS: preserve the glass's exact color, tint, frosting, and/or swirl pattern EXACTLY as shown in the reference — do not change, lighten, recolor, clear, or flatten it. For swirl glass: thinner swirls reading as more transparent.",
      "",
      "STUDIO DIRECTION",
    ].join("\n");
    const prompt = applySmokePromptAddendum(canon, getSmokePromptAddendum("frosted-finish-v2"));

    assert.doesNotMatch(prompt, /preserve the glass's exact color/);
    assert.doesNotMatch(prompt, /\bclear\b|transparen/i);
    assert.match(prompt, /^PRESERVE BLOCK\n\nGLASS: this bottle is frosted glass\./);
    assert.match(prompt, /STUDIO DIRECTION\n\nTEST-ONLY MATERIAL POLISH ADDENDUM \(frosted-finish-v2\):/);
  });

  it("refuses to run the frosted addendum when the canon GLASS paragraph is missing", () => {
    // A silent no-op would send the old wording under the new tag.
    assert.throws(
      () => applySmokePromptAddendum("CANON PROMPT WITHOUT IT", getSmokePromptAddendum("frosted-finish-v2")),
      /frosted-finish-v2 expects exactly one canon GLASS paragraph to replace; found 0/,
    );
  });

  it("retires the first frosted addendum, which named the unwanted finish", () => {
    assert.throws(
      () => getSmokePromptAddendum("frosted-body-clear-neck-v1"),
      /Retired Best Bottles smoke prompt addendum: frosted-body-clear-neck-v1/,
    );
  });

  it("rejects unknown smoke addendum ids", () => {
    assert.throws(
      () => getSmokePromptAddendum("unknown-addendum"),
      /Unknown Best Bottles smoke prompt addendum/,
    );
  });
});
