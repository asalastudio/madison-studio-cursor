/**
 * The Best Bottles journal document, built from Madison content.
 *
 * The site lists `journal` documents that have a slug and a `publishedAt`,
 * and renders `content` as Portable Text. Everything here exists to satisfy
 * that contract exactly: the schema's six categories, a slug from the
 * title, an excerpt and read time derived from the body, and image blocks
 * placed where a reader expects them. Uploading lives in the edge function;
 * this module never touches the network, which is why it can be tested.
 */
import {
  blockText,
  type PortableTextBlock,
  type PortableTextImagePlaceholder,
  type PortableTextNode,
} from "./markdownToPortableText.ts";

export const JOURNAL_CATEGORIES = [
  "packaging-101",
  "fragrance-guides",
  "brand-stories",
  "ingredient-science",
  "how-to",
  "industry-news",
] as const;

export type JournalCategory = (typeof JOURNAL_CATEGORIES)[number];

export function isJournalCategory(value: unknown): value is JournalCategory {
  return typeof value === "string" && (JOURNAL_CATEGORIES as readonly string[]).includes(value);
}

/** A Sanity image field value, once the asset exists. */
export type SanityImageValue = {
  _type: "image";
  asset: { _type: "reference"; _ref: string };
  alt?: string;
  caption?: string;
};

export type SanityImageBlock = SanityImageValue & { _key: string };

export type JournalContentNode = PortableTextBlock | SanityImageBlock;

export type JournalDocument = {
  _id: string;
  _type: "journal";
  title: string;
  slug: { _type: "slug"; current: string };
  category: JournalCategory;
  excerpt: string;
  estimatedReadTime: number;
  content: JournalContentNode[];
  image?: SanityImageValue;
  madisonId: string;
  readyForReview: true;
  generationSource: "madison-studio";
  publishedAt?: string;
};

/** "blog_article - SICILY" → "SICILY": the content table prefixes the type. */
export function cleanTitle(raw: string | null | undefined, fallback = "Untitled"): string {
  const value = (raw ?? "").replace(/^[a-z_]+\s*[-–:]\s*/i, "").trim();
  return value || fallback;
}

export function slugify(title: string, maxLength = 96): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
  return slug || "post";
}

/** Any node the document can hold: converter output or an uploaded image block. */
export type ContentNodeLike = { _type: string; style?: string; listItem?: string; children?: Array<{ text: string }> };

export function wordCount(nodes: ContentNodeLike[]): number {
  return nodes
    .map((node) => blockText(node))
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;
}

/** Readers manage ~200 words a minute; the schema wants a whole number ≥ 0. */
export function estimatedReadTime(nodes: ContentNodeLike[]): number {
  return Math.max(1, Math.ceil(wordCount(nodes) / 200));
}

/**
 * The first real paragraph, cut at a sentence end if one lands inside the
 * limit, otherwise at a word boundary. The schema caps excerpts at 300.
 */
export function excerptFrom(nodes: ContentNodeLike[], maxLength = 300): string {
  const paragraph = nodes.find(
    (node) =>
      node._type === "block" && node.style === "normal" && !node.listItem && blockText(node).trim().length > 0,
  );
  const text = paragraph ? blockText(paragraph).replace(/\s+/g, " ").trim() : "";
  if (text.length <= maxLength) return text;
  const window = text.slice(0, maxLength);
  const sentenceEnd = Math.max(window.lastIndexOf(". "), window.lastIndexOf("! "), window.lastIndexOf("? "));
  if (sentenceEnd > maxLength * 0.5) return window.slice(0, sentenceEnd + 1).trim();
  const wordEnd = window.lastIndexOf(" ");
  return `${window.slice(0, wordEnd > 0 ? wordEnd : maxLength).trim()}…`;
}

/**
 * Where extra images go. One after the first paragraph of each section
 * (an h2 and what follows it), in order; anything left over sits before the
 * closing paragraph so the post never ends on a stack of pictures.
 */
