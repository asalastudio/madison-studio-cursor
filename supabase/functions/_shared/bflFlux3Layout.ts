/**
 * FLUX 3 Image prompt and request builder.
 *
 * Boxes are not a separate API field. They are a JSON element table appended
 * to the prompt. See https://docs.bfl.ai/flux_3/flux3_image_bounding_boxes.
 *
 * The endpoint rejects unknown fields with HTTP 422. This module only emits
 * the documented Flux3ImageInputs keys.
 */

import { sceneIntegrationSentence } from "./sceneIntegrationPrompt.ts";
import { isPubliclyFetchableUrl } from "./urlSafety.ts";

export const BFL_FLUX3_ENDPOINT = "https://api.bfl.ai/v1/flux-3-image";
export const BFL_FLUX3_AI_PROVIDER = "bfl-flux-3-image";
export const FLUX3_MAX_REFERENCE_IMAGES = 10;
export const FLUX3_MAX_LAYOUT_ELEMENTS = 24;

export const FLUX3_RESOLUTIONS = ["768sq", "1k", "1.5k", "2k", "4k"] as const;
export type Flux3Resolution = (typeof FLUX3_RESOLUTIONS)[number];

export const FLUX3_ASPECT_RATIOS = [
  "21:9",
  "2:1",
  "16:9",
  "3:2",
  "7:5",
  "4:3",
  "5:4",
  "1:1",
  "4:5",
  "3:4",
  "5:7",
  "2:3",
  "9:16",
  "1:2",
  "9:21",
  "auto",
] as const;
export type Flux3AspectRatio = (typeof FLUX3_ASPECT_RATIOS)[number];

export type Flux3BBox = [number, number, number, number];

/** Generation row: place an element. bbox is [y_min, x_min, y_max, x_max] on a 0–1000 grid. */
export interface Flux3GenerateElement {
  id: string;
  desc: string;
  bbox: Flux3BBox;
}

/**
 * Edit row. `from: null` generates the element at tgt_bbox (add, replace, recolor).
 * Matching src_bbox and tgt_bbox keeps the element. `tgt_bbox: null` removes it.
 */
export interface Flux3EditElement {
  id: string;
  desc: string;
  from: string | null;
  src_bbox: Flux3BBox | null;
  tgt_bbox: Flux3BBox | null;
}

export type Flux3LayoutElement = Flux3GenerateElement | Flux3EditElement;

export interface Flux3ClientRequest {
  caption?: string;
  elements?: Flux3LayoutElement[];
  /** Re-edit one element and lock every other box to the first reference. */
  lockExceptId?: string;
  aspectRatio?: string;
  resolution?: string;
  grounding?: boolean;
  safetyTolerance?: number;
}

export class Flux3LayoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Flux3LayoutError";
  }
}

const ELEMENT_ID = /^[a-z][a-z0-9]*_[0-9]+$/;

/**
 * Body field for generate-madison-image. Non-FLUX providers omit it.
 * An unsupported canvas ratio (such as 10:11) falls back to 4:5 so the
 * request is not rejected with HTTP 422.
 */
export function flux3RequestForProvider(
  aiProvider: string | null | undefined,
  request: Flux3ClientRequest | null | undefined,
  fallbackAspect?: string | null,
): Flux3ClientRequest | undefined {
  if (!isBflFlux3AiProvider(aiProvider)) return undefined;
  const aspectRatio = request?.aspectRatio
    ?? (isFlux3AspectRatio(fallbackAspect ?? undefined) ? fallbackAspect ?? undefined : "4:5");
  return {
    ...(request?.caption ? { caption: request.caption } : {}),
    ...(request?.elements && request.elements.length > 0 ? { elements: request.elements } : {}),
    ...(request?.lockExceptId ? { lockExceptId: request.lockExceptId } : {}),
    ...(aspectRatio ? { aspectRatio } : {}),
    ...(request?.resolution ? { resolution: request.resolution } : {}),
    ...(request?.grounding !== undefined ? { grounding: request.grounding } : {}),
    ...(request?.safetyTolerance !== undefined ? { safetyTolerance: request.safetyTolerance } : {}),
  };
}

