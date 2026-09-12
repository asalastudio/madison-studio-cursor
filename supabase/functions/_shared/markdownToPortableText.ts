/**
 * Markdown → Portable Text, for the journal lane.
 *
 * Madison's writers produce Markdown; the Best Bottles site renders
 * `journal.content` as Portable Text with @portabletext/react and knows
 * exactly these things: block styles normal / h1–h4 / blockquote, bullet
 * and numbered lists (with levels), strong / em / link marks, and an
 * `image` block with alt + caption. This converter targets that set and
 * nothing more.
 *
 * It is line-based on purpose. LLM Markdown is regular — headings, short
 * paragraphs, flat or one-level lists, the odd quote and image — and a
 * predictable converter that never throws beats a full CommonMark parser
 * the edge runtime would have to bundle.
 *
 * Images come out as placeholders carrying the source URL; the caller
 * uploads them to Sanity and swaps in asset references (see journalPost.ts).
 */

export type PortableTextSpan = {
  _type: "span";
  _key: string;
  text: string;
  marks: string[];
};

export type PortableTextMarkDef = {
  _key: string;
  _type: "link";
  href: string;
};

export type PortableTextBlock = {
  _type: "block";
  _key: string;
  style: "normal" | "h1" | "h2" | "h3" | "h4" | "blockquote";
  markDefs: PortableTextMarkDef[];
  children: PortableTextSpan[];
  listItem?: "bullet" | "number";
  level?: number;
};

/** An image the caller still has to upload; `sourceUrl` is where it lives now. */
export type PortableTextImagePlaceholder = {
  _type: "image";
  _key: string;
  alt?: string;
  caption?: string;
  sourceUrl: string;
};

export type PortableTextNode = PortableTextBlock | PortableTextImagePlaceholder;

export interface MarkdownToPortableTextOptions {
  /**
   * The document's own title. A leading `# Title` that repeats it is
   * dropped — the page already renders the title as its h1.
   */
  title?: string;
}

/** Deterministic keys: stable across re-pushes and readable in tests. */
function keyFactory(prefix: string) {
  let n = 0;
  return () => `${prefix}${(++n).toString(36)}`;
}

