/**
 * POMELLI-STYLE VISUAL ANALYZER
 * 
 * Uses Gemini Flash for pixel-based brand analysis.
 * Extracts colors, typography style, and visual characteristics directly from screenshots.
 * 
 * Cost: ~$0.01 per scan
 */

import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.21.0";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface VisualAnalysis {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  colorPalette: string[];
  headlineFont: string;
  bodyFont: string;
  logoPosition: 'top-left' | 'center' | 'top-right';
  visualStyle: 'minimalist' | 'editorial' | 'lifestyle' | 'corporate' | 'playful';
  photographyStyle: 'studio' | 'natural_light' | 'lifestyle' | 'product_only' | 'illustration' | 'mixed';
  brandTone: 'clinical' | 'romantic' | 'playful' | 'sophisticated' | 'disruptive' | 'authentic';
  designElements: string[];
  spacingStyle: 'tight' | 'moderate' | 'generous';
  confidence: number;
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
    photography?: string;
    composition?: string;
    lighting?: string;
    colorGrading?: string;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN VISUAL ANALYSIS FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Analyzes a screenshot using Gemini Flash for brand visual extraction
 * 
 * @param screenshotBase64 - Base64 encoded screenshot image
 * @param mimeType - Image MIME type (default: image/png)
 * @returns Visual analysis results
 */