export function placeInlineImages<N extends ContentNodeLike, T extends { _type: "image" }>(
  nodes: N[],
  images: T[],
): Array<N | T> {
  if (images.length === 0) return [...nodes];
  const queue = [...images];
  const out: Array<N | T> = [];
  let awaitingParagraph = false;

  for (const node of nodes) {
    out.push(node);
    if (node._type === "block" && (node.style === "h2" || node.style === "h3")) {
      awaitingParagraph = true;
      continue;
    }
    if (
      awaitingParagraph &&
      node._type === "block" &&
      node.style === "normal" &&
      !node.listItem &&
      queue.length > 0
    ) {
      out.push(queue.shift() as T);
      awaitingParagraph = false;
    }
  }

  if (queue.length > 0) spreadAcrossParagraphs(out, queue);
  return out;
}

/**
 * Leftover images — a post with no headings, or more images than sections —
 * are spread through the body rather than stacked: the first lands after the
 * opening paragraph, the rest at even intervals, never after the closing
 * paragraph and never against an image that is already placed.
 */
function spreadAcrossParagraphs<N extends ContentNodeLike, T extends { _type: "image" }>(
  out: Array<N | T>,
  queue: T[],
): void {
  const isParagraph = (node: N | T) =>
    node._type === "block" && (node as ContentNodeLike).style === "normal" && !(node as ContentNodeLike).listItem;
  const paragraphs = out.map((node, index) => (isParagraph(node) ? index : -1)).filter((i) => i >= 0);

  // Candidate slots: right after every paragraph but the last, skipping slots an image already fills.
  const slots: number[] = [];
  for (const index of paragraphs.slice(0, -1)) {
    if (out[index + 1]?._type === "image") continue;
    slots.push(index + 1);
  }
  if (slots.length === 0) {
    out.splice(Math.min(1, out.length), 0, ...queue);
    return;
  }

  const chosen = queue.length >= slots.length
    ? slots
    : queue.map((_, i) => slots[Math.round((i * (slots.length - 1)) / queue.length)]);

  // Extra images beyond the last slot ride along with it; insert back to front so indices hold.
  const perSlot = new Map<number, T[]>();
  queue.forEach((image, i) => {
    const slot = chosen[Math.min(i, chosen.length - 1)];
    perSlot.set(slot, [...(perSlot.get(slot) ?? []), image]);
  });
  for (const slot of [...perSlot.keys()].sort((a, b) => b - a)) {
    out.splice(slot, 0, ...(perSlot.get(slot) as T[]));
  }
}

export interface BuildJournalDocumentInput {
  contentId: string;
  title: string;
  category: JournalCategory;
  content: JournalContentNode[];
  heroImage?: SanityImageValue | null;
  /** Keep the date of an already-published post; set on first publish. */
  publishedAt?: string | null;
}

export function journalDocumentId(contentId: string): string {
  return `madison-${contentId}`;
}

export function buildJournalDocument(input: BuildJournalDocumentInput): JournalDocument {
  const nodes = input.content as ContentNodeLike[];
  const doc: JournalDocument = {
    _id: journalDocumentId(input.contentId),
    _type: "journal",
    title: input.title,
    slug: { _type: "slug", current: slugify(input.title) },
    category: input.category,
    excerpt: excerptFrom(nodes),
    estimatedReadTime: estimatedReadTime(nodes),
    content: input.content,
    madisonId: input.contentId,
    readyForReview: true,
    generationSource: "madison-studio",
  };
  if (input.heroImage) doc.image = input.heroImage;
  if (input.publishedAt) doc.publishedAt = input.publishedAt;
  return doc;
}

/** The placeholders the converter left for the uploader, in document order. */
export function pendingImages(nodes: PortableTextNode[]): PortableTextImagePlaceholder[] {
  return nodes.filter((node): node is PortableTextImagePlaceholder => node._type === "image");
}
