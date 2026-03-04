/**
 * Roller Bottle Box Generator
 * Small format box for 10ml roller bottles, perfume oils, attar
 */

import type { DielineOutput } from './tuck-end-box';

export interface RollerBottleBoxDimensions {
  width: number;
  height: number;
  depth: number;
  materialThickness?: number;
  bleed?: number;
}

export function generateRollerBottleBox(dims: RollerBottleBoxDimensions): DielineOutput {
  const { width: W, height: H, depth: D } = dims;
  const T = dims.materialThickness || 0.5;
  const B = dims.bleed || 3;
  const padding = 20;

  // Small box layout
  const glue_w = 10;
  const flap_h = D * 0.5;

  let x = padding + B;
  let y = padding + B + flap_h;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W * 3 + D * 2 + glue_w + padding * 2} ${H + flap_h * 2 + padding * 2}" width="${W * 3 + D * 2 + glue_w + padding * 2}mm" height="${H + flap_h * 2 + padding * 2}mm">
  <rect fill="none" stroke="#000" stroke-width="0.5" x="${x}" y="${y}" width="${glue_w}" height="${H}"/>
  <text x="${x + 5}" y="${y + H / 2}" font-size="8" text-anchor="middle">G</text>

  <rect fill="none" stroke="#000" stroke-width="0.5" x="${x + glue_w}" y="${y}" width="${D}" height="${H}"/>
  <text x="${x + glue_w + D / 2}" y="${y + H / 2}" font-size="8" text-anchor="middle">L</text>

  <rect fill="none" stroke="#000" stroke-width="0.5" x="${x + glue_w + D}" y="${y - flap_h}" width="${W}" height="${flap_h}"/>
  <rect fill="none" stroke="#000" stroke-width="0.5" x="${x + glue_w + D}" y="${y}" width="${W}" height="${H}"/>
  <rect fill="none" stroke="#000" stroke-width="0.5" x="${x + glue_w + D}" y="${y + H}" width="${W}" height="${flap_h}"/>
  <text x="${x + glue_w + D + W / 2}" y="${y + H / 2}" font-size="10" text-anchor="middle">FRONT</text>

  <rect fill="none" stroke="#000" stroke-width="0.5" x="${x + glue_w + D + W}" y="${y}" width="${D}" height="${H}"/>
  <text x="${x + glue_w + D + W + D / 2}" y="${y + H / 2}" font-size="8" text-anchor="middle">R</text>

  <rect fill="none" stroke="#000" stroke-width="0.5" x="${x + glue_w + D + W + D}" y="${y}" width="${W}" height="${H}"/>
  <text x="${x + glue_w + D + W + D + W / 2}" y="${y + H / 2}" font-size="10" text-anchor="middle">BACK</text>

  <line stroke="#FF0000" stroke-width="0.3" stroke-dasharray="3,2" x1="${x}" y1="${y}" x2="${x + W * 2 + D * 2 + glue_w}" y2="${y}"/>
  <line stroke="#FF0000" stroke-width="0.3" stroke-dasharray="3,2" x1="${x}" y1="${y + H}" x2="${x + W * 2 + D * 2 + glue_w}" y2="${y + H}"/>
</svg>`;

  // Calculate manufacture, inner, and outer dimensions
  const manufacture = {
    width: W + (T * 2),
    height: H + (T * 2),
    depth: D + (T * 2),
  };

  const inner = {
    width: W - (T * 2),
    height: H - (T * 2),
    depth: D - (T * 2),
  };

  const outer = {
    width: W,
    height: H,
    depth: D,
  };

  // Generate dimension annotations
  const frontX = x + glue_w + D;
  const annotations = [
    {
      id: "front-width",
      label: `${W.toFixed(1)}mm`,
      value: W,
      x1: frontX,
      y1: y - 10,
      x2: frontX + W,
      y2: y - 10,
      orientation: "horizontal" as const,
    },
    {
      id: "front-height",
      label: `${H.toFixed(1)}mm`,
      value: H,
      x1: frontX - 10,
      y1: y,
      x2: frontX - 10,
      y2: y + H,
      orientation: "vertical" as const,
    },
  ];

  return {
    svg,
    panels: [],
    dimensions: {
      total_width: W * 2 + D * 2 + glue_w + padding * 2,
      total_height: H + flap_h * 2 + padding * 2,
      box_width: W,
      box_height: H,
      box_depth: D,
      manufacture,
      inner,
      outer,
    },
    annotations,
  };
}
