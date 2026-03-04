/**
 * Canvas Dimension Annotations
 *
 * Utilities for adding professional dimension lines and labels to Fabric.js canvas
 * Inspired by Pacdora's technical annotation style
 */

import { fabric } from "fabric";
import type { DimensionAnnotation } from "./generators/tuck-end-box";

// Anti-Gravity Design System Colors
const COLORS = {
  CYAN: "#00f0ff",
  PURPLE: "#8b5cf6",
  RED: "#ff3366",
  MUTED: "#888899",
};

/**
 * Add dimension annotations to canvas
 */
export function addDimensionAnnotations(
  canvas: fabric.Canvas,
  annotations: DimensionAnnotation[],
  scale: number = 1
): void {
  annotations.forEach((annotation) => {
    addDimensionLine(canvas, annotation, scale);
  });
}

/**
 * Add a single dimension line with arrows and label
 */
function addDimensionLine(
  canvas: fabric.Canvas,
  annotation: DimensionAnnotation,
  scale: number
): void {
  const { x1, y1, x2, y2, label, orientation } = annotation;

  // Scale coordinates
  const sx1 = x1 * scale;
  const sy1 = y1 * scale;
  const sx2 = x2 * scale;
  const sy2 = y2 * scale;

  // Main dimension line
  const line = new fabric.Line([sx1, sy1, sx2, sy2], {
    stroke: COLORS.CYAN,
    strokeWidth: 1,
    selectable: false,
    evented: false,
    name: `dimension-line-${annotation.id}`,
  });

  canvas.add(line);

  // Arrow heads
  const arrowSize = 6;
  if (orientation === "horizontal") {
    // Left arrow
    addArrowHead(canvas, sx1, sy1, "left", scale);
    // Right arrow
    addArrowHead(canvas, sx2, sy2, "right", scale);
  } else {
    // Top arrow
    addArrowHead(canvas, sx1, sy1, "up", scale);
    // Bottom arrow
    addArrowHead(canvas, sx2, sy2, "down", scale);
  }

  // Dimension label
  const labelX = (sx1 + sx2) / 2;
  const labelY = (sy1 + sy2) / 2;

  const text = new fabric.Text(label, {
    left: labelX,
    top: labelY - (orientation === "horizontal" ? 10 : 0),
    originX: "center",
    originY: "center",
    fontSize: 10 * scale,
    fill: COLORS.CYAN,
    fontFamily: "JetBrains Mono, monospace",
    fontWeight: 500,
    selectable: false,
    evented: false,
    name: `dimension-label-${annotation.id}`,
    shadow: new fabric.Shadow({
      color: "rgba(0, 240, 255, 0.5)",
      blur: 4,
    }),
  });

  canvas.add(text);

  // Extension lines (perpendicular to dimension line)
  const extensionLength = 10 * scale;
  if (orientation === "horizontal") {
    // Vertical extension lines
    addExtensionLine(canvas, sx1, sy1, sx1, sy1 + extensionLength, scale);
    addExtensionLine(canvas, sx2, sy2, sx2, sy2 + extensionLength, scale);
  } else {
    // Horizontal extension lines
    addExtensionLine(canvas, sx1, sy1, sx1 + extensionLength, sy1, scale);
    addExtensionLine(canvas, sx2, sy2, sx2 + extensionLength, sy2, scale);
  }
}

/**
 * Add arrow head
 */
function addArrowHead(
  canvas: fabric.Canvas,
  x: number,
  y: number,
  direction: "left" | "right" | "up" | "down",
  scale: number
): void {
  const arrowSize = 6 * scale;

  let points: number[] = [];

  switch (direction) {
    case "left":
      points = [x, y, x + arrowSize, y - arrowSize / 2, x + arrowSize, y + arrowSize / 2];
      break;
    case "right":
      points = [x, y, x - arrowSize, y - arrowSize / 2, x - arrowSize, y + arrowSize / 2];
      break;
    case "up":
      points = [x, y, x - arrowSize / 2, y + arrowSize, x + arrowSize / 2, y + arrowSize];
      break;
    case "down":
      points = [x, y, x - arrowSize / 2, y - arrowSize, x + arrowSize / 2, y - arrowSize];
      break;
  }

  const arrow = new fabric.Polygon(
    [
      { x: points[0], y: points[1] },
      { x: points[2], y: points[3] },
      { x: points[4], y: points[5] },
    ],
    {
      fill: COLORS.CYAN,
      stroke: COLORS.CYAN,
      strokeWidth: 1,
      selectable: false,
      evented: false,
    }
  );

  canvas.add(arrow);
}

/**
 * Add extension line
 */
function addExtensionLine(
  canvas: fabric.Canvas,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  scale: number
): void {
  const line = new fabric.Line([x1, y1, x2, y2], {
    stroke: COLORS.CYAN,
    strokeWidth: 0.5,
    strokeDashArray: [2 * scale, 2 * scale],
    selectable: false,
    evented: false,
    opacity: 0.6,
  });

  canvas.add(line);
}

/**
 * Remove all dimension annotations from canvas
 */
export function removeDimensionAnnotations(canvas: fabric.Canvas): void {
  const objects = canvas.getObjects();
  const annotationObjects = objects.filter((obj) =>
    obj.name?.startsWith("dimension-")
  );

  annotationObjects.forEach((obj) => {
    canvas.remove(obj);
  });

  canvas.renderAll();
}

/**
 * Toggle dimension annotations visibility
 */
export function toggleDimensionAnnotations(canvas: fabric.Canvas, visible: boolean): void {
  const objects = canvas.getObjects();
  const annotationObjects = objects.filter((obj) =>
    obj.name?.startsWith("dimension-")
  );

  annotationObjects.forEach((obj) => {
    obj.set({ visible });
  });

  canvas.renderAll();
}
