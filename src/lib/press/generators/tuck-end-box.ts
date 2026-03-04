/**
 * Tuck-End Box Parametric Generator
 *
 * Generates industry-standard tuck-end box dielines based on FEFCO standards.
 * Common for perfume bottles, cosmetics, and luxury packaging.
 *
 * Reference: FEFCO 0401 (Tuck-End Box with Automatic Bottom)
 */

export interface TuckEndBoxDimensions {
  width: number; // mm
  height: number; // mm
  depth: number; // mm
  materialThickness?: number; // mm (default: 0.5mm)
  bleed?: number; // mm (default: 3mm)
}

export interface PanelDefinition {
  id: string;
  type: "panel" | "flap" | "glue_tab";
  path: string; // SVG path
  bounds: { x: number; y: number; width: number; height: number };
  label: string;
}

export interface DimensionAnnotation {
  id: string;
  label: string;
  value: number; // in mm
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  orientation: "horizontal" | "vertical";
}

export interface DielineOutput {
  svg: string;
  panels: PanelDefinition[];
  dimensions: {
    total_width: number;
    total_height: number;
    box_width: number;
    box_height: number;
    box_depth: number;
    // Enhanced with manufacture dimensions
    manufacture: {
      width: number;
      height: number;
      depth: number;
    };
    inner: {
      width: number;
      height: number;
      depth: number;
    };
    outer: {
      width: number;
      height: number;
      depth: number;
    };
  };
  annotations?: DimensionAnnotation[]; // Optional dimension lines
}

/**
 * Generate a tuck-end box dieline with proper geometry
 */
