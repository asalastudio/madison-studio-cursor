/**
 * Brand Profile Inference
 * 
 * Uses LLM to infer brand profile from extracted site copy.
 * Outputs structured BrandProfile data.
 */

import { generateGeminiContent, extractTextFromGeminiResponse } from './geminiClient.ts';

export interface BrandProfileInferenceInput {
  siteCopy: {
    homepage: { text: string; headings: string[]; metaDescription?: string; title?: string };
    aboutPage?: { text: string; headings: string[] };
    productPage?: { text: string; headings: string[] };
    allText: string;
  };
  domain: string;
  url: string;
}

export interface BrandProfile {
  brandName?: string;
  tagline?: string;
  positioning?: string;
  primaryAudience?: string[];
  toneTraits?: string[];
  visualKeywords?: string[];
  archetype?: string;
  mission?: string;
  values?: string[];
  essence?: string;
}

/**
 * Infer brand profile from site copy using LLM
 */
export async function inferBrandProfile(input: BrandProfileInferenceInput): Promise<BrandProfile> {
  const { siteCopy, domain, url } = input;
  
  console.log(`[brandProfile] Inferring brand profile for ${domain}`);
  
  const prompt = `You are a brand strategist analyzing a website to extract brand identity and positioning.

WEBSITE: ${domain}
URL: ${url}

EXTRACTED CONTENT:
${siteCopy.allText.substring(0, 12000)}

Analyze this website content and extract the brand profile. Return ONLY valid JSON with this exact structure:

{
  "brandName": "Official brand name (if clearly stated, otherwise infer from domain/context)",
  "tagline": "Brand tagline or slogan if present, otherwise null",
  "positioning": "1-2 sentence positioning statement describing how the brand positions itself in the market",
  "primaryAudience": ["audience segment 1", "audience segment 2", "audience segment 3"],
  "toneTraits": ["trait1", "trait2", "trait3", "trait4", "trait5"],
  "visualKeywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "archetype": "Brand archetype (e.g., 'The Hero', 'The Sage', 'The Explorer', 'The Creator', 'The Innocent', 'The Ruler', 'The Magician', 'The Outlaw', 'The Lover', 'The Caregiver', 'The Jester', 'The Everyman')",
  "mission": "1-2 sentence mission statement if present, otherwise null",
  "values": ["value1", "value2", "value3"],
  "essence": "3-5 keywords that capture the brand essence (comma-separated)"
}

GUIDELINES:
- Extract actual information from the content, don't make things up
- If information is not present, use null for optional fields or reasonable inferences
- For toneTraits, identify 3-5 adjectives that describe the brand's voice (e.g., "professional", "playful", "authoritative", "warm")
- For visualKeywords, identify visual style descriptors (e.g., "minimal", "tech", "luxury", "earthy", "playful", "sophisticated")
- For archetype, choose the most fitting brand archetype based on the content
- Be specific and accurate based on what's actually written

Return ONLY the JSON object, no markdown, no explanations.`;

  try {
    const aiData = await generateGeminiContent({
      systemPrompt: `You are a brand strategist expert at analyzing websites and extracting brand identity, positioning, and voice from content.`,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      responseMimeType: 'application/json',
      temperature: 0.3, // Lower temperature for more consistent, factual extraction
      maxOutputTokens: 8192,
    });
    
    const responseText = extractTextFromGeminiResponse(aiData);
    
    // Parse JSON response
    let brandProfile: BrandReport['brandProfile'];
    try {
      const cleanedText = responseText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      
      brandProfile = JSON.parse(cleanedText);
      
      // Validate and normalize
      brandProfile = {
        brandName: brandProfile.brandName || domain.split('.')[0],
        tagline: brandProfile.tagline || undefined,
        positioning: brandProfile.positioning || undefined,
        primaryAudience: Array.isArray(brandProfile.primaryAudience) ? brandProfile.primaryAudience : [],
        toneTraits: Array.isArray(brandProfile.toneTraits) ? brandProfile.toneTraits : [],
        visualKeywords: Array.isArray(brandProfile.visualKeywords) ? brandProfile.visualKeywords : [],
        archetype: brandProfile.archetype || undefined,
        mission: brandProfile.mission || undefined,
        values: Array.isArray(brandProfile.values) ? brandProfile.values : [],
        essence: brandProfile.essence || undefined,
      };
      
      console.log(`[brandProfile] ✅ Successfully inferred brand profile`);
      return brandProfile;
    } catch (parseError) {
      console.error('[brandProfile] Failed to parse AI response:', parseError);
      console.error('[brandProfile] Response text:', responseText.substring(0, 500));
      throw new Error('Failed to parse brand profile from AI response');
    }
  } catch (error) {
    console.error('[brandProfile] Error inferring brand profile:', error);
    throw new Error(`Brand profile inference failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