const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const LIST_ITEM = /^(\s*)(?:[-*+]|\d+[.)])\s+(.+)$/;
const NUMBERED_ITEM = /^\s*\d+[.)]\s+/;
const BLOCKQUOTE = /^>\s?(.*)$/;
const IMAGE_LINE = /^!\[([^\]]*)\]\(\s*(\S+?)(?:\s+"([^"]*)")?\s*\)\s*$/;
const HORIZONTAL_RULE = /^(?:-{3,}|\*{3,}|_{3,})\s*$/;
const FENCE = /^```/;

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, "");
}

function normalizeTitle(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Inline Markdown → spans. Links are split out first so their text can
 * still carry bold/italic; then each text run is tokenised for
 * `**bold**`, `*em*`, `` `code` ``.
 */
function parseInline(
  text: string,
  nextKey: () => string,
  markDefs: PortableTextMarkDef[],
): PortableTextSpan[] {
  const spans: PortableTextSpan[] = [];
  const LINK = /\[([^\]]+)\]\(\s*(\S+?)\s*\)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = LINK.exec(text)) !== null) {
    if (match.index > cursor) {
      spans.push(...parseEmphasis(text.slice(cursor, match.index), nextKey, []));
    }
    const def: PortableTextMarkDef = { _key: nextKey(), _type: "link", href: match[2] };
    markDefs.push(def);
    spans.push(...parseEmphasis(match[1], nextKey, [def._key]));
    cursor = LINK.lastIndex;
  }
  if (cursor < text.length) {
    spans.push(...parseEmphasis(text.slice(cursor), nextKey, []));
  }
  return spans.length > 0 ? spans : [{ _type: "span", _key: nextKey(), text: "", marks: [] }];
}

function parseEmphasis(
  text: string,
  nextKey: () => string,
  baseMarks: string[],
): PortableTextSpan[] {
  const spans: PortableTextSpan[] = [];
  // bold (** or __), italic (* or _ not inside a word), inline code
  const EMPHASIS = /(\*\*|__)(.+?)\1|(?<![\w*])(\*|_)(?!\s)(.+?)(?<!\s)\3(?![\w*])|`([^`]+)`/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  const push = (value: string, marks: string[]) => {
    if (!value) return;
    spans.push({ _type: "span", _key: nextKey(), text: value, marks });
  };
  while ((match = EMPHASIS.exec(text)) !== null) {
    push(text.slice(cursor, match.index), baseMarks);
    if (match[1]) {
      // bold — allow italic inside
      const inner = match[2];
      const innerSpans = parseEmphasis(inner, nextKey, [...baseMarks, "strong"]);
      spans.push(...innerSpans);
    } else if (match[3]) {
      push(match[4], [...baseMarks, "em"]);
    } else if (match[5] !== undefined) {
      push(match[5], [...baseMarks, "code"]);
    }
    cursor = EMPHASIS.lastIndex;
  }
  push(text.slice(cursor), baseMarks);
  return spans;
}

function textBlock(
  text: string,
  style: PortableTextBlock["style"],
  nextKey: () => string,
): PortableTextBlock {
  const markDefs: PortableTextMarkDef[] = [];
  const children = parseInline(text, nextKey, markDefs);
  return { _type: "block", _key: nextKey(), style, markDefs, children };
}

export function markdownToPortableText(
  markdown: string,
  options: MarkdownToPortableTextOptions = {},
): PortableTextNode[] {
  const nextKey = keyFactory("k");
  const source = stripHtml(markdown ?? "").replace(/\r\n?/g, "\n");
  const lines = source.split("\n");
  const nodes: PortableTextNode[] = [];

  // `#` is the title line in most generated posts and a section heading in
  // the rest. When the document also has `##`, treat `#` as a title.
  const hasH2 = lines.some((line) => /^##\s/.test(line));
  const title = normalizeTitle(options.title);
  let droppedTitle = false;

  let paragraph: string[] = [];
  let quote: string[] = [];
  let inFence = false;
  let fence: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    nodes.push(textBlock(paragraph.join(" "), "normal", nextKey));
    paragraph = [];
  };
  const flushQuote = () => {
    if (quote.length === 0) return;
    nodes.push(textBlock(quote.join(" "), "blockquote", nextKey));
    quote = [];
  };
  const flushFence = () => {
    if (fence.length === 0) return;
    const block = textBlock("", "normal", nextKey);
    block.children = [{ _type: "span", _key: nextKey(), text: fence.join("\n"), marks: ["code"] }];
    nodes.push(block);
    fence = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, "");

    if (FENCE.test(line.trim())) {
      if (inFence) {
        flushFence();
        inFence = false;
      } else {
        flushParagraph();
        flushQuote();
        inFence = true;
      }
      continue;
    }
    if (inFence) {
      fence.push(rawLine);
      continue;
    }

    const trimmed = line.trim();

    if (trimmed === "") {
      flushParagraph();
      flushQuote();
      continue;
    }

    const image = IMAGE_LINE.exec(trimmed);
    if (image) {
      flushParagraph();
      flushQuote();
      const placeholder: PortableTextImagePlaceholder = {
        _type: "image",
        _key: nextKey(),
        sourceUrl: image[2],
      };
      if (image[1]) placeholder.alt = image[1];
      if (image[3]) placeholder.caption = image[3];
      nodes.push(placeholder);
      continue;
    }

    if (HORIZONTAL_RULE.test(trimmed)) {
      flushParagraph();
      flushQuote();
      continue;
    }

    const heading = HEADING.exec(trimmed);
    if (heading) {
      flushParagraph();
      flushQuote();
      const hashes = heading[1].length;
      const text = heading[2];
      if (hashes === 1) {
        if (hasH2 && !droppedTitle && (title === "" || normalizeTitle(text) === title)) {
          // The generated post's own title line; the page renders `title`.
          droppedTitle = true;
          continue;
        }
        nodes.push(textBlock(text, "h2", nextKey));
      } else {
        const style = hashes === 2 ? "h2" : hashes === 3 ? "h3" : "h4";
        nodes.push(textBlock(text, style, nextKey));
      }
      continue;
    }

    const quoteLine = BLOCKQUOTE.exec(trimmed);
    if (quoteLine) {
      flushParagraph();
      if (quoteLine[1].trim()) quote.push(quoteLine[1].trim());
      continue;
    }

    const item = LIST_ITEM.exec(line);
    if (item) {
      flushParagraph();
      flushQuote();
      const indent = item[1].replace(/\t/g, "  ").length;
      const block = textBlock(item[2], "normal", nextKey);
      block.listItem = NUMBERED_ITEM.test(line) ? "number" : "bullet";
      block.level = Math.min(3, Math.floor(indent / 2) + 1);
      nodes.push(block);
      continue;
    }

    flushQuote();
    paragraph.push(trimmed);
  }

  if (inFence) flushFence();
  flushParagraph();
  flushQuote();

  return nodes;
}

/** Plain text of a block — for excerpts and word counts. */
export function blockText(node: { _type: string; children?: Array<{ text: string }> }): string {
  if (node._type !== "block" || !node.children) return "";
  return node.children.map((span) => span.text).join("");
}
