import type { CanvasPortKind } from "./types";

/**
 * Port colours reuse Dark Room LED / accent tokens only.
 * Bone #F5F3EF is a set/backdrop, never chrome or a handle colour.
 */
export const PORT_KIND_CSS_VARS: Record<CanvasPortKind, string> = {
  pack: "var(--darkroom-accent)",
  product: "var(--led-ready)",
  set: "var(--led-active)",
  shot: "var(--lcd-text)",
  job: "var(--darkroom-text-muted)",
  image: "var(--darkroom-glow)",
};

export function portKindCssVar(kind: CanvasPortKind): string {
  return PORT_KIND_CSS_VARS[kind];
}
