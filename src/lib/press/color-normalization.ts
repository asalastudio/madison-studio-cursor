/**
 * Madison Studio Dieline Color Standards
 *
 * Normalizes any dieline SVG to Madison's consistent color scheme
 */

export const MADISON_DIELINE_COLORS = {
  // Cut lines (where material is cut)
  CUT_LINE: {
    stroke: "#000000",
    strokeWidth: "0.5",
    fill: "none",
    description: "Solid black cut lines",
  },

  // Fold lines (where material folds)
  FOLD_LINE: {
    stroke: "#FF0000",
    strokeWidth: "0.3",
    strokeDasharray: "3,2",
    fill: "none",
    description: "Dashed red fold lines",
  },

  // Bleed zone (extends 3mm beyond cut)
  BLEED_ZONE: {
    stroke: "#0000FF",
    strokeWidth: "0.2",
    fill: "rgba(0, 0, 255, 0.03)",
    description: "Blue bleed indicator",
  },

  // Safe zone (5mm inside cut)
  SAFE_ZONE: {
    stroke: "#00FF00",
    strokeWidth: "0.2",
    strokeDasharray: "2,2",
    fill: "rgba(0, 255, 0, 0.03)",
    description: "Green safe zone indicator",
  },

  // Labels and text
  TEXT_LABEL: {
    fill: "#666666",
    fontSize: "10",
    fontFamily: "Arial, sans-serif",
    description: "Gray labels",
  },

  // Background
  BACKGROUND: "#FFFFFF",
};

/**
 * Normalize any SVG to Madison color standards
 */
