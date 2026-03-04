/**
 * Geometry Analyzer
 *
 * Uses DieCutTemplates API to analyze professional dielines and extract
 * the geometric formulas. We then use these formulas to build our own
 * parametric generators.
 *
 * Strategy: API as Teacher, Not Dependency
 */

import { generateDieline, searchTemplates } from "../diecuttemplates-api";

export interface GeometryAnalysis {
  template_id: string;
  template_name: string;
  input_dimensions: Record<string, number>;
  extracted_panels: ExtractedPanel[];
  formulas: GeometricFormula[];
}

export interface ExtractedPanel {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  relationship_to_dimensions: string; // e.g., "width = input.width", "height = input.height"
}

export interface GeometricFormula {
  panel_dimension: string; // e.g., "front_panel.width"
  formula: string; // e.g., "box_width + (2 * material_thickness)"
  description: string;
}

/**
 * Analyze a dieline template to extract geometric relationships
 *
 * This function:
 * 1. Calls the API with sample dimensions
 * 2. Parses the returned SVG
 * 3. Identifies panel positions and sizes
 * 4. Calculates relationships between input dimensions and output geometry
 */
export async function analyzeTemplate(
  templateId: string,
  sampleDimensions: Record<string, number>
): Promise<GeometryAnalysis> {
  console.log(`[Analyzer] Analyzing template ${templateId} with dimensions:`, sampleDimensions);

  // Generate dieline from API
  const result = await generateDieline({
    template_id: templateId,
    variables: sampleDimensions,
    format: "svg",
    include_bleed: true,
    bleed_mm: 3,
  });

  // Parse SVG to extract panels
  const svgText = result.file_base64
    ? atob(result.file_base64)
    : await fetch(result.file_url).then((r) => r.text());

  const panels = parseSVGPanels(svgText);

  // Analyze geometric relationships
  const formulas = deriveFormulas(panels, sampleDimensions);

  return {
    template_id: templateId,
    template_name: "Tuck-End Box", // Would get from template metadata
    input_dimensions: sampleDimensions,
    extracted_panels: panels,
    formulas,
  };
}

/**
 * Parse SVG to extract panel definitions
 */
function parseSVGPanels(svgText: string): ExtractedPanel[] {
  const panels: ExtractedPanel[] = [];

  // Parse SVG using DOMParser
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, "image/svg+xml");

  // Find all path elements (these are the panels)
  const paths = doc.querySelectorAll("path, rect");

  paths.forEach((element, index) => {
    const bounds = extractBounds(element);

    if (bounds) {
      panels.push({
        id: element.getAttribute("id") || `panel-${index}`,
        type: element.getAttribute("data-type") || guessType(bounds),
        ...bounds,
        relationship_to_dimensions: "",
      });
    }
  });

  return panels;
}

/**
 * Extract bounding box from SVG element
 */
function extractBounds(element: Element): { x: number; y: number; width: number; height: number } | null {
  if (element.tagName === "rect") {
    return {
      x: parseFloat(element.getAttribute("x") || "0"),
      y: parseFloat(element.getAttribute("y") || "0"),
      width: parseFloat(element.getAttribute("width") || "0"),
      height: parseFloat(element.getAttribute("height") || "0"),
    };
  }

  if (element.tagName === "path") {
    const d = element.getAttribute("d");
    if (!d) return null;

    // Parse path to get bounding box (simplified)
    const coords = extractPathCoordinates(d);
    if (coords.length === 0) return null;

    const xs = coords.map((c) => c.x);
    const ys = coords.map((c) => c.y);

    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    };
  }

  return null;
}

/**
 * Extract coordinates from SVG path
 */
