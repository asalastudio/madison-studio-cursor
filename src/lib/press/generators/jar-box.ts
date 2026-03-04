/**
 * Jar Box Generator
 * Square box for skincare jars, creams, balms
 */

import type { DielineOutput } from './tuck-end-box';

export interface JarBoxDimensions {
  width: number;
  height: number;
  depth: number;
  materialThickness?: number;
  bleed?: number;
}

export function generateJarBox(dims: JarBoxDimensions): DielineOutput {
  const { width: W, height: H, depth: D } = dims;
  const B = dims.bleed || 3;
  const padding = 20;

  // Jar boxes are usually square/cube-ish
  const glue_w = 12;
  const flap_h = Math.min(D * 0.7, H * 0.4);

  let x = padding + B;
  let y = padding + B + flap_h;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W * 2 + D * 2 + glue_w + padding * 2}" ${H + flap_h * 2 + padding * 2}" width="${W * 2 + D * 2 + glue_w + padding * 2}mm" height="${H + flap_h * 2 + padding * 2}mm">
  <!-- Glue Tab -->
  <rect fill="none" stroke="#000" stroke-width="0.5" x="${x}" y="${y}" width="${glue_w}" height="${H}"/>
  <text x="${x + 6}" y="${y + H / 2}" font-size="6" text-anchor="middle" transform="rotate(-90 ${x + 6} ${y + H / 2})">GLUE</text>

  <!-- Left Side -->
  <rect fill="none" stroke="#000" stroke-width="0.5" x="${x + glue_w}" y="${y}" width="${D}" height="${H}"/>
  <text x="${x + glue_w + D / 2}" y="${y + H / 2}" font-size="10" text-anchor="middle">LEFT</text>

  <!-- Front Panel with Flaps -->
  <rect fill="none" stroke="#000" stroke-width="0.5" x="${x + glue_w + D}" y="${y - flap_h}" width="${W}" height="${flap_h}"/>
  <text x="${x + glue_w + D + W / 2}" y="${y - flap_h / 2}" font-size="8" text-anchor="middle" fill="#999">Top Flap</text>

  <rect fill="none" stroke="#000" stroke-width="0.5" x="${x + glue_w + D}" y="${y}" width="${W}" height="${H}"/>
  <text x="${x + glue_w + D + W / 2}" y="${y + H / 2}" font-size="14" font-weight="bold" text-anchor="middle">FRONT</text>

  <rect fill="none" stroke="#000" stroke-width="0.5" x="${x + glue_w + D}" y="${y + H}" width="${W}" height="${flap_h}"/>
  <text x="${x + glue_w + D + W / 2}" y="${y + H + flap_h / 2}" font-size="8" text-anchor="middle" fill="#999">Btm Flap</text>

  <!-- Right Side -->
  <rect fill="none" stroke="#000" stroke-width="0.5" x="${x + glue_w + D + W}" y="${y}" width="${D}" height="${H}"/>
  <text x="${x + glue_w + D + W + D / 2}" y="${y + H / 2}" font-size="10" text-anchor="middle">RIGHT</text>

  <!-- Back Panel -->
  <rect fill="none" stroke="#000" stroke-width="0.5" x="${x + glue_w + D + W + D}" y="${y}" width="${W}" height="${H}"/>
  <text x="${x + glue_w + D + W + D + W / 2}" y="${y + H / 2}" font-size="14" font-weight="bold" text-anchor="middle">BACK</text>

  <!-- Fold Lines -->
  <g stroke="#FF0000" stroke-width="0.3" stroke-dasharray="3,2">
    <line x1="${x + glue_w}" y1="${y}" x2="${x + glue_w}" y2="${y + H}"/>
    <line x1="${x + glue_w + D}" y1="${y - flap_h}" x2="${x + glue_w + D}" y2="${y + H + flap_h}"/>
    <line x1="${x + glue_w + D + W}" y1="${y}" x2="${x + glue_w + D + W}" y2="${y + H}"/>
    <line x1="${x + glue_w + D + W + D}" y1="${y}" x2="${x + glue_w + D + W + D}" y2="${y + H}"/>
  </g>
</svg>`;

  return {
    svg,
    panels: [],
    dimensions: {
      total_width: W * 2 + D * 2 + glue_w + padding * 2,
      total_height: H + flap_h * 2 + padding * 2,
      box_width: W,
      box_height: H,
      box_depth: D,
    },
  };
}
