/**
 * Bottle Label Generator
 * Wraparound label for perfume bottles (360° coverage)
 */

import type { DielineOutput } from './tuck-end-box';

export interface BottleLabelDimensions {
  circumference: number; // mm (wraps around bottle)
  height: number; // mm
  overlap?: number; // mm (default: 10mm)
  bleed?: number;
}

export function generateBottleLabel(dims: BottleLabelDimensions): DielineOutput {
  const { circumference: C, height: H } = dims;
  const overlap = dims.overlap || 10;
  const B = dims.bleed || 3;
  const padding = 20;

  const total_width = C + overlap;
  const front_w = C * 0.4;
  const back_w = C * 0.4;
  const side_w = (C - front_w - back_w) / 2;

  let x = padding + B;
  let y = padding + B;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total_width + padding * 2 + B * 2}" ${H + padding * 2 + B * 2}" width="${total_width + padding * 2 + B * 2}mm" height="${H + padding * 2 + B * 2}mm">
  <!-- Full label area -->
  <rect fill="none" stroke="#000" stroke-width="0.5" x="${x}" y="${y}" width="${total_width}" height="${H}"/>

  <!-- Front panel zone -->
  <rect fill="rgba(0,255,0,0.1)" stroke="#00FF00" stroke-width="0.3" stroke-dasharray="2,2" x="${x + side_w}" y="${y + 5}" width="${front_w}" height="${H - 10}"/>
  <text x="${x + side_w + front_w / 2}" y="${y + H / 2}" font-size="12" text-anchor="middle" fill="#666">FRONT</text>

  <!-- Back panel zone -->
  <rect fill="rgba(0,255,0,0.1)" stroke="#00FF00" stroke-width="0.3" stroke-dasharray="2,2" x="${x + side_w + front_w + side_w}" y="${y + 5}" width="${back_w}" height="${H - 10}"/>
  <text x="${x + side_w + front_w + side_w + back_w / 2}" y="${y + H / 2}" font-size="12" text-anchor="middle" fill="#666">BACK</text>

  <!-- Overlap zone -->
  <rect fill="rgba(0,0,255,0.1)" stroke="#0000FF" stroke-width="0.3" x="${x + C}" y="${y}" width="${overlap}" height="${H}"/>
  <text x="${x + C + overlap / 2}" y="${y + H / 2}" font-size="8" text-anchor="middle" fill="#00F" transform="rotate(-90 ${x + C + overlap / 2} ${y + H / 2})">GLUE</text>

  <!-- Fold line indicators -->
  <line stroke="#FF0000" stroke-width="0.3" stroke-dasharray="3,2" x1="${x + side_w}" y1="${y}" x2="${x + side_w}" y2="${y + H}"/>
  <line stroke="#FF0000" stroke-width="0.3" stroke-dasharray="3,2" x1="${x + side_w + front_w}" y1="${y}" x2="${x + side_w + front_w}" y2="${y + H}"/>
  <line stroke="#FF0000" stroke-width="0.3" stroke-dasharray="3,2" x1="${x + side_w + front_w + side_w}" y1="${y}" x2="${x + side_w + front_w + side_w}" y2="${y + H}"/>
  <line stroke="#0000FF" stroke-width="0.3" stroke-dasharray="3,2" x1="${x + C}" y1="${y}" x2="${x + C}" y2="${y + H}"/>

  <!-- Dimensions annotation -->
  <text x="${x + total_width / 2}" y="${y - 5}" font-size="8" text-anchor="middle" fill="#999">${C}mm circumference + ${overlap}mm overlap</text>
  <text x="${x - 5}" y="${y + H / 2}" font-size="8" text-anchor="end" fill="#999">${H}mm</text>
</svg>`;

  // For labels, manufacture/inner/outer are the same (no box structure)
  const manufacture = { width: C, height: H, depth: 0 };
  const inner = { width: C, height: H, depth: 0 };
  const outer = { width: C, height: H, depth: 0 };

  // Annotations for label
  const annotations = [
    {
      id: "label-width",
      label: `${C.toFixed(1)}mm`,
      value: C,
      x1: x,
      y1: y - 10,
      x2: x + C,
      y2: y - 10,
      orientation: "horizontal" as const,
    },
    {
      id: "label-height",
      label: `${H.toFixed(1)}mm`,
      value: H,
      x1: x - 10,
      y1: y,
      x2: x - 10,
      y2: y + H,
      orientation: "vertical" as const,
    },
  ];

  return {
    svg,
    panels: [],
    dimensions: {
      total_width: total_width + padding * 2 + B * 2,
      total_height: H + padding * 2 + B * 2,
      box_width: C,
      box_height: H,
      box_depth: 0,
      manufacture,
      inner,
      outer,
    },
    annotations,
  };
}