export function isBflFlux3AiProvider(value: string | null | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return (
    normalized === BFL_FLUX3_AI_PROVIDER ||
    normalized === "bfl" ||
    normalized === "flux-3-image" ||
    normalized === "flux3-image" ||
    normalized === "bfl-flux-3"
  );
}

export function isFlux3AspectRatio(value: string | null | undefined): value is Flux3AspectRatio {
  return typeof value === "string" && (FLUX3_ASPECT_RATIOS as readonly string[]).includes(value);
}

export function isFlux3Resolution(value: string | null | undefined): value is Flux3Resolution {
  return typeof value === "string" && (FLUX3_RESOLUTIONS as readonly string[]).includes(value);
}

export function resolveFlux3AspectRatio(aspectRatio: string | null | undefined): Flux3AspectRatio {
  const value = aspectRatio?.trim();
  if (!value) return "auto";
  if (isFlux3AspectRatio(value)) return value;
  throw new Flux3LayoutError(
    `FLUX 3 Image does not accept aspect ratio "${value}". Supported ratios: ${FLUX3_ASPECT_RATIOS.join(", ")}. Product shots usually use 4:5. The Best Bottles 10:11 catalog canvas is not a FLUX 3 ratio.`,
  );
}

export function mapMadisonResolutionToFlux3(resolution: string | null | undefined): Flux3Resolution {
  const value = resolution?.trim().toLowerCase();
  if (!value || value === "standard") return "1k";
  if (value === "high") return "2k";
  if (isFlux3Resolution(value)) return value;
  throw new Flux3LayoutError(
    `Unsupported FLUX 3 resolution "${resolution}". Use standard (1k), high (2k), 4k, or one of ${FLUX3_RESOLUTIONS.join(", ")}.`,
  );
}

function assertElementId(id: unknown): string {
  if (typeof id !== "string" || !ELEMENT_ID.test(id)) {
    throw new Flux3LayoutError(
      `Layout element id "${String(id)}" must look like bottle_1: lowercase letters, then an underscore and a number.`,
    );
  }
  return id;
}

export function normalizeFlux3BBox(value: unknown, field: string): Flux3BBox {
  if (!Array.isArray(value) || value.length !== 4) {
    throw new Flux3LayoutError(`${field} must be [y_min, x_min, y_max, x_max].`);
  }
  const coords = value.map((entry, index) => {
    if (typeof entry !== "number" || !Number.isInteger(entry) || entry < 0 || entry > 1000) {
      throw new Flux3LayoutError(
        `${field}[${index}] must be an integer from 0 to 1000.`,
      );
    }
    return entry;
  });
  const [yMin, xMin, yMax, xMax] = coords;
  if (yMax <= yMin || xMax <= xMin) {
    throw new Flux3LayoutError(`${field} must have y_max greater than y_min and x_max greater than x_min.`);
  }
  return [yMin, xMin, yMax, xMax];
}

function isEditElement(value: Flux3LayoutElement): value is Flux3EditElement {
  return "from" in value || "src_bbox" in value || "tgt_bbox" in value;
}

function normalizeElement(value: unknown, index: number): Flux3LayoutElement {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Flux3LayoutError(`Layout element ${index + 1} must be an object.`);
  }
  const raw = value as Record<string, unknown>;
  const id = assertElementId(raw.id);
  if (typeof raw.desc !== "string" || raw.desc.trim().length === 0) {
    throw new Flux3LayoutError(`Layout element ${id} needs a description.`);
  }
  const desc = raw.desc.trim();
  const hasEditField = "from" in raw || "src_bbox" in raw || "tgt_bbox" in raw;
  if (hasEditField) {
    return {
      id,
      desc,
      from: raw.from === null ? null : typeof raw.from === "string" ? raw.from.trim() : (() => {
        throw new Flux3LayoutError(`Layout element ${id} field "from" must be a reference id such as ref_image_0, or null.`);
      })(),
      src_bbox: raw.src_bbox === null ? null : normalizeFlux3BBox(raw.src_bbox, `${id}.src_bbox`),
      tgt_bbox: raw.tgt_bbox === null ? null : normalizeFlux3BBox(raw.tgt_bbox, `${id}.tgt_bbox`),
    };
  }
  return {
    id,
    desc,
    bbox: normalizeFlux3BBox(raw.bbox, `${id}.bbox`),
  };
}