function extractPathCoordinates(pathData: string): { x: number; y: number }[] {
  const coords: { x: number; y: number }[] = [];

  // Match all M, L, H, V commands with their coordinates
  const commandRegex = /([MLHVZmlhvz])\s*([-\d.]+)?\s*([-\d.]+)?/g;
  let match;
  let currentX = 0;
  let currentY = 0;

  while ((match = commandRegex.exec(pathData)) !== null) {
    const [, command, x, y] = match;

    switch (command.toUpperCase()) {
      case "M":
      case "L":
        currentX = parseFloat(x);
        currentY = parseFloat(y);
        coords.push({ x: currentX, y: currentY });
        break;
      case "H":
        currentX = parseFloat(x);
        coords.push({ x: currentX, y: currentY });
        break;
      case "V":
        currentY = parseFloat(x); // x parameter contains y value for V
        coords.push({ x: currentX, y: currentY });
        break;
    }
  }

  return coords;
}

/**
 * Guess panel type based on dimensions and position
 */
function guessType(bounds: { width: number; height: number }): string {
  const aspectRatio = bounds.width / bounds.height;

  if (aspectRatio > 2) return "flap";
  if (aspectRatio < 0.5) return "flap";
  if (bounds.width < 20) return "glue_tab";

  return "panel";
}

/**
 * Derive geometric formulas by comparing panel dimensions to input dimensions
 */
function deriveFormulas(
  panels: ExtractedPanel[],
  inputDimensions: Record<string, number>
): GeometricFormula[] {
  const formulas: GeometricFormula[] = [];

  // Find the main panels (largest by area)
  const sortedPanels = [...panels].sort((a, b) => b.width * b.height - a.width * a.height);

  const mainPanel = sortedPanels[0];

  if (mainPanel) {
    // Try to match panel dimensions to input dimensions
    Object.entries(inputDimensions).forEach(([key, value]) => {
      if (Math.abs(mainPanel.width - value) < 1) {
        formulas.push({
          panel_dimension: `${mainPanel.id}.width`,
          formula: `input.${key}`,
          description: `Panel width equals input ${key}`,
        });
      }

      if (Math.abs(mainPanel.height - value) < 1) {
        formulas.push({
          panel_dimension: `${mainPanel.id}.height`,
          formula: `input.${key}`,
          description: `Panel height equals input ${key}`,
        });
      }
    });
  }

  return formulas;
}

/**
 * Learn geometry from API by analyzing multiple box sizes
 *
 * This generates dielines with different dimensions and compares
 * the results to extract the underlying geometric rules.
 */
export async function learnGeometryFromAPI(templateId: string): Promise<GeometricFormula[]> {
  const testCases = [
    { width: 50, height: 100, depth: 30 },
    { width: 60, height: 120, depth: 40 },
    { width: 40, height: 80, depth: 25 },
  ];

  const analyses: GeometryAnalysis[] = [];

  for (const dims of testCases) {
    try {
      const analysis = await analyzeTemplate(templateId, dims);
      analyses.push(analysis);
    } catch (error) {
      console.error(`Failed to analyze dimensions ${JSON.stringify(dims)}:`, error);
    }
  }

  // Compare analyses to find consistent formulas
  return compareAnalyses(analyses);
}

/**
 * Compare multiple analyses to find consistent geometric rules
 */
function compareAnalyses(analyses: GeometryAnalysis[]): GeometricFormula[] {
  const consistentFormulas: GeometricFormula[] = [];

  // This would contain logic to compare the analyses and extract
  // formulas that hold true across all test cases

  // For now, return the formulas from the first analysis
  if (analyses.length > 0) {
    return analyses[0].formulas;
  }

  return consistentFormulas;
}

/**
 * Generate TypeScript code for a parametric generator based on learned geometry
 */
export function generateGeneratorCode(analysis: GeometryAnalysis): string {
  const { template_name, formulas } = analysis;

  return `
/**
 * ${template_name} Parametric Generator
 *
 * Auto-generated from DieCutTemplates API analysis
 * Based on geometric formulas extracted from professional dielines
 */

export function generate${template_name.replace(/\s+/g, "")}(
  width: number,
  height: number,
  depth: number
): string {
  // Formulas learned from API:
  ${formulas.map((f) => `// ${f.description}: ${f.formula}`).join("\n  ")}

  // Generate SVG based on formulas...
  return \`<svg>...</svg>\`;
}
`;
}