export async function analyzeScreenshot(
  screenshotBase64: string,
  mimeType: string = 'image/png'
): Promise<VisualAnalysis> {
  const apiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_API_KEY");
  
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY or GOOGLE_API_KEY environment variable");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const analysisPrompt = `You are a professional brand designer analyzing a website screenshot.

Extract the following brand identity elements and return ONLY valid JSON (no markdown, no backticks):

{
  "primaryColor": "exact hex code of the most dominant brand color (e.g., #FF5733)",
  "secondaryColor": "exact hex code of secondary brand color",
  "accentColor": "exact hex code used for CTAs or highlights",
  "colorPalette": ["array", "of", "all", "notable", "hex", "codes"],
  "headlineFont": "describe the headline font style: 'serif' or 'sans-serif' with descriptors like 'modern', 'elegant', 'bold'",
  "bodyFont": "describe the body font: 'serif' or 'sans-serif' with style notes",
  "logoPosition": "top-left" | "center" | "top-right",
  "visualStyle": "minimalist" | "editorial" | "lifestyle" | "corporate" | "playful",
  "photographyStyle": "studio" | "natural_light" | "lifestyle" | "product_only" | "illustration" | "mixed",
  "brandTone": "clinical" | "romantic" | "playful" | "sophisticated" | "disruptive" | "authentic",
  "designElements": ["list notable visual patterns like: gradient, shadows, rounded corners, flat design, etc"],
  "spacingStyle": "tight" | "moderate" | "generous",
  "confidence": 0.85
}

Rules:
- Be SPECIFIC with hex codes. Never write "blue", write "#0066FF"
- For fonts, describe what you see, don't guess font names
- Consider the overall aesthetic when determining tone
- Confidence should reflect how clear the brand identity is (0.0-1.0)
- If you cannot determine a value, make your best guess based on visual cues`;

  console.log(`[Visual Analyzer] Sending screenshot to Gemini Flash for analysis`);

  const result = await model.generateContent([
    analysisPrompt,
    {
      inlineData: {
        mimeType,
        data: screenshotBase64
      }
    }
  ]);

  const responseText = result.response.text();
  
  // Clean response (remove markdown fences if present)
  const cleanedResponse = responseText
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();
  
  try {
    const analysis = JSON.parse(cleanedResponse) as VisualAnalysis;
    console.log(`[Visual Analyzer] Analysis complete with confidence: ${analysis.confidence}`);
    return analysis;
  } catch (error) {
    console.error('[Visual Analyzer] Failed to parse Gemini response:', error);
    console.error('[Visual Analyzer] Raw response:', cleanedResponse);
    throw new Error('Failed to parse visual analysis response');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Maps AI font descriptions to Google Fonts
 */
export function inferGoogleFont(description: string, fallbackType: 'serif' | 'sans'): string {
  const lowerDesc = description.toLowerCase();
  
  // Serif fonts
  if (lowerDesc.includes('serif')) {
    if (lowerDesc.includes('elegant') || lowerDesc.includes('luxury')) {
      return 'Cormorant Garamond'; // Madison's default luxury serif
    }
    if (lowerDesc.includes('modern') || lowerDesc.includes('clean')) {
      return 'Playfair Display';
    }
    if (lowerDesc.includes('classic') || lowerDesc.includes('traditional')) {
      return 'Merriweather';
    }
    return 'Crimson Text'; // Default serif
  }
  
  // Sans-serif fonts
  if (lowerDesc.includes('sans')) {
    if (lowerDesc.includes('modern') || lowerDesc.includes('clean')) {
      return 'Lato'; // Madison's default sans
    }
    if (lowerDesc.includes('bold') || lowerDesc.includes('strong')) {
      return 'Montserrat';
    }
    if (lowerDesc.includes('rounded') || lowerDesc.includes('friendly')) {
      return 'Nunito';
    }
    return 'Inter'; // Default sans
  }
  
  // Fallback based on type
  return fallbackType === 'serif' ? 'Cormorant Garamond' : 'Lato';
}

/**
 * Infers composition style from visual style
 */
export function inferComposition(visualStyle: string): string {
  const styleMap: Record<string, string> = {
    'minimalist': 'centered',
    'editorial': 'rule_of_thirds',
    'lifestyle': 'asymmetric',
    'corporate': 'centered',
    'playful': 'asymmetric'
  };
  return styleMap[visualStyle] || 'centered';
}

/**
 * Infers lighting style from photography style
 */
export function inferLighting(photographyStyle: string): string {
  const lightingMap: Record<string, string> = {
    'studio': 'studio',
    'natural_light': 'natural',
    'lifestyle': 'natural',
    'product_only': 'flat',
    'illustration': 'flat',
    'mixed': 'natural'
  };
  return lightingMap[photographyStyle] || 'natural';
}

/**
 * Infers color grading from brand tone
 */
export function inferColorGrading(brandTone: string): string {
  const gradingMap: Record<string, string> = {
    'clinical': 'cool',
    'romantic': 'warm',
    'playful': 'vibrant',
    'sophisticated': 'muted',
    'disruptive': 'vibrant',
    'authentic': 'warm'
  };
  return gradingMap[brandTone] || 'neutral';
}

/**
 * Builds complete BrandVisual object from analysis
 */
export function buildBrandVisual(
  analysis: VisualAnalysis,
  logoUrl?: string,
  logoSource?: 'clearbit' | 'favicon' | 'manual' | 'scan'
): BrandVisual {
  return {
    logo: logoUrl ? {
      url: logoUrl,
      source: logoSource || 'scan',
      variants: {},
      safeZone: { minWidth: 120, clearSpace: 20 }
    } : undefined,
    colors: {
      primary: analysis.primaryColor,
      secondary: analysis.secondaryColor,
      accent: analysis.accentColor,
      palette: analysis.colorPalette,
      usage: {
        primary: "Headlines, CTAs, brand moments",
        secondary: "Backgrounds, subtle accents",
        accent: "Highlights, urgency indicators"
      }
    },
    typography: {
      headline: {
        family: inferGoogleFont(analysis.headlineFont, 'serif'),
        weights: [400, 600, 700],
        usage: "Headlines, hero text, emphasis"
      },
      body: {
        family: inferGoogleFont(analysis.bodyFont, 'sans'),
        weights: [400, 500],
        usage: "Body copy, descriptions, captions"
      },
      accent: {
        family: inferGoogleFont(analysis.headlineFont, 'serif'),
        weights: [400, 600],
        usage: "Callouts, quotes, special emphasis"
      }
    },
    visualStyle: {
      photography: analysis.photographyStyle,
      composition: inferComposition(analysis.visualStyle),
      lighting: inferLighting(analysis.photographyStyle),
      colorGrading: inferColorGrading(analysis.brandTone)
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOGO FETCHING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Attempts to fetch logo using multiple strategies
 */
export async function fetchLogoWithFallback(
  domain: string,
  fullUrl: string
): Promise<{ url: string; source: 'clearbit' | 'favicon' | 'manual' }> {
  
  // Strategy 1: Clearbit Logo API (free, high quality)
  const clearbitUrl = `https://logo.clearbit.com/${domain}`;
  
  try {
    const response = await fetch(clearbitUrl, { method: 'HEAD' });
    if (response.ok) {
      console.log(`[Logo Fetch] Found via Clearbit`);
      return { url: clearbitUrl, source: 'clearbit' };
    }
  } catch (error) {
    console.log(`[Logo Fetch] Clearbit failed, trying Google`);
  }

  // Strategy 2: Google Favicon Service
  const googleFaviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
  
  try {
    const response = await fetch(googleFaviconUrl, { method: 'HEAD' });
    if (response.ok) {
      console.log(`[Logo Fetch] Found via Google Favicon`);
      return { url: googleFaviconUrl, source: 'favicon' };
    }
  } catch (error) {
    console.log(`[Logo Fetch] Google failed, using fallback`);
  }

  // Strategy 3: Direct favicon.ico
  const baseUrl = fullUrl.replace(/\/$/, '');
  const directFavicon = `${baseUrl}/favicon.ico`;
  console.log(`[Logo Fetch] Using direct favicon`);
  return { url: directFavicon, source: 'favicon' };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCREENSHOT CAPTURE (via external service)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Captures a screenshot using a screenshot API service
 * Supports multiple providers for redundancy
 */
export async function captureScreenshot(url: string): Promise<string> {
  // Try Screenshot API (if configured)
  const screenshotApiKey = Deno.env.get("SCREENSHOT_API_KEY");
  
  if (screenshotApiKey) {
    try {
      const apiUrl = `https://shot.screenshotapi.net/screenshot?token=${screenshotApiKey}&url=${encodeURIComponent(url)}&width=1920&height=1080&output=base64`;
      const response = await fetch(apiUrl);
      
      if (response.ok) {
        const data = await response.json();
        if (data.screenshot) {
          console.log(`[Screenshot] Captured via ScreenshotAPI`);
          return data.screenshot;
        }
      }
    } catch (error) {
      console.log(`[Screenshot] ScreenshotAPI failed:`, error);
    }
  }

  // Fallback: html2canvas via proxy or user-provided screenshot
  throw new Error('Screenshot capture not available - please provide a screenshot manually or configure SCREENSHOT_API_KEY');
}




