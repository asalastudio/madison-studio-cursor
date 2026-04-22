export interface ParsedEmailPart {
  subject: string;
  preview: string;
  content: string;
}

const SECTION_SPLIT_REGEX = /(?=^(?:Email|Part)\s*\d+(?:\s*[:\-–][^\n\r]*)?\s*$)/gim;

export function parseEmailSequence(content: string): ParsedEmailPart[] {
  if (!content) return [];

  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const sections = splitIntoSections(normalized);

  return sections
    .map((section, index) => parseSection(section, index))
    .filter((part) => part.subject || part.preview || part.content);
}

function splitIntoSections(content: string): string[] {
  const explicitSections = content
    .split(SECTION_SPLIT_REGEX)
    .map((section) => section.trim())
    .filter(Boolean);

  if (explicitSections.length > 1) {
    return explicitSections;
  }

  const looseSections = content
    .split(/\n{3,}/)
    .map((section) => section.trim())
    .filter(Boolean);

  return looseSections.length > 1 ? looseSections : [content];
}

function parseSection(section: string, index: number): ParsedEmailPart {
  let working = section.trim();
  let fallbackSubject = "";

  const headerMatch = working.match(/^(?:Email|Part)\s*\d+(?:[ \t]*[:\-–][ \t]*([^\n\r]*))?/i);
  if (headerMatch) {
    fallbackSubject = (headerMatch[1] || "").trim();
    working = working.slice(headerMatch[0].length).trimStart();
  }

  const lines = working.split("\n");
  if (lines.length) {
    const firstLine = lines[0].trim();
    if (isStandaloneHeading(firstLine)) {
      if (!fallbackSubject) fallbackSubject = firstLine;
      lines.shift();
      while (lines.length && !lines[0].trim()) {
        lines.shift();
      }
      working = lines.join("\n").trimStart();
    }
  }

  const subjectResult = takeTaggedValue(/^subject:\s*(.+)$/im, working);
  working = subjectResult.remainder;
  const previewResult = takeTaggedValue(/^preview:\s*(.+)$/im, working);
  working = previewResult.remainder;

  const body = cleanBody(working);

  const subject = subjectResult.value || fallbackSubject || `Email ${index + 1}`;
  const preview = previewResult.value || derivePreview(body);

  return {
    subject,
    preview,
    content: body,
  };
}

function takeTaggedValue(pattern: RegExp, text: string) {
  const match = text.match(pattern);
  if (!match) {
    return { value: "", remainder: text };
  }

  return {
    value: match[1].trim(),
    remainder: text.replace(match[0], "").trim(),
  };
}

function derivePreview(body: string) {
  const condensed = body.replace(/\s+/g, " ").trim();
  return condensed.slice(0, 180);
}

function cleanBody(text: string) {
  return text
    .replace(/^(?:Email|Part)\s*\d+[^\n]*\n?/i, "")
    .replace(/^body:\s*/im, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n\s*---+\s*$/g, "")
    .replace(/\s+$/g, "")
    .trim();
}

function isStandaloneHeading(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.length > 80) return false;
  const alpha = trimmed.replace(/[^A-Za-z]/g, "");
  if (!alpha) return false;
  return trimmed === trimmed.toUpperCase();
}