export function parseFlux3ClientRequest(value: unknown): Flux3ClientRequest | null {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Flux3LayoutError("flux3 must be an object with a caption and optional layout elements.");
  }
  const raw = value as Record<string, unknown>;
  const request: Flux3ClientRequest = {};
  if (raw.caption !== undefined) {
    if (typeof raw.caption !== "string") throw new Flux3LayoutError("flux3.caption must be text.");
    const caption = raw.caption.trim();
    if (caption) request.caption = caption;
  }
  if (raw.lockExceptId !== undefined && raw.lockExceptId !== null && raw.lockExceptId !== "") {
    request.lockExceptId = assertElementId(raw.lockExceptId);
  }
  if (raw.aspectRatio !== undefined && raw.aspectRatio !== null && raw.aspectRatio !== "") {
    if (typeof raw.aspectRatio !== "string") throw new Flux3LayoutError("flux3.aspectRatio must be text.");
    request.aspectRatio = resolveFlux3AspectRatio(raw.aspectRatio);
  }
  if (raw.resolution !== undefined && raw.resolution !== null && raw.resolution !== "") {
    if (typeof raw.resolution !== "string") throw new Flux3LayoutError("flux3.resolution must be text.");
    request.resolution = mapMadisonResolutionToFlux3(raw.resolution);
  }
  if (raw.grounding !== undefined) {
    if (typeof raw.grounding !== "boolean") throw new Flux3LayoutError("flux3.grounding must be true or false.");
    request.grounding = raw.grounding;
  }
  if (raw.safetyTolerance !== undefined && raw.safetyTolerance !== null) {
    if (
      typeof raw.safetyTolerance !== "number" ||
      !Number.isInteger(raw.safetyTolerance) ||
      raw.safetyTolerance < 0 ||
      raw.safetyTolerance > 4
    ) {
      throw new Flux3LayoutError("flux3.safetyTolerance must be an integer from 0 to 4.");
    }
    request.safetyTolerance = raw.safetyTolerance;
  }
  if (raw.elements !== undefined && raw.elements !== null) {
    if (!Array.isArray(raw.elements)) throw new Flux3LayoutError("flux3.elements must be a list.");
    if (raw.elements.length > FLUX3_MAX_LAYOUT_ELEMENTS) {
      throw new Flux3LayoutError(`FLUX 3 layout accepts at most ${FLUX3_MAX_LAYOUT_ELEMENTS} elements.`);
    }
    const elements = raw.elements.map((element, index) => normalizeElement(element, index));
    const seen = new Set<string>();
    for (const element of elements) {
      if (seen.has(element.id)) throw new Flux3LayoutError(`Layout element id "${element.id}" is duplicated.`);
      seen.add(element.id);
    }
    const editCount = elements.filter(isEditElement).length;
    if (editCount !== 0 && editCount !== elements.length) {
      throw new Flux3LayoutError("Layout rows must all be generation boxes or all be edit rows. Do not mix bbox with from/src_bbox/tgt_bbox.");
    }
    request.elements = elements;
  }
  if (request.lockExceptId && !request.elements?.some((element) => element.id === request.lockExceptId)) {
    throw new Flux3LayoutError(`lockExceptId "${request.lockExceptId}" does not match a layout element.`);
  }
  return request;
}

function elementBox(element: Flux3LayoutElement): Flux3BBox {
  if (isEditElement(element)) {
    return element.tgt_bbox ?? element.src_bbox ?? (() => {
      throw new Flux3LayoutError(`Element ${element.id} needs a box before it can be locked or re-edited.`);
    })();
  }
  return element.bbox;
}

/**
 * Keep every element except `targetId` pixel-stable by repeating its box as a
 * Keep row on ref_image_0. The target becomes a New row so FLUX replaces only
 * that region.
 */
