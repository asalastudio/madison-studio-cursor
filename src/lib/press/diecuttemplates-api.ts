/**
 * DieCutTemplates.com API Client
 *
 * Provides access to 35,000+ professional packaging dieline templates.
 * API Docs: https://www.diecuttemplates.com/dielines-api
 */

const API_BASE_URL = "https://www.diecuttemplates.com/api/v1";
const API_KEY = import.meta.env.VITE_DIECUTTEMPLATE_API_KEY;

export interface DielineTemplate {
  id: string;
  name: string;
  category: string;
  group: string;
  type: string;
  variables: DielineVariable[];
  thumbnail_url?: string;
}

export interface DielineVariable {
  name: string;
  label: string;
  required: boolean;
  default_value?: number;
  min_value?: number;
  max_value?: number;
  unit: string;
}

export interface GenerateDielineRequest {
  template_id: string;
  variables: Record<string, number>;
  format: "svg" | "pdf" | "dxf";
  include_bleed?: boolean;
  bleed_mm?: number;
}

export interface GenerateDielineResponse {
  success: boolean;
  file_url: string;
  file_base64?: string;
  dimensions: {
    width_mm: number;
    height_mm: number;
  };
}

/**
 * Search for dieline templates by category, name, or type
 */
export async function searchTemplates(query: {
  category?: string;
  search?: string;
  limit?: number;
}): Promise<DielineTemplate[]> {
  const params = new URLSearchParams({
    api_key: API_KEY,
    ...(query.category && { category: query.category }),
    ...(query.search && { search: query.search }),
    limit: String(query.limit || 50),
  });

  const response = await fetch(`${API_BASE_URL}/templates?${params}`);

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.templates || [];
}

/**
 * Get detailed information about a specific template
 */
export async function getTemplate(templateId: string): Promise<DielineTemplate> {
  const params = new URLSearchParams({
    api_key: API_KEY,
  });

  const response = await fetch(`${API_BASE_URL}/templates/${templateId}?${params}`);

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.template;
}

/**
 * Generate a dieline with specified dimensions
 */
export async function generateDieline(
  request: GenerateDielineRequest
): Promise<GenerateDielineResponse> {
  const response = await fetch(`${API_BASE_URL}/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      api_key: API_KEY,
      ...request,
    }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data;
}

/**
 * Get list of available categories
 */
export async function getCategories(): Promise<string[]> {
  const params = new URLSearchParams({
    api_key: API_KEY,
  });

  const response = await fetch(`${API_BASE_URL}/categories?${params}`);

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.categories || [];
}

/**
 * Helper: Get recommended templates for fragrance/perfume packaging
 */
export async function getFragranceTemplates(): Promise<DielineTemplate[]> {
  const categories = [
    "tuck-end-boxes",
    "straight-tuck-boxes",
    "reverse-tuck-boxes",
    "sleeve-boxes",
  ];

  const allTemplates: DielineTemplate[] = [];

  for (const category of categories) {
    try {
      const templates = await searchTemplates({ category, limit: 10 });
      allTemplates.push(...templates);
    } catch (error) {
      console.error(`Error fetching ${category}:`, error);
    }
  }

  return allTemplates;
}