export function generateTuckEndBox(dims: TuckEndBoxDimensions): DielineOutput {
  const { width: W, height: H, depth: D } = dims;
  const T = dims.materialThickness || 0.5;
  const B = dims.bleed || 3;

  // Calculate panel dimensions (accounting for material thickness)
  const front_w = W;
  const front_h = H;
  const side_w = D;
  const side_h = H;
  const top_w = W;
  const top_d = D;
  const bottom_w = W;
  const bottom_d = D;

  // Calculate flap dimensions
  const top_flap_h = D * 0.6; // 60% of depth
  const bottom_flap_h = D * 0.5; // 50% of depth
  const glue_tab_w = 12; // Standard 12mm glue tab

  // Layout calculation (standard tuck-end unfolded pattern)
  const padding = 20; // Workspace padding

  // Starting coordinates
  let x = padding + B;
  let y = padding + B;

  // Layout structure (from left to right):
  // [Glue Tab] [Left Side] [Front] [Right Side] [Back]
  // With top and bottom flaps extending from front and back

  const panels: PanelDefinition[] = [];

  // === GLUE TAB ===
  const glue_tab = {
    id: "glue-tab",
    type: "glue_tab" as const,
    x,
    y: y + top_flap_h,
    width: glue_tab_w,
    height: side_h,
  };
  panels.push({
    ...glue_tab,
    path: `M ${glue_tab.x},${glue_tab.y}
           L ${glue_tab.x + glue_tab.width},${glue_tab.y}
           L ${glue_tab.x + glue_tab.width},${glue_tab.y + glue_tab.height}
           L ${glue_tab.x},${glue_tab.y + glue_tab.height} Z`,
    bounds: { x: glue_tab.x, y: glue_tab.y, width: glue_tab.width, height: glue_tab.height },
    label: "Glue Tab",
  });

  x += glue_tab_w;

  // === LEFT SIDE ===
  const left_side = {
    id: "left-side",
    type: "panel" as const,
    x,
    y: y + top_flap_h,
    width: side_w,
    height: side_h,
  };
  panels.push({
    ...left_side,
    path: `M ${left_side.x},${left_side.y}
           L ${left_side.x + left_side.width},${left_side.y}
           L ${left_side.x + left_side.width},${left_side.y + left_side.height}
           L ${left_side.x},${left_side.y + left_side.height} Z`,
    bounds: { x: left_side.x, y: left_side.y, width: left_side.width, height: left_side.height },
    label: "Left Side",
  });

  x += side_w;

  // === FRONT PANEL (with top and bottom flaps) ===
  const front_panel = {
    id: "front",
    type: "panel" as const,
    x,
    y: y + top_flap_h,
    width: front_w,
    height: front_h,
  };
  panels.push({
    ...front_panel,
    path: `M ${front_panel.x},${front_panel.y}
           L ${front_panel.x + front_panel.width},${front_panel.y}
           L ${front_panel.x + front_panel.width},${front_panel.y + front_panel.height}
           L ${front_panel.x},${front_panel.y + front_panel.height} Z`,
    bounds: { x: front_panel.x, y: front_panel.y, width: front_panel.width, height: front_panel.height },
    label: "Front Panel",
  });

  // Top flap (extends from front)
  const top_flap = {
    id: "top-flap",
    type: "flap" as const,
    x: front_panel.x,
    y: front_panel.y - top_flap_h,
    width: front_w,
    height: top_flap_h,
  };
  panels.push({
    ...top_flap,
    path: `M ${top_flap.x},${top_flap.y}
           L ${top_flap.x + top_flap.width},${top_flap.y}
           L ${top_flap.x + top_flap.width},${top_flap.y + top_flap.height}
           L ${top_flap.x},${top_flap.y + top_flap.height} Z`,
    bounds: { x: top_flap.x, y: top_flap.y, width: top_flap.width, height: top_flap.height },
    label: "Top Tuck Flap",
  });

  // Bottom flap (extends from front)
  const bottom_flap = {
    id: "bottom-flap",
    type: "flap" as const,
    x: front_panel.x,
    y: front_panel.y + front_panel.height,
    width: front_w,
    height: bottom_flap_h,
  };
  panels.push({
    ...bottom_flap,
    path: `M ${bottom_flap.x},${bottom_flap.y}
           L ${bottom_flap.x + bottom_flap.width},${bottom_flap.y}
           L ${bottom_flap.x + bottom_flap.width},${bottom_flap.y + bottom_flap.height}
           L ${bottom_flap.x},${bottom_flap.y + bottom_flap.height} Z`,
    bounds: { x: bottom_flap.x, y: bottom_flap.y, width: bottom_flap.width, height: bottom_flap.height },
    label: "Bottom Lock Flap",
  });

  x += front_w;

  // === BOTTOM PANEL ===
  const bottom_panel = {
    id: "bottom",
    type: "panel" as const,
    x,
    y: front_panel.y + front_panel.height,
    width: bottom_w,
    height: bottom_d,
  };
  panels.push({
    ...bottom_panel,
    path: `M ${bottom_panel.x},${bottom_panel.y}
           L ${bottom_panel.x + bottom_panel.width},${bottom_panel.y}
           L ${bottom_panel.x + bottom_panel.width},${bottom_panel.y + bottom_panel.height}
           L ${bottom_panel.x},${bottom_panel.y + bottom_panel.height} Z`,
    bounds: { x: bottom_panel.x, y: bottom_panel.y, width: bottom_panel.width, height: bottom_panel.height },
    label: "Bottom Panel",
  });

  // === RIGHT SIDE ===
  const right_side = {
    id: "right-side",
    type: "panel" as const,
    x,
    y: y + top_flap_h,
    width: side_w,
    height: side_h,
  };
  panels.push({
    ...right_side,
    path: `M ${right_side.x},${right_side.y}
           L ${right_side.x + right_side.width},${right_side.y}
           L ${right_side.x + right_side.width},${right_side.y + right_side.height}
           L ${right_side.x},${right_side.y + right_side.height} Z`,
    bounds: { x: right_side.x, y: right_side.y, width: right_side.width, height: right_side.height },
    label: "Right Side",
  });

  x += side_w;

  // === BACK PANEL (with top panel above) ===
  const back_panel = {
    id: "back",
    type: "panel" as const,
    x,
    y: y + top_flap_h,
    width: front_w,
    height: front_h,
  };
  panels.push({
    ...back_panel,
    path: `M ${back_panel.x},${back_panel.y}
           L ${back_panel.x + back_panel.width},${back_panel.y}
           L ${back_panel.x + back_panel.width},${back_panel.y + back_panel.height}
           L ${back_panel.x},${back_panel.y + back_panel.height} Z`,
    bounds: { x: back_panel.x, y: back_panel.y, width: back_panel.width, height: back_panel.height },
    label: "Back Panel",
  });

  // Top panel (extends from back)
  const top_panel = {
    id: "top",
    type: "panel" as const,
    x: back_panel.x,
    y: back_panel.y - top_d,
    width: top_w,
    height: top_d,
  };
  panels.push({
    ...top_panel,
    path: `M ${top_panel.x},${top_panel.y}
           L ${top_panel.x + top_panel.width},${top_panel.y}
           L ${top_panel.x + top_panel.width},${top_panel.y + top_panel.height}
           L ${top_panel.x},${top_panel.y + top_panel.height} Z`,
    bounds: { x: top_panel.x, y: top_panel.y, width: top_panel.width, height: top_panel.height },
    label: "Top Panel",
  });

  // Calculate total dimensions
  const total_width = x + front_w + padding + B;
  const total_height = y + top_flap_h + front_h + Math.max(bottom_flap_h, bottom_d) + padding + B;

  // Generate dimension annotations
  const annotations: DimensionAnnotation[] = [
    // Front panel width
    {
      id: "front-width",
      label: `${W.toFixed(1)}mm`,
      value: W,
      x1: front_panel.x,
      y1: front_panel.y - 15,
      x2: front_panel.x + front_panel.width,
      y2: front_panel.y - 15,
      orientation: "horizontal",
    },
    // Front panel height
    {
      id: "front-height",
      label: `${H.toFixed(1)}mm`,
      value: H,
      x1: front_panel.x - 15,
      y1: front_panel.y,
      x2: front_panel.x - 15,
      y2: front_panel.y + front_panel.height,
      orientation: "vertical",
    },
    // Side depth
    {
      id: "side-depth",
      label: `${D.toFixed(1)}mm`,
      value: D,
      x1: left_side.x,
      y1: left_side.y - 15,
      x2: left_side.x + left_side.width,
      y2: left_side.y - 15,
      orientation: "horizontal",
    },
  ];

  // Generate SVG
  const svg = generateSVG(panels, total_width, total_height, B);

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

  return {
    svg,
    panels,
    dimensions: {
      total_width,
      total_height,
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

/**
 * Generate complete SVG markup with all panels, fold lines, and markings
 */
function generateSVG(panels: PanelDefinition[], width: number, height: number, bleed: number): string {
  const cutLineColor = "#000000";
  const foldLineColor = "#FF0000";
  const bleedColor = "#0000FF";

  let panelPaths = "";
  let foldLines = "";
  let labels = "";

  panels.forEach((panel) => {
    // Cut lines (solid black)
    panelPaths += `<path d="${panel.path}"
                         fill="none"
                         stroke="${cutLineColor}"
                         stroke-width="0.5"
                         data-panel-id="${panel.id}"
                         data-panel-type="${panel.type}"/>\n`;

    // Fold lines (dashed red) for panel edges
    if (panel.type === "panel") {
      const { x, y, width, height } = panel.bounds;
      foldLines += `<line x1="${x}" y1="${y}" x2="${x + width}" y2="${y}"
                          stroke="${foldLineColor}"
                          stroke-width="0.3"
                          stroke-dasharray="3,2"/>\n`;
      foldLines += `<line x1="${x}" y1="${y + height}" x2="${x + width}" y2="${y + height}"
                          stroke="${foldLineColor}"
                          stroke-width="0.3"
                          stroke-dasharray="3,2"/>\n`;
      foldLines += `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + height}"
                          stroke="${foldLineColor}"
                          stroke-width="0.3"
                          stroke-dasharray="3,2"/>\n`;
      foldLines += `<line x1="${x + width}" y1="${y}" x2="${x + width}" y2="${y + height}"
                          stroke="${foldLineColor}"
                          stroke-width="0.3"
                          stroke-dasharray="3,2"/>\n`;
    }

    // Labels
    labels += `<text x="${panel.bounds.x + panel.bounds.width / 2}"
                     y="${panel.bounds.y + panel.bounds.height / 2}"
                     font-family="Arial"
                     font-size="10"
                     fill="#666666"
                     text-anchor="middle"
                     dominant-baseline="middle">${panel.label}</text>\n`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 ${width} ${height}"
     width="${width}mm"
     height="${height}mm">
  <defs>
    <style>
      .cut-line { stroke: ${cutLineColor}; stroke-width: 0.5; fill: none; }
      .fold-line { stroke: ${foldLineColor}; stroke-width: 0.3; stroke-dasharray: 3,2; fill: none; }
      .bleed-zone { stroke: ${bleedColor}; stroke-width: 0.2; fill: rgba(0,0,255,0.05); }
    </style>
  </defs>

  <!-- Bleed zone -->
  <rect class="bleed-zone" x="0" y="0" width="${width}" height="${height}"/>

  <!-- Fold lines -->
  <g id="fold-lines">
    ${foldLines}
  </g>

  <!-- Cut lines -->
  <g id="cut-lines">
    ${panelPaths}
  </g>

  <!-- Labels -->
  <g id="labels">
    ${labels}
  </g>
</svg>`;
}
