/**
 * Madison Architecture - TypeScript Types
 * 
 * These types correspond to the database schema created in:
 * supabase/migrations/20251210000000_madison_architecture_schema.sql
 * 
 * Three Silos:
 *   Silo A: The Masters (Rules & Principles)
 *   Silo B: The Facts (Structured Data)
 *   Silo C: The Vibe (Semantic Examples)
 */

// ═══════════════════════════════════════════════════════════════════════════════
// SQUAD & AWARENESS TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type CopySquad = 'THE_SCIENTISTS' | 'THE_STORYTELLERS' | 'THE_DISRUPTORS';

export type VisualSquad = 'THE_MINIMALISTS' | 'THE_STORYTELLERS' | 'THE_DISRUPTORS';

export type AwarenessStage = 
  | 'unaware'
  | 'problem_aware'
  | 'solution_aware'
  | 'product_aware'
  | 'most_aware';

export type BrandTone = 
  | 'clinical'
  | 'romantic'
  | 'playful'
  | 'sophisticated'
  | 'disruptive'
  | 'authentic';

export type PhotographyStyle = 
  | 'studio'
  | 'natural_light'
  | 'lifestyle'
  | 'product_only'
  | 'mixed';

export type CompositionStyle = 
  | 'centered'
  | 'asymmetric'
  | 'rule_of_thirds';

export type LightingStyle = 
  | 'natural'
  | 'studio'
  | 'dramatic'
  | 'flat';

export type ColorGrading = 
  | 'warm'
  | 'cool'
  | 'muted'
  | 'vibrant'
  | 'monochrome';

// ═══════════════════════════════════════════════════════════════════════════════
// SILO A: THE MASTERS (Rules & Principles)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Copy Master (e.g., Ogilvy, Hopkins, Peterman)
 * Full markdown documents - NEVER chunked
 */
export interface MadisonMaster {
  id: string;
  master_name: string;
  squad: CopySquad;
  full_content: string;
  summary: string | null;
  forbidden_language: string[];
  example_output: string | null;
  metadata: MasterMetadata;
  created_at: string;
  updated_at: string;
}

export interface MasterMetadata {
  use_for?: string[];
  strength_areas?: string[];
  best_for_stages?: AwarenessStage[];
  avoid_for?: string[];
}

/**
 * Visual Master (e.g., Avedon, Leibovitz, Richardson)
 */
