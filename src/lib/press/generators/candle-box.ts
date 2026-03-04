/**
 * Candle Box Generator
 * Square/rectangular box for candles (8oz standard)
 */

import type { DielineOutput } from './tuck-end-box';

export interface CandleBoxDimensions {
  width: number;
  height: number;
  depth: number;
  materialThickness?: number;
  bleed?: number;
}

export function generateCandleBox(dims: CandleBoxDimensions): DielineOutput {
  const { width: W, height: H, depth: D } = dims;
  const B = dims.bleed || 3;
  const padding = 20;

  const glue_w = 12;
  const flap_h = D * 0.6;

  let x = padding + B;
  let y = padding + B + flap_h;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W * 2 + D * 2 + glue_w + padding * 2} ${H + flap_h + D + padding * 2}" width="${W * 2 + D * 2 + glue_w + padding * 2}mm" height="${H + flap_h + D + padding * 2}mm">
  <!-- Glue Tab -->
  <rect fill="none" stroke="#000" stroke-width="0.5" x="${x}" y="${y}" width="${glue_w}" height="${H}"/>

  <!-- Left Side -->
  <rect fill="none" stroke="#000" stroke-width="0.5" x="${x + glue_w}" y="${y}" width="${D}" height="${H}"/>

  <!-- Front with Top Flap -->
  <rect fill="none" stroke="#000" stroke-width="0.5" x="${x + glue_w + D}" y="${y - flap_h}" width="${W}" height="${flap_h}"/>
  <rect fill="none" stroke="#000" stroke-width="0.5" x="${x + glue_w + D}" y="${y}" width="${W}" height="${H}"/>
  <text x="${x + glue_w + D + W / 2}" y="${y + H / 2}" font-size="12" text-anchor="middle">FRONT</text>

  <!-- Bottom Panel -->
  <rect fill="none" stroke="#000" stroke-width="0.5" x="${x + glue_w + D}" y="${y + H}" width="${W}" height="${D}"/>
  <text x="${x + glue_w + D + W / 2}" y="${y + H + D / 2}" font-size="10" text-anchor="middle">BTM</text>

  <!-- Right Side -->
  <rect fill="none" stroke="#000" stroke-width="0.5" x="${x + glue_w + D + W}" y="${y}" width="${D}" height="${H}"/>

  <!-- Back with Top Panel -->
  <rect fill="none" stroke="#000" stroke-width="0.5" x="${x + glue_w + D + W + D}" y="${y - D}" width="${W}" height="${D}"/>
  <rect fill="none" stroke="#000" stroke-width="0.5" x="${x + glue_w + D + W + D}" y="${y}" width="${W}" height="${H}"/>
  <text x="${x + glue_w + D + W + D + W / 2}" y="${y + H / 2}" font-size="12" text-anchor="middle">BACK</text>

  <!-- Fold Lines -->
  <line stroke="#FF0000" stroke-width="0.3" stroke-dasharray="3,2" x1="${x + glue_w}" y1="${y}" x2="${x + glue_w}" y2="${y + H}"/>
  <line stroke="#FF0000" stroke-width="0.3" stroke-dasharray="3,2" x1="${x + glue_w + D}" y1="${y}" x2="${x + glue_w + D}" y2="${y + H}"/>
  <line stroke="#FF0000" stroke-width="0.3" stroke-dasharray="3,2" x1="${x + glue_w + D + W}" y1="${y}" x2="${x + glue_w + D + W}" y2="${y + H}"/>
  <line stroke="#FF0000" stroke-width="0.3" stroke-dasharray="3,2" x1="${x + glue_w + D + W + D}" y1="${y}" x2="${x + glue_w + D + W + D}" y2="${y + H}"/>
</svg>`;

  return {
    svg,
    panels: [],
    dimensions: {
      total_width: W * 2 + D * 2 + glue_w + padding * 2,
      total_height: H + flap_h + D + padding * 2,
      box_width: W,
      box_height: H,
      box_depth: D,
    },
  };
}
