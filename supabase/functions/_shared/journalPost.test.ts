import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { markdownToPortableText } from "./markdownToPortableText";
import {
  buildJournalDocument,
  cleanTitle,
  estimatedReadTime,
  excerptFrom,
  isJournalCategory,
  placeInlineImages,
  slugify,
} from "./journalPost";

const POST = `# What 2,300 SKUs taught us

Scaling a fragrance line is mostly a packaging problem. The first paragraph says so plainly, and it keeps going long enough to matter.

## Glass first

Amber protects oils. Cobalt sells.

- weight
- neck finish

## Closures

Phenolic, not metal. Always.

Closing thought.`;

describe("journal document", () => {
  it("accepts only the site's six categories", () => {
    assert.equal(isJournalCategory("packaging-101"), true);
    assert.equal(isJournalCategory("field-notes"), false);
  });

  it("cleans the content table's type prefix off titles and slugifies", () => {
    assert.equal(cleanTitle("blog_article - SICILY"), "SICILY");
    assert.equal(cleanTitle("  "), "Untitled");
    assert.equal(slugify("What 2,300 SKUs Taught Us: Scaling & Glass"), "what-2-300-skus-taught-us-scaling-and-glass");
    assert.equal(slugify("Crème brûlée"), "creme-brulee");
  });

  it("derives excerpt and read time from the body, not the title", () => {
    const nodes = markdownToPortableText(POST, { title: "What 2,300 SKUs taught us" });
    assert.match(excerptFrom(nodes), /^Scaling a fragrance line/);
    assert.equal(estimatedReadTime(nodes), 1);
    const long = markdownToPortableText(Array(450).fill("word").join(" "));
    assert.equal(estimatedReadTime(long), 3);
  });

  it("cuts a long excerpt at a sentence end within the limit", () => {
    const nodes = markdownToPortableText(`${"Sentence one is here. ".repeat(30)}`);
    const excerpt = excerptFrom(nodes);
    assert.ok(excerpt.length <= 300);
    assert.ok(excerpt.endsWith("."));
  });

  it("places one image after the first paragraph of each section, leftovers before the close", () => {
    const nodes = markdownToPortableText(POST, { title: "What 2,300 SKUs taught us" });
    const img = (n: number) => ({ _type: "image" as const, _key: `img${n}`, asset: { _type: "reference" as const, _ref: `image-${n}` } });
    const placed = placeInlineImages(nodes, [img(1), img(2), img(3)]);
    const shape = placed.map((n) => (n._type === "image" ? "IMG" : (n as { style: string; listItem?: string }).listItem ? "li" : (n as { style: string }).style));
    // One per section; the spare one leads the post instead of stacking against another image.
    assert.deepEqual(shape, ["normal", "IMG", "h2", "normal", "IMG", "li", "li", "h2", "normal", "IMG", "normal"]);
  });

  it("puts images near the top when the post has no sections", () => {
    const nodes = markdownToPortableText("Only paragraph one.\n\nOnly paragraph two.");
    const placed = placeInlineImages(nodes, [{ _type: "image" as const, _key: "i", asset: { _type: "reference" as const, _ref: "image-x" } }]);
    assert.deepEqual(placed.map((n) => n._type), ["block", "image", "block"]);
  });

  it("spreads several images through a post that has no headings", () => {
    const nodes = markdownToPortableText(["One.", "Two.", "Three.", "Four.", "Five.", "Six."].join("\n\n"));
    const img = (n: number) => ({ _type: "image" as const, _key: `img${n}`, asset: { _type: "reference" as const, _ref: `image-${n}` } });
    const placed = placeInlineImages(nodes, [img(1), img(2)]);
    assert.deepEqual(
      placed.map((n) => n._type),
      ["block", "image", "block", "block", "image", "block", "block", "block"],
    );
    // Never after the closing paragraph, never two in a row.
    const types = placed.map((n) => n._type);
    assert.notEqual(types[types.length - 1], "image");
    assert.equal(types.some((t, i) => t === "image" && types[i + 1] === "image"), false);
  });

  it("stacks only when there is nowhere else to put them", () => {
    const nodes = markdownToPortableText("Only paragraph one.\n\nOnly paragraph two.");
    const img = (n: number) => ({ _type: "image" as const, _key: `img${n}`, asset: { _type: "reference" as const, _ref: `image-${n}` } });
    const placed = placeInlineImages(nodes, [img(1), img(2), img(3)]);
    assert.deepEqual(placed.map((n) => n._type), ["block", "image", "image", "image", "block"]);
  });

  it("builds a journal document the schema accepts", () => {
    const nodes = markdownToPortableText(POST, { title: "What 2,300 SKUs taught us" });
    const doc = buildJournalDocument({
      contentId: "abc-123",
      title: "What 2,300 SKUs taught us",
      category: "packaging-101",
      content: nodes as Parameters<typeof buildJournalDocument>[0]["content"],
      heroImage: { _type: "image", asset: { _type: "reference", _ref: "image-hero" }, alt: "Hero" },
    });
    assert.equal(doc._id, "madison-abc-123");
    assert.equal(doc._type, "journal");
    assert.equal(doc.slug.current, "what-2-300-skus-taught-us");
    assert.equal(doc.category, "packaging-101");
    assert.equal(doc.readyForReview, true);
    assert.equal(doc.generationSource, "madison-studio");
    assert.equal(doc.madisonId, "abc-123");
    assert.equal(doc.image?.asset._ref, "image-hero");
    assert.equal("publishedAt" in doc, false);
    assert.ok(doc.excerpt.length > 0 && doc.excerpt.length <= 300);
  });
});
