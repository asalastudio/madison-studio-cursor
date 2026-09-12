import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { blockText, markdownToPortableText, type PortableTextBlock } from "./markdownToPortableText";

const blocksOf = (md: string, title?: string) =>
  markdownToPortableText(md, { title }).filter((n): n is PortableTextBlock => n._type === "block");

describe("markdownToPortableText", () => {
  it("drops a leading # title that repeats the document title, keeps ## as h2, ### as h3", () => {
    const blocks = blocksOf("# What 2,300 SKUs Taught Us\n\n## Scale\n\nBody.\n\n### Detail\n\nMore.", "What 2,300 SKUs taught us");
    assert.deepEqual(blocks.map((b) => b.style), ["h2", "normal", "h3", "normal"]);
    assert.equal(blockText(blocks[0]), "Scale");
  });

  it("treats a lone # as a section heading when the post has no ##", () => {
    const blocks = blocksOf("# Why glass\n\nGlass keeps oils stable.");
    assert.deepEqual(blocks.map((b) => b.style), ["h2", "normal"]);
  });

  it("joins wrapped paragraph lines and splits on blank lines", () => {
    const blocks = blocksOf("First line\ncontinues here.\n\nSecond paragraph.");
    assert.equal(blocks.length, 2);
    assert.equal(blockText(blocks[0]), "First line continues here.");
  });

  it("emits bullet and numbered list items with levels", () => {
    const blocks = blocksOf("- one\n- two\n  - nested\n1. first\n2) second");
    assert.deepEqual(blocks.map((b) => [b.listItem, b.level]), [
      ["bullet", 1], ["bullet", 1], ["bullet", 2], ["number", 1], ["number", 1],
    ]);
    assert.equal(blockText(blocks[4]), "second");
  });

  it("marks bold, italic and code, and turns links into markDefs", () => {
    const [block] = blocksOf("Use **cobalt** or *amber* glass — see [our guide](https://bestbottles.com/guide) and `GB-CYL-9ML`.");
    const strong = block.children.find((s) => s.marks.includes("strong"));
    const em = block.children.find((s) => s.marks.includes("em"));
    const code = block.children.find((s) => s.marks.includes("code"));
    assert.equal(strong?.text, "cobalt");
    assert.equal(em?.text, "amber");
    assert.equal(code?.text, "GB-CYL-9ML");
    assert.equal(block.markDefs.length, 1);
    assert.equal(block.markDefs[0].href, "https://bestbottles.com/guide");
    const linked = block.children.find((s) => s.marks.includes(block.markDefs[0]._key));
    assert.equal(linked?.text, "our guide");
  });

  it("keeps bold inside a link and leaves snake_case words alone", () => {
    const [block] = blocksOf("Read [**the** manual](https://x.y) about product_group_slug values.");
    const boldLinked = block.children.find((s) => s.marks.includes("strong"));
    assert.ok(boldLinked && boldLinked.marks.length === 2);
    assert.equal(blockText(block), "Read the manual about product_group_slug values.");
  });

  it("collects blockquotes and skips horizontal rules", () => {
    const blocks = blocksOf("> Beautifully\n> contained.\n\n---\n\nAfter.");
    assert.deepEqual(blocks.map((b) => b.style), ["blockquote", "normal"]);
    assert.equal(blockText(blocks[0]), "Beautifully contained.");
  });

  it("turns image lines into upload placeholders with alt and caption", () => {
    const nodes = markdownToPortableText('Intro.\n\n![Cobalt roll-on](https://cdn/x.png "On travertine")\n\nOutro.');
    assert.equal(nodes.length, 3);
    const image = nodes[1];
    assert.equal(image._type, "image");
    if (image._type === "image") {
      assert.equal(image.sourceUrl, "https://cdn/x.png");
      assert.equal(image.alt, "Cobalt roll-on");
      assert.equal(image.caption, "On travertine");
    }
  });

  it("strips stray HTML and never throws on empty input", () => {
    assert.deepEqual(markdownToPortableText(""), []);
    const [block] = blocksOf("<p>Plain <b>text</b></p>");
    assert.equal(blockText(block), "Plain text");
  });

  it("gives every block and span a unique key", () => {
    const nodes = markdownToPortableText("# T\n\n## A\n\n- x\n- y\n\n**b** and *i*", { title: "T" });
    const keys = nodes.flatMap((n) => [n._key, ...(n._type === "block" ? n.children.map((s) => s._key) : [])]);
    assert.equal(new Set(keys).size, keys.length);
  });
});