export function applySingleElementLock(
  elements: Flux3LayoutElement[],
  targetId: string,
  sourceRef = "ref_image_0",
): Flux3EditElement[] {
  if (!elements.some((element) => element.id === targetId)) {
    throw new Flux3LayoutError(`No layout element "${targetId}" to re-edit.`);
  }
  return elements.map((element) => {
    const box = elementBox(element);
    if (element.id !== targetId) {
      return {
        id: element.id,
        desc: element.desc,
        from: sourceRef,
        src_bbox: box,
        tgt_bbox: box,
      };
    }
    if (isEditElement(element) && (element.from !== undefined || element.tgt_bbox !== undefined)) {
      return {
        id: element.id,
        desc: element.desc,
        from: element.from,
        src_bbox: element.src_bbox,
        tgt_bbox: element.tgt_bbox,
      };
    }
    return {
      id: element.id,
      desc: element.desc,
      from: null,
      src_bbox: null,
      tgt_bbox: box,
    };
  });
}

function serializeElement(element: Flux3LayoutElement): Record<string, unknown> {
  if (isEditElement(element)) {
    return {
      id: element.id,
      from: element.from,
      src_bbox: element.src_bbox,
      tgt_bbox: element.tgt_bbox,
      desc: element.desc,
    };
  }
  return {
    id: element.id,
    bbox: element.bbox,
    desc: element.desc,
  };
}

export function buildFlux3LayoutPrompt(caption: string, elements: Flux3LayoutElement[]): string {
  const trimmed = caption.trim();
  if (!trimmed) throw new Flux3LayoutError("FLUX 3 layout needs a scene caption.");
  if (elements.length === 0) throw new Flux3LayoutError("FLUX 3 layout needs at least one element.");
  let text = trimmed;
  for (const element of elements) {
    const citation = `<${element.id}>`;
    if (!text.includes(citation)) text += ` ${citation}`;
  }
  return `${text} ${JSON.stringify(elements.map(serializeElement))}`;
}

export function composeFlux3Prompt(input: {
  scenePrompt: string;
  enhancedPrompt: string;
  request: Flux3ClientRequest | null;
  /** A product reference is attached; append scene-integration directives. */
  hasProductReference?: boolean;
  /** Product facts block (closure, capacity, relative size). */
  productFacts?: string;
}): { prompt: string; singleElementEdit: boolean } {
  const request = input.request;
  const caption = request?.caption?.trim() || input.scenePrompt.trim();
  const elements = request?.elements ?? [];
  if (elements.length === 0) {
    const base = caption || input.enhancedPrompt.trim();
    if (!base) throw new Flux3LayoutError("FLUX 3 Image requires a prompt.");
    const facts = input.productFacts?.trim() ? `\n\n${input.productFacts.trim()}` : "";
    const prompt = input.hasProductReference ? `${base}${facts}\n\n${sceneIntegrationSentence()}` : base;
    return { prompt, singleElementEdit: false };
  }
  const rows = request?.lockExceptId
    ? applySingleElementLock(elements, request.lockExceptId)
    : elements;
  let scene = caption || input.scenePrompt.trim();
  if (!scene) throw new Flux3LayoutError("FLUX 3 layout needs a scene caption that names each element.");
  if (request?.lockExceptId && !scene.includes("<ref_image_0>")) {
    scene = `In <ref_image_0>, change only <${request.lockExceptId}> and keep every other listed element unchanged. ${scene}`;
  }
  return {
    prompt: buildFlux3LayoutPrompt(scene, rows),
    singleElementEdit: Boolean(request?.lockExceptId),
  };
}

const FLUX3_REQUEST_KEYS = [
  "prompt",
  "images",
  "aspect_ratio",
  "resolution",
  "safety_tolerance",
  "grounding",
] as const;

export interface Flux3RequestInput {
  prompt: string;
  images?: string[];
  aspectRatio?: string | null;
  resolution?: string | null;
  safetyTolerance?: number;
  grounding?: boolean;
}