export function normalizeDielineColors(svgContent: string): string {
  let normalized = svgContent;

  // Step 1: Detect and normalize cut lines
  // Look for solid black/dark strokes
  normalized = normalized.replace(
    /<(?:path|line|rect|polyline)([^>]*stroke="(?:#000|black|#000000|#222|#333)"[^>]*)>/gi,
    (match) => {
      let updated = match;
      // Set stroke color
      updated = updated.replace(/stroke="[^"]*"/, `stroke="${MADISON_DIELINE_COLORS.CUT_LINE.stroke}"`);
      // Set stroke width if not present
      if (!updated.includes("stroke-width")) {
        updated = updated.replace(">", ` stroke-width="${MADISON_DIELINE_COLORS.CUT_LINE.strokeWidth}">`);
      } else {
        updated = updated.replace(/stroke-width="[^"]*"/, `stroke-width="${MADISON_DIELINE_COLORS.CUT_LINE.strokeWidth}"`);
      }
      // Ensure no fill
      if (!updated.includes("fill=")) {
        updated = updated.replace(">", ' fill="none">');
      }
      return updated;
    }
  );

  // Step 2: Detect and normalize fold lines
  // Look for red strokes or dashed patterns
  normalized = normalized.replace(
    /<(?:path|line)([^>]*(?:stroke="(?:#f00|red|#ff0000|#f44)"|stroke-dasharray)[^>]*)>/gi,
    (match) => {
      let updated = match;
      // Set stroke color
      updated = updated.replace(/stroke="[^"]*"/, `stroke="${MADISON_DIELINE_COLORS.FOLD_LINE.stroke}"`);
      // Set stroke width
      if (!updated.includes("stroke-width")) {
        updated = updated.replace(">", ` stroke-width="${MADISON_DIELINE_COLORS.FOLD_LINE.strokeWidth}">`);
      } else {
        updated = updated.replace(/stroke-width="[^"]*"/, `stroke-width="${MADISON_DIELINE_COLORS.FOLD_LINE.strokeWidth}"`);
      }
      // Set dash pattern
      if (!updated.includes("stroke-dasharray")) {
        updated = updated.replace(">", ` stroke-dasharray="${MADISON_DIELINE_COLORS.FOLD_LINE.strokeDasharray}">`);
      } else {
        updated = updated.replace(/stroke-dasharray="[^"]*"/, `stroke-dasharray="${MADISON_DIELINE_COLORS.FOLD_LINE.strokeDasharray}"`);
      }
      // Ensure no fill
      if (!updated.includes("fill=")) {
        updated = updated.replace(">", ' fill="none">');
      }
      return updated;
    }
  );

  // Step 3: Normalize text labels
  normalized = normalized.replace(
    /<text([^>]*)>/gi,
    (match) => {
      let updated = match;
      if (!updated.includes("fill=")) {
        updated = updated.replace(">", ` fill="${MADISON_DIELINE_COLORS.TEXT_LABEL.fill}">`);
      } else {
        updated = updated.replace(/fill="[^"]*"/, `fill="${MADISON_DIELINE_COLORS.TEXT_LABEL.fill}"`);
      }
      if (!updated.includes("font-family=")) {
        updated = updated.replace(">", ` font-family="${MADISON_DIELINE_COLORS.TEXT_LABEL.fontFamily}">`);
      }
      return updated;
    }
  );

  // Step 4: Add Madison styling to the SVG
  const styleTag = `
  <defs>
    <style>
      /* Madison Studio Dieline Standards */
      .madison-cut { stroke: ${MADISON_DIELINE_COLORS.CUT_LINE.stroke}; stroke-width: ${MADISON_DIELINE_COLORS.CUT_LINE.strokeWidth}; fill: none; }
      .madison-fold { stroke: ${MADISON_DIELINE_COLORS.FOLD_LINE.stroke}; stroke-width: ${MADISON_DIELINE_COLORS.FOLD_LINE.strokeWidth}; stroke-dasharray: ${MADISON_DIELINE_COLORS.FOLD_LINE.strokeDasharray}; fill: none; }
      .madison-bleed { stroke: ${MADISON_DIELINE_COLORS.BLEED_ZONE.stroke}; stroke-width: ${MADISON_DIELINE_COLORS.BLEED_ZONE.strokeWidth}; fill: ${MADISON_DIELINE_COLORS.BLEED_ZONE.fill}; }
      .madison-safe { stroke: ${MADISON_DIELINE_COLORS.SAFE_ZONE.stroke}; stroke-width: ${MADISON_DIELINE_COLORS.SAFE_ZONE.strokeWidth}; stroke-dasharray: ${MADISON_DIELINE_COLORS.SAFE_ZONE.strokeDasharray}; fill: ${MADISON_DIELINE_COLORS.SAFE_ZONE.fill}; }
      .madison-label { fill: ${MADISON_DIELINE_COLORS.TEXT_LABEL.fill}; font-family: ${MADISON_DIELINE_COLORS.TEXT_LABEL.fontFamily}; font-size: ${MADISON_DIELINE_COLORS.TEXT_LABEL.fontSize}px; }
    </style>
  </defs>`;

  // Insert style tag after opening <svg>
  if (!normalized.includes("madison-cut")) {
    normalized = normalized.replace(/(<svg[^>]*>)/, `$1${styleTag}`);
  }

  return normalized;
}

/**
 * Add Madison branding metadata to SVG
 */
export function addMadisonMetadata(svgContent: string, templateName: string): string {
  const metadata = `
  <!-- ═══════════════════════════════════════════════ -->
  <!-- Madison Studio Professional Dieline             -->
  <!-- Template: ${templateName}                        -->
  <!-- Color Standards:                                -->
  <!--   Cut Lines:  ${MADISON_DIELINE_COLORS.CUT_LINE.stroke} (solid)          -->
  <!--   Fold Lines: ${MADISON_DIELINE_COLORS.FOLD_LINE.stroke} (dashed)        -->
  <!-- ═══════════════════════════════════════════════ -->
  `;

  return svgContent.replace(/(<svg[^>]*>)/, `$1${metadata}`);
}

/**
 * Full pipeline: normalize colors + add metadata
 */
export function madisonizeTemplate(svgContent: string, templateName: string): string {
  let result = svgContent;
  result = normalizeDielineColors(result);
  result = addMadisonMetadata(result, templateName);
  return result;
}