export interface VisualMaster {
  id: string;
  master_name: string;
  squad: VisualSquad;
  full_content: string;
  summary: string | null;
  example_images: string[];
  forbidden_styles: string[];
  prompt_template: string | null;
  composition_rules: CompositionRules;
  lighting_rules: LightingRules;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CompositionRules {
  background?: string;
  product_placement?: string;
  negative_space?: string;
  typography?: string;
}

export interface LightingRules {
  direction?: string;
  quality?: string;
  shadows?: string;
  color_temperature?: string;
}

/**
 * Schwartz Awareness Stage Template
 */
export interface SchwartzTemplate {
  id: string;
  stage: AwarenessStage;
  template_content: string;
  description: string | null;
  key_principles: string[];
  opening_strategies: string[];
  forbidden_approaches: string[];
  example_headlines: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SILO B: THE FACTS (Structured Data)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Brand DNA - The central hub for brand identity
 */
export interface BrandDNA {
  id: string;
  org_id: string;
  visual: BrandVisual;
  essence: BrandEssence;
  constraints: BrandConstraints;
  scan_method: 'url_scan' | 'document' | 'manual' | 'url_scan_enhanced';
  scan_metadata: ScanMetadata;
  created_at: string;
  updated_at: string;
}

export interface BrandVisual {
  logo?: {
    url?: string;
    source?: 'clearbit' | 'favicon' | 'manual' | 'scan';
    variants?: {
      light?: string;
      dark?: string;
      icon?: string;
    };
    safeZone?: {
      minWidth?: number;
      clearSpace?: number;
    };
  };
  colors?: {
    primary?: string;
    secondary?: string;
    accent?: string;
    palette?: string[];
    usage?: {
      primary?: string;
      secondary?: string;
      accent?: string;
    };
  };
  typography?: {
    headline?: {
      family?: string;
      weights?: number[];
      usage?: string;
    };
    body?: {
      family?: string;
      weights?: number[];
      usage?: string;
    };
    accent?: {
      family?: string;
      weights?: number[];
      usage?: string;
    };
  };
  visualStyle?: {
    photography?: PhotographyStyle;
    composition?: CompositionStyle;
    lighting?: LightingStyle;
    colorGrading?: ColorGrading;
  };
}

export interface BrandEssence {
  mission?: string;
  keywords?: string[];
  tone?: BrandTone;
  copySquad?: CopySquad | null;
  visualSquad?: VisualSquad | null;
  primaryCopyMaster?: string | null;
  primaryVisualMaster?: string | null;
  brandVoice?: {
    tone?: string[];
    style?: string;
    perspective?: string;
  };
}

export interface BrandConstraints {
  forbiddenWords?: string[];
  forbiddenStyles?: string[];
  voiceGuidelines?: string;
  logoUsageRules?: string;
  competitorNames?: string[];
}

export interface ScanMetadata {
  source_url?: string;
  scanned_at?: string;
  confidence?: number;
  document_name?: string;
  document_analyzed_at?: string;
  gemini_model?: string;
  claude_model?: string;
}

/**
 * Brand Product - Product catalog with specs
 */
export interface BrandProduct {
  id: string;
  org_id: string;
  product_id: string;
  name: string;
  specs: ProductSpecs;
  copy_hints: CopyHints;
  images: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ProductSpecs {
  price?: number;
  currency?: string;
  ingredients?: string[];
  dimensions?: {
    width?: number;
    height?: number;
    depth?: number;
  };
  weight?: string;
  sku?: string;
  category?: string;
  subcategory?: string;
  benefits?: string[];
  usageInstructions?: string;
  warnings?: string[];
}

export interface CopyHints {
  keySellingPoints?: string[];
  targetAudience?: string;
  painPointsAddressed?: string[];
  differentiators?: string[];
}

/**
 * Design System - Tailwind-compatible tokens
 */
export interface DesignSystem {
  id: string;
  org_id: string;
  tokens: DesignTokens;
  css_variables: string | null;
  tailwind_config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DesignTokens {
  colors?: {
    background?: string;
    foreground?: string;
    card?: string;
    primary?: string;
    secondary?: string;
    accent?: string;
    muted?: string;
    border?: string;
    destructive?: string;
    'card-foreground'?: string;
    'primary-foreground'?: string;
    'secondary-foreground'?: string;
    'accent-foreground'?: string;
    'muted-foreground'?: string;
    'destructive-foreground'?: string;
  };
  typography?: {
    fontFamily?: {
      serif?: string;
      sans?: string;
      mono?: string;
    };
    fontSize?: Record<string, [string, { lineHeight: string }]>;
    fontWeight?: Record<string, number>;
  };
  spacing?: Record<string, string>;
  borderRadius?: {
    lg?: string;
    md?: string;
    sm?: string;
  };
  shadows?: {
    'level-1'?: string;
    'level-2'?: string;
    'level-3'?: string;
    'level-4'?: string;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SILO C: THE VIBE (Semantic Examples)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Brand Writing Example - Approved copy samples with embeddings
 */
export interface BrandWritingExample {
  id: string;
  org_id: string;
  content: string;
  embedding?: number[]; // Vector(1536) - OpenAI text-embedding-3-small
  source: 'uploaded_pdf' | 'manual_entry' | 'generated_and_approved' | 'website_scan';
  channel?: string;
  content_type?: string;
  tone_tags: string[];
  metadata: WritingExampleMetadata;
  created_at: string;
}

export interface WritingExampleMetadata {
  document_name?: string;
  extracted_at?: string;
  performance?: {
    clicks?: number;
    conversions?: number;
    engagement?: number;
  };
  approved_by?: string;
  notes?: string;
}

/**
 * Brand Visual Example - Approved images with CLIP embeddings
 */
export interface BrandVisualExample {
  id: string;
  org_id: string;
  image_url: string;
  image_embedding?: number[]; // Vector(512) - CLIP
  style_tags: string[];
  squad_used?: string;
  master_used?: string;
  metadata: VisualExampleMetadata;
  created_at: string;
}

export interface VisualExampleMetadata {
  channel?: string;
  performance?: {
    impressions?: number;
    engagement?: number;
    clicks?: number;
  };
  source?: 'uploaded' | 'generated_and_approved';
  prompt_used?: string;
  approved_by?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// OUTPUT TRACKING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generated Content - Track what Madison creates
 */
export interface GeneratedContent {
  id: string;
  org_id: string;
  content_type: 'copy' | 'image' | 'composite' | 'email' | 'ad';
  content?: string;
  image_url?: string;
  strategy_used?: StrategyJSON;
  context_used: ContextUsed;
  user_brief?: string;
  channel?: string;
  performance: PerformanceMetrics;
  approved: boolean;
  feedback?: string;
  pipeline_duration_ms?: number;
  created_at: string;
}

export interface ContextUsed {
  masterDocuments?: string[];
  productId?: string;
  writingExamplesCount?: number;
  visualExamplesCount?: number;
}

export interface PerformanceMetrics {
  clicks?: number;
  conversions?: number;
  impressions?: number;
  engagement?: number;
  rating?: number; // User rating 1-5
}

// ═══════════════════════════════════════════════════════════════════════════════
// PIPELINE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Router Agent Input
 */
export interface RouterInput {
  userBrief: string;
  orgId: string;
  productId?: string;
  channel?: string;
}

/**
 * Strategy JSON - Output from Router Agent
 */
export interface StrategyJSON {
  // Squad Assignments
  copySquad: CopySquad;
  visualSquad: VisualSquad;
  
  // Master Selection
  primaryCopyMaster: string;
  secondaryCopyMaster?: string;
  primaryVisualMaster: string;
  
  // Negative Constraints (CRITICAL)
  forbiddenCopySquads: CopySquad[];
  forbiddenLanguage: string[];
  forbiddenVisualSquads: VisualSquad[];
  forbiddenStyles: string[];
  
  // Framework
  schwartzStage: AwarenessStage;
  
  // Product Context
  productId?: string;
  
  // Reasoning (for debugging)
  reasoning: string;
}

/**
 * Context Package - Output from Assembler Agent
 */
export interface ContextPackage {
  // From Silo A (full documents)
  masterDocuments: string[];
  schwartzTemplate: string;
  
  // From Silo B (structured data)
  productData: ProductSpecs | null;
  brandDNA: BrandDNA;
  designTokens: DesignTokens;

  // Industry configuration
  industryConfig?: {
    id: string;
    subIndustry?: string;
  };

  // Brand Knowledge (from uploaded documents)
  brandKnowledge?: {
    voice?: any;
    vocabulary?: any;
    brandIdentity?: any;
    examples?: any;
    structure?: any;
  };
  
  // From Silo C (semantic search)
  writingExamples: BrandWritingExample[];
  visualExamples: BrandVisualExample[];
}

/**
 * Pipeline Output
 */
export interface PipelineOutput {
  content: string;
  imageUrl?: string;
  strategy: StrategyJSON;
  metadata: {
    duration: number;
    copySquad: CopySquad;
    visualSquad: VisualSquad;
    schwartzStage: AwarenessStage;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// UI TYPES (for Brand Quick View Panel)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Brand Quick View - Simplified brand DNA for UI display
 */
export interface BrandQuickView {
  logoUrl?: string;
  brandName?: string;
  colors: {
    primary?: string;
    secondary?: string;
    accent?: string;
    palette?: string[];
  };
  typography: {
    headline?: string;
    body?: string;
  };
  tone?: BrandTone;
  /** Industry label from Brand Studio when no brand_dna scan exists. */
  industryLabel?: string;
  copySquad?: CopySquad | null;
  visualSquad?: VisualSquad | null;
  mission?: string;
  keywords?: string[];
  scanConfidence?: number;
  lastScanned?: string;
}