export function buildFlux3RequestBody(input: Flux3RequestInput): Record<string, unknown> {
  const prompt = input.prompt?.trim();
  if (!prompt) throw new Flux3LayoutError("FLUX 3 Image requires a prompt.");
  const body: Record<string, unknown> = { prompt };
  if (input.images && input.images.length > 0) {
    if (input.images.length > FLUX3_MAX_REFERENCE_IMAGES) {
      throw new Flux3LayoutError(
        `FLUX 3 Image accepts at most ${FLUX3_MAX_REFERENCE_IMAGES} reference images.`,
      );
    }
    body.images = input.images;
  }
  if (input.aspectRatio !== undefined && input.aspectRatio !== null && input.aspectRatio !== "") {
    body.aspect_ratio = resolveFlux3AspectRatio(input.aspectRatio);
  }
  if (input.resolution !== undefined && input.resolution !== null && input.resolution !== "") {
    body.resolution = mapMadisonResolutionToFlux3(input.resolution);
  }
  if (input.safetyTolerance !== undefined) {
    if (!Number.isInteger(input.safetyTolerance) || input.safetyTolerance < 0 || input.safetyTolerance > 4) {
      throw new Flux3LayoutError("safety_tolerance must be an integer from 0 to 4.");
    }
    body.safety_tolerance = input.safetyTolerance;
  }
  if (input.grounding !== undefined) body.grounding = input.grounding;

  for (const key of Object.keys(body)) {
    if (!(FLUX3_REQUEST_KEYS as readonly string[]).includes(key)) {
      throw new Flux3LayoutError(`Refusing to send unknown FLUX 3 field "${key}".`);
    }
  }
  return body;
}

export interface Flux3ReferenceGroups {
  product: string[];
  component: string[];
  background: string[];
  style: string[];
  /** "place" sends the background set before the product. */
  lane?: "place" | "match" | null;
}

export interface Flux3ReferenceCollection {
  images: string[];
  skipped: string[];
}

function flux3ImageInputFromReference(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("data:")) {
    const match = trimmed.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,([A-Za-z0-9+/=\s]+)$/);
    if (!match?.[1]) return null;
    const payload = match[1].replace(/\s/g, "");
    return payload.length >= 16 ? payload : null;
  }
  return isPubliclyFetchableUrl(trimmed) ? trimmed : null;
}

export function collectFlux3ReferenceImages(groups: Flux3ReferenceGroups): Flux3ReferenceCollection {
  const ordered = groups.lane === "place"
    ? [...groups.background, ...groups.product, ...groups.component, ...groups.style]
    : [...groups.product, ...groups.component, ...groups.background, ...groups.style];
  const images: string[] = [];
  const skipped: string[] = [];
  for (const url of ordered) {
    const input = flux3ImageInputFromReference(url);
    if (!input) {
      if (url.trim()) skipped.push(url.trim().slice(0, 80));
      continue;
    }
    images.push(input);
  }
  if (images.length > FLUX3_MAX_REFERENCE_IMAGES) {
    throw new Flux3LayoutError(
      `FLUX 3 Image accepts at most ${FLUX3_MAX_REFERENCE_IMAGES} reference images (${images.length} were usable). Remove extras and try again.`,
    );
  }
  return { images, skipped };
}

/** Bottle, surface, and window light for a 4:5 Best Bottles-style product shot. */
export const BEST_BOTTLES_PRODUCT_SHOT_LAYOUT: {
  aspectRatio: Flux3AspectRatio;
  resolution: Flux3Resolution;
  caption: string;
  elements: Flux3GenerateElement[];
} = {
  aspectRatio: "4:5",
  resolution: "2k",
  caption:
    "Studio product photograph. A clear glass bottle <bottle_1> stands upright and centered on a warm stone surface <surface_1>, label facing the camera. Soft daylight <light_1> falls from a tall window at the upper left. Quiet contact shadow, no extra props, no rendered type.",
  elements: [
    {
      id: "surface_1",
      bbox: [680, 0, 1000, 1000],
      desc: "A warm honed limestone surface filling the lower frame, with a soft ambient contact shadow where the bottle meets the stone.",
    },
    {
      id: "bottle_1",
      bbox: [90, 300, 860, 700],
      desc: "A clear cylindrical glass bottle with the cap on, label facing the camera, centered, true product proportions, no distortion.",
    },
    {
      id: "light_1",
      bbox: [0, 0, 320, 380],
      desc: "Soft daylight from a tall window at the upper left, gentle highlights along the glass shoulder and a quiet falloff toward the right.",
    },
  ],
};
